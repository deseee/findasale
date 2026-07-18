/* FindA.Sale — content script on facebook.com/marketplace/create/*.
 * Fills each queued item and auto-advances through every Facebook step, clicking
 * Publish itself unless the organizer unchecked "Publish automatically" in the popup
 * (autoPublish flag, threaded from popup.js -> background.js storage -> here). Stops
 * immediately on any hard error. ADR-084 amendment 2026-07-15. Selectors come from
 * fas-selectors.js.
 */
(function () {
  const SEL = window.__FAS_SEL__;
  if (!SEL) return;
  const LABELS = SEL.LABELS;

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  const realClick = SEL.realClick; // shared with fas-remove.js -- see fas-selectors.js

  function waitFor(getter, timeout = 12000) {
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

  // React-controlled inputs ignore a plain .value = x; use the native setter then
  // dispatch input so React's onChange fires.
  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function fillText(labelText, value) {
    if (value === undefined || value === null || value === '') return true;
    const el = SEL.fieldByLabel(labelText);
    if (!el) return false;
    el.focus();
    setNativeValue(el, String(value));
    await sleep(120);
    return true;
  }

  async function selectCombo(labelText, value) {
    if (!value) return true;
    const combo = SEL.comboByLabel(labelText);
    if (!combo) return false;
    await realClick(combo);
    try {
      const opt = await waitFor(() => SEL.optionByText(value), 3000);
      await realClick(opt);
      await sleep(150);
      return true;
    } catch (e) {
      // Close the open listbox; category/condition is best-effort, never a blocker.
      await realClick(document.body);
      return false;
    }
  }

  // Facebook REQUIRES Condition. The backend (extensionController.toFacebookCondition) already
  // maps our enum to Facebook's exact option labels ("New" / "Used - Like New" / "Used - Good" /
  // "Used - Fair"), so item.condition normally arrives pre-formatted. This map is a defensive,
  // case-insensitive fallback in case a raw enum value (NEW / USED / USED_GOOD ...) ever reaches
  // the extension directly, and it passes through already-formatted FB labels untouched.
  const FB_CONDITIONS = ['New', 'Used - Like New', 'Used - Good', 'Used - Fair'];
  function mapCondition(raw) {
    const v = String(raw == null ? '' : raw).trim();
    if (!v) return null;
    const exact = FB_CONDITIONS.find((c) => c.toLowerCase() === v.toLowerCase());
    if (exact) return exact;
    switch (v.toUpperCase().replace(/[\s-]+/g, '_')) {
      case 'NEW': return 'New';
      case 'USED_LIKE_NEW':
      case 'LIKE_NEW':
      case 'REFURBISHED': return 'Used - Like New';
      case 'USED_FAIR':
      case 'FAIR':
      case 'PARTS_OR_REPAIR': return 'Used - Fair';
      case 'USED':
      case 'USED_GOOD':
      case 'GOOD': return 'Used - Good';
      default: return 'Used - Good'; // unknown USED variant -> sensible default
    }
  }

  // True once Facebook's Condition combo displays the chosen value (its floating "Condition"
  // label persists and the selected text is appended to the trigger's accessible text).
  function comboShowsValue(labelText, value) {
    const combo = SEL.comboByLabel(labelText);
    if (!combo) return false;
    return SEL.norm(combo.textContent).includes(SEL.norm(value));
  }

  // Condition is a REQUIRED Facebook field, so it gets the fail-loud treatment (unlike Category,
  // which is genuinely optional). Root cause of the intermittent stall (observed live 2026-07-16:
  // same item filled "New" on one run, left blank on the next): selectCombo() opened the combo
  // exactly once and, if Facebook's React hadn't attached the combobox's click handler yet OR the
  // CDP open-click raced FB's own handlers, the listbox never rendered, optionByText timed out,
  // and the miss was swallowed silently -- leaving Next disabled and the run dying LATER on a
  // misleading "Category may still be unset" error at the step-transition check. This retries the
  // open+select up to 3 times, waiting for the listbox to actually render each attempt (mirroring
  // how the Delivery/weight steps wait), verifies the value took, and hard-errors HERE if it still
  // can't be set -- stopping loudly at the right step instead of proceeding into a disabled Next.
  async function selectConditionRequired(rawValue) {
    const value = mapCondition(rawValue);
    if (!value) {
      throw hardError('Item details', 'This item has no condition set, but Facebook requires one -- set the item\'s condition in FindA.Sale, then try again.');
    }
    if (comboShowsValue(LABELS.condition, value)) return true; // already set (e.g. re-entry after a stop)
    let clicked = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const combo = SEL.comboByLabel(LABELS.condition);
      if (!combo) { await sleep(400); continue; } // combo not rendered yet -- wait and retry
      await realClick(combo);
      let opt = null;
      try { opt = await waitFor(() => SEL.optionByText(value), 2500); } catch (e) { opt = null; }
      if (opt) {
        await realClick(opt);
        clicked = true;
        await sleep(250);
        if (comboShowsValue(LABELS.condition, value)) return true; // confirmed set
      }
      // Missed this round -- close any open listbox before retrying so the next open is clean.
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(400);
    }
    // We clicked a rendered, matching option via trusted (CDP) input at least once but the trigger
    // text couldn't be confirmed -- treat as set rather than risk a false stop on a listing that
    // actually filled. Only a genuine never-opened / no-option-rendered case falls through to the
    // hard error below (the exact silent-miss that caused the stall).
    if (clicked) return true;
    throw hardError('Item details', 'Couldn\'t set the required Condition ("' + value + '") -- the dropdown didn\'t open or had no matching option after several tries. Set the condition yourself, then reopen the extension to continue.');
  }

  // Facebook's Category field renders AI-suggested chips (div[role="button"]), not the
  // [role="option"] listbox selectCombo() expects — confirmed live 2026-07-15 (see
  // fas-selectors.js categoryChips/bestTextMatch). This tries the chip path first, falls back to
  // the old listbox path in case FB shows a normal dropdown for some listing types, and — if
  // neither finds a confident match — returns the live suggestion text so fillItem() can tell
  // the organizer what to pick instead of silently leaving Category empty.
  // True while Facebook's inline "Please select a category" validation prompt is still on screen
  // -- used to confirm the chip click actually registered a category before we advance.
  function categoryPromptShowing() {
    return /please select a category/i.test((document.body && document.body.innerText) || '');
  }

  // Independent positive confirmation that a category actually registered. Do NOT trust the
  // document.body.innerText "please select a category" scan alone: clicking FB's description-field
  // prompt briefly mutates page text enough to make that string vanish, faking success (confirmed
  // live 2026-07-17). Returns the name of the positive signal that passed, or null if none did.
  function categorySetSignal(combo, pickedText) {
    const want = SEL.norm(pickedText || '');
    // (a) the Category combobox now DISPLAYS the picked value (not just the bare "Category" label).
    const comboTxt = SEL.norm((combo && combo.textContent) || '');
    if (want && comboTxt !== 'category' && comboTxt.indexOf(want) !== -1) return 'combo-value';
    // (b) alternative signal: Facebook's step "Next" button is no longer disabled.
    const next = SEL.elementByText('Next');
    if (next && !SEL.isDisabled(next)) return 'next-enabled';
    return null;
  }

  // A category click counts as success ONLY when BOTH hold: (a) the "please select a category"
  // prompt is gone, AND (b) an independent positive signal (categorySetSignal) confirms it.
  // Returns the passing signal name (truthy) or null.
  function categoryConfirmed(combo, pickedText) {
    if (categoryPromptShowing()) return null;
    return categorySetSignal(combo, pickedText);
  }

  async function selectCategory(value) {
    const combo = SEL.comboByLabel(LABELS.category);
    if (!combo) return { ok: !value, suggestions: [] }; // structural miss only matters if FB actually requires a value we can't set
    // PERSISTENT-CHIP-FIRST (confirmed live 2026-07-17): FB renders its top category suggestion as
    // an always-visible div[role="button"] chip beneath the Category field. A DIRECT real click on
    // that chip -- WITHOUT opening the combobox -- SETS the category and clears the "Please select
    // a category" prompt (verified live: prompt gone, combo text became the category). Opening the
    // combobox FIRST swaps the UI (category search field/modal), so the persistent chip is no
    // longer a valid target and the pick fails -> Category stays unset -> FB blocks "Next". So we
    // try the persistent chip BEFORE ever opening the combo.
    // POLL for a persistent chip before concluding there is none. FB renders its suggested
    // category chip a beat AFTER title/description are filled; snapshotting once can run before the
    // chip exists (length 0) and wrongly fall through to opening the combo -- which swaps the UI
    // and leaves Category unset (confirmed live 2026-07-17). Wait up to ~5s for the chip to appear.
    const t0 = Date.now();
    // Wait for the RIGHT persistent chip: poll (via waitFor's MutationObserver) until a CONFIDENT
    // bestTextMatch against `value` appears. FB renders its real category chip a beat AFTER
    // title/description fill; the junk description-field prompt renders first. We NEVER click
    // persistent[0] blindly when we have a value to match -- that previously grabbed the
    // "attract more interest..." prompt and faked success (confirmed live 2026-07-17).
    let confidentPick = null;
    if (value) {
      try {
        confidentPick = await waitFor(
          () => SEL.bestTextMatch(SEL.persistentCategoryChips(combo), value), 6000);
      } catch (e) { /* no confident chip in time -- fall through to the combo path below */ }
    } else {
      // No value to match against -- keep prior no-value behavior: click FB's own top persistent
      // suggestion (persistent[0]) if one appears.
      try { await waitFor(() => SEL.persistentCategoryChips(combo).length > 0, 5000); } catch (e) { /* none */ }
      confidentPick = (SEL.persistentCategoryChips(combo) || [])[0] || null;
    }
    if (confidentPick) {
      const pickText = SEL.norm(confidentPick.textContent);
      console.info('[FAS category] persistent chip chosen:', JSON.stringify(pickText),
        '(confident match:', !!value, ') after', (Date.now() - t0) + 'ms');
      await realClick(confidentPick); // direct CDP click -- combobox is NOT opened
      await sleep(200);
      let signal = value ? categoryConfirmed(combo, pickText)
                         : (!categoryPromptShowing() ? 'prompt-cleared' : null);
      if (signal) {
        console.info('[FAS category] category SET -- confirmation signal:', signal);
        return { ok: !!value, suggestions: [] };
      }
      // Not confirmed -- retry ONCE with a freshly-fetched chip (fresh coords; the first realClick
      // scrolls the page, so the original element's cached rect can be stale).
      console.info('[FAS category] confirmation failed after first click -- retrying with fresh chip');
      const fresh = value ? SEL.bestTextMatch(SEL.persistentCategoryChips(combo), value)
                          : ((SEL.persistentCategoryChips(combo) || [])[0] || null);
      if (fresh) {
        const freshText = SEL.norm(fresh.textContent);
        await realClick(fresh);
        await sleep(200);
        signal = value ? categoryConfirmed(combo, freshText)
                       : (!categoryPromptShowing() ? 'prompt-cleared' : null);
        if (signal) {
          console.info('[FAS category] category SET on retry -- confirmation signal:', signal);
          return { ok: !!value, suggestions: [] };
        }
      }
      // Chip path unconfirmed; fall through to opening the combo.
      console.info('[FAS category] persistent chip clicks not confirmed -- falling back to combo path');
    } else {
      console.info('[FAS category] no confident persistent chip within timeout -- opening combo');
    }
    // FALLBACK: no persistent chip (or the direct click didn't take). Open the combo and use the
    // union of persistent + newly-appeared chips -- FB renders its top category suggestion as a
    // PERSISTENT chip already present before the combo is clicked, which the old before/after diff
    // (chipsAfter) missed, leaving Category UNSET and stalling the whole listing at "Item details"
    // (confirmed live 2026-07-17, see fas-selectors.js categoryChips).
    const chips = await SEL.categoryChips(combo, () => realClick(combo), 500);
    if (!chips.length) {
      if (!value) { await realClick(document.body); return { ok: true }; }
      try {
        const opt = await waitFor(() => SEL.optionByText(value), 2000);
        await realClick(opt);
        await sleep(150);
        return { ok: true };
      } catch (e) {
        await realClick(document.body);
        return { ok: false, suggestions: [] };
      }
    }
    // Facebook REQUIRES a category to proceed past Item details -- confirmed live 2026-07-15
    // (Next silently no-ops with a "Please select a category" inline prompt otherwise). Try to
    // match our value against Facebook's own suggestion chips; if there's no value at all, or
    // no confident match, fall back to Facebook's own top-ranked suggestion (chips[0]) rather
    // than leaving it empty -- an unconfident pick is still far better than a run that can never
    // advance. For the confirmed single-visible-chip case this MUST click that chip.
    const match = value ? SEL.bestTextMatch(chips, value) : null;
    const picked = match || chips[0];
    await realClick(picked);
    await sleep(200);
    // Confirm the pick registered -- do NOT trust the "please select a category" innerText scan
    // alone (see categoryConfirmed). If unconfirmed (prompt lingering OR no positive signal),
    // re-collect chips and try once more before giving up.
    if (!categoryConfirmed(combo, SEL.norm(picked.textContent))) {
      console.info('[FAS category] combo pick unconfirmed -- re-collecting chips and retrying once');
      const chips2 = await SEL.categoryChips(combo, () => realClick(combo), 500);
      if (chips2.length) {
        const retry = (value ? SEL.bestTextMatch(chips2, value) : null) || chips2[0];
        await realClick(retry);
        await sleep(200);
      }
    }
    return { ok: !!match, suggestions: match ? [] : chips.map((c) => SEL.norm(c.textContent)).filter(Boolean) };
  }

  async function injectPhotos(urls) {
    if (!urls || !urls.length) return false;
    const resp = await chrome.runtime.sendMessage({ type: 'fetchPhotos', urls });
    if (!resp || !resp.ok || !resp.dataUrls.length) return false;
    const input = SEL.photoInput();
    if (!input) return false;
    const dt = new DataTransfer();
    resp.dataUrls.forEach((durl, i) => {
      const [meta, b64] = durl.split(',');
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

  // ---- overlay UI ----
  let bar;
  function overlay(html) {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'fas-bar';
      bar.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:340px;' +
        'background:#1f2a24;color:#f3f5f2;border:1px solid #3c8c5a;border-radius:12px;padding:14px 16px;' +
        'font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.4)';
      document.documentElement.appendChild(bar);
    }
    bar.innerHTML = html;
  }
  function btn(id, label, primary) {
    return '<button id="' + id + '" style="margin-top:10px;margin-right:8px;padding:7px 12px;border-radius:8px;border:none;cursor:pointer;' +
      'font-weight:600;font-size:13px;background:' + (primary ? '#3c8c5a' : '#3a4842') + ';color:#fff">' + label + '</button>';
  }

  async function humanPause(minMs, maxMs) {
    await sleep(minMs + Math.random() * (maxMs - minMs));
  }

  function hardError(step, detail) {
    const e = new Error(detail || ('Could not find what I expected on the ' + step + ' step.'));
    e.fasStep = step;
    return e;
  }

  // FB's fixed weight-bucket radios (confirmed live 2026-07-15, see fas-selectors.js
  // radioLabelByText). packageWeightOz is ounces; falls back to a mid-range bucket when the
  // item has no weight data at all -- FB reconciles any difference against actual weight at
  // ship time, so a mid-range guess here is low-stakes, not something worth a hard stop over.
  function weightBucketLabel(oz) {
    if (oz === undefined || oz === null || isNaN(oz)) return '1-2 lbs';
    const lbs = oz / 16;
    if (lbs < 0.5) return 'Under 0.5 lbs';
    if (lbs <= 1) return '0.5-1 lbs';
    if (lbs <= 2) return '1-2 lbs';
    if (lbs <= 5) return '2-5 lbs';
    if (lbs <= 10) return '5-10 lbs';
    return '10-70 lbs';
  }

  // Wait for `getter()` to find an element, pause (human-paced), then click it -- but re-run
  // `getter()` fresh immediately before the click rather than reusing the element captured
  // earlier. Confirmed live 2026-07-15: Facebook's React can replace a just-opened modal's
  // contents shortly after it renders, so a reference captured by `waitFor` and clicked after
  // even a few hundred ms can be silently detached -- the click fires, nothing happens, no
  // error is thrown, and the run falsely believes it succeeded. Re-querying right before the
  // click closes that gap.
  async function waitThenClick(getter, step, detail, timeout) {
    let el;
    try {
      el = await waitFor(getter, timeout || 8000);
    } catch (e) {
      throw hardError(step, detail);
    }
    await humanPause(350, 800);
    const fresh = getter() || el;
    await realClick(fresh);
    return fresh;
  }

  // Click a step-advance button ("Next" / "Publish" / "Update") by its exact accessible text.
  // Not finding it within timeout is always a HARD ERROR per ADR-084's 2026-07-15 amendment --
  // there is no safe way to keep going if Facebook's own navigation control isn't where expected.
  function clickButton(text, step, timeout) {
    return waitThenClick(() => SEL.elementByText(text), step, 'Couldn\'t find the "' + text + '" button.', timeout);
  }

  // Confirm Facebook's own URL actually carries the expected ?step=... param -- the real
  // signal that a Next click landed, not just "a Next button exists somewhere" (ambiguous,
  // since several steps share that label -- see fillItem's step-transition comments).
  function waitForStep(stepName, timeout) {
    return waitFor(() => (location.href.indexOf('step=' + stepName) !== -1 ? true : null), timeout);
  }

  // Delivery step: pick the weight bucket. Shipping carrier + Shipping option self-populate
  // with Facebook's own sensible defaults once a weight is set (confirmed live 2026-07-15 --
  // "Prepaid shipping label" and a real carrier quote both appear automatically) so no separate
  // fill is needed for those two fields.
  //
  // ADR-084 amendment 2026-07-15 (Part B) -- mirrors eBay's LOCAL_PICKUP_ONLY handling
  // (Item.ebayShippingOverride, same field/values eBay already reads): when set, switch
  // Facebook's own "Delivery method" dropdown (default "Shipping & local pickup", confirmed
  // live) to its local-pickup option instead, and skip the weight/carrier sub-flow entirely --
  // there is no shipping label to configure for a pickup-only item. Facebook's exact option
  // wording was NOT live-verified this dispatch (creating a throwaway test listing to inspect
  // it was correctly blocked as a real-world action) -- matched by fuzzy substring ("pickup")
  // via the existing optionByText fallback rather than an exact hardcoded string, and this is a
  // HARD ERROR (not an auto-resolve) if no matching option is found, since silently leaving an
  // item shippable when the organizer marked it pickup-only is a real incorrect listing, not a
  // low-stakes guess like Category.
  async function fillDeliveryStep(item) {
    if (item.shippingOverride === 'LOCAL_PICKUP_ONLY') {
      // 2026-07-16 fix (DOM-verified live): open FB's "Delivery method" dropdown, then UNCHECK the
      // "Shipping" item (leaving "Local pickup" checked). FB renders these as role="menuitemcheckbox"
      // items inside the opened combo -- NOT role="option" (old optionByText('pickup') never matched)
      // and NOT role="checkbox". Both are aria-checked=true by default.
      await waitThenClick(() => SEL.comboByLabel('Delivery method'), 'Delivery',
        'Couldn\'t find the Delivery method control.', 8000);
      await humanPause(300, 600); // let the dropdown menu render
      const shipItem = await waitFor(() => SEL.menuCheckboxByText('Shipping'), 5000);
      if (!shipItem) {
        throw hardError('Delivery', 'Couldn\'t find the "Shipping" option in the Delivery method menu -- Facebook\'s layout may have changed.');
      }
      if (SEL.isMenuChecked(shipItem)) { await SEL.realClick(shipItem); await humanPause(300, 600); }
      const pickupItem = SEL.menuCheckboxByText('Local pickup');
      if (pickupItem && !SEL.isMenuChecked(pickupItem)) { await SEL.realClick(pickupItem); await humanPause(300, 600); }
      // Close the menu so the step's Next control is reachable again.
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await humanPause(300, 600);
      return { mode: 'pickup' };
    }

    await waitThenClick(() => SEL.elementByText('Select shipping label'), 'Delivery',
      'Couldn\'t find the shipping label control.', 8000);
    await humanPause(400, 700); // let the "Change shipping method" modal fully render

    // The modal opens with Package weight collapsed -- its radio options only render after
    // clicking the "Package weight" combobox row inside it (confirmed live 2026-07-15).
    await waitThenClick(() => SEL.comboByLabel('Package weight'), 'Delivery',
      'Couldn\'t find the Package weight control.', 5000);

    const bucket = weightBucketLabel(
      item.packageWeightOz !== undefined && item.packageWeightOz !== null ? item.packageWeightOz : item.aiPackageWeightOz
    );
    const weightWrapper = await waitThenClick(() => SEL.radioLabelByText(bucket), 'Delivery',
      'Couldn\'t find the "' + bucket + '" weight option.', 5000);

    // 2026-07-18 fix (Patrick live report + live DOM investigation, Hofnar tin
    // cmrqpqatn005ul0sum3ij77kx): waitThenClick above only proves a click event sequence was
    // DISPATCHED at the matched radio -- not that Facebook committed the selection. First fix
    // attempt used a single short pause (400-800ms) then one immediate retry, which turned out
    // to be the wrong theory: LIVE TESTING (javascript_tool against the real page, same day)
    // proved this is NOT a broken click or a bucket-specific quirk -- Facebook's commit here is
    // genuinely ASYNCHRONOUS and can take several seconds (it appears to fire a shipping-rate
    // quote fetch on selection, the same class of async commit already documented below for the
    // "Update" button's modal-close). A short fixed pause was seeing a false "not checked yet"
    // reading moments before Facebook actually caught up. Fix: POLL for aria-checked to flip
    // (mirrors the existing Update-button poll pattern in this same function) for up to ~6s
    // before concluding it truly didn't register; only THEN retry the click once, poll again,
    // and only hard-error if it's still unchecked after that second poll.
    async function pollRadioChecked(wrapper, timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (SEL.isRadioChecked(wrapper)) return true;
        await sleep(300);
      }
      return SEL.isRadioChecked(wrapper);
    }

    if (!(await pollRadioChecked(weightWrapper, 6000))) {
      const retryWrapper = SEL.radioLabelByText(bucket);
      if (retryWrapper) await SEL.realClick(retryWrapper);
      if (!(await pollRadioChecked(SEL.radioLabelByText(bucket) || retryWrapper, 6000))) {
        throw hardError('Delivery', 'Selected the "' + bucket + '" shipping weight option, but Facebook didn\'t register it as chosen after two tries -- try again, or set the weight manually on the Facebook tab.');
      }
    }
    await humanPause(400, 800); // let Shipping carrier / Shipping option self-populate

    // The "Change shipping method" modal ([role="dialog"]) commits ASYNCHRONOUSLY: clicking
    // "Update" fires a shipping-rate fetch and Facebook only closes the modal once that request
    // returns (variable delay, sometimes >2.5s -- confirmed live 2026-07-17). A fixed pause
    // raced that fetch and could continue while the modal was still open, stalling the Delivery
    // step. Capture the open dialog, click Update, then POLL (every ~300ms, up to ~8s) for the
    // modal to actually close before continuing. A timeout here is NOT fatal -- the downstream
    // step=offer/audience wait is the real success signal -- so proceed either way afterward.
    const shipModal = document.querySelector('[role="dialog"]');
    await clickButton('Update', 'Delivery');
    if (shipModal) {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline && document.body.contains(shipModal) && shipModal.getClientRects().length > 0) {
        await sleep(300);
      }
    }
    await humanPause(300, 600); // small settle once the modal has closed
    return { mode: 'shipping', bucket };
  }

  // Offer step (2026-07-16, ADR-084): Facebook pre-checks "Allow offers" and pre-fills
  // "Minimum price you'll consider" with the LISTING PRICE, which is INVALID -- FB requires the
  // minimum to be at least 50% of the price AND strictly below it -- so a red inline error shows,
  // Next stays disabled, and the run used to stall here doing nothing. Mirror the item's existing
  // eBay Best Offer settings (item.allowBestOffer / item.bestOfferMinimumAmt -- the same fields
  // eBay already uses; Facebook has no auto-accept equivalent so bestOfferAutoAcceptAmt is ignored)
  // onto FB's Offer step:
  //   - allowBestOffer falsy -> turn FB's "Allow offers" switch OFF (no minimum needed -> valid).
  //   - allowBestOffer true   -> ensure the switch is ON, then set a VALID minimum computed in whole
  //     cents: clamp(bestOfferMinimumAmt, ceil(50% of price), price - $0.01). Use bestOfferMinimumAmt
  //     when it already satisfies FB's rule; otherwise fall back to the 50% floor. If the price is so
  //     low that no valid minimum can exist (e.g. <= $0.01), turn Allow-offers OFF instead.
  // item.price here is the item's real 2-decimal listing price (backend sends Number(price.toFixed(2))), so the
  // clamp is computed against the exact value FB validates. This never throws its own hard error --
  // it leaves the step in a valid state and lets the existing waitForStep('audience') guard below stay
  // the real check (keeps the fail-loud behavior if FB still blocks for some other reason).
  async function configureOfferStep(item) {
    const sw = SEL.switchByLabel(LABELS.offerToggle);
    if (!sw) return; // Offer step has no such control for this listing type -- nothing to do

    const priceNum = Number(item.price);
    const wantOffers = item.allowBestOffer === true;

    // Compute a valid minimum (dollars) or null when offers should be off / no valid min exists.
    let minValue = null;
    if (wantOffers && isFinite(priceNum) && priceNum > 0) {
      const priceCents = Math.round(priceNum * 100);
      const lowerCents = Math.ceil(priceCents * 0.5); // >= 50% of price
      const upperCents = priceCents - 1;              // strictly below price
      if (lowerCents <= upperCents) {
        const raw = item.bestOfferMinimumAmt;
        const desiredCents = raw != null && isFinite(Number(raw)) ? Math.round(Number(raw) * 100) : null;
        const pick = desiredCents != null ? desiredCents : lowerCents;
        const clamped = Math.min(Math.max(pick, lowerCents), upperCents);
        minValue = clamped / 100;
      }
    }

    if (minValue == null) {
      // Turn Allow-offers OFF (covers allowBestOffer=false AND the too-low-price case).
      if (SEL.isSwitchOn(sw)) { await realClick(sw); await sleep(250); }
      return;
    }

    // Ensure Allow-offers is ON, then fill the minimum with a valid value.
    if (!SEL.isSwitchOn(sw)) { await realClick(sw); await sleep(300); }
    let minInput;
    // The minimum input only renders while offers are on -- wait for it, then set it like any other
    // React-controlled text field (setNativeValue) so FB registers the change and clears its error.
    try { minInput = await waitFor(() => SEL.fieldByLabel(LABELS.offerMinimum), 4000); }
    catch (e) { return; } // input never appeared -- leave FB's default; audience guard catches a real block
    minInput.focus();
    // Whole dollars -> integer string; otherwise a 2-decimal string (e.g. "0.50") so FB parses it.
    const minStr = Number.isInteger(minValue) ? String(minValue) : minValue.toFixed(2);
    setNativeValue(minInput, minStr);
    await sleep(200);
  }

  // Fills item details, then auto-advances through every remaining Facebook step (Delivery,
  // Offer, Groups/Audience) and clicks Publish itself. ADR-084 amendment 2026-07-15 (Patrick's
  // explicit direction, findasale-legal reviewed): stops ONLY on a hard error -- a required
  // field or step-advance button genuinely not found on the page -- not on soft ambiguity like
  // an imperfect category match, which now auto-resolves to Facebook's own top suggestion
  // instead of blocking.
  async function fillItem(item, index, total, autoPublish) {
    overlay('<b>FindA.Sale</b> — filling listing ' + (index + 1) + ' of ' + total + '…');
    const results = { title: await fillText(LABELS.title, item.title),
                      price: await fillText(LABELS.price, item.price),
                      description: await fillText(LABELS.description, item.description) };
    if (!results.title) throw hardError('Item details', 'Couldn\'t find the Title field.');
    if (!results.price) throw hardError('Item details', 'Couldn\'t find the Price field.');

    await selectConditionRequired(item.condition); // REQUIRED field: retries + verifies, hard-errors if unset (2026-07-16 flaky-stall fix)
    const catResult = await selectCategory(item.category); // auto-resolves to FB's top suggestion when ambiguous
    const photosOk = await injectPhotos(item.photoUrls);

    overlay('<b>FindA.Sale</b><div style="margin-top:6px">Filled <b>' + escapeHtml(item.title) + '</b>' +
      (!photosOk ? ' — photos may not have attached' : '') +
      '. Moving through Facebook\'s remaining steps…</div>' +
      '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Listing ' + (index + 1) + ' of ' + total + '</div>');
    await humanPause(500, 1000);

    await clickButton('Next', 'Item details'); // -> Delivery

    // Verify the click actually advanced Facebook's own step (its URL carries ?step=... --
    // confirmed live 2026-07-15) rather than just checking for a "Next" button, which exists
    // on multiple steps and gave a false positive the first live run: Facebook silently blocks
    // Next with an inline "Please select a category" prompt if Category is unset, so the old
    // check was satisfied by the SAME page's own Next button and moved on into a step that
    // never actually loaded.
    await waitForStep('delivery', 10000)
      .catch(() => { throw hardError('Item details', 'Facebook didn\'t move to the Delivery step -- a required field (often Category) may still be unset.'); });
    overlay('<b>FindA.Sale</b> — setting shipping for <b>' + escapeHtml(item.title) + '</b>…');
    const deliveryMode = await fillDeliveryStep(item);
    await clickButton('Next', 'Delivery'); // -> Offer

    // After Delivery's Next, Facebook lands on EITHER the Offer step OR jumps straight to the
    // Audience/Publish step -- for some listings (e.g. Local-pickup items) FB skips Offer entirely
    // (confirmed live 2026-07-17: a pickup listing went Delivery -> Audience with a publish-ready
    // page, but the old offer-only guard hard-errored on it). Race for whichever ?step=... appears
    // first instead of demanding Offer, so a legitimately skipped Offer step is a success-path, not
    // a false stall.
    let landedStep;
    try {
      landedStep = await waitFor(() => {
        if (location.href.indexOf('step=offer') !== -1) return 'offer';
        if (location.href.indexOf('step=audience') !== -1) return 'audience';
        return null;
      }, 10000);
    } catch (e) {
      // Neither Offer nor Audience appeared -- Facebook STAYED on the Delivery step. That is the
      // real failure, and it keeps its existing actionable hard error. 2026-07-16: on the SHIPPING
      // path FB leaves "Next" present but DISABLED when the estimated payout is negative -- i.e. the
      // shipping label cost exceeds the item price (confirmed live with a $1 item). The pickup path
      // never sets a shipping label, so this only applies when fillDeliveryStep took the shipping
      // branch. Hard-error with an actionable message and STOP -- do not publish and do not silently
      // switch to pickup; whether to mark the item pickup-only or raise its price is the organizer's
      // decision.
      if (deliveryMode.mode === 'shipping') {
        const next = SEL.elementByText('Next');
        if (next && SEL.isDisabled(next)) {
          // 2026-07-18 fix: this used to unconditionally blame "price too low," but that's only
          // ONE possible reason Next can stay disabled here -- and Part 1 above now already
          // catches (with an accurate, specific message) the case where the weight selection
          // itself never registered, so if we reach this point the selection WAS confirmed
          // checked and this really is more likely a genuine negative-payout block. Still
          // softened to acknowledge it could be something else Facebook is flagging, since we
          // haven't independently confirmed the payout math -- only that Next stayed disabled.
          throw hardError('Delivery', 'Facebook\'s Next button stayed disabled after setting the "' + deliveryMode.bucket + '" shipping option. This is usually a negative-payout block (item price too low to cover the shipping cost) -- on FindA.Sale, check "Local pickup only (no shipping)" for this item, or raise its price, then re-list. If the price already covers shipping, check the Facebook tab directly for what\'s blocking Next.');
        }
      }
      throw hardError('Delivery', 'Facebook didn\'t move past the Delivery step.');
    }

    if (landedStep === 'offer') {
      console.info('[FAS offer] Offer step present -- configuring offer settings.');
      overlay('<b>FindA.Sale</b> — reviewing offer settings…');
      await humanPause(400, 800);
      await configureOfferStep(item); // set a VALID Allow-offers state so FB's Next isn't blocked (2026-07-16)
      await clickButton('Next', 'Offer'); // -> Audience (groups left unchecked by design, see ADR-084 amendment)
    } else {
      console.info('[FAS offer] Offer step skipped by Facebook (went straight to Audience/Publish) -- skipping offer config.');
    }

    await waitForStep('audience', 10000)
      .catch(() => { throw hardError('Offer', 'Facebook didn\'t move to the Groups/Publish step.'); });
    await waitFor(() => SEL.elementByText('Publish'), 10000)
      .catch(() => { throw hardError('Audience', 'Groups/Publish step loaded but no Publish button was found.'); });

    if (!autoPublish) {
      // Organizer unchecked "Publish automatically" in the popup -- everything up through
      // Groups is still auto-filled (that's just navigation/admin, not the sensitive part),
      // but the actual Publish click is the one irreversible action, so it waits for a human.
      overlay('<b>FindA.Sale</b><div style="margin-top:6px">Ready to publish <b>' + escapeHtml(item.title) + '</b>.</div>' +
        '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Review everything, then click Facebook\'s <b>Publish</b> yourself.</div>' +
        (!catResult.ok ? '<div style="color:#ffcf7a;margin-top:6px;font-size:12px">Category: picked Facebook\'s best guess automatically -- worth a glance.</div>' : '') +
        (!photosOk ? '<div style="color:#ffcf7a;margin-top:6px;font-size:12px">Photos may not have attached -- check this listing.</div>' : '') +
        btn('fas-next', 'I published — next item ▶', true) + btn('fas-skip', 'Skip this one', false) +
        '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Listing ' + (index + 1) + ' of ' + total + '</div>');
      const nextBtn = document.getElementById('fas-next');
      const skipBtn = document.getElementById('fas-skip');
      if (nextBtn) nextBtn.onclick = async () => { await mark(item); await advanceAuto(); };
      if (skipBtn) skipBtn.onclick = async () => { await advanceAuto(); };
      return { catResult, photosOk, autoPublished: false };
    }

    overlay('<b>FindA.Sale</b> — publishing <b>' + escapeHtml(item.title) + '</b>…');
    await humanPause(600, 1200);
    await clickButton('Publish', 'Audience');

    // Confirm it actually went through rather than assuming success: the create-flow URL
    // should disappear within a few seconds of a real publish. NOT independently verified
    // against a real Publish click this session (stopped short of that on Patrick's live
    // draft) -- if this heuristic ever mis-fires, it fails toward a hard-error stop, never
    // toward a false "published" mark.
    const publishedOk = await waitFor(() => (location.href.indexOf('/marketplace/create/') === -1 ? true : null), 10000)
      .catch(() => false);
    if (!publishedOk) throw hardError('Publish', 'Clicked Publish but couldn\'t confirm it went through -- check this listing manually.');

    // ADR-086 prerequisite: capture Facebook's own post-publish URL as remoteListingId. The
    // publishedOk check above already proves location.href moved off the create-flow -- this is
    // that same real URL, stored AS-IS (no parsing/extraction of a numeric id out of it) so it's
    // directly re-navigable later with zero assumptions about Facebook's URL/id format. Manual-
    // publish path (autoPublish===false) never reaches here -- there's no reliable way to know if
    // an organizer clicked Publish themselves, so its remoteListingId stays null (fail-closed,
    // matches ADR-086's own design: an item without a captured remoteListingId is simply not
    // eligible for price-sync later).
    const remoteListingId = location.href;

    return { catResult, photosOk, autoPublished: true, remoteListingId };
  }

  async function runQueue(item, index, total, autoPublish) {
    try {
      const result = await fillItem(item, index, total, autoPublish);
      if (!result.autoPublished) return; // fillItem already rendered the manual review UI + wired its own buttons

      const { catResult, photosOk, remoteListingId } = result;
      await mark(item, remoteListingId);
      let note = '';
      if (!catResult.ok) note += '<div style="color:#ffcf7a;margin-top:6px;font-size:12px">Category: picked Facebook\'s best guess automatically -- worth a glance.</div>';
      if (!photosOk) note += '<div style="color:#ffcf7a;margin-top:6px;font-size:12px">Photos may not have attached -- check this listing.</div>';
      overlay('<b>FindA.Sale</b><div style="margin-top:6px">Published <b>' + escapeHtml(item.title) + '</b>.</div>' + note +
        '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Listing ' + (index + 1) + ' of ' + total + '</div>');
      await humanPause(1200, 2000);
      await advanceAuto();
    } catch (e) {
      const step = (e && e.fasStep) || 'unknown';
      overlay('<b>FindA.Sale</b><div style="color:#ffcf7a;margin-top:6px;font-size:12px">Stopped on the <b>' + escapeHtml(step) +
        '</b> step: ' + escapeHtml((e && e.message) || 'something didn\'t match.') +
        ' Nothing further was published automatically -- check this listing, then reopen the extension to continue.</div>' +
        btn('fas-skip', 'Close', false));
      const s = document.getElementById('fas-skip'); if (s) s.onclick = () => bar.remove();
    }
  }

  async function mark(item, remoteListingId) {
    try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: item.id, remoteListingId: remoteListingId || null }); } catch (e) {}
  }

  async function advanceAuto() {
    overlay('<b>FindA.Sale</b> — loading the next listing…');
    const r = await chrome.runtime.sendMessage({ type: 'advanceQueue' });
    if (r && r.ok && r.item) { location.href = 'https://www.facebook.com/marketplace/create/item'; }
    else { overlay('<b>FindA.Sale</b> — all done. Happy selling!'); setTimeout(() => bar && bar.remove(), 4000); }
  }

  function escapeHtml(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  async function start() {
    let q;
    try { q = await chrome.runtime.sendMessage({ type: 'getQueueItem' }); } catch (e) { return; }
    if (!q || !q.ok || !q.item) return; // nothing queued -- stay silent
    try {
      await waitFor(() => SEL.fieldByLabel(LABELS.title), 15000);
      await sleep(400);
      await runQueue(q.item, q.index, q.total, q.autoPublish !== false);
    } catch (e) {
      overlay('<b>FindA.Sale</b><div style="color:#ffcf7a;margin-top:6px;font-size:12px">Couldn\'t find Facebook\'s listing form. Make sure you\'re on the "Item for sale" create screen, then reopen the extension.</div>' + btn('fas-skip', 'Close', false));
      const s = document.getElementById('fas-skip'); if (s) s.onclick = () => bar.remove();
    }
  }

  start();
})();
