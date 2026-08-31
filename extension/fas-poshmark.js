/* FindA.Sale — content script on poshmark.com (listing-creation flow).
 * CODE-ONLY, UNTESTED (2026-08-18 dispatch): no Poshmark seller account exists to verify this
 * session, so every selector in this file is a best-effort guess built from public research, not
 * a live-confirmed DOM anchor. Follows the SAME hard rules as fas-selectors.js's Facebook
 * comment (ADR-084) and fas-craigslist.js/fas-gumtree-au.js's human-owns-verification boundary:
 *   1. NEVER select by an obfuscated/hashed CSS class -- only visible label text, aria-label,
 *      role, or structural anchors (headings, placeholder text).
 *   2. Auto-publish (clicking the final "List this listing" button) is a PRO/TEAMS-only, opt-in
 *      toggle threaded from popup.js -> background.js (fasPoshmarkAutoPublish) -> here, the SAME
 *      mechanism fas-craigslist.js already uses -- NOT a blanket "never" rule. Corrected
 *      2026-08-22 (S-EXT-AUTOPUBLISH-POLICY, Patrick-directed): this file previously hard-coded
 *      "never auto-click the final publish action, no toggle" for every organizer regardless of
 *      the 2026-07-17 locked decision (full automation including auto-publish is non-negotiable,
 *      PRO/TEAMS-only opt-in) -- that was a real deviation, not a faithful implementation of extra
 *      caution Patrick asked for. Research this session found no evidence Poshmark bans accounts
 *      for listing-automation software specifically (ToS technically prohibits "automated
 *      participation" but enforcement is essentially nonexistent; large crosslisting tools like
 *      Vendoo/List Perfectly/Crosslist/PrimeLister operate openly at scale). When the toggle is
 *      off (organizer's own choice, or an automatic fallback if the List This Listing button
 *      can't be found), this script still fills the form and stops exactly as before -- the
 *      organizer reviews and submits it themselves.
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
  // BUG FIX 2026-08-28 (S-EXT-POSHMARK-QUEUE-CONTINUATION-STALL, Patrick live report: "poshmark
  // stops at https://poshmark.com/closet/artifactm and never starts the 2nd item"): POST_URL_HINT
  // above was flagged UNVERIFIED from the day it was written and Patrick's real multi-item run just
  // confirmed it's wrong as a hard-navigation target -- location.href = POST_URL_HINT lands on the
  // closet page instead of the create-listing form (Poshmark is a SPA; a fresh full-page load of an
  // unrecognized/changed deep route redirects to a default page server-side, even if the SAME path
  // would work fine as a client-side route change from inside the already-loaded app). Root-caused
  // from the code, not guessed: SPA route mismatch on hard reload, not "the URL used to work and
  // stopped." Fix: never hard-navigate to a guessed URL for a mid-run continuation. Instead, find
  // Poshmark's own real "Sell" nav control (present in the persistent header on every logged-in
  // page, including the closet page we know for a fact renders) and .click() it so POSHMARK'S OWN
  // client-side router handles the transition exactly like a real user clicking it -- same
  // "never guess, read the real DOM" rule this whole file already follows everywhere else. Only
  // falls back to the old guessed URL (better than nothing) if no matching nav control is found at
  // all, and always warns the organizer either way so a wrong guess is never silent.
  function findPoshmarkSellNavLink() {
    const candidates = qa('a, button').filter((el) => el.offsetParent !== null);
    // Signal 1: exact-word "sell" as the ENTIRE visible text or aria-label (cheapest, most precise
    // -- matches a bare "Sell" control if Poshmark ever renders one that way).
    const byExactText = candidates.find((el) => norm(el.textContent) === 'sell' || norm(el.getAttribute('aria-label') || '') === 'sell');
    if (byExactText) { console.log('[FAS Poshmark] Sell nav control found via Signal 1 (exact text "sell").'); return byExactText; }
    // Signal 2: normalized text/aria-label CONTAINS "sell" as a whole word, capped at a short length
    // so this can't accidentally match a paragraph or unrelated block of copy that happens to mention
    // "sell" -- real nav controls are short labels. Patrick's 2026-08-29 live screenshot of the real
    // logged-in header shows the actual control text is "SELL ON POSHMARK" (with a leading $ icon),
    // not bare "Sell" -- exactly the case Signal 1 above can never match, and the reason Round 2
    // (byExactText only, with an href-regex fallback) fell through to the broken guessed-URL path
    // every time on Patrick's real re-test.
    const byContainsText = candidates.find((el) => {
      const text = norm(el.textContent);
      const aria = norm(el.getAttribute('aria-label') || '');
      return (text && text.length <= 40 && wordBoundaryHas(text, 'sell')) ||
        (aria && aria.length <= 40 && wordBoundaryHas(aria, 'sell'));
    });
    if (byContainsText) { console.log('[FAS Poshmark] Sell nav control found via Signal 2 (contains "sell", <=40 chars, e.g. "SELL ON POSHMARK").'); return byContainsText; }
    // Signal 3: an anchor whose own href already points at a listing-creation route, regardless of
    // its visible label (Poshmark may render an icon-only "Sell" control on some layouts) -- still a
    // real DOM anchor, not an invented URL.
    const byHrefPattern = candidates.find((el) => el.tagName === 'A' && /\/(create-listing|sell|listing\/create)(\/|$|\?)/i.test(el.getAttribute('href') || ''));
    if (byHrefPattern) { console.log('[FAS Poshmark] Sell nav control found via Signal 3 (href matches create-listing/sell route pattern).'); return byHrefPattern; }
    // Signal 4: broadest, least precise real-DOM signal -- any href, data-testid, data-test, or
    // aria-* attribute value containing "sell" case-insensitively (covers e.g. a
    // data-testid="sell-nav-link" hook, or an href containing "sell" that doesn't match Signal 3's
    // stricter route-shape regex). Still a real DOM attribute being read, never an invented value.
    const byLooseAttr = candidates.find((el) => {
      const href = el.getAttribute('href') || '';
      const testId = el.getAttribute('data-testid') || el.getAttribute('data-test') || '';
      const ariaAttrs = Array.from(el.attributes || []).filter((a) => a.name.indexOf('aria-') === 0).map((a) => a.value).join(' ');
      return /sell/i.test(href) || /sell/i.test(testId) || /sell/i.test(ariaAttrs);
    });
    if (byLooseAttr) { console.log('[FAS Poshmark] Sell nav control found via Signal 4 (loose href/data-testid/aria "sell" match).'); return byLooseAttr; }
    console.warn('[FAS Poshmark] All 4 Sell nav-control signals failed to find a match -- falling back to the UNVERIFIED guessed create-listing URL (see navigateToPoshmarkCreateListing).');
    return null;
  }
  // BUG FIX 2026-08-29 (S-EXT-POSHMARK-BOUNCE-RETRY, Patrick-directed, based on live evidence from
  // this session's direct test): navigateToPoshmarkCreateListing() (all 3 prior rounds) was never
  // actually the blocker -- a direct hard-nav to https://poshmark.com/sell DID land on the real,
  // fillable create-listing form and the extension DID start auto-filling real fields (Brand/
  // Condition/Size all populated correctly, confirmed live). A few seconds INTO that fill, the tab
  // navigated back to the closet page on its own -- Poshmark's own router/session check bouncing the
  // route, not a wrong selector on this file's side. Since this is a genuine full page
  // navigation/reload (confirmed by the fact the "doesn't look like a fillable form" message
  // reappeared, which only a FRESH run of this content script -- re-injected after a real page
  // unload -- can produce; a client-side-only SPA route change would not re-run this script at all),
  // any state needed to recognize "we're mid-attempt, this is a bounce" has to survive that reload.
  // Module-scope JS variables do not survive a page unload; sessionStorage does (same-origin,
  // persists for the tab's lifetime across navigations, cleared when the tab/window closes) -- used
  // here instead of a plain variable for exactly that reason.
  //
  // Patrick's own diagnosis, direct quote: "I think it's a thing that requires a wait or a poll so
  // once it's back on the closet page it then tries to navigate to create-listing again." This
  // implements exactly that: a small retry-with-backoff, capped at POSH_NAV_MAX_RETRIES, gated on a
  // marker written right before every navigateToPoshmarkCreateListing() call and read back on the
  // next page load's run() (see run()'s formState === 'timeout' branch below).
  //
  // Deliberately NOT cleared the instant the form is first confirmed loaded (waitForFormReady
  // returns 'ready') -- live evidence above shows the bounce happens A FEW SECONDS INTO FILLING,
  // after the form was already confirmed ready, so clearing this early would silently disable the
  // exact retry this feature exists for. Instead it stays live for POSH_NAV_BOUNCE_WINDOW_MS (long
  // enough to cover navigation + waitForFormReady's own up-to-8s wait + a realistic fill duration)
  // and is explicitly cleared only at a genuine terminal state for this item -- published, shown to
  // the organizer for manual review, or retries exhausted (see clearPoshNavRetryState() call sites:
  // showReviewOverlay's no-more-items branch, doPoshmarkAutoPublish's end-of-run branch, run()'s own
  // give-up path, and start()'s nothing-queued early return). A brand-new
  // navigateToPoshmarkCreateListing() call for the NEXT item naturally resets attempt back to 0 with
  // a fresh timestamp, so retries never leak across items.
  const POSH_NAV_RETRY_KEY = 'fasPoshmarkNavRetryState';
  const POSH_NAV_MAX_RETRIES = 3;
  const POSH_NAV_RETRY_BACKOFF_MS = [1500, 3000, 5000]; // wait before retry 1, 2, 3 respectively
  const POSH_NAV_BOUNCE_WINDOW_MS = 20000; // best-effort: nav + up to 8s form-ready wait + realistic fill time

  function readPoshNavRetryState() {
    try {
      const raw = sessionStorage.getItem(POSH_NAV_RETRY_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.ts !== 'number' || typeof parsed.attempt !== 'number') return null;
      return parsed;
    } catch (e) { return null; }
  }
  function writePoshNavRetryState(state) {
    try { sessionStorage.setItem(POSH_NAV_RETRY_KEY, JSON.stringify(state)); } catch (e) {
      // sessionStorage unavailable (rare -- e.g. privacy mode) -- fails safe: the next page load's
      // readPoshNavRetryState() just finds nothing and falls straight through to the pre-existing
      // give-up message, same behavior as before this feature existed.
      console.warn('[FAS Poshmark] Could not persist nav-retry state (sessionStorage unavailable) -- bounce retry will not work this run:', e && e.message);
    }
  }
  function clearPoshNavRetryState() {
    try { sessionStorage.removeItem(POSH_NAV_RETRY_KEY); } catch (e) { /* nothing to clean up if this throws */ }
  }

  // BUG FIX 2026-08-29 (S-EXT-POSHMARK-DUPLICATE-PUBLISH-CLICK, Patrick live-photographic-proof
  // this session: the SAME item -- "Speaker Cable (GP1 16/2 High Power Speaker Wire) - $10" --
  // appeared 4 TIMES in his real Poshmark closet grid AFTER the round-13 advancePoshmarkQueue
  // compare-and-swap fix had already shipped). Traced against background.js (read-only reference,
  // not modified): the round-13 CAS on 'advancePoshmarkQueue' only protects the STORED QUEUE INDEX
  // from being advanced twice for the same item -- it does nothing to stop THIS TAB from clicking
  // Poshmark's real "List this item" button more than once for the same item content in the first
  // place. background.js's own S-EXT-AUTOPUBLISH-REPORTING-NET header comment documents the
  // confirmed root cause of an EARLIER two-real-live-Poshmark-listing-IDs incident on this exact
  // platform: "if Poshmark's real post-publish behavior is a hard navigation (full page load)
  // rather than a client-side route change, the content script's execution context is destroyed at
  // that exact moment, and the async continuation (markListed, advanceQueue) may simply never run."
  // doPoshmarkAutoPublish's own waitForPoshmarkPublishConfirmation() below is exactly that async
  // continuation -- a polling loop awaiting sleep(400) in a while-loop, which silently stops
  // executing forever (not throws, not rejects -- just never resumes) if the frame that owns it is
  // torn down mid-poll. When that happens, markListed/advancePoshmarkQueue/
  // navigateToPoshmarkCreateListing() below never fire from THIS tab's own fast path at all.
  // background.js's chrome.tabs.onUpdated reliability net is meant to catch this via a SEPARATE,
  // independent report+advance -- but that net explicitly does NOT drive Poshmark's tab to the next
  // item's create-listing page (its own comment: "the other 3 platforms' own content scripts drive
  // their own next-item navigation ... their SPA-style publish doesn't destroy the JS context" --
  // which directly contradicts the very reason that net exists for Poshmark in the first place).
  // So whatever page Poshmark's own post-publish redirect naturally lands the tab on re-injects this
  // file fresh. If that happens before the net's own backend report has landed (a real, unbounded
  // network race -- reportItemListedOnce's apiFetch call has no guaranteed-fast completion time),
  // this file's OWN existing checkItemListedStatus() duplicate-guard in start() reads
  // marketplaceListedPoshmark=false (server hasn't caught up yet) and lets a brand-new run() through
  // -- and if the pre-existing bounce-retry marker (POSH_NAV_RETRY_KEY, still live from this exact
  // navigation) is also still within its window, run()'s own formState==='timeout' branch retries
  // navigating straight back into a fresh create-listing form for the SAME still-not-advanced queue
  // item, fillListing()+doPoshmarkAutoPublish() run again, and "List this item" gets clicked a
  // second (third, fourth...) time for identical content -- exactly Patrick's 4x screenshot.
  //
  // Fix: a second, itemId-scoped sessionStorage marker -- same durable-across-navigation mechanism
  // already proven for POSH_NAV_RETRY_KEY above -- written the INSTANT before (not after) the real
  // "List this item" click, i.e. at the single riskiest moment where a context-destroying navigation
  // could immediately follow. Unlike checkItemListedStatus, reading this marker back on the next
  // page load needs no network round-trip at all, so it can catch the exact race window the backend
  // check cannot: "did THIS tab already click publish for this exact item a few seconds ago, even if
  // the server doesn't know it yet." On a match, this file refuses to click publish again and hands
  // off to the organizer instead -- same "never guess, hand to a human" posture already used
  // everywhere else in this file (CAPTCHA hard-stop, ambiguous closet-card match, etc.) -- rather
  // than silently risking a real duplicate Poshmark listing a second time.
  const POSH_PUBLISH_ATTEMPT_KEY = 'fasPoshmarkPublishAttemptState';
  // Covers: the publish click itself + a possible context-destroying navigation + content-script
  // re-injection + this file's own 600ms start()-settle delay + waitForFormReady's own up-to-8s poll
  // + real network/render slop, with margin. Deliberately longer than POSH_NAV_BOUNCE_WINDOW_MS
  // since this guard must outlive a FULL bounce-retry cycle (up to POSH_NAV_MAX_RETRIES attempts),
  // not just one bounce.
  const POSH_PUBLISH_ATTEMPT_WINDOW_MS = 45000;
  function readPoshPublishAttemptState() {
    try {
      const raw = sessionStorage.getItem(POSH_PUBLISH_ATTEMPT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.ts !== 'number' || !parsed.itemId) return null;
      return parsed;
    } catch (e) { return null; }
  }
  function writePoshPublishAttemptState(itemId) {
    try { sessionStorage.setItem(POSH_PUBLISH_ATTEMPT_KEY, JSON.stringify({ itemId: itemId, ts: Date.now() })); } catch (e) {
      // Fails safe, same as writePoshNavRetryState's identical note -- if sessionStorage is
      // unavailable this guard simply can't protect this run; behavior degrades to exactly what it
      // was before this fix existed, never worse.
      console.warn('[FAS Poshmark] Could not persist publish-attempt state (sessionStorage unavailable) -- duplicate-publish guard will not work this run:', e && e.message);
    }
  }
  function clearPoshPublishAttemptState() {
    try { sessionStorage.removeItem(POSH_PUBLISH_ATTEMPT_KEY); } catch (e) { /* nothing to clean up if this throws */ }
  }

  // Accepts an optional retryAttempt number so a bounce-retry (see run()'s formState === 'timeout'
  // branch) can carry its attempt count forward; omitted/0 means "a fresh navigation attempt for a
  // (new) item," which is exactly what every pre-existing call site already means and correctly
  // resets the retry counter for that item.
  async function navigateToPoshmarkCreateListing(retryAttempt) {
    const attempt = retryAttempt || 0;
    writePoshNavRetryState({ ts: Date.now(), attempt: attempt });
    const sellLink = findPoshmarkSellNavLink();
    if (sellLink) {
      sellLink.click(); // SPA-safe: lets Poshmark's own router handle the route change
      return true;
    }
    console.warn('[FAS Poshmark] Could not find a real "Sell" nav control -- falling back to the UNVERIFIED guessed create-listing URL.');
    location.href = POST_URL_HINT;
    return false;
  }

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
  // FEATURE 2026-08-22 (S-EXT-POSHMARK-GENDER-HINT, Patrick-directed): before pickCategory falls
  // back to Poshmark's own first department in the list (items0[0], live-confirmed "Women" --
  // see pickCategory's own comment), check the item's title/description for an explicit
  // men's/women's/etc word first. wordBoundaryHas already guards against a substring landmine
  // (e.g. "men" being a literal substring of "women") -- reused here for the same reason. Checked
  // against `norm()`-lowercased text, so no case handling needed here. Returns null (no change in
  // behavior) when the text carries no such word -- this does NOT make every item resolve
  // correctly, only items that actually mention a gender somewhere.
  function detectPoshmarkGenderHint(text) {
    const t = norm(text);
    const womenWords = ['women', 'womens', 'woman', 'female', 'girls', 'girl'];
    const menWords = ['men', 'mens', 'man', 'male', 'boys', 'boy'];
    for (const w of womenWords) { if (wordBoundaryHas(t, w)) return 'Women'; }
    for (const w of menWords) { if (wordBoundaryHas(t, w)) return 'Men'; }
    return null;
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

  // ---- queue-advance countdown (2026-08-31, parity with fas-content.js/fas-craigslist.js's
  // countdown -- Patrick live report: Poshmark showed no indication anything was happening between
  // queued items, same gap Craigslist had before its own 2026-08-31 fix). Purely cosmetic --
  // background.js's own humanQueueDelay() pacing pause runs regardless of this; it only reflects
  // that same delay via a one-way 'fasQueueDelayStarted' notification (background.js's
  // advancePoshmarkQueue handler now passes the real tab id for this -- see that file's own
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
  // BUG FIX 2026-08-22 (S-EXT-POSHMARK-PRICE-ILLEGAL-INVOCATION, P0, Patrick live-console-report):
  // real console error captured on Patrick's live tab -- '[FAS Poshmark] Field "Price" -- error
  // while filling, skipped: Illegal invocation' -- and the visible listingPrice input confirmed
  // empty on that same tab afterward. "Illegal invocation" is the exact signature of calling a
  // native accessor with a `this` receiver its own realm doesn't recognize -- plausible here since
  // this content script's own `window.HTMLInputElement.prototype` (isolated world) is a distinct
  // object identity from the one the page's real elements are branded to (MAIN world), even though
  // `instanceof`/prototype-chain checks read as matching. Title/Description/Brand use this exact
  // same function and were NOT reported failing on Price's own bad run or the earlier confirmed-
  // successful run, so this isn't a categorical "the setter never works cross-world" case -- more
  // likely intermittent (timing-dependent element identity, e.g. Vue swapping the real node in
  // right as this ran). Rather than guess further without being able to execute as the isolated-
  // world script itself (the only context that can reproduce this) to confirm which theory is
  // right, made the fallback robust either way: if the native setter throws for ANY reason, fall
  // back to a plain assignment instead of leaving the field silently unset (previously any throw
  // here left Price -- a Poshmark-required field -- permanently blank for the whole run, which is
  // very likely why this run's Next-button sequence then failed to advance and fell back to the
  // manual-review overlay). Logs a specific warning if even the fallback assignment doesn't stick,
  // so a repeat failure is diagnosable from console output alone next time.
  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set;
    let set = false;
    if (setter) {
      try { setter.call(el, value); set = true; } catch (e) {
        console.warn('[FAS Poshmark] setNativeValue -- native setter threw (' + (e && e.message) + '), falling back to plain assignment.');
      }
    }
    if (!set) {
      try { el.value = value; set = (el.value === String(value)); } catch (e) {
        console.warn('[FAS Poshmark] setNativeValue -- plain assignment also failed:', e && e.message);
      }
    }
    if (!set) console.warn('[FAS Poshmark] setNativeValue -- could not set value on element (both native setter and plain assignment failed or did not stick).');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return set;
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
    // BUG FIX 2026-08-22 (S-EXT-POSHMARK-ISOLATED-WORLD, P0) -- see vueOpenDropdown's comment for
    // the full root cause. This parent-walk + el.__vue__ check can never find the Modal component
    // instance from this isolated-world script (same blind spot as Category/Size/Color); routed
    // through the MAIN-world bridge instead. The click-based fallback below is unchanged.
    const modalRes = await bridgeCall('closeVisibleModal', { el: closeBtn });
    console.log('[FAS Poshmark][catdbg] bridge closeVisibleModal result=', JSON.stringify(modalRes));
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
    // BUG FIX 2026-08-22 (S-EXT-POSHMARK-PRICE-ILLEGAL-INVOCATION): this used to ignore
    // setNativeValue's success/failure entirely and always return true, so a failed fill (the
    // "Illegal invocation" case) was reported to tryFill as a SUCCESS -- no warning was logged for
    // Price specifically at the point it actually mattered, and dismissSmartSellModal() ran anyway
    // even though there was no modal to dismiss (nothing had actually changed the price). Now
    // checks the real DOM value after the fact -- Poshmark's own VeeValidate binding can still
    // reformat/reject what was typed, so re-reading el.value is a more honest success signal than
    // trusting setNativeValue's own return alone.
    const set = setNativeValue(el, String(value));
    await sleep(150);
    const stuck = set && el.value !== '' && el.value != null;
    if (stuck) await dismissSmartSellModal();
    return stuck;
  }

  // Autocomplete field (Brand): type, wait for suggestions, click the best match. Falls back to
  // Poshmark's own "add custom brand" action if present (UNVERIFIED -- exact wording/selector for
  // that action has never been observed live); otherwise logs and skips rather than leaving a
  // half-typed value in the field.
  // BUG FIX 2026-08-29 (round 7, S-EXT-POSHMARK-BRAND-TIMING, Patrick-directed root cause): the
  // fixed sleep(700) below was already flagged UNVERIFIED as a best-effort guess. Patrick pointed
  // out fas-content.js already solved this exact class of bug with a poll-based waitFor() backed
  // by a MutationObserver (used throughout that file instead of guessing a fixed delay), and
  // fas-mercari.js has the same idiom via waitForSelector(). This file has no equivalent generic
  // by-text poll helper (waitForMenuItems() nearby is filter-based, built for menu item LISTS, not
  // a single by-text match with optionElByText()'s exact/word-boundary fallback), so a small local
  // poll is added here instead of reusing that one. Same fix philosophy: poll for the suggestion
  // to actually appear (checked every ~180ms up to 2.5s) instead of one fixed sleep then a single
  // synchronous check, which races Poshmark's real async suggestion-list render latency. TIMING fix
  // only -- optionElByText()'s own matching logic is unchanged. The "add custom brand" fallback
  // search and the final give-up logging below are unchanged, just now gated behind the poll's
  // result instead of the old fixed-sleep-then-check.
  async function waitForOptionByText(value, maxWaitMs) {
    const start = Date.now();
    while (true) {
      const match = optionElByText(value);
      if (match) return match;
      if (Date.now() - start >= maxWaitMs) return null;
      await sleep(180);
    }
  }
  // BUG FIX 2026-08-29 (S-EXT-POSHMARK-BRAND-FIELD-NOT-FOUND, Patrick live-console-report:
  // '[FAS Poshmark] Field "Brand" -- selector not found, skipped'): fieldByLabel/nearestControlAfter
  // is a single one-shot synchronous DOM query with no retry -- and Brand (see fillListing's call
  // order) is filled IMMEDIATELY after pickCategory() returns, which just spent several seconds
  // opening/closing Category's dropdown and drilling through department/leaf clicks, each
  // triggering its own Vue re-render, with no settle pause added before Brand's own lookup runs.
  // This is the same class of cross-field SPA-hydration race already found and fixed elsewhere in
  // this file (see pickCategory's own S-EXT-POSHMARK-CATEGORY-STALE-STATE / -SMARTSELL comments and
  // waitForFormReady's comment) -- but unlike those, only Brand's SUGGESTION-list lookup was ever
  // given poll-based robustness (waitForOptionByText, added round 7); the field-discovery step
  // itself never was. Ported the same small-poll idiom one step earlier: retry fieldByLabel every
  // ~150ms for up to 1.5s instead of one synchronous check taken right after Category's DOM churn.
  // Concrete, code-read evidence (call-order + one-shot-query-after-heavy-churn), not a guess --
  // still UNVERIFIED against a live account whether this specific report reproduces from exactly
  // this cause, since no live re-test confirmed it this session.
  async function waitForFieldByLabel(labelText, maxWaitMs) {
    const start = Date.now();
    while (true) {
      const el = fieldByLabel(labelText);
      if (el) return el;
      if (Date.now() - start >= maxWaitMs) return null;
      await sleep(150);
    }
  }
  async function fillAutocomplete(labelText, value) {
    const el = await waitForFieldByLabel(labelText, 1500);
    if (!el) return false;
    el.focus();
    setNativeValue(el, String(value));
    const match = await waitForOptionByText(value, 2500);
    if (match) { realClick(match); await sleep(200); return true; }
    const addCustom = qa('[role="option"], li, div[role="button"], button').find((n) => /add\s+.*brand|custom brand|create\s+"/.test(norm(n.textContent)));
    if (addCustom) { realClick(addCustom); await sleep(200); return true; }
    console.warn('[FAS Poshmark] Brand "' + value + '" had no matching suggestion and no "add custom brand" action was found (UNVERIFIED) -- left unset.');
    return false;
  }

  // BUG FIX 2026-08-22 (S-EXT-POSHMARK-ISOLATED-WORLD, P0, live-Chrome-confirmed root cause of
  // Category/Size/Color ALL failing to open on Patrick's real installed extension, despite every
  // test performed THIS SESSION succeeding): a diagnostic log added directly to this file and
  // captured from Patrick's real browser console confirmed `opener.__vue__` reads as `undefined`
  // inside this content script's real, installed execution --
  // `[FAS Poshmark][catdbg] opener.__vue__ typeof= undefined hasIsExpaned= false`. Root cause:
  // Chrome content scripts run in an ISOLATED JS world that shares the DOM with the page but NOT
  // custom JS properties/objects the page's own scripts attach to DOM elements (this file's
  // manifest.json entry had no "world" key, so it defaulted to ISOLATED). Poshmark's own Vue 2
  // runtime attaches `el.__vue__` from the PAGE's MAIN world -- invisible from here. Every test
  // performed this session used Chrome DevTools/CDP script injection, which runs in MAIN world
  // (where __vue__ IS visible) -- exactly why those tests always succeeded while the real
  // installed extension never could. Fix: fas-poshmark-bridge.js is a companion script declared
  // in manifest.json with "world": "MAIN" on the same match pattern -- it runs in the page's own
  // JS world (where __vue__ is visible) and relays results back via a CustomEvent request/
  // response pair on `window`.
  //
  // BUG FIX 2026-08-22 ROUND 2 (S-EXT-POSHMARK-BRIDGE-ELEMENT-PASSING, P0, live-Chrome-confirmed
  // via direct diagnostic listeners installed on Patrick's real tab, not a guess): the comment
  // above originally claimed "DOM element references cross the isolated/MAIN world boundary fine"
  // -- that was WRONG. Confirmed live: a bridge call with an empty payload (`getCatalogCommitState`,
  // `{}`) round-tripped perfectly, while every call that put a live DOM element in `payload.el`
  // (`openDropdown`/`closeDropdown`/`closeVisibleModal`) arrived at the MAIN-world listener with
  // `event.detail === null` -- the ENTIRE detail silently wiped, not merely the element field --
  // so the bridge's handler saw `action: undefined` and its error response never matched the
  // waiting requestId, timing out every single time. Chrome's cross-world CustomEvent delivery
  // appears to require detail to be plain, structured-clone-compatible data; a live DOM Element
  // reference breaks that silently instead of throwing. Fix: never put a DOM element in the event
  // detail at all. Instead, stamp the target element with a temporary, unique marker ATTRIBUTE
  // (plain DOM state, genuinely shared across worlds -- unlike a JS object reference) and send
  // only the marker STRING through the bridge; the MAIN-world side re-finds the exact same live
  // element via `document.querySelector` on that marker. The marker attribute is removed again
  // once the response comes back (or on timeout) so nothing is left behind on Poshmark's real DOM.
  function bridgeCall(action, payload, timeoutMs) {
    return new Promise((resolve) => {
      const requestId = 'fas-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      let done = false;
      let markerEl = null;
      let markerAttr = null;
      const sendPayload = {};
      if (payload) {
        for (const key in payload) {
          if (key === 'el') continue;
          sendPayload[key] = payload[key];
        }
        if (payload.el) {
          markerEl = payload.el;
          markerAttr = 'fas-bm-' + requestId;
          markerEl.setAttribute('data-fas-bridge-marker', markerAttr);
          sendPayload.elMarker = markerAttr;
        }
      }
      function cleanupMarker() {
        if (markerEl) {
          try { markerEl.removeAttribute('data-fas-bridge-marker'); } catch (e) { /* element may be gone -- fine */ }
        }
      }
      const timeout = setTimeout(() => {
        if (done) return;
        done = true;
        window.removeEventListener('fas-poshmark-vue-response', onResponse);
        cleanupMarker();
        resolve({ ok: false, error: 'bridge-timeout' });
      }, timeoutMs || 1500);
      function onResponse(e) {
        const detail = (e && e.detail) || {};
        if (detail.requestId !== requestId) return;
        if (done) return;
        done = true;
        clearTimeout(timeout);
        window.removeEventListener('fas-poshmark-vue-response', onResponse);
        cleanupMarker();
        resolve(Object.assign({ ok: true }, detail.result));
      }
      window.addEventListener('fas-poshmark-vue-response', onResponse);
      window.dispatchEvent(new CustomEvent('fas-poshmark-vue-request', { detail: { requestId: requestId, action: action, payload: sendPayload } }));
    });
  }

  // Opens Poshmark's custom Vue dropdown via the MAIN-world bridge above (the ONLY way this
  // isolated-world script can actually flip the component's `isExpaned` state). Falls back to
  // realClick() if the bridge can't confirm it opened -- matches this file's prior fallback shape,
  // though realClick was previously confirmed NOT to open this specific dropdown on its own (see
  // the ORIGINAL NOTE on openerByLabel above); kept only as a harmless last resort.
  async function vueOpenDropdown(opener) {
    const res = await bridgeCall('openDropdown', { el: opener });
    console.log('[FAS Poshmark][catdbg] bridge openDropdown result=', JSON.stringify(res));
    if (!res || !res.opened) {
      realClick(opener);
    }
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
  // FEATURE 2026-08-22 (S-EXT-POSHMARK-COLOR-FALLBACK, Patrick-directed: "guess and report", same
  // philosophy as the Category department default): Poshmark's real Color picker only offers 15
  // fixed swatches (Red/Pink/Orange/Yellow/Green/Blue/Purple/Gold/Silver/Black/Gray/White/Cream/
  // Brown/Tan, live-confirmed) -- a descriptive value like "Neon Green" or "Hot Pink" has no exact
  // match. First tries to pull a real swatch word out of the value itself (handles the common case
  // of a compound/descriptive color name); if truly no swatch word is present at all (e.g. a bare
  // "Neon" with no base color), falls back to "Black" as the most common, safest neutral default --
  // NOT invented at random, always reported in the run summary either way (see fillListing's use of
  // this), unlike Size which is never guessed (see fillListing's own comment on that distinction).
  function mapPoshmarkColorFallback(value) {
    const known = ['red', 'pink', 'orange', 'yellow', 'green', 'blue', 'purple', 'gold', 'silver', 'black', 'gray', 'white', 'cream', 'brown', 'tan'];
    const v = norm(value);
    for (const k of known) { if (wordBoundaryHas(v, k)) return k; }
    return 'black';
  }
  async function fillPoshmarkColor(value) {
    const section = findPoshmarkColorSection();
    if (!section) return false;
    const dropdown = section.querySelector('.dropdown');
    if (!dropdown || dropdown.children.length < 2) return false;
    const chipRow = dropdown.children[0];
    const tileGrid = dropdown.children[1];
    // BUG FIX 2026-08-22 (S-EXT-POSHMARK-ISOLATED-WORLD, P0) -- see vueOpenDropdown's comment
    // above for the full root cause. `dropdown.__vue__` is invisible from this isolated-world
    // script; routed through the same MAIN-world bridge used for Category/Size.
    if (!poshmarkColorPanelOpen(dropdown)) {
      const openRes = await bridgeCall('openDropdown', { el: dropdown });
      console.log('[FAS Poshmark][catdbg] color bridge openDropdown result=', JSON.stringify(openRes));
      if (!openRes || !openRes.opened) realClick(chipRow.querySelector('[data-et-name="color"]') || chipRow);
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
    // Close via the same MAIN-world bridge used to open -- live-confirmed (pre-isolated-world-fix)
    // this closes the panel reliably (menuEl display flips to "none"), unlike the broken 0x0
    // "Done" button.
    await bridgeCall('closeDropdown', { el: dropdown });
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
      // BUG FIX 2026-08-22 (S-EXT-POSHMARK-ISOLATED-WORLD, P0) -- see vueOpenDropdown's comment
      // for the full root cause. This qa('*') + el.__vue__ walk can never find a real Vue
      // instance from this isolated-world script; routed through the MAIN-world bridge instead.
      const catalogState = await bridgeCall('getCatalogCommitState', {});
      const committedNow = !!(catalogState && catalogState.committed);
      console.log('[FAS Poshmark][catdbg] otherFallback level', level, 'catalogFound=', !!(catalogState && catalogState.catalogFound), 'committedNow=', committedNow);
      if (committedNow) return true;
    }
    return false;
  }
  async function pickCategory(categoryText, breadcrumbText, genderHintText) {
    // BUG FIX 2026-08-22 (P0, Patrick-directed): used to return false immediately for an item with
    // no category at all, skipping the picker entirely -- but Size/Color/Condition are all locked
    // behind a committed category, so an item with no category ended up with none of those fields
    // fillable either. Falls through to the same picker + "Other" fallback below instead of bailing
    // early; an empty categoryText just means no scored candidate matches at any level, landing on
    // the "Other" fallback (pickOtherFallback above).
    const opener = openerByLabel('Category');
    if (!opener) {
      console.log('[FAS Poshmark][catdbg] opener NOT FOUND for "Category"');
      return { committed: false, confident: false };
    }
    const placeholderText = norm(opener.textContent);
    console.log('[FAS Poshmark][catdbg] opener found, text=', placeholderText.slice(0, 60));
    console.log('[FAS Poshmark][catdbg] opener.__vue__ typeof=', typeof opener.__vue__, 'hasIsExpaned=', !!(opener.__vue__ && 'isExpaned' in opener.__vue__));
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
    // FEATURE 2026-08-22 (S-EXT-POSHMARK-GENDER-HINT, Patrick-directed, live-Chrome-confirmed the
    // problem this addresses): a real "men's"/"women's" word found in the item's own title/
    // description is a much stronger signal than categoryText's generic fuzzy match, and unlike
    // the items0[0] default below, actually earns "confident" treatment (see deptWasGuessed below)
    // since it's a genuine match, not an arbitrary first-in-list guess. Placed FIRST so it wins
    // ties, but still goes through the normal scoring loop below rather than short-circuiting it.
    const genderHint = detectPoshmarkGenderHint(genderHintText || '');
    const departmentCandidates = [genderHint, ...breadcrumbSegments, categoryText].filter(Boolean);
    console.log('[FAS Poshmark][catdbg] genderHint=', genderHint, 'departmentCandidates=', departmentCandidates);
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
    // steered at all", exactly Patrick's report. Defaults to a real department instead of giving up
    // -- some department, even a guessed one, is required before ANY subcategory (including
    // "Other") can even be reached.
    // BUG FIX 2026-08-22 (S-EXT-POSHMARK-RUN-SUMMARY, Patrick-directed): was defaulting to
    // items0[0] (live-confirmed to be Poshmark's own list order, which put "Women" first) --
    // arbitrary, and biased every zero-signal item toward Women's sizing regardless of what it
    // actually was. Patrick: "should it not default to mens sizing? otherwise 90% of tee-shirts
    // other things that are gender neutral will just be stuck in limbo" -- defaults to "Men"
    // specifically when it's present in the real options, falling back to items0[0] only if a
    // "Men" entry genuinely isn't found (shouldn't happen on Poshmark's real 6-department list,
    // but never crash if it did). This is still a guess (deptWasGuessed stays true either way) --
    // see run()'s use of this flag for the run-summary note, not a publish-blocking gate anymore.
    const deptWasGuessed = !bestDept;
    if (!bestDept && items0.length) {
      const menOption = items0.find((el) => norm(el.textContent) === 'men');
      bestDept = menOption || items0[0];
    }
    console.log('[FAS Poshmark][catdbg] bestDept=', bestDept ? norm(bestDept.textContent) : null, 'deptWasGuessed=', deptWasGuessed);
    if (bestDept) { realClick(bestDept); pickedAny = true; await sleep(350); }
    const levelQueries = categoryText.split(':').map((s) => s.trim()).filter(Boolean);
    let remaining = (levelQueries.length > 1 ? levelQueries.slice(1) : levelQueries).map((seg, i) => ({ seg, i }));
    // BUG FIX 2026-08-31 (Patrick live report -- "Lamps" landed on "Home > Other" -- root-caused
    // live, not guessed: walked Poshmark's real picker directly. Home's real 14 subcats (Accents/
    // Art/Bath/Bedding/Design/Dining/Games/Holiday/Kitchen/Office/Party Supplies/Storage &
    // Organization/Wall Decor/Other) and Accents' real 12 leaves (Accent Pillows/Baskets & Bins/
    // Candles & Holders/Coffee Table Books/Curtains & Drapes/Decor/Door Mats/Faux Florals/
    // Furniture Covers/Lanterns/Picture Frames/Vases/None) confirmed live to have NO lighting/lamp
    // category anywhere -- "lamp" shares no word or >=3-char substring with any real leaf,
    // including "Lanterns", so the normal scoring loop correctly found nothing and "Other" was
    // the honest result, not a matching bug. Home > Accents > Decor is Poshmark's own general
    // catch-all leaf one level in from Other -- a real, specific, browsable bucket. Added as an
    // EXTRA scoring candidate only for this confirmed gap (lamp/lighting/fixture keywords under
    // Home) -- a real matching segment elsewhere still wins purely on score, this only helps when
    // nothing else would have matched anyway. Still lands with confident=false (goes through the
    // normal usedOtherFallback-style scoring, not a forced pick), so it's still surfaced to the
    // organizer for review, just with a more specific starting point than the bare department.
    if (bestDept && /home/.test(norm(bestDept.textContent)) && /\b(lamp|lamps|lighting|light fixture|chandelier|sconce)\b/i.test(categoryText)) {
      remaining.push({ seg: 'Accents', i: remaining.length });
      remaining.push({ seg: 'Decor', i: remaining.length });
    }
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
    // BUG FIX 2026-08-22 (S-EXT-POSHMARK-ISOLATED-WORLD, P0) -- see vueOpenDropdown's comment
    // for the full root cause. This qa('*') + el.__vue__ walk can never find a real Vue instance
    // from this isolated-world script; routed through the MAIN-world bridge instead.
    const catalogState = await bridgeCall('getCatalogCommitState', {});
    console.log('[FAS Poshmark][catdbg] pickCategory catalogState=', JSON.stringify(catalogState));
    const committed = !!(catalogState && catalogState.committed);
    // Always close the dropdown before returning, success or failure -- live-confirmed an
    // unclosed Category panel leaks its still-visible department/leaf <li> items into every
    // later field's global li/role query (this is exactly how Size's optionElByText('M') matched
    // a stray "Women" <li> left over from this panel instead of any real size option).
    const closeRes = await bridgeCall('closeDropdown', { el: opener });
    if (!closeRes || !closeRes.closed) realClick(opener);
    await sleep(250);
    if (!committed) {
      console.warn('[FAS Poshmark] Category "' + categoryText + '" -- nothing could be selected in the picker at all (UNVERIFIED taxonomy) -- left for the organizer to choose.');
      return { committed: false, confident: false };
    }
    // FEATURE 2026-08-22 (S-EXT-AUTOPUBLISH-POLICY, Patrick-directed live-Chrome-confirmed): a
    // guessed department or an "Other" fallback is NOT a confident match -- live-confirmed real
    // case (a men's Adidas tracksuit with no gender signal in its category/breadcrumb) landed on
    // "Women > Other" purely because that happened to be items0[0], Poshmark's first department in
    // the list. That is an acceptable stopgap for a HUMAN to review and correct before publishing
    // (which is exactly what happens when autoPublish is off), but auto-publish must never commit a
    // guessed department to a live Poshmark listing unreviewed -- see run()'s use of this flag.
    const confident = !(deptWasGuessed || usedOtherFallback);
    if (!confident) {
      console.warn('[FAS Poshmark] Category "' + categoryText + '" had no confident match against Poshmark\'s real taxonomy' + (usedOtherFallback ? ' -- fell back to "Other"' : ' -- department was guessed') + '. Review and correct the category before publishing.');
    }
    return { committed: true, confident: confident };
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

  // BUG FIX 2026-08-31 (Patrick live report: run stuck on Poshmark's own "Missing Price" dialog
  // on item 12/12, tab shared directly -- root-caused live, not guessed): fillListing() already
  // computes fillResult.fieldNotes, including a specific "Price could not be set..." note whenever
  // fillPoshmarkPrice() genuinely fails (see fillListing's own Price block) -- but this function
  // never received or rendered fieldNotes at all, in EITHER of its two call sites (the plain
  // manual-review path, and doPoshmarkAutoPublish's own fallback when the final publish button
  // can't be reached). The generic "category/brand/size/color are UNVERIFIED guesses" line doesn't
  // even mention Price, so a genuine Price-fill failure was completely invisible until Poshmark's
  // own required-field validation blocked the organizer with no context. Now takes fieldNotes and
  // renders them the same way doPoshmarkAutoPublish's own end-of-run notes rollup already does.
  function showReviewOverlay(item, index, total, photosOk, fieldNotes) {
    const more = (index + 1) < total;
    const notes = fieldNotes || [];
    const notesHtml = notes.length
      ? '<div style="margin-top:6px;font-size:12px;color:#ffcf7a"><ul style="margin:4px 0 0 16px;padding:0">' +
        notes.map((n) => '<li>' + escapeHtml(n) + '</li>').join('') + '</ul></div>'
      : '';
    overlay('<b>FindA.Sale</b><div style="margin-top:6px">Filled <b>' + escapeHtml(item.title) + '</b> as best we could.</div>' +
      '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Review every field (category/brand/size/color are UNVERIFIED guesses), then click Poshmark\'s own <b>List this item</b> yourself.</div>' +
      notesHtml +
      (!photosOk ? '<div style="color:#ffcf7a;margin-top:6px;font-size:12px">Photos may not have attached -- add them on this screen.</div>' : '') +
      button('fas-posh-next', more ? 'I posted — next item &#9654;' : 'I posted — done', true) +
      button('fas-posh-close', 'Close', false) +
      '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');
    const next = document.getElementById('fas-posh-next');
    if (next) next.onclick = async () => {
      try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: item.id, remoteListingId: null, platform: 'POSHMARK' }); } catch (e) {}
      try { await chrome.runtime.sendMessage({ type: 'advancePoshmarkQueue', itemId: item.id }); } catch (e) {}
      if (more) { await navigateToPoshmarkCreateListing(); } else { clearPoshNavRetryState(); clearPoshPublishAttemptState(); bar && bar.remove(); }
    };
    closeBtnHandler();
  }

  // FEATURE 2026-08-22 (S-EXT-AUTOPUBLISH-POLICY): auto-publish support -- see file header.
  // Finds a visible button by its exact visible text, never a class name.
  function findPoshmarkVisibleButtonByText(text) {
    return qa('button').find((b) => b.offsetParent !== null && norm(b.textContent) === text);
  }
  // BUG FIX 2026-08-22 (S-EXT-POSHMARK-PUBLISH-BUTTON-TEXT, P0, live-Chrome-confirmed via a direct
  // DOM query on Patrick's real tab after Next successfully advanced to the review step): the real
  // button reads "List this item", not "List This Listing" -- this file's own popup-facing copy
  // (fas-poshmark.js's showReviewOverlay / popup.html) used the wrong wording throughout, so this
  // exact-text check never matched even once Next correctly got clicked, and every run silently
  // fell back to manual review. Checks both the confirmed real text and the originally-assumed one
  // defensively, in case Poshmark ever A/B tests the copy.
  function findPoshmarkPublishButton() {
    return findPoshmarkVisibleButtonByText('list this item') || findPoshmarkVisibleButtonByText('list this listing');
  }
  // BUG FIX 2026-08-22 (S-EXT-POSHMARK-NEXT-STEP, P0, live-Chrome-confirmed on Patrick's real tab):
  // findPoshmarkPublishButton() alone never found anything on a real run -- Poshmark's actual
  // create-listing flow is TWO steps: a "Next" button (live-confirmed `data-test="next"`, sitting
  // in a `.form__actions` container -- the main form's own primary action bar, not some unrelated
  // modal) advances from the fill form to a review/confirm screen, and only THERE does the real
  // "List This Listing" button appear. The old code looked for the final button immediately, never
  // found it, and silently fell back to manual review every time -- exactly matching Patrick's live
  // report ("didn't click the next button or list the item button"). Live-confirmed distinct from
  // the unrelated "Single Item"/"Multi Item" buttons also visible on this page (different
  // data-test values, different container) -- those are never touched.
  function findPoshmarkNextButton() {
    return qa('button').find((b) => b.offsetParent !== null && (b.getAttribute('data-test') === 'next' || norm(b.textContent) === 'next'));
  }
  async function waitForPoshmarkFinalPublishButton(maxWaitMs) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const btn = findPoshmarkPublishButton();
      if (btn) return btn;
      await sleep(300);
    }
    return null;
  }

  // BUG FIX 2026-08-31 (S-EXT-POSHMARK-FRAGILE-MODAL, P1, live-Chrome-confirmed on Patrick's real
  // tab, tab shared directly): Poshmark shows an additional native confirmation modal ("Fragile
  // Item Detected") for items in categories it flags as breakable (this run: category "Home /
  // Other") -- this is Poshmark's own shipping disclaimer copy ("package carefully... if damaged
  // in transit... we will be unable to compensate you"), NOT a security/verification screen.
  // looksLikeInterstitial() correctly does not match this text, and it must never be treated as
  // one -- a real human seller sees and clicks through this exact modal routinely; it is the
  // expected next step of the SAME publish action already initiated, not a new consequential
  // decision. Before this fix: clicking "List this item" opened this modal ON TOP of the
  // still-present sell form. waitForPoshmarkPublishConfirmation() below only polled
  // looksLikeSellForm() -- the form itself never goes away, it's just covered by the modal -- so
  // the poll always timed out after 6s and fell into doPoshmarkAutoPublish's "couldn't confirm"
  // UNVERIFIED warning branch. Confirmed live 2026-08-31: exact repro of Patrick's report (the
  // extension's own honest UNVERIFIED overlay firing instead of a real publish).
  // BUG FIX 2026-08-31 (S-EXT-POSHMARK-FRAGILE-MODAL-CHAINED, live-Chrome-confirmed, tab shared
  // directly, same session as the fix above): clicking the outer "Fragile Item Detected" modal's
  // own "Publish Listing" button does NOT publish -- Poshmark chains a SECOND confirmation modal
  // (same disclaimer restated: "By publishing this listing I understand that if items are not
  // packaged securely and break in transit, Poshmark will not be compensating me."), with its own
  // short-text "Publish" button and a "Cancel" button. Detected via this restated disclaimer's
  // distinctive tail phrase rather than a second "fragile item detected" check, since the outer
  // modal's heading is gone by the time this one is showing. Written as a loop rather than two
  // fixed steps because there is no live-confirmed guarantee Poshmark stops at exactly two layers
  // -- each iteration just asks "is SOME known fragile-flow confirmation still open" and clicks
  // whichever one currently matches; it naturally stops matching (and this returns null) once
  // every layer Poshmark actually showed has been dismissed.
  function findPoshmarkFragileModalPublishButton() {
    const lower = bodyText().toLowerCase();
    // BUG FIX 2026-08-31 (P0, live-Chrome-confirmed root cause on Patrick's real shared tab --
    // NOT a timing issue, the earlier 6000->15000 widen changed nothing because this is a logic
    // bug that repeats identically on every single poll no matter how long you wait): Poshmark
    // does NOT remove the outer "Fragile Item Detected" modal's DOM/text when its own "Publish
    // Listing" button is clicked -- it stays present underneath the new inner confirmation dialog
    // that opens on top, and findPoshmarkVisibleButtonByText only checks b.offsetParent !== null
    // (layout presence), which says nothing about z-order/occlusion -- so that outer button reads
    // as just as "visible" as before. With the outer check FIRST and an early return, this used to
    // re-match "fragile item detected" and re-return the SAME already-clicked, now-dead outer
    // button on every single poll, and never once reached the inner "will not be compensating me"
    // branch -- confirmed live: both modals visibly stacked, toast already fired, exactly this
    // trace. Checking the INNER (more specific, only-present-after-the-outer-was-already-
    // dismissed-once) condition FIRST fixes this: once the inner confirm dialog is actually open,
    // its own text is what's checked, its own "Publish" button is what's returned -- the outer
    // check only ever fires again if the inner dialog is genuinely not open.
    if (lower.indexOf('will not be compensating me') !== -1) {
      const innerBtn = findPoshmarkVisibleButtonByText('publish');
      if (innerBtn) return innerBtn;
    }
    if (lower.indexOf('fragile item detected') !== -1) {
      const outerBtn = findPoshmarkVisibleButtonByText('publish listing');
      if (outerBtn) return outerBtn;
    }
    return null;
  }
  async function dismissPoshmarkFragileModalIfPresent() {
    const btn = findPoshmarkFragileModalPublishButton();
    if (!btn) return false;
    overlay('<b>FindA.Sale</b> - Poshmark flagged this as a fragile item; continuing publish...');
    await humanPause(300, 600);
    realClick(btn);
    return true;
  }

  // Confirms a real publish happened by polling for the sell form to disappear (Title field gone)
  // -- no live-confirmed success marker exists yet (CODE-ONLY/UNTESTED, file header), so this is
  // the same conservative "did the form go away" signal fas-craigslist.js uses for its own publish
  // confirmation (waitForCraigslistPublish), adapted to this file's own looksLikeSellForm() check.
  // Also polls for and clicks through every layer of the Fragile Item modal chain above -- see
  // findPoshmarkFragileModalPublishButton's own comment for the full incident this closes. Checked
  // on EVERY iteration (not just once) so a second (or further) chained confirmation is still
  // caught after the first is dismissed.
  async function waitForPoshmarkPublishConfirmation(maxWaitMs) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const dismissed = await dismissPoshmarkFragileModalIfPresent();
      if (dismissed) { await sleep(400); continue; }
      if (!looksLikeSellForm()) return true;
      await sleep(400);
    }
    return false;
  }

  // FEATURE 2026-08-22 (S-EXT-POSHMARK-RUN-SUMMARY, Patrick-directed): "if you have those kinds
  // of issues they should be given a default to get them published, reported at the end of the
  // run and should not be a reason to stop the extension continuing forward" -- a guessed category
  // no longer blocks auto-publish (see run()'s call site below). Instead this records a note via
  // background.js's fasPoshmarkRunNotes list, and the LAST item in the run reads all of them back
  // and shows a roll-up instead of silently publishing N-1 guessed items with zero visibility.
  async function doPoshmarkAutoPublish(item, index, total, fillResult) {
    const photosOk = fillResult.photosOk;
    let publishBtn = findPoshmarkPublishButton();
    if (!publishBtn) {
      const nextBtn = findPoshmarkNextButton();
      if (nextBtn) {
        overlay('<b>FindA.Sale</b> - advancing to the review step...');
        await humanPause(400, 800);
        realClick(nextBtn);
        // A real security/verification screen can appear after advancing, same as everywhere else
        // in this file -- never attempt to click through one.
        if (looksLikeInterstitial()) {
          overlayWarn('Poshmark is showing a verification/security screen. FindA.Sale never attempts to solve this -- please complete it yourself, then finish this listing manually.' + button('fas-posh-close', 'Close', false));
          closeBtnHandler();
          return;
        }
        publishBtn = await waitForPoshmarkFinalPublishButton(4000);
      }
    }
    if (!publishBtn) {
      // Auto-publish is on but the final button couldn't be reached (UNVERIFIED selector/flow,
      // file header) -- never guess past this; fall back to the exact same manual-review path as
      // autoPublish=false. Whatever step Next already advanced to (if any) is left exactly as-is
      // for the organizer to finish.
      showReviewOverlay(item, index, total, photosOk, fillResult.fieldNotes);
      return;
    }
    overlay('<b>FindA.Sale</b> - publishing <b>' + escapeHtml(item.title) + '</b>...');
    await humanPause(500, 900);
    // BUG FIX 2026-08-29 (S-EXT-POSHMARK-DUPLICATE-PUBLISH-CLICK) -- write the local duplicate-click
    // guard marker RIGHT BEFORE the real click, the single riskiest instant for a context-destroying
    // navigation to follow (see this marker's own definition/comment above for the full incident).
    writePoshPublishAttemptState(item.id);
    realClick(publishBtn);
    // BUG FIX 2026-08-31 (Patrick live report: stuck on the 2nd "Publish Listing" confirmation
    // modal with the "couldn't confirm it went through" toast already shown): 6000ms left almost
    // no real-world margin for the Fragile Item modal chain -- 2 sequential dismiss cycles, each
    // a humanPause(300,600) + click + the outer loop's own sleep(400), plus normal Poshmark
    // render/network slop -- so a legitimately-in-progress chained dismissal could still be
    // running when the old 6s window expired, surfacing the honest-but-wrong "unverified" bail-out
    // overlay while a real second modal sat on screen untouched. Widened to give 2 full chained
    // modal dismissals real headroom without making a genuinely-stuck run wait unreasonably long
    // before falling back to the organizer.
    const published = await waitForPoshmarkPublishConfirmation(15000);
    if (!published) {
      // Deliberately NOT clearing the publish-attempt marker here -- this is exactly the ambiguous
      // case the marker exists to protect against: we don't actually know whether the click went
      // through, so a future page load (e.g. this same tab bouncing afterward) must still see it.
      overlayWarn('Clicked <b>List this item</b> but couldn\'t confirm it went through (UNVERIFIED selector/confirmation signal) -- please check this listing on Poshmark yourself before assuming it posted.' + button('fas-posh-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    // Publish confirmed -- this exact attempt's outcome is now known, so the guard's job for THIS
    // click is done (a later click for a DIFFERENT item id will never match this marker anyway, but
    // clearing here keeps the marker's lifecycle honest -- "live only while genuinely ambiguous").
    clearPoshPublishAttemptState();
    try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: item.id, remoteListingId: null, platform: 'POSHMARK' }); } catch (e) {}
    try { await chrome.runtime.sendMessage({ type: 'advancePoshmarkQueue', itemId: item.id }); } catch (e) {}
    // Record a run note (never blocks) for every field this run had to guess, skip, or couldn't
    // set -- see this function's own header comment. fillResult.fieldNotes already covers the
    // "Category never committed at all" and Size/Color cases (fillListing above); a confidently-
    // committed-but-guessed Category (fell back to a department default or "Other") is a separate
    // case only known here.
    const runNotes = fillResult.fieldNotes ? fillResult.fieldNotes.slice() : [];
    if (fillResult.categoryCommitted && !fillResult.categoryConfident) {
      runNotes.push('Category was guessed (no clear match on Poshmark\'s taxonomy) -- double-check it.');
    }
    for (const note of runNotes) {
      try { await chrome.runtime.sendMessage({ type: 'recordPoshmarkRunNote', title: item.title, note: note }); } catch (e) {}
    }
    const more = (index + 1) < total;
    // BUG FIX 2026-08-28 (S-EXT-POSHMARK-AUTOPUBLISH-STALL, Patrick live report: "poshmark
    // extension is only pushing one item at a time not multiples"): this function only runs when
    // autoPublish is true (see run()'s call site), so a mid-run item must never wait on a manual
    // click to continue -- that defeats the entire point of auto-publish. Previously this always
    // rendered a "Next item" button and only navigated on click, silently stalling every run after
    // item 1. Now: auto-navigate to the next item when one remains; only the LAST item in the run
    // shows the run-notes summary + a Close button, since that's genuinely the end of the run.
    if (more) {
      overlay('<b>FindA.Sale</b><div style="margin-top:6px">Published <b>' + escapeHtml(item.title) + '</b>.</div>' +
        '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Auto-publish is on -- moving to the next item...</div>' +
        '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');
      await humanPause(600, 1200);
      await navigateToPoshmarkCreateListing();
      return;
    }
    // This item's create-listing attempt reached a genuine terminal state (published, no more
    // items) -- clear the bounce-retry marker so it can't leak into some unrelated future page load.
    clearPoshNavRetryState();
    clearPoshPublishAttemptState();
    let summaryHtml = '';
    let notes = [];
    try {
      const res = await chrome.runtime.sendMessage({ type: 'getPoshmarkRunNotes' });
      notes = (res && res.notes) || [];
    } catch (e) {}
    if (notes.length) {
      summaryHtml = '<div style="margin-top:8px;font-size:12px;color:#ffcf7a">' + notes.length + ' item' + (notes.length === 1 ? '' : 's') + ' published this run with something worth double-checking:' +
        '<ul style="margin:4px 0 0 16px;padding:0">' + notes.map((n) => '<li>' + escapeHtml(n.title) + ' -- ' + escapeHtml(n.note) + '</li>').join('') + '</ul></div>';
    }
    overlay('<b>FindA.Sale</b><div style="margin-top:6px">Published <b>' + escapeHtml(item.title) + '</b>.</div>' +
      summaryHtml +
      button('fas-posh-close', 'Close', false) +
      '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');
    closeBtnHandler();
  }

  async function fillListing(item) {
    overlay('<b>FindA.Sale</b> - filling the Poshmark listing form...');
    await tryFill('Title', item.title, (v) => fillText('Title', v));
    await tryFill('Description', item.description, (v) => fillText('Description', v));
    // fieldNotes declared early so the Price check below can push to it -- the rest of this
    // function's own fieldNotes-collection block (Category/Size/Color) appears further down.
    const fieldNotes = [];
    if (item.price != null && isFinite(Number(item.price))) {
      const priceOk = await tryFill('Price', item.price, (v) => fillPoshmarkPrice(String(Math.max(1, Math.round(Number(v))))));
      // BUG FIX 2026-08-22 (S-EXT-POSHMARK-PRICE-ILLEGAL-INVOCATION, Patrick live-console-report):
      // Price is a REQUIRED Poshmark field with a known-correct value already on hand (no guessing
      // needed, unlike Category/Size/Color) -- but a failed fill here silently blocked the rest of
      // the flow with no visible signal, since Poshmark's own required-field validation then
      // refuses to advance past Next, which is what sent this run into the manual-review fallback
      // with no clear reason shown. Now surfaced explicitly in the run summary so it's never a
      // silent stall again.
      if (!priceOk) fieldNotes.push('Price could not be set (technical glitch, not a guess -- value $' + item.price + ' is correct) -- set it yourself and publish.');
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
    // FEATURE 2026-08-22 (S-EXT-AUTOPUBLISH-POLICY): pickCategory now returns {committed, confident}
    // instead of a bare boolean -- see its own comment. categoryConfident is threaded out of this
    // function so run() can refuse to auto-publish a listing whose department was guessed.
    let categoryConfident = false;
    try {
      const genderHintText = [item.title, item.description].filter(Boolean).join(' ');
      const categoryResult = await pickCategory(item.category || '', item.categoryBreadcrumb, genderHintText);
      categoryCommitted = !!(categoryResult && categoryResult.committed);
      categoryConfident = !!(categoryResult && categoryResult.committed && categoryResult.confident);
    } catch (e) {
      console.warn('[FAS Poshmark] Field "Category" -- error while filling, skipped:', e && e.message);
    }
    // FEATURE 2026-08-22 (S-EXT-POSHMARK-RUN-SUMMARY, Patrick-directed, extends the same
    // report-don't-block philosophy from Category to Size/Color): collects a plain-language note
    // for any field that ends up unset so doPoshmarkAutoPublish can add it to the end-of-run
    // summary, same as a guessed Category. Never invents a Size value -- an actual wrong physical
    // size (unlike a slightly-off category) can lead to a real buyer complaint/return, so a
    // missing Size is reported and left for the organizer, not guessed.
    // (fieldNotes itself is declared earlier, right after Title/Description, so the Price check
    // above this function can push to the same array -- not redeclared here.)
    if (!categoryCommitted) {
      console.warn('[FAS Poshmark] Category never committed -- skipping Size/Color since Poshmark locks them behind a chosen category. Fill these in yourself.');
      fieldNotes.push('Category could not be set -- Size/Color were left blank too.');
    }
    // 2026-08-18: brand/size/color now exist on Item and flow through getExtensionItems ->
    // popup.js's queue map. tryFill's own undefined/null/'' guard still skips silently on
    // items where the organizer hasn't set a value. Brand is a plain autocomplete field, not gated
    // by category on Poshmark's form (UNVERIFIED against a live account, but not the field named in
    // Patrick's report) -- kept unconditional.
    await tryFill('Brand', item.brand, (v) => fillAutocomplete('Brand', v));
    if (categoryCommitted) {
      const sizeOk = await tryFill('Size', item.size, (v) => fillSelectLike('Size', v));
      if (item.size && !sizeOk) fieldNotes.push('Size "' + item.size + '" could not be set (UNVERIFIED selector) -- set it yourself.');
      // BUG FIX 2026-08-22 (S-EXT-POSHMARK-COLOR-DOUBLE-LOG, Patrick-flagged): fillPoshmarkColor
      // already logs its own specific reason ("no matching swatch found") when a value like "Neon"
      // has no real Poshmark option -- routing it through tryFill's generic wrapper ALSO logged a
      // second, misleading "selector not found" for the exact same failure (the selector WAS
      // found; the VALUE just didn't match anything). Called directly instead, skipping tryFill's
      // own undefined/null/'' guard is replicated inline since it's no longer wrapped.
      if (item.color) {
        let colorOk = false;
        try { colorOk = await fillPoshmarkColor(item.color); } catch (e) { console.warn('[FAS Poshmark] Field "Color" -- error while filling, skipped:', e && e.message); }
        // FEATURE 2026-08-22 (S-EXT-POSHMARK-COLOR-FALLBACK, Patrick-directed: "guess and report"):
        // an exact swatch match failed -- try the closest real swatch (see
        // mapPoshmarkColorFallback's own comment) instead of leaving Color unset. Always reported
        // in the run summary below regardless of whether the fallback itself succeeds, so the
        // organizer always knows a substitution happened.
        let colorFallback = null;
        if (!colorOk) {
          colorFallback = mapPoshmarkColorFallback(item.color);
          if (norm(colorFallback) !== norm(item.color)) {
            try { colorOk = await fillPoshmarkColor(colorFallback); } catch (e) { console.warn('[FAS Poshmark] Field "Color" fallback -- error while filling, skipped:', e && e.message); }
          }
        }
        if (!colorOk) fieldNotes.push('Color "' + item.color + '" has no matching Poshmark swatch and the fallback also failed -- set it yourself.');
        else if (colorFallback) fieldNotes.push('Color "' + item.color + '" had no exact match -- used closest swatch "' + colorFallback + '" instead. Double-check it.');
      }
    }
    const conditionLabel = mapPoshmarkCondition(item.condition);
    // Condition is not the field Patrick's report named as blocked, and this file has no prior
    // finding that it's category-gated -- kept unconditional. If it also turns out to be locked
    // behind Category on a live account, gate it the same way as Size/Color above.
    await tryFill('Condition', conditionLabel, (v) => fillSelectLike('Condition', v));
    await humanPause(400, 800);
    const photosOk = await injectPhotos(item.photoUrls);
    return { photosOk, categoryCommitted, categoryConfident, fieldNotes };
  }

  async function run(item, index, total, autoPublish) {
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
      // BUG FIX 2026-08-29 (S-EXT-POSHMARK-BOUNCE-RETRY, Patrick-directed): before treating this as
      // a genuine dead end, check whether we're actually mid-bounce -- a recent, still-in-flight
      // navigateToPoshmarkCreateListing() attempt (marker written right before that call, read back
      // here after this fresh page load) is real evidence this is a transient bounce, not "we've
      // been sitting on some unrelated page with no active attempt in flight." See the marker
      // helpers' own comment above navigateToPoshmarkCreateListing for the full reasoning.
      const retryState = readPoshNavRetryState();
      const bounceInFlight = !!retryState && (Date.now() - retryState.ts) < POSH_NAV_BOUNCE_WINDOW_MS;
      if (bounceInFlight && retryState.attempt < POSH_NAV_MAX_RETRIES) {
        const nextAttempt = retryState.attempt + 1;
        const waitMs = POSH_NAV_RETRY_BACKOFF_MS[retryState.attempt] || POSH_NAV_RETRY_BACKOFF_MS[POSH_NAV_RETRY_BACKOFF_MS.length - 1];
        console.log('[FAS Poshmark] Bounced off create-listing back to "' + location.pathname + '" -- retry ' + nextAttempt + '/' + POSH_NAV_MAX_RETRIES + ' in ' + (waitMs / 1000) + 's...');
        overlayWarn('Poshmark bounced back to a different page mid-attempt -- retrying (' + nextAttempt + '/' + POSH_NAV_MAX_RETRIES + ') in ' + (waitMs / 1000) + 's...');
        await sleep(waitMs);
        console.log('[FAS Poshmark] Retry ' + nextAttempt + '/' + POSH_NAV_MAX_RETRIES + ' firing now -- navigating back to create-listing.');
        await navigateToPoshmarkCreateListing(nextAttempt);
        return;
      }
      if (retryState && retryState.attempt >= POSH_NAV_MAX_RETRIES) {
        // Honest signal, not papered over: every retry bounced too, so this is very likely a
        // persistent Poshmark-side block (a real session/freshness check, a rate limit, etc.), not a
        // one-off transient glitch -- a different approach will be needed if this keeps happening on
        // the next live test, not just another retry-count bump.
        console.warn('[FAS Poshmark] Gave up after ' + POSH_NAV_MAX_RETRIES + ' retries -- create-listing bounced back to "' + location.pathname + '" every single time. This looks persistent, not transient -- see this dispatch\'s handoff.');
      }
      clearPoshNavRetryState();
      clearPoshPublishAttemptState();
      if (maybeShowAppLoginHint()) return;
      overlayWarn('This doesn\'t look like a fillable Poshmark listing form yet (checked repeatedly for several seconds). If you\'re on the right page, this is an UNVERIFIED-selector miss -- please fill it in yourself.' + button('fas-posh-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    // Form confirmed loaded -- NOT clearing the bounce-retry marker here (see its own comment above
    // navigateToPoshmarkCreateListing): live evidence shows the bounce can happen a few seconds INTO
    // fillListing below, after this exact point, so the marker needs to stay live through the fill,
    // not just through the initial page-ready check.
    console.log('[FAS Poshmark] Form confirmed loaded -- proceeding to fill (bounce-retry marker kept live for the duration of this fill).');
    const fillResult = await fillListing(item);
    const photosOk = fillResult.photosOk;
    // Re-check for an interstitial that may have appeared mid-fill (e.g. triggered by the photo
    // upload) before showing the "you're ready to review" state.
    if (looksLikeInterstitial()) {
      overlayWarn('Poshmark is showing a verification/security screen partway through filling this listing. Please complete it yourself, then finish this listing manually -- nothing further was auto-filled.' + button('fas-posh-close', 'Close', false));
      closeBtnHandler();
      return;
    }
    // BUG FIX 2026-08-22 (S-EXT-POSHMARK-RUN-SUMMARY, Patrick-directed, reverses the prior
    // round's gate): a guessed category no longer blocks auto-publish -- Patrick: "this has to be
    // automated not oh always default to asking the user... if you have those kinds of issues they
    // should be given a default to get them published, reported at the end of the run and should
    // not be a reason to stop the extension continuing forward." doPoshmarkAutoPublish now records
    // a run note instead of refusing to publish; see its own header comment.
    if (autoPublish) { await doPoshmarkAutoPublish(item, index, total, fillResult); return; }
    showReviewOverlay(item, index, total, photosOk, fillResult.fieldNotes);
  }

  async function start() {
    await sleep(600); // let the page settle before reading the DOM
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getPoshmarkQueueItem' }); } catch (e) { return; }
    if (!queued || !queued.ok || !queued.item) { clearPoshNavRetryState(); clearPoshPublishAttemptState(); return; } // nothing queued -- stay silent, also clean up any stale bounce-retry/publish-attempt markers
    // BUG FIX 2026-08-29 (S-EXT-POSHMARK-DUPLICATE-PUBLISH-CLICK, Patrick live-photographic-proof
    // of a real 4x duplicate listing AFTER the round-13 CAS fix already shipped): checked BEFORE the
    // existing checkItemListedStatus() network check below, not instead of it -- this is a same-tab,
    // no-network-round-trip guard against the exact race checkItemListedStatus's backend dependency
    // cannot close (see writePoshPublishAttemptState's definition above for the full incident and
    // why this check has to be local). If this tab clicked "List this item" for this exact item id
    // within the last POSH_PUBLISH_ATTEMPT_WINDOW_MS, refuse to click it again -- hand off to the
    // organizer instead of silently risking another real duplicate Poshmark listing.
    const publishAttempt = readPoshPublishAttemptState();
    if (publishAttempt && publishAttempt.itemId === queued.item.id && (Date.now() - publishAttempt.ts) < POSH_PUBLISH_ATTEMPT_WINDOW_MS) {
      console.log('[FAS Poshmark] This tab already clicked "List this item" for "' + queued.item.title + '" (itemId=' + queued.item.id + ') ' + Math.round((Date.now() - publishAttempt.ts) / 1000) + 's ago -- checking the real outcome before deciding whether to stop or continue.');
      // BUG FIX 2026-08-29 (S-EXT-POSHMARK-GUARD-VERIFY-AND-ADVANCE, Patrick live report: "poshmark
      // didn't go past the closet again"): the guard above (S-EXT-POSHMARK-DUPLICATE-PUBLISH-CLICK)
      // correctly stopped a real duplicate-listing bug, but its response to detecting a recent
      // same-item attempt was to UNCONDITIONALLY fall back to manual review -- even when the earlier
      // click actually succeeded -- which stalls the entire auto-publish run on exactly the event
      // (a page reload mid-publish) this guard exists to handle, defeating the point of unattended
      // auto-publish. Before deciding, reuse this file's own existing waitForFormReady() poll (the
      // SAME signal that gates run()'s initial fill, and the same looksLikeSellForm() check
      // waitForPoshmarkPublishConfirmation already uses to confirm a normal publish) to find out
      // what is actually on screen right now, instead of guessing from the marker alone:
      //   'ready'       -- the sell form IS showing again (a fresh, unfilled create-listing form) --
      //                    genuinely ambiguous, the earlier click may never have gone through at
      //                    all. Stays on the safe, conservative manual-review path (unchanged
      //                    behavior from before this fix).
      //   'timeout'     -- the sell form never (re)appeared within the poll window -- we're on some
      //                    other page (closet, listing detail, a generic post-publish redirect),
      //                    which is exactly what a genuine successful publish looks like from this
      //                    tab's perspective (Poshmark hard-navigates away from create-listing on
      //                    success). Treated as published; the run continues.
      //   'interstitial' -- a real CAPTCHA/verification screen -- same hard-stop posture as
      //                    everywhere else in this file, never guessed past.
      const outcomeState = await waitForFormReady(5000);
      if (outcomeState === 'interstitial') {
        overlayWarn('Poshmark is showing a verification/security screen. FindA.Sale never attempts to solve this -- please complete it yourself, then reopen the extension to continue.' + button('fas-posh-close', 'Close', false));
        closeBtnHandler();
        return;
      }
      if (outcomeState === 'timeout') {
        // Sell form did not reappear -- treat exactly like doPoshmarkAutoPublish's own normal
        // success path: clear both markers, report the publish, and advance the CAS-protected queue
        // index (safe even if background.js's reliability net already advanced it independently --
        // see advancePoshmarkQueue's own compare-and-swap), then continue the run forward instead of
        // stalling on manual review.
        console.log('[FAS Poshmark] Sell form did not reappear within 5s after reload -- treating the earlier "List this item" click as a successful publish and continuing the queue.');
        clearPoshPublishAttemptState();
        clearPoshNavRetryState();
        try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: queued.item.id, remoteListingId: null, platform: 'POSHMARK' }); } catch (e) {}
        try { await chrome.runtime.sendMessage({ type: 'advancePoshmarkQueue', itemId: queued.item.id }); } catch (e) {}
        const more = (queued.index + 1) < queued.total;
        if (more && queued.autoPublish !== false) {
          overlay('<b>FindA.Sale</b><div style="margin-top:6px">Confirmed <b>' + escapeHtml(queued.item.title) + '</b> published (this tab reloaded right after clicking List this item, and the sell form did not come back -- treating as a success).</div>' +
            '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Auto-publish is on -- moving to the next item...</div>');
          await humanPause(600, 1200);
          await navigateToPoshmarkCreateListing();
          return;
        }
        overlay('<b>FindA.Sale</b><div style="margin-top:6px">Confirmed <b>' + escapeHtml(queued.item.title) + '</b> published (this tab reloaded right after clicking List this item, and the sell form did not come back -- treating as a success).</div>' +
          (more ? button('fas-posh-next', 'Next item &#9654;', true) : button('fas-posh-close', 'Close', false)));
        const next = document.getElementById('fas-posh-next');
        if (next) next.onclick = async () => { await navigateToPoshmarkCreateListing(); };
        closeBtnHandler();
        return;
      }
      // outcomeState === 'ready': the sell form is showing again -- genuinely ambiguous, can't
      // confirm the earlier click went through. Stays on the safe, conservative manual-review path
      // (unchanged behavior from before this fix).
      overlayWarn('FindA.Sale already clicked <b>List this item</b> for <b>' + escapeHtml(queued.item.title) + '</b> moments ago on this tab, but this page reloaded before that could be confirmed, and a fresh listing form is showing again -- so it\'s not clear whether that click actually went through. To avoid creating a duplicate listing, please check your Poshmark closet for this item first -- if it\'s already there, click below to continue the queue; if not, list it manually then click below.' +
        button('fas-posh-dupe-ack', 'Got it -- continue queue', true) +
        button('fas-posh-close', 'Close', false));
      const dupeAck = document.getElementById('fas-posh-dupe-ack');
      if (dupeAck) dupeAck.onclick = async () => {
        clearPoshPublishAttemptState();
        clearPoshNavRetryState();
        try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: queued.item.id, remoteListingId: null, platform: 'POSHMARK' }); } catch (e) {}
        try { await chrome.runtime.sendMessage({ type: 'advancePoshmarkQueue', itemId: queued.item.id }); } catch (e) {}
        location.reload();
      };
      closeBtnHandler();
      return;
    }
    // FEATURE 2026-08-22 (S-EXT-DUPLICATE-LISTING-GUARD, Patrick live-confirmed incident): a
    // resumed queue entry (via popup.js's "reopen that tab" banner, or any tab reload while a
    // queue is still pending) used to unconditionally re-fill and re-publish, with zero check for
    // whether the item might already be listed -- e.g. because the organizer finished it manually
    // outside this overlay's own "I posted -- done" button. That produced a real, confirmed
    // duplicate live Poshmark listing this session. Best-effort freshness check against the same
    // authenticated data the popup's own LISTED badge uses (background.js's checkItemListedStatus,
    // reusing GET /extension/items -- no new backend endpoint). If the check itself fails (offline,
    // backend hiccup), fall through to the normal flow rather than blocking the whole run on a
    // check that reduces, but was never the sole guarantee against, this risk.
    try {
      const statusRes = await chrome.runtime.sendMessage({ type: 'checkItemListedStatus', itemId: queued.item.id, platform: 'POSHMARK' });
      if (statusRes && statusRes.ok && statusRes.listed) {
        const more = (queued.index + 1) < queued.total;
        try { await chrome.runtime.sendMessage({ type: 'advancePoshmarkQueue', itemId: queued.item.id }); } catch (e) {}
        // BUG FIX 2026-08-28 (S-EXT-POSHMARK-AUTOPUBLISH-STALL, same root cause as
        // doPoshmarkAutoPublish's fix below): auto-publish must never wait on a manual click to
        // continue past a skipped (already-listed) item either -- auto-navigate straight to the
        // next queued item when one remains and autoPublish is on.
        if (more && queued.autoPublish !== false) {
          overlay('<b>FindA.Sale</b><div style="margin-top:6px">Skipped <b>' + escapeHtml(queued.item.title) + '</b> -- this already shows as listed on Poshmark, so it was not filled or published again (avoiding a duplicate listing).</div>' +
            '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Auto-publish is on -- moving to the next item...</div>');
          await humanPause(600, 1200);
          location.href = POST_URL_HINT;
          return;
        }
        overlay('<b>FindA.Sale</b><div style="margin-top:6px">Skipped <b>' + escapeHtml(queued.item.title) + '</b> -- this already shows as listed on Poshmark, so it was not filled or published again (avoiding a duplicate listing).</div>' +
          (more ? button('fas-posh-next', 'Next item &#9654;', true) : '') +
          button('fas-posh-close', 'Close', false));
        const next = document.getElementById('fas-posh-next');
        if (next) next.onclick = () => { location.href = POST_URL_HINT; };
        closeBtnHandler();
        return;
      }
    } catch (e) { /* best-effort -- fall through to normal fill/publish flow */ }
    try {
      await run(queued.item, queued.index, queued.total, queued.autoPublish !== false);
    } catch (e) {
      overlayWarn('Something went wrong filling this listing (' + escapeHtml((e && e.message) || 'unknown error') + '). Nothing was published -- complete this listing yourself, or reopen the extension to try again.' + button('fas-posh-close', 'Close', false));
      closeBtnHandler();
    }
  }

  // ---- Cross-platform auto-remove-on-sale-elsewhere (S-EXT-CROSS-PLATFORM-AUTOREMOVE, 2026-08-22)
  // Patrick, explicit directive: "it must be built for all of them, that's part of the extension."
  // This file already runs on every poshmark.com page (manifest matches poshmark.com/*), so the
  // removal flow lives here as a second entry point rather than a new content-script file --
  // gated below on whether a Poshmark removal queue item is actually pending, so it never
  // interferes with the normal create-listing flow above.
  //
  // CODE-ONLY / UNVERIFIED (same honest disclosure as this file's own original header): no sold
  // item has existed on this organizer's test Poshmark closet yet, so the closet-card and
  // listing-detail delete-menu selectors below have NOT been confirmed against a real sold
  // listing. Built defensively (single-confident-title-match only, same discipline as
  // fas-remove.js's Facebook removal flow -- zero or ambiguous matches are skipped and reported,
  // never guessed) so a wrong guess fails safe instead of touching the wrong listing.

  function poshRemNorm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

  // Finds the "My Closet" link from wherever we currently are (feed, home, etc.) -- avoids
  // hardcoding the organizer's own Poshmark username anywhere, since FindA.Sale has no record of
  // it. UNVERIFIED beyond this session's own live confirmation that this link exists on the feed
  // page with this exact href pattern.
  function findPoshmarkClosetLink() {
    const link = document.querySelector('a[href*="/closet/"]');
    return link ? link.href : null;
  }

  // UNVERIFIED -- best-effort guess at Poshmark's closet-tile structure (a tile containing a link
  // to its own /listing/ detail page), not yet confirmed against a real sold item.
  function findPoshmarkClosetCardByTitle(title) {
    const want = poshRemNorm(title);
    if (!want) return null;
    const tiles = qa('a[href*="/listing/"]')
      .map((a) => a.closest('[class*="tile" i], [class*="card" i], li, div') || a)
      .filter((el, i, arr) => arr.indexOf(el) === i);
    const matches = tiles.filter((t) => poshRemNorm(t.textContent).indexOf(want) !== -1);
    return matches.length === 1 ? matches[0] : null;
  }

  // UNVERIFIED -- Poshmark listing-detail pages typically expose a "..." / kebab menu with a
  // Delete/Remove Listing action once you own the listing; the exact selector has not been
  // confirmed live. Matches by visible text within any open menu/dialog, consistent with this
  // file's own findPoshmarkVisibleButtonByText pattern used elsewhere.
  async function deletePoshmarkListingOnDetailPage() {
    const kebab = qa('button, [role="button"]').find((el) => {
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      return label.indexOf('more') !== -1 || label.indexOf('option') !== -1 || el.textContent.trim() === '...' || el.textContent.trim() === '\u2022\u2022\u2022';
    });
    if (kebab) { realClick(kebab); await sleep(400); }
    const deleteBtn = findPoshmarkVisibleButtonByText('delete listing') || findPoshmarkVisibleButtonByText('delete') || findPoshmarkVisibleButtonByText('remove listing');
    if (!deleteBtn) return false;
    realClick(deleteBtn);
    await sleep(400);
    const confirmBtn = findPoshmarkVisibleButtonByText('yes') || findPoshmarkVisibleButtonByText('confirm') || findPoshmarkVisibleButtonByText('delete');
    if (confirmBtn) { realClick(confirmBtn); await sleep(600); }
    return true;
  }

  async function reportPoshmarkRemoved(item) {
    try { await chrome.runtime.sendMessage({ type: 'markItemRemovedByRemoval', itemId: item.id, platform: 'POSHMARK' }); } catch (e) {}
  }

  async function runPoshmarkRemovalQueue(item, index, total) {
    overlay('<b>FindA.Sale</b> \u2014 removing sold item ' + (index + 1) + ' of ' + total + ': <b>' + escapeHtml(item.title) + '</b>\u2026');
    // On a listing detail page already matching this item's title -- attempt the delete directly.
    if (location.pathname.indexOf('/listing/') === 0 || location.pathname.indexOf('/listing/') > 0) {
      const pageTitleEl = document.querySelector('h1, [class*="title" i]');
      const onRightPage = pageTitleEl && poshRemNorm(pageTitleEl.textContent).indexOf(poshRemNorm(item.title)) !== -1;
      if (onRightPage) {
        const deleted = await deletePoshmarkListingOnDetailPage();
        if (deleted) {
          await reportPoshmarkRemoved(item);
          overlay('<b>FindA.Sale</b><div style="margin-top:6px">Removed <b>' + escapeHtml(item.title) + '</b> from Poshmark.</div>');
        } else {
          overlayWarn('Found the listing but couldn\'t confirm the delete action (UNVERIFIED selector) -- please remove it yourself.' + button('fas-posh-close', 'Close', false));
        }
        let next = null;
        try { next = await chrome.runtime.sendMessage({ type: 'advanceRemovalQueueFor', platform: 'POSHMARK' }); } catch (e) {}
        if (next && next.ok && next.item) {
          await sleep(1200);
          location.href = findPoshmarkClosetLink() || 'https://poshmark.com/feed'; // BUG FIX 2026-08-22: CFG is not injected into this content script's world (only background.js imports config.js) -- referencing it here threw a ReferenceError whenever findPoshmarkClosetLink() returned null. Inlined the same URL config.js holds for POSH_MANAGE_URL.
        } else {
          try { await chrome.runtime.sendMessage({ type: 'removalQueueDoneFor', platform: 'POSHMARK' }); } catch (e) {}
        }
        return;
      }
    }
    // Otherwise: on the closet (or some other page) -- find the matching card and navigate into it.
    const closetLink = findPoshmarkClosetLink();
    const card = findPoshmarkClosetCardByTitle(item.title);
    if (!card) {
      if (location.href.indexOf('/closet/') === -1 && closetLink) {
        location.href = closetLink; // navigate to closet, fresh load will retry the match there
        return;
      }
      overlayWarn('No confident match for "' + escapeHtml(item.title) + '" in your closet (zero or more than one found) -- skipped, not guessed.' + button('fas-posh-close', 'Close', false));
      let next = null;
      try { next = await chrome.runtime.sendMessage({ type: 'advanceRemovalQueueFor', platform: 'POSHMARK' }); } catch (e) {}
      if (!(next && next.ok && next.item)) { try { await chrome.runtime.sendMessage({ type: 'removalQueueDoneFor', platform: 'POSHMARK' }); } catch (e) {} }
      return;
    }
    const link = card.querySelector('a[href*="/listing/"]');
    if (link) location.href = link.href; // navigate into the listing; fresh load handles the delete
  }

  async function maybeRunPoshmarkRemoval() {
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getRemovalQueueItemFor', platform: 'POSHMARK' }); } catch (e) { return false; }
    if (!queued || !queued.ok || !queued.item) return false;
    await runPoshmarkRemovalQueue(queued.item, queued.index, queued.total);
    return true;
  }

  (async () => {
    const ranRemoval = await maybeRunPoshmarkRemoval();
    if (!ranRemoval) start();
  })();
})();
