import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'connect-stripe',
  title: "Connect Stripe and receive your first payout",
  audience: 'organizer',
  format: 'written+video',
  priority: 1,
  relatedGuides: ['set-up-your-account', 'choose-a-plan', 'create-your-first-sale'],
  videoUrl: undefined,
  body: `Stripe is how FindA.Sale sends you your earnings. You set it up once in Settings and then it handles every payout automatically. The whole process takes about five to ten minutes.

---

## Why Stripe is required

FindA.Sale uses Stripe Connect to move money from shoppers to you. Without a connected Stripe account, shoppers can still place holds and pay cash in person — but you can't process card payments or receive online payouts. Most organizers connect Stripe before their first sale goes live.

---

## How to connect

1. Go to **Settings → Payouts**.
2. Click **Connect with Stripe**.
3. Stripe opens its own onboarding flow. Enter your name, date of birth, and either a bank account (routing and account numbers) or a debit card.
4. You'll also provide the last four digits of your Social Security number. This is standard identity verification — the same thing any business bank account requires.
5. Review and submit. Stripe confirms most accounts immediately.

That's it. Once Stripe confirms your account, the Payouts page in Settings shows a green "Connected" status.

---

## What Stripe needs and why

Stripe is a licensed payment processor. They're required by law to verify the identity of anyone who receives payouts. The information they ask for — name, DOB, last four of SSN — is the minimum required by financial regulations. FindA.Sale does not store or see this information. It goes directly to Stripe.

---

## How long it takes

Most accounts are approved immediately after you submit. Some accounts go through a manual review by Stripe, which can take one to two business days. If your account is under review, Stripe will email you directly. In the meantime, you can still build and publish your sale — you just won't be able to process card payments until the review clears.

---

## When payouts arrive

After a sale closes, you initiate a settlement from your dashboard. Funds arrive in your bank account two to five business days later. If you connected a debit card instead of a bank account, you can choose instant payout — funds arrive within minutes for a small fee (typically 1.5%, minimum $0.50). The fee is charged by Stripe, not FindA.Sale.

---

## What if you skip Stripe

You can run a sale without Stripe. Shoppers can place holds and pay cash at pickup. You won't be able to accept card payments online or at the point of sale, and you won't be able to use the POS card-tap feature on sale day. Most organizers find connecting Stripe is worth the five minutes.

---

## Common questions

**Is it safe to give Stripe my SSN?**
Yes. Stripe is one of the largest payment processors in the world and holds a banking license. They are required to verify identity for anyone receiving payouts — it's the same requirement your bank has. FindA.Sale never sees your SSN.

**Can I use a business bank account instead of a personal one?**
Yes. Stripe accepts both personal and business bank accounts. If you use a business account, you'll enter your EIN instead of your SSN.

**What if my Stripe account gets flagged for review?**
Stripe will email you with what they need. Common reasons include a mismatch between your name and your bank account, or a high-volume payout that triggers a routine review. Follow the steps in Stripe's email. If you're stuck, contact FindA.Sale support and we can help you troubleshoot.

**Can I change my bank account after I've connected?**
Yes. Log into your Stripe Express dashboard (the link is in Settings → Payouts) and update your payout method there.

**What's the platform fee?**
FindA.Sale charges 10% on all sales, regardless of your plan. This is deducted before your payout is calculated. So if your sale earns $1,000, your payout is $900 before Stripe's processing fees.

---

## Video script

*(90-second VO — screen recording of Settings → Payouts through confirmed connection)*

"Let's get Stripe connected so you can start receiving payouts.

Head to Settings, then Payouts, and click Connect with Stripe. This opens Stripe's own setup page — it's separate from FindA.Sale.

Stripe will ask for your name, date of birth, and a bank account or debit card. You'll also enter the last four digits of your Social Security number. That's standard identity verification — the same thing a bank account requires. FindA.Sale never sees this information.

Most accounts are approved immediately. If Stripe needs to review yours, they'll email you — it usually takes a day or two.

Once you're approved, come back to Settings → Payouts. You'll see a green Connected status. You're ready to accept card payments.

When your sale closes, go to your dashboard and initiate a settlement. Funds hit your bank account in two to five business days. If you want them faster, instant payout is available with a debit card for a small fee.

That's it. One setup, and every future payout is automatic."

---

## Related guides

- [Set up your organizer account](/guides/set-up-your-account)
- [Choosing a plan: Simple, Pro, or Teams](/guides/choose-a-plan)
- [Create your first sale](/guides/create-your-first-sale)`,
};

export default entry;
