# FindA.Sale Pipeline Briefing — 2026-05-02 (Week of May 2)

**Generated:** Saturday, May 2, 2026 — Automated weekly briefing
**Agent:** findasale-sales-ops
**Data sources:** STATE.md, patrick-dashboard.md (S622), MailerLite (live), marketing/ directory

---

## ⚠️ HEADLINE ALERT

**Organizer count has not grown in 8+ weeks. This is a P1 concern.**

The acquisition pipeline has no active outreach, no live campaigns, and no mechanism converting scraped organizer contacts into real signups. The platform is technically ready; the pipeline is not moving.

---

## 📊 Current Organizer Count

| Segment | Count | Notes |
|---------|-------|-------|
| Real beta organizers (active) | ~1–3 | Patrick + 2 seeded friends (D-S603-F). No confirmed external signups. |
| Scraped/unmanaged organizers (ESN) | ~0 live | 5,833 sales deleted S622 — needs ESN scraper re-run to rebuild |
| MailerLite "Beta Organizers" list | 1 active subscriber | As of today per live MailerLite data |
| Total MailerLite subscribers | 3 | All accounts |

**Stripe data:** Not available (no Stripe MCP connected). Trial-to-paid conversion rate cannot be calculated.

**Concern flag:** No growth in 8+ weeks meets the escalation threshold per sales-ops protocol.

---

## 🔄 Pipeline Status

### Stage Breakdown

| Stage | Count | Status |
|-------|-------|--------|
| **Leads identified** | ~84 scraped ESN orgs (pre-S622 cleanup) | Needs re-run to rebuild. Contact emails being scraped post-enrichment but ESN scraper currently at 0 sales. |
| **Contacted** | 1 | One beta access email sent March 8 via MailerLite |
| **Responded** | Unknown | 1 open (100%), 0 clicks from the March 8 send |
| **Onboarded** | ~1–3 | Patrick + 2 friends (seeded). No external organizer onboarding confirmed. |
| **Active (paying or beta)** | ~1–3 | Same as above. |

**Overall funnel conversion:** Cannot calculate — leads → contacted gap is the problem, not the conversion rate.

### Pipeline Velocity
- **New leads added this week:** 0 (ESN scraper needs re-run; claim email pipeline gated behind `CLAIM_EMAIL_ENABLED=true`, not confirmed active)
- **Outreach sent this week:** 0
- **Responses received:** 0
- **New signups this week:** 0 (estimated)

---

## 📧 MailerLite Campaign Performance

| Campaign | Status | Sent | Opens | Clicks | Sent Date |
|----------|--------|------|-------|--------|-----------|
| "Your FindA.Sale beta access is ready 😁" | **Sent** | 1 | 1 (100%) | 0 (0%) | Mar 8, 2026 |
| Copy of same (Beta Organizers group) | **Draft** | 0 | — | — | Never sent |
| 4 other campaigns | **Draft** | 0 | — | — | Never sent |

**Assessment:** One email sent ~8 weeks ago to 1 person. No campaigns sent since. The MailerLite infrastructure is set up but not being used for acquisition.

---

## 📣 Outreach Activity This Week

| Channel | Status |
|---------|--------|
| PR Wire (PRNewswire) | ⚠️ **Was scheduled for May 5 — unclear if filed.** Press release still has `[Last Name]` placeholder as of S622. Patrick action pending. |
| Gmail outreach (19 drafts) | ❌ **Not sent.** Nick Loper, Codie Sanchez, NAA, NASMM, ISA, NESA, Antique Trader, AntiqueWeek, 10 others — all sitting as P3 in dashboard. |
| 68 advisory outreach drafts | ❌ **Not sent.** 3 buckets (shopper creators, operator-creators, trade voices). All copy-paste-ready at `claude_docs/marketing/advisory-outreach-drafts.md`. |
| Facebook groups | ❌ **Not started.** Community expert posts planned (6 templates ready), posting not begun. |
| LinkedIn / Instagram | ❌ **Content exists** (today's content pipeline `content-2026-05-02.md` has a ready post targeting MaxSold photo pain point) but no evidence of posting. |
| Video (before/after demo) | ❌ **Not filmed.** Demand gen playbook Week 1 task. Status in `DEMAND_GEN_SUMMARY.md`: "Ready to film immediately." |

---

## 🔧 Customer Signals Affecting Acquisition

**`customer-signals.md` does not exist** — Customer Champion has not filed friction signals. Signals below are inferred from product sessions and marketing content:

- **MaxSold photo upload failures** are the stated competitive angle in today's content pipeline. This is the primary pain point being targeted in outreach copy — photos failing mid-gallery, broken mobile catalogs. Positioning is well-defined.
- **Canada expansion** (S621): Phase 1 targeting ON/BC/AB MaxSold-tier organizers. MaxSold serves only $50k+ estates at 25–35% commission. 18-month reaction window before MaxSold can respond. This is a high-value segment not yet being outreached.
- **No inbound signals available** — no real beta users generating friction data. This itself is a signal: the platform needs its first real external organizer to generate any customer intelligence.

---

## 🚧 Automated Pipeline Status

| Pipeline | Status | Blocker |
|----------|--------|---------|
| ESN scraper (daily 00:00 UTC) | ⚠️ Needs re-run | 5,833 sales deleted S622. Re-run required to rebuild under correct organizer attribution. |
| Claim email (Day 1/3/7 to unmanaged orgs) | ❌ Inactive | `CLAIM_EMAIL_ENABLED=true` not confirmed set in Railway. This pipeline was built to auto-reach scraped organizers — biggest acquisition lever not yet activated. |
| Enrichment backfill (contact emails) | ❌ Not run | Depends on ESN scraper re-run. `all=true` backfill pending Patrick action. |
| Eventbrite scraper | ❌ No API key | `EVENTBRITE_API_KEY` GitHub Secret not set. |
| Newspaper/Oodle RSS (02:00 UTC) | ✅ Live | No API key needed. Running. |

---

## 🎯 Top 3 Priorities This Week

### Priority 1 — Activate the claim email pipeline
**Action:** Set `CLAIM_EMAIL_ENABLED=true` in Railway env → re-run ESN scraper (GitHub Actions) → run enrichment backfill with `all=true`.

**Why:** The claim email pipeline (Day 1 / Day 3 / Day 7, 50 emails/batch) is the highest-leverage automated acquisition channel that exists right now. It reaches real organizers who are already running sales that appeared on FindA.Sale's scraped feed. They have a direct reason to care. This pipeline is built and deployed — it just needs to be turned on. Nothing else in the pipeline moves at any volume until this is active.

**Estimated impact:** ~84 organizers identified in ESN data pre-cleanup. Post re-run, could be 200–500+ with contact emails populated. Even a 5% response → onboard rate = 10–25 organizers in 30 days.

### Priority 2 — Send the 19 Gmail outreach drafts
**Action:** Review + send the 19 outreach drafts (Nick Loper, Codie Sanchez, NAA ×2, NASMM, ISA, NESA, Antique Trader, AntiqueWeek, 10 others). Currently listed as P3 in dashboard but should be P1 given zero active outreach.

**Why:** These are high-multiplier contacts — creators and trade editors whose audiences are organizers. One reply from Codie Sanchez or Nick Loper has more acquisition potential than 100 cold emails. The copy is already written. The delay has no defensible reason.

**Estimated impact:** Hard to quantify, but 1 newsletter mention or podcast segment from any Bucket 3 contact could drive 10–50 signups.

### Priority 3 — Confirm or reschedule PR Wire
**Action:** Confirm whether the PRNewswire press release was filed on May 5 as planned. If not filed: fill `[Last Name]` placeholder (3 occurrences) + real cell number in `claude_docs/strategy/s603-pr-wire-blast-package.md` Version B and file via PRNewswire eSpeed.

**Why:** The press release was Patrick's own May 5 deadline. It's now May 2 — 3 days out. If it goes out Tuesday as planned, it needs to be finalized today. If it was already filed, log it here and start tracking inbound from UTM links.

---

## 🚩 Blockers

| Blocker | Owner | Impact |
|---------|-------|--------|
| ESN scraper not re-run post-S622 cleanup | Patrick (GitHub Actions) | No scraped organizer data in DB. Claim email pipeline has nothing to send to. |
| `CLAIM_EMAIL_ENABLED` not set | Patrick (Railway env) | Automated outreach to scraped organizers: offline |
| Enrichment backfill not run | Patrick (GitHub Actions) | No contact emails populated on organizer records |
| PR Wire not confirmed filed | Patrick | National distribution event may be slipping |
| 19 Gmail drafts unsent | Patrick | Highest-potential manual outreach sitting idle |
| Video not filmed | Patrick | Demand gen playbook stalled at Week 0 |
| `/organizer-solution` landing page not deployed | Dev needed | Referral and outreach CTA has no high-converting landing page |
| `customer-signals.md` does not exist | Customer Champion | No friction data being logged |

---

## 📈 Notes for Next Briefing

- Once `CLAIM_EMAIL_ENABLED` is active, track: emails sent, open rate, response rate, and organizer signups attributed to claim email sequence.
- Once PR Wire goes out, track: wire distribution pickups, UTM traffic to `/organizer-solution` or homepage, and signup spike window (48–72h post-wire).
- Canada Phase 1 (ON/BC/AB targeting) should be added to pipeline as a distinct segment once US outreach is operational. Do not expand to Canada before 10+ US organizers are active.
- Stripe conversion data should be added to this briefing — request Stripe MCP connector or connect manually.

---

*Pipeline briefing auto-generated by findasale-sales-ops. Next briefing: 2026-05-09.*
