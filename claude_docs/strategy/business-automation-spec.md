# Business Automation Spec — Outward-Facing Growth & Ops

**Created:** 2026-06-05 (S891) · **Author:** main session (Patrick request)
**Context:** Product/internal automation is mature (60+ crons, 18 scheduled tasks). The gap is **outward-facing** automation — growth, reputation, money-recovery, and measurement. This spec covers the 6 identified gaps plus additional automations worth adding.

**Legend — Effort:** S = <1 day · M = 1–3 days · L = 1 week+ · Priority: P1 (do first) → P3.

---

## 1. Social Auto-Posting Pipeline  ·  P1 · Effort M

**The insight: we already generate the content. We just don't publish it.**

**Reusable content sources (already built):**
- `saleOfTheDayService` — picks one standout sale nightly (midnight UTC). Perfect daily post.
- `presaleSneakPeekJob` — sales starting in 24–48h. "Coming this weekend" posts.
- `monthlyTrendReportJob` — trending categories / hot metros. Monthly roundup posts.
- `findasale-competitor-monitor` task — already drafts 1 organic social post/week.
- Brand assets: `marketingKitController`, `brandKitController`, OG image generation, `SaleCard`. Image creative already exists per sale.

**What to build:**
- A `socialPostJob` cron that consumes Sale-of-the-Day output, renders the sale's existing OG/SaleCard image, and posts to channels via API.
- Channels, in priority order: **Facebook Page + Instagram** (Meta Graph API — highest fit for this audience), **Pinterest** (evergreen, SEO-adjacent, great for "finds"), **X** (low effort, low return). Skip LinkedIn for now (B2B-only; keep the competitor-monitor's weekly LinkedIn draft as a manual post).
- Cadence: 1 Sale-of-the-Day post/day, 1 "this weekend" roundup Thursday, 1 trend post/month.
- Store posted history to avoid repeats; log failures to the existing scheduled-task log.

**Dependencies:** Meta Business account + Page + IG Business account; Graph API app + long-lived token; Pinterest business account + API token. (These are account-setup tasks for Patrick, ~1–2 hrs.) Consider Buffer/Postiz if direct API upkeep is too much maintenance.

**Decision needed:** Direct API (free, more maintenance) vs. a scheduler like Buffer ($6–15/mo, less maintenance). Recommend **direct Meta + Pinterest API** since volume is low and predictable.

---

## 2. Reviews & Reputation Engine  ·  P1 · Effort M

**Today: we collect zero reviews anywhere. The Google Business Profile exists but was never phone-verified, so it isn't live.**

**What to build:**
- **Review-request triggers** (new service, reuses existing email infra `emailService` + `emailTemplateService`):
  - *Organizer:* fires 2 days after a sale moves to ENDED with ≥1 sold item → "How did your sale go? Leave a review / share a testimonial."
  - *Shopper:* fires 1 day after a completed purchase → "How was your find?"
- **Route to the right place:** organizers → Google Business Profile review link (once verified) + an on-site testimonial capture; shoppers → on-site organizer rating (you have a reputation system already — `reputationService`, `reputationScoreJob`).
- **Display loop:** approved testimonials surface on the homepage, pricing page, and organizer storefronts (social proof feeds conversion). Star ratings already partly modeled.
- **Throttle:** max one ask per user per 30 days; suppress if they've already reviewed.

**Patrick action (blocking, 10 min):** verify the Google Business Profile by phone at business.google.com. Without this, you have no Google Maps presence and no place to send organizer reviews.

**Dependencies:** GBP verified; a lightweight testimonial model + admin approval queue (you already have an admin moderation pattern from disputes/encyclopedia).

---

## 3. Email List-Building + Marketing Layer  ·  P1 · Effort S–M

**Today: MailerLite has 13 subscribers and 1 campaign ever sent. There's no email capture on the site, so anonymous visitors are never converted into a list.** (Registered shoppers already get the Sunday `weeklyEmailService` digest — that part is fine.)

**What to build:**
- **Capture points** (frontend): homepage hero "Get sales near you each week" email field; exit-intent or footer signup; a soft prompt on city/category pages ("Email me new [category] sales in [city]"). All write to MailerLite via the connected API.
- **Welcome automation** (MailerLite): enable + flesh out the existing "Simple welcome email" (currently disabled) into a 3-step shopper welcome that drives app signup.
- **Weekly "Sales Near You" newsletter** to the *non-registered* list — reuses the same content as Sale-of-the-Day + trending, segmented by metro (MailerLite groups by city).
- **Re-engagement:** 30-day no-open → win-back; auto-suppress chronically unengaged to protect deliverability (you've been burned by sending suspensions — keep volumes warm and clean).

**Dependencies:** MailerLite is already connected (account 2169788). Mostly frontend capture + automation config — minimal backend.

**Guardrail:** given prior Google Workspace suspensions, route all *marketing* mail through MailerLite (not the Gmail/SES transactional rails) and keep the lists clean.

---

## 4. Product / Funnel Analytics  ·  P1 · Effort S

**Today: Sentry (errors) + Search Console (SEO) only. Nothing measures activation, conversion, or retention. You can't see where signups drop off or what % of organizers publish a first sale.**

**What to build:**
- Install **PostHog** (generous free tier, self-serve funnels/retention/session replay) or **GA4** (free, but weaker product funnels). Recommend **PostHog**.
- Instrument the core funnels:
  - *Organizer activation:* register → create sale → add items → publish → first view.
  - *Shopper activation:* land → search/browse → favorite → register → first hold/purchase.
  - *Subscription:* pricing view → checkout → paid → retained.
- **Weekly KPI email to Patrick** (new scheduled task): pulls the week's funnel numbers + DB metrics into a plain-English Monday "business health" digest. You have ops digests; you don't have a *business-metrics* digest.

**Dependencies:** PostHog account + frontend snippet. Add cookie consent (see §7) before launching tracking.

---

## 5. Subscription Dunning / Failed-Payment Recovery  ·  P2 · Effort S

**Today: PRO/TEAMS subscriptions exist with tier-lapse jobs (`tierLapseJob`, `tierGraceCronJob`), but failed-payment recovery isn't confirmed. A silently failed card = a silently lost customer.**

**What to build / verify:**
- In Stripe Dashboard: enable **Smart Retries** + the built-in **dunning email sequence** + **card-expiry reminder** emails (mostly toggles — 15 min).
- Add a branded in-app banner when a subscription is `past_due` (reuse the tier-grace logic that already exists).
- Confirm the Stripe webhook handles `invoice.payment_failed` → grace state, and `customer.subscription.deleted` → downgrade with a win-back email.

**Dependencies:** Stripe dashboard access. Light backend verification.

---

## 6. Customer Feedback / NPS Loop  ·  P2 · Effort S

**Today: no structured feedback signal. Features ship without knowing what users think; churn reasons are never captured.**

**What to build:**
- **NPS micro-survey:** in-app one-tap (0–10) at activation milestones — organizer's 3rd published sale, shopper's 3rd purchase. Reuses MailerLite or a lightweight in-app widget.
- **Churn-reason capture:** when an organizer downgrades or a subscription cancels, a one-question "why?" with preset reasons.
- **Route results** into a monthly digest so themes surface (ties into the §4 KPI email).

---

# What Else Is Worth Adding

Beyond the original six, these are high-leverage and mostly reuse existing infrastructure:

## 7. Cookie Consent + Privacy Compliance  ·  P2 · Effort S
Prerequisite once §4 analytics + §1 social pixels go live. A simple consent banner (decline non-essential by default) + a "Do Not Sell" link for CCPA. You already have Terms + Privacy pages — this closes the loop. Low effort, removes legal risk.

## 8. Organizer Post-Sale Recap Email  ·  P1 · Effort S
**Highest-ROI addition.** When a sale ends, auto-send the organizer a recap: views, favorites, items sold, revenue, search-visibility (you already compute most of this — `socialProofService`, insights dashboard, `monthlyTrendReport`). One email that (a) proves value → retention, (b) is the natural moment to ask for a review (§2), and (c) prompts "List your next sale." Drives the three things that matter most for a marketplace: retention, reputation, repeat supply.

## 9. Lapsed-Organizer Win-Back  ·  P2 · Effort S
No published sale in 45/90 days → automated nudge ("Your shoppers miss you — here's what's selling in [metro]"). Reuses trend data + email infra. Supply retention is cheaper than supply acquisition.

## 10. Abandoned-Signup Recovery  ·  P2 · Effort S
You recover abandoned *checkouts* (`abandonedCheckoutJob`) but not abandoned *registrations*. Organizer starts register, doesn't finish → 1h + 24h nudge. Same pattern, new trigger.

## 11. Referral Prompt at Peak-Happiness Moments  ·  P2 · Effort S
The referral/affiliate system exists but isn't *triggered* at the right time. Fire the invite prompt right after a great sale recap (§8) or a shopper's first great find — when satisfaction is highest. Wiring, not new infrastructure.

## 12. Year-End Organizer Tax/Earnings Summary  ·  P3 · Effort M
Auto-generate an annual earnings + payout PDF for organizers each January (you already do per-sale receipts + payout PDFs). Builds trust, reduces support load, and matters for consignment shops doing 1099 volume.

## 13. Local-Press / Newsjacking Automation  ·  P3 · Effort M
You have a `s603-newsjacking-engine` strategy doc. A monthly task that drafts a local-news pitch around the biggest upcoming sale per metro (estate of note, celebrity, huge collection) → free local-media coverage. Drafts only; Patrick approves sends.

## 14. Public Status Page  ·  P3 · Effort S
A simple status.finda.sale (free tier on Better Uptime / Instatus). Matters more as paying organizers grow — sets expectations during incidents instead of inbound support pings.

---

## Suggested Build Order

| Wave | Items | Why |
|------|-------|-----|
| **Wave 1 (this month)** | §8 Post-sale recap, §2 Reviews (+GBP verify), §4 Analytics (PostHog) | Highest ROI, mostly reuse, unlock measurement + reputation |
| **Wave 2** | §1 Social posting, §3 Email capture/list, §11 Referral triggers | Growth engines once measurement exists |
| **Wave 3** | §5 Dunning, §6 NPS, §9 Win-back, §10 Abandoned signup, §7 Cookie consent | Revenue protection + retention + compliance |
| **Later** | §12 Tax summary, §13 Newsjacking, §14 Status page | Nice-to-have, lower urgency |

## Cross-cutting notes
- **Deliverability discipline:** marketing mail → MailerLite; transactional → existing SES/Gmail rails. Never mix (prior suspensions: S865/S887).
- **Brand voice:** institutional sender ("The FindA.Sale Team"), no founder voice, no "AI" in copy (per DECISIONS.md).
- **Most of this is config + light wiring, not net-new systems** — the content engines and email infra already exist.
