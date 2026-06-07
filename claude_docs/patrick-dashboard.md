# Patrick's Dashboard — S914 Wrap (2026-06-07)

---

## 🔴 ACTION NEEDED FROM YOU (in order)

### 1. Push the bounce pipeline (bounceSuppressService.ts + index.ts)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/services/bounceSuppressService.ts
git add packages/backend/src/index.ts
git commit -m "feat: bounce → EmailSuppression pipeline (daily 06:00 UTC cron) + /api/health route"
.\push.ps1
```

> `bounceSuppressService.ts` is a new 229-line file — NOT on GitHub yet. Without this push, the bounce-auto-suppression cron never ships.

---

### 2. Re-mint the Gmail OAuth token (required for mailbox ops + bounce cron)

The current `GMAIL_REFRESH_TOKEN` only has `gmail.send` scope. Two things need it upgraded:
- The **mailbox ops script** (`trash bounce backlog` + `enable forwarding`) → needs `gmail.modify` + `gmail.settings.basic`
- The **bounce cron** (`bounceSuppressService.ts`, 06:00 UTC daily) → needs `gmail.modify` to list + trash processed bounces

**Steps:**
1. Google Cloud Console → your OAuth app → Credentials → edit the OAuth client
2. Add scope `https://mail.google.com/` (full access covers both modify + settings)
3. Run the OAuth consent flow to generate a new refresh token
4. In Railway → backend service → Variables → update `GMAIL_REFRESH_TOKEN` with the new value
5. Redeploy backend so it picks up the new token

**Until this is done:** the bounce cron will throw a 403 at 06:00 UTC every day and do nothing.

---

### 3. Close/merge PR #18 on GitHub

Railway auto-created this PR adding `COPY --from=builder /app/scripts ./scripts` to `Dockerfile.production`. Review it at https://github.com/deseee/findasale/pull/18 and close or merge — don't leave it open.

---

### 4. After token is re-minted — run mailbox ops (Claude will handle this next session)

Claude owns the `scripts/outreach-mailbox-ops.js` run end-to-end. You don't need to do anything except confirm the token is updated and let Claude know next session.

---

## ✅ DONE THIS SESSION

- **Root cause confirmed:** Gmail token scope is `gmail.send` only — that's why every mailbox op 403'd. Not a bug in the script; just needs the token re-minted.
- **Bounce pipeline coded:** `bounceSuppressService.ts` complete, 0 TS errors. Daily cron registered in `index.ts`. Will run at 06:00 UTC daily once pushed + token fixed.
- **Railway CLI confirmed working** in the VM (`railway run --service backend` correctly injects env vars).
- **`/health` + `/api/health` endpoints:** `health.ts` + `healthController.ts` are on GitHub (S913 push). Railway deployment QUEUED — if still QUEUED at next session start, Claude will cache-bust the Dockerfile.

---

## ⚠️ NOTED FINDINGS (pre-outreach-resume checklist)

- **[P2]** Bounce auto-suppression now coded but blocked on Gmail token scope (fix above).
- **[P2]** All email (payouts, receipts, password resets) still rides one Gmail account — suspension kills everything. Architect decision needed on a separate transactional rail (Resend/SES).
- **[P3]** `OUTREACH_ENABLED=false` also silently pauses opt-in "sale ending soon" emails. Consider a separate `BULK_EMAIL_ENABLED` flag.
- **[P3]** Railway deploy QUEUED — may be stuck; Claude will cache-bust at next session start if not resolved.

---

## Decisions still open

- **#335 outreach resume:** account active; keep `OUTREACH_ENABLED=false` until ~Jun 22 (warming). Jane Thrift payout re-send is still the only urgent transactional email.
- **FB Marketplace:** DROP recommended; Graph API OAuth (#365) = long-term path.
- **#332 Shopify:** code fixed; needs a real custom-app store for QA.
- **#230 Smart Buyer:** publish a sale on user1 to enable QA.
