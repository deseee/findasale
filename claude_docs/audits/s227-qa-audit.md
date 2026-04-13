# S227 Full QA Audit — 4-Role Deep Functional Test
*Date: 2026-03-21*
*Tester: Claude (Chrome MCP, acting as human auditor)*
*Accounts: Oscar/PRO (user2), Nina/SIMPLE+ADMIN (user1), Quincy/TEAMS (user3), Ian/Shopper (user11)*
*Method: Live browser automation with XHR/fetch interception + direct backend API calls with extracted JWTs*

---

## Summary

This session completed the deep functional audit begun in S222 and continued in S227. Key focus: cross-role interaction round-trips, real data flows, and BUG #22 backend verification. Four bugs from S222 are confirmed fixed; four remain broken; five new bugs identified.

**Beta readiness: NOT READY** — BUG #22 backend blocks ADMIN organizer data on every page. BUG #30 means the Follow feature is completely dead. BUG #31/#32 means Favorites is visually broken and the toggle logic is wrong.

---

## S222 Bug Status Updates

### ✅ FIXED Since S222

**BUG #25 — Sale detail "Items for Sale" always empty**
Items now load correctly. "Eastside Collector's Estate Sale 12" shows 13 items on the detail page. Verified with live data.

**BUG #29 — No "Message Organizer" button**
Button now present in the "Organized by" section. Opens a compose modal correctly. Cross-role round-trip confirmed: Ian sent a message → Oscar's inbox shows it with unread badge "1", correct preview and timestamp. ✅

**BUG #22 (frontend) — Role guard blocks ADMIN from all organizer pages**
Frontend guard updated. Nina (role: ADMIN) can now navigate to dashboard, sales, insights, webhooks pages without redirect. ✅

**BUG #20 (shopper side) — Leaderboard sort order wrong**
Shopper leaderboard now correctly sorted descending: 1200 → 750 → 325 → 320 → 150. ✅

---

### ❌ STILL BROKEN

**BUG #22 (backend) — `requireOrganizer` middleware rejects ADMIN users** — P0
- Nina's JWT: `role: "ADMIN"`, `roles: ["USER", "ORGANIZER", "ADMIN"]`
- `GET /api/organizers/me` → **403** "Organizer access required."
- `POST /api/organizers/me/onboarding-complete` → **403** "Organizer access required."
- UI result: Manage Sales page renders but shows **"Unable to load sales. Please try again."** error state. Onboarding modal loops infinitely because the complete endpoint 403s.
- Root cause: backend `requireOrganizer` middleware still checks `req.user.role === 'ORGANIZER'` (singular). Nina's primary `role` field is `"ADMIN"`, not `"ORGANIZER"`, even though `roles` array includes `"ORGANIZER"`.
- Fix: Change middleware to check `req.user.roles?.includes('ORGANIZER')` OR `req.user.role === 'ORGANIZER'`.

**BUG #20 (organizer side) — Top Organizers leaderboard sort still wrong** — P1
- Organizer leaderboard #2 has 0 active sales, while #7 has 1 sale.
- Sort logic for organizers is not applying correctly (JS sort without `nulls: 'last'` producing wrong order).

**BUG #30 — Follow button fires zero network requests** — P1
- Clicked "+ Follow Riverside Liquidators 2" button as Ian (authenticated shopper).
- XHR interceptor captured: 13 requests (all GET). Fetch patch captured: 0 requests.
- Button text did not change. No toast, no feedback. No state update.
- Root cause: onClick handler is either missing, not wired, or throwing a silent error before the API call.
- Note: Button is visible and clickable; `find` tool resolves it by ref. The click registers (no "missed" click). The handler simply does nothing network-visible.

**BUG #15 — Reputation page crashes to error boundary** — P2
- Not re-verified this session, but S222 confirmed crash. S221 fix incomplete.

---

## New Bugs Found in S227

### P1

**BUG #31 — Heart icon never fills red regardless of toggle state**
- Heart button present on sale detail items (progress from S222).
- Aria-label DOES toggle correctly: "Add to favorites" → "Remove from favorites" on click, confirming React state updates.
- SVG `fill` attribute stays `none` on both states — user receives zero visual confirmation of a successful favorite.
- Impact: shoppers cannot tell if an item is favorited.

**BUG #32 — Favorite toggle API always returns "Item removed from favorites"**
- XHR interceptor on favorite button click: POST fires, returns HTTP 200, body: `{"message":"Item removed from favorites"}`.
- This fires on the FIRST click (adding, not removing). The response message is always "removed."
- `/shopper/favorites` page consistently shows 0 items regardless of how many hearts are clicked.
- Root cause: either toggle logic always removes, or the message string is hardcoded wrong, or the `isFavorited` check is inverted.
- Impact: Favorites feature non-functional end-to-end for shoppers.

### P2

**BUG #33 — Onboarding tour fires on every fresh login, Skip doesn't persist**
- Reproduced 3 times across different sessions: modal fires on first button interaction after fresh login.
- Skip button dismisses the modal visually but does not reliably set `findasale_onboarded` localStorage flag.
- On fresh login (or when localStorage is cleared), the modal intercepts the FIRST button click on the page — blocking purchase flow, Follow, and other actions before the user can dismiss it.
- Impact: every first-visit user gets the tour hijacked on their first action.

**BUG #34 — Unlabeled "0" counter below organizer name on sale detail**
- Below "Riverside Liquidators 2" in the "Organized by" section: a bare `0` with no label.
- No icon, no text ("followers", "following", etc.).
- Confirmed as followers count (counter field visible in ripples summary API response).

**BUG #35 — Organizer messages page title reads "Shopper Messages"**
- Logged in as Oscar (PRO organizer), navigated to messages page.
- Page heading: "Shopper Messages" — incorrect for organizer view.
- Should read "Organizer Messages" or just "Messages."

### P3

**BUG #36 — Sale counters at top of detail page still unlabeled (0 0 0)**
- Three counters appear below the sale title with no labels: `👁 0  🔗 0  📷 0` (estimated from icon positions).
- S222 flagged as BUG #27. Still present.
- Confirmed as views / shares / saves from ripples summary API: `{"views":0,"shares":0,"saves":0,"bids":0}`.

---

## Cross-Role Interaction Matrix

| Flow | Result |
|------|--------|
| Ian sends message → Oscar sees in inbox | ✅ Works. Unread badge "1", correct preview. |
| Ian clicks heart → item appears in /shopper/favorites | ❌ BUG #32. API fires but favorites page stays empty. |
| Ian clicks Follow → organizer follow count increments | ❌ BUG #30. No API call fires at all. |
| Ian clicks Buy Now → purchase flow | ✅ Modal opens, Stripe Connect check fires. Expected "not configured" on test data. |
| Nina (ADMIN) loads organizer sales list | ❌ BUG #22 backend. 403 → "Unable to load sales." |
| Nina (ADMIN) completes onboarding | ❌ BUG #22 backend. 403 on POST → onboarding loops forever. |

---

## Backend API Verification (Direct JWT Test — Nina)

| Endpoint | Method | Status | Response |
|----------|--------|--------|----------|
| `/api/organizers/me` | GET | **403** | "Organizer access required." |
| `/api/organizers/me/onboarding-complete` | POST | **403** | "Organizer access required." |
| `/api/organizers/me/sales` | GET | 404 | Route not found (path may differ) |
| `/api/organizers/me/insights` | GET | 404 | Route not found (path may differ) |

Nina's JWT payload confirmed: `role: "ADMIN"`, `roles: ["USER","ORGANIZER","ADMIN"]`, `subscriptionTier: "SIMPLE"`.

---

## Priority Fix Order

1. **BUG #22 backend** (P0) — one-line middleware fix, unblocks ADMIN users completely.
2. **BUG #32** (P1) — favorite toggle logic inverted, favorites non-functional.
3. **BUG #31** (P1) — heart SVG fill state, cosmetic but paired with #32.
4. **BUG #30** (P1) — Follow button has no working click handler.
5. **BUG #33** (P2) — onboarding tour localStorage persistence.
6. **BUG #20 organizer** (P1) — leaderboard sort logic.
7. **BUG #34/#35/#36** (P2/P3) — labeling and copy issues.
8. **BUG #15** (P2) — reputation page crash (from S222, still open).

---

## Pages Tested (S227 Summary)

| Page | Role | Result |
|------|------|--------|
| Organizer / sales | ADMIN (Nina) | ❌ Loads, but sales list 403s backend |
| Sale detail | Shopper (Ian) | ✅ Items load, ❌ Follow broken, ❌ Favorites broken |
| Messages (send) | Shopper (Ian) | ✅ Message sent |
| Messages (receive) | PRO (Oscar) | ✅ Inbox shows Ian's message with badge |
| Buy Now flow | Shopper (Ian) | ✅ Modal opens (Stripe not configured in test) |
| Leaderboard | Shopper (Ian) | ✅ Sort correct |
| Leaderboard | Organizer | ❌ BUG #20 sort still wrong |

---

## What's Working Well
- ✅ Messaging end-to-end (send + receive + unread badge)
- ✅ Sale detail items load (BUG #25 fixed)
- ✅ Buy Now modal + Stripe Connect check
- ✅ Frontend role guard for ADMIN (BUG #22 frontend fixed)
- ✅ Shopper leaderboard sort (BUG #20 shopper fixed)
- ✅ Dark mode on organizer nav and dashboard
- ✅ Sale detail page structure (Organized by, QR code, Share buttons)
