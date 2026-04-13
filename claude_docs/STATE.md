# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Current Work

**S449 COMPLETE (2026-04-13):** Rank staleness P0, Scout Reveal P1, Dashboard UX brief + Rank Perks spec (P2), haul post test data (P3), organizer discount badge (P4). JWT rank sync live.

**S449 What shipped:**
- **P0 — Rank staleness fix:** `dashboard.tsx` thresholds corrected (0/500/2000/5000/12000). JWT now carries `explorerRank`. All 5 XP endpoints return `newRank + rankChanged`. `AuthContext.updateUser()` propagates rank change to nav instantly — no re-login required. Sitewide rank name audit run.
- **P1 — Scout Reveal flesh-out:** `xpController.ts` now queries `Favorite` model and returns `interestedUsers: [{ displayName, avatarUrl, savedAt }]` (max 20). `items/[id].tsx` renders "Scout Reveal Results" panel with user list + empty state ("you may have the edge!").
- **P2 — Dashboard creative brief:** `claude_docs/feature-notes/shopper-dashboard-creative-brief-P2-rank-tiers.md` — per-rank tone, card prioritization, perks communication strategy, mobile-first patterns, zero state design.
- **P2 — Rank perks spec:** `claude_docs/feature-specs/EXPLORER_GUILD_RANK_PERKS_SPEC.md` — full perks table (Initiate through Grandmaster), rank-up moment design, retroactive stacking, non-perks rationale.
- **P3 — Haul post test data:** 3 approved haul posts seeded for Alice (user11@example.com) in Railway DB directly via psycopg2 (IDs: 2, 3, 4).
- **P4 — Organizer discount badge:** `itemController.ts` + `saleController.ts` return `organizerDiscountAmount/Xp`. `items/[id].tsx` shows sage-green pill badge ("Organizer Special: $X off — spend Y XP"). `sales/[id].tsx` shows subtle "Special: $X off" pill on item cards.

**S449 Files changed (10):**
- `packages/backend/src/controllers/authController.ts` — explorerRank in JWT (all 4 auth flows)
- `packages/backend/src/controllers/xpController.ts` — Scout Reveal returns interestedUsers + all 5 XP endpoints return newRank/rankChanged
- `packages/backend/src/controllers/itemController.ts` — discount fields in getItemById + getItemsBySaleId
- `packages/backend/src/controllers/saleController.ts` — discount fields in getSale items
- `packages/frontend/pages/shopper/dashboard.tsx` — rank thresholds corrected
- `packages/frontend/pages/items/[id].tsx` — Scout Reveal results panel + discount badge + JWT updateUser
- `packages/frontend/pages/sales/[id].tsx` — discount badge on item cards
- `packages/frontend/pages/shopper/haul-posts.tsx` — updateUser on bump post + haul unboxing success
- `packages/frontend/components/AuthContext.tsx` — explorerRank + updateUser()
- `packages/frontend/hooks/useXpSink.ts` — updateUser calls on XP sink success

**S449 ⚠️ Blocked/Unverified Queue (carry forward from S448):**

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| Bump Post 10 XP flow | Test data now exists (haul post IDs 2-4 for Alice) | QA: login as Alice, bump a post, verify 10 XP deducted + bumpedUntil set | S448 → S449 |
| Haul Unboxing Animation 2 XP | Test data now exists | QA: login as Alice, unlock animation on haul post, verify 2 XP deducted | S448 → S449 |
| MyTeamsCard happy path | No workspace member test user | Invite Alice to a workspace, accept, reload dashboard | S448 |
| Scout Reveal results (post-deploy) | Needs deploy + QA | Navigate to item page, spend 5 XP, verify interestedUsers panel renders | S449 |
| Rank sync live (post-deploy) | Needs deploy + QA | Earn XP, verify nav rank updates without re-login | S449 |

**S449 Patrick manual actions (before QA):**
1. Run S447 pending migrations on Railway (if not done): `20260413_xp_expiry_system` + `20260413_early_access_cache`
2. Push the S449 push block above — then Railway + Vercel auto-deploy
3. Add `charge.dispute.created` to Stripe Dashboard → Webhooks (if not done)

**S448 COMPLETE (2026-04-13):** QA audit of S446/S447 shipped features. Scout Reveal bug identified. Rank naming locked. One file fix shipped.

**S448 What happened:**
- **Scout Reveal P1 bug identified:** Backend only returns `{ success: true, remainingXp }` — never queries or returns interest data. XP is spent, toast fires, but nothing is revealed to the user. Feature is a hollow stub. Frontend calls `refetchItem()` on success but item page has no panel to display revealed data. Full flesh-out needed: backend must query item saves/favorites and return them; frontend must render a "revealed" section.
- **Rank naming LOCKED by Patrick:** Initiate → Scout → Ranger → Sage → Grandmaster. Prior session dropped "Initiate" as base tier — that was the error. Ranger was always correct (confirmed in decisions-log). This decision unlocks rank staleness P0 fix.
- **explorer-passport.tsx fix shipped:** Line 283 "Save Passport" → "Save Profile" (1-line fix, S447 copy miss).
- **Stripe sandbox action:** COMPLETED (confirmed by Patrick).
- **QA verified (S447 output):** AvatarDropdown EXPLORE section has correct links (Explorer Profile, Haul Posts, Early Access Cache). Explorer's Guild title ✅. Early Access Cache page loads with 8 categories ✅. /join invalid token handled gracefully ✅. Edit-item has Organizer Special section ✅.
- **Bump Post + Haul Unboxing:** UNVERIFIED — no haul post test data in DB. Queued for next session.
- **MyTeamsCard happy path:** UNVERIFIED — no workspace member test user available.

**S448 Files changed (1):**
- `packages/frontend/pages/shopper/explorer-passport.tsx` — "Save Passport" → "Save Profile" line 283

**S448 ⚠️ Blocked/Unverified Queue:**

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| Bump Post 10 XP flow | No haul posts in test DB | Create haul post as Alice, then test bump | S448 |
| Haul Unboxing Animation 2 XP | No haul posts in test DB | Same as above | S448 |
| MyTeamsCard happy path | No workspace member test user | Invite Alice to a workspace, accept, reload dashboard | S448 |
| Organizer discount badge (public) | Not yet built | Dev dispatch — show "Organizer Special: $X off" on sale/item pages | S448 |

**S446 COMPLETE (2026-04-13):** XP frontend implementation + workspace magic link invite flow + WorkspaceMember schema properly fixed.

**S446 What shipped:**
- **P1 — markHuntPassCancellation wired:** `stripeController.ts` — `customer.subscription.deleted` handler calls `markHuntPassCancellation(organizer.user.id)`. P0-C exploit gate fully closed.
- **P2+P3 — XP display values updated (6 files):** All hardcoded XP earning rates and coupon tiers updated to locked D-XP-001/D-XP-004 decisions across hunt-pass.tsx, shopper/dashboard.tsx, faq.tsx, loyalty.tsx, referral-dashboard.tsx, sales/[id].tsx.
- **P4 — Micro-sinks UI:** Scout Reveal (5 XP), Haul Unboxing Animation (2 XP), Bump Post (10 XP). Schema fields on UGCPhoto, 3 backend endpoints, frontend buttons + modals. Migration: `20260413_add_micro_sinks`.
- **P5 — Organizer-funded discounts:** 200/400/500 XP = $2/$4/$5 off one item. Backend POST/DELETE endpoints, no-stacking in `createPaymentIntent()`, frontend section in edit-item. Migration: `20260413_add_organizer_discount_fields`.
- **Workspace magic link invite flow:** New `WorkspaceInvite` model (email + token, 7-day expiry). Invite creates a `WorkspaceInvite` row + sends Resend email with `finda.sale/join?token=<uuid>`. New `/join` page handles logged-in (accept button) and new users (signup/login links). Post-accept redirects to dashboard with welcome banner. `MyTeamsCard` component on both organizer and shopper dashboards. `useMyWorkspaceMemberships` hook. Migration: `20260413_workspace_magic_link_invite`.
- **WorkspaceMember schema properly fixed:** `organizerId String?` (nullable), `userId String?` added. Shoppers and new users join workspaces via userId — no ghost organizer accounts. `workspaceAuth.ts` middleware and all membership queries updated to OR [organizerId, userId]. Migration: `20260413_workspace_member_user_id`.
- **workspace/[slug].tsx type fixes:** `WorkspaceInternal` interface now matches actual API response shape (`ownerUserId`, `ownerName`, `description` flat fields). `isOwner` check fixed.
- **All migrations applied to Railway ✅**

**S446 ⚠️ Flagged — Bump Post feed sorting not implemented:** `bumpedUntil` written to DB correctly but haul posts feed doesn't sort by it. Feature functional (data persists, 10 XP deducted) but bump visibility won't work until feed query updated. Needs Architect sign-off before dev dispatch.

**S446 Files changed (27):**
- `packages/backend/src/controllers/stripeController.ts` — P1 + P5 no-stacking
- `packages/frontend/pages/shopper/hunt-pass.tsx` — P2+P3
- `packages/frontend/pages/shopper/dashboard.tsx` — P2+P3 + MyTeamsCard
- `packages/frontend/pages/faq.tsx` — P2+P3
- `packages/frontend/pages/shopper/loyalty.tsx` — P2+P3
- `packages/frontend/pages/referral-dashboard.tsx` — P2+P3
- `packages/frontend/pages/sales/[id].tsx` — P2+P3
- `packages/database/prisma/schema.prisma` — P4 + P5 + WorkspaceInvite + WorkspaceMember userId
- `packages/database/prisma/migrations/20260413_add_micro_sinks/migration.sql` — NEW ✅
- `packages/backend/src/controllers/xpController.ts` — P4
- `packages/frontend/pages/items/[id].tsx` — P4
- `packages/frontend/pages/shopper/haul-posts.tsx` — P4
- `packages/database/prisma/migrations/20260413_add_organizer_discount_fields/migration.sql` — NEW ✅
- `packages/backend/src/controllers/itemController.ts` — P5
- `packages/backend/src/routes/items.ts` — P5
- `packages/backend/src/controllers/workspaceController.ts` — magic link endpoints + OR membership queries
- `packages/backend/src/routes/workspace.ts` — magic link routes
- `packages/frontend/pages/join.tsx` — NEW: magic link landing page
- `packages/frontend/pages/register.tsx` — inviteToken post-signup handling
- `packages/frontend/pages/login.tsx` — inviteToken post-login handling
- `packages/frontend/hooks/useWorkspace.ts` — useMyWorkspaceMemberships hook
- `packages/frontend/components/MyTeamsCard.tsx` — NEW
- `packages/frontend/pages/organizer/dashboard.tsx` — MyTeamsCard + welcome banner
- `packages/database/prisma/migrations/20260413_workspace_magic_link_invite/migration.sql` — NEW ✅
- `packages/database/prisma/migrations/20260413_workspace_member_user_id/migration.sql` — NEW ✅
- `packages/backend/src/middleware/workspaceAuth.ts` — OR [organizerId, userId] lookup
- `packages/frontend/pages/workspace/[slug].tsx` — WorkspaceInternal type fix + isOwner fix

**S447 COMPLETE (2026-04-13):** Explore session — researched /shopper/settings, /organizer/settings, /shopper/loyalty, /shopper/dashboard, /shopper/explorer-passport. Reviewed D-XP-001 through D-XP-006 locked decisions. Verified S446 completion. Identified and scoped all remaining XP economy gaps and security P0s. Named system locked: Explorer Profile (hunting prefs), Explorer's Guild (gamification), Hunt Pass (paid tier).

**S447 findings — Dispatch in S448:**

**🔴 Security P0s (from Hacker audit — not yet implemented):**
- ❌ Appraisal cartel cap — 5/day hard platform cap on appraisal selections per user
- ❌ Chargeback farming fix — 72h XP settlement hold before crediting + `charge.dispute.created` Stripe webhook for XP clawback
- ❌ Referral fraud gate — 24h payment-cleared hold + valid email+phone on friend account (D-XP-004 spec)
- ❌ Device fingerprinting — foundational fraud gate (Architect spec needed first)

**🟡 XP economy gaps (D-XP decisions locked but not yet implemented):**
- ❌ XP expiry D-XP-002 — schema `expiresAt` field on UserXP/GuildXP, 365-day nightly cron, 300/350-day in-app warnings, Grandmaster exemption (5,000 total earned)
- ❌ Cosmetic sink repricing D-XP-005 — UI only: 1,000 XP username color, 2,500 XP frame badge, 250/350/500 XP profile slots (Bronze/Silver/Gold)
- ❌ Hunt Pass extra coupon slot — 3x/month per tier for HP users vs 2x standard (D-XP-001)
- ❌ Coupon backend enforcement — server-side monthly redemption limits (2x standard, 3x HP, 1x Tier 3 all users)

**🔵 Product gaps:**
- ❌ Lucky Roll → Guaranteed Value Cache replacement — Game Designer spec needed first, then Dev
- ❌ Bump Post feed sort — `bumpedUntil DESC NULLS LAST` in haul posts feed query (Architect spec needed first per S446 flag)
- ❌ Nav naming rename — "Loyalty Passport" → "Explorer's Guild", "Explorer Passport" → "Explorer Profile" in Layout.tsx, AvatarDropdown.tsx, loyalty.tsx page title, explorer-passport page title

**S447 Batch 1 COMPLETE:**

1. ✅ **Architect — Bump Post sort spec:** `orderBy: [{ bumpedUntil: 'desc' }, { likesCount: 'desc' }, { createdAt: 'desc' }]` in haulPostController.ts lines 17 + 77. No migration needed.
2. ✅ **Dev A — Appraisal cartel cap SHIPPED:** appraisalService.ts counts pointsTransaction APPRAISAL_SELECTED per user per UTC day, hard-caps at 5. No migration.
3. ✅ **Dev B — Chargeback farming ALREADY DONE:** 72h hold + dispute webhook + XP clawback already implemented in prior sessions. Patrick manual action: enable `charge.dispute.created` event in Stripe Dashboard → Webhooks.
4. ✅ **Dev C — Nav naming SHIPPED:** 7 files, 15 text updates. Explorer Profile / Explorer's Guild live across Layout, AvatarDropdown, loyalty.tsx, explorer-passport.tsx, LoyaltyPassport, league, loot-legend.
5. ✅ **Dev D — XP expiry D-XP-002 SHIPPED:** 5 fields on User model. Migration 20260413_xp_expiry_system. xpService.ts updated. New cron jobs/xpExpiryCron.ts (02:00 UTC). Patrick migration action required.
6. ✅ **Game Designer — Early Access Cache spec:** Replaces Lucky Roll. 100 XP → 48h early access to chosen category's new items. 8 categories, 1x/week. Models: EarlyAccessCache + EarlyAccessItem. Ready for Dev dispatch.
7. ✅ **Architect — Device fingerprinting spec:** Fields already on User model. FingerprintJS free tier. Phase 1 = defer (existing gates sufficient at beta scale). Phase 2 = signup+referral hard-block.

**S447 Batch 1 files changed:**
- `packages/backend/src/services/appraisalService.ts`
- `packages/frontend/components/Layout.tsx`
- `packages/frontend/components/AvatarDropdown.tsx`
- `packages/frontend/pages/shopper/loyalty.tsx`
- `packages/frontend/pages/shopper/explorer-passport.tsx`
- `packages/frontend/components/LoyaltyPassport.tsx`
- `packages/frontend/pages/shopper/league.tsx`
- `packages/frontend/pages/shopper/loot-legend.tsx`
- `packages/database/prisma/schema.prisma`
- `packages/backend/src/services/xpService.ts`
- `packages/backend/src/index.ts`
- NEW: `packages/backend/src/jobs/xpExpiryCron.ts`
- NEW: `packages/database/prisma/migrations/20260413_xp_expiry_system/migration.sql`

**S447 Patrick manual actions (before next dev dispatch):**
1. Run XP expiry migration on Railway — see migration block below
2. Add `charge.dispute.created` event to Stripe Dashboard → Webhooks

**S447 Batch 2 COMPLETE:**
- ✅ Bump Post feed sort — haulPostController.ts orderBy updated (both endpoints), useHaulPosts.ts HaulPost interface gets bumpedUntil field
- ✅ Early Access Cache — replaces Lucky Roll. New models, migration (20260413_early_access_cache), 3 backend endpoints, new frontend page, nav updated
- ✅ Cosmetics repricing D-XP-005 — xpService.ts constants, users.ts route, hunt-pass.tsx display, profile.tsx display all updated
- ✅ Hunt Pass 3x coupon enforcement — couponController.ts now dynamic (2/3x based on huntPassActive), hunt-pass.tsx benefit card added

**S447 Batch 3 COMPLETE (stale reference sweep):**
- ✅ AvatarDropdown.tsx — lucky-roll link → early-access-cache, "Lucky Roll" → "Early Access Cache"
- ✅ hunt-pass.tsx — lucky-roll route fixed; coupon copy corrected ($1/$1.50 → $0.75/$2.00)
- ✅ loyalty.tsx — coupon copy range updated
- ✅ couponController.ts — Tier 1 discount 1.00→0.75, Tier 2 discount 1.50→2.00, Tier 2 xpCost 150→200, Tier 2 minPurchase 20→25 (D-XP-001 correct values)
- ✅ No remaining "Loyalty Passport", "Explorer Passport", or "Lucky Roll" display text in codebase

**S447 ALL CHANGED FILES (consolidated push block needed):**

Modified:
- packages/backend/src/services/appraisalService.ts
- packages/frontend/components/Layout.tsx
- packages/frontend/components/AvatarDropdown.tsx
- packages/frontend/pages/shopper/loyalty.tsx
- packages/frontend/pages/shopper/explorer-passport.tsx
- packages/frontend/components/LoyaltyPassport.tsx
- packages/frontend/pages/shopper/league.tsx
- packages/frontend/pages/shopper/loot-legend.tsx
- packages/database/prisma/schema.prisma
- packages/backend/src/services/xpService.ts
- packages/backend/src/index.ts
- packages/backend/src/controllers/haulPostController.ts
- packages/frontend/hooks/useHaulPosts.ts
- packages/backend/src/routes/users.ts
- packages/frontend/pages/shopper/hunt-pass.tsx
- packages/frontend/pages/profile.tsx
- packages/backend/src/controllers/couponController.ts

New files:
- packages/backend/src/jobs/xpExpiryCron.ts
- packages/database/prisma/migrations/20260413_xp_expiry_system/migration.sql
- packages/database/prisma/migrations/20260413_early_access_cache/migration.sql
- packages/backend/src/controllers/earlyAccessController.ts
- packages/backend/src/routes/early-access.ts
- packages/frontend/pages/shopper/early-access-cache.tsx

**S447 Patrick manual actions (AFTER push):**
1. Run migrations on Railway (two migrations: xp_expiry_system + early_access_cache)
2. Add `charge.dispute.created` event to Stripe Dashboard → Webhooks

**S447 Batch 4 — QA (needs deploy first):**
- Chrome QA: mobile nav (Explorer's Guild, Explorer Profile, Early Access Cache links)
- Chrome QA: AvatarDropdown dropdown in both desktop and mobile
- Chrome QA: /shopper/early-access-cache page loads + activation flow
- Chrome QA: /shopper/loyalty and /shopper/explorer-passport show correct new titles
- Chrome QA: Bump Post feed sort (bumped post rises to top)

**Device fingerprinting (Phase 2 — deferred):** Fields already on User model. FingerprintJS free tier. Defer until beta scale justifies it.

**S448 next priorities — see ## Next Session below.**

**S449 priorities (next session opens with these):**

**P0 — Rank staleness fix (UNBLOCKED — naming now locked):**
Nav shows "Scout" for Initiate-level users. XP numbers differ between pages. Root cause: JWT carries stale rank from login, doesn't refresh on XP earn. Locked naming: Initiate → Scout → Ranger → Sage → Grandmaster. Fix rank thresholds (500/2000/5000/12000), update all rank references sitewide, fix JWT refresh on XP events.

**P1 — Scout Reveal flesh-out:**
Backend: query users who have saved/favorited the item, return as `{ success, remainingXp, interestedUsers: [{ displayName, avatarUrl, savedAt }] }`. Frontend: render a "Scout Reveal Results" panel below the item after spending XP, showing interested users. No messaging or coupon mechanic yet — demand intel only.

**P2 — Dashboard rethink + perks system (parallel dispatch):**
UX agent: creative brief for dashboard redesign — what should each rank tier FEEL like, what cards surface, how perks are communicated. Game Designer: spec what each rank (Initiate/Scout/Hunter/Sage/Grandmaster) actually unlocks (perks, cosmetics, access gates). Both can run in parallel now that naming is locked.

**P3 — Create haul post test data** — needed to verify Bump Post and Haul Unboxing flows.

**P4 — Organizer discount badge:** Show "Organizer Special: $X off" on public sale/item pages when `organizerDiscountAmount > 0`.

**Stripe action already done (Patrick confirmed S448):** sandbox Stripe action is complete.

---

**S444 COMPLETE (2026-04-13):** STAFF→MEMBER full rename (schema, DB, models, UI) + workspace permissions fix.

**S444 What shipped:**
- **STAFF→MEMBER everywhere:** WorkspaceRole enum STAFF removed (MEMBER is primary). Schema models renamed: StaffMember→TeamMember, StaffAvailability→TeamMemberAvailability, StaffPerformance→TeamMemberPerformance. Column renames in migration (staffMemberId→teamMemberId in 3 tables). All nav links, copy, FAQ, dropdowns, templates updated.
- **New members page:** `/organizer/members` — full team management with 4-role hierarchy (ADMIN/MANAGER/MEMBER/VIEWER) with descriptions in invite and member card dropdowns. `/organizer/staff` now redirects to /organizer/members.
- **Workspace permissions fixed (2 root causes):** (1) Backend returned `{ roles: { ADMIN: [...] } }` but frontend expected `RolePermissions[]` categorized array — rewritten. (2) `setPermissionsForRole` only stored non-default permissions, making defaults untoggleable — rewritten to store ALL permissions (allowed + denied). PERMISSION_CATEGORIES constant added to utils.
- **Owner double-count fix:** Removed `+ 1` from all 3 memberCount calculations in workspaceController.
- **Migration:** `20260412000001_rename_staff_to_member` — applied to Railway DB ✅ (3 iterations to resolve type cast error, WorkspacePermission dependency, and duplicate key constraint).

**S444 Pending push (permissions fix — 3 backend files):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/controllers/workspaceController.ts
git add packages/backend/src/services/workspacePermissionService.ts
git add packages/backend/src/utils/workspacePermissions.ts
git commit -m "fix: workspace permissions — correct API response shape and save logic"
.\push.ps1
```

**S444 Files changed (16):**
- `packages/database/prisma/schema.prisma` — StaffMember→TeamMember models, STAFF removed from WorkspaceRole
- `packages/database/prisma/migrations/20260412000001_rename_staff_to_member/migration.sql` — NEW, applied ✅
- `packages/frontend/pages/organizer/members.tsx` — NEW: team management page with 4-role hierarchy
- `packages/frontend/pages/organizer/staff.tsx` — redirect → /organizer/members
- `packages/frontend/pages/organizer/workspace.tsx` — WORKSPACE_ROLES updated, isOwner fix, permission display names
- `packages/frontend/hooks/useWorkspace.ts` — role type expanded to MANAGER/VIEWER
- `packages/frontend/components/Layout.tsx` — nav: /staff→/members, "Staff Accounts"→"Team Members"
- `packages/frontend/components/AvatarDropdown.tsx` — same nav changes
- `packages/frontend/pages/organizer/subscription.tsx` — "Add staff"→"Add members"
- `packages/frontend/pages/support.tsx` — FAQ updated with 4-role hierarchy
- `packages/backend/src/controllers/workspaceController.ts` — owner fix, permissions response shape, role list, double-count removed
- `packages/backend/src/services/workspacePermissionService.ts` — getPermissionsForRole + setPermissionsForRole rewritten
- `packages/backend/src/utils/workspacePermissions.ts` — STAFF removed, PERMISSION_CATEGORIES added
- `packages/backend/src/services/staffService.ts` — prisma.staffMember→prisma.teamMember etc
- `packages/backend/src/utils/workspaceTemplates.ts` — STAFF→MEMBER in templates
- `packages/frontend/pages/workspace/[slug].tsx` — "Invite Members" CTA added

**S444 No new migrations needed at next session.** Migration already applied.

**S444 QA needed:**
- `/organizer/members` — invite modal shows 4 roles with descriptions; member cards show correct role badges; role change dropdown works
- `/organizer/workspace` — permissions tabs switch between ADMIN/MANAGER/MEMBER/VIEWER; save persists changes; owner not double-counted in member count
- `/organizer/staff` — redirects to /organizer/members
- Nav: "Team Members" link in both Layout and AvatarDropdown goes to /organizer/members

**S444 Open:** No onboarding flow for invited team members to accept invites from within the app. WorkspaceMember row created on invite but new user has no UI showing "you've been invited to workspace X." Needs design + implementation.

---

**S443 COMPLETE (2026-04-11):** 9 live-site bug fixes from Patrick's walkthrough + command center upgrade + appraisal gating + UX spec.

**S443 What shipped:**
- **Staff page crash (P0):** Fixed backend response shape mismatches (wrapped objects vs arrays) + owner ID check (organizer ID vs user ID). 3 files.
- **Reputation scores 0 (P0):** Root cause — `calculateOrganizerReputationScore()` queried PUBLISHED sales instead of ENDED. 1 file.
- **Bounties submit match:** Added full submission modal with sale/item picker for organizers. Auth check uses roles array, not single role string. 1 file.
- **Achievements organizer data:** Added `evaluateAchievementProgress()` that queries actual DB data (item counts, sale counts, purchases) instead of relying on pre-recorded UserAchievement records. 1 file.
- **Lucky Roll no functionality:** Missing Bearer token auth headers on all 3 API fetch calls — backend returned 401 HTML which crashed JSON parsing, hiding the interactive UI. 1 file.
- **Workspace wrong text:** Removed AI Suggestions/AI Tags from permissions, replaced Arrival Time with Customer Service Standards, added "View Public Workspace" link. 1 file.
- **Workspace public page:** Enhanced with description section + past sales history. Backend now returns ENDED/COMPLETED sales. 2 files.
- **Appraisal gating:** SIMPLE tier costs 50 XP (confirmation modal with balance), PRO/TEAMS free. Backend deducts atomically. 2 files.
- **Command Center upgrade:** Live activity feed (6 data sources, 30s auto-refresh), sale health mini-cards with scores, weather alert card, quick actions bar. 10 new files + 1 modified.
- **Price Research Card UX spec:** Full redesign spec at `claude_docs/design/PRICE_RESEARCH_CARD_UX_SPEC.md` — ready for dev in follow-up session.

**S443 Files changed (22):**
- `packages/backend/src/controllers/staffController.ts` — response shape fix
- `packages/backend/src/services/staffService.ts` — response shape fix
- `packages/frontend/pages/organizer/staff.tsx` — owner ID check fix
- `packages/backend/src/services/reputationService.ts` — PUBLISHED → ENDED
- `packages/frontend/pages/shopper/bounties.tsx` — submission modal + auth fix
- `packages/backend/src/services/achievementService.ts` — evaluateAchievementProgress()
- `packages/frontend/pages/shopper/lucky-roll.tsx` — auth headers on 3 fetches
- `packages/frontend/pages/organizer/workspace.tsx` — AI text removed, customer service, public link
- `packages/frontend/pages/workspace/[slug].tsx` — description + past sales
- `packages/backend/src/controllers/workspaceController.ts` — enhanced public workspace response
- `packages/backend/src/controllers/appraisalController.ts` — tier/XP gating
- `packages/frontend/components/PriceResearchPanel.tsx` — confirmation modal
- `packages/frontend/hooks/useOrganizerActivityFeed.ts` — NEW
- `packages/frontend/components/OrganizerActivityFeedCard.tsx` — NEW
- `packages/frontend/components/QuickActionsBar.tsx` — NEW
- `packages/frontend/components/SaleHealthMiniCard.tsx` — NEW
- `packages/frontend/components/WeatherAlertCard.tsx` — NEW
- `packages/backend/src/services/organizerActivityFeedService.ts` — NEW
- `packages/backend/src/controllers/organizerActivityFeedController.ts` — NEW
- `packages/backend/src/types/activityFeed.ts` — NEW
- `packages/backend/src/routes/commandCenter.ts` — activity feed endpoint
- `packages/frontend/pages/organizer/command-center.tsx` — integrated all new components

**S443 No schema changes.** No migrations needed.

---

**S442 COMPLETE (2026-04-11):** Team Collaboration Phase 2 schema fix + test data seeding. Fixed 18 TS errors in workspaceController.ts by adding 5 missing fields to WorkspaceSettings model. Seeded full team test data for user1 (Alice) and user3 (Carol).

**S442 What shipped:**
- **Schema fix:** Added `name`, `description`, `brandRules` (Text), `templateUsed`, `maxMembers` (default 5) to WorkspaceSettings model — these were specified in the ADR but omitted by the schema agent in Phase 1.
- **Migration:** `20260411000003_workspace_settings_fields/migration.sql` — 5 ALTER TABLE ADD COLUMN statements.
- **Cache bust:** Updated `Dockerfile.production` cache-bust date to force Railway rebuild.
- **Test data seeded (Railway DB direct via psycopg2):**
  - Alice (user1): 7-member team — Alice (OWNER), David Jones (ADMIN), Bob Smith (MEMBER), Emma Brown (MANAGER), Frank Davis (STAFF), Iris Moore (STAFF), Grace Miller (VIEWER). All with departments, phone numbers, Mon-Sat availability, weekly+monthly performance stats, 3 weeks of leaderboard history.
  - Carol (user3): 4-member team — Henry Wilson (ADMIN), Bob Smith (MEMBER), Frank Davis (MANAGER), Emma Brown (STAFF). Same data completeness.
  - Both workspaces: WorkspaceSettings (templates, brand rules, commission override), 76 workspace permissions across all roles, 33 leaderboard entries.
  - Alice's team = $119/mo scenario (5 base + 2 extra seats × $20).

**S442 Files changed (3):**
- `packages/database/prisma/schema.prisma` — 5 fields added to WorkspaceSettings
- `packages/database/prisma/migrations/20260411000003_workspace_settings_fields/migration.sql` — NEW
- `packages/backend/Dockerfile.production` — cache bust 2026-04-11

**S442 Migration required:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

**S441 COMPLETE (2026-04-11):** 8-issue fix batch from Patrick's live site review. 2 dispatch rounds (7+2 agents). 15 files changed. 1 DB backfill.

**S441 What shipped:**
- **Bounties:** XP explainer copy added below input ("Minimum 50 XP. Organizers receive 1/2..."). Submit Match button wired with informational toast (requires organizer context).
- **Achievements:** Stale streak copy replaced with guildXp/Explorer Rank progression. JWT now carries `guildXp` across all 4 auth flows. Frontend shows rank progression with XP progress bar.
- **Reputation (P0 bug fix):** Root cause — `reputationService.ts` used `Organizer.id` instead of `User.id` for `OrganizerReputation` upserts. Fixed service + controller. DB backfilled: 1 organizer now has score=4.67 from 3 reviews.
- **Dashboard:** Added "View Sale" eye icon button linking to public `/sales/${id}`.
- **Receipts:** Fixed review CTA route (`/organizer/{id}/reviews` → `/organizers/{id}`).
- **Haul Posts:** Replaced URL text input with Cloudinary file upload (camera icon, preview, 5MB limit). Replaced item ID input with searchable autocomplete from purchase history.
- **Price Research Card:** Condensed layout, reordered sections (Smart Estimate top, comps middle), added sage-green "Request Community Appraisal" button with loading states. Props passed from edit-item + review pages.
- **Lucky Roll:** Investigated — already fully implemented (frontend + backend + pity system + weekly resets). May need XP in test account to test.

**S441 Files changed (15):**
- `packages/frontend/pages/shopper/bounties.tsx`
- `packages/frontend/pages/shopper/achievements.tsx`
- `packages/frontend/components/AuthContext.tsx`
- `packages/backend/src/controllers/authController.ts`
- `packages/backend/src/controllers/passkeyController.ts`
- `packages/backend/src/routes/organizers.ts`
- `packages/backend/src/routes/users.ts`
- `packages/backend/src/services/reputationService.ts`
- `packages/backend/src/controllers/reputationController.ts`
- `packages/frontend/pages/organizer/dashboard.tsx`
- `packages/frontend/components/ReceiptCard.tsx`
- `packages/frontend/components/PriceResearchPanel.tsx`
- `packages/frontend/pages/organizer/edit-item/[id].tsx`
- `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx`
- `packages/frontend/pages/shopper/haul-posts/create.tsx`

**S441 No schema changes.** S440 migrations still need to be applied if not done yet.

---

**S440 COMPLETE (2026-04-11):** Massive nav/UX session — 3 push rounds.

**S440 Round 1 (7 parallel agents):** Nav restructured (grey icons, Explorer Passport rename, Hunt Exclusives group, league moved). Bounties UX upgraded (XP input 50 min, reference URLs, expandable cards, BountySubmission model). Subscription upgrade pitches rebuilt for FREE→PRO/ALC and PRO→TEAMS. Achievements dark mode + unlock logic fixed. Reputation API path fixed. Dashboard primary sales cards got dates. Receipt review CTA added.

**S440 Round 2:** Nav reorder (Connect > Hunt Pass > Hunt Exclusives) in all 3 nav locations + avatar dropdown. Removed Inspiration from desktop header. Holds icon: CartIcon bag→Clock, mobile holds icon with holdCount badge. Command Center icon grey in mobile.

**S440 Round 3 (3 parallel agents):** Leaderboard consolidated — `/shopper/leaderboard` redirects to `/leaderboard`, backend uses `guildXp` not `streakPoints`, xpService returns correct shape. Messages dual-role fix — backend returns both organizer AND shopper conversations with roleContext badges, `/organizer/messages` redirects to `/messages`. Missing Connect nav links added (Appraisals, Leaderboard, Achievements) to both mobile sections.

**S440 Schema changes (3 migrations):**
- `20260411_add_reference_url_bounty` — adds referenceUrl to MissingListingBounty
- `20260411_bounty_submissions` — adds xpReward/expiry to MissingListingBounty, creates BountySubmission table
- `20260411_make_unlockedAt_nullable` — UserAchievement.unlockedAt becomes nullable

**S440 Migration required:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**S440 Files changed:**
- `packages/frontend/components/Layout.tsx` — nav: grey icons, Explorer Passport rename, Hunt Exclusives group, league moved
- `packages/frontend/components/AvatarDropdown.tsx` — same nav changes
- `packages/frontend/pages/shopper/explorer-passport.tsx` — title/heading → Explorer Passport
- `packages/frontend/pages/shopper/bounties.tsx` — XP input, referenceUrl field, expandable cards
- `packages/frontend/pages/organizer/subscription.tsx` — dark mode fix, upgrade pitches
- `packages/frontend/components/AchievementBadge.tsx` — dark mode styling
- `packages/frontend/pages/shopper/reputation.tsx` — fixed API path
- `packages/frontend/pages/organizer/dashboard.tsx` — dates on primary sales cards
- `packages/frontend/components/ReceiptCard.tsx` — review CTA
- `packages/backend/src/controllers/bountyController.ts` — xpReward/referenceUrl support
- `packages/backend/src/controllers/receiptController.ts` — organizer data in receipts
- `packages/backend/src/services/achievementService.ts` — unlock logic fix
- `packages/database/prisma/schema.prisma` — referenceUrl + unlockedAt nullable + BountySubmission
- `packages/database/prisma/migrations/20260411_add_reference_url_bounty/migration.sql` — NEW
- `packages/database/prisma/migrations/20260411_bounty_submissions/migration.sql` — NEW
- `packages/database/prisma/migrations/20260411_make_unlockedAt_nullable/migration.sql` — NEW

**S440 Open decision:** Bounties — dollars vs XP-only. Patrick exploring Stripe/legal implications before committing.

---

**S439 COMPLETE (2026-04-11):** 6 live-site issues fixed. Inventory root-cause resolved (447 items backfilled). Shopper bounties model evolved. Market Hubs renamed. Subscription PRO display fixed.

**S439 What shipped:**
- `itemLibraryService.ts` — query uses `OR [organizerId, sale.organizerId]` to catch items missing denormalized field
- `itemController.ts` — new items now get `organizerId` on create + CSV import
- **DB backfill** — 447 existing `Item` rows updated with correct `organizerId` via psycopg2
- `schema.prisma` — `MissingListingBounty.saleId` now optional, added `itemName`/`category`/`maxBudget`/`radiusMiles`
- Migration: `20260411_make_saleId_optional_shopper_bounties/migration.sql`
- `bountyController.ts` — createBounty accepts shopper-first (no saleId); new `getCommunityBounties` endpoint; null guard on `bounty.sale` (TS build fix)
- `bounties.ts` routes — `GET /api/bounties/community` added
- `shopper/bounties.tsx` — posts without saleId, Browse tab fetches /community, cards show itemName/budget/XP/radius
- `Layout.tsx` + `AvatarDropdown.tsx` — "Sale Hubs" → "Market Hubs", Store icon
- `hubs/index.tsx` — heading "Flea Market Events" → "Market Hubs"
- `subscription.tsx` — PRO plan card for manually-seeded users (no Stripe sub object)
- `organizers.ts` — added `subscriptionTier` to `/me` response

**S439 Migration required (shopper bounties):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**S439 Files changed:**
- `packages/backend/src/services/itemLibraryService.ts`
- `packages/backend/src/controllers/itemController.ts`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260411_make_saleId_optional_shopper_bounties/migration.sql` — NEW
- `packages/backend/src/controllers/bountyController.ts`
- `packages/backend/src/routes/bounties.ts`
- `packages/frontend/pages/shopper/bounties.tsx`
- `packages/frontend/components/Layout.tsx`
- `packages/frontend/components/AvatarDropdown.tsx`
- `packages/frontend/pages/organizer/hubs/index.tsx`
- `packages/frontend/pages/organizer/subscription.tsx`
- `packages/backend/src/routes/organizers.ts`

**S439 QA needed:**
- Inventory: any organizer → /organizer/inventory → items visible (not 0)
- Shopper bounties: create bounty → card shows itemName/budget/XP/radius; Browse tab loads from /community
- Market Hubs: nav label + Store icon in desktop, mobile, avatar dropdown
- Subscription: user2 PRO → "Your PRO Plan" card (not support message)

**S438 COMPLETE (2026-04-11):** Patrick's 6-issue review session. Fixed tier-aware platform fees in 5 backend files. Rebuilt hubs page as Flea Market Events. Merged checklist into /plan. Moved bounties out of PRO Tools. Removed appraisal PRO gate, created shopper appraisals page.

**S438 Files changed:**
- `packages/backend/src/routes/organizers.ts` — tier-aware fee calculation in analytics
- `packages/backend/src/controllers/payoutController.ts` — always use tierRate, removed ?? fallback
- `packages/backend/src/controllers/earningsPdfController.ts` — tier-aware fees + businessName select fix
- `packages/backend/src/controllers/posController.ts` — tier-aware fees (2 locations)
- `packages/backend/src/controllers/stripeController.ts` — tier-aware webhook fee calculation
- `packages/backend/src/routes/appraisals.ts` — removed requireTier('PRO') from POST
- `packages/frontend/pages/organizer/hubs/index.tsx` — rebuilt as Flea Market Events page
- `packages/frontend/pages/plan.tsx` — two-tab layout (Checklist + Planning Assistant)
- `packages/frontend/pages/organizer/checklist/index.tsx` — redirect to /plan
- `packages/frontend/components/Layout.tsx` — nav: removed duplicate Item Library, moved bounties out of PRO, added shopper appraisals
- `packages/frontend/components/AvatarDropdown.tsx` — same nav changes
- `packages/frontend/pages/shopper/bounties.tsx` — rebuilt from Coming Soon (has 400 bug, see above)
- `packages/frontend/pages/organizer/inventory.tsx` — redirect to /organizer/item-library (was other direction)
- `packages/frontend/pages/organizer/item-library.tsx` — redirect to /organizer/inventory
- `packages/frontend/pages/organizer/appraisals.tsx` — removed PRO gate on submit
- `packages/frontend/pages/shopper/appraisals.tsx` — NEW: community appraisals page
- `packages/frontend/pages/organizer/bounties.tsx` — fixed implicit any type on .find()

**S438 Push block (already pushed during session):** Fee fixes, nav changes, hubs rebuild, plan tabs, appraisals, bounties type fix, earningsPdfController businessName fix — all pushed. Shopper bounties page pushed but non-functional (400 on submit).

---

**S437 COMPLETE (2026-04-11):** Massive organizer tools session — 6 sale-selector bugs fixed, calendar built, bounty redesign Phase 1 shipped (schema + 6 endpoints + wired frontend), 7 organizer pages improved, typology deprecated and deleted.

**S437 What shipped:**

**Batch 1 — Sale Selector Fix + Calendar:**
- Fixed 6 pages where "Choose a Sale" showed empty even with active sales: promote, send-update, photo-ops, print-kit, checklist, line-queue. Root cause: backend returns flat array `res.json(sales)`, frontend expected `{ sales: Sale[] }` wrapper.
- Built full calendar page (`/organizer/calendar`): monthly grid with color-coded sale events, prev/next/today nav, upcoming sales sidebar, team schedules placeholder. TEAMS tier gated.

**Batch 2 — UI Polish:**
- Subscription toast: suppressed Stripe API error toast when tier available from auth context
- OrganizerSaleCard: dark mode text fix
- Photo-ops station form: removed lat/lng inputs, replaced frame URL with XP teaser card
- Bounty redesign spec: `claude_docs/strategy/bounty-redesign-spec.md` (architect + innovation review)

**Batch 3 — Cross-cutting Fixes:**
- Tier-aware platform fees: new `feeCalculator.ts` — 10% SIMPLE, 8% PRO/TEAMS. Applied to payoutController, stripeController, terminalController. Earnings page shows dynamic fee %.
- Checklist: full dark mode pass + updated default items to match FindA.Sale workflow (Rapidfire upload → AI tags → pricing → publish → process → review earnings)
- Nav cleanup: removed Reviews (merged into Reputation S434), Inventory redirects to item-library
- Appraisals: removed outer TierGate (community feed visible to all), PRO gate on submit only
- Email digest: dark mode pass

**Batch 4 — Bounty Redesign Phase 1:**
- Schema: BountySubmission model with status/expiry/XP fields, indexes, relations to User/Item/MissingListingBounty
- Migration: `20260411_bounty_submissions/migration.sql`
- Backend: 6 new endpoints (browseLocalBounties, submitToBounty, getMySubmissions, reviewSubmission, autoMatchItem, purchaseBounty). Auto-match uses word-overlap at 60% confidence. 2x XP economics (shopper pays 50, organizer earns 25).
- Frontend: Complete bounties.tsx rewrite V4 — tabbed UI (Browse Local / Your Requests / Your Submissions), search + mile range, submission modal, status badges. Fixed premature `</div>` layout bug.

**Final — Typology Deprecation:**
- Commented out typology import + route in `backend/src/index.ts`
- Removed "Typology Classifier" from TierComparisonTable.tsx
- 7 files to delete: typology page, hook, badge, controller, service, routes, test

**S437 Files changed:**
- `packages/frontend/pages/organizer/promote/index.tsx` — sale selector fix
- `packages/frontend/pages/organizer/send-update/index.tsx` — sale selector fix
- `packages/frontend/pages/organizer/photo-ops/index.tsx` — sale selector fix
- `packages/frontend/pages/organizer/print-kit/index.tsx` — sale selector fix
- `packages/frontend/pages/organizer/checklist/index.tsx` — sale selector fix
- `packages/frontend/pages/organizer/line-queue/index.tsx` — sale selector fix
- `packages/frontend/pages/organizer/calendar.tsx` — full calendar (replaced Coming Soon)
- `packages/frontend/pages/organizer/subscription.tsx` — toast fix
- `packages/frontend/components/OrganizerSaleCard.tsx` — dark mode
- `packages/frontend/pages/organizer/photo-ops/[saleId].tsx` — form cleanup + frame teaser
- `packages/frontend/pages/organizer/bounties.tsx` — complete rewrite V4
- `packages/backend/src/utils/feeCalculator.ts` — NEW tier-aware fee utility
- `packages/backend/src/controllers/payoutController.ts` — tier-aware fees
- `packages/backend/src/controllers/stripeController.ts` — tier-aware fees
- `packages/backend/src/controllers/terminalController.ts` — tier-aware fees
- `packages/frontend/pages/organizer/earnings.tsx` — dynamic fee display
- `packages/frontend/components/SaleChecklist.tsx` — dark mode + workflow defaults
- `packages/backend/src/controllers/checklistController.ts` — updated defaults
- `packages/frontend/components/Layout.tsx` — removed Reviews nav, Inventory→item-library
- `packages/frontend/components/AvatarDropdown.tsx` — same nav cleanup
- `packages/frontend/pages/organizer/inventory.tsx` — redirect to item-library
- `packages/frontend/pages/organizer/appraisals.tsx` — TierGate scoped to submit only
- `packages/frontend/pages/organizer/email-digest-preview.tsx` — dark mode
- `packages/database/prisma/schema.prisma` — BountySubmission model + MissingListingBounty fields
- `packages/database/prisma/migrations/20260411_bounty_submissions/migration.sql` — NEW
- `packages/backend/src/controllers/bountyController.ts` — 6 new endpoints
- `packages/backend/src/routes/bounties.ts` — 6 new routes
- `packages/backend/src/index.ts` — commented out typology import/route
- `packages/frontend/components/TierComparisonTable.tsx` — removed Typology Classifier
- `claude_docs/strategy/bounty-redesign-spec.md` — NEW

**S437 Files to DELETE (typology deprecation):**
- `packages/frontend/pages/organizer/typology.tsx`
- `packages/frontend/hooks/useTypology.ts`
- `packages/frontend/components/TypologyBadge.tsx`
- `packages/backend/src/controllers/typologyController.ts`
- `packages/backend/src/services/typologyService.ts`
- `packages/backend/src/routes/typology.ts`
- `packages/backend/src/__tests__/typologyClassifier.integration.ts`

**S437 Migration required:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**S437 QA needed:**
- Sale selector: promote/send-update/photo-ops/print-kit/checklist/line-queue → should list organizer's active sales (not empty)
- Calendar: `/organizer/calendar` → monthly grid with sales shown on correct dates, nav works
- Bounties: Browse tab → search/mile range → bounty cards load. Submit → modal opens → select sale/item → submit. Submissions tab → pending submissions visible
- Platform fees: PRO organizer earnings page shows "8%", SIMPLE shows "10%"
- Appraisals: non-PRO user can see community feed tab; submit form shows PRO gate
- Checklist: dark mode renders clean, default items match workflow

---

**S436 COMPLETE (2026-04-10):** Three placeholder pages replaced with functional implementations. S433/S434/S435 confirmed pushed by Patrick.

**S436 What shipped:**
1. **earnings.tsx** — Full earnings dashboard: lifetime gross/fees/net summary cards, per-sale breakdown table with sortable revenue data, year selector, PDF export button. Uses `/api/organizers/me/analytics`. 51-line stub → 350-line functional page.
2. **qr-codes.tsx** — QR Scan Analytics (#186): total scans lifetime, active sale scans, per-sale breakdown table sorted by scan count descending, 3-step explainer. Backend updated: `qrScanCount` added to `/api/organizers/me/sales` response. 51-line stub → analytics dashboard.
3. **staff.tsx** — Team management page: TEAMS tier gate + upgrade wall, workspace creation flow for first-time TEAMS users, member list with roles/dates, invite by email with role selector, remove member with confirmation. Uses existing workspace API endpoints.

**S436 Architect audit result:** Double-close cron issue was already resolved in a prior session. Cron audit cleared.

**S436 Files changed:**
- `packages/frontend/pages/organizer/earnings.tsx`
- `packages/frontend/pages/organizer/qr-codes.tsx`
- `packages/frontend/pages/organizer/staff.tsx`
- `packages/frontend/pages/organizer/typology.tsx` — fixed 202 response handling
- `packages/frontend/pages/plan.tsx` — fixed scroll-to-middle bug
- `packages/backend/src/routes/organizers.ts` — added qrScanCount to /me/sales SELECT
- `packages/backend/src/routes/lines.ts` — added requireTier('SIMPLE') to 6 Line Queue routes
- `packages/frontend/components/BountyModal.tsx` — dark mode
- `packages/frontend/pages/organizer/bounties.tsx` — cancel button, dark mode, invalidation
- `packages/backend/src/controllers/bountyController.ts` — shopper notification on fulfill
- `packages/frontend/components/Layout.tsx` — "Price Tags"→"QR Analytics", hubs href fixed
- `packages/frontend/components/AvatarDropdown.tsx` — same nav fixes
- `claude_docs/architecture/ADR-014-hubs-flea-market-repurpose.md` — NEW
- `claude_docs/research/flea-market-software-competitive-analysis.md` — NEW
- `claude_docs/decisions-log.md` — S436 Hubs decisions appended
- `claude_docs/strategy/roadmap.md` — #40 and #238 updated

**S436 Verified:**
- S435 all 5 fixes CONFIRMED in code (Layout mobile nav, offline.tsx, AvatarDropdown, auctionJob, auctionAutoCloseCron)
- item-library already functional (no TierGate, real API call) — no changes needed

**S436 Bounties (#197) — SHIPPED:**
Full end-to-end: organizer cancel button (DELETE /api/bounties/:id + React Query invalidation + loading state), dark mode throughout BountyModal + bounties.tsx, shopper notification on fulfillment (type BOUNTY_FULFILLED, "Good news!", link to /items/{itemId}).

**S436 Hubs → Flea Market Events — DECISION LOCKED:**
- Repurposed Sale Hubs as Flea Market Events (ADR-014). SaleHubMembership → VendorBooth.
- 4 locked decisions: TEAMS tier only, all 4 hubTypes (FLEA_MARKET, ANTIQUE_MALL, POPUP_MARKET, FARMERS_MARKET), unlimited booths, organizer-choice payout (flat booth fee / revenue share / hybrid).
- Nav: "Price Tags" → "QR Analytics", /organizer/sale-hubs → /organizer/hubs (removed "(Soon)" + disabled styling)
- Research doc: `claude_docs/research/flea-market-software-competitive-analysis.md` — key finding: no competitor has shopper app; QR auto-settlement is the differentiator
- ADR-014: `claude_docs/architecture/ADR-014-hubs-flea-market-repurpose.md`
- Roadmap: #40 → "Repurposed S436 — Flea Market Events (TEAMS)", #238 → "Folded into #40 S436"

**S436 QA needed:**
- Earnings page: `/organizer/earnings` → verify summary cards show real revenue data, per-sale table renders, PDF export downloads
- QR Analytics: `/organizer/qr-codes` → verify scan totals load, per-sale table shows qrScanCount, empty state works
- Staff page: `/organizer/staff` → TEAMS user: workspace creation → invite member → member appears in list → remove works. Non-TEAMS: upgrade wall shows.

**S435 COMPLETE (2026-04-10):** S434 audit completed, nav parity fixed, Hunt Pass section corrected. All S433/S434 commits are local and ready to push.

**S435 What was audited and fixed:**
1. **S434 audit** — Read all 14 changed files. 5 bugs found and fixed:
   - `Layout.tsx` mobile nav: Typology was still in mobile "Pro Tools" (removed)
   - `offline.tsx`: Stale comment "TierGate handles PRO access check" removed
   - `AvatarDropdown.tsx`: S434 never updated this file — 3 fixes applied (Add Items href → `/organizer/sales`, Command Center → TEAMS section, Typology removed)
   - `auctionJob.ts`: `auctionClosed: true` not set in bid-won path (fixed)
   - `auctionAutoCloseCron.ts`: Circular import `'../index'` → `'../lib/prisma'` (fixed)
2. **S433 cron audit** — 3 cron files confirmed safe: different query predicates, complementary responsibilities, no double-processing
3. **Full nav parity audit** — Systematic comparison of AvatarDropdown.tsx vs Layout.tsx:
   - Organizer: Messages + Inventory missing from AvatarDropdown (added), Flip Report + Appraisals wrongly PRO-gated (ungated), Sale Hubs href wrong `/organizer/hubs` → `/organizer/sale-hubs`
   - Shopper: AvatarDropdown "Explore & Connect" split into 3 proper sections (Explore / Hunt Pass / Connect) matching Layout.tsx
   - Hunt Pass: Lucky Roll moved from Hunt Pass → Explore (it's a free XP mechanic, not HP exclusive) in both desktop + mobile
   - Mobile bugs fixed: mobile Hunt Pass sections were using wrong state vars (`mobileCartOpen` and `mobileDevToolsOpen`) — replaced with `mobileHuntPassOpen` and `mobileDualRoleHuntPassOpen`
   - TS check: zero errors
4. **Original S434 prompt review** — Confirmed what was NOT done by S434: placeholder pages (promote, send-update, photo-ops, qr-codes, print-kit, checklist, earnings, line-queue, calendar, staff), functional issues with item-library and typology, offline sync awareness, bounties game design check, Line Queue gating. These are separate workloads.

**S435 Files changed (uncommitted — include in push):**
- `packages/frontend/components/AvatarDropdown.tsx`
- `packages/frontend/components/Layout.tsx`

**S435 Next session:**
- Push S433 + S434 + S435 commits using `.\push.ps1`
- S433 migration must run first (see below)
- Chrome QA all S434 pages after deploy
- Remaining S434 original prompt work: placeholder pages, functional bugs

---

**S433 COMPLETE (2026-04-10):** Full auction overhaul — Phase 1 P0 fixes + Phase 2 professional features. ADR-013 written. Migration required for Phase 2.

**S433 Phase 1 (No migration — ships now):**
- `itemController.ts` — Reserve price enforcement in `placeBid` (bids below reserve rejected with clear error + reserve amount in response). Auto-close lazy fetch in `getItemById` (sets `auctionClosed: true` when `auctionEndTime` past). Outbid notifications to displaced WINNING bidder after new bid created.
- `items/[id].tsx` — Reserve-met badge: "✓ Reserve met" (green) / "Reserve: $X.XX (not met)" (amber). Added `auctionReservePrice` and `auctionClosed` to Item interface.
- `BidModal.tsx` — `auctionClosed` prop added. Submit button disables with "Auction Closed" text when true.

**S433 Phase 2 (Migration required — MaxBidByUser table):**
- `schema.prisma` — MaxBidByUser model added with `@@unique([itemId, userId])`. Relations added to Item + User.
- Migration: `packages/database/prisma/migrations/20260410_add_max_bid_by_user/migration.sql` — NEW
- `shared/src/utils/bidIncrement.ts` — eBay-style tiered bid increment function (NEW)
- `itemController.ts` — `placeBid` rewritten for proxy bidding: user submits maxBidAmount, system auto-bids against competing maxes, calculates actual bid via `calculateBidIncrement()`, marks previous WINNING bids as OUTBID. Soft-close: bid in final 5 min → auction extended 5 min → `auctionExtended` socket emitted. `getBids` anonymized: shoppers see "Bidder 1/2/3", organizers see real names. `getItemById` computes `auctionStatus` (ACTIVE/ENDING_SOON/ENDED).
- `BidHistory.tsx` — New component: anonymized bid log with WINNING badge (NEW)
- `items/[id].tsx` — BidHistory wired in, `auctionExtended` socket listener, auction status badge rendered
- `jobs/auctionAutoCloseCron.ts` — 5-min cron: closes expired auctions, notifies winner + organizer (NEW)
- `index.ts` — Cron scheduled at startup

**S433 eBay categories finding:** Already working. EbayCategoryPicker exists in edit-item form. Export/push use `ebayCategoryMap.ts` runtime mapping. No schema fields needed. No additional UI work required.

**S433 ADR:** `claude_docs/architecture/ADR-013-auction-overhaul.md` — NEW

**S433 Files changed:**
- `packages/backend/src/controllers/itemController.ts`
- `packages/frontend/pages/items/[id].tsx`
- `packages/frontend/components/BidModal.tsx`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260410_add_max_bid_by_user/migration.sql` — NEW
- `packages/shared/src/utils/bidIncrement.ts` — NEW
- `packages/frontend/components/BidHistory.tsx` — NEW
- `packages/backend/src/jobs/auctionAutoCloseCron.ts` — NEW
- `packages/backend/src/index.ts`
- `claude_docs/architecture/ADR-013-auction-overhaul.md` — NEW

**S433 Migration required (run before pushing):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**S433 QA needed:**
- Phase 1: Place bid below reserve → rejected with error + reserve amount shown. Reserve badge renders correctly (amber → green as bids climb). Outbid notification fires to displaced bidder. Auction past deadline → auto-closes on next page load (no bid accepted).
- Phase 2: Set max bid $200 → system places actual bid. Competitor bids up → auto-counter. Bid in last 5 min → countdown extends 5 min + toast. Bid history shows Bidder 1/2/3 (not real names). Status badge: green ACTIVE → orange ENDING SOON → gray ENDED. Cron runs every 5 min (check Railway logs).

**⚠️ Auction cron audit needed (flagged 2026-04-10 friction audit):** Three auction job files now exist: `auctionCloseCron.ts` (deprecated stub S415), `auctionJob.ts` (declared authoritative S415), and `auctionAutoCloseCron.ts` (new from S433). Unclear if both `auctionJob.ts` and `auctionAutoCloseCron.ts` are wired in `index.ts` — could cause double-close on same auction. Dispatch `findasale-architect` to verify before next production deploy.

---

**S432 COMPLETE (2026-04-10):** eBay OAuth bug fixes + Stripe Connect status display + auction listing type display (3 layers).

**S432 Fixes:**
- `organizers.ts` — Added `stripeConnected: !!(organizer as any).stripeConnectId` to `/organizers/me` response.
- `settings.tsx` — Added `stripeConnected` state, set from `/organizers/me`. Payments tab now shows "Stripe Connected ✓" + "Manage Payouts" for connected organizers; unconnected still see "Setup Stripe Connect". eBay OAuth fixed: removed `/api/` double prefix from all 3 eBay calls; changed from axios-following `res.redirect()` to `res.json({ redirectUrl })` + `window.location.href`. Public eBay callback route un-gated from JWT middleware.
- `saleController.ts` — `getSale` now includes `listingType`, `auctionReservePrice`, `auctionClosed` in items select (were missing, causing auction items to render as fixed-price).
- `sales/[id].tsx` — Auction UI conditions updated to check `item.listingType === 'AUCTION'` in addition to `sale.isAuctionSale`. `listingType` added to Item interface.
- `add-items/[saleId].tsx` — Auction fields added (Starting Bid, Reserve Price, Auction End Time) when listing type is AUCTION. End time defaults to 8 PM night before sale start. Auction field name mapping fixed (form `startingBid` → API `auctionStartPrice`, etc.).
- `itemController.ts` — `getItemById` and `getItemsBySaleId` now include `auctionClosed` in select.
- `items/[id].tsx` — `isAuction` now checks `item.listingType === 'AUCTION'` in addition to `item.auctionStartPrice`. Fixes auction item detail page showing fixed-price UI.

**S432 Files changed:**
- `packages/frontend/pages/organizer/settings.tsx`
- `packages/backend/src/routes/organizers.ts`
- `packages/frontend/pages/sales/[id].tsx`
- `packages/frontend/pages/organizer/add-items/[saleId].tsx`
- `packages/backend/src/controllers/saleController.ts`
- `packages/backend/src/controllers/itemController.ts`
- `packages/frontend/pages/items/[id].tsx`

**S432 QA needed:**
- eBay OAuth: settings → eBay tab → Connect → eBay sign in → redirects back with success toast, connection status shows
- Stripe: connected organizer → settings Payments tab → shows "Stripe Connected ✓" + Manage Payouts (not Setup button)
- Auction item card: auction item on sale page shows bid UI, not Buy Now/Cart
- Auction item detail: `/items/[id]` for auction item shows bid UI, not fixed-price
- Auction create: add-items form → set listing type AUCTION → auction fields appear, end time defaults to 8 PM night before sale

---

**S431 COMPLETE (2026-04-09):** Treasure Trails map activation mode + 3 trail URL bugs fixed + XP purchase rate bug fixed.

**S431 Fixes:**
- `map.tsx` — `activeTrail` state + dismissal bar (trail name, "View Details →" link, ✕ close). Passes `activeTrail`/`setActiveTrail` props to SaleMap.
- `SaleMap.tsx` — `ActiveTrail` interface + optional props passthrough.
- `SaleMapInner.tsx` — `handleViewTrail(shareToken)`: fetches trail on click, sets `activeTrail`. CircleMarker rendering for stops (amber #F59E0B, radius 12). Fixed double `/api/` prefix bug: `api.get('/trails/${shareToken}')`.
- `trailController.ts` — `getTrail`: shareToken fallback lookup after ID lookup returns null. Fixes "Trail Not Found" on detail page.
- `useTrails.ts` — `usePublicTrail`: was calling `/trails/public/${shareToken}` (nonexistent route) → fixed to `/trails/${shareToken}`.
- `stripeController.ts` — P0 XP bug: `PURCHASE_COMPLETED` was awarding flat 1 XP regardless of amount. Fixed both POS path (`Math.floor(totalAmountCents/100 * XP_AWARDS.PURCHASE)`) and webhook path (`Math.floor(Number(purchase.amount) * XP_AWARDS.PURCHASE)`). Min 1 XP enforced.
- Test trail + 3 stops inserted into Railway DB directly via psycopg2 for testing.

**S431 Files changed:**
- `packages/frontend/pages/map.tsx`
- `packages/frontend/components/SaleMap.tsx`
- `packages/frontend/components/SaleMapInner.tsx`
- `packages/frontend/hooks/useTrails.ts`
- `packages/backend/src/controllers/trailController.ts`
- `packages/backend/src/controllers/stripeController.ts`

**S431 QA needed:**
- Trail activation: open map → click sale with trail → "View Treasure Trail →" button → trail stops appear as amber circles
- Trail dismissal: ✕ button removes stops from map
- Trail detail page: `/trail/[shareToken]` should now load (useTrails.ts fix deployed)
- XP: complete a purchase → check `PointsTransaction` for `Math.floor(amount)` XP, not flat 1

---

**S430 COMPLETE (2026-04-09):** Sale page layout cleanup, email spam fixes, iOS geo UX, organizer photo upload, label redesign, print label auth fix, activity dedup, auction Buy Now gate.

**S430 Fixes:**
- `emailTemplateService.ts` — removed literal `[UNSUBSCRIBE_URL]` placeholder from footer (spam trigger). Replaced with transactional email disclosure.
- `buyingPoolController.ts`, `collectorPassportService.ts` — unified sender from `findasale.com` (unverified) → `finda.sale` (verified in Resend).
- `posController.ts` — subject `"Payment link: $X"` → `"Your checkout is ready — $X"` (phishing trigger removed).
- `next.config.js` — added `api.qrserver.com` to `images.domains` (QR codes were silently blocked by Next.js image loader).
- `map.tsx` — Permissions API query-first pattern + two-phase accuracy + iOS-specific PERMISSION_DENIED messages.
- `index.tsx` — homepage auto-locates only when permission already `'granted'` (prevents iOS Safari false PERMISSION_DENIED).
- `sales/[id].tsx` — Removed broken duplicate LocationMap. Removed standalone HypeMeter card (moved inline above LiveFeedTicker). Removed ActivityFeed at bottom (duplicate). Removed SocialProofBadge ("Sale Activity" pill). Removed second Organized By card; moved "Plan My Route in Maps" button into Location card. Auction Buy Now gate hardened: `!sale.isAuctionSale && !item.auctionStartPrice`.
- `PickupBookingCard.tsx` — full dark mode. Internal post-purchase gate (only shows if user has a hold at sale).
- `sales/[id].tsx` — PickupBookingCard removed from sale page entirely.
- `checkout-success.tsx` — PickupBookingCard added to receipt page with haversine GPS gate: hidden if buyer is within 300m of sale (they're already there).
- `userController.ts` — `getPurchases` now includes `sale.lat`, `sale.lng`, `sale.id`, `sale.address` etc. for GPS check.
- `sales/[id].tsx` — Organizer photo management: "+ Add Photos" button in gallery (max 6), × remove on thumbnail hover, `handlePhotoUpload` (Cloudinary via existing `/upload/sale-photos`), `handleRemovePhoto`, file size validation.
- `edit-item/[id].tsx` — Print Label button fixed: was `window.open(url)` → now `api.get(responseType: 'blob')` + blob URL. Bearer token now sent correctly.
- `labelController.ts` — Label redesign: two-column layout (text left, QR right), QR 72×72 vertically centred, content block centred in label, removed `moveDown(0.5)` that caused blank second page, border 1pt inset from page edge.

**S430 Files changed:**
- `packages/backend/src/controllers/buyingPoolController.ts`
- `packages/backend/src/controllers/posController.ts`
- `packages/backend/src/controllers/userController.ts`
- `packages/backend/src/controllers/labelController.ts`
- `packages/backend/src/services/collectorPassportService.ts`
- `packages/backend/src/services/emailTemplateService.ts`
- `packages/frontend/components/PickupBookingCard.tsx`
- `packages/frontend/next.config.js`
- `packages/frontend/pages/index.tsx`
- `packages/frontend/pages/map.tsx`
- `packages/frontend/pages/sales/[id].tsx`
- `packages/frontend/pages/shopper/checkout-success.tsx`
- `packages/frontend/pages/organizer/edit-item/[id].tsx`

**S430 QA needed:**
- Email: send a payment link / invite email to Yahoo address → confirm not spam
- QR code on sale page: confirm QR image renders (not broken image)
- iOS map page: test geolocation → two-phase accuracy, correct error message if denied
- Sale page: confirm only 2 live activity elements (HypeMeter pill + LiveFeedTicker card)
- Sale page: auction items → confirm no "Buy Now" button
- Receipt page: organizer pickup slots only shown when buyer not at sale (GPS gate)
- Print label: open from edit-item page → PDF opens with no second blank page, content centred
- Photo upload: organizer adds photo from sale page → appears in gallery, capped at 6

---

**S429 COMPLETE (2026-04-09):** POS socket 502 fixes, payment intent fee bug, Stripe Connect invalid account, expired hold blocking, IDB crash fix, Request Cart Share feature. No migration required.

**S429 Fixes:**
- `PosPaymentRequestAlert.tsx`, `pos.tsx` — last two sockets still using polling → `transports: ['websocket'], upgrade: false`. Eliminates Railway 502s on those connections.
- `posPaymentController.ts` — `application_fee_amount` was 10% of the **total** on a PaymentIntent for card amount only (split payment). Changed to 10% of card portion. Was likely causing Stripe rejection on split payments.
- `pos.tsx` — surfaces actual Stripe error text (`err.response.data.error`) in errorMessage state so Patrick can diagnose Stripe rejections without reading logs.
- `stripeController.ts` — `createConnectAccount`: when `stripeConnectId` is a fake/seeded value (e.g. `acct_test_user3`), Stripe rejects login link. Was rethrowing. Now: detect invalid account error → clear `stripeConnectId` to null → fall through to create a real account. Settings → Setup Stripe Connect now works.
- `reservationController.ts` — `placeHold`: when item is RESERVED but the active reservation is past `expiresAt`, inline-expire it and allow the new hold. Cron runs every 10 min — users were blocked for up to 10 min after a hold expired.
- `offlineSync.ts` — add `onclose`/`onversionchange` handlers to clear stale `dbInstance` singleton. Add try/catch around `db.transaction()` in `getAllFromStore`. Fixes `InvalidStateError: The database connection is closing`.
- `posController.ts` — `sendPaymentLinkEmail`: new endpoint sends Stripe payment link URL via Resend to `buyerEmail`.
- `posController.ts` — `requestCartShare`: emits `CART_SHARE_REQUEST` socket event to shopper's device + creates in-app notification fallback. Confirmed working by Patrick.
- `pos.tsx` — "📲 Request Cart from Shopper" button in invoice panel. Polls 4s after request for cart.
- `PosPaymentQr.tsx` — mailto link replaced with real Resend email button (loading/sent states).
- `Layout.tsx` — `CART_SHARE_REQUEST` socket listener: if shopper has matching cart → auto-posts POSSession; otherwise shows actionable toast.
- `usePOSPaymentRequest.ts`, `useSaleStatus.ts`, `useLiveFeed.ts` — websocket-only transport (done earlier in S428/S429 context).

**S429 Files changed:**
- `packages/frontend/components/PosPaymentRequestAlert.tsx`
- `packages/frontend/pages/organizer/pos.tsx`
- `packages/backend/src/controllers/posPaymentController.ts`
- `packages/backend/src/controllers/stripeController.ts`
- `packages/backend/src/controllers/reservationController.ts`
- `packages/backend/src/controllers/posController.ts`
- `packages/backend/src/routes/pos.ts`
- `packages/frontend/components/PosPaymentQr.tsx`
- `packages/frontend/components/Layout.tsx`
- `packages/frontend/hooks/usePOSPaymentRequest.ts`
- `packages/frontend/hooks/useSaleStatus.ts`
- `packages/frontend/hooks/useLiveFeed.ts`
- `packages/frontend/lib/offlineSync.ts`

**S429 QA needed:**
- Socket 502: POS page → no 502 errors in Railway logs on WebSocket connections
- Split payment Send to Phone: $597.96 total, $250 cash, $347.96 card → should create PaymentIntent successfully
- Settings → Payments → Setup Stripe Connect: should redirect to real Stripe onboarding (not 500)
- Expired hold → user can immediately place new hold (no 10-min wait)
- Request Cart Share: organizer taps button → shopper gets notification → cart auto-appears in POS ✅ confirmed

---

**S428 COMPLETE (2026-04-09):** 4 POS bug fixes — no migration required.

**S428 Fixes:**
- `pos.tsx` — Invoice preview filter: `item.id !== hold.itemId` → `item.itemId !== hold.itemId` (5 occurrences). Root cause: `cartItem.id` is a generated UUID, not the DB item ID. `cartItem.itemId` is the actual Prisma item ID. Same bug fixed in `miscItems` prop to PosInvoiceModal. "📌 On Hold" badge in cart list also fixed.
- `pos.tsx` — `handleLoadHold`: now auto-merges shopper's open linked cart (from `linkedCarts` state) when loading a hold. Adds all shared cart items to POS cart. Toast shows item count.
- `pos.tsx` — Dark mode loaded hold card: `dark:bg-sage-900/20` → `dark:bg-gray-600` (20% opacity was too transparent against parent).
- `posController.ts` — `createPaymentLink` items check: removed `status: 'AVAILABLE'` filter and strict count check. Items may be mid-sale when QR is generated; `amount` is passed explicitly from frontend so the check was blocking QR generation unnecessarily.

**S428 Files changed:**
- `packages/frontend/pages/organizer/pos.tsx`
- `packages/backend/src/controllers/posController.ts`

**S428 QA needed:**
- Invoice preview: Load hold → add misc items → Send Invoice → verify hold item NOT duplicated in preview
- Load Hold: shopper with shared cart → Load Hold → cart should contain hold item + all shared cart items
- Dark mode: load a hold → invoice panel hold card should have dark gray background
- QR code: generate QR for cart with inventory items → 200 (not 400), shopper scans → no AccessDenied

---

## Next Session Priority

### S448 — QA Audit + Rank Staleness + Dashboard Rethink

**FIRST: QA audit of S447 shipped features (Chrome, sequential — before anything else)**

Real browser evidence required. Do not accept code-read as verification.
- `/shopper/early-access-cache` — loads, 100 XP activation flow completes
- Nav desktop + mobile: "Explorer's Guild" and "Explorer Profile" in all 3 sidebar locations
- AvatarDropdown: "Early Access Cache" present, zero "Lucky Roll" references
- `/shopper/loyalty` — h1 title reads "Explorer's Guild"
- `/shopper/explorer-passport` — h1 title reads "Explorer Profile"
- Haul posts feed: bumped post surfaces to top
- Coupon display on loyalty page: shows $0.75 / $2.00 / $5.00

**P0 BUG — Rank staleness sitewide (Patrick confirmed live on deployed site)**

Nav shows "Scout" for users who should be "Initiate". XP amounts inconsistent across pages (e.g. dashboard shows 505/1500 to next rank, loyalty shows 505/2000 — one is wrong).

Investigation order:
1. DB audit via psycopg2 — query guildXp for all test users; compare to what Chrome shows in nav
2. Find rank calculation function — grep for where guildXp maps to a rank name string (likely a utility + JWT payload)
3. **NAMING DECISION (surface to Patrick before fixing):** Patrick says Initiate→Scout→Hunter→Sage→Grandmaster. Prior locked decisions (S388/S445) used Scout→Ranger→Sage→Grandmaster. "Initiate" as 0-499 XP base tier and "Hunter" replacing "Ranger" need explicit Patrick sign-off. Don't rename in code until confirmed.
4. Root cause hypothesis: JWT carries guildXp/rank at login time; XP-earning events don't refresh the token → rank shown in nav is stale. Check authController — does it refresh rank in JWT on XP award?
5. XP threshold inconsistency: locked thresholds are 500/2000/5000/12000. Find every place in frontend that hardcodes a different threshold and fix to single source of truth.
6. After Patrick confirms naming: dispatch findasale-dev to fix rank calculation + JWT refresh + all display locations in one pass.

**Tier perks visibility**

Each rank needs a visible perks list somewhere in the product (what does Scout unlock that Initiate doesn't?). Dispatch findasale-gamedesign to spec perks per tier (if not already done), then build the display — could live on loyalty page, a dedicated ranks page, or a tooltip on the rank badge.

**Dashboard rethink — creative angle (parallel with rank investigation)**

Shopper dashboard is busy/cluttered. The gamification layer (XP, rank, Early Access Cache, achievements, guild) feels like 5 bolted-on widgets. Dispatch findasale-ux to propose a creative consolidation: one cohesive "home base" experience. Include the page staleness/data consistency problem as a constraint — the redesign must surface the right numbers in one canonical place.

**Existing queue (lower priority):**
- Workspace QA results → dispatch fixes
- Organizer Special badge (public sale page shows $X off when organizerDiscountAmount > 0)
- Price Research Card redesign (spec at claude_docs/design/PRICE_RESEARCH_CARD_UX_SPEC.md)
- Brand audit copy: SharePromoteModal, homepage meta, organizer profile meta

### Deferred
- Referral fraud gate (D-XP-004: 24h payment-cleared hold + email+phone verification)
- Device fingerprinting Phase 2 (FingerprintJS — defer until beta scale justifies)
- Bounty redesign Phase 2
- Flea Market Events full implementation (ADR-014 locked)
- Stripe Connect webhook config (items not marking SOLD after POS payment)
- Bounties dollars vs XP: open decision

**⏸️ QA QUEUE — postponed:**
- S436: earnings/qr-codes/staff pages
- S430: Yahoo spam test, iOS geolocation, sale page activity dedup, print label, photo upload
- S431: Trail detail page, trail stops on map
- S427: Full invoice flow, cart-only invoice
- S433: Auction reserve/proxy/soft-close/bid history/cron

---

## Blocked/Unverified Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|----------------|---------------|
| #143 PreviewModal onError | Code fix pushed (sha: ffa4a83). 📷 fallback on Cloudinary 503 in place. | Defensive fix only — can't trigger 503 in prod. ACCEPTABLE UNVERIFIED. | S312 |
| #143 AI confidence — Camera mode | cloudAIService.ts fix is code-correct; processRapidDraft passes aiConfidence through. Can't test without real camera hardware in Chrome MCP. | Real device camera capture → Review & Publish → confirm "Good (X%)" or similar. | S314 |
| Single-item publish fix | S326 code fix deployed. S327 confirmed API call fires but no DRAFT items exist to test the button. Manual Entry creates AVAILABLE items, skipping draft pipeline. | Camera-capture an item → go to Review & Publish → click Publish on single item → confirm status changes + toast. | S326/S327 |
| ValuationWidget (S406) | No draft items in user2's sales (all 11 are Live). TEAMS tier required. | TEAMS organizer with draft item → Review page → confirm ValuationWidget renders with auth fix + dark mode. | S406 |
| Treasure Trails check-in (S404) | No trail data in DB (test trail inserted S431 via psycopg2). | Organizer creates a trail → shopper navigates to /trails/[id] → checks in at a stop → confirm XP awarded. | S406 |
| Review card redesign (S399) | No draft items for any test organizer. | Camera-capture an item → go to Review page → confirm new card redesign (Ready/Needs Review/Cannot Publish) renders. | S406 |
| Camera thumbnail refresh (S400/S401) | Requires real camera hardware in Chrome MCP. | Capture photo in rapidfire → confirm thumbnail strip updates live without page reload. | S406 |
| POS camera/QR scan (S405) | Camera hardware required for scan flow. | Organizer opens POS → taps QR tile → camera opens → scan item sticker → confirm added to cart. | S406 |

---

## Standing Notes

- Railway backend: https://backend-production-153c9.up.railway.app
- Vercel frontend: https://finda.sale
- Test accounts: user1 (TEAMS), user2 (organizer SIMPLE), user3 Carol Williams (TEAMS), user11 Karen Anderson (shopper, Hunt Pass active), user12 Leo Thomas (shopper). All passwords: password123
- eBay: production credentials live in Railway. Browse API confirmed returning real listings.
- POS test: Organizer must have Stripe Connect account configured; shopper must be linked via QR scan first
- DB: Railway PostgreSQL (`maglev.proxy.rlwy.net:13949/railway`) — see CLAUDE.md §6 for migration commands
- Backend route mounts: `app.use('/api/organizers', organizerRoutes)`, `app.use('/api/sales', saleRoutes)`, `app.use('/api/trails', trailRoutes)`, `app.use('/api/boosts', boostsRouter)`, `app.use('/api/lucky-roll', luckyRollRouter)`
- **Stripe Connect webhook (P2 — unresolved since S421):** Configure in Stripe Dashboard → Events on Connected accounts → `payment_intent.succeeded` → URL: `https://backend-production-153c9.up.railway.app/api/webhooks/stripe` → copy secret → Railway env `STRIPE_CONNECT_WEBHOOK_SECRET`. Without this, items aren't marked SOLD after POS card payment.
- **STATE.md compacted 2026-04-10:** Sessions S427 and older archived to `COMPLETED_PHASES.md` by daily-friction-audit. ~2,300 lines removed.
