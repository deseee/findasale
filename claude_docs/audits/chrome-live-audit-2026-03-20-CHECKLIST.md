# Chrome Live Audit Checklist — FindA.Sale — 2026-03-20

**OBJECTIVE:** Comprehensive QA of production site (https://finda.sale) across public pages, all user tiers, dark mode, and accessibility.

**INSTRUCTIONS:** Open Chrome DevTools (F12) and run through each step. Take screenshots where marked [SS]. Keep this document nearby and check off each item as you complete it.

---

## Test Accounts
```
Shopper:
  user11@example.com / password123 → Shopper

Organizers:
  user1@example.com / password123 → SIMPLE tier
  user2@example.com / password123 → PRO tier
  user3@example.com / password123 → TEAMS tier
```

---

## PHASE 1: Public Pages (No Login)

Navigate to each URL. Note dark mode toggle location. Take [SS] of each.

| # | Route | Loads ✅/⚠️/❌ | Dark Mode Works | Issues |
|---|-------|---------|-----------------|--------|
| 1 | https://finda.sale | [ ] | [ ] | |
| 2 | https://finda.sale/trending | [ ] | [ ] | |
| 3 | https://finda.sale/map | [ ] | [ ] | |
| 4 | https://finda.sale/calendar | [ ] | [ ] | |
| 5 | https://finda.sale/leaderboard | [ ] | [ ] | |
| 6 | https://finda.sale/categories | [ ] | [ ] | |
| 7 | https://finda.sale/plan | [ ] | [ ] | |
| 8 | https://finda.sale/cities | [ ] | [ ] | |
| 9 | https://finda.sale/surprise-me | [ ] | [ ] | |
| 10 | https://finda.sale/condition-guide | [ ] | [ ] | |
| 11 | https://finda.sale/about | [ ] | [ ] | |
| 12 | https://finda.sale/contact | [ ] | [ ] | |
| 13 | https://finda.sale/nonexistent-page | [ ] Check 404 | [ ] | |

### Specific Checks for Public Pages:
- [ ] Hero section text readable (brand voice?)
- [ ] Sale cards render with badges (check for badge explosion — multiple status badges stacking)
- [ ] Nav bar is not overwhelming (count items visible)
- [ ] Footer present and readable
- [ ] CTA buttons are visible and on-brand
- [ ] Dark mode toggle found (where? circle icon? text?)
- [ ] Images load (not broken)
- [ ] No console errors (F12 → Console tab)

---

## PHASE 2: Shopper User

### Login (user11@example.com)
- [ ] Navigate to https://finda.sale/auth/login
- [ ] Email: `user11@example.com`
- [ ] Password: `password123`
- [ ] Click Login
- [ ] [SS] Screenshot of post-login homepage/dashboard
- [ ] Check: Are you redirected to /shopper or /organizer? (should be /shopper or similar)

### Shopper Routes (Take [SS] of each)
| # | Route | Loads | Dark Mode | Issues |
|---|-------|-------|-----------|--------|
| 1 | /shopper/profile or /profile | [ ] | [ ] | |
| 2 | /shopper/achievements or /achievements | [ ] | [ ] | |
| 3 | /shopper/wishlists or /wishlists | [ ] | [ ] | |
| 4 | /notifications | [ ] | [ ] | |
| 5 | /shopper/loyalty or /loyalty | [ ] | [ ] | |
| 6 | /shopper/collection or /loot-log | [ ] | [ ] | |

### Shopper-Specific Checks:
- [ ] Empty state copy readable (not generic "no data")
- [ ] Buttons are accessible
- [ ] Nav items count: _____ (should be reasonable, not 20+)
- [ ] Toggle dark mode — [SS] of each page above in dark mode
- [ ] Amber/golden text readable on dark background?
- [ ] Form inputs (if any) have visible borders in dark mode

### Shopper Logout
- [ ] Log out (find logout button in profile/nav)
- [ ] Redirected to homepage

---

## PHASE 3: SIMPLE Organizer (user1@example.com)

### Login
- [ ] Navigate to https://finda.sale/auth/login
- [ ] Email: `user1@example.com`
- [ ] Password: `password123`
- [ ] [SS] Post-login dashboard

### Dashboard Assessment
- [ ] Nav item count visible: _____ (count hamburger menu items if on mobile)
- [ ] Button count on main dashboard: _____
- [ ] Tier upsell messaging visible? (should prompt for PRO/TEAMS features)
- [ ] Is dashboard overwhelming? Any UX red flags?

### SIMPLE Organizer Routes (Try each, note if gated)
| # | Route | Accessible | Gated / Upsell | Notes |
|---|-------|-----------|----------------|-------|
| 1 | /organizer/sales or /organizer/dashboard | [ ] | N/A | |
| 2 | /organizer/items (item management) | [ ] | [ ] Gated? | |
| 3 | /organizer/analytics | [ ] | [ ] Should be GATED |  |
| 4 | /organizer/batch-operations | [ ] | [ ] Should be GATED | |
| 5 | /organizer/command-center | [ ] | [ ] Should be GATED | |
| 6 | /organizer/brand-kit | [ ] | [ ] Should be GATED | |
| 7 | /organizer/reputation | [ ] | N/A | |
| 8 | /organizer/payout or /earnings | [ ] | N/A | |

### Create New Sale Form
- [ ] Navigate to create sale page (usually button on dashboard)
- [ ] [SS] Form structure
- [ ] All required fields present?
- [ ] Form is not overwhelming (field count)?

### Item Management (Rapidfire Mode, AI Tags)
- [ ] Navigate to /organizer/items
- [ ] [SS] Item list view
- [ ] Find "rapidfire mode" or similar — [SS] of it
- [ ] Check AI tags feature — is it present/working?

### Dark Mode — SIMPLE Organizer
- [ ] Toggle dark mode
- [ ] [SS] Dashboard in dark mode
- [ ] [SS] Item form in dark mode
- [ ] [SS] Analytics page (if accessible) in dark mode
- [ ] Check:
  - [ ] Form input borders visible?
  - [ ] Labels readable?
  - [ ] Status badges (SOLD/LIVE/AUCTION) readable on dark cards?
  - [ ] Sidebar/nav background distinct from page background?

### Logout
- [ ] Log out

---

## PHASE 4: PRO Organizer (user2@example.com)

### Login
- [ ] Email: `user2@example.com`
- [ ] Password: `password123`
- [ ] [SS] Post-login dashboard
- [ ] Nav item count: _____ (compare to SIMPLE — should be ≥ SIMPLE count)

### PRO-Specific Routes (Should be ACCESSIBLE now)
| # | Route | Accessible | Notes |
|---|-------|-----------|-------|
| 1 | /organizer/analytics | [ ] ✅ | Should work |
| 2 | /organizer/command-center | [ ] ✅ | Should work |
| 3 | /organizer/item-library or /consignment | [ ] ✅ | Item Library |
| 4 | /organizer/flip-report or valuation tool | [ ] ✅ | |
| 5 | /organizer/batch-operations | [ ] ✅ | Should work |
| 6 | /organizer/workspace or /team | [ ] ⚠️ | Should show TEAMS upsell |

### PRO Dark Mode
- [ ] Toggle dark mode on dashboard — [SS]
- [ ] Dashboard in dark mode readable?

### Logout
- [ ] Log out

---

## PHASE 5: TEAMS Organizer (user3@example.com)

### Login
- [ ] Email: `user3@example.com`
- [ ] Password: `password123`
- [ ] [SS] Post-login dashboard
- [ ] Nav item count: _____ (should be PRO count + 1 — Workspace)

### TEAMS-Specific Routes (NEW compared to PRO)
| # | Route | Accessible | Notes |
|---|-------|-----------|-------|
| 1 | /organizer/workspace | [ ] ✅ | Full access (PRO has upsell) |
| 2 | Multi-user management UI | [ ] | Check if visible |

### TEAMS Dark Mode
- [ ] Toggle dark mode — [SS] dashboard

### Logout
- [ ] Log out

---

## PHASE 6: Accessibility Spot Check (Any Logged-In Page)

### Keyboard Navigation (use TAB key)
- [ ] Log in as SIMPLE organizer again
- [ ] Go to dashboard
- [ ] Press TAB repeatedly — count how many elements are focused before looping
- [ ] Are focus states VISIBLE (blue border or highlight)?
- [ ] Can you reach all buttons/inputs by tabbing?
- [ ] Can you activate buttons with ENTER?

### Icon-Only Buttons
- [ ] Find all buttons with only icons (no text label)
- [ ] [SS] an example
- [ ] Do they have aria-labels (right-click → Inspect → check HTML)?

### Mobile Bottom Nav
- [ ] Toggle mobile view (F12 → mobile view, or resize window to <640px)
- [ ] [SS] bottom nav
- [ ] Are icons labeled or just icons?

---

## PHASE 7: Dark Mode Deep Audit

### Text Contrast (WCAG AA = 4.5:1, AAA = 7:1)
Login as SIMPLE organizer in dark mode:
- [ ] Amber/golden text on dark background — is it readable? (amber-600 on bg-slate-900 may fail)
  - Specific check: If you see amber text, does it feel hard to read? (subjective but important)
- [ ] White text on dark background — readable?
- [ ] Form labels visible?
- [ ] Links underlined or color-distinct?

### Dark Mode Rendering Issues
- [ ] Card backgrounds defined (not invisible)?
- [ ] Borders visible?
- [ ] Shadows visible?
- [ ] Status badges (red/green/yellow) readable?
- [ ] Buttons have sufficient contrast?

---

## PHASE 8: Browser Console Errors (Throughout All Phases)

At any point, open DevTools (F12) and check Console tab:
- [ ] Any red errors?
- [ ] Any repeated warnings?
- [ ] Any 404s for images/JS/CSS?

**Document any errors found:**
```
Error 1: [describe]
Error 2: [describe]
```

---

## PHASE 9: Network & Performance (Optional)

In DevTools → Network tab:
- [ ] Any failed requests (red 404/500)?
- [ ] Any very slow requests (>3s)?
- [ ] Large image files without optimization?

---

## Summary Checklist

Before filing report:
- [ ] All public pages navigable
- [ ] Dark mode toggles work
- [ ] All user tiers log in successfully
- [ ] Tier gating works as expected (SIMPLE blocked from analytics, etc.)
- [ ] No critical console errors
- [ ] Dark mode text readable (subjective pass)
- [ ] Keyboard nav works
- [ ] No broken images

---

## Notes Section (For Issues Found)

```
CRITICAL ISSUES (site-breaking):
[List any]

HIGH ISSUES (feature broken for a tier):
[List any]

MEDIUM ISSUES (UX problems, dark mode text hard to read):
[List any]

LOW ISSUES (typos, cosmetic):
[List any]
```

---

**When complete, file a report to:** `/sessions/lucid-eloquent-faraday/mnt/FindaSale/claude_docs/audits/chrome-live-audit-2026-03-20.md`

Use the template provided in the session notes.
