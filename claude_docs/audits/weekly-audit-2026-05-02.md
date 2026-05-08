# Weekly Site Audit — 2026-05-02

**Audit type**: Automated weekly scheduled task  
**Auditor**: Claude (main session)  
**Session**: S622 (continuation of compressed context)  
**Scope**: Full site — all major routes, multi-role flows, adversarial checks  
**Reviewed against**: DECISIONS.md D-001–D-010, brand-voice-guide-2026-03-16.md  
**Tested as**: Karen Anderson (organizer, SIMPLE tier)  

---

## Summary

| Severity | Count | Immediate Action Required |
|----------|-------|--------------------------|
| CRITICAL | 1 | Yes |
| HIGH | 3 | Yes |
| MEDIUM | 3 | Next session |
| LOW | 3 | Backlog |

**Top priority**: C-001 (scraped sales 404) + H-002 (images broken platform-wide) need investigation before any beta outreach.

---

## CRITICAL

### C-001: Scraped Sale URLs Return "Sale not found"
**Route**: `/sales/[id]` for any scraped/unmanaged listing  
**Tested URL**: `finda.sale/sales/cmoogeycs09v1q4utb9jiwl1r` (EstateSalesNet scraped sale from DB)  
**Observed**: "Sale not found" page rendered — same as a non-existent ID.  
**Expected**: Per S614 design intent, individual `/sales/[id]` URLs must remain publicly accessible for (a) claim email links sent to organizers and (b) SEO indexing of scraped content.  
**Evidence of root cause**: Querying the production DB for `isUnmanagedListing` field returned `psycopg2.errors.UndefinedColumn: column s.isUnmanagedListing does not exist`. The `20260501020000_scraper_phase1` migration likely did not deploy to production. The backend may be crashing on queries that reference this column and returning "not found" as a fallback.  
**Impact**: Every scraped listing (hundreds of sales across Nashville, Chicago, Atlanta, etc.) is inaccessible by URL. Claim email links are broken. All SEO value from scraped content is zeroed. The entire S614 scraper infrastructure is dark from the public-facing side.  
**Fix**: Verify migration deployment. If undeployed: `cd packages/database && npx prisma migrate deploy` with Railway DATABASE_URL override. Then confirm the individual sale GET endpoint (`GET /sales/:id` in saleController) does NOT filter by `isUnmanagedListing` — the S614 design only filters the public feed/search, not direct URL access.

---

## HIGH

### H-001: D-006 Violation — Items for Sale Section Below Map
**Route**: `/sales/[id]` (tested on `finda.sale/sales/cmomwfa52001j11qw3ga98hwn`)  
**Decision violated**: D-006 — required section order: Header → Organizer → Flash Deal → Photos+About | Sidebar → **Items (§5)** → UGC → **Map (§7)** → Reviews  
**Observed order**: Header → Claim Banner → Organizer Info → Photo Gallery+Sidebar → About → Live Activity → **Map/Location** → **Items for Sale**  
**Items appear as the last section, after the map.**  
**Impact**: Items are the primary reason shoppers visit a sale page (D-006 rationale). First-time users who don't scroll far enough will miss the inventory entirely. Directly harms conversion and session depth.  
**Fix**: Dispatch findasale-dev to reorder sections in `packages/frontend/pages/sales/[id].tsx` to match D-006. Items block must render before the Map/Location block.

### H-002: Images Not Loading Across Platform (Systemic)
**Routes affected**: `/sales/[id]` item thumbnails, `/organizer/sales` cover images, `/shopper/history` item thumbnails, `/trending` "Most Wanted Items" section (one "No image" placeholder visible)  
**Observed**: Blank gray boxes where sale cover images and item photos should appear. This affects every image surface tied to organizer-uploaded or scraped content. UI icons, logos, and encyclopedia article images (likely from external CDN) load correctly — the issue is isolated to user/scraper content images.  
**Impact**: Photo-centric workflow is documented as the core product value driver (`project_photo_workflow_core.md`). Blank images undermine the primary organizer value prop ("snap a photo, it fills in the listing") and destroy shopper confidence. This is P0-equivalent for beta readiness.  
**Likely causes**:
- Cloudinary domain not configured for production (image URLs reference a dev/staging bucket)
- Seed data images have broken or expired URLs
- `next/image` domain whitelist missing the Cloudinary domain in `next.config.js`
**Fix**: Pull one image URL from a sale item in the DB and test it directly in browser. Check `packages/frontend/next.config.js` for `images.domains` config. Verify Cloudinary environment variable matches production bucket.

### H-003: City Detail Pages All 404 — `/cities` Is a Dead End
**Routes**: `/cities` (index works), `/city/[slug]` (all variations 404)  
**Observed**: `/cities` correctly lists Nashville (38 sales), Chicago (36), Atlanta (34), etc. from scraper data. Clicking any city card navigates to `/city/Nashville` → 404. Manually tested: `/city/nashville`, `/city/nashville-tn`, `/cities/nashville` — all 404.  
**Root cause confirmed in code**:  
`packages/frontend/pages/cities/index.tsx` line ~80:
```tsx
href={`/city/${encodeURIComponent(cityData.city)}`}
```
`cityData.city` is the raw city name from the API (e.g., `"Nashville"`). But `packages/frontend/pages/city/[slug].tsx` uses `getCityFromSlug(slug)` which looks up slugs from `us-cities-3000.json` — the JSON slug format (e.g., `nashville-tn`) does not match the raw city name passed by the API.  
**Impact**: The entire city SEO hub infrastructure built in S604-S607 is non-functional. The `/cities` index generates real impressions and is linked in navigation, but every single outbound link 404s. Hundreds of city landing pages meant to drive organic search traffic are dark.  
**Fix option A (recommended)**: In `cities/index.tsx`, after fetching city stats from the API, look up each city's proper slug using `getAllCities()` from `@/lib/city-slugs` — match on city name + state abbreviation, then use that slug for the href.  
**Fix option B**: Make `/city/[slug].tsx`'s `getCityFromSlug` also accept raw city names by adding a name-to-slug lookup.

---

## MEDIUM

### M-001: Systemic Horizontal Overflow — Content Clips at Viewport Edge
**Routes affected**: `/` (Treasure Hunt section), `/pricing` (TEAMS column), `/sales/[id]` (right sidebar buttons), `/guide` (article body text), `/organizer/dashboard` (Command Center link)  
**Observed**: At standard 1267px viewport, content on the right side of multi-column layouts is cut off without visible overflow or scrollbar. Pricing TEAMS column feature list truncates mid-sentence. Sale detail sidebar buttons "Message Organizer", "Going", and "Remind Me by" are all partially clipped. Guide article body text runs to the browser edge with no right padding.  
**Likely cause**: A layout wrapper component (likely `Layout.tsx` or `_app.tsx`) is missing `overflow-x-hidden` or an appropriate `max-w` constraint, causing the content to overflow the visible viewport. May also be a `100vw` width on a container that doesn't account for scrollbar width.  
**Impact**: Primarily cosmetic but significantly affects polish perception. Affects everyone at a standard laptop viewport (1280px).  
**Fix**: Add `overflow-x-hidden` to the top-level `<div>` in the Layout component. Also review `max-w-screen-xl mx-auto` usage across shared containers.

### M-002: Workspace Page — Near-Invisible Empty State Text (D-002)
**Route**: `/organizer/workspace`  
**Observed**: "No workspace found. Create one first." renders as near-invisible text — dark gray on near-black background with effectively no contrast. Zoomed screenshot confirmed the text is barely distinguishable from the background.  
**Decision violated**: D-002 — Full dark mode support required on all pages.  
**Fix**: Update the text color class to `text-warm-400 dark:text-warm-300` or equivalent. The Upgrade to TEAMS upsell card renders correctly; only the informational text has the contrast failure.

### M-003: Messages Page Empty State Copy is Organizer-Only
**Route**: `/messages`  
**Observed**: Empty state reads: "When shoppers ask about your items or sales, messages will appear here. Check back soon!"  
**Issue**: This is organizer-centric copy on a shared route used by both roles. A shopper who has sent no messages sees copy implying they own items and sales, which is confusing and breaks brand voice.  
**Fix**: Update to role-neutral copy such as: "No messages yet. Start a conversation — visit a sale and tap 'Message Organizer' to get in touch."

---

## LOW

### L-001: About Page Sparse
**Route**: `/about`  
**Observed**: 3 sections with minimal content. No team story, no mission narrative, no product screenshots, no social proof or testimonials.  
**Impact**: Brand trust gap for professional estate sale organizers evaluating the platform vs. competitors.  
**Action**: Flag to findasale-marketing. Low priority for beta, but should be addressed before public launch.

### L-002: Nav User Name Always Truncated at Desktop Width
**All pages**: Top-right avatar area shows "Karen An..." — name truncated even at full desktop width.  
**Observed**: At 1267px, there is visible whitespace in the nav but the name still truncates. Likely a fixed `max-w` or `overflow-hidden` set too narrowly on the avatar name span.  
**Fix**: Increase the `max-w` on the nav avatar name span or use `truncate` only at smaller breakpoints.

### L-003: Treasure Hunt Section Clips on Home Page
**Route**: `/`  
**Observed**: "Today's Treasure Hunt" block clips at right edge — "Find it to e..." truncated. This is a subset of M-001 but flagged separately because this feature is a key engagement driver and first-time visitors see it on the home page.  
**Fix**: Resolved as part of M-001 overflow fix.

---

## Routes Audited

| Route | Result | Finding |
|-------|--------|---------|
| `/` | ⚠️ Pass w/ issue | L-003 (overflow), otherwise clean |
| `/map` | ✅ Pass | All type filters, dark mode, pins working |
| `/trending` | ⚠️ Pass w/ issue | H-002 (image loading) |
| `/pricing` | ⚠️ Pass w/ issue | M-001 (TEAMS column clips) |
| `/about` | ⚠️ Sparse | L-001 |
| `/cities` | ⚠️ Partial | Index works; all detail links broken (H-003) |
| `/city/[slug]` | ❌ Broken | All slugs 404 (H-003) |
| `/encyclopedia` | ✅ Pass | Index + detail pages, search, filters all working |
| `/guide` | ⚠️ Pass w/ issue | M-001 (content clips), otherwise comprehensive |
| `/leaderboard` | ✅ Pass | Rank medals, XP scores, dark mode correct |
| `/login` | ✅ Pass | Email/password, passkey, OAuth options |
| `/register` | ✅ Pass | Role selector, beta invite code, ToS link |
| `/messages` | ⚠️ Pass w/ issue | M-003 (copy is organizer-only) |
| `/sales/[id]` (managed) | ⚠️ Issues | H-001 (D-006 violation), H-002 (images) |
| `/sales/[id]` (scraped) | ❌ Broken | C-001 (404 on all scraped URLs) |
| `/shopper/favorites` | ✅ Pass | Redirects to `/wishlist`, excellent empty state |
| `/shopper/history` | ⚠️ Pass w/ issue | H-002 (item thumbnails blank) |
| `/organizer/sales` | ⚠️ Issues | H-002 (cover images blank) |
| `/organizer/workspace` | ⚠️ Issues | M-002 (low contrast text) |
| `/admin` (as non-admin) | ✅ Pass | Correctly redirects to `/access-denied` |

---

## Auth Boundary Results

| Test | Result |
|------|--------|
| Non-admin accessing `/admin` | ✅ Blocked — "Access Denied" page with Go to Home + Contact Support |
| Organizer accessing organizer pages | ✅ Works as expected |
| 404 page recovery path | ✅ D-009 compliant — "Back to Home" + support contact |
| Access denied recovery path | ✅ D-009 compliant — "Go to Home" + "Contact Support" |

---

## D-001–D-010 Compliance Summary

| Decision | Status | Notes |
|----------|--------|-------|
| D-001: All sale types scope | ✅ | Home hero, map filters, pricing, register all include all types |
| D-002: Full dark mode | ⚠️ | One violation: M-002 (workspace empty state text) |
| D-003: Empty states with CTAs | ✅ | Wishlist, messages, workspace all have CTAs |
| D-004: Mobile-first | ⚠️ UNTESTED | Viewport resize tool did not respond; overflow issue (M-001) suggests potential mobile problems |
| D-005: Multi-endpoint testing | ⚠️ PARTIAL | Only organizer-side messages tested; shopper→organizer message send flow not tested this session |
| D-006: Sale detail section order | ❌ Broken | Items appear after Map — H-001 |
| D-007: Teams 12-member cap | ✅ | Pricing page shows Teams tier correctly |
| D-008: Loading states mandatory | ✅ | Skeleton states observed on cities and dashboard |
| D-009: Error states with recovery | ✅ | All error states have recovery CTAs |
| D-010: No autonomous removal | ✅ | Audit only — no removals made or recommended |

---

## Recommended Fix Order

1. **C-001** — Run missing migration, verify scraped sale URL accessibility. Blocking: claim emails and all scraper SEO value.
2. **H-002** — Diagnose image loading root cause (Cloudinary config, `next.config.js` domains). Blocking: all sales look broken.
3. **H-001** — Reorder sale detail page sections (D-006). Quick dev fix.
4. **H-003** — Fix `/cities` → `/city/[slug]` link slug mismatch. Quick dev fix.
5. **M-001** — Fix horizontal overflow in layout container. One-line fix, high visual impact.
6. **M-002** — Fix workspace text contrast. Two-minute fix.
7. **M-003** — Fix messages empty state copy. Copy change only.

---

*Audit completed: 2026-05-02 | Next audit: 2026-05-09*
