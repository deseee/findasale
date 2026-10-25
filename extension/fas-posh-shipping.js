// fas-posh-shipping.js -- injected on demand (chrome.scripting) into a Poshmark tab by background.js (fasPoshShipRun).
// Purpose (2026-10-14, Patrick: "it almost all seems to be free shipping which it shouldn't"): set the listing's
// Shipping Discount to "No Discount" on an own listing that has a seller-paid shipping discount, then verify.
// 1.0.64: the setting is read from seller_shipping_discount.discount_amount (see shipState), never shipping_discount_type.
// Verified in the live DOM 2026-10-14 (read-only): the edit page carries the Shipping Discount dropdown
// (ul.dropdown__menu > li > a[data-et-name="shipping_discount_item"] with spans "No Discount" / "$4.99" / "Free"), inside the
// listing-price modal opened by the "*Required" trigger input; save = [data-et-name="update"]; GET /vm-rest/posts/<id> returns
// shipping_discount_type ("free" | null). NOT verified: the click sequence itself (nothing was clicked) -- every step is checked and
// the result is confirmed by re-reading shipping_discount_type from the API, never assumed.
(function () {
  if (self.FAS_POSH_SHIP && self.FAS_POSH_SHIP.v >= 3) return;
  var VER = '2.55';
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function q(s, r) { return (r || document).querySelector(s); }
  function qa(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function visible(el) { if (!el) return false; var b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; }
  async function waitFor(fn, ms) { var end = Date.now() + (ms || 8000); while (Date.now() < end) { var v = fn(); if (v) return v; await sleep(250); } return null; }
  function realClick(el) {
    if (!el) return;
    var t = el;
    var b = t.getBoundingClientRect();
    var o = { bubbles: true, cancelable: true, composed: true, view: window, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, button: 0, buttons: 1 };
    t.dispatchEvent(new PointerEvent('pointerdown', o)); t.dispatchEvent(new MouseEvent('mousedown', o));
    t.dispatchEvent(new PointerEvent('pointerup', o)); t.dispatchEvent(new MouseEvent('mouseup', o)); t.dispatchEvent(new MouseEvent('click', o));
  }
  async function getPost(id) {
    var res = await fetch('/vm-rest/posts/' + id + '?app_version=' + VER + '&_=' + Date.now(), { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
    var j = null; try { j = await res.json(); } catch (e) { /* ignore */ }
    var p = j && (j.data || j.post || j);
    return { status: res.status, ok: res.ok, post: p && typeof p === 'object' ? p : null };
  }
  function fail(code, reason) { return { state: 'fail', code: code, reason: reason }; }
  // 1.0.64: shipping_discount_type is NOT the shipping setting. Live-read 2026-10-25 (GET /vm-rest/posts/<id>, all 48 published
  // listings in the closet): every one reports shipping_discount_type "free" while seller_shipping_discount is
  // { id, discount_amount: { val: "0.0", currency_code: "USD" }, label: "Buyer Shipping: $6.49" } and the edit form's Shipping
  // Discount dropdown reads "No Discount". Judging by shipping_discount_type made every listing look wrong forever (1,300+
  // verify_still_free failures, every listing re-opened and Update-clicked each cycle). The real setting is
  // seller_shipping_discount.discount_amount.val: 0 = No Discount (buyer pays), > 0 = a seller-paid discount ($4.99 or Free).
  // Returns 'no_discount' | 'discounted' | 'unknown' (field missing / unreadable -> never acted on).
  function shipState(post) {
    var d = post && post.seller_shipping_discount;
    if (!d || typeof d !== 'object') return 'unknown';
    var amt = d.discount_amount;
    var raw = amt && typeof amt === 'object' ? amt.val : amt;
    var n = raw == null || raw === '' ? NaN : Number(String(raw).replace(/[^0-9.\-]/g, ''));
    if (!isFinite(n)) return 'unknown';
    return n === 0 ? 'no_discount' : 'discounted';
  }
  function shipLabel(post) {
    var d = post && post.seller_shipping_discount;
    var amt = d && d.discount_amount;
    return String((d && d.label) || '').slice(0, 40) + ' / discount ' + String(amt && typeof amt === 'object' ? amt.val : amt);
  }
  function isNoDiscountText(t) { return /^\s*no discount\s*$/i.test(String(t || '')); }
  // The edit page has TWO Shipping Discount dropdowns (live DOM 2026-10-25): one on the main form (always visible), and one inside
  // the hidden listing-price-suggestion modal. The old code took the first a[data-et-name="shipping_discount_item"] in the
  // document -- the hidden modal copy -- clicked it without the modal open, then looked for the modal's Done (not visible:
  // "modalDone: none") and clicked Update on an unchanged form.
  function priceModal() { return q('.listing-price-suggestion-modal'); }
  function mainDropdown() {
    return qa('.seller-shipping-discount .dropdown').filter(function (d) { return !d.closest('.modal') && visible(d); })[0] || null;
  }
  function modalDropdown() {
    var m = priceModal();
    return m && visible(m) ? qa('.seller-shipping-discount .dropdown', m).filter(visible)[0] || null : null;
  }
  function selectorText(dd) { var s = dd && q('.dropdown__selector', dd); return s ? String(s.innerText || s.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
  function noDiscountIn(dd) {
    return dd ? qa('a[data-et-name="shipping_discount_item"]', dd).filter(function (a) { return isNoDiscountText(a.textContent); })[0] || null : null;
  }
  function mainPriceInput() {
    return qa('input[data-vv-name="listingPrice"]').filter(function (i) { return !i.closest('.modal') && visible(i); })[0] || null;
  }
  // Open dd's menu, click its visible "No Discount" item, confirm the selector now reads No Discount.
  async function pickNoDiscount(dd) {
    var sel = q('.dropdown__selector', dd);
    if (sel) { realClick(sel); await sleep(500); }
    var item = await waitFor(function () { var a = noDiscountIn(dd); return a && visible(a) ? a : null; }, 4000);
    if (!item) return { ok: false, why: 'no_discount_item_not_visible' };
    realClick(item); await sleep(600);
    var shown = selectorText(dd);
    return { ok: isNoDiscountText(shown), shown: shown.slice(0, 30), why: isNoDiscountText(shown) ? '' : 'selection_did_not_take' };
  }
  // Collect the ids of the signed-in seller's own closet listings that are published, plus their current shipping type.
  async function collect() {
    var last = 0, same = 0;
    for (var i = 0; i < 45 && same < 3; i++) {
      window.scrollTo(0, document.body.scrollHeight); await sleep(1100);
      var n = new Set(qa('a[href*="/listing/"]').map(function (a) { return a.href; })).size;
      same = n === last ? same + 1 : 0; last = n;
    }
    var ids = {};
    qa('a[href*="/listing/"]').forEach(function (a) { var m = /([0-9a-f]{24})/.exec(a.href); if (m) ids[m[1]] = 1; });
    var out = [];
    var keys = Object.keys(ids);
    for (var k = 0; k < keys.length; k++) {
      try {
        var r = await getPost(keys[k]);
        if (r.status === 403 || r.status === 429) return { blocked: 'http_' + r.status, rows: out };
        if (r.ok && r.post) out.push({ id: keys[k], status: r.post.status, nd: shipState(r.post), ship: shipLabel(r.post), title: String(r.post.title || '').slice(0, 70) });
      } catch (e) { /* skip one */ }
      await sleep(350);
    }
    return { rows: out, total: keys.length };
  }
  function closetPath() {
    var a = qa('a[href^="/closet/"]').map(function (x) { return (x.getAttribute('href') || '').split('?')[0]; }).filter(function (h) { return /^\/closet\/[^/]+\/?$/.test(h); })[0];
    return a || '';
  }
  function norm(t) { return String(t || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function textOf(el) { return norm(el && (el.innerText || el.textContent)); }
  var BTN_SEL = 'button, [role="button"], input[type="submit"], input[type="button"], a[role="button"]';
  function btnLabel(el) { return norm(el.getAttribute('aria-label') || el.value || el.innerText || el.textContent || ''); }
  function isDisabled(el) { return !!(el && (el.disabled || el.getAttribute('aria-disabled') === 'true')); }
  function buttons() { return qa(BTN_SEL).filter(function (b) { return visible(b) && !isDisabled(b); }); }
  function visibleLabels() { return buttons().map(btnLabel).filter(Boolean).slice(0, 25).map(function (l) { return l.slice(0, 40); }); }
  function pageText() { return ((document.body && document.body.innerText) || '').slice(0, 4000); }
  // 1.0.63: the edit form does not save on Update alone. Live-confirmed 2026-10-23 on the price-edit path (fas-edit-engine.js
  // posh_verify_only, extension 1.0.62): after Update Poshmark shows a "Share Listing" screen whose "List This Item" button is
  // what actually saves, and for breakable items two packing acknowledgements ("Fragile Item Detected" -> Publish Listing, then
  // "... not be compensating me" -> Publish). This script clicked Update and went straight to verify, so the No Discount change
  // was never saved: 1,317 verify_still_free errors 2026-10-15..10-23 and not one success. Click exactly those steps, nothing
  // else; any certify / suspicious / verification prompt stops the run for the person.
  async function finishSave() {
    var clicks = [];
    for (var n = 0; n < 8; n++) {
      var ack = null, which = '';
      buttons().forEach(function (b) {
        var mt = textOf(b.closest('.modal, [role="dialog"]'));
        var lb = btnLabel(b);
        if (lb === 'publish' && /not be compensating/.test(mt)) { ack = b; which = 'fragile_confirm'; }
        else if (lb === 'publish listing' && /potential breakable item/.test(mt) && which !== 'fragile_confirm') { ack = b; which = 'fragile'; }
      });
      if (ack) { clicks.push(which); realClick(ack); await sleep(2500); continue; }
      var share = buttons().filter(function (b) { return /^list this item$/.test(btnLabel(b)); }).pop();
      if (share && /share listing/i.test(pageText())) { clicks.push('list_this_item'); realClick(share); await sleep(2500); continue; }
      break;
    }
    return clicks;
  }
  function flaggedPrompt() {
    var t = qa('[role="dialog"], .modal, [class*="error" i], [class*="toast" i]').filter(visible).map(textOf).join(' ').slice(0, 2000);
    return /suspicious|certify|single listing creation|verify (that )?you|are you a robot/i.test(t);
  }
  // ctx: { id, phase, ... } -- one action per call, like fas-edit-engine. Phases: '' (apply + Update) -> 'finish' (Share
  // Listing / fragile steps) -> 'verify' (re-read shipping_discount_type from the API; one re-read after a pause before failing).
  async function step(ctx) {
    var id = ctx.id;
    if (/\/login|\/signup/.test(location.pathname)) return { state: 'blocked', code: 'login_required', reason: 'Poshmark is signed out' };
    if (ctx.phase === 'finish') {
      await sleep(800);
      var clicks = await finishSave();
      if (flaggedPrompt()) return { state: 'blocked', code: 'poshmark_flagged', reason: 'Poshmark showed a certify/verification prompt after Update, so the change needs you' };
      return { state: 'continue', delayMs: 3500, scratch: { phase: 'verify', finishClicks: clicks, afterUpdatePath: location.pathname.slice(0, 60), afterUpdateButtons: clicks.length ? undefined : visibleLabels() } };
    }
    // 1.0.64: read the listing BEFORE opening its edit page, so an already-correct listing is never opened or touched.
    var g = await getPost(id);
    if (g.status === 403 || g.status === 429) return { state: 'blocked', code: 'http_' + g.status, reason: 'GET post returned ' + g.status };
    if (!g.ok || !g.post) return fail('get_failed', 'GET post HTTP ' + g.status);
    var state = shipState(g.post);
    if (ctx.phase !== 'verify' && state === 'no_discount') return { state: 'done', details: { ship: shipLabel(g.post), already: true } };
    if (ctx.phase !== 'verify' && state === 'unknown') return fail('shipping_unreadable', 'GET post has no readable seller_shipping_discount.discount_amount; not touching this listing');
    if (ctx.phase !== 'verify' && !/^\/edit-listing\//.test(location.pathname)) return { state: 'goto', url: 'https://poshmark.com/edit-listing/' + id };
    if (ctx.phase === 'verify') {
      if (state === 'no_discount') return { state: 'done', details: { ship: shipLabel(g.post), finishClicks: ctx.finishClicks || [] } };
      if (!ctx.reread) return { state: 'continue', delayMs: 4000, scratch: { reread: true } };
      var r = fail('verify_still_discounted', 'After Update the listing still reports seller_shipping_discount ' + shipLabel(g.post) + (ctx.finishClicks && ctx.finishClicks.length ? ' (clicked: ' + ctx.finishClicks.join(', ') + ')' : ' (no Share Listing or packing step was found after Update)'));
      r.diag = { via: ctx.via || '', picked: ctx.picked || '', modalDone: ctx.modalDone || '', finishClicks: ctx.finishClicks || [], afterUpdatePath: ctx.afterUpdatePath || '', afterUpdateButtons: ctx.afterUpdateButtons || [], now: location.pathname.slice(0, 60), status: g.post.status || '', ship: shipLabel(g.post) };
      return r;
    }
    var dd = await waitFor(mainDropdown, 8000);
    var via = 'main_form', modalDone = 'n/a', res = null;
    if (dd) {
      if (isNoDiscountText(selectorText(dd))) { var al = fail('form_already_no_discount', 'Poshmark says ' + shipLabel(g.post) + ' but the edit form already reads No Discount; not clicking Update on an unchanged form'); al.diag = { via: via, path: location.pathname.slice(0, 60) }; return al; }
      res = await pickNoDiscount(dd);
    } else {
      // Fallback: the dropdown inside the listing-price modal. Open the modal properly (click the main Listing Price input),
      // pick No Discount there, then click the modal's own Done.
      via = 'price_modal';
      var trig = mainPriceInput();
      if (trig) { realClick(trig); await sleep(900); }
      var mdd = await waitFor(modalDropdown, 6000);
      if (!mdd) { var nf = fail('no_discount_option_not_found', 'No visible Shipping Discount dropdown on the edit form or in the price modal'); nf.diag = { buttons: visibleLabels(), path: location.pathname.slice(0, 60), trigger: !!trig }; return nf; }
      if (isNoDiscountText(selectorText(mdd))) { var al2 = fail('form_already_no_discount', 'Price modal already reads No Discount; not clicking Update on an unchanged form'); al2.diag = { via: via }; return al2; }
      res = await pickNoDiscount(mdd);
      var m = priceModal();
      var done = m && qa('button', m).filter(function (b) { return visible(b) && /^\s*done\s*$/i.test(b.textContent || ''); }).pop();
      modalDone = done ? 'done' : 'none';
      if (done && res.ok) { realClick(done); await waitFor(function () { return !visible(priceModal()); }, 4000); await sleep(300); }
      if (!done && res.ok) { var nd = fail('modal_done_not_found', 'Picked No Discount in the price modal but its Done button was not visible; not clicking Update'); nd.diag = { via: via, buttons: visibleLabels() }; return nd; }
    }
    if (!res.ok) { var st = fail(res.why || 'selection_did_not_take', 'Could not set the Shipping Discount dropdown to No Discount (shows "' + (res.shown || '') + '")'); st.diag = { via: via, modalDone: modalDone, buttons: visibleLabels() }; return st; }
    var upd = q('[data-et-name="update"]');
    if (!(upd && visible(upd))) upd = qa('button').filter(function (b) { return visible(b) && /^\s*(update|save)\s*$/i.test(b.textContent || ''); })[0];
    if (!upd || upd.disabled) { var nu = fail('update_button_not_found', 'No enabled Update button after choosing No Discount'); nu.diag = { via: via, picked: res.shown, modalDone: modalDone, buttons: visibleLabels() }; return nu; }
    setTimeout(function () { realClick(upd); }, 60);
    return { state: 'continue', delayMs: 4000, scratch: { phase: 'finish', via: via, picked: res.shown, modalDone: modalDone } };
  }
  self.FAS_POSH_SHIP = { v: 3, step: step, collect: collect, closetPath: closetPath, shipState: shipState };
})();
