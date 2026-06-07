# Patrick's Dashboard — S915 Wrap (2026-06-07)

---

## ✅ ALL S915 EMAIL OPS COMPLETE

**Transactional email**: `GMAIL_REFRESH_TOKEN` restored from Jun-6 backup — payouts, receipts, password resets, organizer notifications all working.

**Outreach mailbox ops** (all 3 done autonomously this session):
- `GMAIL_MAILBOX_REFRESH_TOKEN` obtained via OAuth Playground + stored in Railway ✅
- 77 bounce notifications (mailer-daemon "one step from going live") moved to Trash (recoverable 30 days) ✅
- Auto-forwarding outreach@finda.sale → deseee@gmail.com ENABLED ✅

---

## ⏳ STILL PENDING

- **Jane Thrift payout re-send** — transactional email is fixed, this can be done now if needed

---

## ⚠️ NOTED FINDINGS

- **[P2]** All email rides one Gmail account — suspension or token failure kills everything. Consider Resend/SES rail for transactional email.
- **[P3]** `OUTREACH_ENABLED=false` also silently pauses opt-in "sale ending soon" emails. Consider separate `BULK_EMAIL_ENABLED` flag.

---

## Decisions still open

- **#335 outreach resume:** keep `OUTREACH_ENABLED=false` until ~Jun 22 (warming).
- **FB Marketplace:** DROP recommended; Graph API OAuth (#365) = long-term path.
- **#332 Shopify:** code fixed; needs a real custom-app store for QA.
- **#230 Smart Buyer:** publish a sale on user1 to enable QA.
