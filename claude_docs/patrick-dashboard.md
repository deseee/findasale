# Patrick's Dashboard — S916 Wrap (2026-06-07)

---

## ✅ SENTRY MYSTERY SOLVED

There was never a Sentry forwarding filter in Gmail. What actually happened:

One organizer record ("Kaff's Bake Shop") had a Sentry ingest address as its contact email in the database. The outreach cron sent 3 emails to it in May/June. Sentry bounced them back. **That record is now ARCHIVED in the DB — it won't be targeted again.**

**Gmail API sends are fully working.** The Sent folder has 8,919 messages and 2 successful sends from tonight.

The mailer-daemon bounces flooding the outreach inbox are from Gmail's *auto-forwarding service* (the forwarding we set up to deseee@gmail.com) hitting its own daily rate limit because the inbox has 1,415 messages queued. This is inbox noise — not an email delivery problem. We'll clean it up next session.

---

## 🔴 PUSH THIS BEFORE FLIPPING OUTREACH ON

The ARCHIVED exclusion fix is coded but not pushed:

```
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/jobs/outreachEmailsCron.ts
git commit -m "fix(outreach): exclude ARCHIVED records from cron candidate query"
.\push.ps1
```

Wait ~5 min for Railway deploy, **then** set `OUTREACH_ENABLED=true` in Railway → backend service → Variables.

---

## ⏳ NEXT SESSION — Gmail Inbox Triage

Patrick asked Claude to triage the outreach@finda.sale Gmail inbox and clear all unnecessary emails. That's the S917 agenda:
- Delete all mailer-daemon bounce messages (forwarding failures — worthless noise)
- Clear automated newsletters/subscriptions
- Leave only real organizer replies
- Verify forwarding starts working once volume drops

---

## ⚠️ NOTED FINDINGS (still open)

- **[P2]** All email rides one Gmail account — suspension or token failure kills everything. Consider Resend/SES rail for transactional email.
- **[P3]** `OUTREACH_ENABLED=false` also silently pauses opt-in "sale ending soon" emails. Consider separate `BULK_EMAIL_ENABLED` flag.

---

## Decisions still open

- **#335 outreach resume:** push the fix → set `OUTREACH_ENABLED=true`. Jane Thrift payout re-send can go anytime (Gmail API is working).
- **FB Marketplace:** DROP recommended; Graph API OAuth (#365) = long-term path.
- **#332 Shopify:** code fixed; needs a real custom-app store for QA.
- **#230 Smart Buyer:** publish a sale on user1 to enable QA.
