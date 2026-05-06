# Patrick's Dashboard — May 6, 2026 (S667 Backlog Sweep Wrap)

---

## 🚀 PUSH THIS NOW — S667 Comprehensive Backlog Sweep (42 files)

All 16 deferred S666 meta-audit items shipped. NextAuth routing fixed, JWT cookie auth now reachable, GDPR/CCPA legal requirements in, Sentry Crons on all 38 cron jobs, camera race fix, NSFW detection, XP exploit detection, arbitration clause.

**One manual step before running the push block:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git rm packages/frontend/pages/api/auth/[...nextauth].ts
```

**Then the full push:**
```powershell
git add packages/frontend/pages/api/oauth/[...nextauth].ts
git add packages/frontend/components/AuthContext.tsx
git add packages/frontend/lib/api.ts
git add packages/frontend/styles/globals.css
git add packages/frontend/pages/sales/[id].tsx
git add packages/frontend/pages/items/[id].tsx
git add packages/frontend/pages/organizers/[id].tsx
git add "packages/frontend/pages/categories/[category].tsx"
git add packages/frontend/pages/search.tsx
git add packages/frontend/pages/organizer/settings.tsx
git add packages/frontend/pages/terms.tsx
git add packages/frontend/pages/do-not-sell.tsx
git add packages/frontend/pages/admin/feature-flags.tsx
git add packages/frontend/pages/admin/xp-velocity.tsx
git add "packages/frontend/pages/claim/verify/[token].tsx"
git add packages/backend/src/controllers/authController.ts
git add packages/backend/src/controllers/itemController.ts
git add packages/backend/src/controllers/stripeController.ts
git add packages/backend/src/controllers/settlementController.ts
git add packages/backend/src/controllers/userController.ts
git add packages/backend/src/controllers/uploadController.ts
git add packages/backend/src/lib/prisma.ts
git add packages/backend/src/routes/auth.ts
git add packages/backend/src/routes/admin.ts
git add packages/backend/src/routes/organizers.ts
git add packages/backend/src/routes/users.ts
git add packages/backend/src/services/tierLapseService.ts
git add packages/backend/src/services/scraper/dedupe.ts
git add "packages/backend/src/services/scraper/__tests__/dedupe.test.ts"
git add packages/backend/src/utils/cronGuard.ts
git add packages/backend/src/index.ts
git add packages/backend/src/jobs/auctionAutoCloseCron.ts
git add packages/backend/src/jobs/auctionJob.ts
git add packages/backend/src/jobs/outreachEmailsCron.ts
git add packages/backend/src/jobs/processRapidDraft.ts
git add packages/backend/src/jobs/deliverabilityMonitorJob.ts
git add packages/backend/src/jobs/geocodingAuditJob.ts
git add packages/backend/package.json
git add packages/database/prisma/schema.prisma
git add packages/database/prisma/migrations/20260507000001_add_ccpa_opt_out/migration.sql
git add claude_docs/API_RESPONSE_FORMAT.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat(security+compliance+ops): S667 — NextAuth route fix, JWT cookie hardening, GDPR export, CCPA opt-out, ToS arbitration, CAN-SPAM address, Stripe refund/tax/dunning, Sentry Crons, slow-query, SIGTERM, address normalization, camera race fix, claim verify, NSFW detection, XP velocity, D-006 sweep"
.\push.ps1
```

---

## ⚠️ Manual actions required after push lands

**1. Update OAuth console redirect URLs (REQUIRED — or OAuth login breaks)**

Google Cloud Console:
- Old: `https://finda.sale/api/auth/callback/google`
- New: `https://finda.sale/api/oauth/callback/google`

Facebook Developer Console:
- Old: `https://finda.sale/api/auth/callback/facebook`
- New: `https://finda.sale/api/oauth/callback/facebook`

**2. Run database migration (REQUIRED)**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```
This adds the `ccpaOptOut` column to the User table.

**3. Optional Railway env vars**
- `TIER_GRACE_DAYS=7` — dunning grace period for lapsed subscriptions (already defaults to 7, only set if you want a different window)

**4. Enable Stripe Tax in Stripe Dashboard**
`automatic_tax: {enabled: true}` is now in the code but requires the Stripe Tax product to be activated in your account settings before it calculates.

---

## ✅ What shipped in S667

| Area | What changed |
|---|---|
| Auth | NextAuth moved to `/api/oauth/`, JWT cookie auth now reachable via finda.sale |
| Auth | `AuthContext.tsx` reads `/auth/me` on mount instead of localStorage |
| Auth | `lib/api.ts` sends cookies on all requests, auto-refreshes on 401 |
| Auth | All cookies now have `secure: true` (was conditional on NODE_ENV) |
| GDPR | `GET /api/users/me/export` — JSON download of all user data (1 req/24hr limit) |
| GDPR | "Download My Data" button in organizer settings |
| CCPA | `POST /api/users/me/do-not-sell` + `/do-not-sell` page |
| Legal | Terms Section 15 arbitration clause (AAA, Kent County MI, class action waiver) |
| CAN-SPAM | Physical address default corrected to 219 E Michigan Ave, Suite F, Paw Paw, MI 49079 |
| Stripe | `charge.refunded` webhook handler (updates Purchase.status to REFUNDED) |
| Stripe | `automatic_tax: {enabled: true}` on PaymentIntent/Checkout creation |
| Stripe | Dunning grace period: immediate downgrade fixed → 7-day grace (`TIER_GRACE_DAYS` env) |
| Auctions | Bid validation improved (type + positive + must exceed currentHighBid) |
| SEO | Canonical URLs on 5 page types (sales, items, organizers, categories, search) |
| A11y | `prefers-reduced-motion` CSS block added |
| Observability | Sentry Cron check-ins on all cron jobs (in_progress/ok/error per run) |
| Observability | Slow-query detection: >1000ms → Sentry warning |
| Observability | Connection pool monitoring (busy >8 connections → Sentry alert) |
| Ops | SIGTERM/SIGINT graceful shutdown (30s drain) |
| Ops | Email deliverability cron (weekly bounce rate alert if >2%) |
| Scraper | Address normalization in dedup (suffix/directional normalization) |
| Scraper | Camera race fix: optimistic lock on processRapidDraft; organizer-set values always win |
| Scraper | Geocoding audit cron (daily, alerts if >10% null geocoding per source) |
| Scraper | 20+ unit tests for address normalization |
| Claim | `GET /organizers/claim/verify/:token` endpoint + `/claim/verify/[token]` page |
| Content | Cloudinary NSFW detection on upload (auto-deletes flagged images) |
| Content | Cloudinary orphan cleanup when item deleted |
| Games | `GET /admin/xp-velocity` — users with >500 XP in any 1-hr window |
| Games | `/admin/xp-velocity` admin page |
| D-006 | "Enable AI camera tagging" → "Enable Smart camera tagging" |
| Docs | `claude_docs/API_RESPONSE_FORMAT.md` — standard response shapes reference |

---

## 📊 Build status

| Layer | Status |
|---|---|
| Railway (backend) | ✅ Green (last push: S666) |
| Vercel (frontend) | ⏳ Pending S667 push |
| Migration `20260507000001_add_ccpa_opt_out` | ❌ Needs `prisma migrate deploy` |
| Migration `20260506000001_add_age_verified` | ✅ Live |
| Sentry on backend | ⚠️ Verify SENTRY_DSN env var on Railway |

---

## 🧠 Compression-survival pointer

S667 key facts: NextAuth is now at `/api/oauth/[...nextauth].ts`. Old file at `/api/auth/[...nextauth].ts` was `git rm`'d. OAuth redirect URLs must match `/api/oauth/callback/{google,facebook}`. ccpaOptOut migration needs to run. 15 frontend files still use localStorage JWT (non-blocking — tracked for future sweep).
