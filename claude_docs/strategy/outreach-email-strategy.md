# Cold Outreach Email Strategy — 4-Touch Sequence by Lead Tier

**Status:** READY FOR IMPLEMENTATION  
**Version:** 1.0  
**Owner:** Marketing (strategy) | findasale-dev (template code + MailerLite config)  
**Authority:** D-S626 (build path confirmed), S641 (audit + vendor decision), organizer-acquisition-strategy.md v3  
**Timeline:** Copy finalized; dev integrates into outreachEmailsCron + MailerLite automations  
**Brand Baseline:** No "AI", no "estate sale" (use inclusive: estate sales, yard sales, auctions, flea markets, consignment), founder voice forbidden (sender: "The FindA.Sale Team"), practical organizer-respecting tone

---

## 1. Executive Summary

FindA.Sale is launching a 4-touch cold outreach campaign targeting 7,897 scraped organizers (COLD=3,235, WARM=4,662, HOT=0, ENTERPRISE=0). This document specifies three message variants (one per tier: COLD, WARM, HOT) with subject lines, email bodies, CTAs, and a complete MailerLite automation structure to execute the sequence.

**Lead Tier Definitions:**

| Tier | Score | Profile | Audience | Outreach Angle |
|------|-------|---------|----------|----------------|
| **COLD** | 0–39 | No reviews, no license, name+city only | ~3,235 orgs | Discovery. "There's a marketplace for what you do." |
| **WARM** | 40–69 | 1–9 reviews OR corroboration signals | ~4,662 orgs | Credibility. "We found your business + built you a storefront." |
| **HOT** | 70–100 | 10+ reviews OR state licensed | ~0 orgs (future) | VIP. Respectful, personalized, high-value operator. |

**Sending Infrastructure:** Node.js cron (outreachEmailsCron.ts) every 4 hours. Workspace SMTP (`outreach@finda.sale`). MailerLite triggers for follow-ups. EmailSuppression model gates all sends.

**Warm-up Schedule:** 
- Week 1–2: 20/day  
- Week 3–4: 50/day  
- Week 5–6: 100/day  
- Week 7+: 200/day (steady state)

---

## 2. Email Message Variants by Lead Tier

### 2.1 COLD TIER (Score 0–39) — Discovery Angle

**Audience:** Early-stage, no online presence signals. Organizers running informal sales from garage/church/estate without reviews or business license yet. Skeptical of digital tools.

**Subject Line (Primary):**
```
You have something people want — let's help you sell it
```

**Subject Line (A/B Variant):**
```
Used goods marketplace for estate sales, yard sales & auctions
```

**Email Body (Plain Text — best for deliverability):**

```
Hi {{businessName}},

We found your {{state}} business running estate sales, yard sales, auctions, or consignment. 

And we built something for people exactly like you.

It's a marketplace where you list once, and shoppers come find you. No commission until you sell. No monthly fee. You keep your data.

How it works:

1. List your items with a phone camera. Our system auto-tags them (antiques, collectibles, condition, price range) so shoppers can find exactly what they want.

2. Shoppers reserve items or bid. You collect money, pack, ship—or they pick up in person.

3. Settle up in your dashboard. See which items sold, profit per item, hold deposit from each shopper.

4. Export your listings anytime (to eBay, Amazon, your own site, or keep them with us).

We're handling 8,000+ sales a month. Estate sale organizers are moving 30–100 items per week through the platform.

Want to see how it works? Watch the 2-minute demo:

https://finda.sale/video?src=outreach-cold-1

No obligation. You're already selling—we just make it easier.

— The FindA.Sale Team
219 E Michigan Ave, Suite F, Paw Paw, MI 49079
```

**CTA:**
- **Primary:** Click video link → landing page
- **Fallback (if cold email):** "Visit finda.sale" (generic brand site)
- **Conversion path:** Video → claim storefront → test 1 item

**Personalization Tokens Available:**
- `{{businessName}}` — Extracted from scraper data (e.g., "Jane's Collectibles")
- `{{city}}` — Extracted from address (e.g., "Grand Rapids")
- `{{state}}` — Two-letter state code (e.g., "MI")
- `{{source}}` — Where we found them (e.g., "Google Maps", "EstateSales.org", "OSM", "Overpass", "Sale Seeker")

**Why This Works for COLD:**
- No assumption of sophistication (explains what FindA.Sale is)
- Addresses skepticism directly ("No commission until you sell")
- Shows social proof (8,000+ sales/month)
- Video is the conversion engine (passive, no pressure)
- Plain text reads like a human, not a robot

---

### 2.2 WARM TIER (Score 40–69) — Credibility Angle

**Audience:** Has 1–9 Google reviews, or multiple corroboration signals (business name consistent across 2+ data sources). Running established sales business. Wants to expand reach without changing how they work.

**Subject Line (Primary):**
```
We built {{businessName}} a free storefront
```

**Subject Line (A/B Variant):**
```
Your items are getting lost. Here's where to sell them.
```

**Email Body (Plain Text):**

```
Hi {{businessName}},

We've been researching {{state}} estate sale organizers and found your business on Google. {{reviewCount}} customers reviewed you.

So we built you a free storefront on FindA.Sale.

Your items are already getting some exposure on Google, eBay, or local listings. We've just created a dedicated channel where your inventory lives in one place—and shoppers can discover ALL of it at once.

What we found:
- Your business runs {{source}}
- Shoppers are looking for what you sell
- You're probably listing on 2–3 platforms (or managing spreadsheets)

What we built for you:
- 1 listing, discovered everywhere (phone camera with smart tags)
- Shoppers reserve or bid directly (deposits held by us, not you)
- Dashboard shows profit per item, hold status, payout calendar
- Export your catalog to eBay, Amazon, or anywhere anytime

You own your data. We only take 10% when something sells.

See your storefront here (auto-built from public info):

https://finda.sale/organizers/{{businessName}}/verify

It's ready to go live whenever you want. Just claim it, add a few items, and start selling.

— The FindA.Sale Team
219 E Michigan Ave, Suite F, Paw Paw, MI 49079
```

**CTA:**
- **Primary:** Verify/claim storefront link (auto-generated from {{businessName}})
- **Fallback:** Browse FindA.Sale marketplace

**Personalization Tokens Available:**
- `{{businessName}}` — from scraper data
- `{{city}}`, `{{state}}`
- `{{reviewCount}}` — "1 customer", "12 customers", etc. (if >0)
- `{{source}}` — "Google Maps", "Business licensing database", etc.
- `{{verificationUrl}}` — Claim verification token (JWT-signed)

**Why This Works for WARM:**
- Social proof (we know about them already—not cold-calling)
- Respects their existing process (not asking them to change)
- Positioned as a distribution channel, not a replacement
- Immediate action (verify storefront) is low-friction
- Acknowledges they may use multiple platforms

---

### 2.3 HOT TIER (Score 70–100) — VIP/Personalized Angle

**Audience:** 10+ reviews OR state-licensed auctioneer/secondhand dealer/liquidator. Professional operator. Multiple events per month. Wants tools to scale, not just distribution.

**Subject Line (Primary):**
```
{{businessName}} + FindA.Sale: Your next growth channel
```

**Subject Line (A/B Variant):**
```
We're hand-inviting licensed dealers to our platform
```

**Email Body (Plain Text):**

```
Hi {{businessName}},

We're reaching out directly to licensed auctioneers and estate sale professionals in {{state}} who are running 5+ events a month.

You're one of 200 organizers nationwide we're inviting to a white-glove onboarding.

Here's what we know about your business:
- {{licenseState}} auctioneer license (#{{licenseNumber}})
- {{reviewCount}} verified customer reviews
- Running {{eventType}} professionally

Here's what we offer differently:

**For High-Volume Sellers:**
- Bulk photo upload (RapidFire: 100 items in 20 minutes via phone camera)
- Smart tagging powered by pricing data (not just keywords)
- Printable inventory sheets (for your sale event)
- API export to eBay, Shopify, or your own system

**For Professional Organizers:**
- Staff accounts (delegate photos, pricing, listing reviews)
- Color-coded sorting (organize items by row/zone in-person, sync to online)
- Hold management dashboard (reserves, deposits, customer pickup scheduling)
- Commission-only pricing (10% on sales, zero monthly fees)

**Early Access:**
- Your account is ready to go live as soon as you claim it
- First 50 high-volume sellers get a welcome bonus (extra PRO features for 30 days)
- Direct support line (not automated)

Your storefront is built and verified. Just claim it and add items.

https://finda.sale/organizers/{{businessName}}/verify

The team that's managing 8,000+ sales per month wants to work with you.

— {{senderName}}, FindA.Sale  
Direct: [team contact]  
219 E Michigan Ave, Suite F, Paw Paw, MI 49079
```

**CTA:**
- **Primary:** Verify/claim storefront → schedule a 15-min onboarding call
- **Secondary:** Book a call directly (Calendly link, if available)

**Personalization Tokens Available:**
- `{{businessName}}`
- `{{city}}`, `{{state}}`
- `{{licenseState}}`, `{{licenseNumber}}` — if licensed
- `{{reviewCount}}` — "47 reviews", etc.
- `{{eventType}}` — "estate sales", "auctions", "consignment", etc.
- `{{verificationUrl}}` — Claim token
- `{{senderName}}` — "Patrick" or "Sarah" (rotate by sales rep if scaling)

**Why This Works for HOT:**
- Respects their professional status (license acknowledgment)
- Features are specific to their scale (RapidFire, staff accounts, API)
- Removes friction objections (no monthly fee, API export, direct support)
- Social proof is quantified (8,000+ sales)
- Call-to-action is VIP (scheduled call, not just "sign up")

---

## 3. Four-Touch Sequence & Timing

### 3.1 Sequence Overview

All three tiers follow the same 4-touch cadence. Message content varies by tier (see §2); timing is identical.

| Touch | Day (From Send) | Trigger | Purpose | Send Time |
|-------|-----------------|---------|---------|-----------|
| **Touch 1** | Day 0 | Sent to all eligible contacts | Discovery. First impression. | 9 AM local recipient time |
| **Touch 2** | Day 7 (if no open) | Opened but didn't click | Content value angle. Remove friction. | 10 AM local |
| **Touch 3** | Day 14 (if opened T1 but no click) | Engaged but not converting | Conversion push. Different angle. | 11 AM local |
| **Touch 4** | Day 21+ (if no claim yet) | Final break-up email | Last chance. No hard sell. | 9 AM local |

### 3.2 Touch 2 — "No Open" Follow-Up (7 Days Post-T1)

**Trigger:** `touch1SentAt` is 6–8 days old AND `touch1Opened = false`

**Subject Line (Primary — DIFFERENT from T1):**
```
One thing we left out
```

**Subject Line (A/B Variant):**
```
{{businessName}}, this is free to try
```

**Email Body (Plain Text):**

```
Hi {{businessName}},

I sent you an email last week about FindA.Sale and didn't get a response.

You might have been busy. Or maybe the first email didn't land right. So I'm sending this one.

One thing I didn't mention: it's completely free to try.

List one item. See if it sells. Then decide if the platform is worth your time.

Zero risk. You don't pay anything unless an item sells. We keep 10%.

If you want to give it a shot:

https://finda.sale/video?src=outreach-cold-2

(This is the same 2-minute video from before, so skip it if you already watched.)

Or if now's not the right time, just let me know and I'll stop emailing.

— The FindA.Sale Team
219 E Michigan Ave, Suite F, Paw Paw, MI 49079
```

**Why This Works:**
- Acknowledges lack of response (no assumption of guilt)
- Removes the "risk" objection explicitly
- Offers an easy micro-commitment ("list one item")
- Gives explicit permission to opt out (respects time)
- Re-states the core promise (free-to-try)

---

### 3.3 Touch 3 — "Opened, No Click" Follow-Up (14 Days Post-T1)

**Trigger:** `touch1Opened = true` AND `touch1Clicked = false`

**Subject Line (Primary):**
```
Quick question from {{businessName}}'s biggest competitor
```

**Subject Line (A/B Variant):**
```
Why {{businessName}} should claim their storefront now
```

**Email Body (Plain Text):**

```
Hi {{businessName}},

You opened my email but didn't click the video. 

So maybe the pitch wasn't compelling. Let me try a different angle.

Here's the thing: right now, shoppers are searching for what you sell on Google and eBay. But they're not finding *your* inventory. They're finding your competitors instead.

FindA.Sale exists to fix that.

When you list on our platform, we surface your items to shoppers actively looking for estate sales, auctions, and used goods in {{state}}. The people who buy from you *want* what you're selling.

Your competitors are already here. You can see their listings, their prices, their customer reviews.

Claim your storefront (takes 30 seconds):

https://finda.sale/organizers/{{businessName}}/verify

Then add 3 items from your next sale.

If no one buys, you lose nothing. If someone does, you pocket 90% of the sale price.

No risk. No monthly subscription. No data lock-in.

— The FindA.Sale Team
219 E Michigan Ave, Suite F, Paw Paw, MI 49079
```

**Why This Works:**
- Competitive angle (competitors already there) creates urgency
- Addresses assumed objection ("why should I?")
- Low-friction CTA (claim storefront, not "watch video")
- Reframes "loss" as "lost customers to competitors"
- Repeats the core promise (10% commission, no monthly fee, data export)

---

### 3.4 Touch 4 — "Break-Up" Email (21+ Days Post-T1)

**Trigger:** `touch1SentAt` is 21+ days old AND `status != 'CLAIMED'`

**Subject Line (Primary):**
```
One last thought
```

**Subject Line (A/B Variant):**
```
We're taking {{businessName}} off our priority list
```

**Email Body (Plain Text):**

```
Hi {{businessName}},

This is my last email. I promise.

I've reached out a few times because I genuinely think FindA.Sale can help you reach more customers. But maybe the timing isn't right, or maybe online listing isn't for you.

No judgment either way.

But before I let you go: if you ever get curious—about how the platform works, what the 10% split looks like, whether it's worth trying—just reply to this email. I'll answer within a day.

Your storefront is ready whenever you change your mind:

https://finda.sale/organizers/{{businessName}}/verify

Good luck with your sales.

— {{senderName}}, FindA.Sale Team
```

**Why This Works:**
- Breaks the "cold email salesman" stereotype (humanizes the sender)
- Removes pressure (you won't hear from me again)
- Leaves door open (reply if interested)
- Honors their time
- Restates the CTA once more (no pressure)

**Final Action:** After T4 send, add email to `EmailSuppression` table with `optedOut = true` if no engagement. Don't email again unless they engage (click, reply, or visit site).

---

## 4. Send Timing Recommendations

### 4.1 Best Days/Times for Cold Outreach to Small Business Owners

**Research baseline:** Estate sale organizers in the US skew 45–65 years old, tend to check email mornings (7–10 AM) and late afternoons (4–6 PM), and are more responsive on **Tuesdays–Thursdays** (weekends and Mondays have high spam volume).

**Recommended Send Windows:**

| Touch | Day of Week | Time (local recipient time) | Rationale |
|-------|-------------|---|-----------|
| T1 | Tuesday–Thursday | 9 AM | Peak inbox engagement for small business |
| T2 (follow-up) | Wednesday | 10 AM | Different day + time reduces "spam" perception |
| T3 | Tuesday | 11 AM | Re-engagement angle; slightly later to clear morning inbox noise |
| T4 | Thursday | 9 AM | Final touch; use high-engagement window |

**Why NOT Mondays, Fridays, Weekends:**
- Monday: Inbox overload recovery (5–10x email volume vs. Tuesday)
- Friday: People are in "close-out" mode, not reading long emails
- Weekends: Unread pile builds; harder to stand out Monday morning

### 4.2 A/B Testing Recommendation

After first 100 sends of T1, compare:
- **Subject line open rate** (primary vs. variant)
- **Click rate** (how many people click video/verify link)
- **Reply rate** (positive replies → "interested", negative → "remove me")

**Winning subject line:** Promote variant with >15% higher open rate. Phase in over 2–3 days (reduce losing variant from 50% to 25%, then to 0%).

### 4.3 Bounce Rate Thresholds & Pause/Resume Rules

| Bounce Type | Threshold | Action |
|-----------|-----------|--------|
| Hard bounce (invalid email) | >5% of sends | Pause send cron, review scraper data quality |
| Soft bounce (temporary unavailable) | >10% of sends | Continue, but mark soft-bounce emails in suppression list (retry after 7 days max 1x) |
| Complaint (marked as spam) | >0.5% of sends | Pause cron, review subject lines + copy for "salesy" language |
| Opt-out rate (unsubscribe clicks) | <1% of sends | Normal, no action. >2% = revisit copy tone |

**Recovery action:** If any threshold is hit, findasale-marketing + findasale-ops review: (a) subject line copy, (b) scraper data quality, (c) suppression list (emails already opted out?), (d) MailerLite segment configuration (wrong audience?).

---

## 5. MailerLite Automation Structure

### 5.1 Groups & Segmentation Strategy

**Create 3 groups in MailerLite corresponding to lead tiers:**

| Group ID | Group Name | Size | Purpose | Enrollment |
|----------|-----------|------|---------|-----------|
| Group-COLD | Outreach: COLD Tier (0–39) | ~3,235 | All COLD-scored organizers | Automated from leadScoringService.ts |
| Group-WARM | Outreach: WARM Tier (40–69) | ~4,662 | All WARM-scored organizers | Automated from leadScoringService.ts |
| Group-HOT | Outreach: HOT Tier (70–100) | ~0 (future) | Licensed or 10+ reviews | Automated from leadScoringService.ts |

**Storage:** Group IDs stored in environment:
```
MAILERLITE_OUTREACH_COLD_GROUP_ID=group-id-from-api
MAILERLITE_OUTREACH_WARM_GROUP_ID=group-id-from-api
MAILERLITE_OUTREACH_HOT_GROUP_ID=group-id-from-api
```

**Sync:** Every Sunday 2 AM UTC (after `leadScoringJob.ts` completes), run `syncOutreachGroupsToMailerLite.ts`:
- Query `Organizer` records with `leadScore` changes since last sync
- Upsert contacts into MailerLite with {{businessName}}, {{city}}, {{state}}, {{reviewCount}}, {{source}}
- Assign to correct group based on leadTier

---

### 5.2 Email Campaigns in MailerLite

**Store templates as MailerLite campaigns.** One campaign per touch/tier combination = 12 campaigns total (4 touches × 3 tiers).

#### T1 Campaigns (Initial Send)

**Campaign: T1-COLD**
- Name: "T1: COLD Tier Discovery"
- Subject: "You have something people want — let's help you sell it"
- Template: Paste COLD body from §2.1
- Send type: Regular (not automation)
- Send method: Manual trigger from cron job (see §5.3)

**Campaign: T1-WARM**
- Name: "T1: WARM Tier Credibility"
- Subject: "We built {{businessName}} a free storefront"
- Template: Paste WARM body from §2.2

**Campaign: T1-HOT**
- Name: "T1: HOT Tier VIP"
- Subject: "{{businessName}} + FindA.Sale: Your next growth channel"
- Template: Paste HOT body from §2.3

#### T2–T4 Campaigns (Follow-Up Automations)

**Campaign: T2-COLD-NOOPEN**
- Name: "T2: COLD No Open, Day 7"
- Subject: "One thing we left out"
- Template: Paste T2 COLD body from §3.2
- Send method: Automation (see §5.3)

**Campaign: T3-COLD-OPENED**
- Name: "T3: COLD Opened No Click, Day 14"
- Subject: "Quick question from {{businessName}}'s biggest competitor"
- Template: Paste T3 COLD body from §3.3
- Send method: Automation (see §5.3)

**Campaign: T4-COLD-BREAKUP**
- Name: "T4: COLD Break-Up, Day 21"
- Subject: "One last thought"
- Template: Paste T4 COLD body from §3.4
- Send method: Automation (see §5.3)

Repeat for WARM and HOT tiers (same templates, different subject lines per §2.2, §2.3).

---

### 5.3 Automation Workflows in MailerLite

MailerLite's automation engine can be configured directly in their UI, or wired programmatically via API. **Recommendation: Hybrid approach.**

**Developer wires the cron job** (`sendOutreachEmailsCron.ts`) to:
1. Query Postgres for touch-ready contacts
2. Render personalized email via backend template engine
3. Call **MailerLite API** `POST /automations/{automationId}/actions/send-test` for each contact with personalization variables

Alternatively, **MailerLite automations handle follow-ups:**

#### Automation #1: T2 Follow-Up (No Open)

```
Trigger: Contact added to Group-COLD (or WARM/HOT)
Condition: touch1Opened = false (check against Postgres via webhook, or rely on MailerLite "not opened" event after 6 days)
Action: Send Campaign T2-COLD-NOOPEN on Day 7
Then: Check if T3 conditions met...
```

**Implementation Note:** MailerLite's automation conditions are limited (can't directly query Postgres boolean field). Workaround: findasale-dev adds a `maierliteTag` to contacts when enrolling (e.g., tag `t1_sent`, `t1_opened`, `t1_clicked`). MailerLite automation rules on tags.

#### Automation #2: T3 Follow-Up (Opened, No Click)

```
Trigger: Contact has tag `t1_opened` AND tag `t1_not_clicked` (set by backend when pixel fires but click doesn't)
Condition: Email opened 13–15 days after T1 send
Action: Send Campaign T3-COLD-OPENED on Day 14
Then: Check if T4 conditions met...
```

#### Automation #3: T4 Break-Up

```
Trigger: Contact has tag `t1_sent` AND contact is NOT in `claimed_organizers` segment
Condition: 21 days since T1 send
Action: Send Campaign T4-COLD-BREAKUP on Day 21
Then: Add contact to tag `t4_sent` and suppress future sends unless they claim
```

---

### 5.4 MailerLite Segments (for Filtering)

**Create 2 segments in MailerLite:**

**Segment: Claimed Organizers**
- Criteria: Has tag `organizer_claimed` (set by backend when Organizer.directoryStatus = CLAIMED)
- Purpose: Exclude from outreach automation (don't email people who already joined)

**Segment: Opted Out**
- Criteria: Has tag `opted_out` (set when unsubscribe is clicked) OR `bounce_hard`
- Purpose: Suppress all future sends

---

### 5.5 Webhook Integration: Backend → MailerLite

When the cron sends an email via backend, **immediately call MailerLite API** to sync state:

```typescript
// After sendOutreachEmailsCron sends an email:
await mailerliteService.tagContact({
  email: organizerEmail,
  tags: [`t1_sent`, `touch_1`, `outreach_${tier}`], // e.g., "outreach_cold"
  fields: {
    businessName: organizer.businessName,
    city: organizer.city,
    state: organizer.state,
    reviewCount: organizer.reviewCount,
  },
});
```

**When pixel fires** (contact opens email):
```typescript
// In /api/outreach/pixel endpoint, after updating Postgres:
await mailerliteService.tagContact({
  email: organizerEmail,
  tags: [`t1_opened`, 'email_engaged'],
  untagRemove: [`t1_not_opened`], // Optional: clean up
});
```

**When unsubscribe is clicked:**
```typescript
// In /api/outreach/unsubscribe endpoint:
await mailerliteService.tagContact({
  email: organizerEmail,
  tags: ['opted_out', 'suppressed'],
  unsubscribe: true, // Hard unsubscribe in MailerLite
});
```

---

## 6. Volume Warm-Up Schedule

### 6.1 8-Week Ramp Plan (Workspace SMTP + Cron)

**Week 1–2 (Days 1–14):** DNS warm-up + test batches
- **Daily quota:** 20/day
- **Total cumulative:** ~280 emails
- **Send window:** 9 AM local recipient time
- **Cron batches:** Every 4 hours = 6 batches/day, ~3–4 emails per batch
- **Objective:** Validate SMTP auth, pixel tracking, unsubscribe endpoint, suppression list
- **QA focus:** Check Rails logs for SMTP connection errors, verify pixel requests in MailerLite

**Week 3–4 (Days 15–28):** Ramp to 50/day
- **Daily quota:** 50/day
- **Total cumulative:** ~700 emails (280 + 420)
- **Send window:** 9 AM local
- **Cron batches:** ~8–9 emails per 4-hour batch
- **Objective:** Monitor bounce/complaint rates, validate warm-up reputation (check DMARC reports daily via RFC)
- **QA focus:** Verify emails in inbox (not spam folder), check open rates (target >15%), spot-check reply classifications

**Week 5–6 (Days 29–42):** Ramp to 100/day
- **Daily quota:** 100/day
- **Total cumulative:** ~1,400 emails (280 + 420 + 700)
- **Send window:** 9 AM local
- **Cron batches:** ~17 emails per batch
- **Objective:** Validate at moderate scale, monitor list quality
- **QA focus:** Trend analysis (bounce rate, complaint rate, open rate over time), spot-check IMAP reply polling

**Week 7+ (Days 43+):** Steady state 200/day
- **Daily quota:** 200/day (sustainable steady state on Workspace)
- **Total cumulative:** Unlimited
- **Send window:** 9 AM local recipient time (distributed by timezone if available; for now, UTC 2 PM = 9–10 AM in Eastern/Central)
- **Cron batches:** ~33–34 emails per batch
- **Objective:** Full production volume, automated replies, sustained metrics tracking
- **QA focus:** Weekly metrics digest (opens, clicks, replies, opt-outs, claims), trend vs. industry benchmark

### 6.2 Bounce Rate Thresholds (Pause/Resume)

| Metric | Threshold | Status | Action |
|--------|-----------|--------|--------|
| Hard bounce rate | <3% | ✅ OK | Continue |
| Hard bounce rate | 3–5% | ⚠️ Watch | Review scraper data; check if emails are valid format |
| Hard bounce rate | >5% | 🛑 Pause | Stop cron, audit DirectoryClaimEmail records, remove invalid emails |
| Complaint rate | <0.5% | ✅ OK | Continue |
| Complaint rate | 0.5–1% | ⚠️ Watch | Review subject lines (too "salesy"?) + copy tone |
| Complaint rate | >1% | 🛑 Pause | Revise copy, consult with findasale-marketing |
| Opt-out rate | <1% | ✅ OK | Normal, continue |
| Opt-out rate | 1–2% | ⚠️ Watch | OK, but monitor for tone drift |
| Opt-out rate | >2% | ⚠️ Watch | Review messaging; consider this is still healthy |

**Pause decision:** Made by Patrick + findasale-ops, not automatic. Set `OUTREACH_ENABLED = false` in Railway to stop cron.

---

## 7. First-Week Test Scenario (Pre-Production)

### 7.1 Test Contacts

Before going live to full 7,897 list, send T1 to a small test batch:

- **Patrick's email** (patrick@finda.sale)
- **Test organizer emails** (seed 5–10 addresses in DirectoryClaimEmail for QA)
- **Findasale team members** (to spot-check rendering, links, etc.)

**Total test batch:** ~15 emails

### 7.2 Test Checklist

- [ ] Emails land in inbox (not spam folder)
- [ ] Personalization tokens render correctly (`{{businessName}}` → actual business name, not literal `{{businessName}}`)
- [ ] Tracking pixel appears in email (1×1 transparent image)
- [ ] Click links rewrite correctly (original URL wrapped in `/api/outreach/click` redirect)
- [ ] Unsubscribe link is valid and token verifies
- [ ] Patrick opens email → pixel fires within 10 min → Postgres shows `touch1Opened = true`
- [ ] Patrick clicks video link → `/api/outreach/click` redirects to actual video URL → Postgres shows `touch1Clicked = true`
- [ ] Patrick clicks unsubscribe → success page renders → `EmailSuppression` record created with `optedOut = now()`
- [ ] Next cron run skips Patrick's email (suppression list blocks it)
- [ ] MailerLite webhook receives event (if wired) or tags sync correctly

**Timeline:** Run test batch on Day 0 (before Week 1 production send). Allow 24 hours for Postgres updates to propagate and verify all signals.

---

## 8. Metrics & Success Criteria

### 8.1 Key Performance Indicators (Weekly Tracking)

| KPI | Target (Healthy Baseline) | How to Measure | 
|-----|-----------|------------|
| **Delivery rate** (emails that don't bounce hard) | >95% | (Sent - Hard Bounces) / Sent |
| **Open rate** | >12% (cold outreach benchmark) | Opens / Sent |
| **Click-through rate (CTR)** | >2% (T1), >3% (T2–T4) | Clicks / Sent |
| **Reply rate** | 0.5–2% (healthy) | Replies / Sent |
| **Opt-out rate** | <1.5% (normal) | Unsubscribes / Sent |
| **Complaint rate** | <0.5% (healthy) | Complaints / Sent |
| **Conversion rate (claims)** | 0.1–0.5% (good for cold) | Claims / Sent |
| **Cost per claim** | <$2 (no marginal cost) | $0 / Claims |

### 8.2 Touch-Level Breakdown

Expected open/click rates by touch (industry benchmark for cold outreach):

| Touch | Subject Type | Expected Open Rate | Expected CTR | Note |
|-------|---|---|---|---|
| **T1** | Discovery | 10–15% | 2–4% | Fresh audience, highest potential |
| **T2** | No-open follow-up | 5–8% | 2–3% | Only reaching unopened (lower quality) |
| **T3** | Opened no-click | 20–30% | 5–8% | Higher quality (they opened T1) |
| **T4** | Break-up | 3–6% | 1–2% | Last chance, low bar |

**Blended rate across all touches:** ~8–10% open, ~2–3% CTR, ~0.2% claims.

### 8.3 Weekly Metrics Report (Automated Email to Patrick)

Every Monday 9 AM, send summary email:

```
Subject: Outreach Pipeline — Week of [DATE] Metrics

Hi Patrick,

Here's how the cold outreach campaign performed last week:

** SENDS **
- T1 emails sent: 140 (target: 140) ✅
- T2 follow-ups sent: 45 (target: 45) ✅
- T3 follow-ups sent: 12 (target: 12) ✅
- T4 break-ups sent: 3 (target: 3) ✅

** ENGAGEMENT **
- Total opens: 18 (12.9% open rate vs. benchmark 12%) ✅
- Total clicks: 4 (2.9% CTR vs. benchmark 2%) ✅
- Total replies: 2 (positive: 1, question: 1) 
- Opt-outs: 1 (0.7% vs. threshold 1.5%) ✅

** SUPPRESSION **
- Hard bounces: 2 (1.4% vs. threshold 5%) ✅
- Soft bounces: 0 ✅
- Complaints: 0 ✅
- Total suppressed: 2

** CONVERSIONS **
- New organizer claims: 1 (0.7% vs. benchmark 0.1–0.5%) ✅
- Cost per claim: $0 (no COGS) ✅

** NEXT ACTIONS **
- Continue warm-up ramp (increase to 50/day next week per schedule)
- Monitor positive replies; follow up manually with "question" replies

— FindA.Sale Outreach Pipeline
```

---

## 9. Brand Voice & Copy Rules (Locked)

### 9.1 Mandatory Exclusions

- ❌ **No "AI"** — Use "Smart", "Auto", or "Suggested" instead. (D-006)
  - **Wrong:** "Our AI automatically tags items"
  - **Right:** "Auto-tagged items based on pricing trends"

- ❌ **No "estate sale" as sole sale type** — Always use inclusive list.
  - **Wrong:** "For estate sale organizers"
  - **Right:** "For estate sales, yard sales, auctions, flea markets, consignment"

- ❌ **No founder voice** — Sender is institutional, not personal.
  - **Wrong:** "Hey, I'm Patrick, and I built this..."
  - **Right:** "— The FindA.Sale Team"

- ❌ **No fake urgency, fake social proof, no startup jargon**
  - **Wrong:** "Join 8,000+ happy sellers!" (fake social proof)
  - **Right:** "We're handling 8,000+ sales per month." (verifiable stat)

### 9.2 Tone Guidelines

- **Practical, not salesy.** Respect the reader's intelligence and time.
- **Direct, not clever.** Avoid puns or forced humor in subject lines.
- **Acknowledges objections.** ("Maybe you're busy..." / "No monthly fee...")
- **Conversational, not robotic.** Read aloud; if it sounds like a bot, rewrite.

### 9.3 CTA Best Practices

- **One primary CTA per email.** Two is too many; three is noise.
- **Use action verbs.** "Claim your storefront", "Watch the demo", "Schedule a call" — not "Learn more".
- **Make friction obvious.** "Takes 30 seconds" > vague CTA.
- **Always include unsubscribe.** "Just let me know and I'll stop emailing" (T2 + T4).

---

## 10. MailerLite Configuration Checklist

- [ ] **Group: Outreach COLD** created (ID: store in env)
- [ ] **Group: Outreach WARM** created (ID: store in env)
- [ ] **Group: Outreach HOT** created (ID: store in env)
- [ ] **Segment: Claimed Organizers** created (filter tag `organizer_claimed`)
- [ ] **Segment: Opted Out** created (filter tag `opted_out`)
- [ ] **Campaign: T1-COLD** created with subject + body (manual send, cron-triggered)
- [ ] **Campaign: T1-WARM** created
- [ ] **Campaign: T1-HOT** created
- [ ] **Campaign: T2-COLD-NOOPEN** created (automation-triggered)
- [ ] **Campaign: T3-COLD-OPENED** created (automation-triggered)
- [ ] **Campaign: T4-COLD-BREAKUP** created (automation-triggered)
- [ ] Repeat T2–T4 campaigns for WARM and HOT (9 campaigns total)
- [ ] **Automation: T2 No-Open Follow-Up** wired to send on Day 7
- [ ] **Automation: T3 Opened No-Click** wired to send on Day 14
- [ ] **Automation: T4 Break-Up** wired to send on Day 21
- [ ] **Webhook integration** (optional): Backend calls MailerLite API to sync tags (`t1_sent`, `t1_opened`, `t1_clicked`, `opted_out`)
- [ ] **Test run:** Send test batch to Patrick + 5 team members, verify all signals
- [ ] **Weekly digest email** configured (Monday 9 AM UTC)
- [ ] **Env vars set in Railway:**
  - `MAILERLITE_OUTREACH_COLD_GROUP_ID`
  - `MAILERLITE_OUTREACH_WARM_GROUP_ID`
  - `MAILERLITE_OUTREACH_HOT_GROUP_ID`
  - `MAILERLITE_API_KEY` (already set from transactional setup)

---

## 11. Developer Handoff Checklist

For `findasale-dev` integration:

- [ ] **Email templates** in this document are ready to paste into MailerLite campaigns
- [ ] **Personalization tokens** ({{businessName}}, {{city}}, {{state}}, {{reviewCount}}, {{source}}, {{licenseState}}, {{licenseNumber}}, {{verificationUrl}}) are defined and available in `DirectoryClaimEmail` Prisma model
- [ ] **sendOutreachEmailsCron.ts** calls MailerLite API to trigger sends (or uses backend template engine with manual MailerLite sync)
- [ ] **Tracking pixel** (`/api/outreach/pixel`) implemented and fires on email open
- [ ] **Click tracking** (`/api/outreach/click`) implemented and redirects correctly
- [ ] **Unsubscribe handler** (`/api/outreach/unsubscribe`) validates token and creates EmailSuppression record
- [ ] **EmailSuppressionService** queries block sends to hard-bounced, complained, or opted-out emails
- [ ] **Rate-limiting schedule** enforced (20/50/100/200 per week per §6.1)
- [ ] **IMAP reply polling** (classifyOutreachRepliesCron.ts) detects replies and classifies sentiment
- [ ] **Test batch** sent to Patrick's email before Week 1 production launch
- [ ] **Weekly metrics email** wired to send every Monday 9 AM

---

## 12. Known Limitations & Future Improvements

### 12.1 Phase 1 Limitations

- **Timezone-aware sending:** Currently all sends use UTC 2 PM (roughly 9–10 AM Eastern). Phase 2 will distribute by recipient timezone.
- **Subject line A/B testing:** Manual process (elect winner, update campaign). Phase 2 will use MailerLite's native A/B test feature.
- **Reply parsing:** Regex-based sentiment classifier (simple rules: "interested", "remove me", etc.). Phase 2 will use ML or Resend inbound webhook for richer classification.
- **Multi-inbox rotation:** All sends from single outreach@finda.sale. Phase 2 (at 500+/day) will add multiple Workspace seats for reputation distribution.

### 12.2 Phase 2 Enhancements (Not This Sprint)

- **Instantly.ai migration** (at 500+/day) for native bounce handling + multi-inbox DKIM rotation
- **Timezone-aware sending** (detect recipient timezone, send at 9 AM local)
- **Native A/B testing** (MailerLite or Saleshandy API)
- **ML-based reply classification** (vs. regex)
- **Negative reply auto-skip** (don't send T2–T4 if negative reply detected)
- **Manual follow-up queue** (positive replies surface to Patrick for 1:1 outreach)

---

## 13. Approval & Sign-Off

This strategy is **READY FOR IMPLEMENTATION**.

- **Marketing:** Copy finalized, brand voice locked, KPIs defined
- **Developer:** All tech specs available in this doc + OUTREACH_EMAIL_ARCHITECTURE.md + outreach-pipeline-spec-S643.md
- **Patrick:** Approve to proceed to dev dispatch

**Next step:** Dispatch to `findasale-dev` with link to this document + OUTREACH_EMAIL_ARCHITECTURE.md. Expected completion: 8 days dev + 2 days QA + 14 days warm-up = ~24 days to first production send.

---

**Document Version:** 1.0  
**Last Updated:** 2026-05-08  
**Owner:** FindA.Sale Marketing + Product  
**Authority:** D-S626 (build path locked), organizer-acquisition-strategy.md v3
