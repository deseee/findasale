# Friction Audit — 2026-06-15

**Run time:** 2026-06-15 ~03:38 UTC (scheduled daily)
**Auditor:** findasale-friction-audit (automated)

---

## Summary

| Check | Status | Severity |
|-------|--------|----------|
| Blocked Queue Ceiling | ✅ CLEAR (1/8) | — |
| BROKEN Items | ✅ CLEAR (0 unfixed) | — |
| STATE.md Freshness | ⚠️ Structural issue: duplicate `## Next Session` section | P2 |
| TypeScript Health | ✅ CLEAN (0 errors, both packages) | — |
| Merge Conflicts | ✅ CLEAN | — |
| Uncommitted Truncations | ❌ 2 files truncated in working tree | P2 |
| Critical Docs | ✅ No actionable TODOs/stale DECISIONS | — |

**Net findings: 1 P2 (truncated files) + 1 P2 (STATE.md structure). No P0/P1 this run.**

---

## Check 1 — Blocked Queue Ceiling

**Command:** `python3 -c "content = open(...STATE.md).read(); section = ...; rows = [...]; print(len(rows))"`

**Result:** 1 row

```
| #313 HAUL_POST_LIKES re-award fix | Idempotency bug FIXED S970; browser-verify needs 10 accounts | ... | S970 |
```

**Status:** ✅ CLEAR — 1 of 8 ceiling. DEV sessions remain unblocked.

---

## Check 2 — Roadmap BROKEN Items

**Command:** `grep -n "BROKEN" claude_docs/strategy/roadmap.md`

**Result:** Line 128 is the section heading `## BROKEN — Fix Before Anything Else`. Parsed all 7 data rows in the section:

```
431  → FIXED S736/S738 — Rate Limiter Triggering During QA
429  → FIXED S736 — eBay Push from Review Queue Skips Description Template
430  → FIXED S736 — Register Form Silent Error on Duplicate Email
46   → FIXED S346 — Treasure Typology Classifier (Deprecated)
SEO1 → FIXED S892 — Sale detail pages ship empty SSR head
SEO2 → FIXED S892 — Homepage conflicting canonical
SEO3 → SHIPPED S935 — SEO City Landing Pages
```

**Status:** ✅ CLEAR — 0 unfixed BROKEN items. All rows resolved. Confirmed via `python3` parse of status column.

---

## Check 3 — STATE.md Freshness

**Command:** `head -100 claude_docs/STATE.md` + section heading scan via python3 regex

**Most recent session entry:** S984 — 2026-06-15 (today). Current. ✅

**Next Session block:** Present and non-empty ✅

**FINDING — Duplicate `## Next Session` heading (P2):**

```
L59:  ## Next Session   ← stale S975 carry-forward content (eBay enrichment cascade notes)
L277: ## Next Session   ← current S984 → S985 dispatch plan (correct)
```

The first `## Next Session` at L59 is a ghost — it contains S975-era notes about the catalogSuggestions DDL, product enrichment cascade, and frontend TSC verification that should have been cleared or archived as those sessions completed. The current/correct Next Session section is at L277.

**Impact:** Session-start readers (human or automated) may read the stale L59 block first and act on S975-era work orders that are no longer relevant (e.g., "run catalogSuggestions DDL on Railway" was done S975/S980).

**Action:** `findasale-records` should merge or remove the stale first block, keeping only the L277 section.

---

## Check 4 — TypeScript Health

**Commands:**
```bash
cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules | wc -l
cd packages/backend  && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules | wc -l
```

**Result:** Frontend: 0 errors. Backend: 0 errors.

**Status:** ✅ CLEAN — Both packages TypeScript-clean.

*Note: Per S975, the VM `npx tsc` may silently "pass" if node_modules are corrupt. These results used the standard npx path; a real build on Vercel/Railway is the authoritative check.*

---

## Check 5 — Merge Conflict Check

**Command:** `grep -rn "^<<<<<<< " packages --include="*.ts" --include="*.tsx"`

**Result:** No output.

**Status:** ✅ CLEAN — No merge conflicts. Confirmed via grep.

---

## Check 6 — Uncommitted Truncations

**Command:** `git status --short | grep -E "^ M|^M "` → 2 modified files

```
M  claude_docs/brand/directory-listing-copy-2026-06.md
M  pnpm-lock.yaml
```

**`git diff --stat HEAD` result:** `2 files changed, 2 insertions(+), 58 deletions(-)`

### Finding P2-A — `directory-listing-copy-2026-06.md` truncated

**Evidence:**
- HEAD line count: 94 lines (`git show HEAD:... | wc -l`)
- Working tree line count: 59 lines (`wc -l ...`)
- Delta: **−35 lines**
- Diff shows the file ends mid-bullet at `"Built-in point-of-sale — take card payments on the spot via Stripe, no extra hardware required"` (no newline at EOF)
- **Missing from working tree:** the POS bullet continuation, Smart Pricing, Virtual Queue, Team tools, sale-type list, free-to-start pricing, the full Pricing section (SIMPLE/PRO/TEAMS/Single-sale/Enterprise), eBay/Google notes, and per-directory submission notes.

**Root cause:** Edit tool truncation bug (CLAUDE.md §4 — banned for this reason). The file was edited at some point using the `Edit` tool which silently dropped trailing content after ~line 59.

**Risk:** If `directory-listing-copy-2026-06.md` is committed or referenced by the marketing agent, the pricing section and eBay differentiator notes are gone. The next directory submission would use incomplete copy.

### Finding P2-B — `pnpm-lock.yaml` truncated

**Evidence:**
- HEAD line count: 13,159 lines (`git show HEAD:pnpm-lock.yaml | wc -l`)
- Working tree line count: 13,136 lines (`wc -l pnpm-lock.yaml`)
- Delta: **−23 lines**
- Working tree ends at `/yocto-queue@0.1.0` entry; HEAD has `/zip-stream@6.0.1`, `/zod-to-json-schema@3.25.2`, and `/zod@3.25.76` after that.
- The working tree file ends with a partial line: `resolution: {integri` (mid-string, confirms truncation)

**Risk:** If this truncated `pnpm-lock.yaml` is committed and pushed, `pnpm install` on CI/Railway may fail or silently change dependency resolution for `zod`, `zod-to-json-schema`, and `zip-stream`. Railway uses `pnpm install --frozen-lockfile` which would error on a malformed lockfile.

**Both files should be restored from HEAD before any next push.**

---

## Check 7 — Critical Docs

**TODOs command:** `grep -rn "TODO\|FIXME" claude_docs/ --include="*.md"`

**Result:** All matches are in `claude_docs/archive/` — old health reports and archived docs. No active TODOs in live `claude_docs/` non-archive files.

**DECISIONS.md command:** `grep -n "^##\|Date:" claude_docs/brand/DECISIONS.md`

**Result:** D-001 through D-010 all present. No date fields to audit for staleness (decisions use session numbers, not calendar dates). No stale entries detected.

**Status:** ✅ CLEAN — No actionable TODOs or stale decisions in active docs.

---

## Findings Summary

### P2-A — `directory-listing-copy-2026-06.md` truncated (−35 lines, Edit tool)

**Severity:** P2 (doc file, no code impact; but copy will be wrong if used)  
**Evidence:** `wc -l` 94→59; `git diff` shows exact missing content  
**Sessions unresolved:** 0 (new finding this session)  
**Blocked Queue:** Not required (P2) — but flagged for Patrick awareness  

**Auto-dispatch:**
```
Skill('findasale-records') — Restore claude_docs/brand/directory-listing-copy-2026-06.md
from git HEAD. The working tree copy is truncated (-35 lines, Edit tool bug). Run:
  git checkout HEAD -- claude_docs/brand/directory-listing-copy-2026-06.md
Include in next push block. Tag: AUTO-DISPATCH from daily-friction-audit 2026-06-15.
```

### P2-B — `pnpm-lock.yaml` truncated (−23 lines, missing zod/zip-stream entries)

**Severity:** P2 (could break pnpm install if committed)  
**Evidence:** `wc -l` 13159→13136; working tree ends mid-string `resolution: {integri`  
**Sessions unresolved:** 0 (new finding this session)  
**Blocked Queue:** Not required (P2) — but must not be committed  

**Auto-dispatch:**
```
Restore pnpm-lock.yaml from HEAD before any next push:
  git checkout HEAD -- pnpm-lock.yaml
Do NOT commit the truncated working-tree version. Tag: AUTO-DISPATCH from daily-friction-audit 2026-06-15.
```

### P2-C — STATE.md duplicate `## Next Session` section (L59 + L277)

**Severity:** P2 (documentation clarity / potential stale work-order risk)  
**Evidence:** python3 regex scan of section headings; L59 contains S975-era notes, L277 is current S984→S985 dispatch  
**Sessions unresolved:** 0 (new finding this session)  

**Auto-dispatch:**
```
Skill('findasale-records') — Remove or archive the stale ## Next Session block at L59 of
claude_docs/STATE.md (S975-era eBay enrichment DDL notes). The canonical Next Session is
at L277 (S984→S985 dispatch plan). After edit, include STATE.md in push block.
Tag: AUTO-DISPATCH from daily-friction-audit 2026-06-15.
```

---

## Confirmed Clean

| Check | Command | Result |
|-------|---------|--------|
| Blocked Queue | `python3` parse of STATE.md Blocked Queue rows | 1 row — CLEAR |
| BROKEN items | `grep -n "BROKEN" roadmap.md` + status column parse | 0 unfixed — CLEAR |
| STATE.md current | `head -100 STATE.md` + section scan | S984 2026-06-15 — CURRENT |
| Frontend TSC | `npx tsc --noEmit --skipLibCheck 2>&1 \| grep "error TS"` | 0 errors — CLEAN |
| Backend TSC | `npx tsc --noEmit --skipLibCheck 2>&1 \| grep "error TS"` | 0 errors — CLEAN |
| Merge conflicts | `grep -rn "^<<<<<<< " packages --include="*.ts" --include="*.tsx"` | No output — CLEAN |
| Active TODOs | `grep -rn "TODO\|FIXME" claude_docs/ --include="*.md"` | Archive-only — CLEAN |
| DECISIONS.md | `grep -n "^##" claude_docs/brand/DECISIONS.md` | D-001–D-010, no stale — CLEAN |

---

*Self-audit gate: 3 findings, 8 distinct tool citations (wc -l ×2, git diff --stat, git show HEAD | wc -l ×2, python3 parse ×3). Findings ≤ tool citations. ✅ All findings verified.*
