/* FindA.Sale — content script on facebook.com/marketplace/create/*.
 * Fills the current queued item's fields + photos, then STOPS. The human reviews
 * and clicks Publish. ADR-084: NO auto-publish. Selectors come from fas-selectors.js.
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

  async function fillItem(item, index, total) {
    overlay('<b>FindA.Sale</b> — filling listing ' + (index + 1) + ' of ' + total + '…');
    const results = { title: await fillText(LABELS.title, item.title),
                      price: await fillText(LABELS.price, item.price),
                      description: await fillText(LABELS.description, item.description) };
    await selectCombo(LABELS.condition, item.condition);
    const catResult = await selectCategory(item.category);
    const photosOk = await injectPhotos(item.photoUrls);

    const failed = Object.keys(results).filter((k) => !results[k]);
    let warn = '';
    if (failed.length) warn = '<div style="color:#ffcf7a;margin-top:6px;font-size:12px">Facebook may have changed their form — couldn\'t fill: ' +
      failed.join(', ') + '. You can type these in manually.</div>';
    if (!catResult.ok) {
      const hint = catResult.suggestions.length
        ? 'Facebook suggests: ' + catResult.suggestions.map(escapeHtml).join(', ') + '. Pick one.'
        : 'Pick one manually.';
      warn += '<div style="color:#ffcf7a;margin-top:6px;font-size:12px">Couldn\'t set Category — ' + hint + '</div>';
    }
    if (!photosOk) warn += '<div style="color:#ffcf7a;margin-top:6px;font-size:12px">Photos didn\'t attach automatically — add them from the item photos.</div>';

    const more = index + 1 < total;
    overlay('<b>FindA.Sale</b><div style="margin-top:6px">Filled <b>' + escapeHtml(item.title) + '</b>.</div>' +
      '<div style="margin-top:4px;font-size:12px;color:#cfe3d6">Review everything, then click Facebook\'s <b>Publish</b>. FindA.Sale never publishes for you.</div>' +
      warn +
      (more ? btn('fas-next', 'I published — next item ▶', true) : btn('fas-done', 'I published — done ✓', true)) +
      btn('fas-skip', more ? 'Skip this one' : 'Close', false) +
      '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Listing ' + (index + 1) + ' of ' + total + '</div>');

    const nextBtn = document.getElementById('fas-next');
    const doneBtn = document.getElementById('fas-done');
    const skipBtn = document.getElementById('fas-skip');
    if (nextBtn) nextBtn.onclick = async () => { await mark(item); await advance(); };
    if (doneBtn) doneBtn.onclick = async () => { await mark(item); overlay('<b>FindA.Sale</b> — all done. Happy selling!'); setTimeout(() => bar && bar.remove(), 4000); };
    if (skipBtn) skipBtn.onclick = async () => { if (more) { await advance(); } else { bar.remove(); } };
  }

  async function mark(item) {
    try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: item.id }); } catch (e) {}
  }
  async function advance() {
    overlay('<b>FindA.Sale</b> — loading the next listing…');
    const r = await chrome.runtime.sendMessage({ type: 'advanceQueue' });
    if (r && r.ok && r.item) { location.href = 'https://www.facebook.com/marketplace/create/item'; }
    else { overlay('<b>FindA.Sale</b> — all done. Happy selling!'); setTimeout(() => bar && bar.remove(), 4000); }
  }

  function escapeHtml(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  async function start() {
    let q;
    try { q = await chrome.runtime.sendMessage({ type: 'getQueueItem' }); } catch (e) { return; }
    if (!q || !q.ok || !q.item) return; // nothing queued — stay silent
    try {
      await waitFor(() => SEL.fieldByLabel(LABELS.title), 15000);
      await sleep(400);
      await fillItem(q.item, q.index, q.total);
    } catch (e) {
      overlay('<b>FindA.Sale</b><div style="color:#ffcf7a;margin-top:6px;font-size:12px">Couldn\'t find Facebook\'s listing form. Make sure you\'re on the "Item for sale" create screen, then reopen the extension.</div>' + btn('fas-skip', 'Close', false));
      const s = document.getElementById('fas-skip'); if (s) s.onclick = () => bar.remove();
    }
  }

  start();
})();
