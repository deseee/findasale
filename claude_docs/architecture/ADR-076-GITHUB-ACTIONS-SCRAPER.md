# ADR-076: GitHub Actions Scraper Runner — Free IP Rotation for EstateSalesNet

**Status:** PLANNED — S615  
**Decision:** Move EstateSalesNet (Puppeteer) scraper from Railway cron to GitHub Actions cron for free IP rotation.  
**Rationale:** Railway uses datacenter IPs that are easily fingerprinted as bots. GitHub Actions runs on Microsoft Azure IPs from a large rotating pool — less likely to be blocklisted. Moves Puppeteer's memory load off Railway as a bonus.

---

## Problem

EstateSalesNet is the highest-value scrape source. It uses Puppeteer (headless Chrome), which is memory-intensive on Railway and runs from a static datacenter IP. As scraping volume increases, EstateSalesNet will eventually rate-limit or block Railway's IP. Once blocked, all EstateSalesNet data stops until we change IPs (requires Railway redeployment or paid proxy).

## Solution

Split the architecture: GitHub Actions runs the EstateSalesNet scraper, POSTs results to a protected Railway endpoint. Railway handles storage and business logic only.

```
GitHub Actions (Azure rotating IP)
  └─ .github/workflows/scrape-estatesalesnet.yml
       └─ node scraper/run-estatesalesnet.ts
            └─ POST https://backend-production-153c9.up.railway.app/api/internal/scraper/ingest
                 └─ Railway: ingestScrapedListing() × N
```

---

## Implementation Plan (S615)

### Step 1 — New Railway endpoint: `POST /api/internal/scraper/ingest`

**File:** `packages/backend/src/controllers/internalScraperController.ts` (NEW)

```typescript
import { Request, Response } from 'express';
import { ingestScrapedListing, ScrapedItem } from '../services/scraper/index';

export const ingestFromGitHubActions = async (req: Request, res: Response) => {
  const key = req.headers['x-scraper-key'];
  if (key !== process.env.INTERNAL_SCRAPER_KEY) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const items: ScrapedItem[] = req.body.items;
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ message: 'No items provided' });
    return;
  }

  const organizerId = req.body.organizerId;
  const stats = { created: 0, updated: 0, skipped: 0, failed: 0 };

  for (const item of items) {
    const result = await ingestScrapedListing(item, organizerId);
    if (result.status === 'created') stats.created++;
    else if (result.status === 'updated') stats.updated++;
    else if (result.status === 'skipped') stats.skipped++;
    else stats.failed++;
  }

  res.json({ stats });
};
```

Wire into `packages/backend/src/routes/internal.ts` (NEW) and mount in `index.ts`:
```typescript
app.use('/api/internal', internalRouter);
router.post('/scraper/ingest', ingestFromGitHubActions);
```

### Step 2 — Standalone scraper runner script

**File:** `packages/backend/src/scripts/run-estatesalesnet.ts` (NEW)

This runs outside the Express server — invoked by GitHub Actions directly via `ts-node` or compiled JS.

```typescript
import { scrapeEstateSalesNet } from '../services/scraper/sources/estatesalesnet';
import { RateLimiter } from '../services/scraper/rateLimiter';

const INGEST_URL = process.env.RAILWAY_BACKEND_URL + '/api/internal/scraper/ingest';
const SCRAPER_KEY = process.env.INTERNAL_SCRAPER_KEY;
const ORGANIZER_ID = process.env.ESTATESALESNET_ORGANIZER_ID;

// Metros to scrape (same list as scraperCron.ts)
const METROS = [ /* copy from scraperCron.ts */ ];

async function main() {
  const rateLimiter = new RateLimiter();
  const allItems: ScrapedItem[] = [];

  for (const metro of METROS) {
    const items = await scrapeEstateSalesNetItems(metro, rateLimiter);
    allItems.push(...items);
  }

  // POST to Railway in batches of 25
  for (let i = 0; i < allItems.length; i += 25) {
    const batch = allItems.slice(i, i + 25);
    await fetch(INGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-scraper-key': SCRAPER_KEY },
      body: JSON.stringify({ items: batch, organizerId: ORGANIZER_ID }),
    });
  }
}

main().catch(console.error);
```

Note: `scrapeEstateSalesNet` currently calls `ingestScrapedListing` internally. We need to refactor it to return items instead of ingesting directly. The dev agent will need to add a `scrapeEstateSalesNetItems()` variant that returns `ScrapedItem[]` without calling ingest.

### Step 3 — GitHub Actions workflow

**File:** `.github/workflows/scrape-estatesalesnet.yml` (NEW)

```yaml
name: EstateSalesNet Scraper

on:
  schedule:
    - cron: '0 0 * * *'  # Midnight UTC — matches current Railway cron slot
  workflow_dispatch:       # Manual trigger for testing

jobs:
  scrape:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 8

      - name: Install backend dependencies
        run: pnpm install --filter backend

      - name: Install Chromium for Puppeteer
        run: npx puppeteer browsers install chrome

      - name: Run EstateSalesNet scraper
        env:
          RAILWAY_BACKEND_URL: ${{ secrets.RAILWAY_BACKEND_URL }}
          INTERNAL_SCRAPER_KEY: ${{ secrets.INTERNAL_SCRAPER_KEY }}
          ESTATESALESNET_ORGANIZER_ID: ${{ secrets.ESTATESALESNET_ORGANIZER_ID }}
          PUPPETEER_EXECUTABLE_PATH: /usr/bin/google-chrome-stable
        run: |
          cd packages/backend
          npx ts-node src/scripts/run-estatesalesnet.ts
```

### Step 4 — Railway: remove EstateSalesNet from scraperCron.ts

After GH Actions workflow is confirmed working, gate EstateSalesNet out of `scraperCron.ts`:

```typescript
// Gate: if GH Actions handles EstateSalesNet, skip it here
if (process.env.USE_GH_ACTIONS_ESTATESALESNET !== 'true') {
  cron.schedule('0 0 * * *', async () => { scrapeEstateSalesNet(...) });
}
```

Set `USE_GH_ACTIONS_ESTATESALESNET=true` in Railway after GH Actions is verified.

### Step 5 — GitHub Secrets to add

In GitHub repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|--------|-------|
| `RAILWAY_BACKEND_URL` | `https://backend-production-153c9.up.railway.app` |
| `INTERNAL_SCRAPER_KEY` | Generate a random 32-char string (e.g. `openssl rand -hex 16`) |
| `ESTATESALESNET_ORGANIZER_ID` | The Organizer.id used for EstateSalesNet scraped listings |

Add `INTERNAL_SCRAPER_KEY` to Railway env vars too (must match).

---

## Benefits

- **Free IP rotation:** Each GH Actions run gets a fresh Azure IP from GitHub's pool. EstateSalesNet sees a different IP daily.
- **Railway memory freed:** Puppeteer/Chrome is the biggest memory consumer on the backend. Moving it to GH Actions reduces Railway RAM usage.
- **Failure isolation:** If GH Actions scrape fails, Railway backend is unaffected. Conversely, a Railway crash doesn't kill an in-flight scrape.
- **Manual trigger:** `workflow_dispatch` lets Patrick trigger a scrape manually from GitHub UI without touching Railway.

## Risks / Notes

- GH Actions has a 6-hour job timeout and 2,000 free minutes/month (plenty for a 15-30 min daily scrape).
- Puppeteer in GH Actions requires `npx puppeteer browsers install chrome` before running.
- The refactor of `scrapeEstateSalesNet` to return items vs ingest directly is the main dev effort (~1-2 hours).
- GarageSaleFinder and Craigslist stay on Railway (fetch-based, low memory, Cloudflare Workers proxy is the right long-term solution for those).

## Estimated Dev Time

~3-4 hours total: refactor scraper + new Railway endpoint + workflow file + test.
