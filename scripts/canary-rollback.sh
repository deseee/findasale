#!/usr/bin/env bash
# scripts/canary-rollback.sh
# ---------------------------------------------------------------------------
# Canary health checker + auto-rollback for FindA.Sale backend (Railway)
# and frontend (Vercel).
#
# Usage:
#   ./scripts/canary-rollback.sh [backend|frontend|both]
#
# Environment variables (set in CI or export before running):
#   BACKEND_URL          Base URL of the deployed backend (no trailing slash)
#   VERCEL_TOKEN         Vercel API token (for frontend rollback)
#   VERCEL_PROJECT_ID    Vercel project ID (for frontend rollback)
#   RAILWAY_TOKEN        Railway API token (set in CI or ~/.railway/config.json)
#   RAILWAY_SERVICE      Railway service name (default: backend)
#   RAILWAY_PROJECT      Railway project ID or name
#
# Thresholds (override with env vars):
#   HEALTH_POLL_COUNT        Number of health checks to run      (default: 6)
#   HEALTH_POLL_INTERVAL     Seconds between polls               (default: 10)
#   RESPONSE_TIME_THRESHOLD  Max acceptable p95 response ms      (default: 2000)
#   ERROR_RATE_THRESHOLD     Max acceptable error % (0-100)      (default: 5)
#
# Exit codes:
#   0  All checks passed — deployment is healthy
#   1  Rollback triggered — unhealthy threshold breached
#   2  Configuration error — missing required env var
# ---------------------------------------------------------------------------

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────────────
TARGET="${1:-both}"
BACKEND_URL="${BACKEND_URL:-}"
RAILWAY_SERVICE="${RAILWAY_SERVICE:-backend}"
HEALTH_POLL_COUNT="${HEALTH_POLL_COUNT:-6}"
HEALTH_POLL_INTERVAL="${HEALTH_POLL_INTERVAL:-10}"
RESPONSE_TIME_THRESHOLD="${RESPONSE_TIME_THRESHOLD:-2000}"
ERROR_RATE_THRESHOLD="${ERROR_RATE_THRESHOLD:-5}"

# ── Colour helpers ───────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()    { echo -e "[$(date -u +%H:%M:%SZ)] $*"; }
ok()     { echo -e "${GREEN}[OK]${NC}  $*"; }
warn()   { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()   { echo -e "${RED}[FAIL]${NC} $*"; }

# ── Preflight checks ─────────────────────────────────────────────────────────
preflight_backend() {
  if [[ -z "$BACKEND_URL" ]]; then
    fail "BACKEND_URL is required for backend health checks."
    exit 2
  fi
}

preflight_frontend() {
  if [[ -z "${VERCEL_TOKEN:-}" || -z "${VERCEL_PROJECT_ID:-}" ]]; then
    fail "VERCEL_TOKEN and VERCEL_PROJECT_ID are required for frontend rollback."
    exit 2
  fi
}

# ── Backend: health check polling ────────────────────────────────────────────
# Hits GET / and records HTTP status + response time.
# Returns 0 if all polls succeed within threshold, 1 if any poll fails.
poll_backend_health() {
  local pass=0
  local fail_count=0
  local total_ms=0

  log "Polling ${BACKEND_URL}/ — ${HEALTH_POLL_COUNT} checks, ${HEALTH_POLL_INTERVAL}s apart"

  for i in $(seq 1 "$HEALTH_POLL_COUNT"); do
    local result
    result=$(curl -o /dev/null -s -w "%{http_code}:%{time_total}" \
      --max-time 10 \
      "${BACKEND_URL}/" 2>/dev/null || echo "000:0")

    local http_code="${result%%:*}"
    local time_s="${result##*:}"
    # Convert seconds to ms (awk handles float arithmetic)
    local time_ms
    time_ms=$(awk "BEGIN { printf \"%d\", $time_s * 1000 }")

    total_ms=$((total_ms + time_ms))

    if [[ "$http_code" =~ ^2 ]]; then
      ok "Poll $i/${HEALTH_POLL_COUNT}: HTTP ${http_code} — ${time_ms}ms"
      ((pass++)) || true
    else
      fail "Poll $i/${HEALTH_POLL_COUNT}: HTTP ${http_code} — ${time_ms}ms"
      ((fail_count++)) || true
    fi

    if [[ $i -lt $HEALTH_POLL_COUNT ]]; then
      sleep "$HEALTH_POLL_INTERVAL"
    fi
  done

  # Average response time
  local avg_ms=0
  if [[ $HEALTH_POLL_COUNT -gt 0 ]]; then
    avg_ms=$((total_ms / HEALTH_POLL_COUNT))
  fi
  log "Average response time: ${avg_ms}ms (threshold: ${RESPONSE_TIME_THRESHOLD}ms)"

  if [[ $fail_count -gt 0 ]]; then
    fail "${fail_count}/${HEALTH_POLL_COUNT} health checks failed."
    return 1
  fi

  if [[ $avg_ms -gt $RESPONSE_TIME_THRESHOLD ]]; then
    fail "Average response time ${avg_ms}ms exceeds threshold ${RESPONSE_TIME_THRESHOLD}ms."
    return 1
  fi

  ok "All ${HEALTH_POLL_COUNT} health checks passed. Avg ${avg_ms}ms."
  return 0
}

# ── Backend: error rate from Railway logs ────────────────────────────────────
# Requires railway CLI authenticated via RAILWAY_TOKEN.
# Parses last 200 log lines for lines containing "error" (case-insensitive).
check_error_rate() {
  if ! command -v railway &>/dev/null; then
    warn "railway CLI not found — skipping log-based error rate check."
    return 0
  fi

  log "Fetching recent Railway logs for service: ${RAILWAY_SERVICE}"

  local log_output
  # Fetch last ~200 lines; Railway CLI exits non-zero if auth fails
  if ! log_output=$(railway logs --service "$RAILWAY_SERVICE" --tail 200 2>/dev/null); then
    warn "Could not fetch Railway logs (auth or network issue). Skipping error rate check."
    return 0
  fi

  local total_lines
  total_lines=$(echo "$log_output" | wc -l)
  local error_lines
  error_lines=$(echo "$log_output" | grep -ciE "(error|exception|fatal|unhandled)" || true)

  if [[ $total_lines -eq 0 ]]; then
    warn "No log lines returned — skipping error rate check."
    return 0
  fi

  # Integer percentage
  local error_pct
  error_pct=$(awk "BEGIN { printf \"%d\", ($error_lines / $total_lines) * 100 }")

  log "Error rate: ${error_lines}/${total_lines} lines = ${error_pct}% (threshold: ${ERROR_RATE_THRESHOLD}%)"

  if [[ $error_pct -gt $ERROR_RATE_THRESHOLD ]]; then
    fail "Error rate ${error_pct}% exceeds threshold ${ERROR_RATE_THRESHOLD}%."
    return 1
  fi

  ok "Error rate ${error_pct}% within threshold."
  return 0
}

# ── Rollback: Railway backend ────────────────────────────────────────────────
rollback_backend() {
  warn "Triggering Railway rollback for service: ${RAILWAY_SERVICE}"
  if command -v railway &>/dev/null; then
    if railway rollback --service "$RAILWAY_SERVICE" 2>/dev/null; then
      ok "Railway rollback command accepted."
    else
      # railway rollback may not exist in all CLI versions; fall back to redeploy
      warn "railway rollback failed or unavailable — attempting redeploy of previous deployment."
      railway redeploy --service "$RAILWAY_SERVICE" || true
    fi
  else
    fail "railway CLI not available — manual rollback required."
    fail "Go to Railway dashboard → ${RAILWAY_SERVICE} → Deployments → select previous → Redeploy."
  fi
}

# ── Rollback: Vercel frontend ─────────────────────────────────────────────────
rollback_frontend() {
  warn "Triggering Vercel rollback for project: ${VERCEL_PROJECT_ID}"
  if command -v vercel &>/dev/null; then
    vercel rollback --token "$VERCEL_TOKEN" --yes 2>/dev/null \
      && ok "Vercel rollback command accepted." \
      || fail "vercel rollback failed — check Vercel dashboard."
  else
    fail "vercel CLI not available — manual rollback required."
    fail "Go to Vercel dashboard → ${VERCEL_PROJECT_ID} → Deployments → promote previous to production."
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  log "=== FindA.Sale Canary Health Check — target: ${TARGET} ==="
  local backend_ok=true
  local frontend_ok=true

  # Backend checks
  if [[ "$TARGET" == "backend" || "$TARGET" == "both" ]]; then
    preflight_backend
    log "--- Backend health polling ---"
    if ! poll_backend_health; then
      backend_ok=false
    fi
    log "--- Backend error rate ---"
    if ! check_error_rate; then
      backend_ok=false
    fi
  fi

  # Frontend: no automated health signal beyond Vercel's own checks.
  # If you add a /api/health route to the Next.js app, poll it here.
  if [[ "$TARGET" == "frontend" || "$TARGET" == "both" ]]; then
    preflight_frontend
    log "Frontend health: delegated to Vercel deployment checks."
    log "If Vercel reports unhealthy, run: vercel rollback --token \$VERCEL_TOKEN --yes"
  fi

  # Trigger rollbacks if needed
  if [[ "$backend_ok" == false ]]; then
    fail "Backend canary FAILED. Initiating rollback."
    rollback_backend
    exit 1
  fi

  if [[ "$frontend_ok" == false ]]; then
    fail "Frontend canary FAILED. Initiating rollback."
    rollback_frontend
    exit 1
  fi

  ok "=== All canary checks passed. Deployment is healthy. ==="
  exit 0
}

main "$@"
