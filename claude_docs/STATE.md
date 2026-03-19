# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

**Session 204 COMPLETE (2026-03-19) — MIGRATION APPLIED + SHOPPER NAV + ENCYCLOPEDIA SEED:**

**Migration Status:**
- All 3 stuck Neon migrations confirmed APPLIED: ugc_photos, fraud_signals, treasure_trail (2026-03-18/19)
- No blockers for future `migrate deploy` calls
- Patrick ran resolve commands successfully in S204

**Shopper desktop nav (Explore + Map links):**
- Layout.tsx updated: Explore + Map now show for shopper users (role USER/ADMIN) in desktop right nav, matching mobile BottomTabNav behavior
- TypeScript clean. Pushed: commit f40ba6e

**Encyclopedia seed data (15 published entries):**
- Added to `packages/backend/seed.ts`: Depression Glass, MCM Furniture, Victorian Antiques, Vintage Clothing, Art Deco, Tools, Pottery, Americana, Vinyl Records, Jewelry, Books, Estate Sale Shopping 101, Lighting, Rugs
- Achievements and Challenges auto-populated by their services (included in seed)
- Moved encyclopedia block after users creation to fix TS2448 (block-scoped variable used before declaration)
- Pushed: commits cdf1c60 + pending P2003 fix

**Seed.ts P2003 fix (pending Patrick push):**
- Added PointsTransaction + EncyclopediaEntry to cleanup section
- Reordered deletions for FK constraint compliance (Achievement → Appraisal → PointsTransaction → EncyclopediaEntry → Sale/User)
- Awaiting Patrick push to verify seed runs cleanly

**DB test accounts (Neon production — current):**
- `user1@example.com` / `password123` → ORGANIZER, SIMPLE tier (Giselle Brown)
- `user2@example.com` / `password123` → ORGANIZER, PRO tier (Lena Freeman)
- `user3@example.com` / `password123` → ORGANIZER, TEAMS tier (Aaron Wells)
- `user11@example.com` / `password123` → Shopper (Zoe Gonzalez)

---

**Next up (S205):**
- [ ] Confirm Patrick P2003 fix push and seed cleanly
- [ ] #65 Progressive Disclosure spec clarification (no feature file found — dispatch for spec review)
- [ ] Patrick E2E testing pass (guide at `claude_docs/testing-guides/patrick-e2e-guide-2026-03-19.md`)
- [ ] P2 UX fixes (mobile dashboard simplification, Manage Sales dropdown, tier/rewards card repositioning)
- [ ] Wave 5 Sprint 3 work (AI Appraisal async, remaining Sprint 3 features)

---

**Session 202 COMPLETE (2026-03-18) — CHROME VERIFICATION + DB ACCOUNTS + UX + A11Y AUDIT REPORTS:**
- 50+ routes verified across all user types. 1 confirmed 404 fixed: /organizer/neighborhoods → /neighborhoods.
- Neon test accounts established for all 4 user types. JWT + tier payload verified.
- 7 TypeScript errors fixed. Vercel build unblocked. 13 routes now deploy correctly.
- P0 UX restructure: drawer grouping, dashboard sections, Plan a Sale gated to organizers.
- §13 Schema-First Pre-Flight Gate added to CLAUDE.md (permanent, binding on all dev subagents).
- 3 audit reports filed: ux-audit, design-critique, accessibility-audit (claude_docs/audits/).
- Last Updated: 2026-03-18 (sessions 202+203)

---

**Sessions 191–199 COMPLETE (2026-03-17–18):**
- Wave 5 Sprint 1 (6 features) + Sprint 2 frontends shipped. All Neon migrations applied.
- Passkey P0 fix (S196+S197) — QA confirmed READY. Rate limiting added.
- Full docs audit + archive reorganization (134 files re-filed). Roadmap v55.
- Vercel + Railway GREEN throughout.
- Full history: session-log.md + git log.

---

**Sessions 186–195 COMPLETE (2026-03-13–17):**
- Wave 2–4 QA sprints, 29 features audited. Vercel build recovered (8 TS errors fixed).
- Bugs: login redirect loop, Google Fonts CSP, dark mode, ThemeToggle visibility, service worker image loading, CityHeatBanner coordinates.
- Full history: session-log.md + git log.
