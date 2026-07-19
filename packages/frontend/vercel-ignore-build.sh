#!/usr/bin/env bash
# Vercel "Ignored Build Step" — referenced by vercel.json "ignoreCommand".
# Contract (Vercel): exit 1 => BUILD, exit 0 => SKIP the build.
# Policy: SKIP when a commit changed NOTHING outside documentation
# (claude_docs/** and any *.md anywhere) OR outside paths with zero relation
# to the frontend build (packages/backend/src, packages/backend's production
# Dockerfile/jest config, packages/database/prisma, extension/, .github/,
# scripts/, cloudflare/, services/, ai-config/, brand/, root *.sql files,
# railway.toml, railway.staging.toml, push.ps1). Package manifests and
# lockfiles (package.json at any level, pnpm-lock.yaml, pnpm-workspace.yaml)
# are deliberately EXCLUDED from this skip list -- they always BUILD (see
# ADR 2026-07-19). Any other non-doc change, or any uncertainty, BUILDS.
set -uo pipefail

# Anchor to the repo root so pathspecs are evaluated repo-wide, not from the
# Vercel root dir (packages/frontend). Without this, backend/schema changes
# would be invisible and a real deploy could be skipped.
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "vercel-ignore: no git root -> BUILD"; exit 1; }
cd "$ROOT"

# Compare against the last DEPLOYED commit, not just HEAD^. A multi-commit
# push (e.g. a code commit followed by a docs-only wrap commit) means HEAD^
# is NOT "the last deploy" -- it's whatever commit happens to sit directly
# below HEAD in this push. Diffing HEAD^..HEAD alone silently loses every
# non-doc change from earlier commits in the same push (confirmed bug,
# S1066 2026-07-03: a 20-workflow + 3-component fix landed in one commit
# immediately followed by a STATE.md-only commit; Vercel built HEAD^..HEAD,
# saw only STATE.md, and skipped the real deploy).
PREV="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$PREV" ] || ! git cat-file -e "${PREV}^{commit}" >/dev/null 2>&1; then
  # No previous-deployment SHA available (first deploy, or Vercel didn't set
  # it) -> fall back to HEAD^, but only if it's reachable.
  if git rev-parse HEAD^ >/dev/null 2>&1; then
    PREV="HEAD^"
  else
    echo "vercel-ignore: no previous commit reachable -> BUILD"
    exit 1
  fi
fi

# NOTE (ADR 2026-07-19, Option A): package manifests/lockfiles must NEVER be
# added to this exclude list. pnpm workspaces run a single
# `pnpm install --frozen-lockfile` across the whole monorepo before building
# any one package, so a manifest/lockfile change anywhere can affect the
# frontend's install step even when no frontend source changed. Keep
# package.json (root or any package), pnpm-lock.yaml, and pnpm-workspace.yaml
# OUT of this exclude list -- they must always trigger a build.
changed_non_doc=$(git diff --name-only "$PREV" HEAD -- . \
  ":(exclude,top)claude_docs" \
  ":(exclude,top)*.md" \
  ":(exclude,top)**/*.md" \
  ":(exclude,top)packages/backend/src" \
  ":(exclude,top)packages/backend/Dockerfile.production" \
  ":(exclude,top)packages/backend/jest.config*" \
  ":(exclude,top)packages/database/prisma" \
  ":(exclude,top)extension" \
  ":(exclude,top).github" \
  ":(exclude,top)scripts" \
  ":(exclude,top)cloudflare" \
  ":(exclude,top)services" \
  ":(exclude,top)ai-config" \
  ":(exclude,top)brand" \
  ":(exclude,top)*.sql" \
  ":(exclude,top)railway.toml" \
  ":(exclude,top)railway.staging.toml" \
  ":(exclude,top)push.ps1")

if [ -z "$changed_non_doc" ]; then
  echo "vercel-ignore: only docs/markdown changed -> SKIP build"
  exit 0
fi

echo "vercel-ignore: non-doc changes detected -> BUILD"
echo "$changed_non_doc" | head -20
exit 1
