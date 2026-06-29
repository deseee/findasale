#!/usr/bin/env bash
# Vercel "Ignored Build Step" — referenced by vercel.json "ignoreCommand".
# Contract (Vercel): exit 1 => BUILD, exit 0 => SKIP the build.
# Policy: SKIP only when a commit changed NOTHING outside documentation
# (claude_docs/** and any *.md anywhere). Any non-doc change — including
# backend, schema, or config — BUILDS. Any uncertainty BUILDS.
set -uo pipefail

# Anchor to the repo root so pathspecs are evaluated repo-wide, not from the
# Vercel root dir (packages/frontend). Without this, backend/schema changes
# would be invisible and a real deploy could be skipped.
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "vercel-ignore: no git root -> BUILD"; exit 1; }
cd "$ROOT"

# No previous commit reachable (shallow clone / first commit) -> build to be safe.
if ! git rev-parse HEAD^ >/dev/null 2>&1; then
  echo "vercel-ignore: no previous commit reachable -> BUILD"
  exit 1
fi

changed_non_doc=$(git diff --name-only HEAD^ HEAD -- . \
  ":(exclude,top)claude_docs" \
  ":(exclude,top)*.md" \
  ":(exclude,top)**/*.md")

if [ -z "$changed_non_doc" ]; then
  echo "vercel-ignore: only docs/markdown changed -> SKIP build"
  exit 0
fi

echo "vercel-ignore: non-doc changes detected -> BUILD"
echo "$changed_non_doc" | head -20
exit 1
