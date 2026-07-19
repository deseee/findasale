/**
 * Test coverage for dedupe.ts — address normalization and duplicate detection
 *
 * Run with: npm test (after jest is configured in package.json)
 */

import { normalizeAddress, checkDuplicate } from '../dedupe';
import { prisma } from '../../../lib/prisma';

// Mock the Prisma singleton so checkDuplicate() can be exercised without a
// live database connection. Only the calls actually reached by the tier-6
// recurring-event roll-forward tests below (sale.findMany) are used; other
// tiers are avoided per-test by omitting sourceUrl/sourceItemId/address/lat/lng
// from the listing fixture so those earlier tiers short-circuit before ever
// touching Prisma.
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    sale: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  },
}));

const mockFindMany = prisma.sale.findMany as jest.Mock;

describe('normalizeAddress', () => {
  test('normalizes street suffix: Street → st', () => {
    expect(normalizeAddress('123 Main Street')).toBe('123 main st');
  });

  test('normalizes avenue suffix: Avenue → ave', () => {
    expect(normalizeAddress('456 Oak Avenue')).toBe('456 oak ave');
  });

  test('normalizes boulevard suffix: Boulevard → blvd', () => {
    expect(normalizeAddress('789 Park Boulevard')).toBe('789 park blvd');
  });

  test('normalizes drive suffix: Drive → dr', () => {
    expect(normalizeAddress('111 Elm Drive')).toBe('111 elm dr');
  });

  test('normalizes directional: East → e', () => {
    expect(normalizeAddress('456 East Oak Avenue')).toBe('456 e oak ave');
  });

  test('normalizes directional: West → w', () => {
    expect(normalizeAddress('789 West Park Blvd')).toBe('789 w park blvd');
  });

  test('normalizes directional: North → n', () => {
    expect(normalizeAddress('123 North Main Street')).toBe('123 n main st');
  });

  test('normalizes directional: South → s', () => {
    expect(normalizeAddress('456 South Oak Avenue')).toBe('456 s oak ave');
  });

  test('removes punctuation', () => {
    expect(normalizeAddress('123 Main St.')).toBe('123 main st');
  });

  test('removes punctuation: apostrophe', () => {
    expect(normalizeAddress("O'Brien's Lane")).toBe('obriens ln');
  });

  test('removes periods, preserves commas as field separators', () => {
    expect(normalizeAddress('123 Main St., Suite A.')).toBe('123 main st, suite a');
  });

  test('collapses multiple spaces', () => {
    expect(normalizeAddress('123  Main   Street')).toBe('123 main st');
  });

  test('handles empty string', () => {
    expect(normalizeAddress('')).toBe('');
  });

  test('handles null-like values', () => {
    expect(normalizeAddress('   ')).toBe('');
  });

  test('handles multiple suffix types in one address', () => {
    expect(normalizeAddress('123 East Main Street, North Suite')).toBe('123 e main st, n suite');
  });

  test('preserves commas as field separators', () => {
    expect(normalizeAddress('123 Main St, Suite A')).toBe('123 main st, suite a');
  });

  test('case-insensitive suffix matching', () => {
    expect(normalizeAddress('123 MAIN STREET')).toBe('123 main st');
    expect(normalizeAddress('123 main street')).toBe('123 main st');
    expect(normalizeAddress('123 Main Street')).toBe('123 main st');
  });

  test('handles place, court, district abbreviations', () => {
    expect(normalizeAddress('456 Oak Place')).toBe('456 oak pl');
    expect(normalizeAddress('789 Park Court')).toBe('789 park ct');
    expect(normalizeAddress('111 Oak District')).toBe('111 oak dist');
  });

  test('real-world example 1: estate sale with period', () => {
    // Input: "123 Main St., Suite 200"
    // Expected: "123 main st, suite 200"
    expect(normalizeAddress('123 Main St., Suite 200')).toBe('123 main st, suite 200');
  });

  test('real-world example 2: full address with all variations', () => {
    // Input: "456 North Oak Avenue, East Wing, Suite A."
    // Expected: "456 n oak ave, e wing, suite a"
    expect(normalizeAddress('456 North Oak Avenue, East Wing, Suite A.')).toBe('456 n oak ave, e wing, suite a');
  });

  test('real-world example 3: abbreviated input', () => {
    // Input: "123 Main St. E"
    // Expected: "123 main st e"
    expect(normalizeAddress('123 Main St. E')).toBe('123 main st e');
  });
});

// Tier 6: recurring Facebook Events roll-forward (S1138).
// NOTE ON RECURRING_ROLL_FORWARD_MAX_GAP_DAYS: dedupe.ts defines this as a
// hardcoded module-level `const = 45`, NOT read from `process.env` anywhere
// in dedupe.ts or scraper/index.ts (confirmed via grep across
// packages/backend/src). There is no env var to set in these tests — the
// 45-day boundary below is exercised directly against that literal.
describe('checkDuplicate — tier 6 recurring FB Events roll-forward', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);
  const daysFromNow = (days: number): Date => new Date(Date.now() + days * DAY_MS);

  // Same recurring listing, two different weekly occurrences — the title
  // carries a different month/day each time FB re-posts it, which is exactly
  // what normalizeEventTitle() strips so the two are recognized as the same
  // recurring sale.
  const CANDIDATE_TITLE = 'Wyoming Flea Market - July 5';
  const INCOMING_TITLE = 'Wyoming Flea Market - August 16';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('candidate ended long ago (100-day gap, well over the 45-day max) — does NOT roll forward', async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: 'sale-old-1',
        title: CANDIDATE_TITLE,
        startDate: daysAgo(101),
        endDate: daysAgo(100),
      },
    ]);

    const result = await checkDuplicate(
      {
        title: INCOMING_TITLE,
        city: 'Wyoming',
        state: 'MI',
        startDate: new Date(),
        endDate: daysFromNow(1),
      },
      'Facebook Events',
      ''
    );

    expect(result.isDuplicate).toBe(false);
    expect(result.action).toBeUndefined();
  });

  test('candidate ended recently (10-day gap, within the 45-day max) — rolls forward', async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: 'sale-recent-1',
        title: CANDIDATE_TITLE,
        startDate: daysAgo(11),
        endDate: daysAgo(10),
      },
    ]);

    const result = await checkDuplicate(
      {
        title: INCOMING_TITLE,
        city: 'Wyoming',
        state: 'MI',
        startDate: new Date(),
        endDate: daysFromNow(1),
      },
      'Facebook Events',
      ''
    );

    expect(result.isDuplicate).toBe(true);
    expect(result.action).toBe('rollForward');
    expect(result.existingSaleId).toBe('sale-recent-1');
    expect(result.reason).toMatch(/Recurring FB Event/);
  });

  test('candidate is still ongoing/upcoming (not yet ended) — does NOT roll forward regardless of date proximity', async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: 'sale-live-1',
        title: CANDIDATE_TITLE,
        startDate: daysAgo(2),
        endDate: daysFromNow(5), // still live — has not ended
      },
    ]);

    // Incoming occurrence starts only 5 days after the candidate's end date
    // (well inside the 45-day gap window) and does not date-overlap the
    // candidate — proximity alone must not trigger roll-forward while the
    // matched candidate is still ongoing/upcoming.
    const result = await checkDuplicate(
      {
        title: INCOMING_TITLE,
        city: 'Wyoming',
        state: 'MI',
        startDate: daysFromNow(10),
        endDate: daysFromNow(11),
      },
      'Facebook Events',
      ''
    );

    expect(result.isDuplicate).toBe(false);
    expect(result.action).toBeUndefined();
  });

  test('boundary: gap of exactly 45.0 days rolls forward (comparison is inclusive <=)', async () => {
    const listingStart = new Date();
    mockFindMany.mockResolvedValueOnce([
      {
        id: 'sale-boundary-eq',
        title: CANDIDATE_TITLE,
        startDate: new Date(listingStart.getTime() - 46 * DAY_MS),
        endDate: new Date(listingStart.getTime() - 45 * DAY_MS), // exactly 45 days before listing start
      },
    ]);

    const result = await checkDuplicate(
      {
        title: INCOMING_TITLE,
        city: 'Wyoming',
        state: 'MI',
        startDate: listingStart,
        endDate: new Date(listingStart.getTime() + DAY_MS),
      },
      'Facebook Events',
      ''
    );

    expect(result.isDuplicate).toBe(true);
    expect(result.action).toBe('rollForward');
    expect(result.existingSaleId).toBe('sale-boundary-eq');
  });

  test('boundary: gap of 45.5 days (just over the max) does NOT roll forward', async () => {
    const listingStart = new Date();
    mockFindMany.mockResolvedValueOnce([
      {
        id: 'sale-boundary-over',
        title: CANDIDATE_TITLE,
        startDate: new Date(listingStart.getTime() - 47 * DAY_MS),
        endDate: new Date(listingStart.getTime() - 45.5 * DAY_MS), // 45.5 days before listing start
      },
    ]);

    const result = await checkDuplicate(
      {
        title: INCOMING_TITLE,
        city: 'Wyoming',
        state: 'MI',
        startDate: listingStart,
        endDate: new Date(listingStart.getTime() + DAY_MS),
      },
      'Facebook Events',
      ''
    );

    expect(result.isDuplicate).toBe(false);
    expect(result.action).toBeUndefined();
  });
});

// Note: Tiers 1-5 (sourceUrl/sourceItemId/address/geo-based matches) still
// require full DB fixtures for integration-style testing.
// For integration tests of checkDuplicate(), use a test database fixture.
describe('checkDuplicate integration notes', () => {
  test('checkDuplicate() requires Prisma DB connection', () => {
    // Mock or use test database for full integration testing
    // Example test would:
    // 1. Create a sale with lat/lng and address
    // 2. Call checkDuplicate() with similar listing
    // 3. Verify isDuplicate=true with appropriate reason
    expect(true).toBe(true);
  });
});
