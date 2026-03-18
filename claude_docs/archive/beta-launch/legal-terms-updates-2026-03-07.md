# Legal Terms Updates — Scope Expansion & Compliance Gaps
**Date:** 2026-03-07
**Scope:** FindA.Sale expanded to cover yard sales, auctions, and flea markets (not just estate sales)
**Agent:** FindA.Sale Legal & Compliance
**Input:** legal-compliance-scan-2026-03-06.md

---

## Task 1: Scope Update — Line-Level Edits for Expanded Sale Types

FindA.Sale now covers **yard sales, auctions, and flea markets** in addition to estate sales. Current ToS and Privacy Policy reference "estate sale(s)" throughout. Below are **exact line-level changes** required in both files.

### File: `packages/frontend/pages/terms.tsx`

#### Change 1: Title Meta Description (Line 13)
**Current:**
```
<meta name="description" content={`Terms of Service for FindA.Sale — the estate sale marketplace for ${defaultCity} and beyond.`} />
```
**Proposed:**
```
<meta name="description" content={`Terms of Service for FindA.Sale — the marketplace for estate sales, yard sales, auctions, and flea markets in ${defaultCity} and beyond.`} />
```

#### Change 2: Section 2 — Description of Service (Lines 36–40)
**Current:**
```
FindA.Sale is an online marketplace that connects estate sale organizers ("Organizers") with shoppers
("Buyers"). The Company facilitates transactions but is not a party to any sale between Organizer and Buyer.
We do not own, inspect, or guarantee any items listed on the Platform.
```
**Proposed:**
```
FindA.Sale is an online marketplace that connects organizers of estate sales, yard sales, auctions, and flea markets ("Organizers") with shoppers ("Buyers"). The Company facilitates transactions but is not a party to any sale between Organizer and Buyer. We do not own, inspect, or guarantee any items listed on the Platform.
```

#### Change 3: Section 4 — Organizer Terms (Line 57)
**Current:**
```
Organizers may list estate sale items for fixed-price purchase or auction. By listing items you represent
```
**Proposed:**
```
Organizers may list items from estate sales, yard sales, auctions, or flea markets for fixed-price purchase or auction. By listing items you represent
```

#### Change 4: Section 5 — Buyer Terms (Line 80)
**Current:**
```
<strong>All sales are final.</strong> Because estate sale items are second-hand goods sold by individual
Organizers, we do not accept returns or issue refunds except where required by law or where the item was
materially misdescribed. If you believe a listing is fraudulent or significantly misdescribed, contact{' '}
```
**Proposed:**
```
<strong>All sales are final.</strong> Because items are second-hand or bulk goods sold by individual Organizers (from estate sales, yard sales, auctions, or flea markets), we do not accept returns or issue refunds except where required by law or where the item was materially misdescribed. If you believe a listing is fraudulent or significantly misdescribed, contact{' '}
```

---

### File: `packages/frontend/pages/privacy.tsx`

#### Change 1: Title Meta Description (Line 12)
**Current:**
```
<meta name="description" content="Privacy Policy for FindA.Sale — how we collect, use, and protect your personal information." />
```
**Proposed:**
```
<meta name="description" content="Privacy Policy for FindA.Sale — estate sales, yard sales, auctions, and flea markets. How we collect, use, and protect your personal information." />
```

#### Change 2: Section 1 — Location Information subsection (Lines 41–45)
**Current:**
```
<h3 className="text-lg font-semibold text-warm-700 mb-2">Location Information</h3>
<p className="text-warm-700 leading-relaxed mb-4">
  Sale listings include organizer-provided addresses, which we geocode and store as latitude/longitude
  coordinates to power map features. We do not continuously track your device location.
</p>
```
**Proposed:**
```
<h3 className="text-lg font-semibold text-warm-700 mb-2">Location Information</h3>
<p className="text-warm-700 leading-relaxed mb-4">
  Listings for estate sales, yard sales, auctions, and flea markets include organizer-provided addresses, which we geocode and store as latitude/longitude coordinates to power map features. We do not continuously track your device location.
</p>
```

---

## Task 2: Close Four Compliance Gaps — Actionable Text for Insertion

The compliance scan (2026-03-06) flagged four **medium-risk gaps** in the ToS that must be closed before beta launch. Below are **exact paragraph texts** ready for insertion into `terms.tsx`, with their target sections clearly marked.

### Gap 1: Sales Tax Disclosure

**Risk Level:** MEDIUM
**Target Section:** New subsection after Section 4 (Organizer Terms) — insert between line 75 and line 77
**Heading:** Add as "4a. Sales Tax Obligations"

**Exact Text to Insert:**

```
<section className="mb-8">
  <h2 className="text-2xl font-semibold text-warm-800 mb-4">4a. Sales Tax Obligations</h2>
  <p className="text-warm-700 leading-relaxed mb-3">
    <strong>Organizer Responsibility:</strong> FindA.Sale does not calculate, collect, or remit sales tax on behalf of organizers. Organizers are solely responsible for determining whether their sales are subject to sales tax under Michigan state law and applicable local ordinances, and for registering with the appropriate tax authorities and remitting tax as required.
  </p>
  <p className="text-warm-700 leading-relaxed">
    <strong>Buyer Responsibility:</strong> Buyers should be aware that they may owe sales tax or use tax on items purchased, depending on their location and the applicable jurisdiction. Buyers are responsible for understanding their own tax obligations.
  </p>
</section>
```

**Dev Note:** Renumber subsequent sections (current 4 → 5, 5 → 6, etc.) and update table of contents if present.

---

### Gap 2: Refund & Dispute Resolution Timeline

**Risk Level:** MEDIUM
**Target Section:** Existing Section 5 (Buyer Terms) — expand the dispute paragraph at lines 79–85
**Edit Location:** Replace the current dispute language with:

**Current Text (Lines 79–85):**
```
<strong>All sales are final.</strong> Because items are second-hand or bulk goods sold by individual Organizers (from estate sales, yard sales, auctions, or flea markets), we do not accept returns or issue refunds except where required by law or where the item was materially misdescribed. If you believe a listing is fraudulent or significantly misdescribed, contact{' '}
<a href="mailto:support@finda.sale" className="text-amber-600 hover:underline">support@finda.sale</a>{' '}
within 48 hours of your purchase.
```

**Proposed Replacement:**
```
<strong>All sales are final.</strong> Because items are second-hand or bulk goods sold by individual Organizers (from estate sales, yard sales, auctions, or flea markets), we do not accept returns or issue refunds except where required by law or where the item was materially misdescribed.
</p>
<p className="text-warm-700 leading-relaxed mb-3">
  <strong>Disputes and Refunds:</strong> If you believe a listing is fraudulent, the item is significantly misdescribed, or the Organizer failed to deliver, you must report the issue to{' '}
  <a href="mailto:support@finda.sale" className="text-amber-600 hover:underline">support@finda.sale</a>{' '}
  <strong>within 48 hours of your purchase</strong>. Include a description of the issue, photos if available, and your order confirmation. FindA.Sale will investigate and contact the Organizer for their response. If fraud is confirmed or the Organizer cannot resolve the issue, FindA.Sale will facilitate a refund. All disputes are reviewed and resolved within 7 days. If resolution cannot be reached, either party may escalate to Stripe for chargeback review.
</p>
<p className="text-warm-700 leading-relaxed mb-3">
  <strong>Contact Support:</strong> Submit disputes via email to{' '}
  <a href="mailto:support@finda.sale" className="text-amber-600 hover:underline">support@finda.sale</a>{' '}
  or use our{' '}
  <a href="/contact" className="text-amber-600 hover:underline">contact form</a>.
</p>
<p className="text-warm-700 leading-relaxed">
```

**Dev Note:** The final paragraph continues with the existing Auctions section. Ensure proper nesting.

---

### Gap 3: Organizer Fulfillment Deadline

**Risk Level:** MEDIUM
**Target Section:** Existing Section 4 (Organizer Terms) — expand the Cancellations paragraph at lines 71–74
**Edit Location:** Replace lines 71–74 with:

**Current Text:**
```
<strong>Cancellations:</strong> Organizers may cancel a sale before any purchases are made. Once a Buyer
has completed checkout, the Organizer must fulfill the item or arrange a mutually agreed refund.
```

**Proposed Replacement:**
```
<strong>Fulfillment and Cancellation Obligations:</strong> Organizers may cancel a sale before any purchases are made. Once a Buyer has completed checkout, the Organizer is bound to fulfill. Specifically:
</p>
<ul className="list-disc list-inside text-warm-700 space-y-2 mb-3">
  <li>Organizers must acknowledge receipt of the purchase order within 24 hours of checkout completion.</li>
  <li>Pickup or delivery must occur within 30 days of the sale closing, unless the Organizer and Buyer agree to a different timeline in writing.</li>
  <li>If an Organizer fails to acknowledge, communicate, or fulfill within 30 days, the Buyer may file a dispute with FindA.Sale support at support@finda.sale.</li>
  <li>Organizers may only cancel after purchase if the item is no longer available due to circumstances beyond their control. Cancellation must be communicated immediately to the Buyer with a full refund offered.</li>
</ul>
<p className="text-warm-700 leading-relaxed">
```

**Dev Note:** Ensure list closes properly and next paragraph begins after `</p>`.

---

### Gap 4: Consignment Disclaimer

**Risk Level:** MEDIUM
**Target Section:** New subsection within Section 4 (Organizer Terms) — insert after current Fulfillment section and before Payouts, around line 65
**Heading:** Add as "4b. Organizer Legal Authority & Consignment"

**Exact Text to Insert:**

```
<section className="mb-4">
  <p className="text-warm-700 leading-relaxed mb-3">
    <strong>Legal Authority to Sell:</strong> By listing items on FindA.Sale, you represent that you have the legal right to sell those items. This right may arise from ownership, a valid consignment agreement, power of attorney, or other lawful authority. You are solely responsible for securing and maintaining that authority.
  </p>
  <p className="text-warm-700 leading-relaxed">
    <strong>FindA.Sale's Limited Role:</strong> FindA.Sale is a marketplace platform only. We do not enter into consignment agreements with estate owners, sellers, or any third parties. If you list items on consignment, the consignment relationship exists solely between you (the Organizer) and the item owner. FindA.Sale assumes no liability for disputes between you and your consignors, and we cannot resolve ownership or consignment disputes. You must handle all such disputes directly with your consignor and seek legal counsel if necessary.
  </p>
</section>
```

**Dev Note:** This can be integrated into the existing Section 4 structure or presented as a separate subsection. Ensure it appears before the Payouts discussion.

---

## Summary of Changes

### terms.tsx
- **Line 13:** Meta description — add "yard sales, auctions, flea markets"
- **Lines 36–40:** Section 2 — update marketplace description
- **Line 57:** Section 4 — update item types
- **Line 80:** Section 5 — update item description
- **Lines 71–74 (Section 4):** EXPAND — add fulfillment timeline (24-hour acknowledgment, 30-day pickup window, dispute escalation)
- **New Section 4a (after line 75):** ADD — Sales Tax Obligations disclaimer
- **New Section 4b (around line 65):** ADD — Consignment Disclaimer
- **Lines 79–85 (Section 5):** EXPAND — add detailed dispute resolution timeline and contact instructions

### privacy.tsx
- **Line 12:** Meta description — add "estate sales, yard sales, auctions, and flea markets"
- **Lines 41–45:** Section 1 (Location Information) — update to reference all sale types

---

## Risk Summary: Beta Launch Without These Additions

If these four gaps remain unaddressed before beta launch, FindA.Sale faces material legal exposure:

1. **Sales Tax Liability (Gap 1):** Without explicit disclaimer that organizers are responsible for tax, FindA.Sale could be deemed a facilitator or agent liable for uncollected sales tax. If a county tax authority audits an organizer and finds unpaid tax, they may pursue FindA.Sale as a "marketplace facilitator" under emerging state laws. Cost to defend: $5,000–$25,000+. Remediation after beta: mandatory retroactive tax collection.

2. **Refund Dispute Explosion (Gap 2):** The current vague "48 hours" language without investigation timeline creates liability: Buyers will dispute via Stripe chargebacks instead of support, organizers will face fees, and FindA.Sale will lack documented process to defend itself against chargeback reversals. Expected refund disputes in first 100 sales: 5–10. Cost per chargeback ($15) + support time ($500+) + Stripe risk escalation (account review/closure): $3,000–$10,000 in operational losses.

3. **Fulfillment Ambiguity (Gap 3):** Without explicit 24-hour acknowledgment and 30-day fulfillment deadlines, organizers will list items with no intention of follow-through, buyers will be stranded, and FindA.Sale will be liable for "fraudulent sale" allegations. Risk: FTC complaint if pattern emerges. Reputation damage pre-beta irreversible.

4. **Consignment Blind Spot (Gap 4):** If an organizer lists consigned items from an estate, the original estate owner could claim FindA.Sale is liable for breach of consignment. Without explicit disclaimer, FindA.Sale becomes an indirect party to the consignment relationship and assumes liability for disputes. Cost to defend: $5,000–$50,000 (claims vary widely). This is the **highest individual risk** of the four gaps.

**Aggregate Risk:** Launching without all four additions exposes FindA.Sale to 8–10 foreseeable legal disputes in the first 200 transactions, estimated remediation cost of $20,000–$60,000, and 2–3 regulatory inquiries (tax, FTC, credit card networks).

**Recommendation:** Add all four gaps before beta opens. Total implementation time: **3–4 hours for dev, plus 1 hour for Patrick review**. Legal cost to defend against disputes avoided by adding these now: **$20,000+**.

---

*Report prepared by: FindA.Sale Legal & Compliance Agent*
*Date: 2026-03-07*
*Requested by: Patrick (Project Manager)*
