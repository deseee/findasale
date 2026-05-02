# Organizer Acquisition Strategy — First-Contact Pipeline

**Status:** v3 RECOMMENDATION (S626)
**Owner:** Patrick
**Synthesizes:** Innovation, Marketing, Customer Champion, Advisory Board (Risk + GTM + Growth), Tech Stack, Cadence research

**v3 changes from v2:**
- All seven §10 open decisions resolved.
- Email templates rewritten — no personal name, no "founder" voice, institutional sender. Per Patrick: "this is a professional site not a site that worries about making Patrick look good or come across as a 'founder' or any other silicon valley term."
- Reply handling switched from "24h SLA, route warm replies to Patrick" to fully automated per **decisions-log S268** (Zero-Human Automated Support Stack: L1 FAQ, L2 auto-responder, L4 only catastrophic to Slack).
- Email tooling: Phase 1 runs on Google Workspace + custom Postgres cron ($6/mo via existing Workspace), migrate to Instantly.ai when volume crosses ~500/day.
- Send to all tiers — segmentation kept for personalization data, dropped as a budget gate (email-only Phase 1 cost is rounding error per contact).

---

## 1. Executive Summary

We have a database of scraped organizer records (estate sales, yard sales, auctions, flea markets, consignment shops) with auto-generated unclaimed storefronts already live on FindA.Sale. The pipeline turns those records into claimed listings → activated organizers → paid PRO/TEAMS.

**Recommended approach: PROCEED.**

The single highest-leverage move is the **"your storefront is already built"** hook. Every cold email links to two things — the prospect's personalized preview URL (we did the work) and the `/video` page (here's what you get). Two assets do more work than three paragraphs of copy.

Phase 1 is **email only** — sent from `outreach@finda.sale` Workspace seat, orchestrated via a custom Postgres cron, fully automated reply handling. SMS and postcard stay parked until email-only baseline data exists. No human in the reply loop — automation handles classification, suppression, and FAQ-style answers.

Three non-negotiables before launch: (a) separate Workspace seat for `outreach@finda.sale` so cold-send reputation is isolated from `patrick@finda.sale`; (b) suppression list table with bounce/complaint webhooks; (c) 4-week domain warm-up on the new outreach subdomain. Total time-to-launch: 2–3 weeks. Phase 1 marginal cost: ~$6/month.

---

## 2. Strategy at a Glance

| Element | Recommendation |
|---|---|
| **Primary hook** | "Your storefront is already built — here it is, here's a 2-min video on what it does" |
| **Channel — Phase 1** | Email only |
| **Channel — Phase 2 (data-gated)** | Postcard for high-value segment, *only if* email-only Phase 1 reply rate < 2.5% after 8 weeks |
| **Channel — never (without consent)** | SMS to scraped numbers, voicemail drop |
| **Sequence shape** | 4-touch sprint over 21 days, then break-up email, then quarterly nurture |
| **Personalization** | First name + business name + city + sale-type segment + preview URL + tracked video URL |
| **Sender** | `outreach@finda.sale`, "From: FindA.Sale" — institutional, no personal name, no founder voice |
| **Reply handling** | Fully automated per S268 — auto-suppress on negative, auto-respond with FAQ + `/video` link on questions, no human routing |
| **Cold-email tooling — Phase 1** | **Google Workspace seat + custom Postgres cron** (~$6/mo). Reuses our existing Postgres, Railway cron, Resend webhook patterns. |
| **Cold-email tooling — Phase 2 (≥500/day)** | **Instantly.ai** ($30–$77/mo). Migrate when volume justifies vendor cost. |
| **Transactional email** | **Resend** stays (claim verification, welcome series). No change. |
| **Domain architecture** | `outreach.finda.sale` subdomain, separate SPF/DKIM/DMARC, 4-week warm-up |
| **Compliance verdict** | 🟢 Email (US, with conditions) · 🔴 SMS without opt-in · 🔴 Voicemail without opt-in |
| **Phase 1 marginal cost** | $6/mo (Workspace seat) — domain, DNS, Postgres, cron all already owned |
| **CAC target** | <$200 for PRO ($29/mo, ~$696 LTV); FREE/awareness CAC subsidized by upgrade conversion |
| **Time to first send** | 14 days from approval (8 days domain warm-up + 6 days build) |

---

## 3. Channel Priority & Sequence

### 3.1 Why Email-Only Phase 1

The Risk + GTM verdict is unambiguous on SMS and voicemail: TCPA on scraped numbers is $500–$1,500 per violation, and "prior express written consent" can't be manufactured retroactively. Both stay parked until we collect explicit opt-ins through the website.

Postcard is more defensible — there's no CAN-SPAM equivalent for postal mail — but the marginal lift of "postcard added to email" over "email alone" is not well-measured for our exact use case. The honest move is to run email-only first, get clean baseline data, then test postcard as a targeted experiment if email reply rate underperforms.

The storefront preview link + 2-minute video already do the work that the multi-channel cadence research recommends. We have novelty without needing extra channels for novelty's sake.

### 3.2 Segmentation — Used for Personalization, Not Budget

Phase 1 cost is essentially flat per contact, so we send to all tiers. Segmentation is kept *only* for personalization signals (sale type, region phrasing) and for measuring conversion by tier in the data. We do not gate sends by tier.

| Tier | Definition | Treatment |
|---|---|---|
| **Tier 1 (Hot)** | googleRating ≥ 4.0 AND has website AND contactEmail present | Full 4-touch sequence |
| **Tier 2 (Warm)** | googleRating ≥ 3.5 OR scrapedEmail present | Full 4-touch sequence |
| **Tier 3 (Cold)** | Below Tier 2 | Full 4-touch sequence (cost is identical) |
| **Drop** | No usable contact field OR matches global suppression | No outreach |

The contactEmail priority ladder we already use in the scraper applies (contactEmail → phone → website → facebook → instagram → esnCompanyPageUrl). Phase 1 stops at the email rung.

---

## 4. Message Framework

### 4.1 Voice Rules

The /video page is the canonical voice. Every email and preview-page asset must sound like it could live next to the video without clashing.

- **No personal names. No "founder" voice.** Sender is "FindA.Sale" or "The FindA.Sale Team." Institutional, not personality-based.
- One ask per email. One CTA. The links carry the rest.
- No fabricated stats, no "we talk to organizers all the time" social proof we can't back up. No "X organizers near you" unless the number is real.
- Use the actual product language: photo-to-listing, Smart Pricing, QR checkout, the offer ("free forever, first sale on PRO").
- Inclusive sale-type language always — "estate sales, yard sales, auctions, flea markets, and consignment."
- Never the term "AI." Use Auto, Smart, or Suggested. (The /video page already does this — match it.)

### 4.2 Pain Points (used for segmentation, not put into copy)

These are real but stay implicit — the preview link and the video do the showing:

1. Inventory hell — managing 200–500 items across spreadsheets and three photo apps
2. Local discoverability — sales found *after* they end
3. Margin compression — 13–20% platform fees on competing platforms
4. Settlement chaos — dispute-prone consignment / auction settlement records
5. No mobile experience for shoppers

We don't list these in emails. The video shows the fix.

### 4.3 Subject Line — Pick One

No A/B/C test. Subject line for Phase 1:

> **We built you a storefront on FindA.Sale**

It's plain, it's true, it tells the prospect exactly what's inside, and it doesn't trip any of the spam triggers or silicon-valley red flags. Use it across Touch 1. Touches 2–4 use distinct subject lines (see templates below) so the sequence doesn't read as a single spam thread.

### 4.4 Email Templates

#### Template A — Touch 1, Day 0

> **Subject:** We built you a storefront on FindA.Sale
>
> Hi [Name],
>
> FindA.Sale is an app for estate sales, yard sales, auctions, flea markets, and consignment. We pulled [Business Name] from public business records and set up a free storefront for you — it's here: **[preview link]**
>
> Claim takes about 30 seconds, no credit card. Your first sale runs on the full PRO toolkit, free.
>
> See how the app works in 2 minutes: **[https://finda.sale/video?src=outreach-a]**
>
> Not for you? Ignore this and the page stays unclaimed.
>
> — The FindA.Sale Team
> [physical address] · [unsubscribe]

#### Template B — Touch 2, Day 4 (non-openers of A)

> **Subject:** Did you see your FindA.Sale storefront?
>
> Hi [Name],
>
> A few days ago we sent a link to a free storefront set up for [Business Name] on FindA.Sale. In case the email didn't land, here it is: **[preview link]**
>
> 2-min walkthrough on how the app works: **[https://finda.sale/video?src=outreach-b]**
>
> Free to claim, no card. First sale runs on the full PRO toolkit.
>
> — The FindA.Sale Team
> [physical address] · [unsubscribe]

#### Template C — Touch 3, Day 9 (openers who didn't click)

> **Subject:** How [Business Name] gets discovered on FindA.Sale
>
> Hi [Name],
>
> FindA.Sale is the discovery app for estate sales, yard sales, auctions, flea markets, and consignment. Active organizers in your area get listed automatically so local shoppers can find your sales on the map.
>
> [Business Name]'s storefront is here: **[preview link]**
>
> The app does photo-to-listing (snap a picture, the listing writes itself), Smart Pricing, and QR checkout for in-person sales. 2-min demo: **[https://finda.sale/video?src=outreach-c]**
>
> Free forever, first sale on PRO.
>
> — The FindA.Sale Team
> [physical address] · [unsubscribe]

#### Template D — Touch 4, Day 21 (break-up)

> **Subject:** Closing the loop on FindA.Sale
>
> Hi [Name],
>
> A few notes have gone out about the FindA.Sale storefront for [Business Name]. No response, so this is the last one — no more emails after this.
>
> If you ever want it: **[preview link]**
>
> — The FindA.Sale Team
> [physical address] · [unsubscribe]

### 4.5 Anti-Pattern List

Never use: ALL-CAPS subject lines, multiple exclamation marks, `$$$`, "URGENT", "ACT NOW", "guaranteed", "limited time", "exclusive offer", "risk-free", "click here", emoji in subjects, vague claims ("earn thousands"), VC-pitchy language ("revolutionizing", "leveraging", "synergies"), invented social proof ("5,000+ organizers"), fake urgency, dark-pattern opt-out, single sale-type framing ("estate sales" alone), the term "AI", any first-person founder voice ("I built," "I'm the founder"), any personal name on the sender or sign-off.

---

## 5. Cadence Spec

### 5.1 The 4-Touch Sequence

| Touch | Day | Channel | Variant | Rule |
|---|---|---|---|---|
| 1 | Day 0 | Email — Template A | Storefront-built | Tue–Thu 10am prospect-local |
| 2 | Day 4 | Email — Template B | Reminder | Non-openers of #1 |
| 3 | Day 9 | Email — Template C | Discovery angle | Openers who didn't click |
| 4 | Day 21 | Email — Template D | Break-up | All non-claimers |

After Touch 4, move record to **quarterly nurture** — one educational email per quarter (no hard CTA, e.g., "5 listing tips this season"). Re-attempt full sequence only after 90 days of zero engagement and only if a meaningful product release justifies the touch.

### 5.2 Why 4 Touches Not 8

Industry default is 8. We're cutting because:
1. Each extra touch raises spam-complaint risk on a list this small.
2. The /video page is doing work the cadence is normally compensating for.
3. The break-up email recovers 5–10% of non-responders and is the single highest-ROI touch — including it at Day 21 is more valuable than Touches 5, 6, 7, 8.
4. Shorter sprint frees us to re-segment and run again on cold leads in 90 days with new messaging.

### 5.3 Send Window

Tue–Thu, 10am–2pm prospect-local time zone. Avoid Mon (inbox overflow), Fri afternoon (ignored till Mon), and weekends. Time zone derived from `address` field; default Eastern if missing.

### 5.4 Personalization Tiers

| Scale | Required merge fields |
|---|---|
| ≤ 10k | First name, business name, city, sale-type segment, preview URL, video URL with `?src=` |
| 10k–50k | Add: county/region phrasing variants |
| 50k+ | Same fields, scaled merge logic — no human personalization |

### 5.5 Suppression Rules

| Trigger | Action | Permanent? |
|---|---|---|
| Unsubscribe link clicked | Email channel suppressed | Permanent |
| Reply contains "stop", "unsubscribe", "remove me", "not interested" | Email channel suppressed | Permanent |
| Hard bounce (1×) | Email channel suppressed | Permanent |
| Soft bounce (3× consecutive) | Email channel suppressed | Permanent |
| Spam complaint (ESP feedback loop) | All channels suppressed; flagged for review | Permanent |
| Reply received (any) | Sequence paused; auto-router takes over (see §5.6) | — |
| 4-touch sequence complete, no engagement | Move to quarterly nurture | 90-day review |

**Architecture:** New table `OutreachSuppression { email, phone, reason, suppressedAt }`. Webhook from Workspace bounce events into a Postgres-side handler (or Instantly.ai webhook in Phase 2). Manual entry path for replies. Every send checks suppression first.

### 5.6 Reply Handling — Fully Automated (per decisions-log S268)

This aligns with the **Zero-Human Automated Support Stack** locked 2026-03-24. No SLA promised. No calendar booking. No human routing for normal replies.

**Auto-classifier on every inbound reply, in order:**

1. **Negative keywords** ("stop", "unsubscribe", "remove me", "not interested", "leave me alone", profanity) → suppress permanently. Send single confirmation: *"You're unsubscribed. You won't hear from us again. — The FindA.Sale Team."*
2. **FAQ keywords** ("how did you", "is this free", "what's the catch", "are you spam", "who is this") → auto-respond with the canonical answer (§6.5) + link to /faq + link to /video. Suppress remaining sequence touches.
3. **Interested keywords** ("tell me more", "interested", "how does it work", "sign up", "yes") → auto-respond with the claim instructions (link to preview URL + link to /video?src=outreach-reply + link to /register?src=outreach-reply). Suppress remaining sequence touches. The product does the conversion, not a human.
4. **Catastrophic / legal threat** ("lawyer", "attorney", "FTC", "lawsuit", "TCPA", "CAN-SPAM violation") → suppress permanently across all channels, log to a `LegalAlert` table, fire L4 escalation to Patrick's Slack per S268.
5. **Anything else** → log as "unclassified" to a queue. Auto-respond with a polite generic reply pointing to /faq and /video. No human required for default behavior.

No `Patrick inbox` routing. No 24h SLA. The product, the FAQ, and the video are the support stack.

---

## 6. Video Integration & Claim Flow

### 6.1 The /video Page Is the Landing — Use It

The /video page is already a complete landing: 2-min mobile-native demo, organizer/shopper feature split, the offer ("free forever, first sale on PRO"), FAQ, sticky CTA, and `?src=` parameter passthrough to /register for attribution. **Do not build a new landing page.** Drive cold traffic straight here with per-touch source codes:

| Source code | Used in |
|---|---|
| `?src=outreach-a` | Email Template A (Touch 1) |
| `?src=outreach-b` | Email Template B (Touch 2) |
| `?src=outreach-c` | Email Template C (Touch 3) |
| `?src=outreach-preview` | "See how it works" link from unclaimed storefront preview |
| `?src=outreach-reply` | Auto-response to interested replies |
| `?src=outreach-postcard` | Postcard QR (Phase 2 only) |

The page already passes `?src=` through to /register, so signups carry attribution all the way to conversion. No code work needed for tracking.

### 6.2 The Unclaimed Storefront Preview Page (work needed here)

When a prospect clicks the preview link in the email, the unclaimed storefront they land on needs a small upgrade:

- **Top banner** (above the existing amber claim banner): "We built this storefront automatically from public business records. **See how the app works in 2 min →** [link to /video?src=outreach-preview]"
- **Trust strip:** institutional — FindA.Sale logo + Grand Rapids, MI address + privacy promise ("Your info is never sold. No spam.")
- **"How did we find you?" link** → 1-paragraph plain-English answer: "Public business directories, same place Google Maps gets it. We don't buy or scrape personal data, and your contact info is never shared."
- **Quiet opt-out link** at the bottom: "Don't want a storefront here? Request removal."

This is a small Polish dispatch, not a build. The Claim modal itself stays as-shipped (#361).

### 6.3 The Verification Email (sent via Resend, transactional)

> **Subject:** Claim [Business Name] on FindA.Sale
> **Preheader:** Verify in 60 seconds. No credit card needed.
>
> Hi [Name],
>
> Someone (probably you) asked to claim [Business Name] at [Address] on FindA.Sale.
>
> **[Verify Your Listing]** — link valid 48 hours
>
> If that wasn't you, ignore this email. The listing stays unclaimed.
>
> Questions? Reply to this email or visit our help center.
>
> — The FindA.Sale Team
> Grand Rapids, MI · [physical address]

### 6.4 First Screen Post-Verification

Headline: "Welcome, [Name]. Your storefront is yours."
Sub: "Your first sale runs on the full PRO toolkit. Let's set it up."

Three action cards in priority order:
1. **Create your first sale** (primary CTA, calendar icon)
2. **Watch the 2-minute walkthrough** (secondary, embeds /video for retention)
3. **Invite a teammate** (tertiary, "free for everyone")

### 6.5 Canonical Auto-Reply Answers

Used by the §5.6 auto-classifier and by the /faq page.

| Trigger | Response |
|---|---|
| "how did you get my info" | "Public business records — same place Google Maps finds you. We don't buy or scrape personal data, and your contact info is never shared." |
| "is this free" | "Yes. The platform is free forever. Your first sale runs on the full PRO toolkit — Smart Pricing, Brand Kit, eBay sync, Advanced Analytics — all free. After that, stay free, or $29/month, or $9.99 per sale." |
| "why did you create a page without me" | "Auto-generated listings help local shoppers find you when they search. The page stays out of search until you claim it, and you can request removal any time." |
| "are you going to spam me" | "One verification email after you click claim. After that, nothing until you publish a sale. You control all email preferences in settings." |
| "what's the catch" | "No catch. Free works fine if you run one sale a year. We make money when organizers upgrade for the marketing toolkit, or when items sell through the platform." |

### 6.6 Activation Milestones

| Milestone | Criteria | Target |
|---|---|---|
| Claimed | Email verified, profile claimed | 40% of email-clickers within 48h |
| Active | ≥1 real sale created (any state) | 60% of claimed within 7 days |
| Activated | Sale published + ≥1 item with photo | 40% of claimed within 14 days |

### 6.7 No Credit Card at Signup

Confirmed. Organizer must publish a real sale before any payment prompt. Claim is identity-proof; publish is intent-proof. The PRO upgrade pitch only lands once the organizer has invested in real content. Matches Stripe / Notion / Mailchimp playbook.

---

## 7. Tech Stack & Cost Model

### 7.1 The Free-ish Option Patrick Asked For

**Phase 1 cold outreach runs on Google Workspace + a custom Postgres cron.** We already pay for Workspace. Adding a separate `outreach@finda.sale` seat for reputation isolation costs $6/mo. The orchestration logic — sequence advancement, send scheduling, suppression checks, bounce handling, reply classification — runs in our existing Postgres + Railway cron stack. Total marginal cost: **$6/month**.

This works because:
- Workspace supports SMTP send via Gmail API and the daily limit (~500/day) covers Phase 1 volume comfortably.
- We already have Postgres, cron runners, and Resend webhook patterns. Building outreach orchestration on top is days of work, not a vendor integration.
- Suppression list lives in our DB next to the rest of organizer data. Single source of truth.
- Reply handling integrates directly with our existing FAQ + /video assets.
- Reputation lives on our own domain, not a shared IP pool.

Trade-off: we build warm-up tracking, reply classification, and analytics ourselves. That's a few extra days of Dev. At ≤500/day Phase 1 volume, the work is small.

**Phase 2 migration trigger:** when daily send volume exceeds ~500/day OR we want multi-inbox rotation for deliverability, migrate to **Instantly.ai** ($30–$77/mo). The Postgres data model stays — Instantly becomes the send-and-track layer.

### 7.2 Why Other "Free" Options Don't Fit

Considered and ruled out:

| Option | Why ruled out |
|---|---|
| Resend / Postmark / Mailgun / SendGrid free tiers | TOS explicitly prohibits cold outreach |
| Brevo (formerly Sendinblue) free tier | Same — transactional / opt-in marketing only |
| Zoho Mail free tier | Bulk + cold outreach blocked in TOS |
| Amazon SES | Cold outreach requires production access approval; difficult to obtain and TOS-restricted |
| Apollo.io free tier | 100 emails/day cap, shared IP, no warm-up — works for tiny pilots only |
| ManyReach free trial | 250 free emails one-time, then paid |
| Self-hosted ListMonk / Sendy / open-source bulk senders | Still require an SMTP relay that allows cold; same TOS problem upstream |
| Custom self-hosted SMTP (Postfix on a VPS) | Deliverability at zero — new IP, no reputation, immediate spam folder |
| GitHub PaulleDemon/Email-automation OSS | Unmaintained, no warm-up, no reply detection — same as building from scratch but worse |

Workspace works because we're sending from a real, established mail platform that has trust with Gmail, Outlook, Yahoo. The trade-off vs. Instantly.ai is: we manage volume more carefully (no automated multi-inbox rotation at scale) and we build our own warm-up cadence.

### 7.3 Domain & Sending Architecture

- **New subdomain:** `outreach.finda.sale` (cold) — separate from any transactional Resend domain.
- **DNS:** SPF + DKIM + DMARC on the new subdomain. DMARC starts at `p=none` for warm-up, moves to `p=quarantine` after 30 days.
- **Workspace seat:** `outreach@finda.sale` (the from-address). Send-As alias uses the new subdomain so SPF/DKIM align.
- **Warm-up plan:** Days 1–3 send 50/day, Week 2 send 150/day, Week 3 send 300/day, Week 4 send 500/day, Week 5+ steady state. Workspace soft-caps at ~500/day for SMTP relay (~2k/day for users); we operate well under that.
- **Reputation isolation:** if `outreach@finda.sale` ever gets flagged, `patrick@finda.sale` and the transactional `mail.finda.sale` reputations stay clean.

### 7.4 Total Cost Model

| Scale | Phase 1 (Workspace + custom) | Phase 2 (Instantly.ai) | Notes |
|---|---|---|---|
| **≤ 500/day** | $6/mo | — | Workspace cap, sufficient for ~100 records/day at 4-touch cadence |
| **500–10k/day** | — | $30/mo | Migrate to Instantly.ai, multi-inbox rotation, automated warm-up |
| **10k–50k/day** | — | $30–$77/mo | Same Instantly.ai plan tier |
| **50k+/day** | — | $77+/mo | Possibly add dedicated IP at this point |

One-time setup cost: ~$0 (DNS records are free; Workspace seat is the only marginal cost).

**CAC math at 10k contacts/quarter (steady state, Phase 2 Instantly.ai):**
- 10k contacts → 9.4k delivered (94%) → 2k opened (21%) → 80 replied (4%) → 28 claimed (35% reply→claim) → 17 activated (60%) → 3 paid PRO (15%)
- Spend: ~$90/quarter
- **CAC per paid PRO: ~$30**
- **LTV per PRO ($29/mo × 24 mo): ~$696**
- **LTV/CAC: ~23x**

Numbers are projections from industry benchmarks against our funnel. Real Phase 1 data replaces the projection at Week 8.

---

## 8. Compliance Checklist

### 8.1 CAN-SPAM (US Email) — must hold on every cold send

- ✅ Sender identity accurate ("FindA.Sale" / "The FindA.Sale Team" — institutional, not a fake person)
- ✅ Physical postal address in every email footer (Grand Rapids, MI)
- ✅ Working unsubscribe link in every email
- ✅ Unsubscribe honored within 10 business days (target: same hour, automated)
- ✅ Subject line truthful — no misrepresentation
- ✅ Email is identifiable as commercial (the storefront preview link makes this obvious)
- ✅ Dedicated outreach subdomain — transactional reputation isolated

### 8.2 TCPA (US SMS / Voice) — Phase 1 = none

- ❌ Phase 1: NO SMS, NO VOICEMAIL to scraped numbers — full stop
- Phase 2 prerequisites (if added): written prior express consent through website opt-in form, A2P 10DLC brand + campaign registration, time-of-day rules (8am–9pm prospect-local), STOP keyword honored, suppression list

### 8.3 EU + Quebec — defer to Phase 2

- Phase 1: SQL filter at send time excludes any record with EU country code or QC postal code (G/H/J prefix)
- Phase 2 (if expanding): build consent-first opt-in landing page; GDPR / Bill 96 / CASL compliance designed in from the start, not retrofitted

### 8.4 Operational Safety

- ✅ Suppression list table built with webhook hooks before first cold send
- ✅ Spam complaint rate dashboard, alarm at >0.05%
- ✅ Bounce rate dashboard, alarm at >2%
- ✅ Unsubscribe rate dashboard, alarm at >0.5%
- ✅ Reply auto-classifier with negative-reply suppression
- ✅ DMARC reports monitored weekly
- ✅ L4 catastrophic alert (legal threat keywords) → Slack to Patrick per S268

---

## 9. Implementation Plan (3 Weeks to First Send)

### Week 1 — Infrastructure

- Day 1: Domain setup `outreach.finda.sale`, SPF/DKIM/DMARC records
- Day 2: Workspace `outreach@finda.sale` seat provisioned, Send-As alias configured
- Day 3: Postgres schema — `OutreachSuppression`, `OutreachTouch`, `OutreachSegment`, `LegalAlert` tables (Architect spec → Dev dispatch)
- Day 4: Bounce + complaint webhook handlers (Workspace postmaster API + IMAP-based reply intake)
- Day 5: Reply auto-classifier per §5.6 (regex + canonical answer dispatcher; no human routing)
- Day 6–7: Domain warm-up begins (50/day to seed list of internal aliases + opt-in test addresses)

### Week 2 — Content + Segmentation + Preview Polish

- Day 8: Pre-segment scraped records into Tier 1/2/3/Drop (SQL query against `Organizer` table); EU/QC exclusion filter
- Day 9: Email Templates A, B, C, D wired into Postgres cron with merge fields + `?src=` URLs
- Day 10: Polish dispatch — unclaimed storefront preview gets the trust strip + "How did we find you?" link + "See how it works in 2 min" link to /video
- Day 11: Verification email + 7-day welcome series confirmed in Resend (already mostly built per #361)
- Day 12: QA pass — send full sequence to Patrick + 3 test addresses, verify deliverability and that all links open the right page with the right `?src=` code
- Day 13: Confirm /video page sticky CTA passes `?src=` through to /register on every conversion path
- Day 14: Warm-up at 150/day (Week 2 of warm)

### Week 3 — Phase 1 Pilot

- Day 15: Pilot batch — Tier 1 records only, ~20 records (the strongest segment, low blast radius)
- Day 16–18: Monitor open / reply / bounce / complaint rates; watch /video traffic by `?src=` code; verify auto-classifier handles inbound correctly
- Day 19: Decision gate — pilot looks healthy → expand; pilot looks bad → debug and re-pilot
- Day 20: Full Phase 1 batch (Tier 1 + Tier 2 + Tier 3, all-go since cost is flat)

### Week 4–8 — Iterate

- A/B test winning subject lines on next batches (after the locked Touch 1 subject line, vary Touches 2–4)
- Compare conversion (claim → activate → publish) by source code
- At Week 8: decide on Phase 2 — migrate to Instantly.ai if volume crosses 500/day, OR add postcard for high-value segment if reply rate < 2.5%

---

## 10. Open Decisions — Resolved

All seven decisions from v2 §10 are now resolved. Captured here for record.

| # | Question | Resolution |
|---|---|---|
| 1 | Tier strategy — PRO/TEAMS only or all tiers? | **All tiers.** Cost differential is rounding error at $6/mo Phase 1; segmentation is for personalization, not budget. |
| 2 | Subject line — A/B/C test? | **No test.** Touch 1 subject is locked: "We built you a storefront on FindA.Sale." Touches 2–4 use distinct subjects to avoid thread monotony. |
| 3 | Patrick by name on sender? | **No.** Sender is `outreach@finda.sale` from "The FindA.Sale Team." No personal names, no "founder" voice anywhere in user-facing copy. |
| 4 | Reply-load tolerance? | **Fully automated per S268.** No human routing. Auto-suppress on negative, auto-respond with canonical answers + /video + /register links on FAQ-style replies, L4 catastrophic only escalates to Slack. |
| 5 | EU + QC records — drop or translate? | **Defer to Phase 2.** SQL exclusion filter at send time. |
| 6 | Tooling — Resend + Instantly.ai or something cheaper? | **Phase 1: Workspace seat ($6/mo) + custom Postgres cron** — reuses existing infra, isolates reputation. **Phase 2 (>500/day): Instantly.ai.** **Resend stays for transactional.** |
| 7 | Phase 2 trigger criteria? | **Approved as written.** If reply rate < 2.5% after 8 weeks AND Tier 1 reply rate < 4%, test postcard. Otherwise skip indefinitely. |

---

## 11. Operational Risk Summary

| Risk | Severity | Mitigation |
|---|---|---|
| Cold sends from main `patrick@finda.sale` Workspace damage personal/transactional reputation | 🔴 P0 | Separate `outreach@finda.sale` Workspace seat with reputation isolation. Confirmed before any send. |
| Domain reputation tank from un-warmed cold subdomain | 🟠 P1 | 4-week warm-up non-negotiable. Block volume scaling on warm-up calendar. |
| Spam complaint rate >0.1% triggers Gmail/Yahoo blocking | 🟠 P1 | Real-time complaint dashboard, instant pause if rate breaches 0.05%. |
| Workspace daily-send cap (~500/day) limits Phase 1 throughput | 🟡 P2 | Acceptable Phase 1 constraint. Migrate to Instantly.ai when volume justifies. |
| Auto-classifier mishandles a legal threat reply | 🟠 P1 | Catastrophic-keyword path always fires Slack alert to Patrick (L4 per S268). Patrick reviews L4 queue daily. |
| Cold prospects feel "spammed" because we made a page about them they didn't ask for | 🟡 P2 | Trust strip on storefront preview ("How did we find you?" + opt-out path on unclaimed pages). |
| /video page goes down or fails to load mid-campaign | 🟡 P2 | Vercel + uptime alarm; backup video URL on YouTube as fallback (link swap if /video down >5 min). |
| EU or QC record slips through SQL filter | 🟡 P2 | Filter is a hard pre-send gate, not a post-send check. Unit-tested before launch. |

---

## 12. Sources Cited

- Resend Acceptable Use Policy (cold outreach prohibited)
- Brevo / Zoho / SES TOS — confirmed cold outreach restrictions
- Instantly.ai 2026 cold-email benchmark report
- Apollo.io / Salesloft sales cadence research
- Outreach.io 2026 reply-rate benchmarks
- 47 CFR §64.1200 (TCPA)
- 16 CFR §316 (CAN-SPAM)
- Mailmeteor "Is Cold Email Legal?" 2026
- Quebec Bill 96 official text
- Google Workspace SMTP send limits documentation
- finda.sale/video page (canonical voice and offer reference)
- FindA.Sale internal: STATE.md (S624), decisions-log.md S268 (Zero-Human Automated Support Stack, 2026-03-24), support-kb.md (10% platform fee), MEMORY.md (D-006 no AI, inclusive sale types, no founder voice)

---

*v3 — Session 626. All decisions resolved. Ready for Architect spec → Dev dispatch.*
