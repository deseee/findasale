/**
 * Tests for lib/etsyWhenMade.ts, the frontend mirror of the Etsy `when_made` enum (ADR-135 D3.3, batch E-B5).
 * Run: npm test   (node:test through tsx, no extra dependencies)
 *
 * The frontend cannot import the backend table, so ETSY_ERA_OPTIONS is a copy. These tests pin the 19
 * values and, whenever the backend source is present (the monorepo and CI), compare the copy with
 * packages/backend/src/config/etsyWhenMade.ts so drift fails here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
  ETSY_ERA_OPTIONS,
  etsyEraOptionsFor,
  etsyEraQualifies,
  etsyVintageCutoffYear,
  getEtsyEra,
  reconcileEra,
} from '../etsyWhenMade';

const HERE = typeof __dirname !== 'undefined' ? __dirname : path.join(process.cwd(), 'lib', '__tests__');
const BACKEND_FILE = path.resolve(HERE, '..', '..', '..', 'backend', 'src', 'config', 'etsyWhenMade.ts');

const SPEC_ORDER = [
  'made_to_order', '2020_2026', '2010_2019', '2007_2009', 'before_2007', '2000_2006', '1990s', '1980s', '1970s',
  '1960s', '1950s', '1940s', '1930s', '1920s', '1910s', '1900s', '1800s', '1700s', 'before_1700',
];

test('the era list is the 19 values of the Etsy spec, in spec order', () => {
  assert.deepEqual(ETSY_ERA_OPTIONS.map((e) => e.value), SPEC_ORDER);
});

test('the copy matches packages/backend/src/config/etsyWhenMade.ts (value, label, maxYear)', { skip: !fs.existsSync(BACKEND_FILE) }, () => {
  const src = fs.readFileSync(BACKEND_FILE, 'utf8');
  const re = /\{ value: '([^']+)', label: '([^']+)', maxYear: (null|\d+), qualifiesAsVintage: (?:true|false) \}/g;
  const backend: Array<{ value: string; label: string; maxYear: number | null }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) backend.push({ value: m[1], label: m[2], maxYear: m[3] === 'null' ? null : Number(m[3]) });
  assert.equal(backend.length, 19);
  assert.deepEqual(
    ETSY_ERA_OPTIONS.map((e) => ({ value: e.value, label: e.label, maxYear: e.maxYear })),
    backend
  );
});

test('vintage cutoff moves with the year (2026 gives 2006)', () => {
  assert.equal(etsyVintageCutoffYear(2026), 2006);
  assert.equal(etsyVintageCutoffYear(2027), 2007);
});

test('without the supply box only eras whose whole range is 20+ years old are offered (2026: the 15 vintage values)', () => {
  const values = etsyEraOptionsFor(false, 2026).map((e) => e.value);
  assert.equal(values.length, 15);
  assert.deepEqual(values, SPEC_ORDER.filter((v) => !['made_to_order', '2020_2026', '2010_2019', '2007_2009'].includes(v)));
});

test('a craft or party supply gets the FULL list of 19 eras', () => {
  const values = etsyEraOptionsFor(true, 2026).map((e) => e.value);
  assert.deepEqual(values, SPEC_ORDER);
});

test('the list follows the calendar: 2027 still hides 2007 to 2009 (it ends in 2009), 2029 shows it', () => {
  assert.ok(!etsyEraOptionsFor(false, 2027).some((e) => e.value === '2007_2009'));
  assert.ok(etsyEraOptionsFor(false, 2029).some((e) => e.value === '2007_2009'));
  assert.ok(!etsyEraOptionsFor(false, 2028).some((e) => e.value === '2007_2009'));
});

test('etsyEraQualifies: allowlist posture for unknown, empty and made_to_order', () => {
  assert.equal(etsyEraQualifies('before_2007', 2026), true);
  assert.equal(etsyEraQualifies('2000_2006', 2026), true);
  assert.equal(etsyEraQualifies('2007_2009', 2026), false);
  assert.equal(etsyEraQualifies('made_to_order', 2026), false);
  assert.equal(etsyEraQualifies('1985', 2026), false);
  assert.equal(etsyEraQualifies('', 2026), false);
  assert.equal(etsyEraQualifies(null, 2026), false);
});

test('getEtsyEra only matches exact values', () => {
  assert.equal(getEtsyEra('1980s')?.label, '1980s');
  assert.equal(getEtsyEra('1980S'), undefined);
  assert.equal(getEtsyEra(undefined), undefined);
});

test('reconcileEra clears a choice that the current list no longer offers', () => {
  const vintage = etsyEraOptionsFor(false, 2026);
  assert.equal(reconcileEra('1980s', vintage), '1980s');
  assert.equal(reconcileEra('2020_2026', vintage), '');
  assert.equal(reconcileEra('2020_2026', etsyEraOptionsFor(true, 2026)), '2020_2026');
});
