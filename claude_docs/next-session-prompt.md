# Next Session Resume Prompt
*Written: 2026-03-16T04:00:00Z*
*Session ended: normally*

## Resume From

Dispatch Phase 3/4/5 roadmap features in maximum parallel — fire as many subagents as possible simultaneously from the opening message.

## What Was Completed This Session (S186)

- Dark mode audit + sweep — all 13 user-facing pages complete
- Holds page P0 crash fixed (response envelope unwrap)
- Listing Factory button routing fixed (uses showSaleSelector state)
- POS / Print Inventory / Share tier gates corrected (restored to SIMPLE)
- CLAUDE.md §4 updated (Vercel=frontend, Railway=backend, no manual redeploy buttons)
- All changes deployed: Vercel current on commit 7cef97d ✅

## Environment Notes

- Frontend on Vercel, backend on Railway — both auto-deploy on push to main
- No pending Patrick actions blocking dev work
- CLAUDE.md has 1 local edit (§4 Deployments rule) — include in first push batch next session

## Parallel Dispatch Plan for Next Session

Fire ALL of these subagents simultaneously in the opening message. Each is independent.

### Immediate Dispatches (fire in parallel, opening message)

**1. findasale-dev → #7 Shopper Referral Rewards (Phase 3 — LAST REMAINING)**
- 1-2 sprints, FREE tier
- Referral tracking, rewards distribution, email notifications
- Schema: add `referralCode` to User, `referredBy` FK, `ReferralReward` table
- Backend: referral service + controller + route
- Frontend: referral dashboard widget, share link generator

**2. findasale-dev → #71 Organizer Reputation Score**
- 1.5 sprints, SIMPLE tier — foundational trust infrastructure
- Public score (1–5 stars) from: response time, sale frequency, photo quality (AI), shopper ratings, dispute rate
- "New Organizer" badge for cold-start
- Display on profile + every listing

**3. findasale-dev → #14 Real-Time Status Updates**
- 1 sprint, PRO tier
- Organizer mobile widget showing live sale status
- SMS/email alerts on key events (hold placed, item sold, sale ending soon)

**4. findasale-dev → #62 Digital Receipt + Returns**
- 1–2 sprints, FREE tier
- Auto-generate digital receipt with item photos + prices after every POS transaction
- Push to shopper's app profile
- Optional organizer-set return window (24h/48h/none)
- Pairs with existing POS infrastructure

**5. findasale-dev → #18 Post Performance Analytics**
- 1 sprint, PRO tier
- UTM tracking on social template downloads
- "Your Instagram post got 200 clicks" in organizer dashboard
- Lightweight — append UTM params to Listing Factory share links, track click-throughs

**6. findasale-dev → #42 Voice-to-Tag**
- 1 sprint, PRO tier
- Organizer speaks item description during Rapidfire → AI transcribes + extracts tags
- Web Speech API + existing AI pipeline
- Hands-free cataloging

**7. findasale-architect → Phase 4 architecture brief (items #25, #29, #31, #32)**
- #25 Organizer Item Library (Consignment Rack) — schema design for cross-sale item reuse
- #29 Shopper Loyalty Passport — gamification schema (stamps, badges, early-access perks)
- #31 Organizer Brand Kit — UI design for colors/logo expansion (schema already shipped S166)
- #32 Shopper Wishlist Alerts + Smart Follow — preference schema + push notification design
- Goal: get architecture decisions locked so dev can implement in the same session or next

**8. findasale-dev → #49 City Heat Index + #51 Sale Ripples (Phase 5 — quick wins)**
- #49: City-level "estate sale activity" score — weekly ranking. 1 sprint, FREE. SEO + content marketing magnet.
- #51: Smart notification "A sale just posted 2 miles from a sale you liked." 1 sprint, FREE. Drives spontaneous visits.
- Both are read-only aggregations on existing data — no schema changes needed

### After Architect Returns (second wave)

Once findasale-architect returns with the Phase 4 brief, dispatch:
- findasale-dev → #31 Organizer Brand Kit (PRO) — schema already in place from S166
- findasale-dev → #32 Shopper Wishlist Alerts (FREE) — push notification + preference storage
- findasale-dev → #25 Organizer Item Library (PRO) — cross-sale reuse

### QA Pass (after dev agents return)

Run findasale-qa on all new features before pushing. Batch QA dispatches in parallel — one QA agent per feature group.

## Push Strategy

All initial subagents return file changes to main context. Batch into ≤3-file MCP pushes or compile a single PS1 block for Patrick if total files exceed 25k tokens. Use findasale-push-coordinator skill if needed.

## Context Files to Load at Session Start

1. `claude_docs/STATE.md` — updated with S186 complete status
2. `claude_docs/strategy/roadmap.md` — Phase 3/4/5 feature list (source of truth for dispatch)
3. `claude_docs/next-session-prompt.md` — this file (dispatch plan)

## Exact Subagent Dispatch Prompt Template

Use this for each dev subagent:

> "You are the FindA.Sale Senior Developer. Project root: `/sessions/[SESSION]/mnt/FindaSale`. Read `claude_docs/STATE.md` and `claude_docs/strategy/roadmap.md` before starting. Implement feature #[N] — [name]. [Tier: X]. [1-line scope]. Return all new/modified file paths + diffs. Do NOT push to GitHub — main context will coordinate pushes."
