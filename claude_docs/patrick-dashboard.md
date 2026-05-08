# Patrick's Dashboard — S699 Wrap

---

## Current State

| Area | Status |
|------|--------|
| Vercel build | ✅ GREEN |
| Railway backend | ✅ GREEN |
| Google OAuth | ⚠️ Still broken (root cause unclear) |
| Login (email/password) | ✅ Working |
| MCP Server (mcp.finda.sale) | ✅ LIVE — 7 tools |
| S698 push block | ⚠️ STILL PENDING — push + migration needed |
| 18-state licensing scrapers | ✅ COMPLETE — all corrected S697 |
| Phase 2 scrapers | ✅ AK / NJ / WY / OK built |
| Phase 2 research (blocked states) | 🔴 AZ/DE/ID/IL/KS/MI/MN/MO all city-level or restricted |
| Outreach lead priority | ✅ HOT 40% / WARM 35% / COLD 25% |
| MailerLite tier group wiring | ✅ BUILT — needs 3 Railway env vars + S698 push |
| Email discovery schema | ✅ BUILT — needs S698 push + `prisma migrate deploy` |
| #174 Auction QA | 🟡 Bid fix deployed. Ready to QA. |
| Design brief pipeline | ✅ S699 COMPLETE — 5 briefs + implementation order |

---

## What Happened This Session (S699)

Pure design strategy session — no code changes, all documentation.

Reviewed all 5 Claude Design handoff zip files (the returns from design Sessions 1–5). Synthesized findings, answered design's open questions, and created 5 design brief documents that drive future implementation.

**Files created:**
- `claude_docs/design/storefront-design-reply-v1.md` — answers to all 11 design question categories
- `claude_docs/design/session-2-sale-detail-shopper-onboarding.md` — sale detail page brief (all states + shopper first-run)
- `claude_docs/design/session-3-organizer-sale-creation-wizard.md` — 5-step wizard + item manager + quick-add flow
- `claude_docs/design/session-4-email-design-system.md` — base template + 5 modules + 7 emails
- `claude_docs/design/session-5-smart-queue-broadcast-saletypes.md` — Smart queue, broadcast composer, sale type matrix

**Key design decisions locked this session:**
- Light is the default public tone; dark is organizer-selectable (not a global toggle)
- `aiSuggestedPrice` is always a ghost placeholder — never pre-fill, organizer must type
- No "AI" in any copy — "Smart" or "Auto" only
- DRAFT / PUBLISHED / ENDED are schema values; UPCOMING / LIVE are rendered, never stored
- Storefront identity = Simple / Pro / Teams; BRONZE/SILVER/GOLD = activity reputation tier (different things)
- Subtypes (Moving Sale, Pop-Up, Charity, Storage Auction) are display-layer — no new schema enums
- One dev gap: Online Only toggle was designed in the sale-types canvas but dev must integrate it into wizard Step 2 (not Step 1)

**Implementation priority:**

| Priority | Surface | Why |
|----------|---------|-----|
| 1st | Sale detail page (Session 2) | Highest-traffic page, Google cold traffic lands here |
| 2nd | Sale creation wizard (Session 3) | Activation gate — organizers who finish it are retained |
| 3rd | Email design system (Session 4) | Every user receives these; unlocks broadcast template too |
| 4th | Smart review queue (Session 5 Brief D) | Completes camera pipeline (PENDING_REVIEW state) |
| 5th | Broadcast composer (Session 5 Brief E) | Schema already exists (#356), Pro/Teams monetization |
| 6th | Sale type badge system (Session 5 Brief F) | Display-only, no schema changes |
| 7th | Storefront v0.2 | Light-default flip, not blocking anything |

---

## Patrick Actions Needed

**Step 1 — S699 push (design docs + wrap docs):**
```powershell
git add claude_docs/design/storefront-design-reply-v1.md
git add "claude_docs/design/session-2-sale-detail-shopper-onboarding.md"
git add "claude_docs/design/session-3-organizer-sale-creation-wizard.md"
git add "claude_docs/design/session-4-email-design-system.md"
git add "claude_docs/design/session-5-smart-queue-broadcast-saletypes.md"
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S699: Design brief pipeline — 5 sessions + implementation order"
.\push.ps1
```

**Step 2 — S698 push (still pending from last session — includes auction P0 fixes + scraper phone/website dropout fix):**
```powershell
git add claude_docs/strategy/email-discovery-spec.md
git add packages/backend/src/services/mailerliteService.ts
git add packages/backend/src/jobs/outreachEmailsCron.ts
git add packages/database/prisma/schema.prisma
git add packages/database/prisma/migrations/20260508000002_email_discovery_fields/migration.sql
git add packages/backend/src/services/emailDiscoveryService.ts
git add packages/backend/src/controllers/itemController.ts
git add packages/frontend/pages/items/[id].tsx
git add packages/frontend/components/ReverseAuctionBadge.tsx
git add packages/backend/src/services/scraper/htmlParser.ts
git add packages/backend/src/services/scraper/index.ts
git add packages/backend/src/services/scraper/sources/foursquarePlaces.ts
git add packages/backend/src/services/scraper/sources/herePlaces.ts
git add packages/backend/src/services/scraper/osmScraper.ts
git add claude_docs/strategy/roadmap.md
git commit -m "S698: MailerLite tier wiring, email discovery schema, auction P0 bid fix, reverse auction display, scraper phone/website dropout fix"
.\push.ps1
```

**Step 3 — Run migration (after S698 push lands):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**Step 4 — Add Railway env vars** (Railway dashboard → findasale-backend → Variables):
- `MAILERLITE_COLD_GROUP_ID` — get from MailerLite dashboard → Subscribers → Groups
- `MAILERLITE_WARM_GROUP_ID`
- `MAILERLITE_HOT_GROUP_ID`

**Step 5 — Delete GOOGLE_PLACES_API_KEY** (S695 lockdown — still pending):
- Railway dashboard → findasale-backend → Variables
- GitHub repo → Settings → Secrets → Actions

**Step 6 — QA #174 Auction** (bid fix is deployed):
Login user12@example.com / Seedy2025! → finda.sale/sales/c5hykxxecanngwcrkvq92n1va

---

## Next Session (S700) — Top Priorities

1. **#174 Auction QA** — login user12, bid on Vintage Brass Compass, verify reverse auction price drop
2. **Wire emailDiscoveryJob into cron scheduler** — job is built but not registered; add to jobRunner + `EMAIL_DISCOVERY_ENABLED=true` env var
3. **Illinois Phase 2 scraper** — IDFPR eLicense portal needs manual inspection to confirm if machine-readable
4. **QA #352/#353 settings** — verify tagline/yearFounded persist after S697/S698 push
5. **Design → Dev: sale detail page (Session 2)** — highest-priority implementation handoff
