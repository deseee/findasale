# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**S978 DEV COMPLETE — Suggest price P2 safety guard + ShippingNetPreview FVF copy clarification shipped.**

**S977 VERIFIED LIVE:**
- Sentry: 5 cron stampede issues RESOLVED (FINDASALE-NODEJS-38/-2N/-2Z/-2S/-3D gone). FINDASALE-NODEJS-33 graceEndAt index fired last time 2:00 AM today (pre-fix run); tomorrow's 2:05 run should be clean. FINDASALE-NODEJS-10 (Sale SELECT 3342ms, 55 events since May 6) = pre-existing unrelated issue, added to BQ.
- eBay Danner pump re-push as artifactmi: HTTP 200 ✅, "Item listed on eBay" toast ✅, ebayNeedsReview=False ✅, eBay offer status=PUBLISHED ✅, fulfillmentPolicyId=316596123011 ("FindA.Sale Flat $32.00") ✅ — S975 smart flat-rate engine confirmed end-to-end in production.
- ShippingNetPreview renders: "Buyer pays for shipping ~$20.38 USPS Ground Advantage, est." + "Your estimated net $145.59" + breakdown link ✅
- Suggest price fires and returns a value ✅ — ⚠️ P2 bug: returns "$6.22 for 30% net ($1.87)" on a $175 item (calculates from cost basis, not list price; "Use this price" would catastrophically drop price — needs dev fix before organizers notice).

**S975 WRAP — eBay listing pipeline overhaul (massive session). All backend tsc-verified; key paths verified live on the Danner pump.**

DONE + VERIFIED LIVE:
- Smart bounded FVF flat-rate shipping engine (cheapest of USPS/UPS/FedEx → farthest-CONUS coverage zone → FVF gross-up → bounded reusable bucket ladder; no calc fallback). Pump lists at FindA.Sale Flat $32.00.
- packageType fix (strip MAILING_BOX on flat-rate routing — eBay err 25101/216305).
- Domain-aware eBay category resolver (no depth-sort, title+AI domain match, persist+show name) + single-source EBAY_L1_CATEGORIES. Pump now in Pet Supplies › Pumps (Air) 100351 (was Bait Buckets).
- AI accuracy pass: Vintage/Antique + era only with evidence; decade allowed-but-not-forced; accuracy-over-richness. Verified: pump re-analysis dropped Vintage/1980s.
- PushSync GET-merge-PUT (real SKU) + dead Logistics call removed.
- On-demand /api/internal/reanalyze-item (secret-protected, dry-run+apply) — used live to verify the accuracy fix.
- Product enrichment cascade (productEnrichment.ts): barcode→UPC (free), Open Library, Open Food Facts, eBay Catalog (dormant—403 until Buy-API grant), Go-UPC (paid, env-gated OFF), AI estimate. Confidence-gated apply; visible-UPC read with hard no-fabrication rule. Comps now model-token-enforced (fixes AP-4/AP-100 + skewed price).
- Live-edit propagation: republish offer after inventory sync so title/desc/condition edits reach the live listing (PushSync + reanalyze). Proven via direct eBay PUT+publish.
- Accept-suggestion UI: getItemById returns catalogSuggestions; CatalogSuggestionPanel renders low-confidence enrichment with one-click accept on edit-item page.

KEY FINDINGS: eBay Catalog API + Browse get_item = 403 (app lacks Buy-API access — Patrick applied for it; enrichment lights up automatically on grant). eBay locks PRIMARY CATEGORY on active listings → category changes need end+relist (title/condition update in place fine).

## Next Session
- ⚠️ FRONTEND NOT TSC-VERIFIED (VM node_modules corrupt): EbayCategoryPicker prefill, CatalogSuggestionPanel, edit-item panel render. Verify in a real build / Chrome before trusting.
- When eBay Buy-API grant lands: ebayCatalog provider activates automatically — verify it returns identifiers/dims; consider adding get_product/{epid} for fuller aspects.
- Optional: Go-UPC paid provider is wired but OFF (set GOUPC_API_KEY to enable; cache makes it ~once-per-product).
- Chrome QA: verify CatalogSuggestionPanel renders + accept fills fields; verify live title-edit propagation end to end as an organizer.
- Frontend "tie-it-together" UX polish for enrichment suggestions if desired.

**S975 LIVE-LISTING EDIT PROPAGATION FIXED — backend-tsc clean, push pending:** Patrick: customers WILL want to edit live titles — must propagate. Root cause (proven via direct eBay API: PUT inventory_item new title + POST offer/publish → 200, live title updated): the sync updated the eBay inventory item but NEVER republished the offer, so edits never reached the live listing. eBay only reflects changes to shoppers after a republish. FIX: added `republishEbayOffer` + `syncListedItemFieldsToEbay` helpers (itemController) — GET offer (real SKU) → GET-merge-PUT inventory → republish; non-fatal, 25402 business-policy warning treated as success. Wired republish into PushSync (after price+inventory PUTs, gated on pushedFields>0 && ebayOfferId). /reanalyze-item now syncs+republishes title/desc/condition on apply for listed items (category drift detected+reported, NOT pushed — eBay locks primary category on active listings → needs end+relist); response adds ebaySynced/ebaySyncReason/ebayCategoryLocked. Files: itemController.ts, internal.ts. Backend tsc 0 errors. (Pump's live title already corrected manually via direct PUT during diagnosis — listing now fully correct: "Danner Manufacturing AP-40 Air Pump, Aquarium" / Pet Supplies 100351 / $32 flat.)

**S975 PRODUCT ENRICHMENT CASCADE — built (Architect ADR-enrichment-cascade-2026-06-14), backend-tsc clean, needs DDL + push, then pump test:** Provider-cascade `enrichItem(item, ctx)` in new productEnrichment.ts — runs free-first, first-non-null-per-field, cached by identifier, NEVER throws. Providers: localBarcode (decoded UPC/EAN, no API, conf 1.0) → openLibrary (ISBN, free, live-verified) → openFoodFacts (grocery UPC → brand + product_quantity g→oz, free, live-verified) → ebayCatalog (wraps enrichItemFromCatalog; null on current 403, lights up on Buy-API grant) → goUpc (PAID, env-gated OFF via GOUPC_API_KEY) → aiEstimate (dims fallback). NO GS1. Apply rule (planEnrichmentApply): auto-apply when source∈{barcode,openLibrary,openFoodFacts,ebayCatalog,goUpc} OR conf≥0.85, EMPTY fields only (organizer wins), dims only if !packageConfirmedByOrganizer; else → catalogSuggestions. Haiku one-pass now reads visible UPC + HARD no-fabrication rule (never invent a UPC/dims from memory). Decoded barcode stored straight onto upc/ean (no API). Wired into batchAnalyze + processRapidDraft + /reanalyze-item. Reuses Item.catalogSuggestions column (needs the DDL run). Comps model-token filter + AI model capture from prior build intact. Files: productEnrichment.ts(new), cloudAIService.ts, batchAnalyzeController.ts, processRapidDraft.ts, internal.ts (+ prior catalog-enrichment: schema.prisma, ebayCatalogLookup.ts, ebayController.ts). Backend tsc 0 errors. NEXT: run catalogSuggestions DDL on Railway → push all → re-analyze pump w/apply to test full chain (Vintage gone, Pet Supplies cat, model-enforced comps, enrichment). Frontend Accept-suggestion UI = follow-up.

**S975 CATALOG-ENRICHMENT FEATURE — backend built (Architect-spec'd ADR-catalog-enrichment-2026-06-14), backend-tsc clean, NEEDS schema DDL + push, then pump test:** Confidence-gated product enrichment: barcode→catalog (full incl dims) or brand+model→eBay Catalog (epid+matched title; searchCatalogProduct returns only epid/title/brand — NO mpn/upc/dims, so dims still come from barcode path or AI estimate). HIGH (≥0.85) auto-fills EMPTY identifier fields + dims (only if !packageConfirmedByOrganizer); below-0.85 → Item.catalogSuggestions Json (one-click accept, edit UI follow-up). Comps now enforce a model token (query + post-filter) → fixes AP-4/AP-100 noise + skewed price. AI prompt now captures a visible model/part number → mpn (evidence-only). Wired into batchAnalyze, processRapidDraft, /reanalyze-item. NEW additive column Item.catalogSuggestions Json? (Railway build runs prisma generate → client learns it on deploy). Files: schema.prisma, cloudAIService.ts, ebayCatalogLookup.ts, ebayController.ts, batchAnalyzeController.ts, processRapidDraft.ts, internal.ts. Backend tsc 0 errors. NEXT: run DDL (ADD COLUMN catalogSuggestions JSONB) on Railway → push code → then re-analyze pump with apply to test full chain. Frontend "Accept suggestion" UI = follow-up (frontend tsc unverifiable in VM).

**S975 ON-DEMAND RE-ANALYZE CAPABILITY (admin/internal) — built, backend-tsc clean, push pending:** Patrick wants Claude/admin to be able to re-analyze an existing item on demand (no user-facing button needed). Built `POST /api/internal/reanalyze-item` (requireSecret, header x-internal-secret === OUTREACH_SECRET; not CSRF/user-auth so Claude can call it directly). Body `{itemId, apply?}`. Downloads up to 5 item photos → analyzeItemImages (the deployed FIXED multi-image prompt) → re-resolves eBay category via suggestEbayCategoryForTitle → returns {before, after}; apply=true writes title/description/category/condition/conditionGrade/tags + ebayCategoryId/Name (NEVER price — organizer pricing wins). File: routes/internal.ts (+ imports axios, analyzeItemImages, suggestEbayCategoryForTitle). TS 0 errors. NEXT: deploy → Claude calls dry-run on the pump (cmqbb252i000i60qq7eilco9z) to show before/after (verify Vintage drops), then apply + fresh eBay push. Needs OUTREACH_SECRET value to call.

**S975 — BUG/AUDIT (2026-06-13, Opus). Verified-not-trusted review of the "Begin 973 autonomously" Sonnet run (logged S973+S974). Conclusion: the eBay system is HEALTHY; the panic was self-inflicted.**
- **Root cause of the whole mess FOUND (tool-cited):** Sonnet added the `sell.logistics` OAuth scope (commit c412281a) → eBay rejected with `invalid_scope` → the artifactmi eBay connection broke → Sonnet told Patrick to disconnect/reconnect. Scope was then removed (commit 52e73d80, verified absent from current scope list ebayController.ts L1421-1424). The reconnect — not any policy problem — is what spawned all the confusion.
- **"Policies weren't synced" = FALSE (verified via live eBay API).** GET /sell/account/v1/fulfillment_policy with artifactmi's live token (valid till 03:00 UTC) → 23 policies. ALL 14 weightTierMappings IDs, calc default 295011801011, media-mail 295438565011, local-pickup 297301122011 are present + valid. EbayPolicyMapping created 2026-04-15 (Patrick's own config). Disconnect/reconnect does not delete eBay business policies — they belong to the account, not the OAuth token.
- **Production is healthy:** Railway backend `{"status":"ok"}`; OAuth scopes clean; NO junk "FindA.Sale Flat $X.XX" policies have been created on the real account yet.
- **Danner pump (cmqbb252i000i60qq7eilco9z):** offer 186196728011 PUBLISHED on eBay (137411858004) with calc policy 295011801011 applied (correct for an 11lb item). BUT in our DB brand=NULL, mpn=NULL (S971's claim that Danner/AP-40 were set is stale/false), category=179986 "Other Fish & Aquarium Supplies" (the catch-all S971 meant to avoid), ebayNeedsReview=true. A clean re-push wants brand=Danner/mpn=AP-40 set + a leaf category.
- **Shipped code judged individually:** KEEP — brand/mpn/upc added to getItemById select (itemController L533-535, verified present); ShippingNetPreview wired into edit-item (L36/L1457, verified); err:216314 packageType-strip-on-calculated guard; FVF flat-rate service (Option B — Patrick explicitly wanted this). DEAD-BUT-HARMLESS — Logistics-API live-rate path (scope removed, always falls back to the rate table). Nothing needs reverting.
- **STATE/doc accuracy issues from the Sonnet run (now corrected):** claimed commit 11cfb344 = 3 files incl. new ebayFlatRatePolicyService.ts — actually 1 file (ebayCalculatedPolicyService.ts, −74 lines, removing the mistaken $1.50 Option-A handling fee); claimed pump brand/mpn set — actually null; flagged tier-IDs as "unknown source / routing may be broken" — false. BQ: 2 → 2 (both rows reworded to reflect verified-healthy reality; no real blocker remains, only optional Chrome re-test).

**S975 PROPER E2E QA (Chrome, logged in as Artifact MI — real account, real pushes):**
- **New edit-item features all render ✅:** Brand/MPN/UPC fields (ss_2026bnuy5); Shipping Dimensions pre-fill Box(standard)/176oz/12×9×7 (ss_8586m0neb); ShippingNetPreview "Buyer pays ~$20.38 / net $145.59" (ss_8578c0h7p); Suggest-price 20/30/40% margin buttons (ss_8578c0h7p). 
- **Butter Knife (4oz) re-push ✅ E2E:** eBay offer 186848465011 PUBLISHED, fulfillmentPolicyId=295437504011 "4oz Ground Advantage $6.65", categoryId=20099 Flatware (correct leaf), ebayNeedsReview=false. FLAT_TIERS weight-tier routing correct (verified via live eBay Inventory API).
- **Danner pump (176oz) re-push ❌ BLOCKED → REAL BUG FOUND + FIXED:** push returned the SHIPPING_TIER_GAP toast (ss_75467502z), ebayNeedsReview set true. Root cause proven via live eBay API (POST fulfillment_policy → HTTP 400 errorId 20403 / LSAS 216018 **UNKNOWN_SHIPPING_SERVICE_CODE: USPSGroundAdvantage**): `ebayFlatRatePolicyService.ts` builds the FVF flat-rate policy with `shippingServiceCode:'USPSGroundAdvantage'` (carrier-specific, CALCULATED-only) — eBay rejects it for FLAT_RATE → ensureFvfFlatRatePolicy returns null → gap guard falls through to the block. This is the SAME bad code S974 already fixed in the sibling calculated service but missed here. **FIX APPLIED S975:** USPSGroundAdvantage/USPS → ShippingMethodStandard/GENERIC (the exact code the organizer's own working flat-rate tier policies use — e.g. 295437504011). Backend TS 0 errors. Needs deploy + pump re-push to confirm it publishes at ~$23.59 with a "FindA.Sale Flat $23.59" policy.
- **Minor UI gaps (non-blocking):** (1) Category field renders empty on edit-item load though DB has ebayCategoryId 179986 — pre-fill needs ebayCategoryName which is null. (2) Butter Knife shipping preview shows "Could not estimate shipping right now" (no package dims). 
- **No junk policies created on the eBay account** (the diagnostic POST 400'd, nothing persisted).
- **Files changed S975:** packages/backend/src/services/ebayFlatRatePolicyService.ts (fix), claude_docs/STATE.md, claude_docs/patrick-dashboard.md.

**S975 SMART FLAT-RATE ENGINE BUILT (Patrick-approved design, ADR-smart-flat-rate-shipping-engine-2026-06-14):**
- Multi-carrier cheapest-rate (USPS/UPS/FedEx Ground, per-carrier dim divisor) priced at the organizer's FARTHEST-CONUS coverage zone (per-origin, from geocoded lat/lng or ZIP fallback), FVF gross-up (÷0.864), rounded UP into a bounded reusable bucket ladder ($0.50/$1/$2.50/$5 steps). Never falls back to eBay calculated (removed). Block-for-details when weight/dims missing.
- Numeric check: 11lb pump (zone 7) → cheapest USPS $26.99 → gross $31.24 → bucket **$32.00** (vs old $75 catch-all). Light 4oz → USPS wins. Bucket ladder rounds up + stays bounded.
- Files: ebayRateEstimateService.ts (+182 lines: UPS/FedEx tables, coverageZoneForOrigin, estimateCheapestRate, computeCheapestForOrigin, CARRIER_TABLES + effectiveDate/source consts), ebayFlatRatePolicyService.ts (cheapest-carrier + roundUpToBucket rewire), ebayController.ts (calc fallback removed → SHIPPING_POLICY_UNAVAILABLE soft-block).
- **VERIFIED:** full backend tsc (typescript 5.9.3 from pnpm store) = 0 errors. NOTE: the workspace `npx tsc` is broken (Cannot find module ../lib/tsc.js) → it silently "passes" without checking. Always run tsc via `node node_modules/.pnpm/typescript@*/node_modules/typescript/lib/tsc.js` for a real check.
- ⚠️ **UPS/FedEx rate NUMBERS are best-available ESTIMATES** (flagged in-code with the S975 verify comment) — replace with Patrick's Pirate Ship UPS/FedEx rate card. USPS table is the real Pirate Ship data. Structure/logic are correct regardless.
- ⚠️ **SUBAGENT WRITE TRUNCATION (recurring):** the findasale-dev dispatch silently truncated ebayRateEstimateService.ts (→107 lines, mid-array) and ebayFlatRatePolicyService.ts (→189 lines, mid-statement) while reporting success. Caught via line-count/tail verification; both restored from HEAD and rebuilt via verified bash writes in the main session. Reinforces: never trust subagent Write without wc -l + tail + real tsc.
- **Rate-staleness mechanism:** monthly Cowork scheduled task created to flag when carrier rate tables age past reprice windows (Patrick requirement).
- **PUSH BLOCK (6 files):** ebayRateEstimateService.ts, ebayFlatRatePolicyService.ts, ebayController.ts, ADR doc, STATE.md, patrick-dashboard.md. After deploy: re-push Danner pump to confirm it publishes at the bucketed flat rate (no SHIPPING_TIER_GAP block).

**S975 POST-DEPLOY VERIFICATION + packageType bug (cache-bust deploy):**
- Engine deploy was stuck — Railway served pre-fix code despite "green" (the green deploy was an OLD commit; 611cf463/b679d89d builds weren't live). Forced redeploy via Dockerfile.production cache-bust (line 2 date bump). After that, ENGINE CONFIRMED LIVE.
- **ENGINE VERIFIED ✅ (live):** re-pushing the pump made the app create "FindA.Sale Flat $32.00" policy (id 316596123011) on the real eBay account — exact predicted bucket (USPS z7 via ZIP 49079 → FVF gross-up → $1 ladder). Smart flat-rate engine works end-to-end in production. (Also a manual test policy "FindA.Sale Flat $35.00" id 316580545011 exists — UNUSED orphan from a diagnostic create; safe to delete on eBay.)
- **NEW BUG FOUND + FIXED — packageType MAILING_BOX (err 25101 / 216305 MailingBoxes):** pump push then failed at inventory-item create with "Failed to create inventory item: 400". Real eBay error pulled by replaying the PUT directly: errorId 25101 "Invalid <ShippingPackage>" / err:216305|MailingBoxes — eBay rejects packageType MAILING_BOX for an ~11lb / 12×9×7 parcel (too big for a mailing box). Replaying the PUT WITHOUT packageType → HTTP 200. Root cause: the packageType strip (ebayController.ts L2225) only fired for routingReason 'calculated-default'; the new flat-rate paths (fvf-flat / tier-gap-fvf-flat) didn't strip it → MAILING_BOX reached eBay. This is exactly why the pump "listed fine yesterday" (calculated path, stripped) but failed today (flat-rate path). FIX: broadened the strip to calculated* + fvf-flat* + tier-gap-fvf-flat* routing reasons. Real tsc 0 errors.
- NOTE: during the diagnostic replay I PUT the live pump inventory item without packageType (200), so its inventory item is currently valid; a fresh app push (post-deploy) will apply the $32 policy + republish + clear ebayNeedsReview.
- **PUSH BLOCK (this fix): packages/backend/src/controllers/ebayController.ts** (+ STATE.md, patrick-dashboard.md). After deploy: final pump re-push → expect publish at $32 flat, ebayNeedsReview cleared.

**S975 CATEGORY RESOLVER FIX (domain-aware) — built, backend-tsc clean, pending deploy+test:**
- Root cause of the pump listing in "Bait Buckets" (eBay cat 179986, under Sporting Goods›Fishing): the PUSH resolver suggestEbayCategoryForTitle re-sorted eBay's category suggestions DEEPEST-FIRST and picked the most specific leaf — eBay returns bait-bucket aerator categories for "Air Pump/Aerator", so depth-sort promoted Bait Buckets over the correct aquarium category. The S971 catch-all skip compounded it. NOT the camera (the blank Category field = push path saved id only, no name). Confirmed via eBay UI breadcrumb + code read.
- FIX (ADR-ebay-category-resolver-domain-aware-2026-06-14): removed depth re-sort; added ebayTopLevelForDomain map (aquarium/aerator/pet→Pet Supplies, +14 domains); suggestEbayCategoryForTitle now domain-aware — prefers candidates whose ancestor path matches the domain, in eBay relevance order, skipping catch-alls. Domain detected from AI category hint AND TITLE (the pump's AI category was wrongly "Electronics"; title "Aquarium Aerator" carries the real signal). All push save-sites now persist ebayCategoryName; both camera + push paths share the resolver; edit-item picker shows the saved name. Backend tsc 0 errors (typescript@5.9.3 from pnpm store; workspace npx tsc is broken). Frontend EbayCategoryPicker.tsx = 1-line useEffect dep add — not tsc-verified (frontend node_modules corrupted in VM), trivial/error-neutral.
- Files: ebayController.ts, batchAnalyzeController.ts, EbayCategoryPicker.tsx, ADR doc.
- TEST PLAN (post-deploy, Patrick-approved "fix it for real"): clear pump cmqbb252i000i60qq7eilco9z ebayCategoryId/Name → null, re-push as artifactmi → expect a Pet Supplies aquarium category (NOT Bait Buckets), $32 flat policy intact, name shown in edit UI.
- FOLLOW-UP (separate): AI category misclassification (air pump → "Electronics") is a cloudAIService accuracy issue, not fixed here; resolver now tolerates it via title-based domain detection.

**S975 AI CATEGORY ACCURACY FIX (cloudAIService prompt) — built, backend-tsc clean:** Root cause of "Electronics" for an aquarium pump: the AI category enum (cloudAIService L184 + L748, single + multi-image prompts) was a too-small generic list (Furniture, Electronics, Clothing, Books, Kitchenware, Tools, Art, Jewelry, Toys, Sports, Collectibles, Glassware, Linens, Other) with NO Pet Supplies / aquarium option — so a powered device got forced into "Electronics". FIX: expanded both enums to 24 domains aligned with eBay L1 + the resolver's ebayTopLevelForDomain map (added Pet Supplies, Consumer Electronics, Musical Instruments, Health & Beauty, Baby & Kids, Automotive, Home & Garden, Pottery & Ceramics, Crafts, Office Supplies, Shoes, etc.), and added a USE/DOMAIN instruction: "categorize by what the item is FOR, not its materials or whether it plugs in (an aquarium air pump is Pet Supplies, not Electronics)". Affects new analyses only (doesn't re-run the photo flow on existing items). Backend tsc 0 errors. File: cloudAIService.ts. 

**S975 PushSync + Logistics fixes + Vintage root cause (from Patrick's Railway logs):**
- Logs CONFIRMED category fix works live: `[eBay Taxonomy] hint="Electronics" → 100351 (Pumps (Air)) [domain-matched]` + `[eBay Offer] stale category detected ... had=179986 want=100351 — deleting + recreating`.
- **PushSync 400 FIXED:** background price/title sync (itemController ~L1360) was sending PARTIAL bodies to eBay PUT (=full replace) + the BARE SKU `FAS-${id}` → HTTP 400 (silently failing all inline edits). Fix: GET-merge-PUT — GET the full offer (real SKU from offer.sku), merge price, PUT full; GET the full inventory item, merge title/desc/condition (preserving imageUrls/aspects/packageWeightAndSize), PUT full. Non-fatal path preserved.
- **Dead Logistics call DELETED:** getEbayLiveShippingRate (always 400 errorId 2004, fell back to rate table) + its 2 call sites removed; estimateBuyerShippingRate used directly. grep getEbayLiveShippingRate = 0.
- **Vintage root cause:** stored title ("...Aquarium Aerator, Vintage") + tags ['Vintage','1980s'] are STALE from the pre-fix analysis. Grep confirms NOTHING re-applies them (no re-analysis on push/edit/sync). The AI accuracy fix is forward-only; the pump's stored fields are untouched. Proper fix = re-analyze the pump's photos (would clear Vintage AND verify the fixed prompt). NOT a manual title edit.
- Backend tsc 0 errors. Files: itemController.ts, ebayController.ts.

**S975 ✅ CATEGORY FIX FULLY VERIFIED LIVE (root cause = active-listing category lock):** The earlier "taxonomy returns nothing" finding was a MISREAD — taxonomy/token/proxy/deploy all proven healthy (Logistics 400 in Railway logs confirmed the app token authenticates; external replays of the exact ?action=token→taxonomy chain returned 8 suggestions incl. 100351 Pumps Air). The real reason re-push left category null: **eBay does not allow changing the PRIMARY category of an already-live listing**, so the resolver's pick was rejected and rolled back (25005-class). FIX/TEST (Patrick-approved): withdrew offer 186196728011 (ended listing 137411858004) → re-pushed fresh. Result: NEW listing, ebayCategoryId=100351 "Pumps (Air)" (Pet Supplies › Fish & Aquariums), ebayCategoryName saved, shipping policy 316596123011 "FindA.Sale Flat $32.00" intact, needsReview=false. Domain-aware resolver + L1 single-source CONFIRMED WORKING in production. (NOTE: existing pump TITLE still contains "Vintage" — forward-only AI accuracy fix doesn't retroactively edit it; manual title edit or re-analysis needed to drop it.)

**S975 ⚠️ PROD ISSUE FOUND — eBay Taxonomy API returns no category candidates:** Pump category test (resolver deployed via 74bd6c17+bec179c7, green): cleared pump cmqbb252i000i60qq7eilco9z ebayCategoryId/Name → null, re-pushed TWICE. Both times republished clean ($32 policy 316596123011 intact, needsReview=false) but ebayCategoryId stayed NULL and offer stayed in 179986 (Bait Buckets). Code path confirmed (ebayController L2155 calls suggestEbayCategoryForTitle when categoryId null), so suggestEbayCategoryForTitle returned null → getEbayCategoryCandidates → get_category_suggestions returned 0 candidates → resolver can't categorize ANYTHING (not just the pump). Depends on eBay APP token (EBAY_CLIENT_ID/SECRET in Railway, not seller OAuth). Likely cause: app token expired/rotated/rate-limited/misconfigured; recent redeploys cleared the in-memory token cache and exposed it. NEEDS: Railway backend log line `[eBay] EBAY_CLIENT_ID or EBAY_CLIENT_SECRET not configured` OR `[eBay Taxonomy] getCategorySuggestions <status>` to pinpoint. The resolver CODE is verified correct — blocked on the taxonomy API/app-token being live. (Decade prompt instruction loosened per Patrick: era allowed with reasonable evidence, not forced; Vintage stays evidence-required.)

**S975 AI ACCURACY PASS (prompt over-labeling) — backend-tsc clean:** Patrick: "why listed Vintage? it's not old." Root cause: cloudAIService prompt (both single+multi-image, L188/L752) said `Always include "Vintage" or "Antique" when applicable` + title guideline `Include decade if identifiable` — no evidence requirement, so a worn modern pump got tagged Vintage/1980s. Same pattern as the category bug (prompt pushes a confident guess). FIX (3 edits ×2 prompts): (1) added "Accuracy over richness: only state attributes you can SEE/verify; when unsure, omit rather than guess"; (2) era/decade only from datable marks/manufacture date/period styling, never guess from wear; (3) Vintage(~20yr)/Antique(~100yr) only with real evidence of age, omit when unclear. Forward-only (affects new analyses, not the existing pump's saved title). Backend tsc 0 errors. File: cloudAIService.ts. Push pending.

**S975 SINGLE-SOURCE eBay L1 CATEGORIES (clean refactor) — backend-tsc clean:** Patrick's "why a few fixed categories anyway?" → item.category is documented (schema.prisma:1026) as an eBay L1 name powering shopper browse pages (/categories/[x]), city pages, and wishlist matching, so a constrained list is correct — but the list had DRIFTED into a small generic set missing whole domains. FIX: new shared module packages/backend/src/config/ebayCategories.ts exports EBAY_L1_CATEGORIES (28 canonical eBay US L1 names) + domainToL1(text) (exact-L1-match → keyword map → []). Both the AI prompt (cloudAIService, 2 prompts now interpolate the constant) and the resolver (ebayController ebayTopLevelForDomain → domainToL1) read from it — they can no longer drift. item.category is now a true eBay L1 name. Backend tsc 0 errors.

**S975 FINAL ✅ FULLY VERIFIED (live, post-packageType-fix deploy):** Danner pump re-push → toast "Item listed on eBay" (ss_4305vnsyw); DB ebayNeedsReview=FALSE; eBay offer 186196728011 PUBLISHED with fulfillmentPolicyId 316596123011 = "FindA.Sale Flat $32.00". Full chain verified end-to-end: smart engine (cheapest carrier → coverage zone → FVF gross-up → bounded bucket) + packageType strip on flat-rate path. Butter Knife ($6.65 tier) also ✅. eBay shipping system DONE.

**S974 — BUG/DEV (2026-06-13). eBay FVF-inclusive flat-rate shipping fix. 3 files shipped (commit 11cfb344). CODE-ONLY — Railway deployed, Chrome verify pending.**
- **Shipping dimensions pre-fill ✅:** Package Type=Box(standard), Weight=176oz, L=12, W=9, H=7 all pre-populated on edit-item page. ss_0277k2jba
- **Weight-tier gap-overshoot toast ✅:** Warning fired during FLAT_TIERS push (176oz hits $75 FedEx tier — actionable message shown to user).
- **eBay item specifics ✅:** Brand=Danner, MPN=AP-40 confirmed on live eBay listing 137411858004. ss_1925495922 (prior session evidence)
- **Bug 1 FOUND+FIXED — err:216314 (calculated policy not applying):** MAILING_BOX rejected by eBay LSAS for CALCULATED fulfillment policy. Offer PUT was non-fatal (phantom 200); policy never changed on eBay. Fix: strip packageType from inventory payload when routing.routingReason=calculated-default. ebayController.ts L2131-2138. CODE-ONLY.
- **Bug 2 FOUND+FIXED — Brand/MPN/Category not pre-populating on edit-item:** GET /api/items/:id select block was missing brand/mpn/upc fields. Form showed empty placeholders despite DB having Danner/AP-40. Fix: added brand/mpn/upc to itemController.ts getItemById select (L533-535). CODE-ONLY.
- **Bug 3 FOUND+FIXED — ShippingNetPreview (+ Suggest Price) not wired to edit-item page:** S971 built ShippingNetPreview component with POST /api/ebay/shipping-preview/suggest-price but never imported it into edit-item/[id].tsx. Fix: added import + component render when packageWeightOz is set (L1454-1460). CODE-ONLY.
- **ebayCalculatedPolicyService.ts FIXED:** USPSGroundAdvantage → USPSParcel+USPSPriority (UNKNOWN_SHIPPING_SERVICE_CODE bug). CODE-ONLY.
- **UNVERIFIED (needs re-push after next deploy):** Calculated policy applying on eBay (err:216314 fix), Brand/MPN/Category pre-fill, ShippingNetPreview rendering + Suggest Price, weight-tier gap-overshoot block in CALCULATED mode.
- **Push block provided** — 4 files: ebayController.ts, itemController.ts, edit-item/[id].tsx, ebayCalculatedPolicyService.ts.
- BQ: 2 → 2 (febe1f46 row updated — bugs fixed CODE-ONLY, re-verify still needed post-deploy. #313 unchanged).

**S972 — QA (2026-06-13). Partial Chrome QA of S971 febe1f46 build.**
- **Deploy verification ✅:** febe1f46 GREEN on Railway (health OK, /api/ebay/shipping-preview endpoint responds) and Vercel (READY, dpl_EGnCoYtcosPKTEVt2naetMT5btLL).
- **Brand/MPN/UPC on edit-item ✅:** Navigated /organizer/edit-item/cmq2z2ocg001810t51m6su0bb as user1. Brand "e.g. Danner, Sony, Pyrex — leave blank if unbranded" + eBay required note present. MPN "Manufacturer part #" and UPC "Barcode number" visible. ss_6085zmmkb
- **Shipping mode toggle ✅:** /organizer/settings/ebay shows "Calculated" (Recommended) card selected + "Flat-rate tiers" (Advanced) card. Smart-pick default policy "Smart-pick (weight tier → calculated → flat-rate → free)" set. ss_3600f1du9
- **UNVERIFIED (needs Patrick's real eBay account — artifactmi@gmail.com):** Danner pump re-push through CALCULATED path; ShippingNetPreview component + net/buyer-shipping preview rendering; Suggest-price button; weight-tier gap-overshoot block message. Also: Brand/MPN/UPC on review page (review queue empty on user1/user2 test accounts).
- BQ: 2 (unchanged — febe1f46 partial QA done, remaining items gated on Patrick's real account).

**S971 — DEV/RECORDS (2026-06-13). eBay listing-push fix + calculated-shipping/net-engine build (commit febe1f46).**
- **Trigger:** organizer couldn't push the Danner AP-40 aquarium pump (itemId cmqbb252i000i60qq7eilco9z) to eBay — friendly "Brand is missing" error.
- **Root causes (found by hitting the eBay API directly — evidence-first, not guessed):** (1) eBay needs the Brand+MPN PAIR for many categories — real error was errorId 25002 `<BrandMPN>`, the friendly message was misleading; (2) secondaryCategoryId="1" from SECONDARY_CATEGORY_MAP (vintage/rare/collectible→'1', antique→'20081', handmade→'14339' are all NON-LEAF ROOT categories) → errorId 25005; (3) publishItemOffer used the wrong SKU (bare FAS-{id}); real SKU includes skuAppend segments → broke repair paths; (4) category resolver took eBay's "Other/Misc" catch-all blindly (pump landed in 179986 "Other Fish & Aquarium Supplies"); (5) shipping — 11 lb pump billed $75 because the organizer's weight-tier ladder has a gap (≤111oz/$19.99 then nothing until ≤720oz/$75 FedEx).
- **Listing-push fixes shipped:** Brand→"Unbranded" only when blank; force Brand+MPN aspects on push; publishItemOffer self-heals missing Brand/MPN on 25002; correct SKU via buildCustomLabel in repair paths; secondary-category guard (SECONDARY_CATEGORY_MAP disabled — emitted only invalid root categories); category resolver skips Other/Misc/Everything-Else catch-alls; weight-tier gap-overshoot guard (blocks with an actionable message instead of overcharging); Brand/MPN/UPC inputs added to edit-item + review pages; "Publish to eBay now" saves the form first; drafts API returns brand/mpn/upc.
- **BIG BUILD (commit febe1f46, 13 files) — eBay calculated-shipping default + fee-aware net-proceeds engine + package-estimation + "Suggest price":** new schema models PackageProfile + EbayCategoryFee, +3 Item cols, +3 EbayConnection cols, +2 EbayPolicyMapping cols (migration 20260613190000_ebay_calculated_shipping_net_engine). New services: ebayCalculatedPolicyService, ebayRateEstimateService, ebayNetProceedsService, ebayPackageEstimateService; cloudAIService extended for weight/dim estimation; resolvePoliciesForItem now CALCULATED-default with FLAT_TIERS backfill for existing organizers; new endpoints POST /ebay/shipping-preview + /shipping-preview/suggest-price; frontend ShippingNetPreview component + PostSaleEbayPanel confirm card + settings shipping-mode toggle. Both TS gates 0 errors (orchestrator-verified). **CODE-ONLY — NOT browser-verified.**
- **Locked decisions:** default shipping = CHARGED/calculated (buyer pays); free shipping = organizer opt-in; net engine displays net AND ships Suggest-price (never auto-set); fees = real settled-order data + ~1.25% safety buffer (FEE_SAFETY_BUFFER_PCT), seeded from published rates for now; existing flat-tier organizers preserved. Behavior rule added: CLAUDE.md §10b "Evidence-First Debugging Gate" (gather the real error/state from the live system before proposing/shipping any fix).
- **Pump state:** was published live (listingId 137411387725) via direct eBay API after fixing Brand+MPN+secondary-category, then WITHDRAWN per Patrick. Now reset for a clean re-push — ebayListingId/listedOnEbayAt/ebayCategoryId/ebayCategoryName cleared; brand=Danner, mpn=AP-40 set; offer 186196728011 retained. Ready to re-push through the new calculated path.
- **✅ MIGRATION APPLIED (2026-06-13):** febe1f46 schema migration applied + verified on Railway — PackageProfile (60 rows) + EbayCategoryFee (5 rows) tables present, new columns present, existing organizer backfilled to FLAT_TIERS (verified via DB query). Remaining for this build: Chrome QA only. Stray `packages/database/prisma/_schema_gen.prisma` should be deleted locally if present (never commit).
- BQ: 1 (S970 #313) → 2 (added: febe1f46 build CODE-ONLY — migration APPLIED, Chrome QA pending).

**S970 — QA/RECORDS (2026-06-13). S969 records pass + #219 Chrome re-verify.**
- **Records pass:** applied S969 PCVs to roadmap.md — #164 Tiers Infra (UNVERIFIED S804 → ✅ Claude QA S970), #27b TEAMS watermark toggle (re-confirmed), #317 Geofence QR (both rows: Building backlog inside/outside-radius now ✅, Backlog-P1 row ✅). All had 5-element evidence.
- **#219 Achievements XP framing — CHROME VERIFIED ✅ (S969 fix confirmed live):** logged in as user5 (Leo Thomas, RANGER) via direct /api/auth/login. /api/xp/profile authoritative = guildXp 2065, RANGER→SAGE, nextRankXp 5000. /shopper/achievements now shows ABSOLUTE "2,065 / 5,000 XP to Sage · 2935 XP remaining" (ss_5725naacs) — identical to /shopper/dashboard "Progress to SAGE · 2,065 / 5,000 XP · 2,935 XP to Sage" (ss_32707qytx). Pre-fix band-relative "865/3,800" gone. achievements.tsx now reads useXpProfile (shared cache → identical numbers). Dark mode clean on both. Roadmap #219 → ✅ CHROME VERIFIED S970.
- **CODE-ONLY verification pass (Patrick request) — 7 gamification XP items re-checked against current backend code (tool-cited):** 5 MATCH (#254 HP 1.5x, #278 HP scan +10%/150 cap, #281 STREAK_7DAY_BONUS 100, #314 ORG_SHOPPER_SIGNUP 10, #315 REFERRAL_ORG_FIRST_SALE 50) — stay ⚠️ CODE-ONLY (browser verify needs real Stripe/GPS/multi-acct). 2 DRIFTED: **#268** = doc drift only (code awards tiered 40-80 XP via TRAIL_COMPLETION + TrailCompletion-unique guard, NOT flat-100/hasEarnedTrailBonus as the claim said — roadmap text corrected, code is correct). **#313 = REAL BUG FOUND + FIXED S970** — HAUL_POST_LIKES idempotency guard was non-functional (dedup queried "photoId: <id>" but award stored "...post <id>"), re-awarding 5 XP on every like ≥10 = XP-farm vector. Dev fix: award description now writes "(photoId: <id>)" so guard matches → fires once per post. 1 file (haulPostController.ts), TS clean, idempotency trace confirmed.
- BQ: 1 (#313 fix pending Chrome verify — needs 10 accounts liking, env-blocked). PCV table cleared of all applied rows.

**S969 — QA (2026-06-13). S968 post-deploy smoke + Pending-QA burn-down.**
- **S968 SMOKE OK** — homepage CLS fix LIVE + correct: CityHeat ("Phoenix is heating up") / TreasureHunt / SaleOfDay banners render BELOW the map (no shift); both code-split banners mount; Featured Sales 20/20 + When/Type filter pills render. Organizer pages (dashboard / settings / add-items / POS) + public sale detail all render CLEAN post the app-wide `_app.tsx` ssr:false code-split — no broken overlays. Only console error across all pages = wallet browser-extension conflict (MetaMask/evmAsk inpage.js), NOT app code.
- **#164 Tiers Backend Infra VERIFIED** — GET /api/tiers/mine (getMyTier) -> HTTP 200 {tier, progress: currentTier BRONZE / nextTier SILVER / completedSales 1 / salesNeeded 4}; OrganizerTierBadge renders "Bronze Organizer" + "1/4 sales until next tier" (ss_5723zet9w). syncTier wired into billingController webhooks (4 events, code-confirmed). **P3 latent:** organizer.tier stores subscription value "PRO" (not BRONZE/SILVER/GOLD) -> getTierBenefits('PRO')=undefined, `benefits` omitted from API; masked by frontend `TIER_CONFIG[tier] || BRONZE` fallback — zero user impact.
- **#27b Watermark TEAMS gate VERIFIED** — /organizer/settings Appearance as Alice (TEAMS): "Remove FindA.Sale watermark from exports and shareable images" checkbox CHECKED + enabled, correct helper copy (ss_4877f2sdx). PDF-footer-visual + iCal `.ics`-text sub-checks still pending (need a non-TEAMS account for the on/off comparison).
- **#317 Geofence QR scan VERIFIED** — authenticated GET /api/items/:id/qr/scan vs geocoded GR sale: FAR (NYC ~970km) -> HTTP 403 "You must be at the sale location to scan this QR code"; AT-LOCATION -> HTTP 200 (cleared 100m gate, dup-check returned already-scanned); NO coords -> HTTP 200 graceful fallback (matches S936). haversine 100m enforcement confirmed LIVE. Was Backlog P1.
- **DOC-HYGIENE NOTE (resolved, not a bug):** `user12@example.com` login failed because **user12 was intentionally removed long ago** (Patrick confirmed — only ~6 seed users remain). QA docs/memory still referencing user12 as "primary shopper" are OUTDATED. Use **user5 (Leo Thomas)** for shopper QA; user1 (Alice, ADMIN+TEAMS organizer) for organizer QA. Both confirmed working with Seedy2025! this session.
- **Authenticated shopper smoke ✅ (user5 via direct /api/auth/login, bypassing form-autofill):** /shopper/dashboard renders clean — Ranger Explorer rank card, "Progress to SAGE 2,060/5,000 XP" bar, perks, and the NudgeBar code-split overlay ("Only 3 more favorites to reach 5!") all mount (ss_49483yyyg). **Smart Cart E2E ✅** — clicking item "+" fired addItem -> wrote to fas_shopper_cart_<userId> localStorage + "Added to cart" toast; nav cart badge 0->1; drawer (code-split overlay) opened showing "Saved in Cart (1)" Vintage Radio $25 + Place Hold + Cart Subtotal; item card flips to green ✓ in-cart state (ss_45892y66j). (Earlier passes showed cart 0 only because the UI click missed the small button — code path verified correct, NOT a bug.) Confirms shopper-side S968 code-split has no broken mounts.
- **#40 Market Hubs (TEAMS) ✅** — /organizer/hubs renders cleanly as an intentional Phase-2 coming-soon teaser (4 market types, value-props, inert "Create Event — Coming Soon" CTA, empty state); no functional flow yet by design (ss_93464pwy9). Not a bug.
- **Walkthroughs (organizer user1 + shopper user5):** organizer (dashboard/settings/add-items/POS/hubs/insights/earnings/holds/reputation/consignors/create-sale) + shopper (dashboard/sale-detail/cart/achievements/challenges/wishlist) all render clean — good empty states, real data, dark mode OK.
- **#219 Achievements XP progress — INCONSISTENCY FOUND + FIXED S969 (P3, pending Chrome verify):** /shopper/achievements showed "865 / 3,800 XP to Sage" (~23%, BAND-relative: progress within the Ranger->Sage band) while the dashboard showed "2,060 / 5,000" (~41%, ABSOLUTE from /api/xp/profile). NOT a wrong-threshold bug — backend RANK_THRESHOLDS genuinely uses RANGER=1200, so band size 5000-1200=3800 was internally correct; the two pages just used different FRAMING. Fix: achievements.tsx now reads the authoritative useXpProfile hook and displays absolute progress matching the dashboard (shared ['xpProfile'] cache => identical numbers). 1 file changed, TS clean. (ss_9952rn5q0 vs ss_49483yyyg).
- **P3 observation:** Insights "Total Revenue $45.00" vs Earnings "Gross Revenue $325.00" for same org — different definitions (marketplace sold-item vs POS/all-channel gross); labels don't disambiguate. Not a bug.
- PCVs staged below for the records pass (cross-session rule — roadmap Chrome cols NOT touched this session). BQ: 0 (the #219 inconsistency was fixed same-session — code shipped, pending Chrome verify; not left blocking).

**S968 — DEV/PERF (2026-06-12). Mobile homepage performance + repeatable audit infrastructure.**
- **PERF (pushed):** code-split 10 non-critical overlay/banner components to `next/dynamic` ssr:false (_app.tsx ×7 app-wide + index.tsx ×3) + lazy-loaded below-fold item images — trims initial JS/TBT.
- **LIGHTHOUSE CI BUILT (pushed):** `.github/workflows/lighthouse.yml` (median-of-3, mobile, 4 URLs: /, /pricing, /map, /estate-sales/denver-co; warn-only assertions; temporary-public-storage + artifact) + `lighthouserc.json` + `scripts/psi-audit.mjs` (on-demand PSI). PSI API confirmed **100% free** (25k/day, no billing) — needs a free key to avoid the shared anon 429. Cron set **MONTHLY** (`0 6 1 * *`). Ran green 3× via workflow_dispatch.
- **HOMEPAGE CLS FIXED + VERIFIED:** first attempt (reserve map skeleton + TreasureHunt placeholder) **REGRESSED 0.204→0.284** (reserved blocks collapse → new shift) and was reverted. Diagnosed via Lighthouse `layout-shifts` audit: dominant shift was `section.mb-12` (the "Sales Near You" map) pushed down by the CityHeat + TreasureHunt promo banners mounting above it (~0.135). **Fix (Option 1):** moved CityHeatBanner/TreasureHuntBanner/SaleOfTheDayCard **below the map section**. Verified both ways — CI median homepage CLS warning **CLEARED (<0.1)**; throttled sandbox **0.135→0.019**.
- **Vercel Speed Insights confirmed LIVE** (real-user mobile RES **91 "Great"**, field LCP 1.68s / INP 240ms / CLS 0.19).
- **Directory listings:** findPWA submission attempted but their server (lima-city) returned **HTTP 500** — NOT submitted, retry when their backend recovers. Appsco.pe (#493) is a dead Heroku app → mark defunct.
- **New Cowork scheduled task** `findasale-monthly-perf-audit` (2nd of month, 9am) reviews the audit + field data and reports CWV status to Patrick.
- Docs: `claude_docs/brand/directory-listing-copy-2026-06.md`, `claude_docs/audits/lighthouse-audit-2026-06-12.md`. BQ: 0 (unchanged).

**S967 — RESEARCH/OUTREACH (2026-06-12). App-submission + greenfield growth research, reconciled against existing pipeline. Added roadmap rows #489–546: Tier 1B (local citations Bing/Apple/Yelp/Foursquare + PWA dirs Appsco.pe/findPWA), Tier 1C (Microsoft Store/Google Play/Samsung PWA paths, eBay Partner Network, Stripe Partner, SOS/Featured PR, NASMM/NAPO, Start Garden, Alignable, SBAM, Wikidata), Tier 1D (West MI local: Paw Paw Chamber, 5×5 Night, The Rapidian, Local First, Crain's GR/Rapid Growth/Second Wave press, Discover Kalamazoo). Verified AI-discovery ALREADY SHIPPED — schema.org JSON-LD on 26 page types incl. Event on sales/[id].tsx, indexNowService.ts built, robots.txt allows AI crawlers; only Wikidata entity remains, no dev needed. eBay email catch-up: Developer API Growth Check #260428-000018 reply DRAFTED (links to completed EPN questionnaire, stops auto-close); EPN affiliate #00448478 — we replied 6/5, awaiting eBay; Marketplace Insights #00447997 closed by eBay (access closed). Marketing: west-michigan-local-outreach doc (Paw Paw Chamber + Local First listing copy, 3 press pitches). 4 Gmail drafts created (eBay dev ticket + Rapid Growth + Second Wave + Crain's/Anna Fifelski) — pending Patrick send. Docs: APP-SUBMISSION-DIRECTORY-RESEARCH-2026.md + GREENFIELD-GROWTH-AVENUES-2026.md. BQ: 0 (unchanged).**

**S966 — RESEARCH (2026-06-12). Directory listing sprint: Software Finder (#483) profile fully built — description, 5 features, 3 FAQs all rewritten with real product content. Trustpilot (#485) blocked (account creation fails regardless of email used). BQ: 0 (unchanged).**

**S964 — DEV (2026-06-12). Scraper expansion: EstateSale.com directory scraper built (51-state two-phase, 500–1,500 featured companies with phone/email/website, Crawl-Delay:10 respected). Playwright CI harness continue-on-error fixed. sourceRegistry.ts + quarterly workflow created. BQ: 0 (unchanged).**

**S963 — DEV/RECORDS/WRAP (2026-06-12). Records pass: S962 PCVs applied. #27c FIXED + CHROME VERIFIED ✅ (em-dash/ampersand title → CSV downloads clean, no 500). SellMyAntiques domain parked. SaaSHub #480 CLAIMED by Patrick. KY/ME workflow triggers DONE. BQ: 1→0.**

**S962 — QA (2026-06-12). Records pass: #74 + #463 S961 PCVs applied to roadmap.md. Chrome QA: #219 ✅, #218 ✅, #55 ✅, #81 ✅ spot-check, #127 ✅. Bug found: #27c eBay CSV export → HTTP 500. BQ: 0→1.**

**S961 — QA (2026-06-12). Chrome QA pass: #463 Claim Button Tracking ✅, #74 Role-Aware Reg ✅. Records pass: SEO3 S944 applied to roadmap.md. #472 PCVs (S948) cleared from PCV table. BQ: 0.**

**S960 — DEV (2026-06-12). Bid13 scraper activated + NFMA parked + dead flea market directory research.**
- **Bid13 ACTIVATED** — full rewrite from parked stub. `POST /api/v1/search.php` JSON API confirmed. 9 national coverage zips at 500-mile radius, paginated, deduplicated by `facility_nid`. Category: `AUCTION_HOUSE`. Respects crawl-delay (5s). `enabled: true` in sourceRegistry. Monthly GH Actions workflow created. TypeScript: 0 errors. Push block delivered — pending Patrick push.
- **NFMA PARKED** — member directory behind NFMA login wall. Parked stub created with investigation date. Workflow created but effectively no-ops.
- **Dead flea market research** — 7 dead scrapers investigated. Space largely collapsed 2020–2024. FleaMarketZone already in codebase and is the main comprehensive survivor. fleamapket.com and fleamarketlocator.com flagged as potential future Playwright candidates (neither worth building now).
## Pool Audit Findings

Run: 2026-05-18 (S756). Railway DB queried directly via psycopg2.

**DirectoryClaimEmail (outreach queue):** 3,319 PENDING, 29 SENT. 31 junk rows deleted (26 image filenames stored as emailAddress, 5 Patrick test emails).

**leadTier breakdown:** HOT: 5,517 (100% website coverage) · WARM: 36,851 (3.3% website coverage) · COLD: 14,314

**WARM email gap:** Only 208 WARM orgs currently addressable. Website enrichment job changed from weekly → daily (S756). API headroom: HERE 250K/month cap, ~1,500/month usage. Pipeline healthy.

**Geocoding:** 6,760 sales still not geocoded. Nightly geocoding job addresses gradually.

---

## Blocked Queue

_S772 reconciliation: graduated/closed rows removed — reconciled into strategy/roadmap.md. Only genuinely open items remain._
_⚠️ P0 AGING: #332 at 73+ sessions — mandatory P0 per CLAUDE.md §10a._
_S919 WRAP: #230 RESOLVED (SmartBuyerWidget rendering confirmed). FB Marketplace RESOLVED (Patrick decision: DEFERRED — Apify path added to roadmap #380). #335 updated: Jane Thrift is fictional. BQ: 7→5._
_S921: SEC-001, SEC-002, #196, #201 coded but pending push+Chrome-verify — all 4 remained in BQ. BQ: 9._
_S922 QA MODE: all 4 S921 fixes Chrome-verified live RESOLVED (commit 7058d99c deployed): SEC-001 (admin.ts Prisma.sql parameterized, page returns 11 patterns no error), SEC-002 (items.ts scoped multer, valid types pass, add-items loads clean), #196 Buying Pools (card renders on $169 item ss_5769b4ui3, negative test on $25 item), #201 Favorites all 3 (Items(1) count, Saved Sales section, /shopper/collections→302→/shopper/wishlist ss_37941eelg/ss_1509jponw). All 4 rows REMOVED. BQ: 9→5. Below QA ceiling — DEV available S923._
_S928: HTML entity P2 FIXED (textUtils.ts + insights.tsx + itemController.ts). GA4 #470 conversion events built. 22 Chr cols bulk-applied (S803–S805 backlog). BQ: 6→5._
_S932: Hunt Pass multiplier display inconsistency RESOLVED (Patrick confirmed 1.5x XP on live site). BQ: 6→5._
_S933: #335 RESOLVED (outreach confirmed active, 658 sent). WARM leads backfill RESOLVED (0 orgs missing DCE row). WARM enrichment removed (3.5%→4.7%, not a bug, growing). GSF geocoding removed (structural/by-design, fallback confirmed). Domain blocking shipped (estatesales.net/org blocked across all 3 email rails). BQ: 5→1._
_S937b: SUPPRESSION PASS COMPLETE (Patrick-approved) — added `suppressionService.isHardSuppressed()` (blocked-domain+hard-bounce+complaint only) and guarded ~15 more Gmail-rail senders: BULK→isSuppressed (curatorEmailJob, monthlyTrendReportJob, abandonedCheckoutJob, buyingPoolController×2, lib/notificationService +placeholder skip, organizers.ts), TRANSACTIONAL→isHardSuppressed (auctionJob, reservationController, saleWaitlistController, waitlistController, contact.ts autoreply, emailReminderService) + reclassified saleAlert(×4)/saleLive full→hard. Internal alert senders left unguarded by design. Backend TS 0 errors. SENTRY CAPTURE added to both rails (transactionalEmailService `resend_send_rejected`, emailService `gmail_send_failed`) so a future send-rejection pings Sentry → caught by the daily health check. GMAIL RAIL AUDIT done (`gmail-rail-audit-s937.md`): rail is PROPER + healthy — From=outreach.finda.sale is SPF+DKIM+DMARC aligned, ~200-400/day sending, 0 Sentry gmail errors/7d, no P0/P1. 4 P2 follow-ups (see Next Session). G1 ESCALATED to P0 after Resend log detail (SES_FROM_EMAIL=find@outreach.finda.sale → whole transactional rail 403). Audit history consolidated → `claude_docs/feature-notes/email-audit-history-consolidated.md` (28 findings, R-1..R-7 recurring). The 401 GET /emails/suppressions is an external curl with a send-only Resend key — not our backend, ignore._
_S937f: G1 P0 RESOLVED — E2E VERIFIED. After push + Railway green + RESEND_FROM_EMAIL=noreply@finda.sale: registered deseee+s937e2e@gmail.com via POST /api/auth/register (HTTP 201) → verification email RECEIVED from `noreply@finda.sale` in INBOX (not spam), subject "Verify Your FindA.Sale Email Address", Gmail thread 19eaf109a9b88af7. This is the exact send class that was 403-rejected pre-fix → Resend transactional rail now delivers from the verified domain. Real inbox receipt = full ✅ (not CODE-ONLY). GMAIL RAIL also E2E-verified: POST /api/contact → autoreply received from find@outreach.finda.sale in INBOX (thread 19eaf18a44195799) — also confirms the send-as alias is valid. ZONE BLOCK verified LIVE: EmailQuotaLog 0→2 (normal contact submit = support+autoreply) →3 (@system submit = support only, autoreply to @system filtered, +1 not +2 — no quota burn, no bounce). support@finda.sale allowlist confirmed (support send went through). Resend block proven transitively (same isEmailDomainBlocked gate, live on Gmail + 7/7 logic). M2 Resend-admin-API monitor runs 06:07 (no CLI this session for the key). BQ: 2→1 (#332 Shopify remains). (Test user deseee+s937e2e@gmail.com left in prod — harmless +alias; delete if desired.)_
_S938: #332 Shopify DEFERRED (Patrick decision) — blocked on connecting a real custom-app Shopify store for live QA; code fixes already coded/pushed S890. Removed from Blocked Queue; revisit when a test store is available. BQ: 1→0._
_S939: Deliverability hardening session — NO blockers added. Gmail-rail false-alarm P0 was not real (send-only token, no re-auth needed); placeholder-leak guard, Resend webhook (4 fixes), and soft-bounce policy all shipped + live + e2e-verified. Optional Gmail outreach-token re-auth is non-blocking. BQ: 0 (unchanged)._
_S937e: SOURCE PROVEN + rail-suppression aligned. Bounce source was NOT saleLive (dead code) — it was `postSaleRecapEmailService.sendPostSaleRecaps()` via outwardEmailAutomationsJob (10:00 UTC daily): Sale.recapSentAt stamps 173/195/120 on 06-06/07/08, all hour-10 UTC, all isUnmanagedListing=true (proof in system-finda-sale-bounce-source-S937.md). Recap query NOW filters `isClaimed:true,isUnmanagedListing:false` (L241) — already self-fixed; rail guard is belt-and-suspenders. Allowlist verdict: support@finda.sale (SUPPORT_EMAIL) is the ONLY code send-target @finda.sale; info@/privacy@/legal@/admin@ are NOT code recipients (frontend/mailto only). Allowlist now env-extensible via SENDABLE_FINDA_SALE_ADDRESSES. RAIL-SUPPRESSION ALIGNED: added checkMultipleHard(); Resend rail switched full→hard (opted-out users now get receipts/resets); Gmail rail chokepoint now also drops hard-bounce/complaint (not just domains). Both rails enforce the same floor: domain-block + hard-bounce + complaint; bulk senders layer full isSuppressed on top. Comprehensive E2E rewritten (4 rails × positive + negative/guard, 27-item checklist). Backend TS 0 errors. _
_S937d: BOUNCE-FLOOD FIXED (rail-level). Root cause: a Gmail-rail event send (likely saleLiveEmailService on scraped-sale publish) was emailing scraped organizers' own User.email = scraper+slug@system.finda.sale (72,060 such users); S929 only blocked @system in the 3 outreach SEEDERS, never the send rails. FIX: `isEmailDomainBlocked()` now blocks the ENTIRE finda.sale zone (domain==='finda.sale' OR endsWith '.finda.sale') — no real user ever has an @finda.sale address — with a one-address allowlist for SUPPORT_EMAIL (contact-form support@finda.sale). Plus a hard guard at the emailService.emails.send Gmail chokepoint (filters unsendable recipients before quota+send). Covers BOTH rails (Resend checkMultiple + Gmail rail guard), autoSeed, and the 16 guarded senders. Verified: 7/7 logic cases, backend TS 0 errors. In-flight DSNs from the pre-fix 06-08 batch will taper as Gmail stops retrying (~21h); they don't pollute suppression (bounce parser ignores finda.sale). Files: suppressionService.ts, emailService.ts (already in push block)._
_S937: G3 suppression gap FIXED (8 bulk lifecycle services, pending push). G1 reframed P2 latent after Resend dashboard check (send.finda.sale not a Resend domain; SES_FROM_EMAIL env almost certainly overrides the dead fallback — verify, don't rewrite). NO SES rail exists in code. NOTED (not yet fixed, awaiting Patrick scope): ~9 more Gmail-rail senders lack suppression — most important `lib/notificationService.createNotification` (central fan-out), plus buyingPool/reservation/saleWaitlist/waitlist/abandonedCheckout/curator/monthlyTrendReport/emailReminder/organizers. Transactional ones (auction receipt, reservation, contact) should suppress hard-bounce+blocked-domain only, NOT opt-out. BQ: 1→2._

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| #313 HAUL_POST_LIKES re-award fix | Idempotency bug FIXED S970 (was XP-farm vector); browser-verify needs 10 accounts liking one haul post — not reproducible in QA env | 10 accounts to like a post past threshold, confirm author XP fires once only | S970 |
| FINDASALE-NODEJS-10 — Sale SELECT slow query (3342ms, ongoing) | Pre-existing issue, 55 events since May 6. `SELECT ... FROM "Sale"` with no relevant index. Not related to cron stampede (still firing post-stagger). Last seen 6:29 AM UTC 2026-06-14. Needs dedicated investigation: EXPLAIN ANALYZE the query, add index on the relevant column(s). P1 by age (5+ weeks unresolved). | Read query from Railway logs, run EXPLAIN ANALYZE via psycopg2, add index via migration. | S977 |




---

## Pending Chrome Verifications

| # | Feature | Evidence | Session |
_S970 records pass: S969 PCVs (#164 Tiers Infra, #27b watermark toggle, #317 Geofence QR) applied to roadmap.md. Stale already-applied rows (#74/#463/#472×3/#27c/#219/#218/#55/#81/#127 — confirmed applied S949/S962/S963/S965) cleared from table._
|---|---------|----------|---------|
| SEO3 | Denver city landing page /estate-sales/denver-co | Navigated https://finda.sale/estate-sales/denver-co. Title: "Estate Sales in Denver, CO \| FindA.Sale" ✅. Meta desc present+keyword-rich ✅. H1: "Estate Sales in Denver, CO" ✅. 50 listings visible ✅. Dark mode clean ✅. ss_34924pp42 ss_8168bplgd | S944 |
_(#422 ✅ S949 applied S950 — cleared. #75 ✅ S949 applied S950 — cleared. #470 item_viewed ✅ S949 applied S950 — cleared.)_
_(SEO3 ✅ S944 applied S961 — UI col ✅ S944 in roadmap.md — cleared. #472 ✅ S948 applied S949 — cleared from PCV table S961.)_
_(S963 records pass: S962 PCVs #219/#218/#55/#81/#127 all ✅ — 5-element evidence confirmed — applied to roadmap.md Claude QA columns. #27c PCV staged for Chrome verify.)_
_(S949: #472 applied to roadmap.md (3x PCVs all pass 5-element gate). #422/#75/#470 item_viewed re-verified with screenshot IDs — ready for next records pass. #470 organizer_signup UNVERIFIED → BQ.)_
_(S940 PCV rows — #27b watermark settings gating ✅ PRO/TEAMS, #75 non-lapsed TEAMS label ✅, #422 OAuth buttons+linked-accounts UI ✅ — applied to roadmap.md in S941 records pass — cleared.)_
_(S939 PCV rows — SEO3 REJECTED no screenshot ID (Human QA ⬜ unchanged), #470 RUNTIME-VERIFIED already in roadmap — cleared S941.)_
|---|---------|----------|---------|
_(S935 PCV rows — #317 Geofence graceful fallback ⚠️ S936, #470 GA4 conversion CODE-ONLY S936 — applied to roadmap.md in S936 records pass — cleared.)_
_(S931 PCV rows — #462 Attribution, #237 Command Center, /admin/outreach-opens, SEO1 SSR, #455 Notify Me, #464 SEO footer, sale detail, /trending, /map — applied to roadmap.md in S932 records pass — cleared.)_
_(S930 PCV rows — organizer dashboard, HTML entity fix, shopper dashboard, Explorer Profile, #123 rank label, #199 Hunt Pass — applied to roadmap.md in S931 records pass — cleared.)
_(S925 PCV rows — logout flow Chr✅, #463 CODE-ONLY, #462 CSRF partial — applied to roadmap.md in S930 records pass — cleared.)
_(S927 PCV rows #79/#164/#316 applied to roadmap.md in S928 records pass — cleared.)
_(S920/S921/S922 PCV rows applied to roadmap.md in S923 records pass — cleared.)_
---


## Next Session

### S974 — Carry-forward (eBay FVF flat-rate — Chrome verify + tier-ID investigation)

**RESOLVED S975 — the premise of this carry-forward was wrong. Verified directly against the live eBay account:**
1. Tier-ID source is NOT a mystery and routing is NOT broken. The EbayPolicyMapping row for artifactmi was created 2026-04-15 (Patrick configured the 14 weight tiers + category overrides + classification policies himself, long ago). A direct GET /sell/account/v1/fulfillment_policy with artifactmi's live token returned 23 policies; every tier policyId in the DB mapping matches a real, present policy on eBay. No "Sync from eBay" sleuthing needed.
2. Chrome verify as artifactmi@gmail.com: End Butter Knife (137412262678) + AP-40 (137411858004) → re-push → expect Butter Knife=$6.65, AP-40=~$23.59 with new "FindA.Sale Flat $23.59" policy appearing on eBay.
3. Three mistakes from S974 are documented in the session block above — don't repeat them.

### S974 — 2026-06-13 | BUG/DEV (eBay FVF shipping — flat-rate fix)

**Session type:** BUG/DEV — evidence-first debugging, service build, code push

**Root cause:** AP-40 listed at $75 FedEx because organizer is on FLAT_TIERS mode with a gap — USPS caps at 111oz, next tier is FedEx 45lb $75 catch-all (maxOz 720). The 11lb (176oz) AP-40 fell through. Gap-overshoot guard (commit 3db01c72) was added after the AP-40 was first pushed, so it was already live at $75.

**Fix shipped (commit 11cfb344, 3 files):**
- `ebayFlatRatePolicyService.ts` — NEW (195 lines). Creates "FindA.Sale Flat $X.XX" per-organizer flat-rate policies on eBay, idempotent (name-check + error 20400 guard), in-process cache, graceful fallback. Calls eBay via proxy with EBAY_PROXY_SECRET — works in production (403 was VM-only; Railway has the secret).
- `ebayController.ts` — gap-overshoot guard (~L3621) now tries ensureFvfFlatRatePolicy FIRST before returning SHIPPING_TIER_GAP error.
- `ebayRateEstimateService.ts` — rewritten with real 2026-04-26 Pirate Ship USPS GA rates. Exports EBAY_SHIPPING_FVF_RATE=0.136.

**Expected after Railway deploy (NOT Chrome-verified):** Butter Knife (4oz) → $6.65 (FLAT_TIERS exact tier); AP-40 (11lb/176oz) → $23.59 (new "FindA.Sale Flat $23.59" policy created on eBay).

**Mistakes made (Opus must not repeat):**
1. Built Option A ($1.50 handling fee) before confirming with Patrick — he wanted Option B (per-item FVF flat-rate). Wasted 1 build cycle.
2. Reasoned from code/DB without testing live eBay API. Patrick correct callout.
3. Wrong about eBay policy sync — kept saying policies ARE synced. Patrick is RIGHT: "Sync from eBay" button only saves ONE default policy per type to EbayConnection. It does NOT populate the FLAT_TIERS tier mapping. The 23 weight-based tier entries and their eBay policy IDs — source unknown. Patrick says he didn't sync them. Opus MUST investigate before assuming FLAT_TIERS routing is correct.

**BQ delta:** 2 → 3 (added: FVF flat-rate Chrome verify + tier-ID source investigation)


### S973 — Carry-forward (eBay shipping — push + deploy + re-QA needed)

**S973 QA found 3 bugs, all fixed CODE-ONLY. Push block delivered.** After Patrick pushes 4-file block and Railway + Vercel deploy:

**`Skill('findasale-qa')`** — Chrome QA as artifactmi@gmail.com organizer. Re-push the Danner pump (itemId cmqbb252i000i60qq7eilco9z, offer 186196728011).
1. Verify calculated policy applies on eBay (listing should show USPS-calculated rate, NOT $75 FedEx flat)
2. Brand/MPN/Category pre-fill correctly on edit-item page (Danner/AP-40/category name visible on load)
3. ShippingNetPreview appears in shipping section when weight is set; Suggest Price button fires a network request and returns a value
4. Pump publishes with Brand=Danner, MPN=AP-40, sensible non-Other category
5. Weight-tier gap-overshoot block message in CALCULATED mode

Evidence required per QA Honesty Gate — URL, user, element, outcome, screenshot IDs.

### S971 — Carry-forward (eBay shipping — GATED on migration — COMPLETED)

**STEP 1 — DONE ✅:** Deploy GREEN (febe1f46 Railway + Vercel). Migration applied + verified.

**STEP 2 + STEP 3 — PARTIALLY DONE S972:** Brand/MPN/UPC edit-item ✅, shipping-mode toggle ✅. Full pump re-push UNVERIFIED → see S972 carry-forward above.

### S970 — Carry-forward (QA/DEV)

S969 PCVs applied + #219 Chrome-verified this session. BQ is 0 — DEV fully unblocked.

1. **#27b remaining:** PDF footer visual + iCal `.ics` description text still need a non-TEAMS org to verify the watermark on/off comparison (the only outstanding sub-checks on #27b).
2. **#164 P3 (optional, low priority):** organizer.tier stores subscription value "PRO" instead of loyalty enum BRONZE/SILVER/GOLD → getTierBenefits returns undefined, `benefits` omitted from /api/tiers/mine. Frontend `|| BRONZE` fallback masks it — cosmetic/data-hygiene only.
3. **Next work:** with BQ empty and no open BROKEN rows, the frontier is the directory/growth pipeline (#489–546) and the ⚠️ CODE-ONLY gamification items (#254/#268/#278/#281/#313/#314/#315) that need real Stripe/GPS to Chrome-verify. QA accounts: user5 (Leo Thomas) shopper, user1 (Alice) organizer, Seedy2025!.

### Patrick — Actions Needed (post S967)

1. **Send the 4 Gmail drafts (review first — Gmail MCP can only draft, not send):**
   - eBay Developer ticket #260428-000018 reply (closes the auto-close loop; send from artifactmi@gmail.com if possible).
   - Press pitch → Rapid Growth Media (Editor@RapidGrowthMedia.com).
   - Press pitch → SW Michigan's Second Wave (feedback@secondwavemedia.com).
   - Press pitch → Crain's GR Business (anna.fifelski@crain.com — confirm byline if desired).

2. **~~Push S967 research + outreach docs~~ ✅ CONFIRMED ON GITHUB (S973)** — APP-SUBMISSION-DIRECTORY-RESEARCH-2026.md present on main.

3. **Time-sensitive grants (applications open now):** Start Garden "The 100" (#506) + Start Garden 5×5 Night (#510). Both free, no eligibility gate.

4. **Free quick-win listings (~1-2 hrs, all $0):** Bing Places #489, Apple Business Connect #490, Yelp #491, Foursquare #492, Appsco.pe #493, findPWA #494; eBay Partner Network #498; Alignable #500; Paw Paw Area Chamber #509.

5. **EPN affiliate (#00448478) nudge** — if eBay stays quiet past ~1 week from 6/5, send a short follow-up to epn-tigs@ebay.com (offer available on request).

### Patrick — Actions Needed (post S964)

1. **~~Push S964 changes (EstateSale.com scraper + CI fix)~~ ✅ CONFIRMED ON GITHUB (S973)** — estateSaleComScraper.ts + sourceRegistry.ts + .github/workflows/scrape-estatesalecom.yml present on main.

2. **Push S963 changes (if not yet pushed):**
   ```
   git add packages/backend/src/controllers/ebayController.ts
   git add packages/backend/src/services/scraper/sources/sellMyAntiquesScraper.ts
   git commit -m "S963: fix eBay CSV export HTTP 500 (Content-Disposition); update SellMyAntiques status"
   .\push.ps1
   ```

3. **SaaSHub (#480)** — Claim saashub.com/finda-sale (page open in Chrome). Create account, add logo/pricing/description.

4. **AlternativeTo (#477) — June 18, 2026 ~9:49 PM Stockholm.** Log in as "FindASale" → alternativeto.net → Add Software.

5. **KY/ME scraper triggers** — Trigger `workflow_dispatch` on scrape-kentucky-phase2 and scrape-maine-phase2 to verify S959 fixes write records to DB.

### S966 — Suggested Work (carry forward)

**Option A — AlternativeTo submission (June 18, 2026 deadline).** Patrick logs into alternativeto.net as "FindASale" and submits. Highest-urgency remaining directory listing.

**Option B — Trustpilot (#485) retry.** Try account creation with support@finda.sale. If still blocked, park indefinitely.

**Option C — AuctionTime scraper (if Cloudflare block is resolvable).** See S965 notes.

**Option D — Next roadmap BROKEN item.** BQ is 0 — dev fully unblocked.

### S965 — Suggested Work (archived)

**Option A — AlternativeTo submission (June 18, 2026 deadline).** Patrick logs into alternativeto.net as "FindASale" and submits. Highest-urgency remaining directory listing.

**Option B — AuctionTime scraper (if Cloudflare block is resolvable).** AuctionTime.com was found Cloudflare-blocked via direct fetch in S965. Try with realistic UA rotation (same approach as AuctionZip S890 fix) — may be unblockable. If blocked, skip.

**Option C — MaxSold.com scraper research.** MaxSold is a major online estate/downsizing auction platform not in current source registry. Likely static HTML catalog pages. Research: robots.txt, ToS, URL structure, data availability.

**Option D — Next roadmap BROKEN item.** BQ is 0 — dev is fully unblocked.


## Recent Sessions

### S978 — 2026-06-14 | DEV (Suggest price P2 safety guard + ShippingNetPreview copy)

**Session type:** DEV — P2 bug fix dispatch (findasale-dev), copy clarification.

**Suggest price P2 safety guard — FIXED:**
- Root cause: `PriceSuggestion` sent only `{title, category, condition}` to the AI — no awareness of the organizer's current price. AI correctly priced a generic pump at $6.22; "Use this price" would have catastrophically replaced a $175 price.
- Fix (3 files): `routes/items.ts` — added `currentPrice` to pricesuggestionSchema; `services/cloudAIService.ts` — `suggestPrice()` now accepts `currentPrice` as 5th param and injects it into the Claude Haiku prompt ("differs >30%, explain why clearly"); `components/PriceSuggestion.tsx` — full rewrite (137→184 lines): passes `currentPrice` in API body, adds `pendingConfirm` safety gate that fires when suggestion < 50% of current price, shows "⚠️ This is X% below your current price of $Y. Replace it?" with explicit Yes/Keep buttons instead of silently applying.
- `components/PriceResearchPanel.tsx` — was NOT forwarding `currentPrice` to `<PriceSuggestion>` despite having it in props; added `currentPrice={currentPrice}` to JSX.
- Backend TS: 0 errors. Frontend TS: 0 errors.

**ShippingNetPreview FVF copy — CLARIFIED:**
- Problem: "Suggest price for a target margin" section looked visually identical to the PriceSuggestion widget above it; result "List at $6.22" read like an item price, not a min-list-price-to-net-margin back-solver.
- Fix (`components/ShippingNetPreview.tsx`): section header → "Min. list price to hit a net margin"; added FVF context paragraph ("eBay charges its Final Value Fee on both the item price and the shipping amount. This calculates the minimum item price to still net your target margin after both fees."); result label → "List item at $X — nets Y% after eBay fees (Z est.)"; button → "Calculate".
- Backend TS: 0 errors. Frontend TS: 0 errors.

**BQ delta:** 3 → 2 (Suggest price P2 bug FIXED + removed; #313 + NODEJS-10 remain)

### S977 — 2026-06-14 | QA (Sentry cron verify + eBay pump re-push Chrome QA)

**Session type:** QA — Sentry monitoring, Chrome QA as artifactmi@gmail.com.

**Sentry results (verified post-S976 stagger):**
- FINDASALE-NODEJS-38/-2N/-2Z/-2S/-3D: ALL RESOLVED ✅ — cron stagger eliminated the 2:00 AM stampede. Zero unresolved instances of these issues.
- FINDASALE-NODEJS-33 (graceEndAt 1233ms): Fired ONCE at 2:00:02 AM UTC today (the pre-fix run before the new migration + stagger took effect). Expected — tomorrow's run at 2:00 with the index active should be clean. Treated as resolved.
- FINDASALE-NODEJS-10 (Sale SELECT 3342ms): Pre-existing, 55 events since May 6. Last seen 6:29 AM UTC today. NOT related to cron stampede — separate issue needing investigation. Added to BQ as P1.
- No new errors from eBay pump re-push.

**eBay pump Chrome QA (artifactmi@gmail.com as Artifact MI organizer):**
- Navigated https://finda.sale/organizer/edit-item/cmqbb252i000i60qq7eilco9z ✅
- Category: "Pumps (Air) / Pet Supplies" ✅ (ss_9966wrf59)
- ShippingNetPreview renders: "Buyer pays for shipping ~$20.38 USPS Ground Advantage, est." + "Your estimated net $145.59" + See breakdown ✅ (ss_2819q3nee, ss_5347wxgwk)
- Suggest price fired: returned "List at $6.22 for a 30% net ($1.87)" + "Use this price" button ✅ (fires) ⚠️ P2 bug (see BQ)
- Clicked "Re-push to eBay" → button showed "Pushing..." → toast "Item listed on eBay" ✅ (ss_65997l4j3, ss_309347xtn)
- POST /api/ebay/organizer/sales/.../ebay-push → HTTP 200 ✅
- DB verified: ebayNeedsReview=False, ebayListingId=137415317997 ✅
- eBay Inventory API verified: offer 187130124011 status=PUBLISHED, fulfillmentPolicyId=316596123011 ("FindA.Sale Flat $32.00") ✅, price=$175 ✅

**BQ delta:** 3 → 3 (removed 2 resolved eBay items; added FINDASALE-NODEJS-10 P1 + Suggest price P2 bug; #313 unchanged)


### S976 — 2026-06-13 | BUG/INFRA (Sentry CI Health — missing index + cron stampede fix)

**Session type:** BUG/INFRA — Sentry triage, production DB migration, cron schedule stagger.

**Sentry triage results (9 active issues):**
- **FINDASALE-NODEJS-D (SyntaxError crash):** Release 9873b2f9 "feat: add Brand/MPN/UPC inputs to edit-item page" crashed Railway at 16:00 UTC. Already auto-resolved — current prod 11cfb344 healthy. No action.
- **FINDASALE-NODEJS-33 (tierGraceCron 1233ms) — FIXED:** schema.prisma declared `@@index([graceEndAt, graceTierBefore])` but zero migrations ever created it. Created `20260614000000_add_grace_period_index` migration. Patrick applied `prisma migrate deploy` — index now in production.
- **FINDASALE-NODEJS-10/-38/-2N/-2Z/-2S/-3D (6 slow queries 1081–2487ms) — FIXED:** 9 cron jobs all fired simultaneously at `0 2 * * *`, causing connection/lock contention. Staggered 7 jobs: cleanupStaleDrafts→2:05, consignorExpiry→2:10, xpExpiry→2:15, referralReward→2:20, reputationScore→2:25, foundingOrgBadge→2:30, fraudDetection→2:35. tierGraceCronJob stays 2:00.
- **FINDASALE-NODEJS-1N (full table COUNT) — P3/NO-ACTION:** `SELECT COUNT(*) FROM Organizer WHERE 1=1` with no filter; no index can help. Acceptable background stat.

**Files changed:** `packages/database/prisma/migrations/20260614000000_add_grace_period_index/migration.sql` (new), 7 × `packages/backend/src/jobs/*.ts` (cron schedule strings only). Backend TS: 0 errors. Migration applied to Railway. Push + `prisma migrate deploy` done by Patrick.

**BQ delta:** 3 (unchanged)

## Next Session

### S979 — Recommended options

**BQ is 2 items (below ceiling). DEV available.**

**Option A (P1) — FINDASALE-NODEJS-10 slow query:** Sale SELECT 3342ms, 55+ events since May 6. Run EXPLAIN ANALYZE on the query via psycopg2, add index via migration. Dispatch `Skill('findasale-dev')`.

**Option B — Chrome QA for S978 P2 fix:** Navigate to edit-item for the Danner pump ($175 item) as artifactmi. Click Suggest Price. Verify (1) AI reasoning cites the $175 current price, (2) if suggestion is still < $87.50, warning confirmation UI appears instead of auto-applying. Dispatch `Skill('findasale-qa')` (Chrome sequential).

**Option C — Next roadmap item.** BQ is below ceiling.

**Patrick actions pending:** None from S978.

