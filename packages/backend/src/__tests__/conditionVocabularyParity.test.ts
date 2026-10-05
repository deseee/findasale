/**
 * U4 (one condition vocabulary), non-controller half. Pins:
 *   1. first push (ebayController mapGradeToInventoryCondition) equals desiredEbayCondition for EVERY row of the
 *      unified table (the wrapper is thin, so the two can never drift);
 *   2. golden marketplace strings for the canonical four conditions (and null): these are the strings that shipped
 *      before U4 and must not change;
 *   3. legacy values (LIKE_NEW, GOOD, FAIR, POOR, EXCELLENT, casing) follow normalizeCondition in every mapper.
 * Prisma and token crypto are mocks; no network.
 */
jest.mock('../lib/prisma', () => ({ prisma: {} }));
jest.mock('../utils/tokenCrypto', () => ({ encryptToken: (x: string) => x, decryptToken: (x: string) => x }));

import * as fs from 'fs';
import * as path from 'path';
import { mapGradeToInventoryCondition } from '../controllers/ebayController';
import { mapConditionForFacebook, mapConditionForCommerceManager } from '../controllers/exportController';
import { facebookMarketplaceCondition, facebookCommerceCondition } from '../utils/marketplaceCondition';
import { desiredEbayCondition, normalizeCondition } from '../utils/conditionMapping';
import { mapConditionToEbayString, mapConditionLabel } from '../services/exportService';
import { conditionToSchemaOrg } from '../services/syndicationFormatterService';
import { resolveDiscogsCondition } from '../services/marketplace/discogsListingConnector';
import { resolveReverbConditionUuid } from '../services/marketplace/reverbConnector';
import { buildEtsyConditionLine, ETSY_GRADE_LABELS } from '../services/marketplace/etsyMapping';
import { buildImportItem, IMPORT_VALID_CONDITIONS } from '../services/itemCsvImport';
import { SalvationArmyAdapter } from '../services/pricingEngine/adapters/salvationArmy';

const CONDITIONS: Array<string | null> = [null, 'NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR'];
const GRADES: Array<string | null> = [null, 'S', 'A', 'B', 'C', 'D'];

describe('first push equals desiredEbayCondition (unified table parity)', () => {
  const rows: Array<[string | null, string | null]> = [];
  for (const c of CONDITIONS) for (const g of GRADES) rows.push([c, g]);

  it.each(rows)('condition %p, grade %p', (condition: string | null, grade: string | null) => {
    expect(mapGradeToInventoryCondition(grade, condition)).toBe(desiredEbayCondition(condition, grade));
  });

  it('keeps the (grade, condition) argument order and an optional condition', () => {
    expect(mapGradeToInventoryCondition('B', 'USED')).toBe('USED_VERY_GOOD');
    expect(mapGradeToInventoryCondition('C')).toBe('USED_GOOD');
    expect(mapGradeToInventoryCondition(null)).toBe('USED_GOOD');
    expect(mapGradeToInventoryCondition(undefined, undefined)).toBe('USED_GOOD');
  });

  it('spot checks of the approved table', () => {
    expect(mapGradeToInventoryCondition('A', 'NEW')).toBe('NEW');
    expect(mapGradeToInventoryCondition('D', 'PARTS_OR_REPAIR')).toBe('FOR_PARTS_OR_NOT_WORKING');
    expect(mapGradeToInventoryCondition('A', 'REFURBISHED')).toBe('SELLER_REFURBISHED');
    expect(mapGradeToInventoryCondition('S', 'USED')).toBe('USED_VERY_GOOD');
    expect(mapGradeToInventoryCondition('D', 'USED')).toBe('USED_ACCEPTABLE');
  });

  it('legacy LIKE_NEW first-pushes as used grade A when no grade is stored', () => {
    expect(mapGradeToInventoryCondition(null, 'LIKE_NEW')).toBe('USED_VERY_GOOD');
    expect(mapGradeToInventoryCondition('C', 'LIKE_NEW')).toBe('USED_GOOD');
  });
});

describe('golden marketplace strings for the canonical conditions (unchanged by U4)', () => {
  // [condition, Facebook Marketplace, Commerce Manager, eBay Seller Hub CSV, Amazon/Facebook CSV label, schema.org, Discogs, Reverb name, Etsy label]
  type Gold = [string | null, string, string, string, string, string | undefined, string, string, string | undefined];
  const GOLD: Gold[] = [
    ['NEW', 'New', 'new', 'New', 'New', 'https://schema.org/NewCondition', 'Mint (M)', 'Brand New', 'New'],
    ['USED', 'Used - Good', 'used_good', 'Used', 'Used', 'https://schema.org/UsedCondition', 'Very Good Plus (VG+)', 'Good', 'Pre-owned'],
    ['REFURBISHED', 'Used - Like New', 'used_like_new', 'Manufacturer refurbished', 'Refurbished', 'https://schema.org/RefurbishedCondition', 'Near Mint (NM or M-)', 'Excellent', 'Refurbished'],
    ['PARTS_OR_REPAIR', 'Used - Fair', 'used_fair', 'For parts or not working', 'Parts or Not Working', 'https://schema.org/DamagedCondition', 'Poor (P)', 'Non functioning', 'For parts or repair'],
    [null, 'Used - Good', 'used', 'Used', 'Used', undefined, 'Good (G)', 'Good', undefined],
  ];

  const REVERB_UUID_TO_NAME: Record<string, string> = {
    '7c3f45de-2ae0-4c81-8400-fdb6b1d74890': 'Brand New',
    'f7a3f48c-972a-44c6-b01a-0cd27488d3f6': 'Good',
    'df268ad1-c462-4ba6-b6db-e007e23922ea': 'Excellent',
    'fbf35668-96a0-4baa-bcde-ab18d6b1b329': 'Non functioning',
  };
  const reverbName = async (c: string | null): Promise<string | undefined> =>
    REVERB_UUID_TO_NAME[await resolveReverbConditionUuid('token', c)];
  const etsyLabel = (c: string | null): string | undefined => {
    const m = buildEtsyConditionLine({ condition: c }).match(/^Condition: (.*)\.$/);
    return m ? m[1] : undefined;
  };

  beforeEach(() => {
    // Force the Reverb fallback UUID table (the live listing_conditions call is not reachable in tests).
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false });
  });

  it.each(GOLD)('%p', async (c, fb, cm, ebayCsv, label, schema, discogs, reverb, etsy) => {
    expect(mapConditionForFacebook(c)).toBe(fb);
    expect(facebookMarketplaceCondition(c)).toBe(fb);
    expect(mapConditionForCommerceManager(c)).toBe(cm);
    expect(facebookCommerceCondition(c)).toBe(cm);
    expect(mapConditionToEbayString(c)).toBe(ebayCsv);
    expect(mapConditionLabel(c)).toBe(label);
    expect(conditionToSchemaOrg(c)).toBe(schema);
    expect(resolveDiscogsCondition(c)).toBe(discogs);
    expect(await reverbName(c)).toBe(reverb);
    expect(etsyLabel(c)).toBe(etsy);
  });

  it('CSV import keeps the canonical four and still lists them', () => {
    expect(IMPORT_VALID_CONDITIONS).toEqual(['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR']);
    for (const c of IMPORT_VALID_CONDITIONS) {
      const r: any = buildImportItem({ title: 'x', price: '1', condition: c }, { tier: 'SIMPLE' } as any);
      expect(r.ok).toBe(true);
      expect(r.data.condition).toBe(c);
    }
  });

  it('Salvation Army FMV rows for the canonical conditions are unchanged', async () => {
    const sa = new SalvationArmyAdapter();
    const price = async (condition?: string) =>
      (await sa.fetch({ title: 't', category: 'Kitchenware', condition } as any))[0].price;
    expect(await price('NEW')).toBe(300000);
    expect(await price('USED')).toBe(50000);
    expect(await price('REFURBISHED')).toBe(120000);
    expect(await price('PARTS_OR_REPAIR')).toBe(1000);
    expect(await price(undefined)).toBe(50000); // missing condition is USED
  });

  it('Etsy grade labels use the app grade words (S retired, reads as Excellent)', () => {
    expect(ETSY_GRADE_LABELS).toEqual({ S: 'Excellent', A: 'Excellent', B: 'Very good', C: 'Good', D: 'Acceptable' });
    expect(buildEtsyConditionLine({ condition: 'USED', conditionGrade: 'B' })).toBe('Condition: Pre-owned. Grade: B (Very good).');
  });
});

describe('legacy and mixed-case values follow normalizeCondition in every mapper', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false });
  });

  // legacy input -> the canonical condition normalizeCondition resolves it to
  const LEGACY: Array<[string, 'NEW' | 'USED' | 'REFURBISHED' | 'PARTS_OR_REPAIR']> = [
    ['LIKE_NEW', 'USED'],
    ['Like New', 'USED'],
    ['EXCELLENT', 'USED'],
    ['GOOD', 'USED'],
    ['Good', 'USED'],
    ['FAIR', 'USED'],
    ['POOR', 'PARTS_OR_REPAIR'],
    ['new', 'NEW'],
    ['used', 'USED'],
    [' Used ', 'USED'],
    ['SELLER_REFURBISHED', 'REFURBISHED'],
  ];

  it.each(LEGACY)('%p reads as %s', async (legacy, canonical) => {
    expect(normalizeCondition(legacy).condition).toBe(canonical);
    // every mapper gives the same answer as the canonical value it normalizes to
    expect(mapConditionForFacebook(legacy)).toBe(mapConditionForFacebook(canonical));
    expect(mapConditionForCommerceManager(legacy)).toBe(mapConditionForCommerceManager(canonical));
    expect(mapConditionToEbayString(legacy)).toBe(mapConditionToEbayString(canonical));
    expect(mapConditionLabel(legacy)).toBe(mapConditionLabel(canonical));
    expect(conditionToSchemaOrg(legacy)).toBe(conditionToSchemaOrg(canonical));
    expect(resolveDiscogsCondition(legacy)).toBe(resolveDiscogsCondition(canonical));
    expect(await resolveReverbConditionUuid('t', legacy)).toBe(await resolveReverbConditionUuid('t', canonical));
    expect(buildEtsyConditionLine({ condition: legacy })).toBe(buildEtsyConditionLine({ condition: canonical }));
    const imp: any = buildImportItem({ title: 'x', price: '1', condition: legacy }, { tier: 'SIMPLE' } as any);
    expect(imp.data.condition).toBe(canonical);
    const sa = new SalvationArmyAdapter();
    const fmv = async (c: string) => (await sa.fetch({ title: 't', category: 'Kitchenware', condition: c } as any))[0].price;
    expect(await fmv(legacy)).toBe(await fmv(canonical));
  });

  it('LIKE_NEW is no longer treated as NEW anywhere (it is used goods, hint grade A)', () => {
    expect(mapConditionForFacebook('LIKE_NEW')).toBe('Used - Good');
    expect(mapConditionForCommerceManager('LIKE_NEW')).toBe('used_good');
    expect(mapConditionToEbayString('LIKE_NEW')).toBe('Used');
    expect(desiredEbayCondition('LIKE_NEW', null)).toBe('USED_VERY_GOOD');
  });

  it('unrecognized values keep the old defaults', async () => {
    expect(mapConditionForFacebook('MINT')).toBe('Used - Good');
    expect(mapConditionForCommerceManager('MINT')).toBe('used');
    expect(mapConditionToEbayString('MINT')).toBe('Used');
    expect(conditionToSchemaOrg('MINT')).toBeUndefined();
    expect(resolveDiscogsCondition('MINT')).toBe('Good (G)');
    const sa = new SalvationArmyAdapter();
    const r = await sa.fetch({ title: 't', category: 'Kitchenware', condition: 'MINT' } as any);
    expect(r[0].price).toBe(50); // no table row: absolute floor, as before
    const bad: any = buildImportItem({ title: 'x', price: '1', condition: 'mint' }, { tier: 'SIMPLE' } as any);
    expect(bad.data.condition).toBeNull();
  });
});

describe('wiring (source checks for modules too heavy to import)', () => {
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

  it('extensionController uses the shared Facebook helper, not its own switch', () => {
    const src = read('controllers/extensionController.ts');
    expect(src).toContain("import { facebookMarketplaceCondition as toFacebookCondition } from '../utils/marketplaceCondition'");
    expect(src).not.toContain('function toFacebookCondition');
  });

  it('reanalyzeService uses desiredEbayCondition instead of a local condMap', () => {
    const src = read('services/reanalyzeService.ts');
    expect(src).toContain('desiredEbayCondition(');
    expect(src).not.toContain("USED: 'USED_GOOD'");
  });

  it('ebayController first push is a one-line wrapper over desiredEbayCondition', () => {
    const src = read('controllers/ebayController.ts');
    expect(src).toContain('return desiredEbayCondition(condition, grade);');
    expect(src).not.toContain("case 'S': return 'NEW';");
  });
});
