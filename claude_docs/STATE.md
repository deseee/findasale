# FindA.Sale — STATE.md
Last updated: 2026-04-20 | Session: S522

---

## Current Work

### S522 — Share & Promote Full Redesign

**Status:** Specced and architecturally decided. Ready for dev dispatch.

Four spec files produced in S522:
- `claude_docs/ux-spotchecks/share-promote-redesign-brief-S522.md` — full single-page layout (no modal), "Launch Your Sale" concept
- `claude_docs/ux-spotchecks/share-promote-template-research-S522.md` — platform-correct text templates + XP tier system + critical template bugs
- `claude_docs/ux-spotchecks/share-promote-visual-brief-S522.md` — 6 visual card themes with ASCII layouts, XP unlock table, Claude Design prompt
- `claude_docs/guides/stripe-card-reader-hardware-guide.md` — new FAQ/support article for POS organizers

**Architect decision (S522):** Share card PNG generation uses **Satori via `/api/og` route** (`packages/frontend/pages/api/share-card.ts`). Cloudinary stays for item photo delivery + existing watermark overlays. html2canvas eliminated. ADR filed in `claude_docs/feature-notes/adr-share-card-image-generation-S522.md`.

**API contract:**
```
GET /api/share-card?saleId=xxx&theme=classic|vintage|bold|branded|photo-fullbleed|haul&format=square|landscape|story|flyer&type=sale|item&itemId=xxx
Response: PNG
```

**XP unlock system (unified — organizers and shoppers share same `guildXp`):**
| Theme | XP Cost |
|-------|---------|
| Classic | 0 (free) |
| Vintage | 500 XP |
| Bold | 1,500 XP |
| Branded | 2,500 XP (requires Brand Kit) |
| Photo Full-Bleed | 1,000 XP |
| Haul collage | 500 XP |
Unlocks are permanent per user. Locked themes return 403 from API with `{ error: 'xp_required', threshold: N }`.

**Claude Design output:** 6 card themes generated and approved by Patrick. Story Bold (dark gradient + huge all-caps) identified as standout. Watermarks confirmed via Cloudinary overlay. Complex themes (Newsprint Classified, Treasure Map) may ship in follow-up iteration after Classic + Bold MVP.

**Critical template bugs to fix (in SharePromoteModal.tsx):**
- Threads: `${sale.title} items` renders as literal "items" text bug
- Neighborhood Post: `**bold**` markdown renders as literal asterisks on Facebook
- Missing `finda.sale` links on Nextdoor, Instagram, Threads, Neighborhood templates
- Facebook: 7+ hashtags (reduce to 3-5)
- TikTok: 6+ hashtags (reduce to 3-5)

**Key constraint:** `guildXp` is on the User model — organizers and shoppers are the same users. Do NOT scope XP separately by role.

---

## Project Status (as of S522)

### Core Platform
- Sale creation/management: ✅ live
- Item management + photo upload: ✅ live
- AI photo tagging (Google Vision → Claude Haiku): ✅ live
- Organizer dashboard: ✅ live
- Shopper browsing + favorites: ✅ live
- Stripe Connect payments: ✅ live
- Explorer's Guild XP system: ✅ live
- Shop Mode (TEAMS tier): ✅ built, QA partially complete
- POS / Mark Sold flow: ✅ built

### Share & Promote (current state)
- Current page: `/organizer/promote/[saleId]` — 4 export cards + SharePromoteModal (9-tab modal)
- S520 patched the modal (added Nextdoor card, fixed time bug, added Spotlight tab)
- **S522 redesign spec complete** — single-page "Launch Your Sale" layout, no modal, visual card download
- **Pending dev work:** page rewrite + share card API route

### QA Backlog (S520/S518 carry-forwards)
**S520 items not yet Chrome-verified:**
- Shop Mode toggle (TEAMS organizer)
- Create-sale shop path
- Storefront "Always Open" display

**S518 carry-forwards:**
- PostSaleMomentumCard revenue display
- Legendary chip dismissal
- Efficiency Coach label ("Top 0%" — P3 cosmetic)
- Workspace chat tabs

---

## Blocked/Unverified Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| Shop Mode toggle | Chrome QA not completed | TEAMS organizer login, toggle Shop Mode on/off, verify storefront behavior | S521 |
| Create-sale shop path | Chrome QA not completed | Navigate create-sale flow as TEAMS organizer, verify shop tab appears | S521 |
| Storefront Always Open display | Chrome QA not completed | Visit storefront page, verify Always Open badge/state | S521 |
| PostSaleMomentumCard revenue | Chrome QA not completed | Check dashboard post-sale state, verify revenue figure | S518 |
| Legendary chip dismissal | Chrome QA not completed | Reach Legendary rank or simulate, verify chip dismiss behavior | S518 |
| Workspace chat tabs | Chrome QA not completed | Open workspace, check chat tab behavior | S518 |

---

## Stack (key decisions)

- Frontend: Next.js 14 Pages Router on Vercel
- Backend: Express on Railway (`backend-production-153c9.up.railway.app`)
- DB: Railway PostgreSQL (migrated from Neon S264) — connection: `maglev.proxy.rlwy.net:13949/railway`
- Images: Cloudinary (locked)
- AI: Google Vision → Claude Haiku (`cloudAIService.ts`)
- Payments: Stripe Connect Express
- XP: `guildXp Int @default(0)` on User model (shared organizers + shoppers)
- Brand Kit fields on organizer: `brandLogoUrl`, `brandPrimaryColor`, `brandSecondaryColor`, `brandFontFamily`, `brandBannerImageUrl`, `brandAccentColor`
- **Share cards: Satori via `/api/og` route (decided S522)**
- Push: Patrick uses `.\push.ps1` from PowerShell (NOT `git push`)
- DB migrations: `prisma migrate deploy` with Railway conn string override (NOT `prisma db push`)

---

## Recent Sessions

### S522 — Share & Promote Redesign + Visual Card Templates (2026-04-20)
- Wrote Stripe card reader hardware FAQ (`claude_docs/guides/stripe-card-reader-hardware-guide.md`)
- Identified S520 "overhaul" was a modal patch, not the full redesign originally specced
- Commissioned and completed full Share & Promote redesign spec (single page, no modal)
- Researched platform-correct text templates; found 5 critical template bugs
- Designed XP-based visual card system: 6 themes (Classic/Vintage/Bold/Branded/Photo Full-Bleed/Haul)
- Patrick used Claude Design → produced 6 theme variants, approved all; Story Bold is standout
- Clarified: organizers + shoppers share unified `guildXp` — no role split
- Architect decided: Satori (`@vercel/og`) for card PNG generation; Cloudinary stays for photos + watermarks
- STATE.md was placeholder (S521 merge conflict residue) — rewritten this session

### S521 — Migration Recovery + Push (2026-04-19)
- Resolved S521 merge conflicts
- Successfully pushed to main

### S520 — Share & Promote Modal Patch (2026-04-19)
- Added Nextdoor card to promote page
- Fixed time display bug
- Added Spotlight tab to SharePromoteModal
- Reordered modal tabs
- NOTE: This was a patch, NOT the full redesign — redesign spec written in S522

### S519 (prior)
- See session-log-archive.md for older history

---

## Next Session

### Patrick Action Items
None blocking — architect decision made, STATE.md written. Dev can be dispatched.

### Immediate Dev Dispatch (S523)
**Priority 1 — Share & Promote page rewrite:**
Dispatch `findasale-dev` with:
- Brief: `claude_docs/ux-spotchecks/share-promote-redesign-brief-S522.md`
- Visual brief: `claude_docs/ux-spotchecks/share-promote-visual-brief-S522.md`
- Template research: `claude_docs/ux-spotchecks/share-promote-template-research-S522.md`
- Architect handoff: ADR above (Satori for cards, API contract defined)
- File to rewrite: `packages/frontend/pages/organizer/promote/[saleId].tsx`
- New file to create: `packages/frontend/pages/api/share-card.ts`
- Deprecate (do not delete): `packages/frontend/components/SharePromoteModal.tsx`
- Fix template bugs from research doc while touching the modal code

**Priority 2 — QA backlog:**
After dev returns, Chrome QA the Blocked/Unverified Queue items above.

### ADR to file
Save the Satori ADR to `claude_docs/feature-notes/adr-share-card-image-generation-S522.md` (main session or dev can do this).

### Context Notes
- STATE.md was a placeholder for S521+S522 — now current
- `guildXp` is unified — never scope by organizer vs shopper role
- Cloudinary watermarks on item photos are URL transforms — already working, don't change
- Patrick pushes via `.\push.ps1` only
