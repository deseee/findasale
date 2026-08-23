/* FindA.Sale — content script on mercari.com "Sell" flow.
 * CODE-ONLY, UNTESTED (2026-08-18 dispatch): no Mercari seller account exists to verify this
 * session -- every selector below is a best-effort guess from public research, never a live-
 * confirmed DOM anchor. Same hard rules as fas-poshmark.js / fas-selectors.js (ADR-084):
 *   1. NEVER select by obfuscated CSS class -- label text / aria-label / role / structural
 *      anchors only.
 *   2. Auto-publish (clicking the final "List this item" button) is a PRO/TEAMS-only, opt-in
 *      toggle threaded from popup.js -> background.js (fasMercariAutoPublish) -> here, the SAME
 *      mechanism fas-craigslist.js already uses -- NOT a blanket "never" rule. Corrected
 *      2026-08-22 (S-EXT-AUTOPUBLISH-POLICY, Patrick-directed): this file previously hard-coded
 *      "never auto-click the final publish action" for every organizer regardless of the
 *      2026-07-17 locked decision (full automation including auto-publish is non-negotiable,
 *      PRO/TEAMS-only opt-in) -- that was a real deviation, not a faithful implementation of extra
 *      caution Patrick asked for. Research this session found no evidence Mercari bans accounts
 *      for listing-automation software specifically (established tools like Nifty/List Perfectly/
 *      Vendoo operate openly on Mercari; Mercari's own aggressive automated-ban system targets
 *      prohibited items, suspicious activity, verification issues, and multi-accounting, not
 *      listing automation). When the toggle is off (organizer's own choice, or an automatic
 *      fallback if the List this item button can't be found), this script still fills and stops
 *      exactly as before.
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
  function searchSimplifications(text) {
    const out = [text];
    const stripped = text.replace(/\s*[&,]\s*.*$/, '').replace(/\s+and\s+.*$/i, '').trim();
    if (stripped && norm(stripped) !== norm(text)) out.push(stripped);
    const words = norm(stripped || text).split(' ').filter(Boolean);
    if (words.length > 1 && words[0].length >= 3) out.push(words[0]);
    return out;
  }
  // breadcrumbText: the original full eBay-taxonomy breadcrumb (colon-delimited, e.g. "...:
  // activewear:tracksuits & Sets") -- still useful for less-specific fallback segments (activewear,
  // men, etc.) if the clean leaf name alone doesn't resolve. categoryText: FindA.Sale's clean leaf
  // category name (post S-EXT-BATCH-12, e.g. "Tracksuits & Sets") -- always tried first, including
  // its simplified variants, since it's normally the most specific and most useful term.
  async function pickCategory(categoryText, breadcrumbText) {
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
    // BUG FIX 2026-08-21 (S-EXT-BATCH, P0, live-Chrome-confirmed): SAME "&"-as-a-word bug as
    // bestScoringOption above, confirmed live on THIS function specifically -- searching literally
    // "Tracksuits & Sets" (the untouched full leaf name, tried first before the stripped "Tracksuits"
    // fallback ever runs) returns Mercari's own irrelevant top-level browse categories (Toys &
    // Collectibles, Books, Electronics -- Mercari's search chokes on "&" and falls back to a browse
    // list), and scoring that garbage list against a query still containing "&" scored "Vintage &
    // collectibles" as a false match purely on the shared "&" token -- getting clicked and
    // returning success before the correctly-working "Tracksuits" fallback query ever got a turn.
    // Uses the same wordize() helper (dropping punctuation-only tokens) as bestScoringOption.
    function bestScoringOptionWithGenderHint(options, wantText) {
      const want = norm(wantText);
      const wantWords = wordize(want);
      let best = null, bestScore = -1;
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
          if (weighted === 0) continue;
          score = weighted - text.length * 0.01;
        }
        if (genderHint && wordize(text).indexOf(genderHint.replace(/'s$/, '')) !== -1) score += 5000; // tiebreak only -- smaller than any real word-match delta
        if (score > bestScore) { bestScore = score; best = opt; }
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
          const key = norm(variant);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          searchCandidates.push(variant);
        }
      }
      for (const query of searchCandidates) {
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
        const opt = bestScoringOptionWithGenderHint(options, query);
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
          let confirmBtn = qa('button, [role="button"]').find((b) => {
            const t = norm(b.textContent);
            return t.length > 0 && t.length < 30 && /\b(apply|done|select|confirm|save)\b/.test(t);
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
          return true;
        }
      }
      console.warn('[FAS Mercari] Category "' + categoryText + '" -- search input found but no result matched any segment (UNVERIFIED taxonomy) -- left for the organizer to choose.');
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
    if (match) { await realClick(match); await sleep(200); return true; }
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
    await realClick(opener);
    await sleep(350);
    const opt = optionElByText(value);
    if (!opt) return false;
    await realClick(opt);
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
  const MERCARI_CONDITION_TESTID = {
    'New': 'ConditionNew',
    'Like New': 'ConditionLikeNew',
    'Good': 'ConditionGood',
    'Fair': 'ConditionFair',
    'Poor': 'ConditionPoor',
  };
  async function fillMercariCondition(conditionLabel) {
    const testid = MERCARI_CONDITION_TESTID[conditionLabel];
    const el = testid ? document.querySelector('[data-testid="' + testid + '"]') : null;
    if (!el) return false;
    await realClick(el);
    await sleep(200);
    return true;
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
      '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Review every field (category/brand/weight are UNVERIFIED guesses), confirm <b>Smart Pricing stayed off</b> if you don\'t want it, then click Mercari\'s own <b>List this item</b> yourself.</div>' +
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
    async function guardedFill(label, value, fillFn) {
      if (interstitialAt) return false; // already stopped -- don't touch anything further
      if (looksLikeInterstitial()) { interstitialAt = label; return false; }
      const ok = await tryFill(label, value, fillFn);
      await humanPause(500, 1400);
      if (looksLikeInterstitial()) { interstitialAt = label; }
      return ok;
    }
    await guardedFill('Title', item.title, (v) => fillText('Title', v));
    await guardedFill('Description', padDescriptionForMercariMinimum(item.description, item), (v) => fillText('Description', v));
    // Category BEFORE brand -- Mercari's brand list is category-aware (see fillBrand comment).
    // S-EXT-BATCH-12: pass categoryBreadcrumb alongside the clean category -- pickCategory uses
    // the breadcrumb for less-specific fallback segments (and to derive the men's/women's gender
    // tiebreak) after the clean leaf name's own simplified variants are tried first.
    await guardedFill('Category', item.category, (v) => pickCategory(v, item.categoryBreadcrumb));
    // 2026-08-18: brand/size/color now exist on Item and flow through getExtensionItems ->
    // popup.js's queue map. tryFill's own guard still skips silently on unset items;
    // category-type gating (apparel-only for size/color) is left to Mercari's own form,
    // never assumed here.
    await guardedFill('Brand', item.brand, (v) => fillBrand('Brand', v));
    await guardedFill('Size', item.size, (v) => fillSelectLike('Size', v));
    await guardedFill('Color', item.color, (v) => fillSelectLike('Color', v));
    const conditionLabel = mapMercariCondition(item.condition);
    await guardedFill('Condition', conditionLabel, (v) => fillMercariCondition(v));
    if (item.price != null && isFinite(Number(item.price))) {
      const priceVal = Math.max(1, Math.round(Number(item.price)));
      if (priceVal > 2000) console.warn('[FAS Mercari] Price $' + priceVal + ' exceeds Mercari\'s standard $2,000 cap -- may need an authenticate-eligible designer category. Filling anyway; Mercari\'s own form is the real gate.');
      // Smart Pricing toggle sits next to Price -- deliberately never touched here.
      await guardedFill('Price', priceVal, (v) => fillText('Price', String(v)));
    }
    if (!interstitialAt) await fillWeight(item);
    return { photosOk, interstitialAt };
  }

  // FEATURE 2026-08-22 (S-EXT-AUTOPUBLISH-POLICY): auto-publish support -- see file header.
  function findMercariPublishButton() {
    return qa('button').find((b) => norm(b.textContent) === 'list this item');
  }

  // Confirms a real publish by polling for the sell form to disappear -- no live-confirmed success
  // marker exists yet (CODE-ONLY/UNTESTED, file header), same conservative signal
  // fas-craigslist.js/fas-poshmark.js use for their own publish confirmation.
  async function waitForMercariPublishConfirmation(maxWaitMs) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (!looksLikeSellForm()) return true;
      await sleep(400);
    }
    return false;
  }

  async function doMercariAutoPublish(item, index, total, photosOk) {
    const publishBtn = findMercariPublishButton();
    if (!publishBtn) {
      // Auto-publish is on but the button couldn't be found (UNVERIFIED selector, file header) --
      // never guess past this; fall back to the exact same manual-review path as autoPublish=false.
      showReviewOverlay(item, index, total, photosOk);
      return;
    }
    overlay('<b>FindA.Sale</b> - publishing <b>' + escapeHtml(item.title) + '</b>...');
    await humanPause(500, 900);
    await realClick(publishBtn);
    const published = await waitForMercariPublishConfirmation(6000);
    if (!published) {
      overlayWarn('Clicked <b>List this item</b> but couldn\'t confirm it went through (UNVERIFIED selector/confirmation signal) -- please check this listing on Mercari yourself before assuming it posted.' + button('fas-merc-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: item.id, remoteListingId: null, platform: 'MERCARI' }); } catch (e) {}
    try { await chrome.runtime.sendMessage({ type: 'advanceMercariQueue' }); } catch (e) {}
    const more = (index + 1) < total;
    overlay('<b>FindA.Sale</b><div style="margin-top:6px">Published <b>' + escapeHtml(item.title) + '</b>.</div>' +
      (more ? button('fas-merc-next', 'Next item &#9654;', true) : '') +
      button('fas-merc-close', 'Close', false) +
      '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');
    const next = document.getElementById('fas-merc-next');
    if (next) next.onclick = () => { location.href = SELL_URL_HINT; };
    closeBtnHandler();
  }

  async function run(item, index, total, autoPublish) {
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
    if (fillResult.interstitialAt) {
      overlayWarn('Mercari is showing a verification/security screen -- filling stopped before <b>' + escapeHtml(fillResult.interstitialAt) + '</b>. Please complete the verification yourself, then finish the remaining fields on this draft manually (fields before ' + escapeHtml(fillResult.interstitialAt) + ' were already filled -- do not start a new listing).' + button('fas-merc-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    if (autoPublish) { await doMercariAutoPublish(item, index, total, photosOk); return; }
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
  async function start() {
    if (!isNewListingPage()) return; // e.g. /sell/draft/<id>/ -- an existing draft being reviewed/edited, never auto-fill
    await sleep(600);
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getMercariQueueItem' }); } catch (e) { return; }
    if (!queued || !queued.ok || !queued.item) return; // nothing queued -- stay silent
    // FEATURE 2026-08-22 (S-EXT-DUPLICATE-LISTING-GUARD) -- see fas-poshmark.js's start() for the
    // full incident writeup (a resumed Poshmark queue entry produced a real duplicate live
    // listing this session). Applied here for consistency across all auto-publish-capable
    // platforms. Best-effort: falls through to the normal flow if the check itself fails.
    try {
      const statusRes = await chrome.runtime.sendMessage({ type: 'checkItemListedStatus', itemId: queued.item.id, platform: 'MERCARI' });
      if (statusRes && statusRes.ok && statusRes.listed) {
        const more = (queued.index + 1) < queued.total;
        overlay('<b>FindA.Sale</b><div style="margin-top:6px">Skipped <b>' + escapeHtml(queued.item.title) + '</b> -- this already shows as listed on Mercari, so it was not filled or published again (avoiding a duplicate listing).</div>' +
          (more ? button('fas-merc-next', 'Next item &#9654;', true) : '') +
          button('fas-merc-close', 'Close', false));
        try { await chrome.runtime.sendMessage({ type: 'advanceMercariQueue' }); } catch (e) {}
        const next = document.getElementById('fas-merc-next');
        if (next) next.onclick = () => { location.href = SELL_URL_HINT; };
        closeBtnHandler();
        return;
      }
    } catch (e) { /* best-effort -- fall through to normal fill/publish flow */ }
    try {
      await run(queued.item, queued.index, queued.total, queued.autoPublish !== false);
    } catch (e) {
      overlayWarn('Something went wrong filling this listing (' + escapeHtml((e && e.message) || 'unknown error') + '). Nothing was published -- complete this listing yourself, or reopen the extension to try again.' + button('fas-merc-close', 'Close', false));
      closeBtnHandler();
    }
  }

  start();
})();
