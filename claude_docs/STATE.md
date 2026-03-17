# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

**Sessions 192+193 COMPLETE (2026-03-17) — VERCEL BUILD RECOVERY: ALL S192 TYPESCRIPT ERRORS CLEARED:**
- **Root cause:** S192 shipped new frontend pages referencing non-existent modules, wrong auth patterns, and SSR-unsafe code
- **Errors fixed (8 MCP commits to main):**
  - `hooks/useAuth` does not exist → corrected to `components/AuthContext` across hubs/, challenges.tsx, hubs/[slug].tsx (S192), loot-log pages (S193)
  - `user.organizerId` does not exist → corrected to `user.id` in workspace.tsx
  - `UGCPhoto.sale`/`.item` missing → added optional relation types to useUGCPhotos.ts
  - NextAuth `useSession` used in shopper pages → replaced with app's `useAuth` in loot-log.tsx, [purchaseId].tsx
  - `AuthContextType.loading` → `isLoading` in trails.tsx
  - `EmptyState title/description/action` → correct props `heading/subtext/cta` in trails.tsx, [trailId].tsx, trail/[shareToken].tsx
  - SSR prerender crash (`router.push` at render time) → wrapped in `useEffect` + hooks moved before auth guard in 6 shopper pages: achievements, alerts, holds, purchases, receipts, disputes
  - S192 `Layout title` prop → removed, moved to `<Head>` in challenges.tsx
  - `{ Skeleton }` named import → default import in flip-report page
  - `ValuationWidget editingItem` undefined reference → removed block in add-items page
  - PasskeyController + simplewebauthn types + Uint8Array/BufferSource incompatibility
- **Vercel build status: READY ✅ (commit 0626821)**
- **Last Updated:** 2026-03-17 (sessions 192+193)

**Pending — Patrick action items (S193):**
- [ ] QA Wave 5 features Sprint 1 (6 features: #46 #52 #54 #60 #69 #71 — backend + migrations only)
- [ ] Implement Sprint 2 for each Wave 5 feature (frontend UI + user-facing flow)
- [ ] QA Waves 2–4 features (S187–S190, 30+ features awaiting QA pass before promotion to users)
- [ ] Open Stripe business account (test keys still in production — recurring)

---

**Session 191 COMPLETE (2026-03-17) — WAVE 5 BUILD: 6 NEW FEATURES SHIPPED (ALL SPRINT 1) + 5 NEON MIGRATIONS APPLIED:**
- **Features shipped:** #71 Organizer Reputation Score (SIMPLE), #60 Premium Tier Bundle (PRO), #52 Estate Sale Encyclopedia (FREE), #54 Crowdsourced Appraisal API (PAID_ADDON), #46 Treasure Typology Classifier (PRO), #69 Local-First Offline Mode (PRO) ✅
- **All 6 features Sprint 1 COMPLETE** — backend services, schema, controllers, routes, migrations
- **Neon migrations applied (5 total):** 20260317003100_add_organizer_reputation, 20260317110000_add_teams_onboarding_complete, 20260317100000_add_encyclopedia, 20260317120000_add_appraisals, 20260317_add_item_typology ✅
- **pnpm install + prisma generate clean** ✅
- **Schema fix:** Named @relation annotations for appraisal User fields (commit 307b979) ✅
- **Commits:** 7ebcfb5, 307b979 (Wave 5 build + schema fix) ✅
- **Last Updated:** 2026-03-17 (session 191)

**Pending — Patrick action items (S191):**
- [ ] QA Wave 5 features Sprint 1 (6 features: #46 #52 #54 #60 #69 #71 — backend + migrations only)
- [ ] Implement Sprint 2 for each Wave 5 feature (frontend UI + user-facing flow)
- [ ] QA Waves 2–4 features (S187–S190, 30+ features awaiting QA pass before promotion to users)
- [ ] Open Stripe business account (test keys still in production — recurring)