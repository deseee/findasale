# Next Session Prompt — Session 173
*Written: 2026-03-15T (session end)*
*Session ended: normally*

## Resume From

Verify buyer preview on capture page works in staging (last push `fd2f6b7`), then dispatch `findasale-dev` for the remaining 4 P1 bugs from `claude_docs/health-reports/bug-blitz-2026-03-15.md`.

## What Was In Progress

Nothing mid-flight. All S173 work shipped and build confirmed green.

## What Was Completed This Session

- **Performance dashboard (#6):** Fixed double `/api` URL prefix (404 → working). Fixed `recommendations` null crash (optional chaining). Added Performance link to organizer dashboard. Route confirmed live on Railway.
- **Add Items page:** Sticky toolbar moved above table (was at offsetTop 2161px — never activated). Sale name added to header. Buyer preview empty grid fixed (PENDING_REVIEW filter removed — now shows all items). Buyer preview added to capture page via `?preview=true` query param.
- **P1 bugs (4 of 8 fixed):** saleId missing → redirect to dashboard guard; bulk mutation skipped-item feedback (toast warning with count + reasons); Stripe typed error responses (400 for validation, 503 for rate limits); bulk photo endpoint returns `skipped[]` + HTTP 207.
- **Build fixes (2):** TS implicit `any` on `skipped.map` callback; missing `useEffect` import in `review.tsx`.
- **Self-healing:** SH-009 added — double `/api` prefix pattern documented.
- **Session wrap:** STATE.md, session-log.md, self-healing doc all updated.

## Environment Notes

- Build is green as of commit `fd2f6b7`. Railway and Vercel confirmed healthy.
- No pending git pushes — all S173 changes were committed and pushed.
- Insights (`/organizer/insights`) and Performance (`/organizer/performance`) are confirmed separate pages. Consolidation is a product decision deferred to Patrick.

## Remaining P1 Bugs (4 of 8)

From `claude_docs/health-reports/bug-blitz-2026-03-15.md`:

1. **Entrance pin coordinate validation** — `edit-sale/[id].tsx` + backend. No bounds check on `entranceLat`/`entranceLng` vs sale location. Dispatch `findasale-dev`.
2. **Batch hold transactional safety** — `reservationController.ts` `batchUpdateHolds`. Re-verify ownership inside `prisma.$transaction`. Dispatch `findasale-dev`.
3. **Draft item count cache race** — `add-items/[saleId].tsx`. Rapid camera additions may show stale count if cache doesn't invalidate in time. Dispatch `findasale-dev`.
4. **Category enum validation** — `routes/items.ts`. Category accepts any string; needs whitelist enum enforcement at validation layer. Dispatch `findasale-dev`.

## P2 Cleanup (after P1 complete)

- Status badge clarity on edit-sale page (ambiguous LIVE vs DRAFT)
- Onboarding wizard re-trigger bug
- `listingType` vs deprecated `isAuctionSale`/`reverseAuction` field cleanup
- Insights + Performance consolidation (needs Patrick product decision first)

## Exact Context

- Bug blitz report: `claude_docs/health-reports/bug-blitz-2026-03-15.md`
- P1 bugs remaining: rows 2, 3, 4, 7 of the P1 table (entrance pin, batch holds, draft cache, category enum)
- P0 bugs: all 4 fixed in S172–173
- Next roadmap feature: TBD — ask Patrick after P1 pass is complete
