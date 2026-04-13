# Feature #65: Progressive Disclosure UI — Organizer Mode Tiers

**Status:** Specification Ready
**Linked Issues:** #65 (Organizer Mode Tiers), UX Audit (2026-03-18)
**Author:** FindA.Sale Architecture
**Date:** 2026-03-19

---

## 1. Problem Statement

### Current State (Pre-Progressive Disclosure)

The FindA.Sale organizer dashboard presents **all features** regardless of subscription tier, creating severe navigation overload:

| Tier | Current Nav Count | Industry Max | Overload Factor |
|------|-------------------|--------------|-----------------|
| SIMPLE | 10 primary links | 5–7 | 1.4–2x |
| PRO | 14 primary links | 5–7 | 2–2.8x |
| TEAMS | 15 primary links | 5–7 | 2.1–3x |

Additionally, on the organizer dashboard (Layout.tsx, dashboard.tsx):
- **18 quick-action buttons** in a single flexbox wrap
- No visual grouping or tier indicators
- PRO/TEAMS features mixed linearly with SIMPLE features
- Duplicate "Dashboard" link (drawer + right-nav)
- No upgrade CTAs for locked features

**UX Impact:**
- SIMPLE organizers see PRO/TEAMS features without understanding they require upgrade
- No mental model for tier-based feature access
- Mobile dashboard: 10+ rows of buttons before seeing core metrics
- Cognitive overload drives drop-off at organizer onboarding stage

---

## 2. Proposed Solution: Progressive Disclosure

**Core Principle:** Show only features the organizer can currently use. Locked features appear with:
- Dimmed appearance (opacity: 0.5 or grayscale)
- Lock icon (🔒)
- "Upgrade to PRO" tooltip (tier-specific)

**Implementation Strategy:**
1. **Frontend:** Wrap nav items with `useOrganizerTier()` hook
2. **UI Behavior:** Conditional rendering + visual lock indicators
3. **Upgrade Path:** One-click "Upgrade" CTA on locked features
4. **Dashboard:** Reorganize 18 buttons into collapsible sections by tier

**Benefits:**
- SIMPLE organizers see 5–6 core items (vs. 10 today)
- Clear upgrade path visible when accessing features they don't have
- Reduced cognitive load on mobile
- Better onboarding experience

---

## 3. Tier Feature Matrix

### Reference: SubscriptionTier Enum (schema.prisma)
```prisma
enum SubscriptionTier {
  SIMPLE
  PRO
  TEAMS
}
```

All organizers share the SIMPLE tier. PRO and TEAMS unlock additional features via Stripe billing.

### Navigation Features by Tier

#### SIMPLE Tier (All Organizers)

**Primary Nav (5 items):**
1. Dashboard
2. Plan a Sale
3. Premium Plans (CTA to upgrade)
4. Manage Sales (grouped: Add Items, Print Inventory, Holds)
5. Organizer Tools (collapsible section)

**Organizer Tools (Collapsible, always visible, 5 items):**
- Bounties
- Message Templates
- Reputation
- Performance
- Neighborhoods

**Desktop right-nav (simple organizer):**
```
Dashboard
Manage Sales
Premium Plans  ← CTA

─ Organizer Tools (collapse/expand on hover)
  • Bounties
  • Message Templates
  • Reputation
  • Performance
  • Neighborhoods
```

---

#### PRO Tier (Subscription required)

**Primary Nav (7 items):**
1. Dashboard
2. Manage Sales
3. Insights (PRO feature, prominent)
4. Premium Plans (if upgrading to TEAMS)
5. Command Center (PRO)
6. Organizer Tools (collapsible)
7. Advanced Tools (collapsible)

**Pro Tools (Collapsible, 5 items):**
- Command Center
- Typology Classifier
- Fraud Signals
- Offline Mode
- Appraisals

**Advanced Tools (Collapsible, 4 items):**
- Brand Kit
- Item Library
- Flip Report
- Export Data

**Desktop right-nav (PRO organizer):**
```
Dashboard
Manage Sales
Insights  ← PRO feature, prominent

─ Pro Tools (collapse/expand on hover)
  • Command Center
  • Typology Classifier
  • Fraud Signals
  • Offline Mode
  • Appraisals

─ Advanced Tools (collapse/expand)
  • Brand Kit
  • Item Library
  • Flip Report
  • Export Data
```

---

#### TEAMS Tier (Subscription required)

**Primary Nav (8 items):**
1. Dashboard
2. Manage Sales
3. Insights
4. Workspace (TEAMS-only feature, prominent)
5. Pro Tools (collapsible, same as PRO)
6. Advanced Tools (collapsible, same as PRO)
7. Team Administration (TEAMS-only, collapsible)

**Team Administration (Collapsible, TEAMS-only, 3 items):**
- Member Roles & Permissions
- Webhook Management
- Audit Logs

**Desktop right-nav (TEAMS organizer):**
```
Dashboard
Manage Sales
Insights
Workspace  ← TEAMS feature

─ Pro Tools (collapse/expand)
  [same as PRO]

─ Advanced Tools (collapse/expand)
  [same as PRO]

─ Team Administration (collapse/expand)
  • Member Roles & Permissions
  • Webhook Management
  • Audit Logs
```

---

### Dashboard Quick-Links by Tier

#### Current State (All Tiers, 18 buttons)
```
1. Create New Sale
2. Listing Factory
3. Add Items
4. Insights (PRO)
5. Print Inventory
6. Webhooks (TEAMS)
7. POS
8. Brand Kit (PRO)
9. Item Library (PRO)
10. Flip Report (PRO)
11. Holds (with badge)
12. Export Data (PRO)
13. Bounties
14. Message Templates
15. Reputation
16. Neighborhoods
17. Performance
18. (Plus variations)
```

#### Proposed Restructure: Collapsible Sections by Tier

**SIMPLE Organizer:**
```
Quick Actions (always visible, 4 buttons):
  ├─ Create New Sale
  ├─ Add Items
  ├─ Holds (with badge)
  └─ Manage Active Sales

Essential Tools (always visible, 3 buttons):
  ├─ Print Inventory
  ├─ POS
  └─ Message Templates

Community & Growth (collapse by default, 4 buttons):
  ├─ Bounties
  ├─ Reputation
  ├─ Neighborhoods
  └─ Performance

Tier-Based Features (collapsed, shows 1 summary line):
  └─ "🔒 Unlock Pro Features (Insights, Command Center, Brand Kit, ...)"
     [Upgrade Button]
```

**PRO Organizer:**
```
Quick Actions (always visible, 4 buttons):
  ├─ Create New Sale
  ├─ Add Items
  ├─ Holds
  └─ Manage Active Sales

Insights & Analytics (always visible, 1 button):
  └─ Insights

Essential Tools (always visible, 3 buttons):
  ├─ Print Inventory
  ├─ POS
  └─ Message Templates

Pro Tools (collapse on mobile, 5 buttons):
  ├─ Command Center
  ├─ Typology Classifier
  ├─ Fraud Signals
  ├─ Offline Mode
  └─ Appraisals

Advanced Tools (collapse by default, 4 buttons):
  ├─ Brand Kit
  ├─ Item Library
  ├─ Flip Report
  └─ Export Data

Community & Growth (collapse by default, 4 buttons):
  ├─ Bounties
  ├─ Reputation
  ├─ Neighborhoods
  └─ Performance
```

**TEAMS Organizer:**
```
Quick Actions (always visible, 4 buttons):
  [same as PRO]

Insights & Analytics (always visible, 1 button):
  [same as PRO]

Workspace (always visible, 1 button):
  └─ Workspace

[All other sections same as PRO]

Team Administration (visible, 3 buttons):
  ├─ Member Roles & Permissions
  ├─ Webhook Management
  └─ Audit Logs
```

---

## 4. UI Behavior Specification

### Locked Feature Appearance

**Visual Indicators:**
- **Icon:** Lock emoji (🔒) or lock SVG icon
- **Opacity:** 50% (dimmed appearance)
- **Cursor:** `cursor-not-allowed`
- **Color:** Text remains warm-900 but reduced opacity
- **Hover tooltip:** "Upgrade to PRO to unlock [Feature Name]"

**Example HTML structure (tier-gated nav link):**
```jsx
{!canAccess('PRO') ? (
  <div
    className="block px-3 py-2 text-warm-900 opacity-50 cursor-not-allowed"
    title="Upgrade to PRO to unlock Command Center"
  >
    🔒 Command Center
  </div>
) : (
  <Link href="/organizer/command-center" className="block px-3 py-2 text-warm-900 hover:text-amber-600 hover:bg-warm-100 rounded-md">
    Command Center
  </Link>
)}
```

### Section Headers & Grouping

**Desktop (right-side nav):**
- Group headers as `<span>` elements with styling: `px-3 py-2 text-xs font-semibold uppercase text-warm-500 mt-3`
- Collapsible sections with `<summary>` + `<details>` or custom toggle
- Sections default to expanded for PRO/TEAMS, collapsed for SIMPLE

**Mobile (drawer):**
- Same headers as desktop
- All sections default to collapsed to reduce vertical space
- Tap header to expand/collapse

**Example:**
```jsx
<span className="block px-3 py-2 text-xs font-semibold uppercase text-warm-500 mt-3">
  Pro Tools
</span>
<Link href="/organizer/command-center" className="block px-3 py-2 ...">
  Command Center
</Link>
```

### Upgrade CTAs

**Location 1: "Premium Plans" Nav Link**
- **Current state:** Labeled "Premium Plans" for all tiers
- **Proposed change:** Show as "Upgrade to PRO" for SIMPLE (if not already PRO)
- **Color:** Green (positive action) instead of warm-900
- **Click target:** Routes to `/organizer/premium` with `?upgrade=PRO` param

**Location 2: Locked Feature Tooltip**
- **Trigger:** Hover over dimmed feature
- **Tooltip text:** "Upgrade to PRO to unlock [Feature Name]"
- **Tooltip contains:** "Upgrade" button link (routes to `/organizer/premium?feature=[name]&tier=PRO`)

**Location 3: Dashboard "Tier-Based Features" Placeholder (SIMPLE only)**
- **Text:** "🔒 Unlock Pro Features — Get Insights, Command Center, Brand Kit, and more"
- **Button:** "Upgrade to PRO" (prominent green button)
- **Target:** `/organizer/premium?source=dashboard`

---

## 5. Implementation Approach

### Frontend Changes

#### 5.1 Tier-Gating Hook (Already exists: `useOrganizerTier.ts`)

The hook provides:
```typescript
const { tier, canAccess, isSimple, isPro, isTeams } = useOrganizerTier();

// Usage:
if (canAccess('PRO')) {
  // Show PRO feature
}
```

**No changes required** — this hook is complete and functional.

#### 5.2 Progressive Disclosure Wrapper Component

Create a new component: `TierGatedNav.tsx`

```typescript
import React from 'react';
import { useOrganizerTier } from '../hooks/useOrganizerTier';
import Link from 'next/link';

interface TierGatedNavLinkProps {
  href: string;
  label: string;
  requiredTier: 'SIMPLE' | 'PRO' | 'TEAMS';
  icon?: string; // emoji or icon SVG
}

export function TierGatedNavLink({
  href,
  label,
  requiredTier,
  icon = '→',
}: TierGatedNavLinkProps) {
  const { tier, canAccess } = useOrganizerTier();
  const isLocked = !canAccess(requiredTier);

  if (isLocked) {
    return (
      <div
        className="block px-3 py-2 text-warm-900 opacity-50 cursor-not-allowed"
        title={`Upgrade to ${requiredTier} to unlock ${label}`}
      >
        🔒 {icon} {label}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="block px-3 py-2 text-warm-900 hover:text-amber-600 hover:bg-warm-100 rounded-md"
    >
      {icon} {label}
    </Link>
  );
}
```

#### 5.3 Reorganize Layout.tsx Navigation

**File:** `packages/frontend/components/Layout.tsx`

**Changes:**
1. Wrap PRO-gated links (Command Center, Typology, Fraud Signals, Offline, Appraisals) with `TierGatedNavLink` component
2. Add section headers using `<span>` elements
3. Replace duplicate Dashboard links (lines 76, 260) — keep only drawer instance
4. Group nav items by tier (SIMPLE, PRO, TEAMS)
5. Make sections collapsible on mobile

**Pseudo-code:**
```jsx
{user?.role === 'ORGANIZER' && (
  <>
    {/* Primary: Dashboard */}
    <Link href="/organizer/dashboard" className="...">
      Dashboard
    </Link>

    {/* Primary: Manage Sales (grouped feature) */}
    <Link href="/organizer/sales" className="...">
      Manage Sales
    </Link>

    {/* Primary: Premium Plans / Upgrade CTA */}
    {canAccess('TEAMS') ? null : (
      <Link href="/organizer/premium" className="bg-green-500 ...">
        {canAccess('PRO') ? 'Upgrade to TEAMS' : 'Upgrade to PRO'}
      </Link>
    )}

    {/* Section: Pro Tools (collapsible) */}
    {isPro && (
      <>
        <span className="text-xs font-semibold uppercase text-warm-500 mt-3">
          Pro Tools
        </span>
        <TierGatedNavLink href="/organizer/command-center" label="Command Center" requiredTier="PRO" />
        <TierGatedNavLink href="/organizer/typology" label="Typology Classifier" requiredTier="PRO" />
        {/* ... more PRO features ... */}
      </>
    )}

    {/* Section: Organizer Tools (always visible, collapsible) */}
    <span className="text-xs font-semibold uppercase text-warm-500 mt-3">
      Organizer Tools
    </span>
    <Link href="/organizer/bounties" className="...">Bounties</Link>
    {/* ... more tools ... */}
  </>
)}
```

#### 5.4 Reorganize Dashboard.tsx Quick-Links

**File:** `packages/frontend/pages/organizer/dashboard.tsx`

**Changes:**
1. Replace 18-button flex wrap with 3 collapsible sections
2. Use `<details>/<summary>` or custom `<Collapsible>` component
3. Apply tier-gating to PRO/TEAMS buttons
4. On mobile: collapse secondary sections by default

**Pseudo-code:**
```jsx
<div className="space-y-4">
  {/* Quick Actions: always visible */}
  <div className="flex flex-wrap gap-4">
    <button>📝 Create New Sale</button>
    <button>📦 Add Items</button>
    <button>🔐 Holds {holdCount > 0 && <badge>{holdCount}</badge>}</button>
  </div>

  {/* Pro Features: collapsible */}
  <details open={isPro}>
    <summary className="text-sm font-semibold">
      Insights & Pro Tools (PRO)
    </summary>
    <div className="flex flex-wrap gap-4 mt-2">
      <TierGatedButton label="Insights" requiredTier="PRO" />
      <TierGatedButton label="Command Center" requiredTier="PRO" />
      {/* ... more PRO buttons ... */}
    </div>
  </details>

  {/* Community: collapsible */}
  <details>
    <summary className="text-sm font-semibold">
      Community & Growth
    </summary>
    <div className="flex flex-wrap gap-4 mt-2">
      <button>🏆 Bounties</button>
      {/* ... community buttons ... */}
    </div>
  </details>

  {/* If SIMPLE: show upgrade CTA */}
  {isSimple && (
    <div className="p-4 bg-blue-50 border border-blue-200 rounded">
      <p className="text-sm font-semibold">🔒 Unlock Pro Features</p>
      <a href="/organizer/premium?source=dashboard" className="btn-primary mt-2">
        Upgrade to PRO
      </a>
    </div>
  )}
</div>
```

#### 5.5 Mobile-Specific Behavior

On mobile (< 768px):
- Collapse "Pro Tools" and "Advanced Tools" sections by default
- Keep "Quick Actions" always expanded
- Reduce button size to `btn-sm` for faster visual scanning
- Stack sections vertically with clear headers

---

### Backend Changes (Minimal)

**No backend changes required.** Tier gating is already implemented via:
- `useOrganizerTier()` hook (frontend)
- `canAccess()` method (frontend)
- `/organizer/tiers.ts` route (backend — already exists)

The only validation needed is at the **API boundary** — when a SIMPLE organizer tries to access `/api/organizer/insights` (PRO-only), the backend should return 403 Forbidden. This is handled by `tierGate` middleware (if present) or can be added during feature implementation.

---

## 6. Success Criteria

### Navigation Density Reduction

| Tier | Current Count | Target Count | Target Met |
|------|---------------|--------------|-----------|
| SIMPLE | 10 items | ≤6 primary | ✓ |
| PRO | 14 items | ≤10 primary | ✓ |
| TEAMS | 15 items | ≤12 primary | ✓ |

**Metric:** Count primary (non-collapsed) nav items after implementation.

### Dashboard Density Reduction

| Device | Current Rows | Target Rows | Target Met |
|--------|--------------|-------------|-----------|
| Mobile | 9–10 rows of buttons | ≤4 rows | ✓ |
| Desktop | 4–5 rows, wrapping | 2–3 rows, clear grouping | ✓ |

**Metric:** Rows of buttons visible before "Active Sales" section.

### Feature Discoverability

- ✓ PRO features labeled with "(PRO)" badge in nav
- ✓ Locked features show lock icon + tooltip on hover
- ✓ Upgrade CTA visible on 3+ locations (Premium Plans nav, locked feature tooltips, dashboard placeholder)
- ✓ Clicking "Upgrade" routes to `/organizer/premium` with feature context

**Metric:** UX testing — SIMPLE organizer can identify at least 2 PRO features and understand how to unlock them.

### Mobile Experience

- ✓ Mobile organizer sees ≤4 quick-action buttons on initial dashboard view
- ✓ Remaining buttons accessible via collapsible "More Tools" section
- ✓ Mobile drawer nav is scannable (section headers present, <8 top-level items)
- ✓ Scroll-to-content reduced by 50% on mobile

**Metric:** Page-scroll measurement — distance to "Active Sales" metric.

### Accessibility (WCAG 2.1 AA)

- ✓ Tier-gated nav links have `title` attribute (hover tooltip)
- ✓ Collapsed sections use `<details>/<summary>` for keyboard navigation
- ✓ No emoji in button labels — use icons with `aria-label`
- ✓ Screenreader announces "(PRO feature)" for tier-gated items

**Metric:** axe-core audit with 0 critical/high violations.

---

## 7. Risk & Mitigation

### Risk 1: Organizer Confusion on Tier Boundaries

**Problem:** Organizer might not understand which tier they're on or which features require upgrade.

**Mitigation:**
- Add persistent "Tier Badge" in dashboard header: "You are on the SIMPLE plan"
- Show tier details on `/organizer/premium` with clear feature comparison table
- Send email on account creation: "Welcome to FindA.Sale SIMPLE — here's what you can do..."

### Risk 2: Mobile Scrolling Regression

**Problem:** Collapsible sections might create "accordion hell" — organizers need to expand multiple sections to find a feature.

**Mitigation:**
- Test with 5–10 organizers on mobile
- Measure scroll-to-content time
- If scroll increases >20%, add a "Quick Access" search bar above nav sections

### Risk 3: Breaking Existing Links

**Problem:** If nav structure changes, organizers with bookmarks to old routes may break.

**Mitigation:**
- All internal routing uses `/organizer/[feature]` structure — no IDs or positional indices
- Verify no hardcoded nav links in email templates or marketing pages
- Check analytics for any external links to old paths

### Risk 4: A/B Testing Sensitivity

**Problem:** Changing nav layout could confuse organizers accustomed to the old structure.

**Mitigation:**
- Roll out to 10% of organizers first (canary deployment)
- Monitor dashboard abandonment rate (should NOT increase)
- Collect feedback via in-app survey: "Did the new dashboard help or hinder?"
- If abandonment increases >5%, pause rollout and investigate

---

## 8. Rollout & Testing Plan

### Phase 1: Feature Flag (Week 1)

- Create feature flag: `PROGRESSIVE_DISCLOSURE_UI`
- Wrap new navigation structure in conditional
- Test with 5 internal organizers (FindA.Sale team members)
- Verify no CSS regressions, accessibility, mobile responsiveness

### Phase 2: Canary Deployment (Week 2)

- Enable flag for 10% of organizers (traffic-based)
- Monitor metrics:
  - Nav click-through rate (should increase for PRO features)
  - Dashboard abandonment (should NOT increase)
  - Page load time (should NOT increase)
- Collect feedback via in-app prompt

### Phase 3: Full Rollout (Week 3–4)

- If Phase 2 metrics are positive, enable for 100% of organizers
- Announce in product changelog: "Progressive Disclosure UI — cleaner, faster navigation"
- Update help docs: "Your organizer dashboard is now organized by tier"

---

## 9. Files & Components to Modify

### Frontend

| File | Changes | Effort |
|------|---------|--------|
| `packages/frontend/components/Layout.tsx` | Reorder nav, add grouping headers, wrap PRO features with TierGatedNavLink, remove duplicate Dashboard link | Medium |
| `packages/frontend/components/TierGatedNav.tsx` | **NEW** — TierGatedNavLink component | Low |
| `packages/frontend/pages/organizer/dashboard.tsx` | Reorganize 18 buttons into 3 sections (Quick Actions, Pro Tools, Community), add collapsible logic, add mobile detection | High |
| `packages/frontend/components/DashboardSection.tsx` | **NEW** — Collapsible section component with aria-label | Medium |
| `packages/frontend/styles/globals.css` | Add `.tier-locked` and `.collapsible-section` utility classes (optional, if not using Tailwind) | Low |

### Backend

| File | Changes | Effort |
|------|---------|--------|
| `packages/backend/src/routes/tiers.ts` | Verify `/api/organizer/tiers` endpoint returns current tier (should already exist) | None |
| `packages/backend/src/middleware/tierGate.ts` | Verify middleware exists and blocks SIMPLE from PRO-only routes — add if missing | None |

### Documentation

| File | Changes |
|------|---------|
| `claude_docs/features/65-progressive-disclosure.md` | **THIS FILE** — Feature spec (COMPLETE) |
| `claude_docs/features/README.md` | Add reference to #65 |
| `CHANGELOG.md` | Add entry: "Progressive Disclosure UI launched — nav now organizes by tier" (at rollout) |

---

## 10. Technical Debt & Follow-ups

### Post-Launch Improvements

1. **Search Nav Feature** (P2)
   - Add a search bar to "Pro Tools" / "Advanced Tools" sections
   - Organizers can search for features: "Where is Command Center?" → highlights in nav

2. **Tier Progress Widget** (P1)
   - Show "2/5 sales to unlock Silver" for reward tiers (different from subscription tiers)
   - Add on dashboard sidebar or modal

3. **Onboarding Flow Update** (P1)
   - Update organizer onboarding to show tier benefits
   - "You start as SIMPLE. Here's what you can do now. Want to upgrade?" — with comparison table

4. **Email Notification** (P2)
   - Send "Welcome to SIMPLE" email on organizer signup
   - Highlight top 3 PRO features with "Upgrade to unlock"

---

## 11. Appendix: Component Examples

### Example: TierGatedButton (Dashboard)

```jsx
import React from 'react';
import Link from 'next/link';
import { useOrganizerTier } from '../hooks/useOrganizerTier';

interface TierGatedButtonProps {
  href: string;
  label: string;
  icon: string; // emoji or SVG icon
  requiredTier: 'SIMPLE' | 'PRO' | 'TEAMS';
}

export function TierGatedButton({
  href,
  label,
  icon,
  requiredTier,
}: TierGatedButtonProps) {
  const { canAccess } = useOrganizerTier();
  const isLocked = !canAccess(requiredTier);

  const baseClasses = 'flex flex-col items-center gap-2 px-4 py-3 rounded-md transition-all';
  const enabledClasses = 'bg-warm-50 hover:bg-warm-100 text-warm-900 cursor-pointer';
  const disabledClasses = 'bg-gray-50 opacity-50 cursor-not-allowed text-gray-600';

  const classes = `${baseClasses} ${isLocked ? disabledClasses : enabledClasses}`;

  if (isLocked) {
    return (
      <button
        disabled
        className={classes}
        title={`Upgrade to ${requiredTier} to unlock ${label}`}
      >
        <span className="text-xl">🔒 {icon}</span>
        <span className="text-xs font-medium text-center">{label}</span>
      </button>
    );
  }

  return (
    <Link href={href} className={classes}>
      <span className="text-xl">{icon}</span>
      <span className="text-xs font-medium text-center">{label}</span>
    </Link>
  );
}
```

### Example: Collapsible Section (Mobile)

```jsx
import React, { useState } from 'react';

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string; // e.g., "PRO" or "TEAMS"
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  badge,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <details open={isOpen} onToggle={(e) => setIsOpen(e.currentTarget.open)}>
      <summary className="flex items-center gap-2 px-3 py-2 text-sm font-semibold uppercase text-warm-600 cursor-pointer hover:bg-warm-100 rounded">
        {isOpen ? '▼' : '▶'} {title}
        {badge && <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">{badge}</span>}
      </summary>
      <div className="px-3 py-2 space-y-1">
        {children}
      </div>
    </details>
  );
}
```

---

## 12. Related Issues & References

- **#55** — Seasonal Discovery Challenges (unrelated, but uses gamification UI patterns)
- **#63** — Dark Mode (ensure tier-gated styling works in both light/dark modes)
- **#69** — Local-First Offline Mode (PRO feature, respect progressive disclosure)
- **UX Audit (2026-03-18)** — Nav Overload Analysis (source of requirements for this spec)

---

## Specification Acceptance Checklist

- ✓ Problem statement clear (nav overload, 10–15 items vs. best practice 5–7)
- ✓ Solution proposed (progressive disclosure with tier-gating)
- ✓ Tier matrix complete (SIMPLE, PRO, TEAMS — all features listed)
- ✓ UI behavior specified (locked features show lock icon + tooltip)
- ✓ Implementation approach detailed (frontend components, hook usage, backend validation)
- ✓ Success criteria measurable (nav item counts, dashboard row counts, mobile scrolling)
- ✓ Risk & mitigation identified (organizer confusion, mobile scrolling, A/B testing)
- ✓ Rollout plan provided (canary deployment, monitoring, phased rollout)
- ✓ Files & components listed (Layout.tsx, TierGatedNav.tsx, dashboard.tsx, etc.)
- ✓ Component examples included (TierGatedButton, CollapsibleSection)

**Status: READY FOR IMPLEMENTATION**

Dispatch to `findasale-dev` with this spec and the UX audit as reference documents.

---

**Author:** FindA.Sale Architect
**Created:** 2026-03-19
**Last Updated:** 2026-03-19
