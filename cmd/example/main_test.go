package main

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	sdk "github.com/ByteDeskAI/bytedesk-remote-gateway-plugin-sdk"
)

// This runs the built template as a separate executable without Gateway source.
// The fixture supplies only the published host protocol; it is not live host
// containment, Store installation or end-to-end Gateway acceptance evidence.
func TestIndependentProcessAdmissionAndWithdrawal(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix process transport")
	}
	dir, err := os.MkdirTemp("", "ep018-template-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dir)
	binary := filepath.Join(dir, "example")
	build := exec.Command("go", "build", "-o", binary, ".")
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build: %v: %s", err, out)
	}
	for _, tc := range []struct {
		name     string
		allowed  bool
		features []string
		admitted bool
	}{
		{name: "denied"},
		{name: "missing-ui-contract", allowed: true, features: []string{sdk.FeatureScopedHost, sdk.FeatureActivationCheck}},
		{name: "admitted", allowed: true, admitted: true, features: []string{sdk.FeatureScopedHost, sdk.FeatureActivationCheck, sdk.FeatureDocumentPaths, sdk.FeatureUIModuleMount}},
	} {
		name := tc.name
		t.Run(name, func(t *testing.T) {
			hostSock := filepath.Join(dir, name+"-host.sock")
			pluginSock := filepath.Join(dir, name+"-plugin.sock")
			ln, err := net.Listen("unix", hostSock)
			if err != nil {
				t.Fatal(err)
			}
			srv := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/negotiate":
					if !tc.allowed {
						http.Error(w, "policy denied", http.StatusForbidden)
						return
					}
					_ = json.NewEncoder(w).Encode(sdk.HostCapabilities{Major: 1, PluginID: "example", Generation: "fixture-generation", Features: tc.features})
				case "/callbacks":
					w.WriteHeader(http.StatusOK)
					w.(http.Flusher).Flush()
					<-r.Context().Done()
				default:
					w.WriteHeader(http.StatusNoContent)
				}
			})}
			go func() { _ = srv.Serve(ln) }()
			defer srv.Close()
			cmd := exec.Command(binary)
			for _, value := range os.Environ() {
				if !strings.HasPrefix(value, sdk.EnvID+"=") && !strings.HasPrefix(value, sdk.EnvSocket+"=") && !strings.HasPrefix(value, sdk.EnvHostSocket+"=") {
					cmd.Env = append(cmd.Env, value)
				}
			}
			cmd.Env = append(cmd.Env, sdk.EnvID+"=example", sdk.EnvSocket+"="+pluginSock, sdk.EnvHostSocket+"="+hostSock)
			if err := cmd.Start(); err != nil {
				t.Fatal(err)
			}
			done := make(chan error, 1)
			go func() { done <- cmd.Wait() }()
			t.Cleanup(func() { _ = cmd.Process.Kill() })
			if !tc.admitted {
				select {
				case err := <-done:
					if err == nil {
						t.Fatal("denied process succeeded")
					}
				case <-time.After(5 * time.Second):
					t.Fatal("denied process did not exit")
				}
				if _, err := os.Stat(pluginSock); !os.IsNotExist(err) {
					t.Fatal("denied candidate opened a socket")
				}
				return
			}
			tr := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				return (&net.Dialer{}).DialContext(ctx, "unix", pluginSock)
			}}
			defer tr.CloseIdleConnections()
			client := &http.Client{Transport: tr, Timeout: time.Second}
			deadline := time.Now().Add(5 * time.Second)
			served := false
			for time.Now().Before(deadline) {
				resp, err := client.Get("http://plugin/example/hello")
				if err == nil {
					body, _ := io.ReadAll(resp.Body)
					_ = resp.Body.Close()
					if resp.StatusCode != 200 || string(body) != "ok" {
						t.Fatalf("unexpected response %d %q", resp.StatusCode, body)
					}
					served = true
					break
				}
				select {
				case err := <-done:
					t.Fatalf("process exited before serving: %v", err)
				default:
				}
				time.Sleep(20 * time.Millisecond)
			}
			if !served {
				t.Fatal("admitted process did not serve declared route")
			}
			if err := cmd.Process.Signal(os.Interrupt); err != nil {
				t.Fatal(err)
			}
			select {
			case err := <-done:
				if err != nil {
					t.Fatalf("graceful exit: %v", err)
				}
			case <-time.After(5 * time.Second):
				t.Fatal("process did not stop")
			}
			conn, err := net.DialTimeout("unix", pluginSock, 100*time.Millisecond)
			if err == nil {
				_ = conn.Close()
				t.Fatal("withdrawn process still accepting requests")
			}
		})
	}
}
