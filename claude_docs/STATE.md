# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S724 — UX Spot-Check Backlog Burn-Down (COMPLETE)**

Reviewed five most-recent UX spotchecks (2026-05-13, 2026-05-06, 2026-05-02, 2026-04-22, 2026-04-15), grep-verified each issue against current code, dispatched six parallel dev agents to fix everything still unfixed. Confirmed-already-fixed: dashboard salesError destructure + render, edit-sale isError + window.confirm removal, shopper Pickups tab render block (now uses local holds query), add-items useMutation hooks moved before early returns, add-items duplicate saleId useEffect collapsed, search input aria-label, sale type filter aria-label, approachNotes.startDate parseISO bug (file refactored, code path gone). Shipped this session: (1) **create-sale.tsx** — added `isOnlineOnly: form.isOnlineOnly` to `buildPayload()` + matching backend `saleCreateSchema` zod field so the toggle now actually persists (frontend was sending nothing, knock-on found backend strip), removed 3 stale TODO comments, added aria-labels to 3 photo manipulation buttons. (2) **add-items/[saleId].tsx** — feature-flagged "Enhance All" stub button behind `NEXT_PUBLIC_ENABLE_ENHANCE_ALL` (RapidCapture already gates on `&& onEnhanceAll`), wrapped 8 `console.error` calls in dev-only guards, hoisted `URL.createObjectURL(pendingFaceBlob)` into a `useMemo` + `useEffect` revoke cleanup, replaced native `confirm()` for bundle delete with inline confirm-state pattern, camera heading now reflects `rapidItems.length` too. (3) **line-queue/[id].tsx** — fixed Rules of Hooks violation (auth redirect now in useEffect after all hooks; render-guard runs identically every render), added initial-load error state with Retry, added `lastSyncedAt` staleness indicator ("Updated Xs ago" + amber "⚠ Not updating" after 30s), added aria-label to Mark Entered button. (4) **shopper/dashboard.tsx** — replaced `alert()` with `showToast` for referral copy, wrapped 2 `console.error` in dev guards. (5) **index.tsx** — added `isError` to search useQuery + error message, gated "Save This Search" behind `user` (guests get sign-in link), added `aria-pressed` to date filters, gated SaleMap on `hasMapPins` (no more 220px empty container). (6) **sales/[id].tsx** — fixed OG meta double-render (was rendering `<SaleOGMeta>` twice when SSR ogHead truthy), moved Buyer's Premium disclosure from left column to immediately above Auction Items section header. (7) **organizer/dashboard.tsx** — aria-label on welcome banner ✕, replaced `setTimeout(window.location.reload, 1000)` with `queryClient.invalidateQueries(['organizer-sales', user?.id])` at both reopen sites. (8) **edit-sale/[id].tsx** — added `id="edit-{field}"` + matching `htmlFor` to 12 label/input pairs (title, saleType, description, startDate, endDate, startTime, endTime, address, city, state, zip, notes). (9) **backend saleController.ts** — added `isOnlineOnly: z.boolean().optional()` to `saleCreateSchema` (S724 knock-on from frontend dispatch). All edits verified via Read tool against Windows source-of-truth files; VM-side TS check unreliable due to mount truncation, deferred to Vercel/Railway build for final signal.

**Previous: S723 — eBay Push End-to-End + Blocked Queue Burn-Down (COMPLETE)**

Massive eBay-flow debugging + multiple Blocked Queue clearances. Patrick pushed a live eBay listing for the first time end-to-end. Iterative tonight: every Railway error became the next fix. Final state: weight 49oz + dims 10x13x4 + valid packageType (MAILING_BOX/PADDED_BAGS) persists, smart-pick picks CALCULATED→FLAT→FREE in correct order with weight-gate, eBay aspect filler uses tag/keyword/neutral cascade instead of `enums[0]` ("Accordion" on MIDI cables fixed), publish mode cascade (settings → sale-level toggle → per-call override) verified working, stale-category offer recreation works. Auto-save-before-push wired so eBay reads current form state. Fixes shipped: #326 eBay Comp Tiles (live listings array vs singleton), #280 Condition Rating XP (null-guard blocked AI-prefilled grades), #422 OAuth Option B (logged-in required for linking, 409 redirect with amber banner), #322 Encyclopedia category picker (Vercel proxy dropped `q` param — embedded in path), eBay frontendUrl + proxySecret ReferenceErrors in pushSaleToEbay, packageType enum allowlist (drops invalid like "BOX" via warn log, dropdown rebuilt with 17 real eBay values), edit-item form save (string→Int coercion, getItemById SELECT was missing package fields → form re-loaded blank after save), Favorite query `user: { isNot: null }` removed (required relation, invalid syntax, broke getSaleActivity). Schema migration deployed for `Organizer.ebayDefaultPublishMode` + `ebayDefaultShippingPolicyId`. ~25 file changes across the session, all in parallel/serial-batched dev dispatches plus inline edits for <20-line fixes.

**Previous: S722 — Monthly Retro + Auth Security Hardening (COMPLETE)**

Monthly retrospective run. Rate limit fix shipped (loginLimiter 5→15 + skipSuccessfulRequests). Auth security audit completed — hacker agent found 3 P0s, 4 P1s, 5 P2s, 4 P3s. 10 fixes dispatched and applied: JWT access token expiry 7d→15m, /auth/oauth rate limiter added, tokenVersion absent bypass fixed, organizerTokenVersion multi-role miss fixed, resend-verification regenerates token, logout clearCookie attributes fixed, jwt.verify algorithms constraint added, /verify-email rate limiter added, X-Forwarded-For logging fixed, OAuthBridge CSRF skip documented. OSM scraper URL fixed (overpass-api.de → overpass.kumi.systems). Indiana licensing scraper fixed (3 root causes: session cookie forwarding, __VIEWSTATEGENERATOR field, Recaptcha1 field). Doc cleanup: 22 root violations resolved, 2 deprecated files archived.

**Previous: S721 — Outreach Gmail API Migration (COMPLETE)**

Root cause of outreach email failure identified and permanently fixed. Railway Hobby plan silently blocks outbound SMTP on ports 25/465/587 — only Railway Pro ($20/mo) allows SMTP. Solution: rewrote outreachEmailsCron.ts from nodemailer SMTP to Google Gmail API over HTTPS (port 443, unblocked). Steps: (1) Created GCP OAuth client "FindA.Sale Outreach Mailer" under outreach@finda.sale project (qualified-cedar-496114-v1), scope: gmail.send. (2) Added GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN to Railway env vars. (3) Rewrote cron: `createGmailClient()` replaces `createTransport()`, `buildRawEmail()` constructs RFC 2822 MIME with base64url encoding, `gmail.users.messages.send()` replaces `transport.sendMail()`. (4) Added `googleapis` to backend package.json. (5) Fixed duplicate initOutreachEmailsCron block (VM mount truncation artifact). (6) Debugged OAuth invalid_grant — initial tokens were bound to Playground's default client, not ours. Re-authorized with "Use your own OAuth credentials" checked. (7) Verified token exchange via curl (200 OK + access_token). (8) Sent live test email via Gmail API from VM → deseee@yahoo.com (message ID 19e1d4e882ea0c52). (9) Updated Railway GMAIL_REFRESH_TOKEN and redeployed. Backend running, cron registered every 4 hours.

**Previous: S720 — Outreach SMTP Debug (WRAPPED — led to S721 Gmail API fix)**

Outreach cron fires correctly but all sends timeout with "Connection timeout" on smtp.gmail.com:465. Exhaustive audit confirmed: not a code bug — Railway Hobby plan blocks SMTP ports at the network level. Two attempted SMTP fixes deployed (IPv4 forcing, requireTLS removal) — neither worked because the block is at TCP level. Led directly to S721's Gmail API rewrite.

**Previous: S719 — Chrome QA Sprint (COMPLETE)**

Chrome QA on Blocked Queue items. Verified: #251 Markdown badge ✅ (sale card ~~$75.00~~ $56.25), #271 TEAMS copy ✅ (Webhooks line visible on /pricing), #330 Appraisals ✅ (button + /organizer/appraisals page). Bugs found: #326 eBay Comp Tiles ❌ — eBay search returns summary card (10 listings, Median $260) but EbayCompTiles image grid not rendering at all. #280 Condition Rating XP ❌ — set grade B, saved, XP balance unchanged at 15 XP (no XP awarded). #322 Encyclopedia Inline Tip: UNVERIFIED — category picker doesn't resolve free-text to eBay taxonomy. #405 Founding Badge: Patrick said "Build" — dev agent shipped: backend GET /:id now returns foundingOrgBadge field, frontend organizers/[id].tsx renders amber pill badge in trust-signal cluster. PUSH BLOCK PENDING (see Next Session). Outreach cron: registered in index.ts, OUTREACH_ENABLED=true, but Railway log window too short to confirm historical sends.

**Previous: S718 — QA Sprint + Outreach Enabled (COMPLETE)**

Chrome QA completed S718: #228 Settlement Receipt ✅, #241 Brand Kit PDFs ✅, #235 Charity Close ✅, #369 Quebec block ✅ (Canada → Quebec → amber warning + disabled Register button), #407 Flip Tracker ROI ✅ (Signed First Edition Novel: $500 revenue - $300 cost = +$200 profit, +66.7% ROI displayed in flip-report). Outreach confirmed live — `OUTREACH_ENABLED=true` set by Patrick, cron registered every 4 hours, 183 seeded organizers in queue. #405 Founding Badge: render surface found — organizer/settings.tsx Profile tab (🏆 card renders when foundingOrgBadge=true). Storefront copy says "badge appears on your storefront" but storefront page has no foundingOrgBadge rendering — this is a gap. #251 markdown badge: item changed from AUCTION to STANDARD type (psycopg2), re-QA blocked by rate limit (610s). Code path confirmed present in sales/[id].tsx line 1535 — only fires for non-auction items.

**Previous: S717 — eBay Price Comps + Backend Crash Fix (COMPLETE — wrap)**

eBay price research panel on review page fully debugged and fixed. Root causes resolved: (1) Backend crash loop — `ebayController.ts` was truncated mid-template-literal at line 4246 (`console.log(\`[eBay EndedSync] Batch of \${bat`) — restored missing 15 lines from git history. (2) Browse API `sort=price` returning cheap accessories (AC adapters at $11) instead of actual items — switched to `sort=bestMatch`. (3) bestMatch returning too many unrelated models — added `cleanTitle()` function that strips everything after first comma/standalone dash, removes generic descriptors, caps at 5 words (e.g. "Zoom B3 Multi-Effects Processor, Rec, Model B3" → "Zoom B3 Multi-Effects Processor"). Also: eBay developer account audit — Growth Check ticket (Incident 260428-000018) was filed April 28 from wrong account (artifactmi@gmail.com, Patrick's personal eBay seller account) — production keys are on deseee@yahoo.com / deseee1 account. No application ever reached the correct account. Draft reply prepared to correct App ID and add Finding API request. No Finding API access yet — Browse API is what's running.

**S716 (prior):**

Chrome QA on 10 features from S712 backlog. Verified passing: #411 Dorm Dash ✅, Wave 2 edit-sale ✅ (all 6 fields present), #412 Cash Bridge POS ✅ (Venmo/Zelle handle fields added mid-session), Leaderboard ✅, #304 Early Access Cache ✅, #288 Featured Boost ✅, #310 Color Discount Rules ✅. Three P1 bugs found and fixed same session: (1) Brand Kit PDFs + Settlement Receipt both had `?token=` empty on download links — root cause auth migrated to httpOnly cookies but these two still read localStorage; fixed to use axios instance with `withCredentials: true`. (2) Charity Close #235 — `getUnsoldItems` query too broad, returned non-AVAILABLE items that `donationController` rejected; fixed to filter `status: 'AVAILABLE'` only. Also fixed mid-session: Venmo/Zelle handle fields missing from Settings and POS — `venmoHandle`/`zelleHandle` already in schema, wired to Settings Profile tab + PATCH endpoint + POS display. Push block in Next Session.

Chrome QA on 10 features from S712 backlog. Verified passing: #411 Dorm Dash ✅, Wave 2 edit-sale ✅ (all 6 fields present), #412 Cash Bridge POS ✅ (Venmo/Zelle handle fields added mid-session), Leaderboard ✅, #304 Early Access Cache ✅, #288 Featured Boost ✅, #310 Color Discount Rules ✅. Three P1 bugs found and fixed same session: (1) Brand Kit PDFs + Settlement Receipt both had `?token=` empty on download links — root cause auth migrated to httpOnly cookies but these two still read localStorage; fixed to use axios instance with `withCredentials: true`. (2) Charity Close #235 — `getUnsoldItems` query too broad, returned non-AVAILABLE items that `donationController` rejected; fixed to filter `status: 'AVAILABLE'` only. Also fixed mid-session: Venmo/Zelle handle fields missing from Settings and POS — `venmoHandle`/`zelleHandle` already in schema, wired to Settings Profile tab + PATCH endpoint. Push block in Next Session.

**S715 (prior):**

Railway Postgres showing 117GB egress traced to runaway NY Phase 2 GitHub Actions workflow (ran 10am–7pm, bulk-downloading 29,728 NYC resale license records). Root causes fixed: server-side Socrata `$where`/`$q` filtering added to 9 Phase 2 scrapers (CA, CT, HI, IL, NV, NY, PA, TX, VA), timestamp-suffix duplicate creation removed from `index.ts` P2002 handler, `timeout-minutes: 60` added to 40 Phase 2 workflows missing it. DB cleanup: 23 junk timestamp-suffix organizers deleted, 356 legit NY businesses promoted to WARM `leadTier`. Pool state confirmed: 55,230 total unmanaged orgs, COLD 32,513 / WARM 5,663+356 / HOT 215 / NULL 16,839 (NY noise). 626 timestamp-dupe organizers with Sales attached remain — inert, can't delete without orphaning Sale records. egress fix is code-only, no schema changes.

**S714 (prior):**

384 SEO pages generated and merged into `packages/frontend/data/seo-pages/index.json`. Batch breakdown: 34 Haiku-written pricing guides (batch1-fixed.json — after post-processing via fix-seo-batch.js to handle markdown fence wrapping, two-array corruption, field renaming, score stripping) + 350 template pages (25 cities × 10 categories = 250 city×category + 10 categories × 10 months = 100 trend reports). All pages served at `/guide/[slug]` — ISR 24hr revalidate, auto-populates server-sitemap.xml. Two new scripts: `scripts/fix-seo-batch.js` (post-processing fixer + merge tool) and `scripts/generate-template-pages.mjs` (template generator). System prompt updated in `seo-pages-haiku-generator.md` (field names fixed, seoScore removed, 15-item batch limit noted). After-reset dispatch ready at `claude_docs/strategy/seo-agent-dispatch.md` to generate remaining 116 Haiku-written pages (batch1b + batches 2+3). Haiku limit confirmed: ~15 items max per session before truncation — agent dispatch avoids this.

**S713 (prior):**
Two backend crash loops fixed. OSM 406, GarageSaleFinder hidden-address, Missouri TLS, digest FK, Canada flag, YellowPages.ca scraper, AuctionZip/Canada411 disabled, MO pawnbroker disabled, OK pawnbroker PDF scraper, LA auctioneer POST scraper.

---

## Pool Audit Findings

Run: 2026-05-11 (updated S715). Railway DB queried directly via psycopg2.

**Pool size:** 55,230 unmanaged org listings total (up from 37,531 — NY Phase 2 run added 29,728 records, 23 junk deleted).

**leadTier breakdown (outreach queue field):**
- COLD: 32,513
- WARM: 5,663 + 356 NY prospects promoted S715 = ~6,019
- HOT: 215
- NULL: 16,839 (NY Phase 2 records — not yet tiered, invisible to outreach cron)

**Note:** `tier` field on Organizer = subscription/reputation tier (BRONZE/WARM/etc.) — separate from `leadTier` (outreach queue). Pool audit uses `leadTier`.

**S712 addition:** 183 high-confidence organizers seeded directly into DirectoryClaimEmail table via psycopg2 Python script (live DB change, 2026-05-10). Warmup schedule confirmed: 20/day (days 0-7) → 50 (8-14) → 100 (15-21) → 200/day stable, 6 four-hour windows.

**S712 addition:** 183 high-confidence organizers seeded directly into DirectoryClaimEmail table via psycopg2 Python script (live DB change, 2026-05-10). Warmup schedule confirmed: 20/day (days 0-7) → 50 (8-14) → 100 (15-21) → 200/day stable, 6 four-hour windows.

**Source attribution:** 94.5% have NULL `directoryMostRecentSource`. Only Foursquare (1,130) and HEREPlaces (920) have tags — everything else predates the S696 source-tracking forward-fix. Provenance of ~35,481 orgs is unknown from tags alone (ESN + state licensing scrapers predated the fix).

**Email coverage:**
- Has email: 5,382 (14.3%)
- High confidence (>0.6): 197 (0.5%) — now 183 seeded into outreach queue
- Junk / zeroed: 471

**Geocoding:** 2,202 geocoded (5.9%). 35,329 not geocoded.

**Spot check — WARM tier:** ~75% legitimate resale. Sendable first cohort.

**Verdict:** WARM tier is sendable — mostly legitimate resale businesses, Canada already excluded by cron. COLD tier has significant non-resale noise; don't send broadly. Actionable first cohort: 183 seeded into DirectoryClaimEmail.

---

## Blocked Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| #326 eBay Comp Tiles | FIXED S723 — endpoint rewritten to return live listings array (not singleton) | Chrome QA on edit-item page: confirm 2-3 tile grid renders under eBay summary card | S719 |
| #280 Condition Rating XP | FIXED S723 — removed `!item.conditionGrade` guard (AI prefill broke it); pointsTransaction lookup is the once-per-item guard | Chrome QA: set conditionGrade on item, verify XP balance +5 in guild ledger | S719 |
| eBay full push flow | FIXED S723 — weight/dims persist + auto-save before push + smart-pick respects weight + valid packageType dropdown | Chrome QA: full edit-item → save → push to eBay LIVE flow on a new item | S723 |
| #422 OAuth Option B | FIXED S723 — `/auth/oauth` returns 409 OAUTH_LINK_REQUIRED for unauth email-match; logged-in `/auth/oauth/link` endpoint added | Chrome QA: register email/pwd, sign out, sign-in-with-Google same email → expect amber banner redirect, not silent takeover | S723 |
| #322 Encyclopedia category picker | FIXED S723 — Vercel proxy dropped `q` param; embedded in path query string. status=200 count=N confirmed live | Chrome QA: type free-text in EbayCategoryPicker, confirm dropdown populates | S723 |
| Settings UI for linked OAuth providers | Backend endpoint `/auth/oauth/link` ready, no frontend surface yet | Build linked-accounts section in organizer/settings.tsx (deferred — security hole closed by backend rejection alone) | S723 |
| eBay DRAFT push creates invisible artifact | Confirmed via eBay official docs: Inventory API offers CANNOT be edited or published through Seller Hub UI ("Listings created through the Inventory API cannot be edited through Seller Hub or any other listing platform"). They must be published via API only. Existing FindA.Sale "Push Behavior" copy "review and publish each one manually" is misleading — that workflow doesn't exist on eBay. | Patrick decides: A) kill DRAFT mode (default everything LIVE), B) switch DRAFT to `/sell/listing/v1_beta/item_draft` beta API (creates Trading-style draft visible in Seller Hub Drafts tab, but separate listing type from Inventory API offers), C) keep offer in our DB + add "Publish to eBay now" button on edit-item that calls `publishOffer` via our backend (organizer finalizes inside FindA.Sale). Recommended: C. | S723 |
| P0-3: Email verification token expiry | Schema migration required — add emailVerificationTokenExpiry field to User model | Run migration, update authController verifyEmail check + resend-verification generation | S722 |
| AuctionNinja + NAA scrapers | enabled:false in sourceRegistry | Decide: set enabled:true to activate | S712 |
| Facebook Marketplace scraper | FB GraphQL doc_id may break with platform changes | Monitor for breakage; fragile by design | S712 |
| directoryMostRecentSource NULL | 84% of organizers have NULL (Phase 2 scrapers write sourcesJson only) | Backfill fix deferred — Phase 2 scrapers need to write the field | S712 |
| MN/MI/TN licensing scrapers | Bot-blocked (Radware/DIFS 403) — graceful no-ops, no failure emails | Needs headless browser + residential proxy (#SCRAPER-HEADLESS-PROXY in Deferred) | S713 |
| Wyoming pawnbroker scraper | wyomingbankingdivision.wyo.gov — not yet investigated this session | Run diagnostic to confirm if still returning data | S713 |
| AI listing enrichment | Fire-and-forget | Check Railway logs for `[listingEnrichmentService]` or query `scrapedMetadata.aiEnriched` | S651 |
| CategoryTopFinds TrendingSection | Cron runs 05:00 UTC — no data until first run | QA after nightly run; verify TrendingSection on `/categories/[category]` | S647 |
| Outreach pipeline open/click tracking | Gmail API live but no cron send yet | After next 4-hour cron window: check Railway logs for send success, then verify pixel route 200 | S721 |

---

## Recent Sessions

### S724 — UX Spot-Check Backlog Burn-Down (COMPLETE)

Reviewed five recent UX spotchecks, grep-verified each issue against live code, then dispatched six parallel general-purpose agents (with embedded findasale-dev context per CLAUDE.md §7) to fix everything still unfixed. Files touched: `pages/organizer/create-sale.tsx`, `pages/organizer/add-items/[saleId].tsx`, `pages/organizer/line-queue/[id].tsx`, `pages/shopper/dashboard.tsx`, `pages/index.tsx`, `pages/sales/[id].tsx`, `pages/organizer/dashboard.tsx`, `pages/organizer/edit-sale/[id].tsx`, `packages/backend/src/controllers/saleController.ts`. Total ~25 distinct fixes shipped across 9 files. Knock-on found and chased: frontend `isOnlineOnly` payload addition was insufficient because backend `saleCreateSchema` (zod) stripped the field before Prisma; backend dispatch added the optional zod field, `saleUpdateSchema = saleCreateSchema.partial()` automatically picks it up. Removal Gate respected throughout — feature-flagged "Enhance All" button instead of deleting it, replaced (not removed) native `confirm()` and `alert()` calls. No subagent git operations. VM-side TS check unreliable (mount truncation); deferred to Vercel/Railway build pipeline for final signal.

### S723 — eBay Push End-to-End + Blocked Queue Burn-Down (COMPLETE)

Patrick's first end-to-end live eBay listing tonight. Cascade of debugging in production: every Railway error log became the next dispatch. Burns down 5 Blocked Queue items (#326, #280, #322, #405 from prior, #422 P1-1) and ships full eBay publish-mode + shipping-cascade infrastructure.

**Dev dispatches:**
1. #326 eBay Comp Tiles — `getItemEbayComps` was returning the `ItemCompLookup` singleton row (one image), but `EbayCompTiles.slice(0,3)` needs an array. Rewrote endpoint to call live `fetchEbayPriceComps` + return top 3 listings with per-listing image/price/condition. Files: itemController.ts, useItemEbayComps.ts.
2. #280 Condition Rating XP — guard required `!item.conditionGrade`, but `processRapidDraft` auto-fills it from AI before organizer ever saves, so guard always blocked legitimate awards. Removed null-check. Single line in itemController.ts.
3. #422 OAuth Option B — full implementation: backend 409 `OAUTH_LINK_REQUIRED` on unauth email-match, new `/auth/oauth/link` endpoint behind `authenticate`, frontend OAuthBridge catches 409 → redirects to `/login?message=...` with amber info banner, next.config.js rewrite for new endpoint. Account takeover vector closed. Settings linked-accounts UI deferred (backend surface ready).
4. eBay publish mode + shipping cascade — `Organizer.ebayDefaultPublishMode` (DRAFT|LIVE) + `ebayDefaultShippingPolicyId` schema + migration + backend whitelist + smart-pick logic + frontend settings UI (eBay tab) + sale-level split buttons (`Push draft` / `Push live`) + per-item override on edit-item. Migration deployed against Railway DB. 8 files.

**Inline edits during iteration:**
5. eBay aspect crash — `enums[0]` fallback was picking "Accordion" for "For Instrument" on MIDI cables (alphabetical). Rewrote `fillRequiredAspects` cascade: tag → keyword → neutral values (Universal/Other/Not Specified/N/A/Does Not Apply) → skip with warn log. Structured `[eBay Push Failed]` log + `[eBay AspectFill]` reason codes. EOF truncation in same file (~120 missing lines in `syncEndedListingsForOrganizer`) restored from git as bonus.
6. eBay `frontendUrl is not defined` + `proxySecret is not defined` — both vars used in pushSaleToEbay loop but never declared in that function (declared locally in other functions only). Added both at top of items loop.
7. eBay smart-pick weight-gate — was picking CALCULATED policy even when `packageWeightOz` was null, causing eBay error 25020. Added `itemHasWeight` param; CALCULATED skipped with warn log if no weight. Falls through to FLAT_RATE → FREE_FALLBACK correctly now.
8. eBay packageType enum allowlist — eBay rejected "BOX" with serialize error. Built valid-enum Set (US-relevant 17 values: MAILING_BOX, PADDED_BAGS, PARCEL_OR_PADDED_ENVELOPE, etc.). Drops invalid values with `[eBay InventoryPayload] dropping invalid packageType="X"` warn. Frontend dropdown rebuilt with real eBay enum values + friendly labels.
9. Edit-item form save coercion — `formData.packageWeightOz/dims` were strings; backend zod required Int, silently dropped strings. Added `toIntOrNull()` coercion in mutationFn payload build.
10. `getItemById` SELECT — package fields not in `select` clause, so GET response didn't include them, form re-loaded blank after save. Added packageWeightOz/Length/Width/Height/Type to SELECT.
11. #322 Encyclopedia category picker — `[ebayTaxonomy] suggestCategories FAILED status=400 "Missing keyword 'q'"`. Vercel proxy only forwards `path` param and drops other query params. Fix: embedded `q` in path query string. After deploy: `count=9` for "guitar multi" + real dropdown working.
12. Auto-save before eBay push — eBay reads DB, not form state, so unsaved edits were lost. Inlined PUT call (not `updateMutation` since onSuccess navigates to /dashboard, which would abort the push). Title validation gate added.
13. Favorite isNot:null fix — `prisma.favorite.findMany({where: {user: {isNot: null}}})` invalid syntax; Favorite.user is required relation. Removed filter; try/catch handles orphan FK runtime errors. Was breaking `getSaleActivity` endpoint.
14. eBay sales/[id]/index.tsx onError signature — Vercel build error: mutation variables type changed to `{itemIds, publishMode}` but onError still expected `string[]`. Updated to destructure `variables.itemIds`.

**Diagnostic logging added (kept in for future debugging):** `[eBay PublishMode]`, `[eBay ShippingPick]`, `[eBay AspectFill]`, `[eBay InventoryPayload]`, `[eBay Push Failed]`, `[ebayTaxonomy] suggestCategories`, `[updateItem]`.

**Verification:** Patrick's live test of Zoom B3 Multi-Effects Processor end-to-end: weight 49oz + dims 10x13x4 + packageType MAILING_BOX saved → auto-save before push fired → eBay offer created → published as DRAFT (offerId=165891558011) → stale-category detection + recreation worked → live-feed PRICE_DROP event fired. Full chain proven.

**Token note:** Patrick flagged limited Sonnet budget Tuesday afternoon → Friday reset. Session ran token-conscious: 2 parallel dev dispatches early, then inline edits for all <20-line iteration fixes, no agent dispatches for log diagnostics. Direct DB updates via psycopg2 used to bypass form-save bug during isolation testing.

### S722 — Monthly Retro + Auth Security Hardening (COMPLETE)

Monthly retro (automated task, 8th of month). 5/9 April recommendations were still open — all dispatched and fixed. Rate limiter fix: loginLimiter raised from 5→15 attempts per 15min + `skipSuccessfulRequests: true` (rate limit was blocking Patrick on two devices at home because Redis persisted failed OAuth attempts from S671-S674 debugging storm). Auth hacker audit: 16 findings (3 P0, 4 P1, 5 P2, 4 P3). 10 fixes applied: access JWT expiry 7d→15m (was valid after cookie expired); /auth/oauth got registerLimiter (was open to account takeover at scale); tokenVersion absent-JWT bypass fixed; organizerTokenVersion check extended to roles[] array; logout clearCookie attributes matched set-cookie; resend-verification regenerates token; jwt.verify locked to HS256; /verify-email got rate limiter; req.ip used for password reset logging; OAuthBridge CSRF skip documented. Two scrapers fixed: OSM changed to overpass.kumi.systems (overpass-api.de was 406 for all 137 metros); Indiana licensing: 3 root causes found (session cookie not forwarded between GET/POST, missing __VIEWSTATEGENERATOR field, missing Recaptcha1 field). Doc cleanup: 22 root violations in claude_docs/ root resolved, 2 deprecated files archived. CLAUDE.md updated: QA ceiling rule (≥8 Blocked Queue → mandatory QA session), dev agent prompt items 5+6 (auth grep, bulk-edit batching), file placement pre-check. SH-020/021/022 added to self_healing_skills.md. Two items deferred: P0-3 (email verification token expiry — needs schema migration) and P1-1 (OAuth auto-link — Patrick decision needed). **Push block in Next Session.**

### S721 — Outreach Gmail API Migration (COMPLETE)

Root cause: Railway Hobby plan blocks SMTP ports 25/465/587 at the network level. Fix: rewrote outreachEmailsCron.ts from nodemailer to Gmail API (googleapis package). Created GCP OAuth client under outreach@finda.sale, obtained refresh token with proper credential binding (OAuth Playground "Use your own OAuth credentials" checkbox is critical). Live test email sent successfully via Gmail API from VM (message ID 19e1d4e882ea0c52). GMAIL_REFRESH_TOKEN updated in Railway, backend redeployed. Cron registered every 4 hours — next window will send via Gmail API over HTTPS port 443. Changed files: packages/backend/src/jobs/outreachEmailsCron.ts (full rewrite of transport layer), packages/backend/package.json (added googleapis). OAuth debug lesson: tokens from OAuth Playground are bound to whichever client credentials were active during authorization — if the checkbox wasn't checked, the token is bound to Google's Playground client ID and will fail with invalid_grant when used with your custom client.

### S719 — Chrome QA Sprint (COMPLETE)

Chrome QA on Blocked Queue items. #251 Markdown badge ✅ (verified: ~~$75.00~~ $56.25 on Victorian Silver Pocket Watch sale card). #271 TEAMS copy ✅ (Webhooks line on /pricing TEAMS column). #330 Appraisals ✅ (edit-item button + /organizer/appraisals page both work). Bugs found: #326 eBay Comp Tiles ❌ (summary card renders but EbayCompTiles image grid not shown — dispatch needed to check render condition). #280 Condition Rating XP ❌ (grade B set+saved, XP balance stuck at 15 — XP not awarded). #322 Encyclopedia Inline Tip UNVERIFIED (category picker doesn't resolve free-text inputs). #405 Founding Badge shipped: backend now returns foundingOrgBadge in GET /organizers/:id, frontend renders amber pill badge in trust-signal cluster on storefront — push block pending. Outreach cron code confirmed deployed but Railway log window too short for historical confirm.

### S718 — QA Sprint + Outreach Live (COMPLETE)

Chrome QA: #228 Settlement Receipt ✅, #241 Brand Kit PDFs ✅, #235 Charity Close ✅, #369 Quebec Block ✅ (Canada→Quebec→amber warning + disabled Register), #407 Flip Tracker ROI ✅ (Signed First Edition Novel: $500 revenue - $300 costBasis = +$200 net profit, +66.7% ROI shown in flip-report). Outreach live: OUTREACH_ENABLED=true, cron every 4h, 183 organizers queued. #405 Founding Badge: settings Profile tab renders 🏆 badge when foundingOrgBadge=true — but storefront copy claim "badge appears on your storefront" has no storefront implementation (gap, DECISION needed). #251 Markdown badge: item changed AUCTION→STANDARD (psycopg2); rate limit blocked Chrome verify this session. Purchase record created for Flip Tracker ROI (psycopg2). Data seeded: costBasis, PAID purchase, markdownApplied, priceBeforeMarkdown.

### S717 — eBay Price Comps + Backend Crash Fix (COMPLETE — wrap)

Backend crash loop fixed (ebayController.ts truncated mid-template-literal — 15 lines missing, restored from git). Browse API price comps fixed: `sort=price` → `sort=bestMatch`; added `cleanTitle()` to strip post-comma content, generic words, cap at 5 words — "Zoom B3 Multi-Effects Processor, Rec, Model B3" now searches "Zoom B3 Multi-Effects Processor". eBay developer account audit: Growth Check (Incident 260428-000018, filed 2026-04-28) was filed under artifactmi@gmail.com (Patrick's personal eBay seller account, username artifactcoinsandcollectibles) — production keys on deseee1/deseee@yahoo.com. Draft reply prepared to correct App ID + add Finding API request. No Finding API approval yet. Vercel proxy `EBAY_CLIENT_SECRET` was file secret (not plain text) — fixed in Vercel dashboard. React hooks order crash (#310) — `isDark` useState/useEffect were after early return — moved above all early returns.

### S716 — QA Sprint + 4 Bug Fixes (COMPLETE — wrap)

Chrome QA on 10 features from S712 backlog. ✅ Verified: #411 Dorm Dash (crash fixed), Wave 2 edit-sale (all 6 fields), #412 Cash Bridge POS (handle fields added), Leaderboard, #304 Early Access Cache, #288 Featured Boost, #310 Color Discount Rules. Three P1 bugs found and fixed: #241 Brand Kit PDFs + #228 Settlement Receipt shared root cause (download links used localStorage for auth, empty after cookie migration — replaced with axios+withCredentials). #235 Charity Close — `getUnsoldItems` used `notIn:['SOLD','RESERVED']` but donationController required `status==='AVAILABLE'` — fixed to `status:'AVAILABLE'`. Mid-session fix: #412 Venmo/Zelle handle fields added to Settings Profile tab + PATCH endpoint + POS display. #174 Auction Mechanics human-verified by Patrick. All 3 P1 fixes pending re-verify after push.

### S715 — Scraper Egress Investigation & Fix (COMPLETE — wrap)

117GB Railway Postgres egress traced to runaway NY Phase 2 GitHub Actions workflow (ran ~9 hours, bulk-downloading 29,728 NYC resale license records over public proxy). Investigation path: Railway MCP logs → Postgres checkpoint distances + duplicate-key error pattern (`scraper+*-newyorkphase2@system.finda.sale`) → GitHub Actions workflow identified and manually stopped by Patrick. Root cause: all 45 Phase 2 state scrapers download entire Socrata datasets locally then filter in code. Fixes shipped: (1) server-side `$where`/`$q` Socrata filtering added to 9 scrapers missing it (CA, CT, HI, IL, NV, NY, PA, TX, VA — CO/IA/LA already had filters), (2) P2002 timestamp-suffix duplicate fallback replaced with existing-record lookup in `index.ts`, (3) `timeout-minutes: 60` added to 40 Phase 2 workflows. DB: 23 junk records deleted, 356 legit NY businesses promoted to WARM leadTier. 626 timestamp-dupe organizers with Sales attached — left in place (inert). External brute-force on public proxy confirmed routine internet scanning, not targeted. Google Places API deprecated (not in scope).

### S714 — SEO Content Foundation (COMPLETE — wrap)

384 SEO guide pages generated and live in index.json: 34 Haiku pricing guides (antiques, furniture, jewelry, glass, tools, art — post-processed via fix-seo-batch.js: markdown fence strip, two-array corruption repair, field rename title→heading/content→body, flat→nested content structure, seoScore stripped, saleType normalized to "general") + 350 template pages (city×category + trend reports) from generate-template-pages.mjs. Scripts built: fix-seo-batch.js (fixer + --merge mode) and generate-template-pages.mjs. System prompt in seo-pages-haiku-generator.md updated: correct field names in example JSON, seoScore removed, 15-item batch limit documented. After-reset dispatch at claude_docs/strategy/seo-agent-dispatch.md for 116 remaining pages (batch1b items 35-50 + batch2 50 + batch3 50). Pages served at /guide/[slug], ISR 24hr revalidate, sitemap auto-populates.

### S713 — Scraper Repair Batch (COMPLETE — wrap)

Two emergency MCP pushes to fix backend crash loops (missing yellowPagesCaScraper.ts from subagent write failure; missing export default router from parallel agent conflict on internal.ts). Scraper fixes shipped: OSM 406 (form-encoded POST), GarageSaleFinder hidden-address parse recovery (~50% listing improvement), Missouri auctioneer TLS (axios rejectUnauthorized:false), weekly digest FK crash (Organizer ID → User ID), Canada outreach → OUTREACH_CANADA_ENABLED flag, YellowPages.ca scraper (10 provinces, 6 keywords, JSON-LD), AuctionZip + Canada411 workflows disabled, Missouri pawnbroker schedule disabled. Oklahoma pawnbroker: real PDF scraper (pdf-parse, ODCC monthly roster, 215+ licensees). Louisiana auctioneer: real POST scraper (lalb.org/all_auctioneer-bus.php, cheerio, 76 businesses). pdf-parse added to backend package.json. Roadmap: #SCRAPER-HEADLESS-PROXY added to Deferred (MN/MI/TN need residential proxy). Railway confirmed green after pushes. Patrick: run git fetch && git pull + pnpm install before next push.ps1.

### S711 — Wave 2 Chrome QA Sprint (COMPLETE — wrap)

Chrome QA on 12 Wave 2 features (main session, no subagent). ✅ #406 Split Bill (both persons paid, counter correct). ⚠️ #407 Flip Tracker (Cost Basis input works, Flip Report renders, ROI needs sold items — queued). UNVERIFIED: #405 Founding Badge (no display surface found anywhere), #369 Quebec block (needs test user). P0 found: DORM_DASH sale type crashes wizard on selection (other sale types unaffected per Patrick). 6 Wave 2 per-sale features absent from /organizer/edit-sale: Safety Notes, Grief Firewall, Sale Floor Map, Bundle Pricing, Cover the Fee, Donation Kit — organizers can't access them. P2: Leaderboard "Failed to load leaderboard data." Product decisions: #412 Cash Bridge → Venmo/Zelle as POS buttons with Stripe fee, remove from Settings standalone; #402 Cover the Fee → Auction sale type only. P0 Dorm Dash wizard crash dispatched to findasale-dev (S711 post-wrap).

---

## Next Session — S725

### First Action — Chrome QA Smoke Test on S723 + S724 Fixes

S724 added a second wave of changes (UX spotcheck burn-down). The S724 verification checklist is separate from the S723 list — see "S724 Verification Checklist" below. Run the S723 checklist (below) first, then S724.

### S724 Verification Checklist (Chrome QA)

1. `/organizer/create-sale` Step 2 → toggle "Online Only" → publish → verify the new Sale row in DB has `isOnlineOnly=true` (psycopg2 query against Railway).
2. `/organizer/create-sale` Step 3 → tab through photo thumbnails with keyboard → confirm screen reader announces "Move photo left/right/Remove photo" not Unicode glyphs.
3. `/organizer/line-queue/[saleId]` as a non-organizer account → expect redirect to /login, NO React "Rendered fewer hooks than expected" error in DevTools console.
4. `/organizer/line-queue/[saleId]` → kill backend → wait 30s → confirm "⚠ Not updating" amber indicator appears.
5. `/shopper/dashboard` → click "Copy Referral Link" → expect a toast (no native browser alert).
6. `/` (homepage) as guest → type a search → confirm "Sign in to save" link appears (not the broken Save button). Sign in → confirm Save button appears.
7. `/sales/[id]` an auction sale → view source on `<head>` → confirm exactly ONE `<meta property="og:title">` element (was duplicating).
8. `/sales/[id]` an auction sale with buyer's premium → scroll to items section → confirm the buyer's premium block sits immediately above "Auction Items" header (was hidden in left column).
9. `/organizer/dashboard` → reopen an ended sale → expect no full-page flash (was reloading).
10. `/organizer/edit-sale/[id]` → click any field label → confirm focus lands on the matching input (proves `htmlFor`/`id` pairing).
11. `/organizer/add-items/[saleId]` → bundle row → click Remove → expect inline Confirm/Cancel (not native confirm dialog).

### First Action — Chrome QA Smoke Test on S723 Fixes

Per CLAUDE.md §10 (Post-fix live verification): the next session MUST start with a Chrome smoke test of the S723 fixes before any new work. Pages to hit:

1. `/organizer/edit-item/[id]` — confirm packageType dropdown shows new eBay enum values (MAILING_BOX, PADDED_BAGS, etc., NOT "Box / Mailing Tube / Thick Envelope"). Save weight/dims/packageType → reload → values still there. Click Push to eBay → toast confirms push, NO category/price reversion.
2. `/organizer/edit-item/[id]` EbayCompTiles — eBay summary card AND 2-3 image tile grid both render.
3. Condition grade B/A/etc. on a fresh item → XP balance +5 in guild ledger.
4. Logged-out attempt: register `victim@yahoo.com` w/ password, sign out, click Sign in with Google using same email → expect amber banner redirect to /login, NO silent takeover.
5. EbayCategoryPicker on edit-item — type "musical", "guitar", "table" → dropdown should populate with real eBay categories.

### S723 Wrap Push Block

Most code files were pushed iteratively during the session. The final wrap push consolidates any remaining uncommitted changes + the doc updates (STATE.md + dashboard are HARD RULE per CLAUDE.md §12). Run:

```powershell
# Most likely still uncommitted (last-iteration code edits)
git add packages/backend/src/controllers/itemController.ts
git add packages/backend/src/controllers/saleController.ts
git add packages/frontend/pages/organizer/edit-item/[id].tsx

# Wrap doc updates (HARD RULE §12)
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md

git commit -m "S723 wrap: auto-save before eBay push, Favorite isNot:null fix, getItemById package fields, [updateItem] diagnostic log; doc updates"
.\push.ps1
```

If `push.ps1` flags additional uncommitted files (likely `ebayController.ts`, `ebayTaxonomyService.ts`, or any frontend file not yet pushed), `git add` them and commit again — they're all S723 work.

### Priority 1 — Chrome QA on S723 fixes (see "First Action" above)

### Priority 2 — Schema Migration (P0-3: Email Verification Token Expiry)

Email verification tokens currently never expire. Add `emailVerificationTokenExpiry DateTime?` to User model, update authController verifyEmail check + resend-verification generation. Dispatch findasale-dev with schema-change protocol (§6).

### Priority 3 — Verify Outreach Gmail API Sends

Check Railway logs for outreach cron execution since S721/S722 deploy. Look for `[OutreachCron]` success lines + verify Gmail API quota usage on console.cloud.google.com.

### Priority 4 — Build Settings UI for OAuth Linked Accounts

Backend `/auth/oauth/link` endpoint is ready (S723). No frontend surface yet. Build linked-accounts section in `pages/organizer/settings.tsx` (or a new `/settings/security` tab) — list connected providers, "Link Google" button that initiates OAuth, "Unlink" button.

### Other Blocked Queue Items (low priority)

- Wyoming pawnbroker scraper — diagnostic needed
- AI listing enrichment — check Railway logs for `[listingEnrichmentService]`
- CategoryTopFinds TrendingSection — verify after nightly 05:00 UTC cron
- Outreach open/click pixel tracking — verify after first Gmail API cron send
- AuctionNinja + NAA scrapers — flag in sourceRegistry decision needed
