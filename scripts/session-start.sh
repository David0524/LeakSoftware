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

# App onboarding questionnaire skill (owner, 2026-10-16): designs the new-shop onboarding.
# MIT, prompt text only. Pinned to a reviewed commit.
ONBOARDING_COMMIT=5bc4786d80f2c23de60b3ba02773e919ed8fd091
ONBOARDING_DIR="$HOME/.claude/skills/app-onboarding-questionnaire"
if [ ! -d "$ONBOARDING_DIR/.git" ]; then
  git clone --quiet https://github.com/adamlyttleapps/claude-skill-app-onboarding-questionnaire.git \
    "$ONBOARDING_DIR" 2>/dev/null \
    || echo "session-start: could not download the app-onboarding-questionnaire skill" >&2
fi
if [ -d "$ONBOARDING_DIR/.git" ]; then
  git -C "$ONBOARDING_DIR" fetch --quiet origin "$ONBOARDING_COMMIT" 2>/dev/null || true
  git -C "$ONBOARDING_DIR" checkout --quiet "$ONBOARDING_COMMIT" 2>/dev/null \
    || echo "session-start: app-onboarding-questionnaire skill is not at the pinned commit" >&2
fi

# Security audit skill (owner, 2026-10-17): Cloudflare's source-first security review. MIT,
# prompt text plus local validators. The skill lives in a subfolder of its repository, so the
# clone sits beside the skills folder and the skill is linked in. Pinned to a reviewed commit.
SECURITY_AUDIT_COMMIT=c1c8a8c1471069fb0e188eeaff69b8e8db6564a8
SECURITY_AUDIT_REPO="$HOME/.claude/security-audit-skill"
if [ ! -d "$SECURITY_AUDIT_REPO/.git" ]; then
  git clone --quiet https://github.com/cloudflare/security-audit-skill.git "$SECURITY_AUDIT_REPO" \
    2>/dev/null || echo "session-start: could not download the security-audit skill" >&2
fi
if [ -d "$SECURITY_AUDIT_REPO/.git" ]; then
  git -C "$SECURITY_AUDIT_REPO" fetch --quiet origin "$SECURITY_AUDIT_COMMIT" 2>/dev/null || true
  git -C "$SECURITY_AUDIT_REPO" checkout --quiet "$SECURITY_AUDIT_COMMIT" 2>/dev/null \
    || echo "session-start: security-audit skill is not at the pinned commit" >&2
  mkdir -p "$HOME/.claude/skills"
  ln -sfn "$SECURITY_AUDIT_REPO/skills/security-audit" "$HOME/.claude/skills/security-audit"
fi
