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
  function clearAttempts() { ['subarea', 'type', 'cat', 'geoverify', 'edit', 'preview'].forEach((s) => sessionStorage.removeItem('fasCLAttempt_' + s)); }
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

  // Find a radio (for-sale-by-owner / category list) whose label (or row) text contains `target`.
  function radioByLabelText(target) {
    const want = norm(target);
    const labels = Array.from(document.querySelectorAll('label'));
    for (const lab of labels) {
      const radio = lab.querySelector('input[type="radio"]');
      if (radio && norm(lab.textContent).indexOf(want) !== -1) return radio;
    }
    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
    for (const radio of radios) {
      const row = radio.closest('li') || radio.parentElement;
      if (row && norm(row.textContent).indexOf(want) !== -1) return radio;
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

  // ---- step detection: unambiguous DOM anchors first (PostingTitle = edit form, file input =
  // images), then the ?s= URL param / page copy for the radio-list steps. ----
  function detectStep() {
    if (q('#PostingTitle') || q('input[name="PostingTitle"]')) return 'edit';
    if (fileInput()) return 'images';
    const s = norm(new URLSearchParams(location.search).get('s'));
    if (s === 'type' || radioByLabelText('for sale by owner') || /what type of posting/i.test(bodyText())) return 'type';
    if (s === 'cat' || radioByLabelText('general for sale')) return 'cat';
    if (s === 'geoverify' || (q('#xstreet0') && (q('#postal_code') || q('input[name="postal"]')))) return 'geoverify';
    if (s === 'preview' || bodyText().toLowerCase().indexOf('unpublished draft') !== -1) return 'preview';
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
    let radio = radioByLabelText(target);
    if (!radio && target !== 'general for sale') radio = radioByLabelText('general for sale');
    if (!radio) throw hardError('Category', 'Couldn\'t find a for-sale category to select on this Craigslist screen.');
    selectRadio(radio);
    await humanPause(500, 900);
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

    const price = q('input[name="price"]') || q('#price');
    if (price && item.price != null && isFinite(Number(item.price))) {
      setInputValue(price, String(Math.max(0, Math.round(Number(item.price)))));
    }

    // Location fields: fill ONLY when the item carries the data -- never invent a city or ZIP
    // (Craigslist requires postal, so a missing value is simply left for the human, who owns the
    // final review + publish anyway).
    const geo = q('#geographic_area') || q('input[name="geographic_area"]');
    const geoVal = item.geographicArea || item.city || item.saleCity;
    if (geo && geoVal) setInputValue(geo, geoVal);
    const postal = q('#postal') || q('input[name="postal"]');
    const postalVal = item.postal || item.postalCode || item.zip || item.saleZip;
    if (postal && postalVal) setInputValue(postal, String(postalVal));

    // Reply-option email (2026-08-06, live-verified selector against a real
    // post.craigslist.org edit-details page: input[name="FromEMail"], no id, no login
    // required -- Craigslist accepts guest posts, it just needs a real email here for its
    // own mail-relay/confirmation. Filled from the organizer's own account email (data we
    // already have) -- never invents one, same rule as the location fields above.
    const email = q('input[name="FromEMail"]');
    if (email && item.email) setInputValue(email, item.email);

    const body = q('#PostingBody') || q('textarea[name="PostingBody"]');
    if (!body) throw hardError('Details', 'Couldn\'t find the posting Description field.');
    setInputValue(body, item.description || '');

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
      try { await chrome.runtime.sendMessage({ type: 'advanceCraigslistQueue' }); } catch (e) {}
      if (more) { location.href = POST_URL; } else { bar && bar.remove(); }
    };
    const close = document.getElementById('fas-cl-close');
    if (close) close.onclick = () => bar && bar.remove();
  }


  async function doImagesStep(item, index, total) {
    clearAttempts(); // reached the end of the automatable flow -- reset guards for the next item
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
      try { await chrome.runtime.sendMessage({ type: 'advanceCraigslistQueue' }); } catch (e) {}
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

  async function run(item, index, total, autoPublish) {
    const step = detectStep();
    if (step === 'edit') { if (!guardStop('edit')) await doEditStep(item); return; }
    if (step === 'images') { await doImagesStep(item, index, total); return; }
    if (step === 'preview') { await doPreviewStep(item, index, total, autoPublish); return; }
    if (step === 'type') { if (!guardStop('type')) await doTypeStep(); return; }
    if (step === 'cat') { if (!guardStop('cat')) await doCatStep(item); return; }
    if (step === 'geoverify') { if (!guardStop('geoverify')) await doGeoverifyStep(item); return; }
    // subarea / area / unrecognized location chooser: we can't pick a location confidently (the
    // item carries no Craigslist area), so guide the human rather than guess.
    overlayInfo('Ready to autofill. Choose your Craigslist location/area on this screen and continue - FindA.Sale takes over at the posting details.');
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
    try {
      await run(queued.item, queued.index, queued.total, queued.autoPublish !== false);
    } catch (e) {
      overlayError((e && e.fasStep) || 'this', (e && e.message) || '');
    }
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
