# S186 Next Session Prompt

## Priority: Dark Mode Audit — Chrome Browser Review

Patrick wants to use Claude in Chrome to audit finda.sale for dark mode issues. Known problem areas:
- Header (logo, nav, buttons rendering incorrectly in dark mode)
- Organizer dashboard (cards, stats, tier widget)
- Any other pages with dark mode inconsistencies

### Approach
Use Claude in Chrome (browser automation) to navigate the live site at finda.sale, toggle dark mode, and systematically audit each page for visual issues. Capture screenshots. Generate a defect list with page, component, and issue description for the dev agent to fix.

### Context
- Site: https://finda.sale
- Dark mode toggle: likely in user settings or system preference detection
- Focus on organizer-facing pages first (dashboard, sales list, item management)
- The header has known issues

### Session Start Checklist
- [ ] Load context.md and STATE.md
- [ ] Check Railway and Vercel status (S185 had a P2022 incident — confirm clean)
- [ ] Confirm P0-1 tokenVersion is working (organizer login, tier display correct)
- [ ] Then proceed to dark mode audit

## Completed in S185 (do not re-do)
- #70 Live Sale Feed: SHIPPED
- P0-1 tokenVersion: SHIPPED + migration applied to Neon
- #68 Command Center: QA PASS
- CLAUDE.md §6 Schema Change Protocol: added with Neon URL
- P2022 incident: resolved (tokenVersion column now in Neon)
