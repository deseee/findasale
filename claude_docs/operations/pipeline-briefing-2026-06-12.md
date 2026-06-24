# FindA.Sale — Pipeline Briefing
**Date:** 2026-06-12 (Thursday) | **Prepared by:** Sales Ops Agent (scheduled task)
**Data sources:** Railway PostgreSQL (live), MailerLite MCP
**Covers:** June 5–12, 2026 (one week since last briefing)

---

## Organizer Count

**External organizers: 0** — unchanged for 8+ weeks.

No external organizer has ever created a sale on the platform.

| Email | Name | Role | Since | External? |
|-------|------|------|-------|-----------|
| deseee@gmail.com | Patrick | ADMIN/ORGANIZER | Apr 13 | No |
| artifactmi@gmail.com | Artifact MI | ORGANIZER | Apr 13 | No (QA) |
| system-scraper@finda.sale | Directory | ORGANIZER | May 1 | No (system) |
| sales@tldnetworks.com | Manes Dean | USER | May 4 | Unclear |
| a1clcook@gmail.com | Lorene Cook | USER | May 21 | Yes |
| laurakturner@gmail.com | Laura Turner | USER | May 28 | Yes |
| **pegasus_hm@yahoo.com** | **Heidi McLemore** | **USER** | **Jun 9** | **Yes — NEW** |

One new real external signup this week: **Heidi McLemore** (June 9). Signed up as a USER (shopper role), not an organizer. Never been emailed. Warm lead to reach out to.

---

## Pipeline Status

```
Outreach Attempted → SENT (delivered) → Opens → Clicks → Signups → Organizers
     1,388+         →     679          →  est. 131+ →   5+   →    1    →     0
```

| Metric | Value | vs. Jun 5 | Signal |
|--------|-------|-----------|--------|
| Total SENT | 679 | +20 | Near-flat |
| PENDING (remaining pool) | **21** | **-2,222** | 🔴 Pool exhausted |
| ARCHIVED (purged records) | 2,687 | +2,687 (new status) | Pool cleaned |
| OPTED_OUT | 1 | no change | — |
| **External Signups** | **0** | **0** | **No conversion** |

### What happened to the pool

The 2,243 PENDING records and 480 BOUNCED records from June 5 are now ARCHIVED (2,687 total). This is the data quality cleanup flagged in the June 5 briefing — bad records (URL-encoded emails, UUID addresses, sam@gmail.com ×48, mapquest contamination) were purged from the send queue. Only **21 PENDING records remain**. The outreach pipeline via DirectoryClaimEmail is essentially exhausted.

---

## Send Volume — Dead Zone + Recovery

| Period | Sends | Notes |
|--------|-------|-------|
| May 24–28 | 486 | Ramp-up phase |
| May 29–Jun 3 | 297 | Declining |
| Jun 4–5 | 18 | Tail-off |
| **Jun 6–10** | **0** | 🔴 Pipeline dead (silently disabled — caught S939b) |
| Jun 11 | 21 | Re-enabled S939b; pulled from remaining PENDING |

**The pipeline was silently dead for 5 days** (June 6–10). S939b caught this and re-enabled it on June 10. The June 11 run pulled from the remaining PENDING pool. With only 21 records left, the automated DCE pipeline has effectively reached end-of-pool.

---

## MailerLite

| Metric | Value | vs. Jun 5 | Signal |
|--------|-------|-----------|--------|
| Total subscribers | **20** | +7 | New subs — but mostly QA |
| Real external subscribers | 5 | +1 (Heidi McLemore) | Slow organic growth |
| Campaigns sent | 1 | No change | March 8 only — 96 days ago |
| Beta Organizers group | 6 active | — | 9 sent, 2 opens, 0 clicks all-time |

**New subscribers since June 5:**
- pegasus_hm@yahoo.com — **REAL** (Heidi McLemore, Jun 9) — only real new subscriber
- qa-gtm-organizer, qa-ga4-test, qa-ga4-test2, qa-ga4-test3 — QA test accounts (Jun 11)
- test@example.com — QA test (Jun 9)
- deseee+s937e2e@gmail.com — engineering E2E test (Jun 10)

**5 real external subscribers, none ever emailed through MailerLite.** This is still the highest-probability short-term conversion path and it's untouched.

---

## Wins This Week (Growth-Adjacent)

Despite 0 organizer conversions, significant distribution groundwork was laid:

| Listing | Status | Notes |
|---------|--------|-------|
| G2 Digital Markets | ✅ Submitted (S952) | Covers G2 + Capterra + GetApp + Software Advice simultaneously |
| SaaSHub | ✅ Live (S956) | finda-sale indexed |
| Uneed | ✅ Submitted (S956) | In waiting line (account deseee-d1f4) |
| Crunchbase | ✅ Submitted (S956) | Organization record filed |
| AlternativeTo | ⏳ Eligible Jun 18 | Account "FindASale" created Jun 11; locked for 7 days |
| Product Hunt | ⏳ Assets ready (S956) | Prep materials in `claude_docs/brand/product-hunt-assets-2026-06-11.md` |
| BetaList | ⏳ Blocked — Patrick action | Submission 170511 needs logo upload + email verification |

These listings generate passive inbound. MaxSold and EstateSales.NET are already on AlternativeTo — completing that listing June 18 is a competitive priority.

---

## Infrastructure Fixes That Now Unblock Outreach

Since the last briefing, the email/outreach system received substantial hardening:

- **Null-source exclusion bug fixed (S951):** 22 organizers were silently blocked from outreach for up to 31 days due to a Prisma NULL→falsy bug in `baseWhere`. Now fixed. This means some organizers who should have been contacted weren't.
- **Bounce ingestion now works (S939):** Resend webhooks were broken 4 ways — all fixed. Bounce/complaint data now flows correctly into `EmailSuppression`.
- **DCE system-finda-sale placeholder fix (S929):** Scraper-generated addresses no longer queue for outreach.
- **Soft-bounce policy reset (S939):** A single soft bounce no longer permanently blocks outreach (now requires 5 consecutive soft bounces).

---

## Customer Signals

`customer-signals.md` does not exist. No formal Customer Champion channel active.

Inferred from DB and session notes:
- Heidi McLemore (pegasus_hm@yahoo.com) — signed up organically June 9. No outreach. Unknown how she found the platform — could be from G2/SaaSHub or direct search. Worth a personal check-in.
- Laura Turner, Lorene Cook — still USER-only, never converted to organizer, never contacted via MailerLite.
- Maple Lake Mall — still registered, USER role only. Mall format — probably a shopper or curiosity signup.

---

## Top 3 Priorities This Week

**1. Email the 5 real MailerLite subscribers — manually, this week**

Laura Turner, Lorene Cook, Maple Lake Mall, sales@tldnetworks.com, and Heidi McLemore have never been emailed. These are warm inbound signups. A plain-text personal email from Patrick asking if they run sales events costs 10 minutes and is the shortest path to the first real organizer. Suggested copy:

> *"Hi [Name] — I noticed you signed up for FindA.Sale recently. We help people manage estate sales, yard sales, pop-up markets, and auctions. Do you organize sales events? I'd love to show you around. — Patrick, FindA.Sale"*

**Do not use the automated email rails for this.** Personal Gmail only.

**2. Complete the BetaList submission — Patrick action required**

Submission 170511 is filled and waiting on: (a) Patrick uploads logo icon at betalist.com/submissions/170511/wizard/general (`claude_docs/brand/logo-icon-512.png`), (b) clicks verification link in patrick@finda.sale inbox, then proceeds through Details → Media → Makers → Finish → Submit. BetaList gets organic organizer/early-adopter traffic that matches the target persona exactly.

**3. Build a new outreach pool — DCE pipeline is exhausted**

With only 21 PENDING records left, the DirectoryClaimEmail automated pipeline is done. The scraper fleet is now at 34+ sources (FleaMarketZone, Invaluable, BidSpotter, StorageAuctions, etc.) and actively pulling data. The next logical step is:
- Run a fresh batch of scraper data through the DCE pre-validation pipeline (after the data quality filters are confirmed active)
- Prioritize estate sale and auction organizers from the new scraper sources (FleaMarketZone, Invaluable, BidSpotter, AuctionZip) — these are higher-intent than the auctioneer licensing data that produced 480 bounces

---

## Blockers

| Blocker | Impact | Owner |
|---------|--------|-------|
| DCE pool exhausted (21 PENDING) | No automated outreach path | Needs new pool from scraper data |
| 5 warm MailerLite subscribers never contacted | Highest-probability conversion path unused | Patrick — personal email this week |
| BetaList submission incomplete | Passive inbound channel blocked | Patrick — logo upload + email verify |
| AlternativeTo account locked until Jun 18 | Competitive listing gap | Auto-resolves June 18 — no action needed |
| No customer-signals.md exists | Blind to friction from real users | Customer Champion should create this file |
| No MailerLite campaign active | 0 nurture emails to inbound subscribers | Marketing content + send needed |
| Organizer count flat 8+ weeks | Core business metric not moving | See priorities above |

---

## Concern Flag

**Zero external organizers after 8+ weeks. The DCE outreach pipeline is now exhausted.**

The email acquisition channel needs a fresh pool to resume. The 5 warm inbound subscribers remain the fastest path to the first organizer. The directory listing wave (G2, SaaSHub, Uneed, AlternativeTo Jun 18, BetaList pending) may start generating inbound traffic within 2–4 weeks if listings go live — but those leads still need to be converted manually at the current stage.

The product is functional. The infrastructure is hardened. The bottleneck is acquisition touchpoints.

---

*Generated by findasale-sales-ops scheduled task | 2026-06-12 | Data: Railway PostgreSQL (live) + MailerLite MCP*
