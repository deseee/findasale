# Brand & Design Decisions Registry

**Purpose:** Single source of truth for standing design, UX, and product decisions that MUST be enforced across all sessions and subagent dispatches. This file is loaded at session init and checked as a mandatory pre-flight gate by findasale-dev and findasale-qa.

**Owner:** findasale-records (maintenance), Patrick (approval)
**Created:** Session 239 (2026-03-22)
**Authority:** Tier 2 Living Document — `claude_docs/brand/`

---

## How to Use This File

**Subagents:** Before implementing or reviewing any user-facing feature, read this file and identify which decisions apply to your work. Violations of these decisions are BLOCKERs, not suggestions.

**Adding decisions:** Only findasale-records may add entries. New decisions require Patrick's approval or explicit session consensus. Each entry must include: Decision, Rationale, Affected Surfaces, Enforcement, and Last Updated.

**Reviewing decisions:** Monthly audit by cowork-power-user. Stale decisions get flagged to Patrick.

---

## D-001: All Sale Types Scope

**Decision:** FindA.Sale serves ALL secondary resale event types — estate sales, garage/yard sales, auctions (live and online), flea markets, tag sales, rummage sales, consignment events. No copy, UI, or marketing may treat estate sales as the default with others as afterthoughts.

**Rationale:** TAM expansion. The secondary resale market is much larger than estate sales alone. Brand voice guide (2026-03-16) codifies this.

**Affected Surfaces:**
- Homepage hero copy, meta description, schema.org markup
- Pricing page tier descriptions and use-case language
- About page mission statement
- All organizer onboarding flows
- All marketing, email, and social media copy
- Hub pages and sale type filtering
- Skill descriptions that mention "estate sales"

**Enforcement:** Brand voice guide checklist (claude_docs/brand/brand-voice-guide-2026-03-16.md). Weekly drift detector scheduled task. findasale-marketing mandatory read.

**Reference:** `claude_docs/brand/brand-voice-guide-2026-03-16.md`
**Last Updated:** 2026-03-22 (S239)

---

## D-002: Full Dark Mode Support

**Decision:** Every user-facing page and component MUST have complete dark mode support. All Tailwind classes that set colors must include a `dark:` variant. No exceptions. No "we'll add dark mode later."

**Rationale:** Organizers work at night (staging sales, photographing items). Shoppers browse at all hours. Accessibility requirement. Multiple sessions have caught dark mode regressions (S239: NotificationBell invisible, S237: hub pages).

**Affected Surfaces:**
- Every `.tsx` component and page in `packages/frontend/`
- Tailwind config: `darkMode: "media"`
- All new components created by findasale-dev

**Enforcement:** findasale-dev Human-Ready Gate (mandatory pre-handoff check). findasale-qa review checklist. Weekly UX spotcheck scheduled task. Polish Agent post-dev audit.

**Test Protocol:** For each component: verify text is readable, backgrounds contrast properly, interactive states (hover, focus, active) have dark variants, conditional styles (e.g., unread badges) use dark-aware colors.

**Last Updated:** 2026-03-22 (S239)

---

## D-003: Empty States Must Have CTAs

**Decision:** Every page or component that renders data-dependent content MUST have an intentional empty state with a clear call-to-action. No blank pages. No "No data" with nothing else. Empty states should guide the user toward the next useful action.

**Rationale:** Beta testers will encounter empty states frequently (new accounts, no sales yet, no messages). A blank page feels broken. A CTA feels guided.

**Affected Surfaces:**
- Sale listings (no sales in area)
- Messages/inbox (no conversations)
- Dashboard metrics (no sales yet)
- Item search results (no matches)
- Organizer workspace (no active sales)
- Team member lists (no teammates)
- Any list or grid that could be empty

**Enforcement:** findasale-dev Human-Ready Gate. findasale-ux pre-ship audit. Polish Agent.

**Last Updated:** 2026-03-22 (S239)

---

## D-004: Mobile-First Layout

**Decision:** All pages must be designed and tested mobile-first. No feature ships without verifying it doesn't break on 375px viewport (iPhone SE). Tap targets must be at least 44px. No horizontal scroll.

**Rationale:** Shoppers browse on phones at sales. Organizers check dashboards on phones during events. Mobile is the primary use case, not an afterthought.

**Affected Surfaces:**
- All pages in `packages/frontend/pages/`
- All components with grid/flex layouts
- Navigation, modals, dropdowns
- Image displays and galleries

**Enforcement:** findasale-dev Human-Ready Gate. Weekly UX spotcheck. Chrome MCP viewport testing.

**Last Updated:** 2026-03-22 (S239)

---

## D-005: Multi-Endpoint Feature Testing

**Decision:** Any feature that involves communication or interaction between users, roles, or teammates MUST be tested from EVERY participant's perspective. Sender AND receiver. Poster AND viewer. Team admin AND team member. Organizer AND shopper.

**Rationale:** Features that work from one side but not the other are invisible bugs until a real user hits them. Messaging, noteboards, team features, sale interactions, reviews — all have multiple endpoints.

**Affected Surfaces:**
- Messaging system (organizer↔shopper, team member↔team member)
- Review/rating system (shopper posts, organizer sees)
- Team features (admin manages, members view/use)
- Sale interactions (organizer lists, shopper browses/buys)
- Notification system (trigger side AND receive side)
- Live bidding (auctioneer AND bidder)
- Any future feature with role-based views

**Test Protocol:**
1. Identify all participant roles for the feature
2. Test the complete flow from each role's perspective
3. Verify data appears correctly on both/all ends
4. Test edge cases: what if one side deletes? what if one side is offline?
5. For team features: test with 1 member, 2 members, and at capacity

**Enforcement:** Mandatory in findasale-qa checklist. findasale-dev must identify all endpoints in handoff. Polish Agent verifies bidirectional flows.

**Last Updated:** 2026-03-22 (S239)

---

## D-006: Sale Detail Page Section Order

**Decision:** Sale detail pages (`pages/sales/[id].tsx`) follow this section order:

1. Sale Header (title, type badge, dates, status)
2. Organizer Info Card
3. Flash Deal Banner (conditional)
4. Two-column grid: [Photo gallery + About description] | [Share, QR, Contact, LiveFeed, Pickup sidebar]
5. Sale Items (first full-width section — this is what shoppers come for)
6. Community Photos / UGC (conditional)
7. Map / Location
8. Reviews
9. Modals

**Rationale:** Items are the primary reason shoppers visit a sale page. They must not be buried below UGC, map, or duplicate photo sections. Fixed in S239 after items were at the very bottom.

**Affected Surfaces:** `packages/frontend/pages/sales/[id].tsx`

**Enforcement:** findasale-dev must verify section order after any edit to this page. findasale-qa includes section order in sale detail review.

**Last Updated:** 2026-03-22 (S239)

---

## D-007: Teams Tier — Member Cap (LOCKED)

**Status:** ✅ LOCKED — S240 (2026-03-22), approved by Patrick via advisory board

**Decision:** Teams tier caps at **12 members**. Enterprise tier exists above Teams with unlimited members, unlimited items/sale, priority support, and API consultation. Enterprise is contact-sales only ($500–800/mo floor, annual contracts), implemented as an `isEnterpriseAccount` feature flag on the Org model — not a billing tier in code. Enterprise eligibility: 50+ sales/year OR 3+ locations.

**Rationale:** 10 is too tight for regional crews with seasonal staff; 15 adds unnecessary overhead. 12 covers a full regional operation plus overflow. Enterprise above creates natural upgrade pressure without complicating the billing tier model.

**Implementation:**
- Backend: add `maxTeamMembers: 12` enforcement in team membership controller; add `isEnterpriseAccount: Boolean` field to Org model via migration
- Pricing page: update Teams tier to show "Up to 12 members" and add Enterprise CTA
- Team management UI: show member count and cap; block additions beyond 12 for non-Enterprise orgs

**Affected Surfaces:**
- Pricing page
- Team management UI
- Backend team membership controller
- Org model (schema.prisma)

**Last Updated:** 2026-03-22 (S240)

---

## D-008: Loading States Are Mandatory

**Decision:** Every page and component that fetches data MUST show a meaningful loading state. No blank white screens while data loads. Skeleton screens preferred over spinners for content-heavy pages.

**Rationale:** First impression matters for beta testers. A blank page during load feels broken. Skeleton screens feel fast and intentional.

**Affected Surfaces:**
- All pages with `useQuery` or `useSWR` or `useEffect` data fetching
- Dashboard pages, sale listings, item grids
- Profile pages, team management

**Enforcement:** findasale-dev Human-Ready Gate. findasale-qa frontend checklist.

**Last Updated:** 2026-03-22 (S239)

---

## D-009: Error States Must Have Recovery Paths

**Decision:** Every error state must include: (1) a human-readable explanation of what went wrong, (2) a clear action the user can take to recover (retry, go back, contact support). No raw error codes. No dead ends.

**Rationale:** Beta testers hitting errors with no recovery path will abandon the product. Every error is an opportunity to retain the user.

**Affected Surfaces:**
- API error handling in frontend
- Form validation feedback
- Payment failure screens
- 404 and generic error pages
- Network timeout handling

**Enforcement:** findasale-dev Human-Ready Gate. findasale-qa review checklist.

**Last Updated:** 2026-03-22 (S239)

---

## D-010: No Autonomous Removal of User-Facing Content

**Decision:** No subagent may remove a feature, nav link, UI element, route, page, or user-facing content without explicit Patrick approval. When an audit or QA finding identifies something as broken, redundant, or misplaced, the correct response is to surface a decision point (REMOVE / FIX / REDIRECT / REPLACE) — never to silently remove.

**Rationale:** Recurring pattern across S237, S247, and earlier: audit flags something → subagent "fixes" by removing → working feature disappears → Patrick discovers it's gone → time wasted restoring. Removal is a product decision, not an implementation decision. "My Wishlists" link removed in S247 without approval; organizer profile content hidden in S237 with no replacement built. Both required emergency restoration.

**Affected Surfaces:**
- All navigation (AvatarDropdown, Layout drawer, BottomTabNav, footer, header)
- All page files under `packages/frontend/pages/`
- All route registrations in backend
- Any JSX that renders links, buttons, or content sections visible to users
- Any page, route, component, function, or endpoint that COULD be reached by a user or called by another module — "not wired into nav" and "no callers found" do NOT make something dead code

**Enforcement:**
- CLAUDE.md §7 Removal Gate (mandatory for all subagents)
- findasale-dev pre-deletion check (must return decision point, not ship removal)
- findasale-qa findings must use "DECISION NEEDED" label when recommending removal
- Main session surfaces all removal decisions to Patrick verbatim

**Last Updated:** 2026-03-23 (S248)
