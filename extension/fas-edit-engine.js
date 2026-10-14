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
    setNative(el, String(value));
    await sleep(150);
    if (String(el.value).trim() === String(value)) return true;
    try { el.select && el.select(); } catch (e) { /* ignore */ }
    setNative(el, String(value));
    await sleep(250);
    return C.parsePriceText(el.value) === C.parsePriceText(value);
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
  async function poshStep(ctx) {
    var S = ctx.scratch || {}, W = wants(ctx), it = ctx.item;
    var id = S.remoteId || it.remoteListingId || (ctx.idCache && ctx.idCache['POSHMARK:' + it.id]) || '';
    var path = location.pathname;
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
        var pick = C.pickUnique(poshClosetCards(), it.title, 'equals');
        if (pick.match) { found = pick.match.key; break; }
        if (pick.reason === 'ambiguous') return fail('ambiguous_title', pick.count + ' closet listings share this title', 'locate', '.tile-grid-redesign__title', {});
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(1100);
      }
      if (!found) return fail('listing_not_found_in_closet', 'No closet card with this exact title', 'locate', '.tile-grid-redesign__title / a[href*="/listing/"]', {});
      return go('https://poshmark.com/edit-listing/' + found, { remoteId: found, phase: 'api', discovered: true });
    }
    if (!/^\/edit-listing\//.test(path) && !S.apiTried) return go('https://poshmark.com/edit-listing/' + id, { remoteId: id, phase: 'api' });

    // ---- API apply + verify (one call; several awaits; no navigation expected) ----
    if (S.phase === 'posh_uiverify') return poshUiVerify(id, W, S);
    if (S.phase === 'posh_verify_only') return poshVerify(id, W, it, S, null);
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
      var diagKeys = { diagKeys: Object.keys(before || {}).slice(0, 80), invKeys: before && before.inventory ? Object.keys(before.inventory) : [], sizeRows: (before && before.inventory && before.inventory.size_quantities || []).length };
      if (!needPrice && !needQty) {
        return Object.assign(done({ readBack: { price: C.poshmarkPriceVal(before), quantity: curQty }, via: 'api_get_already_correct' }, { apiTried: true, remoteId: id }), { diag: { note: 'posh_already_correct', keys: diagKeys } });
      }
      var built = C.buildPoshmarkUpdate(before, needPrice ? W.price : null, needQty ? W.qty : null);
      if (built.error) return fail('payload_build_failed', built.error, 'api', 'post payload', { apiTried: true, remoteId: id });
      await sleep(200 + Math.floor(Math.random() * 400));
      var res = await fetch('/vm-rest/posts/' + id, { method: 'POST', credentials: 'same-origin', headers: poshHeaders(csrf, true), body: JSON.stringify(built.body), referrer: location.origin + '/edit-listing/' + id });
      var rt = await res.text(); var rj = null; try { rj = JSON.parse(rt); } catch (e) { /* maybe empty */ }
      var errP = rj && C.isPoshmarkErrorPayload(rj);
      if (res.status === 403 || res.status === 429) return blocked('http_' + res.status, 'POST post returned ' + res.status, 'api');
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
    return fail('verify_mismatch', 'After POST the post shows price ' + C.poshmarkPriceVal(after) + ' qty ' + qNow + ', wanted ' + (W.price != null ? W.price : '-') + ' / ' + (W.qty != null ? W.qty : '-'), 'verify', 'price_amount.val / inventory.size_quantities[].quantity_available', scratch);
  }
  // Form fallback. verified-in-DOM 2026-10-13: price = #listing-price-modal-listing-price-input (aria "Listing Price") /
  // input[data-vv-name="listingPrice"]; quantity = "Single Item" (data-et-name=one) / "Multi Item" (data-et-name=multiple) buttons
  // plus the size "Done" (data-et-name=apply); save = "Update" (data-et-name=update). Verified by reload (poshUiVerify) or API re-GET.
  function poshPriceInput() {
    return q('#listing-price-modal-listing-price-input') || q('input[data-vv-name="listingPrice"]') || q('input[aria-label="Listing Price"]') ||
      findInput(/\blisting price\b/i, /original/i);
  }
  async function poshFormFallback(ctx, id, W, why, diagKeys) {
    var sc = { apiTried: true, remoteId: id, formFallback: true };
    await waitFor(function () { return q('[data-et-name="update"]') || poshPriceInput(); }, 12000);    // Vue SPA: inputs render after ~3s
    var price = poshPriceInput();
    if (!price) {
      // The price field sits behind a trigger input (placeholder "*Required"): open it once.
      var trig = qa('input.form__text[placeholder="*Required"]').filter(visible)[0];
      if (trig) { await realClick(trig); await sleep(900); price = poshPriceInput(); }
    }
    if (!price) return fail('form_fallback_price_not_found', 'Poshmark refused the API read/write (' + why + ') and no Listing Price input was found', 'form_fallback', '#listing-price-modal-listing-price-input | input[data-vv-name="listingPrice"]', sc, { diag: snapshot('posh_form_fallback') });
    if (W.price != null && !C.pricesMatch('POSHMARK', price.value, W.price)) {
      var ok = await writeField(price, C.formatPrice('POSHMARK', W.price));
      if (!ok) return fail('price_value_did_not_stick', 'Listing Price input kept "' + price.value + '"', 'form_fallback', '#listing-price-modal-listing-price-input', sc);
    }
    var modalDone = findButton(/^(done|apply|save|ok)$/, qa('[role="dialog"], .modal, [class*="modal" i]').filter(visible).pop());
    if (modalDone) { await realClick(modalDone); await sleep(600); }
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
    return cont(3500, Object.assign({}, sc, { phase: 'posh_verify_only' }), { diag: { note: 'posh_form_fallback', why: why, keys: diagKeys, snap: snapshot('posh_form') } });
  }
  async function poshUiVerify(id, W, S) {
    var price = await waitFor(poshPriceInput, 12000);
    if (!price) return fail('verify_price_input_not_found', 'Reloaded edit page has no Listing Price input to read back', 'verify', '#listing-price-modal-listing-price-input', S);
    if (W.price == null || C.pricesMatch('POSHMARK', price.value, W.price)) return done({ readBack: { price: price.value }, via: 'reloaded_edit_form' }, S);
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
      if (W.price != null) {
        if (!C.pricesMatch('MERCARI', price.value, W.price)) {
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
          if (fv != null && fv > C.wholeDollars(W.price)) await writeField(floor, String(Math.max(1, Math.floor(C.wholeDollars(W.price) * 0.9))));
        }
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
        if (shown != null && C.pricesMatch('CRAIGSLIST', shown, W.price)) return done({ readBack: { price: shown }, postingId: S.postingId });
        var vt = bumpTries(ctx, 'verifyTries', 2);
        if (!vt.over) return go(C.craigslistPageUrl(page), { verifyTries: vt.n }, { delayAfterMs: 4000 });
        return fail('verify_mismatch', 'Dashboard row shows "' + String(mine.titleRaw).replace(/\s+/g, ' ').trim().slice(-30) + '", wanted $' + C.formatPrice('CRAIGSLIST', W.price), 'verify', 'td.title a "- $price" suffix', {});
      }
      var cands = rows.filter(function (r) { return r.active; });
      var chosen = null;
      if (it.remoteListingId) chosen = cands.filter(function (r) { return r.postingId === it.remoteListingId; })[0] || null;
      if (!chosen) {
        var pick = C.pickUnique(cands.map(function (r) { return { key: r.postingId, texts: [r.titleRaw], row: r }; }), it.title, 'equals');
        if (pick.reason === 'ambiguous') return fail('ambiguous_title', pick.count + ' active postings share this title', 'locate', 'td.title a', {});
        if (pick.match) chosen = pick.match.row;
      }
      if (!chosen) {
        if (rows.length >= 50 && page < 30) return go(C.craigslistPageUrl(page + 1), { page: page + 1 });
        return fail('listing_not_found_on_dashboard', 'No active posting with this title/id on ' + page + ' dashboard page(s)', 'locate', 'tr.posting-row td.title a', {});
      }
      var btn = qa('input[type="submit"], input.managebtn, button', chosen.tr).filter(function (b) { return /^edit$/.test(btnLabel(b)); })[0];
      if (!btn) return fail('edit_button_not_found', 'Row for posting ' + chosen.postingId + ' has no "edit" submit control', 'locate', 'tr.posting-row input.managebtn[value=edit]', {}, { diag: snapshot('cl_row') });
      deferClick(btn);
      return cont(3000, { phase: 'edit', postingId: chosen.postingId, page: page, hops: 0, priceSet: false }, { diag: snapshot('cl_dashboard') });
    }
    if (phase === 'edit') {
      var bl = pageBlock();
      if (bl) return blocked(bl.code, 'Craigslist edit flow: ' + bl.code, 'edit');
      var vs = clVerificationSurface();
      if (vs) return blocked('captcha_or_verification', 'Craigslist asks for ' + vs + ' during the edit flow (stopped, not looping)', 'edit');
      var hops = (S.hops || 0) + 1;
      if (hops > 12) return fail('edit_flow_stuck', 'More than 12 pages in the edit flow without finishing', 'edit', 'button.continue', { hops: hops });
      var saved = /(your changes (have been )?(saved|made)|posting has been (updated|saved|changed)|your posting (has been|was) (updated|saved))/.test(textOf(document.body).slice(0, 3000));
      if (saved || (onDash && S.priceSet)) return go(C.craigslistPageUrl(S.page || 1), { phase: 'verify', verifyTries: 0 }, { details: { requests: recentRequests() } });
      var price = q('input[name="price"]') || q('#price') || findInput(/(^|\|\s*)(asking )?price(\s*\||$)/i, /ship|original/i);   // name unverified by inspection: documented input[name=price] first
      if (price && visible(price)) {
        var diag = S.formSnap ? undefined : snapshot('cl_edit_form');
        if (W.price != null && !C.pricesMatch('CRAIGSLIST', price.value, W.price)) {
          var ok = await writeField(price, C.formatPrice('CRAIGSLIST', W.price));
          if (!ok && !C.pricesMatch('CRAIGSLIST', price.value, W.price)) return fail('price_value_did_not_stick', 'input[name="price"] kept "' + price.value + '"', 'edit', 'input[name="price"]', { hops: hops });
        }
        var cont1 = q('button.continue') || findButton(/^continue$/) || qa('input[type="submit"]').filter(function (b) { return /continue/i.test(b.value || ''); })[0];
        if (!cont1) return fail('continue_button_not_found', 'No Continue button after setting the price', 'edit', 'button.continue | input[type=submit][value=Continue]', { hops: hops });
        deferClick(cont1);
        return cont(3000, { hops: hops, priceSet: true, formSnap: true }, { diag: diag });
      }
      var editThis = qa('input[type="submit"], button, a').filter(function (b) { return visible(b) && /^edit this posting$/.test(btnLabel(b)); })[0];
      if (editThis && !S.priceSet) { deferClick(editThis); return cont(3000, { hops: hops }, { diag: S.manageSnap ? undefined : snapshot('cl_manage_page') }); }
      var imgDone = q('button.done') || findButton(/^done with images$/);
      if (imgDone) { deferClick(imgDone); return cont(3000, { hops: hops }); }
      var anyCont = q('button.continue') || findButton(/^(continue|publish|done|ok)$/) || qa('input[type="submit"]').filter(function (b) { return /^(continue|publish|done)/i.test(b.value || ''); })[0];
      if (anyCont && (S.priceSet || hops > 1)) { deferClick(anyCont); return cont(3000, { hops: hops }); }
      if (!S.priceSet && hops >= 4) return fail('price_field_not_found', 'No input[name="price"] reached in the Craigslist edit flow (category may have no price field)', 'edit', 'input[name="price"]', { hops: hops });
      return cont(1500, { hops: hops });
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
  var HANDLERS = { FACEBOOK: fbStep, POSHMARK: poshStep, MERCARI: mercStep, GRAILED: grStep, CRAIGSLIST: clStep, GUMTREE_AU: gtStep };
  async function step(ctx) {
    try {
      var h = HANDLERS[ctx.platform];
      if (!h) return { state: 'fail', code: 'unsupported_platform', reason: String(ctx.platform) };
      if (passwordSurface() && !(ctx.platform === 'CRAIGSLIST' && /\/login\/home/.test(location.pathname))) return blocked('login_required', 'A password field is showing: the marketplace session is signed out', 'guard');
      var bl = pageBlock();
      if (bl && bl.code !== 'login_required') return blocked(bl.code, 'Marketplace page state: ' + bl.code, 'guard');
      if (bl && bl.code === 'login_required') return blocked('login_required', 'Redirected to a sign-in page', 'guard');
      var res = await h(ctx);
      return res;
    } catch (e) {
      return { state: 'fail', code: 'engine_exception', reason: ((e && e.message) || String(e)).slice(0, 200), step: (ctx.scratch && ctx.scratch.phase) || '', diag: (function () { try { return snapshot('exception'); } catch (e2) { return null; } })() };
    }
  }
  self.FAS_EDIT_ENGINE = { step: step, snapshot: snapshot, version: '1.0.6' };
})();
