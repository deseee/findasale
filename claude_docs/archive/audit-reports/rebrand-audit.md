# Rebrand Audit — SaleScout → FindA.Sale
*Generated: 2026-03-03*

Brand swap rules:
- `SaleScout` (display) → `FindA.Sale`
- `salescout.app` (domain) → `finda.sale`
- `salescout` (lowercase slug/identifier) → `findasale` (package/DB names) or `finda.sale` (URLs/email)
- Docker container prefix: `salescout-` → `findasale-` (or leave as-is — cosmetic, no runtime impact)

---

## 1. Root `package.json`
| File | Line | Current | Replace With | Notes |
|------|------|---------|-------------|-------|
| `package.json` | 2 | `"name": "salescout-monorepo"` | `"name": "findasale-monorepo"` | Internal only, no user impact |

Subpackage `package.json` names (`backend`, `frontend`, `database`, `shared`) are already generic — no change needed.

---

## 2. `docker-compose.yml`
| Location | Current | Replace With | Notes |
|----------|---------|-------------|-------|
| `POSTGRES_USER` | `salescout` | `findasale` | ⚠️ Requires DB teardown + recreate or `ALTER ROLE` |
| `POSTGRES_PASSWORD` | `salescout` | *(leave or change separately)* | Credential, change at own discretion |
| `POSTGRES_DB` | `salescout` | `findasale` | ⚠️ Requires DB teardown + recreate |
| `healthcheck` pg_isready | `-U salescout` | `-U findasale` | Must match POSTGRES_USER |
| `DATABASE_URL` (backend env) | `postgresql://salescout:salescout@postgres:5432/salescout` | `postgresql://findasale:findasale@postgres:5432/findasale` | Must match above |

**Docker container names** (`salescout-backend-1` etc.) are auto-generated from the compose project name. To rename: set `name: findasale` at top of `docker-compose.yml`. Cosmetic but nice to have.

---

## 3. Frontend — `_document.tsx`
All in `packages/frontend/pages/_document.tsx`:

| Tag | Current | Replace With |
|-----|---------|-------------|
| `apple-mobile-web-app-title` | `SaleScout` | `FindA.Sale` |
| `description` meta | `SaleScout — discover estate sales...` | `FindA.Sale — discover estate sales...` |
| `author` meta | `SaleScout` | `FindA.Sale` |
| `og:site_name` | `SaleScout` | `FindA.Sale` |
| `og:title` | `SaleScout — Estate Sales Near You` | `FindA.Sale — Estate Sales Near You` |
| `twitter:title` | `SaleScout — Estate Sales Near You` | `FindA.Sale — Estate Sales Near You` |

---

## 4. Frontend — `manifest.json`
File: `packages/frontend/public/manifest.json`

| Key | Current | Replace With |
|-----|---------|-------------|
| `name` | `SaleScout` | `FindA.Sale` |
| `short_name` | `SaleScout` | `FindA.Sale` |
| `description` | `Find estate sales and auctions near you...` | *(update copy as desired)* |

---

## 5. Frontend — `next.config.js`
| Line | Current | Replace With |
|------|---------|-------------|
| Comment in runtimeCaching | `// SaleScout API — network first...` | `// FindA.Sale API — network first...` | Cosmetic comment only |

---

## 6. Frontend — `next-sitemap.config.js`
| Line | Current | Replace With |
|------|---------|-------------|
| `siteUrl` fallback | `'https://salescout.app'` | `'https://finda.sale'` |
| `additionalPaths` fallback | `'https://salescout.app'` | `'https://finda.sale'` |

---

## 7. Frontend — Pages (page titles & body copy)

### Hardcoded `salescout.app` URLs (must change)
| File | Lines | Change |
|------|-------|--------|
| `pages/city/[city].tsx` | 45, 116 | `'https://salescout.app'` → `'https://finda.sale'` |
| `pages/sales/[id].tsx` | 279, 360 | `'https://salescout.app'` → `'https://finda.sale'` |
| `pages/sales/zip/[zip].tsx` | 62 | `'https://salescout.app'` → `'https://finda.sale'` |
| `pages/server-sitemap.xml.tsx` | 27, 36, 45, 53 | `'https://salescout.app'` → `'https://finda.sale'` |
| `pages/creator/dashboard.tsx` | 108 | `'https://salescout.app'` (origin state default) → `'https://finda.sale'` |

### Hardcoded `@salescout.app` email addresses in UI
| File | Lines | Current | Replace With |
|------|-------|---------|-------------|
| `pages/contact.tsx` | 65 | `support@salescout.app` | `support@finda.sale` |
| `pages/creator/dashboard.tsx` | 331–332 | `hello@salescout.app` | `hello@finda.sale` |
| `pages/faq.tsx` | 85–86, 152–153 | `support@salescout.app` | `support@finda.sale` |
| `pages/privacy.tsx` | 72 | `privacy@salescout.app` | `privacy@finda.sale` |
| `pages/terms.tsx` | 80 | `support@salescout.app` | `support@finda.sale` |

### `SaleScout` display name in page titles / body (high volume — use find-and-replace)
All occurrences of `SaleScout` in `pages/` (titles, headings, body copy): ~50+ instances across 404, 500, about, contact, creator/dashboard, faq, forgot-password, index, items/[id], login, offline, organizer/*, organizers/[id], privacy, profile, referral-dashboard, register, reset-password, shopper/*, terms.

**Recommended approach:** global sed across `packages/frontend/pages/` — `SaleScout` → `FindA.Sale`. Review `about.tsx` and `terms.tsx` body copy manually for contextual accuracy.

### OG image route
| File | Line | Current | Replace With |
|------|------|---------|-------------|
| `pages/api/og.tsx` | 38 | `SaleScout` (watermark/logo text) | `FindA.Sale` |
| `pages/api/og.tsx` | 80 | `Check it out on SaleScout!` | `Check it out on FindA.Sale!` |

---

## 8. Frontend — Components

### `components/Layout.tsx`
| Line | Current | Replace With |
|------|---------|-------------|
| 104 | `SaleScout` (nav logo text) | `FindA.Sale` |
| 184 | `SaleScout` (footer heading) | `FindA.Sale` |
| 213 | `© {year} SaleScout. All rights reserved.` | `© {year} FindA.Sale. All rights reserved.` |

### `components/InstallPrompt.tsx`
| Line | Current | Replace With |
|------|---------|-------------|
| 17 | `'salescout_install_dismissed_until'` (localStorage key) | `'findasale_install_dismissed_until'` |
| 97 | `aria-label="Install SaleScout"` | `aria-label="Install FindA.Sale"` |
| 101 | `alt="SaleScout icon"` | `alt="FindA.Sale icon"` |
| 104 | `Add SaleScout to your home screen` | `Add FindA.Sale to your home screen` |
| 130 | `aria-label="Add SaleScout to Home Screen"` | `aria-label="Add FindA.Sale to Home Screen"` |
| 140 | `Add SaleScout to your Home Screen` | `Add FindA.Sale to your Home Screen` |

---

## 9. Backend — Email / Notification Templates

### `src/routes/auth.ts`
| Line | Current | Replace With |
|------|---------|-------------|
| 77 | `'noreply@salescout.app'` (fallback) | `'noreply@finda.sale'` |
| 84 | `subject: 'Reset your SaleScout password'` | `subject: 'Reset your FindA.Sale password'` |

### `src/routes/contact.ts`
| Line | Current | Replace With |
|------|---------|-------------|
| 31 | `'support@salescout.app'` (fallback) | `'support@finda.sale'` |
| 32 | `'noreply@salescout.app'` (fallback) | `'noreply@finda.sale'` |
| 41 | `` `[SaleScout Contact] ${subject}` `` | `` `[FindA.Sale Contact] ${subject}` `` |
| 59 | `'We received your message – SaleScout'` | `'We received your message – FindA.Sale'` |
| 66 | `SaleScout &mdash; salescout.app link` | `FindA.Sale &mdash; finda.sale link` |

### `src/controllers/notificationController.ts`
| Line | Current | Replace With |
|------|---------|-------------|
| 246 | `🏷️ SaleScout` (email header) | `🏷️ FindA.Sale` |
| 262 | `You're receiving this because you have a SaleScout account.` | `...a FindA.Sale account.` |
| 282 | `'digest@salescout.app'` (fallback) | `'digest@finda.sale'` |

### `src/controllers/stripeController.ts`
| Line | Current | Replace With |
|------|---------|-------------|
| 27 | `'receipts@salescout.app'` (fallback) | `'receipts@finda.sale'` |
| 28 | `'https://salescout.app'` (fallback URL) | `'https://finda.sale'` |

### `src/jobs/auctionJob.ts`
| Line | Current | Replace With |
|------|---------|-------------|
| 98 | `'receipts@salescout.app'` (fallback) | `'receipts@finda.sale'` |
| 99 | `'https://salescout.app'` (fallback URL) | `'https://finda.sale'` |

### `src/services/emailReminderService.ts`
| Line | Current | Replace With |
|------|---------|-------------|
| 81 | `...watching this sale on SaleScout.` | `...on FindA.Sale.` |
| 112 | `...watching this sale on SaleScout.` | `...on FindA.Sale.` |
| 134 | `'noreply@salescout.app'` (fallback) | `'noreply@finda.sale'` |

---

## 10. Backend — API Routes & Controllers

### `src/controllers/geocodeController.ts`
| Line | Current | Replace With |
|------|---------|-------------|
| 55 | `'SaleScout/1.0 (contact@salescout.app)'` (Nominatim User-Agent) | `'FindASale/1.0 (contact@finda.sale)'` |

### `src/controllers/marketingKitController.ts` (PDF generator)
| Line | Current | Replace With |
|------|---------|-------------|
| 95 | `.text('SaleScout', ...)` (PDF header) | `.text('FindA.Sale', ...)` |
| 187 | `'Generated by SaleScout  ·  salescout.app'` (PDF footer) | `'Generated by FindA.Sale  ·  finda.sale'` |

### `src/controllers/saleController.ts` (iCal export)
| Line | Current | Replace With |
|------|---------|-------------|
| 615 | `'PRODID:-//SaleScout//SaleScout//EN'` | `'PRODID:-//FindASale//FindASale//EN'` |
| 619 | `` `UID:sale-${id}@salescout.app` `` | `` `UID:sale-${id}@finda.sale` `` |
| 627 | `MAILTO:noreply@salescout.app` | `MAILTO:noreply@finda.sale` |

### `src/controllers/uploadController.ts`
| Line | Current | Replace With | Notes |
|------|---------|-------------|-------|
| 39 | `` `salescout/${folder}` `` (Cloudinary folder path) | `` `findasale/${folder}` `` | ⚠️ Existing uploaded images live under `salescout/` in Cloudinary — migrating them is a separate task. New uploads will go to `findasale/`. |

### `src/index.ts`
| Line | Current | Replace With |
|------|---------|-------------|
| 131 | `'SaleScout API is running!'` | `'FindA.Sale API is running!'` |
| 168 | `console.log('SaleScout backend running on port...')` | `console.log('FindA.Sale backend running on port...')` |

---

## 11. Database / Env

### `packages/database/.env`
| Current | Replace With | Notes |
|---------|-------------|-------|
| `postgres://postgresql://salescout:salescout@postgres:5432/salescout` | Fix malformed URL + swap to `findasale` | Also has `postgres://postgresql://` double-scheme bug |

### `docker-compose.yml` postgres env (already listed in §2)
The DB user/password/name swap requires a full local Docker volume wipe. Steps: `docker compose down -v` → update compose → `docker compose up`.

---

## 12. Docs & claude_docs

These are internal only — low priority, but worth sweeping:

| File | References | Action |
|------|-----------|--------|
| `claude_docs/DEVELOPMENT.md` | `# SaleScout — Development Guide` | Update title |
| `claude_docs/ROADMAP.md` | `salescout-backend-1` (docker exec commands), `SaleScout to Mailchimp` | Update container name references after Docker rename |
| `claude_docs/SECURITY.md` | Windows backup path `\SaleScout\` | Update path if folder is renamed |
| `claude_docs/SEED_SUMMARY.md` | `salescout-backend-1` | Update container name |
| `claude_docs/STATE.md` | Various references | Already aware; will auto-update at next context-maintenance run |
| `claude_docs/session-log.md` | Historical — leave as-is | |
| `claude_docs/CORE.md` | `salescout-health-scout` (scheduled task name) | Leave — this is the actual task ID in the scheduler |

---

## 13. Env Vars — No Immediate Code Change Needed

These are set via `.env` files and `docker-compose.yml` — no hardcoded fallback in prod:
- `RESEND_FROM_EMAIL` — set this to a `@finda.sale` address once DNS/email is configured
- `SUPPORT_EMAIL` — add this to `.env` with `support@finda.sale`
- `SITE_URL` — add `SITE_URL=https://finda.sale` to frontend `.env.local` to fix all sitemap fallbacks at once

---

## Priority Order for Execution

**Tier 1 — User-facing (do first):**
1. `_document.tsx` — meta tags, OG tags
2. `manifest.json` — PWA name
3. `components/Layout.tsx` — footer copyright + nav logo
4. All page titles (global sed on `pages/`)
5. Hardcoded `salescout.app` URLs in pages
6. Hardcoded email addresses in pages

**Tier 2 — Email content (high visibility):**
7. All email subject lines and body copy in `routes/` and `controllers/`
8. Email fallback sender addresses (or just set `RESEND_FROM_EMAIL` in env)

**Tier 3 — Config / Infrastructure:**
9. `next-sitemap.config.js` + `SITE_URL` env var
10. `docker-compose.yml` — compose project name + postgres credentials (requires volume wipe)
11. Root `package.json` name
12. Cloudinary folder path in `uploadController.ts`

**Tier 4 — Cosmetic / Internal:**
13. `src/index.ts` console logs
14. `geocodeController.ts` User-Agent
15. `marketingKitController.ts` PDF text
16. `saleController.ts` iCal PRODID/UID
17. `claude_docs/` docs

---

## Items Requiring Human Decision (not a simple swap)

| Item | Question |
|------|----------|
| Cloudinary folder path | Rename `salescout/` to `findasale/` in Cloudinary console? Existing image URLs will break if moved. |
| Docker postgres credentials | Keep `salescout`/`salescout` as internal creds (fine) or rename to `findasale`? Requires volume wipe locally. |
| `InstallPrompt` localStorage key | Renaming dismisses the prompt for existing users who already dismissed it. Acceptable? |
| Email sender domain | When will `@finda.sale` email be set up? Until then, keep existing Resend domain. |
| `about.tsx` body copy | Paragraph starting "SaleScout was created to revolutionize..." — needs a rewrite, not just a name swap. |
| `terms.tsx` body copy | "SaleScout acts as a payment facilitator..." — review legal language when swapping entity name. |
