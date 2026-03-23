# Next Session Prompt — S247

**Date:** 2026-03-23 (S246 wrap complete)
**Status:** QA scan complete. Two hotfixes pushed (Vercel + Railway broken builds fixed). Profile buttons + message reply E2E still unresolved.

---

## FIRST TASK — Verify Vercel + Railway builds recovered

S246 pushed two hotfixes. Confirm both deployments are GREEN before any new work:
- **Vercel** (commit 8918a51): stray `>` removed from profile.tsx — should now build clean
- **Railway** (commit 7bf292e): `requireAdmin` middleware added to auth.ts — should now build clean

Check Vercel deployment status. If either is still erroring, fix it first.

---

## S247 Priority 1 — Patrick Clarification Needed

**Before QA continues, Patrick must answer:**

> **Profile page missing buttons:** The `/profile` page for user11 has no Edit Profile buttons for name/bio/photo in the header area. Is this a bug (they should be there) or by design (profile editing is on `/settings` instead)? QA agent confirmed the page loads but has no such buttons. This has been flagged 3 sessions in a row without resolution.

Once Patrick answers → dispatch `findasale-dev` to add them if needed, or close the issue.

---

## S247 Priority 2 — Message Reply E2E (D1 from S246)

Dispatch `findasale-qa` to complete message reply end-to-end verification:
- Login as `user2@example.com` (organizer) — go to `/messages`, click a conversation thread
- Send a reply. Verify S245 toast feedback fires.
- Login as `user11@example.com` (shopper) — verify reply appears in `/messages` inbox
- Both perspectives must pass. Do not mark verified until both sides confirmed.

Note: S246 QA agent couldn't click through conversation links. If this happens again, check if there's a routing bug vs. Chrome MCP limitation.

---

## S247 Priority 3 — Remaining QA Gaps

1. **B3 (Purchases tab)** — click through to `/shopper/dashboard#purchases`, verify content or empty state
2. **B4 (Pickups tab)** — click through to `/shopper/dashboard#pickups`, verify content or empty state
3. **Dark mode pass** — was deferred from S246. Run Chrome DevTools, toggle dark mode on dashboard, profile, messages, sale detail. Verify no white-on-white issues.
4. **L-002 (Mobile 375px)** — set Chrome DevTools to iPhone SE viewport, click through dashboard + sale detail + messages. Carry-forward from S244.

---

## Context Loading

- Read `claude_docs/brand/DECISIONS.md` at session start
- Test accounts: Shopper `user11@example.com`, PRO Organizer `user2@example.com`, SIMPLE+ADMIN `user1@example.com`, TEAMS `user3@example.com` (all `password123`)
- Auth rate limit is 50 failed attempts per 15 min
- S246 push is live: favorites Array.isArray fix, messages dark mode, profile dark mode, profile.tsx hotfix (stray >), auth.ts hotfix (requireAdmin)

---

## S246 Files Changed (for Patrick git tracking)

- `packages/frontend/pages/shopper/dashboard.tsx` — favorites Array.isArray fix
- `packages/frontend/pages/messages/index.tsx` — dark mode CSS cleanup
- `packages/frontend/pages/profile.tsx` — dark mode improvements + stray > hotfix
- `packages/backend/src/middleware/auth.ts` — added requireAdmin middleware
