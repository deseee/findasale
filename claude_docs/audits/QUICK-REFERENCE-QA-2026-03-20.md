# Quick Reference — Chrome Live Audit 2026-03-20

## Setup
1. Open Chrome
2. Go to https://finda.sale
3. Open DevTools: `F12`
4. Keep checklist open in another tab: `chrome-live-audit-2026-03-20-CHECKLIST.md`
5. Have report template ready: `chrome-live-audit-2026-03-20.md`

---

## Test Accounts (Copy-Paste)

**SHOPPER:**
```
Email: user11@example.com
Password: password123
```

**SIMPLE ORGANIZER:**
```
Email: user1@example.com
Password: password123
```

**PRO ORGANIZER:**
```
Email: user2@example.com
Password: password123
```

**TEAMS ORGANIZER:**
```
Email: user3@example.com
Password: password123
```

---

## Quick Nav

Login page: https://finda.sale/auth/login

---

## Key Routes to Test

**Public (no login):**
- / (homepage)
- /trending
- /map
- /calendar
- /leaderboard
- /categories
- /plan
- /cities
- /surprise-me
- /condition-guide
- /about
- /contact
- /nonexistent-page (404 check)

**Shopper Routes:**
- /shopper (or /dashboard)
- /shopper/profile
- /shopper/achievements
- /shopper/wishlists
- /notifications
- /shopper/loyalty
- /shopper/collection

**Organizer Routes (check gating per tier):**
- /organizer/dashboard
- /organizer/items (SIMPLE: open; check rapidfire mode, AI tags)
- /organizer/analytics (SIMPLE: blocked; PRO/TEAMS: open)
- /organizer/batch-operations (SIMPLE: blocked; PRO/TEAMS: open)
- /organizer/command-center (SIMPLE: blocked; PRO/TEAMS: open)
- /organizer/brand-kit (SIMPLE: blocked; PRO/TEAMS: open)
- /organizer/item-library (SIMPLE/PRO: open; check)
- /organizer/flip-report (SIMPLE/PRO: open; check)
- /organizer/workspace (SIMPLE/PRO: blocked w/ upsell; TEAMS: open)
- /organizer/reputation
- /organizer/payout

---

## Dark Mode Toggle

**How to toggle:**
- Look for a moon/sun icon in the top nav or right side
- OR check top-right corner near profile icon
- OR press keyboard shortcut (if any)
- Take screenshot before and after

---

## DevTools Console Check (F12)

1. Press `F12` to open DevTools
2. Click "Console" tab
3. Look for red error messages
4. Document any errors in report

---

## Accessibility Quick Check

**Keyboard Tab Test:**
1. Press `TAB` key repeatedly on any page
2. Watch for blue focus outline
3. Should cycle through buttons, inputs, links
4. Press `ENTER` or `SPACE` to activate

**Mobile View:**
1. Press `F12`
2. Click device icon (looks like phone/tablet)
3. Check bottom nav icons — are they labeled?

---

## Screenshot Locations

Chrome screenshots save to Downloads by default.
- Use `Ctrl+Shift+S` (Windows) or `Cmd+Shift+3` (Mac) for full page
- OR F12 → three dots → "Capture screenshot"
- Label each screenshot with route and mode:
  - `homepage-light.png`
  - `organizer-dashboard-dark.png`
  - etc.

---

## Tier Gating Summary

**SIMPLE Tier:**
- ✅ Can access: dashboard, items, reputation, payout
- ❌ Cannot access (should show upsell): analytics, batch-operations, command-center, brand-kit, workspace

**PRO Tier:**
- ✅ Can access: Everything SIMPLE has PLUS analytics, batch-operations, command-center, brand-kit, item-library, flip-report
- ❌ Cannot access (should show upsell): workspace (TEAMS only)

**TEAMS Tier:**
- ✅ Can access: Everything PRO has PLUS workspace and multi-user management

---

## Common Issues to Watch For

- [ ] Amber/golden text hard to read in dark mode?
- [ ] Form input borders invisible in dark mode?
- [ ] Status badges (SOLD/LIVE/AUCTION) unclear on dark cards?
- [ ] Images not loading?
- [ ] Console errors (red)?
- [ ] Upsells not showing on blocked routes?
- [ ] Buttons unclickable?
- [ ] Nav items missing (count: SIMPLE _____, PRO _____, TEAMS _____)?
- [ ] Focus states invisible on keyboard tab?

---

## Report Submission

When done testing:
1. Fill in `chrome-live-audit-2026-03-20.md` with all findings
2. Save file
3. Note critical/high-priority issues at the top
4. File in: `/sessions/lucid-eloquent-faraday/mnt/FindaSale/claude_docs/audits/`

---

## Questions?

Check the full checklist: `chrome-live-audit-2026-03-20-CHECKLIST.md`

Good luck! ✅
