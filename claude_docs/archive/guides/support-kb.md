# FindA.Sale Support Knowledge Base

**Version:** 1.0
**Last Updated:** 2026-03-06
**Audience:** Beta support team
**Product:** Estate sale PWA (Grand Rapids MVP, pre-launch)
**Status:** Pre-beta bootstrap — expect evolving issues as organizers and shoppers onboard

---

## Account & Login

### Can't Log In / Forgot Password

**Symptoms:**
- User cannot access account with email + password
- "Invalid credentials" error repeated
- User locked out after 5 failed attempts

**Diagnosis:**
1. Check if user has an account in the system (can they see reset email?)
2. Confirm email address is correct (typos are common)
3. Verify Neon database is responding (backend logs at `backend-production-153c9.up.railway.app/logs`)
4. Check if user's JWT session expired (should auto-redirect to login)

**Resolution:**
1. Tell user to click "Forgot Password?" on the login page
2. User should receive password reset link from `support@finda.sale` within 2 minutes
3. If no email arrives:
   - Check spam/junk folder
   - Verify the email address they signed up with
   - Ask them to try again (Resend email service sometimes slow on first attempt)
4. If reset link expires (24-hour window), they can request a new one
5. After reset, they should be able to log in normally

**Escalation:**
- If password reset email never arrives after 3 attempts: check Resend email service logs (backend team)
- If user is locked after 5 failed attempts: need backend dev to clear rate limiter or reset directly in Neon via Prisma

---

### Google / Facebook OAuth Not Working

**Symptoms:**
- User clicks "Sign in with Google" or "Sign in with Facebook"
- Gets redirected to OAuth provider, approves, then:
  - Blank screen or error page
  - "Redirect URI mismatch" error
  - Redirects back to login with no change

**Diagnosis:**
1. Confirm OAuth credentials are set in Vercel (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FACEBOOK_CLIENT_ID, FACEBOOK_CLIENT_SECRET)
2. Verify redirect URIs match in OAuth provider dashboards:
   - Google: `https://finda.sale/api/auth/callback/google`
   - Facebook: `https://finda.sale/api/auth/callback/facebook`
3. Check if user already has an account with that email (OAuth tries to link)
4. Clear browser cookies and try incognito mode

**Resolution:**
1. Ask user to clear cookies for finda.sale and try again
2. Suggest using incognito/private mode to rule out cached credentials
3. If error persists, ask them to provide the exact error message they see
4. Direct them to use email + password login as fallback while OAuth is being fixed

**Escalation:**
- If redirect URI mismatch: backend dev needs to verify OAuth config in Vercel and OAuth provider dashboards
- If OAuth works for some users but not others: likely a user-specific issue (existing account, email conflict) — check authController logs
- If OAuth is completely broken: verify Google Cloud / Meta app credentials haven't been revoked

---

### Invite Code Invalid or Expired

**Symptoms:**
- User enters beta invite code and gets "Invalid code" error
- "Code expired" message
- Code was working yesterday, doesn't work today

**Diagnosis:**
1. Verify the code format (should be alphanumeric, no spaces)
2. Check if code has been redeemed already (can only be used once per user)
3. Confirm code hasn't expired (default: 7-day window from creation)
4. Verify user's email is NOT already registered (can't register twice)
5. Check if inviter's account is still active (suspended inviter = no new redeems)

**Resolution:**
1. Ask user to copy/paste the code exactly (no extra spaces)
2. If they typed it manually, ask them to try again with fresh code from email/link
3. If code expired: ask inviter to generate a new one in organizer dashboard (Admin → Generate Invite Codes)
4. If user already has an account: they don't need a code; just log in
5. Confirm they're entering code during signup flow, not post-registration

**Escalation:**
- If valid code still shows as expired: backend dev to check invite record in Neon (check `inviteCode.expiresAt` vs current timestamp)
- If code works once but won't let second user use same code: expected behavior (one code = one redemption, need new code for next user)
- If inviter reports codes won't generate: check `/api/invites/generate` endpoint permissions in authController

---

## Payments & Purchases

### Payment Failed / Card Declined

**Symptoms:**
- "Payment declined" error at checkout
- "Your card was declined" with no retry option
- Stripe error code appears (e.g., card_declined, insufficient_funds)

**Diagnosis:**
1. Check Stripe error code in the message (tells you the root cause)
2. Verify minimum purchase amount is met ($0.50 minimum)
3. Confirm card has sufficient funds and CVV is correct
4. Check if 3D Secure / 2FA is required (some cards/banks)
5. Verify card is not blocked by issuer or user's bank
6. Confirm organizer's Stripe Connect account is active (required to process payments)

**Resolution:**
1. Ask user to try these steps in order:
   - Try a different payment method (different card or e-wallet)
   - Verify card details: number, expiry, CVV, zip code
   - Contact their bank — some decline online purchases by default
   - If 3D Secure is required, complete the verification in the popup
   - Try again in incognito mode (rules out stuck session)
2. Specific Stripe codes:
   - **card_declined**: Card issuer declined. User must contact bank.
   - **insufficient_funds**: Insufficient balance. Try different card.
   - **expired_card**: Card expired. Update with new card.
   - **processing_error**: Temporary Stripe issue. Try again in 10 minutes.

**Escalation:**
- If organizer's account shows as inactive: backend dev to verify Stripe Connect onboarding is complete
- If shopper reports multiple cards all declined: likely shopper's bank blocking Stripe. Ask them to contact their bank.
- If payment declines on a small purchase but shows as $0 minimum error: backend bug in price validation — escalate to dev

---

### Item Shows as Purchased But No Confirmation Email

**Symptoms:**
- Item inventory shows "Sold" or "On Hold"
- User doesn't see order in their purchase history
- No confirmation email arrived

**Diagnosis:**
1. Check if purchase actually completed (look in user's account → My Purchases / Order History)
2. Verify payment succeeded (check Stripe dashboard for charge)
3. Confirm organizer received the sale (check their pending orders)
4. Check if confirmation email was sent (Resend service logs)
5. Verify user's email is correct and not bouncing

**Resolution:**
1. Ask user to refresh the page and check My Purchases tab
2. If purchase appears in My Purchases: confirmation is just delayed, check email in 10 minutes
3. If purchase does NOT appear:
   - Verify the item still shows as Sold/On Hold (if back to Available, something rolled back)
   - Ask: "Did you see a success page after you completed payment?" If no, payment may have been declined silently
   - Check their email for Stripe receipt (even if FindA.Sale email delayed)
4. If purchase is confirmed but email missing:
   - Check spam folder
   - Resend confirmation button available in purchase detail (if we add later)
   - Manually email user order summary from support

**Escalation:**
- If payment shows in Stripe but item not marked as purchased: backend bug in `purchaseController` or concurrent purchase guard — escalate to dev
- If organizer didn't receive notification: backend webhook event (`payment.intent.succeeded`) didn't trigger or email service failed
- If multiple users report missing emails: Resend service issue — check Resend logs and retry batch

---

### Organizer Hasn't Received Payout

**Symptoms:**
- Organizer made sales 5+ days ago but balance shows $0
- Expected payout didn't appear in their bank account
- "Pending balance" vs "Available balance" confusion

**Diagnosis:**
1. Verify sales actually completed (check sale detail page for completed items)
2. Confirm Stripe Connect account is fully onboarded (check Connect dashboard)
3. Check payout schedule (instant vs standard) and account balance in Stripe
4. Verify organizer didn't reverse the payout or have a failed ACH attempt
5. Confirm 5% platform fee was deducted from each sale
6. Check if organizer's bank is processing ACH slowly (2-3 days common)

**Resolution:**
1. Direct organizer to Stripe Connect dashboard (linked from organizer settings):
   - Check "Balance" section → "Available" balance should show pending payouts
   - Check "Payouts" section to see payout history and status
2. Walk them through:
   - Instant payouts (chosen at onboarding) should arrive within 30 minutes
   - Standard payouts arrive next business day
   - Failed ACH attempts will show as "Declined" — need to verify bank details
3. Clarify fee structure:
   - Regular sales: 5% platform fee deducted from sale price
   - Auction sales: 7% platform fee deducted from hammer price
   - Example: $100 item = $95 to organizer (5% fee taken out)
4. If balance shows correctly but bank hasn't received: wait 1-3 more days for ACH processing

**Escalation:**
- If sales completed but balance still shows $0 after 24 hours: backend dev to verify `payout` webhook (`payout.created`) fired and balance calculation in stripeService
- If organizer sees "Delayed" payout: Stripe Connect issue — escalate to Stripe support via backend team
- If organizer's bank account shows as invalid: they need to update it in Stripe Connect dashboard; if it won't update, escalate to Stripe

---

### Refund Request

**Symptoms:**
- Shopper wants refund for purchased item
- Organizer wants to refund a shopper
- Partial refund requested

**Diagnosis:**
1. Verify purchase was completed (not just "on hold")
2. Check if item was picked up/delivered already
3. Confirm refund reason (buyer's remorse, wrong item, damaged, etc.)
4. Verify 30-day refund window hasn't expired (if policy exists)

**Resolution:**
1. **For shopper requesting refund:**
   - Check if item has been picked up (if yes, will need organizer approval)
   - If not picked up: enable self-service refund button in purchase detail (if available)
   - If not available: support team to contact organizer for approval
2. **For organizer issuing refund:**
   - Organizer goes to Order detail → Refund button
   - Enter refund amount (full or partial)
   - System automatically issues refund to shopper's original payment method via Stripe
   - Refund appears in shopper's account in 3-5 business days
3. **For partial refunds:**
   - Enter the amount in dollars
   - System deducts that amount from shopper's payment
   - Organizer keeps fees on the refunded portion (e.g., $100 sale with $50 refund: organizer got $95, refunds $50, net $45)

**Escalation:**
- If refund button missing from order detail: backend feature gate issue — escalate to dev
- If refund initiated but didn't appear in Stripe: backend webhook failure in `refund.created` handler — escalate to dev
- If shopper's refund takes >7 days: likely their bank is slow; escalate to Stripe support if >10 days

---

## Item & Sale Management

### AI Item Tagging Not Working / Wrong Suggestions

**Symptoms:**
- AI tagging button appears disabled or shows loading spinner indefinitely
- Tags are completely wrong (e.g., "chair" tagged as "fishing rod")
- AI suggestions never appear in the add-items panel
- User uploaded photo but AI suggestion panel is empty

**Diagnosis:**
1. Verify photo uploaded successfully (should show in preview)
2. Check file size (max 5MB; larger files will fail silently)
3. Verify AI service is healthy (Google Vision + Claude Haiku both required)
4. Check network logs for failed requests to `/api/upload/analyze` endpoint
5. Confirm user has entered description text (AI uses photo + description context)

**Resolution:**
1. **AI not running at all:**
   - Check photo file size: must be < 5MB
   - Refresh the page and try again
   - Try a different photo to rule out corruption
   - If still doesn't work: backend team to check Google Vision and Anthropic API health
2. **AI running but wrong tags:**
   - AI suggestions are hints, not gospel — user should review and adjust
   - More detailed description = better tags (e.g., "Vintage oak rocking chair, needs refinishing" > "chair")
   - Click "Rescan" button to get new suggestions (may be different each time)
   - User can manually edit tags after suggestions appear
3. **Tags not appearing in final item:**
   - Confirm user clicked "Apply" on the AI tag panel (not just dismissing it)
   - Tags should appear in the item detail on the left side
   - If applied but not showing: refresh page to confirm save

**Escalation:**
- If Google Vision API is down: backend team to check Google Cloud console and switch to Ollama fallback
- If tags show in panel but don't save to item: backend bug in `itemController` tag association — escalate to dev
- If AI is consistently wrong for a category (e.g., all furniture misidentified): may need fine-tuning; document examples and escalate to product

---

### Photos Not Uploading

**Symptoms:**
- Photo upload button doesn't respond or shows "Upload failed"
- Photo appears to upload (spinner completes) but doesn't show in preview
- "File too large" error
- Upload hangs indefinitely

**Diagnosis:**
1. Check file size (max 5MB; larger will fail with clear error)
2. Verify file format (PNG, JPG, GIF, WebP supported; HEIC may fail)
3. Check browser console for network errors (Cloudinary upload failure)
4. Verify user has internet connection (upload requires live connection)
5. Check if organizer's Cloudinary account is still connected

**Resolution:**
1. **File too large:**
   - Compress before upload (most phones can do this natively)
   - Max size is 5MB per photo
   - Use online compressor if needed (tinypng.com, compressor.io)
2. **Upload fails or hangs:**
   - Refresh page and try again
   - Try a different photo to rule out file corruption
   - Try a different browser (rules out session/cache issue)
   - Check internet connection (upload needs stable connection)
3. **Photo uploads but doesn't appear in preview:**
   - Refresh the page — should appear after reload
   - If still missing: file may have uploaded but not associated — escalate to backend
4. **HEIC format (iPhone photos):**
   - iPhone HEIC format not supported yet
   - Convert to JPG first using online converter or iPhone settings

**Escalation:**
- If non-HEIC file under 5MB still fails: Cloudinary API issue — backend team to check signed URL generation in `/api/upload` endpoint
- If photo uploaded to Cloudinary but not saved to item: database save failed — escalate to dev
- If organizer's Cloudinary account shows as invalid: re-run Cloudinary auth in backend settings

---

### Sale Not Appearing on Map / In Search

**Symptoms:**
- Organizer created and published sale, but shoppers can't find it
- Sale appears in organizer's dashboard but not on public map or search results
- "No sales found" when searching for the city/area

**Diagnosis:**
1. Verify sale status is "Published" (not "Draft" or "Archived")
2. Confirm sale has valid address with correct geolocation
3. Check if sale has at least one item with "Available" status
4. Verify sale location is within the service area (Grand Rapids + surrounding area)
5. Check backend geocoding cache (Nominatim may have slow response)
6. Confirm organizer's account is not suspended

**Resolution:**
1. **Sale is in Draft:**
   - Go to Organizer Dashboard → Sales
   - Click the sale, scroll to Status → change from "Draft" to "Published"
   - Save changes
   - Sale should appear on map within 2 minutes
2. **Sale has no items or all items marked "Sold":**
   - Add at least one item with "Available" status
   - Go to Items tab, add item, ensure status is "Available"
   - Map should refresh within 2 minutes
3. **Sale address is wrong or missing:**
   - Edit sale → verify address is complete (street, city, ZIP)
   - Address must be in Grand Rapids area to appear
   - After updating: save and wait 2 minutes for geolocation to update
4. **Search doesn't show the sale:**
   - Go to Shopper → Search/Map tab
   - If searching by organizer name: full name must match exactly
   - If searching by city: sale address city must match search
   - Try sorting by "Newest" to see recently published sales
5. **Sale shows in organizer dashboard but not on map:**
   - This usually means geocoding didn't complete — wait 5 minutes and refresh
   - If still missing: click Edit Sale and re-save address to trigger new geocoding

**Escalation:**
- If address won't geocode (shows red error): backend geocoding service issue — check Nominatim API logs and cache
- If sale publishes but map doesn't refresh: frontend map component may be cached — escalate to dev for cache invalidation
- If sale is in service area but still not appearing: backend query filter issue — escalate to dev

---

## Notifications & Account

### Push Notifications Not Arriving

**Symptoms:**
- User enabled push notifications but doesn't receive them
- Some notifications arrive, others don't
- Browser asks for permission but nothing happens after allow
- Notification permission shows "Denied" and can't be changed

**Diagnosis:**
1. Verify user granted push permission in browser (check site settings)
2. Confirm browser supports PWA notifications (Chrome, Firefox, Safari 16+)
3. Check if user is on the sale detail page when notification should arrive
4. Verify organizer actually updated the sale/item (what triggers notification)
5. Check VAPID configuration is correct in backend

**Resolution:**
1. **Permission dialog appeared but user dismissed it:**
   - Can't re-ask from same page
   - User must go to browser settings and manually allow notifications
   - Chrome: click lock icon in address bar → Site settings → Notifications → Allow
   - Firefox: Settings → Privacy → Notifications → Allow for finda.sale
2. **Permission is "Denied":**
   - Click browser settings (lock icon in address bar)
   - Find "Notifications" setting, change to "Allow"
   - Refresh the page
   - Should start receiving notifications
3. **Permission is "Allow" but no notifications arrive:**
   - Verify user is actively browsing (some browsers silence background notifications)
   - Try visiting a sale detail page that's actively being updated
   - If organizer updates the sale, notification should pop within 30 seconds
   - Check browser task bar (notifications may pop there, not in-page)
4. **Notifications on some pages but not others:**
   - Notifications only work on specific pages (sale detail, order tracking, etc.)
   - Notifications won't appear if the app isn't running
   - For iOS Safari: enable notifications in system settings, then in app settings

**Escalation:**
- If VAPID production configuration is wrong: backend team to verify VAPID keys are set correctly in Vercel
- If subscriptions aren't being saved: backend issue in `/api/notifications/subscribe` — escalate to dev
- If notification delivery is failing: check Socket.io connection and broadcast logic for that event type

---

### How to Delete My Account / Export My Data

**Symptoms:**
- User wants to permanently delete their account
- User requests data export (GDPR / personal backup)
- Account deletion option not visible in settings

**Diagnosis:**
1. Confirm user is logged in and accessing their own account
2. Verify account has completed transactions (affects deletion process)
3. Check if user has pending orders or pending payouts

**Resolution:**
1. **To request account deletion:**
   - Go to Organizer/Shopper Settings → Account tab → scroll to "Danger Zone"
   - Click "Request Account Deletion"
   - Review consequences: all personal data deleted, sales/purchases archived but not deleted
   - Confirm deletion
   - Account will be deleted within 24 hours (background job)
   - Confirmation email sent to account email
2. **What happens after deletion request:**
   - Organizer account: sales stay visible but marked as archived; organizer name redacted
   - Shopper account: purchase history kept for support, personal info redacted
   - All personal data (email, address, phone) deleted
   - Stripe Connect account connection remains for payout reconciliation
3. **To request data export:**
   - Go to Settings → Account → "Request Data Export"
   - System will email you a JSON file with all your account data within 24 hours
   - Includes: profile, sales, items, purchases, messages, activity logs
4. **Account can't be deleted immediately because:**
   - Open orders exist: must complete or cancel first
   - Pending payouts: must wait for next payout cycle
   - Support will notify you of blockers via email

**Escalation:**
- If deletion request doesn't arrive within 24 hours: backend job may have failed — escalate to dev
- If user can't access deletion option: they may not be logged into their own account — verify auth
- If data export fails: backend issue in data aggregation service — escalate to dev

---

## Organizer Setup

### How to Connect Stripe / Receive Payments

**Symptoms:**
- Organizer wants to start selling but can't figure out how to set up payments
- "Connect Stripe" button is missing or disabled
- Setup was started but not completed

**Diagnosis:**
1. Verify organizer has completed their profile (name, email, phone, address)
2. Confirm they have a valid bank account in the US (required for Stripe)
3. Check if Stripe Connect onboarding was started but abandoned
4. Verify account email is confirmed (sent during signup)

**Resolution:**
1. **First-time Stripe setup:**
   - Organizer Dashboard → Settings → Payments tab
   - Click "Connect with Stripe" button (blue button, top of Payments section)
   - You'll be taken to Stripe's Express onboarding flow
   - Fill in: legal name, business address, bank account, tax ID (SSN or EIN)
   - This takes 5-10 minutes
   - After completing, Stripe will redirect you back to FindA.Sale
   - You should see "Stripe connected" confirmation on Payments tab
2. **What you need to have ready:**
   - Valid US bank account (checking or savings)
   - Tax ID (Social Security Number for sole proprietor, EIN for business)
   - Government ID (driver's license or passport)
   - Business address (can be home address)
3. **After connecting:**
   - Stripe will review your account (usually instant, sometimes 24-48 hours)
   - You'll receive an email from Stripe confirming approval
   - You can then create and sell items immediately
4. **If you see "Not Yet Approved":**
   - Stripe is still reviewing — check email from Stripe for any questions
   - Usually approves within 24 hours
   - In meantime, you can list items; they'll be sellable once approved

**Escalation:**
- If "Connect Stripe" button is missing: backend permission issue — escalate to dev
- If user is rejected by Stripe: Stripe policy issue — escalate to backend team to check rejection email
- If Stripe shows as connected but payments fail: Stripe account needs re-review — have user log into Stripe dashboard to check account status

---

### How to Use Invite Codes to Give Beta Access

**Symptoms:**
- Organizer wants to invite other organizers to beta
- Doesn't know how to generate or share codes
- Confused about who can use the codes

**Diagnosis:**
1. Verify user is an organizer (not a shopper)
2. Confirm user has invite generation permission (standard for all organizers)
3. Check if any codes have already been generated

**Resolution:**
1. **To generate invite codes:**
   - Go to Organizer Dashboard → Admin section (if you see it, you have permission)
   - Find "Generate Invite Codes" button
   - Enter how many codes you want (1-10)
   - Click "Generate"
   - System will create unique codes (e.g., BETA-ABC123, BETA-XYZ789)
   - Copy codes and share via email, text, or messaging app
2. **Each code:**
   - Can be used exactly once per new user
   - Expires after 7 days if not redeemed
   - Gives new user immediate access to organizer features
   - Can only be used during signup (can't apply after account exists)
3. **To share codes:**
   - Copy the code (no spaces, case-insensitive)
   - Send to person via your preferred method
   - They go to finda.sale → "Sign Up as Organizer"
   - Enter code during signup flow
   - They'll have full access immediately after signup
4. **Tracking code usage:**
   - Admin section shows which codes have been redeemed and by whom
   - Shows redemption date and user email

**Escalation:**
- If codes won't generate: backend issue in `/api/invites/generate` — escalate to dev
- If code doesn't work at signup: user may already have account — they need to log in instead
- If Admin section is missing: backend permission gate issue — escalate to dev

---

### How to Clone a Previous Sale

**Symptoms:**
- Organizer wants to reuse a previous sale's items and settings
- Doesn't see a clone/duplicate option
- Wants to avoid re-entering everything for a similar sale

**Diagnosis:**
1. Verify organizer has at least one completed or archived sale to clone from
2. Confirm user is trying to clone from Dashboard (not from map/search view)

**Resolution:**
1. **To clone a sale:**
   - Go to Organizer Dashboard → Sales tab
   - Find the sale you want to clone (can be archived/completed)
   - Click the three-dot menu next to the sale
   - Select "Clone Sale" (or "Duplicate")
   - System will create a new draft sale with:
     - Same title, description, and address
     - Same organizer (you)
     - All items from the original sale (with quantities preserved)
     - Settings copied (times, payment terms, etc.)
2. **After cloning:**
   - New sale starts as "Draft"
   - You can edit all details before publishing
   - Update dates, times, and address if needed
   - Review item quantities and pricing
   - When ready: change status to "Published"
3. **Clone includes:**
   - Item names, descriptions, photos, AI tags
   - Item pricing, quantity, condition
   - Sale title, description, location
   - Does NOT include: previous purchases, refunds, or payment info
4. **What you'll need to update:**
   - Sale date/time (if it's a new event)
   - Address (if different location)
   - Item quantities (if sold from last time)
   - Pricing (if you want to change)

**Escalation:**
- If clone button doesn't appear: backend permission issue or UI component missing — escalate to dev
- If cloned items don't appear in new sale: database association failed — escalate to dev
- If cloning a sale with 100+ items is slow: may be performance issue — escalate to dev

---

## Cross-Cutting Issues

### General Troubleshooting Checklist

For any issue, try these first:

1. **Refresh the page** (Ctrl+R or Cmd+R)
2. **Clear browser cache** (Settings → Clear browsing data → All time)
3. **Try incognito/private mode** (rules out extensions and cookies)
4. **Check your internet connection** (reload your internet provider page)
5. **Try a different browser** (Chrome, Firefox, Safari — rules out browser-specific bugs)
6. **Check browser console** (F12 → Console tab → look for red errors)
7. **Restart your device** (cold boot often fixes transient issues)

### When to Escalate to Backend Team

Request these items when escalating:

1. User's email address or ID
2. Exact error message or screenshot
3. When the issue started (today, this week)
4. Steps to reproduce (if possible)
5. Browser type and version
6. Backend logs from `backend-production-153c9.up.railway.app/logs`

### Hotline Contact

- **Support Email:** support@finda.sale
- **Backend Team:** Check backend logs at Railway dashboard
- **Stripe Issues:** Escalate to Stripe support via backend team (don't contact Stripe directly)

---

## FAQ Supplement

**Q: Why was my sale removed from the map?**
A: Sales need at least one "Available" item to appear. If all items are marked Sold or On Hold, the sale disappears. Publish new items to bring it back.

**Q: Can I refund a customer partially?**
A: Yes. Organizer can issue full or partial refunds from the order detail page. Refund goes back to customer's original payment method in 3-5 business days.

**Q: Why does the AI tagger sometimes give wrong suggestions?**
A: AI uses photo + description to suggest tags. More detail = better suggestions. You always control final tags (AI is just a helper).

**Q: How long does Stripe approval take?**
A: Usually instant. Sometimes 24-48 hours. Check your email from Stripe. You can list items while approval is pending.

**Q: Can I change my Stripe payout bank account?**
A: Yes. Log into Stripe Connect dashboard (linked from Organizer Settings → Payments) and update bank account there.

**Q: What happens if my account is deleted?**
A: Organizer sales stay visible but marked as archived. Shopper purchase history kept for support. All personal data deleted within 24 hours.

---

**Document Status:** Pre-beta — expect revisions as beta users surface new issues.
**Next Review:** Post first week of beta (monitor Sentry logs and support inbox for new patterns).
