// fas-edit-engine.js -- DOM/API engine for automatic price + quantity edits on live listings (2026-10-13).
//
// NOT a manifest content script. background.js injects it on demand (chrome.scripting.executeScript, files:
// fas-edit-core.js, fas-quantity.js, fas-edit-engine.js) into the dedicated tab it opened for an edit run, then calls
// self.FAS_EDIT_ENGINE.step(ctx) repeatedly. Why this shape: marketplace edit flows span page navigations, and a
// navigation destroys the page's JS context, so the state machine lives in background.js (ctx.scratch is persisted there
// between calls) and each call here does at most ONE action and RETURNS BEFORE any click that may navigate (clicks are
// deferred ~80 ms), so the result is never lost to a teardown.
//
// step(ctx) -> { state, scratch?, diag?, delayMs?, url?, code?, reason?, selector?, step?, details? }
//   state 'continue' : run step again after delayMs (background also waits for any navigation to finish)
//   state 'goto'     : navigate the tab to url, then run step again
//   state 'done'     : the new value was READ BACK from the live listing and matches (details.verified === true)
//   state 'fail'     : this item failed (code/reason/selector/step say exactly which control or step); retried later
//   state 'blocked'  : login wall, challenge, CAPTCHA, 403/429, "action blocked": stop the whole platform run
//
// Self-verifying: nothing here returns 'done' without re-reading the field/API value after the save. Every fail/blocked
// carries a diagnostics snapshot (form field names, aria-labels, button texts, recent network URLs) that the popup lets the
// organizer copy, so the first real run yields the exact data needed to tighten the selectors.
//
// SELECTOR PROVENANCE tags used in comments:  [existing]  derived from this repo's live-confirmed code;
// [documented] from the cited public source in the research notes;  [guess] new, unverified -- discovery + diagnostics cover it.
(function () {
  'use strict';
  if (self.FAS_EDIT_ENGINE) return;
  var C = self.FAS_EDIT_CORE;
  if (!C) { self.FAS_EDIT_ENGINE = { step: async function () { return { state: 'fail', code: 'core_missing', reason: 'fas-edit-core.js not loaded' }; } }; return; }

  // ===================================================================================================================
  // Generic helpers
  // ===================================================================================================================
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function norm(s) { return C.foldTitle(s); }
  // ---- narration + diagnostics (fas-trace.js). Every call is guarded: a missing/broken FAS_TRACE must never change an edit result. ----
  var oldSeen = null;      // the price this run read from the live listing BEFORE changing it (carried between page loads in scratch.oldPrice)
  var traceKey = '', lastWhat = '';
  function T() { try { return self.FAS_TRACE || null; } catch (e) { return null; } }
  function tStep(what, why, ctx) { try { var t = T(); if (t && what !== lastWhat) { lastWhat = what; t.step(what, why, ctx); } } catch (e) { /* never break the edit */ } }
  function tLog(level, code, msg, ctx) { try { var t = T(); if (!t) return; if (level === 'warn') t.warn(code, msg, ctx); else if (level === 'error') t.error(code, msg, ctx); else t.info(code, msg, ctx); } catch (e) { /* ignore */ } }
  function money(platform, v) { try { return v == null ? '?' : '$' + C.formatPrice(platform, v); } catch (e) { return String(v); } }
  function q(sel, root) { try { return (root || document).querySelector(sel); } catch (e) { return null; } }
  function qa(sel, root) { try { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); } catch (e) { return []; } }
  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    var st = null;
    try { st = getComputedStyle(el); } catch (e) { /* ignore */ }
    return !(st && (st.visibility === 'hidden' || st.display === 'none'));
  }
  function isDisabled(el) {
    return !!(el && (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.getAttribute('disabled') !== null && el.getAttribute('disabled') !== 'false' && el.tagName !== 'A'));
  }
  function textOf(el) { return norm((el && (el.innerText || el.textContent)) || ''); }
  async function waitFor(fn, ms, every) {
    var end = Date.now() + (ms || 8000);
    var gap = every || 250;
    for (;;) {
      var v = null;
      try { v = fn(); } catch (e) { v = null; }
      if (v) return v;
      if (Date.now() >= end) return null;
      await sleep(gap);
    }
  }
  // Full pointer/mouse sequence (same recipe as fas-selectors.js realClick, live-confirmed on Facebook).
  async function realClick(el) {
    try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) { /* ignore */ }
    await new Promise(function (r) { requestAnimationFrame(function () { setTimeout(r, 60); }); });
    var rect = el.getBoundingClientRect();
    var cx = Math.round(rect.left + rect.width / 2), cy = Math.round(rect.top + rect.height / 2);
    var base = { bubbles: true, cancelable: true, composed: true, button: 0, view: window, clientX: cx, clientY: cy };
    function ptr(type, buttons) { return new PointerEvent(type, Object.assign({}, base, { pointerId: 1, isPrimary: true, pointerType: 'mouse', buttons: buttons })); }
    function mouse(type, buttons) { return new MouseEvent(type, Object.assign({}, base, { buttons: buttons })); }
    el.dispatchEvent(ptr('pointerover', 0)); el.dispatchEvent(ptr('pointerenter', 0)); el.dispatchEvent(ptr('pointermove', 0));
    el.dispatchEvent(ptr('pointerdown', 1)); el.dispatchEvent(mouse('mousedown', 1));
    try { if (typeof el.focus === 'function') el.focus(); } catch (e) { /* ignore */ }
    el.dispatchEvent(ptr('pointerup', 0)); el.dispatchEvent(mouse('mouseup', 0));
    // A native submit/anchor needs the real .click() so the browser performs the default action; synthetic mouse events alone do not.
    if (typeof el.click === 'function') el.click(); else el.dispatchEvent(mouse('click', 0));
  }
  // Click that may navigate or tear the page down: fire after the step has returned its result.
  function deferClick(el) { setTimeout(function () { realClick(el).catch(function () { /* page may be gone */ }); }, 80); }
  function setNative(el, value) {
    var proto = Object.getPrototypeOf(el);
    var desc = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    try { el.focus(); } catch (e) { /* ignore */ }
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  // A react-controlled input sometimes ignores the first write; select-all + native setter + re-check.
  async function writeField(el, value) {
    var before = '', kind = 'field';
    try {
      before = String(el.value == null ? '' : el.value);
      var hh = hintsOf(el);
      kind = /quantity|qty|stock/i.test(hh) ? 'quantity' : (/price/i.test(hh) && !/floor|minimum|original|shipping/i.test(hh) ? 'price' : 'field');
      if (kind === 'price' && oldSeen == null) { var po = C.parsePriceText(before); if (po != null) oldSeen = po; }
    } catch (e) { /* ignore */ }
    setNative(el, String(value));
    await sleep(150);
    var okNow = String(el.value).trim() === String(value);
    if (!okNow) {
      try { el.select && el.select(); } catch (e) { /* ignore */ }
      setNative(el, String(value));
      await sleep(250);
      okNow = C.parsePriceText(el.value) === C.parsePriceText(value);
    }
    tLog(okNow ? 'info' : 'warn', okNow ? 'field_written' : 'field_not_sticking', (okNow ? 'Changed the ' + kind + ' field from "' + before + '" to "' + value + '"' : 'The ' + kind + ' field would not keep "' + value + '" (it shows "' + el.value + '")'), { kind: kind, from: before, to: String(value), hints: (function () { try { return hintsOf(el).slice(0, 120); } catch (e) { return ''; } })() });
    return okNow;
  }
  function labelText(el) {
    var out = [];
    try {
      if (el.id) { var l = document.querySelector('label[for="' + String(el.id).replace(/"/g, '') + '"]'); if (l) out.push(l.textContent); }
      var wrap = el.closest && el.closest('label'); if (wrap) out.push(wrap.textContent);
      var by = el.getAttribute && el.getAttribute('aria-labelledby');
      if (by) by.split(/\s+/).forEach(function (id) { var n = document.getElementById(id); if (n) out.push(n.textContent); });
    } catch (e) { /* ignore */ }
    return out.join(' ').replace(/\s+/g, ' ').trim();
  }
  function hintsOf(el) {
    return [el.name, el.id, el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.getAttribute('data-testid'), el.getAttribute('data-vv-name'), labelText(el)]
      .filter(Boolean).join(' | ');
  }
  // First visible text-like input whose name/id/aria/placeholder/testid/label matches `want` and not `not`.
  function findInput(want, not, root) {
    var inputs = qa('input, textarea', root);
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      var type = (el.getAttribute('type') || 'text').toLowerCase();
      if (['text', 'number', 'tel', 'search', ''].indexOf(type) === -1 && el.tagName !== 'TEXTAREA') continue;
      if (!visible(el) || el.disabled) continue;
      var h = hintsOf(el);
      if (want.test(h) && !(not && not.test(h))) return el;
    }
    return null;
  }
  // <span>Price</span> followed by a sibling <input> (the structure of Facebook's composer; the open-source FB bot's anchor [documented]).
  function inputAfterLabelSpan(labelRe, root) {
    var spans = qa('span, label, div', root);
    for (var i = 0; i < spans.length; i++) {
      var s = spans[i];
      if (s.children.length > 2) continue;
      var t = norm(s.textContent);
      if (!t || t.length > 24 || !labelRe.test(t)) continue;
      var lab = s.closest && s.closest('label');
      var inp = (lab && lab.querySelector('input, textarea')) || (s.nextElementSibling && s.nextElementSibling.tagName === 'INPUT' ? s.nextElementSibling : null) ||
        (s.parentElement && s.parentElement.querySelector('input'));
      if (inp && visible(inp) && !inp.disabled) return inp;
    }
    return null;
  }
  var BTN_SEL = 'button, [role="button"], input[type="submit"], input[type="button"], a[role="button"], [role="menuitem"]';
  function btnLabel(el) { return norm(el.getAttribute('aria-label') || el.value || el.innerText || el.textContent || ''); }
  // Visible, enabled control whose whole label matches `re`. Optionally scoped to root.
  function findButton(re, root) {
    var all = qa(BTN_SEL, root).filter(function (b) { return visible(b) && !isDisabled(b); });
    var hits = all.filter(function (b) { return re.test(btnLabel(b)); });
    return hits.length ? hits[hits.length - 1] : null;
  }
  function pageText() { return ((document.body && document.body.innerText) || '').slice(0, 4000); }
  function pageBlock() { return C.classifyBlock(document.title, pageText(), location.href); }
  function passwordSurface() {
    var p = qa('input[type="password"]').filter(visible);
    return p.length > 0;
  }
  function visibleErrorText() {
    var els = qa('[role="alert"], .notification--error, .error, .errors, [class*="error" i], [class*="invalid" i], [aria-invalid="true"]').filter(visible);
    var txt = els.map(function (e) { return (e.innerText || e.textContent || '').trim(); }).filter(function (t) { return t && t.length < 200; });
    return txt.slice(0, 3).join(' / ').slice(0, 220);
  }

  // ---- diagnostics ---------------------------------------------------------------------------------------------------
  function recentRequests() {
    try {
      return performance.getEntriesByType('resource')
        .filter(function (e) { return e.initiatorType === 'fetch' || e.initiatorType === 'xmlhttprequest'; })
        .slice(-14).map(function (e) { return { url: C.safeUrl(e.name), t: e.initiatorType, ms: Math.round(e.duration) }; });
    } catch (e) { return []; }
  }
  function snapshot(note) {
    var inputs = qa('input, textarea, select').slice(0, 120).filter(function (e) { return e.type !== 'hidden' || /price|quantity|qty/i.test(e.name || ''); }).slice(0, 50).map(function (e) {
      var secret = /pass|token|csrf|card|cvv/i.test((e.name || '') + (e.id || ''));
      return { tag: e.tagName.toLowerCase(), type: e.type || '', name: e.name || '', id: e.id || '', aria: (e.getAttribute('aria-label') || '').slice(0, 50), ph: (e.getAttribute('placeholder') || '').slice(0, 40),
        testid: e.getAttribute('data-testid') || '', vv: e.getAttribute('data-vv-name') || '', label: labelText(e).slice(0, 50), value: secret ? '[redacted]' : String(e.value || '').slice(0, 30), vis: visible(e), dis: !!e.disabled };
    });
    var buttons = qa(BTN_SEL).filter(visible).slice(0, 70).map(function (b) {
      return { tag: b.tagName.toLowerCase(), text: ((b.innerText || b.value || '') + '').replace(/\s+/g, ' ').trim().slice(0, 40), aria: (b.getAttribute('aria-label') || '').slice(0, 40), type: b.getAttribute('type') || '', dis: isDisabled(b), href: b.getAttribute('href') ? C.safeUrl(b.getAttribute('href')) : undefined };
    });
    var editish = qa('a, [aria-label], button, [role="button"], [role="menuitem"]').filter(function (e) { return visible(e) && /\b(edit|update|price|quantity|stock|manage|options|more)\b/i.test((e.getAttribute('aria-label') || '') + ' ' + (e.innerText || '').slice(0, 40)); }).slice(0, 30).map(function (e) {
      return { tag: e.tagName.toLowerCase(), text: ((e.innerText || '') + '').replace(/\s+/g, ' ').trim().slice(0, 40), aria: (e.getAttribute('aria-label') || '').slice(0, 40), href: e.getAttribute('href') ? C.safeUrl(e.getAttribute('href')) : undefined };
    });
    var forms = qa('form').slice(0, 12).map(function (f) { return { id: f.id || '', action: f.getAttribute('action') ? C.safeUrl(f.getAttribute('action')) : '', method: (f.method || '').toLowerCase(), cls: (f.className && f.className.toString ? f.className.toString() : '').slice(0, 40) }; });
    return { at: Date.now(), note: note || '', url: C.safeUrl(location.href), title: (document.title || '').slice(0, 100), dialogs: qa('[role="dialog"]').filter(visible).length,
      inputs: inputs, buttons: buttons, editish: editish, forms: forms, requests: recentRequests(), textSample: pageText().replace(/\s+/g, ' ').slice(0, 240) };
  }

  // ---- result builders -----------------------------------------------------------------------------------------------
  function cont(delayMs, scratch, extra) { return Object.assign({ state: 'continue', delayMs: delayMs || 1000, scratch: scratch || {} }, extra || {}); }
  function go(url, scratch, extra) { return Object.assign({ state: 'goto', url: url, scratch: scratch || {} }, extra || {}); }
  function fail(code, reason, step, selector, scratch, extra) {
    return Object.assign({ state: 'fail', code: code, reason: String(reason || code).slice(0, 220), step: step || '', selector: selector || '', scratch: scratch || {}, diag: snapshot('fail:' + code) }, extra || {});
  }
  function blocked(code, reason, step) {
    return { state: 'blocked', code: code, reason: String(reason || code).slice(0, 220), step: step || '', diag: snapshot('blocked:' + code) };
  }
  function done(details, scratch) { return { state: 'done', scratch: scratch || {}, details: Object.assign({ verified: true }, details || {}) }; }

  // Fields every platform needs, from ctx.
  function wants(ctx) {
    var it = ctx.item || {};
    return {
      price: it.priceDrift ? it.price : null,
      qty: C.wantsQuantity(ctx.platform, it) ? it.quantity : null
    };
  }
  function bumpTries(ctx, key, max) {
    var n = ((ctx.scratch && ctx.scratch[key]) || 0) + 1;
    return { n: n, over: n > max };
  }

  // ===================================================================================================================
  // FACEBOOK MARKETPLACE -- UI driven. No API. Start: /marketplace/item/<id>/ (documented public URL) or /you/selling.
  // Selectors: aria-label / visible text only (classes are obfuscated). [existing]=fas-selectors.js/fas-remove.js,
  // [documented]=open-source FB bot XPath + izoate walkthrough, [guess]=edit-control labels (discovered at runtime).
  // ===================================================================================================================
  function fbEditControl(root) {
    var cands = qa('[aria-label], [role="button"], [role="menuitem"], a, button', root).filter(visible);
    var exact = cands.filter(function (e) { return /^(edit( listing)?|edit this listing)$/.test(btnLabel(e)); });
    if (exact.length) return exact[0];
    var loose = cands.filter(function (e) { return /^edit\b/.test(btnLabel(e)) && btnLabel(e).length < 30; });
    return loose.length ? loose[0] : null;
  }
  function fbMenuOpener() {
    var cands = qa('[aria-label][role="button"], div[aria-label][tabindex], [aria-haspopup="menu"], button[aria-label]').filter(visible);
    return cands.filter(function (e) { return /^(more( options| actions)?|manage|manage listing|see options|listing options|actions for this listing|more actions)$/.test(btnLabel(e)); })[0] || null;
  }
  // [existing] listingCardByTitle logic: climb from the card's "Mark as sold"/"Mark as available" control to the card container.
  function fbDashboardCard(title) {
    var ctrls = qa('div[role="button"], button, span[role="button"], a[role="button"]').filter(function (b) { return /^(mark as sold|mark as available|relist this item|mark as unavailable)$/.test(norm(b.textContent)); });
    var cards = [];
    ctrls.forEach(function (b) {
      var el = b, hops = 0;
      while (el && hops < 16) {
        el = el.parentElement; hops++;
        if (!el) break;
        var t = norm(el.textContent);
        if (t.indexOf('$') !== -1 && t.length > 40) { cards.push({ key: cardKey(el), el: el, texts: [el.textContent] }); break; }
      }
    });
    var pick = C.pickUnique(cards, title, 'contains');
    return pick;
  }
  var _cardKeys = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var _cardSeq = 0;
  function cardKey(el) {
    if (!_cardKeys) return String(++_cardSeq);
    if (!_cardKeys.has(el)) _cardKeys.set(el, 'c' + (++_cardSeq));
    return _cardKeys.get(el);
  }
  function fbPriceInput(root) {
    return inputAfterLabelSpan(/^price$/, root) ||                                   // [documented] //span[text()="Price"]/following-sibling::input[1]
      findInput(/(^|\|\s*)price(\s*\||$)/i, /original|compare|shipping|minimum|floor|offer/i, root) ||  // [existing] label "Price"
      findInput(/\bprice\b/i, /original|compare|shipping|minimum|floor|offer|list price/i, root);
  }
  function fbCloseDialog() {
    var close = qa('[aria-label="Close"], [aria-label="close"]').filter(visible)[0];
    if (close) { realClick(close).catch(function () {}); }
    else { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true })); }
  }
  async function fbStep(ctx) {
    var S = ctx.scratch || {}, W = wants(ctx), it = ctx.item;
    var phase = S.phase || 'locate';
    var onItemPage = /\/marketplace\/item\/\d+/.test(location.pathname);
    var onDash = /\/marketplace\/you\/selling/.test(location.pathname);

    if (phase === 'locate') {
      if (onItemPage) {
        var dlg0 = qa('[role="dialog"]').filter(visible)[0];
        var edit = await waitFor(function () { return fbEditControl(document); }, 6000);
        if (!edit && !S.menuOpened) {
          var opener = fbMenuOpener();
          if (opener) { deferClick(opener); return cont(1200, { menuOpened: true }); }
        }
        if (!edit && S.menuOpened) edit = fbEditControl(document);
        if (edit) { deferClick(edit); return cont(2500, { phase: 'form', editVia: 'item_page' }); }
        void dlg0;
        if (!S.triedDashboard) return go('https://www.facebook.com/marketplace/you/selling', { triedDashboard: true });
        return fail('edit_control_not_found', 'No Edit control (aria-label/text starting "Edit") found on the listing page or the selling dashboard card', 'locate', '[aria-label^="Edit"] / role=button|menuitem text "Edit listing"', {});
      }
      if (onDash) {
        await waitFor(function () { return fbDashboardCard(it.title).match || qa('div[role="button"]').length > 5; }, 8000);
        var pick = fbDashboardCard(it.title);
        if (!pick.match) return fail('listing_not_found_on_dashboard', 'Selling dashboard card match: ' + pick.reason + ' (' + pick.count + ')', 'locate', 'card containing title + "Mark as sold"', {});
        var card = pick.match.el;
        var cardEdit = fbEditControl(card);
        if (cardEdit) { deferClick(cardEdit); return cont(2500, { phase: 'form', editVia: 'dashboard_card' }); }
        var link = qa('a[href*="/marketplace/item/"]', card)[0];
        if (link) {
          var id = C.extractIdFromUrl('FACEBOOK', link.getAttribute('href') || link.href);
          if (id) return go('https://www.facebook.com/marketplace/item/' + id + '/', { itemIdFound: id, triedDashboard: true });
        }
        return fail('edit_control_not_found', 'Dashboard card found but it has no Edit control or item link', 'locate', 'card > [aria-label^="Edit"] | a[href*="/marketplace/item/"]', {});
      }
      return go(C.startUrl('FACEBOOK', it, ctx.cfg), {});
    }

    if (phase === 'form' || phase === 'verifyform') {
      var isVerify = phase === 'verifyform';
      var root = qa('[role="dialog"]').filter(visible).pop() || document;
      var price = await waitFor(function () { return fbPriceInput(root) || fbPriceInput(document); }, 9000);
      if (!price) {
        var t = bumpTries(ctx, 'formTries', 2);
        if (!t.over) return cont(1500, { formTries: t.n });
        return fail('price_field_not_found', 'Edit form opened but no Price input was found', phase, '//span[text()="Price"]/following-sibling::input[1] | label "Price"', {});
      }
      var shown = price.value;
      if (isVerify) {
        var okP = W.price == null || C.pricesMatch('FACEBOOK', shown, W.price);
        var qtyShown = null;
        var qin = W.qty != null ? self.FAS_QTY && self.FAS_QTY.findQuantityInput() : null;
        if (qin) qtyShown = C.parsePriceText(qin.value);
        var okQ = W.qty == null || !qin || qtyShown === W.qty;
        fbCloseDialog();
        await sleep(900);
        var leave = findButton(/^leave page$/, document); if (leave) await realClick(leave);
        if (okP && okQ) return done({ readBack: { price: shown, quantity: qtyShown }, quantityControl: !!qin });
        return fail('verify_mismatch', 'After reload Facebook shows price "' + shown + '"' + (qin ? ' quantity "' + (qin.value) + '"' : '') + ', wanted ' + (W.price != null ? C.formatPrice('FACEBOOK', W.price) : '-') + (W.qty != null ? ' qty ' + W.qty : ''), 'verify', 'price input value', {});
      }
      var diag = S.formSnap ? undefined : snapshot('fb_form');
      var warn = [];
      if (W.price != null && !C.pricesMatch('FACEBOOK', shown, W.price)) {
        var ok = await writeField(price, C.formatPrice('FACEBOOK', W.price));
        if (!ok) return fail('price_value_did_not_stick', 'Price input kept "' + price.value + '" after write', 'form', 'price input', {});
      }
      var qtyNote = null;
      if (W.qty != null) {
        var qi = self.FAS_QTY && self.FAS_QTY.findQuantityInput();
        if (qi) {
          if (C.parsePriceText(qi.value) !== W.qty) { var qok = await writeField(qi, String(W.qty)); if (!qok) return fail('quantity_value_did_not_stick', 'Quantity input kept "' + qi.value + '"', 'form', 'quantity input', {}); }
        } else {
          qtyNote = 'no_quantity_control';   // single-unit composer: nothing to write; reported, not failed
        }
      }
      // Save: prefer an explicit Save/Update/Publish, else step through Next.
      var save = findButton(/^(save|update|publish|save changes|update listing|done)$/, root) || findButton(/^(save|update|publish|save changes|update listing|done)$/, document);
      if (!save) {
        var next = findButton(/^next$/, root) || findButton(/^next$/, document);
        var nt = bumpTries(ctx, 'nextClicks', 4);
        if (next && !nt.over) { deferClick(next); return cont(1800, { nextClicks: nt.n, formSnap: true }, { diag: diag }); }
        return fail('save_control_not_found', 'No Save/Update/Publish/Next control enabled in the edit dialog', 'form', 'button|[role=button] aria-label|text ^(save|update|publish|next)$', {});
      }
      deferClick(save);
      return cont(3500, { phase: 'saved', formSnap: true, qtyNote: qtyNote }, { diag: diag });
    }

    if (phase === 'saved') {
      var err = visibleErrorText();
      var stillForm = !!fbPriceInput(qa('[role="dialog"]').filter(visible).pop() || document) && qa('[role="dialog"]').filter(visible).length > 0;
      var blockedNow = pageBlock();
      if (blockedNow) return blocked(blockedNow.code, 'After Save: ' + blockedNow.code, 'saved');
      if (stillForm) {
        var t2 = bumpTries(ctx, 'savedWaits', 4);
        if (!t2.over) return cont(2000, { savedWaits: t2.n });
        return fail('save_not_confirmed', 'Edit dialog still open after Save' + (err ? ': ' + err : ''), 'saved', 'dialog still visible', {});
      }
      var itemId = it.remoteListingId || S.itemIdFound || (location.pathname.match(/\/marketplace\/item\/(\d+)/) || [])[1];
      if (!itemId) return fail('item_id_unknown', 'Saved, but the listing id is unknown so the result cannot be re-read', 'saved', '', {});
      return go('https://www.facebook.com/marketplace/item/' + itemId + '/', { phase: 'verify', itemIdFound: itemId }, { details: { requests: recentRequests() } });
    }

    if (phase === 'verify') {
      var ed = await waitFor(function () { return fbEditControl(document); }, 8000);
      if (!ed) {
        // Fallback read: the visible price text on the reloaded listing page.
        var prices = qa('span, div').filter(function (e) { return e.children.length === 0 && /^\$\s?[\d,]+(\.\d\d)?$/.test((e.textContent || '').trim()); }).map(function (e) { return C.parsePriceText(e.textContent); });
        if (W.price != null && prices.length && C.pricesMatch('FACEBOOK', prices[0], W.price)) return done({ readBack: { price: prices[0] }, via: 'page_text_first_price' });
        return fail('verify_edit_control_not_found', 'Reloaded listing shows no Edit control to read back through', 'verify', 'edit control', {});
      }
      deferClick(ed);
      return cont(2500, { phase: 'verifyform' });
    }
    return fail('bad_phase', 'Unknown phase ' + phase, 'fb', '', {});
  }

  // ===================================================================================================================
  // POSHMARK -- same-origin JSON API from the page (cookie session). [documented] phposh + ai-listings SDK sources.
  // Falls back to driving the form only when the API write is refused; verification is always an API re-GET.
  // ===================================================================================================================
  var POSH_VER = '2.55';
  function poshHeaders(csrf, json) {
    var h = { 'Accept': 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' };
    if (json) h['Content-Type'] = 'application/json';
    if (csrf) h['X-XSRF-TOKEN'] = csrf;
    return h;
  }
  async function poshCsrf(id) {
    var m = q('meta#csrftoken');
    if (m && m.getAttribute('content')) return m.getAttribute('content');
    var res = await fetch('/edit-listing/' + id + '?_=' + Date.now(), { credentials: 'same-origin', headers: { 'Accept': 'text/html' } });
    if (!res.ok) throw new Error('edit_page_http_' + res.status);
    var html = await res.text();
    var mm = /<meta[^>]+id=["']csrftoken["'][^>]+content=["']([^"']+)["']/i.exec(html) || /<meta[^>]+content=["']([^"']+)["'][^>]+id=["']csrftoken["']/i.exec(html);
    return mm ? mm[1] : '';
  }
  async function poshGet(id) {
    var res = await fetch('/vm-rest/posts/' + id + '?app_version=' + POSH_VER + '&_=' + Date.now(), { credentials: 'same-origin', headers: poshHeaders('', false) });
    var text = await res.text();
    var json = null; try { json = JSON.parse(text); } catch (e) { /* not json */ }
    return { status: res.status, ok: res.ok, json: json, snippet: json ? '' : text.slice(0, 120) };
  }
  function poshClosetCards() {
    var byId = {};
    qa('a[href*="/listing/"]').forEach(function (a) {
      var id = C.extractIdFromUrl('POSHMARK', a.getAttribute('href') || a.href);
      if (!id) return;
      var e = byId[id] || (byId[id] = { key: id, texts: [] });
      qa('.tile-grid-redesign__title', a).forEach(function (el) { e.texts.push(el.innerText || el.textContent); });   // [existing] live-confirmed 2026-09-23
      qa('img[alt]', a).forEach(function (im) { e.texts.push(im.getAttribute('alt')); });
      if (!/covershot/i.test(a.className || '')) { var inner = (a.innerText || '').trim().split('\n')[0]; if (inner) e.texts.push(inner); }
    });
    qa('.tile-grid-redesign__title').forEach(function (el) {
      if (el.closest('a[href*="/listing/"]')) return;
      var node = el.parentElement;
      for (var i = 0; i < 5 && node; i++, node = node.parentElement) {
        var ids = {};
        qa('a[href*="/listing/"]', node).forEach(function (x) { var id = C.extractIdFromUrl('POSHMARK', x.getAttribute('href') || x.href); if (id) ids[id] = 1; });
        var keys = Object.keys(ids);
        if (keys.length === 1) { (byId[keys[0]] || (byId[keys[0]] = { key: keys[0], texts: [] })).texts.push(el.innerText || el.textContent); break; }
        if (keys.length > 1) break;
      }
    });
    return Object.keys(byId).map(function (k) { return byId[k]; });
  }
  // Several of the seller's listings share this exact title and no saved listing id exists: refuse to guess. Reports every candidate.
  function poshCandidatePrice(id) {
    try {
      var a = qa('a[href*="' + id + '"]')[0], node = a;
      for (var i = 0; i < 6 && node; i++, node = node.parentElement) {
        var m = /\$\s?([\d,]+(?:\.\d{1,2})?)/.exec((node.innerText || '').slice(0, 400));
        if (m) return m[1];
      }
    } catch (e) { /* ignore */ }
    return '';
  }
  function W_price_for_log(it) { return it && it.priceDrift ? it.price : null; }
  async function poshAmbiguous(it) {
    // Load the whole closet first (it lazy-loads), so a candidate that has not rendered yet can never be missed.
    var prevN = -1, complete = false;
    for (var ex = 0; ex < 12; ex++) {
      var nowN = poshClosetCards().length;
      if (nowN === prevN) { complete = true; break; }
      prevN = nowN;
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(1100);
    }
    var cands = [];
    try {
      poshClosetCards().forEach(function (c) { if ((c.texts || []).some(function (t) { return C.titleEquals(t, it.title); })) cands.push({ id: c.key, price: poshCandidatePrice(c.key) }); });
    } catch (e) { /* ignore */ }
    var res = C.resolveDuplicateTitleId(cands, it.titleGroup, complete);
    if (res.copies && res.copies.length > 1) {
      // One FindA.Sale item owns this title (the backend counted exactly one unresolved item) and several unclaimed closet listings carry it:
      // they are copies of that single item. Edit every copy, one after another (see poshCopyWrap / the step() hook); nothing is deleted.
      var cs = C.copyStart(res.copies);
      tLog('warn', 'posh_copies_found', 'FindA.Sale has ONE item with this title but ' + cs.copies.length + ' identical Poshmark listings exist (it was published more than once). Editing every copy, one at a time, and deleting nothing: ' + cs.copies.map(function (x) { return x.slice(-6); }).join(', '), { copies: cs.copies, price: W_price_for_log(it) });
      return go('https://poshmark.com/edit-listing/' + cs.remoteId, Object.assign(cs, { phase: 'api', apiTried: false, discovered: true }));
    }
    if (res.id) {
      tLog('info', 'posh_dup_resolved', 'Several closet listings share this title, but only one is not already tied to another FindA.Sale item and this is the only item waiting; using its id', { id: res.id, candidates: cands.slice(0, 10) });
      return go('https://poshmark.com/edit-listing/' + res.id, { remoteId: res.id, phase: 'api', discovered: true });
    }
    tLog('warn', 'ambiguous_title', cands.length + ' Poshmark listings have the exact title "' + String(it.title || '').slice(0, 60) + '" and this item has no saved Poshmark listing id; nothing was edited. ' + res.message, { candidates: cands.slice(0, 10), reason: res.reason });
    return fail('ambiguous_title', res.message + ' (' + cands.length + ' closet listings: ' + cands.slice(0, 5).map(function (c) { return c.id.slice(-6) + (c.price ? '@$' + c.price : ''); }).join(', ') + ')', 'locate', '.tile-grid-redesign__title', {}, { details: { candidates: cands.slice(0, 10), needsInfo: res.reason } });
  }
  async function poshStep(ctx) {
    var S = ctx.scratch || {}, W = wants(ctx), it = ctx.item;
    var id = S.remoteId || it.remoteListingId || (ctx.idCache && ctx.idCache['POSHMARK:' + it.id]) || '';
    var path = location.pathname;
    if (it.remoteListingId && !/^[0-9a-f]{24}$/i.test(String(it.remoteListingId)) && !S.remoteId) tLog('warn', 'remote_id_invalid', 'The saved Poshmark listing id "' + String(it.remoteListingId).slice(0, 30) + '" is not a valid 24-character id; falling back to finding the listing by exact title', {});
    if (!/^[0-9a-f]{24}$/i.test(id)) {
      // ---- discovery: find the listing id in the seller's own closet by exact title (live-confirmed closet DOM). ----
      if (!/^\/closet\//.test(path)) {
        var links = qa('a[href*="/closet/"]');
        var mine = links.filter(function (a) { return norm(a.textContent) === 'my closet'; })[0] || links.filter(function (a) { return /^\/closet\/[^/]+$/.test((a.getAttribute('href') || '').split('?')[0].replace(/\/+$/, '')); })[0];
        if (mine) return go(mine.href.split('?')[0] + '?query=' + encodeURIComponent(String(it.title).split(/\s+/).slice(0, 8).join(' ')), { phase: 'locate' });
        if (!S.triedFeed && !/^\/feed/.test(path)) return go('https://poshmark.com/feed', { triedFeed: true });
        return fail('closet_link_not_found', 'No "My Closet" link on the Poshmark feed/closet page', 'locate', 'a[href*="/closet/"] text "My Closet"', {});
      }
      await waitFor(function () { return qa('a[href*="/listing/"]').length > 0; }, 10000);
      var found = null;
      for (var sc = 0; sc < 7 && !found; sc++) {
        var pick = C.pickUniquePoshmark(poshClosetCards(), it.title);
        if (pick.match) {
          found = pick.match.key;
          // Safety (2026-10-16): the closet lazy-loads, so a lone match here may have an identical-title twin further down that has not
          // rendered yet. No saved listing id to anchor on, so keep scrolling until the card count stops growing (bounded) and refuse
          // to edit if a second exact-title listing shows up.
          var prevN = -1;
          for (var ex = 0; ex < 6; ex++) {
            var nowN = poshClosetCards().length;
            if (nowN === prevN) break;
            prevN = nowN;
            window.scrollTo(0, document.body.scrollHeight);
            await sleep(1100);
            var again = C.pickUniquePoshmark(poshClosetCards(), it.title);
            if (again.reason === 'ambiguous') return await poshAmbiguous(it);
          }
          tLog('info', 'posh_title_match', 'Exactly one Poshmark listing has this title; using its id', { id: found });
          break;
        }
        if (pick.reason === 'ambiguous') return await poshAmbiguous(it);
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(1100);
      }
      if (!found && !S.fuzzyTried) {
        // Title may have been edited on FindA.Sale after posting: look again with just the first two words, then try the guarded near-match.
        var base = location.pathname.replace(/\/+$/, '');
        return go('https://poshmark.com' + base + '?query=' + encodeURIComponent(String(it.title).split(/\s+/).slice(0, 2).join(' ')), { phase: 'locate', fuzzyTried: true });
      }
      if (!found && S.fuzzyTried) {
        var fz = C.pickFuzzyPoshmark(poshClosetCards(), it.title);
        if (fz.match) {
          found = fz.match.key;
          tLog('warn', 'posh_fuzzy_match', 'No closet listing has this exact title; using the one unambiguous near match "' + String(fz.matchedTitle).slice(0, 80) + '" (' + fz.score.shared + ' shared words)', { id: found, shared: fz.score.shared, ratio: fz.score.ratio });
        }
      }
      if (!found) return fail('listing_not_found_in_closet', 'No closet card with this exact title', 'locate', '.tile-grid-redesign__title / a[href*="/listing/"]', {});
      return go('https://poshmark.com/edit-listing/' + found, { remoteId: found, phase: 'api', discovered: true });
    }
    if (!/^\/edit-listing\//.test(path) && !S.apiTried) return go('https://poshmark.com/edit-listing/' + id, { remoteId: id, phase: 'api' });

    // ---- API apply + verify (one call; several awaits; no navigation expected) ----
    if (S.phase === 'posh_uiverify') return poshUiVerify(id, W, S);
    if (S.phase === 'posh_verify_only') {
      // 1.0.62 (Patrick's yes, 2026-10-23): Poshmark's own edit form ends in two more steps -- a "Share Listing" screen with "List This Item", then
      // for glass/lamp-type items a "Fragile Item Detected" packing acknowledgement (Cancel Edit / Publish Listing). The Update click alone never saved
      // anything. Click through exactly those two, and only those: any certify / suspicious / prohibited / oversized prompt still stops the run.
      for (var fe = 0; fe < 10; fe++) {
        var ackBtn = null, ackWhich = '';
        // Live-confirmed 2026-10-23: dialog 1 "Fragile Item Detected" (Cancel Edit / Publish Listing), then dialog 2 "Publish Listing: ... Poshmark will not be
        // compensating me" (Cancel / Publish). Only a button inside a modal carrying that exact packing text is ever clicked.
        qa(BTN_SEL).filter(function (b2) { return visible(b2) && !isDisabled(b2); }).forEach(function (b2) {
          var mt = textOf(b2.closest('.modal, [role="dialog"]'));
          var lb = btnLabel(b2);
          if (lb === 'publish' && /not be compensating/.test(mt)) { ackBtn = b2; ackWhich = 'confirm'; }
          else if (lb === 'publish listing' && /potential breakable item/.test(mt) && ackWhich !== 'confirm') { ackBtn = b2; ackWhich = 'fragile'; }
        });
        if (ackBtn) { tLog('info', 'posh_fragile_ack', 'Poshmark asked for its packing acknowledgement on this fragile item (' + ackWhich + ' step); clicking ' + btnLabel(ackBtn) + ' (price/stock edit on an already-live listing)', {}); await realClick(ackBtn); await sleep(2500); continue; }
        var shareBtn = findButton(/^list this item$/);
        if (shareBtn && /share listing/i.test(pageText())) { await realClick(shareBtn); await sleep(2500); continue; }
        break;
      }
      // 1.0.43: after the form's Update click, a certify / suspicious / verification prompt on the page means Poshmark wants the person -- stop, keep the tab.
      var flagTxt = textOf(qa('[role="dialog"], .modal, [class*="modal" i], [class*="error" i], [class*="toast" i]').filter(visible).slice(-3).map(function (e) { return e; })[0] || document.body).slice(0, 2000);
      if (/suspicious|certify|single listing creation|verify (that )?you|are you a robot/i.test(flagTxt)) return blocked('poshmark_flagged', 'Poshmark showed a certify/verification prompt after the Update click, so the edit needs you. The tab is left open.', 'form');
      return poshVerify(id, W, it, S, null);
    }
    try {
      var csrf = await poshCsrf(id);
      if (!csrf) return fail('csrf_not_found', 'meta#csrftoken missing on /edit-listing/' + id, 'api', 'meta#csrftoken', { apiTried: true, remoteId: id });
      await sleep(300);
      var g1 = await poshGet(id);
      if (g1.status === 403 || g1.status === 429) return blocked('http_' + g1.status, 'GET /vm-rest/posts returned ' + g1.status, 'api');
      var errG = g1.json && C.isPoshmarkErrorPayload(g1.json);
      if (!g1.ok || errG || !g1.json) {
        // verified-in-DOM 2026-10-13: the edit page preloads the listing in its HTML and makes no /vm-rest/posts/<id> GET on load, so the
        // GET is the least-proven call: if it is refused, drive the real edit form instead (price/qty inputs below), verified by reload.
        if (!S.formFallback) return poshFormFallback(ctx, id, W, 'api_get_failed:' + g1.status + ':' + (errG || g1.snippet || '').slice(0, 60), null);
        return fail('api_get_failed', 'GET post: HTTP ' + g1.status + ' ' + (errG || g1.snippet || ''), 'api', '/vm-rest/posts/<id>', { apiTried: true, remoteId: id });
      }
      var before = C.unwrapPoshmarkPost(g1.json);
      var curQty = C.poshmarkQuantity(before);
      var needPrice = W.price != null && !C.pricesMatch('POSHMARK', C.poshmarkPriceVal(before), W.price);
      var needQty = W.qty != null && curQty != null && curQty !== W.qty;
      try { var pv = C.poshmarkPriceVal(before); if (pv != null && oldSeen == null) oldSeen = pv; tLog('info', 'posh_compare', 'Poshmark currently shows ' + money('POSHMARK', pv) + '; FindA.Sale wants ' + (W.price != null ? money('POSHMARK', W.price) : 'no price change'), { current: pv, wanted: W.price, qtyNow: curQty, qtyWanted: W.qty }); } catch (e) { /* ignore */ }
      var diagKeys = { diagKeys: Object.keys(before || {}).slice(0, 80), invKeys: before && before.inventory ? Object.keys(before.inventory) : [], sizeRows: (before && before.inventory && before.inventory.size_quantities || []).length };
      if (!needPrice && !needQty) {
        return Object.assign(done({ readBack: { price: C.poshmarkPriceVal(before), quantity: curQty }, via: 'api_get_already_correct' }, { apiTried: true, remoteId: id }), { diag: { note: 'posh_already_correct', keys: diagKeys } });
      }
      var built = C.buildPoshmarkUpdate(before, needPrice ? W.price : null, needQty ? W.qty : null);
      if (built.error) return fail('payload_build_failed', built.error, 'api', 'post payload', { apiTried: true, remoteId: id });
      await sleep(200 + Math.floor(Math.random() * 400));
      tStep('Saving the new price ' + (W.price != null ? money('POSHMARK', W.price) : '') + (oldSeen != null ? ' (was ' + money('POSHMARK', oldSeen) + ')' : '') + ' to Poshmark', 'sending it through Poshmark\'s own edit service, then I re-read the listing to check');
      var res = await fetch('/vm-rest/posts/' + id, { method: 'POST', credentials: 'same-origin', headers: poshHeaders(csrf, true), body: JSON.stringify(built.body), referrer: location.origin + '/edit-listing/' + id });
      var rt = await res.text(); var rj = null; try { rj = JSON.parse(rt); } catch (e) { /* maybe empty */ }
      var errP = rj && C.isPoshmarkErrorPayload(rj);
      if (res.status === 403 || res.status === 429) return blocked('http_' + res.status, 'POST post returned ' + res.status, 'api');
      tLog(res.ok && !errP ? 'info' : 'warn', 'posh_post_result', 'Poshmark answered the price save with HTTP ' + res.status + (errP ? ' (' + String(errP).slice(0, 400) + ')' : ''), { status: res.status });
      // 2026-10-20: Poshmark answers some saves with HTTP 200 + PostValidationError { certify_action:true, userMessage:"We have detected that
      // this item is suspicious. Please use our Single Listing Creation form..." } -- its automation check. Retrying (or driving the form) only
      // feeds that flag, so stop the Poshmark run and back off; the price has to be changed by hand on Poshmark.
      if (errP && /suspicious|certify_action|certify_reason/i.test(String(errP) + ' ' + rt)) {
        // 1.0.43: Patrick's rule -- the extension does the edit, not him. Poshmark's own message points at its listing form, so the first time
        // this happens for an item the edit goes through the normal Edit Listing form (the same path a person uses). If the form hits the
        // same check again, or shows a certify/verification prompt, the run stops and the tab stays open (never clicks through a check).
        if (!S.formFallback) return poshFormFallback(ctx, id, W, 'api_flagged:' + String(errP).slice(0, 60), diagKeys);
        return blocked('poshmark_flagged', 'Poshmark flagged this price change even through its own edit form, so Poshmark edits are paused and the tab is left open.', 'api');
      }
      if (!res.ok || errP) {
        // API refused: drive the form instead (documented fallback), then verify through an API re-GET.
        if (S.formFallback) return fail('api_post_failed', 'POST post: HTTP ' + res.status + ' ' + (errP || rt.slice(0, 100)), 'api', 'POST /vm-rest/posts/<id>', { apiTried: true, remoteId: id }, { diag: { note: 'posh_post_failed', keys: diagKeys, resp: C.redact(rj || rt.slice(0, 200)) } });
        return poshFormFallback(ctx, id, W, 'api_post_failed:' + res.status + ':' + (errP || '').slice(0, 80), diagKeys);
      }
      await sleep(800);
      return poshVerify(id, W, it, { apiTried: true, remoteId: id }, before, built.changes.indexOf('quantity') !== -1, diagKeys);
    } catch (e) {
      return fail('api_exception', (e && e.message) || String(e), 'api', 'fetch', { apiTried: true, remoteId: id });
    }
  }
  async function poshVerify(id, W, it, scratch, before, qtyChanged, diagKeys) {
    var g2 = await poshGet(id);
    var err2 = g2.json && C.isPoshmarkErrorPayload(g2.json);
    if ((!g2.ok || err2 || !g2.json) && scratch && scratch.formFallback) return go('https://poshmark.com/edit-listing/' + id, Object.assign({}, scratch, { phase: 'posh_uiverify' }));
    if (!g2.ok || err2 || !g2.json) return fail('verify_get_failed', 'Re-GET: HTTP ' + g2.status + ' ' + (err2 || g2.snippet || ''), 'verify', '/vm-rest/posts/<id>', scratch);
    var after = C.unwrapPoshmarkPost(g2.json);
    var pOk = W.price == null || C.pricesMatch('POSHMARK', C.poshmarkPriceVal(after), W.price);
    var qNow = C.poshmarkQuantity(after);
    var qOk = W.qty == null || qNow === W.qty;
    var collateral = before ? C.poshmarkCollateralDiff(before, after, !!qtyChanged) : [];
    if (pOk && qOk) {
      var out = done({ readBack: { price: C.poshmarkPriceVal(after), quantity: qNow }, via: 'api_regetverify', collateral: collateral }, scratch);
      if (diagKeys) out.diag = { note: 'posh_applied', keys: diagKeys, requests: recentRequests() };
      return out;
    }
    var pf = scratch && scratch.priceForm;
    return fail('verify_mismatch', 'After ' + (scratch && scratch.formFallback ? 'the edit form' : 'POST') + ' the post shows price ' + C.poshmarkPriceVal(after) + ' qty ' + qNow + ', wanted ' + (W.price != null ? W.price : '-') + ' / ' + (W.qty != null ? W.qty : '-') + (pf ? ' (price window opened: ' + (pf.modalOpened ? 'yes' : 'no') + ', Done clicked: ' + (pf.doneClicked ? 'yes' : 'no') + ', form showed "' + pf.mainAfter + '")' : ''), 'verify', 'price_amount.val / inventory.size_quantities[].quantity_available', scratch, pf ? { diag: Object.assign(snapshot('fail:verify_mismatch'), { priceForm: pf }) } : undefined);
  }
  // Form fallback. verified-in-DOM 2026-10-13: price = #listing-price-modal-listing-price-input (aria "Listing Price") /
  // input[data-vv-name="listingPrice"]; quantity = "Single Item" (data-et-name=one) / "Multi Item" (data-et-name=multiple) buttons
  // plus the size "Done" (data-et-name=apply); save = "Update" (data-et-name=update). Verified by reload (poshUiVerify) or API re-GET.
  // 1.0.64 (live DOM 2026-10-25, edit-listing/6a96050225362175cc1c723d): the edit page carries TWO price inputs. The main form's
  // input[data-vv-name="listingPrice"] (visible, holds the live price) and #listing-price-modal-listing-price-input inside the
  // .listing-price-suggestion-modal, which stays hidden (value "") until the main input is clicked. Clicking the main input opens
  // the modal (its input then holds the price, focused) and the modal's own "Done" button (no data-et-name) writes it back.
  // The old poshPriceInput() returned the hidden modal input first: the new price went into a hidden field, the modal's Done
  // was never visible so never clicked, and Update saved the form with the old price ("verify_mismatch ... shows price 65").
  function poshMainPriceInput() {
    return qa('input[data-vv-name="listingPrice"]').filter(function (i) { return !(i.closest && i.closest('.modal')) && visible(i); })[0] || null;
  }
  function poshPriceModal() { return q('.listing-price-suggestion-modal'); }
  function poshModalPriceInput() { var m = q('#listing-price-modal-listing-price-input'); return m && visible(m) ? m : null; }
  // Read-back only (never written directly): the visible main-form price input, else any visible Listing Price input.
  function poshPriceInput() {
    return poshMainPriceInput() || poshModalPriceInput() || findInput(/\blisting price\b/i, /original/i);
  }
  // Open the price modal, type the price, click its Done, confirm the main form now shows the price. Returns a diag object.
  async function poshSetPriceViaModal(value) {
    var d = { modalOpened: false, doneClicked: false, via: '', mainBefore: '', mainAfter: '' };
    var main = poshMainPriceInput();
    d.mainBefore = main ? String(main.value || '') : '';
    var mi = poshModalPriceInput();
    if (!mi && main) { await realClick(main); await sleep(900); mi = await waitFor(poshModalPriceInput, 5000); }
    if (mi) {
      d.modalOpened = true; d.via = 'price_modal';
      d.written = await writeField(mi, value);
      var m = poshPriceModal();
      var doneBtn = m && visible(m) ? findButton(/^done$/, m) : null;
      if (doneBtn) { await realClick(doneBtn); d.doneClicked = true; await waitFor(function () { return !visible(poshPriceModal()); }, 4000); await sleep(400); }
    } else if (main) {
      // No modal opened: the main input is directly editable on this layout.
      d.via = 'main_input';
      d.written = await writeField(main, value);
    } else {
      d.via = 'none';
    }
    var after = poshMainPriceInput() || poshModalPriceInput();
    d.mainAfter = after ? String(after.value || '') : '';
    d.ok = !!after && C.pricesMatch('POSHMARK', C.parsePriceText(d.mainAfter), C.parsePriceText(value)) && (!d.modalOpened || d.doneClicked);
    return d;
  }
  async function poshFormFallback(ctx, id, W, why, diagKeys) {
    var sc = { apiTried: true, remoteId: id, formFallback: true };
    await waitFor(function () { return q('[data-et-name="update"]') || poshPriceInput(); }, 12000);    // Vue SPA: inputs render after ~3s
    var price = poshPriceInput();
    if (!price) return fail('form_fallback_price_not_found', 'Poshmark refused the API read/write (' + why + ') and no Listing Price input was found', 'form_fallback', 'input[data-vv-name="listingPrice"] (main form) | #listing-price-modal-listing-price-input', sc, { diag: snapshot('posh_form_fallback') });
    var priceForm = null;
    if (W.price != null && !C.pricesMatch('POSHMARK', C.parsePriceText(price.value), W.price)) {
      priceForm = await poshSetPriceViaModal(C.formatPrice('POSHMARK', W.price));
      sc.priceForm = priceForm;
      tLog(priceForm.ok ? 'info' : 'warn', 'posh_price_modal', 'Price form: ' + (priceForm.modalOpened ? 'opened the Listing Price window' : 'no Listing Price window') + ', Done ' + (priceForm.doneClicked ? 'clicked' : 'NOT clicked') + ', form now shows "' + priceForm.mainAfter + '" (wanted ' + C.formatPrice('POSHMARK', W.price) + ')', priceForm);
      // Never click Update on a form that does not hold the new price: that is the "Update on an unchanged form" pattern.
      if (!priceForm.ok) return fail('price_value_did_not_stick', 'Listing Price form shows "' + priceForm.mainAfter + '" after ' + (priceForm.modalOpened ? 'the price window' + (priceForm.doneClicked ? ' and Done' : ' (Done not found)') : 'typing') + ', wanted ' + C.formatPrice('POSHMARK', W.price) + '; Update not clicked', 'form_fallback', '.listing-price-suggestion-modal Done', sc, { diag: Object.assign(snapshot('posh_price_modal'), { priceForm: priceForm }) });
    }
    if (W.qty != null) {
      if (W.qty === 1) { var one = q('[data-et-name="one"]'); if (one && visible(one)) { await realClick(one); await sleep(500); } }
      else {
        var qi = self.FAS_QTY && self.FAS_QTY.findQuantityInput();
        if (!qi) { var multi = q('[data-et-name="multiple"]'); if (multi && visible(multi)) { await realClick(multi); await sleep(700); qi = self.FAS_QTY.findQuantityInput(); } }
        if (qi) await writeField(qi, String(W.qty));
        else return fail('quantity_control_not_found', 'Multi Item selected but no quantity input found for quantity ' + W.qty, 'form_fallback', '[data-et-name="multiple"] then Quantity input', sc, { diag: snapshot('posh_qty') });
        var apply = q('[data-et-name="apply"]'); if (apply && visible(apply)) { await realClick(apply); await sleep(600); }
      }
    }
    var btn = q('[data-et-name="update"]');
    if (!(btn && visible(btn) && !isDisabled(btn))) btn = findButton(/^(update|save)$/);
    if (!btn) return fail('save_control_not_found', 'API write refused (' + why + ') and no Update button ([data-et-name="update"])', 'form_fallback', '[data-et-name="update"]', sc);
    deferClick(btn);
    return cont(3500, Object.assign({}, sc, { phase: 'posh_verify_only' }), { diag: { note: 'posh_form_fallback', why: why, keys: diagKeys, priceForm: priceForm, snap: snapshot('posh_form') } });
  }
  async function poshUiVerify(id, W, S) {
    var price = await waitFor(poshPriceInput, 12000);
    if (!price) return fail('verify_price_input_not_found', 'Reloaded edit page has no Listing Price input to read back', 'verify', '#listing-price-modal-listing-price-input', S);
    if (W.price == null || C.pricesMatch('POSHMARK', C.parsePriceText(price.value), W.price)) return done({ readBack: { price: price.value }, via: 'reloaded_edit_form' }, S);
    return fail('verify_mismatch', 'Reloaded edit form shows "' + price.value + '", wanted ' + C.formatPrice('POSHMARK', W.price), 'verify', '#listing-price-modal-listing-price-input', S);
  }

  // ===================================================================================================================
  // MERCARI -- UI driven. Edit URL /sell/edit/<id>/ is only a FIRST attempt [existing config, unverified]; discovery from
  // /mypage/listings (live-confirmed URL) finds the real Edit control. Price input [existing, live-confirmed on create form].
  // ===================================================================================================================
  function mercPriceInput() {
    return q('input#Price[name="sellPrice"][data-testid="Price"]') || q('input[name="sellPrice"]') || findInput(/\bprice\b/i, /original|floor|minimum|shipping|offer/i);
  }
  function mercFloorInput() { return findInput(/floor|minimum price|lowest price|smart ?pric/i, /shipping/i); }
  function mercCards() {
    var byId = {};
    qa('a[href*="/item/m"], a[href*="/sell/edit/m"]').forEach(function (a) {
      var id = C.extractIdFromUrl('MERCARI', a.getAttribute('href') || a.href);
      if (!id) return;
      var e = byId[id] || (byId[id] = { key: id, texts: [], anchors: [] });
      e.anchors.push(a);
      var card = a.closest('li, article, [data-testid*="Item" i], [data-testid*="listing" i]') || a.parentElement;
      e.texts.push(a.textContent || '');
      var lines = ((card && (card.innerText || card.textContent)) || a.innerText || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      lines.forEach(function (l) { e.texts.push(l); });
      e.texts.push(a.getAttribute('aria-label') || '');
      e.cardEl = card || a;
    });
    return Object.keys(byId).map(function (k) { return byId[k]; });
  }
  async function mercShippingLabelPrompt() {
    // After a price change Mercari may require re-picking a shipping label ("you may need to select a new label"). [documented] text, [guess] markup.
    var dlg = qa('[role="dialog"]').filter(visible).pop();
    var scope = dlg || document;
    var txt = textOf(scope).slice(0, 1500);
    if (!/(select|choose|pick) a (new )?(shipping )?label|shipping label (is )?(no longer|not) available|no longer available.*label|update your shipping/.test(txt)) return null;
    var radios = qa('input[type="radio"], [role="radio"], [role="option"]', scope).filter(visible);
    var best = null, bestPrice = Infinity;
    radios.forEach(function (r) {
      var box = r.closest('label, li, [role="option"], div') || r;
      var p = C.parsePriceText((box.textContent || '').match(/\$\s?\d[\d.,]*/) ? (box.textContent || '').match(/\$\s?\d[\d.,]*/)[0] : '');
      if (p != null && p < bestPrice) { bestPrice = p; best = r; }
    });
    return { dialog: !!dlg, best: best, count: radios.length };
  }
  async function mercStep(ctx) {
    var S = ctx.scratch || {}, W = wants(ctx), it = ctx.item;
    var phase = S.phase || 'locate';
    var onEdit = /^\/sell\/edit\/m\d+/i.test(location.pathname);
    var id = S.remoteId || it.remoteListingId || '';
    if (phase === 'locate' && !onEdit) {
      if (/^\/mypage\/listings/.test(location.pathname)) {
        await waitFor(function () { return qa('a[href*="/item/m"]').length > 0; }, 12000);
        for (var sc = 0; sc < 5; sc++) {
          var cards = mercCards();
          var pick = id ? { match: cards.filter(function (c) { return c.key === id.toLowerCase(); })[0] || null, reason: 'id', count: 1 } : C.pickUnique(cards, it.title, 'equals');
          if (pick.match) {
            // verified-in-DOM 2026-10-13: /mypage/listings/active/ rows have NO Edit link; the Edit link lives on the item page.
            return go('https://www.mercari.com/us/item/' + pick.match.key + '/', { phase: 'itempage', remoteId: pick.match.key, discovered: true });
          }
          if (pick.reason === 'ambiguous') return fail('ambiguous_title', pick.count + ' Mercari listings share this title', 'locate', 'a[href*="/item/m"]', {});
          window.scrollTo(0, document.body.scrollHeight);
          await sleep(1200);
        }
        return fail('listing_not_found_on_mercari', 'No active listing card matched ' + (id ? 'id ' + id : 'the exact title'), 'locate', 'a[href*="/item/m"]', {}, { diag: snapshot('merc_list') });
      }
      return go(C.startUrl('MERCARI', { id: it.id, remoteListingId: id }, ctx.cfg), {});
    }
    if (phase === 'itempage') {
      var ed = await waitFor(function () { return q('a[data-testid="EditListing"]') || q('a[href*="/sell/edit/"]') || qa('a, button, [role="button"]').filter(function (e) { return visible(e) && /^edit( listing)?$/.test(btnLabel(e)); })[0]; }, 9000);
      if (!ed) return fail('edit_control_not_found', 'Owner item page has no Edit control', 'itempage', 'a[href*="/sell/edit/"] | text "Edit listing"', {});
      if (ed.getAttribute && ed.getAttribute('href')) return go(ed.href, { phase: 'form', editUrl: ed.href });
      deferClick(ed); return cont(2500, { phase: 'form' });
    }
    // ---- form / saved / verify ----
    if (phase === 'locate' && onEdit) phase = 'form';
    if (phase === 'form' || phase === 'verify') {
      var price = await waitFor(mercPriceInput, 10000);
      if (!price) {
        if (!S.discovery && !S.editFallback) return go(ctx.cfg.MERC_MANAGE_URL || 'https://www.mercari.com/mypage/listings/', { phase: 'locate', editFallback: true, discovery: true });
        return fail('price_field_not_found', 'No Price input on the edit page', phase, 'input#Price[name="sellPrice"][data-testid="Price"]', {}, {});
      }
      if (phase === 'verify') {
        var okV = C.pricesMatch('MERCARI', price.value, W.price);
        if (okV) return done({ readBack: { price: price.value }, editUrl: S.editUrl || location.href });
        var vt = bumpTries(ctx, 'verifyTries', 1);
        if (!vt.over) return go(S.editUrl || location.href, { verifyTries: vt.n });
        return fail('verify_mismatch', 'Edit page re-read shows price "' + price.value + '", wanted ' + C.formatPrice('MERCARI', W.price), 'verify', 'input#Price', {});
      }
      var diag = S.formSnap ? undefined : snapshot('merc_form');
      var mercChanged = false;   // 1.0.48: nothing to save when the live price already equals the wanted one (Update stays disabled on an untouched form)
      if (W.price != null) {
        if (!C.pricesMatch('MERCARI', price.value, W.price)) {
          mercChanged = true;
          var ok = await writeField(price, C.formatPrice('MERCARI', W.price));
          if (!ok && !C.pricesMatch('MERCARI', price.value, W.price)) return fail('price_value_did_not_stick', 'Price input kept "' + price.value + '"', 'form', 'input#Price', {});
        }
        // Smart Pricing floor above the new price would be rejected / pull the price up again: lower it with the price (floor = 90%).
        var floor = mercFloorInput();
        var spBtn = q('button[data-testid="SmartPricingButton"]');
        if (!floor && spBtn && /^on$/.test(btnLabel(spBtn))) {   // verified-in-DOM: floor input is only rendered while Smart Pricing is ON
          var acc = q('button[data-testid="SmartPricingAccordion"]'); if (acc) { await realClick(acc); await sleep(500); floor = mercFloorInput(); }
        }
        if (floor) {
          var fv = C.parsePriceText(floor.value);
          if (fv != null && fv > C.wholeDollars(W.price)) { mercChanged = true; await writeField(floor, String(Math.max(1, Math.floor(C.wholeDollars(W.price) * 0.9)))); }
        }
        if (!mercChanged) return done({ readBack: { price: price.value }, editUrl: S.editUrl || location.href, alreadyCurrent: true });
      }
      var lb = q('button[data-testid="ListButton"]');   // verified-in-DOM: "Update", type=submit. Deactivate/Delete are different testids and are never matched.
      var save = (lb && visible(lb) && !isDisabled(lb) && /^(update|save)/.test(btnLabel(lb))) ? lb : findButton(/^(save|save changes|update|update listing|done)$/);
      if (!save) return fail('save_control_not_found', 'No Update control (button[data-testid="ListButton"]) enabled on the edit page', 'form', 'button[data-testid="ListButton"]', {}, { diag: diag });
      deferClick(save);
      return cont(3000, { phase: 'saved', formSnap: true, editUrl: S.editUrl || location.href, remoteId: id || (location.pathname.match(/\/sell\/edit\/(m\d+)/i) || [])[1] }, { diag: diag });
    }
    if (phase === 'saved') {
      var bl = pageBlock();
      if (bl) return blocked(bl.code, 'After Save: ' + bl.code, 'saved');
      var lab = await mercShippingLabelPrompt();
      if (lab && !S.labelHandled) {
        if (lab.best) {
          await realClick(lab.best); await sleep(500);
          var conf = findButton(/^(save|confirm|done|apply|next|continue)$/, qa('[role="dialog"]').filter(visible).pop() || document);
          if (conf) { deferClick(conf); return cont(3000, { labelHandled: true }, { diag: snapshot('merc_label_prompt') }); }
        }
        return fail('shipping_label_reselect_required', 'Mercari asks for a new shipping label after the price change and no selectable carrier option could be applied', 'saved', 'dialog radio/option + Save', {}, {});
      }
      var err = visibleErrorText();
      var priceNow = mercPriceInput();
      if (err && priceNow && !S.errSeen) return cont(2500, { errSeen: true });
      if (err && priceNow) return fail('save_rejected', 'Mercari showed: ' + err, 'saved', 'validation message', {});
      return go(S.editUrl || location.href, { phase: 'verify', verifyTries: 0 }, { details: { requests: recentRequests() } });
    }
    return fail('bad_phase', 'Unknown phase ' + phase, 'merc', '', {});
  }

  // ===================================================================================================================
  // GRAILED -- UI driven. /sell/for-sale is the seller's listings page and /listings/<id>/edit the edit page [existing,
  // both live-confirmed in config.js]. Cards carry "Edit Listing" text [existing comment, live 2026-09-04].
  // ===================================================================================================================
  function grPriceInput() {
    return q('input[type="tel"][name="price"]') || q('input[name="price"]') || findInput(/(^|\|\s*)price(\s*\||$)/i, /floor|minimum|ship|offer|original|retail/i) || findInput(/\bprice\b/i, /floor|minimum|ship|offer|original|retail|\(usd\) floor/i);
  }
  function grFloorInput() { return q('input[name="smartPricing.minimumPrice"]') || q('input[placeholder="Floor Price (USD)"]'); }   // [existing]
  function grCards() {
    var byId = {};
    qa('a[href*="/listings/"]').forEach(function (a) {
      var m = /\/listings\/(\d+)/.exec(a.getAttribute('href') || a.href || '');
      if (!m) return;
      var card = a.closest('[class*="ListingForSaleCard" i], [class*="listingCard" i]');   // [existing]
      var text = (card ? card.textContent : a.textContent) || '';
      if (!text.trim()) return;
      var e = byId[m[1]] || (byId[m[1]] = { key: m[1], texts: [], cardEl: card });
      e.texts.push(text);
    });
    return Object.keys(byId).map(function (k) { return byId[k]; });
  }
  async function grStep(ctx) {
    var S = ctx.scratch || {}, W = wants(ctx), it = ctx.item;
    var phase = S.phase || 'locate';
    var onEdit = /^\/listings\/\d+\/edit/.test(location.pathname);
    var id = S.remoteId || it.remoteListingId || '';
    if (phase === 'locate' && !onEdit) {
      if (/^\/sell\/for-sale/.test(location.pathname)) {
        await waitFor(function () { return qa('a[href*="/listings/"]').length > 0; }, 12000);
        for (var sc = 0; sc < 6; sc++) {
          var cards = grCards();
          var pick = id ? { match: cards.filter(function (c) { return c.key === id; })[0] || null, reason: 'id', count: 1 } : C.pickUnique(cards, it.title, 'contains');
          if (pick.match) return go('https://www.grailed.com/listings/' + pick.match.key + '/edit', { phase: 'form', remoteId: pick.match.key, discovered: true });
          if (pick.reason === 'ambiguous') return fail('ambiguous_title', pick.count + ' Grailed listings contain this title', 'locate', 'ListingForSaleCard', {});
          window.scrollTo(0, document.body.scrollHeight);
          await sleep(1200);
        }
        return fail('listing_not_found_on_grailed', 'No for-sale card matched ' + (id ? 'id ' + id : 'the full title'), 'locate', 'a[href*="/listings/"] in [class*="ListingForSaleCard"]', {}, {});
      }
      return go(C.startUrl('GRAILED', { id: it.id, remoteListingId: id }, ctx.cfg), {});
    }
    if (phase === 'locate') phase = 'form';
    if (phase === 'form' || phase === 'verify') {
      var price = await waitFor(grPriceInput, 10000);
      if (!price) {
        if (!S.discovery && !S.fallbackTried) return go(ctx.cfg.GRAILED_MANAGE_URL || 'https://www.grailed.com/sell/for-sale', { phase: 'locate', discovery: true, fallbackTried: true, remoteId: '' });
        return fail('price_field_not_found', 'No Price input on /listings/<id>/edit', phase, 'input[name="price"] | label Price', {});
      }
      var editUrl = S.editUrl || location.href;
      if (phase === 'verify') {
        if (C.pricesMatch('GRAILED', price.value, W.price)) return done({ readBack: { price: price.value }, editUrl: editUrl });
        var vt = bumpTries(ctx, 'verifyTries', 1);
        if (!vt.over) return go(editUrl, { verifyTries: vt.n });
        return fail('verify_mismatch', 'Edit page re-read shows price "' + price.value + '", wanted ' + C.formatPrice('GRAILED', W.price), 'verify', 'input[name="price"]', {});
      }
      var diag = S.formSnap ? undefined : snapshot('grailed_form');
      if (W.price != null && !C.pricesMatch('GRAILED', price.value, W.price)) {
        var ok = await writeField(price, C.formatPrice('GRAILED', W.price));
        if (!ok && !C.pricesMatch('GRAILED', price.value, W.price)) return fail('price_value_did_not_stick', 'Price input kept "' + price.value + '"', 'form', 'price input', {});
      }
      var floor = grFloorInput();
      if (floor && W.price != null) { var fv = C.parsePriceText(floor.value); if (fv != null && fv >= C.wholeDollars(W.price)) await writeField(floor, String(Math.max(1, Math.floor(C.wholeDollars(W.price) * 0.9)))); }
      // verified-in-DOM 2026-10-13: the edit page's only submit is "PUBLISH" (no Save/Update label); the form has no action (JS-driven).
      var save = qa('button[type="submit"], input[type="submit"]').filter(function (b) { return visible(b) && !isDisabled(b) && /^publish$/.test(btnLabel(b)); })[0] ||
        findButton(/^(publish|save|save changes|update|update listing|done)$/);
      if (!save) return fail('save_control_not_found', 'No PUBLISH/Save control enabled on the edit page', 'form', 'button[type=submit] text PUBLISH', {}, { diag: diag });
      deferClick(save);
      return cont(3500, { phase: 'saved', formSnap: true, editUrl: editUrl, remoteId: id || (location.pathname.match(/\/listings\/(\d+)/) || [])[1] }, { diag: diag });
    }
    if (phase === 'saved') {
      var bl = pageBlock();
      if (bl) return blocked(bl.code, 'After Save: ' + bl.code, 'saved');
      var err = visibleErrorText();
      if (err && grPriceInput() && !S.errSeen) return cont(2500, { errSeen: true });
      if (err && grPriceInput()) return fail('save_rejected', 'Grailed showed: ' + err, 'saved', 'validation message', {});
      return go(S.editUrl, { phase: 'verify', verifyTries: 0 }, { details: { requests: recentRequests() } });
    }
    return fail('bad_phase', 'Unknown phase ' + phase, 'grailed', '', {});
  }

  // ===================================================================================================================
  // CRAIGSLIST -- plain HTML. Dashboard table + row forms [existing, live-confirmed 2026-09-23 in
  // fas-craigslist-removal-frame.js]; edit flow Continue -> review -> Continue and input[name="price"] [documented].
  // ===================================================================================================================
  function clRows(doc) {
    var table = (doc || document).querySelector('table.accthp_postings');
    if (!table) return null;
    return Array.prototype.slice.call(table.querySelectorAll('tr.posting-row')).map(function (tr) {
      var st = tr.querySelector('td.status[data-postingid]');
      var a = tr.querySelector('td.title a');
      var cls = st ? st.classList : null;
      return { tr: tr, postingId: st ? String(st.getAttribute('data-postingid') || '') : '', active: !!(cls && cls.contains('active')),
        deleted: !!(cls && cls.contains('deleted')), titleRaw: a ? a.textContent : '' };
    }).filter(function (r) { return /^\d{6,}$/.test(r.postingId); });
  }
  // Craigslist cuts posting titles to ~70 chars, so a long FindA.Sale title shows on the dashboard as its first 60-72 characters (plus "- $price").
  // titleEquals only forgives one dangling word on titles of 75+ chars; here we also accept the dashboard text as a pure PREFIX of the wanted title when
  // it is long enough (60+ chars) that it cannot be a different listing. Callers still demand exactly one matching row.
  function clTitleMatches(raw, wanted) {
    if (C.titleEquals(raw, wanted)) return true;
    var c = C.cleanCandidateTitle(raw), w = C.foldTitle(wanted).replace(/\s*\.{3,}\s*$/, '');
    return !!(c && w && c.length >= 60 && c.length <= 72 && w.length > c.length && w.indexOf(c) === 0);
  }
  function clPickByTitle(cands, wanted) {
    var hits = cands.filter(function (r) { return clTitleMatches(r.titleRaw, wanted); });
    if (hits.length === 1) return { match: { key: hits[0].postingId, row: hits[0] }, reason: 'ok', count: 1 };
    return { match: null, reason: hits.length === 0 ? 'none' : 'ambiguous', count: hits.length };
  }
  function clRowPrice(titleRaw) {
    var m = /-\s*\$\s?([\d,]+(?:\.\d+)?)\s*$/.exec(String(titleRaw || '').replace(/\s+/g, ' ').trim());
    return m ? C.parsePriceText(m[1]) : null;
  }
  function clVerificationSurface() {
    if (qa('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .g-recaptcha, #captcha, [id*="captcha" i]').some(visible)) return 'captcha';
    var t = textOf(document.body).slice(0, 1500);
    if (/enter the (code|verification)|verify (your )?(phone|email|number)|we sent (you )?a (text|code)|phone verification/.test(t) && !q('input[name="price"]')) return 'verification';
    return null;
  }
  function hops0(S) { return S.hops || 0; }
  var CLG = self.FAS_CL_GUARD || null;   // fas-cl-guard.js (injected before this file); every use below is guarded so the engine still works without it

  // ---- 1.0.19 dashboard lookup: saved id -> one-word search -> page scan (never "gone" from a search alone) -----------------------------
  async function clFetchRows(url, init) {
    var res;
    try { res = await fetch(url, Object.assign({ credentials: 'same-origin', cache: 'no-store', headers: { 'Accept': 'text/html' } }, init || {})); }
    catch (e) { return { ok: false, reason: 'fetch_error' }; }
    if (!res.ok) return { ok: false, reason: 'http_' + res.status };
    var html = await res.text();
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var rows = CLG.parseDashboardRows(doc);
    if (!rows) {
      if (CLG.isNoPostings(doc.body ? doc.body.textContent : html)) return { ok: true, rows: [], none: true };
      return { ok: false, reason: /type=["']password["']/i.test(html) ? 'signed_out' : 'no_table' };
    }
    return { ok: true, rows: rows };
  }
  function clSearchForm() {
    var input = q('input[name="terms"]');
    return input && input.form ? { input: input, form: input.form } : null;
  }
  async function clSearchRows(word) {
    var sf = clSearchForm();
    if (!sf) return { ok: false, reason: 'no_search_form' };
    var fd = new FormData(sf.form);
    fd.set('terms', word);
    if (!fd.has('show_tab')) fd.set('show_tab', 'postings');
    if (!fd.has('filter_active')) fd.set('filter_active', 'all');
    var method = String(sf.form.method || 'get').toLowerCase(), action = sf.form.action || location.href;
    if (method === 'post') return clFetchRows(action, { method: 'POST', headers: { 'Accept': 'text/html', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fd).toString() });
    var u = new URL(action, location.href);
    fd.forEach(function (v, k) { if (typeof v === 'string') u.searchParams.set(k, v); });
    return clFetchRows(u.toString());
  }
  // Every page of the dashboard (all statuses). Page 1 first, then filter_page=N until a page comes back short. ok:false when any page failed.
  async function clScanPages() {
    var all = [], pages = 0;
    for (var n = 1; n <= 30; n++) {
      var r = await clFetchRows('https://accounts.craigslist.org/login/home?filter_page=' + n + '&show_tab=postings&filter_active=all');
      if (!r.ok) return { ok: false, reason: r.reason, pages: pages, rows: all.length };
      pages++;
      r.rows.forEach(function (x) { x.page = n; all.push(x); });
      if (r.rows.length < 50) break;
      await sleep(300);
    }
    return { ok: true, rows: all, pages: pages };
  }
  function clIdList(ids) { return (ids || []).slice(0, 10).map(function (i) { return String(i); }); }
  // -> { go:result } | { fail:result } | { blocked:result } | { target:{id, via:'search'|'scan', page, word} }
  async function clLookup(it, phase) {
    var wanted = it.title, remoteId = it.remoteListingId ? String(it.remoteListingId) : '';
    var diag = { lookup: remoteId ? 'id' : 'title' };
    function bad(r, where) {
      if (r.reason === 'signed_out') return { blocked: blocked('login_required', 'Craigslist dashboard asks for sign-in', phase) };
      return { fail: fail('dashboard_scan_failed', 'Could not read the Craigslist dashboard (' + where + ': ' + r.reason + ')', 'locate', 'fetch filter_page', {}, { details: Object.assign(diag, { scanReason: r.reason, pagesRead: r.pages }) }) };
    }
    function verdict(c, via, word) {
      if (c.kind === 'found') return { target: { id: c.row.postingId, via: via, page: c.row.page || null, word: word || '', titleRaw: c.row.titleRaw } };
      if (c.kind === 'ambiguous') {
        tLog('warn', 'ambiguous_title', c.ids.length + ' active Craigslist postings share this title; nothing was edited', { candidates: clIdList(c.ids) });
        return { fail: fail('ambiguous_title', c.ids.length + ' active postings share this title', 'locate', 'td.title a', {}, { details: Object.assign(diag, { candidates: clIdList(c.ids) }) }) };
      }
      if (c.kind === 'gone') return { fail: fail('listing_gone_on_dashboard', 'The posting is ' + c.status + ' on the Craigslist dashboard (' + clIdList(c.ids).join(', ') + ')', 'locate', 'td.status', {}, { details: Object.assign(diag, { status: c.status, ids: clIdList(c.ids) }) }) };
      return null;
    }
    var matcher = clTitleMatches;
    if (!remoteId) {
      var word = CLG.pickSearchWord(wanted);
      diag.searchWord = word;
      if (word) {
        var sr = await clSearchRows(word);
        diag.searchOk = sr.ok; diag.searchRows = sr.ok ? sr.rows.length : undefined;
        if (sr.ok && sr.rows.length && sr.rows.length < 50) {
          var v1 = verdict(CLG.classifyLookup(sr.rows, { title: wanted, matcher: matcher }), 'search', word);
          if (v1) return v1;
        }
      }
    }
    var sc = await clScanPages();
    if (!sc.ok) return bad(sc, 'page scan');
    diag.pagesScanned = sc.pages; diag.rowsSeen = sc.rows.length;
    var v2 = verdict(CLG.classifyLookup(sc.rows, remoteId ? { remoteId: remoteId } : { title: wanted, matcher: matcher }), 'scan', '');
    if (v2) return v2;
    return { fail: fail('listing_not_found_on_dashboard', (remoteId ? 'Posting id ' + remoteId : 'No posting with this title') + ' is not on any of ' + sc.pages + ' dashboard page(s), in any status', 'locate', 'tr.posting-row td.title a', {}, { details: diag }) };
  }
  // 1.0.22 helpers. Page signature = host + path (ids masked) + title + which key controls exist + the visible button labels; values are
  // left out so typing a price does not change it. Used to count real page transitions and to spot a page that never advances.
  function clPageSig() {
    try {
      var labels = {};
      qa(BTN_SEL).filter(visible).forEach(function (b) { var l = btnLabel(b).toLowerCase().slice(0, 24); if (l) labels[l] = 1; });
      var names = Object.keys(labels).sort().slice(0, 14).join(',');
      return [location.hostname, String(location.pathname || '').replace(/[0-9A-Za-z_-]{12,}/g, '#'), String(document.title || '').toLowerCase().slice(0, 40), ((/[?&]s=([a-z_]+)/.exec(location.search || '') || [])[1] || ''),
        (q('input[name="price"]') ? 'P' : '-') + ((q('#PostingTitle') || q('input[name="PostingTitle"]')) ? 'T' : '-'), names].join('|');
    } catch (e) { return 'sig_error'; }
  }
  function visibleContinue() { return qa('button.continue').filter(function (b) { return visible(b) && !isDisabled(b); })[0] || null; }
  function clPublishButton() {
    return qa('button, input[type="submit"], input[type="button"], [role="button"]').filter(function (b) { return visible(b) && !isDisabled(b) && /^publish$/.test(btnLabel(b).toLowerCase()); })[0] || null;
  }
  async function clStep(ctx) {
    var S = ctx.scratch || {}, W = wants(ctx), it = ctx.item;
    var phase = S.phase || 'locate';
    var host = location.hostname;
    var onDash = /accounts\.craigslist\.org$/.test(host) && /\/login\/home/.test(location.pathname);
    if (phase === 'locate' || phase === 'verify') {
      if (!onDash) return go(C.craigslistPageUrl(S.page || 1), {});
      var rows = await waitFor(function () { return clRows(document); }, 8000);
      if (!rows) {
        if (passwordSurface() || pageBlock()) return blocked('login_required', 'Craigslist dashboard asks for sign-in', phase);
        return fail('dashboard_table_missing', 'table.accthp_postings not found on the account dashboard', phase, 'table.accthp_postings > tr.posting-row', {});
      }
      var page = (/[?&]filter_page=(\d+)/.exec(location.search) || [0, 1])[1] | 0;
      if (phase === 'verify') {
        var mine = rows.filter(function (r) { return r.postingId === S.postingId; })[0];
        if (!mine) {
          if (rows.length >= 50 && page < 30) return go(C.craigslistPageUrl(page + 1), {});
          return fail('verify_row_not_found', 'Posting ' + S.postingId + ' not on dashboard page ' + page, 'verify', 'td.status[data-postingid]', {});
        }
        var shown = clRowPrice(mine.titleRaw);
        var shownMatches = shown != null && C.pricesMatch('CRAIGSLIST', shown, W.price);
        if (shownMatches) return done({ readBack: { price: shown }, postingId: S.postingId, priceSetByThisRun: !!S.priceSet }, { postingId: S.postingId });
        var vt = bumpTries(ctx, 'verifyTries', 2);
        if (!vt.over) return go(C.craigslistPageUrl(page), { verifyTries: vt.n }, { delayAfterMs: 4000 });
        // 2026-10-17: Craigslist reached its "Thanks for posting" page. If THIS run never typed the price, the live listing is the only truth:
        // it still shows the old price, so say so plainly instead of claiming success (and never republish to "fix" it).
        if (CLG && CLG.editOutcome(!!S.priceSet, shown, shownMatches) === 'confirmed_without_price') {
          return fail('edit_confirmed_without_price', 'Craigslist reached its posting confirmation page but the live listing still shows $' + shown + ', not $' + C.formatPrice('CRAIGSLIST', W.price), 'verify', 'td.title a "- $price" suffix', { postingId: S.postingId }, { details: { liveShown: shown, wanted: W.price, priceSetByThisRun: false } });
        }
        return fail('verify_mismatch', 'Dashboard row shows "' + String(mine.titleRaw).replace(/\s+/g, ' ').trim().slice(-30) + '", wanted $' + C.formatPrice('CRAIGSLIST', W.price), 'verify', 'td.title a "- $price" suffix', {});
      }
      var chosen = null;
      if (CLG && S.targetId) {
        // Second hop: the lookup found the posting; its row is on this page now. Only the row with that exact id is used.
        chosen = rows.filter(function (r) { return r.postingId === S.targetId; })[0] || null;
        if (!chosen) return fail('listing_not_found_on_dashboard', 'Posting ' + S.targetId + ' was found by the lookup but is not on this dashboard page', 'locate', 'td.status[data-postingid]', {}, { details: { targetId: S.targetId, page: page } });
        if (!chosen.active) return fail('listing_gone_on_dashboard', 'The posting is ' + (chosen.deleted ? 'deleted' : 'not active') + ' on the Craigslist dashboard (' + chosen.postingId + ')', 'locate', 'td.status', {}, { details: { ids: [chosen.postingId] } });
      } else if (CLG) {
        var lk = await clLookup(it, phase);
        if (lk.blocked) return lk.blocked;
        if (lk.fail) return lk.fail;
        var tg = lk.target;
        chosen = rows.filter(function (r) { return r.postingId === tg.id && r.active; })[0] || null;   // already on the page that is open
        if (!chosen) {
          // Open the row where its Edit button lives: a real search for a search hit, the page that holds it for a scan hit.
          var sf = tg.via === 'search' ? clSearchForm() : null;
          if (sf && tg.word) {
            tStep('Searching your Craigslist posts for "' + tg.word + '"', 'one matching active post was found; I open it from the search results');
            setNative(sf.input, tg.word);
            setTimeout(function () { try { if (sf.form.requestSubmit) sf.form.requestSubmit(); else sf.form.submit(); } catch (e) { /* page may be gone */ } }, 80);
            return cont(3000, { targetId: tg.id, rowTitle: String(tg.titleRaw || '').replace(/\s+/g, ' ').trim().slice(0, 140) });
          }
          return go(C.craigslistPageUrl(tg.page || 1), { targetId: tg.id, page: tg.page || 1 });
        }
      }
      if (!CLG) {
      var cands = rows.filter(function (r) { return r.active; });
      if (it.remoteListingId) chosen = cands.filter(function (r) { return r.postingId === it.remoteListingId; })[0] || null;
      if (!chosen) {
        var pick = clPickByTitle(cands, it.title);
        if (pick.reason === 'ambiguous') {
          var clC = cands.filter(function (r) { return clTitleMatches(r.titleRaw, it.title); }).slice(0, 10).map(function (r) { return { id: r.postingId, price: clRowPrice(r.titleRaw) }; });
          return fail('ambiguous_title', pick.count + ' active postings share this title', 'locate', 'td.title a', {}, { details: { candidates: clC } });
        }
        if (pick.match) chosen = pick.match.row;
      }
      if (!chosen) {
        if (rows.length >= 50 && page < 30) return go(C.craigslistPageUrl(page + 1), { page: page + 1 });
        return fail('listing_not_found_on_dashboard', 'No active posting with this title/id on ' + page + ' dashboard page(s)', 'locate', 'tr.posting-row td.title a', {});
      }
      }
      var btn = qa('input[type="submit"], input.managebtn, button', chosen.tr).filter(function (b) { return /^edit$/.test(btnLabel(b)); })[0];
      if (!btn) return fail('edit_button_not_found', 'Row for posting ' + chosen.postingId + ' has no "edit" submit control', 'locate', 'tr.posting-row input.managebtn[value=edit]', {}, { diag: snapshot('cl_row') });
      deferClick(btn);
      return cont(3000, { phase: 'edit', postingId: chosen.postingId, page: page, hops: 0, priceSet: false, rowTitle: String(chosen.titleRaw || '').replace(/\s+/g, ' ').trim().slice(0, 140) }, { diag: snapshot('cl_dashboard') });
    }
    if (phase === 'edit') {
      var bl = pageBlock();
      if (bl) return blocked(bl.code, 'Craigslist edit flow: ' + bl.code, 'edit');
      var vs = clVerificationSurface();
      if (vs) return blocked('captcha_or_verification', 'Craigslist asks for ' + vs + ' during the edit flow (stopped, not looping)', 'edit');
      // 1.0.22: the edit flow must never sit on the account dashboard. After the price was typed the dashboard is where the result is read
      // (handled below, phase verify). With NO price typed it means the edit session was lost (the Edit click never opened an edit page, or
      // Craigslist sent the browser back): stop now with a snapshot instead of pressing buttons on the dashboard (production: 13 x "continue"
      // on /login/home, then edit_flow_stuck). One short grace step is allowed right after the Edit click in case the navigation is still loading.
      if (onDash && !S.priceSet) {
        if ((S.hops || 0) === 0 && !S.dashGrace) return cont(3000, { dashGrace: true });
        return fail('edit_lost_to_dashboard', 'The Craigslist edit flow is back on the account dashboard before any price was entered; the edit was lost and nothing was changed', 'edit', 'a.edit | input.managebtn[value=edit]', { hops: S.hops || 0 }, { details: { signature: clPageSig(), sigTrail: S.sigTrail || [], priceSet: false } });
      }
      // 2026-10-17: Craigslist's terminal page ("Thanks for posting!", button "Manage your post") is the END of the edit flow, never a form to
      // continue through (the old loop pressed Continue on it 12 times). Do not click anything here: go read the live price from the dashboard
      // and decide from that. No republish, no second posting.
      if (!onDash && CLG && !q('input[name="price"]') && CLG.isPostingConfirmation(textOf(document.body), document.title)
          && !qa('input[type="submit"], button').some(function (b) { return visible(b) && /^(publish|edit post)$/.test(btnLabel(b)); })) {
        tStep('Craigslist showed its confirmation page; checking the live price', 'the edit finished on Craigslist\'s side; I read the price from your dashboard before calling it done');
        return go(C.craigslistPageUrl(S.page || 1), { phase: 'verify', verifyTries: 0, viaConfirmation: true }, { diag: snapshot('cl_confirmation'), details: { requests: recentRequests() } });
      }
      // Identity check (1.0.23, fail closed): Craigslist keeps one posting-flow state per session, so the page may belong to a DIFFERENT posting than
      // the one this run chose (a leftover edit session). A positive title mismatch aborts at once. An UNREADABLE title no longer passes: before any
      // click that advances or publishes (edit post, edit this posting, continue on the form, publish) the title must be read on this very page and be
      // compatible with the dashboard row title / FindA.Sale title, otherwise posting_identity_unverified and nothing is clicked (see idGate below).
      var idStatus = 'unknown', pgTitle = '';
      if (!onDash && CLG) {
        var previewUp = qa('input[type="submit"], button, a').some(function (b) { return visible(b) && /^(edit post|edit this posting|publish)$/.test(btnLabel(b)); });
        pgTitle = CLG.pagePostingTitle(document, { preview: previewUp });
        idStatus = pgTitle ? CLG.titlesCompatible(pgTitle, [S.rowTitle, it.title]) : 'unknown';
        if (idStatus === 'mismatch') {
          return fail('posting_identity_mismatch', 'The Craigslist page is for "' + pgTitle.slice(0, 60) + '", not "' + String(it.title || '').slice(0, 60) + '"; nothing was edited', 'edit', '#PostingTitle | .postingtitle', { hops: hops0(S) }, { details: { pageTitle: pgTitle.slice(0, 80), expected: String(S.rowTitle || it.title || '').slice(0, 80) } });
        }
      }
      // strict: this page's own title must have been read and matched. lenient (generic Continue / Done pages such as the images or location
      // step, which carry no title): allowed only after an earlier page of THIS run already matched.
      function idGate(strict, what) {
        if (!CLG) return null;
        if (idStatus === 'match') return null;
        if (!strict && S.identityOk) return null;
        return fail('posting_identity_unverified', 'Could not confirm this Craigslist page belongs to "' + String(it.title || '').slice(0, 60) + '" (' + (pgTitle ? 'title not comparable' : 'no posting title could be read') + ') so "' + what + '" was NOT pressed and nothing was changed', 'edit', '#PostingTitle | .postingtitle | preview heading', { hops: hops0(S) }, { details: { pageTitle: pgTitle.slice(0, 80), expected: String(S.rowTitle || it.title || '').slice(0, 80), blockedClick: what, signature: clPageSig() } });
      }
      // 1.0.22: hops counts real page TRANSITIONS only (a new page signature), not polling steps on the same page. The same signature seen again
      // is a page that did not advance: the step after the first sighting only waits, the next one may retry the click once, and the fourth
      // consecutive sighting fails fast with the signature in the diag. mark carries this bookkeeping into every continue below.
      var sig = clPageSig();
      var sameAsLast = S.sig === sig;
      var rep = sameAsLast ? (S.sigRep || 1) + 1 : 1;
      var hops = (S.hops || 0) + (sameAsLast ? 0 : 1);
      var sigTrail = sameAsLast ? (S.sigTrail || []) : (S.sigTrail || []).concat([sig]).slice(-6);
      var mark = { hops: hops, sig: sig, sigRep: rep, sigTrail: sigTrail, identityOk: idStatus === 'match' || !!S.identityOk };
      if (rep >= 4) {
        return fail('edit_page_not_advancing', 'The Craigslist page did not change after ' + (rep - 1) + ' tries (same page signature); stopped instead of looping', 'edit', 'button.continue | button publish', mark, { details: { signature: sig, repeats: rep - 1, sigTrail: sigTrail, priceSet: !!S.priceSet } });
      }
      if (rep === 2) return cont(3000, mark);   // the click may still be navigating: wait, do not click again
      if (hops > 12) {
        // The price was typed and the flow kept going: the dashboard may already show it. Check once before declaring the flow stuck.
        if (S.priceSet && !S.stuckChecked) return go(C.craigslistPageUrl(S.page || 1), { phase: 'verify', verifyTries: 0, stuckChecked: true });
        return fail('edit_flow_stuck', 'More than 12 pages in the edit flow without finishing', 'edit', 'button.continue', mark, { details: { signature: sig, sigTrail: sigTrail, priceSet: !!S.priceSet } });
      }
      var saved = /(your changes (have been )?(saved|made)|posting has been (updated|saved|changed)|your posting (has been|was) (updated|saved))/.test(textOf(document.body).slice(0, 3000));
      if (saved || (onDash && S.priceSet)) return go(C.craigslistPageUrl(S.page || 1), { phase: 'verify', verifyTries: 0 }, { details: { requests: recentRequests() } });
      var price = q('input[name="price"]') || q('#price') || findInput(/(^|\|\s*)(asking )?price(\s*\||$)/i, /ship|original/i);   // name unverified by inspection: documented input[name=price] first
      if (price && visible(price)) {
        var diag = S.formSnap ? undefined : snapshot('cl_edit_form');
        if (W.price != null && !C.pricesMatch('CRAIGSLIST', price.value, W.price)) {
          var ok = await writeField(price, C.formatPrice('CRAIGSLIST', W.price));
          if (!ok && !C.pricesMatch('CRAIGSLIST', price.value, W.price)) return fail('price_value_did_not_stick', 'input[name="price"] kept "' + price.value + '"', 'edit', 'input[name="price"]', { hops: hops });
        }
        var cont1 = visibleContinue() || findButton(/^continue$/) || qa('input[type="submit"]').filter(function (b) { return /continue/i.test(b.value || ''); })[0];
        if (!cont1) return fail('continue_button_not_found', 'No Continue button after setting the price', 'edit', 'button.continue | input[type=submit][value=Continue]', { hops: hops });
        var g1 = idGate(true, 'continue'); if (g1) return g1;
        tStep('Pressing Continue to keep the new price ' + (W.price != null ? money('CRAIGSLIST', W.price) : ''), 'Craigslist saves the change when the edit steps are continued and published');
        deferClick(cont1);
        return cont(3000, Object.assign({}, mark, { priceSet: true, formSnap: true }), { diag: diag });
      }
      // 2026-10-16: the edit flow lands on a PREVIEW page (publish / edit post / edit location / edit images / cancel edit). The price
      // input only exists after "edit post". Without this the generic Publish click below re-published the listing UNCHANGED
      // (listing "updated", price untouched). Never click publish until the price has been set.
      if (!S.priceSet) {
        var editPost = qa('input[type="submit"], button, a').filter(function (b) { return visible(b) && /^edit post$/.test(btnLabel(b)); })[0];
        if (editPost) { var g2 = idGate(true, 'edit post'); if (g2) return g2; tStep('Clicking "edit post"', 'Craigslist opened the preview page; the price box only appears after "edit post"'); deferClick(editPost); return cont(3000, mark); }
      }
      var editThis = qa('input[type="submit"], button, a').filter(function (b) { return visible(b) && /^edit this posting$/.test(btnLabel(b)); })[0];
      if (editThis && !S.priceSet) { var g3 = idGate(true, 'edit this posting'); if (g3) return g3; tStep('Clicking "edit this posting"', 'Craigslist is showing the manage page for this post'); deferClick(editThis); return cont(3000, mark, { diag: S.manageSnap ? undefined : snapshot('cl_manage_page') }); }
      var imgDone = q('button.done') || findButton(/^done with images$/);
      if (imgDone) { var g4 = idGate(false, 'done with images'); if (g4) return g4; deferClick(imgDone); return cont(3000, mark); }
      // 1.0.22: the preview page ("press publish to apply edits") needs the publish button, and Craigslist keeps hidden button.continue
      // elements around, which the old q('button.continue') picked first (click on an invisible control = nothing happens, 13 times).
      // Only VISIBLE controls count, and with the price already typed publish wins over continue.
      var pubBtn = S.priceSet ? clPublishButton() : null;
      if (pubBtn) { var g5 = idGate(true, 'publish'); if (g5) return g5; tStep('Pressing "publish" to apply the Craigslist edit', 'the preview page shows the new price; publish applies it, then Craigslist shows its confirmation page'); deferClick(pubBtn); return cont(3000, Object.assign({}, mark, { published: true })); }
      var anyCont = visibleContinue() || findButton(/^(continue|publish|done|ok)$/) || qa('input[type="submit"]').filter(function (b) { return /^(continue|publish|done)/i.test(b.value || ''); })[0];
      if (anyCont && S.priceSet) { var g6 = idGate(!/^(continue|done|ok)$/.test(btnLabel(anyCont).toLowerCase()), btnLabel(anyCont) || 'continue'); if (g6) return g6; tStep('Pressing "' + (btnLabel(anyCont) || 'continue') + '" to finish the Craigslist edit', 'the price is already changed; this publishes it'); deferClick(anyCont); return cont(3000, mark); }
      // 2026-10-17: price_field_not_found now means exactly one thing: the real posting form (it has the Title box) is on screen and, after a
      // wait for a late-rendering price box, still has no price input. Any other page (preview, images, confirmation, a hijacked page) just keeps
      // going until the 12 page limit and is reported as edit_flow_stuck, so it can no longer be mislabelled as "category has no price field".
      var onForm = !!(q('#PostingTitle') || q('input[name="PostingTitle"]'));
      if (!S.priceSet && onForm) {
        var late = await waitFor(function () { var pf = q('input[name="price"]') || q('#price'); return pf && visible(pf) ? pf : null; }, 4000);
        if (late) return cont(300, Object.assign({}, mark, { hops: hops - 1 }));
        var np = (S.noPriceTries || 0) + 1;
        if (np >= 2) return fail('price_field_not_found', 'The Craigslist edit form (Title box present) has no input[name="price"] after ' + np + ' looks (category may have no price field)', 'edit', 'input[name="price"]', { hops: hops, noPriceTries: np });
        return cont(1500, Object.assign({}, mark, { noPriceTries: np }));
      }
      return cont(1500, mark);
    }
    return fail('bad_phase', 'Unknown phase ' + phase, 'cl', '', {});
  }

  // ===================================================================================================================
  // GUMTREE AU -- server-rendered. Manage Ads (m-my-ads.html) -> Edit -> form#pstad-main-form, fields price.amount /
  // price.type, "Save ad" [documented: help.gumtree.com.au + GummieBot source]. Edit control discovered per ad card.
  // ===================================================================================================================
  function gtEditControls() {
    return qa('a, button, [role="button"], input[type="submit"]').filter(function (e) { return visible(e) && /^edit( ad)?$/.test(btnLabel(e)); });
  }
  function gtCards(idHint) {
    var out = [];
    gtEditControls().forEach(function (ctl) {
      var el = ctl, hops = 0, card = null;
      while (el && hops < 9) {
        el = el.parentElement; hops++;
        if (!el) break;
        if (gtEditControls().filter(function (c) { return el.contains(c); }).length === 1 && textOf(el).length > 15) card = el; else if (card) break;
      }
      if (card) out.push({ key: cardKey(card), ctl: ctl, el: card, texts: [card.textContent], idMatch: idHint ? card.innerHTML.indexOf(idHint) !== -1 : false });
    });
    return out;
  }
  async function gtStep(ctx) {
    var S = ctx.scratch || {}, W = wants(ctx), it = ctx.item;
    var phase = S.phase || 'locate';
    var formEl = q('form#pstad-main-form');
    if (phase === 'locate' && !formEl) {
      if (!/m-my-ads/.test(location.pathname)) return go(C.startUrl('GUMTREE_AU', it, ctx.cfg), {});
      var bl0 = pageBlock();
      if (bl0) return blocked(bl0.code, 'Gumtree: ' + bl0.code, 'locate');
      await waitFor(function () { return gtEditControls().length > 0; }, 10000);
      var cards = gtCards(it.remoteListingId);
      var idHit = it.remoteListingId ? cards.filter(function (c) { return c.idMatch; }) : [];
      var pick = idHit.length === 1 ? { match: idHit[0], reason: 'id', count: 1 } : C.pickUnique(cards, it.title, 'contains');
      if (!pick.match) {
        var nextLink = qa('a[rel="next"], a').filter(function (a) { return visible(a) && (a.getAttribute('rel') === 'next' || /^(next|next page|>|›)$/.test(btnLabel(a))); })[0];
        var pg = (S.page || 1);
        if (nextLink && pick.reason === 'none' && pg < 10) return go(nextLink.href, { page: pg + 1 });
        return fail(pick.reason === 'ambiguous' ? 'ambiguous_title' : 'listing_not_found_on_my_ads', 'Manage Ads card match: ' + pick.reason + ' (' + pick.count + ')', 'locate', 'Edit control inside the ad card', {}, { diag: snapshot('gt_my_ads') });
      }
      var ctl = pick.match.ctl;
      var nextPhase = S.verifyMode ? 'verify' : 'form';
      if (ctl.getAttribute && ctl.getAttribute('href') && ctl.tagName === 'A') return go(ctl.href, { phase: nextPhase, editUrl: ctl.href });
      deferClick(ctl);
      return cont(3000, { phase: nextPhase });
    }
    if (phase === 'locate') phase = 'form';
    if (phase === 'form' || phase === 'verify') {
      var amount = await waitFor(function () { return q('input[name="price.amount"]'); }, 10000);
      if (!amount) {
        var t = bumpTries(ctx, 'formTries', 1);
        if (!t.over) return cont(2000, { formTries: t.n });
        return fail('price_field_not_found', 'No input[name="price.amount"] on the edit page', phase, 'form#pstad-main-form input[name="price.amount"]', {});
      }
      if (phase === 'verify') {
        if (C.pricesMatch('GUMTREE_AU', amount.value, W.price)) return done({ readBack: { price: amount.value } });
        return fail('verify_mismatch', 'Edit page re-read shows "' + amount.value + '", wanted ' + C.formatPrice('GUMTREE_AU', W.price), 'verify', 'input[name="price.amount"]', {});
      }
      var diag = S.formSnap ? undefined : snapshot('gt_form');
      var type = q('select[name="price.type"]');
      if (type && /^(GIVE_AWAY|SWAP_TRADE)$/.test(type.value) && W.price != null) {
        type.value = 'FIXED'; type.dispatchEvent(new Event('change', { bubbles: true })); await sleep(300);   // [guess] a free/swap ad being given a price becomes FIXED
      }
      if (W.price != null && !C.pricesMatch('GUMTREE_AU', amount.value, W.price)) {
        var ok = await writeField(amount, C.formatPrice('GUMTREE_AU', W.price));
        if (!ok && !C.pricesMatch('GUMTREE_AU', amount.value, W.price)) return fail('price_value_did_not_stick', 'price.amount kept "' + amount.value + '"', 'form', 'input[name="price.amount"]', {});
      }
      var save = findButton(/^save ad$/, document) || findButton(/^(save|update|post|post ad|update ad)( changes)?$/, qa('form#pstad-main-form')[0] || document) ||
        qa('form#pstad-main-form button[type="submit"], form#pstad-main-form input[type="submit"]').filter(function (b) { return visible(b) && !isDisabled(b); })[0];
      if (!save) return fail('save_control_not_found', 'No "Save ad" control on the edit form', 'form', 'button text "Save ad"', {}, { diag: diag });
      deferClick(save);
      return cont(3500, { phase: 'saved', formSnap: true, editUrl: S.editUrl || location.href }, { diag: diag });
    }
    if (phase === 'saved') {
      var bl = pageBlock();
      if (bl) return blocked(bl.code, 'After Save ad: ' + bl.code, 'saved');
      var err = visibleErrorText();
      var stillForm = !!q('form#pstad-main-form input[name="price.amount"]');
      if (stillForm && err) return fail('save_rejected', 'Gumtree showed: ' + err, 'saved', '.notification--error', {});
      // Verify by re-opening: discovery again (the edit URL is not known to be stable), read-only.
      return go(C.startUrl('GUMTREE_AU', it, ctx.cfg), { phase: 'locate', verifyMode: true, formSnap: true, page: 1 }, { details: { requests: recentRequests() } });
    }
    return fail('bad_phase', 'Unknown phase ' + phase, 'gt', '', {});
  }

  // ===================================================================================================================
  // dispatcher
  // ===================================================================================================================
  function describePhase(ctx) {
    var p = ctx.platform, L = (C.LABELS && C.LABELS[p]) || p, S = ctx.scratch || {}, it = ctx.item || {}, W = wants(ctx);
    var ph = S.phase || 'locate', t = String(it.title || 'the listing').slice(0, 50);
    var np = W.price != null ? money(p, W.price) : '';
    var goal = np ? 'change its price to ' + np + (S.oldPrice != null ? ' (was ' + money(p, S.oldPrice) + ')' : '') : 'update its stock number';
    if (/verify|^saved$/.test(ph) && ph !== 'saved') return { what: 'Re-reading the live ' + (np ? 'price' : 'stock') + ' on ' + L + ' to confirm it saved', why: 'FindA.Sale only marks this item synced after ' + L + ' itself shows ' + (np || 'the new stock') };
    if (ph === 'saved') return { what: 'Checking that ' + L + ' accepted the save', why: 'looking for a confirmation or an error message before I re-read the listing' };
    if (ph === 'api') return { what: 'Opening ' + L + '\'s edit page for this listing', why: 'I have its listing id, so I can edit it directly and need to ' + goal };
    if (ph === 'form' || ph === 'edit' || ph === 'itempage') return { what: np ? 'Setting price to ' + np + ' on ' + L : 'Setting stock on ' + L, why: 'the price on FindA.Sale changed' + (S.oldPrice != null ? ' from ' + money(p, S.oldPrice) : '') + ' and the marketplace listing must match' };
    // locate
    if (p === 'CRAIGSLIST') {
      var onDash = /accounts\.craigslist\.org$/.test(location.hostname) && /\/login\/home/.test(location.pathname);
      return onDash ? { what: 'Looking for "' + t + '" among your active Craigslist posts', why: it.remoteListingId ? 'matching the saved posting id first, then the exact title' : 'matching by exact title; I will not edit if two posts share it' }
                    : { what: 'Opening your Craigslist dashboard to find the listing', why: 'Craigslist lists your active posts there, and I need to ' + goal };
    }
    if (p === 'POSHMARK') {
      var hasId = !!(S.remoteId || it.remoteListingId || (ctx.idCache && ctx.idCache['POSHMARK:' + it.id]));
      return hasId ? { what: 'Opening the Poshmark listing directly', why: 'I already know its listing id, so no title search is needed' }
                   : { what: 'Searching your Poshmark closet for "' + t + '"', why: 'no saved listing id yet; I will only edit if exactly one listing has this exact title' };
    }
    return { what: 'Finding "' + t + '" in your ' + L + ' listings', why: 'so I can ' + goal };
  }
  function humanize(code, reason, L, item) {
    var r = String(reason || code || '');
    var m = {
      ambiguous_title: ['More than one of your ' + L + ' listings has this exact title, and FindA.Sale has no saved listing id for this item.', 'Editing one at random could change the wrong listing, so nothing was edited.', 'This item is marked as needing its saved listing id and will keep being skipped, with this reason in the activity log, until the id is saved or the listings get different titles. Candidate ids and prices are in the activity log.'],
      login_required: ['You appear to be signed out of ' + L + '.', 'The marketplace showed a sign-in page instead of your listings.', 'Sign in to ' + L + ' in this browser. FindA.Sale pauses ' + L + ' edits for a while and resumes automatically.'],
      captcha_or_verification: [L + ' asked for a security check.', 'Automatic editing stops at captchas and verification screens so your account is not put at risk.', 'Complete the check in ' + L + ' yourself; FindA.Sale pauses ' + L + ' edits and tries again later.'],
      price_field_not_found: ['The edit form opened but no price box was found.', 'The marketplace page layout may have changed, or this listing type has no price field.', 'Nothing was changed. FindA.Sale will retry later; the page snapshot below shows what was on screen.'],
      edit_confirmed_without_price: ['Craigslist finished the edit but the live listing still shows the old price.', 'The price box was never filled in, so nothing was changed. The listing was not republished and no second post was made.', 'The item is not marked synced, so FindA.Sale tries again on the next retry. The page snapshot below shows what was on screen.'],
      posting_identity_mismatch: ['Craigslist showed a different posting than the one being edited.', 'Craigslist keeps one posting in progress per session, and another Craigslist task had its page open. Editing it would have changed the wrong listing.', 'Nothing was edited. FindA.Sale retries later, after the other Craigslist task is finished.'],
      edit_lost_to_dashboard: ['The Craigslist edit was lost: the browser ended up on the account dashboard before the price was entered.', 'The Edit click did not open an edit page, or Craigslist sent the browser back. Nothing was changed.', 'FindA.Sale retries later; the page snapshot below shows what was on screen.'],
      edit_page_not_advancing: ['A Craigslist page did not change after several tries.', 'The same page (see the signature in the details) stayed on screen, so FindA.Sale stopped instead of pressing buttons in a loop. Nothing was confirmed as changed.', 'FindA.Sale retries later; the page snapshot below shows what was on screen.'],
      edit_flow_stuck: ['The Craigslist edit pages kept going past the expected number of steps.', 'Craigslist did not reach its confirmation page.', 'Nothing was confirmed as changed. FindA.Sale will retry later; the page snapshot below shows what was on screen.'],
      price_value_did_not_stick: ['The price box would not keep the new value.', 'The page rewrote the field after FindA.Sale typed in it.', 'Nothing was saved. FindA.Sale will retry later.'],
      verify_mismatch: ['FindA.Sale saved the new price but the live listing still shows something different.', 'The marketplace may not have accepted the change yet, or it changed another value.', 'The item is not marked synced, so FindA.Sale re-checks it on the next retry. Look at the listing yourself if this repeats.'],
      save_control_not_found: ['The price was entered but no Save/Update button could be found.', 'The marketplace page layout may have changed.', 'Nothing was saved. FindA.Sale will retry later.'],
      listing_gone_on_dashboard: ['This post is already ' + 'deleted or expired on your ' + L + ' dashboard.', 'The dashboard shows a post with this title, but its status is Deleted or Expired, so there is nothing live to edit.', 'Nothing was changed and no new post was made. FindA.Sale clears the Craigslist sync for this item on its next removal check.'],
      dashboard_scan_failed: ['Could not read your ' + L + ' dashboard pages.', 'A dashboard page did not load completely, so I cannot tell whether the post exists.', 'Nothing was changed. FindA.Sale will retry later.'],
      listing_not_found_on_dashboard: ['The listing was not found on your ' + L + ' dashboard.', 'I searched your posts and then read every dashboard page (all statuses) and none matched, so it may have a different title there or be missing from this account.', 'FindA.Sale will retry later; if the listing is gone the sync will be cleared by the next removal check.'],
      listing_not_found_in_closet: ['The listing was not found in your ' + L + ' closet.', 'It may be sold, removed, or titled differently than on FindA.Sale.', 'FindA.Sale will retry later.'],
      edit_control_not_found: ['No Edit control was found for this listing.', 'The marketplace page layout may have changed, or the listing is not editable right now.', 'Nothing was changed. FindA.Sale will retry later.'],
      engine_exception: ['FindA.Sale hit an unexpected error while editing.', r, 'Nothing was confirmed as changed. FindA.Sale will retry later.']
    };
    var h = m[code];
    if (!h && /^http_(403|429)$/.test(code)) h = [L + ' refused the request (HTTP ' + code.slice(5) + ').', 'The marketplace is rate-limiting or blocking automatic edits.', 'FindA.Sale stops editing ' + L + ' for a while, then tries again.'];
    if (!h) h = ['Could not finish updating this listing on ' + L + ' (' + (code || 'unknown') + ').', r.slice(0, 200), 'Nothing was confirmed as changed. FindA.Sale will retry later with longer waits (15 minutes, doubling, paused for 24 hours after repeated failures).'];
    return { what: h[0], why: h[1], next: h[2] };
  }
  function compactDiag(d) {
    try {
      if (!d || typeof d !== 'object') return undefined;
      return { note: d.note, url: d.url, title: d.title, dialogs: d.dialogs, textSample: d.textSample,
        buttons: (d.buttons || []).slice(0, 15).map(function (b) { return b.text || b.aria; }),
        inputs: (d.inputs || []).slice(0, 12).map(function (i) { return [i.name || i.id || i.aria || i.ph, i.type, i.vis ? 'vis' : 'hid'].join(':'); }),
        editish: (d.editish || []).slice(0, 8).map(function (e) { return e.text || e.aria; }), requests: (d.requests || []).slice(-6).map(function (r) { return r.url; }) };
    } catch (e) { return undefined; }
  }
  function traceStart(ctx) {
    try {
      var t = T(); if (!t) return;
      var it = ctx.item || {}, S = ctx.scratch || {};
      oldSeen = S.oldPrice != null ? S.oldPrice : null;
      var key = ctx.platform + ':' + it.id, W = wants(ctx), L = (C.LABELS && C.LABELS[ctx.platform]) || ctx.platform;
      if (traceKey !== key || ctx.stepNo === 0) {
        traceKey = key; lastWhat = '';
        t.begin({ platform: L, flow: 'edit', item: { id: it.id, title: it.title }, itemPos: ctx.itemPos || '', ctx: { platformCode: ctx.platform, stepNo: ctx.stepNo, phase: S.phase || 'locate', newPrice: W.price, newQty: W.qty, oldPrice: oldSeen, hasRemoteId: !!it.remoteListingId } });
      }
      var d = describePhase(ctx);
      tStep(d.what, d.why, { phase: S.phase || 'locate', stepNo: ctx.stepNo });
    } catch (e) { /* ignore */ }
  }
  function traceResult(ctx, res) {
    try {
      var t = T(); if (!t || !res) return res;
      var p = ctx.platform, L = (C.LABELS && C.LABELS[p]) || p, S = ctx.scratch || {}, it = ctx.item || {}, W = wants(ctx);
      var np = W.price != null ? W.price : null;
      if (oldSeen != null && res.state !== 'fail' && res.state !== 'blocked') res.scratch = Object.assign({}, res.scratch, { oldPrice: oldSeen });
      var old = oldSeen != null ? oldSeen : (S.oldPrice != null ? S.oldPrice : null);
      var tctx = { platformCode: p, phase: S.phase || 'locate', step: res.step || '', selector: res.selector || '', oldPrice: old, newPrice: np, url: C.safeUrl(location.href) };
      if (res.state === 'done') {
        var rb = res.details && res.details.readBack;
        t.ok('The live listing now shows ' + (rb && rb.price != null ? money(p, C.parsePriceText(rb.price)) : (np != null ? money(p, np) : 'the new value')), { readBack: rb, via: res.details && res.details.via });
        t.end((np != null ? 'Price on ' + L + ' ' + (old != null && old !== np ? 'changed ' + money(p, old) + ' to ' + money(p, np) : 'is ' + money(p, np)) : 'Stock updated on ' + L) + ' (confirmed on the live listing)', Object.assign({}, tctx, { readBack: rb }));
      } else if (res.state === 'goto') {
        t.info('navigate', 'Moving on to ' + C.safeUrl(res.url), { phase: S.phase || 'locate', next: res.scratch && res.scratch.phase });
      } else if (res.state === 'fail' || res.state === 'blocked') {
        var h = humanize(res.code, res.reason, L, it);
        var blk = res.state === 'blocked';
        t.error(res.code || res.state, String(res.reason || '').slice(0, 300), tctx);
        t.problem({
          code: res.code || res.state,
          title: blk ? 'FindA.Sale paused ' + L + ' edits' : (np != null ? 'Could not change the price on ' + L : 'Could not update ' + L),
          what: (np != null ? 'Tried to change the price' + (old != null ? ' from ' + money(p, old) : '') + ' to ' + money(p, np) + '. ' : '') + h.what,
          why: h.why, next: h.next,
          ctx: Object.assign({}, tctx, { reason: String(res.reason || '').slice(0, 300), tried: 'phase ' + (S.phase || 'locate') + (res.step ? ', step ' + res.step : '') + (res.selector ? ', looking for ' + res.selector : ''), details: res.details, engineDiag: compactDiag(res.diag) })
        });
      }
    } catch (e) { /* narration must never change the result */ }
    return res;
  }
  // ---- Poshmark multi-copy driver ----------------------------------------------------------------------------------------------
  // While scratch.copies is set, every per-listing result from poshStep is turned into "next copy" or one final result for the item.
  function poshCopyWrap(ctx, res) {
    var S = ctx.scratch || {};
    if (!S.copies || !S.copies.length || !res) return res;
    if (res.state === 'continue' || res.state === 'goto') return res;     // still working on the current copy
    var cur = S.copies[Number(S.copyIdx) || 0];
    var adv = C.copyAdvance(S, { state: res.state, code: res.code, reason: res.reason });
    var title = (ctx.item && ctx.item.title) || '';
    tLog(res.state === 'done' ? 'info' : 'warn', 'posh_copy_' + res.state, 'Copy ' + ((Number(S.copyIdx) || 0) + 1) + ' of ' + S.copies.length + ' (…' + String(cur).slice(-6) + '): ' + (res.state === 'done' ? 'price/quantity verified on the live listing' : 'not finished (' + (res.code || res.state) + ')'), { id: cur, code: res.code || null });
    if (adv.next === 'goto') {
      // serial and jittered: a pause of 3 to 7 s on the current page, then the step() hook navigates to the next copy's edit page
      return cont(3000 + Math.floor(Math.random() * 4000), Object.assign({}, adv.scratch), { details: { copyProgress: (Number(S.copyIdx) || 0) + 1 } });
    }
    var sum = adv.summary;
    var line = C.copySummaryLine(title, sum);
    tLog(sum.allOk ? 'info' : 'warn', 'posh_copies_summary', line, { summary: sum });
    var fin = Object.assign({}, adv.scratch, { remoteId: sum.canonical, copySummary: sum });
    if (sum.blocked) return { state: 'blocked', code: sum.blocked.code, reason: line.slice(0, 220), step: 'copies', scratch: fin, details: { copies: sum } };
    if (sum.allOk || (sum.edited.length && !sum.failed.length && !sum.untried.length)) {
      return done({ readBack: { copies: sum.edited.length }, via: 'posh_copies', copies: sum, copyLine: line }, fin);
    }
    return fail('copies_partial', line, 'copies', '/vm-rest/posts/<id> per copy', fin, { details: { copies: sum, copyLine: line } });
  }
  // Runs before the platform handler on every Poshmark step: starts remembered copy lists and navigates between copies.
  function poshCopyPre(ctx) {
    var S = ctx.scratch || {}, it = ctx.item || {};
    if (S.copies && S.copies.length && S.copyWait) {
      return go('https://poshmark.com/edit-listing/' + S.remoteId, { copyWait: false, phase: 'api', apiTried: false, formFallback: false });
    }
    if (!S.copies) {
      // A previous run edited several copies of this one item and saved one canonical id; keep every remembered copy in step on later edits.
      var saved = String(S.remoteId || it.remoteListingId || (ctx.idCache && ctx.idCache['POSHMARK:' + it.id]) || '').toLowerCase();
      var mem = ctx.copyIds && ctx.copyIds['POSHMARK:' + it.id];
      if (saved && Array.isArray(mem) && mem.length > 1 && mem.indexOf(saved) !== -1 && S.phase == null) {
        var ordered = [saved].concat(mem.filter(function (x) { return x !== saved; }));
        var cs = C.copyStart(ordered);
        if (cs.copies.length > 1) {
          tLog('info', 'posh_copies_remembered', 'This item has ' + cs.copies.length + ' identical Poshmark copies from an earlier run; editing all of them, one at a time', { copies: cs.copies });
          return go('https://poshmark.com/edit-listing/' + cs.remoteId, Object.assign(cs, { phase: 'api', apiTried: false }));
        }
      }
    }
    return null;
  }
  var HANDLERS = { FACEBOOK: fbStep, POSHMARK: poshStep, MERCARI: mercStep, GRAILED: grStep, CRAIGSLIST: clStep, GUMTREE_AU: gtStep };
  async function step(ctx) {
    try {
      var h = HANDLERS[ctx.platform];
      if (!h) return { state: 'fail', code: 'unsupported_platform', reason: String(ctx.platform) };
      traceStart(ctx);
      if (passwordSurface() && !(ctx.platform === 'CRAIGSLIST' && /\/login\/home/.test(location.pathname))) return traceResult(ctx, blocked('login_required', 'A password field is showing: the marketplace session is signed out', 'guard'));
      var bl = pageBlock();
      if (bl && bl.code !== 'login_required') return traceResult(ctx, blocked(bl.code, 'Marketplace page state: ' + bl.code, 'guard'));
      if (bl && bl.code === 'login_required') return traceResult(ctx, blocked('login_required', 'Redirected to a sign-in page', 'guard'));
      if (ctx.platform === 'POSHMARK') {
        var pre = poshCopyPre(ctx);
        if (pre) return traceResult(ctx, pre);
      }
      var res = await h(ctx);
      if (ctx.platform === 'POSHMARK') res = poshCopyWrap(ctx, res);
      return traceResult(ctx, res);
    } catch (e) {
      return traceResult(ctx, { state: 'fail', code: 'engine_exception', reason: ((e && e.message) || String(e)).slice(0, 200), step: (ctx.scratch && ctx.scratch.phase) || '', diag: (function () { try { return snapshot('exception'); } catch (e2) { return null; } })() });
    }
  }
  self.FAS_EDIT_ENGINE = { step: step, snapshot: snapshot, version: '1.0.7', _test: { poshCopyWrap: poshCopyWrap, poshCopyPre: poshCopyPre, clStep: clStep, clPageSig: clPageSig, poshSetPriceViaModal: poshSetPriceViaModal, poshPriceInput: poshPriceInput } };
})();
