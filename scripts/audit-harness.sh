#!/usr/bin/env bash
# =============================================================================
# audit-harness.sh — FindA.Sale Automated Audit Harness
# Usage: bash scripts/audit-harness.sh [category|all]
# Categories: security, codeQuality, accessibility, performance, configuration
#
# Exit codes:
#   0 — all scanned categories within baseline thresholds
#   1 — one or more critical or high threshold exceeded
#   2 — usage error
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve project root (script lives in scripts/, root is one level up)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PATTERNS_FILE="$SCRIPT_DIR/audit-harness-patterns.json"
BASELINE_FILE="$PROJECT_ROOT/claude_docs/operations/audit-baselines/health-scout-baseline.json"

# ---------------------------------------------------------------------------
# Colour helpers (degrade gracefully when no TTY)
# ---------------------------------------------------------------------------
if [ -t 1 ]; then
  RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
else
  RED=''; YELLOW=''; GREEN=''; CYAN=''; BOLD=''; RESET=''
fi

# ---------------------------------------------------------------------------
# Validate dependencies
# ---------------------------------------------------------------------------
for cmd in grep find jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: required command '$cmd' not found." >&2
    exit 2
  fi
done

if [ ! -f "$PATTERNS_FILE" ]; then
  echo "ERROR: patterns file not found: $PATTERNS_FILE" >&2
  exit 2
fi
if [ ! -f "$BASELINE_FILE" ]; then
  echo "ERROR: baseline file not found: $BASELINE_FILE" >&2
  exit 2
fi

# ---------------------------------------------------------------------------
# Parse argument
# ---------------------------------------------------------------------------
CATEGORY="${1:-all}"
VALID_CATEGORIES="security codeQuality accessibility performance configuration all"
if ! echo "$VALID_CATEGORIES" | grep -qw "$CATEGORY"; then
  echo "Usage: bash scripts/audit-harness.sh [security|codeQuality|accessibility|performance|configuration|all]" >&2
  exit 2
fi

# ---------------------------------------------------------------------------
# Build file list from scan targets (exclude paths applied)
# ---------------------------------------------------------------------------
build_file_list() {
  local -a files=()

  # Expand glob patterns defined in baseline scanTargets
  # We use find for reliable glob expansion
  local targets=(
    "packages/backend/src"
    "packages/frontend/pages"
    "packages/frontend/components"
    "packages/shared"
  )
  local extensions=("*.ts" "*.tsx")

  for dir in "${targets[@]}"; do
    local full_dir="$PROJECT_ROOT/$dir"
    [ -d "$full_dir" ] || continue
    for ext in "${extensions[@]}"; do
      while IFS= read -r -d '' f; do
        files+=("$f")
      done < <(find "$full_dir" -name "$ext" \
        -not -path "*/node_modules/*" \
        -not -path "*/*.test.ts" \
        -not -path "*/*.spec.ts" \
        -not -path "*/dist/*" \
        -not -path "*/.next/*" \
        -print0 2>/dev/null)
    done
  done

  # schema.prisma
  local schema="$PROJECT_ROOT/packages/database/prisma/schema.prisma"
  [ -f "$schema" ] && files+=("$schema")

  printf '%s\n' "${files[@]}"
}

# ---------------------------------------------------------------------------
# Count grep matches across file list for a given ERE pattern
# Returns count via stdout
# ---------------------------------------------------------------------------
count_matches() {
  local pattern="$1"
  shift
  local file_list=("$@")

  if [ ${#file_list[@]} -eq 0 ]; then
    echo 0
    return
  fi

  local count=0
  for f in "${file_list[@]}"; do
    local n
    n=$(grep -cEo "$pattern" "$f" 2>/dev/null || true)
    count=$((count + n))
  done
  echo "$count"
}

# ---------------------------------------------------------------------------
# Run one category audit
# Returns 0 if within threshold, 1 if critical/high exceeded
# ---------------------------------------------------------------------------
run_category() {
  local category="$1"
  shift
  local file_list=("$@")

  echo ""
  echo -e "${BOLD}${CYAN}=== Category: $category ===${RESET}"

  # Extract severities: critical high medium low
  local severities=("critical" "high" "medium" "low")
  local category_failed=0
  local category_total=0

  for severity in "${severities[@]}"; do
    # Get max allowed from baseline
    local max_allowed
    max_allowed=$(jq -r ".categories.${category}.maxAllowed.${severity} // 999" "$BASELINE_FILE" 2>/dev/null)

    # Get patterns for this severity from patterns file
    local pattern_count
    pattern_count=$(jq -r ".categories.${category}.${severity} | length" "$PATTERNS_FILE" 2>/dev/null || echo 0)

    if [ "$pattern_count" -eq 0 ]; then
      continue
    fi

    local severity_total=0
    local findings=()

    for i in $(seq 0 $((pattern_count - 1))); do
      local id pattern rationale
      id=$(jq -r ".categories.${category}.${severity}[$i].id" "$PATTERNS_FILE")
      pattern=$(jq -r ".categories.${category}.${severity}[$i].pattern" "$PATTERNS_FILE")
      rationale=$(jq -r ".categories.${category}.${severity}[$i].rationale" "$PATTERNS_FILE")

      local match_count
      match_count=$(count_matches "$pattern" "${file_list[@]}")
      severity_total=$((severity_total + match_count))
      category_total=$((category_total + match_count))

      if [ "$match_count" -gt 0 ]; then
        findings+=("  [$id] $match_count match(es) — $rationale")
      fi
    done

    # Determine pass/fail colour
    local status_icon status_colour
    if [ "$severity_total" -le "$max_allowed" ]; then
      status_icon="PASS"
      status_colour="$GREEN"
    else
      status_icon="FAIL"
      status_colour="$RED"
      if [ "$severity" = "critical" ] || [ "$severity" = "high" ]; then
        category_failed=1
      fi
    fi

    echo -e "  ${status_colour}[${status_icon}]${RESET} ${BOLD}${severity}${RESET}: ${severity_total} found (max ${max_allowed})"
    for finding in "${findings[@]}"; do
      echo -e "${YELLOW}${finding}${RESET}"
    done
  done

  echo "  Total matches in category: $category_total"

  return $category_failed
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
DATE_STAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo -e "${BOLD}FindA.Sale Audit Harness — $DATE_STAMP${RESET}"
echo "Category: $CATEGORY"
echo "Project root: $PROJECT_ROOT"
echo ""
echo "Building file list..."

mapfile -t FILE_LIST < <(build_file_list)
echo "Files to scan: ${#FILE_LIST[@]}"

ALL_CATEGORIES=("security" "codeQuality" "accessibility" "performance" "configuration")

if [ "$CATEGORY" = "all" ]; then
  SCAN_CATEGORIES=("${ALL_CATEGORIES[@]}")
else
  SCAN_CATEGORIES=("$CATEGORY")
fi

OVERALL_FAILED=0
CATEGORY_RESULTS=()

for cat in "${SCAN_CATEGORIES[@]}"; do
  if run_category "$cat" "${FILE_LIST[@]}"; then
    CATEGORY_RESULTS+=("${GREEN}PASS${RESET} — $cat")
  else
    CATEGORY_RESULTS+=("${RED}FAIL${RESET} — $cat (critical/high threshold exceeded)")
    OVERALL_FAILED=1
  fi
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}=== Audit Summary ===${RESET}"
for result in "${CATEGORY_RESULTS[@]}"; do
  echo -e "  $result"
done
echo ""

if [ "$OVERALL_FAILED" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}ALL CATEGORIES WITHIN BASELINE THRESHOLDS${RESET}"
  exit 0
else
  echo -e "${RED}${BOLD}ONE OR MORE CATEGORIES EXCEEDED CRITICAL/HIGH THRESHOLD — review findings above${RESET}"
  echo ""
  echo "To update thresholds (when findings are accepted technical debt):"
  echo "  Edit: claude_docs/operations/audit-baselines/health-scout-baseline.json"
  echo "  Increment maxAllowed for the relevant category + severity"
  echo "  Commit the change with a comment explaining the acceptance rationale"
  exit 1
fi
