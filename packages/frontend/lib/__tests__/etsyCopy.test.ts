/**
 * Copy-lint and trademark tests for the Etsy connector UI (ADR-135 D7.4, D8, batch E-B5).
 * Run: npm test   (node:test through tsx, no extra dependencies)
 *
 * Covers: every exported string constant (and every templated string function) in lib/etsyCopy.ts, plus
 * the sentences lib/etsyUiState.ts produces, contain no "AI", no "estate sale", no em or en dash and no
 * placeholder text; the Etsy trademark sentence is exact and is rendered by the panel and the modal; no
 * NEXT_PUBLIC_ variable is used by any new file; component and page sources are free of the same words.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import * as copy from '../etsyCopy';
import * as ui from '../etsyUiState';

const HERE = typeof __dirname !== 'undefined' ? __dirname : path.join(process.cwd(), 'lib', '__tests__');
const FRONTEND = path.resolve(HERE, '..', '..');
const BACKEND_SRC = path.resolve(FRONTEND, '..', 'backend', 'src');

const read = (p: string): string => fs.readFileSync(p, 'utf8');
const readIfPresent = (p: string): string | null => (fs.existsSync(p) ? read(p) : null);

const BANNED: Array<[string, RegExp]> = [
  ['the word AI', /\bai\b/i],
  ['estate sale', /estate\s*sales?/i],
  ['an em or en dash', /[\u2013\u2014]/],
  ['placeholder text', /\{\{|\}\}|\[[A-Za-z _-]+\]|lorem ipsum|\b(?:todo|tbd|xxx)\b/i],
];

function lint(label: string, text: string): string[] {
  const out: string[] = [];
  for (const [name, re] of BANNED) if (re.test(text)) out.push(`${label}: contains ${name}: "${text.slice(0, 80)}"`);
  return out;
}

// Sample arguments for every templated string function exported from etsyCopy.ts. A new function
// without an entry here fails the test below, so new templated copy cannot skip the lint.
const SAMPLE_CALLS: Record<string, unknown[][]> = {
  etsyCurrencyMessage: [['EUR']],
  etsyConfirmDisconnectMessage: [[1], [3]],
  'ETSY_MODAL_COPY.photoCountMany': [[25, 20], [5, 20]],
  'ETSY_MODAL_COPY.draftPendingPhotos': [[1, 3]],
  'ETSY_MODAL_COPY.liveUntil': [['May 1, 2027']],
};

function collectStrings(value: unknown, label: string, found: string[], problems: string[], seenFns: string[]): void {
  if (typeof value === 'string') {
    found.push(value);
    problems.push(...lint(label, value));
  } else if (typeof value === 'function') {
    seenFns.push(label);
    const samples = SAMPLE_CALLS[label];
    if (!samples) {
      problems.push(`${label}: templated string function has no sample call in etsyCopy.test.ts`);
      return;
    }
    for (const args of samples) {
      const out = (value as (...a: unknown[]) => unknown)(...args);
      assert.equal(typeof out, 'string');
      found.push(out as string);
      problems.push(...lint(`${label}(${args.join(',')})`, out as string));
    }
  } else if (value && typeof value === 'object') {
    for (const k of Object.keys(value as Record<string, unknown>)) {
      collectStrings((value as Record<string, unknown>)[k], `${label}.${k}`, found, problems, seenFns);
    }
  }
}

test('every string exported from etsyCopy.ts passes the copy lint (no AI, estate sale, dashes, placeholders)', () => {
  const found: string[] = [];
  const problems: string[] = [];
  const fns: string[] = [];
  for (const k of Object.keys(copy)) collectStrings((copy as Record<string, unknown>)[k], k, found, problems, fns);
  assert.deepEqual(problems, []);
  assert.ok(found.length > 150, `expected a large copy surface, found ${found.length}`);
  // Every templated function is covered by a sample call.
  assert.ok(fns.length >= 5);
});

test('strings produced by etsyUiState.ts pass the copy lint', () => {
  const problems: string[] = [];
  const add = (label: string, text: string | null | undefined) => {
    if (typeof text === 'string') problems.push(...lint(label, text));
  };
  add('ETSY_MSG_NO_ERA', ui.ETSY_MSG_NO_ERA);
  add('etsyMsgEraTooRecent', ui.etsyMsgEraTooRecent('2010 to 2019'));
  add('etsyMsgCardYearTooRecent', ui.etsyMsgCardYearTooRecent(2015));

  const states = ['PREPARING', 'DRAFT_PENDING', 'DRAFT_READY', 'PUBLISHING', 'ACTIVE', 'ENDED', 'SOLD', 'FAILED', 'ORPHANED'];
  const steps = [null, 'CREATE', 'IMAGES', 'PUBLISH', 'UPDATE', 'DELETE', 'SOMETHING_ELSE'];
  for (const state of states) {
    for (const step of steps) {
      const listing = ui.normalizeEtsyListing({ state, failedStep: step, etsyListingId: '123' });
      const view = ui.deriveEtsyListingView(listing);
      add(`chip ${state}/${step} label`, view.chip?.label);
      add(`chip ${state}/${step} detail`, view.chip?.detail);
      add(`failure ${state}/${step}`, view.failureMessage);
    }
  }

  const base = ui.normalizeEtsyConnection({
    enabled: true, pushEnabled: true, allowed: true, connected: true, status: 'ACTIVE', shopCurrency: 'EUR', currencySupported: false,
  });
  add('currency message', base.currencyMessage);
  const item: ui.EtsyItemInput = { id: 'i1', title: '', price: null, photoUrls: [], stockTotal: 3, stockSold: 3 };
  const empty: ui.EtsyDraftFormValues = {
    whenMade: '', isSupply: false, taxonomyId: null, shippingProfileId: '', returnPolicyId: '', readinessStateId: '', attested: false,
  };
  for (const connection of [undefined, ui.ETSY_DISABLED_CONNECTION, base, { ...base, pushEnabled: false, currencySupported: true, currencyMessage: null }]) {
    const p = ui.getEtsyDraftProblems({ item, connection, form: empty, asOfYear: 2026 });
    p.blocking.forEach((m, i) => add(`problem ${i}`, m));
    p.missing.forEach((m, i) => add(`missing ${i}`, m));
  }
  const codes = ['ETSY_DISABLED', 'ETSY_NOT_ALLOWED', 'ETSY_BUSY', 'ETSY_NEEDS_REAUTH', 'ETSY_NOT_CONNECTED', 'ETSY_CONNECT_FAILED', 'ETSY_NO_SHOP', 'ETSY_SHOP_IN_USE', 'ETSY_SETUP_INVALID', 'ETSY_ERROR', 'WHATEVER'];
  for (const code of codes) add(`error ${code}`, ui.etsyErrorMessage({ response: { status: 502, data: { code } } }));
  add('error 429', ui.etsyErrorMessage({ response: { status: 429, data: {} } }));
  assert.deepEqual(problems, []);
});

test('the Etsy trademark sentence is exact (ADR-135 D7.4) and matches the backend constant', () => {
  assert.equal(
    copy.ETSY_ATTRIBUTION,
    "The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy."
  );
  const auth = readIfPresent(path.join(BACKEND_SRC, 'services', 'marketplace', 'etsyAuth.ts'));
  if (auth) assert.ok(auth.includes(copy.ETSY_ATTRIBUTION), 'etsyAuth.ts ETSY_ATTRIBUTION differs from lib/etsyCopy.ts');
});

test('the attestation, fee notice and $0.20 amount are in the copy', () => {
  assert.equal(copy.ETSY_LISTING_FEE_AMOUNT, '$0.20');
  assert.ok(copy.ETSY_ATTESTATION_TEXT.includes('at least 20 years old'));
  assert.ok(copy.ETSY_ATTESTATION_TEXT.includes('$0.20 listing fee'));
  assert.ok(copy.ETSY_FEE_NOTICE.includes('$0.20'));
});

const read2 = (rel: string) => read(path.join(FRONTEND, rel));

test('the trademark sentence is rendered by the Etsy panel and by the draft review modal', () => {
  for (const rel of ['components/etsy/EtsyConnectPanel.tsx', 'components/etsy/EtsyDraftReviewModal.tsx']) {
    const src = read2(rel);
    assert.ok(/import\s*\{[^}]*\bETSY_ATTRIBUTION\b[^}]*\}\s*from\s*'\.\.\/\.\.\/lib\/etsyCopy'/.test(src), `${rel} must import ETSY_ATTRIBUTION`);
    assert.ok(/\{ETSY_ATTRIBUTION\}/.test(src), `${rel} must render {ETSY_ATTRIBUTION}`);
  }
});

const NEW_FILES = [
  'lib/etsyCopy.ts',
  'lib/etsyWhenMade.ts',
  'lib/etsyUiState.ts',
  'lib/etsyCallback.ts',
  'lib/useEtsyConnection.ts',
  'components/etsy/EtsyConnectPanel.tsx',
  'components/etsy/EtsyDraftReviewModal.tsx',
  'components/etsy/EtsyListingStatus.tsx',
  'pages/organizer/etsy-oauth-callback.tsx',
];

test('no new file reads a NEXT_PUBLIC_ variable (availability comes from the server)', () => {
  for (const rel of NEW_FILES) {
    assert.ok(!/NEXT_PUBLIC_/.test(read2(rel)), `${rel} must not use NEXT_PUBLIC_`);
    assert.ok(!/process\.env/.test(read2(rel)), `${rel} must not read process.env`);
  }
});

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

test('component, hook and page sources have no banned words or dashes outside comments', () => {
  const problems: string[] = [];
  for (const rel of NEW_FILES.filter((f) => f !== 'lib/etsyCopy.ts')) {
    const code = stripComments(read2(rel));
    for (const [name, re] of BANNED.slice(0, 3)) if (re.test(code)) problems.push(`${rel}: contains ${name}`);
  }
  assert.deepEqual(problems, []);
});

test('component sources keep 44 px tap targets on every button (min-h-[44px])', () => {
  for (const rel of ['components/etsy/EtsyConnectPanel.tsx', 'components/etsy/EtsyDraftReviewModal.tsx', 'components/etsy/EtsyListingStatus.tsx']) {
    const code = stripComments(read2(rel));
    const buttons = code.match(/<button\b(?:=>|[^>])*>/g) ?? [];
    assert.ok(buttons.length > 0);
    for (const b of buttons) {
      const usesConst = /className=\{(PRIMARY_BTN|SECONDARY_BTN|DANGER_BTN)\}/.test(b);
      assert.ok(usesConst || /min-h-\[44px\]/.test(b), `${rel}: button without a 44 px minimum height: ${b.slice(0, 120)}`);
      assert.ok(/type="button"/.test(b), `${rel}: button without type="button"`);
    }
    const consts = code.match(/(PRIMARY_BTN|SECONDARY_BTN|DANGER_BTN)\s*=\s*\n?\s*'[^']*'/g) ?? [];
    for (const c of consts) assert.ok(/min-h-\[44px\]/.test(c), `${rel}: ${c.slice(0, 40)} lacks min-h-[44px]`);
  }
});
