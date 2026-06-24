# Daily Friction Audit — 2026-06-01

Run by: `daily-friction-audit` scheduled task (3:38 AM)

---

## Summary

No P0 blockers. No new P1 issues. Four P2 Patrick action items carry forward unresolved from the 2026-05-27 audit — none have been actioned in S828–S831. Project health is strong: Blocked Queue at 5 (below ≥8 ceiling), S831 push confirmed deployed, STATE.md and patrick-dashboard.md both current.

---

## ✅ Clean

| Check | Result |
|-------|--------|
| STATE.md freshness | Current — S831, updated 2026-06-01 |
| patrick-dashboard.md | Current — Week of June 1, 2026 |
| Blocked Queue row count | 5 rows — below ≥8 QA ceiling, dev sessions remain available |
| S831 push executed | ✅ Confirmed — top git commit is `6cfb89fd` (UTM fix + S831 wrap) |
| CLAUDE.md file references | No new 404s detected |
| Merge conflicts | None found in packages/ |
| DECISIONS.md age | Oldest entries: March 24, 2026 (~10 weeks) — within 3-month threshold |
| TODO/FIXME count | 58 markers in packages/ — unchanged from prior audit, all intentional Phase 2 stubs |
| TypeScript | No new errors flagged; last session (S831) reported 0 TS errors on all changed files |
| Recent sessions coverage | S828–S831 all documented in STATE.md Recent Sessions section |
| Pending Chrome Verifications | Table empty — #319/#325/#328 applied to roadmap S831 ✅ |

---

## 🟡 P2 — Patrick Actions Pending (Carry-Forward — 4th+ consecutive audit with no resolution)

These items were flagged in the 2026-05-27 audit and remain unactioned through S831. None are blocking active dev work, but they are accumulating as operational debt.

### 1. Email Verification Migration Undeployed
**Pending since:** S722 (migration `20260515180000` created S726)
**Evidence:** Migration file confirmed present in `packages/database/prisma/migrations/`. No record of `prisma migrate deploy` in S728–S831 session summaries.
**Risk:** Email verification token expiry fix (P0-3) is live in code but not in the production DB schema. Token expiry may not be enforced.
**Patrick Action:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="[Railway DATABASE_URL from Railway dashboard]"
npx prisma migrate deploy
npx prisma generate
```

### 2. Production DB Re-Seed (Blocks Shopper QA)
**Pending since:** S787
**Evidence:** Seedy2025! password rejected for all shopper test accounts (user5–user12+) since S576 password change. Shopper QA requiring login has used workarounds (DB inserts via psycopg2) in every session since.
**Risk:** Any shopper-flow QA requiring normal login is blocked. This affects #266, #184, #261, and any future shopper Chrome QA.
**Patrick Action:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="[Railway DATABASE_URL from Railway dashboard]"
npx prisma db seed
```
⚠️ Back up Barn Door QA Test Sale before running (id: cmpbvumj90001e7t7v5sa1iqi).

### 3. eBay Connection for user1 (Blocks 3 QA Items)
**Pending since:** S785
**Evidence:** #293 (eBay Listing Data Parity), #332 (Shopify Cross-Listing), and the eBay Blocked Queue items remain untestable without an eBay-connected organizer account.
**Patrick Action:** Connect eBay to user1 via the OAuth flow in /organizer/settings/ebay, or insert EbayConnection row directly in Railway DB.

### 4. Bing Webmaster Sitemap Submission
**Pending since:** S783
**Risk:** Bing/DuckDuckGo search crawlers aren't being proactively notified of new sale pages. Minor SEO gap.
**Patrick Action:** https://www.bing.com/webmasters → Add sitemap → `https://finda.sale/server-sitemap.xml`

---

## 🟡 P2 — New: UTM Attribution Verify Pending (Patrick Action — S831)

**Feature:** #462/#463/#464 UTM Params
**Status in Blocked Queue:** ❌ BROKEN S831, CODE-ONLY fix applied
**Issue:** Chrome MCP cannot verify this fix due to extension redirect behavior. Only a real browser can confirm `fsa_utm` is written to sessionStorage.
**Patrick Action:**
1. Open normal Chrome (not Cowork)
2. Navigate to: `https://finda.sale/search?utm_source=email&utm_campaign=test`
3. DevTools → Application → Session Storage → finda.sale → check for `fsa_utm` key
4. Report result to Claude next session — this closes or reopens the feature

---

## 🔵 P3 — Minor / Cosmetic

### Audit Task Gap (May 28–30)
No friction audit files exist for May 28 (Thursday), May 29 (Friday), or May 30 (Saturday). The task cadence shows gaps during weeks with lower Cowork activity — this is expected behavior (task only fires in active Cowork sessions). No action needed; informational only.

### Google Business Profile Verification Pending
Patrick action from S814: phone verify at business.google.com. Profile won't go live until verified. Low urgency but has been pending 2+ weeks.

### claude_docs/ Root File Accumulation
23 files in `claude_docs/` root that per `file-creation-schema.md` should be in subdirectories. This is a long-standing accumulation (noted in prior monthly retrospectives). Non-blocking. Suggest bundling cleanup into a future Records session.

### pipeline-audit-2026-05-29.md
Useful acquisition data in this file (Laura Turner organic signup, 0% click rate on outreach) — confirm it's been reviewed and its findings incorporated into roadmap/STATE.md if actionable.

---

## No Dispatch Required

No P0 or P1 findings. P2 items are all Patrick manual actions — no subagent can execute them. Flagging here for visibility.

Next audit: 2026-06-02 (Tuesday, 3:38 AM)
