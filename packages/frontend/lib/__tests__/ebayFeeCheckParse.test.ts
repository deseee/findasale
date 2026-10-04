/**
 * ebayFeeCheckParse: response parsing and failure copy for EbayFeeCheckBadge (Wave 3).
 * Run: npm test   (node:test through tsx)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  FEE_CHECK_COPY,
  FEE_CHECK_NOT_READY_FALLBACK,
  classifyFeeCheckError,
  parseFeeCheckResponse,
} from '../ebayFeeCheckParse';

test('ready:true with a free fee check parses as ready', () => {
  const r = parseFeeCheckResponse({ ready: true, itemId: 'i1', feeCheck: { status: 'free' } });
  assert.deepEqual(r, { kind: 'ready', feeCheck: { status: 'free' } });
});

test('ready:true with a fee parses amount and currency', () => {
  const r = parseFeeCheckResponse({ ready: true, itemId: 'i1', feeCheck: { status: 'fee', amount: 0.35, currency: 'USD' } });
  assert.deepEqual(r, { kind: 'ready', feeCheck: { status: 'fee', amount: 0.35, currency: 'USD' } });
});

test('ready:true with an unknown status keeps its reason', () => {
  const r = parseFeeCheckResponse({ ready: true, feeCheck: { status: 'unknown', reason: 'timeout' } });
  assert.deepEqual(r, { kind: 'ready', feeCheck: { status: 'unknown', reason: 'timeout' } });
});

test('older shape without ready but with a valid feeCheck is still ready', () => {
  const r = parseFeeCheckResponse({ itemId: 'i1', feeCheck: { status: 'free' } });
  assert.equal(r.kind, 'ready');
});

test('ready:false shows reasons[0].message, with its code', () => {
  const r = parseFeeCheckResponse({
    ready: false,
    reasons: [
      { code: 'EBAY_OFFER_NOT_CREATED', message: 'This item has no eBay offer yet.' },
      { code: 'EBAY_ALREADY_LISTED', message: 'second' },
    ],
  });
  assert.deepEqual(r, { kind: 'not_ready', code: 'EBAY_OFFER_NOT_CREATED', message: 'This item has no eBay offer yet.' });
});

test('ready:false with no usable reasons falls back to the generic not-ready text', () => {
  for (const reasons of [undefined, [], [{ code: 'X' }], [{ code: 'X', message: '   ' }], 'nope']) {
    const r = parseFeeCheckResponse({ ready: false, reasons });
    assert.equal(r.kind, 'not_ready');
    assert.equal((r as any).message, FEE_CHECK_NOT_READY_FALLBACK);
  }
});

test('ready:false skips an unusable first reason and uses the first one with a message', () => {
  const r = parseFeeCheckResponse({ ready: false, reasons: [{ code: 'A' }, { code: 'B', message: 'Try later.' }] });
  assert.deepEqual(r, { kind: 'not_ready', code: 'B', message: 'Try later.' });
});

test('malformed payloads are invalid, never throw', () => {
  for (const bad of [null, undefined, 'x', 7, [], {}, { ready: true }, { ready: true, feeCheck: { status: 'fee' } },
    { ready: true, feeCheck: { status: 'fee', amount: 'NaN' } }, { feeCheck: { status: 'weird' } }]) {
    assert.equal(parseFeeCheckResponse(bad).kind, 'invalid', JSON.stringify(bad));
  }
});

test('classifyFeeCheckError separates network, 4xx, 429 and 5xx', () => {
  assert.equal(classifyFeeCheckError(new Error('Network Error')).kind, 'network');
  assert.equal(classifyFeeCheckError(null).kind, 'network');
  assert.equal(classifyFeeCheckError({ response: { status: 400 } }).kind, 'client');
  assert.equal(classifyFeeCheckError({ response: { status: 403 } }).kind, 'client');
  assert.equal(classifyFeeCheckError({ response: { status: 429 } }).kind, 'rate_limited');
  assert.equal(classifyFeeCheckError({ response: { status: 500 } }).kind, 'server');
  assert.equal(classifyFeeCheckError({ response: { status: 503 } }).kind, 'server');
  assert.equal(classifyFeeCheckError({ response: {} }).kind, 'unknown');
});

test('each failure kind has its own message', () => {
  const msgs = new Set(
    [new Error('x'), { response: { status: 404 } }, { response: { status: 429 } }, { response: { status: 502 } }].map(
      (e) => classifyFeeCheckError(e).message
    )
  );
  assert.equal(msgs.size, 4);
});

test('copy has no em dash, en dash or the word AI', () => {
  const all = [...Object.values(FEE_CHECK_COPY), FEE_CHECK_NOT_READY_FALLBACK].join('\n');
  assert.ok(!/[–—]/.test(all));
  assert.ok(!/\bai\b/i.test(all));
});

test('the badge does not fetch on mount by default (autoRun gates the query)', () => {
  const HERE = typeof __dirname !== 'undefined' ? __dirname : path.join(process.cwd(), 'lib', '__tests__');
  const src = fs.readFileSync(path.resolve(HERE, '..', '..', 'components', 'EbayFeeCheckBadge.tsx'), 'utf8');
  assert.match(src, /autoRun = false/);
  assert.match(src, /enabled: enabled && autoRun/);
});
