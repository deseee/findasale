#!/usr/bin/env bash
# gh-api.sh -- token-optional GitHub REST helper for FindA.Sale checks (S1190).
#
# deseee/findasale is PUBLIC, so every READ (Actions runs, commits, PRs, issues,
# deploy statuses) works with NO token. A GH_PAT in .secrets.env is only used if
# it is verified valid; a dead/expired/missing PAT is NEVER fatal -- we fall back
# to unauthenticated reads and report the state. Token values are never printed.
#
# Usage (run):    bash scripts/gh-api.sh get "/repos/deseee/findasale/actions/runs?per_page=5"
#                 bash scripts/gh-api.sh check      # health check, see below
# Usage (source): source scripts/gh-api.sh; gh_api "/repos/deseee/findasale/commits?per_page=3"
#
# `check` prints, one per line:  GH_AUTH_STATUS=no_pat|valid|dead|unverified
#                                GH_UNAUTH_READ=ok|fail:<http>   GH_REPO_PUBLIC=true|false|unknown
# plus a "WARN:" line if a PAT is configured but dead. Exit 0 = reads work, 2 = reads broken.
#
# WRITES (push, PR create/merge, issue comment) are NOT done here: use the GitHub MCP
# connector in-session, or Patrick's push.ps1. Nothing scheduled needs a PAT for writes.
GH_REPO="${GH_REPO:-deseee/findasale}"
GH_API_BASE="${GH_API_BASE:-https://api.github.com}"
_GH_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." 2>/dev/null && pwd)"
GH_SECRETS_FILE="${GH_SECRETS_FILE:-$_GH_ROOT/.secrets.env}"
_GH_STATE=""   # cached: no_pat | valid | dead | unverified

_gh_load_pat() {
  [ -n "${GH_PAT:-}" ] && return 0
  [ -r "$GH_SECRETS_FILE" ] || return 0
  # Read only the GH_PAT line (never source the whole file); strip export/quotes/CR/space.
  GH_PAT="$(grep -E '^[[:space:]]*(export[[:space:]]+)?GH_PAT=' "$GH_SECRETS_FILE" 2>/dev/null | tail -n1 \
    | sed -E 's/^[[:space:]]*(export[[:space:]]+)?GH_PAT=//; s/\r$//; s/^[[:space:]]+|[[:space:]]+$//g; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/')"
}

gh_auth_state() {
  [ -n "$_GH_STATE" ] && { echo "$_GH_STATE"; return 0; }
  _gh_load_pat
  if [ -z "${GH_PAT:-}" ]; then _GH_STATE=no_pat; echo "$_GH_STATE"; return 0; fi
  local code
  code="$(curl -s -m 20 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $GH_PAT" "$GH_API_BASE/repos/$GH_REPO" 2>/dev/null)"  # NOT /rate_limit: it answers 200 even for a rejected token
  case "$code" in
    200) _GH_STATE=valid ;;
    401) _GH_STATE=dead ;;
    *)   _GH_STATE=unverified ;;   # network/5xx: do not trust, do not use
  esac
  echo "$_GH_STATE"
}

# gh_api <path-with-query> [extra curl args]  -> body on stdout, rc 0 on 2xx else 22
gh_api() {
  local path="$1"; shift
  local state resp code body
  state="$(gh_auth_state)"
  _gh_load_pat   # gh_auth_state ran in a subshell ($(...)), so GH_PAT it loaded is lost here; load it in this shell too
  code=""
  if [ "$state" = valid ]; then
    # Body and status are captured together on stdout (no temp file: mktemp paths are unreliable in some sandboxes).
    # -L follows the 302 that job-log downloads use; curl drops the Authorization header on a cross-host redirect.
    resp="$(curl -sL -m 30 -w '\n%{http_code}' -H "Authorization: Bearer $GH_PAT" -H 'Accept: application/vnd.github+json' "$@" "$GH_API_BASE$path")"
    code="${resp##*$'\n'}"; body="${resp%$'\n'*}"
    if [ "$code" = 401 ]; then _GH_STATE=dead; echo "WARN: GH_PAT rejected (Bad credentials); using unauthenticated read" >&2; code=""; fi
  fi
  if [ -z "$code" ]; then
    resp="$(curl -sL -m 30 -w '\n%{http_code}' -H 'Accept: application/vnd.github+json' "$@" "$GH_API_BASE$path")"
    code="${resp##*$'\n'}"; body="${resp%$'\n'*}"
  fi
  printf '%s\n' "$body"
  if [ "${code:0:1}" != 2 ]; then
    if [ "$code" = 403 ] && printf '%s' "$body" | grep -qi 'rate limit'; then
      echo "ERR: unauthenticated GitHub rate limit (60/h). Use the GitHub MCP connector (mcp__*github__*) for this call." >&2
    else
      echo "ERR: GitHub API $path -> HTTP $code" >&2
    fi
    return 22
  fi
  return 0
}

gh_check() {
  local st rc=0 body code
  st="$(gh_auth_state)"
  echo "GH_AUTH_STATUS=$st"
  [ "$st" = dead ] && echo "WARN: GH_PAT in .secrets.env is dead (Bad credentials). Non-fatal: all reads fall back to unauthenticated (repo is public). Only a GitHub login can mint a replacement, and nothing read-only needs one."
  [ "$st" = unverified ] && echo "WARN: could not verify GH_PAT (network/5xx); ignoring it and reading unauthenticated."
  local resp
  resp="$(curl -s -m 30 -w '\n%{http_code}' "$GH_API_BASE/repos/$GH_REPO")"
  code="${resp##*$'\n'}"; body="${resp%$'\n'*}"
  if [ "${code:0:1}" = 2 ]; then
    echo "GH_UNAUTH_READ=ok"
    if printf '%s' "$body" | grep -Eq '"private": *false' ; then echo "GH_REPO_PUBLIC=true"
    elif printf '%s' "$body" | grep -Eq '"private": *true' ; then echo "GH_REPO_PUBLIC=false"; echo "WARN: repo is private; unauthenticated reads will stop working and a valid PAT or the GitHub MCP connector becomes REQUIRED."
    else echo "GH_REPO_PUBLIC=unknown"; fi
  else
    echo "GH_UNAUTH_READ=fail:$code"; echo "GH_REPO_PUBLIC=unknown"
    echo "ERR: unauthenticated read of $GH_REPO failed (HTTP $code). Fall back to the GitHub MCP connector."
    rc=2
  fi
  return $rc
}

# Run as a script (not sourced)
if [ "${BASH_SOURCE[0]:-$0}" = "$0" ]; then
  case "${1:-}" in
    get)   shift; gh_api "$@" ;;
    check) gh_check ;;
    *) echo "usage: gh-api.sh get <path> | check" >&2; exit 64 ;;
  esac
fi
