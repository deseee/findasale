/**
 * ebayInsertionLimits.ts — Named constant for eBay's free-monthly-insertion cap.
 *
 * ADR ebay-renewal-forecasting (2026-09-15), Flagged Question #3 (formalized as a
 * required Dev Instruction by Patrick's 2026-09-15 decision): "250" previously
 * existed only as an inline literal (see platformStatsService.ts's resolveEbayLimit,
 * which independently hardcodes the same 250/1000 guess for the unrelated, already-
 * broken EbayLimitBar metric — not reused here on purpose, see below). This file
 * gives the real forecast endpoint (ebay-insertions-forecast) one canonical source.
 *
 * KNOWN GAP (do not silently "fix" here — out of scope for the forecasting ADR):
 * eBay's real free-insertion allowance varies by store subscription level (up to
 * 10,000/mo for Anchor stores per platformStatsService.ts's own code comment on
 * ebayListingQueueCron.ts ~line 403). This constant is flat 250 for every organizer,
 * matching the ADR's own stated scope ("dev to locate/confirm the 250 constant," not
 * "make it store-tier-aware"). Store-tier organizers will see a false approaching/over
 * warning until a future session makes this store-tier-aware (see UX spec
 * ebay-markdown-budget-warnings-ux-spec-2026-09-15.md, Open Decision B) — this is a
 * known, accepted, non-regressing gap, not a bug introduced by this file.
 */
export const EBAY_FREE_INSERTIONS_CAP = 250;
