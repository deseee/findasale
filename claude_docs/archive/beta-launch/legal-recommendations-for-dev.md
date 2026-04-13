# Legal Compliance — Development Tasks for Beta

*Quick reference for code/content changes needed before beta launch.*

---

## 1. Terms of Service — Additions to `/packages/frontend/pages/terms.tsx`

### Add to Section 5 (Buyer Terms) — After "Auctions" subsection

```
<h3 className="text-lg font-semibold text-warm-700 mb-2">Disputes & Refunds</h3>
<p className="text-warm-700 leading-relaxed mb-3">
  If you believe a purchase is fraudulent or the item was materially misdescribed,
  contact <a href="mailto:support@finda.sale" className="text-amber-600 hover:underline">support@finda.sale</a>
  within 48 hours of purchase with photos or description of the issue. We will investigate
  with the Organizer within 7 days. If fraud is confirmed, FindA.Sale will facilitate a refund
  via the original payment method or Stripe dispute process.
</p>
```

### Add to Section 4 (Organizer Terms) — After "Cancellations" subsection

```
<h3 className="text-lg font-semibold text-warm-700 mb-2">Fulfillment Obligations</h3>
<p className="text-warm-700 leading-relaxed mb-3">
  Once a Buyer has completed checkout and payment is confirmed:
</p>
<ul className="list-disc list-inside text-warm-700 space-y-2 mb-3">
  <li>You must acknowledge the purchase within 24 hours via email or platform message</li>
  <li>You must allow the Buyer to arrange pickup within 30 days of the sale close date</li>
  <li>If you cannot fulfill the item, you must communicate with the Buyer immediately to
      arrange a mutual refund or alternative</li>
  <li>Failure to communicate or fulfill may result in account suspension</li>
</ul>
```

### Add to Section 4 (Organizer Terms) — After "Payouts" subsection

```
<h3 className="text-lg font-semibold text-warm-700 mb-2">Stripe Connect Onboarding</h3>
<p className="text-warm-700 leading-relaxed">
  Before any payouts are released to your bank account, you must complete Stripe Connect
  onboarding, including identity verification and bank account linking. Stripe may withhold
  or delay payouts if your onboarding is incomplete or flagged for review. You are responsible
  for maintaining your Stripe account in good standing. If Stripe closes your account or
  suspends payouts, we cannot override their decision.
</p>
```

### Add new Section (after 6 — Platform Fees)

```
<section className="mb-8">
  <h2 className="text-2xl font-semibold text-warm-800 mb-4">6a. Sales Tax Responsibility</h2>
  <p className="text-warm-700 leading-relaxed mb-3">
    FindA.Sale does not calculate, collect, or remit sales tax on behalf of Organizers or Buyers.
    Sales tax obligations vary by state and locality.
  </p>
  <ul className="list-disc list-inside text-warm-700 space-y-2">
    <li><strong>For Organizers:</strong> You are responsible for registering for and remitting
        sales tax as required by your state and local jurisdiction. Consult a tax professional
        or your state's Department of Revenue for guidance.</li>
    <li><strong>For Buyers:</strong> You may owe use tax on items purchased, depending on your
        state and local laws. FindA.Sale does not calculate this for you.</li>
  </ul>
</section>
```

---

## 2. Privacy Policy — Additions to `/packages/frontend/pages/privacy.tsx`

### Add to Section 1 (Information We Collect) — After "Cookies and Local Storage"

```
<h3 className="text-lg font-semibold text-warm-700 mb-2">AI-Generated Content</h3>
<p className="text-warm-700 leading-relaxed">
  Item photos may be processed by AI services (Google Cloud Vision and Anthropic Claude)
  to generate suggested item tags and descriptions. These AI-generated suggestions are
  based on visual analysis and may be inaccurate, incomplete, or biased. Organizers
  review all suggestions before they are saved to the listing. No personally identifiable
  information is included in these AI requests.
</p>
```

### Add to Section 6 (Your Rights and Choices) — New subsection

```
<li>
  <strong>Account deletion request process:</strong> To request deletion of your account
  and associated personal data, email <a href="mailto:support@finda.sale" className="text-amber-600 hover:underline">support@finda.sale</a>
  with the subject "Account Deletion Request." We will delete your personal data
  (name, email, address, etc.) within 30 days. Transaction records required by law
  (e.g., purchase history for 7 years) will be retained and pseudonymized.
</li>
```

### Add new subsection to Section 6 (Your Rights and Choices) — After "Michigan residents"

```
<li>
  <strong>EU/Canadian residents:</strong> If you reside in the European Union or Canada,
  you may have additional rights under GDPR or similar privacy laws. Our legal basis
  for processing your data includes: (a) performance of our contract with you (payment,
  order fulfillment), (b) legitimate interest in fraud prevention and platform security,
  and (c) legal compliance. You have the right to request access, correction, or deletion
  of your personal data, and to lodge a complaint with your data protection authority
  (e.g., <a href="https://edpb.ec.europa.eu/" target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:underline">EU Data Protection Board</a> for EU residents).
</li>
```

### Add to Section 3 (How We Share Your Information) — Add links for third-party policies

Replace generic text with:
```
<li>
  <strong>Stripe:</strong> Payment information is shared with <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:underline">Stripe</a>
  to process transactions. Stripe may collect additional information during Stripe Connect
  onboarding per their own Privacy Policy.
</li>
<li>
  <strong>Cloudinary:</strong> Item photos are stored and served via <a href="https://cloudinary.com/privacy" target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:underline">Cloudinary</a>'s CDN.
</li>
```

---

## 3. Support KB — Data Deletion Process

**File**: `/claude_docs/guides/support-kb.md`

**Add new section:**

```
## Account Deletion Requests

### When a user emails support@finda.sale requesting "Account Deletion"

1. **Acknowledge** the request within 24 hours. Example:
   "Hi [Name],
   We've received your account deletion request. We will delete your personal data
   (name, email, address) within 30 days. Your transaction history will be retained
   for 7 years per financial regulations, but will be pseudonymized (we'll remove
   your name and contact info).

   We'll send a confirmation email once deletion is complete."

2. **Process in Database** (for Patrick/Claude):
   - Mark user as `deleted: true` in the `User` table
   - Unsubscribe user from all email lists (Resend audience)
   - Do NOT delete from `Purchase`, `Sale`, or `Message` tables yet
   - Schedule a 30-day task to pseudonymize personal fields

3. **After 30 days**:
   - Update user name to "[Deleted User]"
   - Clear user email to "deleted_[userid]@finda.sale"
   - Remove phone number and address fields
   - Send final confirmation email to original email (if bounces, log and move on)

### Special Cases

- **Organizer with active sales**: Cannot delete immediately. Contact organizer:
  "You have active or pending sales. You can transfer to a co-organizer or wait until all sales close before requesting deletion."
- **Pending refund**: Wait for refund to complete, then process deletion.
```

---

## 4. Stripe KYC Verification (Backend)

**File**: `/packages/backend/src/controllers/stripeController.ts`

**Current Code (around line 70–75):**
```typescript
if (organizer.stripeConnectId) {
  try {
    // First, try to create a login link (works only if account is fully onboarded)
    const loginLink = await stripe().accounts.createLoginLink(organizer.stripeConnectId);
    return res.json({ url: loginLink.url });
```

**Recommended Enhancement** (check Stripe account status):

```typescript
if (organizer.stripeConnectId) {
  try {
    const account = await stripe().accounts.retrieve(organizer.stripeConnectId);

    // Check if onboarding is complete
    if (!account.charges_enabled) {
      // Onboarding incomplete — return account link
      const accountLink = await stripe().accountLinks.create({
        account: organizer.stripeConnectId,
        refresh_url: `${process.env.FRONTEND_URL}/organizer/dashboard`,
        return_url: `${process.env.FRONTEND_URL}/organizer/dashboard`,
        type: 'account_onboarding',
      });
      return res.json({
        url: accountLink.url,
        message: 'Please complete Stripe onboarding before payouts can be enabled.'
      });
    }

    // Onboarding is complete — return login link
    const loginLink = await stripe().accounts.createLoginLink(organizer.stripeConnectId);
    return res.json({ url: loginLink.url });
```

---

## 5. Chargeback Notification (Email & Webhook)

**File**: `/packages/backend/src/routes/stripe.ts` or webhook handler

**Add to Stripe webhook listener:**

```typescript
// In the webhook handler, add case for 'charge.dispute.created'
if (event.type === 'charge.dispute.created') {
  const dispute = event.data.object;

  // Find organizer by Stripe account
  const purchase = await prisma.purchase.findFirst({
    where: { stripePaymentIntentId: dispute.payment_intent },
    include: { item: { include: { sale: { include: { organizer: { include: { user: true } } } } } } }
  });

  if (purchase && purchase.item?.sale?.organizer?.user?.email) {
    // Send email to organizer
    await sendEmail({
      to: purchase.item.sale.organizer.user.email,
      subject: `Payment Dispute/Chargeback — ${purchase.item.title}`,
      body: `A buyer has disputed the charge for ${purchase.item.title}.
             This dispute will result in a ~$15 chargeback fee charged to your Stripe account.
             Please log into your Stripe dashboard to respond to this dispute.
             Chargeback deadline: ${dispute.evidence_details.due_by}`
    });
  }
}
```

---

## 6. Michigan Legal Verification (TODO for Patrick)

**Before launching beta, obtain:**

1. **Brief from Attorney**: "Do I need a permit to run an estate sale in Grand Rapids, Michigan?"
   - Contact: Kent County Clerk or Grand Rapids Building Dept
   - Or hire MI business attorney to do this check (~$300–500)
   - Add result to `/claude_docs/legal/michigan-estate-sale-status.md`

2. **Sales Tax Nexus Analysis**: "Does FindA.Sale owe sales tax collection/remittance on Michigan sales?"
   - Get written opinion from MI CPA or business attorney
   - Share with accountant for tax filing guidance
   - Add result to `/claude_docs/legal/michigan-sales-tax-analysis.md`

---

## Implementation Checklist

**For Claude (Code Changes):**
- [ ] Update `terms.tsx` with 5 new sections (disputes, fulfillment, KYC, sales tax)
- [ ] Update `privacy.tsx` with 4 new sections (AI transparency, deletion process, EU rights, third-party links)
- [ ] Add data deletion SOP to `support-kb.md`
- [ ] Enhance Stripe KYC check in `stripeController.ts`
- [ ] Add chargeback notification webhook handler

**For Patrick (Legal/Admin):**
- [ ] Schedule call with MI attorney (Week of Mar 10)
- [ ] Obtain written opinion on estate sale permits
- [ ] Obtain written opinion on sales tax nexus
- [ ] Store opinions in `/claude_docs/legal/` folder
- [ ] Confirm with Patrick: implement all code changes above?
- [ ] Merge and deploy to production
- [ ] Email beta users: "Legal compliance review complete. Your rights and responsibilities are outlined in updated ToS and Privacy Policy."

---

**Timeline**: 1–2 days for code, 2–3 days for attorney review, then ready for beta.

