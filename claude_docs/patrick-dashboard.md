# Patrick's Dashboard — Week of June 2, 2026

---

## What Happened This Week

The week was dominated by a hunt-and-fix sprint on the batch photo upload feature — the one where you drop photos, it analyzes them with AI, and creates items automatically. It had been silently broken since launch (items were never actually saved to the database). The agents ran it down across 5 sessions, found 4 separate bugs stacked on top of each other, and on Friday confirmed it working end-to-end in a real browser: 3 photos dropped → AI titles, categories, prices generated → 3 items created correctly in the database. That feature is closed.

The week also produced a second fix for UTM attribution (the tracking that tells us where organizer signups came from), plus 8 features verified in Chrome across robots.txt, DMCA page, eBay settings, homepage filter pills, and the Flip Report.

---

## Audit Results (Weekly — May 30)

The weekly audit found no critical issues and confirmed 4 previously broken things are now fixed (categories page, privacy page, calendar, search).

The one problem that needs real attention: **the map is broken for shoppers.** The pins exist in the code — 197 of them — but they render about 13,000 pixels off-screen, so the map just looks empty. This has persisted for two weeks. It needs a dev fix this week.

Four medium issues were also flagged, all related to scraped directory listings showing wrong sale type badges, a confusing "Location not available" message, and a breadcrumb with a trailing slash. A single dev pass on scraped-sale normalization would clean all four.

---

## Pending Decisions

No pending decisions from the DECISIONS registry. All standing decisions (all sale types, dark mode, mobile-first, etc.) are locked and holding.

---

## Beta Tester Impact

**Better this week:** The batch upload + AI photo analysis feature actually works now — this is a core value-driver for organizers. The homepage "This Weekend" filter pill works. The DMCA page and robots.txt are live. The Flip Report displays cleanly.

**Still rough:** The map page shows an empty map to shoppers even though there are hundreds of sales loaded. Organizers using UTM-tracked links (from our outreach emails) may still not have attribution tracked — needs your real-browser confirmation.

---

## This Week's Priority

1. **Map fix.** Dispatch to the dev agent — it's a 2-line Leaflet fix that would unlock the map for every shopper who visits /map.
2. **Scraped listing cleanup.** One backend pass cleans up wrong sale type badges, the "Location not available" confusion, and duplicate category tiles.
3. **UTM verification.** You need to open one URL in Chrome and check one value in DevTools. Takes 60 seconds. Until you do, we don't know if outreach attribution is working.

---

## Action Items for Patrick

- [ ] **Verify UTM tracking:** Open a normal Chrome tab (not Cowork), go to `https://finda.sale/search?utm_source=email&utm_campaign=test`, then open DevTools → Application → Session Storage → check for `fsa_utm`. Tell the agent what you see.
- [ ] **Run the S831 push block** (from last session — 4 files including the UTM fix and verified roadmap entries)
- [ ] **GBP phone verification:** Go to business.google.com → "Verify now" → enter the phone code to claim the FindA.Sale Google Business Profile
- [ ] **#239 legal gate:** Consignor payouts to real bank accounts are built and waiting — get your attorney + CPA sign-off before flipping the live switch

---

## Blocked Queue (5 items — dev sessions are clear to proceed)

| Feature | What's Blocking It |
|---------|-------------------|
| RSVP XP Monthly Cap | Need 5 RSVPs in one month to test the cap |
| Shopify Cross-Listing | Need a test Shopify store connected |
| eBay Post-Sale Panel | Need a completed sale with eBay items |
| Consignor Payout Email | Need to run a payout to a real email address |
| UTM Attribution | Needs your real-browser verify (see above) |
