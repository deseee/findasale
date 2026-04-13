# QA Testing Session Setup — 2026-03-20

## Overview

This directory contains comprehensive Chrome QA testing materials for the FindA.Sale production site (https://finda.sale). The testing covers:

- **13 public pages** (homepage, trending, map, calendar, leaderboard, categories, plan, cities, surprise-me, condition-guide, about, contact, 404)
- **3 user tiers** (SIMPLE, PRO, TEAMS organizers + 1 shopper account)
- **Dark mode** across 15+ routes
- **Accessibility** (keyboard navigation, focus states, icon labels)
- **Tier gating verification** (features blocked/available per tier)

---

## Files in This Session

### 1. **QUICK-REFERENCE-QA-2026-03-20.md** ← START HERE
A one-page cheat sheet with:
- Test account credentials (copy-paste ready)
- Key routes to test
- How to find dark mode toggle
- Tier gating summary
- Common issues to watch for

**Use this:** While testing in Chrome. Keep it open in another tab.

---

### 2. **chrome-live-audit-2026-03-20-CHECKLIST.md**
Detailed step-by-step testing checklist with:
- All 13 public page URLs and assessment criteria
- Shopper account routes (profile, achievements, wishlists, loyalty, collection, notifications)
- SIMPLE/PRO/TEAMS organizer routes with gating expectations
- Dark mode deep-dive (text contrast, rendering issues)
- Accessibility spot check (keyboard TAB, focus states, icon labels)
- Console error tracking
- Network performance (optional)

**Use this:** Main reference during testing. Check off each item as you complete it.

---

### 3. **chrome-live-audit-2026-03-20.md** ← FILL THIS IN
Report template with sections for:
- Executive summary
- Phase 1–8 results (public pages, shopper, SIMPLE, PRO, TEAMS, dark mode, accessibility, console)
- Critical/high/medium/low issue categorization
- Roadmap chrome column updates
- Sign-off checklist

**Use this:** After testing is complete. Fill in all findings and observations.

---

## How to Conduct the Test

### Phase 1: Setup (2 minutes)
1. Open Chrome on your machine
2. Go to https://finda.sale
3. Open DevTools with `F12`
4. Open this directory in another tab or window
5. Have **QUICK-REFERENCE** and **CHECKLIST** visible

### Phase 2: Public Pages (10 minutes)
1. Navigate to each public page listed in QUICK-REFERENCE
2. Take screenshot (F12 → three dots → Capture screenshot, or `Ctrl+Shift+S`)
3. Toggle dark mode — take another screenshot
4. Check for:
   - Page loads (✅/⚠️/❌)
   - Dark mode works
   - No images broken
   - Console errors? (F12 → Console tab)
   - Badge explosion? (multiple status badges stacking)
   - Nav items readable (not overwhelming)

### Phase 3: Shopper Account (5 minutes)
1. Log in: user11@example.com / password123
2. Visit each shopper route (profile, achievements, wishlists, notifications, loyalty, collection)
3. Toggle dark mode on each page
4. Check: Empty state copy present? Buttons accessible? Dark mode readable?
5. Log out

### Phase 4: SIMPLE Organizer (10 minutes)
1. Log in: user1@example.com / password123
2. Go to dashboard — take screenshot
3. Count nav items and buttons
4. Try to access gated routes:
   - /organizer/analytics → should be blocked ❌ (show upsell)
   - /organizer/batch-operations → should be blocked ❌ (show upsell)
   - /organizer/command-center → should be blocked ❌ (show upsell)
   - /organizer/brand-kit → should be blocked ❌ (show upsell)
5. Access open routes:
   - /organizer/items → check for rapidfire mode, AI tags
   - /organizer/reputation, /organizer/payout
6. Toggle dark mode — screenshot dashboard and form
7. Log out

### Phase 5: PRO Organizer (5 minutes)
1. Log in: user2@example.com / password123
2. Go to dashboard — count nav items (should be > SIMPLE)
3. Try the gated routes — should all be accessible ✅
4. Go to /organizer/workspace → should show TEAMS upsell (not fully open)
5. Toggle dark mode
6. Log out

### Phase 6: TEAMS Organizer (3 minutes)
1. Log in: user3@example.com / password123
2. Go to /organizer/workspace → should be fully accessible ✅
3. Count nav items (should be PRO + 1)
4. Log out

### Phase 7: Accessibility (5 minutes)
1. Log in as SIMPLE again
2. Go to dashboard
3. Press `TAB` key repeatedly — do you see blue focus outlines?
4. Toggle mobile view (F12 → device icon) — check bottom nav labels
5. Check for aria-labels on icon-only buttons (right-click → Inspect element)

### Phase 8: Dark Mode Deep Check (5 minutes)
1. Toggle dark mode
2. Check each route for:
   - Amber/golden text readable? (common WCAG fail)
   - Form input borders visible?
   - Card backgrounds distinct?
   - Status badges readable?
3. Document any hard-to-read text in the report

### Phase 9: Console & Network (2 minutes)
1. F12 → Console tab
2. Scroll through and note any red errors
3. F12 → Network tab (optional)
4. Look for 404s or slow requests (>3s)

### Phase 10: Report (5 minutes)
1. Fill in `chrome-live-audit-2026-03-20.md` with all findings
2. Organize issues by severity (critical → low)
3. Note which features work vs. fail
4. Update "Roadmap Chrome Column" with verified features

---

## What to Watch For (Common Issues)

**Dark Mode Text Contrast:**
- Amber-600 text on dark slate background may fail WCAG AA
- If text is hard to read, note it as a MEDIUM or HIGH issue

**Tier Gating:**
- SIMPLE should be blocked from: analytics, batch-operations, command-center, brand-kit, workspace
- PRO should be blocked from: workspace only (should show TEAMS upsell)
- TEAMS should have full access

**Tier Upsells:**
- When a SIMPLE user hits a blocked route, do they see upgrade messaging?
- Is the messaging clear and on-brand?

**Nav Item Count:**
- SIMPLE dashboard: count items (e.g., Dashboard, Items, Reputation, Payout = 4)
- PRO dashboard: count items (should be ≥ SIMPLE)
- TEAMS dashboard: count items (should be PRO + 1 for Workspace)

**Badge Explosion:**
- On sale cards (homepage, trending, etc.), do multiple status badges stack oddly?
- Should only show relevant badges (SOLD, LIVE, AUCTION, etc.)

**Keyboard Accessibility:**
- TAB should move focus through all interactive elements
- Blue outline or highlight should be visible
- ENTER/SPACE should activate buttons

**Console Errors:**
- Any red errors in DevTools → Console?
- Document them — they indicate bugs

---

## Session Duration Estimate

**Total time:** 45–60 minutes
- Public pages: 10 min
- Shopper: 5 min
- SIMPLE: 10 min
- PRO: 5 min
- TEAMS: 3 min
- Accessibility: 5 min
- Dark mode deep check: 5 min
- Console/network: 2 min
- Report: 5 min

---

## File Paths (for reference)

All three files are in:
```
/sessions/lucid-eloquent-faraday/mnt/FindaSale/claude_docs/audits/
```

- `QUICK-REFERENCE-QA-2026-03-20.md` ← Start here
- `chrome-live-audit-2026-03-20-CHECKLIST.md` ← Detailed checklist
- `chrome-live-audit-2026-03-20.md` ← Report template (fill in after testing)

---

## Sign-Off

When testing is complete:
1. Fill in the report template
2. Mark as `[DRAFT]` or `[FINAL]`
3. Note tester name and date
4. Save in the same directory

Report will be used to:
- Track feature stability across tiers
- Identify dark mode/accessibility regressions
- Verify tier gating is working
- Update roadmap progress column

---

## Questions During Testing?

Refer to:
- QUICK-REFERENCE for account credentials and routes
- CHECKLIST for detailed step-by-step instructions
- Report template for issue categorization

Good luck with the audit! 🎯
