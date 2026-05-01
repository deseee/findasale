# S603 Final Plan — Viral Mechanics for Organizer + Shopper Acquisition

**Locked:** 2026-04-30
**Authority:** Patrick (founder)
**Inputs:** `s603-viral-mechanics.md` (innovation, 15 mechanics) + `s603-viral-mechanics-gtm-stress-test.md` (advisory board GTM committee verdicts)
**Supersedes:** `s603-acquisition-action-plan.md`, `spike1-real-operator-seeding.md`, `spike2-visceral-content-plan.md`, `spike3-channel-exploration.md` (all rejected by Patrick as "founder hustle, not viral")

This plan is the corrected version after a first pass produced founder-hustle mechanics (cold-call sales, in-person QR cards, daily founder vlogs, Reddit AMAs) which Patrick rejected verbatim. The directive — *"faster and more viral and visceral … one real operator and a bunch of fake data isn't going to cut it"* — required compounding mechanics where one user's action pulls in 5+ more users with **zero added founder hours**, not founder cold-outreach.

---

## What survived committee review

The innovation pass produced 15 candidates. The GTM committee approved 3, conditionally approved 1, rejected 1, and pushed 1 to retention/Month 2.

| Mechanic | Innovation K-est | Committee K-est | Verdict | Ship |
|---|---|---|---|---|
| **Waitlist Position-Jumping + Founding 100** | 3.0–5.0 | 3.0–4.0 | ✅ APPROVE | **Week 1** |
| **Loot Drop Notification Cascade** | 2.5–4.0 | 1.5–1.8 | ⚠️ Approve w/ changes | Infra W1, activate W3–4 |
| **TikTok Creator Sponsorship** | 2.0–3.5 | 2.0–2.5 | ⚠️ Approve w/ guardrails | W2–4, max 5 creators |
| **Auto-Generated Wildest Finds Reels** | 1.5–2.5 | 0.3–0.8 | ❌ REJECT | Defer to Month 3 |
| **Shopper Bounty Board** | 1.8–2.2 | 0.5–0.8 (as growth) | ⚠️ Reframe as retention | Month 2 |

The committee was right on all five. K-factor estimates from the innovation pass were 30–40% optimistic across the board (standard for ideation passes — that's why we run stress tests).

---

## The supply-side problem (acknowledged honestly)

Three of the five mechanics are gated on real organizer supply: 3–5 real organizers running 5+ real sales each by week 3 is the floor. Without that, Loot Drop sends boring notifications, TikTok creators have nothing real to demo, and Bounty Board has no organizers to fulfill bounties.

The first pass tried to solve this with concierge onboarding + Saturday hand-recruit, which Patrick correctly rejected as founder hustle. So we need a supply path that does NOT consume Patrick's hours linearly.

**Solution: minimum viable supply seeding (≤8h Patrick-time, one-time)**

1. **Patrick onboards his family + 2 friends** as the initial 3 organizers — one-time, ~6h total across kickoff calls. This is not "concierge for 10 organizers" — it's "use the people who would help me anyway as the supply seed."
2. **eBay sync (already shipped S590-S591)** populates real items from Patrick's existing eBay account at real prices. The platform looks lived-in even with 1 active human running real sales. Zero added founder time.
3. **Organizer-to-organizer referral bounty** ($200 cash + 6mo free PRO per referred organizer who ships a sale) launches in week 2. Pays existing organizers to recruit. K-factor among organizers is low (1.5–2.0) but each new organizer compounds shopper acquisition through Loot Drop.

That's the supply pipe. It doesn't deliver 100 organizers in week 1, but it delivers 5–8 by week 4 with <10h of Patrick's time across the entire 4 weeks. The mechanics carry the rest.

---

## 28-day execution plan (May 1 → May 28, 2026)

### Week 1 (May 4–10) — Ship Waitlist + Loot Drop infra + Supply seeding

**Engineering work** (dispatch via `findasale-architect` for spec then `findasale-dev` for build):

1. **Waitlist Position-Jumping page** — 8 eng hours
   - New page: `pages/waitlist.tsx` with public ranked position, refer-to-jump-100-spots mechanic
   - Backend: `WaitlistEntry` model with referredById FK + position int + Founding100 boolean
   - Email sequence: position-update digest, "you jumped X spots" alert, Founding 100 unlock
   - Public landing copy: founder-direct, GR-local, no marketing-speak. NO "AI" copy per D-006.

2. **Loot Drop Cascade infrastructure** — 40 eng hours (build now, activate W3-4)
   - Cron job: weekly Friday 10AM ET selecting top 10 finds by (actualPrice / aiEstimatedValue), filtered by zip
   - Push notification template: "🔥 [City] Finds This Week — [Item] sold for $[X]"
   - Frequency cap: max 1 Loot Drop push per shopper per week (committee flagged push fatigue)
   - Per-zip targeting (committee flagged generic blasts)
   - Activate flag default OFF until 3+ real organizers ship 5+ sales each

**Patrick non-eng work (target ≤8 hours total this week):**

3. **Supply seed kickoffs** — 2 hours total
   - 30-min calls with family + 2 friends to set them up as organizers. They keep their own sale data. We get 3 supply nodes.

4. **Lock attorney for Founding-Operator agreement** — 1 hour
   - Email attorney with 1-page template (referral bounty terms, name/likeness consent for Loot Drop content). $300–500 review, 3-day turnaround.

5. **Decision lock-in (these 6 unblocks ship)** — 1 hour
   - Decisions D-S603-A through D-S603-F (see below)

### Week 2 (May 11–17) — Activate Waitlist + start TikTok creator outreach

6. **Launch Waitlist publicly.** Tweet from `@findasale`, post to LinkedIn, drop the link in any organic conversation. Zero paid, zero founder time per signup after launch — the share mechanic carries.

7. **TikTok creator outreach (cap = 5 creators, NOT 10)** — 4 hours Patrick-time over the week
   - Identify 15 mid-tier estate-sale/antique creators (50K–500K followers). The existing `advisory-outreach-drafts.md` list overlaps; pull names.
   - Draft 1 standardized outreach template (FTC-compliant per 16 CFR § 255 — committee flagged this specifically).
   - Send 15 outreach DMs (10 min each = 2.5h total). Target conversion: 5 signed creators by end of week 3.
   - Standard offer: $750/month for 4 months × 4 short-form videos/month using the app on-camera. FTC `#ad #sponsored` disclosure required in every post. Auto-attribution to the platform's "Creator Hauls" leaderboard.
   - Total cost: $750 × 5 × 4 = $15,000 over 4 months. Lower-bound budget. Committee flagged that 10 creators at $1.5K/mo each ($60K) is unsustainable for current runway. 5 creators at $750 is the sustainable ceiling.

8. **Organizer referral bounty live** — 4 eng hours
   - Each existing organizer gets a unique referral link. Successful referral (referred org ships first sale) = $200 cash + 6 months free PRO to referrer.
   - Cron job: monthly payout via Stripe.
   - Cost ceiling: 10 successful referrals/month × $200 = $2,000/mo cash + foregone PRO revenue. Capped at 25 referrals/month total.

### Week 3 (May 18–24) — Activate Loot Drop + measure

9. **Loot Drop activation gate** — flip on if 3+ real organizers have shipped 5+ sales each (committee's hard requirement). If not, hold and run another week of supply seeding via the referral bounty.

10. **Sales SSR OG meta fix** — 16 eng hours (S599 carryover)
    - `pages/sales/[id].tsx` getServerSideProps that fetches sale + items + organizer, renders SaleOGMeta server-side. Without this, Loot Drop links shared on FB/iMessage have no preview cards, killing the share→click conversion.
    - This is a hard prerequisite for Loot Drop to work as the committee scored it.

11. **First TikTok creator content drops** — happens organically once 5 creators are signed. No founder time per piece.

### Week 4 (May 25–31) — Measure + decide

12. **Measure across 4 mechanics:**
    - Waitlist signups + average referral count per signup → K-factor real measurement
    - Loot Drop open rate, share rate, signup-from-share rate → committee's K=1.5–1.8 estimate validated or invalidated
    - Creator content view counts + click-through to platform + signup-from-creator-traffic → cost-per-signup
    - Organizer-referral count (W2-4 cumulative)

13. **Go/no-go decisions for Month 2:**
    - Waitlist: scale or saturated?
    - Loot Drop: K-factor sufficient or kill?
    - Creators: extend contracts or cut?
    - Bounty Board (rejected as growth, reframe as retention): ship Month 2 if shopper retention <40% week-over-week?
    - Auto-Reels (rejected by committee): stay rejected unless content-quality bar can be hit; otherwise stays dead.

---

## Patrick's actual hours budget (revised down from prior plan)

The first pass proposed 22h/wk and got cut to 15h/wk. The viral plan with the supply-seeding shortcut targets **5–6h/wk** of Patrick time after week 1. Most of his time goes into eng dispatches + decisions, not into running the acquisition channel personally.

| Activity | Week 1 | Week 2 | Week 3 | Week 4 | Notes |
|---|---|---|---|---|---|
| Eng dispatches + reviews | 4h | 3h | 4h | 2h | Most work spawned to subagents |
| Supply seeding (one-time) | 3h | 0h | 0h | 0h | Family + 2 friends |
| Creator outreach | 0h | 4h | 1h | 1h | 15 DMs total, batch send |
| Attorney coordination | 1h | 1h | 0h | 0h | One template review |
| Measurement + decisions | 1h | 1h | 2h | 3h | Simple dashboard reads |
| **Total** | **9h** | **9h** | **7h** | **6h** | Average 7.75h/wk |

If Patrick's hours start drifting above 10h/wk in any week, the bottleneck is creator management or eng dispatch quality — not the mechanics themselves. Recalibrate, don't grind.

---

## 6 decisions Patrick must lock by Sunday May 3 to start Week 1

**D-S603-A — Waitlist incentive structure.**
Default: Founding 100 badge + 6 months free PRO (when paid tiers launch publicly) + name on a public "Founding 100" page. No referral-position-bumps in MVP because they invite gaming; ship as standard refer-to-jump-100-spots Robinhood-style mechanic only.
*Default if no answer:* Adopt as written.

**D-S603-B — Creator sponsorship cap.**
Committee flagged 10 creators at $1.5K each as unsustainable. Recommend cap of **5 creators at $750/mo for 4 months** ($15K total over 4 months). Patrick can override up to 8 creators if cash allows — but 5 is the committee's risk-adjusted ceiling.
*Default if no answer:* 5 creators at $750/mo for 4 months.

**D-S603-C — Organizer referral bounty.**
$200 cash + 6 months free PRO per organizer-referred organizer who ships their first sale. Capped at 25 successful referrals/month ($5K/mo cash ceiling).
*Default if no answer:* Adopt as written.

**D-S603-D — Loot Drop activation gate.**
Hard requirement: 3+ real organizers shipping 5+ sales each before activation. Otherwise the mechanic launches with weak data and trains shoppers to ignore the channel.
*Default if no answer:* Adopt the gate. Activation is conditional, not date-driven.

**D-S603-E — Sales SSR OG meta priority.**
This is technically S599 carryover but the viral plan depends on it. Sales pages need server-rendered OG tags so FB/iMessage/Twitter scrapers see per-sale previews. Add to Week 3 dispatch as P0.
*Default if no answer:* Promote to P0 for Week 3.

**D-S603-F — Supply seeding scope.**
Patrick onboards his family + 2 friends as the initial 3 organizers in Week 1. After that, the organizer referral bounty + eBay sync carry supply growth. No concierge for additional human strangers.
*Default if no answer:* Adopt as written. Maximum supply-side founder time = 6h, one-time.

---

## What gets killed permanently

- **Cold-call organizer outreach** — rejected by Patrick as "pathetic." Founder hours don't scale.
- **Saturday GR estate sale circuit** — same reason. Replaced by organizer-referral bounty.
- **Reddit AMAs / FB group posts** — slow burn, founder-time-per-thread, no compounding.
- **Daily founder vlog grind** — replaced by sponsored creators (their hours, not Patrick's).
- **Concierge onboarding for 5–10 strangers** — replaced by 3-friend supply seed + referral bounty.
- **Auto-Generated Reels** (Mechanic 4) — committee REJECTED. Production-quality bar too high before mechanism kicks in. Brand damage risk.

---

## Risks (top 5 from committee, in priority order)

1. **TikTok creator churn 40-50% by month 2** (Creator Economy voice). Mitigation: cap at 5 creators, lock 4-month contracts upfront with FTC `#ad` disclosure required, monitor view counts weekly, replace fast.

2. **Loot Drop launches into "real-data desert"** (Marketplace Economist voice). Mitigation: hard activation gate at 3+ organizers × 5+ sales each. Don't activate until supply is real. Holding the mechanic isn't a failure; activating it underpowered IS a failure.

3. **Waitlist saturation before paid product launches** (Growth-PM voice). 5K–10K signups happen fast; if there's no organizer/shopper product to convert them into within 60 days, the list goes stale. Mitigation: sequence waitlist conversion event to land in week 6–8, not month 4.

4. **Push notification fatigue + iOS unsubscribe spike** (Distribution Lead voice). Mitigation: max 1 Loot Drop push/shopper/week. Per-zip targeting, not blast. Track unsubscribe rate weekly; if it crosses 10%, reduce frequency.

5. **Founder-hours creep** (the original sin). Mitigation: 10h/wk hard cap. If Patrick's hours drift up, escalate to records agent for orchestrator review. Re-spawn dispatches; don't grind manually.

---

## Success criteria (measured May 31)

These replace the prior plan's metrics. Note that "5 onboarded operators" is no longer a goal — supply is a means, not an end.

| Metric | Target | Source |
|---|---|---|
| Waitlist signups | 1,000+ | Waitlist mechanic |
| Average referrals per Waitlist signup | 1.5+ (K=2.5+) | Waitlist mechanic |
| Founding 100 slots filled | 100 (full) | Waitlist mechanic |
| Real organizer count | 6–8 | Supply seed (3) + organizer referral (3-5) |
| Real sales shipped on platform | 25+ across all organizers | Real-data credibility test |
| TikTok creators signed and posting | 5 | Creator Sponsorship mechanic |
| TikTok creator content posts live | 15+ | 5 creators × 4 posts × 0.75 lag factor |
| Loot Drop activation status | ACTIVE by May 25 | Gated on supply readiness |
| Patrick founder hours/week (avg) | ≤10h | Anti-burnout signal |

If 6 of 9 hit, the engine is real and Month 2 amplifies. If <4 hit, the plan failed and we redesign — but with measurement-driven evidence, not opinion.

---

## Carryover & links

- **Full mechanic catalog (15 candidates):** `claude_docs/strategy/s603-viral-mechanics.md`
- **GTM committee detailed verdict:** `claude_docs/strategy/s603-viral-mechanics-gtm-stress-test.md`
- **Superseded prior pass (founder-hustle, rejected):** `claude_docs/strategy/s603-acquisition-action-plan.md`, `spike1-real-operator-seeding.md`, `spike2-visceral-content-plan.md`, `spike3-channel-exploration.md`
- **S599 deferred bugs (1 is now P0 for this plan):** Sales SSR OG meta is required before Loot Drop ship.
- **Strategic stance D-007:** "Get too big to ignore before partners can react." Locked S602.
- **Decision D-006:** No "AI" in user-facing copy. Use "Auto", "Smart", "Suggested".
