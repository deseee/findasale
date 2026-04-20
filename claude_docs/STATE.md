# PROJECT STATE

This document is the active state anchor for FindA.Sale, a two-sided marketplace connecting organizers (selling items) with shoppers. The project spans backend (Node.js/Prisma/PostgreSQL on Railway), frontend (Next.js on Vercel), and mobile (React Native, future).

## Current Status

**Latest work (S521):** Fixed Vercel build errors in promote page by removing undefined `<Skeleton>` component references and replacing with Tailwind-based animate-pulse divs.

**Major features shipped (S520):** Shop Mode full implementation (auto-renewing sales, private items, organizer controls), Share & Promote modal overhaul (9-tab social generator), Store hours for organizer profiles, and TEAMS pricing updates.

**Active priorities:**
- Photo station page build (`/sales/[id]/photo-station.tsx`) — P1, blocked on Stripe test env vars
- Checklist test flows QA — POS/online/auction/in-app payment validation
- Label Sheet Composer + Print Kit refinement
- Morning Briefing workspace integration (day-of-sale view)

## Schema & Infrastructure

**Key models:** Sale, Item, User, Organizer, WorkspaceRole, SaleAssignment, PrepTask, ShopMode, FeatureFlag, ReferralFraudSignal

**Active jobs:** shopAutoRenewJob (daily 1AM UTC), referralRewardAgeGateJob (daily), auctionJob, ebayEndedListingsSyncCron, challengeService

**Pending migrations:** None (all current Railway migrations applied)

**Environment requirements:** STRIPE_TEST_SECRET_KEY, NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY (needed for S513 checklist test QA)

## Known Issues & Debt

- **Legendary chip dismissal (P2):** Chip renders but doesn't visually dismiss after click; backend accepts isLegendary flag
- **Sale Pulse vs Ripples views count (P2, unverified):** Ripples page was broken in S516 QA; fix shipped; needs re-verification with active sale
- **Efficiency Coach label (P3):** "Top 100%" inverted percentile formula — fixed in S518 but not yet deployed
- **RankUpModal trigger (P2, fixed S495):** Modal required localStorage rank-diff watcher; now wired
- **Photo station (P1):** `/sales/[id]/photo-station.tsx` page design exists; backend scan endpoint not yet wired; requires `/sales/:saleId/photo-ops/photo-station-scan` POST route
- **eBay settings Weight tier oz inputs (fixed S483):** Changed from spinner type="number" to type="text"

## QA Backlog

**Hot fixes needed (before S513):**
- Set STRIPE_TEST_SECRET_KEY + NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY on Railway/Vercel
- Test POS transaction auto-check on checklist
- Verify online/auction checkout session creation + redirect
- Verify in-app payment modal Stripe Elements form

**Unverified after fix (S518+):**
- Efficiency Coach label render (awaiting Patrick push)
- Sale Pulse views count (Ripples fix deployed; needs active sale re-test)
- eBay ended-sync end-to-end (code-verified only)

**Blocked/Deferred:**
- HypeMeter widget (needs team shopper test data)
- RankUpModal dark mode (can't trigger rank artificially)
- Workspace × Sale Command integration (design prompt pending Claude Design tool output)

## File Organization

**Backend controllers:** `packages/backend/src/controllers/` — saleController, itemController, authController, stripeController, ebayController, checklistController, labelComposerController, shopAutoRenewJob

**Frontend pages:** `packages/frontend/pages/organizer/` (seller flows), `pages/shopper/` (buyer flows), `pages/admin/` (platform tools)

**Shared types:** `packages/backend/src/types/`, `packages/frontend/types/`

**Database:** `packages/database/prisma/schema.prisma`, migrations in `migrations/` folder

## Next Immediate Actions (S522+)

1. **Patrick setup:** Enable Stripe test keys on both platforms
2. **Photo station page:** Build `/sales/[id]/photo-station.tsx` + backend scan endpoint
3. **Checklist QA:** Test all 4 test flows (POS/online/auction/in-app)
4. **Workspace × Sale integration:** Wait for Claude Design UX spec, then dispatch dev
5. **XP economy verification:** Hunt Pass rates match S500 locked decisions (3/5/15 XP values)

## Historical Reference

Completed phases documented in `claude_docs/COMPLETED_PHASES.md`. Advisory board decisions in `claude_docs/feature-notes/`. Roadmap maintained at `claude_docs/strategy/roadmap.md` (currently v112). Operations checklist: `claude_docs/operations/qa-backlog.md`, `claude_docs/operations/cost-protection-playbook.md`.
