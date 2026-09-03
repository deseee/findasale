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
      try { await chrome.runtime.sendMessage({ type: 'advanceVintedQueue' }); } catch (e) {}
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
      // BUG FIX 2026-09-03 (Patrick live-reported: ISBN/Category now work but "no language get
      // selected"): live-confirmed this is the SAME category-conditional-field pattern as ISBN --
      // Vinted's Books/Comics category shows a Language field (real testid confirmed live:
      // "isbn-language_book-single-list-content", a searchable radio panel identical in shape to
      // Category/Brand/Condition) that this file never had any code for at all -- not a regression
      // from the ISBN/ordering fix, a pre-existing gap that only became visible once ISBN/Category
      // started working. No Item.language field exists in the schema (confirmed:
      // `grep -i language packages/database/prisma/schema.prisma` returns nothing) -- FindA.Sale's
      // catalog is overwhelmingly English-language US goods, so default to "English" here, the same
      // "no per-item signal -> most-defensible single real-option default" reasoning already used
      // for Material's Cotton fallback above. Live-verified end-to-end on Patrick's own real tab:
      // pickFromPanel('language', 'Language', 'English') opens the panel, types "English", the
      // filtered list shows a real "English" radio option, and clicking it sets the field and closes
      // the panel -- confirmed via screenshot before writing this, not assumed from Category/Brand's
      // pattern alone.
      // BUG FIX 2026-09-03 (Patrick live-reported: "now it's on a refresh loop with the modal"
      // immediately after the Save-button fix shipped): could not get a clean look at the live
      // cause -- Patrick's tab was genuinely mid-navigation on every check attempt (screenshot/
      // network tools both timed out with "page is busy or mid-navigation"), so this is a
      // mitigation, not a confirmed root-cause fix -- flagged as such, not dressed up as more
      // certain than it is. Ruled OUT one real candidate directly: Vinted's site-wide nav-bar
      // language switcher (`data-testid="language-selector-button"`, confirmed live on a fresh
      // vinted.com load) has no `aria-label` at all, so it can't be what openerByLabel('Language')
      // is matching via the aria-label path. Root cause of the actual reload is still unconfirmed.
      // Regardless of cause, this guard is safe and correct on its own merits: never touch the
      // field at all if it's already showing a real (non-placeholder) value -- most obviously
      // relevant if this run is a retry after an earlier attempt already set it correctly.
      // BUG FIX 2026-09-03 round 2 (Patrick: "the fill didn't finish... stop assuming" -- live-
      // traced this exact bug on his real tab, not guessed): the guard above used
      // openerByLabel('Language').textContent, but openerByLabel's FIRST-priority check is
      // `[aria-label="Language"]` -- confirmed live this attribute exists ONLY on the OPEN
      // radio-group panel (`<div role="group" aria-label="Language">` wrapping all ~42 language
      // radios), never on the real closed-state control. Confirmed live: once the panel is closed,
      // `document.querySelectorAll('[aria-label="Language"]').length === 0`. So whenever the panel
      // happened to already be open at the moment this guard ran (observed: Vinted appears to
      // sometimes auto-open it once Category resolves to a book-eligible leaf), the guard read the
      // OPEN GROUP's mashed-together option text (every radio's label concatenated with no
      // separator) instead of the real field state, misread that as "already a real value", and
      // skipped filling it entirely -- while the actual field was still sitting on the unfilled
      // "Select a language" placeholder the whole time. Also: even in the normal closed-state case
      // this fell through to a `<label for="language_book">` match resolving to a real
      // `<input id="language_book">` -- but inputs hold their displayed text in `.value`, never
      // `.textContent` (confirmed live: `.textContent` on that input is always ''), so the "already
      // set" check could never fire correctly for the actual real control either way. Fixed by
      // reading the one precise, confirmed-stable control directly: `#language_book`'s `.value`.
      const languageInput = document.getElementById('language_book');
      const existingLangText = languageInput ? norm(languageInput.value) : '';
      const langAlreadySet = existingLangText && existingLangText !== norm('Select a language');
      if (langAlreadySet) {
        console.log('[FAS Vinted] Language already shows "' + languageInput.value.trim() + '" -- leaving it untouched.');
      } else {
        const langOk = await pickFromPanel('language', 'Language', 'English');
        if (langOk) {
          warnings.push('Language: no per-item language on file -- defaulted to "English" (FindA.Sale catalog is virtually all English-language items). Correct if this item is actually in a different language.');
        } else {
          warnings.push('Language could not be filled automatically -- Vinted requires this for Books/Comics, please set it yourself.');
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
    if (item.price != null && isFinite(Number(item.price))) {
      let priceVal = Math.round(Number(item.price));
      if (priceVal < VINTED_MIN_PRICE || priceVal > VINTED_MAX_PRICE) {
        console.warn('[FAS Vinted] Price $' + priceVal + ' falls outside Vinted\'s platform-enforced $' + VINTED_MIN_PRICE + '-$' + VINTED_MAX_PRICE + ' range -- clamping rather than submitting an invalid value.');
        priceVal = Math.max(VINTED_MIN_PRICE, Math.min(VINTED_MAX_PRICE, priceVal));
      }
      await tryFill('Price', priceVal, (v) => fillVintedPrice(String(v)), warnings);
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
    if (item.price != null && isFinite(Number(item.price))) {
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
        const rePriceVal = Math.max(VINTED_MIN_PRICE, Math.min(VINTED_MAX_PRICE, Math.round(Number(item.price))));
        await fillVintedPrice(String(rePriceVal));
        if (vintedErrorStillShown()) warnings.push('Price shows a validation error that would not clear -- please check it manually before publishing.');
      }
    }
    // BUG FIX 2026-08-29 (S-EXT-VINTED-COLOR-BRAND-RELIABILITY): photosOk/injectPhotos() moved up to
    // right after Category (see comment there) -- no longer computed here.
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
  function vintRemNorm(s) { return String(s || '').toLowerCase().trim().replace(/\s+/g, ' '); }

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

  function vintRemFindButtonByText(text) {
    const wanted = vintRemNorm(text);
    const candidates = Array.from(document.querySelectorAll('button, a[role="button"], [role="menuitem"], a'));
    return candidates.find((el) => vintRemNorm(el.textContent).includes(wanted)) || null;
  }

  // UNVERIFIED -- Vinted's own listing pages are typically /items/<id>-<slug>; closet/wardrobe
  // pages list a seller's own active items as links. No live DOM confirmed this session.
  function findVintedListingLinkByTitle(title) {
    const wanted = vintRemNorm(title);
    const links = Array.from(document.querySelectorAll('a[href*="/items/"]'));
    const scored = links
      .map((a) => ({ a, t: vintRemNorm(a.textContent || a.getAttribute('title') || '') }))
      .filter((x) => x.t.length > 0);
    const exact = scored.filter((x) => x.t === wanted);
    if (exact.length === 1) return exact[0].a;
    const contains = scored.filter((x) => x.t.includes(wanted) || wanted.includes(x.t));
    if (contains.length === 1) return contains[0].a;
    return null; // zero or ambiguous matches -- never guess
  }

  // UNVERIFIED -- Vinted's item detail page for the seller's own listing typically exposes a
  // kebab/"..." menu (aria-label containing "menu" or "options") with a "Delete" action inside.
  async function deleteVintedListingOnDetailPage() {
    if (looksLikeInterstitial()) return 'interstitial';
    const kebab = document.querySelector('button[aria-label*="menu" i], button[aria-label*="options" i], [data-testid*="actions" i] button');
    if (!kebab) return 'no_menu_button';
    vintRemSyntheticClick(kebab);
    await sleep(400);
    const deleteBtn = vintRemFindButtonByText('Delete');
    if (!deleteBtn) return 'no_delete_action';
    vintRemSyntheticClick(deleteBtn);
    await sleep(400);
    // Vinted may show a confirmation step -- look for a second explicit confirm control.
    const confirmBtn = vintRemFindButtonByText('Delete') || vintRemFindButtonByText('Yes') || vintRemFindButtonByText('Confirm');
    if (confirmBtn) { vintRemSyntheticClick(confirmBtn); await sleep(400); }
    return 'attempted';
  }

  async function reportVintedRemoved(item) {
    try { await chrome.runtime.sendMessage({ type: 'markItemRemovedByRemoval', itemId: item.id, platform: 'VINTED' }); } catch (e) {}
    try { await chrome.runtime.sendMessage({ type: 'advanceRemovalQueueFor', platform: 'VINTED' }); } catch (e) {}
  }

  async function runVintedRemovalQueue(item, index, total) {
    overlay('<b>FindA.Sale</b><div style="margin-top:6px">This item sold elsewhere -- removing the matching Vinted listing for <b>' + escapeHtml(item.title) + '</b>...</div>');
    const onDetailAlready = /\/items\//.test(location.pathname) && vintRemNorm(document.title).includes(vintRemNorm(item.title));
    let result;
    if (onDetailAlready) {
      result = await deleteVintedListingOnDetailPage();
    } else {
      const link = findVintedListingLinkByTitle(item.title);
      if (!link) {
        overlayWarn('Could not find a Vinted listing matching "' + escapeHtml(item.title) + '" on this page (UNVERIFIED selectors) -- please delete it yourself, then use "Mark removed" if the extension offers it.' + button('fas-vin-close', 'Close', false));
        closeBtnHandler();
        try { await chrome.runtime.sendMessage({ type: 'advanceRemovalQueueFor', platform: 'VINTED' }); } catch (e) {}
        return;
      }
      link.click();
      overlay('<b>FindA.Sale</b><div style="margin-top:6px">Opening the Vinted listing for <b>' + escapeHtml(item.title) + '</b> to remove it...</div>');
      return; // the resulting page load re-invokes maybeRunVintedRemoval() against the same queued item
    }
    if (result === 'attempted') {
      await reportVintedRemoved(item);
      const more = (index + 1) < total;
      overlay('<b>FindA.Sale</b><div style="margin-top:6px">Removed the Vinted listing for <b>' + escapeHtml(item.title) + '</b> (please double-check it\'s gone -- this was not live-verified).</div>' +
        (more ? button('fas-vin-next', 'Next item &#9654;', true) : '') +
        button('fas-vin-close', 'Close', false));
      const next = document.getElementById('fas-vin-next');
      if (next) next.onclick = () => location.reload();
      closeBtnHandler();
    } else if (result === 'interstitial') {
      overlayWarn('Vinted is showing a verification/security screen -- please complete it yourself, then remove this listing manually.' + button('fas-vin-close', 'Close', false));
      closeBtnHandler();
    } else {
      overlayWarn('Could not find the delete action on this Vinted listing page (UNVERIFIED selectors -- reason: ' + result + ') -- please delete it yourself.' + button('fas-vin-close', 'Close', false));
      closeBtnHandler();
      try { await chrome.runtime.sendMessage({ type: 'advanceRemovalQueueFor', platform: 'VINTED' }); } catch (e) {}
    }
  }

  async function maybeRunVintedRemoval() {
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getRemovalQueueItemFor', platform: 'VINTED' }); } catch (e) { return false; }
    if (!queued || !queued.ok || !queued.item) return false;
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
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getVintedQueueItem' }); } catch (e) {
      console.warn('[FAS Vinted] continue-prompt: getVintedQueueItem message failed:', e && e.message);
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
    try { chrome.runtime.sendMessage({ type: 'showVintedContinueNotification', itemId: queued.item.id, itemTitle: queued.item.title }); } catch (e) { /* non-fatal */ }
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
      try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: queued.item.id, remoteListingId: null, platform: 'VINTED' }); } catch (e) { console.warn('[FAS Vinted] continue-prompt: markListed failed:', e && e.message); }
      try { await chrome.runtime.sendMessage({ type: 'advanceVintedQueue' }); } catch (e) { console.warn('[FAS Vinted] continue-prompt: advanceVintedQueue failed:', e && e.message); }
      clearQueueDelayCountdown();
      location.href = LISTING_URL_HINT;
    };
    closeBtnHandler();
  }

  async function start() {
    if (!looksLikeVintedListingPage()) { await maybeShowVintedContinuePrompt(); return; }
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
    setInterval(() => {
      try {
        if (!looksLikeVintedListingPage()) maybeShowVintedContinuePrompt();
      } catch (e) {
        console.warn('[FAS Vinted] navigation watcher tick threw:', e && e.message);
      }
    }, 800);
  }

(async () => {
    const ranRemoval = await maybeRunVintedRemoval();
    if (!ranRemoval) start();
    watchForVintedNavigationAway();
  })();
})();
