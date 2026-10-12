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

# Apple Design skill (HIG-based design review). Downloaded, not committed: it reproduces
# Apple's guideline text and this repository is public. Pinned to a reviewed commit.
APPLE_DESIGN_COMMIT=904b0eedc7cc778152f545506075d5bb5219ce77
SKILL_DIR="$HOME/.claude/skills/apple-design"
if [ ! -d "$SKILL_DIR/.git" ]; then
  git clone --quiet https://github.com/dickwu/apple-design-skill.git "$SKILL_DIR" 2>/dev/null \
    || echo "session-start: could not download the apple-design skill" >&2
fi
if [ -d "$SKILL_DIR/.git" ]; then
  git -C "$SKILL_DIR" fetch --quiet origin "$APPLE_DESIGN_COMMIT" 2>/dev/null || true
  git -C "$SKILL_DIR" checkout --quiet "$APPLE_DESIGN_COMMIT" 2>/dev/null \
    || echo "session-start: apple-design skill is not at the pinned commit" >&2
fi
