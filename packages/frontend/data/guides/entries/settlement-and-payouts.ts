import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'settlement-and-payouts',
  title: 'Settlement And Payouts',
  audience: 'both',
  format: 'written',
  priority: 2,
  relatedGuides: [],
  videoUrl: undefined,
  body: `# Settle up: reconcile sales, pay consignors, and get your payout

Settlement is the five-step process that happens after your sale closes.
You review what sold, confirm what each consignor is owed, export the report, and your payout goes to your bank.
The whole thing usually takes under ten minutes.

For a deeper look at how payouts work — timing, bank connection, and failure states — see [Connect Stripe and receive your first payout](/guides/connect-stripe-and-receive-your-first-payout).

---

## The full settlement sequence

### Step 1: Close the sale

Go to your sale and tap **End Sale**.
This locks the POS and stops new transactions.
Don't close the sale while shoppers are still picking up — items need to be in the sold state before you finalize.

### Step 2: Open the Settlement hub

A **Settle Up** button appears at the top of your sale dashboard.
Tap it.
You'll see gross revenue broken down by payment method (cash, Venmo/Zelle, Stripe), a total item count, and — if you have consignors — each consignor's section.

### Step 3: Review consignor splits

Each consignor row shows the items they brought, total revenue from those items, their split percentage, and what they're owed.
Adjust the split or flag an item for dispute now — you can't edit after you finalize.

**Common mistake:** closing the sale before all pickups happen.
If a consignor comes to collect unsold items after you've settled, those items are already archived.
Wait until everyone has cleared out.

### Step 4: Export the settlement report

Tap **Export PDF**.
The report lists every sold item, buyer (if paid through the app), consignor allocation, platform fee, and net amounts.
Send the consignor their section as your record of payment.

What consignors receive: an email with their item list, total sold, split percentage, and payout amount.
They don't see other consignors' numbers.

### Step 5: Your Stripe payout

Once you finalize settlement, Stripe initiates a transfer to your connected bank account.
Standard timing is 2–5 business days.
You'll get an email when it lands.

The platform fee is deducted before your payout is calculated — it's not a separate charge.

---

## If a consignor disputes their split

Edit the split in the Settlement hub before you tap Finalize.
Once finalized, splits are locked.
If a dispute comes up after the fact, you'll need to sort it out manually (pay the difference by check, Venmo, etc.) and note it in your records.

---

## Common questions

**What if I have cash sales that weren't logged through the POS?**
Add them manually in the Settlement hub before you export. There's an "Add cash transaction" option. This keeps your PDF accurate.

**Do I need Stripe to settle?**
You need Stripe to receive your platform payout to a bank account. If you collected only cash or Venmo/Zelle and want to skip the payout step, you can export the PDF and mark settlement complete without initiating a Stripe transfer.

**Can I settle a partial sale — items from one day of a multi-day sale?**
No. Settlement covers the entire sale when it closes. Run separate sales in the app if you need separate settlement periods.

**What happens to unsold consignor items?**
They're not included in settlement. They remain in your inventory, marked "Unsold." Return them to the consignor or carry them into your next sale.

**How do I know the PDF went to the consignor?**
The Settlement hub marks each consignor's row as "Email sent" with a timestamp after you finalize. If it shows "Not sent," tap the resend button next to their name.

---

## Related guides

- [Run the POS: take payments in person](/guides/run-the-pos)
- [Onboard a consignor and set their split](/guides/onboard-a-consignor-and-set-their-split)
- [How disputes and refunds work](/guides/how-disputes-and-refunds-work)`,
};

export default entry;
