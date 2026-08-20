/* FindA.Sale — content script on vinted.com (US marketplace) listing flow.
 *
 * ================================================================================================
 * CRITICAL, NON-NEGOTIABLE LEGAL/PRODUCT BOUNDARY -- READ BEFORE EDITING THIS FILE:
 * This script may fill and prepare EXACTLY ONE new, never-before-submitted listing per
 * invocation. It must contain ABSOLUTELY NO relist, bump, refresh, scheduled-repost, or
 * "resubmit a previously deleted listing" logic of any kind -- no timers, no retry-by-
 * resubmitting, nothing that could look like automated reposting. Vinted has an active 2026
 * enforcement wave specifically targeting automated relist/bump behavior, detected via image
 * perceptual hashing that survives crops/edits, behavioral analysis, and device fingerprinting.
 * This is a hard legal/product boundary from this platform's own legal sign-off, not a style
 * preference. DO NOT "helpfully" add relist/renewal automation to this file later without
 * re-reading this comment and getting explicit legal sign-off first. Note the asymmetry with
 * fas-craigslist.js/fas-gumtree-au.js/background.js's auto-renew system (ADR-100): those
 * platforms' renewal flows do NOT apply here -- Vinted must never be wired into
 * autoRenewDueItems() or any equivalent renewal queue in background.js.
 * ================================================================================================
 *
 * CODE-ONLY, UNTESTED (2026-08-18 dispatch): no Vinted seller account exists to verify this
 * session -- every selector below is a best-effort guess, never live-confirmed. Same hard rules
 * as fas-poshmark.js / fas-mercari.js / fas-selectors.js (ADR-084):
 *   1. NEVER select by obfuscated CSS class -- label text / aria-label / role / structural
 *      anchors only.
 *   2. NEVER auto-click the final "Upload"/"Publish" action -- fills and stops, always.
 *   3. HARD-STOP on any CAPTCHA/identity-verification/unrecognized interstitial.
 *   4. Every selector lookup is null-checked; a missing field logs console.warn and is skipped.
 * Every field mapping is commented "UNVERIFIED -- confirm against live DOM".
 */
(function () {
  const LISTING_URL_HINT = 'https://www.vinted.com/items/new'; // UNVERIFIED -- best-effort guess, not live-confirmed

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
      'complete the challenge', 'enter the code we sent', 'checkpoint'
    ];
    if (signals.some((s) => lower.indexOf(s) !== -1)) return true;
    // BUG FIX 2026-08-19 (S-EXT-BATCH-2, P1): "security check", "verify your identity",
    // "two-factor", "one-time code" are common AMBIENT copy on real e-commerce pages -- account
    // trust/safety banners, footer links, 2FA settings mentions -- not exclusive to an actual
    // lockout screen. Live-confirmed false positive 2026-08-19 on Mercari's identical shared
    // implementation (a normal welcome modal, no real verification screen present) -- applied here
    // preemptively since this file copies the exact same pattern. Treat these four as WEAK
    // signals -- only count them if looksLikeListingForm() is false, i.e. we're not already
    // on the real fillable form -- a present, fillable form is strong countervailing evidence
    // against a genuine lockout state.
    const weakSignals = ['security check', 'verify your identity', 'two-factor', 'one-time code'];
    if (weakSignals.some((s) => lower.indexOf(s) !== -1) && !looksLikeListingForm()) return true;
    return false;
  }

  let bar;
  function ensureBar() {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'fas-vinted-bar';
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
  function closeBtnHandler() { const c = document.getElementById('fas-vin-close'); if (c) c.onclick = () => bar && bar.remove(); }

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
  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // BUG FIX 2026-08-19 (S-EXT-BATCH, P1): tryFill used to ONLY console.warn on a skipped field --
  // invisible to the organizer unless they had DevTools open. Vinted's own review overlay
  // (showReviewOverlay) is shown once, at the END of fillListing, so an earlier overlayWarn() call
  // mid-fill would just get overwritten by it a moment later -- not a real fix. Instead, tryFill now
  // takes an optional `warnings` array (shared across the whole fillListing() call) and pushes a
  // plain-language message onto it for every field that silently failed; fillListing collects that
  // array and showReviewOverlay renders it PERSISTENTLY on the final screen, so the organizer
  // actually sees every field that needs a manual check -- most importantly Category, which used to
  // fail completely silently (console.warn only) when the picker had no confident text match.
  async function tryFill(fieldLabel, value, fillFn, warnings) {
    if (value === undefined || value === null || value === '') return false;
    try {
      const ok = await fillFn(value);
      if (!ok) {
        console.warn('[FAS Vinted] Field "' + fieldLabel + '" -- selector not found, skipped (UNVERIFIED -- confirm against live DOM).');
        if (warnings) warnings.push(fieldLabel + ' could not be filled automatically -- please set it yourself.');
      }
      return ok;
    } catch (e) {
      console.warn('[FAS Vinted] Field "' + fieldLabel + '" -- error while filling, skipped:', e && e.message);
      if (warnings) warnings.push(fieldLabel + ' hit an error while filling -- please check it.');
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

  // Category: 3-4 level tree-based picker. Same fuzzy best-effort click-through pattern as the
  // other three new scripts -- FindA.Sale's item.category is a single flat string, not Vinted's
  // real taxonomy tree, so this clicks the closest text match at each level and stops once a
  // level has no confident match.
  async function pickCategory(categoryText) {
    if (!categoryText) return false;
    const opener = openerByLabel('Category');
    if (!opener) return false;
    opener.click();
    await sleep(400);
    let pickedAny = false;
    for (let level = 0; level < 4; level++) {
      await sleep(250);
      const opt = optionElByText(categoryText);
      if (!opt) break;
      opt.click();
      pickedAny = true;
      await sleep(300);
    }
    if (!pickedAny) console.warn('[FAS Vinted] Category "' + categoryText + '" -- no level matched in the picker (UNVERIFIED taxonomy) -- left for the organizer to choose.');
    return pickedAny;
  }

  // Brand: three entry paths (popular list / type-ahead / full name) -- this only attempts the
  // type-ahead path (most reliable to automate blind). If nothing matches, Vinted's own form has
  // an explicit "No brand" option at the bottom of the suggestion list -- selected as the
  // fallback per this dispatch's explicit instruction, rather than leaving brand blank or
  // crashing.
  async function fillBrand(labelText, value) {
    const el = fieldByLabel(labelText);
    if (!el) return false;
    el.focus();
    setNativeValue(el, String(value));
    await sleep(700); // UNVERIFIED -- suggestion-list settle time, best-effort guess
    const match = optionElByText(value);
    if (match) { match.click(); await sleep(200); return true; }
    const noBrand = qa('[role="option"], li, div[role="button"], button').find((n) => /no brand/.test(norm(n.textContent)));
    if (noBrand) { noBrand.click(); await sleep(200); console.warn('[FAS Vinted] Brand "' + value + '" had no matching suggestion -- selected Vinted\'s own "No brand" fallback instead.'); return true; }
    console.warn('[FAS Vinted] Brand "' + value + '" had no matching suggestion and no "No brand" option was found (UNVERIFIED) -- left unset.');
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

  // Vinted's CURRENT confirmed condition wording (Vinted help center) -- SUPERSEDES older
  // "New with tags / New without tags" wording found in third-party blogs, which appears
  // outdated. "Needs repair" is electronics-only per Vinted's own docs; mapped here regardless
  // when the source condition clearly says broken/for-parts, since the form itself is expected
  // to only offer it for the relevant category.
  function mapVintedCondition(condition) {
    const c = norm(condition);
    if (!c) return 'Good';
    if (/^new$|brand new|nwt|new,/.test(c)) return 'New';
    if (/like new|excellent/.test(c)) return 'Like new';
    if (/very good/.test(c)) return 'Very good';
    if (/needs repair|broken|for parts|not working/.test(c)) return 'Needs repair (electronics only)';
    if (/satisfactory|fair|acceptable|worn/.test(c)) return 'Satisfactory';
    return 'Good';
  }

  const VINTED_MIN_PRICE = 1, VINTED_MAX_PRICE = 1000; // platform-enforced range per this dispatch's spec

  // Direct (non-descendant) text of an element -- BUG FIX 2026-08-19, S-EXT-BATCH-2, helper for
  // clickableOptionByExactText below. Concatenates only this element's own Text-node children, so
  // a big card wrapping several lines of nested markup doesn't get treated as one giant text blob.
  function directText(el) {
    let out = '';
    for (const node of el.childNodes) {
      if (node.nodeType === 3) out += node.textContent;
    }
    return norm(out);
  }
  // Find a clickable option (radio/card/button) by its OWN exact visible text, independent of any
  // opener/dropdown structure -- for UI patterns that are persistently-visible selectable
  // cards/tiles rather than a click-to-open popup. Walks up to the nearest clickable ancestor once
  // the exact text is found (the text itself is often in an inner <span>/<div>, not the clickable
  // element itself).
  function clickableOptionByExactText(text) {
    const want = norm(text);
    for (const el of qa('*')) {
      if (directText(el) === want) {
        return el.closest('button, [role="radio"], [role="option"], [role="button"], label, div[tabindex]') || el;
      }
    }
    return null;
  }

  // Package size: required final step, determines shipping-label eligibility. FindA.Sale has no
  // package-size data today (no such field on Item -- confirmed against schema.prisma), so this
  // always defaults to a reasonable tier and logs a loud warning either way, since even a
  // "successful" pick here is a real assumption per this dispatch's explicit instruction.
  // BUG FIX 2026-08-19 (S-EXT-BATCH-2, P1): live-confirmed real UI is three persistently-visible
  // selectable size cards under a "Select your package size" heading (Small/Medium/Large, each
  // with its own descriptive sentence, "Medium" marked "Recommended" by Vinted itself) -- NOT a
  // click-to-open dropdown with popup options the way this function originally assumed (which is
  // why it was reporting "couldn't find that field automatically" every time). Now looks directly
  // for the "Medium" card -- a real content-driven default (Vinted's own "Recommended" tag), not
  // an arbitrary middle-of-whatever-list-appears index guess. Falls back to the old opener+popup
  // path in case a different Vinted layout variant still uses one.
  async function fillPackageSize() {
    const medium = clickableOptionByExactText('Medium');
    if (medium) {
      medium.click();
      await sleep(200);
      overlayWarn('Selected Vinted\'s own "Recommended" Medium package size (FindA.Sale has no real package-size data for this item) -- please confirm it before publishing.');
      return true;
    }
    const opener = openerByLabel('Package size') || openerByLabel('Parcel size') || openerByLabel('Select your package size');
    if (!opener) {
      overlayWarn('Vinted requires a package size before you can publish -- FindA.Sale couldn\'t find that field automatically (UNVERIFIED selector). Please choose it yourself.');
      return false;
    }
    opener.click();
    await sleep(350);
    // No package-size data exists anywhere in FindA.Sale yet -- always the middle of whatever
    // list appears (index-based, since option wording/tiers are entirely unverified).
    const options = qa('[role="option"], li[role="option"], li');
    const candidate = options.length ? options[Math.floor(options.length / 2)] : null;
    if (!candidate) {
      overlayWarn('Vinted requires a package size before you can publish -- FindA.Sale opened the field but couldn\'t find any options (UNVERIFIED). Please choose it yourself.');
      return false;
    }
    candidate.click();
    await sleep(200);
    overlayWarn('Filled an UNVERIFIED best-guess package size (a middle tier -- FindA.Sale has no real package-size data for this item). Please confirm it before publishing.');
    return true;
  }

  function photoInput() {
    return document.querySelector('input[type="file"][accept*="image"]') || document.querySelector('input[type="file"]');
  }
  async function injectPhotos(urls) {
    if (!urls || !urls.length) return false;
    let resp;
    try { resp = await chrome.runtime.sendMessage({ type: 'fetchPhotos', urls: urls.slice(0, 20) }); } catch (e) { return false; }
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
      dt.items.add(new File([bytes], 'photo-' + (i + 1) + '.jpg', { type })); // first photo = full item view, per array order
    });
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function looksLikeListingForm() {
    return !!(fieldByLabel('Title') || fieldByLabel('Description') || photoInput());
  }

  function showReviewOverlay(item, index, total, photosOk, warnings) {
    const more = (index + 1) < total;
    // BUG FIX 2026-08-19 (S-EXT-BATCH, P1): render every collected fillListing() warning
    // (Category miss chief among them) persistently on this screen -- see tryFill's comment above
    // for why a mid-flow overlayWarn() call alone doesn't work (this function replaces it).
    const warningsHtml = (warnings && warnings.length)
      ? '<div style="margin-top:8px;padding:8px 10px;background:#3a2a1a;border:1px solid #a06b2a;border-radius:8px;font-size:12px;color:#ffcf7a">' +
        '<b>Needs a manual check:</b><ul style="margin:4px 0 0;padding-left:18px">' +
        warnings.map((w) => '<li>' + escapeHtml(w) + '</li>').join('') + '</ul></div>'
      : '';
    overlay('<b>FindA.Sale</b><div style="margin-top:6px">Filled <b>' + escapeHtml(item.title) + '</b> as best we could.</div>' +
      '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Review every field (category/brand/material/package size are UNVERIFIED guesses), then click Vinted\'s own <b>Upload</b> yourself -- this extension never publishes for you and never reposts a listing automatically.</div>' +
      warningsHtml +
      (!photosOk ? '<div style="color:#ffcf7a;margin-top:6px;font-size:12px">Photos may not have attached -- add them on this screen.</div>' : '') +
      button('fas-vin-next', more ? 'I posted — next item &#9654;' : 'I posted — done', true) +
      button('fas-vin-close', 'Close', false) +
      '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');
    const next = document.getElementById('fas-vin-next');
    if (next) next.onclick = async () => {
      // Records this as a single, human-confirmed listing post -- this is NOT a relist/bump call
      // and must never be reused as one. See the file-header constraint.
      try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: item.id, remoteListingId: null, platform: 'VINTED' }); } catch (e) {}
      try { await chrome.runtime.sendMessage({ type: 'advanceVintedQueue' }); } catch (e) {}
      if (more) { location.href = LISTING_URL_HINT; } else { bar && bar.remove(); }
    };
    closeBtnHandler();
  }

  async function fillListing(item) {
    overlay('<b>FindA.Sale</b> - filling the Vinted listing form...');
    const warnings = [];
    await tryFill('Title', item.title, (v) => fillText('Title', v), warnings);
    await tryFill('Description', item.description, (v) => fillText('Description', v), warnings);
    // BUG FIX 2026-08-19 (S-EXT-BATCH, P1): this was the core of the silent-category-miss bug --
    // pickCategory's own console.warn on a no-match was the ONLY signal anywhere, invisible to the
    // organizer. Routing it through tryFill's `warnings` param means a category miss now shows up
    // persistently on the review screen below instead of vanishing.
    await tryFill('Category', item.category, (v) => pickCategory(v), warnings);
    // 2026-08-18: brand/size/color/material now exist on Item (single string each, not an
    // array -- see schema.prisma comment) and flow through getExtensionItems -> popup.js's
    // queue map. tryFill's own undefined/null/'' guard still skips silently on unset items.
    await tryFill('Brand', item.brand, (v) => fillBrand('Brand', v), warnings);
    await tryFill('Size', item.size, (v) => fillSelectLike('Size', v), warnings);
    await tryFill('Color', item.color, (v) => fillSelectLike('Color', v), warnings);
    await tryFill('Material', item.material, (v) => fillSelectLike('Material', v), warnings);
    const conditionLabel = mapVintedCondition(item.condition);
    await tryFill('Condition', conditionLabel, (v) => fillSelectLike('Condition', v), warnings);
    if (item.price != null && isFinite(Number(item.price))) {
      let priceVal = Math.round(Number(item.price));
      if (priceVal < VINTED_MIN_PRICE || priceVal > VINTED_MAX_PRICE) {
        console.warn('[FAS Vinted] Price $' + priceVal + ' falls outside Vinted\'s platform-enforced $' + VINTED_MIN_PRICE + '-$' + VINTED_MAX_PRICE + ' range -- clamping rather than submitting an invalid value.');
        priceVal = Math.max(VINTED_MIN_PRICE, Math.min(VINTED_MAX_PRICE, priceVal));
      }
      await tryFill('Price', priceVal, (v) => fillText('Price', String(v)), warnings);
    }
    const packageSizeOk = await fillPackageSize();
    if (!packageSizeOk) warnings.push('Package size could not be set automatically -- Vinted requires it before publishing.');
    await humanPause(400, 800);
    const photosOk = await injectPhotos(item.photoUrls);
    return { photosOk, warnings };
  }

  async function run(item, index, total) {
    if (looksLikeInterstitial()) {
      overlayWarn('Vinted is showing a verification/security screen. FindA.Sale never attempts to solve this -- please complete it yourself, then reopen the extension to continue.' + button('fas-vin-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    if (!looksLikeListingForm()) {
      overlayWarn('This doesn\'t look like a fillable Vinted listing form yet. If you\'re on the right page, this is an UNVERIFIED-selector miss -- please fill it in yourself.' + button('fas-vin-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    const fillResult = await fillListing(item);
    if (looksLikeInterstitial()) {
      overlayWarn('Vinted is showing a verification/security screen partway through filling this listing. Please complete it yourself, then finish this listing manually -- nothing further was auto-filled.' + button('fas-vin-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    showReviewOverlay(item, index, total, fillResult.photosOk, fillResult.warnings);
  }

  async function start() {
    await sleep(600);
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getVintedQueueItem' }); } catch (e) { return; }
    if (!queued || !queued.ok || !queued.item) return; // nothing queued -- stay silent
    try {
      await run(queued.item, queued.index, queued.total);
    } catch (e) {
      overlayWarn('Something went wrong filling this listing (' + escapeHtml((e && e.message) || 'unknown error') + '). Nothing was published -- complete this listing yourself, or reopen the extension to try again.' + button('fas-vin-close', 'Close', false));
      closeBtnHandler();
    }
  }

  start();
})();
