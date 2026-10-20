const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
// 1.0.36: the mapped-category picker scrolls its result list when the wanted row is not rendered yet.
const src = fs.readFileSync(path.join(__dirname, '..', 'fas-mercari.js'), 'utf8');
function extractFn(name) {
  const m = new RegExp('function ' + name + '\\(').exec(src); assert.ok(m, name + ' not found');
  let i = src.indexOf('{', m.index), depth = 0;
  for (let j = i; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (!depth) return src.slice(m.index, j + 1); } }
}
test('scrollMercariResultsDown scrolls the scrollable ancestor and reports movement', () => {
  global.getComputedStyle = () => ({ overflowY: 'auto' });
  const list = { scrollHeight: 1000, clientHeight: 200, scrollTop: 0, parentElement: null };
  const row = { parentElement: list };
  const fn = new Function(extractFn('scrollMercariResultsDown') + '; return scrollMercariResultsDown;')();
  assert.strictEqual(fn([row]), true);
  assert.ok(list.scrollTop > 0);
  assert.strictEqual(fn([]), false);
});
test('the mapped picker uses the scroll helper and waits long enough', () => {
  assert.ok(src.indexOf('scrollMercariResultsDown(opts.filter') !== -1);
  assert.ok(/\}, 6000\);\s*\n\s*if \(row\) break;/.test(src));
});
