# ADR — Share Card Image Generation — 2026-04-20
Session: S522

## Decision
Use Next.js `/api/og` (Satori) as the server-side PNG renderer for all shareable card generation. Cloudinary continues to own item photo storage, CDN delivery, and watermark overlays on raw item photos — unchanged.

## API Contract

```
GET /api/share-card
  ?saleId=xxx
  &theme=classic|vintage|bold|branded|photo-fullbleed|haul
  &format=square|landscape|story|flyer
  &type=sale|item
  &itemId=xxx   (required when type=item)

Response: PNG image (Content-Type: image/png)
```

Dimensions: square=1080×1080, landscape=1200×630, story=1080×1920, flyer=816×1056.

## Rationale

**Cloudinary URL transforms rejected:** Cannot express multi-element card layouts (photo mosaic + card overlay + QR code + footer + theme typography). Would require Cloudinary Creative Studio template API — paid add-on, vendor-locked templating language, not worth the complexity for what is fundamentally a layout problem.

**Satori chosen:** `@vercel/og` ships with Next.js 14 — zero new dependencies. Renders JSX → SVG → PNG server-side, no headless Chrome. All 6 themes expressible as JSX with flexbox. High-quality output at all resolutions. Runs on existing Vercel infrastructure.

**html2canvas eliminated:** Client-side, unreliable on mobile, browser-inconsistent, lower quality. Not considered.

## Consequences

- One new API route: `packages/frontend/pages/api/share-card.ts`
- Satori JSX templates in that file (or `lib/shareCard/themes/` if file grows large)
- No schema changes — `guildXp` already on User model
- No new npm packages (verify `qrcode` presence; add if missing — small dep)

## Constraints Added

- External images in Satori JSX must be fetched as data URIs server-side (not raw external URLs)
- QR code generation is server-side only (via `qrcode` npm)
- Satori does not support CSS Grid — use flexbox for all layout
- Use inline styles only in Satori JSX — no Tailwind classes

## Dev Instructions

1. Check if `qrcode` package is in monorepo — add if missing
2. Create `packages/frontend/pages/api/share-card.ts`
3. Load Inter 400/700 as ArrayBuffer at module level (cached, not per-request)
4. Build theme JSX as functions: `renderClassic(data, format)`, `renderVintage(data, format)`, `renderBold(data, format)` — inline styles, flexbox
5. Item photos: apply Cloudinary watermark URL transform on the photo URL, then fetch as data URI for Satori `<img>` src
6. XP gate: check `user.guildXp` against theme threshold before rendering. Return 403 `{ error: 'xp_required', threshold: N }` for locked themes
7. Auth: require session JWT — use existing auth middleware pattern
8. Sale data: fetch from backend API using session token (no direct DB from frontend API route)
9. TS check before returning: `cd packages/frontend && npx tsc --noEmit --skipLibCheck`

## XP Thresholds

| Theme | XP Required |
|-------|-------------|
| Classic | 0 (free) |
| Vintage | 500 |
| Bold | 1,500 |
| Branded | 2,500 (also requires Brand Kit fields set) |
| Photo Full-Bleed | 1,000 |
| Haul collage | 500 |

Unlocks are permanent per user — spend once, use forever.

## MVP Recommendation

Ship Classic + Bold first (free + paid flagship). Vintage and complex themes (Newsprint Classified, Treasure Map, Polaroid Stack) in a follow-up iteration after the infrastructure is proven.
