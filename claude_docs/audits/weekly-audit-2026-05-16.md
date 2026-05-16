# Weekly Site Audit — 2026-05-16

**Audit Type:** Automated weekly comprehensive QA (scheduled task)
**Session:** S735 post-deploy
**Auditor:** Automated (Claude Cowork — weekly-full-site-audit scheduled task)
**Date:** 2026-05-16
**Routes Enumerated:** 183 total routes (via `find packages/frontend/pages -name "*.tsx"`)
**Routes Browser-Tested:** 14 key routes across public, shopper, organizer, and admin surfaces
**Test Accounts Used:** user2@example.com (Bob Smith — Organizer/PRO); Artifact MI (google session)

---

## CRITICAL (blocks beta testing)

### CRIT-1: Rate Limiter Causes Intermittent Session Loss on Authenticated Navigation

**Route:** All authenticated routes (`/organizer/workspace`, `/shopper/favorites`, `/shopper/dashboard`, etc.)
**Description:** After any failed auth attempt (e.g. a failed register POST), the rate limiter begins a ~15-minute window that intercepts the auth check call made on every page navigation. This causes the frontend to treat authenticated users as logged-out and redirect them to `/login`. The pattern is: login succeeds → first protected page loads → navigate to second protected page → session appears dropped → login page shown with "Rate limited. Please wait Xs before retrying" toast.

**Observed Behavior:**
- Navigated to `/shopper/dashboard` immediately after login: ✅ worked
- Navigated to `/shopper/favorites` 30 seconds later: ❌ session dropped, redirected to `/login?redirect=/shopper/favorites` with rate-limit toast (456s)
- Logged in again → navigated to `/organizer/workspace`: ❌ session dropped again, rate-limit toast (302s)

**Root Cause Hypothesis:** The frontend's auth check endpoint (likely `GET /api/users/me` or similar) is being hit by the rate limiter on every page transition. The register form test (POST /api/auth/register with existing email) started the rate-limit window, but the window is also being extended by subsequent auth-check calls, not just explicit login/register attempts.

**Decision rule conflict:** The `skipSuccessfulRequests: true` flag added in S722 should exclude successful responses from the rate limit count — but the auth check may be returning a 429 (rate limited) before it can return a 200, causing a false session drop.

**Impact:** Any user who triggers a rate limit (e.g. mistyping their password 15 times, or a failed register attempt) cannot navigate the authenticated app for up to 15 minutes. They appear logged out.
**Severity:** CRITICAL — completely breaks authenticated navigation during rate limit windows
**Violates:** D-009 (error states must have recovery paths — this one provides none except waiting 15 minutes)
**Dispatch:** → findasale-dev: investigate which endpoint the frontend polls for auth state on each page transition; confirm whether that endpoint is covered by a rate limiter; if so, whitelist auth-check GET calls from rate limiting or increase the limit for GET-only auth checks significantly.

---

## HIGH (degrades user experience)

### HIGH-1: Register Form Silent Error on Duplicate Email (#430 — Browser-Confirmed)

**Route:** `/register`
**Description:** Submitting the registration form with an email that already has an account produces no feedback to the user. The backend correctly returns `{"message":"An account already exists with this email address."}` but the frontend swallows the error. The form stays loaded with all fields filled, the button returns to active state, and no error toast or inline message appears anywhere on the page.

**Observed Behavior:** Navigated to `/register`. Filled in full name, email (artifactmi@gmail.com — existing account), DOB, password, confirm password. Clicked "Register". Waited 3 seconds. Page remained on register form with no error message, no toast, no redirect. Scrolled entire page — no error visible anywhere.

**Impact:** New users who try to register with an existing email have no idea what happened. They may try multiple times or give up. This is an acquisition blocker.
**Severity:** HIGH — directly blocks user acquisition and creates confusion at the most critical funnel step
**Already in Blocked Queue:** Yes (added S734 as P2). Browser-confirmed this session. Upgrading urgency — needs dispatch before next beta outreach sends.
**Dispatch:** → findasale-dev: `packages/frontend/pages/register.tsx` — in the form submit handler's catch block, extract `error.response?.data?.message` and display it either as an inline error below the email field or as a toast notification.

### HIGH-2: Rate Limit Toast Appearing on Page Load (Pre-Action)

**Routes:** `/organizers/[id]` (unclaimed profile), `/login`
**Description:** The "Rate limited. Please wait Xs before retrying" toast appears immediately on page load, before any user interaction. This is because a page-load API call is hitting the rate limiter and the frontend surfaces this as a global toast. From a user's perspective, they open a page and immediately see an error they didn't cause.

**Observed:** On `/organizers/cmoyqeau503478i796442jnnh`, the toast appeared within 1 second of page load showing "Rate limited. Please wait 269s before retrying." User had not clicked anything. Same on `/login` showing "Please wait 456s before retrying."

**Impact:** Real users browsing organizer profiles or trying to log in see a confusing error toast immediately on page load. The toast is truncated (text cut off by screen edge — see also LOW-2).
**Severity:** HIGH — confusing UX, breaks trust, appears on high-traffic public routes
**Dispatch:** → findasale-dev: (1) Review toast trigger logic — 429 responses from page-load API calls should be handled silently or with a less prominent indicator, not a full toast. (2) Ensure the rate-limit toast is not triggered for read-only page-load calls (only for explicit user actions like login/register).

---

## MEDIUM (polish issue)

### MED-1: Mobile Viewport Testing UNVERIFIED (VM Limitation)

**Routes:** All mobile-responsive routes
**Description:** The VM browser environment cannot resize below ~1260px viewport width. All D-004 (mobile-first) compliance checks for 375px viewport could not be performed. The S733 mobile fixes (organizer page badge inline, sales page `lg:hidden` cards for Where to Go / Holds & Shipping / SaleShareCard) were not Chrome-verified at true mobile width.

**Impact:** Unknown — these fixes may be correct but cannot be visually confirmed via automated audit. Requires Patrick or QA on a real mobile device or DevTools emulation.
**Severity:** MEDIUM — mobile is primary use case, but code review of S733 suggests the fixes are structurally correct
**Action:** Add to Blocked Queue for next in-person QA session. Patricia/Patrick should test on real phone: `/organizers/[id]` (check inline badge), `/sales/[id]` (check Where to Go card, Holds & Shipping card, SaleShareCard are visible on mobile).

### MED-2: Sale of the Day Shows 0 Items Listed

**Route:** `/` (homepage)
**Description:** The "Sale of the Day" widget on the homepage is featuring "Outstanding Lifetime Fishing & Lure Collection" (Bluffff, IN — Sat May 16) with "0 items listed." A shopper clicking "Shop Now" lands on a sale page with no inventory.

**Impact:** Poor first impression. Homepage is the most visible surface. A "Sale of the Day" with zero items undermines credibility.
**Severity:** MEDIUM — data quality issue, not a code bug. The Sale of the Day selection algorithm should filter out sales with 0 items.
**Action:** → findasale-dev: review the Sale of the Day selection query — add `WHERE item_count > 0` or equivalent filter.

### MED-3: Unclaimed Organizer Profile — Rate Limit Toast Truncated

**Route:** `/organizers/[id]` (any unclaimed profile)
**Description:** The rate-limit toast in the top-right corner is cut off by the screen edge. The message reads "Rate limited. Please wait 269s be..." (truncated). This is a layout/CSS issue with how the toast container is positioned.

**Impact:** Even if the toast message were appropriate to show, users cannot read the full message.
**Severity:** MEDIUM — toast visibility/layout bug
**Dispatch:** → findasale-dev: check toast container max-width and right-edge positioning. Ensure toast text wraps correctly and doesn't clip at viewport edge.

### MED-4: Email Verification Banner Displaying for Seed Organizer

**Route:** `/organizer/dashboard`
**Description:** The "Check your inbox to verify your email" banner is showing for user2@example.com (Bob Smith). For seed/test accounts, this banner will always show since verification emails aren't actually sent. This is less a code bug and more a test-environment concern, but it does mean every QA session will show this banner, potentially masking real issues.

**Impact:** Low for production, but consistent noise in QA.
**Severity:** MEDIUM — no action needed for production; consider adding a way to mark seed accounts as verified in seed script.

---

## LOW (nitpick)

### LOW-1: "0 items listed" Text on Directory Listing Cards

**Route:** `/sales` (sales listing page)
**Description:** Multiple directory listing sale cards show "0 items listed" as their item count. These are scraped/unmanaged listings. The text is accurate but looks empty and could deter shoppers from clicking. Consider replacing with "Browse listing →" or hiding the item count for directory-only sales.

**Impact:** Cosmetic — directory sales typically have no items, just basic info. No real functionality issue.
**Severity:** LOW
**Action:** Product decision — decide if item count should be hidden for directory-only sales (isUnmanagedListing === true).

### LOW-2: Nav Not Collapsing to Hamburger in VM Test Environment

**Route:** All pages at ~1260px viewport
**Description:** At 1260px (the minimum VM viewport), the top nav shows all items inline: "Map Trending Explore Pricing" + all icon buttons. At real breakpoints (< ~768px) this should collapse to a hamburger. Cannot verify this in VM but worth noting.

**Severity:** LOW — cannot verify, likely works correctly at real mobile widths.

### LOW-3: "Hold duration: 48h after yellow tag" Visible on Sale Detail Page

**Route:** `/sales/[id]` (AMAZING ART ANTIQUES sale)
**Description:** The hold duration text "Hold duration: 48h after yellow tag" appears in the "About This Sale" description section. This looks like raw organizer notes leaking into the public description. It's not harmful but is unprofessional-looking copy.

**Impact:** Low — confusing to shoppers who don't know what "yellow tag" means.
**Severity:** LOW — this is organizer-entered content in the description field. Consider adding a note in the workspace that description text appears publicly.

---

## VERIFIED CLEAR ✅

The following routes and decisions were verified as working correctly:

| Route | Finding | Decision |
|-------|---------|----------|
| `/` (homepage) | Loads, dark mode, D-001 copy (all sale types) | D-001 ✅ |
| `/pricing` | Loads, dark mode, Free/$29/$79 tiers correct | D-007 ✅ |
| `/about` | Mission statement includes all sale types | D-001 ✅ |
| `/sales` | List loads, dark mode, sale cards render | — ✅ |
| `/sales/[id]` | Section order: header→about→live activity→items→share; skeleton loading | D-006 ✅, D-008 ✅ |
| `/sales/[id]` | Inventory empty state has "Remind Me by Email" CTA | D-003 ✅ |
| `/organizers/[id]` (unclaimed) | S735 redesign: trust bar, 28% ring, UNCLAIMED stamp, locked sections | S735 ✅ |
| `/register` | Renders, dark mode, all form fields present | — ✅ |
| `/admin` (as non-admin) | Access Denied page with "Go to Home" and "Contact Support" | D-009 ✅ |
| `/shopper/favorites` (when authenticated) | Empty state "No saved items yet" + Browse Sales CTA | D-003 ✅ |
| `/shopper/dashboard` | Loads, XP rank, progress bar, CTAs | — ✅ |
| `/organizer/dashboard` | Loads, email verification banner, quick actions | — ✅ |
| Footer (all pages) | "yard sales, garage sales, estate sales, flea markets" — inclusive | D-001 ✅ |

---

## Summary

**Total routes enumerated:** 183
**Routes browser-tested:** 14 (key surfaces across public/shopper/organizer/admin)
**Critical findings:** 1
**High findings:** 2
**Medium findings:** 4
**Low findings:** 3

### Top 3 Recommendations for Next Session

1. **DISPATCH IMMEDIATELY — CRIT-1:** Investigate rate limiter interfering with auth check on page navigation. This makes the app unusable for users who have triggered any rate limit in the past 15 minutes. This is a potential blocker for beta outreach — if a new user mistyps their password, they're locked out of the authenticated experience.

2. **DISPATCH — HIGH-1 (#430):** Register form silent error is an acquisition blocker. Every email sent by the outreach cron pointing people to register must result in a working registration flow. Silent failures on existing-email collisions means lost organizers.

3. **VERIFY MOBILE — MED-1:** Get S733 mobile fixes verified on a real device (iPhone/Android) or DevTools at 375px before expanding beta. Organizer page badge and sales page mobile cards are unverified.

### DECISIONS.md Drift Check

| Decision | Status |
|----------|--------|
| D-001: All sale types scope | ✅ Compliant — homepage, about, footer all inclusive |
| D-002: Dark mode support | ✅ All tested routes render correctly in dark mode |
| D-003: Empty states have CTAs | ✅ Verified on favorites, sale items, shopper dashboard |
| D-004: Mobile-first | ⚠️ UNVERIFIED — VM limitation prevents 375px testing |
| D-005: Multi-endpoint testing | ⚠️ PARTIAL — messaging/organizer↔shopper not tested this session |
| D-006: Sale detail section order | ✅ Items before map/reviews confirmed |
| D-007: Teams tier $79/mo | ✅ Pricing page correct |
| D-008: Loading states mandatory | ✅ Skeleton loading confirmed on sale detail |
| D-009: Error states with recovery | ✅ Admin access denied has recovery path; ⚠️ register silent error violates D-009 |
| D-010: No autonomous removals | N/A — audit only, no removals |
