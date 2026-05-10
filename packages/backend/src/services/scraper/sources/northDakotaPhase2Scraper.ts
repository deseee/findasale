/**
 * North Dakota — Secondary Sale License Scraper (Phase 2) — STUB
 *
 * STATUS: No freely accessible bulk source available.
 * This scraper returns 0 results cleanly and logs a clear diagnostic message.
 *
 * ATTEMPTED SOURCES (confirmed blocked or paid-only):
 *
 *   1. ND Secretary of State business entity database
 *      https://firststop.sos.nd.gov/
 *      SOS data list is a paid subscription; no free bulk download available.
 *      Per scraper-data-sources-50-states.md: "SOS data list (paid)".
 *
 *   2. ND auctioneer licensing — FOIA required
 *      ND does not publish a public auctioneer registrant list.
 *      Per scraper-data-sources-50-states.md: "FOIA for auctioneer registrants".
 *
 *   3. NMLS Consumer Access — pawnbrokers
 *      DNS-blocked from GitHub Actions runners (ENOTFOUND).
 *
 *   4. ND pawnbroker licensing — Department of Financial Institutions
 *      https://www.nd.gov/dfi/
 *      No public bulk download; individual lookups only.
 *
 * UNBLOCKING OPTIONS (in priority order):
 *
 *   Option A — ND SOS bulk business data subscription:
 *     Purchase access to SOS entity list.
 *       https://firststop.sos.nd.gov/
 *
 *   Option B — FOIA request for auctioneer registrant list:
 *     File with ND Auction Association or relevant state agency.
 *       ND SOS: https://sos.nd.gov/ | Phone: (701) 328-2900
 *
 *   Option C — ND DFI public records request for pawnbroker list:
 *     https://www.nd.gov/dfi/
 *
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 */

/**
 * North Dakota secondary sale license scraper — Phase 2.
 *
 * Currently a no-op stub. SOS data is paid; auctioneer registry requires FOIA.
 * See file header for confirmed details and unblocking options.
 */
export async function runNorthDakotaPhase2Scraper(): Promise<void> {
  console.log(
    '[NorthDakotaPhase2] STUB — SOS bulk data is paid-only; auctioneer registrant list requires FOIA request.'
  );
  console.log(
    '[NorthDakotaPhase2] ND SOS entity data is a paid subscription. No public auctioneer registry. NMLS blocked from CI.'
  );
  console.log(
    '[NorthDakotaPhase2] See file header for unblocking options (SOS subscription, FOIA, or DFI records request).'
  );
  console.log('[NorthDakotaPhase2] Fetched: 0, Matched: 0, Upserted: 0');
}
