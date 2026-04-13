# OPS

Operational behavior is governed by `claude_docs/CORE.md`.
Troubleshooting and recovery procedures are in `claude_docs/RECOVERY.md`.
Deploy checklist is in the `findasale-deploy` skill.

---

## Stripe Webhook Secret Rotation (C4)

Rotate `STRIPE_WEBHOOK_SECRET` whenever: (a) a team member with Railway access departs,
(b) a suspected credential leak occurs, or (c) as a quarterly security practice.

**Steps:**

1. **Create new webhook endpoint** in the Stripe Dashboard → Developers → Webhooks.
   - Add the same URL: `https://<railway-backend-url>/api/stripe/webhook`
   - Select all required events (payment_intent.*, charge.*, checkout.session.*, account.updated)
   - Copy the new signing secret (`whsec_...`)

2. **Deploy with dual secrets (zero-downtime window):**
   - Set a second env var `STRIPE_WEBHOOK_SECRET_NEW` in Railway with the new secret
   - Temporarily update `webhookController.ts` to try both secrets (or use Stripe's 72-hour overlap window — new and old endpoints can both be active simultaneously)
   - Deploy to Railway

3. **Verify new endpoint is receiving events** — check Stripe Dashboard → Webhooks → endpoint → recent deliveries

4. **Cut over:**
   - Update `STRIPE_WEBHOOK_SECRET` in Railway to the new value
   - Remove `STRIPE_WEBHOOK_SECRET_NEW`
   - Delete the old webhook endpoint in Stripe Dashboard
   - Redeploy

5. **Record the rotation** — add a dated entry to `claude_docs/session-log.md`

**Note:** Never store the secret in any file or commit it. Railway environment variables only.
Railway variable name: `STRIPE_WEBHOOK_SECRET`
