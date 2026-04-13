# Daily Friction Audit — 2026-04-02
**AUTO-DISPATCH from daily-friction-audit**
**Run time:** 3:38 AM scheduled task

---

## Overall Status: ✅ No P0 or P1 blockers

Vercel ✅ Railway ✅ DB migration deployed ✅ All S376 work pushed (confirmed via git log).
STATE.md and patrick-dashboard.md both updated to S376 today.

---

## Findings

### P2 — STATE.md stale content accumulation (doc-staleness)

Multiple "NOT YET PUSHED" and "Pending push" blocks from prior sessions remain in STATE.md body as noise. These have all been resolved but were never cleaned from the doc:

- **Lines ~133–138:** "S370 Files Changed (NOT YET PUSHED)" — all these files pushed in S371+
- **Lines ~174–175:** "Pending push — S366 full batch" — stale, all pushed in subsequent sessions
- **Lines ~445–455:** "Files changed S362 (in push block — NOT YET COMMITTED)" — pushed in S362/363, long resolved
- **Orphaned old "Next Session" blocks** still in body: S372 Priority 1–4 and S371 Priority 1–2 sections are embedded after the current ## Next Session (S377) section, creating confusion about what's actually next

**Impact:** Context pollution. Future sessions loading STATE.md may misread stale push blocks as active work. Low risk now, higher risk as file grows.
**Recommended action:** findasale-records — prune these stale blocks, keep only the current ## Next Session (S377) forward.

---

### P2 — Deprecated files still present

Per CLAUDE.md §12, `session-log.md` and `next-session-prompt.md` were deprecated (content moved into STATE.md). Both files still exist in `claude_docs/`:
- `claude_docs/session-log.md`
- `claude_docs/next-session-prompt.md`
- `claude_docs/logs/session-log.md` (duplicate)

**Impact:** Future sessions may load these and get stale context.
**Recommended action:** findasale-records — archive or delete these files, or add a clear "DEPRECATED — see STATE.md" header to each.

---

### P2 — Smart Cart checkout is a dead end (user-facing gap)

`packages/frontend/components/ShopperCartDrawer.tsx:187` has a TODO:
```
// TODO: Navigate to hold-to-pay flow with pre-selected items
showToast('Checkout feature coming soon', 'info');
```

The Smart Cart feature (#243) was just shipped in S376. The "Proceed to Checkout" button in the cart drawer shows a dismissive "coming soon" toast. A shopper who adds items to cart and clicks checkout hits a dead end with no path forward.

**Impact:** User-facing — any shopper using the new Smart Cart feature will hit this dead end.
**Options:**
1. Wire to hold-to-pay flow (multi-item hold reservation) — high effort, right long-term answer
2. Relabel button to "Request Hold" or "Contact Organizer" with a direct link to the organizer messaging flow — low effort, functional workaround
3. Hide "Proceed to Checkout" button entirely, surface items list only — low effort, honest UX

**Recommended action:** findasale-dev or findasale-ux → option 2 or 3 as a holding pattern until hold-to-pay multi-cart flow is built.

---

### P2 — OrganizerOnboardingModal never shown to new organizers

`packages/frontend/components/OrganizerOnboardingModal.tsx:60` has a TODO:
```
// TODO: import OrganizerOnboardingModal in organizer/dashboard.tsx for State 1 (new organizer)
```

The modal component is complete but not imported or triggered anywhere. New organizers who sign up and land on the dashboard get no welcome/onboarding flow.

**Impact:** New organizer first-run experience is broken — the onboarding modal that should guide them through creating their first sale never appears.
**Recommended action:** findasale-dev — single import + conditional render in `organizer/dashboard.tsx` State 1 (zero-sales organizer). Low-effort wire-up of existing component.

---

### P3 — DECISIONS.md reference points to non-existent path

`CLAUDE.md` Reference Docs table lists `DECISIONS.md` but no file at `claude_docs/DECISIONS.md` exists. There is a `claude_docs/decisions-log.md` and a `claude_docs/brand/DECISIONS.md`. The reference table is pointing to a 404.

**Impact:** Minimal — reference doc only. No session has broken due to this.
**Recommended action:** findasale-records — update CLAUDE.md reference table to point to `decisions-log.md`.

---

### P3 — itemQueries.ts TODO: draftStatus NULL handling

`packages/backend/src/helpers/itemQueries.ts:43`:
```
// TODO: Make draftStatus String? (optional) or backfill NULLs before re-enabling.
export const PUBLIC_ITEM_FILTER: Prisma.ItemWhereInput = {};
```

The public item filter is effectively empty (returns all items). The original intent was to filter by `draftStatus = 'PUBLISHED'` but it was disabled due to NULL values. This means draft/unpublished items may be visible in public browsing contexts.

**Impact:** Potentially exposing draft items to shoppers. Needs schema investigation.
**Recommended action:** health-scout or findasale-dev — verify whether draft items are leaking to public shopper views. If yes, this escalates to P1.

---

### ✅ No Issues Found

- Git state: all S376 work pushed, Vercel + Railway green
- STATE.md: updated today (S376)
- patrick-dashboard.md: updated today (S376)
- No merge conflicts in recent log
- TypeScript: no new broken patterns in recent files (null byte sweep done S361, schema preflight gates active)
- Blocked/Unverified Queue: 4 items, all appropriately categorized, no new additions from S376
- `fraudDetectionJob.ts` TODO (node-cron integration) — benign, Phase 2 note with no user impact
- `auctionJob.ts` TODO (organizer approve/relist UI) — benign, Phase 2 note
- `fraudService.ts` TODO (suspendedAt schema field) — benign, tracked as #73-phase3

---

## Dispatch Recommendations

**AUTO-DISPATCH 1 — findasale-records (P2 doc cleanup):**
Clean STATE.md stale push blocks. Archive/stub deprecated session-log.md and next-session-prompt.md. Fix CLAUDE.md DECISIONS.md reference. Context: see findings above.

**AUTO-DISPATCH 2 — findasale-ux (P2 Smart Cart dead end):**
UX decision needed for ShopperCartDrawer "Proceed to Checkout" dead-end button. Options: wire to hold-to-pay, relabel as "Request Hold", or hide button. Evaluate lowest-effort functional option.

**AUTO-DISPATCH 3 — findasale-dev (P2 OrganizerOnboardingModal):**
Wire `OrganizerOnboardingModal` into `organizer/dashboard.tsx` State 1 (zero-sales organizer). Single import + conditional render. Component is complete.

**FLAG for next session (P3 itemQueries.ts):**
Verify `PUBLIC_ITEM_FILTER = {}` in `itemQueries.ts` is not leaking draft items to shoppers. May escalate to P1 if confirmed.
