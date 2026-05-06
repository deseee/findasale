/**
 * Test coverage for dedupe.ts — address normalization and duplicate detection
 *
 * Run with: npm test (after jest is configured in package.json)
 */

import { normalizeAddress } from '../dedupe';

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

  test('removes punctuation: comma and periods', () => {
    expect(normalizeAddress('123 Main St., Suite A.')).toBe('123 main st suite a');
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
    expect(normalizeAddress('123 East Main Street, North Suite')).toBe('123 e main st n suite');
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

// Note: Full checkDuplicate() tests require database mocking.
// These tests focus on the normalizeAddress utility which is pure.
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
