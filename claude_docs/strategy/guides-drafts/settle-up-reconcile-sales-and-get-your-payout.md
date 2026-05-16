---
title: "Settle up: reconcile sales, pay consignors, and get your payout"
slug: settlement-and-payouts
audience: organizer
format: W+V
priority: P1
treatment: THIN
relatedGuides:
  - run-the-pos
  - onboard-a-consignor-and-set-their-split
  - how-disputes-and-refunds-work
linkFrom:
  - /organizer/settlement
  - 'FAQ: How do I get paid?'
  - Settings → Payouts
---

# Settle up: reconcile sales, pay consignors, and get your payout

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
- [How disputes and refunds work](/guides/how-disputes-and-refunds-work)

---

## Video script

*90-second screen-capture VO. Show Settlement hub throughout.*

---

**[0:00 — Sale dashboard, End Sale button visible]**

"When your sale is done and everything's been picked up, tap End Sale. This locks the POS."

**[0:07 — Settle Up button appears]**

"A Settle Up button appears. Tap it."

**[0:10 — Settlement hub: gross revenue, payment method breakdown]**

"You'll see your gross revenue split by how it was collected — cash, Venmo and Zelle, and Stripe."

**[0:17 — Consignor rows expanding]**

"If you had consignors, each one has their own row. Items sold, revenue, their cut."

**[0:24 — Adjusting a split percentage]**

"Adjust a split here if something changed. You can't edit after you finalize, so check now."

**[0:31 — Export PDF tapped, PDF preview]**

"Tap Export PDF. This is your settlement record — every item, every payment, every consignor."

**[0:38 — Consignor email notification preview]**

"Each consignor gets an email with just their numbers. They see their items and their payout. Nobody else's."

**[0:45 — Finalize button tapped, Stripe payout initiated message]**

"Tap Finalize. Stripe starts the transfer to your bank. Two to five business days."

**[0:52 — Bank notification mockup, payout arrived]**

"You'll get an email when it lands. Platform fee is already out — what you see is what you get."

**[1:01 — Settlement hub showing all rows marked complete]**

"That's settlement. Close the sale when pickups are done, not before. Everything else takes ten minutes."
