// Package terminalplugin is a coding-session UI consumer. The Gateway owns
// routing, ACP transports, worktrees, credentials, approvals and durable state.
package terminalplugin

import (
	"context"
	"embed"
	"errors"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"
	"sync/atomic"

	pluginsdk "github.com/ByteDeskAI/bytedesk-remote-gateway-plugin-sdk/v2"
	"github.com/ByteDeskAI/bytedesk-remote-gateway-plugin-sdk/v2/codingsessions"
	"github.com/ByteDeskAI/bytedesk-remote-gateway-plugin-sdk/v2/payloads"
	"github.com/ByteDeskAI/bytedesk-sdk-dependencies/v2/bus"
	"github.com/ByteDeskAI/bytedesk-sdk-dependencies/v2/plugin"
)

const Version = "0.1.1"

//go:embed ui
var assets embed.FS

type Plugin struct {
	pluginsdk.Base
	active atomic.Bool
}

func New() *Plugin         { return &Plugin{} }
func (*Plugin) ID() string { return "ai-terminal" }
func (p *Plugin) Manifest() pluginsdk.Manifest {
	return pluginsdk.Manifest{
		Contract: pluginsdk.ProtocolMajor, Kind: pluginsdk.KindProcess, Spawn: true,
		ID: p.ID(), Version: Version,
		Identity:  &pluginsdk.ManifestIdentity{DisplayName: "AI Terminal", Description: "Shared, durable coding sessions with host-managed routing and permissions."},
		Publisher: &pluginsdk.Publisher{ID: "bytedesk", Name: "ByteDesk"},
		Targets:   []string{pluginsdk.TargetGateway}, Role: pluginsdk.RoleExtension,
		Binary: "ai-terminal", Socket: "plugin.sock",
		Capabilities: []string{pluginsdk.CapabilityProcessSupervised},
		Routes:       []string{"/ai-terminal/"}, Scopes: []string{"plugin:ai-terminal"},
		Nav:          []plugin.NavItem{{ID: "ai-terminal", Label: "AI Terminal", Href: "/ai-terminal", Order: 50}},
		Panels:       []plugin.PanelSpec{{ID: "ai-terminal", Kind: "ai-terminal", URL: "/ai-terminal/ui", Module: "/ai-terminal/assets/panel.mjs", DocumentPaths: []string{"/ai-terminal", "/ai-terminal/projects/:projectId", "/ai-terminal/sessions/:sessionId"}}},
		ProjectViews: []plugin.ProjectViewContribution{{ID: "ai-terminal", Label: "AI Terminal", Icon: "terminal", Order: 50, PanelID: "ai-terminal"}},
		Protocol:     &pluginsdk.ProtocolRequirements{Major: pluginsdk.ProtocolMajor, Required: []string{pluginsdk.FeatureHTTPRoutes, pluginsdk.FeatureUIModuleMount, plugin.FeatureDocumentPaths, pluginsdk.FeatureHostWorkloadAuth, pluginsdk.FeatureCodingSessionsV1}, Hooks: []string{"activation.check"}},
		Permissions: plugin.Permissions{
			Request: []bus.Pattern{
				codingsessions.CommandCatalog, codingsessions.CommandCreate, codingsessions.CommandRead,
				codingsessions.CommandRecover, codingsessions.CommandList, codingsessions.CommandPrompt,
				codingsessions.CommandStop, codingsessions.CommandEnd, codingsessions.CommandComplete,
				codingsessions.CommandNewTask, codingsessions.CommandPreferences, codingsessions.CommandApprove,
				codingsessions.CommandEvents, codingsessions.CommandOpenSurface,
				codingsessions.CommandPreview, codingsessions.CommandPreviewRead, codingsessions.CommandPreviewCancel,
				payloads.CommandCreate, payloads.CommandAppend, payloads.CommandCommit, payloads.CommandRead, payloads.CommandRevoke,
			},
			Subscribe: []bus.Pattern{codingsessions.EventChanged},
		},
	}
}
func (p *Plugin) Start(ctx context.Context) error {
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
		return errors.New("plugin not started")
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
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-cache")
		if r.URL.Path == "/healthz" {
			w.Header().Set("Content-Type", "text/plain")
			_, _ = w.Write([]byte("ok"))
			return
		}
		if r.URL.Path == "/ai-terminal/ui" || r.URL.Path == "/ai-terminal/" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte("<!doctype html><title>AI Terminal</title><h1>AI Terminal</h1><p>Open this plugin in Gateway Projects or an existing shared session. The host supplies the authenticated session interface.</p>"))
			return
		}
		const prefix = "/ai-terminal/assets/"
		if !strings.HasPrefix(r.URL.Path, prefix) {
			http.NotFound(w, r)
			return
		}
		name := strings.TrimPrefix(r.URL.Path, prefix)
		if !fs.ValidPath(name) || strings.HasSuffix(name, ".d.ts") {
			http.NotFound(w, r)
			return
		}
		data, err := assets.ReadFile("ui/" + name)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		contentType := mime.TypeByExtension(path.Ext(name))
		if path.Ext(name) == ".mjs" || path.Ext(name) == ".js" {
			contentType = "text/javascript; charset=utf-8"
		}
		w.Header().Set("Content-Type", contentType)
		_, _ = w.Write(data)
	})
}

var _ pluginsdk.Bound = (*Plugin)(nil)
var _ pluginsdk.Plugin = (*Plugin)(nil)
var _ pluginsdk.HTTPPlugin = (*Plugin)(nil)
var _ pluginsdk.ActivationChecker = (*Plugin)(nil)
