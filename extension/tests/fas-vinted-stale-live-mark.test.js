// 2026-10-29: "Mugig Guitar Instrument Cable" (cmt3aixuw01l1a4xvg5tgdun1) never went through the Vinted queue after its stale
// Vinted record was closed on 2026-10-28 13:39 UTC (REMOVE/REMOVED stale_record_not_on_vinted). The backend payload for it is
// clean (run against the real getExtensionItems with the item's prod values and job history: marketplaceListedVinted false,
// eligibility.VINTED eligible, localPickupOnly false, vintedCategoryId 4957), so the only extension filter left is the popup's
// local "Already on Vinted" mark (fasVintedPresent). A mark written by the fill-time duplicate guard from FindA.Sale's OWN record
// ('recorded_listing', no Vinted id) was kept for 30 days and outlived the record, so the popup kept the item out of Select all.
// Fix: such marks are never stored and never honoured; only a listing actually seen on Vinted (a remote id) is remembered.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const D = require('../fas-vinted-drafts.js');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const MUGIG = { id: 'cmt3aixuw01l1a4xvg5tgdun1', title: 'Mugig Guitar Instrument Cable, 1/4 Inch, Blue Woven Mesh', marketplaceListedVinted: false,
  localPickupOnly: false, eligibility: { VINTED: { eligible: true, reason: null } }, vintedCategoryId: 4957 };
const RESET_AT = Date.parse('2026-10-28T13:39:15.940Z');
const UPLOAD_NIGHT = Date.parse('2026-10-29T00:54:00Z');

test('a record-only mark from before the record was closed no longer hides the item from Select all', () => {
  const stale = { [MUGIG.id]: { kind: 'live', remoteId: null, at: RESET_AT - 2 * 3600 * 1000 } };
  assert.strictEqual(D.popupPresence(MUGIG, [], stale, UPLOAD_NIGHT), null);
  assert.deepStrictEqual(D.prunePresent(stale, UPLOAD_NIGHT), {});
  // FindA.Sale's live record still marks it (read fresh from the payload), and a listing seen on Vinted still does.
  assert.strictEqual(D.popupPresence(Object.assign({}, MUGIG, { marketplaceListedVinted: true }), [], {}, UPLOAD_NIGHT), 'live');
  assert.strictEqual(D.popupPresence(MUGIG, [], { [MUGIG.id]: { kind: 'live', remoteId: '7123456789', at: UPLOAD_NIGHT - 1000 } }, UPLOAD_NIGHT), 'live');
});

test('the popup Select-all set comes from that mark, so the fix lets the item back in', () => {
  const p = rd('popup.js');
  assert.ok(/const blocked = .*\|\| vintedLiveOnVinted\(it\);/.test(p), 'Select all skips items marked live on Vinted');
  const i = p.indexOf('async function loadVintedPresence()');
  const j = p.indexOf('const VINTED_POST_AGAIN_NOTE');
  const api = new Function('self', 'currentChannel', 'chrome', 'VINTED_PRESENT', p.slice(i, j) + '\nreturn { vintedLiveOnVinted };')(
    { FAS_VINTED_DRAFTS: D }, () => 'vinted', {}, { [MUGIG.id]: { kind: 'live', remoteId: null, at: RESET_AT - 1000 } });
  assert.strictEqual(api.vintedLiveOnVinted(MUGIG), false);
});

test('the fill-time guard stores only marks that carry a Vinted id', () => {
  const v = rd('fas-vinted.js');
  assert.ok(/if \(found\.hit\.remoteId\) present\[id\] = \{ kind: found\.hit\.kind, remoteId: String\(found\.hit\.remoteId\), at: Date\.now\(\) \};\n    else delete present\[id\];/.test(v));
  assert.ok(!/present\[id\] = \{ kind: found\.hit\.kind, remoteId: found\.hit\.remoteId \|\| null/.test(v));
});
