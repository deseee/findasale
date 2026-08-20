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

  // BUG FIX 2026-08-19 (S-EXT-BATCH-4, P0, live-Chrome-confirmed): Grailed's dropdowns are Radix UI
  // primitives (confirmed live: trigger buttons have id="radix-:xx:", aria-haspopup="menu",
  // aria-controls pointing at a portal-rendered content div). A plain el.click() opened the
  // "Department / Category" trigger reliably in one live test but the "Sub-category" trigger did NOT
  // open on two consecutive plain .click() calls (aria-expanded stayed "false") -- only a full
  // pointerdown+mousedown+pointerup+mouseup+click sequence at the element's real screen coordinates
  // reliably opened it. Using this sequence everywhere a dropdown trigger needs to be clicked removes
  // that flakiness instead of leaving it to chance.
  function syntheticClick(el) {
    const rect = el.getBoundingClientRect();
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const common = { bubbles: true, cancelable: true, composed: true, view: window, clientX: cx, clientY: cy, pointerId: 1, pointerType: 'mouse', button: 0 };
    el.dispatchEvent(new PointerEvent('pointerdown', common));
    el.dispatchEvent(new MouseEvent('mousedown', common));
    el.dispatchEvent(new PointerEvent('pointerup', common));
    el.dispatchEvent(new MouseEvent('mouseup', common));
    el.dispatchEvent(new MouseEvent('click', common));
  }
  // Shared with fas-vinted.js's identical helper -- scores candidates by exact match first, then by
  // shared-word overlap (more shared words wins, shorter label breaks ties), instead of the old
  // first-substring-match which was prone to grabbing an unrelated option that merely contained one
  // matching word.
  function bestScoringOption(options, wantText) {
    const want = norm(wantText);
    const wantWords = want.split(' ').filter(Boolean);
    let best = null;
    let bestScore = -1;
    for (const opt of options) {
      const text = norm(opt.textContent);
      if (!text) continue;
      let score;
      if (text === want) {
        score = 1000;
      } else {
        const textWords = text.split(' ').filter(Boolean);
        const overlap = wantWords.filter((w) => textWords.indexOf(w) !== -1).length;
        if (overlap === 0) continue;
        score = overlap * 100 - text.length;
      }
      if (score > bestScore) { bestScore = score; best = opt; }
    }
    return best;
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

  // BUG FIX 2026-08-19 (S-EXT-BATCH-2, P1): live-confirmed against Patrick's real Grailed test --
  // there is no separate "Market" tier field on the actual form at all (the earlier "Grails / Hype
  // / Sartorial / Core" concept doesn't correspond to anything on-screen); the real field is a
  // single combined "Department / Category" control. pickMarketTier() and its call site have been
  // removed rather than left as permanently-dead-on-arrival code -- it was never going to find a
  // field that doesn't exist.
  //
  // Shared select-aware fill, mirroring fillSize's existing dual-path pattern: try a native
  // <select> first (set value directly via matching <option> text -- no click/open needed, and
  // critically, clicking a native select programmatically does NOT reliably expose its options as
  // separately queryable DOM nodes, so the click+optionElByText path below would silently do
  // nothing against a real native select). Falls back to the custom-combobox click+optionElByText
  // pattern for non-native pickers. Live-confirmed necessary 2026-08-19: Color ("Select a Color")
  // and Condition ("Item Condition") were being filled with fillText() (typing free text into a
  // dropdown) before this fix, which cannot select an option in either a native select or a custom
  // combobox.
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
    if (opener.tagName === 'SELECT') {
      const opt = Array.from(opener.options).find((o) => norm(o.textContent) === norm(value) || norm(o.textContent).indexOf(norm(value)) !== -1);
      if (!opt) return false;
      opener.value = opt.value;
      opener.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    // BUG FIX 2026-08-19 (S-EXT-BATCH-4, P0, live-Chrome-confirmed): plain opener.click() was
    // confirmed unreliable against Grailed's Radix dropdown triggers (see syntheticClick's comment).
    // Also switched optionElByText -> bestScoringOption so a scored match wins instead of the first
    // substring hit.
    syntheticClick(opener);
    await sleep(400);
    const opt = bestScoringOption(qa('[role="menuitem"], [role="menuitemradio"], [role="option"], li[role="option"], li').filter((el) => el.offsetParent !== null), value);
    if (!opt) return false;
    syntheticClick(opt);
    await sleep(250);
    return true;
  }

  // Category: "Department / Category" is ONE combined control on the real form (see the BUG FIX
  // comment above) -- openerByLabel('Category') matches it via substring ("category" is contained
  // in "department / category") plus the nearestControlAfter fallback. Native-select-aware first
  // (see fillSelectLike comment), same click+optionElByText fallback otherwise. FindA.Sale's
  // item.category is a flat, potentially multi-segment string with no reliable 1:1 mapping to
  // Grailed's own category depth -- tries the full string first, then progressively shorter
  // trailing segments (most-specific-first) if that doesn't match anything, same spirit as the
  // Mercari segmented picker but simpler since Grailed's picker structure is still unconfirmed.
  async function pickCategory(categoryText) {
    if (!categoryText) return false;
    const opener = openerByLabel('Category');
    if (!opener) return false;
    if (opener.tagName === 'SELECT') {
      const segments = categoryText.split(':').map((s) => s.trim()).filter(Boolean);
      const candidates = [categoryText, ...segments.slice().reverse()];
      for (const candidate of candidates) {
        const opt = Array.from(opener.options).find((o) => norm(o.textContent) === norm(candidate) || norm(o.textContent).indexOf(norm(candidate)) !== -1);
        if (opt) { opener.value = opt.value; opener.dispatchEvent(new Event('change', { bubbles: true })); return true; }
      }
      console.warn('[FAS Grailed] Category "' + categoryText + '" -- no option matched the native select (UNVERIFIED taxonomy) -- left for the organizer to choose.');
      return false;
    }
    // BUG FIX 2026-08-19 (S-EXT-BATCH-4, P0, live-Chrome-confirmed): the old version searched every
    // level of the picker for the whole, un-split categoryText -- confirmed live that the real
    // "Department / Category" trigger opens a Radix menu showing ONLY "Menswear"/"Womenswear"
    // (role="menuitem") at first; clicking one updates the SAME panel in place to show that
    // department's top-level categories (e.g. Tops/Bottoms/Outerwear/Footwear/Tailoring/Accessories,
    // also role="menuitem"), and clicking one of those closes the dropdown with both levels set
    // (confirmed live: button text became "Menswear / Tops"). Segment categoryText and score each
    // level's options against progressively-consumed segments (mirrors fas-mercari.js/fas-vinted.js's
    // identical segmented-scoring approach) instead of blindly re-searching for the whole string at
    // every level.
    const segments = categoryText.split(':').map((s) => s.trim()).filter(Boolean);
    const levelQueries = segments.length ? segments : [categoryText];
    syntheticClick(opener);
    await sleep(450);
    let pickedAny = false;
    let queryIdx = 0;
    for (let level = 0; level < 4; level++) {
      await sleep(300);
      if (opener.getAttribute && opener.getAttribute('aria-expanded') === 'false') break; // menu auto-closed -- fully resolved
      const contentId = opener.getAttribute && opener.getAttribute('aria-controls');
      const content = contentId ? document.getElementById(contentId) : null;
      const items = content
        ? Array.from(content.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"]'))
        : qa('[role="menuitem"], [role="menuitemradio"], [role="option"]').filter((el) => el.offsetParent !== null);
      if (!items.length) break;
      // Try the next not-yet-consumed segment first (most specific remaining), then fall back to the
      // full string, so a picker with fewer levels than segments still gets a reasonable match.
      const query = queryIdx < levelQueries.length ? levelQueries[queryIdx] : categoryText;
      const opt = bestScoringOption(items, query) || bestScoringOption(items, categoryText);
      if (!opt) break;
      syntheticClick(opt);
      pickedAny = true;
      queryIdx++;
      await sleep(350);
    }
    if (!pickedAny) {
      console.warn('[FAS Grailed] Category "' + categoryText + '" -- no level matched in the picker (UNVERIFIED taxonomy) -- left for the organizer to choose.');
      return false;
    }
    // Sub-category is a SEPARATE trigger, gated on Category being set first (confirmed live: it was
    // disabled/placeholder before Category resolved, then enabled). Best-effort: only attempt if the
    // organizer's category string had a segment beyond what the two-level Department/Category picker
    // above likely consumed.
    if (queryIdx < levelQueries.length) {
      const subOpener = openerByLabel('Sub-category') || openerByLabel('Subcategory');
      if (subOpener) {
        syntheticClick(subOpener);
        await sleep(450);
        const contentId = subOpener.getAttribute && subOpener.getAttribute('aria-controls');
        const content = contentId ? document.getElementById(contentId) : null;
        const items = content ? Array.from(content.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"]')) : [];
        const subQuery = levelQueries[levelQueries.length - 1];
        const subOpt = items.length ? (bestScoringOption(items, subQuery) || bestScoringOption(items, categoryText)) : null;
        if (subOpt) {
          syntheticClick(subOpt);
          await sleep(300);
        } else {
          console.warn('[FAS Grailed] Sub-category "' + subQuery + '" -- no option matched (UNVERIFIED taxonomy) -- left for the organizer to choose.');
        }
      }
    }
    return pickedAny;
  }

  // Size: now routed through the shared fillSelectLike (BUG FIX 2026-08-19, S-EXT-BATCH-2) --
  // falls back to a plain text field only if neither a native select nor a combobox opener is
  // found for the label, matching the original intent of this function.
  async function fillSize(value) {
    const ok = await fillSelectLike('Size', value);
    if (ok) return true;
    const native = fieldByLabel('Size');
    if (native) { setNativeValue(native, String(value)); return true; }
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

  function showReviewOverlay(item, index, total, photosOk, intlShipping) {
    const more = (index + 1) < total;
    // International shipping status line (BUG FIX 2026-08-19, S-EXT-BATCH, P1) -- see
    // disableInternationalShipping()'s comment. Three cases: regions found and turned off (safe,
    // still worth a one-line confirmation), regions found but none were on to begin with (safe,
    // no action needed), or the section wasn't found at all (loud warning -- Grailed's $50/region
    // placeholder may still be live).
    let intlLine = '';
    if (intlShipping && intlShipping.anyFound && intlShipping.anyDisabled) {
      intlLine = '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Turned off Grailed\'s international shipping regions (was defaulting to a $50/region placeholder) -- enable manually with your own rate if you want to ship internationally.</div>';
    } else if (intlShipping && !intlShipping.anyFound) {
      intlLine = '<div style="color:#ffcf7a;margin-top:6px;font-size:12px">Couldn\'t find Grailed\'s international shipping section (UNVERIFIED selector) -- check it before publishing; it may default to a $50/region charge.</div>';
    }
    overlay('<b>FindA.Sale</b><div style="margin-top:6px">Filled <b>' + escapeHtml(item.title) + '</b> as best we could.</div>' +
      '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Review every field &mdash; category/Market tier/size/condition are all UNVERIFIED guesses (condition especially, see the code comment). ' +
      '<b>Measurements were left blank</b> &mdash; Grailed listings perform much better with them, add them yourself before publishing. Then click Grailed\'s own <b>List item</b> yourself &mdash; this extension never publishes for you.</div>' +
      intlLine +
      (!photosOk ? '<div style="color:#ffcf7a;margin-top:6px;font-size:12px">Photos may not have attached -- add them on this screen.</div>' : '') +
      button('fas-gr-next', more ? 'I posted — next item &#9654;' : 'I posted — done', true) +
      button('fas-gr-close', 'Close', false) +
      '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');
    const next = document.getElementById('fas-gr-next');
    if (next) next.onclick = async () => {
      try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: item.id, remoteListingId: null, platform: 'GRAILED' }); } catch (e) {}
      try { await chrome.runtime.sendMessage({ type: 'advanceGrailedQueue' }); } catch (e) {}
      if (more) {
      // BUG FIX 2026-08-19 (S-EXT-BATCH, P0): ask background.js for a genuinely fresh tab
      // instead of an in-page location.href reassignment -- see background.js's
      // 'reopenGrailedTab' handler comment for why. Closes this tab; the fresh one picks up
      // the (already-advanced) queue on its own start().
      try { await chrome.runtime.sendMessage({ type: 'reopenGrailedTab' }); } catch (e) {}
    } else { bar && bar.remove(); }
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
      if (more) {
      // BUG FIX 2026-08-19 (S-EXT-BATCH, P0): ask background.js for a genuinely fresh tab
      // instead of an in-page location.href reassignment -- see background.js's
      // 'reopenGrailedTab' handler comment for why. Closes this tab; the fresh one picks up
      // the (already-advanced) queue on its own start().
      try { await chrome.runtime.sendMessage({ type: 'reopenGrailedTab' }); } catch (e) {}
    } else { bar && bar.remove(); }
    };
    closeBtnHandler();
  }

  // International shipping-regions step (BUG FIX 2026-08-19, S-EXT-BATCH, P1). Grailed defaults
  // ALL regions (Canada/UK/Europe/Asia/Australia-NZ/Other) to ENABLED with a $50/region placeholder
  // price -- every listing pushed here was silently offering international shipping at an
  // arbitrary made-up rate unless the organizer caught and fixed it manually. This step was
  // entirely missing before (the script stopped after Price/photos). No incumbent crosslister
  // fills Grailed's per-region grid either -- Crosslist (the most mature Grailed-specific tool)
  // collapses it to ONE flat worldwide price field instead (docs.crosslist.com/getting-started/
  // shipping-profiles/grailed, confirmed 2026-08-19). FindA.Sale carries no per-item
  // international/worldwide shipping rate today, so the safe default is DISABLE every
  // international region rather than leave Grailed's $50 placeholder live -- never silently
  // charge a buyer a rate nobody configured. Best-effort selectors (UNVERIFIED, like the rest of
  // this file) -- finds each region's toggle by its visible label text and clicks it off if found
  // still on; a genuinely missing selector is loudly flagged rather than assumed handled.
  const INTERNATIONAL_REGION_LABELS = [
    'Canada', 'United Kingdom', 'UK', 'Europe', 'Asia', 'Australia', 'Australia/NZ',
    'Australia & New Zealand', 'Other', 'Rest of World', 'Worldwide',
  ];
  async function disableInternationalShipping() {
    let anyFound = false;
    let anyDisabled = false;
    for (const label of INTERNATIONAL_REGION_LABELS) {
      const toggle = fieldByLabel(label) || openerByLabel(label);
      if (!toggle) continue;
      anyFound = true;
      const isCheckboxLike = toggle.tagName === 'INPUT' && (toggle.type === 'checkbox' || toggle.type === 'radio');
      const isOn = isCheckboxLike ? toggle.checked : toggle.getAttribute('aria-checked') === 'true';
      if (!isOn) continue; // already off -- nothing to do
      toggle.click(); // real click, so it fires whatever change handler Grailed's own form expects
      anyDisabled = true;
      await sleep(200);
    }
    if (!anyFound) {
      console.warn('[FAS Grailed] International shipping-regions section not found (UNVERIFIED selector) -- if this listing defaults to international shipping at Grailed\'s own placeholder rate, disable it manually before publishing.');
    }
    return { anyFound, anyDisabled };
  }

  async function fillListing(item) {
    overlay('<b>FindA.Sale</b> - filling the Grailed listing form...');
    // BUG FIX 2026-08-19 (S-EXT-BATCH-2, P1): live-confirmed real field label is "Item Name", not
    // "Title" -- fieldByLabel('Title') alone matched nothing on Patrick's real test. Tries both;
    // "Title" first in case a different Grailed page variant still uses it, "Item Name" as the
    // confirmed real fallback.
    await tryFill('Title', item.title, (v) => fillText('Title', v) || fillText('Item Name', v));
    await tryFill('Description', item.description, (v) => fillText('Description', v));
    // pickMarketTier() call removed (BUG FIX 2026-08-19, S-EXT-BATCH-2) -- see pickCategory's own
    // comment above; there is no separate Market-tier field on the real form to fill.
    await tryFill('Category', item.category, (v) => pickCategory(v));
    // 2026-08-18: color/size now exist on Item and flow through getExtensionItems ->
    // popup.js's queue map. tryFill's own guard still skips silently on unset items.
    // BUG FIX 2026-08-19 (S-EXT-BATCH-2, P1): Color and Condition are both real dropdowns
    // ("Select a Color" / "Item Condition") -- routed through fillSelectLike instead of fillText,
    // which was typing free text into a picker that can't accept it.
    await tryFill('Color', item.color, (v) => fillSelectLike('Color', v));
    await tryFill('Size', item.size, (v) => fillSize(v));
    // Measurements deliberately NEVER filled -- see file header. No call to any measurements
    // field exists in this function on purpose.
    const conditionLabel = mapGrailedCondition(item.condition);
    await tryFill('Condition', conditionLabel, (v) => fillSelectLike('Condition', v));
    if (item.price != null && isFinite(Number(item.price))) {
      await tryFill('Price', item.price, (v) => fillText('Price', String(Math.max(1, Math.round(Number(v))))));
    }
    // Offers (negotiation) toggle deliberately left at Grailed's own default -- never touched.
    const intlShipping = await disableInternationalShipping();
    await humanPause(400, 800);
    const photosOk = await injectPhotos(item.photoUrls);
    return { photosOk, intlShipping };
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
    const fillResult = await fillListing(item);
    if (looksLikeInterstitial()) {
      overlayWarn('Grailed is showing a verification/security screen partway through filling this listing. Please complete it yourself, then finish this listing manually -- nothing further was auto-filled.' + button('fas-gr-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    showReviewOverlay(item, index, total, fillResult.photosOk, fillResult.intlShipping);
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
