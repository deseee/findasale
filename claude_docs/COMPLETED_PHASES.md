# Completed Phases Archive

This file stores archived "Next Session" planning blocks and push instructions from completed sessions. Refer to these for historical context, but do not act on them — they are from past sessions.

---

## Archived Session Wrap: S351 (2026-03-29)

### S351 Priority 1: Push S350 files (Patrick action first)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/strategy/roadmap.md
git add "claude_docs/ux-spotchecks/dashboard-redesign-brief-s350.md"
git add "claude_docs/ux-spotchecks/organizer-guidance-spec-s350.md"
git add "claude_docs/ux-spotchecks/photo-capture-protocol-s350.md"
git commit -m "S350: dashboard redesign brief, organizer guidance layer, photo capture protocol, roadmap #222-224"
.\push.ps1
```

### S351 Priority 2: Dev Dispatch — Dashboard Redesign (THE MAIN WORK)

Dispatch `findasale-dev` against `dashboard-redesign-brief-s350.md`. Three focused agents:
- **Agent A:** Organizer dashboard — state-aware layout (all 3 states), Sale Status Widget, Next Action Zone, Quick Stats Grid, tier progress compact, revenue/cash fee alert, selling tools grid
- **Agent B:** Shopper dashboard — state-aware header, Rank Unlock Pathway card, Hunt Pass badge/upsell, Streak Tracker, pending payments priority zone, collections/upcoming/recently-viewed sections
- **Agent C:** Organizer guidance layer — tooltip/explainer implementation from `organizer-guidance-spec-s350.md`, onboarding modal (3 screens, localStorage gate), rank-as-buyer-intelligence badges on holds panel

Pre-dispatch: confirm schema fields (`guildXp`, `explorerRank`, `UserStreak.currentStreak`, `reputationTier`) — use `findasale-architect` if any are missing. ExplorerProfile schema decision still pending — Dev must either wire real data or note TODO clearly.

### S351 Priority 3: Hold-to-Pay QA (carried from S349/S350)
Full E2E: organizer marks sold on held item → modal → invoice sent → shopper gets ClaimCard → Stripe link → payment → SOLD + XP. Test: user12 (shopper), user6/Family Collection Sale 16 (organizer). Verify STRIPE_WEBHOOK_SECRET in Railway env vars first.

### S351 Priority 4: Chrome QA backlog
S344 pending: #174+#80, #184, #41, #7, #89, #62, #37, #149.
S346 pending: #48, #13, #157, #46, #199, #177, #58, #29.
S347 pending: #212, #213, #131, #60, #123, #153.

### S351 Notes
- Specs locked — do NOT redesign. Dispatch dev directly against dashboard-redesign-brief-s350.md
- ExplorerProfile schema (Architect decision) still pending — Rank/XP widget uses placeholder data until resolved
- Sage threshold is 2500 XP (beta only, revert post-beta)
- Shopper profiles migration 20260330_add_shopper_profile_fields must be deployed to Railway if not done
- claude_docs/DASHBOARD_CONTENT_SPEC.md is a misplaced file at root (should be in ux-spotchecks/). Superseded by dashboard-redesign-brief-s350.md. Flag for Records cleanup.

### Patrick Actions Before S351
1. Push S350 files (block above)
2. Check STRIPE_WEBHOOK_SECRET in Railway env vars (Hold-to-Pay QA)

---

### S347 Complete Push Block (13 files)
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/strategy/roadmap.md
git add packages/backend/src/controllers/leaderboardController.ts
git add packages/frontend/pages/leaderboard.tsx
git add packages/frontend/pages/shopper/dashboard.tsx
git add packages/frontend/components/SharePromoteModal.tsx
git add packages/frontend/pages/organizer/pricing.tsx
git add packages/frontend/pages/shopper/loyalty.tsx
git add packages/frontend/components/Layout.tsx
git add packages/frontend/pages/organizer/settings.tsx
git add packages/frontend/components/RarityBoostModal.tsx
git add packages/frontend/hooks/useXpSink.ts
git commit -m "S347: leaderboard badges, Hunt Pass CTA, share templates, tier pricing, Guild UX, org profile, rarity boost UI, roadmap sync"
.\push.ps1
```

### S342 Priority 3: Remaining QA queue
- Bug 4: Buy Now success card persist (needs Stripe test mode)
- Bug 5: Reviews aggregate count (needs seeded reviews)
- Decision #8: Share button native share sheet (needs mobile viewport)

### S342 Notes
- Hold-to-Pay is code-complete but unverified in browser — QA is P1
- Webhook STRIPE_WEBHOOK_SECRET must be configured for hold invoice payments to process — verify in Railway env vars
- Mark Sold → POS/Invoice architect spec still relevant for future POS path (Phase 4+)
