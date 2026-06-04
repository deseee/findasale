### S860 — QA+Records+DEV: #316 Tranche B P1 bug found+fixed, notifications P2 fixed

**Records:**
- `claude_docs/strategy/roadmap.md`: #255 Claude QA ⬜→✅ S859 applied (cross-session from S859 PCV). #316 status updated (P1 bug found+fixed S860).
- `claude_docs/STATE.md`: PCV trimmed (#255 graduated). #316 re-verify row added to PCV.

**DEV (inline — <20 lines, 2 files):**
- `packages/frontend/pages/notifications.tsx` lines 322–323: `|| 999` → `?? 999` — Today group (value 0) was sorting to page bottom. 0 TS errors.
- `packages/backend/src/controllers/pointsController.ts`: added `import { referralTrancheService }` + fire-and-forget `recordSaleVisit()` call in `trackSaleVisit()`. Tranche B (150 XP / 3 sale visits) was fully implemented in the service but never wired to the controller — referred users' sale visits never counted. 0 TS errors.
- `packages/frontend/pages/register.tsx`: added green "Referral link applied" banner for `formData.referralCode` (mirrors existing inviteCode banner). Previously `?ref=` param was silently captured with no user feedback. 0 TS errors.

**QA smoke tests (DOM-verified, no new PCV entries — prior Chrome ✅ stands):**
- #467 Sold Item UX: amber banner ✅, SOLD stamp ✅, SimilarItemsGrid ✅, lightbox suppressed ✅, save button hidden ✅, dark mode ✅. No regression vs S817.
- #464 SEO Footer: Discover column (7 links) ✅, Explore dropdown ✅, /encyclopedia loads ✅ (ss_40922gfo2, ss_5917catz6).
- #237 Sale-Type Dashboard: loads without errors, no horizontal scroll ✅ (ss_7392t9kal). P3 incidental: "Learn about TEAMS" button clipped at ~1200px on upgrade card.

**QA #316 Referral Tranche B — ❌ FAIL → FIXED:**
- Chrome: registered qa-tranche-b-s860@test.com via /register?ref=REF-7CD8DCC0 (ss_8604lb5ug). Visited 3 published sales (ss_71195379l, ss_6851w4tv8, ss_0089nigg0).
- DB post-visit: `distinctSalesVisited: []` (empty), `trancheBReleasedAt: None`, user1 XP unchanged. Root cause: `referralTrancheService.recordSaleVisit()` never called from pointsController. Fix applied.
- P2 side finding: no visual confirmation when `?ref=` param sets referralCode. Fixed (register.tsx banner).
- Test data cleaned: qa-tranche-b-s860 deleted, user1 XP restored to 108.

**Blocked Queue: 8 rows (unchanged — P0s are Patrick-action items).**

### S859 — QA+Records: #255 Chrome-verified + notifications sort P2 bug found

**Records:**
- `claude_docs/strategy/roadmap.md`: #158 Human QA ⬜→✅ S858, #398 Claude QA ⬜→✅ S858, #259 Human QA ⬜→✅ S858, #290 Human QA ⬜→✅ S858. All applied via Python.
- `claude_docs/STATE.md`: PCV trimmed from 5→1 row (4 S858 rows graduated to roadmap).

**QA #255 Rank-Up Notifications ✅:**
- DB: Bob Smith (user2) XP set to 498, rank INITIATE.
- Navigated to /sales/cmpaujbx701r7wh48ssciws0z as Bob. Clicked "Going (0)" RSVP button → "✓ You're going (1)" confirmed.
- DB post-RSVP: guildXp=500, explorerRank=SCOUT. RANK_UP + RSVP_CONFIRMED notifications created.
- /notifications page: scrolled to bottom → TODAY section visible with "You've reached SCOUT! — Congratulations! You've advanced to SCOUT rank. Keep hunting!" (7m ago). ss_7469boc64.
- ⚠️ P2 BUG: Today group renders at BOTTOM of notification list (below This Week, Older). Root cause: `order['Today'] || 999` — `|| 999` treats 0 as falsy. Fix: `?? 999`. Dispatch findasale-dev.

**QA #230 Smart Buyer Widget: UNVERIFIED** — no published sale on any real test organizer (user1 has none, Artifact MI has none, all 10 published sales are scraper accounts).

**Test data cleaned:** Bob XP reset to 157/INITIATE, RSVP deleted, test notifications deleted.

**Blocked Queue: 6→8 rows** (notifications sort P2 bug + #230 Human QA blocker added).

---

### S858 — QA+DEV: Flash Deal dropdown fixed + 4 features Chrome-verified

**DEV — Flash Deal dropd

# Session Log Archive

Older session entries archived from STATE.md. Most recent entries at bottom.

---

### S783 — SEO Sprint: Sitemap Expansion + IndexNow + Schema.org Audit

**Trigger:** Patrick — sitemap count was 1,727 (Bing), fix it properly; items/sales/articles/neighborhoods all missing.

**Completed:**
- ✅ Homepage "Error Loading Sales" fix — `NEXT_PUBLIC_BACKEND_URL`/`NEXT_PUBLIC_API_URL` localhost fallback changed to `https://api.finda.sale`
- ✅ /creator/dashboard role guard — was rejecting ORGANIZER role (CREATOR doesn't exist in schema); fixed to allow ADMIN + ORGANIZER
- ✅ Admin creators/affiliate page — new `/admin/creators` page + backend controller querying users with AffiliateCode or AffiliateLinks; linked from admin index
- ✅ Guide pages in sitemap — slim `slugs.json` (500 slugs, 16KB) + `outputFileTracingIncludes` key fixed + `Cache-Control: max-age=0` header in vercel.json
- ✅ Sitemap: added `/categories/[category]` (10 hardcoded), `/encyclopedia/[slug]` (via API), `/items/[id]` (new backend endpoint)
- ✅ New `/api/items/sitemap` backend endpoint — returns all items from PUBLISHED sales, `id+updatedAt` only, 10k cap, no auth
- ✅ Washington DC slug fix — `.replace(/\./g, '')` strips dots from city slugs in `/api/sales/city-slugs`
- ✅ IndexNow integration — `indexNowService.ts` created; fires on sale DRAFT→PUBLISHED transition; POSTs sale URL + all item URLs to `https://api.indexnow.org/indexnow`; non-blocking fire-and-forget
- ✅ Key file live: `https://finda.sale/fa3d9e1b8c2047a6d5f3e9b1c4a87d20.txt`
- ✅ Schema.org audit: Product schema on items, JSON-LD on sale detail, HowTo/Article on guides — all already implemented and SSR-safe
- Sitemap count: 1,727 → 1,885 (+138 URLs; 110 items, 10 categories, ~18 encyclopedia)

**Files changed:** `pages/index.tsx` · `next.config.js` · `pages/creator/dashboard.tsx` · `adminAffiliateController.ts` (new) · `routes/adminAffiliate.ts` (new) · `backend/index.ts` · `pages/admin/creators.tsx` (new) · `pages/admin/index.tsx` · `data/seo-pages/slugs.json` (new) · `vercel.json` · `public/robots.txt` · `public/sitemap.xml` · `routes/sales.ts` · `itemController.ts` · `routes/items.ts` · `server-sitemap.xml.tsx` · `indexNowService.ts` (new) · `saleController.ts` · `fa3d9e1b8c2047a6d5f3e9b1c4a87d20.txt` (new) · `.env.example`
