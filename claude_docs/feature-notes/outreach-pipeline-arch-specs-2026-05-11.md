# Outreach Pipeline — Architecture Specs
**Date:** 2026-05-11
**Author:** Systems Architect
**Source research:** `claude_docs/research/innovation-scraper-throughput-2026-05-08.md`
**Status:** Ready for Dev Dispatch

---

## ADR — Parallel Matrix Strategy for Scraper Throughput — 2026-05-11

### Decision
Split the 301-metro HERE/Foursquare scraper run into 6 parallel GitHub Actions matrix shards. Each shard handles ~50 metros. This replaces the current sequential single-job design that dies at ~8% coverage per run.

### Rationale
The existing scrape-here-places.yml already has the matrix scaffold (`batch_index: [0,1,2,3,4,5]`, `fail-fast: false`). The underlying run-here-places.ts script reads `SCRAPER_BATCH_INDEX` and `SCRAPER_BATCH_COUNT` from env. The architecture is already in place — the spec below formalizes rate-limiter coordination and monitoring that are missing.

---

## (a) Parallel Matrix Strategy — Full Spec

### Shard Boundary Assignment

301 metros split across 6 shards using `Math.floor(index / batchCount) === batchIndex` slice logic in the scraper script. This is offset-based, not named-list-based — adding metros to the list auto-distributes across shards without config changes.

| Shard (batch_index) | Metro range (approx) | Max metros | Time budget |
|---------------------|---------------------|------------|-------------|
| 0 | metros 0–50 | 51 | ≤10 min |
| 1 | metros 51–100 | 50 | ≤10 min |
| 2 | metros 101–150 | 50 | ≤10 min |
| 3 | metros 151–200 | 50 | ≤10 min |
| 4 | metros 201–250 | 50 | ≤10 min |
| 5 | metros 251–300 | 50 | ≤10 min |

Each metro runs 23 queries (one per category keyword). Per-shard: 51 × 23 = 1,173 API calls. Max per-shard wall time: ~10 min at 1 call/sec with overhead. Well inside 60-minute timeout.

### Rate-Limiter Coordination

**Problem:** 6 shards firing simultaneously against HERE/Foursquare would peak at ~138 concurrent calls. HERE's free tier is 250K calls/month (fine for 6,923/run) but uses a per-second sliding window that can throttle burst.

**Solution: Job-level stagger via `sleep`**

Each shard sleeps `batchIndex × 90` seconds before starting its scrape loop. This serializes the first 9 minutes of startup — by the time shard 5 begins, shards 0–1 are already mid-scrape with API calls spread across time.

```yaml
- name: Run HERE Places scraper batch ${{ matrix.batch_index }}
  run: |
    sleep $(( ${{ matrix.batch_index }} * 90 ))
    cd packages/backend
    ./node_modules/.bin/ts-node src/scripts/run-here-places.ts
```

**Within-shard call pacing (already in scraper script):**
- Each metro query: 1 API call → await response → write to DB → next query
- No explicit sleep needed between calls; DB write latency (~200ms) provides natural pacing
- If HERE returns 429: exponential backoff starting at 2s, max 3 retries, then skip metro and log

**Backoff logic (to add to run-here-places.ts):**
```typescript
async function hereQueryWithBackoff(url: string, attempt = 0): Promise<any> {
  const res = await fetch(url, { headers: { 'apiKey': process.env.HERE_API_KEY! } });
  if (res.status === 429 && attempt < 3) {
    const delay = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s
    await new Promise(r => setTimeout(r, delay));
    return hereQueryWithBackoff(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HERE API error ${res.status} for ${url}`);
  return res.json();
}
```

Same pattern applies to the Foursquare scraper (scrape-foursquare.yml).

### GitHub Actions Matrix YAML Structure

The canonical pattern (already live in scrape-here-places.yml, replicated here for reference):

```yaml
name: Scrape HERE Places

on:
  schedule:
    - cron: '0 4 2 * *'   # 2nd of month, 04:00 UTC
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}
  cancel-in-progress: false  # never cancel an in-flight batch

jobs:
  scrape:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    strategy:
      matrix:
        batch_index: [0, 1, 2, 3, 4, 5]
      fail-fast: false        # shard N failure must not cancel shards N+1..5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: pnpm/action-setup@v3
        with:
          version: 8
      - run: pnpm install --filter backend --filter database
      - run: cd packages/database && npx prisma generate
        env:
          DATABASE_URL: "postgresql://dummy:dummy@localhost:5432/dummy"

      - name: Run scraper batch ${{ matrix.batch_index }}
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          HERE_API_KEY: ${{ secrets.HERE_API_KEY }}
          INTERNAL_SCRAPER_KEY: ${{ secrets.INTERNAL_SCRAPER_KEY }}
          RAILWAY_BACKEND_URL: ${{ secrets.RAILWAY_BACKEND_URL }}
          SCRAPER_BATCH_INDEX: ${{ matrix.batch_index }}
          SCRAPER_BATCH_COUNT: 6
          SCRAPER_QUEUE_LIMIT: 50
        run: |
          sleep $(( ${{ matrix.batch_index }} * 90 ))
          cd packages/backend
          ./node_modules/.bin/ts-node src/scripts/run-here-places.ts
```

Key rules:
- `fail-fast: false` is mandatory — one shard hitting a rate limit must not abort the other 5
- `cancel-in-progress: false` on concurrency group — never cancel a running monthly batch for a new dispatch
- `SCRAPER_BATCH_COUNT: 6` is the divisor — change only if adding shards
- `SCRAPER_QUEUE_LIMIT: 50` caps metros per shard — raise to 60 if metro list grows past 360

### Monitoring and Alerting for Per-Shard Job Failures

**GitHub Actions native:** Each shard appears as a separate job in the Actions UI run view, labeled by `batch_index`. A failed shard shows red inline — no additional config needed for visual detection.

**Alerting configuration (add to workflow):**

```yaml
      - name: Notify on shard failure
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `[Scraper] HERE shard ${{ matrix.batch_index }} failed — ${new Date().toISOString().slice(0,10)}`,
              labels: ['scraper-failure', 'auto-generated'],
              body: `Shard ${{ matrix.batch_index }} (metros ${${{ matrix.batch_index }} * 50}–${(${{ matrix.batch_index }} + 1) * 50}) failed in run ${{ github.run_id }}.\n\nCheck logs: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}`
            })
```

This auto-creates a GitHub Issue per shard failure with the run link. Patrick sees it in the repo Issues tab.

**Log scraping:** The scraper script already logs `[HERE] Shard N complete: X inserted, Y skipped, Z failed`. Railway does not need to be involved — logs are in GitHub Actions console per shard.

**Monthly coverage check:** After each matrix run, a summary step can emit total-metros-processed:

```yaml
  summary:
    needs: scrape
    runs-on: ubuntu-latest
    if: always()
    steps:
      - run: echo "Matrix run complete. Check individual shard logs for coverage counts."
```

---

## (b) Source Tracking Backfill Architecture

### Decision
Hybrid approach: forward-fix all scrapers immediately (100% accurate new data), then run a conservative backfill that only updates records where confidence exceeds 0.8. Records below threshold stay NULL — they are never inferred with low confidence.

### Schema Contract (already exists, no migration needed)

```
Organizer.directoryMostRecentSource  String?  -- "HERE" | "Foursquare" | "ESN" | "OSM" | etc.
Organizer.sourcesJson                Json?    -- see structure below
Organizer.corroborationScore         Decimal  -- 0.00–1.00, already indexed
Organizer.sourceCount                Int      -- already populated by deduplication
```

### sourcesJson Schema

```typescript
type SourceRecord = {
  source: 'HERE' | 'Foursquare' | 'ESN' | 'OSM' | 'EstateSalesNet' | 'GarageSaleFinder'
         | 'AuctionZip' | 'AuctionNinja' | 'SaleSeeker' | 'NAA' | 'Eventbrite' | 'IndianaLicensing'
         | '[State]Licensing';
  confidence: number;       // 0.0–1.0 — how certain this inference is
  inferred: boolean;        // true = backfill inference; false = direct scraper write
  firstSeenAt: string;      // ISO 8601
  lastSeenAt: string;       // ISO 8601
};

// sourcesJson field value:
type SourcesJson = SourceRecord[];
```

**Admin dashboard display rule:**
- `inferred: false` → show source name, no qualifier
- `inferred: true, confidence >= 0.9` → show source name + "(inferred)"
- `inferred: true, confidence < 0.9` → show "Multi-source" or "Unknown"
- `sourcesJson = null` → show "Source unknown"

### High-Confidence Pattern Library

Patterns are evaluated in priority order. First match that clears the confidence threshold wins.

| Signal | Source Assigned | Confidence | Rationale |
|--------|----------------|------------|-----------|
| `esnOrgId IS NOT NULL` | ESN | 0.99 | ESN ID only comes from ESN scraper |
| `hereBusinessId IS NOT NULL` | HERE | 0.98 | HERE ID is unique to HERE API |
| `foursquareVenueId IS NOT NULL` | Foursquare | 0.98 | Foursquare ID is unique |
| `osmNodeId IS NOT NULL` | OSM | 0.97 | OSM node ID is unique |
| `isStateLicensed = true` + `licenseState IS NOT NULL` | `[State]Licensing` | 0.96 | Only licensing scrapers set this |
| `sourceCount >= 3` + `corroborationScore >= 0.8` | Multi-source | 0.85 | 3+ corroborated = likely major directory |
| phone format matches HERE normalization (`+1XXXXXXXXXX`) + website present | HERE | 0.82 | HERE normalizes phones to E.164 |

**Threshold gate:** Only write backfill if computed confidence >= 0.8. Below 0.8, leave NULL.

### Backfill Query and Batch Logic

**File:** `packages/backend/src/scripts/backfill-source-tracking.ts`
**Trigger:** One-time manual run via `ts-node`. Can be re-run safely (idempotent — only updates NULL records).

```typescript
const BATCH_SIZE = 200;

async function backfillSourceTracking(): Promise<void> {
  let cursor: string | undefined = undefined;
  let total = 0;
  let updated = 0;

  do {
    const batch = await prisma.organizer.findMany({
      where: {
        directoryMostRecentSource: null,  // only backfill NULL records
      },
      select: {
        id: true,
        esnOrgId: true,
        hereBusinessId: true,
        foursquareVenueId: true,
        osmNodeId: true,
        isStateLicensed: true,
        licenseState: true,
        sourceCount: true,
        corroborationScore: true,
        phone: true,
        website: true,
        sourcesJson: true,
      },
      take: BATCH_SIZE,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { id: 'asc' },
    });

    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    total += batch.length;

    for (const org of batch) {
      const result = inferSource(org);
      if (result && result.confidence >= 0.8) {
        await prisma.organizer.update({
          where: { id: org.id },
          data: {
            directoryMostRecentSource: result.source,
            sourcesJson: [
              {
                source: result.source,
                confidence: result.confidence,
                inferred: true,
                firstSeenAt: new Date().toISOString(),
                lastSeenAt: new Date().toISOString(),
              }
            ],
          },
        });
        updated++;
      }
    }

    console.log(`[Backfill] Processed ${total} records, updated ${updated}`);
  } while (true);

  console.log(`[Backfill] Complete: ${updated} of ${total} records updated`);
}
```

**inferSource()** evaluates the pattern library in priority order, returns `{ source, confidence }` or `null`.

**Estimated coverage:** ~30–40% of 7,897 records will clear the 0.8 threshold based on unique ID presence (esnOrgId, hereBusinessId, foursquareVenueId, osmNodeId). Records with none of the unique IDs require corroboration-only inference and are likely to fall below threshold — left as NULL.

### Admin Dashboard Display Logic

- Query: `WHERE directoryMostRecentSource IS NOT NULL` → show count as "Source Known"
- Query: `WHERE directoryMostRecentSource IS NULL` → show count as "Source Unknown"
- Per-organizer view: render `sourcesJson` as badge list; append "(inferred)" if `inferred: true`
- Sort option: `ORDER BY corroborationScore DESC` surfaces highest-confidence records first

---

## (c) HOT Score Recalibration + Licensing Integration

### Decision
Do NOT lower the HOT threshold. Wire Indiana scraper output to `isStateLicensed` immediately. Use the existing 25-pt licensing signal to generate real HOT leads. ESN membership scoring is Phase 2 (June).

### Schema — Already Exists (no migration needed)

```
Organizer.isStateLicensed  Boolean?
Organizer.licenseState     String?
Organizer.licenseNumber    String?
Organizer.leadScore        Int?
Organizer.leadTier         String?   -- "COLD" | "WARM" | "HOT" | "ENTERPRISE"
Organizer.lastScoredAt     DateTime?
```

### isStateLicensed Field Wiring — Indiana Scraper

**File:** `packages/backend/src/scripts/scrape-indiana-licensing.ts` (already exists per workflow)

The scraper already writes to the DB. The wiring task is to ensure it explicitly sets `isStateLicensed = true` when a match is found. Spec for the upsert:

```typescript
// After matching an organizer record to an Indiana license:
await prisma.organizer.update({
  where: { id: matchedOrganizerId },
  data: {
    isStateLicensed: true,
    licenseState: 'IN',
    licenseNumber: licenseRecord.licenseNumber,
    directoryMostRecentSource: 'IndianaLicensing',
    directoryMostRecentAt: new Date(),
  },
});
```

**Matching strategy:** Name fuzzy match (Levenshtein distance ≤ 2) within same city/state. If match confidence < 80%, do not write — log the candidate for manual review.

### Template for Future State Scrapers

Each new state licensing scraper follows this contract:

```typescript
interface StateLicenseRecord {
  licenseeName: string;
  licenseNumber: string;
  licenseType: string;           // "Auctioneer" | "EstateAdministrator" | etc.
  state: string;                 // 2-letter abbreviation
  expirationDate?: string;
  address?: string;
  city?: string;
}

// Required output from every state licensing scraper:
interface LicensingScraperResult {
  matched: number;               // organizer records updated
  notMatched: number;            // licenses with no matching organizer
  lowConfidence: number;         // name match below 80%, skipped
}
```

State scrapers write to `isStateLicensed`, `licenseState`, `licenseNumber` only. They do not touch `leadScore` or `leadTier` — the scoring engine recalculates those on its weekly pass.

### Scoring Weights (Current — Preserved as-is)

No threshold change. Current structure documented for reference:

| Signal | Points | Status |
|--------|--------|--------|
| contactEmail present | 25 | Active |
| isStateLicensed = true | 25 | Active (now populated by scrapers) |
| corroborationScore >= 0.8 | 20 | Active |
| hasPhysicalOffice = true | 15 | Active |
| reviewCount >= 5 | 10 (capped) | Active (Google Places gone — only ESN data) |
| **Total possible** | **95** | — |
| HOT threshold | **70** | Unchanged |

With licensing (25 pts) + contact email (25 pts) + corroboration (20 pts) = 70 pts. HOT is achievable for licensed organizers who have a contact email and 3+ corroboration sources. This is the correct bar.

### Phase 2 — ESN Membership Signals (June Roadmap, not current dispatch)

When ESN enrichment matures, add:
- `esnOrgId IS NOT NULL` → +15 pts (proxy: ESN vets members, active operator)
- `esnPackageType = 'PREMIUM'` → additional +5 pts

Schema already has `esnOrgId` and `esnPackageType`. No migration needed for Phase 2 — just scoring engine update.

### Indiana Licensing Backfill Job

One-time script to mark existing organizers who match Indiana license records as `isStateLicensed = true`.

**File:** `packages/backend/src/scripts/backfill-indiana-licensing.ts`

Logic:
1. Load all Indiana license records from the licensing API/CSV
2. For each record: query `prisma.organizer.findMany` where `licenseState = 'IN'` OR city/state match
3. Fuzzy-match business name (Levenshtein ≤ 2)
4. If match confidence >= 80%: upsert `isStateLicensed = true`, `licenseNumber`, `licenseState = 'IN'`
5. After all records processed: trigger leadScoring recalculation for updated organizers
6. Log: matched count, skipped count, projected new HOT tier count

**Projection:** Indiana has ~200–400 registered estate sale auctioneers. Match rate against 7,897 org pool: expect 150–300 matches at 80%+ confidence. Each match that also has contactEmail + corroboration ≥ 0.8 will reach HOT (70 pts).

**18-state projection (end state):** ~1,200–2,000 matches across 18 states. At current HOT threshold: ~800–1,400 orgs in HOT tier from licensing alone.

---

## (d) emailDiscoveryService.ts Architecture

### Decision
Build as an async step inside `enrichment.ts`. Triggered post-corroboration when `corroborationScore > 0.7` and `contactEmail IS NULL`. Fire-and-forget — enrichment does not wait for result. Playwright stealth handles anti-bot. SMTP RCPT-TO verifies without sending mail.

### File Location

`packages/backend/src/services/emailDiscoveryService.ts`

No new packages required except `playwright` (already used in scraper scripts) and `net` (Node built-in for SMTP).

### Playwright Stealth Browser Init

```typescript
import { chromium } from 'playwright';

async function createStealthBrowser() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const context = await browser.newContext({
    userAgent: getRandomUserAgent(),  // reuse existing userAgents.ts utility
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'America/Chicago',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': getRandomReferer(),  // reuse existing utility
    },
    // Disable webdriver detection
    javaScriptEnabled: true,
  });

  // Remove automation fingerprints
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  return { browser, context };
}
```

**Timeout config:** 8 seconds per page navigation. If page doesn't load in 8s, move to next URL. Total Playwright budget per organizer: 30 seconds max (browser init + 4 URL attempts).

### Contact Page Crawl Strategy

Crawl URLs in this priority order. Stop on first email found.

```typescript
const CONTACT_URL_PATTERNS = [
  '/contact',
  '/contact-us',
  '/about',
  '/about-us',
  '/team',
  '/staff',
  '/our-team',
  '/meet-the-team',
  '/reach-us',
];

async function crawlWebsiteForEmail(websiteUrl: string): Promise<string | null> {
  const { browser, context } = await createStealthBrowser();
  const baseUrl = new URL(websiteUrl).origin;

  try {
    for (const path of CONTACT_URL_PATTERNS) {
      try {
        const page = await context.newPage();
        await page.goto(`${baseUrl}${path}`, { timeout: 8000, waitUntil: 'domcontentloaded' });

        // Extract visible text (not source — avoids encoded obfuscation)
        const text = await page.evaluate(() => document.body.innerText);
        const emails = extractEmailsFromText(text);

        // Also check mailto: links
        const mailtoLinks = await page.$$eval(
          'a[href^="mailto:"]',
          (links) => links.map(l => l.getAttribute('href')?.replace('mailto:', '').split('?')[0])
        );

        await page.close();
        const allEmails = [...emails, ...(mailtoLinks.filter(Boolean) as string[])];
        const valid = allEmails.find(e => isValidBusinessEmail(e));
        if (valid) return valid;
      } catch {
        // Page not found or timeout — continue to next URL
      }
    }
    return null;
  } finally {
    await browser.close();
  }
}
```

**isValidBusinessEmail filter:** Reject gmail.com, yahoo.com, hotmail.com, outlook.com, aol.com — estate sale organizers should have business emails. If only a personal email is found, still return it but set `emailDiscoveryMethod = 'website_scrape'` and `emailDiscoveryConfidence = 0.6` (lower confidence).

### Email Pattern Permutation — Ordered by Estate Sale Organizer Bias

Generated from `organizerName` (business name, not personal name) and website domain.

```typescript
function generateEmailPermutations(businessName: string, domain: string): string[] {
  // Extract first word of business name as abbreviated prefix
  const slug = businessName.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)[0]  // first word: "heritage" from "Heritage Estate Sales"
    .slice(0, 12);    // cap at 12 chars

  // Ordered: highest deliverability patterns for estate sale businesses first
  return [
    `info@${domain}`,          // most common for small businesses
    `contact@${domain}`,
    `sales@${domain}`,
    `hello@${domain}`,
    `mail@${domain}`,
    `${slug}@${domain}`,       // businessname@domain
    `admin@${domain}`,
    `office@${domain}`,
    `estates@${domain}`,
    `auction@${domain}`,
    `consignment@${domain}`,
    `service@${domain}`,
    `inquiries@${domain}`,
    `support@${domain}`,
  ];
}
```

**Pattern selection rationale:** `info@` and `contact@` are dominant for service businesses. Estate sale-specific patterns (`estates@`, `auction@`) are deprioritized — businesses rarely use the category name as their inbox prefix. Personal name patterns (first.last@) are excluded because organizer records have business names, not personal names reliably.

### SMTP RCPT-TO Verification Flow

No email is sent. Flow: DNS MX lookup → TCP connection → MAIL FROM → RCPT TO → immediate QUIT.

```typescript
import * as net from 'net';
import * as dns from 'dns/promises';

async function verifyEmailViaSMTP(email: string): Promise<boolean> {
  const [, domain] = email.split('@');

  // Step 1: DNS MX lookup
  let mxRecords: dns.MxRecord[];
  try {
    mxRecords = await dns.resolveMx(domain);
    mxRecords.sort((a, b) => a.priority - b.priority);
  } catch {
    return false;  // domain has no MX — undeliverable
  }

  const mxHost = mxRecords[0].exchange;

  // Step 2: TCP + SMTP handshake
  return new Promise((resolve) => {
    const socket = net.createConnection(25, mxHost);
    let stage: 'connect' | 'ehlo' | 'mailfrom' | 'rcptto' | 'done' = 'connect';
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) { resolved = true; socket.destroy(); resolve(false); }
    }, 10000);

    socket.on('data', (data) => {
      const line = data.toString();

      if (stage === 'connect' && line.startsWith('220')) {
        socket.write(`EHLO findasale-verify.finda.sale\r\n`);
        stage = 'ehlo';
      } else if (stage === 'ehlo' && line.includes('250')) {
        socket.write(`MAIL FROM:<verify@outreach.finda.sale>\r\n`);
        stage = 'mailfrom';
      } else if (stage === 'mailfrom' && line.startsWith('250')) {
        socket.write(`RCPT TO:<${email}>\r\n`);
        stage = 'rcptto';
      } else if (stage === 'rcptto') {
        socket.write('QUIT\r\n');
        stage = 'done';
        clearTimeout(timeout);
        resolved = true;
        socket.destroy();
        // 250 = exists, 251 = forwarded (accept), 550/551 = does not exist
        resolve(line.startsWith('250') || line.startsWith('251'));
      }
    });

    socket.on('error', () => { if (!resolved) { resolved = true; resolve(false); } });
  });
}
```

**Rate limiting:** Many mail servers block rapid RCPT-TO probing. Cap at 3 permutations verified per organizer per run. If the first verified pattern is found, stop immediately. Do not exhaustively probe all 14 patterns via SMTP — use permutation list only to generate candidates, then verify top 3.

**Greylisting / port 25 blocks:** GitHub Actions runners have port 25 blocked. SMTP verification must run from Railway backend, not from GitHub Actions. This service is called from the backend enrichment cron, not a GH Actions script.

### Async Integration into enrichment.ts

```typescript
// In enrichment.ts — add after corroboration scoring, before return

// Step N: Email discovery (async, fire-and-forget)
if (
  organizer.corroborationScore !== undefined &&
  Number(organizer.corroborationScore) > 0.7 &&
  !organizer.contactEmail &&
  organizer.website
) {
  // Do not await — enrichment continues immediately
  discoverAndSaveEmail(organizerId, organizer.website, organizer.businessName || '')
    .catch(err => console.error(`[Enrichment:EmailDiscovery] Failed for ${organizerId}:`, err.message));
}
```

```typescript
// discoverAndSaveEmail — writes result back to organizer record
async function discoverAndSaveEmail(
  organizerId: string,
  website: string,
  businessName: string
): Promise<void> {
  const domain = new URL(website).hostname.replace(/^www\./, '');

  // Stage 1: Website scrape
  let discoveredEmail: string | null = null;
  let method: string = 'website_scrape';
  let confidence = 0.7;

  discoveredEmail = await crawlWebsiteForEmail(website);

  // Stage 2: Pattern permutation + SMTP verification (if website scrape fails)
  if (!discoveredEmail) {
    method = 'smtp_probe';
    confidence = 0.65;
    const permutations = generateEmailPermutations(businessName, domain);

    for (const candidate of permutations.slice(0, 3)) {
      const verified = await verifyEmailViaSMTP(candidate);
      if (verified) {
        discoveredEmail = candidate;
        break;
      }
    }
  }

  if (!discoveredEmail) return;  // no email found — log nothing, not an error

  await prisma.organizer.update({
    where: { id: organizerId },
    data: {
      contactEmail: discoveredEmail,
      emailDiscoveryMethod: method,
      emailDiscoveryConfidence: confidence,
      emailDiscoveredAt: new Date(),
    },
  });

  console.log(`[EmailDiscovery] Found ${discoveredEmail} for org:${organizerId} via ${method}`);
}
```

**Error handling:** Any Playwright crash, DNS timeout, or SMTP connection error is caught and logged. The enrichment pipeline is not affected — discovery is advisory. If discovery fails, contactEmail stays NULL and enrichment continues.

**Trigger conditions:**
- `corroborationScore > 0.7` — high enough confidence the org is real
- `contactEmail IS NULL` — don't overwrite a known good email
- `website IS NOT NULL` — need a website to derive domain and crawl contact pages

**Exclusions:**
- Skip if `businessCategory IN ('GarageSaleFinder')` — consumer posts, not businesses
- Skip if `suppressOutreach = true`
- Skip if `directoryStatus = 'CLOSED'`

---

## (e) MailerLite Group/Segment Architecture

### Decision
Score-threshold-based tier progression. Three MailerLite groups (Cold, Warm, Hot) each with a 4-email sequence. Cron moves organizers between groups on tier change. MailerLite automations handle scheduling. Three additional groups for lifecycle management (Engaged, Bounced, No Response).

### Context — What's Already Built

`mailerliteService.ts` already implements `syncLeadTierToMailerLite()` which upserts a subscriber into the correct group based on `leadTier`. `outreachEmailsCron.ts` already calls `syncLeadTierGroups()` weekly (Sundays 04:00 UTC). The email templates (COLD/WARM/HOT, touch1–touch4) are already written in `outreachEmailsCron.ts`. The architecture below formalizes the MailerLite-side configuration that must match this code.

### MailerLite Group Configuration

Six groups total. Each group has a corresponding env var that must exist in Railway:

| Group Name | Env Var | Trigger | What It Does |
|------------|---------|---------|-------------|
| `Cold Outreach` | `MAILERLITE_COLD_GROUP_ID` | `leadTier = 'COLD'` | Cold 4-email sequence |
| `Warm Outreach` | `MAILERLITE_WARM_GROUP_ID` | `leadTier = 'WARM'` | Warm 4-email sequence |
| `Hot Outreach` | `MAILERLITE_HOT_GROUP_ID` | `leadTier = 'HOT'` | Hot 4-email sequence |
| `Engaged` | `MAILERLITE_ENGAGED_GROUP_ID` | Organizer signs up (claimed listing) | Onboarding sequence, suppress outreach |
| `Bounced` | `MAILERLITE_BOUNCED_GROUP_ID` | SMTP 550/551 / bounce recorded | Suppress all sends immediately |
| `No Response` | `MAILERLITE_NO_RESPONSE_GROUP_ID` | 8 weeks elapsed, touch4 sent, no open | Archive, suspend sends |

### Tier Sequences — Email Outlines (4 emails each, 8-week arc)

Templates are already written in `outreachEmailsCron.ts`. MailerLite automations replicate or extend these for sequences managed inside MailerLite itself.

**Cold Outreach Sequence (leadScore 0–39):**
| Touch | Delay | Subject theme | Goal |
|-------|-------|--------------|------|
| T1 | Immediately on group add | "You have something people want" | Awareness — explain platform |
| T2 | +3 days | "One thing we left out" | Overcome missed-email objection; free trial |
| T3 | +5 days after T2 | "Your biggest competitor" | Urgency — competitors using platform |
| T4 | +7 days after T3 | "One last thought" | Final touch; no hard sell; door open |

**Warm Outreach Sequence (leadScore 40–54):**
| Touch | Delay | Subject theme | Goal |
|-------|-------|--------------|------|
| T1 | Immediately | "We built you a free storefront" | Personalized — storefront preview link |
| T2 | +3 days | "One thing we left out" | Free trial; no-risk framing |
| T3 | +5 days | "Your biggest competitor" | Social proof; urgency |
| T4 | +7 days | "One last thought" | Final |

**Hot Outreach Sequence (leadScore >= 55, includes licensed orgs):**
| Touch | Delay | Subject theme | Goal |
|-------|-------|--------------|------|
| T1 | Immediately | "[Business Name] + FindA.Sale: Your next growth channel" | VIP framing; high-volume features |
| T2 | +3 days | "One thing we left out" | Commission-only math for high-volume ops |
| T3 | +5 days | "Your biggest competitor" | Competitors already listing; scarcity |
| T4 | +7 days | "One last thought" | Final; storefront link |

### Automation Rules for Group Movement

MailerLite automation rules configured in the MailerLite UI (not code-driven). Each rule is a simple "subscriber joins group → start automation":

1. **Subscriber joins Cold Outreach group** → Start Cold 4-email automation (delays per T1–T4 above)
2. **Subscriber joins Warm Outreach group** → Remove from Cold Outreach → Start Warm 4-email automation
3. **Subscriber joins Hot Outreach group** → Remove from Cold/Warm → Start Hot 4-email automation
4. **Subscriber joins Engaged group** → Remove from all outreach groups → Stop all active automations → Start Engaged onboarding sequence
5. **Subscriber joins Bounced group** → Remove from all groups → Suppress → Cancel all active automations
6. **Subscriber joins No Response group** → Remove from all outreach groups → Cancel automations → Mark `status = 'No Response'`

**Rule priority:** Engaged and Bounced always win over tier groups. If a COLD-sequenced org claims their listing, they move to Engaged immediately — Cold sequence stops.

### Suspend/Suppress Logic

**Bounced:**
- Trigger: `outreachEmailsCron.ts` receives bounce signal from Gmail API (status 550, 551) OR `suppressionService.isSuppressed()` returns true
- Action: Call `moveSubscriberToGroup(email, MAILERLITE_BOUNCED_GROUP_ID)` — this removes them from all other groups via MailerLite's remove-from-other-groups automation
- Effect: MailerLite will not send to bounced subscribers regardless of group membership (MailerLite built-in bounce suppression)
- DB write: `suppressOutreach = true` on Organizer record (already handled by suppressionService)

**No Response:**
- Trigger: `touch4SentAt IS NOT NULL` + `touch4SentAt` > 8 weeks ago + no open/click recorded
- Detection: `outreachEmailsCron.ts` `determineTouchToSend()` returns null (all 4 touches sent)
- Action: DB status set to `'COMPLETED'` on DirectoryClaimEmail record; MailerLite group move via `syncLeadTierToMailerLite`-style call
- Add `moveSubscriberToNoResponse()` function to `mailerliteService.ts`

**No Response group — suspend logic:**
- Suppress for 6 months (no sends)
- After 6 months: move back to COLD group if `leadScore` has increased (re-score signal)
- If `leadScore` unchanged after 6 months: archive permanently

### API Integration Spec — Cron to MailerLite Group Move

The cron's `syncLeadTierGroups()` already calls `syncLeadTierToMailerLite()`. The following additions are needed:

**moveSubscriberToGroup() — general group move function (add to mailerliteService.ts):**

```typescript
export async function moveSubscriberToGroup(
  email: string,
  targetGroupId: string,
  removeFromGroupIds?: string[]
): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey || !email) return;

  // Step 1: Upsert subscriber into target group
  await fetch(`${MAILERLITE_API_URL}/subscribers`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ email, groups: [targetGroupId] }),
  });

  // Step 2: Remove from source groups (if specified)
  if (removeFromGroupIds?.length) {
    // MailerLite v2: remove subscriber from group via DELETE
    // GET subscriber by email first to get subscriber ID
    const subResponse = await fetch(
      `${MAILERLITE_API_URL}/subscribers?filter[email]=${encodeURIComponent(email)}`,
      { headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' } }
    );
    if (subResponse.ok) {
      const { data } = await subResponse.json();
      const subscriberId = data?.[0]?.id;
      if (subscriberId) {
        for (const groupId of removeFromGroupIds) {
          await fetch(`${MAILERLITE_API_URL}/subscribers/${subscriberId}/groups/${groupId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
          });
        }
      }
    }
  }
}
```

**Cron integration for No Response:**
Add to `sendOutreachEmails()` loop — after sending touch4, check if all 4 touches sent and move to No Response group:

```typescript
// After touch4 is confirmed sent:
if (touchNum === 4) {
  await moveSubscriberToGroup(
    record.emailAddress,
    process.env.MAILERLITE_NO_RESPONSE_GROUP_ID!,
    [
      process.env.MAILERLITE_COLD_GROUP_ID,
      process.env.MAILERLITE_WARM_GROUP_ID,
      process.env.MAILERLITE_HOT_GROUP_ID,
    ].filter(Boolean) as string[]
  );
}
```

**Required Railway env vars (additions to existing set):**
```
MAILERLITE_ENGAGED_GROUP_ID=<id from MailerLite dashboard>
MAILERLITE_BOUNCED_GROUP_ID=<id from MailerLite dashboard>
MAILERLITE_NO_RESPONSE_GROUP_ID=<id from MailerLite dashboard>
```

(COLD, WARM, HOT group IDs already set per existing mailerliteService.ts env var contract.)

---

## Rollback Notes

No schema migrations in this spec — all five deliverables use existing schema fields. Rollback risk is limited to:

- **(a) Matrix YAML change:** Revert to single-job `scrape:` definition in the YAML. Zero DB impact.
- **(b) Backfill script:** Idempotent. If confidence thresholds are wrong, re-run with adjusted thresholds. Existing NULL records are unchanged by a re-run (only updates fields that are still NULL).
- **(c) Licensing wiring:** `isStateLicensed` and `licenseNumber` writes are additive. Rollback = set `isStateLicensed = null` for mismatched records via admin tool.
- **(d) emailDiscoveryService:** Fire-and-forget. If discovery writes bad emails, `contactEmail` can be cleared. No outreach fires from `contactEmail` directly — outreach uses `DirectoryClaimEmail.emailAddress`.
- **(e) MailerLite group moves:** Reversible in MailerLite dashboard. Worst case: move subscribers back to previous group manually.

---

## Dev Dispatch Sequence

**Week 1 (parallel):**
- Dev A: (a) Confirm matrix YAML already correct; add backoff logic to run-here-places.ts and run-foursquare.ts; add shard-failure GitHub Issue creation step
- Dev B: (b) Forward-fix all scrapers to write `directoryMostRecentSource` on every insert/upsert

**Week 2:**
- Dev A: (c) Wire Indiana scraper isStateLicensed output; write backfill-indiana-licensing.ts
- Dev B: (b) Write backfill-source-tracking.ts and run against staging DB

**Week 3–4:**
- Dev A: (d) Build emailDiscoveryService.ts (Playwright + SMTP); integrate into enrichment.ts
- Dev B: (e) Add moveSubscriberToGroup() to mailerliteService.ts; add No Response group move to cron; add 3 new env vars to Railway

**TS check gate (required before returning any dev output):**
```bash
cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
cd packages/backend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
```

---

*Architect Handoff Complete — 2026-05-11*
