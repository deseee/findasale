# Next Session Resume Prompt
*Written: 2026-03-06 (Session 76 wrap)*
*Session ended: normally*

## Resume From

GitHub sync is **COMPLETE**. All source files are on `main` (commit `a0bee7f`). Next work is CA7 (human documentation) or CD2 Phase 2 feature items — pick one on Patrick's signal.

---

## GitHub Sync Status

✅ **COMPLETE as of 2026-03-06.** All ~200 source files pushed. Last commit: `a0bee7f`.

---

## Workflow Rule (Effective Session 75)

MCP push (`mcp__github__push_files`) is limited to **≤5 files AND ≤25,000 tokens total** per session wrap.
Bulk pushes are always done manually by Patrick from PowerShell. CLAUDE.md Section 5 updated.

---

## What Was Completed Session 76

- Fixed all TypeScript errors in `packages/frontend/pages/sales/[id].tsx` (20 errors → 0)
  - Added missing `selectedCategory` state + `formatPrice` helper
  - Fixed `SaleShareButton` (added `saleDate`), `BadgeDisplay` (badges fallback `|| []`)
  - Fixed `getThumbnailUrl` 2-arg calls → 1-arg
  - Fixed `SaleMap` old API → `singlePin` pattern
  - Fixed `ReviewsSection` missing `mode="sale"` (both instances)
  - Fixed `setLightboxIndex` → `setCurrentPhotoIndex` + `setLightboxOpen`
  - Fixed `CheckoutModal` `item` → `itemId`/`itemTitle`
  - Fixed `CSVImportModal` `onComplete` → `onImportComplete`, added `isOpen` prop
  - Fixed `PhotoLightbox` `currentIndex` → `initialIndex`, removed unknown `onNavigate`
- Updated CLAUDE.md Section 5 to add 25,000 token limit rule for MCP pushes

---

## Next Claude Sprint (5 items — pick order with Patrick)

1. **CA7** — Organizer guide, shopper FAQ, Zapier webhook API docs, in-app help tooltips (2 sessions, sync with Patrick before beta launch)
2. **CD2-P2a: QR Codes** — Scannable QR codes linking physical sale signage to digital inventory (low effort, high organizer value)
3. **CD2-P2b: Live Drop Events** — Countdown reveals of premium items with FOMO push notifications (DB migration already staged)
4. **CB4** — AI tagging quality tuning: measure organizer acceptance rate, prompt engineering for Haiku, feedback loop for rejected suggestions
5. **CB5** — Legacy cleanup: remove `TAGGER_URL`/`TAGGER_API_KEY` env refs, Gradio UI remnants, unused FastAPI code

---

## Pending Manual Actions (Patrick)

- **P1:** `support@finda.sale` email forwarding not yet configured. Business cards: use PNGs in `claude_docs/brand/` (Vistaprint-ready). Google Business Profile creation.
- **P2:** Google Voice support line, Google Search Console verification.
- **P4:** Identify 5 beta organizers + schedule onboarding sessions (CA7 must be done first).
- **P5:** OAuth credentials → Vercel env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`. Configure redirect URIs → `https://finda.sale/api/auth/callback/{google,facebook}`.
- **Railway migrations:** Verify 4 pending migrations ran (Live Drop, Treasure Hunt, Reverse Auction, StripeEvent). Check Railway deploy logs or run `prisma migrate deploy` via Railway CLI.

---

## Environment Notes

Native dev stack (no Docker for core). Beta target: March 12–19, 2026.
