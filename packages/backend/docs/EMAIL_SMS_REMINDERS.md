# Email & SMS Reminder System Documentation

## Overview

FindA.Sale sends automated reminders to shoppers who are watching sales. Both **email** and **SMS** channels are supported to reach users with different communication preferences.

### Supported Reminder Types
- **1-Day Before**: Sent 24 hours before sale starts
- **2-Hour Before**: Sent 2 hours before sale starts

---

## Architecture

### Components

1. **emailReminderService.ts** - Core service that handles all reminder logic
   - `sendReminderEmail()` - Sends email via Resend
   - `sendReminderSMS()` - Sends SMS via Twilio
   - `processReminderEmails()` - Orchestrates both email & SMS delivery

2. **emailReminderJob.ts** - Scheduled job that runs hourly
   - Executes `processReminderEmails()` every hour at `:00`
   - Automatically detects sales needing 1-day and 2-hour reminders

3. **notificationController.ts** - API endpoints for subscriptions
   - `POST /api/notifications/subscribe` - User subscribes to sale with email/phone
   - `DELETE /api/notifications/subscribe/:saleId` - User unsubscribes
   - `GET /api/notifications/subscriptions` - Get user's active subscriptions
   - `POST /api/notifications/send-sms-update` - Organizer sends SMS to subscribers

4. **Database Models**
   - `SaleSubscriber` - Links users to sales with optional email/phone

---

## Configuration

### Environment Variables (Backend)

```bash
# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@finda.sale

# SMS (Twilio)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+15551234567
```

### Required on User/Shopper Side

Users must:
1. **Have an account** (registered user)
2. **Watch a sale** (creates subscription)
3. **Optionally provide phone number** (for SMS delivery)

Email delivery uses the account email address automatically.

---

## How It Works

### 1. User Subscribes to a Sale

**API Endpoint:** `POST /api/notifications/subscribe`

Request:
```json
{
  "saleId": "sale_12345",
  "email": "user@example.com",
  "phone": "+15551234567"
}
```

Response:
```json
{
  "message": "Successfully subscribed to sale notifications",
  "subscription": {
    "userId": "user_123",
    "saleId": "sale_12345",
    "email": "user@example.com",
    "phone": "+15551234567",
    "createdAt": "2026-03-02T10:00:00Z"
  }
}
```

### 2. Hourly Reminder Job Executes

The cron job runs every hour at `:00` and:
1. Finds all PUBLISHED sales with `startDate` in the next 24-26 hours (1-day reminders)
2. Finds all PUBLISHED sales with `startDate` in the next 2-2.5 hours (2-hour reminders)
3. For each sale, fetches all subscribers
4. Sends email + SMS to subscribers (if they have email/phone)

### 3. Reminder Delivery

**Email Template (1-Day Reminder):**
```
Subject: Reminder: [Sale Name] starts tomorrow!

Don't forget about [Sale Name]!
This estate sale starts tomorrow:

[Sale Name]
📍 [Address], [City], [State]
🕐 [Day], [Month] [Date] at [Time]

[View Sale Details Button]

You're receiving this because you're watching this sale on FindA.Sale.
```

**SMS Template (1-Day Reminder):**
```
🏷️ Reminder: [Sale Name] starts tomorrow at [Day] [Month] [Date] [Time]. 📍 [Address], [City], [State]
```

**Email/SMS for 2-Hour Reminder:**
Similar format with "in 2 hours" instead of "tomorrow"

---

## Testing

### Unit Tests

Run the test suite to verify email/SMS functionality:

```bash
cd packages/backend
npm run test -- src/__tests__/emailReminders.e2e.ts
```

### Manual Testing in Staging

1. **Create a test sale starting in 1-2 hours:**
   ```bash
   # Via API or dashboard
   - Title: "Test Sale - 2 Hours"
   - Start Date/Time: Now + 2 hours
   - Status: PUBLISHED
   ```

2. **Subscribe with your test account:**
   ```bash
   curl -X POST http://localhost:5000/api/notifications/subscribe \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "saleId": "sale_xyz",
       "email": "your-test@example.com",
       "phone": "+15551234567"
     }'
   ```

3. **Monitor logs:**
   ```bash
   # Watch backend logs for reminder processing
   docker logs findasale-backend-1
   # Look for: "✓ Reminder email sent to..." and "✓ Reminder SMS sent to..."
   ```

4. **Verify delivery:**
   - Check your test email inbox (email from Resend)
   - Check your test phone for SMS (from Twilio number in TWILIO_PHONE_NUMBER)

### Testing in Production

Once deployed:

1. Create a real sale starting in a few hours
2. Subscribe with your personal email/phone
3. Wait for the reminder to arrive
4. Check Resend dashboard for delivery metrics
5. Check Twilio dashboard for SMS delivery status

---

## Monitoring & Metrics

### Resend Email Metrics

Dashboard: https://resend.com/emails
- Delivery rate
- Open rate
- Click-through rate
- Bounce rate

### Twilio SMS Metrics

Dashboard: https://console.twilio.com/us1/monitor/logs/sms
- Message delivery status
- Cost per message
- Error codes (if any)

### Application Logs

The reminder system logs all activity:

**Successful Email:**
```
✓ Reminder email sent to user@example.com for Test Sale
```

**Successful SMS:**
```
✓ Reminder SMS sent to +15551234567 for Test Sale
```

**Skipped (no email):**
```
⚠️ Skipping email for subscriber (no email provided)
```

**Skipped (no SMS):**
```
⚠️ Skipping SMS for subscriber (no phone provided)
```

**Errors:**
```
✗ Failed to send reminder email to invalid@example.com: [Error message]
✗ Failed to send reminder SMS to +15551234567: [Error message]
```

---

## Rate Limiting

### Resend
- Free tier: 100 emails/day
- Paid tier: Unlimited
- Delay: 0 (no delay needed)

### Twilio
- Free tier: No limit (but US/CA only)
- Paid tier: No limit
- Delay: 200ms between messages (to avoid rate limits)

The emailReminderService automatically implements the 200ms delay when sending SMS.

---

## Troubleshooting

### Emails not sending

**Check:**
1. Is `RESEND_API_KEY` set correctly?
2. Is `RESEND_FROM_EMAIL` a verified Resend address?
3. Check Resend dashboard for delivery errors

**Fix:**
```bash
# Verify API key
echo $RESEND_API_KEY  # Should be non-empty and start with 're_'

# Verify FROM email is registered in Resend
# https://resend.com/emails/settings/domains
```

### SMS not sending

**Check:**
1. Is `TWILIO_ACCOUNT_SID` set correctly?
2. Is `TWILIO_AUTH_TOKEN` set correctly?
3. Is `TWILIO_PHONE_NUMBER` a valid Twilio number?
4. Is the destination phone in the correct format? (e.g., `+15551234567`)

**Fix:**
```bash
# Verify Twilio credentials
echo $TWILIO_ACCOUNT_SID     # Should be non-empty and start with 'AC'
echo $TWILIO_AUTH_TOKEN      # Should be non-empty
echo $TWILIO_PHONE_NUMBER    # Should start with '+'

# Check Twilio account status
# https://console.twilio.com/us1/account
```

### Reminders not triggering

**Check:**
1. Is `emailReminderJob.ts` imported in `backend/src/index.ts`? ✓ Yes, it is
2. Are there PUBLISHED sales with startDate in the correct range?
3. Are there subscribers for those sales?

**Fix:**
```bash
# Manually trigger reminder processing
# Add this to a test endpoint:
import { processReminderEmails } from './services/emailReminderService';
await processReminderEmails();

# Check logs for output
```

### High costs/rate limits

**Optimize:**
- SMS: Consider making SMS opt-in (requires UI change)
- Email: Batch emails every 4 hours instead of hourly (change cron expression)
- Both: Implement subscription preferences per sale

---

## Future Enhancements

1. **Push Notifications** - For PWA installed users
2. **In-App Notifications** - Badge on homepage
3. **Notification Preferences** - Per-user opt-in for each channel
4. **Customizable Templates** - Allow organizers to customize reminder text
5. **A/B Testing** - Compare delivery rates of different reminder times
6. **Unsubscribe Links** - One-click unsubscribe in emails
7. **Multi-Language** - Localized reminder templates

---

## Related Files

- `src/services/emailReminderService.ts` - Core reminder logic
- `src/jobs/emailReminderJob.ts` - Scheduled job
- `src/controllers/notificationController.ts` - API endpoints
- `src/__tests__/emailReminders.e2e.ts` - Test suite
- `prisma/schema.prisma` - Database schema (SaleSubscriber model)

---

**Last Updated:** 2026-03-02
**Phase:** Phase 8 (Email & SMS Validation)
**Status:** E2E test suite created, infrastructure validated
