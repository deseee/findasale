# Patrick's Dashboard — June 9, 2026 (Updated: S934)

**Generated:** Monday, June 9, 2026 (S934 — RESEARCH/DEV: scraper coverage for 459 empty SEO pages)

---

## S934 Quick Summary

**Auctions jumped 97 → 748.** We had only 97 auction listings nationwide — every big city (New York, Houston, Chicago, LA) showed zero. The cause wasn't missing data, it was mislabeled data: hundreds of real auction events we'd already scraped were filed under the wrong sale type. A reclassification pass fixed 651 of them into AUCTION (plus 217 yard-sale rows corrected to estate). This is now live in the database.

**Two outside sources can't be used.** I evaluated HiBid (auctions) and US YellowPages (venues) as new data sources to fill the empty city pages. Both explicitly ban scraping and aggregation in their terms of service, so they're off the table — using them would put us at legal risk. AuctionNinja's listings are JavaScript-only, which our scraper can't read. None of these are worth pursuing.

**Two own-pipeline widenings (pending push).** I widened our Facebook Events search to also pull flea markets, swap meets, public/online auctions, and consignment sales, and added five flea-market search terms to our Foursquare/HERE pipeline. These pick up new listings automatically on the next monthly run — no further action needed.

**Flea-market backfill shelved.** A batch of 600 "flea market" organizers turned out to be individual vendor booths (443 of them stacked on two New Orleans map points), so generating sales from them would have created junk. I built the script but didn't run it.

**RETAIL pages need a junk filter next.** Audited our 7,692 retail listings — about 1 in 6 are junk, plus ~1,478 duplicates and ~1,842 Canadian rows mixed into US pages. Cleaned-up pool is roughly 3,288 solid listings. Recommendation is a display-layer filter (no deletions). Queued as the S935 priority.

---

## S933 Quick Summary

BQ 5→1. Competitor email domain blocking shipped.

**BQ cleanup:** Verified each remaining BQ item directly against the Railway DB. #335 is already running (658 outreach emails sent, cron active). The WARM leads backfill is done (0 orgs with email missing a DCE row). WARM enrichment is growing naturally (3.5%→4.7%) — not a bug, removed from BQ. GSF geocoding gap is structural/by-design with a frontend fallback to zip/city — removed. BQ is now 1 item (#332 Shopify, P0, your call when you have a test store).

**Domain blocking:** `estatesales.net` and `estatesales.org` are now blocked at the domain level across all three email rails — transactional (Resend), outreach cron, and the two seeder scripts. Any address @estatesales.net or @estatesales.org will be silently skipped before a send is attempted. Sync/in-memory — no DB call, zero performance cost. Deploy confirmed green.

---

## Project Status

| Area | Status |
|------|--------|
| BQ (Blocked Queue) | **1 item** — well below QA ceiling (8), DEV available |
| GA4 Analytics | ✅ LIVE (CSP fixed S926, conversion events added S928 — needs Chrome QA) |
| Email (transactional) | ✅ On Resend rail (payouts, auth, receipts) |
| Email (competitor blocking) | ✅ estatesales.net/org blocked across all rails |
| Outreach | ⏸ Paused (intentional, domain warming — 37 PENDING queue ready) |
| Auction coverage | ✅ 97→748 listings (S934 reclassification of mislabeled data) |
| RETAIL pages | ⚠️ Junk filter queued (S935) — ~17% junk + dupes need display-layer suppression |
| Backend / Railway | ✅ Healthy |
| Frontend / Vercel | ✅ Deployed |

---

## What You Need to Do

```powershell
git add packages/backend/src/services/scraper/sources/search-facebook-events.ts packages/backend/src/services/scraper/sources/googlePlaces.ts packages/backend/src/scripts/reclassify-mistyped-sales.ts claude_docs/feature-notes/ADR-hibid-auction-scraper.md claude_docs/feature-notes/retail-data-quality-audit.md claude_docs/STATE.md claude_docs/patrick-dashboard.md claude_docs/strategy/roadmap.md
git commit -m "S934 wrap: auction reclassification (97->748), FB Events + flea queries widened, HiBid/YP ToS-blocked, RETAIL audit, docs updated"
.\push.ps1
```

---

## S935 Recommendation

BQ=1 (ceiling=8 — DEV available).

**Top priority — RETAIL junk filter (from S934 audit):**
- Build a display-layer filter (no deletions) that drops the junk RETAIL buckets (Estate Sale Company, no-suffix raw names, Consignment), collapses ~1,478 duplicates, and keeps Canadian rows off US pages. Cleans ~7,692 listings down to ~3,288 solid ones — directly improves the city×category SEO pages.

**Then verify the S934 widenings landed:**
- Confirm the widened Facebook Events search + the new flea-market search terms actually produce new auction/flea listings on the next monthly Foursquare (3rd) / HERE (2nd) / FB-Events run.

**QA pass — features built but unverified in Chrome:**
- **#470 GA4 Conversion Events** (built S928) — open GA4 → Realtime → Events, then trigger an action (sign up or create a sale), verify events fire
- **#463 Claim Button Click Tracking** (built S807) — visit an organizer profile, click Claim, check Vercel Analytics → Events tab
- **#164 Tiers Backend Infrastructure** — flagged UNVERIFIED since S804; log in as organizer, verify tier display

**DEV candidates:**
- **SEO3 Denver city landing page** — `/estate-sales/denver-co` targeting GSC impression cluster
- **#471 Bounce Suppression Auto-Ingestion** — build before outreach resume; mailer-daemon parser not built

---

## Weekly Brand Drift Alert — 2026-06-09

**Automated scan complete. No P0/P1 violations found. All core user-facing copy is compliant.**

Two P3 copy gaps and one P3 dark mode gap flagged:

1. **About page meta/OG descriptions** — too generic, don't mention any sale types (D-001 weak). Route to `findasale-marketing` for updated copy.
2. **Pricing page meta/OG descriptions** — too generic, no sale type mentions (D-001 weak). Route to `findasale-marketing`.
3. **SearchFilterPanel.tsx** lines 298, 314, 345 — "Clear Filters" button and result count text missing `dark:` variants (D-002). Route to `findasale-dev`.

Full report: `claude_docs/audits/brand-drift-2026-06-09.md`
