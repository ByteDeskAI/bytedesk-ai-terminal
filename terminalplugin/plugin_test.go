package terminalplugin

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"os/exec"
	"reflect"
	"strings"
	"testing"

	pluginsdk "github.com/ByteDeskAI/bytedesk-remote-gateway-plugin-sdk/v2"
	"github.com/ByteDeskAI/bytedesk-sdk-dependencies/v2/plugin"
)

func TestManifestAndVersion(t *testing.T) {
	raw, err := os.ReadFile("../plugin.json")
	if err != nil {
		t.Fatal(err)
	}
	var manifest pluginsdk.Manifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(manifest, New().Manifest()) {
		t.Fatal("regenerate plugin.json with go run ./cmd/manifest -out plugin.json")
	}
	if err := plugin.Validate(manifest); err != nil {
		t.Fatal(err)
	}
	version, err := os.ReadFile("../VERSION")
	if err != nil || strings.TrimSpace(string(version)) != Version {
		t.Fatal("VERSION differs from Go manifest")
	}
	if len(manifest.Serves) != 0 || len(manifest.Permissions.Publish) != 0 {
		t.Fatal("terminal must not serve provider commands or publish authority")
	}
	if !reflect.DeepEqual(manifest.Capabilities, []string{pluginsdk.CapabilityProcessSupervised}) {
		t.Fatal("coding execution must request explicit supervised-process consent")
	}
	for _, request := range manifest.Permissions.Request {
		if strings.Contains(string(request), "*") || strings.Contains(string(request), ">") {
			t.Fatal("broad command permission")
		}
		if !strings.HasPrefix(string(request), "cmd.gateway.coding-sessions.v1.") && !strings.HasPrefix(string(request), "cmd.gateway.payloads.v1.") {
			t.Fatalf("unexpected authority: %s", request)
		}
	}
}
func TestAssetsAndWithdrawal(t *testing.T) {
	p := New()
	if err := p.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := p.CheckActivation(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, target := range []string{"panel.mjs", "controller.mjs", "api.mjs", "view.mjs", "panel.css", "contracts/codingsessions/descriptors.js", "contracts/payloads/validators.js"} {
		response := httptest.NewRecorder()
		p.Handler().ServeHTTP(response, httptest.NewRequest("GET", "/ai-terminal/assets/"+target, nil))
		if response.Code != 200 || response.Body.Len() == 0 {
			t.Fatalf("missing asset %s: %d", target, response.Code)
		}
	}
	for _, target := range []string{"../go.mod", "contracts/payloads/contracts.d.ts", "missing.js"} {
		response := httptest.NewRecorder()
		p.Handler().ServeHTTP(response, httptest.NewRequest("GET", "/ai-terminal/assets/"+target, nil))
		if response.Code != 404 {
			t.Fatalf("exposed non-asset %s", target)
		}
	}
	response := httptest.NewRecorder()
	p.Handler().ServeHTTP(response, httptest.NewRequest("POST", "/ai-terminal/assets/panel.mjs", nil))
	if response.Code != 405 {
		t.Fatal("unexpected mutation route")
	}
	_ = p.Stop(context.Background())
	response = httptest.NewRecorder()
	p.Handler().ServeHTTP(response, httptest.NewRequest("GET", "/ai-terminal/assets/panel.mjs", nil))
	if response.Code != 503 || p.CheckActivation(context.Background()) == nil {
		t.Fatal("withdrawn plugin remains available")
	}
}
func TestCanonicalBrowserArtifacts(t *testing.T) {
	command := exec.Command("go", "run", "./cmd/sync-contracts", "-check")
	command.Dir = ".."
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("%v: %s", err, output)
	}
}
