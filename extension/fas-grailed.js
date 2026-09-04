/* FindA.Sale — content script on grailed.com listing flow.
 * CODE-ONLY, UNTESTED (2026-08-18 dispatch): no Grailed seller account exists to verify this
 * session -- every selector below is a best-effort guess, never live-confirmed. Same hard rules
 * as fas-poshmark.js / fas-mercari.js / fas-vinted.js / fas-selectors.js (ADR-084):
 *   1. NEVER select by obfuscated CSS class -- label text / aria-label / role / structural
 *      anchors only.
 *   2. Auto-publish (clicking the final "List item" button) is a PRO/TEAMS-only, opt-in toggle
 *      threaded from popup.js -> background.js (fasGrailedAutoPublish) -> here, the SAME
 *      mechanism fas-craigslist.js already uses -- NOT a blanket "never" rule. Corrected
 *      2026-08-22 (S-EXT-AUTOPUBLISH-POLICY, Patrick-directed): this file previously hard-coded
 *      "never auto-click the final publish action" for every organizer regardless of the
 *      2026-07-17 locked decision (full automation including auto-publish is non-negotiable,
 *      PRO/TEAMS-only opt-in) -- that was a real deviation, not a faithful implementation of extra
 *      caution Patrick asked for. No evidence was found either way of a Grailed ban policy tied to
 *      automation/crosslisting specifically (weaker evidence than Poshmark/Mercari -- flagged to
 *      Patrick, absence of a ban signal defaults to automate per his stated policy). Auto-publish
 *      only fires when the Designer field was actually confirmed (see designerUnconfirmed below) --
 *      an unconfirmed Designer means Grailed's own required field may not be genuinely committed,
 *      so that case always falls back to the manual review overlay regardless of the toggle. When
 *      the toggle is off (organizer's own choice, or that fallback), this script still fills and
 *      stops exactly as before.
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
  // Added 2026-08-20 (S-EXT-BATCH, P0) -- this file had no generic waitFor() helper (only the
  // more specialized waitForFormReady below), but disableInternationalShipping's fix needs to
  // poll for a single element the same way other files in this extension already do. Mirrors the
  // identical waitFor implementation already used in fas-content.js/fas-vinted.js/fas-mercari.js.
  function waitFor(getter, timeout = 8000) {
    return new Promise((resolve, reject) => {
      const first = getter();
      if (first) return resolve(first);
      const obs = new MutationObserver(() => {
        const el = getter();
        if (el) { obs.disconnect(); resolve(el); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); reject(new Error('timeout')); }, timeout);
    });
  }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  // Added this pass (ported from fas-poshmark.js, live-Chrome-confirmed there this session): a
  // whole-word boundary check, used to stop short/compound-word queries from spuriously matching
  // as a bare substring of an unrelated word (e.g. "men" is a literal substring of "women" --
  // confirmed live on Poshmark this session that a "Women's" department query incorrectly matched
  // "Men" via raw substring scoring and picked the wrong department). This file's scoreMatch/
  // openerByLabel/optionElByText use the identical substring-scoring pattern that caused that bug,
  // so hardened defensively even though Grailed's specific Menswear/Womenswear spelling happens not
  // to collide today (no live Grailed failure reproduced this session).
  function wordBoundaryHas(text, want) {
    if (!text || !want) return false;
    const re = new RegExp('(^|[^a-z0-9])' + want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])');
    return re.test(text);
  }
  function bodyText() { return (document.body && document.body.innerText) || ''; }
  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return Array.from(document.querySelectorAll(sel)); }
  function escapeHtml(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // SAFETY GATE 2026-09-03 -- Grailed fashion-only allowlist pre-submit check (mirrors the
  // Craigslist prohibited-items pre-submit check in fas-craigslist.js, but INVERTED: Grailed is a
  // fashion/streetwear-only marketplace with no "prohibited items" blocklist -- instead the backend
  // registry (packages/backend/src/services/marketplaceEligibilityRules.ts, GRAILED rule,
  // CATEGORY_ALLOWLIST type) only lets an item through when its category/title contains at least
  // one fashion-related keyword. So this checks the OPPOSITE condition from every other platform
  // file in this extension: skip when NONE of the keywords below match (not when any DOES match).
  // Empty/blank category+title is ALSO treated as a non-match and skipped -- matches the backend
  // registry's own "can't confirm -> hidden by default" behavior for this specific allowlist rule,
  // the opposite default from the other platforms' blocklists (which pass through on empty data).
  // Runs as early as possible in start(), before any DOM interaction (no field filling, no
  // clicking) -- see start()'s own call site below.
  const GRAILED_FASHION_KEYWORDS = [
    'clothing', 'apparel', 'shirt', 't-shirt', 'tee', 'pant', 'trouser', 'jean', 'denim',
    'jacket', 'coat', 'outerwear', 'dress', 'skirt', 'suit', 'sportswear', 'activewear',
    'streetwear', 'sweatshirt', 'sweater', 'hoodie', 'shoe', 'sneaker', 'footwear', 'boot',
    'sandal', 'bag', 'backpack', 'wallet', 'belt', 'accessor', 'jewelry', 'jewellery', 'watch',
    'sunglasses', 'hat', 'cap', 'beanie', 'scarf', 'glove', 'sock', 'underwear', 'swimwear',
    'romper', 'jumpsuit', 'tracksuit', 'sweatpant',
  ];
  function grailedFashionMismatchReason(category, title) {
    const haystack = (String(category || '') + ' ' + String(title || '')).toLowerCase();
    const NOT_FASHION_REASON = "Grailed is a fashion/streetwear-only marketplace — this item's category doesn't look like apparel, footwear, or accessories.";
    if (!haystack.trim()) return NOT_FASHION_REASON;
    const isFashion = GRAILED_FASHION_KEYWORDS.some((kw) => haystack.indexOf(kw) !== -1);
    if (!isFashion) return NOT_FASHION_REASON;
    return null;
  }

  // BUG FIX 2026-08-20 (S-EXT-BATCH, P0, live-Chrome-confirmed): Grailed enforces a hard 60-char
  // cap on Item Name ("Must be 60 characters or less", confirmed verbatim on the live page) and
  // this file never truncated -- a 78-char real title was rejected outright. Truncates at the
  // last whole-word boundary <=60 chars so the title doesn't end mid-word; if even the first word
  // alone exceeds 60 chars (pathological case), hard-truncates to exactly 60. Only affects what's
  // typed into Grailed's own field -- item.title itself, and every other platform's title, are
  // untouched.
  function truncateGrailedTitle(title) {
    const t = String(title || '');
    if (t.length <= 60) return t;
    const cut = t.slice(0, 60);
    const lastSpace = cut.lastIndexOf(' ');
    return lastSpace > 0 ? cut.slice(0, lastSpace).trim() : cut;
  }

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

  // BUG FIX 2026-08-25 round 11 (Patrick-confirmed live, screenshot): root cause of "Clicked List
  // item but couldn't confirm it went through" firing on every real auto-publish attempt, across
  // multiple sessions of otherwise-correct fills -- Grailed shows a "Verify Your Phone Number" modal
  // ("To use Grailed, we need to verify your phone number...") the FIRST time an account attempts to
  // publish a listing, blocking the real submission entirely. This explains everything the earlier
  // investigation found: no listing-creation network request ever fired (Grailed never got past this
  // gate), no visible field-validation error existed (this is an account-level requirement, not a
  // form problem), and it's independent of trusted vs synthetic clicks (Grailed's own button handler
  // opens this modal either way -- the click WAS registering, it just led here instead of publishing).
  // This is a one-time, account-level identity gate Patrick must complete himself with his real
  // phone -- exactly the class of interstitial this file's own header already commits to never
  // attempting to solve (HARD-STOP on any CAPTCHA/identity-verification/unrecognized interstitial).
  function looksLikePhoneVerification() {
    const lower = bodyText().toLowerCase();
    return lower.indexOf('verify your phone') !== -1 || lower.indexOf('verify your phone number') !== -1;
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
    // BUG FIX (this pass, defensive hardening ported from fas-poshmark.js's live-Chrome-confirmed
    // fix this session): raw `.indexOf(want)` matching is the same substring-collision pattern that
    // broke Poshmark's opener/option lookups (e.g. "category" as a raw substring of "sub-category").
    // Grailed's current field labels (Category/Sub-category/Size/Color/Condition) happen to still
    // resolve correctly by DOM order today (no live collision reproduced this session), but
    // wordBoundaryHas is strictly safer and costs nothing here.
    const candidates = qa('[role="combobox"], [role="button"], [role="switch"], button, select, div[tabindex]');
    const hit = candidates.find((c) => wordBoundaryHas(norm(c.getAttribute('aria-label') || c.textContent), want) && norm(c.textContent).length < 80);
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
  // BUG FIX (this pass, ported from fas-poshmark.js's live-Chrome-confirmed fix this session): the
  // old fallback was a raw substring test, which is especially dangerous for short values -- a size
  // code like "M"/"S"/"L" could match as a bare substring of ANY unrelated option text containing
  // that letter (live-confirmed on Poshmark: "M" matched a stray "Women" menu item). Switched to
  // wordBoundaryHas so the fallback only fires on a real whole-word match.
  function optionElByText(text) {
    const want = norm(text);
    const opts = qa('[role="option"], li[role="option"], [role="menuitem"], [role="menuitemradio"], li');
    return opts.find((o) => norm(o.textContent) === want) || opts.find((o) => wordBoundaryHas(norm(o.textContent), want) && norm(o.textContent).length < 60) || null;
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
  // ADDED 2026-08-24 (S-EXT-ROUND6) -- see background.js's 'fasTrustedClick' handler for the full
  // rationale: live isTrusted instrumentation confirmed Grailed's Designer autocomplete requires a
  // genuinely browser-trusted click to open/select, which syntheticClick() above (dispatchEvent,
  // isTrusted:false) can never produce. This asks the background service worker to fire a REAL
  // click via chrome.debugger + CDP Input.dispatchMouseEvent at the element's current viewport
  // coordinates -- isTrusted:true, confirmed by the same mechanism Puppeteer/Playwright use.
  // Returns true/false for whether the background worker reports the click was actually dispatched
  // (NOT a guarantee the UI reacted the way we want -- callers must still verify the outcome
  // structurally, same as they now do for syntheticClick). Fails closed (returns false) if the
  // "debugger" permission isn't granted yet (stale/unreloaded extension), another debugger client
  // is already attached to this tab (e.g. real DevTools open), or extension messaging itself
  // fails for any reason -- callers should fall back to syntheticClick() in that case rather than
  // treat a false here as fatal.
  function trustedClick(el) {
    return new Promise((resolve) => {
      try {
        // BUG FIX 2026-08-25 round 15 (Patrick: "figure out exactly how to click that button...
        // stop assuming"). Two real problems fixed here, neither previously addressed: (1) this
        // function never scrolled `el` into view before reading its rect -- chrome.debugger's CDP
        // Input.dispatchMouseEvent clicks at raw VIEWPORT coordinates (real hit-testing, unlike
        // syntheticClick's dispatchEvent which targets the element directly regardless of where it
        // is on screen), so a Publish button that isn't fully in view when this runs would get a
        // click dispatched at the WRONG on-screen position -- possibly hitting nothing, or a
        // different element entirely, and reporting "success" from the debugger's point of view
        // (the mouse event dispatched fine) while never actually reaching the intended button. (2)
        // any attach/dispatch/detach failure was silently swallowed (resolve(false) with no reason
        // logged anywhere) -- meaning every prior round's "trustedClick failed" was a total black
        // box. Now scrolls into view, re-reads the rect fresh AFTER scrolling (never trusts a rect
        // computed before a scroll), and logs the actual background.js-reported error reason on any
        // failure so the next real run's console shows WHY, not just that it didn't work.
        el.scrollIntoView({ block: 'center' });
        setTimeout(() => {
          try {
            const r = el.getBoundingClientRect();
            const x = r.left + r.width / 2;
            const y = r.top + r.height / 2;
            if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) { console.warn('[FAS Grailed] trustedClick: chrome.runtime.sendMessage unavailable (stale/unreloaded extension context) -- falling back to synthetic click.'); resolve(false); return; }
            chrome.runtime.sendMessage({ type: 'fasTrustedClick', x, y }, (resp) => {
              if (chrome.runtime.lastError) { console.warn('[FAS Grailed] trustedClick: sendMessage failed -- ' + chrome.runtime.lastError.message + ' -- falling back to synthetic click.'); resolve(false); return; }
              if (!resp || !resp.ok) { console.warn('[FAS Grailed] trustedClick: background reported failure -- ' + (resp && resp.error || 'no response') + ' -- falling back to synthetic click.'); resolve(false); return; }
              resolve(true);
            });
          } catch (e) { console.warn('[FAS Grailed] trustedClick: threw -- ' + (e && e.message || e) + ' -- falling back to synthetic click.'); resolve(false); }
        }, 250); // let the scroll settle before reading the real post-scroll rect
      } catch (e) { console.warn('[FAS Grailed] trustedClick: threw before scroll -- ' + (e && e.message || e) + ' -- falling back to synthetic click.'); resolve(false); }
    });
  }
  // Shared with fas-vinted.js's identical helper -- scores candidates by exact match first, then by
  // shared-word overlap (more shared words wins, shorter label breaks ties), instead of the old
  // first-substring-match which was prone to grabbing an unrelated option that merely contained one
  // matching word.
  // BUG FIX 2026-08-20 (S-EXT-BATCH-8, P0, live-Chrome-confirmed): extracted from bestScoringOption
  // so pickCategory's own cross-segment comparison (below) can score a specific text/want pair with
  // the EXACT same rules bestScoringOption uses internally, instead of a separately-hand-rolled
  // formula that silently drifted out of sync with it (an earlier version of this fix did exactly
  // that -- pickCategory's inline re-score didn't know about the substring fallback below, so a
  // genuinely-found match could still lose a cross-segment comparison to nothing). Returns null if
  // this text/want pair isn't a real candidate at all (mirrors the old `continue` behavior).
  // BUG FIX 2026-08-20 (S-EXT-BATCH-10, P0, live-Chrome-confirmed on fas-vinted.js's identical
  // scoring formula): flat overlap-count scoring (one point per shared whole word, shorter text
  // breaking ties) live-confirmed picking the WRONG option for a real query -- see fas-vinted.js's
  // bestScoringOption comment for the full live example ("tracksuits & sets" wrongly scored "Sets"
  // above "Tracksuits" purely for being shorter). Ported the same position-weighted fix here: each
  // matched word is weighted by its position in the query (earlier = more significant) instead of
  // counted flatly, since FindA.Sale's category segments consistently put the specific term first
  // and a broader catch-all after.
  // BUG FIX (this pass, ported from fas-poshmark.js's live-Chrome-confirmed fix this session): the
  // subOverlap fallback tier below used `tw.indexOf(w) !== -1 || w.indexOf(tw) !== -1` -- a raw
  // substring test. Live-confirmed on Poshmark this session that "men" is a literal substring of
  // "women" (wo-MEN), so a department query for a word containing "women" can spuriously score a
  // match against an unrelated "Men..." option, and since this tier rewards SHORTER matched text,
  // the wrong option can outscore the right one. Grailed's exact "Menswear"/"Womenswear" spelling
  // doesn't trigger this today ("menswear" has no "o", so it can't be a substring hit for a "women"
  // query), but the underlying scoring rule is the same landmine -- hardened to require whole-word
  // containment (wordBoundaryHas) so a word can never match merely because it's spelled inside a
  // longer, unrelated word.
  function scoreMatch(text, want) {
    if (text === want) return 100000;
    // BUG FIX 2026-08-24 round 3 (live-Chrome-confirmed via the new department-fallback code above --
    // that fallback speculatively scores EVERY remaining segment against a much wider option set than
    // this function was originally exercised against, and that surfaced a real pre-existing bug here):
    // `.split(' ').filter(Boolean)` keeps a bare "&" as its own "word" -- so ANY two option/segment
    // strings that both happen to contain a standalone ampersand (e.g. FindA.Sale's own "Tracksuits &
    // Sets" against Grailed's real "Bags & Luggage") shared that one "word" and scored a false
    // whole-word match. Live-confirmed: scoring "Tracksuits & Sets" (categoryText, always added to the
    // candidate pool) against Womenswear's real leaves picked "Bags & Luggage" -- a tracksuit -- purely
    // because both strings contain "&". Filtered out here: a token with no alphanumeric character is
    // punctuation, never a real matchable word.
    const hasAlnum = (w) => /[a-z0-9]/.test(w);
    const wantWords = want.split(' ').filter(Boolean).filter(hasAlnum);
    const textWords = text.split(' ').filter(Boolean).filter(hasAlnum);
    let weighted = 0;
    for (let i = 0; i < wantWords.length; i++) {
      if (textWords.indexOf(wantWords[i]) !== -1) weighted += (wantWords.length - i) * 100;
    }
    if (weighted > 0) return weighted - text.length * 0.01;
    // Fallback tier: a want-word contained inside a text-word or vice versa (either direction, 3+
    // chars to avoid noise like "a" matching everything, WHOLE-WORD only -- see BUG FIX above)
    // -- catches compound-word options like "Menswear"/"Womenswear" where a real segment ("men")
    // shares zero WHOLE words with the option text but is obviously the right match. Live-verified
    // directly: without this, scoring ["Menswear","Womenswear"] against "men" returned no match at
    // all. Scored far lower (x10 not x100) so a genuine whole-word match anywhere in the option set
    // always wins over this fallback.
    const subOverlap = wantWords.filter((w) => w.length >= 3 && textWords.some((tw) => tw.length >= 3 && (wordBoundaryHas(tw, w) || wordBoundaryHas(w, tw)))).length;
    if (subOverlap === 0) return null;
    return subOverlap * 10 - text.length;
  }
  function bestScoringOption(options, wantText) {
    const want = norm(wantText);
    let best = null;
    let bestScore = -1;
    for (const opt of options) {
      const text = norm(opt.textContent);
      if (!text) continue;
      const score = scoreMatch(text, want);
      if (score === null) continue;
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
    // BUG FIX 2026-08-19 (S-EXT-BATCH-7, P0, live-Chrome-confirmed, root-caused after Patrick's
    // "Grailed still isn't filling out ANYTHING" report): the S-EXT-BATCH-5 version of this
    // function was wrong in THREE independent ways, all confirmed live against a real Grailed
    // sell form:
    //   1. openerByLabel('Designer') matched the WRONG element entirely -- a "Shop Popular
    //      Designers" PROMOTIONAL panel trigger (a curated shortcut widget of <a> links to
    //      Grailed's public /designers/* catalog pages), not the real field.
    //   2. The real field -- <input id="designer-autocomplete" placeholder="Designer (Select
    //      category first)"> -- is DISABLED until Category is set. run() called fillDesigner()
    //      BEFORE Category, so even targeting the right element would have hit a disabled input.
    //      Fixed at the call site in run(): pickCategory() now runs first.
    //   3. This field is NOT a standard React-controlled input -- the well-known "setNativeValue
    //      prototype-setter + dispatch input AND change" trick (used everywhere else in this file)
    //      actively BREAKS it: dispatching a 'change' event resets the typed value back to ''
    //      (live-confirmed: value was 'Bape' immediately after setting, then '' ~100ms after a
    //      'change' event fired). Dispatching ONLY 'input' (no 'change') is what keeps the typed
    //      value in place -- live-confirmed working, twice, with real suggestion results
    //      (typing "Bape" produced a real dropdown: Bape/Balenciaga/Eddie Bauer/Ted Baker/...).
    // The suggestion list itself is a plain <ul>/<li> structure (Grailed's own
    // "DesignersAndCollabs" module) with NO role attribute -- found by structural position
    // (visible <li> elements whose bounding box sits just below the input), not by its CSS-module
    // class name, consistent with this file's "never select by obfuscated class" rule.
    const el = document.querySelector('input[placeholder*="designer" i]') || document.getElementById('designer-autocomplete');
    if (!el) return 'field_missing';
    if (el.disabled) {
      console.warn('[FAS Grailed] Designer field is disabled -- Category must be set first. This should not happen if run() ordering is correct; skipping Designer.');
      return 'field_missing';
    }
    // BUG FIX 2026-08-24 round 5 (Patrick-directed -- "why isn't it defaulting to Not Listed?" --
    // and live-confirmed root cause via direct A/B test in Chrome DevTools against Patrick's real,
    // still-open draft): the old `el.focus()` here never actually opened Grailed's suggestion panel
    // at all -- confirmed live with a direct comparison: a synthetic `el.focus()`/`el.click()`
    // produced ZERO <li> options every time (matching every prior "typed_unconfirmed" result), but
    // this file's OWN existing `syntheticClick()` helper (the full pointerdown/mousedown/pointerup/
    // mouseup/click sequence, already used successfully elsewhere in this file for Radix menus)
    // opened the exact same panel reliably, live-confirmed twice, showing "Designer not listed / Not
    // sure" plus a Popular-designers list (Chrome Hearts/Prada/Carhartt/Dior/Raf Simons/Louis
    // Vuitton/Supreme/Rick Owens). Separately confirmed live that typing into the field via a
    // synthetic `input` event does NOT filter that list down to a real search match (the list stayed
    // on the same unfiltered Popular defaults after setting the value to "Adidas") -- Grailed's
    // search-as-you-type filtering itself appears to need a genuinely-trusted keyboard event, which a
    // content script cannot produce, matching this same file's already-documented Vinted-brand-search
    // class of limitation. Given a real filtered match can never be reliably confirmed this way, the
    // right behavior -- per Patrick's own direction -- is to open the panel for real (so it can be
    // scored at all) and, when no real scored match exists, click Grailed's own always-present
    // "Designer not listed / Not sure" option rather than leaving "Adidas" sitting typed and
    // unconfirmed. That option is real, always there, and committable -- confirmed live it's exactly
    // what a human organizer would click for a non-fashion brand like Adidas.
    // BUG FIX 2026-08-24 round 6 (Patrick-directed retest) -- ROOT CAUSE NOW CONFIRMED, and it is
    // NOT something a retry loop can reliably fix. Live-instrumented test (added temporary
    // capture-phase listeners on pointerdown/mousedown/pointerup/mouseup/click/focus and read
    // event.isTrusted directly): a real OS-level click on this input fires ALL SIX events with
    // isTrusted:true (including a 'focus' event) and opens the panel (6 <li> results) -- 2/2
    // real clicks succeeded. The exact same syntheticClick() pointer-event sequence used below
    // fires pointerdown/mousedown/pointerup/mouseup/click with isTrusted:false, fires NO 'focus'
    // event at all, and opens the panel 0/4 times across two separate controlled test runs
    // (3 of 4 in a bounded-retry loop, then 0/1 more in an isolated single-shot re-test
    // immediately after). This means: Grailed's Designer panel-open behavior requires a
    // genuinely browser-trusted user-input event (most likely gated on a trusted focus/pointerdown
    // per Grailed's own combobox implementation) -- a content script's dispatchEvent() calls, and
    // even a plain el.focus() (which the DOM spec itself defines as producing an untrusted
    // FocusEvent when called from script), can NEVER satisfy that gate, no matter how many times
    // or in what order they're retried. This is a real, confirmed browser-security-model boundary,
    // not a code bug -- the same reason a content script cannot fill a same-origin <input
    // type=file> or auto-solve a CAPTCHA. The retry loop below is kept as a harmless, low-cost
    // safety net for the rare case timing alone was the blocker, but it is NOT a reliable fix and
    // must not be reported as one -- this field will continue to fall through to
    // 'typed_unconfirmed' (or, when the panel does happen to open, to the 'not_listed' fallback)
    // on most real runs. Flagged to Patrick as a genuine platform limitation, not deferred as
    // unexplored.
    // BUG FIX 2026-08-24 round 6 follow-up (Patrick: "make it work, stop being shallow") -- now
    // tries a REAL trusted click (via background.js's chrome.debugger bridge, see trustedClick()
    // above) FIRST on every attempt, only falling back to the known-unreliable syntheticClick()
    // if trustedClick() itself reports failure (e.g. the "debugger" permission isn't active yet
    // because the unpacked extension hasn't been reloaded since this round shipped, or another
    // debugger client -- like real DevTools -- is already attached to this tab).
    let lis = [];
    let r = el.getBoundingClientRect();
    for (let attempt = 1; attempt <= 4; attempt++) {
      const usedTrusted = await trustedClick(el);
      if (!usedTrusted) syntheticClick(el);
      await sleep(500);
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true })); // NEVER dispatch 'change' here -- see comment above.
      await sleep(700); // suggestion list settle time, live-confirmed necessary
      r = el.getBoundingClientRect();
      lis = qa('li').filter((li) => {
        if (!li.offsetParent && li.getBoundingClientRect().width === 0) return false;
        const rr = li.getBoundingClientRect();
        return rr.width > 0 && rr.height > 0 && rr.top >= r.bottom - 5 && rr.top < r.bottom + 300 && Math.abs(rr.left - r.left) < 40;
      });
      if (lis.length) break;
      console.warn('[FAS Grailed] Designer suggestion panel did not open on attempt ' + attempt + '/4 (' + (usedTrusted ? 'trusted' : 'synthetic') + ' click) -- retrying.');
      el.blur();
      document.body.click();
      await sleep(400);
    }
    if (!lis.length) return 'typed_unconfirmed';
    // BUG FIX 2026-08-24 round 6 (Patrick-directed retest) -- CRITICAL correction: the round-5
    // comments below claiming syntheticClick() "confirmed live via screenshot" that a selection
    // committed were themselves not reliable -- a clean re-test this round (real isTrusted click
    // immediately followed by a syntheticClick on the SAME "Designer not listed" option, with the
    // panel confirmed open both times) showed the synthetic click did NOT commit: the field stayed
    // on its empty placeholder and the panel remained open, identical to a no-op. Grailed's real
    // committed state is unambiguous and checkable -- the input's value becomes the designer name
    // (or literally "Other" for the not-listed option) AND a
    // `button[aria-label="Clear selected designer"]` sibling appears (confirmed via a real click,
    // live DOM read of the parent container). So this function no longer trusts "the click fired"
    // as proof of success -- it now checks that structural signal afterward and only returns
    // 'matched'/'not_listed' when it's actually present. Given the round-6 isTrusted findings
    // above, expect this to resolve to 'typed_unconfirmed' on most real (non-manual) runs -- that
    // is the honest, correct outcome, not a regression.
    function designerCommitted() {
      return !!document.querySelector('button[aria-label="Clear selected designer" i]');
    }
    const opt = bestScoringOption(lis, value);
    if (opt) {
      if (!(await trustedClick(opt))) syntheticClick(opt);
      await sleep(300);
      el.blur();
      await sleep(150);
      if (designerCommitted()) return 'matched';
      // One more try with the other click mechanism before giving up -- if trustedClick()
      // reported success but the commit still didn't stick (timing), or if it silently no-op'd,
      // a plain syntheticClick() as a second attempt is free and occasionally still helps once the
      // panel is already open (unlike opening it, since opening was the harder trust-gated step).
      syntheticClick(opt);
      await sleep(300);
      el.blur();
      await sleep(150);
      if (designerCommitted()) return 'matched';
      console.warn('[FAS Grailed] Designer "' + value + '" suggestion click did not actually commit (no "Clear selected designer" control appeared afterward) -- leaving as unconfirmed for manual selection.');
      return 'typed_unconfirmed';
    }
    // No real scored match among the (unfiltered, since search-filter needs a trusted keystroke)
    // suggestion list -- try Grailed's own "Designer not listed / Not sure" rather than leaving the
    // typed text unconfirmed. norm() lowercases/collapses whitespace, so this matches regardless of
    // the nested "Don't worry, you can describe below" sub-line being concatenated in.
    const notListed = lis.find((li) => norm(li.textContent).indexOf('designer not listed') !== -1 || norm(li.textContent).indexOf('not sure') !== -1);
    if (notListed) {
      if (!(await trustedClick(notListed))) syntheticClick(notListed);
      await sleep(300);
      el.blur();
      await sleep(150);
      if (!designerCommitted()) {
        syntheticClick(notListed);
        await sleep(300);
        el.blur();
        await sleep(150);
      }
      if (designerCommitted()) {
        console.warn('[FAS Grailed] Designer "' + value + '" has no confirmable match in Grailed\'s suggestion list -- selected Grailed\'s own "Designer not listed / Not sure" instead. Describe the brand in the listing if you want it more specific.');
        return 'not_listed';
      }
      console.warn('[FAS Grailed] Designer "' + value + '" -- attempted to select "Designer not listed / Not sure" but the click did not commit (browser-trust limitation, see comment above). Leaving as unconfirmed for manual selection.');
      return 'typed_unconfirmed';
    }
    return 'typed_unconfirmed';
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
    // BUG FIX 2026-08-21 (S-EXT-BATCH, P0, live-Chrome-confirmed root cause of Size/Color -- and
    // any other fillSelectLike field -- never actually selecting despite opening correctly):
    // the page-wide `qa('[role="menuitem"]...').filter(offsetParent!==null)` query below used to
    // pull in Grailed's own persistent top-nav mega-menus (DESIGNERS / MENSWEAR / WOMENSWEAR
    // flyouts) alongside the real just-opened panel's options -- live-confirmed those nav flyouts
    // report `offsetParent !== null` even while visually closed (Grailed hides them via
    // opacity/pointer-events, not display:none), so a real Size panel with exactly 7 options
    // ("US XXS/EU 40" ... "US XXL/EU 58") returned 15 "visible" candidates once mixed with the nav's
    // own menuitems, several of which happened to out-score the real match. Live-confirmed the fix:
    // scope the option query to the panel's own `aria-controls` target (the SAME pattern
    // pickCategory already uses successfully a few functions up) -- 7 real options, zero
    // contamination, "M" -> "US M / EU 48-50 / 2" resolves and confirms correctly. Falls back to the
    // old page-wide scan only if the opener has no aria-controls at all (never observed live, but a
    // safe fallback rather than a hard failure).
    function scopedMenuItems(triggerEl) {
      const contentId = triggerEl.getAttribute && triggerEl.getAttribute('aria-controls');
      const content = contentId ? document.getElementById(contentId) : null;
      if (content) return Array.from(content.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"]'));
      return qa('[role="menuitem"], [role="menuitemradio"], [role="option"], li[role="option"], li').filter((el) => el.offsetParent !== null);
    }
    const opt = bestScoringOption(scopedMenuItems(opener), value);
    if (!opt) return false;
    const pickedText = norm(opt.textContent);
    syntheticClick(opt);
    await sleep(250);
    // BUG FIX 2026-08-20 (S-EXT-BATCH, P0, live-Chrome-confirmed): this used to return true
    // unconditionally the instant a matching option was clicked -- live-confirmed Color stayed on
    // Grailed's own "Select a Color" placeholder after a run that logged ZERO warnings for it,
    // meaning the click landed on something (or timed out) without the value ever actually taking,
    // and the false "success" suppressed tryFill's own warning path entirely. Confirm the opener's
    // displayed text now actually reflects the picked value before reporting success (mirrors
    // pickCategory's own click-then-confirm discipline elsewhere in this file); one retry with a
    // freshly re-queried opener/option before giving up honestly.
    if (norm(opener.textContent).indexOf(pickedText) !== -1) return true;
    const openerFresh = openerByLabel(labelText) || opener;
    syntheticClick(openerFresh);
    await sleep(400);
    const optRetry = bestScoringOption(scopedMenuItems(openerFresh), value);
    if (!optRetry) return false;
    const pickedTextRetry = norm(optRetry.textContent);
    syntheticClick(optRetry);
    await sleep(250);
    return norm(openerFresh.textContent).indexOf(pickedTextRetry) !== -1;
  }

  // Category: "Department / Category" is ONE combined control on the real form (see the BUG FIX
  // comment above) -- openerByLabel('Category') matches it via substring ("category" is contained
  // in "department / category") plus the nearestControlAfter fallback. Native-select-aware first
  // (see fillSelectLike comment), same click+optionElByText fallback otherwise. FindA.Sale's
  // item.category is a flat, potentially multi-segment string with no reliable 1:1 mapping to
  // Grailed's own category depth -- tries the full string first, then progressively shorter
  // trailing segments (most-specific-first) if that doesn't match anything, same spirit as the
  // Mercari segmented picker but simpler since Grailed's picker structure is still unconfirmed.
  // BUG FIX 2026-08-20 (S-EXT-BATCH-12, Patrick-confirmed real-world mapping + live-Chrome-
  // verified against the real picker): FindA.Sale's clean `ebayCategoryName` ("Tracksuits & Sets")
  // shares no word with Grailed's own Category bucket ("Tops") or Sub-category ("Sweatshirts &
  // Hoodies") -- no amount of text-similarity scoring bridges that gap, because it isn't a text
  // problem, it's a taxonomy problem. Patrick browsed real Grailed tracksuit listings and confirmed
  // where they're actually filed; verified live that "Sweatshirts & Hoodies" is a genuine
  // Sub-category option under Menswear/Tops (queried the real open panel, not assumed). This is a
  // manually-curated, append-only table of CONFIRMED real mappings (never a guess) for exactly the
  // cases where clean-name scoring alone can't find the right leaf. Key is the normalized clean
  // category name (`item.category`, e.g. "Tracksuits & Sets" post S-EXT-BATCH-12); value is the
  // Category-level bucket and, optionally, the Sub-category leaf. Add more rows here as they're
  // confirmed -- do not extend this with guesses.
  const GRAILED_CATEGORY_OVERRIDES = {
    'tracksuits & sets': { category: 'Tops', subCategory: 'Sweatshirts & Hoodies' },
  };
  // categoryText: FindA.Sale's clean leaf category name (post S-EXT-BATCH-12, e.g. "Tracksuits &
  // Sets") -- tried directly against Category/Sub-category options and against
  // GRAILED_CATEGORY_OVERRIDES. breadcrumbText: the original full eBay-taxonomy breadcrumb (e.g.
  // "Clothing, Shoes & Accessories:men:men's Clothing:activewear:tracksuits & Sets") -- Grailed is
  // the only one of the four platforms with a gender-level Department field (Menswear/Womenswear),
  // and that signal ("men"/"women") only exists in the breadcrumb, never in the clean leaf name
  // alone, so this file specifically still needs both fields where the other three content scripts
  // (S-EXT-BATCH-12) only need the clean `category` value.
  async function pickCategory(categoryText, breadcrumbText) {
    if (!categoryText) return false;
    const opener = openerByLabel('Category');
    if (!opener) return false;
    if (opener.tagName === 'SELECT') {
      const segments = (breadcrumbText || categoryText).split(':').map((s) => s.trim()).filter(Boolean);
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
    const segments = (breadcrumbText || categoryText).split(':').map((s) => s.trim()).filter(Boolean);
    const levelQueries = segments.length ? segments : [categoryText];
    // BUG FIX 2026-08-20 (S-EXT-BATCH-10, P0, live-Chrome-confirmed crash): placeholderText is read
    // much further down (the `committed` check) but was never actually declared anywhere in this
    // function -- a plain ReferenceError, confirmed live via Patrick's real test ("Something went
    // wrong filling this listing (placeholderText is not defined)"). Must be captured HERE, before
    // the picker opens and its displayed text changes, so the committed-check has the real
    // before-value to compare against.
    const placeholderText = norm(opener.textContent);
    // BUG FIX 2026-08-25 round 13 (live-confirmed, not a guess -- direct DOM query against Patrick's
    // real tab after a failed run): console showed "override-check: pickedAny=false" and "no level
    // matched in the picker" even for "Tracksuits & Sets", which HAS a real GRAILED_CATEGORY_OVERRIDES
    // entry that should have applied. Root cause: the level-0 loop below (`if (aria-expanded ===
    // 'false') break`) was breaking on its VERY FIRST iteration, before ever building an `items` list
    // or trying a single match, because the plain `syntheticClick(opener)` below never actually opened
    // this Radix menu -- aria-expanded stayed 'false'. This is the exact same class of bug already
    // found and fixed for the Designer field earlier this session (direct event.isTrusted
    // instrumentation proved synthetic clicks can't reliably open Grailed's Radix panels) -- Category's
    // own Department/Category trigger needed the identical trustedClick()-first + bounded-retry
    // treatment, which it never got. Mirrors fillDesigner's retry loop below.
    let opened = false;
    for (let attempt = 1; attempt <= 4; attempt++) {
      const usedTrusted = await trustedClick(opener);
      if (!usedTrusted) syntheticClick(opener);
      await sleep(450);
      if (opener.getAttribute && opener.getAttribute('aria-expanded') === 'true') { opened = true; break; }
      console.warn('[FAS Grailed] Category/Department picker did not open on attempt ' + attempt + '/4 (' + (usedTrusted ? 'trusted' : 'synthetic') + ' click) -- retrying.');
    }
    if (!opened) {
      console.warn('[FAS Grailed] Category "' + categoryText + '" -- the Department/Category picker never opened after 4 attempts (UNVERIFIED interaction) -- left for the organizer to choose.');
      return false;
    }
    let pickedAny = false;
    // BUG FIX 2026-08-20 (S-EXT-BATCH-8, P0, live-Chrome-confirmed via Patrick's real re-test): TWO
    // stacked problems, both confirmed live against the real failing item ("Clothing, Shoes &
    // Accessories:men:men's Clothing:activewear:tracksuits & Sets", a tracksuit):
    // (1) The old version queried `levelQueries[queryIdx]` in strict left-to-right order, assuming
    //     FindA.Sale's segment 0 always corresponds to Grailed's picker level 0. Live-confirmed
    //     wrong: level 0 of Grailed's picker is Menswear/Womenswear (gender), but segment 0 is
    //     "Clothing, Shoes & Accessories" -- FindA.Sale's eBay-style TOP-LEVEL UMBRELLA segment,
    //     present on every single clothing item regardless of type, with zero relation to gender or
    //     garment type. It never matched level 0, the loop broke immediately, and segment 1 ("men",
    //     the segment that actually WOULD match) never even got tried.
    // (2) Fixing (1) by trying every remaining segment at each level surfaced a WORSE, second bug:
    //     "Clothing, Shoes & Accessories" happens to share the whole word "accessories" with one of
    //     Grailed's real level-1 leaf options (Tops/Bottoms/Outerwear/Footwear/Tailoring/
    //     Accessories) -- a coincidental collision that made the picker land on "Accessories" for a
    //     TRACKSUIT. Live-confirmed via screenshot: "Menswear / Accessories" got set. A wrong
    //     category silently filled in is worse than an empty one -- it looks correct at a glance and
    //     an organizer has no reason to double-check it.
    // Root fix for both: FindA.Sale's segment 0 is ALWAYS this same generic eBay-taxonomy umbrella
    // for anything clothing-related (confirmed by inspecting the real category string) and Grailed
    // is fashion-only, so that segment can never correspond to a real Grailed leaf -- it is dropped
    // entirely from the candidate pool for Grailed's picker specifically, whenever more than one
    // segment exists. The whole-categoryText fallback (tried at each level if no segment matched)
    // is ALSO removed -- it re-introduces the exact same collision risk (the full string still
    // contains "accessories"), and per this file's own "never fabricate/guess a value" spirit, a
    // level that has no real segment match should stay unset rather than risk a wrong pick.
    let remaining = (levelQueries.length > 1 ? levelQueries.slice(1) : levelQueries).map((seg, i) => ({ seg, i }));
    // Always ALSO offer the clean leaf category name as a candidate -- once Department (level 0)
    // is resolved from the breadcrumb, the clean name is very often the actual best match for
    // Category (level 1) itself (e.g. a clean "Hoodies" would directly match a Grailed "Hoodies"
    // bucket if one existed), so it's added to the pool rather than only tried as a last resort.
    if (categoryText && !remaining.some((r) => norm(r.seg) === norm(categoryText))) {
      remaining.push({ seg: categoryText, i: remaining.length });
    }
    for (let level = 0; level < 4; level++) {
      await sleep(300);
      if (opener.getAttribute && opener.getAttribute('aria-expanded') === 'false') break; // menu auto-closed -- fully resolved
      const contentId = opener.getAttribute && opener.getAttribute('aria-controls');
      const content = contentId ? document.getElementById(contentId) : null;
      const items = content
        ? Array.from(content.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"]'))
        : qa('[role="menuitem"], [role="menuitemradio"], [role="option"]').filter((el) => el.offsetParent !== null);
      if (!items.length) break;
      let best = null, bestScoreForLevel = -1, bestRemainingIdx = -1;
      for (let r = 0; r < remaining.length; r++) {
        const candidate = bestScoringOption(items, remaining[r].seg);
        if (!candidate) continue;
        // Re-score the winning candidate against THIS segment specifically so segments compete fairly
        // against each other for this level (bestScoringOption already returns the top pick for one
        // query; comparing across queries needs its own pass). Uses the SAME scoreMatch() helper
        // bestScoringOption itself uses -- see that function's comment for why a separately hand-
        // rolled formula here caused a real regression during this fix.
        const score = scoreMatch(norm(candidate.textContent), norm(remaining[r].seg));
        if (score !== null && score > bestScoreForLevel) { bestScoreForLevel = score; best = candidate; bestRemainingIdx = r; }
      }
      if (!best && level === 0) {
        // BUG FIX 2026-08-24 (Patrick-reported live console log: "no level matched in the picker" on
        // the SAME tracksuit item this whole file's Category logic was built around, AFTER the
        // separate extensionController.ts fix that made categoryText/breadcrumbText the clean leaf
        // name -- confirmed this is a DIFFERENT, deeper bug: FindA.Sale has no stored signal for
        // Grailed's Department (Menswear/Womenswear) at all -- confirmed via schema.prisma, there is
        // only a flat `category` and a leaf-only `ebayCategoryName`/`ebayCategoryId`, never a full
        // gendered breadcrumb -- so level 0 here almost never has a real segment to match, and the
        // plain `break` below left Category (and everything gated on it -- Designer, Size) completely
        // unset for any item without an explicit gender word in its text, even when the real category
        // one level down (e.g. "Tracksuits & Sets") is perfectly resolvable once SOME department is
        // picked. Live-confirmed via Chrome DevTools against the real picker (2026-08-24): Grailed
        // exposes a genuine, reversible "Back to departments" button (aria-label="Back to
        // departments") inside this SAME panel -- clicking a department re-renders this panel in
        // place to show that department's own top-level categories (same aria-controls id the whole
        // time, confirmed live), and the back button cleanly returns it to the Menswear/Womenswear
        // list with no other observed side effect. Speculatively try each department in turn, keep
        // whichever one actually resolves a real remaining segment, and back out to try the next one
        // if it doesn't -- instead of guessing blind or abandoning the field entirely.
        // BUG FIX 2026-08-24 round 2 (Patrick-reported live console log AFTER the fix above shipped:
        // "defaulted to 'menswear'... full Department/Category combo never committed" -- the default
        // never actually took). Root-caused live via Chrome DevTools against the real picker: Grailed
        // tears down and RECREATES the department menuitem elements every time the panel navigates
        // (Menswear -> its categories -> Back to departments) -- confirmed live: a `items[0]` reference
        // captured before that round-trip has `isConnected === false` afterward, so a later
        // syntheticClick(items[0]) on it dispatches events into thin air and does nothing (panel stayed
        // open, opener text never changed). The ORIGINAL `items` array (captured once, above, before
        // this level-0 branch ever navigates anywhere) goes stale the moment ANY department is tried and
        // backed out of -- it can never safely be reused for a second click, whether that's the next
        // department in the loop or the final default. Fixed by re-querying the department list fresh
        // from the live DOM (by the same stable contentId) immediately before every single click in this
        // block, never reusing a captured element across a navigation boundary.
        function queryDeptItems() {
          const c = contentId ? document.getElementById(contentId) : null;
          return c ? Array.from(c.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"]')) : [];
        }
        console.log('[FAS Grailed DIAG] level0: no direct match; departments seen=' + JSON.stringify(items.map((i) => i.textContent.trim())) + ' remaining segments=' + JSON.stringify(remaining.map((r) => r.seg)));
        let resolvedDept = false;
        for (let d = 0; d < items.length; d++) {
          const freshDeptItems = queryDeptItems();
          const deptItem = freshDeptItems[d];
          if (!deptItem) { console.log('[FAS Grailed DIAG] level0: no fresh deptItem at index ' + d + ' -- bailing'); break; }
          const deptLabel = norm(deptItem.textContent);
          syntheticClick(deptItem);
          await sleep(350);
          const deptItems = queryDeptItems();
          console.log('[FAS Grailed DIAG] level0: tried "' + deptLabel + '" -> categories seen=' + JSON.stringify(deptItems.map((i) => i.textContent.trim())));
          let deptBest = null, deptBestScore = -1, deptBestIdx = -1;
          for (let r = 0; r < remaining.length; r++) {
            const candidate = bestScoringOption(deptItems, remaining[r].seg);
            if (!candidate) continue;
            const score = scoreMatch(norm(candidate.textContent), norm(remaining[r].seg));
            if (score !== null && score > deptBestScore) { deptBestScore = score; deptBest = candidate; deptBestIdx = r; }
          }
          if (deptBest) {
            console.log('[FAS Grailed DIAG] level0: "' + deptLabel + '" MATCHED "' + norm(deptBest.textContent) + '" for segment "' + remaining[deptBestIdx].seg + '"');
            console.warn('[FAS Grailed] Category "' + categoryText + '" -- no department/gender signal in the source data; tried "' + deptLabel + '" and it resolved a real match for "' + remaining[deptBestIdx].seg + '" -- kept this department (UNVERIFIED gender guess -- please confirm this is correct before publishing).');
            syntheticClick(deptBest);
            pickedAny = true;
            remaining.splice(deptBestIdx, 1);
            await sleep(350);
            resolvedDept = true;
            break;
          }
          const backBtn = document.querySelector('[aria-label="Back to departments"]');
          if (backBtn) { backBtn.click(); await sleep(300); }
        }
        if (resolvedDept) continue; // aria-expanded check at the top of the next iteration will end the loop once Grailed auto-closes the combo
        // Neither department resolved a real match -- default to the first so Designer/Size can still
        // unlock, but say so loudly rather than silently leaving everything blank. Re-query fresh (see
        // comment above -- the last "Back to departments" click left the panel on the department list,
        // but the ORIGINAL `items` references are stale/detached by now).
        const finalDeptItems = queryDeptItems();
        if (finalDeptItems.length) {
          const finalLabel = norm(finalDeptItems[0].textContent);
          syntheticClick(finalDeptItems[0]);
          pickedAny = true;
          await sleep(350);
          console.log('[FAS Grailed DIAG] level0: defaulted to "' + finalLabel + '" -- opener text now="' + norm(opener.textContent) + '" ariaExpanded=' + opener.getAttribute('aria-expanded'));
          console.warn('[FAS Grailed] Category "' + categoryText + '" -- no department signal in the source data and neither department resolved a real category match -- defaulted to "' + finalLabel + '" as a guess (UNVERIFIED) -- please confirm Category/Designer/Size before publishing.');
        } else {
          console.log('[FAS Grailed DIAG] level0: no fresh department items at all for the final default -- picker likely closed/changed unexpectedly.');
        }
        break;
      }
      if (!best) break; // no remaining segment is a real match for this level -- stop rather than guess
      syntheticClick(best);
      pickedAny = true;
      if (bestRemainingIdx !== -1) remaining.splice(bestRemainingIdx, 1);
      await sleep(350);
    }
    // BUG FIX 2026-08-20 (S-EXT-BATCH-12): if Department resolved but Category (level 1) never
    // found a real text match, check the confirmed-mapping table before giving up -- this is the
    // ONLY place GRAILED_CATEGORY_OVERRIDES is consulted, and only as a fallback after real
    // scoring already had its shot. Re-queries the currently-open panel (still open -- nothing
    // closed it, since the normal loop only breaks on a miss, it never dismisses anything) rather
    // than assuming stale items are still valid.
    // BUG FIX 2026-08-20 (S-EXT-BATCH-12 follow-up, live-Chrome-confirmed, Patrick's re-test):
    // this override lookup used to key ONLY on an exact `norm(categoryText) === ` match against
    // GRAILED_CATEGORY_OVERRIDES. That's correct once the backend sends the clean leaf name
    // ("Tracksuits & Sets") as `categoryText`, but the backend change that makes that true
    // (extensionController.ts preferring `ebayCategoryName`) ships on its own deploy, separate
    // from this file's reload -- confirmed live: Patrick reloaded the extension and re-tested
    // BEFORE that backend deploy had gone out (it was stuck, see the Railway WAITING investigation
    // this session), so `categoryText` was still the full raw breadcrumb
    // ("Clothing, Shoes & Accessories:men:men's Clothing:activewear:tracksuits & Sets"), which
    // never equals the override key "tracksuits & sets" -- the override silently never fired, and
    // Grailed's Category was left uncommitted exactly like before this fix existed. Rather than
    // make this file's correctness depend on backend/extension deploy ordering, the lookup now
    // also matches when an override key is CONTAINED in the raw categoryText/breadcrumbText (a
    // breadcrumb ending in ":tracksuits & Sets" contains the key "tracksuits & sets" as a
    // substring) -- works whether the backend has shipped the clean name yet or not.
    function findCategoryOverride(rawCategoryText, rawBreadcrumbText) {
      const hay = norm(rawCategoryText) + ' | ' + norm(rawBreadcrumbText || '');
      if (GRAILED_CATEGORY_OVERRIDES[norm(rawCategoryText)]) return GRAILED_CATEGORY_OVERRIDES[norm(rawCategoryText)];
      for (const key in GRAILED_CATEGORY_OVERRIDES) {
        if (hay.indexOf(key) !== -1) return GRAILED_CATEGORY_OVERRIDES[key];
      }
      return null;
    }
    let overrideSubCategory = null;
    console.log('[FAS Grailed DIAG] override-check: pickedAny=' + pickedAny + ' openerText="' + norm(opener.textContent) + '" placeholderText="' + placeholderText + '"');
    if (pickedAny && norm(opener.textContent) === placeholderText) {
      const override = findCategoryOverride(categoryText, breadcrumbText);
      console.log('[FAS Grailed DIAG] override lookup for "' + categoryText + '" -> ' + JSON.stringify(override));
      if (override) {
        const contentId = opener.getAttribute && opener.getAttribute('aria-controls');
        const content = contentId ? document.getElementById(contentId) : null;
        const items = content
          ? Array.from(content.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"]'))
          : qa('[role="menuitem"], [role="menuitemradio"], [role="option"]').filter((el) => el.offsetParent !== null);
        console.log('[FAS Grailed DIAG] override-panel items=' + JSON.stringify(items.map((i) => i.textContent.trim())));
        const opt = items.find((el) => norm(el.textContent) === norm(override.category));
        if (opt) {
          syntheticClick(opt);
          await sleep(350);
          overrideSubCategory = override.subCategory || null;
          console.warn('[FAS Grailed] Category "' + categoryText + '" -- no text match at the Category level; used the confirmed mapping to "' + override.category + '" instead (see GRAILED_CATEGORY_OVERRIDES).');
        } else {
          console.log('[FAS Grailed DIAG] override target "' + override.category + '" not found among current panel items -- override could not apply.');
        }
      }
    }
    const queryIdx = levelQueries.length - remaining.length; // segments actually consumed, for Sub-category below
    // BUG FIX 2026-08-20 (S-EXT-BATCH-8, P1, live-Chrome-confirmed): `pickedAny` only means "we
    // clicked something at some level" -- it does NOT mean Grailed actually committed a final value.
    // Grailed's Department/Category is a single 2-level combo that only updates its own button text
    // once BOTH levels are resolved (confirmed live: clicking only level 0 -- e.g. Menswear -- with
    // no confident level-1 match left the button still showing the "Department / Category"
    // placeholder, even though pickedAny was already true from the level-0 click). Trusting
    // pickedAny alone would have suppressed the "no match" warning below for a field that is, from
    // the organizer's perspective, still completely empty. Check Grailed's own ground truth instead:
    // did the opener's visible text actually change from the placeholder it started with?
    const committed = pickedAny && norm(opener.textContent) !== placeholderText && norm(opener.textContent).length > 0;
    if (!committed) {
      console.warn('[FAS Grailed] Category "' + categoryText + '" -- ' + (pickedAny ? 'a department was matched but the full Department/Category combo never committed' : 'no level matched in the picker') + ' (UNVERIFIED taxonomy) -- left for the organizer to choose.');
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
        const subQuery = overrideSubCategory || levelQueries[levelQueries.length - 1];
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
  // BUG FIX 2026-08-20 (S-EXT-BATCH round 2, P0, live-Chrome-confirmed): live-confirmed this
  // round that Grailed's real option lists don't contain our raw values at all -- Size options
  // read "US M / EU 48-50 / 2" (no bare "Medium" anywhere), and Color options are a fixed 15-word
  // list (Black/White/Gray/Brown/Beige/Yellow/Red/Orange/Pink/Purple/Blue/Green/Multi/Silver/Gold
  // -- no "Neon"). Same class of vocabulary-mismatch bug already fixed on fas-vinted.js this
  // session -- same remedy: remap a common non-Grailed word to the real option's dominant token
  // BEFORE scoring, so it resolves to something real instead of silently failing.
  const GRAILED_SIZE_ABBREVIATIONS = {
    'x-small': 'XXS', 'xsmall': 'XXS', 'xxs': 'XXS',
    small: 'S', s: 'S',
    medium: 'M', m: 'M',
    large: 'L', l: 'L',
    'x-large': 'XL', 'xlarge': 'XL', 'xl': 'XL',
    'xx-large': 'XXL', 'xxlarge': 'XXL', 'xxl': 'XXL',
  };
  const GRAILED_COLOR_SYNONYMS = {
    neon: 'Yellow', tan: 'Beige', maroon: 'Red', olive: 'Green', ivory: 'White',
    teal: 'Blue', charcoal: 'Gray', grey: 'Gray', rust: 'Orange', lavender: 'Purple',
    magenta: 'Pink', indigo: 'Blue', navy: 'Blue', cream: 'White',
    multicolor: 'Multi', multicolour: 'Multi', transparent: 'White',
  };
  function fillSize(value) {
    const resolved = GRAILED_SIZE_ABBREVIATIONS[norm(value)] || value;
    return fillSizeInner(resolved);
  }
  // BUG FIX 2026-08-23 (main-session live-Chrome investigation against a real logged-in Grailed
  // sell form, artifactmi@gmail.com): live-confirmed the fallback this replaced was actively
  // dangerous, not just a weaker path. When fillSelectLike('Size', value) fails (its real-world
  // trigger case: Size's own dropdown trigger is still `disabled` because Category never fully
  // committed -- a documented, non-rare failure mode elsewhere in this file), the old fallback
  // called fieldByLabel('Size') and wrote whatever it found via setNativeValue. Live-confirmed
  // fieldByLabel/nearestControlAfter's ancestor-walk, given the label text "Size" against
  // Grailed's real disabled "Select Size (Select category first)" placeholder span, does NOT stay
  // within that field's own row -- it walks up 3 ancestor levels and across sibling elements and
  // lands on a COMPLETELY UNRELATED control: the Item Name/title `<input>` several sections down
  // the page. The old fallback would have silently overwritten the organizer's Item Name with the
  // size value (e.g. "US M / EU 48-50 / 2") and reported SUCCESS (tryFill's own warning never
  // fires), corrupting a different, already-filled field instead of just failing this one honestly.
  // Removed rather than patched narrower -- per this file's own report-don't-guess standard, a
  // genuine miss should surface as "selector not found, skipped" (tryFill's existing warning),
  // not silently corrupt whatever nearestControlAfter happens to wander into.
  async function fillSizeInner(value) {
    return fillSelectLike('Size', value);
  }

  // BUG FIX 2026-08-21 (S-EXT-BATCH, P1, live-Chrome-confirmed field exists + real option list
  // read directly off the page): "Select a Style" is a real Radix dropdown under "Describe your
  // listing's style" -- confirmed live options (read off the actual open panel, not guessed): None,
  // Luxury, Vintage, Avant-Garde, Streetwear, Workwear, Gorpcore, Sportswear, Basics, Western.
  // FindA.Sale's Item model has NO dedicated style field (confirmed against schema.prisma -- grepped
  // for "style", zero matches), so this infers a style from signals the item DOES carry: brand
  // (matched against real, well-known houses/labels associated with each style tag) and
  // category/title/description keywords. Each rule below is a real-world association, not a random
  // guess -- e.g. Carhartt/Dickies are workwear houses, Arc'teryx/Patagonia/TNF are gorpcore/technical
  // outdoor houses, Supreme/Bape/Stussy/Palace/Kith are streetwear houses. Per this file's own
  // no-fabrication standard (see Measurements/Designer comments above): if NO real signal matches,
  // this returns Grailed's own "None" option rather than guessing a specific style with no support --
  // "None" is a legitimate, Grailed-provided answer (not invented), so the field is still always
  // filled with something real, never silently skipped.
  const STYLE_BRAND_MAP = {
    // Avant-garde houses checked BEFORE the broader luxury list -- more specific and accurate for
    // these particular names than the generic "Luxury" bucket would be.
    'rick owens': 'Avant-Garde', 'yohji yamamoto': 'Avant-Garde', 'comme des garcons': 'Avant-Garde',
    "comme des garçons": 'Avant-Garde', 'maison margiela': 'Avant-Garde',
    'chanel': 'Luxury', 'dior': 'Luxury', 'gucci': 'Luxury', 'prada': 'Luxury',
    'louis vuitton': 'Luxury', 'saint laurent': 'Luxury', 'balenciaga': 'Luxury',
    'bottega veneta': 'Luxury', 'celine': 'Luxury',
    'supreme': 'Streetwear', 'bape': 'Streetwear', 'stussy': 'Streetwear', 'palace': 'Streetwear',
    'kith': 'Streetwear', 'off-white': 'Streetwear', 'vetements': 'Streetwear',
    'chrome hearts': 'Streetwear',
    "arc'teryx": 'Gorpcore', 'arcteryx': 'Gorpcore', 'the north face': 'Gorpcore',
    'north face': 'Gorpcore', 'patagonia': 'Gorpcore', 'salomon': 'Gorpcore',
    'carhartt': 'Workwear', 'dickies': 'Workwear',
  };
  const STYLE_KEYWORD_RULES = [
    // Order matters -- first match wins. Checked against normalized title + description + category.
    { style: 'Vintage', re: /\bvintage\b|\by2k\b|\bretro\b|\b(70s|80s|90s)\b/ },
    { style: 'Western', re: /\bwestern\b|\bcowboy\b|\bcowgirl\b|\brodeo\b/ },
    { style: 'Gorpcore', re: /\bgorpcore\b|\btechnical\b|\boutdoor\b|\bhiking\b/ },
    { style: 'Workwear', re: /\bworkwear\b|\bwork jacket\b|\bchore coat\b/ },
    { style: 'Streetwear', re: /\bstreetwear\b|\bhoodie\b|\bsweatshirt\b|\bgraphic tee\b/ },
    { style: 'Sportswear', re: /\bactivewear\b|\btracksuit\b|\bathletic\b|\bsweatpants\b|\bjersey\b|\bperformance\b|\bgym\b/ },
  ];
  function inferGrailedStyle(item) {
    const brand = norm(item.brand || '');
    if (STYLE_BRAND_MAP[brand]) return STYLE_BRAND_MAP[brand];
    const hay = norm([item.title, item.description, item.category].filter(Boolean).join(' '));
    for (const rule of STYLE_KEYWORD_RULES) {
      if (rule.re.test(hay)) return rule.style;
    }
    return 'None'; // Grailed's own explicit "no particular style" option -- never a fabricated guess.
  }

  // BUG FIX 2026-08-21 (S-EXT-BATCH, P1, live-Chrome-confirmed field exists): "Where was your item
  // made?" / "Provide the country of origin for this product for customs" is a real, plain free-text
  // input (confirmed live: `input[placeholder="Country name"]`, no autocomplete/suggestion list --
  // unlike Designer, typing a value just sets it directly). UNLIKE Style above, this is a factual
  // customs-relevant claim about a SPECIFIC physical item, not a subjective marketing tag -- there is
  // no statistically-defensible "most common" default the way Material's "Cotton" fallback is
  // (manufacturing origin varies enormously per brand/era with no useful prior, and a wrong customs
  // declaration is a real accuracy/compliance problem, not just a UX one). FindA.Sale's Item model
  // has no country-of-origin field today (confirmed against schema.prisma -- zero matches). This
  // function is written to actually fill the field the moment real per-item data exists (checks a
  // couple of plausible future field names defensively) -- it is NOT hardcoded to skip forever, only
  // to skip honestly when there is genuinely nothing to fill it with, exactly like this file's
  // existing Measurements policy.
  function fillCountryOfOrigin(item) {
    const value = item.countryOfOrigin || item.madeInCountry || item.originCountry || null;
    if (!value) return 'no_data';
    const el = document.querySelector('input[placeholder="Country name"]') || fieldByLabel('Country name');
    if (!el) return 'field_missing';
    el.focus();
    setNativeValue(el, String(value));
    return 'filled';
  }

  // *** UNVERIFIED -- HIGH PRIORITY to confirm live (see file header). Commonly-cited wording,
  // not confirmed against any primary Grailed source. ***
  // BUG FIX 2026-09-01 (findasale-dev, BUG MODE dispatch -- confirmed-from-code, not a guessed
  // selector): Item.condition is a fixed enum -- schema.prisma:1153, "NEW | USED | REFURBISHED |
  // PARTS_OR_REPAIR" -- not free text. norm() only collapses whitespace (see norm()'s own
  // definition above); it does NOT strip underscores, so the real raw value "PARTS_OR_REPAIR"
  // normalizes to the literal string "parts_or_repair", which contains none of "poor" / "damaged" /
  // "used" / "fair" as a substring ("repair" is not "fair") and matched NONE of the free-text
  // patterns below -- it silently fell through to the 'Gently Used' default, mislabeling a
  // for-parts/broken item as good condition on a real listing. Checked first now, against the
  // literal enum values, before the pre-existing free-text heuristics (kept below, unchanged, as a
  // defensive fallback for any pre-formatted/legacy condition string that isn't the raw enum).
  // Mirrors fas-content.js's own NEW/USED/REFURBISHED/PARTS_OR_REPAIR -> platform-condition map
  // (same schema enum, same worst-to-best 4-tier shape: PARTS_OR_REPAIR is that platform's worst
  // tier too) for consistency across this extension's platform files.
  function mapGrailedCondition(condition) {
    const c = norm(condition);
    if (!c) return 'Gently Used';
    switch (c) {
      case 'new': return 'New/Never Worn';
      case 'refurbished': return 'Gently Used';
      case 'used': return 'Used';
      case 'parts_or_repair': return 'Very Worn';
    }
    if (/^new$|brand new|nwt|never worn|new,/.test(c)) return 'New/Never Worn';
    if (/very worn|poor|heavily used|damaged|parts.or.repair|for parts|not working/.test(c)) return 'Very Worn';
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


  // BUG FIX 2026-08-24 (Patrick-directed, live-screenshot-reported on fas-vinted.js -- applied here
  // too for consistency, same underlying UX gap on this platform's manual-review path): scrolls
  // Grailed's real "List item" button into view the moment the review overlay appears, so the one
  // action the organizer must take by hand (when auto-publish is off, or the Designer field wasn't
  // confirmed) is actually visible instead of buried below the fold. Reuses the same button finder
  // findGrailedPublishButton() already used by the auto-publish path -- one definition, two callers.
  function scrollToGrailedPublishButton() {
    const btn = findGrailedPublishButton();
    if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function showReviewOverlay(item, index, total, photosOk, intlShipping, designerUnconfirmed, countryOriginStatus, publishBlocked) {
    const more = (index + 1) < total;
    scrollToGrailedPublishButton();
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
    // BUG FIX 2026-08-21 (S-EXT-BATCH, P1): honest, specific line for Country of Origin -- see
    // fillCountryOfOrigin's own comment for why this is never auto-filled with a guess today.
    let countryLine = '';
    if (countryOriginStatus === 'no_data') {
      countryLine = '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Country of Origin was left blank -- FindA.Sale doesn\'t track where this item was made yet, and this extension won\'t guess a customs claim. Add it yourself if you know it.</div>';
    } else if (countryOriginStatus === 'field_missing') {
      countryLine = '<div style="color:#ffcf7a;margin-top:6px;font-size:12px">Country of Origin field not found (UNVERIFIED selector) -- set it manually before publishing.</div>';
    }
    overlay('<b>FindA.Sale</b><div style="margin-top:6px">Filled <b>' + escapeHtml(item.title) + '</b> as best we could.</div>' +
      // BUG FIX 2026-09-01 (findasale-dev, BUG MODE dispatch): dropped the stale "Market tier"
      // mention -- that concept was removed from this file on 2026-08-19 (S-EXT-BATCH-2, see
      // pickCategory's own comment above) once live DOM evidence confirmed Grailed's real form has
      // no separate Market-tier field at all; this overlay text was never updated to match and was
      // telling the organizer to double-check a field that doesn't exist on the page they're
      // looking at. Added "style" instead -- Style is a real field this file fills with a heuristic
      // guess (see inferGrailedStyle's own comment), so it belongs in this same "please double
      // check" list.
      '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Review every field &mdash; category/style/size/condition are all UNVERIFIED guesses (condition especially, see the code comment). ' +
      '<b>Measurements were left blank</b> &mdash; Grailed listings perform much better with them, add them yourself before publishing. Then click Grailed\'s own <b>List item</b> yourself.</div>' +
      intlLine +
      countryLine +
      (!photosOk ? '<div style="color:#ffcf7a;margin-top:6px;font-size:12px">Photos may not have attached -- add them on this screen.</div>' : '') +
      (designerUnconfirmed ? '<div style="color:#ffcf7a;margin-top:6px;font-size:12px">Designer was typed in but not confirmed -- click the correct suggestion in that field before publishing.</div>' : '') +
      (publishBlocked && !designerUnconfirmed ? '<div style="color:#ffcf7a;margin-top:6px;font-size:12px">Category, Designer, and/or Size could not be set automatically on this item -- Grailed will block submission until you fill these in yourself. Check for red-bordered required fields before publishing.</div>' : '') +
      button('fas-gr-next', more ? 'I posted — next item &#9654;' : 'I posted — done', true) +
      button('fas-gr-close', 'Close', false) +
      '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');
    const next = document.getElementById('fas-gr-next');
    if (next) next.onclick = async () => {
      try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: item.id, remoteListingId: null, platform: 'GRAILED' }); } catch (e) {}
      try { await chrome.runtime.sendMessage({ type: 'advanceGrailedQueue', itemId: item.id }); } catch (e) {}
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

  // FEATURE 2026-08-22 (S-EXT-AUTOPUBLISH-POLICY): auto-publish support -- see file header.
  // BUG FIX 2026-08-24 round 9 (Patrick: "stop guessing period!!!" -- root-caused with direct live
  // evidence, not another guess): live-confirmed via `Array.from(document.querySelectorAll('button'))`
  // against Patrick's real page that Grailed's actual publish button text is "Publish", not "List
  // item" -- the old selector never matched ANYTHING, so publishBtn was always null and
  // doGrailedAutoPublish() silently fell back to the manual-review overlay on every single run,
  // regardless of whether autoPublish was on or Designer was confirmed. Both of those gates were
  // working correctly the whole time; this was the actual, sole blocker. Matches on exact text
  // "publish" OR "list item" (kept as a fallback in case Grailed's copy differs by category/account
  // state -- never confirmed on more than one real listing this session).
  function findGrailedPublishButton() {
    return qa('button').find((b) => {
      const t = norm(b.textContent);
      return t === 'publish' || t === 'list item';
    });
  }

  // Confirms a real publish by polling for the listing form to disappear -- no live-confirmed
  // success marker exists yet (CODE-ONLY/UNTESTED, file header), same conservative signal
  // fas-craigslist.js/fas-poshmark.js/fas-mercari.js use for their own publish confirmation.
  async function waitForGrailedPublishConfirmation(maxWaitMs) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (!looksLikeListingForm()) return true;
      await sleep(400);
    }
    return false;
  }

  async function doGrailedAutoPublish(item, index, total, photosOk, intlShipping, countryOriginStatus) {
    let publishBtn = findGrailedPublishButton();
    if (!publishBtn) {
      // BUG FIX 2026-08-24 round 9: this fallback used to be completely silent -- no console
      // output at all -- which is exactly why the "Publish" vs "List item" text mismatch went
      // undiagnosed through several rounds of investigating Designer/autoPublish instead. Now
      // loud, so a future selector drift shows up immediately instead of masquerading as a
      // Designer/autoPublish-gate problem again.
      console.warn('[FAS Grailed] Auto-publish is on but the "Publish"/"List item" button could not be found on this page (UNVERIFIED selector) -- falling back to manual review. If Grailed has changed this button\'s label, that selector needs updating.');
      showReviewOverlay(item, index, total, photosOk, intlShipping, false, countryOriginStatus);
      return;
    }
    overlay('<b>FindA.Sale</b> - publishing <b>' + escapeHtml(item.title) + '</b>...');
    await humanPause(500, 900);
    // BUG FIX 2026-08-25 round 15 (Patrick: "figure out exactly how to click that button... stop
    // assuming"). Round 10's single trustedClick()-then-syntheticClick() attempt, with no retry and
    // no per-attempt verification, is the same shape of bug already found and fixed on Designer and
    // Category (both needed a bounded retry loop that actually checks for a real effect before
    // declaring success) -- Publish never got the same treatment. Retries up to 3 times, checking
    // for an observable state change (phone-verification modal appears, OR the listing form itself
    // disappears -- either one proves the click genuinely reached Grailed) before falling through to
    // the next attempt. trustedClick() itself (see its own comment above) now also scrolls the
    // button into view and logs its real failure reason, so if every attempt still fails, the
    // console will show exactly why instead of a silent dead end.
    let publishRegistered = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (!(await trustedClick(publishBtn))) syntheticClick(publishBtn);
      await sleep(900);
      if (looksLikePhoneVerification() || !looksLikeListingForm()) { publishRegistered = true; break; }
      console.warn('[FAS Grailed] Publish click attempt ' + attempt + '/3 produced no observable change (no phone-verification modal, form still present) -- retrying.');
      // Re-find the button fresh each retry -- if Grailed re-rendered anything after the failed
      // attempt, a stale `publishBtn` reference could be pointing at a detached element.
      const freshBtn = findGrailedPublishButton();
      if (freshBtn) publishBtn = freshBtn;
    }
    if (!publishRegistered) {
      overlayWarn('Clicked <b>Publish</b> 3 times but never saw a change on the page (UNVERIFIED -- no phone-verification prompt, no form change) -- please check this listing on Grailed yourself before assuming it posted, and check the browser console for the exact reason each click attempt failed.' + button('fas-gr-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    if (looksLikePhoneVerification()) {
      overlayWarn('Grailed needs you to verify your phone number before it will accept this listing -- this is a one-time Grailed account requirement, not something FindA.Sale can or should do for you. Verify your phone on Grailed, then click <b>Publish</b> yourself for this listing (and future ones should auto-publish normally once this is done).' + button('fas-gr-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    const published = await waitForGrailedPublishConfirmation(6000);
    if (!published) {
      if (looksLikePhoneVerification()) {
        overlayWarn('Grailed needs you to verify your phone number before it will accept this listing -- this is a one-time Grailed account requirement, not something FindA.Sale can or should do for you. Verify your phone on Grailed, then click <b>Publish</b> yourself for this listing.' + button('fas-gr-close', 'Close', false));
        closeBtnHandler();
        return;
      }
      overlayWarn('Clicked <b>List item</b> but couldn\'t confirm it went through (UNVERIFIED selector/confirmation signal) -- please check this listing on Grailed yourself before assuming it posted.' + button('fas-gr-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: item.id, remoteListingId: null, platform: 'GRAILED' }); } catch (e) {}
    try { await chrome.runtime.sendMessage({ type: 'advanceGrailedQueue', itemId: item.id }); } catch (e) {}
    const more = (index + 1) < total;
    // BUG FIX 2026-08-28 (S-EXT-AUTOPUBLISH-STALL-FLEET, same root cause as fas-poshmark.js's and
    // fas-mercari.js's identical fixes shipped same session): auto-publish must not wait on a
    // manual click to continue. Uses reopenGrailedTab (NOT location.href) -- see background.js's
    // handler comment for why an in-page reassignment doesn't reliably reset Grailed's SPA state.
    if (more) {
      overlay('<b>FindA.Sale</b><div style="margin-top:6px">Published <b>' + escapeHtml(item.title) + '</b>.</div>' +
        '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Auto-publish is on -- moving to the next item...</div>' +
        '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');
      await humanPause(600, 1200);
      try { await chrome.runtime.sendMessage({ type: 'reopenGrailedTab' }); } catch (e) {}
      return;
    }
    overlay('<b>FindA.Sale</b><div style="margin-top:6px">Published <b>' + escapeHtml(item.title) + '</b>.</div>' +
      button('fas-gr-close', 'Close', false) +
      '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');
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
      try { await chrome.runtime.sendMessage({ type: 'advanceGrailedQueue', itemId: item.id }); } catch (e) {}
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
    // 'Australia / NZ' (spaces around the slash) confirmed live 2026-08-20 as Grailed's actual
    // real label text -- the no-space 'Australia/NZ' variant above never matched it.
    'Australia / NZ', 'Australia & New Zealand', 'Other', 'Rest of World', 'Worldwide',
  ];
  // BUG FIX 2026-08-20 (S-EXT-BATCH round 2, P0, live-Chrome-confirmed): the wait-then-scan fix
  // from round 1 was based on a WRONG diagnosis -- live-confirmed this round that the page was
  // fully loaded (readyState:complete) and fieldByLabel/openerByLabel STILL returned null for
  // every region label, no timing involved at all. Root cause: each region's label (e.g. "Asia")
  // is a bare <p> with no <label> wrapper and no aria-label, and its real checkbox
  // (name="shipping.asia.enabled") sits TWO ancestor <div> levels up, inside a <div> whose own
  // text content includes the multi-line description ("Set a shipping cost and purchase your own
  // label...") -- openerByLabel's <80-char text-length guard rejects that ancestor as a candidate,
  // and fieldByLabel only ever scans real <label> elements. Neither helper's assumptions match
  // this DOM shape at all. Fixed by finding the label text as a plain leaf node directly, then
  // walking up a bounded number of ancestors for the first one containing an
  // input[type="checkbox"] -- confirmed live this finds shipping.asia.enabled etc. correctly.
  function findRegionToggle(labelText) {
    const want = norm(labelText);
    const leaf = qa('*').find((el) => el.children.length === 0 && norm(el.textContent) === want && el.offsetParent !== null);
    if (!leaf) return null;
    let node = leaf;
    for (let i = 0; i < 5 && node; i++) {
      const cb = node.querySelector && node.querySelector('input[type="checkbox"]');
      if (cb) return cb;
      node = node.parentElement;
    }
    return null;
  }
  async function disableInternationalShipping() {
    let anyFound = false;
    let anyDisabled = false;
    let anyConfirmedOff = true;
    for (const label of INTERNATIONAL_REGION_LABELS) {
      const toggle = findRegionToggle(label);
      if (!toggle) continue;
      anyFound = true;
      const readOn = () => toggle.checked;
      if (!readOn()) continue; // already off -- nothing to do
      toggle.click(); // real click, so it fires whatever change handler Grailed's own form expects
      anyDisabled = true;
      await sleep(200);
      // Confirm the click actually flipped state -- re-query fresh, retry once before giving up.
      const toggleFresh = findRegionToggle(label) || toggle;
      if (toggleFresh.checked) {
        toggleFresh.click();
        await sleep(200);
        const toggleFresh2 = findRegionToggle(label) || toggleFresh;
        if (toggleFresh2.checked) anyConfirmedOff = false;
      }
    }
    if (!anyFound) {
      console.warn('[FAS Grailed] International shipping-regions section not found (UNVERIFIED selector) -- if this listing defaults to international shipping at Grailed\'s own placeholder rate, disable it manually before publishing.');
    } else if (anyDisabled && !anyConfirmedOff) {
      console.warn('[FAS Grailed] International shipping toggles were clicked but at least one did not confirm as OFF -- check the shipping section before publishing; it may still default to a $50/region charge.');
    }
    return { anyFound, anyDisabled, anyConfirmedOff };
  }

  // BUG FIX 2026-08-20 (S-EXT-BATCH, P0, Patrick-directed): computes a real Smart Pricing floor
  // price instead of leaving Grailed's own Floor Price field blank. Prefers the organizer's own
  // configured item-level minimum (item.bestOfferMinimumAmt, dollars) exactly like Facebook's
  // Best Offer minimum already does (fas-content.js ~line 524); when that's not set, falls back
  // to the organizer's own defaultBestOfferDeclinePct (schema.prisma default 25 -- "accept offers
  // down to X% off") applied against this item's price, same business meaning as "the lowest
  // price this organizer would actually accept". Clamped to a sane range: never below $1, never
  // at or above the listing price itself (Grailed's own field would reject a floor >= price).
  async function fillSmartPricingFloor(item) {
    if (item.price == null || !isFinite(Number(item.price))) return false;
    const price = Number(item.price);
    let floor;
    // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH-5, P0, DB-confirmed, mirrored here for consistency
    // with fas-mercari.js's identical fix): Round 4's priority order put item.bestOfferMinimumAmt
    // FIRST on the assumption it was "a deliberate, explicit per-item override" -- that assumption
    // was wrong and never verified against real data. A live DB query on the actual test item
    // (Bored Ape Yacht Club Adidas Tracksuit) showed bestOfferMinimumAmt ($168.74) and
    // bestOfferAutoAcceptAmt ($202.49) were BOTH set, and
    // packages/frontend/pages/organizer/edit-item/[id].tsx confirms why: that page's save handler
    // computes BOTH fields together from two percentage inputs on the same form -- they are sibling
    // outputs of one save action, not independent "override vs default" signals, so
    // bestOfferMinimumAmt was essentially ALWAYS present whenever bestOfferAutoAcceptAmt was,
    // permanently shadowing Patrick's explicit instruction ("Auto Accept amount should be the
    // default"). bestOfferAutoAcceptAmt now checked first, as directed. bestOfferMinimumAmt kept
    // as the next fallback (not removed) because packages/frontend/components/PostSaleEbayPanel.tsx
    // CAN set it independently, so it's still a real signal when it's the only one present.
    if (item.bestOfferAutoAcceptAmt != null && isFinite(Number(item.bestOfferAutoAcceptAmt))) {
      floor = Number(item.bestOfferAutoAcceptAmt);
    } else if (item.bestOfferMinimumAmt != null && isFinite(Number(item.bestOfferMinimumAmt))) {
      floor = Number(item.bestOfferMinimumAmt);
    } else {
      const declinePct = (item.defaultBestOfferDeclinePct != null && isFinite(Number(item.defaultBestOfferDeclinePct)))
        ? Number(item.defaultBestOfferDeclinePct) : 25; // schema.prisma's own suggested default
      floor = price * (1 - declinePct / 100);
    }
    floor = Math.max(1, Math.min(floor, price - 0.01));
    // BUG FIX 2026-08-20 (S-EXT-BATCH round 2, P0, live-Chrome-confirmed): live-confirmed this
    // filled as "16874" for a real $225 item with a computed $168.74 floor -- Grailed's Floor
    // Price input re-interprets whatever digits are typed as a raw digit stream (the same behavior
    // the working Price field already avoids by only ever sending whole-dollar strings, confirmed
    // by reading fillListing()'s own Price call a few lines below: String(Math.round(Number(v)))),
    // so a decimal point in the typed string gets silently stripped and the digits are reflowed
    // as if $1.6874 had somehow become $16,874 cents-first. Rounding to a WHOLE DOLLAR before
    // filling -- mirroring the exact pattern already proven safe on the Price field -- avoids this
    // entirely. Floor prices don't need cent precision anyway.
    floor = Math.round(floor);
    const el = document.querySelector('input[name="smartPricing.minimumPrice"]')
      || document.querySelector('input[placeholder="Floor Price (USD)"]')
      || fieldByLabel('Floor Price');
    if (!el) {
      console.warn('[FAS Grailed] Smart Pricing floor price field not found (UNVERIFIED selector) -- if Smart Pricing is on, set a floor price manually before publishing.');
      return false;
    }
    el.focus();
    setNativeValue(el, String(floor));
    await sleep(150);
    return true;
  }

  async function fillListing(item) {
    overlay('<b>FindA.Sale</b> - filling the Grailed listing form...');
    // BUG FIX 2026-08-19 (S-EXT-BATCH-2, P1): live-confirmed real field label is "Item Name", not
    // "Title" -- fieldByLabel('Title') alone matched nothing on Patrick's real test. Tries both;
    // "Title" first in case a different Grailed page variant still uses it, "Item Name" as the
    // confirmed real fallback.
    // BUG FIX 2026-08-20 (S-EXT-BATCH-8, P0, live-Chrome-confirmed via Patrick's real re-test after
    // a genuine extension reload -- this is the actual reason Item Name has NEVER filled on Grailed,
    // across every round since it was first "fixed"): `fillText(...) || fillText(...)` looks like a
    // normal boolean fallback, but fillText is `async` -- calling it returns a PROMISE, and a Promise
    // object is always truthy regardless of what it eventually resolves to. `||` short-circuits on
    // that truthy Promise and NEVER calls the second fillText at all. Since 'Title' genuinely doesn't
    // exist as a label on Grailed's real form (only 'Item Name' does), this meant tryFill's fillFn
    // always resolved to `false` and Item Name was silently skipped every single time. Fixed by
    // actually awaiting each attempt before falling back.
    // BUG FIX 2026-08-20 (S-EXT-BATCH, P0): pass the value through truncateGrailedTitle so
    // Grailed's 60-char cap is respected -- see the helper's own comment for the live-confirmed
    // root cause. tryFill's fillFn receives the ALREADY-truncated value (v below), so fillText
    // never sees the raw over-length title at all.
    await tryFill('Title', truncateGrailedTitle(item.title), async (v) => (await fillText('Title', v)) || (await fillText('Item Name', v)));
    await tryFill('Description', item.description, (v) => fillText('Description', v));
    // pickMarketTier() call removed (BUG FIX 2026-08-19, S-EXT-BATCH-2) -- see pickCategory's own
    // comment above; there is no separate Market-tier field on the real form to fill.
    // Category is now picked BEFORE fillDesigner() in run() -- see BUG FIX 2026-08-19
    // (S-EXT-BATCH-7) comment there. Not called again here to avoid double-clicking the
    // picker a second time.
    // 2026-08-18: color/size now exist on Item and flow through getExtensionItems ->
    // popup.js's queue map. tryFill's own guard still skips silently on unset items.
    // BUG FIX 2026-08-19 (S-EXT-BATCH-2, P1): Color and Condition are both real dropdowns
    // ("Select a Color" / "Item Condition") -- routed through fillSelectLike instead of fillText,
    // which was typing free text into a picker that can't accept it.
    await tryFill('Color', item.color, (v) => fillSelectLike('Color', GRAILED_COLOR_SYNONYMS[norm(v)] || v));
    await tryFill('Size', item.size, (v) => fillSize(v));
    // Measurements deliberately NEVER filled -- see file header. No call to any measurements
    // field exists in this function on purpose.
    const conditionLabel = mapGrailedCondition(item.condition);
    await tryFill('Condition', conditionLabel, (v) => fillSelectLike('Condition', v));
    // BUG FIX 2026-08-21 (S-EXT-BATCH, P1): Style -- see inferGrailedStyle's own comment for the
    // real brand/keyword signals used and why an unmatched item still gets Grailed's own "None"
    // rather than being left unset.
    await tryFill('Style', inferGrailedStyle(item), (v) => fillSelectLike('Style', v));
    // Country of Origin -- see fillCountryOfOrigin's own comment for why this deliberately does NOT
    // fabricate a value the way Style's "None" fallback does; countryOriginStatus is threaded to
    // showReviewOverlay so the organizer sees an honest, specific reason (not a generic skip notice)
    // when there's genuinely no source data for it yet.
    const countryOriginStatus = fillCountryOfOrigin(item);
    if (item.price != null && isFinite(Number(item.price))) {
      await tryFill('Price', item.price, (v) => fillText('Price', String(Math.max(1, Math.round(Number(v))))));
    }
    // Offers (negotiation) toggle deliberately left at Grailed's own default -- never touched.
    // BUG FIX 2026-08-20 (S-EXT-BATCH, P0, Patrick-directed): Grailed defaults Smart Pricing ON
    // for every new listing (confirmed live: smartPricing.enabled checkbox checked:true) with its
    // Floor Price field left blank -- this extension never touched either. Patrick's explicit
    // direction: source the floor price the same real way Facebook's Best Offer minimum already
    // is (fas-content.js's Offer-minimum logic), not a blank field or a silently-disabled toggle.
    // Never disables Smart Pricing here -- that's Grailed's own default and not this extension's
    // call to override; it only ensures a real number backs it when it's on.
    await fillSmartPricingFloor(item);
    const intlShipping = await disableInternationalShipping();
    await humanPause(400, 800);
    const photosOk = await injectPhotos(item.photoUrls);
    return { photosOk, intlShipping, countryOriginStatus };
  }

  async function run(item, index, total, autoPublish) {
    // BUG FIX 2026-08-19 (S-EXT-BATCH-5, P0): was two separate immediate checks (interstitial,
    // then listing-form) -- see waitForFormReady()'s comment (fas-mercari.js) for the live-
    // confirmed SPA-hydration race this pattern is vulnerable to on every one of these 4 files.
    // Merged into a single poll: waits for either signal to become true instead of judging the
    // page's state from a single snapshot taken right as the content script loads.
    const formState = await waitForFormReady(8000);
    if (formState === 'interstitial') {
      overlayWarn('Grailed is showing a verification/security screen. FindA.Sale never attempts to solve this -- please complete it yourself, then reopen the extension to continue.' + button('fas-gr-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    if (formState === 'timeout') {
      overlayWarn('This doesn\'t look like a fillable Grailed listing form yet (checked repeatedly for several seconds). If you\'re on the right page, this is an UNVERIFIED-selector miss -- please fill it in yourself.' + button('fas-gr-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    // BUG FIX 2026-08-19 (S-EXT-BATCH-7, P0, live-Chrome-confirmed): Category MUST run before
    // Designer -- the real Designer input (<input id="designer-autocomplete">) is DISABLED until
    // Category resolves (live-confirmed: disabled=true pre-Category, disabled=false with
    // placeholder changing to "Search and add a Designer" immediately after Category is set).
    // Previously Designer ran first every time, guaranteeing it always hit a disabled field.
    // BUG FIX 2026-08-25 round 12 (Patrick-confirmed live, screenshot showing red required-field
    // borders on Category/Sub-category/Designer/Size all still blank): direct evidence that
    // auto-publish was firing even when Category never matched at all (this run's department
    // fallback tried "Womenswear" and found zero category match there -- confirmed via
    // "override-check: pickedAny=false" in the console), which left Designer disabled and Size
    // unfillable too -- yet the OLD gate below only ever checked designerUnconfirmed (set solely by
    // the 'typed_unconfirmed' Designer outcome), never noticing Category/Designer/Size were
    // completely empty. That's a real, separate bug from the phone-verification finding earlier --
    // Grailed's own client-side required-field validation (the red borders) was blocking the actual
    // click's submission, and the extension had no idea, so it reported the same generic "couldn't
    // confirm" message either way. `publishBlocked` now tracks EVERY known reason auto-publish would
    // be unsafe (Category no-match, Designer field_missing, Designer typed-unconfirmed, no brand
    // data at all) so run() can gate on the real picture instead of Designer's one specific outcome.
    let publishBlocked = false;
    if (item.category) {
      // S-EXT-BATCH-12: pass categoryBreadcrumb alongside the clean category -- Grailed is the
      // only one of the four platforms with its own gender-level Department field, and that
      // signal ("men"/"women") only survives in the original breadcrumb, not in the clean leaf
      // name alone (see pickCategory's own comment above for the full explanation).
      const categoryOk = await pickCategory(item.category, item.categoryBreadcrumb);
      if (!categoryOk) {
        publishBlocked = true;
        console.warn('[FAS Grailed] Category "' + item.category + '" -- no match found in the picker; Designer field may remain disabled as a result.');
      }
    } else {
      publishBlocked = true;
      console.warn('[FAS Grailed] No category on this item -- Category picker skipped, which will likely leave the Designer field disabled too.');
    }
    // Designer is a hard gate for this platform: a genuine no-match means Grailed's own form
    // can't be submitted anyway (curated list, no free text), so this stops BEFORE filling
    // anything else rather than leaving a half-filled, unsubmittable listing behind.
    let designerUnconfirmed = false;
    if (item.brand) {
      const designerResult = await fillDesigner(item.brand);
      // BUG FIX 2026-08-19 (S-EXT-BATCH-7 follow-up): fillDesigner no longer returns 'no_match' --
      // see its own comment. 'typed_unconfirmed' means the text landed in the real field but the
      // suggestion click couldn't be confirmed; this is a soft flag surfaced on the review overlay
      // below, not a hard stop that blocks the rest of the form.
      if (designerResult === 'typed_unconfirmed') {
        designerUnconfirmed = true;
        publishBlocked = true;
        console.warn('[FAS Grailed] Designer "' + item.brand + '" was typed into the field but the suggestion list could not be confirmed -- click the correct suggestion yourself before publishing.');
      }
      if (designerResult === 'field_missing') {
        publishBlocked = true;
        console.warn('[FAS Grailed] Designer field not found (UNVERIFIED selector) -- continuing to fill the rest of the form, but Grailed will likely block submission without a Designer set.');
      }
    } else {
      // brand now exists on Item (2026-08-18) but is still commonly unset -- this branch
      // fires for any genuinely brand-less item, not just a structural gap. Blocks auto-publish
      // now (previously did not) -- Grailed generally requires a Designer, so auto-clicking
      // Publish on a brand-less item is exactly the same unsafe bet as the Category-miss case
      // above, not a safe default.
      publishBlocked = true;
      console.warn('[FAS Grailed] No brand/designer data on this item -- Grailed generally requires a Designer to be set; the organizer will need to pick one manually.');
    }
    const fillResult = await fillListing(item);
    if (looksLikeInterstitial()) {
      overlayWarn('Grailed is showing a verification/security screen partway through filling this listing. Please complete it yourself, then finish this listing manually -- nothing further was auto-filled.' + button('fas-gr-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    // BUG FIX 2026-08-25 round 12: gate now checks publishBlocked (Category no-match, Designer
    // field_missing, Designer typed-unconfirmed, or no brand data at all) instead of only
    // designerUnconfirmed -- see the block above for the full incident writeup. Live-confirmed
    // this was firing auto-publish on a completely blank Category/Designer/Size form before this
    // fix (Grailed's own required-field validation then blocked the real click's submission with
    // no diagnostic signal to the organizer).
    if (autoPublish && !publishBlocked) {
      await doGrailedAutoPublish(item, index, total, fillResult.photosOk, fillResult.intlShipping, fillResult.countryOriginStatus);
      return;
    }
    showReviewOverlay(item, index, total, fillResult.photosOk, fillResult.intlShipping, designerUnconfirmed, fillResult.countryOriginStatus, publishBlocked);
  }

  async function start() {
    await sleep(600);
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getGrailedQueueItem' }); } catch (e) { return; }
    if (!queued || !queued.ok || !queued.item) return; // nothing queued -- stay silent

    // SAFETY GATE 2026-09-03 -- fashion-only allowlist check, run as early as possible: right after
    // we know a real queued item exists, before the duplicate-listing-guard check and before any
    // DOM interaction (run()/fillListing() never gets called for a non-match). See
    // grailedFashionMismatchReason's own comment above for the allowlist (not blocklist) polarity.
    const grReason = grailedFashionMismatchReason(queued.item.category, queued.item.title);
    if (grReason) {
      console.warn('[FAS Grailed] skipping listing (fashion-only allowlist):', queued.item.id, queued.item.title, grReason);
      overlay('<b>FindA.Sale</b><div style="color:#ffcf7a;margin-top:6px;font-size:12px">Skipped <b>' + escapeHtml(queued.item.title || 'this item') + '</b> -- ' + escapeHtml(grReason) + '</div>');
      await humanPause(1200, 1800);
      // Never marks the item listed -- it genuinely was not posted, so it stays available for
      // other marketplaces. Just advances the local queue, same mechanism used everywhere else in
      // this file for a skip (see showDesignerNotFoundOverlay above).
      try { await chrome.runtime.sendMessage({ type: 'advanceGrailedQueue', itemId: queued.item.id }); } catch (e) {}
      let next = null;
      try { next = await chrome.runtime.sendMessage({ type: 'getGrailedQueueItem' }); } catch (e) {}
      if (next && next.ok && next.item) {
        // Fresh tab via background.js, not location.href -- see reopenGrailedTab's other call
        // sites in this file for why an in-page reassignment doesn't reliably reset Grailed's SPA.
        try { await chrome.runtime.sendMessage({ type: 'reopenGrailedTab' }); } catch (e) {}
      } else {
        overlay('<b>FindA.Sale</b> — all done. Happy selling!');
        setTimeout(() => bar && bar.remove(), 4000);
      }
      return;
    }

    // FEATURE 2026-08-22 (S-EXT-DUPLICATE-LISTING-GUARD) -- see fas-poshmark.js's start() for the
    // full incident writeup (a resumed Poshmark queue entry produced a real duplicate live
    // listing this session). Applied here for consistency across all auto-publish-capable
    // platforms. Best-effort: falls through to the normal flow if the check itself fails.
    try {
      const statusRes = await chrome.runtime.sendMessage({ type: 'checkItemListedStatus', itemId: queued.item.id, platform: 'GRAILED' });
      if (statusRes && statusRes.ok && statusRes.listed) {
        const more = (queued.index + 1) < queued.total;
        try { await chrome.runtime.sendMessage({ type: 'advanceGrailedQueue', itemId: queued.item.id }); } catch (e) {}
        // BUG FIX 2026-08-28 (S-EXT-AUTOPUBLISH-STALL-FLEET): same fix as doGrailedAutoPublish
        // above -- auto-publish must not wait on a manual click past a skipped item either.
        if (more && queued.autoPublish !== false) {
          overlay('<b>FindA.Sale</b><div style="margin-top:6px">Skipped <b>' + escapeHtml(queued.item.title) + '</b> -- this already shows as listed on Grailed, so it was not filled or published again (avoiding a duplicate listing).</div>' +
            '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Auto-publish is on -- moving to the next item...</div>');
          await humanPause(600, 1200);
          try { await chrome.runtime.sendMessage({ type: 'reopenGrailedTab' }); } catch (e) {}
          return;
        }
        overlay('<b>FindA.Sale</b><div style="margin-top:6px">Skipped <b>' + escapeHtml(queued.item.title) + '</b> -- this already shows as listed on Grailed, so it was not filled or published again (avoiding a duplicate listing).</div>' +
          (more ? button('fas-gr-next', 'Next item &#9654;', true) : '') +
          button('fas-gr-close', 'Close', false));
        const next = document.getElementById('fas-gr-next');
        if (next) next.onclick = async () => {
          try { await chrome.runtime.sendMessage({ type: 'reopenGrailedTab' }); } catch (e) {}
        };
        closeBtnHandler();
        return;
      }
    } catch (e) { /* best-effort -- fall through to normal fill/publish flow */ }
    try {
      await run(queued.item, queued.index, queued.total, queued.autoPublish !== false);
    } catch (e) {
      overlayWarn('Something went wrong filling this listing (' + escapeHtml((e && e.message) || 'unknown error') + '). Nothing was published -- complete this listing yourself, or reopen the extension to try again.' + button('fas-gr-close', 'Close', false));
      closeBtnHandler();
    }
  }

  // ---- Cross-platform auto-remove-on-sale-elsewhere (S-EXT-CROSS-PLATFORM-AUTOREMOVE, 2026-08-22)
  // Same pattern as fas-poshmark.js's own removal block. Patrick's explicit directive: "it must
  // be built for all of them, that's part of the extension." CODE-ONLY / UNVERIFIED -- no sold
  // Grailed item exists yet to confirm these selectors against.

  function grRemNorm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

  function grRemFindButtonByText(text) {
    const want = grRemNorm(text);
    return qa('button, [role="button"], a').find((el) => grRemNorm(el.textContent) === want && el.offsetParent !== null) || null;
  }

  // BUG FIX 2026-09-04 (S-EXT-REMOVAL-WRONG-TITLE-EL, propagated from the live-confirmed Poshmark
  // fix): document.querySelector('h1, [class*="title" i]') returns the first element matching
  // EITHER half in document order, and site headers carry classes containing "subtitle" -- and
  // "title" is a literal substring of "subtitle". Live-confirmed to return a header nav element
  // reading "My Offers" instead of the listing title, so the detail-page check always failed and
  // the delete was never attempted. Prefer the real <h1>; only fall back to a class-based lookup
  // that explicitly excludes "subtitle".
  function grRemFindListingTitleEl() {
    const h1 = document.querySelector('h1');
    if (h1) return h1;
    return qa('[class*="title" i]').find((el) => !/subtitle/i.test(el.className)) || null;
  }

  // BUG FIX 2026-09-04 (S-EXT-GRAILED-MATCH-BY-CARD, live-confirmed against Patrick's real
  // /sell/for-sale page): the previous version read the TEXT of an a[href*="/listings/"] anchor,
  // but the listing anchor on a real card wraps the thumbnail and its textContent is EMPTY -- so
  // it could never match anything. The title lives on the CARD (class contains
  // "ListingForSaleCard"), whose text is a run-on of status + age + brand + title + price, e.g.
  // "Requires Action11 days agoAdidasmBored Ape Yacht Club Adidas Tracksuit Into the
  // Metaverse$225Edit Listing...". Group anchors by the numeric listing id (/listings/<id>) and
  // match on containment of the FULL stored title -- a prefix-anchored match can never fire given
  // that leading status/brand text. Returns { id, href } so the caller can address the listing by
  // id. Same never-guess discipline as everywhere else: exactly one match or null.
  function findGrailedListingMatchByTitle(title) {
    const want = grRemNorm(title);
    if (!want) return null;
    const byId = new Map();
    qa('a[href*="/listings/"]').forEach((a) => {
      const href = a.getAttribute('href') || a.href || '';
      const m = /\/listings\/(\d+)/.exec(href);
      if (!m) return;
      const id = m[1];
      const card = a.closest('[class*="ListingForSaleCard" i], [class*="listingCard" i]');
      const text = grRemNorm(card ? card.textContent : a.textContent);
      if (!text) return;
      if (!byId.has(id)) byId.set(id, { id, href: a.href, texts: [] });
      byId.get(id).texts.push(text);
    });
    const matches = [];
    byId.forEach((entry) => {
      if (entry.texts.some((t) => t.indexOf(want) !== -1)) matches.push(entry);
    });
    return matches.length === 1 ? matches[0] : null;
  }

  // BUG FIX 2026-09-04 (S-EXT-REMOVAL-FALSE-REMOVED + S-EXT-GRAILED-DELETE-SYNCHRONOUS, propagated
  // from the live-confirmed Poshmark fix). Two defects, both fixed here:
  //   1. It returned `true` the moment a delete BUTTON was found and clicked -- whether or not a
  //      confirmation control ever appeared, and whether or not the listing actually went away. The
  //      caller then reported the item as REMOVED to the FindA.Sale backend, producing a false
  //      "removed" record for a listing still live on Grailed -- the worst possible outcome (the
  //      organizer stops watching it and it can still sell a second time). Now returns 'deleted'
  //      ONLY when a confirmation control was actually found AND clicked; every other exit returns a
  //      specific reason string the caller reports as a retriable attempt-failure, not a removal.
  //   2. It was fully SYNCHRONOUS: it clicked the kebab menu and then looked for the delete item in
  //      the same tick, with zero wait, so on any real page the menu has not rendered yet and this
  //      could never succeed. Now async, with a real settle awaited between each step.
  async function deleteGrailedListingOnDetailPage() {
    const menuBtn = qa('button, [role="button"]').find((el) => {
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      return label.indexOf('more') !== -1 || label.indexOf('option') !== -1 || el.textContent.trim() === '...';
    });
    if (!menuBtn) return 'no_menu_button';
    syntheticClick(menuBtn);
    await sleep(600);
    const deleteBtn = grRemFindButtonByText('Delete listing') || grRemFindButtonByText('Delete') || grRemFindButtonByText('Remove listing');
    if (!deleteBtn) return 'no_delete_action';
    syntheticClick(deleteBtn);
    await sleep(600);
    const confirmBtn = grRemFindButtonByText('Yes') || grRemFindButtonByText('Confirm') || grRemFindButtonByText('Delete');
    if (!confirmBtn) return 'no_confirm_button';
    syntheticClick(confirmBtn);
    await sleep(600);
    return 'deleted';
  }

  // Retained for reference/back-compat only. As of the 2026-09-04 fix below, background.js owns
  // reporting a removal -- it does so on receiving 'crossPlatformRemovalDeleted', which is only ever
  // sent after a CONFIRMED delete. This content script no longer reports removals itself.
  async function reportGrailedRemoved(item) {
    try { await chrome.runtime.sendMessage({ type: 'markItemRemovedByRemoval', itemId: item.id, platform: 'GRAILED' }); } catch (e) {}
  }

  // Deliberately null: where the tab should go next after the queue advances is left to
  // background.js's own configured value, because Grailed's manage URL used here previously
  // ('https://www.grailed.com/sell') is CONFIRMED WRONG -- see the create-form detection in
  // runGrailedRemovalQueue below. Sending a known-bad continueUrl would just re-strand the flow on
  // the create-listing form. (CFG is not injected into this content script's world -- only
  // background.js imports config.js -- so this file cannot read the configured value itself; that
  // was BUG FIX 2026-08-22's ReferenceError.)
  const GRAILED_REMOVAL_CONTINUE_URL = null;

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
  async function runGrailedRemovalQueue(item, index, total) {
    overlay('<b>FindA.Sale</b> \u2014 removing sold item ' + (index + 1) + ' of ' + total + ': <b>' + escapeHtml(item.title) + '</b>\u2026');
    await humanPause(400, 800);
    const pageTitleEl = grRemFindListingTitleEl();
    const onListingDetailPage = pageTitleEl && grRemNorm(pageTitleEl.textContent).indexOf(grRemNorm(item.title)) !== -1;
    if (onListingDetailPage) {
      const result = await deleteGrailedListingOnDetailPage();
      if (result === 'deleted') {
        overlay('<b>FindA.Sale</b><div style="margin-top:6px">Removed <b>' + escapeHtml(item.title) + '</b> from Grailed.</div>');
        try { chrome.runtime.sendMessage({ type: 'crossPlatformRemovalDeleted', platform: 'GRAILED', itemId: item.id, continueUrl: GRAILED_REMOVAL_CONTINUE_URL }); } catch (e) {}
        return;
      }
      overlayWarn('Found the listing but couldn\'t confirm the delete action (' + escapeHtml(result) + ') -- please remove it yourself. FindA.Sale will try this item again rather than marking it removed.' + button('fas-gr-close', 'Close', false));
      try { chrome.runtime.sendMessage({ type: 'crossPlatformRemovalAttemptFailed', platform: 'GRAILED', itemId: item.id, reason: result, continueUrl: GRAILED_REMOVAL_CONTINUE_URL }); } catch (e) {}
      return;
    }
    // LIVE FINDING 2026-09-04 (S-EXT-GRAILED-DELETE-CONTROL-NOT-FOUND): Grailed's delete control
    // was searched for on BOTH https://www.grailed.com/listings/<id>/edit and the listing card on
    // https://www.grailed.com/sell/for-sale, and found on NEITHER. The edit page has zero elements
    // whose text or aria-label matches /delete|remove/i and the word "delete" does not appear
    // anywhere in its body; the card exposes only two anchors (the thumbnail link, whose text is
    // empty, and "Edit Listing") with no kebab or overflow menu. Caveat worth preserving: the one
    // listing available to inspect was in a "Requires Action" moderation state, which may suppress
    // controls a normal listing would show -- so this is "NOT FOUND", not "proven absent". Either
    // way Grailed's delete path is UNCONFIRMED and must not be guessed. This is the remaining
    // blocker for Grailed removal being end-to-end.
    const match = findGrailedListingMatchByTitle(item.title);
    if (!match) {
      // BUG FIX 2026-09-04 (S-EXT-GRAILED-WRONG-PAGE-GUARD-TOO-BROAD): the previous guard tested
      // location.pathname.indexOf('/sell') === 0, which now ALSO matches the CORRECT listings page
      // '/sell/for-sale' -- it would have reported the real listings page as "this is the create
      // form". Detect the create form narrowly instead: exactly '/sell' (live-confirmed to redirect
      // to '/sell/new') or anything under '/sell/new'.
      const path = location.pathname.replace(/\/+$/, '') || '/';
      const onGrailedCreateForm = path === '/sell' || path.indexOf('/sell/new') === 0;
      if (onGrailedCreateForm) {
        overlayWarn('FindA.Sale landed on Grailed\'s create-a-listing form instead of your listings page, so there was nothing to search. Please remove "' + escapeHtml(item.title) + '" from Grailed yourself. This item has NOT been marked removed and will be retried.' + button('fas-gr-close', 'Close', false));
        try { chrome.runtime.sendMessage({ type: 'crossPlatformRemovalAttemptFailed', platform: 'GRAILED', itemId: item.id, reason: 'grailed_on_create_form_not_listings', continueUrl: GRAILED_REMOVAL_CONTINUE_URL }); } catch (e) {}
        return;
      }
      overlayWarn('No confident match for "' + escapeHtml(item.title) + '" in your Grailed listings (zero or more than one found) -- skipped, not guessed.' + button('fas-gr-close', 'Close', false));
      try { chrome.runtime.sendMessage({ type: 'crossPlatformRemovalSkipped', platform: 'GRAILED', itemId: item.id, reason: 'no_confident_listing_match', continueUrl: GRAILED_REMOVAL_CONTINUE_URL }); } catch (e) {}
      return;
    }
    // The listing was matched, but there is no confirmed way to delete it (see the note above), so
    // be honest about it: name the listing, link the organizer straight to it, and say plainly that
    // FindA.Sale has NOT marked it removed. Reported as a RETRIABLE attempt-failure -- never as a
    // removal (that would be a false "removed" on a still-live listing) and never as a skip (that
    // would permanently consume it from the queue). After background.js's 3-attempt cap this
    // surfaces to the organizer as manual review, which is the honest outcome for an unbuilt path.
    overlayWarn('Found <b>' + escapeHtml(item.title) + '</b> in your Grailed listings, but FindA.Sale does not yet have a confirmed way to delete a Grailed listing. Please remove it on Grailed yourself: <a href="' + escapeHtml(match.href) + '" target="_blank" rel="noopener" style="color:#9ad9b0">' + escapeHtml(match.href) + '</a> -- this item has NOT been marked removed on FindA.Sale.' + button('fas-gr-close', 'Close', false));
    try { chrome.runtime.sendMessage({ type: 'crossPlatformRemovalAttemptFailed', platform: 'GRAILED', itemId: item.id, reason: 'grailed_delete_control_unconfirmed', continueUrl: GRAILED_REMOVAL_CONTINUE_URL }); } catch (e) {}
  }

  async function maybeRunGrailedRemoval() {
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getRemovalQueueItemFor', platform: 'GRAILED' }); } catch (e) { return false; }
    if (!queued || !queued.ok || !queued.item) return false;
    await runGrailedRemovalQueue(queued.item, queued.index, queued.total);
    return true;
  }

  (async () => {
    const ranRemoval = await maybeRunGrailedRemoval();
    if (!ranRemoval) start();
  })();
})();
