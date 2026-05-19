# GEO Infrastructure Verification — 2026-05-18

Verified via Vercel MCP web fetch + source code review. Sale page used: `cmp69jbja025vaez906pydd1a` (Nice NE Grand Rapids Estate Sale, Hooked Estate Sales).

---

## Results

### #433 — ai-plugin.json
**PASS**
`https://finda.sale/.well-known/ai-plugin.json` returns HTTP 200 with valid JSON containing:
- `name_for_human`: "FindA.Sale"
- `description_for_human`: present and accurate
- `api.url`: "https://api.finda.sale/api/openapi.json"
- `auth.type`: "none"

---

### #434 — llms.txt
**PASS**
`https://finda.sale/llms.txt` returns HTTP 200 with a comprehensive text file. MCP section reads:
> MCP Server (Live) — Endpoint: mcp.finda.sale (Railway-hosted). Tools: search_sales, get_sale, search_items, get_organizer, get_trending_sales, get_city_sales, get_categories.

No "Coming Soon" language. Endpoint URL is live and specific.

---

### #432 — AggregateOffer JSON-LD on sale pages
**FAIL — code issue**

The JSON-LD (Event schema with AggregateOffer, PostalAddress, speakable, paymentAccepted) is implemented in `pages/sales/[id].tsx` lines 742–801 and is correct in code. However it is rendered inside a `{sale && ...}` block that is gated behind `if (!mounted || isLoading) { return skeleton }`. Since `mounted` starts as `false` (set by `useEffect`), crawlers receive the skeleton HTML — **zero JSON-LD scripts are present in the SSR response**.

Verified: fetching `https://finda.sale/sales/cmp69jbja025vaez906pydd1a` returns a loading skeleton with no `<script type="application/ld+json">` in the `<head>`.

Root cause: JSON-LD injection is client-side (post-hydration), not server-side. Fix requires moving the Event/AggregateOffer JSON-LD block into `getServerSideProps` output or into `SaleOGMeta` so it renders in the SSR pass.

---

### #439 — Product schema on claimed sale pages
**FAIL — code issue (same root cause as #432)**

Product schema for individual items is implemented at lines 831–873, gated on `initialData && initialData.isClaimed && initialData.items.length > 0`. `initialData` IS available SSR (passed as a prop from `getServerSideProps`), but the block is inside the component body after the `!mounted` guard, so it never reaches the SSR HTML. Crawlers see no Product schema.

Additional note: The tested sale (`cmp69jbja025vaez906pydd1a`) has `isClaimed: false` and `items: []` so Product schema would not emit for this sale even if the CSR bug were fixed. A claimed sale with items would be needed to fully verify.

---

### #440 — Machine-readable sr-only block
**PARTIAL — code issue (same CSR gate)**

The sr-only block is implemented at lines 943–950:
```
Sale listing managed by {sale.organizer.businessName} on FindA.Sale.
Browse items, check availability, and get directions at finda.sale/sales/{id}.
Real-time inventory and pricing available via FindA.Sale API at api.finda.sale.
```
Content is correct (references api.finda.sale, not MCP endpoint directly). However, this block is inside `{!isSaleLocked && sale && ...}` which is in the post-mount render tree. Crawlers see the skeleton, not this block. The MCP endpoint is not mentioned specifically (says "API at api.finda.sale") — original spec called for MCP endpoint reference.

---

### #441 — PaymentMethod schema
**FAIL — code issue (same CSR gate)**

`paymentAccepted: ['CreditCard', 'Cash', 'PaymentService']` is present in the Event JSON-LD at line 791. Not visible to crawlers due to CSR rendering issue documented in #432.

---

### #451 — Speakable schema
**FAIL — code issue (same CSR gate)**

`speakable: { '@type': 'SpeakableSpecification', 'cssSelector': ['h1', '.sale-description', '.sale-dates'] }` is present at lines 787–790. Same CSR rendering issue.

---

### #449/#457 — ENDED sale noindex + permanent pricing records
**FAIL — code bug**

The logic at lines 2118–2121 correctly computes `noindex = isScrapedSale && isEnded`. However:
1. `noindex` is returned in `getServerSideProps` props but **is not in `SaleDetailPageProps` interface** (line 226–230) and **is not destructured by the component** (line 232).
2. No `<meta name="robots" content="noindex">` tag is ever written to the page.

ENDED scraped sale pages are currently indexed by search engines. Fix: add `noindex` to `SaleDetailPageProps`, destructure it in the component, and add `<meta name="robots" content="noindex, nofollow" />` inside `SaleOGMeta` or the top-level `<Head>`.

Unable to test an ENDED sale page live — the `/api/sales` endpoint does not support filtering by `status=ENDED` (ignores unknown params). A direct ID would be needed. Code review confirms the bug regardless.

---

### #9 — /clearance page
**PASS**
HTTP 200. Page renders with correct title "Clearance & Post-Sale Finds · FindA.Sale". ItemList JSON-LD present in SSR head with `numberOfItems: 0` (no current clearance items — data issue, not code).

---

### #10 — /city/grand-rapids-mi
**PASS**
HTTP 200. Page contains full JSON-LD (ItemList with Event entries for 3 active sales, BreadcrumbList). SSR rendered correctly.

---

### #11 — /this-weekend/grand-rapids-mi
**PASS**
HTTP 200. Page contains valid SSR JSON-LD:
- ItemList with 3 sales (May 22–24, 2026 weekend)
- BreadcrumbList: Home → Cities → Grand Rapids, MI → This Weekend
- `<meta name="robots" content="index, follow">` present

---

## Summary

| # | Feature | Status | Type |
|---|---------|--------|------|
| 433 | ai-plugin.json | PASS | — |
| 434 | llms.txt | PASS | — |
| 432 | AggregateOffer JSON-LD on sale pages | FAIL | Code — CSR gate |
| 439 | Product schema on claimed sale pages | FAIL | Code — CSR gate |
| 440 | sr-only machine-readable block | PARTIAL | Code — CSR gate + MCP URL missing |
| 441 | PaymentMethod schema | FAIL | Code — CSR gate |
| 451 | Speakable schema | FAIL | Code — CSR gate |
| 449/457 | ENDED sale noindex | FAIL | Code — prop not wired |
| 9 | /clearance | PASS | — |
| 10 | /city/grand-rapids-mi | PASS | — |
| 11 | /this-weekend/grand-rapids-mi | PASS | — |

## Root Cause (Consolidated)

Issues #432, #439, #440, #441, #451 share a single root cause: the `!mounted` guard at line 691 causes crawlers to receive only the loading skeleton. All JSON-LD and sr-only blocks live in the post-hydration render tree. Fix: move JSON-LD into `getServerSideProps` or render it unconditionally before the `!mounted` check using `initialData` (which is available SSR as a prop).

Issue #449/#457 is a separate wiring bug — the `noindex` prop is computed correctly but never applied to the page `<Head>`.
