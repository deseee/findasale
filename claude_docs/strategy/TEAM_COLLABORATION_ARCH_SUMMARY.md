# Team Collaboration System — Executive Summary

**Prepared for:** Patrick  
**Date:** 2026-04-11  
**Status:** Architecture approved, ready for dev dispatch

---

## What You're Approving

You've locked 5 strategic decisions for the team collaboration system. This document covers what the system will do, how it's structured, and when it ships.

---

## The Four Pages (All TEAMS Tier)

### 1. Staff Page (`/organizer/staff`)
Your team roster with full employee profiles:
- **Contact info** (phone, email)
- **Skill badges** (Photo Detail, Pricing Expert, Customer Facing, etc.)
- **Daily availability calendar** (integrates with Google Calendar optional)
- **Performance snapshots** (items tagged, POS transactions, photo quality this week)
- **Emergency role assignment** (who covers cashier, photographer, runner if someone no-shows)
- **Quick links** to POS, inventory, messaging, task board

### 2. Workspace Settings (`/organizer/workspace`)
Control center for workspace configuration:
- **Workspace templates** (Empty, Solo, 2-Person, 5-Person, Custom) — auto-configure default roles + permissions
- **Editable role permissions** — you decide what each role can do (view inventory, add items, edit pricing, process POS, etc.)
- **Workspace description & brand rules** — dress code, photo standards, arrival time
- **Real-time cost calculator** — see your bill breakdown: $79 TEAMS base + ($20 × additional seats)
- **Member management** — invite, remove, promote (default 5 seats, $20/mo per additional)

### 3. Workspace View (`/workspace/[slug]`)
Internal team collaboration hub (NOT public anymore):
- **Live sales board** — all active + upcoming sales with real-time stats (items sold, hold success rate, staff assigned)
- **Team chat per sale** — Pricing questions? Inventory issues? Per-sale discussion thread
- **Task distribution board** — create tasks, system suggests best staff (matches required skills + availability)
- **Team leaderboard** — weekly rankings (items tagged, POS transactions, revenue attribution)

### 4. Command Center (`/organizer/command-center`)
Operational dashboard with alerts + trends:
- **Live activity feed** — see what your team is doing right now (John sold antique mirror for $450)
- **Weather alerts** — rain expected Tuesday 10-2pm? Heads up.
- **Inactivity alerts** — no one's rung a sale in 45 min during sale hours (usually activity is high)
- **Coverage gap warnings** — no cashier assigned 2-4pm on Saturday (you assign staff to roles per sale)
- **Revenue analytics** — heatmap: who made what, day-by-day; YTD comparison; retention signals

---

## Data Model (Plain English)

### New Database Tables (12)

1. **WorkspacePermission** — Granular permission system. Instead of "Admin can do X" hardcoded, you define per-workspace what each role does.
2. **StaffMember** — Extended profile (extends existing WorkspaceMember): phone, skills, emergency roles.
3. **StaffAvailability** — Weekly calendar + date overrides (integrates Google Calendar).
4. **StaffPerformance** — Weekly/monthly snapshots (items tagged, POS transactions, revenue this week).
5. **WorkspaceSettings** — Workspace metadata: description, brand rules, member limits, template used.
6. **WorkspaceSalesActivity** — Real-time event feed (item sold, hold placed, etc.) for activity board.
7. **WorkspaceSaleChat** — Per-sale discussion threads.
8. **WorkspaceChatMessage** — Messages in those threads.
9. **WorkspaceTask** — Tasks you create (with skill requirements + deadline).
10. **WorkspaceLeaderboardEntry** — Weekly team rankings.
11. **WorkspaceRevenueSnapshot** — Daily revenue breakdown (staff × revenue).
12. **WorkspaceAlert** — Coverage gaps, weather, inactivity alerts.

### Schema Changes

- **3 migrations** (sequential, no conflicts):
  1. Add roles + permissions infrastructure
  2. Add staff management tables
  3. Add real-time + analytics tables

- **No breaking changes** to existing models (Sale, Organizer, Item, User, etc.)

- **Safe rollback:** Each migration can be reverted independently

---

## Permission Model (How It Works)

### Problem Solved
Today: roles are hardcoded (ADMIN does everything, MEMBER can't do much). Can't customize.

### Solution
You define permissions per role, per workspace:
- OWNER: Everything (you)
- ADMIN: Everything except billing
- MANAGER: Day-to-day ops (view inventory, add items, edit pricing, process POS, create tasks)
- STAFF: Frontline work (add items, process POS, send chat messages)
- VIEWER: Read-only (family member observing)

**You can customize:** Any role can have any mix of permissions. System defaults provided, but you override.

### How It Works at Runtime
1. Staff member logs in → system loads their workspace role
2. Staff clicks "Edit Price" → backend checks: "Does MANAGER role have edit_pricing permission?"
3. If yes → allowed. If no → 403 error.
4. Permissions cached (1 hour) for speed. Automatically refresh on role change.

---

## API Summary (For Developers)

**25+ new endpoints** across 6 areas:
- Staff management (GET list, PATCH profile, sync Google Calendar)
- Workspace settings (GET/PATCH config, apply templates, check billing)
- Workspace view (live sales board, activity feed, chat, task suggestions)
- Task distribution (CRUD tasks, smart assignment by skills + availability)
- Team leaderboard (weekly stats, per-week fetch)
- Analytics (revenue heatmap, YTD comparison, alerts)

All endpoints are **TEAMS tier only** (checked at auth time).

---

## Real-Time Features (WebSocket)

Workspace uses same Socket.io infrastructure as auction bidding, but separate namespace (`/workspace/:workspaceId` vs. `/sale/:saleId`).

Events pushed in real-time:
- **Activity feed** — Item sold, hold placed, price changed
- **Chat messages** — New message in sale thread
- **Alerts** — Coverage gap detected, weather warning
- **Tasks** — Task assigned, completed
- **Availability** — Staff member updated calendar

Frontend receives updates instantly (no polling).

---

## Implementation Timeline

**Phase 1: Core (Sessions 1–2)**
- Schema + migrations
- Permission middleware + caching
- Staff management endpoints

**Phase 2: UI Foundations (Sessions 3–4)**
- Staff page (list, detail, calendar, skills, performance)
- Workspace settings (templates, role builder, description, billing)

**Phase 3: Real-Time (Sessions 5–6)**
- Live sales board + activity feed (Socket.io)
- Team chat (per-sale threads)
- Alerts (coverage gaps, weather, inactivity)

**Phase 4: Tasks & Leaderboard (Sessions 7–8)**
- Task distribution board (skill-based smart assignment)
- Team leaderboard (weekly rankings)

**Phase 5: Analytics & Polish (Session 9)**
- Revenue heatmap, YTD comparison, retention signals
- Dark mode, mobile, accessibility

**Total:** 5 phases, 9 sessions, ~2–3 weeks of dev work

---

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Large schema migration | 🔴 HIGH | Split into 3 sequential migrations, local testing, Railway backup |
| Stale permissions cache | 🟠 MEDIUM | 1-hour TTL, explicit invalidation on role change, DB fallback |
| Real-time event ordering | 🟠 MEDIUM | All events timestamped, idempotent handlers, catchup on reconnect |
| Activity feed volume | 🟡 MEDIUM | Archive after 30 days, pagination, index optimization |
| TEAMS tier gate bypass | 🔴 HIGH | Decorator on all endpoints, frontend TierGate, tier checks in auth, audit log |

**All mitigations are documented in the full ADR.**

---

## What's NOT Included (Out of Scope for MVP)

- ❌ Multiple workspaces per organizer (hide feature, validate with beta first)
- ❌ Bulk member invite via CSV (enterprise feature, future)
- ❌ Advanced scheduling / shift templates (future)
- ❌ Real-time staff location / GPS (future)
- ❌ Payroll integration (future)

---

## Costs & Feasibility

### Development Cost
- Schema: 1 session
- Middleware + endpoints: 1 session
- Frontend foundation: 2 sessions
- Real-time: 2 sessions
- Tasks + leaderboard: 2 sessions
- Analytics + polish: 1 session
- **Total: 9 sessions** (~3 weeks, 8–10k tokens/session)

### Operational Cost
- **Redis cache** for permissions (already in use for auctions, minimal additional load)
- **Background jobs** (3):
  - Staff performance snapshot (daily, 2 AM, ~1 min runtime)
  - Leaderboard snapshot (weekly, Sunday midnight, ~2 min runtime)
  - Activity archive (daily, 3 AM, moves 30+ days old, ~1 min runtime)
- **Database storage** for activity feed (~1MB per 10k events, archivable)

**Estimate:** $0 incremental cost (uses existing infrastructure)

---

## Success Criteria

### Beta Validation
- Organizers can manage teams (invite, remove, roles)
- Staff can see their availability calendar + update it
- Real-time activity feed updates without refresh
- Task board correctly matches staff by skills + availability
- Weekly leaderboard computes and displays correctly
- No permission bypass (tier gate enforced)

### Launch Readiness
- All 4 pages fully functional with real data
- 3+ organizers with 2+ team members using the system
- Chat + alerts working in real-time
- Analytics dashboard showing accurate revenue attribution
- Mobile responsive (all pages tested on iPhone 12)

---

## Next Steps

1. **Review & Approve:** Confirm the 4 pages, locked decisions, timeline
2. **Dev Dispatch:** Send ADR to findasale-dev, start Session 1 (migrations)
3. **QA Planning:** Define test scenarios for each phase (provided separately)
4. **Beta Coordination:** Identify 2–3 organizers willing to use team features during beta

---

## Questions?

Full technical details, API contracts, WebSocket events, security, testing strategy, deployment checklist — all in the complete **TEAM_COLLABORATION_ADR.md** document.

**Ready to approve and dispatch?**
