/* FindA.Sale — content script on facebook.com/marketplace/you/selling.
 * ADR-084 amendment 2026-07-15 (Part C): when an item sells via any other channel (POS,
 * storefront, eBay, anything that flips Item.status to SOLD), Facebook Marketplace has no API
 * to withdraw the matching listing server-side the way eBay's endEbayListingIfExists() does --
 * this content script is the poll-driven equivalent, run either after a Chrome notification
 * click ("Notify me" mode) or unattended in a background tab (background.js opens it itself in
 * "Remove automatically" mode). Same hard-error-only-on-required-elements philosophy as
 * fas-content.js, with one deliberate exception: a listing that can't be matched to a single
 * confident title is SKIPPED AND FLAGGED, never guessed -- marking the wrong live listing as
 * sold is a materially worse failure than picking Facebook's second-best category suggestion.
 */
(function () {
  const SEL = window.__FAS_SEL__;
  if (!SEL) return;
  const realClick = SEL.realClick;

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

  // ---- overlay UI (mirrors fas-content.js's bar, kept separate since the two content
  // scripts never run on the same page at the same time) ----
  let bar;
  function overlay(html) {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'fas-remove-bar';
      bar.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:340px;' +
        'background:#1f2a24;color:#f3f5f2;border:1px solid #3c8c5a;border-radius:12px;padding:14px 16px;' +
        'font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.4)';
      document.documentElement.appendChild(bar);
    }
    bar.innerHTML = html;
  }
  function escapeHtml(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  async function humanPause(minMs, maxMs) { await sleep(minMs + Math.random() * (maxMs - minMs)); }

  async function mark(item) {
    try { await chrome.runtime.sendMessage({ type: 'markItemRemovedByRemoval', itemId: item.id }); } catch (e) {}
  }

  // Removes one item's Facebook listing: finds the matching "Your listings" card by title
  // (SEL.listingCardByTitle -- exact/clean-substring match ONLY, no fuzzy word-overlap) and
  // clicks its "Mark as sold" control. Facebook's own button-text pairing ("Mark as sold" /
  // "Mark as available", confirmed live 2026-07-15) suggests this is a direct single-click
  // toggle, not a multi-step modal flow -- but that wasn't independently confirmed by actually
  // completing one (only inferred from the button-list pattern), so this waits briefly for
  // either a follow-up confirm dialog (handled if one appears) or the card's own status text to
  // change, and treats "neither happened in time" as a skip, not a false "removed" mark.
  async function removeOne(item) {
    const match = SEL.listingCardByTitle(item.title);
    if (!match) {
      return { ok: false, reason: 'No confident match for this listing on the page (zero or more than one "' + item.title + '" found) -- skipped, not guessed.' };
    }
    await realClick(match.button);

    // A follow-up confirm dialog, if Facebook shows one, is handled the same way clickButton
    // handles Next/Publish elsewhere in this extension -- by exact accessible text.
    const dialogConfirm = await waitFor(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return null;
      const candidates = ['Mark as sold', 'Confirm', 'Done', 'Save'];
      for (const text of candidates) {
        const found = SEL.elementByText(text);
        if (found && dialog.contains(found)) return found;
      }
      return null;
    }, 2500).catch(() => null);
    if (dialogConfirm) {
      await humanPause(300, 600);
      await realClick(dialogConfirm);
    }

    // Success signal: the card's own status text moves off "Active" (confirmed live 2026-07-15
    // that live cards show "Active . Listed on ...") within a reasonable window.
    const confirmed = await waitFor(() => (SEL.norm(match.cardEl.textContent).indexOf('active') === -1 ? true : null), 6000)
      .catch(() => false);
    if (!confirmed) {
      return { ok: false, reason: 'Clicked "Mark as sold" but couldn\'t confirm the listing status changed -- check it manually.' };
    }
    return { ok: true };
  }

  async function runRemovalQueue(item, index, total) {
    overlay('<b>FindA.Sale</b> — removing sold item ' + (index + 1) + ' of ' + total + ': <b>' + escapeHtml(item.title) + '</b>…');
    const result = await removeOne(item);
    if (result.ok) {
      await mark(item);
      overlay('<b>FindA.Sale</b><div style="margin-top:6px">Removed <b>' + escapeHtml(item.title) + '</b> from Facebook.</div>' +
        '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">' + (index + 1) + ' of ' + total + '</div>');
    } else {
      overlay('<b>FindA.Sale</b><div style="color:#ffcf7a;margin-top:6px;font-size:12px">Skipped <b>' + escapeHtml(item.title) +
        '</b>: ' + escapeHtml(result.reason) + '</div>' +
        '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">' + (index + 1) + ' of ' + total + '</div>');
    }
    await humanPause(1000, 1800);
    const next = await chrome.runtime.sendMessage({ type: 'advanceRemovalQueue' }).catch(() => null);
    if (next && next.ok && next.item) {
      await runRemovalQueue(next.item, next.index, next.total);
    } else {
      overlay('<b>FindA.Sale</b> — done removing sold items.');
      setTimeout(() => bar && bar.remove(), 4000);
    }
  }

  async function start() {
    let q;
    try { q = await chrome.runtime.sendMessage({ type: 'getRemovalQueueItem' }); } catch (e) { return; }
    if (!q || !q.ok || !q.item) return; // nothing queued -- stay silent, this page loads for normal browsing too
    await sleep(600); // let the listings grid render before searching for cards
    await runRemovalQueue(q.item, q.index, q.total);
  }

  start();
})();
