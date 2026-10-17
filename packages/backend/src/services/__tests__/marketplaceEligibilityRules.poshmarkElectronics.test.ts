/**
 * 2026-10-17: Poshmark electronics narrowing. Poshmark's Prohibited Items Policy lists Electronics as
 * RESTRICTED (factory reset + sign out), not prohibited, so ordinary electronics and cameras/photo gear
 * must be eligible. Also proves publish-time and takedown-time gates build the SAME eligibility object
 * (ebayCategoryName wins over a breadcrumb Item.category), so they cannot disagree.
 */
jest.mock('../../lib/prisma', () => ({ prisma: {} }));

import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { checkEligibility, buildListingEligibilityItem } from '../marketplaceEligibilityRules';

const posh = (title: string, category: string) =>
  checkEligibility('POSHMARK', { category, ebayCategoryId: null, title }).eligible;

describe('POSHMARK electronics are eligible', () => {
  it('Vivitar flash in Cameras & Photo is eligible', () => {
    expect(posh('Vivitar 2500 Zoom Thyristor Electronic Flash with Original Box', 'Cameras & Photo')).toBe(true);
  });
  it.each([
    ['Canon AE-1 35mm film camera body', 'Cameras & Photo'],
    ['Nikon 50mm f1.8 lens', 'Cameras & Photo'],
    ['JBL Flip bluetooth speaker', 'Consumer Electronics'],
    ['Apple Lightning to USB cable 6ft', 'Cell Phones & Accessories'],
    ['Sony pocket AM FM radio', 'Radios'],
    ['Boss DS-1 distortion guitar pedal', 'Musical Instruments'],
    ['Dell Latitude laptop 14 inch', 'Computers/Tablets & Networking'],
    ['HP LaserJet printer', 'Computers/Tablets & Networking'],
    ['Sharp 32 inch television', 'TV, Video & Home Audio'],
    ['Cuisinart toaster appliance', 'Kitchen'],
    ['iPhone 12 silicone case', 'Cell Phones & Accessories'],
    ['Sony DVD player', 'Consumer Electronics'],
  ])('eligible: %s', (title, cat) => {
    expect(posh(title, cat)).toBe(true);
  });
});

describe('POSHMARK still blocks what Poshmark prohibits or restricts to new', () => {
  it.each([
    ['Canned soup food lot', 'Pantry'],
    ['Opened cosmetic palette', 'Beauty'],
    ['Used sock bundle', 'Socks'],
    ['Designer handbag replica', 'Handbags'],
    ['Counterfeit watch', 'Watches'],
    ['Recalled crib bumper', 'Baby'],
    ['Apple iPhone 12 128GB unlocked', 'Cell Phones & Smartphones'],
    ['Disney DVD movie lot', 'DVDs & Movies'],
    ['Whirlpool major appliance refrigerator', 'Major Appliances'],
    ['Hunting knife', 'Collectibles'],
  ])('blocked: %s', (title, cat) => {
    expect(posh(title, cat)).toBe(false);
  });
});

describe('publish gate and takedown gate agree', () => {
  // Item.category is an eBay colon breadcrumb; ebayCategoryName is the confirmed leaf.
  const row = {
    title: 'Vivitar 2500 Zoom Thyristor Electronic Flash with Original Box',
    category: 'Electronics:Cameras & Photo:Flashes',
    ebayCategoryName: 'Cameras & Photo',
    ebayCategoryId: null,
    price: 12, packageWeightOz: 8, packageLengthIn: 6, packageWidthIn: 4, packageHeightIn: 3,
  };
  it('both build identical category and agree on eligibility', () => {
    const publish = buildListingEligibilityItem(row, { forNewListing: true });
    const takedown = buildListingEligibilityItem(row, { forNewListing: false });
    expect(publish.category).toBe('Cameras & Photo');
    expect(takedown.category).toBe(publish.category);
    expect(checkEligibility('POSHMARK', takedown).eligible).toBe(true);
    expect(checkEligibility('POSHMARK', publish).eligible).toBe(true);
  });
  it('a blocked leaf blocks in both gates even when the breadcrumb is harmless', () => {
    const r = { ...row, title: 'Opened cosmetic palette', category: 'Everything Else', ebayCategoryName: 'Makeup', price: 10 };
    expect(checkEligibility('POSHMARK', buildListingEligibilityItem(r, { forNewListing: true })).eligible).toBe(false);
    expect(checkEligibility('POSHMARK', buildListingEligibilityItem(r, { forNewListing: false })).eligible).toBe(false);
  });
  it('falls back to Item.category when there is no ebayCategoryName', () => {
    expect(buildListingEligibilityItem({ ...row, ebayCategoryName: null }, { forNewListing: false }).category)
      .toBe('Electronics:Cameras & Photo:Flashes');
  });
  it('the extensionController uses the shared builder at all three gates', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../controllers/extensionController.ts'), 'utf8');
    expect((src.match(/buildListingEligibilityItem\(/g) || []).length).toBeGreaterThanOrEqual(8);
    expect(src).not.toMatch(/category: it\.category,\n\s+ebayCategoryId: it\.ebayCategoryId,\n\s+packageWeightOz/);
    expect(src).toMatch(/category: true, ebayCategoryName: true, ebayCategoryId: true, draftStatus: true/);
  });
});

describe('extension mirror (fas-poshmark.js) decides the same as the backend', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../../../../extension/fas-poshmark.js'), 'utf8');
  const start = src.indexOf('const POSHMARK_PROHIBITED_RULES');
  const end = src.indexOf('// ---- CAPTCHA / interstitial');
  const norm = (t: string) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const ctx: any = { norm };
  vm.createContext(ctx);
  vm.runInContext(src.slice(start, end) + '\nthis.fn = poshmarkRestrictionReason;', ctx);
  const cases: Array<[string, string]> = [
    ['Vivitar 2500 Zoom Thyristor Electronic Flash with Original Box', 'Cameras & Photo'],
    ['JBL Flip bluetooth speaker', 'Consumer Electronics'], ['Dell Latitude laptop', 'Computers'],
    ['Canned soup food lot', 'Pantry'], ['Opened cosmetic palette', 'Beauty'], ['Used sock bundle', 'Socks'],
    ['Designer replica bag', 'Handbags'], ['Apple iPhone 12 128GB', 'Cell Phones'], ['iPhone 12 case', 'Cell Phones & Accessories'],
    ['Disney DVD lot', 'DVDs'], ['Sony DVD player', 'Electronics'], ['Hunting knife', 'Collectibles'],
  ];
  it.each(cases)('agrees on %s', (title, cat) => {
    expect(ctx.fn(cat, title) === null).toBe(posh(title, cat));
  });
});
