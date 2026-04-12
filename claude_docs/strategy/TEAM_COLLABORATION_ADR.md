# Architecture Design Record: Team Collaboration System

**Date:** 2026-04-11  
**Revision:** 1.0  
**Status:** APPROVED BY PATRICK (4 locked pages, 14 implementation ideas)  
**Authority:** Project CLAUDE.md §3 (Cross-Layer Contracts)  
**Risk Level:** 🔴 HIGH (schema changes, new role/permission system, real-time features)

---

## 1. Overview & Locked Decisions

Patrick approved a major team collaboration system spanning 4 organizer pages. All strategic decisions are locked; implementation can begin immediately.

### Locked Strategic Decisions

1. **Workspace View** (`/workspace/[slug]`): Convert from public read-only to INTERNAL collaboration hub (team-only access)
2. **Staff Page** (`/organizer/staff`): Full employee management (contact, availability, skills, performance, coverage alerts)
3. **Workspace Settings** (`/organizer/workspace`): Templates, role/permission builder, workspace description, cost calculator
4. **Command Center** (`/organizer/command-center`): Expand with live activity feed, weather alerts, inactivity alerts, coverage gap warnings, revenue trending
5. **Editable role permissions**: Yes (custom roles per workspace)
6. **Multiple workspaces**: NOT critical now — hide until beta validates need
7. **Bulk member invite**: EXCLUDED (future enterprise feature)
8. **Tier gate**: TEAMS only (all features)
9. **Default member limit**: 5 (locked D-004)
10. **Additional seats**: $20/mo per member (locked D-004)

### Implementation Scope (14 Ideas)

| Idea | Page | Feature | Priority |
|------|------|---------|----------|
| 1 | Staff | Skill tags (badges) | Phase 1 |
| 2 | Staff | Daily availability calendar + Google Calendar sync | Phase 1 |
| 3 | Staff | Performance snapshots (items, POS, photo quality) | Phase 1 |
| 4 | Staff | Quick link communication hub | Phase 1 |
| 5 | Staff | Emergency role coverage alerts | Phase 1 |
| 6 | Workspace Settings | Templates (Empty, Solo, 2-Person, 5-Person, Custom) | Phase 1 |
| 7 | Workspace Settings | Role & permission builder (visual toggle UI) | Phase 1 |
| 8 | Workspace Settings | Description & brand rules | Phase 1 |
| 10 | Workspace Settings | Cost calculator (real-time) | Phase 1 |
| 11 | Workspace View | Live sales activity board | Phase 2 |
| 12 | Workspace View | Team communications (per-sale chat + broadcast) | Phase 2 |
| 13 | Workspace View | Smart task distribution board (skill-based + availability-aware) | Phase 2 |
| 14 | Workspace View | Team leaderboard (weekly stats, rankings) | Phase 2 |
| 15 | Command Center | Analytics dashboard (revenue heatmap, YTD, retention signals) | Phase 2 |

**Note:** Idea 9 (Bulk member invite) is EXCLUDED.

---

## 2. Database Schema Design

### New Models

#### 2.1 WorkspaceRole & Permissions

**Expansion of existing `WorkspaceRole` enum:**

```prisma
enum WorkspaceRole {
  OWNER          // Full access, cannot be removed
  ADMIN          // Can manage members, roles, and general settings
  MANAGER        // Can view staff, assign tasks, manage daily operations
  STAFF          // Can view shared data, complete assigned tasks
  VIEWER         // Read-only access to sales and inventory
}

// NEW: Replaces fixed role permissions with editable per-workspace config
model WorkspacePermission {
  id               String            @id @default(cuid())
  workspaceId      String
  workspace        OrganizerWorkspace @relation("WorkspacePermissions", fields: [workspaceId], references: [id], onDelete: Cascade)
  
  // Which role gets this permission
  role             WorkspaceRole
  
  // Permission categories (granular control)
  permission       String            // e.g., "view_inventory", "add_items", "edit_pricing", "process_pos", etc.
  
  // Timestamps
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  
  @@unique([workspaceId, role, permission])
  @@index([workspaceId])
}
```

#### 2.2 Staff Management

```prisma
// NEW: Staff member details (extends WorkspaceMember)
model StaffMember {
  id               String            @id @default(cuid())
  workspaceMemberId String           @unique
  workspaceMember  WorkspaceMember   @relation(fields: [workspaceMemberId], references: [id], onDelete: Cascade)
  
  // Contact & availability
  phone            String?
  email            String?
  
  // Skill tags (self-selected + organizer-added)
  skillTags        String[]          // ["photo-detail", "pricing-expert", "customer-facing", "inventory", "pos", "cashier"]
  
  // Availability management
  availability     StaffAvailability?
  
  // Performance metrics
  itemsTagged      Int               @default(0)
  posTransactions  Int               @default(0)
  avgPhotoQuality  Float?            // 1.0–5.0 scale
  
  // Emergency role assignments
  emergencyRoles   String[]          // ["cashier", "photographer", "runner"]
  
  // Timestamps
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  
  @@index([workspaceMemberId])
}

// NEW: Daily availability calendar (per staff member, per workspace)
model StaffAvailability {
  id               String            @id @default(cuid())
  staffMemberId    String            @unique
  staffMember      StaffMember       @relation(fields: [staffMemberId], references: [id], onDelete: Cascade)
  
  // Weekly recurring availability (JSON schedule)
  // Structure: { "MON": { "available": true, "startTime": "09:00", "endTime": "17:00" }, ... }
  weeklySchedule   String            @db.Text // JSON
  
  // One-off overrides (date → available/unavailable)
  // Structure: { "2026-04-15": false, "2026-04-16": { "startTime": "10:00", "endTime": "14:00" } }
  dateOverrides    String            @db.Text // JSON
  
  // Google Calendar sync (optional)
  googleCalendarId String?           // Synced calendar ID
  lastSyncedAt     DateTime?
  
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
}

// NEW: Staff performance snapshot (computed nightly)
model StaffPerformance {
  id               String            @id @default(cuid())
  staffMemberId    String
  staffMember      StaffMember       @relation(fields: [staffMemberId], references: [id], onDelete: Cascade)
  
  // Metrics (week-over-week or monthly)
  period           String            // "2026-W15" (ISO week) or "2026-04" (month)
  itemsTagged      Int               @default(0)
  posTransactions  Int               @default(0)
  totalRevenue     Decimal           @default(0)
  photoSubmissions Int               @default(0)
  avgPhotoQuality  Float?
  
  createdAt        DateTime          @default(now())
  
  @@unique([staffMemberId, period])
  @@index([staffMemberId])
}
```

#### 2.3 Workspace Settings & Configuration

```prisma
// NEW: Workspace metadata and settings
model WorkspaceSettings {
  id               String            @id @default(cuid())
  workspaceId      String            @unique
  workspace        OrganizerWorkspace @relation("WorkspaceSettings", fields: [workspaceId], references: [id], onDelete: Cascade)
  
  // Workspace identity
  description      String?           // Team description / purpose
  brandRules       String?           @db.Text // JSON: dress code, photo standards, arrival time, etc.
  
  // Template used (if any)
  templateUsed     String?           // "EMPTY" | "SOLO" | "2_PERSON" | "5_PERSON" | "CUSTOM"
  
  // Member limits
  maxMembers       Int               @default(5) // Locked to 5 for TEAMS; upgradeable
  
  // Timestamps
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  
  @@index([workspaceId])
}

// NEW: Workspace role templates (pre-configured permission sets)
model WorkspaceRoleTemplate {
  id               String            @id @default(cuid())
  
  // Template identity
  name             String            // "OWNER", "MANAGER", "STAFF", "VIEWER" (system defaults)
  description      String?
  isSystemDefault  Boolean           @default(false) // System-provided templates
  
  // Associated permissions (stored as JSON for ease of editing)
  permissions      String            @db.Text // JSON array of permission strings
  
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  
  @@unique([name])
}
```

#### 2.4 Real-Time Collaboration (Workspace View & Command Center)

```prisma
// NEW: Live sales activity feed (for workspace board)
model WorkspaceSalesActivity {
  id               String            @id @default(cuid())
  workspaceId      String
  workspace        OrganizerWorkspace @relation("WorkspaceSalesActivity", fields: [workspaceId], references: [id], onDelete: Cascade)
  
  saleId           String
  sale             Sale              @relation("WorkspaceSalesActivity", fields: [saleId], references: [id], onDelete: Cascade)
  
  // Activity type (for filtering on frontend)
  activityType     String            // "SALE_STARTED" | "ITEM_SOLD" | "HOLD_PLACED" | "ITEM_ADDED" | "PRICE_CHANGED"
  
  // Event data (JSON structure varies by type)
  eventData        String            @db.Text // JSON
  
  // Display info
  staffName        String?           // Who triggered this activity
  itemName         String?           // Related item (if applicable)
  
  createdAt        DateTime          @default(now())
  
  @@index([workspaceId])
  @@index([saleId])
  @@index([createdAt])
}

// NEW: Per-sale team chat / discussion threads
model WorkspaceSaleChat {
  id               String            @id @default(cuid())
  workspaceId      String
  workspace        OrganizerWorkspace @relation("WorkspaceSaleChat", fields: [workspaceId], references: [id], onDelete: Cascade)
  
  saleId           String
  sale             Sale              @relation("WorkspaceSaleChat", fields: [saleId], references: [id], onDelete: Cascade)
  
  // Chat metadata
  chatType         String            // "THREAD" | "BROADCAST"
  topic            String?           // e.g., "Pricing Questions", "Inventory Check"
  
  // Messages in this thread
  messages         WorkspaceChatMessage[]
  
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  
  @@unique([workspaceId, saleId])
  @@index([workspaceId])
  @@index([saleId])
}

// NEW: Chat messages
model WorkspaceChatMessage {
  id               String            @id @default(cuid())
  chatId           String
  chat             WorkspaceSaleChat @relation(fields: [chatId], references: [id], onDelete: Cascade)
  
  organizerId      String            // Sender
  organizer        Organizer         @relation("WorkspaceChatMessages", fields: [organizerId], references: [id], onDelete: Cascade)
  
  message          String            @db.Text
  
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  
  @@index([chatId])
  @@index([organizerId])
}

// NEW: Task distribution (with skill-matching)
model WorkspaceTask {
  id               String            @id @default(cuid())
  workspaceId      String
  workspace        OrganizerWorkspace @relation("WorkspaceTasks", fields: [workspaceId], references: [id], onDelete: Cascade)
  
  saleId           String?
  sale             Sale?             @relation("WorkspaceTasks", fields: [saleId], references: [id], onDelete: SetNull)
  
  // Task metadata
  title            String
  description      String?           @db.Text
  
  // Skill requirements (for matching)
  requiredSkills   String[]          // ["photo-detail", "pricing-expert"]
  
  // Assignment
  assignedTo       String?           // Staff member ID
  status           String            @default("OPEN") // "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED"
  
  // Timestamps
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  dueAt            DateTime?
  completedAt      DateTime?
  
  @@index([workspaceId])
  @@index([saleId])
  @@index([assignedTo])
}

// NEW: Team leaderboard (weekly snapshot)
model WorkspaceLeaderboardEntry {
  id               String            @id @default(cuid())
  workspaceId      String
  workspace        OrganizerWorkspace @relation("WorkspaceLeaderboard", fields: [workspaceId], references: [id], onDelete: Cascade)
  
  staffMemberId    String
  staffMember      StaffMember       @relation(fields: [staffMemberId], references: [id], onDelete: Cascade)
  
  // Period
  week             String            // "2026-W15" (ISO week)
  
  // Metrics
  itemsTagged      Int               @default(0)
  posTransactions  Int               @default(0)
  totalRevenue     Decimal           @default(0)
  avgPhotoQuality  Float?
  
  // Computed rank
  rank             Int               // 1, 2, 3, etc.
  
  createdAt        DateTime          @default(now())
  
  @@unique([workspaceId, staffMemberId, week])
  @@index([workspaceId, week])
}
```

#### 2.5 Workspace Analytics

```prisma
// NEW: Workspace revenue analytics (daily snapshot)
model WorkspaceRevenueSnapshot {
  id               String            @id @default(cuid())
  workspaceId      String
  workspace        OrganizerWorkspace @relation("WorkspaceRevenueSnapshots", fields: [workspaceId], references: [id], onDelete: Cascade)
  
  // Period
  date             DateTime          // Date of snapshot (time = 00:00:00)
  
  // Revenue by staff (JSON structure)
  revenueByStaff   String            @db.Text // JSON: { "staffId": 1250.50, ... }
  
  // Total revenue
  totalRevenue     Decimal
  
  // Retention signals
  activeSalesCount Int
  holdSuccessRate  Float?            // % of holds that converted to payment
  
  createdAt        DateTime          @default(now())
  
  @@unique([workspaceId, date])
  @@index([workspaceId])
}

// NEW: Workspace alerts (coverage gaps, weather, inactivity)
model WorkspaceAlert {
  id               String            @id @default(cuid())
  workspaceId      String
  workspace        OrganizerWorkspace @relation("WorkspaceAlerts", fields: [workspaceId], references: [id], onDelete: Cascade)
  
  saleId           String?
  sale             Sale?             @relation("WorkspaceAlerts", fields: [saleId], references: [id], onDelete: SetNull)
  
  // Alert type
  alertType        String            // "COVERAGE_GAP" | "WEATHER" | "INACTIVITY" | "LOW_INVENTORY"
  
  // Alert metadata
  severity         String            // "LOW" | "MEDIUM" | "HIGH"
  message          String            @db.Text
  
  // Resolution
  isResolved       Boolean           @default(false)
  resolvedAt       DateTime?
  
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  
  @@index([workspaceId])
  @@index([saleId])
  @@index([alertType])
}
```

### Updated Models

#### 2.6 Modify Existing Models

**OrganizerWorkspace:**
```prisma
model OrganizerWorkspace {
  id                String                    @id @default(cuid())
  name              String
  slug              String                    @unique
  ownerId           String                    @unique
  createdAt         DateTime                  @default(now())
  updatedAt         DateTime                  @updatedAt
  
  owner             Organizer                 @relation("WorkspaceOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  members           WorkspaceMember[]
  
  // NEW RELATIONS
  settings          WorkspaceSettings?
  permissions       WorkspacePermission[]
  salesActivity     WorkspaceSalesActivity[]
  chats             WorkspaceSaleChat[]
  tasks             WorkspaceTask[]
  leaderboard       WorkspaceLeaderboardEntry[]
  revenueSnapshots  WorkspaceRevenueSnapshot[]
  alerts            WorkspaceAlert[]
}
```

**WorkspaceMember:**
```prisma
model WorkspaceMember {
  id          String             @id @default(cuid())
  workspaceId String
  organizerId String
  role        WorkspaceRole      @default(MEMBER)
  invitedAt   DateTime           @default(now())
  acceptedAt  DateTime?
  workspace   OrganizerWorkspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  organizer   Organizer          @relation("OrganizerWorkspaces", fields: [organizerId], references: [id], onDelete: Cascade)
  
  // NEW RELATION
  staffMember StaffMember?       // 1:1 optional relation to staff profile

  @@unique([workspaceId, organizerId])
  @@index([workspaceId])
  @@index([organizerId])
}
```

**Sale & Organizer (add relations):**
```prisma
// In Sale model, add:
model Sale {
  // ... existing fields ...
  
  // NEW RELATIONS (for team collaboration)
  workspaceSalesActivity WorkspaceSalesActivity[] @relation("WorkspaceSalesActivity")
  workspaceChats         WorkspaceSaleChat[]
  workspaceTasks         WorkspaceTask[]
  workspaceAlerts        WorkspaceAlert[]
}

// In Organizer model, add:
model Organizer {
  // ... existing fields ...
  
  // NEW RELATIONS
  chatMessages WorkspaceChatMessage[] @relation("WorkspaceChatMessages")
}
```

### Migration Strategy

**Scope:** 3 migrations

| Migration | Description | Depends |
|-----------|-------------|---------|
| `20260411_team_collaboration_roles` | Add WorkspacePermission + WorkspaceRoleTemplate | None |
| `20260411_team_collaboration_staff` | Add StaffMember, StaffAvailability, StaffPerformance | Previous |
| `20260411_team_collaboration_features` | Add WorkspaceSalesActivity, WorkspaceSaleChat, WorkspaceTask, WorkspaceLeaderboard, WorkspaceRevenueSnapshot, WorkspaceAlert, WorkspaceSettings + relation updates to Workspace/Member/Sale/Organizer | Previous |

**Rollback safety:** Each migration can be rolled back independently. Most relations use `onDelete: Cascade`, so reverting workspace-related features won't corrupt parent records (Sale, Organizer, Workspace).

---

## 3. Permission Model

### Design Principle

Permissions are **granular, editable, and stored per workspace**. Unlike a monolithic RBAC system, this model lets organizers:
- Create custom roles with specific permission sets
- Reuse role templates (OWNER, ADMIN, MANAGER, STAFF, VIEWER)
- Override permissions at the workspace level

### Permission Categories

```
INVENTORY_MANAGEMENT:
  - view_inventory
  - add_items
  - edit_items
  - delete_items
  - bulk_import
  
PRICING & VALUATION:
  - view_pricing
  - edit_pricing
  - view_ai_suggestions
  - approve_ai_tags
  
POS & PAYMENTS:
  - process_pos
  - view_sales_analytics
  - void_transactions
  
TEAM & STAFF:
  - view_staff
  - invite_staff
  - edit_staff_roles
  - view_performance
  
WORKSPACE_SETTINGS:
  - manage_workspace_settings
  - edit_permissions
  - view_billing
  
COMMUNICATION:
  - send_team_chat
  - broadcast_alerts
  - create_tasks
```

### Default Role Permissions

| Role | Permissions | Use Case |
|------|-----------|----------|
| OWNER | All | Workspace owner (cannot be removed) |
| ADMIN | All except billing | Senior team member, can manage everything except payment methods |
| MANAGER | Inventory, Pricing, POS (view), Team (view staff + assign tasks), Comms | Lead organizer, day-to-day operations |
| STAFF | Inventory (add items, view), Pricing (view), POS (process), Comms (chat) | Frontline team, can tag items and ring sales |
| VIEWER | Inventory (view), Pricing (view), Team (view), Analytics (view) | Read-only access (family member observing) |

### Frontend Permission Checking

```typescript
// Utility function in shared or frontend package
function hasPermission(
  member: WorkspaceMember,
  workspace: OrganizerWorkspace,
  permission: string
): boolean {
  // Check if member's role has this permission
  // Query: WorkspacePermission where (workspaceId, role, permission)
  // Falls back to system defaults if not custom-defined
}

// In components:
{hasPermission(member, workspace, 'edit_pricing') && (
  <button>Edit Price</button>
)}
```

### Backend Permission Enforcement

```typescript
// Express middleware (Express has req.user.workspaceMember, etc.)
function requirePermission(permission: string) {
  return async (req, res, next) => {
    const { workspaceMemberId } = req.user;
    const { workspaceId } = req.params; // or req.body
    
    const member = await prisma.workspaceMember.findFirst({
      where: { id: workspaceMemberId, workspaceId }
    });
    
    if (!member) return res.status(403).json({ error: 'Not a member' });
    
    const hasPermission = await checkPermission(member.workspaceId, member.role, permission);
    
    if (!hasPermission) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    next();
  };
}

// Usage:
app.post('/api/items', requirePermission('add_items'), itemController.create);
```

### Permission Storage & Caching

- **Storage:** `WorkspacePermission` table (one row per role × permission × workspace)
- **Caching:** Redis cache with 1-hour TTL (permission checks on every request)
- **Cache key:** `workspace:${workspaceId}:role:${role}:permission:${permission}`
- **Fallback:** System defaults if cache miss and custom entry not found

---

## 4. API Contracts

### 4.1 Staff Management Endpoints

#### GET /api/workspaces/:workspaceId/staff
**Description:** List all staff members in workspace with performance data  
**Auth:** requirePermission('view_staff')  
**Response:**
```json
{
  "staff": [
    {
      "id": "staff_123",
      "workspaceMemberId": "member_456",
      "organizerName": "John Doe",
      "phone": "+1-555-0100",
      "email": "john@example.com",
      "skillTags": ["photo-detail", "pricing-expert"],
      "availability": {
        "weeklySchedule": { "MON": { "available": true, "startTime": "09:00", "endTime": "17:00" } },
        "dateOverrides": { "2026-04-15": false },
        "googleCalendarId": null
      },
      "performance": {
        "itemsTagged": 427,
        "posTransactions": 89,
        "avgPhotoQuality": 4.7,
        "emergencyRoles": ["cashier"]
      },
      "currentWeekStats": {
        "itemsTagged": 23,
        "posTransactions": 12,
        "totalRevenue": "892.50"
      }
    }
  ]
}
```

#### POST /api/workspaces/:workspaceId/staff/:staffId
**Description:** Update staff member profile  
**Auth:** requirePermission('edit_staff_roles')  
**Request:**
```json
{
  "phone": "+1-555-0101",
  "email": "john.new@example.com",
  "skillTags": ["photo-detail", "inventory-master"],
  "emergencyRoles": ["cashier", "runner"],
  "availability": { "weeklySchedule": {...}, "dateOverrides": {...} }
}
```

#### GET /api/workspaces/:workspaceId/staff/:staffId/availability
**Description:** Get availability calendar for date range  
**Auth:** requirePermission('view_staff')  
**Query:** `?from=2026-04-15&to=2026-04-22`  
**Response:**
```json
{
  "staffId": "staff_123",
  "availability": [
    { "date": "2026-04-15", "available": false },
    { "date": "2026-04-16", "available": true, "startTime": "10:00", "endTime": "18:00" },
    ...
  ]
}
```

#### PATCH /api/workspaces/:workspaceId/staff/:staffId/availability
**Description:** Update availability for specific dates  
**Auth:** requirePermission('view_staff') [self] or requirePermission('edit_staff_roles') [others]  
**Request:**
```json
{
  "dateOverrides": {
    "2026-04-15": false,
    "2026-04-16": { "startTime": "10:00", "endTime": "18:00" }
  }
}
```

#### POST /api/workspaces/:workspaceId/staff/:staffId/sync-calendar
**Description:** Sync Google Calendar (OAuth flow)  
**Auth:** requirePermission('view_staff')  
**Request:** `{ "googleCalendarId": "..." }`  
**Response:** `{ "status": "synced", "lastSyncedAt": "2026-04-11T14:23:45Z" }`

---

### 4.2 Workspace Settings Endpoints

#### GET /api/workspaces/:workspaceId/settings
**Description:** Get workspace configuration (description, templates, members, permissions)  
**Auth:** authenticate (team member)  
**Response:**
```json
{
  "id": "ws_123",
  "name": "Acme Estate Sales",
  "description": "5-person team handling high-value estates",
  "templateUsed": "5_PERSON",
  "maxMembers": 5,
  "brandRules": {
    "dressCode": "Business casual",
    "photoStandards": "Well-lit, staged backgrounds",
    "arrivalTime": "07:30 AM"
  },
  "memberCount": 3,
  "permissions": {
    "ADMIN": ["view_inventory", "add_items", "edit_pricing", ...],
    "MANAGER": ["view_inventory", "add_items", "view_pricing", ...],
    "STAFF": ["add_items", "process_pos", "send_team_chat"]
  }
}
```

#### PATCH /api/workspaces/:workspaceId/settings
**Description:** Update workspace metadata  
**Auth:** requirePermission('manage_workspace_settings')  
**Request:**
```json
{
  "description": "Updated description",
  "brandRules": { "dressCode": "...", ... }
}
```

#### POST /api/workspaces/:workspaceId/apply-template
**Description:** Apply a workspace template (creates default permissions, roles)  
**Auth:** requirePermission('manage_workspace_settings')  
**Request:** `{ "template": "5_PERSON" | "EMPTY" | "SOLO" | "2_PERSON" | "CUSTOM" }`  
**Response:** Updated settings with default roles + permissions applied

#### GET /api/workspaces/:workspaceId/cost-calculator
**Description:** Real-time cost breakdown  
**Auth:** requirePermission('view_billing')  
**Response:**
```json
{
  "baseTeamsFee": 79,
  "currentMemberCount": 3,
  "additionalSeats": 0,
  "additionalSeatsPrice": 0,
  "totalMonthlyCost": 79,
  "breakdown": {
    "teamsBase": 79,
    "additionalSeatsEach": 20,
    "totalAdditionalSeats": 0
  }
}
```

#### GET /api/workspaces/:workspaceId/permissions
**Description:** List all custom permissions (or system defaults if none)  
**Auth:** authenticate  
**Response:**
```json
{
  "roles": ["OWNER", "ADMIN", "MANAGER", "STAFF", "VIEWER"],
  "permissions": {
    "OWNER": ["*"],
    "ADMIN": ["view_inventory", "add_items", "edit_items", ...],
    "MANAGER": [...],
    "STAFF": [...],
    "VIEWER": [...]
  }
}
```

#### PATCH /api/workspaces/:workspaceId/permissions/:role
**Description:** Customize permissions for a role (workspace-level override)  
**Auth:** requirePermission('edit_permissions')  
**Request:**
```json
{
  "permissions": ["view_inventory", "add_items", "view_pricing"]
}
```

---

### 4.3 Workspace View (Internal Collaboration Hub)

#### GET /api/workspaces/:workspaceId/sales-board
**Description:** Live sales activity board (all active + recent sales)  
**Auth:** authenticate (team member)  
**Query:** `?status=LIVE|UPCOMING|RECENTLY_ENDED&limit=20`  
**Response:**
```json
{
  "sales": [
    {
      "id": "sale_123",
      "title": "Estate Sale - Riverside Manor",
      "status": "LIVE",
      "startDate": "2026-04-12T09:00:00Z",
      "endDate": "2026-04-12T17:00:00Z",
      "itemsCount": 247,
      "soldCount": 89,
      "staffAssigned": [
        { "id": "staff_1", "name": "John", "role": "MANAGER" },
        { "id": "staff_2", "name": "Jane", "role": "STAFF" }
      ],
      "recentActivity": [
        { "type": "ITEM_SOLD", "itemName": "Mahogany Table", "soldBy": "John", "price": 350, "timestamp": "..." },
        ...
      ],
      "stats": {
        "totalRevenue": 8750,
        "holdCount": 12,
        "holdSuccessRate": 0.92
      }
    }
  ]
}
```

#### GET /api/workspaces/:workspaceId/activity-feed
**Description:** Real-time activity feed (WebSocket + REST fallback)  
**Auth:** authenticate  
**Response:**
```json
{
  "activities": [
    {
      "id": "activity_789",
      "activityType": "ITEM_SOLD",
      "saleId": "sale_123",
      "saleName": "Estate Sale - Riverside",
      "itemName": "Antique Mirror",
      "staffName": "John Doe",
      "timestamp": "2026-04-11T14:23:45Z",
      "metadata": { "price": 450, "quantity": 1 }
    },
    ...
  ]
}
```

#### GET /api/workspaces/:workspaceId/sales/:saleId/chat
**Description:** Get chat thread for a sale  
**Auth:** authenticate  
**Query:** `?limit=50&offset=0`  
**Response:**
```json
{
  "chatId": "chat_123",
  "topic": "Pricing Questions",
  "messages": [
    {
      "id": "msg_1",
      "organizerName": "John",
      "message": "Should we reduce the price on the furniture set?",
      "createdAt": "2026-04-11T14:00:00Z"
    },
    ...
  ]
}
```

#### POST /api/workspaces/:workspaceId/sales/:saleId/chat
**Description:** Post message to sale chat  
**Auth:** requirePermission('send_team_chat')  
**Request:** `{ "message": "..." }`  
**Response:** New message object

---

### 4.4 Task Distribution

#### GET /api/workspaces/:workspaceId/tasks
**Description:** List tasks (open, assigned, in-progress, completed)  
**Auth:** authenticate  
**Query:** `?status=OPEN|ASSIGNED|IN_PROGRESS|COMPLETED&saleId=...`  
**Response:**
```json
{
  "tasks": [
    {
      "id": "task_1",
      "title": "Tag items in jewelry section",
      "description": "Complete photo tagging for display case jewelry",
      "saleId": "sale_123",
      "saleName": "Estate Sale - Riverside",
      "requiredSkills": ["photo-detail"],
      "assignedTo": "staff_1",
      "assignedToName": "John",
      "status": "IN_PROGRESS",
      "dueAt": "2026-04-12T17:00:00Z",
      "createdAt": "2026-04-11T08:00:00Z"
    }
  ]
}
```

#### POST /api/workspaces/:workspaceId/tasks
**Description:** Create a task (with optional skill matching)  
**Auth:** requirePermission('create_tasks')  
**Request:**
```json
{
  "title": "Photograph furniture section",
  "description": "Take clear photos of all furniture items",
  "saleId": "sale_123",
  "requiredSkills": ["photo-detail", "staging"],
  "dueAt": "2026-04-12T14:00:00Z"
}
```
**Response:** New task object

#### POST /api/workspaces/:workspaceId/tasks/:taskId/suggest-assignment
**Description:** Get suggestions for task assignment (staff with matching skills + availability)  
**Auth:** authenticate  
**Response:**
```json
{
  "suggestions": [
    {
      "staffId": "staff_1",
      "staffName": "John",
      "skillMatches": ["photo-detail"],
      "availability": "Available 2026-04-12 09:00-17:00",
      "score": 0.95
    },
    ...
  ]
}
```

#### PATCH /api/workspaces/:workspaceId/tasks/:taskId
**Description:** Update task (assign, mark complete, etc.)  
**Auth:** requirePermission('edit_tasks') or task owner  
**Request:**
```json
{
  "assignedTo": "staff_1",
  "status": "IN_PROGRESS",
  "completedAt": null
}
```

---

### 4.5 Team Leaderboard

#### GET /api/workspaces/:workspaceId/leaderboard
**Description:** Weekly team leaderboard  
**Auth:** authenticate  
**Query:** `?week=2026-W15`  
**Response:**
```json
{
  "week": "2026-W15",
  "entries": [
    {
      "rank": 1,
      "staffName": "John",
      "itemsTagged": 87,
      "posTransactions": 34,
      "totalRevenue": "4250.50",
      "avgPhotoQuality": 4.8
    },
    {
      "rank": 2,
      "staffName": "Jane",
      "itemsTagged": 64,
      "posTransactions": 22,
      "totalRevenue": "3180.25",
      "avgPhotoQuality": 4.5
    },
    ...
  ]
}
```

---

### 4.6 Analytics

#### GET /api/workspaces/:workspaceId/analytics/revenue
**Description:** Revenue heatmap (staff × day)  
**Auth:** requirePermission('view_billing')  
**Query:** `?from=2026-04-01&to=2026-04-30`  
**Response:**
```json
{
  "period": "2026-04",
  "revenueByStaff": {
    "staff_1_john": {
      "total": "8750.50",
      "byDay": {
        "2026-04-11": "1250.25",
        "2026-04-12": "2100.50",
        ...
      }
    },
    ...
  },
  "totalRevenue": "24500.75",
  "trends": {
    "topPerformer": "John",
    "holdSuccessRate": 0.91
  }
}
```

#### GET /api/workspaces/:workspaceId/analytics/retention
**Description:** Retention signals (YTD comparison, repeat customers)  
**Auth:** requirePermission('view_billing')  
**Response:**
```json
{
  "ytdComparison": {
    "2025": { "totalRevenue": "0", "activeSales": 0 },
    "2026": { "totalRevenue": "24500.75", "activeSales": 12 }
  },
  "repeatCustomers": 47,
  "customerRetentionRate": 0.68
}
```

#### GET /api/workspaces/:workspaceId/alerts
**Description:** List active alerts (coverage gaps, weather, inactivity)  
**Auth:** authenticate  
**Query:** `?severity=HIGH|MEDIUM|LOW`  
**Response:**
```json
{
  "alerts": [
    {
      "id": "alert_1",
      "alertType": "COVERAGE_GAP",
      "saleId": "sale_123",
      "severity": "HIGH",
      "message": "No staff assigned to cashier role during 14:00-17:00 on 2026-04-12",
      "isResolved": false,
      "createdAt": "2026-04-11T10:00:00Z"
    },
    {
      "id": "alert_2",
      "alertType": "WEATHER",
      "saleId": null,
      "severity": "MEDIUM",
      "message": "Heavy rain expected in Riverside on 2026-04-12 10:00-14:00",
      "isResolved": false,
      "createdAt": "2026-04-11T08:30:00Z"
    }
  ]
}
```

---

## 5. WebSocket Design (Socket.io)

### Channel Structure

Socket.io already powers live auction bidding. Extend with team collaboration channels:

```typescript
// Connection namespace: /workspace/:workspaceId

io.of('/workspace/:workspaceId').on('connection', (socket) => {
  const { workspaceId } = socket.handshake.params;
  
  // Authenticate: verify user is workspace member
  const member = await verifyWorkspaceMember(socket.user.id, workspaceId);
  if (!member) return socket.disconnect();
  
  // Join rooms by feature
  socket.join(`workspace:${workspaceId}`);           // Workspace-wide events
  socket.join(`workspace:${workspaceId}:activity`);  // Activity feed
  socket.join(`workspace:${workspaceId}:chat`);      // Chat notifications
  
  // Per-sale rooms
  socket.on('subscribe-sale', (saleId) => {
    socket.join(`workspace:${workspaceId}:sale:${saleId}:activity`);
    socket.join(`workspace:${workspaceId}:sale:${saleId}:chat`);
  });
});
```

### Events

**Real-time Sales Activity:**
```typescript
// Emitted when: item sold, hold placed, price changed
io.of(`/workspace/${workspaceId}`).emit('activity:new', {
  id: 'activity_789',
  activityType: 'ITEM_SOLD',
  saleId: 'sale_123',
  itemName: 'Antique Mirror',
  staffName: 'John',
  price: 450,
  timestamp: new Date().toISOString()
});
```

**Chat Messages:**
```typescript
// Emitted when: message posted in sale chat
io.of(`/workspace/${workspaceId}`)
  .to(`workspace:${workspaceId}:sale:${saleId}:chat`)
  .emit('chat:message', {
    id: 'msg_1',
    organizerName: 'John',
    message: 'Should we reduce the price?',
    createdAt: new Date().toISOString()
  });
```

**Alerts:**
```typescript
// Emitted when: coverage gap detected, weather alert, inactivity
io.of(`/workspace/${workspaceId}`).emit('alert:new', {
  id: 'alert_1',
  alertType: 'COVERAGE_GAP',
  severity: 'HIGH',
  message: '...',
  createdAt: new Date().toISOString()
});
```

**Availability Updates (real-time calendar sync):**
```typescript
// Emitted when: staff member updates availability
io.of(`/workspace/${workspaceId}`).emit('availability:updated', {
  staffId: 'staff_1',
  date: '2026-04-15',
  available: false
});
```

**Task Assignment:**
```typescript
// Emitted when: task created, assigned, completed
io.of(`/workspace/${workspaceId}`).emit('task:updated', {
  id: 'task_1',
  title: '...',
  assignedTo: 'staff_1',
  status: 'ASSIGNED',
  timestamp: new Date().toISOString()
});
```

### Integration with Existing Socket.io

The app already uses Socket.io for auction bidding (live auction house). Team collaboration uses a separate namespace (`/workspace/:workspaceId` vs. current `/sale/:saleId` for auctions), so no conflicts. Both can coexist.

---

## 6. Implementation Sequence

### Phase 1: Core Infrastructure (Sessions 1–2)

**Goal:** Schema, permissions, staff management foundation

**Session 1 — Schema & Database**
1. Create 3 migrations (roles, staff, features)
2. Generate Prisma types
3. Add routes to handle WorkspacePermission queries
4. Seed system default permissions (OWNER, ADMIN, MANAGER, STAFF, VIEWER)

**Session 2 — Permission Middleware & Staff Endpoints**
1. Build `requirePermission()` middleware for Express
2. Implement permission cache (Redis, 1-hour TTL)
3. Create staff management endpoints (GET, PATCH, POST)
4. Build staff performance snapshot service (compute daily)
5. Add Google Calendar OAuth flow scaffold

---

### Phase 2: Staff Page & Workspace Settings (Sessions 3–4)

**Session 3 — Frontend: Staff Page**
1. Build `/organizer/staff` with staff list, skill tags, performance cards
2. Add staff detail modal (contact, availability, emergency roles)
3. Implement availability calendar widget (date-picker, weekly schedule)
4. Add staff search + filter by skill

**Session 4 — Frontend: Workspace Settings**
1. Build `/organizer/workspace` with tabs (General, Roles, Members, Billing)
2. Implement workspace templates selector (Empty, Solo, 2-Person, 5-Person, Custom)
3. Build role/permission builder (visual toggle UI)
4. Add cost calculator (real-time member count × $20)
5. Add description & brand rules editor

---

### Phase 3: Real-Time Features (Sessions 5–6)

**Session 5 — Backend: Workspace View Infrastructure**
1. Build `/api/workspaces/:workspaceId/sales-board` (live stats)
2. Create `/api/workspaces/:workspaceId/activity-feed` (REST + fallback)
3. Build chat endpoints (GET, POST messages)
4. Set up Socket.io namespace + rooms (`/workspace/:workspaceId`)
5. Implement activity event emission (item sold, hold placed, price changed)

**Session 6 — Frontend: Workspace View & Alerts**
1. Build `/workspace/[slug]` (internal collaboration hub)
2. Implement live sales board with real-time stats
3. Add team chat tab (per-sale threads)
4. Build alert feed (coverage gaps, weather, inactivity)
5. Wire Socket.io listeners for live updates

---

### Phase 4: Task Distribution & Leaderboard (Sessions 7–8)

**Session 7 — Task Management**
1. Build task CRUD endpoints (POST, GET, PATCH, DELETE)
2. Implement skill-matching suggestion algorithm
3. Add task assignment logic + notifications
4. Build leaderboard snapshots (weekly compute)

**Session 8 — Frontend: Tasks & Leaderboard**
1. Build task distribution board component
2. Add smart assignment widget (shows staff + matching skills + availability)
3. Implement team leaderboard page
4. Add weekly stats modal (per staff member)

---

### Phase 5: Analytics & Polish (Session 9)

**Session 9 — Analytics & Refinement**
1. Build workspace revenue heatmap (staff × day)
2. Implement YTD comparison analytics
3. Add retention signal widgets
4. Polish all UI (dark mode, mobile responsiveness, accessibility)
5. Performance optimization (query caching, index tuning)

---

## 7. Risk Assessment

### High-Risk Areas

#### 7.1 Schema Migrations
**Risk:** Large migration with new relations + existing table updates  
**Impact:** 🔴 HIGH (data loss, table locks, production downtime)  
**Mitigation:**
- Split into 3 sequential migrations (dependencies clear)
- Test each migration locally first
- Railway DB backup before deploy
- Rollback plan for each migration documented
- No simultaneous changes to Sale, Organizer, Workspace in same migration

#### 7.2 Permission Caching
**Risk:** Stale permissions in Redis cache (user gets old role)  
**Impact:** 🟠 MEDIUM (security, access control bypass)  
**Mitigation:**
- 1-hour TTL (refresh on every request)
- Cache invalidation on role change (explicit `flushWorkspacePermissions()` call)
- Fallback to DB query on cache miss
- Audit log all permission changes

#### 7.3 WebSocket Real-Time Consistency
**Risk:** Events out of order, duplicate messages, dropped connections  
**Impact:** 🟠 MEDIUM (confusing UX, duplicate activity in feed)  
**Mitigation:**
- All events include `timestamp` (frontend sorts if needed)
- Idempotent event handlers (duplicate event = no change)
- Connection recovery with event catchup (recent N events on reconnect)
- Rate limiting on chat messages (prevent spam)

#### 7.4 Activity Feed Volume
**Risk:** Too many events (10,000+ items sold = 10,000 activity rows)  
**Impact:** 🟡 MEDIUM (slow queries, storage bloat)  
**Mitigation:**
- Archive activity older than 30 days to separate table
- Pagination on activity feed (show only recent 100)
- Index on (workspaceId, createdAt) for efficient queries
- Activity aggregation (e.g., "John sold 5 items" vs. 5 rows)

#### 7.5 Availability Calendar Sync
**Risk:** Google Calendar OAuth connection expired, no refresh  
**Impact:** 🟠 MEDIUM (stale availability, no updates)  
**Mitigation:**
- Background job checks token expiry daily
- Refresh token rotation on every sync
- Clear error message if sync fails (staff member notified)
- Manual re-auth link in settings

#### 7.6 TEAMS Tier Gating
**Risk:** Feature accidentally exposed to SIMPLE/PRO tiers  
**Impact:** 🔴 HIGH (revenue impact, unfair advantage)  
**Mitigation:**
- Decorator `@requireTier('TEAMS')` on all new controllers
- Frontend component `<TierGate tier="TEAMS">` prevents UI display
- Audit log all tier checks
- Test matrix: every endpoint tested against SIMPLE, PRO, TEAMS

---

## 8. Edge Cases & Special Handling

### 8.1 Single-Member Workspace
When organizer is alone (only OWNER):
- Workspace functions normally (all permissions granted)
- Leaderboard shows 1 entry (owner)
- No "coverage gap" alerts (no roles to cover)
- Activity feed shows owner's actions only

### 8.2 Member Leaves / Is Removed
- StaffMember record deleted (Cascade)
- WorkspaceMember record deleted (Cascade)
- Assigned tasks reassigned to OWNER (automatic)
- Leaderboard history preserved (historical data)
- Activity feed shows task was reassigned

### 8.3 Custom Permission Sets (Advanced)
- Organizer creates custom role (not in templates)
- Applies different permission set per role
- System doesn't enforce enum validation (custom roles OK)
- Fallback to MEMBER defaults if custom role not found

### 8.4 Workspace Member Tier Downgrade
If TEAMS organizer downgrades to PRO:
- Team members stay assigned but can't log in (tier check on auth)
- Workspace becomes read-only (no invite/edit allowed)
- Feature flag shows "Downgrade to PRO not allowed with team members" in UI
- Organizer must remove team members before downgrading

### 8.5 Google Calendar Sync Latency
- Sync happens async (background job every 6 hours)
- Manual "Sync Now" button available in settings (immediate, not real-time)
- Conflicts in calendar (staff marks unavailable in Google, then app updates) are handled by: app value wins until next sync (30-min window OK)

### 8.6 Chat Message Edits / Deletions
- MVP does NOT support edit/delete (messages are immutable)
- Future: add `editedAt`, `deletedAt`, soft-delete with "message deleted" placeholder

### 8.7 Task Assignment Without Available Staff
- System shows "No staff with required skills available on due date"
- Organizer can still force-assign (override)
- Alert created: "Forced assignment may overload staff member"

---

## 9. Database Indexing Strategy

To prevent slow queries, ensure these indexes exist:

```prisma
// In migrations (add @@index directives)

model WorkspacePermission {
  @@unique([workspaceId, role, permission])
  @@index([workspaceId])
  @@index([role])
}

model StaffMember {
  @@index([workspaceMemberId])
}

model StaffAvailability {
  @@index([staffMemberId])
}

model WorkspaceSalesActivity {
  @@index([workspaceId])
  @@index([saleId])
  @@index([createdAt])  // For pagination
}

model WorkspaceSaleChat {
  @@index([workspaceId])
  @@index([saleId])
}

model WorkspaceChatMessage {
  @@index([chatId])
  @@index([organizerId])
  @@index([createdAt])
}

model WorkspaceTask {
  @@index([workspaceId])
  @@index([saleId])
  @@index([assignedTo])
  @@index([status])
}

model WorkspaceLeaderboardEntry {
  @@unique([workspaceId, staffMemberId, week])
  @@index([workspaceId, week])
}

model WorkspaceRevenueSnapshot {
  @@unique([workspaceId, date])
  @@index([workspaceId])
  @@index([date])
}

model WorkspaceAlert {
  @@index([workspaceId])
  @@index([saleId])
  @@index([alertType])
  @@index([isResolved])
}
```

---

## 10. Security Considerations

### 10.1 Authentication & Authorization

- All endpoints require `authenticate` middleware
- Team-only endpoints use `requirePermission(...)` middleware
- Permission checks happen on every request (no client-side trust)
- JWT includes `workspaceMemberId` (not just `userId`), enabling permission cache key

### 10.2 Data Isolation

- All queries filtered by `workspaceId` (prevent cross-workspace leakage)
- Staff member details visible only to workspace members (permission-gated)
- Chat messages visible only to sale members + workspace team
- Activity feed visible only to workspace members

### 10.3 Audit Logging

- All permission changes logged: who changed what role, when
- All task assignments logged: who assigned to whom
- Chat messages are immutable (no delete, only view archived)
- Activity feed append-only (no modification)

### 10.4 Rate Limiting

- Chat messages: 1 per second per staff member (prevent spam)
- Task creation: 10 per minute per workspace (prevent abuse)
- Permission edits: 5 per minute per organizer (prevent accidental mass-changes)

---

## 11. Testing Strategy

### Unit Tests

- `requirePermission()` middleware with mock workspace/member/permission
- Permission caching: cache hit, miss, invalidation
- Availability calendar: date override logic, weekly schedule merge

### Integration Tests

- Full permission flow: create role → assign member → attempt action → check 403
- Staff CRUD: create, update, delete with cascading checks
- Chat workflow: create message → emit event → receive via WebSocket
- Task assignment: create task → suggest staff → assign → notify

### End-to-End Tests (Chrome)

- Organizer creates workspace from template (Empty, 5-Person)
- Adds 2 team members, assigns roles
- Sets staff availability (partial days)
- Creates tasks, system suggests staff based on skills + availability
- Messages appear in real-time chat (WebSocket verification)
- Leaderboard updates weekly (manual trigger in dev mode)

### Load Testing

- Activity feed: 10,000 events per workspace, pagination performance
- Chat: 100 messages per sale, real-time delivery latency (<500ms)
- Leaderboard: compute for 50 staff members weekly

---

## 12. Deployment Checklist

Before shipping to production:

- [ ] All 3 migrations tested locally + rollback verified
- [ ] Permissions cache configuration set (Redis URL, TTL)
- [ ] Socket.io namespace routes registered in Express
- [ ] TEAMS tier gate verified on all new endpoints
- [ ] Activity feed archival job scheduled (30-day retention)
- [ ] Leaderboard snapshot job scheduled (weekly, Sunday midnight)
- [ ] Staff performance snapshot job scheduled (daily, 2 AM)
- [ ] Alert generation logic tested (coverage gaps, weather, inactivity)
- [ ] Google Calendar OAuth app credentials configured
- [ ] Email templates ready (permission grant, task assigned, alert)
- [ ] Documentation updated (staff guide, organizer onboarding)
- [ ] Chrome QA smoke test: one full workspace lifecycle
- [ ] Railway DB backup taken
- [ ] Health-scout checks pass (no regressions)

---

## 13. Future Enhancements (Out of Scope)

- Multi-workspace support (hide feature until beta validates need)
- Bulk member invite with CSV
- Advanced scheduling (shift templates, recurring assignments)
- Inventory reserve holds (staff member X holds item Y for debugging)
- Payroll integration (staff earnings from platform fees)
- Real-time staff location (GPS-based arrival verification)
- Automated timesheet (clock in/out via app)

---

## 14. Summary & Next Steps

### What This ADR Covers

1. **Schema Design:** 12 new models, 3 migrations, 0 breaking changes to existing schema
2. **Permission Model:** Granular, editable, cache-efficient, default fallbacks
3. **API Contracts:** 25+ endpoints across 6 feature areas
4. **WebSocket Integration:** Socket.io namespace for real-time events (non-conflicting with auctions)
5. **Implementation Sequence:** 9 sessions, clear phase boundaries
6. **Risk Mitigation:** High-risk areas identified with specific mitigations
7. **Security:** Data isolation, audit logging, rate limiting, tier gating
8. **Testing & Deployment:** Comprehensive checklist

### Ready for Dev Dispatch

This ADR is **implementation-ready**. Dev sessions can proceed:

- **Session 1:** Migrations + schema generation (findasale-dev)
- **Session 2:** Permission middleware + staff endpoints (findasale-dev)
- **Session 3:** Staff page frontend (findasale-dev + findasale-ux)
- **Session 4:** Workspace settings frontend (findasale-dev + findasale-ux)
- Sessions 5–9 proceed as phased (see Section 6)

**All strategic decisions are locked.** No further architecture review needed before dev begins.

---

**ADR Author:** FindA.Sale Systems Architect  
**Approved By:** Patrick (2026-04-11)  
**Authority:** CLAUDE.md §3, Project Authority Layer v5.0
