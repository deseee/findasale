---
name: findasale-deploy
description: >
  FindA.Sale pre-deploy checklist and release workflow. Run this skill whenever
  Patrick says: "deploy", "push to production", "release", "go live", "push
  to Vercel", "ready to ship", or "is it safe to deploy". Also trigger when
  Patrick asks "what do I need to do before deploying?" or "deploy checklist".
  ALWAYS use this skill before any production deployment — it ensures nothing
  critical is missed. Do not attempt a production deploy without this skill.
---

# Deploy / Release — FindA.Sale

Runs the pre-deploy checklist, confirms the build is clean, and guides the
release. Synthesizes SECURITY.md, health-scout findings, and ops knowledge
into one workflow. Never auto-deploys — always confirms with Patrick before
executing any deployment commands.

---

## When to Use

Trigger on: "deploy", "release", "push to production", "go live", "push to
Vercel", "ready to ship", "what do I need before deploy?"

Always run health-scout first if it hasn't run in the current session.

---

## Path Setup

```bash
PROJECT_ROOT=$(ls -d /sessions/*/mnt/FindaSale 2>/dev/null | head -1)
BACKEND="$PROJECT_ROOT/packages/backend"
FRONTEND="$PROJECT_ROOT/packages/frontend"
TODAY=$(date +%Y-%m-%d)
```

---

## Step 1 — Health Check

If health-scout hasn't run today:

> "Running health-scout first — this catches blockers before you ship."

Use the health-scout skill. Any Critical finding is a **deploy blocker** —
do not proceed until resolved. High findings need Patrick's explicit sign-off.

If a recent report exists in `claude_docs/health-reports/`, read it and skip
the scan if it's from today and shows zero Critical/High findings.

---

## Step 1.5 — Legal / Compliance Check

Before deploying any new user-facing feature to beta or production, confirm a
**findasale-legal compliance review** has been completed if the feature involves:
- Payments, fees, or financial data
- User data collection, storage, or sharing
- Public communication (emails, notifications, marketing)
- Secondary sales-specific regulatory requirements (varies by sale type: estate, auction, consignment, etc.)

Ask: "Has findasale-legal reviewed this feature?"
If not, and the feature is in scope: "⚠️ Recommend running findasale-legal compliance check
before shipping — trigger with 'compliance check for [feature]'."

If Patrick confirms legal review is not needed (backend-only, no user impact), proceed.

---

## Step 2 — Git State Check

```bash
cd "$PROJECT_ROOT"
git status
git log --oneline -5
```

Flag to Patrick if:
- There are uncommitted changes
- The local branch is behind `origin/main`
- Any staged files look like they shouldn't ship (`.env`, test fixtures, debug files)

---

## Step 3 — Secrets and Environment Checklist

Run these checks and report findings:

```bash
# No hardcoded secrets in source
grep -rn "sk_live\|sk_test\|STRIPE_SECRET\|password.*=.*['\"][^${\(]" \
  "$PROJECT_ROOT/packages" --include="*.ts" --include="*.tsx" \
  --exclude-dir="node_modules" 2>/dev/null

# .env not tracked by git
git ls-files "$BACKEND/.env" "$PROJECT_ROOT/packages/frontend/.env*" 2>/dev/null

# .env.example exists and is tracked
git ls-files "$BACKEND/.env.example" 2>/dev/null

# Required production vars are set (not placeholder values)
grep -E "your_|YOUR_|changeme|placeholder|<your" \
  "$BACKEND/.env" 2>/dev/null
```

**Required production env vars — confirm each is set:**

| Var | Where | Notes |
|-----|-------|-------|
| `DATABASE_URL` | backend/.env | Must point to production DB, not localhost |
| `JWT_SECRET` | backend/.env | Strong random string, not default |
| `STRIPE_SECRET_KEY` | backend/.env | `sk_live_...` for production |
| `STRIPE_WEBHOOK_SECRET` | backend/.env | From Stripe dashboard → Webhooks |
| `STRIPE_PLATFORM_FEE_PERCENT` | backend/.env | 5 (regular) or 7 (auction) |
| `RESEND_API_KEY` | backend/.env | Email delivery |
| `MAILERLITE_API_KEY` | Railway | Email marketing — set if MailerLite campaigns enabled |
| `ALLOWED_ORIGINS` | backend/.env | Must be production domain, NOT localhost |
| `CLOUDINARY_*` | backend/.env | Or Vercel Blob credentials |

If `ALLOWED_ORIGINS` is still `http://localhost:3000`, **stop and ask Patrick
for the production domain** before proceeding.

---

## Step 4 — Database Migration Check

Verify all pending migrations are applied:

```bash
cd "$PROJECT_ROOT"
git log --oneline --all -- "packages/database/prisma/migrations/" | head -10
```

Ask Patrick: "Have you run `prisma migrate deploy` against the production
database? This applies any pending schema migrations."

Command for production migration (Patrick runs from PowerShell):
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="[pooled neon url from packages/backend/.env]"
$env:DIRECT_URL="[direct neon url from packages/backend/.env]"
pnpm run db:generate
npx prisma migrate deploy
```

⚠️ Never use `prisma db push` in production — it can silently drop columns.
Use `prisma migrate deploy` which applies migration files in order.

---

## Step 5 — Frontend Build Check

Verify frontend builds locally before pushing (Patrick runs from PowerShell):
```powershell
pnpm --filter frontend build
```

Key things to verify:
- No TypeScript errors
- PWA manifest and icons present (`packages/frontend/public/icons/`)
- `next.config.js` security headers configured (not development defaults)
- No `console.log` calls in production pages

```bash
grep -rn "console\.log\|alert(" "$FRONTEND/pages" --include="*.tsx" 2>/dev/null \
  | grep -v "^\s*//" | grep -v "node_modules"
```

---

## Step 6 — Stripe Verification

Before going live with payments:

1. Confirm Stripe account is activated (not just test mode)
2. Confirm `STRIPE_SECRET_KEY` starts with `sk_live_` (not `sk_test_`)
3. Confirm webhook endpoint is registered in Stripe dashboard pointing to production URL
4. Confirm `STRIPE_WEBHOOK_SECRET` matches the Stripe dashboard webhook secret
5. Run one test transaction in Stripe's live test mode if possible

If any Stripe item is unconfirmed, flag it — payment failures in production
are a critical UX and trust issue.

---

## Step 7 — Service Worker Version

PWA service workers cache aggressively. If you've changed frontend code,
bump the cache version to force clients to get fresh assets:

Check `packages/frontend/next.config.js` — look for the `runtimeCaching` or
`buildExcludes` config from `next-pwa`. The version is typically embedded in
the build hash automatically, but confirm the build produces a new SW file.

If there are stale-cache complaints from users, increase the `version` field
in `public/manifest.json`.

---

## Step 8 — Deploy

### Option A: Vercel (frontend — auto-deploys from main)

Push to `main` via `.\push.ps1` — Vercel auto-deploys on every push to main.
Monitor deployment at: vercel.com/dashboard

```powershell
# Manual emergency override only (requires Vercel CLI installed):
vercel --prod
```

### Option B: Backend (Railway auto-deploys from main)

Railway detects the push and builds via `Dockerfile.production`. No manual
commands needed. Monitor in the Railway dashboard → Deployments tab.

### Option C: Database-only migration (no code change)

Patrick runs from PowerShell (see Step 4 migration commands above).
Railway does NOT run migrations automatically — always run manually before deploy.

---

## Step 9 — Post-Deploy Verification

After deploy, run through this quickly:

```
□ Homepage loads and shows published sales
□ Login works (register + login flow)
□ Sale detail page loads with map pin
□ Organizer dashboard accessible
□ Stripe Connect onboarding link generates (doesn't have to complete)
□ No 500 errors in server logs
□ PWA installable on mobile (check browser install prompt)
```

Check Railway dashboard → Deployments → latest deploy logs for errors.
Or use Railway CLI if installed: `railway logs`

---

## Checklist Summary (quick reference)

```
□ Health scout: zero Critical/High findings
□ Legal/compliance check completed (if user-facing feature)
□ Git state: clean, up to date with origin
□ No .env committed, no hardcoded secrets
□ ALLOWED_ORIGINS set to production domain
□ All required production env vars set (no placeholder values)
□ Stripe: live keys, webhook secret, endpoint registered
□ prisma migrate deploy run against production DB
□ Frontend builds clean (no TS errors, no console.log)
□ Post-deploy smoke test passed
```

---

## What NOT to Do

- Never `prisma db push` in production
- Never deploy with `ALLOWED_ORIGINS=http://localhost:3000`
- Never commit `.env` files
- Never deploy with Critical health findings unresolved
- Never deploy without running `prisma migrate deploy` if schema changed

---

## Related Files

- `claude_docs/SECURITY.md` — full security rules
- `claude_docs/RECOVERY.md` — rollback procedures
- `claude_docs/health-reports/` — recent scan results
- `packages/backend/.env.example` — env var reference


## Steelmanned Improvement: Deploy Impact Assessment

Before Step 2 (Git State Check), scan the git diff against this risk matrix:

| Code Area Changed | Risk Level | Extra Steps |
|-------------------|-----------|-------------|
| payments/, stripe | HIGH | Full health-scout + manual Stripe test |
| auth/, JWT, sessions | HIGH | Login flow smoke test required |
| prisma/schema, migrations | HIGH | Verify migration deploy + rollback plan |
| pages/, components/ | MEDIUM | Visual smoke test on mobile + desktop |
| api/, routes/ | MEDIUM | Endpoint test for changed routes |
| scripts/, config/ | LOW | Environment diff check |

Surface the highest risk level to Patrick before proceeding. HIGH risk = 
recommend full QA pass first.

## Plugin Skill Delegation

When running deployment workflows, these plugin skills are available to enhance your output:

- **engineering:deploy-checklist** — Pre-deployment verification checklist to catch missed steps
- **operations:change-management** — Change management documentation for significant or risky deployments
- **operations:runbook** — Create or reference deployment runbooks for Railway, Vercel, and Neon migration steps
