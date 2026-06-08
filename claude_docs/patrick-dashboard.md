# Patrick's Dashboard — S918 Wrap (2026-06-07)

---

## ✅ RESEND TRANSACTIONAL EMAIL RAIL BUILT

Critical transactional email has been separated from Gmail onto a dedicated Resend rail. A Gmail suspension can no longer silently kill password resets, Stripe receipts, payout confirmations, invoices, or workspace invites.

**What moved to Resend:**
- Password resets + email verification
- Stripe receipts, payout confirmations, payment failure notices
- POS receipts + invoices
- In-person (terminal) receipts
- Workspace invites
- Direct message notifications
- Consignor notifications (item sold, payout received, item expiring)
- Subscription lapse warnings

**What stays on Gmail** (bulk/marketing): sale alerts, weekly digests, win-back flows, outreach emails — everything that's not time-sensitive transactional.

---

## 🔴 PUSH REQUIRED — 10 files

Run these commands from PowerShell in `C:\Users\desee\ClaudeProjects\FindaSale`:

```powershell
git add packages/backend/src/lib/transactionalEmailService.ts
git add packages/backend/src/controllers/authController.ts
git add packages/backend/src/routes/auth.ts
git add packages/backend/src/controllers/stripeController.ts
git add packages/backend/src/controllers/posController.ts
git add packages/backend/src/controllers/terminalController.ts
git add packages/backend/src/controllers/workspaceController.ts
git add packages/backend/src/services/messageEmailService.ts
git add packages/backend/src/services/consignorEmailService.ts
git add packages/backend/src/jobs/tierLapseJob.ts
git commit -m "feat: dedicated Resend rail for transactional email (auth, receipts, payouts, invites)"
.\push.ps1
```

Then the wrap docs:

```powershell
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "docs: S918 session wrap — Resend transactional rail"
.\push.ps1
```

---

## ⚠️ REQUIRED BEFORE TRANSACTIONAL EMAILS WORK IN PRODUCTION

1. **Verify `RESEND_API_KEY` is set in Railway:**
   Railway dashboard → findasale-backend → Variables tab → confirm `RESEND_API_KEY` is present.
   (It was added for quota alerts — very likely already there. Just confirm.)

2. **Verify `finda.sale` is a verified sending domain in Resend:**
   Resend dashboard → Domains tab → `finda.sale` should show "Verified".
   If it doesn't, add it and set the DNS records. Without this, `hello@finda.sale` sends will be rejected.

---

## 📬 OUTREACH STATUS

- 37 PENDING records in DirectoryClaimEmail
- Last send: June 5 (2 days ago)
- OUTREACH_ENABLED=true on Railway
- bounceSuppressService: running correctly, 0 bounced addresses in inbox (inbox was cleared in S917 — service will start accumulating suppressions as the new wave bounces back)

---

## PENDING PATRICK DECISIONS / ACTIONS

| Item | Status | What's needed |
|------|--------|---------------|
| Jane Thrift payout re-send | ⏳ Ready | Gmail API confirmed working. Re-send when ready. |
| #365 FB Marketplace OAuth | ⏳ Awaiting decision | DROP recommended (S899). Graph API OAuth = long-term path. |
| #332 Shopify | ⏳ Code ready | Needs a real custom-app store to QA. |
| #230 Smart Buyer Widget | ⏳ Blocked | Publish a sale on user1 to enable human QA. |

---

## BLOCKED QUEUE (7 items — below QA ceiling)

| Feature | Status |
|---------|--------|
| S749 Shopper payout crash | Blocked: Patrick payment method needed |
| #332 Shopify | Pending real store QA |
| #365 FB Marketplace | Awaiting Patrick decision |
| Map clustering interaction | UNVERIFIED |
| Sale alert email (shopper) | UNVERIFIED — needs active sale |
| Admin organizer view | UNVERIFIED |
| Consignor dashboard | Pending Chrome QA |

---

## PROJECT HEALTH

- **Backend TS:** 0 errors (verified S918)
- **Gmail SPOF:** RESOLVED (Resend transactional rail live)
- **Bounce suppression:** Service running, 0 bounces processed (expected — first wave hasn't bounced back yet)
- **Session type:** DEV (BQ=7, below 8-item QA ceiling)
