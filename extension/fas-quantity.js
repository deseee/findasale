// fas-quantity.js -- shared content-script helper: sets a listing form's Quantity field to the item's current stock.
// (2026-10-16, kits / bundles: a kit's stock is derived server-side and arrives in the same stock fields as any item.)
//
// Loaded before each marketplace content script (see manifest.json). Deliberately conservative:
//  - Does nothing unless the form actually HAS a visible, enabled input that is labelled "Quantity" / "Qty"
//    (by label text, aria-label, name, id, placeholder or data-testid). Marketplaces whose sell form has no quantity
//    field (most of them: a Vinted / Craigslist / Facebook listing is one posting) are left completely untouched.
//  - Never throws, never blocks or fails a posting: a miss returns { filled: false, reason } and logs one console line.
//  - On a NEW listing it only writes when stock is more than 1 (the field defaults to 1). On an EDIT page
//    (opts.force) it writes whatever the current stock is, so a quantity drop is applied too.
//  - UNVERIFIED against live forms: no marketplace seller account was available to confirm which of them show a
//    Quantity input. The matching is generic on purpose; it is a no-op wherever the field does not exist.
(function () {
  if (self.FAS_QTY) return;
  var KEYS = ['quantity', 'stockRemaining', 'stockAvailable', 'availableStock', 'remainingStock', 'stock', 'stockQuantity'];
  function toInt(v) {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
    var n = Number(v);
    return isFinite(n) ? Math.floor(n) : null;
  }
  function itemQuantity(item) {
    if (!item) return 1;
    for (var i = 0; i < KEYS.length; i++) {
      var n = toInt(item[KEYS[i]]);
      if (n !== null) return Math.min(Math.max(n, 1), 999);
    }
    var total = toInt(item.stockTotal);
    if (total !== null) return Math.min(Math.max(total - (toInt(item.stockSold) || 0), 1), 999);
    return 1;
  }
  // True when the record carries any stock information (so an edit-page push never writes a made-up 1).
  function hasStockField(item) {
    if (!item) return false;
    for (var i = 0; i < KEYS.length; i++) if (toInt(item[KEYS[i]]) !== null) return true;
    return toInt(item.stockTotal) !== null;
  }
  var NAME_RE = /(^|[^a-z])(quantity|qty)([^a-z]|$)/i;
  var LABEL_RE = /^\s*(quantity|qty)\b[\s:*()0-9]{0,6}$/i;
  function visible(el) {
    if (!el || el.disabled || el.readOnly) return false;
    var r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    return !!r && r.width > 0 && r.height > 0;
  }
  function labelTextFor(el) {
    var out = [];
    try {
      if (el.id) { var l = document.querySelector('label[for="' + String(el.id).replace(/"/g, '') + '"]'); if (l) out.push(l.textContent); }
      var wrap = el.closest && el.closest('label'); if (wrap) out.push(wrap.textContent);
      var by = el.getAttribute && el.getAttribute('aria-labelledby');
      if (by) by.split(/\s+/).forEach(function (id) { var n = document.getElementById(id); if (n) out.push(n.textContent); });
    } catch (e) { /* ignore */ }
    return out;
  }
  function findQuantityInput() {
    var inputs = document.querySelectorAll('input');
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      var type = (el.getAttribute('type') || 'text').toLowerCase();
      if (['text', 'number', 'tel', ''].indexOf(type) === -1) continue;
      if (!visible(el)) continue;
      var attrs = [el.name, el.id, el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.getAttribute('data-testid'), el.getAttribute('data-vv-name')];
      if (attrs.some(function (a) { return a && NAME_RE.test(a); })) return el;
      if (labelTextFor(el).some(function (t) { return t && LABEL_RE.test(String(t).trim()); })) return el;
    }
    return null;
  }
  function setNative(el, value) {
    var proto = Object.getPrototypeOf(el);
    var desc = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  // item: a queue item (normalized: item.quantity) or a raw /extension/* record. Returns a small result object.
  function fillQuantity(item, opts) {
    try {
      var qty = itemQuantity(item);
      var force = !!(opts && opts.force);
      if (!force && qty <= 1) return { filled: false, reason: 'quantity_is_1', quantity: qty };
      var el = findQuantityInput();
      if (!el) {
        console.log('[FAS qty] no Quantity field on this form (quantity ' + qty + ' not entered)');
        return { filled: false, reason: 'no_quantity_field', quantity: qty };
      }
      if (String(el.value).trim() === String(qty)) return { filled: true, reason: 'already_set', quantity: qty };
      setNative(el, String(qty));
      var ok = String(el.value).trim() === String(qty);
      console.log('[FAS qty] set Quantity to ' + qty + (ok ? '' : ' (value did not stick)'));
      return { filled: ok, reason: ok ? 'set' : 'value_did_not_stick', quantity: qty };
    } catch (e) {
      console.log('[FAS qty] skipped: ' + (e && e.message));
      return { filled: false, reason: 'error', quantity: 1 };
    }
  }
  self.FAS_QTY = { hasStockField: hasStockField, itemQuantity: itemQuantity, findQuantityInput: findQuantityInput, fillQuantity: fillQuantity };
})();
