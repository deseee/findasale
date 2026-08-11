/**
 * (roadmap #624) Unit tests for the eBay Standard Envelope policy matcher in
 * utils/ebayPolicyParser.ts.
 *
 * Pure functions only -- no Prisma, no eBay call, no service imports -- so this runs under
 * the existing `pnpm --filter ./packages/backend test` Jest config (testMatch
 * `**\/__tests__\/**\/*.test.ts`) with no environment setup.
 *
 * The policy names below are REAL policies read from organizer Artifact's live eBay
 * account (verified 2026-08-11), not invented examples.
 */

import {
  classifyPolicy,
  parsePriceFromPolicyName,
  parsePriceCapFromPolicyName,
  parseStandardEnvelopePolicies,
  matchStandardEnvelopePolicy,
  parseWeightTiers,
  EbayFulfillmentPolicySummary,
} from '../ebayPolicyParser';

const ARTIFACT_POLICIES: EbayFulfillmentPolicySummary[] = [
  { fulfillmentPolicyId: '295437457011', name: '1oz under $20 Ebay Std Env $1.03' },
  { fulfillmentPolicyId: '295437466011', name: '2oz under $20 Ebay Std Env $1.32' },
  { fulfillmentPolicyId: '295437479011', name: '3oz under $20 Ebay Std Env $1.65' },
  { fulfillmentPolicyId: '295316314011', name: 'Free Std Env under $20' },
  { fulfillmentPolicyId: '111111111111', name: '8oz Ground Advantage $6.99' },
  { fulfillmentPolicyId: '222222222222', name: 'Local Pickup ONLY' },
];

describe('classifyPolicy — standard-envelope', () => {
  it('classifies real Std Env policy names distinctly from weight tiers', () => {
    expect(classifyPolicy('3oz under $20 Ebay Std Env $1.65')).toBe('standard-envelope');
    expect(classifyPolicy('1oz under $20 Ebay Std Env $1.03')).toBe('standard-envelope');
    expect(classifyPolicy('Free Std Env under $20')).toBe('standard-envelope');
    expect(classifyPolicy('2oz Standard Envelope $1.32')).toBe('standard-envelope');
  });

  it('leaves ordinary weight-tier / pickup / free policies untouched', () => {
    expect(classifyPolicy('8oz Ground Advantage $6.99')).toBe('weight-tier');
    expect(classifyPolicy('1+ lb Ground Advantage $12.49')).toBe('weight-tier');
    expect(classifyPolicy('Local Pickup ONLY')).toBe('local-pickup');
    expect(classifyPolicy('Free Domestic Shipping')).toBe('free-shipping');
  });

  it('keeps envelope policies OUT of the generic weight-tier ladder', () => {
    const tiers = parseWeightTiers(ARTIFACT_POLICIES);
    expect(tiers.map((t) => t.policyId)).toEqual(['111111111111']);
  });
});

describe('price / cap parsing', () => {
  it('reads the RATE as the last dollar amount, not the eligibility cap', () => {
    expect(parsePriceFromPolicyName('3oz under $20 Ebay Std Env $1.65')).toBe(1.65);
  });

  it('reads the CAP from "under $X"', () => {
    expect(parsePriceCapFromPolicyName('3oz under $20 Ebay Std Env $1.65')).toBe(20);
    expect(parsePriceCapFromPolicyName('8oz Ground Advantage $6.99')).toBeNull();
  });

  it('never mistakes a lone cap for a rate ("Free Std Env under $20")', () => {
    const parsed = parseStandardEnvelopePolicies([
      { fulfillmentPolicyId: 'free', name: 'Free Std Env under $20' },
    ]);
    // No parseable ounce tier -> excluded entirely; it must never be routed to by weight.
    expect(parsed).toHaveLength(0);
  });
});

describe('parseStandardEnvelopePolicies', () => {
  it('parses only the real envelope tiers, sorted by weight', () => {
    const parsed = parseStandardEnvelopePolicies(ARTIFACT_POLICIES);
    expect(parsed.map((p) => [p.maxOz, p.rateUsd, p.priceCapUsd])).toEqual([
      [1, 1.03, 20],
      [2, 1.32, 20],
      [3, 1.65, 20],
    ]);
  });
});

describe('matchStandardEnvelopePolicy', () => {
  it('picks the exact tier for a whole-ounce item', () => {
    const m = matchStandardEnvelopePolicy(2, 12.5, ARTIFACT_POLICIES);
    expect(m?.policyId).toBe('295437466011');
    expect(m?.rateUsd).toBe(1.32);
  });

  it('rounds a fractional weight UP to the next tier (never undercharges)', () => {
    const m = matchStandardEnvelopePolicy(1.4, 12.5, ARTIFACT_POLICIES);
    expect(m?.policyId).toBe('295437466011'); // 2oz, not 1oz
  });

  it('falls up to the smallest COVERING tier when the exact one is missing', () => {
    const only3oz = [ARTIFACT_POLICIES[2]];
    const m = matchStandardEnvelopePolicy(1, 5, only3oz);
    expect(m?.policyId).toBe('295437479011');
  });

  it('returns null when the item price is at/over the policy cap', () => {
    expect(matchStandardEnvelopePolicy(2, 20, ARTIFACT_POLICIES)).toBeNull();
    expect(matchStandardEnvelopePolicy(2, 25, ARTIFACT_POLICIES)).toBeNull();
  });

  it('fails closed when the price is unknown', () => {
    expect(matchStandardEnvelopePolicy(2, null, ARTIFACT_POLICIES)).toBeNull();
  });

  it('returns null above eBay\'s 3oz envelope ceiling', () => {
    expect(matchStandardEnvelopePolicy(4, 10, ARTIFACT_POLICIES)).toBeNull();
  });

  it('returns null for a zero/negative weight', () => {
    expect(matchStandardEnvelopePolicy(0, 10, ARTIFACT_POLICIES)).toBeNull();
  });

  it('returns null when the organizer has no envelope policies configured', () => {
    const noEnvelope = ARTIFACT_POLICIES.filter((p) => !/std env/i.test(p.name));
    expect(matchStandardEnvelopePolicy(2, 10, noEnvelope)).toBeNull();
    expect(matchStandardEnvelopePolicy(2, 10, [])).toBeNull();
  });

  it('takes the cheaper policy when two cover the same tier', () => {
    const dupes: EbayFulfillmentPolicySummary[] = [
      { fulfillmentPolicyId: 'pricey', name: '3oz under $20 Ebay Std Env $2.20' },
      { fulfillmentPolicyId: 'cheap', name: '3oz under $20 Ebay Std Env $1.65' },
    ];
    expect(matchStandardEnvelopePolicy(3, 10, dupes)?.policyId).toBe('cheap');
  });
});
