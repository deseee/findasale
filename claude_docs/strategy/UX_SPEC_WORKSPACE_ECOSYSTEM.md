# UX Spec: Workspace Ecosystem (4-Page Cohesion)

**Status:** Design Spec — Ready for Patrick Review  
**Date:** April 2026  
**Scope:** Staff, Workspace Settings, Workspace View, Command Center  
**Audience:** FindA.Sale TEAMS tier organizers (non-technical, mobile-first)

---

## Executive Summary

These 4 pages form the **organizer's hub system**: a cohesive ecosystem where daily work flows naturally from monitoring sales (Command Center) → assigning work (Workspace View) → managing team (Staff) → adjusting structure (Workspace Settings).

The problem today: Staff and Workspace Settings are *mechanically* different but *functionally overlapping*, creating confusion ("Why are there two team pages?"). This spec clarifies the purpose of each, redefines clear task boundaries, and ensures visual/navigational consistency.

**Core principle:** Each page owns ONE user job. Violation of this principle wastes organizer time and creates support burden.

---

## Page Relationship Map

### User Journey Through the Ecosystem

```
MORNING: Check Sales Status
    └─> Command Center ──┐
         (aggregate      │
          all sales)     │
                         ├─> Drill into a single sale
                         │   for details
                         │
INTRADAY: Manage Day-to-Day Work
    └─> Workspace View ──┐
         (calendar,      │
          tasks,         ├─> Monitor team activity,
          messages)      │   assign work, message
                         │
END-OF-DAY/WEEK: Staffing Changes
    └─> Staff ─────────┬─> Add/remove members
         (who's on      │   Check availability
          the team)     │   View invite status
                        │
SETUP/ADMIN: Structure & Rules
    └─> Workspace Settings ──┐
         (workspace details, │
          tier options,      ├─> Adjust settings
          role permissions)  │   Create new workspace
                             │
                        ┌────────────────────────┐
                        │ All pages link to each │
                        │ other via subnav       │
                        │ (not scattered links)  │
                        └────────────────────────┘
```

### Ownership Matrix

| Page | Primary Job | Secondary Job | Owner Role | Access Tier |
|------|-------------|---------------|-----------|-------------|
| **Command Center** | View live sale status across portfolio | Spot problems early, prioritize firefighting | Owner + Admin | TEAMS |
| **Workspace View** | Assign tasks, coordinate team on active sales | Track progress, message team, capture calendar | Owner + Admin + Members | TEAMS |
| **Staff** | Add/remove team members | View who's invited, confirm acceptance | Owner only | TEAMS |
| **Workspace Settings** | Configure workspace defaults & capacity | Create new workspace, set role permissions | Owner only | TEAMS |

**No Member can edit Staff or Settings.** Members enter Workspace View only.

---

## Page Specifications

### 1. COMMAND CENTER (`/organizer/command-center`)

**Job to be Done (30 sec):** "I want to see all my sales at a glance and spot any that need attention in the next hour."

**What Currently Stops Them:** Nothing major — this page is well-designed. Refinement needed only.

**Sections:**

#### A. Header + Status Tabs
- **Tab: Active** — Sales happening right now (startDate ≤ now ≤ endDate, status=PUBLISHED)
- **Tab: Upcoming** — Sales within 7 days (includes scheduled but not started)
- **Tab: Recent** — Sales ended in last 14 days (closure window for questions)
- **Tab: All** — Everything (for quarterly review)
- **Default open:** Active tab

**Justification:** Organizers scan "what's burning NOW?" first. Tab structure trains eyes to the right data at the right moment.

#### B. Summary Metrics (Sticky when scrolling on mobile)
- **Active Sales:** Count with "↑ 2 from yesterday" trend (optional)
- **Total Items:** Count across active sales only
- **Revenue (active):** YTD total or active-window total (decide based on Patrick's reporting needs)
- **Pending Actions:** Count, red if >0

**Justification:** Action-first: these numbers drive decisions. Red pending count creates urgency without a dashboard redesign.

#### C. Per-Sale Cards (Vertical stack on mobile, grid on desktop)
Each card shows:
- **Sale Title** (link to sale detail page)
- **Status badge** (LIVE, UPCOMING, ENDED)
- **Dates** (start + end, relative format: "2 days left")
- **Location** (city)
- **Quick Actions Button:** Opens 3-action menu:
  - View Sale (goes to /sales/{id})
  - Message Team (goes to Workspace View filtered to this sale)
  - Manage Items (goes to /organizer/sales/{id}/items)
- **Status Widget** (for active sales only): Expandable card showing:
  - Items by status (listed, sold, pending)
  - Open messages count
  - Last 3 actions (timestamps)
  - Suggested action ("2 items have no photos" / "1 message unread")

**Justification:** Organizers make split-second decisions. Show the "why click" before the click.

#### D. Empty State
If no sales match filter:
- **Illustration** + **Message:**
  - Active tab: "No sales running. Schedule one to begin."
  - Upcoming tab: "Nothing scheduled. Create a sale?"
  - Recent tab: "Completed sales appear here after they end."
- **CTA:** Link to dashboard to create/edit sales

**Mobile Considerations:**
- Stack metrics in 1-column grid (not 4-column)
- Sale cards full width, touch-friendly tap areas (≥48px)
- Status widget collapses by default on card; expand on tap
- Sticky tab bar at top; sticky metrics below header for quick reference

---

### 2. WORKSPACE VIEW (`/workspace/{slug}`)

**Job to be Done (5 min):** "I need to see what my team is doing today, assign work, and communicate changes about a specific sale."

**What Currently Stops Them:** This page does NOT yet exist as a team collaboration surface. Today it's a public-facing "read-only sales showcase." Spec redefines it as an **internal workspace view** — a shared team calendar + task board + message hub.

**Current State (public):** Team member count, workspace lead name, published sales list. This is **fine for external audiences** (shoppers, other organizers). But organizers never click this link when logged in.

**Proposed Design (internal, team-only):**

#### A. Header
- Workspace name (linked to settings for owner)
- Breadcrumb: Dashboard → Team View
- "This workspace / [Workspace name]" — contextual anchor

#### B. Left Sidebar (mobile: collapsed nav)
- **Active Team** (clickable list)
  - Owner (with "Owner" label)
  - Invited members (with "Pending" badge if not accepted)
  - Number of team members
- **Quick Links**
  - Command Center (back to aggregated view)
  - Staff (manage team, owner only)
  - Workspace Settings (edit details, owner only)

#### C. Main Content: Tabbed Interface

**Tab: Calendar** (default)
- Month view (or weekly for mobile)
- Color-coded by sales (each sale = one color)
- Click a date → see sales starting that day
- Team member availability toggles (if scheduling integration exists; if not, plan for future)
- **Action:** Click sale → drill into Sale Detail for that sale (with "assign task" button)

**Tab: Tasks** (if implemented)
- Kanban-style columns: To Do / In Progress / Done
- Each task shows: task title, assignee, due date, sale it relates to
- Drag to change status
- Click task → inline edit modal
- **Add Task** button → new task form

**Feature note:** This may be Phase 2. Confirm with Patrick.

**Tab: Messages**
- Thread list (grouped by sale or by person)
- Filter by sale or by person
- Click thread → expand conversation
- Reply field inline
- Notification count badge on tab
- **Smart default:** Show unread first

**Tab: Team Activity** (optional, Phase 2)
- Timeline: "Jane added 5 items to Estate Sale 2 | 2 hours ago"
- "Bob marked item #34 sold | 1 hour ago"
- Filterable by member, by sale
- Real-time updates (toast notifications)

#### D. Mobile Considerations
- Tabs become bottom navigation on mobile (Calendar / Tasks / Messages / Team)
- Left sidebar collapses into hamburger menu
- Calendar: switch to week view by default (month is hard to parse on 375px)
- Drag-to-reorder tasks → replaced with Action Menu (⋯) → Move To → [Status]

---

### 3. STAFF PAGE (`/organizer/staff`)

**Job to be Done (3 min):** "I need to add a new team member or remove someone who left. I want to see who's accepted their invite."

**What Currently Stops Them:** Nothing major — page works. Changes needed are **polish + clarity**.

**Current State:** Invite form, member roster with join dates and roles. TEAMS tier gated.

**Proposed Changes:**

#### A. Header
- Same as Command Center for consistency
- Breadcrumb: Dashboard → Staff

#### B. Workspace Selector (if user owns multiple workspaces)
- Dropdown: "Workspace: [Name]"
- Switch workspace → reload staff list for that workspace
- **Note:** Most TEAMS organizers start with 1 workspace. Plan for future scaling.

#### C. Team At-a-Glance
- **Team size:** "3 / 5 members" (show max capacity)
- **Pending invites:** "2 awaiting response"
- **Last added:** "Jane (2 days ago)"

#### D. Invite New Member (Owner only)
- **Form fields:**
  - Email address (required)
  - Role dropdown: Member / Admin
  - Optional: "Notify via email" toggle (default: on)
- **Submission:** "Send Invite" button
- **Success:** Toast "Invite sent to jane@example.com"
- **Error handling:** "Email already invited" / "Email is team member" / "Invalid email"

**Justification:** Organizers do this rarely (maybe once a month). Form should be simple, not a multi-step wizard.

#### E. Team Member Roster (Sortable table on desktop, cards on mobile)
**Columns:**
- **Name** (profile photo + business name)
- **Email** (clickable to copy)
- **Role** (Member / Admin) — Owner only can see/change
- **Status** (Accepted / Pending) — clear visual: green checkmark or yellow "Pending"
- **Joined** (date in relative format: "3 days ago")
- **Actions** (Owner only):
  - Remove member (with confirmation dialog: "This cannot be undone. Remove Jane?")

**Mobile card format:**
```
┌─────────────────────────┐
│ 📷 Jane Smith           │
│ jane@example.com        │
│ Role: Admin | Pending   │
│ Joined: 3 days ago      │
│ [Remove]                │
└─────────────────────────┘
```

#### F. Empty State
"No team members yet. Invite someone to get started." → Link to invite form.

#### G. Mobile Considerations
- Collapsed table → card stack
- "Actions" column → tap card → inline action menu (Remove / Change Role)
- Email is a copyable field (single tap to copy, toast confirmation)
- Invite form is inline at top or fullscreen modal (Patrick preference)

---

### 4. WORKSPACE SETTINGS (`/organizer/workspace`)

**Job to be Done (5 min):** "I need to configure my workspace, view its settings, or create a new workspace. I want to understand who can do what."

**What Currently Stops Them:** Nothing major. Changes are **clarity + onboarding**.

**Current State:** Workspace details (name, slug, creation date), member list (same as Staff page, which is redundant), invite form, pending invite acceptance.

**Proposed Changes:**

#### A. Header
- Same breadcrumb / style as Command Center for consistency
- Breadcrumb: Dashboard → Workspace Settings

#### B. Current Workspace Summary
- **Workspace Name:** Display + Edit button (inline edit: click name, type, save)
- **Workspace URL:** finda.sale/workspace/{slug} (copyable link)
- **Workspace ID:** (hidden by default; reveal for support troubleshooting)
- **Created:** Date

#### C. Workspace Actions (Owner only)
Three buttons:
1. **Edit Workspace Details** → Modal:
   - Workspace name (text input)
   - Workspace description (textarea, optional): "Who is this team? What kind of sales do they run?"
   - Logo or cover image (optional, Phase 2)
   - Save button
   
2. **Create New Workspace** → Modal:
   - Name (required)
   - Description (optional)
   - Template selection (optional, Phase 2):
     - "Empty" (no members, no settings)
     - "Solo" (just owner)
     - "Standard" (pre-fill: 3 member slots)
   - Create button
   - **Success:** New workspace appears in left sidebar; user switches to it

3. **Delete Workspace** → Confirmation modal:
   - "Are you sure? This will remove all team members from this workspace. Their FindA.Sale accounts will NOT be deleted."
   - Option: "Delete and keep all sales (they'll be unassigned)"
   - Confirmation input: "Type 'DELETE [WORKSPACE_NAME]' to confirm"
   - Red Delete button

#### D. Role Permissions Matrix (Informational, not editable yet)
A table showing what each role can do:

| Action | Owner | Admin | Member |
|--------|-------|-------|--------|
| View Workspace View | ✓ | ✓ | ✓ |
| Message Team | ✓ | ✓ | ✓ |
| Assign Tasks | ✓ | ✓ | ✓ |
| View Command Center | ✓ | ✓ | ✓ |
| Invite Members | ✓ | ✓ | ✗ |
| Remove Members | ✓ | ✓ | ✗ |
| Edit Workspace Settings | ✓ | ✗ | ✗ |
| Create New Workspace | ✓ | ✗ | ✗ |

**Justification:** Non-owners wonder "what can I do?" This answers without needing support. Drives adoption of Admin role.

#### E. Tier & Capacity Info
- **Current Tier:** TEAMS
- **Price:** $79/month
- **Included Members:** 5
- **Current Members:** 3
- **Available Seats:** 2
- **Add Seats:** Link to pricing page ("Add 1 more seat for $20/month")
- **Upgrade to Enterprise:** Link ("Need unlimited members? Contact sales.")

#### F. Workspace List (If user owns multiple workspaces)
- **Your Workspaces:**
  - Workspace 1 (current, highlighted)
  - Workspace 2 (click to switch)
  - Workspace 3 (click to switch)
- **New Workspace:** Button to create

#### G. Danger Zone (collapsed section at bottom)
- **Delete This Workspace** (red button, owner only)
- **Remove Myself from Workspace** (orange button, for invited members who want to leave)

#### H. Mobile Considerations
- Workspace actions: Stack buttons vertically
- Role matrix: Collapse table to checklist format ("Owner can: View ✓ Message ✓ Invite ✓ Edit ✓ Create ✓")
- Danger zone: Confirm before showing Delete button (tap to reveal)

---

## Navigation & Subnav Consistency

### Top-Level Navigation (across all 4 pages)
All 4 pages appear in a **Workspace Hub nav** that appears consistently on mobile + desktop:

```
DESKTOP (top navbar):
  Dashboard | Sales | Workspace ▼

WORKSPACE DROPDOWN:
  └─ Command Center
  └─ Workspace View (Team)
  └─ Staff (Members)
  └─ Workspace Settings (Config)
  ─────────────
  └─ [+ New Workspace] (owner only)

MOBILE (bottom tab bar or top hamburger):
  Home | Sales | Team | Settings
```

**Rationale:** Users jump between these 4 pages 5–10 times per week. One consistent nav prevents "where do I go?" searches. The "Workspace" dropdown keeps the top nav clean.

---

## Differentiation Table: Why These Pages Are Separate

| Pair | Command Center vs Workspace View | Staff vs Workspace Settings |
|------|-------|------|
| **Primary question** | "What's happening across all sales?" (read-only status) | "Who's on my team?" (add/remove) vs "What is my workspace?" (configure) |
| **Who accesses** | Owner + Admin + Member | Owner only (Staff) + Owner only (Settings) |
| **Time spent** | 2–5 min (quick scan) | Staff: 1–2 min (quick add/remove) \| Settings: 3–5 min (setup) |
| **Actions** | View + Drill into specific sale | Staff: Invite + Remove. Settings: Edit name + Create workspace + Manage tier |
| **What happens if merged** | Workspace View becomes cluttered with summary metrics; organizers lose the "at-a-glance" overview | Staff and Settings would need a two-level menu (team → invite vs. team → settings), confusing. Job clarity disappears. |
| **Data ownership** | Sales (read-only window) | People (Staff) vs Workspace structure (Settings) |

**Verdict:** Separate pages are correct. The fix is ensuring users understand why they're separate.

---

## Cohesion Improvements (Visual & Navigational)

### 1. Consistent Header Style
All 4 pages use the same header structure:
- Breadcrumb navigation (top left)
- Page title (large, left-aligned)
- Page description (small, below title)
- CTA button (top right, if applicable)

**Example:**
```
Dashboard / Workspace
┌─────────────────────────────────────────────────┐
│ Command Center                                  │
│ View all your active sales and spot issues.  │
│                                                  │
│ [Status Tabs: Active | Upcoming | Recent | All] │
└─────────────────────────────────────────────────┘
```

### 2. Sidebar or Breadcrumb to Show Context
Every page shows: "You're in: [Workspace Name]"
- Desktop: Sidebar shows workspace name, current members, quick links to other 3 pages
- Mobile: Breadcrumb shows workspace name; tap to switch if multiple workspaces exist

### 3. Consistent Color Coding
- **Owner actions:** Blue buttons (Invite, Create, Edit)
- **Destructive actions:** Red buttons (Remove, Delete)
- **Disabled actions:** Gray + "Upgrade" link if tier limit reached
- **Status badges:** Green=Accepted, Yellow=Pending, Red=Error

### 4. Empty States Across Pages
All empty states follow the same format:
- Illustration (icon or simple graphic)
- Headline: "No [thing]. [Action] to get started."
- CTA button or link

**Examples:**
- Command Center: "No active sales. Create one to begin."
- Workspace View: "No tasks scheduled. Assign one to get started."
- Staff: "No team members yet. Invite someone to get started."
- Workspace Settings: "No workspaces. Create one to get started."

---

## Open Questions for Patrick

1. **Workspace View — Is this Phase 1 or Phase 2?**
   - Current page is public-facing (read-only). Spec redefines it as internal collaboration hub (calendar + tasks + messages).
   - If Phase 2, what's the interim state? Keep current page or hide it?

2. **Tasks Tab in Workspace View — Required or Optional?**
   - Is task assignment a priority, or is command center + direct messages enough?
   - If included, should tasks be tied to sales, or free-form?

3. **Team Availability / Scheduling Integration — Future or Now?**
   - Spec suggests "team member availability toggles" on calendar. Is this on the roadmap?

4. **Multiple Workspaces — When Do Most Organizers Need This?**
   - Spec supports it (workspace switcher, create new workspace). Should this UI be visible, or hidden until a user creates their second workspace?

5. **Role Permissions — Can Members Invite Other Members?**
   - Today: Owner + Admin only can invite. Is this locked in, or could Members also invite?

6. **Workspace Description / Metadata — What Should It Contain?**
   - Spec suggests: "Who is this team? What kind of sales do they run?"
   - Should it also include: team lead contact, location, logo/branding?

7. **Command Center Metrics — What Should "Revenue" Show?**
   - YTD total? Active-window total? Projected annual? This changes what organizers optimize for.

8. **Smart Notifications — Should Command Center Alert on Stale Sales?**
   - Spec mentions: "Check in if a sale hasn't generated actions for X hours during sale hours."
   - Is this a nice-to-have or a blocker to launch?

9. **Public Workspace View (Current [slug] Page) — Keep or Archive?**
   - Shoppers/external users can currently view team details + published sales. Is this used?
   - If kept, should it look different from the internal team view (to avoid confusion)?

10. **Staff Page — Should Members Have a "Leave Workspace" Button?**
    - Spec suggests: "Remove Myself from Workspace" in Danger Zone. Implement?

---

## Implementation Notes

### Phase 1 (MVP)
- Command Center: Refinement only (already solid)
- Workspace View: Use current public page OR convert to internal view (Patrick decides)
- Staff: Polish + empty state
- Workspace Settings: Polish + role matrix (read-only)

### Phase 2 (Post-Beta)
- Workspace View: Add Tasks tab + Team Activity tab
- Workspace Settings: Add Create New Workspace button
- Scheduling integrations (if roadmap allows)
- Role permission customization (if demanded by users)

### Phase 3 (Future)
- Workspace templates (Empty, Solo, 2-person, 5-person)
- Team analytics (who's most active, etc.)
- Workspace branding (logo, custom colors)
- SSO / role sync with external tools

---

## Success Metrics

1. **Adoption:** 80% of TEAMS organizers visit Workspace View at least once per week (vs. 0% today if it's not marketing-focused)
2. **Task Completion Time:** Average time to invite a new member < 2 minutes (measured via analytics)
3. **Feature Clarity:** Support tickets about "why are there two team pages" drop to zero
4. **Role Adoption:** 30% of TEAMS organizers assign Admin role to second member (enabling delegation)
5. **Page Return Rate:** Command Center visited 5+ times per week (proxy for "organizers trust it")

---

## Appendix: Current Implementation Status

| Page | Status | Tier Gate | Route |
|------|--------|-----------|-------|
| Command Center | Fully built, multi-sale aggregation with filters | TEAMS | /organizer/command-center |
| Workspace View | **Exists but public-facing** (not internal collaboration hub); shows published sales + team info | None | /workspace/{slug} |
| Staff | Fully built, invite + roster | TEAMS | /organizer/staff |
| Workspace Settings | Fully built, workspace details + member list + invite (duplicate of Staff) | TEAMS | /organizer/workspace |

**Key gap:** Workspace View (internal) vs Workspace [slug] (public) are conflating two use cases. Spec separates them.

---

## Next Steps

1. Patrick reviews spec, answers 10 open questions
2. Designer creates wireframes for any major changes (especially Workspace View redesign)
3. Dev estimates effort per page (Polish vs Rebuild)
4. Prioritize Phase 1 pages for next sprint
