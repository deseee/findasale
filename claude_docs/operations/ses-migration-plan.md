# AWS SES Migration Plan
**Created:** S[current] — May 2026  
**Status:** Ready for dev session  
**Estimated dev time:** 1 session (~2–3 hours)

---

## Why

Resend free tier: 100 emails/day. AWS SES: $0.10/1,000 emails (~$5 for 50k).  
Triggered by saleEndingSoonJob hitting 200% quota (200 emails, May 15 2026).  
All 37 backend email files currently use Resend SDK directly.

---

## Current State

- **DNS:** `send.finda.sale` subdomain already has SES SPF + MX records (added previously, Vercel DNS)
- **Sending domain to use:** `send.finda.sale` (already verified, don't touch root domain SPF)
- **From address:** Change from `noreply@finda.sale` → `noreply@send.finda.sale`
- **Resend DKIM** (`resend._domainkey`) will become unused after migration — leave it, don't delete

---

## Patrick: AWS Console Steps (do before dev session)

### 1. Log into AWS SES
- Go to [console.aws.amazon.com](https://console.aws.amazon.com) → search "Simple Email Service"
- Make sure region is **us-east-1** (N. Virginia)

### 2. Verify send.finda.sale identity
- SES → Identities → look for `send.finda.sale`
- If present and "Verified" → skip to step 3
- If missing or "Pending" → Create identity → Domain → `send.finda.sale` → DNS records should already match (Vercel has them) → click verify

### 3. Request production access (IMPORTANT — do this today)
- SES → Account dashboard → if it says "Sandbox" → click "Request production access"
- Fill in the form:
  - **Mail type:** Transactional
  - **Website URL:** https://finda.sale
  - **Use case:** Transactional notifications for a marketplace platform (sale alerts, receipts, account emails)
  - **Expected volume:** Under 5,000/month currently, growing
- Approval takes 24–48 hours — request now so it's cleared before the dev session

### 4. Create SMTP credentials
- SES → Account → SMTP settings → "Create SMTP credentials"
- Name them something like `findasale-backend`
- **Download the CSV immediately** — you only see the secret once
- You'll get:
  - `SMTP_HOST` = `email-smtp.us-east-1.amazonaws.com`
  - `SMTP_PORT` = `587`
  - `SMTP_USERNAME` = (from CSV)
  - `SMTP_PASSWORD` = (from CSV)

### 5. Add env vars to Railway
- Railway → findasale backend service → Variables → add:
  ```
  SMTP_HOST=email-smtp.us-east-1.amazonaws.com
  SMTP_PORT=587
  SMTP_USERNAME=[from CSV]
  SMTP_PASSWORD=[from CSV]
  SES_FROM_EMAIL=noreply@send.finda.sale
  ```
- Leave `RESEND_API_KEY` in place until migration is complete and verified

---

## Dev Session: Code Migration Plan

### Strategy: Central abstraction layer (touch 37 files minimally)

Instead of rewriting every file, create one `emailService.ts` wrapper that all files import. Files change one line each — the import. The send call signature stays identical.

### Step 1 — Install nodemailer
```bash
cd packages/backend
pnpm add nodemailer @types/nodemailer
```

### Step 2 — Create `packages/backend/src/lib/emailService.ts`

This replaces the Resend client everywhere. It exposes the same `.emails.send()` interface so call sites don't change.

```typescript
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'email-smtp.us-east-1.amazonaws.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, // TLS via STARTTLS
  auth: {
    user: process.env.SMTP_USERNAME,
    pass: process.env.SMTP_PASSWORD,
  },
});

export const emailService = {
  emails: {
    send: async (options: {
      from: string;
      to: string | string[];
      subject: string;
      html: string;
      replyTo?: string;
    }) => {
      return transporter.sendMail({
        from: options.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        replyTo: options.replyTo,
      });
    },
  },
};
```

### Step 3 — Update env var references across all 37 files

**Pattern to find:**
```
RESEND_API_KEY → remove (or leave as dead var)
RESEND_FROM_EMAIL → replace with SES_FROM_EMAIL
new Resend(process.env.RESEND_API_KEY) → import { emailService } from '../lib/emailService'
getResendClient() → emailService (direct, no lazy init needed)
resend.emails.send({ → emailService.emails.send({
```

**Files to update (37 total):**

Services:
- `services/presaleSneakPeekEmailService.ts`
- `services/saleLiveEmailService.ts`
- `services/onboardingEmailService.ts`
- `services/wishlistMatchEmailService.ts`
- `services/weeklyEmailService.ts`
- `services/emailReminderService.ts`
- `services/followerNotificationService.ts`
- `services/collectorPassportService.ts`
- `services/buyerMatchService.ts`
- `services/saleAlertEmailService.ts`
- `services/consignorEmailService.ts`
- `services/smartFollowService.ts`
- `services/priceDropService.ts`
- `services/messageEmailService.ts`
- `services/wishlistAlertService.ts`
- `services/organizerAnalyticsService.ts`
- `services/suppressionService.ts`

Controllers:
- `controllers/reservationController.ts`
- `controllers/authController.ts`
- `controllers/stripeController.ts`
- `controllers/buyingPoolController.ts`
- `controllers/adminBroadcastController.ts`
- `controllers/waitlistController.ts`
- `controllers/workspaceController.ts`
- `controllers/couponController.ts`
- `controllers/terminalController.ts`
- `controllers/posController.ts`
- `controllers/saleWaitlistController.ts`
- `controllers/notificationController.ts`

Jobs:
- `jobs/saleEndingSoonJob.ts`
- `jobs/curatorEmailJob.ts`
- `jobs/tierLapseJob.ts`
- `jobs/abandonedCheckoutJob.ts`
- `jobs/auctionJob.ts`

Routes:
- `routes/organizers.ts`
- `routes/auth.ts`
- `routes/contact.ts`

Lib:
- `lib/notificationService.ts`

### Step 4 — Update from addresses

Files currently use `process.env.RESEND_FROM_EMAIL`. Replace with `process.env.SES_FROM_EMAIL`.  
The new value is `noreply@send.finda.sale`.

Check these also have correct from addresses:
- `saleLiveEmailService.ts` uses `hello@finda.sale` as fallback — update to `hello@send.finda.sale`
- Any file with a hardcoded `@finda.sale` from address needs `@send.finda.sale`

### Step 5 — TypeScript check
```bash
cd packages/backend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
```

### Step 6 — Smoke test before removing Resend
- Send a test email via one of the simpler controllers
- Confirm it arrives in inbox (not spam)
- Check SES sending statistics in AWS console

### Step 7 — Clean up
- Remove `resend` from `package.json` dependencies
- Remove `RESEND_API_KEY` and `RESEND_FROM_EMAIL` from Railway env vars
- Leave `resend._domainkey` DNS record in place (no harm, no need to clean up)

---

## Also fix in the same session: saleEndingSoonJob suppression check

While dev is in `saleEndingSoonJob.ts`, add the missing suppression check:

```typescript
// Before sending each email:
const { suppressionService } = await import('../services/suppressionService');
const isSuppressed = await suppressionService.isSuppressed(subscriber.email);
if (isSuppressed) continue;
```

This prevents sending ending-soon emails to bounced/unsubscribed addresses regardless of provider.

---

## Rollback

If SES emails are going to spam or failing:
1. Re-add `RESEND_API_KEY` to Railway
2. Revert `emailService.ts` to use Resend SDK
3. The nodemailer dep can stay — it's harmless

---

## Cost Reference

| Volume | SES Cost |
|--------|----------|
| 5,000/mo | $0.50 |
| 20,000/mo | $2.00 |
| 50,000/mo | $5.00 |
| 100,000/mo | $10.00 |

First 62,000 emails/month are free if sending from an EC2 instance — Railway doesn't qualify, so the $0.10/1k rate applies. Still effectively free at current scale.
