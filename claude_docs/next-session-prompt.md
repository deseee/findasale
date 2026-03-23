# Next Session Prompt — S244

**Date:** 2026-03-22 (S243 wrap complete)
**Status:** C-001 CRITICAL BLOCKER RESOLVED. Item detail pages work. 6 audit fixes pushed. Seed script patched.

---

## S244 Priority

**1. MANDATORY — Post-fix live verification (CLAUDE.md §10):**
Before ANY new work, open finda.sale in Chrome MCP and verify:
- Item detail pages still load correctly (spot-check 2-3 items from different sales)
- LiveFeed on sale detail pages — no "Reconnecting..." text visible
- Reviews section on sale detail — dark mode background correct (not white)
- Message thread `/messages/[id]` — no footer visible in chat view
- About page — mission statement mentions all sale types

**2. Remaining S242 verifications (3 still pending):**
- Organizer settings → tooltips visible on hover across all tabs
- `/organizer/premium` → tier descriptions match `/pricing`, Enterprise CTA present
- `/plan` → no "estate sale"-only language

**3. Message reply live verification:**
Send message as organizer, reply as shopper, confirm both sides see it.

**4. Minor cleanup:**
- /cities and /neighborhoods meta descriptions still say "estate sales" — fix title tags
- L-002: Mobile viewport test via Chrome DevTools 375px

**5. Beta tester feedback:**
Beta testers evaluating this week. Prioritize reported issues over new feature work.

---

## Patrick Actions Before S244

1. **Push all changes** — run from PowerShell:
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/database/prisma/seed.ts claude_docs/STATE.md claude_docs/next-session-prompt.md claude_docs/session-log.md claude_docs/patrick-dashboard.md
git commit -m "S243: C-001 fix (seed draftStatus), session wrap docs"
.\push.ps1
```

Note: about.tsx was already pushed via MCP (commit bb298d6). H-001, H-002, M-001, M-002, M-003 fixes were also pushed via MCP during session. The seed.ts fix and wrap docs are the only local-only changes.

---

## Context Loading

- Read `claude_docs/brand/DECISIONS.md` at session start (mandatory)
- Test accounts: Shopper `user11@example.com`, PRO Organizer `user2@example.com`, SIMPLE+ADMIN `user1@example.com`, TEAMS `user3@example.com` (all `password123`)
- Auth rate limit is 50 failed attempts per 15 min
- Neon upgraded to Launch plan ($5/month) — no more CU-hour exhaustion risk
- QA skill v2 installed — Chrome MCP clickthrough-first methodology

---

## S243 Commits (for reference)

- 73d6676: Dockerfile cache-bust S243 (Railway rebuild)
- MCP pushes: LiveFeedTicker.tsx, ReviewsSection.tsx, premium.tsx, workspace.tsx, Layout.tsx, _app.tsx, about.tsx
- bb298d6: About page mission statement broadened
- Neon SQL: `UPDATE "Item" SET "draftStatus" = 'PUBLISHED' WHERE "draftStatus" = 'DRAFT'` (data fix, no code deploy needed)
- Local only: seed.ts `draftStatus: 'PUBLISHED'` fix + wrap docs
