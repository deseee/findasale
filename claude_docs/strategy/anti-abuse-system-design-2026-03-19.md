# Anti-Abuse System Design — FindA.Sale Pricing Model
**Date:** 2026-03-19
**Analyst:** Security Expert Agent
**Scope:** Implementable protections against identified pricing model abuse vectors
**Status:** Comprehensive design with priority matrix and engineering estimates

---

## EXECUTIVE SUMMARY

The FindA.Sale pricing model (10%/7%/5% platform fees + $29 PRO/$79 TEAMS subscriptions + 5% buyer premium on auctions + unlimited AI tagging) creates seven identifiable abuse surfaces. This document provides **implementable, prioritized protections** for each vector, ordered by threat level and implementation cost.

**Key Finding:** Most abuse vectors are low-likelihood at beta scale (50 organizers) but become critical at growth scale (500+ organizers). A tiered implementation approach—P0 before beta, P1 before scale, P2 post-beta—balances security with engineering velocity.

**Estimated Total Implementation:** 88–120 engineering hours across 3–4 subagent dispatch rounds.

---

## VECTOR 1: DATA HARVESTING

**Attack:** Organizer signs up for Pro ($29), uploads 2,000 items, uses AI tagging to get $200+ in professional descriptions and valuations, exports everything, cancels subscription. FindA.Sale cost: ~$23 in AI compute.

### Threat Assessment
- **Threat Level:** Medium
- **Likelihood (Beta, 50 orgs):** Possible (3–5%)
- **Likelihood (Growth, 500+ orgs):** Likely (8–12%)
- **Cost per Incident:** $23–50 net loss (AI + storage cost - $29 subscription revenue)
- **Scale Exposure (100 orgs):** $115–200/year if 5% are harvesters

### Recommended Protections (Priority Order)

**P1 — Export Rate Limiting** [12 hours]
- **What it does:** Limit CSV/JSON exports to 1 per calendar month per account
- **Implementation:** Add `lastExportDate` field to `Organizer` schema. Middleware checks on `/api/exports` endpoint before fulfilling request. If export exists within last 30 days, return 429 (Too Many Requests) with message: "You can export once per month. Next export available [DATE]."
- **What the attacker sees:** After first export, "Export unavailable for 30 days" message. Prevents dumping entire catalog.
- **Engineering estimate:** 8 hours (schema migration, endpoint guard, test coverage)

**P1 — First-Month Refund Cap** [6 hours]
- **What it does:** Limit PRO subscription refunds to 50% if requested within 30 days of signup
- **Implementation:** On `/api/refunds` endpoint, check `organizer.createdAt` vs request timestamp. If `delta < 30 days`, cap refund at 50% ($14.50). Stripe refund limit enforced at payment processor level.
- **What the attacker sees:** Cancel subscription, get refund email showing "$14.50 refunded" instead of full $29. 50% penalty makes $23 loss acceptable ($14.50 revenue - $23 cost = -$8.50 vs -$52 without cap).
- **Engineering estimate:** 6 hours (Stripe webhook handler update, business logic, test)

**P2 — Free Trial Cap & Usage Detection** [10 hours]
- **What it does:** If beta offers 7-day free Pro trial, limit to 1 trial per email/IP. Flag accounts with >500 item uploads in <7 days as bulk upload harvesters.
- **Implementation:** Add `trialUsedDate` to `Organizer`. On trial activation, check if email or IP has `trialUsedDate` set; if yes, reject. For bulk upload detection: async job checks if `itemCount > 500 AND createdAt < 7 days`. If true, add `RiskFlag = 'BULK_HARVESTER'` to fraud scoring model.
- **What the attacker sees:** Either trial unavailable or account flagged internally (no immediate blocking, but metrics tracked).
- **Engineering estimate:** 10 hours (trial gating, async job, fraud scoring integration)

**P2 — Feature Gating on AI Descriptions** [8 hours]
- **What it does:** AI-generated descriptions are visible in FindA.Sale only. CSV export includes tag names but NOT full AI descriptions/valuations.
- **Implementation:** In export logic, filter `item.aiDescription` and `item.valuationRange` fields from CSV output. Keep only `item.aiTags` array. Document in export info page: "AI descriptions are locked to FindA.Sale. Exports include tag names only."
- **What the attacker sees:** Export shows tags but not the $200 worth of AI writing. Reduces value of harvest from $200 to $30 (tag names have limited outside value).
- **Engineering estimate:** 8 hours (export field filtering, test coverage)

### Protection Decision Matrix (Vector 1)
| Protection | Priority | Est. Hours | Implementation Trigger | Enforcement |
|------------|----------|-----------|------------------------|-------------|
| Export rate limit | P1 | 8 | Before beta | Hard block (429) |
| First-month refund cap | P1 | 6 | Before beta | Hard cap at Stripe level |
| Free trial cap | P2 | 10 | If trial offered | Feature flag + fraud flag |
| AI description gating | P2 | 8 | Post-beta | CSV filtering |

**Attacker UX After Protections:**
- Signup for Pro, upload 2,000 items, tag with AI
- Export CSV once; tags are visible but descriptions are NOT
- Request refund after 30 days; gets $14.50 of $29 back
- Total value to attacker: $30 (tags alone) + $14.50 refund = $44.50
- Total cost to FindA.Sale: $23 + support time
- **Net outcome:** Marginal loss (-$5 including support). Acceptable at scale.

---

## VECTOR 2: SHILL BIDDING ON AUCTIONS

**Attack:** Organizer creates fake shopper accounts (or colludes with friends) to bid up auction prices. Inflates sale price AND 5% buyer premium, but "buyer" never pays—chargebacks ensue.

### Threat Assessment
- **Threat Level:** Critical
- **Likelihood (Beta, 50 orgs):** Possible (2–3%)
- **Likelihood (Growth, 500+ orgs):** Likely (5–10%)
- **Cost per Incident:** $15 (Stripe chargeback fee) + lost buyer premium revenue + reputation damage
- **Scale Exposure (100 orgs, 20% auctions):** $60/year direct + $500+ churn risk

### Recommended Protections (Priority Order)

**P0 — Bidder Account Age Gate** [10 hours]
- **What it does:** New shopper accounts cannot place bids for 7 days after signup
- **Implementation:** On `/api/bids` endpoint, check `shopper.createdAt`. If `delta < 7 days`, return 403 with message: "Your account is 3 days old. You can bid in 4 days. [Why?]"
- **What the attacker sees:** Can't place bids immediately. Must wait a week per account. Creates friction for shill ring setup.
- **Engineering estimate:** 8 hours (bid gate middleware, test)

**P0 — Same-IP Bidder Detection** [16 hours]
- **What it does:** Flag bids from shopper accounts sharing the organizer's IP or device fingerprint
- **Implementation:**
  1. Capture IP + device fingerprint (user-agent hash) at shopper registration in `Shopper.ipAddress`, `Shopper.deviceFingerprint`
  2. On bid placement, check if `shopper.ipAddress == organizer.ipAddress OR shopper.deviceFingerprint == organizer.deviceFingerprint`
  3. If match, add `BidRiskFlag = 'SAME_IP_AS_ORGANIZER'` to bid record
  4. If 3+ bids flagged for same organizer in 24h, trigger manual review queue
- **What the attacker sees:** Bids still accepted initially, but flagged internally. Manual review team investigates if pattern holds.
- **Engineering estimate:** 16 hours (IP/fingerprint capture, flag system, review queue UI, test)

**P0 — Bidding Velocity Check** [10 hours]
- **What it does:** Flag accounts placing 10+ bids in <1 minute as potential bot/shill activity
- **Implementation:** On `/api/bids`, check `Bid.createdAt` for same shopper in last 60 seconds. If count >= 10, return 429 with message: "You're bidding too fast. Wait 30 seconds and try again." Add `BidRiskFlag = 'VELOCITY_SPIKE'`.
- **What the attacker sees:** Rate limit kicks in after 10 rapid-fire bids. Slows down shill ring automation.
- **Engineering estimate:** 10 hours (rate limiting middleware, test)

**P1 — Bid Cancellation Audit Trail** [12 hours]
- **What it does:** Track bid cancellations. Organizers can cancel 1 bid per sale, but pattern of cancellations + chargebacks = reputation penalty
- **Implementation:**
  1. Add `BidCancellation` record logging: `bidId`, `organizer.id`, `cancelReason`, `timestamp`
  2. Dashboard: Organizer sees "Bid Cancellations: 2/5 used this month"
  3. If organizer hits 5 cancellations + 3 chargebacks in 30 days, flag as high-risk and trigger manual review
- **What the attacker sees:** Can cancel 1 bid per sale, but after 5 cancellations, pattern is visible to support team.
- **Engineering estimate:** 12 hours (schema, UI, audit log, risk scoring)

**P1 — Chargeback + Collusion Tracking** [14 hours]
- **What it does:** Flag chargebacks paired with same-IP bidding or bid cancellation pattern
- **Implementation:**
  1. Stripe webhook: On chargeback, create `ChargebackIncident` record
  2. Check if chargeback buyer and winning bidder share IP or timestamp pattern
  3. If yes, add to `CollisionIncident` table for review
  4. After 2+ incidents, email organizer: "We noticed unusual activity. Let's verify your auction setup."
  5. After 3+ incidents, suspend auction feature for 30 days until manual review
- **What the attacker sees:** First chargeback is normal. Second with same-IP bidder triggers warning email. Third triggers 30-day auction suspension.
- **Engineering estimate:** 14 hours (Stripe webhook handler, incident tracking, suspension logic, test)

**P2 — Reputation Scoring for Organizers** [16 hours]
- **What it does:** Calculate organizer reputation score (1–5 stars) based on: completed sales, chargebacks, bid cancellations, return rate, shopper reviews
- **Implementation:**
  1. Schema: Add `Organizer.reputationScore` (1–5 float), `Organizer.riskFlags[]` array
  2. Nightly job: aggregate organizer metrics, calculate score
  3. UI: Show badge on sale cards (⭐ 4.8) if score >= 4.5, or ⚠️ if score < 2
  4. Auction eligibility gate: If score < 1.5, disable auction feature
- **What the attacker sees:** Reputation drops after chargebacks. Visible to shoppers. Eventually auction feature is disabled.
- **Engineering estimate:** 16 hours (scoring algorithm, nightly job, UI badges, test)

### Protection Decision Matrix (Vector 2)
| Protection | Priority | Est. Hours | Implementation Trigger | Enforcement |
|------------|----------|-----------|------------------------|-------------|
| Bidder account age gate | P0 | 8 | Before beta | Hard block (403) |
| Same-IP bidder detection | P0 | 16 | Before beta | Flag + review queue |
| Bidding velocity check | P0 | 10 | Before beta | Rate limit (429) |
| Bid cancellation audit | P1 | 12 | Before scale | UI + risk scoring |
| Chargeback tracking | P1 | 14 | Before scale | Suspension at 3+ incidents |
| Organizer reputation score | P2 | 16 | Post-beta | UI badge + feature gate |

**Attacker UX After Protections:**
- Create 5 fake shopper accounts, wait 7 days each (35 days total)
- Place 10+ bids on target auction from one account—rate-limited after 10
- Bids flagged for same-IP detection
- Organizer's reputation drops after first chargeback
- After 3 chargebacks from collusion pattern, auction feature suspended for 30 days
- **Result:** Shill ring setup requires weeks of patience, detected at multiple gates, results in account suspension. Not worth the effort for $50–100 margin.

---

## VECTOR 3: ORGANIZER-SHOPPER COLLUSION (FEE AVOIDANCE)

**Attack:** Organizer and shopper collude. Shopper "wins" auction at $1 (paying $0.05 premium). Organizer sells item to shopper off-platform for real price ($100), collecting $100 instead of ~$80 after fees.

### Threat Assessment
- **Threat Level:** Medium
- **Likelihood (Beta, 50 orgs):** Unlikely (1%)
- **Likelihood (Growth, 500+ orgs):** Possible (2–3%)
- **Cost per Incident:** $12.87 lost fees + $4.95 lost buyer premium
- **Scale Exposure (100 orgs, 30% auctions):** $19–40/year (negligible at scale, but reputation damage)

### Recommended Protections (Priority Order)

**P1 — Winning Bid Velocity Check vs Estimated Value** [10 hours]
- **What it does:** Flag auctions where winning bid is <10% of estimated item value
- **Implementation:**
  1. Item schema includes `estimatedValue` (organizer sets, AI can suggest)
  2. On auction close, check: `winningBidAmount < estimatedValue * 0.10`
  3. If true, add `BidRiskFlag = 'SUSPICIOUSLY_LOW_BID'` and hold payment for 24h manual review
  4. Message to organizer: "Winning bid is unusually low. Confirm item condition before releasing payment."
- **What the attacker sees:** Payment is held for 24h. Organizer and shopper can't immediately execute offline transaction.
- **Engineering estimate:** 10 hours (velocity check, payment hold, review queue)

**P1 — Off-Platform Payment Detection (Post-Sale Monitoring)** [14 hours]
- **What it does:** Monitor patterns of low-price sales with no post-purchase activity (no reviews, no issues reported). Likely off-platform completion.
- **Implementation:**
  1. 30 days after purchase, if `Purchase.status = COMPLETED` but `Review.count = 0` and `Dispute.count = 0` and `Shopper.messages = 0`, mark as `OffPlatformRiskFlag`
  2. If organizer has >50% of auctions with this flag, escalate to manual review
  3. Email organizer: "We noticed several completed purchases with no activity. Let's chat about potential issues."
- **What the attacker sees:** Pattern is detected 30 days after transaction. Too late to prevent specific sales, but pattern-level intervention possible.
- **Engineering estimate:** 14 hours (async monitoring job, scoring, email workflow)

**P2 — Manual Review Threshold on <$5 Auctions** [8 hours]
- **What it does:** Any auction ending at <$5 (estimated value >$50) requires organizer confirmation before payment release
- **Implementation:**
  1. Auction close: check winning bid amount vs item photos/title heuristic estimate
  2. If bid < $5 AND item signals high value (brand names, pristine condition, etc.), require organizer to click "Confirm this price is correct" before payment release
  3. Simple confirmation: "This [Item Name] sold for $1. I confirm this price."
- **What the attacker sees:** Must manually confirm each suspiciously low sale. Creates administrative friction.
- **Engineering estimate:** 8 hours (heuristic scoring, confirmation modal, webhook logic)

### Protection Decision Matrix (Vector 3)
| Protection | Priority | Est. Hours | Implementation Trigger | Enforcement |
|------------|----------|-----------|------------------------|-------------|
| Bid velocity check (low vs value) | P1 | 10 | Before scale | Payment hold 24h |
| Off-platform monitoring | P1 | 14 | Before scale | 30-day pattern detection |
| Manual review threshold (<$5) | P2 | 8 | Post-beta | Confirmation gate |

**Attacker UX After Protections:**
- Win $100-value item for $1
- Payment held for 24h while support reviews
- Organizer must confirm price (creates record)
- 30 days later, pattern flagged: organizer contacted by support
- After repeat incidents, suspicious activity flag added to account
- **Result:** Collusion still possible but creates administrative record + pattern detection. Support can reach out after-the-fact.

---

## VECTOR 4: MULTI-ACCOUNT ABUSE (EVADE TIER LIMITS)

**Attack:** Organizer creates 5 free Simple accounts (100 items each = 500 items total) instead of upgrading to Pro. Avoids $29/mo subscription.

### Threat Assessment
- **Threat Level:** Low
- **Likelihood (Beta, 50 orgs):** Unlikely (1%)
- **Likelihood (Growth, 500+ orgs):** Possible (3–5%)
- **Cost per Incident:** Minimal (Cloudinary storage cost only, ~$30)
- **Scale Exposure (100 orgs):** $25–50/year (negligible)

### Recommended Protections (Priority Order)

**P1 — Email Verification (Hard Gate)** [6 hours]
- **What it does:** Each organizer signup requires unique email. No multi-account registration with same email.
- **Implementation:** On `/auth/signup`, check if `email` exists in `Organizer` table. If yes, return 400 with message: "This email is already registered. [Login] or use a different email."
- **What the attacker sees:** Cannot create multiple accounts with same email. Must use different emails (Gmail aliases work, but required).
- **Engineering estimate:** 6 hours (email uniqueness constraint, existing check, test)

**P1 — Payment Method Deduplication** [12 hours]
- **What it does:** Link organizer accounts sharing same Stripe card, PayPal account, or bank account
- **Implementation:**
  1. On signup, collect payment method token (Stripe or PayPal)
  2. Store `Organization.paymentMethodToken` in encrypted field
  3. Nightly job: check for duplicate tokens. If found, create `LinkedAccount` record
  4. In UI: Show "Linked Accounts" section on settings page. Option to merge into single Pro account (auto-upgrade if both free, merge into higher tier)
- **What the attacker sees:** Linked account detection. Can merge manually into one account, which upgrades both to Pro if warranted.
- **Engineering estimate:** 12 hours (payment token capture, dedup job, UI, merge logic, test)

**P2 — IP-Based Soft Linking** [10 hours]
- **What it does:** Flag accounts from same IP uploading >3 concurrent sales in <7 days
- **Implementation:**
  1. On sale creation, capture `organizer.ipAddress`
  2. Nightly job: check if same IP has >3 `Sales` with `createdAt` < 7 days apart
  3. If yes, add `SoftLink` record. Don't block, but track.
  4. UI: "We detected multiple accounts from your IP. Merge them for better management [Merge]"
- **What the attacker sees:** Soft link suggestion. Can choose to merge or ignore.
- **Engineering estimate:** 10 hours (IP capture, nightly job, merge UI, test)

**P2 — Auto-Merge Incentive** [8 hours]
- **What it does:** Offer automatic account merging with 1-month free Pro upgrade
- **Implementation:**
  1. When linked accounts detected (payment method dupe or IP dupe), send email: "We detected 3 accounts from your office. Merge them into one Pro account and get 1 month free."
  2. Merge action: consolidate items, archive extra accounts, upgrade merged account to Pro, bill starts next month
- **What the attacker sees:** Incentive to consolidate accounts voluntarily. Upgrade path clear.
- **Engineering estimate:** 8 hours (merge workflow, free trial granting, email, test)

### Protection Decision Matrix (Vector 4)
| Protection | Priority | Est. Hours | Implementation Trigger | Enforcement |
|------------|----------|-----------|------------------------|-------------|
| Email verification | P1 | 6 | Before beta | Hard gate (400) |
| Payment method dedup | P1 | 12 | Before beta | Link detection + merge UI |
| IP soft linking | P2 | 10 | Post-beta | Suggestion only |
| Auto-merge incentive | P2 | 8 | Post-beta | Email + free upgrade offer |

**Attacker UX After Protections:**
- Create 5 accounts with different emails—works
- Try to pay with same Stripe card—linked accounts detected
- Email offers 1-month free Pro upgrade if merged
- Choose to merge; now one Pro account at $29/mo vs 5 free accounts
- **Result:** Cost-benefit shifts. Attacker pays $29/mo or stays fragmented with limited discoverability. Most will upgrade rather than manage 5 accounts.

---

## VECTOR 5: SUBSCRIPTION GAMING (UPGRADE/DOWNGRADE CYCLING)

**Attack:** Organizer upgrades to Pro for one month before a big sale ($50K GMV, unlimited AI tags), gets 8% fee + free AI tagging ($10 value), then downgrades after. Rinse and repeat monthly.

### Threat Assessment
- **Threat Level:** Low
- **Likelihood (Beta, 50 orgs):** Unlikely (<1%)
- **Likelihood (Growth, 500+ orgs):** Possible (2%)
- **Cost per Incident:** Organizer pays $29 and gets $10 in free AI. Net: +$19 to FindA.Sale. **NOT actually a loss.**
- **Scale Exposure:** Zero (organizer subscription revenue positive even with downgrade)

### Recommended Protections (Priority Order)

**P2 — Re-Subscription Cooldown (Optional)** [6 hours]
- **What it does:** If organizer cancels Pro, cannot re-subscribe for 30 days (optional, depends on monthly churn goals)
- **Implementation:** On `/api/subscriptions/cancel`, set `nextResubscriptionDate = now() + 30 days`. On re-subscribe request, check date. If `nextResubscriptionDate > now()`, return 403 with message: "You can re-subscribe in X days."
- **What the attacker sees:** 30-day cooldown between downgrades/upgrades
- **Engineering estimate:** 6 hours (cooldown field, check, test)
- **Decision:** **SKIP FOR NOW.** This vector is net-positive revenue. Don't block it.

**Alternative: Annual Commitment Discount** [NOT RECOMMENDED at beta]
- Offer $29/mo OR $290/year (1 month free)—incentivizes annual lock-in
- Only deploy if churn data shows >20% monthly churn rate
- Too early to commit to annual discounts; defer until 6 months transaction data exists

### Protection Decision Matrix (Vector 5)
| Protection | Priority | Est. Hours | Implementation Trigger | Enforcement |
|------------|----------|-----------|------------------------|-------------|
| Re-subscription cooldown | P2 | 6 | Defer indefinitely | Optional gate if churn >15% |
| Annual discount | P3 | 12 | Defer to Q3 2026 | Only if annual LTV analysis warrants |

**Assessment:** **No action required.** Subscription gaming is profitable for FindA.Sale. Organizer pays $29 and gets AI tags worth ~$5–10. FindA.Sale nets $19–24. Block only if monthly churn exceeds 15% AND organizers are explicitly stating "I downgrade after big sales."

---

## VECTOR 6: BUYER PREMIUM CHARGEBACKS

**Attack:** Shopper wins auction for $50, pays $52.50 (with 5% premium), then disputes the $2.50 premium claim as "unauthorized transaction."

### Threat Assessment
- **Threat Level:** High (common in all auction platforms)
- **Likelihood (Beta, 50 orgs):** Possible (1%)
- **Likelihood (Growth, 500+ orgs):** Likely (2–5%)
- **Cost per Incident:** $15 (Stripe chargeback fee) + $2.50 lost premium revenue + $20 support time = $37.50
- **Scale Exposure (500 organizers, 1% chargeback rate):** $187–375/year

### Recommended Protections (Priority Order)

**P0 — Clear Disclosure at Checkout** [10 hours]
- **What it does:** Show buyer premium as separate line item (not hidden in total). Require explicit checkbox confirmation before payment.
- **Implementation:**
  1. Checkout flow redesign: Display:
     ```
     Item Price: $50
     Buyer Premium (5%): +$2.50
     ─────────────────
     Total: $52.50

     ☐ I understand and accept the 5% buyer premium.
       (Checkbox required; if unchecked, "Pay" button disabled)
     ```
  2. Checkbox state tracked in `Purchase.premiumAcknowledged = true/false`
  3. Never charge if checkbox is false
- **What the attacker sees:** Clear split of item price vs premium. Cannot claim ignorance in chargeback dispute.
- **Engineering estimate:** 10 hours (checkout UI redesign, state tracking, test)

**P0 — Post-Purchase Confirmation Email** [8 hours]
- **What it does:** Send confirmation email within 1 hour of winning auction with itemized breakdown + 24-hour cancellation window
- **Implementation:**
  1. Async job on auction win: send email template:
     ```
     Congratulations! You won [Item Name]
     Item Price: $50
     Buyer Premium (5%): $2.50
     Total Charged: $52.50

     If this was an error, you have 24 hours to cancel.
     [Cancel Auction Button]

     Pickup details: [organizer info]
     ```
  2. Email delivery tracked: `Purchase.confirmationEmailSentAt`, `Purchase.emailOpenedAt`
- **What the attacker sees:** Email confirmation with all details. Opened email creates evidence record.
- **Engineering estimate:** 8 hours (email template, async job, event tracking, test)

**P1 — Chargeback Defense Documentation** [12 hours]
- **What it does:** Capture and store all chargeback evidence: screenshot of checkout confirmation, email delivery timestamp, buyer's acknowledgment, etc.
- **Implementation:**
  1. On `Purchase` creation, store: `premiumAcknowledged`, `checkoutScreenshot` (hashed), `termsAcceptedAt`, `checkboxCheckedAt`
  2. On Stripe chargeback webhook, create `ChargebackDefense` record with all evidence
  3. Submit evidence to Stripe dispute resolution automatically
- **What the attacker sees:** Nothing immediately, but Stripe will likely rule in FindA.Sale's favor due to evidence.
- **Engineering estimate:** 12 hours (evidence collection, Stripe API integration, dispute submission automation, test)

**P2 — Chargeback Response & Account Actions** [10 hours]
- **What it does:** If chargeback is lost, investigate buyer. If pattern of buyer premium chargebacks, suspend buyer account.
- **Implementation:**
  1. Stripe chargeback lost webhook: escalate to manual review
  2. Check if buyer has 2+ chargeback incidents in 90 days
  3. If yes, add `RiskFlag = 'SERIAL_CHARGEBACK_BUYER'`
  4. After 2+ flags, send buyer: "Your account has been flagged for payment disputes. Future purchases require manual approval."
  5. After 3+ flags, suspend buyer account
- **What the attacker sees:** First chargeback normal. Second triggers review. Third triggers suspension.
- **Engineering estimate:** 10 hours (risk flag tracking, account suspension logic, email, test)

### Protection Decision Matrix (Vector 6)
| Protection | Priority | Est. Hours | Implementation Trigger | Enforcement |
|------------|----------|-----------|------------------------|-------------|
| Clear disclosure at checkout | P0 | 10 | Before beta | Hard gate (checkbox required) |
| Post-purchase confirmation email | P0 | 8 | Before beta | Async delivery + tracking |
| Chargeback defense documentation | P1 | 12 | Before beta | Automatic Stripe submission |
| Chargeback response + suspension | P2 | 10 | Before scale | Flag + account actions |

**Attacker UX After Protections:**
- Win auction, see clear "$2.50 premium" line, check acknowledgment box
- Receive confirmation email with full breakdown
- Initiate chargeback claiming "unauthorized premium"
- FindA.Sale submits email + checkbox screenshot + evidence to Stripe
- Stripe rules in favor of FindA.Sale (evidence overwhelmingly supports claim)
- Chargeback denied, buyer account flagged
- **Result:** Dispute resolution highly likely in favor of FindA.Sale. Attacker has no recourse.

---

## VECTOR 7: NOVEL ABUSE VECTORS (Patrick's "What Aren't We Thinking Of?")

### Novel Vector A: Organizer Inventory Dumping + Rapid Cancellation

**Attack:** Organizer runs a promotional sale ("All items $1 opening weekend!"), attracts 10,000 shoppers, then cancels sale after 2 hours. Collects 10,000 shopper emails/contacts for spam/resale. Cancels subscription immediately.

**Threat Level:** Medium
**Likelihood:** Possible (2%) at scale
**Cost per Incident:** Email list worth $50–200 to attacker on dark market. FindA.Sale cost: $20 (support + infrastructure). Reputation damage: high.

**Protections:**
1. **Sale Cancellation Audit** [8 hours]: Flag sales cancelled <2 hours after publication + >100 shopper holds. Add `RiskFlag = 'RAPID_CANCELLATION'`. Require organizer explanation. Store cancellation reason: "Technical issue" vs "Changed mind" vs "Wrong prices."
2. **Shopper Email Gating** [6 hours]: Don't export collected shopper emails; MailerLite owns the list. Organizer gets "email to top 100 shoppers" action via MailerLite API (we send, not they export).
3. **Rapid Re-Signup Detection** [8 hours]: If organizer cancels and re-signs up within 30 days, flag as suspicious. Manual review before re-activation.

**Attacker UX:** Can cancel sales, but emails aren't exportable. Pattern of rapid cancellations + re-signup triggers review. Account suspended pending investigation.

---

### Novel Vector B: Fake Reviews / Reputation Gaming

**Attack:** Organizer pays friends to leave fake 5-star reviews ("Best sale ever!") to rank higher. Or shopper pays for fake purchase records to appear as "verified buyer" in their public profile.

**Threat Level:** Medium
**Likelihood:** Possible (3%) at scale
**Cost per Incident:** Reputation damage (trust erosion), no direct revenue loss

**Protections:**
1. **Verified Purchase Badge** [10 hours]: Only shoppers with actual `Purchase` records (past-date, non-refunded) can leave reviews. Schema: `Review.verifiedPurchase = true` only if `shopper.id` appears in `Purchase` with `completedAt < reviewDate`.
2. **Review Timing Anomaly Detection** [12 hours]: Flag reviews submitted <1 hour after purchase (suspect copy-paste) or all reviews submitted within 24 hours from same IP (organized spam). Require human moderation.
3. **Shopper Feedback Anonymity** [8 hours]: Hide shopper name on review until organizer confirms purchase. Prevents pre-written fake reviews.

**Attacker UX:** Verified badge visible on reviews. Fake reviews from non-buyers can't be submitted. Reviews from same IP within short timeframe flagged for moderation.

---

### Novel Vector C: Photo Spam / CDN Exhaustion

**Attack:** Organizer uploads 100,000 tiny photos (low-quality images) to exploit unlimited photo quota (Teams tier). Cloudinary storage balloons to $500+/month. FindA.Sale absorbs cost.

**Threat Level:** Low (requires $79/mo subscription)
**Likelihood:** Unlikely (<1%)
**Cost per Incident:** $500 monthly Cloudinary overage

**Protections:**
1. **Photo Compression at Upload** [12 hours]: Automatically compress all photos on-device before upload (reduce 3MB → 500KB). Reject images <100x100px or >50MB. Hard limits at upload boundary.
2. **Storage Quota Enforcement** [10 hours]: Teams tier gets "unlimited" but with soft limits. Monitor monthly storage. If Teams organizer exceeds $200/month in Cloudinary costs, email: "Your storage usage is high ($X). Consider archiving old sales to reduce costs."
3. **Duplicate Image Detection** [14 hours]: If organizer uploads same photo >10 times, flag and ask: "This photo appears X times. Archive duplicates?" Use perceptual hashing to detect near-duplicates.

**Attacker UX:** Photos compressed automatically. Storage monitored. Excessive duplication flagged. Not attractive target for attack (still costs organizer reputational damage to fill with spam).

---

### Novel Vector D: Chargeback Churning (Stripe Gets Angry)

**Attack:** Shopper wins 20 auctions, pays via Stripe, then initiates chargebacks on all 20. Cost to FindA.Sale: 20 × $15 (Stripe fee) = $300. If chargeback rate exceeds 1%, Stripe terminates the account.

**Threat Level:** Critical (accounts terminated by Stripe have massive business impact)
**Likelihood:** Possible (1–2% of shoppers) at scale
**Cost per Incident:** Account termination = business shutdown

**Protections:**
1. **Aggregate Chargeback Monitoring** [12 hours]: Track aggregate chargeback rate monthly. If rate > 0.8%, trigger escalation. If > 1% for 2 consecutive months, automatically implement:
   - Pre-authorization for all bids (tokenize card upfront, verify via Stripe 3DS)
   - Payment hold for 24h before release (default)
2. **Serial Chargeback Buyer Detection** [10 hours]: After 2 chargebacks on same shopper in 60 days, flag account. Require manual review before next bid.
3. **Stripe Communication Protocol** [6 hours]: Set up Slack alert on Stripe webhook for chargeback events. Alert manual review team to investigate patterns in real-time.

**Attacker UX:** First few chargebacks normal. After 2, account flagged. After pattern emerges, pre-authorization required + 24h payment hold. Further chargebacks trigger account suspension.

---

### Novel Vector E: Insider Abuse (Admin Exploitation)

**Attack:** Patrick or future admin takes 0% platform fee on their own test sales, or credits themselves premium features for free.

**Threat Level:** Critical (internal control failure)
**Likelihood:** Low if governance in place, High if none
**Cost per Incident:** Uncontrolled cost leakage + audit failure

**Protections:**
1. **Audit Logging on Fee Overrides** [16 hours]: Any fee override, subscription grant, or manual billing action logged with `admin.id`, `timestamp`, `reason`, `approvalChain`. Dashboard: view all fee overrides in past 30 days.
2. **Segregation of Duties** [12 hours]: Require 2-admin approval for any fee override >$50. Patrick approves, then second admin (or AI audit) must verify before execution.
3. **Quarterly Audit Report** [8 hours]: Generate report: "All fees charged, all refunds issued, all overrides documented" for external review. Save to secure S3 bucket.

**Attacker UX (Internal):** Cannot override fees without audit trail. Cannot approve own fee changes. Quarterly reports expose anomalies.

---

## PRIORITY MATRIX: WHAT SHIPS BEFORE BETA VS SCALE

### BEFORE BETA (P0) — Must Ship Before 50 Organizers
**Total Engineering: ~90 hours (3–4 subagent dispatch rounds)**

| Vector | Protection | Hours | Rationale |
|--------|-----------|-------|-----------|
| Shill Bidding | Bidder account age gate | 8 | Prevent throwaway shill accounts |
| Shill Bidding | Same-IP bidder detection | 16 | Catch local collusion patterns |
| Shill Bidding | Bidding velocity check | 10 | Prevent bot spamming |
| Premium Chargebacks | Clear disclosure at checkout | 10 | Evidence gathering + dispute defense |
| Premium Chargebacks | Post-purchase confirmation email | 8 | Evidence record for chargebacks |
| Premium Chargebacks | Chargeback defense documentation | 12 | Automatic Stripe submission |
| Subscription Gaming | Export rate limit | 8 | Prevent data harvesting via exports |
| Subscription Gaming | First-month refund cap | 6 | Penalize short-term exploiters |
| Multi-Account | Email verification | 6 | Prevent mass account creation |
| **Total P0** | | **84 hours** | |

### BEFORE SCALE (P1) — Must Ship Before 500 Organizers
**Total Engineering: ~100 hours (3–4 subagent dispatch rounds, parallel with P0)**

| Vector | Protection | Hours | Rationale |
|--------|-----------|-------|-----------|
| Data Harvesting | Free trial cap & usage detection | 10 | Prevent bulk harvesting trials |
| Data Harvesting | Feature gating on AI descriptions | 8 | Reduce harvester value proposition |
| Shill Bidding | Bid cancellation audit trail | 12 | Pattern detection for organizers |
| Shill Bidding | Chargeback + collusion tracking | 14 | Incident aggregation + suspension |
| Shill Bidding | Organizer reputation scoring | 16 | Public trust signal + gating |
| Collusion | Winning bid velocity (low vs value) | 10 | Payment hold on suspicious bids |
| Collusion | Off-platform monitoring | 14 | 30-day pattern detection |
| Multi-Account | Payment method deduplication | 12 | Link accounts via Stripe/PayPal |
| Multi-Account | IP soft linking | 10 | Suggest merging of detected dupes |
| Premium Chargebacks | Chargeback response & suspension | 10 | Account actions post-chargeback |
| Novel: Inventory Dumping | Sale cancellation audit | 8 | Rapid cancellation detection |
| Novel: Fake Reviews | Verified purchase badge | 10 | Trust + authenticity signal |
| Novel: Fake Reviews | Review timing anomaly detection | 12 | Spam review filtering |
| Novel: Photo Spam | Photo compression at upload | 12 | Reduce storage exhaustion risk |
| Novel: Chargeback Churning | Aggregate chargeback monitoring | 12 | Stripe health monitoring |
| **Total P1** | | **147 hours** | |

### AFTER SCALE (P2) — Nice to Have, Deploy Post-Beta
**Total Engineering: ~60 hours (2–3 subagent dispatch rounds, parallel with other work)**

| Vector | Protection | Hours | Rationale |
|--------|-----------|-------|-----------|
| Data Harvesting | AI description gating | 8 | Reduce harvester ROI |
| Collusion | Manual review threshold (<$5 bids) | 8 | Administrative friction |
| Multi-Account | Auto-merge incentive | 8 | Encourage consolidation |
| Novel: Fake Reviews | Shopper feedback anonymity | 8 | Prevent pre-written reviews |
| Novel: Photo Spam | Duplicate image detection | 14 | Discourage bulk upload spam |
| Novel: Chargeback Churning | Serial chargeback buyer detection | 10 | Account-level chargeback patterns |
| Novel: Chargeback Churning | Stripe communication protocol | 6 | Real-time alert system |
| Novel: Insider Abuse | Audit logging on fee overrides | 16 | Internal controls |
| **Total P2** | | **78 hours** | |

### IMPLEMENTATION TIMELINE
```
Week 1–2 (S182): Dispatch P0 batch 1 (Shill Bidding vectors, Premium Chargebacks)
  → findasale-dev builds: account age gate, same-IP detection, velocity check, checkout UI, emails

Week 3–4 (S183): Dispatch P0 batch 2 (Data Harvesting, Multi-Account)
  → findasale-dev builds: export rate limit, refund cap, email verification, trial cap

Week 5 (S184): QA + Deploy P0 to staging, run beta smoke tests

Week 6+ (S185–186): Begin P1 dispatch in parallel with beta operations
  → Reputation scoring, chargeback tracking, advanced monitoring
  → Deploy P1 gates incrementally as beta data informs priorities

Post-Beta (Q3 2026): Deploy P2 as operational load allows
```

---

## HONEST EVALUATION: WOULD A SECOND PRODUCT (SEPARATE TOOL VS MARKETPLACE) HELP?

Patrick asked: "Could we isolate abuse by splitting into two products—organizer tool (manage sales locally) vs marketplace (where shoppers find organizers)?"

### The Idea
- **Tool:** Organizer desktop app or web tool for inventory management, AI tagging, POS. Fee-free or low subscription ($9/mo). No marketplace integration.
- **Marketplace:** FindA.Sale shopper side—discovery, bidding, purchases. Organizers opt-in to list in marketplace for $99 flat per sale (or higher cut).
- **Theory:** Separate incentives, separate fraud surfaces, easier to audit.

### Honest Assessment: **DON'T SPLIT THE PRODUCT**

**Why:**
1. **Network effects are everything.** Organizers want to run a marketplace-integrated sale (find shoppers). Shoppers want a unified app with all sales. Splitting kills the network effect. You'd have to build multi-platform sync, which doubles complexity.

2. **Abuse vectors don't change with split.** Shill bidding happens in marketplace anyway. Data harvesting still happens on the tool side. Collusion still happens. You gain no new security by splitting—you just have to monitor two products.

3. **Economics get worse.** Two products = 2x infrastructure, 2x support, 2x development velocity drain. Your margins compress exactly when you want them to expand for scale. You'd need to charge the organizer tool $29/mo + marketplace fees, which totals $50+/mo vs single $29 PRO product today.

4. **Fraud moves to the combined surface.** If you split the products, abuse vectors move to the seam (tool + marketplace connection). Now you need data sync logic, API security, webhook validation—all new attack surface. Hacker incentive shifts to: "Compromise tool → spam marketplace" or vice versa.

5. **You can't charge separately for what's currently bundled.** Organizers are paying $29 for PRO today expecting unlimited AI tags + batch ops. If you move batch ops to the tool ($9/mo) and marketplace access to the marketplace ($99/sale), that's a price increase + feature fragmentation. They'll leave for EstateSales.NET.

**What You CAN Do Instead (Better):**
- Keep unified product, but **gate features more explicitly**:
  - Free tier: upload 50 items, basic POS, no marketplace boost
  - Pro tier: unlimited items, unlimited AI, marketplace visibility (organic, no ads)
  - Teams tier: everything + featured placement + API

- This achieves the same goal (clearer product boundaries, easier abuse gating) without splitting infrastructure.

**When Splitting WOULD Make Sense:**
- If you wanted to sell the **tool** to enterprise (museum software, auction house backend) separate from the marketplace. E.g., "Use our organizer tool internally, optionally list to FindA.Sale marketplace." That's a B2B SaaS + B2C marketplace model. But that's 2027+ thinking.

**Recommendation:** **Stay unified.** Use the anti-abuse protections in this document instead. They're far cheaper than a product split and achieve the same isolation without losing network effects.

---

## FINAL IMPLEMENTATION ROADMAP

### Immediate Actions (This Sprint)
1. ✅ **Approve P0 + P1 priorities** — Patrick reviews and prioritizes any vector he's most concerned about
2. ✅ **Create subagent dispatch prompts** — for each batch (Shill Bidding, Premium Chargebacks, Data Harvesting)
3. ✅ **Assign Stripe API expertise** — ensure dev team comfortable with chargeback webhooks, 3D Secure, tokenization

### Development (S182–S186, 4 sprints)
- **Sprint 1 (S182):** P0 batch 1 — Shill bidding gates (8+16+10 hrs), Premium Chargeback UI (10+8+12 hrs) = 64 hrs
- **Sprint 2 (S183):** P0 batch 2 — Data harvesting (8+6 hrs), Multi-account (6+12 hrs) = 32 hrs
- **Sprint 3 (S184):** P1 batch 1 — Reputation scoring, chargeback tracking (16+14 hrs), bid velocity (10 hrs) = 40 hrs
- **Sprint 4 (S185):** P1 batch 2 — Off-platform monitoring, soft linking (14+10 hrs), advanced fraud (12+12 hrs) = 48 hrs
- **Post-Beta (S186+):** P2 + novel vectors (78 hrs phased)

### Monitoring & Ops (Day 1 Post-Launch)
- Set up Sentry alerts for abuse flags (RiskFlag, BidRiskFlag, ChargebackIncident)
- Create support dashboard: "Flagged accounts this week" + manual review queue
- Weekly metrics: chargebacks rate, bid flags, organizer score distribution
- Escalation protocol: If any metric exceeds threshold, trigger Patrick review

### Data-Driven Iteration
- Track false positives: How often are legit organizers flagged? (Target: <5%)
- Track effectiveness: Did protections reduce chargebacks? (Target: <1% rate)
- Adjust thresholds quarterly based on real data

---

## COST-BENEFIT SUMMARY

### Upfront Investment
- Engineering: 84 hours P0 + 147 hours P1 + 78 hours P2 = **309 hours** (~6 engineer-months at typical velocity)
- Operational: ~20 hours/month support + monitoring setup

### Protected Against (Annual Exposure at 500 Organizers)
| Vector | Annual Loss Without Protections | Annual Loss With Protections | Risk Reduction |
|--------|--------------------------------|------------------------------|----------------|
| Data Harvesting | $500–800 | $50–100 | 90% |
| Shill Bidding | $1,625 | $100–200 | 92% |
| Collusion | $192 | $50 | 74% |
| Multi-Account | $100–200 | $25 | 75% |
| Chargebacks | $1,875 | $300 | 84% |
| Chargeback Churning | Stripe termination ⚠️ | Managed <1% | 95%+ |
| Novel Vectors | $500+ | $50 | 90% |
| **Total Annual Exposure** | **$5,000–6,500** | **$575–800** | **~88% reduction** |

### ROI
- Engineering cost: ~309 hours × $150/hr (loaded rate) = **$46,350**
- Annual fraud loss prevented: ~$5,000–6,500
- Payback period: 7–9 years at current scale
- **BUT:** Prevents Stripe account termination (> $1M business impact). Protects reputation + shopper trust (network effect value). Enables confident scaling.

**Verdict:** Security investment is **NOT primarily ROI-driven.** It's **risk mitigation + operational stability.** No Stripe termination, no reputation collapse, no "fraud platform" label = ability to raise capital + scale confidently.

---

## CONCLUSION

All seven abuse vectors are **implementable, manageable, and prioritized.** No vector is unsolvable. The pricing model is **fundamentally sound**; the protections make it **scale-safe.**

**Key Takeaways:**
1. **P0 before beta:** Shill bidding gates + premium chargeback protections. Prevents most damaging cases.
2. **P1 before scale:** Reputation scoring, advanced fraud detection. Builds trust as organizer base grows.
3. **P2 post-beta:** Polish + novel vector handling. Deployed based on real abuse data.
4. **Don't split product.** Unified model is strategically stronger.
5. **Monitor continuously.** Set up fraud dashboards on day 1. Weekly review of metric trends.

---

**Document Status:** Complete. Ready for Patrick review and subagent dispatch.
**Next Step:** Patrick prioritizes P0 batch 1 for immediate dev start. Recommend dispatch to findasale-dev within 1 week to enable beta-ready security posture.
