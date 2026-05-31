# Chargeback Response SOP — FindA.Sale

**Version:** 1.0  
**Effective:** 2026-05-31  
**Owner:** Operations / Support  
**Trigger:** Stripe email/notification for a new dispute (chargeback or inquiry)

---

## Overview

When a buyer disputes a charge with their card issuer, Stripe opens a formal dispute on the organizer's Connected Account. FindA.Sale's role is to (1) notify the organizer immediately, (2) gather evidence, (3) submit a response to Stripe before the deadline, and (4) track outcomes. Organizers bear chargeback fees per our Terms of Service.

**Key URL:** https://dashboard.stripe.com/disputes

---

## Step-by-Step Process

### Step 1 — Log the Dispute (within 24 hours of notification)

Create a row in the chargeback tracking spreadsheet:

| Date Opened | Organizer Email | Item | Amount | Dispute Reason | Stripe Dispute ID | Response Deadline | Outcome |
|---|---|---|---|---|---|---|---|

- Dispute reason codes vary: "item not received," "item not as described," "fraudulent," "unrecognized," "duplicate"
- Retrieve the response deadline from the Stripe Dashboard dispute page (typically 7–21 days — check the specific dispute, do not assume)

### Step 2 — Notify the Organizer (within 24 hours)

Email the organizer at their registered account email:

> Subject: Action Required: Buyer Dispute Filed for [Item Name]  
>  
> Hi [Organizer Name],  
>  
> A buyer has filed a dispute with their card issuer for the following transaction:  
> **Item:** [Item Name]  
> **Amount:** $[Amount]  
> **Dispute Reason:** [Reason from Stripe]  
> **Our Response Deadline:** [Date — from Stripe dispute page]  
>  
> To fight this dispute, we need the following evidence from you within 5 days:  
> 1. Photos of the item (ideally matching the listing photos)  
> 2. Screenshot of the sale listing as it appeared at the time of purchase  
> 3. Any written communications with the buyer (messages, emails)  
> 4. Proof the item was made available for pickup (e.g., pickup confirmation, date/time the sale was open)  
> 5. Any signed receipt or acknowledgment from the buyer, if available  
>  
> Please reply to this email with the evidence attached. If we do not receive evidence within 5 days, we may be unable to dispute the chargeback and your Stripe account will be debited the dispute amount plus a $15 dispute fee.  
>  
> For questions, reply to this email.  
> — The FindA.Sale Team

### Step 3 — Compile and Submit Evidence to Stripe

Before the Stripe response deadline:

1. Go to https://dashboard.stripe.com/disputes and open the dispute
2. Review the dispute reason — tailor the evidence submission to that reason:
   - **Item not received:** Focus on proof of pickup availability, organizer contact attempts
   - **Item not as described:** Focus on listing photos, item description accuracy, organizer communications
   - **Fraudulent / Unrecognized:** Focus on account creation proof, purchase confirmation email sent to buyer, IP/location match if available
3. Upload all evidence gathered from the organizer
4. Write a clear cover statement: "The buyer purchased [item] on [date] via FindA.Sale marketplace. The item was accurately described and made available for pickup at [location] from [date range]. [Attach evidence]."
5. Submit before the deadline — Stripe does not accept late submissions

### Step 4 — If Chargeback Is Upheld (FindA.Sale Loses)

- The organizer's Stripe Connect account is debited: the disputed amount is returned to the buyer plus Stripe's dispute fee (typically $15 USD)
- FindA.Sale's platform fee for that transaction is also reversed
- Notify the organizer:

> Subject: Dispute Outcome: Chargeback Upheld for [Item]  
>  
> Hi [Organizer Name],  
> We wanted to let you know that the card issuer ruled in favor of the buyer for the dispute on [Item]. Your Stripe account has been debited $[Amount] plus the $15 dispute fee. If you believe this outcome is incorrect, you may contact Stripe directly to request a review. — The FindA.Sale Team

### Step 5 — If Chargeback Is Won (FindA.Sale Wins)

- Stripe returns the disputed funds to the organizer's account
- Update the tracking spreadsheet with outcome "WON"
- No further action needed

### Step 6 — Monitor Organizer Chargeback Rate

After each dispute resolution, calculate the organizer's rolling chargeback rate:

```
chargeback rate = (disputes opened in last 90 days) / (total transactions in last 90 days)
```

If rate exceeds **0.5%**, flag the account for review per Terms of Service Section 14b. Review options:
- Issue a warning email to the organizer
- Require enhanced listing verification
- Suspend payout eligibility pending review
- Suspend the account if rate persists above 1%

---

## Evidence Quality Notes

- Stripe gives significant weight to written buyer communications — always ask organizers for any messages
- Listing screenshots should show the item description, condition, and price as the buyer saw it
- For "item not as described" disputes, timestamped photos taken before the sale are the strongest evidence
- Stripe's dispute review is not a FindA.Sale decision — submitting evidence does not guarantee a win

---

## Escalation

If the dispute involves fraud by the organizer (not the buyer), or if the disputed amount exceeds $500, escalate to the account review process before responding to Stripe. Do not submit evidence on behalf of a fraudulent organizer.
