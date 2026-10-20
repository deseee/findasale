const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
test('popup has the show-pickup-only toggle and zoom buttons wired', () => {
  const html = rd('popup.html'), js = rd('popup.js'), css = rd('popup.css');
  assert.ok(/id="showPickupOnly"/.test(html) && /id="zoomIn"/.test(html) && /id="zoomOut"/.test(html));
  assert.ok(/\$\('showPickupOnly'\)\.onchange = render/.test(js));
  assert.ok(/pickupBlocked/.test(js) && /PICKUP ONLY/.test(js));
  assert.ok(/zoom: var\(--z\)/.test(css) && /max-height: calc\(600px \/ var\(--z\)\)/.test(css));
});
test('queue still excludes pickup-only items even when they are shown', () => {
  assert.ok(/\.filter\(\(it\) => !isPickupOnlyBlockedOnCurrentChannel\(it\)\)/.test(rd('popup.js')));
});
