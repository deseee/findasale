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
  gsfPhotosFromHtml,
  gsfFullSizePhotoUrl,
  parseGarageSalesFinderGallery,
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

  // Shape of live listing N9VQL (2029 Gates Ave, Ridgewood NY) seen via WebFetch 2026-11-01:
  // og:image at w300-c300:300, one w150-h100 thumbnail per photo, a /gallery?p=N link per
  // photo, site assets under /images/, and an URL-encoded w700-h500 Pinterest share link.
  const LIVE_PHOTOS = `<html><head>
<title>2029 Gates Ave, Ridgewood, NY 11385 | 21813521 | GarageSaleFinder.com</title>
<meta property="og:title" content="Sidewalk yard estate sale">
<meta property="og:image" content="https://gsf.tlstatic.com/image/w300-c300:300/2026/10/29/s/2/1/21813521/XTJzb-0.jpeg">
</head><body>
<a href="https://gsf.tlstatic.com/1027481247/images/tl-logo-color.svg"></a>
<h1>Sidewalk yard estate sale</h1><div>2029 Gates Ave, Ridgewood, NY 11385</div>
<ul><li>Saturday, October 31, 2026 10:00 am - 8:00 pm</li><li>Sunday, November 1, 2026 10:00 am - 6:00 pm</li></ul>
<a href="/s/N9VQL/2029-gates-ave-ridgewood-ny-11385/gallery?p=0"><img src="https://gsf.tlstatic.com/image/w150-h100/2026/10/29/s/2/1/21813521/XTJzb-0.jpeg"></a>
<a href="/s/N9VQL/2029-gates-ave-ridgewood-ny-11385/gallery?p=1"><img src="https://gsf.tlstatic.com/image/w150-h100/2026/10/29/s/2/1/21813521/7NYl-0.jpeg"></a>
<a href="/s/N9VQL/2029-gates-ave-ridgewood-ny-11385/gallery?p=2"><img data-src="https://gsf.tlstatic.com/image/w150-h100/2026/10/29/s/2/1/21813521/XDI6t-0.jpeg" src="https://gsf.tlstatic.com/images/spacer.png"></a>
<img src="https://gsf.tlstatic.com/image/w150-h100/2026/10/29/s/2/1/21813521/yALO-0.jpeg">
<img src="https://gsf.tlstatic.com/image/w150-h100/2026/10/29/s/2/1/21813521/XNMJu-0.jpeg">
<img src="https://gsf.tlstatic.com/image/w150-h100/2026/10/29/s/2/1/21813521/XD9VX-0.jpeg">
<a href="https://pinterest.com/pin/create/button/?media=https%3A%2F%2Fgsf.tlstatic.com%2Fimage%2Fw700-h500%2F2026%2F10%2F29%2Fs%2F2%2F1%2F21813521%2FXTJzb-0.jpeg"><img src="https://gsf.tlstatic.com/images/social/Pinterest.png"></a>
</body></html>`;

  it('reads sale photos from the detail page, upgraded to w700-h500', () => {
    const p = parseGarageSalesFinderListing(LIVE_PHOTOS)!;
    expect(p.city).toBe('Ridgewood');
    expect(p.photoUrls).toEqual([
      'https://gsf.tlstatic.com/image/w700-h500/2026/10/29/s/2/1/21813521/XTJzb-0.jpeg',
      'https://gsf.tlstatic.com/image/w700-h500/2026/10/29/s/2/1/21813521/7NYl-0.jpeg',
      'https://gsf.tlstatic.com/image/w700-h500/2026/10/29/s/2/1/21813521/XDI6t-0.jpeg',
      'https://gsf.tlstatic.com/image/w700-h500/2026/10/29/s/2/1/21813521/yALO-0.jpeg',
      'https://gsf.tlstatic.com/image/w700-h500/2026/10/29/s/2/1/21813521/XNMJu-0.jpeg',
    ]);
  });

  it('keeps EstateSales.org-syndicated photos as served and skips site assets', () => {
    // Shape of live listing N9VXP (West Orange NJ), 2026-11-01.
    const html = `<meta property="og:image" content="https://eso-cdn.tlcdn.workers.dev/s-2470603-rwpp650ks7azvwjf-t.webp">
<img src="https://gsf.tlstatic.com/images/social/Facebook.png">
<img src="https://eso-cdn.tlcdn.workers.dev/s-2470603-rwpp650ks7azvwjf-t.webp">
<img src="https://eso-cdn.tlcdn.workers.dev/s-2470603-zu40pg82slvuprrw-t.webp">`;
    expect(gsfPhotosFromHtml(html)).toEqual([
      'https://eso-cdn.tlcdn.workers.dev/s-2470603-rwpp650ks7azvwjf-t.webp',
      'https://eso-cdn.tlcdn.workers.dev/s-2470603-zu40pg82slvuprrw-t.webp',
    ]);
  });

  it('upgrades only tlstatic size segments', () => {
    expect(gsfFullSizePhotoUrl('https://ysn.tlstatic.com/image/w150-h100/2026/10/22/s/g/l/7HRgl/Xex8s-0.jpeg')).toBe(
      'https://ysn.tlstatic.com/image/w700-h500/2026/10/22/s/g/l/7HRgl/Xex8s-0.jpeg'
    );
    expect(gsfFullSizePhotoUrl('https://img.example/a/w150-h100/x.jpg')).toBe('https://img.example/a/w150-h100/x.jpg');
  });

  it('gallery parser reads lazy (spacer.png) galleries from data attributes', () => {
    const html = `<img src="https://gsf.tlstatic.com/images/spacer.png" data-src="https://gsf.tlstatic.com/image/w700-h500/2026/10/29/s/x/1.jpeg">`;
    expect(parseGarageSalesFinderGallery(html)).toEqual(['https://gsf.tlstatic.com/image/w700-h500/2026/10/29/s/x/1.jpeg']);
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
jest.mock('../safeFetch', () => ({
  safeFetch: (...a: any[]) => mockSafeFetch(...a),
  getHostCapPerHour: () => 300,
}));
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

import {
  scrapeGarageSaleFinder,
  METRO_MAX_CONSECUTIVE_FETCH_FAILURES,
  gsfPace,
  gsfMinRequestIntervalMs,
  __setGsfPacerClockForTests,
} from '../sources/garageSaleFinder';
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
    // Instant pacer for these tests (the pacer itself is tested below).
    let t = 0;
    __setGsfPacerClockForTests({ now: () => t, sleep: async (ms) => { t += ms; }, random: () => 0 });
  });
  afterAll(() => {
    (global as any).fetch = realFetch;
    __setGsfPacerClockForTests();
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

  it('a breaker or cap skip ends the metro at once and marks it incomplete (not a failed item)', async () => {
    mockSafeFetch.mockImplementation(async (u: string) =>
      u.includes('/yard-sales/') ? fetched(200, metroHtml(10)) : { status: 'SKIPPED_CAP' }
    );
    const s = await scrapeGarageSaleFinder('paw-paw-mi', 'org', rl());
    expect(s.failed).toBe(0);
    expect(s.stoppedEarly).toBe('skipped_cap');
    expect(mockSafeFetch).toHaveBeenCalledTimes(2);

    mockSafeFetch.mockReset();
    mockSafeFetch.mockImplementation(async (u: string) =>
      u.includes('/yard-sales/') ? fetched(200, metroHtml(10)) : { status: 'SKIPPED_BREAKER' }
    );
    const s2 = await scrapeGarageSaleFinder('paw-paw-mi', 'org', rl());
    expect(s2.stoppedEarly).toBe('skipped_breaker');
  });

  it('a capped metro page is reported as incomplete, not as an empty metro', async () => {
    mockSafeFetch.mockImplementation(async () => ({ status: 'SKIPPED_CAP' }));
    const s = await scrapeGarageSaleFinder('honolulu-hi', 'org', rl());
    expect(s.stoppedEarly).toBe('skipped_cap');
    expect(s.created + s.failed).toBe(0);
  });

  it('a 429 on the metro page marks the metro incomplete', async () => {
    mockSafeFetch.mockImplementation(async () => fetched(429, 'slow down'));
    const s = await scrapeGarageSaleFinder('paw-paw-mi', 'org', rl());
    expect(s.stoppedEarly).toBe('metro_http_429');
  });

  it('a complete metro has no stoppedEarly', async () => {
    mockSafeFetch.mockImplementation(async (u: string) =>
      u.includes('/yard-sales/') ? fetched(200, metroHtml(2)) : fetched(200, NEW_NO_MICRODATA)
    );
    const s = await scrapeGarageSaleFinder('paw-paw-mi', 'org', rl());
    expect(s.stoppedEarly).toBeUndefined();
  });

  it('never fetches the /gallery page; photos come from the detail page, else the metro thumbnail', async () => {
    const metro = `<html><body>
<a href="/s/AAA1/x-paw-paw-mi-49079/gallery"><img src="https://gsf.tlstatic.com/image/w150-h100/2026/10/29/s/a/1/AAA1/p1-0.jpeg"></a>
<a href="/s/AAA1/x-paw-paw-mi-49079">sale 1</a>
<a href="/s/BBB2/y-paw-paw-mi-49079/gallery"><img src="https://gsf.tlstatic.com/image/w150-h100/2026/10/29/s/b/2/BBB2/q1-0.jpeg"></a>
<a href="/s/BBB2/y-paw-paw-mi-49079">sale 2</a>
</body></html>`;
    const withPhoto = NEW_NO_MICRODATA.replace(
      '<meta property="og:image" content="https://img.example/og.jpg">',
      ''
    ).replace('</ul>', '</ul><img src="https://gsf.tlstatic.com/image/w150-h100/2026/10/29/s/a/1/AAA1/detail-0.jpeg">');
    const noPhoto = NEW_NO_MICRODATA.replace('<meta property="og:image" content="https://img.example/og.jpg">', '');
    mockSafeFetch.mockImplementation(async (u: string) => {
      if (u.includes('/yard-sales/')) return fetched(200, metro);
      return fetched(200, u.includes('AAA1') ? withPhoto : noPhoto);
    });
    const s = await scrapeGarageSaleFinder('paw-paw-mi', 'org', rl());
    expect(s.created).toBe(2);
    expect(mockSafeFetch.mock.calls.some((c) => String(c[0]).includes('/gallery'))).toBe(false);
    expect(mockSafeFetch).toHaveBeenCalledTimes(3);
    const items = mockIngest.mock.calls.map((c: any[]) => c[0]);
    expect(items.find((i: any) => i.sourceUrl.includes('AAA1')).photoUrls).toEqual([
      'https://gsf.tlstatic.com/image/w700-h500/2026/10/29/s/a/1/AAA1/detail-0.jpeg',
    ]);
    expect(items.find((i: any) => i.sourceUrl.includes('BBB2')).photoUrls).toEqual([
      'https://gsf.tlstatic.com/image/w700-h500/2026/10/29/s/b/2/BBB2/q1-0.jpeg',
    ]);
  });

  it('parse failures do not count toward the metro breaker', async () => {
    mockSafeFetch.mockImplementation(async (u: string) =>
      u.includes('/yard-sales/') ? fetched(200, metroHtml(8)) : fetched(200, '<html><body>nothing</body></html>')
    );
    const s = await scrapeGarageSaleFinder('paw-paw-mi', 'org', rl());
    expect(s.failed).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Pacer: GSF requests are spread across the hour, under 90% of the per-host cap
// ---------------------------------------------------------------------------
describe('gsfPace', () => {
  afterEach(() => {
    delete process.env.GSF_MIN_REQUEST_INTERVAL_MS;
    __setGsfPacerClockForTests();
  });

  it('default interval keeps a full hour under 90% of the 300/hr cap', () => {
    const ms = gsfMinRequestIntervalMs();
    expect(ms).toBe(Math.ceil(3_600_000 / 270));
    expect(Math.floor(3_600_000 / ms)).toBeLessThanOrEqual(270);
  });

  it('spaces consecutive requests by at least the interval, and fits the hour', async () => {
    let t = 1_000_000;
    const sleeps: number[] = [];
    __setGsfPacerClockForTests({
      now: () => t,
      sleep: async (ms) => { sleeps.push(ms); t += ms; },
      random: () => 0.5,
    });
    const stamps: number[] = [];
    for (let i = 0; i < 400; i++) {
      await gsfPace();
      stamps.push(t);
      t += 50; // the request itself
    }
    const interval = gsfMinRequestIntervalMs();
    for (let i = 1; i < stamps.length; i++) expect(stamps[i] - stamps[i - 1]).toBeGreaterThanOrEqual(interval);
    // No rolling hour holds more than 270 requests.
    let maxInHour = 0;
    for (let i = 0, j = 0; i < stamps.length; i++) {
      while (stamps[i] - stamps[j] >= 3_600_000) j++;
      maxInHour = Math.max(maxInHour, i - j + 1);
    }
    expect(maxInHour).toBeLessThanOrEqual(270);
    expect(sleeps[0]).toBeGreaterThan(0);
  });

  it('honours GSF_MIN_REQUEST_INTERVAL_MS', () => {
    process.env.GSF_MIN_REQUEST_INTERVAL_MS = '20000';
    expect(gsfMinRequestIntervalMs()).toBe(20000);
  });
});
