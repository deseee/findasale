> **⚠️ SUPERSEDED 2026-04-30 — DO NOT EXECUTE**
> This is the synthesis of the rejected founder-hustle spikes (1, 2, 3). Patrick rejected the underlying spikes as "cold call sales and begging for users." This synthesis inherits their flaws.
> **Active plan:** `s603-final-plan.md` (viral mechanics + GTM-committee verdicts). This file kept as record.

---

# S603 Acquisition Action Plan

**Locked:** 2026-04-30
**Owner:** Patrick (solo founder, GR, MI)
**Goal:** Move from 1 real operator + seed data to 5–10 real operators running real sales with real data, with a viral content engine and 2 active acquisition channels live, by 2026-05-31.

This document synthesizes Spike 1 (real-operator seeding), Spike 2 (visceral content), and Spike 3 (channel exploration). Read those for detail; read this for sequencing, dependencies, and what Patrick decides this week.

---

## Why this exists

Patrick's S602 directive: *"we need faster and more viral and visceral. one real operator and a bunch of fake data isn't going to cut it even if we tell people it's in beta."*

Three constraints govern every choice below:
1. **Speed** — real prospects in days, not weeks.
2. **Viral / visceral** — gut-level, shareable, emotionally charged.
3. **Real-data credibility** — every external-facing pitch fails if it depends on seed data.

Strategic stance D-007 (locked S602): *"Get too big to ignore before partners can react."* Ship distribution before partner agreements solidify.

---

## The single binding constraint: Patrick's hours

Patrick is one person. The three spikes proposed roughly 9h/wk (Spike 1) + 8h/wk (Spike 2) + 5h/wk (Spike 3) = **22h/wk** of new acquisition work, on top of running the platform and shipping fixes. That number is too high for a sustained 4 weeks.

**Realistic budget:** 15h/wk for acquisition during S603. The plan below cuts to that ceiling by sequencing, not by dropping work.

| Track | Spike | Hours/wk |
|---|---|---|
| Concierge onboarding (5 organizers, not 10) | S1-A | 5 |
| Saturday hand-recruit circuit (organizer + shopper combined) | S1-C + S3-Ch1 | 4 (one Saturday block) |
| Family sale retroentry + eBay sync verify | S1-D | 2 (front-loaded week 1) |
| Founder vlog (3 posts/wk, phone-only) | S2-P4 | 2 |
| Waitlist landing page + first 100 hook | S2-P5 | 1 |
| Reddit AMA prep + run | S3-Ch2 | 1 |
| **Total** | | **15** |

Pieces 1–3 of the content plan (40→15 time-lapse, "what we found" series, "the pile that doesn't sell") are **gated on real organizers** and slot into weeks 3–4 once Spike 1 has produced footage subjects. They are NOT in the 15h/wk budget yet — they replace concierge hours as concierge organizers graduate.

---

## Cross-spike dependencies

**Spike 1 Track C and Spike 3 Channel 1 are the same Saturday.** Patrick walks GR estate sales, talks to organizers (Spike 1) AND talks to shoppers at the same sales (Spike 3). One trip, two outputs. Print one stack of QR cards with two CTAs (organizer signup vs shopper email list).

**Spike 1 Founding-Operator deliverables feed Spike 2 Pieces 2 + 3.** Each founding operator signs name+likeness consent and provides photos. That content unlocks the "what we found at this estate sale" series (Piece 2) and the "pile that doesn't sell" series (Piece 3). No real organizers = no Pieces 2 + 3.

**Spike 2 Piece 4 (founder vlog) feeds Spike 3 Channels 1 + 2.** Patrick's daily/3x-weekly vlog posts ARE the content the in-person circuit and Reddit AMA point to. The vlog is the always-on hub; channels are the spokes.

**Spike 3 Channel 2 (Reddit AMA) feeds back to product.** AMA comments surface organizer pain points — those become roadmap inputs and content topics for Piece 4 vlog.

**Spike 2 Piece 5 (First 100 waitlist) is the conversion event for everything.** Every Spike 3 channel and Spike 2 piece eventually lands on the waitlist landing page. Build it week 1.

---

## 14-day sprint plan (2026-05-01 → 2026-05-14)

### Week 1: Foundation week (May 1 → May 7)

**Monday May 4** *(Patrick gets the weekend May 1–3 to lock decisions, see below)*
- Email attorney with one-page Founding-Operator agreement template (Spike 1 Track B). Budget $300–500, 3-day turnaround.
- Block 4 hours Tuesday for family sale retroentry (Spike 1 Track D).
- Build waitlist landing page draft (Spike 2 Piece 5). Webflow or simple Next.js page in the existing app — 4 hours of Patrick time, or outsource $200–400.

**Tuesday May 5**
- Family sale retroentry: data-enter 50–100 items from a real recent family sale into FindA.Sale, mark them SOLD with timestamps. Goal: when an operator opens the app, the platform looks lived-in, not seeded.
- Verify eBay sync is functioning post S590-S591 fixes. Click "Sync eBay Inventory" on `/organizer/settings`. Confirm items populate. (Carryover Patrick action from S599.)

**Wednesday May 6**
- Record first founder vlog post (Spike 2 Piece 4). Phone only. 60 seconds. Topic: "Why I built FindA.Sale — and why I'm asking 10 organizers to try it free this month." Post to TikTok + IG Reels + YouTube Shorts (post-once-distribute via Buffer or Later — set up the tooling).
- Draft Reddit r/estatesales AMA post (Spike 3 Channel 2). Read the subreddit for 90 minutes first. Identify 15 likely questions, draft canned responses.

**Thursday May 7**
- Launch waitlist landing page. Wire to the founder vlog and Reddit AMA links.
- Print 50 QR-code business cards: organizer-side ("Run your sale on FindA.Sale — talk to me") + shopper-side ("Get this weekend's GR sales in your inbox each Friday").

**Friday May 8**
- Send first "Friday Sales Roundup" email to whoever is on the waitlist (might be 0; that's fine — set up the cadence now). Include 3 GR-area sales happening this weekend with photos/tags from FindA.Sale (or seeded sales clearly marked as platform demos).
- Post second founder vlog (3x/week target).

**Saturday May 9** *(critical day — biggest payoff per hour)*
- Walk the Saturday GR estate sale circuit. Hit 3 sales. At each:
  - Spend 10–15 min talking to organizers (Spike 1 Track C) — give them the organizer-side QR card, 60-second pitch, demo on phone.
  - Spend 10–15 min talking to shoppers (Spike 3 Channel 1) — give them the shopper-side QR card, show the app, capture emails.
- Goal: 1–2 organizer leads + 10–15 shopper email signups. Real numbers, not theoretical.

**Sunday May 10** — *off, or write next week's vlog topics*

### Week 2: Acceleration week (May 11 → May 17)

**Monday May 11**
- Confirm attorney signed off on Founding-Operator agreement. Lock final.
- Send Founding-Operator outreach to first 5 organizer leads from Saturday circuit. Email + voice memo + agreement attached.
- Post Reddit r/estatesales AMA. Pin a comment with waitlist link. Live-moderate 2–3 hours.

**Tuesday May 12**
- First concierge kickoff call — book 2 of the Saturday leads onto the platform. 30 min each.
- Founder vlog post #3.

**Wednesday May 13**
- Concierge daily check-in (Slack/SMS, 5 min each, with the 2 onboarded organizers).
- Track waitlist signup rate post-Reddit AMA. If >50 new signups in 24h, AMA was a hit.

**Thursday May 14**
- Founder vlog post #4.
- Send second Friday Sales Roundup email — include real items from the 2 onboarded organizers' sales.
- Concierge daily check-in.

**Saturday May 16** *(second Saturday circuit)*
- Walk circuit again. By now Patrick has 1–2 organizers running real sales. Drive shoppers from Saturday circuit to those operators' sales next weekend.
- Goal: 2–3 more organizer leads, 10–15 more shopper signups, and one operator's sale referenced live in conversation ("see, here's a real sale running through FindA.Sale right now — pull it up on your phone").

---

## Decisions Patrick must lock by Sunday May 3 (before Week 1 starts)

These are the unblocks. Don't start the sprint without answers.

**D-S603-1 — Founding-Operator incentive amount.**
Sales-ops recommended $750 cash split (B1: $375 upfront + $375 on case study delivery). Alternative: B3 hybrid ($300 cash + 3 months free PRO ≈ $3,870 total for 10). Pure free-PRO-for-life (B2) deferred — too slow a signal.
*Default if no answer:* B3 hybrid (preserves cash runway).

**D-S603-2 — Concierge cohort size.**
Sales-ops proposed 10. Synthesis cuts to 5 to keep Patrick's hours sustainable. Cohort of 5 with high-quality concierge beats cohort of 10 with rushed onboarding.
*Default if no answer:* 5.

**D-S603-3 — Content production approach for Pieces 1-3.**
Marketing recommended hiring a freelance editor for $1,500–3,000 to produce Pieces 1–3. Alternative: Patrick DIYs everything in CapCut, slower to ship.
*Default if no answer:* Defer this decision until week 3 — Pieces 1–3 are gated on real organizer footage anyway.

**D-S603-4 — Concierge support boundary.**
Sales-ops recommended ending concierge support 4 weeks after each operator launches. Patrick should signal this in the kickoff call: *"I'll get you through your first sale; after 4 weeks the product is self-service."*
*Default if no answer:* Adopt the 4-week boundary verbatim.

**D-S603-5 — Saturday circuit radius.**
Limit GR estate sale circuit to 30-minute drive radius from Patrick's home. Beyond that the time math doesn't work.
*Default if no answer:* 30-minute radius.

**D-S603-6 — Waitlist incentive structure.**
First 100 organizers get free PRO for 6 months + named on a "Founding 100" page on finda.sale. No referral-position bumps in the MVP version (defer the gamified mechanics to v2 if waitlist organic is hot).
*Default if no answer:* Adopt as written.

---

## Channels and content NOT happening this sprint (and why)

**Deferred from Spike 2:**
- Pieces 1, 2, 3 — gated on real organizer footage. Pieces 1's 40→15 time-lapse can technically use seeded data + Patrick's family sale, but the "look how easy it is" claim falls apart if the only operator on the platform is Patrick. Wait until 3 organizers have shipped sales. Realistically week 3+.

**Deferred from Spike 3:**
- TikTok / IG Reels as paid acquisition (rank 6) — Patrick's vlog seeds the organic footprint; paid amplification waits until there are 3+ founder vlog hits showing engagement.
- Trade publication outreach (rank 5) — slow burn 4–6 week cycles. Worth queuing the pitches in week 4 for landing in June.
- Local TV news pitch (rank 8) — lottery ticket. One pitch packet drafted in week 4, sent once, no chasing.
- Influencer partnerships (rank 9) — already gated on real-organizer case studies AND on the existing advisory-outreach-drafts.md flow which Patrick is sending 1–2/day from `patrick@finda.sale`. Don't double-track this.
- Local B2B2C partnerships (Goodwill, Habitat ReStore) — slow org cycles. Deferred to S604.

**Why these are deferred, not killed:** real-data credibility gates them. Once Spike 1 produces 5+ real operators, all of these unlock.

---

## Risks (top 5)

1. **Patrick burns out at 22h/wk acquisition.** Mitigation: 15h/wk ceiling, hard stop on Sunday, Saturdays only for circuit. If hours creep above 18h/wk by Friday May 8, drop the second Saturday circuit and consolidate.

2. **Founding operators don't ship a sale.** 70% conversion target from sales-ops is optimistic. If 3 of 5 ship by May 17, recalibrate — increase concierge hours per operator, drop new-operator intake until current cohort completes.

3. **Reddit AMA flops or gets banned for self-promotion.** Mitigation: read subreddit for 5 days first, frame AMA as "free beta + AMA about estate sales generally" not "come check out my app." Have a backup post in r/flipping if r/estatesales rejects.

4. **Family sale retroentry creates fake-looking data.** Mitigation: data-enter from an actual recent family sale with real photos, real prices, real timestamps. If it doesn't look real to Patrick, it won't look real to a prospective organizer either. Cut and try again.

5. **Vercel/Railway production breaks during sprint.** Tied 1:1 to platform health. The S599 deferred bugs (Items page 500, Tier Lapse plan card, Sales SSR OG) sit in carryover. None are blocking this sprint, but if a new P0 hits during the 14 days, acquisition pauses for 2 days max.

---

## Success criteria (measure on May 31)

- 5 real operators onboarded with signed Founding-Operator agreements. (Spike 1)
- 3 of those 5 have shipped at least one real sale on the platform with real items, real shoppers, real money.
- 30+ founder vlog posts live across TikTok / IG Reels / YouTube Shorts. (Spike 2 Piece 4)
- 1 Reddit AMA done. (Spike 3 Channel 2)
- 50+ shopper emails captured from in-person GR circuit. (Spike 3 Channel 1)
- 4 Friday Sales Roundup emails sent. (Spike 3 Channel 1)
- Waitlist landing page live with 100+ signups. (Spike 2 Piece 5)
- 3 case studies in draft (real organizers, real photos, real consent). Feeds Spike 2 Pieces 2-3 in S604.

If 4 of 8 hit, the sprint is a success and the engine is real.

---

## Carryover decisions queued for next session (S604)

- Should we hire the freelance editor in week 3 to start Pieces 1–3 production?
- Do we open intake for cohort 2 (organizers 6–10) on June 1, or stay at 5 to preserve concierge depth?
- TikTok/IG Reels paid amplification — yes/no based on founder vlog organic numbers from the first 30 days?
- Trade publication pitch packet — go/no-go on submitting to Antique Trader + AntiqueWeek?

---

## Appendix — Files this synthesis pulls from

- `claude_docs/strategy/spike1-real-operator-seeding.md` (sales-ops detail)
- `claude_docs/strategy/spike2-visceral-content-plan.md` (marketing detail)
- `claude_docs/strategy/spike3-channel-exploration.md` (innovation detail)
- `claude_docs/STATE.md` Next Session section (S603 directive verbatim)
- `claude_docs/decisions-log.md` D-007 (strategic stance)
