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

  // BUG FIX 2026-08-19 (S-EXT-BATCH-4, P0, live-Chrome-confirmed): Vinted's real category picker
  // opened by clicking the "category" input is NOT a plain click-through tree -- live DOM inspection
  // (data-testid="catalog-select-dropdown-content") showed a search box (#catalog-search-input,
  // placeholder "Find a category") plus a results list of plain, unmarked <div class="web_ui__Cell__title">
  // leaves (a "Suggested" section with full breadcrumb bodies like "Men > Clothing > Activewear", and a
  // "Catalog sections" section of top-level names like "Men"/"Women"). None of these carry role="option"
  // or role="menuitem", and the nearest matching ancestor optionElByText() could find was the outer <li>
  // wrapper -- clicking that li does NOT reach the real role="button" click handler, which sits on a
  // DESCENDANT div between the li and the title text (event bubbling only reaches ancestors of the click
  // target, never descendants). Clicking the innermost text-bearing leaf (Cell__title) is what actually
  // bubbles up through that handler. bestScoringOption mirrors fas-mercari.js's identical helper so both
  // search-based pickers use the same scored best-match logic instead of a first-substring-match guess.
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
  // BUG FIX 2026-08-21 (S-EXT-BATCH, P0, Patrick-directed -- "fill the fields properly or with a
  // proper default, not a skip message"): word-splitting only on literal spaces meant a real-world
  // value like "Cotton/Polyester Blend" or "Black/White" was treated as ONE unsplit token
  // ("cotton/polyester") that could never whole-word-match a plain option like "Cotton" -- live-
  // confirmed: bestScoringOption(["Cotton","Polyester",...], "Cotton/Polyester Blend") returned null
  // even though "Cotton" is a real, correct, literal substring of the query. Splitting on slash/
  // comma/ampersand too (in addition to whitespace) lets "Cotton" resolve out of "Cotton/Polyester
  // Blend" the same way "Cotton" already resolved out of "Cotton Blend" -- a genuine word-boundary
  // fix, not a fabricated guess: every matched word is still one Vinted actually listed as an
  // option, never an invented value.
  function splitWords(s) {
    return s.split(/[\s/,&]+/).filter(Boolean);
  }
  function bestScoringOption(options, wantText) {
    const want = norm(wantText);
    const wantWords = splitWords(want);
    let best = null;
    let bestScore = -1;
    for (const opt of options) {
      const text = norm(opt.textContent);
      if (!text) continue;
      let score;
      if (text === want) {
        score = 100000;
      } else {
        const textWords = splitWords(text);
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

  // BUG FIX 2026-08-19 (S-EXT-BATCH-4, P0, live-Chrome-confirmed): Category/Brand/Size/Condition/
  // Color/Material all open the SAME family of floating picker panels when their (readonly) field is
  // clicked, but the panel's internal shape differs per field, confirmed live against
  // https://www.vinted.com/items/new via data-testid inspection:
  //   - Category (catalog-select-dropdown-*) and Brand (brand-select-dropdown-*) and Color
  //     (color-select-dropdown-*): a SEPARATE nested search input opens inside the panel
  //     (#catalog-search-input, #brand-search-input, etc.) -- typing into the outer readonly field
  //     itself (the old fillBrand/pickCategory approach) does nothing, since that field only ever
  //     reflects the already-CONFIRMED selection, not a live filter.
  //   - Size (category-size-single-grid-*) and Condition (category-condition-single-list-*) and
  //     Material (category-material-multi-list-*): no search input -- the panel shows a small fixed
  //     option set immediately (e.g. xs/s/m/l/xl or New with tags/New without tags/Very good/Good/
  //     Satisfactory) as plain leaf elements (a <span> for Size, a `[data-testid$="--title"]` <div>
  //     for Condition) -- neither carries role="option"/"menuitem", matching the same non-ARIA pattern
  //     already found on Poshmark. Rather than hardcode Vinted's versioned CSS-module class names
  //     (e.g. "web_ui__Cell__title", fragile the moment Vinted ships a new build hash), this scans
  //     the open panel for ANY visible, childless, short-text element and scores it against the
  //     target value with the same bestScoringOption used for the search-driven fields.
  // BUG FIX 2026-08-21 (S-EXT-BATCH, P0, live-Chrome-confirmed): raw fieldId substring matching
  // above collided with Vinted's PERMANENTLY-VISIBLE "Package size" shipping section, whose real
  // testids ("1-package-size--cell--content", "2-package-size--cell--content", "3-package-size--
  // cell--content", "package-size-suggestion-badge-id-3--content") all contain the literal
  // substring "size". Live-confirmed this always won findOpenPanel('size', true) BEFORE the real
  // clothing-size panel ("category-size-single-grid-content") was ever considered, because these
  // elements are part of the normal always-rendered Shipping section (offsetParent !== null at all
  // times), not a temporary open panel. Concretely, this made pickFromPanel('size', ...) believe a
  // panel was "already open" (skipping the real opener.click() entirely), then score the target
  // clothing size (e.g. "Medium") against the Package-size leaves (Small/Medium/Large) -- "Medium"
  // is an EXACT text match there too, so the code silently clicked the already-selected Package
  // Size radio and reported success, never touching the real clothing Size dropdown at all. This is
  // the confirmed root cause of Vinted's Size field appearing "stuck"/never filled. Fixed with an
  // explicit per-field testid hint (Vinted's own real prefixes, taken directly from the comment
  // above) checked FIRST -- only fields with no known hint fall back to the raw fieldId substring.
  const FIELD_PANEL_TESTID_HINTS = {
    category: 'catalog-select-dropdown',
    brand: 'brand-select-dropdown',
    color: 'color-select-dropdown',
    size: 'category-size-single-grid',
    condition: 'category-condition-single-list',
    material: 'category-material-multi-list',
  };
  function findOpenPanel(fieldId, strict) {
    // Vinted names each panel's container '<field>-...-content' (confirmed: catalog-select-dropdown
    // -content, brand-select-dropdown-content, color-select-dropdown-content, category-size-single-
    // grid-content, category-condition-single-list-content, category-material-multi-list-content).
    const testidHint = FIELD_PANEL_TESTID_HINTS[fieldId] || fieldId;
    const byTestid = qa('[data-testid*="content" i]').find((el) => {
      const t = norm(el.getAttribute('data-testid') || '');
      return t.indexOf(testidHint) !== -1 && el.offsetParent !== null;
    });
    if (byTestid) return byTestid;
    // BUG FIX 2026-08-20 (S-EXT-BATCH-9, P0, live-Chrome-confirmed): `strict` skips the generic
    // fallback below entirely. See pickFromPanel's comment on why this matters -- the fallback finds
    // ANY visible dropdown-shaped element with no check that it actually belongs to fieldId, which
    // let a stray still-open panel from an EARLIER field (Material's multi-select list does not
    // auto-close itself after a pick, live-confirmed by its own testid never disappearing from the
    // DOM's visible set after clicking one option) get misread as "Condition's panel is already
    // open" for the NEXT field in fill order, skipping the real open-click entirely and leaving
    // Condition's actual panel never opened on the first pass.
    if (strict) return null;
    // Fallback: any visible panel-looking element that just appeared (class name contains "dropdown"
    // or "panel" or "popover"), least-fragile generic guess if the testid naming ever changes.
    return qa('[class*="dropdown" i], [class*="Dropdown" i], [role="dialog"], [role="listbox"]')
      .find((el) => el.offsetParent !== null) || null;
  }
  function leafOptionsIn(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll('*')).filter((el) => {
      if (el.children.length > 0) return false;
      const txt = el.textContent && el.textContent.trim();
      if (!txt || txt.length === 0 || txt.length > 40) return false;
      return el.offsetParent !== null;
    });
  }
  // BUG FIX 2026-08-20 (S-EXT-BATCH, P0, Patrick-directed -- "fill the fields properly or with a
  // proper default, not a skip message"): live-confirmed this session by reading Vinted's actual
  // full option lists directly off the page. Size fails because Vinted's real grid is letter codes
  // only (XS/S/M/L/XL/XXL/XXXL/4XL.../8XL/One size) -- "Medium" never whole-word-matches leaf "M".
  // Color/Material fail because words like "Neon"/"Blended" simply aren't in Vinted's fixed
  // vocabulary (33 real colors, 58 real materials, confirmed live -- neither word appears in
  // either list). These maps remap a common non-Vinted word to the real option BEFORE scoring, so
  // most values resolve to something real instead of silently failing.
  const SIZE_ABBREVIATIONS = {
    'x-small': 'XS', 'xsmall': 'XS', 'extra small': 'XS', 'xs': 'XS',
    small: 'S', s: 'S',
    medium: 'M', m: 'M',
    large: 'L', l: 'L',
    'x-large': 'XL', 'xlarge': 'XL', 'extra large': 'XL', 'xl': 'XL',
    'xx-large': 'XXL', 'xxlarge': 'XXL', 'xxl': 'XXL',
    'xxx-large': 'XXXL', 'xxxlarge': 'XXXL', 'xxxl': 'XXXL',
    'one size': 'One size', 'os': 'One size', 'onesize': 'One size',
  };
  // Nearest-real-swatch mappings, not exact synonyms -- Vinted has no "Neon"/"Tan"/etc option, so
  // these are the closest reasonable real color a human would pick. Commented per-mapping so a
  // reviewer can judge/adjust any single one without re-deriving the whole table.
  const COLOR_SYNONYMS = {
    neon: 'Yellow', // no neon swatch on Vinted -- Yellow is the closest real option
    tan: 'Beige',
    maroon: 'Burgundy',
    olive: 'Khaki',
    ivory: 'Cream',
    teal: 'Turquoise',
    charcoal: 'Gray', grey: 'Gray',
    rust: 'Orange',
    lavender: 'Lilac',
    magenta: 'Pink',
    indigo: 'Navy',
    'off white': 'White', offwhite: 'White',
    multicolor: 'Multi', multicolour: 'Multi', 'multi-color': 'Multi', 'multi color': 'Multi',
    transparent: 'Clear',
  };
  // Real single-fiber synonyms only -- deliberately does NOT include "blended"/"mixed"/"mixed
  // fibers": picking one real fiber (e.g. Cotton) for an item that's actually a poly-cotton blend
  // would misrepresent the listing's material composition, a real accuracy problem, not just a UX
  // one. Those specific words are left unmapped on purpose so they still fall through to the
  // honest skip-with-warning path below.
  const MATERIAL_SYNONYMS = {
    spandex: 'Elastane', lycra: 'Elastane',
    vinyl: 'Plastic',
    sherpa: 'Fleece',
    pleather: 'Faux leather',
    viscose: 'Rayon',
  };
  function resolveSynonym(fieldId, value) {
    const key = norm(value);
    if (fieldId === 'size' && SIZE_ABBREVIATIONS[key]) return SIZE_ABBREVIATIONS[key];
    if (fieldId === 'color' && COLOR_SYNONYMS[key]) return COLOR_SYNONYMS[key];
    if (fieldId === 'material' && MATERIAL_SYNONYMS[key]) return MATERIAL_SYNONYMS[key];
    return value;
  }
  // BUG FIX 2026-08-20 (S-EXT-BATCH, P0, live-Chrome-confirmed): Size/Color/Material panels were
  // confirmed live to stay open SIMULTANEOUSLY (all 3 visible stacked on the same real page after
  // a run) -- pickFromPanel's existing stray-dismiss (a bare document.body.click()) isn't actually
  // closing Vinted's panels. Explicitly closes via Escape + an off-panel click, then verifies via
  // findOpenPanel before moving on. Best-effort: never throws, just logs if a panel refuses to close.
  async function closePanel(fieldId) {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await sleep(150);
    if (findOpenPanel(fieldId, true)) {
      const heading = document.querySelector('h1, h2') || document.body;
      heading.click();
      await sleep(200);
    }
    if (findOpenPanel(fieldId, true)) {
      console.warn('[FAS Vinted] Panel for "' + fieldId + '" did not confirm closed -- it may still be visible on top of the next field.');
    }
  }

  async function pickFromPanel(fieldId, labelText, value) {
    const opener = openerByLabel(labelText) || document.getElementById(fieldId);
    if (!opener) return false;
    // BUG FIX 2026-08-19 (S-EXT-BATCH-6, P0, live-Chrome-confirmed): pickCategory() calls
    // pickFromPanel once PER segment attempt against the SAME field -- the old unconditional
    // opener.click() here meant the second call could TOGGLE an already-open panel CLOSED instead
    // of leaving it open, silently breaking every attempt after the first. Only click to open if
    // the panel isn't already open for this field.
    // BUG FIX 2026-08-20 (S-EXT-BATCH-9, P0, live-Chrome-confirmed): "already open" must be checked
    // STRICTLY (an exact fieldId testid match) here, not via findOpenPanel's generic any-visible-
    // dropdown fallback -- live-confirmed root cause of Condition being left open/unfilled: Material
    // (a multi-select list) does not auto-close after a pick, so by the time fillListing() reaches
    // Condition next, Material's own panel is still visible; the generic fallback matched IT as if
    // it were "Condition's panel, already open", skipped the real opener.click(), scored Condition's
    // target value against Material's option leaves (no match), fell through to the old broken
    // fallback path below, which finally clicked the real opener but then couldn't find a matching
    // option there either -- leaving the real Condition panel open with nothing selected, exactly as
    // Patrick observed live. If a stray panel for a DIFFERENT field is still open, dismiss it first
    // (click elsewhere on the page) so it can't be mistaken for this field's panel.
    let panelAlready = findOpenPanel(fieldId, true);
    if (!panelAlready) {
      const strayPanel = findOpenPanel(fieldId, false);
      if (strayPanel) {
        document.body.click();
        await sleep(250);
      }
      opener.click();
      await sleep(400);
    }
    // BUG FIX 2026-08-19 (S-EXT-BATCH-4, P0, live-Chrome-confirmed): the search input MUST be looked
    // up scoped to the just-opened panel, not page-wide. Vinted's site nav bar has its own unrelated
    // input[data-testid="search-text--input"] (id="search_text") that a page-wide selector also
    // matches -- confirmed live it was silently winning the .find() for Color (which has NO real
    // search input at all, just a color-swatch grid: filter-grid-option-N/color-N testids). Typing a
    // color name into Vinted's live site-search box triggered a real navigation/autocomplete side
    // effect that froze the tab (CDP Runtime.evaluate timeout hit during this exact live test).
    // Find the panel FIRST, then only look for a search input that is a DESCENDANT of that panel.
    const panel = findOpenPanel(fieldId);
    // qa() only ever queries from `document` (its sel-only signature, shared across all 4 platform
    // files) -- passing panel as a second arg to it would be silently ignored, NOT scoped. Query
    // directly off panel.querySelectorAll instead so this genuinely stays panel-scoped.
    const searchInput = panel
      ? Array.from(panel.querySelectorAll('input[data-testid*="search" i]')).find((el) => el.offsetParent !== null)
        || Array.from(panel.querySelectorAll('input[type="text"], input:not([type])')).find((el) => {
          const ph = norm(el.getAttribute('placeholder') || '');
          return el.offsetParent !== null && el !== opener && (ph.indexOf('search') !== -1 || ph.indexOf('find') !== -1);
        })
      : null;
    if (searchInput) {
      searchInput.focus();
      setNativeValue(searchInput, String(value));
      // BUG FIX 2026-08-19 (S-EXT-BATCH-7, P1, live-Chrome-confirmed): a fixed 600ms sleep here was
      // sometimes NOT enough for Vinted's search debounce to actually render results -- live-
      // confirmed: calling pickCategory('Men:Clothing:Activewear:Shorts') against a real page (the
      // exact category from Patrick's own screenshot) returned false (no match) on the first try,
      // but a follow-up inspection moments later showed the SAME panel now correctly containing a
      // "Shorts" leaf under "Men > Clothing > Activewear" -- the real results simply hadn't rendered
      // yet at the 600ms mark. Polls for a non-empty leaf list instead of a single blind wait, up to
      // ~1.2s total (300ms x 4) -- deliberately short and NEVER re-types/re-searches mid-poll (only
      // reads the DOM), since retyping/resubmitting queries in a loop is what caused a real tab
      // freeze earlier (see pickCategory's own comment on the 2-candidate cap).
      for (let i = 0; i < 4; i++) {
        await sleep(300);
        if (leafOptionsIn(panel).length > 1) break; // >1 excludes the lone placeholder/heading leaf
      }
    }
    const leaves = leafOptionsIn(panel);
    // BUG FIX 2026-08-20 (S-EXT-BATCH, P0): resolve common non-Vinted words to a real option
    // before scoring -- see SIZE_ABBREVIATIONS/COLOR_SYNONYMS/MATERIAL_SYNONYMS comment above.
    const resolvedValue = resolveSynonym(fieldId, value);
    const opt = bestScoringOption(leaves, resolvedValue);
    if (opt) {
      // BUG FIX 2026-08-19 (S-EXT-BATCH-4, P1, live-Chrome-confirmed, corrected after a live re-check
      // caught the first version of this fix as a regression): clicking the innermost leaf worked
      // reliably for Category/Size/Brand/Condition/Material (all live-confirmed setting the field's
      // real value). Color's swatch grid did NOT reliably register on the leaf <span> alone --
      // clicking its nearest data-testid ancestor ([data-testid="color-N"]) did. The first attempt at
      // this fix used opt.closest('[data-testid]') unconditionally -- re-tested live against Category
      // and that climbs ALL the way to [data-testid="catalog-select-dropdown-content"] (the whole
      // results panel, 677 chars of unrelated option text), because Category's own option leaves have
      // NO close data-testid ancestor at all. Clicking that would have silently done nothing. Bound
      // the climb: only use a data-testid ancestor within 3 hops AND whose own text is still
      // option-sized (<=80 chars, i.e. clearly one option, not the whole panel) -- otherwise click the
      // leaf itself, which is what's already confirmed working for every field except Color.
      let clickTarget = opt;
      let hop = opt;
      for (let i = 0; i < 3 && hop; i++) {
        hop = hop.parentElement;
        if (hop && hop.hasAttribute('data-testid') && hop.textContent.trim().length <= 80) {
          clickTarget = hop;
          break;
        }
      }
      clickTarget.click();
      await sleep(350);
      await closePanel(fieldId);
      return true;
    }
    await closePanel(fieldId);
    return false;
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
    // Try the shared panel picker first with the most-specific segment (Vinted's "Suggested" search
    // results are full resolved leaf paths, e.g. "Shorts" -> Men > Clothing > Activewear, live-
    // confirmed to fully select in one shot) before falling back to the older segmented search below.
    // BUG FIX 2026-08-19 (S-EXT-BATCH-6, P1, live-Chrome-confirmed): the old version tried EVERY
    // reversed segment plus the full string (up to 5+ queries for a deep category path), typing
    // each into Vinted's real live search sequentially -- live-confirmed this can freeze the tab
    // (a `CDP Runtime.evaluate` timeout was hit live typing two nonsense/no-match queries back to
    // back; Vinted's search appears to do something expensive on a query that returns nothing).
    // Capped to the 2 most useful candidates -- the most-specific (last) segment, which is what
    // actually matches a real leaf category, and the full string as a single fallback -- both
    // meaningfully distinct from broad, unlikely-to-match middle segments.
    const quickSegments = categoryText.split(':').map((s) => s.trim()).filter(Boolean);
    const quickCandidates = [];
    if (quickSegments.length) quickCandidates.push(quickSegments[quickSegments.length - 1]);
    if (categoryText && quickCandidates.indexOf(categoryText) === -1) quickCandidates.push(categoryText);
    for (const seg of quickCandidates) {
      if (!seg) continue;
      // BUG FIX 2026-08-20 (S-EXT-BATCH-10, P0, live-Chrome-confirmed): fieldId here was the
      // literal string 'category', but Vinted's real panel testid is "catalog-select-dropdown-
      // content" -- 'category' is not a substring of 'catalog', so findOpenPanel's STRICT
      // testid lookup could never find this panel by name at all. It was only ever found through
      // the generic any-visible-dropdown fallback, which returns whatever dropdown-shaped element
      // happens to match first -- not reliably scoped to Category specifically. This is the
      // confirmed root cause of a live wrong pick (item was a tracksuit; picker chose "Lots &
      // sets" instead of "Tracksuits"): with the panel misidentified, pickFromPanel's OWN
      // search-input lookup (also testid-based) never found the real #catalog-search-input
      // either, so it silently fell back to scoring the STATIC, unfiltered default leaf list
      // instead of real search results -- "Lots & sets" won only because it coincidentally
      // shares the whole word "sets" with "tracksuits & sets". Using the real 'catalog' prefix
      // fixes the strict panel match, which in turn lets the real search input be found and
      // actually searched.
      if (await pickFromPanel('catalog', 'Category', seg)) return true;
      await sleep(300); // settle before trying the next candidate -- avoid overlapping search requests
    }
    const opener = openerByLabel('Category');
    if (!opener) return false;
    opener.click();
    await sleep(400);
    const segments = quickSegments;
    // BUG FIX 2026-08-19 (S-EXT-BATCH-4, P0, live-Chrome-confirmed): prefer the real search input
    // (#catalog-search-input, confirmed live) over the old blind tree-walk -- see bestScoringOption's
    // comment above for the full live-DOM finding. Searching the most specific segment first (reversed)
    // then the full string mirrors fas-mercari.js's identical fix for the same picker shape.
    const searchInput = document.getElementById('catalog-search-input')
      || qa('input[type="text"], input:not([type])').find((el) => {
        const ph = norm(el.getAttribute('placeholder') || '');
        return ph.indexOf('find a categor') !== -1 || (ph.indexOf('search') !== -1 && ph.indexOf('categor') !== -1);
      });
    if (searchInput) {
      const searchCandidates = [...segments.slice().reverse(), categoryText];
      for (const query of searchCandidates) {
        if (!query) continue;
        searchInput.focus();
        setNativeValue(searchInput, query);
        await sleep(600);
        const leaves = qa('.web_ui__Cell__title, [role="option"], li[role="option"], [role="menuitemradio"]')
          .filter((el) => el.textContent && el.textContent.trim().length > 0 && el.textContent.trim().length < 60);
        const opt = bestScoringOption(leaves, query);
        if (opt) {
          opt.click();
          await sleep(300);
          return true;
        }
      }
      console.warn('[FAS Vinted] Category "' + categoryText + '" -- search input found but no result matched any segment (UNVERIFIED taxonomy) -- left for the organizer to choose.');
      return false;
    }
    // Fallback: old blind tree-walk, kept in case Vinted ever reverts to a plain click-through tree.
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
    // BUG FIX 2026-08-19 (S-EXT-BATCH-4, P0, live-Chrome-confirmed): the old version typed directly
    // into #brand -- but #brand is `readonly` (confirmed live) and only ever reflects the CONFIRMED
    // selection. The real live-filter is a separate nested input, #brand-search-input, that only
    // exists after #brand is clicked open -- see pickFromPanel's comment above for the full finding.
    if (await pickFromPanel('brand', labelText, value)) return true;
    const noBrand = qa('[role="option"], li, div[role="button"], button, [data-testid$="--title"]').find((n) => /no brand/.test(norm(n.textContent)));
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
    // BUG FIX 2026-08-19 (S-EXT-BATCH-4, P0, live-Chrome-confirmed): the old version clicked the
    // opener then matched optionElByText (role="option"/li only) -- live DOM showed Size's grid uses
    // plain <span> leaves and Condition's list uses `[data-testid$="--title"]` <div> leaves, neither
    // of which optionElByText could ever match. pickFromPanel's generic childless-leaf scan (shared
    // with Category/Brand) is class-name-agnostic and live-confirmed working for both widget shapes.
    const fieldId = norm(labelText).replace(/[^a-z0-9]+/g, '');
    if (await pickFromPanel(fieldId, labelText, value)) return true;
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

  // BUG FIX 2026-08-19 (S-EXT-BATCH-5, P0, live-Chrome-confirmed): run()'s gate used to check
  // looksLikeListingForm() exactly ONCE, immediately, with no retry -- live-confirmed on Mercari this fires too
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
      if (looksLikeListingForm()) return 'ready';
      await sleep(400);
    }
    return 'timeout';
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
    // BUG FIX 2026-08-19 (S-EXT-BATCH-5, P0): was two separate immediate checks (interstitial,
    // then listing-form) -- see waitForFormReady()'s comment (fas-mercari.js) for the live-
    // confirmed SPA-hydration race this pattern is vulnerable to on every one of these 4 files.
    // Merged into a single poll: waits for either signal to become true instead of judging the
    // page's state from a single snapshot taken right as the content script loads.
    const formState = await waitForFormReady(8000);
    if (formState === 'interstitial') {
      overlayWarn('Vinted is showing a verification/security screen. FindA.Sale never attempts to solve this -- please complete it yourself, then reopen the extension to continue.' + button('fas-vin-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    if (formState === 'timeout') {
      overlayWarn('This doesn\'t look like a fillable Vinted listing form yet (checked repeatedly for several seconds). If you\'re on the right page, this is an UNVERIFIED-selector miss -- please fill it in yourself.' + button('fas-vin-close', 'Close', false));
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
