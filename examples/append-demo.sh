#!/usr/bin/env bash
# Demo: append a synthetic pulse without secrets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN_IN="${TOKEN_IN:-1500}" TOKEN_OUT="${TOKEN_OUT:-900}" SOURCE="${SOURCE:-demo}" \
  node "$ROOT/scripts/append-pulse.mjs"
