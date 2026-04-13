# QA Findings — D1 Priority Re-tests — 2026-03-25

## Overall: FAIL — Critical Routing Issues Blocking Feature Testing

**Critical Finding:** The application is experiencing significant authentication/routing issues that prevent access to protected pages and features. This is a P0-level blocker affecting all organizer-facing features.

## Issues Encountered

### 1. **Route Redirect Loop (P0 — BLOCKER)**
- **Issue:** All attempts to access organizer-protected pages result in redirects to /register
- **Affected Routes Tested:**
  - `/organizer/dashboard` → redirects to home
  - `/organizer/sales` → loads briefly, then redirects to /register
  - `/organizer/create-sale` → redirects
  - Direct sale URLs (`/sales/[id]`) → redirect to /register
  
- **User Status:** Logged in as Bob Smith (user2@example.com, PRO tier), confirmed by nav bar showing "BS Bob Smith"
- **Expected:** Logged-in users should access protected pages
- **Actual:** Protected routes redirect to register page regardless of auth state
- **URL Examples:**
  - Attempted: https://finda.sale/organizer/sales
  - Result: Redirect to https://finda.sale/register
  - Attempted: https://finda.sale/sales/cmn61o8gm0047udtb97ggjhph
  - Result: Redirect to https://finda.sale/register

### 2. **Navigation Click Behavior (P1)**
- **Issue:** Clicking on sale cards in feed sometimes triggers unexpected navigation
- **Example:** Clicking "Family Collection Sale 12" from /feed attempted to navigate to sale detail but redirected to register instead
- **Note:** Navigation bar and main feed page load correctly when accessed directly

## Features Unable to Test Due to Blocking Issue

All six feature groups could not be tested due to the routing blocker:

| Feature | Test Status | Blocker | Notes |
|---------|-------------|---------|-------|
| #27 CSV Export | ❌ BLOCKED | Route redirect | Cannot access export functionality on /organizer/dashboard |
| #66 ZIP Export | ❌ BLOCKED | Route redirect | Cannot access export functionality |
| #125 Syndication Export | ❌ BLOCKED | Route redirect | Cannot access export functionality |
| #184 iCal / Calendar Export | ❌ BLOCKED | Route redirect | Cannot navigate to published sale detail pages |
| #131 Share & Promote Templates | ❌ BLOCKED | Route redirect | Cannot access sale detail or organizer pages |
| #132 À La Carte Single-Sale Fee | ❌ BLOCKED | Route redirect | Cannot access publish modal or create sale flow |
| #172 Stripe Connect Setup | ❌ BLOCKED | Route redirect | Cannot access organizer settings |
| #65 Tier Gating | ❌ BLOCKED | Route redirect | Cannot access tier-gated features |

## What Did Load Successfully

- ✅ Home page (`/`)
- ✅ Feed page (`/feed`) with sale listings
- ✅ User authentication (login with user2@example.com)
- ✅ Nav bar with user profile
- ✅ Public pages (About, Pricing, Leaderboard, etc.)

## Console Errors Found

- [WARN] MetaMask Ethereum provider error (unrelated to feature testing)
- No app-specific errors visible in console during initial page loads

## Severity Assessment

**P0 — CRITICAL:** The routing/auth system is fundamentally broken for protected pages. This must be fixed before any feature-level testing can proceed.

## Recommendations for Next Session

1. **Debug auth/routing flow:** Check why authenticated users are being redirected to /register on protected routes
2. **Verify session state:** Confirm JWT/session tokens are being validated correctly
3. **Check middleware:** Review auth guards and route protection middleware
4. **Test with fresh login:** Try full logout + login cycle to reset session state
5. **Check backend logs:** Verify API is correctly validating auth tokens for protected endpoints

## Conclusion

No features could be tested due to a P0-level application blocker. The site needs urgent routing/authentication fixes before QA can proceed with feature validation.

