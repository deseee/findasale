# FindA.Sale — Pipeline Briefing
**Date:** 2026-06-05 (Friday) | **Prepared by:** Sales Ops Agent (scheduled task)
**Data sources:** Railway PostgreSQL (live), MailerLite MCP

---

## ⚠️ P0 ALERT: 480 Bounces — Sender Reputation at Risk

The DirectoryClaimEmail pool has accumulated 480 BOUNCED records — a **42% bounce rate** on total processed sends. Industry acceptable threshold is under 2%. This level of bouncing almost certainly triggers spam filters at major providers (Gmail, Yahoo, Outlook) and may have already damaged the `outreach.finda.sale` sender reputation. This is the highest-priority item in this briefing.

---

## Organizer Count

**External organizers: 0** (unchanged for 7+ weeks)

No new real user signups since May 29. The 7 real human accounts in the system are:

| Email | Name | Roles | Since | External? |
|-------|------|-------|-------|-----------|
| deseee@gmail.com | Patrick | ADMIN/ORGANIZER | Apr 13 | No |
| artifactmi@gmail.com | Artifact MI | ORGANIZER | Apr 13 | No (QA) |
| sales@tldnetworks.com | Manes Dean | USER | May 4 | Unclear |
| a1clcook@gmail.com | Lorene Cook | USER | May 21 | Yes |
| maplelakemall@gmail.com | Maple Lake Mall | USER | May 23 | Yes (mall) |
| laurakturner@gmail.com | Laura Turner | USER | May 28 | Yes |
| deseee@yahoo.com | Patrick Desmond | USER | May 16 | No |

The 2 organizer accounts (Patrick + Artifact MI) are both BRONZE tier with `onboardingComplete = false`. No external organizer has ever created a sale on the platform.

---

## Pipeline Status

```
Outreach Attempted → SENT (delivered) → Opens → Clicks → Signups → Organizers
     1,140          →     659          →  131  →   5    →    0    →     0
```

| Metric | Value | vs. May 29 | Signal |
|--------|-------|------------|--------|
| Total SENT | 659 | +75 | Slowing |
| Total BOUNCED | **480** | +480 | 🔴 CRITICAL |
| Touch 1 Opens | 131 | +1 | Flat |
| Touch 1 Clicks | 2 | +2 | Tiny improvement |
| Touch 2 Sent | 84 | New | Follow-up running |
| Touch 2 Opens | 18 | — | 21.4% rate |
| Touch 2 Clicks | 3 | — | 3.6% rate |
| **External Signups** | **0** | **0** | **No change** |

Touch 2 has a better click rate (3.6%) than Touch 1 (0.30%), which is typical for follow-up sequences — but 5 total CTA clicks with 0 conversions still means the landing experience is not converting.

---

## Outreach Volume — Sharp Drop This Week

| Week | Sends |
|------|-------|
| May 18–24 | 32 |
| May 25–31 | 718 |
| **Jun 1–5** | **57** |

The send volume collapsed this week from 718 to 57. This requires investigation. Possible causes:
1. **Bounce-triggered throttle:** The sending system or Railway may have auto-throttled after detecting the bounce spike (52 bounces on May 28 alone).
2. **Warmup schedule reached a pause point** in the escalation plan.
3. **Job failure:** The outreach cron job may have errored silently.

The 480 bounces occurred primarily during the high-volume week (May 24–29), with counts declining after. This pattern suggests the burst-send triggered bounce processing in batch, not that sending has been paused. But the volume drop needs to be confirmed.

---

## The Bounce Crisis

**480 bounces out of 1,140 processed = 42.1% bounce rate.**

From the May 29 pool audit, the root causes are known:
- **`sam@gmail.com` queued 48 times** — one address linked to 48 different "organizers" in the scraper data
- **URL-encoded email addresses** (`%20info@...`, fully percent-encoded addresses)
- **UUID-format addresses** (`4f2b4952-...@yahoo.com`)
- **mapquest.com contamination** — `help@mapquest.com` linked to 4 businesses
- **Off-target business types** (malls, tile shops, smoke shops)

These were flagged in the May 29 audit as Decisions D-1 through D-5. None appear to have been acted on. The bounce spike is the direct consequence.

**Remaining PENDING pool: 2,243.** If these share the same data quality problems, sending all of them would compound the reputation damage.

---

## MailerLite

| Metric | Value | vs. May 29 |
|--------|-------|------------|
| Total subscribers | 13 | +4 |
| Real external subscribers | 4 | Flat |
| Campaigns sent | 1 | No change (March 8 only) |
| Last campaign | Mar 8, 2026 | 89 days ago |

The 4 new MailerLite subscribers since May 29 are all QA test accounts added during dev sessions (qa-tranche-b-s860, qa-tranche-b-s861, qa-tranche-s854, qa302test832). Zero real subscriber growth.

The 4 real external subscribers (Laura Turner, Lorene Cook, Maple Lake Mall, sales@tldnetworks.com) have never been emailed through MailerLite. This is an unused warm list.

---

## Customer Signals

`customer-signals.md` does not exist. No Customer Champion data.

Inferred from DB:
- **Organic visitors are signing up but not converting to organizer.** Laura Turner, Lorene Cook, and Maple Lake Mall all registered as USER (shopper) role, never clicked into organizer onboarding.
- **Outreach is not landing people.** 131 opens from 659 sends produced 5 clicks and 0 signups. Either the email CTA link was broken (D-4 from May 29), the landing page doesn't convert, or both.

---

## Top 3 Priorities This Week

**1. Stop the bleeding on bounces before sending more**

Do not send additional outreach from the 2,243-record PENDING pool until:
- The bounce root causes (URL-encoded emails, UUID addresses, `sam@gmail.com` ×48, mapquest contamination) are cleaned from PENDING.
- A data quality validation step is added to the DCE pre-send job.
- Deliverability is confirmed not damaged (check `outreach.finda.sale` domain reputation via Google Postmaster Tools or MXToolbox).

Sending 2,243 more emails through a potentially damaged sender reputation will make acquisition harder, not easier.

**2. Manually email the 4 warm MailerLite subscribers**

Laura Turner, Lorene Cook, Maple Lake Mall, and sales@tldnetworks.com have never been contacted. They found the platform organically. A personal, plain-text email from Patrick asking "do you run sales events?" costs 10 minutes and represents the highest-probability path to the first real external organizer. Template:

> *"Hi [Name] — I noticed you signed up for FindA.Sale recently. We're a free tool to help people manage estate sales, yard sales, and pop-up markets. Do you run sales events? Happy to show you around. — Patrick, FindA.Sale"*

**3. Investigate the send volume collapse**

Why did sends drop from 718/week to 57/week? Check the Railway backend logs for the outreach cron job. If it's silently failing, the pipeline is effectively paused — which may be unintentional. Conversely, if it paused due to bounce detection, that's the system working correctly but needs to be acknowledged and addressed.

---

## Blockers

| Blocker | Impact | Action Needed |
|---------|--------|---------------|
| 480 bounces unaddressed | Sender reputation damage | Patrick: run DCE data cleanup before next send batch |
| send volume collapse | Pipeline may be paused | Patrick: check Railway backend logs for outreach cron job |
| 0 click → signup conversions | Full-funnel break | Verify claim URL in a SENT email still works (D-4 from May 29 audit — never confirmed) |
| No customer-signals.md | Blind to friction signals | Customer Champion should create and maintain this file |
| MailerLite warm list never emailed | Missed warm outreach | Send personal email to 4 real subscribers this week |
| No organic marketing running | No pull channel | Before/after video + community posts from demand gen playbook unstarted |

---

## Concern Flag

**Zero external organizers after 7+ weeks of outreach and product development.** The platform has 885+ sessions of QA and feature work behind it. The core product is functional. The only thing missing is organizers using it.

The bounce crisis makes this urgent: the window to send outreach to the remaining 2,243 PENDING organizers may be closing if the sender domain reputation has been damaged. Cleaning the pool and verifying deliverability needs to happen before any further automated sends.

---

*Generated by findasale-sales-ops scheduled task | 2026-06-05 | Data: Railway PostgreSQL + MailerLite MCP*
