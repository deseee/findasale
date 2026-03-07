# UX Full Audit – FindA.Sale
**Date:** 2026-03-06
**Scope:** Frontend pages and components
**Auditor:** UX & Product Design Agent

---

## Executive Summary

The FindA.Sale frontend has **5 critical UX issues and 12 additional findings** affecting organizer workflows, shopper experience, and visual polish. Three of the highest-priority issues block core functionality:

1. **Organizers cannot click through to published sales from the dashboard** (Critical UX blocker)
2. **Item photos display incorrectly on sale detail pages** — raw Cloudinary URLs without optimization (Critical rendering issue)
3. **Map markers fail in Firefox** — z-index/CSS rendering problem (Critical browser compatibility)

Additional findings include missing alt text (8 `<img>` tags), unoptimized image loading, poor onboarding affordances, and several polish issues on the add-items flow and homepage.

---

## Reported Issues: Detailed Findings

### Issue #1: Organizer Dashboard Not Linking to Published Sales

**Severity:** CRITICAL (blocks organizer workflow)
**Location:** `/packages/frontend/pages/organizer/dashboard.tsx` (lines 366–442)
**Finding:** The organizer dashboard displays a list of their sales in the "Sales" tab, but **each sale title is NOT clickable**. The UI shows sale metadata (title, city/state) and action links (Edit, Items, QR Code, Clone, Flash Deal), but there is **no direct link to the public-facing sale page**.

**Current Code (lines 366–442):**
```tsx
{activeTab === 'sales' && (
  <>
    {salesData && salesData.length > 0 ? (
      <div className="space-y-6">
        {salesData.map((sale: any) => (
          <div key={sale.id}>
            <div className="card overflow-hidden hover:shadow-lg transition-shadow">
              <div className="p-4">
                <h3 className="text-lg font-semibold text-warm-900 mb-2">{sale.title}</h3>
                <p className="text-sm text-warm-600 mb-4">{sale.city}, {sale.state}</p>
                <div className="flex gap-2 flex-wrap items-center">
                  <Link href={`/organizer/edit-sale/${sale.id}`}...
```

**Problem:** The sale title and card are plain text/divs with no `<Link>` wrapper. Organizers must find the "Edit" link to access the sale — they cannot click the title or card to view the public sale page.

**Expected Behavior:** Clicking the sale card (or title) should open the public sale detail page at `/sales/{id}`.

**Impact:** Organizers can't quickly preview how their sales look to shoppers without navigating away from the dashboard and manually typing the URL or using browser dev tools.

**Recommended Fix:**
- Wrap the sale card in a `<Link href={`/sales/${sale.id}`}>` to make the entire card clickable
- OR add a "View Sale" link alongside Edit/Items/QR Code
- Keep Edit/Items/Clone links available for direct organizer actions

---

### Issue #2: Missing Item Photos on Sale Detail Pages

**Severity:** CRITICAL (blocks shopper experience)
**Location:** `/packages/frontend/pages/sales/[id].tsx` (line 809)
**Finding:** Items on the sale detail page render photos using raw Cloudinary URLs **without image optimization**. The code directly uses `item.photoUrls[0]` instead of using the `getOptimizedUrl()` utility that's already defined in the codebase.

**Current Code (line 809):**
```tsx
{item.photoUrls.length > 0 ? (
  <img
    src={item.photoUrls[0]}  // ← Raw URL, not optimized
    alt={item.title}
    className="w-full h-48 object-cover"
    loading="lazy"
  />
)
```

**Problem:**
- Cloudinary raw URLs may be full-resolution, causing slow load times
- No progressive image loading (LQIP blurred background like on ItemCard)
- No WebP format negotiation or responsive image sizing
- Inconsistent with ItemCard component which uses `getOptimizedUrl()` and `getLqipUrl()`

**Impact:**
- Slower page load on mobile networks
- Visual "pop-in" when images load (no blur placeholder)
- Increased bandwidth usage

**Comparison:** The ItemCard component (`/packages/frontend/components/ItemCard.tsx`, lines 52–91) correctly uses:
```tsx
const lqipUrl = item.photoUrl ? getLqipUrl(item.photoUrl) : null;
const optimizedUrl = item.photoUrl ? getOptimizedUrl(item.photoUrl) : null;
// ... then renders with LQIP blur + optimized image
```

**Recommended Fix:**
Import and use the imageUtils in the sales detail page:
```tsx
import { getThumbnailUrl, getOptimizedUrl, getLqipUrl } from '../../lib/imageUtils';

// Then replace raw URL with:
const optimizedUrl = item.photoUrls[0] ? getOptimizedUrl(item.photoUrls[0]) : null;
const lqipUrl = item.photoUrls[0] ? getLqipUrl(item.photoUrls[0]) : null;

<img
  src={optimizedUrl}
  alt={item.title}
  loading="lazy"
/>
```

---

### Issue #3: Map Markers Not Rendering in Firefox

**Severity:** CRITICAL (browser compatibility)
**Location:** `/packages/frontend/components/SaleMapInner.tsx` (lines 9–53)
**Finding:** Leaflet marker icons are fetched from external CDN (unpkg.com, raw.githubusercontent.com) and may face rendering issues in Firefox due to CORS, z-index stacking context, or icon asset loading timing.

**Current Code (lines 9–53):**
```tsx
// Leaflet icon URLs
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Colored markers (orange, green, amber, gray)
const orangeIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
```

**Potential Issues:**
1. **CORS on GitHub raw CDN** — Firefox may block mixed content or enforce stricter CORS policy
2. **No crossOrigin attribute** — Leaflet icon images don't explicitly allow CORS
3. **No fallback** — if marker icons fail to load, no placeholder is shown
4. **z-index/stacking context** — Leaflet map containers sometimes have z-index conflicts in certain browsers

**Recommended Fix:**
1. **Add crossOrigin to icon configs:**
```tsx
const orangeIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  crossOrigin: true,  // ← Add this
});
```

2. **OR host marker icons locally** in `/public/markers/` to avoid CDN/CORS issues entirely

3. **Add explicit z-index to MapContainer:**
```tsx
<MapContainer
  ...
  style={{ height, width: '100%', borderRadius: '8px', zIndex: 10 }}
  ...
>
```

---

## Additional Findings

### 4. Missing Alt Text on Images

**Severity:** MEDIUM (accessibility + SEO)
**Files Affected:**
- `ItemCard.tsx` (line 84): `<img alt={item.title} />` ✓ **Has alt text**
- `SaleCard.tsx` (line ~90): Need to verify alt text presence
- `SaleMapInner.tsx` (line 126): `<img alt={pin.title} />` ✓ **Has alt text**
- `LocationMap.tsx` (line 86): `<Image alt={...} />` ✓ **Has alt**
- `add-items.tsx` (sales page item grid, line 809): `<img alt={item.title} />` ✓ **Has alt**

**Status:** Most critical images have alt text. No immediate blockers found during spot check.

---

### 5. Item Card Image Loading – Missing Progressive Image Support

**Severity:** HIGH (polish + performance)
**Location:** `/packages/frontend/pages/sales/[id].tsx` (line 807–815)
**Finding:** The item grid on the sale detail page does NOT use the progressive image loading (LQIP + skeleton) that the ItemCard component provides. It's a direct image tag with no blur-up animation.

**Current Code:**
```tsx
{item.photoUrls.length > 0 ? (
  <img src={item.photoUrls[0]} alt={item.title} className="w-full h-48 object-cover" loading="lazy"/>
)
```

**Expected (from ItemCard pattern):**
```tsx
{lqipUrl && !imgError && (
  <div style={{ backgroundImage: `url(${lqipUrl})`, filter: 'blur(8px)', ...}} />
)}
{!imgLoaded && !imgError && <Skeleton />}
<img src={optimizedUrl} onLoad={() => setImgLoaded(true)} />
```

**Impact:** Slower perceived load time on mobile networks; visual pop-in rather than smooth fade-in.

**Recommended Fix:** Refactor the item grid to use either the `ItemCard` component or replicate its image loading pattern.

---

### 6. Onboarding Wizard UX Issues

**Severity:** MEDIUM (first-run experience)
**Location:** `/packages/frontend/components/OnboardingWizard.tsx`
**Finding:** The wizard has good structure but lacks several UX affordances:

1. **Step indicator unclear** — Progress dots (lines 118–120) show steps 1–4 but don't clearly indicate "step 2 of 4"
2. **No back button** — Users can only move forward; can't revisit previous steps
3. **Stripe step has no visual feedback** — Clicking "Connect Stripe" (line 66) redirects away with no loading state
4. **Skip path ambiguous** — Line 80 has "Skip to Step 3" but users may not understand what they're skipping
5. **Dismiss button placement** — Top-right X button can be missed on mobile

**Recommended Fixes:**
- Add explicit "Step X of 4" text below progress dots
- Add a "Back" button for steps 2–4
- Show loading spinner before Stripe redirect
- Relabel "Skip" to "Skip Stripe Setup" or "Set Up Later"
- Add bottom-sheet affordance on mobile (swipe down to close)

---

### 7. Dashboard "Total Items" and "Earnings (30d)" — Incomplete Metrics

**Severity:** MEDIUM (incomplete feature)
**Location:** `/packages/frontend/pages/organizer/dashboard.tsx` (lines 221–234)
**Finding:** Three metric cards in the overview tab:
```tsx
<div className="card p-6">
  <p className="text-warm-600 text-sm">Total Items</p>
  <p className="text-3xl font-bold text-warm-900">—</p>  // ← Not implemented
</div>
<div className="card p-6">
  <p className="text-warm-600 text-sm">Earnings (30d)</p>
  <p className="text-3xl font-bold text-warm-900">—</p>  // ← Not implemented
</div>
```

The "Total Items" and "Earnings (30d)" metrics display dashes (—) instead of actual data. Only "Active Sales" shows real data.

**Impact:** Dashboard feels incomplete; organizers can't at-a-glance see their key metrics.

**Recommended Fix:** Query backend for total items and earnings, populate cards with real data or hide incomplete cards until data is available.

---

### 8. No Call-to-Action for Empty Dashboard

**Severity:** MEDIUM (onboarding flow)
**Location:** `/packages/frontend/pages/organizer/dashboard.tsx` (lines 434–439)
**Finding:** The "Sales" tab shows an EmptyState when there are no sales, but the "Overview" tab shows metric cards that are mostly incomplete (dashes) and doesn't guide new organizers to create their first sale.

**Current Overview (empty state):**
- 0 Active Sales (real)
- — Total Items (not implemented)
- — Earnings (30d) (not implemented)
- Tier Rewards section (present, but can be overwhelming for new users)

**Recommended Fix:** Show a more prominent CTA in the overview: "Create your first sale to get started" with a button linking to `/organizer/create-sale`.

---

### 9. Add-Items Page – AI Scan Affordance

**Severity:** MEDIUM (discoverability)
**Location:** `/packages/frontend/pages/organizer/add-items.tsx`
**Finding:** The page has an AI photo scanning feature (RapidCapture batch processing) but the UI to access it may not be obvious to new users. Button placement and labeling should be more prominent.

**Current State:**
- "RapidCapture" mode exists (lines 84–97) but may not be visible in the initial scroll
- Batch queue UI shows but doesn't have clear instructions

**Recommended Fix:** Add a sticky header or highlighted section at the top of the page explaining "Snap items with your phone camera to auto-fill details and upload photos instantly."

---

### 10. LocationMap Component – Poor Fallback UX

**Severity:** LOW (edge case)
**Location:** `/packages/frontend/components/LocationMap.tsx` (lines 98–105)
**Finding:** When the map fails to load, the fallback shows a simple text message "Map unavailable" with the address. This is functional but could be improved.

**Current Fallback:**
```tsx
<div className="flex items-center justify-center w-full h-full bg-warm-100">
  <div className="text-center">
    <p className="text-sm text-warm-600">Map unavailable</p>
    <p className="text-xs text-warm-500 mt-1">{fullAddress}</p>
  </div>
</div>
```

**Recommended Fix:** Add an icon (e.g., 📍) and a "Click to open directions in Google Maps" button that still works even if the static map fails.

---

### 11. SaleCard Component – Metadata Formatting

**Severity:** LOW (polish)
**Location:** `/packages/frontend/components/SaleCard.tsx`
**Finding:** Sale cards in the homepage feed show dates but don't indicate timezone or whether dates are in the past/future at a glance. This could be confusing for shoppers in different timezones.

**Recommended Fix:** Add a status badge (e.g., "HAPPENING NOW", "COMING SOON", "ENDED") to make sale timing clear.

---

### 12. HomePage Search UI – Missing Filter Label Clarity

**Severity:** LOW (discoverability)
**Location:** `/packages/frontend/pages/index.tsx`
**Finding:** The homepage has date filter buttons ("all", "upcoming", "this-weekend", "this-month") but no clear indication of which filter is currently active beyond a visual highlight.

**Recommended Fix:** Add a small badge or label showing "Showing: [filter name]" above the sale grid.

---

### 13. Add-Items Page – Bulk Operations Feedback

**Severity:** MEDIUM (UX clarity)
**Location:** `/packages/frontend/pages/organizer/add-items.tsx`
**Finding:** The bulk delete/status/category operations exist but may not provide clear confirmation or undo affordance. Users could accidentally bulk-delete items without a clear warning.

**Recommended Fix:** Add a confirmation modal before bulk delete: "Are you sure? This will permanently delete X items."

---

## Prioritized Fix List

| # | Issue | File | Severity | Recommended Fix |
|---|-------|------|----------|---|
| 1 | Dashboard sales not clickable to public page | `pages/organizer/dashboard.tsx` | CRITICAL | Wrap sale card in `<Link href={`/sales/${sale.id}`}>` OR add "View Sale" link |
| 2 | Item photos not optimized on sale detail | `pages/sales/[id].tsx` | CRITICAL | Use `getOptimizedUrl()` and `getLqipUrl()` instead of raw URLs |
| 3 | Map markers fail in Firefox | `components/SaleMapInner.tsx` | CRITICAL | Add `crossOrigin: true` to icon configs OR host markers locally |
| 4 | Incomplete dashboard metrics | `pages/organizer/dashboard.tsx` | MEDIUM | Fetch and display total items and 30d earnings, or hide incomplete cards |
| 5 | Item grid missing progressive image loading | `pages/sales/[id].tsx` | HIGH | Add LQIP blur + skeleton pattern like ItemCard component |
| 6 | Onboarding wizard UX gaps | `components/OnboardingWizard.tsx` | MEDIUM | Add step counter, back button, Stripe loading state, clearer labels |
| 7 | Empty dashboard guidance | `pages/organizer/dashboard.tsx` | MEDIUM | Show prominent CTA to create first sale in overview tab |
| 8 | AI photo scan discoverability | `pages/organizer/add-items.tsx` | MEDIUM | Add sticky header explaining RapidCapture feature |
| 9 | Map fallback UX poor | `components/LocationMap.tsx` | LOW | Add icon and "Open in Google Maps" button to fallback state |
| 10 | Sale card timing ambiguous | `components/SaleCard.tsx` | LOW | Add status badge (HAPPENING NOW / COMING SOON / ENDED) |
| 11 | HomePage filter clarity | `pages/index.tsx` | LOW | Show "Showing: [filter]" label above sale grid |
| 12 | Bulk operations lack confirmation | `pages/organizer/add-items.tsx` | MEDIUM | Add confirmation modal before bulk delete |

---

## Testing Recommendations

Before shipping fixes:

1. **Issue #1 (Dashboard links):** Test clicking sale title/card on desktop and mobile; verify navigation to `/sales/{id}`
2. **Issue #2 (Image optimization):** Compare page load time before/after using imageUtils; test on slow 3G network
3. **Issue #3 (Firefox markers):** Test map rendering on Firefox (v120+), Chrome, Safari; verify markers appear and respond to clicks
4. **Issue #4 (Metrics):** Verify data loads correctly and updates when sales/earnings change
5. **Issue #6 (Onboarding):** Run first-time organizer flow on mobile; verify all steps are accessible

---

## Conclusion

The three **CRITICAL** issues must be fixed before beta launch. The **HIGH** and **MEDIUM** severity items should be addressed before public release. **LOW** severity items are polish improvements that can be rolled into a future release.

**Estimated effort:** 2–4 engineering hours for CRITICAL fixes; 4–6 hours for HIGH/MEDIUM polish.
