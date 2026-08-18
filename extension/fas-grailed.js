/* FindA.Sale — content script on grailed.com listing flow.
 * CODE-ONLY, UNTESTED (2026-08-18 dispatch): no Grailed seller account exists to verify this
 * session -- every selector below is a best-effort guess, never live-confirmed. Same hard rules
 * as fas-poshmark.js / fas-mercari.js / fas-vinted.js / fas-selectors.js (ADR-084):
 *   1. NEVER select by obfuscated CSS class -- label text / aria-label / role / structural
 *      anchors only.
 *   2. NEVER auto-click the final "List item" / publish action -- fills and stops, always.
 *   3. HARD-STOP on any CAPTCHA/identity-verification/unrecognized interstitial.
 *   4. Every selector lookup is null-checked; a missing field logs console.warn and is skipped.
 *
 * *** UNVERIFIED -- HIGH PRIORITY to confirm live: the condition-wording mapping in this file
 * (mapGrailedCondition below) is the LOWEST-confidence field in this entire dispatch. The
 * commonly-cited wording "New/Never Worn, Gently Used, Used, Very Worn" was NOT confirmed against
 * any primary Grailed source this session -- it's the best available public reference, nothing
 * more. Confirm this against a real logged-in Grailed listing form before trusting it at scale. ***
 *
 * Designer/Brand is a CONSTRAINED autocomplete from a curated list, not free text -- if nothing
 * matches, Grailed's own flow requires filing a support request to add a new designer, which this
 * extension cannot do. Per this dispatch's explicit instruction, a designer miss SKIPS the whole
 * listing (does not proceed to fill/show the rest of the form) rather than guessing or leaving it
 * unset, since an unmatched designer blocks Grailed's own submission anyway.
 *
 * Measurements (chest/length/waist/inseam etc., category-dependent) are a first-class field group
 * on Grailed distinct from "size" -- FindA.Sale's Item model captures neither size nor
 * measurements today (confirmed against schema.prisma). This file NEVER fabricates measurement
 * values; it leaves those fields untouched and tells the organizer, via the overlay, that Grailed
 * listings perform better with measurements added and they should add them manually.
 */
(function () {
  const LISTING_URL_HINT = 'https://www.grailed.com/sell'; // UNVERIFIED -- best-effort guess, not live-confirmed

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
      bar.id = 'fas-grailed-bar';
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
  function closeBtnHandler() { const c = document.getElementById('fas-gr-close'); if (c) c.onclick = () => bar && bar.remove(); }

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
      if (!ok) console.warn('[FAS Grailed] Field "' + fieldLabel + '" -- selector not found, skipped (UNVERIFIED -- confirm against live DOM).');
      return ok;
    } catch (e) {
      console.warn('[FAS Grailed] Field "' + fieldLabel + '" -- error while filling, skipped:', e && e.message);
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

  // Designer/Brand: CONSTRAINED autocomplete, not free text. Returns 'matched' | 'no_match' |
  // 'field_missing' so the caller can decide whether to abort the whole listing (see
  // run()/fillListing() below) -- a designer miss is a hard stop for this platform specifically,
  // unlike the soft-skip pattern used for optional fields on the other three new scripts.
  async function fillDesigner(value) {
    const el = fieldByLabel('Designer') || fieldByLabel('Brand');
    if (!el) return 'field_missing';
    el.focus();
    setNativeValue(el, String(value));
    await sleep(700); // UNVERIFIED -- suggestion-list settle time, best-effort guess
    const match = optionElByText(value);
    if (match) { match.click(); await sleep(200); return 'matched'; }
    return 'no_match';
  }

  // Category: "Market" tier (Grails / Hype / Sartorial / Core) + menswear/womenswear split, then
  // item-type category. FindA.Sale's item.category is a flat string with no reliable mapping to
  // Grailed's Market tiers -- defaults to "Core" (most neutral) per this dispatch's explicit
  // instruction, and logs the default so it's visible for review. The menswear/womenswear split
  // has NO source data on FindA.Sale's Item model at all (confirmed against schema.prisma) -- left
  // entirely for the organizer, never guessed.
  async function pickMarketTier() {
    const opener = openerByLabel('Market');
    if (!opener) { console.warn('[FAS Grailed] Market tier field not found (UNVERIFIED selector) -- left for the organizer.'); return false; }
    opener.click();
    await sleep(350);
    const opt = optionElByText('Core');
    if (!opt) { console.warn('[FAS Grailed] Defaulted Market tier to "Core" but couldn\'t find that option in the picker (UNVERIFIED) -- left for the organizer.'); return false; }
    opt.click();
    await sleep(200);
    console.warn('[FAS Grailed] Market tier defaulted to "Core" (no clean mapping from FindA.Sale\'s category data) -- review and change if a different tier fits better.');
    return true;
  }
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
    if (!pickedAny) console.warn('[FAS Grailed] Category "' + categoryText + '" -- no level matched in the picker (UNVERIFIED taxonomy) -- left for the organizer to choose.');
    return pickedAny;
  }

  // Size: exact input type unconfirmed -- tries a labeled select-like control first, falls back
  // to a plain text field. Logs a warning rather than crashing if neither is found.
  async function fillSize(value) {
    const native = fieldByLabel('Size');
    if (native && native.tagName === 'SELECT') {
      const opt = Array.from(native.options).find((o) => norm(o.textContent) === norm(value) || norm(o.textContent).indexOf(norm(value)) !== -1);
      if (opt) { native.value = opt.value; native.dispatchEvent(new Event('change', { bubbles: true })); return true; }
    }
    if (native) { setNativeValue(native, String(value)); return true; }
    const opener = openerByLabel('Size');
    if (opener) {
      opener.click();
      await sleep(350);
      const opt = optionElByText(value);
      if (opt) { opt.click(); await sleep(200); return true; }
    }
    return false;
  }

  // *** UNVERIFIED -- HIGH PRIORITY to confirm live (see file header). Commonly-cited wording,
  // not confirmed against any primary Grailed source. ***
  function mapGrailedCondition(condition) {
    const c = norm(condition);
    if (!c) return 'Gently Used';
    if (/^new$|brand new|nwt|never worn|new,/.test(c)) return 'New/Never Worn';
    if (/very worn|poor|heavily used|damaged/.test(c)) return 'Very Worn';
    if (/used|fair/.test(c) && !/gently/.test(c)) return 'Used';
    return 'Gently Used';
  }

  function photoInput() {
    return document.querySelector('input[type="file"][accept*="image"]') || document.querySelector('input[type="file"]');
  }
  async function injectPhotos(urls) {
    if (!urls || !urls.length) return false;
    let resp;
    try { resp = await chrome.runtime.sendMessage({ type: 'fetchPhotos', urls: urls.slice(0, 16) }); } catch (e) { return false; }
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

  function looksLikeListingForm() {
    return !!(fieldByLabel('Title') || fieldByLabel('Designer') || fieldByLabel('Brand') || photoInput());
  }

  function showReviewOverlay(item, index, total, photosOk) {
    const more = (index + 1) < total;
    overlay('<b>FindA.Sale</b><div style="margin-top:6px">Filled <b>' + escapeHtml(item.title) + '</b> as best we could.</div>' +
      '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Review every field &mdash; category/Market tier/size/condition are all UNVERIFIED guesses (condition especially, see the code comment). ' +
      '<b>Measurements were left blank</b> &mdash; Grailed listings perform much better with them, add them yourself before publishing. Then click Grailed\'s own <b>List item</b> yourself &mdash; this extension never publishes for you.</div>' +
      (!photosOk ? '<div style="color:#ffcf7a;margin-top:6px;font-size:12px">Photos may not have attached -- add them on this screen.</div>' : '') +
      button('fas-gr-next', more ? 'I posted — next item &#9654;' : 'I posted — done', true) +
      button('fas-gr-close', 'Close', false) +
      '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');
    const next = document.getElementById('fas-gr-next');
    if (next) next.onclick = async () => {
      try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: item.id, remoteListingId: null, platform: 'GRAILED' }); } catch (e) {}
      try { await chrome.runtime.sendMessage({ type: 'advanceGrailedQueue' }); } catch (e) {}
      if (more) { location.href = LISTING_URL_HINT; } else { bar && bar.remove(); }
    };
    closeBtnHandler();
  }

  function showDesignerNotFoundOverlay(item, index, total, designerValue) {
    const more = (index + 1) < total;
    overlay('<b>FindA.Sale</b><div style="margin-top:6px;font-size:13px;color:#ffcf7a">Designer <b>' + escapeHtml(designerValue) +
      '</b> not found on Grailed\'s curated designer list -- list this item manually, or file a request with Grailed to add it. FindA.Sale can\'t add a new designer for you, so this item was skipped.</div>' +
      button('fas-gr-skip', more ? 'Skip — next item &#9654;' : 'Skip — done', true) +
      button('fas-gr-close', 'Close', false) +
      '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');
    const skip = document.getElementById('fas-gr-skip');
    if (skip) skip.onclick = async () => {
      // Never marks the item listed -- it genuinely was not posted. Just advances the local
      // queue so the organizer can move on to the next item.
      try { await chrome.runtime.sendMessage({ type: 'advanceGrailedQueue' }); } catch (e) {}
      if (more) { location.href = LISTING_URL_HINT; } else { bar && bar.remove(); }
    };
    closeBtnHandler();
  }

  async function fillListing(item) {
    overlay('<b>FindA.Sale</b> - filling the Grailed listing form...');
    await tryFill('Title', item.title, (v) => fillText('Title', v));
    await tryFill('Description', item.description, (v) => fillText('Description', v));
    await pickMarketTier();
    await tryFill('Category', item.category, (v) => pickCategory(v));
    // 2026-08-18: color/size now exist on Item and flow through getExtensionItems ->
    // popup.js's queue map. tryFill's own guard still skips silently on unset items.
    await tryFill('Color', item.color, (v) => fillText('Color', v));
    await tryFill('Size', item.size, (v) => fillSize(v));
    // Measurements deliberately NEVER filled -- see file header. No call to any measurements
    // field exists in this function on purpose.
    const conditionLabel = mapGrailedCondition(item.condition);
    await tryFill('Condition', conditionLabel, (v) => fillText('Condition', v) || false);
    if (item.price != null && isFinite(Number(item.price))) {
      await tryFill('Price', item.price, (v) => fillText('Price', String(Math.max(1, Math.round(Number(v))))));
    }
    // Offers (negotiation) toggle deliberately left at Grailed's own default -- never touched.
    await humanPause(400, 800);
    const photosOk = await injectPhotos(item.photoUrls);
    return photosOk;
  }

  async function run(item, index, total) {
    if (looksLikeInterstitial()) {
      overlayWarn('Grailed is showing a verification/security screen. FindA.Sale never attempts to solve this -- please complete it yourself, then reopen the extension to continue.' + button('fas-gr-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    if (!looksLikeListingForm()) {
      overlayWarn('This doesn\'t look like a fillable Grailed listing form yet. If you\'re on the right page, this is an UNVERIFIED-selector miss -- please fill it in yourself.' + button('fas-gr-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    // Designer is a hard gate for this platform: a genuine no-match means Grailed's own form
    // can't be submitted anyway (curated list, no free text), so this stops BEFORE filling
    // anything else rather than leaving a half-filled, unsubmittable listing behind.
    if (item.brand) {
      const designerResult = await fillDesigner(item.brand);
      if (designerResult === 'no_match') { showDesignerNotFoundOverlay(item, index, total, item.brand); return; }
      if (designerResult === 'field_missing') console.warn('[FAS Grailed] Designer field not found (UNVERIFIED selector) -- continuing to fill the rest of the form, but Grailed will likely block submission without a Designer set.');
    } else {
      // brand now exists on Item (2026-08-18) but is still commonly unset -- this branch
      // fires for any genuinely brand-less item, not just a structural gap. Not a hard stop by
      // itself (a genuinely brand-less vintage/unbranded item is a real Grailed use case), but
      // flagged loudly since Designer is normally required there.
      console.warn('[FAS Grailed] No brand/designer data on this item -- Grailed generally requires a Designer to be set; the organizer will need to pick one manually.');
    }
    const photosOk = await fillListing(item);
    if (looksLikeInterstitial()) {
      overlayWarn('Grailed is showing a verification/security screen partway through filling this listing. Please complete it yourself, then finish this listing manually -- nothing further was auto-filled.' + button('fas-gr-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    showReviewOverlay(item, index, total, photosOk);
  }

  async function start() {
    await sleep(600);
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getGrailedQueueItem' }); } catch (e) { return; }
    if (!queued || !queued.ok || !queued.item) return; // nothing queued -- stay silent
    try {
      await run(queued.item, queued.index, queued.total);
    } catch (e) {
      overlayWarn('Something went wrong filling this listing (' + escapeHtml((e && e.message) || 'unknown error') + '). Nothing was published -- complete this listing yourself, or reopen the extension to try again.' + button('fas-gr-close', 'Close', false));
      closeBtnHandler();
    }
  }

  start();
})();
