/**
 * Vermont — Secondary Sale License Scraper (Phase 2) — STUB
 *
 * STATUS: No freely accessible structured source available from GitHub Actions runners.
 * This scraper returns 0 results cleanly and logs a clear diagnostic message.
 *
 * ATTEMPTED SOURCES (confirmed blocked or requires keyword filtering):
 *
 *   1. Vermont Secretary of State — bizfilings.vermont.gov bulk download
 *      https://bizfilings.vermont.gov/
 *      Bulk business entity data is available but requires keyword filtering on
 *      business name only — no business type or NAICS codes in the export.
 *      Per scraper-data-sources-50-states.md: "bizfilings.vermont.gov bulk download — Free; keyword filter needed"
 *      High false-positive rate makes this unreliable for secondhand sale businesses.
 *
 *   2. Vermont Office of Professional Regulation (OPR) — auctioneers
 *      https://www.sec.state.vt.us/professional-regulation.aspx
 *      No public bulk download; license verification is individual-lookup only.
 *
 *   3. VT pawnbroker licensing
 *      Pawnbroker licenses in VT are issued at the municipal level; no statewide registry.
 *
 *   4. NMLS Consumer Access — pawnbrokers
 *      DNS-blocked from GitHub Actions runners (ENOTFOUND).
 *
 * UNBLOCKING OPTIONS (in priority order):
 *
 *   Option A — Vermont SOS bulk data with keyword filter implementation:
 *     Download bizfilings.vermont.gov bulk CSV and filter by business name keywords
 *     (auction, estate sale, secondhand, pawn, consignment).
 *     Note: high false-positive rate; recommend reviewing matches manually first.
 *
 *   Option B — Vermont OPR public records request for auctioneer list:
 *     Contact VT OPR for full active auctioneer licensee list.
 *       https://www.sec.state.vt.us/professional-regulation.aspx
 *       Phone: (802) 828-1134
 *
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 */

/**
 * Vermont secondary sale license scraper — Phase 2.
 *
 * Currently a no-op stub. bizfilings.vermont.gov bulk data has no business type codes;
 * name-only keyword filtering produces high false-positive rate.
 * See file header for confirmed details and unblocking options.
 */
export async function runVermontPhase2Scraper(): Promise<void> {
  console.log(
    '[VermontPhase2] STUB — bizfilings.vermont.gov bulk CSV has no business type codes; name-only keyword filter is unreliable.'
  );
  console.log(
    '[VermontPhase2] VT OPR auctioneer data is individual-lookup only. Pawnbroker licensing is municipal.'
  );
  console.log(
    '[VermontPhase2] See file header for unblocking options (SOS keyword filter implementation or OPR records request).'
  );
  console.log('[VermontPhase2] Fetched: 0, Matched: 0, Upserted: 0');
}
