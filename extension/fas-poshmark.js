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
  // BUG FIX 2026-08-21 (S-EXT-BATCH, P0, live-Chrome-confirmed): openerByLabel/fieldByLabel/
  // nearestControlAfter all used plain text.indexOf(want) !== -1 to decide "this element is the
  // field I'm looking for" -- a raw substring test with no word boundary. Live-confirmed this
  // broke Category outright: openerByLabel('Category') matched the Subcategory dropdown instead
  // ("Select Subcategory (optional)" contains the literal substring "category" inside the compound
  // word "Subcategory"), so pickCategory('Category') was clicking through the WRONG dropdown the
  // entire time -- Category itself was NEVER actually touched, which is exactly why Poshmark's own
  // Size field then correctly refused with "Please select the category first" (a real Poshmark
  // validation message, not a bug on their end). wordBoundaryHas requires the target word to be a
  // whole word in the candidate text (bounded by non-letters or string edges), so "category" no
  // longer matches inside "subcategory" the same way Vinted's tokenized scoring already stopped
  // "size" matching inside "package-size".
  // BUG FIX 2026-08-21 (S-EXT-BATCH, P0, live-Chrome-confirmed): a bare el.click() on Poshmark's
  // Category/Size/Color/Condition drill-down menu items (real <li> elements, no __vue__ instance of
  // their own -- their click handler is bound higher up, likely via Vue event delegation) silently
  // did NOTHING -- confirmed live: calling jeansLi.click() left the menu showing the exact same
  // items afterward, while a real trusted mouse click (via the computer-use tool, not JS) correctly
  // drilled into the next level. Dispatching a full pointerdown/mousedown/pointerup/mouseup/click
  // sequence with real coordinates (from getBoundingClientRect) and bubbles/composed:true, matching
  // what a genuine mouse interaction produces, live-confirmed working identically to the real click
  // -- drilled from Men into Jeans into the fit sub-list correctly. Used for every leaf-option click
  // in this file from here on, replacing the bare .click() calls that were confirmed no-ops.
  // BUG FIX 2026-08-21 (round 2, live-Chrome-confirmed): the full pointer-event sequence above
  // fixed leaf items shaped like <li><div>Jeans</div></li>, but top-level department items
  // (Women/Men/Kids/...) are shaped differently -- <li><a data-et-name="men" ...>Men</a></li> --
  // and dispatching the SAME event sequence at the outer <li> did NOT drill down (confirmed live,
  // repeatable: 3 separate attempts on the outer <li> left the menu unchanged), while dispatching
  // the identical sequence at the INNER <a> worked correctly every time. Poshmark's click handler
  // for this level is bound to the anchor itself, not delegated up to the <li> the way the deeper
  // leaf levels are. Resolving to the innermost clickable descendant (a/button) when one exists,
  // falling back to the element itself otherwise, covers both shapes without needing to know which
  // one a given level uses.
  // BUG FIX 2026-08-22 (P0, Patrick-directed, live-Chrome-confirmed): Condition's real option
  // shape (<li><div data-et-name="listing_condition" ...><div class="fw--med">Good</div>
  // <div>description...</div></div></li>) has NO nested <a> or <button> at all, so this used to
  // fall through to dispatching on the outer <li> itself -- but Poshmark's actual click listener
  // for this widget is bound to the INNER `[data-et-name]` div specifically, a descendant of the
  // li, and a dispatched event's listeners only fire on the target element and its ANCESTORS during
  // bubbling, never on descendants -- so the real listener never received the click and Condition
  // silently failed to select despite the correct option being found (live-confirmed: dispatching
  // on the li did nothing; dispatching the identical event sequence on the inner
  // `[data-et-name]` div selected "Good" correctly, screenshot-confirmed). `[data-et-name]` is
  // Poshmark's own real test-automation/analytics hook (a structural anchor, not an obfuscated
  // utility class), consistent with this file's "never select by CSS class" rule. Checked AFTER
  // a/button (which already correctly resolves Category's department-level `<a data-et-name=...>`
  // items) so this only adds a new fallback tier -- no change for any element that already worked.
  function realClick(el) {
    if (!el) return;
    const target = el.querySelector('a, button') || el.querySelector('[data-et-name]') || el;
    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const opts = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 0, buttons: 1 };
    target.dispatchEvent(new PointerEvent('pointerdown', opts));
    target.dispatchEvent(new MouseEvent('mousedown', opts));
    target.dispatchEvent(new PointerEvent('pointerup', opts));
    target.dispatchEvent(new MouseEvent('mouseup', opts));
    target.dispatchEvent(new MouseEvent('click', opts));
  }
  function wordBoundaryHas(text, want) {
    if (!text || !want) return false;
    const re = new RegExp('(^|[^a-z0-9])' + want.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])');
    return re.test(text);
  }
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
    // BUG FIX 2026-08-21 (S-EXT-BATCH, P0, live-Chrome-confirmed): the old single-pass loop
    // accepted the FIRST element whose text merely CONTAINED the label word as a substring, with no
    // preference for an actual field-label-shaped match over incidental prose -- live-confirmed
    // this made nearestControlAfter('Brand') match Poshmark's own TITLE section helper text
    // ("Share key details like Brand, Size, and Color.", a <p> that appears BEFORE the real
    // Brand field in document order) instead of the real Brand label (a bare `<div>Brand</div>`
    // appearing later), walked forward from that WRONG paragraph, and returned the TITLE input --
    // which then got overwritten with the Brand value ("Adidas") after Title had already been
    // filled correctly, confirmed live: the Title field showed "Adidas" instead of the real title
    // after a real fillListing() run. Fixed with two passes: first look for an EXACT text match
    // (real Poshmark field labels are always a single bare word, e.g. "Brand", "Size" -- never a
    // full sentence), only falling back to substring matching if no exact match exists anywhere,
    // and even then skipping any candidate whose text contains a comma (the reliable signal of
    // descriptive/instructional prose like the Title helper text, never a real field label).
    function tryCandidates(list) {
      for (const el of list) {
        if (el.querySelector(CONTROL_SELECTOR)) continue;
        let control = searchFollowingSiblings(el, 6);
        if (control) return control;
        let ancestor = el.parentElement;
        for (let up = 0; up < 3 && ancestor; up++) {
          control = searchFollowingSiblings(ancestor, 3);
          if (control) return control;
          ancestor = ancestor.parentElement;
        }
      }
      return null;
    }
    const exact = headingCandidates.filter((el) => norm(el.textContent) === want);
    const exactResult = tryCandidates(exact);
    if (exactResult) return exactResult;
    const loose = headingCandidates.filter((el) => {
      const txt = norm(el.textContent);
      return txt && txt.length <= 80 && wordBoundaryHas(txt, want) && txt.indexOf(',') === -1;
    });
    return tryCandidates(loose);
  }
  function fieldByLabel(labelText) {
    const want = norm(labelText);
    const labels = qa('label');
    for (const lab of labels) {
      const txt = norm(lab.getAttribute('aria-label') || lab.textContent);
      if (txt === want || wordBoundaryHas(txt, want)) {
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
  // *** RESOLVED 2026-08-20 (S-EXT-BATCH, P0, live-Chrome-confirmed -- supersedes the prior
  // "confirmed platform limitation" note from S-EXT-BATCH-10 below, kept only for history): the
  // prior note assumed chrome.debugger/CDP was the only way to produce a click Poshmark's dropdown
  // would accept, and that assumption was WRONG -- confirmed this session by checking what real,
  // working competitor extensions actually declare in their Chrome Web Store manifests (Vendoo
  // Crosslist Extension v3, 60K users, and Crosslist, 10K users, both list Poshmark support; NEITHER
  // has ever requested the "debugger" permission in their full multi-year permission-change
  // history). The real fix: Poshmark's dropdown is a Vue 2 component (data-test="dropdown", a real
  // `__vue__` instance is present on the element, componentName "Dropdown", with a local reactive
  // data property `isExpaned` controlling visibility) -- not React, and not something any DOM-event
  // trick (trusted or synthetic) needed to fake at all. Setting `opener.__vue__.isExpaned = true`
  // directly opens the real menu -- screenshot-confirmed live. Once open, plain .click() on the
  // leaf option elements works normally (also confirmed live: clicking "Men" correctly drilled into
  // that subcategory) -- only the OPENER needed this treatment. See vueOpenDropdown() below, used by
  // both fillSelectLike and pickCategory in place of the old opener.click().
  //
  // ORIGINAL NOTE (S-EXT-BATCH-10, 2026-08-20, kept for history -- the "only chrome.debugger can do
  // this" conclusion below is superseded by the finding above): Poshmark's custom dropdown fields
  // (Category/Size/Color/Condition -- all share the same `data-test="dropdown"` component) do not
  // open in response to a plain el.click(), a full pointer-event sequence at real screen
  // coordinates, el.focus()+keydown Enter, or clicking the inner dropdown-container child --
  // confirmed live, all failed with zero new DOM nodes. A real mouse click via Chrome's own input
  // pipeline opened it correctly. ***
  function openerByLabel(labelText) {
    const want = norm(labelText);
    const direct = document.querySelector('[aria-label="' + labelText + '"]');
    if (direct) return direct;
    // Added [role="switch"] (BUG FIX 2026-08-19, S-EXT-BATCH-2, P1) -- toggle-switch semantics are
    // common on modern SPA forms (e.g. Grailed's international-shipping region toggles) and were
    // entirely absent from this candidate list before, a likely contributor to those toggles never
    // being found at all.
    const candidates = qa('[role="combobox"], [role="button"], [role="switch"], button, select, div[tabindex]');
    // BUG FIX 2026-08-21 (S-EXT-BATCH, P0, live-Chrome-confirmed root cause of Size never filling
    // -- and Poshmark's own "Please select the category first" message staying stuck even after
    // Category genuinely committed): live-confirmed via Poshmark's own Vue instance that Category
    // DOES set the real categoryId correctly and Size's `preventClick` prop DOES flip to false --
    // the field is actually unlocked. The failure is earlier: `openerByLabel('Size')` never finds
    // an opener at all. Poshmark's Size widget is a single Vue component whose top DOM node
    // contains BOTH the "Select Size" placeholder AND its own dropdown panel content (tabs, every
    // size option, a "Done" button) already present in the DOM at all times -- confirmed live its
    // combined textContent is 142 chars ("Select Size Standard Plus Petite ... Measurements Done"),
    // so the old `text.length < 80` cap (meant to reject a giant unrelated container, like an
    // entire form or nav flyout) rejected this legitimate single-field opener too. Category's own
    // opener happened to stay under 80 chars, which is why it worked while Size never did. Loosened
    // the check: still require < 80 chars OR the wanted word to appear within the first 20
    // characters of the normalized text -- true here ("select size..." -- "size" at index 7) and
    // for any genuine label-prefixed opener, but still rejects a huge container where the word is
    // buried deep inside unrelated content (the exact case the original cap was protecting against).
    const hit = candidates.find((c) => {
      const text = norm(c.getAttribute('aria-label') || c.textContent);
      if (!wordBoundaryHas(text, want)) return false;
      return text.length < 80 || text.indexOf(want) < 20;
    });
    if (hit) return hit;
    const labels = qa('label');
    for (const lab of labels) {
      if (wordBoundaryHas(norm(lab.textContent), want)) {
        const forId = lab.getAttribute('for');
        if (forId) { const byId = document.getElementById(forId); if (byId) return byId; }
        const inner = lab.querySelector('button, [role="button"], [role="switch"], select, [role="combobox"], div[tabindex]');
        if (inner) return inner;
        return lab;
      }
    }
    return nearestControlAfter(labelText);
  }
  // BUG FIX (this pass, live-Chrome-confirmed root cause of Size picking "Women" for a query of
  // "M"): the old fallback tier was a raw `.indexOf(want)`, so a 1-2 char size code like "M"/"S"/"L"
  // matched as a substring of ANY unrelated option text that happened to contain that letter (e.g.
  // "Women" contains "m", live-confirmed this exact collision selected "Women" -- a leftover, still-
  // open Category menu item -- instead of any real size option). Switched to wordBoundaryHas so the
  // fallback only fires when `want` appears as a whole word, never as a bare letter/substring inside
  // an unrelated word.
  // BUG FIX 2026-08-22 (P0, Patrick-directed, live-Chrome-confirmed): some Poshmark option lists
  // (live-confirmed: Condition) render a bold title line AND a separate description line inside
  // the SAME li (e.g. "Good" + "Gently used with minimal signs of wear, to note in description or
  // photos", real confirmed DOM: <li><div><div class="fw--med">Good</div><div>description...
  // </div></div></li>) -- the option's full textContent is then well over 100 chars, which both
  // defeats an exact match against the plain value AND the old 60-char-capped fallback below, so a
  // perfectly correct value like "Good" could never match at all. Poshmark's own first-child chain
  // reliably carries just the title in that shape; a plain single-line option (Category/Size leaf
  // items, e.g. `<li>Jeans</li>` or `<li><a>Men</a></li>`) has no such wrapper, so this simply
  // returns the same text it always did for those.
  function optionPrimaryText(o) {
    let node = o;
    while (node.children.length === 1) node = node.children[0];
    const label = node.children.length >= 2 ? node.children[0] : node;
    return norm(label.textContent);
  }
  function optionElByText(text) {
    const want = norm(text);
    const opts = qa('[role="option"], li[role="option"], [role="menuitem"], [role="menuitemradio"], li');
    return opts.find((o) => optionPrimaryText(o) === want) || opts.find((o) => wordBoundaryHas(optionPrimaryText(o), want) && optionPrimaryText(o).length < 60) || null;
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

  // BUG FIX 2026-08-22 (P0, Patrick-directed, live-Chrome-confirmed root cause of Price never
  // actually filling): fieldByLabel('Price')/('Listing Price') was resolving to
  // input[data-vv-name="originalPrice"] -- a REAL Poshmark input, but a HIDDEN one (its parent div
  // has class "listing-editor__original-price--hidden", confirmed live), used for Smart Sell's
  // strikethrough original-price display, not the actual listing price. setNativeValue happily set
  // its value ("225" confirmed present in the DOM), which is exactly why this looked like it worked
  // from the extension's own side -- but the field a real seller sees and Poshmark actually submits
  // is a SEPARATE, visible sibling input, `input[data-vv-name="listingPrice"]` (confirmed live,
  // same ListingPrice Vue component, empty the whole time), which is what was actually rendering the
  // "*Required" placeholder in every screenshot. `data-vv-name` is Poshmark's own VeeValidate
  // field-binding attribute (a structural anchor, not an obfuscated class), consistent with this
  // file's "never select by CSS class" rule. Targets the real visible field directly first; falls
  // back to the old generic fieldByLabel path only if that specific attribute is ever removed/
  // renamed, so this degrades no worse than before rather than becoming a hard dependency.
  // BUG FIX 2026-08-22 (S-EXT-POSHMARK-SMARTSELL, P0, live-Chrome-confirmed on Patrick's real
  // tab): setting listingPrice auto-opens Poshmark's own "Listing Price" Smart Sell modal, which
  // blocks the rest of the page while open -- live-confirmed pickCategory() finds zero
  // interactable menu items while this modal is up, exactly matching Patrick's real-world report
  // of Category failing completely ("nothing could be selected in the picker at all") right after
  // Price filled. The modal's own close button (.modal__close-btn.simple-modal-close) does NOT
  // respond to a dispatched synthetic click sequence (confirmed live: full pointerdown/mousedown/
  // pointerup/mouseup/click dispatch had no effect) -- only a genuine OS-level trusted click
  // closes it, which this content script cannot perform. Fix, confirmed live: walk up from the
  // close button to its Vue "Modal" wrapper component (`$options.name === 'Modal'`) and call its
  // own `closeModal()` method directly -- confirmed on Patrick's real tab to close the modal
  // cleanly (offsetParent becomes null, 0x0 rect) and leave Category/Size/Color/etc. fully
  // interactable again, same technique family as the isExpaned dropdown-toggle pattern elsewhere
  // in this file (never a raw class-name click, always the real component's own state/method).
  function visibleModalCloseBtn() {
    // BUG FIX 2026-08-22 (S-EXT-POSHMARK-SMARTSELL-ROUND3, P0, live-Chrome-confirmed root cause
    // of why ROUND2's poll-based fix STILL failed on Patrick's real run): confirmed live via
    // `document.querySelectorAll('.simple-modal-close, .modal__close-btn')` that Poshmark keeps
    // MANY of these wrapper "Modal" component instances mounted in the DOM at once (11+ found
    // live), almost all with `show: false` and `offsetParent === null` -- only ONE of them is
    // ever actually open. `document.querySelector(...)` (singular) always returns the FIRST of
    // these in document order, which live-confirmed is essentially never the one that becomes
    // visible -- so both the "did it open" check and the "did it close" check in ROUND2 were
    // silently testing a permanently-hidden, unrelated modal instance the entire time, timing out
    // and no-op'ing every single run while the REAL open modal sat there untouched. Fix: always
    // query ALL matches and find the one that is actually rendered right now.
    return qa('.simple-modal-close, .modal__close-btn').find((el) => el.offsetParent !== null) || null;
  }

  async function dismissSmartSellModal() {
    const deadline1 = Date.now() + 2000;
    let closeBtn = null;
    while (Date.now() < deadline1) {
      closeBtn = visibleModalCloseBtn();
      if (closeBtn) break;
      await sleep(100);
    }
    if (!closeBtn) return; // modal never opened -- nothing to dismiss
    let p = closeBtn;
    for (let i = 0; i < 8 && p; i++) {
      const vm = p.__vue__;
      if (vm && vm.$options && vm.$options.name === 'Modal' && typeof vm.closeModal === 'function') {
        try { vm.closeModal(); } catch (e) { /* fall through to click fallback below */ }
        break;
      }
      p = p.parentElement;
    }
    const deadline2 = Date.now() + 1500;
    while (Date.now() < deadline2) {
      if (!visibleModalCloseBtn()) return; // genuinely closed -- no visible modal instance left
      await sleep(100);
    }
    // Vue method either wasn't found or didn't close it in time -- last-resort fallback, known
    // unreliable for this specific element, but harmless to attempt.
    const stillOpen = visibleModalCloseBtn();
    if (stillOpen) {
      realClick(stillOpen.closest('button') || stillOpen);
      await sleep(250);
    }
  }

  async function fillPoshmarkPrice(value) {
    const el = document.querySelector('input[data-vv-name="listingPrice"]') || fieldByLabel('Price') || fieldByLabel('Listing Price');
    if (!el) return false;
    el.focus();
    setNativeValue(el, String(value));
    await sleep(150);
    await dismissSmartSellModal();
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
    if (match) { realClick(match); await sleep(200); return true; }
    const addCustom = qa('[role="option"], li, div[role="button"], button').find((n) => /add\s+.*brand|custom brand|create\s+"/.test(norm(n.textContent)));
    if (addCustom) { realClick(addCustom); await sleep(200); return true; }
    console.warn('[FAS Poshmark] Brand "' + value + '" had no matching suggestion and no "add custom brand" action was found (UNVERIFIED) -- left unset.');
    return false;
  }

  // BUG FIX 2026-08-20 (S-EXT-BATCH, P0, live-Chrome-confirmed) -- see the RESOLVED comment on
  // openerByLabel above for the full finding. Directly sets the Vue component's own `isExpaned`
  // data property instead of dispatching a DOM click event at all. Falls back to a plain .click()
  // if no __vue__ instance is found (component structure changed since this was confirmed) rather
  // than throwing -- worse than the Vue path but no worse than this file's old behavior.
  async function vueOpenDropdown(opener) {
    const vm = opener && opener.__vue__;
    if (vm && typeof vm.isExpaned !== 'undefined') {
      vm.isExpaned = true;
      return;
    }
    realClick(opener);
  }

  // BUG FIX 2026-08-21 (S-EXT-BATCH, P0, live-Chrome-confirmed root cause of "Poshmark chose the
  // wrong color"): Color is NOT the same widget shape as Size/Category at all -- confirmed live
  // its "opener" has no role/tabindex/button semantics openerByLabel's candidate scan requires, so
  // fillSelectLike's generic path could never reliably find or fill it (any prior fill was
  // whatever nearestControlAfter's fallback happened to grab). Poshmark's real Color widget
  // (structurally: SECTION > .listing-editor__subsection > .dropdown > [chip-summary-row,
  // tile-grid]) pre-selects a default swatch ("Red", confirmed live on a fresh listing) BEFORE
  // this extension touches anything, and clicking a target color ADDS to that default instead of
  // replacing it (live-confirmed: clicking "Pink" then "Done" left BOTH "Red" and "Pink" selected,
  // shown as the chip-summary "RedPink") -- the exact class of pre-suggestion-stacking bug already
  // found and fixed on Vinted's Color/Material this session. Each currently-selected color is its
  // own separate leaf element inside the chip-summary row (confirmed live: ["Red","Pink"], not one
  // opaque concatenated string), so the pre-existing selections can be read cleanly and toggled off
  // one by one before picking the real target.
  function findPoshmarkColorSection() {
    const helper = qa('*').find((el) => el.children.length === 0 && /select up to \d+ colors?/i.test(norm(el.textContent)) && el.offsetParent !== null);
    if (!helper) return null;
    let anc = helper;
    for (let i = 0; i < 6 && anc; i++) {
      if (anc.tagName === 'SECTION') return anc;
      anc = anc.parentElement;
    }
    return null;
  }
  // Each color tile's real label lives in a nested <span> (not a direct text-node child of the
  // <li> -- live-confirmed: <li><div><a class="color__circle--large"><i class="checkmark"/></a>
  // <span>Red</span></div></li>). A tile is "selected" when its <a> contains an
  // <i class="checkmark"> element at all (live-confirmed: present only on the pre-selected "Red"
  // tile on a fresh load, absent -- not just hidden -- on every other tile).
  function poshmarkColorTileText(li) {
    const span = li.querySelector('span');
    return span ? span.textContent.trim() : '';
  }
  function poshmarkColorTileSelected(li) {
    return !!li.querySelector('i.checkmark');
  }
  // The color dropdown is the same Vue "Dropdown" component (data key "isExpaned") already used
  // successfully for Size -- open/close it the same way instead of relying on realClick timing or
  // the "Done" button, which is live-confirmed to render at a genuine 0x0 rect (an ancestor
  // `.dropdown__menu` collapses to height:0 while still containing real, clickable tiles) and so
  // cannot be reliably clicked by coordinate. `.dropdown__menu`'s own `display` (none <-> block) is
  // the real, live-confirmed open/closed signal -- NOT the tile-grid element's offsetParent, which
  // stays non-null (a separate 0-height sibling) even while the menu is genuinely closed.
  function poshmarkColorPanelOpen(dropdown) {
    const menuEl = dropdown.querySelector('.dropdown__menu');
    if (!menuEl) return false;
    return getComputedStyle(menuEl).display !== 'none';
  }
  async function fillPoshmarkColor(value) {
    const section = findPoshmarkColorSection();
    if (!section) return false;
    const dropdown = section.querySelector('.dropdown');
    if (!dropdown || dropdown.children.length < 2) return false;
    const chipRow = dropdown.children[0];
    const tileGrid = dropdown.children[1];
    const vm = dropdown.__vue__;
    if (!poshmarkColorPanelOpen(dropdown)) {
      if (vm && 'isExpaned' in vm) vm.isExpaned = true;
      else realClick(chipRow.querySelector('[data-et-name="color"]') || chipRow);
      await sleep(400);
    }
    if (!poshmarkColorPanelOpen(dropdown)) {
      console.warn('[FAS Poshmark] Color panel did not open -- left unset.');
      return false;
    }
    const tiles = Array.from(tileGrid.querySelectorAll('li'));
    // Poshmark pre-selects a default swatch ("Red", confirmed live on a fresh listing) BEFORE this
    // extension touches anything, and clicking a target color ADDS to that default instead of
    // replacing it (live-confirmed: clicking "Pink" left BOTH "Red" and "Pink" selected, shown as
    // chip-summary "RedPink") -- the same pre-suggestion-stacking bug already found and fixed on
    // Vinted's Color/Material this session. Deselect every pre-existing tile that isn't the target
    // (toggle-click removes it, live-confirmed) before picking the real target.
    const want = norm(value);
    const preSelectedTiles = tiles.filter(poshmarkColorTileSelected);
    for (const stale of preSelectedTiles) {
      if (norm(poshmarkColorTileText(stale)) === want) continue;
      realClick(stale);
      await sleep(200);
    }
    const stillSelected = tiles.filter(poshmarkColorTileSelected).map(poshmarkColorTileText);
    const alreadyOn = stillSelected.some((t) => norm(t) === want);
    let target = null;
    if (!alreadyOn) {
      target = bestScoringOption(tiles.filter((li) => poshmarkColorTileText(li)), value);
      if (target) { realClick(target); await sleep(200); }
      else {
        console.warn('[FAS Poshmark] Color "' + value + '" -- no matching swatch found among Poshmark\'s real options (UNVERIFIED) -- left unset.');
      }
    }
    // Close via the same Vue isExpaned flag used to open -- live-confirmed this closes the panel
    // reliably (menuEl display flips to "none"), unlike the broken 0x0 "Done" button.
    if (vm && 'isExpaned' in vm) vm.isExpaned = false;
    await sleep(300);
    return !!target || alreadyOn;
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
    await vueOpenDropdown(opener);
    await sleep(350);
    const opt = optionElByText(value);
    if (!opt) return false;
    realClick(opt);
    await sleep(200);
    return true;
  }

  // BUG FIX 2026-08-20 (S-EXT-BATCH-9, P0, live-Chrome-confirmed): the version below this comment
  // replaces one that called optionElByText(categoryText) with the FULL, unsegmented, colon-
  // delimited categoryText (e.g. "Clothing, Shoes & Accessories:men:men's Clothing:activewear:
  // tracksuits & Sets") against Poshmark's real option list on every level -- that whole literal
  // string (colons included) can never equal or substring-match any real Poshmark option text, so
  // opt was always null on the very first iteration and Category silently stayed unset on every
  // real item (live-confirmed: Category field still read "Select Category" after a full fill run
  // that otherwise completed and reached the review overlay). This is the SAME class of bug already
  // root-caused and fixed on fas-grailed.js's pickCategory this session -- ported the same fix here:
  // split into segments, try every not-yet-consumed segment at each picker level (not just the next
  // one positionally), score matches by shared whole words (falling back to a substring tier for
  // compound words like "menswear" containing "men"), exclude segment 0 (FindA.Sale's generic
  // eBay-style top-level umbrella -- always present on clothing items and prone to colliding with an
  // unrelated leaf option that happens to share a word with it, e.g. "Accessories"), and verify the
  // opener's own displayed text actually changed before calling it committed rather than trusting an
  // internal "something got clicked" flag alone.
  // BUG FIX 2026-08-20 (S-EXT-BATCH-10, P0, live-Chrome-confirmed on fas-vinted.js's identical
  // scoring formula): flat overlap-count scoring (one point per shared whole word, shorter text
  // breaking ties) live-confirmed picking the WRONG option for a real query -- see fas-vinted.js's
  // bestScoringOption comment for the full live example ("tracksuits & sets" wrongly scored "Sets"
  // above "Tracksuits" purely for being shorter). Ported the same position-weighted fix here: each
  // matched word is weighted by its position in the query (earlier = more significant) instead of
  // counted flatly, since FindA.Sale's category segments consistently put the specific term first
  // and a broader catch-all after.
  // BUG FIX (this pass, live-Chrome-confirmed root cause of Category department picking "Men" for
  // a query of "Women's"): the subOverlap fallback tier did `tw.indexOf(w) !== -1 || w.indexOf(tw)
  // !== -1` -- a raw substring test with no word-boundary check. "Men" is a literal substring of
  // "Women's" (wo-MEN-'s), so a query for "Women's" scored a match against the unrelated department
  // "Men" via this tier, and since the tier's score REWARDS shorter matched text (subOverlap*10 -
  // text.length), "Men" (len 3, score 7) beat "Women" (len 5, score 5) even though "Women" is the
  // semantically correct match reached only via the (bugged) substring path since the apostrophe in
  // "women's" prevented the exact-word weighted tier above from ever firing. Fixed by requiring
  // whole-word containment (wordBoundaryHas) in the fallback tier instead of a bare substring test,
  // so "men" can never match merely because it's spelled inside "women".
  function scoreMatch(text, want) {
    if (text === want) return 100000;
    // BUG FIX 2026-08-22 (S-EXT-POSHMARK-SMARTSELL, P0, live-Chrome-confirmed root cause of
    // "Poshmark picked the wrong category" -- e.g. "Tracksuits & Sets" resolving to "Bath & Body"):
    // .split(' ').filter(Boolean) kept a bare "&" as its own "word" token. The weighted whole-word
    // branch below then scored ANY two category names that both merely CONTAIN an ampersand as a
    // 100-point exact-word match (textWords.indexOf('&') !== -1 is true for "Bath & Body",
    // "Jackets & Coats", "Pants & Jumpsuits", "Intimates & Sleepwear" -- basically every ampersand-
    // joined Poshmark category name) -- live-confirmed: scoreMatch('bath & body', 'tracksuits & sets')
    // returned 199.89 (a pure "&"-token match) while sharing zero real semantic content, and beat
    // every other candidate including the correct null-score "no match" outcome. Filtering to only
    // tokens containing a letter or digit (mirrors the length>=3 guard already used two lines down
    // in the subOverlap branch, which was never affected by this bug) removes the bare punctuation
    // token from consideration in BOTH branches without changing any real word-matching behavior.
    const wantWords = want.split(' ').filter((w) => /[a-z0-9]/.test(w));
    const textWords = text.split(' ').filter((w) => /[a-z0-9]/.test(w));
    let weighted = 0;
    for (let i = 0; i < wantWords.length; i++) {
      if (textWords.indexOf(wantWords[i]) !== -1) weighted += (wantWords.length - i) * 100;
    }
    if (weighted > 0) return weighted - text.length * 0.01;
    const subOverlap = wantWords.filter((w) => w.length >= 3 && textWords.some((tw) => tw.length >= 3 && (wordBoundaryHas(tw, w) || wordBoundaryHas(w, tw)))).length;
    if (subOverlap === 0) return null;
    return subOverlap * 10 - text.length;
  }
  function bestScoringOption(options, wantText) {
    const want = norm(wantText);
    let best = null, bestScore = -1;
    for (const opt of options) {
      const text = norm(opt.textContent);
      if (!text) continue;
      const score = scoreMatch(text, want);
      if (score === null) continue;
      if (score > bestScore) { bestScore = score; best = opt; }
    }
    return best;
  }
  // BUG FIX 2026-08-21 (S-EXT-BATCH, P0, live-Chrome-confirmed): pickCategory only ever received
  // item.category -- the clean single leaf name (e.g. "Tracksuits & Sets", see
  // extensionController.ts's `category: it.ebayCategoryName || it.category`) -- with no gender info
  // at all. Live-confirmed Poshmark's REAL top-level Category menu is NOT a leaf-name search at
  // all: it's exactly 7 department buttons (All Categories/Women/Men/Kids/Home/Pets/Electronics),
  // and "Tracksuits & Sets" shares no word with any of them, so bestScoringOption correctly found
  // no match and the whole picker aborted at level 0 -- Category was NEVER actually selected on any
  // real run, which is exactly why Poshmark's own Size field then legitimately refused with
  // "Please select the category first" (a real validation message, not a bug on Poshmark's end).
  // Ported the same genderHint approach fas-mercari.js's pickCategory already uses successfully:
  // item.categoryBreadcrumb (the legacy full breadcrumb, see extensionController.ts's
  // `categoryBreadcrumb: it.category`) carries a standalone "Men"/"Women"/"Kids" segment on a real
  // eBay-taxonomy-style breadcrumb -- used to click the correct top-level department FIRST, before
  // falling through to the existing leaf-name scoring for the levels underneath it.
  // BUG FIX 2026-08-22 (P0, Patrick-directed): last-resort fallback when pickCategory's normal
  // scored matching never commits a real category -- Size, Color, and Condition are all locked
  // behind a committed category on Poshmark's own form ("Please select the category first" is a
  // real Poshmark validation message, not a bug on their end), so leaving Category unset silently
  // blocks every field gated behind it. Poshmark has a real "Other" option at multiple levels of
  // its category picker (Patrick, 2026-08-22) -- walks forward from wherever the picker is
  // currently sitting open, clicking any visible "Other" option and re-checking Poshmark's own
  // ListingEditorCatalog Vue state after each click, up to maxLevels deep. UNVERIFIED against a
  // live account -- confirm the "Other" option actually exists at the levels this reaches.
  // BUG FIX 2026-08-22 (P0, Patrick-directed, live-Chrome-confirmed root cause of Category/Size/
  // Color all coming back completely unset on a REAL fillListing() run, despite this exact
  // pickCategory logic succeeding every time when called in isolation): the fixed sleep(300)/
  // sleep(400) windows below assume Vue has already re-rendered the dropdown's option list into the
  // DOM by the time this queries for it. Live-confirmed: run pickCategory() alone on a freshly
  // loaded, idle page and it works every time; run the exact same call as part of the real
  // fillListing() sequence (right after Title/Description/Price were just filled moments earlier,
  // each via setNativeValue + dispatched events that also trigger their own Vue re-renders) and the
  // SAME item list a moment later, and the dropdown items are consistently gone by the item-picker
  // stage -- Category, Size, and Color end up completely unset with nothing to fall back on. Same
  // class of cross-platform SPA-hydration timing race already found and fixed on Mercari/Vinted
  // (see waitForFormReady()'s comment in fas-mercari.js). Fix: poll for the item list actually being
  // non-empty (up to ~1.5s, checked every 100ms) instead of trusting one fixed sleep to be long
  // enough -- costs nothing extra when Vue is already fast (returns on the first non-empty check),
  // only helps under real load.
  async function waitForMenuItems(filterFn, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let items = [];
    while (Date.now() < deadline) {
      items = qa('[role="menuitem"], [role="menuitemradio"], [role="option"], li').filter(filterFn);
      if (items.length) return items;
      await sleep(100);
    }
    return items;
  }
  async function pickOtherFallback(maxLevels) {
    for (let level = 0; level < maxLevels; level++) {
      const items = await waitForMenuItems((el) => el.offsetParent !== null, 1500);
      console.log('[FAS Poshmark][catdbg] otherFallback level', level, 'items (' + items.length + '):', items.map((el) => norm(el.textContent)));
      if (!items.length) break;
      const other = items.find((el) => wordBoundaryHas(norm(el.textContent), 'other') && norm(el.textContent).length < 40);
      console.log('[FAS Poshmark][catdbg] otherFallback level', level, 'otherFound=', !!other);
      if (!other) break;
      realClick(other);
      await sleep(350);
      let catalogVm = null;
      for (const el of qa('*')) {
        const vm = el.__vue__;
        if (vm && vm.$options && vm.$options.name === 'ListingEditorCatalog') { catalogVm = vm; break; }
      }
      const committedNow = !!(catalogVm && (catalogVm.selectedDepartment || catalogVm.selectedGroup || catalogVm.lastSelectedCategoryData));
      console.log('[FAS Poshmark][catdbg] otherFallback level', level, 'catalogVmFound=', !!catalogVm, 'committedNow=', committedNow);
      if (committedNow) return true;
    }
    return false;
  }
  async function pickCategory(categoryText, breadcrumbText) {
    // BUG FIX 2026-08-22 (P0, Patrick-directed): used to return false immediately for an item with
    // no category at all, skipping the picker entirely -- but Size/Color/Condition are all locked
    // behind a committed category, so an item with no category ended up with none of those fields
    // fillable either. Falls through to the same picker + "Other" fallback below instead of bailing
    // early; an empty categoryText just means no scored candidate matches at any level, landing on
    // the "Other" fallback (pickOtherFallback above).
    const opener = openerByLabel('Category');
    if (!opener) {
      console.log('[FAS Poshmark][catdbg] opener NOT FOUND for "Category"');
      return false;
    }
    const placeholderText = norm(opener.textContent);
    console.log('[FAS Poshmark][catdbg] opener found, text=', placeholderText.slice(0, 60));
    await vueOpenDropdown(opener);
    await sleep(400);
    // BUG FIX 2026-08-22 (S-EXT-POSHMARK-CATEGORY-STALE-STATE, P0, live-Chrome-confirmed root
    // cause of "nothing could be selected in the picker at all" on a real reinstall/retest --
    // NOT a scoring bug): live-confirmed on Patrick's real tab that re-opening this dropdown can
    // land it wherever it was last left navigated to (e.g. already inside "Men"'s subcategory
    // list) instead of the true top level -- Poshmark's own draft/dropdown state persisted across
    // a prior navigation attempt on the same page. When that happens, the department-scoring step
    // below scores against SUBcategory names (Accessories, Bags, ...) instead of the real 6
    // departments, guesses a department-shaped fallback that is actually a stale subcategory item,
    // clicking it can bounce the picker back to the top-level department list instead of
    // navigating deeper, and the leaf-matching loop then finds no real match and "Other" is never
    // reached -- exactly reproducing Patrick's report with zero categories selectable. Fix:
    // unconditionally click any visible "All Categories" entry first to force a clean reset to the
    // true root before doing any real scoring -- confirmed live present as a clickable item in
    // both the root view and every nested view, so this is always safe, not just a guess.
    const resetItems = await waitForMenuItems((el) => el.offsetParent !== null, 1000);
    console.log('[FAS Poshmark][catdbg] resetItems (' + resetItems.length + '):', resetItems.map((el) => norm(el.textContent)));
    const allCategoriesLink = resetItems.find((el) => norm(el.textContent) === 'all categories');
    console.log('[FAS Poshmark][catdbg] allCategoriesLink found=', !!allCategoriesLink);
    if (allCategoriesLink) { realClick(allCategoriesLink); await sleep(350); }
    const breadcrumbSegments = (breadcrumbText || '').split(':').map((s) => s.trim()).filter(Boolean);
    let pickedAny = false;
    // BUG FIX 2026-08-21 (S-EXT-BATCH, P0, live-Chrome-confirmed root cause of "Poshmark still
    // wants category selected first"): the old genderHint step required an EXACT breadcrumb
    // segment equal to "men"/"women"/"kids"/"men's"/"women's" -- confirmed against
    // extensionController.ts (S-EXT-BATCH-12 comment) that `categoryBreadcrumb` is `it.category`,
    // documented in schema.prisma as "eBay L1 category name" but in practice whatever the AI
    // tagging pipeline wrote -- NOT guaranteed to contain a clean standalone "men"/"women" segment
    // for every item (schema says L1 name like "Home & Garden" with no gender segment at all is
    // also a real, valid shape). When no exact segment matched, this whole department-selection
    // step was skipped entirely with ZERO fallback -- live-confirmed Poshmark's own "All
    // Categories" option is a dead end (doesn't reveal subcategories, doesn't commit anything), so
    // Category was NEVER set, and Poshmark's own real validation then correctly blocked
    // Size/Condition/Price with "select category first" -- exactly Patrick's report. Replaced the
    // exact-token requirement with the SAME scored-matching bestScoringOption/scoreMatch mechanism
    // already used for every deeper level below: scores every breadcrumb segment AND categoryText
    // itself against Poshmark's real 7 department options (All Categories/Women/Men/Kids/Home/
    // Pets/Electronics, confirmed live), picks whichever candidate scores best across all of them.
    // This still correctly resolves "men"/"women" when present (scores highest via an exact/
    // whole-word match) but no longer hard-fails when the breadcrumb doesn't have a clean gender
    // token -- e.g. a raw L1 name like "Home & Garden" now scores against "Home" via shared-word
    // matching instead of being silently skipped.
    const items0 = await waitForMenuItems((el) => el.offsetParent !== null && norm(el.textContent) !== 'all categories', 1500);
    console.log('[FAS Poshmark][catdbg] items0 (' + items0.length + '):', items0.map((el) => norm(el.textContent)));
    const departmentCandidates = [...breadcrumbSegments, categoryText].filter(Boolean);
    console.log('[FAS Poshmark][catdbg] departmentCandidates=', departmentCandidates);
    let bestDept = null, bestDeptScore = -1;
    for (const cand of departmentCandidates) {
      const scored = bestScoringOption(items0, cand);
      if (!scored) continue;
      const score = scoreMatch(norm(scored.textContent), norm(cand));
      if (score !== null && score > bestDeptScore) { bestDeptScore = score; bestDept = scored; }
    }
    // BUG FIX 2026-08-22 (P0, Patrick-directed, live-Chrome-confirmed): when NO department
    // candidate scored a match at all (live-confirmed real case: item.categoryBreadcrumb was empty
    // for this item and "Tracksuits & Sets" shares no word with any of Poshmark's real 6 departments
    // -- Women/Men/Kids/Home/Pets/Electronics, confirmed live), this used to leave the picker sitting
    // at the unclicked top level with NOTHING selected -- "Poshmark's top-level menu could not be
    // steered at all", exactly Patrick's report. Defaults to the first real department (items0[0],
    // live-confirmed to be "Women") instead of giving up -- some department, even a guessed one, is
    // required before ANY subcategory (including "Other") can even be reached, and the organizer
    // reviews/corrects it before publishing regardless.
    const deptWasGuessed = !bestDept;
    if (!bestDept && items0.length) bestDept = items0[0];
    console.log('[FAS Poshmark][catdbg] bestDept=', bestDept ? norm(bestDept.textContent) : null, 'deptWasGuessed=', deptWasGuessed);
    if (bestDept) { realClick(bestDept); pickedAny = true; await sleep(350); }
    const levelQueries = categoryText.split(':').map((s) => s.trim()).filter(Boolean);
    let remaining = (levelQueries.length > 1 ? levelQueries.slice(1) : levelQueries).map((seg, i) => ({ seg, i }));
    // BUG FIX 2026-08-22 (P0, Patrick-directed, live-Chrome-confirmed): tracks whether a REAL
    // subcategory-level match was ever clicked in this loop, separate from `pickedAny` (which is
    // also true just from the department click above). Needed below to decide whether to fall back
    // to Poshmark's own "Other" option.
    let anyLeafPicked = false;
    for (let level = 0; level < 3; level++) {
      const items = await waitForMenuItems((el) => el.offsetParent !== null, 1500);
      console.log('[FAS Poshmark][catdbg] leaf level', level, 'items (' + items.length + '):', items.map((el) => norm(el.textContent)));
      if (!items.length) break;
      let best = null, bestScoreForLevel = -1, bestRemainingIdx = -1;
      for (let r = 0; r < remaining.length; r++) {
        const candidate = bestScoringOption(items, remaining[r].seg);
        if (!candidate) continue;
        const score = scoreMatch(norm(candidate.textContent), norm(remaining[r].seg));
        if (score !== null && score > bestScoreForLevel) { bestScoreForLevel = score; best = candidate; bestRemainingIdx = r; }
      }
      console.log('[FAS Poshmark][catdbg] leaf level', level, 'best=', best ? norm(best.textContent) : null, 'score=', bestScoreForLevel);
      if (!best) break; // no remaining segment is a real match for this level -- stop rather than guess
      realClick(best);
      pickedAny = true;
      anyLeafPicked = true;
      if (bestRemainingIdx !== -1) remaining.splice(bestRemainingIdx, 1);
      await sleep(350);
    }
    // BUG FIX 2026-08-22 (P0, Patrick-directed, live-Chrome-confirmed): live-confirmed that clicking
    // JUST a department (e.g. "Kids"), with NO subcategory chosen at all, already sets
    // `catalogVm.selectedDepartment` to a real (truthy) object -- so the OLD committed check below
    // would already read true right after the department-default above, before ever trying "Other",
    // leaving Category stuck on a bare, unspecific department. A department alone is a much weaker
    // result than a real subcategory (live-confirmed present in both Men's and Women's lists as the
    // LAST item, e.g. "Men > Other", "Women > Other") -- whenever no real subcategory was matched
    // above, try Poshmark's own "Other" now, while the subcategory panel is still open, BEFORE
    // checking commit state or closing the dropdown at all.
    console.log('[FAS Poshmark][catdbg] anyLeafPicked=', anyLeafPicked);
    let usedOtherFallback = false;
    if (!anyLeafPicked) {
      const otherPicked = await pickOtherFallback(3);
      console.log('[FAS Poshmark][catdbg] pickOtherFallback result=', otherPicked);
      if (otherPicked) { anyLeafPicked = true; usedOtherFallback = true; }
    }
    // Poshmark's real Vue state is the only reliable signal: `ListingEditorCatalog`'s
    // `selectedDepartment` / `selectedGroup` / `lastSelectedCategoryData` are null until a category
    // is genuinely committed (live-confirmed: all three are null before any click, and
    // `selectedDepartment` becomes a real object immediately after even a department-only click).
    // Read AFTER the Other-fallback attempt above, since Other itself changes this state too.
    let catalogVm = null;
    for (const el of qa('*')) {
      const vm = el.__vue__;
      if (vm && vm.$options && vm.$options.name === 'ListingEditorCatalog') { catalogVm = vm; break; }
    }
    const committed = !!(catalogVm && (catalogVm.selectedDepartment || catalogVm.selectedGroup || catalogVm.lastSelectedCategoryData));
    // Always close the dropdown before returning, success or failure -- live-confirmed an
    // unclosed Category panel leaks its still-visible department/leaf <li> items into every
    // later field's global li/role query (this is exactly how Size's optionElByText('M') matched
    // a stray "Women" <li> left over from this panel instead of any real size option).
    const openerVm = opener.__vue__;
    if (openerVm && 'isExpaned' in openerVm) openerVm.isExpaned = false;
    else realClick(opener);
    await sleep(250);
    if (!committed) {
      console.warn('[FAS Poshmark] Category "' + categoryText + '" -- nothing could be selected in the picker at all (UNVERIFIED taxonomy) -- left for the organizer to choose.');
      return false;
    }
    if (deptWasGuessed || usedOtherFallback) {
      console.warn('[FAS Poshmark] Category "' + categoryText + '" had no confident match against Poshmark\'s real taxonomy' + (usedOtherFallback ? ' -- fell back to "Other"' : ' -- department was guessed') + '. Review and correct the category before publishing.');
    }
    return true;
  }

  // BUG FIX 2026-08-22 (P0, Patrick-directed, live-Chrome-confirmed): the prior 5-tier
  // NWT/NWOT/EUC/VGUC/GUC set below was NOT Poshmark's real condition taxonomy at all -- it's the
  // wording used elsewhere (Mercari/eBay-style) but live-confirmed Poshmark's own Condition picker
  // has exactly 4 real options: "New With Tags (NWT)", "Like New", "Good", "Fair" (each with its
  // own description line, e.g. "Good" / "Gently used with minimal signs of wear, to note in
  // description or photos"). Since none of the old fabricated labels ("GUC (Good Used
  // Condition)", etc.) exist anywhere in Poshmark's real DOM, optionElByText could never find a
  // match and Condition silently failed on every single item, regardless of the
  // optionPrimaryText length-cap fix above. Corrected to the real 4 values.
  const CONDITION_LABELS = {
    NWT: 'New With Tags (NWT)',
    LIKE_NEW: 'Like New',
    GOOD: 'Good',
    FAIR: 'Fair'
  };
  // Maps FindA.Sale's condition value to Poshmark's real 4-tier wording (live-confirmed 2026-08-22,
  // not third-party-blog sourced).
  // BUG FIX 2026-08-22 (P0, Patrick-directed, live-DB-confirmed): the fuzzy regex chain below was
  // built assuming free-text condition strings ("brand new", "very good", "excellent") -- but the
  // real value reaching this function is NEVER free text. extensionController.ts's shared item
  // payload (used by every crosslister platform, not just Facebook) runs `it.condition` through
  // `toFacebookCondition()` before it ever leaves the backend, which only ever emits exactly 4
  // strings: 'New', 'Used - Like New', 'Used - Fair', 'Used - Good' (default). Confirmed live via a
  // direct production DB query: this exact failing item had condition='NEW' in the Item table, which
  // toFacebookCondition() turns into plain 'New' -- and plain "New" matches NONE of the old regexes
  // (no "with tag", no "brand", no trailing comma), so it fell through to the GOOD default. That is
  // the exact, confirmed root cause of "chose Good for a brand new sealed item" (Patrick,
  // 2026-08-22). Switches on the exact known strings first (mirrors toFacebookCondition's own
  // switch-based approach for reliability), falling back to the old fuzzy matching only for any
  // value that doesn't look like this file's real, finite input space -- defensive in case that
  // shared payload function ever changes upstream.
  function mapPoshmarkCondition(condition) {
    const c = norm(condition);
    if (!c) return CONDITION_LABELS.GOOD;
    if (c === 'new') return CONDITION_LABELS.NWT;
    if (c === 'used - like new') return CONDITION_LABELS.LIKE_NEW;
    if (c === 'used - fair') return CONDITION_LABELS.FAIR;
    if (c === 'used - good') return CONDITION_LABELS.GOOD;
    if (/(new with tag|nwt|brand new|new,)/.test(c)) return CONDITION_LABELS.NWT;
    if (/(new without tag|nwot|like new|excellent)/.test(c)) return CONDITION_LABELS.LIKE_NEW;
    if (/(very good|good)/.test(c)) return CONDITION_LABELS.GOOD;
    if (/fair/.test(c)) return CONDITION_LABELS.FAIR;
    return CONDITION_LABELS.GOOD; // ambiguous default
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
    await dismissCovershotModal();
    return true;
  }

  // BUG FIX 2026-08-21 (S-EXT-BATCH, P0, live-Chrome-confirmed): live-confirmed Poshmark opens its
  // own native "Select a Covershot" confirmation dialog (a real page-covering modal, "Apply"/
  // "Cancel" buttons) automatically after photos are added to the dropzone -- this file never
  // dismissed it. Since fillListing() calls injectPhotos() LAST, this didn't block that same run's
  // own Category/Brand/Size fills, but it stayed open afterward and blocked every subsequent
  // interaction (Patrick's own manual review, or the next queued item's run) -- confirmed live:
  // "Poshmark still on the select a covershot" matches exactly. Accepts Poshmark's own default
  // cover selection (first photo, already highlighted) by clicking Apply -- never picks a
  // different photo, just clears the blocking dialog so the rest of the flow can proceed.
  async function dismissCovershotModal() {
    await sleep(400);
    const applyBtn = qa('button').find((b) => norm(b.textContent) === 'apply' && b.offsetParent !== null);
    if (applyBtn) { realClick(applyBtn); await sleep(300); return true; }
    return false;
  }

  // Detects whether this page actually looks like Poshmark's listing form (Title + Price fields
  // present) rather than trusting POST_URL_HINT's path to be exactly right -- the real URL was
  // never live-confirmed this session. Stays silent (does nothing) if it can't confirm, same
  // "never guess a whole page" posture as fas-gumtree-au.js.
  function looksLikeSellForm() {
    return !!(fieldByLabel('Title') && (fieldByLabel('Price') || fieldByLabel('Listing Price')));
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
      await tryFill('Price', item.price, (v) => fillPoshmarkPrice(String(Math.max(1, Math.round(Number(v))))));
    }
    // Original/MSRP price deliberately skipped -- FindA.Sale carries no such data (never invent).
    // BUG FIX 2026-08-22 (P0, Patrick-directed -- screenshot showed "Please select the category
    // first" stuck under Size after a full fill run): called through pickCategory directly instead
    // of tryFill -- tryFill's own undefined/null/'' guard used to skip Category entirely for an item
    // with no category value, and even when Category DID run, this code proceeded to Size/Color
    // unconditionally regardless of whether Category actually committed. pickCategory now always
    // attempts a fill (falling back to Poshmark's own "Other" category when no real match commits --
    // see its own comment), and Size/Color are skipped with a clear console warning -- instead of
    // being silently attempted and left blocked by Poshmark's own "select category first" message --
    // on the rare case even that fallback fails.
    let categoryCommitted = false;
    try {
      categoryCommitted = await pickCategory(item.category || '', item.categoryBreadcrumb);
    } catch (e) {
      console.warn('[FAS Poshmark] Field "Category" -- error while filling, skipped:', e && e.message);
    }
    if (!categoryCommitted) {
      console.warn('[FAS Poshmark] Category never committed -- skipping Size/Color since Poshmark locks them behind a chosen category. Fill these in yourself.');
    }
    // 2026-08-18: brand/size/color now exist on Item and flow through getExtensionItems ->
    // popup.js's queue map. tryFill's own undefined/null/'' guard still skips silently on
    // items where the organizer hasn't set a value. Brand is a plain autocomplete field, not gated
    // by category on Poshmark's form (UNVERIFIED against a live account, but not the field named in
    // Patrick's report) -- kept unconditional.
    await tryFill('Brand', item.brand, (v) => fillAutocomplete('Brand', v));
    if (categoryCommitted) {
      await tryFill('Size', item.size, (v) => fillSelectLike('Size', v));
      await tryFill('Color', item.color, (v) => fillPoshmarkColor(v));
    }
    const conditionLabel = mapPoshmarkCondition(item.condition);
    // Condition is not the field Patrick's report named as blocked, and this file has no prior
    // finding that it's category-gated -- kept unconditional. If it also turns out to be locked
    // behind Category on a live account, gate it the same way as Size/Color above.
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
    // BUG FIX 2026-08-19 (S-EXT-BATCH-5, P0): was a single immediate looksLikeSellForm() check --
    // see waitForFormReady()'s comment (fas-mercari.js) for the live-confirmed SPA-hydration race
    // this same pattern is vulnerable to on every one of these 4 files.
    const formState = await waitForFormReady(8000);
    if (formState === 'interstitial') {
      overlayWarn('Poshmark is showing a verification/security screen. FindA.Sale never attempts to solve this -- please complete it yourself, then reopen the extension to continue.' + button('fas-posh-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    if (formState === 'timeout') {
      if (maybeShowAppLoginHint()) return;
      overlayWarn('This doesn\'t look like a fillable Poshmark listing form yet (checked repeatedly for several seconds). If you\'re on the right page, this is an UNVERIFIED-selector miss -- please fill it in yourself.' + button('fas-posh-close', 'Close', false));
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
