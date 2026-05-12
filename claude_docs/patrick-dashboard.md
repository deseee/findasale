# Patrick's Dashboard — S717 Wrap

---

## What Happened This Session

eBay price research panel on the Smart Review Queue fully fixed. Plus backend was crash-looping on startup — fixed that too.

**Fixed this session:**
- Backend crash loop — ebayController.ts was cut off mid-line, Railway kept restarting every 30s — restored
- eBay price comps were pulling cheap accessories ($11 adapters) for a Zoom B3 — switched sort to bestMatch
- Added smart title cleaning so "Zoom B3 Multi-Effects Processor, Rec, Model B3" searches as "Zoom B3 Multi-Effects Processor" instead of the full noisy title
- Found that the Growth Check you filed in April was submitted from your personal eBay seller account (artifactmi@gmail.com / artifactcoinsandcollectibles) not the FindA.Sale dev account — draft reply ready for you to send

---

## Push Now

```powershell
git add packages/backend/src/controllers/ebayController.ts
git add packages/frontend/pages/organizer/brand-kit.tsx
git add packages/frontend/components/SettlementWizard.tsx
git add packages/frontend/pages/organizer/settings.tsx
git add packages/backend/src/routes/organizers.ts
git add packages/frontend/pages/organizer/pos.tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix: eBay price comps — truncation crash, bestMatch sort, cleanTitle query trimming"
.\push.ps1
```

---

## Action Required — eBay Growth Check Reply

Reply to **Incident: 260428-000018** from artifactmi@gmail.com. Use the reply format in the original email (paste below the marker line):

> Hello eBay Developer Support,
>
> Following up on this Application Growth Check request — I wanted to provide a correction and an addendum.
>
> **Correction — App ID clarification:** The application described in this request (FindA.Sale) is running under a different developer account than the one used to file this ticket. The production keyset being used is:
> - **App ID:** PatrickD-FindAVal-PRD-064c158e4-8fa09c76
> - **Developer account:** deseee1 (deseee@yahoo.com)
>
> This ticket was inadvertently filed from a secondary developer account (artifactmi@gmail.com). Please associate this Growth Check review with the correct App ID above.
>
> **Addendum — Finding API access request:** In addition to the Browse API rate limit increase, we are also requesting access to the Finding API's `findCompletedItems` operation for the production keyset. We use completed/sold listing data to provide organizers with accurate price comparables. The Browse API returns active listings only, which is less accurate for pricing purposes.
>
> Our App ID, use case, and application URL (https://finda.sale) remain as described in the original submission.
>
> Thank you, Patrick Desmond / FindA.Sale

---

## After Push — Re-verify These 3 (S716 fixes)

1. **Brand Kit PDFs** — /organizer/brand-kit → click any of the 4 PDF download buttons
2. **Settlement Receipt** — /organizer/settlement/qa-settlement-001 → Download Receipt
3. **Charity Close** — ENDED sale with AVAILABLE items → Settlement → Donate Items

---

## Carry-Forward Patrick Actions

**P0 — Leaderboard scouts empty until you run this migration:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
```

**Railway env — confirm both set:**
- `OUTREACH_ENABLED` = `true`
- `OUTREACH_WARMUP_START_DATE` = `2026-05-06`

---

## Decisions Needed

- **AuctionNinja + NAA scrapers** — built and off. Turn them on? (set `enabled:true` in sourceRegistry)
- **MT scraper 401** — Railway → backend Variables → copy `INTERNAL_API_KEY` value → GitHub Secrets → `INTERNAL_API_TOKEN` → update → re-run Montana workflow

---

## Infrastructure Status

| | |
|---|---|
| Vercel (frontend) | ✅ Green |
| Railway (backend) | ✅ Green (crash loop fixed S717) |
| eBay price comps | ✅ Working — Browse API, bestMatch sort |
| eBay Finding API | ⏳ Pending Growth Check approval |
| Outreach emails | ✅ Live — warmup active |
| Leaderboard scouts | 🔴 Empty until migration deployed |
| Montana scraper | ❌ 401 — secret mismatch (Patrick fix above) |
| MN/MI/TN scrapers | 🟡 Bot-blocked — needs headless proxy |
| AuctionZip / Canada411 | ⛔ Disabled — dead sources |
