// fas-posh-shipping.js -- injected on demand (chrome.scripting) into a Poshmark tab by background.js (fasPoshShipRun).
// Purpose (2026-10-14, Patrick: "it almost all seems to be free shipping which it shouldn't"): set the listing's
// Shipping Discount to "No Discount" on an own listing whose shipping_discount_type is "free", then verify.
// Verified in the live DOM 2026-10-14 (read-only): the edit page carries the Shipping Discount dropdown
// (ul.dropdown__menu > li > a[data-et-name="shipping_discount_item"] with spans "No Discount" / "$4.99" / "Free"), inside the
// listing-price modal opened by the "*Required" trigger input; save = [data-et-name="update"]; GET /vm-rest/posts/<id> returns
// shipping_discount_type ("free" | null). NOT verified: the click sequence itself (nothing was clicked) -- every step is checked and
// the result is confirmed by re-reading shipping_discount_type from the API, never assumed.
(function () {
  if (self.FAS_POSH_SHIP) return;
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
  function noDiscountItem() {
    return qa('a[data-et-name="shipping_discount_item"]').filter(function (a) { return /^\s*no discount\s*$/i.test(a.textContent || ''); })[0] || null;
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
        if (r.ok && r.post) out.push({ id: keys[k], status: r.post.status, ship: r.post.shipping_discount_type === undefined ? '(unknown)' : r.post.shipping_discount_type, title: String(r.post.title || '').slice(0, 70) });
      } catch (e) { /* skip one */ }
      await sleep(350);
    }
    return { rows: out, total: keys.length };
  }
  function closetPath() {
    var a = qa('a[href^="/closet/"]').map(function (x) { return (x.getAttribute('href') || '').split('?')[0]; }).filter(function (h) { return /^\/closet\/[^/]+\/?$/.test(h); })[0];
    return a || '';
  }
  // ctx: { id, phase } -- one action per call, like fas-edit-engine.
  async function step(ctx) {
    var id = ctx.id;
    if (/\/login|\/signup/.test(location.pathname)) return { state: 'blocked', code: 'login_required', reason: 'Poshmark is signed out' };
    if (!/^\/edit-listing\//.test(location.pathname)) return { state: 'goto', url: 'https://poshmark.com/edit-listing/' + id };
    var g = await getPost(id);
    if (g.status === 403 || g.status === 429) return { state: 'blocked', code: 'http_' + g.status, reason: 'GET post returned ' + g.status };
    if (!g.ok || !g.post) return fail('get_failed', 'GET post HTTP ' + g.status);
    var ship = g.post.shipping_discount_type;
    if (ctx.phase === 'verify') {
      if (ship !== 'free') return { state: 'done', details: { ship: ship == null ? 'none' : ship } };
      return fail('verify_still_free', 'After Update the listing still reports shipping_discount_type "free"');
    }
    if (ship !== 'free') return { state: 'done', details: { ship: ship == null ? 'none' : ship, already: true } };
    var item = await waitFor(noDiscountItem, 6000);
    if (!item) {
      var trig = qa('input.form__text[placeholder="*Required"]').filter(visible)[0] || q('input[data-vv-name="listingPrice"]');
      if (trig) { realClick(trig); await sleep(900); }
      item = await waitFor(noDiscountItem, 6000);
    }
    if (!item) return fail('no_discount_option_not_found', 'No a[data-et-name="shipping_discount_item"] "No Discount" on the edit page');
    var wrap = item.closest('.dropdown') || item.parentElement;
    var sel = wrap && q('.dropdown__selector', wrap);
    if (sel) { realClick(sel); await sleep(400); }
    realClick(item); await sleep(600);
    var shown = sel ? String(sel.innerText || '').trim() : '';
    if (/free/i.test(shown)) return fail('selection_did_not_take', 'Dropdown still shows "' + shown.slice(0, 30) + '"');
    var dlg = qa('[role="dialog"], .modal, [class*="modal" i]').filter(visible).pop();
    var done = qa('button', dlg || document).filter(function (b) { return visible(b) && /^\s*(done|apply|save|ok)\s*$/i.test(b.textContent || ''); })[0];
    if (done) { realClick(done); await sleep(700); }
    var upd = q('[data-et-name="update"]');
    if (!(upd && visible(upd))) upd = qa('button').filter(function (b) { return visible(b) && /^\s*(update|save)\s*$/i.test(b.textContent || ''); })[0];
    if (!upd || upd.disabled) return fail('update_button_not_found', 'No enabled Update button after choosing No Discount');
    setTimeout(function () { realClick(upd); }, 60);
    return { state: 'continue', delayMs: 4500, scratch: { phase: 'verify' } };
  }
  self.FAS_POSH_SHIP = { step: step, collect: collect, closetPath: closetPath };
})();
