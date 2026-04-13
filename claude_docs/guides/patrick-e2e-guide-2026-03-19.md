# Patrick E2E Testing Guide — FindA.Sale
**Last Updated:** 2026-03-19
**Estimated Total Time:** 120 minutes (comprehensive workflow)
**Format:** Grouped by feature area. Skip sections you've already tested.

**DB Test Accounts:**
- `user1@example.com` / `password123` → ORGANIZER SIMPLE tier
- `user2@example.com` / `password123` → ORGANIZER PRO tier
- `user3@example.com` / `password123` → ORGANIZER TEAMS tier
- `user11@example.com` / `password123` → Shopper

---

## Quick Smoke Test (10 minutes)

Run this first to catch obvious breaks.

1. **Homepage load** → `/` loads, shows active sales map
2. **Shopper browse** → Click "Browse Sales" → see calendar + map
3. **Login** → Use `user1@example.com` / `password123`, redirect to organizer dashboard
4. **Organizer dashboard** → See sales list + quick-links
5. **Dark mode toggle** → Click theme icon, page switches + persists on reload

**Pass:** All 5 load without 404/500. Dark mode persists in localStorage.

---

## 1. Authentication & Account Setup (15 min)

### 1.1 Registration Flow (Foundation)
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

---

### 1.2 Login Flow
**Time:** 3 min
**Setup:** Use existing account or `user1@example.com` / `password123`

**Steps:**
1. Go to `/auth/login`
2. Enter email
3. Enter password
4. Click "Sign In"

**Expected result:** Redirect to `/organizer/dashboard` for organizers, or shopper dashboard for shoppers.

**Pass criteria:**
- ✅ Dashboard loads with sales/activity list
- ✅ User menu shows your email in top-right
- ✅ Session persists on page reload

---

### 1.3 Password Reset
**Time:** 5 min
**Setup:** Go to `/auth/login`

**Steps:**
1. Click "Forgot Password"
2. Enter email
3. Check inbox for reset link (may appear in a test email service)
4. Click link and set new password
5. Log in with new password

**Expected result:** Password reset works. Can log in with new password.

**Pass criteria:**
- ✅ Reset email sent
- ✅ Reset link valid (not expired)
- ✅ New password accepted

---

### 1.4 Dark Mode Toggle
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
- ✅ All text readable in both modes (no contrast issues)
- ✅ localStorage entry created (`theme: "dark"` or `"light"`)

---

## 2. Organizer Core Operations (40 min)

### 2.1 Create a Sale
**Time:** 8 min
**Setup:** Logged in as organizer. Go to `/organizer/sales/new`

**Steps:**
1. Enter sale title: "Test Estate Sale — Grand Rapids"
2. Select type: ESTATE (also test CHARITY, BUSINESS, CORPORATE)
3. Select dates: Tomorrow 9am → day after 3pm
4. Enter address: "123 Main St, Grand Rapids, MI"
5. Click map to pin location (green marker appears)
6. Select refund policy: "7 days"
7. Click "Create Sale"

**Expected result:** Redirect to sale detail page. See "Draft" badge.

**Pass criteria:**
- ✅ Sale appears in organizer dashboard list
- ✅ Map shows correct location pin
- ✅ Sale detail page loads with all entered data
- ✅ Edit/publish buttons present
- ✅ Sale types validate correctly (FIXED/AUCTION/REVERSE_AUCTION/LIVE_DROP/POS options available for items)

---

### 2.2 Edit Sale Details
**Time:** 5 min
**Setup:** Sale from 2.1 or any existing draft sale

**Steps:**
1. Click "Edit" button (pencil icon)
2. Change title to "Updated: Test Estate"
3. Change refund policy: "14 days"
4. Add business description
5. Save changes

**Expected result:** Title and details update on page. Persist on reload.

**Pass criteria:**
- ✅ Changes persist on reload
- ✅ No validation errors
- ✅ Sale list shows updated title
- ✅ Refund policy visible in sale settings

---

### 2.3 Publish Sale
**Time:** 5 min
**Setup:** Draft sale from 2.1

**Steps:**
1. Verify sale has title, address, dates, business name (health check)
2. Look for health score indicator (green/yellow/red)
3. Click "Publish" button
4. Confirm in modal

**Expected result:** Sale badge changes from "Draft" to "Published". Sale appears in shopper map/browse.

**Pass criteria:**
- ✅ Badge changes immediately
- ✅ Sale visible on `/map` (search by address or date)
- ✅ Sale shows "Published" in organizer list
- ✅ Health score visible (% complete)

---

### 2.4 Archive Sale
**Time:** 2 min
**Setup:** Any published sale

**Steps:**
1. Click menu (3 dots) → "Archive"
2. Confirm

**Expected result:** Sale moves to "Archived" tab. No longer visible to shoppers.

**Pass criteria:**
- ✅ Moves to archived section
- ✅ Disappears from shopper map/browse

---

### 2.5 Entrance Pin / Front Door Locator
**Time:** 3 min
**Setup:** Sale detail page. Logged in as organizer.

**Steps:**
1. Go to sale settings
2. Look for "Entrance Location" or "Front Door" field
3. Enter address and click map to pin entrance
4. Add parking directions (optional)
5. Save
6. Log in as shopper and view sale detail
7. See entrance pin + parking info displayed

**Expected result:** Shoppers see entrance location on sale detail page.

**Pass criteria:**
- ✅ Entrance pin appears on map
- ✅ Directions visible to shoppers
- ✅ Parking details saved and displayed

---

### 2.6 Sale Checklist
**Time:** 3 min
**Setup:** Sale detail page. Logged in as organizer.

**Steps:**
1. Go to sale settings
2. Find "Sale Checklist" section
3. Add custom checklist items: "Set up tables", "Price items", "Make signs"
4. Check off items as complete
5. See progress bar

**Expected result:** Checklist appears on sale detail, helps organize pre-sale tasks.

**Pass criteria:**
- ✅ Can add/edit/delete checklist items
- ✅ Checks persist
- ✅ Progress bar updates

---

## 3. Item Management (45 min)

### 3.1 Add Item Manually
**Time:** 5 min
**Setup:** Published sale. Go to `/organizer/sales/[id]/add-items`

**Steps:**
1. Click "+ Add Item"
2. Enter title: "Vintage Oak Desk"
3. Enter description: "Solid oak, 1970s, minor scratches"
4. Upload photo
5. Select category: "Furniture"
6. Select listing type: "FIXED" (fixed price)
7. Enter price: $150
8. Click "Save"

**Expected result:** Item appears in sale inventory. Item card shows all entered data.

**Pass criteria:**
- ✅ Item appears in list immediately
- ✅ Photo displays
- ✅ Category + price visible on card
- ✅ Edit button present
- ✅ Listing type enforced (FIXED/AUCTION/REVERSE_AUCTION/LIVE_DROP/POS)

---

### 3.2 AI Tag Suggestions
**Time:** 5 min
**Setup:** Add another item titled "Gold Picture Frame"

**Steps:**
1. Upload photo
2. Look for "AI Tag Suggestions" section
3. Should see 3–5 auto-generated tags (e.g., "frame", "gold", "vintage")
4. Click tags to add; skip others
5. Manually add custom tag if needed
6. Save item

**Expected result:** Tags saved with item. Display as pills on item card.

**Pass criteria:**
- ✅ AI suggestions appear within 2 sec of upload
- ✅ Tags are contextually relevant (not random)
- ✅ Custom tag field allows free-form entry
- ✅ Tags display on card

---

### 3.3 Condition Grading (AI-Assisted)
**Time:** 3 min
**Setup:** Any item with photo

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
- ✅ Grade displays on item card

---

### 3.4 Item Health Score
**Time:** 2 min
**Setup:** Item detail page

**Steps:**
1. Look for health score percentage (on add/edit page)
2. Score based on: title, description, photo, category, price, condition
3. Below 40% = blocks publishing; 40-70% = nudge; above 70% = green
4. Add missing data and watch score improve

**Expected result:** Health score guides item quality.

**Pass criteria:**
- ✅ Score updates as you fill fields
- ✅ Progress bar shows visually
- ✅ Publishes allowed above threshold

---

### 3.5 Batch Operations (Bulk Edits)
**Time:** 5 min
**Setup:** Sale with 5+ items

**Steps:**
1. Select 3 items (checkboxes appear on hover or card click)
2. Look for "Batch Actions" toolbar at bottom
3. Change status: "Sold"
4. Click "Apply"
5. Select 3 different items, bulk change price to $99
6. Apply

**Expected result:** All selected items update simultaneously.

**Pass criteria:**
- ✅ Toolbar appears when items selected
- ✅ All selected items update (not just first)
- ✅ Status change visible on cards
- ✅ Reload reverts behavior: changes persist (no revert)

**Notes:** Batch also supports category, tag, photo, price changes.

---

### 3.6 Rapidfire Camera Mode
**Time:** 5 min
**Setup:** `/organizer/sales/[id]/add-items` on mobile or desktop

**Steps:**
1. Click "Camera" or "Rapidfire Mode"
2. Take 3 photos in quick succession
3. System batches photos into draft items
4. AI suggests tags + condition for each photo
5. Review drafts and publish to sale

**Expected result:** Fast multi-photo intake with AI assistance.

**Pass criteria:**
- ✅ Camera opens and captures photos
- ✅ Photos batch into draft items
- ✅ AI tags appear within 2 sec
- ✅ Can publish all at once

---

### 3.7 Item Photo Upload (Single & Multi)
**Time:** 3 min
**Setup:** Add item form or edit existing item

**Steps:**
1. Click "Add Photo"
2. Select single image (JPG/PNG/WebP, <10MB)
3. Photo uploads to Cloudinary
4. Try uploading invalid file (PDF)
5. See error: "Only JPG, PNG, WebP allowed"

**Expected result:** Photos upload quickly. Validation enforced.

**Pass criteria:**
- ✅ Single + multi-photo upload works
- ✅ Photos appear in item detail (gallery)
- ✅ Invalid files rejected with clear error
- ✅ Size limit enforced (>10MB rejected)

---

### 3.8 Item Holds / Reservations (Core)
**Time:** 5 min
**Setup:** Published sale. Test as both organizer and shopper.

**Steps - Shopper side:**
1. Go to sale detail (`/sales/[slug]`)
2. Click item card
3. Click "Hold This Item" (blue button)
4. See hold confirmation + expiry (48h default)

**Steps - Organizer side:**
1. Go to `/organizer/sales/[id]/holds`
2. See buyer name + timestamp. Grouped by buyer.
3. Can extend hold, release, or mark sold

**Expected result:** Holds tracked and managed.

**Pass criteria:**
- ✅ Hold duration shows (default 48h)
- ✅ Organizer can see holds list
- ✅ Release button available for organizer
- ✅ Expired holds auto-release after configured window
- ✅ Grouped by buyer on organizer view

---

### 3.9 Hold Duration Configuration
**Time:** 2 min
**Setup:** Sale settings

**Steps:**
1. Go to sale settings
2. Find "Hold Duration" setting
3. Change to 72 hours (3 days)
4. Save
5. Test hold from shopper side
6. Verify expiry is 72 hours out

**Expected result:** Hold duration configurable per-sale.

**Pass criteria:**
- ✅ Setting saves
- ✅ New holds use custom duration
- ✅ Existing holds unaffected

---

### 3.10 Holds-Only Item View (Batch Ops)
**Time:** 3 min
**Setup:** Sale with multiple holds. `/organizer/sales/[id]/holds`

**Steps:**
1. See items grouped by buyer
2. Can bulk action: extend hold, release, mark sold
3. See hold expiry countdown

**Expected result:** Dedicated view for managing all holds.

**Pass criteria:**
- ✅ Holds grouped by buyer
- ✅ Bulk actions work
- ✅ Expiry clear + countdowns visible

---

### 3.11 Edit / Delete Items
**Time:** 3 min
**Setup:** Item detail or item list

**Steps:**
1. Click edit (pencil icon) on item card
2. Change price, description, category
3. Save
4. Click delete (trash icon)
5. Confirm deletion

**Expected result:** Item edits persist. Deletion removes item from sale.

**Pass criteria:**
- ✅ Edits persist on reload
- ✅ Delete removes from inventory
- ✅ Deleted items no longer visible to shoppers

---

## 4. Item Library & Productivity (10 min)

### 4.1 Item Library (Consignment Rack)
**Time:** 5 min
**Setup:** Organizer with past sales. Go to `/organizer/library`

**Steps:**
1. See uploaded items from previous sales
2. Search by title or tag
3. Click an item → see price history (sold count, average price)
4. Click "Reuse in New Sale" → add to new sale with one click
5. Verify photo and data copied over

**Expected result:** Library allows fast reuse of items across sales.

**Pass criteria:**
- ✅ Items from past sales appear
- ✅ Search works by title/tag
- ✅ Price history populated (if item sold before)
- ✅ Can add to new sale without re-uploading photo

---

### 4.2 CSV Listing Import
**Time:** 5 min
**Setup:** Add items page. Have a CSV ready (title, price, category, description).

**Steps:**
1. Click "Import from CSV"
2. Select or paste CSV (headers: title, price, category, description, condition)
3. Preview items
4. Click "Import"
5. Items batch-added to sale

**Expected result:** CSV bulk upload speeds up inventory entry.

**Pass criteria:**
- ✅ CSV parsed correctly
- ✅ Preview shows items before import
- ✅ All items added successfully
- ✅ No photos attached (for CSV import)

---

## 5. Auctions & Bidding (20 min)

### 5.1 Create Auction Item
**Time:** 5 min
**Setup:** Add items page. Listing type = AUCTION

**Steps:**
1. Add item: "Vintage Bulova Watch"
2. Set listing type: "AUCTION"
3. Set starting bid: $10
4. Set auction end: 2 hours from now
5. Save

**Expected result:** Item shows "Auction" badge with countdown timer.

**Pass criteria:**
- ✅ Timer counts down (updates every second)
- ✅ Countdown shows correct time (days/hours/minutes)
- ✅ Item listed as auction in shopper view
- ✅ Starting bid enforced

---

### 5.2 Place a Bid (Shopper Side)
**Time:** 5 min
**Setup:** Logged in as shopper. View auction item detail.

**Steps:**
1. See current bid + bid history
2. Enter bid amount (must exceed current bid + min increment, typically $1)
3. Click "Place Bid"
4. See confirmation message
5. Check bid history to verify it appears

**Expected result:** Bid appears in history. Bid count increments.

**Pass criteria:**
- ✅ Bid appears in list immediately
- ✅ Bid validation: reject if too low (shows error)
- ✅ Bid count on item updates
- ✅ High bidder name visible (or hidden for privacy)
- ✅ Organizer receives notification

---

### 5.3 Auto-Bidding
**Time:** 3 min
**Setup:** Auction item

**Steps:**
1. As Shopper A: Check "Auto-bid up to $50"
2. As Shopper B: Place bid $30
3. Watch Shopper A's auto-bid increment to next tier (if <$50)
4. Check bid history

**Expected result:** System automatically increments your bid within limit.

**Pass criteria:**
- ✅ Auto-bid increments correctly
- ✅ Doesn't exceed max bid amount
- ✅ Outbid notification sent to previous high bidder

---

### 5.4 Auction Closure & Winner Notification
**Time:** 2 min
**Setup:** Auction ending soon or create test auction with 2-min timer

**Steps:**
1. Wait for auction to end (or manually trigger closure)
2. Refresh item page
3. See "Auction Closed" badge
4. High bidder sees "You Won!" notification

**Expected result:** Auction closes automatically. Emails sent to winner + organizer.

**Pass criteria:**
- ✅ Item status changes to "Closed"
- ✅ Winner notified via in-app notification
- ✅ Organizer sees winner name in dashboard
- ✅ Item moves to hold/purchase flow

---

### 5.5 Reverse Auction (Shopper Offers Price)
**Time:** 3 min
**Setup:** Add item with listing type: "REVERSE_AUCTION"

**Steps:**
1. Item shows with "Make an Offer" button
2. Shopper enters desired price
3. Organizer reviews offer
4. Organizer accepts/rejects
5. If accepted, shopper can proceed to hold/checkout

**Expected result:** Shoppers can make offers on items.

**Pass criteria:**
- ✅ "Make an Offer" button visible
- ✅ Offer submitted and appears in organizer queue
- ✅ Organizer can accept/reject with reason
- ✅ Shopper notified of decision

---

### 5.6 Bid Bot Detector & Fraud Score
**Time:** 3 min
**Setup:** PRO organizer. View holds or auction bids.

**Steps:**
1. Go to sale dashboard or holds view
2. Look for "Fraud Badge" or "Suspicious Activity" indicator
3. Hover for details: auto-bidding pattern, same-device repeats, etc.
4. Can flag buyer for review

**Expected result:** Organizer sees fraud signals on holds/bids.

**Pass criteria:**
- ✅ Badge appears on suspicious bids
- ✅ Details explain signal (e.g., "rapid auto-increments")
- ✅ Can manually flag for review

---

## 6. Shopper Discovery (30 min)

### 6.1 Browse Sales by Map
**Time:** 5 min
**Setup:** Go to `/map` (logged out or in as shopper)

**Steps:**
1. See interactive Leaflet map with sale pins
2. Zoom in/out
3. Click a sale pin → popup with sale name + date
4. Click popup → redirects to sale detail page
5. Try heatmap overlay (optional: `/map?heatmap=true`)

**Expected result:** Map loads, pins visible, interactions work.

**Pass criteria:**
- ✅ Map loads within 3 sec
- ✅ Pins appear at correct locations
- ✅ Popup shows sale title + dates
- ✅ Click redirects to sale detail
- ✅ Zoom/pan smooth

---

### 6.2 Browse Sales by Calendar
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
- ✅ Future dates clear, past dates greyed out

---

### 6.3 Neighborhood Heatmap
**Time:** 3 min
**Setup:** `/map` with heatmap enabled or `/neighborhood-heatmap`

**Steps:**
1. See density-based color overlay (red = hot, blue = cold)
2. Hover over area to see "estimated sales this week"
3. Filter by category (optional)

**Expected result:** Shoppers see where sales are concentrated.

**Pass criteria:**
- ✅ Heatmap loads (takes ~1-2 sec)
- ✅ Color gradient matches density
- ✅ Tooltip shows count on hover

---

### 6.4 Search with Filters
**Time:** 5 min
**Setup:** Go to `/search` or use search bar in header

**Steps:**
1. Search term: "desk"
2. Apply filters: Category = Furniture, Price: $50–$200, Condition: A or B
3. See results
4. Apply location filter: "Within 5 miles"
5. Clear filters with "Reset"

**Expected result:** Items matching criteria appear.

**Pass criteria:**
- ✅ Results appear within 2 sec
- ✅ Filters ORed correctly (A OR B condition)
- ✅ Price range respected
- ✅ Location filter works
- ✅ Can clear filters with "Reset"

---

### 6.5 Browse by Category & Tags
**Time:** 5 min
**Setup:** Go to `/categories`

**Steps:**
1. See category list (Furniture, Decor, Books, Jewelry, etc.)
2. Click "Furniture" → see all furniture items
3. Go back, click a tag from tag cloud
4. See items with that tag

**Expected result:** Both category + tag browsing work smoothly.

**Pass criteria:**
- ✅ Category pages load
- ✅ Item count accurate
- ✅ Tag pages work (may be ISR cached — cache up to 1 hour)
- ✅ Can drill from category to specific tag

---

### 6.6 Surprise Me / Serendipity Search
**Time:** 2 min
**Setup:** Go to `/surprise-me`

**Steps:**
1. Click "Surprise Me"
2. Random item loads
3. Click again for different item
4. See "See More Like This" CTA

**Expected result:** Serendipitous discovery feature.

**Pass criteria:**
- ✅ Random items load
- ✅ Items vary (not same item repeating)
- ✅ Items are actual listings (not placeholders)

---

### 6.7 Trending Items & Sales
**Time:** 3 min
**Setup:** Go to `/trending`

**Steps:**
1. See top items this week (by views/holds/favorites)
2. See top sales (by activity)
3. Tap item → detail page

**Expected result:** Trending page shows popular finds.

**Pass criteria:**
- ✅ Trending page loads
- ✅ Items change over time (not static)
- ✅ Can sort by metric (views, holds, favorites)

---

### 6.8 Activity Feed
**Time:** 2 min
**Setup:** Go to `/feed`

**Steps:**
1. See real-time activity: "Sarah liked Vintage Desk", "5 people saved Leather Chair", etc.
2. Click activity → drill to item/sale detail
3. See social proof indicators

**Expected result:** Activity feed shows engagement.

**Pass criteria:**
- ✅ Feed loads with recent activity
- ✅ Activities are relevant (not spam)
- ✅ Click redirects to item/sale

---

### 6.9 City Pages & Neighborhood Pages
**Time:** 3 min
**Setup:** Go to `/cities` or `/city/grand-rapids`

**Steps:**
1. See list of active cities
2. Click city → landing page with sales, heatmap, popular items
3. Go to `/neighborhoods/[slug]` (e.g., `/neighborhoods/east-hills`)
4. See neighborhood-specific sales

**Expected result:** Local discovery pages for SEO + UX.

**Pass criteria:**
- ✅ City pages load (ISR cached)
- ✅ Sales filtered by city/neighborhood
- ✅ Can navigate back to map

---

### 6.10 iCal / Calendar Export
**Time:** 2 min
**Setup:** Sale detail page or search results

**Steps:**
1. Look for "Export to Calendar" or download icon
2. Click to export .ics file
3. Open in Apple Calendar or Google Calendar
4. See sale appears with date/time

**Expected result:** Shoppers can add sales to personal calendar.

**Pass criteria:**
- ✅ Download triggers .ics file
- ✅ File opens in calendar app
- ✅ Date/time correct

---

### 6.11 QR Code Signs (Scannable Yard/Item Labels)
**Time:** 3 min
**Setup:** Organizer dashboard. Look for "QR Codes" or "Print Kit"

**Steps:**
1. Organizer generates QR codes for sale + items
2. QR code links to `/sales/[slug]` or `/items/[id]`
3. Shopper scans QR code from item label in-person
4. Mobile browser opens item detail page

**Expected result:** QR codes drive in-person discovery.

**Pass criteria:**
- ✅ QR codes generate (printable)
- ✅ QR scan redirects to correct URL
- ✅ Mobile page loads quickly

---

### 6.12 QR Scan Analytics
**Time:** 2 min
**Setup:** Organizer dashboard. Published sale with QR codes.

**Steps:**
1. Go to analytics or QR section
2. See scan counts by code
3. See geographic origin of scans (if available)

**Expected result:** Organizer tracks QR engagement.

**Pass criteria:**
- ✅ Scan counts recorded and displayed
- ✅ Historical data available

---

## 7. Shopper Engagement & Wishlists (20 min)

### 7.1 Wishlists (Full CRUD)
**Time:** 5 min
**Setup:** Logged in as shopper. `/wishlists`

**Steps:**
1. Create new wishlist: "Victorian Furniture"
2. Go to item detail → "Add to Wishlist" → select "Victorian Furniture"
3. Go back to wishlist page
4. See item in list
5. Rename wishlist to "1920s Antiques"
6. Delete wishlist

**Expected result:** Wishlists distinct from favorites. Full CRUD works.

**Pass criteria:**
- ✅ Create/edit/delete wishlists
- ✅ Add/remove items from wishlist
- ✅ Item count shows on wishlist card
- ✅ Persists on reload

---

### 7.2 Saved Searches with Notifications
**Time:** 5 min
**Setup:** Search page. Example: search "oak desk" with filters.

**Steps:**
1. After applying filters, click "Save This Search"
2. Toggle "Notify me when new items match"
3. Go back to searches page (`/saved-searches`)
4. See saved search in list
5. When organizer adds matching item, shopper gets notification

**Expected result:** Saved searches auto-notify on new matches.

**Pass criteria:**
- ✅ Search saved with all filters
- ✅ Can toggle notifications per search
- ✅ Notification sent within 5 min of new match
- ✅ Can edit/delete saved search

---

### 7.3 Favorites
**Time:** 2 min
**Setup:** Item detail page

**Steps:**
1. Click heart icon to favorite item
2. Go to `/shopper/favorites`
3. See favorited items
4. Unfavorite an item

**Expected result:** Quick-access favorites list.

**Pass criteria:**
- ✅ Heart icon toggles (filled/outline)
- ✅ Favorites page shows all favorited items
- ✅ Count updates

---

### 7.4 Shopper ↔ Organizer Messaging
**Time:** 5 min
**Setup:** Shopper + organizer logged in (separate browsers or devices)

**Steps - Shopper side:**
1. Go to sale detail → "Contact Organizer"
2. Open message thread
3. Send message: "Is this still available?"
4. See message appear

**Steps - Organizer side:**
1. Go to `/organizer/messages`
2. See thread list
3. Reply to shopper message
4. See conversation thread

**Expected result:** Threaded messaging between shopper + organizer.

**Pass criteria:**
- ✅ Messages persist (don't vanish on reload)
- ✅ Both parties see full thread
- ✅ Notifications sent when messages received
- ✅ Can delete messages (optional)

---

### 7.5 Buying Pools (Group Buying)
**Time:** 3 min
**Setup:** Shopper with friends. Item detail page.

**Steps:**
1. Click "Buy with Friends" or "Create Buying Pool"
2. Add friends (email or phone)
3. Enter shared price / split
4. Friends get invite link
5. When all agree, item goes to "group hold"

**Expected result:** Shoppers can split purchases.

**Pass criteria:**
- ✅ Pool created and friends invited
- ✅ Can split price equally
- ✅ All members notified

---

### 7.6 Bounties (Item Want-Ads)
**Time:** 3 min
**Setup:** Shopper dashboard or search page

**Steps:**
1. Click "Post a Bounty" or "Looking for..."
2. Title: "Vintage Leather Wingback Chair"
3. Description: "Must be dark brown, good condition"
4. Submit
5. As organizer: Go to `/organizer/bounties` and see shopper requests
6. When you add matching item, "fulfill" the bounty
7. Shopper gets notified

**Expected result:** Shoppers create demand signals.

**Pass criteria:**
- ✅ Bounty created and visible to organizers
- ✅ Organizer can fulfill bounty
- ✅ Shopper notified when fulfilled
- ✅ Vote system works (other shoppers upvote bounties)

---

## 8. Gamification & Social Features (25 min)

### 8.1 Points & Leaderboard
**Time:** 5 min
**Setup:** Shopper account. Go to `/leaderboard`

**Steps:**
1. See public leaderboard: top shoppers + top organizers
2. Your rank shown (e.g., "Rank 42 of 500 shoppers")
3. Visit a sale → earn 1 point
4. See your points update
5. Save an item → earn points
6. See leaderboard refresh (within 5 min)

**Expected result:** Gamification drives engagement.

**Pass criteria:**
- ✅ Points awarded for actions (visit, save, purchase)
- ✅ Leaderboard displays current top users
- ✅ Your rank visible
- ✅ Points update within 5 sec of action

---

### 8.2 Streaks & Rewards
**Time:** 5 min
**Setup:** Shopper account. Go to shopper dashboard or loyalty page.

**Steps:**
1. See "Visit Streak" counter (days in a row visiting sales)
2. See "Save Streak" (days in a row saving items)
3. See "Purchase Streak" (days in a row buying items)
4. Day 7+ shows 2x streak multiplier
5. Miss 1 day → streak resets
6. Check next day to verify persistence

**Expected result:** Streaks tracked and rewarded.

**Pass criteria:**
- ✅ Streak counter starts at 1 (after first action)
- ✅ Persists for 24h+
- ✅ Bonus multiplier applies (2x points visible after day 7)
- ✅ Streak resets after 1 day inactivity

---

### 8.3 Daily Treasure Hunt
**Time:** 3 min
**Setup:** Shopper dashboard or `/treasure-hunt`

**Steps:**
1. See daily clue: "Find a red item priced under $20"
2. Search for matching items
3. Click item that matches clue
4. Earn bonus points / badge

**Expected result:** Daily gamification engagement driver.

**Pass criteria:**
- ✅ New clue each day (resets at midnight)
- ✅ Clue is solvable (items exist matching description)
- ✅ Rewards clear

---

### 8.4 Achievement Badges
**Time:** 5 min
**Setup:** Shopper account. Go to `/shopper/achievements`

**Steps:**
1. See badge grid: "First Sale", "Treasure Hunter", "Speed Shopper", "Collector", etc.
2. Some locked (B&W), some unlocked (full color)
3. Perform action to unlock badge (e.g., make first purchase)
4. Locked badge becomes unlocked + notification sent
5. Public profile shows badges earned

**Expected result:** Badges earned for reaching milestones.

**Pass criteria:**
- ✅ Badges display with descriptions
- ✅ Unlocked badges are visually distinct (color)
- ✅ New badges earn notifications
- ✅ Badge progress visible (e.g., "2/5 sales needed")
- ✅ Public profile shows earned badges

---

### 8.5 Shopper Loyalty Passport
**Time:** 5 min
**Setup:** Shopper account. Go to `/shopper/loyalty`

**Steps:**
1. See stamp card (visual grid of stamps)
2. Visit a sale or interact with item → earn 1 stamp
3. See progress to next reward level (e.g., 5 stamps → "Early Access to New Sales")
4. Earn badges for completing levels
5. Claim rewards

**Expected result:** Stamps accumulate. Rewards unlock.

**Pass criteria:**
- ✅ Stamps appear after interaction (within 5 sec)
- ✅ Progress bar shows accurate count
- ✅ Rewards listed (even if not yet earned)
- ✅ Badge system working
- ✅ Rewards are meaningful (early access, discount, etc.)

---

### 8.6 Shiny / Rare Item Badges
**Time:** 2 min
**Setup:** Browse items or search

**Steps:**
1. See items with "Rare" or "Shiny" badge (special AI classification)
2. Badge indicates high-value or unique item
3. Clicking rare item earns bonus points

**Expected result:** Rare items highlighted.

**Pass criteria:**
- ✅ Badge displays on item card
- ✅ Indicates rarity clearly
- ✅ Affects points/gamification

---

### 8.7 Near-Miss Nudges
**Time:** 2 min
**Setup:** Shopper browsing items or auctions

**Steps:**
1. As shopper: Get outbid on item, or hold expires soon
2. See smart notification: "Someone just outbid you on Vintage Watch. Counter-bid now?"
3. Click through to item
4. Different nudge types based on behavior

**Expected result:** Retention-focused notifications (casino psychology).

**Pass criteria:**
- ✅ Nudges appear contextually
- ✅ Text is action-oriented
- ✅ Can dismiss nudges
- ✅ Respects notification preferences

---

### 8.8 Hunt Pass ($4.99/30 days)
**Time:** 3 min
**Setup:** Shopper dashboard. Look for "Hunt Pass" or gamification section.

**Steps:**
1. See "Hunt Pass" upgrade CTA: "2× Streak Multiplier + Exclusive Perks"
2. Click "Subscribe"
3. Stripe payment form appears ($4.99/month, recurring)
4. Complete payment
5. Verify 2× multiplier active on next streak action

**Expected result:** Paid subscription for doubled streak rewards.

**Pass criteria:**
- ✅ CTA visible and clear
- ✅ Stripe payment works (test mode)
- ✅ Subscription created with 30-day recurrence
- ✅ Multiplier active after purchase
- ✅ Can cancel subscription in account settings

---

### 8.9 Unsubscribe-to-Snooze (MailerLite)
**Time:** 2 min
**Setup:** Email marketing (if applicable)

**Steps:**
1. Receive email from FindA.Sale
2. Click "Unsubscribe" link
3. See "Snooze for 30 days" option (instead of full unsubscribe)
4. Click snooze
5. Verify no emails for 30 days, then resume

**Expected result:** Gentle unsubscribe with snooze option.

**Pass criteria:**
- ✅ Unsubscribe link present in emails
- ✅ Clicking shows snooze option
- ✅ Snooze saves and honors (no emails sent)
- ✅ Resumes after 30 days

---

### 8.10 Treasure Trail Route Builder
**Time:** 5 min
**Setup:** Shopper with saved items/sales. Go to `/shopper/trails`

**Steps:**
1. Click "Create Trail"
2. Select 3–4 sales from saved or search
3. System calculates optimal route (OSRM routing engine)
4. See map with route + turn-by-turn directions
5. Click "Share Trail" → generates unique URL
6. Send to friend, friend views read-only trail

**Expected result:** Trail created with optimized route.

**Pass criteria:**
- ✅ Route follows logical order (not zig-zag)
- ✅ Can share trail with unique URL
- ✅ Other users can view trail (read-only)
- ✅ Directions load from routing service

---

## 9. Advanced Shopper Features (20 min)

### 9.1 Collector Passport
**Time:** 5 min
**Setup:** Shopper account. Go to `/shopper/collector-passport`

**Steps:**
1. See specialty categories (e.g., "Books", "Vintage Fashion", "Furniture")
2. Collection progress bars (e.g., "3/20 first editions collected")
3. Make purchase in category → progress increases
4. Earn completion badges per category
5. Public profile shows "Collector" badge + collections

**Expected result:** Collection tracking for specialty shoppers.

**Pass criteria:**
- ✅ Categories display with progress
- ✅ Progress tracked from purchases
- ✅ Badges earned for completing categories
- ✅ Public profile shows collector status + collections

---

### 9.2 Loot Log
**Time:** 5 min
**Setup:** Shopper with purchases. Go to `/shopper/loot-log`

**Steps:**
1. See personal purchase history (timeline or grid)
2. Each item shows: photo, title, price paid, date, sale organizer
3. Can filter by date or sale
4. Can add notes: "Great condition!"
5. Photos auto-attach from receipt

**Expected result:** Purchase history with photos + prices.

**Pass criteria:**
- ✅ All past purchases appear
- ✅ Photos auto-populate from POS receipt
- ✅ Can add notes and persist
- ✅ Filter by date/sale works

---

### 9.3 Wishlist Alerts & Smart Follow
**Time:** 5 min
**Setup:** Shopper settings or wishlist page

**Steps:**
1. Go to wishlist
2. See "Smart Follow" or "Get Alerts" toggle
3. Enable alerts for "Category: Furniture" or "Tag: Victorian"
4. When organizer adds matching item, shopper gets notification
5. Can customize alert frequency

**Expected result:** Smart notifications for wishlist items.

**Pass criteria:**
- ✅ Category/tag alerts toggle visible
- ✅ Can follow specific organizers
- ✅ Notification sent within 5 min of new match
- ✅ Can edit alert preferences

---

### 9.4 Shopper Public Profiles
**Time:** 3 min
**Setup:** Shopper account or view other shopper profile

**Steps:**
1. Go to `/profile` to view own profile
2. See username, badges, collection highlights
3. Visit `/shoppers/[slug]` to see other shopper's profile
4. See their collected items, badges, activity

**Expected result:** Community-facing shopper identity.

**Pass criteria:**
- ✅ Profile page loads with correct data
- ✅ Can edit own profile (name, bio, avatar)
- ✅ Other shoppers can view profile (read-only)

---

### 9.5 UGC Photo Tags
**Time:** 5 min
**Setup:** Item detail page. Scroll to "Photos" section.

**Steps:**
1. See organizer photos + shopper-submitted photos (if any)
2. Click "Upload Your Photo"
3. Select photo (item in your home, styled, etc.)
4. Add caption (optional)
5. Submit for moderation
6. Pending photos show "Under Review" badge

**Steps - Organizer moderation:**
1. Go to `/organizer/moderation`
2. See pending photos
3. Click approve (adds to gallery) or reject (remove)
4. Moderation reason saved

**Expected result - Shopper:**
- ✅ Upload button visible on item detail
- ✅ Can select photo from phone/computer
- ✅ Submitted photos show "Pending Review" badge

**Expected result - Organizer:**
- ✅ Moderation queue visible
- ✅ Can approve/reject with reason

**Pass criteria:**
- ✅ Upload works and submits
- ✅ Moderation queue visible to organizer
- ✅ Approved photos appear on item detail (credited to shopper)

---

## 10. Organizer Analytics & Insights (20 min)

### 10.1 Command Center Dashboard
**Time:** 8 min
**Setup:** Organizer with published sales. Go to `/organizer/dashboard`

**Steps:**
1. See dashboard overview with widgets:
   - Total Sales (count)
   - Revenue (running total)
   - Active Auctions (count)
   - Items Sold (count)
   - Holds Pending (count)
   - Recent Activity Feed
2. Click a widget → drills into detailed view (e.g., holds list)
3. Filter by sale (dropdown)
4. Widgets update in real-time (if feature #14 active)

**Expected result:** Widgets show real data. Interactions work.

**Pass criteria:**
- ✅ All widgets load and display current data
- ✅ Clicking a widget drills to detail
- ✅ Sale filter updates all widgets
- ✅ Data accurate (count matches item list)
- ✅ Real-time updates (within 5 sec) if enabled

---

### 10.2 Seller Performance Dashboard
**Time:** 5 min
**Setup:** Organizer with completed sales. Go to `/organizer/dashboard` or `/organizer/insights`

**Steps:**
1. See per-sale metrics: Items Listed, Sold, Hold Rate %, Avg Price, Revenue
2. See comparison to previous sales
3. See top-performing items (by revenue or rate)
4. Filter by date range

**Expected result:** Analytics dashboard shows per-sale trends.

**Pass criteria:**
- ✅ Metrics displayed accurately
- ✅ Charts load (may take 2–3 sec)
- ✅ Filter works and updates
- ✅ Comparison logic sound

---

### 10.3 Organizer Insights (Lifetime)
**Time:** 5 min
**Setup:** Organizer with multiple completed sales. Go to `/organizer/insights`

**Steps:**
1. See lifetime metrics: Total Revenue, Items Sold, Avg Item Price, Top Categories, Reputation
2. See charts: Revenue over time, category breakdown, seller comparison
3. Export as PDF

**Expected result:** Cross-sale totals + benchmarking.

**Pass criteria:**
- ✅ Metrics displayed accurately
- ✅ Charts load and render correctly
- ✅ Export to PDF works
- ✅ Data matches transaction history

---

### 10.4 Payout Transparency & Earnings Dashboard
**Time:** 3 min
**Setup:** Organizer with completed sales. Go to `/organizer/earnings` or insights page

**Steps:**
1. See breakdown: Gross Revenue - 10% Platform Fee = Payout Amount
2. Item-level fee breakdown available (hover or expand)
3. See Stripe payout schedule (if Stripe Connected)
4. Export as PDF for accounting

**Expected result:** Clear transparency on organizer payout.

**Pass criteria:**
- ✅ Math correct (10% fee only)
- ✅ Fee breakdown by item visible
- ✅ Can export as PDF
- ✅ Stripe payout schedule visible

---

### 10.5 Post Performance Analytics
**Time:** 2 min
**Setup:** Organizer with social templates downloaded. Go to analytics or social section.

**Steps:**
1. See UTM tracking on social template downloads
2. Track clicks from social posts (via UTM parameters)
3. See which platforms drive most traffic

**Expected result:** Organizer can measure social ROI.

**Pass criteria:**
- ✅ UTM parameters auto-added to shared links
- ✅ Click tracking recorded in analytics
- ✅ Reports show platform breakdown

---

### 10.6 Flip Report (Item Valuation History)
**Time:** 3 min
**Setup:** PRO organizer. Item detail or add item page.

**Steps:**
1. Click "Flip Report" or valuation section
2. See item resale potential scoring
3. Shows: similar sold items, price trends, rarity
4. Suggests optimal listing price

**Expected result:** Data-driven pricing suggestions.

**Pass criteria:**
- ✅ Flip report loads with data
- ✅ Suggestions are reasonable
- ✅ Based on real comparable sales

---

## 11. Organizer Premium & Billing (15 min)

### 11.1 Tier Comparison & Upgrade
**Time:** 8 min
**Setup:** Organizer account (any tier). Go to `/organizer/premium`

**Steps:**
1. See tier comparison table: SIMPLE / PRO / TEAMS
2. Current tier highlighted with "Current Plan" label
3. See feature list per tier:
   - SIMPLE: Core sales, items, holds
   - PRO: Batch Ops, Analytics, AI Valuations, Brand Kit
   - TEAMS: Workspace, multi-user, advanced permissions
4. Click "Upgrade to PRO" or "Switch to TEAMS"
5. Should redirect to Stripe checkout or upgrade confirmation

**Expected result:** Tier comparison visible. Upgrade path clear.

**Pass criteria:**
- ✅ Table displays all tiers
- ✅ Features accurately listed per tier
- ✅ Current tier clearly marked
- ✅ Upgrade button functional
- ✅ Pricing visible ($0 SIMPLE, $29 PRO, $79 TEAMS/month)

---

### 11.2 Premium Tier Bundle
**Time:** 5 min
**Setup:** PRO or TEAMS organizer. Go to `/organizer/premium`

**Steps:**
1. See bundled features in "PRO Bundle" or "TEAMS Bundle"
2. See comparison matrix with checkmarks for each tier
3. See upgrade CTA for current tier
4. See pricing breakdown

**Expected result:** Bundle page clearly shows value.

**Pass criteria:**
- ✅ Bundle features grouped logically
- ✅ Pricing comparison clear
- ✅ Upgrade CTA prominent

---

### 11.3 Usage Bars (Rate Limits Display)
**Time:** 2 min
**Setup:** PRO organizer. Go to `/organizer/premium` or dashboard.

**Steps:**
1. See usage bars for PRO-limited features:
   - AI Tag Suggestions (20/day)
   - Batch Operations (10/day)
   - etc.
2. Bars show current usage vs. limit (e.g., "12/20 used")
3. Use a feature → watch bar update

**Expected result:** Usage tracked and displayed.

**Pass criteria:**
- ✅ Bars load and show current usage
- ✅ Update after feature use (within 1–2 sec)
- ✅ Don't allow use above limit (show graceful message)

---

## 12. Organizer Marketing & Brand (15 min)

### 12.1 Brand Kit
**Time:** 5 min
**Setup:** PRO organizer. Go to `/organizer/brand`

**Steps:**
1. Upload business logo
2. Set brand colors (primary, accent, neutral)
3. Add social media links (Instagram, Facebook, etc.)
4. Add business bio
5. Save

**Expected result:** Brand settings saved and auto-propagate to social templates.

**Pass criteria:**
- ✅ Logo uploads and stores
- ✅ Colors save and display correctly
- ✅ Social links populate templates
- ✅ Bio visible on organizer profile

---

### 12.2 Social Templates (3 Tones × 2 Platforms)
**Time:** 5 min
**Setup:** Organizer. Go to `/organizer/marketing` or item detail.

**Steps:**
1. Click "Share to Social"
2. Select platform: Instagram or Facebook
3. Select tone: Casual, Professional, Friendly
4. See auto-filled copy (pulls from item + brand kit)
5. Edit if needed
6. Copy text or share directly

**Expected result:** Pre-written social posts speed up marketing.

**Pass criteria:**
- ✅ Copy auto-fills with item title, price, etc.
- ✅ Tones vary appropriately (casual = relaxed, professional = formal)
- ✅ Brand kit colors/logo visible in preview (if available)
- ✅ Can copy text or share (third-party integration optional)

---

### 12.3 Cloudinary Watermark on Photo Exports
**Time:** 2 min
**Setup:** Organizer with photos. Look for "Export Photos" or "Download Gallery"

**Steps:**
1. Click "Download Photos" or "Export"
2. Option to add watermark with business name/logo
3. Select watermark style
4. Photos download with watermark applied

**Expected result:** Brand protection on shared photos.

**Pass criteria:**
- ✅ Watermark option available
- ✅ Watermark applies to exports
- ✅ Watermark doesn't obscure item detail

---

### 12.4 Share Card Factory (OG Tags)
**Time:** 3 min
**Setup:** Item detail page. Share to social media or Slack.

**Steps:**
1. Share item link to Facebook / Twitter / Slack
2. Preview card appears with custom OG image (item photo + title + price)
3. Brand colors/logo appear in preview (if brand kit set)

**Expected result:** Branded social previews drive engagement.

**Pass criteria:**
- ✅ OG image renders (item photo visible)
- ✅ Title + price in card
- ✅ Brand colors respected

---

### 12.5 Hype Meter (Real-Time Social Proof)
**Time:** 2 min
**Setup:** Item or sale detail page

**Steps:**
1. See "Hype Meter" or social proof indicator
2. Shows: X people viewing, Y holds, Z favorites in real-time
3. Number updates as shoppers interact

**Expected result:** Social proof drives urgency.

**Pass criteria:**
- ✅ Hype meter displays
- ✅ Numbers are reasonable (not fake)
- ✅ Updates in real-time (or near real-time)

---

### 12.6 Social Proof Notifications
**Time:** 2 min
**Setup:** Organizer dashboard or notifications

**Steps:**
1. See aggregated notifications: "5 people saved this item", "Someone just bid", etc.
2. Notification appears in inbox + optionally as push

**Expected result:** Engagement aggregation keeps organizer engaged.

**Pass criteria:**
- ✅ Notifications summarize activity
- ✅ Not spammy (aggregated, not per-action)

---

## 13. Virtual Queue & Pickup (10 min)

### 13.1 Virtual Queue / Line Management
**Time:** 5 min
**Setup:** Organizer dashboard. Look for "Queue" or "Line Management"

**Steps - Organizer side:**
1. Click "Start Queue" for high-traffic sale
2. Shopper count visible
3. Click "Call Next" → sends SMS + notification
4. See average wait time calculated

**Steps - Shopper side:**
1. Sale detail page shows "Join Line"
2. Click to join
3. See position in line + estimated wait
4. Get notification when called

**Expected result:** Queue management reduces crowding.

**Pass criteria:**
- ✅ Queue toggles on/off per sale
- ✅ Shopper can join line
- ✅ Position + wait time estimated
- ✅ Notification sent when called

---

### 13.2 Pickup Scheduling (Slots + Booking)
**Time:** 5 min
**Setup:** Organizer sale settings. Shopper side.

**Steps - Organizer side:**
1. Go to sale settings → "Pickup Scheduling"
2. Create time slots: "Sat 10am-12pm", "Sat 2pm-4pm", "Sun 10am-12pm"
3. Set max capacity per slot (e.g., 5 pickups)

**Steps - Shopper side:**
1. Go to sale detail after purchase
2. See "Schedule Pickup" button
3. Select available slot
4. Confirm booking

**Expected result:** Pickup organized and scheduled.

**Pass criteria:**
- ✅ Organizer can create/edit slots
- ✅ Shopper can see available slots
- ✅ Booking confirms + shopper gets calendar invite

---

## 14. Notifications & Reminders (15 min)

### 14.1 In-App Notification Inbox
**Time:** 5 min
**Setup:** Any account. Go to `/notifications` or click bell icon.

**Steps:**
1. See notification list (if any)
2. Trigger a notification (e.g., place a bid, hold an item)
3. Bell icon shows red badge (count)
4. Click notification → dismiss or drill to detail
5. Scroll to see older notifications

**Expected result:** Notifications appear in real-time.

**Pass criteria:**
- ✅ Notifications appear within 2–3 sec of action
- ✅ Badge count accurate
- ✅ Can dismiss individual notifications
- ✅ Clicking redirects to relevant page
- ✅ Unread notifications highlighted

---

### 14.2 Email Reminders & Preferences
**Time:** 5 min
**Setup:** Any account. Go to settings → Notification Preferences

**Steps:**
1. See toggle options: Sale Reminders, Item Updates, Weekly Digest, Bid Notifications, etc.
2. Toggle "Sale Reminders" OFF
3. Create/publish a sale
4. Should NOT receive reminder email (toggle saved)
5. Go back and re-enable, verify email sent

**Expected result:** Preferences saved. Emails respect user settings.

**Pass criteria:**
- ✅ Toggles save (persist on reload)
- ✅ Unsubscribe link works (from any email)
- ✅ Can re-enable preferences later
- ✅ Email template is professional

---

### 14.3 Weekly Treasure Digest (Shopper Email)
**Time:** 3 min
**Setup:** Shopper account. Check email on Sunday evening.

**Steps:**
1. MailerLite sends digest email Sunday 6pm
2. Email includes: personalized item recommendations, trending sales, achievements earned
3. Click item → redirects to detail page

**Expected result:** Weekly email keeps shoppers engaged.

**Pass criteria:**
- ✅ Email sent on schedule
- ✅ Content is personalized
- ✅ Links work (redirect to items/sales)

---

### 14.4 Push Notifications (Mobile)
**Time:** 2 min
**Setup:** Mobile device with push enabled. Create an auction or hold.

**Steps:**
1. Auction ending soon → should get push notification
2. Outbid → should get push notification
3. Item hold expiring soon → should get push notification

**Expected result:** Device receives timely push notifications.

**Pass criteria:**
- ✅ Notifications appear on lock screen
- ✅ Notification text is actionable ("You were outbid. Bid now.")
- ✅ Tapping redirects to relevant page
- ✅ Can dismiss notification

---

### 14.5 Organizer Digest Emails
**Time:** 2 min
**Setup:** Organizer account. Check weekly digest.

**Steps:**
1. Receive weekly summary email (Monday morning)
2. Includes: sales activity, revenue, new holds, recent reviews
3. Click activity → redirects to dashboard

**Expected result:** Weekly organizer activity summary.

**Pass criteria:**
- ✅ Email sent on schedule
- ✅ Data is accurate and current
- ✅ Links work

---

## 15. Payments & POS (20 min)

### 15.1 Stripe Terminal POS (v2) — Full Checkout
**Time:** 10 min
**Setup:** Organizer dashboard. Go to `/organizer/sales/[id]/checkout`

**Steps:**
1. Select items from sale inventory (drag/click to add to cart)
2. See running total + 10% platform fee breakdown
3. Can apply coupon or discount
4. Click "Start Checkout"
5. In simulator mode: see Stripe Terminal mock screen
6. Select "Approved" card
7. See receipt: items, total, timestamp, organizer name

**Expected result:** Checkout flow completes. Receipt generated.

**Pass criteria:**
- ✅ Items add to cart (visual feedback)
- ✅ Total calculates correctly (item price × qty, + 10% fee)
- ✅ Payment completes in simulator
- ✅ Receipt shows item list + total + timestamp
- ✅ Fee is exactly 10% (not 15% or 5%)
- ✅ Shopper purchase record created

---

### 15.2 Multi-Item POS & Cash Support
**Time:** 5 min
**Setup:** POS checkout page

**Steps:**
1. Add 5+ items to cart
2. See running total updates
3. Option to accept "Cash" payment
4. If cash: organizer marks as paid, receipt generates
5. If card: complete Stripe terminal flow

**Expected result:** POS handles multi-item + cash.

**Pass criteria:**
- ✅ Multiple items add without limit
- ✅ Cash option available
- ✅ Receipt generates for both payment types
- ✅ 10% fee applies to both

---

### 15.3 Refund Policy
**Time:** 3 min
**Setup:** Sale detail page (organizer and shopper view)

**Steps:**
1. Organizer sets refund policy (7/14/30 days or "No Refunds")
2. Shopper sees policy on sale detail page
3. After purchase, policy visible on receipt

**Expected result:** Policy transparent to all parties.

**Pass criteria:**
- ✅ Policy saves in organizer settings
- ✅ Displays on shopper-facing pages
- ✅ Appears in checkout flow

---

### 15.4 Digital Receipt & Return Window
**Time:** 3 min
**Setup:** Purchase completed (POS or hold converted to purchase).

**Steps - Shopper side:**
1. Go to `/shopper/purchases`
2. See receipt (auto-generated post-checkout)
3. See return window countdown (e.g., "Return by March 25")
4. Click "View Receipt" → see itemized list + total
5. Download receipt as PDF (optional)

**Expected result:** Receipt shows all items, prices, total, timestamp.

**Pass criteria:**
- ✅ Receipt auto-generates after checkout
- ✅ All items + total accurate
- ✅ Return window calculated correctly (based on policy)
- ✅ Can view/download receipt
- ✅ Shows organizer name + address

---

## 16. Advanced Intelligence Features (15 min)

### 16.1 AI Item Valuation & Comparables (PRO)
**Time:** 5 min
**Setup:** PRO organizer. Add item page.

**Steps:**
1. Upload photo of item
2. Look for "Valuation" or "AI Appraisal" section
3. See: estimated value, comparable sold items, rarity indicator
4. Suggests optimal listing price

**Expected result:** Data-driven pricing suggestions.

**Pass criteria:**
- ✅ Valuation loads (takes ~2-3 sec)
- ✅ Suggestions are reasonable
- ✅ Comparables link to actual sales data
- ✅ Rarity indicated

---

### 16.2 Treasure Typology Classifier (PRO)
**Time:** 3 min
**Setup:** PRO organizer. Item detail or card.

**Steps:**
1. See item classified by AI: "Modern Furniture", "Vintage Fashion", "Collectible", etc.
2. Classification influences Flip Report, recommendations, heatmap
3. Can override classification manually

**Expected result:** AI classification improves discovery.

**Pass criteria:**
- ✅ Classification displays on item card
- ✅ Matches item category/tags
- ✅ Can override if wrong

---

### 16.3 Sale Ripples (Social Proof Activity)
**Time:** 5 min
**Setup:** Sale detail page (shopper view)

**Steps:**
1. See "Ripple" indicator: "5 people viewing this sale", "Someone just favorited an item"
2. Indicator updates in real-time (within 5 sec)
3. Activity recorded when shopper views sale

**Expected result:** Social proof drives urgency.

**Pass criteria:**
- ✅ Ripple indicator displays
- ✅ Numbers are real (not fake)
- ✅ Updates when shoppers interact
- ✅ RippleIndicator auto-records views

---

### 16.4 Estate Sale Encyclopedia (Wiki-Style)
**Time:** 2 min
**Setup:** Item detail page or search

**Steps:**
1. See "Encyclopedia Card" or "Did You Know?" section
2. Shows: item history, care tips, market trends
3. Sourced from FAQ + vendor data

**Expected result:** Educational content builds trust.

**Pass criteria:**
- ✅ Card displays contextually
- ✅ Content is relevant to item
- ✅ Links to `/condition-guide` or FAQ

---

## 17. Voice & Accessibility (10 min)

### 17.1 Voice-to-Tag (Web Speech API) — PRO
**Time:** 5 min
**Setup:** PRO organizer. Add item page (Chrome/Edge).

**Steps:**
1. Click microphone icon next to "Tags" field
2. Speak: "vintage oak wooden frame"
3. System transcribes and suggests matching tags
4. Select tags to add

**Expected result:** Hands-free tag entry.

**Pass criteria:**
- ✅ Microphone permission requested first (browser prompt)
- ✅ Transcription accurate
- ✅ Tags suggested from transcription
- ✅ Works on Chrome/Edge (Firefox/Safari may not support)

---

### 17.2 Low-Bandwidth Mode (PWA)
**Time:** 3 min
**Setup:** Mobile device. Settings → Low-Bandwidth Mode

**Steps:**
1. Toggle "Low-Bandwidth Mode" ON
2. Browse sales → images load lower-res
3. Network tab shows reduced image sizes
4. Toggle OFF → images high-res again

**Expected result:** Graceful bandwidth-aware experience.

**Pass criteria:**
- ✅ Images reduce in quality (save bandwidth)
- ✅ Images still visible (not blurry)
- ✅ Setting persists on reload
- ✅ Network API detects connection type

---

### 17.3 Offline Mode (Service Worker Sync)
**Time:** 2 min
**Setup:** Mobile device or DevTools offline mode.

**Steps:**
1. Go to `/organizer/sales` with items downloaded
2. Disable Wi-Fi + cellular (or DevTools offline)
3. Scroll items → should load from cache
4. Go back online
5. Sync queue processes any pending mutations

**Expected result:** Service worker enables offline browsing.

**Pass criteria:**
- ✅ Cached pages load offline
- ✅ Service worker active (DevTools)
- ✅ Sync queue stores mutations until online
- ✅ Auto-syncs when connection restored

---

## 18. Accessibility Spot Checks (10 min)

### 18.1 Keyboard Navigation
**Time:** 5 min
**Setup:** Any page. Disable mouse (or just use Tab key).

**Steps:**
1. Tab through interactive elements
2. Order should be logical (left-to-right, top-to-bottom)
3. Press Enter/Space on buttons
4. Open modal → focus should trap (can't tab outside)
5. Close modal → focus returns to trigger

**Expected result:** Full keyboard navigation possible.

**Pass criteria:**
- ✅ Tab order is logical
- ✅ Focus visible (outline or highlight)
- ✅ Can submit forms with keyboard
- ✅ Modal dialogs trap focus
- ✅ Can press Escape to close modals

---

### 18.2 Screen Reader (ARIA Labels)
**Time:** 5 min
**Setup:** Use NVDA (Windows) or VoiceOver (macOS/iOS).

**Steps:**
1. Open page with screen reader
2. Navigate by headings, landmarks, buttons
3. Listen for descriptive labels

**Expected result:** Accessible navigation and descriptions.

**Pass criteria:**
- ✅ Headings have descriptive text (not blank or "h1")
- ✅ Buttons have labels (not icon-only)
- ✅ Images have alt text
- ✅ Form labels associated with inputs
- ✅ Form errors announced clearly

---

## 19. Mobile & PWA (15 min)

### 19.1 Responsive Layout (Mobile)
**Time:** 5 min
**Setup:** Any page. Chrome DevTools → Device Toolbar → iPhone 13

**Steps:**
1. Browse `/map` — should stack vertically
2. Click item card → detail page responsive
3. Forms have large touch targets (40px+ buttons)
4. Nav collapses to hamburger menu on small screens

**Expected result:** Layout adapts to screen size.

**Pass criteria:**
- ✅ No horizontal scroll
- ✅ Touch targets ≥40px
- ✅ Text readable (no tiny fonts)
- ✅ Inputs mobile-friendly

---

### 19.2 Camera Input (Mobile)
**Time:** 5 min
**Setup:** Mobile device (iOS/Android). Go to `/organizer/sales/[id]/add-items`

**Steps:**
1. Click "Camera" button
2. Camera opens
3. Take photo
4. Photo auto-fills item form

**Expected result:** Camera works on mobile browsers.

**Pass criteria:**
- ✅ Camera input button present
- ✅ Launches native camera app
- ✅ Photo captured and auto-inserts
- ✅ Works on iOS + Android
- ✅ Requires camera permission (first use prompts)

---

### 19.3 PWA Install Prompt
**Time:** 3 min
**Setup:** Mobile device (iOS Safari / Android Chrome). Go to finda.sale

**Steps:**
1. Android Chrome: See "Install" banner at bottom (after 2nd visit)
2. iOS Safari: See "Share → Add to Home Screen" prompt
3. Click to install
4. App appears on home screen

**Expected result:** Users can install as standalone app.

**Pass criteria:**
- ✅ Install prompt appears
- ✅ App icon + name correct
- ✅ Launches in full-screen mode (no browser chrome)
- ✅ Persists on home screen

---

## 20. Error States & Edge Cases (15 min)

### 20.1 404 Page Not Found
**Time:** 2 min
**Setup:** Go to `/sales/nonexistent-slug`

**Steps:**
1. See 404 page with "Sale not found" message
2. See link back to `/map` or home

**Expected result:** Clear error message + recovery path.

**Pass criteria:**
- ✅ 404 page displays
- ✅ Message is user-friendly (not "Route not found")
- ✅ Home or back link present

---

### 20.2 403 Permission Denied
**Time:** 2 min
**Setup:** Logged in as shopper. Go to `/organizer/dashboard`

**Steps:**
1. See 403 "Access Denied" message or redirect

**Expected result:** Clear permission error.

**Pass criteria:**
- ✅ Redirects to login or shows permission error
- ✅ Message explains why (e.g., "Organizers only")

---

### 20.3 Network Offline
**Time:** 3 min
**Setup:** DevTools → Offline mode or disable Wi-Fi.

**Steps:**
1. Trigger network request (load page / search)
2. See offline banner or error message
3. Go back online
4. Page auto-recovers or prompt to retry

**Expected result:** Graceful offline detection.

**Pass criteria:**
- ✅ Error banner appears ("You're offline")
- ✅ Can still view cached content
- ✅ Auto-retries when back online
- ✅ Not blank white page

---

### 20.4 Rate Limiting
**Time:** 3 min
**Setup:** Create 20 AI tag suggestions in 1 minute (hit limit).

**Steps:**
1. Get error: "Too many requests. Try again in X minutes."

**Expected result:** Rate limiter active and communicative.

**Pass criteria:**
- ✅ Request rejected with clear message
- ✅ Message says when to retry
- ✅ Limit resets correctly (after time window)

---

### 20.5 File Upload Validation
**Time:** 2 min
**Setup:** Add item page. Try to upload invalid file.

**Steps:**
1. Try uploading PDF or text file
2. See error: "Only JPG, PNG, WebP allowed"
3. Try uploading 50MB file
4. See error: "Max 10MB per file"

**Expected result:** Clear upload validation.

**Pass criteria:**
- ✅ Invalid file types rejected
- ✅ Size limit enforced
- ✅ Error messages are clear

---

## 21. Organizer Reputation & Social (10 min)

### 21.1 Organizer Public Profile Page
**Time:** 3 min
**Setup:** Go to `/organizers/[slug]` (any published sale shows organizer name/link)

**Steps:**
1. Click organizer name on sale detail
2. See organizer profile page
3. Shows: business name, bio, logo, social links, reputation score
4. Lists sales by organizer

**Expected result:** Public-facing organizer identity.

**Pass criteria:**
- ✅ Profile page loads
- ✅ All data displays (name, bio, logo)
- ✅ Sales list accurate
- ✅ Can follow organizer (if feature enabled)

---

### 21.2 Organizer Reputation Score
**Time:** 5 min
**Setup:** Organizer with reviews. Go to `/organizer/reputation`

**Steps:**
1. See 1–5 star rating (calculated from shopper reviews)
2. See reputation breakdown: Reliability (%), Item Quality (%), Communication (%)
3. Score out of 100%
4. Reviews list below with shopper comments

**Expected result:** Public reputation visible on organizer profile.

**Pass criteria:**
- ✅ Score calculated from reviews (not hardcoded)
- ✅ Updates after new review (within 5 min)
- ✅ Shows on public profile
- ✅ Breakdown shows multiple dimensions (not just 1 number)

---

### 21.3 Verified Organizer Badge
**Time:** 2 min
**Setup:** Organizer account with 3+ completed sales + positive reviews.

**Steps:**
1. Go to organizer profile page (public view)
2. Look for blue checkmark / "Verified" badge
3. Badge should appear if criteria met

**Expected result:** Badge visible on verified organizer profile + sales.

**Pass criteria:**
- ✅ Badge appears for qualified organizers
- ✅ Tooltip explains criteria
- ✅ Displays on sales cards + profile

---

## 22. Reviews & Social Proof (10 min)

### 22.1 Shopper Reviews (Submit & View)
**Time:** 5 min
**Setup:** Shopper after purchase or hold. Sale detail page or post-purchase flow.

**Steps:**
1. Click "Leave a Review"
2. Rate 1–5 stars
3. Write comment: "Great condition, fast pickup!"
4. Submit
5. Organizer can see review on sale/profile page

**Expected result:** Reviews build trust.

**Pass criteria:**
- ✅ Review form accessible
- ✅ Reviews display on sale detail + organizer profile
- ✅ Ratings aggregated to reputation score
- ✅ Can edit/delete own review

---

### 22.2 Organizer Reviews (Receive)
**Time:** 5 min
**Setup:** Organizer dashboard. Sold an item.

**Steps:**
1. Organizer receives review notification
2. Go to `/organizer/reviews` or reputation page
3. See reviews from shoppers
4. Can respond with message (optional)

**Expected result:** Reviews visible to organizer.

**Pass criteria:**
- ✅ Reviews appear in dashboard
- ✅ Can respond to reviews
- ✅ Reviews affect reputation score

---

## 23. Additional Core Features (15 min)

### 23.1 Flash Deals (Time-Limited Discounts)
**Time:** 5 min
**Setup:** Organizer sale view.

**Steps:**
1. Click "Create Flash Deal" or "Add Deal"
2. Select items
3. Enter discount: 20% off
4. Set time window: "3 hours"
5. Save

**Expected result:** Time-limited sales drive urgency.

**Pass criteria:**
- ✅ Deal creates and displays timer
- ✅ Discount applies at checkout
- ✅ Timer visible to shoppers
- ✅ Organizer can view deal details

---

### 23.2 Sale Waitlist (Shopper Interest Queue)
**Time:** 5 min
**Setup:** Published sale. Shopper side.

**Steps:**
1. Sale at capacity (closed to new entries)
2. Shopper clicks "Join Waitlist"
3. Organizer can see waitlist in dashboard
4. When capacity frees up, organizer broadcasts notification to waitlist

**Expected result:** Organizer can manage demand.

**Pass criteria:**
- ✅ Waitlist toggle visible to organizer
- ✅ Shopper can join
- ✅ Organizer can send broadcast notification

---

### 23.3 Coupons (PERCENT/FIXED)
**Time:** 5 min
**Setup:** Organizer dashboard. Look for "Coupons" section.

**Steps:**
1. Click "Create Coupon"
2. Type: PERCENT (20% off) or FIXED ($10 off)
3. Code: SPRING20
4. Expiry: 30 days
5. Save
6. Shopper enters code at checkout

**Expected result:** Post-purchase coupon issuance + validation.

**Pass criteria:**
- ✅ Coupon creates with code
- ✅ Shopper can apply at checkout
- ✅ Discount validates and applies
- ✅ Organizer can see coupon usage

---

## 24. Organizer Workspace & Collaboration (TEAMS)

### 24.1 TEAMS Workspace & Multi-User Management
**Time:** 10 min
**Setup:** TEAMS organizer. Go to `/organizer/workspace` or settings.

**Steps:**
1. See "Team Members" section
2. Click "Invite Team Member"
3. Add: email, role (Admin, Manager, Staff)
4. Send invite
5. User joins workspace with assigned permissions
6. Admin can revoke access or change role

**Expected result:** Multi-user workspace for team sales.

**Pass criteria:**
- ✅ Invite sends and works
- ✅ Team member sees workspace + sales
- ✅ Role-based permissions enforced (Admin edits sales, Staff adds items only)
- ✅ Can remove team members

---

## 25. Data Export & Portability (PRO)

### 25.1 CSV / JSON Listing Exports
**Time:** 3 min
**Setup:** PRO organizer. Go to `/organizer/exports` or sale detail.

**Steps:**
1. Click "Export Items"
2. Select format: CSV or JSON
3. Select fields: title, price, category, condition, photo URL
4. Download file

**Expected result:** Data portability for organizers.

**Pass criteria:**
- ✅ Exports create file immediately
- ✅ Format is valid (can open in Excel/spreadsheet)
- ✅ All fields populated

---

### 25.2 Open Data Export (ZIP)
**Time:** 3 min
**Setup:** PRO organizer. Go to settings → "Download My Data"

**Steps:**
1. Click "Export All Data"
2. Gets ZIP with: items.csv, sales.csv, purchases.csv, reviews.csv
3. Download contains all organizer data (GDPR/CCPA compliant)

**Expected result:** Full data export for compliance.

**Pass criteria:**
- ✅ ZIP downloads successfully
- ✅ All CSVs included
- ✅ Data is complete and accurate

---

## 26. Affiliate & Referral Programs

### 26.1 Organizer Referral (Fee Bypass)
**Time:** 3 min
**Setup:** Organizer account. Go to `/organizer/referral`

**Steps:**
1. See referral link (unique code)
2. Share with other organizers
3. When referred organizer's first sale completes, original organizer gets fee waiver (10% savings)
4. Track referrals in dashboard

**Expected result:** Organizer growth incentive.

**Pass criteria:**
- ✅ Referral link unique and shareable
- ✅ Fee waiver applies on first referred sale
- ✅ Can see referral status

---

### 26.2 Shopper Referral Rewards
**Time:** 3 min
**Setup:** Shopper account. Go to `/referral-dashboard`

**Steps:**
1. See referral link
2. Share with friends
3. When friend makes first purchase, both get reward (points, discount, etc.)
4. Track referrals and rewards earned

**Expected result:** Shopper growth incentive.

**Pass criteria:**
- ✅ Referral link works
- ✅ Reward credited when friend purchases
- ✅ Can see earnings history

---

## 27. Disputes & Trust & Safety

### 27.1 Disputes Management
**Time:** 5 min
**Setup:** Shopper or organizer. After problematic transaction.

**Steps:**
1. Click "Report Issue" or "File Dispute"
2. Describe problem: "Item not as described" or "Organizer didn't hold item"
3. Provide evidence (photo, messages)
4. Submit
5. Platform moderator reviews (can take 24–48 hours)

**Expected result:** Trust & safety mechanism.

**Pass criteria:**
- ✅ Dispute form accessible
- ✅ Can upload evidence
- ✅ Organizer/shopper notified
- ✅ Moderator can review + resolve

---

## 28. Invites

### 28.1 Invite-to-Sale / Invite-to-Platform
**Time:** 5 min
**Setup:** Organizer or shopper account.

**Steps:**
1. Click "Invite" on sale detail or dashboard
2. Enter email address
3. Recipient gets email with invite link
4. Can invite-to-sale (specific sale) or invite-to-platform (general signup)

**Expected result:** Grow network through invites.

**Pass criteria:**
- ✅ Invite email sent
- ✅ Link works and redirects to sale/signup
- ✅ Inviter gets notification when invited user acts

---

## 29. Message Templates & Automation (Organizer)

### 29.1 Message Templates
**Time:** 3 min
**Setup:** Organizer settings. Look for "Message Templates"

**Steps:**
1. Click "Create Template"
2. Title: "Thanks for Purchasing"
3. Body: "Thanks for shopping at [business]! Your receipt: [link]"
4. Save
5. When replying to shopper message, select template

**Expected result:** Quick reply templates improve efficiency.

**Pass criteria:**
- ✅ Template creates and saves
- ✅ Can use template when composing message
- ✅ Template variables replaced (business name, etc.)

---

## 30. A/B Testing Infrastructure

### 30.1 A/B Testing (Organizer)
**Time:** 3 min
**Setup:** Organizer. Appears in advanced/experimental section.

**Steps:**
1. Create test: two versions of sale title
2. Version A: "Vintage Estate Sale"
3. Version B: "Grandma's Treasures"
4. Split traffic 50/50
5. Track which version gets more holds/favorites

**Expected result:** Optimize listing performance.

**Pass criteria:**
- ✅ Test creates successfully
- ✅ Traffic splits correctly
- ✅ Results tracked and displayed

---

## Testing Summary

**Total Estimated Time:** 120 minutes (all workflows)
**Quick Smoke Test:** 10 minutes (absolute minimum)
**Typical Session:** 40–60 minutes (pick 3–4 workflow groups)

**Shipped Features:** 80+ features tested across 30 sections
**Test Coverage:** All tiers (SIMPLE, PRO, TEAMS) + both organizer & shopper roles

**Critical Paths to Test:**
1. **Sale Lifecycle:** Create → Publish → Add Items → Manage Holds → Checkout
2. **Shopper Journey:** Browse → Search → Hold/Bid → Review
3. **Gamification:** Points → Streaks → Badges → Rewards
4. **Analytics:** Dashboard → Insights → Exports
5. **Trust & Safety:** Reviews → Disputes → Verified Badge

---

## Feedback & Bug Reporting

Found an issue? Report with:
1. **Feature name** (e.g., "Auction Auto-Bidding")
2. **Device/browser** (iPhone 13 Safari, Windows Chrome, etc.)
3. **Steps to reproduce** (concise)
4. **Expected vs. actual** (what you expected to see)
5. **Screenshot or video** (if possible)

Post in MESSAGE_BOARD.json or include in session wrap message.

---

**Last Updated:** 2026-03-19
**Created:** Full comprehensive rewrite covering all 80+ shipped features
**Ready for:** Patrick E2E testing across all tiers and user roles
