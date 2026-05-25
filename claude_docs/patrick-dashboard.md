# Patrick's Dashboard — Week of May 24, 2026 (Updated S785 — Full Wrap)

---

## What Needs Your Attention Now

1. **Push S783 + S784 + S784b** — combined push block in STATE.md § Next Session (still pending)
2. **Push S785 wrap docs + rank fix + roadmap** — push block in STATE.md § Next Session
3. **Update Global CLAUDE.md password** — Ctrl+H find-and-replace with current Railway DB password
4. **Submit sitemap to Bing Webmaster Tools** — `https://www.bing.com/webmasters` → Add sitemap → `https://finda.sale/server-sitemap.xml`
5. **Investigate 3 missing schema features** — #323 (Item.valuationMethod), #332 (ShopifyConnection), #334 (MarkdownRule) all claim shipped but tables don't exist in DB

---

## What Happened This Week

**S785 (QA Batches 1+2+3 — all 3 groups run):**

Batch 1 — XP/Guild (8 verified, 2 UNVERIFIED):
- ✅ #267 RSVP XP — 2 XP awarded on RSVP, SaleRSVP row created, notification confirmed.
- ✅ #255 Rank-Up Notifications — Maya ranked up to SCOUT at 503 XP; RANK_UP notification in DB.
- ✅ #257 Scout Hold Duration — holdDurationMinutes=45 confirmed, countdown shows 00:44:57.
- ✅ #227 XP Profile API — /api/xp/profile returns 5 correct fields.
- ✅ #290 Hunt Pass Dual-Rail Cash Column — $ value + XP cost shown side-by-side.
- ✅ #289 Shopper Coupon Generation — Standard tier coupon generated, 100 XP deducted.
- ✅ #312 XP Economy Security Hardening — leaderboard API has no PII (no userId/email).
- ✅ #349 In-App QR Scanner Phase 1 — button in header, modal opens with camera request.
- ✅ **Rank permanence bug fixed** — Leo went SCOUT→INITIATE after spending 100 XP. Fix shipped: rank now uses lifetime XP for thresholds and only ratchets up, never drops on spend.
- UNVERIFIED: #261 Treasure Hunt multiplier (needs retest now that rank fix shipped), RSVP monthly cap.

Batch 2 — Camera/Photo pipeline (all 6 UNVERIFIED):
- #319, #336, #339, #340, #328, #325 — all blocked by photo upload issue in VM. The `upload_image` tool requires an imageId we can't get without a prior screenshot; programmatic upload crashed the AI pipeline. Schema columns (photoRole, orderIndex) confirmed to exist — just no photos to test against.

Batch 3 — eBay features (2 verified via DB, rest UNVERIFIED):
- ✅ #320 Async eBay Comp Fetch — 6 items confirmed with aiSuggestedPrice from async background fetch.
- ✅ #321 Encyclopedia Auto-Generation — 57 AUTO_GENERATED entries + haiku_inferred price benchmarks confirmed in DB.
- UNVERIFIED (no eBay connection for test user): #244, #293, #295, #298.
- UNVERIFIED (schema gaps): #323 (Item.valuationMethod missing), #332 (ShopifyConnection table missing), #334 (MarkdownRule table missing) — these say "shipped" in the roadmap but the tables don't exist in production DB. Needs investigation.
- UNVERIFIED (no test data): #333 (no consignors), #335 (no consignors with email).

**S784b (QA batch — 9 items Chrome-verified):**
- ✅ #352 Organizer tagline, #354 Business Hours, #356 Broadcasts, #359 Pin Sale, #360 Social Links
- ✅ #60 Pricing page ($29 PRO, $79 TEAMS), #260 One-big-sale upgrade, #263 PRO TOOLS dropdown, #271 TEAMS webhooks/API table

**S784 (Audit Fixes):**
- Fixed `/map` zero pins and `/categories` display (200+ icons + name overrides).

**S783 (SEO Sprint):**
- Sitemap: 1,727 → 1,885 URLs. IndexNow live (fires on every publish). Schema.org confirmed.

**S782–S780 (Email + Deliverability):**
- Deliverability fixed (custom domain, MIME, CORS, DMARC upgraded). Outreach opens page at `/admin/outreach-opens`.

---

## Outreach Pipeline

| Metric | Value |
|--------|-------|
| Queue | ~3,319 PENDING |
| Sent (total) | 29 since fix |
| Opens | Active — check `/admin/outreach-opens` |
| HOT leads with email | ~5,517 addressable |
| WARM leads with email | ~208 addressable |

---

## SEO Status

| Signal | Status |
|--------|--------|
| Sitemap | ✅ 1,885 URLs, auto-grows as items published |
| IndexNow | ✅ Live — fires on every sale publish |
| Schema.org (items) | ✅ Product schema implemented |
| Schema.org (sales) | ✅ JSON-LD implemented |
| Schema.org (guides) | ✅ HowTo/Article implemented |
| Bing sitemap submission | ⏳ Patrick action needed |
| Google Search Console | ⏳ Verify submitted |

---

## Audit Alerts (Weekly — 2026-05-23)

✅ All 4 findings resolved. Map, categories, privacy, calendar — all fixed or confirmed clean.
