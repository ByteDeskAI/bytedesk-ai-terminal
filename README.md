# ByteDesk remote-gateway plugin template

The `example` package is the v2 reference process plugin. It embeds `pluginsdk.Base`, imports no Gateway implementation, and uses the bound bus for a typed startup event, a discoverable request/reply service, and optional typed KV state. It also keeps the existing HTTP panel and activation check. `cmd/example` serves the same implementation as a process using `ServePlugin`.

1. Rename the module, package ID and declared routes in `exampleplugin/plugin.go`.
2. Define payloads and descriptors in `contracts/`. Generate a larger contract surface with the common SDK contract generator.
3. Implement domain behavior through `Base.Bus()`. Request only exact external subject patterns through manifest permissions; the host grants the plugin's own event, service and declared asset namespaces.
4. Regenerate `plugin.json` with `go run ./cmd/manifest` and review the output before replacing the file.
5. Run `go test ./...`, then build `go build -o example ./cmd/example`.
6. Validate with `go run github.com/ByteDeskAI/bytedesk-remote-gateway-plugin-sdk/v2/cmd/plugin-sdk validate --dir .` and pack with the same pinned command using `pack --dir . --out dist`.
7. Install the package through the Store/control plane, then enable it. Disabled installation exposes no contributions. The host resolves declared `/example/` routes and `/plugins/example` navigation; legacy `/p/example/` proxy access strips that conventional prefix only.

The template requires protocol major 2, services, HTTP routes and `ui.document-paths.v1`. An older or incomplete host is refused during negotiation. The KV declaration is optional at runtime because the current spawned NATS transport does not yet expose KV; when the negotiated bus reports KV, `Start` opens the host-provisioned bucket and records startup state. It never creates storage outside the manifest. `Stop` withdraws the service before returning. Never control, execute or proxy another plugin.

`ServePlugin` reads the `GATEWAY_PLUGIN_*` process contract, negotiates the v2 bus, binds the plugin, and then starts it. New executable code runs in a spawned process, not a Go shared object. Only the host owns operator authentication, admission, transport routing, asset provisioning and process supervision. Preserve full declared request paths in handlers.

The UI is self-contained for host CSP. For modules, use the versioned `@bytedesk/gateway-plugin-ui` mount/cleanup contract; untrusted UI requires the host sandbox/broker, not an in-page privilege grant inferred from a signature. See the Gateway plugin author guide for operator authorization and containment policy.

## Independent UI and document routes

`exampleplugin/panel.mjs` exports `mount(element, host)` and owns its DOM renderer. It imports no Gateway React components, router, or state store. The manifest declares `/example` and `/example/view/:item` as panel document paths; these claims are separate from HTTP API routes. The host supplies the escaped pathname, search, hash, and once-decoded route parameters through `host.location()`, and navigation through `host.navigate()`.

The module subscribes to `host.location`, returns an idempotent cleanup function, and removes listeners and DOM when its activation signal aborts. A failed subscription rolls back partial mounting. Its embedded single-file module has no external import graph or network dependency.

Run `node tests/ui-lifecycle.mjs` with Playwright installed, or set `PLAYWRIGHT_MODULE` to its importable module path; `CHROME_PATH` can select a local Chrome executable. This browser fixture verifies mounting, navigation, location updates, abort cleanup, remounting, and partial-mount failure under a strict self-only CSP. It exercises an SDK host facade, not an installed Gateway or live authorization. A host must implement and advertise the required UI feature before this template can activate; adding manifest fields alone does not establish host support.

The host must authenticate requests and enforce declared scopes before dispatching to the plugin. For a spawned plugin, enforcement precedes proxying `/example/`; plugin handlers must never be exposed through an unauthenticated public listener. The process entrypoint listens on the host-managed Unix socket. A private socket is transport, not an alternative authorization policy. The host withdraws routing admission before calling `Stop` and drains already admitted requests according to its lifecycle policy. On the private plugin socket only, `/healthz` reports plugin readiness, not unconditional process liveness. Gateway reserves its public `/healthz` for the host; that URL does not route to this plugin.
