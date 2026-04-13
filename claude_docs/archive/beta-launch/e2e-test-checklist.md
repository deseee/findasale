# Beta Launch End-to-End Test Checklist

## Prerequisites
- Staging or local environment running with all services
- Test Stripe card: 4242 4242 4242 4242 (expiry: any future date, CVC: any 3 digits)
- Email addresses ready: organizer-test@example.com, shopper-test@example.com
- Clear browser cache and cookies before starting

---

## Organizer Flow (Pre-Purchase)

- [ ] **1. Register as New Organizer**
  - Navigate to `/register`
  - Email: organizer-test@example.com
  - Password: TestPass123!
  - Name: Test Organizer
  - Account Type: Sale Organizer
  - Business Name: Test Estate Sales
  - Business Phone: (616) 555-0100
  - Business Address: 123 Test St, Grand Rapids, MI 49503
  - **PASS if:** Account created, redirected to `/organizer/dashboard`, user appears in admin/users

- [ ] **2. Complete Organizer Onboarding**
  - Dashboard should appear with onboarding prompt or welcome state
  - Complete any required profile steps (if onboarding flow exists)
  - **PASS if:** No console errors, onboarding completes without blocking

- [ ] **3. Create Test Sale**
  - Click "Create New Sale" or similar button
  - Title: "Spring Estate Treasures"
  - Sale Start Date: Tomorrow at 10:00 AM
  - Sale End Date: 2 days from now at 6:00 PM
  - Address: 123 Test St, Grand Rapids, MI 49503
  - Sale Description: "Estate sale with vintage furniture, collectibles, and decor"
  - Upload 2-3 test photos (any .jpg/.png files; if using local dev, test with placeholder images)
  - Click "Create Sale"
  - **PASS if:** Sale created, redirect to sale detail or inventory page, sale appears in `/admin/sales`

- [ ] **4. Add 3 Items via Add-Items Page**
  - Navigate to sale inventory page
  - Add Item 1:
    - Title: "Oak Dining Table"
    - Category: Furniture
    - Description: "Beautiful 6-seater oak table with slight wear"
    - Starting Price: $150
    - Upload photo
  - Add Item 2:
    - Title: "Vintage Glass Vase"
    - Category: Collectibles
    - Description: "Hand-painted ceramic vase from 1960s, excellent condition"
    - Starting Price: $45
  - Add Item 3:
    - Title: "Leather Reading Chair"
    - Category: Furniture
    - Description: "Comfortable leather armchair, light patina"
    - Starting Price: $200
  - **PASS if:** All 3 items created, visible in inventory list with thumbnails

- [ ] **5. Verify AI Tagging Runs and Shows Suggestions**
  - Wait 10-15 seconds after adding items
  - Check if AI-suggested tags appear next to each item (e.g., "Vintage", "Furniture", "Good Condition")
  - Or check if there's an "AI Suggestions" panel or badge
  - **PASS if:** At least one AI tag suggestion appears for items; no console errors in browser

- [ ] **6. Accept AI Tags on 1 Item**
  - On "Vintage Glass Vase" item, click "Accept Tags" or similar button
  - Confirm tags are applied (e.g., "Vintage", "Collectibles")
  - **PASS if:** Tags applied without error, item shows accepted tags

- [ ] **7. Publish the Sale**
  - Navigate back to sale detail page
  - Click "Publish Sale" or "Go Live" button
  - Confirm sale status changes to "Published" or "Live"
  - **PASS if:** Sale status updates, no errors; sale should now be visible to shoppers

- [ ] **8. View the Live Sale Page**
  - Click "View Sale" or similar link
  - Verify sale renders on public sale detail page (`/sales/[saleId]`)
  - Check that:
    - Sale title, dates, address appear
    - Photos display correctly (at least one)
    - Item list shows all 3 items with prices
    - Organizer card appears (with name, profile, contact info)
    - "Follow" button is visible
    - "Take a Tour" button is visible
  - **PASS if:** All elements visible, no broken images or layout issues

- [ ] **9. Enable a Flash Deal on One Item**
  - On sale detail page, click "Edit Sale" or go to inventory
  - Select "Vintage Glass Vase" item
  - Click "Create Flash Deal" or similar
  - Set: 20% discount, duration 24 hours
  - Save/Apply
  - **PASS if:** Flash deal created, discount applied, visible on item card or in item detail

- [ ] **10. Generate and Download QR Code for the Sale**
  - On sale detail page, look for "Share" or "QR Code" button
  - Click to generate QR code
  - Verify QR code image displays
  - Click "Download" or right-click to save
  - **PASS if:** QR code image downloads without error

- [ ] **11. Print Inventory PDF**
  - On sale detail page, click "Print Inventory" or "Download PDF"
  - Verify PDF opens or downloads with:
    - Sale title, dates, address
    - All items listed with descriptions, prices, and AI tags
    - Photo thumbnails (if included in template)
  - **PASS if:** PDF generates and is readable

- [ ] **12. Check Organizer Insights Page Shows the Sale**
  - Navigate to `/organizer/insights` or insights dashboard
  - Verify "Spring Estate Treasures" sale appears in sales list
  - Check that sale metrics display (if available: views, items sold, revenue)
  - **PASS if:** Sale appears and no console errors

---

## Shopper Flow (Browsing & Purchase)

- [ ] **13. Register as New Shopper**
  - Open new private/incognito browser window
  - Navigate to `/register`
  - Email: shopper-test@example.com
  - Password: ShopperPass123!
  - Name: Test Shopper
  - Account Type: Shopper
  - Click "Register"
  - **PASS if:** Account created, redirected to home page

- [ ] **14. Browse Home Page — Confirm Sale Appears in Feed**
  - On home page, scroll through sales feed/carousel
  - Verify "Spring Estate Treasures" sale card appears with:
    - Sale title
    - Organizer name
    - Sale dates
    - Cover photo
    - Item count (if shown)
  - **PASS if:** Sale visible and clickable

- [ ] **15. Search for the Sale by Title**
  - Click search bar
  - Type "Spring Estate"
  - Verify "Spring Estate Treasures" appears in search results
  - **PASS if:** Sale found and displays correctly in search results

- [ ] **16. View Sale Detail Page — Check All Elements**
  - Click on the sale in search results or home feed
  - Verify on `/sales/[saleId]`:
    - Photos carousel/gallery loads all uploaded images
    - Sale title, dates, address display
    - All 3 items appear in inventory list with thumbnails, descriptions, prices
    - Flash deal badge visible on "Vintage Glass Vase" item
    - Organizer card shows: organizer name, business name, follow button
    - "Follow" button (unfollowed state)
    - "Take a Tour" button
  - **PASS if:** All elements present and styled correctly, no layout breaks

- [ ] **17. Click Follow on the Organizer**
  - On sale detail page, click "Follow" button
  - Verify button state changes to "Following" or "Unfollow"
  - **PASS if:** Follow status updates without page reload

- [ ] **18. Add an Item to Favorites**
  - Click heart icon or "Add to Favorites" on one item (e.g., "Leather Reading Chair")
  - Verify heart icon fills/changes color to indicate favorited
  - **PASS if:** Item added without error

- [ ] **19. Click "Take a Tour" — Verify SaleTourGallery Opens**
  - Click "Take a Tour" button
  - Verify modal or gallery component opens showing:
    - Full-screen or large sale photos
    - Navigation arrows or thumbnails
    - Close button
  - **PASS if:** Tour gallery opens and is navigable

- [ ] **20. Purchase an Item (Stripe Test Payment)**
  - Click "Buy Now" on any item (e.g., "Vintage Glass Vase")
  - Verify checkout page appears with:
    - Item details and price
    - Quantity selector
    - Shipping/pickup options (if applicable)
  - Enter payment details:
    - Card: 4242 4242 4242 4242
    - Expiry: 12/25 (or any future date)
    - CVC: 123
    - Billing ZIP: 49503
  - Click "Complete Purchase" or "Pay"
  - **PASS if:** Payment succeeds, order confirmation appears with order number

- [ ] **21. Verify Purchase Confirmation Page**
  - After payment, verify confirmation page shows:
    - "Order Confirmed" or success message
    - Order number
    - Item details (title, price, quantity)
    - Organizer name
    - Expected pickup/shipping date
    - Next steps (e.g., "Organizer will contact you", "View order in dashboard")
  - **PASS if:** All confirmation info displays correctly

- [ ] **22. View Shopper Dashboard — Confirm Purchase in Purchases Tab**
  - Navigate to `/shopper/dashboard` or user profile
  - Click "Purchases" tab or similar
  - Verify purchased item appears with:
    - Item title and photo
    - Price paid
    - Order status (e.g., "Pending", "Confirmed")
    - Date purchased
    - Organizer name (with link to organizer profile)
  - **PASS if:** Purchase visible with correct details

- [ ] **23. Check StreakWidget Appears and Shows Points**
  - On any page (home, dashboard, sale detail), look for StreakWidget component
  - Verify widget displays:
    - Current streak count (e.g., "3-day streak")
    - Points earned (e.g., "+10 pts")
    - Streak progress bar or visual indicator
  - **PASS if:** Widget visible and not throwing console errors

---

## Messaging (Item Inquiry)

- [ ] **24. Send a Message About an Item (Shopper to Organizer)**
  - As shopper, on sale detail page, click item "Contact Seller" or message icon
  - Type a message: "Is this vase still available? Any chips or damage I should know about?"
  - Send
  - **PASS if:** Message sends without error

- [ ] **25. Verify Message Appears in Organizer's Messages Inbox**
  - Switch back to organizer account/window
  - Navigate to `/organizer/messages` or messages inbox
  - Verify message thread appears with:
    - Shopper name and email
    - Item title
    - Shopper's message text
    - Timestamp
  - **PASS if:** Message visible in inbox

- [ ] **26. Organizer Reply to Message**
  - Click on message thread to open
  - Type reply: "Yes, vase is available and in excellent condition. No damage."
  - Send
  - **PASS if:** Reply sends without error

- [ ] **27. Shopper Receives Reply**
  - Switch back to shopper account/window
  - Navigate to `/shopper/messages` or messages inbox
  - Verify organizer's reply appears in the conversation thread
  - **PASS if:** Reply visible, timestamp correct

---

## Payment & Payout

- [ ] **28. Organizer: Verify Stripe Connect Setup in Payouts**
  - As organizer, navigate to `/organizer/payouts` or account settings > Payouts
  - Verify section shows:
    - Stripe Connect status: "Connected" or "Bank account verified"
    - Bank account ending in (last 4 digits) if connected
    - Total balance or pending payouts
    - Option to "Disconnect" or "Edit Payout Method"
  - **PASS if:** Payout section displays without errors

- [ ] **29. Verify Platform Fee (5%) in Purchase Breakdown**
  - As organizer, navigate to `/organizer/sales/[saleId]/orders` or similar
  - Click on the test purchase (Vintage Glass Vase, $45)
  - Verify breakdown shows:
    - Item price: $45.00
    - Platform fee: -$2.25 (5%)
    - Organizer receives: $42.75
  - Or if shown at checkout: verify shopper receipt shows item price $45 (fee transparent or included)
  - **PASS if:** Fee calculation correct and clearly displayed

---

## Admin Functions

- [ ] **30. Log In as ADMIN Role**
  - Log out or open new private window
  - Navigate to `/login`
  - Use admin credentials (email/password provided for test admin account)
  - Verify logged in as ADMIN role
  - Navigate to `/admin` dashboard
  - **PASS if:** Admin dashboard loads, no 403 errors

- [ ] **31. Check /admin/users — Both Test Accounts Appear**
  - On admin dashboard, click "Users" or navigate to `/admin/users`
  - Search or scroll for:
    - organizer-test@example.com (role: ORGANIZER)
    - shopper-test@example.com (role: USER)
  - Verify both accounts visible with:
    - Email
    - Name
    - Role
    - Registration date
    - Status (if shown)
  - **PASS if:** Both accounts visible and details correct

- [ ] **32. Check /admin/sales — Test Sale Appears**
  - On admin dashboard, click "Sales" or navigate to `/admin/sales`
  - Search or filter for "Spring Estate Treasures"
  - Verify sale appears with:
    - Sale title
    - Organizer name
    - Item count (should be 3)
    - Sale dates
    - Status (should be "Published" or "Live")
    - Action buttons (View, Edit, Delete if applicable)
  - **PASS if:** Sale visible with correct status

---

## Final Checks

- [ ] **All browser console errors resolved**
  - Open DevTools console on each major page
  - Verify no red errors (warnings OK)
  - Note any errors found

- [ ] **Responsive design check (optional but recommended)**
  - Resize browser to mobile width (375px) on home, sale detail, dashboard
  - Verify layout reflows and remains usable
  - Touch buttons are large enough

- [ ] **Performance baseline (optional)**
  - Load home page, measure time to first paint
  - Expected: < 3 seconds on 4G
  - Note baseline for comparison with production

---

## Summary

**Test Environment:** ___________________________

**Date Tested:** ___________________________

**Tested By:** ___________________________

### Overall Result

- [ ] **PASS** — All 32 steps passed, no critical issues
- [ ] **PASS WITH NOTES** — Majority passed, minor issues documented below
- [ ] **FAIL** — Critical issues blocking beta launch

### Critical Issues Found
(If any of steps 1-7, 13-16, 20-21, 30-32 failed, list here)

1. ___________________________________________________________
2. ___________________________________________________________
3. ___________________________________________________________

### Minor Issues / Observations

1. ___________________________________________________________
2. ___________________________________________________________
3. ___________________________________________________________

### Next Steps if FAIL

- [ ] Create GitHub issues for each critical failure
- [ ] Assign to appropriate team member
- [ ] Re-test after fixes
- [ ] Document any changes to test procedures

---

**Sign-Off:** (After all tests pass)

Beta Ready: ☐ YES ☐ NO

Date Approved: ___________________________

Approver: ___________________________
