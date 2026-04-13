# FindA.Sale Beta Support Knowledge Base — March 2026

**Version:** 1.0
**Created:** 2026-03-06
**Maintained by:** Head of Customer Support

---

## Overview

This is the canonical reference for the top 15 support issues organizers and shoppers are expected to encounter during beta launch. Each entry includes the problem statement, likely root cause, plain-English resolution steps, and escalation criteria.

**Audience:** Patrick (responds to users directly). Responses should use the tone and templates defined in the support skill.

---

## Issue #1: I Didn't Receive My Payout

**Applies to:** Organizers
**Severity:** High
**Expected frequency:** 1–3 per week during first 2 weeks

### Problem Statement
An organizer sold items, the payment went through on the shopper side, but they haven't received the money in their bank account.

### Likely Causes
1. **Stripe Connect setup incomplete.** Organizer created an account but didn't complete the onboarding (bank details, tax info, or business verification).
2. **Payout schedule mismatch.** FindA.Sale uses instant payouts (daily deposits), but the organizer expected immediate (within hours).
3. **Bank processing delay.** Payment left Stripe but the bank is processing it (typically 1–2 business days).
4. **Sale not published.** Items were marked sold but the sale was still in draft mode — no payment was actually captured.

### Resolution Steps

**Step 1: Check Organizer Onboarding Status**
- Ask: "Can you log into your FindA.Sale organizer dashboard and go to the Payouts section?"
- If it says **"Not Connected" or "Setup Required,"** the Stripe account is incomplete.
- Send them to `/organizer/payouts` and have them click **"Connect Your Bank Account."**
- They'll be taken through the Stripe onboarding flow. They need to:
  - Confirm their email
  - Enter personal/business tax information
  - Add bank account details (routing number, account number)
  - Verify their identity (photo ID)
  - Once Stripe approves (typically 1–2 minutes), they'll see **"Connected"** status.

**Step 2: Check Stripe Transaction Timeline**
- Ask: "What date did the sale happen, and what's the sale title?"
- Log into Stripe Dashboard (admin access only — escalate if Patrick needs to verify):
  - Look up the payment in Stripe under Payments → Search by amount or sale name
  - Check payment status: Should show "Succeeded" and a payout entry
  - Check payout status: Payouts → search for the amount. Should show "Paid" and include the date it left Stripe
- If payment is "Processing," tell the organizer: **"Your payment is confirmed and in the bank processing queue. It should arrive within 1–2 business days depending on your bank."**

**Step 3: Check Bank Receipt Timeline**
- Ask: "When did the payment arrive in your bank account, or has it not arrived yet?"
- If **arrived:** You're done — it was just a delay. Apologize for the concern.
- If **not arrived:** Ask when the sale happened, calculate business days:
  - If < 2 business days old: "It's in transit. Your bank usually processes ACH transfers within 1–2 business days. Check again tomorrow morning."
  - If > 2 business days old: Escalate to Patrick. May indicate a bank hold or failed transfer.

### Response Template

Hi [Name],

Thanks for reaching out — I'm looking into your payout now.

I can see that you sold [item] on [date] for $[amount]. The payment came through on our end, and I've confirmed it was sent to your bank account on [payout date].

Payments from FindA.Sale are processed daily and typically arrive in your bank within 1–2 business days depending on how quickly your bank processes ACH transfers. If it's been less than 2 business days, please check your account again tomorrow morning.

If it's been more than 2 business days and you still don't see it, please reply with your bank name and the last 4 digits of the account, and I'll investigate further.

– Patrick

### When to Escalate
- Payout was marked "Paid" in Stripe more than 3 business days ago and hasn't appeared in the organizer's bank
- Organizer claims they completed Stripe onboarding but account shows "Not Connected"
- Multiple payouts are missing (potential systemic Stripe issue — route to dev)

---

## Issue #2: I Can't Publish My Sale

**Applies to:** Organizers
**Severity:** High
**Expected frequency:** 2–5 per week

### Problem Statement
An organizer filled out their sale details, added items, but the **"Publish Sale"** or **"Go Live"** button is disabled, grayed out, or returns an error.

### Likely Causes
1. **Stripe Connect not set up.** Sales can't go live without a connected Stripe account. (This is intentional — we need to know where payouts go.)
2. **Missing required sale fields.** Title, start date, end date, or address are blank or invalid.
3. **No items added.** The system requires at least one item in the inventory before publishing.
4. **Sale dates in the past.** Start date or end date is before today.
5. **Browser cache issue.** Old form state cached in localStorage preventing the button from updating.

### Resolution Steps

**Step 1: Verify Stripe Setup**
- Ask: "Have you connected your bank account for payouts? Can you go to your dashboard and click 'Payouts'?"
- If they see **"Not Connected"** or **"Setup Required,"** walk them through Issue #1, Step 1 (Stripe Connect setup).
- Once Stripe is connected, the publish button should become available.

**Step 2: Verify Sale Details Are Complete**
- Ask them to check:
  - **Sale Title:** Is it filled in? (Should be something like "Estate Sale — April 2026")
  - **Sale Start Date:** Is it set? (Should be today or a future date)
  - **Sale End Date:** Is it set and after the start date?
  - **Address:** Is a full address entered?
  - **At least one photo:** Is there a cover/main photo?
- If anything is blank, have them fill it in and try again.

**Step 3: Verify Items Exist**
- Ask: "How many items are in your sale? Can you see them in the inventory section?"
- If **no items:** "You need to add at least one item before publishing. Go to the Inventory tab and click 'Add Item.' Even if you're still photographing items, add placeholder titles so we know the sale has inventory."
- If **items exist:** Move to Step 4.

**Step 4: Check Sale Date Logic**
- Ask: "What are your sale start and end dates?"
- If **start date is in the past:** "Move the start date to today or tomorrow."
- If **end date is before start date:** "Make sure the end date is after the start date."

**Step 5: Clear Browser Cache (Last Resort)**
- Ask them to:
  - Open developer tools (F12 or Cmd+Opt+I)
  - Go to Application tab → Storage → Local Storage
  - Find and delete anything with your sale ID in the key
  - Refresh the page and try again
- Or: "Try opening the site in a private/incognito window and logging in again."

### Response Template

Hi [Name],

I'm sorry the publish button isn't working. Let me help you troubleshoot.

First, can you confirm:
1. Your Stripe bank account is connected (check your dashboard's Payouts section)
2. Your sale has a title, start date, end date, and address
3. You've added at least one item to the inventory

Reply with those details and we'll get your sale live.

– Patrick

### When to Escalate
- All checks pass (Stripe connected, fields complete, items added) but publish button still doesn't work → potential UI bug
- Button works but throws a 500 error when clicked → backend error, route to dev
- Organizer can't access the publish button at all (not grayed out, just missing) → check permissions, may be a role issue

---

## Issue #3: An Item Sold But the Buyer Isn't Responding for Pickup

**Applies to:** Organizers
**Severity:** Medium
**Expected frequency:** 2–4 per week (after first purchases)

### Problem Statement
An organizer completed a sale (buyer paid), but the buyer has gone silent and isn't responding to messages or arranging pickup.

### Likely Causes
1. **Buyer hasn't seen the message.** Email notification failed or went to spam.
2. **Buyer is disorganized.** They bought it but haven't coordinated pickup logistics yet.
3. **Buyer changed their mind.** They may want to cancel but haven't said so explicitly.
4. **Organizer needs clarification.** They don't know what counts as "reasonable waiting time" before following up.

### Resolution Steps

**Step 1: Attempt Contact Through FindA.Sale**
- Have the organizer go to their organizer dashboard → Messages
- Find the conversation thread with the buyer about the item
- Send a polite message: "Hi [Buyer Name], we're ready to hand off [Item] whenever works for you. Are you still interested in picking it up this week? Let me know what times work best."
- Set a 1-day follow-up reminder (they should expect a response within 24 hours for time-sensitive sales)

**Step 2: If No Response in 24 Hours, Escalate**
- The organizer can send a **final reminder** message: "I haven't heard back about pickup for [Item]. If I don't hear from you by [date], I may need to re-list it. Please let me know your availability."
- If the buyer still doesn't respond after 48 hours from the sale, the organizer can assume abandonment.

**Step 3: Refund and Re-list**
- Once it's clear the buyer has abandoned the item, Patrick will:
  1. Issue a refund to the buyer's original payment method (appears in 5–10 business days)
  2. Notify the buyer: "Your purchase of [Item] has been refunded due to lack of response on pickup arrangements. If you'd like to re-purchase, let us know."
  3. Help the organizer re-list the item to the sale

### Response Template

Hi [Name],

I see that [Buyer] purchased [Item] on [date], but you haven't heard from them about pickup. Here's what to do:

1. Send them a friendly reminder message through the FindA.Sale app: "We're ready to hand off your item. What times work best for you this week?"
2. If they don't respond within 24 hours, send one final message: "If I don't hear from you by [tomorrow's date], I'll re-list the item."
3. After 48 hours of no response, let me know and I'll process a refund and help you re-list.

Sales move fast — most buyers should confirm pickup within a day. Let me know if they get back to you.

– Patrick

### When to Escalate
- Buyer explicitly says they want to cancel (route refund request to Issue #4)
- Organizer has multiple unresponsive buyers (pattern issue → route to CX for feedback)
- Buyer is being abusive or harassing organizer (content moderation issue → escalate to Patrick)

---

## Issue #4: A Buyer Wants a Refund

**Applies to:** Shoppers & Organizers (buyer initiates, organizer may need to authorize)
**Severity:** Medium
**Expected frequency:** 1–3 per week

### Problem Statement
A buyer (shopper) wants to cancel a purchase and get their money back. Reasons vary: changed mind, item not as described, fell through on logistics, etc.

### Likely Causes
1. **Buyer remorse.** They bought impulsively and now want out.
2. **Item condition mismatch.** The photos were misleading or the item had undisclosed damage.
3. **Logistics failed.** Buyer and organizer can't coordinate a pickup time.
4. **Sale was cancelled.** The organizer cancelled the sale and the buyer wasn't notified properly.

### Resolution Steps

**If Organizer Initiates Refund (e.g., item no longer available)**
- Have the organizer go to their dashboard → Sales → [Sale Name] → Orders
- Find the buyer's order and click "Refund"
- The refund processes immediately. Buyer sees it in 5–10 business days.
- The organizer should message the buyer: "I've processed a refund of $[amount] for [Item]. We're sorry the item is no longer available."

**If Buyer Requests Refund (through support or message)**
- If **within 2 hours of purchase:** Approve it. Buyer is still in the cooling-off window. Process the refund and mark the item as available again.
- If **2 hours to 24 hours:** Check the reason:
  - **Item not as described / condition mismatch:** Approve refund. Ask for photos of the issue (optional; trust organizer on first refund).
  - **Changed mind / logistics fell through:** Suggest the buyer contact the organizer to reschedule. Refunds should be organizer-initiated, not platform-forced.
- If **more than 24 hours:** Treat as return / dispute. Escalate to Patrick for case-by-case judgment.

**Refund Process (Patrick only)**
1. Log into Stripe Dashboard
2. Find the payment/charge
3. Click "Refund" and choose full or partial amount
4. Stripe processes it immediately; buyer's bank receives it in 5–10 business days
5. Send the buyer a refund confirmation email (use the refund template from skill)

### Response Template (For Buyer Requesting Refund)

Hi [Name],

Thanks for reaching out. I'm sorry [issue] happened with your purchase of [Item].

I've processed a refund of $[amount] back to the payment method you used. You should see it in your bank account within 5–10 business days depending on your bank's processing time.

If the organizer is able to help work out a reschedule, we'd love to see that happen — but the refund is approved either way.

– Patrick

### Response Template (For Organizer Authorizing Refund)

Hi [Name],

I've processed a refund of $[amount] for [Buyer's] purchase of [Item]. Refunds typically appear within 5–10 business days depending on their bank.

[One sentence context: "the item was damaged in transit," "they need to reschedule," etc.]

Sorry for the inconvenience — thanks for working with us.

– Patrick

### When to Escalate
- Buyer claims they never received the item (potential fraud or shipping issue)
- Buyer claims the organizer is refusing to refund (potential dispute)
- Chargebacks or credit card disputes filed (immediately to Patrick)
- Refund request is for an amount different than the original charge (clarify with buyer first)

---

## Issue #5: I Can't Log In / Forgot My Password

**Applies to:** Both (organizers and shoppers)
**Severity:** High
**Expected frequency:** 3–8 per week

### Problem Statement
User can't log in. They either forgot their password, or they're getting an error ("Invalid email/password," "Account not found," etc.).

### Likely Causes
1. **User never registered.** They assumed they had an account but didn't complete signup.
2. **Typo in email.** Common: extra space, different email address than expected.
3. **Password reset token expired.** They clicked a reset link from an old email (links expire after 30 minutes).
4. **Browser cookie/cache issue.** Old session data blocking login.
5. **Account locked.** (Rare, but possible after failed login attempts.)

### Resolution Steps

**Step 1: Confirm Account Exists**
- Ask: "What email address are you trying to log in with?"
- **Important:** Have them copy/paste it from their email client to avoid typos.
- Ask: "Can you check if that email is in your email's sent folder? Any emails from FindA.Sale?"
- If **no emails from FindA.Sale:** Account likely doesn't exist. Send them to `/register` to create one.

**Step 2: Reset Password**
- Direct them to `[frontend]/forgot-password`
- Have them enter their email address
- They'll receive an email with a reset link
- The link expires in 30 minutes
- They should click it and set a new password
- Then log in with the new password

**Step 3: Check for Typos**
- Have them carefully re-enter their email when resetting password
- Common issues: gmail vs. gmial, missing @ symbol, space before/after email
- Have them copy/paste from a saved email

**Step 4: Clear Browser Cache (If Still Failing)**
- Have them open an **incognito/private window** and try logging in again
- Or:
  - F12 → Application → Cookies → Delete all cookies for finda.sale
  - Refresh page and try again

### Response Template

Hi [Name],

I'm sorry you're locked out. Here's how to get back in:

1. Go to [frontend]/forgot-password
2. Enter your email address (copy it directly from your email client to avoid typos)
3. Check your inbox and spam folder for a reset link from FindA.Sale
4. Click the link and set a new password (it expires in 30 minutes)
5. Log in with your new password

If you still see an error, reply with the exact error message and I'll dig deeper.

– Patrick

### When to Escalate
- User resets password but still can't log in (potential account lock or auth service issue)
- Multiple users reporting the same login error simultaneously (systemic auth issue)
- User suspects account was hacked (security concern → escalate to Patrick immediately)

---

## Issue #6: How Do I Add Items in Bulk?

**Applies to:** Organizers
**Severity:** Low to Medium
**Expected frequency:** 2–4 per week

### Problem Statement
An organizer has 50+ items to add and finds the one-by-one add-item form tedious. They want to know if there's a faster way (CSV upload, spreadsheet sync, etc.).

### Likely Causes
1. **Feature doesn't exist yet.** Bulk import is on the roadmap but not shipped in beta.
2. **Organizer doesn't know about the AI tagging shortcut.** They can add items with minimal info and AI will fill in some details.
3. **Organizer is trying to use the wrong tool.** Looking for CSV when the UI form is the only option.

### Resolution Steps

**Option 1: Use the Add-Items Form Efficiently** (Current solution for beta)
- Explain: "Right now, we add items one at a time, but there are shortcuts:
  - **Batch photo upload:** You can take photos of all your items, upload them together, and we'll assign them automatically.
  - **AI auto-tagging:** Once you add a title and photo, our AI will suggest category, condition, and tags. You just approve or edit."
  - Have them go to their sale's inventory page and click "Add Item"
  - Fill in title, category, starting price, and upload a photo
  - The AI kicks in after ~10–15 seconds and suggests tags/condition
  - They review and save
  - Repeat for each item

**Option 2: Defer to Roadmap** (For power users)
- "Bulk CSV import is on our roadmap for Q2. For now, the one-by-one form with AI assistance is the fastest path. If you'd like bulk import sooner, let me know and I can prioritize it."

### Response Template

Hi [Name],

I get it — adding [number] items one at a time sounds tedious! Here's how to speed it up:

1. Use the **Add Item** form with a photo for each item
2. The AI will automatically suggest category, condition, and tags within 15 seconds
3. You just approve or edit the suggestions and move to the next item

This is actually faster than filling out every field manually. For truly large inventories (500+), we can also discuss a custom bulk import, but for most estate sales, the form + AI is the way to go.

Bulk CSV upload is on our roadmap — I'll note your request!

– Patrick

### When to Escalate
- Organizer has 500+ items and really needs a bulk import (route to CX for feedback triage)
- Organizer has uploaded photos but the AI tagging isn't working (debugging issue → route to dev)

---

## Issue #7: My Sale Isn't Showing on the Map

**Applies to:** Organizers
**Severity:** Medium
**Expected frequency:** 1–3 per week

### Problem Statement
An organizer published their sale, but when they check the map view (`/map`), their sale doesn't appear. Or it appears in one location but the address is wrong.

### Likely Causes
1. **Sale is unpublished or in draft.** The map only shows published sales.
2. **Geocoding failed.** The address was entered but the backend couldn't convert it to lat/lng coordinates (e.g., typo in address).
3. **Address is outside Grand Rapids.** Map may be filtered to a specific metro area or search radius.
4. **Caching issue.** The map data was cached before the sale was published.

### Resolution Steps

**Step 1: Verify Sale Is Published**
- Ask: "Can you check your dashboard and confirm the sale status says 'Published' or 'Live'?"
- If **Draft:** They need to click "Publish" first. (See Issue #2 for help.)
- If **Published:** Move to Step 2.

**Step 2: Verify Address Format**
- Ask: "What's the full address you entered? (Street, city, state, ZIP)"
- Have them double-check for typos. Common issues:
  - Misspelled street name or city
  - Missing ZIP code
  - Abbreviations like "St" vs "Street"
- If they spot an issue, have them edit the sale and re-save the address
- Ask them to refresh the map page and wait ~30 seconds for data to reload

**Step 3: Check if Address Is Geocodable**
- Log into the backend/database (admin only) and check the `sales` table:
  - Find the sale by name
  - Check the `latitude` and `longitude` fields
  - If **both are null:** The geocoding service failed
- If geocoding failed, ask the organizer to:
  - Make sure the address includes the full street, city, and ZIP
  - Edit the sale and save again (this triggers re-geocoding)
  - Wait 30 seconds and refresh the map

**Step 4: Check Sale's Geographic Scope**
- Current beta scope: **Grand Rapids, MI**
- Ask: "Is your sale in Grand Rapids or the surrounding area?"
- If **outside Grand Rapids:** The map view may be filtered to Grand Rapids only
- Explain: "Right now we're launching in Grand Rapids first. If your sale is in a nearby area, it might not show on the main map yet. We'll expand to other Michigan metros soon."

### Response Template

Hi [Name],

I'm looking into why your sale isn't on the map. A few quick checks:

1. **Is your sale published?** Check your dashboard — the status should say "Published" or "Live."
2. **Is the address complete?** Full street, city, state, ZIP (no abbreviations).
3. **Is it in the Grand Rapids area?** We're launching in Grand Rapids first.

Can you confirm those and let me know? If the address is correct and published, there might be a geocoding hiccup — I can re-index it from my end.

– Patrick

### When to Escalate
- Sale is published with a correct address, but geocoding still returns null after 2 attempts
- Multiple sales in the same area aren't showing (possible map filtering or backend issue)
- Address is valid but the map is placing the pin in the wrong location (geocoding error)

---

## Issue #8: I Used an Invite Code But Didn't Get Organizer Access

**Applies to:** Organizers (beta access gatekeeping)
**Severity:** High
**Expected frequency:** 2–5 in first week, then 0–1/week after

### Problem Statement
User received an invite code, registered with it, but their account is still showing as a regular "Shopper" instead of "Sale Organizer." They can't see the organizer dashboard or create sales.

### Likely Causes
1. **Invite code wasn't applied correctly.** They registered as a Shopper first, then tried to use the code (too late — role is set at registration).
2. **Code was already used.** The same invite code was consumed by someone else.
3. **Code is invalid.** Typo in the code or it was never generated/sent.
4. **Database sync issue.** The invite was marked as used but the user role wasn't promoted.

### Resolution Steps

**Step 1: Verify the Invite Code**
- Ask: "Can you copy/paste the exact invite code you used? I'll verify it."
- Check the database (admin only):
  - Query `beta_invites` table for the code
  - Confirm `status` = "USED" (or similar active status)
  - Confirm the user's email is linked to it
  - Check if `used_at` timestamp is recent
- If **code not found:** It was never issued. They may have copied it wrong. Ask for the original email with the code.

**Step 2: Verify User Registration**
- Check the user record:
  - Email should match the invite code email
  - Role should be **"ORGANIZER"** (not "USER")
  - If role is "USER," there's a bug or the code was applied after they registered
- Ask the user: "What role shows on your profile?" (Have them check dashboard → Settings)

**Step 3: Fix the Role Manually**
- If the user registered with the correct code but role is still "USER":
  - This is a bug. Patrick should manually update their role to "ORGANIZER" in the database
  - Then create the organizer profile
  - Then notify the user: "I've upgraded your account to Sale Organizer. You should now see the organizer dashboard. Please refresh your browser."

**Step 4: If Code Was Invalid**
- Generate a new invite code and send it to them
- Have them **log out** and re-register with the new code
- Or, if they're already registered as a User, Patrick can manually promote them

### Response Template

Hi [Name],

Thanks for reaching out. I'm looking into your invite code now.

Can you confirm:
1. The exact code you used (copy/paste from the original email)
2. The email address you registered with

I'll verify it on my end and make sure your account has organizer access. If there's an issue, I'll fix it manually and you'll have full access within a few minutes.

– Patrick

### When to Escalate
- Multiple users report the same invite code as invalid (code generation issue)
- User has the correct code and role is "USER" instead of "ORGANIZER" (database/auth bug)
- Invite code appears used but the user has no account (potential data corruption)

---

## Issue #9: I Can't Connect My Stripe Account

**Applies to:** Organizers (payment setup)
**Severity:** High
**Expected frequency:** 1–3 per week

### Problem Statement
An organizer clicked "Connect Stripe" or "Connect Your Bank Account," but the flow failed, froze, or kicked them back with an error. They can't complete payment setup.

### Likely Causes
1. **Browser or popup blocker blocked the Stripe window.** Stripe's onboarding runs in a new window/redirect.
2. **Stripe session timeout.** They took too long and the session expired (>10 minutes).
3. **Email mismatch.** Stripe is trying to link an account to a different email than they registered with.
4. **Account creation failed.** The backend failed to create the Stripe Connect account.
5. **Network error mid-flow.** The browser lost connectivity during the Stripe onboarding.

### Resolution Steps

**Step 1: Check Browser/Popup Settings**
- Ask: "Did you see a popup or window open when you clicked the button? Did your browser ask to allow popups?"
- If **no popup appeared:**
  - Ask them to check if popups are blocked (browser settings → Privacy/Permissions)
  - Have them add finda.sale to the popup whitelist
  - Try again
- If **popup appeared but got stuck:** Move to Step 2.

**Step 2: Restart the Stripe Flow**
- Have them:
  1. Log out of FindA.Sale completely
  2. Log back in
  3. Go to Dashboard → Payouts
  4. Click "Connect Your Bank Account"
  5. Complete the Stripe onboarding **without stepping away or opening other tabs**
  6. Should take ~5–10 minutes total (ID verification, bank info, tax info)

**Step 3: Check Stripe Account Status (Admin Only)**
- Log into Stripe Dashboard
- Search for the organizer's Stripe Connect account by email
- Check account status:
  - **"Restricted":** Account was created but is waiting for more info (ID, tax docs, business verification)
  - **"Active":** Account is ready to receive payments
  - **"Under review":** Stripe is verifying the organizer (can take 24–48 hours)
- If "Restricted," message the organizer: "Your Stripe account was created but needs more information. You should see a message in your account asking for [specific docs]. Complete those and Stripe will approve you within 24 hours."

**Step 4: Check Backend Logs (Dev Only)**
- If Stripe account was never created, check the backend logs for errors
- Common errors:
  - "Account creation failed — invalid email"
  - "Stripe API rate limited"
  - "Network timeout reaching Stripe"

### Response Template

Hi [Name],

I'm sorry the Stripe setup didn't work. Let's troubleshoot:

First, try this:
1. Log out of FindA.Sale completely
2. Clear your browser cache (or use an incognito window)
3. Log back in
4. Go to Dashboard → Payouts → "Connect Your Bank Account"
5. Complete the setup without switching tabs (takes ~5–10 minutes)

If you hit an error screen, take a screenshot and reply with it — that'll help me see what's blocking you.

– Patrick

### When to Escalate
- Stripe account exists but is stuck in "Restricted" for >2 business days (Stripe support issue)
- Backend failed to create the Stripe account (error in logs)
- Same error recurring for multiple users (systemic issue)
- Organizer provided sensitive Stripe info in their message (security concern — don't process, escalate to Patrick)

---

## Issue #10: A Buyer Bought an Item But I Already Sold It Locally

**Applies to:** Organizers
**Severity:** Medium
**Expected frequency:** 2–5 per week in first month

### Problem Statement
An organizer sold an item through a local walk-in (or prior to listing on FindA.Sale), then a buyer purchased it through the app. Now there are two claims to the same item.

### Likely Causes
1. **Timing issue.** Organizer forgot to mark the item as "Sold" when they sold it locally.
2. **Organizer didn't realize the item sold offline.** They added it to FindA.Sale, then someone bought it at the physical location.
3. **Human error.** Organizer accidentally marked the wrong item as available.
4. **Sale period confusion.** Organizer wasn't sure if FindA.Sale orders only happen during the published sale dates.

### Resolution Steps

**Step 1: Acknowledge the Conflict**
- No blame. Explain: "This happens when inventory syncs between in-person and online. Let's resolve it quickly."

**Step 2: Mark Item as Unavailable**
- Have the organizer immediately go to their dashboard and **remove the item from inventory** or mark it as **"Sold"/"Unavailable."**
- This prevents further purchases.

**Step 3: Refund the Online Buyer**
- Patrick issues a full refund to the buyer
- Message the buyer: "I'm sorry — this item was sold locally before your order arrived. Your $[amount] has been refunded. You may have seen it listed, but it was no longer available. We apologize for the oversight."
- Refund appears in buyer's account in 5–10 business days

**Step 4: Suggest Process Improvement**
- Ask the organizer: "Going forward, how are you tracking inventory? Are these walk-in sales, or pre-sales before the FindA.Sale window?"
- Suggest:
  - **For walk-in sales:** Keep a notebook or phone list of sold items. Update FindA.Sale at the end of each day.
  - **For pre-sales:** Wait to list items on FindA.Sale until the official sale date/time.
- Offer: "If you'd like, I can walk you through best practices for managing both online and in-person inventory."

### Response Template

Hi [Name],

I see that [Buyer] purchased [Item] on [date], but you've already sold it locally. No problem — we'll make it right.

I've refunded [Buyer] $[amount]. The refund will appear in their account within 5–10 business days.

For your sale, I recommend:
1. **Track sold items immediately** — keep a running list of anything sold in-person
2. **Update FindA.Sale daily** — mark items as "Sold" so they don't show for new buyers
3. **Set a clear sale window** — if items can sell before the official start date, let your team know to remove them from the listing

Let me know if you have questions about managing inventory!

– Patrick

### When to Escalate
- Same organizer has 3+ double-sales (pattern of poor inventory management — may indicate intentional overbooking)
- Buyer is upset and demands compensation beyond refund (customer service judgment call)
- Organizer claims the system didn't let them mark the item as sold (UI bug)

---

## Issue #11: How Do I Use the QR Code Sign?

**Applies to:** Organizers
**Severity:** Low
**Expected frequency:** 3–8 per week (feature awareness)

### Problem Statement
An organizer wants to know how the QR code feature works and how to use it at their physical sale location.

### Likely Causes
1. **New feature.** QR codes shipped in the latest build and organizers aren't familiar yet.
2. **Organizer looking for a shortcut.** QR codes are optional but can drive traffic from print materials, flyers, and signage at the sale.

### Resolution Steps

**Explanation: What the QR Code Does**
- The QR code links directly to your sale's page on FindA.Sale
- When shoppers scan it (with any phone camera or QR app), they land on your sale listing
- It's tracked so you can see how many people scanned it in your analytics
- It's particularly useful for driving traffic at the physical location (print it on signage, flyers, business cards)

**How to Generate It**
1. Go to your organizer dashboard
2. Click on the sale you want to promote
3. Click the "Share" button or look for a "QR Code" icon
4. The QR code will display on screen
5. Click "Download" to save it as an image (PNG or JPG)

**How to Use It**
- **Print it on signage.** Put a 4x4 or 8x8 inch print of the QR code at your sale location with text like "Scan for online catalog" or "Browse our items"
- **Add to flyers.** Include it in printed ads or direct mail
- **Business cards.** Add a small QR code to your business cards with your sale link
- **Social media.** Share a screenshot in your Facebook/Instagram ads

**Sizing Tips**
- QR codes need to be at least 2 inches × 2 inches to scan reliably
- Print it large (4–8 inches) for high-traffic areas
- Make sure there's white space around it (don't crop it)
- Test it before printing (scan with your phone to make sure it works)

### Response Template

Hi [Name],

Great question! The QR code is a free tool to drive traffic to your sale.

Here's how to use it:
1. Go to your dashboard → [Sale Name] → Share → QR Code
2. Download the image
3. Print it (at least 4×4 inches) and post it at your sale location, on flyers, or on signage
4. Shoppers scan with their phone and land on your listing
5. You can see how many scans in your analytics

QR codes are especially useful if you have walk-in traffic — shoppers can browse before arriving or add items to their cart while they're there.

Let me know if you have questions!

– Patrick

### When to Escalate
- Organizer reports that QR code doesn't work when scanned (test it — may be sizing, printing quality, or a URL issue)
- QR code scan tracking shows no data (analytics bug)

---

## Issue #12: The AI Tag Suggestions Are Wrong — How Do I Turn Them Off?

**Applies to:** Organizers
**Severity:** Low
**Expected frequency:** 2–4 per week

### Problem Statement
An organizer is frustrated that the AI is suggesting incorrect tags or categories for their items (e.g., marking a chair as "Vintage" when it's modern, or suggesting the wrong category). They want to disable the suggestions or correct them.

### Likely Causes
1. **Photo is ambiguous.** The AI can't clearly see the item (bad lighting, multiple items in frame, poor angle).
2. **Item is unusual.** The AI was trained on common estate sale items but is misclassifying niche or rare items.
3. **Organizer feedback.** They gave feedback that the AI is learning from, but it hasn't improved yet.
4. **AI limitations.** The AI is working as designed but just isn't perfect.

### Resolution Steps

**Step 1: Explain That Suggestions Aren't Automatic**
- "Good news — AI suggestions are **optional**. You don't have to accept them. You can edit or dismiss them."
- When they add an item:
  - After ~15 seconds, the AI shows suggestions for category, condition, and tags
  - They can click **"Accept"** to apply them, or
  - Click **"Edit"** to change any before accepting, or
  - Click **"Dismiss"** to skip the AI and fill it in manually

**Step 2: Help Them Improve AI Suggestions**
- If they dismiss suggestions, ask: "Would you mind clicking 'I don't like these suggestions' and telling us why? That helps the AI learn."
- After enough feedback, the AI improves for similar items

**Step 3: Manual Override**
- They can **always** manually edit the category, condition, and tags after the AI suggests them
- Example: AI suggests "Vintage" but they know it's "Modern" → click Edit, remove "Vintage," add "Modern," save
- Or they can **dismiss the suggestions entirely** and fill in all fields manually

**Step 4: Disable AI (If Available)**
- Currently, AI suggestions are on by default
- If the organizer finds them consistently unhelpful, they can:
  - **Dismiss every suggestion** (takes 1 click per item)
  - Or contact support and request AI to be disabled on their account (Patrick can flip a setting)

### Response Template

Hi [Name],

The AI suggestions are completely optional! Here's how to handle them:

1. **Don't like a suggestion?** Click "Edit" and change it before accepting
2. **Want to skip AI entirely?** Click "Dismiss" and fill in the details manually
3. **Want to help the AI learn?** Click the thumbs-down and tell us what's wrong — we use that feedback to improve

You're in full control — the AI is just a shortcut to save you time if it works well.

If you'd prefer to turn it off completely, let me know and I can disable it on your account.

– Patrick

### When to Escalate
- AI is systematically suggesting wrong categories for a specific item type (e.g., all "Furniture" tagged as "Vintage")
- Organizer receives multiple incorrect suggestions despite feedback (AI quality issue)
- Organizer claims they gave feedback but the AI is still wrong (model retraining issue)

---

## Issue #13: How Do I Schedule Pickup Times?

**Applies to:** Organizers
**Severity:** Low
**Expected frequency:** 2–4 per week

### Problem Statement
An organizer wants to coordinate pickup schedules with buyers. They're wondering if there's a built-in scheduling system or if they should just rely on messaging.

### Likely Causes
1. **Feature not shipped yet.** Detailed pickup scheduling UI is on the roadmap but not in beta
2. **Organizer expecting too much automation.** They want an automated calendar; we handle it through messaging for now
3. **Confusion about process.** They don't understand the buyer-organizer coordination model

### Resolution Steps

**Current Process (Beta):**
- Pickup scheduling happens through **messages**
- Here's the flow:
  1. Buyer purchases an item
  2. Organizer messages the buyer: "Great! When would you like to pick up [Item]? I'm available [day/time options]."
  3. Buyer replies with their preferred time
  4. Organizer confirms and sends address/parking info
  5. Buyer arrives and picks up (or organizer ships if applicable)

**Best Practices for Organizing Pickups**
- Offer 3–4 time slots (e.g., "Friday 10-11am, 11am-12pm, 2-3pm, or Saturday 10-11am")
- Group pickups by buyer if possible (one buyer, multiple items = fewer trips)
- Confirm 24 hours before the scheduled time (message: "Just confirming you're still coming [day] at [time]")
- Include address, parking info, and a phone number for questions
- Have a cancellation policy (24-hour notice for reschedules)

**Future Enhancement (Roadmap)**
- "A calendar-based scheduling system is on our roadmap for later this year. For now, messaging works well and keeps things flexible if schedules change."

### Response Template

Hi [Name],

Great question! Right now, pickup coordination happens through the app's built-in messages.

Here's the process:
1. Once a buyer purchases, message them: "When works best for pickup? I'm available [day/time options]."
2. They reply with their preferred time
3. You confirm and send the address/parking details
4. They pick up at the agreed time

**Pro tip:** Offer 3–4 specific time slots and group pickups by buyer when possible. Always confirm 24 hours before.

We're planning to add a calendar-based scheduling system later this year to make this even smoother. For now, this flexibility is actually helpful in case someone needs to reschedule.

Questions?

– Patrick

### When to Escalate
- Organizer has a special requirement (e.g., "I need scheduling to integrate with my calendar app")
- Multiple organizers requesting calendar scheduling (route to CX for product feedback)

---

## Issue #14: I Don't See My Sale in Search Results

**Applies to:** Organizers
**Severity:** Medium
**Expected frequency:** 1–3 per week

### Problem Statement
An organizer published their sale, but when they search for it (or a shopper tries to find it), the sale doesn't appear in search results, even though it's visible in the map or home feed.

### Likely Causes
1. **Sale is too new.** Search indexing has a slight delay (~1–5 minutes).
2. **Sale title doesn't match the search term.** Organizer is searching for "Furniture Sale" but their title is "Estate Treasures."
3. **Search is location-filtered.** Shopper is searching in a different city or neighborhood filter is on.
4. **Sale is on hold or paused.** Status isn't actually "Published."
5. **Search index hasn't refreshed.** Backend cache or search engine hasn't picked up the update.

### Resolution Steps

**Step 1: Verify Sale Is Published and Recent**
- Ask: "Can you check your dashboard and confirm the sale status is 'Published'?"
- If **not published:** See Issue #2 (Can't publish sale)
- If **published:** Move to Step 2.

**Step 2: Test the Search**
- Ask: "What's the exact title of your sale?"
- Have them go to the home page search bar and type the full title
- **Should appear** within 1–5 minutes of publishing
- If it's been **>5 minutes** and still doesn't appear: Move to Step 3.

**Step 3: Check Search Filters**
- Ask: "When you searched, was there a location filter on? Try clearing any filters (neighborhood, price range, category) and search again."
- Some organizers forget that location filtering is on and think their sale isn't discoverable

**Step 4: Check Sale Visibility (Admin Only)**
- Log into admin dashboard → `/admin/sales`
- Search for the sale by name
- Confirm status is "PUBLISHED"
- If status is "DRAFT" or "PAUSED," that's the issue
- Contact the organizer to check why it's not published

**Step 5: Force a Search Reindex**
- If everything looks correct but search still fails:
  - Backend may need to reindex the search database
  - Patrick or dev can trigger this
  - Usually takes <5 minutes after reindex

### Response Template

Hi [Name],

Let me help you troubleshoot search visibility.

First:
1. Confirm your sale is **Published** (not Draft)
2. Go to the home page search and type your exact sale title
3. **Try without location filters** — sometimes filtering hides results

If it still doesn't show after 5 minutes, let me know and I can manually reindex it on my end.

What's your sale called?

– Patrick

### When to Escalate
- Sale is published but never appears in search after 24 hours (search indexing issue)
- Multiple sales fail to index (systemic search/database issue)
- Admin dashboard shows the sale as published but it doesn't appear in search (data sync issue)

---

## Issue #15: How Do I Clone a Sale from Last Year?

**Applies to:** Organizers
**Severity:** Low
**Expected frequency:** 0–2 per week during beta (increases seasonally)

### Problem Statement
An organizer ran a sale last year (or on a previous platform) and wants to quickly recreate it with similar items, descriptions, and photos to save time.

### Likely Causes
1. **Repeat organizer.** They've done estate sales before and want to reuse inventory lists.
2. **Feature not available yet.** Clone/duplicate feature isn't shipped in beta.
3. **Organizer looking for shortcuts.** They want faster sale setup.

### Resolution Steps

**Current State (Beta):**
- Sale cloning isn't built yet, but it's easy to manually recreate:
  1. Create a new sale (title, dates, address, photos)
  2. Go through the add-items flow again
  3. Use the AI tagging to speed up item suggestions (can reuse similar item types)

**Workaround: Bulk Item Templates**
- If they have an old list (spreadsheet, notes), they can:
  1. Export or copy the old item names and descriptions
  2. Use those as templates in the add-items form
  3. Update prices as needed
  4. Reuse photos if the items are the same

**Future Enhancement (Roadmap)**
- "Sale cloning is on our roadmap for Q3. For now, the AI tagging shortcut makes it faster than you'd think — most organizers can re-add their inventory in 1–2 hours."

**Alternative: Archive/Reuse Items**
- "If you want to track items across sales, save a spreadsheet of your inventory. The AI can help categorize new items faster each time you run a sale."

### Response Template

Hi [Name],

Great thinking! Sale cloning would definitely speed things up. It's on our roadmap for later this year.

For now, here's the fastest path:
1. Create a new sale (title, dates, address)
2. Go through add-items — the AI will auto-suggest category, condition, and tags based on item photos
3. Most organizers can re-add a familiar inventory in 1–2 hours with AI help

**Pro tip:** If you have an old spreadsheet of your items, copy the names and descriptions into the form — saves you from typing from scratch.

This really does get faster after your first sale!

– Patrick

### When to Escalate
- Multiple organizers request cloning feature (route to CX for product feedback)
- Organizer has legitimate need for historical data migration (rare case — offer manual support)

---

## Issue #16: How Do Coupon Codes Work?

**Applies to:** Shoppers
**Severity:** Low
**Expected frequency:** 3–8 per week (beta launch phase)

### Problem Statement
A shopper earned a coupon code after their first purchase and wants to know how to use it at checkout, or they have questions about when/how coupons can be redeemed.

### Likely Causes
1. **First-time coupon experience.** This is the Shopper Loyalty Program launch — many will be using coupons for the first time.
2. **Coupon not visible.** The email with their code arrived but they didn't notice it, or it went to spam.
3. **Timing confusion.** They want to know if they can stack coupons or when they expire.
4. **Code entry confusion.** They're unsure where to enter the code in the checkout flow.

### Resolution Steps

**Step 1: Confirm Shopper Has a Coupon**
- Ask: "Did you receive an email from rewards@finda.sale after your purchase? It should say 'You've earned a $5 coupon!' with a code inside."
- If **email not received:** Check spam/promotions folder, or have them go to `/shopper/purchases` and look for the "My Coupons" section (codes display there too).
- If **no coupons appear:** They may not have a completed purchase yet. Coupons are issued only after a successful transaction.

**Step 2: Explain the Coupon Code**
- "Your coupon is a unique 8-character code (like A3F2C891). It's worth **$5 off your next purchase** and is valid for **90 days** from when you earned it."
- "You can use it once — after redemption, it's marked as used and can't be reused."
- "There's no minimum purchase required — it will apply to any order, even small items."

**Step 3: Show How to Redeem**
- "When you're ready to buy something new on FindA.Sale, add it to your cart and go to checkout."
- "Before you pay, you'll see a field that says 'Have a coupon code?' — paste or type your code there."
- "Click 'Continue to Pay' and the discount will be applied to your total."
- "Your final price will show on the payment screen."

**Step 4: Verify the Code Is Valid**
- If they say the code **didn't work**, ask:
  - "Did you type it in uppercase? Codes are all caps (e.g., A3F2C891)."
  - "What error message did you see?" (Tell me the exact text so I can diagnose.)
  - "Have you already used this coupon on a different purchase?" (If yes, explain it's now expired.)
  - "Is the expiration date still valid?" (They can see it in the email or on `/shopper/purchases` under "My Coupons.")

### Response Template

Hi [Name],

Thanks for asking! Here's how your coupon works:

**Your code is:** [CODE] (from your purchase confirmation email)

**How to use it:**
1. Shop and add an item to your cart
2. Go to checkout
3. Paste your code in the "Have a coupon code?" field
4. Click "Continue to Pay" — the discount applies automatically

**Key details:**
- **Worth:** $5 off your next purchase
- **Expires:** [DATE] (90 days from when you earned it)
- **One-time use:** After you redeem it, it's consumed and can't be used again
- **No minimum:** Works on any purchase, any amount

You can view all your active coupons anytime at /shopper/purchases under "My Coupons."

Happy shopping!

– Patrick

### When to Escalate
- Shopper claims they received a coupon email but the code isn't working AND isn't expired (potential data sync issue)
- Shopper says the same coupon code was charged twice (duplicate redemption — route to dev)
- Code validation fails with an error message (backend issue, route to dev with the exact error text)

---

## Issue #17: How Do I Create a Coupon for My Sale?

**Applies to:** Organizers
**Severity:** Low
**Expected frequency:** 2–5 per week (beta + ongoing)

### Problem Statement
An organizer wants to issue discount coupons to attract buyers or as part of a promotion (e.g., "10% off for first 10 shoppers," or "loyalty coupon for repeat customers").

### Likely Causes
1. **Not yet implemented.** Organizer-created coupons aren't in beta launch; only loyalty coupons (issued by the system) are active.
2. **Product roadmap confusion.** Organizer wants custom coupon creation but feature isn't shipped.
3. **Promotional strategy.** They want a tool to drive sales during their event.

### Resolution Steps

**Current State (Beta):**
- **Organizer-created coupons are not available in beta.** Only shoppers receive automatic $5 loyalty coupons after each purchase.
- Coupons are managed by FindA.Sale (not organizers) to keep redemption simple and fair.

**Why This Design:**
- "We issue coupons automatically to reward repeat shoppers. This keeps your buyer base growing without requiring you to manage discount codes."
- "Every completed purchase earns a $5 coupon — it's built into the loyalty program to encourage repeat sales."

**Workaround: Pricing Strategy**
- If an organizer wants to offer discounts, they can:
  1. **Lower item prices directly** for a sale (no coupon needed — price change is immediate)
  2. **Run bundle deals** — list multiple items and price them as a package
  3. **Time-limited sales** — announce "opening day specials" at lower prices

**Future Enhancement (Product Roadmap):**
- "Organizer-managed coupons are on our roadmap for Q3 2026. Early feedback suggests this would be valuable, so we're prioritizing it."

### Response Template

Hi [Name],

Thanks for the question! Here's the current state of coupons:

**Beta Phase:** Coupons are automatic and shopper-focused. Every time someone makes a purchase, they get a **$5 off coupon** for their next buy — this rewards loyal customers and brings them back.

**You can't create custom coupons yet,** but this is on our roadmap for later this year.

**In the meantime, to drive sales on your sale:**
- Lower item prices directly (price changes show immediately)
- Create bundle deals (combine multiple items at a special price)
- Announce opening-day specials or time-limited deals in your sale description

The loyalty coupon system is designed to handle the discount mechanics for you — it's one less thing to manage!

Let me know if you'd like tips on pricing strategy or promotions.

– Patrick

### When to Escalate
- Multiple organizers request coupon creation (high-signal feature request — pass to Product)
- Organizer insists they have permission to create coupons (clarify and document that it's not available in beta)
- Organizer wants to retroactively issue refunds as coupons (edge case — discuss with Patrick)

---

## Issue #18: Why Isn't My Coupon Code Working?

**Applies to:** Shoppers
**Severity:** Medium
**Expected frequency:** 2–4 per week

### Problem Statement
A shopper entered a coupon code at checkout, but it was rejected with an error message, or the discount didn't apply.

### Likely Causes
1. **Code is expired.** 90-day window has passed since the coupon was issued.
2. **Code already redeemed.** Shopper used it once before and tried to use it again (one-time use only).
3. **Code typo.** Shopper mistyped or copied the code incorrectly.
4. **Minimum purchase not met.** (If applicable — though standard loyalty coupons have no minimum.)
5. **Code belongs to a different account.** Shopper tried to use someone else's coupon.
6. **Trailing spaces in entry.** Whitespace before/after code prevents validation.

### Resolution Steps

**Step 1: Verify the Code Format**
- Ask: "What's the exact error message you saw?"
- Codes should be 8 characters, all uppercase, no spaces (e.g., A3F2C891)
- Have them check their email for the code and read it back to confirm

**Step 2: Check Expiration**
- Ask: "When did you earn this coupon?" (They can find the date in the email or on `/shopper/purchases` under "My Coupons")
- Calculate: Coupons expire **90 days** from the issue date.
- If **expired:** "Unfortunately, this code expired on [DATE]. But here's the good news — your next purchase will earn you a fresh $5 coupon that's good for another 90 days!"

**Step 3: Check if Already Used**
- Ask: "Have you used this code on a previous purchase?"
- Explain: "Each coupon is one-time use. Once redeemed, it can't be used again."
- If **already used:** "You got another coupon from that purchase, though! Check your email for a new code, or go to `/shopper/purchases` and look under 'My Coupons.'"

**Step 4: Verify Ownership**
- Ask: "Did you earn this coupon from your own purchase, or did someone else give it to you?"
- Explain: "Coupons are tied to the account that earned them. You can only use coupons on the same account."
- If **someone gave them the code:** "Unfortunately, you'll need to use your own coupons. But your next purchase will earn you one!"

**Step 5: Re-enter the Code Carefully**
- Have them:
  1. Copy the code directly from the email (avoid typing manually)
  2. Paste it into the coupon field
  3. Check for leading/trailing spaces and delete them
  4. Try checkout again

**Step 6: If Still Failing**
- Ask: "What's the exact error message?" and share it with me
- If it's a backend validation error (5xx), escalate to dev

### Response Template

Hi [Name],

Let me help you troubleshoot that coupon code.

Can you tell me:
1. **What's the error message you're seeing?** (Copy the exact text if you can)
2. **When did you earn this coupon?** (Check the email or `/shopper/purchases`)
3. **Have you used this code before on a different purchase?**

Most coupon issues are caused by:
- **Expired codes** (they're valid for 90 days)
- **Already redeemed** (one-time use — after you use it once, it's gone but your next purchase earns a new one)
- **Typos or copy/paste errors** (try pasting directly from the email instead of typing)

Reply with those details and we'll get you sorted!

– Patrick

### When to Escalate
- Error message is a server error (5xx code) or unclear backend issue → route to dev
- Shopper claims code is not expired and not used, but validation still fails → potential data corruption
- Multiple shoppers report the same code failing → systemic coupon validation issue

---

## Issue #19: Can a Coupon Be Used More Than Once?

**Applies to:** Shoppers (and Organizers asking about loyalty mechanics)
**Severity:** Low
**Expected frequency:** 1–2 per week

### Problem Statement
A shopper wants to know if they can use the same coupon code on multiple purchases, or they're confused about one-time-use policy.

### Likely Causes
1. **Expectation mismatch.** Shopper assumed coupons work like recurring discounts (e.g., subscription benefits).
2. **Misunderstanding the loyalty model.** They don't realize that *each purchase* earns a *new* coupon.
3. **Desire for unlimited discounts.** They want to maximize savings and are looking for loopholes.

### Resolution Steps

**Step 1: Clarify the One-Time Use Policy**
- "Each coupon code is a **single-use token**. Once you redeem it at checkout, it's marked as 'used' and can't be applied to another purchase."
- "This is how we prevent fraud and keep the program fair for everyone."

**Step 2: Explain the Loyalty Loop**
- "But here's the good news: **the coupon system is designed so that every purchase earns you a new coupon.**"
- "Buy item A → get coupon A ($5 off). Use coupon A to buy item B → get coupon B ($5 off). Use coupon B to buy item C → and so on."
- "Shoppers who buy frequently unlock a continuous stream of discounts."

**Step 3: Show the Math**
- "If you buy 5 items, you'll earn 5 coupons worth $5 each = $25 in total discounts on future purchases."
- "This is our way of saying thanks for coming back!"

**Step 4: Clarify They Can't Share**
- "You can't give your coupon to a friend or family member — each code is tied to the account that earned it."
- "But they can earn their own coupons by making their first purchase!"

### Response Template

Hi [Name],

Great question! Here's how it works:

**One coupon = one purchase.** Once you use a code at checkout, it's retired and can't be reused.

**BUT** — the loyalty program keeps giving:
1. You buy something → earn a $5 coupon
2. Use that coupon on your next buy → earn another $5 coupon
3. Use that one → earn another...
4. Keep shopping, keep earning

**The more you shop, the more you save.** If you buy 5 items, you'll have unlocked $25 in discounts.

**Also:** Coupons are personal to your account — you can't transfer them to friends. But your friends can earn their own by making their first purchase!

Happy shopping!

– Patrick

### When to Escalate
- Shopper insists the system should allow coupon reuse (document as product feedback)
- Shopper claims they somehow used the same code twice (potential data integrity issue — route to dev)
- Shopper asks if organizers can manually override one-time-use policy (clarify that they can't; only Patrick/ops can)

---

## Issue #20: Why Does My Sale Show the Wrong Location?

**Applies to:** Organizers
**Severity:** Low
**Expected frequency:** 0–2 per week

### Problem Statement
An organizer filled in their sale address correctly, but the app displays a different city or region name in the header, search filters, or sale preview. For example, it shows "Grand Rapids, MI" when they're in a different city.

### Likely Causes
1. **Region configuration mismatch.** The app is configured for a specific region via environment variables, and it's defaulting to the configured location instead of using the entered address.
2. **Address lookup failed.** Geocoding didn't associate their street address with the correct city/state.
3. **Display vs. stored address.** Their actual address is stored correctly, but the UI is showing a hardcoded default region.
4. **Beta deployment region issue.** App was deployed with Grand Rapids as the default region, and it's not pulling their custom entry.

### Resolution Steps

**Step 1: Check Their Entered Address**
- Ask: "In your sale details, what address did you enter? Can you read back the city and state?"
- They should see *their* city/state next to the address field after they enter it.

**Step 2: Clarify Address vs. Display Region**
- "There's a difference between your **sale address** (which you control) and the **app's default region** (which we set for the beta)."
- "What's your sale address? And what region is showing in the sale preview?"

**Step 3: Explain the Backend Config**
- "The app is currently configured to default to Grand Rapids, MI for the beta. Your address is stored correctly in the system, but the **UI header and search filters** might default to that region if the address lookup isn't complete."
- "However, shoppers searching for your sale by address *will* find it at the correct location."

**Step 4: Verify Search Still Works**
- Have them:
  1. Log out and go to the public search/home page
  2. Search for their sale by name
  3. Confirm the address shown in the result matches their actual address
- If **search result is correct:** The address is stored right; the header display is a UI glitch. Escalate to dev.
- If **search result is wrong:** Geocoding or address storage failed. Escalate to dev with the address and what's showing instead.

**Step 5: Temporary Workaround**
- "Until we fix the display, your sale is searchable by your actual address. Shoppers in your area will find you. The location name in the header is just a visual default — your real address is what drives discovery."

### Response Template

Hi [Name],

Thanks for flagging that. Let me help you sort this out.

The app is currently set to a default region for the beta, but your sale should still display correctly based on the address you entered.

Can you tell me:
1. **What address did you enter for your sale?** (Street, city, state)
2. **What location is showing in the app header or preview?**
3. **When you search for your sale from the home page, does the address match what you entered?**

This will help me figure out if it's a display-only issue (UI glitch) or an address storage problem.

– Patrick

### When to Escalate
- Entered address is correct, but search results show the wrong city/state (geocoding or address storage failure)
- Organizer's address is being overridden by the default region everywhere (hardcoded region not using stored data — code bug)
- Multiple organizers report location showing wrong region (systemic region config issue — route to dev)
- Entered address is being truncated or altered (address parsing issue)

**Note for Internal:** Location/region is controlled by environment variables in `packages/backend/src/config/regionConfig.ts`. Default region is set via `DEFAULT_CITY`, `DEFAULT_STATE`, `DEFAULT_STATE_ABBREV`, etc. If shoppers/organizers in a different region report wrong location after multi-region deployment, check that env vars were set correctly at deploy time.

---

## Issue #21: How Do Coupon Codes Work?

**Applies to:** Shoppers
**Severity:** Medium
**Expected frequency:** 2–5 per week (new shopper question)

### Problem Statement
A shopper received a coupon after their first purchase, sees it in their account, and wants to know how to use it at checkout.

### Explanation
When a shopper completes a purchase on FindA.Sale, they automatically receive a $5 discount coupon code via email. That code can be applied to their next purchase to save $5. Coupons expire 90 days after they're issued.

### Steps to Apply a Coupon at Checkout

1. **Browse and select an item** to purchase on FindA.Sale.
2. **Click "Buy Now"** (or the purchase button for that item).
3. **A checkout modal will appear.** At the top, you'll see a field labeled **"Have a coupon code?"**
4. **Enter the 8-character code** (it will look like `A3F2C891`). The app will automatically capitalize it.
5. **Click "Continue to Pay"** to proceed to payment.
6. **The discount will show in the price breakdown** as "🎟️ Coupon discount" with the $5 amount deducted.
7. **Complete the payment** with your card. Your coupon is now used and can't be used again.

### Response Template

Hi [Name],

Great question. Here's how to use your coupon:

1. When you're ready to buy something, click **"Buy Now"** on an item.
2. In the checkout window, you'll see a field for **"Have a coupon code?"** — that's where you paste your code (e.g., `A3F2C891`).
3. Click **"Continue to Pay"** and you'll see your $5 discount applied to the total.
4. That's it! Once you complete the payment, the coupon is used.

Each coupon is good for one purchase and expires 90 days after you earn it. You'll see the expiration date in your account.

– Patrick

### When to Escalate
- Shopper says they entered the code but no discount appeared (check: is the coupon expired? Has it already been used? Does it belong to that user's account?)
- Shopper says the code is invalid and they're sure they copied it right (coupon lookup failure — route to dev)
- Shopper received multiple coupons and can't tell which is which (UX issue — they should all be listed with expiration dates)

---

## Issue #22: How Do I Create a Discount Coupon for My Sale?

**Applies to:** Organizers
**Severity:** Low
**Expected frequency:** 0–2 per week (organizer request)

### Problem Statement
An organizer is asking how they can create custom coupon codes or discount offers for *their* sales to attract buyers.

### Explanation
Coupon codes in Sprint 3 are issued *automatically* by the system to shoppers after they make a purchase. Organizers cannot create custom coupons themselves. This is part of the loyalty program — shoppers get rewarded for buying, and then use those rewards on their next purchase.

If an organizer wants to run a **sale-wide discount** or promotional offer, that would need to be a feature request for a future sprint. Currently, pricing is set per item and is fixed.

### Resolution Steps

1. **Clarify the feature gap.** "Right now, coupons are automatic rewards we send to shoppers after they buy something. Organizers can't create custom codes."
2. **Explain the loyalty program.** "When someone buys from your sale, they get a $5 coupon code to use on their next purchase here. That's part of how we keep shoppers coming back."
3. **Explore what they actually want to do.** "What discount or promotion are you trying to run? Is it a limited-time sale, a bulk discount, or something else? That feedback helps us prioritize new features."
4. **Route feedback to CX.** If they have a concrete use case, note it and pass it to findasale-cx for product consideration.

### Response Template

Hi [Name],

Good thinking. Right now, coupons are automatically generated by our system — shoppers get a $5 coupon after each purchase, which they can use on their next order.

Organizers don't have the ability to create custom coupons yet, but I understand why that would be useful. If you're looking to run a **promotion or discount** for your sale, I'd love to hear more about what you're trying to achieve. That feedback goes directly to our product team and helps us prioritize new features.

Tell me more about your idea, and I'll pass it along.

– Patrick

### When to Escalate
- Organizer needs a discount feature urgently (route to findasale-cx for product roadmap discussion; assess if it should be a sprint priority)
- Multiple organizers request custom coupon creation (pattern detected — escalate to findasale-cx for feedback triage)

---

## Issue #23: Why Isn't My Coupon Code Working?

**Applies to:** Shoppers
**Severity:** High
**Expected frequency:** 1–3 per week (redemption failures)

### Problem Statement
A shopper entered their coupon code at checkout, but received an error message and the discount didn't apply.

### Likely Causes
1. **Code is expired.** The coupon was issued 90+ days ago and is no longer valid.
2. **Code was already used.** Each coupon can only be used once. Once redeemed, it's marked as used.
3. **Code was entered incorrectly.** Typo, wrong characters, or case sensitivity issue (though the app auto-capitalizes).
4. **Code doesn't belong to the user.** They're trying to use someone else's coupon or a code from a different account.
5. **Minimum order amount not met.** Some future coupon types may have order minimums (current Sprint 3 coupons do not, but check the error message).
6. **System glitch during validation.** Payment processing error on the backend.

### Resolution Steps

**Step 1: Check the Error Message**
- Ask: "What error message did you see?"
- Common messages:
  - **"Coupon has expired"** → Coupon is past its 90-day expiration.
  - **"This coupon has already been used"** → Already redeemed; can't use twice.
  - **"Coupon not found"** → Code wasn't recognized (typo or doesn't exist).
  - **"This coupon does not belong to your account"** → They're using someone else's code.
  - **"Minimum purchase of $X required"** → Order total is too low (current coupons don't have minimums; if this appears, note it).

**Step 2: Verify Code Ownership**
- Ask: "Did you receive that coupon code in an email from us after a previous purchase?"
- If **yes:** It should be valid (unless expired or already used).
- If **no:** They may have a code that doesn't belong to them. Don't use it.

**Step 3: Check Expiration**
- Ask: "When did you receive the email with the code?"
- Coupons are valid for **90 days from issue date.**
- If more than 90 days have passed, it's expired and can't be recovered. Apologize and suggest they make another purchase to earn a new coupon.

**Step 4: Check If Already Used**
- Ask: "Have you used this code before on a previous purchase?"
- If **yes, they can't use it again.** Each code is one-time only. They'll need to earn a new coupon with their next purchase.
- If **no:** It may be a system glitch. Have them try again, or proceed without the coupon and escalate.

**Step 5: Confirm Code Entry**
- Ask: "Can you read the code back to me exactly as it appears in your email?"
- They'll paste or type it. The app should auto-capitalize, but check for spaces or typos.
- If they're unsure, have them **copy directly from the email** and paste it into the field.

**Step 6: Offer a Workaround**
- If the code is valid but the system is rejecting it (step 4, no on all checks), say: "Let's try this purchase without the coupon. I'll follow up with our team and we can manually apply the discount if needed."
- Process the purchase; escalate to dev for the validation failure.

### Response Template

Hi [Name],

Sorry the coupon didn't work. Let me help you figure out what happened.

Can you tell me:
1. **What's the error message you saw?** (e.g., "coupon expired", "already used", etc.)
2. **When did you receive that coupon code?** (Look for the email from us after your purchase.)
3. **Is this your first time trying to use it, or have you used it before?**

Once I know those details, I can let you know if the code is still good or if we need to issue you a new one.

– Patrick

### Common Responses by Error

**"Coupon has expired"**
Unfortunately, coupons are only valid for 90 days. Since yours has expired, it can't be used. The good news is you can **earn another $5 coupon** by making a new purchase on FindA.Sale. Sorry about that!

**"Already been used"**
That code can only be redeemed once, and it looks like you already used it for a previous purchase. When you complete a purchase now, you'll earn a brand new $5 coupon code for your next order.

**"Coupon not found" / "Does not belong to your account"**
That code either doesn't exist or doesn't belong to your account. Make sure you're using a code from an email we sent you after one of your purchases. If you're not sure which code is yours, let me know and I can help track it down.

### When to Escalate
- Shopper swears they didn't use the code, code is not expired, but system says "already used" (possible data corruption or double-redemption bug — route to dev with coupon ID)
- Error message doesn't match any of the above (system validation failure — escalate with full error, code, user ID, and timestamp)
- Multiple shoppers report the same coupon code not working (systemic issue — route to findasale-qa)
- Shopper lost the coupon email and wants it resent (feature gap: coupons should be visible in account; for now, ask them to check spam, then manually resend if needed)

---

## Issue #24: Can a Coupon Be Used More Than Once?

**Applies to:** Shoppers
**Severity:** Low
**Expected frequency:** 0–2 per week (policy clarification)

### Problem Statement
A shopper asks if they can use the same coupon code for multiple purchases, or if it's one-time only.

### Policy
Each coupon code can be used **exactly once.** After a shopper redeems a coupon at checkout and completes the payment, that code is marked as used and cannot be used again.

However, shoppers earn a new $5 coupon after *each* purchase, so they'll always have fresh coupons available as they continue buying.

### Response Template

Hi [Name],

Great question. Each coupon code is good for **one purchase only.** Once you use it at checkout, that code is used up and can't be applied again.

The good news is you earn a **new $5 coupon after every purchase** you make. So the more you buy, the more coupons you'll have to use on future orders.

Happy hunting for deals!

– Patrick

---

## Issue #25: Why Does the Sale Location Show a Different City?

**Applies to:** Organizers
**Severity:** Low
**Expected frequency:** 0–2 per week

### Problem Statement
An organizer entered a correct address for their sale, but the app displays a different city or region name in the header, filters, or sale preview. For example, they're in a different Michigan city, but it shows "Grand Rapids, MI."

### Root Cause
During beta, the app defaults to displaying **Grand Rapids, MI** as the region in headers and filters. This is set via the `REGION_NAME` environment variable on the backend. However, the organizer's actual address is stored correctly in the system, and **shoppers will find the sale using the correct address.**

This is a **display-only issue** — it doesn't affect search accuracy or shopper ability to find the sale.

### Resolution Steps

**Step 1: Confirm Their Actual Address is Stored**
- Ask: "What address did you enter for your sale?"
- Check the backend or database to confirm the address was saved correctly.

**Step 2: Explain the Region vs. Address Distinction**
- "The **address you entered** is stored correctly. The **region name** that shows in the app header (like 'Grand Rapids, MI') is a default setting for the beta."
- "They're separate things. Your actual address is what shoppers search for and use to find your sale."

**Step 3: Verify Search Works With Correct Address**
- Have them:
  1. Log out of the organizer account.
  2. Go to the public search/home page.
  3. Search for their sale by name.
  4. Confirm the address shown in the result matches what they entered.
- If search address is correct: The stored address is fine; the header display is cosmetic. No action needed (this is expected for beta).
- If search address is wrong: Geocoding or address validation failed. Escalate to dev.

**Step 4: Reassure Them**
- "Your sale is discoverable by the correct address. Shoppers in your area will find you. The location displayed in the header is just a beta default — it won't affect your visibility."

### Response Template

Hi [Name],

Good catch. Let me explain what you're seeing.

We set a **default region name** for the beta to keep things simple, but that doesn't affect where your sale actually shows up. Your **address is stored correctly**, and shoppers will find your sale using that address.

To verify:
1. Log out and go to the FindA.Sale home page.
2. Search for your sale by name.
3. Check if the address in the result matches what you entered.

If it does, you're all set — shoppers in your area will find you just fine. The region name in the header is just a display setting.

Can you try that search and let me know what address shows up?

– Patrick

### Technical Note (for Patrick/Dev)
The region name that displays across the app is controlled by the `REGION_NAME` environment variable in the backend config. During beta, it defaults to **"Grand Rapids, MI"** because the initial deployment was scoped to that region. Organizers' addresses are stored separately in the database and are accurate. Once we expand to other regions, the `REGION_NAME` env var should be set to reflect the actual deployment region at deploy time. If you see a pattern of organizers in different regions reporting this, it indicates the env var wasn't updated during deployment to a new region.

---

## Summary & Handoff

This KB covers the most likely support issues in beta, including the new Sprint 3 coupon features. **Next steps:**

1. **Update this document as new issues emerge.** If the same question comes in twice, it belongs here.
2. **Monitor patterns.** If 3+ users report the same issue, flag it to the CX/Product team.
3. **Escalation is clear.** Each entry specifies when to escalate and to whom.
4. **Tone is consistent.** All responses follow the support voice: empathetic, plain English, actionable, honest.

**Patrick:** You're the primary responder. Use these templates and steps as guides, but personalize responses to each user. Include their names, sale names, and dollar amounts where relevant. Every response should leave them confident about what comes next.

---

**Last Updated:** 2026-03-07 (Sprint 3 coupons added)
**Next Review:** After first 100 support tickets or 1 week, whichever comes first
