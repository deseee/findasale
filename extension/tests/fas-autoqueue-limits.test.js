// 1.0.63: the extension applies the organizer's auto queue test limits (max new listings per check, only these items).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const bg = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

function extract(name) {
  const i = bg.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name);
  let depth = 0, j = bg.indexOf('{', i);
  for (let k = j; k < bg.length; k++) {
    if (bg[k] === '{') depth++;
    else if (bg[k] === '}') { depth--; if (depth === 0) return bg.slice(i, k + 1); }
  }
  throw new Error('unterminated ' + name);
}
// eslint-disable-next-line no-new-func
const lib = new Function(extract('fasAutoQueueLimitPlan') + '\n' + extract('fasAutoQueueApplyLimit') + '\nreturn { fasAutoQueueLimitPlan, fasAutoQueueApplyLimit };')();

test('no limits: unlimited, nothing filtered', () => {
  const p = lib.fasAutoQueueLimitPlan(undefined);
  assert.strictEqual(p.onlyIds, null);
  assert.strictEqual(p.budget, Infinity);
  assert.strictEqual(lib.fasAutoQueueApplyLimit([{ id: 'a' }, { id: 'b' }], p).length, 2);
});

test('maxNewPerRun caps and onlyItemIds filters', () => {
  const p = lib.fasAutoQueueLimitPlan({ maxNewPerRun: 2, onlyItemIds: ['b', 'c', 'd'] });
  const out = lib.fasAutoQueueApplyLimit([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], p);
  assert.deepStrictEqual(out.map((x) => x.id), ['b', 'c']);
});

test('invalid limits are ignored, not trusted', () => {
  const p = lib.fasAutoQueueLimitPlan({ maxNewPerRun: 0, onlyItemIds: 'x' });
  assert.strictEqual(p.budget, Infinity);
  assert.strictEqual(p.onlyIds, null);
});

test('checkAutoListQueue reads limits from the server response and spends one budget across platforms', () => {
  const i = bg.indexOf('async function checkAutoListQueue()');
  const body = bg.slice(i, i + 10000); // 1.0.67: widened for the hold release/drop block; 1.0.69: and the certify-ids block
  assert.ok(/fasAutoQueueLimitPlan\(resp\.data && resp\.data\.limits\)/.test(body));
  assert.ok(/limitPlan\.budget -= items\.length/.test(body));
  assert.ok(/fasAutoQueueSweepStale\(platform, 'limit_reached'\)/.test(body)); // 1.0.66: outcome comes from the stale-queue sweep
});
