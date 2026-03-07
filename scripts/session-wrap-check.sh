#!/bin/bash
# FindA.Sale session-wrap-check.sh
# Runs at session end to verify all work has been committed.
# Exit code: 1 if uncommitted work found, 0 if clean.

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

FAIL=0
ISSUES=()

echo ""
echo "FindA.Sale Session Wrap Check" >&2
echo "========================================" >&2

# ── 1. Check for uncommitted changes ────────────────────────────────────────
echo "[1/6] Checking for uncommitted changes..." >&2

UNCOMMITTED=$(git diff --name-only 2>/dev/null || true)
if [ -n "$UNCOMMITTED" ]; then
  FAIL=1
  ISSUES+=("Uncommitted changes (tracked files):")
  while IFS= read -r file; do
    ISSUES+=("  - $file")
    echo "  - $file" >&2
  done <<< "$UNCOMMITTED"
else
  echo "  ✅ No uncommitted changes." >&2
fi

# ── 2. Check for untracked files in key directories ─────────────────────────
echo "[2/6] Checking for untracked files in key directories..." >&2

KEY_DIRS=("claude_docs" "packages" "scripts" "public")
UNTRACKED=""

for dir in "${KEY_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    UNTRACKED_IN_DIR=$(git ls-files --others --exclude-standard "$dir" 2>/dev/null || true)
    if [ -n "$UNTRACKED_IN_DIR" ]; then
      UNTRACKED="$UNTRACKED
$UNTRACKED_IN_DIR"
    fi
  fi
done

if [ -n "$UNTRACKED" ]; then
  FAIL=1
  ISSUES+=("Untracked files in key directories:")
  while IFS= read -r file; do
    [ -n "$file" ] && ISSUES+=("  - $file")
    [ -n "$file" ] && echo "  - $file" >&2
  done <<< "$UNTRACKED"
else
  echo "  ✅ No untracked files in key directories." >&2
fi

# ── 3. Check for unpushed commits ───────────────────────────────────────────
echo "[3/6] Checking for unpushed commits..." >&2

AHEAD=$(git rev-list --count HEAD..origin/main 2>/dev/null || git rev-list --count @{u}..HEAD 2>/dev/null || echo "0")
BEHIND=$(git rev-list --count origin/main..HEAD 2>/dev/null || git rev-list --count HEAD..@{u} 2>/dev/null || echo "0")

if [ "$BEHIND" -gt 0 ]; then
  FAIL=1
  ISSUES+=("Unpushed commits: $BEHIND commit(s) ahead of origin/main")
  echo "  ❌ $BEHIND unpushed commit(s)." >&2
else
  echo "  ✅ No unpushed commits." >&2
fi

# ── 4. Check if next-session-prompt.md was modified but not committed ───────
echo "[4/6] Checking session prompt file..." >&2

if [ -f "claude_docs/next-session-prompt.md" ]; then
  if git diff --quiet claude_docs/next-session-prompt.md 2>/dev/null; then
    echo "  ✅ next-session-prompt.md is clean." >&2
  else
    FAIL=1
    ISSUES+=("claude_docs/next-session-prompt.md has uncommitted changes")
    echo "  ❌ next-session-prompt.md has uncommitted changes." >&2
  fi
else
  echo "  ⓘ next-session-prompt.md not found (OK if first session)." >&2
fi

# ── 5. Check if session-log.md was modified but not committed ───────────────
echo "[5/6] Checking session log file..." >&2

if [ -f "claude_docs/session-log.md" ]; then
  if git diff --quiet claude_docs/session-log.md 2>/dev/null; then
    echo "  ✅ session-log.md is clean." >&2
  else
    FAIL=1
    ISSUES+=("claude_docs/session-log.md has uncommitted changes")
    echo "  ❌ session-log.md has uncommitted changes." >&2
  fi
else
  echo "  ⓘ session-log.md not found (OK if first session)." >&2
fi

# ── 6. Check if STATE.md was modified but not committed ────────────────────
echo "[6/6] Checking STATE.md..." >&2

if [ -f "claude_docs/STATE.md" ]; then
  if git diff --quiet claude_docs/STATE.md 2>/dev/null; then
    echo "  ✅ STATE.md is clean." >&2
  else
    FAIL=1
    ISSUES+=("claude_docs/STATE.md has uncommitted changes")
    echo "  ❌ STATE.md has uncommitted changes." >&2
  fi
else
  echo "  ⓘ STATE.md not found (OK if first session)." >&2
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
if [ $FAIL -eq 0 ]; then
  echo "✅ Session wrap check PASSED" >&2
  echo "========================================" >&2
  echo ""
  exit 0
else
  echo "❌ Session wrap check FAILED" >&2
  echo "========================================" >&2
  echo ""
  echo "Issues found:" >&2
  printf '%s\n' "${ISSUES[@]}" >&2
  echo ""
  echo "Next steps:" >&2
  echo "1. Review uncommitted files above" >&2
  echo "2. Run: git status" >&2
  echo "3. Stage files: git add <file>" >&2
  echo "4. Commit: git commit -m \"...\"" >&2
  echo "5. Push: ./push.ps1 (from PowerShell)" >&2
  echo ""
  exit 1
fi
