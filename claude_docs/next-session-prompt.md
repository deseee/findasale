# Next Session Resume Prompt
*Written: 2026-03-10T21:50:00Z*
*Session ended: normally — session 131 complete*

---

## Resume From
AI branding audit: replace all overt references to "Google", "Claude", "Anthropic", "Gemini", "Ollama" in user-facing copy with generic "AI" or "our AI". Functional references (Google Maps links, Google OAuth buttons) stay as-is.

## AI Branding Audit — Full Scope

### User-Facing Copy (MUST change)

1. **`packages/frontend/pages/faq.tsx` line ~189**
   - Current: "our AI (Google Vision + Claude Haiku) analyzes the image and suggests..."
   - Target: "our AI analyzes the image and suggests..."

2. **`packages/frontend/pages/privacy.tsx` line ~51**
   - Current: "We may pass uploaded images through an AI tagging service (Google Cloud Vision and/or Claude)..."
   - Target: "We may pass uploaded images through an AI tagging service to generate suggested item descriptions..."

3. **`packages/frontend/pages/privacy.tsx` lines ~106-108**
   - Current: "Google Cloud / Anthropic: If AI tagging is enabled, item photos may be sent to Google Cloud Vision or Anthropic's API..."
   - Target: "AI Services: If AI tagging is enabled, item photos may be sent to third-party AI services for label generation. No personally identifiable information is included in these requests."

4. **`packages/backend/src/controllers/routeController.ts`** (error message)
   - Current: "Route planning is temporarily unavailable. Open in Google Maps to plan manually."
   - Decision needed: This references Google Maps as a functional tool (user clicks a link to Google Maps). Probably fine to keep. Review in context.

### Functional References (KEEP as-is)
- **login.tsx / register.tsx**: "Google" OAuth button — this IS Google sign-in, correct to name it
- **LocationMap.tsx / RouteBuilder.tsx**: Google Maps links for directions — functional, not branding
- **guide.tsx / faq.tsx**: "Google Sheets" via Zapier integration — third-party tool name, not our AI branding
- **`_document.tsx`**: Google Fonts CDN — infrastructure, invisible to users

### Backend Comments (LOW priority, nice-to-have)
- `batchAnalyzeController.ts` lines 37-38: "Google Vision + Claude Haiku (or Ollama fallback)"
- `uploadController.ts` line 133: "Cloud AI (Google Vision + Claude Haiku) with Ollama fallback"
- `itemController.ts`: Multiple comments referencing "Google Vision + Claude Haiku"
- These are developer-only comments, not user-visible. Clean up if touching those files anyway.

## What Was Completed (Session 131)
- Print inventory 500 error fixed (embedding excluded from getItemsBySaleId) — commit 10c66a5
- Per-sale insights filter + dropdown — commit 3cfc1ad
- Both verified live in Chrome (print inventory shows all 43 items; insights dropdown filters correctly)
- Full AI branding audit scoped (this document)

## Lower Priority Carry-Forward
- Camera tab "coming soon" regression on add-items/[saleId].tsx
- BUG-3: `/organizer/items` route 404 (Manage Holds removed as interim)
- Schema drift: `tags String[] @default([])` — no migration yet
- `quantity` field: frontend accepts it, schema lacks column
- "Collectibles" duplicate in insights category breakdown (seed data capitalization)

## Session 131 GitHub Commits
1. `3cfc1ad` — fix: per-sale insights filter + salesList for dropdown
2. `10c66a5` — fix: exclude embedding from getItemsBySaleId — fixes 500 on print inventory
