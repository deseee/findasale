# Pipeline Briefing — Week of 2026-04-10 (Friday)
*Owned by: findasale-sales-ops | Generated: 2026-04-10 | Cadence: Weekly (Mondays 9am)*

---

## 🔴 CRITICAL: Pipeline Frozen for 33 Days — Fourth Consecutive Briefing With Zero Movement

The last external outreach was **2026-03-08** — 33 days ago. This is the **fourth consecutive weekly briefing** (3/16, 3/24, 4/3, 4/10) with identical pipeline status: 1 MailerLite subscriber (internal test), 0 external organizers, 0 outreach sent. A **fourth week of drafted marketing content** (2026-04-09) now exists — joining three prior batches — all undeployed. The product has received extraordinary investment (~45 dev sessions since the first briefing) while acquisition has received zero execution effort for over a month.

**At current velocity, Q2 paid launch arrives with no organizers, no conversion data, and no revenue.**

---

## Current Organizer Count

| Metric | Value | Change vs. 2026-04-03 | Change vs. 2026-03-08 (first outreach) |
|--------|-------|-----------------------|----------------------------------------|
| MailerLite total subscribers | **1** | ↔ No change | ↔ No change |
| Beta Organizers group (active) | **1** | ↔ No change | ↔ No change |
| Stripe paying customers | **0** | ↔ No change | ↔ No change |
| Active subscriptions | **0** | ↔ No change | ↔ No change |
| Campaigns sent since last briefing | **0** | — | — |
| External beta organizers confirmed | **0** | ↔ No change | ↔ No change |

*The 1 active subscriber remains the internal test contact. No external organizers have been recruited, onboarded, or contacted since 2026-03-08.*

**⚠️ Organizer count has not grown in 33 days. This is a concern flagged for the fourth consecutive briefing.**

---

## Pipeline Status

```
Awareness → Contacted → Responded → Onboarded → Active

    ?    →     1      →     0     →     1*     →   0
```

*Identical funnel to 3/16, 3/24, and 4/3. No movement at any stage.*

### Stage Breakdown

| Stage | Count | Notes |
|-------|-------|-------|
| Awareness (visited organizer landing) | Unknown | No analytics connected |
| Contacted (received outreach) | 1 (internal) | Only send was 2026-03-08 to 1 subscriber |
| Responded / engaged | 0 | |
| Onboarded (completed setup) | 1 (internal) | No external organizers |
| Active paying | 0 | Stripe live key status unknown |

---

## Outreach Activity This Week (2026-04-03 → 2026-04-10)

**Campaigns sent:** 0
**New subscribers added:** 0

**All-time MailerLite campaign history (verified via MCP — no new activity):**

| Campaign | Status | Sent | Opened | Clicked | Date |
|----------|--------|------|--------|---------|------|
| "Your FindA.Sale beta access is ready 😁" | ✅ Sent | 1 | 1 (100%) | 0 (0%) | 2026-03-08 |
| Copy of above campaign | Draft | 0 | — | — | 2026-03-08 |
| 4× Untitled campaigns | Draft | 0 | — | — | 2026-03-07/08 |

No new campaigns created or sent since 2026-03-08. The 5 draft campaigns remain without recipients or subjects — same as all three prior briefings.

---

## Marketing Content Ready But Not Deployed

Four full weeks of outreach-ready content now sit unused:

| Week | Content | Status |
|------|---------|--------|
| 2026-03-23 | LinkedIn/Instagram post (EstateSales.NET buyer-only angle), 3 subject line variants (A/B/C), blog brief "The Estate Sale Software Gap Nobody's Talking About" | ✅ Ready — not published |
| 2026-03-26 | LinkedIn post (Rosy/payment gap angle), 3 new subject lines (Venmo angle, EstateSales.NET fee angle, franchise vs. independent angle) | ✅ Ready — not published |
| 2026-04-02 | LinkedIn post (MaxSold photo upload bugs angle), 3 subject lines (photo upload pain, AI cataloging, Blue Moon pitch counter) | ✅ Ready — not published |
| 2026-04-09 | LinkedIn post (MaxSold reliability vs. FindA.Sale photo-first), 3 subject lines (AI tagging, MaxSold photos direct, trending inventory), blog brief "Why Your Estate Sale Photos Are Worth More Than You Think" | ✅ Ready — not published |

Twelve subject lines across four competitive angles. Four social posts. Two blog briefs. **Zero deployment across 33 days.**

---

## Product Context (What's Changed Since 2026-04-03)

Sessions S428–S433 shipped significant work. Items relevant to organizer acquisition:

- **Stripe Connect onboarding confirmed working (S429, verified by Patrick):** Settings → Setup Stripe Connect now redirects to real Stripe onboarding (was throwing 500 errors before). This removes the "Stripe is broken" barrier for any organizer who tries to set up payments.
- **POS socket stability (S429):** Railway 502 errors on WebSocket connections eliminated. The POS is now stable enough to demo without embarrassing failures.
- **Auction system (S432–S433):** Full auction overhaul with proxy bidding, reserve prices, soft-close, bid history anonymization, eBay-style increments. For organizers running auctions (antique dealers, estate auction houses), this is a major differentiator.
- **eBay OAuth fixed (S432):** Organizers can now connect their eBay account from settings without the redirect bug. eBay cross-posting is a real competitive advantage over EstateSales.NET.

**Acquisition implication:** Stripe Connect now works. This means an organizer who signs up and tries to configure payments will succeed — the previous barrier (500 error on Stripe setup) is removed. The product continues to pull ahead technically. The deployment gap remains entirely on the outreach side.

---

## Conversion Metrics

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Trial signups (cumulative, external) | 0 | — | No outreach executed |
| Trial-to-paid conversion | N/A | — | No trials |
| Paid subscribers | 0 | — | Stripe live key status unknown |
| Churn (30d) | 0 | < 1 | N/A |

---

## Customer Signals Affecting Acquisition

`customer-signals.md` does not exist — fourth consecutive briefing with this gap. No friction signals have been logged by the Customer Champion because there are no external customers to generate signals.

---

## Top 3 Priorities This Week

### 1. 🔴 Execute Outreach — This Is the Fourth Request

Four briefings. One ask. The 2026-04-09 content batch is the strongest yet: the MaxSold photo reliability angle is directly backed by the product reality (camera flow, AI tagging, reliable upload pipeline). Subject B — *"MaxSold keeps dropping photos. We don't."* — is a specific, verifiable claim that targets organizers already frustrated with their current tool.

**Recommended immediate steps:**

1. Find 15–20 independent estate sale / yard sale organizers in Michigan via EstateSales.NET (browse Michigan listings, find organizer contact pages), Facebook groups ("Estate Sales Michigan", "Grand Rapids Estate Sales"), and Google ("estate sale company Grand Rapids")
2. Add their emails to the MailerLite Beta Organizers group
3. Clone the sent 2026-03-08 campaign (the "Copy of" draft already exists), update the body with the 2026-04-09 content, and set Subject A or B from the 2026-04-09 batch
4. Send to the new contacts
5. Post the 2026-04-09 social post on LinkedIn/Instagram the same day

The two blog briefs (2026-03-23 and 2026-04-09) can be published at finda.sale/blog and linked from LinkedIn posts. This establishes organic search presence before Q2.

### 2. 🔴 Confirm Stripe Live Key Status

The 2026-04-03 briefing flagged Stripe on test keys as a P0 blocker. Stripe Connect onboarding is now fixed (S429) — meaning organizers can configure their payout accounts. But it's unclear whether the platform itself is on live keys. No real revenue can be collected until live keys are active.

**Patrick action:** Confirm whether `STRIPE_SECRET_KEY` in Railway is a live key (`sk_live_...`) or test key (`sk_test_...`). If test: complete Stripe business account verification → flip to live keys → update Railway env vars.

### 3. 🟡 Set Up a Simple Lead Tracker Before the First Reply Arrives

When outreach goes out and organizers respond, there is no system to track who responded, when, and what happened. A Google Sheet with Name / Business / Email / Contacted Date / Response / Onboarded / Active / Notes is sufficient for the first 20 organizers.

---

## Blockers

| Blocker | Owner | Priority | Days Unresolved |
|---------|-------|----------|-----------------|
| No external organizer outreach executed (33 days) | Patrick | 🔴 P0 | 33 |
| Stripe live key status unconfirmed | Patrick | 🔴 P0 | 33+ |
| 12 subject lines + 4 social posts + 2 blog briefs drafted but undeployed | Patrick | 🔴 P0 | 7–33 |
| No lead tracking system | Patrick | 🟡 P1 | 33+ |
| customer-signals.md does not exist | Customer Champion / Patrick | 🟡 P1 | 33+ |
| 5 draft campaigns in MailerLite untitled and unassigned | Patrick | 🟡 P1 | 33+ |
| Stripe Connect webhook not configured (items not marked SOLD after POS card payment) | Patrick | 🟡 P1 | Since S421 |

---

## Pipeline Velocity Assessment

**Velocity: ZERO. 33 consecutive days with no pipeline movement. Fourth consecutive briefing with no change.**

The product argument for delay is now fully exhausted. Four major feature waves have shipped since the last outreach: camera/dashboard/settlement (wave 1), nav/gamification/smart-cart (wave 2), POS stability/Stripe Connect fix (wave 3), auction overhaul/eBay OAuth (wave 4). Each wave has made the product materially better. None of it has moved the pipeline because no organizer has seen it.

The outreach content has been produced for every week outreach has been skipped. The competitive angles are current, the copy is ready, and the product now delivers on every claim in that copy. The only missing step is sending the emails.

At Q2 (approximately 3–4 weeks from this briefing), the goal is to begin converting beta users to paid plans. With 0 beta users, 0 trial behavior data, and 0 conversion data, that goal is unreachable regardless of what the product does between now and then.

---

## Recommended Actions (In Priority Order)

1. **Today:** Identify 15–20 organizer prospects via EstateSales.NET + Michigan Facebook groups. Add to MailerLite Beta Organizers group.
2. **Today:** Clone the "Copy of" draft campaign in MailerLite, insert 2026-04-09 content, set Subject B (*"MaxSold keeps dropping photos. We don't."*), send to new contacts.
3. **Today:** Post the 2026-04-09 social post on LinkedIn/Instagram.
4. **This week:** Publish the 2026-03-23 blog brief as a post at finda.sale/blog. Share on LinkedIn.
5. **This week:** Confirm Stripe live key status in Railway. If test — flip to live keys.
6. **Before first reply arrives:** Create a simple lead tracker spreadsheet (Name / Business / Email / Contacted / Response / Status).
7. **Ongoing:** Clean up the 5 untitled MailerLite draft campaigns — delete or repurpose so the campaign list is clean.
8. **Ongoing:** After any organizer responds or onboards, create customer-signals.md and log the interaction.

---

## Context Notes

- The 2026-04-09 content batch is the most product-accurate yet. The photo-first workflow claim ("snap → AI suggests → review → publish") is now verified by the actual product. S381 (camera redesign) + S430 (upload reliability) mean the pitch is backed by working software.
- Stripe Connect onboarding confirmed working (S429, Patrick verified 2026-04-09). Any organizer who signs up and tries to configure payments will succeed. This barrier is removed.
- Auction organizers (antique dealers, estate auction houses) are a new addressable segment unlocked by S432–S433. The proxy bidding + eBay-style increments + anonymized bid history make FindA.Sale viable for organizers currently running auctions through separate platforms.
- Explorer's Guild / gamification remains a shopper-retention pitch for organizer outreach: "your buyers stay engaged and come back to your next sale." Competitors do not have this.
- Settlement wizard + client reporting answers the "fee transparency to clients" pain point. Include in any pitch to organizers managing consignment-style sales.

---

*Sources: MailerLite MCP (subscriber count: 1, campaign history: 6 total, 1 sent 2026-03-08 — verified live), STATE.md (S428–S433, 2026-04-09–04-10), claude_docs/operations/pipeline-briefing-2026-04-03.md, claude_docs/marketing/content-pipeline/content-2026-04-09.md, content-2026-04-02.md, content-2026-03-26.md, content-2026-03-23.md*
