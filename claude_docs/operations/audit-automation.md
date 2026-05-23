# Audit Automation — FindA.Sale

**Purpose:** Automated pre-deploy and periodic code health checks. Catches security regressions, code quality drift, accessibility gaps, performance anti-patterns, and configuration errors before they reach production.

**Created:** 2026-05-22
**Related skill:** health-scout

---

## How to Run

```bash
# Scan all categories
bash scripts/audit-harness.sh all

# Scan one category
bash scripts/audit-harness.sh security
bash scripts/audit-harness.sh codeQuality
bash scripts/audit-harness.sh accessibility
bash scripts/audit-harness.sh performance
bash scripts/audit-harness.sh configuration
```

**Exit codes:**
- `0` — all scanned categories within baseline thresholds
- `1` — one or more critical or high threshold exceeded
- `2` — usage error (bad argument, missing dependency)

---

## Files

| File | Purpose |
|------|---------|
| `scripts/audit-harness.sh` | Main runner — accepts category arg, counts grep matches, compares to baselines, outputs pass/fail |
| `scripts/audit-harness-patterns.json` | Grep patterns per category and severity with IDs and rationale |
| `claude_docs/operations/audit-baselines/health-scout-baseline.json` | Threshold definitions (maxAllowed per severity), scan targets, exclude paths, report format config |

---

## Categories and Health-Scout Severity Mapping

| Category | What it catches | health-scout tier |
|----------|----------------|-------------------|
| `security` | Hardcoded secrets, XSS vectors, CSRF gaps, insecure CORS, eval(), dangerouslySetInnerHTML | Critical / High |
| `codeQuality` | console.log, TODO/FIXME, `any` type casts, @ts-ignore, debugger statements | Medium / Low |
| `accessibility` | Missing alt text, unlabeled inputs, icon-only buttons, tabIndex abuse | High / Medium |
| `performance` | Unbounded findMany(), N+1 Prisma loops, full lodash imports, namespace imports | High / Medium |
| `configuration` | localhost URLs, hardcoded DB connection strings, decommissioned Neon hostname, non-TLS URLs | Critical / High |

---

## Baseline Thresholds

Thresholds live in `claude_docs/operations/audit-baselines/health-scout-baseline.json` under `categories.[name].maxAllowed`.

Current defaults:

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| security | 0 | 0 | 5 | 20 |
| codeQuality | 0 | 3 | 15 | 50 |
| accessibility | 0 | 2 | 10 | 30 |
| performance | 0 | 2 | 8 | 25 |
| configuration | 0 | 0 | 5 | 15 |

**Critical and High thresholds are hard gates.** Exceeding them causes exit 1 and blocks deployment. Medium and Low are tracked but do not block.

---

## Updating Baselines

Baselines should be raised only when findings are reviewed and accepted as deliberate technical debt or false positives. Never raise critical/high thresholds without a recorded decision.

**Process:**
1. Run the harness and identify the failing pattern ID (e.g. `SEC-M-003`).
2. Review each match: `grep -rEn "<pattern>" packages/`.
3. If the matches are acceptable (false positive, accepted debt), increment `maxAllowed` for that severity in `health-scout-baseline.json`.
4. Commit with message: `chore: raise [category] [severity] baseline — [reason]`.
5. Log the decision in `claude_docs/decisions-log.md` with the pattern ID and rationale.

Do not raise thresholds to make the harness pass without reviewing the actual matches.

---

## Adding New Patterns

Patterns live in `scripts/audit-harness-patterns.json`. Each entry requires:

```json
{
  "id": "CAT-S-NNN",
  "pattern": "<ERE regex>",
  "rationale": "One-line explanation of what this catches and why it matters"
}
```

ID format: `[CATEGORY_ABBREV]-[SEVERITY_INITIAL]-[3-digit-seq]`
Examples: `SEC-C-004`, `CQ-M-004`, `A11Y-H-003`

After adding a pattern, run the harness and verify the match count is reasonable before committing. Overly broad patterns produce noise and erode trust in the tool.

---

## Integration with health-scout Skill

The health-scout skill produces narrative markdown reports saved to `claude_docs/archive/health-reports/`. The audit harness is the automated counterpart — it runs the same categories but uses grep patterns instead of AI analysis, making it fast enough for pre-deploy CI gates.

**Workflow:**
1. `audit-harness.sh all` runs on every push (or pre-deploy check) — catches regressions fast.
2. `health-scout` runs periodically (monthly or pre-beta milestones) — produces the deep narrative report with context and remediation guidance.
3. Critical/High findings from health-scout reports should be translated into new harness patterns so regressions are caught automatically going forward.

**Naming convention for health-scout reports:** `health-scout-{YYYY-MM-DD}.md` in `claude_docs/archive/health-reports/`.

---

## Pre-Deploy Usage

Run before every Railway/Vercel deploy:

```bash
bash scripts/audit-harness.sh all
# If exit 1: do not push. Fix critical/high findings first.
# If exit 0: safe to push.
```

For CI environments (GitHub Actions, etc.), the exit code integrates directly with workflow `if: success()` / `if: failure()` gates.

---

## Limitations

- Grep-based patterns have false positives (e.g. test files generating mock secrets). The exclude list in `health-scout-baseline.json` handles most cases. Review match context with `grep -rEn "<pattern>" packages/` before raising a threshold.
- Patterns do not catch logic-level issues (business logic bugs, auth flow correctness). Use health-scout skill for those.
- JavaScript files in `packages/frontend/public/` are not scanned — they are vendor assets.
