# Patrick's Dashboard — S675 Wrap

---

## ⚠️ Action Required — Deploy Migration First, Then Push

### Step 1 — Deploy the Sale indexes migration to Railway
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

### Step 2 — Push all S675 changes
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/database/prisma/schema.prisma
git add packages/database/prisma/migrations/20260507000004_sale_feed_indexes/migration.sql
git add packages/backend/src/controllers/internalEnrichmentController.ts
git add packages/backend/src/services/scraper/enrichment.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "perf: Sale feed indexes + enrichment @example.com guard

- Add 4 missing Sale indexes: [status,endDate], [city,status,endDate], [status,startDate], [sourceUrl]
- Fix Sentry P0 slow query (1391-1656ms) on public sale feed
- Block enrichment backfill from overwriting @example.com seed accounts
- Guard in both internalEnrichmentController (query filter) and enrichment.ts (bail-out)"
.\push.ps1
```

---

## Current State

| Area | Status |
|------|--------|
| Google OAuth | ⚠️ Still broken (S673–S674 architecture shipped, Patrick confirmed still failing at wrap S673) |
| Login (email/password) | ✅ Working |
| Homepage feed | ✅ Fixed S674 |
| Sale DB query performance | ✅ Fixed S675 (pending migration deploy) |
| user11 test data | ✅ Reset manually |
| Enrichment guard | ✅ Shipped S675 |
| Vercel build | ✅ Green |
| Railway backend | ✅ Green |

## Outstanding Audit Items (from S669)
- ❌ P0: Item pages missing Product JSON-LD structured data
- ❌ P0: SaleCard above-fold images using `loading="lazy"` (LCP hit)
- ❌ P1: PWA offline.html missing (sw.js pre-caches it but file doesn't exist)
- ❌ P1: City pages silently noindex when empty
- ❌ P1: Email CAN-SPAM gaps + "estate sale" banned term in 5 templates
- ❌ P1: Unsubscribe links expose email as URL parameter (PII leak)
