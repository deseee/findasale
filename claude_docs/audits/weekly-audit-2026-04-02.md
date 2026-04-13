# Weekly Full-Site Audit — 2026-04-02

**Auditor:** Automated weekly audit (scheduled task)
**Environment:** Chrome MCP against finda.sale (production)
**Logged in as:** Alice Johnson (organizer + admin role)
**Date:** April 2, 2026

---

## Summary

| Metric | Value |
|--------|-------|
| Total routes enumerated (from `pages/`) | 134 |
| Routes tested in Chrome | 16 |
| Console errors found | 1 (non-blocking geolocation) |
| Critical findings | 1 |
| High findings | 5 |
| Medium findings | 4 |
| Low findings | 3 |

---

### CRITICAL (blocks beta testing)

**C-1: Sale detail page — Items section buried below Location/Map (D-006 violation)**
- **Route:** `/sales/[id]` (tested on `cmn9opm3l0047ij7t5nro1eeg`)
- **Description:** Per D-006, the section order should be: Header → Organizer Info → Flash Deal → Photo+About | Sidebar → **Sale Items** → Community Photos → Map/Location → Reviews. In production, Items for Sale appears BELOW the Location map. Shoppers must scroll past the full map, Reviews, and Live Activity sidebar to reach items — the primary reason they visit a sale page.
- **DECISIONS.md entry violated:** D-006 (Sale Detail Page Section Order)
- **Evidence:** Screenshot ss_3282jc9zm (sale header), ss_8659702um (About + Location visible, no items), ss_152397mtp (items finally appear below Location map)

---

### HIGH (degrades user experience)

**H-1: Trending page — Hot Sales cards have blank/white images**
- **Route:** `/trending`
- **Description:** The "Hot Sales" section shows 6 sale cards with blank white image areas. No cover photos load. The "Most Wanted Items" section has 2 of 4 item cards with missing images. This makes the Trending page feel broken.
- **DECISIONS.md entry violated:** D-008 (Loading States) — blank areas instead of skeleton or fallback
- **Evidence:** Screenshot ss_44278zw40

**H-2: Inspiration Gallery — ALL images missing**
- **Route:** `/inspiration`
- **Description:** Every item card (all 6+ visible) shows a blank grey placeholder area instead of item photos. The gallery is a visual feature — without images it serves no purpose. Item names and prices render correctly but the visual experience is completely degraded.
- **Evidence:** Screenshot ss_88486gkpr

**H-3: Feed page — Sale images extremely blurry/low-res**
- **Route:** `/feed`
- **Description:** All sale card images on the "Your Feed" page appear as heavily blurred, low-resolution thumbnails being stretched to fill the card area. Contrasts with the homepage where the same sales show clear images. Likely serving thumbnail-size images without the full-res version.
- **Evidence:** Screenshot ss_1208al9g2

**H-4: Pricing page — Teams tier shows "Up to 5 team members" (D-007 violation)**
- **Route:** `/pricing` (redirects to `/organizer/pricing`)
- **Description:** D-007 (LOCKED decision, S240) specifies Teams tier caps at 12 members. The pricing page currently shows "Up to 5 team members" in the Teams column. This misrepresents the locked business decision.
- **DECISIONS.md entry violated:** D-007 (Teams Tier — Member Cap — LOCKED)
- **Evidence:** Screenshot ss_8832ypwlq

**H-5: Sale detail item data quality — mismatched categories and generic descriptions**
- **Route:** `/sales/[id]` → Items section
- **Description:** "Cast Iron Skillet Set #1" is categorized as "Clothing" with description "Beautiful clothing item in excellent condition." Similarly generic descriptions across all items. This is seed data but it's what beta testers would see. Categories are wrong and descriptions are clearly template-generated.
- **Evidence:** Screenshot ss_152397mtp

---

### MEDIUM (polish issue)

**M-1: Organizer dashboard grammar — "You have 1 items in draft"**
- **Route:** `/organizer/dashboard`
- **Description:** Should be "You have 1 item in draft" (singular). Simple pluralization bug.
- **Evidence:** Screenshot ss_5538li512

**M-2: About page — sparse content with large empty space**
- **Route:** `/about`
- **Description:** The About page has minimal content (mission, For Organizers, For Shoppers, Contact Us) followed by a massive empty space before the page ends. No footer visible. D-001 compliant (mentions all sale types) but feels incomplete for a production page. Could benefit from team info, company story, or testimonials section.
- **Evidence:** Screenshot ss_39184cfi0

**M-3: Map page pins are grey, not branded green**
- **Route:** `/map`
- **Description:** Homepage mini-map uses green branded pins, but the full map page uses generic grey Leaflet pins. Inconsistent visual branding between the two map instances.
- **Evidence:** Screenshot ss_152397mtp (homepage green) vs ss_8023nrh53 (map page grey)

**M-4: Admin dashboard accessible — verify role-gating**
- **Route:** `/admin`
- **Description:** The admin dashboard loaded fully for Alice Johnson showing all platform metrics, user management, sales management, and bid review tools. Alice appears to have an ADMIN role in seed data, so this may be correct behavior. However, the admin role assignment should be verified — if Alice is supposed to be a regular organizer in seed data, this is a security issue that would escalate to CRITICAL.
- **Evidence:** Screenshot ss_2535cel70

---

### LOW (nitpick)

**L-1: Geolocation error in console (non-blocking)**
- **Route:** All pages
- **Description:** Console shows `Geolocation error (non-blocking): User denied Geolocation` on every page load. Error is explicitly marked non-blocking and handled gracefully — map still shows Grand Rapids area. No user-facing impact.
- **Evidence:** Console message on all tested pages

**L-2: "New version available" toast on homepage scroll**
- **Route:** `/` (homepage, bottom)
- **Description:** A blue toast appears in the top-right saying "A new version is available. Reload to update." This is likely a service worker update notification. Not harmful but could confuse beta testers who wonder if they're on an old version.
- **Evidence:** Screenshot ss_8659702um

**L-3: Sale detail — Organizer info appears twice (card + sidebar)**
- **Route:** `/sales/[id]`
- **Description:** The organizer's phone number and address appear both in the "Organized by" card near the top AND in the "Organized By" sidebar section next to the photo. Slight redundancy but not harmful — sidebar includes the "Plan My Route in Maps" CTA which justifies its existence.
- **Evidence:** Screenshots ss_3282jc9zm, ss_8659702um

---

## Mobile Viewport Testing

**Test limitation:** The Chrome MCP `resize_window` tool changes the OS-level window dimensions but CSS media queries respond to the logical viewport (`window.innerWidth`), which remained at ~1476px due to 1.5x device pixel ratio scaling. True mobile simulation was not possible via this method.

**Code verification:** Grepping `packages/frontend/components/Layout.tsx` confirmed responsive breakpoints ARE implemented:
- `lg:hidden` classes for mobile-only elements
- Hamburger menu + drawer navigation pattern
- Mobile persistent search bar
- Proper responsive class usage (`sm:`, `md:`, `lg:` breakpoints)

**Recommendation:** Mobile testing requires either DevTools device emulation (not available via MCP) or a real device. The responsive infrastructure exists in code.

---

## DECISIONS.md Drift Report

| Decision | Status | Notes |
|----------|--------|-------|
| D-001: All Sale Types | ✅ Compliant | Homepage hero, about page, footer, map filters all mention multiple sale types |
| D-002: Full Dark Mode | ✅ Compliant | All tested pages render correctly in dark mode. No invisible text detected. |
| D-003: Empty States with CTAs | ✅ Compliant | Hubs page (no location) shows CTA. Collections page functional. |
| D-004: Mobile-First Layout | ⚠️ Unverified | Code has responsive breakpoints but could not simulate mobile viewport in test environment |
| D-005: Multi-Endpoint Testing | ⚠️ Partial | Messages show conversations from Alice's side; receiver side not tested this audit |
| D-006: Sale Detail Section Order | ❌ DRIFTED | Items appear below Location/Map, should be above per decision |
| D-007: Teams Tier Member Cap | ❌ DRIFTED | Pricing shows "5 members", locked decision says 12 |
| D-008: Loading States | ⚠️ Issues | Trending and Inspiration show blank areas, not skeletons |
| D-009: Error States with Recovery | ✅ Compliant | Hubs location error has clear message and recovery CTA |
| D-010: No Autonomous Removal | ✅ N/A | No removals detected |

---

## Top 3 Recommendations for Next Session

1. **Fix D-006 drift (CRITICAL):** Reorder sale detail page sections so Items for Sale appears immediately after the About/Photo grid and BEFORE Location/Map/Reviews. This is the #1 shopper experience issue.

2. **Fix image loading on Trending + Inspiration + Feed:** Three major discovery pages have broken or degraded images. Investigate why cover photos load on the homepage but fail on `/trending`, `/inspiration`, and `/feed`. Likely a different image URL pattern or missing thumbnail generation.

3. **Update pricing page Teams tier to 12 members (D-007):** This is a locked business decision that's incorrectly displayed. Quick fix but important for accurate pricing communication.
