/* FindA.Sale — content script on poshmark.com (listing-creation flow).
 * CODE-ONLY, UNTESTED (2026-08-18 dispatch): no Poshmark seller account exists to verify this
 * session, so every selector in this file is a best-effort guess built from public research, not
 * a live-confirmed DOM anchor. Follows the SAME hard rules as fas-selectors.js's Facebook
 * comment (ADR-084) and fas-craigslist.js/fas-gumtree-au.js's human-owns-verification boundary:
 *   1. NEVER select by an obfuscated/hashed CSS class -- only visible label text, aria-label,
 *      role, or structural anchors (headings, placeholder text).
 *   2. NEVER auto-click the final "List this listing" / publish action -- this script fills the
 *      form and stops; the organizer reviews and submits it themselves, every time, no toggle.
 *   3. HARD-STOP on any CAPTCHA, identity-verification, or unrecognized interstitial screen --
 *      hand off to the human immediately (see looksLikeInterstitial()), never attempt to solve
 *      or click through one.
 *   4. Every selector lookup is null-checked; a missing field logs a console.warn and is skipped
 *      -- one wrong guess must never crash the rest of the autofill.
 * Every field mapping below is commented "UNVERIFIED -- confirm against live DOM" so a future
 * Chrome QA pass with a real seller account can find and fix every assumption fast.
 *
 * Poshmark's own help docs note that the web "Sell" flow may require a recent login through the
 * Poshmark mobile app to unlock certain listing features -- if this form doesn't behave as
 * expected (fields missing, flow blocked), the overlay tells the organizer to check that rather
 * than silently failing (see maybeShowAppLoginHint below).
 *
 * FindA.Sale's Item model (packages/database/prisma/schema.prisma) does NOT currently carry
 * brand, size, color, or material fields -- only title/price/condition/description/category/
 * photoUrls exist on the queue item (see popup.js startQueue / background.js
 * buildRenewalQueueItem). This file still defensively checks item.brand/item.size/item.color in
 * case that data is added later, but on every real queue item today those fields will be
 * undefined and are skipped with a warning -- NEVER invented. See this dispatch's handoff for the
 * schema follow-up flag.
 */
(function () {
  const POST_URL_HINT = 'https://poshmark.com/create-listing'; // UNVERIFIED -- best-effort guess, not live-confirmed

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  async function humanPause(minMs, maxMs) { await sleep(minMs + Math.random() * (maxMs - minMs)); }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function bodyText() { return (document.body && document.body.innerText) || ''; }
  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return Array.from(document.querySelectorAll(sel)); }
  function escapeHtml(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ---- CAPTCHA / interstitial hard-stop (non-negotiable product/legal requirement, same
  // boundary as fas-craigslist.js's phone/email verification handling and fas-gumtree-au.js's
  // sign-in wall) -- broad, best-effort text/DOM scan. False positives (pausing when nothing was
  // actually there) are an acceptable cost; false negatives (proceeding past a real CAPTCHA) are
  // not, so this is deliberately generous. ----
  function looksLikeInterstitial() {
    if (q('iframe[src*="captcha" i]') || q('iframe[title*="captcha" i]') || q('iframe[src*="hcaptcha" i]') || q('iframe[src*="recaptcha" i]')) return true;
    if (q('[class*="captcha" i]') === null) { /* no-op: never select by class name for ACTION, only as a detection heuristic string-match below */ }
    const lower = bodyText().toLowerCase();
    const signals = [
      'verify you are human', "verify you're human", 'confirm you are not a robot',
      'unusual activity', 'suspicious activity', "we need to verify it's you",
      'complete the challenge', 'enter the code we sent', 'checkpoint'
    ];
    if (signals.some((s) => lower.indexOf(s) !== -1)) return true;
    // BUG FIX 2026-08-19 (S-EXT-BATCH-2, P1): "security check", "verify your identity",
    // "two-factor", "one-time code" are common AMBIENT copy on real e-commerce pages -- account
    // trust/safety banners, footer links, 2FA settings mentions -- not exclusive to an actual
    // lockout screen. Live-confirmed false positive 2026-08-19 on Mercari's identical shared
    // implementation (a normal welcome modal, no real verification screen present) -- applied here
    // preemptively since this file copies the exact same pattern. Treat these four as WEAK
    // signals -- only count them if looksLikeSellForm() is false, i.e. we're not already on the
    // real fillable form -- a present, fillable form is strong countervailing evidence against a
    // genuine lockout state.
    const weakSignals = ['security check', 'verify your identity', 'two-factor', 'one-time code'];
    if (weakSignals.some((s) => lower.indexOf(s) !== -1) && !looksLikeSellForm()) return true;
    return false;
  }

  // ---- overlay UI (same bottom-right bar pattern as fas-craigslist.js / fas-gumtree-au.js) ----
  let bar;
  function ensureBar() {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'fas-poshmark-bar';
      bar.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:360px;' +
        'background:#1f2a24;color:#f3f5f2;border:1px solid #3c8c5a;border-radius:12px;padding:14px 16px;' +
        'font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.4)';
      document.documentElement.appendChild(bar);
    }
    return bar;
  }
  function overlay(html) { ensureBar().innerHTML = html; }
  function overlayInfo(text) { overlay('<b>FindA.Sale</b><div style="margin-top:6px;font-size:13px;color:#cfe3d6">' + text + '</div>'); }
  function overlayWarn(text) { overlay('<b>FindA.Sale</b><div style="margin-top:6px;font-size:12px;color:#ffcf7a">' + text + '</div>'); }
  function button(id, label, primary) {
    return '<button id="' + id + '" style="margin-top:10px;margin-right:8px;padding:7px 12px;border-radius:8px;border:none;cursor:pointer;' +
      'font-weight:600;font-size:13px;background:' + (primary ? '#3c8c5a' : '#3a4842') + ';color:#fff">' + label + '</button>';
  }
  function closeBtnHandler() { const c = document.getElementById('fas-posh-close'); if (c) c.onclick = () => bar && bar.remove(); }

  // ---- generic label/aria/role-based field helpers (never CSS classes) ----
  // BUG FIX 2026-08-19 (S-EXT-BATCH-2, P1): fieldByLabel/openerByLabel below only recognize a
  // real <label> tag (for=/wrapping) or an aria-label attribute. Live-confirmed 2026-08-19
  // (Patrick's real Grailed test): Item Name/Color/Condition/Description/Category all failed to
  // fill even though the page visibly shows exactly those words as headings right above each
  // field -- the real form uses plain styled text (a div/span/h-tag) as the visual "label", not a
  // semantic <label> element, so the label-tag scan above finds nothing to attach to. This adds
  // one more fallback tier, tried only after every existing check misses: find a short,
  // control-free heading-like element whose own text matches (substring, same fuzzy philosophy as
  // the rest of this function, capped at 80 chars so it can't grab an unrelated paragraph), then
  // walk forward through its following siblings for the first real form control. Bounded to a
  // handful of hops so a miss can't run away scanning the whole page.
  // Control selector used throughout nearestControlAfter -- BUG FIX 2026-08-19 (S-EXT-BATCH-3,
  // P0) added `[data-test]` and `div[tabindex]`. Live-confirmed on Poshmark's real create-listing
  // page (direct DOM inspection via a connected Chrome session, not a guess): Category/Subcategory/
  // Size/Condition/Color are plain, non-semantic `<div>`s with NO role, NO tabindex, and NOT a
  // native `<select>` -- the only thing distinguishing them at all is a `data-test="dropdown"` /
  // `data-test="dropdown-container"` / `data-test="size"` attribute (Poshmark's own real
  // test-automation hook, a structural anchor, not an obfuscated utility class -- consistent with
  // this file's "never select by CSS class" rule). Without this, nearestControlAfter had no way to
  // recognize these controls as controls at all.
  const CONTROL_SELECTOR = 'input, textarea, select, [role="combobox"], [role="button"], [role="switch"], [data-test], div[tabindex], button';
  function nearestControlAfter(labelText) {
    const want = norm(labelText);
    const headingCandidates = qa('label, div, span, p, h1, h2, h3, h4, h5, legend');
    function searchFollowingSiblings(startEl, maxHops) {
      let node = startEl;
      for (let hops = 0; hops < maxHops && node; hops++) {
        node = node.nextElementSibling;
        if (!node) break;
        const control = (node.matches && node.matches(CONTROL_SELECTOR)) ? node : node.querySelector(CONTROL_SELECTOR);
        if (control) return control;
      }
      return null;
    }
    for (const el of headingCandidates) {
      const txt = norm(el.textContent);
      if (!txt || txt.length > 80 || txt.indexOf(want) === -1) continue;
      if (el.querySelector(CONTROL_SELECTOR)) continue;
      // Try siblings of the heading itself first (flat-row layouts).
      let control = searchFollowingSiblings(el, 6);
      if (control) return control;
      // BUG FIX 2026-08-19 (S-EXT-BATCH-3, P0): live-confirmed real Poshmark structure is a
      // two-COLUMN layout (`common ancestor 2 levels up, heading's own parent is the "label
      // column", the control lives in a SIBLING "input column" at the PARENT level -- confirmed by
      // walking the live DOM tree directly) -- not a sibling of the heading itself at all. Walk up
      // a few ancestor levels and try each ancestor's own following siblings too.
      let ancestor = el.parentElement;
      for (let up = 0; up < 3 && ancestor; up++) {
        control = searchFollowingSiblings(ancestor, 3);
        if (control) return control;
        ancestor = ancestor.parentElement;
      }
    }
    return null;
  }
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
    const byAttr = document.querySelector('input[aria-label="' + labelText + '"], textarea[aria-label="' + labelText + '"], input[placeholder="' + labelText + '"]');
    if (byAttr) return byAttr;
    return nearestControlAfter(labelText);
  }
  // A clickable "opener" (button/combobox/select-like div) for a labeled field, used for
  // category/brand/size/color pickers that aren't plain <input>/<textarea>.
  function openerByLabel(labelText) {
    const want = norm(labelText);
    const direct = document.querySelector('[aria-label="' + labelText + '"]');
    if (direct) return direct;
    // Added [role="switch"] (BUG FIX 2026-08-19, S-EXT-BATCH-2, P1) -- toggle-switch semantics are
    // common on modern SPA forms (e.g. Grailed's international-shipping region toggles) and were
    // entirely absent from this candidate list before, a likely contributor to those toggles never
    // being found at all.
    const candidates = qa('[role="combobox"], [role="button"], [role="switch"], button, select, div[tabindex]');
    const hit = candidates.find((c) => norm(c.getAttribute('aria-label') || c.textContent).indexOf(want) !== -1 && norm(c.textContent).length < 80);
    if (hit) return hit;
    const labels = qa('label');
    for (const lab of labels) {
      if (norm(lab.textContent).indexOf(want) !== -1) {
        const forId = lab.getAttribute('for');
        if (forId) { const byId = document.getElementById(forId); if (byId) return byId; }
        const inner = lab.querySelector('button, [role="button"], [role="switch"], select, [role="combobox"], div[tabindex]');
        if (inner) return inner;
        return lab;
      }
    }
    return nearestControlAfter(labelText);
  }
  function optionElByText(text) {
    const want = norm(text);
    const opts = qa('[role="option"], li[role="option"], [role="menuitem"], [role="menuitemradio"], li');
    return opts.find((o) => norm(o.textContent) === want) || opts.find((o) => norm(o.textContent).indexOf(want) !== -1 && norm(o.textContent).length < 60) || null;
  }
  // React-controlled inputs ignore a plain .value=x; use the native setter then dispatch input
  // (same pattern as fas-content.js's setNativeValue).
  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Defensive wrapper: never throws, always logs a specific skip reason. UNVERIFIED -- confirm
  // against live DOM applies to every call site below.
  async function tryFill(fieldLabel, value, fillFn) {
    if (value === undefined || value === null || value === '') return false;
    try {
      const ok = await fillFn(value);
      if (!ok) console.warn('[FAS Poshmark] Field "' + fieldLabel + '" -- selector not found, skipped (UNVERIFIED -- confirm against live DOM).');
      return ok;
    } catch (e) {
      console.warn('[FAS Poshmark] Field "' + fieldLabel + '" -- error while filling, skipped:', e && e.message);
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

  // Autocomplete field (Brand): type, wait for suggestions, click the best match. Falls back to
  // Poshmark's own "add custom brand" action if present (UNVERIFIED -- exact wording/selector for
  // that action has never been observed live); otherwise logs and skips rather than leaving a
  // half-typed value in the field.
  async function fillAutocomplete(labelText, value) {
    const el = fieldByLabel(labelText);
    if (!el) return false;
    el.focus();
    setNativeValue(el, String(value));
    await sleep(700); // UNVERIFIED -- suggestion-list settle time, best-effort guess
    const match = optionElByText(value);
    if (match) { match.click(); await sleep(200); return true; }
    const addCustom = qa('[role="option"], li, div[role="button"], button').find((n) => /add\s+.*brand|custom brand|create\s+"/.test(norm(n.textContent)));
    if (addCustom) { addCustom.click(); await sleep(200); return true; }
    console.warn('[FAS Poshmark] Brand "' + value + '" had no matching suggestion and no "add custom brand" action was found (UNVERIFIED) -- left unset.');
    return false;
  }

  // Structured select (Size, Color): open the field, click the matching option. UNVERIFIED
  // whether these render as native <select> or a custom listbox -- tries both.
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

  // Nested 3-level category picker (Department -> Category -> Subcategory). UNVERIFIED taxonomy
  // -- FindA.Sale's item.category is a single flat string (eBay-style, see schema.prisma comment
  // "eBay L1 category name"), not a Poshmark 3-tier path, so this clicks through each level by
  // best-effort fuzzy text match against that one string rather than assuming a mapping table
  // that would likely be wrong. Stops (does not guess further) as soon as a level has no
  // confident match, leaving the remaining levels for the organizer.
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
    if (!pickedAny) console.warn('[FAS Poshmark] Category "' + categoryText + '" -- no level matched in the picker (UNVERIFIED taxonomy) -- left for the organizer to choose.');
    return pickedAny;
  }

  const CONDITION_LABELS = {
    NWT: 'NWT (New With Tags)',
    NWOT: 'NWOT (New Without Tags)',
    EUC: 'EUC (Excellent Used Condition)',
    VGUC: 'VGUC (Very Good Used Condition)',
    GUC: 'GUC (Good Used Condition)'
  };
  // Maps FindA.Sale's condition value to Poshmark's 5-tier wording (confirmed current wording
  // from Poshmark's own listing help -- not third-party-blog sourced). Defaults to GUC for
  // anything ambiguous per this dispatch's explicit instruction, rather than leaving unset.
  function mapPoshmarkCondition(condition) {
    const c = norm(condition);
    if (!c) return CONDITION_LABELS.GUC;
    if (/(new with tag|nwt|brand new|new,)/.test(c)) return CONDITION_LABELS.NWT;
    if (/(new without tag|nwot)/.test(c)) return CONDITION_LABELS.NWOT;
    if (/excellent/.test(c)) return CONDITION_LABELS.EUC;
    if (/very good/.test(c)) return CONDITION_LABELS.VGUC;
    if (/good/.test(c)) return CONDITION_LABELS.GUC;
    return CONDITION_LABELS.GUC; // ambiguous default, per spec
  }

  function photoInput() {
    return document.querySelector('input[type="file"][accept*="image"]') || document.querySelector('input[type="file"]');
  }
  // Reuses the SAME cross-origin photo-fetch pattern as fas-craigslist.js/fas-content.js --
  // background.js's 'fetchPhotos' message does the actual cross-origin fetch (host_permissions
  // already cover Cloudinary/eBay image hosts), this just builds the DataTransfer and assigns
  // it to whatever file input the dropzone exposes. First photo in the array = cover shot,
  // matching the order the array already comes in (never reordered here).
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

  // Detects whether this page actually looks like Poshmark's listing form (Title + Price fields
  // present) rather than trusting POST_URL_HINT's path to be exactly right -- the real URL was
  // never live-confirmed this session. Stays silent (does nothing) if it can't confirm, same
  // "never guess a whole page" posture as fas-gumtree-au.js.
  function looksLikeSellForm() {
    return !!(fieldByLabel('Title') && (fieldByLabel('Price') || fieldByLabel('Listing Price')));
  }

  // Best-effort: flags the "recent app login" caveat from Poshmark's own help docs if the form
  // doesn't look filled-out-able at all (no Title field found even though we're on a poshmark.com
  // page that isn't an obvious interstitial) -- informational only, never blocks anything else.
  function maybeShowAppLoginHint() {
    if (!fieldByLabel('Title') && !looksLikeInterstitial()) {
      overlayWarn('This page doesn\'t look like a fillable Poshmark listing form. Poshmark\'s own help docs mention some web listing features may need a recent sign-in through the Poshmark app -- try that if this form stays empty, then reopen the extension.' + button('fas-posh-close', 'Close', false));
      closeBtnHandler();
      return true;
    }
    return false;
  }

  function showReviewOverlay(item, index, total, photosOk) {
    const more = (index + 1) < total;
    overlay('<b>FindA.Sale</b><div style="margin-top:6px">Filled <b>' + escapeHtml(item.title) + '</b> as best we could.</div>' +
      '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Review every field (category/brand/size/color are UNVERIFIED guesses), then click Poshmark\'s own <b>List This Listing</b> yourself -- this extension never publishes for you.</div>' +
      (!photosOk ? '<div style="color:#ffcf7a;margin-top:6px;font-size:12px">Photos may not have attached -- add them on this screen.</div>' : '') +
      button('fas-posh-next', more ? 'I posted — next item &#9654;' : 'I posted — done', true) +
      button('fas-posh-close', 'Close', false) +
      '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');
    const next = document.getElementById('fas-posh-next');
    if (next) next.onclick = async () => {
      try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: item.id, remoteListingId: null, platform: 'POSHMARK' }); } catch (e) {}
      try { await chrome.runtime.sendMessage({ type: 'advancePoshmarkQueue' }); } catch (e) {}
      if (more) { location.href = POST_URL_HINT; } else { bar && bar.remove(); }
    };
    closeBtnHandler();
  }

  async function fillListing(item) {
    overlay('<b>FindA.Sale</b> - filling the Poshmark listing form...');
    await tryFill('Title', item.title, (v) => fillText('Title', v));
    await tryFill('Description', item.description, (v) => fillText('Description', v));
    if (item.price != null && isFinite(Number(item.price))) {
      await tryFill('Price', item.price, (v) => fillText('Price', String(Math.max(1, Math.round(Number(v))))) || fillText('Listing Price', String(Math.max(1, Math.round(Number(v))))));
    }
    // Original/MSRP price deliberately skipped -- FindA.Sale carries no such data (never invent).
    await tryFill('Category', item.category, (v) => pickCategory(v));
    // 2026-08-18: brand/size/color now exist on Item and flow through getExtensionItems ->
    // popup.js's queue map. tryFill's own undefined/null/'' guard still skips silently on
    // items where the organizer hasn't set a value.
    await tryFill('Brand', item.brand, (v) => fillAutocomplete('Brand', v));
    await tryFill('Size', item.size, (v) => fillSelectLike('Size', v));
    await tryFill('Color', item.color, (v) => fillSelectLike('Color', v));
    const conditionLabel = mapPoshmarkCondition(item.condition);
    await tryFill('Condition', conditionLabel, (v) => fillSelectLike('Condition', v));
    await humanPause(400, 800);
    const photosOk = await injectPhotos(item.photoUrls);
    return photosOk;
  }

  async function run(item, index, total) {
    if (looksLikeInterstitial()) {
      overlayWarn('Poshmark is showing a verification/security screen. FindA.Sale never attempts to solve this -- please complete it yourself, then reopen the extension to continue.' + button('fas-posh-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    // BUG FIX 2026-08-19 (S-EXT-BATCH, P0): this used to gate on maybeShowAppLoginHint() ALONE,
    // which only checks fieldByLabel('Title') -- the STRONGER looksLikeSellForm() check (Title
    // AND Price) already existed in this file but was never actually called from run(), so
    // Poshmark was completely non-functional whenever Title alone false-matched something that
    // wasn't really the sell form. looksLikeSellForm() is now the real gate; maybeShowAppLoginHint
    // still runs first for its more specific "try the mobile app" messaging when Title truly isn't
    // found, falling back to a generic UNVERIFIED-selector warning otherwise. Selector accuracy
    // itself is still CODE-ONLY/UNTESTED (file header) -- this fixes the logic bug, not the DOM
    // selectors; live Chrome QA is still needed to confirm they match Poshmark's real DOM.
    if (!looksLikeSellForm()) {
      if (maybeShowAppLoginHint()) return;
      overlayWarn('This doesn\'t look like a fillable Poshmark listing form yet. If you\'re on the right page, this is an UNVERIFIED-selector miss -- please fill it in yourself.' + button('fas-posh-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    const photosOk = await fillListing(item);
    // Re-check for an interstitial that may have appeared mid-fill (e.g. triggered by the photo
    // upload) before showing the "you're ready to review" state.
    if (looksLikeInterstitial()) {
      overlayWarn('Poshmark is showing a verification/security screen partway through filling this listing. Please complete it yourself, then finish this listing manually -- nothing further was auto-filled.' + button('fas-posh-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    showReviewOverlay(item, index, total, photosOk);
  }

  async function start() {
    await sleep(600); // let the page settle before reading the DOM
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getPoshmarkQueueItem' }); } catch (e) { return; }
    if (!queued || !queued.ok || !queued.item) return; // nothing queued -- stay silent
    try {
      await run(queued.item, queued.index, queued.total);
    } catch (e) {
      overlayWarn('Something went wrong filling this listing (' + escapeHtml((e && e.message) || 'unknown error') + '). Nothing was published -- complete this listing yourself, or reopen the extension to try again.' + button('fas-posh-close', 'Close', false));
      closeBtnHandler();
    }
  }

  start();
})();
