#!/usr/bin/env bash
# Runs the end-to-end flows against e2e/app on the booted simulator or emulator.
#   e2e/run.sh ios|android [maestro args...]
# Needs: maestro on PATH, e2e/app installed on a booted device (see e2e/README.md).
# Starts the fixture server and the app's Metro, runs the flows, stops both.
set -euo pipefail
platform="${1:?ios|android}"; shift || true
root="$(cd "$(dirname "$0")/.." && pwd)"
port="${PORT:-4567}"
server="http://localhost:${port}"

cleanup() { kill "${server_pid:-}" "${metro_pid:-}" 2>/dev/null || true; }
trap cleanup EXIT

PORT="$port" node "$root/e2e/server/server.js" &
server_pid=$!

if [ "$platform" = android ]; then
  # The device's localhost is the host's: the same URL works on both platforms and
  # 127.0.0.1 stays a different host name for the cross-origin flow.
  adb reverse "tcp:${port}" "tcp:${port}"
  adb reverse tcp:8081 tcp:8081
fi

# The dev client only connects to Metro on 8081.
if ! lsof -nP -iTCP:8081 -sTCP:LISTEN >/dev/null; then
  (cd "$root/e2e/app" && npx expo start --dev-client --port 8081 >/dev/null 2>&1 &)
  metro_pid=$(lsof -nP -t -iTCP:8081 -sTCP:LISTEN || true)
  for _ in $(seq 1 30); do lsof -nP -iTCP:8081 -sTCP:LISTEN >/dev/null && break; sleep 1; done
fi

maestro test --platform "$platform" -e "SERVER=${server}" "$@" "$root/e2e/flows"
