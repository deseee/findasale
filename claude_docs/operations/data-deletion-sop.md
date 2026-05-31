# Data Deletion SOP — FindA.Sale

**Version:** 1.0  
**Effective:** 2026-05-31  
**Owner:** Operations / Support  
**Trigger:** Email to support@finda.sale with subject "Account Deletion Request"

---

## Overview

This SOP governs how FindA.Sale processes user account deletion requests in compliance with our Privacy Policy and applicable law (including GDPR Article 17 right to erasure).

**Deadline:** All steps must be completed within 30 days of the request date.

---

## Step-by-Step Process

### Step 1 — Receive and Log the Request

- Confirm the request arrived at support@finda.sale with subject line "Account Deletion Request"
- Log the request: date received, requesting email address, user ID (look up in Railway DB or admin panel)
- If subject line is missing or email is ambiguous, reply requesting confirmation before proceeding

### Step 2 — Verify Identity

- Confirm the requesting email address matches the account's registered email in the database
- If there is a mismatch (e.g., user sends from a different address), reply asking them to send from their registered account email or provide account verification (e.g., last 4 of a payment method, sale title they organized)
- Do NOT proceed to deletion until identity is confirmed

### Step 3 — Acknowledge the Request (within 48 hours)

Reply to the user:

> Subject: Your Account Deletion Request — FindA.Sale  
> Hi [Name], we've received your account deletion request. We'll complete the deletion within 30 days. You'll receive a confirmation email when it's done. Transaction records required by law will be retained in pseudonymized form for up to 7 years per IRS requirements. All other personal data will be permanently deleted. Questions? Reply to this email. — The FindA.Sale Team

### Step 4 — Deactivate Account in Railway DB (within 48 hours)

Connect to the Railway database using psycopg2 or the Railway dashboard query editor.

**Connection string:** Retrieve from Railway Dashboard → findasale-db service → Variables → DATABASE_PUBLIC_URL

```sql
-- Deactivate the account immediately (prevents login, hides listings)
UPDATE "User" SET "isActive" = false WHERE id = '[user-id]';
```

Verify:
```sql
SELECT id, email, "isActive" FROM "User" WHERE id = '[user-id]';
```

### Step 5 — Remove from MailerLite (within 48 hours)

- Log in to the MailerLite dashboard
- Navigate to Subscribers → search for the user's email
- Delete the subscriber (not just unsubscribe — full deletion removes their record from all groups)
- Alternatively, use the MailerLite API: DELETE /api/v2/subscribers/{subscriber_id}

### Step 6 — Pseudonymize Personal Data (on Day 30)

On or before day 30 from the request date, run the pseudonymization query:

```sql
-- Pseudonymize the user record
UPDATE "User"
SET
  email = CONCAT('deleted-', id, '@deleted.finda.sale'),
  name = 'Deleted User',
  phone = NULL,
  "profileImage" = NULL,
  "passwordHash" = NULL
WHERE id = '[user-id]';
```

**Do not delete the User row** — it is referenced by transaction records (Orders, PointsTransactions, Sale organizer fields) that must be retained for 7 years per IRS requirements.

### Step 7 — Retain Financial Records (Permanent)

The following records must be retained in pseudonymized form indefinitely (minimum 7 years per IRS):

- `Order` records (purchase history, amounts, Stripe payment intent IDs)
- `PointsTransaction` records
- `Sale` records where user was the organizer
- Stripe payout history (retained by Stripe separately — no action needed)

These records reference the pseudonymized User row (`deleted-[id]@deleted.finda.sale`) and contain no personal identifying information after Step 6.

### Step 8 — Send Completion Confirmation

Email the user (their original address, now deleted from the system — send from support@finda.sale manually):

> Subject: Your Account Has Been Deleted — FindA.Sale  
> Hi, your FindA.Sale account has been permanently deleted as requested. All personal data has been removed. Transaction records are retained in anonymized form per IRS requirements. Thank you for using FindA.Sale. — The FindA.Sale Team

### Step 9 — Log Completion

Record the completed deletion in the deletion log (spreadsheet or internal doc):

| Date Requested | Date Completed | User ID | Completed By |
|---|---|---|---|
| YYYY-MM-DD | YYYY-MM-DD | [uuid] | [initials] |

**Never log email addresses or names in the deletion log** — user ID only.

---

## Edge Cases

**Active organizer with live sales:** If the user has active sales on the platform, unpublish all their sales before deactivation. Notify any buyers with pending orders that the organizer's account is closing and initiate refunds.

**Ongoing dispute:** If the user has an open buyer dispute, resolve or close the dispute before pseudonymizing. Retain the dispute record.

**Payout pending:** If the organizer has a pending Stripe payout, allow Stripe to complete the payout before proceeding. Contact Stripe support if a hold is active.

---

## Railway DB Access

```bash
# Install psycopg2 if needed
pip install psycopg2-binary

# Python one-liner connection test
python3 -c "import psycopg2; conn = psycopg2.connect('[DATABASE_PUBLIC_URL]'); print('connected')"
```

Retrieve the live DATABASE_PUBLIC_URL from Railway Dashboard — do not use a hardcoded value (passwords rotate).
