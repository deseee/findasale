/**
 * safeFetch breaker policy (2026-10-30 GarageSaleFinder blank-harvest incident).
 * One shared garagesalefinder.com DomainFetchState row is used by all 351 metros; a
 * single failure (on 10-30 our own SKIPPED_CAP) put the whole domain in a 6h COOLDOWN.
 * The 'tolerant' policy must: ignore our own cap, trip immediately on 429/503/403, and
 * trip on soft failures (404, other non-2xx, network errors) only after
 * TOLERANT_MIN_ATTEMPTS consecutive failures across TOLERANT_MIN_DISTINCT_SCOPES metros.
 * 'strict' (the default) must keep its old behaviour. No network, no DB.
 */

jest.mock('@sentry/node', () => ({ captureMessage: jest.fn() }));

const mockRecordOutcome = jest.fn(async (_url: string, ok: boolean) => ({
  status: ok ? 'OK' : 'COOLDOWN',
  consecutiveFailures: ok ? 0 : 1,
}));
const mockGetBreakerDecision = jest.fn(async (_url: string) => 'FETCH');
jest.mock('../domainFetchState', () => ({
  recordOutcome: (url: string, ok: boolean) => mockRecordOutcome(url, ok),
  getBreakerDecision: (url: string) => mockGetBreakerDecision(url),
  domainKey: (input: string) => {
    try {
      return new URL(input).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  },
}));

// Keep the shared rate limiter instant.
jest.mock('../rateLimiter', () => ({
  defaultRateLimiter: {
    waitBeforeRequest: jest.fn(async () => undefined),
    recordBackoff: jest.fn(),
    clearBackoff: jest.fn(),
  },
}));

import {
  safeFetch,
  __resetSafeFetchStateForTests,
  TOLERANT_MIN_ATTEMPTS,
  TOLERANT_MIN_DISTINCT_SCOPES,
} from '../safeFetch';

const realFetch = global.fetch;
let nextStatus = 200;
let throwNext = false;

function failures(): number {
  return mockRecordOutcome.mock.calls.filter((c) => c[1] === false).length;
}

beforeEach(() => {
  __resetSafeFetchStateForTests();
  mockRecordOutcome.mockClear();
  mockGetBreakerDecision.mockClear();
  nextStatus = 200;
  throwNext = false;
  (global as any).fetch = jest.fn(async () => {
    if (throwNext) throw new Error('timeout');
    return new Response('x', { status: nextStatus });
  });
});

afterAll(() => {
  (global as any).fetch = realFetch;
});

const T = { breakerPolicy: 'tolerant' as const };
const url = (metro: string, n: number) => `https://garagesalefinder.com/s/X${n}/${metro}`;

describe('tolerant policy', () => {
  it('a single 404 does not record a domain failure', async () => {
    nextStatus = 404;
    const r = await safeFetch(url('a', 1), { ...T, breakerScope: 'a' });
    expect(r.status).toBe('FETCHED');
    expect(failures()).toBe(0);
  });

  it('many 404s inside ONE metro never trip the domain', async () => {
    nextStatus = 404;
    for (let i = 0; i < TOLERANT_MIN_ATTEMPTS * 3; i++) {
      await safeFetch(url('only-metro', i), { ...T, breakerScope: 'only-metro' });
    }
    expect(failures()).toBe(0);
  });

  it('trips only after the attempt floor AND enough distinct metros', async () => {
    nextStatus = 404;
    const metros = Array.from({ length: TOLERANT_MIN_DISTINCT_SCOPES }, (_, i) => `m${i}`);
    for (let i = 0; i < TOLERANT_MIN_ATTEMPTS - 1; i++) {
      await safeFetch(url(metros[i % metros.length], i), { ...T, breakerScope: metros[i % metros.length] });
    }
    expect(failures()).toBe(0); // one short of the floor
    await safeFetch(url(metros[0], 999), { ...T, breakerScope: metros[0] });
    expect(failures()).toBe(1);
  });

  it('a 2xx resets the soft streak', async () => {
    for (let i = 0; i < TOLERANT_MIN_ATTEMPTS - 1; i++) {
      nextStatus = 404;
      await safeFetch(url(`m${i}`, i), { ...T, breakerScope: `m${i}` });
    }
    nextStatus = 200;
    await safeFetch(url('ok', 1), { ...T, breakerScope: 'ok' });
    nextStatus = 404;
    await safeFetch(url('m-next', 1), { ...T, breakerScope: 'm-next' });
    expect(failures()).toBe(0);
  });

  it('network errors are soft failures and still propagate', async () => {
    throwNext = true;
    for (let i = 0; i < TOLERANT_MIN_ATTEMPTS; i++) {
      await expect(safeFetch(url(`n${i}`, i), { ...T, breakerScope: `n${i}` })).rejects.toThrow('timeout');
    }
    expect(failures()).toBe(1);
  });

  it.each([429, 503, 403])('a %s block signal trips the domain immediately', async (code) => {
    nextStatus = code;
    await safeFetch(url('a', 1), { ...T, breakerScope: 'a' });
    expect(failures()).toBe(1);
  });

  it('our own hourly cap does not record a domain failure', async () => {
    const cap = Number(process.env.SCRAPER_HOST_CAP_PER_HOUR ?? 300);
    for (let i = 0; i < cap; i++) await safeFetch(url('c', i), { ...T, breakerScope: 'c' });
    const r = await safeFetch(url('c', cap + 1), { ...T, breakerScope: 'c' });
    expect(r.status).toBe('SKIPPED_CAP');
    expect(failures()).toBe(0);
  });
});

describe('strict policy (default) is unchanged', () => {
  it('a single 404 records a domain failure', async () => {
    nextStatus = 404;
    await safeFetch('https://example-strict.com/a');
    expect(failures()).toBe(1);
  });

  it('a cap breach records a domain failure', async () => {
    const cap = Number(process.env.SCRAPER_HOST_CAP_PER_HOUR ?? 300);
    for (let i = 0; i < cap; i++) await safeFetch(`https://example-cap.com/${i}`);
    const r = await safeFetch('https://example-cap.com/over');
    expect(r.status).toBe('SKIPPED_CAP');
    expect(failures()).toBe(1);
  });

  it('a skip by the domain breaker returns SKIPPED_BREAKER without fetching', async () => {
    mockGetBreakerDecision.mockResolvedValueOnce('THROTTLED');
    const r = await safeFetch('https://example-strict.com/b', T);
    expect(r.status).toBe('SKIPPED_BREAKER');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
