# Daily Friction Audit — 2026-04-15

**Automated run:** `daily-friction-audit` scheduled task (cron: `30 3 * * 1-5`)
**Session context:** Post-S480 (most recent: S467–S480, all 2026-04-15)

---

## Summary

One P1 action-required item (migration), one P1 documentation drift (roadmap staleness), one P2 carry-forward bug. No P0 blockers. No new code quality regressions found. State is healthy given the volume of work shipped today.

---

## P1 — S469 EbayPolicyMapping migration OUTSTANDING

**Category:** pending-manual-action  
**Severity:** P1  
**Finding:** The `20260415_ebay_policy_mapping` migration created in S469 has not been run against Railway production DB. The `EbayPolicyMapping` table does not yet exist in production. The Advanced eBay Setup page at `/organizer/settings/ebay` will throw Prisma errors on Save and load if this migration hasn't been applied.

S465 completed the S464 migration, but S469's migration is still outstanding. STATE.md documents the block but it has not been resolved as of this audit run.

**Patrick action required:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**Suggested agent:** Patrick (manual action — no subagent can run this)

---

## P1 — Roadmap not updated for S467–S480 (7 sessions)

**Category:** doc-staleness  
**Severity:** P1  
**Finding:** `claude_docs/strategy/roadmap.md` last updated 2026-04-14 (v107, S465). Sessions S467–S480 shipped multiple new features that require roadmap rows or status updates per CLAUDE.md §4 ("Session ships a new feature → add or update the roadmap entry at wrap"):

- **S467:** P0 sitewide organizer rarity filter fix (7 pages `/items` → `/items/drafts`). New row needed.
- **S468:** eBay policy sync UI + `/sync-policies` endpoint. New row needed.
- **S469:** EbayPolicyMapping schema + weight-tier parser + Advanced Setup page (729 lines). This is a major feature. New row(s) needed.
- **S479:** Chrome QA pass — S467 rarity filter ✅, S469 Advanced Setup ✅, S468 ⚠️ partial (fixed in S480). QA column updates needed on S467/S468/S469 rows.
- **S480:** Photo lightbox ✅ (Patrick-verified). eBay push error toast fix. Status card fix. New/updated rows needed.

7 sessions since last roadmap update. This is drift — CLAUDE.md §4 requires roadmap update at every session wrap that ships features.

**Suggested agent:** `findasale-records` — read STATE.md "Recent Sessions" + S467–S480 file change lists, add/update roadmap rows for all shipped features, update QA columns for Chrome-verified items.  
**AUTO-DISPATCH from daily-friction-audit**

---

## P2 — S469 sticky save bar hidden behind footer (carry-forward)

**Category:** code-quality / UI bug  
**Severity:** P2 (non-blocking — save still works)  
**Finding:** Already documented in STATE.md "Next Session Priority" item #2. The sticky "Save setup" bar on `/organizer/settings/ebay` renders behind the footer when scrolled to page bottom (`z-index` missing). Fix is `z-50` on the sticky container — <5 lines in `packages/frontend/pages/organizer/settings/ebay.tsx`.

**Suggested agent:** `findasale-dev` (trivial inline fix, <20 lines)  
**Status:** Queued in Next Session Priority — no re-dispatch needed unless it falls off.

---

## P3 — Stripe Connect webhook still unresolved (chronic carry-forward)

**Category:** integration-gap  
**Severity:** P3 (was P2 — demoted since it doesn't block go-live for estate sale flow)  
**Finding:** STATE.md Standing Notes: "Stripe Connect webhook (P2 — unresolved since S421): Configure Stripe Dashboard → Events on Connected accounts → `payment_intent.succeeded` → `/api/webhooks/stripe` → Railway `STRIPE_CONNECT_WEBHOOK_SECRET`. Without it, items don't mark SOLD after POS card payment."

This has been present in STATE.md since S421 (est. 2026-04-13). It's a Patrick action in the Stripe Dashboard — no code change needed. It affects POS card payment flows only.

**Suggested agent:** Patrick (manual Stripe Dashboard action)

---

## Informational — Blocked/Unverified Queue (11 items, stable)

Queue has 11 items. No new additions since S480. Items actionable in near-term:
- **eBay push USED_EXCELLENT condition** — needs item with weight set + policies configured (code-verified S480, live UNVERIFIED). Next eBay push with a weighted item will close this.
- **eBay watermark QR 85px bottom-right** — needs a successful eBay push to verify photo placement. Will close with next successful push.
- **ebayNeedsReview amber badge (S464)** — needs the S469 migration run first, then a push that exhausts all 5 category suggestions.

---

## Codebase scan results

- **CLAUDE.md file references:** All 10 referenced `claude_docs/` files verified present (SECURITY.md, RECOVERY.md, STACK.md, STATE.md, decisions-log.md, operations/*, strategy/roadmap.md, specs/ebay-listing-reconciliation-spec.md, self-healing/self_healing_skills.md). No 404s.
- **STACK.md vs package structure:** Current. Lists Railway PostgreSQL (migrated from Neon S264) and all active packages. No drift detected.
- **DECISIONS.md 30-day prune window:** Oldest entries are 2026-03-24 (22 days ago). No pruning needed yet — flag again in ~8 days.
- **TODO/FIXME markers in codebase:** 13–14 known tracked TODOs (same set as prior audits). No new P0/P1 markers. Chronic items: `snoozeService.ts` no-op function, `fraudDetectionJob.ts` not wired to cron, `shopper/settings.tsx` account deletion button (GDPR gap — surfaced in S441 power-user sweep).
- **TypeScript errors:** Not re-verified this run (S467–S480 dev agents all returned zero TS errors; post-session full scan deferred to next active session).
- **Skill health:** Active skills directory not mounted in this automated run — skill health check skipped.

---

## Dispatch block

| Finding | Severity | Suggested Action | Agent |
|---------|----------|-----------------|-------|
| S469 migration not run | P1 | Patrick manual: `prisma migrate deploy` + `prisma generate` | Patrick |
| Roadmap not updated S467–S480 | P1 | Read STATE.md Recent Sessions → add roadmap rows | `findasale-records` |
| S469 sticky save bar z-index | P2 | Add `z-50` to sticky container in settings/ebay.tsx | `findasale-dev` (next session) |
| Stripe Connect webhook | P3 | Configure Stripe Dashboard → Connected events → Railway | Patrick |
