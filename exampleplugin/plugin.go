// Package example implements a plugin independently of the gateway host.
package example

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	pluginsdk "github.com/ByteDeskAI/bytedesk-remote-gateway-plugin-sdk/v2"
	"github.com/ByteDeskAI/bytedesk-remote-gateway-plugin-template/contracts"
	commonplugin "github.com/ByteDeskAI/bytedesk-sdk-dependencies/v2/plugin"
)

const Version = "0.3.0-rc.1"

//go:embed panel.mjs
var panelModule []byte

type Plugin struct {
	pluginsdk.Base
	active  atomic.Bool
	mu      sync.Mutex
	service pluginsdk.Service
}

func New() *Plugin         { return &Plugin{} }
func (*Plugin) ID() string { return "example" }
func (p *Plugin) Manifest() pluginsdk.Manifest {
	return pluginsdk.Manifest{
		Contract: pluginsdk.ProtocolMajor, Kind: pluginsdk.KindProcess,
		ID: p.ID(), Version: Version,
		Identity:  &pluginsdk.ManifestIdentity{DisplayName: "Example plugin", Description: "Reference plugin for typed events, key/value state, services, and an HTTP panel."},
		Publisher: &pluginsdk.Publisher{ID: "bytedesk", Name: "ByteDesk"},
		Targets:   []string{pluginsdk.TargetGateway}, Role: pluginsdk.RoleExtension,
		Binary: "example", Socket: "plugin.sock",
		Routes: []string{"/example/"}, Scopes: []string{"plugin:example"},
		Nav:      []commonplugin.NavItem{{ID: "example", Label: "Example plugin", Href: "/plugins/example", Order: 90}},
		Panels:   []commonplugin.PanelSpec{{ID: "example", Kind: "example", URL: "/example/ui", Module: "/example/panel.mjs", DocumentPaths: []string{"/example", "/example/view/:item"}}},
		Protocol: &pluginsdk.ProtocolRequirements{Major: pluginsdk.ProtocolMajor, Required: []string{pluginsdk.FeatureHTTPRoutes, commonplugin.FeatureDocumentPaths}, Hooks: []string{"activation.check"}},
		Serves:   []pluginsdk.ServiceDecl{{Name: contracts.Hello.Descriptor().Name(), Version: "1.0.0", Endpoints: []pluginsdk.EndpointDecl{{Name: "hello", Subject: contracts.Hello.Descriptor().Subject()}}}},
		KV:       []pluginsdk.KVDecl{{Name: contracts.Runtime.Descriptor().Name(), MaxBytes: 64 * 1024, History: 5}},
		Needs:    []string{"services"},
	}
}
func (p *Plugin) Start(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	startedAt := time.Now().UTC().Format(time.RFC3339Nano)
	if p.Bus().Capabilities().KV {
		bucket, err := commonplugin.OpenBucket(ctx, p.Bus(), contracts.Runtime)
		if err != nil {
			return fmt.Errorf("open example runtime bucket: %w", err)
		}
		state, _, err := bucket.Get(ctx, "runtime")
		if err != nil {
			var fault pluginsdk.Fault
			if !errors.As(err, &fault) || fault.Code != pluginsdk.FaultNotFound {
				return fmt.Errorf("read example runtime state: %w", err)
			}
			state = contracts.RuntimeState{}
		}
		state.Starts++
		state.LastStartedAt = startedAt
		if _, err := bucket.Put(ctx, "runtime", state); err != nil {
			return fmt.Errorf("write example runtime state: %w", err)
		}
	}
	service, err := commonplugin.Serve(ctx, p.Bus(), contracts.Hello, func(_ context.Context, req contracts.HelloRequest, _ pluginsdk.Caller) (contracts.HelloResponse, error) {
		name := strings.TrimSpace(req.Name)
		if name == "" {
			name = "operator"
		}
		return contracts.HelloResponse{Message: "hello, " + name}, nil
	})
	if err != nil {
		return fmt.Errorf("serve example hello endpoint: %w", err)
	}
	if err := commonplugin.Emit(ctx, p.Bus(), contracts.Started, contracts.StartedEvent{Message: "example plugin started", StartedAt: startedAt}); err != nil {
		_ = service.Stop(context.Background())
		return fmt.Errorf("emit example started event: %w", err)
	}
	p.mu.Lock()
	p.service = service
	p.mu.Unlock()
	p.active.Store(true)
	return nil
}
func (p *Plugin) CheckActivation(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if !p.active.Load() {
		return fmt.Errorf("plugin not started")
	}
	return nil
}
func (p *Plugin) Stop(ctx context.Context) error {
	p.active.Store(false)
	p.mu.Lock()
	service := p.service
	p.service = nil
	p.mu.Unlock()
	if service != nil {
		return service.Stop(ctx)
	}
	return nil
}
func (p *Plugin) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !p.active.Load() {
			http.Error(w, "plugin unavailable", http.StatusServiceUnavailable)
			return
		}
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", http.MethodGet)
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		switch r.URL.Path {
		case "/example/panel.mjs":
			w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
			_, _ = w.Write(panelModule)
		case "/healthz", "/example/hello":
			w.Header().Set("Content-Type", "text/plain")
			_, _ = w.Write([]byte("ok"))
		case "/example/", "/example/ui":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(`<!doctype html><html><head><meta charset="utf-8"><title>Example plugin</title></head><body><h1>Example plugin</h1><p>This package uses the same SDK Plugin in linked and spawned deployment modes.</p></body></html>`))
		default:
			http.NotFound(w, r)
		}
	})
}

var _ pluginsdk.Bound = (*Plugin)(nil)
var _ pluginsdk.Plugin = (*Plugin)(nil)
var _ pluginsdk.HTTPPlugin = (*Plugin)(nil)
var _ pluginsdk.ActivationChecker = (*Plugin)(nil)
