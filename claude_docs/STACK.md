# STACK LOCK

This document defines locked technical decisions.
Stack changes require explicit user approval.
No silent library substitutions.

---

## Frontend

- Framework: Next.js 14 (Pages Router)
- Styling: Tailwind CSS
- Server State: @tanstack/react-query
- Forms: React Hook Form + Zod
- PWA: next-pwa
- SEO: next-sitemap

---

## Backend

- Runtime: Node.js
- Framework: Express
- ORM: Prisma
- Validation: Zod
- Auth: JWT + bcrypt + NextAuth v4 (OAuth)
- File Upload: Multer
- Payments: Stripe (Connect + application_fee_amount)
- Email: Resend
- SMS: Twilio
- Background Jobs: node-cron
- Realtime: Socket.io (for auctions)
- Security Headers: Helmet
- Rate Limiting: express-rate-limit

---

## Database

- Engine: PostgreSQL
- Schema Source of Truth: Prisma

---

## Maps & Geocoding

- Map: Leaflet + react-leaflet
- Tiles: OpenStreetMap
- Geocoding: Nominatim (backend cache layer)

---

## Image Storage

- Primary: Cloudinary (locked)
- Direct browser upload (signed URL)
- CDN-delivered

---

## Infrastructure

- Monorepo: pnpm workspaces
- Containerization: Docker (production Railway only; local dev is native Windows)
- Version Control: GitHub
- Frontend Deployment: Vercel (finda.sale)
- Backend Deployment: Railway (backend-production-153c9.up.railway.app)
- Database: Railway PostgreSQL (production — migrated from Neon, S264)

---

## Fee Structure

- **Rate:** 10% flat — all item types (FIXED, AUCTION, REVERSE_AUCTION, LIVE_DROP, POS)
- **All-in with Stripe (~3.2%):** ~13.2% — competitive with Etsy, well below eBay/MaxSold
- **Implementation:** `FeeStructure` DB table (single row, rate configurable without code deploy)
- **Tier/subscription discounts:** deferred — revisit after beta data collected
- **Locked:** 2026-03-10. Do not change without Patrick approval.

---

## Architecture Principles

- Monorepo separation: frontend / backend / database / shared
- Prisma = schema authority
- Stateless auth (JWT)
- Stripe handles compliance
- PWA over native app

---

## Deploy Risk Matrix

Risk level for changes in each code area. Used by findasale-deploy to gate pre-deploy checklist steps.

| Code Area | Risk Level | Why | Pre-Deploy Required |
|-----------|-----------|-----|---------------------|
| `packages/database/prisma/schema.prisma` | 🔴 HIGH | Schema changes can corrupt data or lock tables | Architect review + migrate deploy (never db push) + Railway DB backup |
| `packages/backend/src/controllers/authController.ts` | 🔴 HIGH | Auth bugs = account takeover or lockout | Security review + staging smoke test + OAuth flow test |
| `packages/backend/src/controllers/stripeController.ts` | 🔴 HIGH | Payment logic errors = money loss or failed transactions | Full checkout flow test + webhook test + Stripe test mode pass |
| `packages/backend/src/routes/items.ts` (bulk endpoints) | 🟠 MEDIUM-HIGH | Bulk ops on wrong items = data loss for organizers | Dry-run mode test + ownership validation check |
| `packages/backend/src/controllers/reservationController.ts` | 🟠 MEDIUM-HIGH | Holds are time-sensitive; batch bugs = silent data corruption | Batch hold tests + expiry cron check |
| `packages/backend/src/index.ts` | 🟠 MEDIUM | Entry point — bad import or route registration = server down | Build check + Railway deploy health check |
| `packages/frontend/pages/organizer/add-items/[saleId].tsx` | 🟠 MEDIUM | Core organizer workflow — regression = can't add items | Manual smoke test on add-items flow |
| `packages/frontend/pages/organizer/holds.tsx` | 🟠 MEDIUM | Hold management — batch bugs visible to organizers | Manual holds test |
| `packages/frontend/pages/organizer/dashboard.tsx` | 🟡 MEDIUM | Dashboard is first screen — visual regressions noticed immediately | Screenshot comparison |
| `packages/backend/src/services/weeklyEmailService.ts` | 🟡 MEDIUM | Cron job — bad logic = emails to wrong users | Test send to patrick@test before enabling |
| `packages/backend/src/services/cloudAIService.ts` | 🟡 MEDIUM | AI tagging — bugs produce bad tags, not data loss | Spot check 3 items post-deploy |
| `packages/frontend/pages/tags/[slug].tsx` | 🟢 LOW | ISR page — worst case = stale cache, not broken | Auto-verified by Vercel build |
| `packages/frontend/components/BulkCategoryModal.tsx` et al | 🟢 LOW | Modal UI — bugs are visible, not silent | Manual smoke test |
| `claude_docs/` any `.md` file | 🟢 LOW | Documentation only — zero runtime impact | No gate needed |
| `.env` / environment variables | 🔴 HIGH | Missing vars = silent failures or startup crash | Verify all required vars in Railway before deploy |

### Deployment Gates by Risk Level
- 🔴 HIGH: Requires Architect or QA review + staging test + Patrick approval
- 🟠 MEDIUM-HIGH: Requires QA smoke test + health-scout scan
- 🟡 MEDIUM: Requires health-scout scan + post-deploy verification
- 🟢 LOW: Standard deploy, monitor logs for 10 minutes

---

Change Control:
Any stack modification must update this file.
