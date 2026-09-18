# Changelog

## [0.3.0-rc.1] - 2026-09-18

### Changed

- Move the reference process to plugin SDK v2.0.0-rc.2 and shared SDK v2.0.0-rc.3.
- Replace the v1 Host callback surface with the bound v2 bus.

### Added

- Typed startup event, discoverable hello service, and host-provisioned typed KV state example with an in-memory end-to-end test.

## [2026-09-15]

### Changed

- Adopt Gateway SDK v0.4.0-rc.12 and common SDK v0.4.0-rc.11 while preserving independent process and document UI lifecycle conformance.

## [0.2.0-rc.3] - 2026-09-09

### Added

- Independent DOM module with canonical document-route claims, payload-first location updates, scoped navigation, and idempotent activation cleanup.
- Explicit linked and spawned host authorization, admitted-request draining, and private readiness endpoint guidance.
- Browser lifecycle conformance for navigation, withdrawal, remounting, and failed-mount rollback.
- Executable conformance rejects hosts lacking the required document-route and module-mount features before socket publication.

### Changed

- Adopt Gateway SDK v0.4.0-rc.6 and common SDK v0.4.0-rc.5.

## [0.2.0-rc.2] - 2026-09-09

### Changed

- Adopt Gateway SDK v0.4.0-rc.5 and common SDK v0.4.0-rc.4 with canonical dependency version constraint validation.

## [0.2.0-rc.1] - 2026-09-08

### Changed

- Replace the handler-only scaffold with an independently constructed SDK Plugin package and shared ServePlugin entrypoint.
- Pin released SDK prereleases and remove sibling-directory replacements.
- Generate plugin.json from the implementation and test lifecycle withdrawal and manifest parity.

### Added

- Built-executable conformance verifies denial before socket publication, admitted serving, and graceful withdrawal without Gateway implementation imports.
