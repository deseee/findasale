/**
 * Zone-9 tiering for eBay fulfillment policies: tier math, price-basis naming, ship-to
 * exclusions, seller AK/HI/PR rate-table lookup (fail-safe to T4), and (price, tier, basis)
 * policy selection / adoption rules in ensureFvfFlatRatePolicy + ensureCalculatedPolicyWithHandling.
 */
const mockFindUnique = jest.fn();
const mockCheapest = jest.fn();

jest.mock('../lib/prisma', () => ({
  prisma: { organizer: { findUnique: (...a: any[]) => mockFindUnique(...a) } },
}));
jest.mock('../services/ebayHttp', () => ({ refreshEbayAccessToken: jest.fn() }));
jest.mock('../services/ebayRateEstimateService', () => ({
  computeCheapestForOrigin: (...a: any[]) => mockCheapest(...a),
  EBAY_SHIPPING_FVF_RATE: 0.136,
  MIN_CALCULATED_HANDLING_CHARGE: 1,
  ShippingHardBlockError: class ShippingHardBlockError extends Error {},
  DIM_DIVISOR_USPS: 139,
  USPS_CUBIC_MAX_CU_IN: 1728,
  USPS_CUBIC_RATE_TABLE: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map((m) => ({ maxCuFt: m, tierLabel: `GA Cubic ${m.toFixed(1)}` })),
  billableLb: (
    weightOz: number,
    dims: { length?: number | null; width?: number | null; height?: number | null } | null,
    divisor: number,
    minVol?: number
  ) => {
    const L = Number(dims?.length) || 0, W = Number(dims?.width) || 0, H = Number(dims?.height) || 0;
    const dimOz = L > 0 && W > 0 && H > 0 && (minVol == null || L * W * H > minVol) ? ((L * W * H) / divisor) * 16 : 0;
    return { lb: Math.max(weightOz, dimOz, 1) / 16, basis: 'actual' };
  },
}));

import {
  zone9Tier,
  zone9TierForPackage,
  buildFlatPolicyName,
  flatPolicyNameCandidates,
  shipToLocationsForTier,
  DEFAULT_EXCLUDED_SHIP_TO,
  ensureFvfFlatRatePolicy,
  weightBandText,
  cubicRungText,
  priceBasisFromCheapest,
  ZONE9_RATE_TABLES,
  zone9TierSuffix,
  clearZone9RateTableCache,
} from '../services/ebayFlatRatePolicyService';
import type { PriceBasis } from '../services/ebayFlatRatePolicyService';
import { ensureCalculatedPolicyWithHandling } from '../services/ebayCalculatedPolicyService';
import { parsePriceFromPolicyName, classifyPolicy } from '../utils/ebayPolicyParser';

const cubic = (label: string) => priceBasisFromCheapest({ carrier: 'USPS', basis: 'cubic', cubicTierLabel: label }, 16, null) as PriceBasis;

describe('zone9Tier', () => {
  it.each([
    [0.5, 0.2, 'T1'], [2, 1, 'T1'], [2.01, 1, 'T2'], [6, 1, 'T2'],
    [6.01, 1, 'T3'], [20, 1, 'T3'], [20.01, 1, 'T4'], [1, 1.01, 'T4'],
    [NaN, 0.5, 'T4'], [1, NaN, 'T4'], [0, 0.5, 'T4'],
  ])('lb=%s cuFt=%s -> %s', (lb, cu, tier) => {
    expect(zone9Tier(lb as number, cu as number)).toBe(tier);
  });
});

describe('zone9TierForPackage', () => {
  it('light small box is T1', () => {
    expect(zone9TierForPackage(16, { length: 10, width: 8, height: 4 })).toBe('T1');
  });
  it('missing weight or dims is T4', () => {
    expect(zone9TierForPackage(0, { length: 10, width: 8, height: 4 })).toBe('T4');
    expect(zone9TierForPackage(16, null)).toBe('T4');
    expect(zone9TierForPackage(16, { length: 10, width: 8, height: null })).toBe('T4');
  });
  it('over 1 cu ft is T4 even when light', () => {
    expect(zone9TierForPackage(16, { length: 13, width: 12, height: 12 })).toBe('T4'); // 1872 cu in
  });
  it('heavy is T4', () => {
    expect(zone9TierForPackage(21 * 16, { length: 10, width: 8, height: 4 })).toBe('T4');
  });
});

describe('rate table constant drives the name suffix', () => {
  it('suffix derives from ZONE9_RATE_TABLES', () => {
    expect(ZONE9_RATE_TABLES.T1).toEqual({ tableName: 'T1 up to 2 lb AK HI PR surcharge 4.99', surchargeUsd: 4.99 });
    expect(ZONE9_RATE_TABLES.T2).toEqual({ tableName: 'T2 3 to 6 lb AK HI PR surcharge 9.99', surchargeUsd: 9.99 });
    expect(ZONE9_RATE_TABLES.T3).toEqual({ tableName: 'T3 7 to 20 lb AK HI PR surcharge 11.99', surchargeUsd: 11.99 });
    expect(zone9TierSuffix('T1')).toBe(' | AK/HI/PR +$4.99');
    expect(zone9TierSuffix('T2')).toBe(' | AK/HI/PR +$9.99');
    expect(zone9TierSuffix('T3')).toBe(' | AK/HI/PR +$11.99');
    expect(zone9TierSuffix('T4')).toBe('');
  });
});

describe('weightBandText boundaries', () => {
  it.each([
    [0.06, 'Under 1 lb'], [0.99, 'Under 1 lb'], [1, '1 lb'],
    [1.01, 'Over 1 to 2 lb'], [2, 'Over 1 to 2 lb'], [2.06, 'Over 2 to 3 lb'],
    [3, 'Over 2 to 3 lb'], [19.5, 'Over 19 to 20 lb'], [20, 'Over 19 to 20 lb'],
  ])('%s lb -> %s', (lb, text) => {
    expect(weightBandText(lb as number)).toBe(text);
  });
});

describe('cubicRungText', () => {
  it('first rung is "Up to", later rungs are prev-max', () => {
    expect(cubicRungText('GA Cubic 0.1')?.text).toBe('Up to 0.1 cu ft');
    expect(cubicRungText('GA Cubic 0.2')?.text).toBe('0.1-0.2 cu ft');
    expect(cubicRungText('GA Cubic 0.6')?.text).toBe('0.5-0.6 cu ft');
    expect(cubicRungText('GA Cubic 1.0')?.text).toBe('0.9-1 cu ft');
  });
  it('unknown label -> null', () => {
    expect(cubicRungText('nope')).toBeNull();
    expect(cubicRungText(null)).toBeNull();
  });
});

describe('priceBasisFromCheapest', () => {
  const dims = { length: 10, width: 8, height: 4 };
  it('cubic win', () => {
    expect(cubic('GA Cubic 0.2')).toMatchObject({ kind: 'cubic', text: '0.1-0.2 cu ft', key: 'cubic:0.2' });
  });
  it('USPS weight win uses the bare band', () => {
    expect(priceBasisFromCheapest({ carrier: 'USPS', basis: 'actual' }, 40, dims)).toMatchObject({ kind: 'weight', text: 'Over 2 to 3 lb' });
    expect(priceBasisFromCheapest({ carrier: 'USPS', basis: 'actual' }, 8, dims)).toMatchObject({ text: 'Under 1 lb' });
    expect(priceBasisFromCheapest({ carrier: 'USPS', basis: 'actual' }, 16, dims)).toMatchObject({ text: '1 lb' });
  });
  it('UPS / FedEx win prefix the carrier word', () => {
    expect(priceBasisFromCheapest({ carrier: 'UPS', basis: 'actual' }, 24, null)?.text).toBe('UPS over 1 to 2 lb');
    expect(priceBasisFromCheapest({ carrier: 'FEDEX', basis: 'actual' }, 8, null)?.text).toBe('FedEx under 1 lb');
    expect(priceBasisFromCheapest({ carrier: 'FEDEX', basis: 'actual' }, 16, null)?.text).toBe('FedEx 1 lb');
    // UPS/FedEx bill dimensional weight at every size: 10x8x4in = 2.3 lb dim weight > 1.5 lb actual.
    expect(priceBasisFromCheapest({ carrier: 'UPS', basis: 'dimensional' }, 24, dims)?.text).toBe('UPS over 2 to 3 lb');
  });
  it('different bases never share a key', () => {
    const a = priceBasisFromCheapest({ carrier: 'USPS', basis: 'actual' }, 40, dims);
    const b = priceBasisFromCheapest({ carrier: 'UPS', basis: 'actual' }, 40, dims);
    expect(a?.key).not.toBe(b?.key);
    expect(a?.key).not.toBe(cubic('GA Cubic 0.2').key);
  });
  it('null cheapest -> null', () => {
    expect(priceBasisFromCheapest(null, 16, dims)).toBeNull();
  });
});

describe('policy naming + exclusions', () => {
  it('cubic names carry tier label + rung range', () => {
    expect(buildFlatPolicyName('T2', '13.99', cubic('GA Cubic 0.2'))).toBe('3-6 lb | 0.1-0.2 cu ft | Flat $13.99 | AK/HI/PR +$9.99');
    expect(buildFlatPolicyName('T1', '9.99', cubic('GA Cubic 0.1'))).toBe('Up to 2 lb | Up to 0.1 cu ft | Flat $9.99 | AK/HI/PR +$4.99');
  });
  it('weight names carry only the band', () => {
    const usps: PriceBasis = { kind: 'weight', key: 'USPS:Over 2 to 3 lb', text: 'Over 2 to 3 lb' };
    expect(buildFlatPolicyName('T2', '18.99', usps)).toBe('Over 2 to 3 lb | Flat $18.99 | AK/HI/PR +$9.99');
    const under: PriceBasis = { kind: 'weight', key: 'USPS:Under 1 lb', text: 'Under 1 lb' };
    expect(buildFlatPolicyName('T1', '9.99', under)).toBe('Under 1 lb | Flat $9.99 | AK/HI/PR +$4.99');
    const ups: PriceBasis = { kind: 'weight', key: 'UPS:Over 1 to 2 lb', text: 'UPS over 1 to 2 lb' };
    expect(buildFlatPolicyName('T1', '19.99', ups)).toBe('UPS over 1 to 2 lb | Flat $19.99 | AK/HI/PR +$4.99');
  });
  it('T4 is unchanged and ignores basis', () => {
    expect(buildFlatPolicyName('T4', '49.99', null)).toBe('Lower 48 only | Flat $49.99');
    expect(buildFlatPolicyName('T4', '49.99', cubic('GA Cubic 0.2'))).toBe('Lower 48 only | Flat $49.99');
  });
  it('no basis falls back to the bare tier label', () => {
    expect(buildFlatPolicyName('T3', '27.99', null)).toBe('7-20 lb | Flat $27.99 | AK/HI/PR +$11.99');
  });
  it('worst-case names stay within 64 chars and never lose the AK/HI/PR suffix', () => {
    const fedex: PriceBasis = { kind: 'weight', key: 'k', text: 'FedEx over 19 to 20 lb' };
    const long: PriceBasis = { kind: 'weight', key: 'k2', text: 'Media Mail over 19 to 20 lb with a silly extra long qualifier' };
    for (const t of ['T1', 'T2', 'T3'] as const) {
      for (const b of [fedex, long, cubic('GA Cubic 1.0'), null]) {
        for (const price of ['9.99', '199.99', '1234567.99']) {
          const n = buildFlatPolicyName(t, price, b);
          expect(n.length).toBeLessThanOrEqual(64);
          expect(n.endsWith(zone9TierSuffix(t))).toBe(true);
          expect(n).toContain(`Flat $${price}`.slice(0, 8));
        }
      }
    }
    expect(buildFlatPolicyName('T3', '199.99', fedex)).toBe('FedEx over 19 to 20 lb | Flat $199.99 | AK/HI/PR +$11.99');
  });
  it('only T4 adopts the legacy name; T1-T3 never the old tier-only name', () => {
    expect(flatPolicyNameCandidates('T4', '49.99', null)).toEqual(['Lower 48 only | Flat $49.99', 'FindA.Sale Flat $49.99']);
    expect(flatPolicyNameCandidates('T1', '12.49', cubic('GA Cubic 0.2'))).toEqual(['Up to 2 lb | 0.1-0.2 cu ft | Flat $12.49 | AK/HI/PR +$4.99']);
  });
  it('T4 keeps full exclusions; T1-T3 exclude only APO/FPO', () => {
    expect(shipToLocationsForTier('T4')).toBe(DEFAULT_EXCLUDED_SHIP_TO);
    for (const t of ['T1', 'T2', 'T3'] as const) {
      expect(shipToLocationsForTier(t).regionExcluded).toEqual([{ regionName: 'APO/FPO' }]);
    }
  });
});

describe('ensureFvfFlatRatePolicy / ensureCalculatedPolicyWithHandling (rate tables)', () => {
  const realFetch = (global as any).fetch;
  const dims = { length: 10, width: 8, height: 4 };
  let posted: any[];
  let existingPolicies: any[];
  let rateTables: any[] | 'FAIL';
  let rateTableGets: number;

  const allTables = () => [
    { rateTableId: 'rt-t1', name: ZONE9_RATE_TABLES.T1.tableName, locality: 'DOMESTIC', countryCode: 'US' },
    { rateTableId: 'rt-t2', name: ZONE9_RATE_TABLES.T2.tableName, locality: 'DOMESTIC', countryCode: 'US' },
    { rateTableId: 'rt-t3', name: ZONE9_RATE_TABLES.T3.tableName, locality: 'DOMESTIC', countryCode: 'US' },
    { rateTableId: 'rt-other', name: 'Some other table', locality: 'DOMESTIC', countryCode: 'US' },
  ];
  const cubicCheapest = { rate: 8, carrier: 'USPS', basis: 'cubic', cubicTierLabel: 'GA Cubic 0.2' };

  beforeEach(() => {
    posted = [];
    existingPolicies = [];
    rateTables = allTables();
    rateTableGets = 0;
    clearZone9RateTableCache();
    mockFindUnique.mockReset().mockResolvedValue({ lat: 1, lng: 2, ebayConnection: { accessToken: 't', handlingTimeDays: 3 } });
    mockCheapest.mockReset().mockResolvedValue(cubicCheapest);
    (global as any).fetch = jest.fn(async (url: string, init?: any) => {
      if (init?.method === 'POST') {
        posted.push(JSON.parse(init.body));
        return { ok: true, status: 200, json: async () => ({ fulfillmentPolicyId: 'new-' + posted.length }), clone: () => ({ text: async () => '' }), text: async () => '' };
      }
      if (String(url).includes('rate_table')) {
        rateTableGets++;
        if (rateTables === 'FAIL') return { ok: false, status: 500, json: async () => ({}), text: async () => 'boom' };
        return { ok: true, status: 200, json: async () => ({ rateTables }) };
      }
      return { ok: true, status: 200, json: async () => ({ fulfillmentPolicies: existingPolicies }) };
    });
  });
  afterAll(() => { (global as any).fetch = realFetch; jest.restoreAllMocks(); });

  it('table found -> rateTableId on the domestic option + light exclusions + cubic name', async () => {
    const r = await ensureFvfFlatRatePolicy('org-t1', 16, dims, '49079');
    expect(r?.policyId).toBe('new-1');
    expect(posted[0].name).toMatch(/^Up to 2 lb \| 0\.1-0\.2 cu ft \| Flat \$\d+\.\d\d \| AK\/HI\/PR \+\$4\.99$/);
    expect(posted[0].shippingOptions[0].optionType).toBe('DOMESTIC');
    expect(posted[0].shippingOptions[0].rateTableId).toBe('rt-t1');
    expect(posted[0].shipToLocations.regionExcluded).toEqual([{ regionName: 'APO/FPO' }]);
  });

  it('T2 resolves the T2 table; weight-ladder win names the band', async () => {
    mockCheapest.mockResolvedValue({ rate: 8, carrier: 'USPS', basis: 'actual' });
    await ensureFvfFlatRatePolicy('org-t2', 40, dims, '49079'); // 2.5 lb -> T2
    expect(posted[0].name).toMatch(/^Over 2 to 3 lb \| Flat \$\d+\.\d\d \| AK\/HI\/PR \+\$9\.99$/);
    expect(posted[0].shippingOptions[0].rateTableId).toBe('rt-t2');
  });

  it('UPS win names the carrier', async () => {
    mockCheapest.mockResolvedValue({ rate: 8, carrier: 'UPS', basis: 'actual' });
    await ensureFvfFlatRatePolicy('org-ups', 24, dims, '49079'); // 1.5 lb actual -> T1; UPS dim weight 2.3 lb
    expect(posted[0].name).toMatch(/^UPS over 2 to 3 lb \| Flat \$\d+\.\d\d \| AK\/HI\/PR \+\$4\.99$/);
  });

  it('lookup fails -> falls back to T4: full exclusions, T4 name, NO rateTableId', async () => {
    rateTables = 'FAIL';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await ensureFvfFlatRatePolicy('org-fail', 16, dims, '49079');
    expect(r).not.toBeNull();
    expect(posted[0].name).toMatch(/^Lower 48 only \| Flat \$/);
    expect(posted[0].shipToLocations).toEqual(DEFAULT_EXCLUDED_SHIP_TO);
    expect(posted[0].shippingOptions[0].rateTableId).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('table missing from the seller list -> falls back to T4', async () => {
    rateTables = allTables().filter((t) => t.rateTableId !== 'rt-t1');
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await ensureFvfFlatRatePolicy('org-missing', 16, dims, '49079');
    expect(posted[0].name).toMatch(/^Lower 48 only \| Flat \$/);
    expect(posted[0].shipToLocations).toEqual(DEFAULT_EXCLUDED_SHIP_TO);
    expect(posted[0].shippingOptions[0].rateTableId).toBeUndefined();
  });

  it('missing dims -> T4 policy with full exclusions and no table lookup', async () => {
    const r = await ensureFvfFlatRatePolicy('org-t4', 16, null, '49079');
    expect(r).not.toBeNull();
    expect(posted[0].name).toMatch(/^Lower 48 only \| Flat \$/);
    expect(posted[0].shipToLocations).toEqual(DEFAULT_EXCLUDED_SHIP_TO);
    expect(rateTableGets).toBe(0);
  });

  it('rate-table cache: one GET per organizer, refetch for a new organizer and after the TTL', async () => {
    await ensureFvfFlatRatePolicy('org-cache', 16, dims, '49079');
    await ensureFvfFlatRatePolicy('org-cache', 40, dims, '49079'); // T2, different policy, same organizer
    expect(rateTableGets).toBe(1);
    await ensureFvfFlatRatePolicy('org-cache-2', 16, dims, '49079');
    expect(rateTableGets).toBe(2);
    const realNow = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(realNow + 11 * 60 * 1000);
    await ensureFvfFlatRatePolicy('org-cache', 30, dims, '49079'); // T1 again after TTL
    expect(rateTableGets).toBe(3);
    spy.mockRestore();
  });

  it('a failed lookup is not retried within 60s but is retried afterwards', async () => {
    rateTables = 'FAIL';
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await ensureFvfFlatRatePolicy('org-retry', 16, dims, '49079');
    await ensureFvfFlatRatePolicy('org-retry', 24, dims, '49079');
    expect(rateTableGets).toBe(1);
    rateTables = allTables();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61 * 1000);
    await ensureFvfFlatRatePolicy('org-retry', 30, dims, '49079');
    expect(rateTableGets).toBe(2);
    expect(posted[posted.length - 1].shippingOptions[0].rateTableId).toBe('rt-t1');
    spy.mockRestore();
  });

  it('policy cache key includes the basis (same price, different basis -> separate policies)', async () => {
    await ensureFvfFlatRatePolicy('org-key', 16, dims, '49079');
    mockCheapest.mockResolvedValue({ rate: 8, carrier: 'USPS', basis: 'actual' });
    await ensureFvfFlatRatePolicy('org-key', 16, dims, '49079');
    expect(posted).toHaveLength(2);
    expect(posted[0].name).not.toBe(posted[1].name);
  });

  it('T4 adopts an existing legacy-named policy instead of creating a duplicate', async () => {
    await ensureFvfFlatRatePolicy('org-probe', 16, null, '49079');
    const rate = (posted[0].name as string).split('$')[1];
    posted = [];
    existingPolicies = [{ fulfillmentPolicyId: 'legacy-1', name: `FindA.Sale Flat $${rate}` }];
    const r = await ensureFvfFlatRatePolicy('org-legacy', 16, null, '49079');
    expect(r?.policyId).toBe('legacy-1');
    expect(posted).toHaveLength(0);
  });

  describe('T1-T3 adoption rules', () => {
    let name: string;
    const policy = (over: Record<string, any> = {}) => ({
      fulfillmentPolicyId: 'exist-1',
      name,
      shipToLocations: { regionExcluded: [{ regionName: 'APO/FPO' }] },
      shippingOptions: [{ optionType: 'DOMESTIC', costType: 'FLAT_RATE', rateTableId: 'rt-t1' }],
      ...over,
    });
    let probeSeq = 0;
    beforeEach(async () => {
      await ensureFvfFlatRatePolicy(`org-probe-adopt-${++probeSeq}`, 16, dims, '49079');
      name = posted[0].name;
      posted = [];
    });

    it('adopts when light AND rateTableId matches', async () => {
      existingPolicies = [policy()];
      const r = await ensureFvfFlatRatePolicy('org-adopt-ok', 16, dims, '49079');
      expect(r?.policyId).toBe('exist-1');
      expect(posted).toHaveLength(0);
    });
    it('does NOT adopt when the response carries no rateTableId', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      existingPolicies = [policy({ shippingOptions: [{ optionType: 'DOMESTIC', costType: 'FLAT_RATE' }] })];
      await ensureFvfFlatRatePolicy('org-adopt-norate', 16, dims, '49079');
      expect(posted).toHaveLength(1);
    });
    it('does NOT adopt when rateTableId differs', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      existingPolicies = [policy({ shippingOptions: [{ optionType: 'DOMESTIC', rateTableId: 'rt-stale' }] })];
      await ensureFvfFlatRatePolicy('org-adopt-stale', 16, dims, '49079');
      expect(posted).toHaveLength(1);
    });
    it('does NOT adopt when exclusions are not light', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      existingPolicies = [policy({ shipToLocations: DEFAULT_EXCLUDED_SHIP_TO })];
      await ensureFvfFlatRatePolicy('org-adopt-heavy', 16, dims, '49079');
      expect(posted).toHaveLength(1);
    });
    it('never adopts the old tier-only name or the legacy name', async () => {
      const price = name.split('Flat $')[1].split(' ')[0];
      existingPolicies = [
        policy({ fulfillmentPolicyId: 'old-tier', name: `Up to 2 lb | Flat $${price} | AK/HI/PR +$4.99` }),
        policy({ fulfillmentPolicyId: 'legacy', name: `FindA.Sale Flat $${price}` }),
      ];
      const r = await ensureFvfFlatRatePolicy('org-adopt-old', 16, dims, '49079');
      expect(r?.policyId).toBe('new-1');
      expect(posted).toHaveLength(1);
    });
  });

  describe('ensureCalculatedPolicyWithHandling', () => {
    it('T1 table found -> basis name, rateTableId on the option, light exclusions', async () => {
      const r = await ensureCalculatedPolicyWithHandling('org-calc', 16, dims, '49079');
      expect(r?.policyId).toBe('new-1');
      expect(posted[0].name).toMatch(/^Up to 2 lb \| 0\.1-0\.2 cu ft \| Calc HC\$\d+\.\d\d \| AK\/HI\/PR \+\$4\.99$/);
      expect(posted[0].name.length).toBeLessThanOrEqual(64);
      expect(posted[0].shippingOptions[0].rateTableId).toBe('rt-t1');
      expect(posted[0].shipToLocations.regionExcluded).toEqual([{ regionName: 'APO/FPO' }]);
    });
    it('lookup fails -> legacy T4 name, full exclusions, no rateTableId', async () => {
      rateTables = 'FAIL';
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      await ensureCalculatedPolicyWithHandling('org-calc-fail', 16, dims, '49079');
      expect(posted[0].name).toMatch(/^FindA\.Sale Calculated HC\$/);
      expect(posted[0].shipToLocations).toEqual(DEFAULT_EXCLUDED_SHIP_TO);
      expect(posted[0].shippingOptions[0].rateTableId).toBeUndefined();
    });
    it('does not adopt an existing T1-T3 calculated policy without the rate table', async () => {
      await ensureCalculatedPolicyWithHandling('org-calc-probe', 16, dims, '49079');
      const name = posted[0].name;
      posted = [];
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      existingPolicies = [{ fulfillmentPolicyId: 'c-1', name, shippingOptions: [{ optionType: 'DOMESTIC', costType: 'CALCULATED' }] }];
      const r = await ensureCalculatedPolicyWithHandling('org-calc-adopt', 16, dims, '49079');
      expect(r?.policyId).toBe('new-1');
      existingPolicies = [{ fulfillmentPolicyId: 'c-2', name, shippingOptions: [{ optionType: 'DOMESTIC', costType: 'CALCULATED', rateTableId: 'rt-t1' }] }];
      const r2 = await ensureCalculatedPolicyWithHandling('org-calc-adopt2', 16, dims, '49079');
      expect(r2?.policyId).toBe('c-2');
    });
  });
});

describe('policy-name parsers understand the new names', () => {
  it('parsePriceFromPolicyName returns the flat price, not the AK/HI/PR surcharge', () => {
    expect(parsePriceFromPolicyName('3-6 lb | 0.1-0.2 cu ft | Flat $13.99 | AK/HI/PR +$9.99')).toBe(13.99);
    expect(parsePriceFromPolicyName('Over 2 to 3 lb | Flat $18.99 | AK/HI/PR +$9.99')).toBe(18.99);
    expect(parsePriceFromPolicyName('UPS over 1 to 2 lb | Flat $19.99 | AK/HI/PR +$4.99')).toBe(19.99);
    expect(parsePriceFromPolicyName('Up to 2 lb | Calc HC$2.10 | AK/HI/PR +$4.99')).toBe(2.1);
    expect(parsePriceFromPolicyName('Lower 48 only | Flat $49.99')).toBe(49.99);
    expect(parsePriceFromPolicyName('FindA.Sale Flat $9.99')).toBe(9.99);
    expect(parsePriceFromPolicyName('1oz under $20 Ebay Std Env $1.03')).toBe(1.03);
  });
  it('tiered calculated names classify as calculated; flat names are never an envelope policy', () => {
    expect(classifyPolicy('Up to 2 lb | 0.1-0.2 cu ft | Calc HC$2.10 | AK/HI/PR +$4.99')).toBe('calculated');
    expect(classifyPolicy('Over 2 to 3 lb | Flat $18.99 | AK/HI/PR +$9.99')).not.toBe('standard-envelope');
    expect(classifyPolicy('Up to 2 lb | Up to 0.1 cu ft | Flat $9.99 | AK/HI/PR +$4.99')).not.toBe('standard-envelope');
  });
});
