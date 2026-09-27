# AI Terminal

A Store-installable Gateway process plugin for durable coding sessions. It starts
from the public plugin template and uses released SDK contracts, not private
Gateway endpoints or direct coding-client processes.

## Ownership and requirements

The Gateway owns ACP connections, routing, worktrees, approval enforcement,
durable transcripts and recovery. The plugin owns the session controls and view.
It never receives a Jev API key, chooses a local provider route, spawns another
plugin, or executes a shell. Its manifest declares exact coding-session commands
and the five bounded payload commands. Activation requires the aggregate `coding.sessions.v1`
feature and authenticated workload support; a partial or older host must refuse.
The manifest also requests `process.supervised` for host-owned coding execution.
An administrator must consent to this side effect and the exact command grants
before creating, prompting, recovering or starting a new task. Automatic AI
decision admission never grants coding execution. Read and cleanup commands keep
their own grants so withdrawing execution consent does not strand active work.

The first package target is Linux amd64. Go pins are Gateway SDK
`v2.0.0-rc.12` and common SDK `v2.0.0-rc.14`. Browser contracts are copied from
that released common module by `cmd/sync-contracts`; they need no npm registry
or external script at runtime. Their shapes are checked client-side; the host's
strict validators, live grants and resource checks remain authoritative.

## Use

1. In Projects, select a checkout and open **AI Terminal**. The host supplies
   `host.location().params.projectId` and the opaque `checkoutRef` search value.
   The browser does not construct a checkout from an absolute filesystem path.
2. Choose a policy and enforceable permission mode. Balanced and Ask are the
   defaults. The policy is remembered per project in this browser; existing
   session preferences remain durable in the host. Provider/model/config
   overrides apply only to the next task. Unsupported or stale model-dependent
   effort choices are not offered.
3. Enter the task and start it. The host creates a fresh worktree from committed
   HEAD; uncommitted changes are excluded. Follow-ups retain the task's route.
4. Respond to host approvals. **Stop prompt** stops active work without ending a
   healthy coding connection. **Complete task** checks the host's task gates;
   an ACP end-turn is not completion. **New task** is available after completion.
5. **Open in dock** attaches to the same session. Closing that dock ends the
   shared session; navigation, refresh and view cleanup do not. **End session**
   has a confirmation dialog with Cancel and Escape.

`/ai-terminal/sessions/:sessionId` opens an existing exact session. It needs no
checkout selection and never creates a replacement. Without admitted Projects
context, new tasks stay disabled. Recovery is explicit and capability-gated;
uncertain prompts are never automatically replayed. A lost reply is not proof
that no work ran—check the durable session before resubmitting.

Route preview uses the real host routing job and can incur decision-provider
usage. It creates no coding session, worktree or coding process. Unknown cost,
latency and confidence remain visibly unknown.

## Build and checks

```sh
go mod download
go run ./cmd/sync-contracts -check
go run ./cmd/manifest -out plugin.json
go test ./...
go test -race ./...
npm test
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o dist/ai-terminal ./cmd/ai-terminal
```

`plugin.json` is generated from the SDK manifest. Do not edit it by hand. Go
module replacements and `go.work` are not delivery mechanisms. Package the
binary and generated manifest using the Store's ordinary authenticated package
and installation path; a local build is not a published Store release.

For a local, clearly labelled UI fixture:

```sh
AI_TERMINAL_TEST_TOKENS=/path/to/pinned/design-tokens/bytedesk.css node tests/fixture-server.mjs
```

The fixture has no Gateway authority. Its visible interaction checks do not
prove installation, live ACP routing, API-key isolation, task-gate enforcement,
shared-dock restore or production cutover. Those require the integrated host
and authenticated Store/Gateway acceptance.

## Implementation layout

- `terminalplugin/plugin.go`: manifest, lifecycle and embedded read-only assets.
- `terminalplugin/ui/api.mjs`: released descriptors, response guards and bounded
  payload uploads/reads. Prompts above 32 KiB use the reserved host consumer
  `gateway` with purpose `coding-prompt`, SHA-256 verification and 24 KiB chunks,
  up to 8 MiB. This is not an AI-provider identity or a filesystem path. History
  output leases are released only after complete UTF-8 hydration; partial reads
  retain the lease for retry or expiry. Content is text, never trusted HTML.
- `controller.mjs`: session/job orchestration, ordered events and lifecycle guards.
- `view.mjs`, `panel.css`: host-themed, keyboard-accessible controls and transcript.
- `tests`: bounded unit/contract fixtures; no live provider claims.

The UI follows Gateway's pinned design tokens and uses independent DOM controls,
not private React components or another plugin's globals.
