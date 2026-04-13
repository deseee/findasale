# Legal & Compliance Risk Review — Hold-to-Pay Feature
**Date:** 2026-03-30
**Status:** READY FOR PATRICK REVIEW
**Overall Risk Level:** MEDIUM (blocks on sales tax, consignment clarity)

---

## EXECUTIVE SUMMARY

The Hold-to-Pay feature (evolving "Mark Sold" into a payment completion flow) carries moderate compliance risk. The platform's current Stripe Connect model already handles most payment transmission liability correctly. Key blocking issues: Michigan sales tax nexus and organizer consignment/estate sale licensing—both require attorney review before full launch. Four medium-risk ToS gaps need closure. All low-risk gaps are addressable before beta phase conclusion.

**Blocking items for attorney:**
1. Sales tax obligation scope (Michigan + multi-state)
2. Estate sale operator licensing (Michigan + neighboring states if applicable)
3. Consignment relationship liability framework

**Blocking items for Patrick decision:**
1. Whether to collect sales tax (deferred, likely Phase 2)
2. Whether to mandate organizer licensing verification

**Non-blocking but urgent (pre-ship ToS updates):**
1. Refund policy for payment holds (dispute resolution timing)
2. Pre-auth ($1 hold) terms if implemented
3. Checkout abandonment/non-payment consequences
4. Receipt/proof-of-sale liability clarifications

---

## 1. MONEY TRANSMISSION & STRIPE CONNECT

### Issue: Is FindA.Sale a Money Transmitter?

**Current Model (Already Compliant):**
- FindA.Sale uses Stripe Connect Express accounts for organizers
- Platform never holds, redirects, or intermediates payment flow
- Stripe handles all fund custody and movement
- Organizers receive payouts via Stripe's integrated flow
- Buyers pay Stripe directly for each transaction

**Risk Level:** LOW ✅

**Why this works:**
Stripe Connect Express creates a **payment facilitator (PayFac) model** where:
- Stripe retains payment transmission liability under FinCEN and state money transmitter laws
- FindA.Sale is a facilitator/marketplace, not a transmitter
- You collect a fee (10%) but never touch the funds
- As long as you don't hold, aggregate, or redirect payments, you avoid money transmitter licensing

**Hold-to-Pay doesn't change this:**
- Remote Invoice Path: organizer receives Stripe Checkout link → pays Stripe → Stripe routes payout (no fund custody change)
- POS Path: organizer uses Stripe Terminal → payment goes to Stripe → payout (same flow)

**CLEAR TO PROCEED** on money transmission liability.

**However: Stripe ToS verification needed (MEDIUM PRIORITY)**

Read Stripe's latest Connect platform agreement to confirm:
1. Pre-authorization holds ($1 test transaction) are permitted under your merchant category code (MCC 7999 for secondary sales/marketplaces)
2. Invoice-based checkout links are permitted for organizer payouts
3. POS Terminal integration with organizer accounts is permitted for your use case

**Action:** Before shipping Hold-to-Pay POS path, have Patrick or a Stripe Account Manager confirm MCC alignment and feature approval in writing.

---

## 2. MICHIGAN ESTATE SALE & CONSIGNMENT REGULATIONS

### Issue: Does FindA.Sale need to know if organizers are licensed?

**Current State:**

Michigan **does NOT require a license to operate estate sales or yard sales.** This is unusual—many states do require estate sale operator licenses. Michigan Revised Statute § 445.903 governs "Used Merchandise Dealers" (pawn shops, buy-sell stores) but **exempts estate sales and yard sales entirely**.

**However, complications exist:**
1. **Consignment shops** in Michigan can operate without a license, but relationships are governed by UCC Article 2 and implied agency law
2. **Auction houses** are **not licensed by Michigan**, but auctioneers must comply with federal Uniform Standards of Professional Appraisal Practice (USPAP) if conducting estate/appraisal-related sales
3. **Multi-state risk:** If organizers travel from neighboring states (Indiana, Ohio, Wisconsin) to run sales in Michigan, or if buyers are in other states, those states' laws may apply to their conduct

**Risk Level:** MEDIUM ⚠️

**Why it matters:**
- Consignment disputes are high-risk: organizers may be "agents" for estate owners or consignors, creating implied bailment/agency relationships
- If a buyer sues for a misdescribed item and the organizer claims "consignment," the consignor (not listed on the platform) may emerge as a third party with a claim
- Current ToS disclaims consignment relationships between FindA.Sale and any party, but doesn't clarify the **organizer's liability** to its consignors

**Current ToS Language (lines 70-76 of terms.tsx):**
```
FindA.Sale is a marketplace platform only. We do not enter into
consignment agreements with estate owners, sellers, or any third parties.
If you list items on consignment, the consignment relationship exists solely
between you (the Organizer) and the item owner.
```

**This is good but incomplete.** It shields FindA.Sale but doesn't protect the organizer or set expectations for consignors.

**Hold-to-Pay implications:**
- Payment flow doesn't change consignment law, BUT
- Proof-of-Sale receipts (digital receipts) now become audit evidence in disputes
- If organizer disputes escalate to attorney fees, organizer may claim FindA.Sale is liable for not verifying consignment authority upfront

**Recommendations:**

1. **No license requirement needed** (Michigan doesn't have one), but flag for Architect: consider optional "Organizer Verification" checkbox where organizers attest to legal authority upfront. Not legally required, but reduces liability claims.

2. **Add a consignment agreement template** to Organizer Guides (post-beta). Make it optional, but provide language. Protects organizers from consignor disputes and signals good faith diligence.

3. **ToS update (pre-ship):** Add a subsection after "Legal Authority to Sell" clarifying that organizers are **solely responsible** for consignment relationships and that FindA.Sale will not mediate disputes between organizer and consignor. Organizers indemnify FindA.Sale for such disputes.

4. **For POS Path:** If organizers use Stripe Terminal on-site, ensure they understand that Stripe's transaction history is evidence of what they sold (helps them dispute consignor claims that items weren't actually sold).

**Consignment ToS Gap:** HIGH priority for revision before Hold-to-Pay ships.

---

## 3. MICHIGAN SALES TAX OBLIGATIONS

### Issue: Who collects and remits sales tax?

**Current Model:**
- FindA.Sale **does not collect sales tax**
- Current ToS (Section 4a) explicitly disclaims this: organizers are "solely responsible" for determining tax obligations and remitting

**Legal Reality (BLOCKING ISSUE):**

Michigan sales tax applies to secondhand goods **only if** the sale is conducted by a business, not a casual/personal resale. The ambiguity: what counts as "operating a business"?

- **Estate sales:** Generally considered business activity (dedicated event, organized categories, advertising). Likely subject to 6% Michigan Sales Tax.
- **Yard sales:** Generally considered personal/casual (one-time, minimal organization). Often exempt.
- **Auction houses (in Michigan):** Subject to sales tax on gross proceeds (including buyer's premium).
- **Consignment shops:** Subject to sales tax when they consign items.

**FindA.Sale's Nexus Issue:**

Once FindA.Sale holds a 10% fee and facilitates payment via Stripe, FindA.Sale is arguably the **marketplace facilitator**. Under Michigan Compiled Law § 205.681:

> "A marketplace facilitator is responsible for collecting and remitting sales or use tax on taxable sales made by marketplace sellers through the marketplace facilitator's platform."

Michigan requires marketplace facilitators to collect and remit tax **if the facilitator:**
1. Processes payments or holds funds on behalf of sellers (FindA.Sale does not—Stripe does)
2. Facilitates delivery or logistics (FindA.Sale does not—organizer handles pickup)
3. Provides payment processing that could establish nexus (Stripe, not FindA.Sale, establishes this)

**Current Position:** FindA.Sale likely does **NOT** have a tax collection obligation because Stripe is the payment processor and organizers control fulfillment. However, this is a gray area.

**Risk Level:** MEDIUM-HIGH ⚠️

**Why this matters:**
- If Michigan Department of Treasury audits a large organizer, and that organizer admits FindA.Sale facilitated the sales, Treasury could demand that FindA.Sale collect and remit back taxes
- Failure to comply with a Tax Department demand = penalties + interest (15-20% per year)
- Multi-state expansion (Ohio, Indiana, Wisconsin, Illinois, etc.) multiplies the risk: each state has its own marketplace facilitator rules

**Hold-to-Pay doesn't change this**, but it formalizes the payment link: moving "Mark Sold" → Stripe Checkout makes the platform's role more explicit to tax auditors.

**Recommendations:**

1. **Attorney review required (BLOCKING).** Before shipping Hold-to-Pay or expanding beyond Michigan, have a tax attorney review:
   - FindA.Sale's current tax nexus in Michigan
   - Whether Stripe's role as payment processor shields FindA.Sale from facilitator liability
   - Multi-state tax obligations if organizers are out-of-state

2. **Defer active tax collection** (Phase 2 post-beta). For now, maintain current disclaimer in ToS and add clarification:
   ```
   FindA.Sale does not calculate, collect, or remit sales tax.
   Organizers remain solely responsible for tax compliance.
   As FindA.Sale scales, we may provide sales tax tools for organizers
   (e.g., integration with TaxJar), but collection and remittance
   remain the organizer's legal obligation.
   ```

3. **Add organizer education** to Organizer Guides (not legal advice, but awareness):
   - Estate sales = likely taxable
   - Yard sales = likely exempt
   - Consignment = likely taxable
   - Recommendation: consult a tax professional or use TaxJar/Stripe Tax

4. **Log all sales by organizer state and revenue** (for future compliance tracking). Once you exceed a state's economic nexus threshold (varies: $0 to $100k+), tax collection obligations may kick in.

**Sales Tax ToS Update:** MEDIUM priority (affects organizer expectations).

---

## 4. PRE-AUTHORIZATION HOLDS ($1 TEST TRANSACTION)

### Issue: If we add a $1 pre-auth deposit, are there regulatory concerns?

**Proposed feature (future consideration):** $1 pre-auth on hold placement to verify card validity and deter spam.

**Risk Level:** LOW-MEDIUM ⚠️

**Regulatory Concerns:**

1. **CFPB (Consumer Financial Protection Bureau) Rules on Authorization Holds:**
   - Pre-auths that are never charged as part of a final transaction must be released within **a specific timeframe** (typically 3-5 business days per card processor)
   - If your $1 hold stays authorized past the hold expiry, you could face CFPB complaints and reputational damage

2. **State Consumer Protection Laws:**
   - Some states (Massachusetts, California) have strict rules on "test transactions" and require explicit disclosure before charging
   - Michigan does not have a specific hold-release statute, but UCC § 4-401 implies holds must be released promptly

3. **Stripe TOS Compliance:**
   - Stripe permits pre-auths for marketplace facilitators, but requires:
     - Clear disclosure to the customer that it's a temporary hold
     - Automatic release within 3-5 business days
     - No charging without explicit customer consent

**Hold-to-Pay Impact:**
- If a shopper places a hold (30-90 min) and the item is sold, cancel the hold immediately
- If the hold expires naturally, Stripe auto-releases the $1
- **Recommendation:** Do NOT charge the $1; release it automatically when the hold expires

**ToS Language Needed (if implemented):**
```
A temporary authorization of $1 may appear on your card when you place
a hold. This hold will be automatically released within 3-5 business days.
You will not be charged unless you complete a purchase.
```

**Action:** If you decide to add pre-auth in Phase 2, update ToS and confirm with Stripe that auto-release is enabled on your account.

**Current Status:** LOW priority (deferred feature). Flag for future implementation checklist.

---

## 5. DIGITAL RECEIPTS AS PROOF-OF-SALE

### Issue: Do digital receipts create legal obligations for FindA.Sale?

**Current System:**
- stripeController.ts (lines 33-112) sends a detailed receipt email post-purchase
- Receipt includes: item photo, price breakdown, platform fee, buyer premium, transaction ID
- Receipt explicitly says: "This receipt serves as your purchase confirmation and acknowledgment of the buyer premium"

**Risk Level:** LOW ✅

**Why receipts are safe:**
1. **Evidence of transaction:** Receipts protect BOTH FindA.Sale and organizers by documenting what was sold, for how much, and when
2. **No implied warranty:** The current receipt language correctly avoids promising product quality or condition
3. **Buyer premium acknowledgment:** Good—prevents future disputes ("I didn't agree to pay that extra 5%")

**Potential gaps (minor):**

1. **Returns/warranty implications:**
   - Current ToS (Section 5) says "All sales are final" and no returns except for fraud/misdescription
   - Receipt should reinforce this: "All sales are final. See our Terms of Service for return policy."
   - Current language is close but doesn't explicitly mention the no-returns rule

2. **UCC Article 2 / Merchant Warranty Disclaimers:**
   - Michigan UCC § 440.2314 implies a warranty of merchantability for used goods
   - Second-hand goods are often exempt from this, but ToS should be explicit
   - Current language says "as-is" but could be stronger

**Recommendations (optional improvements, not blocking):**

1. Update receipt email to include a line: "All sales are final. For our return and dispute policy, see [link to ToS § 5]."

2. Add to ToS § 5: "Items are sold in 'as-is' condition. FindA.Sale makes no implied or express warranty of merchantability or fitness for any purpose. Organizers are not liable for hidden defects unless the item was materially misdescribed in the listing."

3. Keep the receipt format as-is—it's legally protective.

**Current Status:** ACCEPTABLE. Optional improvements can be bundled into general ToS refresh post-beta.

---

## 6. REFUND POLICY FOR HOLDS & PAYMENT DISPUTES

### Issue: What happens if a shopper's hold expires or is cancelled before payment?

**Current Hold System (S339-S340 implementation):**
- Shopper places hold → 30-90 min countdown (rank-based)
- Hold naturally expires or is cancelled by organizer
- Organizer sees the hold in their dashboard and can cancel/extend/release it

**Missing from ToS:**
- What happens if shopper's hold expires and they never make a purchase? (Likely: nothing, no charge)
- What if organizer accepts the hold but shopper doesn't complete checkout? (Likely: hold expires, shopper not charged)
- What if organizer extends a hold but shopper still doesn't buy? (Likely: hold expires, shopper not charged)

**With Hold-to-Pay Checkout:**
- Shopper places hold → gets Stripe Checkout link via email/push → has X minutes to pay
- If shopper doesn't pay within X minutes, what happens?

**Risk Level:** MEDIUM ⚠️

**Why it matters:**
- If a shopper claims "I was charged for a hold I didn't complete," FindA.Sale needs a clear policy to dispute the chargeback
- Current ToS doesn't cover this scenario explicitly

**Recommendations (pre-ship ToS updates):**

1. **Add to ToS § 5 (Buyer Terms):**
   ```
   Hold Expiration and Non-Payment:
   When you place a hold on an item, a temporary hold appears on your account.
   If your hold expires naturally or the organizer releases it, no charge occurs.
   If the organizer sends you a checkout link, you have 24 hours to complete payment.
   If you do not complete payment within 24 hours, the hold expires and no charge occurs.
   You will only be charged if you complete the full checkout process.
   ```

2. **Update Hold Expiration email from saleAlertEmailService.ts to include:**
   ```
   "Your hold on [item name] has expired. No charge has been made.
   You can place another hold if the item is still available."
   ```

3. **For Checkout Link expiry:** Add a note to the Stripe Checkout link (if customizable):
   ```
   "Complete this purchase within 24 hours to secure the item."
   ```

**Checkout Abandonment Clause:** HIGH priority for ToS refresh before Hold-to-Pay ships.

---

## 7. ORGANIZER PAYOUT TIMING & STRIPE CONNECT COMPLIANCE

### Issue: How long before organizers receive payouts?

**Current ToS (§ 4, lines 78-83):**
```
Organizers receive proceeds via Stripe Connect Express after the platform fee
is deducted. Payouts are subject to Stripe's standard processing timelines.
```

**This is compliant but vague.** Stripe Connect payouts typically take 1-2 business days, but can be delayed (e.g., first payout delay, verification hold, fraud flag).

**Risk Level:** LOW ✅ (current language is safe)

**Optional improvement (not blocking):**
Add expected timeline to ToS:
```
Payouts typically arrive within 1-2 business days after the sale closes.
First payouts may be delayed 7-14 days while Stripe verifies your account.
Payouts are subject to Stripe's Connect Account Agreement and platform policies.
```

**Current Status:** ACCEPTABLE. Refinement can be bundled into general ToS update post-beta.

---

## 8. DISPUTE RESOLUTION & CHARGEBACK HANDLING

### Issue: How are payment disputes resolved between buyers and organizers?

**Current ToS (§ 5, lines 119-127):**
```
Disputes and Refunds: If you believe a listing is fraudulent, the item is
significantly misdescribed, or the Organizer failed to deliver, you must report
the issue to support@finda.sale within 48 hours of your purchase.
FindA.Sale will investigate and contact the Organizer for their response.
If fraud is confirmed or the Organizer cannot resolve the issue, FindA.Sale
will facilitate a refund. All disputes are reviewed and resolved within 7 days.
If resolution cannot be reached, either party may escalate to Stripe for chargeback review.
```

**This is solid and compliant with Stripe's requirements.** However, a few nuances:

1. **48-hour window:** Is this too strict? Some platforms use 30 days (within credit card dispute window). Consider extending to 14 days or matching credit card dispute window (typically 60 days).

2. **"Significant misdescription":** This is a vague standard. Consider tightening:
   ```
   ...if the item's condition, brand, size, or functionality differs materially
   from the listing description (e.g., listed as "working" but arrives broken,
   or listed as "brand new" but is used).
   ```

3. **Fraud definition:** What counts as fraud? (Stolen item, counterfeit, double-sale, non-existent item, etc.) Add clarity.

4. **7-day resolution window:** Aggressive but acceptable. Flag that if disputes exceed this, Stripe Disputes dashboard takes over.

**Risk Level:** MEDIUM ⚠️

**Recommendations (pre-ship updates):**

1. **Extend dispute window from 48 hours to 14 days** (or match credit card dispute window, 60 days). This aligns with eCommerce best practice and gives buyers time to inspect items.

2. **Add definitions to ToS § 5:**
   ```
   Fraud: includes but is not limited to claims that an item is stolen,
   counterfeit, or does not exist as described.

   Material Misdescription: the item's condition, brand, size, quantity,
   or functionality materially differs from the listing description.
   ```

3. **Clarify escalation process:**
   ```
   If FindA.Sale and the parties cannot resolve a dispute within 7 days,
   either party may file a chargeback with their card issuer.
   FindA.Sale will respond to chargeback inquiries per Stripe's Disputes policy.
   ```

4. **Add organizer obligations to ToS § 4:**
   ```
   Organizers must respond to dispute inquiries within 24 hours.
   Failure to respond may result in automatic refund to the buyer.
   ```

**Dispute Resolution ToS Update:** MEDIUM priority (clarifies expectations for both parties).

---

## 9. TERMS OF SERVICE GAPS SUMMARY

| Section | Current Status | Gap | Priority | Recommendation |
|---------|---|---|---|---|
| Consignment Relationship | Exists (lines 70-76) | Incomplete; doesn't clarify organizer liability | HIGH | Add clause: organizers indemnify FindA.Sale for consignment disputes |
| Hold Expiration & Non-Payment | Missing | No terms for holds that expire without purchase | HIGH | Add "Hold Expiration" clause explaining no charge on expiry |
| Pre-Auth Holds ($1) | Deferred | Not yet implemented | MEDIUM | Add once feature is decided; requires clear disclosure |
| Dispute Window | 48 hours (tight) | May be too aggressive; not aligned with credit card window | MEDIUM | Extend to 14-60 days |
| Fraud Definition | Vague | "Fraud" not defined | MEDIUM | Define fraud and misdescription explicitly |
| Checkout Abandonment | Missing | No terms for Stripe Checkout link expiry | MEDIUM | Add 24-hour payment window clause |
| Sales Tax | Exists (§ 4a) | Vague on marketplace facilitator role | MEDIUM | Clarify FindA.Sale is not collecting tax (yet) |
| Digital Receipts | Exists (good) | Minor: doesn't mention no-returns policy | LOW | Optional: add link to ToS § 5 on receipt email |
| Payout Timing | Vague | "1-2 business days" not stated explicitly | LOW | Optional: add expected timeline |

---

## 10. STRIPE-SPECIFIC COMPLIANCE CHECKLIST

Before launching Hold-to-Pay, verify with Stripe:

| Item | Status | Action |
|------|--------|--------|
| **MCC Code alignment** | VERIFY | Confirm MCC 7999 (secondary goods marketplace) is correct for Hold-to-Pay feature |
| **Pre-auth holds** | VERIFY IF USED | If adding $1 hold, confirm auto-release within 3-5 days is enabled |
| **Checkout links** | VERIFY | Confirm organizers can send Stripe Checkout links to customers (currently not implemented) |
| **POS Terminal integration** | VERIFY | Confirm Stripe Terminal can be used by organizer accounts for on-site checkout |
| **Refund policy** | DOCUMENTED | Current ToS aligns with Stripe's refund requirements ✅ |
| **Connect account terms** | REFERENCED | Current ToS links to Stripe Connect Account Agreement ✅ |
| **Payout timing** | DOCUMENTED | Current ToS acknowledges Stripe's processing timelines ✅ |

**Action:** Have Patrick contact his Stripe Account Manager to confirm all four VERIFY items before POS path ships. Request written confirmation of feature support.

---

## 11. RECOMMENDATIONS BY PRIORITY

### BLOCKER (Ship-Blocking, Attorney Required)

1. **Sales Tax Nexus Review (MEDIUM-HIGH RISK)**
   - What: Attorney review of FindA.Sale's Michigan and multi-state sales tax obligations
   - Why: Marketplace facilitator rules vary by state; Hold-to-Pay makes platform's role more visible
   - Timeline: Before major expansion (or keep Michigan-only for now)
   - Owner: Patrick + Tax Attorney
   - Cost: ~$2-3k for tax counsel review

2. **Michigan Estate Sale Licensing (LOW RISK, but clarify)**
   - What: Confirm Michigan doesn't require estate sale operator license (it doesn't, but document)
   - Why: Some states do; multi-state expansion may trigger requirements
   - Timeline: Before expanding beyond Michigan
   - Owner: Patrick + Business Attorney (brief review)
   - Cost: Minimal (~$500)

3. **Consignment Relationship Liability (MEDIUM RISK)**
   - What: Attorney review of organizer indemnification clause and consignment disclaimers
   - Why: If organizers list consigned items and disputes arise, FindA.Sale could be drawn into third-party claims
   - Timeline: Before full launch (add indemnification clause to ToS)
   - Owner: Patrick + Business Attorney
   - Cost: ~$1-2k

### HIGH PRIORITY (ToS Updates Pre-Ship)

1. **Hold Expiration & Non-Payment Clause** (MEDIUM RISK)
   - What: Add clause clarifying no charge if hold expires without payment
   - Why: Prevents chargeback disputes on holds that naturally expire
   - Timeline: Before Hold-to-Pay ships
   - Effort: 1 paragraph in ToS § 5
   - Owner: Claude (Legal) or Patrick

2. **Consignment Indemnification Clause** (MEDIUM RISK)
   - What: Add organizer indemnification for consignment disputes
   - Why: Shields FindA.Sale from third-party claims by consignors
   - Timeline: Before Hold-to-Pay ships
   - Effort: 1-2 paragraphs in ToS § 4
   - Owner: Claude (Legal) or Patrick + Attorney review

3. **Dispute Window & Definitions** (MEDIUM RISK)
   - What: Extend dispute window from 48 hours to 14 days; define "fraud" and "misdescription"
   - Why: Aligns with eCommerce standard and prevents disputes over ambiguous terms
   - Timeline: Before Hold-to-Pay ships (or in general ToS refresh)
   - Effort: 2-3 paragraphs in ToS § 5
   - Owner: Claude (Legal) or Patrick

### MEDIUM PRIORITY (Pre-Full-Launch)

1. **Organizer Response Requirement** (LOW-MEDIUM RISK)
   - What: Add clause requiring organizers respond to disputes within 24 hours
   - Why: Enables faster resolution; prevents organizers from ghosting buyers
   - Timeline: Before full launch (S341 or later)
   - Effort: 1 paragraph in ToS § 4
   - Owner: Claude (Legal) or Patrick

2. **Checkout Abandonment Clause** (MEDIUM RISK)
   - What: Add terms for Stripe Checkout link expiry (24-hour payment window)
   - Why: Prevents disputes over "why was I charged after the hold expired?"
   - Timeline: Before Hold-to-Pay Checkout path ships
   - Effort: 1 paragraph in ToS § 5
   - Owner: Claude (Legal) or Patrick

3. **Stripe Feature Verification** (MEDIUM RISK)
   - What: Contact Stripe to confirm MCC code, pre-auth rules, Checkout links, POS Terminal support
   - Why: Ensures features align with Stripe ToS and don't trigger merchant risk review
   - Timeline: Before POS Path ships
   - Effort: 1 email to Stripe Account Manager
   - Owner: Patrick

### LOW PRIORITY (Optional, Post-Beta)

1. **Payout Timing Clarification**
   - What: Specify "1-2 business days" in ToS instead of vague "Stripe's processing timelines"
   - Why: Sets clearer expectations
   - Timeline: Post-beta ToS refresh
   - Owner: Claude (Legal)

2. **Digital Receipt Enhancement**
   - What: Add link to ToS § 5 (return policy) on receipt email
   - Why: Reinforces no-returns policy
   - Timeline: Post-beta ToS refresh
   - Owner: Claude (Legal)

3. **Consignment Template for Organizers**
   - What: Create optional consignment agreement template in Organizer Guides
   - Why: Helps organizers formalize relationships with consignors; reduces disputes
   - Timeline: Phase 2 (post-beta)
   - Owner: Claude (Legal) + Organizer Support

4. **Sales Tax Education for Organizers**
   - What: Add section to Organizer Guides: "What you need to know about sales tax"
   - Why: Raises awareness; reduces liability by showing good-faith education
   - Timeline: Phase 2 (post-beta)
   - Owner: Claude (Legal) or Organizer Support

---

## 12. QUESTIONS FOR REAL ATTORNEY

When engaging legal counsel, provide these specific questions:

1. **Sales Tax:**
   - Is FindA.Sale considered a "marketplace facilitator" under Michigan law?
   - If FindA.Sale takes 10% and Stripe is the payment processor, who is liable for collecting tax?
   - What are FindA.Sale's obligations in Ohio, Indiana, Wisconsin, and Illinois (potential multi-state expansion)?

2. **Estate Sales & Licensing:**
   - Are Michigan estate sale operators required to be licensed or registered?
   - If organizers are from other states, do they need to comply with their home state's auctioneering or sales rules?
   - Should FindA.Sale require organizers to attest to legal authority to sell items upfront?

3. **Consignment:**
   - If an organizer lists a consigned item and the consignor later claims fraud, is FindA.Sale liable for not verifying the consignment relationship?
   - What indemnification language would shield FindA.Sale from third-party consignment disputes?

4. **Chargebacks & Disputes:**
   - Is a 48-hour dispute window compliant with Michigan and federal law? Should it be 14 days or 60 days to match credit card limits?
   - If a buyer claims "the item was never delivered," who is liable—organizer or FindA.Sale?

5. **Pre-Authorization Holds:**
   - If we implement a $1 pre-auth that's automatically released, what disclosures are required under Michigan and federal law?
   - Does Stripe's auto-release fully comply with CFPB rules on authorization holds?

---

## OVERALL RECOMMENDATION

**Clear to proceed with Hold-to-Pay feature development, subject to:**

1. ✅ **Immediate:** Update ToS with 4 HIGH-priority clauses (hold expiration, consignment indemnification, dispute window, checkout abandonment) before shipping
2. ✅ **Immediate:** Have Patrick contact Stripe to verify MCC code and feature support
3. ⚠️ **Before major expansion:** Attorney review of sales tax nexus (don't delay if staying Michigan-only for now)
4. ⚠️ **Before POS path ships:** Confirm Stripe Terminal integration is supported for your merchant category
5. 📋 **Deferred:** Sales tax collection logic (Phase 2, post-beta)
6. 📋 **Deferred:** Consignment template + organizer education (Phase 2, post-beta)

**Clear to ship:** Payment facilitation model (Stripe Connect already compliant), digital receipts, dispute resolution process.

**Not clear to ship without changes:** Checkout abandonment / payment window terms (add 1 paragraph to ToS).

---

## NEXT STEPS

1. **Patrick reviews this document** and decides:
   - Will you stay Michigan-only or prepare for multi-state expansion? (Affects sales tax urgency)
   - Will you add consignment template or rely on current disclaimer?
   - Will you extend dispute window from 48h to 14d?

2. **If proceeding, dispatch findasale-records** to log this review and any ToS changes to DECISIONS.md

3. **Patrick emails Stripe Account Manager** with the four verification questions (MCC, pre-auth, Checkout, POS Terminal)

4. **Claude (Legal) drafts ToS updates** based on Patrick's decisions and waits for attorney review before finalizing

5. **Attorney engagement (optional, recommended)** for sales tax + consignment questions (~$2-3k, worth the certainty)

---

## Files Affected by ToS Changes

- `/packages/frontend/pages/terms.tsx` — sections 4 (Organizer), 5 (Buyer), 6 (Fees), 7 (Payment)
- `/packages/frontend/pages/privacy.tsx` — no changes needed (already covers payment + AI tagging)
- `claude_docs/decisions-log.md` — log any new policy decisions
- Organizer Guides (post-beta) — consignment template, sales tax education

---

**Legal Agent Sign-Off**

This review is not legal advice. FindA.Sale should engage a Michigan business attorney specializing in marketplace liability and sales tax before finalizing Hold-to-Pay for public release. The blocking issues (sales tax, consignment, Stripe verification) are not show-stoppers for beta testing with a small organizer base, but they are before general launch.

**Review Status:** Ready for Patrick feedback.
**Last Updated:** 2026-03-30
