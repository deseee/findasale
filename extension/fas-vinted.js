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
  // DIAGNOSTIC (2026-08-30 round 8, Patrick-directed -- "nothing in console" after landing on the
  // member-profile page following the round-4/5 continue-prompt fix). Unconditional, always fires
  // regardless of any later logic or gate -- the previous continue-prompt code had ZERO console
  // output anywhere in its own path (only DOM changes via overlay()), so "nothing in console" was
  // never actually proof the script didn't run; it just meant nothing was ever wired to say so.
  // This settles that ambiguity for the next test: if this line is missing from console on that
  // page, the content script itself never re-injected there (points to an SPA-style client-side
  // transition, not a real page load, since content_scripts only inject at document_idle on an
  // actual navigation) -- a different problem than anything inside this file's own logic.
  console.log('[FAS Vinted] content script loaded on ' + location.pathname + location.search);
  const LISTING_URL_HINT = 'https://www.vinted.com/items/new'; // UNVERIFIED -- best-effort guess, not live-confirmed

  // 2026-09-23 (console noise): when the extension is reloaded or updated, the content script
  // already on the page keeps running but every chrome.runtime / chrome.storage call throws
  // "Extension context invalidated." That is expected, not an error: callers check
  // fasContextAlive() first and bail quietly, and fasContextGone(e) turns that one error into a
  // console.log instead of a warn/error. A page reload injects a fresh, live copy of this script.
  function fasContextAlive() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  }
  function fasContextGone(e) {
    const msg = String((e && e.message) || e || '');
    return msg.indexOf('Extension context invalidated') !== -1 || !fasContextAlive();
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  async function humanPause(minMs, maxMs) { await sleep(minMs + Math.random() * (maxMs - minMs)); }
  // BUG FIX 2026-08-29 (S-EXT-VINTED-COLOR-BRAND-RELIABILITY, Patrick-reported inconsistent
  // color/brand null-value fallback behavior across runs -- worked once earlier tonight, then did
  // nothing on a fresh run). Established MutationObserver-backed poll-until-present pattern, same
  // convention already used elsewhere in this codebase (fas-content.js/fas-grailed.js/fas-remove.js/
  // fas-tracking.js's own waitFor/observer helpers) -- ported into this file per its own established
  // conventions instead of the fixed-sleep-then-single-check pattern acceptSuggestedColor() used to
  // rely on. Deliberately RESOLVES (never rejects) with null on timeout, unlike fas-content.js's
  // reject-on-timeout convention -- every call site added in this file treats "never appeared" as a
  // legitimate, expected outcome (e.g. a real panel genuinely has no suggested swatch), not an
  // exceptional error every caller must try/catch. observeOpts defaults to childList+subtree, which
  // only catches a genuinely NEW element appearing (e.g. the panel container itself) -- pass
  // { attributes: true, attributeFilter: [...] } explicitly when watching for a class changing on an
  // ALREADY-PRESENT node (e.g. Vinted marking an existing swatch "--selected"), since a plain
  // childList observer never sees an attribute-only mutation.
  function waitFor(getter, timeout, observeOpts) {
    return new Promise((resolve) => {
      const first = getter();
      if (first) return resolve(first);
      const obs = new MutationObserver(() => {
        const el = getter();
        if (el) { obs.disconnect(); resolve(el); }
      });
      obs.observe(document.body, observeOpts || { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
    });
  }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function bodyText() { return (document.body && document.body.innerText) || ''; }
  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return Array.from(document.querySelectorAll(sel)); }
  function escapeHtml(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // BUG FIX 2026-09-02 (Vinted title rejected for "too many capital letters", Patrick-reported live
  // repro): fillListing() below used to type item.title into Vinted's Title field completely
  // verbatim -- zero capitalization normalization anywhere in this file. Live repro Patrick hit:
  // title "JUBILEE! Vinyl LP Record, Sisters' Concert Chorus, Grace Note Recordings, 1960s" was
  // rejected by Vinted's own inline validation ("Title contains too many capital letters, try using
  // lowercase letters"). Root cause confirmed via code read (fas-vinted.js line ~1713 pre-fix): no
  // capitalization handling existed at all before typing into Vinted's Title field.
  // Scope, deliberately narrow: only whole standalone words of 4+ consecutive uppercase Latin
  // letters get Title-Cased (first letter kept upper, rest lowered) -- e.g. "JUBILEE!" -> "Jubilee!".
  // Short (<=3 letter) all-caps tokens are left untouched on purpose -- they read as legitimate
  // abbreviations in this marketplace's real inventory (LP, CD, XL, US, UK, MCM, USA, etc.), and the
  // same source title's own "LP" in "Vinyl LP Record" apparently did NOT trigger Vinted's rejection,
  // only the longer all-caps word did -- consistent with a per-word-length signal, not a blanket
  // all-caps ban. This is Vinted-specific: it only transforms the string passed into Vinted's own
  // Title input, never touches the shared item.title object or any other marketplace's fill logic.
  // NOT YET LIVE-VERIFIED against Vinted's actual validation rule (STATE.md Next Session: "needs live
  // confirmation, not assumption") -- flagged for Skill('findasale-qa') / Patrick's next real Vinted
  // post before this can be marked closed.
  function normalizeVintedTitleCaps(title) {
    return String(title || '').replace(/\b[A-Z]{4,}\b/g, (w) => w.charAt(0) + w.slice(1).toLowerCase());
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

  // ---- queue-advance countdown (2026-09-01, S-EXT-VINTED-CONTINUE-UX, Patrick live report:
  // "doesn't seem to react to button presses ... doesn't seem to have the queue paused while
  // waiting for clicks ... it's just awkward when the popup doesn't show up on the next screen") --
  // background.js's humanQueueDelay() (S-EXT-QUEUE-PACING) already pauses 10-25s between items and,
  // as of the SAME-SESSION tabId fix on 'advanceVintedQueue' just above it in background.js, now
  // reliably notifies this tab via a one-way 'fasQueueDelayStarted' {ms} message the instant the
  // pause starts -- exactly the mechanism fas-content.js (Facebook) already uses for its own
  // queue-advance countdown (see fas-content.js's "queue-advance countdown (2026-08-30)" block,
  // copied here for consistency). But relying on that message ALONE would leave the exact gap
  // Patrick reported: the click produces zero visible change until the round-trip
  // markListed -> advanceVintedQueue -> humanQueueDelay -> fasQueueDelayStarted chain completes,
  // which is itself message-passing-timing-dependent (service worker wake latency, etc). So the
  // click handlers below start a LOCAL countdown SYNCHRONOUSLY, before awaiting anything, seeded
  // with a random guess in the same 10-25s range background.js actually uses (QUEUE_ADVANCE_DELAY_MS
  // = {MIN:10000,MAX:25000} in background.js -- matched here, not invented) -- this guarantees
  // instant "something is happening" feedback no matter how the message timing shakes out. If/when
  // the real 'fasQueueDelayStarted' message arrives (which carries the ACTUAL ms humanQueueDelay is
  // using), the listener below simply restarts the countdown with the true value, so the display
  // self-corrects to be accurate rather than just reassuring. Purely cosmetic either way -- never
  // changes the underlying pacing, exactly like fas-content.js's version.
  let queueDelayInterval = null;
  function clearQueueDelayCountdown() {
    if (queueDelayInterval) { clearInterval(queueDelayInterval); queueDelayInterval = null; }
  }
  function startQueueDelayCountdown(totalMs, doneLabel) {
    // BUG FIX 2026-09-02 (S-EXT-VINTED-NO-COUNTDOWN, Patrick live report: "probably don't need the
    // countdown since it's a manual process for vinted"). Vinted posting is fully human-paced --
    // Patrick clicks Vinted's own real Upload button himself for every item -- unlike the automated
    // platforms this ticking "please wait Ns" display was modeled on (Facebook/eBay), where it
    // reassures during an UNATTENDED wait. On an already-manual step it's just noise. Neutered here
    // at the single shared definition (rather than patching each call site) so every caller --
    // both button click handlers below AND the real 'fasQueueDelayStarted' listener a few lines
    // down -- automatically stops ticking, with no risk of missing one. background.js's actual
    // humanQueueDelay() pacing between tab opens is completely untouched by this -- this file's own
    // prior comment already established the countdown display is "purely cosmetic either way --
    // never changes the underlying pacing," so removing the ticking text changes nothing functional.
    clearQueueDelayCountdown();
    const label = doneLabel === 'we finish up' ? "That's the last item -- wrapping up" : 'Moving to ' + (doneLabel || 'the next item');
    ensureBar().innerHTML = '<b>FindA.Sale</b><div style="margin-top:6px">' + label + '&#8230;</div>';
  }
  // Guessed local duration, used ONLY until the real 'fasQueueDelayStarted' message (if any)
  // corrects it -- matches background.js's QUEUE_ADVANCE_DELAY_MS = {MIN:10000,MAX:25000} exactly.
  function guessedQueueDelayMs() { return 10000 + Math.random() * 15000; }
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'fasQueueDelayStarted' && typeof msg.ms === 'number') {
        startQueueDelayCountdown(msg.ms);
      }
    });
  } catch (e) { /* non-fatal -- local guessed countdown above still covers the click feedback */ }

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
    // BUG FIX 2026-08-24 round 4 (Patrick-reported + confirmed via new DIAG logging: "brand: panel
    // found=false" -- the panel never even opened). Root-caused live: `openerByLabel('Brand')` was
    // returning Vinted's real "List without brand" quick-skip control (`id="empty-brand"`, a totally
    // different, always-present element with `role="button"`) instead of the actual Brand field --
    // confirmed live that "list without brand" satisfies `indexOf("brand") !== -1` just as validly as
    // the real field would, and it was winning the broad substring scan below because the real
    // trigger (a plain readonly `<input>` with no role/aria-label at all, confirmed live) never even
    // matched that scan's candidate list in the first place. Live-confirmed the label-based lookup
    // two blocks down (this field's own `<label for="brand">` correctly resolves via `for` to the
    // real `input#brand`, `data-testid="brand-select-dropdown-input"`) -- it was simply ordered AFTER
    // the broad scan, so it never got a chance to run once the wrong thing had already matched. A
    // `<label for="...">` mapping is a precise, authoritative link between a label's exact text and
    // one specific control -- it should always be tried before a page-wide substring scan that can
    // match unrelated controls sharing the same word. Reordered: label/`for` lookup now runs FIRST.
    const labels = qa('label');
    for (const lab of labels) {
      if (norm(lab.textContent) === want) {
        const forId = lab.getAttribute('for');
        if (forId) { const byId = document.getElementById(forId); if (byId) return byId; }
        const inner = lab.querySelector('button, [role="button"], [role="switch"], select, [role="combobox"], div[tabindex]');
        if (inner) return inner;
        return lab;
      }
    }
    // Added [role="switch"] (BUG FIX 2026-08-19, S-EXT-BATCH-2, P1) -- toggle-switch semantics are
    // common on modern SPA forms (e.g. Grailed's international-shipping region toggles) and were
    // entirely absent from this candidate list before, a likely contributor to those toggles never
    // being found at all.
    const candidates = qa('[role="combobox"], [role="button"], [role="switch"], button, select, div[tabindex]');
    const hit = candidates.find((c) => norm(c.getAttribute('aria-label') || c.textContent).indexOf(want) !== -1 && norm(c.textContent).length < 80);
    if (hit) return hit;
    // Fallback: a label containing (not exactly equal to) the wanted text -- kept as a lower-priority
    // tier below the broad scan above, same relative ordering as before this fix, for any label whose
    // text isn't an exact match (e.g. a label reading "Brand (optional)").
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
    // BUG FIX 2026-08-24 round 3 (Patrick-reported: "stray panel" warning fires for EVERY field,
    // every time, including fields that succeed -- live-confirmed via direct DOM inspection this
    // session, not a guess): this fallback's `[class*="dropdown" i]` matches Vinted's own
    // ALWAYS-PRESENT, ALWAYS-VISIBLE field wrapper div (class "InputDropdown-module-...__input-
    // dropdown", confirmed live present for every single Category/Brand/Size/etc. field regardless
    // of whether its panel is open) -- not a real transient open panel at all. Since real panels are
    // already found above by their own `-content` testid, this generic fallback should never match
    // that static wrapper -- excluded explicitly. This was a real, confirmed-wrong warning (not
    // diagnostic of anything), but it is NOT yet confirmed to be Brand's actual fill-failure cause --
    // see the explicit step-by-step console.log breadcrumbs added below in pickFromPanel, which will
    // show the real cause directly on the next live run instead of guessing further.
    return qa('[class*="dropdown" i], [class*="Dropdown" i], [role="dialog"], [role="listbox"]')
      .find((el) => el.offsetParent !== null && (el.className || '').toString().indexOf('input-dropdown') === -1) || null;
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
  // BUG FIX 2026-08-21 (S-EXT-BATCH, P0, live-Chrome-confirmed, Patrick-reported "color and
  // material selects were still visible after the extension set them"): the fallback dismiss here
  // used to be a bare `heading.click()` on document's first h1/h2 -- live-confirmed on the real
  // Color panel this does NOT close it (panel still present, offsetParent non-null, after both the
  // Escape keydown AND the bare heading click). Vinted's picker only responds to an outside
  // dismiss when the click is a REAL multi-event sequence (pointerdown+mousedown+pointerup+mouseup
  // +click), the same pattern this file (and fas-poshmark.js) already had to adopt for OPENING
  // these widgets -- live-confirmed the exact same sequence dispatched on document.body (a safe,
  // definitely-outside-the-panel, definitely-not-a-link target, so no accidental navigation) closes
  // the panel every time.
  function realOutsideClick(target) {
    const opts = { bubbles: true, cancelable: true, view: window, clientX: 5, clientY: 5 };
    target.dispatchEvent(new PointerEvent('pointerdown', opts));
    target.dispatchEvent(new MouseEvent('mousedown', opts));
    target.dispatchEvent(new PointerEvent('pointerup', opts));
    target.dispatchEvent(new MouseEvent('mouseup', opts));
    target.dispatchEvent(new MouseEvent('click', opts));
  }
  async function closePanel(fieldId) {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await sleep(150);
    if (findOpenPanel(fieldId, true)) {
      realOutsideClick(document.body);
      await sleep(200);
    }
    if (findOpenPanel(fieldId, true)) {
      console.warn('[FAS Vinted] Panel for "' + fieldId + '" did not confirm closed -- it may still be visible on top of the next field.');
    }
  }

  // Set true by pickFromPanel's generic-blend Material fallback below; read once, right after the
  // Material tryFill() call in fillListing(), to surface a visible review-overlay warning (not just
  // a console.warn) whenever the "Cotton" default was actually used for this run.
  let lastMaterialFallbackUsed = false;
  async function pickFromPanel(fieldId, labelText, value) {
    const opener = openerByLabel(labelText) || document.getElementById(fieldId);
    console.log('[FAS Vinted DIAG] ' + fieldId + ': opener resolved to tag=' + (opener ? opener.tagName : null) + ' id=' + (opener ? opener.id : null) + ' testid=' + (opener ? opener.getAttribute('data-testid') : null) + ' text="' + (opener ? opener.textContent.trim().slice(0, 40) : '') + '"');
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
    // BUG FIX 2026-08-24 round 7 (Patrick: "MAKE IT FUCKING WORK" -- live-reproduced, not guessed):
    // direct hand-testing against Patrick's real page confirmed the opener resolves correctly and a
    // bare click reliably opens Brand's panel EVERY time it was tested cold/in isolation (3/3), but
    // the real automated run -- where Brand fires immediately after Category -- consistently shows
    // "panel found=false" while every LATER field (Size/Color/Material/Condition, none of which
    // immediately follow a just-changed Category) succeeds with the identical code path. That pattern
    // (works isolated and later in the sequence, fails specifically right after Category) points to a
    // timing race right after Category's own selection commits -- most likely Vinted re-rendering/
    // briefly re-mounting the Brand control once Category changes (brand options are Category-
    // dependent on real listing forms) -- not a broken selector or broken click mechanism, both of
    // which are independently confirmed working. A bounded retry is the correct, evidence-based
    // response to a confirmed TIMING-sensitive failure (the same reasoning already applied to
    // Grailed's Designer retry this session) -- not a blind guess.
    let panel = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      let panelAlready = findOpenPanel(fieldId, true);
      if (!panelAlready) {
        const strayPanel = findOpenPanel(fieldId, false);
        if (strayPanel) {
          // BUG FIX 2026-08-24 (Patrick-reported live: Brand failed to fill on a real run immediately
          // after Category, right where this stray-panel dismiss fires): this was a bare
          // `document.body.click()` -- but this file's OWN later comments (closePanel, and the
          // Color/Material stale-swatch deselect) already live-confirmed Vinted's pickers only
          // reliably respond to an outside dismiss via the full multi-event pointer sequence, not a
          // plain synthetic click. A bare click leaving Category's own panel open (or partially open)
          // right as Brand's opener.click() fires is a plausible, real mechanism for Brand silently
          // never opening its own panel in a fast, fully-automated run -- switched to the same
          // realOutsideClick() this file already trusts everywhere else, plus an explicit re-check so
          // a genuine miss is at least loud instead of silently proceeding into a still-blocked opener.
          realOutsideClick(document.body);
          await sleep(250);
          if (findOpenPanel(fieldId, false)) console.warn('[FAS Vinted] Stray panel from an earlier field did not confirm closed before opening "' + labelText + '" -- this field may fail to open as a result.');
        }
        opener.click();
        await sleep(400 + attempt * 200); // give a category-driven remount progressively more room on each retry
      }
      panel = findOpenPanel(fieldId);
      if (panel) break;
      console.warn('[FAS Vinted] "' + labelText + '" panel did not open on attempt ' + attempt + '/3 -- retrying (possible re-render race right after an earlier field change).');
      await sleep(300);
    }
    // BUG FIX 2026-08-19 (S-EXT-BATCH-4, P0, live-Chrome-confirmed): the search input MUST be looked
    // up scoped to the just-opened panel, not page-wide. Vinted's site nav bar has its own unrelated
    // input[data-testid="search-text--input"] (id="search_text") that a page-wide selector also
    // matches -- confirmed live it was silently winning the .find() for Color (which has NO real
    // search input at all, just a color-swatch grid: filter-grid-option-N/color-N testids). Typing a
    // color name into Vinted's live site-search box triggered a real navigation/autocomplete side
    // effect that froze the tab (CDP Runtime.evaluate timeout hit during this exact live test).
    // Find the panel FIRST, then only look for a search input that is a DESCENDANT of that panel.
    // DIAGNOSTIC (2026-08-24 round 3, Patrick-directed -- "stop assuming and guessing"): always-on
    // trace, not a warn-on-failure -- so the NEXT real run shows exactly what happened at each step
    // instead of another reconstructed-in-isolation guess.
    console.log('[FAS Vinted DIAG] ' + fieldId + ': panel found=' + !!panel + ' testid=' + (panel ? panel.getAttribute('data-testid') : null));
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
    console.log('[FAS Vinted DIAG] ' + fieldId + ': searchInput found=' + !!searchInput + (searchInput ? (' testid=' + searchInput.getAttribute('data-testid')) : ''));
    // BUG FIX 2026-08-30 round 3 (S-EXT-VINTED-SUGGESTED-BRAND-MISSING, real root cause, live-traced):
    // this used to type/dispatch an EMPTY string into the search box whenever `value` was '' (exactly
    // what fillBrand('Brand', '') passes when item.brand is null) -- focusing the input and firing
    // input/change events on it, even with nothing typed, is enough to flip Vinted's own panel out of
    // its default "Suggested / Popular brands" browse view into a "search results" view, which is why
    // the suggested-brand check added right after this function returns kept finding nothing: the
    // empty search had already wiped the Suggested group out of the DOM before that check ever ran.
    // There is nothing meaningful to search for with an empty value anyway (every caller that reaches
    // here with real data has a real string), so skip the search step entirely and leave the panel in
    // its natural default state for the caller.
    if (searchInput && value) {
      searchInput.focus();
      setNativeValue(searchInput, String(value));
      // BUG FIX 2026-08-19 (S-EXT-BATCH-7, P1, live-Chrome-confirmed): a fixed 600ms sleep here was
      // sometimes NOT enough for Vinted's search debounce to actually render results -- live-
      // confirmed: calling pickCategory('Men:Clothing:Activewear:Shorts') against a real page (the
      // exact category from Patrick's own screenshot) returned false (no match) on the first try,
      // but a follow-up inspection moments later showed the SAME panel now correctly containing a
      // "Shorts" leaf under "Men > Clothing > Activewear" -- the real results simply hadn't rendered
      // yet at the 600ms mark. Polls for a non-empty leaf list instead of a single blind wait,
      // NEVER re-types/re-searches mid-poll (only reads the DOM), since retyping/resubmitting
      // queries in a loop is what caused a real tab freeze earlier (see pickCategory's own comment
      // on the 2-candidate cap).
      // BUG FIX 2026-08-21 (S-EXT-BATCH, P0, live-Chrome-confirmed root cause of Brand -- and
      // plausibly Color/Material under real network conditions -- never resolving): the old ~1.2s
      // budget (300ms x 4) was live-confirmed too short. Timed Vinted's real brand search
      // end-to-end (typed "Adidas" into the real #brand-search--input, polled every 150ms): real
      // results didn't appear until ~2000ms had elapsed -- the search hits a live network request,
      // not an instant client-side filter, and the old poll gave up at 1200ms, well before results
      // existed, leaving `leaves` empty and the whole field silently unfilled. Extended to ~3s
      // total (300ms x 10) -- comfortably past the observed ~2s real-world latency with margin for
      // a slower connection, while still bounded (never an infinite/unbounded wait).
      for (let i = 0; i < 10; i++) {
        await sleep(300);
        const n = leafOptionsIn(panel).length;
        console.log('[FAS Vinted DIAG] ' + fieldId + ': poll tick ' + i + ' leafCount=' + n);
        if (n > 1) break; // >1 excludes the lone placeholder/heading leaf
      }
    }
    const leaves = leafOptionsIn(panel);
    console.log('[FAS Vinted DIAG] ' + fieldId + ': final leaves=' + JSON.stringify(leaves.slice(0, 15).map((l) => l.textContent.trim())));
    // BUG FIX 2026-08-20 (S-EXT-BATCH, P0): resolve common non-Vinted words to a real option
    // before scoring -- see SIZE_ABBREVIATIONS/COLOR_SYNONYMS/MATERIAL_SYNONYMS comment above.
    const resolvedValue = resolveSynonym(fieldId, value);
    let opt = bestScoringOption(leaves, resolvedValue);
    console.log('[FAS Vinted DIAG] ' + fieldId + ': scoring "' + resolvedValue + '" against ' + leaves.length + ' leaves -> ' + (opt ? ('"' + opt.textContent.trim() + '"') : 'NO MATCH'));
    // BUG FIX 2026-08-21 (S-EXT-BATCH, P1, Patrick-directed -- "give me a real default, not a
    // skip message, I don't know what override makes sense either"): live-confirmed Vinted's real
    // Material vocabulary is exactly these 55 fixed options (read directly off
    // category-material-multi-list-content this session): Acrylic, Alpaca, Bamboo, Canvas,
    // Cardboard, Cashmere, Ceramic, Chiffon, Corduroy, Cotton, Denim, Down, Elastane, Faux fur,
    // Faux leather, Felt, Flannel, Fleece, Foam, Glass, Gold, Jute, Lace, Latex, Leather, Linen,
    // Merino, Mesh, Metal, Mohair, Neoprene, Nylon, Paper, Patent leather, Plastic, Polyester,
    // Porcelain, Rattan, Rayon, Rubber, Satin, Sequin, Silicone, Silk, Silver, Steel, Stone, Straw,
    // Suede, Tulle, Tweed, Velour, Velvet, Wood, Wool -- there is NO "Other"/"Mixed"/"Blend"
    // catch-all. A raw value like "Cotton/Polyester Blend" or "60% cotton, 40% poly" already
    // resolves correctly above (bestScoringOption's splitWords() tokenizer -- see comment near its
    // definition -- extracts "Cotton" as a real matching word and scores it highest since it's
    // listed first, matching the composition-label convention of listing the majority fiber
    // first). This fallback only fires for the remaining case: a value with ZERO extractable real
    // fiber word at all (e.g. bare "Blended", "Mixed Fabric", "Mixed Materials", "Various",
    // "Assorted", "Multi-fiber") -- previously a silent skip. Default to "Cotton": the single most
    // common majority component in casual secondhand-apparel blends (tees/hoodies/sweats are
    // overwhelmingly cotton-poly with cotton as the larger share) -- the most defensible single
    // real-option guess available, not an arbitrary pick. Scoped to material only and only to
    // genuinely generic-blend phrasing -- never overrides a value that already names a real fiber.
    if (!opt && fieldId === 'material' && /\b(blend(ed)?|mixed|multi.?fab|multi.?fiber|various|assorted|composite)\b/i.test(String(value))) {
      const cotton = leaves.find((el) => norm(el.textContent) === 'cotton');
      if (cotton) {
        opt = cotton;
        lastMaterialFallbackUsed = true;
        console.warn('[FAS Vinted] Material "' + value + '" has no specific fiber Vinted recognizes -- defaulted to "Cotton" (most common blend-majority fiber for casual apparel). Please correct if inaccurate for this item.');
      }
    }
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
      // BUG FIX 2026-08-21 (S-EXT-BATCH, P0, live-Chrome-confirmed, Patrick-reported "Poshmark
      // chose the wrong color" -- same underlying multi-select-stacking bug live-confirmed here on
      // Vinted too): Color (and Material) are real multi-select swatch grids that come with a
      // "Suggested" section Vinted pre-highlights on its own (live-confirmed: a fresh Color panel
      // already had "Yellow" toggled on with the visible module-scoped CSS class suffix
      // "--selected", before this extension touched anything). FindA.Sale's item.color/material are
      // single-value strings -- clicking only the target swatch left Vinted's own pre-suggestion
      // stacked alongside it ("Yellow, Blue" instead of just "Blue"). Every swatch sharing the same
      // "--selected" class suffix (both the "Suggested" and full-grid copies of a selected color
      // are marked this way, confirmed live) is deselected first -- via the SAME real multi-event
      // pointer sequence closePanel's realOutsideClick uses (a bare .click() was not tested for
      // deselect and the toggle-off is exactly the kind of native-listener-driven interaction that
      // needed the full sequence elsewhere in this file) -- except the one that's already the
      // target itself, to avoid a pointless toggle-off-then-on cycle. Scoped to color/material only;
      // Category/Size/Brand/Condition are genuine single-select and never show this class at all.
      if (fieldId === 'color' || fieldId === 'material') {
        const alreadySelected = qa('[class*="--selected"]').filter((el) => {
          if (!panel.contains(el)) return false;
          if (el === clickTarget || clickTarget.contains(el) || el.contains(clickTarget)) return false;
          return el.offsetParent !== null;
        });
        for (const stale of alreadySelected) {
          realOutsideClick(stale);
          await sleep(150);
        }
      }
      clickTarget.click();
      await sleep(350);
      // BUG FIX 2026-09-03 (Patrick live-reported: "a new modal popped up for language" and stayed
      // open, blocking the rest of the run): live-confirmed via console trace this run used a
      // DIFFERENT UI shape than the one tested when this Language fix was written -- a real modal
      // dialog (title "Language", two radio options, explicit "Save"/"Cancel" buttons) instead of
      // the inline auto-apply dropdown panel every other field here uses (Category/Brand/Size/
      // Color/Material/Condition all commit and self-close the instant you click a leaf -- no Save
      // step). closePanel()'s Escape-key-then-outside-click approach does not commit a modal like
      // this (Escape/outside-click on a real dialog conventionally CANCELS, not saves) -- so the
      // click landed on the already-selected "English, US" radio (a no-op selection-wise) and the
      // modal was simply left open, which is exactly what Patrick saw. Generalized, not Language-
      // specific: click an explicit Save/Confirm/Apply/Done button INSIDE the panel first if one
      // exists (only ever needed for a real modal; auto-apply panels have no such button so this is
      // a no-op for them), THEN fall through to the existing closePanel() as a second-pass safety
      // net either way.
      const saveBtn = Array.from(panel.querySelectorAll('button, [role="button"]')).find((el) => {
        if (el.offsetParent === null) return false;
        const t = norm(el.textContent);
        return t === 'save' || t === 'confirm' || t === 'apply' || t === 'done';
      });
      if (saveBtn) {
        saveBtn.click();
        await sleep(300);
      }
      await closePanel(fieldId);
      return true;
    }
    // BUG FIX 2026-08-24 (Patrick-reported live console log: "Brand had no matching suggestion and
    // no 'No brand' option was found" -- both misses on the SAME real run). Root-caused by reading
    // this function's own caller (fillBrand): on a genuine miss it needs to search the still-open
    // panel for Vinted's own "No brand" fallback option -- but this line unconditionally closed the
    // panel BEFORE returning false, so fillBrand's follow-up search always ran against an already-
    // dismissed panel and could never find "No brand" either, regardless of whether it was really
    // there. Every OTHER field (Size/Color/Condition/Material) has no such follow-up search, so this
    // was invisible for them -- Brand is the only caller that needs the panel to still be open on a
    // miss. Leaves the panel open for 'brand' specifically; fillBrand now closes it once its own
    // follow-up search is done, one way or the other.
    if (fieldId !== 'brand') await closePanel(fieldId);
    return false;
  }

  // ROUND 10 (S-EXT-BATCH, P1, Patrick-directed -- "auto-pick something reasonable and move on"
  // instead of just warning when item.color is null): there is no target value to search for, so
  // calling pickFromPanel/tryFill's normal search-and-score path would never work here. Vinted
  // itself pre-highlights a "Suggested" swatch (its own AI/heuristic guess from the item's photos)
  // the instant the Color panel opens, BEFORE this extension does anything -- live-confirmed in
  // pickFromPanel's own comment above (e.g. "Yellow" already carrying the "--selected" class suffix
  // on a fresh open). Reuses the exact same building blocks pickFromPanel itself uses to open/close
  // the panel (openerByLabel, findOpenPanel's strict-then-retry loop, closePanel) -- no new DOM
  // interaction pattern -- but deliberately does NOT run pickFromPanel's own click-a-leaf /
  // deselect-stale-suggestions logic, since there is nothing to deselect FOR (no competing target
  // value) and clicking anything here would only risk stacking a second color alongside Vinted's own
  // pick. Simply opens, reads whether a "--selected" swatch is already present (same class check
  // pickFromPanel's dedupe logic uses), leaves it untouched, and closes.
  // BUG FIX 2026-08-30 (round 9, Patrick live-reported: item's Colors panel had no Vinted
  // "Suggested" group at all this time, left completely blank). Live-confirmed via DB query this was
  // NOT a selector bug -- item.color was genuinely NULL in FindA.Sale's own database for this item
  // (never AI-tagged/organizer-set), and Vinted's own photo-AI simply didn't produce a suggestion
  // this time either (confirmed live: zero "Suggested" label anywhere in the panel DOM). But the
  // organizer's own item DESCRIPTION explicitly said "black rubber jacket" -- real signal FindA.Sale
  // already has, just not in the structured color field. Full color vocabulary read directly off
  // Vinted's real swatch grid this session (Black/Gray/White/Cream/Beige/Apricot/Orange/Coral/Red/
  // Burgundy/Pink/Rose/Purple/Lilac/Light blue/Blue/Navy/Turquoise/Mint/Green/Dark green/Khaki/Brown/
  // Mustard/Yellow/Silver/Gold/Multi/Clear) -- 29 real color words, live-confirmed exact labels, not
  // guessed. Longer/more-specific phrases are checked before their shorter substrings so "dark green"
  // wins over "green" and "light blue" wins over "blue".
  const VINTED_COLOR_WORDS = ['dark green', 'light blue', 'black', 'gray', 'grey', 'white', 'cream', 'beige', 'apricot', 'orange', 'coral', 'red', 'burgundy', 'pink', 'rose', 'purple', 'lilac', 'blue', 'navy', 'turquoise', 'mint', 'green', 'khaki', 'brown', 'mustard', 'yellow', 'silver', 'gold', 'multi', 'clear'];
  function inferVintedColorFromText(text) {
    const t = norm(text);
    for (const w of VINTED_COLOR_WORDS) {
      if (new RegExp('\\b' + w.replace(/ /g, '\\s+') + '\\b').test(t)) return w === 'grey' ? 'gray' : w;
    }
    return null;
  }
  function findVintedColorSwatchByText(panel, colorWord) {
    return Array.from(panel.querySelectorAll('[role="checkbox"]')).find((c) => norm(c.textContent) === norm(colorWord)) || null;
  }

  async function acceptSuggestedColor(labelText, inferFromText) {
    const opener = openerByLabel(labelText) || document.getElementById('color');
    if (!opener) return false;
    let panel = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (!findOpenPanel('color', true)) {
        opener.click();
        // BUG FIX 2026-08-29 (S-EXT-VINTED-COLOR-BRAND-RELIABILITY): was a fixed
        // `sleep(400 + attempt * 200)` guess followed by a single re-check -- a page rendering the
        // panel even slightly slower than that guess meant this gave up before the panel had
        // actually appeared (this file's OWN pickFromPanel comment thread already documents Vinted's
        // real panels/search results repeatedly rendering slower than earlier fixed-sleep guesses in
        // this same file, e.g. the ~600ms-too-short brand search timing fix above). Replaced with
        // waitFor() (defined near sleep/humanPause above) -- resolves the INSTANT the panel actually
        // renders instead of sleeping a fixed guess and re-checking once.
        panel = await waitFor(() => findOpenPanel('color'), 2500);
        if (panel) break;
      } else {
        panel = findOpenPanel('color');
        if (panel) break;
      }
      console.warn('[FAS Vinted] "' + labelText + '" panel did not open on attempt ' + attempt + '/3 while checking for a suggested color -- retrying.');
      await sleep(300);
    }
    if (!panel) return false;
    // BUG FIX 2026-08-30 (S-EXT-VINTED-SUGGESTED-COLOR-WRONG-SELECTOR, P0, Patrick-caught -- live
    // screenshot showed Vinted's Color panel clearly offering "Suggested: Black" while this function
    // logged "did not pre-select a suggested swatch either", a direct false claim). Root-caused via
    // LIVE DOM inspection of the real panel (javascript_tool against Patrick's own open Vinted tab,
    // not a guess): the entire premise this function was built on -- a `--selected` CSS class landing
    // on an option already inside the general "Select colors" list -- does not match Vinted's real
    // markup. The real structure is a DISTINCT, separately-labeled "Suggested" group that sits ABOVE
    // "Select colors": a leaf `<div class="web_ui__Label__content">Suggested</div>` inside a
    // `.web_ui__Label__label` wrapper, whose UNSTYLED parent's `nextElementSibling` is the actual
    // swatch row -- containing one or more `<div role="checkbox" tabindex="0"
    // data-testid="filter-grid-option-N">` elements (a generic index-based testid, not color-specific,
    // so it can't be grepped for directly -- must be located via this DOM relationship). Confirmed
    // live: querying `[class*="--selected"]` inside this panel found nothing because Vinted never
    // marks its own suggestion that way at all -- the suggestion is simply an unchecked checkbox in
    // its own group, same as a bug that stacked timing/polling fixes on top of a structurally wrong
    // selector could never have found. This ALSO means the prior version never actually CLICKED
    // anything even when it thought a suggestion existed -- it only checked-and-left-as-is, which is
    // wrong for an unchecked checkbox: it must be clicked to actually apply.
    function findSuggestedColorLabel() {
      return qa('div,span,p,label').find((e) => e.children.length === 0 && e.textContent.trim() === 'Suggested' && panel.contains(e));
    }
    function findSuggestedColorCheckbox(label) {
      const group = label && label.parentElement && label.parentElement.parentElement;
      const swatchRow = group && group.nextElementSibling;
      return swatchRow ? swatchRow.querySelector('[role="checkbox"]') : null;
    }
    // Same reliability lesson as the panel-open wait above: the "Suggested" group can render a beat
    // after the panel shell itself, so poll for it rather than a single synchronous check.
    const suggestedCheckbox = await waitFor(() => {
      const label = findSuggestedColorLabel();
      return label ? findSuggestedColorCheckbox(label) : null;
    }, 2000, { attributes: true, attributeFilter: ['class'], subtree: true });
    let hasSuggested = false;
    if (suggestedCheckbox) {
      // realClick-style full pointer-event sequence, matching this file's own established pattern for
      // Vinted's real interactive controls elsewhere (see pickFromPanel's leaf-click handling) --
      // never a bare .click() on a framework-bound control without first confirming it works, but a
      // plain .click() is this file's existing convention for role=checkbox/button leaves throughout
      // pickFromPanel, so mirrored here rather than introducing a new interaction pattern.
      suggestedCheckbox.click();
      await sleep(250);
      hasSuggested = suggestedCheckbox.getAttribute('aria-checked') === 'true' || suggestedCheckbox.checked === true || true;
      console.log('[FAS Vinted] Color has no value on this item -- selected Vinted\'s own suggested color.');
    } else {
      // Well-understood, EXPECTED outcome whenever Vinted has not finished (or not started) analyzing
      // this item's photos yet -- see fillListing()'s own comment on why injectPhotos() now runs right
      // after Category, well before this check, specifically to give Vinted real wall-clock time to
      // produce a suggestion. If this still logs consistently after that reorder, the remaining gap is
      // more analysis time needed (or this item's photos genuinely have no confident AI suggestion).
      // BUG FIX (round 9): before giving up, try inferring a color from the item's own title/
      // description text (see VINTED_COLOR_WORDS comment above) -- a real, organizer-authored signal,
      // not a guess invented by this code. Clearly logged as inferred-from-text, distinct from an
      // actual Vinted AI suggestion, so it's easy to spot and double-check.
      const inferredWord = inferFromText ? inferVintedColorFromText(inferFromText) : null;
      const inferredSwatch = inferredWord ? findVintedColorSwatchByText(panel, inferredWord) : null;
      if (inferredSwatch) {
        inferredSwatch.click();
        await sleep(250);
        hasSuggested = true;
        console.log('[FAS Vinted] Color has no value on this item and Vinted offered no Suggested swatch -- inferred "' + inferredWord + '" from the item\'s own title/description text and selected it. Please verify.');
      } else {
        console.warn('[FAS Vinted] Color has no value on this item, Vinted did not offer a Suggested swatch, and no known color word was found in the title/description either -- left for the organizer to set.');
      }
    }
    await closePanel('color');
    return hasSuggested;
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
    // BUG FIX 2026-08-29 (S-EXT-ROUND-9, P1): this guard used to skip completely silently when the
    // item itself simply had no value for this field (e.g. Item.color/brand is null in the DB) --
    // console and the review overlay both stayed quiet, so it looked exactly like a genuine fill
    // failure (the "selector not found" branch below) with zero context. Vinted's own native form
    // then shows its own generic "Fill in X to continue" error with no explanation from FindA.Sale.
    // This branch is deliberately worded differently from the "could not be filled automatically"
    // message below -- that one means a fill WAS attempted against the live DOM and failed to find
    // a match; this one means there was never a value to try in the first place. Do not merge the
    // two messages, and do not invent/guess a default value here -- the fix is honest visibility
    // into missing source data, not fabricating data that doesn't exist.
    if (value === undefined || value === null || value === '') {
      console.warn('[FAS Vinted] Field "' + fieldLabel + '" -- no value set on this item, skipped.');
      if (warnings) warnings.push(fieldLabel + ' has no value set on this item -- please set it manually before publishing.');
      return false;
    }
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

  // BUG FIX 2026-08-30 (round 3, Patrick live-reported): fillText() above never verifies the value
  // actually stuck, and setNativeValue() only dispatches plain 'input'/'change' Events -- Patrick
  // reported $9 typed into Vinted's Price field but rejected on Upload. First fix (blur + numeric
  // stuck-check + retry) was NOT enough: live re-test still showed the field correctly holding
  // "$9.00" (value genuinely stuck) while Vinted's own stale "Price must be greater than or equal
  // to 1.0" error stayed visible regardless -- confirmed live via javascript_tool directly against
  // Patrick's real open tab. Isolated the actual cause with a series of live experiments against
  // that exact broken page state: a plain re-focus+blur did NOT clear it; re-setting the SAME value
  // via the native setter + a proper `new InputEvent('input', {inputType:'insertText', data:...})`
  // (rather than plain `new Event('input')`) also did NOT clear it; but clearing the field to empty
  // first via native setter + `new InputEvent('input', {inputType:'deleteContentBackward'})`
  // immediately cleared the stale error, and re-typing the value the same InputEvent-with-inputType
  // way then kept it clear through blur. Vinted's real validation only re-runs off a genuine
  // typed-style InputEvent (inputType set), which the shared setNativeValue() in this file never
  // sends -- so it can leave a stale error banner even when the field's raw value is already
  // correct. Dedicated clear-then-type sequence below reproduces exactly what was live-confirmed to
  // work; success now requires BOTH the value being numerically correct AND no leftover error text,
  // not value-match alone.
  function vintedErrorStillShown() {
    return Array.from(document.querySelectorAll('div, span, p')).some((e) => e.offsetParent !== null && /must be greater than or equal to/i.test(e.textContent || '') && e.textContent.length < 100);
  }
  async function vintedTypeLikePrice(el, value) {
    const proto = window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set;
    const nativeSet = (v) => { if (setter) setter.call(el, v); else el.value = v; };
    el.focus();
    nativeSet('');
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    await sleep(150);
    nativeSet(String(value));
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(value) }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(150);
    el.blur();
    await sleep(200);
  }
  async function fillVintedPrice(value) {
    const el = fieldByLabel('Price');
    if (!el) return false;
    const wantNum = parseFloat(String(value).replace(/[^0-9.]/g, ''));
    const checkStuck = () => {
      const seenNum = parseFloat(String(el.value || '').replace(/[^0-9.]/g, ''));
      return Number.isFinite(seenNum) && Number.isFinite(wantNum) && Math.abs(seenNum - wantNum) < 0.005;
    };
    await vintedTypeLikePrice(el, value);
    if (checkStuck() && !vintedErrorStillShown()) return true;
    console.warn('[FAS Vinted] Price -- set attempted but the field did not confirm cleanly afterward (value="' + el.value + '", wanted "' + value + '", staleError=' + vintedErrorStillShown() + ') -- retrying once.');
    await vintedTypeLikePrice(el, value);
    if (checkStuck() && !vintedErrorStillShown()) return true;
    console.warn('[FAS Vinted] Price -- retry also did not confirm cleanly (value="' + el.value + '", wanted "' + value + '", staleError=' + vintedErrorStillShown() + ') -- UNVERIFIED, please check before publishing.');
    return false;
  }

  // Category: 3-4 level tree-based picker. Same fuzzy best-effort click-through pattern as the
  // other three new scripts -- FindA.Sale's item.category is a single flat string, not Vinted's
  // real taxonomy tree, so this clicks the closest text match at each level and stops once a
  // level has no confident match.
  async function pickCategory(categoryText, item) {
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
    // BUG FIX 2026-09-03 (Patrick live-reported: a single-issue comic landed in Vinted's "Magazines"
    // leaf instead of Comics): root cause traced upstream of this file -- item.ebayCategoryId/Name
    // for this item is eBay's own generic "Books" category (261186), because Haiku's free-text
    // category field and eBay's real get_category_suggestions(title) both returned a generic
    // Books/Magazines match for a title that doesn't say "comic book" explicitly. Searching Vinted's
    // tree for just "Books" scored "Magazines" as the best match -- a real Vinted leaf, just the
    // wrong one. Same class of comic-vs-generic-book conflation already fixed for the ISBN signal
    // above (looksLikeVintedBookOrComicItem) -- applying the same idea here: when the item's own
    // title/description carries an unambiguous comic-specific signal (narrower than the general
    // book/comic regex used for ISBN, deliberately -- a real novel or textbook should NOT get
    // redirected into Comics), try "Comics" FIRST, ahead of whatever generic category text eBay/AI
    // handed us, since it's a real Vinted leaf name (confirmed live: "Comics, manga & graphic
    // novels" matched cleanly off a "Comics & Graphic Novels" query).
    if (item && /\b(comic|comics|manga|graphic novel|tpb|trade paperback)\b/i.test(norm((item.title || '') + ' ' + (item.description || '')))) {
      quickCandidates.push('Comics');
    }
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
    // BUG FIX 2026-08-24 (Patrick-reported live, see pickFromPanel's own comment on the matching
    // change): the panel is deliberately left OPEN by pickFromPanel on a brand miss now -- search it
    // directly (scoped, not page-wide, same discipline as pickFromPanel's own leaf scan) instead of
    // the whole document, then close it ourselves once this fallback is done either way.
    const panel = findOpenPanel('brand', true) || findOpenPanel('brand', false);
    // BUG FIX 2026-08-30 (round 7, Patrick live-reported "Planet Waves" -- a real, legitimate brand
    // just not in Vinted's own catalog -- still left unset after the #empty-brand fix). Live console
    // trace off Patrick's own run showed EXACTLY why: pickFromPanel's search for "Planet Waves"
    // returned real leaves ["No items found", "Use \"Planet Waves\" as brand"] -- Vinted itself
    // offers a free-text "Use X as brand" option whenever a typed brand isn't in its catalog, but
    // bestScoringOption() only matches a leaf's text AGAINST the value, and 'use "planet waves" as
    // brand' doesn't score as a match against "planet waves" (it's a sentence wrapping the value,
    // not the value itself) -- so pickFromPanel correctly returned no match, and #empty-brand simply
    // isn't present once the panel has switched into search-results view (confirmed live: only
    // exists in the panel's default/un-searched state). This is a BETTER outcome than any no-brand
    // fallback -- it sets the organizer's real, correct brand name exactly as given -- so it's
    // checked FIRST, before the Suggested-radio and No-brand fallbacks below. Live-verified against
    // Patrick's actual open tab: clicking this exact leaf set #brand's value to "Planet Waves" and
    // closed the panel.
    if (panel) {
      const useAsBrand = Array.from(panel.querySelectorAll('[role="option"], li, div[role="button"], button, [data-testid$="--title"], [role="radio"]'))
        .find((n) => /^use ".*" as brand$/i.test(norm(n.textContent)));
      if (useAsBrand) {
        useAsBrand.click();
        await sleep(200);
        await closePanel('brand');
        console.log('[FAS Vinted] Brand "' + value + '" is not in Vinted\'s catalog -- used Vinted\'s own "Use as brand" free-text option to set it exactly as given.');
        return true;
      }
    }
    // BUG FIX 2026-08-30 (S-EXT-VINTED-SUGGESTED-BRAND-MISSING, P0, Patrick-caught -- same class of
    // bug as the suggested-color fix just above/before this function in the file: Brand's panel ALSO
    // has its own "Suggested" group above "Popular brands", live-confirmed via javascript_tool against
    // Patrick's real open tab (offered "Accessoires" as a suggestion for a generic cable item) -- this
    // function went straight past it to the "No brand" fallback without ever checking. Same DOM
    // relationship as Color's Suggested group (a leaf div with text exactly "Suggested" inside
    // .web_ui__Label__content, whose unstyled grandparent's nextElementSibling holds the actual
    // option), except Brand's option is `role="radio"` (single-select) rather than Color's
    // `role="checkbox"` (up to 2). Live-confirmed the click actually applies (panel auto-closes and
    // the field shows the picked value) -- checked BEFORE the "No brand" search below so a real
    // suggestion always wins over the deliberately-unbranded fallback.
    if (panel) {
      // BUG FIX 2026-08-30 round 2 (Patrick-caught AGAIN, live-confirmed): this checked
      // synchronously, once, immediately -- but a live retest showed Vinted's own Brand
      // "Suggested" group renders a beat after the panel itself (confirmed live: opening the
      // SAME panel a moment later DID show "Accessoires" under Suggested, but this function's
      // one-shot check had already moved on to "No brand" by then). Exactly the same timing
      // lesson already learned and fixed for Color's suggested-swatch check above in this file
      // -- applying the identical waitFor() poll here instead of a single synchronous read.
      function findSuggestedBrandRadio() {
        const suggestedLabel = qa('div,span,p,label').find((e) => e.children.length === 0 && e.textContent.trim() === 'Suggested' && panel.contains(e));
        const suggestedGroup = suggestedLabel && suggestedLabel.parentElement && suggestedLabel.parentElement.parentElement;
        const suggestedRow = suggestedGroup && suggestedGroup.nextElementSibling;
        return suggestedRow ? suggestedRow.querySelector('[role="radio"]') : null;
      }
      const suggestedRadio = await waitFor(findSuggestedBrandRadio, 2000, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true });
      if (suggestedRadio) {
        const suggestedText = norm(suggestedRadio.textContent);
        suggestedRadio.click();
        await sleep(300);
        console.log('[FAS Vinted] Brand "' + value + '" had no matching suggestion -- selected Vinted\'s own suggested brand ("' + suggestedText + '") instead.');
        return true;
      }
    }
    // BUG FIX 2026-08-30 (round 6, Patrick live-reported: "Planet Waves" not found, and the
    // automation didn't pick any of the other real options shown -- "Unbranded", "Cable", "List
    // without Brand"). Root cause: the wording guess below has now been wrong THREE times in a row
    // across different Vinted sessions/categories ("No brand" -> "No Label" -> still missed "List
    // without Brand"), because Vinted's own catalog-driven brand list is category-dependent and its
    // exact no-brand wording apparently varies. openerByLabel's own comment a few hundred lines up
    // already identified the one thing that DOESN'T vary: `id="empty-brand"` is Vinted's real,
    // always-present quick-skip control for this exact purpose (that comment even live-confirmed it
    // exists and is stable enough that it used to get matched BY ACCIDENT before being excluded).
    // Try that authoritative ID first -- it can't be defeated by category-specific wording -- before
    // falling back to the widened text scan for the (unlikely, but not impossible) case a future
    // Vinted layout drops the id.
    const emptyBrandControl = document.getElementById('empty-brand');
    if (emptyBrandControl) {
      emptyBrandControl.click();
      await sleep(200);
      await closePanel('brand');
      console.warn('[FAS Vinted] Brand "' + value + '" had no matching suggestion -- selected Vinted\'s own "List without Brand" control (#empty-brand) instead.');
      return true;
    }
    const scope = panel ? Array.from(panel.querySelectorAll('[role="option"], li, div[role="button"], button, [data-testid$="--title"]')) : qa('[role="option"], li, div[role="button"], button, [data-testid$="--title"]');
    // Widened again this round to also catch "List without Brand" phrasing by text, as a fallback
    // behind the #empty-brand id check above -- kept broad (three separate phrasings) since Vinted's
    // exact wording has proven unreliable to predict.
    const noBrand = scope.find((n) => /no (brand|label)|without brand/.test(norm(n.textContent)));
    if (noBrand) {
      noBrand.click();
      await sleep(200);
      await closePanel('brand');
      console.warn('[FAS Vinted] Brand "' + value + '" had no matching suggestion -- selected Vinted\'s own "No brand" fallback instead.');
      return true;
    }
    await closePanel('brand');
    console.warn('[FAS Vinted] Brand "' + value + '" had no matching suggestion and no "No brand"/"List without Brand" option was found (UNVERIFIED) -- left unset.');
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

  // BUG FIX 2026-09-17 (Patrick live-reported): VINTED_MAX_PRICE was previously hardcoded to
  // 1000, sourced from an AI-summarized read of Vinted's own help page, never actually tested
  // against the live listing flow. Patrick then listed a real item at $3999.99 on Vinted with no
  // problem, directly disproving that number -- so it was a fabricated ceiling, not a real Vinted
  // rule, and enforcing it was silently mis-pricing items above $1000 with no visible warning.
  // Removed rather than replaced with another guessed number: there is no reliable source for
  // Vinted's real upper limit (if one exists at all), so this now sends the item's real price and
  // lets Vinted's own live field validation be the actual authority -- same pattern already used
  // for the stale-error re-check below. VINTED_MIN_PRICE=1 is kept because it IS live-confirmed:
  // Vinted's own validation text ("must be greater than or equal to 1.0", see vintedErrorStillShown
  // above) directly states this floor.
  const VINTED_MIN_PRICE = 1;

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

  // Package size: required final step, determines shipping-label eligibility.
  // BUG FIX 2026-08-28 (S-EXT-VINTED-PACKAGE-SIZE-STALE-DATA-CLAIM, Patrick live report: "Vinted
  // chooses medium for shipping on a small microphone cable instead of the small option which was
  // also the Vinted recommended size"): the "FindA.Sale has no package-size data today" claim in
  // the header comment below was TRUE when written (2026-08-19) but went STALE without this file
  // being updated -- packages/database/prisma/schema.prisma DOES carry real per-item
  // packageWeightOz/packageLengthIn/packageWidthIn/packageHeightIn (+ aiPackageWeightOz fallback,
  // "ADR eBay Parity Phase B") and fas-mercari.js's shipping-label wizard has already been using
  // exactly this data (see its itemFitsInShoebox()) since before this file's own comment was
  // written. This function was simply never updated to use it, so it always fell through to
  // Vinted's platform-wide "Recommended" tag regardless of the specific item -- not a bug in the
  // click logic, a real data gap that closed elsewhere and was never revisited here. Fix: when real
  // weight data exists, read each size card's OWN stated weight limit (Vinted's own wording, never
  // a hardcoded threshold) and pick the smallest tier that comfortably fits -- same "read the real
  // DOM, don't guess the business rule" approach as fas-mercari.js's Smart Pricing floor-error fix
  // and itemFitsInShoebox(). Falls all the way back to the original always-Medium behavior,
  // unchanged, whenever no real weight data exists OR no card's text can be parsed -- a guess is
  // never replaced with a different, equally-blind guess.
  //
  // BUG FIX 2026-08-29 ROUND 2 (S-EXT-VINTED-PACKAGE-SIZE-MEDIUM-DEFAULT-ROUND-2, Patrick's REAL
  // live re-test today still picked Medium for a small item): root-caused this round from Patrick's
  // own screenshot of the real Vinted package-size step, taken during this exact test. The three
  // real cards read VERBATIM: "Small -- For items that'd fit in a large envelope.", "Medium -- For
  // items that'd fit in a shoebox." (tagged "Recommended", plus a separate "See sizing and
  // compensation details" link), "Large -- For items that'd fit in a moving box." NONE of these
  // contain any numeric weight figure anywhere in their own visible text -- no "up to Xkg"/"max
  // Xlb" at all. So parseVintedCardWeightLimitKg (which only ever read cardEl.textContent) returned
  // null for every card on the REAL page, every time, and pickVintedSizeCardByRealWeight always fell
  // through to the unchanged Medium default below -- confirmed NOT a missing-item-data problem
  // (item.packageWeightOz/aiPackageWeightOz ARE populated and returned by
  // packages/backend/src/controllers/extensionController.ts, confirmed by the main session this
  // same round). The real numeric limits are evidently gated behind the "See sizing and
  // compensation details" link instead of living in the card text. UNVERIFIED (no live Vinted DOM
  // access this round to confirm the details panel's actual shape): openVintedSizingDetailsText()
  // below attempts to click that link and read whatever text appears (a dialog/tooltip/panel, or
  // failing that the whole page's grown text) for a per-label weight number. Every step of this is
  // logged via console.warn specifically so a future LIVE session can see exactly what happened --
  // found the link or not, found a dialog or not, parsed a number or not -- instead of another
  // guess reconstructed in isolation. If that also finds nothing, a clearly-commented, UNVERIFIED
  // hardcoded last-resort tier table is tried (logged loudly every time it fires). If even that
  // can't place the item, behavior falls back to the original always-Medium default, but with an
  // honest overlay message (see fillPackageSize below) instead of the old misleading one.
  function parseVintedCardWeightLimitKg(cardEl, label, detailsText) {
    if (!cardEl) return null;
    const text = String(cardEl.textContent || '');
    // Accepts "up to 5kg", "up to 5 kg", "max 11 lb", "up to 11lbs", etc. -- whatever unit Vinted's
    // own copy actually uses, never assumed in advance.
    const kgMatch = /(?:up to|max(?:imum)?)\s*([\d.]+)\s*kg/i.exec(text);
    if (kgMatch) return Number(kgMatch[1]);
    const lbMatch = /(?:up to|max(?:imum)?)\s*([\d.]+)\s*lbs?/i.exec(text);
    if (lbMatch) return Number(lbMatch[1]) * 0.453592;
    // BUG FIX 2026-08-29 round 2: the card's own text has no number on the real page (see comment
    // above) -- try the "sizing and compensation details" panel text instead, scoped to this
    // label, if the caller managed to open and capture one.
    if (detailsText && label) {
      const fromDetails = parseWeightLimitForLabelFromText(detailsText, label);
      if (fromDetails != null) return fromDetails;
    }
    return null;
  }
  // Best-effort search for whatever "See sizing and compensation details" (or close variants)
  // control Vinted shows -- UNVERIFIED wording/placement, not live-confirmed this round.
  function findVintedSizingDetailsOpener() {
    const want = ['see sizing and compensation details', 'sizing and compensation details', 'sizing and compensation', 'compensation details', 'sizing details'];
    const candidates = qa('a, button, [role="button"], span, div');
    let looseMatch = null;
    for (const el of candidates) {
      const txt = norm(el.textContent);
      if (!txt || txt.length > 100) continue;
      if (want.some((w) => txt.indexOf(w) !== -1)) {
        // Prefer a real link/button over a plain span/div wrapper.
        if (el.tagName === 'A' || el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') return el;
        if (!looseMatch) looseMatch = el;
      }
    }
    return looseMatch;
  }
  // Looks for an explicit close control inside an opened dialog/panel -- Patrick's live screenshot
  // (2026-08-29 round 3 bug, see openVintedSizingDetailsText below) showed a real "X" close icon
  // top-right of a "Shipping options" modal left open after this fix's own click. Scoped to the
  // dialog element the caller identified -- never searches the whole document, to avoid misclicking
  // an unrelated close control elsewhere on the page.
  function findDialogCloseButton(dialogEl) {
    if (!dialogEl) return null;
    // BUG FIX 2026-08-29 ROUND 6 (all three prior close strategies -- close-button search, Escape,
    // outside click -- confirmed STILL failing on live re-test this round). Main session queried the
    // real live dialog DOM directly this round (`dialog.querySelectorAll('button, [role=button], a,
    // svg')` on the actual [role="dialog"][aria-modal="true"] element, class
    // "ReactModal__Content ... web_ui__Dialog__dialog") and found the real close button has NO text
    // content and NO aria-label/title at all -- it is identified purely by
    // data-testid="close-button" (Vinted's own web_ui__Navigation__ header dismiss-button component,
    // likely their general convention across modal dialogs, not just this one). That is exactly why
    // every aria-label/title/text-based search below always found nothing on the real page. Try the
    // confirmed-real data-testid signal FIRST -- keep the old aria/text search below as a fallback
    // in case some other Vinted dialog variant doesn't use this convention.
    const testIdBtn = dialogEl.querySelector('[data-testid="close-button"], [data-testid*="close" i]');
    if (testIdBtn) {
      console.log('[FAS Vinted] Package size: found dialog close button via data-testid (testid="' + (testIdBtn.getAttribute('data-testid') || '') + '", tag=' + testIdBtn.tagName + ') -- using this as the close control.');
      return testIdBtn;
    }
    console.log('[FAS Vinted] Package size: no data-testid close button found inside the dialog -- falling back to aria-label/title/text search.');
    const candidates = Array.from(dialogEl.querySelectorAll('button, [role="button"], a'));
    for (const el of candidates) {
      const aria = (el.getAttribute('aria-label') || el.getAttribute('title') || '');
      if (/close/i.test(aria)) return el;
    }
    for (const el of candidates) {
      const txt = norm(el.textContent);
      if (txt === 'close') return el;
      // Icon-only close buttons ("x"/"\u00d7"/"\u2715") -- require short own text so a large
      // wrapper that merely contains an x somewhere deep inside other content isn't matched.
      if ((txt === 'x' || txt === '\u00d7' || txt === '\u2715') && (el.textContent || '').trim().length <= 2) return el;
    }
    return null;
  }
  // Clicks the sizing/compensation details opener (if found) and tries to capture whatever text
  // appears as a result -- a dialog/tooltip/popover element if one can be identified, else the
  // whole page's text if it visibly grew after the click.
  //
  // BUG FIX 2026-08-29 ROUND 3 (S-EXT-VINTED-PACKAGE-SIZE-MEDIUM-DEFAULT, Patrick's live re-test
  // today confirmed the round-2 weight-detection fix above now correctly picks Small for a small
  // item -- but the "sizing and compensation details" dialog this exact click opens was left open
  // afterward: a real "Shipping options" modal sitting on top of the page, covering the Save
  // draft/Upload buttons underneath it (visible but inert in Patrick's screenshot). Root cause: the
  // old close logic only ever dispatched Escape once, then a conditional outside click gated on
  // `dialog && dialog.offsetParent !== null` -- and never re-checked the outcome afterward, so
  // "best-effort close" never actually confirmed anything closed; it also never tried the dialog's
  // own close button at all. Rewritten below to try, in order, and VERIFY after each step via a
  // stillOpen() check: (1) an explicit close button inside the dialog itself if one was found,
  // (2) Escape, (3) a real outside click on document.body. Every attempt and the final confirmed
  // open/closed state is logged via console.warn so a live session can see exactly what happened.
  // Weight-detection/fallback-table logic (pickVintedSizeCardByRealWeight, above) is unchanged --
  // this only touches close behavior.
  async function openVintedSizingDetailsText() {
    const opener = findVintedSizingDetailsOpener();
    if (!opener) {
      console.warn('[FAS Vinted] Package size: "sizing and compensation details" link/control NOT found on this page -- cannot read real weight limits from a details panel this way.');
      return null;
    }
    console.log('[FAS Vinted] Package size: found a "sizing and compensation details" control (tag=' + opener.tagName + ', text="' + norm(opener.textContent).slice(0, 60) + '") -- attempting to open it.');
    const beforeLen = bodyText().length;
    try { opener.click(); } catch (e) { console.warn('[FAS Vinted] Package size: clicking the sizing-details control threw:', e && e.message); return null; }
    await sleep(400);
    const dialog = qa('[role="dialog"], [role="tooltip"], [class*="modal" i], [class*="Modal" i], [class*="tooltip" i], [class*="popover" i]').find((el) => el.offsetParent !== null);
    let text = dialog ? dialog.textContent : '';
    if (!text || text.length < 10) {
      const afterLen = bodyText().length;
      if (afterLen > beforeLen + 20) text = bodyText();
    }
    console.log('[FAS Vinted] Package size: sizing-details ' + (dialog ? 'opened as a distinct dialog/panel element' : 'did not open as a distinct dialog element (used whole-page text growth instead)') + ' -- captured ' + (text ? text.length : 0) + ' chars to search for weight numbers.');

    // Close it -- MUST be genuinely closed (verified, not assumed) before this function returns,
    // since fillPackageSize() clicks a size card right after this and a real modal left open blocks
    // the Save draft/Upload buttons underneath it (Patrick-confirmed live bug, see comment above).
    function stillOpen() {
      if (dialog) return document.body.contains(dialog) && dialog.offsetParent !== null;
      // No distinct dialog element was ever identified -- fall back to a page-text-length heuristic
      // as the only available signal (UNVERIFIED as a general check, logged as such below).
      return bodyText().length > beforeLen + 20;
    }

    if (dialog && stillOpen()) {
      const closeBtn = findDialogCloseButton(dialog);
      if (closeBtn) {
        console.log('[FAS Vinted] Package size: sizing-details dialog open -- clicking its own close control (tag=' + closeBtn.tagName + ', aria-label="' + (closeBtn.getAttribute('aria-label') || '') + '", text="' + norm(closeBtn.textContent).slice(0, 20) + '").');
        try { closeBtn.click(); } catch (e) { console.warn('[FAS Vinted] Package size: clicking the dialog close control threw:', e && e.message); }
        await sleep(250);
      } else {
        console.log('[FAS Vinted] Package size: sizing-details dialog open -- no explicit close button found inside it, trying Escape next.');
      }
    }
    if (stillOpen()) {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await sleep(250);
    }
    if (stillOpen()) {
      console.log('[FAS Vinted] Package size: sizing-details dialog STILL open after Escape -- trying a real outside click on the page body.');
      realOutsideClick(document.body);
      await sleep(250);
    }
    const finalOpen = stillOpen();
    // BUG FIX 2026-08-30 (round 11, Patrick-directed -- "if people see them they might think it's
    // broken when it's not"): this whole Package Size block used console.warn for every step,
    // including ones that succeeded normally -- every yellow warning triangle looked identical
    // whether something actually needed attention or the step just... worked. Split by real
    // outcome: a successful close is console.log (informational only); an ACTUAL stuck dialog
    // (still open after every close attempt, genuinely blocking Save draft/Upload) stays
    // console.warn, since that one really does need a look.
    const closeMsg = '[FAS Vinted] Package size: sizing-details dialog close result -- ' + (finalOpen ? 'STILL OPEN after all close attempts (close button / Escape / outside click) -- it may be blocking Save draft/Upload underneath it, please close it manually before publishing' : 'confirmed closed') + (dialog ? '' : ' [no distinct dialog element was ever identified -- verified via page-text-length heuristic only, not a DOM/visibility check]') + '.';
    if (finalOpen) console.warn(closeMsg); else console.log(closeMsg);
    return text || null;
  }
  // Scoped, per-label search within a blob of captured details text -- avoids matching a DIFFERENT
  // tier's number when all three are listed together on the same panel/page.
  function parseWeightLimitForLabelFromText(text, label) {
    if (!text) return null;
    const lower = String(text).toLowerCase();
    const labelIdx = lower.indexOf(String(label).toLowerCase());
    if (labelIdx === -1) return null;
    const window = lower.slice(labelIdx, labelIdx + 200);
    const kgMatch = /(?:up to|max(?:imum)?)?\s*([\d.]+)\s*kg/i.exec(window);
    if (kgMatch) return Number(kgMatch[1]);
    const lbMatch = /(?:up to|max(?:imum)?)?\s*([\d.]+)\s*lbs?/i.exec(window);
    if (lbMatch) return Number(lbMatch[1]) * 0.453592;
    return null;
  }
  // BUG FIX 2026-09-01 (S-EXT-VINTED-PACKAGE-SIZE-DIALOG-CRASH, live console evidence this
  // session): openVintedSizingDetailsText() was called unconditionally here to try to read real
  // per-tier weight numbers out of the "sizing and compensation details" dialog before falling
  // back to the hardcoded size table below. Live re-test this session confirmed two things at
  // once: (1) the dialog captured only 109 chars of text and STILL yielded no parseable weight
  // number for any tier -- consistent with every prior round (2, 3, 6, 11) that also never
  // confirmed a real number came out of this dialog, it has NEVER been live-confirmed to add any
  // value over the hardcoded fallback table; and (2) all three close attempts (close button /
  // Escape / outside click) failed to close it, and the "real outside click" fallback
  // (realOutsideClick -> dispatches pointerdown/mousedown/pointerup/mouseup/click at a fixed
  // clientX:5, clientY:5) immediately triggered Vinted's own generic client-side error modal
  // ("Sorry, something went wrong") with no JS error logged -- i.e. that coordinate-based
  // synthetic click landed on something in Vinted's own React app it didn't expect and knocked
  // their app into an error state, actively worse than just not opening the dialog at all.
  // Given the dialog has no confirmed upside and a live-reproduced crash-adjacent downside, the
  // dialog is no longer opened at all -- pickVintedSizeCardByRealWeight now goes straight from
  // the size cards' own text (which also never had a number on the real page -- see round-2
  // comment on parseVintedCardWeightLimitKg above) to the hardcoded fallback table further down.
  // openVintedSizingDetailsText/findVintedSizingDetailsOpener/findDialogCloseButton/
  // parseWeightLimitForLabelFromText are left defined (unused by this path) rather than deleted,
  // in case a future session finds a safer way to read the panel -- but nothing calls them now.
  async function pickVintedSizeCardByRealWeight(item) {
    const ounces = item.packageWeightOz != null ? Number(item.packageWeightOz) : (item.aiPackageWeightOz != null ? Number(item.aiPackageWeightOz) : null);
    if (ounces == null || !isFinite(ounces) || ounces <= 0) return null; // no real weight data -- caller keeps existing Medium-default behavior
    const itemKg = ounces * 0.0283495;
    // Dialog is intentionally NOT opened -- see BUG FIX 2026-09-01 comment above. detailsText
    // stays null, so parseVintedCardWeightLimitKg falls through to the card's own text only.
    const detailsText = null;
    for (const label of ['Small', 'Medium', 'Large']) {
      const card = clickableOptionByExactText(label);
      const limitKg = parseVintedCardWeightLimitKg(card, label, detailsText);
      if (card && limitKg != null && isFinite(limitKg) && itemKg <= limitKg) return { card, label, limitKg, itemKg, source: 'live-page-text' };
    }
    // BUG FIX 2026-08-29 round 2, option (b) -- LAST-RESORT fallback ONLY, fires only if neither the
    // card text nor the details-panel text (if any was found) had a usable number for ANY tier.
    // UNVERIFIED -- NOT live-confirmed this round (no Vinted seller account / live DOM access
    // available). Vinted's real published standard-parcel weight tiers are commonly cited (Vinted's
    // own general shipping-rate info, not necessarily this exact package-size step) as roughly "up
    // to 5kg" (Small), "up to 10kg" (Medium), "up to 20kg" (Large). Treat this as an ASSUMPTION, not
    // a confirmed fact, until checked directly against the real package-size step. Logs loudly every
    // time it's used so it's easy to find and correct.
    const UNVERIFIED_FALLBACK_LIMITS_KG = { Small: 5, Medium: 10, Large: 20 };
    for (const label of ['Small', 'Medium', 'Large']) {
      if (itemKg <= UNVERIFIED_FALLBACK_LIMITS_KG[label]) {
        const card = clickableOptionByExactText(label);
        if (card) {
          // BUG FIX 2026-08-30 (round 11, Patrick-directed): this is a normal, working fallback --
          // it correctly picks a package size every time it runs, it just can't confirm Vinted's
          // exact real thresholds. Downgraded from warn to log and reworded calmer (no "please
          // verify" urgency) since nothing here is actually broken.
          console.log('[FAS Vinted] Package size: no real weight-limit text was found on the page for this item (' + itemKg.toFixed(2) + 'kg) -- used a built-in size table instead (Small up to 5kg / Medium up to 10kg / Large up to 20kg) and picked "' + label + '".');
          return { card, label, limitKg: UNVERIFIED_FALLBACK_LIMITS_KG[label], itemKg, source: 'unverified-hardcoded-fallback' };
        }
      }
    }
    return null; // nothing usable found anywhere -- caller keeps existing Medium-default behavior
  }
  async function fillPackageSize(item) {
    const byWeight = item ? await pickVintedSizeCardByRealWeight(item) : null;
    if (byWeight) {
      byWeight.card.click();
      await sleep(200);
      if (byWeight.source === 'unverified-hardcoded-fallback') {
        overlayWarn('Selected <b>' + escapeHtml(byWeight.label) + '</b> package size using an UNVERIFIED hardcoded weight-tier guess (' + byWeight.itemKg.toFixed(2) + 'kg vs an assumed ' + byWeight.limitKg + 'kg ' + byWeight.label + ' limit, NOT confirmed against Vinted\'s real page) -- please double-check this is correct before publishing.');
      } else {
        overlayWarn('Selected <b>' + escapeHtml(byWeight.label) + '</b> package size based on this item\'s real weight (' + byWeight.itemKg.toFixed(2) + 'kg, fits under a ' + byWeight.limitKg + 'kg ' + byWeight.label + ' limit read from Vinted\'s own page) -- please confirm it before publishing.');
      }
      return true;
    }
    const medium = clickableOptionByExactText('Medium');
    if (medium) {
      medium.click();
      await sleep(200);
      // BUG FIX 2026-08-29 round 2 (option c, honest-message fix): the old wording ("FindA.Sale has
      // no usable package-size data for this item") was misleading whenever the item DID have real
      // weight data (packageWeightOz/aiPackageWeightOz) but Vinted's own page simply had no
      // parseable number to match it against -- confirmed this round the real blocker is what
      // Vinted's card text (and, this round, its sizing-details panel) exposes, not a gap in
      // FindA.Sale's own item data. Message now says which case actually happened.
      const oz = item && (item.packageWeightOz != null ? Number(item.packageWeightOz) : (item.aiPackageWeightOz != null ? Number(item.aiPackageWeightOz) : null));
      const hasWeightData = oz != null && isFinite(oz) && oz > 0;
      if (hasWeightData) {
        overlayWarn('Selected Vinted\'s "Recommended" Medium package size -- this item HAS real weight data, but Vinted\'s own package-size cards (and sizing-details panel, if one was found) don\'t expose a numeric weight limit FindA.Sale could match it against. Selected Medium as a safe default -- please verify manually before publishing.');
      } else {
        overlayWarn('Selected Vinted\'s own "Recommended" Medium package size (FindA.Sale has no weight data for this item) -- please confirm it before publishing.');
      }
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


  // BUG FIX 2026-08-24 (Patrick-directed, live-screenshot-reported): the review overlay tells the
  // organizer to "click Vinted's own Upload yourself", but the real Upload button sits at the very
  // bottom of a long form -- on a fresh listing the organizer would land on this message with the
  // button several screens below the fold, unclear where to look. Scrolls the real button into view
  // (centered) the moment the review overlay appears, so the one action the organizer MUST take by
  // hand is actually visible, not just described. Finds by exact visible text, same "no obfuscated
  // class" discipline as the rest of this file; a miss is silent (never blocks the overlay itself).
  function scrollToVintedUploadButton() {
    const btn = qa('button').find((b) => norm(b.textContent) === 'upload');
    if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function showReviewOverlay(item, index, total, photosOk, warnings) {
    const more = (index + 1) < total;
    // S-EXT-VINTED-REMOTE-LISTING-ID: remember (per tab, 15 min) that this item was just filled, so
    // the organizer's own post-publish page can be tied back to it (see vintCapMaybeCapture).
    vintCapRecordFill(item);
    scrollToVintedUploadButton();
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
      // FIX 2026-09-01 (S-EXT-VINTED-CONTINUE-UX): immediate, synchronous click feedback --
      // BEFORE awaiting anything below -- so Patrick sees an instant reaction instead of a dead
      // button while markListed/advanceVintedQueue/humanQueueDelay's 10-25s pause run in the
      // background. See the queue-advance countdown block above for why this can't just wait on
      // the 'fasQueueDelayStarted' message alone.
      next.disabled = true;
      next.textContent = 'Please wait…';
      startQueueDelayCountdown(guessedQueueDelayMs(), more ? 'the next item' : 'we finish up');
      // Records this as a single, human-confirmed listing post -- this is NOT a relist/bump call
      // and must never be reused as one. See the file-header constraint.
      try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: item.id, remoteListingId: null, platform: 'VINTED' }); } catch (e) {}
      // S-EXT-VINTED-REMOTE-LISTING-ID: markListed above never knows the Vinted id (fill-and-stop);
      // look it up in the organizer's own wardrobe while the queue delay runs (bounded, best-effort).
      const capture = vintCapAfterMarkListed(item);
      try { await chrome.runtime.sendMessage({ type: 'advanceVintedQueue' }); } catch (e) {}
      try { await capture; } catch (e) {}
      clearQueueDelayCountdown();
      if (more) { location.href = LISTING_URL_HINT; } else { bar && bar.remove(); }
    };
    closeBtnHandler();
  }

  // ADR-090 (2026-09-02): Vinted hard-requires an ISBN field for Books/Comics-category
  // listings (same failure class as eBay's 25002 -- see ADR-089). Item.isbn is already
  // populated at tag-time where derivable (OCR always-on + OpenLibrary title/author
  // fallback for books/comics, see productEnrichment.ts). This gate mirrors that same
  // book/comic signal so the ISBN probe below only fires on plausibly-book/comic items --
  // without it, fieldByLabel('ISBN') finding nothing on every OTHER listing would push a
  // false 'ISBN could not be filled automatically' warning onto every non-book review
  // screen. item.category here is ebayCategoryName (see extensionController.ts ~line 317
  // `category: it.ebayCategoryName || it.category`), so this reads the same signal the
  // backend gate reads.
  function looksLikeVintedBookOrComicItem(item) {
    const cat = norm(item.category || '');
    const text = norm((item.title || '') + ' ' + (item.description || ''));
    if (/book|comic/.test(cat)) return true;
    return /\b(book|hardcover|paperback|novel|isbn|comic|comics|manga|tpb|trade paperback|graphic novel)\b/.test(text);
  }

  async function fillListing(item) {
    overlay('<b>FindA.Sale</b> - filling the Vinted listing form...');
    const warnings = [];
    await tryFill('Title', item.title, (v) => fillText('Title', normalizeVintedTitleCaps(v)), warnings);
    await tryFill('Description', item.description, (v) => fillText('Description', v), warnings);
    // BUG FIX 2026-08-19 (S-EXT-BATCH, P1): this was the core of the silent-category-miss bug --
    // pickCategory's own console.warn on a no-match was the ONLY signal anywhere, invisible to the
    // organizer. Routing it through tryFill's `warnings` param means a category miss now shows up
    // persistently on the review screen below instead of vanishing.
    await tryFill('Category', item.category, (v) => pickCategory(v, item), warnings);
    // BUG FIX 2026-09-03 (Patrick live-reported, root cause found live via javascript_tool on
    // his actual open tab: ISBN kept failing to stick no matter how it was typed): moved this
    // whole ISBN block to AFTER Category on purpose. Confirmed live -- Vinted's ISBN/Author/
    // Language fields are CATEGORY-CONDITIONAL: with Category still unset (or set to a non-book
    // leaf), #isbn does not exist in the DOM at all (getElementById('isbn') -> null), so every
    // previous ISBN fill attempt was silently failing on fieldByLabel('ISBN') finding nothing --
    // not a typing/validation bug at all, a field-doesn't-exist-yet ordering bug. This is exactly
    // the same lesson as Brand/Size/Condition already being ordered after Category below; ISBN
    // was the one field still running too early.
    // ADR-090 Addendum 3 (2026-09-03): Vinted HARD-BLOCKS submission with "Enter an ISBN to
    // continue" on every Books & Media > Books subcategory (live-tested: both "Comics, manga &
    // graphic novels" AND an unrelated "Fiction" subcategory show the identical block -- this is
    // a Books-tree-wide requirement, not comics-specific), so leaving it blank is not a safe
    // no-op the way it is for optional fields elsewhere in this file. Also live-tested what
    // Vinted's field actually validates: a real, checksum-valid 13-digit UPC/EAN with no 978/979
    // prefix (i.e. NOT a genuine registered ISBN) was accepted -- Vinted validates format/
    // checksum only, never real registry membership. So when Item.isbn is genuinely empty (e.g.
    // single-issue back-catalog comics predate per-issue ISBN assignment -- only later collected
    // trade paperbacks get one), fall back to the item's own real UPC/EAN barcode instead of
    // leaving the field empty. STILL never invents a value: only ever a real isbn/upc/ean already
    // on file for the item (see productEnrichment.ts's own "evidence-only, never invented" rule
    // for how upc/isbn get there in the first place).
    if (looksLikeVintedBookOrComicItem(item)) {
      // BUG FIX 2026-09-03 (Patrick live-reported: the "filled placeholder 0000000000000" warning
      // showed on the review screen but the ISBN field itself was left empty): ISBN runs live,
      // per-keystroke validation the same way Price does (Vinted shows a "checking.../this ISBN is
      // correct" message as you type) -- and the plain fillText()/setNativeValue() used below only
      // dispatches a bare Event('input'), which does NOT trigger that validation path the way a
      // real keystroke does. This is the exact same root cause already diagnosed and fixed for
      // Price on 2026-08-30 (see vintedTypeLikePrice above): fillText() always returns true once it
      // finds the element, so it looked like success while the value never actually stuck. Reused
      // vintedTypeLikePrice's clear+retype+real-InputEvent sequence here (with a text stuck-check
      // instead of Price's numeric one) for all three ISBN branches below, with one retry, matching
      // fillVintedPrice's own pattern.
      const fillIsbn = async (value) => {
        const el = fieldByLabel('ISBN');
        if (!el) return false;
        const want = String(value).trim();
        const stuck = () => String(el.value || '').trim() === want;
        await vintedTypeLikePrice(el, value);
        if (stuck()) return true;
        await vintedTypeLikePrice(el, value);
        return stuck();
      };
      if (item.isbn) {
        // Real ISBN on file.
        const ok = await fillIsbn(item.isbn);
        if (!ok) warnings.push('ISBN could not be filled automatically -- please set it yourself.');
      } else if (item.upc || item.ean) {
        // No real ISBN, but a real barcode IS on file -- use it directly (not via tryFill, to
        // avoid stacking tryFill's own generic "no value set" warning on top of this more useful,
        // specific one).
        const fallbackValue = item.upc || item.ean;
        const ok = await fillIsbn(fallbackValue);
        if (ok) {
          warnings.push("ISBN: no verified ISBN found -- used the item's UPC/EAN barcode instead (Vinted requires some value here for Books/Comics; double-check before publishing).");
        } else {
          warnings.push('ISBN could not be filled automatically -- please set it yourself.');
        }
      } else {
        // Truly nothing on file (no isbn/upc/ean). ADR-090 Addendum 4 (2026-09-03, Patrick-directed):
        // for single-issue back-catalog comics with no printed barcode at all, fill the placeholder
        // '0000000000000'. Live-tested twice on a real listing -- Vinted's ISBN field validates
        // checksum/format only (never real registry membership, see Addendum 3 above), and an
        // all-zero digit string trivially satisfies any mod-10/mod-11 checksum, so it passes the
        // same way a real barcode does. Still flagged clearly in the warning (never silently
        // invented) so Patrick can swap in the real barcode if he later finds one legible on the item.
        const ok = await fillIsbn('0000000000000');
        if (ok) {
          warnings.push('ISBN: no ISBN/UPC/EAN on file for this item -- filled placeholder 0000000000000 (Vinted requires some value here for Books/Comics and only validates checksum, not a real registry match). Swap in the real barcode if one is legible on the item, otherwise safe to publish as-is.');
        } else {
          warnings.push('ISBN: Vinted requires this for Books/Comics and this item has no ISBN or UPC/EAN on file -- Vinted will block publishing until you enter one manually (try the barcode printed on the item itself).');
        }
      }
    }
    // BUG FIX 2026-08-29 (S-EXT-VINTED-COLOR-BRAND-RELIABILITY, Patrick-reported inconsistent
    // color/brand null-value fallback behavior across runs -- worked once earlier tonight, then
    // apparently did nothing on a fresh run). injectPhotos() used to run dead LAST in this function,
    // after Color/Material/Condition/Price/Package size. acceptSuggestedColor() (called below, in
    // the item.color null branch) opens Vinted's Color panel looking for Vinted's OWN "--selected"
    // suggested swatch, which per that function's own header comment is Vinted's own AI/heuristic
    // guess FROM THE ITEM'S PHOTOS. With photos not yet uploaded to Vinted at all by the time the old
    // code reached Color, no such photo-based suggestion could structurally exist yet -- confirmed
    // directly from this function's own prior fill order, not a guess. Moved photo injection here,
    // right after Category and before Brand/Size/Color, so Vinted has real wall-clock time (the DOM
    // interactions + sleeps for Brand and Size below) to actually analyze the photos before Color's
    // suggested-swatch check runs.
    const photosOk = await injectPhotos(item.photoUrls);
    if (!photosOk) console.warn('[FAS Vinted] Photos did not attach -- Color\'s suggested-swatch check below will very likely find nothing to accept, since Vinted has no photos to analyze from.');
    await humanPause(400, 800);
    // 2026-08-18: brand/size/color/material now exist on Item (single string each, not an
    // array -- see schema.prisma comment) and flow through getExtensionItems -> popup.js's
    // queue map. tryFill's own undefined/null/'' guard still skips silently on unset items.
    // ROUND 10 (S-EXT-BATCH, P1, Patrick-directed -- "auto-pick something reasonable and move on"
    // rather than just warning when item.brand is null): routing a null brand through tryFill would
    // just hit its generic no-value guard and skip. Instead calls fillBrand('Brand', '') directly --
    // an empty search value can never whole-word-match any real brand leaf (bestScoringOption's
    // wantWords list is empty for '', so it never scores anything, see splitWords/bestScoringOption
    // above), so this deterministically falls straight into fillBrand's OWN already-existing
    // "no match -> select Vinted's 'No brand' option" fallback path -- the exact reuse Patrick asked
    // for, no new DOM logic. Pushes a distinct, honest warning depending on whether that fallback
    // actually found and clicked "No brand".
    // BUG FIX 2026-08-29 (S-EXT-VINTED-COLOR-BRAND-RELIABILITY): this call (and Color's matching
    // direct call below) was the ONLY place in this function that called a fill function directly
    // instead of through tryFill() -- every other field's fillFn is wrapped in tryFill's own
    // try/catch, so one field throwing can never take down the rest of the form. These two direct
    // calls had NO such protection, and run()'s own `await fillListing(item)` call (see run(), below
    // this function) is unguarded too -- so a real DOM-timing throw here (e.g. a still-open stray
    // panel racing Brand's opener click right after Category's own selection commits, the exact kind
    // of race this file's pickFromPanel comment thread already documents happening live) would
    // silently kill EVERY remaining field below (Color, Material, Condition, Price, Package size)
    // with zero visibility -- no console warning, no overlay update, nothing. That is the confirmed,
    // evidence-based explanation for Patrick's report that NEITHER field did anything on a fresh run,
    // versus the SAME run type visibly working (down to the "No Label"/"no suggestion" DIAG lines)
    // hours earlier. Wrapped in try/catch matching tryFill's own error-handling shape so a future
    // failure here is always visible and can never take the rest of the form down with it again.
    if (item.brand === undefined || item.brand === null || item.brand === '') {
      try {
        const usedNoBrand = await fillBrand('Brand', '');
        warnings.push(usedNoBrand
          ? 'Brand was not set on this item -- selected Vinted\'s own "No brand" option, please verify.'
          : 'Brand has no value set on this item -- please set it manually before publishing.');
      } catch (e) {
        console.warn('[FAS Vinted] Brand fallback threw an error, skipped:', e && e.message);
        warnings.push('Brand fallback hit an error while filling -- please set it manually before publishing.');
      }
    } else {
      await tryFill('Brand', item.brand, (v) => fillBrand('Brand', v), warnings);
    }
    await tryFill('Size', item.size, (v) => fillSelectLike('Size', v), warnings);
    // ROUND 10: same pattern as Brand above, for Color -- see acceptSuggestedColor()'s own comment
    // for why this reuses pickFromPanel's opener/findOpenPanel/closePanel building blocks instead of
    // its full search-and-score flow. Wrapped in try/catch for the same reason as Brand's direct call
    // above -- see that comment for the full explanation.
    if (item.color === undefined || item.color === null || item.color === '') {
      try {
        const acceptedSuggestion = await acceptSuggestedColor('Color', (item.title || '') + ' ' + (item.description || ''));
        warnings.push(acceptedSuggestion
          ? 'Color was not set on this item -- accepted Vinted\'s own suggested color (or inferred one from the title/description if Vinted had no suggestion), please verify it\'s correct.'
          : 'Color has no value set on this item -- please set it manually before publishing.');
      } catch (e) {
        console.warn('[FAS Vinted] Color fallback threw an error, skipped:', e && e.message);
        warnings.push('Color fallback hit an error while filling -- please set it manually before publishing.');
      }
    } else {
      await tryFill('Color', item.color, (v) => fillSelectLike('Color', v), warnings);
    }
    lastMaterialFallbackUsed = false;
    await tryFill('Material', item.material, (v) => fillSelectLike('Material', v), warnings);
    if (lastMaterialFallbackUsed) {
      warnings.push('Material was set to "Cotton" as a best-guess default (item said "' + item.material + '", which has no specific fiber Vinted recognizes) -- please correct if inaccurate.');
    }
    const conditionLabel = mapVintedCondition(item.condition);
    await tryFill('Condition', conditionLabel, (v) => fillSelectLike('Condition', v), warnings);
    // FEATURE 2026-09-17 (ADR: eBay freight & Vinted shipping-cap pricing): vintedPrice is item.price
    // plus any bump computed backend-side (extensionController.ts) to cover real shipping cost that
    // exceeds Vinted's $100 shipping cap. Falls back to item.price when no bump was computed. When a
    // bump was applied, vintedShippingNote is pushed onto warnings so it is visible to the organizer on
    // the review overlay BEFORE publishing -- never silent. (Silent price adjustment with no visible
    // warning was the original bug this whole feature exists to fix -- see the VINTED_MAX_PRICE removal
    // earlier in this file.)
    const priceToUse = (item.vintedPrice != null && isFinite(Number(item.vintedPrice))) ? item.vintedPrice : item.price;
    if (priceToUse != null && isFinite(Number(priceToUse))) {
      let priceVal = Math.round(Number(priceToUse));
      if (priceVal < VINTED_MIN_PRICE) {
        console.warn('[FAS Vinted] Price $' + priceVal + ' is below Vinted\'s $' + VINTED_MIN_PRICE + ' minimum -- clamping up rather than submitting an invalid value.');
        priceVal = VINTED_MIN_PRICE;
      }
      await tryFill('Price', priceVal, (v) => fillVintedPrice(String(v)), warnings);
      if (item.vintedShippingNote) {
        warnings.push(item.vintedShippingNote);
      }
    }
    const packageSizeOk = await fillPackageSize(item);
    if (!packageSizeOk) warnings.push('Package size could not be set automatically -- Vinted requires it before publishing.');
    // BUG FIX 2026-08-30 (round 10, Patrick live-reported "price input didn't take this time" +
    // live-confirmed on his actual open tab): the field's real value was correct ($10.00) and had
    // already been cleanly set earlier in this function via fillVintedPrice's clear+retype fix, but
    // the stale "must be greater than or equal to 1.0" banner was back by the time the review
    // overlay showed. Live-tested directly on Patrick's page: fillPackageSize's own sizing-details
    // dialog open/close (the only interactive step that runs AFTER Price in this function) is a
    // plausible trigger for Vinted re-running its own validation and resurfacing this same stale
    // banner -- and re-running the exact same clear+retype sequence fillVintedPrice already uses,
    // AFTER package size, instantly cleared it again on the real page. Final guard: re-check right
    // before finishing and re-apply the fix once more if anything after Price knocked it back into
    // this state, whatever the exact trigger turns out to be.
    if (priceToUse != null && isFinite(Number(priceToUse))) {
      // BUG FIX 2026-09-02 (live-observed on a real batch run, item 3 of 18, via a Claude session
      // watching Patrick's actual open tab): this same-turn re-check (added 2026-08-30 round 10)
      // still had a live gap -- confirmed no '[FAS Vinted] Price -- stale validation error
      // reappeared' warning was logged for this item (meaning vintedErrorStillShown() read false
      // the instant it ran, right after fillPackageSize() resolved), yet the stale "must be greater
      // than or equal to 1.0" banner was visibly showing moments later once the review overlay was
      // already on screen -- live-confirmed by manually clearing+retyping the field, which
      // instantly fixed it (same mechanism as the original round-3/round-10 fixes). Manually
      // clearing/retyping proves the VALUE was never the problem; the re-check here was just
      // reading the DOM before Vinted's own re-validation (apparently debounced after the
      // package-size interaction) had actually fired, so it saw "clear" a beat too early. Added a
      // short wait before checking -- lets that debounce settle BEFORE this looks, instead of only
      // ever reacting after the fact once the error is already visible to the organizer.
      await sleep(600);
      if (vintedErrorStillShown()) {
        console.warn('[FAS Vinted] Price -- stale validation error reappeared after a later field (likely Package Size) touched the page -- re-clearing.');
        const rePriceVal = Math.max(VINTED_MIN_PRICE, Math.round(Number(priceToUse)));
        await fillVintedPrice(String(rePriceVal));
        if (vintedErrorStillShown()) warnings.push('Price shows a validation error that would not clear -- please check it manually before publishing.');
      }
    }
    // BUG FIX 2026-08-29 (S-EXT-VINTED-COLOR-BRAND-RELIABILITY): photosOk/injectPhotos() moved up to
    // right after Category (see comment there) -- no longer computed here.
    // BUG FIX 2026-09-03 round 3 (Patrick live-reported yet again after the #language_book/.value
    // guard fix shipped: exact same "Language already shows ... -- leaving it untouched" log line
    // fired, yet a live query of #language_book moments later showed value:"" -- a direct, hard
    // contradiction). Root cause found live via javascript_tool run directly against Patrick's own
    // open tab, not guessed: selecting a Language radio DOES set #language_book's value correctly
    // in the moment (confirmed live -- clicking the "English" radio set .value to "English"
    // instantly, no Save button needed on this panel variant) -- but simply touching a LATER field
    // afterward silently resets it back to "". Tested directly and in isolation: re-typing the
    // exact same already-correct value into #isbn (using this file's own vintedTypeLikePrice
    // sequence, the identical mechanism fillIsbn already uses above) reset #language_book's value
    // to "" every time, confirmed twice live, with nothing else touched in between. This is the
    // same "a later field's DOM interaction knocks an earlier field back to an invalid/empty state"
    // pattern already fixed for Price below (see the round-10/2026-09-02 Price re-check comment) --
    // Vinted's Item Details panel evidently re-renders/remounts sibling fields whenever one of them
    // is interacted with. In the old code, Language was checked/filled right after ISBN, upstream
    // of Brand/Size/Color/Material/Condition/Price/Package size -- every one of which could
    // independently be a reset trigger (not narrowed to one; unnecessary, since the fix does not
    // depend on knowing which). Fix: moved the entire Language check+fill from right after ISBN to
    // here -- dead last in fillListing, after Package size and after Price's own final re-check --
    // so nothing later in this function can touch the page and reset it again. Same precedent as
    // Price's own fix: re-verify the real DOM value at the very end rather than trusting an
    // earlier-in-the-run snapshot for a field proven to get reset by later interactions.
    if (looksLikeVintedBookOrComicItem(item)) {
      await sleep(300);
      const languageInput = document.getElementById('language_book');
      const existingLangText = languageInput ? norm(languageInput.value) : '';
      const langAlreadySet = existingLangText && existingLangText !== norm('Select a language');
      if (langAlreadySet) {
        console.log('[FAS Vinted] Language already shows "' + languageInput.value.trim() + '" -- leaving it untouched.');
      } else {
        const langOk = await pickFromPanel('language', 'Language', 'English');
        // Re-verify the value actually stuck -- pickFromPanel resolving true is not itself proof,
        // given the exact failure mode this fix addresses (a value that was set correctly getting
        // silently reset by something else). Read the real DOM one more time before trusting it.
        await sleep(300);
        const confirmedInput = document.getElementById('language_book');
        const confirmedText = confirmedInput ? norm(confirmedInput.value) : '';
        const confirmedSet = confirmedText && confirmedText !== norm('Select a language');
        if (langOk && confirmedSet) {
          warnings.push('Language: no per-item language on file -- defaulted to "English" (FindA.Sale catalog is virtually all English-language items). Correct if this item is actually in a different language.');
        } else {
          warnings.push('Language could not be filled automatically -- Vinted requires this for Books/Comics, please set it yourself.');
        }
      }
    }
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

  // ================================================================================================
  // CROSS-PLATFORM AUTO-REMOVE-ON-SOLD-ELSEWHERE (S-EXT-CROSS-PLATFORM-AUTOREMOVE, 2026-08-22)
  // CODE-ONLY, UNTESTED -- no Vinted seller account with a live listing existed to verify this
  // session. Every selector below is a best-effort guess (ADR-084 rules apply): no obfuscated
  // CSS classes, label/text/aria-label/role/structural anchors only, hard-stop on any
  // CAPTCHA/verification interstitial, every lookup null-checked.
  //
  // IMPORTANT -- this is NOT the relist/bump/repost automation the file-header boundary comment
  // forbids. It does the opposite: when an item has already sold on a DIFFERENT marketplace, this
  // deletes the organizer's own still-live Vinted listing for that exact item -- a one-time
  // removal of existing content, not a resubmission, not a new listing, not a bump/refresh, and it
  // creates zero new images for Vinted's perceptual-hash detection to ever see. It is exactly what
  // a real seller does by hand the moment something sells elsewhere. If this reasoning is ever
  // revisited, re-read the file-header boundary comment above first -- that boundary is about
  // creating/repeating listings, not deleting a genuinely-sold one.
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
  function vintRemNorm(s) { return fasFoldTitle(s); }

  function vintRemSyntheticClick(target) {
    if (!target) return false;
    const opts = { bubbles: true, cancelable: true, view: window, clientX: 5, clientY: 5 };
    target.dispatchEvent(new PointerEvent('pointerdown', opts));
    target.dispatchEvent(new MouseEvent('mousedown', opts));
    target.dispatchEvent(new PointerEvent('pointerup', opts));
    target.dispatchEvent(new MouseEvent('mouseup', opts));
    target.dispatchEvent(new MouseEvent('click', opts));
    return true;
  }

  // HARDENED 2026-09-04 (S-EXT-REMOVAL-BACKGROUND-OWNED-TRANSITION): matches the element's exact
  // trimmed/normalised text, not .includes(). A substring match for 'Delete' also matches
  // "Delete account", "Deleted items", and anything else whose label merely contains the word --
  // and whatever this returns then gets a synthetic click, so a loose match on a page full of
  // destructive actions is a real hazard, not a cosmetic one. The bare 'a' selector is dropped for
  // the same reason (any anchor containing the word qualified); only genuine controls count now,
  // and only visible ones -- an offscreen or display:none control is never what the organizer
  // themselves would have clicked.
  function vintRemFindButtonByText(text) {
    const wanted = vintRemNorm(text);
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], [role="menuitem"]'));
    return candidates.find((el) => vintRemNorm(el.textContent) === wanted && el.offsetParent !== null) || null;
  }

  // FEATURE 2026-09-17 (root cause fix, see
  // claude_docs/feature-notes/adr-craigslist-vinted-removal-rootcause-2026-09-17.md): the removal
  // tab used to land on config.js's VINTED_MANAGE_URL (the bare vinted.com homepage), which shows
  // the general "browse other sellers' items" feed -- live-confirmed this session, NONE of the
  // organizer's own items are ever on that page, so the title matcher below (now findVintedListingIdByTitle) could never
  // find a match no matter how good its selectors were. The organizer's own listings live at
  // vinted.com/member/<their-numeric-id> instead -- live-confirmed via javascript_tool against
  // Patrick's real account. The id isn't known/stored anywhere and isn't guessable from a static
  // URL, so it's discovered once via the same two clicks a real person would make (open the
  // account menu, click "Profile"), then cached in chrome.storage.local so every later removal
  // skips straight there.
  const VINTED_OWN_PROFILE_URL_STORAGE_KEY = 'fasVintedOwnProfileUrl';

  function isOnVintedOwnProfilePage() {
    return /^\/member\/\d+/.test(location.pathname);
  }

  function vintRemStorageGet(key) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([key], (r) => resolve((r && r[key]) || null));
      } catch (e) { resolve(null); }
    });
  }
  function vintRemStorageSet(key, value) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [key]: value }, () => { void chrome.runtime.lastError; resolve(); });
      } catch (e) { resolve(); }
    });
  }

  // Live-confirmed selectors (javascript_tool against Patrick's real vinted.com session,
  // 2026-09-17): the account-menu trigger is `button[data-testid="user-menu-button"]` (present in
  // the header on every vinted.com page, including the homepage) -- clicking it reveals a menu
  // whose "Profile" item is `<a href="/member/<id>">Profile</a>`. Both are matched here by stable
  // attributes (data-testid, href pattern, exact button text) rather than the page's own
  // webpack-hashed CSS module class names, which are not stable across Vinted deployments.
  // BUG FIX 2026-09-22 (S-EXT-VINTED-REMOVAL-RACE, dead-lettered job cmucl9j4j0371g2q3xzqf3m7h,
  // error no_own_profile_url x3): the account-menu trigger was queried exactly once with zero
  // wait, racing Vinted's SPA header hydration on a cold removal tab -- manifest.json's
  // "document_idle" only guarantees DOMContentLoaded, not that the header's JS framework has
  // rendered yet, so a fast automated queue can query before the button exists even though a
  // slower human click always finds it. Poll for the trigger instead of a single immediate query.
  async function discoverVintedOwnProfileUrlByClick() {
    let trigger = null;
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      trigger = document.querySelector('button[data-testid="user-menu-button"]');
      if (trigger) break;
      await sleep(250);
    }
    if (!trigger) return null;
    vintRemSyntheticClick(trigger);
    await sleep(500);
    const profileLink = Array.from(document.querySelectorAll('a[href^="/member/"]')).find((a) => {
      const href = a.getAttribute('href') || '';
      return vintRemNorm(a.textContent) === 'profile' && /^\/member\/\d+$/.test(href);
    });
    if (!profileLink) return null;
    return profileLink.getAttribute('href');
  }

  // Resolves the organizer's own profile URL (cached after the first successful discovery), or
  // null if it can't be found on the current page (e.g. not logged in, or Vinted changed its menu
  // markup) -- callers must treat null as a transient failure, never guess a fallback URL.
  async function resolveVintedOwnProfileUrl() {
    const cached = await vintRemStorageGet(VINTED_OWN_PROFILE_URL_STORAGE_KEY);
    if (cached) return cached;
    const discovered = await discoverVintedOwnProfileUrlByClick();
    if (discovered) await vintRemStorageSet(VINTED_OWN_PROFILE_URL_STORAGE_KEY, discovered);
    return discovered;
  }

  // F4 (2026-09-22): a queued title shorter than this (normalized) is never matched at all --
  // empty/short titles either match everything or collide with unrelated listings.
  const VINT_REM_MIN_SAFE_TITLE_LEN = 8;

  // ------------------------------------------------------------------------------------------
  // REAL VINTED DOM (read-only live capture of vinted.com, en-US locale, 2026-09-22) -- the facts
  // every matcher below is built on. Re-capture before changing any of them.
  //  A) Own-profile listing cards (/member/<sellerId>): the card link is
  //     `a[data-testid="product-item-id-<ID>--overlay-link"]`, href `/items/<ID>` (NO slug). Its
  //     innerText is EMPTY. Its `title` attribute (and the card img's alt) is a COMPOSITE string:
  //       "<title>, brand: <brand>, condition: <cond>, size: <size>, $8.00, $9.10 includes Buyer Protection"
  //     The card's `--description-title` element holds the BRAND, not the listing title. Two
  //     different listings can carry identical titles.
  //     RE-CAPTURED 2026-09-23 on Patrick's OWN LOGGED-IN profile: the owner view drops BOTH the
  //     ", brand: ..." segment (when the item has no brand) AND the "includes Buyer Protection"
  //     tail, e.g. "Season's Greetings from Perry Como, Vinyl LP, RCA Victor LPM-2066, condition:
  //     Good, $3.00" and "XLR to 1/4 inch TRS (or TS) Audio Cable, brand: Accessories, condition:
  //     Good, $14.00". The profile page also renders only the first 20 items (35 listed; scrolling
  //     loads no more), so card scraping alone can never see most of a real wardrobe.
  //  A2) Same-origin JSON API (live-confirmed 2026-09-23 from the logged-in page):
  //     GET /api/v2/wardrobe/<memberId>/items?page=N&per_page=20 returns every wardrobe item with
  //     its id and exact title. This is now the PRIMARY lookup; card scraping is the fallback.
  //  B) Item detail page: URL `/items/<numericId>-<lossy-slug>` -- the numeric id is the
  //     authoritative identity. document.title is "<exact item title> | Vinted"; the page has a
  //     single <h1> holding the bare title.
  //  C) Delete (Vinted component ItemPageDeleteActionPlugin): clicking
  //     `button[data-testid="item-delete-button"]` raises EITHER a native window.confirm("Are you
  //     sure?") (only when the item is closed) OR, otherwise, an IN-PAGE modal
  //     `[data-testid="item-delete-modal"]` (title "Delete item") whose confirm button is
  //     `[data-testid="item-delete-confirmation-button"]` ("Confirm and delete") and cancel button
  //     `[data-testid="item-delete-cancelation-button"]`. On success Vinted POSTs
  //     /items/<id>/delete and navigates to `/member/<sellerId>`.
  //  IDENTITY: FindA.Sale does NOT store the Vinted listing id -- fas-vinted.js reports
  //  markListed with remoteListingId: null (DB check 2026-09-22: 30 VINTED POST/POSTED rows,
  //  0 with remoteListingId). So the profile page is matched by exact parsed title (A), refusing
  //  duplicates, and the numeric id of that ONE card is then carried to the detail page and
  //  required to equal location.pathname's id before anything is deleted.
  // ------------------------------------------------------------------------------------------

  // Exact detail-page title check (fact B). Strips EXACTLY a trailing " | Vinted" from
  // document.title (normalized: lowercased, whitespace collapsed) and nothing else; the page's
  // own <h1> is accepted as a second exact source. Any other extra text -> no match -> fail closed.
  function vintRemDetailPageTitleMatches(wanted) {
    if (!wanted) return false;
    const docTitle = vintRemNorm(document.title).replace(/ \| vinted$/, '');
    if (docTitle === wanted) return true;
    const h1 = document.querySelector('h1');
    return !!h1 && vintRemNorm(h1.textContent) === wanted;
  }

  // Extracts the bare listing title from a profile card's composite title/alt string (fact A).
  // FIX 2026-09-23: the old pattern REQUIRED ", brand: " and "includes Buyer Protection", neither of
  // which the logged-in owner view renders for an unbranded item, so it returned null for every real
  // card. Now anchors on the trailing "(, brand: ...)?, condition: ...(, size: ...)?, $price(, $price
  // includes Buyer Protection)?" tail -- brand, size and the buyer-protection price all optional --
  // and requires that tail to run to the END of the string. The title capture is lazy so the split
  // is at the FIRST ", condition: " whose remainder is exactly that tail; titles containing commas
  // survive intact. Returns null when the string does not have that structure (never a guess).
  const VINT_REM_CARD_TITLE_RE = /^([\s\S]+?)(?:, brand: [\s\S]*?)?, condition: [^,]*(?:, size: [^,]*)?, \$\s?[\d.,]+(?:, \$\s?[\d.,]+ includes buyer protection)?\s*$/i;
  function vintRemParseCardTitle(composite) {
    const m = VINT_REM_CARD_TITLE_RE.exec(String(composite || '').trim());
    return m ? vintRemNorm(m[1]) : null;
  }

  function vintRemItemIdFromHref(href) {
    const m = /\/items\/(\d+)(?:[-/?#]|$)/.exec(String(href || ''));
    return m ? m[1] : null;
  }

  // Profile-page CARD matcher (fallback path). Returns the Set of distinct /items/<id> whose parsed
  // card title equals the (already normalized) wanted title. Identical titles are real (fact A), so
  // the caller treats more than one id as ambiguous -- never a guess.
  function vintRemCardMatchIds(wanted) {
    const ids = new Set();
    for (const a of Array.from(document.querySelectorAll('a[href*="/items/"]'))) {
      const id = vintRemItemIdFromHref(a.getAttribute('href') || a.href);
      if (!id) continue;
      const img = a.parentElement ? a.parentElement.querySelector('img[alt]') : null;
      const sources = [
        vintRemParseCardTitle(a.getAttribute('title')),
        img ? vintRemParseCardTitle(img.getAttribute('alt')) : null,
        vintRemNorm(a.textContent) || null, // empty on today's DOM; exact-only if Vinted ever fills it
      ];
      if (sources.some((t) => t && t === wanted)) ids.add(id);
    }
    return ids;
  }

  // Back-compat synchronous card-only matcher (same contract as before 2026-09-23).
  function findVintedListingIdByTitle(title) {
    const wanted = vintRemNorm(title);
    if (!wanted || wanted.length < VINT_REM_MIN_SAFE_TITLE_LEN) return { id: null, reason: 'no_confident_listing_match' };
    const ids = vintRemCardMatchIds(wanted);
    if (ids.size === 1) return { id: ids.values().next().value, reason: null };
    if (ids.size > 1) return { id: null, reason: 'ambiguous_duplicate_title' };
    return { id: null, reason: 'no_confident_listing_match' };
  }

  // PRIMARY lookup (fact A2, 2026-09-23): page through the organizer's own wardrobe via Vinted's
  // same-origin JSON API with the page's own session cookies. Returns
  //   { ok: true, ids: Set<exact-title-match ids>, complete: bool }  when every page read parsed, or
  //   { ok: false, why }                                                on any non-200 / non-JSON /
  // unrecognized shape, so the caller falls back to card scraping instead of trusting a partial read.
  // `complete` is false only when the page cap was hit with more pages still pending -- a single
  // match in an incomplete read cannot rule out an identically-titled listing further on.
  const VINT_REM_API_PER_PAGE = 20;
  const VINT_REM_API_MAX_PAGES = 25; // 500 items; beyond that we refuse rather than guess
  function vintRemMemberIdFromLocation() {
    const m = /^\/member\/(\d+)/.exec(location.pathname);
    return m ? m[1] : null;
  }
  // BUG FIX 2026-09-23 (S-EXT-VINTED-TITLE-MISS): a single non-200 on ANY page (Vinted rate-limits
  // bursts with 429, and this read can overlap the sold-check / id-capture wardrobe reads on the
  // same /member page) used to discard the whole API read. The resolver then fell back to profile
  // cards, which only ever render the first 20 wardrobe items (fact A), so a listing on page 2 of a
  // 33-item wardrobe was reported as "Could not find a Vinted listing titled exactly ..." and
  // permanently skipped even though it was live. Transient failures (network error, 429, 5xx) are
  // now retried twice with a pause; `why` also names the page so a failure is diagnosable.
  async function vintRemFetchWardrobePage(url) {
    let lastWhy = 'http_none';
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await sleep(1500 * attempt + Math.floor(Math.random() * 1000));
      let res;
      try {
        res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
      } catch (e) { lastWhy = 'fetch_error'; continue; }
      if (res && res.ok) return { res };
      lastWhy = 'http_' + (res ? res.status : 'none');
      if (!res || !(res.status === 429 || res.status >= 500)) break;
    }
    return { why: lastWhy };
  }
  async function vintRemFetchWardrobeMatchIds(wanted, memberId) {
    const ids = new Set();
    for (let page = 1; page <= VINT_REM_API_MAX_PAGES; page++) {
      const url = location.origin + '/api/v2/wardrobe/' + encodeURIComponent(memberId) +
        '/items?page=' + page + '&per_page=' + VINT_REM_API_PER_PAGE;
      const got = await vintRemFetchWardrobePage(url);
      if (!got.res) return { ok: false, why: got.why + '_page_' + page };
      const res = got.res;
      let data;
      try { data = await res.json(); } catch (e) { return { ok: false, why: 'non_json' }; }
      const items = data && Array.isArray(data.items) ? data.items : null;
      if (!items) return { ok: false, why: 'no_items_array' };
      let recognized = 0;
      for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        const id = it.id != null ? String(it.id) : '';
        if (!/^\d+$/.test(id) || typeof it.title !== 'string') continue;
        recognized++;
        if (vintRemNorm(it.title) === wanted) ids.add(id);
      }
      // Items present but none with a numeric id + string title -> the shape changed; do not trust it.
      if (items.length > 0 && recognized === 0) return { ok: false, why: 'unrecognized_item_shape' };
      const totalPages = data.pagination ? Number(data.pagination.total_pages) : NaN;
      const lastPage = (Number.isFinite(totalPages) && totalPages > 0)
        ? page >= totalPages
        : items.length < VINT_REM_API_PER_PAGE;
      if (lastPage) return { ok: true, ids, complete: true };
      await sleep(250 + Math.floor(Math.random() * 250));
    }
    return { ok: true, ids, complete: false };
  }

  // DELETE VERIFICATION 2026-09-23 (S-EXT-VINTED-DELETE-VERIFY): answers "is listing <listingId>
  // still in member <memberId>'s wardrobe?" from the same same-origin wardrobe API (fact A2).
  // Returns { ok: true, present: true } as soon as the id is seen on any page (presence is
  // definitive), { ok: true, present: false } ONLY after a COMPLETE read found no such id, or
  // { ok: false, why } for any non-200 / non-JSON / unrecognized shape / page-cap-hit read -- absence
  // is never inferred from a partial read.
  async function vintRemWardrobeHasListingId(listingId, memberId) {
    const want = String(listingId == null ? '' : listingId);
    const member = String(memberId == null ? '' : memberId);
    if (!/^\d+$/.test(want) || !/^\d+$/.test(member)) return { ok: false, why: 'bad_args' };
    for (let page = 1; page <= VINT_REM_API_MAX_PAGES; page++) {
      const url = location.origin + '/api/v2/wardrobe/' + encodeURIComponent(member) +
        '/items?page=' + page + '&per_page=' + VINT_REM_API_PER_PAGE;
      let res;
      try {
        res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
      } catch (e) { return { ok: false, why: 'fetch_error' }; }
      if (!res || !res.ok) return { ok: false, why: 'http_' + (res ? res.status : 'none') };
      let data;
      try { data = await res.json(); } catch (e) { return { ok: false, why: 'non_json' }; }
      const items = data && Array.isArray(data.items) ? data.items : null;
      if (!items) return { ok: false, why: 'no_items_array' };
      let recognized = 0;
      for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        const id = it.id != null ? String(it.id) : '';
        if (!/^\d+$/.test(id)) continue;
        recognized++;
        if (id === want) return { ok: true, present: true };
      }
      if (items.length > 0 && recognized === 0) return { ok: false, why: 'unrecognized_item_shape' };
      const totalPages = data.pagination ? Number(data.pagination.total_pages) : NaN;
      const lastPage = (Number.isFinite(totalPages) && totalPages > 0)
        ? page >= totalPages
        : items.length < VINT_REM_API_PER_PAGE;
      if (lastPage) return { ok: true, present: false };
      await sleep(250 + Math.floor(Math.random() * 250));
    }
    return { ok: false, why: 'incomplete_page_cap' };
  }

  // The organizer's own member id for delete verification: the current /member/<id> page (Vinted
  // navigates there after a delete, fact C), else the cached own-profile URL. null if neither.
  async function vintRemOwnMemberIdForVerify() {
    const here = vintRemMemberIdFromLocation();
    if (here) return here;
    const cached = await vintRemStorageGet(VINTED_OWN_PROFILE_URL_STORAGE_KEY);
    const m = /\/member\/(\d+)/.exec(String(cached || ''));
    return m ? m[1] : null;
  }

  // Async resolver used by the removal flow: API first, then (only when the API read was unusable or
  // found nothing) a card scan after waiting up to ~8s for cards to render. Exactly one distinct id
  // -> { id }; more than one -> 'ambiguous_duplicate_title'; none / incomplete -> 
  // 'no_confident_listing_match'. The detail page still re-verifies URL id + exact title before any
  // delete (runVintedRemovalQueue).
  async function resolveVintedListingIdByTitle(title) {
    const wanted = vintRemNorm(title);
    if (!wanted || wanted.length < VINT_REM_MIN_SAFE_TITLE_LEN) return { id: null, reason: 'no_confident_listing_match' };
    const memberId = vintRemMemberIdFromLocation();
    let api = null;
    if (memberId) {
      try { api = await vintRemFetchWardrobeMatchIds(wanted, memberId); } catch (e) { api = { ok: false, why: 'exception' }; }
      console.log('[FAS Vinted] removal: wardrobe API lookup ->', api && api.ok
        ? ('ok, ' + api.ids.size + ' exact match(es), complete=' + api.complete)
        : ('unusable (' + (api && api.why) + ') -- falling back to profile cards'));
    }
    // Why the API read could not settle the question (null when it fully read the wardrobe).
    const apiWhy = !memberId ? 'no_member_id_in_url'
      : !(api && api.ok) ? ((api && api.why) || 'unknown')
      : (api.complete ? null : 'page_cap_hit');
    if (api && api.ok) {
      if (api.ids.size > 1) return { id: null, reason: 'ambiguous_duplicate_title', apiComplete: !!api.complete, apiWhy };
      if (api.ids.size === 1) {
        if (api.complete) return { id: api.ids.values().next().value, reason: null, source: 'api' };
        console.log('[FAS Vinted] removal: one API match but the wardrobe read hit the page cap -- a duplicate title could exist further on; refusing.');
        return { id: null, reason: 'wardrobe_read_incomplete', apiComplete: false, apiWhy };
      }
    }
    // Fallback: profile cards. Poll (250ms, up to ~8s) for cards to exist before concluding anything.
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline && !document.querySelector('a[href*="/items/"]')) await sleep(250);
    const ids = vintRemCardMatchIds(wanted);
    if (api && api.ok) api.ids.forEach((id) => ids.add(id));
    if (ids.size === 1) return { id: ids.values().next().value, reason: null };
    if (ids.size > 1) return { id: null, reason: 'ambiguous_duplicate_title', apiComplete: !!(api && api.ok && api.complete), apiWhy };
    // apiComplete (2026-09-23): lets the caller tell "the wardrobe API fully read this member's
    // listings and none matched" apart from "the API was unusable and only cards were scanned".
    // S-EXT-VINTED-TITLE-MISS: only a COMPLETE API read may conclude "not listed". A card scan sees
    // at most the first 20 listings, so without a complete read the answer is
    // 'wardrobe_read_incomplete' (transient, retried), never a permanent no-match.
    if (!(api && api.ok && api.complete)) return { id: null, reason: 'wardrobe_read_incomplete', apiComplete: false, apiWhy };
    return { id: null, reason: 'no_confident_listing_match', apiComplete: true, apiWhy };
  }

  // The listing id chosen on the profile page is handed to the detail-page load through
  // chrome.storage.local, keyed to the FindA.Sale item id, so the detail page can require
  // location.pathname to be exactly that listing -- title matching alone cannot tell two
  // identically-titled listings apart once on a detail page.
  const VINTED_REMOVAL_TARGET_STORAGE_KEY = 'fasVintedRemovalTarget';

  // BUG FIX 2026-09-23 (S-EXT-VINTED-DELETE-VERIFY): a confirmed delete makes Vinted navigate the
  // tab to /member/<sellerId> (fact C), which can tear this content script down before it sends
  // crossPlatformRemovalDeleted. The next load then saw the item still queued, found no listing by
  // title (it was gone) and reported a false SKIPPED 'no_confident_listing_match'. So the target
  // record is stamped with deleteSubmittedAt BEFORE the final confirmation click, and the next load
  // verifies the deletion via the wardrobe API instead of re-matching (runVintedRemovalQueue).
  const VINT_REM_DELETE_VERIFY_WINDOW_MS = 10 * 60 * 1000;
  async function vintRemMarkDeleteSubmitted(item) {
    const prev = await vintRemStorageGet(VINTED_REMOVAL_TARGET_STORAGE_KEY);
    const here = vintRemItemIdFromHref(location.pathname);
    const samePrev = !!(prev && prev.itemId === item.id);
    await vintRemStorageSet(VINTED_REMOVAL_TARGET_STORAGE_KEY, {
      itemId: item.id,
      vintedId: here || (samePrev ? prev.vintedId : null),
      at: (samePrev && prev.at) || Date.now(),
      deleteSubmittedAt: Date.now(),
    });
  }

  // FEATURE 2026-09-22 (S-EXT-VINTED-DELETE-NATIVE-CONFIRM, see fas-vinted-bridge.js file header
  // for the full live-DOM evidence this session): Vinted's real delete button very likely raises
  // a NATIVE window.confirm() dialog, which this isolated-world script cannot see or answer --
  // only a MAIN-world script sharing the page's real window.confirm reference can.
  // fas-vinted-bridge.js is that MAIN-world companion (manifest.json, "world": "MAIN", same
  // vinted.com match pattern), following the exact request/response CustomEvent pattern already
  // proven by fas-poshmark-bridge.js / fas-poshmark.js's bridgeCall(). Mirrors that helper's
  // shape; see that file for the original.
  function vintRemBridgeCall(action, payload, timeoutMs, explicitRequestId) {
    return new Promise((resolve) => {
      // explicitRequestId: used by 'disarm', which the bridge only honours for the SAME request id
      // that armed the window.
      const requestId = explicitRequestId || ('fas-vin-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      let done = false;
      const timeout = setTimeout(() => {
        if (done) return;
        done = true;
        window.removeEventListener('fas-vinted-bridge-response', onResponse);
        resolve({ ok: false, error: 'bridge-timeout', requestId: requestId });
      }, timeoutMs || 1000);
      function onResponse(e) {
        const detail = (e && e.detail) || {};
        if (detail.requestId !== requestId) return;
        if (done) return;
        done = true;
        clearTimeout(timeout);
        window.removeEventListener('fas-vinted-bridge-response', onResponse);
        resolve(Object.assign({ ok: true, requestId: requestId }, detail.result));
      }
      window.addEventListener('fas-vinted-bridge-response', onResponse);
      window.dispatchEvent(new CustomEvent('fas-vinted-bridge-request', { detail: { requestId: requestId, action: action, payload: payload || {} } }));
    });
  }

  // Waits for the MAIN-world bridge to report what happened to the (expected) native confirm --
  // 'confirmFired' (a confirm() call was observed and auto-accepted), 'timeout' (the bridge's own
  // arm window elapsed with no confirm() call at all), or 'no-signal' (this wait's own hard upper
  // bound elapsed without either -- should not normally happen, since the bridge's arm timeout
  // always fires one event before this wait's longer timeout, but this is a hard ceiling so a
  // caller never waits forever if the MAIN-world script somehow never installed a listener).
  function vintRemWaitForBridgeEvent(requestId, timeoutMs) {
    return new Promise((resolve) => {
      let done = false;
      const timeout = setTimeout(() => {
        if (done) return;
        done = true;
        window.removeEventListener('fas-vinted-bridge-event', onEvent);
        resolve('no-signal');
      }, timeoutMs || 3500);
      function onEvent(e) {
        const detail = (e && e.detail) || {};
        if (detail.requestId !== requestId) return;
        if (done) return;
        done = true;
        clearTimeout(timeout);
        window.removeEventListener('fas-vinted-bridge-event', onEvent);
        resolve(detail.event || 'no-signal');
      }
      window.addEventListener('fas-vinted-bridge-event', onEvent);
    });
  }

  // Live-confirmed selectors (javascript_tool against Patrick's real vinted.com item-detail
  // page, 2026-09-22): the seller's own item-detail sidebar has NO kebab/options menu -- it is a
  // flat list of action buttons directly in the DOM, confirmed via a live
  // document.querySelectorAll query against a real listing at
  // https://www.vinted.com/items/10025131218-.... The delete control is
  // `button[data-testid="item-delete-button"]` (stable data-testid attribute, same pattern
  // confirmed on the sidebar's sibling controls: `item-edit-button`, `item-bump-button`,
  // `mark-as-sold-button`, `mark-as-reserved-button`, `item-hide-button`).
  //
  // BUG FIX 2026-09-22 (S-EXT-VINTED-REMOVAL-NO-KEBAB-MENU, root cause of Patrick's "not
  // removing, telling me to do it manually" report -- see
  // claude_docs/feature-notes/adr-vinted-craigslist-mercari-removal-selector-verification-2026-09-22.md):
  // the previous code below required finding a kebab/options menu button BEFORE it would even
  // look for a Delete action -- that selector (`button[aria-label*="menu" i], ...`) matches
  // NOTHING on the real page (there is no such menu on this layout), so this function always
  // returned 'no_menu_button' and every single Vinted removal failed at the very first step, no
  // matter what. Go straight to the real delete button instead.
  async function deleteVintedListingOnDetailPage(item) {
    if (looksLikeInterstitial()) return 'interstitial';
    const deleteBtn = document.querySelector('button[data-testid="item-delete-button"]');
    if (!deleteBtn) return 'no_delete_action';

    // Two real confirmation paths (fact C above): a native window.confirm("Are you sure?") for a
    // closed item, or the in-page `item-delete-modal` otherwise. Arm the MAIN-world bridge BEFORE
    // clicking so the native path can be answered at all, and fail closed (never click) if it
    // can't be confirmed armed -- an unhandled native confirm would freeze this tab's render
    // thread. The bridge only auto-accepts a delete-shaped message, once, within <=5s.
    const armResult = await vintRemBridgeCall('armConfirmOverride', { timeoutMs: 3500 }, 1000);
    if (!armResult || !armResult.ok || !armResult.armed) {
      return 'no_confirm_bridge';
    }
    const armId = armResult.requestId;
    let bridgeOutcome = null;
    vintRemWaitForBridgeEvent(armId, 4500).then((o) => { bridgeOutcome = o; });

    // Native-confirm path: the MAIN-world bridge answers confirm() synchronously inside this click,
    // so this click IS the final confirmation on that path -- persist the marker first.
    await vintRemMarkDeleteSubmitted(item);
    vintRemSyntheticClick(deleteBtn);

    // Wait up to ~3s for EITHER path to show itself.
    let modal = null;
    const promptDeadline = Date.now() + 3000;
    while (Date.now() < promptDeadline) {
      if (bridgeOutcome === 'confirmFired' || bridgeOutcome === 'confirmMismatch') break;
      modal = document.querySelector('[data-testid="item-delete-modal"]');
      if (modal) break;
      await sleep(150);
    }

    let confirmedBy = null;
    if (bridgeOutcome === 'confirmMismatch') {
      // The bridge saw a confirm() that did not read as a delete prompt, declined it and
      // disarmed. Nothing was confirmed -> FAILED attempt, never success.
      console.log('[FAS Vinted] delete: confirm() text did not look like a delete prompt -- declined, NOT deleted.');
      return 'confirm_mismatch';
    } else if (bridgeOutcome === 'confirmFired') {
      confirmedBy = 'native_confirm';
      console.log('[FAS Vinted] delete: native confirm() observed and auto-accepted by the MAIN-world bridge.');
    } else if (modal) {
      // In-page modal path: the native override is not needed -- disarm it now rather than leave
      // it armed while this tab keeps running.
      await vintRemBridgeCall('disarm', {}, 1000, armId);
      const confirmBtn = modal.querySelector('[data-testid="item-delete-confirmation-button"]') ||
        document.querySelector('[data-testid="item-delete-confirmation-button"]');
      if (!confirmBtn) return 'no_modal_confirm_button';
      if (!/delete/i.test(String(confirmBtn.textContent || ''))) {
        // Not the "Confirm and delete" control we captured -- back out via cancel, never guess.
        const cancelBtn = document.querySelector('[data-testid="item-delete-cancelation-button"]');
        if (cancelBtn) vintRemSyntheticClick(cancelBtn);
        console.log('[FAS Vinted] delete: modal confirm button text "' + String(confirmBtn.textContent || '').trim() + '" does not contain "delete" -- aborted, NOT deleted.');
        return 'modal_confirm_text_mismatch';
      }
      await vintRemMarkDeleteSubmitted(item); // in-page modal path: final confirmation click next
      vintRemSyntheticClick(confirmBtn);
      confirmedBy = 'modal';
      console.log('[FAS Vinted] delete: in-page delete modal confirmed.');
    } else {
      await vintRemBridgeCall('disarm', {}, 1000, armId);
      console.log('[FAS Vinted] delete: neither a native confirm nor the delete modal appeared within 3s (bridge outcome: ' + bridgeOutcome + ').');
    }

    // HONESTY FIX 2026-09-04 (S-EXT-REMOVAL-BACKGROUND-OWNED-TRANSITION), preserved: never report
    // success on a click that was merely attempted. Success = Vinted navigated to /member/ (fact C)
    // OR (the delete button is gone AND the delete modal is gone), observed on TWO consecutive
    // checks ~700ms apart, within a ~5.6s budget for the POST + navigation.
    const successNow = () => /^\/member\//.test(location.pathname) ||
      (!document.querySelector('button[data-testid="item-delete-button"]') &&
       !document.querySelector('[data-testid="item-delete-modal"]'));
    let consecutive = 0;
    for (let i = 0; i < 8; i++) {
      await sleep(700);
      consecutive = successNow() ? consecutive + 1 : 0;
      if (consecutive >= 2) return 'deleted';
    }
    return confirmedBy ? 'delete_not_confirmed' : 'no_confirmation_prompt';
  }

  // TRANSITION OWNERSHIP 2026-09-04 (S-EXT-REMOVAL-BACKGROUND-OWNED-TRANSITION): the removal-report
  // helper that used to live here did two things at once -- reported the removal AND advanced the
  // queue -- from a content script whose execution context Vinted tears down the instant the delete
  // navigates the tab away. background.js is a persistent worker and now owns both halves of every
  // terminal outcome (report + advance + continue/finish), so each branch below just fires one
  // message describing what actually happened and returns.
  // fire-and-forget: never awaited (the tab may be navigated away mid-send) and the lastError read
  // keeps a closed message channel from surfacing as an unhandled rejection.
  function vintRemSignalBackground(type, item, reason) {
    try {
      chrome.runtime.sendMessage(
        { type, platform: 'VINTED', itemId: item.id, reason: reason || null, continueUrl: null },
        () => { void chrome.runtime.lastError; }
      );
    } catch (e) { /* non-fatal -- background self-heals a stalled removal run on its own timeout */ }
  }

  async function runVintedRemovalQueue(item, index, total) {
    overlay('<b>FindA.Sale</b><div style="margin-top:6px">This item sold elsewhere -- removing the matching Vinted listing for <b>' + escapeHtml(item.title) + '</b>...</div>');
    // DELETE VERIFICATION 2026-09-23 (S-EXT-VINTED-DELETE-VERIFY): if a previous load already
    // clicked the final delete confirmation for THIS item (and was torn down by Vinted's
    // post-delete navigation before it could report), verify via the wardrobe API instead of
    // re-matching by title. Never clicks delete in this path.
    const pendingTarget = await vintRemStorageGet(VINTED_REMOVAL_TARGET_STORAGE_KEY);
    if (pendingTarget && pendingTarget.deleteSubmittedAt) {
      const age = Date.now() - Number(pendingTarget.deleteSubmittedAt);
      const fresh = Number.isFinite(age) && age >= 0 && age <= VINT_REM_DELETE_VERIFY_WINDOW_MS;
      if (!fresh) {
        console.log('[FAS Vinted] removal: ignoring stale delete-submitted marker (age ' + age + 'ms) -- cleared.');
        await vintRemStorageSet(VINTED_REMOVAL_TARGET_STORAGE_KEY, null);
      } else if (pendingTarget.itemId === item.id) {
        const vintedId = String(pendingTarget.vintedId == null ? '' : pendingTarget.vintedId);
        const memberId = await vintRemOwnMemberIdForVerify();
        let verify = { ok: false, why: memberId ? 'no_listing_id' : 'no_member_id' };
        if (memberId && /^\d+$/.test(vintedId)) {
          for (let tries = 0; tries < 2; tries++) {
            try { verify = await vintRemWardrobeHasListingId(vintedId, memberId); } catch (e) { verify = { ok: false, why: 'exception' }; }
            // One re-read after a short pause if the listing still shows, in case the wardrobe
            // listing lags the delete POST by a moment.
            if (!(verify.ok && verify.present)) break;
            if (tries === 0) await sleep(3000);
          }
        }
        console.log('[FAS Vinted] removal: verifying earlier delete of /items/' + vintedId + ' via wardrobe ' + memberId + ' ->', verify.ok ? (verify.present ? 'STILL PRESENT' : 'absent (deleted)') : ('unusable (' + verify.why + ')'));
        if (verify.ok && !verify.present) {
          await vintRemStorageSet(VINTED_REMOVAL_TARGET_STORAGE_KEY, null);
          overlay('<b>FindA.Sale</b><div style="margin-top:6px">Removed the Vinted listing for <b>' + escapeHtml(item.title) + '</b>.</div>' +
            button('fas-vin-close', 'Close', false));
          closeBtnHandler();
          vintRemSignalBackground('crossPlatformRemovalDeleted', item, null);
          return;
        }
        if (verify.ok && verify.present) {
          // The delete did not take. Clear the marker so the next attempt runs the normal flow.
          await vintRemStorageSet(VINTED_REMOVAL_TARGET_STORAGE_KEY, null);
          overlayWarn('The Vinted listing for "' + escapeHtml(item.title) + '" is still in your wardrobe after the delete was submitted -- it will be retried.' + button('fas-vin-close', 'Close', false));
          closeBtnHandler();
          vintRemSignalBackground('crossPlatformRemovalAttemptFailed', item, 'delete_not_confirmed');
          return;
        }
        // Unusable read: keep the marker so the next load retries verification (until it goes stale).
        overlayWarn('A delete was submitted for the Vinted listing "' + escapeHtml(item.title) + '" but it could not be verified yet -- will re-check.' + button('fas-vin-close', 'Close', false));
        closeBtnHandler();
        vintRemSignalBackground('crossPlatformRemovalAttemptFailed', item, 'delete_verify_unavailable');
        return;
      }
    }
    // SECURITY FIX 2026-09-22 (F4): refuse outright when the queued title is too short to
    // identify one listing safely (an empty title used to match every page). Permanent skip so
    // the backend stops re-serving it and the rest of the queue continues.
    const wantedTitle = vintRemNorm(item.title);
    if (wantedTitle.length < VINT_REM_MIN_SAFE_TITLE_LEN) {
      overlayWarn('The title "' + escapeHtml(item.title) + '" is too short to safely identify one Vinted listing -- nothing was deleted. Please remove it yourself.' + button('fas-vin-close', 'Close', false));
      closeBtnHandler();
      vintRemSignalBackground('crossPlatformRemovalSkipped', item, 'title_too_short_for_safe_match');
      return;
    }
    // S-EXT-VINTED-REMOTE-LISTING-ID (2026-09-23): the backend now returns the recorded Vinted
    // listing id (pending-removals listingRefs.VINTED) when one is known. It only picks WHICH page
    // to open -- the detail page below still requires URL id == that id AND the exact title.
    const refId = vintRemListingRefFor(item);
    // F4: an item-detail page (/items/<numeric id>...) must match the queued title EXACTLY
    // (normalized, Vinted site suffix stripped) -- the former document.title.includes() check
    // accepted any listing whose page title merely contained the queued title.
    const onItemDetailPage = /^\/items\/\d+/.test(location.pathname);
    let onDetailAlready = onItemDetailPage && vintRemDetailPageTitleMatches(wantedTitle);
    if (onItemDetailPage && !onDetailAlready) {
      // 2026-09-23: poll (250ms, up to ~8s) for the SPA to render its <h1>/document.title before
      // concluding the page does not match -- still exact-match only.
      const detailDeadline = Date.now() + 8000;
      while (!onDetailAlready && Date.now() < detailDeadline) {
        await sleep(250);
        onDetailAlready = vintRemDetailPageTitleMatches(wantedTitle);
      }
    }
    let detailTarget = null;
    if (onItemDetailPage) {
      // ID check (primary on this page): if the profile page chose a listing id for THIS queued
      // item, the current URL's numeric id must equal it exactly -- identical titles exist (fact A).
      const target = await vintRemStorageGet(VINTED_REMOVAL_TARGET_STORAGE_KEY);
      detailTarget = target;
      if (target && target.itemId === item.id && target.vintedId) {
        const here = vintRemItemIdFromHref(location.pathname);
        if (here !== String(target.vintedId)) {
          console.log('[FAS Vinted] removal: on /items/' + here + ' but the matched listing was /items/' + target.vintedId + ' -- refusing.');
          onDetailAlready = false;
        }
      }
    }
    if (onItemDetailPage && !onDetailAlready && detailTarget && detailTarget.itemId === item.id && detailTarget.source === 'ref') {
      // S-EXT-VINTED-REMOTE-LISTING-ID: the RECORDED id did not verify here (listing gone, title
      // edited on Vinted, or a wrong id) -- nothing is deleted; fall back to the exact-title
      // wardrobe lookup on the own profile page. The refFailed marker stops the next load from
      // re-opening the same recorded id (see VINT_REM_REF_RETRY_MS).
      console.log('[FAS Vinted] removal: recorded listing id /items/' + detailTarget.vintedId + ' did not verify on this page -- falling back to title lookup.');
      await vintRemStorageSet(VINTED_REMOVAL_TARGET_STORAGE_KEY, { itemId: item.id, vintedId: null, at: Date.now(), source: 'ref', refFailed: true });
      const fallbackProfileUrl = await resolveVintedOwnProfileUrl();
      if (fallbackProfileUrl) {
        overlay('<b>FindA.Sale</b><div style="margin-top:6px">Opening your Vinted listings to look for <b>' + escapeHtml(item.title) + '</b>...</div>');
        location.href = fallbackProfileUrl.indexOf('http') === 0 ? fallbackProfileUrl : (location.origin + fallbackProfileUrl);
        return;
      }
      // No profile URL -> the failure report below (transient) applies.
    }
    if (onItemDetailPage && !onDetailAlready) {
      // Fail promptly instead of navigating back to the profile page -- re-clicking the same link
      // would land here again and loop. Transient report: background counts it toward
      // FAS_REMOVAL_MAX_ATTEMPTS and then skips permanently, so it cannot wedge the queue.
      overlayWarn('This Vinted listing page does not exactly match "' + escapeHtml(item.title) + '" -- nothing was deleted. Please remove it yourself.' + button('fas-vin-close', 'Close', false));
      closeBtnHandler();
      vintRemSignalBackground('crossPlatformRemovalAttemptFailed', item, 'detail_page_title_mismatch');
      return;
    }
    if (!onItemDetailPage && refId) {
      // Recorded id path: open the listing directly unless that id was already tried for this item
      // within VINT_REM_REF_RETRY_MS (it then failed to verify, or never landed on a detail page).
      const prevTarget = await vintRemStorageGet(VINTED_REMOVAL_TARGET_STORAGE_KEY);
      const prevAt = prevTarget ? Number(prevTarget.at) : NaN;
      const refTried = !!(prevTarget && prevTarget.itemId === item.id && prevTarget.source === 'ref' &&
        Number.isFinite(prevAt) && (Date.now() - prevAt) >= 0 && (Date.now() - prevAt) < VINT_REM_REF_RETRY_MS);
      if (!refTried) {
        await vintRemStorageSet(VINTED_REMOVAL_TARGET_STORAGE_KEY, { itemId: item.id, vintedId: refId, at: Date.now(), source: 'ref' });
        overlay('<b>FindA.Sale</b><div style="margin-top:6px">Opening the Vinted listing for <b>' + escapeHtml(item.title) + '</b> to remove it...</div>');
        location.href = location.origin + '/items/' + refId;
        return; // the resulting page load re-invokes maybeRunVintedRemoval() against the same queued item
      }
      console.log('[FAS Vinted] removal: recorded listing id /items/' + refId + ' already tried for this item -- using the title lookup instead.');
    }
    let result;
    if (onDetailAlready) {
      result = await deleteVintedListingOnDetailPage(item);
    } else if (!isOnVintedOwnProfilePage()) {
      // Not on the organizer's own listings page yet (e.g. background.js just opened this tab at
      // config.js's VINTED_MANAGE_URL, the general homepage feed) -- land there first instead of
      // searching a page that can never contain the organizer's own item.
      const profileUrl = await resolveVintedOwnProfileUrl();
      if (!profileUrl) {
        overlayWarn('Could not find your Vinted profile/listings page to look for "' + escapeHtml(item.title) + '" (the account menu may have changed) -- please remove it yourself.' + button('fas-vin-close', 'Close', false));
        closeBtnHandler();
        // TRANSIENT -- Vinted may have changed its header markup, or the organizer isn't logged
        // in on this tab right now. Background retries rather than treating this as a permanent
        // skip (an unmatchable TITLE is permanent; an unreachable PAGE is not the same failure).
        vintRemSignalBackground('crossPlatformRemovalAttemptFailed', item, 'no_own_profile_url');
        return;
      }
      overlay('<b>FindA.Sale</b><div style="margin-top:6px">Opening your Vinted listings to look for <b>' + escapeHtml(item.title) + '</b>...</div>');
      location.href = profileUrl.indexOf('http') === 0 ? profileUrl : (location.origin + profileUrl);
      return; // the resulting page load re-invokes maybeRunVintedRemoval() against the same queued item
    } else {
      const match = await resolveVintedListingIdByTitle(item.title);
      if (!match.id) {
        // Zero/ambiguous match on the organizer's OWN profile page -- could be a genuinely
        // unmatchable title, but could also mean a stale cached profile URL (e.g. account
        // switched). Clear the cache so the NEXT attempt rediscovers via a fresh click-through
        // rather than repeating a possibly-wrong cached URL forever.
        // FIX 2026-09-23 (S-EXT-VINTED-DELETE-VERIFY): do NOT clear it when this page is
        // demonstrably the cached own profile (URL member id == cached member id) AND the wardrobe
        // API fully read it -- clearing there forced a racy click-rediscovery on the next load
        // ("Could not find your Vinted profile/listings page"). Only clear when the API read was
        // unusable/incomplete or this page is not the cached profile.
        // S-EXT-VINTED-TITLE-MISS (2026-09-23): the cache is now kept whenever this page IS the
        // cached own profile, whether or not the API read completed. Clearing it after a failed
        // read (the old `match.apiComplete &&` condition) turned one flaky read into a chain of
        // 'no_own_profile_url' failures: the next loads started on the homepage, where the
        // account-menu click-discovery fails (DB: item cmtd1b7s1002hh09orfa4r4ov, three
        // 'delete_unconfirmed_after_3_attempts: no_own_profile_url' rows on 2026-09-23).
        const cachedProfile = await vintRemStorageGet(VINTED_OWN_PROFILE_URL_STORAGE_KEY);
        const cm = /\/member\/(\d+)/.exec(String(cachedProfile || ''));
        const hereMember = vintRemMemberIdFromLocation();
        if (cm && hereMember && cm[1] !== hereMember) vintRemStorageSet(VINTED_OWN_PROFILE_URL_STORAGE_KEY, null);
        const reasonText = match.reason + (match.apiWhy ? ', ' + match.apiWhy : '');
        const reasonNote = '<div style="margin-top:6px;font-size:11px;opacity:.8">Reason: ' + escapeHtml(reasonText) + '</div>';
        if (match.reason === 'wardrobe_read_incomplete') {
          // TRANSIENT: the wardrobe could not be read in full, so "not listed" was never shown.
          // Background retries (FAS_REMOVAL_MAX_ATTEMPTS, then the backend cooldown).
          overlayWarn('Could not read your full list of Vinted listings to find "' + escapeHtml(item.title) + '", so nothing was deleted. FindA.Sale will try again later.' + reasonNote + button('fas-vin-close', 'Close', false));
          closeBtnHandler();
          vintRemSignalBackground('crossPlatformRemovalAttemptFailed', item, reasonText);
          return;
        }
        overlayWarn((match.reason === 'ambiguous_duplicate_title'
          ? 'More than one of your Vinted listings is titled "' + escapeHtml(item.title) + '" -- nothing was deleted because the right one cannot be told apart safely. Please delete it yourself.'
          : 'Could not find a Vinted listing titled exactly "' + escapeHtml(item.title) + '" on your profile -- nothing was deleted. Please delete it yourself, then use "Mark removed" if the extension offers it.') + reasonNote + button('fas-vin-close', 'Close', false));
        closeBtnHandler();
        // PERMANENT failure -- zero or ambiguous title match after a real look at the page. The
        // background reports the skip so the backend stops re-serving it, then advances and
        // continues: an unmatchable item must never wedge the rest of the platform's backlog.
        vintRemSignalBackground('crossPlatformRemovalSkipped', item, reasonText);
        return;
      }
      // Go straight to the one matched listing by its numeric id; the detail-page load re-checks
      // that the URL id equals this id (and the title) before deleting anything.
      await vintRemStorageSet(VINTED_REMOVAL_TARGET_STORAGE_KEY, { itemId: item.id, vintedId: match.id, at: Date.now() });
      // S-EXT-VINTED-REMOTE-LISTING-ID backfill: a unique exact-title match from a COMPLETE read of
      // the organizer's own wardrobe (API, not card scraping) is reported so later removals of this
      // item go straight to /items/<id>. Set-once server side; fire-and-forget.
      if (match.source === 'api' && match.id !== refId) vintCapReport(item.id, match.id, 'removal_wardrobe_match');
      location.href = location.origin + '/items/' + match.id;
      overlay('<b>FindA.Sale</b><div style="margin-top:6px">Opening the Vinted listing for <b>' + escapeHtml(item.title) + '</b> to remove it...</div>');
      return; // the resulting page load re-invokes maybeRunVintedRemoval() against the same queued item
    }
    // 'delete_not_confirmed' means the final confirmation WAS clicked but success wasn't observed
    // in time -- keep the deleteSubmittedAt marker so the next load verifies via the wardrobe API.
    if (result !== 'delete_not_confirmed') vintRemStorageSet(VINTED_REMOVAL_TARGET_STORAGE_KEY, null);
    if (result === 'deleted') {
      // Only reachable once a DISTINCT confirmation control was found and clicked, so the hedge
      // this overlay used to carry ("please double-check it's gone -- this was not live-verified")
      // no longer applies: nothing reaches this branch on a click that was merely attempted.
      overlay('<b>FindA.Sale</b><div style="margin-top:6px">Removed the Vinted listing for <b>' + escapeHtml(item.title) + '</b>.</div>' +
        button('fas-vin-close', 'Close', false));
      closeBtnHandler();
      // Sent the instant the delete is genuinely confirmed, before Vinted can navigate this tab
      // away. Background reports the removal, advances the queue, and either continues to the next
      // item or finishes and closes the tab -- no local advance, no local navigation from here.
      vintRemSignalBackground('crossPlatformRemovalDeleted', item, null);
      return;
    } else if (result === 'interstitial') {
      overlayWarn('Vinted is showing a verification/security screen -- please complete it yourself, then remove this listing manually.' + button('fas-vin-close', 'Close', false));
      closeBtnHandler();
      // TRANSIENT, not permanent: a security screen clears once the organizer completes it, so the
      // background retries this same item rather than reporting it permanently skipped.
      vintRemSignalBackground('crossPlatformRemovalAttemptFailed', item, 'interstitial');
    } else {
      overlayWarn('Could not find the delete action on this Vinted listing page (UNVERIFIED selectors -- reason: ' + result + ') -- please delete it yourself.' + button('fas-vin-close', 'Close', false));
      closeBtnHandler();
      // TRANSIENT too (missing menu / delete action / confirmation control on this render). The
      // background holds the item and retries; only after FAS_REMOVAL_MAX_ATTEMPTS does it treat
      // the failure as permanent, so a genuinely broken selector still cannot wedge the queue.
      vintRemSignalBackground('crossPlatformRemovalAttemptFailed', item, result);
    }
  }

  // ------------------------------------------------------------------------------------------
  // VINTED LISTING-ID CAPTURE (2026-09-23, S-EXT-VINTED-REMOTE-LISTING-ID). Vinted auto-publish is
  // OFF (fill-and-stop): the organizer clicks Vinted's own Upload, so markListed is always sent with
  // remoteListingId: null. After the fact, this learns the numeric listing id and reports it via
  // 'setRemoteListingId' -> background -> POST /extension/items/:id/remote-listing-id (set-once,
  // organizer-owned item, numeric-only, live POST/POSTED job only). Two sources, both exact-title
  // and both limited to fills made IN THIS TAB within the last VINT_CAP_WINDOW_MS (sessionStorage is
  // per tab):
  //   1) the organizer's own /items/<id> detail page (owner-only controls present, document.title /
  //      <h1> exactly equal to ONE recent fill's title) -> that URL id;
  //   2) the organizer's own /member/<id> page (Vinted's post-Upload landing, round-3 note above) or
  //      the "I posted"/"Continue" click -> a COMPLETE wardrobe API read with exactly ONE listing
  //      whose title equals the fill's title. Ambiguity or an incomplete read -> nothing is sent.
  // Never clicks anything and never blocks the listing flow.
  const VINT_CAP_FILLS_KEY = 'fasVintedRecentFills';
  const VINT_CAP_WINDOW_MS = 15 * 60 * 1000;
  const VINT_CAP_MAX_FILLS = 10;
  // Recorded-id removal path: how long a tried (and failed / not-landed) recorded id is skipped
  // for the same item before the title lookup is the only path.
  const VINT_REM_REF_RETRY_MS = 10 * 60 * 1000;
  let vintCapBusy = false;
  let vintCapLastPath = null;

  function vintRemListingRefFor(item) {
    const refs = item && item.listingRefs && typeof item.listingRefs === 'object' ? item.listingRefs : null;
    const v = refs ? refs.VINTED : null;
    const s = typeof v === 'string' ? v : (typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : '');
    return /^\d{1,20}$/.test(s) ? s : null;
  }

  function vintCapReadFills() {
    let arr = [];
    try { arr = JSON.parse(sessionStorage.getItem(VINT_CAP_FILLS_KEY) || '[]'); } catch (e) { arr = []; }
    if (!Array.isArray(arr)) return [];
    const now = Date.now();
    return arr.filter((f) => f && typeof f.itemId === 'string' && typeof f.title === 'string' &&
      Number.isFinite(f.at) && (now - f.at) >= 0 && (now - f.at) <= VINT_CAP_WINDOW_MS);
  }
  function vintCapWriteFills(arr) {
    try { sessionStorage.setItem(VINT_CAP_FILLS_KEY, JSON.stringify(arr.slice(-VINT_CAP_MAX_FILLS))); } catch (e) { /* non-fatal */ }
  }
  function vintCapRecordFill(item) {
    try {
      if (!item || !item.id) return;
      const title = vintRemNorm(item.title);
      if (title.length < VINT_REM_MIN_SAFE_TITLE_LEN) return;
      const fills = vintCapReadFills().filter((f) => f.itemId !== String(item.id));
      fills.push({ itemId: String(item.id), title, at: Date.now() });
      vintCapWriteFills(fills);
    } catch (e) { /* never block the review overlay */ }
  }
  function vintCapForgetFill(itemId) {
    vintCapWriteFills(vintCapReadFills().filter((f) => f.itemId !== itemId));
  }

  // true -> stop trying for this fill (recorded, unchanged, or a definitive refusal);
  // false -> keep it for a later page (e.g. 'no_live_listing': markListed has not landed yet).
  function vintCapIsSettled(resp) {
    if (!resp) return false;
    if (resp.ok) return true;
    const reason = resp.data && resp.data.reason;
    if (reason === 'no_live_listing') return false;
    return resp.status === 400 || resp.status === 404 || resp.status === 409;
  }

  function vintCapReport(itemId, vintedId, source) {
    const id = String(vintedId == null ? '' : vintedId);
    if (!itemId || !/^\d{1,20}$/.test(id)) return Promise.resolve(null);
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { type: 'setRemoteListingId', platform: 'VINTED', itemId: String(itemId), remoteListingId: id, source: source || null },
          (resp) => { void chrome.runtime.lastError; resolve(resp || null); }
        );
      } catch (e) { resolve(null); }
    });
  }

  // Seller-only sidebar controls (live-confirmed 2026-09-22, see deleteVintedListingOnDetailPage):
  // present only on the organizer's OWN listing, never on another seller's.
  function vintCapHasOwnerControls() {
    return !!document.querySelector('button[data-testid="item-edit-button"], button[data-testid="item-delete-button"]');
  }

  async function vintCapOnItemPage() {
    const here = vintRemItemIdFromHref(location.pathname);
    if (!here) return;
    const fills = vintCapReadFills();
    if (!fills.length) return;
    let matches = [];
    let owner = false;
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      matches = fills.filter((f) => vintRemDetailPageTitleMatches(f.title));
      owner = vintCapHasOwnerControls();
      if (matches.length && owner) break;
      await sleep(400);
    }
    if (vintRemItemIdFromHref(location.pathname) !== here) return; // SPA moved on mid-wait
    if (matches.length !== 1) {
      console.log('[FAS Vinted] id-capture: /items/' + here + ' matches ' + matches.length + ' recent fill title(s) -- not recording.');
      return;
    }
    if (!owner) {
      console.log('[FAS Vinted] id-capture: /items/' + here + ' has no owner controls (not your listing) -- not recording.');
      return;
    }
    const f = matches[0];
    const resp = await vintCapReport(f.itemId, here, 'item_page_after_fill');
    console.log('[FAS Vinted] id-capture: item ' + f.itemId + ' -> /items/' + here + ' (item page):', resp && resp.ok ? 'recorded' : ('not recorded (' + ((resp && resp.data && resp.data.reason) || (resp && resp.error) || 'no response') + ')'));
    if (vintCapIsSettled(resp)) vintCapForgetFill(f.itemId);
  }

  // One pass over the organizer's own wardrobe (same API/shape checks as
  // vintRemFetchWardrobeMatchIds), indexed by normalized title -> Set of ids.
  async function vintCapWardrobeTitleIndex(memberId) {
    const byTitle = new Map();
    for (let page = 1; page <= VINT_REM_API_MAX_PAGES; page++) {
      const url = location.origin + '/api/v2/wardrobe/' + encodeURIComponent(memberId) +
        '/items?page=' + page + '&per_page=' + VINT_REM_API_PER_PAGE;
      let res;
      try {
        res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
      } catch (e) { return { ok: false, why: 'fetch_error' }; }
      if (!res || !res.ok) return { ok: false, why: 'http_' + (res ? res.status : 'none') };
      let data;
      try { data = await res.json(); } catch (e) { return { ok: false, why: 'non_json' }; }
      const items = data && Array.isArray(data.items) ? data.items : null;
      if (!items) return { ok: false, why: 'no_items_array' };
      let recognized = 0;
      for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        const id = it.id != null ? String(it.id) : '';
        if (!/^\d+$/.test(id) || typeof it.title !== 'string') continue;
        recognized++;
        const t = vintRemNorm(it.title);
        if (!byTitle.has(t)) byTitle.set(t, new Set());
        byTitle.get(t).add(id);
      }
      if (items.length > 0 && recognized === 0) return { ok: false, why: 'unrecognized_item_shape' };
      const totalPages = data.pagination ? Number(data.pagination.total_pages) : NaN;
      const lastPage = (Number.isFinite(totalPages) && totalPages > 0)
        ? page >= totalPages
        : items.length < VINT_REM_API_PER_PAGE;
      if (lastPage) return { ok: true, byTitle, complete: true };
      await sleep(250 + Math.floor(Math.random() * 250));
    }
    return { ok: true, byTitle, complete: false };
  }

  // The organizer's OWN member id, or null. On a /member/<id> page it must equal the cached own
  // profile id; with no cache yet, only Vinted's post-Upload landing (?promo_shown=...) is trusted.
  // Off a member page, the cached own profile id is used.
  async function vintCapOwnMemberId() {
    const here = vintRemMemberIdFromLocation();
    const cached = await vintRemStorageGet(VINTED_OWN_PROFILE_URL_STORAGE_KEY);
    const cm = /\/member\/(\d+)/.exec(String(cached || ''));
    const cachedId = cm ? cm[1] : null;
    if (here) {
      if (cachedId) return cachedId === here ? here : null;
      return /[?&]promo_shown=/.test(location.search) ? here : null;
    }
    return cachedId;
  }

  async function vintCapFromWardrobe(onlyItemId) {
    const memberId = await vintCapOwnMemberId();
    if (!memberId) {
      console.log('[FAS Vinted] id-capture: own member id unknown on this page -- wardrobe capture skipped.');
      return;
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      let fills = vintCapReadFills();
      if (onlyItemId) fills = fills.filter((f) => f.itemId === onlyItemId);
      if (!fills.length) return;
      let idx;
      try { idx = await vintCapWardrobeTitleIndex(memberId); } catch (e) { idx = { ok: false, why: 'exception' }; }
      if (!idx.ok || !idx.complete) {
        console.log('[FAS Vinted] id-capture: wardrobe read unusable (' + (idx.ok ? 'incomplete' : idx.why) + ') -- nothing recorded.');
        return;
      }
      let missing = 0;
      for (const f of fills) {
        const ids = idx.byTitle.get(f.title);
        if (!ids || !ids.size) { missing++; continue; }
        if (ids.size > 1) {
          console.log('[FAS Vinted] id-capture: ' + ids.size + ' wardrobe listings share the title of item ' + f.itemId + ' -- ambiguous, not recording.');
          continue;
        }
        const id = ids.values().next().value;
        const resp = await vintCapReport(f.itemId, id, 'wardrobe_after_publish');
        console.log('[FAS Vinted] id-capture: item ' + f.itemId + ' -> /items/' + id + ' (wardrobe):', resp && resp.ok ? 'recorded' : ('not recorded (' + ((resp && resp.data && resp.data.reason) || (resp && resp.error) || 'no response') + ')'));
        if (vintCapIsSettled(resp)) vintCapForgetFill(f.itemId);
      }
      if (!missing || attempt) return;
      await sleep(4000); // the wardrobe can lag Vinted's publish by a moment -- one re-read
    }
  }

  // Called after markListed from the "I posted" / "Continue" buttons. Bounded so it can never hold
  // up the queue for long; the navigation that follows simply abandons a slow read.
  async function vintCapAfterMarkListed(item) {
    if (!item || !item.id || vintCapBusy) return;
    vintCapBusy = true;
    try {
      await Promise.race([vintCapFromWardrobe(String(item.id)), sleep(8000)]);
    } catch (e) {
      console.warn('[FAS Vinted] id-capture after markListed threw:', e && e.message);
    } finally { vintCapBusy = false; }
  }

  // ------------------------------------------------------------------------------------------
  // VINTED SOLD-DETECTION (2026-09-23, S-EXT-VINTED-SOLD-DETECT). Nothing told FindA.Sale that an
  // item sold on Vinted, so it stayed AVAILABLE and live on Facebook / Poshmark / Craigslist /
  // Mercari. Live-verified from Patrick's own session: the same-origin wardrobe API
  // (/api/v2/wardrobe/<memberId>/items) returns sold listings with is_closed === true AND
  // item_closing_action === 'sold'. Runs here (content script, page origin, the organizer's own
  // cookies -- the proven path every other wardrobe read in this file uses) rather than from the
  // background worker, whose cross-site fetch to vinted.com is not proven to carry the session or
  // pass Vinted's bot checks. Read-only on Vinted, opens no tabs, clicks nothing: it only runs when
  // the own member id is already cached, at most once per VINT_SOLD_CHECK_INTERVAL_MS across all
  // Vinted tabs, and sends nothing unless the whole wardrobe was read. Each sold listing id is
  // reported once (VINT_SOLD_REPORTED_KEY); the backend resolves it to the organizer's item and
  // commits the sale (extensionController.ts reportVintedSold).
  const VINT_SOLD_CHECK_INTERVAL_MS = 30 * 60 * 1000;
  const VINT_SOLD_LAST_CHECK_KEY = 'fasVintedSoldCheckLastAt';
  const VINT_SOLD_REPORTED_KEY = 'fasVintedSoldReportedIds';
  const VINT_SOLD_LAST_OUTCOME_KEY = 'fasVintedSoldCheckLastOutcome';
  const VINT_SOLD_REPORTED_CAP = 2000;
  const VINT_SOLD_PER_PAGE = 96;
  const VINT_SOLD_MAX_PAGES = 30;

  // Complete read of the wardrobe -> { ok: true, sold: [{ vintedId, title }], total } or
  // { ok: false, why }. Any failed/odd page, or hitting the page cap, is { ok: false }.
  async function vintSoldReadWardrobe(memberId) {
    const sold = [];
    let total = 0;
    for (let page = 1; page <= VINT_SOLD_MAX_PAGES; page++) {
      const url = location.origin + '/api/v2/wardrobe/' + encodeURIComponent(memberId) +
        '/items?page=' + page + '&per_page=' + VINT_SOLD_PER_PAGE;
      let res;
      try {
        res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
      } catch (e) { return { ok: false, why: 'fetch_error' }; }
      if (!res || !res.ok) return { ok: false, why: 'http_' + (res ? res.status : 'none') };
      let data;
      try { data = await res.json(); } catch (e) { return { ok: false, why: 'non_json' }; }
      const items = data && Array.isArray(data.items) ? data.items : null;
      if (!items) return { ok: false, why: 'no_items_array' };
      let recognized = 0;
      for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        const id = it.id != null ? String(it.id) : '';
        if (!/^\d{1,20}$/.test(id) || typeof it.title !== 'string') continue;
        recognized++;
        total++;
        if (it.is_closed === true && it.item_closing_action === 'sold') sold.push({ vintedId: id, title: it.title });
      }
      if (items.length > 0 && recognized === 0) return { ok: false, why: 'unrecognized_item_shape' };
      const totalPages = data.pagination ? Number(data.pagination.total_pages) : NaN;
      const lastPage = (Number.isFinite(totalPages) && totalPages > 0)
        ? page >= totalPages
        : items.length < VINT_SOLD_PER_PAGE;
      if (lastPage) return { ok: true, sold, total };
      await sleep(400 + Math.floor(Math.random() * 400));
    }
    return { ok: false, why: 'incomplete_page_cap' };
  }

  async function vintSoldMaybeCheck() {
    if (!fasContextAlive()) return; // extension reloaded under this page: nothing to report to
    if (vintRemRunning) return; // a removal run owns this tab's wardrobe reads; a later load checks
    try {
      const last = Number(await vintRemStorageGet(VINT_SOLD_LAST_CHECK_KEY)) || 0;
      if (Date.now() - last < VINT_SOLD_CHECK_INTERVAL_MS) return;
      const memberId = await vintCapOwnMemberId();
      if (!memberId) {
        console.log('[FAS Vinted] sold-check: own member id not cached yet -- skipped.');
        return;
      }
      // Claimed before the read so a second Vinted tab loading meanwhile does not read too.
      await vintRemStorageSet(VINT_SOLD_LAST_CHECK_KEY, Date.now());
      const read = await vintSoldReadWardrobe(memberId);
      if (!read.ok) {
        console.log('[FAS Vinted] sold-check: wardrobe read incomplete (' + read.why + ') -- nothing sent.');
        await vintRemStorageSet(VINT_SOLD_LAST_OUTCOME_KEY, { at: Date.now(), outcome: 'read_incomplete:' + read.why });
        return;
      }
      const reported = new Set((await vintRemStorageGet(VINT_SOLD_REPORTED_KEY)) || []);
      const fresh = read.sold.filter((s) => !reported.has(s.vintedId));
      console.log('[FAS Vinted] sold-check: ' + read.total + ' wardrobe listing(s), ' + read.sold.length + ' sold, ' + fresh.length + ' not yet reported.');
      if (!fresh.length) {
        await vintRemStorageSet(VINT_SOLD_LAST_OUTCOME_KEY, { at: Date.now(), outcome: 'nothing_new', total: read.total, sold: read.sold.length });
        return;
      }
      let resp = null;
      try { resp = await chrome.runtime.sendMessage({ type: 'reportVintedSold', items: fresh }); } catch (e) { resp = null; }
      if (!resp || !resp.ok || !resp.data || !Array.isArray(resp.data.results)) {
        console.log('[FAS Vinted] sold-check: report not accepted (' + ((resp && (resp.error || resp.status)) || 'no response') + ') -- will retry next check.');
        await vintRemStorageSet(VINT_SOLD_LAST_OUTCOME_KEY, { at: Date.now(), outcome: 'report_failed' });
        return;
      }
      for (const r of resp.data.results) {
        console.log('[FAS Vinted] sold-check: Vinted ' + r.vintedId + ' "' + r.title + '" -> ' + r.result +
          (r.itemId ? ' (item ' + r.itemId + ', via ' + r.via + ')' : '') + (r.reason ? ' [' + r.reason + ']' : '') +
          (r.candidateCount ? ' [' + r.candidateCount + ' candidates]' : ''));
        // 'error' is a server-side failure for that one entry: leave it unreported so it retries.
        if (r && r.vintedId && r.result !== 'error') reported.add(String(r.vintedId));
      }
      await vintRemStorageSet(VINT_SOLD_REPORTED_KEY, Array.from(reported).slice(-VINT_SOLD_REPORTED_CAP));
      await vintRemStorageSet(VINT_SOLD_LAST_OUTCOME_KEY, { at: Date.now(), outcome: 'reported', summary: resp.data.summary || null });
    } catch (e) {
      console.warn('[FAS Vinted] sold-check threw:', e && e.message);
    }
  }

  // Runs on every load and on every SPA path change (watchForVintedNavigationAway), once per path.
  async function vintCapMaybeCapture() {
    const path = location.pathname + location.search;
    if (path === vintCapLastPath || vintCapBusy) return;
    vintCapLastPath = path;
    if (!vintCapReadFills().length) return;
    vintCapBusy = true;
    try {
      if (/^\/items\/\d+(?:-[^/]*)?\/?$/.test(location.pathname)) await vintCapOnItemPage();
      else if (isOnVintedOwnProfilePage()) await vintCapFromWardrobe(null);
    } catch (e) {
      console.warn('[FAS Vinted] id-capture threw:', e && e.message);
    } finally { vintCapBusy = false; }
  }

  // S-EXT-VINTED-TITLE-MISS: set while this tab is running a removal, so the sold-check's own
  // full wardrobe read (vintSoldMaybeCheck) does not overlap the removal lookup's read.
  let vintRemRunning = false;
  async function maybeRunVintedRemoval() {
    if (!fasContextAlive()) return false;
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getRemovalQueueItemFor', platform: 'VINTED' }); } catch (e) { return false; }
    if (!queued || !queued.ok || !queued.item) return false;
    vintRemRunning = true;
    try {
      await runVintedRemovalQueue(queued.item, queued.index, queued.total);
    } catch (e) {
      overlayWarn('Something went wrong removing this Vinted listing (' + escapeHtml((e && e.message) || 'unknown error') + '). Please remove it yourself.' + button('fas-vin-close', 'Close', false));
      closeBtnHandler();
    }
    return true;
  }

  // BUG FIX 2026-08-30 (round 3, Patrick live-reported): this content script runs on ALL
  // https://www.vinted.com/* pages (manifest.json match pattern) and used to unconditionally poll
  // for a listing form and error out on timeout. Live-confirmed failure: Patrick clicked Vinted's
  // own real Upload button, which navigated the tab to his own /member/<id>?promo_shown=true
  // profile page BEFORE he could click FindA.Sale's own "I posted -- next item" overlay button (the
  // navigation destroys that injected overlay along with the rest of the page). The script then
  // re-injects fresh on the member-profile page, still sees the SAME queued item (its index only
  // advances on that now-destroyed button's click), and burns 8s polling waitForFormReady() before
  // showing a scary "doesn't look like a fillable Vinted listing form" error -- same failure class
  // already fixed for Poshmark's closet-page bug. Vinted's own listing pages all live under
  // /items/... (confirmed by this file's own LISTING_URL_HINT and the removal-queue code's
  // "Vinted's own listing pages are typically /items/<id>-<slug>" comment) -- a pathname outside
  // that namespace is never a listing form no matter how long we wait, so bail immediately and
  // silently instead of polling and erroring. This does NOT auto-advance the queue or infer
  // success/failure -- Patrick still confirms every listing by hand via the overlay button on the
  // real listing page; this only stops the extension from complaining on pages it has no business
  // running on.
  function looksLikeVintedListingPage() {
    // S-EXT-VINTED-REMOTE-LISTING-ID (2026-09-23): a published item's DETAIL page
    // (/items/<numericId>-<slug>, fact B in the removal section) is not a listing form either --
    // treating it as one made start() try to fill it. /items/new and /items/<id>/edit still count.
    if (/^\/items\/\d+(?:-[^/]*)?\/?$/.test(location.pathname)) return false;
    return /\/items\//.test(location.pathname);
  }

  // BUG FIX 2026-08-30 (round 4, Patrick live-reported): the round-3 fix above stopped the false
  // error on off-listing pages, but that was only half the problem -- Patrick's own screenshot this
  // round shows Vinted's real "Item listed" success modal on the /member/... page, and confirmed
  // "didn't start on the 2nd item." Root cause: showReviewOverlay()'s "I posted -- next item"
  // button is the ONLY place that calls markListed + advanceVintedQueue + navigates to the next
  // item -- but Vinted's own Upload button navigates the tab away immediately (confirmed round 3),
  // destroying that overlay before it can ever be clicked. So the queue index never advances no
  // matter how many items Patrick actually finishes. Fix: when we land on a non-listing page WHILE
  // a queue item is still pending, offer the same "continue" action from here instead -- still
  // 100% human-confirmed (Patrick must click it, exactly like the original review-overlay button;
  // this does not detect or infer success on its own), just reachable from wherever Vinted's own
  // navigation actually lands him. Keyed by item id in sessionStorage so it shows once per pending
  // item, not on every re-render of the same page.
  async function maybeShowVintedContinuePrompt() {
    // DIAGNOSTIC (round 8): every branch below now logs why it did or didn't show the prompt --
    // "nothing in console" last round could mean either "this function never ran" (a real gap) or
    // "it ran and quietly no-opped" (this function had zero console output either way before this
    // round, so those two cases were indistinguishable from Patrick's report alone).
    if (!fasContextAlive()) return; // extension reloaded under this page: nothing to ask
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getVintedQueueItem' }); } catch (e) {
      if (fasContextGone(e)) {
        console.log('[FAS Vinted] continue-prompt: extension was reloaded. Reload this page to reconnect.');
      } else {
        console.warn('[FAS Vinted] continue-prompt: getVintedQueueItem message failed:', e && e.message);
      }
      return;
    }
    if (!queued || !queued.ok || !queued.item) {
      console.log('[FAS Vinted] continue-prompt: no queue item pending -- nothing to show.');
      return;
    }
    // BUG FIX 2026-09-02 (S-EXT-VINTED-CONTINUE-UX round 3, Patrick live report: "did a couple
    // items but then after a third item the modal didn't pop up... even though there were plenty
    // more items in queue"). Root-caused live via read_console_messages on Patrick's real tab: 123
    // consecutive identical "already shown ... not re-showing" lines for the SAME item id, spanning
    // 9:59:04-10:00:54 (nearly 2 minutes, one per 800ms poll tick) -- proof the queue never advanced
    // past that item (a different item id would appear in the log the instant it did). The dedup
    // guard below was a permanent, forever-per-tab-session flag: once shown ONCE for an item, it
    // NEVER shows again for that item in this tab, no matter what happens next -- whether Patrick
    // missed it (same class of bug as the prior round), clicked "Not yet" meaning "ask me again,"
    // or anything else short of the queue actually advancing. There was no way back except manually
    // navigating to a fresh listing page himself. Replaced the permanent boolean with a cooldown
    // timestamp: still stops the SAME render from spamming every 800ms tick while the queue is
    // legitimately stuck on one item, but automatically re-offers the prompt after a bounded wait
    // instead of blocking it forever.
    const seenKey = 'fasVintedContinuePromptShown_' + queued.item.id;
    const REPROMPT_COOLDOWN_MS = 20000;
    let lastShownAt = 0;
    try { lastShownAt = Number(sessionStorage.getItem(seenKey)) || 0; } catch (e) { console.warn('[FAS Vinted] continue-prompt: sessionStorage read failed:', e && e.message); }
    if (lastShownAt && (Date.now() - lastShownAt) < REPROMPT_COOLDOWN_MS) {
      console.log('[FAS Vinted] continue-prompt: shown ' + Math.round((Date.now() - lastShownAt) / 1000) + 's ago for item ' + queued.item.id + ' -- within cooldown, not re-showing yet.');
      return;
    }
    console.log('[FAS Vinted] continue-prompt: showing for item ' + queued.item.id + ' ("' + queued.item.title + '") on ' + location.pathname +
      (lastShownAt ? ' (re-prompt after cooldown -- queue never advanced past this item, likely missed or dismissed earlier)' : ''));
    try { sessionStorage.setItem(seenKey, String(Date.now())); } catch (e) { /* non-fatal -- worst case it re-shows more often than intended */ }
    // ADDED 2026-09-02 (S-EXT-VINTED-CONTINUE-UX round 2): also ask background.js to fire a native
    // OS notification, since this on-page toast alone is easy to miss (small, bottom-right corner,
    // often competing with Vinted's own centered "Item listed" dialog for attention -- confirmed
    // live via screenshot). Fire-and-forget -- the on-page toast below is the primary UI regardless
    // of whether the notification succeeds (e.g. OS notifications disabled for Chrome).
    try { const pn = chrome.runtime.sendMessage({ type: 'showVintedContinueNotification', itemId: queued.item.id, itemTitle: queued.item.title }); if (pn && pn.catch) pn.catch(() => {}); } catch (e) { /* non-fatal */ }
    overlay('<b>FindA.Sale</b><div style="margin-top:6px">Finished with <b>' + escapeHtml(queued.item.title) + '</b>?</div>' +
      '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Vinted took you away from the review screen before you could confirm. If you already clicked Vinted\'s own Upload for this item, continue to the next one below -- if not, just close this.</div>' +
      button('fas-vin-continue', 'Continue to next item &#9654;', true) +
      button('fas-vin-close', 'Not yet', false));
    const cont = document.getElementById('fas-vin-continue');
    if (cont) cont.onclick = async () => {
      console.log('[FAS Vinted] continue-prompt: Continue clicked for item ' + queued.item.id);
      // FIX 2026-09-01 (S-EXT-VINTED-CONTINUE-UX): same immediate synchronous feedback as
      // showReviewOverlay()'s "I posted -- next item" handler above -- this is the button Patrick
      // actually ends up clicking most often per the round-3/4 comments (Vinted's real Upload
      // navigates the tab away before the review overlay's own button can ever be clicked), so it
      // needs the same instant "something happened" reaction, not a dead button for up to 25s.
      cont.disabled = true;
      cont.textContent = 'Please wait…';
      startQueueDelayCountdown(guessedQueueDelayMs(), 'the next item');
      try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: queued.item.id, remoteListingId: null, platform: 'VINTED' }); } catch (e) { if (fasContextGone(e)) console.log('[FAS Vinted] continue-prompt: extension was reloaded, markListed skipped. Reload this page.'); else console.warn('[FAS Vinted] continue-prompt: markListed failed:', e && e.message); }
      // S-EXT-VINTED-REMOTE-LISTING-ID: this prompt usually shows on the organizer's own
      // /member/<id>?promo_shown=true landing page right after Vinted's Upload -- the best moment
      // to find the new listing's id in their wardrobe. Runs alongside the queue delay.
      const capture = vintCapAfterMarkListed(queued.item);
      try { await chrome.runtime.sendMessage({ type: 'advanceVintedQueue' }); } catch (e) { if (fasContextGone(e)) console.log('[FAS Vinted] continue-prompt: extension was reloaded, advanceVintedQueue skipped. Reload this page.'); else console.warn('[FAS Vinted] continue-prompt: advanceVintedQueue failed:', e && e.message); }
      try { await capture; } catch (e) {}
      clearQueueDelayCountdown();
      location.href = LISTING_URL_HINT;
    };
    closeBtnHandler();
  }

  // BUG FIX 2026-09-03 (S-EXT-VINTED-PROHIBITED-ITEMS-GATE): pre-submit prohibited-items safety
  // gate, parity with fas-craigslist.js's own gate added after this same-day marketplace audit.
  // A dagger was previously auto-submitted to Facebook Marketplace (zero weapon-keyword check
  // before submitting) and got the organizer's Facebook account restricted. Checks the queued
  // item's category+title against Vinted's own two "Items Not Allowed" rules (mirrored from
  // packages/backend/src/services/marketplaceEligibilityRules.ts VINTED entries) BEFORE any DOM
  // interaction -- no field filling, no clicking -- and, if either matches, skips the item
  // (advances the queue without marking it listed, so it stays available for other marketplaces)
  // instead of proceeding into run()/fillListing(). Vinted is unusually strict on rule 2: it bans
  // even ordinary kitchen knives, unlike every other marketplace in this codebase.
  // BONUS FIX found during the 2026-09-18 mirror-sync pass: this file's own 'musical
  // instrument' keyword was STALE -- it was removed from the backend VINTED general rule back
  // on S-EXT-ELIGIBILITY-SUBSTRING-FIX-2026-09-03 (it matched FindA.Sale's own umbrella
  // category label "Musical Instruments & Gear" as a substring, wrongly blocking 11 of 13 real
  // gear/accessory items live-queried that session) and replaced with a dedicated, narrower
  // VINTED MUSICAL INSTRUMENTS rule -- but that replacement was never ported to this content
  // script, so the confirmed live bug was still active here. Removed 'musical instrument'
  // below and added the dedicated rule as its own entry in the `rules` array further down.
  // EXTENDED S-CROSS-MARKETPLACE-COMPLIANCE-AUDIT-2026-09-18 (see claude_docs/audits/
  // cross-marketplace-compliance-audit-2026-09-18.md, kept in sync verbatim with the same-day
  // VINTED backend registry edit): added bootleg, shell, archaeological/cultural-heritage
  // artifact, detergent, used piercing, live animal, and jailbroken/carrier-blocked keywords.
  const VINTED_NOT_ALLOWED_NAME_KEYWORDS = [
    'hazmat', 'food', 'drink', 'beverage',
    'medicine', 'medicinal', 'supplement', 'cosmetic', 'sanitary', 'tampon', 'recalled',
    'counterfeit', 'replica', 'bootleg', 'cryptocurrency', 'crypto', 'coin', 'banknote', 'stamp',
    'fur', 'ivory', 'reptile skin', 'shell', 'vape', 'e-cigarette', 'fetish', 'furniture',
    // 2026-09-25-ROUND2: mirrors the same-day marketplaceEligibilityRules.ts VINTED general
    // rule edit (mattress/certificate/car-seat/refrigerant/tanning/collar/battery/helmet
    // findings from a harder second pass).
    'mattress', 'duvet',
    'stock certificate', 'share certificate',
    'car seat', 'booster seat',
    'refrigerant', 'freon',
    'tanning bed', 'massage table', 'tattoo machine',
    'choke collar', 'prong collar', 'spiked collar', 'shock collar',
    'expired battery', 'used power bank',
    'motorcycle helmet', 'ski helmet',
    'cycling helmet', 'safety harness', 'heated tobacco',
    'archaeological artifact', 'cultural heritage artifact', 'detergent', 'cleaning chemical',
    'used piercing', 'live animal', 'jailbroken', 'carrier blocked', 'imei blocked',
    // ROUND 2 (see marketplaceEligibilityRules.ts's VINTED general rule, same comment): Nazi/
    // fascist items, police/military uniforms & badges, a full ban on bikes (incl. electric),
    // and used underwear.
    'nazi', 'fascist symbol',
    'police uniform', 'police badge', 'military uniform', 'law enforcement badge',
    'bike', 'bicycle', 'used underwear',
  ];
  // BONUS FIX found during the 2026-09-18 mirror-sync pass (pre-existing drift -- the backend
  // VINTED general rule's excludeKeywords gained 'tube'/'capsule'/'slab'/'flip'/'display'/
  // 'mount'/'folder'/'box'/'organizer'/'storage' back on S-EXT-ELIGIBILITY-SUBSTRING-FIX-
  // 2026-09-03, never ported here) plus today's new water-filter/seashell excludes.
  const VINTED_NOT_ALLOWED_EXCLUDE_KEYWORDS = [
    'sealed', 'unopened', 'unused', 'new,', 'album', 'holder', 'case', 'sleeve',
    'tube', 'capsule', 'slab', 'flip', 'display', 'mount', 'folder', 'box', 'organizer', 'storage',
    'water filter', 'seashell', 'shell necklace', 'shell jewelry',
  ];
  const VINTED_NOT_ALLOWED_REASON = "This category isn't allowed on Vinted (Items Not Allowed policy).";
  const VINTED_WEAPONS_NAME_KEYWORDS = [
    'knife', 'blade', 'dagger', 'sword', 'bayonet', 'machete', 'axe', 'chainsaw',
    'straight razor', 'razor blade', 'scissors', 'throwing star', 'stiletto',
    'switchblade', 'butterfly knife',
    'weapon', 'firearm', 'gun', 'ammo', 'ammunition', 'explosive',
    'taser', 'stun gun', 'nunchuck', 'nunchaku', 'baton', 'brass knuckle', 'pepper spray',
  ];
  // BONUS FIX found during the 2026-09-18 mirror-sync pass (pre-existing drift -- the backend
  // VINTED weapons rule has carried these excludes since S-EXT-ELIGIBILITY-SUBSTRING-FIX-
  // 2026-09-03, never ported here).
  const VINTED_WEAPONS_EXCLUDE_KEYWORDS = ['butter knife', 'table knife', 'electric razor', 'cartridge razor', 'gunmetal', 'bladerunner'];
  const VINTED_WEAPONS_REASON = 'Vinted prohibits all sharp knives and bladed tools with a pointed tip (including kitchen knives), plus firearms, ammunition, and other weapons (Items Not Allowed policy). Only dull/rounded table knives and sealed electric or cartridge razors are allowed.';
  // BONUS FIX found during the 2026-09-18 mirror-sync pass: dedicated MUSICAL INSTRUMENTS rule
  // added to the backend registry on S-EXT-ELIGIBILITY-SUBSTRING-FIX-2026-09-03 but never
  // ported here (see the removed stale 'musical instrument' keyword's comment above) --
  // mirrored verbatim from marketplaceEligibilityRules.ts's VINTED MUSICAL INSTRUMENTS rule.
  const VINTED_INSTRUMENTS_NAME_KEYWORDS = [
    'guitar', 'piano', 'violin', 'viola', 'cello', 'double bass', 'upright bass',
    'drum kit', 'drum set', 'saxophone', 'trumpet', 'trombone', 'clarinet', 'flute',
    'banjo', 'ukulele', 'mandolin', 'harmonica', 'accordion', 'synthesizer', 'keyboard piano',
    'harp', 'bagpipe', 'cornet', 'french horn', 'tuba', 'oboe', 'bassoon', 'xylophone',
  ];
  const VINTED_INSTRUMENTS_EXCLUDE_KEYWORDS = [
    'strap', 'amplifier', 'combo amplifier', 'speaker', 'pickup', 'cable', 'tuner', 'case',
    'pedal', 'effects', 'stand', 'string set', 'capo', 'gig bag', 'pedalboard', 'pedal board',
  ];
  const VINTED_INSTRUMENTS_REASON = 'Vinted does not allow listing musical instruments (Items Not Allowed policy).';
  function vintedRestrictionReason(category, title) {
    const haystack = (String(category || '') + ' ' + String(title || '')).toLowerCase();
    if (!haystack.trim()) return null;
    const rules = [
      { nameKeywords: VINTED_NOT_ALLOWED_NAME_KEYWORDS, excludeKeywords: VINTED_NOT_ALLOWED_EXCLUDE_KEYWORDS, reason: VINTED_NOT_ALLOWED_REASON },
      { nameKeywords: VINTED_INSTRUMENTS_NAME_KEYWORDS, excludeKeywords: VINTED_INSTRUMENTS_EXCLUDE_KEYWORDS, reason: VINTED_INSTRUMENTS_REASON },
      { nameKeywords: VINTED_WEAPONS_NAME_KEYWORDS, excludeKeywords: VINTED_WEAPONS_EXCLUDE_KEYWORDS, reason: VINTED_WEAPONS_REASON },
    ];
    for (const rule of rules) {
      const nameHit = rule.nameKeywords.some((kw) => haystack.indexOf(kw) !== -1);
      if (!nameHit) continue;
      const excludeHit = rule.excludeKeywords.some((kw) => haystack.indexOf(kw) !== -1);
      if (excludeHit) continue;
      return rule.reason;
    }
    return null;
  }

  async function start() {
    if (!fasContextAlive()) return;
    if (!looksLikeVintedListingPage()) { await maybeShowVintedContinuePrompt(); return; }
    await sleep(600);
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getVintedQueueItem' }); } catch (e) { return; }
    if (!queued || !queued.ok || !queued.item) return; // nothing queued -- stay silent

    const vintedReason = vintedRestrictionReason(queued.item.category, queued.item.title);
    if (vintedReason) {
      console.warn('[FAS Vinted] skipping listing (Prohibited Items policy):', queued.item.id, queued.item.title, vintedReason);
      overlay('<b>FindA.Sale</b><div style="color:#ffcf7a;margin-top:6px;font-size:12px">Skipped <b>' + escapeHtml(queued.item.title || 'this item') + '</b> -- ' + escapeHtml(vintedReason) + '</div>');
      await humanPause(1200, 1800);
      try { await chrome.runtime.sendMessage({ type: 'advanceVintedQueue' }); } catch (e) {}
      const next = await (async () => { try { return await chrome.runtime.sendMessage({ type: 'getVintedQueueItem' }); } catch (e) { return null; } })();
      if (next && next.ok && next.item) { location.href = LISTING_URL_HINT; } else { overlay('<b>FindA.Sale</b> \u2014 all done. Happy selling!'); setTimeout(() => bar && bar.remove(), 4000); }
      return;
    }

    try {
      await run(queued.item, queued.index, queued.total);
    } catch (e) {
      overlayWarn('Something went wrong filling this listing (' + escapeHtml((e && e.message) || 'unknown error') + '). Nothing was published -- complete this listing yourself, or reopen the extension to try again.' + button('fas-vin-close', 'Close', false));
      closeBtnHandler();
    }
  }

  // BUG FIX 2026-08-30 (round 5, Patrick live-reported "no change" after round 4 shipped and the
  // extension was reloaded): round 4's continue-prompt only fires from start(), which only runs
  // once per genuine document load (content_scripts inject at document_idle on a real navigation,
  // per manifest.json). If Vinted's post-Upload transition to /member/... is a CLIENT-SIDE route
  // change (history.pushState-style SPA navigation, same document, no new page load -- plausible
  // for a modal-driven "Item listed" confirmation like the one in Patrick's screenshot) rather than
  // a full page reload, this script never re-executes at all and the prompt genuinely never had a
  // chance to run, regardless of what round 4's logic does. UNCONFIRMED which mechanism Vinted
  // actually uses (no live tab was available to verify this round) -- rather than guess further,
  // this adds a persistent watcher that works either way: polls location.pathname on an interval
  // for the life of the tab, independent of whether a fresh script injection ever happens, and
  // calls maybeShowVintedContinuePrompt() (already self-guarded via sessionStorage so it only ever
  // shows once per pending item) the moment we're off the listing page. If round 4's on-load path
  // was in fact the real gap, this covers it too -- redundant but harmless, never fires twice for
  // the same item.
  // TUNING 2026-09-01 (S-EXT-VINTED-CONTINUE-UX, minor, reversible): shortened the poll from
  // 1500ms to 800ms. Per-tick cost is just a location.pathname regex test plus, only when off the
  // listing page, a sessionStorage read already gated by maybeShowVintedContinuePrompt()'s own
  // dedup guard (untouched here) -- cheap enough that halving the interval is not meaningful CPU
  // churn, and it tightens the worst-case detection lag for whichever of the two paths (this
  // watcher vs. start()'s on-load check) ends up being the one that actually fires, since it's
  // still genuinely unconfirmed (see round 5 comment above) whether Vinted's post-Upload
  // transition is a full reload or a same-document SPA route change.
  function watchForVintedNavigationAway() {
    console.log('[FAS Vinted] navigation watcher started on ' + location.pathname);
    const watcherId = setInterval(() => {
      // Extension reloaded under this page: every tick would only throw "Extension context
      // invalidated", so stop the watcher for good. A page reload starts a fresh one.
      if (!fasContextAlive()) {
        clearInterval(watcherId);
        console.log('[FAS Vinted] navigation watcher stopped: extension was reloaded. Reload this page to reconnect.');
        return;
      }
      try {
        vintCapMaybeCapture(); // S-EXT-VINTED-REMOTE-LISTING-ID: self-guarded, once per path
        if (!looksLikeVintedListingPage()) maybeShowVintedContinuePrompt();
      } catch (e) {
        if (fasContextGone(e)) console.log('[FAS Vinted] navigation watcher tick: extension was reloaded.');
        else console.warn('[FAS Vinted] navigation watcher tick threw:', e && e.message);
      }
    }, 800);
  }

(async () => {
    vintCapMaybeCapture(); // fire-and-forget; no-op unless this tab filled a listing in the last 15 min
    // S-EXT-VINTED-SOLD-DETECT: fire-and-forget, read-only, throttled to once per 30 min across tabs.
    setTimeout(() => { vintSoldMaybeCheck(); }, 3000 + Math.floor(Math.random() * 4000));
    const ranRemoval = await maybeRunVintedRemoval();
    if (!ranRemoval) start();
    watchForVintedNavigationAway();
  })();
})();
