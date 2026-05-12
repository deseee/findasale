# Payment Testing — Content Package

Three formats for three placement contexts.

---

## FORMAT 1: Organizer Guide
### Section: "Before You Go Live — Test Your Payments"

You've added your items, set your prices, and printed your signs. Before you open the doors, take 10 minutes to confirm every payment path is working. Nothing derails a sale morning faster than a payment issue at the table.

---

#### Step 1: Confirm Your Stripe Account Is Ready

Go to your **Earnings** page. If you see a yellow banner asking you to complete Stripe setup, do that first — no payments will go through until onboarding is finished.

Signs you're ready:
- No setup banners on your dashboard
- Your Earnings page shows a connected payout method

---

#### Step 2: Run the POS Test Transaction

This is the most important check. Open the **POS** page, select your sale, and tap **"Run $1.00 Test Transaction"** in the Pre-Sale Test card at the top of the page.

This sends a $1 charge through Stripe's test environment — no real money moves. When it succeeds, the **"POS open and test transaction done"** item on your progress checklist will automatically mark itself complete.

If the test fails, double-check your Stripe account is fully onboarded (step 1) and try again. Still failing? Contact support before your sale day.

---

#### Step 3: Test Online Checkout (if you're using self-checkout QR codes)

If shoppers will be scanning QR codes to buy items on their phones, test that flow end-to-end now — before you print your QR materials.

1. Open your sale's public page
2. Tap through to checkout on any priced item
3. Use test card number **4242 4242 4242 4242**, any future expiry date, any CVC
4. Complete the checkout and confirm the purchase appears in your Earnings view

---

#### Step 4: Walk Through the POS Flow Once

Open the POS page and run through it like you're at the sale:

- Search for an item by title and add it to the cart
- Confirm the price looks right
- Verify the charge screen appears correctly

You don't need to complete a real charge. You're just making sure items load, prices are accurate, and nothing feels broken.

---

#### Step 5: If You're Running an Auction

Before your auction opens, test that winning bidder checkout works:

1. Confirm a test bid as a winner from your auction admin panel
2. Have someone complete checkout using test card **4242 4242 4242 4242**
3. Confirm the purchase appears in Earnings

---

#### Your Pre-Sale Payment Checklist

Run through this the day before:

- [ ] Stripe account fully connected (no yellow banners)
- [ ] POS test transaction completed — checklist task auto-checked ✓
- [ ] At least one item is priced and published
- [ ] QR codes printed and tested (if using self-checkout)
- [ ] Sale start time is correct (double-check timezone)
- [ ] Sale is published and visible on the discovery feed

---

#### Test Card Numbers

If you need to test checkout flows manually, use these Stripe test cards:

| Card Number | Result |
|---|---|
| 4242 4242 4242 4242 | Payment succeeds |
| 4000 0000 0000 0002 | Payment declined |
| 4000 0025 0000 3155 | Requires authentication step |

Use any future expiry (e.g. 12/30) and any 3-digit CVC. Test cards only work in pre-live checkout flows.

---
---

## FORMAT 2: POS Page — Contextual Help
### Tooltip / "What does this test?" expandable text

**Short version (tooltip on the ⓘ icon):**
> Sends a $1 charge through Stripe's test environment — no real money moves. Confirms your Stripe account is connected and routing correctly. Also auto-checks the "POS ready" item on your sale checklist.

**Expanded version (collapsible "What does this test?" link):**

> **What the test checks:**
> - Your Stripe account is fully connected and can accept payments
> - The platform fee calculation is working correctly
> - Your sale is set up and ready to receive purchases
>
> **What happens:**
> A $1 test charge runs through Stripe's test environment. No real money moves. The transaction is recorded in your sale, and the "POS open and test transaction done" item on your progress checklist is automatically marked complete.
>
> **If it fails:**
> Check that your Stripe account is fully onboarded (no setup banners on your Earnings page), then try again. If it keeps failing, contact support before your sale opens.
>
> **Test card numbers for checkout testing:**
> Success: `4242 4242 4242 4242` · Decline: `4000 0000 0000 0002`
> Any future expiry date · Any 3-digit CVC

---
---

## FORMAT 3: FAQ Entries

---

### FAQ Entry 1

**Q: How do I test my payment setup before my sale starts?**

The fastest way is the POS Test Transaction. Open the POS page, select your sale, and tap "Run $1.00 Test Transaction" in the Pre-Sale Test card. It sends a $1 charge through Stripe's test environment (no real money moves), and automatically checks off the POS task on your sale's progress checklist when it succeeds.

For a full pre-sale check — including online checkout, auction flows, and a day-before checklist — see the [Before You Go Live guide in the Organizer Guide](#).

**Common reasons the test fails:**
- Stripe account not fully onboarded — look for a setup banner on your Earnings page
- Sale not yet published or no items added
- Stripe account in a region that requires additional verification

Still stuck? Contact support with your sale name and we'll help you get sorted before opening day.

---

### FAQ Entry 2

**Q: What Stripe test card numbers should I use?**

Use these when testing checkout flows on FindA.Sale:

| Card Number | What it does |
|---|---|
| 4242 4242 4242 4242 | Payment succeeds |
| 4000 0000 0000 0002 | Payment is declined |
| 4000 0025 0000 3155 | Triggers an authentication step (3D Secure) |

For any test card, use any future expiry date (e.g. 12/30) and any 3-digit CVC.

Test cards only work in test/pre-live checkout flows. If a checkout is asking for a real card, your sale may already be in live mode — contact support if you're unsure.

---
