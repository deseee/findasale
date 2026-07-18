/* FindA.Sale — content script on post.craigslist.org/*.
 * Craigslist "for sale by owner" autofill (ADR-084 extension, 2026-07-17). Unlike the Facebook
 * flow, Craigslist's posting flow is plain, server-rendered HTML across several FULL-PAGE steps
 * (?s=subarea -> ?s=type -> ?s=cat -> ?s=edit -> images -> publish), so NO React synthetic-event
 * tricks and NO chrome.debugger are needed: ordinary value setters, radio .checked + change, and
 * native button clicks drive the form. Same hard-error-only philosophy as fas-content.js -- it
 * never guesses past a step it can't confidently complete.
 * GUARDRAIL (legal-reviewed): the human owns login, ALL phone/email/CAPTCHA verification, and the
 * FINAL publish click. This script STOPS at the images/review step and NEVER clicks publish.
 */
(function () {
  const POST_URL = 'https://post.craigslist.org/';

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  async function humanPause(minMs, maxMs) { await sleep(minMs + Math.random() * (maxMs - minMs)); }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function bodyText() { return (document.body && document.body.innerText) || ''; }
  function q(sel) { return document.querySelector(sel); }
  function escapeHtml(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function hardError(step, detail) {
    const e = new Error(detail || ('Could not find what I expected on the ' + step + ' step.'));
    e.fasStep = step;
    return e;
  }

  // ---- overlay UI (mirrors fas-remove.js's bottom-right bar) ----
  let bar;
  function ensureBar() {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'fas-craigslist-bar';
      bar.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:340px;' +
        'background:#1f2a24;color:#f3f5f2;border:1px solid #3c8c5a;border-radius:12px;padding:14px 16px;' +
        'font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.4)';
      document.documentElement.appendChild(bar);
    }
    return bar;
  }
  function overlay(html) { ensureBar().innerHTML = html; }
  function overlayInfo(text) { overlay('<b>FindA.Sale</b><div style="margin-top:6px;font-size:13px;color:#cfe3d6">' + text + '</div>'); }
  function overlayError(step, msg) {
    overlay('<b>FindA.Sale</b><div style="color:#ffcf7a;margin-top:6px;font-size:12px">Stopped on the <b>' + escapeHtml(step) +
      '</b> step: ' + escapeHtml(msg || 'something did not match.') +
      ' Nothing was published -- complete this posting yourself, or reopen the extension to try again.</div>' +
      button('fas-cl-close', 'Close', false));
    const c = document.getElementById('fas-cl-close'); if (c) c.onclick = () => bar && bar.remove();
  }
  function button(id, label, primary) {
    return '<button id="' + id + '" style="margin-top:10px;margin-right:8px;padding:7px 12px;border-radius:8px;border:none;cursor:pointer;' +
      'font-weight:600;font-size:13px;background:' + (primary ? '#3c8c5a' : '#3a4842') + ';color:#fff">' + label + '</button>';
  }

  // ---- loop guard: never auto-submit the same step more than twice. A Craigslist validation
  // bounce (e.g. a too-short body) reloads the same step; without this the script would re-fill +
  // re-continue forever. sessionStorage survives same-origin full-page navigations within the
  // posting flow, and is cleared once the flow reaches the images step (end of automation). ----
  function attemptCount(step) { return Number(sessionStorage.getItem('fasCLAttempt_' + step) || '0'); }
  function bumpAttempt(step) { sessionStorage.setItem('fasCLAttempt_' + step, String(attemptCount(step) + 1)); }
  function clearAttempts() { ['subarea', 'type', 'cat', 'edit'].forEach((s) => sessionStorage.removeItem('fasCLAttempt_' + s)); }
  // True (and shows a stop message) when this step has already been auto-submitted twice without
  // Craigslist advancing -- hand it to the human instead of looping.
  function guardStop(step) {
    if (attemptCount(step) >= 2) {
      overlayInfo('FindA.Sale filled this step but Craigslist did not move on. Please review and complete it yourself, then continue.');
      return true;
    }
    bumpAttempt(step);
    return false;
  }

  // ---- plain-HTML field + control helpers ----
  function setInputValue(el, value) {
    el.focus();
    el.value = String(value == null ? '' : value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fileInput() {
    return document.querySelector('input[type="file"][accept*="image"]') || document.querySelector('input[type="file"]');
  }

  // Find a radio (for-sale-by-owner / category list) whose label (or row) text contains `target`.
  function radioByLabelText(target) {
    const want = norm(target);
    const labels = Array.from(document.querySelectorAll('label'));
    for (const lab of labels) {
      const radio = lab.querySelector('input[type="radio"]');
      if (radio && norm(lab.textContent).indexOf(want) !== -1) return radio;
    }
    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
    for (const radio of radios) {
      const row = radio.closest('li') || radio.parentElement;
      if (row && norm(row.textContent).indexOf(want) !== -1) return radio;
    }
    return null;
  }
  function selectRadio(radio) {
    radio.checked = true;
    radio.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function continueButton() {
    const nodes = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
    const txt = (b) => norm(b.textContent || b.value);
    return nodes.find((b) => txt(b) === 'continue') || nodes.find((b) => txt(b).indexOf('continue') !== -1) || null;
  }
  function clickContinueOrThrow(step) {
    const btn = continueButton();
    if (!btn) throw hardError(step, 'Couldn\'t find the "continue" button to advance.');
    btn.click(); // plain-HTML form submit -> full page load; the script re-runs on the next step
  }

  // ---- FindA.Sale category -> Craigslist for-sale category (best-effort; default general) ----
  function mapCraigslistCategory(category) {
    const c = norm(category);
    if (!c) return 'general for sale';
    const rules = [
      [['antique'], 'antiques'],
      [['appliance'], 'appliances'],
      [['art', 'craft'], 'arts'],
      [['baby', 'kid', 'child', 'toddler', 'infant'], 'baby'],
      [['book', 'magazine'], 'books'],
      [['cell phone', 'smartphone', 'iphone', 'android'], 'cell phones'],
      [['cloth', 'apparel', 'shoe', 'accessor', 'jacket', 'dress'], 'clothing'],
      [['collectible', 'coin', 'stamp', 'memorabilia'], 'collectibles'],
      [['computer', 'laptop', 'monitor'], 'computers'],
      [['electronic', 'tv', 'stereo', 'speaker', 'headphone'], 'electronics'],
      [['farm', 'garden', 'plant', 'lawn', 'mower'], 'farm'],
      [['furniture', 'couch', 'sofa', 'table', 'chair', 'desk', 'dresser', 'bed', 'cabinet'], 'furniture'],
      [['jewel', 'watch', 'ring', 'necklace', 'bracelet'], 'jewelry'],
      [['instrument', 'guitar', 'piano', 'violin', 'drum'], 'musical instruments'],
      [['photo', 'camera', 'lens', 'video'], 'photo'],
      [['sport', 'fitness', 'exercise', 'golf', 'bike', 'bicycle', 'ski', 'fishing'], 'sporting'],
      [['tool', 'drill', 'saw', 'wrench', 'hardware'], 'tools'],
      [['toy', 'game', 'puzzle', 'lego', 'doll'], 'toys'],
      [['kitchen', 'household', 'home', 'decor', 'linen', 'cookware'], 'household'],
      [['health', 'beauty', 'cosmetic'], 'health and beauty']
    ];
    for (const rule of rules) { if (rule[0].some((k) => c.indexOf(k) !== -1)) return rule[1]; }
    return 'general for sale';
  }

  // ---- photo injection (reuses the worker's cross-origin fetchPhotos, same as fas-content.js) ----
  async function injectPhotos(urls) {
    if (!urls || !urls.length) return false;
    let resp;
    try { resp = await chrome.runtime.sendMessage({ type: 'fetchPhotos', urls }); } catch (e) { return false; }
    if (!resp || !resp.ok || !resp.dataUrls || !resp.dataUrls.length) return false;
    const input = fileInput();
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

  // ---- step detection: unambiguous DOM anchors first (PostingTitle = edit form, file input =
  // images), then the ?s= URL param / page copy for the radio-list steps. ----
  function detectStep() {
    if (q('#PostingTitle') || q('input[name="PostingTitle"]')) return 'edit';
    if (fileInput()) return 'images';
    const s = norm(new URLSearchParams(location.search).get('s'));
    if (s === 'type' || radioByLabelText('for sale by owner') || /what type of posting/i.test(bodyText())) return 'type';
    if (s === 'cat' || radioByLabelText('general for sale')) return 'cat';
    if (s === 'subarea' || s === 'area') return 'subarea';
    return 'unknown';
  }

  // ---- per-step handlers ----
  async function doTypeStep() {
    overlay('<b>FindA.Sale</b> - choosing "for sale by owner"...');
    const radio = radioByLabelText('for sale by owner');
    if (!radio) throw hardError('Type', 'Couldn\'t find the "for sale by owner" option on this Craigslist screen.');
    selectRadio(radio);
    await humanPause(500, 900);
    clickContinueOrThrow('Type');
  }

  async function doCatStep(item) {
    overlay('<b>FindA.Sale</b> - choosing a category...');
    const target = mapCraigslistCategory(item.category);
    let radio = radioByLabelText(target);
    if (!radio && target !== 'general for sale') radio = radioByLabelText('general for sale');
    if (!radio) throw hardError('Category', 'Couldn\'t find a for-sale category to select on this Craigslist screen.');
    selectRadio(radio);
    await humanPause(500, 900);
    clickContinueOrThrow('Category');
  }

  async function doEditStep(item) {
    overlay('<b>FindA.Sale</b> - filling the posting form...');
    const title = q('#PostingTitle') || q('input[name="PostingTitle"]');
    if (!title) throw hardError('Details', 'Couldn\'t find the posting Title field.');
    setInputValue(title, item.title);

    const price = q('input[name="price"]') || q('#price');
    if (price && item.price != null && isFinite(Number(item.price))) {
      setInputValue(price, String(Math.max(0, Math.round(Number(item.price)))));
    }

    // Location fields: fill ONLY when the item carries the data -- never invent a city or ZIP
    // (Craigslist requires postal, so a missing value is simply left for the human, who owns the
    // final review + publish anyway).
    const geo = q('#geographic_area') || q('input[name="geographic_area"]');
    const geoVal = item.geographicArea || item.city || item.saleCity;
    if (geo && geoVal) setInputValue(geo, geoVal);
    const postal = q('#postal') || q('input[name="postal"]');
    const postalVal = item.postal || item.postalCode || item.zip || item.saleZip;
    if (postal && postalVal) setInputValue(postal, String(postalVal));

    const body = q('#PostingBody') || q('textarea[name="PostingBody"]');
    if (!body) throw hardError('Details', 'Couldn\'t find the posting Description field.');
    setInputValue(body, item.description || '');

    await humanPause(700, 1200);
    clickContinueOrThrow('Details');
  }

  async function doImagesStep(item, index, total) {
    clearAttempts(); // reached the end of the automatable flow -- reset guards for the next item
    overlay('<b>FindA.Sale</b> - adding photos...');
    const photosOk = await injectPhotos(item.photoUrls);
    const more = (index + 1) < total;
    overlay('<b>FindA.Sale</b><div style="margin-top:6px">Filled <b>' + escapeHtml(item.title) + '</b> and added its photos.</div>' +
      '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Review the posting, complete any phone/email verification, then click Craigslist\'s <b>publish</b> yourself.</div>' +
      (!photosOk ? '<div style="color:#ffcf7a;margin-top:6px;font-size:12px">Photos may not have attached -- add them on this screen.</div>' : '') +
      (more ? button('fas-cl-next', 'I posted - next item &#9654;', true) : '') +
      button('fas-cl-close', 'Close', false) +
      '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');
    const next = document.getElementById('fas-cl-next');
    if (next) next.onclick = async () => {
      clearAttempts();
      try { await chrome.runtime.sendMessage({ type: 'advanceCraigslistQueue' }); } catch (e) {}
      location.href = POST_URL;
    };
    const close = document.getElementById('fas-cl-close');
    if (close) close.onclick = () => bar && bar.remove();
  }

  async function run(item, index, total) {
    const step = detectStep();
    if (step === 'edit') { if (!guardStop('edit')) await doEditStep(item); return; }
    if (step === 'images') { await doImagesStep(item, index, total); return; }
    if (step === 'type') { if (!guardStop('type')) await doTypeStep(); return; }
    if (step === 'cat') { if (!guardStop('cat')) await doCatStep(item); return; }
    // subarea / area / unrecognized location chooser: we can't pick a location confidently (the
    // item carries no Craigslist area), so guide the human rather than guess.
    overlayInfo('Ready to autofill. Choose your Craigslist location/area on this screen and continue - FindA.Sale takes over at the posting details.');
  }

  async function start() {
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getCraigslistQueueItem' }); } catch (e) { return; }
    if (!queued || !queued.ok || !queued.item) return; // nothing queued -- stay silent (page also loads for normal use)
    await sleep(500); // let the page settle before reading the DOM
    try {
      await run(queued.item, queued.index, queued.total);
    } catch (e) {
      overlayError((e && e.fasStep) || 'this', (e && e.message) || '');
    }
  }

  start();
})();
