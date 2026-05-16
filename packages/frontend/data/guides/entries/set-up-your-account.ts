import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'set-up-your-account',
  title: "Set up your organizer account",
  audience: 'organizer',
  format: 'written+video',
  priority: 1,
  relatedGuides: ['connect-stripe', 'create-your-first-sale', 'choose-a-plan'],
  videoUrl: undefined,
  body: `Getting started takes about ten minutes. Here's the order that works.

1. **Register.** Create your account at /register — you'll need an email address and a password.
2. **Confirm your email.** Check your inbox for a confirmation link and click it. Check spam if it doesn't arrive in a minute or two.
3. **Complete your profile.** Add your business name, phone number, and a profile photo so shoppers know who they're buying from.
4. **Connect Stripe.** This is how FindA.Sale sends you your earnings. You can't process card payments until this is done. See [Connect Stripe and receive your first payout](/guides/connect-stripe).
5. **Create your first sale.** Name it, set your dates, and publish. See [Create your first sale](/guides/create-your-first-sale).

That's the full sequence. The complete walkthrough — with screenshots for every step — lives at [Getting Started](/guide#getting-started).

---

## Common questions

**Do I need to connect Stripe before I create a sale?**
No, but shoppers won't be able to pay by card until you do. You can create a sale first and connect Stripe before you publish.

**What if I don't get the confirmation email?**
Check your spam folder. If it's not there after five minutes, go back to /register and request a new one.

**Can I sign up with Google instead of email?**
Yes. The registration page has a "Continue with Google" option that skips the email confirmation step.

---

## Video script

*(60-second VO — screen recording of registration through first sale creation)*

"Welcome to FindA.Sale. Getting your account set up takes about ten minutes — here's exactly what to do.

First, head to finda.sale and click Sign Up. Enter your email and pick a password. You'll get a confirmation email right away — click the link inside.

Next, fill in your profile. Add your business name and a phone number. Shoppers see this on your sale pages, so use the name you go by.

Then connect Stripe. Go to Settings, then Payouts, and click Connect with Stripe. Stripe is how we send you your money — it takes about five minutes to set up. We've got a full guide on that if you need it.

Once Stripe is connected, you're ready to create your first sale. Hit New Sale, give it a name and some dates, and you're off.

The full step-by-step walkthrough with screenshots is at finda.sale/guide. See you there."

---

## Related guides

- [Connect Stripe and receive your first payout](/guides/connect-stripe)
- [Choosing a plan: Simple, Pro, or Teams](/guides/choose-a-plan)
- [Add staff and set their permissions](/guides/add-staff)`,
};

export default entry;
