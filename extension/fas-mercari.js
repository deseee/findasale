/* FindA.Sale — content script on mercari.com "Sell" flow.
 * CODE-ONLY, UNTESTED (2026-08-18 dispatch): no Mercari seller account exists to verify this
 * session -- every selector below is a best-effort guess from public research, never a live-
 * confirmed DOM anchor. Same hard rules as fas-poshmark.js / fas-selectors.js (ADR-084):
 *   1. NEVER select by obfuscated CSS class -- label text / aria-label / role / structural
 *      anchors only.
 *   2. NEVER auto-click the final "List this item" / publish action -- fills and stops, always.
 *   3. HARD-STOP on any CAPTCHA/identity-verification/unrecognized interstitial -- hand off to
 *      the human, never attempt to solve or bypass.
 *   4. Every selector lookup is null-checked; a missing field logs console.warn and is skipped.
 * Every field mapping is commented "UNVERIFIED -- confirm against live DOM".
 *
 * PHOTO-FIRST, non-negotiable ordering (per Mercari's own help docs): Mercari uploads photos
 * BEFORE other fields, and its own recognition step may auto-populate category/brand/title
 * immediately after upload. This script uploads photos FIRST, waits briefly for Mercari's own
 * auto-fill to settle, THEN explicitly overwrites every field with FindA.Sale's own values.
 * Filling fields before photos would race Mercari's own JS and risks losing values it
 * silently overwrites back.
 *
 * Shipping weight is part of the CORE listing flow on Mercari (not a separate step) and is
 * typically required before submission -- mapped from FindA.Sale's item weight data when present;
 * when absent, this is left for the organizer with a loud overlay warning (never fabricated).
 *
 * Smart Pricing sits next to the price field on the same step and is intentionally NEVER
 * touched/enabled -- only the flat price field is filled, leaving Smart Pricing at Mercari's own
 * default (off).
 */
(function () {
  const SELL_URL_HINT = 'https://www.mercari.com/sell/'; // UNVERIFIED -- best-effort guess, not live-confirmed

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  async function humanPause(minMs, maxMs) { await sleep(minMs + Math.random() * (maxMs - minMs)); }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function bodyText() { return (document.body && document.body.innerText) || ''; }
  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return Array.from(document.querySelectorAll(sel)); }
  function escapeHtml(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function looksLikeInterstitial() {
    if (q('iframe[src*="captcha" i]') || q('iframe[title*="captcha" i]') || q('iframe[src*="hcaptcha" i]') || q('iframe[src*="recaptcha" i]')) return true;
    const lower = bodyText().toLowerCase();
    const signals = [
      'verify you are human', "verify you're human", 'confirm you are not a robot',
      'unusual activity', 'suspicious activity', "we need to verify it's you",
      'verify your identity', 'security check', 'complete the challenge',
      'enter the code we sent', 'two-factor', 'one-time code', 'checkpoint'
    ];
    return signals.some((s) => lower.indexOf(s) !== -1);
  }

  let bar;
  function ensureBar() {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'fas-mercari-bar';
      bar.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:360px;' +
        'background:#1f2a24;color:#f3f5f2;border:1px solid #3c8c5a;border-radius:12px;padding:14px 16px;' +
        'font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.4)';
      document.documentElement.appendChild(bar);
    }
    return bar;
  }
  function overlay(html) { ensureBar().innerHTML = html; }
  function overlayWarn(text) { overlay('<b>FindA.Sale</b><div style="margin-top:6px;font-size:12px;color:#ffcf7a">' + text + '</div>'); }
  function button(id, label, primary) {
    return '<button id="' + id + '" style="margin-top:10px;margin-right:8px;padding:7px 12px;border-radius:8px;border:none;cursor:pointer;' +
      'font-weight:600;font-size:13px;background:' + (primary ? '#3c8c5a' : '#3a4842') + ';color:#fff">' + label + '</button>';
  }
  function closeBtnHandler() { const c = document.getElementById('fas-merc-close'); if (c) c.onclick = () => bar && bar.remove(); }

  function fieldByLabel(labelText) {
    const want = norm(labelText);
    const labels = qa('label');
    for (const lab of labels) {
      const txt = norm(lab.getAttribute('aria-label') || lab.textContent);
      if (txt === want || txt.indexOf(want) !== -1) {
        const forId = lab.getAttribute('for');
        if (forId) { const byId = document.getElementById(forId); if (byId) return byId; }
        const inner = lab.querySelector('input, textarea, select');
        if (inner) return inner;
      }
    }
    return document.querySelector('input[aria-label="' + labelText + '"], textarea[aria-label="' + labelText + '"], input[placeholder="' + labelText + '"]');
  }
  function openerByLabel(labelText) {
    const want = norm(labelText);
    const direct = document.querySelector('[aria-label="' + labelText + '"]');
    if (direct) return direct;
    const candidates = qa('[role="combobox"], [role="button"], button, select, div[tabindex]');
    const hit = candidates.find((c) => norm(c.getAttribute('aria-label') || c.textContent).indexOf(want) !== -1 && norm(c.textContent).length < 80);
    if (hit) return hit;
    const labels = qa('label');
    for (const lab of labels) {
      if (norm(lab.textContent).indexOf(want) !== -1) {
        const forId = lab.getAttribute('for');
        if (forId) { const byId = document.getElementById(forId); if (byId) return byId; }
        const inner = lab.querySelector('button, [role="button"], select, [role="combobox"], div[tabindex]');
        if (inner) return inner;
        return lab;
      }
    }
    return null;
  }
  function optionElByText(text) {
    const want = norm(text);
    const opts = qa('[role="option"], li[role="option"], [role="menuitem"], [role="menuitemradio"], li');
    return opts.find((o) => norm(o.textContent) === want) || opts.find((o) => norm(o.textContent).indexOf(want) !== -1 && norm(o.textContent).length < 60) || null;
  }
  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function tryFill(fieldLabel, value, fillFn) {
    if (value === undefined || value === null || value === '') return false;
    try {
      const ok = await fillFn(value);
      if (!ok) console.warn('[FAS Mercari] Field "' + fieldLabel + '" -- selector not found, skipped (UNVERIFIED -- confirm against live DOM).');
      return ok;
    } catch (e) {
      console.warn('[FAS Mercari] Field "' + fieldLabel + '" -- error while filling, skipped:', e && e.message);
      return false;
    }
  }

  async function fillText(labelText, value) {
    const el = fieldByLabel(labelText);
    if (!el) return false;
    el.focus();
    setNativeValue(el, String(value));
    await sleep(150);
    return true;
  }

  // Category: 2+ level nested picker. Same fuzzy best-effort click-through as fas-poshmark.js's
  // pickCategory -- FindA.Sale's item.category is a single flat string, not Mercari's real
  // taxonomy, so this clicks the closest text match at each level and stops rather than guessing
  // further once a level has no confident match.
  async function pickCategory(categoryText) {
    if (!categoryText) return false;
    const opener = openerByLabel('Category');
    if (!opener) return false;
    opener.click();
    await sleep(400);
    let pickedAny = false;
    for (let level = 0; level < 3; level++) {
      await sleep(250);
      const opt = optionElByText(categoryText);
      if (!opt) break;
      opt.click();
      pickedAny = true;
      await sleep(300);
    }
    if (!pickedAny) console.warn('[FAS Mercari] Category "' + categoryText + '" -- no level matched in the picker (UNVERIFIED taxonomy) -- left for the organizer to choose.');
    return pickedAny;
  }

  // Brand: category-aware autocomplete -- Mercari's own brand list changes based on the selected
  // category, so this must run AFTER pickCategory (enforced by call order in fillListing below).
  async function fillBrand(labelText, value) {
    const el = fieldByLabel(labelText);
    if (!el) return false;
    el.focus();
    setNativeValue(el, String(value));
    await sleep(700); // UNVERIFIED -- suggestion-list settle time, best-effort guess
    const match = optionElByText(value);
    if (match) { match.click(); await sleep(200); return true; }
    console.warn('[FAS Mercari] Brand "' + value + '" had no matching suggestion (UNVERIFIED, category-dependent list) -- left unset.');
    return false;
  }

  async function fillSelectLike(labelText, value) {
    const native = fieldByLabel(labelText);
    if (native && native.tagName === 'SELECT') {
      const opt = Array.from(native.options).find((o) => norm(o.textContent) === norm(value) || norm(o.textContent).indexOf(norm(value)) !== -1);
      if (!opt) return false;
      native.value = opt.value;
      native.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    const opener = openerByLabel(labelText);
    if (!opener) return false;
    opener.click();
    await sleep(350);
    const opt = optionElByText(value);
    if (!opt) return false;
    opt.click();
    await sleep(200);
    return true;
  }

  const CONDITION_LABELS = ['New', 'Like New', 'Good', 'Fair', 'Poor'];
  // Mercari's own confirmed 5-tier wording (Mercari help center, not third-party-sourced).
  function mapMercariCondition(condition) {
    const c = norm(condition);
    if (!c) return 'Good';
    if (/like new|excellent/.test(c)) return 'Like New';
    if (/^new$|brand new|nwt|new,/.test(c)) return 'New';
    if (/fair/.test(c)) return 'Fair';
    if (/poor|worn|damaged|for parts/.test(c)) return 'Poor';
    return 'Good';
  }

  // Weight: FindA.Sale carries packageWeightOz / aiPackageWeightOz on the queue item (see
  // popup.js startQueue / background.js buildRenewalQueueItem). Mercari's weight-class field is
  // UNVERIFIED (label text, tier boundaries, and unit are all guesses) -- this fills the closest
  // available field by label match and logs a loud warning either way, since even a "successful"
  // fill here is an unconfirmed guess.
  async function fillWeight(item) {
    const ounces = item.packageWeightOz != null ? item.packageWeightOz : item.aiPackageWeightOz;
    if (ounces == null) {
      overlayWarn('Mercari requires a shipping weight before you can publish, and this item has no weight on FindA.Sale -- please fill that field in yourself before publishing.');
      return false;
    }
    const el = fieldByLabel('Weight') || fieldByLabel('Shipping weight') || openerByLabel('Weight');
    if (!el) {
      overlayWarn('Mercari requires a shipping weight before you can publish -- FindA.Sale couldn\'t find that field automatically (UNVERIFIED selector). Please fill it in yourself: ~' + (Math.round((ounces / 16) * 100) / 100) + ' lb.');
      return false;
    }
    if (el.tagName === 'SELECT') {
      // UNVERIFIED tier boundaries -- best-effort nearest-match against option text containing a
      // number close to the item's weight in ounces or pounds.
      const lbs = ounces / 16;
      const opt = Array.from(el.options).find((o) => norm(o.textContent).indexOf(String(Math.ceil(lbs))) !== -1);
      if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); return true; }
      overlayWarn('Mercari requires a shipping weight -- FindA.Sale found the weight field but couldn\'t confidently match a tier (UNVERIFIED taxonomy). Please double-check it before publishing: ~' + (Math.round(lbs * 100) / 100) + ' lb.');
      return false;
    }
    setNativeValue(el, String(Math.round((ounces / 16) * 100) / 100));
    overlayWarn('Filled an UNVERIFIED best-guess shipping weight (~' + (Math.round((ounces / 16) * 100) / 100) + ' lb) -- please confirm it before publishing.');
    return true;
  }

  function photoInput() {
    return document.querySelector('input[type="file"][accept*="image"]') || document.querySelector('input[type="file"]');
  }
  async function injectPhotos(urls) {
    if (!urls || !urls.length) return false;
    let resp;
    try { resp = await chrome.runtime.sendMessage({ type: 'fetchPhotos', urls: urls.slice(0, 12) }); } catch (e) { return false; }
    if (!resp || !resp.ok || !resp.dataUrls || !resp.dataUrls.length) return false;
    const input = photoInput();
    if (!input) return false;
    const dt = new DataTransfer();
    resp.dataUrls.forEach((durl, i) => {
      const parts = durl.split(',');
      const meta = parts[0], b64 = parts[1];
      const type = (meta.match(/data:(.*?);/) || [])[1] || 'image/jpeg';
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
      dt.items.add(new File([bytes], 'photo-' + (i + 1) + '.jpg', { type }));
    });
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function looksLikeSellForm() {
    return !!(fieldByLabel('Title') || photoInput());
  }

  function showReviewOverlay(item, index, total, photosOk) {
    const more = (index + 1) < total;
    overlay('<b>FindA.Sale</b><div style="margin-top:6px">Filled <b>' + escapeHtml(item.title) + '</b> as best we could.</div>' +
      '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Review every field (category/brand/weight are UNVERIFIED guesses), confirm <b>Smart Pricing stayed off</b> if you don\'t want it, then click Mercari\'s own <b>List this item</b> yourself -- this extension never publishes for you.</div>' +
      (!photosOk ? '<div style="color:#ffcf7a;margin-top:6px;font-size:12px">Photos may not have attached -- add them on this screen.</div>' : '') +
      button('fas-merc-next', more ? 'I posted — next item &#9654;' : 'I posted — done', true) +
      button('fas-merc-close', 'Close', false) +
      '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');
    const next = document.getElementById('fas-merc-next');
    if (next) next.onclick = async () => {
      try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: item.id, remoteListingId: null, platform: 'MERCARI' }); } catch (e) {}
      try { await chrome.runtime.sendMessage({ type: 'advanceMercariQueue' }); } catch (e) {}
      if (more) { location.href = SELL_URL_HINT; } else { bar && bar.remove(); }
    };
    closeBtnHandler();
  }

  // Photo-first: upload photos, wait for Mercari's own recognition step to settle (or a fixed
  // timeout), THEN overwrite every field with FindA.Sale's own values. Never fills fields before
  // photos -- that races Mercari's own auto-fill JS (see file header).
  async function fillListing(item) {
    overlay('<b>FindA.Sale</b> - uploading photos first (Mercari auto-fills after photos, so we wait before touching the rest)...');
    const photosOk = await injectPhotos(item.photoUrls);
    // UNVERIFIED settle time: no live session to measure how long Mercari's own recognition step
    // takes. A fixed generous wait, not a DOM-based "settled" detector (none of Mercari's own
    // loading-state markup has been observed).
    await sleep(2500);

    overlay('<b>FindA.Sale</b> - filling the rest of the listing (overwriting anything Mercari auto-filled)...');
    await tryFill('Title', item.title, (v) => fillText('Title', v));
    await tryFill('Description', item.description, (v) => fillText('Description', v));
    // Category BEFORE brand -- Mercari's brand list is category-aware (see fillBrand comment).
    await tryFill('Category', item.category, (v) => pickCategory(v));
    // 2026-08-18: brand/size/color now exist on Item and flow through getExtensionItems ->
    // popup.js's queue map. tryFill's own guard still skips silently on unset items;
    // category-type gating (apparel-only for size/color) is left to Mercari's own form,
    // never assumed here.
    await tryFill('Brand', item.brand, (v) => fillBrand('Brand', v));
    await tryFill('Size', item.size, (v) => fillSelectLike('Size', v));
    await tryFill('Color', item.color, (v) => fillSelectLike('Color', v));
    const conditionLabel = mapMercariCondition(item.condition);
    await tryFill('Condition', conditionLabel, (v) => fillSelectLike('Condition', v));
    if (item.price != null && isFinite(Number(item.price))) {
      const priceVal = Math.max(1, Math.round(Number(item.price)));
      if (priceVal > 2000) console.warn('[FAS Mercari] Price $' + priceVal + ' exceeds Mercari\'s standard $2,000 cap -- may need an authenticate-eligible designer category. Filling anyway; Mercari\'s own form is the real gate.');
      // Smart Pricing toggle sits next to Price -- deliberately never touched here.
      await tryFill('Price', priceVal, (v) => fillText('Price', String(v)));
    }
    await fillWeight(item);
    return photosOk;
  }

  async function run(item, index, total) {
    if (looksLikeInterstitial()) {
      overlayWarn('Mercari is showing a verification/security screen. FindA.Sale never attempts to solve this -- please complete it yourself, then reopen the extension to continue.' + button('fas-merc-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    if (!looksLikeSellForm() && !looksLikeInterstitial()) {
      overlayWarn('This doesn\'t look like a fillable Mercari Sell form yet (no Title field or photo dropzone found). If you\'re on the right page, this is an UNVERIFIED-selector miss -- please fill it in yourself.' + button('fas-merc-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    const photosOk = await fillListing(item);
    if (looksLikeInterstitial()) {
      overlayWarn('Mercari is showing a verification/security screen partway through filling this listing. Please complete it yourself, then finish this listing manually -- nothing further was auto-filled.' + button('fas-merc-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    showReviewOverlay(item, index, total, photosOk);
  }

  async function start() {
    await sleep(600);
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getMercariQueueItem' }); } catch (e) { return; }
    if (!queued || !queued.ok || !queued.item) return; // nothing queued -- stay silent
    try {
      await run(queued.item, queued.index, queued.total);
    } catch (e) {
      overlayWarn('Something went wrong filling this listing (' + escapeHtml((e && e.message) || 'unknown error') + '). Nothing was published -- complete this listing yourself, or reopen the extension to try again.' + button('fas-merc-close', 'Close', false));
      closeBtnHandler();
    }
  }

  start();
})();
