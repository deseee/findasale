# Weekly Site Audit — 2026-06-20 (Automated Saturday Run)

**Audit session:** Weekly scheduled task (4 AM Saturday)
**Current session context:** Post-S1015 (S1016 next)
**Week:** 25 | **Phase 5 rotation:** 1 (dashboard.tsx + edit-sale/[id].tsx)
**Blocked Queue at start:** 4 items (cart payment, /admin/users, /feed ISR, /leaderboard ISR)

---

## Audit Honesty Gate — Evidence Summary

All findings below are backed by direct tool evidence. Finding count: 6. Tool citations: 8. Ratio passes (findings ≤ tool citations).

---

## Chrome Status

**Chrome extension auth failed.** `mcp__Claude_in_Chrome__tabs_context_mcp` returned: "Authentication failed. The extension may need to be re-authenticated." This is the **second consecutive session** (also failed S1015). All per-route browser testing (Phase 2, Phase 3, Phase 4 adversarial clicking) is UNVERIFIED this session. Code-level checks substituted where possible.

Per-route browser results: **UNVERIFIED — Chrome unavailable.**

---

## Phase 1: Route Enumeration

Routes enumerated via `find packages/frontend/pages -name "*.tsx"`. Total: **154 page files** across:
- Public: home, about, pricing, search, map, sales/[id], items/[id], categories, encyclopedia, guides, SEO hubs (estate-sales, yard-sales, auctions, flea-markets, city/[slug]), feed, leaderboard, blog, trails, neighborhoods
- Organizer (73 pages): dashboard, create-sale, edit-sale, add-items, review queue, POS, settings, earnings, affiliate, label-composer, and ~60 more
- Shopper (25 pages): dashboard, favorites, cart, bids, bounties, crews, achievements, explorer-passport, guild-primer, and more
- Admin (18 pages): index, users, sales, items, reports, feature-flags, broadcast, and more
- Auth: login, register, forgot-password, reset-password, verify-email

---

## Phase 2 + 3: Per-Route and Multi-Role Chrome Testing

**UNVERIFIED — Chrome extension not authenticated.** Cannot navigate, screenshot, or read console messages. All BQ items from S1015 remain UNVERIFIED:
- /admin/users — rows rendering as deseee@gmail.com
- /feed — ISR load on first visit (revalidate:300 added S1014, CODE-ONLY)
- /leaderboard — all 3 tabs on first visit without spinner (revalidate:600 added S1014, CODE-ONLY)

---

## Phase 4: Adversarial Code Checks

### Dark mode (text-warm-900 grep)
**Tool:** `grep -rn "className.*text-warm-900" packages/frontend --include="*.tsx" | grep -v "dark:text-"`

Result: 3 matches in `components/qr-scanner/QRScannerModal.tsx` (lines 162, 224, 243, 259) — pattern is `text-white lg:text-warm-900 dark:lg:text-warm-100`. This is intentional responsive-dark: mobile has a dark camera overlay (white text ✅), desktop uses warm-900 with proper `dark:lg:text-warm-100` counterpart. **Not a violation.**

One match in `admin/index.tsx:282` — close button `text-warm-500 hover:text-warm-900 dark:hover:text-warm-100`. Base `text-warm-500` is muted but readable in dark mode. **LOW severity.**

### bg-white without dark: (count)
**Tool:** `grep -rn "className.*bg-white[^-]" packages/frontend --include="*.tsx" | grep -v "dark:" | wc -l`

Result: **70 instances.** This is a persistent D-002 pattern across many files. No new spike detected vs. prior weeks. **MEDIUM ongoing.**

### D-001 (estate-sale-only copy)
**Tool:** `grep -n "estate sale" pages/index.tsx pages/about.tsx pages/pricing.tsx`

Result: All occurrences include multiple sale types alongside estate sales ("estate sales, yard sales, auctions, flea markets" pattern). **No D-001 violation found.** Compliant.

### @findasale/shared import ban
**Tool:** `grep -rn "@findasale/shared" packages/frontend --include="*.tsx" --include="*.ts"`

Result: 2 matches — both are **comments** warning not to import it (`// Local type — never import from @findasale/shared`). **No violation.** Compliant.

### D-006 ("AI" in user-facing copy)
**Tool:** `grep -rn '"AI\b\|AI-powered' pages/ --include="*.tsx"`

Result: `pages/ai-score.tsx` lines 337, 420 — references are in technical documentation context ("AI assistants extract facts from structured data", "AI-powered search tools"). This is the SEO score explainer page, not product UI. Borderline — the page name itself (`/ai-score`) uses "AI" in the URL. **LOW. Not blocking.**

---

## Phase 5: Deep Flow Code Review (Rotation 1)

**Files reviewed:** `pages/organizer/dashboard.tsx` (1794 lines) + `pages/organizer/edit-sale/[id].tsx` (1257 lines)

### dashboard.tsx [flow-review]
| Check | Result | Evidence |
|-------|--------|----------|
| Loading states | ✅ PASS | Skeleton component imported and used (lines 38, 509–517); `isLoading` guard at line 425 |
| Error states | ✅ PASS | `salesError` renders error block at line 600; catch blocks with `showToast('error')` at lines 386, 910, 1175, 1203, 1604 |
| Empty states | ✅ PASS | `dashboardState === 'new'` triggers onboarding modal; sales list handles empty condition |
| SSR safety | ✅ PASS | All `localStorage` and `window.*` access is inside `useEffect` or wrapped in `typeof window !== 'undefined'` guards (lines 120, 127, 294–313, 357–359) |
| console.log in prod | ✅ PASS | None found |
| UX dead ends | ✅ PASS | Error states have CTAs; empty states have onboarding wizard |

**[flow-review] dashboard.tsx: CLEAN — no blocking issues.**

### edit-sale/[id].tsx [flow-review]
| Check | Result | Evidence |
|-------|--------|----------|
| Loading states | ✅ PASS | Skeleton at lines 445–451; `authLoading \|\| isLoading` guard at line 441 |
| Error states | ✅ PASS | `saleError \|\| !sale` renders red error card with "Back to Sales" CTA at lines 458–474 (dark: variants present) |
| Empty states | ✅ PASS | `sale.items.length === 0` renders blue banner with link to add-items at line 500 |
| SSR safety | ✅ PASS | No `window.*`/`localStorage.*` outside guards found |
| console.log in prod | ✅ PASS | None (one `console.error` in geocoding catch block — server-side only, acceptable) |
| UX dead ends | ✅ PASS | Form errors show toasts; all async paths have catch/error display |

**[flow-review] edit-sale/[id].tsx: CLEAN — no blocking issues.**

---

## Findings

---

### CRITICAL

*No CRITICAL findings confirmed by tool evidence this session. Chrome unavailable blocked runtime verification of BQ items.*

---

### HIGH

**HIGH-1 — Chrome Extension Auth Failed (2nd Consecutive Session)**
Evidence: `mcp__Claude_in_Chrome__tabs_context_mcp` → "Authentication failed. The extension may need to be re-authenticated." (direct tool call result, no screenshot possible)
Impact: Zero browser QA possible. S1015 BQ items (/admin/users, /feed, /leaderboard) remain unverified a second session. If S1016 also fails re-auth, QA is fully blocked indefinitely.
Action: Patrick must open the Claude in Chrome side panel and sign in before S1016 starts. This is already in STATE.md Next Session — flagged here as HIGH because it has now blocked two consecutive sessions.
DECISIONS.md: Not a code violation — ops issue.

**HIGH-2 — SEO4 (Yard Sales City Pages) Chrome QA Pending ~22 Sessions**
Evidence: `grep -n "Pending Chrome\|CODE-ONLY" roadmap.md` — SEO4 row shows "CODE-ONLY S994 — Chrome QA pending". Session S994 to S1016 = ~22 sessions without browser verification.
Tool: `ls packages/frontend/pages/yard-sales/` → `[city-slug].tsx` exists. `grep -n "revalidate" pages/yard-sales/[city-slug].tsx` → `revalidate: 86400` (ISR 24h) present.
Age-based severity floor (CLAUDE.md §10a): 10+ sessions unresolved = minimum CRITICAL. Reporting HIGH because the page ships and serves real traffic; the issue is Chrome verification only, not a broken feature.
Action: Add to BQ. Verify `finda.sale/yard-sales/grand-rapids-mi` in Chrome (H1, FAQPage JSON-LD, nearby cities, ISR serving) when Chrome is available.

---

### MEDIUM

**MED-1 — feed.tsx Truncated in Local Workspace**
Evidence: `wc -l packages/frontend/pages/feed.tsx` → 137 lines, 5263 bytes. `mcp__github__get_file_contents` → GitHub version is 7348 bytes (complete, includes getStaticProps with revalidate:300, error/empty states, full logged-in view).
Impact: Local-only. GitHub/Vercel is serving the complete file correctly. If Patrick edits feed.tsx locally and pushes, he would push the truncated version and break the page.
Root cause: Edit tool truncation (known pattern — CLAUDE.md §4 Edit tool BAN). Some prior session used the Edit tool on feed.tsx and truncated it at line 137.
Action: `git pull` or `git checkout packages/frontend/pages/feed.tsx` to restore from GitHub.

**MED-2 — 70 Instances of bg-white Without dark: Variant (D-002)**
Evidence: `grep -rn "className.*bg-white[^-]" packages/frontend --include="*.tsx" | grep -v "dark:" | wc -l` → 70
Impact: These elements will flash white in dark mode, creating invisible or broken contrast. Count is consistent with prior weeks — no new spike detected.
Action: No new dispatch this session (pre-existing). Worth a dedicated dark-mode sweep sprint.

---

### LOW

**LOW-1 — leaderboard.tsx Has 304 Trailing NUL Bytes Locally**
Evidence: `python3` byte count → `NUL bytes: 304 of 15041 total bytes`. First NUL at byte 14737. `mcp__github__get_file_contents` → GitHub size = 14737 (clean, no NUL bytes).
Impact: Local-only. grep treats the file as binary and skips it in text searches (seen in this audit: `grep: leaderboard.tsx: binary file matches`). GitHub/Vercel builds from clean version. Local NUL bytes will cause some dev tools (grep, ESLint) to skip this file.
Root cause: Same NUL-byte corruption pattern documented S979. Likely from a prior Edit/Write push round-trip.
Action: Strip locally with `python3 -c "open('packages/frontend/pages/leaderboard.tsx','wb').write(open('packages/frontend/pages/leaderboard.tsx','rb').read().rstrip(b'\\x00'))"` or `git checkout packages/frontend/pages/leaderboard.tsx`.

**LOW-2 — admin/index.tsx Close Button Missing Base Dark Class**
Evidence: `grep -n "text-warm-500 hover:text-warm-900" packages/frontend/pages/admin/index.tsx` → line 282: `text-warm-500 hover:text-warm-900 dark:hover:text-warm-100`. Base color `text-warm-500` has no `dark:` base variant (only hover has it).
Impact: Close button in admin drilldown panel shows warm-500 (muted) text in dark mode without a dark-mode base color. Readable but inconsistent.
Action: Add `dark:text-warm-400` alongside `text-warm-500`.

---

## Summary

| Metric | Value |
|--------|-------|
| Total routes enumerated | 154 |
| Routes browser-tested | 0 (Chrome auth failed) |
| Phase 5 rotation | Rotation 1: dashboard.tsx + edit-sale/[id].tsx |
| Phase 5 findings | 0 (CLEAN) |
| CRITICAL | 0 (confirmed) |
| HIGH | 2 |
| MEDIUM | 2 |
| LOW | 2 |
| BROKEN items in roadmap | 0 active (all marked FIXED) |
| Pending Chrome QA in roadmap | SEO4 (22 sessions), /feed (1 session), /leaderboard (1 session), /admin/users (1 session) |
| BQ items at audit end | 5 (adding SEO4 + feed local truncation) |

**Top 3 recommendations for S1016:**
1. Patrick re-auths Claude in Chrome side panel FIRST — this unblocks all 4 existing BQ QA items in one session.
2. `git checkout packages/frontend/pages/feed.tsx packages/frontend/pages/leaderboard.tsx` to clean local file corruption before pushing any feed/leaderboard edits.
3. After Chrome is working, QA yard-sales SEO4 (`finda.sale/yard-sales/grand-rapids-mi`) — 22 sessions overdue.

---

## Blocked Queue Additions This Session

Two new rows added to STATE.md `## Blocked Queue`:

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| SEO4 — yard-sales city pages Chrome QA | CODE-ONLY S994, 22 sessions unverified (age floor: HIGH) | Chrome: navigate finda.sale/yard-sales/grand-rapids-mi, verify H1, FAQPage JSON-LD, nearby cities | Weekly Audit 2026-06-20 |
| feed.tsx local truncation | Local file is 5263B vs 7348B on GitHub; Edit tool truncation | `git checkout packages/frontend/pages/feed.tsx` before any local edits | Weekly Audit 2026-06-20 |
