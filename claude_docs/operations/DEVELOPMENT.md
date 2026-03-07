# FindA.Sale — Development Guide

## Prerequisites

- Node.js 18+
- pnpm 8+
- PostgreSQL (native Windows install, port 5432)

## Quick Start

```powershell
# Install all workspace dependencies
pnpm install

# Terminal 1 — Backend (Express, port 5000)
pnpm --filter backend run dev

# Terminal 2 — Frontend (Next.js, port 3000)
pnpm --filter frontend dev
```

---

## Monorepo Structure

```
packages/
  backend/     Express API (Node.js + Prisma)
  frontend/    Next.js PWA
  database/    Prisma schema + migrations
  shared/      Shared TypeScript types
```

---

## Environment Variables

Copy `.env.example` to `.env` in `packages/backend/` and fill in values:

```bash
cp packages/backend/.env.example packages/backend/.env
```

Key variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Auth token signing secret |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `CLOUDINARY_*` | Image upload credentials |
| `GOOGLE_VISION_API_KEY` | Google Cloud Vision API key |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude Haiku |

---

## AI Item Tagging

The AI tagging system analyzes item photos and suggests categories, descriptions, and price estimates using a cloud-based pipeline.

### How It Works

**Current Pipeline (Production):**
1. Organizer uploads photo via the Add Item form
2. Backend calls `cloudAIService.ts`:
   - **Primary:** Google Cloud Vision API (labels) + Claude Haiku (description/condition/price)
   - **Fallback:** Claude Haiku only (if Vision API fails)
   - **Last resort:** Manual entry with "AI unavailable" message

Organizers review all AI suggestions before applying them — nothing is pre-filled silently.

### Setup

Ensure these env vars are set in `packages/backend/.env`:

```
GOOGLE_VISION_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
```

Get keys from:
- **Google Vision API:** console.cloud.google.com → APIs → Vision API → Credentials → Create API Key
- **Anthropic:** console.anthropic.com → API Keys → Create key

### Re-analyzing Existing Items

Organizers can re-run AI tagging on an existing item from the Edit Item page. A "✨ AI suggest" link appears next to the Category field when the item has at least one photo URL.

Clicking it calls `POST /api/items/:id/analyze`, which downloads the first photo and runs it through the cloud AI pipeline.

---

## Database

Native Windows PostgreSQL (port 5432). Connection string in `packages/database/.env`.

```powershell
# Apply pending migrations
cd packages/database
npx prisma migrate deploy

# Create a new migration (dev only)
npx prisma migrate dev --name describe_your_change

# Open Prisma Studio
pnpm --filter database db:studio

# Regenerate Prisma client after schema changes
pnpm --filter database db:generate
```

⚠️ Never run `prisma db push` in production. Never run `prisma migrate reset` against Neon.
The production DB (Neon) requires `prisma migrate deploy` only — runs automatically on Railway deploy.

---

## Running Tests

```bash
# Backend tests
pnpm --filter backend test

# Frontend tests
pnpm --filter frontend test
```

---

## Deployment

Frontend: Vercel (`finda.sale`). Backend: Railway. See `claude_docs/SECURITY.md` §8 for deploy checklist and `claude_docs/RECOVERY.md` for troubleshooting.
