'use strict';
// 1.0.89: Vinted order conversation ids are UUIDs now (live 2026-11-01). The bundle reconciler must accept them.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const UUID = '01a19482-dfe0-7493-b1f1-b96df0757f91';

test('fas-vinted.js and background.js accept UUID and numeric conversation ids, nothing else', () => {
  for (const f of ['fas-vinted.js', 'background.js']) {
    const src = rd(f);
    const m = src.match(/\/\^\(\?:\\d\{5,20\}\|\[0-9a-f\]\{8\}[^/]*\$\/i/g);
    assert.ok(m && m.length >= 1, f + ' has the UUID-aware id check');
    const re = eval(m[0]);
    assert.ok(re.test(UUID) && re.test('900100200300'));
    assert.ok(!re.test('abc;drop') && !re.test('12') && !re.test(UUID + '0'));
    assert.ok(!/\/\^\\d\{5,20\}\$\//.test(src), f + ' has no numeric-only conversation check left');
  }
});

test('manifest is at least 1.0.89', () => {
  assert.ok(require('./_version').atLeast(JSON.parse(rd('manifest.json')).version, '1.0.89'));
});
