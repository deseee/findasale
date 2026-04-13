# QA Findings — D3 Shopper Discovery — 2026-03-25

## Feature Status Summary
| Feature | ID | Status | Notes |
|---------|----|---------|----|
| Browse Sales (Homepage + Map) | #176 | ✅ PASS | Hero, filters, sales grid all load |
| Sale Detail Page | #177 | ✅ PASS | Title, dates, location, organizer, calendar button load |
| Full-Text Search | #179 | ⏳ NOT TESTED | Requires filter interaction testing |
| Surprise Me | #182 | ✅ PASS | Page loads, displays 12 random items with filters |
| Neighborhood Pages | #188 | ❌ FAIL | Returns 404 - feature not implemented |
| Trending Items/Sales | #189 | ✅ PASS | Hot sales and most wanted items display |
| Activity Feed | #190 | ⏳ NOT TESTED | Requires authentication |
| City Heat Index | #49 | ⏳ NOT TESTED | Could not locate |
| City Pages | #187 | ✅ PARTIAL | /cities shows empty state; /city/grand-rapids works |
| City Weekend Landing Pages | #92 | ✅ PASS | Grand Rapids city page loads with sales |
| Inspiration Page | #78 | ✅ PASS | Masonry grid loads with items |
| Estate Sale Encyclopedia | #52 | ⏳ NOT TESTED | Could not locate nav link |
| Price History Tracking | #192 | ⏳ NOT TESTED | Not observed on detail page |
| Weekly Treasure Digest | #36 | ⏳ NOT TESTED | Requires user login |
| Live Sale Feed | #70 | ⏳ NOT TESTED | Not observed on detail page |

## Critical Issues (P0–P1)

### P0: Filter Pill Routing Bug
**Feature:** #176 (Sale Type Filters on Homepage)
**Issue:** Clicking filter pills appears to route to `/api/auth/logout`
**Expected:** Clicking "Estate" should filter sales by estate type
**Actual:** Browser attempted to navigate to logout endpoint, causing NextAuth.js error
**Severity:** CRITICAL - Core homepage functionality broken
**Evidence:**
- Error message: "Error: This action with HTTP GET is not supported by NextAuth.js"
- Click on Estate pill → URL changed to `/api/auth/logout`

### P1: Cities List Empty State
**Feature:** #187 (City Pages)
**Issue:** `/cities` page shows "No cities with sales yet" despite 16 active sales in Grand Rapids
**Expected:** Should display list of cities with active sales
**Actual:** Empty state message displayed
**Impact:** City browsing feature appears broken; only direct URL access to `/city/grand-rapids` works

## Detailed Findings

### #176 - Browse Sales (Homepage + Map)
✅ **PASS — Partial**
- Hero section with sage gradient background: ✅ Present
- "Discover Amazing Deals" title: ✅ Present
- Search bar with placeholder text: ✅ Working
- "Grand Rapids is heating up" banner (16 sales): ✅ Displaying
- "Today's Treasure Hunt" gamification banner: ✅ Present
- Sale Type filters visible: All, Estate, Yard, Auction, Flea Market, Consignment ✅
- **Filter interaction broken:** ❌ Clicking filters causes logout routing error

### Map Page (/map)
✅ **PASS**
- Page title: "Sales Near You": ✅
- Sales count: "16 sales near you": ✅
- Time filter pills (All, Today, This Weekend, This Week): ✅ All present
- Map interface: ✅ Loads with pins visible
- Green and gray pins visible on map: ✅
- "Plan Your Route" button: ✅ Present
- Zoom controls (+/-): ✅ Functional
- Location access notice: ✅ Proper geolocation handling

### #177 - Sale Detail Page
✅ **PASS**
- Sale title: ✅ "Lakefront Estate Sale 11"
- Location: ✅ "4920 Leonard St, Grand Rapids, MI 49503"
- Date/time range: ✅ "Mar 24, 2026 8:53 AM - Mar 28, 2026 8:53 AM"
- Status badge: ✅ "PUBLISHED"
- View/Share/Save counts: ✅ Displaying (0 each)
- Share button: ✅ Orange button present
- **"Add to Calendar" button: ✅ Present** (fulfills #177 requirement for iCal)
- Organizer section: ✅ Name, phone, link
- Ratings: ✅ 4.7/5.0 (3 reviews)
- Message/Follow buttons: ✅ Present and clickable
- Item carousel: ✅ Displaying sale items
- Social share options: ✅ Facebook, Nextdoor visible

**Note:** Sale Soundtrack section (#177) not tested in scrolled view; requires deeper inspection

### #182 - Surprise Me
✅ **PASS**
- Page title: ✅ "Surprise Me"
- Subtitle: ✅ "Discover random treasures from active sales near you..."
- Breadcrumb: ✅ "Home > Surprise Me"
- Dice icon: ✅ Present
- MAX PRICE filter: ✅ "Any price" dropdown
- CATEGORY filter: ✅ "Any category" dropdown
- "Surprise me!" button: ✅ Orange CTA button
- Item display: ✅ Shows "12 random items from active sales"
- Item cards: ✅ Images, category badges, names, prices, locations
- Grid layout: ✅ Responsive masonry layout

### #189 - Trending Items/Sales
✅ **PASS**
- Page title: ✅ "Trending This Week"
- Subtitle: ✅ "The most-loved items and hottest sales right now"
- Header design: ✅ Orange background, fire icon
- Hot Sales section: ✅ Numbered badges (#1 HOT, #2 HOT, #3 HOT)
- Sale cards: ✅ Name, location, likes, item count, date
- Most Wanted Items section: ✅ Starts loading below hot sales
- Grid layout: ✅ 4-column responsive layout

### #78 - Inspiration Page
✅ **PASS**
- Page title: ✅ "Inspiration Gallery"
- Subtitle: ✅ "Discover the best items from upcoming sales in your area"
- Grid layout: ✅ Masonry grid
- Item cards: ✅ Displaying with images and metadata
- Save functionality: ✅ Heart icons present
- **Note:** Some images showing "Image unavailable" ⚠️ - possible image hosting issue

### #92 & #187 - City Pages
✅ **/city/grand-rapids PASS**
- Page title: ✅ "Sales in Grand Rapids, MI"
- Subtitle: ✅ "Browse 16 upcoming sales with verified organizers..."
- Breadcrumb: ✅ "Home > Grand Rapids"
- Upcoming Sales section: ✅ "12 of 16 showing"
- Sale cards: ✅ Images, TODAY badges, names, dates, locations, organizers
- **Images blurred:** ⚠️ Some images appear blurred (lazy loading issue?)

❌ **/cities FAIL**
- Page title: ✅ "Sales by City"
- Subtitle: ✅ "Browse sales in your area"
- **Empty state:** ❌ Shows "No cities with sales yet"
- Should show: At least Grand Rapids (16 sales), plus other cities

### #188 - Neighborhood Pages
❌ **FAIL — Not Implemented**
- URL: `/neighborhoods/grand-rapids`
- Result: 404 Page Not Found
- Message: "Sorry, the page you're looking for doesn't exist or has been moved."
- Proper 404 handling: ✅ Error page is well-designed

## Console Errors
| Type | Source | Issue |
|------|--------|-------|
| WARNING | MetaMask Extension | "Cannot set property ethereum..." - Not app related |
| CRITICAL | Homepage Filter Pills | NextAuth.js GET not supported error when clicking filters |

## Not Tested (Requires Auth / Further Setup)
- #179 - Full-Text Search (requires successful filter interaction)
- #190 - Activity Feed (requires authenticated user: user11@example.com)
- #49 - City Heat Index (route not found in nav)
- #52 - Encyclopedia (nav link not located)
- #36 - Weekly Treasure Digest (user preferences)
- #192 - Price History (not visible on tested detail page)
- #70 - Live Sale Feed (not visible on tested detail page)

## Recommendations

### CRITICAL
1. **FIX FILTER PILL ROUTING:** Investigate why clicking estate/yard/etc filters routes to `/api/auth/logout`. This is breaking core homepage functionality.
   - Check button href/onClick handlers
   - Verify filter button markup doesn't accidentally point to logout endpoint
   - Test all 5 filter pills after fix

### HIGH
2. **FIX /cities EMPTY STATE:** Populate city list endpoint or investigate why it's not showing available cities despite 16 active sales in Grand Rapids
   - Verify `/api/cities` or similar endpoint is returning data
   - Check if cities list requires location permission like map does
   - Display all cities with active sales

3. **IMAGE LOADING ISSUES:** Some images appear blurred or showing "Image unavailable"
   - Test image URLs on sale detail and city pages
   - Verify image CDN is accessible
   - Check for missing alt text

### MEDIUM
4. **IMPLEMENT NEIGHBORHOOD PAGES:** #188 currently returns 404; may need implementation or proper routing
5. **LOCATE/TEST MISSING FEATURES:** Encyclopedia (#52), City Heat Index (#49), Activity Feed (#190) - unclear if implemented or just not accessible

## Beta Readiness Assessment

**Overall Status:** ⚠️ **NOT READY FOR BETA**

**Blockers:**
- Filter pill routing bug breaks homepage discoverability
- City list empty state blocks city browsing feature
- Image loading issues affect visual polish

**Ready Features:**
- Homepage hero and search bar working
- Map page with pins functional
- Sale detail page complete with calendar integration
- Trending page displaying content
- Inspiration gallery showing items
- Surprise Me feature working
- City-specific pages accessible via direct URL

**Recommendation:** Fix critical filter pill bug and city list before beta testing week. These are core discovery features that will frustrate testers.
