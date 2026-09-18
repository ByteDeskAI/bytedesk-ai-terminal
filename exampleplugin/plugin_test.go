package example

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	pluginsdk "github.com/ByteDeskAI/bytedesk-remote-gateway-plugin-sdk/v2"
	"github.com/ByteDeskAI/bytedesk-remote-gateway-plugin-template/contracts"
	"github.com/ByteDeskAI/bytedesk-sdk-dependencies/v2/bus"
	"github.com/ByteDeskAI/bytedesk-sdk-dependencies/v2/bus/memory"
	commonplugin "github.com/ByteDeskAI/bytedesk-sdk-dependencies/v2/plugin"
)

func bindPlugin(t *testing.T, p *Plugin) (bus.Bus, bus.Bus) {
	t.Helper()
	store := memory.NewStore()
	t.Cleanup(store.Close)

	identity := bus.Identity{
		PluginID:   p.ID(),
		Generation: "test-generation",
		Role:       bus.RolePlugin,
		Grants:     pluginsdk.OwnNamespace(p.ID()),
	}
	identity.Grants.KV = []string{contracts.Runtime.Descriptor().Name()}
	pluginBus := store.Connect(identity)
	if err := pluginBus.KV().Declare(context.Background(), bus.BucketSpec{
		Name:     contracts.Runtime.Descriptor().Name(),
		History:  5,
		MaxBytes: 64 * 1024,
		Metadata: map[string]string{bus.HeaderSchema: contracts.Runtime.Descriptor().SchemaHash()},
	}); err != nil {
		t.Fatal(err)
	}

	observer := store.Connect(bus.Identity{
		PluginID:   "host",
		Generation: "test-generation",
		Role:       bus.RoleHost,
		Grants: bus.Grants{
			Subscribe: []bus.Pattern{"event.example.>"},
			Request:   []bus.Pattern{"svc.example.>"},
		},
	})
	if err := pluginsdk.Bind(p, pluginsdk.Binding{
		Bus:      pluginBus,
		Identity: identity,
		Caps:     pluginBus.Capabilities(),
	}); err != nil {
		t.Fatal(err)
	}
	return pluginBus, observer
}

func TestTypedEventKVServiceAndWithdrawal(t *testing.T) {
	ctx := context.Background()
	p := New()
	pluginBus, observer := bindPlugin(t, p)

	started := make(chan contracts.StartedEvent, 1)
	sub, err := commonplugin.On(ctx, observer, contracts.Started, func(_ context.Context, event contracts.StartedEvent, _ bus.Caller) {
		started <- event
	})
	if err != nil {
		t.Fatal(err)
	}
	defer sub.Cancel()

	if err := p.Start(ctx); err != nil {
		t.Fatal(err)
	}
	if err := p.CheckActivation(ctx); err != nil {
		t.Fatal(err)
	}
	select {
	case event := <-started:
		if event.Message != "example plugin started" || event.StartedAt == "" {
			t.Fatalf("unexpected started event: %#v", event)
		}
	case <-time.After(time.Second):
		t.Fatal("typed started event was not observed")
	}

	reply, err := commonplugin.Call(ctx, observer, contracts.Hello, contracts.HelloRequest{Name: "Ryan"})
	if err != nil {
		t.Fatal(err)
	}
	if reply.Message != "hello, Ryan" {
		t.Fatalf("hello reply = %q", reply.Message)
	}

	bucket, err := commonplugin.OpenBucket(ctx, pluginBus, contracts.Runtime)
	if err != nil {
		t.Fatal(err)
	}
	state, _, err := bucket.Get(ctx, "runtime")
	if err != nil {
		t.Fatal(err)
	}
	if state.Starts != 1 || state.LastStartedAt == "" {
		t.Fatalf("runtime state = %#v", state)
	}

	request := func() int {
		w := httptest.NewRecorder()
		p.Handler().ServeHTTP(w, httptest.NewRequest("GET", "/example/hello", nil))
		return w.Code
	}
	if request() != 200 {
		t.Fatal("started plugin did not serve declared HTTP path")
	}
	if err := p.Stop(ctx); err != nil {
		t.Fatal(err)
	}
	if request() != 503 {
		t.Fatal("withdrawn plugin still served HTTP")
	}
	if _, err := commonplugin.Call(ctx, observer, contracts.Hello, contracts.HelloRequest{}); err == nil {
		t.Fatal("withdrawn plugin still served typed command")
	}
}

func TestPackageManifestMatchesImplementation(t *testing.T) {
	raw, err := os.ReadFile("../plugin.json")
	if err != nil {
		t.Fatal(err)
	}
	var m pluginsdk.Manifest
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(m, New().Manifest()) {
		t.Fatal("regenerate plugin.json with go run ./cmd/manifest")
	}
	if err := commonplugin.Validate(m); err != nil {
		t.Fatal(err)
	}
}

func TestModuleAssetUsesIndependentMountContract(t *testing.T) {
	p := New()
	_, _ = bindPlugin(t, p)
	if err := p.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	p.Handler().ServeHTTP(w, httptest.NewRequest("GET", "/example/panel.mjs", nil))
	if w.Code != 200 || w.Header().Get("Content-Type") != "text/javascript; charset=utf-8" || !strings.Contains(w.Body.String(), "export function mount(element, host)") {
		t.Fatalf("module asset response: %d, %s", w.Code, w.Header().Get("Content-Type"))
	}
	_ = p.Stop(context.Background())
	w = httptest.NewRecorder()
	p.Handler().ServeHTTP(w, httptest.NewRequest("GET", "/example/panel.mjs", nil))
	if w.Code != 503 {
		t.Fatal("withdrawn module still served")
	}
}
