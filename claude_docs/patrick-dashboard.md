# Patrick's Dashboard — June 10, 2026 (Updated: S940)

**Generated:** Wednesday, June 10, 2026 (S940 — monitoring harden + Print Kit fix + CI fix + Chrome QA)

---

## S940 Quick Summary

**Two bug fixes shipped, the monitoring blind spot is permanently closed, and 3 features got Chrome-verified. Push block below.**

**1. Fixed Print Kit PDF downloads (all tiers were getting 401 errors).** Your Print Kit page was using an old way of reading your login token — one that stopped working when we switched to the more secure "cookie-based" login several sessions ago. The result: every PDF export button (Yard Sign, etc.) failed with a silent auth error. Fixed — the page now reads your login the right way, same as every other page. This was a P1 bug affecting every organizer on every tier.

**2. Closed the monitoring blind spot that let outreach go dark for 5 days.** The daily health check that scans your 123 workflows for silent failures had a gap: if a workflow was *manually disabled*, it was completely invisible to the sweep (it never shows a red X, so Step 1 wouldn't catch it either). That's exactly how `pipeline-outreach-emails` went dark June 5 and nobody noticed for 5 days. Fixed: the sweep now specifically checks for unexpectedly disabled workflows and alerts immediately — unless they're on the known-OK list (the Google Places scraper and the NAA scraper, both intentionally off).

**3. Outreach cron may need one more push to wake up.** Re-enabling the workflow in the UI *should* restart the cron, but GitHub sometimes needs a code push to the workflow file before its scheduler re-registers it. I've added a trivial comment to that file in your push block — just push and it'll fire on schedule.

**4. Two GitHub Actions files updated before a June 16 deadline.** Two workflow files were using an older version of a GitHub helper action (Node 16, deprecated). Updated to the current version before GitHub forces the change. Everything else in your 123-workflow fleet was already up to date.

**5. Verified 3 features in Chrome:**
- **Watermark gating** — confirmed PRO tier sees a locked "upgrade to get this" message, and TEAMS tier has the live checkbox to remove watermarks ✅
- **Subscription label** — confirmed your TEAMS tier shows "TEAMS ($79/mo)" correctly, not "PRO" ✅
- **OAuth login buttons** — confirmed Google and Facebook "continue with" buttons appear on the login page, and the "Linked Accounts" section shows correctly in settings ✅

---

## S939 Quick Summary

**Your daily email health check turned into a deliverability cleanup. Good news first: the scary alarm was a false alarm. Everything below is shipped and live — nothing for you to do.**

**1. The "Gmail is broken" alert was NOT real.** A monitoring job was testing your Gmail token the wrong way — it asked for permission to *read* your mailbox, but your token is correctly set up to only *send* (which is safer). So the test failed every time and screamed "pipeline dead," even though your email sending was working perfectly the whole time. I confirmed sends were going out fine that same morning, then fixed the health check to test the token the right way. You do **not** need to re-authorize anything.

**2. Plugged the leak that was causing the bounce flood.** One of your outreach jobs was sending email through a side door that skipped your safety filter — which meant it could fire emails at your own internal "scraper" placeholder addresses, and every one of those bounced and piled up against your forwarding limit. I added the same filter to that job, so those junk addresses are now skipped before any send. This was the real source of the bounce noise.

**3. Got your bounce/complaint tracking actually working — it was broken in four separate ways.** The Resend webhook (the thing that's supposed to automatically catch when someone's email bounces or they mark you as spam, and stop emailing them) had never functioned. It was missing a security key, was looking for the wrong event name, was being blocked by a security check, and was reading the data in the wrong shape. I fixed all four and then tested it end-to-end against the live system with real Resend data: a complaint correctly added the person to your do-not-email list, a hard bounce got blocked, and a successful delivery cleared the counter. It works now.

**4. Made your bounce handling match how the big email providers do it.** Before, a single soft bounce (a temporary "try again later") would block someone from your marketing emails forever — far too aggressive. Now it follows the industry standard: it takes 5 consecutive soft bounces to suppress someone, and a single successful delivery resets the count to zero. Nobody in your current list is affected (you have zero soft-bounce-only suppressions). The database change is applied to Railway.

**5. Created the webhook on the Resend side too** (subscribed to bounces, complaints, suppressions, and failures), so the loop is fully connected end to end.

---

## S939 — FB Events, Monitoring & Outreach (same session)

**The second half of this session rebuilt how we find Facebook-event sales, added monitoring that catches "silently stopped" pipelines, and caught one that had stopped. All shipped and live.**

**1. Rebuilt the Facebook Events scraper around a geo-accurate search engine.** The old search returned the same national results for every city, so flea markets and auctions were getting crowded out and barely any landed. I switched the primary engine to **Searlo** (geo-accurate — it actually returns results *in* the city you ask for, ~90–100% on-target), with the old engines kept as automatic backups. I also fixed a bug where the scraper was reading the street number out of a Facebook URL as if it were the event ID (which was corrupting de-duplication), and fixed the flea-market classifier. I expanded coverage from 93 to **301 metros** and flipped the run from weekly to daily (spread across the week so each day handles a chunk). Verified live: results are now geo-accurate and flea-market events are landing (they were at zero). **One heads-up:** the Searlo key is on the free tier — roughly a 17-day runway and a speed cap. A $3.99+ pack lifts the cap and removes the timing pressure. Your call when you want to do it.

**2. Built monitoring that catches the "looks green but actually stopped" failure.** Most of your scrapers fire a job and report success immediately — even if the actual work silently did nothing. I built a new health endpoint that checks the *data freshness* of every pipeline (is it actually producing records?), and extended your daily health check to (a) sweep every workflow for silent stoppages, (b) flag any pipeline that's "green but empty," and (c) deep-check the FB Events run specifically. Your repo has 123 automated workflows total — the monitor now covers them.

**3. Caught a pipeline that had silently died — your cold outreach.** While building the monitoring, I found that the `pipeline-outreach-emails` workflow had been **manually disabled since June 5** — meaning cold outreach had been completely dead for about 5 days (zero sends, 42 leads stuck in the queue, no backup running). I re-enabled it and confirmed outreach is switched on in Railway; it'll resume on its next 4-hour cycle. This is exactly the kind of silent failure the new monitoring is designed to catch going forward.

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
| Email (bounce suppression #471) | ✅ S939 — Resend webhook now ingests bounces/complaints/suppressions, LIVE e2e-verified (was broken 4 ways: missing secret, wrong event name, CSRF block, raw-body, payload extraction — all fixed). Gmail-inbox cron also live (S938). |
| Email (soft-bounce policy #474) | ✅ S939 — consecutive soft-bounce threshold (5, reset on delivery); email.suppressed hard-blocks; migration applied to Railway. Was one-strike-blocks-forever. |
| Email (Gmail health alarm) | ✅ S939 — false-alarm "OAuth token BROKEN" fixed; cron now probes via getAccessToken (send-scope only). Token works; no re-auth needed. |
| FB Events scraper | ✅ **S939 — Searlo wired as primary geo-accurate engine** (93→301 metros, weekly→daily, flea/auction now landing). Brave rejected (geo-blind). FREE-tier key: ~17-day runway + 10/min cap — $3.99+ pack lifts it. |
| Pipeline monitoring | ✅ **S939 — silent-failure detection live.** GET /api/internal/pipeline-health (data-freshness per pipeline) + daily health check extended (staleness sweep, green-but-empty detector, FB Events deep-check). 123 workflows covered. |
| Outreach (cold) | ✅ **S939 P0 FIXED — was silently DEAD ~5 days.** `pipeline-outreach-emails` workflow found manually disabled since June 5 (0 sends, 42 leads stalled). Re-enabled; OUTREACH_ENABLED=true confirmed. Resumes next 4-hour cron. |
| Auction coverage | ✅ 97→748 listings (S934 reclassification of mislabeled data) |
| RETAIL pages | ✅ Junk filter LIVE S935 (pending push) — ~3,288 clean rows, ~4,400 junk suppressed |
| SEO city pages | ✅ /estate-sales/[city-slug] SHIPPED S935 (pending push) — Denver first, 15 markets prebuild |
| Email send endpoint | ✅ POST /admin/send-test-email SHIPPED S935 (pending push) — Resend default, admin-gated |
| Backend / Railway | ✅ Healthy |
| Frontend / Vercel | ✅ Deployed |

---

## What You Need to Do

**One optional decision: the Searlo upgrade.** All S939 code is pushed, deployed, and verified live — the deliverability fixes (soft-bounce migration applied, RESEND_WEBHOOK_SECRET set, Resend dashboard webhook created), the FB Events overhaul, and the pipeline-health monitoring. The only open item is whether to buy a **$3.99+ Searlo pack** for the FB Events scraper: the free key gives ~17 days of runway and a speed cap; a paid pack lifts the cap and removes the daily-runtime pressure. No rush — the monitor will warn if the runway runs low. When you do, also bump the `SEARLO_RPM` repo Variable to the new limit. Earlier S934–S938 pushes are all confirmed in git history.

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
