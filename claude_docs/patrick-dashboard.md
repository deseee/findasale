# Patrick's Dashboard — S575 Complete (Big Build — QA Pass Next)

## ✅ S575 — What Got Done

**One-line summary:** Parallel build session — 9 features shipped, 3 compile errors fixed, 4 migrations deployed. Vercel + Railway green. S576 is all Chrome QA.

### Quick wins this session

| Win | Notes |
|---|---|
| #331 Voice-to-tag thumbnails | Mic button on each rapidfire thumbnail; speech saves description |
| #341 Multi-angle prompt chips | First photo in rapidfire shows Back/Stamp, Damage Detail, Label/Brand, Skip chip row |
| #336 Organizer-intent wins | Rapidfire: typing price/title before AI completes → organizer values not overwritten |
| #339 Refuse-to-fill | Ambiguous photo → brand + category left blank when AI confidence < 0.6 |
| #338 PricingCompSummary | edit-item page: amber "Based on N sources, median $X–$Y" comp tile |
| #228 Settlement payout fix | Payout auto-populates from Commission tab; PDF download button rebuilt |
| Consignor email notifications | sendConsignorItemSold, sendConsignorPayout, sendConsignorExpiryNotice via Resend |
| consignorExpiryNoticeJob | Daily 2AM UTC — emails consignors about items 60–61 days old |
| MarkdownCycle + /organizer/markdown-cycles | PRO-gated auto-markdown management; cron runs daily 3AM UTC |
| Shopify integration + /organizer/shopify | TEAMS-gated; connect your Shopify store, push items, sync sold status |
| Stripe Connect ACH + /organizer/stripe-connect | TEAMS-gated; Express account onboarding + ACH payout button for consignors |
| 3 compile errors fixed | QRScannerModal TDZ, pricingSignalsController wrong import path, shopify.tsx ConfirmDialog wrong props |
| Layout.tsx nav links patched | "Auto Markdown" added to PRO block, "Shopify" added to TEAMS block |
| 4 migrations deployed | add_user_edited_fields, add_markdown_cycles, add_shopify, add_stripe_connect_ach |

---

## ⏳ Pending Patrick Actions

**None.** All 4 migrations ran this session. Vercel and Railway should be green. S576 is a pure QA session — no code, no migrations, no pushes needed before starting.

**Optional (when ready to spend money on better comps):**
- `KEEPA_API_KEY` from keepa.io → API Keys — adds Amazon price history. Engine works fine without it.

---

## 📋 S576 QA Dispatch List (start here next session)

Run these in order — Chrome QA, one at a time.

| # | Feature | Account | URL | What to verify |
|---|---------|---------|-----|----------------|
| 1 | #332 Shopify page | Alice (TEAMS) then Bob (PRO) | /organizer/shopify | TEAMS: page + form render. PRO: upgrade gate shows |
| 2 | #333 Stripe Connect | Alice (TEAMS) then Bob (PRO) | /organizer/stripe-connect | TEAMS: page loads. PRO: gate shows |
| 3 | #334 Markdown Cycles | Bob (PRO) then Carol (SIMPLE) | /organizer/markdown-cycles | PRO: page + form. SIMPLE: PRO gate |
| 4 | #338 PricingCompSummary | Any organizer | /organizer/edit-item/[any] | Amber comp tile "Based on N sources, median $X–$Y" |
| 5 | #228 Settlement | Any organizer with a closed sale | Settlement Wizard | Commission → Receipt: payout auto-populated; Download → .pdf file |
| 6 | #336 Organizer-intent | Any organizer | Rapidfire | Type price BEFORE AI badge → save → organizer value preserved |
| 7 | #339 Refuse-to-fill | Any organizer | Rapidfire | Upload blurry/ambiguous photo → brand + category stay blank |
| 8 | #331 Voice thumbnails | Any organizer | Rapidfire grid | Mic on thumbnail → speak → description saved |
| 9 | #341 Multi-angle chips | Any organizer | Rapidfire | Upload first photo → chip row appears (Back/Stamp, Damage Detail, etc.) |
| 10 | #75 Tier Lapse | tier-lapse-test@example.com | /organizer/dashboard | Lapse banner or downgrade gate triggers |
| 11 | Rarity Boost gate | low-xp-shopper@example.com | /coupons | Rarity Boost button disabled with "not enough XP" |
| 12 | Holds countdown | Karen or test shopper | Any held item | Countdown timer renders, hold expiry behavior works |
| 13 | #235 DonationModal | Any organizer | Charity sale | 3-step wizard opens and flows |
| 14 | Settlement Receipt PDF | Any organizer | /organizer/settlement/[id] | Click Download → .pdf (not .json), shows "Organizer Commission %" |
| 15 | AvatarDropdown guild link | Karen (shopper) | Avatar menu | "Explorer's Guild" → /shopper/guild-primer |
| 16 | S529 storefront widget | Any organizer | /organizer/dashboard | Copy Link + View Storefront buttons present |
| 17 | S529 mobile nav rank | Karen | Mobile hamburger | Rank reads from useXpProfile (not hardcoded "Scout") |

---

## 💰 Pricing Engine — What's Live Now

Phase 1 is deployed. The engine runs on every item publish and surfaces a weighted-median price suggestion from up to 7 concurrent sources.

**Active sources (zero extra cost):**
- PriceCharting — collectibles, games, toys
- eBay enhanced — existing 4-tier fallback chain
- Discogs — vinyl, CD, cassette, all audio formats
- EBTH — estate sale comps via Vercel proxy (Railway → Vercel → EBTH)
- GSA Auctions — tools, equipment, government surplus
- Google Trends — trend signal multiplier (0.85–1.35x, 24h cache)
- Salvation Army table — floor pricing fallback

**Optional (add key to unlock):**
- Keepa — Amazon price history (`KEEPA_API_KEY`)

**Wired but disabled (toggle when ready):**
B-Stock, WorthPoint, StockX, HiBid, MaxSold, OfferUp, StorageTreasures

**Resilience:** Soft circuit breaker trips at 3 consecutive failures per source — source auto-disables, cron re-enables at 4AM UTC. `Promise.allSettled` means one dead source never crashes the batch.

---

## 📊 Status Snapshot

| Area | Status |
|------|--------|
| Railway backend | ✅ Green |
| Vercel frontend | ✅ Green (3 compile errors fixed S575) |
| schema.prisma | ✅ Clean — all 4 S575 migrations deployed |
| Pricing engine Phase 1 | ✅ Live |
| Pricing engine Phase 2 UI | 📋 Deferred — sleeper + brand premium banners |
| Shopify integration | ✅ Built S575 — Chrome QA pending |
| Stripe Connect ACH | ✅ Built S575 — Chrome QA pending |
| Auto Markdown cycles | ✅ Built S575 — Chrome QA pending |
| Test data (seed accounts) | ✅ Seeded S575 — all 4 accounts live in Railway |

---

## ✅ S574 — Previous Session Summary

Fixed two file corruptions (schema.prisma 16-error P1012, Layout.tsx null bytes). Built and deployed pricing engine Phase 1: 10 new backend files, 6 Prisma models, weighted median, soft circuit breaker, 7 active sources. Apify replaced with free google-trends-api + Vercel proxy for EBTH. Migration deployed, env vars set, Railway green.
