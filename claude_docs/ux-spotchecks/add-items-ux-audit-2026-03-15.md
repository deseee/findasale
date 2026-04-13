# UX Audit: Add Items Page vs Review & Publish Page
**Date:** 2026-03-15
**Status:** Ready for findasale-dev dispatch
**Scope:** Redesign of Add Items page (organizer/add-items/[saleId].tsx) to match usability and visual standards of Review & Publish page

---

## Executive Summary

Live Chrome audit identified 3 critical blocking issues, 8 high-priority usability gaps, and 3 medium-priority issues on the Add Items page. The Review & Publish page serves as the usability reference — it shows what works well (photo context, progress feedback, meaningful status badges, prominent CTA) and what Add Items lacks.

**Critical issues prevent task completion:** Checkboxes are non-functional, bulk action dropdowns are clipped, and select-all is inaccessible.

**High-priority issues prevent efficient bulk work:** No sticky action bar, no sale context, misleading status labels, no edit actions, no photo previews, and oversized camera section.

All fixes are UI/layout-only — no schema, API, or business logic changes required.

---

## Audit Findings (Prioritized)

### CRITICAL (Blocking Usability)

#### 1. **Checkboxes Non-Functional via Mouse Click**

**Issue:**
Item list checkboxes on the Add Items page do not respond to mouse clicks. They can only be triggered programmatically via JavaScript. An invisible overlay (likely the camera area or another component) is intercepting click events over the item table.

**Current State:**
- Checkboxes render visually
- Click handler is bound in code
- Click events do not reach the handler
- Select All is also non-functional

**Impact:**
Organizers cannot select any items without workarounds. Bulk operations are completely unusable.

**Fix Specification:**

1. **Identify the blocking overlay:**
   - Inspect the DOM tree in add-items/[saleId].tsx render output
   - Check for `z-index` stacking on camera section, modals, or other full-width containers
   - Verify no `pointer-events: none` is needed but incorrectly applied to the item table
   - Check if a modal backdrop is capturing clicks

2. **Solution approach (most likely):**
   - Move camera section out of the item table stacking context or ensure it does not overlay the table
   - Ensure item table has `z-index` higher than any capture layers
   - Verify checkbox inputs have `pointer-events: auto` explicitly set
   - Test click propagation: click handler should fire on checkbox or table row

3. **Validation:**
   - Single left-click on checkbox must toggle selection immediately
   - Keyboard focus on checkbox must also work (Space to toggle)
   - No visual lag or secondary click required

**Dev Notes:**
- Check lines 600–700 of add-items/[saleId].tsx for table render and camera section DOM order
- Likely root cause: camera component wrapping or full-screen positioning interfering with table hit detection
- Test in browser DevTools: use `document.elementFromPoint(x, y)` to verify what element is receiving the click

---

#### 2. **"More Actions" Dropdown Clipped by Footer/Viewport Edge**

**Issue:**
The bulk action toolbar is positioned at the bottom of the page. When "More Actions" is clicked, its dropdown menu opens downward and is immediately cut off by the viewport/footer. The dropdown cannot be read or interacted with.

**Current State:**
- Toolbar appears in a fixed or sticky position at page bottom
- Dropdown direction is hardcoded to open downward (default)
- No viewport collision detection

**Impact:**
Organizers cannot access bulk actions like "Set Category", "Manage Tags", "Manage Photos".

**Fix Specification:**

1. **Dropdown Direction Detection (Recommended implementation):**
   - In BulkActionDropdown component (or where "More Actions" is rendered):
     - On click of "More Actions", detect dropdown position
     - Calculate remaining vertical space below button: `window.innerHeight - buttonRect.bottom`
     - If remaining space < dropdown height (estimate 250px for 5–6 items):
       - Set `dropup` variant or `transform-origin: bottom` to open upward
       - Open with `bottom: 100%` (above the button) instead of `top: 100%`
     - If sufficient space, open downward normally

2. **Toolbar Repositioning (Alternative):**
   - Move bulk action toolbar to sticky top bar (see High Priority #4 spec)
   - Dropdown then has full viewport height below it and never clips
   - Preferred: solves #4 and #2 simultaneously

3. **CSS for dropup:**
   ```css
   /* BulkActionDropdown.tsx or similar */
   .dropdown-menu--dropup {
     bottom: 100%;
     top: auto;
     margin-bottom: 8px; /* space between button and dropdown */
     transform-origin: bottom center;
   }
   ```

4. **Validation:**
   - Click "More Actions" when toolbar is at bottom of page → dropdown opens upward, fully visible
   - Click "More Actions" when toolbar is at top (sticky) → dropdown opens downward, fully visible
   - All dropdown items clickable and readable

---

#### 3. **"Select All" Checkbox Buried Below Last Item**

**Issue:**
The "Select all 16 items" checkbox appears *below* the last row in the item list, not in the table header. Organizers must scroll to the end of their entire inventory (potentially 50+ items) to find and use it.

**Current State:**
- Checkbox is rendered in the table body, below all items
- No header row in the table structure
- "Select all X items" text is inline with the checkbox

**Impact:**
Selecting all items is unusable for any inventory with more than 1 screen's worth of items.

**Fix Specification:**

1. **Table Structure Redesign:**
   - Add a `<thead>` section to the item table with a proper header row
   - Move "Select all" checkbox into the first column of the header
   - Format: `<input type="checkbox" /> Select all X items`
   - Header background: match Review & Publish page header (light gray or subtle background)

2. **Implementation (React + HTML):**
   ```jsx
   <table className="item-list">
     <thead>
       <tr>
         <th style={{width: '40px'}}>
           <input
             type="checkbox"
             checked={allSelected}
             onChange={(e) => toggleSelectAll(e.target.checked)}
             aria-label="Select all items"
           />
         </th>
         <th>Title</th>
         <th>Category</th>
         <th>Price</th>
         <th>Photos</th>
         <th>Status</th>
         <th>Actions</th>
       </tr>
     </thead>
     <tbody>
       {/* existing item rows */}
     </tbody>
   </table>
   ```

3. **Select All Counter:**
   - Display: "Select all X items" as a secondary line in the header, or in the bulk toolbar when all are selected

4. **Validation:**
   - Checkbox visible above the first item (no scroll needed)
   - Clicking it selects/deselects all items instantly
   - Counter updates correctly ("16 items selected")

---

### HIGH (Major Usability Gaps)

#### 4. **Bulk Toolbar Only at Bottom — No Sticky Top Bar**

**Issue:**
The bulk action toolbar ("16 items selected | Hide | Show | Price | Set Price | More Actions | Delete Selected") only appears at the bottom of the item list. Organizers with 50+ items must scroll to the bottom to perform any bulk action. There's no sticky toolbar at the top of the page.

**Current State:**
- Toolbar is rendered in the bottom section of the page
- It does not scroll with the page (or may be fixed/sticky at bottom)
- No equivalent top bar exists

**Impact:**
Bulk operations are inefficient. Organizers select items at the top, then must scroll down to act on them.

**Fix Specification:**

1. **Sticky Top Toolbar (Primary Solution):**
   - Create a new sticky toolbar component to display at the top of the item list when any items are selected
   - Position: `position: sticky; top: 0; z-index: 40;` (above page content, below modal dialogs)
   - Visibility: only render when `selectedCount > 0`
   - Content layout:
     ```
     [Checkbox] X selected | [Primary Actions] | [Secondary] | [Dropdown]
     ```

2. **Toolbar Content Distribution:**

   | Position | Contents | Rationale |
   |----------|----------|-----------|
   | **Sticky Top (always visible)** | Checkbox toggle, item count, primary actions (Hide, Show, Price, Delete) | Frequent operations, need immediate access |
   | **Sticky Top > Dropdown** | "More Actions" → secondary modals (Set Category, Manage Tags, Manage Photos) | Less frequent, accessed via dropdown |
   | **Bottom (optional)** | Remove or keep as redundant backup | UX: some systems show duplicate bars top+bottom for A/B testing |

3. **Checkbox Behavior:**
   - Left side of top toolbar: checkbox showing current state
   - Clicking: toggles selection all/none
   - Shows count: "X selected" next to it

4. **Button Grouping:**
   ```
   Top Toolbar:
   [☑] 5 selected | [Hide] [Show] [Set Price] [More Actions ▼] [Delete Selected]
   ```

5. **Responsive:**
   - On mobile (<768px): compress toolbar or stack buttons
   - Ensure toolbar does not exceed viewport height

6. **CSS Hint:**
   ```css
   .bulk-toolbar-sticky {
     position: sticky;
     top: 0;
     z-index: 40;
     background: white;
     border-bottom: 1px solid #e0e0e0;
     padding: 12px 16px;
     display: flex;
     align-items: center;
     gap: 12px;
   }
   ```

7. **Validation:**
   - Select 3 items from middle of list
   - Sticky toolbar appears at top of page
   - Scroll down 500px
   - Toolbar remains visible
   - All buttons are clickable without scrolling

---

#### 5. **No Sale Context on Page**

**Issue:**
The page title is simply "Add Items" with no indication of which sale items are being added to. An organizer with 2+ active sales has no way to verify they're editing the correct sale. This is a usability AND data-safety issue.

**Current State:**
- Page title: "Add Items" (static, no dynamic sale name)
- No breadcrumb, no sale selector, no confirmation of which sale is active
- saleId is in the URL but not displayed

**Impact:**
Risk of adding items to the wrong sale. Organizer confusion and potential data errors.

**Fix Specification:**

1. **Page Header Redesign:**
   - Add dynamic sale context to the page title or header
   - Format: "Add Items to: [Sale Name]" or "Sale: [Name] → Add Items"
   - Display sale summary: "[Sale Name] (16 items, 12 published, 4 draft)"

2. **Implementation (example):**
   ```jsx
   <h1>Add Items to {saleData?.name}</h1>
   <p className="text-gray-600">
     {saleData?.name} • {itemCount} items • {publishedCount} published
   </p>
   ```

3. **Breadcrumb (Optional but Recommended):**
   ```
   Dashboard > Sales > [Sale Name] > Add Items
   ```
   - Provides navigation and context
   - Allows quick jump back to sale detail

4. **Sale Selector (If Multi-Sale is Common):**
   - If organizers frequently switch between sales:
     - Add dropdown at top: "Currently editing: [Sale Name] ▼"
     - Allows quick switch without page reload
     - Show other active sales in dropdown

5. **Validation:**
   - Page loads with sale name prominently displayed
   - Organizer can confirm they're in the right sale before taking action
   - Matches Review & Publish page header style: "16 items in this sale. 16 unpublished."

---

#### 6. **Status Column Shows "Visible/Hidden" — Not Meaningful**

**Issue:**
The Status column in the item table shows "Visible" or "Hidden" for every item. These labels are unclear in the context of the Add Items page. Organizers need to know draft status (Draft / Pending Review / Published) or availability (Available / Sold / On Hold).

**Current State:**
- Column label: "Status"
- Values: "Visible", "Hidden"
- Interpretation: unclear (visible to whom? hidden where?)

**Impact:**
Organizers cannot quickly assess which items are draft, published, or sold.

**Fix Specification:**

1. **Replace Status Column with Draft Status:**
   - Rename column to "Draft Status" (to match Review & Publish page)
   - Values: "Draft" | "Pending Review" | "Published"
   - Color-coded badges:
     | Badge | Color | Meaning |
     |-------|-------|---------|
     | Draft | Gray/Blue | Item saved but incomplete |
     | Pending Review | Orange | Item complete, awaiting publish |
     | Published | Green | Item live for buyers |

2. **Badge Component:**
   ```jsx
   <span className={`badge badge-${draftStatus.toLowerCase()}`}>
     {draftStatus}
   </span>
   ```

3. **Mapping (from backend itemController):**
   - If `draftStatus` field does not exist, compute from item completeness:
     - If missing photos OR missing price OR missing description: "Draft"
     - Else if not yet published: "Pending Review"
     - Else: "Published"

4. **Optional: Add Availability Subtext:**
   - Below the badge: small text showing availability (e.g., "Available" / "Sold" / "On Hold")
   - Requires item.isActive + reservation status

5. **Validation:**
   - Open an item without photos → shows "Draft"
   - Complete all fields → shows "Pending Review"
   - Click Publish → shows "Published"
   - Column matches Review & Publish page styling

---

#### 7. **Actions Column Only Has "Delete" — No Edit**

**Issue:**
Each item row only shows a "Delete" action. There is no way to edit an individual item from the Add Items page. Organizers must navigate elsewhere to edit item details.

**Current State:**
- Column label: "Actions"
- Content: "Delete" button/link only
- No edit option

**Impact:**
Inefficient workflow: organizers must leave Add Items page to make any edits, then navigate back.

**Fix Specification:**

1. **Add Edit Action:**
   - Add "Edit" button/link to Actions column
   - Clicking "Edit" opens:
     - **Option A:** Inline edit panel (similar to Review & Publish page)
     - **Option B:** Modal with full item edit form
     - **Option C:** Navigate to dedicated edit-item page (less preferred; breaks flow)

2. **Recommended: Inline Edit Panel (Option A — matches Review & Publish):**
   - Review & Publish page has a proven inline edit UI
   - Clicking "Edit" on a row expands the row or opens a slide-out panel
   - Panel includes: Photo Manager, Title, Description, Category, Price, Condition, Quantity, Publish toggle
   - Click "Save" or "Cancel" to close
   - Does not require page navigation

3. **Actions Column Layout:**
   ```
   [Edit] [Delete]
   ```
   or
   ```
   [Edit] [•••] → [Delete]
   ```
   (if Delete is destructive and should require confirmation)

4. **Inline Edit Panel (from review.tsx):**
   - Copy components from Review & Publish page:
     - ItemPhotoManager
     - Basic fields (title, description, category, price)
     - PriceSuggestion integration
     - Publish toggle (optional at this stage)
   - Expanded row or side panel (CSS: `max-height: 400px; overflow-y: auto;`)

5. **Validation:**
   - Click "Edit" on a row → panel appears or form loads
   - Edit a field and click "Save" → item updates without page reload
   - Delete action remains available

---

#### 8. **No Photo Thumbnails in Item List**

**Issue:**
The Add Items page shows items as text-only rows (Title, Category, Price, Status). The Review & Publish page shows photo thumbnails for each item. Organizers need visual identification to quickly locate and take action on items.

**Current State:**
- Item rows: Title | Category | Price | Status | Actions
- No photo column
- No thumbnails

**Impact:**
Organizers cannot visually identify items. With 50+ items, text search is required.

**Fix Specification:**

1. **Add Photo Column (First Column, Before Checkbox):**
   - Column width: 60–80px (square or small rectangle)
   - Content: thumbnail of first photo if available, or placeholder icon
   - Placeholder: generic "no photo" icon or light background

2. **Thumbnail Specification:**
   - Size: 60×60px or 80×80px (square)
   - Image source: item.photos[0].url (from database)
   - Fallback: placeholder SVG (e.g., 📷 or frame icon)
   - Click behavior: optional lightbox or expand to preview

3. **Implementation:**
   ```jsx
   <td className="photo-cell" style={{width: '80px'}}>
     {item.photos && item.photos.length > 0 ? (
       <img
         src={item.photos[0].url}
         alt={item.title}
         style={{width: '80px', height: '80px', objectFit: 'cover'}}
       />
     ) : (
       <div className="placeholder-photo" style={{width: '80px', height: '80px', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
         <span>📷</span>
       </div>
     )}
   </td>
   ```

4. **Row Layout After Fix:**
   ```
   [Photo] [☑] | Title | Category | Price | Photos Count | Status | Actions
   ```

5. **Photos Count Column (Optional):**
   - Show badge: "0 photos", "1 photo", "3 photos"
   - Helps organizers identify incomplete items
   - Could replace Status column or be separate

6. **Validation:**
   - Each item shows its primary photo as a thumbnail
   - Items without photos show placeholder
   - Organizers can quickly scan for missing photos by visual inspection

---

#### 9. **Camera Section Dominates Page Even When Items Exist**

**Issue:**
The camera capture area (with orange shutter button) takes up roughly 40% of the viewport, even after items have been added. The item list is pushed below the fold. The camera section should minimize once the first item exists.

**Current State:**
- Camera section: ~40% viewport height
- Item list: below the fold, requires scroll
- Camera section does not shrink based on inventory size

**Impact:**
Poor information hierarchy. Primary task (managing items) is below the fold. Secondary task (adding photos) dominates.

**Fix Specification:**

1. **Conditional Collapse Logic:**
   - If `itemCount === 0`: show full camera section (larger, prominent)
   - If `itemCount > 0`: collapse camera section to minimal height
   - Example sizes:
     | State | Camera Height | Item List % | Rationale |
     |-------|---------------|-----------|-----------|
     | No items | 60–70vh | 20–30vh | Add first item is primary task |
     | ≥1 item | 140px (compact) | 70–80vh | Manage inventory is primary task |

2. **Compact Camera Section Design:**
   - Keep shutter button and upload area
   - Remove large preview
   - Stack vertically: "Quick Add" button + hidden file input + drag-drop area
   - Height: ~140px with padding
   - Example:
     ```
     ┌──────────────────────────┐
     │ 📷 Add More Photos        │
     │ [Take Photo] [Upload]     │
     │ or drag files here        │
     └──────────────────────────┘
     ```

3. **CSS Implementation:**
   ```css
   .camera-section {
     transition: max-height 0.3s ease;
     overflow: hidden;
   }

   .camera-section--expanded {
     max-height: 70vh;
   }

   .camera-section--collapsed {
     max-height: 140px;
   }
   ```

4. **React Logic:**
   ```jsx
   const isCollapsed = itemCount > 0;

   <div className={`camera-section ${isCollapsed ? 'camera-section--collapsed' : 'camera-section--expanded'}`}>
     {/* camera UI */}
   </div>
   ```

5. **Animation:**
   - Smooth height transition when toggling
   - Prevent layout shift

6. **Validation:**
   - Load page with no items → camera section is large
   - Add first item → camera section collapses to compact
   - Scroll down → item list is main focus
   - Camera can still be used for additional photos (not hidden)

---

### MEDIUM (Polish & Consistency)

#### 10. **Onboarding Wizard Re-triggers on Every Dashboard Load**

**Issue:**
The "Welcome to FindA.Sale!" wizard reappears on dashboard load for an existing organizer with 3 active sales. This should only show once. The X button appears to trigger navigation instead of dismissing (likely an event propagation issue with an underlying link).

**Current State:**
- Modal is controlled by local state or queryParam (`?wizard=true`)
- State is not persisted to localStorage or database
- X button has an onClick that may bubble to a parent link's onClick

**Impact:**
Annoying UX: organizers must close wizard every time they reload dashboard.

**Fix Specification:**

1. **Wizard Dismissal Persistence:**
   - On first app load after signup: show wizard
   - On wizard dismiss: store flag in localStorage or database
   - Key: `onboarding_wizard_seen` (boolean, or timestamp)
   - On subsequent dashboard loads: check flag and skip wizard

2. **Implementation (localStorage):**
   ```jsx
   const [showWizard, setShowWizard] = useState(false);

   useEffect(() => {
     const seen = localStorage.getItem('onboarding_wizard_seen');
     if (!seen) setShowWizard(true);
   }, []);

   const dismissWizard = () => {
     localStorage.setItem('onboarding_wizard_seen', 'true');
     setShowWizard(false);
   };
   ```

3. **X Button Event Propagation Fix:**
   - Add `e.stopPropagation()` to the X button's onClick handler
   - Ensure X button does not have a parent `<a>` or `<button>` with conflicting onClick
   - Example:
     ```jsx
     <button onClick={(e) => {
       e.stopPropagation();
       dismissWizard();
     }}>
       ✕
     </button>
     ```

4. **Optional: Server-Side Persistence:**
   - If wizard state should persist across browsers:
     - Add `onboarding_wizard_seen: boolean` to Organizer schema
     - Set flag in `authController.ts` after signup
     - Check flag on dashboard load

5. **Validation:**
   - First login after signup: wizard appears
   - Click X or "Done" → wizard closes and does not appear again
   - Reload dashboard multiple times → wizard remains hidden
   - New organizer signup → wizard appears again (fresh account)

---

#### 11. **Broken Photo Thumbnails on Review & Publish**

**Issue:**
Items without photos show broken image alt-text wrapping inside the thumbnail box (e.g., "Missing Price", "Oak Dining Table" text wrapping visibly). A placeholder icon should be shown instead.

**Current State:**
- `<img>` tag with missing src renders broken image icon
- Alt text wraps inside the small thumbnail box
- Looks unprofessional

**Impact:**
Visual clutter and poor UX on Review & Publish page (affects user perception of completeness).

**Fix Specification:**

1. **Image Error Handling:**
   - Add `onError` handler to `<img>` tag
   - On error (404 or missing), replace with placeholder component or SVG
   - Example:
     ```jsx
     <img
       src={item.photos[0]?.url}
       alt={item.title}
       onError={(e) => {
         e.target.style.display = 'none';
         e.target.nextElementSibling?.style.display = 'flex';
       }}
     />
     <div style={{display: 'none'}} className="placeholder-photo">
       📷
     </div>
     ```

2. **Placeholder Design:**
   - Icon: 📷 or camera SVG
   - Background: light gray (#f5f5f5 or #e8e8e8)
   - Size: match thumbnail size (60×60px or 80×80px)
   - Centered text: "No Photo"

3. **CSS for Placeholder:**
   ```css
   .placeholder-photo {
     width: 60px;
     height: 60px;
     background: #f5f5f5;
     display: flex;
     align-items: center;
     justify-content: center;
     border-radius: 4px;
     font-size: 24px;
   }
   ```

4. **Validation:**
   - Item with photo: shows thumbnail
   - Item without photo: shows placeholder icon with gray background
   - No broken image icons or text overflow

---

#### 12. **Inconsistent Category Casing**

**Issue:**
Category values show mixed capitalization: "Other", "Furniture", "Art & Decor", "books", "furniture", "electronics", "Textiles". All categories should render in a consistent case.

**Current State:**
- Database stores categories with inconsistent casing
- Display does not normalize the casing
- Appears unprofessional and confusing

**Impact:**
Visual inconsistency and potential data accuracy issues if users think "furniture" and "Furniture" are different categories.

**Fix Specification:**

1. **Casing Standard (Choose One):**
   - **Option A: Title Case** (Recommended)
     - "Furniture" | "Art & Decor" | "Electronics" | "Books"
     - Professional, readable
   - **Option B: Sentence Case**
     - "Furniture" | "Art & decor" | "Electronics" | "Books"
     - More casual, but still consistent
   - **Option C: UPPERCASE**
     - "FURNITURE" | "ART & DECOR" | "ELECTRONICS" | "BOOKS"
     - Less readable, not recommended

2. **Implementation (Title Case):**
   - Create utility function to normalize categories on display:
     ```jsx
     const formatCategory = (category) => {
       return category
         .split(' ')
         .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
         .join(' ');
     };

     // Usage:
     <span>{formatCategory(item.category)}</span>
     // Input: "furniture" → Output: "Furniture"
     // Input: "art & decor" → Output: "Art & Decor"
     ```

3. **Database Cleanup (Optional, Lower Priority):**
   - Migration script to normalize existing categories in database
   - Future inserts should enforce casing via validation
   - Can be deferred to a separate schema cleanup task

4. **Frontend Enforcement:**
   - When user selects or inputs a category, normalize it:
     ```jsx
     const handleCategoryChange = (value) => {
       const normalized = formatCategory(value);
       setCategory(normalized);
     };
     ```

5. **Validation:**
   - All categories display consistently (all Title Case or all Sentence Case)
   - Category picker enforces casing
   - Editing an item preserves normalized casing

---

## Spec: Sticky Bulk Toolbar Detailed Design

### Positioning & Visibility

**Location:** Sticky positioned at top of item list (below page header, above first item)

**Trigger:** Appears when `selectedCount > 0`

**Dismiss:** When all items deselected or user navigates away

**z-index:** 40 (above page content, below modals and dropdowns)

**CSS:**
```css
.bulk-toolbar {
  position: sticky;
  top: 0;
  z-index: 40;
  background: white;
  border-bottom: 1px solid #e0e0e0;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}
```

### Button/Control Layout

| Element | Position | Action | Primary | Secondary |
|---------|----------|--------|---------|-----------|
| Checkbox | Far left | Toggle select all | — | — |
| Item count badge | Left | Display "X selected" | — | Read-only |
| Hide button | Center-left | Hide all selected | ✓ | Bulk action |
| Show button | Center-left | Show all selected | ✓ | Bulk action |
| Set Price button | Center | Open price modal | ✓ | Bulk action |
| More Actions dropdown | Center-right | Open additional menu | — | Secondary |
| Delete button | Far right | Delete all selected | — | Destructive |

### "More Actions" Dropdown Contents

```
[More Actions ▼]
├── Set Category
├── Manage Tags
├── Manage Photos
└── Manage Status
```

Each option opens the corresponding modal (BulkCategoryModal, BulkTagModal, BulkPhotoModal, BulkStatusModal).

### Responsive Behavior

| Breakpoint | Layout | Changes |
|-----------|--------|---------|
| ≥1024px (desktop) | Full horizontal layout | All buttons visible, labels shown |
| 768–1023px (tablet) | Compressed horizontal | Icons-only for secondary buttons, shortened labels |
| <768px (mobile) | Stacked or compressed | Dropdown for all actions, vertical stack if needed |

### Animations

- **Entrance:** Fade in + slide down (200ms ease-out)
- **Exit:** Fade out + slide up (150ms ease-in)
- **Hover states:** Subtle background color change on buttons (hover #f5f5f5)

### Accessibility

- Checkbox has `aria-label="Select all items"`
- Buttons have `aria-label` descriptions
- Keyboard navigation: Tab through controls, Enter to activate
- Screen reader announces selected count and toolbar presence

---

## Spec: Item Row Redesign

### Column Structure (Final Layout)

| Column | Width | Content | Notes |
|--------|-------|---------|-------|
| Photo | 80px | Item thumbnail or placeholder | Square, left-aligned |
| Checkbox | 40px | Selection checkbox | Enables row selection |
| Title | Flex 1 | Item title | Truncate if >50 chars, ellipsis |
| Category | 100px | Category badge (normalized casing) | Centered, light background |
| Price | 80px | Price or "Not set" | Right-aligned, currency symbol |
| Photos Count | 60px | "0 photos", "2 photos", etc. | Center-aligned |
| Draft Status | 100px | Draft/Pending/Published badge | Centered, color-coded |
| Actions | 150px | Edit, Delete buttons | Right-aligned, grouped |

### Row Structure (HTML/JSX)

```jsx
<tbody>
  {items.map(item => (
    <tr key={item.id} className={`item-row ${selectedIds.includes(item.id) ? 'selected' : ''}`}>
      {/* Photo Column */}
      <td className="photo-cell">
        {item.photos?.[0] ? (
          <img src={item.photos[0].url} alt={item.title} />
        ) : (
          <div className="placeholder-photo">📷</div>
        )}
      </td>

      {/* Checkbox Column */}
      <td className="checkbox-cell">
        <input
          type="checkbox"
          checked={selectedIds.includes(item.id)}
          onChange={(e) => toggleSelection(item.id, e.target.checked)}
        />
      </td>

      {/* Title Column */}
      <td className="title-cell">
        <span title={item.title}>{item.title}</span>
      </td>

      {/* Category Column */}
      <td className="category-cell">
        <span className="badge">{formatCategory(item.category)}</span>
      </td>

      {/* Price Column */}
      <td className="price-cell">
        {item.price ? `$${item.price.toFixed(2)}` : 'Not set'}
      </td>

      {/* Photos Count Column */}
      <td className="photos-count-cell">
        {item.photos?.length || 0} photo{(item.photos?.length || 0) !== 1 ? 's' : ''}
      </td>

      {/* Draft Status Column */}
      <td className="status-cell">
        <span className={`badge badge-${item.draftStatus.toLowerCase()}`}>
          {item.draftStatus}
        </span>
      </td>

      {/* Actions Column */}
      <td className="actions-cell">
        <button onClick={() => openEditPanel(item)}>Edit</button>
        <button onClick={() => confirmDelete(item)} className="btn-danger">Delete</button>
      </td>
    </tr>
  ))}
</tbody>
```

### Row Styling

```css
/* Base row */
.item-row {
  border-bottom: 1px solid #e0e0e0;
  height: 60px;
  line-height: 60px;
}

/* Hover state */
.item-row:hover {
  background-color: #f9f9f9;
}

/* Selected state */
.item-row.selected {
  background-color: #e3f2fd; /* light blue */
}

/* Photo cell */
.photo-cell {
  padding: 8px;
}

.photo-cell img {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
}

.placeholder-photo {
  width: 60px;
  height: 60px;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  font-size: 24px;
}

/* Badges */
.badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.badge-draft {
  background-color: #e0e0e0;
  color: #333;
}

.badge-pending {
  background-color: #ffe0b2;
  color: #d84315;
}

.badge-published {
  background-color: #c8e6c9;
  color: #1b5e20;
}

/* Actions */
.actions-cell button {
  margin: 0 4px;
  padding: 6px 12px;
  font-size: 14px;
}

.btn-danger {
  background-color: #ffcdd2;
  color: #c62828;
}
```

---

## Spec: "More Actions" Dropup Behavior

### Trigger & Detection

```jsx
// In BulkActionDropdown or More Actions button component

const [dropupActive, setDropupActive] = useState(false);

const handleToggleDropdown = (e) => {
  const buttonRect = e.currentTarget.getBoundingClientRect();
  const availableSpace = window.innerHeight - buttonRect.bottom;
  const dropdownHeight = 200; // estimated height of dropdown

  // If not enough space below, open upward
  if (availableSpace < dropdownHeight) {
    setDropupActive(true);
  } else {
    setDropupActive(false);
  }
};
```

### CSS Variants

```css
/* Default: dropdown (opens downward) */
.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 8px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  min-width: 180px;
  z-index: 50;
}

/* Dropup variant (opens upward) */
.dropdown-menu--dropup {
  bottom: 100%;
  top: auto;
  margin-bottom: 8px;
  margin-top: 0;
}
```

### Dropdown Items

```jsx
<div className={`dropdown-menu ${dropupActive ? 'dropdown-menu--dropup' : ''}`}>
  <button onClick={() => openCategoryModal()}>Set Category</button>
  <button onClick={() => openTagsModal()}>Manage Tags</button>
  <button onClick={() => openPhotosModal()}>Manage Photos</button>
  <button onClick={() => openStatusModal()}>Manage Status</button>
</div>
```

### Preferred Alternative: Top Sticky Toolbar

**Note:** If bulk toolbar is moved to sticky top (per spec #4), the dropdown will always have sufficient space below it and dropup logic becomes unnecessary. **Recommended approach:** Fix #4 first; #2 becomes moot.

---

## Spec: Camera Section Collapse

### Trigger Logic

```jsx
const shouldCollapse = itemCount > 0;
```

### Expanded State (itemCount === 0)

- Height: 60–70% viewport height (vh)
- Display: Large camera preview, prominent shutter button, upload area
- Purpose: Primary action for empty sale (encourage adding first item)
- UI:
  ```
  ┌─────────────────────────────────────────┐
  │                                         │
  │              📷 Camera                  │
  │            [Take Photo]                 │
  │                                         │
  └─────────────────────────────────────────┘
  ```

### Collapsed State (itemCount > 0)

- Height: 140px (fixed or max-height)
- Display: Compact button and upload area, no large preview
- Purpose: Secondary action (add more photos to existing items)
- UI:
  ```
  ┌──────────────────────────┐
  │ 📷 Add More Photos       │
  │ [Take Photo] [Upload]    │
  │ or drag files here       │
  └──────────────────────────┘
  ```

### CSS Implementation

```css
.camera-section {
  transition: max-height 0.3s ease-out;
  overflow: hidden;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  margin-bottom: 24px;
}

.camera-section--expanded {
  max-height: 70vh;
}

.camera-section--collapsed {
  max-height: 140px;
}

.camera-section--collapsed .camera-preview {
  display: none;
}

.camera-section--collapsed .camera-controls {
  padding: 12px;
}
```

### React Implementation

```jsx
const [itemCount, setItemCount] = useState(0);

const isCollapsed = itemCount > 0;

return (
  <div className={`camera-section ${isCollapsed ? 'camera-section--collapsed' : 'camera-section--expanded'}`}>
    {!isCollapsed && <CameraPreview />}
    <CameraControls />
  </div>
);
```

### Animation Details

- Transition duration: 300ms (smooth but not sluggish)
- Easing: `ease-out` (natural deceleration)
- No layout shift (use `max-height`, not `height`)

### Validation

- Load with 0 items → camera section is large
- Add first item → section collapses smoothly
- Scroll down → item list is now main focus
- Add more items → camera remains collapsed
- Navigate away and back → collapse state persists (based on itemCount)

---

## Implementation Priority & Effort Estimate

| Priority | Issue | Effort | Dependencies |
|----------|-------|--------|--------------|
| CRITICAL | 1. Checkbox click fix | 2h | Debug DOM, inspect z-index |
| CRITICAL | 2. Dropup logic | 1h | Viewport detection |
| CRITICAL | 3. Select All header | 1.5h | Table restructure |
| HIGH | 4. Sticky toolbar | 3h | Layout, CSS, event handling |
| HIGH | 5. Sale context | 1h | Header redesign |
| HIGH | 6. Draft status badges | 1.5h | Column rename, color palette |
| HIGH | 7. Edit action | 2–3h | Inline panel (use review.tsx reference) |
| HIGH | 8. Photo thumbnails | 1h | Image display, placeholder |
| HIGH | 9. Camera collapse | 1h | CSS media, React state |
| MEDIUM | 10. Wizard persistence | 1h | localStorage or DB flag |
| MEDIUM | 11. Placeholder photos | 0.5h | onError handler |
| MEDIUM | 12. Category casing | 0.5h | Display utility function |

**Total Effort:** ~17–18 hours of dev time
**Recommended Phase:** 2–3 dev days (distributed across 2–3 sessions)

---

## Reference: What Review & Publish Page Does Well

The Review & Publish page serves as the UX reference for the Add Items page. Key design patterns to adopt:

1. **Sale Context Header:** "16 items in this sale. 16 unpublished."
2. **Progress Bar & Feedback:** "You're 3 items away from a fully photo'd & priced listing!"
3. **Photo Thumbnails:** Per-item thumbnail for visual identification
4. **Draft Status Badges:** Color-coded, clear meaning (Draft/Pending/Published)
5. **Inline Edit Panel:** Expandable row with full editing UI
6. **Big Primary CTA:** "Publish All" button prominently positioned at top
7. **Buyer Preview Link:** "Preview as Buyer" for context

---

## Signoff & Next Steps

**Spec Status:** Ready for developer implementation

**Developer Handoff:**
- All issues are UI/layout only — no schema, API, or business logic changes
- Photos and metadata are already available in the component's data structure
- Modals and components from Review & Publish page can be reused (see #7 reference)

**QA Checkpoints:**
- After fix #3 (Select All): verify all rows select/deselect correctly
- After fix #4 (Sticky toolbar): verify toolbar scrolls with page, buttons are clickable
- After fix #1 (Checkbox clicks): verify no workarounds needed to select items
- Final: open page with 50+ items, verify usability across all critical flows

**Not Included in Scope:**
- Schema or backend API changes
- New component libraries or dependencies
- Buyer-facing changes
- Mobile-specific redesign (responsive hints provided)

---

**Spec Created:** 2026-03-15
**Prepared by:** FindA.Sale UX & Product
**For:** findasale-dev dispatch (Session 174+)
