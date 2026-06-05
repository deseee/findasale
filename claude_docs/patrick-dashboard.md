# Patrick's Dashboard — S875 Wrap

---

## S875 Summary — QA Mode: Records pass + Column-gap fixes + Chrome QA (5 features)

**Records pass (S874 PCVs → roadmap):**
- ✅ #168, #171, #150 — Chr/Human columns updated to S874 evidence
- ✅ YMAL row removed from Blocked Queue (closed S874)
- ✅ #170 CSV Import: clarified as modal on /organizer/add-items/[saleId] — no standalone page. Roadmap updated.

**Column-gap Records pass (prior sessions):**
- ✅ #257 Scout Hold Duration → Claude QA ✅ S785
- ✅ #261 Treasure Hunt XP Rank Multiplier → Claude QA ✅ S791
- ✅ #323 PriceBenchmark Valuation Fallback → Claude QA ✅ S791
- ✅ #338 Surface Sold-Price Comps → UI column ✅ S820

**Chrome QA (5 features verified, staged as PCVs for S876):**
- ✅ **#152 Organizer Digest Emails** — /organizer/email-digest-preview: "Weekly Email Digest", schedule, email preview with personalized data, CTAs. (ss_83116boe8 ss_3822u3wv2 ss_2864i4lf6)
- ✅ **#334 Automatic Markdown Cycles** — /organizer/markdown-cycles: page loads, Add Cycle button, no 403. (ss_8645vaq0f)
- ✅ **#318 Affiliate Program** — /organizer/affiliate: page + Generate Affiliate Link CTA, no 403. (ss_7743cytqb)
- ✅ **#338 Surface Sold-Price Comps** — edit-item: 3 EbayCompTiles ($17.99/$120/$29.39), affiliate note. ⚠️P3: no "Based on N sources" text. (ss_965075bc7 ss_17240sk5m)
- ✅ **#321 Encyclopedia Auto-Generation** — /admin/encyclopedia: 57 Awaiting/20 Published/77 Total, Promote/Reject buttons. (ss_0109ezo8y)

**Additional QA results (seeded test data):**
- ⬜→✅ **Seeded data** — Created PUBLISHED ESTATE sale + price=null Pyrex item on Alice's account via psycopg2.
- ✅ **#232 SalePulseWidget** — DOM: "Sale Pulse / 0 shoppers / 0/100 / Views/Saves/Questions / Boost visibility →" ⚠️ No screenshot IDs (Chrome extension screenshot tool broken this session).
- ✅ **#237 Sale-Type Adaptive Dashboard** — DOM: all ESTATE widgets present (Real-Time Metrics, Sale Progress, Who's Coming, High-Value Items, Efficiency Coach, Search Visibility). ⚠️ No screenshot IDs.
- DB-ONLY **#320 Async eBay Comp** — DB proof: 10 ItemCompLookup entries, 7 items with aiSuggestedPrice (Old Radio: org=$80 / ai=$65, organizer price wins per D-005). Chrome flow blocked by CSRF — not ✅ yet.
- ⬜ **#316** — qa256test806 password unknown

---

## Code shipped this session

None — QA mode only.

---

## Your Actions

1. **Email Verification migration** — `npx prisma migrate deploy` against Railway (Migration 20260515180000 undeployed since S726).
2. **eBay OAuth for user1** — /organizer/settings/ebay → connect eBay → unlocks all eBay cross-listing QA.
3. **#332 Shopify dev store** — create free Shopify Partners dev store, connect via OAuth.
4. **OAuth QA** — log in as user2, click "Sign in with Google", complete Google OAuth as artifactmi@gmail.com, verify you're logged in as Artifact (not Bob). Clears Blocked Queue item.
5. **Rarity Boost intent** — XP-only at 50 XP, or restore $0.15 cash rail?
6. **GBP phone verification** — business.google.com → "Verify now" → phone code.
7. **Create active sale on user1 (Alice)** — needed to test #232 SalePulseWidget + #237 Sale-Type Adaptive Dashboard next session.

---

## Blocked Queue: 8 active items (QA MODE — ≥8 ceiling)

| Priority | Feature | Blocked By |
|----------|---------|-----------|
| P0 (72 sess) | #332 Shopify Cross-Listing | Shopify dev store needed |
| P0 (135 sess) | Email Verification Migration | Patrick: run migrate deploy |
| P0 (76 sess) | eBay Connection for user1 | Patrick: OAuth connect |
| P2 | OAuth session supersede | Patrick: real Google OAuth test |
| P2 | AuctionNinja scraper | Cloudflare ASN block (needs Railway cron) |
| P3 | Rarity Boost spec gap | Patrick: confirm XP-only or cash rail |
| P3 | #230 Smart Buyer Widget | Patrick: publish sale on user1 |
| P3 | #192 Price History | Data-dependent (need price history records) |
