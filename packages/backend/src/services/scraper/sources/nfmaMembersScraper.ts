/**
 * NFMA (National Flea Market Association) member directory scraper
 *
 * STATUS: PARKED — member directory is behind an NFMA login wall.
 *
 * Investigation findings (2026-06-12):
 *   - Static HTML: nav items only. No member data.
 *   - Playwright + 30s waitForFunction: body text stays at 449 chars (nav only).
 *   - window.clientSideRender = false → SSR page; data would be in HTML if public.
 *   - Wix Data API direct POST → 403 Forbidden (requires session token).
 *
 * The member list is only visible to authenticated NFMA members.
 *
 * Options if this data becomes needed:
 *   1. Contact NFMA and request a public directory or data export.
 *   2. Source NFMA member markets via other public directories (Google, Yelp, etc.)
 *      that list flea market venues — they will naturally include NFMA members.
 *   3. If NFMA ever publishes a public API or opens the directory.
 */

export async function runNFMAMembersScraper(): Promise<void> {
  console.log('[NFMAMembers] PARKED — member directory is gated (NFMA login required).');
  console.log('[NFMAMembers] See file header for investigation findings.');
}
