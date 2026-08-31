/* FindA.Sale — content script on post.craigslist.org/*.
 * Craigslist "for sale by owner" autofill (ADR-084 extension, 2026-07-17). Unlike the Facebook
 * flow, Craigslist's posting flow is plain, server-rendered HTML across several FULL-PAGE steps
 * (?s=subarea -> ?s=type -> ?s=cat -> ?s=edit -> images -> publish), so NO React synthetic-event
 * tricks and NO chrome.debugger are needed: ordinary value setters, radio .checked + change, and
 * native button clicks drive the form. Same hard-error-only philosophy as fas-content.js -- it
 * never guesses past a step it can't confidently complete.
 * GUARDRAIL (legal-reviewed): the human owns login and ALL phone/email/CAPTCHA verification --
 * this script never guesses past a verification step it doesn't recognize (hands off to the human
 * instead, see showReviewOverlay()). The publish click itself IS automatable and IS performed by
 * this script (doPreviewStep(), guarded by the shared "Publish automatically" popup checkbox,
 * checked by default per the 2026-07-17 locked decision: full automation including auto-publish is
 * non-negotiable, off-by-default toggle language refers to the PRO/TEAMS-only risk-disclosure
 * framing, not to publish being disabled by default). STALE COMMENT CORRECTED 2026-08-06/07 -- an
 * earlier version of this file (pre auto-publish) genuinely did stop before publish; that is no
 * longer true and this comment previously said otherwise, causing real confusion.
 */
(function () {
  const POST_URL = 'https://post.craigslist.org/';

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  async function humanPause(minMs, maxMs) { await sleep(minMs + Math.random() * (maxMs - minMs)); }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function bodyText() { return (document.body && document.body.innerText) || ''; }
  function q(sel) { return document.querySelector(sel); }
  function escapeHtml(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function hardError(step, detail) {
    const e = new Error(detail || ('Could not find what I expected on the ' + step + ' step.'));
    e.fasStep = step;
    return e;
  }

  // ---- Craigslist login-state detection (2026-08-08, best-effort, DOM-based; informational
  // only, NEVER a hard gate -- Craigslist fully supports guest posting via email verification,
  // see the FromEMail field comment in doEditStep below, so "not logged in" must never block
  // posting). Content scripts cannot read Craigslist's own httpOnly session cookie via
  // document.cookie, so this reads the page's own account-status chrome instead. Returns
  // true/false when a clear signal is found on THIS step, or null when this particular step
  // shows no account chrome at all (many post-flow screens don't) -- null means "genuinely
  // unknown on this step", never treated as "logged out".
  function isLoggedIntoCraigslist() {
    const lower = bodyText().toLowerCase();
    if (/logged in as/.test(lower)) return true;
    const clickable = Array.from(document.querySelectorAll('a, button'));
    const hasLogout = clickable.some((el) => {
      const t = norm(el.textContent);
      return t === 'log out' || t === 'logout' || t.indexOf('log out') !== -1;
    });
    if (hasLogout) return true;
    const hasLogin = clickable.some((el) => {
      const t = norm(el.textContent);
      return t === 'log in' || t === 'login' || t === 'sign in';
    });
    if (hasLogin) return false;
    return null;
  }

  // Reports an observed state to the worker (fire-and-forget, best-effort). Only reports a
  // definite true/false -- a null (unknown-on-this-step) reading is deliberately NOT sent, so it
  // can never overwrite a real prior reading in chrome.storage.local with "unknown". Used by
  // background.js's checkRenewals to avoid starting an unattended Craigslist auto-renew run
  // against a wall it can't get through, and surfaced informationally in the popup.
  async function reportLoginState() {
    const state = isLoggedIntoCraigslist();
    if (state === null) return;
    try { await chrome.runtime.sendMessage({ type: 'craigslistLoginStateObserved', loggedIn: state }); } catch (e) {}
  }

  // ---- overlay UI (mirrors fas-remove.js's bottom-right bar) ----
  let bar;
  function ensureBar() {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'fas-craigslist-bar';
      bar.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:340px;' +
        'background:#1f2a24;color:#f3f5f2;border:1px solid #3c8c5a;border-radius:12px;padding:14px 16px;' +
        'font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.4)';
      document.documentElement.appendChild(bar);
    }
    return bar;
  }
  function overlay(html) { ensureBar().innerHTML = html; }
  function overlayInfo(text) { overlay('<b>FindA.Sale</b><div style="margin-top:6px;font-size:13px;color:#cfe3d6">' + text + '</div>'); }

  // ---- queue-advance countdown (2026-08-31, parity with fas-content.js's FB countdown) ----
  // Purely cosmetic -- background.js's own CRAIGSLIST_QUEUE_ADVANCE_DELAY_MS pacing pause runs
  // regardless of this; it only reflects that same countdown via humanQueueDelay()'s one-way
  // 'fasQueueDelayStarted' notification, same pattern fas-content.js already ships for Facebook.
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
  function overlayError(step, msg) {
    overlay('<b>FindA.Sale</b><div style="color:#ffcf7a;margin-top:6px;font-size:12px">Stopped on the <b>' + escapeHtml(step) +
      '</b> step: ' + escapeHtml(msg || 'something did not match.') +
      ' Nothing was published -- complete this posting yourself, or reopen the extension to try again.</div>' +
      button('fas-cl-close', 'Close', false));
    const c = document.getElementById('fas-cl-close'); if (c) c.onclick = () => bar && bar.remove();
  }
  // Verifies a real publish happened by waiting for the page to leave the pre-publish
  // "unpublished draft" preview state (?s=preview / the draft banner text) -- same
  // click-then-confirm shape as fas-content.js's FB publishedOk check. Not independently
  // observed against a real live Craigslist publish this session (that action is
  // irreversible and was deliberately never triggered during testing) -- same caveat the
  // shipped FB version already carries. Fails closed: if it can't confirm, doPreviewStep
  // reports "couldn't confirm" rather than claiming success.
  function waitForCraigslistPublish(timeoutMs) {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const check = () => {
        const stillDraft = /s=preview/.test(location.search) || /unpublished draft/i.test(bodyText());
        if (!stillDraft) { resolve(true); return; }
        if (Date.now() - startedAt >= timeoutMs) { resolve(false); return; }
        setTimeout(check, 400);
      };
      check();
    });
  }

  // Generic "did we leave this step" poller (BUG FIX 2026-08-19, S-EXT-BATCH, P1) -- same
  // poll-then-resolve shape as waitForCraigslistPublish above, but checks detectStep() instead of
  // the preview-specific draft signal, so it can be reused by any step whose "did it actually
  // advance" needs a real check instead of an assumed fixed pause. If the click DID cause a full
  // page navigation, this promise's own execution context is destroyed along with the old page --
  // that's fine, a fresh script instance runs start() again on the new page and this dead promise
  // is simply never resolved or awaited by anyone.
  function waitForStepChange(fromStep, timeoutMs) {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const check = () => {
        if (detectStep() !== fromStep) { resolve(true); return; }
        if (Date.now() - startedAt >= timeoutMs) { resolve(false); return; }
        setTimeout(check, 400);
      };
      check();
    });
  }

  function button(id, label, primary) {
    return '<button id="' + id + '" style="margin-top:10px;margin-right:8px;padding:7px 12px;border-radius:8px;border:none;cursor:pointer;' +
      'font-weight:600;font-size:13px;background:' + (primary ? '#3c8c5a' : '#3a4842') + ';color:#fff">' + label + '</button>';
  }

  // ---- loop guard: never auto-submit the same step more than twice. A Craigslist validation
  // bounce (e.g. a too-short body) reloads the same step; without this the script would re-fill +
  // re-continue forever. sessionStorage survives same-origin full-page navigations within the
  // posting flow, and is cleared once the flow reaches the images step (end of automation). ----
  function attemptCount(step) { return Number(sessionStorage.getItem('fasCLAttempt_' + step) || '0'); }
  function bumpAttempt(step) { sessionStorage.setItem('fasCLAttempt_' + step, String(attemptCount(step) + 1)); }
  function clearAttempts() { ['subarea', 'type', 'cat', 'geoverify', 'chooseArea', 'edit', 'preview'].forEach((s) => sessionStorage.removeItem('fasCLAttempt_' + s)); }
  // True (and shows a stop message) when this step has already been auto-submitted twice without
  // Craigslist advancing -- hand it to the human instead of looping.
  function guardStop(step) {
    if (attemptCount(step) >= 2) {
      overlayInfo('FindA.Sale filled this step but Craigslist did not move on. Please review and complete it yourself, then continue.');
      return true;
    }
    bumpAttempt(step);
    return false;
  }

  // ---- plain-HTML field + control helpers ----
  function setInputValue(el, value) {
    el.focus();
    el.value = String(value == null ? '' : value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fileInput() {
    return document.querySelector('input[type="file"][accept*="image"]') || document.querySelector('input[type="file"]');
  }

  // Returns THIS radio's own label text, and only this radio's -- covers both markup patterns
  // Craigslist's classic forms use (label[for="id"] association, and label-wraps-input), and
  // deliberately does NOT trust an ambiguous container fallback. ROOT CAUSE FOUND BY READING THE
  // CODE (2026-08-29, round 12, S-EXT-CRAIGSLIST-CAT-ANTIQUES): this function used to be
  // diagnostic-only while the OLD radioByLabelText() below had its own, separate, buggy
  // container-scoping fallback (radio.closest('li') || radio.parentElement, with NO check that the
  // resulting container actually held only one radio). If Craigslist's real category-picker markup
  // has no per-row <li> wrapper and no label[for=id]/wrapping-label association -- i.e. a flat list
  // of radios sharing one parent -- that fallback's `row` resolves to the SAME shared container for
  // every radio on the page, so `row.textContent` is the concatenation of every category's label
  // text. `.indexOf(want) !== -1` then returns true on the very FIRST radio checked in DOM order
  // for ANY search target that appears anywhere on the page -- and Craigslist's for-sale category
  // list is alphabetical, so the first radio in DOM order is "antiques". This exactly explains the
  // symptom: every item, regardless of its mapped target category, lands on "antiques" -- and why
  // it was untouched by two prior rounds of fixing mapCraigslistCategory() itself, which was never
  // the broken part. Fix: only trust a row/container match when it is verified to contain EXACTLY
  // ONE radio (i.e. genuinely scoped to this radio alone); otherwise return '' rather than risk a
  // false match.
  function radioLabelTextFor(radio) {
    if (!radio) return '';
    const id = radio.id;
    if (id) {
      const lab = document.querySelector('label[for="' + id + '"]');
      if (lab) return norm(lab.textContent);
    }
    const wrappingLabel = radio.closest('label');
    if (wrappingLabel) return norm(wrappingLabel.textContent);
    const row = radio.closest('li') || radio.parentElement;
    if (row && row.querySelectorAll('input[type="radio"]').length === 1) return norm(row.textContent);
    return '';
  }
  // Find a radio (for-sale-by-owner / category list) whose OWN label -- via radioLabelTextFor's
  // guarded lookup above, never an ambiguous shared container -- contains `target`. BUG FIX
  // (2026-08-29, round 12): previously had its own separate, less-safe implementation (see
  // radioLabelTextFor's comment above for the confirmed failure mode that caused). Now the single
  // source of truth for "this radio's label text" is radioLabelTextFor, used consistently by both
  // real selection logic (this function) and diagnostic logging.
  function radioByLabelText(target) {
    const want = norm(target);
    if (!want) return null;
    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
    for (const radio of radios) {
      const text = radioLabelTextFor(radio);
      if (text && text.indexOf(want) !== -1) return radio;
    }
    return null;
  }
  function selectRadio(radio) {
    radio.checked = true;
    radio.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function continueButton() {
    const nodes = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
    const txt = (b) => norm(b.textContent || b.value);
    return nodes.find((b) => txt(b) === 'continue') || nodes.find((b) => txt(b).indexOf('continue') !== -1) || null;
  }
  function clickContinueOrThrow(step) {
    const btn = continueButton();
    if (!btn) throw hardError(step, 'Couldn\'t find the "continue" button to advance.');
    btn.click(); // plain-HTML form submit -> full page load; the script re-runs on the next step
  }

  // ---- FindA.Sale category -> Craigslist for-sale category (best-effort; default general) ----
  function mapCraigslistCategory(category) {
    const c = norm(category);
    if (!c) return 'general for sale';
    const rules = [
      [['antique'], 'antiques'],
      [['appliance'], 'appliances'],
      [['art', 'craft'], 'arts'],
      [['baby', 'kid', 'child', 'toddler', 'infant'], 'baby'],
      [['book', 'magazine'], 'books'],
      [['cell phone', 'smartphone', 'iphone', 'android'], 'cell phones'],
      [['cloth', 'apparel', 'shoe', 'accessor', 'jacket', 'dress'], 'clothing'],
      [['collectible', 'coin', 'stamp', 'memorabilia'], 'collectibles'],
      [['computer', 'laptop', 'monitor'], 'computers'],
      [['electronic', 'tv', 'stereo', 'speaker', 'headphone'], 'electronics'],
      [['farm', 'garden', 'plant', 'lawn', 'mower'], 'farm'],
      [['furniture', 'couch', 'sofa', 'table', 'chair', 'desk', 'dresser', 'bed', 'cabinet'], 'furniture'],
      [['jewel', 'watch', 'ring', 'necklace', 'bracelet'], 'jewelry'],
      [['instrument', 'guitar', 'piano', 'violin', 'drum'], 'musical instruments'],
      [['photo', 'camera', 'lens', 'video'], 'photo'],
      [['sport', 'fitness', 'exercise', 'golf', 'bike', 'bicycle', 'ski', 'fishing'], 'sporting'],
      [['tool', 'drill', 'saw', 'wrench', 'hardware'], 'tools'],
      [['toy', 'game', 'puzzle', 'lego', 'doll'], 'toys'],
      [['kitchen', 'household', 'home', 'decor', 'linen', 'cookware'], 'household'],
      [['health', 'beauty', 'cosmetic'], 'health and beauty']
    ];
    for (const rule of rules) { if (rule[0].some((k) => c.indexOf(k) !== -1)) return rule[1]; }
    return 'general for sale';
  }

  // ---- photo injection (reuses the worker's cross-origin fetchPhotos, same as fas-content.js) ----
  async function injectPhotos(urls) {
    if (!urls || !urls.length) return false;
    let resp;
    try { resp = await chrome.runtime.sendMessage({ type: 'fetchPhotos', urls }); } catch (e) { return false; }
    if (!resp || !resp.ok || !resp.dataUrls || !resp.dataUrls.length) return false;
    const input = fileInput();
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

  // ---- posted-confirmation detection (S-EXT-CRAIGSLIST-STALL round 4, 2026-08-29) ----
  // Craigslist's REAL post-publish confirmation page lives at post.craigslist.org/k/<key1>/<key2>
  // -- SAME ORIGIN as the rest of this posting flow, confirmed live this session by directly
  // reading location.href + document.body.innerText against a real completed post (href was
  // "https://post.craigslist.org/k/1toQtDedSdub691crYUtBT/mQagP", title "kalamazoo | posting
  // confirmation"). The regional-subdomain URL shown in the page's own "View your post at ..."
  // line is only hyperlink TEXT, never this page's own address -- round 2/3's background.js
  // cross-origin re-navigation net was built around that wrong premise and its CRAIGSLIST regex
  // has never actually matched anything real. Two independent signals are required before this
  // is treated as the posted-confirmation state (same "don't guess past an unrecognized page"
  // discipline the rest of this file already uses): the URL shape AND page-copy text Craigslist
  // uses on this exact screen. Logged either way so a live console watch can tell "detected, both
  // signals matched" apart from "URL looked right but copy didn't match -- not treated as
  // posted-confirmation" if Craigslist ever changes this page's wording.
  // BROADENED (2026-08-29, S-EXT-CRAIGSLIST-DUP round 2 -- live console evidence: two DIFFERENT
  // real /k/ confirmation URLs both hit the "expected page copy was not found" warning tonight,
  // despite round 4's 3-phrase list having been confirmed live against a real completed post
  // earlier this session. Read in full before changing this again: full URL-only trust was
  // considered and REJECTED -- the round-7 comment on isCraigslistPhoneVerificationStep() above
  // documents a CONFIRMED live case of Craigslist's phone-verification wall sharing this EXACT
  // bare /k/<key1>/<key2> URL shape with no distinguishing query string, so URL alone cannot
  // safely stand in for "really posted" (it would mark an item listed/advance the queue while a
  // human still has to enter a phone code -- worse than the current bug). The balanced fix kept
  // the text/title gate but made it far less brittle two ways: (1) many more plausible phrasings
  // instead of 3 exact ones, since Craigslist's real wording is not independently re-observable
  // from static reading alone, and (2) the page's own <title> is now a second, independent
  // signal -- this file's own round-4 comment above (search "posting confirmation") already
  // recorded a real completed post's title as "kalamazoo | posting confirmation", so that phrase
  // is cross-referenced FROM this file's own prior live evidence, not a new guess. Either signal
  // alone is now enough (OR, same permissiveness philosophy as the original 3-phrase OR, just a
  // bigger net). If this round's console capture STILL shows the warning, the warning itself now
  // logs the real title + a body-text sample so the actual current copy is visible directly
  // instead of just "not found" -- that capture should replace guessed phrasings with the real
  // ones next round.
  function isCraigslistPostedConfirmation() {
    const urlMatch = location.hostname === 'post.craigslist.org' && /^\/k\//.test(location.pathname);
    if (!urlMatch) return false;
    const text = bodyText().toLowerCase();
    const title = (document.title || '').toLowerCase();
    const textSignals = [
      'thanks for posting',
      'thank you for posting',
      'view your post at',
      'view your ad at',
      'view posting',
      'post another',
      'edit your post',
      'manage your post',
      'delete this posting',
      'email a link to this posting',
      'your posting is now live',
      'is now posted',
      'has been posted',
      'posting published',
      'successfully posted'
    ];
    const textMatch = textSignals.some((s) => text.indexOf(s) !== -1);
    const titleMatch = title.indexOf('posting confirmation') !== -1;
    if (textMatch || titleMatch) {
      console.log('[FAS Craigslist] posted-confirmation detected -- url=' + location.pathname +
        ' textSignal=' + (textMatch ? 'matched' : 'no') + ' titleSignal=' + (titleMatch ? 'matched' : 'no'));
      return true;
    }
    console.log('[FAS Craigslist] URL looked like a posting confirmation (' + location.pathname +
      ') but expected page copy was not found -- NOT treating this as posted-confirmation. ' +
      'title="' + (document.title || '') + '" bodyTextSample="' + text.slice(0, 400).replace(/\s+/g, ' ') + '"');
    return false;
  }

  // ---- copy-from-previous-posting prompt detection (S-EXT-CRAIGSLIST-STALL round 5, 2026-08-29)
  // ----
  // After round 4's "Post another" click succeeds, Craigslist can insert its OWN "copy from your
  // previous posting" convenience screen before opening a fresh posting form -- SAME URL SHAPE as
  // the real posted-confirmation page (post.craigslist.org/k/<key1>/<key2>), but with a
  // `?s=copyfromanother` query string this time. Confirmed live this session by directly reading
  // location.href + document.title + document.body.innerText against the real screen (href ended
  // in "?s=copyfromanother", title "kalamazoo | copy from previous", body asking to "Re-use
  // selected data from your previous posting ..." with same_area/same_loc/same_category/
  // same_address checkboxes, all checked by default -- this is Craigslist's OWN UI, not ours).
  // The category/region/location/address shown here are whatever the PREVIOUS unrelated posting
  // used, not derived from the item currently being posted -- if "re-use selected data" were
  // clicked as-is, a new item would silently inherit a stale, likely-wrong category (and
  // potentially stale region/location/address too). Two independent signals required before this
  // is treated as the copy-from-previous state, same discipline as isCraigslistPostedConfirmation()
  // above: the URL shape AND either the query-string flag or the page's own prompt copy, so a
  // future Craigslist wording change doesn't silently break detection.
  function isCraigslistCopyFromPreviousPrompt() {
    const urlMatch = location.hostname === 'post.craigslist.org' && /^\/k\//.test(location.pathname);
    if (!urlMatch) return false;
    const search = location.search.toLowerCase();
    const text = bodyText().toLowerCase();
    const signalMatch = search.indexOf('copyfromanother') !== -1 ||
      text.indexOf('re-use selected data from your previous posting') !== -1;
    if (signalMatch) {
      console.log('[FAS Craigslist] copy-from-previous-posting prompt detected -- url=' + location.pathname + location.search);
      return true;
    }
    return false;
  }

  // ---- choose-area confirmation screen detection (S-EXT-CRAIGSLIST-STALL round 6, 2026-08-29)
  // ----
  // A THIRD, previously-unhandled screen seen in the "Post another" continuation flow: Craigslist
  // sometimes re-asks which region to post to. SAME URL SHAPE as the posted-confirmation and
  // copy-from-previous screens (post.craigslist.org/k/<key1>/<key2>), this time with a `?s=area`
  // query string. Confirmed live this session by directly reading location.href + document.title
  // + document.body.innerText against the real screen: href ended in "?s=area", title
  // "kalamazoo | choose area", body asking "which city / area would you like to post to?" with
  // the account's real region (kalamazoo, MI) already shown as the selected/displayed value above
  // a single <select id="ui-id-1" name="n"> region picker and a single <button>continue</button>
  // -- no radios, no map/leaflet element on this screen (confirmed via
  // document.querySelector('#map, .leaflet-container, [class*=map]') returning nothing). This is
  // a DIFFERENT, simpler step than the ?s=geoverify "confirm street address" step (#xstreet0)
  // handled by doGeoverifyStep above -- don't confuse the two. Two independent signals required
  // before this is treated as the choose-area state, same discipline as
  // isCraigslistCopyFromPreviousPrompt() above: the URL shape (?s=area, exact and unambiguous)
  // AND the page's own prompt copy, so a future Craigslist wording change doesn't silently break
  // detection.
  function isCraigslistChooseAreaStep() {
    const urlMatch = location.hostname === 'post.craigslist.org' && /^\/k\//.test(location.pathname) &&
      location.search.toLowerCase().includes('s=area');
    if (!urlMatch) return false;
    const text = bodyText().toLowerCase();
    const textMatch = text.indexOf('which city / area would you like to post to') !== -1;
    if (textMatch) {
      console.log('[FAS Craigslist] choose-area step detected -- url=' + location.pathname + location.search);
      return true;
    }
    console.log('[FAS Craigslist] URL looked like the choose-area step (' + location.pathname + location.search +
      ') but expected page copy was not found -- NOT treating this as choose-area.');
    return false;
  }

  // ---- phone-verification wall detection (informational only, round 8 fix,
  // S-EXT-CRAIGSLIST-STALL round 7) ----
  // CONFIRMED LIVE GAP this round: a real item sat at post.craigslist.org/k/<key1>/<key2> whose
  // body text (independently queried) unambiguously matched isCraigslistPostedConfirmation()'s
  // "thanks for posting" signal, yet the console showed repeated "expected page copy was not
  // found" warnings and doPostedStep() never fired -- zero CRAIGSLIST MarketplaceListingJob rows
  // exist for this item despite it being genuinely live. Most likely explanation: Craigslist's own
  // phone-verification wall (its help docs confirm "some postings may require phone verification")
  // showed at this SAME URL first. Craigslist's real markup for this wall was not reachable to
  // inspect live this session, so this is built defensively off body-copy signals, same two-signal
  // (now three-signal) discipline as every other /k/-URL-shape detector in this file
  // (isCraigslistPostedConfirmation, isCraigslistCopyFromPreviousPrompt,
  // isCraigslistChooseAreaStep above) -- requires "phone" AND a verify/verification signal AND
  // "code" all present so an unrelated page mentioning only one of those words in passing never
  // false-positives into a stall message. This NEVER fills in or submits anything -- entering a
  // real phone code requires a real human with a real phone; it only makes the stall visible
  // instead of silent (see doPhoneVerificationStep() below).
  function isCraigslistPhoneVerificationStep() {
    if (location.hostname !== 'post.craigslist.org') return false;
    const text = bodyText().toLowerCase();
    const hasPhoneSignal = text.indexOf('phone') !== -1;
    const hasVerifySignal = text.indexOf('verify') !== -1 || text.indexOf('verification') !== -1;
    const hasCodeSignal = text.indexOf('code') !== -1;
    if (hasPhoneSignal && hasVerifySignal && hasCodeSignal) {
      console.log('[FAS Craigslist] phone-verification wall detected (best-effort text match) -- url=' + location.pathname + location.search);
      return true;
    }
    return false;
  }

  // ---- step detection: unambiguous DOM anchors first (PostingTitle = edit form, file input =
  // images), then the ?s= URL param / page copy for the radio-list steps. ----
  function detectStep() {
    // DIAGNOSTIC (2026-08-29, S-EXT-CRAIGSLIST-ROUND-11): logs every step-detection evaluation so it's
    // visible in the console whether the category-picker step is ever actually reached at all during a
    // "Post another" continuation post specifically (vs. only on the very first post of a session).
    console.log('[FAS Craigslist DIAG] detectStep evaluating: ' + location.pathname + location.search);
    if (q('#PostingTitle') || q('input[name="PostingTitle"]')) return 'edit';
    if (fileInput()) return 'images';
    const s = norm(new URLSearchParams(location.search).get('s'));
    if (s === 'type' || radioByLabelText('for sale by owner') || /what type of posting/i.test(bodyText())) return 'type';
    if (s === 'cat' || radioByLabelText('general for sale')) return 'cat';
    if (s === 'geoverify' || (q('#xstreet0') && (q('#postal_code') || q('input[name="postal"]')))) return 'geoverify';
    if (s === 'preview' || bodyText().toLowerCase().indexOf('unpublished draft') !== -1) return 'preview';
    if (isCraigslistCopyFromPreviousPrompt()) return 'copyFromPrevious';
    if (isCraigslistPostedConfirmation()) return 'posted';
    if (isCraigslistPhoneVerificationStep()) return 'phoneVerification';
    if (isCraigslistChooseAreaStep()) return 'chooseArea';
    if (s === 'subarea' || s === 'area') return 'subarea';
    return 'unknown';
  }

  // ---- per-step handlers ----
  async function doTypeStep() {
    overlay('<b>FindA.Sale</b> - choosing "for sale by owner"...');
    const radio = radioByLabelText('for sale by owner');
    if (!radio) throw hardError('Type', 'Couldn\'t find the "for sale by owner" option on this Craigslist screen.');
    selectRadio(radio);
    await humanPause(500, 900);
    clickContinueOrThrow('Type');
  }

  async function doCatStep(item) {
    overlay('<b>FindA.Sale</b> - choosing a category...');
    const target = mapCraigslistCategory(item.category);
    // DIAGNOSTIC (2026-08-29, S-EXT-CRAIGSLIST-ROUND-11, Patrick-directed): DB-confirmed correct
    // item.category values (e.g. "Toys & Hobbies", "Musical Instruments & Gear") but every real post
    // tonight landed under "antiques - by owner" regardless of the actual item.
    // mapCraigslistCategory() itself is separately confirmed correct for these cases -- this
    // instrumentation is pure diagnostic, no logic change, so the next live run shows exactly where
    // between "target computed" and "the actual radio Craigslist ends up posting under" the mismatch
    // happens (not reached at all / found but mis-clicked / no fresh category picker on continuation
    // posts at all).
    console.log('[FAS Craigslist DIAG] doCatStep: item.category="' + item.category + '" mappedTarget="' + target + '"');
    // DIAGNOSTIC (2026-08-29, round 12): dumps every radio's own resolved label text on this page --
    // directly confirms or refutes the round-12 root-cause theory (radioLabelTextFor previously
    // falling back to a shared, all-categories-text container) on the next live run.
    console.log('[FAS Craigslist DIAG] doCatStep: radios on page=' +
      Array.from(document.querySelectorAll('input[type="radio"]')).map((r) => '"' + radioLabelTextFor(r) + '"').join(', '));
    let radio = radioByLabelText(target);
    let usedGeneralFallback = false;
    if (!radio && target !== 'general for sale') { radio = radioByLabelText('general for sale'); usedGeneralFallback = true; }
    if (!radio) throw hardError('Category', 'Couldn\'t find a for-sale category to select on this Craigslist screen.');
    console.log('[FAS Craigslist DIAG] doCatStep: radio found=' + !!radio + ' usedGeneralFallback=' + usedGeneralFallback + ' radioLabelText="' + radioLabelTextFor(radio) + '"');
    selectRadio(radio);
    await humanPause(500, 900);
    console.log('[FAS Craigslist DIAG] doCatStep: checked state after select=' + radio.checked + ' label="' + radioLabelTextFor(radio) + '"');
    clickContinueOrThrow('Category');
  }

  async function doGeoverifyStep(item) {
    overlay('<b>FindA.Sale</b> - confirming the sale location...');
    const street = q('#xstreet0');
    if (street && (item.saleAddress || item.address)) setInputValue(street, item.saleAddress || item.address);
    const city = q('#city');
    const cityVal = item.saleCity || item.city || item.geographicArea;
    if (city && cityVal) setInputValue(city, cityVal);
    const postal = q('#postal_code') || q('input[name="postal"]');
    const postalVal = item.saleZip || item.zip || item.postal || item.postalCode;
    if (postal && postalVal) setInputValue(postal, String(postalVal));
    await humanPause(500, 900);
    clickContinueOrThrow('Location');
  }

  async function doEditStep(item) {
    overlay('<b>FindA.Sale</b> - filling the posting form...');
    const title = q('#PostingTitle') || q('input[name="PostingTitle"]');
    if (!title) throw hardError('Details', 'Couldn\'t find the posting Title field.');
    setInputValue(title, item.title);

    // BUG FIX (2026-08-29, round 12, S-EXT-CRAIGSLIST-DUP): price/geo/postal below used to be
    // "fill ONLY when the item carries the data", silently trusting whatever the field already held
    // otherwise -- a "fill only if present" pattern that, if the form handed to this step is ever NOT
    // genuinely empty (browser autofill, or Craigslist's own remembered value from the prior item on
    // this same tab/session -- Fix D above hardens the copy-from-previous "skip" path but doesn't
    // guarantee every individual field came back blank), would silently submit a prior item's price
    // or location under the current item's title/description. Still never INVENTS a value for an
    // item that has none (same intent as the original comment) -- it now actively clears the field to
    // '' in that case instead of leaving whatever was already there.
    const price = q('input[name="price"]') || q('#price');
    if (price) {
      const hasPrice = item.price != null && isFinite(Number(item.price));
      setInputValue(price, hasPrice ? String(Math.max(0, Math.round(Number(item.price)))) : '');
    }

    const geo = q('#geographic_area') || q('input[name="geographic_area"]');
    const geoVal = item.geographicArea || item.city || item.saleCity;
    if (geo) setInputValue(geo, geoVal || '');
    const postal = q('#postal') || q('input[name="postal"]');
    const postalVal = item.postal || item.postalCode || item.zip || item.saleZip;
    if (postal) setInputValue(postal, postalVal || '');

    // Reply-option email (2026-08-06, live-verified selector against a real
    // post.craigslist.org edit-details page: input[name="FromEMail"], no id, no login
    // required -- Craigslist accepts guest posts, it just needs a real email here for its
    // own mail-relay/confirmation. Filled from the organizer's own account email (data we
    // already have) -- never invents one, same rule as the location fields above. Deliberately NOT
    // cleared when absent (round 12, unlike price/geo/postal above): an empty FromEMail is far more
    // likely to block the whole post outright (Craigslist requires a contact email) than to produce a
    // wrong-but-plausible-looking duplicate, so leaving Craigslist's own remembered default here is
    // the safer failure mode, not a staleness risk worth clearing.
    const email = q('input[name="FromEMail"]');
    if (email && item.email) setInputValue(email, item.email);

    const body = q('#PostingBody') || q('textarea[name="PostingBody"]');
    if (!body) throw hardError('Details', 'Couldn\'t find the posting Description field.');
    setInputValue(body, item.description || '');

    // BUG FIX (2026-08-31, live-reproduced -- Patrick stuck on "Please supply a value for the
    // 'condition' field" posting furniture): this field was never filled at all. Only EXISTS
    // for categories that require it (furniture confirmed live; others too) -- categories that
    // don't need it simply have no select[name="condition"] on the page, so the existence check
    // below correctly no-ops for those, not an error. Selector/values live-verified by direct
    // DOM inspection against a real post.craigslist.org furniture posting form: id is a
    // dynamically-generated jQuery UI selectmenu id ("ui-id-1"-style, NOT stable) -- must select
    // by name, not id. Real <option> values: 10=new, 20=like new, 30=excellent, 40=good,
    // 50=fair, 60=salvage. item.condition arrives pre-formatted by the SAME
    // toFacebookCondition() the Facebook channel uses (extensionController.ts:14-21, shared
    // across every platform's queue payload, not Craigslist-specific) -- always exactly one of
    // 'New' / 'Used - Like New' / 'Used - Good' / 'Used - Fair' (that function's own default
    // case covers null/unknown as 'Used - Good', so this should always match in practice; the
    // hardError below is defensive, not expected to fire). Facebook's 4-tier scale doesn't map
    // 1:1 onto Craigslist's 6-tier scale -- "Used - Good" intentionally maps to Craigslist's
    // "good" (not "excellent"), the more conservative/literal match.
    const CL_CONDITION_MAP = {
      'new': '10',
      'used - like new': '20',
      'used - good': '40',
      'used - fair': '50',
    };
    const conditionSelect = q('select[name="condition"]');
    if (conditionSelect) {
      const mapped = item.condition ? CL_CONDITION_MAP[String(item.condition).toLowerCase().trim()] : null;
      if (mapped) {
        setInputValue(conditionSelect, mapped);
      } else {
        throw hardError('Details', 'This item needs a condition to post to this Craigslist category, but its condition ("' + (item.condition || 'not set') + '") could not be matched. Set the item\'s condition in FindA.Sale, then try again.');
      }
    }

    await humanPause(700, 1200);
    clickContinueOrThrow('Details');
  }

  function showReviewOverlay(item, index, total, photosOk) {
    const more = (index + 1) < total;
    overlay('<b>FindA.Sale</b><div style="margin-top:6px">Filled <b>' + escapeHtml(item.title) + '</b> and added its photos.</div>' +
      '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Review the posting, complete any phone/email verification, then click Craigslist\'s <b>publish</b> yourself.</div>' +
      (!photosOk ? '<div style="color:#ffcf7a;margin-top:6px;font-size:12px">Photos may not have attached -- add them on this screen.</div>' : '') +
      // (2026-08-08 fix) Always render the "I posted" confirm button, not just when more items
      // remain in the queue -- previously the LAST item in a queue had no confirm button at all
      // (only "Close"), so a manually-published final item was never recorded as listed either.
      button('fas-cl-next', more ? 'I posted - next item &#9654;' : 'I posted - done', true) +
      button('fas-cl-close', 'Close', false) +
      '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');
    const next = document.getElementById('fas-cl-next');
    if (next) next.onclick = async () => {
      // (2026-08-08 fix) This overlay is shown whenever the automated flow hands off to the
      // human -- "Publish automatically" unchecked, no publish button found (most likely a
      // phone/email/CAPTCHA verification step), or the images-step advance button was missing.
      // The "I posted" label IS the organizer's own confirmation that they completed the
      // posting -- previously this button only advanced the local queue and never told the
      // backend, so the item had NO server-side listed record and kept showing as postable
      // (unfiltered by "Hide items already listed") forever. Same markListed call
      // doPreviewStep's automated-success path already makes; remoteListingId stays null here
      // too (Craigslist's posting flow never exposes a listing id/url to read back, same as the
      // automated path).
      try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: item.id, remoteListingId: null, platform: 'CRAIGSLIST' }); } catch (e) {}
      clearAttempts();
      try { await chrome.runtime.sendMessage({ type: 'advanceCraigslistQueue', itemId: item.id }); } catch (e) {}
      if (more) { location.href = POST_URL; } else { bar && bar.remove(); }
    };
    const close = document.getElementById('fas-cl-close');
    if (close) close.onclick = () => bar && bar.remove();
  }


  async function doImagesStep(item, index, total) {
    clearAttempts(); // reached the end of the automatable flow -- reset guards for the next item
    // BUG FIX (2026-08-29, round 12, S-EXT-CRAIGSLIST-DUP): ROOT CAUSE FOUND BY READING THE CODE --
    // 'fasCLPostedHandled' (set by markCraigslistPostedHandled(), checked by
    // craigslistPostedAlreadyHandled(), both below) was NEVER cleared anywhere in this file.
    // sessionStorage survives same-origin navigation within the posting flow, so once item 1's real
    // /k/ confirmation page set this flag, doPostedStep() silently returned immediately -- before
    // markListed, advanceCraigslistQueue, or the "Post another" click -- for every SUBSEQUENT item's
    // own real confirmation page for the rest of the tab session. That leaves item 2+ never reported
    // to the backend as listed and the queue index never advanced past them, so any retry/resume
    // re-processes and re-publishes an item Craigslist already has a live posting for -- exactly the
    // duplicate "Speaker Cable" / "Mugig Guitar Instrument Cable" postings confirmed live in
    // Patrick's craigslist.org/account screenshot. Cleared HERE rather than inside clearAttempts()
    // itself: clearAttempts() is also called from inside doPostedStep() right after
    // markCraigslistPostedHandled() sets this exact flag for THIS item's own confirmation page --
    // folding the removal into that shared helper would have made doPostedStep() immediately erase
    // its own just-set guard, defeating its bfcache double-handling protection. doImagesStep() runs
    // once per item, before that item ever reaches its own posted-confirmation page, so clearing it
    // here guarantees a clean flag for every item's own eventual 'posted' check without touching
    // doPostedStep()'s own use of it.
    sessionStorage.removeItem('fasCLPostedHandled');
    overlay('<b>FindA.Sale</b> - adding photos...');
    const photosOk = await injectPhotos(item.photoUrls);
    sessionStorage.setItem('fasCLPhotosOk', photosOk ? '1' : '0');
    await humanPause(700, 1200);
    let doneBtn = document.getElementById('doneWithImages');
    if (!doneBtn) {
      // Couldn't find Craigslist's own advance button -- fall back to showing the review overlay
      // right here instead of stranding the human with no guidance.
      showReviewOverlay(item, index, total, photosOk);
      return;
    }
    // BUG FIX 2026-08-19 (S-EXT-BATCH, P1): this used to click doneBtn and return immediately with
    // NO verification the click actually did anything -- unlike doPreviewStep's own
    // waitForCraigslistPublish, which DOES poll. Reported symptom: stuck on the photo-upload page,
    // "moving to review screen" toast never resolves -- most likely the async photo upload hadn't
    // finished settling when the button was clicked, so the click no-op'd (Craigslist's own JS
    // silently ignored it) and nothing here ever noticed. Now polls for a real step change via
    // waitForStepChange, and retries the click once (Craigslist may just need a moment longer)
    // before giving up and handing off to the human with a clear, specific message instead of a
    // toast that just hangs forever.
    overlay('<b>FindA.Sale</b> - moving to the review screen...');
    doneBtn.click(); // -> ?s=preview (unpublished draft, NOT live) if it actually took.
    let advanced = await waitForStepChange('images', 6000);
    if (!advanced) {
      doneBtn = document.getElementById('doneWithImages');
      if (doneBtn) {
        await humanPause(800, 1400);
        doneBtn.click();
        advanced = await waitForStepChange('images', 6000);
      }
    }
    if (!advanced) {
      overlayError('Images', 'Clicked "Done with images" but Craigslist didn\'t move to the review screen -- the photo upload may still be processing. Please check this screen and continue yourself.');
      return;
    }
    // If we get here, a real page navigation happened -- this script instance's job is done; the
    // fresh instance injected on the new page (?s=preview) picks up from run()/detectStep() on its
    // own. No further action needed.
  }

  async function doPreviewStep(item, index, total, autoPublish) {
    const photosOk = sessionStorage.getItem('fasCLPhotosOk') !== '0';
    sessionStorage.removeItem('fasCLPhotosOk');
    if (!autoPublish) { showReviewOverlay(item, index, total, photosOk); return; }
    if (guardStop('preview')) { showReviewOverlay(item, index, total, photosOk); return; }

    const publishBtn = Array.from(document.querySelectorAll('button')).find((b) => norm(b.textContent) === 'publish');
    if (!publishBtn) {
      // No publish button here -- most likely Craigslist inserted a phone/email verification
      // step this script doesn't recognize. Never guess past that; hand off to the human.
      showReviewOverlay(item, index, total, photosOk);
      return;
    }

    overlay('<b>FindA.Sale</b> - publishing <b>' + escapeHtml(item.title) + '</b>...');
    await humanPause(500, 900);
    publishBtn.click();

    const published = await waitForCraigslistPublish(6000);
    if (!published) {
      overlayError('Publish', 'Clicked publish but couldn\'t confirm it went through -- Craigslist may be asking for phone/email verification. Check this listing yourself before assuming it posted.');
      return;
    }

    // ADR-100 (2026-08-06/07): report the confirmed publish server-side so Craigslist listings
    // are tracked at all (previously zero server-side record existed for this channel, see
    // ADR-100 §2.2) and so a renewal-due date gets computed. Reuses the EXISTING 'markListed'
    // message type already handled in background.js -- not a new message. Best-effort: a
    // failure here must never undo or block the publish that already happened.
    try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: item.id, remoteListingId: null, platform: 'CRAIGSLIST' }); } catch (e) {}

    clearAttempts();
    const more = (index + 1) < total;
    // BUG FIX 2026-08-28 (S-EXT-AUTOPUBLISH-STALL-FLEET, same root cause as fas-poshmark.js's,
    // fas-mercari.js's, and fas-grailed.js's identical fixes shipped same session): this tail only
    // runs when autoPublish is true (see the `if (!autoPublish)` guard earlier in doPreviewStep),
    // so a mid-run item must never wait on a manual click to continue.
    if (more) {
      try { await chrome.runtime.sendMessage({ type: 'advanceCraigslistQueue', itemId: item.id }); } catch (e) {}
      overlay('<b>FindA.Sale</b><div style="margin-top:6px">Published <b>' + escapeHtml(item.title) + '</b>.</div>' +
        '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Auto-publish is on -- moving to the next item...</div>' +
        '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');
      await humanPause(600, 1200);
      location.href = POST_URL;
      return;
    }
    overlay('<b>FindA.Sale</b><div style="margin-top:6px">Published <b>' + escapeHtml(item.title) + '</b>.</div>' +
      button('fas-cl-close', 'Close', false) +
      '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');
    const close = document.getElementById('fas-cl-close');
    if (close) close.onclick = () => bar && bar.remove();
  }

  // Handles Craigslist's REAL post-publish confirmation page (post.craigslist.org/k/...).
  // doPreviewStep's own markListed/advanceCraigslistQueue/POST_URL continuation never gets a
  // chance to run here -- Craigslist's publish click causes a genuine full-page navigation to
  // THIS page, which destroys the old page's JS execution context mid-poll (same failure class
  // documented at waitForStepChange above). A fresh script instance loads on this page instead,
  // and this is where that dropped continuation actually gets picked back up. Mirrors
  // doPreviewStep's own success-path shape exactly: markListed always fires (this item genuinely
  // posted); advanceCraigslistQueue + onward navigation only fire when there's a next item to
  // process (a queue-complete last item just sits here, same as doPreviewStep's own !more branch).
  function craigslistPostedAlreadyHandled() { return sessionStorage.getItem('fasCLPostedHandled') === '1'; }
  function markCraigslistPostedHandled() { sessionStorage.setItem('fasCLPostedHandled', '1'); }

  async function doPostedStep(item, index, total) {
    // Guard against double-handling (e.g. a bfcache restore of this exact page) -- markListed and
    // advanceCraigslistQueue must each fire at most once per real publish.
    if (craigslistPostedAlreadyHandled()) return;
    markCraigslistPostedHandled();
    clearAttempts();

    try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: item.id, remoteListingId: null, platform: 'CRAIGSLIST' }); } catch (e) {}

    const more = (index + 1) < total;
    if (!more) {
      overlay('<b>FindA.Sale</b><div style="margin-top:6px">Item posted -- queue complete.</div>' +
        '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Published <b>' + escapeHtml(item.title) + '</b>.</div>' +
        button('fas-cl-posted-close', 'Close', false) +
        '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');
      const closeBtn = document.getElementById('fas-cl-posted-close');
      if (closeBtn) closeBtn.onclick = () => bar && bar.remove();
      return;
    }

    try { await chrome.runtime.sendMessage({ type: 'advanceCraigslistQueue', itemId: item.id }); } catch (e) {}
    overlay('<b>FindA.Sale</b><div style="margin-top:6px">Item posted -- advancing to the next item.</div>' +
      '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Published <b>' + escapeHtml(item.title) + '</b>. Auto-publish is on -- moving to the next item...</div>' +
      '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');
    await humanPause(600, 1200);

    // Prefer Craigslist's own real "Post another" control (confirmed present on this exact
    // confirmation screen) over a hardcoded URL -- lets Craigslist's own flow drive whatever the
    // correct next step actually is, same "click real controls, don't hard-navigate to guessed
    // URLs" lesson already learned on Poshmark. Only fall back to POST_URL if it can't be found.
    const postAnother = Array.from(document.querySelectorAll('a, button')).find((el) => /post another/i.test(el.textContent || ''));
    if (postAnother) {
      console.log('[FAS Craigslist] clicking "Post another" to resume the queue for item', index + 2, 'of', total);
      postAnother.click();
    } else {
      console.log('[FAS Craigslist] "Post another" control not found on the confirmation page -- falling back to POST_URL navigation.');
      location.href = POST_URL;
    }
  }

  // Handles Craigslist's own "copy from previous posting" convenience prompt (see
  // isCraigslistCopyFromPreviousPrompt() above). The safe, simple fix is to click Craigslist's own
  // "skip" button -- found by text match, same defensive approach doPostedStep() already uses to
  // find "Post another" (never a hardcoded selector/id that hasn't been verified live). Clicking
  // "skip" forces a genuinely fresh, empty posting form for the new item, so this file's own
  // existing category/condition/field-filling logic (doTypeStep/doCatStep/doEditStep etc.) runs
  // cleanly from scratch with zero risk of inheriting a stale category -- or stale region/
  // location/address -- from an unrelated prior post. Deliberately does NOT attempt to selectively
  // uncheck just the category checkbox and click "re-use selected data" instead -- skip is
  // simpler, safer, and sidesteps region/location/address reuse risk too (e.g. an organizer
  // running sales from more than one address).
  async function doCopyFromPreviousStep() {
    overlay('<b>FindA.Sale</b> - skipping Craigslist\'s "copy from previous posting" prompt for a clean form...');
    console.log('[FAS Craigslist] copy-from-previous-posting prompt detected, clicking skip for a clean form');
    const findSkipBtn = () => Array.from(document.querySelectorAll('a, button, input[type="submit"], input[type="button"]'))
      .find((el) => norm(el.textContent || el.value) === 'skip');
    let skipBtn = findSkipBtn();
    if (!skipBtn) {
      throw hardError('CopyFromPrevious', 'Couldn\'t find Craigslist\'s "skip" control on the copy-from-previous-posting prompt.');
    }
    await humanPause(400, 800);
    skipBtn.click();
    // BUG FIX (2026-08-29, round 12, S-EXT-CRAIGSLIST-DUP): this used to click skip and return
    // immediately with NO verification the click actually produced a fresh, empty form -- unlike
    // doImagesStep's "Done with images" click, which DOES poll via waitForStepChange. Fire-and-forget
    // here meant a no-op click (Craigslist's own JS not yet settled) would go completely unnoticed,
    // and the next item's flow could carry on filling out whatever form was still showing. Now polls
    // for a real step change the same way doImagesStep does, retries the click once, and hands off to
    // the human with a clear error instead of silently assuming success.
    let advanced = await waitForStepChange('copyFromPrevious', 6000);
    if (!advanced) {
      skipBtn = findSkipBtn();
      if (skipBtn) {
        await humanPause(400, 800);
        skipBtn.click();
        advanced = await waitForStepChange('copyFromPrevious', 6000);
      }
    }
    if (!advanced) {
      throw hardError('CopyFromPrevious', 'Clicked "skip" but Craigslist didn\'t move to a fresh posting form -- please check this screen and continue yourself so a stale category or details don\'t carry over.');
    }
  }

  // Handles the choose-area confirmation screen (see isCraigslistChooseAreaStep() above). The
  // account's correct region is already the pre-filled/displayed value in the <select> -- do NOT
  // attempt to change it (that risks overwriting a correct default with a guess); simply confirm
  // by clicking Craigslist's own "continue" button via the shared continueButton()/
  // clickContinueOrThrow() helpers, same defensive text-match approach doTypeStep()/doCatStep()
  // already use (never a hardcoded selector/id that hasn't been verified live).
  async function doChooseAreaStep() {
    overlay('<b>FindA.Sale</b> - confirming the pre-filled posting region...');
    console.log('[FAS Craigslist] choose-area step detected, clicking continue to confirm the pre-filled region');
    await humanPause(400, 800);
    clickContinueOrThrow('ChooseArea');
  }

  // Handles Craigslist's phone-verification wall (see isCraigslistPhoneVerificationStep() above).
  // Deliberately does NOT attempt to bypass or fill in anything -- a human must receive the real
  // code on a real phone and enter it. This only makes the stall visible and explains what's
  // happening; the MutationObserver re-run wired up in setupReRunObserver() below picks the flow
  // back up automatically once the human finishes and the real confirmation content appears,
  // without requiring a page reload.
  async function doPhoneVerificationStep() {
    overlayInfo('Craigslist needs phone verification for this post -- enter the code you receive, then FindA.Sale will continue automatically once it\'s done.');
  }

  // ---- re-run on client-side content changes (round 8 fix, S-EXT-CRAIGSLIST-STALL round 7) ----
  // start() below only ever called run()/detectStep() ONCE per page load (document_idle
  // injection), matching every prior round's assumption that the next real state always arrives
  // via a fresh full-page navigation (which re-injects this script from scratch). CONFIRMED GAP
  // this round: a real item sat at a posting-confirmation URL whose body text unambiguously
  // matched isCraigslistPostedConfirmation() when queried directly, yet doPostedStep() never
  // fired -- most likely because Craigslist's phone-verification wall showed at that SAME URL
  // first, and once the human completed it, the real confirmation content appeared WITHOUT a
  // fresh navigation (a client-side swap), so this script's one-shot start() never got a chance to
  // re-check. runInFlight/lastObservedStep/currentRunArgs below back a MutationObserver that
  // re-detects the step (debounced) whenever the page's content changes substantially, and only
  // actually re-invokes run() when the DETECTED STEP itself changed -- never on every mutation --
  // so this can't thrash the same handler repeatedly. Reuses the existing guardStop()/
  // attemptCount() loop guard (auto-fill steps) and craigslistPostedAlreadyHandled() (posted step)
  // completely unchanged for the actual re-entrancy protection; runInFlight here additionally
  // prevents two overlapping run() calls if a mutation fires while a previous run() is still
  // mid-await.
  let runInFlight = false;
  let lastObservedStep = null;
  let currentRunArgs = null;

  async function runGuarded(item, index, total, autoPublish) {
    if (runInFlight) return;
    runInFlight = true;
    try {
      await run(item, index, total, autoPublish);
    } catch (e) {
      overlayError((e && e.fasStep) || 'this', (e && e.message) || '');
    } finally {
      runInFlight = false;
    }
  }

  function setupReRunObserver() {
    if (!currentRunArgs || !document.body) return; // nothing queued for this tab -- nothing to watch for
    let debounceTimer = null;
    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (runInFlight || !currentRunArgs) return;
        const step = detectStep();
        if (step === lastObservedStep) return; // no real state change -- don't re-fire the same handler
        lastObservedStep = step;
        runGuarded(currentRunArgs.item, currentRunArgs.index, currentRunArgs.total, currentRunArgs.autoPublish);
      }, 800);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  async function run(item, index, total, autoPublish) {
    const step = detectStep();
    lastObservedStep = step; // keeps the MutationObserver re-run comparison above in sync with
                              // whatever step actually got acted on, whether this run() call came
                              // from start() or from a later mutation-triggered re-check.
    if (step === 'edit') { if (!guardStop('edit')) await doEditStep(item); return; }
    if (step === 'images') { await doImagesStep(item, index, total); return; }
    if (step === 'preview') { await doPreviewStep(item, index, total, autoPublish); return; }
    if (step === 'posted') { await doPostedStep(item, index, total); return; }
    if (step === 'copyFromPrevious') { await doCopyFromPreviousStep(); return; }
    if (step === 'phoneVerification') { await doPhoneVerificationStep(); return; }
    if (step === 'chooseArea') { if (!guardStop('chooseArea')) await doChooseAreaStep(); return; }
    if (step === 'type') { if (!guardStop('type')) await doTypeStep(); return; }
    if (step === 'cat') { if (!guardStop('cat')) await doCatStep(item); return; }
    if (step === 'geoverify') { if (!guardStop('geoverify')) await doGeoverifyStep(item); return; }
    // subarea / area / unrecognized location chooser: we can't pick a location confidently (the
    // item carries no Craigslist area), so guide the human rather than guess.
    overlayInfo('Ready to autofill. Continue through this Craigslist screen -- FindA.Sale takes over at the posting details.');
  }

  // ================================================================================================
  // CROSS-PLATFORM AUTO-REMOVE-ON-SOLD-ELSEWHERE (S-EXT-CROSS-PLATFORM-AUTOREMOVE, 2026-08-22)
  // CODE-ONLY, UNTESTED -- runs on https://www.craigslist.org/account (Patrick-confirmed this
  // page lists every one of the organizer's own postings, 2026-08-22), a different page from the
  // post.craigslist.org/* posting flow this file otherwise handles -- see the location gate at the
  // very bottom of this file that routes between the two. Every selector below is a best-effort
  // guess against Craigslist's classic account-page markup, never live-confirmed (no test account
  // with a real posting existed this session) -- same hard-error/hands-to-human philosophy as the
  // rest of this file: if a confident match can't be found, this stops and asks the organizer to
  // finish it themselves rather than guessing.
  function crRemNorm(s) { return String(s || '').toLowerCase().trim().replace(/\s+/g, ' '); }

  function crRemFindButtonByText(text, root) {
    const wanted = crRemNorm(text);
    const scope = root || document;
    const candidates = Array.from(scope.querySelectorAll('a, button'));
    return candidates.find((el) => crRemNorm(el.textContent).includes(wanted)) || null;
  }

  // Craigslist's account page traditionally lists each posting as a row/list-item containing the
  // title link plus its own "delete" action inline (no separate detail-page visit needed) --
  // UNVERIFIED against the real current markup. Walks up from the matching title link to a
  // reasonably-sized ancestor container and looks for a delete control inside that same container,
  // so it doesn't accidentally click a delete link belonging to a different posting.
  function findCraigslistPostingRowByTitle(title) {
    const wanted = crRemNorm(title);
    const links = Array.from(document.querySelectorAll('a'));
    const scored = links
      .map((a) => ({ a, t: crRemNorm(a.textContent) }))
      .filter((x) => x.t.length > 0);
    const exact = scored.filter((x) => x.t === wanted);
    const contains = exact.length ? exact : scored.filter((x) => x.t.includes(wanted) || wanted.includes(x.t));
    if (contains.length !== 1) return null; // zero or ambiguous matches -- never guess
    let node = contains[0].a;
    for (let i = 0; i < 6 && node.parentElement; i++) {
      node = node.parentElement;
      if (crRemFindButtonByText('delete', node)) return node;
    }
    return null; // title matched but no delete control found nearby -- hand off, don't guess further
  }

  async function deleteCraigslistPostingRow(row) {
    const del = crRemFindButtonByText('delete', row);
    if (!del) return 'no_delete_control';
    del.click(); // Craigslist's classic delete flow is a full-page navigation to a confirm screen
    return 'navigated';
  }

  // If this load IS the post-delete-click confirm screen, finish it. Best-effort text match --
  // UNVERIFIED, never live-confirmed.
  async function tryCompleteCraigslistDeleteConfirm() {
    if (!/delete/i.test(location.href) && !/delete/i.test(bodyText().slice(0, 400))) return false;
    const confirmBtn = crRemFindButtonByText('delete', document) || crRemFindButtonByText('yes', document);
    if (!confirmBtn) return false;
    confirmBtn.click();
    return true;
  }

  async function reportCraigslistRemoved(item) {
    try { await chrome.runtime.sendMessage({ type: 'markItemRemovedByRemoval', itemId: item.id, platform: 'CRAIGSLIST' }); } catch (e) {}
    try { await chrome.runtime.sendMessage({ type: 'advanceRemovalQueueFor', platform: 'CRAIGSLIST' }); } catch (e) {}
  }

  async function runCraigslistRemovalQueue(item, index, total) {
    overlayInfo('This item sold elsewhere -- looking for the matching Craigslist posting for <b>' + escapeHtml(item.title) + '</b> to remove it...');
    if (await tryCompleteCraigslistDeleteConfirm()) {
      await sleep(600);
      await reportCraigslistRemoved(item);
      const more = (index + 1) < total;
      overlay('<b>FindA.Sale</b><div style="margin-top:6px">Removed the Craigslist posting for <b>' + escapeHtml(item.title) + '</b> (please double-check it\'s gone -- this was not live-verified).</div>' +
        (more ? button('fas-cl-removed-next', 'Next item &#9654;', true) : '') +
        button('fas-cl-close', 'Close', false));
      const next = document.getElementById('fas-cl-removed-next');
      // NOTE: CFG is not injected into this content script's world (only background.js
      // imports config.js) -- inlined the literal URL rather than referencing CFG directly
      // (caught before push, same class of bug found and fixed in fas-poshmark.js/
      // fas-mercari.js/fas-grailed.js's removal blocks).
      if (next) next.onclick = () => { location.href = 'https://www.craigslist.org/account'; };
      const close = document.getElementById('fas-cl-close');
      if (close) close.onclick = () => bar && bar.remove();
      return;
    }
    const row = findCraigslistPostingRowByTitle(item.title);
    if (!row) {
      overlay('<b>FindA.Sale</b><div style="margin-top:6px;color:#ffcf7a">Could not find a Craigslist posting matching "' + escapeHtml(item.title) + '" on this page (UNVERIFIED selectors) -- please delete it yourself.</div>' + button('fas-cl-close', 'Close', false));
      const close = document.getElementById('fas-cl-close');
      if (close) close.onclick = () => bar && bar.remove();
      try { await chrome.runtime.sendMessage({ type: 'advanceRemovalQueueFor', platform: 'CRAIGSLIST' }); } catch (e) {}
      return;
    }
    const result = await deleteCraigslistPostingRow(row);
    if (result !== 'navigated') {
      overlay('<b>FindA.Sale</b><div style="margin-top:6px;color:#ffcf7a">Found the posting but no delete control (UNVERIFIED selectors -- reason: ' + result + ') -- please delete it yourself.</div>' + button('fas-cl-close', 'Close', false));
      const close = document.getElementById('fas-cl-close');
      if (close) close.onclick = () => bar && bar.remove();
      try { await chrome.runtime.sendMessage({ type: 'advanceRemovalQueueFor', platform: 'CRAIGSLIST' }); } catch (e) {}
    }
    // else: the click navigated to a confirm screen -- this same function re-runs on that next
    // load via maybeRunCraigslistRemoval() and completes via tryCompleteCraigslistDeleteConfirm().
  }

  async function maybeRunCraigslistRemoval() {
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getRemovalQueueItemFor', platform: 'CRAIGSLIST' }); } catch (e) { return false; }
    if (!queued || !queued.ok || !queued.item) return false;
    try {
      await runCraigslistRemovalQueue(queued.item, queued.index, queued.total);
    } catch (e) {
      overlay('<b>FindA.Sale</b><div style="margin-top:6px;color:#ffcf7a">Something went wrong removing this Craigslist posting (' + escapeHtml((e && e.message) || 'unknown error') + '). Please remove it yourself.</div>' + button('fas-cl-close', 'Close', false));
      const close = document.getElementById('fas-cl-close');
      if (close) close.onclick = () => bar && bar.remove();
    }
    return true;
  }

  async function start() {
    await sleep(500); // let the page settle before reading the DOM
    // (2026-08-08) Independent of whatever's queued -- runs on every post.craigslist.org load,
    // same "always run" pattern as fas-remove.js's sold-detection scan.
    reportLoginState();
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getCraigslistQueueItem' }); } catch (e) { return; }
    if (!queued || !queued.ok || !queued.item) return; // nothing queued -- stay silent (page also loads for normal use)
    currentRunArgs = { item: queued.item, index: queued.index, total: queued.total, autoPublish: queued.autoPublish !== false };
    // Watch for client-side content changes (round 8 fix -- see setupReRunObserver() above) BEFORE
    // the first run so a transition that happens mid-run() (e.g. verification wall clearing while
    // the first run() call is still resolving) is never missed.
    setupReRunObserver();
    await runGuarded(currentRunArgs.item, currentRunArgs.index, currentRunArgs.total, currentRunArgs.autoPublish);
  }

  // Location gate: the account/my-listings page (removal flow) is a different page from the
  // post.craigslist.org posting flow this file otherwise handles -- only one of the two ever
  // applies on a given load.
  (async () => {
    const onAccountPage = location.hostname === 'www.craigslist.org' && location.pathname.indexOf('/account') === 0;
    if (onAccountPage) { await maybeRunCraigslistRemoval(); return; }
    start();
  })();
})();
