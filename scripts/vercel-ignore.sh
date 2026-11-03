#!/usr/bin/env bash
# Vercel's Ignored Build Step (vercel.json "ignoreCommand"). Exit 0 skips the build, 1 builds.
# Builds cost money per CPU minute (owner, 2026-11-03), so Vercel builds only the live branch,
# and only when something the website is built from changed since its last deployment:
# iPhone, Android, docs, and database-only pushes don't rebuild the site.
set -u
if [ "${VERCEL_ENV:-}" != "production" ]; then
  echo "Skipping: preview build (only the live branch deploys)."
  exit 0
fi
cd "$(git rev-parse --show-toplevel)" || exit 1
prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
# No earlier deployment, or it isn't in Vercel's shallow clone: build to be safe.
if [ -z "$prev" ] || ! git cat-file -e "$prev^{commit}" 2>/dev/null; then
  echo "Building: no earlier deployment to compare with."
  exit 1
fi
if git diff --quiet "$prev" HEAD -- apps/web packages/core packages/tokens brand \
  package.json pnpm-lock.yaml pnpm-workspace.yaml vercel.json tsconfig*.json \
  scripts/vercel-ignore.sh ":(exclude)apps/web/e2e"; then
  echo "Skipping: nothing the website uses changed since $prev."
  exit 0
fi
echo "Building: the website changed since $prev."
exit 1
