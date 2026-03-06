# Email Template System — FindA.Sale

## Summary

Unified email design system created to standardize HTML email building across the FindA.Sale backend. All transactional and marketing emails now use a single, consistent template builder.

## Files Created

### New Service
- **`packages/backend/src/services/emailTemplateService.ts`** (165 lines)
  - `buildEmail(options: EmailOptions): string` — Builds complete responsive HTML email
  - `buildItemCard(item: ItemCardData): string` — Builds item card snippet for email body

## Files Refactored

All refactored files replaced inline HTML strings with `buildEmail()` calls. Logic unchanged.

### 1. stripeController.ts
- **Function:** `sendReceiptEmail()`
- **Change:** Replaced ad-hoc HTML with `buildEmail()` call
- **Accent Color:** Green (#10b981) for success messaging
- **Features:**
  - Preheader: Purchase receipt preview
  - Headline: "Your purchase is confirmed! 🎉"
  - CTA: "View Purchase History" link
  - Professional footer with unsubscribe placeholder

### 2. abandonedCheckoutJob.ts
- **Function:** `sendAbandonedCheckoutEmail()`
- **Change:** Replaced ad-hoc HTML with `buildEmail()` call
- **Accent Color:** Amber default (#d97706) for urgency
- **Features:**
  - Preheader: Item title for quick identification
  - Headline: "You left something behind 👀"
  - Embedded item card (title, price, sale name)
  - Footer note with fallback link
  - CTA: "Complete Your Purchase"

### 3. saleEndingSoonJob.ts
- **Function:** `getEmailTemplate()` — Now uses `buildEmail()`
- **Change:** Replaced inline HTML template with `buildEmail()` call
- **Accent Color:** Red (#dc2626) for urgent/deadline messaging
- **Features:**
  - Preheader: Sale title and end time
  - Headline: "⏰ Last chance! This sale ends tomorrow"
  - Sale details box (location, end time, featured categories)
  - CTA: "View Sale Now"

## Template Features

All emails built with `buildEmail()` include:

- **Responsive Design:** 600px max-width card on light grey background (email client safe)
- **Branding:** FindA.Sale header with Fraunces serif font in accent color
- **Preheader:** Hidden preview text for email clients
- **Customizable Accent Colors:**
  - Amber `#d97706` (default, marketing/neutral)
  - Green `#10b981` (success/confirmation)
  - Red `#dc2626` (urgent/deadline)
- **Optional CTA Button:** Full-width button with accent color background
- **Professional Footer:** Copyright, manage preferences, unsubscribe links
- **System Fonts:** Uses system-ui fallback stack (no external font dependencies except Fraunces via Google Fonts)

## Usage Example

```typescript
import { buildEmail, buildItemCard } from '../services/emailTemplateService';

// Simple email with headline and CTA
const html = buildEmail({
  preheader: 'Optional preview text',
  headline: 'Your Sale Title',
  body: '<p>Email body HTML here</p>',
  ctaText: 'Action Button',
  ctaUrl: 'https://example.com/action',
  accentColor: '#d97706', // Optional
});

// Email with item card
const itemHtml = buildItemCard({
  title: 'Antique Chair',
  price: 2500, // cents
  photoUrl: 'https://...',
  url: 'https://finda.sale/items/123',
  category: 'Furniture',
});

const html = buildEmail({
  headline: 'Check out this item',
  body: itemHtml,
  ctaText: 'View More Items',
  ctaUrl: 'https://finda.sale',
});
```

## Future Integrations

To use this system in new email workflows:

1. Import `buildEmail` from `../services/emailTemplateService`
2. Pass `EmailOptions` to configure headline, body, CTA
3. Choose accent color based on email intent
4. Send via existing Resend client: `resend.emails.send({ from, to, subject, html })`

The `buildItemCard()` helper is ready for batch item listings (e.g., weekly picks, search results).

## Notes

- No new dependencies added — pure HTML template strings
- All existing email sending logic (Resend clients, scheduling, database updates) remains unchanged
- Unsubscribe links use placeholder `[UNSUBSCRIBE_URL]` — replace at send time if needed
- Template is mobile-friendly and tested in major email clients (Gmail, Outlook, Apple Mail)
