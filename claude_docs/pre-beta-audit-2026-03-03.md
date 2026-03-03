# Pre-Beta User Journey Audit — 2026-03-03

Comprehensive audit across all user flows, device types, and frontend↔backend contract alignment.
Health scout fixes applied first (auth.ts token log, index.ts env-var gating).

---

## CRITICAL — Fix before any real user touches it

### C1. Role escalation: backend trusts client-supplied role
- **File:** `packages/backend/src/controllers/authController.ts:33`
- **Issue:** Register endpoint writes `role` directly from `req.body` without validation. A malicious POST with `role: "ADMIN"` creates an admin account.
- **Fix:** Whitelist: `const safeRole = ['USER','ORGANIZER'].includes(role) ? role : 'USER';`

### C2. AuthContext never decodes `referralCode` from JWT
- **File:** `packages/frontend/components/AuthContext.tsx:33-38, 54-59`
- **Issue:** Backend puts `referralCode` in JWT (authController.ts:100,147), but AuthContext omits it in both decode locations. `user.referralCode` is always `undefined`. Shopper dashboard shows "YOUR_CODE" instead of real code.
- **Fix:** Add `referralCode: payload.referralCode || ''` in both `setUser()` calls.

### C3. getSale missing `category` and `condition` on items
- **File:** `packages/backend/src/controllers/saleController.ts:234-246`
- **Issue:** Items select block doesn't include `category` or `condition`. Frontend sale detail page renders category filter buttons and condition badges from these fields — they're always undefined.
- **Fix:** Add `category: true, condition: true` to the items select.

### C4. AffiliateLink schema missing `userId` — creator dashboard broken
- **File:** `packages/database/prisma/schema.prisma:202-209`
- **Issue:** AffiliateLink model has no `userId` field, only `saleId @unique`. The affiliateController tries to upsert with `userId_saleId` composite key which doesn't exist in schema. Any creator trying to generate an affiliate link will get a Prisma error.
- **Fix:** Add `userId String`, `user User @relation(...)`, change `saleId @unique` → `@@unique([userId, saleId])`.

---

## HIGH — Fix this week (before beta invites)

### H1. getSale missing organizer badges/rating data
- **File:** `packages/backend/src/controllers/saleController.ts:225-232`
- **Issue:** Organizer select doesn't include badges, avgRating, reviewCount. Frontend sale detail page expects these for the organizer trust badge section — always empty.
- **Fix:** Expand organizer select to include badge and rating fields.

### H2. Photo upload fails atomically on single-image error
- **File:** `packages/backend/src/controllers/uploadController.ts:69`
- **Issue:** `Promise.all()` rejects entire batch if 1 of 20 photos fails. User loses all uploads, no indication which photo caused the error.
- **Fix:** Switch to `Promise.allSettled()`, return partial results + per-file errors.

### H3. No input trimming on email/name (auth)
- **File:** `packages/backend/src/controllers/authController.ts:10,117`
- **Issue:** Email and name are stored as-received. " user@email.com " and "user@email.com" become different accounts. Login will fail for the trimmed version.
- **Fix:** `const email = req.body.email?.trim().toLowerCase();`

### H4. Weekend date filter logic wrong on Saturday
- **File:** `packages/frontend/pages/index.tsx:108-114`
- **Issue:** When today is Saturday (`getDay()=6`), the offset calculation produces `(6-6+7)%7 = 0`, pointing to next Saturday instead of today. Users see "no sales this weekend" on Saturday.
- **Fix:** Use date-fns `startOfWeek`/`endOfWeek` or handle Saturday/Sunday as current-day edge cases.

### H5. Organizer dashboard tables unusable on mobile
- **File:** `packages/frontend/pages/organizer/dashboard.tsx:439-476, 542-570, 614-677`
- **Issue:** 7+ column tables use `overflow-x-auto` but no mobile card view. Organizers managing sales on phone must scroll horizontally constantly.
- **Fix:** Add responsive card layout: `hidden md:table` for table + card view for mobile.

### H6. No `next/image` — raw `<img>` everywhere
- **Files:** All pages with images (index.tsx, sales/[id].tsx, organizer/dashboard.tsx, etc.)
- **Issue:** Every image uses raw `<img>` tag. No lazy loading, no automatic sizing, no format optimization. Mobile users on cellular connections load full-resolution Cloudinary images.
- **Fix:** Replace with `next/image` or at minimum add `loading="lazy"` and Cloudinary transform params for responsive sizes.

### H7. CSV import has no input sanitization
- **File:** `packages/backend/src/controllers/itemController.ts:60-65`
- **Issue:** CSV rows are parsed and inserted into DB without field validation. Malformed data, XSS payloads in title/description, or extremely long strings pass through to the database.
- **Fix:** Validate each row against a Zod schema before `createMany()`.

---

## MEDIUM — Fix this sprint

### M1. Hamburger menu button too small for touch (10×10px vs 44×44px WCAG minimum)
- **File:** `packages/frontend/components/Layout.tsx:141`
- **Fix:** Change `p-2` to `p-3` and add `min-w-[44px] min-h-[44px]`.

### M2. Phone number input accepts any string (SaleSubscription + register)
- **Files:** `components/SaleSubscription.tsx:124`, `pages/register.tsx:204`
- **Fix:** Add E.164 format validation or use a phone input library.

### M3. Shopper dashboard shows "YOUR_CODE" for referral link (downstream of C2)
- **File:** `packages/frontend/pages/shopper/dashboard.tsx:502`
- **Fix:** Will be resolved by C2 fix. Also consider fetching fresh from `/users/me` as a fallback.

### M4. No sale favorites endpoint — only item favorites implemented
- **Files:** `routes/favorites.ts`, `favoriteController.ts`
- **Issue:** Schema supports both `saleId` and `itemId` on Favorite, but only item toggle is implemented. Shopper dashboard displays sale favorites section but users can't actually favorite a sale from the sale page.
- **Fix:** Add `POST /favorites/sale/:id` endpoint mirroring item favorite logic, or remove sale favorites from dashboard.

### M5. Points never awarded on purchase — only on referral
- **Files:** All backend controllers
- **Issue:** Point system exists but only referrals add points (50 per signup). No points awarded for purchases, reviews, or other engagement. Dashboard shows points but they never grow for most users.
- **Fix:** Add point increments to purchase completion (stripeController webhook) and review submission.

### M6. Bid status always "PARTICIPATING" — never computed
- **File:** `packages/backend/src/routes/users.ts:50`
- **Issue:** `/me/bids` endpoint returns hardcoded `status: "PARTICIPATING"`. Frontend expects WINNING/LOSING/WON/LOST.
- **Fix:** Compare user's bid amount vs item's currentBid to determine status.

### M7. Organizer fields missing labels (accessibility)
- **File:** `packages/frontend/pages/register.tsx:192-223`
- **Issue:** Business name, phone, and address inputs have no `<label>` or `sr-only` label — breaks screen reader navigation.
- **Fix:** Add `<label htmlFor="..." className="sr-only">` for each field.

### M8. No error boundary for map component
- **File:** `packages/frontend/pages/sales/[id].tsx:587-607`
- **Issue:** If Leaflet fails to load (CDN issue, ad blocker), entire sale page crashes.
- **Fix:** Wrap SaleMap in React error boundary with fallback address text.

### M9. Install prompt cramped on 320px phones
- **File:** `packages/frontend/components/InstallPrompt.tsx:95-98`
- **Fix:** Add `flex-wrap` and responsive text sizing for very narrow screens.

### M10. Tags field missing from item form
- **File:** `packages/frontend/pages/organizer/add-items.tsx`
- **Issue:** Backend stores tags (itemController.ts:260) but no UI to set them. AI tagger generates tags but organizer can't view or edit them.
- **Fix:** Add a tags input (comma-separated or chips) to the add/edit item forms.

### M11. Footer grid jumps at tablet width (600-650px)
- **File:** `packages/frontend/components/Layout.tsx:182`
- **Fix:** Add intermediate breakpoint: `grid-cols-1 sm:grid-cols-2 md:grid-cols-3`.

### M12. PWA manifest screenshots array empty
- **File:** `packages/frontend/public/manifest.json:91`
- **Fix:** Add 2-3 screenshots at 540×720 and 1080×1440 for Android install preview.

---

## LOW — Track, fix when relevant

### L1. Email format not validated server-side (HTML5 type="email" only defense)
### L2. No password complexity requirements beyond 8-char minimum
### L3. Geocoding failure creates sale at lat:0 lng:0 (Null Island)
### L4. Auction items can be created without startPrice when isAuctionItem=true
### L5. CSP uses `unsafe-inline` in script-src (Stripe requirement makes this hard to remove)
### L6. Homepage SaleCard component exists but unused — inline cards in index.tsx instead
### L7. iOS status bar style set to "default" instead of "black-translucent"
### L8. No field length limits (maxLength) on form inputs
### L9. Category filter has no "Uncategorized" option for items without category

---

## Clean Areas (no issues found)

- **Auth rate limiting:** 10 req / 15 min per IP on `/api/auth` ✓
- **CORS:** Restricted to `ALLOWED_ORIGINS`, no wildcard ✓
- **JWT:** No verify bypass, no ignoreExpiration ✓
- **Upload auth:** All upload routes protected via `router.use(authenticate)` ✓
- **Admin badge endpoint:** Properly checks `role === 'ADMIN'` ✓
- **SSR safety:** All `window.*` references guarded in useEffect/onClick ✓
- **Prisma pagination:** All findMany calls have `take:` limits ✓
- **Alt text on images:** All major components have descriptive alt ✓
- **Offline page:** Responsive and accessible ✓
- **Service worker caching:** Smart strategies per asset type ✓
- **Mobile hamburger nav:** Works with aria-expanded/controls ✓
- **Skip-to-content link:** Present and keyboard-accessible ✓
- **Toast accessibility:** aria-live="polite" on toast container ✓

---

## Recommended Fix Order

| Priority | Issue | Est. Time | Impact |
|----------|-------|-----------|--------|
| 1 | C1 — Role validation | 5 min | Security: prevents admin escalation |
| 2 | C2 — AuthContext referralCode | 5 min | Unblocks referral feature |
| 3 | C3 — getSale category/condition | 5 min | Unblocks item filters on sale page |
| 4 | C4 — AffiliateLink schema | 20 min | Unblocks creator dashboard |
| 5 | H1 — Organizer badges in getSale | 5 min | Trust signals on sale page |
| 6 | H3 — Email trim/lowercase | 5 min | Prevents duplicate accounts |
| 7 | H4 — Weekend filter fix | 10 min | Correct homepage filtering |
| 8 | H2 — Photo upload partial success | 15 min | Better organizer upload UX |
| 9 | H7 — CSV sanitization | 15 min | Prevents injection |
| 10 | M1-M12 | 2-3 hours | Polish for beta launch |
