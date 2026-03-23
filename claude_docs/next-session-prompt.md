# Next Session Prompt — S244

**Date:** 2026-03-22 (S242 wrap complete — second half)
**Status:** 13 UX bug fixes pushed. QA skill v2 installed. Live verification pending.

---

## S243/S244 Priority

**1. MANDATORY — Live Chrome clickthrough verification of S242 fixes:**
Before ANY new work, open finda.sale in Chrome MCP and verify each of these:
- `/shopper/dashboard#favorites` → lands on Favorites tab (not My Dashboard)
- Item detail page → "Save" button works (adds to favorites, not wishlist/404)
- `/pricing` as signed-in organizer → no "Create Free Account" CTA visible
- `/about` → no blank space below Contact Us section
- `/organizer/premium` → tier descriptions match `/pricing`, Enterprise CTA present
- `/plan` → no "estate sale"-only language
- `/map` → "Plan Your Route" button visible in header, scrolls to RouteBuilder
- Organizer settings → tooltips visible on hover across all tabs
- Inspiration page → broken images show fallback (icon + "Image unavailable")
This is per CLAUDE.md §10 post-fix live verification rule. Non-negotiable.

**2. Heatmap functionality check:**
Map heatmap was flagged — "exists but needs data." Investigate whether this is a data issue or code issue.

**3. Message reply verification:**
Dev agent reported reply already works. Verify live: send message as organizer, reply as shopper, confirm both sides see it.

**4. Minor cleanup:**
- /cities and /neighborhoods meta descriptions still say "estate sales" — fix title tags
- Trending page data quality — broken images are seed data, not code

**5. L-002 mobile test (updated):**
Patrick doesn't have an iPhone. Options: (a) Chrome DevTools 375px viewport test, (b) close L-002.

**6. Beta tester feedback:**
Beta testers evaluating this week. Prioritize reported issues over new feature work.

---

## Context Loading

- Read `claude_docs/brand/DECISIONS.md` at session start (mandatory)
- Test accounts: Shopper `user11@example.com`, PRO Organizer `user2@example.com`, SIMPLE+ADMIN `user1@example.com`, TEAMS `user3@example.com` (all `password123`)
- Auth rate limit is now 50 failed attempts per 15 min
- QA skill v2 installed — Chrome MCP clickthrough-first methodology

---

## S242 Commits (for reference)

- b07f162: /cities + /neighborhoods title tags + Layout duplication fix + auth rate limit 20→50
- 32c3ae8: Shopper dashboard #favorites hash routing + item likes rewired + pricing CTA hidden for signed-in
- d9eb70d: About blank space fix + /organizer/premium sync + /plan brand broadening
- dd9443b: Map "Plan Your Route" button + organizer settings tooltips + InspirationGrid image fallback
- (wrap) S242 STATE.md + session-log + next-session-prompt + patrick-dashboard
