#!/usr/bin/env bash
# Claude Code cloud sessions start from a fresh container: install the tools the checks need.
# Runs as a SessionStart hook (.claude/settings.json). No-op on local machines.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "$(dirname "$0")/.."

if [ ! -f /usr/share/postgresql/16/extension/pgtap.control ]; then
  apt-get install -y --no-install-recommends postgresql-16-pgtap >/dev/null 2>&1 \
    || echo "session-start: could not install pgTAP; pnpm test:db will fail" >&2
fi

pnpm install --frozen-lockfile >/dev/null 2>&1 || echo "session-start: pnpm install failed" >&2
