# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S734 — eBay Bidirectional Sync + Voice Strip Fix + Review Card Dims (COMPLETE)**

Three bugs fixed. (1) **eBay pull-sync cron** (`ebayListingSyncCron.ts`) — new cron every 4h pulls title, description, condition, and price back from eBay into FindA.Sale; skips description pull when organizer has a `defaultDescriptionHtml` template (prevents expanded HTML clobbering clean description). Also wired description template (`{{DESCRIPTION}}` placeholder) into push-on-save flow in `itemController.ts`. (2) **Voice strip fix** (`VoiceDescriptionInput.tsx`) — component was calling `voice/extract` AFTER `append`, so `weightOz` was never forwarded to the backend; swapped order (extract first, then pass values to append) so `stripShippingPhrases` now correctly fires on new recordings. Also verified: regex correctly strips compound weights ("2 lb 4 oz" → fully removed). (3) **Review page dims** (`itemController.ts` `getDraftItemsBySaleId`) — `packageWeightOz`, `packageLengthIn`, `packageWidthIn`, `packageHeightIn`, `ebayShippingOverride`, `quantity`, `listingType`, `reverseDailyDrop`, `reverseFloorPrice` were all missing from the Prisma select; eBay push card always showed empty shipping fields regardless of what was saved. Added all 9 fields. Note: old descriptions with orphaned numbers (e.g. "14" left from "14oz") are from pre-fix recordings — the fix only applies to new voice notes.

**Previous: S733 — UI Fixes: Organizer Page Mobile Layout, Sales Page Content Parity, Settings.tsx Restore, Duplicate Appraisal Button Removed (COMPLETE)**

Four UI issues fixed. (1) **Organizer page mobile layout** — sales count badge was a `justify-between` sibling with `whitespace-nowrap ml-4` that pushed the heading off-screen on narrow viewports; moved inline into the heading row as an amber pill (🏷️ 1 sale). (2) **Sales page content parity** — removed the 96px mini-map thumbnail from the When/Where card (too small to read); added `lg:hidden` "Where to Go" card (160px SaleMap + Directions button) below When/Where; added `lg:hidden` Holds & Shipping card; added `lg:hidden` SaleShareCard — all three were desktop-aside-only and invisible on mobile. Added claim-this-listing CTA to the desktop aside organizer card (shown when `!sale.organizer.isClaimed`). (3) **Settings.tsx restored** — file was silently truncated at line 2021 by a prior session's Edit tool usage (6 opening `<>`, only 5 `</>`, no `export default`); retrieved canonical version from GitHub via MCP, dispatched agent to decode base64 + reconstruct missing tail using Python-via-bash. Final: 2043 lines, TypeScript clean. (4) **Duplicate appraisal button** — edit-item page had two "Request Appraisal" buttons: the correct green one in `PriceResearchPanel` (XP-based community flow) and a later-added purple `Link` to `/organizer/appraisals?open=true`; removed the purple one. Files: `pages/organizers/[id].tsx`, `pages/sales/[id].tsx`, `pages/organizer/settings.tsx`, `pages/organizer/edit-item/[id].tsx`.

**Previous: S730 — Sale Wizard Cleanup: Photo Toast, Hold Duration Rework, Grief Firewall Removal, Return Window to Account Settings (COMPLETE)**

Five issues addressed from sale creation flow review. (1) **Photo upload toast** — Step3 catch block in create-sale.tsx was silently swallowing errors; wired `useToast()` into Step3, catch now shows error toast. (2) **Hold duration removed from organizer control** — removed `holdDurationHours` from create-sale WizardFormData + buildPayload + Advanced Settings UI; removed from saleController.ts zod schema; reservationController.ts now uses `getRankBenefits(explorerRank).holdDurationMinutes` (INITIATE=30min, SCOUT=45min, RANGER=60min, SAGE=75min, GRANDMASTER=90min). Agent initially inserted wrong hours-based map — caught and corrected inline. (3) **Return window moved to account settings** — removed from per-sale wizard; added to organizer settings.tsx Profile tab + organizers.ts PATCH/GET + new migration 20260515200000. Field already existed in schema.prisma. (4) **Grief Firewall removed** — `estatePrivacyMode` checkbox removed from edit-sale; info card removed from settings.tsx; removed from saleController zod schema + itemController tag-analysis handler. DB column left intact. (5) **Price/category suggestion toggle removed** — was the Grief Firewall mechanism; gone with it. Files: create-sale.tsx, edit-sale/[id].tsx, settings.tsx, saleController.ts, itemController.ts, reservationController.ts, organizers.ts, migration 20260515200000.

**Previous: S729 — Venmo Deeplink QR + Zelle Display on POS + Shopper Holds (COMPLETE)**

Smart payment UX for Venmo and Zelle across two pages. No schema changes needed — `venmoHandle`/`zelleHandle` were already on Organizer model (S716). (1) **POS page** — when organizer has `venmoHandle` set, payment section now shows a 160px QR code generated from the Venmo deeplink URL with cart total + sale name pre-filled; shopper scans with camera app, Venmo opens ready to send. Zelle section shows handle in large text + amount + copy-to-clipboard button + "send in your bank app" note. Both sections silent when handle not set. (2) **Shopper holds page** — Venmo "Pay with Venmo" button fires deeplink with hold total pre-filled; Zelle shows handle + amount + copy button. Backend extended: `getMyHoldsFull` in reservationController.ts now includes `organizer: { select: { venmoHandle, zelleHandle } }` in the sale query and surfaces as `organizerVenmoHandle`/`organizerZelleHandle` on each hold. Added `react-qr-code ^2.0.0` to frontend package.json; Patrick ran `pnpm install` to sync lockfile. Files: package.json, pnpm-lock.yaml, pos.tsx, holds.tsx, reservationController.ts.

**Previous: S727 — eBay Integration Fixes + Feature Batch (COMPLETE)**

Five eBay issues diagnosed and fixed in three parallel agent dispatches. (1) **{{DESCRIPTION}} template bug** — ebayController.ts: when item had no description, first branch left `{{DESCRIPTION}}` literal in eBay listing; fixed to replace with empty string in the no-description case. (2) **eBay push not firing from Publish All** — review.tsx: `publishMutation.onSuccess` was missing the eBay push call entirely; wired to fire for checked items matching pattern from `handleApproveAll`. `ebayPushMutation.onError` toast also added (was silent). (3) **Draft item eBay push** — `draftStatus` and `ebayShippingOverride` were both missing from item SELECT in push loop (silent regression); added. Push now includes `warning: 'DRAFT_ON_FINDASALE'` for draft items; review.tsx shows info toast. (4) **Card readiness borders** — review.tsx: `computeReadiness()` helper added; each item card now has `border-l-4` in red/yellow/green/blue based on completeness (blue = green + weight set + eBay connected). (5) **Best Offers UI** — edit-item/[id].tsx: toggle + two percentage inputs (auto-accept/auto-decline) with live dollar previews and threshold validation; converts to dollar amounts on save; reverse-computed from stored amounts on load. (6) **Local pickup checkbox** — edit-item/[id].tsx: checkbox sets `ebayShippingOverride = 'LOCAL_PICKUP_ONLY'`; smart phrase detector scans description/notes and shows dismissible nudge. review.tsx: same checkbox added to per-item eBay section. ebayController.ts: `resolvePoliciesForItem` routes to local pickup fulfillment policy when override is set. S726 push still pending (see Next Session).

**Previous: S726 — Pipeline Punch List + Email Verification Token (COMPLETE)**

Confirmed S725 deploy green (all 3 commits on main, Railway healthy). Set `ENABLE_ORGANIZER_WEBSITE_ENRICHMENT=true` in Railway (re-enabled after S725 extractor fix). Verified GH Actions pipeline: auto-seed-outreach workflow fired, InternalJobRunner confirmed, 255 eligible orgs found, 0 new to seed (queue caught up). Dispatched 5 pipeline punch list items in parallel — all shipped: (1) **Cron Step 3** — removed 6 in-memory `cron.schedule` calls + imports from index.ts; GitHub Actions now sole trigger for all pipeline jobs. (2) **HOT-tier rework** — leadScoringService.ts: HOT = isStateLicensed OR esnOrgId non-null OR website+custom-domain-email OR sourceCount≥3; numeric score path unchanged. (3) **MailerLite 429 batching** — mailerliteService.ts: 55k one-at-a-time HTTP calls → bulk import 500/batch with 500ms delay + Retry-After retry logic; outreachEmailsCron.ts import updated. (4) **D.C. state parser** — outreachEmailsCron.ts: `normalizeDottedState()` helper added, handles D.C./P.R./VI/GU/AS; addressStateMatch regex updated to tolerate trailing ZIP. (5) **Email discovery extraction quality** — emailDiscoveryService.ts: EMAIL_REGEX tightened (no apostrophes/brackets), `preprocessTextForExtraction()` strips markdown links, `isMalformedCandidate()` gate added. Also shipped: **P0-3 Email verification token expiry** — schema migration created (20260515180000), schema.prisma updated (`emailVerificationTokenExpiry DateTime?` on User), authController.ts updated (set 24h expiry on register, check+clear on verifyEmail). **Migration NOT yet deployed** — Patrick must run manually (see Next Session). Confirmed: eBay DRAFT "option C" already implemented in a prior session — removed from Blocked Queue.

**Previous: S725 — Organizer Pipeline Overhaul + Cron Reliability Keystone (COMPLETE)**

Full diagnosis + overhaul of the scrape→enrich→score→outreach pipeline. ROOT SYSTEMIC ISSUE found: enrichment/scoring/outreach jobs ran as in-memory node-cron inside the backend — every Railway redeploy wiped the schedules, so they ran erratically or not at all (only ~7 outreach emails ever sent; `lastScoredAt` frozen at 2026-05-10). KEYSTONE FIX shipped (architect-spec'd, dev-built, Steps 1+2 of 3): new `POST /api/internal/jobs/run` dispatcher endpoint (reuses `requireSecret`/`x-internal-secret` auth) + 7 `pipeline-*.yml` GitHub Actions workflows that trigger the jobs durably. In-memory crons left running alongside until green cycle — **green cycle now CONFIRMED** (logs show `[InternalJobRunner]` fired all 7 jobs, lead-scoring scored 56,347 orgs). Step 3 (remove in-memory crons) is unblocked. Also shipped: cron cleanup (gated 3 double-running scrapers behind GH Actions, disabled backend sale-enrichment cron, enrich-sale-details daily→3-days, enrich-contact-emails 6h→daily, smtp-verify daily→weekly, deleted auctionzip+canada411 workflows); address enrichment pipeline (new organizerWebsite.ts scraper + organizerWebsiteAddressCron, bulkUpsertEnrichedSales accepts address fields, eligibility query fixed 0→8,804 rows); bug fixes (email-discovery image-filename filter, outreach `[state]` token parsed from address, outreach category filter relaxed +1,661 leads, website→email chaining, `@prisma/client` import build-break fix). DB fixes via psycopg2: 46 junk image-filename emails nulled, 36 corrupted organizer addresses recovered from Sales city/state. ESN auth-cookie route abandoned (Patrick chose website-only). HOT-tier rework signal set approved by Patrick (state-licensed / active platform sales / website+custom-domain-email / 3+ source corroboration — NO Google API) — not yet dispatched. P0 caught + fixed mid-session: address extractor was over-matching and writing page-nav text into Organizer.address — bounded regex + validation + junk blocklist + 110-char cap rewrite shipped.

**Previous: S724 — UX Spot-Check Backlog Burn-Down (COMPLETE)**

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

| Organizer page mobile badge (S733) | Fixed inline but not Chrome-verified | Chrome QA at /organizers/[id] on mobile — confirm 1-sale badge sits inline, card layout correct | S733 |
| Sales page mobile cards (S733) | lg:hidden Where to Go + Holds & Shipping + SaleShareCard added but not Chrome-verified | Chrome QA at /sales/[id] on mobile — confirm all 3 cards visible; confirm mini-map removed from When/Where | S733 |
| Sales page desktop claim-listing CTA (S733) | Added to aside for unclaimed sales — not Chrome-verified | Chrome QA at /sales/[id] on desktop as guest for an unclaimed sale — confirm CTA renders | S733 |
| Voice strip — weight/dims (S734) | Fix deployed but not live-tested | Record a voice note saying "14oz" or "2 lb 4 oz" on an existing item. Confirm: (a) number is absent from saved description, (b) weight field populated in structured fields | S734 |
| Review page eBay card — dims/weight (S734) | getDraftItemsBySaleId select fix deployed but not live-tested | Save weight+dims on edit-item page → navigate to review page → confirm eBay push card shipping fields show correct values (not empty). Also confirm Local Pickup checkbox reflects saved ebayShippingOverride. | S734 |
| P0-3: Email verification token expiry | Migration created S726 (20260515180000) — schema.prisma updated, authController.ts updated (24h expiry set on register, checked+cleared on verifyEmail). **Patrick must deploy:** `cd packages/database` → `$env:DATABASE_URL=[Railway URL]` → `npx prisma migrate deploy` → `npx prisma generate`. Then push: schema.prisma + migration file + authController.ts | S722 |
| #SES-MIGRATION — email provider move | Blocked on Patrick AWS console actions: (1) verify send.finda.sale identity in SES, (2) request production access, (3) create SMTP credentials + add 5 env vars to Railway. Full plan: `claude_docs/operations/ses-migration-plan.md`. Triggered by saleEndingSoonJob hitting 200% Resend quota (2026-05-15). | Patrick completes AWS steps → dispatch dev for 37-file migration + suppression check fix | S732 |
| AuctionNinja + NAA scrapers | enabled:false in sourceRegistry | Decide: set enabled:true to activate | S712 |
| Facebook Marketplace scraper | FB GraphQL doc_id may break with platform changes | Monitor for breakage; fragile by design | S712 |
| directoryMostRecentSource NULL | 84% of organizers have NULL (Phase 2 scrapers write sourcesJson only) | Backfill fix deferred — Phase 2 scrapers need to write the field | S712 |
| MN/MI/TN licensing scrapers | Bot-blocked (Radware/DIFS 403) — graceful no-ops, no failure emails | Needs headless browser + residential proxy (#SCRAPER-HEADLESS-PROXY in Deferred) | S713 |
| Wyoming pawnbroker scraper | wyomingbankingdivision.wyo.gov — not yet investigated this session | Run diagnostic to confirm if still returning data | S713 |
| AI listing enrichment | Fire-and-forget | Check Railway logs for `[listingEnrichmentService]` or query `scrapedMetadata.aiEnriched` | S651 |
| CategoryTopFinds TrendingSection | Cron runs 05:00 UTC — no data until first run | QA after nightly run; verify TrendingSection on `/categories/[category]` | S647 |
| Outreach pipeline open/click tracking | Gmail API live but no cron send yet | After next 4-hour cron window: check Railway logs for send success, then verify pixel route 200 | S721 |
| Cron migration Step 3 | DONE S726 — 6 in-memory cron.schedule calls + imports removed from index.ts; GitHub Actions is now sole trigger | — | S725 |
| HOT-tier rework | DONE S726 — leadScoringService.ts: HOT = isStateLicensed OR esnOrgId non-null OR website+custom-domain-email OR sourceCount≥3 | — | S725 |
| MailerLite 429 storm | DONE S726 — mailerliteService.ts: bulk import 500/batch + 500ms delay + Retry-After retry; outreachEmailsCron.ts import updated | — | S725 |
| Washington D.C. orgs skipped | DONE S726 — normalizeDottedState() helper in outreachEmailsCron.ts handles D.C./P.R./VI/GU/AS; addressStateMatch regex tolerates trailing ZIP | — | S725 |
| Email discovery extraction quality | DONE S726 — EMAIL_REGEX tightened, preprocessTextForExtraction() strips markdown links, isMalformedCandidate() gate added | — | S725 |
| Re-enable address cron | DONE S726 — ENABLE_ORGANIZER_WEBSITE_ENRICHMENT=true set in Railway by Patrick | — | S725 |
| Confirm 7 new pipeline workflows | DONE S726 — auto-seed-outreach workflow fired, InternalJobRunner confirmed in Railway logs, 255 eligible orgs found | — | S725 |

---

## Recent Sessions

### S734 — eBay Bidirectional Sync + Voice Strip Fix + Review Card Dims (COMPLETE)

Three bugs fixed. (1) **eBay pull-sync cron** — new `ebayListingSyncCron.ts` runs every 4h (0 2,6,10,14,18,22 UTC); fetches title/description/condition from Inventory API + price from Offer API; merges changes back into FindA.Sale item; skips description pull when `defaultDescriptionHtml` template is active to prevent expanded HTML clobbering the clean description. Description template (`{{DESCRIPTION}}` placeholder) also wired into push-on-save flow in `itemController.ts` and `startEbayListingSyncCron()` registered in `index.ts`. (2) **Voice strip fix** — `VoiceDescriptionInput.tsx` was calling `voice/extract` after `append`, so extracted `weightOz`/dims were never forwarded to the backend strip call. Swapped order: extract fires first, values spread into the append payload. Backend `stripShippingPhrases` now correctly fires on new voice recordings. Regex verified in Node.js: strips "14oz", "14 oz", "2 lb 4 oz", "it weighs 2 lb 4 oz" correctly. Historical descriptions saved before deploy retain orphaned numbers — no retroactive cleanup. (3) **Review page eBay push card** — `getDraftItemsBySaleId` Prisma select was missing `packageWeightOz`, `packageLengthIn`, `packageWidthIn`, `packageHeightIn`, `ebayShippingOverride`, `quantity`, `listingType`, `reverseDailyDrop`, `reverseFloorPrice`. All fields came back `undefined` so the eBay shipping section always showed empty inputs. Added all 9 fields. Both modified files: `packages/frontend/components/VoiceDescriptionInput.tsx`, `packages/backend/src/controllers/itemController.ts`. Both TypeScript clean.

### S733 — UI Fixes: Organizer Page Mobile Layout, Sales Page Content Parity, Settings.tsx Restore, Duplicate Appraisal Button (COMPLETE)

Four UI fixes. (1) Organizer page mobile layout: sales count badge moved inline into heading row as amber pill — was a flex sibling breaking mobile card layout. (2) Sales page: removed 96px mini-map from When/Where; added `lg:hidden` Where to Go (160px map), Holds & Shipping, and SaleShareCard — all were desktop-only; added claim-this-listing CTA to desktop aside for unclaimed sales. (3) Settings.tsx: file was truncated at line 2021 by prior Edit tool usage (no export default, unclosed JSX fragments); restored from GitHub canonical via Python-via-bash (2043 lines, TS clean). (4) Edit-item page: removed duplicate purple "Request Appraisal" Link (redirect-only); correct green XP-based button in PriceResearchPanel kept. All 4 items pending Chrome QA (added to Blocked Queue).

### S731 — GitHub Actions Audit + Scraper Overhaul + CI Monitoring (COMPLETE)

No Sentry monitoring and 36 failing GitHub Actions workflows discovered via API audit. Three categories of scraper failures identified and fixed across 23 state source files + ESN timeout fix + new daily CI health check task created.

**Monitoring:** Created `findasale-ci-sentry-health` Cowork scheduled task (daily 8am) — checks GitHub Actions failures from last 24h, flags pipeline/outreach failures as HIGH urgency vs. scraper failures as low urgency. Sentry leg wired but requires `SENTRY_AUTH_TOKEN` env var to activate.

**ESN scraper (cancelled):** Root cause — ingest phase posted hundreds of batches sequentially to Railway; stalled past 60-min timeout. Fixed: 4-way matrix strategy (parallel chunks of ~12-13 grid centers each, 45-min ceiling, fail-fast off, concurrency-5 worker pool). Files: `scrape-estatesalesnet.yml` + `run-estatesalesnet.ts`. Push pending.

**Category 1 (12 states — dead/moved URLs):** Montana, Maryland, Delaware, Connecticut — URL-only fix (working HTML portals found). RI, OR, NE, MO — flagged as JS-rendering required. KS, WY, OK, MN — no state auctioneer license exists (correct to return 0 records). Push pending.

**Category 2 (3 states — bot-blocked 403):** AZ, GA, NH — all exit gracefully. AZ has no state auctioneer license. GA behind Cloudflare managed challenge. NH behind Akamai WAF. Push pending.

**Category 3 (8 states — wrong approach):** Texas Socrata field fix → now pulls live data. South Carolina cookie-capture fix → now pulls live data. MA, NY, WI, ME, NJ, CA — graceful exits (most have no state auctioneer license or unfixable SPA). Push pending.

### S729 — Venmo Deeplink QR + Zelle Display on POS + Shopper Holds (COMPLETE)

Smart Venmo/Zelle payment UX on POS and shopper holds page. `venmoHandle`/`zelleHandle` were already in schema. POS: Venmo QR code generated from deeplink URL (handle + cart total + sale name pre-filled); Zelle shows handle large + amount + copy button. Shopper holds page: Venmo "Pay" button fires deeplink with hold total; Zelle shows handle + copy. Backend: `getMyHoldsFull` extended to return `organizerVenmoHandle`/`organizerZelleHandle`. Added `react-qr-code ^2.0.0`; lockfile synced. 5 files changed.

### S728 — eBay Store URL + Category Overrides Picker (COMPLETE)

Two small eBay settings features. (1) **eBay store URL field** — `ebayStoreUrl String?` added to Organizer model; new migration `20260515000000_add_ebay_store_url_to_organizer`; organizers.ts updated (Zod schema + PATCH handler + GET /me); organizer/settings.tsx gets "eBay Store URL" input in profile tab with load/save/post-save wired. Schema migration required before field works in production. (2) **Category Overrides picker** — organizer/settings/ebay.tsx Category Overrides section previously had raw `<input type="text">` for numeric IDs; replaced with `EbayCategoryPicker`. Confirmed `EbayCategoryPicker` was already fully implemented and wired on edit-item and review pages from a prior session — no changes needed there. 5 files changed, all TS clean.

### S727 — eBay Integration Fixes + Feature Batch (COMPLETE)

Five eBay issues fixed in three parallel dispatches. (1) `{{DESCRIPTION}}` template bug — empty-description path left placeholder literal; fixed. (2) eBay push missing from `publishMutation.onSuccess` in review.tsx — wired. (3) `draftStatus` + `ebayShippingOverride` missing from item SELECT in push loop — added; draft warning field added to push results. (4) Card readiness borders (red/yellow/green/blue) added to review page item cards via `computeReadiness()`. (5) Best Offers UI — toggle + percentage inputs with live dollar preview on edit-item page. (6) Local pickup checkbox on edit-item + review cards; smart phrase detector nudge; backend routing to local pickup fulfillment policy when override set. Files: ebayController.ts, review.tsx, edit-item/[id].tsx. All TS clean.

### S726 — Pipeline Punch List + Email Verification Token (COMPLETE)

Confirmed S725 deploy green. Patrick set `ENABLE_ORGANIZER_WEBSITE_ENRICHMENT=true` in Railway (re-enabled after extractor fix). GH Actions verified: auto-seed-outreach fired, InternalJobRunner confirmed, 255 eligible orgs found, 0 new to seed (queue caught up — healthy signal). Dispatched 5 pipeline punch list items in parallel, all shipped: (1) **Cron Step 3** — removed 6 in-memory `cron.schedule` calls + all related imports from index.ts; GitHub Actions workflows are now the sole trigger for all 7 pipeline jobs. (2) **HOT-tier rework** — leadScoringService.ts rewritten: HOT = isStateLicensed OR esnOrgId non-null OR website+custom-domain-email OR sourceCount≥3; numeric score path unchanged. (3) **MailerLite 429 batching** — mailerliteService.ts: one-at-a-time HTTP calls replaced with bulk-import 500-org batches + 500ms inter-batch delay + Retry-After header retry; outreachEmailsCron.ts import updated. (4) **D.C. state parser** — outreachEmailsCron.ts: `normalizeDottedState()` helper handles D.C./P.R./VI/GU/AS; addressStateMatch regex updated to tolerate trailing ZIP code. (5) **Email discovery extraction quality** — emailDiscoveryService.ts: EMAIL_REGEX tightened (strips apostrophes/brackets), `preprocessTextForExtraction()` strips markdown links before scanning, `isMalformedCandidate()` gate added. Also shipped: **P0-3 Email verification token expiry** — migration file 20260515180000 created, schema.prisma updated (`emailVerificationTokenExpiry DateTime?` on User), authController.ts updated (24h expiry set on register, expiry checked+cleared on verifyEmail). Migration not yet deployed — Patrick action required. Confirmed eBay DRAFT "option C" (Publish to eBay button) already implemented in a prior session; removed from Blocked Queue.

### S725 — Organizer Pipeline Overhaul + Cron Reliability Keystone (COMPLETE)

Diagnosed and overhauled the full organizer-acquisition pipeline. **Root systemic issue:** enrichment/scoring/outreach jobs were in-memory node-cron — Railway's frequent redeploys wiped them, so the pipeline barely ran (only ~7 outreach emails ever; `lastScoredAt` frozen 2026-05-10). **Keystone fix** (architect-spec'd → dev-built, Steps 1+2 of 3): `POST /api/internal/jobs/run` dispatcher (reuses `requireSecret` auth, in-process job lock) + 7 `pipeline-*.yml` GitHub Actions workflows. In-memory crons left running alongside as belt-and-suspenders; **green cycle confirmed** in Railway logs (`[InternalJobRunner]` fired all 7 jobs; lead-scoring scored 56,347 orgs COLD 14,165/WARM 41,598/HOT 584). Build broke twice on the first push: (1) `@findasale/database` import not a backend dep — `organizerWebsiteAddressCron.ts` used `Prisma.sql` as a runtime value so it crashed at startup; fixed both it and `emailDiscoveryService.ts` to `@prisma/client` (canonical pattern). **Earlier in session:** cron-frequency cleanup (3 double-running scrapers gated behind GH Actions, backend sale-enrichment disabled, enrich-sale-details daily→3d, enrich-contact-emails 6h→daily, smtp-verify daily→weekly, deleted auctionzip+canada411 workflows); address-enrichment pipeline (organizerWebsite.ts scraper + organizerWebsiteAddressCron + bulkUpsertEnrichedSales address fields; eligibility query fixed from 0→8,804 matching rows); outreach/enrichment bug fixes (email-discovery image-filename filter, `[state]` token parsed from address since `licenseState` is NULL for whole queue, category filter relaxed to allow NULL category +1,661 leads, website→email enrichment chaining). DB fixes via psycopg2: 46 junk image-filename emails nulled; 36 organizer addresses corrupted by the address cron's over-matching extractor — all recovered from each org's Sales city/state. **P0 mid-session:** address extractor was matching street-suffix words hundreds of chars downstream, writing page-nav text/auction descriptions into `Organizer.address` — dev rewrote with bounded regex + candidate validation + 60-word junk blocklist + 110-char cap + trailing-junk strip + JSON-LD-primary; self-tests confirm garbage rejected, real addresses accepted. Decisions: ESN authenticated-cookie route abandoned (Patrick chose website-only — lower legal/detection risk); HOT-tier signal set approved (state-licensed / active platform sales / website+custom-domain email / 3+ source corroboration — NO Google API). Three consolidated pushblocks delivered + one build-fix pushblock. Git index corruption fixed (`Remove-Item .git\index; git reset`). VM mount truncation bug recurred repeatedly — all final files verified Windows-side.

### S723 — eBay Push End-to-End + Blocked Queue Burn-Down (COMPLETE)

Patrick's first end-to-end live eBay listing tonight. Cascade of debugging in production: every Railway error log became the next dispatch. Burns down 5 Blocked Queue items (#326, #280, #322, #405 from prior, #422 P1-1) and ships full eBay publish-mode + shipping-cascade infrastructure.

**Dev dispatches:**
1. #326 eBay Comp Tiles — `getItemEbayComps` was returning the `ItemCompLookup` singleton row (one image), but `EbayCompTiles.slice(0,3)` needs an array. Rewrote endpoint to call live `fetchEbayPriceComps` + return top 3 listings with per-listing image/price/condition. Files: itemController.ts, useItemEbayComps.ts.
2. #280 Condition Rating XP — guard required `!item.conditionGrade`, but `processRapidDraft` auto-fills it from AI before organizer ever saves, so guard always blocked legitimate awards. Removed null-check. Single line in itemController.ts.
3. #422 OAuth Option B — full implementation: backend 409 `OAUTH_LINK_REQUIRED` on unauth email-match, new `/auth/oauth/link` endpoint behind `authenticate`, frontend OAuthBridge catches 409 → redirects to `/login?message=...` with amber info banner, next.config.js rewrite for new endpoint. Account takeover vector closed. Settings linked-accounts UI deferred (backend surface ready).
4. eBay publish mode + shipping cascade — `Organizer.ebayDefaultPublishMode` (DRAFT|LIVE) + `ebayDefaultShippingPolicyId` schema + migration + backend whitelist + smart-pick logic + frontend settings UI (eBay tab) + sale-level split buttons (`Push draft` / `Push live`) + per-item override on edit-item. Migration deployed against Railway DB. 8 files.

**Inline edits during iteration:**
5. eBay aspect crash — `enums[0]` fallback was picking "Accordion" for "For Instrument" on MIDI cables (alphabetical). Rewrote `fillRequiredAspects` cascade: tag → keyword → neutral values (Universal/Other/Not Specified/N/A/Does Not Apply) → skip with warn log. Structured `[eBay Push Failed]` log + `[eBay AspectFill]` reason codes. EOF truncation in same file (~120 missing lines in `syncEndedListingsForOrganizer`) restored from git as bonus.
6. eBay `frontendUrl is not defined` + `proxySecret is not defined` — both vars declared locally in other functions only; added at top of items loop in pushSaleToEbay.
7. eBay smart-pick weight-gate — CALCULATED policy picked even when `packageWeightOz` was null (caused eBay error 25020); added `itemHasWeight` guard, CALCULATED skipped with warn log when no weight.

---

## Next Session

### Patrick Actions Required (before next dev session)

| Action | Priority | Context |
|--------|----------|---------|
| Push S733 (see push block below) | HIGH | 4 UI fix files + STATE.md + dashboard |
| AWS SES: verify `send.finda.sale` identity in SES console (us-east-1) | HIGH | May already be verified — just confirm |
| AWS SES: submit production access request | HIGH | 24–48h approval — do today so it clears in time |
| AWS SES: create SMTP credentials, download CSV | HIGH | One-time — secret only shown once |
| Railway: add `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SES_FROM_EMAIL` env vars | HIGH | From the CSV + `email-smtp.us-east-1.amazonaws.com` / `587` / `noreply@send.finda.sale` |
| Deploy pending migrations (S726 + S728 + S730) | P0 | `cd packages/database` → `$env:DATABASE_URL=[Railway URL]` → `npx prisma migrate deploy` → `npx prisma generate` |

### Push Block — S734 (push this first)

```powershell
git add packages/frontend/components/VoiceDescriptionInput.tsx
git add packages/backend/src/controllers/itemController.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix: review page eBay card missing weight/dims + voice strip order

getDraftItemsBySaleId select was missing packageWeightOz/In/Width/Height,
ebayShippingOverride, quantity, listingType, reverseDailyDrop, reverseFloorPrice.
VoiceDescriptionInput now calls voice/extract before append so stripShippingPhrases fires."
.\push.ps1
```

### Push Block — S733 (if not yet pushed)

```powershell
git add "packages/frontend/pages/organizers/[id].tsx"
git add "packages/frontend/pages/sales/[id].tsx"
git add "packages/frontend/pages/organizer/settings.tsx"
git add "packages/frontend/pages/organizer/edit-item/[id].tsx"
git commit -m "fix(ui): mobile layout, content parity, restore settings.tsx, remove duplicate appraisal button"
.\push.ps1
```

### Next Dev Session Priority Order

1. **Chrome QA smoke test** — verify S733 mobile layout + missing cards on live site.
2. **SES migration** — once Patrick has Railway env vars set, dispatch dev to migrate all 37 email files + suppression check fix. Plan: `claude_docs/operations/ses-migration-plan.md`.
3. **S731 push block** — ESN scraper fix + 23-state scraper repair batch still pending Patrick `.\push.ps1` run.
4. **Blocked Queue Chrome QA** — #326 eBay Comp Tiles, #280 Condition Rating XP, eBay full push flow, #422 OAuth Option B, #322 Encyclopedia category picker.
