/**
 * Category-aware eBay condition preview: the frontend mirror (pickFallbackCondition, FALLBACKS_BY_DESIRED in
 * lib/conditionModel.ts) must give the same answer as the publish path (ebayPublishService.pickFallbackCondition).
 * Run: npm test   (node:test through tsx)
 *
 * Parity approach: no cross-package runtime import (the backend module pulls in prisma and the eBay HTTP layer).
 * Instead the test reads the backend SOURCE TEXT, cuts out FALLBACKS_BY_DESIRED + isUsedOrRefurbishedDesired +
 * pickFallbackCondition, strips the types with the TypeScript transpiler and evaluates just that snippet. It then
 * compares every (desired, accepted set) combination, so a change to either the table or the logic on one side only
 * fails here. If the backend source is not on disk the parity block is skipped and the literal cases still pin the
 * behavior, including the real-world non-granular category (1000, 1500, 3000, 7000).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {
  EBAY_ACCEPTED_CONDITION_LABELS,
  eBayConditionPreview,
  effectiveEbayCondition,
  pickFallbackCondition,
} from '../conditionModel';

const DESIRED = [
  'NEW', 'NEW_OTHER', 'NEW_WITH_DEFECTS', 'LIKE_NEW', 'USED_EXCELLENT', 'USED_VERY_GOOD', 'USED_GOOD',
  'USED_ACCEPTABLE', 'SELLER_REFURBISHED', 'CERTIFIED_REFURBISHED', 'EXCELLENT_REFURBISHED',
  'VERY_GOOD_REFURBISHED', 'GOOD_REFURBISHED', 'FOR_PARTS_OR_NOT_WORKING',
];

// Representative accepted sets (the enums the Metadata API conditionIds 1000..7000 map to).
const SETS: Record<string, string[]> = {
  nonGranular: ['NEW', 'NEW_OTHER', 'USED_EXCELLENT', 'FOR_PARTS_OR_NOT_WORKING'], // 1000, 1500, 3000, 7000
  fullUsed: ['NEW', 'NEW_OTHER', 'USED_EXCELLENT', 'USED_VERY_GOOD', 'USED_GOOD', 'USED_ACCEPTABLE', 'FOR_PARTS_OR_NOT_WORKING'],
  granular: ['NEW', 'NEW_OTHER', 'USED_VERY_GOOD', 'USED_GOOD', 'USED_ACCEPTABLE', 'FOR_PARTS_OR_NOT_WORKING'],
  onlyNew: ['NEW'],
  apparel: ['NEW', 'NEW_WITH_DEFECTS', 'NEW_OTHER', 'USED_EXCELLENT', 'USED_GOOD'], // 1000, 1750, 1500, 3000, 5000
  refurbOnly: ['SELLER_REFURBISHED', 'CERTIFIED_REFURBISHED', 'FOR_PARTS_OR_NOT_WORKING'],
  singleParts: ['FOR_PARTS_OR_NOT_WORKING'],
  empty: [],
};

test('non-granular category (1000/1500/3000/7000): the preview shows what eBay will really carry', () => {
  const accepted = SETS.nonGranular;
  assert.equal(eBayConditionPreview('USED', 'A', accepted), 'Used'); // desired USED_VERY_GOOD -> USED_EXCELLENT (3000)
  assert.equal(eBayConditionPreview('USED', 'B', accepted), 'Used');
  assert.equal(eBayConditionPreview('USED', 'C', accepted), 'Used'); // USED_GOOD -> USED_EXCELLENT
  assert.equal(eBayConditionPreview('USED', 'D', accepted), 'Used'); // USED_ACCEPTABLE -> USED_EXCELLENT, never NEW_OTHER
  assert.equal(eBayConditionPreview('USED', null, accepted), 'Used');
  assert.equal(eBayConditionPreview('NEW', null, accepted), 'New'); // accepted as is
  assert.equal(eBayConditionPreview('PARTS_OR_REPAIR', null, accepted), 'For parts or not working');
  assert.equal(eBayConditionPreview('REFURBISHED', null, accepted), 'Used'); // never New
});

test('granular category and unknown accepted list keep the plain label', () => {
  assert.equal(eBayConditionPreview('USED', 'A', SETS.granular), 'Very Good');
  assert.equal(eBayConditionPreview('USED', 'C', SETS.fullUsed), 'Good');
  assert.equal(eBayConditionPreview('USED', 'A'), 'Very Good');
  assert.equal(eBayConditionPreview('USED', 'A', null), 'Very Good');
  assert.equal(eBayConditionPreview('USED', 'A', []), 'Very Good');
  assert.equal(eBayConditionPreview('USED', 'D', undefined), 'Acceptable');
});

test('substitutes use eBay wording, including the new-condition and apparel chains', () => {
  assert.equal(eBayConditionPreview('NEW', null, ['NEW_OTHER', 'USED_GOOD']), 'New other (see details)');
  assert.equal(eBayConditionPreview('USED', 'A', SETS.apparel), 'Used'); // VERY_GOOD -> EXCELLENT first
  assert.equal(eBayConditionPreview('USED', 'C', SETS.apparel), 'Good');
  assert.equal(effectiveEbayCondition('USED', 'D', SETS.onlyNew), 'NEW'); // last resort, nothing used accepted
});

test('every enum the fallback logic can return has a label', () => {
  for (const [name, accepted] of Object.entries(SETS)) {
    for (const desired of DESIRED) {
      const picked = pickFallbackCondition(desired, new Set(accepted));
      if (picked) assert.equal(typeof EBAY_ACCEPTED_CONDITION_LABELS[picked], 'string', `${name}: ${desired} -> ${picked}`);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// Parity with the backend source (skipped when it is not on disk)
// ---------------------------------------------------------------------------------------------
const BACKEND_FILE =
  typeof __dirname === 'string'
    ? path.resolve(__dirname, '..', '..', '..', 'backend', 'src', 'services', 'ebayPublishService.ts')
    : '';
const backendPresent = BACKEND_FILE !== '' && fs.existsSync(BACKEND_FILE);

function loadBackendFallbacks(): {
  table: Record<string, string[]>;
  pick: (desired: string, accepted: Set<string>) => { condition: string; source: string } | null;
} {
  const src = fs.readFileSync(BACKEND_FILE, 'utf8');
  const start = src.indexOf('const FALLBACKS_BY_DESIRED');
  const end = src.indexOf('export async function ensureConditionValidForCategory');
  assert.ok(start > 0 && end > start, 'could not locate the fallback code in ebayPublishService.ts');
  const js = ts.transpileModule(src.slice(start, end), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const exportsObj: Record<string, any> = {};
  new Function('exports', `${js}\nexports.table = FALLBACKS_BY_DESIRED;`)(exportsObj);
  return { table: exportsObj.table, pick: exportsObj.pickFallbackCondition };
}

test('parity with backend ebayPublishService fallback table and pickFallbackCondition', { skip: backendPresent ? false : 'backend source not present' }, () => {
  const backend = loadBackendFallbacks();
  assert.ok(Object.keys(backend.table).length >= 8);
  assert.equal(typeof backend.pick, 'function');

  // Every accepted subset of the full enum list would be 2^14; instead use the representative sets plus every
  // single-enum set and every "all except one" set.
  const ALL = Object.keys(EBAY_ACCEPTED_CONDITION_LABELS);
  const sets: Array<[string, string[]]> = [
    ...Object.entries(SETS),
    ...ALL.map((e): [string, string[]] => [`only ${e}`, [e]]),
    ...ALL.map((e): [string, string[]] => [`all but ${e}`, ALL.filter((x) => x !== e)]),
    ['all', ALL],
  ];
  const desiredList = Array.from(new Set([...DESIRED, ...Object.keys(backend.table), 'SOMETHING_UNKNOWN']));

  let compared = 0;
  for (const [name, accepted] of sets) {
    for (const desired of desiredList) {
      const set = new Set(accepted);
      if (set.has(desired)) continue; // the caller never asks for a fallback then
      const theirs = backend.pick(desired, set);
      const mine = pickFallbackCondition(desired, set);
      assert.equal(mine, theirs ? theirs.condition : null, `${desired} with accepted set "${name}" [${accepted.join(',')}]`);
      compared += 1;
    }
  }
  assert.ok(compared > 300, `expected a broad comparison, got ${compared}`);
});
