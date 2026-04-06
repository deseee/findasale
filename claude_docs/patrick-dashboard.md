# Patrick's Dashboard — April 6, 2026

---

## What Happened This Session (S404)

Big build session. Treasure Trails + Explorer's Guild went from design docs to working code.

**What shipped:**
- **Treasure Trails** — full backend + frontend in one shot. Schema (6 models), migration SQL, Google Places API service, 11 trail endpoints, trail discovery page, trail detail + check-in page, organizer trail builder, nav links added.
- **Explorer's Guild master spec** — single 403-line reference doc combining all locked XP decisions, schema plan, API contracts, and implementation order.
- **Feedback survey triggers** — 9 of 10 wired (OG-3 mark-sold deferred). Surveys now fire after: publish sale, 10th item, POS checkout, settings save, Stripe checkout success, favorite, bid, haul post, follow.
- **Chrome QA sweep** — deferred to S405 per your request.

**You need to run the migration** before Treasure Trails will work in production (see push block below).

**You need to add a Google Places API key** before the "Search Nearby" stop-search feature works. Without it, the app gracefully falls back to manual stop entry — so trails still work, just no Place search.

---

## Push Block (S404 — run now)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/database/prisma/schema.prisma
git add "packages/database/prisma/migrations/20260406_add_treasure_trails/migration.sql"
git add packages/backend/src/lib/placesService.ts
git add packages/backend/src/controllers/trailController.ts
git add packages/backend/src/routes/trails.ts
git add packages/frontend/components/TrailCard.tsx
git add "packages/frontend/pages/trails/index.tsx"
git add "packages/frontend/pages/trails/[trailId].tsx"
git add "packages/frontend/pages/organizer/trails/[saleId].tsx"
git add packages/frontend/components/AvatarDropdown.tsx
git add packages/frontend/components/Layout.tsx
git add "packages/frontend/pages/organizer/edit-sale/[id].tsx"
git add "packages/frontend/pages/organizer/add-items/[saleId].tsx"
git add packages/frontend/pages/organizer/pos.tsx
git add packages/frontend/pages/organizer/settings.tsx
git add packages/frontend/pages/shopper/checkout-success.tsx
git add "packages/frontend/pages/items/[id].tsx"
git add packages/frontend/pages/shopper/haul-posts/create.tsx
git add packages/frontend/components/FollowOrganizerButton.tsx
git add "claude_docs/specs/explorers-guild-master-spec.md"
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S404: Treasure Trails + Explorer's Guild build + feedback survey triggers"
.\push.ps1
```

**Then run the migration:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

## Action Items for Patrick

- [ ] **Run push block + migration above**
- [ ] **Create Google Places API key** — console.cloud.google.com → Maps Platform → Enable Places API → Create key → Set $200/mo billing cap → Add to Railway env as `GOOGLE_PLACES_API_KEY` (trails work without it, but "Search Nearby" stops won't find places)
- [ ] **Run S399 migration** if not already done — FeedbackSuppression table (required for feedback surveys to work)
- [ ] **Encyclopedia rename decision** — "Resale Encyclopedia," "Secondhand Encyclopedia," or keep "Estate Sale Encyclopedia" for SEO? Dev blocked until decided.
- [ ] **Trademark call** — File for FindA.Sale? ~$250–$400 per class.
- [ ] **Set Railway env var:** `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831`
- [ ] **Stripe seat product** — $20/mo team member seat needs a Stripe product created
- [ ] **eBay production credentials** — When ready for real eBay data, get production creds from developer.ebay.com and swap Railway env vars + two API URLs back to `api.ebay.com`

---

## Next Session (S405) — Chrome QA Sweep

S405 is all QA. Sessions S396–S404 have stacked up without browser verification. Priority: smoke test the most important features first — POS full walkthrough, Treasure Trails discovery + check-in, dashboard, review card, camera flow.

*Updated S404 — 2026-04-06*
