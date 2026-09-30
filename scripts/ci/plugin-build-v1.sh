#!/usr/bin/env bash
set -euo pipefail
if [[ $# != 1 || "$1" != /* || ! -d "$1" || -L "$1" ]]; then
  echo 'Usage: plugin-build-v1.sh /absolute/empty/staging-directory' >&2
  exit 2
fi
stage="$1"
if [[ -n "$(find "$stage" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo 'Staging directory must be empty.' >&2
  exit 2
fi
if [[ "${PLUGIN_BUILD_PLATFORM:-linux-amd64}" != linux-amd64 ]]; then
  echo 'AI Terminal currently supports linux-amd64 only.' >&2
  exit 2
fi
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
export GOWORK=off GOFLAGS=-mod=readonly
go test ./... -count=1
node --test tests/*.test.mjs
go run ./cmd/manifest -out "$stage/plugin.json"
cmp plugin.json "$stage/plugin.json"
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -buildvcs=false -o "$stage/ai-terminal" ./cmd/ai-terminal
