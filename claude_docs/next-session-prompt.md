# Next Session Prompt — S242

**Date:** 2026-03-22 (S241 wrap complete)
**Status:** D-007 implementation code complete, pending Patrick's Neon migration. H-001 and H-003 live-verified fixed.

---

## S242 Priority

**1. Patrick Manual Actions — BLOCKING (do first):**
```powershell
# Push schema.prisma to GitHub (too large for MCP)
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/database/prisma/schema.prisma
git commit -m "D-007: Add isEnterpriseAccount flag to Organizer model"
.\push.ps1

# Migrate Neon production database
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://neondb_owner:npg_VYBnJs8Gt3bf@ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"
npx prisma migrate deploy
npx prisma generate

# Regenerate in backend package
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\backend
npx prisma generate
```
After these commands, Railway backend auto-redeploys (GitHub push), then verify D-007 works by attempting to add 13th member to a TEAMS org.

**2. Live-verify S240 + S241 fixes (Chrome MCP — COMPREHENSIVE):**
MUST complete all 4 verification paths before new work starts:
- Item pages: click any item from a sale → should load item detail, not "Item not found" ✅ VERIFIED S241
- `/settings` logged out: should redirect to `/login?redirect=/settings`, not hang ✅ VERIFIED S241 (H-002 redirect path)
- `/notifications` logged out: should show single layout, no DOM duplication ✅ VERIFIED S241
- `/hubs`, `/categories`, `/calendar`, `/cities`, `/neighborhoods`: should no longer say "estate sales" only → NOT YET VERIFIED (was in progress, D-007 took priority)
- D-007 member cap: attempt to add 13th member to `user3@example.com` (TEAMS org) → should fail with enterprise upgrade CTA

**3. Mobile real-device test (L-002 carry-forward):**
Browser automation cannot simulate mobile viewport. Patrick should spot-check on real iPhone SE or similar:
- Homepage, sale detail, item grid, nav/bottom tab, pricing page

---

## Context Loading

- Test accounts: Shopper `user11@example.com`, PRO Organizer `user2@example.com`, SIMPLE+ADMIN `user1@example.com`, TEAMS `user3@example.com` (all `password123`)
- Read `claude_docs/brand/DECISIONS.md` at session start (mandatory)
- D-007 now implemented — enterprise flag + backend cap + UI updates all pushed. Only Patrick's migration actions pending.
- S241 verified H-001 and H-003 fixes working live; S242 should complete the D-001 brand sweep verification (4 pages) if not done in S241

---

## Commits This Session (S241)

- d1da44c: H-001 fix (itemController.ts getItemById status check)
- ad47033: H-003 fix (notifications.tsx Layout wrapper removed)
- f560b80: D-007 schema migration + workspaceController member cap enforcement
- cde5227: D-007 pricing.tsx + workspace.tsx UI updates
