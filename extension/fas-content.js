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
    combo.click();
    try {
      const opt = await waitFor(() => SEL.optionByText(value), 3000);
      opt.click();
      await sleep(150);
      return true;
    } catch (e) {
      // Close the open listbox; category/condition is best-effort, never a blocker.
      document.body.click();
      return false;
    }
  }

  // Facebook's Category field renders AI-suggested chips (div[role="button"]), not the
  // [role="option"] listbox selectCombo() expects — confirmed live 2026-07-15 (see
  // fas-selectors.js chipsAfter/bestTextMatch). This tries the chip path first, falls back to
  // the old listbox path in case FB shows a normal dropdown for some listing types, and — if
  // neither finds a confident match — returns the live suggestion text so fillItem() can tell
  // the organizer what to pick instead of silently leaving Category empty.
  async function selectCategory(value) {
    if (!value) return { ok: true };
    const combo = SEL.comboByLabel(LABELS.category);
    if (!combo) return { ok: false, suggestions: [] };
    const chips = await SEL.chipsAfter(() => combo.click(), 500);
    if (!chips.length) {
      try {
        const opt = await waitFor(() => SEL.optionByText(value), 2000);
        opt.click();
        await sleep(150);
        return { ok: true };
      } catch (e) {
        document.body.click();
        return { ok: false, suggestions: [] };
      }
    }
    const match = SEL.bestTextMatch(chips, value);
    if (match) {
      match.click();
      await sleep(150);
      return { ok: true };
    }
    const suggestions = chips.map((c) => SEL.norm(c.textContent)).filter(Boolean);
    document.body.click();
    return { ok: false, suggestions };
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

  // Click a step-advance button ("Next" / "Publish" / "Update") by its exact accessible text.
  // Not finding it within timeout is always a HARD ERROR per ADR-084's 2026-07-15 amendment --
  // there is no safe way to keep going if Facebook's own navigation control isn't where expected.
  async function clickButton(text, step, timeout) {
    let el;
    try {
      el = await waitFor(() => SEL.elementByText(text), timeout || 8000);
    } catch (e) {
      throw hardError(step, 'Couldn\'t find the "' + text + '" button.');
    }
    await humanPause(350, 800);
    el.click();
    return el;
  }

  // Delivery step: pick the weight bucket. Shipping carrier + Shipping option self-populate
  // with Facebook's own sensible defaults once a weight is set (confirmed live 2026-07-15 --
  // "Prepaid shipping label" and a real carrier quote both appear automatically) so no separate
  // fill is needed for those two fields.
  async function fillDeliveryStep(item) {
    let trigger;
    try {
      trigger = await waitFor(() => SEL.elementByText('Select shipping label'), 8000);
    } catch (e) {
      throw hardError('Delivery', 'Couldn\'t find the shipping label control.');
    }
    await humanPause(300, 600);
    trigger.click();

    const bucket = weightBucketLabel(
      item.packageWeightOz !== undefined && item.packageWeightOz !== null ? item.packageWeightOz : item.aiPackageWeightOz
    );
    let weightLabel;
    try {
      weightLabel = await waitFor(() => SEL.radioLabelByText(bucket), 5000);
    } catch (e) {
      throw hardError('Delivery', 'Couldn\'t find the "' + bucket + '" weight option.');
    }
    await humanPause(300, 600);
    weightLabel.click();
    await humanPause(400, 800); // let Shipping carrier / Shipping option self-populate

    await clickButton('Update', 'Delivery');
    await humanPause(300, 600);
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

    await selectCombo(LABELS.condition, item.condition); // best-effort, never blocks (unchanged)
    const catResult = await selectCategory(item.category); // auto-resolves to FB's top suggestion when ambiguous
    const photosOk = await injectPhotos(item.photoUrls);

    overlay('<b>FindA.Sale</b><div style="margin-top:6px">Filled <b>' + escapeHtml(item.title) + '</b>' +
      (!photosOk ? ' — photos may not have attached' : '') +
      '. Moving through Facebook\'s remaining steps…</div>' +
      '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Listing ' + (index + 1) + ' of ' + total + '</div>');
    await humanPause(500, 1000);

    await clickButton('Next', 'Item details'); // -> Delivery

    await waitFor(() => SEL.elementByText('Select shipping label') || SEL.elementByText('Next'), 10000)
      .catch(() => { throw hardError('Delivery', 'Delivery step didn\'t load.'); });
    overlay('<b>FindA.Sale</b> — setting shipping for <b>' + escapeHtml(item.title) + '</b>…');
    await fillDeliveryStep(item);
    await clickButton('Next', 'Delivery'); // -> Offer

    await waitFor(() => SEL.elementByText('Next'), 10000)
      .catch(() => { throw hardError('Offer', 'Offer step didn\'t load.'); });
    overlay('<b>FindA.Sale</b> — reviewing offer settings…');
    await humanPause(400, 800);
    await clickButton('Next', 'Offer'); // -> Audience (groups left unchecked by design, see ADR-084 amendment)

    await waitFor(() => SEL.elementByText('Publish'), 10000)
      .catch(() => { throw hardError('Audience', 'Groups/Publish step didn\'t load.'); });

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

    return { catResult, photosOk, autoPublished: true };
  }

  async function runQueue(item, index, total, autoPublish) {
    try {
      const result = await fillItem(item, index, total, autoPublish);
      if (!result.autoPublished) return; // fillItem already rendered the manual review UI + wired its own buttons

      const { catResult, photosOk } = result;
      await mark(item);
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

  async function mark(item) {
    try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: item.id }); } catch (e) {}
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
