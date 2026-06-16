# ADR — Facebook Commerce Manager Integration Overhaul — 2026-06-16

## Context

ArtifactMI uploaded a Facebook Commerce Manager error report (10 items, all "Not visible
in Shops"). Root cause: `quantity_to_sell_on_facebook` absent from the CM feed CSV.
Audit surfaced 6 additional gaps in the FB integration surface. This ADR covers all 7.

---

## Decision Summary

Fix the Commerce Manager CSV feed, add an organizer-level catalog endpoint, introduce a
lightweight `fbCatalogEnabled` flag on Organizer, wire platform stats and nudge service
to the new flag, and surface the catalog URL + registration toggle in settings and the
promote page. The three-format export mess is cleaned up by documenting intent and
marking the legacy CSV deprecated (not deleted — removal gate applies).

---

## Issue 1 — Missing `quantity_to_sell_on_facebook` (CRITICAL)

**Root cause:** `exportCommerceManagerFeed` in `exportController.ts` omits the
`quantity_to_sell_on_facebook` field. FB Shops requires it. All items are invisible
in Shops without it.

**Decision:** Add `quantity_to_sell_on_facebook` to the CSV output.
- In-stock (`status !== 'SOLD'`): value = `1`
- Out-of-stock (`status === 'SOLD'`): value = `0`

This is correct because FindA.Sale items are one-of-a-kind. Quantity is always 1 or 0.

**Files changed:** `packages/backend/src/controllers/exportController.ts`
(add column to headers array and row assembly inside `exportCommerceManagerFeed`)

---

## Issue 2 — `brand` Fallback = `'N/A'` (HIGH)

**Root cause:** `const brand = item.brand && item.brand.trim() ? item.brand.trim() : 'N/A';`
FB spec requires empty string for unknown brand, not a literal `'N/A'` string.

**Decision:** Change fallback to empty string: `item.brand?.trim() ?? ''`

**Files changed:** `packages/backend/src/controllers/exportController.ts`

---

## Issue 3 — Per-Sale Feed URL (HIGH — organizer UX + stability)

**Current state:** `GET /api/sales/:saleId/export/commerce-feed` — per-sale URL.
Organizers must register a separate catalog feed URL per sale. Sale IDs rotate when
sales end and new ones start. Commerce Manager catalogs are meant to be long-lived
stable URLs.

**Decision:** Add an organizer-level catalog endpoint that aggregates items across
all active (non-archived, non-draft) sales:

```
GET /api/organizers/:organizerId/export/commerce-feed
Auth: None (public — FB crawler has no session token)
Response: text/csv, same format as per-sale feed
Cache-Control: public, max-age=3600
```

Query: join items through sales where `sale.organizerId = :organizerId`
AND `sale.status NOT IN ('DRAFT', 'ARCHIVED')` AND `item.photoUrls.length > 0`.

The per-sale endpoint stays (backward compat, existing catalog registrations). The
organizer-level endpoint is what we expose going forward in settings and the promote page.

**No schema change required.**

**Files changed:**
- `packages/backend/src/controllers/exportController.ts` (new function `exportOrganizerCommerceManagerFeed`)
- `packages/backend/src/routes/organizers.ts` (register `GET /:organizerId/export/commerce-feed`)

---

## Issue 4 — `fbExportedAt` Never Stamped by CM Crawler (MEDIUM)

**Root cause:** `fbExportedAt` on Item is stamped only by the Marketplace XLSX/JSON export
endpoints (PRO-gated, organizer downloads them). The Commerce Manager feed is crawled by
Facebook — we have no webhook or callback when FB ingests it. So for organizers using CM,
`fbExportedAt` stays null and `platforms.tsx` always shows 0 listed on Facebook.

**Decision:** Introduce `Organizer.fbCatalogEnabled Boolean @default(false)`.

When this flag is true, `platformStatsService` interprets the organizer as "listed on
Facebook" for all items in active sales — not just items with `fbExportedAt` set.

```typescript
// platformStatsService.ts — facebook block
facebook: {
  connected: !!org.fbCatalogEnabled || !!org.facebookPageId,
  listed: org.fbCatalogEnabled
    ? (count of AVAILABLE items across active sales for this organizer)
    : facebookCount, // existing fbExportedAt count — covers Marketplace users
  limit: null,
  note: org.fbCatalogEnabled ? 'COMMERCE_MANAGER' : 'EXPORT_ONLY',
}
```

`fbExportedAt` on Item is untouched — still used for Marketplace users. No data loss.

**Schema change required — additive only:**
```prisma
model Organizer {
  // ... existing fields ...
  fbCatalogEnabled            Boolean   @default(false)     // Organizer registered CM feed
  fbCatalogRegisteredAt       DateTime?                     // When they toggled it on
}
```

**Migration:** `20260616000002_add_organizer_fb_catalog_enabled`

**Rollback:**
```sql
-- Down
ALTER TABLE "Organizer" DROP COLUMN IF EXISTS "fbCatalogEnabled";
ALTER TABLE "Organizer" DROP COLUMN IF EXISTS "fbCatalogRegisteredAt";
```
Playbook: "If deploy fails after this migration, run the down SQL via psycopg2 against
Railway public proxy. No data is at risk — both columns are additive with defaults."

---

## Issue 5 — No `facebookPageId` UI (MEDIUM)

**Context:** `facebookPageId` on Organizer was added for directory enrichment (ADR-073),
not for platform connection. There is no UI for organizers to set it. The `connected`
check on the platforms page (`!!org.facebookPageId`) is always false.

**Decision:** Do NOT add a `facebookPageId` input to settings. That field is for
directory/verification use only (populated by scraper/ESN enrichment). Instead, use
`fbCatalogEnabled` (Issue 4 above) as the "connected" signal for Commerce Manager users.

Settings page gets a new "Facebook Commerce Manager" section with:
1. A copy-to-clipboard field showing `https://finda.sale/api/organizers/[organizerId]/export/commerce-feed`
2. A toggle: "I've registered this URL with Facebook Commerce Manager"
   → PATCH `/api/organizers/me` with `{ fbCatalogEnabled: true }` → stamps `fbCatalogRegisteredAt`
3. Brief instruction text (2 sentences max): "Paste this URL into Facebook Commerce Manager
   as a data feed source. Once Facebook confirms the feed, toggle this on so your listings
   show as active in your FindA.Sale platform dashboard."

**Files changed:**
- `packages/frontend/pages/organizer/settings.tsx`
- `packages/backend/src/controllers/organizerController.ts` (handle `fbCatalogEnabled` in PATCH /me)

---

## Issue 6 — Nudge Service Links to Wrong URL for CM Users (LOW)

**Current state:** `facebookNudgeService.ts` links all FB nudges to
`https://www.facebook.com/marketplace/selling/` regardless of whether the organizer is a
Commerce Manager user or a Marketplace user.

**Decision:** Check `org.fbCatalogEnabled`. Route nudge URL accordingly:
- CM users (`fbCatalogEnabled = true`): `https://business.facebook.com/commerce`
- Marketplace users (else): `https://www.facebook.com/marketplace/selling/`

**Files changed:** `packages/backend/src/services/facebookNudgeService.ts`
(add org lookup on `fbCatalogEnabled` before building notification)

---

## Issue 7 — Three Overlapping Export Formats (LOW — documentation only)

**Current state:**
| Endpoint | Format | Auth | Purpose |
|----------|--------|------|---------|
| `exportService.ts` `formatFacebookCsv` | Legacy CSV (title/price/category) | None | Unknown — not surfaced in UI |
| `exportController.ts` `exportCommerceManagerFeed` | CM CSV (FB catalog spec) | None | Commerce Manager |
| `exportController.ts` `exportFacebookXLSX` | Marketplace XLSX | PRO | Marketplace bulk upload |
| `exportController.ts` `exportFacebookJSON` | Marketplace JSON | PRO | Marketplace bulk upload |

**Decision:** Legacy CSV in `exportService.ts` is deprecated. It is not surfaced in any
UI route. Do NOT delete it this session (removal gate requires Patrick sign-off). Add a
`// @deprecated` JSDoc comment marking it for removal. The two Marketplace formats
(XLSX/JSON) remain as-is — they serve different organizer workflows.

**Files changed:** `packages/backend/src/services/exportService.ts` (comment only)

---

## Issue 8 — Promote Page Has No Commerce Manager Section (LOW)

**Current state:** `/organizer/promote/[saleId].tsx` has Marketplace download buttons but
no mention of Commerce Manager. Organizers who want to use CM have no in-app path to
discover or copy the feed URL.

**Decision:** Add a "Commerce Manager Feed" section to the promote page with:
- Brief explanation: "Use your organizer-level feed URL for a stable catalog that works
  across all your sales."
- Copy-to-clipboard field showing the organizer-level CM feed URL
- Link to the settings page FB toggle

**Files changed:** `packages/frontend/pages/organizer/promote/[saleId].tsx`
(add CM section, read `organizerId` from auth context)

---

## Implementation Order for findasale-dev

Run in this order. Issues 1–2 are a single file/commit. Issues 3–8 are independent
after the migration runs.

1. **Migration first** (Patrick runs manually):
   `20260616000002_add_organizer_fb_catalog_enabled`
   Fields: `fbCatalogEnabled Boolean @default(false)`, `fbCatalogRegisteredAt DateTime?`

2. **Issue 1 + 2**: `exportController.ts` — add `quantity_to_sell_on_facebook` column +
   fix `brand` fallback. Zero schema dependency.

3. **Issue 3**: New organizer-level CM feed endpoint in `exportController.ts` +
   register route in `organizers.ts`.

4. **Issue 4 + 5**: `platformStatsService.ts` (FB stats block) + `organizerController.ts`
   (handle `fbCatalogEnabled` in PATCH) + `settings.tsx` (CM section with URL + toggle).
   All require migration to have run.

5. **Issue 6**: `facebookNudgeService.ts` — check `fbCatalogEnabled` for URL routing.

6. **Issue 7**: `exportService.ts` — add deprecation comment only.

7. **Issue 8**: `promote/[saleId].tsx` — add CM section.

Steps 2–3 can be dispatched before the migration runs (they are additive / schema-free).
Steps 4–7 require the migration.

---

## Flagged for Patrick

- **`facebookPageId` on Organizer** is currently populated by the scraper/ESN enrichment
  flow, not by organizers. The platforms dashboard was checking it for "connected" status.
  This ADR changes `connected` to check `fbCatalogEnabled` instead. The `facebookPageId`
  field is untouched and still used by the directory flow — no data loss.

- **Legacy CSV** (`exportService.ts` `formatFacebookCsv`) is marked deprecated but not
  deleted. It has no known callers in the UI. Approve removal when ready.

- **No FB Partner API** — confirmed by S992 research: FB Partner API is EU-only per EC
  antitrust ruling. Data feed (CSV crawl) is the correct and only US-available approach.
  This architecture is correct.

---

## Constraints Added

- All new CM-related organizer settings flow through `fbCatalogEnabled` (not `facebookPageId`).
- `facebookPageId` is directory-only — do not repurpose it for platform connection logic.
- Organizer-level CM feed URL format: `/api/organizers/:organizerId/export/commerce-feed`
  This path is now stable and organizers should submit it (not per-sale URLs) to FB.
