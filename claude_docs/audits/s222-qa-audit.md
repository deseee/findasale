# S222 Full QA Audit — 4-Role Manual Test
*Date: 2026-03-21*
*Tester: Claude (Chrome MCP, acting as human auditor)*
*Accounts: Oscar/PRO, Nina/SIMPLE+ADMIN, Quincy/TEAMS, Ian/Shopper*

## Fixes Verified (Deployed)
- Leaderboard: no longer crashes (badges optional chaining) — 20 shoppers render
- Rate limit: navigated 10+ pages without 429 (was hitting at ~14 before)
- POS: shows 2 published sales in dropdown (was showing "No active sales")

## Bugs Found

### P0 — Critical (blocks core user flows)

**BUG #22: Role guard blocks ADMIN users from ALL organizer pages**
- 40+ instances of `user.role !== 'ORGANIZER'` across frontend
- user1 (Nina, ADMIN role) has `roles: ["USER","ORGANIZER","ADMIN"]` but `role: "ADMIN"`
- Every organizer page rejects her — dashboard, sales, insights, everything
- Login redirect also broken: `role === 'ORGANIZER'` check sends ADMIN users to `/` instead of organizer dashboard
- Fix: replace all `user.role !== 'ORGANIZER'` with `!user.roles?.includes('ORGANIZER')` (or equivalent)
- Scope: ~40 files, systemic

### P1 — High (data integrity / broken features)

**BUG #20: Leaderboard sort order is wrong**
- Frank has 750 points but ranked #10; Miles has 0 points but ranked #2
- Organizer tab also mis-sorted: #2 has 0 sales, #7 has 1 sale
- Root cause: backend leaderboardController sort logic (S221 removed `nulls: 'last'` and replaced with JS sort — the JS sort may be wrong or not applied)

**BUG #25: Sale detail page "Items for Sale" always shows empty**
- Tested on 2 different sales (Lakefront Estate 13, Lakefront Estate 2)
- Both show "No items listed for this sale yet" despite Live Activity showing purchases
- Oscar's Insights confirms 38 items exist across his sales
- Search also returns "Items (0)" for "vintage" despite 5 vintage items in DB
- Root cause: items API endpoint may not be returning items for the sale, or frontend query mismatch

**BUG #30: Follow button sends CORS preflight but POST never fires**
- Clicked "+ Follow" on sale detail as shopper — only OPTIONS 204, no POST
- Button text stays "+ Follow" with no feedback
- Possible cause: CSRF token missing (S222 added CSRF for POST/PUT/PATCH/DELETE), or click handler bug

### P2 — Medium (UX problems / incorrect data display)

**BUG #3: Dashboard "Active Sales" counts DRAFT sales**
- Dashboard shows "3 Active Sales" but only 2 are PUBLISHED (1 is DRAFT)
- Insights page correctly shows "ACTIVE SALES: 2"
- Fix: filter query to only count PUBLISHED status

**BUG #7: "How It Works" section shows on dashboard for all users**
- Shows for Oscar (onboardingComplete likely true) and Quincy (onboardingComplete false)
- Should only show for users who haven't completed onboarding
- Root cause: orgProfile null check — shows section when orgProfile is null (API failure) instead of only when !orgProfile.onboardingComplete

**BUG #13: Inspiration page "No items found yet"**
- ISR `getStaticProps` calls `api.get('/items/inspiration?limit=48')` at build time
- If backend unreachable during Vercel build, returns empty array
- Page revalidates every 5min but keeps failing if backend URL unreachable from Vercel build servers
- Fix: consider client-side fallback fetch, or verify NEXT_PUBLIC_API_URL reachable from Vercel

**BUG #15: Reputation page crashes to error boundary**
- Navigating to `/organizer/reputation` as Oscar crashes with error boundary
- S221 fix (route mount + organizer ID) may not have fully resolved it
- Likely null-safety issue accessing `reputation.score` without guard

**BUG #23: Subscription page shows "managed externally" for TEAMS user**
- Quincy (TEAMS tier) sees "Subscription managed externally or not yet configured"
- Should display current tier from JWT even without active Stripe subscription
- Confusing for users who were manually assigned a tier

**BUG #26: No favorite/save button on sale detail page**
- Shopper dashboard has Favorites tab saying "Tap the heart on any item"
- But sale detail page has no heart/favorite/save button anywhere
- Shoppers cannot save sales they want to return to

**BUG #27: Three unlabeled "0" counters at top of sale detail page**
- Sale detail shows "0 0 0" at top with no labels
- Likely views/favorites/shares counters but completely unlabeled

**BUG #28: Hunt Pass banner + PWA install prompt overlap**
- Orange "Unlock Hunt Pass" bar at bottom + "Add to home screen" banner stack
- Both persistent, covering page content
- Hunt Pass bar needs dismissible localStorage flag

**BUG #29: No "Message Organizer" button on sale detail page**
- Messages empty state says "Browse sales and tap 'Message Organizer'"
- But sale detail page has no such button
- Messaging feature is unreachable for shoppers

### P3 — Low (edge cases / cosmetic)

**BUG #6: No 429 error messaging in UI**
- 429 interceptor added to api.ts but no toast/notification component renders it
- User sees page failures with no explanation when rate limited

**BUG #8: Sales tab shows "Create Your First Sale" on API failure**
- Should show error state, not empty state, when API returns error

**BUG #19: Sale detail shows "Sale not found" on 429**
- Rate limit causes 429 → treated as "not found" instead of "temporarily unavailable"

**BUG #24: Login stalls waiting on geolocation permission**
- Login form submission appears to block until browser geolocation dialog is resolved
- Patrick confirmed login only went through after clicking Chrome location popup
- Login should never depend on location permission

## Pages Tested (Summary)

| Page | PRO | TEAMS | SIMPLE/ADMIN | Shopper |
|------|-----|-------|-------------|---------|
| Login | ✅ | ✅ | ✅ | ✅ |
| Dashboard | ✅ (data issues) | ✅ (onboarding modal) | ❌ BUG#22 | N/A |
| Sales list | ✅ | Not tested | ❌ BUG#22 | N/A |
| Create Sale | ✅ form loads | Not tested | ❌ BUG#22 | N/A |
| Insights | ✅ real data | ✅ real data | ❌ BUG#22 | N/A |
| POS | ✅ fixed | Not tested | ❌ BUG#22 | N/A |
| Reputation | ❌ crash | Not tested | ❌ BUG#22 | N/A |
| Webhooks | N/A (PRO) | ✅ loads | ❌ BUG#22 | N/A |
| Subscription | Not tested | ❌ BUG#23 | ❌ BUG#22 | N/A |
| Leaderboard | ✅ loads (sort wrong) | — | — | ✅ |
| Home | — | — | — | ✅ rich content |
| Sale detail | — | — | — | ❌ no items, no fav, no msg |
| Search | — | — | — | ✅ (0 items though) |
| Shopper dash | — | — | — | ✅ works |
| Loyalty | — | — | — | ✅ works |
| Messages | ✅ empty | — | — | ✅ empty |
| Inspiration | ❌ empty | — | — | ❌ empty |

## Priority Fix Order
1. **BUG #22** (P0) — unblocks ADMIN + future dual-role users. ~40 file edits, mostly search-replace.
2. **BUG #25** (P1) — sale detail items empty breaks the core shopper experience.
3. **BUG #20** (P1) — leaderboard sort is visibly wrong, embarrassing for beta.
4. **BUG #30** (P1) — follow button broken, basic engagement feature.
5. **BUG #15** (P2) — reputation crash, organizer-facing.
6. Remaining P2/P3 in order of user-facing impact.
