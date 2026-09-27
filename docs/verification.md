# Verification checkpoint — 2026-09-25

This is implementation and isolated-fixture evidence, not proof of Store
installation, authenticated Gateway operation or live ACP/Jev execution.

## Automated checks

- `npm test`: 15 tests passed, including catalog pagination/repeated-cursor refusal,
  large UTF-8 upload hashing/chunk bounds, partial-upload cleanup, successful output
  release, retry after incomplete history reads, and release of unsubmitted uploads
  when navigation changes the selected context.
- `go test ./...` and `go test -race ./...`: passed for the plugin and manifest.
- `go run ./cmd/sync-contracts -check`: passed against released contract artifacts.

## Browser fixture

Checked through agent-browser using `tests/fixture-server.mjs` and the pinned
Gateway design tokens. The fixture is labelled as having no Gateway or ACP
authority. It does not call a provider, create a worktree or run coding work.

1. Entered and sent a 40,000-byte prompt. The fixture transcript confirmed receipt
   through the scoped upload path, and the UI reported prompt acceptance.
2. Loaded `?pages=1&payload=1`. The provider picker included the second page's
   provider, and the fixture counter reported two catalog pages.
3. Sent a short prompt and hydrated a history response above 32 KiB. The transcript
   displayed the output and the fixture counter reported two payload reads and
   one explicit output-lease release.
4. Loaded the same fixture with `&retry=1`. Its first output read failed. The UI
   displayed a temporary-content message and no release. Refresh then hydrated
   the content successfully and released the output lease (three read attempts,
   one release total). No prompt was replayed.

Earlier fixture checks covered missing-checkout refusal, route preview, approvals,
explicit End confirmation/cancellation, next-model effort eligibility, and the
390-pixel light diagnostic view. None replace installed acceptance.

## Remaining acceptance

The integrated Gateway must still prove signed Store admission, explicit execution
consent, real provider routing, live task-completion linkage, recovery, shared dock
restore/close, credential isolation and production cutover. The aggregate coding
feature must remain unavailable until its full host guarantee is implemented and
verified. A source build or these fixture checks do not establish that guarantee.
