/* FindA.Sale — content script on mercari.com "Sell" flow.
 * CODE-ONLY, UNTESTED (2026-08-18 dispatch): no Mercari seller account exists to verify this
 * session -- every selector below is a best-effort guess from public research, never a live-
 * confirmed DOM anchor. Same hard rules as fas-poshmark.js / fas-selectors.js (ADR-084):
 *   1. NEVER select by obfuscated CSS class -- label text / aria-label / role / structural
 *      anchors only.
 *   2. NEVER auto-click the final "List this item" button -- fills and stops, always, for every
 *      organizer regardless of plan tier. REVERSED 2026-09-22 (S-EXT-MERCARI-NO-AUTOPUBLISH, per
 *      claude_docs/architecture/marketplace-ban-risk-playbook.md Part 4/Mercari, Patrick-directed):
 *      this file briefly shipped a PRO/TEAMS-only opt-in auto-publish toggle (2026-08-22,
 *      S-EXT-AUTOPUBLISH-POLICY) on the theory that no evidence tied Mercari bans to automation
 *      specifically -- that theory did not survive deeper research. Mercari's own Prohibited
 *      Conduct policy explicitly bans "any robot, spambot, spider, crawler, scraper or other
 *      automated means or interface not provided by us," and its Safety Guidelines separately
 *      instruct sellers to never share account access with third-party tools -- Mercari's own
 *      written policy, not an inferred risk, and Mercari has no public seller API to make an
 *      automated final-submit click a sanctioned path. This now matches fas-vinted.js exactly:
 *      hardcoded, no toggle, no PRO/TEAMS gate -- fill the form, leave the final List click to the
 *      organizer, every time.
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
 * Smart Pricing sits next to the price field on the same step. Per Patrick's 2026-08-23
 * decision, the toggle itself is left untouched (Mercari's own default, currently ON) -- but the
 * floor price is always overwritten with a real computed minimum via
 * fillMercariSmartPricingFloor(), same pattern as Facebook's Best Offer minimum (fas-content.js
 * ~line 524) and Grailed's Smart Pricing floor (fas-grailed.js ~line 1129), never left at
 * Mercari's own irrelevant suggested value.
 */
(function () {
  const SELL_URL_HINT = 'https://www.mercari.com/sell/'; // UNVERIFIED -- best-effort guess, not live-confirmed

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH-2, P0, Patrick-directed, live-confirmed root cause):
  // Patrick's real run showed Title/Description/Category/Brand landing fine but Condition/Size/
  // Price/Smart-Pricing-floor ALL failing "selector not found" uniformly, with the page visibly
  // "moving erratically" while it ran -- there is no multi-step wizard gate (confirmed: Patrick's
  // screenshot shows one continuous page, only Save draft/List at the bottom, no Next/Continue).
  // The real cause is almost certainly the same SPA-hydration-timing race already fixed elsewhere
  // in this file for waitForFormReady() -- but this time it's Mercari's OWN async recognition/
  // category-dependent rendering still settling well past this file's short FIXED sleeps (700ms
  // for Brand's suggestion list, 350ms for Size's panel, none at all for Condition/Price/the floor
  // field), which is plausible on a genuinely NEW listing (full image-recognition + category-
  // dependent field mounting) in a way that never showed up testing against an existing DRAFT
  // (already-saved data, nothing left to auto-populate or settle). Rather than guess at a single
  // bigger fixed delay (fragile, still racy), this polls for the element to actually exist,
  // re-querying every 300ms up to maxWaitMs -- same philosophy as waitForFormReady()'s own poll
  // loop just below, applied per-field instead of once at page-open.
  async function waitForSelector(getEl, maxWaitMs) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const el = getEl();
      if (el) return el;
      await sleep(300);
    }
    return null;
  }
  async function humanPause(minMs, maxMs) { await sleep(minMs + Math.random() * (maxMs - minMs)); }
  // BUG FIX 2026-08-20 (S-EXT-BATCH, P0, Patrick-directed): the two stuck drafts this session both
  // showed Mercari's own boilerplate ($14 draft default, "Condition requires an update") -- the
  // fill got cut off before Price/Condition ever landed, and looksLikeInterstitial() correctly
  // caught a REAL verification/security screen at the end of the run (not the earlier, different,
  // already-fixed false-positive class of bug). Burst-filling many fields within milliseconds via
  // bare .click()/dispatchEvent with ZERO pointer/mouse activity is a classic automation
  // fingerprint. Self-contained here (fas-selectors.js is NOT loaded on mercari.com per manifest.json
  // -- only facebook.com paths get it -- so this can't just reuse SEL.realClick; it's the same
  // hover-preamble pattern copied in, not a new technique). Used for every field-value click below
  // instead of a bare .click().
  async function realClick(el) {
    try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) { /* non-fatal */ }
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));
    const rect = el.getBoundingClientRect();
    const cx = Math.round(rect.left + rect.width / 2);
    const cy = Math.round(rect.top + rect.height / 2);
    const base = { bubbles: true, cancelable: true, composed: true, button: 0, view: window, clientX: cx, clientY: cy };
    const pointer = (type, buttons) => new PointerEvent(type, Object.assign({}, base, { pointerId: 1, isPrimary: true, pointerType: 'mouse', buttons: buttons }));
    const mouse = (type, buttons) => new MouseEvent(type, Object.assign({}, base, { buttons: buttons }));
    el.dispatchEvent(pointer('pointerover', 0));
    el.dispatchEvent(pointer('pointerenter', 0));
    el.dispatchEvent(pointer('pointermove', 0));
    el.dispatchEvent(pointer('pointerdown', 1));
    el.dispatchEvent(mouse('mousedown', 1));
    try { if (typeof el.focus === 'function') el.focus(); } catch (e) { /* non-fatal */ }
    el.dispatchEvent(pointer('pointerup', 0));
    el.dispatchEvent(mouse('mouseup', 0));
    el.dispatchEvent(mouse('click', 0));
  }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function bodyText() { return (document.body && document.body.innerText) || ''; }
  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return Array.from(document.querySelectorAll(sel)); }
  function escapeHtml(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // BUG FIX 2026-08-21 (S-EXT-BATCH, P0, live-Chrome-confirmed): the raw iframe[src*="captcha"]
  // etc. selector matched Google reCAPTCHA's own PERSISTENT, NON-BLOCKING badge widget --
  // live-confirmed present on a real Mercari draft-edit page that was otherwise completely normal
  // and fillable (Title/Description/Category/Brand all visibly filled, no actual verification wall
  // shown on screen): title exactly "reCAPTCHA", 256x60px, domain www.google.com -- Google's
  // documented default badge footprint, not an expanded challenge. Mercari (like most sites using
  // reCAPTCHA) embeds this badge on EVERY page with a protected form, at all times, whether or not
  // a real human-verification challenge is active. Treating its mere presence as "Mercari is
  // showing a verification screen" made this check a near-permanent false positive on Mercari's
  // real sell/edit pages -- the most likely actual explanation for repeated "verification screen"
  // warnings and stalled fills that were NOT really Mercari blocking anything. A real, active,
  // must-solve challenge (the expanded image grid / "I'm not a robot" checkbox popup) renders as a
  // much larger iframe (Google's checkbox widget is 304x78; an expanded image-challenge popup is
  // taller still) -- requiring height > 100px excludes the passive 60px badge while still catching
  // a genuine blocking challenge.
  function isBlockingCaptchaIframe(el) {
    return el && el.offsetParent !== null && el.offsetHeight > 100;
  }
  function looksLikeInterstitial() {
    const captchaIframe = q('iframe[src*="captcha" i]') || q('iframe[title*="captcha" i]') || q('iframe[src*="hcaptcha" i]') || q('iframe[src*="recaptcha" i]');
    if (isBlockingCaptchaIframe(captchaIframe)) return true;
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
    // lockout screen. Live-confirmed false positive 2026-08-19: Mercari's real Sell page tripped
    // this exact check on a normal first-load welcome modal ("Why not earn some extra $$$?") with
    // no verification/security screen actually present (Patrick confirmed live, twice -- once on
    // first load, once again mid-fill after photos uploaded). Treat these four as WEAK signals --
    // only count them if looksLikeSellForm() is false, i.e. we're not already
    // on the real fillable form -- a present, fillable form is strong countervailing evidence
    // against a genuine lockout state.
    const weakSignals = ['security check', 'verify your identity', 'two-factor', 'one-time code'];
    if (weakSignals.some((s) => lower.indexOf(s) !== -1) && !looksLikeSellForm()) return true;
    return false;
  }

  // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH-6, P0, live-confirmed via Patrick's own screenshot):
  // clicking Mercari's real "List" button for the first time on an account with no payment method
  // on file pops a distinct modal -- "You're almost done ... Help us keep our marketplace safer by
  // adding a payment method" with an "Add credit / debit card" button -- that is NOT covered by
  // looksLikeInterstitial() (it's not a security/verification wall, it's a payment-setup gate) and
  // does NOT make the Title field or photo input disappear, so waitForMercariPublishConfirmation()
  // just silently timed out and reported a generic "couldn't confirm" -- which is exactly what
  // Patrick saw on his first real auto-publish run. FindA.Sale must NEVER attempt to fill payment/
  // card details itself (hard rule, this file and the project's own tool-use policy both agree) --
  // this only detects the modal so it can be reported honestly and specifically, same
  // report-don't-guess pattern as every other blocker in this file. Text match against the modal's
  // own real copy, live-confirmed from Patrick's screenshot, not guessed.
  function looksLikeNeedsPaymentMethod() {
    const lower = bodyText().toLowerCase();
    return lower.indexOf('adding a payment method') !== -1
      || lower.indexOf('add credit / debit card') !== -1
      || lower.indexOf("you're almost done") !== -1;
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
  function overlayInfo(text) { overlay('<b>FindA.Sale</b><div style="margin-top:6px;font-size:13px;color:#cfe3d6">' + text + '</div>'); }
  function overlayWarn(text) { overlay('<b>FindA.Sale</b><div style="margin-top:6px;font-size:12px;color:#ffcf7a">' + text + '</div>'); }

  // ---- queue-advance countdown (2026-08-31, parity with fas-content.js/fas-craigslist.js's
  // countdown -- Patrick live report: Mercari showed no indication anything was happening between
  // queued items, same gap Craigslist had before its own 2026-08-31 fix). Purely cosmetic --
  // background.js's own humanQueueDelay() pacing pause runs regardless of this; it only reflects
  // that same delay via a one-way 'fasQueueDelayStarted' notification (background.js's
  // advanceMercariQueue handler now passes the real tab id for this -- see that file's own
  // comment for the matching root-cause fix on the sending side).
  let queueDelayInterval = null;
  function clearQueueDelayCountdown() {
    if (queueDelayInterval) { clearInterval(queueDelayInterval); queueDelayInterval = null; }
  }
  function startQueueDelayCountdown(totalMs) {
    clearQueueDelayCountdown();
    const deadline = Date.now() + Math.max(0, Number(totalMs) || 0);
    const renderTick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      overlayInfo('Pacing pause before the next item: ' + remaining + 's (this is normal, not a stall)\u2026');
      if (remaining <= 0) clearQueueDelayCountdown();
    };
    renderTick();
    queueDelayInterval = setInterval(renderTick, 1000);
  }
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'fasQueueDelayStarted' && typeof msg.ms === 'number') {
      startQueueDelayCountdown(msg.ms);
    }
  });
  function button(id, label, primary) {
    return '<button id="' + id + '" style="margin-top:10px;margin-right:8px;padding:7px 12px;border-radius:8px;border:none;cursor:pointer;' +
      'font-weight:600;font-size:13px;background:' + (primary ? '#3c8c5a' : '#3a4842') + ';color:#fff">' + label + '</button>';
  }
  function closeBtnHandler() { const c = document.getElementById('fas-merc-close'); if (c) c.onclick = () => bar && bar.remove(); }

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
        // BUG FIX 2026-08-19 (S-EXT-BATCH-6, P0, live-Chrome-confirmed): CONTROL_SELECTOR's
        // [data-test]/[role=...] alternatives are needed for real non-native pickers, but they can
        // also match an OUTER wrapper div that merely CONTAINS a plain, directly-typeable real
        // input several levels deeper -- confirmed live on Poshmark's Title field: the input sits
        // inside <div data-test="dropdown">...<input placeholder="What are you selling?">...</div>,
        // and querySelector(CONTROL_SELECTOR) returned that OUTER div (matches [data-test], appears
        // first in document order) instead of the real <input> nested inside it. setNativeValue()
        // then silently failed/threw against the div. Always prefer a real input/textarea/select if
        // one exists anywhere inside the candidate node -- it's never wrong to type into the actual
        // form element when one is present -- and only fall back to the broader role/data-test/
        // button match when no real form element exists at all (the genuine custom-picker case).
        const realField = (node.matches && node.matches('input, textarea, select')) ? node : node.querySelector('input, textarea, select');
        const control = realField || ((node.matches && node.matches(CONTROL_SELECTOR)) ? node : node.querySelector(CONTROL_SELECTOR));
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
    // BUG FIX 2026-08-20 (S-EXT-BATCH-11, P0, live-Chrome-confirmed): live DOM inspection of a real
    // Mercari Sell page found clean, real data-testid anchors on the actual fields ("Title", "Brand",
    // "Price" all confirmed live) -- checked FIRST, before the fuzzy label-scan/nearestControlAfter
    // fallback below, because that fallback was confirmed live picking the WRONG element for Price:
    // nearestControlAfter's CONTROL_SELECTOR includes `div[tabindex]`, and Mercari's price
    // RECOMMENDATION SLIDER (a `<div class="PriceSuggest__ThumbWrapper..." tabindex="0"
    // role="slider">`, a totally different widget from the real editable price field) sits close
    // enough to the "Price" heading to win that scan. setNativeValue's native-input-setter.call(el,
    // value) then threw "Illegal invocation" against it (a TypeError: the native HTMLInputElement
    // value setter requires 'this' to actually be a real input, and a slider div isn't one) --
    // exactly the live error Patrick reported. A direct data-testid match is unambiguous and never
    // at risk of grabbing an unrelated nearby widget.
    const byTestid = document.querySelector('input[data-testid="' + labelText + '" i], textarea[data-testid="' + labelText + '" i]');
    if (byTestid) return byTestid;
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
  // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH, P0): made defensive -- mirrors fas-poshmark.js's
  // setNativeValue (S-EXT-POSHMARK-PRICE-ILLEGAL-INVOCATION fix). The native setter can throw
  // "Illegal invocation" against certain elements (confirmed live on Poshmark's Price field,
  // same DOM-shape risk exists here); falls back to plain assignment instead of leaving the
  // field silently unset, and returns whether the value actually stuck so callers can report an
  // honest success/failure instead of assuming success.
  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set;
    let set = false;
    if (setter) {
      try { setter.call(el, value); set = true; } catch (e) {
        console.warn('[FAS Mercari] setNativeValue -- native setter threw (' + (e && e.message) + '), falling back to plain assignment.');
      }
    }
    if (!set) {
      try { el.value = value; set = (el.value === String(value)); } catch (e) {
        console.warn('[FAS Mercari] setNativeValue -- plain assignment also failed:', e && e.message);
      }
    }
    if (!set) console.warn('[FAS Mercari] setNativeValue -- could not set value on element (both native setter and plain assignment failed or did not stick).');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return set;
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
  // BUG FIX 2026-08-19 (S-EXT-BATCH, P1): optionElByText's first-partial-match (used by every
  // OTHER field in this file) picked the first option whose text merely CONTAINS the search
  // string -- confirmed real mismatch: a tracksuit item text-matched to "T-Shirts" among several
  // genuinely different plausible options open at once at a category-picker level. bestScoringOption
  // scores every visible option instead: an exact match always wins; otherwise the option sharing
  // the most whole words with the target wins, with a shorter/tighter label breaking ties (prefers
  // "Sweatshirts & Hoodies" over "Men's Clothing > Sweatshirts & Hoodies > All" when both share the
  // same word count). An option sharing ZERO whole words is not a candidate at all -- no more
  // "prefix substring happened to match" false positives. Used ONLY here, not by
  // fillSelectLike/fillBrand elsewhere in this file (those single-option-family pickers don't have
  // this problem the same way).
  // BUG FIX 2026-08-20 (S-EXT-BATCH-10, P0, live-Chrome-confirmed): flat overlap-count scoring
  // (one point per shared whole word, shorter text breaking ties) live-confirmed picking the WRONG
  // option for a real query: searching "tracksuits & sets" against real Vinted leaves ["Tracksuits",
  // "Sets", ...] scored "Sets" (1 shared word, 4 chars -> 96) HIGHER than "Tracksuits" (1 shared
  // word, 10 chars -> 90) purely because it's shorter -- even though "Tracksuits" is the obviously
  // correct match for an actual tracksuit. The length tie-break was designed for a different case
  // (preferring a concise label over a redundant full-breadcrumb repeat of the SAME match), not for
  // choosing between two genuinely different single-word options. Fixed by weighting each matched
  // word by its POSITION in the query instead of counting matches flatly -- FindA.Sale's category
  // segments consistently put the specific/significant term first and a broader catch-all term after
  // (e.g. "Tracksuits & Sets", "Accessories & More"), so an earlier-word match should outrank a
  // later-word match even when both are single whole-word hits. Length now only nudges a genuine
  // near-tie, never overrides a real position-weighted lead.
  // BUG FIX 2026-08-21 (S-EXT-BATCH, P0, live-Chrome-confirmed): plain .split(' ').filter(Boolean)
  // treats a bare "&" as its own "word" -- live-confirmed this let "Tracksuits & Sets" match
  // "Toys & Collectibles" and "Vintage & collectibles" purely on the shared "&" token, nothing
  // semantically real. wordize() drops any token with no letters or digits at all (so "&", "-",
  // "," alone are excluded) while leaving real hyphenated words like "t-shirts" intact.
  function wordize(s) {
    return s.split(' ').filter((w) => /[a-z0-9]/.test(w));
  }
  function bestScoringOption(options, wantText) {
    const want = norm(wantText);
    const wantWords = wordize(want);
    let best = null;
    let bestScore = -1;
    for (const opt of options) {
      const text = norm(opt.textContent);
      if (!text) continue;
      let score;
      if (text === want) {
        score = 100000;
      } else {
        const textWords = wordize(text);
        let weighted = 0;
        for (let i = 0; i < wantWords.length; i++) {
          if (textWords.indexOf(wantWords[i]) !== -1) weighted += (wantWords.length - i) * 100;
        }
        if (weighted === 0) continue; // no shared whole word -- not a real candidate
        score = weighted - text.length * 0.01; // position-weighted match wins; length only nudges near-ties
      }
      if (score > bestScore) { bestScore = score; best = opt; }
    }
    return best;
  }

  // BUG FIX 2026-08-20 (S-EXT-BATCH-12, Patrick's own hypothesis, live-Chrome-confirmed against
  // the REAL Mercari search box): typed "tracksuits & sets" into Mercari's own Category search --
  // "No results found". Typed "tracksuits" alone into the exact same box -- 2 correct results
  // ("Women > Athletic apparel > Tracksuits" and "Men > Athletic apparel > Tracksuits") appeared
  // immediately. Mercari's own category search is a narrow/literal matcher that chokes on the
  // trailing "& Sets" qualifier (an eBay-taxonomy convention FindA.Sale's leaf names use, not
  // something Mercari's own tree uses), even though the core term is exactly what's needed and
  // exists verbatim in the tree. This generates simplified fallback variants of each search
  // candidate -- so after the full phrase is tried and fails, the code also tries it with any
  // trailing "& ..."/"and ..." qualifier stripped, and finally just its first significant word --
  // instead of only ever trying the literal segment text.
  // BUG FIX 2026-08-27 (Patrick-reported, live): each variant is now tagged `generic: true/false`
  // instead of a bare string -- the LAST variant (a single significant word, e.g. "cables" out of
  // "Microphone Cables") is the one that goes on to cause the "Welding Cables" mispick below (any
  // Mercari category sharing that one generic word scores identically once the query itself is
  // that generic). Tagging it lets bestScoringOptionWithGenderHint require extra confidence only
  // for this specific risky fallback, without changing behavior for the fuller, more specific
  // queries tried first.
  function searchSimplifications(text) {
    const out = [{ text: text, generic: false }];
    const stripped = text.replace(/\s*[&,]\s*.*$/, '').replace(/\s+and\s+.*$/i, '').trim();
    if (stripped && norm(stripped) !== norm(text)) out.push({ text: stripped, generic: false });
    const words = norm(stripped || text).split(' ').filter(Boolean);
    if (words.length > 1 && words[0].length >= 3) out.push({ text: words[0], generic: true });
    return out;
  }
  // breadcrumbText: the original full eBay-taxonomy breadcrumb (colon-delimited, e.g. "...:
  // activewear:tracksuits & Sets") -- still useful for less-specific fallback segments (activewear,
  // men, etc.) if the clean leaf name alone doesn't resolve. categoryText: FindA.Sale's clean leaf
  // category name (post S-EXT-BATCH-12, e.g. "Tracksuits & Sets") -- always tried first, including
  // its simplified variants, since it's normally the most specific and most useful term.
  // BUG FIX 2026-08-29 (S-EXT-MERCARI-CATEGORY-CASCADE, Patrick-reported: "mercari got stuck in
  // category on one of the items", live console showed Category's own "no result matched" warning
  // immediately followed by Brand's own selector-not-found warning AND Smart Pricing floor's own
  // selector-not-found warning on the SAME item -- all three in one run, an item where Smart Pricing
  // floor detection had ALREADY been confirmed working earlier in the SAME run on a different item.
  // Root cause confirmed by direct read of this function: opener.click() (above) opens Mercari's real
  // category-search modal, but BOTH no-match exit paths below (search-input exhausted, and the
  // tree-walk fallback) returned false WITHOUT ever attempting to close it -- unlike fillMercariSize's
  // proven "warn, then find+click a close control, then return false" pattern (~line 803 below), which
  // this file already established for exactly this situation. Left open, Mercari's modal keeps sitting
  // on top of the Sell page, which is the most likely explanation for every field FILLED AFTER Category
  // (Brand, then eventually Price/Smart-Pricing-Floor) also coming up "selector not found" on this same
  // item while the identical selectors worked minutes earlier on a different item in the same run.
  // Whether Mercari's real form ALSO progressively renders Brand/Price only after a category is
  // actually committed (a second, independent possible contributor) cannot be confirmed from static
  // code alone -- that needs live DOM evidence. The diagnostic logging added below (mirroring
  // fas-vinted.js's DIAG leaf-list logging, ~line 602 of that file) now captures that evidence on the
  // next live run: the actual visible category options Mercari offered for the last query tried, and a
  // same-run findable/not-findable snapshot of the Brand and Smart Pricing Floor selectors taken the
  // instant Category gives up -- so the next live failure has a direct answer instead of another guess.
  async function closeCategoryModal() {
    const closeBtn = qa('button, [role="button"], [aria-label]').find((b) => {
      const aria = norm(b.getAttribute('aria-label') || '');
      const t = norm(b.textContent);
      return (aria === 'close' || aria.indexOf('close') !== -1 || t === '\u00d7' || t === 'x') && b.offsetParent !== null;
    });
    if (closeBtn) { await realClick(closeBtn); await sleep(150); return true; }
    return false;
  }
  // ================================================================================================
  // 2026-10-05 (S-EXT-MERCARI-CATEGORY-MAP): FindA.Sale's backend now resolves each item to a REAL Mercari
  // category (packages/backend/src/config/mercariCategoryMap.ts + services/mercariCategoryResolver.ts) and
  // ships it on the item as mercariCategoryId / mercariCategoryPath / mercariCategorySource. Root cause this
  // fixes: pickCategory() below only ever had eBay's free-text category to fuzzy-search Mercari's picker with,
  // so a youth baseball glove could land in a generic category instead of Sports & outdoors > Baseball
  // Equipment > Baseball Gloves & Mitts. When item.mercariCategoryPath is present this path runs FIRST: it
  // types the exact leaf title into Mercari's own "Search category" box and clicks ONLY the result row whose
  // breadcrumb ("Women > Athletic apparel > Tracksuits") matches the mapped path. Any miss, ambiguity or
  // error closes the modal, returns false, and the existing search logic below runs completely unchanged.
  // UNVERIFIED against the live picker beyond what the older comments in this file already recorded (rows
  // are role-less buttons showing the full breadcrumb; the Category control shows the committed value).
  // ================================================================================================
  function mercariMappedPathParts(item) {
    return String((item && item.mercariCategoryPath) || '').split('>').map((x) => x.trim()).filter(Boolean);
  }
  // Returns a function(options) -> { el, matches, distinct }. A row qualifies only when it SHOWS a breadcrumb
  // ("A > B > C") whose last segment is exactly our leaf title, whose parent segment equals our parent, and
  // (for a 3-level path) whose first segment equals our family. Rows with no breadcrumb are never trusted
  // (a bare "Other" or "Home decor" exists under several parents). Exactly one distinct row must qualify.
  function mercariMappedRowChooser(parts) {
    const want = parts.map(norm);
    const leafN = want[want.length - 1];
    const parentN = want.length > 1 ? want[want.length - 2] : '';
    const rootN = want.length > 2 ? want[0] : '';
    return function (options) {
      const pool = options.filter((o) => String(o.className || '').indexOf('CategoryDialog') !== -1);
      const rows = pool.length ? pool : options;
      const hits = [];
      for (const el of rows) {
        const text = norm(el.textContent);
        if (!text || text.length > 200 || text.indexOf('>') === -1) continue;
        const segs = text.split('>').map((x) => x.trim()).filter(Boolean);
        if (segs.length < 2 || segs[segs.length - 1] !== leafN) continue;
        if (parentN && segs[segs.length - 2] !== parentN) continue;
        if (rootN && segs[0] !== rootN) continue;
        hits.push({ el: el, text: segs.join(' > ') });
      }
      const distinct = [];
      hits.forEach((h) => { if (distinct.indexOf(h.text) === -1) distinct.push(h.text); });
      return { el: distinct.length === 1 ? hits[0].el : null, matches: hits.length, distinct: distinct.length };
    };
  }
  function mercariCategorySearchInput() {
    return document.querySelector('input[placeholder="Search category" i]')
      || qa('input[type="text"], input:not([type])').find((el) => {
        const ph = norm(el.getAttribute('placeholder') || '');
        return ph.indexOf('search') !== -1 && ph.indexOf('categor') !== -1;
      }) || null;
  }
  // Text of the Category control (and its immediate wrapper) as shown right now, for the landed check.
  function mercariCategoryControlTexts(opener) {
    const out = [];
    const el = (opener && opener.isConnected) ? opener : openerByLabel('Category');
    if (el) {
      out.push(norm(el.textContent));
      const par = el.parentElement;
      if (par) { const pt = norm(par.textContent); if (pt.length < 240) out.push(pt); }
    }
    return out;
  }
  async function pickMappedMercariCategory(item) {
    const parts = mercariMappedPathParts(item);
    if (parts.length < 2) return false;
    const leaf = parts[parts.length - 1];
    const leafN = norm(leaf);
    const outcome = { id: item.mercariCategoryId || null, path: item.mercariCategoryPath, source: item.mercariCategorySource || null, result: 'unknown', query: null, at: Date.now() };
    const persist = () => { try { chrome.storage.local.set({ fasMercariLastCategoryMap: outcome }); } catch (e) { /* best-effort diagnostic */ } };
    console.log('[FAS Mercari] Category mapped by FindA.Sale: id ' + outcome.id + ' (' + outcome.source + ') "' + item.mercariCategoryPath + '" -- searching the picker for "' + leaf + '".');
    const giveUp = async (result, why) => {
      outcome.result = result;
      persist();
      console.warn('[FAS Mercari] Mapped category "' + leaf + '" not selected (' + why + ') -- falling back to the search logic.');
      await closeCategoryModal();
      return false;
    };
    try {
      const opener = openerByLabel('Category');
      if (!opener) { outcome.result = 'no-opener'; persist(); return false; }
      const before = JSON.stringify(mercariCategoryControlTexts(opener));
      opener.click();
      await sleep(400);
      const searchInput = mercariCategorySearchInput();
      if (!searchInput) return await giveUp('no-search-input', 'no "Search category" input in the picker');
      const chooser = mercariMappedRowChooser(parts);
      // Exact leaf title first. Mercari's own search is literal and chokes on "&" (live-confirmed earlier in
      // this file), so a title containing "&" or "," is retried once with that tail cut off; the row match above
      // stays exact either way, so the retry cannot widen what gets clicked.
      const queries = [leaf];
      const stripped = leaf.replace(/\s*[&,]\s*.*$/, '').trim();
      if (stripped && norm(stripped) !== leafN) queries.push(stripped);
      let last = { el: null, matches: 0, distinct: 0 };
      let row = null;
      for (const query of queries) {
        searchInput.focus();
        setNativeValue(searchInput, query);
        outcome.query = query;
        await sleep(700); // let Mercari's own search debounce/results settle
        row = await waitForSelector(() => {
          last = chooser(qa('[role="option"], li[role="option"], [role="menuitem"], [role="menuitemradio"], li, button'));
          return last.el;
        }, 2400);
        if (row) break;
      }
      if (!row) {
        return await giveUp(last.distinct > 1 ? 'ambiguous' : 'no-match', last.distinct > 1 ? last.distinct + ' different rows match the mapped path' : 'no result row shows the mapped breadcrumb');
      }
      await realClick(row);
      await sleep(300);
      // Same confirm / close sequence as the search branch of pickCategory below, including the exclusion of
      // Mercari's real page-level actions (a stray "Save draft" click once redirected the whole run).
      const MERCARI_REAL_PAGE_ACTIONS = ['save draft', 'save & continue', 'list', 'list this item', 'publish', 'save and continue'];
      const confirmBtn = qa('button, [role="button"]').find((b) => {
        const t = norm(b.textContent);
        if (MERCARI_REAL_PAGE_ACTIONS.indexOf(t) !== -1) return false;
        return t.length > 0 && t.length < 30 && /\b(apply|done|select|confirm)\b/.test(t);
      });
      if (confirmBtn) { await realClick(confirmBtn); await sleep(250); }
      await closeCategoryModal();
      await sleep(300);
      const texts = mercariCategoryControlTexts(opener);
      outcome.shown = (texts[0] || '').slice(0, 120);
      const landed = texts.some((t) => t.indexOf(leafN) !== -1);
      if (landed) {
        outcome.result = 'selected';
        persist();
        console.log('[FAS Mercari] Category mapped and confirmed: control shows "' + outcome.shown + '".');
        return true;
      }
      if (mercariCategorySearchInput()) return await giveUp('modal-still-open', 'the picker is still open after the click');
      if (JSON.stringify(texts) === before) return await giveUp('did-not-stick', 'the Category control did not change');
      // The control changed but does not spell the leaf title (Mercari may truncate or reformat the value).
      // The row we clicked matched the mapped breadcrumb exactly, so keep it and record the mismatch.
      outcome.result = 'selected-format-mismatch';
      persist();
      console.warn('[FAS Mercari] Mapped category selected; Category control shows "' + outcome.shown + '" which does not contain "' + leafN + '" (value format differs from expectation -- keeping the selection).');
      return true;
    } catch (e) {
      console.warn('[FAS Mercari] Mapped category attempt threw -- falling back to the search logic:', e && e.message);
      outcome.result = 'error';
      persist();
      try { await closeCategoryModal(); } catch (e2) { /* non-fatal */ }
      return false;
    }
  }

  async function pickCategory(categoryText, breadcrumbText, item) {
    // 2026-10-05 (S-EXT-MERCARI-CATEGORY-MAP): FindA.Sale's own mapped Mercari category goes first (absent
    // item.mercariCategoryPath = this block never runs). It runs even when categoryText is empty (the item may
    // have no eBay category but still resolve from its title). On any miss it returns false and everything
    // below runs exactly as before.
    if (item && item.mercariCategoryPath) {
      try {
        if (await pickMappedMercariCategory(item)) return true;
      } catch (e) {
        console.warn('[FAS Mercari] Mapped category error, using the search logic instead:', e && e.message);
      }
      // When the call site passed the mapped path itself as the text (item had no eBay category), turn
      // "A > B > C" into the "A:B:C" shape the segment logic below expects.
      if (categoryText && categoryText === item.mercariCategoryPath) {
        categoryText = String(categoryText).split('>').map((x) => x.trim()).filter(Boolean).join(':');
      }
    }
    if (!categoryText) return false;
    const opener = openerByLabel('Category');
    if (!opener) return false;
    opener.click();
    await sleep(400);
    const segments = (breadcrumbText || categoryText).split(':').map((s) => s.trim()).filter(Boolean);
    // BUG FIX 2026-08-19 (S-EXT-BATCH-3, P0): live-confirmed real UI (Patrick's screenshot) is a
    // searchable drill-down modal with its OWN "Search category" text input at the top -- far more
    // reliable to type into Mercari's own search and let ITS matching engine surface the right
    // leaf category than to keep re-implementing taxonomy matching blind against an unknown, deep
    // real tree (the S-EXT-BATCH-2 segmented tree-walk below still landed on the wrong "Men > Tops
    // > T-shirts" pick even after that fix, confirming the tree-walk approach itself, not just the
    // scoring, was the wrong strategy for this UI). Tries the search path FIRST, most-specific
    // segment first (most likely to surface the correct leaf directly), falling back to less
    // specific segments and finally the old tree-walk only if no search input exists at all.
    const searchInput = document.querySelector('input[placeholder="Search category" i]')
      || qa('input[type="text"], input:not([type])').find((el) => {
        const ph = norm(el.getAttribute('placeholder') || '');
        return ph.indexOf('search') !== -1 && ph.indexOf('categor') !== -1;
      });
    // BUG FIX 2026-08-20 (S-EXT-BATCH-12, live-Chrome-confirmed): simplifying "Tracksuits & Sets"
    // down to just "Tracksuits" (above) surfaces Mercari's real search results, but that search
    // reliably returns BOTH a "Women > Athletic apparel > Tracksuits" AND a "Men > Athletic
    // apparel > Tracksuits" result tied on the exact same score (both share the one word
    // "tracksuits", nothing in the query itself says which gender) -- without a tiebreaker,
    // bestScoringOption keeps whichever came first in DOM order, silently picking the wrong
    // gender for roughly half of all items. genderHint is pulled from the breadcrumb's own "men"/
    // "women" segment (present as its own standalone segment on every eBay-taxonomy-style
    // breadcrumb this file receives) and used ONLY to break ties between otherwise-equal options
    // in this search-results list -- it never invents a match on its own.
    const genderHint = segments.map(norm).find((s) => s === 'men' || s === 'women' || s === "men's" || s === "women's") || null;
    // BUG FIX 2026-08-27: full-context words (leaf category text + every breadcrumb segment),
    // deduped -- used ONLY for scoring/disambiguation in bestScoringOptionWithGenderHint above,
    // never for what actually gets typed into Mercari's own search box (that stays the possibly-
    // simplified `query`). Keeps disambiguation anchored to the item's real department even after
    // the typed query itself has been stripped down to a single generic word.
    const contextWords = Array.from(new Set(
      [categoryText].concat(segments).reduce((acc, seg) => acc.concat(wordize(norm(seg || ''))), [])
    ));
    // BUG FIX 2026-08-21 (S-EXT-BATCH, P0, live-Chrome-confirmed): SAME "&"-as-a-word bug as
    // bestScoringOption above, confirmed live on THIS function specifically -- searching literally
    // "Tracksuits & Sets" (the untouched full leaf name, tried first before the stripped "Tracksuits"
    // fallback ever runs) returns Mercari's own irrelevant top-level browse categories (Toys &
    // Collectibles, Books, Electronics -- Mercari's search chokes on "&" and falls back to a browse
    // list), and scoring that garbage list against a query still containing "&" scored "Vintage &
    // collectibles" as a false match purely on the shared "&" token -- getting clicked and
    // returning success before the correctly-working "Tracksuits" fallback query ever got a turn.
    // Uses the same wordize() helper (dropping punctuation-only tokens) as bestScoringOption.
    // BUG FIX 2026-08-27 (P0, Patrick-reported live): a real "Professional Low Noise Microphone
    // Cable 6ft XLR" item landed in Mercari's "Welding Cables" category. Root cause confirmed via
    // direct read of this function: once a query got simplified all the way down to one generic
    // word (e.g. "cables" out of "Microphone Cables" -- see searchSimplifications), scoring was
    // done against that SAME single-word query, so any Mercari category sharing that one word
    // scored identically -- nothing anchored the pick back to the item's real department. Two
    // changes: (1) scoring now always uses `contextWords` -- built by the caller from the FULL,
    // un-simplified categoryText + breadcrumb segments -- instead of just the current query's own
    // words, so a fuller-context word (e.g. "microphone", "audio") still counts even when the
    // typed query itself was generic. (2) `strictGenericMatch` (true only for the risky last-resort
    // single-word query) requires the winning option to share at least one MORE context word beyond
    // the single generic one before it's trusted -- "Welding Cables" shares only "cables" with the
    // full context and is now rejected (returns null) instead of silently clicked; pickCategory's
    // existing "no result matched" warning path handles it from there, same report-don't-guess
    // discipline already used for Size.
    function bestScoringOptionWithGenderHint(options, wantText, contextWords, strictGenericMatch) {
      const want = norm(wantText);
      const scoringWords = (contextWords && contextWords.length) ? contextWords : wordize(want);
      let best = null, bestScore = -1, bestMatchedContextCount = 0;
      for (const opt of options) {
        const text = norm(opt.textContent);
        if (!text) continue;
        let score;
        if (text === want) {
          score = 100000;
        } else {
          const textWords = wordize(text);
          let weighted = 0;
          for (let i = 0; i < scoringWords.length; i++) {
            if (textWords.indexOf(scoringWords[i]) !== -1) weighted += (scoringWords.length - i) * 100;
          }
          if (weighted === 0) continue;
          score = weighted - text.length * 0.01;
        }
        if (genderHint && wordize(text).indexOf(genderHint.replace(/'s$/, '')) !== -1) score += 5000; // tiebreak only -- smaller than any real word-match delta
        if (score > bestScore) {
          bestScore = score;
          best = opt;
          bestMatchedContextCount = contextWords ? wordize(text).filter((w) => contextWords.indexOf(w) !== -1).length : scoringWords.length;
        }
      }
      if (best && strictGenericMatch && contextWords && contextWords.length > 1 && bestMatchedContextCount <= 1) {
        return null; // shares only the one generic fallback word -- not confident enough, report instead of guess
      }
      return best;
    }
    if (searchInput) {
      // categoryText (the clean leaf name) tried FIRST -- including its simplified variants --
      // before falling back to less-specific breadcrumb segments. Deduped so the same query text
      // is never typed twice.
      const rawCandidates = [categoryText, ...segments.slice().reverse()];
      const searchCandidates = [];
      const seen = new Set();
      for (const c of rawCandidates) {
        for (const variant of searchSimplifications(c)) {
          const key = norm(variant.text);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          searchCandidates.push(variant);
        }
      }
      for (const candidate of searchCandidates) {
        const query = candidate.text;
        searchInput.focus();
        setNativeValue(searchInput, query);
        await sleep(600); // let Mercari's own search debounce/results settle
        // BUG FIX 2026-08-20 (S-EXT-BATCH-12, P0, live-Chrome-confirmed): Mercari's real category
        // search results are plain <button class="...CategoryDialog__ButtonWrapper"> rows with NO
        // role attribute at all -- confirmed by inspecting the actual DOM nodes for "Women >
        // Athletic apparel > Tracksuits" / "Men > Athletic apparel > Tracksuits" after a real
        // search. `button` was missing from this selector, so this scan could never have found a
        // real search result on this platform -- every prior "search input found but no result
        // matched any segment" warning was, at least in part, this gap, not (only) a scoring miss.
        // Safe to add broadly: bestScoringOptionWithGenderHint already requires a real shared word
        // before a button is even considered a candidate, so unrelated buttons ("Cancel", "×",
        // etc.) can't accidentally win.
        const options = qa('[role="option"], li[role="option"], [role="menuitem"], [role="menuitemradio"], li, button');
        const opt = bestScoringOptionWithGenderHint(options, query, contextWords, candidate.generic);
        if (opt) {
          await realClick(opt);
          await sleep(300);
          // BUG FIX 2026-08-19 (S-EXT-BATCH-4, P0): Patrick's own live screenshot showed the search
          // modal still open AFTER a correct pick landed (breadcrumb read "Selected: Men > Tops >
          // T-shirts" with the full top-level category list still showing underneath) -- reported as
          // "Mercari is stuck further into picking categories". The old confirm-button match required
          // the button's ENTIRE normalized text to equal exactly one of apply/done/select/confirm/save
          // -- any real button phrased as e.g. "Save category" or "Done selecting", or with icon
          // alt-text bundled in, would silently miss and leave the modal open with no further attempt.
          // Switched to a substring match (still scoped to short, button-sized text so it can't grab
          // an unrelated page element), and added a fallback close-button pass if no confirm control
          // is found at all -- the pick itself already succeeded (opt.click() above), so the modal
          // should be dismissed one way or another rather than left blocking the rest of the fill.
          // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH-3, P0, live-confirmed root cause of the
          // redirect Patrick reported): this qa() sweep is PAGE-WIDE, not scoped to the category
          // picker itself -- and the real Mercari sell page has a permanent, always-present "Save
          // draft" button at the bottom (confirmed in Patrick's own screenshot). "Save draft"
          // matches \bsave\b in the regex below, so once the picker closed on its own (no real
          // confirm button existed to find), this code fell through to clicking Mercari's ACTUAL
          // page-level Save Draft button -- on a listing still missing Size/Color/Condition/Price
          // at that point in the fill sequence -- which is exactly why Mercari redirected to
          // /mypage/listings/draft/action-required/ (an incomplete draft that needs action) and
          // every field after Category/Brand then failed with "selector not found": the extension
          // was no longer running against the Sell page at all. Explicitly excludes every known
          // real page-level submit/save action by exact text so this can never fire the actual
          // form's own buttons again, no matter what wording a genuine picker-confirm button uses.
          const MERCARI_REAL_PAGE_ACTIONS = ['save draft', 'save & continue', 'list', 'list this item', 'publish', 'save and continue'];
          let confirmBtn = qa('button, [role="button"]').find((b) => {
            const t = norm(b.textContent);
            if (MERCARI_REAL_PAGE_ACTIONS.indexOf(t) !== -1) return false;
            return t.length > 0 && t.length < 30 && /\b(apply|done|select|confirm)\b/.test(t);
          });
          if (confirmBtn) {
            await realClick(confirmBtn);
            await sleep(250);
          } else {
            // No explicit confirm control -- try dismissing via an "x"/close control so the modal
            // doesn't sit open and block whatever field the extension tries to fill next.
            const closeBtn = qa('button, [role="button"], [aria-label]').find((b) => {
              const aria = norm(b.getAttribute('aria-label') || '');
              const t = norm(b.textContent);
              return (aria === 'close' || aria.indexOf('close') !== -1 || t === '×' || t === 'x') && b.offsetParent !== null;
            });
            if (closeBtn) { await realClick(closeBtn); await sleep(200); }
          }
          // BUG FIX 2026-08-29 (round 14, S-EXT-MERCARI-MODAL-STAYS-OPEN-ON-SUCCESS, Patrick-directed,
          // live-screenshot-confirmed): a real live screenshot showed Mercari's own Category modal
          // still visibly open ON TOP of the page immediately after a category value was successfully
          // committed (the real Category field behind the modal already read "Other > Musical
          // instrume..." -- the value WAS written, the modal just never closed). The modal-close call
          // added by the earlier S-EXT-MERCARI-CATEGORY-CASCADE fix (~line 474 area) only ever ran on
          // the NO-MATCH/give-up exit paths, never here on the success path. Whether Mercari's own
          // confirm-button click above is SUPPOSED to auto-close the modal and simply doesn't for a
          // fallback/generic leaf pick, or never auto-closes at all, isn't confirmable from static
          // code alone -- this explicit close is a safe, defensive addition either way:
          // closeCategoryModal() is itself a no-op (returns false, changes nothing) if no close
          // control is found, i.e. if the modal had already closed on its own.
          await closeCategoryModal();
          return true;
        }
      }
      console.warn('[FAS Mercari] Category "' + categoryText + '" -- search input found but no result matched any segment (UNVERIFIED taxonomy) -- left for the organizer to choose.');
      // DIAGNOSTIC (S-EXT-MERCARI-CATEGORY-CASCADE): capture what Mercari's own search actually
      // returned for the LAST attempted query, and whether Brand/Smart-Pricing-Floor are findable in
      // the DOM right now, BEFORE closing the modal -- direct live evidence for whichever hypothesis
      // (blocked-by-open-modal vs. progressively-rendered-post-category) is actually true, without
      // needing a separate live debugging pass next time this happens.
      const lastQuery = searchCandidates.length ? searchCandidates[searchCandidates.length - 1].text : categoryText;
      const lastOptionsSeen = qa('[role="option"], li[role="option"], [role="menuitem"], [role="menuitemradio"], li, button')
        .map((o) => norm(o.textContent)).filter(Boolean).slice(0, 20);
      console.log('[FAS Mercari DIAG] Category: last query="' + lastQuery + '" visible options=' + JSON.stringify(lastOptionsSeen));
      console.log('[FAS Mercari DIAG] Category: Brand findable=' + !!fieldByLabel('Brand') + ' SmartPricingFloor findable=' + !!(document.querySelector('input#sellMinPriceForAutoPriceDrop[name="sellMinPriceForAutoPriceDrop"][data-testid="SmartPricingFloorPrice"]') || fieldByLabel('Smart Pricing Floor Price') || fieldByLabel('Floor Price')));
      await closeCategoryModal();
      return false;
    }
    // Fallback: segmented tree-walk (S-EXT-BATCH-2 logic, unchanged), in case a different Mercari
    // listing flow variant has no search input. categoryText is FindA.Sale's eBay-taxonomy-style
    // colon-delimited path (e.g. "Clothing, Shoes & Accessories:men:men's Clothing:activewear:
    // tracksuits & Sets"), NOT a single flat string -- splits on ':' into ordered general->specific
    // segments and, level by level, scans forward through not-yet-consumed segments for the first
    // one that scores a real match against the options open at that level.
    let segmentPointer = 0;
    let pickedAny = false;
    for (let level = 0; level < 4 && segmentPointer < segments.length; level++) {
      await sleep(250);
      // S-EXT-BATCH-12: same `button` addition as the search-results scan above -- this tree-walk
      // fallback shares the same real-DOM gap.
      const options = qa('[role="option"], li[role="option"], [role="menuitem"], [role="menuitemradio"], li, button');
      let matched = false;
      for (let i = segmentPointer; i < segments.length; i++) {
        const opt = bestScoringOption(options, segments[i]);
        if (opt) {
          await realClick(opt);
          pickedAny = true;
          matched = true;
          segmentPointer = i + 1;
          await sleep(300);
          break;
        }
      }
      if (!matched) break;
    }
    if (!pickedAny) {
      console.warn('[FAS Mercari] Category "' + categoryText + '" -- no level matched in the picker (UNVERIFIED taxonomy) -- left for the organizer to choose.');
    }
    // BUG FIX 2026-08-29 (round 14, S-EXT-MERCARI-MODAL-STAYS-OPEN-ON-SUCCESS): close the modal on
    // BOTH the success (pickedAny true) and no-match (pickedAny false) exit paths -- see the
    // identical fix in the search-input branch above for the full incident writeup. Defensive/no-op
    // via closeCategoryModal() if the modal already closed on its own.
    await closeCategoryModal();
    return pickedAny;
  }

  // Brand: category-aware autocomplete -- Mercari's own brand list changes based on the selected
  // category, so this must run AFTER pickCategory (enforced by call order in fillListing below).
  // BUG FIX 2026-08-29 (round 13, S-EXT-MERCARI-BRAND-TIMING, Patrick-directed root cause): this
  // file's own header comment (~line 55-56) already flagged "700ms for Brand's suggestion list" as
  // an UNVERIFIED fixed-sleep guess and a known risk -- the exact same class of bug already found
  // and fixed on fas-poshmark.js's Brand autocomplete (S-EXT-POSHMARK-BRAND-TIMING, round 7): a
  // fixed sleep(700) then a single synchronous optionElByText() check races Mercari's real
  // suggestion-list render latency, which is category-dependent and not guaranteed to settle inside
  // 700ms. Patrick reported an intermittent "missed the brand" live symptom -- "occasionally," which
  // is the exact signature of a race losing sometimes rather than a selector being wrong every time.
  // Fix: poll for the suggestion to actually appear (same waitForOptionByText idiom already proven
  // on Poshmark, fas-poshmark.js ~line 680) instead of one fixed sleep then a single check.
  async function waitForOptionByText(value, maxWaitMs) {
    const start = Date.now();
    while (true) {
      const match = optionElByText(value);
      if (match) return match;
      if (Date.now() - start >= maxWaitMs) return null;
      await sleep(180);
    }
  }
  async function waitForAnyOptionByText(variants, maxWaitMs) {
    const start = Date.now();
    while (true) {
      for (const v of variants) {
        const match = optionElByText(v);
        if (match) return match;
      }
      if (Date.now() - start >= maxWaitMs) return null;
      await sleep(180);
    }
  }
  // BUG FIX 2026-08-29 (round 14, S-EXT-MERCARI-BRAND-SUGGESTED-CHIPS, Patrick-directed,
  // live-screenshot-confirmed): a real live screenshot of a stuck listing (Mugig guitar cable)
  // showed the Brand field empty and red-outlined with Mercari's own "Please select a brand"
  // validation error, and directly beneath it a "Suggested brands:" chip row (Fender, Korg,
  // Buckle-Down, D'Addario, Livewire, Dunlop, and critically a "No brand / Not sure" chip) that
  // this file never looked at -- fillBrand()/fillMercariNoBrand() only ever tried the typed-
  // autocomplete list (waitForOptionByText/waitForAnyOptionByText) and gave up when that came up
  // empty, even though a real, honest fallback option was sitting right there in the DOM. Mirrors
  // this session's Vinted equivalent fix (verified working live): try a real suggested chip
  // matching the item's actual brand text first, then fall back to the honest "No brand / Not
  // sure" chip rather than leaving the field red and blocking submission.
  // No live DOM access this dispatch to confirm the chip row's exact markup (Mercari's own
  // "Suggested brands" row is NOT a dropdown/modal panel the way Category's picker is -- it reads
  // in the screenshot as small pill/button elements sitting directly in the page flow below the
  // Brand field) -- best-effort, defensive selector: look for a "Suggested brand" heading first
  // and scope to its container when found, otherwise fall back to a page-wide scan; either way,
  // only short/pill-length visible-text elements are considered candidates so this can't grab an
  // unrelated paragraph or the page's other buttons. On a miss, logs exactly what WAS found near
  // the Brand field so the next live console capture can nail the real selector instead of another
  // guess.
  // BUG FIX 2026-08-30 round 2 (P0, Patrick-caught the first attempt completely missed the row --
  // live DOM inspection via javascript_tool against Patrick's real open Mercari tab, not a guess).
  // Root cause of the miss: the heading text is literally "Suggested brands:" (with a colon, exact),
  // and the chip row is NOT a sibling of the heading itself -- it's the heading's PARENT's THIRD
  // child (`div[class*="ChipGroupWrapper"]`), one level further out than the old code searched.
  // Confirmed live each chip carries its own stable `data-testid`: real suggestions are
  // `SuggestedBrand-<Name>` (e.g. "SuggestedBrand-Fender") and the honest opt-out is literally
  // `data-testid="NoBrandLink"` -- exact, stable selectors, no fuzzy text matching needed at all.
  // CRITICAL second finding: each chip DIV is a wrapper around a real `<input type="checkbox">` --
  // dispatching a full realClick() pointer-event sequence on the WRAPPER div did NOT register
  // (live-confirmed, tried first) -- only a plain `.click()` on the INNER `<input>` actually checks
  // it and updates the Brand field. Live-confirmed end to end: clicking NoBrandLink's inner input
  // changed the real Brand field's value to "No brand / Not sure" and cleared Mercari's own
  // validation error.
  function findMercariSuggestedBrandChips() {
    const heading = qa('div, span, p, h1, h2, h3, h4, h5, legend').find((el) => el.children.length === 0 && norm(el.textContent) === 'suggested brands:');
    const container = heading ? heading.parentElement : null;
    const chipGroup = container ? container.querySelector('[class*="ChipGroupWrapper" i]') : null;
    if (!chipGroup) return [];
    return Array.from(chipGroup.children).filter((el) => el.offsetParent !== null);
  }
  async function clickMercariBrandChip(chip) {
    const input = chip.querySelector('input');
    (input || chip).click();
    await sleep(300);
  }
  async function fillMercariBrandFromSuggestedChip(value) {
    const chips = findMercariSuggestedBrandChips();
    if (!chips.length) {
      const nearby = qa('div, span, p').filter((el) => el.offsetParent !== null && norm(el.textContent).length > 0 && norm(el.textContent).length < 60)
        .slice(0, 15).map((el) => norm(el.textContent));
      console.warn('[FAS Mercari DIAG] Brand -- no suggested-brand chip row found near the field (UNVERIFIED selector). Nearby short text on page: ' + JSON.stringify(nearby));
      return false;
    }
    if (value) {
      const want = norm(value);
      const match = chips.find((c) => (c.getAttribute('data-testid') || '').toLowerCase() === ('suggestedbrand-' + want).replace(/\s+/g, '-'))
        || chips.find((c) => norm(c.textContent) === want);
      if (match) { await clickMercariBrandChip(match); return true; }
    }
    const noBrandChip = chips.find((c) => c.getAttribute('data-testid') === 'NoBrandLink') || chips.find((c) => /no brand|not sure/i.test(norm(c.textContent)));
    if (noBrandChip) { await clickMercariBrandChip(noBrandChip); return true; }
    console.warn('[FAS Mercari DIAG] Brand -- suggested-brand chip row found (' + chips.length + ' chips: ' + JSON.stringify(chips.map((c) => norm(c.textContent))) + ') but neither the item\'s brand nor a "No brand/Not sure" chip matched.');
    return false;
  }
  async function fillBrand(labelText, value) {
    const el = fieldByLabel(labelText);
    if (!el) return false;
    el.focus();
    setNativeValue(el, String(value));
    const match = await waitForOptionByText(value, 2500);
    if (match) { await realClick(match); await sleep(200); return true; }
    const chipMatch = await fillMercariBrandFromSuggestedChip(value);
    if (chipMatch) return true;
    console.warn('[FAS Mercari] Brand "' + value + '" had no matching suggestion (UNVERIFIED, category-dependent list) -- left unset.');
    return false;
  }

  // BUG FIX 2026-08-27 (P0, Patrick-reported live): when item.brand is empty (generic/unbranded
  // items, e.g. a plain XLR cable), guardedFill('Brand', item.brand, ...) never even called
  // fillBrand() at all -- tryFill() silently no-ops on an empty value -- so nothing ever selected
  // Mercari's real "No Brand/Not sure" brand option and the field was left completely untouched.
  // Confirmed via public research that this option exists on Mercari's real sell form. This opens
  // the Brand field the same way fillBrand() does and looks for that option; if the plain list
  // doesn't surface it, tries typing "no" (a safe, non-guessed prefix, never a real brand name) to
  // narrow the suggestion list before giving up. UNVERIFIED selector/option wording -- no live
  // Mercari seller account to confirm this session, same caveat as the rest of this file.
  const MERCARI_NO_BRAND_VARIANTS = ['no brand/not sure', 'no brand / not sure', 'no brand', 'not sure'];
  // BUG FIX 2026-08-29 (round 13, same S-EXT-MERCARI-BRAND-TIMING root cause as fillBrand above):
  // both fixed sleeps here (400ms before checking the un-typed default list, 700ms after typing
  // "no") have the identical race against Mercari's real suggestion-list render latency. Replaced
  // with waitForAnyOptionByText polls; behavior is otherwise unchanged (try the un-typed list
  // first, then type "no" and retry).
  async function fillMercariNoBrand(labelText) {
    const el = fieldByLabel(labelText);
    if (!el) return false;
    await realClick(el);
    try { el.focus(); } catch (e) { /* non-fatal */ }
    let match = await waitForAnyOptionByText(MERCARI_NO_BRAND_VARIANTS, 2000);
    if (match) { await realClick(match); await sleep(200); return true; }
    setNativeValue(el, 'no');
    match = await waitForAnyOptionByText(MERCARI_NO_BRAND_VARIANTS, 2000);
    if (match) { await realClick(match); await sleep(200); return true; }
    // BUG FIX 2026-08-29 (round 14, S-EXT-MERCARI-BRAND-SUGGESTED-CHIPS): before giving up, try the
    // same "Suggested brands:" chip row's own "No brand / Not sure" chip -- see
    // fillMercariBrandFromSuggestedChip()'s comment for the live-screenshot evidence this chip
    // reliably exists once Category is set, independent of the typed-autocomplete list checked
    // above.
    const chipMatch = await fillMercariBrandFromSuggestedChip(null);
    if (chipMatch) return true;
    console.warn('[FAS Mercari] No brand set on this item and no "No Brand/Not sure" option found in the suggestion list (UNVERIFIED) -- left unset.');
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
    await realClick(opener);
    await sleep(350);
    const opt = optionElByText(value);
    if (!opt) return false;
    await realClick(opt);
    await sleep(200);
    return true;
  }

  // Size -- BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH, P0, live-Chrome-confirmed 2026-08-22): NEVER
  // IMPLEMENTED before this fix (no "fillMercariSize"/"itemSizeId" reference existed anywhere in
  // this file; the fillListing() call below previously routed Size through the generic
  // fillSelectLike(), which never targeted the real element and never actually filled it). Real
  // live-confirmed element: `div#itemSizeId[data-testid="Size"]` -- a custom combobox OPENER (not
  // a real <input>), same "click opener -> panel opens -> click matching option" shape already
  // used successfully for Category/Brand above. Exact-match ONLY (never falls back to
  // bestScoringOption's fuzzy word-scoring the way Category does) -- same "report, don't guess"
  // discipline established for Poshmark's Size field (a wrong physical size risks a real buyer
  // return): no confident match leaves the field unset rather than picking a nearest guess.
  // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH-4, P0, live-console-confirmed root cause): Patrick's
  // real item stores size as the FULL WORD "Medium" -- Mercari's real options are abbreviated
  // codes ("M", "S", "L", "XL"...). Exact-match-only against the raw value could never match
  // "medium" to "m", so this always reported "no exact match" regardless of the click-commit
  // question below. Maps common full-word/abbreviation variants to Mercari's own letter codes
  // FIRST, still using exact-match only afterward (never fuzzy word-scoring) -- same "report,
  // don't guess" discipline, just normalizing the INPUT instead of loosening the match.
  const MERCARI_SIZE_SYNONYMS = {
    'xx-small': 'XXS', 'extra extra small': 'XXS', 'xxsmall': 'XXS', 'xxs': 'XXS',
    'x-small': 'XS', 'extra small': 'XS', 'xsmall': 'XS', 'xs': 'XS',
    'small': 'S', 'sm': 'S', 's': 'S',
    'medium': 'M', 'med': 'M', 'm': 'M',
    'large': 'L', 'lg': 'L', 'l': 'L',
    'x-large': 'XL', 'extra large': 'XL', 'xlarge': 'XL', 'xl': 'XL',
    'xx-large': 'XXL', '2x-large': 'XXL', 'xxlarge': 'XXL', '2xl': 'XXL', 'xxl': 'XXL',
    'xxx-large': 'XXXL', '3x-large': 'XXXL', 'xxxlarge': 'XXXL', '3xl': 'XXXL',
    'one size': 'One Size', 'onesize': 'One Size', 'os': 'One Size', 'osfa': 'One Size',
  };
  // Strips a trailing parenthetical qualifier (e.g. "M (38-40)" -> "M") for a SECOND exact-match
  // pass only -- Mercari's real panel (live-confirmed 2026-08-22) lists the same nominal size
  // twice, once bare and once with a numeric range suffix; this lets a clean synonym match either
  // form without ever falling back to fuzzy word-scoring.
  function stripMercariSizeQualifier(text) {
    return norm(String(text || '').replace(/\s*\([^)]*\)\s*$/, '').replace(/\+\s*$/, ''));
  }
  async function fillMercariSize(value) {
    const opener = await waitForSelector(() => document.querySelector('[data-testid="Size"]') || openerByLabel('Size'), 5000);
    if (!opener) return false;
    const openerTextBefore = norm(opener.textContent);
    await realClick(opener);
    await sleep(350);
    const raw = norm(value);
    const mapped = MERCARI_SIZE_SYNONYMS[raw] ? norm(MERCARI_SIZE_SYNONYMS[raw]) : null;
    const want = mapped || raw;
    const options = qa('[role="option"], li[role="option"], [role="menuitem"], [role="menuitemradio"], li, button');
    const opt = options.find((o) => norm(o.textContent) === want)
      || options.find((o) => stripMercariSizeQualifier(o.textContent) === want);
    if (!opt) {
      console.warn('[FAS Mercari] Size "' + value + '" (normalized to "' + want + '") -- no exact match in the opened panel (UNVERIFIED taxonomy) -- left unset rather than guessed.');
      const closeBtn = qa('button, [role="button"], [aria-label]').find((b) => {
        const aria = norm(b.getAttribute('aria-label') || '');
        const t = norm(b.textContent);
        return (aria === 'close' || aria.indexOf('close') !== -1 || t === '\u00d7' || t === 'x') && b.offsetParent !== null;
      });
      if (closeBtn) { await realClick(closeBtn); await sleep(150); }
      return false;
    }
    // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH, P0, live-Chrome-confirmed): a real, live re-click
    // test against the actual Size panel (role="option" / aria-selected="false" <li> items,
    // data-testid="Size-option") found a plain realClick(opt) does NOT reliably commit the
    // selection -- confirmed live TWICE, once via synthetic realClick and once via a genuine
    // OS-level trusted click at the option's real screen coordinates: both closed the panel without
    // the opener's displayed text ever changing from its "Select size" placeholder, and
    // aria-selected stayed "false" on the clicked option afterward. Category uses the identical
    // realClick() against the identical role="option" selector set and DOES commit, so the failure
    // is specific to this widget's internals, not a generic synthetic-event problem. Rather than
    // report a false success, this now tries three independent, verified interaction strategies in
    // order -- pointer click (existing), then keyboard Enter, then keyboard Space -- checking
    // aria-selected/opener-text after EACH before trying the next. Never reports true unless one of
    // them actually confirmed via the DOM. If all three fail, this is left honestly UNSET (matching
    // this file's no-guessing standard) -- the underlying cause (most likely a MAIN-world-only
    // handler this isolated-world content script cannot trigger via any DOM event, mirroring
    // fas-poshmark-bridge.js's precedent for Poshmark's Vue dropdowns) still needs a live re-test
    // once the Chrome instrument that blocked verification this session is working again.
    function sizeCommitted() {
      const ariaConfirmed = opt.getAttribute && opt.getAttribute('aria-selected') === 'true';
      const openerTextAfter = norm((document.querySelector('[data-testid="Size"]') || opener).textContent);
      const textChanged = openerTextAfter !== openerTextBefore && openerTextAfter.indexOf(want) !== -1;
      return ariaConfirmed || textChanged;
    }
    async function tryKeyStrategy(key, code) {
      try { if (typeof opt.focus === 'function') opt.focus(); } catch (e) { /* non-fatal */ }
      const base = { bubbles: true, cancelable: true, composed: true, key: key, code: code, view: window };
      opt.dispatchEvent(new KeyboardEvent('keydown', base));
      await sleep(60);
      opt.dispatchEvent(new KeyboardEvent('keyup', base));
      await sleep(200);
    }

    // Strategy 1: pointer click (existing behavior).
    await realClick(opt);
    await sleep(250);
    let stuck = sizeCommitted();

    // Strategy 2: keyboard Enter on the matched option (accessible listbox widgets frequently wire
    // selection through onKeyDown separately from onClick).
    if (!stuck) {
      await tryKeyStrategy('Enter', 'Enter');
      stuck = sizeCommitted();
    }

    // Strategy 3: keyboard Space (ARIA listbox pattern -- Space is the canonical "activate option" key
    // per the WAI-ARIA authoring practices, distinct from Enter in some implementations).
    if (!stuck) {
      await tryKeyStrategy(' ', 'Space');
      stuck = sizeCommitted();
    }

    if (!stuck) {
      console.warn('[FAS Mercari] Size "' + value + '" -- matched "' + opt.textContent.trim() + '" and tried pointer click + keyboard Enter + keyboard Space, but Mercari\'s own UI never confirmed the selection (aria-selected stayed false, opener text unchanged) after any of them -- treating as UNSET rather than reporting a false success. Please set it yourself.');
      const closeBtn2 = qa('button, [role="button"], [aria-label]').find((b) => {
        const aria = norm(b.getAttribute('aria-label') || '');
        const t = norm(b.textContent);
        return (aria === 'close' || aria.indexOf('close') !== -1 || t === '\u00d7' || t === 'x') && b.offsetParent !== null;
      });
      if (closeBtn2) { await realClick(closeBtn2); await sleep(150); }
    }
    return stuck;
  }

  // Price -- BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH, P0): dedicated fill, previously routed
  // through the generic fillText() which never confirmed the value actually stuck. Mirrors
  // fas-poshmark.js's fillPoshmarkPrice defensive pattern (S-EXT-POSHMARK-PRICE-ILLEGAL-INVOCATION):
  // uses the confirmed real selector directly (`input#Price[name="sellPrice"][data-testid="Price"]`,
  // live-confirmed 2026-08-22), then re-reads the real DOM value after setting rather than trusting
  // setNativeValue's own return alone -- Mercari's own price-suggestion JS could still silently
  // overwrite or reject what was typed, and a stuck-check catches that instead of falsely reporting
  // success. Digits-only comparison so a "$"/comma-formatted echo of the same number still counts.
  async function fillMercariPrice(value) {
    const el = await waitForSelector(() => document.querySelector('input#Price[name="sellPrice"][data-testid="Price"]') || fieldByLabel('Price'), 5000);
    if (!el) return false;
    el.focus();
    const set = setNativeValue(el, String(value));
    await sleep(150);
    const seenDigits = String(el.value || '').replace(/[^0-9.]/g, '');
    const wantDigits = String(value).replace(/[^0-9.]/g, '');
    // BUG FIX 2026-08-30 (round 3, Patrick-caught): the digits-only comparison above was still a
    // raw STRING compare -- Mercari auto-formats the price field to two decimals on set/blur
    // ("12" typed becomes "12.00" in the DOM), so "12.00" !== "12" as strings even though they are
    // the same number. This produced a false "did not confirm" warning on every price fill, live-
    // confirmed via Patrick's console paste (saw "12.00", wanted "12"). Compare as parsed floats
    // instead so a same-value reformat is correctly recognized as success.
    const seenNum = parseFloat(seenDigits);
    const wantNum = parseFloat(wantDigits);
    const stuck = set && seenDigits !== '' && Number.isFinite(seenNum) && Number.isFinite(wantNum) && Math.abs(seenNum - wantNum) < 0.005;
    if (!stuck) console.warn('[FAS Mercari] Price -- set attempted but the field did not confirm the expected value afterward (saw "' + el.value + '", wanted "' + value + '") -- UNVERIFIED, please check before publishing.');
    return stuck;
  }

  // Smart Pricing floor price -- Patrick confirmed 2026-08-23: Smart Pricing itself stays ON
  // (Mercari's own default; the toggle is never touched here), but the floor price must reflect
  // this item's real minimum instead of Mercari's own irrelevant suggested value. Same computed-
  // floor pattern already proven on Facebook (fas-content.js ~line 524, configureOfferStep) and
  // Grailed (fas-grailed.js ~line 1129, fillSmartPricingFloor): prefers the organizer's own
  // per-item dollar floor (item.bestOfferMinimumAmt), falling back to the organizer-level
  // percentage default (item.defaultBestOfferAcceptPct, schema.prisma suggested default 10% --
  // fixed 2026-09-15, this previously misread defaultBestOfferDeclinePct, a different field)
  // applied against this item's price. Both fields already flow onto every extension queue item
  // via popup.js's shared startQueue() map (not Mercari-specific) -- no new wiring needed. Clamped
  // to a sane range and rounded to a whole dollar, same digit-reflow avoidance already proven
  // necessary on Grailed's own floor-price field.
  // GAP FIX 2026-09-26 (S-EXT-MERCARI-MARKDOWN-FLOOR-SYNC, today's Mercari deep-dive research):
  // Mercari's own Smart Pricing gradually drifts a listing's price DOWN toward whatever floor is
  // set below, on Mercari's own independent schedule -- completely separate from FindA.Sale's own
  // sale-level Auto-Markdown cron (Feature #91, markdownCron.ts: Day 2 = 50% off, Day 3+ = 75%
  // off, floored at Sale.markdownFloor and a $0.99 absolute minimum -- confirmed by direct read of
  // that file, 2026-09-26). Before this fix, nothing connected the two: the floor set here came
  // ONLY from best-offer settings, gated on item.allowBestOffer, with zero awareness of whether
  // this item's sale even has Auto-Markdown enabled -- confirmed by grepping "autoMarkdown" /
  // "markdown" across packages/backend/src/jobs/markdownCron.ts, priceDropService.ts and this
  // whole extension directory: zero references outside markdownCron.ts/markdownCycleCron.ts
  // themselves. Once FindA.Sale's own cron marks an item down, nothing pushes that new, lower
  // price over to Mercari (markdownPricePropagationService.ts only pushes to EBAY/DISCOGS/REVERB,
  // which have real server-side write APIs -- Mercari has none, it's browser-automation only), so
  // a floor derived purely from best-offer settings could sit ABOVE FindA.Sale's own planned
  // final price, letting Mercari's own Smart Pricing plateau above what FindA.Sale intends, or
  // (if best-offer settings are more aggressive) undercut it -- either way the two mechanisms were
  // never reconciled.
  //
  // DATA-PLUMBING GAP FOUND AND FIXED HERE: extensionController.ts's getExtensionItems (the
  // endpoint that feeds this exact `item` object) selected Sale.city/zip/address for Craigslist's
  // autofill but never Sale.markdownEnabled/markdownFloor -- confirmed by direct read, there was
  // no way for this content script to know an item's sale has Auto-Markdown on at all. Fixed by
  // adding item.saleMarkdownEnabled / item.saleMarkdownFloor to that endpoint's response (same
  // straight-passthrough, never-invent pattern already used for saleCity/saleZip/saleAddress --
  // see extensionController.ts for the matching change). No schema change: both Sale fields
  // already existed (schema.prisma Feature #91).
  //
  // KNOWN GAP, FLAGGED NOT GUESSED: markdownCron.ts's own idempotency filter
  // (`markdownApplied: false` in its query) means a real item is normally only EVER marked down
  // ONCE by that cron -- whichever tier it is first caught at. For an item posted before its
  // sale's second day (the common case), that is almost always the Day-2 50% tier; markdownApplied
  // then permanently excludes it from the later Day-3 75% pass, which in practice is only ever
  // reached by an item first seen by the cron after Day 2 has already elapsed. So the item's
  // TRUE eventual FindA.Sale floor is often the 50%-off price, not 75%. Using the Day-3 75%-off
  // price below anyway is the deliberately conservative (lower) choice per Patrick's own "use
  // whichever floor is LOWER" instruction -- it can never let Mercari settle above what
  // FindA.Sale's schedule, at its most aggressive documented tier, would allow. A complete fix
  // for the 50%-vs-75% ambiguity itself would require changing markdownCron.ts's own once-only
  // behavior, which is out of scope here and not touched by this change.
  function computeMercariAutoMarkdownFloor(item) {
    if (!item || item.saleMarkdownEnabled !== true) return null;
    if (item.price == null || !isFinite(Number(item.price))) return null;
    const price = Number(item.price);
    const saleFloor = (item.saleMarkdownFloor != null && isFinite(Number(item.saleMarkdownFloor)))
      ? Number(item.saleMarkdownFloor) : 0;
    // Mirrors markdownCron.ts's own newPrice formula exactly: Math.max(price*(1-discount),
    // sale.markdownFloor ?? 0, 0.99), with discount = 0.75 (the Day-3+ tier -- see the KNOWN GAP
    // note above for why this is the conservative, not necessarily the literally-reached, choice).
    const finalMarkdownPrice = Math.max(price * (1 - 0.75), saleFloor, 0.99);
    return finalMarkdownPrice < price ? finalMarkdownPrice : null;
  }

  // GAP FIX 2026-09-26 (S-EXT-MERCARI-SMARTPRICING-OFF, Patrick's explicit call: "i don't want
  // mercari to auto markdown, finda.sale should handle price drops" -- and again, more bluntly,
  // when this was still gated behind a floor-sync-only approach: "smart pricing should be off").
  // Supersedes the 2026-08-23 decision recorded above fillMercariSmartPricingFloor() (leave Smart
  // Pricing ON, only sync its floor) -- that left Mercari's own price-drift mechanism running
  // uncoordinated with FindA.Sale's own markdownCron.ts. Turning the toggle off UNCONDITIONALLY
  // (not gated on allowBestOffer/saleMarkdownEnabled the way the floor-sync path was) makes
  // FindA.Sale's own schedule the only thing that ever changes a live Mercari listing's price --
  // matching the same already-shipped posture as eBay/Discogs/Reverb via
  // markdownPricePropagationService.ts, and matching the already-accepted renewal-style
  // background-automation risk posture (this runs during the same human-supervised assisted-fill
  // pass as every other field here -- Mercari auto-publish itself stays removed, see
  // S-EXT-MERCARI-NO-AUTOPUBLISH below).
  // LIVE-VERIFIED 2026-09-26 via Claude in Chrome against two real listings on the production
  // Mercari seller account (artifactmi): button[data-testid="SmartPricingButton"], role="button",
  // state readable via aria-pressed ("true"=ON, "false"=OFF). Both real listings checked already
  // showed OFF -- confirms Mercari's current default may no longer be ON as the 2026-08-23 comment
  // assumed, but this function is idempotent either way (no-ops if already off) so it doesn't
  // depend on knowing the real current default. Same element confirmed present on the
  // create-listing form (this file's normal flow, mercari.com/sell/) and the edit-existing-listing
  // page (mercari.com/sell/edit/<id>/, the page a future renewal price-push would drive) -- one
  // selector covers both.
  async function turnOffMercariSmartPricing() {
    const btn = await waitForSelector(() => document.querySelector('button[data-testid="SmartPricingButton"]'), 5000);
    if (!btn) {
      console.warn('[FAS Mercari] Smart Pricing toggle button not found (UNVERIFIED selector on this form) -- please confirm Smart Pricing is OFF manually before publishing.');
      return false;
    }
    if (btn.getAttribute('aria-pressed') !== 'true') return true; // already off, nothing to do
    btn.click();
    await sleep(300); // let the toggle's own state update settle before reading it back
    const nowOff = btn.getAttribute('aria-pressed') === 'false';
    if (!nowOff) console.warn('[FAS Mercari] Smart Pricing toggle click did not register as OFF afterward -- UNVERIFIED, please check before publishing.');
    return nowOff;
  }

  async function fillMercariSmartPricingFloor(item) {
    if (item.price == null || !isFinite(Number(item.price))) return false;
    const price = Number(item.price);
    let floor = null;
    // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH-5, P0, DB-confirmed): Round 4's priority order (below)
    // put item.bestOfferMinimumAmt FIRST on the assumption it was "a deliberate, explicit per-item
    // override" -- that assumption was wrong and never verified against real data. A live DB query
    // on the actual test item (Bored Ape Yacht Club Adidas Tracksuit) showed bestOfferMinimumAmt
    // ($168.74) and bestOfferAutoAcceptAmt ($202.49) were BOTH set, and
    // packages/frontend/pages/organizer/edit-item/[id].tsx confirms why: that page's save handler
    // computes BOTH fields together from two percentage inputs on the same form
    // (bestOfferMinimumAmt = price*(1-declinePct/100), bestOfferAutoAcceptAmt =
    // price*(1-acceptPct/100)) -- they are not independent "override vs default" signals, they're
    // sibling outputs of one save action, so bestOfferMinimumAmt was essentially ALWAYS present
    // whenever bestOfferAutoAcceptAmt was, permanently shadowing Patrick's explicit instruction
    // ("Auto Accept amount should be the default") and explaining why the floor stayed $169 even
    // after the Round 4 fix deployed. bestOfferAutoAcceptAmt now checked first, as directed.
    // bestOfferMinimumAmt kept as the next fallback (not removed) because a second, independent
    // path -- packages/frontend/components/PostSaleEbayPanel.tsx -- CAN set it without also setting
    // bestOfferAutoAcceptAmt, so it's still a real, meaningful signal when it's the only one present.
    // GAP FIX 2026-09-26: this whole best-offer-derived branch is now scoped to
    // item.allowBestOffer, unchanged from the 2026-09-15 fix's intent ("items where the organizer
    // turned OFF best-offer negotiation never get an automated price-drop floor set on Mercari"
    // FROM THIS SOURCE) -- it no longer runs unconditionally now that this function can also be
    // entered purely for Auto-Markdown (see the call site's widened gate below).
    if (item.allowBestOffer) {
      if (item.bestOfferAutoAcceptAmt != null && isFinite(Number(item.bestOfferAutoAcceptAmt))) {
        floor = Number(item.bestOfferAutoAcceptAmt);
      } else if (item.bestOfferMinimumAmt != null && isFinite(Number(item.bestOfferMinimumAmt))) {
        floor = Number(item.bestOfferMinimumAmt);
      } else {
        // FIX 2026-09-15: use defaultBestOfferAcceptPct ("auto-accept up to this discount",
        // suggested default 10) -- NOT defaultBestOfferDeclinePct (a different, more permissive
        // "decline offers below this" boundary, suggested default 25), which this previously read
        // by mistake, making the floor twice as generous as the organizer's real default. See the
        // re-enabled call-site comment below for the confirmed live impact (4/24 items affected).
        const acceptPct = (item.defaultBestOfferAcceptPct != null && isFinite(Number(item.defaultBestOfferAcceptPct)))
          ? Number(item.defaultBestOfferAcceptPct) : 10; // schema.prisma's own suggested default
        floor = price * (1 - acceptPct / 100);
      }
    }
    // GAP FIX 2026-09-26 (S-EXT-MERCARI-MARKDOWN-FLOOR-SYNC): independent of allowBestOffer --
    // Patrick's explicit instruction is "if best-offer settings and auto-markdown are both active
    // for the same item, use whichever floor is LOWER (most conservative -- never sell for less
    // than either mechanism would allow)". A null best-offer floor (allowBestOffer false, or no
    // Auto-Markdown on this item's sale) just means only the other source (if any) applies.
    const markdownFloor = computeMercariAutoMarkdownFloor(item);
    if (markdownFloor != null) {
      floor = (floor == null) ? markdownFloor : Math.min(floor, markdownFloor);
    }
    if (floor == null) return false; // neither best-offer nor Auto-Markdown applies -- nothing to set
    floor = Math.max(1, Math.min(floor, price - 0.01));
    // BUG FIX 2026-08-28 (S-EXT-MERCARI-FLOOR-BOUNDARY-STALL, Patrick live report: "Mercari stopped
    // on this floor pricing step", screenshot showed floor=$9.00 against a $10.00 item with Mercari's
    // own inline error "The floor price needs to be more than $9"): whole-dollar Math.round(floor)
    // here could land EXACTLY on whatever boundary Mercari computes as the minimum-gap threshold for
    // this item -- a "must be MORE than $X" (strict) comparison rejects an exact-$X value, and this
    // code never checked for that rejection, so the run silently sat on an invalid, unsubmittable
    // value forever. Two changes: (1) round to cents, not whole dollars, so an arbitrary boundary is
    // far less likely to be hit by coincidence; (2) after setting the value, read Mercari's OWN
    // inline validation message (if any appears) instead of guessing its formula, and retry once
    // just above whatever threshold Mercari actually states -- same "read the real DOM, never guess
    // the business rule" philosophy this whole file already follows for selectors.
    floor = Math.round(floor * 100) / 100;
    if (floor >= price) return false; // price too low for a valid floor strictly below it -- leave Mercari's own default rather than set an invalid one
    const el = await waitForSelector(() => document.querySelector('input#sellMinPriceForAutoPriceDrop[name="sellMinPriceForAutoPriceDrop"][data-testid="SmartPricingFloorPrice"]')
      || fieldByLabel('Smart Pricing Floor Price') || fieldByLabel('Floor Price'), 5000);
    if (!el) {
      console.warn('[FAS Mercari] Smart Pricing floor price field not found (UNVERIFIED selector) -- Smart Pricing is on by default, please set a real floor price manually before publishing.');
      return false;
    }
    el.focus();
    // BUG FIX 2026-08-29 (round 12, S-EXT-MERCARI-REACT-NOOP-WRITE, Patrick-directed): the round-11
    // diagnostic trace showed the field correctly holds the target value on every single poll, yet
    // Mercari's own validation never re-runs. Live external testing of the same detection code
    // confirmed the cause: React's controlled-input change tracking suppresses its synthetic
    // onChange/validation cycle when a native-setter write matches the value React's own internal
    // tracker already has cached, even though real input/change DOM events are still dispatched.
    // Since this function computes and sets the SAME deterministic floor value on every call (and
    // every retry within a run), any set after the very first successful value-establishing set on
    // this input is invisible to Mercari's validation. Fix: force a genuine value transition by
    // writing a different intermediate value first (clears whatever React's tracker currently
    // holds), waiting a short beat, then writing the real target -- guaranteeing the final set is
    // always a real change regardless of what the field held before.
    setNativeValue(el, '');
    await sleep(75);
    let set = setNativeValue(el, String(floor));
    console.log('[FAS Mercari DIAG] forcing value transition: cleared then set target=' + floor);
    // DIAGNOSTIC (2026-08-29, S-EXT-MERCARI-ROUND-11, Patrick-directed -- "stop assuming, get a real
    // trace"): the whole-page-scan detection logic is independently confirmed correct in isolation
    // (matched instantly via direct devtools query), yet the SAME logic inside waitForFloorError never
    // matches during the real automated run despite the field showing $8.99 and the error being
    // present in the DOM around the same time. This is either a sequencing bug (poll gives up before
    // the value actually lands, or reads a stale/different element) or something not yet visible from
    // outside -- these [FAS Mercari DIAG] logs are pure instrumentation, no control-flow change, so the
    // next live run produces the real trace instead of another guess.
    console.log('[FAS Mercari DIAG] floor set attempted: target=' + floor + ' actualElValue=' + el.value + ' setReturnedTrue=' + set);
    // BUG FIX 2026-08-29 (round 13, S-EXT-MERCARI-BLUR-VALIDATION, Patrick-directed -- round 12
    // shipped and Patrick's fresh live retest still showed the floor price wrong, which is real
    // evidence AGAINST the round-12 theory being the (sole) cause: the clear-then-set above forces a
    // genuine React value transition on every set, so if Mercari's validation ran off change/input
    // events, round 12 should already have made it re-fire. It didn't. Re-reading this file end to
    // end with fresh eyes: setNativeValue() (~line 321) dispatches ONLY 'input' and 'change' -- a
    // grep of this entire file for "blur"/"focusout" before this fix returned zero matches,
    // anywhere. Many real-world form-validation libraries (React Hook Form's default mode, Formik
    // with validateOnBlur, plain HTML5-pattern custom validation) only run field validation ON
    // BLUR, not on every input/change event -- which would mean Mercari's error text structurally
    // CANNOT appear during this poll no matter how long it waits or how many times the value is
    // re-written, because the one event that actually triggers validation is never dispatched. This
    // also explains the round-11 puzzle (a manual/external DOM query instantly found the error
    // against "the same page state" that the automated poll never matched): that manual query was
    // run via a connected Chrome session/devtools interaction, which itself would blur the floor
    // input as a side effect of clicking elsewhere on the page or into devtools -- i.e. it was NOT
    // actually the same moment in time as the automated poll, it was a LATER moment after a human
    // interaction had already supplied the missing blur that the automated run never provided.
    // Fix: dispatch a real blur (el.blur(), which fires native 'blur' + 'focusout') immediately
    // after the field is set, before the wait-for-error poll begins. UNVERIFIED against a live run
    // -- if this still doesn't surface the error, the next diagnostic needed is a
    // MutationObserver-based timestamp log of exactly when the error DOM node is inserted relative
    // to this blur call, to confirm or rule out a slower server-side/XHR validation round-trip
    // instead (Mercari's price-suggestion widget elsewhere on this page is known to call out to a
    // pricing service; the floor-price validation may do the same).
    el.blur();
    await sleep(150);
    const readMercariFloorError = () => {
      // Round 3 (this session, earlier) added the 3 strategies below (aria-describedby / 6-level
      // ancestor walk / form-section search), all ancestor-chain-based. Patrick's live re-test
      // still failed ($8.99 in the field, error still showing, no retry fired), and the console
      // confirmed all 3 missed. Main session then queried the live DOM directly on that exact tab
      // and found the real error node: a <p> with text "The floor price needs to be more than $9."
      // sitting under an Accordion/Container wrapper -- NOT a direct ancestor of the input at all,
      // which is exactly why all 3 ancestor-chain strategies missed it (portal-rendered /
      // accordion-relocated validation text, structurally disconnected from the field itself).
      // Round 4 (this fix): a whole-page text scan makes no assumption about DOM structure at all,
      // so it can't be defeated by wherever Mercari's component library chooses to mount the error.
      // Tried FIRST since it doesn't depend on guessing a wrapper shape and is proven to match the
      // real error text seen live. The original 3 strategies are kept as a fallback/cross-check
      // chain in case the whole-page scan ever needs a second opinion (e.g. multiple matches) or a
      // future Mercari DOM change moves the error into a genuinely structured location.
      const pattern = /needs? to be (?:more than|greater than|at least) \$?([\d.]+)/i;

      // Strategy 0 (NEW, tried first): whole-page text-node scan. No DOM-structure assumption --
      // walks every text node under <body> and matches the same error pattern. This is the
      // strategy confirmed against the real live DOM (see comment above): the error text exists on
      // the page even though it is not reachable via aria-describedby, an ancestor walk, or a
      // form/section container search. A false-positive match elsewhere on the same sell-page at
      // the same moment is considered extremely unlikely for this specific phrase.
      const wholePageMatch = () => {
        // DIAGNOSTIC (2026-08-29, S-EXT-MERCARI-ROUND-11): cheap sanity signal that the DOM being
        // walked here isn't somehow a stripped-down or detached copy of the real page.
        console.log('[FAS Mercari DIAG] wholePageMatch scanning document.body with ' + document.body.childNodes.length + ' top-level children');
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const m = pattern.exec(node.textContent || '');
          if (m) return Number(m[1]);
        }
        return null;
      };
      const pageResult = wholePageMatch();
      if (pageResult != null) {
        console.log('[FAS Mercari] Smart Pricing floor error detected via whole-page text scan (value: $' + pageResult + ').');
        return pageResult;
      }

      // Strategy 1: aria-describedby -- if the input is wired to its error via this attribute (a
      // common accessible-forms pattern), it is a direct, depth-independent reference to the exact
      // error node regardless of where it actually sits in the DOM.
      const describedBy = el.getAttribute('aria-describedby');
      if (describedBy) {
        for (const id of describedBy.split(/\s+/).filter(Boolean)) {
          const node = document.getElementById(id);
          const m = node && pattern.exec(node.textContent || '');
          if (m) {
            console.log('[FAS Mercari] Smart Pricing floor error detected via aria-describedby (#' + id + ').');
            return Number(m[1]);
          }
        }
      }

      // Strategy 2: widened ancestor walk -- some component libraries render validation messages
      // several DOM levels above the input, not just 1-3. Widened from 3 to 6 levels; each level's
      // own textContent is checked (this also naturally covers any descendant of that level).
      let node = el.parentElement;
      for (let i = 0; i < 6 && node; i++) {
        const m = pattern.exec(node.textContent || '');
        if (m) {
          console.log('[FAS Mercari] Smart Pricing floor error detected via ancestor walk (level ' + (i + 1) + ' of 6).');
          return Number(m[1]);
        }
        node = node.parentElement;
      }

      // Strategy 3: broad container search -- the message may render in a SIBLING subtree instead of
      // an ancestor of the input (e.g. a shared error region elsewhere in the same form/section), so
      // search the nearest form/section container as a last resort before giving up.
      const container = el.closest('form') || el.closest('section') || el.closest('[role="form"]');
      if (container) {
        const m = pattern.exec(container.textContent || '');
        if (m) {
          console.log('[FAS Mercari] Smart Pricing floor error detected via broad form/section search (aria-describedby and ancestor walk both missed it).');
          return Number(m[1]);
        }
      }

      console.log('[FAS Mercari] Smart Pricing floor error detection: no match via whole-page scan, aria-describedby, 6-level ancestor walk, or form/section search -- no error is currently shown for this value.');
      return null;
    };
    // BUG FIX 2026-08-29 (round 7, S-EXT-MERCARI-FLOOR-TIMING, Patrick-directed root cause):
    // rounds 3-6 kept narrowing the SELECTOR/detection logic on the assumption the checks were
    // failing to find real error text. Patrick pointed out fas-content.js already solved exactly
    // this class of bug with a poll-based waitFor() backed by a MutationObserver, and a direct live
    // DOM query of an already-settled Mercari page (no sleep at all) found the error text instantly
    // using this SAME detection logic -- proving the logic was correct and the bug is TIMING: a
    // fixed sleep(300) then a single synchronous check races Mercari's real async validation-render
    // latency, which is confirmed to exceed 300ms in practice. Fix: poll instead of sleep-then-check-
    // once, same idiom as waitForSelector() above. readMercariFloorError() can legitimately return
    // the number 0 (e.g. "needs to be more than $0"), which is falsy but a real match, so this polls
    // on `!= null` explicitly rather than reusing waitForSelector()'s truthy contract.
    async function waitForFloorError(maxWaitMs) {
      const start = Date.now();
      let pollAttempt = 0;
      while (true) {
        pollAttempt++;
        const val = readMercariFloorError();
        // DIAGNOSTIC (2026-08-29, S-EXT-MERCARI-ROUND-11): logs each poll attempt with a timestamp and
        // the CURRENT read-back value of the input at that exact moment -- reveals whether the
        // element's value at poll-time actually matches what was set, or whether it's drifted/reset/
        // empty, which would explain the whole-page scan finding nothing here despite matching
        // instantly in isolation.
        console.log('[FAS Mercari DIAG] poll attempt ' + pollAttempt + ' at +' + (Date.now() - start) + 'ms: el.value=' + el.value + ' result=' + val);
        if (val != null) return val;
        if (Date.now() - start >= maxWaitMs) return null;
        await sleep(200);
      }
    }
    const rejectedAt = await waitForFloorError(2500);
    if (rejectedAt != null && isFinite(rejectedAt) && floor <= rejectedAt) {
      const retryFloor = Math.round((rejectedAt + 0.01) * 100) / 100;
      if (retryFloor < price) {
        console.log('[FAS Mercari] Smart Pricing floor $' + floor.toFixed(2) + ' was rejected by Mercari (needs to be more than $' + rejectedAt + ') -- retrying at $' + retryFloor.toFixed(2) + '.');
        el.focus();
        // BUG FIX 2026-08-29 (round 12, S-EXT-MERCARI-REACT-NOOP-WRITE): same forced-transition fix
        // as the initial set above, applied to the retry set -- this retry also risks writing a
        // value React's tracker already has cached (e.g. if the retry target happens to match a
        // prior set), so clear first, then write the real retry target.
        setNativeValue(el, '');
        await sleep(75);
        set = setNativeValue(el, String(retryFloor));
        console.log('[FAS Mercari DIAG] forcing value transition: cleared then set target=' + retryFloor);
        // DIAGNOSTIC (2026-08-29, S-EXT-MERCARI-ROUND-11): same read-back log as the initial set, for
        // the retry attempt.
        console.log('[FAS Mercari DIAG] floor set attempted (retry): target=' + retryFloor + ' actualElValue=' + el.value + ' setReturnedTrue=' + set);
        // BUG FIX 2026-08-29 (round 13, S-EXT-MERCARI-BLUR-VALIDATION): same blur fix as the initial
        // set above, applied to the retry set for the identical reason.
        el.blur();
        await sleep(150);
        if ((await waitForFloorError(2000)) != null) {
          console.warn('[FAS Mercari] Smart Pricing floor still rejected after one retry -- leaving as-is for manual review before publishing.');
          return false;
        }
      } else {
        console.warn('[FAS Mercari] Smart Pricing floor rejected and no valid retry value fits below this item\'s price -- leaving as-is for manual review before publishing.');
        return false;
      }
    }
    return set;
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
  // BUG FIX 2026-08-20 (S-EXT-BATCH-13, P0, live-Chrome-confirmed): Condition on Mercari's real
  // Sell page is NOT a dropdown/opener+options widget at all -- it's 5 always-visible card
  // buttons (New/Like new/Good/Fair/Poor), each a real semantic `<label data-testid="ConditionNew"
  // | "ConditionLikeNew" | "ConditionGood" | "ConditionFair" | "ConditionPoor">`, confirmed by
  // walking the live DOM up from the actual "New" card's own text node. `fillSelectLike('Condition',
  // v)` (used everywhere else in this file for real dropdowns) calls `openerByLabel('Condition')`
  // first, which requires ONE element whose own text/aria-label contains "condition" -- but none of
  // the 5 cards say "condition" (they say "New"/"Good"/etc.) and the plain "Condition" heading
  // itself isn't in openerByLabel's candidate selector list, so this always returned null --
  // "selector not found", every time, confirmed live via Patrick's real console output. Fixed with
  // a direct, unambiguous testid lookup + plain click (confirmed live: click on
  // [data-testid="ConditionGood"] visibly selected that card, screenshot-verified), used INSTEAD of
  // fillSelectLike for this one field.
  // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH, P0, live-Chrome-confirmed 2026-08-22): the
  // data-testid map below (ConditionNew/ConditionLikeNew/ConditionGood/ConditionFair/ConditionPoor)
  // does NOT exist on the real page -- confirmed live via direct DOM read against the actual
  // Mercari draft. The 5 condition options are plain `input[name="sellCondition"]` radios with
  // bare numeric `id` attributes and NO data-testid at all. Live-confirmed id -> label mapping
  // (read from each radio's own `<label for="...">` text, not assumed from visual order):
  // id="1"->New, id="2"->Like new, id="3"->Good, id="4"->Fair, id="5"->Poor.
  const MERCARI_CONDITION_RADIO_ID = {
    'New': '1',
    'Like New': '2',
    'Good': '3',
    'Fair': '4',
    'Poor': '5',
  };
  async function fillMercariCondition(conditionLabel) {
    const id = MERCARI_CONDITION_RADIO_ID[conditionLabel];
    const el = id ? await waitForSelector(() => document.querySelector('input[name="sellCondition"][id="' + id + '"]'), 5000) : null;
    if (!el) return false;
    await realClick(el);
    await sleep(200);
    const stuck = el.checked === true;
    if (!stuck) console.warn('[FAS Mercari] Condition "' + conditionLabel + '" -- clicked but the radio did not confirm checked (UNVERIFIED) -- please check before publishing.');
    return stuck;
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

  // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH-8, P0, live-confirmed via Patrick's own screenshots):
  // Round 7 assumed clicking List not registering meant the CLICK itself wasn't reaching Mercari's
  // handler, and added a 3-strategy click escalation. Patrick's actual next screenshots show what
  // was really happening: the click DOES register, but Mercari's own client-side validation blocks
  // submission because the Shipping section was never fully configured -- the real form shows
  // "Please select a shipping carrier" as an inline error, and clicking through opens Mercari's own
  // multi-step shipping-label wizard (an info modal, then a weight/shoebox-fit modal, then a
  // carrier-selection modal) that this file never touched. That's why no publish API request ever
  // fired (Round 7's Network-tab evidence) -- Mercari's own validation stopped it locally before any
  // request was made. This runs PROACTIVELY as part of the normal fill sequence (not reactively
  // after a List click) so the Shipping section is already complete by the time List is ever
  // clicked, matching how every other required field in this file is handled.
  //
  // Every step here is matched by real visible text taken directly from Patrick's screenshots, not
  // guessed testids (no live DOM access was available this round) -- same defensive, label-text
  // fallback pattern already used throughout this file (fieldByLabel/openerByLabel). Every step
  // verifies before moving to the next and reports honestly (never silently) if a step's expected
  // screen doesn't appear within a reasonable wait.
  function radioByNearbyText(text) {
    const want = norm(text);
    const radios = qa('input[type="radio"], [role="radio"]');
    return radios.find((r) => {
      const id = r.id;
      const labelFor = id ? q('label[for="' + id + '"]') : null;
      const label = labelFor || r.closest('label');
      const nearbyText = norm((label && label.textContent) || (r.parentElement && r.parentElement.textContent) || '');
      return nearbyText.indexOf(want) !== -1 && nearbyText.length < 200;
    });
  }

  // Given real dimensions (inches) and Mercari's own stated shoebox size (14 x 10 x 5, from the
  // modal's own helper text), answers whether the item fits. Returns `null` (not `false`) when real
  // dimensions aren't known -- see the BUG FIX comment at this function's call site for why "unknown"
  // now needs to be distinguished from a confirmed "no", not silently treated the same way.
  //
  // TOLERANCE UPDATE 2026-08-23 (S-EXT-MERCARI-BATCH-11, Patrick-directed, live-DB-confirmed): the
  // original version required every sorted dimension to independently be <= the shoebox's, which is
  // too strict for soft/foldable goods. Patrick's own live test item (Bored Ape tracksuit,
  // cmo3etpx2005hjqsuvzlkt8qz) measures 15 x 13 x 2in (confirmed via direct DB query this round) --
  // fails the strict per-axis check on two axes (15>14, 13>10) yet Patrick confirmed live it "could
  // easily be in a shoebox," reasoning that a flat, compressible item (clothing) doesn't need its
  // flat-laid-out footprint to fit inside a rigid box the way a hard-sided item would -- it folds.
  // The item's bounding-box VOLUME (15*13*2=390in3) is actually well under the shoebox's volume
  // (14*10*5=700in3) precisely because it's so thin (2in vs the box's 5in) -- volume is the
  // physically honest measure for a foldable item's "same dimensional tier" (Patrick's own phrase),
  // where strict per-axis comparison isn't. New rule: fits if (a) bounding-box volume is within a
  // 15% tolerance of the shoebox's volume, AND (b) no single dimension blows past a sanity ceiling
  // (1.5x the shoebox's same-rank dimension) -- (b) exists so a long thin item (e.g. a 40x1x1in rod)
  // can't pass on volume alone despite obviously not fitting a shoebox.
  function itemFitsInShoebox(item) {
    const l = item.packageLengthIn != null ? Number(item.packageLengthIn) : null;
    const w = item.packageWidthIn != null ? Number(item.packageWidthIn) : null;
    const h = item.packageHeightIn != null ? Number(item.packageHeightIn) : null;
    if (l == null || w == null || h == null || !isFinite(l) || !isFinite(w) || !isFinite(h)) return null;
    const itemDims = [l, w, h].sort((a, b) => b - a);
    const boxDims = [14, 10, 5].sort((a, b) => b - a);
    const itemVolume = itemDims[0] * itemDims[1] * itemDims[2];
    const boxVolume = boxDims[0] * boxDims[1] * boxDims[2];
    const volumeOk = itemVolume <= boxVolume * 1.15;
    const axisCapOk = itemDims[0] <= boxDims[0] * 1.5 && itemDims[1] <= boxDims[1] * 1.5 && itemDims[2] <= boxDims[2] * 1.5;
    return volumeOk && axisCapOk;
  }

  // Category-based signal for when real dimensions are MISSING (itemFitsInShoebox returned null).
  // Patrick's directive 2026-08-23: don't treat every unmeasured item the same blind guess -- items
  // in categories that are reliably small/flat/soft (jewelry, cards, folded clothing accessories,
  // etc.) should read as a CONFIDENT Yes even without a measurement on file. Patrick named records
  // and comic books as examples of items with their OWN well-known standard package sizes (a record
  // ships in a ~12.5x12.5x1in mailer, a comic in a standard comic mailer/box) -- both are safely
  // "Yes" by category alone, same idea as the rest of this list. NOT exhaustive -- built from
  // Patrick's examples plus clearly analogous small/flat categories; expand as real category strings
  // are seen that should match but don't.
  var SHOEBOX_LIKELY_CATEGORY_KEYWORDS = [
    'record', 'vinyl', 'comic', 'graphic novel', 'trading card', 'card game', 'jewelry', 'watch',
    'sunglasses', 'wallet', 'phone case', 'coin', 'stamp', 'earbuds', 'headphone', 'cosmetic',
    'makeup', 'fragrance', 'perfume', 'sock', 'underwear', 'lingerie', 'hat', 'cap', 'scarf', 'belt',
    'keychain', 'patch', 'pin', 'sticker', 'earring', 'necklace', 'bracelet', 'ring', 'book',
    'magazine', 'dvd', 'cd', 'video game', 'small electronics', 'charger', 'cable'
  ];
  function categoryLikelyShoeboxFit(item) {
    var text = norm((item.category || '') + ' ' + (item.categoryBreadcrumb || '')).toLowerCase();
    if (!text) return false;
    for (var i = 0; i < SHOEBOX_LIKELY_CATEGORY_KEYWORDS.length; i++) {
      if (text.indexOf(SHOEBOX_LIKELY_CATEGORY_KEYWORDS[i]) !== -1) return true;
    }
    return false;
  }

  // Parses the first "$X.XX" dollar amount out of a block of text -- used to find each carrier
  // option's price so the cheapest can be selected as a safe, always-reversible-before-shipping
  // default (nothing is actually charged until the item ships; the organizer can still change the
  // label choice later on Mercari directly).
  function firstDollarAmount(text) {
    const m = String(text || '').match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/);
    return m ? parseFloat(m[1]) : null;
  }

  // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH-9, P0, Patrick-confirmed live): returns `true` on
  // success or a specific reason STRING on failure (never a bare `false`) -- Round 8's version
  // called overlayWarn() internally at each failure point and returned a boolean, but overlay()/
  // overlayWarn() REPLACE the black notification box's content rather than appending, so that
  // specific diagnostic message was always getting silently overwritten by whatever ran next
  // (Price/Floor/the List click's own message). Patrick confirmed live: the final overlay he saw
  // was the generic "Clicked List but couldn't confirm" message, not any shipping-specific one,
  // even though the real cause (confirmed via his own screenshot) was this step failing several
  // fields earlier. No overlayWarn() calls inside this function anymore -- the caller (run(), see
  // its own comment) is now the SINGLE place that shows the final message, using the exact reason
  // string returned here, so nothing gets silently clobbered again.
  // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH-10, P0, live-DOM-confirmed -- not guessed this time):
  // got a genuinely hydrated Chrome tab this round and read the real element directly. The reason
  // NOTHING in Rounds 8-9 ever found this field: it's a plain, readonly `<input data-testid=
  // "SelectShipping">`, not a button/div/role="button" the way every other opener in this file is
  // (Size, Category, Brand). Its placeholder text ("Add title and category to enable shipping")
  // lives in the input's `.value` property, NOT `.textContent`/`.innerText` -- inputs never expose
  // their text that way, which is exactly why openerByLabel() (a textContent-based scan, and its
  // candidate list doesn't even include plain `<input>` elements) could never find it, no matter how
  // long Title/Category had already been set. This wasn't a timing problem at all. Real, stable
  // selector confirmed live: `input[data-testid="SelectShipping"]`.
  // BUG FIX 2026-08-27 (P0, Patrick-reported live, real money at risk): a real listing (this same
  // XLR cable) published with "Offer buyers free shipping?" left on Mercari's own default -- Patrick
  // had to manually change it to "No" immediately after publish to avoid eating the shipping cost.
  // This file previously had ZERO code touching this control at all (it only handles the SEPARATE
  // shipping-label/carrier wizard below). Selectors live-Chrome-confirmed 2026-08-27 by inspecting
  // the real Mercari edit-listing DOM directly (via a tab Patrick shared): opener is
  // `[data-testid="ShippingPayerOption"]` (a custom dropdown, not a native <select>); its two options
  // render as `<li data-testid="FreeShippingYesButton" role="option">Yes (Recommended)</li>` and
  // `<li data-testid="FreeShippingNoButton" role="option">No</li>` inside a
  // `<ul data-testid="ShippingPayerOption" role="listbox">` that only mounts once the opener is
  // clicked -- note the opener DIV and the options UL share the SAME data-testid, so the two options'
  // own distinct testids are used directly rather than re-querying the ambiguous shared one.
  // Confirmed via the same live inspection: Mercari's own UI labels "Yes" as "(Recommended)" --
  // consistent with what Patrick actually saw (free shipping was the default, not something this
  // file set). FindA.Sale has no organizer-facing setting yet to express a per-item shipping-payer
  // preference for crosslister listings (flagged separately, not blocking this fix) -- until one
  // exists, always choosing "No" (buyer pays) protects the organizer's margin by default instead of
  // silently costing them money, matching standard secondary-marketplace practice. Confirmed live on
  // Mercari's /sell/edit/ page specifically (Patrick's already-published listing); the /sell/ create
  // flow is presumed to reuse the same shipping component but has not been separately confirmed this
  // session -- if a future live-test shows a different selector on /sell/, update this comment.
  // BUG FIX 2026-08-27 (feature follow-up): item.crosslisterFreeShipping now exists (organizer
  // toggle, extensionController.ts payload, default false) -- reads the organizer's real per-item
  // choice instead of always forcing "No". Still defaults to buyer-pays (the safe posture) for
  // false/null/undefined; only explicitly-true flips to "Yes". The "Yes" branch is CODE-ONLY --
  // no live Mercari account to re-verify it in the browser this session, only the pre-existing
  // "No" branch and the FreeShippingYesButton/-NoButton testids themselves were live-confirmed.
  async function fillMercariShippingPayer(item) {
    const wantFree = !!(item && item.crosslisterFreeShipping === true);
    const opener = await waitForSelector(() => document.querySelector('[data-testid="ShippingPayerOption"]'), 5000);
    if (!opener) return false;
    await realClick(opener);
    await sleep(300);
    const targetTestId = wantFree ? 'FreeShippingYesButton' : 'FreeShippingNoButton';
    const targetOpt = await waitForSelector(() => document.querySelector('[data-testid="' + targetTestId + '"]'), 2000);
    if (!targetOpt) {
      console.warn('[FAS Mercari] "Offer buyers free shipping?" dropdown opened but the "' + (wantFree ? 'Yes' : 'No') + '" option wasn\'t found (UNVERIFIED) -- left at Mercari\'s own default (likely "Yes"/free shipping) -- please check before publishing.');
      return false;
    }
    await realClick(targetOpt);
    await sleep(200);
    return true;
  }
  function mercariShippingOpener() {
    return document.querySelector('input[data-testid="SelectShipping"]') || openerByLabel('Shipping label');
  }
  function mercariShippingOpenerText(el) {
    // .value for the real <input>; .textContent as a fallback for the old (wrong) button/div guess,
    // kept only in case Mercari ever changes this back to a non-input element.
    return norm(el.value != null && el.value !== '' ? el.value : el.textContent);
  }
  async function fillMercariShippingLabel(item) {
    // BUG FIX 2026-09-14 (Patrick-directed, Q12E Chromatic Guitar Tuner $30-shipping incident,
    // live-verified this session): an unconfirmed AI-estimated package weight (packageEstimateSource
    // 'AI'/'SEED', not organizer-confirmed) was flowing straight into this wizard and driving a
    // wildly wrong price -- a 40x14x5in/12lb guitar-case-sized guess for a small tuner accessory
    // produced a real $30 buyer-facing delivery fee (vs. the correct ~$5.66-15.99 range once
    // corrected by hand). The backend (extensionController.ts getExtensionItems) now withholds
    // packageWeightOz/aiPackageWeightOz/packageLengthIn/WidthIn/HeightIn entirely (sends null)
    // whenever the estimate is untrusted -- this function can no longer tell "genuinely unmeasured"
    // apart from "untrusted guess withheld", and doesn't need to: Patrick's direction is the same
    // either way -- an AI guess must never silently drive a real listing's shipping price; require
    // the organizer to enter it. Bail out BEFORE any DOM interaction (same early-return pattern as
    // fillWeight() above) rather than falling through to the "unmeasured defaults to Yes/cheapest"
    // path below, which was designed for the different, lower-stakes case of a merely-unmeasured
    // item (S-EXT-MERCARI-BATCH-11), not an actively wrong estimate.
    const trustedOunces = item.packageWeightOz != null ? item.packageWeightOz : item.aiPackageWeightOz;
    if (trustedOunces == null) {
      return 'Mercari requires a shipping weight and FindA.Sale has no confirmed weight for this item (unconfirmed AI estimates are no longer auto-filled here) -- please enter the real weight on the item\'s FindA.Sale page and confirm it before publishing.';
    }
    const opener = await waitForSelector(mercariShippingOpener, 5000);
    if (!opener) {
      return 'FindA.Sale couldn\'t find the Shipping label field automatically (UNVERIFIED selector).';
    }
    // Already configured (re-run on a draft that already has a label chosen) -- nothing to do.
    const openerText = mercariShippingOpenerText(opener);
    if (openerText.indexOf('enable shipping') === -1 && openerText.indexOf('add title') === -1) return true;
    // BUG FIX 2026-09-08 (P1, Beeple-hardcover-book draft, live-confirmed via Patrick's shared
    // tab -- see STATE.md Session Added 2026-09-08 for the full live-DOM writeup): CORRECTED same
    // session. The earlier version of this fix (BATCH-13) polled this SAME placeholder text for up
    // to 8s before clicking, reasoning it just needed more time to update. Live-tested further and
    // found that reasoning was wrong: Mercari's own "Add title and category to enable shipping"
    // label text NEVER updates to reflect readiness, even once Title + Category are genuinely filled
    // and the control is fully functional -- confirmed by clicking the exact live element by hand
    // with both fields already correct: it responded immediately ("Please select a shipping
    // carrier") and opened the real "Weigh and measure your package" modal. So the 8s poll above
    // was waiting on a signal that structurally never fires, timing out even on fully-ready drafts --
    // this is what stranded the Beeple draft, not a real Mercari-side delay. Fix: stop gating the
    // click on this text at all. The only pre-click check now is the control's own functional
    // disabled state (not its text) -- bounded-poll idiom kept (re-query every 300ms up to 8s,
    // re-fetching the live element each tick in case React swaps it out, same defensive habit as
    // mercariShippingOpener()'s other callers) but now watching disabled/aria-disabled instead of a
    // placeholder string. Real confirmation that the click actually worked is left to the existing
    // downstream checks a few lines below (the "Got it" modal / the shoebox-fit question) -- if
    // Mercari's gating genuinely wasn't satisfied yet, those already return a specific, honest
    // failure reason instead of a silent stall.
    function isFunctionallyDisabled(el) {
      return !!el && (el.disabled === true || el.getAttribute('aria-disabled') === 'true');
    }
    let clickTarget = opener;
    const disabledWaitStart = Date.now();
    while (isFunctionallyDisabled(clickTarget) && Date.now() - disabledWaitStart < 8000) {
      await sleep(300);
      clickTarget = mercariShippingOpener() || clickTarget;
    }
    if (isFunctionallyDisabled(clickTarget)) {
      return 'Mercari\'s Shipping label field is still disabled after waiting (UNVERIFIED timing -- Mercari\'s own internal validation may just need more time; re-run this draft).';
    }
    await realClick(clickTarget);
    await sleep(500);

    // Step 1: "Weigh and measure your package accurately" info modal -- click "Got it".
    const gotIt = await waitForSelector(() => qa('button').find((b) => norm(b.textContent) === 'got it'), 4000);
    if (gotIt) { await realClick(gotIt); await sleep(400); }
    // If it didn't appear, this may mean Mercari skipped straight to the next screen (e.g. already
    // dismissed once, "Don't show this again" from a prior session) -- not fatal, keep going.

    // Shared helper: sets Mercari's ItemWeightInPounds/ItemWeightInOunces fields from the same
    // trusted weight this function already bailed out early for if missing (trustedOunces check
    // at the top). Factored out so BOTH the new weight-entry modal below AND the existing
    // shoebox-fit modal further down (which live-DOM testing this session confirmed has its OWN
    // copy of these same two testids -- see BATCH-11's comment on that call site) use the exact
    // same lbs/oz-remainder math and the same zero-oz-doesn't-stick skip, instead of the two call
    // sites drifting if only one copy is ever fixed later. Returns false (no-op) if there's no
    // trusted weight to set, matching this function's existing null-safety elsewhere.
    function setMercariWeightFields() {
      const totalOz = item.packageWeightOz != null ? item.packageWeightOz : item.aiPackageWeightOz;
      if (totalOz == null || !isFinite(Number(totalOz))) return false;
      const lbs = Math.floor(Number(totalOz) / 16);
      const remOz = Math.round(Number(totalOz) % 16);
      const lbEl = document.querySelector('input[data-testid="ItemWeightInPounds"]');
      const ozEl = document.querySelector('input[data-testid="ItemWeightInOunces"]');
      if (lbEl) setNativeValue(lbEl, String(lbs));
      // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH-11, live-confirmed): live-tested setting this field
      // to literal "0" directly and it does NOT stick (value reverts to empty) even though a
      // non-zero value like "5" sets fine via the identical setNativeValue call -- some kind of
      // zero-specific rejection on Mercari's own side, not a bug in the setter itself. Skips setting
      // it when the real remainder is 0 -- Mercari's own default already shows "0" here on its own
      // (confirmed in Patrick's own screenshot before this function ever touched the field), so
      // leaving it alone in that case matches the field's own working default rather than fighting
      // a quirk that only breaks things when triggered synthetically.
      if (ozEl && remOz > 0) setNativeValue(ozEl, String(remOz));
      return true;
    }

    // BUG FIX 2026-09-15 (Patrick-shared live tab, DOM-confirmed this session): direct DOM
    // inspection of a real, live-stuck Mercari /sell/ tab this session found an entire
    // intermediate modal this function never accounted for, sitting between the "Got it" info
    // modal just above and the shoebox-fit modal just below -- titled "How heavy will the
    // package be?", with its own `ItemWeightInPounds`/`ItemWeightInOunces` fields (Mercari had
    // already carried over "2" into the pounds field on its own; ounces was empty) and its own
    // "Next" button, confirmed live to be the SAME `data-testid="SelectCarrierButton"` the
    // existing code below already looks for AFTER the shoebox question -- Mercari reuses this
    // testid across multiple steps of the wizard, so that later lookup isn't wrong on its own,
    // it's just that this function currently tries to reach the shoebox modal without ever
    // passing through this weight modal first. The old code jumped straight from "Got it" to a
    // waitForSelector for the shoebox radio with only a 4000ms timeout, which reliably timed out
    // on this modal and returned this function's own honest failure message ('..."fits in a
    // shoebox?" question never appeared...') instead of ever reaching the real shoebox modal.
    // Handled defensively: if this modal isn't present (e.g. a future Mercari change removes it
    // again, or it genuinely doesn't appear on some runs), this step is a silent no-op and
    // control falls through to the existing shoebox wait exactly as it did before this fix -- it
    // does not make this function newly fragile to Mercari NOT showing this modal.
    const weighModalField = await waitForSelector(() => document.querySelector('input[data-testid="ItemWeightInPounds"]'), 3500);
    if (weighModalField) {
      setMercariWeightFields();
      await sleep(200);
      const weighModalNext = await waitForSelector(() => document.querySelector('[data-testid="SelectCarrierButton"]:not([disabled])'), 4000);
      if (!weighModalNext) {
        return 'Clicked the Shipping label field and reached Mercari\'s "how heavy will the package be?" modal, but its "Next" button never became enabled (UNVERIFIED state) -- the weight fields were set, but Mercari\'s own form still didn\'t accept it as complete.';
      }
      await realClick(weighModalNext);
      await sleep(500);
    }
    // If the weight-entry modal wasn't found within the wait above, assume Mercari didn't show
    // it on this run and proceed straight to the shoebox question exactly as before this fix.

    // Step 2: weight/shoebox-fit modal -- weight fields are left alone (Mercari appears to carry
    // over the value already set on the main form; no evidence this modal's own fields are wrong).
    // Answers "Will your item fit in a shoebox?" from real dimensions when known, else "No".
    // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH-11, P0, live-DOM-confirmed): live-tested Round 10's
    // radioByNearbyText() approach directly against this real modal and it silently matched the
    // WRONG radio -- a Condition radio (id="1", "New") elsewhere on the underlying page, not either
    // shoebox option, because its fuzzy nearby-text scan isn't scoped to the open modal and happened
    // to contain "no" as a substring somewhere in that radio's surrounding text. This is exactly
    // Patrick's report: something got silently clicked, but never the actual shoebox question. Real,
    // stable, live-confirmed selectors used directly instead: `FitsInShoeboxYes`/`FitsInShoeboxNo`.
    // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH-12, P0, Patrick-confirmed live + live-DOM-confirmed):
    // Round 11 defaulted to "No" whenever real dimensions weren't known, reasoning that was the
    // more conservative/honest answer. Live-tested one step further this round and found a real
    // consequence neither confirmed nor anticipated before: answering "No" reveals a SECOND required
    // section ("How big will the package be?" -- real Length/Width/Height inputs, testids
    // `InputLength`/`InputWidth`/`InputHeight`) that Next also won't enable without. Live-confirmed
    // "Yes" does NOT reveal this section at all -- Next enables immediately. So when real dimensions
    // aren't known, "No" doesn't just fail to help, it actively BLOCKS the listing on a second
    // requirement we have no data to satisfy either. Reversed the default: unknown dimensions now
    // default to "Yes" (assume a standard-size shoebox) rather than "No", so the listing can still
    // complete. This carries a real, if bounded, trade-off Patrick should know about: "Yes" without
    // real dimensions means Mercari's own weight/size class is based on an assumption, and the
    // modal's own copy warns that an oversized package gets charged the difference after the fact --
    // a small financial risk, not a correctness guarantee, but the alternative (blocking the whole
    // listing whenever dimensions are unknown) is worse given this project's standing "don't leave
    // things manual" direction. When real dimensions ARE known, the honest answer is still used, and
    // if that answer is "No", the real Length/Width/Height values are filled in below rather than
    // left at Mercari's own "0" placeholders.
    // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH-11): when real dims are unknown (fits === null), still
    // default to Yes -- answering "No" without real dims just re-opens the Length/Width/Height fields
    // this function has no data to fill (Round 12's finding: that traps the run, doesn't help it).
    // fitsBasis records WHY, for future refinement, without changing today's outcome: a category
    // match (records, comics, jewelry, etc. -- see categoryLikelyShoeboxFit) is a confident Yes;
    // anything else unmeasured is still the same bounded-risk default Yes as before.
    var fits = itemFitsInShoebox(item); // true / false / null (unknown)
    var fitsBasis = 'measured';
    if (fits === null) {
      fits = true;
      fitsBasis = categoryLikelyShoeboxFit(item) ? 'category-likely-small' : 'unmeasured-default';
    }
    const shoeboxTestid = fits === false ? 'FitsInShoeboxNo' : 'FitsInShoeboxYes';
    const shoeboxRadio = await waitForSelector(() => document.querySelector('input[data-testid="' + shoeboxTestid + '"]'), 4000);
    if (!shoeboxRadio) {
      return 'Clicked the Shipping label field, but Mercari\'s "fits in a shoebox?" question never appeared (UNVERIFIED selector) -- either the opener click didn\'t register, or Mercari\'s own gating (it says "Add title and category to enable shipping") wasn\'t actually satisfied yet at the time this ran.';
    }
    // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH-11): also sets the real weight fields defensively.
    // Live-tested this modal's weight-oz field (`ItemWeightInOunces`) and found it can sit EMPTY
    // (not "0" as it visually appears) even though the pounds field shows a real number -- this
    // file's fillWeight() only ever touches the MAIN form's weight field, never this modal's own
    // separate lb/oz pair, so an empty oz value here was never anyone's assumption to begin with.
    // Sets both from the same item.packageWeightOz/aiPackageWeightOz already used by fillWeight(),
    // same setNativeValue pattern already proven for Price -- UNVERIFIED whether this alone is
    // sufficient to enable Next (this session's repeated testing against the same live draft left
    // some open questions about that button's exact gating that a single clean run should settle),
    // but setting real weight data here is a correct, no-downside improvement regardless.
    // BUG FIX 2026-09-15: this exact lb/oz field pair also appears on the earlier weight-entry
    // modal now handled above (same `ItemWeightInPounds`/`ItemWeightInOunces` testids, live-DOM
    // confirmed this session) -- factored into the shared setMercariWeightFields() helper
    // defined near Step 1 above so both call sites use identical logic (same lbs/oz-remainder
    // math, same zero-oz-doesn't-stick skip -- see that helper's own comment for the "0" quirk)
    // instead of drifting if only one copy is ever fixed. Same behavior as before: only pauses
    // here if there was actually a trusted weight to set.
    if (setMercariWeightFields()) await sleep(200);
    await realClick(shoeboxRadio);
    await sleep(250);
    // "No" (a confirmed, real non-fit, not the unknown-defaults-to-Yes case) reveals a real
    // Length/Width/Height section -- fill it from the same real dimensions that produced this
    // answer in the first place. Live-confirmed real selectors.
    if (fits === false) {
      const lEl = document.querySelector('input[data-testid="InputLength"]');
      const wEl = document.querySelector('input[data-testid="InputWidth"]');
      const hEl = document.querySelector('input[data-testid="InputHeight"]');
      if (lEl) setNativeValue(lEl, String(Math.round(Number(item.packageLengthIn))));
      if (wEl) setNativeValue(wEl, String(Math.round(Number(item.packageWidthIn))));
      if (hEl) setNativeValue(hEl, String(Math.round(Number(item.packageHeightIn))));
      await sleep(200);
    }
    const nextBtn = await waitForSelector(() => document.querySelector('[data-testid="SelectCarrierButton"]:not([disabled])') || qa('button').find((b) => norm(b.textContent) === 'next' && !b.disabled), 4000);
    if (!nextBtn) {
      return 'Mercari\'s shipping-label setup didn\'t enable its "Next" button after answering the shoebox question (UNVERIFIED state) -- both the shoebox question and the weight fields were set, but Mercari\'s own form still didn\'t accept it as complete.';
    }
    await realClick(nextBtn);
    await sleep(500);

    // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH-11, P0, live-DOM-confirmed): live-tested the
    // label[for]/closest('label')/parentElement approach directly against this real screen and ALL
    // THREE came back empty for every carrier radio -- the radio and its carrier name/price text are
    // real siblings-of-an-ancestor, not directly wrapped or `label for`-associated the way Size's or
    // Condition's radios are. Confirmed the real structure live: walking up 3 parent levels from each
    // radio reaches a container whose text is exactly the visible row ("UPS Ground Saver$7.97 $9.99 |
    // 2 - 8 days"), matching Patrick's own screenshot carrier-for-carrier. `nearestPricedAncestor()`
    // below does that walk (capped at 8 levels, bails if the matched container's text is
    // implausibly long, to avoid accidentally grabbing the whole modal). Picks the cheapest listed
    // option (see firstDollarAmount's comment for why cheapest is a safe default here).
    function nearestPricedAncestor(el) {
      let cur = el;
      for (let i = 0; i < 8 && cur; i++) {
        cur = cur.parentElement;
        if (!cur) break;
        const t = cur.textContent || '';
        if (firstDollarAmount(t) != null && t.length < 400) return t;
      }
      return null;
    }
    const carrierRadios = await waitForSelector(() => {
      const radios = qa('input[type="radio"]').filter((r) => nearestPricedAncestor(r) != null);
      return radios.length ? radios : null;
    }, 4000);
    if (!carrierRadios) {
      return 'Mercari\'s shipping-label setup showed a carrier-selection screen FindA.Sale couldn\'t read (UNVERIFIED selector).';
    }
    let cheapest = null;
    let cheapestPrice = Infinity;
    for (const r of carrierRadios) {
      const price = firstDollarAmount(nearestPricedAncestor(r));
      if (price != null && price < cheapestPrice) { cheapestPrice = price; cheapest = r; }
    }
    if (!cheapest) {
      return 'Mercari\'s shipping-label setup showed a carrier list but FindA.Sale couldn\'t parse any prices from it (UNVERIFIED).';
    }
    await realClick(cheapest);
    await sleep(250);
    const saveBtn = await waitForSelector(() => document.querySelector('[data-testid="SelectCarrierSaveButton"]:not([disabled])') || qa('button').find((b) => norm(b.textContent) === 'save' && !b.disabled), 4000);
    if (!saveBtn) {
      return 'Mercari\'s shipping-label setup didn\'t enable its "Save" button after picking a carrier (UNVERIFIED state).';
    }
    await realClick(saveBtn);
    await sleep(500);

    // Verify: Mercari's own placeholder label text on the opener NEVER updates to reflect a
    // completed shipping label -- confirmed live this session (same root cause as the pre-click
    // gate fixed above) -- so checking that text here would report "still shows placeholder" on
    // EVERY run, even one that just went through this entire wizard successfully, permanently
    // blocking the auto-publish List click downstream (see fillMercariShippingLabel's caller: any
    // non-true return sets shippingLabelFailedReason and stops the run before List is ever clicked).
    // Functional signal used instead: the carrier-selection modal's own Save button is gone from the
    // DOM once Mercari has actually accepted the save -- that's real evidence the wizard completed,
    // unlike the static label text.
    const modalClosed = await waitForSelector(() => (document.querySelector('[data-testid="SelectCarrierSaveButton"]') ? null : true), 3000);
    if (!modalClosed) {
      return 'Clicked Save on Mercari\'s shipping-carrier screen, but its modal never closed afterward (UNVERIFIED confirmation) -- the save may not have registered.';
    }
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

  // First-load "sell something" welcome/onboarding popup dismiss (BUG FIX 2026-08-19, S-EXT-BATCH,
  // P1). Confirmed by investigation: nothing anywhere in this extension looked for a
  // sell-something/welcome/onboarding/dismiss control on Mercari's Sell page, so a first-time (or
  // cache-cleared) session's welcome modal could sit on top of the form and block every fill
  // attempt, including the photo dropzone. Best-effort, UNVERIFIED selector, called before photo
  // upload in fillListing() below -- looks inside any visible dialog/modal for a dismiss-shaped
  // control and clicks it. A no-op (nothing found) is silent, matching this file's existing
  // null-check discipline -- never throws, never blocks the rest of the fill.
  async function dismissWelcomePopup() {
    const dialog = q('[role="dialog"]') || q('[role="alertdialog"]');
    if (!dialog) return false;
    const candidates = qa('button, [role="button"], a').filter((el) => dialog.contains(el));
    const dismiss = candidates.find((el) => /got it|dismiss|close|skip|no thanks|start selling|continue/i.test(norm(el.textContent)))
      || dialog.querySelector('[aria-label="Close" i], [aria-label="Dismiss" i]');
    if (!dismiss) return false;
    dismiss.click();
    await sleep(300);
    return true;
  }

  function looksLikeSellForm() {
    return !!(fieldByLabel('Title') || photoInput());
  }

  // BUG FIX 2026-08-19 (S-EXT-BATCH-5, P0, live-Chrome-confirmed): run()'s gate used to check
  // looksLikeSellForm() exactly ONCE, immediately, with no retry -- live-confirmed on Mercari this fires too
  // early: right after navigation the real form had ZERO fields (a bare ~2.5KB page shell, no
  // <label>Title</label>, no file input), but a few seconds later (after the SPA finished
  // hydrating) the exact same page had the real form fully rendered (~26KB, real <label>Title</label>
  // + a real file input). content_scripts run at "document_idle" (initial HTML + sync scripts
  // done), which is NOT the same as "the SPA has finished rendering" for a heavy client-rendered
  // page -- checking once at that point is a race, not a reliable signal either way. Polls instead
  // of checking once: up to ~8s, re-checking every ~400ms, bailing early if an interstitial shows
  // up mid-wait. This can only ever DELAY a false "doesn't look fillable" message, never change
  // success-path behavior for a page that was already ready in time.
  async function waitForFormReady(maxWaitMs) {
    // BUG FIX 2026-08-20 (S-EXT-BATCH-10, P0, Patrick-confirmed live 2026-08-20): this loop used to
    // return 'interstitial' the INSTANT looksLikeInterstitial() was true on any single poll -- but
    // Patrick confirmed live that this platform's Sell page can show verification/security-adjacent
    // copy transiently for a second or two right after navigation (a loading skeleton, an interim
    // state) before the real form settles, and that transient copy alone was enough to trip the old
    // one-shot check and bail immediately, well before waitForFormReady's own multi-second poll
    // window could give the page a chance to actually finish loading. 'ready' still wins the instant
    // it's seen (never delayed) -- only 'interstitial' now requires the SAME reading on 3 consecutive
    // polls (~1.2s) before being trusted, so a momentary false reading can no longer end the poll
    // early, while a genuine, persistent lockout screen (which by definition doesn't clear itself)
    // still gets caught correctly, just ~1.2s slower.
    const start = Date.now();
    let interstitialStreak = 0;
    while (Date.now() - start < maxWaitMs) {
      if (looksLikeInterstitial()) {
        interstitialStreak++;
        if (interstitialStreak >= 3) return 'interstitial';
      } else {
        interstitialStreak = 0;
      }
      if (looksLikeSellForm()) return 'ready';
      await sleep(400);
    }
    return 'timeout';
  }


  function showReviewOverlay(item, index, total, photosOk) {
    const more = (index + 1) < total;
    overlay('<b>FindA.Sale</b><div style="margin-top:6px">Filled <b>' + escapeHtml(item.title) + '</b> as best we could.</div>' +
      '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Review every field (category/brand/weight are UNVERIFIED guesses), double-check the <b>Smart Pricing floor price</b> we set, then click Mercari\'s own <b>List this item</b> yourself -- this extension never publishes for you and never auto-relists on Mercari.</div>' +
      (!photosOk ? '<div style="color:#ffcf7a;margin-top:6px;font-size:12px">Photos may not have attached -- add them on this screen.</div>' : '') +
      button('fas-merc-next', more ? 'I posted — next item &#9654;' : 'I posted — done', true) +
      button('fas-merc-close', 'Close', false) +
      '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');
    const next = document.getElementById('fas-merc-next');
    if (next) next.onclick = async () => {
      try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: item.id, remoteListingId: null, platform: 'MERCARI' }); } catch (e) {}
      // ADR-mercari-remote-listing-id-capture-2026-09-24 (mirrors S-EXT-VINTED-REMOTE-LISTING-ID):
      // remember (per tab, 15 min) that this item was just confirmed posted here, so the organizer's
      // own /mypage/listings/active/ page can later be tied back to it (see mercCapMaybeCapture).
      // Recorded HERE (the organizer's own "I posted" click) rather than earlier in the fill --
      // Mercari's fill is review-then-organizer-confirms, unlike Vinted's fill-and-stop, so this
      // click is the actual "a fill genuinely completed" signal, not merely "a draft was rendered".
      mercCapRecordFill(item);
      try { await chrome.runtime.sendMessage({ type: 'advanceMercariQueue', itemId: item.id }); } catch (e) {}
      if (more) { location.href = SELL_URL_HINT; } else { bar && bar.remove(); }
    };
    closeBtnHandler();
  }

  // Photo-first: upload photos, wait for Mercari's own recognition step to settle (or a fixed
  // timeout), THEN overwrite every field with FindA.Sale's own values. Never fills fields before
  // photos -- that races Mercari's own auto-fill JS (see file header).
  // Mercari requires a 5-word-minimum description (BUG FIX 2026-08-19, S-EXT-BATCH, P1) -- pads a
  // too-short description using the item's own title/category rather than generic filler, so a
  // short-but-real description ("Vintage lamp" = 2 words) doesn't silently fail Mercari's own
  // minimum. Only pads when genuinely short (or empty); never truncates or otherwise alters an
  // already-sufficient description.
  function padDescriptionForMercariMinimum(description, item) {
    const base = String(description || '').trim();
    const wordCount = base ? base.split(/\s+/).filter(Boolean).length : 0;
    if (wordCount >= 5) return base;
    const fillerParts = [item && item.title, item && item.category, 'in great condition, see photos for details']
      .filter(Boolean);
    const filler = fillerParts.join(' -- ');
    return base ? (base + ' -- ' + filler) : filler;
  }

  // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH-6, Patrick-directed, live-confirmed): Patrick's real
  // Sell page screenshot (Bored Ape Yacht Club Adidas Tracksuit, apparel category) shows no Color
  // field at all on the real form -- the dedicated `guardedFill('Color', ...)` attempt below was
  // chasing a field that doesn't exist for this category (possibly any category), producing a
  // confusing "selector not found" console warning for something that was never fillable. Per
  // Patrick's own instruction ("it would need to be dropped or put in the description"), the
  // dedicated Color field-fill attempt is now removed entirely and the color is folded into the
  // description text instead, so the information isn't silently lost. Skips cleanly if the color
  // is already mentioned in the organizer's own description (case-insensitive substring check) to
  // avoid a redundant "Color: Black. ... Color: Black" doubling up.
  function appendColorToDescription(description, color) {
    const base = String(description || '').trim();
    const c = String(color || '').trim();
    if (!c) return base;
    if (base.toLowerCase().indexOf(c.toLowerCase()) !== -1) return base; // already mentioned, don't duplicate
    const line = 'Color: ' + c + '.';
    return base ? (base + ' ' + line) : line;
  }

  // BUG FIX 2026-08-21 (S-EXT-BATCH, P0, live-Chrome-confirmed): fillListing used to run all 8
  // field fills back-to-back and only check looksLikeInterstitial() ONCE at the very end (in run(),
  // after this whole function returned) -- live-confirmed against a real interrupted draft
  // (Bored Ape Yacht Club Adidas Tracksuit, draft IU8iw9AjtwBN9570odoo8oOLywCdLrwE): Title/
  // Description/Category/Brand all filled correctly ("Adidas" visibly saved), but Size/Color/
  // Condition/Price were all left blank -- Mercari's verification screen appeared PARTWAY through
  // the sequence (after Brand, before Size), silently swallowing every fill attempt after that
  // point since the real form was covered/blocked, while the code kept blindly attempting the
  // remaining fields and only surfaced the interstitial warning once everything had already
  // (uselessly) run. Checks looksLikeInterstitial() before EACH field now and stops immediately at
  // the first sign of it, so the reported outcome accurately reflects which fields actually got a
  // chance to fill, and no further clicks/keystrokes are sent into a screen the extension can't
  // (and must never try to) solve.
  async function fillListing(item) {
    overlay('<b>FindA.Sale</b> - uploading photos first (Mercari auto-fills after photos, so we wait before touching the rest)...');
    const photosOk = await injectPhotos(item.photoUrls);
    // UNVERIFIED settle time: no live session to measure how long Mercari's own recognition step
    // takes. A fixed generous wait, not a DOM-based "settled" detector (none of Mercari's own
    // loading-state markup has been observed).
    await sleep(2500);

    overlay('<b>FindA.Sale</b> - filling the rest of the listing (overwriting anything Mercari auto-filled)...');
    // BUG FIX 2026-08-20 (S-EXT-BATCH, P0, Patrick-directed): these 8 field fills used to run
    // back-to-back with only each fillX function's own internal settle-sleep (150-700ms) between
    // them -- no real pause between DIFFERENT fields at all. That's a burst pattern (many fields
    // filled within milliseconds, zero pointer/mouse activity between them) that reads as
    // automation. A real humanPause is now inserted between every field, widened to 500-1400ms
    // (wider than this file's other internal pauses) so the whole fill spreads out instead of
    // completing in one inhuman burst.
    let interstitialAt = null;
    // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH-3, P0, live-confirmed): a stray click on Mercari's
    // own real "Save draft" button (root-caused and fixed in pickCategory() above -- see that
    // fix's comment) silently navigated the whole run off the Sell page mid-fill, and every field
    // after that point failed with a generic "selector not found" that gave no hint anything had
    // actually gone wrong with the PAGE itself, not the selector. This checks the URL is still the
    // real Sell page before each field and stops with an honest, specific message the instant it
    // isn't -- covers this exact bug's blast radius AND any future cause of the same symptom.
    let navigatedAwayFrom = null;
    function stillOnSellPage() { return location.pathname.replace(/\/+$/, '') === '/sell'; }
    async function guardedFill(label, value, fillFn) {
      if (interstitialAt || navigatedAwayFrom) return false; // already stopped -- don't touch anything further
      if (!stillOnSellPage()) { navigatedAwayFrom = label; return false; }
      if (looksLikeInterstitial()) { interstitialAt = label; return false; }
      const ok = await tryFill(label, value, fillFn);
      await humanPause(500, 1400);
      if (!stillOnSellPage()) { navigatedAwayFrom = label; return ok; }
      if (looksLikeInterstitial()) { interstitialAt = label; }
      return ok;
    }
    await guardedFill('Title', item.title, (v) => fillText('Title', v));
    await guardedFill('Description', padDescriptionForMercariMinimum(appendColorToDescription(item.description, item.color), item), (v) => fillText('Description', v));
    // Category BEFORE brand -- Mercari's brand list is category-aware (see fillBrand comment).
    // S-EXT-BATCH-12: pass categoryBreadcrumb alongside the clean category -- pickCategory uses
    // the breadcrumb for less-specific fallback segments (and to derive the men's/women's gender
    // tiebreak) after the clean leaf name's own simplified variants are tried first.
    // 2026-10-05 (S-EXT-MERCARI-CATEGORY-MAP): item.mercariCategoryPath (when the backend sent one) is tried first inside
    // pickCategory; an item with no eBay category but a mapped path still gets a Category attempt.
    await guardedFill('Category', item.category || item.mercariCategoryPath, (v) => pickCategory(v, item.categoryBreadcrumb, item));
    // 2026-08-18: brand/size/color now exist on Item and flow through getExtensionItems ->
    // popup.js's queue map. tryFill's own guard still skips silently on unset items;
    // category-type gating (apparel-only for size/color) is left to Mercari's own form,
    // never assumed here.
    // BUG FIX 2026-08-27: fall through to fillMercariNoBrand() when item.brand is empty, instead
    // of leaving the Brand field completely untouched (see fillMercariNoBrand's own comment).
    if (item.brand) {
      await guardedFill('Brand', item.brand, (v) => fillBrand('Brand', v));
    } else {
      await guardedFill('Brand', '__NO_BRAND__', () => fillMercariNoBrand('Brand'));
    }
    await guardedFill('Size', item.size, (v) => fillMercariSize(v));
    // Color: no dedicated field-fill attempt -- see appendColorToDescription() above, folded into
    // the Description fill instead (Patrick live-confirmed no Color field exists on the real form).
    const conditionLabel = (window.__FAS_COND__ && window.__FAS_COND__.platformValue('mercari', item)) || mapMercariCondition(item.condition);
    await guardedFill('Condition', conditionLabel, (v) => fillMercariCondition(v));
    if (item.price != null && isFinite(Number(item.price))) {
      const priceVal = Math.max(1, Math.round(Number(item.price)));
      if (priceVal > 2000) console.log('[FAS Mercari] Price $' + priceVal + ' exceeds Mercari\'s standard $2,000 cap -- may need an authenticate-eligible designer category. Filling anyway; Mercari\'s own form is the real gate.');
      // Smart Pricing TOGGLE sits next to Price -- deliberately never touched here (stays at
      // Mercari's own default, currently ON, per Patrick's 2026-08-23 decision). The FLOOR PRICE
      // next to it is a separate field and IS filled -- see fillMercariSmartPricingFloor() below.
      await guardedFill('Price', priceVal, (v) => fillMercariPrice(String(v)));
    }
    if (!interstitialAt) await fillWeight(item);
    // S-EXT-MERCARI-BATCH-8: shipping label wizard must be completed BEFORE List is ever clicked --
    // see fillMercariShippingLabel()'s comment for why (Mercari's own validation blocks submission
    // otherwise, which is what was actually happening in Round 7, not a click-registration problem).
    // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH-9, P0, Patrick-confirmed live): the return value here
    // was never captured -- if fillMercariShippingLabel() failed partway through (its own specific
    // overlayWarn message explaining exactly where), the run just kept going into Price/Floor and
    // eventually the List click, and every one of those later steps calls overlay()/overlayWarn()
    // itself, which REPLACES the black notification box's content rather than appending to it. So
    // the specific, diagnostic shipping-label failure message was always being silently overwritten
    // by the time Patrick actually looked at the box -- all he could ever see was the LAST message,
    // which was the generic "Clicked List but couldn't confirm" one, even though the real, already-
    // known reason was the shipping step failing several fields earlier. Confirmed exactly this way:
    // Patrick's screenshot showed the Shipping section still incomplete, but the overlay he reported
    // was the generic List-click one, not any shipping-specific message -- consistent with the
    // shipping fill failing silently-from-the-user's-view and the run barreling ahead anyway to a
    // List click that could never succeed. Now stops the run right here (same pattern as
    // interstitialAt/navigatedAwayFrom) instead of continuing to a doomed List click, so the real,
    // specific diagnostic message stays on screen instead of being clobbered.
    // BUG FIX 2026-08-27: set the buyer-pays-shipping choice BEFORE the shipping-label wizard runs
    // (same page section, no known ordering dependency either way, but keeping shipping-related
    // fills grouped together). Runs through the same guardedFill guards (interstitial/navigation/
    // human-pause) as every other field.
    await guardedFill('Shipping payer', '__SHIPPING_PAYER__', () => fillMercariShippingPayer(item));
    let shippingLabelFailedReason = null;
    if (!interstitialAt && stillOnSellPage()) {
      const shippingResult = await fillMercariShippingLabel(item);
      if (shippingResult !== true) shippingLabelFailedReason = shippingResult;
    }
    // RE-ENABLED 2026-09-15 (both 2026-09-14-pause bugs now fixed, findasale-dev): (1) gated on
    // item.allowBestOffer, so items where the organizer turned OFF best-offer negotiation never
    // get an automated price-drop floor set on Mercari. (2) fillMercariSmartPricingFloor()'s own
    // no-item-level-amount fallback now reads Organizer.defaultBestOfferAcceptPct ("auto-accept
    // up to this discount", suggested default 10), not defaultBestOfferDeclinePct (a different,
    // more permissive boundary, suggested default 25) -- confirmed live impact before this fix:
    // 4/24 currently-Mercari-posted items had allowBestOffer=false and were hitting this path.
    // GAP FIX 2026-09-26 (S-EXT-MERCARI-MARKDOWN-FLOOR-SYNC): widened from allowBestOffer-only
    // so an Auto-Markdown-enabled sale still gets its Mercari Smart Pricing floor synced even on
    // an item where the organizer turned best-offer negotiation off. fillMercariSmartPricingFloor
    // itself still scopes the best-offer-derived branch to item.allowBestOffer internally (see its
    // own comment) -- this widened gate only ever ADDS the Auto-Markdown path, never changes the
    // existing best-offer-only behavior.
    // GAP FIX 2026-09-26: replaces the old conditional fillMercariSmartPricingFloor(item) call --
    // Smart Pricing is now turned off outright (see turnOffMercariSmartPricing() above) instead of
    // staying on with a synced floor, so the floor-price field is moot and no longer filled.
    if (!interstitialAt && !shippingLabelFailedReason) await turnOffMercariSmartPricing();
    return { photosOk, interstitialAt, navigatedAwayFrom, shippingLabelFailedReason };
  }

  // REMOVED 2026-09-22 (S-EXT-MERCARI-NO-AUTOPUBLISH, per claude_docs/architecture/
  // marketplace-ban-risk-playbook.md Part 4/Mercari): this file used to auto-click Mercari's own
  // final "List" button behind a PRO/TEAMS opt-in toggle (isBlockingModalOpen() /
  // findMercariPublishButton() / waitForMercariPublishConfirmation() / tryMercariPublishStrategy()
  // / doMercariAutoPublish(), ~160 lines). Removed entirely, hardcoded -- not just defaulted off --
  // because Mercari's own Prohibited Conduct policy explicitly bans "any robot, spambot, spider,
  // crawler, scraper or other automated means or interface not provided by us," and its Safety
  // Guidelines separately instruct sellers to never share account access with third-party tools.
  // Mercari has no public seller API, so any automated final-submit click is outside Mercari's own
  // sanctioned path by construction, not a gray area. This brings fas-mercari.js in line with
  // fas-vinted.js, which has never had an auto-publish path at all -- run() below now always ends
  // in showReviewOverlay(): fill the form, never click List. Do not re-add this without a
  // Patrick + findasale-legal sign-off, same bar as the original 2026-07-17 FB Marketplace
  // decision (ADR-084) that this change does NOT extend to Mercari.

  async function run(item, index, total) {
    // BUG FIX 2026-08-20 (S-EXT-BATCH-9, P0, live-Chrome-confirmed): this used to open with an
    // immediate, single, no-retry looksLikeInterstitial() check before anything else ran -- Patrick
    // live-confirmed (2026-08-20) Mercari's Sell page can transiently show verification/security-
    // adjacent copy for the first second or two after navigation, before the real form settles, and
    // this immediate check had zero tolerance for that -- it fires once, at the worst possible
    // moment, with no poll. waitForFormReady() below already does exactly the right thing (polls
    // looksLikeInterstitial() AND looksLikeSellForm() together, up to 8s, re-checking every 400ms) --
    // this early duplicate check only ever made things WORSE by short-circuiting before that poll
    // loop got a chance to run. Removed; the poll loop is now the only interstitial gate at start.
    // BUG FIX 2026-08-19 (S-EXT-BATCH, P1): dismiss a first-load welcome/onboarding popup before
    // checking whether this looks like a sell form -- see dismissWelcomePopup()'s comment.
    await dismissWelcomePopup();
    // BUG FIX 2026-08-19 (S-EXT-BATCH-5, P0): was a single immediate looksLikeSellForm() check --
    // see waitForFormReady()'s comment for the live-confirmed race (real Title label + file input
    // did not exist for the first ~couple seconds after navigation on a real Mercari page).
    const formState = await waitForFormReady(8000);
    if (formState === 'interstitial') {
      overlayWarn('Mercari is showing a verification/security screen. FindA.Sale never attempts to solve this -- please complete it yourself, then reopen the extension to continue.' + button('fas-merc-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    if (formState === 'timeout') {
      overlayWarn('This doesn\'t look like a fillable Mercari Sell form yet (no Title field or photo dropzone found after waiting). If you\'re on the right page, this is an UNVERIFIED-selector miss -- please fill it in yourself.' + button('fas-merc-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    const fillResult = await fillListing(item);
    const photosOk = fillResult.photosOk;
    // BUG FIX 2026-08-21 (S-EXT-BATCH, P0): fillListing now tracks exactly which field it was
    // about to attempt when the interstitial first appeared (interstitialAt), instead of this being
    // a single blind re-check after every field already ran. Reports that field name explicitly so
    // Patrick/the organizer knows precisely where to pick up manually, rather than "somewhere,
    // unknown" -- live-confirmed case: Title/Description/Category/Brand filled, Size was where it
    // stopped.
    if (fillResult.navigatedAwayFrom) {
      overlayWarn('Mercari navigated away from the Sell page (now on <b>' + escapeHtml(location.pathname) + '</b>) while filling <b>' + escapeHtml(fillResult.navigatedAwayFrom) + '</b> -- fields before that point may have filled, but nothing after it was attempted. This usually means something on the page got clicked that shouldn\'t have (e.g. a Save/List button) -- check your Mercari drafts list and finish this listing manually.' + button('fas-merc-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    if (fillResult.interstitialAt) {
      overlayWarn('Mercari is showing a verification/security screen -- filling stopped before <b>' + escapeHtml(fillResult.interstitialAt) + '</b>. Please complete the verification yourself, then finish the remaining fields on this draft manually (fields before ' + escapeHtml(fillResult.interstitialAt) + ' were already filled -- do not start a new listing).' + button('fas-merc-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH-9, P0, Patrick-confirmed live): stops here, with this
    // specific message left on screen, instead of continuing to a List click that Mercari's own
    // validation will always block anyway while Shipping is incomplete -- see fillListing()'s
    // comment for the full incident (the real diagnostic message was being silently overwritten by
    // later steps, leaving only a generic "couldn't confirm" message for Patrick to see).
    if (fillResult.shippingLabelFailedReason) {
      overlayWarn(escapeHtml(fillResult.shippingLabelFailedReason) + ' Please finish the Shipping section on this draft yourself, then use Mercari\'s own List button.' + button('fas-merc-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    // Mercari never auto-publishes -- see file header (2026-09-22, marketplace-ban-risk-playbook.md
    // Part 4/Mercari). Always ends in manual review, same design as fas-vinted.js.
    showReviewOverlay(item, index, total, photosOk);
  }

  // BUG FIX 2026-08-21 (S-EXT-BATCH, P0, Patrick-confirmed live): start() used to check ONLY
  // whether a queue item existed, with no check of WHICH Mercari page the content script happened
  // to load on -- since the manifest matches all of mercari.com, clicking "Edit" on an EXISTING
  // draft from the My Listings page (a real, deliberate manual-review action, not a request to
  // auto-fill anything) also loads this same content script, which then blindly re-ran the whole
  // fill sequence over whatever the organizer was reviewing. Patrick confirmed live: "the extension
  // fires when i click edit on one of the draft items", making it impossible to see the real
  // current state of a draft. Now only auto-runs on Mercari's actual new-listing page
  // (/sell/, matching SELL_URL_HINT) -- an edit-existing-draft page (/sell/draft/<id>/) or any
  // other Mercari page is left alone, exactly like a page with no queue item at all.
  function isNewListingPage() {
    const path = location.pathname.replace(/\/+$/, '');
    return path === '/sell';
  }

  // ---- Prohibited Items pre-submit gate (S-EXT-MERCARI-PROHIBITED-GATE, added 2026-09-03) --
  // same pattern as fas-craigslist.js's craigslistRestrictionReason(): a dagger was previously
  // auto-submitted to Facebook Marketplace (which bans weapons) because that platform's content
  // script had zero weapon-keyword check before submitting -- this got the organizer's Facebook
  // account restricted. Checked in start(), immediately after the queued item is confirmed and
  // BEFORE any DOM interaction (dismissWelcomePopup/waitForFormReady/fillListing all live inside
  // run(), further below -- none of them have run yet at the point this is checked). Keyword and
  // exclude lists sourced verbatim from packages/backend/src/services/marketplaceEligibilityRules.ts
  // MERCARI rule (itself sourced from Mercari's own official Prohibited Items page).
  // EXTENDED S-CROSS-MARKETPLACE-COMPLIANCE-AUDIT-2026-09-18 (see claude_docs/audits/
  // cross-marketplace-compliance-audit-2026-09-18.md, kept in sync verbatim with the same-day
  // MERCARI backend registry edit). Deliberately did NOT add hazmat/battery/aerosol keywords --
  // confirmed those are a Mercari SHIPPING-LABEL requirement, not a listing prohibition.
  const MERCARI_PROHIBITED_NAME_KEYWORDS = [
    'weapon', 'firearm', 'gun', 'ammo', 'ammunition', 'knife', 'blade', 'explosive',
    // 2026-09-25: closes a real dagger/sword/bayonet gap -- mirrors the backend
    // marketplaceEligibilityRules.ts MERCARI rule fix, same session, same reasoning.
    'dagger', 'sword', 'bayonet',
    // 2026-09-25: weapon-synonym additions, mirrors the same-day marketplaceEligibilityRules.ts
    // MERCARI rule edit (police/government keywords deliberately NOT added -- see that rule's
    // comment: Mercari's own policy has no such restriction, confirmed live this session).
    'brass knuckle', 'nunchuck', 'nunchaku', 'baton', 'pepper spray', 'butterfly knife',
    'machete', 'throwing star',
    'taser', 'stun gun', 'self defense',
    'narcotic', 'drug', 'prescription', 'alcohol', 'liquor', 'wine', 'beer', 'tobacco',
    'cigarette', 'cigar', 'vape', 'e-cigarette', 'cbd', 'supplement', 'vitamin', 'food',
    'gold', 'silver', 'platinum', 'precious metal', 'bullion', 'loose gem', 'loose diamond',
    'unset diamond', 'gemstone', 'cryptocurrency', 'crypto', 'gift card', 'prepaid card',
    'counterfeit', 'replica', 'taxidermy', 'ivory', 'adult', 'pornographic', 'sex toy',
    'fetish', 'lottery ticket', 'pull tab', 'raffle',
    'live animal', 'human body part', 'human material',
    'account credential', 'login information', 'malware', 'virus', 'spyware',
    'digital download', 'ebook', 'in-game item', 'dropship',
    'stock certificate', 'bond certificate', 'insurance policy', 'warranty contract',
    'mystery purchase', 'mod chip',
    // ROUND 2 (see marketplaceEligibilityRules.ts's MERCARI rule, same comment): stolen goods,
    // recalled items, used underwear -- all explicitly named in Mercari's own policy.
    'stolen', 'recalled', 'used underwear',
    // 2026-09-25-ROUND2: mirrors the same-day marketplaceEligibilityRules.ts MERCARI rule edit
    // (hate-symbol keywords, mirrors VINTED's existing 'nazi'/'fascist symbol' coverage).
    'nazi', 'fascist symbol',
  ];
  // Any of these present anywhere in the haystack means the match is a false positive (e.g. a
  // 'kitchen knife' matches 'knife' but is not a weapon; a 'gold ring' matches 'gold' but is
  // ordinary jewelry) -- checked FIRST, before the prohibited-keyword scan below.
  const MERCARI_PROHIBITED_EXCLUDE_KEYWORDS = [
    'kitchen', 'cutlery', 'multitool', 'multi-tool', 'butter knife',
    'ring', 'necklace', 'bracelet', 'earring', 'pendant', 'jewelry', 'jewellery', 'mounted',
    // BONUS FIX found during the 2026-09-18 mirror-sync pass (pre-existing drift -- the backend
    // MERCARI rule has carried these excludes since S-EXT-ELIGIBILITY-SUBSTRING-FIX-2026-09-03,
    // never ported here).
    'gunmetal', 'bladerunner',
  ];
  function mercariRestrictionReason(category, title) {
    const haystack = (String(category || '') + ' ' + String(title || '')).toLowerCase();
    if (!haystack.trim()) return null;
    if (MERCARI_PROHIBITED_EXCLUDE_KEYWORDS.some((kw) => haystack.indexOf(kw) !== -1)) return null;
    if (MERCARI_PROHIBITED_NAME_KEYWORDS.some((kw) => haystack.indexOf(kw) !== -1)) {
      return "This category isn't allowed on Mercari (Prohibited Items policy).";
    }
    return null;
  }

  async function start() {
    if (!isNewListingPage()) return; // e.g. /sell/draft/<id>/ -- an existing draft being reviewed/edited, never auto-fill
    await sleep(600);
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getMercariQueueItem' }); } catch (e) { return; }
    if (!queued || !queued.ok || !queued.item) return; // nothing queued -- stay silent

    // Prohibited Items check -- runs before the duplicate-listing check and before any DOM
    // interaction. See mercariRestrictionReason()'s comment above for the full incident writeup.
    const restrictionReason = mercariRestrictionReason(queued.item.category, queued.item.title);
    if (restrictionReason) {
      console.warn('[FAS Mercari] skipping listing (Prohibited Items policy):', queued.item.id, queued.item.title, restrictionReason);
      const restrictionMore = (queued.index + 1) < queued.total;
      try { await chrome.runtime.sendMessage({ type: 'advanceMercariQueue', itemId: queued.item.id }); } catch (e) {}
      // 2026-09-22 (S-EXT-MERCARI-NO-AUTOPUBLISH): always auto-advances now -- a skip never fills
      // or publishes anything, so there is no publish-risk in moving on automatically (same as
      // fas-vinted.js's own restriction-skip behavior). No more autoPublish-gated branch.
      overlay('<b>FindA.Sale</b><div style="margin-top:6px;color:#ffcf7a;font-size:12px">Skipped <b>' + escapeHtml(queued.item.title) + '</b> -- ' + escapeHtml(restrictionReason) + '</div>' +
        (restrictionMore ? '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Moving to the next item...</div>' : ''));
      if (restrictionMore) {
        await humanPause(600, 1200);
        location.href = SELL_URL_HINT;
      } else {
        setTimeout(() => bar && bar.remove(), 4000);
      }
      return;
    }

    // FEATURE 2026-08-22 (S-EXT-DUPLICATE-LISTING-GUARD) -- see fas-poshmark.js's start() for the
    // full incident writeup (a resumed Poshmark queue entry produced a real duplicate live
    // listing this session). Applied here for consistency across all auto-publish-capable
    // platforms. Best-effort: falls through to the normal flow if the check itself fails.
    try {
      const statusRes = await chrome.runtime.sendMessage({ type: 'checkItemListedStatus', itemId: queued.item.id, platform: 'MERCARI' });
      if (statusRes && statusRes.ok && statusRes.listed) {
        const more = (queued.index + 1) < queued.total;
        try { await chrome.runtime.sendMessage({ type: 'advanceMercariQueue', itemId: queued.item.id }); } catch (e) {}
        // 2026-09-22 (S-EXT-MERCARI-NO-AUTOPUBLISH): always auto-advances now, same reasoning as
        // the restriction-skip block above -- a skip never publishes anything.
        overlay('<b>FindA.Sale</b><div style="margin-top:6px">Skipped <b>' + escapeHtml(queued.item.title) + '</b> -- this already shows as listed on Mercari, so it was not filled or published again (avoiding a duplicate listing).</div>' +
          (more ? '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Moving to the next item...</div>' : ''));
        if (more) {
          await humanPause(600, 1200);
          location.href = SELL_URL_HINT;
        } else {
          setTimeout(() => bar && bar.remove(), 4000);
        }
        return;
      }
    } catch (e) { /* best-effort -- fall through to normal fill/publish flow */ }
    try {
      await run(queued.item, queued.index, queued.total);
    } catch (e) {
      overlayWarn('Something went wrong filling this listing (' + escapeHtml((e && e.message) || 'unknown error') + '). Nothing was published -- complete this listing yourself, or reopen the extension to try again.' + button('fas-merc-close', 'Close', false));
      closeBtnHandler();
    }
  }

  // ---- Cross-platform auto-remove-on-sale-elsewhere (S-EXT-CROSS-PLATFORM-AUTOREMOVE, 2026-08-22)
  // Same pattern as fas-poshmark.js's own removal block (see its comment for full context) --
  // Patrick's explicit directive: "it must be built for all of them, that's part of the extension."
  // CODE-ONLY / UNVERIFIED: no sold Mercari item exists yet to confirm these selectors against.

  // SHARED TITLE FOLDING (2026-09-23, cross-platform removal title-guard fix). Duplicated verbatim in
  // fas-vinted.js / fas-poshmark.js / fas-mercari.js because manifest.json loads each of those as its
  // own lone content script (no shared module is injected alongside them). Applied IDENTICALLY to
  // both sides of every title comparison: NFKC, curly quotes -> straight, en/em dash -> '-', NBSP ->
  // space, U+2026 -> '...', whitespace collapsed, lowercased. Folding only ever makes two strings
  // that differ by typography compare equal -- it never turns a partial title into a match.
  function fasFoldTitle(s) {
    let t = String(s == null ? '' : s);
    try { t = t.normalize('NFKC'); } catch (e) { /* very old engines: fold the rest anyway */ }
    return t
      .replace(/[‘’‚‛ʼ′]/g, "'")
      .replace(/[“”„‟″]/g, '"')
      .replace(/[‐‑‒–—―−]/g, '-')
      .replace(/…/g, '...')
      .replace(/[   ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
  function mercRemNorm(s) { return fasFoldTitle(s); }

  function mercRemFindButtonByText(text) {
    const want = mercRemNorm(text);
    return qa('button, [role="button"], a').find((el) => mercRemNorm(el.textContent) === want && el.offsetParent !== null) || null;
  }

  // BUG FIX 2026-09-04 (S-EXT-REMOVAL-WRONG-TITLE-EL, propagated from the live-confirmed Poshmark
  // fix): document.querySelector('h1, [class*="title" i]') returns the first element matching
  // EITHER half in document order, and site headers carry classes containing "subtitle" -- and
  // "title" is a literal substring of "subtitle". Live-confirmed to return a header nav element
  // reading "My Offers" instead of the listing title, so the detail-page check always failed and
  // the delete was never attempted. Prefer the real <h1>; only fall back to a class-based lookup
  // that explicitly excludes "subtitle".
  function mercRemFindListingTitleEl() {
    const h1 = document.querySelector('h1');
    if (h1) return h1;
    return qa('[class*="title" i]').find((el) => !/subtitle/i.test(el.className)) || null;
  }

  // LIVE-CONFIRMED DOM (Patrick's logged-in /mypage/listings/active/, captured 2026-09-23 -- replaces
  // the earlier UNVERIFIED note): each active listing renders a title anchor
  //   <a data-testid="ItemLink" href="/us/item/m<digits>/...">TITLE</a>
  // AND a separate thumbnail anchor a[data-testid="ProductThumbWrapper"] with the SAME href. The old
  // matcher counted ANCHORS, so one listing = two anchors = "ambiguous" -> null, every time. It also
  // accepted any >=8-char prefix, which was unsafely loose.
  // Now: candidates are grouped by the Mercari item id parsed from the href (/item/(m\d+)), the
  // title text comes from a[data-testid="ItemLink"] (falling back to any /item/ anchor text and img
  // alt only when no ItemLink exists), a trailing price is stripped, both sides are folded
  // identically (fasFoldTitle), and a card matches only on EXACT equality -- or, for a queued title
  // longer than Mercari's 80-char title limit, equality with its first 80 characters (what a
  // maxlength=80 input keeps). Exactly one distinct item id is required.
  function mercRemItemIdFromHref(href) {
    const m = /\/item\/(m\d+)/i.exec(String(href || ''));
    return m ? m[1].toLowerCase() : null;
  }
  function mercRemCleanCardText(s) {
    let t = mercRemNorm(s);
    t = t.replace(/\s*\$\s?\d[\d,]*(?:\.\d{1,2})?(?:\s[\s\S]*)?$/, '').trim(); // trailing "$12.00 ..." price
    return t.replace(/\s*\.{3,}\s*$/, '').trim();
  }
  function mercRemTitleMatches(candidateText, queuedTitle) {
    const c = mercRemCleanCardText(candidateText);
    if (!c) return false;
    const raw = String(queuedTitle == null ? '' : queuedTitle);
    const targets = [mercRemNorm(raw).replace(/\s*\.{3,}\s*$/, '').trim()];
    if (raw.length > 80) targets.push(mercRemNorm(raw.slice(0, 80)));
    return targets.some((t) => t && t === c);
  }
  const MERC_REM_MIN_SAFE_TITLE_LEN = 8;
  // S-EXT-LISTING-GONE (2026-09-29): see fas-poshmark.js's poshRemLastMatchCount. Only set to 0 when
  // the page DID render other listings (byId.size > 0) -- a blank/unrendered page is -1, never
  // "zero matches", so a slow load can't be mistaken for a gone listing.
  let mercRemLastMatchCount = -1;
  function findMercariListingLinkByTitle(title) {
    mercRemLastMatchCount = -1;
    const want = mercRemNorm(title);
    if (!want || want.length < MERC_REM_MIN_SAFE_TITLE_LEN) return null;
    const itemLinks = qa('a[data-testid="ItemLink"]').filter((a) => mercRemItemIdFromHref(a.getAttribute('href') || a.href));
    const byId = new Map();
    const add = (id, a, text) => {
      if (!byId.has(id)) byId.set(id, { id, anchor: a, texts: [] });
      if (text && String(text).trim()) byId.get(id).texts.push(String(text));
    };
    if (itemLinks.length) {
      itemLinks.forEach((a) => {
        const id = mercRemItemIdFromHref(a.getAttribute('href') || a.href);
        const inner = typeof a.innerText === 'string' ? a.innerText.trim() : '';
        add(id, a, inner ? inner.split('\n')[0] : '');
        add(id, a, a.textContent);
      });
    } else {
      // Fallback for a different layout: any /item/ anchor (thumbnail wrappers contribute only
      // their img alt, never their text), still deduped by item id.
      qa('a[href*="/item/"]').forEach((a) => {
        const id = mercRemItemIdFromHref(a.getAttribute('href') || a.href);
        if (!id) return;
        a.querySelectorAll('img[alt]').forEach((img) => add(id, a, img.getAttribute('alt')));
        if (a.getAttribute('data-testid') === 'ProductThumbWrapper') { add(id, a, ''); return; }
        const inner = typeof a.innerText === 'string' ? a.innerText.trim() : '';
        add(id, a, inner ? inner.split('\n')[0] : '');
        add(id, a, a.textContent);
      });
    }
    const matches = [];
    byId.forEach((entry) => { if (entry.texts.some((t) => mercRemTitleMatches(t, title))) matches.push(entry); });
    mercRemLastMatchCount = byId.size > 0 ? matches.length : -1;
    if (matches.length !== 1) {
      console.log('[FAS Mercari] removal: ' + matches.length + ' listing(s) matched "' + title + '"' + (matches.length > 1 ? ' -- ambiguous, refusing.' : '.'));
      return null;
    }
    // Prefer the ItemLink anchor when present (same href as the thumbnail).
    const m = matches[0];
    m.anchor.fasMercItemId = m.id;
    return m.anchor;
  }

  // BUG FIX 2026-09-04 (S-EXT-REMOVAL-FALSE-REMOVED, propagated from the live-confirmed Poshmark
  // fix): this used to return `true` the moment a delete BUTTON was found and clicked -- whether or
  // not a confirmation control ever appeared, and whether or not the listing actually went away.
  // The caller then reported the item as REMOVED to the FindA.Sale backend, producing a false
  // "removed" record for a listing that is still live on Mercari -- the worst possible outcome (the
  // organizer stops watching it and it can still sell a second time). Now returns 'deleted' ONLY
  // when a confirmation control was actually found AND clicked; every other exit returns a specific
  // reason string the caller reports as a retriable attempt-failure instead of as a removal.
  //
  // GAP FIX 2026-09-26 (S-EXT-MERCARI-SOLD-PERMANENT-SKIP, today's Mercari deep-dive research):
  // Mercari does not allow deleting a listing once it has sold -- sellers can only Archive/Hide
  // it, there is no Delete button at all in that state. Before this fix, a sold item hit exactly
  // the 'no_menu_button'/'no_delete_action' exits below and was reported to the caller as a
  // TRANSIENT crossPlatformRemovalAttemptFailed -- retried up to FAS_REMOVAL_MAX_ATTEMPTS
  // (background.js) and then given up as a generic "delete unconfirmed" skip, even though a sold
  // item's Delete button can never appear no matter how many times this is retried.
  // CODE-ONLY / UNVERIFIED: no live sold Mercari item has been used to confirm the sold-badge
  // selector below (same caveat this whole removal feature already carries, see the block comment
  // above this function's own history). Mirrors fas-poshmark.js's classifyPoshmarkDeleteBlock --
  // an UNVERIFIED keyword scan is an established, already-shipped pattern in this codebase -- but
  // scoped even tighter: ONLY a short (<=20 char), badge-like element whose OWN text is exactly
  // "sold" or "sold out" counts, never a page-wide substring scan (which would also match
  // unrelated copy such as a seller's "120 sold" stats line -- exactly the false-positive risk
  // classifyPoshmarkDeleteBlock's own comment calls out for its header-nav case). If no such badge
  // is found this returns false and both call sites below fall through to their existing, already-
  // safe generic failure strings unchanged -- this can only ever ADD a permanent-skip
  // classification on top of the already-correct non-removal behavior, never cause a false
  // 'deleted' or change behavior for a non-sold item.
  function mercRemPageIndicatesSold() {
    return qa('[class*="sold" i], [data-testid*="sold" i], [data-testid*="status" i], [aria-label*="sold" i]').some((el) => {
      const text = norm(el.textContent);
      return text.length > 0 && text.length <= 20 && /^sold(\s*out)?$/.test(text);
    });
  }

  // S-EXT-MERCARI-DELETE-ON-EDIT-PAGE (2026-10-03). The old flow here (item page -> "More" menu ->
  // "Delete listing" -> confirm) was built on an assumption that is wrong for Mercari today, and was
  // why every Mercari removal ended in 'no_menu_button'. LIVE-CONFIRMED 2026-10-03 (read-only
  // inspection of Patrick's signed-in Chrome on an ACTIVE listing, https://www.mercari.com/us/item/
  // m27828362838/ and its edit page):
  //   1. The item page's "More" control is <button data-testid="MoreItemOptions"> with NO aria-label
  //      and textContent exactly "More" -- the old matcher (aria-label contains more/option, or
  //      textContent '...') could never match it.
  //   2. Even when opened, that More menu holds ONLY "Sell similar item". There is NO delete there.
  //   3. The real delete control lives on the EDIT page, https://www.mercari.com/sell/edit/<itemId>/
  //      (the item page links to it: <a> "Edit item", href /sell/edit/<itemId>/). That page renders
  //      button[data-testid="ActivateDeactivateButton"] "Deactivate", button[data-testid=
  //      "DeleteButton"] "Delete" and button[data-testid="ListButton"] "Update".
  // UNVERIFIED (cannot be inspected without really deleting a listing): the markup of the Delete
  // CONFIRMATION dialog. So the edit-page flow FAILS CLOSED: after clicking DeleteButton it only
  // clicks a confirm button that sits inside a NEW dialog/modal, whose own text starts with
  // delete/yes/confirm, that is not the page-level DeleteButton, and only when exactly one such
  // candidate exists; otherwise it clicks nothing further and returns a specific reason. 'deleted' is
  // returned only after Mercari is observed to have left the edit page (see
  // mercRemConfirmEditPageGone) -- never on a click alone (the 2026-09-04 honesty rule above).
  //
  // Two-page flow: this item-page step (title + target-id already verified by the caller) only
  // records a short-lived sessionStorage marker and navigates to the edit page; the delete itself is
  // done by deleteMercariListingOnEditPage() on that page after RE-verifying the listing there.
  const MERC_REM_EDIT_MARKER_KEY = 'fasMercDeleteEditMarker';
  const MERC_REM_EDIT_MARKER_TTL_MS = 2 * 60 * 1000;

  function mercRemEditPageItemId() {
    const m = /^\/sell\/edit\/(m\d+)(?:\/|$)/i.exec(location.pathname);
    return m ? m[1].toLowerCase() : null;
  }
  function mercRemReadMarker() {
    let m = null;
    try { m = JSON.parse(sessionStorage.getItem(MERC_REM_EDIT_MARKER_KEY) || 'null'); } catch (e) { m = null; }
    if (!m || typeof m !== 'object') return null;
    if (typeof m.mercId !== 'string' || typeof m.fasItemId !== 'string' || typeof m.title !== 'string') return null;
    if (m.phase !== 'navigated' && m.phase !== 'delete_clicked') return null;
    const age = Date.now() - m.at;
    if (!Number.isFinite(m.at) || age < 0 || age > MERC_REM_EDIT_MARKER_TTL_MS) return null;
    return m;
  }
  function mercRemWriteMarker(m) {
    try { sessionStorage.setItem(MERC_REM_EDIT_MARKER_KEY, JSON.stringify(m)); return true; } catch (e) { return false; }
  }
  function mercRemClearMarker() { try { sessionStorage.removeItem(MERC_REM_EDIT_MARKER_KEY); } catch (e) { /* non-fatal */ } }

  function mercRemVisible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return false;
    const cs = window.getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }
  async function mercRemWaitFor(fn, ms, stepMs) {
    const end = Date.now() + ms;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() >= end) return null;
      await sleep(stepMs || 250);
    }
  }

  async function deleteMercariListingOnDetailPage(item) {
    const mercId = mercRemItemIdFromHref(location.pathname);
    if (!mercId) return 'no_item_id';
    // A sold listing has no Delete at all (Archive/Hide only) -- permanent skip, same as before.
    if (mercRemPageIndicatesSold()) return 'blocked_sold_mercari';
    // Loop guard: we already sent this tab to the edit page for this exact item and ended up back
    // on the item page (Mercari redirected the edit page away). Do not bounce again.
    const prior = mercRemReadMarker();
    if (prior && prior.phase === 'navigated' && prior.mercId === mercId && prior.fasItemId === String(item.id)) {
      mercRemClearMarker();
      return 'edit_page_unreachable';
    }
    let editUrl = null;
    for (const a of qa('a[href*="/sell/edit/"]')) {
      try {
        const u = new URL(a.getAttribute('href') || a.href, location.href);
        if (u.origin === location.origin && u.pathname.toLowerCase().replace(/\/+$/, '') === '/sell/edit/' + mercId) { editUrl = u.origin + u.pathname; break; }
      } catch (e) { /* ignore malformed href */ }
    }
    if (!editUrl) editUrl = location.origin + '/sell/edit/' + mercId + '/';
    const ok = mercRemWriteMarker({ mercId: mercId, fasItemId: String(item.id), title: String(item.title == null ? '' : item.title), at: Date.now(), phase: 'navigated' });
    if (!ok) return 'marker_write_failed';
    overlay('<b>FindA.Sale</b><div style="margin-top:6px">Opening the Mercari edit page for <b>' + escapeHtml(item.title) + '</b> to remove it…</div>');
    location.href = editUrl;
    return 'navigating'; // the edit page load re-invokes maybeRunMercariRemoval() against the same queued item
  }

  const MERC_REM_DIALOG_SEL = '[role="dialog"], [role="alertdialog"], dialog[open], [aria-modal="true"]';
  const MERC_REM_BTN_SEL = 'button, [role="button"]';
  function mercRemEditTitleInput() {
    let el = document.querySelector('input[data-testid="Title"], textarea[data-testid="Title"]');
    if (!el) {
      const f = fieldByLabel('Title');
      if (f && /^(input|textarea)$/i.test(f.tagName)) el = f;
    }
    return el || null;
  }
  function mercRemSnapshotModalState() {
    return {
      dialogs: new Set(qa(MERC_REM_DIALOG_SEL).filter(mercRemVisible)),
      bodyKids: new Set(Array.from(document.body.children)),
      buttons: new Set(qa(MERC_REM_BTN_SEL).filter(mercRemVisible))
    };
  }
  // Roots of anything that appeared since the snapshot: a new visible dialog-role element, or a new
  // direct child of <body> (portal-style modal) that contains a button.
  function mercRemNewModalRoots(snap) {
    const roots = [];
    qa(MERC_REM_DIALOG_SEL).forEach((el) => { if (mercRemVisible(el) && !snap.dialogs.has(el)) roots.push(el); });
    Array.from(document.body.children).forEach((el) => {
      if (snap.bodyKids.has(el) || /^(script|style|link|noscript)$/i.test(el.tagName)) return;
      if (mercRemVisible(el) && el.querySelector(MERC_REM_BTN_SEL)) roots.push(el);
    });
    return roots;
  }
  function mercRemConfirmCandidates(roots, deleteBtn, snap) {
    const seen = new Set();
    const out = [];
    roots.forEach((root) => {
      root.querySelectorAll(MERC_REM_BTN_SEL).forEach((b) => {
        if (seen.has(b)) return;
        seen.add(b);
        if (!mercRemVisible(b) || b === deleteBtn || snap.buttons.has(b) || b.contains(deleteBtn) || deleteBtn.contains(b)) return;
        const t = String(b.innerText || b.textContent || '').replace(/\s+/g, ' ').trim();
        if (!/^\s*(delete|yes|confirm)/i.test(t)) return;
        if (/cancel|keep|nevermind|never mind|go back|\bno\b/i.test(t)) return;
        out.push(b);
      });
    });
    return out;
  }
  // true only after Mercari has visibly left the edit page: the URL is no longer /sell/edit/<id>/, OR
  // the edit form (Title field + every DeleteButton) and every dialog are gone on two consecutive
  // checks ~700ms apart, inside the budget.
  async function mercRemConfirmEditPageGone(editId, budgetMs) {
    const end = Date.now() + budgetMs;
    let goneChecks = 0;
    for (;;) {
      if (mercRemEditPageItemId() !== editId) return true;
      const titleNow = mercRemEditTitleInput();
      const formPresent = qa('button[data-testid="DeleteButton"]').some(mercRemVisible)
        || (!!titleNow && mercRemVisible(titleNow))
        || qa(MERC_REM_DIALOG_SEL).some(mercRemVisible);
      goneChecks = formPresent ? 0 : goneChecks + 1;
      if (goneChecks >= 2) return true;
      if (Date.now() >= end) return false;
      await sleep(700);
    }
  }

  async function deleteMercariListingOnEditPage(item, editId) {
    const marker = mercRemReadMarker();
    // Reloaded on the edit page of the same item after a Delete click: it was not deleted.
    if (marker && marker.phase === 'delete_clicked' && marker.mercId === editId && marker.fasItemId === String(item.id)) {
      mercRemClearMarker();
      return 'delete_not_confirmed';
    }
    if (item.reason === 'RESYNC_VERIFY' || !marker || marker.phase !== 'navigated') { mercRemClearMarker(); return 'edit_page_without_marker'; }
    if (marker.mercId !== editId || marker.fasItemId !== String(item.id) || marker.title !== String(item.title == null ? '' : item.title)) {
      mercRemClearMarker();
      return 'edit_page_marker_mismatch';
    }
    try {
      // Re-verify the listing ON the edit page: the title field's value must exactly match.
      const titleEl = await mercRemWaitFor(() => { const el = mercRemEditTitleInput(); return el && String(el.value || '').trim() ? el : null; }, 12000);
      if (!titleEl) return mercRemPageIndicatesSold() ? 'blocked_sold_mercari' : 'edit_title_unreadable';
      if (!mercRemTitleMatches(titleEl.value, item.title)) return 'edit_page_title_mismatch';
      const deleteBtns = (await mercRemWaitFor(() => { const l = qa('button[data-testid="DeleteButton"]').filter(mercRemVisible); return l.length ? l : null; }, 5000)) || [];
      if (deleteBtns.length === 0) return mercRemPageIndicatesSold() ? 'blocked_sold_mercari' : 'no_delete_button';
      if (deleteBtns.length > 1) return 'ambiguous_delete_button';
      const deleteBtn = deleteBtns[0];
      if (mercRemNorm(deleteBtn.textContent) !== 'delete') return 'no_delete_button';

      const snap = mercRemSnapshotModalState();
      // Persisted BEFORE the click so that, if Mercari reloads/navigates the tab and kills this
      // script, the next page can tell a delete was attempted (mercRemResumeAfterDeleteClick).
      mercRemWriteMarker({ mercId: marker.mercId, fasItemId: marker.fasItemId, title: marker.title, at: Date.now(), phase: 'delete_clicked' });
      await realClick(deleteBtn);

      let roots = [];
      const dlgEnd = Date.now() + 3000;
      while (Date.now() < dlgEnd) {
        if (mercRemEditPageItemId() !== editId) return 'deleted'; // Mercari deleted with no dialog and left the page
        roots = mercRemNewModalRoots(snap);
        if (roots.length) break;
        await sleep(250);
      }
      if (!roots.length) return (await mercRemConfirmEditPageGone(editId, 3000)) ? 'deleted' : 'no_confirm_dialog';
      await sleep(400); // let the dialog's buttons finish rendering
      const candidates = mercRemConfirmCandidates(mercRemNewModalRoots(snap), deleteBtn, snap);
      if (candidates.length === 0) return 'no_confirm_button';
      if (candidates.length > 1) return 'ambiguous_confirm_button';
      await realClick(candidates[0]);
      return (await mercRemConfirmEditPageGone(editId, 15000)) ? 'deleted' : 'delete_not_confirmed';
    } finally {
      // Reached on every in-page outcome. If Mercari navigated away and killed this script instead,
      // the 'delete_clicked' marker deliberately survives (TTL 2 min) for the resume check.
      mercRemClearMarker();
    }
  }

  // Full-page-load case only: Mercari reloaded the tab after our Delete click, so the script that
  // clicked is gone. Counts as deleted ONLY on the active-listings page, once cards have rendered
  // and the exact-title scan finds zero matches among OTHER rendered listings (count 0, never -1).
  async function mercRemResumeAfterDeleteClick(item) {
    mercRemClearMarker();
    if (!/^\/mypage\/listings(\/|$)/i.test(location.pathname)) return 'delete_not_confirmed';
    await mercRemWaitFor(() => document.querySelector('a[data-testid="ItemLink"], a[href*="/item/"]'), 8000);
    const link = findMercariListingLinkByTitle(item.title);
    return (!link && mercRemLastMatchCount === 0) ? 'deleted' : 'delete_not_confirmed';
  }

  // Overlay copy per failure reason. No em dashes; every non-permanent reason is retried by
  // background.js (FAS_REMOVAL_MAX_ATTEMPTS), and nothing here ever reports a removal.
  function mercRemFailureCopy(result, title) {
    const t = escapeHtml(title);
    const retry = ' FindA.Sale will try this item again rather than marking it removed.';
    switch (result) {
      case 'edit_page_without_marker':
        return 'This Mercari edit page was not opened by FindA.Sale for "' + t + '", so nothing was deleted. Please remove the listing yourself if you want it gone.' + retry;
      case 'edit_page_marker_mismatch':
        return 'This Mercari edit page does not match the listing FindA.Sale was removing ("' + t + '"), so nothing was deleted. Please remove it yourself.' + retry;
      case 'edit_title_unreadable':
        return 'Could not read the title on the Mercari edit page for "' + t + '", so nothing was deleted. Please remove it yourself.' + retry;
      case 'edit_page_title_mismatch':
        return 'The title on the Mercari edit page does not exactly match "' + t + '", so nothing was deleted. Please remove it yourself.' + retry;
      case 'edit_page_unreachable':
        return 'Mercari would not open the edit page for "' + t + '", so it could not be deleted automatically. Please remove it yourself.' + retry;
      case 'no_delete_button':
      case 'ambiguous_delete_button':
        return 'Found the Mercari edit page for "' + t + '" but could not find a single Delete button, so nothing was deleted. Please remove it yourself.' + retry;
      case 'no_confirm_dialog':
        return 'Clicked Delete on Mercari for "' + t + '" but no confirmation dialog appeared and the listing is still there. Please check it and remove it yourself.' + retry;
      case 'no_confirm_button':
      case 'ambiguous_confirm_button':
        return 'Clicked Delete on Mercari for "' + t + '" but could not tell which button confirms it, so nothing more was clicked. Please finish the delete yourself.' + retry;
      case 'delete_not_confirmed':
        return 'Confirmed the delete on Mercari for "' + t + '" but could not see Mercari remove it. Please check your listings and remove it yourself if it is still there.' + retry;
      case 'marker_write_failed':
        return 'Could not prepare the Mercari edit page step for "' + t + '", so nothing was deleted. Please remove it yourself.' + retry;
      case 'delete_error':
        return 'Something went wrong while deleting "' + t + '" on Mercari. Please check it and remove it yourself.' + retry;
      default:
        return 'Found the listing but couldn\'t confirm the delete action (' + escapeHtml(result) + ') -- please remove it yourself.' + retry;
    }
  }

  // Shared outcome handling for both the item-page and edit-page steps. Moved verbatim (copy
  // changes aside) out of runMercariRemovalQueue so the edit-page step reports identically.
  function mercRemReportResult(item, result) {
    if (result === 'deleted') {
      overlay('<b>FindA.Sale</b><div style="margin-top:6px">Removed <b>' + escapeHtml(item.title) + '</b> from Mercari.</div>');
      try { chrome.runtime.sendMessage({ type: 'crossPlatformRemovalDeleted', platform: 'MERCARI', itemId: item.id, continueUrl: MERCARI_REMOVAL_CONTINUE_URL }); } catch (e) {}
      return;
    }
    if (result === 'blocked_sold_mercari') {
      // GAP FIX 2026-09-26 (S-EXT-MERCARI-SOLD-PERMANENT-SKIP): PERMANENT, non-retriable --
      // Mercari never allows deleting a sold listing (Archive/Hide only), so retrying this can
      // never succeed. crossPlatformRemovalSkipped (not crossPlatformRemovalAttemptFailed)
      // reports it and moves the queue on immediately, the same permanent-skip mechanism
      // fas-poshmark.js already reuses for its own already-sold case (reason
      // 'already_sold_on_poshmark_permanent') rather than inventing a new one here.
      overlayWarn('This item shows as sold on Mercari -- Mercari never allows deleting a sold listing (Archive/Hide only), so this can\'t be automated. Please review it yourself.' + button('fas-merc-close', 'Close', false));
      try {
        chrome.runtime.sendMessage({
          type: 'crossPlatformRemovalSkipped', platform: 'MERCARI', itemId: item.id, reason: 'already_sold_on_mercari_archive_only', continueUrl: MERCARI_REMOVAL_CONTINUE_URL
        });
      } catch (e) {}
      return;
    }
    overlayWarn(mercRemFailureCopy(result, item.title) + button('fas-merc-close', 'Close', false));
    try { chrome.runtime.sendMessage({ type: 'crossPlatformRemovalAttemptFailed', platform: 'MERCARI', itemId: item.id, reason: result, continueUrl: MERCARI_REMOVAL_CONTINUE_URL }); } catch (e) {}
  }

  // Retained for reference/back-compat only. As of the 2026-09-04 fix below, background.js owns
  // reporting a removal -- it does so on receiving 'crossPlatformRemovalDeleted', which is only ever
  // sent after a CONFIRMED delete. This content script no longer reports removals itself.
  async function reportMercariRemoved(item) {
    try { await chrome.runtime.sendMessage({ type: 'markItemRemovedByRemoval', itemId: item.id, platform: 'MERCARI' }); } catch (e) {}
  }

  // Where background.js should send this tab next once it has advanced the queue. Live-confirmed
  // 2026-09-04 that https://www.mercari.com/mypage/listings/ resolves to the real "My listings"
  // page -- the previous flow navigated to the bare homepage 'https://www.mercari.com/', which has
  // no listings on it to search at all. Kept as an inlined literal because CFG is not injected into
  // this content script's world (only background.js imports config.js) -- referencing
  // CFG.Merc_MANAGE_URL directly here threw a ReferenceError every time (BUG FIX 2026-08-22).
  const MERCARI_REMOVAL_CONTINUE_URL = 'https://www.mercari.com/mypage/listings/';

  // BUG FIX 2026-09-04 (S-EXT-REMOVAL-ADVANCE-ON-FAILURE, propagated from the live-confirmed
  // Poshmark fix): this used to advance the queue after EVERY attempt, success or failure, and
  // report the removal off a flag that merely meant "a delete button existed". A failed removal was
  // therefore never retried while the listing stayed live, and a listing that was never actually
  // deleted could still be recorded as removed. All three queue transitions are now owned by
  // background.js and driven by messages that say exactly what happened:
  //   crossPlatformRemovalDeleted       -- CONFIRMED delete: report, advance, continue.
  //   crossPlatformRemovalSkipped       -- PERMANENT failure: report the skip, advance, continue.
  //   crossPlatformRemovalAttemptFailed -- TRANSIENT failure: do NOT advance until 3 attempts fail.
  // Every send is fire-and-forget: background navigates this tab onward, so awaiting the reply would
  // just race the navigation that tears this content script down.
  // ------------------------------------------------------------------------------------------
  // MERCARI LISTING-ID CAPTURE (2026-09-24, ADR-mercari-remote-listing-id-capture-2026-09-24,
  // mirrors S-EXT-VINTED-REMOTE-LISTING-ID shipped for Vinted 2026-09-23). Mercari removal was
  // purely a live exact-title scan against /mypage/listings/active/ (findMercariListingLinkByTitle,
  // below) -- once a title drifts after the fill (retitle, truncation), that scan can no longer find
  // the listing and removal is permanently stuck (the REMOVAL_HARD_STOP_AFTER_ATTEMPTS cap in
  // extensionController.ts is the backstop for exactly that case, not the fix). This learns the
  // Mercari listing id (e.g. 'm12345678') AFTER the fact -- from the organizer's own "I posted" click
  // (mercCapRecordFill, hooked into showReviewOverlay's next.onclick above) followed by an
  // opportunistic match against /mypage/listings/active/ whenever it loads -- and reports it via
  // 'setRemoteListingId' -> background -> POST /extension/items/:id/remote-listing-id (set-once,
  // organizer-owned item, format-checked, same-platform-clash refused). Recorded fills are bounded to
  // MERC_CAP_WINDOW_MS / MERC_CAP_MAX_FILLS (sessionStorage, per tab) exactly like Vinted's own
  // fasVintedRecentFills. The match itself REUSES findMercariListingLinkByTitle verbatim (exact-title,
  // exactly-one-candidate-or-refuse) -- the same matcher the removal flow trusts for live delete
  // decisions -- rather than duplicating that regex/logic here. Never clicks anything, never blocks
  // the fill or removal flow, and a miss (zero or ambiguous candidates) is silently left for a later
  // page rather than guessed.
  const MERC_CAP_FILLS_KEY = 'fasMercRecentFills';
  const MERC_CAP_WINDOW_MS = 15 * 60 * 1000;
  const MERC_CAP_MAX_FILLS = 10;

  // Mirrors vintRemListingRefFor's validation shape exactly: the backend's getPendingRemovals
  // response already populates item.listingRefs.MERCARI once a job's remoteListingId is set (generic,
  // no backend change needed here -- see listingRefsFor() in extensionController.ts) -- this just
  // re-validates the shape before trusting it for navigation.
  function mercRemListingRefFor(item) {
    const refs = item && item.listingRefs && typeof item.listingRefs === 'object' ? item.listingRefs : null;
    const v = refs ? refs.MERCARI : null;
    const s = typeof v === 'string' ? v.toLowerCase() : '';
    return /^m\d{1,20}$/.test(s) ? s : null;
  }

  function mercCapReadFills() {
    let arr = [];
    try { arr = JSON.parse(sessionStorage.getItem(MERC_CAP_FILLS_KEY) || '[]'); } catch (e) { arr = []; }
    if (!Array.isArray(arr)) return [];
    const now = Date.now();
    return arr.filter((f) => f && typeof f.itemId === 'string' && typeof f.title === 'string' &&
      Number.isFinite(f.at) && (now - f.at) >= 0 && (now - f.at) <= MERC_CAP_WINDOW_MS);
  }
  function mercCapWriteFills(arr) {
    try { sessionStorage.setItem(MERC_CAP_FILLS_KEY, JSON.stringify(arr.slice(-MERC_CAP_MAX_FILLS))); } catch (e) { /* non-fatal */ }
  }
  function mercCapRecordFill(item) {
    try {
      if (!item || !item.id) return;
      const title = mercRemNorm(item.title);
      if (title.length < MERC_REM_MIN_SAFE_TITLE_LEN) return;
      const fills = mercCapReadFills().filter((f) => f.itemId !== String(item.id));
      fills.push({ itemId: String(item.id), title, at: Date.now() });
      mercCapWriteFills(fills);
    } catch (e) { /* never block the review overlay */ }
  }
  function mercCapForgetFill(itemId) {
    mercCapWriteFills(mercCapReadFills().filter((f) => f.itemId !== itemId));
  }

  // true -> stop trying for this fill (recorded, unchanged, or a definitive refusal);
  // false -> keep it for a later page (e.g. 'no_live_listing': markListed has not landed yet).
  function mercCapIsSettled(resp) {
    if (!resp) return false;
    if (resp.ok) return true;
    const reason = resp.data && resp.data.reason;
    if (reason === 'no_live_listing') return false;
    return resp.status === 400 || resp.status === 404 || resp.status === 409;
  }

  function mercCapReport(itemId, mercId, source) {
    const id = String(mercId == null ? '' : mercId).toLowerCase();
    if (!itemId || !/^m\d{1,20}$/.test(id)) return Promise.resolve(null);
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { type: 'setRemoteListingId', platform: 'MERCARI', itemId: String(itemId), remoteListingId: id, source: source || null },
          (resp) => { void chrome.runtime.lastError; resolve(resp || null); }
        );
      } catch (e) { resolve(null); }
    });
  }

  // Runs opportunistically whenever /mypage/listings/active/ loads (or, on a layout this file
  // doesn't otherwise recognize by path, whenever the same listing-card selectors the removal flow
  // itself waits on are already present) -- reuses findMercariListingLinkByTitle, defined below, so
  // this NEVER carries its own copy of the card-matching regex/logic.
  let mercCapBusy = false;
  async function mercCapMaybeCapture() {
    if (mercCapBusy) return;
    const onListingsPage = /^\/mypage\/listings\/active\/?$/.test(location.pathname) ||
      !!document.querySelector('a[data-testid="ItemLink"]');
    if (!onListingsPage) return;
    const fills = mercCapReadFills();
    if (!fills.length) return;
    mercCapBusy = true;
    try {
      // Same card-hydration wait runMercariRemovalQueue uses before its own first scan.
      const cardsDeadline = Date.now() + 8000;
      while (Date.now() < cardsDeadline && !document.querySelector('a[data-testid="ItemLink"], a[href*="/item/"]')) await sleep(250);
      for (const f of fills) {
        const link = findMercariListingLinkByTitle(f.title);
        if (!link) continue; // zero or ambiguous match -- never guessed, same refusal rule as removal
        const id = link.fasMercItemId || mercRemItemIdFromHref(link.href);
        if (!id) continue;
        const resp = await mercCapReport(f.itemId, id, 'listings_page_fill_match');
        console.log('[FAS Mercari] id-capture: item ' + f.itemId + ' -> ' + id + ' (listings page):', resp && resp.ok ? 'recorded' : ('not recorded (' + ((resp && resp.data && resp.data.reason) || (resp && resp.error) || 'no response') + ')'));
        if (mercCapIsSettled(resp)) mercCapForgetFill(f.itemId);
      }
    } catch (e) {
      console.warn('[FAS Mercari] id-capture threw:', e && e.message);
    } finally { mercCapBusy = false; }
  }

  async function runMercariRemovalQueue(item, index, total) {
    overlay('<b>FindA.Sale</b> \u2014 removing sold item ' + (index + 1) + ' of ' + total + ': <b>' + escapeHtml(item.title) + '</b>\u2026');
    // S-EXT-MERCARI-DELETE-ON-EDIT-PAGE (2026-10-03): the actual delete happens on /sell/edit/<id>/.
    // On that page mercRemItemIdFromHref (which only knows /item/<id>) returns null, so this MUST be
    // dispatched before the listings-page scan below -- otherwise the scan finds no cards and would
    // report a permanent 'listing_not_found' skip for a listing that is still live.
    const editPageId = mercRemEditPageItemId();
    if (editPageId) {
      overlay('<b>FindA.Sale</b><div style="margin-top:6px">Checking the Mercari edit page for <b>' + escapeHtml(item.title) + '</b> before deleting…</div>');
      let editResult;
      try { editResult = await deleteMercariListingOnEditPage(item, editPageId); } catch (e) { mercRemClearMarker(); editResult = 'delete_error'; }
      mercRemReportResult(item, editResult);
      return;
    }
    const pendingMarker = mercRemReadMarker();
    if (pendingMarker && pendingMarker.phase === 'delete_clicked' && pendingMarker.fasItemId === String(item.id)) {
      let resumeResult;
      try { resumeResult = await mercRemResumeAfterDeleteClick(item); } catch (e) { mercRemClearMarker(); resumeResult = 'delete_not_confirmed'; }
      mercRemReportResult(item, resumeResult);
      return;
    }
    // 2026-09-23: on an item page, wait (250ms polls, up to ~8s) for the <h1> to hydrate, then
    // require an EXACT folded title match (was: containment, which accepted a longer different
    // title) AND, when this queue entry picked a specific item id on the listings page, that the URL
    // is that item.
    const hereItemId = mercRemItemIdFromHref(location.pathname);
    let onListingDetailPage = false;
    if (hereItemId) {
      const h1Deadline = Date.now() + 8000;
      while (!onListingDetailPage && Date.now() < h1Deadline) {
        const pageTitleEl = mercRemFindListingTitleEl();
        onListingDetailPage = !!pageTitleEl && mercRemTitleMatches(pageTitleEl.innerText || pageTitleEl.textContent, item.title);
        if (!onListingDetailPage) await sleep(250);
      }
      let targetId = null;
      try { targetId = sessionStorage.getItem('fasMercDeleteTargetId'); } catch (e) {}
      if (onListingDetailPage && targetId && targetId !== hereItemId) {
        console.log('[FAS Mercari] removal: on item ' + hereItemId + ' but the matched listing was ' + targetId + ' -- refusing.');
        onListingDetailPage = false;
      }
    }
    if (onListingDetailPage && item.reason === 'RESYNC_VERIFY') {
      // Resync verify run: the listing page exists and matches -- report it and stop. Never delete.
      try { chrome.runtime.sendMessage({ type: 'crossPlatformRemovalSkipped', platform: 'MERCARI', itemId: item.id, reason: 'verify_still_live', verifyOnly: true, continueUrl: MERCARI_REMOVAL_CONTINUE_URL }); } catch (e) {}
      return;
    }
    if (onListingDetailPage) {
      try { sessionStorage.removeItem('fasMercDeleteTargetId'); } catch (e) {}
      const result = await deleteMercariListingOnDetailPage(item);
      if (result === 'navigating') return; // edit-page load re-invokes the removal queue (see above)
      mercRemReportResult(item, result);
      return;
    }
    // ADR-mercari-remote-listing-id-capture-2026-09-24: we ARE on a real item detail page
    // (hereItemId set above) but it did not verify -- either the title didn't match within the 8s
    // hydration wait, or it matched a DIFFERENT item id than the one this queue entry targeted (the
    // targetId refusal above). Fail this attempt now instead of falling through to the card-scan
    // below, which can never succeed on a detail page (no listing cards render there at all, and a
    // "similar items" rail -- if Mercari renders one -- would share the same /item/ href shape and
    // could false-match). Mirrors fas-vinted.js's identical `onItemDetailPage && !onDetailAlready`
    // guard exactly: a TRANSIENT attempt failure, not a permanent skip -- background counts it toward
    // FAS_REMOVAL_MAX_ATTEMPTS (and, above that, REMOVAL_HARD_STOP_AFTER_ATTEMPTS) before giving up,
    // so a genuinely stale/wrong recorded id cannot wedge the queue or get silently trusted.
    if (hereItemId) {
      try { sessionStorage.removeItem('fasMercDeleteTargetId'); } catch (e) {}
      overlayWarn('This Mercari listing page does not exactly match "' + escapeHtml(item.title) + '" -- nothing was deleted. Please remove it yourself.' + button('fas-merc-close', 'Close', false));
      try { chrome.runtime.sendMessage({ type: 'crossPlatformRemovalAttemptFailed', platform: 'MERCARI', itemId: item.id, reason: 'detail_page_title_mismatch', continueUrl: MERCARI_REMOVAL_CONTINUE_URL }); } catch (e) {}
      return;
    }
    // Id-first (ADR-mercari-remote-listing-id-capture-2026-09-24): a known Mercari id for this item
    // (item.listingRefs.MERCARI -- populated by getPendingRemovals whenever the item's live POST/
    // POSTED job carries a remoteListingId; see listingRefsFor() in extensionController.ts and
    // mercCapMaybeCapture above, which is what sets it in the first place) means the listings-page
    // title scan below can be skipped entirely -- navigate straight to the listing. The EXISTING
    // hydration-wait + exact-title re-verification (top of this function, hereItemId/
    // onListingDetailPage) still runs unchanged on the resulting page load before any delete is
    // attempted, so a bad id is re-verified, never trusted blindly.
    const refId = mercRemListingRefFor(item);
    if (refId && item.reason !== 'RESYNC_VERIFY') {
      try { sessionStorage.setItem('fasMercDeleteTargetId', refId); } catch (e) {}
      overlay('<b>FindA.Sale</b><div style="margin-top:6px">Opening the Mercari listing for <b>' + escapeHtml(item.title) + '</b> to remove it...</div>');
      location.href = 'https://www.mercari.com/us/item/' + refId + '/';
      return; // the resulting page load re-invokes maybeRunMercariRemoval() against the same queued item
    }
    // 2026-09-23: wait (250ms polls, up to ~8s) for listing cards to render before the first scan.
    // Only reached when NO Mercari id is known yet for this item (the id-first branch above returns).
    const cardsDeadline = Date.now() + 8000;
    while (Date.now() < cardsDeadline && !document.querySelector('a[data-testid="ItemLink"], a[href*="/item/"]')) await sleep(250);
    const link = findMercariListingLinkByTitle(item.title);
    if (!link) {
      overlayWarn('No confident match for "' + escapeHtml(item.title) + '" in your Mercari listings (zero or more than one found) -- skipped, not guessed.' + button('fas-merc-close', 'Close', false));
      try { chrome.runtime.sendMessage({ type: 'crossPlatformRemovalSkipped', platform: 'MERCARI', itemId: item.id, reason: mercRemLastMatchCount === 0 ? 'listing_not_found' : 'no_confident_listing_match', verifyOnly: item.reason === 'RESYNC_VERIFY', continueUrl: MERCARI_REMOVAL_CONTINUE_URL }); } catch (e) {}
      return;
    }
    if (item.reason === 'RESYNC_VERIFY') {
      // Resync verify run: exactly one listing card matched -- it is live. Report and stop.
      try { chrome.runtime.sendMessage({ type: 'crossPlatformRemovalSkipped', platform: 'MERCARI', itemId: item.id, reason: 'verify_still_live', verifyOnly: true, continueUrl: MERCARI_REMOVAL_CONTINUE_URL }); } catch (e) {}
      return;
    }
    try { sessionStorage.setItem('fasMercDeleteTargetId', link.fasMercItemId || mercRemItemIdFromHref(link.href) || ''); } catch (e) {}
    location.href = link.href;
  }

  // ---- S-EXT-MERCARI-PRICE-PUSH (2026-09-27, Patrick-approved background price-push) ----
  // Bounded by design: background.js's checkPriceSyncQueue only ever queues an item here when
  // Item.priceUpdatedAt has moved past the last price FindA.Sale pushed to Mercari for THIS
  // platform (MarketplaceListingJob.priceSyncedAt, ADR-129) -- in practice that means
  // markdownCycleCron.ts crossing a markdown tier (Day-2/Day-3), since nothing else re-stamps
  // Item.priceUpdatedAt on an already-live item without an organizer's own manual edit. At most
  // two automated visits per item over its whole lifetime. Writes ONLY the Price field -- never
  // Title/Description/Category/Condition/Shipping/the Smart Pricing toggle -- and never clicks
  // anything that re-publishes the listing; if Mercari's edit page requires an explicit Save/
  // Update click to persist just that one field, that click is the one action in scope beyond
  // the fill itself.
  //
  // Runs ONLY on /sell/edit/<id>/ pages, and ONLY when the id in the URL matches the queue's
  // current item's own captured remoteListingId (id-first, no fallback -- an item with no
  // captured id is filtered out of the MERCARI queue entirely by getPriceSyncQueue on the
  // backend, so it never reaches this function at all). Mirrors isNewListingPage()'s existing
  // discipline of never running an auto-fill flow against a page the organizer opened by hand,
  // just inverted: this flow acts ONLY on a page FindA.Sale itself navigated a dedicated,
  // background-opened tab to (see background.js's getMercariPricePushQueueItem tab-identity
  // check) -- an organizer who happens to open their own edit page for some other listing gets
  // item:null back and nothing happens.
  //
  // Save/Update button selector is UNVERIFIED -- no live account access this session to confirm
  // it against a real Mercari edit page. Scans visible buttons for one of several plausible
  // labels rather than guessing one exact selector, and reports (never guesses) when none match,
  // same discipline as mercRemFindButtonByText's own removal-flow callers.
  function mercPricePushEditPageId() {
    const m = /^\/sell\/edit\/(m\d+)\/?/i.exec(location.pathname);
    return m ? m[1].toLowerCase() : null;
  }

  const MERC_PRICE_PUSH_SAVE_LABELS = ['Save', 'Save changes', 'Save Changes', 'Update listing', 'Update Listing', 'Update', 'Done'];
  function mercPricePushFindSaveButton() {
    for (const label of MERC_PRICE_PUSH_SAVE_LABELS) {
      const btn = mercRemFindButtonByText(label);
      if (btn) return btn;
    }
    return null;
  }

  async function runMercariPricePush(item, index, total) {
    overlay('<b>FindA.Sale</b> \u2014 syncing price ' + (index + 1) + ' of ' + total + ': <b>' + escapeHtml(item.title) + '</b>\u2026');
    const filled = await fillMercariPrice(item.price);
    if (!filled) {
      overlayWarn('Couldn\'t confirm the price field updated for "' + escapeHtml(item.title) + '" -- please update it yourself on Mercari.' + button('fas-merc-close', 'Close', false));
      try { chrome.runtime.sendMessage({ type: 'mercariPricePushFailed', itemId: item.id, reason: 'price_field_not_confirmed' }); } catch (e) {}
      return;
    }
    await sleep(300);
    const saveBtn = mercPricePushFindSaveButton();
    if (!saveBtn) {
      overlayWarn('Updated the price for "' + escapeHtml(item.title) + '" but couldn\'t find a Save/Update button (UNVERIFIED selector) -- please save it yourself on Mercari.' + button('fas-merc-close', 'Close', false));
      try { chrome.runtime.sendMessage({ type: 'mercariPricePushFailed', itemId: item.id, reason: 'save_button_not_found' }); } catch (e) {}
      return;
    }
    await realClick(saveBtn);
    await sleep(800);
    overlay('<b>FindA.Sale</b><div style="margin-top:6px">Updated the price for <b>' + escapeHtml(item.title) + '</b> on Mercari.</div>');
    try { chrome.runtime.sendMessage({ type: 'mercariPricePushCompleted', itemId: item.id }); } catch (e) {}
  }

  async function maybeRunMercariPricePush() {
    const pageId = mercPricePushEditPageId();
    if (!pageId) return false;
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getMercariPricePushQueueItem' }); } catch (e) { return false; }
    if (!queued || !queued.ok || !queued.item) return false;
    const item = queued.item;
    const wantId = String(item.remoteListingId || '').toLowerCase();
    if (!wantId || wantId !== pageId) return false; // never act on an edit page the organizer opened themselves
    await runMercariPricePush(item, queued.index, queued.total);
    return true;
  }

  async function maybeRunMercariRemoval() {
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getRemovalQueueItemFor', platform: 'MERCARI' }); } catch (e) { return false; }
    if (!queued || !queued.ok || !queued.item) return false;
    await runMercariRemovalQueue(queued.item, queued.index, queued.total);
    return true;
  }

  (async () => {
    // ADR-mercari-remote-listing-id-capture-2026-09-24: fire-and-forget, no-op unless this tab
    // filled a listing in the last 15 min AND this is (or looks like) the listings page -- never
    // awaited, so it can never block or delay the removal/fill flow below.
    mercCapMaybeCapture();
    const ranPricePush = await maybeRunMercariPricePush();
    if (ranPricePush) return;
    const ranRemoval = await maybeRunMercariRemoval();
    if (!ranRemoval) start();
  })();
})();


// ---- Challenge / restriction page detector (2026-10-01; settle window 2026-10-06) ----------------
// If the marketplace replaces the page with a full-page bot check or an access-denied wall, tell the
// background worker so it pauses this marketplace (the organizer un-pauses it in the popup after looking
// at their account). A transient interstitial that clears by itself ("Just a moment...") does NOT pause:
// the logic and timing constants live in the shared fas-challenge.js (loaded before this file).
// This code never interacts with the challenge.
(function fasChallengeDetector() {
  const PLATFORM = 'MERCARI';
  try {
    if (window.__FAS_CHALLENGE__) window.__FAS_CHALLENGE__.watch({ platform: PLATFORM });
  } catch (e) { /* never break the page script */ }
})();
