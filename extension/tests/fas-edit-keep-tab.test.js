const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
test('edit run keeps its tab open when it stopped on something only the organizer can do', () => {
  assert.ok(/FAS_EDIT_NEEDS_USER_CODES = \['login_required', 'captcha_or_verification', 'poshmark_flagged'\]/.test(src));
  assert.ok(/FAS_EDIT_NEEDS_USER_CODES\.indexOf\(stopped\) !== -1/.test(src));
  assert.ok(/await fasEditCloseKeptTab\(\);/.test(src));
});
