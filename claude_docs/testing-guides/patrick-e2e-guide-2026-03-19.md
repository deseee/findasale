# Patrick E2E Testing Guide — FindA.Sale
**Last Updated:** 2026-03-19
**Estimated Total Time:** 90 minutes (all workflows)
**Format:** Grouped by user workflow, not feature number. Skip sections you've already tested.

---

## Quick Smoke Test (10 minutes)

Run this first to catch obvious breaks.

1. **Homepage load** → `/` loads, shows active sales map
2. **Shopper browse** → Click "Browse Sales" → see calendar + map
3. **Login** → Enter test credentials, redirect to dashboard
4. **Organizer dashboard** → See sales list + quick-links (if logged in as organizer)
5. **Dark mode toggle** → Click theme icon, page switches + persists on reload

**Pass:** All 5 load without 404/500. Dark mode persists in localStorage.

---

## 1. Authentication & Onboarding (15 min)

### 1.1 Registration Flow (#66 Foundation)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Browser incognito window. Go to `/auth/register`

**Steps:**
1. Fill email (test-org-XXXXXX@example.com where X = random)
2. Fill password (12+ chars, mix case)
3. Select role: "Organizer"
4. Fill business name: "Test Estate Sales"
5. Click "Create Account"

**Expected result:** Redirect to `/onboarding` dashboard, see welcome modal + sale creation prompt

**Pass criteria:**
- ✅ Account created (can log out and log back in with same email/password)
- ✅ No form validation errors
- ✅ Redirect happens automatically

**Fail criteria:**
- ❌ Form stuck / spinning (timeout >5 sec)
- ❌ 404 / 500 error
- ❌ Email already exists error (change email and retry)

**Notes:** Password reset coming soon (#37). If password reset needed, DM Patrick via contact form.

---

### 1.2 Login Flow (#66 Foundation)
**Status:** ✅ Ready to test
**Time:** 3 min

**Setup:** Registered account from 1.1 or use `test@finda.sale` / `TestPassword123`

**Steps:**
1. Go to `/auth/login`
2. Enter email
3. Enter password
4. Click "Sign In"

**Expected result:** Redirect to `/organizer/dashboard`

**Pass criteria:**
- ✅ Dashboard loads with sales list
- ✅ User menu shows your email in top-right
- ✅ Session persists on page reload

**Fail criteria:**
- ❌ Infinite redirect loop
- ❌ 401 Unauthorized
- ❌ Session lost on reload

**Notes:** Passkey login (#19) in beta—not surfaced on login page yet.

---

### 1.3 Password Reset (#37 — Awaiting Build)
**Status:** ⚠️ Partially ready
**Time:** 5 min
**Notes:** Email-based recovery exists but UI may not be fully wired. Try clicking "Forgot Password" on login page; if 404, skip to next section.

---

### 1.4 Dark Mode Toggle (#63 Complete)
**Status:** ✅ Ready to test
**Time:** 2 min

**Setup:** Any page, logged in or out

**Steps:**
1. Look for moon/sun icon in top-right of header
2. Click to toggle dark mode
3. Reload page
4. Verify mode persists

**Expected result:** Page background + text colors invert. Persists on reload.

**Pass criteria:**
- ✅ Toggle works immediately
- ✅ All text readable in both modes (no purple-on-blue contrast issues)
- ✅ localStorage entry created (`theme: "dark"` or `"light"`)

**Fail criteria:**
- ❌ Toggle doesn't respond
- ❌ Text unreadable (white on light gray, etc.)
- ❌ Mode resets on reload (localStorage not working)

**Notes:** Test on 3–4 pages to verify all have `dark:` Tailwind variants. Report any pages where dark mode looks broken.

---

## 2. Sale Management (25 min)

### 2.1 Create a Sale (#5 Core)
**Status:** ✅ Ready to test
**Time:** 8 min

**Setup:** Logged in as organizer. Go to `/organizer/sales/new`

**Steps:**
1. Enter sale title: "Test Estate Sale — Grand Rapids"
2. Select type: ESTATE
3. Select dates: Tomorrow 9am → day after 3pm
4. Enter address: "123 Main St, Grand Rapids, MI"
5. Click map to pin location (green marker appears)
6. Enter business name (should autofill)
7. Click "Create Sale"

**Expected result:** Redirect to sale detail page (`/sales/[slug]`). See "Draft" badge.

**Pass criteria:**
- ✅ Sale appears in organizer dashboard list
- ✅ Map shows correct location pin
- ✅ Sale detail page loads with all entered data
- ✅ Edit/publish buttons present

**Fail criteria:**
- ❌ Address doesn't geocode (pins to 0,0)
- ❌ 500 error on create
- ❌ Sale doesn't appear in list after redirect

---

### 2.2 Edit Sale Details (#5 Core)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Sale from 2.1 or any existing draft sale. Go to sale detail page.

**Steps:**
1. Click "Edit" button (pencil icon)
2. Change title to "Updated: Test Estate"
3. Change refund policy: "7 days"
4. Save changes

**Expected result:** Title updates on page. Refund policy visible in sale settings.

**Pass criteria:**
- ✅ Changes persist on reload
- ✅ No validation errors
- ✅ Sale list shows updated title

**Fail criteria:**
- ❌ Changes don't save
- ❌ Validation error (required fields)

---

### 2.3 Publish Sale (#5 Core)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Draft sale from 2.1. Go to sale detail page.

**Steps:**
1. Verify sale has title, address, dates, business name (health check)
2. Click "Publish" button
3. Confirm in modal

**Expected result:** Sale badge changes from "Draft" to "Published". Sale appears in shopper map/browse.

**Pass criteria:**
- ✅ Badge changes immediately
- ✅ Sale visible on `/map` (search by address or date)
- ✅ Sale shows "Published" in organizer list

**Fail criteria:**
- ❌ Publish button disabled with no reason given
- ❌ Sale doesn't appear in shopper map after 30 sec
- ❌ 500 error

**Notes:** Unpublish available in sale menu if needed.

---

### 2.4 Archive Sale (#5 Core)
**Status:** ✅ Ready to test
**Time:** 2 min

**Setup:** Any published sale. Go to sale detail page.

**Steps:**
1. Click menu (3 dots) → "Archive"
2. Confirm

**Expected result:** Sale moves to "Archived" tab. No longer visible to shoppers.

**Pass criteria:**
- ✅ Moves to archived section
- ✅ Disappears from shopper map/browse

**Fail criteria:**
- ❌ Still visible to shoppers
- ❌ Error on archive click

---

## 3. Item Management (30 min)

### 3.1 Add Item Manually (#5 Core + AI)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Published sale from 2.3. Go to `/organizer/sales/[id]/add-items`

**Steps:**
1. Click "+ Add Item"
2. Enter title: "Vintage Oak Desk"
3. Enter description: "Solid oak, 1970s, minor scratches"
4. Upload photo (can use placeholder image)
5. Select category: "Furniture"
6. Enter price: $150
7. Click "Save"

**Expected result:** Item appears in sale inventory. Item card shows all entered data.

**Pass criteria:**
- ✅ Item appears in list immediately
- ✅ Photo displays
- ✅ Category + price visible on card
- ✅ Edit button present

**Fail criteria:**
- ❌ Photo upload stuck/timeout
- ❌ 500 error on save
- ❌ Item disappears on reload

---

### 3.2 AI Tag Suggestions (#5 Core + AI)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Same sale. Add another item titled "Gold Picture Frame"

**Steps:**
1. After uploading photo, look for "AI Tag Suggestions" section
2. Should see 3–5 auto-generated tags (e.g., "frame", "gold", "vintage")
3. Click one to add; skip others
4. Manually add a custom tag if needed
5. Save item

**Expected result:** Tags saved with item. Display as pills on item card.

**Pass criteria:**
- ✅ AI suggestions appear within 2 sec of upload
- ✅ Tags are contextually relevant (not random)
- ✅ Custom tag field allows free-form entry

**Fail criteria:**
- ❌ AI section doesn't appear
- ❌ Suggestions are gibberish
- ❌ Tags don't save

**Notes:** AI uses Claude Haiku. Requests rate-limited. If suggestions don't appear, likely hit rate limit—wait 5 min and retry.

---

### 3.3 Condition Grading (#5 Core + AI)
**Status:** ✅ Ready to test
**Time:** 3 min

**Setup:** Any item with photo. Go to edit item page.

**Steps:**
1. Look for "Condition" field (dropdown)
2. AI should suggest a grade (S/A/B/C/D where S=Showroom)
3. You can override manually
4. Save

**Expected result:** Condition grade appears on item card.

**Pass criteria:**
- ✅ AI suggestion is reasonable (e.g., vintage item → B or C)
- ✅ Can override with manual selection
- ✅ Persists on reload

**Fail criteria:**
- ❌ Condition dropdown missing
- ❌ All items graded as "C" (not personalizing)

---

### 3.4 Batch Operations (#8 PRO)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Sale with 3+ items. Go to item list.

**Steps:**
1. Select 3 items (checkboxes appear on hover or card click)
2. Look for "Batch Actions" toolbar at bottom
3. Change status: "Sold"
4. Click "Apply"

**Expected result:** All 3 items move to "Sold" status.

**Pass criteria:**
- ✅ Toolbar appears when items selected
- ✅ All selected items update (not just first)
- ✅ Status change visible on cards

**Fail criteria:**
- ❌ Toolbar doesn't appear
- ❌ Only partial items update
- ❌ Reload reverts changes

**Notes:** Batch also supports price, category, tag, photo changes.

---

### 3.5 Item Holds / Reservations (#5 Core + #24 Holds View)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Published sale with items. Logged in as shopper (test-shopper@finda.sale).

**Steps - Shopper side:**
1. Go to `/sales/[slug]` (your organizer's sale)
2. Click an item card
3. Click "Hold This Item" (should be blue button)
4. See hold confirmation

**Expected result (Shopper):** Item shows "On Hold" badge. Buyer info visible.

**Expected result (Organizer):** Go to `/organizer/sales/[id]/holds`. See buyer name + timestamp. Grouped by buyer.

**Pass criteria:**
- ✅ Hold duration shows (default 48h)
- ✅ Organizer can see holds list
- ✅ Release button available for organizer
- ✅ Expired holds auto-release after 48h (or configured window)

**Fail criteria:**
- ❌ Hold button doesn't work
- ❌ Holds don't appear in organizer list
- ❌ Shopper can hold same item twice

---

## 4. Shopper Experience — Discovery (20 min)

### 4.1 Browse Sales by Map (#28 Heatmap)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Go to `/map` (logged out or in)

**Steps:**
1. See interactive Leaflet map with sale pins
2. Zoom in/out
3. Click a sale pin → popup with sale name + date
4. Click popup → redirects to sale detail page

**Expected result:** Map loads, pins visible, interactions work.

**Pass criteria:**
- ✅ Map loads within 3 sec
- ✅ Pins appear at correct locations
- ✅ Popup shows sale title + dates
- ✅ Click redirects to sale detail

**Fail criteria:**
- ❌ Blank map / pins not loading
- ❌ Slow performance (<2 fps zoom)
- ❌ Popup stuck or no redirect

**Notes:** Heatmap density layer available at `/map?heatmap=true` (hidden feature).

---

### 4.2 Browse Sales by Calendar (#35 Entrance Pin)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Go to `/calendar`

**Steps:**
1. See calendar grid by date
2. Dates with sales highlighted
3. Click a date → see sales for that day
4. Click sale → detail page

**Expected result:** Calendar loads, sales grouped by date.

**Pass criteria:**
- ✅ Calendar renders correctly
- ✅ Dates with sales are visually distinct
- ✅ Clicking redirects properly

**Fail criteria:**
- ❌ Calendar broken layout
- ❌ No sales appear even though some exist

---

### 4.3 Search & Filters (#50 Loot Log)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Go to `/search` or use search bar in header

**Steps:**
1. Search term: "desk"
2. Apply filters: Category = Furniture, Price: $50–$200, Condition: A or B
3. See results

**Expected result:** Items matching criteria appear.

**Pass criteria:**
- ✅ Results appear within 2 sec
- ✅ Filters are ORed correctly (A OR B condition = both)
- ✅ Price range respected
- ✅ Can clear filters with "Reset"

**Fail criteria:**
- ❌ No results (but items exist matching filters)
- ❌ Filters don't apply
- ❌ Price range buggy (shows $400 items when max=$200)

**Notes:** Full-text search uses PostgreSQL — may have slight lag on slow networks.

---

### 4.4 Browse by Category & Tags (#52 Encyclopedia)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Go to `/categories`

**Steps:**
1. See category list (Furniture, Decor, Books, etc.)
2. Click "Furniture"
3. Browse items in category
4. Go back, click a tag from tag cloud
5. See items with that tag

**Expected result:** Both category + tag browsing work smoothly.

**Pass criteria:**
- ✅ Category pages load
- ✅ Item count accurate
- ✅ Tag pages work (may be ISR cached — cache up to 1 hour)

**Fail criteria:**
- ❌ 404 on category or tag page
- ❌ Wrong items displayed

**Notes:** Encyclopedia (#52) provides search-friendly content on category pages.

---

## 5. Bidding & Auctions (15 min)

### 5.1 Create Auction Item (#5 Core)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Organizer dashboard. Go to add-items page.

**Steps:**
1. Add item: "Vintage Bulova Watch"
2. Set listing type: "AUCTION"
3. Set starting bid: $10
4. Set auction end: 2 hours from now
5. Save

**Expected result:** Item shows "Auction" badge with countdown timer.

**Pass criteria:**
- ✅ Timer counts down (updates every second)
- ✅ Countdown shows correct time
- ✅ Item listed as auction in shopper view

**Fail criteria:**
- ❌ Timer doesn't update
- ❌ Wrong end time
- ❌ Listing type dropdown missing

---

### 5.2 Place a Bid (#5 Core)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Shopper account. Go to auction item detail.

**Steps:**
1. See current bid + bid history (empty or existing bids)
2. Enter bid amount (must exceed current bid + min increment)
3. Click "Place Bid"
4. See confirmation

**Expected result:** Bid appears in history. Bid count increments.

**Pass criteria:**
- ✅ Bid appears in list immediately
- ✅ Bid validation: reject if too low (shows error message)
- ✅ High bidder name visible (privacy: first letter only or full name? Check UI)
- ✅ Bid notification sent to organizer

**Fail criteria:**
- ❌ Bid accepted below minimum
- ❌ Bid doesn't appear in history
- ❌ Organizer doesn't receive notification

---

### 5.3 Auction Auto-Bidding (#5 Core)
**Status:** ✅ Ready to test
**Time:** 3 min

**Setup:** Auction item with existing bids.

**Steps:**
1. Check "Auto-bid up to $50"
2. Another shopper places bid ($30)
3. Your auto-bid should increment to next tier (if <$50)
4. See bid history

**Expected result:** System automatically increments your bid without manual action.

**Pass criteria:**
- ✅ Auto-bid increments correctly
- ✅ Doesn't exceed max bid amount
- ✅ Outbid notification sent

**Fail criteria:**
- ❌ Auto-bid doesn't increment
- ❌ Exceeds max amount

---

### 5.4 Auction Closure & Winner Notification (#5 Core)
**Status:** ✅ Ready to test
**Time:** 2 min

**Setup:** Auction ending soon or ended. Go to item detail.

**Steps:**
1. Wait for auction to end (or create test auction with 2-min timer)
2. Refresh item page
3. See "Auction Closed" badge
4. High bidder can see "You Won!"

**Expected result:** Auction closes automatically. Emails sent to winner + organizer.

**Pass criteria:**
- ✅ Item status changes to "Closed"
- ✅ Winner notified via email or in-app notification
- ✅ Organizer sees winner name in holds/sales dashboard

**Fail criteria:**
- ❌ Auction stays open past end time
- ❌ No winner notification
- ❌ Wrong winner declared

---

## 6. Payments & Checkout (20 min)

### 6.1 Stripe Terminal POS Setup (#68 POS v2)
**Status:** ✅ Ready to test (simulator mode)
**Time:** 5 min

**Setup:** Organizer dashboard. Go to `/organizer/sales/[id]/checkout`

**Steps:**
1. Select items from sale inventory (drag/click to add to cart)
2. See running total + 10% platform fee breakdown
3. Click "Start Checkout"
4. See Stripe Terminal simulator (if STRIPE_TERMINAL_SIMULATED=true)
5. In simulator, select "Approved" card
6. See receipt

**Expected result:** Checkout flow completes. Receipt generated.

**Pass criteria:**
- ✅ Items add to cart (visual feedback)
- ✅ Total calculates correctly (item price × qty, + 10% fee)
- ✅ Payment completes in simulator
- ✅ Receipt shows item list + total + timestamp

**Fail criteria:**
- ❌ Cart broken (items don't add)
- ❌ Fee calculation wrong (shows 15% or 5%)
- ❌ Payment stuck
- ❌ Receipt doesn't generate

**Notes:** Production uses actual Stripe Terminal device. Simulator only for testing.

---

### 6.2 Refund Policy (#280 Core)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Sale from 2.1 (refund policy set to "7 days").

**Steps - Organizer side:**
1. Go to sale settings
2. See refund policy: "7 days"
3. Change to "14 days"
4. Save

**Expected result:** Policy updates. Displayed in sale detail (shopper-facing).

**Pass criteria:**
- ✅ Policy saves and persists
- ✅ Shopper can see policy on sale detail page
- ✅ Appears in checkout flow

**Fail criteria:**
- ❌ Policy doesn't update
- ❌ Not visible to shoppers

---

### 6.3 Digital Receipt & Return Window (#62 Digital Receipt)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Purchase completed (POS or hold converted to purchase).

**Steps - Shopper side:**
1. Go to `/shopper/purchases`
2. See receipt (automatically generated post-checkout)
3. See return window countdown (e.g., "Return by March 25")
4. Click "View Receipt" → see itemized list + total

**Expected result:** Receipt shows all items, prices, total, timestamp, organizer name.

**Pass criteria:**
- ✅ Receipt auto-generates after checkout
- ✅ All items + total accurate
- ✅ Return window calculated correctly
- ✅ Receipt downloadable as PDF (optional nice-to-have)

**Fail criteria:**
- ❌ Receipt missing or wrong data
- ❌ Return window shows incorrect date
- ❌ Receipt doesn't load for past purchases

---

### 6.4 Payout Transparency (#287 Earnings)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Organizer with completed sales/purchases.

**Steps - Organizer side:**
1. Go to `/organizer/insights` or payout dashboard
2. See breakdown: Gross Revenue - Platform Fee (10%) = Payout Amount
3. Item-level fee breakdown available

**Expected result:** Clear transparency on how much organizer keeps.

**Pass criteria:**
- ✅ Math correct (10% fee only)
- ✅ Can export as PDF for accounting
- ✅ Stripe payout schedule visible (if Stripe Connected)

**Fail criteria:**
- ❌ Missing data
- ❌ Fee percentage wrong

---

## 7. Organizer Dashboard & Analytics (25 min)

### 7.1 Command Center Dashboard (#68 PRO)
**Status:** ✅ Ready to test
**Time:** 8 min

**Setup:** Organizer with published sales. Go to `/organizer/dashboard`

**Steps:**
1. See dashboard overview with 4–6 widgets:
   - Total Sales (count)
   - Revenue (running total)
   - Active Auctions (count)
   - Items Sold (count)
   - Holds Pending (count)
   - Recent Activity Feed
2. Click a widget → drills into detailed view (e.g., holds list)
3. Filter by sale (dropdown)

**Expected result:** Widgets show real data. Interactions work.

**Pass criteria:**
- ✅ All widgets load and display current data
- ✅ Clicking a widget drills to detail
- ✅ Sale filter updates all widgets
- ✅ Data accurate (count matches item list)

**Fail criteria:**
- ❌ Widgets show placeholder text or 0s
- ❌ Click doesn't drill down
- ❌ Filter doesn't work

**Notes:** #14 Real-Time Status available for organizers (live-updating widget).

---

### 7.2 Item Library / Consignment Rack (#25 PRO)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Organizer dashboard. Go to `/organizer/library`

**Steps:**
1. See uploaded items (from previous sales)
2. Search by title or tag
3. Click an item → see price history (how many times sold, average price)
4. Click "Reuse in New Sale" → add to new sale with one click

**Expected result:** Library allows fast reuse of items.

**Pass criteria:**
- ✅ Items from past sales appear
- ✅ Search works
- ✅ Price history populated (if item sold before)
- ✅ Can add to new sale without re-uploading photo

**Fail criteria:**
- ❌ Library empty (even though items exist in past sales)
- ❌ Can't add to new sale (or loses photo)

---

### 7.3 Sales Analytics / Performance (#302 PRO)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Organizer with completed sales. Go to `/organizer/insights`

**Steps:**
1. See metrics: Total Revenue, Item Sell-Through %, Avg Item Price, Top Categories
2. See charts: Revenue over time, category breakdown
3. Filter by sale or date range

**Expected result:** Analytics dashboard shows trends.

**Pass criteria:**
- ✅ Metrics displayed accurately
- ✅ Charts load (may take 2–3 sec)
- ✅ Filter works and updates charts
- ✅ Downloadable as PDF export

**Fail criteria:**
- ❌ Charts missing or broken
- ❌ Data doesn't match actual sales
- ❌ Filter doesn't update

---

### 7.4 Verified Organizer Badge (#16 PRO)
**Status:** ✅ Ready to test
**Time:** 2 min

**Setup:** Organizer account with 3+ completed sales.

**Steps:**
1. Go to organizer profile page (public view)
2. Look for blue checkmark / "Verified" badge
3. Badge should appear if organizer meets criteria

**Expected result:** Badge visible on verified organizer profile + sales.

**Pass criteria:**
- ✅ Badge appears for qualified organizers (3+ sales, positive reviews)
- ✅ Not shown for unverified

**Fail criteria:**
- ❌ Badge always/never appears
- ❌ Wrong criteria applied

---

### 7.5 Reputation Score (#71 SIMPLE)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Organizer with reviews. Go to `/organizer/reputation`

**Steps:**
1. See 1–5 star rating (calculated from shopper reviews)
2. See reputation breakdown: Reliability, Item Quality, Communication
3. Score out of 100%

**Expected result:** Public reputation visible on organizer profile.

**Pass criteria:**
- ✅ Score calculated from reviews (not hardcoded)
- ✅ Updates after new review
- ✅ Shows on public profile

**Fail criteria:**
- ❌ Score doesn't update
- ❌ Wrong calculation (e.g., shows 5 stars when avg=3)

---

## 8. Premium Tier & Subscriptions (#60 Sprint 2)

### 8.1 Tier Comparison & Upgrade CTA (#60 PRO)
**Status:** ✅ Ready to test
**Time:** 8 min

**Setup:** Organizer account (any tier). Go to `/organizer/premium`

**Steps:**
1. See tier comparison table: SIMPLE / PRO / TEAMS
2. Current tier highlighted
3. See feature list per tier (AI, Batch Ops, Workspace, etc.)
4. Click "Upgrade to PRO" CTA
5. Should redirect to Stripe checkout or upgrade confirmation

**Expected result:** Tier comparison visible. Upgrade button present.

**Pass criteria:**
- ✅ Table displays all tiers
- ✅ Features accurately listed per tier
- ✅ Upgrade button functional (redirect to Stripe or payment)
- ✅ Current tier clearly marked

**Fail criteria:**
- ❌ Table missing or broken layout
- ❌ Upgrade button doesn't work
- ❌ Feature list wrong (says feature is PRO-only when it's SIMPLE)

**Notes:** Billing integration in-progress; button may not yet charge (test mode).

---

### 8.2 Usage Bar (Rate Limits Display) (#60 Sprint 2)
**Status:** ✅ Ready to test
**Time:** 3 min

**Setup:** PRO organizer. Go to `/organizer/premium` or dashboard.

**Steps:**
1. See usage bars for PRO-limited features:
   - AI Tag Suggestions (20/day)
   - Batch Operations (10/day)
   - etc.
2. Bars show current usage vs. limit
3. Use a feature → watch bar update

**Expected result:** Usage tracked and displayed.

**Pass criteria:**
- ✅ Bars load and show current usage
- ✅ Update after feature use (within 1–2 sec)
- ✅ Don't allow use above limit (graceful message)

**Fail criteria:**
- ❌ Bars don't load
- ❌ Don't update after use
- ❌ Allow unlimited use (rate limit not enforced)

---

## 9. Notifications & Messaging (15 min)

### 9.1 In-App Notification Inbox (#275 Core)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Any account. Go to `/notifications` or click bell icon.

**Steps:**
1. See notification list (if any)
2. Trigger a notification (e.g., place a bid, hold an item)
3. Bell icon shows red badge (count)
4. Click notification → dismiss or drill to detail

**Expected result:** Notifications appear in real-time.

**Pass criteria:**
- ✅ Notifications appear within 2–3 sec of action
- ✅ Badge count accurate
- ✅ Can dismiss individual notifications
- ✅ Clicking redirects to relevant page

**Fail criteria:**
- ❌ Notifications don't appear
- ❌ Badge count wrong
- ❌ Old notifications don't clear

---

### 9.2 Email Reminders & Preferences (#273 Core)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Any account with active sales/items.

**Steps:**
1. Go to settings → Notification Preferences
2. See toggle options: Sale Reminders, Item Updates, Weekly Digest, etc.
3. Toggle "Sale Reminders" OFF
4. Create/modify a sale
5. Should NOT receive email (can't test email delivery, but toggle should save)

**Expected result:** Preferences saved. Emails respect user settings.

**Pass criteria:**
- ✅ Toggles save (persist on reload)
- ✅ Unsubscribe link works (from any email)
- ✅ Can re-enable preferences later
- ✅ Email template is professional (check via test email)

**Fail criteria:**
- ❌ Toggles don't save
- ❌ Unsubscribe doesn't work (emails still sent)
- ❌ Email template broken or ugly

---

### 9.3 Shopper-Organizer Messaging (#378 FREE)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Shopper + organizer account.

**Steps - Shopper side:**
1. Go to sale detail → "Contact Organizer"
2. Open message thread
3. Send message: "Is this still available?"
4. See message appear

**Expected result - Organizer side:**
1. Receive notification of new message
2. Go to `/organizer/messages`
3. See thread list and reply

**Pass criteria:**
- ✅ Messages persist (don't vanish on reload)
- ✅ Both parties see full thread
- ✅ Notifications sent when messages received
- ✅ No profanity filter (check if needed)

**Fail criteria:**
- ❌ Messages don't send (spinner infinite)
- ❌ Messages visible to only one party
- ❌ Notifications don't send

---

## 10. Gamification & Shopper Engagement (20 min)

### 10.1 Shopper Loyalty Passport (#29 FREE)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Shopper account. Go to `/shopper/loyalty`

**Steps:**
1. See stamp card (visual grid of stamps)
2. Visit a sale or interact with item → earn 1 stamp
3. See progress to next reward level (e.g., 5 stamps → "Free Coffee" voucher)
4. Badges earned (e.g., "5 Sales Visited")

**Expected result:** Stamps accumulate. Rewards unlock.

**Pass criteria:**
- ✅ Stamps appear after interaction (within 5 sec)
- ✅ Progress bar shows accurate count
- ✅ Rewards listed (even if not yet earned)
- ✅ Badge system working

**Fail criteria:**
- ❌ No stamps appear
- ❌ Progress bar stuck or wrong count
- ❌ Rewards never unlock

---

### 10.2 Achievement Badges (#58 FREE)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Shopper account. Go to `/shopper/achievements`

**Steps:**
1. See badge grid: "First Sale", "Treasure Hunter", "Speed Shopper", etc.
2. Some locked (B&W), some unlocked (full color)
3. Perform action to unlock badge (e.g., make first purchase)
4. Locked badge becomes unlocked

**Expected result:** Badges earned for reaching milestones.

**Pass criteria:**
- ✅ Badges display with descriptions
- ✅ Unlocked badges are visually distinct
- ✅ New badges earn notifications
- ✅ Badge progress visible (e.g., "2/5 sales needed")

**Fail criteria:**
- ❌ All badges locked or all unlocked (not personalizing)
- ❌ No feedback when badge earned
- ❌ Badge conditions unclear

---

### 10.3 Streaks & Rewards (#59 FREE)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Shopper account. Go to `/shopper/dashboard` or loyalty page.

**Steps:**
1. See "Visit Streak" counter (days in a row visiting sales)
2. See "Save Streak" (days in a row saving items)
3. Make an action each day to extend streak
4. See streak bonus multiplier (2x points on day 7+)

**Expected result:** Streaks tracked and rewarded.

**Pass criteria:**
- ✅ Streak counter starts at 1 (after first action)
- ✅ Persists for 24h (can check next day)
- ✅ Bonus multiplier applies (2x points visible)
- ✅ Streak resets after 1 day inactivity

**Fail criteria:**
- ❌ Streak always 1 (not persisting)
- ❌ Multiplier doesn't apply
- ❌ Doesn't reset

---

### 10.4 Treasure Trail Route Builder (#48 FREE)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Shopper with saved items/sales. Go to `/shopper/trails`

**Steps:**
1. Click "Create Trail"
2. Select 3–4 sales from saved
3. System calculates optimal route (OSRM routing)
4. See map with route + turn-by-turn directions
5. Share trail (generates token)

**Expected result:** Trail created with optimized route.

**Pass criteria:**
- ✅ Route follows logical order (not zig-zag across map)
- ✅ Can share trail with unique URL
- ✅ Other users can view trail (read-only)
- ✅ Directions load from map service

**Fail criteria:**
- ❌ Route illogical (backtracking)
- ❌ Share link broken
- ❌ Maps don't load (might indicate API key missing)

---

## 11. Advanced Features (20 min)

### 11.1 Collector Passport (#45 FREE)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Shopper account. Go to `/shopper/collector-passport`

**Steps:**
1. See specialty categories (e.g., Books, Vintage Fashion, Furniture)
2. Collection progress bars (e.g., "3/20 first editions collected")
3. Earn completion badges per category
4. Public profile shows "Collector" badge

**Expected result:** Collection tracking active.

**Pass criteria:**
- ✅ Categories display
- ✅ Progress tracked from purchases
- ✅ Badges earned for completing categories (if applicable)
- ✅ Public profile shows collector status

**Fail criteria:**
- ❌ Categories empty or not loading
- ❌ Progress not tracking

---

### 11.2 Loot Log (#50 FREE)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Shopper with purchases. Go to `/shopper/loot-log`

**Steps:**
1. See personal purchase history
2. Each item shows: photo, title, price paid, date, sale
3. Can filter by date or sale
4. Can add notes ("Great condition!")
5. Photos auto-attach from receipt

**Expected result:** Purchase history with photos + prices.

**Pass criteria:**
- ✅ All past purchases appear
- ✅ Photos auto-populate from POS receipt
- ✅ Can add notes and persist
- ✅ Filter by date/sale works

**Fail criteria:**
- ❌ Purchases missing
- ❌ Photos don't load (should have fallback placeholder)
- ❌ Notes don't save

---

### 11.3 UGC Photo Tags (#47 FREE)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Item detail page. Scroll to "Photos" section.

**Steps:**
1. See organizer photos + shopper-submitted photos (if any)
2. Shopper can upload "in context" photo (item in their home, etc.)
3. Photo submitted for moderation (pending state)
4. Organizer can approve/reject in dashboard

**Expected result - Shopper:**
- ✅ Upload button visible on item detail
- ✅ Can select photo from phone/computer
- ✅ Submitted photos show "Pending Review" badge

**Expected result - Organizer:**
- ✅ Go to `/organizer/moderation`
- ✅ See pending photos
- ✅ Can approve (adds to gallery) or reject (remove)

**Pass criteria:**
- ✅ Upload works and submits
- ✅ Moderation queue visible to organizer
- ✅ Approved photos appear on item detail

**Fail criteria:**
- ❌ Upload button missing
- ❌ Photos stuck in "pending" (no moderation option)
- ❌ Moderation queue not visible

---

### 11.4 Bounties / Item Requests (#381 FREE)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Shopper account. Go to `/organizer/bounties`

**Steps - Shopper side:**
1. Click "Add Bounty" (can't find specific item)
2. Title: "Vintage Leather Wingback Chair"
3. Description: "Must be dark brown, good condition"
4. Submit

**Expected result - Organizer side:**
1. Go to `/organizer/bounties`
2. See shopper requests
3. When you add matching item, organizer can "fulfill" bounty
4. Shopper notified: "Your bounty was fulfilled!"

**Pass criteria:**
- ✅ Bounties created and appear in organizer list
- ✅ Organizer can fulfill (matches to item)
- ✅ Shopper notified when fulfilled
- ✅ Vote system (other shoppers can vote for bounties)

**Fail criteria:**
- ❌ Bounty creation fails
- ❌ Organizer list doesn't show bounties
- ❌ Notification doesn't send

---

## 12. Mobile & PWA Features (20 min)

### 12.1 Responsive Layout (Mobile)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Any page. Open in Chrome DevTools → Device Toolbar → iPhone 13

**Steps:**
1. Browse `/map` — should stack vertically, touch-friendly
2. Click item card → detail page responsive
3. Forms should have large touch targets (40px+ buttons)
4. Nav collapses to hamburger menu on small screens

**Expected result:** Layout adapts to screen size.

**Pass criteria:**
- ✅ No horizontal scroll
- ✅ Touch targets ≥40px
- ✅ Text readable (no tiny fonts)
- ✅ Inputs mobile-friendly (number pad for price fields)

**Fail criteria:**
- ❌ Horizontal scroll needed
- ❌ Buttons too small to tap
- ❌ Text unreadable

---

### 12.2 Camera Input (Mobile)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Mobile device (iOS/Android). Go to `/organizer/sales/[id]/add-items` on phone.

**Steps:**
1. Click "Camera" button
2. Camera opens
3. Take photo
4. Photo auto-fills item form

**Expected result:** Camera works on mobile browsers.

**Pass criteria:**
- ✅ Camera input button present
- ✅ Launches native camera app (or web camera if web.dev supported)
- ✅ Photo captured and auto-inserts into form
- ✅ Works on iOS + Android

**Fail criteria:**
- ❌ Camera button missing
- ❌ Opens file picker instead of camera
- ❌ Photo doesn't insert into form

**Notes:** Requires camera permission. First use will prompt.

---

### 12.3 PWA Install Prompt
**Status:** ✅ Ready to test
**Time:** 3 min

**Setup:** Mobile device (iOS Safari / Android Chrome). Go to finda.sale

**Steps:**
1. Android Chrome: See "Install" banner at bottom
2. iOS Safari: See "Share → Add to Home Screen" prompt
3. Click to install
4. App appears on home screen

**Expected result:** Users can install as standalone app.

**Pass criteria:**
- ✅ Install prompt appears (may be after 2nd visit)
- ✅ App icon + name correct
- ✅ Launches in full-screen mode (no browser chrome)

**Fail criteria:**
- ❌ No install prompt
- ❌ App doesn't launch full-screen (browsers chrome visible)

**Notes:** Requires HTTPS + service worker. Already in production.

---

### 12.4 Offline Mode (#22 LOW-BANDWIDTH + #69 OFFLINE)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Mobile device with `#22 Low-Bandwidth Mode` or `#69 Offline Mode` enabled.

**Steps:**
1. Go to settings → Low-Bandwidth Mode → toggle ON
2. Browse sales (images load lower-res)
3. Go to `/organizer/sales` with items downloaded
4. Disable Wi-Fi + cellular
5. Scroll items (should load from cache)

**Expected result:** Graceful offline experience.

**Pass criteria:**
- ✅ Images reduce in quality (save bandwidth)
- ✅ Cached pages load offline
- ✅ Service worker active (check DevTools)
- ✅ Sync queue stores mutations until online

**Fail criteria:**
- ❌ Toggle missing
- ❌ Still tries to load images from network when offline
- ❌ Blank page when offline (no caching)

**Notes:** Test on slow network (DevTools Throttling) to see bandwidth impact.

---

### 12.5 Push Notifications (Mobile)
**Status:** ✅ Ready to test
**Time:** 2 min

**Setup:** Mobile device with push enabled. Create an auction or hold.

**Steps:**
1. Auction ending soon → should get push notification
2. Outbid → should get push notification
3. Item expired hold → should get push notification

**Expected result:** Device receives timely push notifications.

**Pass criteria:**
- ✅ Notifications appear on lock screen
- ✅ Notification text is actionable ("You were outbid. Bid now.")
- ✅ Tapping redirects to relevant page

**Fail criteria:**
- ❌ No notifications received
- ❌ Notifications too generic ("You have a new notification")
- ❌ Tap doesn't redirect

---

## 13. Error States & Edge Cases (15 min)

### 13.1 404 Page Not Found
**Status:** ✅ Ready to test
**Time:** 2 min

**Steps:**
1. Go to `/sales/nonexistent-slug`
2. See 404 page with "Sale not found" message
3. See link back to `/map` or home

**Expected result:** Clear error message + recovery path.

**Pass criteria:**
- ✅ 404 page displays
- ✅ Message is user-friendly (not "Route not found")
- ✅ Home or back link present

---

### 13.2 403 Permission Denied
**Status:** ✅ Ready to test
**Time:** 2 min

**Steps:**
1. Log in as Shopper
2. Go to `/organizer/dashboard`
3. See 403 "Access Denied" message

**Expected result:** Clear permission error.

**Pass criteria:**
- ✅ Redirects to login or shows permission error
- ✅ Message explains why (e.g., "Organizers only")

---

### 13.3 Network Offline
**Status:** ✅ Ready to test
**Time:** 3 min

**Setup:** Any page. DevTools → Offline mode or disable Wi-Fi.

**Steps:**
1. Trigger network request (load page / search)
2. See offline banner or error message
3. Go back online
4. Page auto-recovers

**Expected result:** Graceful offline detection.

**Pass criteria:**
- ✅ Error banner appears ("You're offline")
- ✅ Can still view cached content
- ✅ Auto-retries when back online

**Fail criteria:**
- ❌ Blank white page (no error message)
- ❌ Cached content doesn't show

---

### 13.4 Rate Limiting
**Status:** ✅ Ready to test
**Time:** 3 min

**Steps:**
1. Try to create 20 AI tag suggestions in 1 minute (hit limit)
2. See error: "Too many requests. Try again in X minutes."

**Expected result:** Rate limiter active and communicative.

**Pass criteria:**
- ✅ Request rejected with clear message
- ✅ Message says when to retry
- ✅ Limit resets correctly

---

### 13.5 File Upload Validation
**Status:** ✅ Ready to test
**Time:** 2 min

**Setup:** Add item page. Try to upload invalid file.

**Steps:**
1. Try uploading PDF or text file (not image)
2. Should see error: "Only JPG, PNG, WebP allowed"
3. Try uploading 50MB file
4. Should see error: "Max 10MB per file"

**Expected result:** Clear upload validation.

**Pass criteria:**
- ✅ Invalid file types rejected
- ✅ Size limit enforced
- ✅ Error messages are clear

---

## 14. Accessibility Spot Checks (10 min)

### 14.1 Keyboard Navigation
**Status:** ✅ Ready to test
**Time:** 5 min

**Steps:**
1. Disable mouse (or just use keyboard)
2. Go to any page
3. Tab through interactive elements
4. Order should be logical (left-to-right, top-to-bottom)
5. Can press Enter/Space on buttons

**Expected result:** Full keyboard navigation possible.

**Pass criteria:**
- ✅ Tab order is logical
- ✅ Focus visible (outline or highlight)
- ✅ Can submit forms with keyboard
- ✅ Modal dialogs trap focus

**Fail criteria:**
- ❌ Tab gets stuck or skips elements
- ❌ Focus invisible
- ❌ Focus jumps around randomly

---

### 14.2 Screen Reader Labels (ARIA)
**Status:** ✅ Ready to test
**Time:** 5 min

**Setup:** Any page. Use screen reader (NVDA on Windows, VoiceOver on macOS/iOS).

**Steps:**
1. Open page with screen reader
2. Navigate by headings, landmarks, buttons
3. Listen for descriptive labels (not just "Button" or "Click here")

**Expected result:** Accessible navigation and descriptions.

**Pass criteria:**
- ✅ Headings have descriptive text (not "h1" or blank)
- ✅ Buttons have labels (not icon-only)
- ✅ Images have alt text
- ✅ Form labels associated with inputs

**Fail criteria:**
- ❌ "Button", "Click here", "Read more" without context
- ❌ Images with no alt
- ❌ Form inputs with no label

---

## Browser-Specific Notes

### Passkey Login (#19)
- **Chrome/Edge:** ✅ Full support (Windows Hello, fingerprint)
- **Safari:** ⚠️ Limited (iCloud Keychain only)
- **Firefox:** ❌ Not yet supported
- **Note:** Currently not surfaced in UI — backend ready but frontend integration pending

### Voice-to-Tag (#42)
- **Chrome:** ✅ Full support (Web Speech API)
- **Safari:** ⚠️ Partial (requires microphone permission)
- **Firefox:** ⚠️ Partial
- **Edge:** ✅ Full support
- **Note:** Requires HTTPS + microphone permission

### Camera Input
- **Chrome/Edge:** ✅ Native camera (mobile + desktop)
- **Safari:** ✅ iOS camera (mobile), limited desktop support
- **Firefox:** ✅ Mobile camera
- **Note:** Requires HTTPS + camera permission

### Dark Mode
- **All browsers:** ✅ Full support (uses Tailwind dark: variants + localStorage)
- **Note:** Some older screens may not have perfect contrast in dark mode—report if unreadable

---

## Testing Summary

**Total Estimated Time:** 90 minutes (all workflows)
**Quick Smoke Test:** 10 minutes (absolute minimum)
**Typical Session:** 30–45 minutes (pick 2–3 workflow groups)

**Completed Features:** 146 features shipped and live
**In-Progress (TIER 1):** 2 features (#19 Passkey P0 fix pending merge, #54 Appraisal AI Sprint 3 deferred)
**Recently Fixed (S202):** #51 Ripples + #60 Premium — P1 fixes applied (@findasale/shared removal, pricing TIER_CONFIG). Human-ready after #51 Neon migration.
**Untestable (DB/API only):** ~6 features (no UI yet)
**Missing dedicated test sections:** #7 Referral, #17 Bid Bot, #18 Performance Analytics, #20 Degradation, #46 Typology, #51 Ripples — all passed QA S201 but no step-by-step test cases in this guide yet.

---

## Feedback & Bug Reporting

Found an issue? Report with:
1. **Feature name** (e.g., "#19 Passkey Login")
2. **Device/browser** (iPhone 13 Safari, Windows Chrome, etc.)
3. **Steps to reproduce** (concise)
4. **Expected vs. actual** (what you expected to see)
5. **Screenshot or video** (if possible)

Post in MESSAGE_BOARD.json or mention in next session sync.

---

**Last Updated:** 2026-03-18 by Session 202 (P1 fixes, QA column updates)
**Next Update:** After Chrome MCP verification pass on 38 routes + missing test sections added.
