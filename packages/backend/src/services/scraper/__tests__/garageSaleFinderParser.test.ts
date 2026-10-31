/**
 * GarageSaleFinder detail parser + per-metro breaker (2026-10-30).
 * From the 10-28 run every detail page fetched 2xx but none parsed (schema.org microdata
 * gone), and one shared domain breaker row blanked the rest of each day's harvest.
 */

jest.mock('@sentry/node', () => ({ captureMessage: jest.fn() }));

import {
  parseGarageSalesFinderListing,
  parseGarageSalesFinderListingWithReason,
  gsfDatesFromText,
} from '../htmlParser';

const OLD_MICRODATA = `<html><head><title>x</title></head><body>
<h2 itemprop="name">Big Yard Sale</h2>
<div itemprop="address">12 Main St, Paw Paw, MI 49079</div>
<meta itemprop="startDate" content="2026-10-31"><meta itemprop="endDate" content="2026-11-01">
<img itemprop="image" src="https://img.example/1.jpg">
<div itemprop="description" class="description">Tools and toys</div>
</body></html>`;

// Shape confirmed on the live page 2026-10-30 (no microdata).
const NEW_NO_MICRODATA = `<html><head>
<title>58 Hyland Ave, East Greenwich, RI 02818 | 21811163 | GarageSaleFinder.com</title>
<meta property="og:title" content="EAST GREENWICH Estate Sale by Estate Sales of New England">
<meta property="og:description" content="Come browse this East Greenwich home featuring...">
<meta property="og:image" content="https://img.example/og.jpg">
</head><body>
<div>The Internet's Largest Garage Sale Network 2M+ Monthly Shoppers</div>
<h1>EAST GREENWICH Estate Sale by Estate Sales of New England</h1>
<div>58 Hyland Ave, East Greenwich, RI 02818</div>
<ul><li>Saturday, October 31, 2026 8:30 am - 2:00 pm</li><li>Sunday, November 1, 2026 8:30 am - 12:00 pm</li></ul>
</body></html>`;

describe('parseGarageSalesFinderListing', () => {
  it('still parses the old microdata layout unchanged', () => {
    const p = parseGarageSalesFinderListing(OLD_MICRODATA)!;
    expect(p.title).toBe('Big Yard Sale');
    expect(p.address).toBe('12 Main St');
    expect(p.city).toBe('Paw Paw');
    expect(p.state).toBe('MI');
    expect(p.zip).toBe('49079');
    expect(p.startDate!.toISOString()).toBe('2026-10-31T00:00:00.000Z');
    expect(p.endDate!.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(p.photoUrls).toEqual(['https://img.example/1.jpg']);
    expect(p.description).toBe('Tools and toys');
  });

  it('parses the new layout without microdata', () => {
    const p = parseGarageSalesFinderListing(NEW_NO_MICRODATA)!;
    expect(p).not.toBeNull();
    expect(p.title).toBe('EAST GREENWICH Estate Sale by Estate Sales of New England');
    expect(p.address).toBe('58 Hyland Ave');
    expect(p.city).toBe('East Greenwich');
    expect(p.state).toBe('RI');
    expect(p.zip).toBe('02818');
    expect(p.startDate!.toISOString()).toBe('2026-10-31T00:00:00.000Z');
    expect(p.endDate!.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(p.photoUrls).toEqual(['https://img.example/og.jpg']);
  });

  it('hidden-address title "City, ST ZIP" gives empty street', () => {
    const html = NEW_NO_MICRODATA.replace('58 Hyland Ave, East Greenwich', 'East Greenwich');
    const p = parseGarageSalesFinderListing(html)!;
    expect(p.address).toBe('');
    expect(p.city).toBe('East Greenwich');
  });

  it('reports why a page failed', () => {
    expect(parseGarageSalesFinderListingWithReason('<html><body></body></html>').reason).toBe('no_title');
    const noDates = NEW_NO_MICRODATA.replace(/<ul>.*<\/ul>/s, '');
    expect(parseGarageSalesFinderListingWithReason(noDates).reason).toBe('no_dates');
  });

  it('accepts JSON-LD dates', () => {
    const html = NEW_NO_MICRODATA.replace(/<ul>.*<\/ul>/s, '').replace(
      '</head>',
      '<script type="application/ld+json">{"@type":"Event","startDate":"2026-11-07","endDate":"2026-11-08"}</script></head>'
    );
    const p = parseGarageSalesFinderListing(html)!;
    expect(p.startDate!.toISOString()).toBe('2026-11-07T00:00:00.000Z');
    expect(p.endDate!.toISOString()).toBe('2026-11-08T00:00:00.000Z');
  });

  it('text dates ignore a far-off stray date', () => {
    const r = gsfDatesFromText('Saturday, October 31, 2026 ... Sunday, November 1, 2026 ... posted Monday, March 2, 2026')!;
    expect(r.start.toISOString()).toBe('2026-10-31T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// Per-metro breaker in scrapeGarageSaleFinder
// ---------------------------------------------------------------------------

const mockSafeFetch = jest.fn();
jest.mock('../safeFetch', () => ({ safeFetch: (...a: any[]) => mockSafeFetch(...a) }));
jest.mock('../userAgents', () => ({
  getRandomUserAgent: () => 'test-agent',
  jitterDelay: async () => undefined,
}));
jest.mock('../../../lib/prisma', () => ({
  prisma: { sale: { findMany: jest.fn(async () => []) } },
}));
const mockIngest = jest.fn(async () => ({ status: 'created' }));
jest.mock('../index', () => ({
  ingestScrapedListing: (...a: any[]) => (mockIngest as any)(...a),
  flushFreshnessTouches: async () => undefined,
  flushScraperRevalidation: async () => undefined,
}));

import { scrapeGarageSaleFinder, METRO_MAX_CONSECUTIVE_FETCH_FAILURES } from '../sources/garageSaleFinder';
import { RateLimiter } from '../rateLimiter';

function metroHtml(n: number): string {
  let links = '';
  for (let i = 0; i < n; i++) links += `<a href="/s/ID${i}/paw-paw-mi-49079">sale ${i}</a>`;
  return `<html><body>${links}</body></html>`;
}

function fetched(status: number, body: string) {
  return { status: 'FETCHED', response: new Response(body, { status }) };
}

describe('scrapeGarageSaleFinder per-metro breaker', () => {
  const realFetch = global.fetch;
  const rl = () => new RateLimiter({ requestsPerSecond: 1000 } as any);

  beforeEach(() => {
    mockSafeFetch.mockReset();
    mockIngest.mockClear();
    (global as any).fetch = jest.fn(async () => new Response('', { status: 404 })); // robots.txt
  });
  afterAll(() => {
    (global as any).fetch = realFetch;
  });

  it('passes tolerant policy scoped to the metro on every fetch', async () => {
    mockSafeFetch.mockImplementation(async (u: string) =>
      u.includes('/yard-sales/') ? fetched(200, metroHtml(2)) : fetched(200, NEW_NO_MICRODATA)
    );
    const s = await scrapeGarageSaleFinder('paw-paw-mi', 'org', rl());
    expect(s.created).toBe(2);
    for (const call of mockSafeFetch.mock.calls) {
      expect(call[1]).toMatchObject({ breakerPolicy: 'tolerant', breakerScope: 'paw-paw-mi' });
    }
  });

  it('ends only this metro after N consecutive fetch failures', async () => {
    mockSafeFetch.mockImplementation(async (u: string) =>
      u.includes('/yard-sales/') ? fetched(200, metroHtml(20)) : fetched(500, 'err')
    );
    const s = await scrapeGarageSaleFinder('paw-paw-mi', 'org', rl());
    expect(s.failed).toBe(METRO_MAX_CONSECUTIVE_FETCH_FAILURES);
    expect(mockSafeFetch).toHaveBeenCalledTimes(1 + METRO_MAX_CONSECUTIVE_FETCH_FAILURES);

    // The next metro starts fresh.
    mockSafeFetch.mockReset();
    mockSafeFetch.mockImplementation(async (u: string) =>
      u.includes('/yard-sales/') ? fetched(200, metroHtml(3)) : fetched(200, NEW_NO_MICRODATA)
    );
    const s2 = await scrapeGarageSaleFinder('kalamazoo-mi', 'org', rl());
    expect(s2.created).toBe(3);
  });

  it('a failure followed by a success does not end the metro', async () => {
    let n = 0;
    mockSafeFetch.mockImplementation(async (u: string) => {
      if (u.includes('/yard-sales/')) return fetched(200, metroHtml(12));
      n++;
      return n % 2 ? fetched(404, 'gone') : fetched(200, NEW_NO_MICRODATA);
    });
    const s = await scrapeGarageSaleFinder('paw-paw-mi', 'org', rl());
    expect(s.failed).toBe(6);
    expect(s.created).toBe(6);
  });

  it('a breaker or cap skip ends the metro at once', async () => {
    mockSafeFetch.mockImplementation(async (u: string) =>
      u.includes('/yard-sales/') ? fetched(200, metroHtml(10)) : { status: 'SKIPPED_CAP' }
    );
    const s = await scrapeGarageSaleFinder('paw-paw-mi', 'org', rl());
    expect(s.failed).toBe(1);
    expect(mockSafeFetch).toHaveBeenCalledTimes(2);
  });

  it('parse failures do not count toward the metro breaker', async () => {
    mockSafeFetch.mockImplementation(async (u: string) =>
      u.includes('/yard-sales/') ? fetched(200, metroHtml(8)) : fetched(200, '<html><body>nothing</body></html>')
    );
    const s = await scrapeGarageSaleFinder('paw-paw-mi', 'org', rl());
    expect(s.failed).toBe(8);
  });
});
