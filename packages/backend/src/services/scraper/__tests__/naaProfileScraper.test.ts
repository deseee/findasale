/**
 * NAA sitemap-driven profile scraper (2026-11-01). Fixtures follow the two live public
 * profiles read via WebFetch on 2026-11-01 (adam-dunn: address in one text run;
 * aaron-klesick: address parts in separate elements). The Contact block on every profile
 * carries NAA's own office address and phone, which must never be taken as the member's.
 */

jest.mock('@sentry/node', () => ({ captureMessage: jest.fn() }));
const mockSafeFetch = jest.fn();
jest.mock('../safeFetch', () => ({ safeFetch: (...a: any[]) => mockSafeFetch(...a) }));
const mockGetOrCreate = jest.fn();
jest.mock('../index', () => ({ getOrCreateScrapedOrganizer: (...a: any[]) => mockGetOrCreate(...a) }));
const mockFindUnique = jest.fn();
jest.mock('../../../lib/prisma', () => ({ prisma: { organizer: { findUnique: (...a: any[]) => mockFindUnique(...a) } } }));

import {
  parseNAAProfile,
  parseSitemapProfileUrls,
  sliceForRun,
  cityFromSegment,
  findMemberAddress,
  scrapeNAAProfiles,
} from '../sources/naaProfileScraper';

const CONTACT = `<h2>Contact</h2><div>11900 West 87th Street Parkway<br>Suite 120<br>Lenexa, Kansas 66215<br>United States</div>
<a href="tel:9135418084">(913) 541-8084</a>
<a href="https://www.facebook.com/NatAuctionAssn">f</a><a href="https://x.com/natauctionassn">x</a>
<a href="https://www.linkedin.com/company/national-auction-association/?viewAsMember=true">in</a>
<a href="https://www.noviams.com">Novi AMS</a>`;

const DUNN = `<html><head><title>Adam Dunn - National Auction Association</title></head><body>
<nav><a href="https://www.auctioneers.org/">NAA</a> Join Login</nav>
<a href="/find-an-auctioneer">Back to Find an Auctioneer</a>
<img alt="Photo of Adam Dunn" src="/x.png"><h1>Adam Dunn</h1>
<div>Dunn Deal Auctions</div>
<div>7026 Winchester Southern Rd. Stoutsville, OH 43154</div>
<div>Life Member</div><div>Member Since: 2005</div><div>Original Join Date: 2005</div>
<a href="http://www.dunndealauctions.net">http://www.dunndealauctions.net</a>
<a href="/members/secure-contact?customerId=33c38f2d">View Email</a>
<h2>Organization</h2><div>Dunn Deal Auctions</div>
${CONTACT}
</body></html>`;

const KLESICK = `<html><head><title>Aaron Klesick - National Auction Association</title></head><body>
<h1>Aaron Klesick</h1><div>Ambassador</div><div>Regular Member</div><div>A&amp;E Auction Services</div>
<div>Member Since: 2024</div><div>Original Join Date: 2024</div>
<div class="address"><span>20774 English Rd.</span><br><span>Mount Vernon</span>, <span>WA</span> <span>98274</span><br><span>United States</span></div>
<h2>Organization</h2><img alt="Photo of A&amp;E Auction Services" src="/p.png"><div>A&amp;E Auction Services</div>
${CONTACT.replace('<a href="tel', '<a href="http://aeauctionservices.com">http://aeauctionservices.com</a><a href="tel')}
</body></html>`;

describe('parseNAAProfile', () => {
  it('one-line address: city without the street, member website, no NAA phone', () => {
    const { profile } = parseNAAProfile(DUNN);
    expect(profile).toEqual({
      name: 'Adam Dunn',
      city: 'Stoutsville',
      state: 'OH',
      zip: '43154',
      website: 'http://www.dunndealauctions.net',
    });
  });

  it('split address elements; website found in the Contact section; NAA office ignored', () => {
    const { profile } = parseNAAProfile(KLESICK);
    expect(profile).toMatchObject({ name: 'Aaron Klesick', city: 'Mount Vernon', state: 'WA', zip: '98274' });
    expect(profile!.website).toBe('http://aeauctionservices.com');
  });

  it("never returns NAA's own Lenexa office as the member address", () => {
    const noMemberAddr = DUNN.replace('<div>7026 Winchester Southern Rd. Stoutsville, OH 43154</div>', '');
    expect(parseNAAProfile(noMemberAddr)).toEqual({ profile: null, reason: 'no_us_address' });
  });

  it('skips non-US members', () => {
    const ca = DUNN.replace('7026 Winchester Southern Rd. Stoutsville, OH 43154', '12 King St. Toronto, ON M5H 1A1');
    expect(parseNAAProfile(ca).profile).toBeNull();
  });

  it('falls back to the <title> for the name', () => {
    const p = parseNAAProfile(DUNN.replace('<h1>Adam Dunn</h1>', '<div>Adam Dunn</div>')).profile!;
    expect(p.name).toBe('Adam Dunn');
    expect(p.city).toBe('Stoutsville');
  });

  it('full state names are accepted', () => {
    const p = parseNAAProfile(DUNN.replace('Stoutsville, OH 43154', 'Albany, New York 12207')).profile!;
    expect(p).toMatchObject({ city: 'Albany', state: 'NY' });
  });
});

describe('address helpers', () => {
  it('cityFromSegment strips a street and unit, or gives up', () => {
    expect(cityFromSegment('7026 Winchester Southern Rd. Stoutsville')).toBe('Stoutsville');
    expect(cityFromSegment('500 Main Street Suite 4 Grand Rapids')).toBe('Grand Rapids');
    expect(cityFromSegment('Paw Paw')).toBe('Paw Paw');
    expect(cityFromSegment('123 Unknownthing Paw Paw')).toBeNull();
  });

  it('findMemberAddress joins split segments', () => {
    expect(findMemberAddress(['Mount Vernon', ',', 'WA', '98274'])).toEqual({ city: 'Mount Vernon', state: 'WA', zip: '98274' });
    expect(findMemberAddress(['Lenexa, Kansas 66215'])).toBeNull();
  });
});

describe('sitemap', () => {
  const XML = `<?xml version="1.0" encoding="utf-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://members.auctioneers.org/auctionswork/how-are-auctioneers-paid</loc><lastmod>2019-07-01</lastmod></url>
  <url><loc>https://members.auctioneers.org/find-an-auctioneer/aaron-klesick</loc><lastmod>2025-09-19</lastmod></url>
  <url><loc>https://members.auctioneers.org/find-an-auctioneer/a-curtis-andrew</loc><lastmod>2025-09-19</lastmod></url>
  <url><loc>https://members.auctioneers.org/find-an-auctioneer/aaron-klesick/</loc></url>
  <url><loc>https://members.auctioneers.org/find-an-auctioneer</loc></url>
  <url><loc>https://members.auctioneers.org/find-an-auctioneer/x/y</loc></url>
</urlset>`;

  it('keeps only one-segment profile URLs, de-duplicated and sorted', () => {
    expect(parseSitemapProfileUrls(XML)).toEqual([
      'https://members.auctioneers.org/find-an-auctioneer/a-curtis-andrew',
      'https://members.auctioneers.org/find-an-auctioneer/aaron-klesick',
    ]);
  });

  it('weekly slices cover every profile and respect the cap', () => {
    const urls = Array.from({ length: 400 }, (_, i) => `u${String(i).padStart(3, '0')}`);
    const seen = new Set<string>();
    const week0 = new Date('2026-11-02T08:00:00Z').getTime();
    for (let w = 0; w < 3; w++) {
      const s = sliceForRun(urls, 150, new Date(week0 + w * 7 * 86_400_000));
      expect(s).toHaveLength(150);
      expect(new Set(s).size).toBe(150);
      s.forEach((u) => seen.add(u));
    }
    expect(seen.size).toBe(400);
    expect(sliceForRun(urls.slice(0, 10), 150)).toHaveLength(10);
  });
});

describe('scrapeNAAProfiles', () => {
  const ROBOTS = `User-agent: ClaudeBot\nCrawl-delay: 1\nDisallow: /api/\n\nUser-agent: *\nDisallow: /api/\nDisallow: /novi-api/\nDisallow: /admin/\nDisallow: /login\n`;
  const SITEMAP = `<urlset>
<url><loc>https://members.auctioneers.org/find-an-auctioneer/adam-dunn</loc></url>
<url><loc>https://members.auctioneers.org/find-an-auctioneer/aaron-klesick</loc></url>
<url><loc>https://members.auctioneers.org/find-an-auctioneer/gone-member</loc></url>
</urlset>`;
  const ok = (body: string, status = 200) => ({ status: 'FETCHED', response: new Response(body, { status }) });

  beforeEach(() => {
    process.env.NAA_PROFILE_INTERVAL_MS = '1000';
    jest.useFakeTimers({ advanceTimers: 1000 } as any);
    mockSafeFetch.mockReset();
    mockGetOrCreate.mockReset();
    mockFindUnique.mockReset();
  });
  afterEach(() => {
    jest.useRealTimers();
    delete process.env.NAA_PROFILE_INTERVAL_MS;
  });

  async function run() {
    const p = scrapeNAAProfiles('national', '');
    p.catch(() => undefined); // asserted by the caller; avoid an unhandled rejection meanwhile
    for (let i = 0; i < 50; i++) await jest.advanceTimersByTimeAsync(2000);
    return p;
  }

  it('reads robots + sitemap, fetches each profile once, ingests with no phone, and counts created vs existing', async () => {
    mockSafeFetch.mockImplementation(async (u: string) => {
      if (u.endsWith('/robots.txt')) return ok(ROBOTS);
      if (u.endsWith('/sitemap.xml')) return ok(SITEMAP);
      if (u.endsWith('/adam-dunn')) return ok(DUNN);
      if (u.endsWith('/aaron-klesick')) return ok(KLESICK);
      return ok('', 404);
    });
    mockGetOrCreate.mockImplementation(async (name: string) => (name === 'Adam Dunn' ? 'org-old' : 'org-new'));
    mockFindUnique.mockImplementation(async ({ where }: any) =>
      where.id === 'org-old' ? { createdAt: new Date('2026-06-11T00:00:00Z') } : { createdAt: new Date(Date.now() + 1000) }
    );
    const stats = await run();
    expect(stats).toMatchObject({ itemsFound: 2, itemsCreated: 1, itemsUpdated: 1, itemsSkipped: 1, itemsFailed: 0 });
    const profileCalls = mockSafeFetch.mock.calls.map((c) => c[0]).filter((u: string) => u.includes('/find-an-auctioneer/'));
    expect(profileCalls).toHaveLength(3);
    for (const c of mockSafeFetch.mock.calls) {
      expect(c[1].headers['User-Agent']).toMatch(/FindASaleBot/);
      expect(c[1].breakerPolicy).toBe('tolerant');
    }
    const dunn = mockGetOrCreate.mock.calls.find((c) => c[0] === 'Adam Dunn')!;
    expect(dunn.slice(0, 4)).toEqual(['Adam Dunn', 'NAAFindAnAuctioneer', 'Stoutsville', 'OH']);
    expect(dunn[8]).toBe('AUCTION_HOUSE');
    expect(dunn[10]).toBeUndefined(); // phone: never NAA's office number
    expect(dunn[11]).toBe('http://www.dunndealauctions.net');
  });

  it('skips profiles robots.txt disallows', async () => {
    mockSafeFetch.mockImplementation(async (u: string) => {
      if (u.endsWith('/robots.txt')) return ok('User-agent: *\nDisallow: /find-an-auctioneer/\n');
      if (u.endsWith('/sitemap.xml')) return ok(SITEMAP);
      return ok(DUNN);
    });
    await expect(run()).rejects.toThrow(/no allowed/);
    expect(mockSafeFetch.mock.calls.some((c) => String(c[0]).includes('/find-an-auctioneer/'))).toBe(false);
  });

  it('stops the run on a block signal instead of continuing', async () => {
    mockSafeFetch.mockImplementation(async (u: string) => {
      if (u.endsWith('/robots.txt')) return ok(ROBOTS);
      if (u.endsWith('/sitemap.xml')) return ok(SITEMAP);
      return ok('slow down', 429);
    });
    const stats = await run();
    expect(stats.incompleteReason).toBe('http_429');
    expect(mockSafeFetch.mock.calls.filter((c) => String(c[0]).includes('/find-an-auctioneer/'))).toHaveLength(1);
  });

  it('does not crawl without a readable robots.txt', async () => {
    mockSafeFetch.mockImplementation(async () => ok('', 500));
    await expect(run()).rejects.toThrow(/robots\.txt unavailable/);
    expect(mockSafeFetch).toHaveBeenCalledTimes(1);
  });
});
