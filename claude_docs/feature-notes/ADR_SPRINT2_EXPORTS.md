# ADR — Sprint 2 Export Features — 2026-03-15

## Decision

Implement three export formats (EstateSales.NET CSV, Facebook Marketplace JSON, Craigslist plain text) for organizers to cross-post their sales to external platforms. Include a FindA.Sale watermark overlay on all exported images using Cloudinary's URL-based transformation API.

## Rationale

**Problem:** Organizers currently list on FindA.Sale and manually re-list on other platforms (EstateSales.NET, Facebook, Craigslist), duplicating effort and reducing visibility.

**Solution:** One-click exports in three formats reduce friction and encourage broader distribution. Watermarks drive traffic back to FindA.Sale.

**Why URL-based watermarks?** Cloudinary's transformation API allows us to apply overlays without re-uploading images or making additional API calls. Watermark is constructed at request time (no storage overhead), applied transparently during CDN delivery, and cached by Cloudinary. Simpler than generating new images server-side.

**Why three formats?** Each platform has different ingestion methods:
- EstateSales.NET: CSV import (industry standard)
- Facebook: JSON (structured item data for richer listings)
- Craigslist: Plain text (copy/paste into posting form)

## Consequences

**Backend:** Three new export endpoints (`/api/export/:saleId/*`), one utility function, one controller. No schema changes needed.

**Frontend:** One new page (`/promote/[saleId]`), three download/copy buttons, toast notifications.

**User Experience:** Organizers can now export and cross-post in ~30 seconds. Watermarks on all external listings drive return traffic.

**Infrastructure:** Minimal — no new databases, no new services. Cloudinary handles transformation caching.

## Constraints Added

1. **Watermark is mandatory** on all exported images — no option to disable (drives return traffic, brand building).
2. **EstateSales.NET CSV** must match their published import format exactly (category mapping defined in spec).
3. **Exports are read-only** — no sync back from external platforms (one-way broadcast).
4. **Authentication required** for all export endpoints (must be sale organizer).

## Schema Impact

None. All features read from existing `Sale`, `Item`, `Organizer` models. No new columns, no migrations.

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Watermark text overlaps with important item details | Position bottom-right, semi-transparent, small font (18px) — tested visually before launch |
| EstateSales.NET category mapping incomplete | Spec includes full mapping table; Patrick validates against live EstateSales.NET import |
| JSON export structure doesn't match Facebook's expectations | No formal spec from Facebook, but JSON structure follows typical item listing conventions; test with sample posting |
| Downloads fail due to Cloudinary URL encoding | Use Cloudinary's documented transformation syntax; test all URL patterns (special chars in titles) |

## Alternatives Considered

1. **Watermark as image overlay (PNG/JPG generation)** — Rejected: slower, requires image processing library, adds storage/compute cost. URL-based is simpler.
2. **Sync back from external platforms** — Rejected: out of scope for Sprint 2, requires polling external APIs, complexity unjustified.
3. **Separate export for each organizer brand color** — Rejected: whiteboard "FindA.Sale" is enough; organizer branding already in Sale model for future use.

## Timeline

Development can proceed in parallel:
- Watermark utility: 1–2 hours
- Export controller: 2–3 hours
- Frontend page: 1–2 hours
- Testing: 1 hour

**Total estimate:** ~6–8 hours. Sprint 2 ready.
