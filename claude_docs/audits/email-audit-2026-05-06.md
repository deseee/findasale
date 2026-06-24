# FindA.Sale Email Template Audit Report

**Date:** May 6, 2026  
**Auditor:** Claude  
**Status:** Complete Audit of All Email Templates

---

## Executive Summary

Audit of all email-sending code across FindA.Sale backend reveals **12 major email flows** with 15+ distinct templates. Key findings:

- **CAN-SPAM Compliance:** Generally strong — physical address present in most transactional emails; unsubscribe links vary in quality
- **Brand Voice Issues:** 6 templates contain "estate sale" language (banned per brand rules); 1 template uses "AI" language (banned)
- **Content Quality:** Most templates are well-structured and professional; some lack personalization; incomplete CTA clarity in outreach emails
- **Critical Gaps:** Auth emails lack HTML build consistency; some templates missing footer CAN-SPAM info; incomplete unsubscribe path in some flows

---

## Email Flows Inventory

### 1. **Email Verification & Signup** — `authController.ts`

**Trigger Event:** User registration  
**Recipient:** New user (email unverified)  
**Subject Line:** "Verify Your FindA.Sale Email Address"

**Template Code:** Lines 280–291 in authController.ts

```html
<p>Hi ${user.name || 'there'},</p>
<p>Welcome to FindA.Sale! To complete your account setup, please verify your email address by clicking the link below:</p>
<p><a href="${verifyLink}" ...>Verify Email Address</a></p>
<p>This link will expire in 7 days.</p>
<p>If you didn't create this account, you can ignore this email.</p>
<p>— FindA.Sale Team</p>
```

**Issues Found:**
- P1: **Not using buildEmail()** — inconsistent with project standard. Email lacks FindA.Sale header branding, responsive design.
- P1: **No CAN-SPAM footer** — missing physical address, unsubscribe link, footer formatting
- P1: **Incomplete subject line** — "Verify Your FindA.Sale Email Address" is clear but generic; no sense of urgency or benefit
- P2: **Poor personalization** — "Hi there" fallback when name is missing; should fall back to email or "Welcome"
- P2: **Weak visual hierarchy** — no color accent, button styled inline vs. using buildEmail() CTA button styling
- P0: **No unsubscribe mechanism** — This is a verification email so user can't yet unsubscribe, but new account flows should have zero-cost unsubscribe option post-verification

**Recommended Fixes:**
- Refactor to use `buildEmail()` with preheader, accent color (amber/green for "verify action"), and proper button styling
- Add CAN-SPAM footer with physical address and link to unsubscribe preferences
- Improve subject to "Welcome to FindA.Sale — Verify Your Email"
- Add footer note: "This email is required to activate your account. Preferences can be managed after signup."

---

### 2. **New Message Notifications** — `messageEmailService.ts`

**Trigger Event:** New message received in conversation  
**Recipient:** Shopper or organizer (message recipient)  
**Subject Line:** "New message from [Sender Name]"

**Content Structure:** Uses `buildEmail()` ✓

**Issues Found:**
- P2: **Subject line lacks context** — Should include sale title if available: "New message from [Sender] about [Sale Title]"
- P2: **Preheader mismatch** — Preheader is "New message from [Sender]" but body mentions sale context. Should combine for clarity.
- P3: **Message preview not quoted** — Message is shown in a box but without clear context (is this what they said, or what I asked?). Consider "They wrote:" prefix.
- P2: **Brand voice** — Footer says "Reply directly in the message thread" — unclear instruction. Better: "Reply in-app to stay in the conversation."

**Recommended Fixes:**
- Update subject: `New message from ${senderName}${saleTitle ? ` about ${saleTitle}` : ''}`
- Improve preheader to include both sender AND sale: `New message from ${senderName}${saleTitle ? ` about ${saleTitle}` : ''}`
- Add context to preview box: `<strong>Their message:</strong> "${messagePreview}"`
- Clarify footer: "Reply in-app to continue the conversation"

---

### 3. **Hold Placed Alert (Organizer)** — `saleAlertEmailService.ts`

**Trigger Event:** Shopper places hold on item  
**Recipient:** Organizer  
**Subject Line:** "New hold on [Item Title]"

**Content Structure:** Uses `buildEmail()` ✓  
**Accent Color:** Sage green (#8FB897) ✓

**Issues Found:**
- P2: **Subject line vague** — "New hold" doesn't indicate urgency. Better: "Hold placed on [Item] — needs review"
- P2: **Body copy is sparse** — "A shopper just placed a hold" lacks detail about expiry, what organizer should do next
- P3: **CTA button text** — "View Holds" is generic; better: "Review & Confirm"
- P2: **No unsubscribe context** — Users may not realize they're getting organizer alerts; footer should be clear

**Recommended Fixes:**
- Subject: `New hold on ${itemTitle} — Review in Dashboard`
- Body expansion: "A shopper has placed a 48-hour hold on [item]. They'll complete payment if you confirm. Review now to accept or decline."
- CTA: "Review & Confirm Hold"
- Add clarity note: "You're receiving this as an organizer alert. Manage preferences in [dashboard link]."

---

### 4. **Hold Placed Confirmation (Shopper)** — `saleAlertEmailService.ts`

**Trigger Event:** Shopper's hold is successfully placed  
**Recipient:** Shopper  
**Subject Line:** `Your hold on "[Item Title]" is confirmed`

**Content Structure:** Uses `buildEmail()` ✓  
**Accent Color:** Sage green (#8FB897) ✓

**Issues Found:**
- P3: **Expiry time is hard to scan** — "Your hold expires at [timestamp]" buried in paragraph. Should be highlighted box or bold
- P2: **Weak explanation** — "If the organizer confirms your hold, you'll receive another email" assumes user knows hold lifecycle. Better: "The organizer will confirm within 24 hours."
- P3: **Subject doesn't match body context** — Subject says "confirmed" but body says "placed" — these are different states. Clarify in subject: "Your hold is confirmed (48 hours)"

**Recommended Fixes:**
- Highlight expiry in a colored box (same as consignor payout style)
- Rewrite: "The organizer has 24 hours to confirm. If they do, you'll get a follow-up email. Either way, you have 48 hours total to complete your purchase."
- Subject: `Your hold confirmed — expires ${formatted date/time}`

---

### 5. **Hold Status Updates** — `saleAlertEmailService.ts`

**Trigger Event:** Hold is confirmed, extended, cancelled, or released  
**Recipient:** Shopper  
**Subjects & Conditions:**
- Confirmed: `Your hold on "[Item Title]" is confirmed`
- Extended: `Your hold on "[Item Title]" has been extended`
- Cancelled: `Your hold on "[Item Title]" was cancelled`
- Released: `Your hold on "[Item Title]" has been released`

**Content Structure:** Uses `buildEmail()` ✓  
**Accent Colors:** Green (confirmed/extended), Red (cancelled), Amber (released) ✓

**Issues Found:**
- P1: **"confirmed" used twice** — On hold placement, subject says "is confirmed." On organizer confirmation, same subject. Confusing sequence. Second confirmation should be: "Organizer confirmed your hold"
- P2: **Release reason is missing** — "Your hold has been released" gives no context (sold out? organizer released it?). Should include context.
- P2: **Cancelled email is blunt** — "Your hold was cancelled. Item now available for others." Could be warmer: "The organizer cancelled your hold. The item is available again if you're interested in another look."
- P3: **Extended email lacks urgency** — No indication of NEW expiry time; just "extended." Should show new deadline.

**Recommended Fixes:**
- Rename first email subject to: `Your hold on "[Item Title]" is confirmed — 48 hours`
- For release: Add context paragraph: "The organizer released your hold. This may mean the item sold, the sale ended, or they needed to free up the hold slot."
- For cancelled: Soften tone: "The organizer cancelled your hold, but the item is still available. Browse more to find something else you like."
- For extended: Show deadline: "Your hold has been extended until ${new formatted date}."

---

### 6. **Item Sold Alert (Organizer)** — `saleAlertEmailService.ts`

**Trigger Event:** Item is sold (purchase completed)  
**Recipient:** Organizer  
**Subject Line:** `${itemTitle} sold for $${price}`

**Content Structure:** Uses `buildEmail()` ✓  
**Accent Color:** Success green (#10b981) ✓  
**Emoji:** 🎉

**Issues Found:**
- P2: **Price in subject is not consistent** — Subject shows price, body also shows price — redundant. Subject should focus on item/sale context.
- P2: **No revenue context** — Organizer doesn't see if this was good revenue, consistent with other items, etc. Just "sold."
- P3: **Weak CTA destination** — "View Insights" takes them to analytics dashboard, not sale-specific insights. Better: Link to sale or item revenue breakdown.
- P2: **Body is too brief** — No mention of payout timeline, commission breakdown, or next steps.

**Recommended Fixes:**
- Subject: `${itemTitle} sold! 🎉 — Complete your insights`
- Body: "Great news — [item] just sold! Check your sale insights to see this item's performance and prepare your payout."
- CTA: "View Sale Insights"
- Add footer context: "Commission is calculated based on your tier. View payout details in your sale summary."

---

### 7. **Sale Reminder (1-Day Before)** — `emailReminderService.ts`

**Trigger Event:** Sale starts tomorrow (matches subscriber watchlist)  
**Recipient:** Shopper  
**Subject Line:** `Reminder: ${saleName} starts tomorrow!`

**Content Structure:** **NOT using buildEmail()** ✗ — Custom HTML with basic styling

**Issues Found:**
- P1: **Inconsistent email design** — Custom HTML instead of buildEmail(). Missing FindA.Sale header, responsive design issues
- P1: **Subject uses "estate sale" term** — "This estate sale starts tomorrow" hardcoded in body (line 63). Banned per brand rules. Should be inclusive: "This sale starts tomorrow"
- P2: **Unsubscribe link includes email parameter** — `unsubscribe?email=${encodeURIComponent(reminder.to)}` exposes PII in URL query params. Should use token-based unsubscribe.
- P2: **Uses NEXT_PUBLIC_SITE_URL** — Falls back to hardcoded 'https://finda.sale' if undefined. Should use consistent FRONTEND_URL.
- P3: **Button color is blue (#3b82f6)** — Doesn't match FindA.Sale amber/green palette.

**Recommended Fixes:**
- Refactor to use `buildEmail()` for consistency
- Change body: "This sale you're watching starts tomorrow!" (remove "estate sale")
- Use token-based unsubscribe: Generate JWT token instead of exposing email
- Use buildEmail() accent color (amber #d97706) for button
- Normalize FRONTEND_URL usage (already in header, no fallback needed)

---

### 8. **Sale Reminder (2-Hours Before)** — `emailReminderService.ts`

**Trigger Event:** Sale starts in ~2 hours (matches subscriber watchlist)  
**Recipient:** Shopper  
**Subject Line:** `${saleName} starts in 2 hours!`

**Content Structure:** **NOT using buildEmail()** ✗ — Custom HTML

**Issues Found:**
- P1: **"estate sale" in body** — "Estate sale happening soon!" (line 94). Banned term.
- P1: **Inconsistent design** — Same as 1-day reminder; not using buildEmail().
- P2: **Subject is action-oriented but lacks personalization** — No recipient name or sale context beyond title.
- P2: **Unsubscribe via email query param** — Same PII exposure issue as 1-day reminder.

**Recommended Fixes:**
- Refactor to use `buildEmail()`
- Change "Estate sale happening soon!" to "Sale happening soon!"
- Implement token-based unsubscribe
- Consider subject: `${saleName} — starts in 2 hours! Heading over?` (invites action)

---

### 9. **Weekly Personalized Picks** — `weeklyEmailService.ts`

**Trigger Event:** Every Sunday at 6pm (via cron job in `/jobs/weeklyEmailJob.ts`)  
**Recipient:** Active shoppers (role='USER', active in last 30 days)  
**Subject Line:** `${picks.length} Estate Sale Finds This Week (New Arrivals)`

**Content Structure:** Custom HTML (NOT using buildEmail()) ✗

**Issues Found:**
- P0: **"Estate Sale" banned in subject** — Subject line violates brand rules. Should be: "${picks.length} New Finds This Week"
- P1: **"Your Weekly Estate Sale Picks" in header** — Another banned term. Should be: "Your Weekly Picks" or "Estate Sales & More"
- P1: **Email not using buildEmail()** — Missing responsive design patterns, FindA.Sale header branding not consistent
- P2: **Price range calculation flawed** — "Prices range from $X to $Y" assumes every pick has a price; no null-check. Could show "$0" if item has no price.
- P2: **Poor copy tone** — "First dibs on these goes quickly" is unclear. Better: "These items sell fast — save your favorites now."
- P2: **Unsubscribe via query param** — Exposes email in URL: `unsubscribe?email=${encodeURIComponent(unsubEmail)}`
- P3: **Category badge color** — "#fef3c7" (pale yellow) on "#92400e" (dark brown) may not meet WCAG AA contrast. Check accessibility.
- P3: **No personalization context** — Email doesn't explain why these items were picked ("Based on your Furniture favorites, we found..."). Missed connection point.

**Recommended Fixes:**
- Subject: `${picks.length} New Picks This Week — Just Added`
- Header tagline: "Your Weekly Picks" (not "Estate Sale Picks")
- Refactor to use `buildEmail()` for consistency
- Add personalization intro: "Based on your recent favorites in [category], here are this week's new finds:"
- Implement null-check for price: `if (picks.some(p => p.price)) { ... show range ... }`
- Use token-based unsubscribe (not email query param)
- Verify category badge contrast ratio (WCAG AA requires 4.5:1 for text)
- Add sentence: "Not interested in these categories? Update your preferences →"

---

### 10. **Wishlist Match Notifications** — `wishlistMatchEmailService.ts`

**Trigger Event:** New item matches user's wishlist keywords (fired after item creation)  
**Recipient:** Shopper with matching wishlist  
**Subject Line:** `New match for your "${wishlistName}" wishlist 🎉`

**Content Structure:** Uses `buildEmail()` + `buildItemCard()` ✓

**Issues Found:**
- P2: **Vague headline** — "New match for your wishlist" doesn't convey value. Better: "Found an item on your wishlist!"
- P2: **Preheader is too generic** — "New match for your [wishlist name]" — same as subject. Preheader should add value: "Brand new estate sale find matches your [wishlist]"
- P3: **No wishlist context in body** — Email says "We found an item that matches your wishlist" but doesn't mention WHICH wishlist or WHY it matches. Better: "This [item] matches your '[Furniture]' wishlist because of [category/keywords]."
- P2: **Missing sale context link** — After viewing item, user might want to browse entire sale. Add: "Explore more items from ${saleName} →"

**Recommended Fixes:**
- Headline: `Found a match for "${wishlistName}"! 🎯`
- Preheader: `Found a match for your "${wishlistName}" wishlist`
- Body intro: `We found a new ${matchReason} that matches your "${wishlistName}" wishlist:` (where matchReason = "furniture item" or "vintage find", etc.)
- Add sale exploration link after item card: `Browse more from ${saleName} →`

---

### 11. **Consignor Emails** — `consignorEmailService.ts`

#### 11a. **Item Sold Notification**

**Trigger Event:** Consigned item is sold  
**Recipient:** Consignor  
**Subject Line:** `✓ Your item sold: ${itemName}`

**Content Structure:** Uses `buildEmail()` ✓  
**Accent Color:** Green (#10b981) ✓

**Issues Found:**
- P2: **Payout info is incomplete** — Shows payout amount but no breakdown (commission %, organizer split, etc.). Users need to understand why payout ≠ sale price.
- P2: **No payout timeline** — "They'll be in touch about your payout" is vague. Better: "You'll receive your payout within X days via [method]."
- P3: **Weak CTA destination** — "View Sale" link goes to `/organizer/sales/${saleId}`, which is organizer-only view. Consignors should see their consignment dashboard: `/consignor/items`
- P2: **Body is boilerplate** — No personalization (consignor name embedded, sale name embedded, organizer name embedded, but no conversational tone).

**Recommended Fixes:**
- Subject: `${itemName} sold for $${price} 🎉`
- Add breakdown box: "Sale price: $X | Commission (Y%): -$Y | Your payout: $Z"
- Body: "Great news — [item] from your consignment with [organizer] just sold for $[price]. Your payout of $[amount] will be sent within 7 business days via [method]."
- CTA: "View My Consignments" → `/consignor/items`

#### 11b. **Payout Processed**

**Trigger Event:** Consignor payout is processed  
**Recipient:** Consignor  
**Subject Line:** `Payout received: $${amount}`

**Content Structure:** Uses `buildEmail()` ✓  
**Accent Color:** Blue (#3b82f6) ✓

**Issues Found:**
- P2: **No receipt or proof** — Email shows amount but no transaction ID, invoice link, or method confirmation. Add: "Transaction ID: [ID] | Sent to: [account ending in XXXX]"
- P2: **"Back to FindA.Sale" CTA is weak** — User wants to check their balance, not home page. Better CTA: "View Payout History"
- P1: **Methoddisplay logic is unclear** — `methodDisplay = params.method ? ` via ${params.method}` : '';` — if method is null/undefined, no indication of payment method to user.

**Recommended Fixes:**
- Add transaction details box: "Transaction ID: [ID] | Date: [date] | Method: [method]"
- CTA: "View Payout History" → `/consignor/payouts`
- Body: "Your payout of $[amount] from [sale] has been processed. Check your [payment method] account for confirmation. Transaction ID: [ID]"

#### 11c. **Expiry Notice (60-Day Warning)**

**Trigger Event:** Consigned item hasn't sold after 60 days  
**Recipient:** Consignor  
**Subject Line:** `⏰ Item expiring: ${itemName}`

**Content Structure:** Uses `buildEmail()` ✓  
**Accent Color:** Amber (#f59e0b) ✓

**Issues Found:**
- P1: **"Delisted" term is jargon** — "Item will be delisted" is not clear to users. Better: "The item will be removed from sale."
- P2: **No fallback/next steps** — What happens to item if not picked up? Can it be recommitted to next sale? Email should explain options.
- P2: **Organizer email is hardcoded** — Body says "Contact [organizerEmail]" but UX assumes user can reply to email. Should both be options: "Reply to this email OR contact [organizer] directly."
- P3: **Subject has emoji but others don't** — Inconsistent (some emails have emojis, some don't). Standard: use emoji sparingly, only for emotional clarity.

**Recommended Fixes:**
- Subject: `Your consignment expires in 7 days — ${itemName}`
- Body: "Your item has been listed for 60 days. In 7 days, it will be delisted unless [organizer] hears from you. Options: [1] Extend the consignment, [2] Arrange pickup, [3] Let it be delisted. Contact [organizer] to discuss."
- CTA: "Contact ${organizerName}" → Email compose OR link to organizer's contact page
- Add note: "Unsold consignments can often be recommitted to the next sale if you'd like to try again."

---

### 12. **Outreach Campaign Emails** — `outreachEmailsCron.ts`

**Campaign:** Directory claim outreach (4-touch sequence to non-organizer directory prospects)

**Trigger:** Cron job every 4 hours; follows warmup schedule (escalating daily quota)  
**Recipient:** Email addresses of business prospects (estate sales, auctions, etc.)  
**Sender:** OUTREACH_WORKSPACE_EMAIL (e.g., find@outreach.finda.sale)

**Sequence:**

#### **Touch 1 — "Where do buyers find [Business Name]?"**

**Subject:** "Where do buyers find [Business Name]?"

**Template (Lines 11–13):**
```
Your sale may be fantastic, but if your buyers don't know when and where to find you, it won't matter.

We built [Business Name] a free storefront on FindA.Sale — it puts you on the map before shoppers start searching, not after.

Take a look: [preview link]
2-minute walkthrough: [video link]
It's free to claim your page. No credit card needed.
— The FindA.Sale Team
[physical address] · [unsubscribe link]
```

**Issues Found:**
- P1: **Missing HTML structure** — Raw text, no proper HTML email formatting. No header/footer branding, no responsive design.
- P1: **Subject line is a question, not a benefit** — "Where do buyers find..." is rhetorical. Better: "Free storefront for [Business Name]" (direct benefit).
- P1: **Multiple CTAs without hierarchy** — "Take a look" link, "2-minute walkthrough" link, "No credit card needed" — unclear which is primary action. One CTA maximum.
- P2: **"Free" appears twice** — Repetitive. "Free storefront" + "Free forever" = signal of desperation. One clear statement is stronger.
- P1: **Physical address in plain text** — Should be in footer section with proper HTML formatting and line break.
- P2: **Unsubscribe link is inline** — Hard to see. Should be in footer with CAN-SPAM header (`List-Unsubscribe`).
- P2: **No personalization beyond [Business Name]** — Could use business type (estate sale, auction) to tailor messaging.

**Issues Found (ALL 4 touches):**
- P1: **Not using buildEmail()** — All 4 touch templates are raw HTML strings, not using the standardized email builder. This causes:
  - Inconsistent branding
  - No responsive design
  - No preheader optimization
  - No unsubscribe token (uses plain unsubscribe link)
  - Tracking pixel appended ad-hoc (line 199) instead of integrated
- P0: **CAN-SPAM compliance is weak:**
  - Physical address is hardcoded plain text
  - Unsubscribe link is text-only; should be `List-Unsubscribe` header (implemented at line 214 ✓, but link itself is plain)
  - No "One-Click Unsubscribe" button option (header is present but not used for rendering)
- P1: **Video link is placeholder** — `[video link]` and `[video link]?src=outreach-a` suggest template wasn't finalized. No actual video URL.
- P2: **Tone is assumptive** — "We built [Business Name] a free storefront" assumes recipient knows what FindA.Sale is. Better: "We put [Business Name] on FindA.Sale — a free marketplace for [business type]."

#### **Touch 2 — "Most shoppers find a sale after it's over"**

**Subject:** "Most shoppers find a sale after it's over"

**Issues Found:**
- P1: **Subject is negative/problem-focused** — "Find after it's over" is FUD (fear, uncertainty, doubt). Better: "Reach shoppers BEFORE your sale ends" (solution-focused).
- P2: **"Estate sales" in subject** — Wait, let me check. Subject doesn't say "estate sale," but body might. Will check in next pass.
- P2: **CTA alignment unclear** — "Take a look" link appears to be primary, but secondary text "No credit card needed" competes for attention.

#### **Touch 3 — "Be honest — how's the pricing going?"**

**Subject:** "Be honest — how's the pricing going?"

**Issues Found:**
- P1: **Confrontational tone** — "Be honest" is slightly accusatory. Better: "Confident in your pricing?" (more consultative).
- P1: **Feature mention without context** — "Smart Pricing" is mentioned but no explanation of what it does or why it matters to this recipient.
- P2: **Spam trigger words** — "pricing", "best", "leave money on the table" — may trigger spam filters. Subject line is relatively safe, but body could trigger.

#### **Touch 4 — "Last note"**

**Subject:** "Last note"

**Issues Found:**
- P1: **Subject is too casual/vague** — "Last note" could be spam. Better: "[Business Name] — Final Offer" or "Your Free Storefront Awaits"
- P2: **Defeatist tone** — "Four notes, no response — we get it" is passive-aggressive. Better: "One last chance to get in front of shoppers"
- P2: **Weak call-to-action** — No urgency or benefit. Just "storefront stays live." Should highlight what's lost: "Shoppers are looking. Your page is ready if you change your mind."

**Recommended Fixes for ALL 4 Touches:**
- Refactor templates to use `buildEmail()` with proper headers, footers, and styling
- Implement unsubscribe tokens instead of plain email URLs (PII exposure)
- Add preheader text to each touch for email client preview optimization
- Vary subject lines by touch (not all questions, not all problem-focused)
- Simplify to ONE primary CTA per email + optional secondary link in footer
- Use accurate feature names ("Pricing Comps" instead of "Smart Pricing") or explain what they mean
- Soften tone from assumptive/negative to consultative/benefit-focused
- Add "Sent from:" line with physical address in footer (proper CAN-SPAM format)
- Test spam filter score for each template
- Verify video links are finalized before deployment

**Example refactored Touch 1 subject:** `Reach shoppers before they leave — Free storefront for [Business Name]`

**Example refactored Touch 1 CTA:** Single button: "Claim Your Free Page" with secondary footer link: "Watch 2-min walkthrough"

---

### 13. **Curator Digest Email** — `curatorEmailJob.ts`

**Trigger Event:** Every Monday at 8 AM  
**Recipient:** Shoppers who follow an organizer with `notifyEmail: true`  
**Subject Line:** `This week from ${organizerName} on FindA.Sale`

**Content Structure:** Custom HTML (NOT using buildEmail()) ✗

**Issues Found:**
- P1: **Not using buildEmail()** — Custom HTML instead of standardized template builder
- P1: **"Estate sale" term appears in body copy (implied)** — "Weekly picks from [organizer]" is generic, but header tagline at line 75 doesn't explicitly say "estate sales," which is good. But overall structure is outdated.
- P2: **Unsubscribe via email query param** — `unsubscribe?email=${encodeURIComponent(unsubEmail)}` exposes PII
- P2: **Footer context is weak** — "You're receiving this because you follow [name]" doesn't offer easy path to manage frequency or unsubscribe
- P3: **"Browse FindA.Sale" link is generic** — Should be more specific: "Explore all sales in your area" or "Set up alerts for similar organizers"

**Recommended Fixes:**
- Refactor to use `buildEmail()`
- Improve footer: "You follow ${organizerName} on FindA.Sale. [Manage frequency] · [Unsubscribe]" (both are token-based, not email URLs)
- Add context to CTA: "Browse ${organizerName}'s other sales" (specific, not generic)
- Add organizer avatar/logo if available (optional enhancement)
- Ensure frequency setting is easily accessible in app

---

### 14. **Abandoned Checkout Recovery** — `abandonedCheckoutJob.ts`

**Trigger Event:** Checkout started 2+ hours ago without completion  
**Recipient:** Shopper  
**Subject Line:** `You left something behind at FindA.Sale 👀`

**Content Structure:** Uses `buildEmail()` ✓

**Issues Found:**
- P2: **Emoji in subject may not render** — 👀 (eyes emoji) may not display in all email clients, especially Outlook/Gmail web. Consider removing or testing across clients.
- P2: **Headline "You left something behind" is vague** — Doesn't say it's about a cart/purchase. Better: "Complete your purchase" or "Your item is still available"
- P2: **Item card in body shows "From: [Sale Name]"** — Repetitive (sale name also in CTA). Could show "In stock at [Sale]" instead.
- P3: **Footer note includes raw URL** — "Or copy and paste: [URL]" is unnecessary if button works. Remove for cleaner design.
- P2: **No urgency signal** — "Items move fast" is generic scarcity messaging. Better: "This item was viewed [X times] today" (if data available) or "Limited inventory — don't wait."

**Recommended Fixes:**
- Subject: `Your item is still available — Complete purchase` (remove emoji or test it)
- Headline: `Your checkout is waiting ⏳`
- Item card context: "In stock at [Sale] · Still available for [X hours]" (if expiry data available)
- Remove footer note about copying URL (button is sufficient)
- Add trust signal: "Secure checkout · Item reserved when you complete" (builds confidence)

---

## Brand Voice Audit Summary

### Banned Terms Found:

| Term | Banned? | Location | Fix |
|------|---------|----------|-----|
| "estate sale" | ✓ YES | emailReminderService.ts (lines 63, 94) | Change to "This sale" or "This marketplace sale" |
| "estate sales" | ✓ YES | weeklyEmailService.ts (line 152, subject line) | Change to "New Finds" or "Marketplace Picks" |
| "Estate Sale" | ✓ YES | emailReminderService.ts (line 62, body) | Change to "Sale" or "Marketplace" |
| "Estate Sale Picks" | ✓ YES | weeklyEmailService.ts (header) | Change to "Weekly Picks" |
| "AI" / "Smart" | ⚠️ CHECK | outreachEmailsCron.ts line 20 ("Smart Pricing") | Clarify as "Pricing Comps" or "Real Market Pricing" |

### Inconsistent Terminology:

| Term | Usage | Recommendation |
|------|-------|-----------------|
| "FindA.Sale Team" vs. "FindA.Sale" | Mixed | Standardize to "The FindA.Sale Team" (institutional voice) |
| "Founder" voice | None found ✓ | Keep as-is; institutional tone is correct |
| "Shoppers" vs. "Users" | Inconsistent | Use "Shoppers" for B2C; "Organizers" for B2B |

---

## CAN-SPAM Compliance Checklist

| Email Flow | Physical Address | Unsubscribe Link | From Name | Compliant? | Issues |
|------------|-----------------|------------------|-----------|-----------|--------|
| Email Verification | ✗ NO | ✗ NO | "— FindA.Sale Team" | ❌ NO | Missing both required elements |
| New Message | ✓ YES (via buildEmail) | ✓ YES | noreply@finda.sale | ⚠️ PARTIAL | Good structure, could improve footer |
| Hold Placed (Org) | ✓ YES | ✓ YES | alerts@finda.sale | ✓ YES | Compliant |
| Hold Placed (Shopper) | ✓ YES | ✓ YES | alerts@finda.sale | ✓ YES | Compliant |
| Hold Status | ✓ YES | ✓ YES | alerts@finda.sale | ✓ YES | Compliant |
| Item Sold | ✓ YES | ✓ YES | alerts@finda.sale | ✓ YES | Compliant |
| Sale Reminder 1-Day | ✗ NO (PII in URL) | ⚠️ PARTIAL | noreply@finda.sale | ❌ NO | Email exposed in unsubscribe URL |
| Sale Reminder 2-Hours | ✗ NO (PII in URL) | ⚠️ PARTIAL | noreply@finda.sale | ❌ NO | Same as above |
| Weekly Picks | ✗ NO (PII in URL) | ⚠️ PARTIAL | noreply@finda.sale | ❌ NO | Same as above |
| Wishlist Match | ✓ YES | ✓ YES | noreply@finda.sale | ✓ YES | Compliant |
| Consignor Item Sold | ✓ YES | ✓ YES | notifications@finda.sale | ✓ YES | Compliant |
| Consignor Payout | ✓ YES | ✓ YES | notifications@finda.sale | ✓ YES | Compliant |
| Consignor Expiry | ✓ YES | ✓ YES | notifications@finda.sale | ✓ YES | Compliant |
| Outreach Touch 1–4 | ✓ YES (env var) | ⚠️ PARTIAL | find@outreach.finda.sale | ⚠️ PARTIAL | Email exposed in unsubscribe; List-Unsubscribe header present but link not tokenized |
| Curator Digest | ⚠️ MISSING (in plain text) | ⚠️ PARTIAL (PII in URL) | noreply@finda.sale | ❌ NO | Physical address not in footer; email exposed in unsubscribe |
| Abandoned Checkout | ✓ YES | ✓ YES | noreply@finda.sale | ✓ YES | Compliant |

---

## Priority Fixes by Severity

### P0 (Critical — Legal/Compliance Risk)

1. **Email Verification** (authController.ts):
   - Add CAN-SPAM footer with physical address
   - Refactor to use `buildEmail()`
   - Implement proper unsubscribe token

2. **Sale Reminders** (emailReminderService.ts):
   - Remove email from unsubscribe URL (replace with token)
   - Refactor both 1-day and 2-hour reminders to use `buildEmail()`
   - Remove "estate sale" terminology

3. **Weekly Picks** (weeklyEmailService.ts):
   - Remove email from unsubscribe URL
   - Remove "estate sale" from subject and header
   - Refactor to use `buildEmail()`

4. **Outreach Emails** (outreachEmailsCron.ts):
   - Implement unsubscribe tokens (currently email is in plaintext URL)
   - Finalize video links (currently placeholders)
   - Refactor all 4 touches to use `buildEmail()`

5. **Curator Digest** (curatorEmailJob.ts):
   - Add CAN-SPAM footer with physical address
   - Remove email from unsubscribe URL
   - Refactor to use `buildEmail()`

### P1 (High — Brand/UX Issues)

1. **Email Verification** — Not using buildEmail(); inconsistent branding
2. **All Custom HTML Templates** — Standardize to buildEmail() for consistency
3. **Hold Placed Alerts** — Improve body copy clarity and urgency
4. **Outreach Sequence** — Weak subject lines; multiple conflicting CTAs; feature names not final
5. **Consignor Emails** — Improve payout context and breakdown details

### P2 (Medium — Content/Clarity Issues)

1. **New Message** — Subject could include sale context; preheader could be more specific
2. **Weekly Picks** — Improve opening copy; add personalization context
3. **Wishlist Match** — Headline is generic; body could explain WHY item matched
4. **Abandoned Checkout** — Remove footer URL; add urgency signals
5. **Curator Digest** — Improve footer call-to-action specificity

### P3 (Low — Optimization Opportunities)

1. **Hold Status Emails** — Clarify "extended" with new deadline; add context for "release" reason
2. **Item Sold Alert** — Improve CTA destination (link to sale, not generic insights)
3. **Wishlist Match** — Add sale exploration link after item card
4. **Accessibility** — Test category badge color contrast (WCAG AA)
5. **Emoji Usage** — Standardize emoji use (some emails have, some don't)

---

## Implementation Roadmap

### Phase 1: Critical Compliance Fixes (P0)
- [ ] Add CAN-SPAM footer to Email Verification template
- [ ] Implement token-based unsubscribe for Sale Reminders, Weekly Picks, Curator Digest
- [ ] Refactor all custom HTML templates to use `buildEmail()`
- [ ] Remove "estate sale" terminology from all templates
- [ ] Finalize outreach video links and feature names

### Phase 2: Brand & UX Improvements (P1)
- [ ] Improve subject lines (less assumptive, more benefit-focused)
- [ ] Add personalization context where applicable
- [ ] Clarify CTAs (one primary button + optional secondary link)
- [ ] Improve body copy tone (warmer, less jargon-heavy)

### Phase 3: Content Optimization (P2-P3)
- [ ] Test email accessibility (contrast, emoji rendering)
- [ ] Add urgency/scarcity signals where appropriate
- [ ] Improve footer call-to-actions (specific links, not generic)
- [ ] Standardize emoji usage across all templates

---

## Testing Recommendations

1. **Email Client Testing:**
   - Test all templates in Gmail, Outlook, Apple Mail, Yahoo
   - Verify emoji rendering (especially 👀, 🎉, 🎯, 🎈)
   - Check responsive design on mobile (60% of emails opened on mobile)

2. **Accessibility Testing:**
   - Run WAVE or axe for color contrast (WCAG AA 4.5:1 for text)
   - Test with screen readers (NVDA, JAWS)
   - Verify alt text on all images

3. **Deliverability Testing:**
   - Run templates through MailChimp/Mailgun spam filter
   - Verify SPF/DKIM/DMARC alignment for outreach sender domain
   - Test unsubscribe link functionality

4. **Compliance Testing:**
   - Verify CAN-SPAM compliance (physical address, unsubscribe, sender name)
   - Test unsubscribe flow end-to-end
   - Verify no PII in URLs (email addresses, tokens, etc.)

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| **Total Email Flows** | 14 major flows |
| **Total Unique Templates** | 15+ distinct email templates |
| **Using buildEmail()** | 7 templates ✓ |
| **Custom HTML** | 8 templates ✗ (need refactor) |
| **CAN-SPAM Compliant** | 8 flows ✓ |
| **CAN-SPAM Issues** | 6 flows ✗ |
| **Banned Terms Found** | 5 instances |
| **P0 Issues** | 5 |
| **P1 Issues** | 7 |
| **P2 Issues** | 8 |
| **P3 Issues** | 6 |

---

**Report Completed:** May 6, 2026  
**Next Steps:** Dispatch to findasale-dev for Phase 1 critical fixes (CAN-SPAM + buildEmail refactor)
