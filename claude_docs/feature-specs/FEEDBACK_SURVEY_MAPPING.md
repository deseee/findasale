# Feedback Survey Mapping: User Flows → Survey Moments

**Purpose:** This document maps real user journeys to each survey moment, explaining the "why" behind each trigger and what data we're collecting.

---

## ORGANIZER FLOWS

### Flow: "Create and Publish My First Sale"

**User Journey:**
```
1. Organizer lands on dashboard (new account, 0 sales)
2. Sees "Create Sale" CTA
3. Fills form: title, dates, address, photos
4. Clicks "Create Draft"
5. Navigates to Add Items page
6. Uploads 10+ photos, AI tags everything
7. Clicks "Review & Publish"
8. Clicks "Publish Sale" button
9. SUCCESS: Sale is now PUBLISHED
```

**Survey Moment: OG-1 — "First Sale Published"**
- **Trigger:** Sale status changes from DRAFT to PUBLISHED (user clicks the button AND request succeeds)
- **Code location:** `packages/frontend/pages/organizer/edit-sale/[id].tsx` or dashboard after save
- **Timing:** Immediately after publish confirmation
- **Question:** "How confident do you feel about the photos?"
- **Options:** "Struggling" | "Okay" | "Great"
- **Why this moment?**
  - User just overcame the biggest friction point (setting up photos)
  - They're happy (sale is live)
  - Photo quality is make-or-break for sale success
  - Immediate feedback on confidence level shapes next steps (rematch photos? adjust title? etc.)
- **Data we collect:** Is their first sale photo-ready or do they need help?
- **Job-to-be-Done:** "I published my first sale. Do I feel ready for shoppers to see it?"

---

### Flow: "Add Items to Sale"

**User Journey:**
```
1. Organizer is on Add Items page for an active sale
2. Clicks camera icon to take photo of Item 1
3. Selects from roll, crops, uploads
4. Enters title, description, price
5. Repeats for items 2–10
6. After Item 10 is saved
7. Survey fires
```

**Survey Moment: OG-2 — "First 10 Items Added"**
- **Trigger:** Item count for this sale hits 10 (query DB, fire on the completion of the 10th item submission)
- **Code location:** `packages/frontend/pages/organizer/add-items/[saleId].tsx` in the item save handler
- **Timing:** Right after the 10th item is successfully saved
- **Question:** "Rate your experience adding photos"
- **Options:** "Too slow" | "Okay" | "Fast"
- **Why this moment?**
  - By item 10, user has formed an opinion about the UX (camera, crop, upload, form)
  - Not too early (they're past the learning curve)
  - Not too late (they're still motivated and in flow)
  - "Speed" feedback directly informs whether we need to optimize the photo pipeline
- **Data we collect:** Is the add-items workflow feeling smooth or clunky?
- **Job-to-be-Done:** "Is this photo upload system working for me, or is it slowing me down?"
- **Frequency:** Once per sale (not per item, not once ever — they might run multiple sales)

---

### Flow: "Sell Items at Sale"

**User Journey:**
```
1. Organizer is on Inventory page
2. Shopper buys Item 1 (via checkout or auction)
3. Organizer manually marks Item 1 as SOLD
4. Item status changes from ACTIVE to SOLD
5. SUCCESS: Item now shows as sold
```

**Survey Moment: OG-3 — "First Item Marked Sold"**
- **Trigger:** First time user marks ANY item as SOLD in an active sale (status change to SOLD)
- **Code location:** `packages/frontend/pages/organizer/inventory.tsx` or item detail page, in the status change handler
- **Timing:** Immediately after the status updates (user sees "Item marked sold" toast)
- **Question:** "How did you connect with the buyer?"
- **Options:** "In-person" | "Online bid" | "Other"
- **Why this moment?**
  - User just made their first sale (happy moment)
  - They're engaged and thinking about their business
  - Understanding their channel (auction vs. in-person) is crucial for feature prioritization
  - Some organizers use FindA.Sale as a catalog (email buyers), others run live auctions
- **Data we collect:** Is this organizer doing online sales or in-person pickups?
- **Job-to-be-Done:** "How am I actually making money with this platform?"
- **Frequency:** Once per sale (they might sell multiple items, but we only need to know the pattern once per event)

---

### Flow: "Take Payment Online"

**User Journey:**
```
1. Organizer created a sale and added items
2. Shopper makes a bid or adds item to cart
3. Shopper clicks "Buy Now" or "Checkout"
4. Shopper pays via Stripe Checkout or Hold-to-Pay
5. Payment is confirmed (captured by Stripe)
6. Organizer receives notification "Payment received"
```

**Survey Moment: OG-4 — "First POS/Hold-to-Pay Checkout"**
- **Trigger:** First time organizer receives a payment via POS checkout OR Hold-to-Pay flow (payment status changes to PAID)
- **Code location:** `packages/frontend/pages/organizer/pos.tsx` (POS) or Hold-to-Pay invoice status handler
- **Timing:** After payment is confirmed (not while pending)
- **Question:** "Was the payment process smooth?"
- **Options:** "Nope" | "Okay" | "Smooth"
- **Why this moment?**
  - Taking online payments is high-friction, high-value moment
  - Organizer is newly confident they can accept payments online
  - Immediate feedback on friction (did fees surprise them? was reconciliation confusing?)
  - Only fires for SIMPLE+ (FREE tier can't take payments)
- **Data we collect:** Did the payment setup/process feel trustworthy and easy?
- **Job-to-be-Done:** "Can I actually accept online payments reliably?"
- **Frequency:** Once ever (we only need to know if they felt the first payment was smooth)

---

### Flow: "Customize Settings"

**User Journey:**
```
1. Organizer navigates to Settings page
2. Clicks on "Notifications" or "Profile" or "Subscription"
3. Changes a setting (toggle, text field, dropdown)
4. Clicks "Save"
5. SUCCESS: "Settings updated" toast
```

**Survey Moment: OG-5 — "First Settings Change"**
- **Trigger:** Any setting on the Settings page is saved (any POST to /api/user/settings or equivalent)
- **Code location:** `packages/frontend/pages/organizer/settings.tsx` in the save handler
- **Timing:** Right after the "Settings updated" toast appears
- **Question:** "Was that easy to find?"
- **Options:** "No" | "Sort of" | "Yes"
- **Why this moment?**
  - Immediately after success, user knows if they were confused or it felt intuitive
  - Settings pages are often hard to navigate (lots of options scattered)
  - "Easy to find" is a proxy for navigation/structure quality
- **Data we collect:** Does the settings page make sense, or is it a mess?
- **Job-to-be-Done:** "Can I self-serve my account without asking for help?"
- **Frequency:** Once ever (we only need to calibrate once; if it was confusing the first time, it likely is for them)

---

## SHOPPER FLOWS

### Flow: "Find and Buy an Item"

**User Journey:**
```
1. Shopper browses estate sales on map or search
2. Taps on a sale, sees items for sale
3. Taps on an item, reads details, sees photos
4. Clicks "Buy Now" (fixed price) or places a bid (auction)
5. Redirected to Stripe Checkout
6. Enters payment info, completes purchase
7. SUCCESS: "Order confirmed" page
8. Email receipt sent
```

**Survey Moment: SH-1 — "First Purchase Completed"**
- **Trigger:** First time shopper completes a purchase (payment captured, order status = PAID/CONFIRMED)
- **Code location:** Checkout success page or order confirmation handler
- **Timing:** On the success page (after payment confirmed, before they navigate away)
- **Question:** "How easy was checkout?"
- **Options:** "Confusing" | "Okay" | "Smooth"
- **Why this moment?**
  - Shopper is still in the moment (just paid, got confirmation)
  - Checkout friction is the #1 reason carts are abandoned
  - First-time buyers are most at risk (is this site legit? will I get scammed?)
  - Feedback here is raw and immediate
- **Data we collect:** Did they feel confident buying on this platform?
- **Job-to-be-Done:** "Will I buy from this platform again?"
- **Frequency:** Once ever (first purchase defines the impression)

---

### Flow: "Curate Favorites"

**User Journey:**
```
1. Shopper is on an item detail page
2. Sees a beautiful lamp or cool vintage dress
3. Clicks heart icon to favorite
4. Icon fills in (visual feedback)
5. Survey fires
```

**Survey Moment: SH-2 — "First Item Favorited"**
- **Trigger:** First time shopper clicks the heart/favorite button on any item
- **Code location:** `packages/frontend/pages/items/[id].tsx` in the favorite handler (or `FavoriteButton.tsx` component)
- **Timing:** Right after the heart icon fills in and favorite is saved
- **Question:** "Why this item?"
- **Options:** "Looks cool" | "Good price" | "Saving for later"
- **Why this moment?**
  - When users favorite something, they're signaling taste/intention
  - This data improves recommendations and search ranking
  - First favorite is the cleanest signal (no behavioral noise)
- **Data we collect:** What kind of items does this shopper care about?
- **Job-to-be-Done:** "Can this platform show me items I actually want?"
- **Frequency:** Once ever (we just need to establish the pattern once)

---

### Flow: "Participate in Auctions"

**User Journey:**
```
1. Shopper is on an item detail page (auction item)
2. Current bid is $5, min bid increment is $1
3. Shopper enters a bid: $6
4. Clicks "Place Bid"
5. Bid is confirmed (shopper now has the high bid)
6. Survey fires
```

**Survey Moment: SH-3 — "First Bid Placed"**
- **Trigger:** First time shopper places a bid on any auction item
- **Code location:** `packages/frontend/pages/items/[id].tsx` in the BidModal or bid handler
- **Timing:** Right after bid is confirmed (high bid badge appears)
- **Question:** "How confident are you in the final price?"
- **Options:** "Uncertain" | "Reasonable" | "Great deal"
- **Why this moment?**
  - High engagement (bidders are committed buyers)
  - Confidence in the auction mechanics is critical (is it a real auction or a scam?)
  - Feedback here shapes whether they bid again
- **Data we collect:** Do bidders trust the auction mechanism?
- **Job-to-be-Done:** "Is this a real, fair auction?"
- **Frequency:** Once ever (first bid establishes trust)

---

### Flow: "Share Haul"

**User Journey:**
```
1. Shopper finishes a sale visit with a bag of treasures
2. Opens the app, taps "Share Haul" or "Post"
3. Selects 1–3 photos, writes caption
4. Reviews preview
5. Clicks "Post"
6. SUCCESS: Haul is live, visible to followers
```

**Survey Moment: SH-4 — "First Haul Posted"**
- **Trigger:** First time shopper posts a UGCPhoto (haul) with photos and description
- **Code location:** Component for creating hauls (likely `pages/hauls/create.tsx` or modal) in the post handler
- **Timing:** Right after "Haul posted" confirmation
- **Question:** "How fun was sharing it?"
- **Options:** "Annoying" | "Okay" | "Fun"
- **Why this moment?**
  - Users who post content are your most engaged community members
  - Friction in posting directly impacts haul volume
  - "Fun" is a proxy for product delight and social engagement
- **Data we collect:** Is posting content delightful or is it a chore?
- **Job-to-be-Done:** "Will I come back and share more hauls?"
- **Frequency:** Once ever (first post shows if the feature resonates)

---

### Flow: "Follow Organizers"

**User Journey:**
```
1. Shopper is on an organizer profile page or sale detail page
2. Sees "Follow" button next to organizer info
3. Clicks "Follow"
4. Button changes to "Following" (visual feedback)
5. Survey fires
```

**Survey Moment: SH-5 — "First Sale/Organizer Followed"**
- **Trigger:** First time shopper clicks Follow on any organizer or sale
- **Code location:** Organizer profile page or sale detail page, Follow button handler
- **Timing:** Right after status changes to "Following"
- **Question:** "What drew you to them?"
- **Options:** "Great items" | "Good reputation" | "Location"
- **Why this moment?**
  - Following is a strong signal of intent (they want more from this organizer)
  - Data here improves recommendation algorithm and organizer discovery
- **Data we collect:** What makes organizers attractive to buyers?
- **Job-to-be-Done:** "Will I remember to check back on this organizer?"
- **Frequency:** Once ever (first follow establishes the criterion)

---

## Cross-Cutting Concerns

### Tier Gating
- **OG-4 (POS)** only shows for `organizerTier !== 'FREE'`
- All other surveys show for all tiers

### Role Gating
- OG-* surveys only for users with `roles.includes('ORGANIZER')`
- SH-* surveys only for users with `roles.includes('USER')` who are NOT organizers
- (A user can be both roles, but surveys are role-specific)

### Authentication Gate
- All surveys only show for authenticated users
- Anonymous users don't see surveys

### Frequency Caps
- **Once per session:** Only 1 survey visible at a time
- **Once per 24 hours:** Max 1 survey per user per rolling 24-hour window
- **30-minute cooldown:** After any survey (dismiss or submit), wait 30 min before next survey
- **Permanent suppression:** "Don't ask again" checkbox → survey never shows again for that user

---

## Implementation Checklist by Code Location

| Survey | File | Function | Handler |
|--------|------|----------|---------|
| OG-1 | `pages/organizer/edit-sale/[id].tsx` | handlePublish | After API returns success |
| OG-2 | `pages/organizer/add-items/[saleId].tsx` | handleSaveItem | After 10th item saved |
| OG-3 | `pages/organizer/inventory.tsx` | handleStatusChange | After status set to SOLD |
| OG-4 | `pages/organizer/pos.tsx` | handleCheckoutSuccess | After payment captured |
| OG-5 | `pages/organizer/settings.tsx` | handleSave | After settings POST returns success |
| SH-1 | Checkout success page | N/A (page load handler) | On success page load |
| SH-2 | `pages/items/[id].tsx` | handleFavorite | After API returns success |
| SH-3 | `pages/items/[id].tsx` | handlePlaceBid | After bid confirmed |
| SH-4 | Haul create component | handlePost | After haul posted |
| SH-5 | Organizer profile / sale detail | handleFollow | After follow API success |

---

## Success Scenarios

**Scenario 1: Happy Path (User Submits)**
```
User completes action → Survey fires → User answers question → User submits
→ Toast: "Thanks! We're reading every submission"
→ Survey closes
→ No more surveys for 24 hours
```

**Scenario 2: User Dismisses**
```
User completes action → Survey fires → User waits 10 sec (no interaction)
→ Survey fades out and closes
→ No more surveys for 30 min (cooldown)
```

**Scenario 3: User Opts Out**
```
User completes action → Survey fires → User checks "Don't ask again"
→ User submits or dismisses
→ Survey is added to FeedbackSuppression table
→ This survey type NEVER fires again for this user (even after 24h)
```

**Scenario 4: User Ignores (Closes X)**
```
User completes action → Survey fires → User clicks X button
→ Survey closes immediately
→ No suppression (user didn't opt out, just closed it)
→ 30-min cooldown applies
```

---

**End of Mapping Document**

Use this as reference when implementing triggers. Each row maps a survey to its code location and action that fires it.
