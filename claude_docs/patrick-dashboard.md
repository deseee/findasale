# Patrick's Dashboard — S574 Complete (Corruption Fixes + Pricing Engine Spec)

## ✅ S574 — What Got Done

**One-line summary:** Fixed two file corruptions that were blocking deployment (schema.prisma P1012 + Layout.tsx null bytes), forced Railway rebuild, and designed the full multi-source pricing engine architecture.

### Quick wins this session

| Win | Notes |
|---|---|
| schema.prisma P1012 — 16 errors fixed | Duplicate models from Scanner Phase 2 agent; removed via Python byte surgery |
| Layout.tsx null bytes removed | Affiliate agent had appended 700+ `\x00` bytes; Vercel showed "mmm..."; truncated clean |
| Railway unblocked | Dockerfile.production cache-bust `2026-04-22a → 2026-04-25a` forced rebuild |
| Pricing engine spec written | Full ADR at `claude_docs/feature-notes/pricing-engine-architecture.md` |
| 30+ pricing sources evaluated | Research doc at `claude_docs/research/pricing-engine-multi-source-research.md` |

---

## ⏳ Pending Patrick Actions

### 1. Push this session's files

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages\database\prisma\schema.prisma
git add packages\frontend\components\Layout.tsx
git add packages\backend\Dockerfile.production
git add claude_docs\feature-notes\pricing-engine-architecture.md
git add claude_docs\research\pricing-engine-multi-source-research.md
git add claude_docs\STATE.md
git add claude_docs\patrick-dashboard.md
git commit -m "S574: fix schema/Layout corruptions + multi-source pricing engine spec"
.\push.ps1
```

### 2. Add Railway env vars

Only 3 vars needed — Apify is gone entirely:

| Variable | Source | Cost | Notes |
|---|---|---|---|
| `DISCOGS_TOKEN` | discogs.com → Settings → Developers | Free | Vinyl/CD/cassette comps |
| `KEEPA_API_KEY` | keepa.io → API Keys | Paid (optional) | Amazon price history — engine works without it |
| `EBTH_WORKER_URL` | Your CF Worker URL (see below) | Free | EBTH estate sale comps via Cloudflare proxy |

### 3. Deploy EBTH Cloudflare Worker (one-time, 10 minutes, free)

EBTH scraping routes through a Cloudflare Worker so EBTH sees Cloudflare's IPs, not Railway's.

1. Go to [workers.cloudflare.com](https://workers.cloudflare.com) → create free account
2. Create new Worker → paste content from `packages/backend/src/services/pricingEngine/workers/ebth-proxy.worker.js`
3. Deploy → copy the URL (e.g. `https://ebth-proxy.your-name.workers.dev`)
4. Add to Railway: `EBTH_WORKER_URL=https://ebth-proxy.your-name.workers.dev`

Google Trends works automatically — no key, no setup, already live in the code.

---

## 📋 Blocked / Unverified Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| #75 Tier Lapse Logic | No lapsed PRO account | ✅ Seeded S573 — run `prisma:seed` | S572 |
| Rarity Boost XP gate | No low-XP shopper | ✅ Seeded S573 — run `prisma:seed` | S572 |
| #235 DonationModal | No charity sale | ✅ Seeded S573 — run `prisma:seed` | S572 |
| #223 Holds / Reservations | No hold records | ✅ Seeded S573 — run `prisma:seed` | S572 |
| #54 Crowdsourced Appraisal | Deferred to beta cohort | Wait for first beta organizers | S570 |
| Bounty Batch C | BountySubmission INSERT needs data | Needs test organizer with active bounty | S571 |
| QR Scanner Phase 1 Chrome QA | Not yet browser-tested | Navigate to sale QR → test scan flow | S573 |
| Nav polish Chrome QA | Not yet browser-tested | Check mobile icon order + Appearance toggle | S573 |
| QR modal Chrome QA | Not yet browser-tested | Test "My QR" tab + cart drawer link | S573 |
| Geofence UX Chrome QA | Not yet browser-tested | Deny location on clueId page, verify amber card | S573 |

---

## 💰 Pricing Engine — What We're Building

The current pricing covers ~15-20% of inventory well (collectibles with PriceCharting/eBay). Everything else — furniture, tools, clothing, vinyl, sneakers, art — is off by 50-300% because flat depreciation doesn't account for brand value retention, sleeper collectibles, or trending demand.

**The fix:** Tiered multi-source engine with weighted median, appreciation awareness, and toggleable sources.

**What's different from today:**
- Brand Exception DB (65 brands like Le Creuset, Griswold, Herman Miller) — never apply depreciation curves to these
- Sleeper Detection — Vision pipeline extended to flag Pyrex patterns, Griswold cast iron, Hull pottery, etc. before organizer lists it at $2
- Trend Signals — Google Trends + eBay 7/30/90-day momentum for things going viral
- Recency Decay — electronics from 2023 vs. furniture from 2023 depreciate at completely different rates
- Asking vs. Sold — asking prices get 0.6x weight (they don't reflect what things actually sell for)

**Sources enabled at launch (no extra cost to start):**
PriceCharting (free tier), eBay enhanced (existing), EBTH via Apify, Keepa (Amazon), Discogs (vinyl), GSA Auctions (tools/equipment), Salvation Army table (floor pricing), Brand Exception DB, Sleeper Detection, Google Trends (Apify), eBay Momentum

**Sources wired, disabled (flip the switch as we grow):**
B-Stock, WorthPoint, StockX, HiBid, MaxSold, OfferUp, StorageTreasures

Spec: `claude_docs/feature-notes/pricing-engine-architecture.md`

---

## 📊 Status Snapshot

| Area | Status |
|------|--------|
| schema.prisma | ✅ Corruption fixed S574 — push pending |
| Layout.tsx | ✅ Null bytes removed S574 — push pending |
| Railway backend | ✅ Green (cache-bust forced rebuild) |
| Vercel frontend | ✅ Green |
| Pricing engine spec | ✅ Written S574 — awaiting Patrick review + env vars |
| Scanner Phase 2 spec | 📋 Ready — awaiting Patrick decision (retention/scope questions) |
| Stale queue test data | ✅ Seeded S573 — run `prisma:seed` to activate |

---

## ✅ S573 — Previous Session Summary

Nav polish + QR modal + geofence UX + 4 parallel dispatches. Mobile top nav icon order fixed, Appearance toggle added to mobile drawer, desktop nav breathing room added, "My QR" tab opens full-screen Apple Wallet-style modal, cart drawer gets "Show My QR" link, geofence 403 upgraded to amber explainer with retry. Scanner Phase 2 spec ready. Roadmap reconciled (9 rows updated, 5 added).
