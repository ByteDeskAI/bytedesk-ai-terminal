# ByteDesk remote-gateway plugin template

The `example` package implements the canonical SDK `Plugin`, `HTTPPlugin` and optional `ActivationChecker`. It imports no gateway implementation. A linked host can construct `example.New()`; `cmd/example` serves the same implementation as a process using `ServePlugin`.

1. Rename the module, package ID and declared routes in `exampleplugin/plugin.go`.
2. Implement domain behavior in that independent package. Request only exact host operations needed through manifest Permissions; host policy grants authority.
3. Regenerate the package manifest with `go run ./cmd/manifest > plugin.json`.
4. Run `go test ./...`, then build `go build -o example ./cmd/example`.
5. Validate with `go run github.com/ByteDeskAI/bytedesk-remote-gateway-plugin-sdk/cmd/plugin-sdk validate --dir .` and pack with the same pinned command using `pack --dir . --out dist`.
6. Install the package through the Store/control plane, then enable it. Disabled installation exposes no contributions. The host resolves declared `/example/` routes and `/plugins/example` navigation; legacy `/p/example/` proxy access strips that conventional prefix only.

The template requires protocol major 1 scoped-host, activation-check, `ui.document-paths.v1`, and `ui.mount.v1` features. An older host must be upgraded before activation; the SDK negotiation fails closed. `Start` acquires resources, `CheckActivation` admits the candidate before serving, and `Stop` immediately marks this resource-free example inactive. Plugins with resources must finish teardown within the supplied deadline. Register callbacks/timers through the scoped SDK Host and cancel them during Stop. Never control, execute or proxy another plugin.

`ServePlugin` reads `GATEWAY_PLUGIN_ID`, `GATEWAY_PLUGIN_SOCKET` and `GATEWAY_HOST_SOCKET`. New executable code runs in a spawned process, not a Go shared object. Only the host owns operator authentication, admission, transport routing and process supervision. Preserve full declared request paths in handlers.

The UI is self-contained for host CSP. For modules, use the versioned `@bytedesk/gateway-plugin-ui` mount/cleanup contract; untrusted UI requires the host sandbox/broker, not an in-page privilege grant inferred from a signature. See the gateway plugin author guide for operator authorization and containment policy.

## Independent UI and document routes

`exampleplugin/panel.mjs` exports `mount(element, host)` and owns its DOM renderer. It imports no Gateway React components, router, or state store. The manifest declares `/example` and `/example/view/:item` as panel document paths; these claims are separate from HTTP API routes. The host supplies the escaped pathname, search, hash, and once-decoded route parameters through `host.location()`, and navigation through `host.navigate()`.

The module subscribes to `host.location`, returns an idempotent cleanup function, and removes listeners and DOM when its activation signal aborts. A failed subscription rolls back partial mounting. Its embedded single-file module has no external import graph or network dependency.

Run `node tests/ui-lifecycle.mjs` with Playwright installed, or set `PLAYWRIGHT_MODULE` to its importable module path; `CHROME_PATH` can select a local Chrome executable. This browser fixture verifies mounting, navigation, location updates, abort cleanup, remounting, and partial-mount failure under a strict self-only CSP. It exercises an SDK host facade, not an installed Gateway or live authorization. A host must implement and advertise both required UI features before this template can activate; adding manifest fields alone does not establish host support.

The host must authenticate requests and enforce declared scopes before dispatching to the plugin in either transport mode. A linked host constructing `example.New()` must apply the same enforcement before calling `Handler()`; this template performs no authorization of its own. For a spawned plugin, enforcement precedes proxying `/example/`; plugin handlers must never be exposed through an unauthenticated public listener. The process entrypoint listens on the host-managed Unix socket. A private socket is transport, not an alternative authorization policy. The host withdraws routing admission before calling `Stop` and drains already admitted requests according to its lifecycle policy; this example's atomic readiness check does not cancel an HTTP response already admitted before withdrawal. On the private plugin socket only, `/healthz` reports plugin readiness (503 before Start and after Stop), not unconditional process liveness. Gateway reserves its public `/healthz` for the host; that URL does not route to this plugin.
