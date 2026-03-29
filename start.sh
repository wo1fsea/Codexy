#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

PORT=3000

if [ "${1:-}" = "--port" ] && [ -n "${2:-}" ]; then
  PORT="$2"
elif [ $# -gt 0 ]; then
  PORT="$1"
fi

exec node scripts/next-start.mjs --port "$PORT"
