# Organizer Acquisition Pipeline Audit
**Date:** 2026-05-29  
**Session:** RESEARCH / SALES OPS AUDIT  
**DB queried:** Railway PostgreSQL (maglev proxy, live)  
**MailerLite queried:** via MCP  

---

## Summary Verdict

The platform has **zero external organizers**. Three external users have signed up organically but none have created an organizer profile. The outreach pipeline is sending ~100–200 emails/day with a 22% open rate and **0% click rate**. The click gap is the primary conversion blocker. Data quality in the outreach pool is a secondary problem: URL-encoded emails, UUID@yahoo.com addresses, and off-target businesses (tile shops, smoke shops, malls) are in the send queue.

---

## Part 1 — Laura Turner Lookup

**Email:** laurakturner@gmail.com  
**User ID:** cmpq0vkql0032pt4s05hnscc5  
**Signed up:** 2026-05-28 at 21:46 UTC  
**Auth method:** Google OAuth  
**Role:** USER only (no ORGANIZER)  
**Email verified:** false  
**Organizer profile:** none  
**DirectoryClaimEmail record:** none (she was never an outreach target)  
**AffiliateReferral record:** none  
**affiliateReferralCode at signup:** null  
**MailerLite:** active subscriber, added 2026-05-28 (auto-sync working)  
**Sales activity:** none  

**How she found the platform:** Organic discovery. She was not in the DCE outreach list, used no affiliate link, and arrived via Google OAuth (meaning she searched or was sent a direct link). She represents genuine inbound interest — not a QA account, not a test user.

**Status:** Signed up as a shopper or curious potential organizer. Has not converted to organizer. Recommend Patrick personally reaching out (her email is in MailerLite) to ask if she runs sales — she's the closest thing to a warm lead the platform has.

---

## Part 2 — Real User Counts

| Category | Count | Notes |
|----------|-------|-------|
| Real human users (non-scraper, non-example.com, not deleted) | 7 | Includes Patrick x2, test accounts |
| True external humans | 4 | See breakdown below |
| Users with ORGANIZER role | 3 | All internal |
| External organizers | **0** | None |
| Paid organizers (PRO or TEAMS) | 2 (TEAMS) | Patrick + Artifact MI |
| SIMPLE tier | 1 | system-scraper@finda.sale (system account) |

### All real users

| Email | Name | Roles | Tier | Since | How? | External? |
|-------|------|-------|------|-------|------|-----------|
| deseee@gmail.com | Patrick | ADMIN/ORGANIZER/USER | TEAMS | Apr 13 | Google OAuth | No |
| artifactmi@gmail.com | Artifact MI | ORGANIZER/USER | TEAMS | Apr 13 | Google OAuth | No (QA) |
| system-scraper@finda.sale | FindA.Sale Directory | ORGANIZER | SIMPLE | May 1 | System | No |
| deseee@yahoo.com | Patrick Desmond | USER | — | May 16 | Google OAuth | No (Patrick) |
| sales@tldnetworks.com | Manes Dean | USER | — | May 4 | Unknown | Unclear — no OAuth, not verified |
| maplelakemall@gmail.com | Maple Lake Mall | USER | — | May 23 | Google OAuth | Yes — but a MALL, likely shopper |
| a1clcook@gmail.com | Lorene Cook | USER | — | May 21 | Google OAuth | Yes |
| laurakturner@gmail.com | Laura Turner | USER | — | May 28 | Google OAuth | Yes |

**External organizers: 0.** Every organizer account is Patrick or a QA/system account.

---

## Part 3 — Platform Sales

All 5 platform-created sales (sourceName IS NULL) are Patrick's:

| Status | Count |
|--------|-------|
| PUBLISHED | 2 |
| ENDED | 2 |
| DRAFT | 1 |

No external organizer has ever created a sale on the platform.

---

## Part 4 — DirectoryClaimEmail Outreach Funnel

### Status breakdown (total pool: 3,380)

| Status | Count |
|--------|-------|
| PENDING (not yet sent) | 2,795 |
| SENT | 584 |
| OPTED_OUT | 1 |
| BOUNCED | 0 |

### Sends by day (warmup ramp)

All sending started 2026-05-24 — this is 6 days of sends:

| Date | Sent |
|------|------|
| 2026-05-24 | 32 |
| 2026-05-25 | 80 |
| 2026-05-26 | 80 |
| 2026-05-27 | 96 |
| 2026-05-28 | 198 |
| 2026-05-29 (partial) | 99 |

The May 28 spike to 198 is worth watching — if that exceeds the warmup schedule limit it could affect deliverability scoring.

### Engagement (touch 1 only — no touch 2/3/4 have been sent yet)

| Metric | Value |
|--------|-------|
| Total sent | 584 |
| Touch 1 opens | 130 (22.3%) |
| Touch 1 clicks | 0 (0.0%) |
| Opt-outs | 1 |
| Conversions to User account | **0** |

22% open rate is healthy and shows deliverability is working. **0% click rate is the crisis.** Nobody who opened the email clicked through to the platform.

### The one opt-out

The single opted-out recipient is **emma.dawson@macerich.com** for **Kings Plaza Mall** — a commercial shopping mall. She opened the email, then opted out. This is the wrong target audience in the pool.

### Conversion rate: DCE → User signup

0 of 584 SENT recipients have signed up for a FindA.Sale account. The outreach pipeline is generating zero registrations.

---

## Part 5 — Data Quality Issues

The PENDING pool has serious data quality problems that will waste sends and risk deliverability reputation:

### Confirmed issues

**Generic emails attributed to many businesses:** `sam@gmail.com` appears 48 times — linked to 48 different estate sale companies. This is a scraper bug where a generic contact email was copy-pasted to many listings. Every send to sam@gmail.com is wasted.

**URL-encoded email addresses:** Multiple addresses like `%20info@atheniancandle.com`, `%73%61%6c%65%73@%61%62%6f%76%65%61%6e%64%62%65%79%6f%6e%64%65%73%74%61%74%65%73.%63%6f%6d` (fully URL-encoded), and `19103215-546-9544drinks@thefranklinbar.com` (phone number prepended). These will bounce or fail silently.

**UUID-format emails:** `4f2b4952-53fe-36ea-e1bf-53d4a7a663ef@yahoo.com` — a UUID used as an email username. Not a real address.

**Off-target businesses in the queue:** Tile shops (044manager@tileshop.com, 077manager@tileshop.com), smoke shops, brewing companies, mortgage companies, malls (from mapquest.com data contamination). These businesses will never need FindA.Sale. Sending to them is wasted volume and reputation risk.

**mapquest.com contamination:** `help@mapquest.com` appears 4 times, linked to 4 different businesses. The scraper is pulling MapQuest's generic contact email from business listings that don't have their own.

---

## Part 6 — MailerLite

| Metric | Value |
|--------|-------|
| Total subscribers | 9 |
| Active | 9 |
| Sent campaigns | 1 (March 8, 2026) |
| Campaign audience | 1 person (deseee@gmail.com) |
| Campaign open rate | 100% |
| Campaign subject | "Your FindA.Sale beta access is ready 😁" |

MailerLite is essentially unused. The 9 subscribers are: Patrick, Artifact MI/Patrick QA, Laura Turner, Lorene Cook, Maple Lake Mall, sales@tldnetworks.com, lucyteall060@gmail.com, user1@test.com (QA seed), and qa256test806@example.com (QA seed).

No broadcast email has gone to real prospective organizers through MailerLite.

---

## Part 7 — Diagnosis

### (a) Is outreach converting at all?

**No.** 584 emails sent, 22% opened, 0% clicked, 0 signed up. The outreach pipeline has generated zero external organizer accounts in 6 days of sending.

The 22% open rate is a positive signal — deliverability is working, emails are landing in inboxes, and the sender reputation from the S779 fix is holding. But the open-to-click conversion is completely broken.

**Most likely causes of 0% click rate (in order of probability):**

1. **The CTA link in the email is not working or not visible.** This is the most likely culprit. The email was rebuilt after the S779 deliverability fix to swap out the raw Railway URL for the api.finda.sale domain. It's possible the tracking/click URL isn't rendering correctly in some email clients, or the link itself is broken.

2. **The email body lacks a compelling CTA.** "Claim your free listing" may not create urgency. The recipient opens, scans, doesn't see an obvious reason to click now, closes.

3. **The tracking pixel registers opens from preview panes.** Some email clients (Outlook, Gmail with images enabled) fire the tracking pixel when the preview pane scrolls over the email without the user consciously opening it. The 22% "open rate" might be inflated, meaning fewer real opens than the number suggests.

### (b) What's the biggest leak in the funnel?

**The click gap.** The funnel is: [Email delivered → Email opened → CTA clicked → Landing page → Sign up → Organizer profile created]. Every single person is dropping out at the click step.

The second-biggest issue is data quality. Some meaningful fraction of those 584 sends went to the wrong businesses (tile shops, mapquest emails, URL-encoded addresses). Those can never convert regardless of email quality. And `sam@gmail.com` has 48 queued sends ahead — that's 48 more wasted sends to one inbox.

### (c) What should Patrick do this week to get the first real external organizer signed up?

**One action: Send 10 direct, personal emails to real estate sale companies from the SENT list.**

The automated system is working at the wrong level of personalization. A 22% open rate means ~130 people read something. Zero clicked. The email either has a broken link or a weak CTA.

Steps:
1. **First, verify the email CTA link works.** Go to one of the SENT records in the Railway admin, find the claim URL it generated, and click it. If it's broken, that's the only fix needed and it will unlock conversion immediately.
2. **Pick 10 legitimate estate sale companies** from the SENT list — real businesses like "Classic Estate Sales," "White Pine Estate Sales & Auctions," "New Chapter Estate Sales" — and send a personal one-sentence email from Patrick's own Gmail: *"Hey [name] — I run FindA.Sale, a free tool to help estate sale organizers list and manage their sales. Would you be open to a quick demo?"* No template. No HTML. Plain text from a real person.
3. **Reach out to Laura Turner directly.** She found the platform organically — that's a warm signal. A personal email asking if she runs sales (or if a friend does) costs 30 seconds and could yield the first genuine organizer signup.

---

## Decisions Needed

| # | Issue | Options |
|---|-------|---------|
| D-1 | `sam@gmail.com` is queued 48 times in PENDING. | **FIX:** Delete these 48 DCE rows and blocklist this email address in the scraper's email dedup logic. |
| D-2 | URL-encoded email addresses in the queue. | **FIX:** Add a DCE pre-send validation step that rejects any emailAddress containing `%` or non-ASCII characters. |
| D-3 | Off-target business types (malls, smoke shops, etc.) in the queue. | **SCOPE DECISION:** Implement a business-type filter on DCE using businessName keyword matching before queuing. |
| D-4 | The email CTA link may be broken. | **VERIFY:** Patrick should manually click the claim link from a SENT email before any other outreach work. |
| D-5 | Outreach volume hit 198 sends on May 28. | **CHECK:** Verify the warmup schedule cap is set correctly. 198/day may exceed the current warmup phase limit. |

---

*Audit run 2026-05-29. Data from Railway PostgreSQL (live) + MailerLite MCP.*
