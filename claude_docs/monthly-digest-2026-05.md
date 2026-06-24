# FindA.Sale Monthly Digest — May 2026

*Generated: June 1, 2026 (automated — findasale-records)*

---

## What Shipped in May 2026

### Frontend

- **GA4 Analytics** — Consent-gated, GDPR-safe integration. Property G-VSD9YR4D28. Data flows in 24–48 hours of deploy. (S814)
- **DMCA Policy Page** — `/dmca` live. (S814)
- **robots.txt** — Blocks `/organizer/`, `/shopper/`, `/admin/`, `/api/`, `/auth/` from crawlers. (S814)
- **Homepage filter pills** — "This Weekend" correctly filters 20→9 sales. (S831)
- **UTMCapture fix** — Reads `window.location.search` on mount (empty deps `[]`), bypassing the 3-redirect chain that was stripping params before router hydration. (S827/S831)
- **Shopper dashboard — 4 widgets rendered** — StreakWidget, RankBenefitsCard, NotificationPreferences, MyPickupAppointments. All confirmed working in Chrome. (S810)
- **Shopper dashboard P0 fix** — Rules of Hooks violation (hooks called after conditional return) + `NotificationPreferences` null guard on `userData?.notificationPrefs`. Fixed React 18 hydration crash that was breaking all shoppers since S810. (S812)
- **Flip Report HTML decode fix** — Numeric entities (`&#233;`, `&amp;`) now decoded correctly in Category Breakdown, Top Performers, Recommendations, and Return to Inventory panels. (S827/S828)
- **Batch AI Upload (#319/#325/#328) — Full bug chain fixed and Chrome-verified** — Five-session bug hunt resolved: `embedding:[]` fix (items were silently failing to write); `.clusters` response key fix; `saleId` wired into controller; `photoIndices` map fix; `createItemsMutation` removed (duplicate creation eliminated). Chrome-verified end-to-end S830. (S825/S828/S829/S830)
- **Map pins bounding box** — Authenticated users were bypassing regional bounding box; top results were scraper sales from TN/NC/TX. Fix: `regionConfig.centerLat` now applied for both auth states. (S813)
- **eBay status badge + Re-push button** — Edit-item now shows blue badge when `ebayListingId` is set, plus "Re-push to eBay" button. (S778)
- **Markdown Cycles modal (#334)** — Chrome-verified: modal opens with all fields, POST returns 201, record persists on reload. (S831)

### Backend

- **Google Merchant Center feed (#463)** — TSV feed at `/api/google-merchant/feed` per Google spec. Nightly cron (3:30 AM UTC). Opt-in (no shipping config = zero products). Freight/oversized + Local-Pickup-Only excluded. ~52 products in Google's review queue. (S808)
- **markSold settlement router (#465)** — Three paths: RECORD (flip SOLD), POS_CART (flip HOLD_IN_CART), CHECKOUT_LINK (Stripe). Smart default by sale type. Chrome-verified. (S808)
- **Multi-Consignor Settlement Phase 1 (#239)** — Per-consignor split, approval-gate UI, live transfers off by default (`STRIPE_CONNECT_LIVE_TRANSFERS` env gate). Legal gate (attorney + CPA) required before enabling live money. (S808)
- **POS hold-release 404 fix** — Double `/api/` prefix in `pos.tsx` causing 404 on hold release. Fixed. (S808)
- **batchAnalyzeController — embedding fix** — `embedding: []` added to both `prisma.item.create` calls. Was silently failing since launch with a silent DB constraint violation. (S825)
- **batchAnalyzeController — saleId + orphan prevention** — `saleId` now extracted, validated (400 if missing), and passed to both item create paths. Orphaned items with `saleId=NULL` no longer created. (S829)
- **Request timeout — 120s for batch-analyze** — Global 30s was too short for AI vision pipeline. Path-level override added. `/api/internal/` exemption also added. (S827)
- **CORS fix** — `api.finda.sale` added to `allowedOrigins`. Was causing 34 CORS errors/23 hrs after Railway custom domain added in S779 but omitted from CORS list. (S780)
- **Email MIME fix** — `text/plain` part added to `multipart/alternative`. Was HTML-only, contributing to spam classification. (S780)
- **Outreach email deliverability** — `RAILWAY_BACKEND_URL=https://api.finda.sale` set in Railway. All outreach links were using `backend-production-153c9.up.railway.app` — likely cause of 0% click-through. (S779)
- **Geocoding on publish** — Platform sales now geocoded server-side when `status → PUBLISHED` and `lat` is null. Backfill job extended for `sourceName: null` PUBLISHED sales. (S784)
- **Category icons** — Expanded from 14 → 200+ entries covering eBay leaf node names. `DISPLAY_NAME_OVERRIDES` map added. (S784)
- **IndexNow integration** — Fires on every sale publish (sale URL + all item URLs → `api.indexnow.org`). Key file live at `/fa3d9e1b8c2047a6d5f3e9b1c4a87d20.txt`. (S783)
- **Sitemap expansion** — 1,727 → 1,885 URLs. Items, encyclopedia, and category pages added. Guide page slug fix. WA/DC slug (dots in city name) fixed. (S783)
- **Facebook Events geocoding sourceName fix** — `'FacebookEvents'` → `'Facebook Events'`. Was causing 100% geocoding failure for FB Events source. (S815)
- **Cloudinary cloud name fix** — `create-sale.tsx` was hardcoding `'findasale'`; now uses `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`. Resolved Safari `TypeError`. (S815)
- **markSold duplicate Purchase fix** — Automated session S820 patched and ran DB purge. (S820)
- **Sentry — MulterError filter** — `beforeSend` filter suppresses `LIMIT_UNEXPECTED_FILE` noise. (S809)
- **7 slow-query indexes + Review.organizerId** — Migration 20260530000001. Eliminates 4300ms JOIN on organizer review queries. Indexes: `Organizer_contactEmail_idx`, `Organizer_isClaimed_isUnmanagedListing_idx`, `Sale_organizerId_status_idx`, `Sale_lastScrapedAt_idx`, `Sale_city_idx`, `Review_organizerId_saleId_idx`, `DirectoryClaimEmail_organizerId_sentAt_idx`. (S809)
- **Voice location extraction** — `extractLocationTag()` in `voiceController.ts` detects room names, bin codes, shelf/row/aisle from transcript. No new UI button needed. (S768)
- **Custom Label append toggles** — `skuAppendDate/Cost/Location` booleans on Organizer; `buildCustomLabel()` in `ebayController`; GET `/organizers/me` fix to return all 3 fields. (S768/S775)
- **Consignor Payout URL fix** — Double `/api/` prefix removed from `pages/organizer/consignors/[id].tsx` and `ConsignorPayoutModal.tsx`. (S791)
- **Consignor Payout Email** — `sendConsignorPayout()` now called after payout creation in `consignorController.ts`. Gmail API (same path as all transactional email). (S791)
- **eBay Category Review Badge** — `ebayNeedsReview` field added to `getDraftItemsBySaleId` select clause. Badge was always `undefined` on load/refresh. (S791)
- **Admin user management** — Suspend/delete users + `isHiddenFromDirectory` flag on Organizer. (S774)
- **Scraper cleanup** — 5 dead scrapers removed (SaleSeker, Newspaper RSS, Canada411, Eventbrite, AuctionNinja dupe), 4 misconfigured scrapers fixed. (S774)

### Infrastructure & Security

- **DMARC upgraded** — `p=none` → `p=quarantine` with `rua=mailto:dmarc-reports@finda.sale`. (S781)
- **api.finda.sale Railway custom domain** — Set and CORS-allowlisted. (S780)
- **Railway DB password rotation** — New password active; `DATABASE_URL` uses `${{Postgres.DATABASE_URL}}` reference variable (auto-rotates). (S780b)
- **GitGuardian P0 remediated** — Live PostgreSQL URI removed from `STATE.md` + `patrick-dashboard.md` (was committed to public repo in S776). Password rotated. (S780)
- **Cowork global instructions revert bug** — Identified MSIX path for `memory\CLAUDE.md`, built `scripts/sync-global-instructions.ps1`, set file read-only to block stale session writebacks. (S815)
- **Google Business Profile** — Created (E-commerce service, 219 E Michigan Ave Suite F, Paw Paw MI). Pending Patrick phone verification. (S814)
- **ToS — 7 new sections** — Refund/dispute 48hr, sales tax disclaimer, fulfillment 24hr ack/30d pickup, Stripe KYC, 1099-K, chargeback fees, DMCA reference. (S814)
- **Privacy Policy — 4 new sections** — GDPR legal basis, 30-day deletion, 72hr breach notification, auto-suggested content. (S814)
- **3 internal SOPs** — `data-deletion-sop.md`, `chargeback-sop.md`, `breach-notification-plan.md` in `claude_docs/operations/`. (S814)
- **Backup system** — 8 consecutive nightly runs confirmed healthy. (S814)
- **9 QA integrity rules added to CLAUDE.md** — CODE-ONLY abolishment, dev≠QA separation, Blocked Queue aging, audit P0/P1 pipeline, prior-session validation, screenshot gate, cross-session Chrome rule, immediate staging rule. (S816)
- **3 skills updated** — `findasale-qa-v2`, `findasale-records-v2`, `conversation-defaults-v2`. Installed by Patrick. (S816)

---

## Stale STATE.md Audit

**Current Work:** No items in-flight for >3 weeks. S831 completed same-day. One Patrick action pending (UTM real-browser verify). No stale in-flight items.

**Blocked Queue:** 5 rows — below the ≥8 ceiling. Dev sessions are clear.

| Feature | Status | Age |
|---------|--------|-----|
| RSVP XP Monthly Cap | Needs 5 organic RSVPs in one month | S785 |
| #332 Shopify Cross-Listing | Needs Shopify OAuth test store | S791 |
| #293 eBay Post-Sale Panel | Needs ended sale + eBay connection | S785 |
| #335 Consignor Payout Email | Needs real email address to inbox-verify | S791 |
| #462/#463/#464 UTM Params | CODE-ONLY fix deployed; Patrick must verify in real Chrome | S831 |

⚠️ **#462/#463/#464** is the most actionable blocked item — Patrick needs to open `https://finda.sale/search?utm_source=email&utm_campaign=test` in a regular Chrome tab and check DevTools → Application → Session Storage for `fsa_utm`.

**Recent Sessions:** S830–S826 in the formal section; S825–S807 in Current Status running log. All entries appear to be within May 2026. No orphaned or pre-April session entries found in the Recent Sessions block.

**Next Session block:** Actionable and fresh. Covers UTM verify, S831 push block, GBP phone verification, #239 legal gate, and Records applying S830 Chrome verifications to roadmap.

**Decisions Log — Pruning Observation:** The `decisions-log.md` header states "oldest entries pruned after 30 days," but entries from March 11–30, 2026 (~2.5 months old) remain. These are all LOCKED decisions that still govern active behavior — they should remain. However, the 30-day prune policy should be interpreted as "ephemeral/implementation-detail" entries only, not locked architecture decisions. No decisions are older than 3 months (oldest: March 11, 2026). No decisions require review on age grounds.

---

## Draft Changelog (Release Notes Format)

```
## FindA.Sale — May 2026 Release Notes

### New Features
- Google Merchant Center product feed — items from published sales now eligible for Google Shopping
- markSold now routes payments correctly (POS cash, cart hold, or Stripe checkout link by sale type)
- Multi-Consignor Settlement UI — per-consignor split with approval gate (test mode; live transfers require legal sign-off)
- Organizer admin tools — suspend/delete users, hide from directory
- Voice inventory capture now detects room names, bin codes, and shelf references from audio

### Improvements
- Shopper dashboard now shows streak, rank benefits, notification preferences, and pickup appointments
- Homepage "This Weekend" filter now correctly scopes results
- Batch AI upload pipeline fully repaired — items, photos, AI tags, and confidence scores now write correctly
- Sitemap expanded from 1,727 to 1,885 URLs; IndexNow integration pushes new sales instantly to search engines
- Sale category icons expanded from 14 to 200+ categories
- Organizer sale map now shows correct regional results for all users
- Custom Label builder (eBay) adds date, cost, or location suffixes to SKUs
- eBay Re-push button on edit-item page for updating listing descriptions

### Bug Fixes
- Shopper dashboard crash for all shoppers (React 18 hydration bug — Rules of Hooks violation)
- Batch AI upload silently failing since launch (missing `embedding:[]` constraint + wrong response key)
- Outreach email links were pointing to internal Railway URL (0% click-through root cause fixed)
- UTM tracking parameters were stripped by Vercel redirect chain before page mount
- CORS errors on api.finda.sale domain (34 errors/23hr — now allowlisted)
- Flip Report showing raw HTML entities (`&#233;`, `&amp;`) instead of decoded text
- Map pins showing sales from TN/NC/TX instead of local region
- POS hold-release returning 404 (double `/api/` prefix)
- Consignor payout emails never sent (function existed but was never called)
- eBay Category Review badge not persisting on page load
- Facebook Events geocoding failing 100% (wrong sourceName string)
- Safari TypeError on sale creation (hardcoded Cloudinary cloud name)

### Infrastructure
- DMARC upgraded to p=quarantine (quarantines unauthenticated mail)
- api.finda.sale custom domain live on Railway
- GDPR, data deletion, breach notification, and chargeback policies added to ToS and Privacy Policy
- robots.txt, DMCA page, and GA4 analytics deployed
- Backup system running nightly (8+ consecutive runs confirmed)
- 7 database indexes added for slow queries (review joins, sale queries, directory outreach)
```

---

## Next Month's Focus

Per STATE.md "## Next Session":

1. **Patrick action (this week):** UTM real-browser verify + S831 push block (4 files)
2. **Records:** Apply S830 Chrome verifications — #319/#325/#328 → ✅ in roadmap.md
3. **Dev:** Blocked Queue at 5, below ceiling — roadmap feature work is available
4. **Pending legal gate:** #239 Multi-Consignor Settlement (attorney + CPA before live transfers)
5. **Pending Patrick action:** Google Business Profile phone verification

---

*Next digest: July 1, 2026*
