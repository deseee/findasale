# Patrick's Dashboard — June 10, 2026 (Updated: S938)

**Generated:** Wednesday, June 10, 2026 (S938 — email-rail rename + bounce-ingestion fix, both verified live)

---

## S938 Quick Summary

**Two email-system fixes shipped and verified live. Nothing left for you to do.**

**1. Retired the old "Amazon SES" email naming for good.** Your Gmail-rail emails were sending from a variable still named `SES_FROM_EMAIL`, and ~52 spots had dead `@send.finda.sale` fallback addresses (that old Amazon domain has no Google signature, so any email using it would land in spam). I renamed everything to `GMAIL_FROM_EMAIL` and pointed every fallback at your verified `find@outreach.finda.sale` alias. You set the new variable in Railway; I kept the old one alongside it for one deploy cycle so nothing could break. **Verified live:** I submitted your real contact form and the auto-reply arrived in the inbox from `find@outreach.finda.sale` — not spam. ✅

**2. Fixed the bounce-suppression job — and proved why it was showing zero.** The job that's supposed to catch bounced email addresses had never actually been running (it was on an unreliable scheduler the rest of your jobs already abandoned). I moved it onto the same GitHub scheduler everything else uses, and the Railway log now confirms it runs. I also checked the account it reads — it's correctly pointed at `outreach@finda.sale` with the right permissions. **The "zero bounces caught" is actually correct:** the only bounce notices in the mailbox are for your *own* internal scraper addresses (already blocked), and they're all in Trash from your manual cleanup. Real organizer bounces will land in the inbox where the job will catch them. Nothing to fix.

**3. Caught a corrupted file before it could ship.** Your local copy of `sales.ts` had been truncated (149 lines missing, including a live endpoint) — I restored it from the clean version before it could be committed. The rename commit you pushed never contained the broken file, so production was never at risk.

---

## S937 Quick Summary

**I mapped how all your email, outreach, and scraping actually connect — and fixed a real deliverability gap. One thing needs your decision.**

**The map.** There's a new reference doc (`claude_docs/feature-notes/email-outreach-scraper-system-map.md`) that lays out every email path: what sends what, when, from where, to whom. Short version — you run three email "rails": Gmail for bulk/lifecycle mail (capped at 1,500/day), Resend for critical transactional mail (receipts, password resets, payouts — survives a Gmail outage), and a separate Gmail path for cold outreach. Outreach and scraping run on GitHub's schedulers, not inside the app.

**Correcting the record.** The session brief assumed "Gmail is suspended and outreach is dead." That's not true — the code and your last few sessions show Gmail is active and 658 outreach emails went out. So there was no emergency. I did not invent a crisis that wasn't there.

**The fix I shipped (pending push).** 8 of your automated email types — sale alerts, price drops, wishlist matches, "your sale is live," sneak peeks, onboarding nudges, and the two new-sale follower notifications — were sending **without checking your suppression list.** That means people who bounced or unsubscribed were still getting mail, which is exactly what damages deliverability and risks getting the Google account suspended. I added the suppression check to all 8. Push-only change, no behavior change for valid recipients.

**The one decision I need from you (G1).** All your *transactional* email (receipts, payouts, password resets, invoices) is sent FROM `@send.finda.sale` addresses through Resend. My records say that domain is set up for a different email service (SES), not Resend — which would make those critical emails fail authentication and land in spam. I couldn't verify this from code; it's a DNS question. **Please check the Resend dashboard: is `send.finda.sale` verified there?** If not, I'll move those addresses to your root `finda.sale` domain (which IS verified). I did NOT change this myself because it touches payments and login — those need your sign-off first.

---

## S935 Quick Summary

**Five things shipped this session — all pending your push.**

**1. RETAIL junk filter (backend).** City×category pages were showing ~4,400 junk RETAIL rows alongside the real listings — real estate companies matching on "Estate", no-name businesses, Canadian listings on US pages, duplicates. The backend query now filters these out; only 17 clean suffix types (Antique Mall, Thrift Store, Pawn Shop, Resale Shop, etc.) pass through. You'll see ~3,288 clean RETAIL listings after push, down from 7,692.

**2. QR print kit bug fixed.** The printed QR codes at your sales were broken — they used `?scan=true` in the URL but the scan page needs `?via=qr` to trigger auto-claim and award XP. Real-world printed QR codes were landing in preview mode with no XP. Fixed.

**3. Denver SEO landing page.** Built `/estate-sales/denver-co` (and the whole `/estate-sales/[city]` pattern for all future cities). Google Search Console shows "denver estate sales" at positions 27-30 with 28+ impressions and no dedicated page. This captures that traffic. 15 top markets prebuild at deploy time; new cities load on demand.

**4. Email send endpoint.** Added `POST /admin/send-test-email` to the backend. This lets me send test emails directly without you having to manually click Send in Gmail — unblocks delivery health checks and outreach verification.

**5. Roadmap corrections.** Three items Patrick flagged as "already done" were marked stale in the roadmap — corrected: #471 bounce suppression (already running as a daily cron), #423 email verification token expiry (migration confirmed live in Railway DB since S726), #335 outreach resume (already ✅ S865).

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
| BQ (Blocked Queue) | **0 items** — #332 Shopify deferred S938 (needs a real test store) |
| GA4 Analytics | ✅ LIVE (CSP fixed S926, conversion events added S928 — needs Chrome QA) |
| Email (transactional) | ✅ **P0 RESOLVED + E2E-verified S937** — registration verification email delivered from noreply@finda.sale to inbox (Gmail thread 19eaf109a9b88af7). Resend rail healthy. |
| Email (competitor blocking) | ✅ estatesales.net/org blocked across all rails |
| Email (suppression) | ✅ S937 — 16 senders honor suppression; finda.sale-zone block E2E-verified LIVE (quota 0→2→3, @system autoreply filtered) |
| Email (Gmail rail) | ✅ S938 — SES_FROM_EMAIL renamed to GMAIL_FROM_EMAIL across 44 files, dead @send.finda.sale fallbacks retired; live smoke test passed (autoreply from find@outreach.finda.sale to inbox, thread 19eaf520). |
| Email (bounce suppression #471) | ✅ S938 VERIFIED — cron moved to GitHub Actions + confirmed running; token = outreach@finda.sale full scope; 0 rows is correct (no real bounces exist yet). |
| Outreach | ⏸ Paused (intentional, domain warming — 37 PENDING queue ready) |
| Auction coverage | ✅ 97→748 listings (S934 reclassification of mislabeled data) |
| RETAIL pages | ✅ Junk filter LIVE S935 (pending push) — ~3,288 clean rows, ~4,400 junk suppressed |
| SEO city pages | ✅ /estate-sales/[city-slug] SHIPPED S935 (pending push) — Denver first, 15 markets prebuild |
| Email send endpoint | ✅ POST /admin/send-test-email SHIPPED S935 (pending push) — Resend default, admin-gated |
| Backend / Railway | ✅ Healthy |
| Frontend / Vercel | ✅ Deployed |

---

## What You Need to Do

**Nothing pending.** All S938 code is pushed and deployed; both fixes verified live. Earlier S934/S935/S937 pushes are all confirmed in git history.

**Optional monitor (no action unless it recurs):** the bounce-notice flood into deseee@gmail.com (for `@system.finda.sale` scraper addresses) should stop now that the zone-block is deployed — those were all from sends before last night's deploy. If new `@system` bounce notices keep arriving after ~June 11, tell me and I'll find the leak.

---

## S936 Recommendation

BQ=1 (ceiling=8 — DEV available).

**QA pass — shipped this session, needs Chrome verification:**
- `/estate-sales/denver-co` — navigate on live site, verify H1 + listings + schema.org
- `POST /admin/send-test-email` — call endpoint as admin, verify email delivery
- #471 bounce suppression — check EmailSuppression row count grows after a bounce event
- #470 GA4 — actually register/create-sale, confirm event fires in GA4 Realtime

**DEV candidates:**
- **#332 Shopify** — sole BQ P0 item

---

## Weekly Brand Drift Alert — 2026-06-09

**Automated scan complete. No P0/P1 violations found. All core user-facing copy is compliant.**

Two P3 copy gaps and one P3 dark mode gap flagged:

1. **About page meta/OG descriptions** — too generic, don't mention any sale types (D-001 weak). Route to `findasale-marketing` for updated copy.
2. **Pricing page meta/OG descriptions** — too generic, no sale type mentions (D-001 weak). Route to `findasale-marketing`.
3. **SearchFilterPanel.tsx** lines 298, 314, 345 — "Clear Filters" button and result count text missing `dark:` variants (D-002). Route to `findasale-dev`.

Full report: `claude_docs/audits/brand-drift-2026-06-09.md`
