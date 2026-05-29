# Daily Friction Audit — 2026-05-27

Run by: `daily-friction-audit` scheduled task (3:38 AM)

---

## Summary

No P0 blockers. One P1 Patrick action (stale credential in global config). Four P2 Patrick action items already flagged in STATE.md — still pending. Codebase is clean: no merge conflicts, no 404 references, no stale DECISIONS.md entries.

---

## ✅ Clean

| Check | Result |
|-------|--------|
| STATE.md freshness | Current — S790, week of May 25, 2026 |
| patrick-dashboard.md | Current — week of May 25, 2026 |
| CLAUDE.md file references | All 14 referenced files exist — no 404s |
| Merge conflicts | None found in packages/ |
| DECISIONS.md age | Oldest entries March 2026 (~2.5 months) — within 3-month threshold |
| `requireOrganizer` middleware concern | Confirmed present in `middleware/auth.ts:66` — `pricing.ts:12` TODO is a false alarm |
| session-log-archive.md | Exists |

---

## ✅ P1 — Global CLAUDE.md Password — RESOLVED 2026-05-27

Patrick updated the global CLAUDE.md manually. Both DATABASE_URL lines now use `tEYYjdiay8x8q8N7A6LojJtG04R7sDBN`. Takes effect next session.

---

## 🟡 P2 — Patrick Actions Pending (Operational Blockers)

These are all documented in STATE.md Next Session but remain unactioned across 2–3+ sessions:

### 1. Production DB Re-Seed (Blocks All Shopper QA)
**Pending since:** S787  
**Blocks:** #266, #184, #261, all user12+ shopper tests — Seedy2025! rejected for all shopper accounts after S576 password change.  
**Patrick Action:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="[Railway DATABASE_URL from Railway dashboard]"
npx prisma db seed
```
Back up Barn Door QA Test Sale before running.

### 2. Email Verification Migration Undeployed
**Pending since:** S722 (migration `20260515180000` created S726)  
**Migration file confirmed present** in `packages/database/prisma/migrations/`  
**Issue:** P0-3 email verification token expiry fix is in code but not live in production DB.  
**Patrick Action:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="[Railway DATABASE_URL]"
npx prisma migrate deploy
npx prisma generate
```

### 3. eBay Connection for user1 (Blocks 4 QA Items)
**Pending since:** S785  
**Blocks:** #244, #293, #295, #298 — all in Blocked Queue. Cannot verify eBay Quick List, Listing Data Parity, Category Review Alerting, or Advanced Setup without an eBay connection for the test organizer account.  
**Patrick Action:** Connect eBay to user1 in Railway DB (OAuth flow or direct DB insert).

### 4. Bing Sitemap Submission
**Pending since:** S783  
**Action:** https://www.bing.com/webmasters → Add sitemap → `https://finda.sale/server-sitemap.xml`

---

## 🔵 P3 — Cosmetic / Low Priority

### Stale TODO Comment in pricing.ts
**File:** `packages/backend/src/routes/pricing.ts:12`  
**Comment:** `// TODO: Verify middleware exists`  
**Status:** Middleware (`requireOrganizer`) confirmed present at `middleware/auth.ts:66`. Comment is safe to remove but harmless.  
**Suggested fix:** 1-line comment deletion — can be bundled with any next pricing-area change.

### Backend TODO Count
54 TODO/FIXME markers in `packages/backend/src/`. All reviewed — all are intentional Phase 2 stubs (Stripe integration, GSA/Keepa API stubs, auction Phase 2 UI, distance sorting). No unowned or urgent items. Normal for active development at this stage.

---

## QA Ceiling Status

**Blocked Queue: 11 items** — threshold is ≥8 (CLAUDE.md §4).  
**Status: QA-ceiling is active.** STATE.md Next Session already notes QA-only focus. No new feature dev without Patrick sign-off. This is being managed correctly.

---

## No Auto-Dispatch Warranted

All actionable findings are Patrick actions (credentials, DB operations, external service connections). No code bugs or subagent tasks identified. The P3 TODO removal is not worth a dispatch.

**Next audit:** Tomorrow at 3:38 AM.
