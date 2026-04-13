# Chrome Live Audit — FindA.Sale — 2026-03-20

**Date:** March 20, 2026
**Tester:** [Your name]
**Environment:** https://finda.sale (Production)
**Duration:** [Start time — End time]

---

## Executive Summary

[Brief overview of what was tested and overall health. Example: "Tested all 13 public pages, 3 user tiers (SIMPLE/PRO/TEAMS), dark mode across 15+ routes, and keyboard accessibility. Found 2 critical issues with tier gating on analytics, 3 dark mode text contrast failures, and no console errors."]

---

## Phase Results

### Phase 1: Public Pages

| # | Route | Loads | Dark Mode | Issues |
|---|-------|-------|-----------|--------|
| 1 | https://finda.sale | ✅/⚠️/❌ | ✅/⚠️/❌ | [describe or "None"] |
| 2 | /trending | ✅/⚠️/❌ | ✅/⚠️/❌ | |
| 3 | /map | ✅/⚠️/❌ | ✅/⚠️/❌ | |
| 4 | /calendar | ✅/⚠️/❌ | ✅/⚠️/❌ | |
| 5 | /leaderboard | ✅/⚠️/❌ | ✅/⚠️/❌ | |
| 6 | /categories | ✅/⚠️/❌ | ✅/⚠️/❌ | |
| 7 | /plan | ✅/⚠️/❌ | ✅/⚠️/❌ | |
| 8 | /cities | ✅/⚠️/❌ | ✅/⚠️/❌ | |
| 9 | /surprise-me | ✅/⚠️/❌ | ✅/⚠️/❌ | |
| 10 | /condition-guide | ✅/⚠️/❌ | ✅/⚠️/❌ | |
| 11 | /about | ✅/⚠️/❌ | ✅/⚠️/❌ | |
| 12 | /contact | ✅/⚠️/❌ | ✅/⚠️/❌ | |
| 13 | /nonexistent-page (404) | ✅/⚠️/❌ | N/A | |

**Public Pages Notes:**
- Badge explosion observed (multiple status badges stacking)? YES / NO
- Header density (nav items visible without scrolling)? _____ items
- Hero text brand voice? [Good / Neutral / Off-brand]
- All images loading? YES / NO
- Console errors? YES / NO — [describe]

---

### Phase 2: Shopper (user11@example.com)

| Route | Loads | Dark Mode | Notes |
|-------|-------|-----------|-------|
| /shopper or /dashboard | ✅/⚠️/❌ | ✅/⚠️/❌ | |
| /shopper/profile | ✅/⚠️/❌ | ✅/⚠️/❌ | |
| /shopper/achievements | ✅/⚠️/❌ | ✅/⚠️/❌ | |
| /shopper/wishlists | ✅/⚠️/❌ | ✅/⚠️/❌ | Empty state copy appropriate? |
| /notifications | ✅/⚠️/❌ | ✅/⚠️/❌ | |
| /shopper/loyalty | ✅/⚠️/❌ | ✅/⚠️/❌ | |
| /shopper/collection | ✅/⚠️/❌ | ✅/⚠️/❌ | |

**Shopper Assessment:**
- Accessible after login? YES / NO
- Nav items visible (hamburger or top nav)? _____ items
- Dark mode readable? YES / PARTIAL / NO
- Specific dark mode issue (if any): [describe]
- Empty states have custom copy? YES / NO

---

### Phase 3: SIMPLE Organizer (user1@example.com)

| Route | Loads | Tier Gated Correctly | Notes |
|-------|-------|---------------------|-------|
| /organizer/dashboard | ✅/⚠️/❌ | N/A | |
| /organizer/items | ✅/⚠️/❌ | N/A | Rapidfire mode present? AI tags present? |
| /organizer/analytics | ✅/⚠️/❌ | ✅ BLOCKED | Upsell visible? |
| /organizer/batch-operations | ✅/⚠️/❌ | ✅ BLOCKED | Upsell visible? |
| /organizer/command-center | ✅/⚠️/❌ | ✅ BLOCKED | Upsell visible? |
| /organizer/brand-kit | ✅/⚠️/❌ | ✅ BLOCKED | Upsell visible? |
| /organizer/reputation | ✅/⚠️/❌ | N/A | |
| /organizer/payout | ✅/⚠️/❌ | N/A | |

**SIMPLE Organizer Dashboard:**
- Nav item count: _____
- Button count on main dashboard: _____
- Tier upsells present? YES / NO
- Upsell messaging on-brand and clear? YES / NEEDS WORK / NO
- Dashboard feels overwhelming? YES / NO / SOMEWHAT

**Create Sale Form:**
- Form accessible? YES / NO
- All fields present? YES / NO / PARTIAL
- Field count reasonable (< 15)? YES / NO

**Dark Mode — SIMPLE Dashboard:**
- Form inputs have visible borders? YES / NO
- Labels readable? YES / NO
- Status badges readable on dark cards? YES / NO
- Sidebar distinct from page background? YES / NO

---

### Phase 4: PRO Organizer (user2@example.com)

| Route | Accessible | Should Be Accessible | Status |
|-------|-----------|----------------------|--------|
| /organizer/dashboard | ✅/⚠️/❌ | YES | |
| /organizer/analytics | ✅/⚠️/❌ | YES | |
| /organizer/command-center | ✅/⚠️/❌ | YES | |
| /organizer/item-library | ✅/⚠️/❌ | YES | |
| /organizer/flip-report | ✅/⚠️/❌ | YES | |
| /organizer/batch-operations | ✅/⚠️/❌ | YES | |
| /organizer/workspace | ✅/⚠️/❌ | NO (should upsell TEAMS) | |

**PRO Assessment:**
- Nav item count: _____ (compare to SIMPLE: _____. Delta: _____ new items)
- All gated features unlocked? YES / NO
- TEAMS upsell present on /workspace? YES / NO
- Dark mode dashboard readable? YES / NO

---

### Phase 5: TEAMS Organizer (user3@example.com)

| Route | Accessible | Status |
|-------|-----------|--------|
| /organizer/workspace | ✅/⚠️/❌ | Should be fully accessible |
| Multi-user management UI | ✅/⚠️/❌ | Visible? |

**TEAMS Assessment:**
- Nav item count: _____ (compare to PRO: _____. Delta: _____ new items)
- Workspace fully functional? YES / NO
- Dark mode dashboard readable? YES / NO

---

### Phase 6: Dark Mode Deep Check

**Text Contrast Issues Found:**

| Location | Background Color | Text Color | Readable? | Issue |
|----------|-----------------|-----------|-----------|-------|
| Example: Dashboard hero | Dark slate | Amber-600 | NO | Amber too light, fails WCAG AA |
| [Add rows as found] | | | | |

**Dark Mode Rendering Issues:**
- [ ] Card backgrounds invisible/undefined
- [ ] Form input borders missing
- [ ] Shadows not visible
- [ ] Status badge colors hard to distinguish
- [ ] Button contrast insufficient

**List each issue:**
```
Issue 1: [Route] - [Component] - [Description]
Issue 2: [Route] - [Component] - [Description]
```

---

### Phase 7: Accessibility Spot Check

**Keyboard Navigation (Tab Through):**
- TAB key navigates all interactive elements? YES / NO
- Focus states visible (blue outline/highlight)? YES / NO
- Can tab to all buttons/inputs? YES / NO
- Can activate with ENTER/SPACE? YES / NO

**Icon-Only Buttons:**
- Found any? YES / NO
- Example: [Route] - [Button name]
- Have aria-labels? YES / NO

**Mobile Bottom Nav:**
- Icons labeled or icon-only? [Describe]
- Accessible in mobile view? YES / NO

---

### Phase 8: Console Errors & Network

**Console Errors Found:**
```
[Paste any red errors from F12 Console tab]
Error 1: [Message]
Error 2: [Message]
```

**Network Failures:**
- Any 404s for CSS/JS/images? YES / NO — [describe]
- Slow requests (>3s)? YES / NO — [describe]

---

## Critical Issues Found

**Issues that block the product or a tier:**

```
CRITICAL #1: [Title]
- Tier affected: [All / SIMPLE / PRO / TEAMS / Shoppers]
- Route: [e.g., /organizer/analytics]
- Description: [What's wrong]
- Reproduction: [Step-by-step]
- Impact: [Feature unusable / Data loss risk / Security issue / UX broken]

CRITICAL #2: ...
```

---

## High-Priority Issues

**Issues that degrade UX but don't block:**

```
HIGH #1: [Title]
- Route: [...]
- Description: [...]
- Impact: [...]

HIGH #2: ...
```

---

## Medium-Priority Issues

**Dark mode text contrast, minor UX problems:**

```
MEDIUM #1: [Title]
- Route: [...]
- Component: [...]
- Description: [...]

MEDIUM #2: ...
```

---

## Low-Priority Issues

**Typos, cosmetic issues:**

```
LOW #1: [Typo in /about page]
LOW #2: [Icon misalignment in footer]
```

---

## Roadmap Chrome Column Updates

Features verified as ✅WORKING in this session:

| Roadmap Row | Feature Name | Chrome Status (S220) | Notes |
|-------------|-------------|----------------------|-------|
| F001 | Dark Mode Toggle | ✅ Working | All pages support |
| F002 | Tier Gating (SIMPLE/PRO/TEAMS) | ✅ Working | Minor upsell UX issues |
| F003 | Shopper Dashboard | ✅ Working | Empty states good |
| F004 | Organizer Rapidfire Mode | ✅ Working | |
| [Add more] | | | |

---

## Session Notes

**Start Time:** [HH:MM]
**End Time:** [HH:MM]
**Total Duration:** [Minutes]
**Browser:** Chrome [Version]
**Device:** [Desktop / Laptop / iPad]
**OS:** [Windows / macOS / Linux]

**Tester Observations:**
[Anything notable about the product experience, beyond the checklist. Example: "The onboarding for new organizers is smooth but the tier upsell feels aggressive. Consider softening the messaging."]

---

## Sign-Off

- [ ] All critical issues documented
- [ ] All public pages tested
- [ ] All user tiers tested
- [ ] Dark mode tested
- [ ] Accessibility spot check completed
- [ ] Report submitted

**Report Filed By:** [Name]
**Date:** [YYYY-MM-DD]
**Status:** [DRAFT / FINAL]

---

*End of Chrome Live Audit Report*
