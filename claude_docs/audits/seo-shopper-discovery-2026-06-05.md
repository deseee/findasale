# Shopper-Discovery SEO Audit — 2026-06-05

**Mode:** RESEARCH (read-only). Live-site fetches + DB (psycopg2) + frontend code reads. No code changed, no STATE.md/roadmap edits (concurrent session active — rows below are ready-to-paste).

**Scope:** The shopper-side discovery surface (the demand flywheel). Two-sided SEO rule: shopper-discovery SEO is never deferred.

---

## Verdict

Discovery architecture is **sound**. The city-page layer (1,200 indexed) is excellent and working as intended. Two concrete defects on higher-traffic surfaces are worth dev fixes. Every finding below has a tool citation.

---

## Findings

### SEO-1 (P1) — Sale detail pages ship an empty `<head>` server-side
**Evidence:**
- `curl https://finda.sale/sales/{id}` → empty `<title>`, **no** `og:title`/`og:image`/`og:description`, **0** JSON-LD blocks (raw HTML).
- `pages/sales/[id].tsx` **contains** all of it: canonical (L746 `SaleOGMeta`, L960), og tags (L962–968), 4× `application/ld+json` (L768/820/851/894). It is gated on `sale`/`ogData`.
- The page fetches sale data **client-side** — there is no `getServerSideProps`/`getStaticProps`. So at SSR time `sale` is null → every `<Head>` branch is skipped → blank head ships.
- Contrast: `pages/city/[slug].tsx` uses `getStaticProps` (ISR), so its data is present at render → full SSR head (verified: `/city/houston-tx` renders title + description + `BreadcrumbList`/`Event`/`ItemList`/`Place`/`PostalAddress`/`Organization`).

**Impact:** Individual sale URLs are the most-shared link type (texted/posted "look at this sale"). Social unfurlers (Facebook, iMessage, Slack, WhatsApp, X) do **not** execute JS → every shared sale link previews blank (no title, no image). Googlebot renders JS so crawl impact is softer, but the share path — a direct demand driver — is broken.

**Fix:** Add `getServerSideProps` (or `getStaticProps` + ISR, mirroring `[slug].tsx`) to `pages/sales/[id].tsx` that fetches the sale and supplies the og/JSON-LD data at render time. The Head markup already exists — it only needs the data available server-side. Include `Event` JSON-LD (estate/yard sales are events) for rich results.

**Effort:** M. **Files:** `packages/frontend/pages/sales/[id].tsx`.

---

### SEO-2 (P1) — Homepage emits conflicting canonical tags
**Evidence:**
- `curl https://finda.sale/` → two `<link rel="canonical">` with disagreeing values across renders: caught `https://finda.sale/index` **and** `https://finda.sale` in one fetch; `https://finda.sale/` + `https://finda.sale` in another.
- Both `pages/index.tsx` and `pages/_app.tsx` inject a canonical (grep: both appear in canonical-tag source list). A global `_app.tsx` canonical derived from the route is the likely `/index` source, colliding with the page-level tag.

**Impact:** A canonical pointing to `/index` tells Google the homepage's preferred URL is `/index` — conflicting signals on the single highest-authority page. Self-competing canonicals dilute the homepage's ranking signal.

**Fix:** One canonical for `/`. Make `_app.tsx` skip the global canonical when a page sets its own (or normalize the homepage to `https://finda.sale`, no trailing slash, matching `og:url`). Audit other static pages for the same `_app` vs page-level collision.

**Effort:** S. **Files:** `packages/frontend/pages/_app.tsx`, `packages/frontend/pages/index.tsx`.

---

## Healthy (no action)

- **City pages** — `/city/houston-tx` server-renders title, description, and 7 JSON-LD types. The durable flywheel surface, done right. 1,200 city pages in sitemap.
- **Sitemap structure** — `/sitemap.xml` (sitemapindex) → `/server-sitemap.xml` (urlset, 2,079 URLs: 1,200 city, 500 guide, 200 this-weekend, 102 items, 21 encyclopedia, 20 organizers, 11 categories, etc.). Normal next-sitemap layout; `lastmod` fresh (2026-06-06). Both live (HTTP 200).
- **robots.txt** — correct disallows (`/organizer/`, `/shopper/`, `/admin/`, `/api/`, `/auth/`); crawl-delay 2. Minor: references `/server-sitemap.xml` directly instead of the index `/sitemap.xml` — harmless.

## Considered, not a defect

- **Individual sales absent from sitemap** (only ZIP/city/category/guide aggregation pages). Defensible — sales are ephemeral; indexing durable aggregation pages is the right call. Makes SEO-1 matter for the **share** path more than the **crawl** path.

---

## Ready-to-paste roadmap rows

```
| SEO-1 | Sale detail pages — empty SSR head (social unfurls blank) | BROKEN — pages/sales/[id].tsx fetches client-side; all og/JSON-LD/canonical markup exists but gated on `sale` so never renders server-side. Fix: add getServerSideProps/ISR like city [slug].tsx. | P1 | — |
| SEO-2 | Homepage conflicting canonical (/index vs root) | BROKEN — _app.tsx global canonical collides with page-level canonical; `/index` value harms homepage indexing. Fix: single canonical for /. | P1 | — |
```

## Dev dispatch spec (when the active session frees up)

> `Skill('findasale-dev')` → Shopper-discovery SEO fixes SEO-1 + SEO-2.
> **SEO-1 (P1):** `pages/sales/[id].tsx` ships an empty `<head>` server-side because sale data is fetched client-side; the existing `<Head>` blocks (canonical L960, og L962–968, JSON-LD L768/820/851/894) are gated on `sale` and never render at SSR. Add `getServerSideProps` (or `getStaticProps` + ISR, mirroring `pages/city/[slug].tsx`) that fetches the sale by id and passes og + `Event` JSON-LD data so the head renders server-side. Verify with `curl https://finda.sale/sales/{id} | grep -E 'og:title|application/ld'` → non-empty.
> **SEO-2 (P1):** Homepage emits two conflicting `<link rel=canonical>` (one `/index`, one root). Dedupe: `_app.tsx` global canonical collides with `pages/index.tsx`. Ensure exactly one canonical = `https://finda.sale`. Grep other static pages for the same collision.
> Schema preflight + TS check gate (`cd packages/frontend && npx tsc --noEmit --skipLibCheck`). Return changed-files list + a pushblock. Do NOT push (subagent push ban). No removal of existing Head markup — SEO-1 is additive (wire data in), not a rewrite.
```
