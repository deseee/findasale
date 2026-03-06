# Sale Template System Implementation

## Overview
A complete sale template system for FindA.Sale organizers to save and reuse sale configurations, reducing manual entry for repeat sales.

---

## Database Changes

### Prisma Schema Update
**File**: `/sessions/cool-charming-mccarthy/mnt/FindaSale/packages/database/prisma/schema.prisma`

#### Added to Organizer model:
```prisma
saleTemplates   SaleTemplate[]
```

#### New SaleTemplate model:
```prisma
model SaleTemplate {
  id           String   @id @default(cuid())
  organizerId  String
  organizer    Organizer @relation(fields: [organizerId], references: [id], onDelete: Cascade)
  name         String
  description  String?
  defaultItems Json?    // Default item categories/conditions to pre-populate
  settings     Json?    // Sale settings: pickup slots, shipping options, etc.
  usedCount    Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([organizerId])
}
```

### Migration
**File**: `/sessions/cool-charming-mccarthy/mnt/FindaSale/packages/database/prisma/migrations/20260306000026_add_sale_templates/migration.sql`

Creates the `SaleTemplate` table with indexes and foreign key constraints.

---

## Backend Implementation

### Template Controller
**File**: `/sessions/cool-charming-mccarthy/mnt/FindaSale/packages/backend/src/controllers/templateController.ts`

**Exported Functions**:
- `createTemplate(req, res)` - POST /organizer/templates
  - Validates template name (required, max 100 chars)
  - Stores optional description and settings JSON
  - Returns created template

- `listTemplates(req, res)` - GET /organizer/templates
  - Fetches all templates for authenticated organizer
  - Returns sorted by creation date (newest first)

- `getTemplate(req, res)` - GET /organizer/templates/:id
  - Retrieves specific template with ownership check
  - Returns 404 if not found or unauthorized

- `updateTemplate(req, res)` - PATCH /organizer/templates/:id
  - Allows partial updates (name, description, settings, defaultItems)
  - Validates ownership before update

- `deleteTemplate(req, res)` - DELETE /organizer/templates/:id
  - Soft-deletes template (cascade delete via Prisma)
  - Validates ownership before deletion

- `applyTemplate(req, res)` - POST /organizer/templates/:id/apply
  - Creates new DRAFT sale from template settings
  - Increments template usedCount
  - Returns new sale object with ID for redirect

### Template Routes
**File**: `/sessions/cool-charming-mccarthy/mnt/FindaSale/packages/backend/src/routes/templates.ts`

```
POST   /organizer/templates           - Create template
GET    /organizer/templates           - List templates
GET    /organizer/templates/:id       - Get single template
PATCH  /organizer/templates/:id       - Update template
DELETE /organizer/templates/:id       - Delete template
POST   /organizer/templates/:id/apply - Apply template to new sale
```

### Backend Integration
**File**: `/sessions/cool-charming-mccarthy/mnt/FindaSale/packages/backend/src/index.ts`

Added route registration:
```typescript
import templateRoutes from './routes/templates';
// ...
app.use('/api/organizer/templates', templateRoutes);
```

---

## Frontend Implementation

### Create Sale Page Updates
**File**: `/sessions/cool-charming-mccarthy/mnt/FindaSale/packages/frontend/pages/organizer/create-sale.tsx`

**New State Variables**:
- `saveAsTemplate: boolean` - Toggle to save sale as template
- `templateName: string` - Name for the template
- `templateDescription: string` - Optional template description
- `showTemplateModal: boolean` - Toggle template selection modal
- `showUseTemplateModal: boolean` - Toggle use template modal

**New Functions**:
- `handleSaveTemplate()` - Saves current form as template (unused, integrated into submit)
- `handleApplyTemplate(templateId)` - Applies template and creates draft sale
- `handleSubmit(e)` - Enhanced to optionally save template after creating sale

**UI Enhancements**:
1. "Use a Template" button in header (top-right)
2. "Save as template" checkbox with name/description inputs
3. Template selection modal showing all templates with usage count
4. Responsive grid layout for templates

### Templates Management Page
**File**: `/sessions/cool-charming-mccarthy/mnt/FindaSale/packages/frontend/pages/organizer/templates.tsx`

**Features**:
- List all organizer's templates in grid layout
- Inline edit mode for name and description
- Delete confirmation modal
- Usage counter (tracks how many sales created from template)
- "Use Template" button creates new draft sale
- Empty state with CTA to create first sale

**API Calls**:
- `GET /organizer/templates` - Fetch all templates
- `PATCH /organizer/templates/:id` - Update template
- `DELETE /organizer/templates/:id` - Delete template
- `POST /organizer/templates/:id/apply` - Apply template

### Dashboard Update
**File**: `/sessions/cool-charming-mccarthy/mnt/FindaSale/packages/frontend/pages/organizer/dashboard.tsx`

Added "Templates" button to action buttons:
```
Link to /organizer/templates with blue styling
```

---

## API Contract

### Create Template
```
POST /api/organizer/templates

Request:
{
  name: string (required, 1-100 chars)
  description?: string (max 500 chars)
  defaultItems?: object
  settings?: object
}

Response (201):
{
  id: string
  organizerId: string
  name: string
  description: string | null
  defaultItems: object | null
  settings: object | null
  usedCount: 0
  createdAt: ISO8601
  updatedAt: ISO8601
}
```

### List Templates
```
GET /api/organizer/templates

Response (200):
[
  {
    id: string
    organizerId: string
    name: string
    description: string | null
    defaultItems: object | null
    settings: object | null
    usedCount: number
    createdAt: ISO8601
    updatedAt: ISO8601
  }
  ...
]
```

### Apply Template
```
POST /api/organizer/templates/:id/apply

Response (201):
{
  id: string (new sale ID)
  title: string
  description: string
  startDate: ISO8601
  endDate: ISO8601
  address: string
  city: string
  state: string
  zip: string
  lat: number
  lng: number
  status: "DRAFT"
  organizerId: string
  createdAt: ISO8601
  updatedAt: ISO8601
}
```

---

## Usage Workflow

### Save a Sale as Template
1. Organizer creates new sale via `/organizer/create-sale`
2. Checks "Save as template for future sales"
3. Enters template name and optional description
4. Submits form - sale is created and template is saved

### Use a Saved Template
1. Organizer clicks "Use a Template" on create-sale page
2. Selects template from modal
3. New draft sale is created with template settings
4. Redirected to add-items page
5. Template usedCount is incremented

### Manage Templates
1. Organizer navigates to `/organizer/templates`
2. Can edit template name/description inline
3. Can delete templates (confirmation required)
4. Can create new sale from any template
5. Sees usage statistics for each template

---

## Notes

- **Authentication**: All routes require organizer role authentication
- **Authorization**: Organizers can only access their own templates
- **Validation**: TypeScript strict mode enforced
- **Error Handling**: Consistent error responses with appropriate HTTP status codes
- **Cascade Delete**: Deleting organizer cascades to their templates
- **JSON Storage**: defaultItems and settings stored as JSONB for flexibility
- **Usage Tracking**: usedCount helps organizers identify popular configurations

---

## Files Modified/Created

### Created:
1. `/packages/database/prisma/migrations/20260306000026_add_sale_templates/migration.sql`
2. `/packages/backend/src/controllers/templateController.ts`
3. `/packages/backend/src/routes/templates.ts`
4. `/packages/frontend/pages/organizer/templates.tsx`

### Modified:
1. `/packages/database/prisma/schema.prisma` - Added SaleTemplate model and organizer relation
2. `/packages/backend/src/index.ts` - Registered template routes
3. `/packages/frontend/pages/organizer/create-sale.tsx` - Added template UI and logic
4. `/packages/frontend/pages/organizer/dashboard.tsx` - Added Templates button

---

## Next Steps (Optional Enhancements)

1. **Item Default Templates**: Store default item categories and conditions in defaultItems JSON
2. **Pickup Slot Presets**: Include pickup window templates in settings
3. **Template Sharing**: Allow organizers to share templates with peers
4. **Template Categories**: Tag templates by type (furniture, jewelry, etc.)
5. **Quick Clone**: One-click "Duplicate Template" without creating sale
6. **Analytics**: Track which templates generate most sales/revenue
