# UX Spec: Shopper→Organizer Conversion Flow

**Status:** Ready for Implementation (findasale-dev dispatch)
**Backend Dependency:** S264 `/api/users/setup-organizer` (COMPLETE)
**Priority:** P2 — High-value funnel closure, no blockers
**Author:** findasale-ux
**Date:** 2026-03-24

---

## Executive Summary

A logged-in SHOPPER (role: `USER`) currently has no frontend path to convert to ORGANIZER. The backend endpoint `/api/users/setup-organizer` (fixed in S264) atomically:
1. Creates an `Organizer` profile record
2. Adds `ORGANIZER` to the user's `roles` array
3. Returns a fresh JWT with both `USER` and `ORGANIZER` roles

This spec defines **where** CTAs appear, **what** happens on click, **where** the user goes after, and **how** the nav adapts to their dual role.

---

## Part 1: Entry Points (CTA Placement)

### 1.1 Pricing Page (`/organizer/pricing`)

**Current state:** Page shows 4 tiers (SIMPLE/PRO/TEAMS/ENTERPRISE). Logged-in organizers see their current tier. Logged-out users see a "Sign up" CTA per tier.

**Gap:** Logged-in **SHOPPER-only** users (role: `USER`, no organizer profile) see the same layout as logged-out users — all CTAs say "Sign up for [TIER]," which redirects to `/register`. This is wrong: they're already authenticated.

**Solution:**

- **Above the pricing table** (new element): Add a promotional banner visible ONLY to logged-in SHOPPER-only users (i.e., `user.role === 'USER'` AND no organizer profile exists).

  - **Banner location:** Between the header "Simple, Transparent Pricing" and the tier cards.
  - **Banner copy option A:** "Ready to host your first sale? Become an Organizer and start selling today."
  - **Banner copy option B:** "Want to list your items for sale? Start as a SIMPLE organizer for free — no fees upfront."
  - **Banner copy option C:** "Start a sale. Choose your plan below to unlock FindA.Sale's organizer tools."

  - **Banner style:** Semi-prominent accent card (e.g., warm/amber background with subtle shadow, similar to the Enterprise CTA section already on the page).

  - **CTA button in banner:** "Become an Organizer" (primary button, amber-600)
  - **Behavior on click:** See §2.1 (Modal flow).

- **Modify tier button copy:**

  - For SHOPPER users: Change "Sign up for SIMPLE" → "Start Free as Organizer"
  - For SHOPPER users on PRO/TEAMS: Change "Sign up for PRO/TEAMS" → "Upgrade to PRO/TEAMS"
  - Rationale: Signals that clicking will activate organizer role + enroll in tier (not re-register).

### 1.2 Navigation Sidebar/Menu (`components/Layout.tsx`)

**Current state:**
- For `role === 'USER'` (SHOPPER): Shows shopper-only nav (My Dashboard, My Profile, Inspiration, My Saves, etc.). No organizer-related options.
- For `role === 'ORGANIZER'`: Shows full organizer menu (Dashboard, Plan a Sale, Subscription, Pro Tools, etc.).

**Gap:** No CTA for SHOPPER-only users to upgrade within the nav. A natural place to add conversion intent.

**Solution:**

- **Add a CTA section in the shopper nav** (after "My Saves" or before the "My Explorer Profile" divider):

  - **New section header:** "Ready to Sell?" (style: uppercase, warm-600, like existing "My Explorer Profile" header)
  - **New nav link (actually a button with icon):** "Host a Sale" (with small icon, e.g., 🏪 or 📍, or a custom badge)
  - **Link behavior:** Clicking opens the conversion modal (see §2.1).
  - **Show only if:** `user.role === 'USER'` and no organizer profile exists.

- **Mobile nav (drawer):** Same logic — add "Host a Sale" button in the authenticated section, between shopper links and logout button.

- **Desktop header:** No nav bar changes needed (CTAs are modal-driven, not links).

### 1.3 Homepage (`pages/index.tsx`)

**Current state:** Hero section says "Discover Amazing Deals" with a tagline about browsing sales. Below-the-fold are sales feed, filters, and map.

**Gap:** No call-to-action for logged-in SHOPPERS to become organizers.

**Solution (optional, low priority):**

- **Add a small section below the map or after the "Featured Sales" grid** (visible only to logged-in SHOPPER users):
  - **Headline:** "Have items to sell? List them on FindA.Sale"
  - **Copy:** "Join thousands of estate sale organizers. Post your inventory, attract buyers, and earn commissions."
  - **CTA:** "Start Hosting" (secondary button, amber outline)
  - **Behavior on click:** Opens conversion modal (see §2.1).

---

## Part 2: Interaction Flow & API Integration

### 2.1 Conversion Modal (Triggered by all CTAs)

**Behavior when any CTA is clicked:**

1. **Modal opens** with title: "Become an Organizer"
2. **Modal content:**
   - Brief explanation: "You'll unlock the ability to list items for sale on FindA.Sale. Complete this in seconds."
   - **Input field 1:** Business Name (pre-filled with user's name, optional)
   - **Input field 2:** Phone (optional, but encouraged; pattern: `^\d{3}-\d{3}-\d{4}$` or similar US format)
   - **Input field 3:** Address (optional)
   - **Checkbox:** "I agree to the Organizer Terms of Service" (links to `/terms?section=organizer`)
   - **Buttons:**
     - "Complete Setup" (primary, amber-600, disabled until checkbox is checked)
     - "Cancel" (secondary)

3. **Form validation:**
   - Business Name: Required, 1–100 characters.
   - Phone: Optional; if provided, validate US phone format.
   - Address: Optional; if provided, validate non-empty string.
   - Checkbox: Required before submit.

4. **On "Complete Setup" click:**
   - **Show loading state** ("Setting up your organizer account…").
   - **POST `/api/users/setup-organizer`** with payload:
     ```json
     {
       "businessName": "[entered or pre-filled]",
       "phone": "[if provided]",
       "address": "[if provided]"
     }
     ```
   - **Handling responses:**
     - **Success (200):**
       - Backend returns `{ organizer, token }` with fresh JWT including `roles: ['USER', 'ORGANIZER']`.
       - Frontend stores new token in localStorage, updates AuthContext.
       - Close modal.
       - Show success toast: "Welcome, Organizer! You're ready to list your items." (2–3s, auto-dismiss).
       - **Redirect to:** `/organizer/dashboard` (see §2.2).

     - **Failure (4xx/5xx):**
       - Close loading state.
       - Show error message in modal: "Failed to activate organizer profile. Please try again." (red text, persistent until dismissed or retry).
       - "Retry" button to resubmit.
       - Optional: Log error to console for debugging.

---

### 2.2 Post-Upgrade Redirect & Landing

**After successful setup:**

- User is redirected to `/organizer/dashboard`.
- **Dashboard now sees user has BOTH `USER` and `ORGANIZER` roles.**
- **Dashboard should display:**
  - A welcome banner: "Welcome to your organizer dashboard! You can now list items for sale. Start by creating your first sale." (green or warm accent)
  - Quick-start CTA: "Create Your First Sale" (primary button, links to `/plan` or create-sale page).
  - Existing dashboard content (sales list, stats, etc.).

---

### 2.3 Auth State & Token Refresh

**Post-conversion auth context updates:**

- **Old token payload:** `{ id, email, name, role: 'USER', roles: ['USER'], ... }`
- **New token payload:** `{ id, email, name, role: 'USER', roles: ['USER', 'ORGANIZER'], ... }`
- Frontend AuthContext updates via:
  1. Stores new token in localStorage.
  2. Re-parses JWT to extract `roles` array.
  3. Sets `user.role` to `'USER'` (unchanged) but updates `user.roles` to `['USER', 'ORGANIZER']`.
  4. Triggers `useAuth()` hook subscribers → nav components re-render.

**Nav Adaptation (Layout.tsx):**

- **Before:** `if (user.role === 'USER') { showShopperNav() } else if (user.role === 'ORGANIZER') { showOrganizerNav() }`
- **After:** Must handle dual role. Options:

  **Option A (Recommended):** Show **combined nav** with both shopper and organizer sections.
  - Shopper section: My Dashboard, My Profile, Inspiration, etc.
  - Organizer section: Dashboard, Plan a Sale, Subscription, etc.
  - This gives power users flexibility; they can shop AND sell.

  **Option B:** Show **organizer-primary nav**, with a "Switch to Shopper Mode" link.
  - Reduces cognitive load but removes simultaneous access.
  - Less recommended; violates principle that both roles should be equally accessible.

  **Recommended:** **Option A** — dual nav. See acceptance criteria §4.1 for testability.

---

## Part 3: Error States & Edge Cases

### 3.1 API Errors

| Scenario | Response | User-Facing Action |
|----------|----------|-------------------|
| Network failure | No response / timeout | Toast error: "Network error. Check your connection and try again." Retry button. |
| 400 Bad Request (validation) | `{ message: "businessName required", ... }` | Modal error: "Business name is required." Focus field. |
| 401 Unauthorized | User token expired | Redirect to `/login` with message: "Your session expired. Please log in again." |
| 409 Conflict (organizer exists) | `{ message: "Already an organizer", created: false }` | Toast success: "You're already set up as an organizer. Redirecting…" → `/organizer/dashboard` |
| 500 Server Error | Generic error | Toast error: "Server error. Please contact support." |

### 3.2 Edge Cases

**Case 1: User already has organizer profile (but came via CTA).**
- Backend returns `{ created: false }` with existing organizer data.
- Frontend detects this and shows: "You're already an organizer! Redirecting to your dashboard…"
- Redirect to `/organizer/dashboard` without modal.

**Case 2: User closes modal mid-upload.**
- No API call was made.
- User remains SHOPPER-only.
- Closing modal is a no-op; user stays on same page.

**Case 3: User has organizer role already (role === 'ORGANIZER').**
- CTAs should NOT appear (pricing page banner hidden, "Host a Sale" nav link hidden).
- If accessed via direct URL navigation to modal component, modal should not open.

**Case 4: Dual-role user (has both USER and ORGANIZER).**
- Nav shows combined sections (Option A).
- All shopper features remain accessible.
- All organizer features remain accessible.

---

## Part 4: Component & File Changes

### 4.1 Files Requiring Updates

| File | Change Type | Details |
|------|------------|---------|
| `packages/frontend/pages/organizer/pricing.tsx` | **Component addition** | Add banner above tier grid (visible to SHOPPER-only users). Modify tier button labels. |
| `packages/frontend/components/Layout.tsx` | **Component update** | Add "Host a Sale" section/button to shopper nav. Apply conditional rendering: show only if `user.role === 'USER'` and no organizer profile. |
| `pages/index.tsx` | **Optional component addition** | Add "Have items to sell?" section below Featured Sales (optional, low priority). |
| `packages/frontend/components/BecomeOrganizerModal.tsx` | **New file** | Modal component: form + submission logic. Handles all UI/UX for conversion. |
| `packages/frontend/hooks/useOrganizerSetup.ts` | **New file** (optional) | Custom hook to encapsulate `/api/users/setup-organizer` API call + error handling. |
| `packages/frontend/pages/organizer/dashboard.tsx` | **Component update** | Add welcome banner for newly converted users (check for `upgrade=success` or similar URL param). |

### 4.2 New Components/Hooks

**BecomeOrganizerModal (new):**
```
export interface BecomeOrganizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void; // Called after successful setup, before redirect
}

export const BecomeOrganizerModal: React.FC<BecomeOrganizerModalProps> = (...) => {
  // Form state, validation, API call, error handling
  // Returns JSX modal
}
```

**useOrganizerSetup (optional hook):**
```
export const useOrganizerSetup = () => {
  const setupOrganizer = async (data: {
    businessName: string;
    phone?: string;
    address?: string;
  }) => {
    // POST /api/users/setup-organizer
    // Returns { organizer, token }
  };
  return { setupOrganizer, loading, error };
};
```

---

## Part 5: Acceptance Criteria (Testable)

1. **AC1: Pricing Page Banner (Shopper-Only)**
   - Given: Logged-in SHOPPER user visits `/organizer/pricing`.
   - When: Page loads.
   - Then: Banner appears above tier grid with text "Ready to host your first sale?" and a "Become an Organizer" button.
   - AND: Banner does NOT appear for logged-out users or for users with `role === 'ORGANIZER'`.

2. **AC2: Pricing Tier Button Labels**
   - Given: Logged-in SHOPPER user on pricing page.
   - When: Looking at tier cards.
   - Then: SIMPLE card shows "Start Free as Organizer" button.
   - AND: PRO/TEAMS cards show "Upgrade to PRO/TEAMS" button.
   - AND: Logged-out users see "Sign up for [TIER]" (unchanged).

3. **AC3: Navigation "Host a Sale" Link**
   - Given: Logged-in SHOPPER user on any page.
   - When: User opens mobile drawer or looks at nav menu.
   - Then: Nav shows "Ready to Sell?" section with "Host a Sale" button.
   - AND: Button is not visible for organizers or logged-out users.

4. **AC4: Modal Opens on CTA Click**
   - Given: Logged-in SHOPPER user.
   - When: Clicks any "Become an Organizer" / "Host a Sale" CTA.
   - Then: Modal dialog opens with title "Become an Organizer" and form fields (business name, phone, address).
   - AND: "Complete Setup" button is disabled until terms checkbox is checked.

5. **AC5: Successful Setup & Token Update**
   - Given: User completes modal form and clicks "Complete Setup".
   - When: API responds with 200 and token with `roles: ['USER', 'ORGANIZER']`.
   - Then: Modal closes.
   - AND: Success toast appears: "Welcome, Organizer!...".
   - AND: User is redirected to `/organizer/dashboard`.
   - AND: `useAuth()` returns `user.roles === ['USER', 'ORGANIZER']`.

6. **AC6: Nav Adapts to Dual Role**
   - Given: User is now ORGANIZER (after §5 setup).
   - When: User is on any page.
   - Then: Nav shows **both** shopper sections (My Dashboard, Inspiration, etc.) AND organizer sections (Dashboard, Plan a Sale, etc.).
   - AND: "Host a Sale" button is gone (user already is organizer).

7. **AC7: API Error Handling**
   - Given: User submits modal form but network fails or server errors (500).
   - When: API responds with error.
   - Then: Modal error message displays: "Failed to activate organizer profile. Please try again."
   - AND: "Retry" button is available to resubmit.
   - AND: Modal remains open (no redirect).

8. **AC8: Organizer Dashboard Welcome**
   - Given: User arrives at `/organizer/dashboard` as newly converted ORGANIZER.
   - When: Page loads.
   - Then: Welcome banner displays: "Welcome to your organizer dashboard!..." with "Create Your First Sale" button.
   - AND: Banner is not shown to existing organizers (only new conversions within this session).

---

## Part 6: Flow Diagrams (Text-Based)

### 6.1 Happy Path

```
User (SHOPPER) visits /organizer/pricing
    ↓
Sees banner "Ready to host your first sale?"
    ↓
Clicks "Become an Organizer"
    ↓
BecomeOrganizerModal opens
    ↓
User enters Business Name, Phone, Address (optional)
    ↓
Checks "I agree to Organizer Terms"
    ↓
Clicks "Complete Setup"
    ↓
Loading state ("Setting up...")
    ↓
POST /api/users/setup-organizer
    ↓
Backend creates Organizer profile + adds ORGANIZER role + returns new JWT
    ↓
Frontend stores new token, updates AuthContext
    ↓
Modal closes, toast success "Welcome, Organizer!"
    ↓
Redirect to /organizer/dashboard
    ↓
Dashboard shows welcome banner + quick-start CTA
    ↓
User can now list sales
```

### 6.2 Error Path

```
User in modal, clicks "Complete Setup"
    ↓
API call fails (500 or network error)
    ↓
Modal shows error: "Failed to activate. Please try again."
    ↓
User clicks "Retry"
    ↓
API call reattempted
    ↓
[If success → happy path from here]
[If still fails → error remains, user dismisses modal]
    ↓
User returns to pricing page (modal closed)
    ↓ (user is still SHOPPER)
Can retry from same page or contact support
```

### 6.3 Edge Case: Already Organizer

```
User (already ORGANIZER) visits pricing page
    ↓
Banner NOT shown (user.role === 'ORGANIZER')
    ↓
Tier cards show "Current Plan" or "Upgrade to [TIER]" (existing behavior)
    ↓
[No conversion flow triggered]
```

---

## Part 7: CTA Copy Variants

### For Pricing Page Banner

1. **Option A (Action-oriented):** "Ready to host your first sale? Become an Organizer and start selling today."
2. **Option B (Benefit-focused):** "Want to list your items for sale? Become a SIMPLE organizer for free — no fees upfront."
3. **Option C (Neutral):** "Start a sale. Choose your plan below to unlock FindA.Sale's organizer tools."

**Recommendation:** Option A — direct, action-focused, familiar language.

### For Navigation Button

- Primary: "Host a Sale"
- Alternative: "Become an Organizer" (more literal but longer)
- Alternative: "Start Selling" (action-oriented)

**Recommendation:** "Host a Sale" — brief, action-oriented, fits nav space.

### For Modal Title

- "Become an Organizer" (primary)
- "Get Started as an Organizer"
- "Create Your Organizer Profile"

**Recommendation:** "Become an Organizer" — simple, direct.

---

## Part 8: Design System Compliance

- **Colors:** Use existing amber/warm palette for CTAs (primary: `amber-600`, hover: `amber-700`).
- **Typography:** Headings use `font-heading` (serif) per existing system. Body text uses default sans-serif.
- **Icons:** If using icons in nav, follow existing pattern (e.g., SVG icons from `components/` or Heroicons).
- **Dark mode:** All new components inherit existing Tailwind dark mode classes (`dark:bg-gray-800`, etc.).
- **Spacing:** Use existing Tailwind `gap`, `px`, `py` utilities; maintain visual consistency with surrounding components.
- **Shadows:** Use `shadow-md` or `shadow-lg` for modals, consistent with existing components (see `components/SaleCard`, `Layout`).

---

## Part 9: Implementation Notes for findasale-dev

1. **Schema-first check:** Confirm `User.roles` field exists in schema as a String array. (Already exists per Feature #72 Phase 2.)
2. **Hook verification:** Verify `useAuth()` hook correctly parses `roles` array from JWT payload.
3. **Dual-role nav:** Decide between Option A (combined nav) vs. Option B (organizer-primary). Recommend Option A for consistency with "both roles, same session" design.
4. **TypeScript types:** Ensure `BecomeOrganizerModalProps` is properly typed; organize in `types/` or inline in component file.
5. **API error handling:** Wrap `/api/users/setup-organizer` calls in try-catch; log unexpected errors for support ticket triage.
6. **Token storage:** Confirm localStorage update doesn't create race condition with simultaneous API calls (e.g., if user navigates during setup).
7. **Mobile testing:** Test modal on mobile (small screens, soft keyboard); ensure button accessibility.
8. **Accessibility:** Modal should trap focus, have proper `aria-*` labels, and be dismissible via Escape key.

---

## Part 10: Metrics & Success Indicators

**Post-launch, track these in analytics:**

- **Conversion Rate:** # of users who clicked "Become an Organizer" / # of SHOPPER users who saw pricing page.
- **Completion Rate:** # of users who successfully completed setup / # who opened modal.
- **Time-to-Conversion:** Avg. time from CTA click to successful `/organizer/dashboard` redirect.
- **Error Rate:** # of failed setup attempts / # of setup attempts.
- **Dual-Role Usage:** # of users with both SHOPPER + ORGANIZER roles who list a sale within 7d.

---

## Appendix: Related Systems

- **Auth System:** `/api/auth/login`, `/api/auth/register` (establish initial role).
- **Role-Based Access:** `useOrganizerTier()` hook gating PRO/TEAMS features.
- **Organizer Profile:** `Organizer` model (one-to-one with `User`).
- **Stripe Integration:** `/api/stripe/checkout-session` (for tier upgrade, separate from this flow).
- **Toast Notifications:** `useToast()` hook for success/error messaging.

---

**END UX SPEC**
