// fas-mercari-weight.js -- fills Mercari's "How heavy will the package be?" pound + ounce boxes (extension 1.0.19).
// Production diagnostic 2026-10-17 (HDE MIDI Cable, 1.0.18): weight_in_pounds was EMPTY while weight_in_ounces was filled and Next never enabled.
// Cause: for a package under a pound the pounds value is "0", and Mercari's box rejects a synthetic "0" (the old code only skipped the ounces
// "0"; it still tried to write the pounds "0", and the write was silently dropped). Now BOTH boxes are always filled (0 where needed): the normal
// write first, then a typed insert, then a React-tracker reset, and the caller is told exactly which box refused. Pure + injectable so it is unit tested.
// UNVERIFIED against real Mercari: the stub tests model the "0 does not stick" behaviour that was observed, not Mercari itself.
(function (root) {
  'use strict';
  function splitOunces(totalOz) {
    var t = Number(totalOz);
    if (totalOz == null || totalOz === '' || !isFinite(t) || t < 0) return null;
    var lbs = Math.floor(t / 16), oz = Math.round(t - lbs * 16);
    if (oz >= 16) { lbs += 1; oz = 0; }
    return { lbs: lbs, oz: oz };
  }
  function stuck(el, want) { return String(el.value) === String(want); }
  // setNative(el, value) is the caller's normal React-safe setter. doc is used only for the typed-insert fallback.
  function fillBox(el, want, setNative, doc) {
    var w = String(want);
    try { setNative(el, w); } catch (e) { /* try the fallbacks */ }
    if (stuck(el, w)) return { ok: true, via: 'native' };
    try {
      if (el.focus) el.focus();
      if (el.select) el.select();
      if (doc && typeof doc.execCommand === 'function') doc.execCommand('insertText', false, w);
    } catch (e) { /* next */ }
    if (stuck(el, w)) return { ok: true, via: 'typed' };
    try { if (el._valueTracker && typeof el._valueTracker.setValue === 'function') el._valueTracker.setValue(''); setNative(el, w); } catch (e) { /* next */ }
    if (stuck(el, w)) return { ok: true, via: 'tracker' };
    return { ok: false, via: 'none' };
  }
  // -> { ok, reason?, lbs, oz, lb:{ok,via}, ozBox:{ok,via}, failed:['pounds'|'ounces'] }
  function fillWeightBoxes(lbEl, ozEl, totalOz, setNative, doc) {
    var sp = splitOunces(totalOz);
    if (!sp) return { ok: false, reason: 'no_weight', failed: [] };
    if (!lbEl && !ozEl) return { ok: false, reason: 'no_fields', failed: [] };
    var out = { ok: true, lbs: sp.lbs, oz: sp.oz, failed: [] };
    if (lbEl) { out.lb = fillBox(lbEl, sp.lbs, setNative, doc); if (!out.lb.ok) out.failed.push('pounds'); }
    if (ozEl) { out.ozBox = fillBox(ozEl, sp.oz, setNative, doc); if (!out.ozBox.ok) out.failed.push('ounces'); }
    out.ok = out.failed.length === 0;
    if (!out.ok) out.reason = 'box_rejected_' + out.failed.join('_');
    return out;
  }
  var api = { splitOunces: splitOunces, fillWeightBoxes: fillWeightBoxes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  try { root.FAS_MERC_WEIGHT = api; } catch (e) { /* ignore */ }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
