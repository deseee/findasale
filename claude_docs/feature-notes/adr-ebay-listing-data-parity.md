# ADR — eBay Listing Data Parity — 2026-04-14

## Context

S461 landed the eBay push end-to-end (OAuth, category, condition, required
aspects, stale-offer retry). Push works. But a side-by-side of a
FAS-pushed listing (Contigo travel mug) vs. a native eBay listing from the
same seller account (Spawn #4 comic) exposed a data-quality gap that
affects buyer trust, search ranking, and shipping accuracy:

| Native eBay Listing | FAS Push Today | Root Cause |
|---|---|---|
| Real shipping rate ($6.49 calculated) | "Free Standard Shipping" | (a) Policy picker takes `fulfillmentPolicies[0]` unconditionally; (b) no `packageWeightAndSize` → calc shipping impossible |
| Correct "Fox Island, MI" location | Hardcoded "Grand Rapids, MI" | `getOrCreateMerchantLocation()` hardcodes `1 Commerce Ave SW`; never checks seller's existing eBay locations or organizer address |
| Rich condition narrative | Enum only ("USED") | No `conditionDescription` sent |
| 18+ item specifics (characters, writers, publisher, era, grade) | Required aspects only | No optional aspects populated |
| Catalog match with product ratings | No catalog hit | No UPC/ISBN/EAN/MPN/EPID sent |
| "or Best Offer" enabled | Fixed price only | No `bestOfferTerms` sent |
| Rich HTML description | Plain text (stripped) | `.replace(/<[^>]*>/g, '')` destroys the Item description |
| Secondary category | Single category | No `secondaryCategoryId` sent |

Patrick's directive: "we forced through some data that was incorrect…
i'd rather be right than fast." This ADR defines the parity plan and
sequences it **before** the planned "broader category coverage" work —
pushing more categories of bad-quality listings compounds the problem.

---

## Decision

Three-phase rollout. Phase A ships this session (no schema changes).
Phase B adds schema fields to capture product identifiers and package
dimensions. Phase C (future) integrates eBay Taxonomy API for catalog
matching and rich aspect suggestions.

### Phase A — Quality fixes, no schema change (this session)

**A1. Merchant location from real seller data.**
In `getOrCreateMerchantLocation`, before creating a hardcoded location:

1. `GET /sell/inventory/v1/location` — if seller has any enabled location,
   use the first one's `merchantLocationKey`. Persist it on
   `EbayConnection.merchantLocationKey`.
2. If none, build a new location from the **Sale's** structured address
   (`sale.address`, `sale.city`, `sale.state`, `sale.zip`) — Sale is
   guaranteed structured. Fall back to Organizer.address parse only as
   last resort; log a warning if parse fails.
3. Never hardcode Grand Rapids. Remove the literal address from code.

**A2. Business policy picker — marketplace filter + default flag.**
In the OAuth policy-fetch step (`/sell/account/v1/*_policy`):

1. Filter to `marketplaceId === 'EBAY_US'`.
2. Within that set, prefer the policy where `categoryTypes[].default === true`.
3. Fall back to `[0]` only if no default flag exists.
4. Do NOT change stored IDs — this is read-time filtering on OAuth fetch.

**A3. Stop stripping HTML from description.**
Current code: `(item.description || '').replace(/<[^>]*>/g, '').substring(0, 4000)`.
Replace with a light sanitizer (allow safe tags: `p`, `br`, `b`, `strong`, `em`, `i`, `u`, `ul`, `ol`, `li`, `h1-h4`, `a[href]`, `img[src,alt]`). Apply 4000-char cap post-sanitize.
Use sanitized HTML for BOTH `product.description` (inventory item) and
`listingDescription` (offer payload).

**A4. Condition description derived from item data.**
Build `conditionDescription` (max 1000 chars) from:
- Line 1: Condition grade if present ("Grade A — Excellent condition")
- Line 2: First 400 chars of sanitized description (plain text)
- Line 3: Relevant tag callouts (e.g., "Vintage", "Handmade") if tags present

Attach to inventory item `condition.conditionDescription` when condition is
not NEW.

**A5. Secondary category from tag/category heuristic.**
When `item.ebayCategoryId` exists and `item.tags` contains a qualifier that
maps to a known secondary category (e.g., "vintage" → 1 "Collectibles"),
add `secondaryCategoryId` to the offer. Table-driven, not AI. Start with
a small map of 5–10 known mappings; expand in Phase C.

### Phase B — Schema additions (next session, migration required)

Add the following fields. All nullable/defaulted so migration is safe.

**Item model:**
```prisma
// Package dimensions for calculated shipping
packageWeightOz        Int?     // ounces
packageLengthIn        Decimal? @db.Decimal(6,2)
packageWidthIn         Decimal? @db.Decimal(6,2)
packageHeightIn        Decimal? @db.Decimal(6,2)
packageType            String?  // BOX | LETTER | MAILING_TUBE | PACKAGE_THICK_ENVELOPE

// Product identifiers for catalog match
upc                    String?
ean                    String?
isbn                   String?
mpn                    String?
brand                  String?
ebayEpid               String? // eBay Product ID once matched

// Rich condition
conditionNotes         String? // Free-form organizer notes

// Pricing flexibility
allowBestOffer         Boolean  @default(false)
bestOfferAutoAcceptAmt Decimal? @db.Decimal(10,2) // Auto-accept threshold
bestOfferMinimumAmt    Decimal? @db.Decimal(10,2) // Auto-decline threshold

// Secondary category + subtitle
ebaySecondaryCategoryId String?
ebaySubtitle            String? // 55-char paid upgrade
```

**EbayConnection model:**
```prisma
merchantLocationKey    String?   // Real key used (read from seller's eBay first)
merchantLocationSource String?   // EXISTING | SALE_ADDRESS | ORGANIZER_ADDRESS — audit
```

Migration name: `add_ebay_listing_parity_fields`. All additive. No data
backfill needed (all nullable).

**AI fill on eBay push modal:** When organizer opens the "Push to eBay"
modal, auto-suggest brand/UPC/MPN from Item.description using Claude Haiku
(cloudAIService). Organizer confirms or edits. This reuses the locked AI
chain — no new service.

### Phase C — Catalog matching & aspects (future, no deadline)

- eBay Taxonomy API integration: `getItemAspectsForCategory` to fetch the
  full aspect schema per category, then Haiku-suggest values from item
  title/description/tags.
- EPID lookup: when UPC/ISBN/MPN is provided, call eBay Catalog API to
  find an EPID and attach `product.epid + includeCatalogProductDetails:true`
  → unlocks the catalog match + product ratings box.
- Expand secondary-category map beyond 5–10 to full heuristic set.

---

## Rationale

**Why phase it?** Patrick needs quality parity before beta testers see a
wider category push. Phase A fixes the two bugs he called out (wrong
shipping, wrong location) plus three easy wins (HTML, condition notes,
secondary category) with zero schema risk. Phase B expands data capture
for catalog-quality listings. Phase C is the eBay-native polish layer.

**Why Sale.address as merchant-location fallback instead of Organizer.address?**
Sale has structured fields (address/city/state/zip) — Organizer has a
single `address` string. Parsing free-form strings is unreliable and is
exactly the kind of "forced incorrect data" Patrick just flagged.

**Why not filter policy by default flag first instead of `[0]`?**
Default flag is the signal eBay itself uses. Seller may have 3 shipping
policies ("Free Ship", "Calculated", "Local Only") — we want the one
they've marked as default, not whichever alphabetized first.

**Why keep policy IDs as-is in storage?** Changing the stored policy IDs
now would require every connected seller to reconnect. Read-time filter
on the fetch does the job without migration.

**Why sanitize HTML instead of strip?** Native listings show rich
formatting. Stripping HTML turns FAS into the lowest-quality seller on
the platform. Sanitize (don't strip) brings us to parity.

**Why auto-suggest identifiers in Phase B instead of requiring organizer
entry?** Non-technical organizers won't type UPCs. AI extraction from
description with organizer confirmation matches the locked "reduce manual
work" primary goal.

---

## Consequences

- Phase A adds ~150 lines to `ebayController.ts` (merchant location
  lookup, policy filter, HTML sanitize, condition description builder,
  secondary category map). No schema change.
- Phase B adds ~14 columns across 2 models — all nullable, migration
  safe. Adds one new UI section to the eBay push modal for identifier
  confirmation + best offer toggle + package dimension entry.
- Phase A listings will look ~60% closer to native eBay quality. Phase B
  closes another ~30%. Phase C closes the remaining ~10% (catalog match
  + full aspects).
- The "broader category coverage" work (book/clothing/furniture) from
  STATE.md STEP 1 is **re-sequenced after Phase A ships** — pushing more
  categories of poor-quality listings would compound the credibility
  problem during the beta tester week.

---

## Constraints Added

- **Never hardcode an address in any integration.** Pull from structured
  fields (Sale preferred, Organizer second) or seller's existing data at
  the destination platform.
- **Policy pickers must filter by marketplace + prefer default flag**
  before falling back to index-zero.
- **HTML sanitize, don't strip**, when a destination platform supports
  HTML descriptions.

---

## Rollback

### Phase A (code-only)
Revert the commits on `ebayController.ts` and `cloudAIService` (if touched).
No DB changes to reverse. New listings published during the buggy window
are organizer-visible and can be manually edited in Seller Hub or
re-pushed from FAS after revert.

### Phase B (schema)
Migration file: `add_ebay_listing_parity_fields`
Down migration: `npx prisma migrate resolve --rolled-back add_ebay_listing_parity_fields`
Playbook: "If Phase B deploy fails at migrate step → resolve-rolled-back
→ redeploy with schema pre-migration → investigate field." Because all
columns are nullable/defaulted, rollback is non-destructive.

---

## Dev Instructions (Phase A only — Phase B deferred)

**Ordered implementation steps** — findasale-dev dispatches one at a time,
running `npx tsc --noEmit --skipLibCheck` after each:

1. **[ebayController.ts] Rewrite `getOrCreateMerchantLocation`:**
   - Signature change: accept `saleAddressHint: { address, city, state, zip }`
   - Step 1: `GET /sell/inventory/v1/location` via existing eBay fetch helper;
     if response has any enabled `InventoryLocation`, use the first's
     `merchantLocationKey`.
   - Step 2: If none, POST a new location using `saleAddressHint`.
   - Step 3: Never use the literal `1 Commerce Ave SW` — delete that block.
   - Caller update: pass the item's sale address into the call site.

2. **[ebayController.ts] Policy picker filter:**
   - In the OAuth policy-fetch code (~L703–766), for each of the three
     policy types: filter to `p.marketplaceId === 'EBAY_US'`, then find
     the entry whose `categoryTypes.some(ct => ct.default === true)`,
     then fall back to `policies[0]` only if no default exists.

3. **[ebayController.ts] HTML sanitize helper:**
   - Add a small `sanitizeHtmlForEbay(raw: string): string` function at
     module scope. Allowlist: `p br b strong em i u ul ol li h1 h2 h3 h4
     a[href] img[src,alt]`. Strip all other tags. Cap at 4000 chars.
   - Use `sanitize-html` package (`pnpm add sanitize-html @types/sanitize-html`
     in `packages/backend`).
   - Replace the current `.replace(/<[^>]*>/g, '')` call in inventory payload
     construction. Use sanitized output for BOTH `product.description`
     AND offer `listingDescription`.

4. **[ebayController.ts] Condition description builder:**
   - Add `buildConditionDescription(item): string | undefined` helper.
   - Output: combine `conditionGrade` label + 400-char plain-text
     description excerpt + relevant tag callouts.
   - Return `undefined` for NEW condition. Cap 1000 chars.
   - Attach to inventory payload `condition.conditionDescription` (only
     when defined and condition !== NEW).

5. **[ebayController.ts] Secondary category map:**
   - Add a module-level `SECONDARY_CATEGORY_MAP` (record type: tag →
     eBay category ID). Start with 5 entries:
     - "vintage" → 1 (Collectibles root — verify leaf exists)
     - "antique" → 20081 (Antiques root)
     - "handmade" → 14339 (Crafts)
     - "rare" → 1
     - "collectible" → 1
   - In offer payload, if `item.tags` intersects the map, pick the first
     match as `secondaryCategoryId`. Do not duplicate the primary
     category.

6. **TypeScript gate + stop:**
   - `cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules` → zero errors
   - `cd packages/backend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules` → zero errors
   - Return the changed-files list to main session.

7. **DO NOT PUSH.** Main session will batch with smoke-test + consolidated pushblock.

---

## Flagged for Patrick

1. **Phase B timing.** Do we ship Phase B before beta week starts
   (2026-03-22 per memory but now 2026-04-14 — verify beta status)?
   Phase B adds an organizer-facing UI (identifier + weight + best-offer
   entry). If beta is mid-flight, ship Phase A only; do Phase B after.

2. **HTML sanitize allowlist.** Any tag additions beyond the default
   set? (e.g., `<table>`? Some comic sellers use tables for specs.)

3. **Best Offer default.** Enable-by-default or opt-in? Current plan:
   opt-in only (Phase B gated on `Item.allowBestOffer`). Confirm.

4. **Sale.address structure — is it reliable?** Some sales may still have
   placeholder addresses. If the seller used a "TBD" address, do we block
   push or fall back to Organizer? Current plan: log warning + block push
   with clear error.

---

## Context Checkpoint
yes — architect handoff complete. Main session should present the
integrated plan to Patrick for approval before dispatching findasale-dev.
