# Next Session Resume Prompt
*Written: 2026-03-15T17:30:00Z*
*Session ended: normally*

## Resume From
Production is clean. Start Sprint 2 work: Cloudinary watermark utility, exportController.ts,
promote.tsx UI. No schema changes. Reference: `claude_docs/feature-notes/listing-factory-spec.md`
(Sprint 2 section).

---

## Sprint 2 Scope (Starting This Session)

No schema changes. All work is feature implementation + new controllers.

**Deliverables:**
1. **Cloudinary watermark utility** — overlay FindA.Sale logo + organizer brandLogoUrl (if set) on item photos. Shared util function exported to both backend (export service) and frontend (preview on promote.tsx).
2. **exportController.ts** (new) — three export formats:
   - **estateSalesNet:** CSV format (verify 3-column spec beforehand)
   - **facebookMarketplace:** JSON format with photo URLs + description + price
   - **craigslist:** Plain text format (title | description | price | contact)
3. **promote.tsx** (new page) — upload photos (or use review.tsx drafts), add title/desc/price, select curated tags, pick condition grade, preview with watermark, choose export format(s), copy to clipboard or download.

**Reference files:**
- `claude_docs/feature-notes/listing-factory-spec.md` — full Sprint 2 spec with acceptance criteria
- `packages/database/prisma/schema.prisma` — confirm brandLogoUrl field on Organizer (added S166)
- `packages/backend/src/services/cloudAIService.ts` — existing Haiku integration pattern

**MCP Safety:** Use CORE.md v4.1 push rules — read before push, truncation gate, complete instruction blocks.

---

## What Was Completed This Session (167)

- Diagnosed S166 MCP truncations: `schema.prisma` + `itemController.ts` both incomplete
- Restored full itemController (939 lines, 13 exports) and pushed (commit 1409a51)
- Applied Neon migrations (now 82/82) + Railway redeploy
- CORE.md v4.1 locked: 4 new MCP safety rules
- Production status: ✓ Railway ✓ Vercel ✓ Neon

---

## Environment Notes

- Railway: ✓ healthy (commit bc38ade deployed)
- Vercel: ✓ healthy
- Neon: ✓ 82 migrations applied
- Local schema in sync with GitHub main
- CORE.md v4.1 active (MCP truncation guard + instruction rules)

---

## Exact Context

Files changed in session 167 (all pushed to GitHub main):
- `claude_docs/CORE.md` — MCP push rules (commits 5b1d88d, 1f22506)
- `packages/backend/Dockerfile.production` — redeploy trigger (commit bc38ade)
- `packages/backend/src/controllers/itemController.ts` — full 939-line restore (commit 1409a51)

Session 166 artifacts (for reference):
- `claude_docs/feature-notes/listing-factory-spec.md` — 3-sprint plan
- Sprint 1 complete: CURATED_TAGS, listingHealthScore, cloudAIService, review.tsx
- Schema: Item.conditionGrade + Organizer brand kit (both on Neon now)

## Open Items (Non-Blocking, Carry Forward)
- **P2:** Item thumbnail images on Review & Publish page break on reload (Cloudinary URLs fail on subsequent navigation) — may intersect with Sprint 2 watermark work
- **Schema tech debt:** `aiConfidence Float @default(0.5)` should be `Float?`
- **Brand Voice session** — recommended before Listing Factory ships to marketplace
- **QA note from #24:** Pre-existing ownership gap in `updateHold` — low risk but should be tightened eventually
