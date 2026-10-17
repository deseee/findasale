// Node tests for the Poshmark multi-copy driver inside fas-edit-engine.js (one FindA.Sale item published as several identical listings).
// The engine is a browser script, so it is loaded in a vm sandbox with minimal DOM stubs; only the pure driver functions are exercised.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const A = 'aaaaaaaaaaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbbbbbbbbbb', D = 'dddddddddddddddddddddddd';

function loadEngine() {
  const sandbox = { console, setTimeout, clearTimeout, Math, Date, JSON };
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  sandbox.document = { querySelector: () => null, querySelectorAll: () => [], title: '', body: { innerText: '' } };
  sandbox.location = { href: 'https://poshmark.com/closet/x', pathname: '/closet/x' };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'fas-edit-core.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'fas-edit-engine.js'), 'utf8'), sandbox);
  return sandbox.FAS_EDIT_ENGINE._test;
}
const E = loadEngine();
const C = require('../fas-edit-core.js');

function ctxFor(scratch, extra) { return Object.assign({ platform: 'POSHMARK', item: { id: 'it1', title: 'Camel Cigarettes sign', priceDrift: true, price: 12 }, scratch: scratch }, extra || {}); }

test('a finished copy continues to the next copy after a jittered pause, then navigates there', () => {
  const S = C.copyStart([A, B, D]);
  const r1 = E.poshCopyWrap(ctxFor(S), { state: 'done', details: { verified: true }, scratch: { remoteId: A } });
  assert.strictEqual(r1.state, 'continue');
  assert.ok(r1.delayMs >= 3000 && r1.delayMs <= 7000);
  assert.strictEqual(r1.scratch.remoteId, B);
  assert.strictEqual(r1.scratch.copyWait, true);
  const merged = Object.assign({}, S, r1.scratch);
  const nav = E.poshCopyPre(ctxFor(merged));
  assert.strictEqual(nav.state, 'goto');
  assert.strictEqual(nav.url, 'https://poshmark.com/edit-listing/' + B);
  assert.strictEqual(nav.scratch.copyWait, false);
  assert.strictEqual(nav.scratch.apiTried, false);
});

test('mid-copy results pass through untouched and a normal (non-copy) item is never wrapped', () => {
  const S = C.copyStart([A, B]);
  const go = { state: 'goto', url: 'x', scratch: {} };
  assert.strictEqual(E.poshCopyWrap(ctxFor(S), go), go);
  const done = { state: 'done', details: { verified: true } };
  assert.strictEqual(E.poshCopyWrap(ctxFor({ remoteId: A }), done), done);
});

test('after the last copy: all edited -> one done with the canonical id and a summary; any failure -> copies_partial naming it', () => {
  let S = C.copyStart([A, B]);
  let r = E.poshCopyWrap(ctxFor(S), { state: 'done', scratch: {} });
  S = Object.assign({}, S, r.scratch);
  const fin = E.poshCopyWrap(ctxFor(S), { state: 'done', scratch: {} });
  assert.strictEqual(fin.state, 'done');
  assert.strictEqual(fin.scratch.remoteId, A);
  assert.strictEqual(fin.details.copies.edited.length, 2);
  assert.match(fin.details.copyLine, /Edited 2 of 2/);

  S = C.copyStart([A, B]);
  r = E.poshCopyWrap(ctxFor(S), { state: 'fail', code: 'verify_mismatch', reason: 'x', scratch: {} });
  assert.strictEqual(r.state, 'continue');
  S = Object.assign({}, S, r.scratch);
  const part = E.poshCopyWrap(ctxFor(S), { state: 'done', scratch: {} });
  assert.strictEqual(part.state, 'fail');
  assert.strictEqual(part.code, 'copies_partial');
  assert.ok(part.reason.indexOf('FAILED: ' + A.slice(-6)) !== -1);
  assert.strictEqual(part.scratch.remoteId, A);
});

test('a block stops the remaining copies and reports them as not attempted', () => {
  const S = C.copyStart([A, B, D]);
  const r = E.poshCopyWrap(ctxFor(S), { state: 'blocked', code: 'http_429', reason: 'slow down' });
  assert.strictEqual(r.state, 'blocked');
  assert.deepStrictEqual(Array.from(r.details.copies.untried), [B, D]);
});

test('remembered copies from an earlier run restart the multi-copy edit when the saved id is one of them', () => {
  const ctx = ctxFor({}, { idCache: { 'POSHMARK:it1': B }, copyIds: { 'POSHMARK:it1': [A, B, D] } });
  const r = E.poshCopyPre(ctx);
  assert.strictEqual(r.state, 'goto');
  assert.strictEqual(r.url, 'https://poshmark.com/edit-listing/' + B);   // the saved id first
  assert.deepStrictEqual(Array.from(r.scratch.copies), [B, A, D]);
  // saved id not among the remembered copies, or only one copy remembered: ordinary single-listing path
  assert.strictEqual(E.poshCopyPre(ctxFor({}, { idCache: { 'POSHMARK:it1': 'cccccccccccccccccccccccc' }, copyIds: { 'POSHMARK:it1': [A, B] } })), null);
  assert.strictEqual(E.poshCopyPre(ctxFor({}, { idCache: { 'POSHMARK:it1': A }, copyIds: { 'POSHMARK:it1': [A] } })), null);
  assert.strictEqual(E.poshCopyPre(ctxFor({}, {})), null);
});
