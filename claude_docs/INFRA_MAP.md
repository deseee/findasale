# INFRA_MAP — FindA.Sale Infrastructure Single Source of Truth

> Authority: This file. Update it any time a provider is added, removed, or reconfigured.
> Companion: `claude_docs/infra-spend-tracker.md` tracks monthly cost.
> Origin: Guardrail (a) from `claude_docs/audits/infra-cost-security-2026-06-24.md` §8.

---

## Triage rule

When something breaks, ask **infra or code?** in this order:

1. Is the Railway backend service deployed to HEAD? → `GET https://backend-production-153c9.up.railway.app/health` — check `deployedSha` vs HEAD.
2. Is Vercel at HEAD? → Vercel dashboard / MCP `list_deployments` for `finda.sale`.
3. Is the DB reachable? → `GET .../health/ready` (200 = DB up, 503 = DB down).
4. Did GitHub Actions CI pass? → run conclusion must be `success` (not just Vercel/Railway green — they are independent systems).
5. Only after ruling out infra: look at code.

---

## 1. Railway — Backend (Node.js / Express)

| Property | Value |
|----------|-------|
| Service | `backend` (project: `keen-wisdom`, env: `production`) |
| Public URL | `https://backend-production-153c9.up.railway.app` |
| Health endpoint | `GET /health` → `{ status, deployedSha, lastJobRunAt, uptimeSec, timestamp }` |
| Readiness endpoint | `GET /health/ready` → 200 OK or 503 |
| Deploy trigger | Push to `main` where push TIP matches `watchPatterns: ["/packages/backend/**"]` |
| **Stranding risk** | If push tip is a docs/frontend commit, backend changes in earlier commits are SKIPPED. Fix: bump `packages/backend/Dockerfile.production` cache-bust comment. |
| Build file | `packages/backend/Dockerfile.production` |
| Start command | `node /app/packages/backend/dist/index.js` |
| Restart policy | `ON_FAILURE`, max 3 retries |
| Health check path | `/` (Railway-native, not the `/health` freshness endpoint) |
| Cost tier | Starter plan (~$5/mo base + usage) |
| Railway CLI token | Stored in `.claude/railway.env` (gitignored). Binary at `.claude/bin/railway`. |

### Railway backend — environment variables owned

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Internal Postgres URL (`postgres.railway.internal:5432`) |
| `DIRECT_URL` | Same as DATABASE_URL (for Prisma) |
| `JWT_SECRET` | Auth token signing |
| `STRIPE_SECRET_KEY` | Stripe live secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook endpoint secret |
| `SENTRY_DSN` | Sentry error ingestion DSN |
| `CLOUDINARY_CLOUD_NAME` / `API_KEY` / `API_SECRET` | Image upload & CDN |
| `RESEND_API_KEY` | Transactional email |
| `TWILIO_*` | SMS |
| `ANTHROPIC_API_KEY` | Claude Haiku (AI tagging pipeline) |
| `GOOGLE_VISION_API_KEY` | Photo analysis |
| `GMAIL_REFRESH_TOKEN` / `GMAIL_MAILBOX_REFRESH_TOKEN` | Outreach & bounce polling |
| `OUTREACH_SECRET` | Internal pipeline auth (`/api/internal/*`) |
| `INTERNAL_SCRAPER_KEY` | GitHub Actions → backend scraper ingest auth |
| `OUTREACH_DAILY_CAP` | Email send cap (currently `1` — warmup hold) |
| `OUTREACH_ENABLED` | Kill-switch for outreach pipeline |
| `RAILWAY_PUBLIC_DOMAIN` | Auto-injected by Railway — used to build tracking URLs |
| `RAILWAY_GIT_COMMIT_SHA` | Auto-injected by Railway — surfaced in `/health` as `deployedSha` |

---

## 2. Railway — PostgreSQL

| Property | Value |
|----------|-------|
| Service | `postgres` (same project: `keen-wisdom`) |
| Internal URL | `postgresql://postgres:…@postgres.railway.internal:5432/railway` |
| Public proxy | `postgresql://postgres:…@maglev.proxy.rlwy.net:13949/railway` |
| Schema authority | `packages/database/prisma/schema.prisma` |
| Migration command | `prisma migrate deploy` (never `db push` in production) |
| Backup | Nightly at 3 AM via Task Scheduler → `backups/` (7-day retention) |
| Cost tier | Starter shared instance (included in Railway plan) |

---

## 3. Vercel — Frontend (Next.js 14)

| Property | Value |
|----------|-------|
| Project | Patrick's personal Vercel account, project `finda.sale` |
| Production URL | `https://finda.sale` |
| Deploy trigger | Push to `main` (all paths — no watchPattern filter) |
| Framework | Next.js 14 Pages Router |
| Build output | `.next/` |
| Config file | `packages/frontend/vercel.json` |
| CI gate | "Wait for CI" = **NOT enabled** (Vercel Hobby plan — Pro feature only) |
| Cost tier | Hobby (free) |

### Vercel — environment variables owned

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | Backend URL for client-side fetches |
| `NEXTAUTH_SECRET` | NextAuth session signing |
| `NEXTAUTH_URL` | Canonical app URL |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth |
| `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` | OAuth |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe client-side key |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Image delivery |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web push notifications |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Frontend error tracking |

---

## 4. GitHub Actions

| Property | Value |
|----------|-------|
| Repo | `deseee/findasale` (public) |
| CI workflow | `.github/workflows/ci-typecheck.yml` — 4 blocking steps: backend tsc, frontend tsc, backend tests, frontend lint |
| CI trigger | Push/PR to `main`; paths-ignore: `claude_docs/**`, `**.md`, `.github/CODEOWNERS` |
| Billing | 2,000 free Linux min/mo (GitHub Free). ~3,300–4,000 min/mo burn after S1031 optimizations → target ≤2,000. |
| Billing block signature | CI run dies in <30s: "job was not started because recent account payments have failed" |
| Secrets store | Encrypted repo secrets (separate from Railway env vars — must be kept in sync after rotations) |
| Key secrets | `DATABASE_URL`, `DIRECT_URL`, `INTERNAL_SCRAPER_KEY`, `SENTRY_TOKEN`, `GITHUB_TOKEN` (auto) |
| Concurrency | `cancel-in-progress: true` per ref — superseded pushes cancel prior runs |

### Major scheduled workflows

| Workflow | Schedule | Est. min/mo | Notes |
|----------|----------|-------------|-------|
| `scrape-garagesalefinder.yml` | Daily | ~120 | Core sales feed |
| `scrape-estatesalesnet.yml` | Daily | ~90 | Core sales feed |
| `scrape-facebook-events.yml` | Daily | ~90 | Core sales feed |
| `scrape-publicsurplus.yml` | Monthly (post-S1031) | ~194 | Govt agency discovery |
| `scrape-osm.yml` | Weekly | ~170 | OSM venue data |
| `scrape-licenses-phase2-batch.yml` | Weekly Mon 05:00 UTC | ~180 | 51-state license batch (S1031) |
| `geocode-ungeocoded-sales.yml` | 1×/day (post-S1031) | ~30 | Was 3×/day |
| `pipeline-outreach-emails.yml` | 1×/day (post-S1031) | ~24 | Was 6×/day; cap=1 |

---

## 5. Cloudinary

| Property | Value |
|----------|-------|
| Purpose | Image upload, storage, CDN delivery |
| Upload method | Direct browser upload via signed URL (no server relay) |
| Delivery | CDN with `f_auto,q_auto` transforms |
| Cost tier | Free tier (25 credits/mo) — monitor if photo volume grows |
| Env vars | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |

---

## 6. Sentry

| Property | Value |
|----------|-------|
| Purpose | Backend + frontend error tracking; post-deploy regression tripwire |
| Backend init | `packages/backend/src/instrument.ts` (must be first import in `index.ts`) |
| DSN env var | `SENTRY_DSN` (backend) / `NEXT_PUBLIC_SENTRY_DSN` (frontend) |
| Sample rate | 10% traces in production, 0 in dev |
| Auth token | `SENTRY_TOKEN` GitHub Actions secret — used for post-deploy checks |
| Organization | `findasale` (check Sentry settings for exact org slug) |
| Cost tier | Free Developer plan |

---

## 7. Resend

| Property | Value |
|----------|-------|
| Purpose | Transactional email (sale notifications, receipts, digests) |
| From domain | `finda.sale` (DNS records managed on Vercel) |
| Env var | `RESEND_API_KEY` |
| Cost tier | Free tier (3,000 emails/mo) |

---

## 8. Google APIs

| API | Purpose | Status | Notes |
|-----|---------|--------|-------|
| Cloud Vision | Photo label/object detection → AI tagging | Active | Billing incident May 2026 ($201 charge). Strict lockdown rules in project memory. |
| Google OAuth | User authentication | Active | Client credentials in Vercel env |
| Google Merchant Center | Product feed (`/api/google-merchant`) | Active | XML feed served by backend |
| Google Postmaster Tools | Outreach domain reputation monitoring | Active | `outreach.finda.sale` verified 2026-06-30 |
| Google Places | Venue enrichment scraper | Active | `GOOGLE_PLACES_API_KEY` |

---

## 9. Stripe

| Property | Value |
|----------|-------|
| Purpose | Payments — Connect Express (organizer payouts), application fees |
| Fee structure | 10% platform fee (SIMPLE) / 8% (PRO/TEAMS) — locked S106/S527 |
| Webhook endpoint | `POST /api/stripe/webhook` |
| Env vars | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| Cost tier | Pay-per-transaction (no monthly fee) |

---

## 10. DNS / Email Infrastructure

| Provider | Role |
|----------|------|
| Spaceship | Domain registrar for `finda.sale` (nameservers point to Vercel) |
| Vercel DNS | Authoritative DNS for `finda.sale` and `outreach.finda.sale` |
| ImprovMX | `outreach@finda.sale` bounce forwarding → `outreach@outreach.finda.sale` |
| Google Workspace | `outreach.finda.sale` mailbox (bounce suppression polling) |
| MailerLite | (Legacy — check DNS records before removing any TXT entries) |

---

## 11. Monitoring & Observability

| Tool | Purpose | Trigger |
|------|---------|---------|
| Sentry | Real-time error alerts; post-deploy regression check | See `.github/workflows/check-sentry-after-deploy.yml` |
| `/health` endpoint | Liveness + freshness (deployedSha, lastJobRunAt, uptimeSec) | Uptime monitors, session-start smoke test |
| `/health/ready` | Readiness — DB reachable check | Railway healthcheck |
| GitHub Actions CI | Type safety + tests + lint gate before deploy | Every push/PR to main |
| `data-persistence-monitor` | Scheduled Cowork task — DB write verification | Daily |

---

## 12. Deploy flow summary

```
Patrick runs .\push.ps1
  → git push main
  → GitHub Actions ci-typecheck.yml fires (4 blocking steps)
  → Vercel detects push → builds frontend → finda.sale (all commits)
  → Railway detects push → checks watchPatterns ["/packages/backend/**"]
      → if push TIP matches: builds + deploys backend (Dockerfile.production)
      → if push TIP is docs/frontend: backend deploy SKIPPED (stranding risk)
  → Sentry post-deploy check fires 30 min after CI completes (check-sentry-after-deploy.yml)
```

---

## 13. Re-audit cadence

This document should be re-reviewed whenever:
- A new provider is added or removed
- An env var is rotated or added
- A deploy-trigger rule changes (watchPatterns, paths-ignore, CI gates)
- A billing tier changes

Last reviewed: 2026-06-25 (Session S1032 — guardrail implementation)
