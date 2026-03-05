# FindA.Sale — Development Guide

## Prerequisites

- Node.js 18+
- pnpm 8+
- Docker + Docker Compose
- PostgreSQL (via Docker — see docker-compose.yml)

## Quick Start

```bash
# Install all workspace dependencies
pnpm install

# Start all services (backend, frontend, image-tagger)
docker-compose up -d

# Run frontend dev server
pnpm --filter frontend dev

# Run backend dev server
pnpm --filter backend dev
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
| `TAGGER_URL` | Image tagger service URL |
| `TAGGER_API_KEY` | Shared secret for tagger auth |

---

## Image Tagger Service

The AI image tagger is a FastAPI microservice that analyzes item photos and suggests estate-sale categories.

### Starting the Tagger

```bash
# Start via docker-compose (recommended)
docker-compose up -d image-tagger

# Check it's running
curl http://localhost:5001/health
# → {"status": "ok", "timestamp": "..."}

# View model info
curl http://localhost:5001/info
```

### First-Time Setup

The tagger image must be built before first use (model weights are downloaded at build time):

```bash
docker-compose build image-tagger
docker-compose up -d image-tagger
```

If you update `requirements.txt`, always rebuild — `docker-compose restart` does not apply dependency changes.

### Manual Testing

Tag a single image via curl:

```bash
curl -X POST http://localhost:5001/api/tag \
  -H "X-API-Key: change-this-in-production" \
  -F "image=@/path/to/photo.jpg" \
  -F "threshold=0.35"
```

Expected response:
```json
{
  "filename": "photo.jpg",
  "tags": [
    {"tag": "furniture: sofa", "confidence": 0.87},
    {"tag": "furniture: couch", "confidence": 0.72}
  ],
  "count": 2
}
```

### Re-analyzing Existing Items

Organizers can re-run AI tagging on an existing item from the Edit Item page. A "✨ AI suggest" link appears next to the Category field when:
- The item has at least one photo URL
- No category is currently set

Clicking it calls `POST /api/items/:id/analyze`, which downloads the first photo and runs it through the tagger.

### Running Tagger Tests

```bash
cd packages/backend/services/image-tagger

pip install -r requirements-dev.txt --break-system-packages

# All tests
python -m pytest tests/ -v

# Unit tests only (no ML dependencies needed)
python -m pytest tests/test_tagger_simple.py -v

# Integration tests only
python -m pytest tests/test_app_simple.py -v
```

### Tagger Documentation

Full documentation is in `packages/backend/services/image-tagger/docs/`:

- `TAGGER_DESIGN.md` — Architecture, model choice, category taxonomy
- `TAGGER_BENCHMARKS.md` — Performance targets and benchmark script
- `TAGGER_ACCURACY.md` — Accuracy methodology, expected metrics, decision gate
- `TAGGER_TROUBLESHOOTING.md` — Common errors and fixes

---

## Database

```bash
# Apply migrations
pnpm --filter database db:migrate

# Open Prisma Studio
pnpm --filter database db:studio

# Generate Prisma client after schema changes
pnpm --filter database db:generate
```

---

## Running Tests

```bash
# Backend tests
pnpm --filter backend test

# Frontend tests
pnpm --filter frontend test

# Tagger tests (Python)
cd packages/backend/services/image-tagger
python -m pytest tests/ -v
```

---

## Deployment

Frontend: Vercel (`finda.sale`). Backend: Railway. See `claude_docs/SECURITY.md` §8 for deploy checklist and `claude_docs/RECOVERY.md` for troubleshooting.
