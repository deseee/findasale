# FindA.Sale — Organizer Acquisition Playbook (v2)

**Owner:** Patrick
**Supersedes:** `Organizer_Acquisition_Playbook.md` (v12 — S486)
**What changed from v1:** Supply-first strategy stated explicitly. High-lift Patrick-manual tactics demoted to opportunistic. Influencer tier reframed from promotional to advisory. Weekly time budget capped. Expansion markets re-ordered by lift.
**What this is:** The machine that puts FindA.Sale in front of organizers who need it. Designed to run while Patrick is working on the product — not instead of it.

---

## Strategy (Read First)

**Supply before demand.** FindA.Sale is a marketplace, but the marketplace side is the byproduct — not the acquisition engine. Organizers bring their own buyers to every sale (their regulars, their Facebook following, their Craigslist traffic). Our job is to make running a sale on FindA.Sale so much better than running it on spreadsheets-and-Venmo that organizers stop using alternatives. Once we have organizers listing items, shoppers find the inventory through Google and through the organizer's existing channels. Demand follows supply in this category.

**The moat is the workflow, not the channel.** Time-savings (one photo → full listing), in-person POS with no hardware, settlement wizard, eBay push for leftovers, and the Explorer's Guild retention loop on the shopper side — these compound into switching cost. An organizer who has run three sales on FindA.Sale has a brand kit, a buyer list, a payout history, and muscle memory. Churn drops as tenure grows.

**Low-lift execution is non-negotiable.** Patrick is a solo non-technical founder. Any tactic that needs 5+ hours of Patrick's week and doesn't compound is a bad trade. The spine of this playbook is: automated outbound (RVM + email), automated nurture (12 webhooks), product-driven sharing (organizers post their own sales), and compounding influencer advisory relationships (one conversation each, long tail of credibility). Field-rep work is optional fuel, not the engine.

**Weekly Patrick time budget:** 3 hours total on acquisition — 1 hour reviewing metrics and killing/doubling channels, 1 hour on advisor outreach (one message per day from `advisory-outreach-drafts.md`), 1 hour on whatever opportunity shows up. Anything above that means something is wrong.

---

## What You're Selling

Most organizers manage their sales with a phone camera, a spreadsheet, handwritten price stickers, Venmo, and a Facebook post. FindA.Sale replaces all of it with one app that runs on the phone they already have. No hardware. No barcode scanners. No card readers. Shoppers pay on their own phone.

**Every organizer gets (SIMPLE — free):**
- Photo → auto-title, auto-description, auto-price, auto-condition grade, auto-category. One photo, complete listing.
- QR code yard signs and item labels — print from the app, shoppers scan to browse and buy
- In-person POS — shoppers scan a QR, pay on their phone, organizer gets the money
- Item holds and reservations, flash deals with countdown timers
- Settlement wizard — commission calc, expense tracker, client payout report
- Reviews, messaging, sale calendar, public sale detail pages
- Print-to-QR sign kit, sale waitlist, RSVP
- Auction mechanics — reserve price, auto-bid, countdown, Stripe checkout for winner
- Public listing on FindA.Sale — Google-indexed, map view, city pages, neighborhood pages
- Social post generator — TikTok, Instagram, Facebook, Pinterest, Threads templates

**PRO ($29/month) adds:** eBay push, Flip Report, Auto-Markdown, Brand Kit, Batch operations, CSV/JSON exports, Verified badge, Seller Performance Dashboard, Photo capture coaching, Voice-to-Tag, Insights dashboard.

**TEAMS ($79/month) adds:** Multi-user workspace, Command Center, Flea Market Events (50–200 vendors), unlimited concurrent sales, 5 team seats, API access, Charity Close, Brand Kit expansion.

**Shopper side (free):** Explorer's Guild XP system with 5 ranks, Hunt Pass ($4.99/mo), Treasure Trails, Haul Posts, wishlists, referral rewards, Rare Finds feed, Featured Boost, coupon generation.

**The pitch isn't "we have features." The pitch is: one photo replaces your entire setup, shoppers pay on their phone, and whatever doesn't sell pushes to eBay without re-entering anything.**

---

## The Offer

Core product is free forever. SIMPLE tier gives every organizer photo-to-listing, QR signs, in-person POS, settlement wizard, auction mechanics, public listing, and social post generator. No credit card. No time limit. One concurrent sale, 50 items.

**First sale gets full PRO features automatically.** Every new organizer's first sale runs with PRO unlocked — eBay push, Smart Pricing, Flip Report, Insights, Brand Kit, 500 items. After that sale ends, they drop to SIMPLE unless they subscribe.

**Upgrade paths post-first-sale:**
- **PRO** — $29/month for organizers running regular sales (2+/month)
- **À la carte** — $9.99/sale for organizers who run 2–4 sales per year
- **TEAMS** — $79/month for staff, multiple concurrent sales, flea market events

**Guarantee (PRO/TEAMS only):** "If you don't push at least 5 items to eBay faster than you would manually in your first month on PRO, refund."

SIMPLE is the trial — it never expires. PRO sells itself when the organizer hits the natural friction points.

---

## The Landing Page

`finda.sale/video` — one page, one job.

38-second animated demo showing the full workflow. One real organizer quote with a specific number ("Set up a 180-item sale in 2 hours — used to take me all day"). One CTA: "Start your first sale." Source attribution on every inbound link (`?src=rvm`, `?src=email1`, `?src=fb`, `?src=partner_[name]`). Capture the `?src=` param at signup → store as `acquisitionSource` on Organizer record → feeds admin funnel view.

---

## The RVM Script — 25 Seconds

**Cold-start version** (before 10 organizers in market):

> "Hey — this is Patrick. I built an app that does something I think you'd find interesting. You photograph your items and the app writes the listing for you — title, description, price, category, all of it. Shoppers pay right from their phone — no cash box, no card reader. The organizers using it are finishing setup in a couple hours instead of a full day. It's free — no trial, no credit card. There's a quick video at finda.sale/video. Take care."

**Post-tipping version** (10+ organizers in market):

> "Hey — this is Patrick from FindA.Sale. We've got [X] organizers running sales in [city] right now and hundreds of shoppers browsing every week. Your competitors are getting buyers through us. The app is free — you photograph your items and the listing writes itself. Check it out at finda.sale/video."

---

## Emails — Three Total

**Email 1 — Day 1. Subject: The setup day problem**
> [Name] — I built an app that turns one photo into a complete listing — title, description, price, condition, category. No typing. Shoppers scan a QR code and pay on their phone — no cash counting, no card readers. The organizers using it are finishing setup in under 2 hours instead of 6. It's free. No trial, no credit card. Your first sale gets the full toolkit. finda.sale/video?src=email1 — Patrick

**Email 2 — Day 4. Subject: The part most organizers miss**
> Quick follow-up — two things that surprise people: The settlement report (commission calc, expense tracking, client payout PDF — done in 2 minutes, free every sale) and eBay push (whatever didn't sell pushes in one tap — $29/month or $9.99 for a single sale if you only run a few a year). finda.sale/video?src=email2

**Email 3 — Day 9. Subject: Last one**
> I know I've sent a couple messages. If the timing's wrong or you've got something that works — no hard feelings. But if you're still spending a full day on setup before every sale, I'd like you to try it once. It's free — just upload a photo and see what happens. finda.sale/video?src=email3 — or just reply here. — Patrick

---

## Callback Script — Four Objections

**"I already have a system."**
> "Most people do — usually spreadsheets, phone photos, and Venmo. I'm not asking you to throw it away. The question is how long setup takes you. If it's more than a couple hours, this cuts it in half. Try it on one sale and see."

**"I'm not a tech person."**
> "If you can take a photo, you can use it. You point your phone at the item and the app does the rest. I'll walk you through your first sale personally if you want."

**"How much?"**
> "The core app is free — photo listings, QR checkout, settlement reports. If you want eBay push, Smart Pricing, and the Flip Report, that's $29/month. Or if you only run a few sales a year, $9.99 per sale gets you everything PRO has for that one sale. Most organizers make the $29 back on leftover inventory from one eBay push."

**"How is it different from EstateSales.NET?"**
> "EstateSales.NET is a directory — you pay $99 per listing and that's it. FindA.Sale gives you the directory listing for free and adds the whole workflow: auto-tagging, in-person payments, QR checkout, eBay push, settlement reports. For $29/month instead of $99 per listing. And we're not just for estate sales — the same tools work for yard sales, auctions, flea markets, and consignment."

---

## Channels — Autopilot vs Opportunistic

### Autopilot (the spine of the plan)

These run with minimal Patrick attention once set up. Check metrics weekly; kill or double down per §Metrics.

**Outscraper → RVM + Email — the primary machine.**
Scrape Google Maps for estate sale company / estate sale organizer / estate liquidator / auction house / consignment shop / flea market / yard sale organizer / garage sale organizer. Grand Rapids + 5 Michigan cities first. ~$10 per 5k records. Drop RVMs via Drop Cowboy ($0.004 each) and run the 3-email sequence through Instantly.ai ($47/month) against the same list. GroupBoss.io ($20/month) passively captures emails from Facebook-group join questions. Month-one cost to reach 5,000+ organizers: ~$100. Patrick touch: scrape once, upload, walk away. Review weekly metrics.

**Customer-driven sharing — the organic engine.**
Once the dev items below ship, this runs without Patrick: one-tap "share my sale" from the organizer dashboard, post-sale "share your results" prompt, organizer-to-organizer referral (unique link, free month credit per signup sticking 30 days). The social post generator and Haul Posts already exist — the dev work wires up the prompts and incentives so organizers post their own sales as a natural part of the workflow.

**Post-signup automation — the nurture engine.**
12 webhook-triggered emails (see §Post-Signup Automation). Resend-powered. Context-aware (uses inventory count, unsold %, value). Runs for every signup without Patrick's hand.

**Facebook retargeting — the pixel engine.**
$20–30/day Facebook ad to `finda.sale/video`, retargeting pixel fires on landing-page visits, keeps FindA.Sale in the feed of anyone who clicked an email or heard an RVM. Kill if CPA > $50 after $60 spend. No creative work beyond the initial ad.

### Opportunistic (only when it falls in Patrick's lap)

These produce signal but cost Patrick's hours. Do them if they're easy and local; don't force them. None of these are blockers for the plan working.

**Show up at sales you were going to attend anyway.** If Patrick is at a Grand Rapids estate sale as a shopper, introduce yourself. Collect a testimonial. Don't carve out Saturday mornings for this.

**Local ASEL chapter membership.** Join, show up to a meeting if convenient, don't sponsor quarterly events until a testimonial pipeline exists to justify the spend. The original v1 plan to sponsor a $200–500 quarterly event is demoted — revisit after 10 active Grand Rapids organizers.

**Facebook community value posts.** If Patrick already reads the estate-sale groups, post one a week. If not, skip. This is the kind of task that only compounds if it's natural; when forced it produces low-quality content and low-quality reach.

### Deferred — Do Not Work On Yet

These are in v1 but removed from active execution until pre-conditions are met.

- **Probate attorney outreach** — requires Multi-Consignor Settlement shipped. Put on roadmap; do not pitch until that feature exists.
- **Caring Transitions franchise pitch** — 300-franchise network, 6–12 month relationship timeline even in the success case. Defer until TEAMS has ≥10 paying customers and a working demo that survives franchise-level scrutiny.
- **Estate-sale supply-vendor co-marketing** — reaches verified buyers but requires a relationship investment and creative production. Defer until MRR justifies the lift.

---

## Partners — Incentive-Driven, Not Relationship-Driven

**Facebook group admins and ASEL chapter leaders.** Incentive: free TEAMS account ($79/month value) + $10/month affiliate credit per organizer signup sticking 30 days, tracked via unique partner referral link (`?src=partner_[name]`). One email to each admin, one follow-up. No dinners, no calls unless they ask. Patrick time per partner: ~15 minutes end-to-end.

**Stripe App Marketplace.** Free listing. One-time application. Puts the product in front of merchants searching for operational tools. Patrick time: ~1 hour to submit.

Everything else from the v1 partner list is deferred.

---

## Influencers — Advisory First, Promotional Never

**See `claude_docs/marketing/advisory-outreach-drafts.md` for 17 drafted messages.**

The framing is: ask operators, industry voices, and resellers to critique the product — not to promote it. One outreach message per day, Patrick sends from his inbox/LinkedIn. Any promotional mention that follows is organic and earned, not asked for. This replaces v1's "Tier 1 influencer affiliate" section entirely — affiliate deals attached to creator outreach turn the ask into a sales pitch and destroy the critique-honest dynamic.

**Time cost:** 1 message/day × 5 days/week = 15–20 minutes/week. A yes converts to one 30-minute call. A no costs nothing. The list compounds into an advisory bench over 6–12 months.

**Resellers on the affiliate program track (separate from the advisory list):** if a creator is already a FindA.Sale organizer or shopper and asks about affiliate terms, they're routed into the existing Affiliate Program (tier-matched commission per affiliate-innovation-review-S550). Advisory relationships are not commercial; affiliate relationships are. Keep them cleanly separated.

---

## The Flywheel

1. Organizers list sales → sales appear in Google ("estate sales near me," "yard sales near me," "flea markets near me")
2. Shoppers find sales → attend → spend → earn XP → climb ranks → get hooked on the Explorer's Guild loop
3. Organizers see FindA.Sale-sourced traffic in their analytics → tell other organizers
4. New organizers join → more listings → more Google coverage → more shoppers

**Tipping point:** 10–15 active organizers in a city. At that density, an organizer NOT on FindA.Sale is leaving buyers on the table.

**"Active organizer" definition (for this playbook):** ≥1 sale published AND ≥20 items listed AND ≥1 sale in the last 90 days. This gets instrumented in the admin dashboard so tipping-point math is measurable, not felt.

**Shopper retention compounds the flywheel.** Explorer's Guild XP, ranks, Hunt Pass, Treasure Trails — a shopper at Ranger rank has invested real time and isn't switching apps. Every retained shopper is another reason for an organizer to list on FindA.Sale.

---

## Expansion Markets — Ordered by Lift

Sequenced so Patrick is not running four pitches simultaneously. Do not open market N+1 until market N is throwing signal.

**1. Estate sales (current focus).** Working Outscraper list. SIMPLE covers the base case. PRO eBay push is the hook.

**2. Garage sales, church rummage, nonprofits.** Works right now, no product changes. Charity Close with tax-receipt PDF already built. Low-hanging — can scrape "rummage sale [city]" + "fundraiser sale [city]" and run the same RVM/email machine. "FindA.Sale for nonprofits" is a press angle no other software vendor occupies.

**3. Flea markets.** TEAMS Flea Market Events feature handles vendor check-in, per-vendor POS, end-of-day settlement. No current software does this in one mobile tool. One flea-market chain with 5 locations = $395/month. Scrape: "flea market [city]," "outdoor market [city]." Don't open until ≥5 paying PRO organizers.

**4. Antique malls.** 40–200 dealers per mall. One owner adopts → 40 accounts from one conversation. Requires consignor tracking ship (already schema-pre-wired). Don't open until that ships.

**5. Consignment and thrift shops.** $61B US secondhand market. Current tools (ThriftCart, SimpleConsign, ConsignCloud) charge $99–359/month and require hardware. Gap to close first: full consignor tracking feature parity with the incumbents. Don't open until that ships and is verified working.

**6. Corporate office liquidations.** Same problem, bigger volume, higher pricing tolerance. Defer until inbound volume forces the conversation.

---

## Post-Signup Automation

These fire without Patrick after the backend webhooks are built (~12 events, ~300 lines, one dev session).

**Activation sequence (get them to first sale):**

| Trigger | Action | Tool |
|---|---|---|
| Signs up | Welcome email: "Your first sale gets full PRO features — here's a 60-second walkthrough" | Resend |
| Day 1, no photo uploaded | "Upload your first item — one photo, we handle the rest" | Resend |
| 5+ photos uploaded, no sale created | Context-aware: "You've got [N] [top category] items ready. Create a sale and they go live in 2 minutes." | Resend |
| Sale created, no items published | "Your sale is set up — publish [N] items to make it live" | Resend |
| First sale published | "Your sale is live. Here's your QR sign kit — print these for foot traffic." | Resend |

**Conversion sequence (SIMPLE → PRO or à la carte):**

| Trigger | Action | Tool |
|---|---|---|
| First sale ends (PRO features revert) | "Your first sale used PRO features. Here's what changes now — and how to keep them ($29/mo or $9.99 next sale)." | Resend |
| Hits 40 items (approaching SIMPLE limit) | "You've listed [N] items — 10 away from the limit. PRO unlocks unlimited." | Resend |
| Hits 50 items (SIMPLE ceiling) | "You've hit 50 items. Unlock unlimited: $29/mo or $9.99 for your next sale." | Resend |
| Sale ends with >15% unsold inventory | Context-aware: "You had [N] items left over worth ~$[X]. eBay push (PRO) lists them in one tap." | Resend |
| Tries to create 2nd concurrent sale | "SIMPLE supports 1 active sale. PRO gives you 3 — or $9.99 unlocks this one sale." | Resend |

**Retention + expansion sequence:**

| Trigger | Action | Tool |
|---|---|---|
| First transaction complete | 24h delay → referral invite: "Know another organizer? They get their first sale on PRO free. You get a free month." | Resend |
| 2+ active sales in a month | TEAMS pitch: "You're running multiple sales — workspace + staff roles might save you time." | Resend |
| No login 7 days (active organizer) | "Is something not working? Reply — I'll sort it out." from Patrick's address | Resend |
| PRO canceled | 14 days → "If something wasn't right, I'd like to know. Reply — not a robot." | Resend |
| Weekly (active organizers) | "Your listings got [X] views this week. [Top item] got [Y] saves." + contextual upsell if views spike | Resend |

---

## Metrics — Kill or Double Down

| Metric | Floor (kill below) | Target | Ceiling (double down) | Source |
|---|---|---|---|---|
| RVM callback rate | <0.5% | 1–3% | >3% | Drop Cowboy |
| Email open rate | <15% | 25–35% | >40% | Instantly.ai |
| Email reply rate | <1% | 3–5% | >5% | Instantly.ai |
| Facebook ad CPA (signup) | >$50 | $15–30 | <$10 | Meta Ads |
| Signup → first photo | <30% | 50–60% | >70% | Admin dashboard |
| First photo → first sale published | <20% | 35–50% | >50% | Admin dashboard |
| First sale → PRO/à-la-carte conversion | <10% | 20–30% | >30% | Admin dashboard |
| Monthly churn (PRO) | >10% | 3–5% | <3% | Stripe |
| Organizer referral rate | <5% | 10–15% | >20% | Admin dashboard |
| Cost per activated organizer | >$80 | $20–40 | <$15 | Calculated |

**Review cadence:** 1 hour every Monday morning. Metrics that hit floor get killed that week. Metrics that hit ceiling get 2x budget. Everything in the middle keeps running.

**Honest note on the targets:** these are aspirational — vertical SMB SaaS at $29–79 ACV typically lands at $60–200 CAC on cold channels, not $20–40. If real CAC comes in higher, the answer is product-led growth (customer sharing, referrals, SEO from organic listings), not more channel spend. The metrics table is a diagnostic tool, not a promise.

---

## Execution Stack

Guru attributions preserved. Ordered so dev ships first, pipeline turns on without waiting, and relationship work only runs when easy.

### Build the machine (dev work — findasale-dev ships these)

1. **Ship "first sale free on PRO" offer logic.** `isFirstSaleFree` flag on Organizer model. First sale auto-unlocks PRO features. After sale ends, revert to SIMPLE. ~80 lines backend + 20 lines frontend. *Dev session: ~half day.*
2. **Ship `acquisitionSource` tracking.** Capture `?src=` at signup, store on Organizer record. Admin dashboard panel: signup funnel by source. *Dev session: ~half day.*
3. **Ship customer sharing tools.** One-tap "share my sale" on organizer dashboard, post-sale "share your results" prompt, organizer-to-organizer referral (free month credit per 30-day signup). *Dev session: ~1 day.*
4. **Ship post-signup automation.** 12 webhook events, Resend integration, context-aware triggers (inventory count, category, unsold %, value). ~300 lines backend. *Dev session: ~1 day.*
5. **Ship active-organizer instrumentation.** Field on Organizer model calculated from (published sales + items listed + last-90-day activity). Admin dashboard counts active organizers per city for tipping-point visibility. *Dev session: ~half day.*

Patrick touch on dev work: zero. Dispatched to findasale-dev, shipped as a batch, pushed by Patrick.

### Turn on the pipeline (Patrick actions — ~4 hours one-time)

6. **Build `finda.sale/video` landing page** — deploy `organizer-video-ad.html` to Vercel. `?src=` wired. ~30 min.
7. **Run first Outscraper scrape** — 6 Michigan cities, 8 search terms. ~$10 per 5k. Dedupe, verify, expect 60–70% yield. ~1 hour.
8. **Set up Instantly.ai.** Warm domain (start 2 weeks before first send). Load 3-email sequence. Connect to cleaned list. ~1 hour setup.
9. **Drop first 5,000 RVMs** via Drop Cowboy. Cold-start script. M–Th 10am–2pm local. ~30 min.
10. **Run $20–30 Facebook ad** to `finda.sale/video`. Kill if CPA > $50 after $60 spend. ~30 min to set up, 5 min/week to monitor.
11. **Set up GroupBoss.io** for top 10 Facebook organizer groups. ~30 min.

### Relationship work — ≤ 1 hour per week

12. **Advisory outreach.** One message per day from `advisory-outreach-drafts.md`. 15–20 min/week.
13. **Partner outreach.** One email to each Facebook-group admin or ASEL chapter leader on a single afternoon. No ongoing nurture unless they engage. ~2 hours total, once.
14. **Opportunistic ASEL + local presence.** Only if convenient.

### Scale (when signal justifies)

15. **Switch to post-tipping RVM/email** once 10 active Grand Rapids organizers.
16. **"Grand Rapids Sale Weekend" push** at 10 active. Facebook ad budget pivots to retargeting.
17. **Open market 2** (garage sales + nonprofits) once Grand Rapids MRR is stable.
18. **Apply: Stripe App Marketplace.** Free listing. ~1 hour.
19. **Open later markets** (flea markets, antique malls, consignment) per §Expansion Markets pre-conditions.

---

## What Patrick Actually Does Each Week

**Monday — 1 hour.** Metrics review. Kill anything at floor, double anything at ceiling. Read this week's inbound replies from RVMs and emails. Triage any "yes" into a 30-minute call slot within the week.

**Tuesday–Friday — 20 minutes/day.** One advisory outreach message. Check the admin dashboard for new signups. Respond to any inbound organizer support.

**Saturday — optional.** If at a sale as a shopper anyway, introduce yourself to the organizer. Don't plan around it.

**Total:** ~3 hours/week on acquisition. Anything above means something is broken — the machine isn't self-running, or a channel is producing signal that deserves a real investment decision, or Patrick is doing work that findasale-dev should be automating.

---

*Playbook v2 — session [current]. Supersedes v1 (v12 — S486). Supply-first strategy stated explicitly. High-lift tactics (show-up-at-sales, ASEL event sponsorship, probate attorneys, supply-vendor co-marketing, Caring Transitions pitch) demoted to opportunistic or deferred. Tier-1 influencer affiliate replaced with advisory outreach path (see `claude_docs/marketing/advisory-outreach-drafts.md`). Weekly Patrick time budget capped at 3 hours. Expansion markets reordered by lift. Active-organizer definition made measurable. Honest CAC caveat added.*
