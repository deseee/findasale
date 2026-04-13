# QA Delegation Protocol — FindA.Sale

**Purpose:** Eliminate surface-level testing, prevent partial QA results, and establish the main session as a strict QA manager who plans systematic verification BEFORE development ships, not after.

**Authority:** Referenced by CLAUDE.md §10 (Operational Rules) and CLAUDE.md §7 (Removal Gate for feature audits).

---

## Part 1: Known QA Failure Patterns from Session History

These are documented bugs that QA missed or accepted at PARTIAL status:

| Session | Bug | Root Cause | Detection | Lesson |
|---------|-----|-----------|-----------|--------|
| S262 | XP endpoints double `/api` prefix (404) | Page constructed URL as `/api/xp/profile` instead of `/xp/profile` | QA tested component rendering but not API response handling | QA must verify NETWORK REQUESTS (200 status), not just DOM nodes |
| S258 | Purchases tab unclickable | Missing `<Link>` wrapper around button; dark mode rendered but link non-functional | QA checked styling but not interactivity | QA must click/interact, not just visually inspect |
| S258 | YourWishlists dark mode broken | Text hardcoded `bg-white` with missing `dark:bg-gray-800` | QA tested light mode only | QA must test BOTH light and dark theme in one session; cannot split to multi-session |
| S262 | Leaderboard XP feed renders but shows 0 points | Frontend renders rank badge + progress bar, but values never populate (data fetch silent fail) | QA said "components load" without checking actual values (showed 0 XP) | QA must report EXACT VALUES (not "shows correctly") |
| S173 | Double `/api/api` in network requests | New page author copied wrong URL pattern | QA didn't check Network tab | QA must open DevTools Network tab and verify zero 404s |
| S239 | Passkey challenge race condition on double-click | Concurrent requests consumed the same challenge twice | QA tested single happy path only | QA must test rapid/concurrent actions (double-click, multiple tabs) |

**Pattern Summary:**
- **Surface rendering ≠ functional.** Components can appear visually correct while fetches fail silently.
- **Single-path testing fails.** Happy path only misses race conditions, edge cases, both themes.
- **Exact values matter.** Reporting "looks correct" hides bugs like 0 XP or truncated text.
- **Browser session state matters.** Testing different users without logout = testing wrong user. Testing new feature with old session data = contaminated results.
- **Network layer always needs verification.** DOM node inspection is insufficient; XHR/Fetch must be checked.

---

## Part 2: QA Dispatch Template

**Use this template EVERY TIME a main session dispatches findasale-qa.** Fill in all sections completely. Return with "ACCEPT" or "PARTIAL" — never accept PARTIAL results.

### QA Dispatch Template (Copy/Paste Ready)

```
## QA Dispatch — [Feature Name] — Session [Number]

**Deployment Status:** [Dev complete / Push queued / Deployed to Railway / Deployed to Vercel / Live on finda.sale]

**Deployed Commits:** [list commit hashes or "all changes in S#"]

**Browser Session Setup (MANDATORY FIRST STEP):**
1. Open Chrome (not incognito). Navigate to [finda.sale or staging URL].
2. IF this is a multi-user test: LOGOUT completely. Clear browser cache (`Settings > Privacy > Clear browsing data > All time`). Close all tabs. Reopen fresh tab.
3. IF testing role-switching: You MUST test each role in a separate browser session (not tabs) — open two Chrome windows (Ctrl+N), test ORGANIZER in window 1, SHOPPER in window 2. Do NOT switch accounts in the same tab.
4. FOR EACH test scenario: Document which account is logged in ([email]) and what role ([ADMIN/ORGANIZER/SHOPPER]).

**Test Scenario 1 — [Feature/Page Name]**
- Role: [SHOPPER/ORGANIZER/ADMIN]
- Logged in as: [user@example.com]
- Expected result: [SPECIFIC state — not "shows correctly", but "Page loads, Submit button enabled, 3 items in list, total $XX.XX, no console errors"]
- Steps:
  1. Navigate to [URL]
  2. [Action] (click, type, scroll)
  3. [Action]
  4. Verify: [expected DOM state, URL change, network request status, exact value]
- Network verification: Open DevTools (F12) > Network tab. [Specify which requests should fire and what status/response they should have.]
- Console verification: DevTools > Console tab. [Specify: zero errors, OR expected warnings, OR specific error to report.]
- Acceptance criteria: [Step-by-step state after each action — exact values, not vague description]

**Test Scenario 2 — [Feature/Page Name]**
[Repeat template above]

**Test Scenario 3 — [Race Condition / Concurrent Action]**
- Role: [SHOPPER/ORGANIZER]
- Logged in as: [user@example.com]
- Concurrent action: [Open two tabs with same feature, click Submit on both within 2 seconds]
- Expected result: [Only one succeeds / Both succeed with different results / Error on second]
- Acceptance criteria: [Specific outcome after concurrent action]

**Light/Dark Theme Verification (IF FEATURE TOUCHES UI):**
- Light mode: [Navigate to feature] > [Toggle theme to light] > [Verify specific elements: no white-on-white text, buttons clickable, images visible]
- Dark mode: [Navigate to feature] > [Toggle theme to dark] > [Verify specific elements: no hardcoded colors breaking, badge colors readable, contrast sufficient]
- Both modes: No console errors in either theme.

**REPORTING REQUIREMENTS:**
- For each test scenario, report: PASS or FAIL (no PARTIAL)
- If PASS: Include exact values (not "shows correctly" — include actual numbers, text, states)
- If FAIL: Include (1) what you expected, (2) what you observed, (3) exact error message/screenshot, (4) steps to reproduce
- Console errors: Report in FULL (do NOT summarize)
- Network errors: Report the failed URL, HTTP status, and response body (if available)

**Escalation Rule:**
- If ANY test returns PARTIAL (e.g., "component loads but I couldn't verify the data"): **Do NOT accept this result.** Re-dispatch with specific steps to complete the unverified part, or note what additional information is needed.
- If blocked by auth or infrastructure: Report exactly what's blocked and ask for setup help — do not guess or skip.
- If a test scenario cannot be completed: Return "BLOCKED: [reason]" and PROPOSE A WORKAROUND or alternative scenario.

**Result Summary:**
- Overall: [PASS / FAIL / PARTIAL (if partial, list what passed and what failed)]
- Bugs found: [List each bug with reproduction steps]
- Follow-up QA needed: [Yes/No — if yes, what specific scenarios need re-test]
```

---

## Part 3: Session QA Planning Protocol

The main session MUST plan QA BEFORE dev ships. QA always follows dev, never before.

### QA Planning Checklist (Before Dispatching Dev)

**1. Identify which features need post-deploy QA:**
   - New pages or routes → YES
   - New API endpoints → YES (network verification mandatory)
   - UI changes (styling, layout, dark mode) → YES (both themes required)
   - Database migrations or schema changes → YES (verify new fields render and persist)
   - Authentication or permission changes → YES (test each role)
   - Concurrent/race-condition-prone features → YES (concurrent test required)
   - Bug fixes → YES (verify the bug is gone AND no regressions)
   - Copy/text changes → YES (check for consistency, no estate-sale-only bias)

**2. Define deployment sequence (write it before dev starts):**
   - Phase A: Dev finishes work and returns changed files
   - Phase B: Main session creates pushblock (or triggers MCP push if ≤3 files)
   - Phase C: Patrick runs `.\push.ps1` from PowerShell
   - Phase D: Railway (backend) redeployed (~1–2 min); Vercel (frontend) redeployed (~2–3 min)
   - Phase E: Main session dispatches findasale-qa with completed template
   - Phase F: QA returns PASS/FAIL; if FAIL, return to dev with bug reproduction

**3. Draft QA scenarios DURING dev (not after):**
   - For each changed page/endpoint: write 2–3 specific test scenarios (not "test this page" but "load /pricing, click Upgrade button, verify Stripe modal opens")
   - For each role affected: plan a test scenario per role
   - For dark mode: always include one scenario that explicitly tests theme switching
   - For network-critical features: plan a scenario that opens DevTools Network tab and verifies specific requests

**4. Reserve time in session plan:**
   - Dev: X tokens
   - QA dispatch + iteration: +20–30% of dev tokens
   - (If QA fails, dev re-dispatch: +50% more)
   - Example: If dev is 15k tokens, budget 4–5k for QA dispatch + re-dispatch

### Example QA Planning (Before Dev Dispatch)

**Feature:** Shopper → Organizer upgrade flow (new CTA + button)

**Affected roles:** SHOPPER (trigger), ORGANIZER (result)

**Affected pages:** `/pricing`, `/organizer/pricing`, nav CTA

**QA Plan:**
1. **Scenario 1 — Shopper clicks "Become an Organizer" CTA on pricing page**
   - Role: SHOPPER (user11@example.com)
   - Action: Navigate to `/pricing` → Click "Become an Organizer" button
   - Expected: Redirect to `/organizer/pricing` (not modal, full page redirect)
   - Network: Verify `/api/auth` request completes (JWT refresh for ORGANIZER role)
   - Acceptance: User sees organizer-tier pricing, not shopper-only page

2. **Scenario 2 — Organizer sees correct tier pricing on organizer pricing page**
   - Role: ORGANIZER (user2@example.com)
   - Action: Navigate to `/organizer/pricing` → Verify current plan highlighted
   - Expected: User2's PRO tier highlighted, CTA shows "Current Plan" (not "Upgrade")
   - Network: Verify `/api/subscription/current` returns PRO tier
   - Acceptance: Current plan badge present, upgrade disabled for current tier

3. **Scenario 3 — Dark mode works on both pricing pages**
   - Light mode: Navigate `/pricing` → toggle to light → verify readability
   - Dark mode: Toggle to dark → verify no white-on-white text, buttons clickable
   - Network: Zero console errors in either mode

---

## Part 4: Re-dispatch Trigger Rules

**When main session MUST re-dispatch QA (never accept PARTIAL):**

| Condition | Action |
|-----------|--------|
| QA returns PARTIAL (e.g., "component loads but couldn't verify data") | **REJECT.** Create a new dispatch filling in the missing steps. Example: "Test Scenario 2 was blocked by login — here's the specific steps to complete it." |
| QA reports a network 404 or 5xx error | **DIAGNOSE before re-dispatch.** Is the error because (a) the deploy hasn't finished yet (wait 1 min, re-dispatch), or (b) there's a URL path bug (dispatch dev with fix, new push, new QA dispatch)? Do NOT re-dispatch until the root cause is identified. |
| QA finds a bug but didn't reproduce it fully (e.g., "page loaded but then crashed") | **RE-DISPATCH with explicit reproduction steps.** "Please reproduce the exact sequence: (1) log in as user11, (2) go to /trending, (3) scroll to bottom, (4) click Favorite on the last item. When the crash occurs, capture Network tab and Console errors." |
| QA tested only light mode but feature touches UI | **RE-DISPATCH requiring both themes.** "Please test the dark mode theme toggle: (1) navigate to [page], (2) toggle to dark in settings, (3) verify no console errors and text is readable." |
| QA says "looks fine" without exact values | **REJECT and clarify.** "Please re-test and report: exact XP value shown, exact rank name, exact button text. Not 'looks correct' but precise values." |
| QA didn't clear browser session between role changes | **RE-DISPATCH.** "Please logout completely, clear cache, and reopen in a fresh tab before testing the next user role. Report which account is logged in for each scenario." |

**When main session MUST dispatch dev (QA found a product bug):**

QA returns FAIL with:
- Exact reproduction steps
- Expected vs observed behavior
- Network/console errors
- Screenshot or recorded action

Main session routes to findasale-dev with:
- QA's bug reproduction (verbatim)
- Affected file/component
- Accept criteria (how QA will verify the fix)
- NEW QA dispatch template (for re-test after fix)

---

## Part 5: Manager Standards for Main Session

These are rules the main session ENFORCES when reviewing QA results:

### A. Full Test Completion Required

**Rule:** Never accept PARTIAL results. PARTIAL = "I tested some scenarios but couldn't finish the others."

**Enforcement:**
- If QA dispatch returns: "Scenario 1 PASS, Scenario 2 BLOCKED, Scenario 3 not tested"
  → **Return:** "All three scenarios are required. Please complete Scenario 2 (describe what blocked it and propose a workaround). If blocked by infrastructure, note what's needed."
- If QA says: "I tested the happy path and it works"
  → **Return:** "Happy path alone is insufficient. Please test: (1) both light and dark themes, (2) error states, (3) concurrent actions."

### B. API-Level Verification Required

**Rule:** UI rendering alone is insufficient. Network requests MUST be verified.

**Enforcement:**
- QA reports: "Page loads and shows the data"
  → **Ask:** "Which API endpoint did you verify? What was the HTTP status? Did you check the response payload?"
- QA returns: "Network tab shows `/api/xp/profile` request"
  → **Accept if:** Status 200, response includes `{ guildXp: <number>, explorerRank: <string>, ... }`
  → **Reject if:** Status 404 (URL path bug) or 500 (backend error)

### C. Exact Values Required

**Rule:** Never accept vague descriptions like "shows correctly" or "renders fine."

**Enforcement:**
- QA reports: "XP progress bar shows correctly"
  → **Return:** "Please report the exact value: How many XP shown? What rank? What % filled?"
- QA returns: "Leaderboard displays. Top rank: SageUser (500 XP, Grandmaster rank)"
  → **Accept:** Exact values provided, verifiable.

### D. Console Errors Always Reported in Full

**Rule:** Never suppress or summarize console errors.

**Enforcement:**
- QA reports: "Minor console warning, not critical"
  → **Return:** "Please provide the full console error text. Even minor warnings can indicate silent bugs."
- QA returns full error:
  ```
  TypeError: Cannot read property 'xpChange' of undefined
  at useXpProfile (pages/loyalty.tsx:42)
  ```
  → **Escalate to dev if:** Error appears during user interaction (not just page load). This is a real bug.

### E. Multi-Role Testing Requires Separate Sessions

**Rule:** Do NOT test different user roles in the same browser tab/session. Each role change requires fresh login.

**Enforcement:**
- QA reports: "Tested user11 (SHOPPER), then logged in as user2 (ORGANIZER) in the same tab"
  → **Reject:** "Browser session may retain cached data from user11. Please test in a fresh tab: (1) Open new tab. (2) Logout. (3) Clear cache. (4) Login as user2. (5) Re-test."

### F. Both Themes Always Tested for UI Changes

**Rule:** If a session touches UI (buttons, layout, text, colors, badges), BOTH light and dark modes must be tested.

**Enforcement:**
- QA reports: "Tested in light mode, looks good"
  → **Return:** "Please also test dark mode. Toggle theme settings and verify: (1) all text is readable (no white-on-white), (2) buttons are clickable, (3) no hardcoded colors broken, (4) zero console errors in dark mode."

### G. Partial Results Returned to Dev, Not Accepted

**Rule:** If QA can't complete a test due to a blocker, dispatch dev to fix the blocker, then re-dispatch QA.

**Enforcement:**
- QA reports: "Can't complete Scenario 2 because login button is missing / 404 on endpoint / feature not live"
  → **Dispatch dev:** "QA blocked on [issue]. Please fix: [specific reproduction]."
  → **After fix:** Dispatch QA again with the same template, marked "RE-TEST."

---

## Part 6: Post-Deploy QA Verification (Mandatory per CLAUDE.md §10)

**Rule (CLAUDE.md §10):** After ANY session that pushes bug fixes or feature code to production, the NEXT session must include a live-site smoke test of all changed pages BEFORE starting new work.

**Implementation:**

After a dev/QA session pushes code:
1. Main session checks STATE.md "Recent Sessions" for the previous session's feature list
2. For each changed page/feature, main session (or findasale-qa if needed) does a quick live smoke test on finda.sale
3. If any page is broken, main session IMMEDIATELY flags it and dispatches findasale-dev (do not start other work)
4. If all pages work, main session notes "S# post-deploy smoke test PASS" and proceeds normally

**Example from S263:**
- S262 pushed: Brand drift Batches 1+2, Explorer's Guild Phase 2a/2b/2c
- S263 started with: "Smoke test S262 changes live on finda.sale"
- Main session (or QA) verified: `/trending`, `/inspiration`, leaderboard, loyalty page all work
- Result: "S262 smoke test PASS. Proceed with S263 priorities."

---

## Part 7: Dispatch Template Examples (Filled)

### Example 1 — Simple Feature (New Button)

```
## QA Dispatch — Add "Favorite Item" Button — Session 267

**Deployment Status:** Deployed to Vercel (S267 push complete)

**Deployed Commits:** a1b2c3d (frontend), a1b2c3e (backend schema + API)

**Browser Session Setup:**
1. Open Chrome. Navigate to finda.sale.
2. Logout completely (Settings > Profile > Sign Out).
3. Clear cache (Ctrl+Shift+Delete > All Time).
4. Close all tabs. Open fresh tab.

**Test Scenario 1 — Shopper clicks Favorite on an item**
- Role: SHOPPER
- Logged in as: user11@example.com
- Steps:
  1. Navigate to /search?q=furniture
  2. Click the heart icon on any item
  3. Verify heart fills in red and count increments (e.g., "3 → 4")
  4. Verify URL stays /search?q=furniture (no page reload)
  5. Open DevTools Console (F12) → verify zero errors
  6. Check Network tab → verify one POST request to /api/wishlist/add with status 200
- Expected result: Heart fills red. Count increments. Zero console errors. Network status 200.
- Acceptance criteria: PASS if heart is red, count incremented, no errors, status 200.

**Test Scenario 2 — Unfavorite reverts icon**
- Role: SHOPPER
- Logged in as: user11@example.com
- Steps:
  1. On same item from Scenario 1, click the heart again (already favorited)
  2. Verify heart empties (outline only, not filled) and count decrements
  3. Check Network tab → verify one DELETE request to /api/wishlist/remove with status 200
- Expected result: Heart unfills. Count decrements. Status 200.
- Acceptance criteria: PASS if heart is outline, count decremented, status 200.

**Test Scenario 3 — Dark mode rendering**
- Role: SHOPPER (user11@example.com, already logged in)
- Steps:
  1. Toggle theme to dark (Settings > Theme > Dark)
  2. Navigate to /search?q=furniture
  3. Verify heart icon is visible and clickable (not white-on-white or missing)
  4. Click heart → verify it fills with red (color visible in dark mode)
  5. Check Console → verify zero errors
- Expected result: Heart visible. Fills red in dark mode. No console errors.
- Acceptance criteria: PASS if heart is visible and functional in dark mode with zero errors.

**Result Summary:**
- Scenario 1: PASS (heart fills, count increments, network 200)
- Scenario 2: PASS (heart unfills, count decrements, network 200)
- Scenario 3: PASS (dark mode renders, no errors)
- Overall: PASS
- Bugs found: None
- Follow-up QA needed: No
```

### Example 2 — API Bug Fix with Re-dispatch

```
## QA Dispatch — Fix XP Endpoints Double /api Prefix — Session S263-REV

**Deployment Status:** Deployed to Railway (S263 commit f4g5h6i)

**Deployed Commits:** f4g5h6i (backend /xp route path fix)

**Browser Session Setup:**
[Standard setup as above]

**Test Scenario 1 — Loyalty page XP data loads**
- Role: ORGANIZER
- Logged in as: user2@example.com
- Steps:
  1. Navigate to /loyalty
  2. Verify RankBadge renders (shows rank name, e.g., "Scout")
  3. Verify RankProgressBar renders (shows "X/500 XP")
  4. Open DevTools Network tab (F12)
  5. Look for request starting with `/xp/profile` (NOT `/api/xp/profile`)
  6. Verify request status is 200 (NOT 404)
  7. Verify response includes { guildXp: <number>, explorerRank: <string>, ... }
  8. Check Console → verify zero errors
- Expected result: RankBadge + RankProgressBar render. Network request is `/xp/profile` (no double /api). Status 200. Response includes XP data.
- Acceptance criteria: PASS if network URL is `/xp/profile` (not `/api/xp/profile`), status is 200, response has xp data, zero console errors.

**Test Scenario 2 — Leaderboard page loads**
- Role: ORGANIZER
- Logged in as: user2@example.com
- Steps:
  1. Navigate to /leaderboard
  2. Open DevTools Network tab
  3. Look for request `/xp/leaderboard` (NOT `/api/xp/leaderboard`)
  4. Verify status 200
  5. Verify leaderboard table displays with at least 5 rows (Rank, User, XP)
  6. Report top 3 users' exact XP values (not "shows data", actual numbers)
  7. Check Console → zero errors
- Expected result: Leaderboard loads. Network URL is `/xp/leaderboard`. Status 200. Data displays with exact values.
- Acceptance criteria: PASS if network URL correct, status 200, exact XP values reported, zero errors.

**Result Summary:**
- Scenario 1: PASS
  - RankBadge: Rendered (Scout rank)
  - Network URL: `/xp/profile` ✓ (not `/api/xp/profile`)
  - Status: 200 ✓
  - Response: { guildXp: 150, explorerRank: "Scout", ... } ✓
  - Console: Zero errors ✓
- Scenario 2: PASS
  - Leaderboard: Loaded ✓
  - Network URL: `/xp/leaderboard` ✓
  - Status: 200 ✓
  - Top 3: SageUser (2500 XP), RangerAlex (2100 XP), ScoutJen (1200 XP)
  - Console: Zero errors ✓
- Overall: PASS
- Bugs found: None (previous double /api bug fixed)
- Follow-up QA needed: No
```

### Example 3 — Partial Result (Rejected by Main Session)

```
## QA Dispatch — Shopper → Organizer Upgrade Flow — Session 268

[QA returns this result]

**Test Scenario 1 — Shopper clicks Become Organizer CTA**
- Status: PASS
- Heart icon fills, count increments

**Test Scenario 2 — Organizer tier pricing displays**
- Status: PARTIAL (blocked by auth)
- Couldn't verify because user2 login failed. Got 403 Forbidden.

**Test Scenario 3 — Dark mode**
- Status: SKIP (ran out of time)

---

[Main session REJECTS this result]

## Re-dispatch Required — Complete All Scenarios

**Re-dispatch action:**

QA Dispatch — Shopper → Organizer Upgrade Flow (RE-TEST) — Session 268

**Issues found in prior QA dispatch:**
1. Scenario 2 blocked on user2 login (403 Forbidden). Please investigate: Is user2 account broken? Try user3@example.com (TEAMS tier) instead. If user2 works on other pages, note this separately for dev to investigate.
2. Scenario 3 was skipped. Please complete dark mode testing.

**Revised scenarios (complete all three):**

**Test Scenario 2 — Organizer tier pricing displays (RE-TEST with user3)**
- Role: ORGANIZER
- Logged in as: user3@example.com (TEAMS tier account)
- Steps:
  1. Navigate to /organizer/pricing
  2. Verify page loads (200 status in Network tab)
  3. Verify "TEAMS" tier is highlighted/marked as current plan
  4. Report exact text on the current plan CTA (e.g., "Current Plan" or "Downgrade")
  5. Zero console errors
- Acceptance criteria: Page loads, current tier highlighted, CTA text exact, zero errors.

**Test Scenario 3 — Dark mode (NEW)**
- Role: ORGANIZER
- Logged in as: user3@example.com
- Steps:
  1. On /organizer/pricing, toggle theme to dark
  2. Verify page is readable (no white-on-white)
  3. Verify pricing boxes are visible and distinct
  4. Verify CTAs (buttons) are clickable and contrast is sufficient
  5. Zero console errors
- Acceptance criteria: Page readable in dark mode, buttons visible/clickable, zero errors.

Please complete all three scenarios and re-dispatch with PASS/FAIL per scenario.
```

---

## Part 8: Integration with CLAUDE.md

**Proposed addition to CLAUDE.md §10 (Operational Rules):**

```
### 10c. QA Management Standards

QA is NOT a final checkpoint; it is a planning and iteration phase built INTO every feature session.

**QA Planning (before dev starts):**
- Identify which pages/endpoints need post-deploy QA (default: all new routes, schema changes, role transitions, UI/theme changes)
- Draft 2–3 specific test scenarios (not generic "test this page" but "load /pricing, click button, verify modal opens")
- Plan for both light and dark themes if UI is touched
- Budget 20–30% extra tokens for QA dispatch + potential re-dispatch and fixes
- Reserve specific test accounts and their expected states (role, tier, current plan)

**QA Dispatch (after dev, before or after push):**
- Use qa-delegation-protocol.md Part 2 template (fill in ALL sections completely)
- Never dispatch with vague scope ("test these pages") — be specific (URL, user role, expected states, network verification)
- Require exact values in results (not "looks correct" but actual numbers: XP: 500, Rank: Scout, Button text: "Upgrade")
- Require network verification (F12 Network tab, status codes, response payloads)
- Require browser session clarity (which user logged in, when cache was cleared, when tabs were refreshed)

**QA Result Standards:**
- PASS: All scenarios completed, exact values reported, zero console errors
- FAIL: Bug reproduction with steps, expected vs observed, network/console errors
- REJECT (never accept): PARTIAL results, vague descriptions, missing theme tests, skipped scenarios, console errors not reported
- If QA returns PARTIAL: Re-dispatch with specific steps to complete the missing parts
- If QA finds a bug: Dispatch dev with reproduction; return to QA after fix for re-test

**Post-Deploy Smoke Test (next session after code push):**
- Before starting new work, the main session verifies all changed pages/features work live on finda.sale
- If broken: Immediately dispatch dev (do not proceed with other work)
- If working: Note "S# smoke test PASS" and proceed

**Manager Accountability:**
- Main session owns QA planning completeness
- Main session ensures QA dispatch template is filled completely (no generic "test the feature" vague requests)
- Main session rejects PARTIAL results and re-dispatches with specific missing steps
- Main session verifies QA follows all standards (exact values, network checks, theme tests, browser session clarity)
- Main session NEVER accepts "looks correct" without exact values or "tested happy path" without error/theme/concurrent scenarios
```

---

## Part 9: Self-Healing Skills Update

**Entry for self-healing/self_healing_skills.md (proposed):**

```
## SH-017: QA Surface-Level Testing Causes Post-Deploy Bugs

**Trigger:** Commit pushed to production, app works in smoke test but endusers report: (a) network 404s on specific pages, (b) dark mode broken text, (c) double-click race conditions, (d) exact values wrong (XP showing 0 when should be 500).

**Environment:** Any session where QA was dispatched with vague scope ("test this feature") and returned generic results ("looks correct").

**Pattern:** QA tested rendering (DOM nodes visible) but skipped: (1) network request verification (404 errors hidden if component renders with empty data), (2) both theme verification (only tested light mode), (3) exact value verification (reported "XP shows" without checking the number), (4) browser session state management (tested multiple users without logout, contaminated results), (5) concurrent action testing (race conditions only appear under double-click/rapid requests).

**Known instances:** Sessions 262 (double /api bug found post-deploy), 258 (dark mode bug found post-deploy), 262 (leaderboard shows 0 XP when data doesn't load).

**Steps to prevent:**
1. Before dispatching QA, use qa-delegation-protocol.md Part 2 template. Fill in ALL sections (not partial).
2. QA dispatch must specify: exact role, exact browser session setup, exact expected values (not "shows correctly")
3. QA results must include: Network tab verification (request URLs, status codes), Console tab verification (errors reported in full), Exact values (not vague descriptions)
4. Main session rejects PARTIAL results and re-dispatches with specific missing steps
5. Post-deploy, main session smoke-tests changed pages on live finda.sale BEFORE starting new work

**Confidence:** HIGH — Pattern is structural; template discipline prevents 90%+ of recurrence.
```

---

## Reference: Quick Decision Tree for Main Session

**Use this during QA phases to decide: Accept, Re-dispatch, or Dispatch Dev?**

```
┌─ QA Result Received ─┐
│
├─ Is it FULL completion (all scenarios run)?
│  ├─ NO → RE-DISPATCH with specific missing steps
│  └─ YES ↓
│
├─ Are all reported values EXACT (not vague)?
│  ├─ NO (says "looks correct") → RE-DISPATCH: "Report exact values"
│  └─ YES ↓
│
├─ Did QA verify NETWORK requests (DevTools Network tab)?
│  ├─ NO → RE-DISPATCH: "Verify requests in Network tab for status/response"
│  └─ YES ↓
│
├─ Are BOTH light and dark themes verified (if UI was touched)?
│  ├─ NO → RE-DISPATCH: "Test dark mode theme toggle"
│  └─ YES ↓
│
├─ Are CONSOLE errors reported in FULL?
│  ├─ NO (says "minor warning") → RE-DISPATCH: "Report full error text"
│  └─ YES ↓
│
├─ Did QA test MULTIPLE user roles in SEPARATE sessions (logout+cache clear)?
│  ├─ NO → RE-DISPATCH: "Retest in fresh tabs, logout between roles"
│  └─ YES ↓
│
├─ Are all test results PASS or FAIL (no PARTIAL)?
│  ├─ PARTIAL (e.g., "blocked") → RE-DISPATCH with workaround
│  ├─ FAIL → DISPATCH DEV with bug reproduction
│  └─ PASS → ACCEPT and note "QA PASS" in STATE.md
```

---

**Last Updated:** 2026-03-24 (created this session)
**Authority:** Referenced by CLAUDE.md §10 (Operational Rules)
**Next Review:** After S270 or when QA pattern changes
