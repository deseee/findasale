# Team Collaboration Features — Developer Checklist & Implementation Guide

**Audience:** Architect, Dev, QA  
**Purpose:** Technical specification and build sequence for 5 power features across 4 pages  
**Status:** Ready for estimation and task breakdown

---

## FEATURE DEPENDENCIES & CRITICAL PATH

```
Session 1: Workspace Templates + Role Builder (FOUNDATION)
    ↓
Session 3: Workspace View (CORE VALUE)
    ↓
Session 2: Staff Features (SUPPORT)
    ├─ Skill Tags
    ├─ Availability Calendar  
    └─ Performance Snapshots
    ↓
Session 4: Smart Task Assignment + Per-Sale Chat
    ↓
Session 5: Team Leaderboard + Analytics + Command Center
```

**Critical path:** Sessions 1 → 3 → then 2/4/5 can run in parallel.

---

## SESSION 1: WORKSPACE TEMPLATES + ROLE BUILDER (5 Days)

### Schema Changes

**New Table: `Role`**
```
Role
  id              String     @id @default(cuid())
  organizerId     String
  organizer       Organizer  @relation(fields: [organizerId], references: [id])
  name            String     // "Photo Expert", "POS Operator", "Manager"
  permissions     String[]   // ["view_inventory", "add_items", "edit_pricing", "process_pos", etc.]
  staffMembers    String[]   // Array of staff IDs assigned to this role (denormalized for speed)
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  @@unique([organizerId, name])
  @@index([organizerId])
```

**Modify: `Organizer` + `StaffMember`**
```
// Add to Organizer:
templateUsed    String?     // "EMPTY", "SOLO", "2_PERSON", "5_PERSON", "CUSTOM" — onboarding tracking
brandDescription String?    // Workspace description (10–500 chars)
teamEssentials   String?     // Team rules/standards (plain text, markdown friendly)

// Add to StaffMember:
role            Role?       @relation(fields: [roleId], references: [id]) // Single role per staff
roleId          String?
```

### Backend Requirements

**1. Templates Service**
```typescript
interface WorkspaceTemplate {
  id: string              // "EMPTY", "SOLO", "2_PERSON", "5_PERSON"
  name: string
  description: string
  defaultRoles: Array<{
    name: string
    permissions: string[]
  }>
  maxMembers: number
  estimatedMonthlyCost: number // Based on tier
}

// Service endpoints:
GET /api/workspace/templates
  → Returns all 5 templates with meta

POST /api/workspace/apply-template/{templateId}
  → Applies template to organizer's workspace
  → Creates Role entries
  → Returns success + role list
```

**2. Role Management Service**
```typescript
POST /api/roles
  { name, permissions[] }
  → Create new role

PUT /api/roles/{roleId}
  { name, permissions[] }
  → Update role

DELETE /api/roles/{roleId}
  → Delete role (prevent if staff assigned)

POST /api/roles/{roleId}/assign-staff/{staffId}
  → Assign staff to role

DELETE /api/roles/{roleId}/unassign-staff/{staffId}
  → Remove staff from role

GET /api/roles
  → List all roles for organizer
```

**3. Permission Service (Helper)**
```typescript
const PermissionEnum = {
  VIEW_INVENTORY: "view_inventory",
  ADD_ITEMS: "add_items",
  EDIT_PRICING: "edit_pricing",
  PROCESS_POS: "process_pos",
  MESSAGE_SHOPPERS: "message_shoppers",
  VIEW_ANALYTICS: "view_analytics",
  INVITE_STAFF: "invite_staff",
  MANAGE_WORKSPACE: "manage_workspace"
}

function hasPermission(user: User, permission: string, sale?: Sale): boolean
  → Check user's role against permission list
  → Use in route middleware: `requirePermission(PermissionEnum.EDIT_PRICING)`
```

**4. Cost Calculator Service**
```typescript
interface WorkspaceCost {
  baseTier: number       // $79 for TEAMS
  additionalSeats: number // (staffCount - 1) * $20
  huntPassPerStaff: number // (staffCount) * $5 if enabled
  totalMonthly: number
  perSaleCost: number    // totalMonthly / estimatedSalesPerMonth
}

GET /api/workspace/cost-estimate
  ?staffCount=3&huntsPassEnabled=true
  → Returns cost breakdown
```

### Frontend Requirements

**1. New Pages**
- `/organizer/workspace` — Workspace Settings (redesign existing page if it exists)
  - Template picker (onboarding flow)
  - Role management UI (table + modal for edit)
  - Workspace description editor
  - Team essentials (textarea)
  - Cost calculator (read-only)
  - Bulk invite with role assignment

**2. Components**
- `TemplateCard` — Clickable template option with description + cost
- `RoleList` — Table of all roles, create/edit/delete actions
- `RolePermissionModal` — Checkbox list of permissions per role
- `CostEstimator` — Real-time cost display (staff count → total/month/sale)
- `BulkInviteModal` — CSV upload or manual entry (Name, Email, Role, Skills, Availability)

**3. UX Considerations**
- First-time TEAMS organizer sees template picker immediately
- Existing organizers see "Workspace Settings" with template already chosen
- Role builder is modal-based (doesn't clutter main settings page)
- Cost calculator updates in real-time as staff count changes
- Bulk invite preview before sending (double-check emails)

### Validation & Gating

- **Role name:** Required, max 50 chars, unique per organizer
- **Permissions:** At least 1 required per role
- **Staff assignment:** Can't delete role with staff assigned (soft-gate: "X staff members use this role")
- **Template application:** Prevents changing if workspace already customized (soft warning: "Override existing roles?")

### Testing Checklist

- [ ] All 5 templates seed correctly (run POST /apply-template for each)
- [ ] Role CRUD works (create, update, delete, assign staff)
- [ ] Permissions are respected in routes (middleware tests)
- [ ] Cost calculator updates on staff count changes
- [ ] Bulk invite sends role assignment in invite email
- [ ] Mobile UX doesn't break with role table width

---

## SESSION 2: STAFF FEATURES (5 Days)

### Schema Changes

**New Table: `StaffSkill`**
```
StaffSkill
  id              String     @id @default(cuid())
  staffId         String
  staffMember     StaffMember @relation(fields: [staffId], references: [id], onDelete: Cascade)
  skill           String     // "photo_expert", "pos_wizard", "pricing_strategist", "customer_facing", "setup_crew"
  endorsements    Int        @default(0) // How many organizers endorsed this skill
  createdAt       DateTime   @default(now())

  @@unique([staffId, skill])
  @@index([staffId])
```

**New Table: `StaffAvailability`**
```
StaffAvailability
  id              String     @id @default(cuid())
  staffId         String
  staffMember     StaffMember @relation(fields: [staffId], references: [id], onDelete: Cascade)
  saleId          String
  sale            Sale       @relation(fields: [saleId], references: [id], onDelete: Cascade)
  date            DateTime
  startTime       Int        // minutes from midnight (e.g., 420 = 7:00 AM)
  endTime         Int        // minutes from midnight
  available       Boolean    @default(true)
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  @@unique([staffId, saleId, date])
  @@index([saleId, date])
```

**Modify: `StaffMember`**
```
// Add to StaffMember:
skills          StaffSkill[]
availabilities  StaffAvailability[]
googleCalendarToken String? // OAuth token for Google Calendar sync (optional)
itemsTagged     Int        @default(0) // Denormalized count (updated by cron)
posTransactions Int        @default(0) // Denormalized count
photoQualityScore Float?    // Avg photo quality (if using ML tagging)
customerFeedback String[]   // Array of feedback snippets (truncated to 500 chars each)
```

### Backend Requirements

**1. Skill Service**
```typescript
const Skills = [
  "photo_expert",
  "pos_wizard", 
  "pricing_strategist",
  "customer_facing",
  "setup_crew"
]

POST /api/staff/{staffId}/skills
  { skill: "photo_expert" }
  → Add skill to staff (idempotent)

DELETE /api/staff/{staffId}/skills/{skill}
  → Remove skill

GET /api/staff/{staffId}/skills
  → List all skills for staff member

GET /api/staff/by-skill/{skill}?saleId={saleId}
  → Find all staff with skill (for task assignment suggestions)
```

**2. Availability Service**
```typescript
POST /api/availability
  { staffId, saleId, date, startTime, endTime, available }
  → Create/update availability for sale

GET /api/availability?saleId={saleId}
  → Get all staff availability for sale (timeline view)

GET /api/availability/{staffId}?saleId={saleId}
  → Get one staff member's availability

DELETE /api/availability/{id}
  → Remove availability entry

// Google Calendar sync (async):
POST /api/staff/{staffId}/sync-calendar
  { googleCalendarToken }
  → Background job: pull staff's Google Calendar, sync to availabilities
  → Only marks availability if "Work" or "FindA" calendar
```

**3. Performance Snapshot Service**
```typescript
interface StaffSnapshot {
  staffId: string
  weekOf: DateTime
  itemsTagged: number
  posTransactions: number
  photoQualityScore: number   // 0–100, avg of tagged photos
  customerFeedbackScore: number // 1–5 star avg
  topSales: Array<{ saleId, itemCount, revenue }>
}

GET /api/staff/{staffId}/performance?weekOf={date}
  → Returns snapshot for given week
  → If weekOf omitted, returns all-time

// Cron job (daily):
  → Recalculate itemsTagged, posTransactions, photoQualityScore for all staff
  → Updates denormalized fields on StaffMember
```

### Frontend Requirements

**1. Staff Page Redesign** (`/organizer/staff`)

**Section 1: Staff Directory (Table)**
- Name | Role | Skills (badges) | Availability Status | Actions
- Click staff row → drill into details

**Section 2: Add Staff Modal**
- Email, name, role dropdown, skills checkboxes
- "Send Invite" button

**Section 3: Staff Details (Expandable per row)**
- Avatar + name + role + email + phone
- Skills list (with add/remove buttons)
- Availability for upcoming 7 sales (calendar view)
- Performance snapshot (this week)
  - Items tagged: 47
  - POS transactions: 156
  - Photo quality: 94%
  - Customer feedback: 4.8/5

**2. Components**
- `StaffDirectory` — Table with sort/filter
- `StaffDetailModal` — Drill-down on one staff member
- `SkillBadge` — Pill component for skill display
- `AvailabilityCalendar` — 7-day timeline showing staff availability per sale
- `PerformanceCard` — Stats display (items, POS, quality, feedback)

**3. UX Considerations**
- Skills are preset enum (5 options) — prevents junk data
- Availability is per-sale (not global), respects sale dates
- Performance data auto-updates from backend (no manual entry)
- Mobile: stack performance metrics vertically

### Validation & Gating

- **Skills:** Max 5 per staff member
- **Availability:** Can't set availability for past sales
- **Performance:** Display "No data yet" for new staff

### Testing Checklist

- [ ] Add skill → appears in directory
- [ ] Remove skill → disappears from directory
- [ ] Set availability → appears in calendar
- [ ] Google Calendar sync triggers (test with dummy account)
- [ ] Performance snapshot updates correctly (test with seeded data)
- [ ] Mobile layout for availability calendar doesn't overflow

---

## SESSION 3: WORKSPACE VIEW (2 Weeks) — CORE FEATURE

### Schema Changes

**New Table: `StaffAssignment`**
```
StaffAssignment
  id              String     @id @default(cuid())
  saleId          String
  sale            Sale       @relation(fields: [saleId], references: [id], onDelete: Cascade)
  staffId         String
  staffMember     StaffMember @relation(fields: [staffId], references: [id])
  role            String     // "lead", "support", "backup" (just labels, not enforcing)
  status          String     // "confirmed", "tentative", "declined"
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  @@unique([saleId, staffId])
  @@index([saleId])
  @@index([staffId])
```

**New Table: `SaleMetrics`** (Denormalized, updated by cron)
```
SaleMetrics
  id              String     @id @default(cuid())
  saleId          String     @unique
  sale            Sale       @relation(fields: [saleId], references: [id], onDelete: Cascade)
  itemsListed     Int        @default(0)
  itemsSold       Int        @default(0)
  revenueCaptured Decimal    @default(0)
  shoppersActive  Int        @default(0)
  lastUpdatedAt   DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
```

**Modify: `Sale`**
```
// Add to Sale:
staffAssignments StaffAssignment[]
metrics          SaleMetrics?
lastActionAt     DateTime?  // Timestamp of last action (for inactivity alerts)
```

### Backend Requirements

**1. Workspace Dashboard Service**
```typescript
interface WorkspaceBoard {
  upcomingVsLive: {
    upcoming: Array<SaleWithMetrics>  // Next 7 days
    live: Array<SaleWithMetrics>       // startDate <= now <= endDate
    recent: Array<SaleWithMetrics>     // Past 3 days
  }
}

interface SaleWithMetrics {
  id: string
  name: string
  bannerUrl: string
  status: "upcoming" | "live" | "ended"
  startDate: DateTime
  endDate: DateTime
  staffAssigned: Array<{
    id: string
    name: string
    avatar: string
    role: string
    status: "confirmed" | "tentative" | "declined"
  }>
  metrics: {
    itemsListed: number
    itemsSold: number
    revenueCaptured: number
    shoppersActive: number
  }
  alerts: Array<{
    type: "no_coverage" | "inactivity" | "weather" | "low_revenue"
    message: string
    severity: "info" | "warning" | "critical"
  }>
}

GET /api/workspace/board
  → Returns WorkspaceBoard for organizer (real-time or cached 30s)

// WebSocket (Socket.io):
  io.on("sale:update", (saleId, metrics) => {
    // Broadcast to all organizer clients: sale metrics changed
  })
  
  io.on("staff:status-change", (saleId, staffId, newStatus) => {
    // Broadcast: staff confirmed/declined assignment
  })
```

**2. Staff Assignment Service**
```typescript
POST /api/staff-assignments
  { saleId, staffId, role }
  → Create assignment (organizer assigns staff)

PATCH /api/staff-assignments/{id}
  { status: "confirmed" }
  → Staff accepts assignment

DELETE /api/staff-assignments/{id}
  → Organizer removes staff from sale (or staff declines)

GET /api/sales/{saleId}/staff-assignments
  → Get all staff for sale
```

**3. Metrics Aggregation Service (Cron)**
```typescript
// Runs every 5 minutes during sale hours:
function updateSaleMetrics(saleId: string) {
  const sale = await Sale.findUnique({ include: { items, posTransactions } })
  const itemsListed = sale.items.length
  const itemsSold = sale.posTransactions.reduce((sum, tx) => sum + tx.itemCount, 0)
  const revenueCaptured = sale.posTransactions.reduce((sum, tx) => sum + tx.amount, 0)
  
  await SaleMetrics.update({
    where: { saleId },
    data: { itemsListed, itemsSold, revenueCaptured, lastUpdatedAt: now() }
  })
}

// Also update Sale.lastActionAt on any item/POS action
```

**4. Alert Service**
```typescript
interface Alert {
  type: "no_coverage" | "inactivity" | "weather" | "low_revenue"
  message: string
  severity: "info" | "warning" | "critical"
  createdAt: DateTime
  resolvedAt: DateTime?
}

// Generate alerts based on:
// - no_coverage: No staff assigned to sale + startDate within 3 days
// - inactivity: Sale live for 2+ hours, lastActionAt > 120 min ago
// - weather: Call weather API, if >80% chance rain/snow
// - low_revenue: Sale live 4+ hours, items sold < 20% of items listed
```

### Frontend Requirements

**1. Workspace View Page** (`/workspace/[slug]`)

**Layout: Three Columns**
- **Column 1: Live Now (if any)**
  - Sale card (image, name, staff avatars, key metrics)
  - Click → drill into live sale detail
  - Alert badges (⚠️ Inactivity, 🌧️ Weather, etc.)

- **Column 2: Upcoming (7 days)**
  - Sale cards chronological
  - "Staff assigned: Sam (confirm?), Jordan (pending)"
  - Click → assign more staff / edit

- **Column 3: Recent (3 days)**
  - Sale cards (archival)
  - Summary stats (final revenue, item count)

**2. Components**
- `SaleCard` — Reusable card showing sale + metrics + staff
- `AlertBadge` — Visual indicator for issues (color-coded)
- `StaffAvatarGroup` — Circular avatars of assigned staff
- `MetricsRow` — Items, Revenue, Shoppers (read-only)

**3. UX Considerations**
- Live now column floats to top (most urgent)
- Click sale card → navigate to `/organizer/sales/{saleId}` (existing detail page)
- Staff assignment is drag-and-drop (nice-to-have) or modal (MVP)
- Alerts appear as badges, hover for details
- Mobile: Stack columns vertically (live, then upcoming, then recent)

**4. Real-time Updates**
- Subscribe to Socket.io events for sale metrics changes
- When metrics update, update card in place (smooth animations)
- When staff status changes, update avatar group in real-time

### Validation & Gating

- **Metrics:** Only populate if sale is live or ended (don't show 0 metrics for future sales)
- **Alerts:** Only show if severity >= warning
- **Staff assignments:** Can only assign staff with "confirmed" availability for that sale date

### Testing Checklist

- [ ] Board loads with 3 columns (upcoming, live, recent)
- [ ] Sale card displays metrics correctly (seeded from SaleMetrics)
- [ ] Metrics update every 5 min (check SQL logs)
- [ ] Alerts trigger correctly (no_coverage: 3 days out, inactivity: 2+ hours live, weather: API integration)
- [ ] Staff avatars appear in order (confirmed first)
- [ ] WebSocket updates card in real-time (test with two browser tabs)
- [ ] Mobile: columns stack vertically without overflow
- [ ] Dark mode: cards/text are readable

---

## SESSION 4: SMART TASKS + CHAT (1 Week)

### Schema Changes

**New Table: `TeamTask`**
```
TeamTask
  id              String     @id @default(cuid())
  saleId          String
  sale            Sale       @relation(fields: [saleId], references: [id], onDelete: Cascade)
  createdBy       String
  createdByStaff  StaffMember @relation("CreatedTasks", fields: [createdBy], references: [id])
  assignedTo      String?
  assignedStaff   StaffMember? @relation("AssignedTasks", fields: [assignedTo], references: [id])
  title           String     // "Set up registers", "Photo QA items 100–150", "Customer service"
  description     String?    // Optional details
  status          String     // "pending", "in_progress", "completed"
  priority        String     // "low", "medium", "high"
  dueDate         DateTime?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  @@index([saleId])
  @@index([assignedTo])
```

**New Table: `SaleConversation`** (Extends existing Conversation model)
```
SaleConversation
  id              String     @id @default(cuid())
  saleId          String
  sale            Sale       @relation(fields: [saleId], references: [id], onDelete: Cascade)
  organizerId     String
  organizer       Organizer  @relation(fields: [organizerId], references: [id])
  messages        Message[]  @relation("SaleMessages")
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  @@unique([saleId, organizerId])
  @@index([saleId])
```

**Modify: `Message`**
```
// Add to Message:
saleConversationId String?
saleConversation   SaleConversation? @relation("SaleMessages", fields: [saleConversationId], references: [id])
isPinned           Boolean   @default(false)  // For important alerts
```

### Backend Requirements

**1. Task Assignment Service**
```typescript
interface TaskSuggestion {
  staffId: string
  staffName: string
  skillMatches: string[]  // ["photo_expert", "setup_crew"]
  availabilityMatch: boolean
  score: number  // 0–100, based on skill + availability
}

POST /api/tasks
  { saleId, title, description, priority, suggestedSkills[] }
  → Create task, return suggestions

function getSuggestions(
  saleId: string,
  suggestedSkills: string[]
): TaskSuggestion[] {
  // 1. Find all staff assigned to this sale
  // 2. Filter by skill match (if staff has any of suggestedSkills)
  // 3. Check if staff available during sale hours
  // 4. Score by: skill specificity + availability + workload (count existing tasks)
  // 5. Return top 5
}

POST /api/tasks/{taskId}/assign/{staffId}
  → Assign task to staff (send notification)

PATCH /api/tasks/{taskId}
  { status: "in_progress" | "completed" }
  → Update task status

DELETE /api/tasks/{taskId}
  → Delete task (only if not assigned)
```

**2. Sale Chat Service**
```typescript
POST /api/sales/{saleId}/messages
  { text, isPinned }
  → Send message to sale chat thread

GET /api/sales/{saleId}/messages?limit=50&offset=0
  → Get message history (paginated)

PATCH /api/messages/{messageId}
  { isPinned: true }
  → Pin message (organizer only)

DELETE /api/messages/{messageId}
  → Delete message (sender or organizer only)

// WebSocket:
  io.on("sale-message:new", (saleId, message) => {
    // Broadcast to all staff in this sale
  })
  
  io.on("sale-message:pinned", (saleId, messageId) => {
    // Broadcast: message pinned (move to top)
  })
```

**3. Notification Service (Extend)**
```typescript
// When task assigned:
  sendNotification(staffId, {
    type: "task:assigned",
    title: "New task: Photo QA items 100–150",
    saleId,
    taskId,
    pushEnabled: true
  })

// When message posted in sale chat:
  broadcastToSale(saleId, {
    type: "sale-message:new",
    message: "⚠️ Parking lot is full, overflow to street",
    sender: organizerName,
    isPinned: true // If weather alert, auto-pin
  })
```

### Frontend Requirements

**1. Task Board Component** (In Workspace View or separate page)

**Layout: Kanban-style**
- Columns: Pending | In Progress | Completed
- Cards per column: task title, assignee avatar, priority tag, due date
- Drag-and-drop to change status (nice-to-have; modal is MVP)

**2. Components**
- `TaskBoard` — Kanban layout
- `TaskCard` — Title, priority, assignee, due date
- `TaskCreationModal` — Title, description, priority, suggested staff
- `TaskAssignmentDropdown` — List of suggestions with skill badges

**3. Chat Component** (Below task board or in sidebar)

**Layout: Message thread**
- Messages chronological (oldest first)
- Pinned messages at top (highlighted)
- Staff name + avatar + timestamp
- Editable by sender, deletable by sender/organizer
- "@organizer" mention support (nice-to-have)

**4. UX Considerations**
- Task suggestions appear immediately after task title entered
- Click "Assign to [Staff Name]" → task moves to staff + notification sent
- Chat auto-scrolls to latest message
- Pinned messages have different background color
- Mobile: task board collapses to single column (filter by status)

### Validation & Gating

- **Tasks:** Title required, max 200 chars. Due date optional but can't be in past.
- **Chat:** Max 1000 chars per message. No image/file upload (MVP).
- **Mentions:** Optional feature — only mention organizer via @organizer (no full user search MVP)

### Testing Checklist

- [ ] Create task → suggestions appear (based on skills)
- [ ] Click suggestion → task assigned + notification sent
- [ ] Drag task to "In Progress" → status updates + organizer sees change
- [ ] Post message in chat → other staff see it real-time (WebSocket)
- [ ] Pin message → appears at top with highlight
- [ ] Delete own message → gone from thread
- [ ] Mobile: task board single-column, chat full-width

---

## SESSION 5: LEADERBOARD + ANALYTICS + COMMAND CENTER (1 Week)

### Schema Changes

**New Table: `PerformanceRanking`** (Denormalized, updated daily)
```
PerformanceRanking
  id              String     @id @default(cuid())
  organizerId     String
  organizer       Organizer  @relation(fields: [organizerId], references: [id])
  weekOf          DateTime   // Start of week
  staffId         String
  staffMember     StaffMember @relation(fields: [staffId], references: [id])
  itemsTagged     Int
  posTransactions Int
  photoQuality    Float      // 0–100
  customerFeedback Float     // 1–5
  overallScore    Int        // 0–100, weighted combination
  rank            Int        // 1, 2, 3, etc.
  createdAt       DateTime   @default(now())

  @@unique([organizerId, weekOf, staffId])
  @@index([organizerId, weekOf])
```

**Modify: `Organizer`**
```
// Add to Organizer:
leaderboardBonusEnabled Boolean @default(false)
leaderboardBonusAmount  Decimal @default(50)  // Dollars
leaderboardBonusFrequency String @default("weekly")  // "weekly" or "monthly"
lastBonusPaid           DateTime?
```

### Backend Requirements

**1. Team Leaderboard Service**
```typescript
interface LeaderboardEntry {
  rank: number
  staffId: string
  staffName: string
  itemsTagged: number
  posTransactions: number
  photoQuality: number
  customerFeedback: number
  overallScore: number  // 0–100
  bonusEligible: boolean
  bonusAmount: number
}

GET /api/leaderboard?weekOf={date}
  → Returns leaderboard for week (or current week if omitted)

// Scoring formula:
function calculateOverallScore(
  itemsTagged: number,
  posTransactions: number,
  photoQuality: number,
  customerFeedback: number
): number {
  // Normalize each metric 0–25 points
  const itemsScore = Math.min(25, (itemsTagged / 50) * 25)  // 50 items = max
  const posScore = Math.min(25, (posTransactions / 100) * 25)  // 100 tx = max
  const qualityScore = (photoQuality / 100) * 25  // Already 0–100
  const feedbackScore = (customerFeedback / 5) * 25  // 5 stars = max
  
  return Math.round(itemsScore + posScore + qualityScore + feedbackScore)
}

// Cron (Sunday evening):
function updateLeaderboard(organizerId: string) {
  const staff = await StaffMember.findMany({ where: { organizerId } })
  const weekOf = getWeekStart(new Date())
  
  for (const member of staff) {
    const metrics = await getStaffWeekMetrics(member.id, weekOf)
    const score = calculateOverallScore(...)
    
    await PerformanceRanking.upsert({
      where: { organizerId_weekOf_staffId: { organizerId, weekOf, staffId: member.id } },
      data: {
        itemsTagged: metrics.items,
        posTransactions: metrics.pos,
        photoQuality: metrics.quality,
        customerFeedback: metrics.feedback,
        overallScore: score,
        rank: (will be calculated in SQL after all inserted)
      }
    })
  }
  
  // Update ranks (rank = row_number() over (order by score desc))
  await calculateRanks(organizerId, weekOf)
}
```

**2. Bonus Payout Service** (Stripe)
```typescript
async function payBonusToTopStaff(organizerId: string, weekOf: DateTime) {
  const org = await Organizer.findUnique({ where: { id: organizerId } })
  if (!org.leaderboardBonusEnabled) return
  
  const topStaff = await PerformanceRanking.findFirst({
    where: { organizerId, weekOf, rank: 1 }
  })
  
  if (!topStaff) return
  
  const staff = await StaffMember.findUnique({ where: { id: topStaff.staffId } })
  
  // Create payout via Stripe Connect (or simple ACH for MVP)
  // For MVP: just store in "pendingPayout" field, manual organizer approval
  // For V2: auto-transfer via Stripe
  
  await StaffMember.update({
    where: { id: staff.id },
    data: {
      pendingBonus: org.leaderboardBonusAmount,
      lastBonusWeek: weekOf
    }
  })
  
  // Send notification to staff
  sendNotification(staff.id, {
    type: "bonus:earned",
    message: `You won leaderboard bonus for week of ${formatDate(weekOf)}: $${org.leaderboardBonusAmount}`
  })
}
```

**3. Analytics Service**
```typescript
interface WorkspaceAnalytics {
  totalRevenue: number
  totalItemsTagged: number
  totalItemsSold: number
  averagePhotoQuality: number
  topPerformers: LeaderboardEntry[]
  trendChart: Array<{ week: date, revenue: number, itemsSold: number }>
}

GET /api/workspace/analytics?from={date}&to={date}
  → Returns analytics for date range

// Also serves data for:
//   - Revenue by staff (pie chart)
//   - Items by category (bar chart)
//   - Quality trend (line chart)
```

**4. Command Center Alert Service**
```typescript
interface CommandCenterAlert {
  id: string
  type: "weather" | "inactivity" | "coverage_gap" | "revenue_anomaly"
  severity: "info" | "warning" | "critical"
  sale: { id, name, startDate }
  message: string
  actionUrl: string  // Link to relevant page (/workspace/[slug] or /organizer/sales/{saleId})
  createdAt: DateTime
  resolvedAt: DateTime?
}

GET /api/command-center/alerts?unresolved=true
  → List unresolved alerts (newest first)

// Alert generation:
// 1. Weather (call weather API 12h before sale start)
function checkWeatherAlerts(saleId: string) {
  const sale = await Sale.findUnique(...)
  const { lat, lng } = sale.location
  const forecast = await weatherAPI.getForecast(lat, lng)
  
  if (forecast.precipProbability > 70) {
    createAlert(saleId, "weather", "warning", "⛈️ 75% chance of rain — consider moving outdoors")
  }
}

// 2. Inactivity (check every hour during sale)
function checkInactivityAlerts(saleId: string) {
  const sale = await Sale.findUnique(...)
  const lastAction = sale.lastActionAt
  
  if (isSaleHours(sale) && minutesSince(lastAction) > 120) {
    createAlert(saleId, "inactivity", "warning", "⚠️ No activity for 2 hours — check staff status")
  }
}

// 3. Coverage Gap (1 week before sale)
function checkCoverageAlerts(saleId: string) {
  const sale = await Sale.findUnique({ include: { staffAssignments: true } })
  
  if (sale.staffAssignments.length === 0) {
    createAlert(saleId, "coverage_gap", "critical", "🚨 No staff assigned — add team members")
  }
}

// 4. Revenue Anomaly (only for live sales, 4+ hours in)
function checkRevenueAlerts(saleId: string) {
  const sale = await Sale.findUnique(...)
  const metrics = await SaleMetrics.findUnique({ where: { saleId } })
  
  const percentageSold = metrics.itemsSold / metrics.itemsListed
  
  if (hoursSinceLiveStart(sale) >= 4 && percentageSold < 0.1) {
    createAlert(saleId, "revenue_anomaly", "info", "📊 Only 5% items sold so far — consider promotional activity")
  }
}
```

### Frontend Requirements

**1. Team Leaderboard Page** (`/organizer/leaderboard`)

**Layout:**
- Week selector (prev/next week arrows)
- Leaderboard table:
  - Rank | Name | Items Tagged | POS Tx | Photo Quality | Feedback | Score | Bonus
  - Top 3 highlighted (gold/silver/bronze)
- Bonus info (if enabled): "Weekly bonus: $50 to #1 staff"

**2. Workspace Analytics Page** (New, or tab in Workspace Settings)

**Layout: Dashboard with 4 sections**
- **Key Metrics:** Total revenue (this week), items sold, avg quality
- **Revenue by Staff:** Pie chart (staff name → revenue from their items)
- **Quality Trend:** Line chart (weeks → avg photo quality)
- **Top Items:** Table (sku, price, seller, quality score)

**3. Command Center Page** (`/organizer/command-center`)

**Layout: Single feed**
- Alert cards (newest first)
- Card per alert: type icon | message | sale name | time | action link
- Filter: Show unresolved only (toggle)
- Mark as resolved (click check icon)

**Colors/Severity:**
- Critical: Red background
- Warning: Orange background
- Info: Blue background

**4. Components**
- `LeaderboardTable` — Sortable table with rank highlighting
- `AnalyticsDashboard` — Key metrics + charts (use Chart.js or Recharts)
- `AlertCard` — Alert with icon, message, sale context, action link
- `CommandCenterFeed` — List of alerts with filter toggle

### UX Considerations

- Leaderboard updates weekly (Sunday evening), so staff see new rankings Monday morning
- Bonus eligible staff get notification + email (if enabled)
- Analytics dashboard shows both YTD and rolling 4-week trend
- Command Center auto-populates with alerts (no manual creation needed)
- Each alert has "resolve" action (when issue is fixed, staff clicks to clear)

### Validation & Gating

- **Bonus:** Only enabled for TEAMS organizers with 2+ staff
- **Leaderboard:** Don't show if only 1 staff member
- **Analytics:** Don't show metrics for future sales
- **Alerts:** Only show if sale is within 7 days or currently live

### Testing Checklist

- [ ] Leaderboard ranks correctly (seeded with test data)
- [ ] Bonus notification sent to #1 staff (check Resend)
- [ ] Analytics charts display correctly (check Chart.js rendering)
- [ ] Weather alert triggers 12h before sale (mock weather API)
- [ ] Inactivity alert triggers after 2h no activity (test with seeded lastActionAt)
- [ ] Coverage gap alert triggers for sale with no staff
- [ ] Revenue anomaly alert shows only after 4h if < 10% sold
- [ ] Leaderboard bonus amount correctly reads from organizer settings
- [ ] Mobile: table scrolls horizontally, charts resize

---

## CROSS-CUTTING CONCERNS

### Authentication & Permissions

- All new endpoints must check `authenticate()` first
- Workspace-related endpoints (board, templates, roles): check `isTeamsOrganizer()`
- Staff-related endpoints (skills, availability): check `isOrganizer()` OR `isStaffMember() && belongsToSameSale()`
- For chat/tasks: check `isSaleParticipant()` (organizer or assigned staff)

### Error Handling

- **400 Bad Request:** Invalid schema/missing required fields
- **403 Forbidden:** Permission denied (e.g., staff member tries to delete role)
- **404 Not Found:** Resource doesn't exist
- **409 Conflict:** Duplicate entry (e.g., staff already has skill)
- **500 Internal Server Error:** Unexpected error (log full stack)

### Logging & Monitoring

- Log all permission denials (for security audit)
- Log all role/permission changes (who changed what, when)
- Log WebSocket events (message sent, assignment updated)
- Monitor Leaderboard cron job (runs Sunday 8pm UTC)
- Monitor weather API calls (rate limiting)

### Performance

- **Leaderboard:** Denormalized ranking table (run weekly cron only, not real-time)
- **Metrics:** Denormalized SaleMetrics table (update every 5 min, not on-demand)
- **Chat:** Index on saleId + createdAt (fast pagination)
- **WebSocket:** Use Redis pub/sub if scaling (not needed for MVP)

---

## QA ACCEPTANCE CRITERIA (By Feature)

### Templates & Role Builder
- [ ] All 5 templates seed without error
- [ ] Applying template creates roles correctly
- [ ] Organizer can edit role permissions
- [ ] Organizer can't delete role with staff assigned
- [ ] Cost calculator updates on staff count change
- [ ] Bulk invite CSV upload works + sends role assignments
- [ ] Mobile: form inputs usable on small screens

### Staff Management
- [ ] Add skill → staff profile updates
- [ ] Remove skill → skill disappears
- [ ] Set availability → availability calendar updates
- [ ] Google Calendar sync fetches correctly (test with dummy account)
- [ ] Performance snapshot shows correct counts (verify against DB)
- [ ] Staff can see their own performance snapshot
- [ ] Organizer can see all staff performance snapshots

### Workspace View
- [ ] Board loads with 3 sections (upcoming, live, recent)
- [ ] Sale card displays correct metrics (test with seeded POS/item data)
- [ ] Staff avatars appear on card (in confirmation order)
- [ ] WebSocket updates metrics in real-time
- [ ] Metrics update cron runs every 5 min (check SQL audit log)
- [ ] Alerts appear correctly (weather 12h out, inactivity 2h+, coverage gap day-0, revenue anomaly 4h+)
- [ ] Dark mode contrast is WCAG AA

### Smart Tasks & Chat
- [ ] Create task → suggestions appear immediately
- [ ] Task suggestions ranked by skill + availability match
- [ ] Assign task → notification sent + task status updated
- [ ] Drag task to "In Progress" → status updates
- [ ] Post message in chat → all sale participants see it
- [ ] Pin message → appears at top with highlight
- [ ] Mobile: task board single column (filter by status)

### Leaderboard & Analytics
- [ ] Leaderboard calculates scores correctly (verify formula)
- [ ] Ranks update weekly (Sunday cron)
- [ ] Bonus notification sent to #1 staff
- [ ] Analytics charts display data correctly
- [ ] Revenue by staff pie chart sums correctly
- [ ] Quality trend line chart shows progression
- [ ] Command Center alerts populate (weather, inactivity, coverage, revenue)
- [ ] Alert filter works (show/hide resolved)

---

## DEPLOYMENT CHECKLIST

**Before Pushing Session 1:**
- [ ] Schema migration tested locally (Prisma migrate dev)
- [ ] All new API routes tested (Postman or curl)
- [ ] Frontend components render without errors
- [ ] Permissions middleware in place (staff can't access /role endpoint)

**Before Pushing Session 3 (Workspace View):**
- [ ] WebSocket connection established (test with two browser tabs)
- [ ] Metrics aggregation cron tested (run manually, check SQL)
- [ ] Alert generation logic tested (mock weather API)
- [ ] Real-time updates don't cause UI flicker (test on slow connection)

**Before Pushing Session 5 (Leaderboard):**
- [ ] Leaderboard cron tested (check PerformanceRanking table)
- [ ] Bonus payout logic tested (dry-run Stripe integration)
- [ ] Chart.js integration tested (no console errors)

**Production Deploy:**
- [ ] All migrations applied (Railway PostgreSQL)
- [ ] Feature flags created if needed (e.g., leaderboardBonusEnabled off by default)
- [ ] Cron jobs registered in production environment
- [ ] WebSocket connection verified (open Chrome DevTools, check Network tab)
- [ ] Smoke test: create TEAMS organizer, apply template, assign staff, post chat message

---

## BLOCKERS & RISKS

**Low Risk:**
- All features layer onto existing schema (no breaking changes)
- All features are optional (organizer can ignore leaderboard, chat, etc.)
- No external API integrations except weather (plug-and-play)

**Medium Risk:**
- WebSocket infrastructure (if not already in codebase, add Socket.io + Redis pub/sub)
- Cron job timing (leaderboard runs weekly, must avoid race conditions)
- Real-time metrics updates (5-min cron may lag during high load)

**High Risk:**
- None identified. This scope is well-scoped and dependencies are clear.

---

## REFERENCE DOCS

- Existing schema: `packages/database/prisma/schema.prisma`
- Existing permissions model: Search codebase for `requireRole()` or similar
- WebSocket setup: Look in `packages/backend/src/index.ts` for Socket.io initialization
- Stripe integration: Look in `packages/backend/src/controllers/stripeController.ts`

---

**Document:** Team Collaboration Features — Developer Implementation Checklist  
**For:** Architect, Dev Lead, QA  
**Date:** 2026-04-11  
**Status:** Ready for task estimation (5 sessions, ~6–8 weeks parallel)
