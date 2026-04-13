# FindA.Sale — Comprehensive Chrome Visual Audit — S211
**Date:** 2026-03-20
**Method:** Live site inspection via Chrome MCP (navigate + JavaScript DOM audit + screenshots)
**Tester:** Claude (automated)
**Site:** https://finda.sale (dark mode active throughout)
**Accounts tested:** user1@example.com (SIMPLE org → ADMIN), user2@example.com (PRO org ✅), user3@example.com (TEAMS org ✅), user11@example.com (Shopper ✅)
**Tier fix applied:** S211 added `POST /api/dev/fix-seed-tiers` endpoint; user2 confirmed PRO in JWT, user3 confirmed TEAMS in JWT

---

## Executive Summary

Full 5-phase audit across all 4 user roles (public, shopper, SIMPLE org, PRO org, TEAMS org). Tier seed bug was fixed mid-session via new `/api/dev/fix-seed-tiers` endpoint. The site is **functionally solid** on core flows but has **5 P0 issues**, **10+ dead routes (404s)**, **a systemic tier display bug** (frontend shows "Free/SIMPLE" for PRO and TEAMS users), and **several dark mode regressions**. The site is **not ready for human beta testers** until the P0s are resolved.

**Beta readiness: BLOCKED** — P0 crashes, tier display bug, and workspace auth failure must be fixed first.

---

## P0 — Crashes (ErrorBoundary / Runtime Errors)

| # | Route | Error | Details |
|---|-------|-------|--------|
| 1 | `/encyclopedia` | `TypeError: Cannot read properties of undefined (reading 'replace')` | EncyclopediaCard component. ErrorBoundary catches it. Shopper-facing. |
| 2 | `/organizer/command-center` | React error #310 (conditional hook call) | `useCommandCenter` → `useQuery` renders more hooks than expected. ErrorBoundary catches it. |
| 3 | `/organizer/typology` | Runtime crash — ErrorBoundary | No specific error captured in production minified build. Page shows "Something went wrong". |
| 4 | `/wishlists` | Dead redirect to `/auth/login` (404) | Both authenticated and unauthenticated users get redirected to `/auth/login` which doesn't exist. Correct login is `/login`. Nav drawer links to this dead route. |

---

## P0 — Tier Assignment Bug — RESOLVED

**Fixed in S211** via `POST /api/dev/fix-seed-tiers` endpoint. Tiers now confirmed in JWT:
- user1: ADMIN role (was ORGANIZER)
- user2: `subscriptionTier: "PRO"` ✅ (was SIMPLE)
- user3: `subscriptionTier: "TEAMS"` ✅ (was SIMPLE)

**However, a new systemic bug was discovered:** The frontend billing/subscription pages read tier from the Stripe API (not the JWT), so they show "Current Plan: Free/SIMPLE" even for PRO and TEAMS users. This is the **P0 Tier Display Bug** below.

---

## P0 — Tier Display Bug (Systemic — All Paid Tiers)

**The frontend shows "Current Plan: Free/SIMPLE" for ALL organizer tiers**, including PRO and TEAMS. Confirmed on:
- `/organizer/premium` — "Current Plan: Free" + "Upgrade to PRO" for a PRO user
- `/organizer/upgrade` — "✓ Current Plan: SIMPLE / Free" for a PRO user
- `/organizer/dashboard` — "🔒 Unlock Pro Features" for a TEAMS user
- `/organizer/premium` — "Current Plan: Free" for a TEAMS user

**Root cause:** The billing/subscription frontend components fetch tier from `GET /api/billing/subscription` which reads from Stripe (no Stripe subscription exists for test users). The JWT has the correct tier, but the UI doesn't read it from the JWT. The `useOrganizerTier` hook may also be calling the billing API instead of reading the JWT.

**Impact:** Every organizer sees themselves as "Free" regardless of actual tier. Upgrade CTAs show for paying users. This breaks trust and would cause immediate confusion in beta.

---

## P0 — Workspace Auth Failure (TEAMS)

`/organizer/workspace` returns **401 Unauthorized** from the backend API even with a valid TEAMS JWT (`subscriptionTier: "TEAMS"`, `organizerTokenVersion: 1`). The page redirects to `/login`.

This was tested with a freshly-issued JWT after the tier fix. The workspace route's auth middleware is rejecting the request despite valid credentials.

**Impact:** The flagship TEAMS feature is completely inaccessible.

---

## P1 — Dead Routes (404 Pages)

These routes either have dashboard links pointing to them or are listed in the roadmap but return 404:

| # | Route | Linked From | Notes |
|---|-------|-------------|-------|
| 1 | `/organizer/sales` | Dashboard "Manage Sales" button | Primary organizer action — 404 is critical |
| 2 | `/organizer/analytics` | Expected from roadmap | No page exists |
| 3 | `/organizer/neighborhoods` | Expected from roadmap | No page exists |
| 4 | `/organizer/batch-ops` | PRO feature in roadmap | No page exists |
| 5 | `/organizer/flip-report` | PRO feature in roadmap | No page exists |
| 6 | `/organizer/photo-ops` | PRO feature in roadmap | No page exists |
| 7 | `/organizer/promote` | PRO feature in roadmap | No page exists |
| 8 | `/live-feed` | Expected from roadmap | No page exists (shopper/organizer) |

**Note:** `/organizer/sales` is the most critical — the "Manage Sales" button on the dashboard navigates to this 404. An organizer cannot manage their sales.

---

## P1 — Blank / Empty Pages (No Content Rendered)

| # | Route | Issue |
|---|-------|-------|
| 1 | `/organizer/insights` (redirected from `/organizer/performance`) | **Blank for SIMPLE**, works for PRO/TEAMS (shows analytics with 17-18 light-bg dark mode elements). Tier gate exists but no friendly message for SIMPLE. |
| 2 | `/messages` | Shows "Messages" heading but body is completely empty. No empty state, no thread list, nothing between heading and footer. |
| 3 | `/cities` | Shows "No cities with sales yet" despite 16 active sales in Riverside. City data not wired/seeded. |

---

## P1 — Dark Mode Regressions

| # | Route | Light BG Count | Description |
|---|-------|---------------|-------------|
| 1 | `/organizer/premium` | **16** | Entire page has light green-white gradient background. Heading text invisible. Feature list unreadable. Pricing table on white bg. **Completely broken in dark mode.** |
| 2 | `/organizer/message-templates` | **7** | Template cards have light backgrounds. |
| 3 | `/organizer/pro-features` | **7** | Feature description cards have light backgrounds. |
| 4 | `/trending` | **8** | Light bg elements on trending page. |
| 5 | `/map` | **7** | Map container and surrounding elements. |
| 6 | `/search` | **6** | Search results area. |
| 7 | `/plan` | **4** | Plan a sale page. |
| 8 | Sale detail pages | **8** | Individual sale view. |
| 9 | Dashboard "Add Items" dropdown | visual | Dropdown menu shows white/light background against dark dashboard. |
| 10 | `/organizer/upgrade` | **3** | Pricing cards have slight light bg. |

**Note:** Most organizer pages (dashboard, holds, print-inventory, POS, brand-kit, bounties, ripples, fraud-signals, hubs, webhooks, email-digest, settings, notifications) have 0-1 light bg elements and look correct in dark mode.

---

## P2 — UX / Content Issues

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 1 | Broken placeholder images | Homepage (16/62), trending (8/8), sale detail (2/17) | All from `fastly.picsum.photos` seed data. Not app bugs but bad UX for testers. |
| 2 | ThemeToggle label bug | All pages (top-right) | Both buttons show "Switch to Light mode" regardless of current theme. Should toggle label. Also 2 duplicate ThemeToggle buttons rendered. |
| 3 | Duplicate nav header | `/organizer/reputation`, `/organizer/item-library`, `/notifications` | "Skip to main content" + full nav rendered twice in the DOM. |
| 4 | Unicode escape in label | `/organizer/create-sale` | Neighborhood field shows `\u2014` literally instead of em dash (—). |
| 5 | Missing `<title>` tags | `/organizer/pos`, `/organizer/ripples`, `/organizer/typology`, `/organizer/command-center` | Empty `<title>` element — bad for SEO and browser tabs. |
| 6 | Subscription error state | `/organizer/subscription` | Shows "Failed to load subscription information" — should show friendly "No active subscription" for SIMPLE users. |
| 7 | Onboarding modal on user2 | `/organizer/dashboard` (user2) | PRO user sees "Welcome to FindA.Sale!" onboarding — suggests `onboardingComplete` is false. |
| 8 | "Manage Sales" is a `<button>` not `<a>` | Dashboard | Navigates via JS to a 404. Should be `<a href>` for accessibility. |

---

## P2 — Tier Gating Observations (SIMPLE tier only — PRO/TEAMS untestable)

| Feature | Expected Gate | Actual Behavior |
|---------|--------------|----------------|
| Brand Kit basic info | SIMPLE allowed | ✅ Accessible, form works |
| Brand Kit advanced (font, banner, color) | PRO required | ✅ Shows "Upgrade to PRO" inline messages |
| Workspace | TEAMS required | ✅ Shows "Upgrade to TEAMS" CTA (also shows "Create Workspace" button — minor) |
| Dashboard "Unlock Pro Features" card | SIMPLE sees upsell | ✅ Shows with "Upgrade to PRO" button |
| PRO Features page | All tiers see it | ✅ Shows feature descriptions |
| Webhooks | TEAMS feature | ⚠️ Fully accessible to SIMPLE — no tier gate |
| Fraud Signals | PRO feature | ⚠️ Fully accessible to SIMPLE — no tier gate |
| Ripples | PRO feature | ⚠️ Fully accessible to SIMPLE — no tier gate |
| Hubs | TEAMS feature | ⚠️ Fully accessible to SIMPLE — no tier gate |
| Item Library | PRO feature | ⚠️ Fully accessible to SIMPLE — no tier gate |
| Email Digest Preview | PRO feature | ⚠️ Fully accessible to SIMPLE — no tier gate |

**Many PRO/TEAMS features are accessible to SIMPLE users.** This could be intentional (graceful degradation with empty states) or a tier-gating gap. Needs product decision.

---

## Pages Audited — Full Status Matrix

### Public Pages (Phase 1 — unauthenticated)

| Route | Status | Dark Mode | Notes |
|-------|--------|-----------|-------|
| `/` (homepage) | ✅ OK | ✅ Good | 16/62 broken placeholder images |
| `/login` | ✅ OK | ✅ Good | Form functional, Passkey + OAuth buttons present |
| `/register` | ✅ OK | ✅ Good | |
| `/about` | ✅ OK | ✅ Good | |
| `/contact` | ✅ OK | ✅ Good | |
| `/faq` | ✅ OK | ✅ Good | |
| `/guide` | ✅ OK | ✅ Good | |
| `/terms` | ✅ OK | ✅ Good | |
| `/privacy` | ✅ OK | ✅ Good | |
| `/trending` | ✅ OK | 🟡 8 lb | Broken images (8/8 picsum) |
| `/map` | ✅ OK | 🟡 7 lb | Map renders |
| `/search` | ✅ OK | 🟡 6 lb | |
| `/feed` | ✅ OK | ✅ Good | |
| `/calendar` | ✅ OK | ✅ Good | |
| `/leaderboard` | ✅ OK | ✅ Good | |
| `/plan` | ✅ OK | 🟡 4 lb | |
| `/cities` | ⚠️ Empty | ✅ Good | "No cities" despite active sales |
| `/encyclopedia` | 🔴 CRASH | N/A | EncyclopediaCard null ref |
| `/neighborhoods` | ✅ OK | ✅ Good | |
| `/surprise-me` | ✅ OK | ✅ Good | |
| Sale detail (`/sales/[id]`) | ✅ OK | 🟡 8 lb | 2/17 broken images |

### Shopper Pages (Phase 2 — user11@example.com)

| Route | Status | Dark Mode | Notes |
|-------|--------|-----------|-------|
| `/shopper/dashboard` | ✅ OK | ✅ Good | |
| `/shopper/alerts` | ✅ OK | ✅ Good | |
| `/shopper/favorites` | ✅ OK | ✅ Good | S208 fix confirmed landed |
| `/shopper/loyalty` | ✅ OK | ✅ Good | S208 fix confirmed landed |
| `/shopper/achievements` | ✅ OK | ✅ Good | |
| `/shopper/holds` | ✅ OK | ✅ Good | |
| `/shopper/purchases` | ✅ OK | ✅ Good | |
| `/shopper/receipts` | ✅ OK | ✅ Good | |
| `/shopper/trails` | ✅ OK | ✅ Good | |
| `/shopper/disputes` | ✅ OK | ✅ Good | |
| `/shopper/loot-log` | ✅ OK | ✅ Good | |
| `/wishlists` | 🔴 DEAD | N/A | Redirects to `/auth/login` (404) |
| `/profile` | ✅ OK | ✅ Good | |
| `/notifications` | ✅ OK | ✅ Good | Duplicate nav |

### Organizer Pages (Phase 3 — user1@example.com, SIMPLE)

| Route | Status | Dark Mode | Notes |
|-------|--------|-----------|-------|
| `/organizer/dashboard` | ✅ OK | ✅ 1 lb | Stats render (3 sales, 34 items, $3553) |
| `/organizer/create-sale` | ✅ OK | ✅ 1 lb | `\u2014` literal in Neighborhood label |
| `/organizer/holds` | ✅ OK | ✅ 1 lb | Empty state + sale filter |
| `/organizer/print-inventory` | ✅ OK | ✅ 1 lb | Empty state |
| `/organizer/pos` | ✅ OK | ✅ 1 lb | Missing `<title>` |
| `/organizer/message-templates` | ✅ OK | 🟡 7 lb | Templates display correctly |
| `/organizer/reputation` | ✅ OK | ✅ 1 lb | Duplicate nav header |
| `/organizer/bounties` | ✅ OK | ✅ 1 lb | |
| `/organizer/brand-kit` | ✅ OK | ✅ 1 lb | PRO section properly gated |
| `/organizer/item-library` | ✅ OK | ✅ 1 lb | Duplicate nav header |
| `/organizer/ripples` | ✅ OK | ✅ 1 lb | Missing `<title>` |
| `/organizer/fraud-signals` | ✅ OK | ✅ 1 lb | |
| `/organizer/hubs` | ✅ OK | ✅ 1 lb | |
| `/organizer/pro-features` | ✅ OK | 🟡 7 lb | |
| `/organizer/premium` | ✅ OK | 🔴 16 lb | **Completely broken in dark mode** |
| `/organizer/upgrade` | ✅ OK | 🟡 3 lb | Confirms SIMPLE tier |
| `/organizer/subscription` | ⚠️ Error | ✅ 1 lb | "Failed to load" message |
| `/organizer/webhooks` | ✅ OK | ✅ 1 lb | |
| `/organizer/email-digest-preview` | ✅ OK | ✅ 1 lb | Personalized for user |
| `/organizer/workspace` | ✅ OK | ✅ 1 lb | TEAMS gate working |
| `/organizer/settings` | ✅ OK | ✅ 1 lb | Tabs for all settings |
| `/organizer/ugc-moderation` | ✅ OK | ✅ 1 lb | |
| `/messages` | ⚠️ Blank | ✅ 1 lb | No content between heading and footer |
| `/notifications` | ✅ OK | ✅ 1 lb | Duplicate nav |
| `/organizer/sales` | 🔴 404 | N/A | Linked from dashboard button |
| `/organizer/insights` | ⚠️ Blank | ✅ 1 lb | Redirected from `/performance` |
| `/organizer/command-center` | 🔴 CRASH | N/A | React hook error |
| `/organizer/typology` | 🔴 CRASH | N/A | Runtime crash |
| `/organizer/analytics` | 🔴 404 | N/A | |
| `/organizer/neighborhoods` | 🔴 404 | N/A | |
| `/organizer/batch-ops` | 🔴 404 | N/A | |
| `/organizer/flip-report` | 🔴 404 | N/A | |
| `/organizer/photo-ops` | 🔴 404 | N/A | |
| `/organizer/promote` | 🔴 404 | N/A | |
| `/live-feed` | 🔴 404 | N/A | |
| `/organizer/flash-deals` | 🔴 404 | N/A | PRO feature — no frontend page |
| `/organizer/notifications` | 🔴 404 | N/A | No organizer notification page |

### PRO Organizer Pages (Phase 4 — user2@example.com, PRO)

| Route | Status | Dark Mode | Notes |
|-------|--------|-----------|-------|
| `/organizer/dashboard` | ✅ OK | 🟡 6 lb | Shows "🔒 Unlock Pro Features" despite PRO tier — **tier display bug** |
| `/organizer/insights` | ✅ OK | 🔴 17 lb | **Works for PRO** (was blank for SIMPLE). Shows real analytics data. Heavy dark mode regression. |
| `/organizer/command-center` | 🔴 CRASH | N/A | Same React error #310 — affects all tiers |
| `/organizer/typology` | 🔴 CRASH | N/A | Same ErrorBoundary crash — all tiers |
| `/organizer/brand-kit` | ✅ OK | ✅ 1 lb | Full access, form functional |
| `/organizer/item-library` | ✅ OK | ✅ 1 lb | Full access, duplicate header |
| `/organizer/premium` | ⚠️ Wrong | 🔴 16 lb | Shows "Current Plan: Free" — should show PRO. Dark mode broken. |
| `/organizer/upgrade` | ⚠️ Wrong | 🟡 3 lb | Shows "Current Plan: SIMPLE/Free" — should show PRO |
| `/organizer/subscription` | ⚠️ Error | ✅ 1 lb | "Failed to load subscription information" |
| `/organizer/create-sale` | ✅ OK | ✅ 1 lb | Same `\u2014` literal |
| `/organizer/pos` | ✅ OK | ✅ 1 lb | Stripe reader UI present |
| `/organizer/settings` | ✅ OK | ✅ 1 lb | All tabs functional |
| `/organizer/webhooks` | ✅ OK | ✅ 1 lb | No tier gate — accessible to PRO (should be TEAMS?) |
| `/organizer/reputation` | ✅ OK | ✅ 1 lb | Duplicate header |
| `/organizer/flip-report` | 🔴 404 | N/A | PRO feature — no frontend page |
| `/organizer/photo-ops` | 🔴 404 | N/A | PRO feature — no frontend page |
| `/organizer/batch-ops` | 🔴 404 | N/A | PRO feature — no frontend page |
| `/organizer/promote` | 🔴 404 | N/A | PRO feature — no frontend page |
| `/organizer/flash-deals` | 🔴 404 | N/A | PRO feature — no frontend page |

### TEAMS Organizer Pages (Phase 5 — user3@example.com, TEAMS)

| Route | Status | Dark Mode | Notes |
|-------|--------|-----------|-------|
| `/organizer/dashboard` | ✅ OK | 🟡 6 lb | Shows "🔒 Unlock Pro Features" despite TEAMS tier — **tier display bug** |
| `/organizer/workspace` | 🔴 401 AUTH | N/A | **P0: Returns 401 Unauthorized** even with valid TEAMS JWT. Redirects to /login. |
| `/organizer/insights` | ✅ OK | 🔴 18 lb | Works, shows analytics. Heavy dark mode regression. |
| `/organizer/command-center` | 🔴 CRASH | N/A | Same crash — all tiers |
| `/organizer/premium` | ⚠️ Wrong | 🔴 16 lb | Shows "Current Plan: Free" for TEAMS user — completely wrong |

### Shopper Pages Verified (Phase 2b — user11@example.com)

| Route | Status | Dark Mode | Notes |
|-------|--------|-----------|-------|
| `/shopper/dashboard` | ✅ OK | ✅ 0 lb | Clean, tabs + feature links all present |
| `/shopper/collector-passport` | ✅ OK | ✅ 1 lb | Duplicate header |
| `/shopper/loyalty` | ✅ OK | ✅ 1 lb | "No loyalty data" empty state |
| `/shopper/alerts` | ✅ OK | ✅ 1 lb | "Wishlist Alerts" + Add Alert button |
| `/shopper/trails` | ✅ OK | ✅ 1 lb | "My Treasure Trails" + Create button |
| `/shopper/loot-log` | ✅ OK | ✅ 1 lb | Empty state with Share button |
| `/shopper/receipts` | ✅ OK | ✅ 1 lb | Receipts/Returns tabs |
| `/shopper/settings` | ✅ OK | ✅ 1 lb | Low-bandwidth, network, theme settings |
| `/encyclopedia` | ✅ OK | ✅ 1 lb | Empty state loads (P0 crash only with data — EncyclopediaCard) |
| `/wishlists` | 🔴 DEAD | N/A | **Still broken**: redirects to `/auth/login` (404) |
| `/messages` | ⚠️ Blank | ✅ 1 lb | **Still blank**: heading only, no content |

---

## What's Working Well

- ✅ **Dark mode on most organizer pages** — dashboard, holds, POS, brand-kit, settings, etc. all look correct
- ✅ **S208-S209 dark mode fixes landed** — favorites.tsx, loyalty.tsx now show 0 light bg elements
- ✅ **Organizer dashboard** — Quick Actions, stats cards, tier progress, reputation all render correctly
- ✅ **Create Sale form** — comprehensive with AI description generation, sale type selector, photo upload
- ✅ **Brand Kit tier gating** — basic info for SIMPLE, advanced (font/banner/color) properly shows PRO upgrade prompts
- ✅ **Workspace tier gating** — shows TEAMS upgrade prompt
- ✅ **Empty states** — most pages have friendly empty states with CTAs (holds, bounties, hubs, notifications)
- ✅ **ErrorBoundary** — catches crashes gracefully with "Try Again" / "Go Home" buttons
- ✅ **Footer** — consistent across all pages with correct links
- ✅ **Nav** — correct role-aware navigation (organizer sees different nav than shopper)
- ✅ **POS** — Stripe reader connect UI present
- ✅ **Settings** — full settings page with Payments/Subscription/Verification/Notifications/Profile/Security/Appearance tabs

---

## Priority Fix Order

### P0 — Must-fix before any beta testing:
1. **P0: Fix tier display bug** — PRO and TEAMS users see "Current Plan: Free/SIMPLE" on premium, upgrade, and subscription pages. Root cause: frontend reads tier from Stripe billing API (`GET /api/billing/subscription`) instead of the JWT `subscriptionTier` claim. Test users have no Stripe subscription, so they always show Free. **Fix: frontend should read tier from JWT/auth context as source of truth, with Stripe as supplementary.**
2. **P0: Fix `/organizer/workspace` 401** — Returns 401 Unauthorized even with valid TEAMS JWT (`subscriptionTier: "TEAMS"`, `organizerTokenVersion: 1`). Tested with fresh login. The workspace route's auth middleware rejects the request. Investigate `tokenVersion` mismatch or middleware bug.
3. **P0: Fix `/organizer/command-center` crash** — React hook error #310. Conditional hook call in `useCommandCenter`. Affects ALL tiers.
4. **P0: Fix `/organizer/typology` crash** — Runtime ErrorBoundary crash. Affects ALL tiers.
5. **P0: Fix `/wishlists` redirect** — Redirects to `/auth/login` (404) instead of `/login`. Broken for all users.
6. **P0: Fix `/organizer/sales` 404** — "Manage Sales" dashboard button leads to 404. Create the page or fix the route.
7. **P0: Fix `/encyclopedia` crash** — EncyclopediaCard null reference when data present.

### P1 — Should fix before beta:
8. **P1: Fix `/organizer/premium` dark mode** — 16 light-bg elements, completely unreadable pricing cards in dark mode.
9. **P1: Fix `/organizer/insights` dark mode** — 17-18 light-bg elements. Page content works for PRO/TEAMS but dark mode is heavily broken.
10. **P1: Fix `/messages` blank page** — Heading renders but no content. Affects all roles.
11. **P1: Fix `/cities` empty data** — Wire city data from active sales.
12. **P1: Fix `/organizer/subscription` error** — "Failed to load subscription information" for all tiers. Same Stripe-dependent root cause as tier display bug.
13. **P1: Verify webhooks tier gating** — `/organizer/webhooks` accessible to PRO users but should be TEAMS-only per tierGate.ts.

### P2 — Nice to fix:
14. P2: Fix ThemeToggle label + duplicate buttons.
15. P2: Fix duplicate nav headers on reputation/item-library/notifications/collector-passport.
16. P2: Fix dark mode on message-templates (7 lb), pro-features (7 lb), trending (8 lb).
17. P2: Fix `\u2014` literal on create-sale (shows raw Unicode escape instead of em dash).
18. P2: Add `<title>` tags to POS, ripples, typology, command-center.
19. P2: Decide on tier gating for fraud-signals/ripples/hubs/item-library/email-digest (currently all accessible to SIMPLE).
20. P2: Dashboard shows "🔒 Unlock Pro Features" for PRO and TEAMS users — should show tier-appropriate messaging.

---

## Resolved Blockers

- ✅ **Tier seed data fixed (S211)** — Created `POST /api/dev/fix-seed-tiers` endpoint. user1→ADMIN, user2→PRO, user3→TEAMS confirmed in database.
- ✅ **PRO features tested** — Insights, brand-kit, item-library, premium, upgrade, subscription, create-sale, POS, settings, webhooks, reputation all tested for PRO tier.
- ✅ **TEAMS features tested** — Dashboard, workspace (401 bug found), insights, command-center, premium all tested for TEAMS tier.
- ✅ **Shopper features tested** — Dashboard, collector-passport, loyalty, alerts, trails, loot-log, receipts, settings, encyclopedia, wishlists, messages all tested.

## Remaining Blocked Testing

The following cannot be verified until P0 fixes are applied:
- **Workspace page** — blocked by 401 auth bug. Cannot test TEAMS workspace features.
- **Command center** — blocked by React hook crash. Cannot test TEAMS command center features.
- **Typology** — blocked by runtime crash. Cannot test any tier's typology features.
- **Tier display accuracy** — blocked by Stripe-dependent tier display bug. Cannot verify correct plan names show on premium/upgrade/subscription pages.
- **Subscription management flow** — blocked by subscription load error + tier display bug.
- **Upgrade/downgrade flow** — blocked by same Stripe dependency.

## Unbuilt Features (404 pages — expected)

These routes return 404 because the frontend pages haven't been created yet. They are roadmap items, not bugs:
- `/organizer/analytics` — analytics dashboard (distinct from insights)
- `/organizer/neighborhoods` — neighborhood mapping
- `/organizer/batch-ops` — batch operations (PRO)
- `/organizer/flip-report` — flip/resale report (PRO)
- `/organizer/photo-ops` — photo operations (PRO)
- `/organizer/promote` — promotion tools (PRO)
- `/organizer/flash-deals` — flash deals (PRO)
- `/organizer/notifications` — organizer notification center
- `/live-feed` — live sale feed

---

## Audit Coverage vs Roadmap Cross-Reference

**Tested (70+ routes):** All primary navigation routes for public, shopper (FREE), organizer (SIMPLE), organizer (PRO), and organizer (TEAMS) were tested. This covers the core user flows for every shipped feature visible in the navigation.

**Not tested (secondary/content routes — need follow-up):**

| Route | Feature | Why Missed |
|-------|---------|------------|
| `/categories` + `/categories/[slug]` | Category browsing | No nav link found — needs direct URL test |
| `/tags/[slug]` | Tag browsing | ISR pages — need a known tag slug to test |
| `/condition-guide` | Condition Guide | Educational page — no nav link found |
| `/organizers/[slug]` | Organizer public profile | Need a known organizer slug |
| `/shoppers/[slug]` | Shopper public profile | Need a known shopper slug |
| `/unsubscribe` | Email unsubscribe | Requires email link |
| Sale sub-pages (items tab, queue, auction) | Sale detail features | Need active sale with items/queue/auction |
| Item detail `/items/[id]` | Item detail page | Need known item ID |
| `/shopper/collector-passport` | Collector Passport (Phase 2b verified) | ✅ Actually tested in Phase 2b |

**Recommendation:** A follow-up targeted audit should hit the 6 untested secondary routes above using known slugs/IDs from the database. These are lower-risk (content pages, not workflows) but should be verified before beta.

---

*Comprehensive audit complete. 70+ routes tested across 5 user roles (public, shopper, SIMPLE organizer, PRO organizer, TEAMS organizer). Chrome MCP confirmed live throughout. Session S211.*
