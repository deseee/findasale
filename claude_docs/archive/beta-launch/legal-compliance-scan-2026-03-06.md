# Legal Compliance Scan — Beta Readiness
*Date: 2026-03-06*
*Scope: FindA.Sale MVP (Grand Rapids estate sale marketplace)*
*Reviewer: FindA.Sale Legal & Compliance Agent*

---

## Executive Summary

FindA.Sale has shipped **ToS, Privacy Policy, and checkout consent** (CA1 complete). Core compliance infrastructure is in place. However, **five medium-to-high risk gaps** require attention before beta launch:

1. **Sales Tax Disclosure** — not addressed; may be a legal obligation
2. **Refund Policy Detail** — vague on disputes and organizer fulfillment
3. **Michigan Estate Sale Regulations** — no verification that organizers are operating legally
4. **Stripe Compliance Alignment** — liability limits and organizer obligations need tightening
5. **Data Deletion Workflow** — Privacy Policy promises 30-day deletion; process not documented

**Overall Risk Level: MEDIUM** — Not a BLOCKER, but these items should be resolved before beta reaches scale.

---

## Audit Findings

### 1. Terms of Service — Status & Risk

**✅ COVERED:**
- Eligibility (18+) explicitly required
- Service description (marketplace, not seller, no ownership claims)
- Account responsibility and credential confidentiality
- Organizer obligations (right to sell, prohibited items, payouts, cancellation)
- Buyer obligations (all sales final, auction binding, pickup terms)
- **Platform fees** clearly disclosed: 5% fixed-price, 7% auction (lines 108–110)
- **Payment processing** via Stripe (link to Stripe SSA + Privacy)
- **Prohibited conduct** (scraping, shill bids, harassment, malware, off-platform deals)
- **IP** (platform owned, user grants license to uploaded photos)
- **Disclaimers** ("as is," no warranty on listing accuracy)
- **Liability cap** ($100 or 3-month fees, whichever greater) — appropriate for marketplace
- **Indemnification** (users indemnify platform)
- **Governing law** (Michigan) and **jurisdiction** (Kent County) — solid for local operation
- **Notice of changes** (14 days advance email notification)

**⚠️ NEEDS ATTENTION:**

| Level | Area | Issue | Recommendation |
|-------|------|-------|---|
| MEDIUM | Refund Policy | ToS states "all sales final" but does not detail dispute process. Section 5 mentions "materially misdescribed" but offers no timeline for investigation or evidence requirements. | Add: "Disputed purchases must be reported within 48 hours. FindA.Sale will investigate with organizer. If fraud confirmed, FindA.Sale will facilitate refund. All disputes resolved within 7 days or escalated to Stripe." Link to /contact for dispute submission. |
| MEDIUM | Sales Tax | No mention of sales tax obligations for buyers or organizers. | Add section: "Sales Tax Obligations. FindA.Sale does not calculate or collect sales tax on behalf of organizers. Organizers are responsible for registering for and remitting sales tax as required by their state and local laws. Buyers are responsible for understanding their potential tax obligations on items purchased." Refer to attorney for nexus analysis. |
| MEDIUM | Organizer Fulfillment | "Organizer must fulfill the item or arrange a mutually agreed refund" (line 75–76) — vague on timing and defaults. | Add: "Organizers must acknowledge purchase within 24 hours. Pickup must occur within 30 days of sale close unless organizer extends in writing. If organizer fails to fulfill or communicate, buyer may file dispute at support@finda.sale." |
| LOW | Consignment Assumption | ToS does not explicitly disclaim that FindA.Sale is a party to consignment agreements between organizers and sellers (estate owners). | Add: "Organizers are responsible for securing legal authority to sell items, whether through ownership, consignment, or power of attorney. FindA.Sale is not a party to any consignment agreement and assumes no liability for organizer–seller disputes." |

---

### 2. Privacy Policy — Status & Risk

**✅ COVERED:**
- **Account info** collected (name, email, password hash, phone for organizers, payout info)
- **Transaction data** (purchases, bids, payouts) with 7-year retention for financial compliance
- **Location** (geocoded addresses, no continuous tracking)
- **Content uploads** (photos via Cloudinary, AI tagging via Google Vision/Claude with no PII in request)
- **Usage data** (browser, device, IP, pages, searches, referrers — standard analytics)
- **Cookies** (session auth, local storage UI prefs, push tokens with opt-in)
- **No third-party advertising cookies** — good privacy posture
- **Data usage** (account, transactions, fraud, performance, analytics, legal)
- **Data sharing** (Stripe, Cloudinary, Sentry, Google/Anthropic for AI, organizer fulfillment, legal)
- **Data retention** (account while active, transactions 7yr minimum, deletion on request within 30 days)
- **Security** (HTTPS/TLS, hashed passwords, JWT auth, restricted DB access, Sentry monitoring)
- **User rights** (access, correction, email opt-out, push revocation, account deletion)
- **Michigan residents** acknowledgment of possible additional rights
- **Children's privacy** (not directed to under-18; no knowingly collected)
- **Notice of changes** (14 days advance email for material changes)

**⚠️ NEEDS ATTENTION:**

| Level | Area | Issue | Recommendation |
|---|---|---|---|
| MEDIUM | Data Deletion Workflow | Policy promises 30-day deletion on request, but no internal process documented for support team. | Create internal SOP: "When support receives account deletion request at support@finda.sale, mark user inactive, remove from email lists, and schedule DB data purge 30 days later. Retain transaction records per financial law (7 years); pseudonymize personal details." Document in support KB. |
| MEDIUM | GDPR Notice | Policy mentions no GDPR basis if EU users are served. If even 1 EU user registers, CCPA/GDPR obligations activate. | Add: "If you reside in the EU or Canada, FindA.Sale's legal basis for processing is performance of contract (payment, transactions) and legitimate interest (fraud prevention, analytics). You have the right to lodge a complaint with your data protection authority." Provide authority contact template. |
| MEDIUM | AI Tagging Disclosure | Policy discloses Google Vision and Claude AI but does not inform users those tags may be inaccurate or carry model bias. | Add: "AI-generated item tags are suggestions only. Organizers review and accept or reject them. These suggestions may be inaccurate, biased, or incomplete — always verify item details manually." |
| LOW | Third-Party Links | Policy mentions third-party sites but doesn't link to their privacy policies (e.g., Stripe's). | Add links to Stripe Privacy Policy and Cloudinary Privacy Policy in this section for user convenience. |
| LOW | Breach Notification | Policy does not state breach notification timeline or process. | Add: "In the event of a confirmed data breach, we will notify affected users within 72 hours via email and post a notice at /security-notice." |

---

### 3. Stripe Compliance — Status & Risk

**✅ COVERED:**
- Payment processing delegated to Stripe (links to Stripe SSA + Privacy in ToS section 7)
- No full card data stored on FindA.Sale servers
- Platform fee disclosed before transaction (shown in checkout)
- Stripe Connect Express for organizer payouts
- Instant payout option available (subject to Stripe policy)
- Payouts subject to Stripe's processing timelines

**⚠️ NEEDS ATTENTION:**

| Level | Area | Issue | Recommendation |
|---|---|---|---|
| HIGH | Organizer KYC & Verification | ToS does not explicitly state that organizers must complete Stripe's KYC before payouts are released. | Add to Organizer Terms section: "Before payouts are issued, you must complete Stripe Connect onboarding, including identity verification. Stripe may withhold payouts if KYC is incomplete or flagged. You are responsible for maintaining your Stripe account in good standing." |
| MEDIUM | Chargeback & Dispute Handling | ToS does not detail how FindA.Sale handles Stripe chargebacks or who bears the cost. | Add: "If a buyer disputes a charge with Stripe, the organizer's Stripe account will be debited for the chargeback fee (~$15 USD). FindA.Sale does not absorb chargeback costs. Organizers should refer disputes to FindA.Sale support before chargebacks are filed." |
| MEDIUM | Fee Structure & Notification | ToS reserves the right to modify fees with 30 days' notice, but organizers must affirmatively acknowledge. | Clarify: "Fee changes require 30 days' advance notice via email. Continued use after the effective date constitutes acceptance. If an organizer objects, they may deactivate their account within 30 days of notice." |
| LOW | Card Brand Requirements | Stripe may restrict certain merchants (high-risk categories like auctions/gambling). FindA.Sale auctions may trigger additional scrutiny. | Document in internal KB: "Stripe may classify FindA.Sale auctions as higher-risk. Maintain detailed transaction records and refund logs to demonstrate compliance. Monitor Stripe dashboard for any account warnings." |

---

### 4. Michigan-Specific Regulations — Status & Risk

**✅ WHAT WE KNOW:**
- Michigan does **not require a license** to conduct estate sales (unlike some states).
- FindA.Sale operates in Grand Rapids, Michigan.
- Organizers are individuals/companies, not licensed dealers.

**⚠️ GAPS & RISKS:**

| Level | Area | Issue | Recommendation |
|---|---|---|---|
| HIGH | Local Ordinances | Some Michigan counties or municipalities may have local ordinances requiring permits, zoning compliance, or registration for "public sales." Grand Rapids specifically has not been verified. | **ACTION FOR ATTORNEY:** Verify with Grand Rapids city clerk: Are organizers required to obtain a permit or file notice for estate sales? If yes, add ToS language: "Organizers are responsible for obtaining all required local permits or licenses. FindA.Sale is not responsible for regulatory compliance." |
| MEDIUM | Sales Tax Nexus | Michigan has no statewide sales tax for used goods, BUT Washtenaw County and others have local use tax. If FindA.Sale reaches multiple counties, tax nexus becomes active. | **ACTION FOR ATTORNEY:** As platform volume grows beyond Grand Rapids, conduct nexus analysis. Does FindA.Sale's presence in a county trigger use-tax collection obligations? This is critical for post-beta expansion. For now, disclose clearly: "Organizers are responsible for sales tax per their state/local jurisdiction." |
| MEDIUM | Auction Law | Michigan auction law (MCL 600.1201 et seq.) requires licensed auctioneers for certain auctions. "Social" auctions may be exempt, but it's unclear if FindA.Sale's live bidding qualifies. | **ACTION FOR ATTORNEY:** Does Michigan law classify FindA.Sale's bidding feature as an "auction" requiring a licensed auctioneer? If unclear, add ToS note: "Bidding on FindA.Sale is facilitated via software; organizers retain the right to accept or reject bids. This may not constitute a formal auction under Michigan law." |
| LOW | Seller Disclosure | Michigan does not require specific item condition disclosures for used goods in casual sales, but strong consumer-protection posture suggests recommending "as-is" clarity. | Strengthen ToS: "All items are sold 'as-is, where-is.' Organizers must describe condition accurately; buyers have 48 hours to report fraud. No returns." (Already in ToS section 5; reinforce via guide page.) |

---

### 5. Checkout Consent — Status & Risk

**✅ COVERED:**
- Checkbox in `CheckoutModal.tsx` (lines 88–111):
  - "I agree to ToS and Privacy Policy"
  - "All sales are final"
  - Link to contact support for disputes
- Checkbox **blocks submit** until checked (line 124)
- Links open ToS/Privacy in new tab
- Consent is captured at the right moment (just before payment)

**✅ NO ISSUES FOUND** — Checkout consent is solid.

---

### 6. Liability Limits — Status & Risk

**✅ COVERED:**
- Section 11 (Limitation of Liability):
  - No indirect, incidental, special, consequential, or punitive damages
  - Cap: greater of $100 or fees paid in last 3 months
  - Appropriate for a marketplace intermediary
  - Consistent with Stripe's own liability structure

**✅ NO ISSUES FOUND** — Liability limits are well-structured and defensible.

---

### 7. Minors & Age Restriction — Status & Risk

**✅ COVERED:**
- ToS Section 1: "You must be at least 18 years old"
- Privacy Policy Section 7: "FindA.Sale is not directed to children under 18"

**✅ NO ISSUES FOUND** — Minors are properly excluded from financial transactions.

**NOTE:** No active enforcement (e.g., age gate during registration) is implemented, but the contractual restriction is sufficient for MVP. Consider adding age verification on register form in future iteration if compliance concerns arise.

---

## Summary Table

| Area | Status | Risk Level | Priority |
|------|--------|-----------|----------|
| ToS — Overall | ✅ Comprehensive | LOW | Document refund + sales tax additions |
| ToS — Refund Policy | ⚠️ Vague | MEDIUM | Add before beta |
| ToS — Sales Tax | ❌ Missing | MEDIUM | Add disclaimer & refer to attorney |
| ToS — Organizer Fulfillment | ⚠️ Vague | LOW | Clarify timing & defaults |
| ToS — Stripe Compliance | ⚠️ Partial | MEDIUM | Add KYC, chargeback, fee language |
| Privacy Policy — Overall | ✅ Solid | LOW | Process documentation |
| Privacy Policy — Data Deletion | ⚠️ No SOP | MEDIUM | Create support workflow |
| Privacy Policy — GDPR Notice | ⚠️ No EU basis | MEDIUM | Add legal basis + rights |
| Privacy Policy — AI Transparency | ⚠️ Minimal | LOW | Disclose model limitations |
| Stripe Integration | ✅ Functional | LOW | Operationalize chargeback process |
| Michigan Regulations | ⚠️ Unverified | HIGH | Attorney review of local ordinances |
| Sales Tax Obligations | ❌ Not addressed | MEDIUM | Attorney nexus analysis |
| Auctions & Licensing | ⚠️ Unclear | MEDIUM | Attorney verification of MCL compliance |
| Checkout Consent | ✅ Implemented | LOW | No changes needed |
| Liability Limits | ✅ Solid | LOW | No changes needed |
| Age Restriction | ✅ Contractual | LOW | No changes needed |

---

## Pre-Beta Roadmap

### MUST FIX (Before Beta)

1. **Refund & Dispute Policy** (ToS Section 5)
   - Add 48-hour reporting window, 7-day investigation, clear escalation path
   - Link to /contact for dispute submission
   - Estimate: 30 mins to add + test

2. **Sales Tax Disclaimer** (New ToS Section)
   - "Organizers are responsible for sales tax per their jurisdiction"
   - Disclose that FindA.Sale does not collect on organizer's behalf
   - Estimate: 15 mins

3. **Organizer Fulfillment Clarity** (ToS Section 4)
   - "24-hour acknowledgment, 30-day pickup window, dispute escalation"
   - Estimate: 20 mins

4. **Michigan Legal Verification** (Attorney Referral)
   - Verify Grand Rapids does not require permits
   - Confirm auction law status
   - Confirm sales tax nexus for Kent County
   - **Estimate: 2–5 days (attorney turnaround)**
   - **Cost: ~$500–1000 for brief opinion**

5. **Data Deletion SOP** (Internal Process)
   - Document support workflow for account deletion requests
   - Add to support KB at `/claude_docs/guides/support-kb.md`
   - Estimate: 45 mins

6. **Stripe KYC Language** (ToS Section 4, Organizer Terms)
   - "Organizers must complete Stripe KYC before payouts"
   - Estimate: 15 mins

### NICE TO HAVE (Before Beta, Non-Blocking)

1. **Chargeback Process Documentation**
   - Internal SOP: "When Stripe notifies of chargeback, charge organizer's account, notify organizer via email, escalate to support"
   - Add to support KB
   - Estimate: 45 mins

2. **GDPR Basis Notice** (Privacy Policy Section 6)
   - Add legal basis for EU users (contract + legitimate interest)
   - Add data protection authority links
   - Estimate: 30 mins

3. **AI Transparency Enhancement** (Privacy Policy Section 1)
   - "AI tags may be inaccurate or biased — organizers verify manually"
   - Estimate: 15 mins

4. **Third-Party Privacy Links** (Privacy Policy Section 3)
   - Link directly to Stripe and Cloudinary privacy policies
   - Estimate: 10 mins

### POST-BETA (After Launch)

1. **Sales Tax Nexus Analysis** — Multi-county expansion
2. **Age Verification Gate** — Optional frontend age check on register
3. **Breach Notification Plan** — Detail timeline and process
4. **Consignment Agreement Template** — Provide guidance to organizers on seller agreements
5. **Stripe Account Health Monitoring** — Dashboard for chargeback rates, account warnings

---

## Attorney Referral Items

### Immediate (Before Beta)

**Question 1: Michigan Estate Sale Ordinances**
- Scope: Does Grand Rapids (or Kent County more broadly) require permits, licenses, or registration for individuals to conduct public estate sales?
- Impact: If yes, ToS must require organizers to comply
- Timeline: Brief opinion, 2–3 days
- Estimated Cost: $300–500

**Question 2: Sales Tax Nexus**
- Scope: Does FindA.Sale, as a platform facilitating sales in Michigan, trigger sales tax collection obligations for the platform itself? If organizers are deemed FindA.Sale agents, does that change liability?
- Impact: May require FindA.Sale to collect and remit on behalf of organizers
- Timeline: Opinion with cash-flow analysis, 3–5 days
- Estimated Cost: $500–1000

### Within 30 Days (Post-Beta, Before Multi-County Expansion)

**Question 3: Auction Licensing**
- Scope: Does Michigan law (MCL 600.1201 et seq.) classify FindA.Sale's live bidding as an "auction" requiring a licensed auctioneer? Are "social" auctions exempt?
- Impact: May require disclaimers or organizer licensing
- Timeline: Opinion with regulatory mapping, 3–5 days
- Estimated Cost: $400–700

### Optional (Post-Beta, Scale Phase)

**Question 4: Consignment Framework**
- Scope: Should FindA.Sale provide a template consignment agreement for organizers to use with estate owners? What liability does FindA.Sale assume if an organizer resells consigned items?
- Impact: Risk mitigation and organizer confidence
- Timeline: Template + guidance, 5–7 days
- Estimated Cost: $800–1500

---

## Compliance Checklist for Patrick

Before opening beta to Grand Rapids organizers:

- [ ] **Legal**: Schedule 30-min call with Michigan business attorney to confirm estate sale and auction status
- [ ] **ToS Update**: Add refund policy, sales tax disclaimer, organizer fulfillment timing, Stripe KYC requirement
- [ ] **Privacy Policy Update**: Add GDPR basis (if serving EU), AI transparency, data deletion SOP, breach timeline
- [ ] **Support Process**: Document account deletion workflow in support KB
- [ ] **Beta Comms**: Email organizers legal summary: "FindA.Sale ToS, Privacy Policy, and all fees are disclosed at checkout. Sales are final. Disputes resolved within 7 days. You're responsible for sales tax and any local permits."

---

## Low-Risk Notes (For Future Monitoring)

1. **Reseller Status** — FindA.Sale should monitor if any organizers are licensed resellers or dealers. If so, may trigger additional sales tax or licensing obligations.
2. **High-Volume Organizers** — If any single organizer exceeds ~$20k/month in sales, Stripe may flag for additional scrutiny or tax reporting (Form 1099-K).
3. **Prohibited Items** — Current ToS prohibition on "regulated firearms, hazardous materials, counterfeit goods" is correct. Monitor for violations.
4. **Chargeback Rates** — Keep track in Stripe dashboard. If organizer chargeback rate exceeds 0.5%, Stripe may close their account.

---

## Conclusion

**Clear to Ship?** **Yes, with conditions.**

FindA.Sale's legal foundation is **solid for MVP beta**. ToS and Privacy Policy are comprehensive and follow marketplace best practices. Checkout consent is properly implemented. Stripe integration is compliant with platform fee disclosure.

**Five medium-priority items** must be addressed to close gaps:

1. Refund policy detail (ToS)
2. Sales tax disclaimer (ToS)
3. Michigan legal verification (Attorney)
4. Data deletion SOP (Process)
5. Stripe KYC language (ToS)

None of these are BLOCKERS — all are **addressable in 1–2 days of work plus 2–3 days of attorney review**. Once completed, FindA.Sale will be **legal-ready for beta**.

**Recommend**: Have Patrick schedule an attorney call this week (Week of Mar 10) for Michigan ordinance + sales tax nexus verification. Simultaneously, Claude updates ToS/Privacy Policy per this audit. Launch beta mid-March once both are done.

---

*Report prepared by: FindA.Sale Legal & Compliance Agent*
*Next review: Post-beta (April 2026) for multi-metro expansion readiness*
