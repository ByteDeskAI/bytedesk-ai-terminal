// Package example implements a plugin independently of the gateway host.
package example

import (
	"context"
	_ "embed"
	"fmt"
	"net/http"
	"sync/atomic"

	pluginsdk "github.com/ByteDeskAI/bytedesk-remote-gateway-plugin-sdk"
)

const Version = "0.2.0-rc.3"

//go:embed panel.mjs
var panelModule []byte

type Plugin struct{ active atomic.Bool }

func New() *Plugin         { return &Plugin{} }
func (*Plugin) ID() string { return "example" }
func (p *Plugin) Manifest() pluginsdk.Manifest {
	return pluginsdk.Manifest{
		ID: p.ID(), Version: Version, Targets: []string{pluginsdk.TargetGateway},
		Spawn: true, Binary: "example", Socket: "plugin.sock",
		Routes: []string{"/example/"}, Scopes: []string{"plugin:example"},
		Nav:         []pluginsdk.NavItem{{ID: "example", Label: "Example plugin", Href: "/plugins/example", Order: 90}},
		Panels:      []pluginsdk.PanelSpec{{ID: "example", Kind: "example", URL: "/example/ui", Module: "/example/panel.mjs", DocumentPaths: []string{"/example", "/example/view/:item"}}},
		Protocol:    &pluginsdk.ProtocolRequirements{Major: pluginsdk.ProtocolMajor, Required: []string{pluginsdk.FeatureScopedHost, pluginsdk.FeatureActivationCheck, pluginsdk.FeatureDocumentPaths, pluginsdk.FeatureUIModuleMount}},
		Permissions: &pluginsdk.Permissions{},
	}
}
func (p *Plugin) Start(ctx context.Context, host pluginsdk.Host) error {
	if host == nil {
		return fmt.Errorf("host required")
	}
	if err := ctx.Err(); err != nil {
		return err
	}
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
func (p *Plugin) Stop(context.Context) error { p.active.Store(false); return nil }
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

var _ pluginsdk.Plugin = (*Plugin)(nil)
var _ pluginsdk.HTTPPlugin = (*Plugin)(nil)
var _ pluginsdk.ActivationChecker = (*Plugin)(nil)
