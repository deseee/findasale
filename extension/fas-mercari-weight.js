// fas-mercari-weight.js -- fills Mercari's "How heavy will the package be?" pound + ounce boxes (1.0.19) and answers its shoebox question (1.0.20).
// 1.0.20 (live-verified on mercari.com/sell, signed in): the weight dialog holds pounds (may stay EMPTY for sub-pound packages), ounces, the question
// "Will your item fit in a shoebox? 14x10x5" (radios id/value yes|no, rendered as <label>Yes/No</label>) and a Next button that is DISABLED until that
// question is answered. Empty pounds is NOT the blocker; the unanswered shoebox question is. This file now also decides + clicks that answer.
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
    // 1.0.20: an empty pounds box is fine for a sub-pound package (live-verified) -- only a rejected OUNCES box (or a rejected non-zero pounds) is a failure.
    if (out.failed.indexOf('pounds') !== -1 && sp.lbs === 0 && (!ozEl || out.ozBox.ok)) { out.failed.splice(out.failed.indexOf('pounds'), 1); out.poundsEmptyOk = true; }
    out.ok = out.failed.length === 0;
    if (!out.ok) out.reason = 'box_rejected_' + out.failed.join('_');
    return out;
  }
  // ---- 1.0.20: shoebox question ----
  var BOX = [14, 10, 5];
  function num(v) { if (v == null || v === '') return null; var n = Number(v); return isFinite(n) && n > 0 ? n : null; }
  // item: { packageLengthIn, packageWidthIn, packageHeightIn }. legacyFits: the older volume-tolerance verdict (true/false/null) kept so a thin foldable item
  // Patrick already approved as "fits" is not turned into "No" by the strict per-axis rule. -> { fits, basis, dims, unknownDims }
  function shoeboxDecision(item, totalOz, legacyFits) {
    item = item || {};
    var l = num(item.packageLengthIn), w = num(item.packageWidthIn), h = num(item.packageHeightIn);
    if (l != null && w != null && h != null) {
      var d = [l, w, h].sort(function (a, b) { return b - a; });
      var strict = d[0] <= BOX[0] && d[1] <= BOX[1] && d[2] <= BOX[2];
      var fits = strict || legacyFits === true;
      return { fits: fits, basis: strict ? 'dimensions-strict' : (legacyFits === true ? 'dimensions-volume-tolerance' : 'dimensions-too-big'), dims: { l: l, w: w, h: h }, unknownDims: false };
    }
    var t = Number(totalOz);
    var light = totalOz != null && totalOz !== '' && isFinite(t) && t < 16;
    return { fits: light, basis: light ? 'guess-no-dims-under-1lb' : 'guess-no-dims-1lb-or-more', dims: null, unknownDims: true };
  }
  function lc(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function ancestorText(el, levels) {
    var cur = el, t = '';
    for (var i = 0; i < levels && cur; i++) { cur = cur.parentElement; if (cur) t = cur.textContent || ''; if (/shoebox/i.test(t)) return t; }
    return t;
  }
  // -> the radio <input> for 'yes' | 'no', or null. testid first, then id/value, preferring one whose surroundings mention the shoebox.
  function findShoeboxRadio(doc, ans) {
    var cap = ans === 'yes' ? 'Yes' : 'No';
    var byTid = doc.querySelector('input[data-testid="FitsInShoebox' + cap + '"]');
    if (byTid) return byTid;
    var list = [];
    try { list = Array.prototype.slice.call(doc.querySelectorAll('input[type="radio"]')); } catch (e) { list = []; }
    var cands = list.filter(function (r) { return lc(r.id) === ans || lc(r.value) === ans; });
    var near = cands.filter(function (r) { return /shoebox/i.test(ancestorText(r, 6)); });
    return near[0] || cands[0] || null;
  }
  function labelFor(doc, radio, ans) {
    var cap = ans === 'yes' ? 'Yes' : 'No';
    var lab = null;
    try { if (radio.id) lab = doc.querySelector('label[for="' + radio.id + '"]'); } catch (e) { lab = null; }
    if (!lab && radio.closest) lab = radio.closest('label');
    if (!lab && radio.parentElement) {
      var sibs = Array.prototype.slice.call(radio.parentElement.querySelectorAll('label'));
      lab = sibs.filter(function (x) { return lc(x.textContent) === lc(cap); })[0] || null;
    }
    return lab;
  }
  // Clicks the visible LABEL first (the real radio is hidden), then the input itself only if the radio did not register. deps.click is the caller's realClick.
  async function answerShoebox(doc, fits, deps) {
    var ans = fits ? 'yes' : 'no';
    var radio = findShoeboxRadio(doc, ans);
    if (!radio) return { ok: false, answer: ans, reason: 'radio_not_found' };
    var lab = labelFor(doc, radio, ans), via = 'input';
    if (lab) { await deps.click(lab); via = 'label'; if (deps.sleep) await deps.sleep(150); }
    if (!radio.checked) { await deps.click(radio); via = lab ? 'label+input' : 'input'; if (deps.sleep) await deps.sleep(150); }
    return { ok: !!radio.checked, answer: ans, via: via, reason: radio.checked ? undefined : 'not_checked_after_click' };
  }
  // Diagnostics: which shoebox radios exist and which is selected (null = unanswered / not present).
  function shoeboxRadioState(doc) {
    var y = findShoeboxRadio(doc, 'yes'), n = findShoeboxRadio(doc, 'no');
    return { present: !!(y || n), yesChecked: y ? !!y.checked : null, noChecked: n ? !!n.checked : null, selected: y && y.checked ? 'yes' : (n && n.checked ? 'no' : null) };
  }
  // 1.0.21: Mercari's Smart Pricing toggle ignores a bare element.click() (live: aria-pressed stayed "true" after 1.8s) but flips on the full pointer sequence (deps.click = realClick).
  // 1.0.24 (live-verified on the signed-in /sell/ form): the click DOES turn it OFF, but React then REPLACES the button node -- the old node stays isConnected=false with a stale
  // aria-pressed="true" while a fresh query shows "false". So the caller passes a GETTER (getBtn, a function returning the live button or null) and this re-queries on EVERY poll and
  // before EVERY click; state is always read from the freshly queried node. A missing node (mid re-render) is waited for, never treated as a failure or a click target.
  // A plain element is still accepted (wrapped as a constant getter). Polls up to waitMs after each click, 1 + `retries` clicks at most, never clicks when the live node is OFF.
  // Returns { ok, attempts, state } (state = last live aria-pressed, or null if no button was found).
  async function setToggleOff(getBtn, deps, opts) {
    opts = opts || {};
    var waitMs = opts.waitMs != null ? opts.waitMs : 2000, step = opts.stepMs != null ? opts.stepMs : 100, retries = opts.retries != null ? opts.retries : 2;
    var get = typeof getBtn === 'function' ? getBtn : function () { return getBtn; };
    var live = function () { var b = null; try { b = get(); } catch (e) { b = null; } return b || null; };
    var state = function () { var b = live(); return b ? b.getAttribute('aria-pressed') : null; };
    // Waits (up to waitMs) for the live button to exist; returns its state or null.
    var settle = async function () {
      var s = state(), waited = 0;
      while (s == null && waited < waitMs) { await deps.sleep(step); waited += step; s = state(); }
      return s;
    };
    var s0 = await settle();
    if (s0 == null) return { ok: false, attempts: 0, state: null };
    if (s0 !== 'true') return { ok: true, attempts: 0, state: s0 };
    var attempts = 0;
    for (var a = 0; a <= retries; a++) {
      var pre = await settle();                       // re-query right before the click
      if (pre === 'false') return { ok: true, attempts: attempts, state: 'false' };   // flipped late: never click again
      if (pre == null) break;                         // node never came back: do not click blind
      attempts++;
      await deps.click(live());
      var waited = 0;
      while (waited <= waitMs) {
        if (state() === 'false') return { ok: true, attempts: attempts, state: 'false' };
        await deps.sleep(step); waited += step;
      }
    }
    var last = state();
    return { ok: last === 'false', attempts: attempts, state: last };
  }
  var api = { setToggleOff: setToggleOff, splitOunces: splitOunces, fillWeightBoxes: fillWeightBoxes, shoeboxDecision: shoeboxDecision, findShoeboxRadio: findShoeboxRadio, answerShoebox: answerShoebox, shoeboxRadioState: shoeboxRadioState };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  try { root.FAS_MERC_WEIGHT = api; } catch (e) { /* ignore */ }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
