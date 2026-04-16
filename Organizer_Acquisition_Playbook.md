# FindA.Sale — Organizer Acquisition Playbook

**Owner:** Patrick
**What this is:** The machine that puts FindA.Sale in front of organizers who need it. Not a strategy doc. Not a business plan. An execution list with the actual scripts and the actual product behind them.

---

## What You're Selling

Most organizers manage their sales with a phone camera, a spreadsheet, handwritten price stickers, Venmo, and a Facebook post. FindA.Sale replaces all of it with one app that runs on the phone they already have. No hardware. No barcode scanners. No card readers. Shoppers pay on their own phone.

Here's what's actually built and working:

**Every organizer gets (SIMPLE — free):**
- Photo → auto-title, auto-description, auto-price, auto-condition grade, auto-category. One photo, complete listing.
- QR code yard signs and item labels — print from the app, shoppers scan to browse and buy
- In-person POS — shoppers scan a QR, pay on their phone, organizer gets the money
- Item holds and reservations — shoppers claim items remotely, rank-based hold timers
- Flash deals with countdown timers
- Settlement wizard — commission calc, expense tracker, client payout report
- Reviews, messaging, sale calendar, public sale detail pages
- Print-to-QR sign kit — 5 templates (yard sign, directional, table tent, hang tag, full kit)
- Sale waitlist and RSVP for shoppers
- Auction mechanics — reserve price, auto-bid, countdown, winner gets Stripe checkout link
- Public listing on FindA.Sale — Google-indexed, map view, city pages, neighborhood pages
- Social post generator — TikTok, Instagram, Facebook, Pinterest, Threads templates with photos

**PRO ($29/month) adds:**
- eBay push — after the sale, unsold items go to eBay in one tap with photos, title, description, price, condition, category, shipping policy already filled in. Weight-tier routing for 22+ shipping policies. Draft mode. Description templates.
- Flip Report — item resale potential scoring
- Auto-Markdown / Smart Clearance — automatic price reductions on a schedule you set
- Brand Kit — colors, logo, auto-propagation to all templates and exports
- Batch operations — bulk price, status, category, tag, photo updates
- CSV/JSON exports, payout PDF, inventory syndication
- Verified Organizer badge
- Seller Performance Dashboard — per-sale analytics and insights
- Photo capture coaching — lighting detection, shot sequence guidance, confidence scoring
- Voice-to-Tag — speak the description, app writes the listing
- Insights dashboard — lifetime KPIs and per-sale breakdown

**TEAMS ($79/month) adds:**
- Multi-user workspace — invite staff, assign roles, manage permissions
- Command Center — live/upcoming/ended sale tabs, weather alerts, engagement metrics
- Flea Market Events — vendor check-in, per-vendor inventory, per-vendor POS, end-of-day vendor settlement. Handles 50–200 vendors simultaneously.
- Unlimited concurrent sales (SIMPLE gets 1, PRO gets 3)
- 5 team members included, additional seats $20/month each
- API access and webhooks — connect FindA.Sale to your existing tools
- Charity Close with tax receipt PDF generation
- Organizer Brand Kit expansion — business cards, letterhead, social headers, branded signs
- Coverage gap warnings and inactivity monitoring inside Command Center
- Everything in PRO

**Shopper side (free — this is your organic growth engine):**
- Explorer's Guild — XP system with 5 ranks (Initiate → Scout → Ranger → Sage → Grandmaster), each rank unlocks longer hold times and priority access
- Hunt Pass ($4.99/month) — 1.5x XP, early access to rare/legendary items, daily XP cap boost, golden trophy cosmetic
- Treasure Trails — multi-sale routes shoppers follow for XP
- Haul Posts — shopper UGC, social proof
- Collector Passport, wishlists, saved searches with alerts, favorites
- Referral rewards — shoppers invite friends, earn XP
- Rare Finds feed — Hunt Pass subscribers see rare items hours before everyone else
- Featured Boost — organizers or shoppers spend XP to boost sale visibility on the map
- Coupon generation from XP (100/150/500 XP tiers)

**The pitch isn't "we have features." The pitch is: one photo replaces your entire setup process, shoppers pay on their phone, and whatever doesn't sell pushes to eBay without re-entering anything.**

---

## The Offer

(Hormozi: value stacking at the friction point. Brunson: one clear offer in every funnel. Nir Eyal: the hook is the product loop, not the trial window.)

**Core product is free forever.** SIMPLE tier gives every organizer photo-to-listing, QR signs, in-person POS, settlement wizard, auction mechanics, public listing, and social post generator. No credit card. No time limit. No catch. One concurrent sale, 50 items.

**First sale gets full PRO features automatically.** Every new organizer's first sale runs with PRO unlocked — eBay push, Smart Pricing, Virtual Queue, Flip Report, Insights, Brand Kit, 500 items, 10 photos per item. After that sale ends, they drop to SIMPLE unless they subscribe. They feel the downgrade. (Hormozi: let them experience the ceiling removal, then put it back.)

**The upgrade paths (post-first-sale):**
- PRO at $29/month for organizers running regular sales (2+ per month)
- À la carte at $9.99/sale for organizers who run 2–4 sales per year — full PRO features for one sale, no monthly commitment
- TEAMS at $79/month when they outgrow solo (staff, multiple concurrent sales, flea market events)

**The guarantee (PRO/TEAMS only):** "If you don't push at least 5 items to eBay faster than you would manually in your first month on PRO, refund." Tied to a specific action they can measure, not a vague time-saved claim. (Hormozi: guarantee tied to their outcome, not your promise.)

This structure replaces the old "14-day free trial" which was offering something they already had. SIMPLE IS the trial — it never expires. PRO sells itself when the organizer hits the natural friction points: 50-item limit, second concurrent sale, wants eBay push on leftovers, wants Smart Pricing on new inventory. The first-sale-free-on-PRO accelerates that by showing them what they'll lose.

---

## The Landing Page

`finda.sale/video` — one page, one job. (Brunson: one page, one offer, one CTA.)

- 38-second animated demo showing the full workflow — photo-to-listing, QR checkout, eBay push, settlement (already built: `organizer-video-ad.html`)
- One real organizer quote with a specific number: "Set up a 180-item sale in 2 hours — used to take me all day"
- The offer: "Free forever. Your first sale gets the full toolkit — PRO features included."
- One CTA: "Start your first sale"
- No feature list. No pricing table. No "smart" or "auto" language on the landing page — show the workflow, let them see it.
- Source attribution on every inbound link: `?src=rvm`, `?src=email1`, `?src=fb`, `?src=partner`
- Capture `?src=` param at signup → store as `acquisitionSource` on Organizer record → feeds admin funnel view

---

## The RVM Script

25 seconds. Conversational. Lead with the photo workflow — that's the hook. (Hormozi: one compelling offer, not a feature dump.)

**Cold-start version** (before 10 organizers in market — sell the tool):

> "Hey — this is Patrick. I built an app that does something I think you'd find interesting. You photograph your items and the app writes the listing for you — title, description, price, category, all of it. Shoppers pay right from their phone — no cash box, no card reader. The organizers using it are finishing setup in a couple hours instead of a full day. It's free — no trial, no credit card. There's a quick video at finda.sale/video. Take care."

**Post-tipping version** (after 10+ organizers in market — sell the audience):

> "Hey — this is Patrick from FindA.Sale. We've got [X] organizers running sales in [city] right now and hundreds of shoppers browsing every week. Your competitors are getting buyers through us. The app is free — you photograph your items and the listing writes itself. Check it out at finda.sale/video."

---

## Emails

Three emails. Short. These go to the same scraped list as the RVMs.

**Email 1 — Day 1** (Brunson: hook with the problem they already have.)

Subject: The setup day problem

> [Name] —
>
> I built an app that turns one photo into a complete listing — title, description, price, condition, category. No typing. Shoppers scan a QR code and pay on their phone — no cash counting, no card readers.
>
> The organizers using it are finishing setup in under 2 hours instead of 6.
>
> It's free. No trial, no credit card. Your first sale gets the full toolkit.
>
> finda.sale/video?src=email1
>
> — Patrick

**Email 2 — Day 4** (Dan Henry: show the part they haven't thought about yet.)

Subject: The part most organizers miss

> Quick follow-up — two things that surprise people:
>
> The settlement report. Commission calc, expense tracking, client payout PDF. Done in 2 minutes instead of a spreadsheet. That's free, every sale.
>
> And after the sale — whatever didn't sell can push to eBay in one tap. Photos, title, price, shipping already filled in. That's $29/month or $9.99 for a single sale if you only run a few a year.
>
> finda.sale/video?src=email2 — 38-second demo.

**Email 3 — Day 9** (Cialdini: respect their autonomy, remove pressure.)

Subject: Last one

> I know I've sent a couple messages. If the timing's wrong or you've got something that works — no hard feelings.
>
> But if you're still spending a full day on setup before every sale, I'd like you to try it once. It's free — just upload a photo and see what happens.
>
> finda.sale/video?src=email3 — or just reply here.
>
> — Patrick

---

## Callback Script

When someone calls back, they already heard the RVM. Four objections that come up:

**"I already have a system."**
> "Most people do — usually some combination of spreadsheets and phone photos and Venmo. I'm not asking you to throw that away. The question is just how long setup takes you. If it's more than a couple hours, this cuts it in half. Try it on one sale and see."

**"I'm not a tech person."**
> "If you can take a photo, you can use it. You point your phone at the item and the app does the rest. I'll walk you through your first sale personally if you want."

**"How much?"**
> "The core app is free — photo listings, QR checkout, settlement reports, all of it. If you want eBay push, Smart Pricing, and the Flip Report, that's $29 a month. Or if you only run a few sales a year, $9.99 per sale gets you everything PRO has for that one sale. Most organizers who try the eBay push make the $29 back on leftover inventory from one sale."

**"How is it different from EstateSales.NET?"**
> "EstateSales.NET is a directory — you pay $99 per listing and that's it. FindA.Sale gives you the directory listing for free and adds the whole workflow: auto-tagging, in-person payments, QR checkout, eBay push, settlement reports. For $29 a month instead of $99 per listing. And we're not just for estate sales — the same tools work for yard sales, auctions, flea markets, and consignment."

---

## Channels

**Outscraper → RVM + email — the primary machine.**
Scrape Google Maps for: estate sale company, estate sale organizer, estate liquidator, auction house, consignment shop, flea market, yard sale organizer, garage sale organizer. Grand Rapids + 5 Michigan cities first. ~$10 per 5k records. Drop RVMs ($0.004 each via Drop Cowboy) and run the email sequence (Instantly.ai, $47/month) against the same list. GroupBoss.io ($20/month) captures emails passively from Facebook groups.

Month one cost to reach 5,000+ organizers: ~$100.

**Customer-driven sharing — the organic engine.** (Parr/Puri: let the product create its own evangelists.)
Organizers already have the social post generator (TikTok, Instagram, Facebook, Pinterest, Threads templates with their own sale photos). Shoppers share Haul Posts. The referral program gives XP for invites. The job is to make these tools frictionless enough that customers do the posting — not Patrick. Product gaps to close: one-tap "share my sale" from the organizer dashboard, post-sale "share your results" prompt, organizer-to-organizer referral reward (free month credit per signup that sticks 30 days).

**In person — Grand Rapids first.** (Welsh: unscalable things first.)
Show up at the biggest sales every weekend. Introduce yourself to the organizer before doors open. Offer to set up their next sale alongside them — photograph items, get the listing live, sit with them through the first POS transaction. Unscalable. Creates the first 10 fanatics who tell everyone they know.

**Local ASEL chapter.** Attend meetings. Sponsor a quarterly event. Get known in the room before the pitch.

**$20–30 Facebook ad** to `finda.sale/video` running in parallel with RVMs from day one. Find CAC fast instead of betting on one channel. (Huber: test multiple channels simultaneously, kill losers fast.)

---

## Partners

**Facebook group admins and ASEL chapter leaders first.** These are the easiest warm relationships and each one reaches hundreds of organizers. **Incentive structure:** free TEAMS account ($79/month value) for any admin who actively promotes FindA.Sale to their group, plus $10/month affiliate credit per organizer signup that sticks 30 days (tracked via unique partner referral link with `?src=partner_[name]`). Track in a spreadsheet: name, role, referral link, signups attributed, last touch, next touch.

**Probate attorneys — but not yet.** The attorney pitch only works when Multi-Consignor Settlement is shipped. Without it, you're pitching an abstraction. Build the relationships now with a free "Executor's Checklist" resource, but don't pitch FindA.Sale until you can show them the estate settlement report that replaces their accountant.

**Estate sale supply vendors.** Companies selling price tag guns, folding tables, display cases have email lists of active organizers. Co-marketing deal: FindA.Sale mentioned in their catalog email. Reaches verified buyers for the cost of an introduction.

**Caring Transitions franchise network.** 300+ locations running estate sales and senior move management. One regional franchise adopts FindA.Sale → franchisor recommends it across all locations. 300 accounts from one relationship.

**Stripe App Marketplace.** FindA.Sale already runs on Stripe. Getting listed is free and puts the product in front of merchants searching for operational tools.

---

## Influencers

**Tier 1 — direct outreach, affiliate deal.** Commission: one free month per organizer referral who stays 30 days. Only pitch creators who actively organize or source from sales — not just haul-video creators.

- Flea Market Flipper (Rob & Melissa) — ~500k YouTube, teach flipping as a business
- Ralli Roots (Ryan & Alli) — garage sale haul content, sourcing as income
- Hairy Tornado (Josh) — full-time Whatnot/YouTube reseller, natural fit for the eBay push angle
- Thrifting Vegas (Tiffany) — covers secondhand sourcing and estate sales for resale
- Treasure Hunting with Jebus — 727k YouTube

**Tier 2 — need a story, not a pitch.**

- Gary Vaynerchuk — 34M YouTube, loves garage/estate sales. The play: get a Grand Rapids organizer to post a genuine before/after and tag him. He shares user stories.
- Lara Spencer (HGTV Flea Market Flip) — pitch her production company. Angle: operational infrastructure behind the sales her show features.
- Codie Sanchez — covers boring businesses. Build "The Organizer Insider" newsletter with readership first, then pitch as a case study.

**The two-sided play:** (Yonover: demand-side pull.) Shopper-side influencers (Gary Vee, Flea Market Flipper) drive buyers to browse FindA.Sale. Organizers see traffic from FindA.Sale shoppers → organizers adopt. Buyers pull sellers.

---

## The Flywheel

(Yonover: marketplace network effects. Huber: compounding organic loops.)

1. Organizers list sales → sales appear in Google ("estate sales near me," "yard sales near me," "flea markets near me")
2. Shoppers find sales → attend → spend money → earn XP → climb ranks → get hooked
3. Organizers see FindA.Sale-sourced traffic in their analytics → tell other organizers
4. New organizers join → more listings → more Google coverage → more shoppers

The tipping point in any city is 10–15 active organizers. At that density, FindA.Sale is the local sale directory. An organizer NOT on FindA.Sale is losing buyers.

**Shopper retention compounds this.** The Explorer's Guild (XP, ranks, Hunt Pass, Treasure Trails) keeps shoppers coming back. A shopper at Ranger rank has invested real time — they're not switching to another app. Their hold time is longer, their access is better, they've earned coupons. Every retained shopper is another reason for an organizer to list on FindA.Sale.

---

## Expansion Markets

Same Outscraper machine, different scrape list, different pitch angle. Each market has a product feature that unlocks the full pitch.

**Flea markets:** Flea Market Events feature (TEAMS, $79/month) handles vendor check-in, per-vendor inventory, per-vendor POS, end-of-day settlement. No current software does all of this in one mobile tool. One flea market chain with 5 locations = $395/month. Scrape: "flea market [city]," "outdoor market [city]."

**Consignment and thrift shops:** $61B US secondhand market. Same one-of-a-kind item problem, same photo inventory, same pricing complexity. Current tools (ThriftCart, SimpleConsign, Circle-Hand) charge $99–359/month and require hardware. FindA.Sale underprices them, adds auto photo tagging, needs no hardware. Gap to close first: consignor tracking (who brought what, split %, payout). Schema pre-wired.

**Garage sales, church rummage sales, nonprofits:** Works right now with no product changes. Charity Close with tax receipt PDF already built. "FindA.Sale for nonprofits" is a press angle no other software vendor occupies.

**Antique malls:** 40–200 individual dealers per mall, each managing inventory manually. One mall owner adopts FindA.Sale → 40 accounts from one conversation.

**Corporate office liquidations:** Same problem, bigger volume, higher pricing tolerance. $79/month is nothing against liquidating $50k of office furniture.

---

## Post-Signup Automation

These fire without Patrick after the backend webhooks are built (~12 events, ~300 lines, one dev session). (Nir Eyal: trigger → action → variable reward → investment. Each email moves the organizer one step deeper into the product loop.)

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
| Weekly (active organizers) | "Your listings got [X] views this week. [Top item] got [Y] saves." + upgrade pitch if views spike | Resend |

---

## Metrics — Kill or Double Down

"Pour fuel on signal" requires knowing what signal looks like. These are the targets. If a channel is below floor after $60 spend or 2 weeks, kill it. If above ceiling, double the budget.

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
| Cost per activated organizer (signup → first sale) | >$80 | $20–40 | <$15 | Calculated |

**Admin funnel view** surfaces the post-signup metrics (signup → photo → sale → conversion → churn → referral) with `acquisitionSource` breakdown. Dev task: capture `?src=` query param at signup, store as `acquisitionSource` on Organizer model, build admin dashboard panel. ~1 dev session.

---

## Execution Stack

Do these in order. Pour fuel on whatever produces signal — check §Metrics to know when to kill or double down. Guru attributions kept for traceability.

**Build the machine (dev work — do these first):**

1. **Ship "first sale free on PRO" offer logic** — `isFirstSaleFree` flag on Organizer model. First sale auto-unlocks PRO features (500 items, eBay push, Smart Pricing, Virtual Queue, Flip Report, Insights, Brand Kit). After sale ends, revert to SIMPLE (50 items, no eBay push, no PRO tools). Stripe coupon integration for the free PRO period. ~80 lines backend + 20 lines frontend (badge/banner showing "PRO features active — first sale"). *Dev session: ~half day.* (Hormozi: let them feel the ceiling removal, then put it back.)
2. **Ship `acquisitionSource` tracking** — capture `?src=` query param at signup, store on Organizer record. Build admin dashboard panel: signup funnel by source (signups → first photo → first sale → conversion → churn), with date range filter. This is what makes "pour fuel on signal" possible. *Dev session: ~half day.*
3. **Ship customer sharing tools** — one-tap "share my sale" button on organizer dashboard (generates social post with sale link + photo grid), post-sale "share your results" prompt (shows items sold, revenue, time saved — shareable card), organizer-to-organizer referral system (unique referral link, free month credit per signup that sticks 30 days, tracked in admin). Social post generator and Haul Posts already exist — this wires up the prompts and incentives. *Dev session: ~1 day.* (Parr/Puri: let customers be the marketing channel.)
4. **Ship post-signup automation** — 12 webhook events from §Post-Signup Automation above. Resend integration. Context-aware triggers that use inventory data (category, count, unsold %, value). ~300 lines backend. *Dev session: ~1 day.* (Nir Eyal: trigger → action → variable reward → investment. Yonover: automate the nurture, free up the founder.)
5. **Ship smarter weekly digest** — existing "your listings got X views" email upgraded with: top-performing item, shopper saves/favorites count, inventory-context upsell ("you had [N] unsold items worth ~$[X] — eBay push would list them in one tap"). *Included in item 4 dev session.*

**Turn on the pipeline (Patrick actions — start these while dev work ships):**

6. **Build `finda.sale/video` landing page** — deploy `organizer-video-ad.html` to Vercel at `finda.sale/video`. Source attribution wired (`?src=` params). CTA: "Start your first sale — free." One page, one offer. (Brunson.)
7. **Run first Outscraper scrape** — Grand Rapids + Kalamazoo + Lansing + Detroit + Ann Arbor + Traverse City. Search terms: estate sale company, estate sale organizer, estate liquidator, auction house, consignment shop, flea market, yard sale organizer, garage sale organizer. ~$10 per 5k records. Clean list: dedupe, verify phone/email, expect ~60-70% usable yield. (Koerner.)
8. **Set up Instantly.ai** ($47/month) — warm a dedicated sending domain (start this 2 weeks before first send). Load the 3-email sequence from §Emails. Connect to cleaned Outscraper list. Day 1/Day 4/Day 9 cadence. Track open/reply rates per email against §Metrics targets. (Dan Henry.)
9. **Drop first 5,000 RVMs** via Drop Cowboy ($0.004 each = $20). Cold-start version of RVM script from §The RVM Script. Same list as Instantly.ai. Schedule drops M–Th 10am–2pm local time. Track callback rate against §Metrics floor (0.5%). (Koerner.)
10. **Run $20–30 Facebook ad** to `finda.sale/video` — same week as RVMs. Target: people interested in estate sales, yard sales, flea markets, reselling, within 100mi of Grand Rapids. Kill if CPA > $50 after $60 spend. (Huber.)
11. **Set up GroupBoss.io** ($20/month) — install in top 10 Facebook organizer groups (estate sale, yard sale, flea market). Passively captures emails from group join questions. Feed into Instantly.ai list. (Koerner.)

**Build relationships (start after pipeline is live):**

12. **Show up at local sales** — Grand Rapids area weekends. Introduce yourself. Offer to help with their next sale on FindA.Sale. Collect testimonials with specific numbers. Not concierge — just introductions and a signup link. (Welsh: unscalable things first, but keep it lightweight.)
13. **Join local ASEL chapter** — attend next meeting. Sponsor next quarterly event ($200–500). One relationship here reaches every estate sale organizer in the region.
14. **Start partner outreach** — Facebook group admins and ASEL chapter leaders first. Lead with the incentive: free TEAMS account + $10/month affiliate credit per organizer referral. Unique partner referral links (`?src=partner_[name]`). Track in spreadsheet. (Codie Sanchez.)
15. **Pitch Tier 1 influencers** on affiliate deal — see §Influencers list. Verify they actively organize or source from sales. Commission: one free month per organizer referral who stays 30 days. Send them a working account first. (Yonover: demand-side pull.)

**Scale (after 10+ active organizers in Grand Rapids):**

16. **Switch to post-tipping RVM/email scripts** — see §The RVM Script post-tipping version. Now selling the audience, not just the tool. Update Instantly.ai templates.
17. **Hit 10 active organizers → "Grand Rapids Sale Weekend" push.** Flywheel ignition. Facebook ad spend shifts from cold to retargeting existing shoppers.
18. **Start probate attorney outreach** — ONLY after Multi-Consignor Settlement ships. Build relationships now with free "Executor's Checklist" resource.
19. **Run Outscraper machine on expansion markets** — "flea market [city]" and "consignment shop [city]" once Grand Rapids MRR is stable. Different pitch angle per market (see §Expansion Markets).
20. **Apply: Stripe App Marketplace** — free listing, puts product in front of merchants searching for operational tools.
21. **Caring Transitions franchise pitch** — 300+ locations. One regional franchise → franchisor recommendation → 300 accounts. Requires working TEAMS demo.
22. **Supply vendor co-marketing** — price tag gun / folding table companies have email lists of active organizers. FindA.Sale mentioned in their catalog email.

---

*Playbook v12 — S486. Major structural revision. Replaced broken 14-day-trial offer with "first sale free on PRO + feel the downgrade" (Hormozi/Brunson/Nir Eyal consensus). Added à la carte ($9.99/sale) visibility across all scripts. Cold-start vs post-tipping RVM variants. Partner incentive structure (free TEAMS + affiliate credits). Metrics section with kill/double-down targets. Post-signup automation expanded to 12 context-aware triggers (inventory-based, not just timestamp-based). Execution stack reorganized: dev work first (5 items), pipeline second (6 items), relationships third (4 items), scale fourth (7 items). Killed concierge setup and survey. Added acquisitionSource tracking + admin funnel view. 22 items.*
