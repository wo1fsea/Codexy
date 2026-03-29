#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

PORT=3001

if [ "${1:-}" = "--port" ] && [ -n "${2:-}" ]; then
  PORT="$2"
elif [ $# -gt 0 ]; then
  PORT="$1"
fi

exec npx next dev --hostname 0.0.0.0 --port "$PORT"
