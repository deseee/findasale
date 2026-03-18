# Price Drop Alerts Implementation

## Overview
When an organizer lowers the price on an item, all users who favorited that item receive an email notification. This feature respects user notification preferences.

## Architecture

### Backend Flow
1. **Price Update Detection** (`itemController.ts:updateItem`)
   - When item price is updated, old and new prices are captured
   - If `price !== undefined`, the system checks for price drops
   - Fires-and-forgets the alert notification (non-blocking)

2. **Price Drop Alerts Service** (`services/priceDropService.ts`)
   - `notifyPriceDropAlerts(itemId, oldPrice, newPrice)` - main function
   - Only processes when: `oldPrice` and `newPrice` are valid and `newPrice < oldPrice`
   - Fetches all favorites for the item
   - For each favoriter: checks `notificationPrefs.priceAlerts`, then sends email
   - Email includes: item title, old price (strikethrough), new price, savings $, savings %
   - All errors are logged but non-blocking (fire-and-forget)

3. **Email Template**
   - Subject: `💰 Price drop on "{title}" — now ${newPrice}`
   - Preheader: Item title with price drop
   - Headline: "Price just dropped!"
   - Body: Item details, savings calculation, CTA to view
   - Accent color: Green (#10b981) to indicate good news
   - Uses existing `buildEmail()` from emailTemplateService

### Frontend Flow

1. **Item Detail Page** (`pages/items/[id].tsx`)
   - Added "Price alerts on" badge below favorite button
   - Only shown when: user is logged in AND item is favorited
   - Tooltip: "We'll email you if the price drops"
   - Uses bell icon (🔔) with green styling
   - Automatically enabled for all favorited items

2. **User Profile** (`pages/profile.tsx`)
   - New "Email Notification Preferences" section
   - Checkbox: "Price drop alerts"
   - Description: "Get notified when items you saved go on sale"
   - Defaults to `true` for all users
   - Mutation: `PATCH /users/me/notification-prefs`

### Database

**User Model** (`schema.prisma`)
- `notificationPrefs`: JSON field (already exists)
- Structure: `{ priceAlerts: boolean }`
- Defaults to `true` on new users

**Migration** (`migrations/20260306000019_add_price_alerts_pref/migration.sql`)
- Updates existing users: sets `priceAlerts: true` if not set
- Ensures all records have the field

## Files Modified

### Backend
- `/packages/backend/src/services/priceDropService.ts` - NEW
- `/packages/backend/src/controllers/itemController.ts` - Added import and call to `notifyPriceDropAlerts`
- `/packages/backend/src/routes/users.ts` - Added `PATCH /me/notification-prefs` endpoint

### Frontend
- `/packages/frontend/pages/items/[id].tsx` - Added price alerts badge
- `/packages/frontend/pages/profile.tsx` - Added notification preferences UI

### Database
- `/packages/database/prisma/migrations/20260306000019_add_price_alerts_pref/migration.sql` - NEW

## Price Handling
- **Storage**: Prices stored as Float in database (dollars, not cents)
- **Email Display**: Converted to cents-to-dollars: `(price / 100).toFixed(2)`
- **Comparison**: `newPrice < oldPrice` for detection
- **Null Safety**: Both prices must be valid (not null) to process

## User Preference Flow
1. User favorites an item → price alerts automatically enabled
2. User visits profile → can toggle "Price drop alerts" checkbox
3. Preference saved to `notificationPrefs.priceAlerts`
4. On price drop: service checks preference before sending email
5. If `priceAlerts === false`, email skipped silently

## Email Sending
- Uses Resend API (existing setup via `weeklyEmailService.ts` pattern)
- `FROM_EMAIL`: `process.env.RESEND_FROM_EMAIL`
- `FRONTEND_URL`: `process.env.FRONTEND_URL`
- Fire-and-forget: errors logged but don't block item update response
- Runs via `setImmediate()` to avoid request blocking

## Testing Checklist
- [ ] Update item price: `PATCH /api/items/{id}` with lower price
- [ ] Verify email sent to all users who favorited the item
- [ ] Check email subject and body formatting
- [ ] Verify savings calculation (difference % and $)
- [ ] Toggle price alerts in profile and verify email not sent when disabled
- [ ] Verify badge shows on item detail when logged in & favorited
- [ ] Verify badge hidden when not favorited or not logged in
- [ ] Check null price handling (auction-only items)

## Environment Variables Required
- `RESEND_API_KEY` - Email service API key
- `RESEND_FROM_EMAIL` - Sender email address
- `FRONTEND_URL` - Used in email CTAs (defaults to https://finda.sale)

## Future Enhancements
1. SMS notifications for price drops (Twilio)
2. Push notifications in-app
3. Price drop threshold customization (e.g., "notify only if 20%+ off")
4. Email digest of multiple price drops (batch sending)
5. Analytics: track which price drop emails led to purchases
