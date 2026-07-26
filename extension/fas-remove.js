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

  // Facebook's "Your listings" grid re-renders repeatedly during/after the "Mark as sold"
  // survey flow -- independent of whether the listing actually flipped to Sold. During a
  // re-render, the old "Mark as sold" button is briefly removed from the DOM before the new
  // one mounts, so a getter like `() => (listingCardByTitle(title) ? null : true)` can return
  // a FALSE "gone" reading for a single MutationObserver tick even though the SAME listing
  // (still Active) reappears moments later. `waitFor` above resolves on the very first truthy
  // read, so it was catching that transient absence and reporting a false "removed" success
  // (S1128 finding). This variant requires the "absent" (falsy-getter) state to hold
  // CONTINUOUSLY for `settleMs` before declaring success -- if the getter goes truthy again
  // (card reappeared) before the settle window elapses, the settle timer is cancelled and
  // polling resumes for the remainder of the overall `timeout` budget. Never resolves true off
  // a single transient read.
  function waitForStableAbsence(getter, { settleMs = 900, timeout = 12000 } = {}) {
    return new Promise((resolve) => {
      let settleTimer = null;
      let done = false;
      const finish = (result) => {
        if (done) return;
        done = true;
        if (settleTimer) clearTimeout(settleTimer);
        obs.disconnect();
        clearTimeout(overallTimer);
        resolve(result);
      };
      const check = () => {
        if (done) return;
        const stillPresent = getter();
        if (stillPresent) {
          // Card reappeared -- not a real removal yet. Cancel any pending settle timer.
          if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
          return;
        }
        // Card absent on this read. Only start a NEW settle timer if one isn't already
        // running -- otherwise every mutation during the settle window would keep resetting it.
        if (!settleTimer) {
          settleTimer = setTimeout(() => finish(true), settleMs);
        }
      };
      const obs = new MutationObserver(check);
      obs.observe(document.body, { childList: true, subtree: true });
      const overallTimer = setTimeout(() => finish(false), timeout);
      check(); // run once immediately in case it's already stably absent
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

  // (2026-07-26 fix) Record a genuine skip (zero/ambiguous match, NOT already-sold) so the
  // backend can eventually stop re-serving an item that will never resolve on its own --
  // previously a skip was purely a client-side overlay message that vanished in 4s, so the
  // exact same "no confident match" error repeated forever on every poll with no way for
  // getPendingRemovals to know this item has already failed N times. Fire-and-forget, same as
  // mark() -- a failed report here must never block the removal queue from advancing.
  async function markSkipped(item, reason) {
    try { await chrome.runtime.sendMessage({ type: 'markItemRemovalSkipped', itemId: item.id, reason: reason || null }); } catch (e) {}
  }

  // Removes one item's Facebook listing: finds the matching "Your listings" card by title
  // (SEL.listingCardByTitle -- exact/clean-substring match ONLY, no fuzzy word-overlap) and
  // clicks its "Mark as sold" control. That control does NOT toggle the listing directly --
  // DOM-verified live 2026-07-16 it opens a multi-step SURVEY modal ("Did you sell this item?"
  // with four radio choices + a "Next" button disabled until one is picked). We pick "Yes, sold
  // elsewhere" (accurate -- it sold on FindA.Sale, not on Facebook -- so we never inflate FB's
  // "sold on Facebook" metric), click "Next", handle a possible final confirm step, then treat
  // the card's own status text leaving "Active" as the only success signal. "Couldn't confirm
  // in time" is a skip, never a false "removed" mark. Card matching stays single-confident-title
  // only (listingCardByTitle returns null on zero/ambiguous) -- the wrong listing is never guessed.
  async function removeOne(item) {
    const match = SEL.listingCardByTitle(item.title);
    if (!match) {
      // (2026-07-26 fix) Before treating "no active card with a 'Mark as sold' control" as a
      // failure, check whether the listing is already Sold on Facebook -- the normal steady
      // state right after a prior successful removal (or a listing Patrick marked sold by hand).
      // Confirmed live 2026-07-26: this was the actual cause of Patrick's "keeps erroring"
      // report -- the Bjorn Borg tennis ball and FILA golf set were both already Sold, so this
      // branch used to report a false failure and never tell the backend, which meant the same
      // already-done item got re-served and re-"failed" on every ~20-min poll forever.
      const alreadySold = SEL.alreadySoldCardByTitle(item.title);
      if (alreadySold) {
        return { ok: true, alreadyDone: true };
      }
      return { ok: false, reason: 'No confident match for this listing on the page (zero or more than one "' + item.title + '" found) -- skipped, not guessed.' };
    }
    await realClick(match.button);

    // Facebook's "Mark as sold" opens a multi-step SURVEY modal (DOM-verified live 2026-07-16),
    // NOT a single-click toggle. Wait for it: the "Did you sell this item?" prompt or any of the
    // known option labels signals the survey step is up.
    const surveyDialog = await waitFor(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return null;
      const t = SEL.norm(dialog.textContent);
      if (t.indexOf('did you sell this item') !== -1 ||
          t.indexOf('sold elsewhere') !== -1 ||
          t.indexOf('sold on facebook') !== -1) return dialog;
      return null;
    }, 12000).catch(() => null);

    if (surveyDialog) {
      // Pick "Yes, sold elsewhere" -- it sold on FindA.Sale, not on Facebook, so we must NOT
      // inflate FB's "sold on Facebook" metric. Fall back to "Yes, sold on Facebook" ONLY if the
      // accurate option is missing (FB copy change) -- never to "No"/"I'd rather not answer",
      // which would not remove the listing.
      let option = SEL.radioOptionByText('Yes, sold elsewhere') || SEL.radioOptionByText('Yes, sold on Facebook');
      if (option) {
        await humanPause(300, 600);
        await realClick(option);
        // "Next" enables once a choice is committed.
        const nextBtn = await waitFor(() => {
          const dialog = document.querySelector('[role="dialog"]');
          if (!dialog) return null;
          const btn = SEL.elementByText('Next');
          return (btn && dialog.contains(btn)) ? btn : null;
        }, 6000).catch(() => null);
        if (nextBtn) {
          await humanPause(300, 600);
          await realClick(nextBtn);
          await humanPause(500, 900); // let the survey advance before scanning for a final step
        }
      }
    }

    // A possible final confirm step after "Next" (or a plain confirm dialog if FB ever shows the
    // simple toggle instead) -- handled the same way, by exact accessible text within the dialog.
    const dialogConfirm = await waitFor(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return null;
      const candidates = ['Done', 'Save', 'Confirm', 'Mark as sold', 'Next'];
      for (const text of candidates) {
        const found = SEL.elementByText(text);
        if (found && dialog.contains(found)) return found;
      }
      return null;
    }, 4000).catch(() => null);
    if (dialogConfirm) {
      await humanPause(300, 600);
      await realClick(dialogConfirm);
    }

    // Success signal (2026-07-16 fix): FB re-renders the "Your listings" row after "Mark as sold",
    // DETACHING the original match.cardEl -- reading its stale textContent kept seeing the old
    // "Active" text, so a genuinely-completed removal was recorded as a failure (no /removed call,
    // so the item stayed "pending removal" and re-opened a tab on every check). Re-query the live
    // grid instead: listingCardByTitle only returns a card that STILL exposes a "Mark as sold"
    // button, so once this listing flips to Sold ("Mark as available"/"Relist") it returns null =
    // confirmed removed.
    // S1128/S1136 fix: don't trust a single transient DOM read (see waitForStableAbsence
    // comment above) -- require the card to be gone for a full settle window, not just gone
    // on one MutationObserver tick, before declaring the removal confirmed.
    const confirmed = await waitForStableAbsence(
      () => SEL.listingCardByTitle(item.title),
      { settleMs: 900, timeout: 12000 }
    );
    if (!confirmed) {
      return { ok: false, reason: 'Clicked "Mark as sold" but couldn\'t confirm the listing flipped to Sold -- check it manually.' };
    }
    return { ok: true };
  }

  async function runRemovalQueue(item, index, total) {
    overlay('<b>FindA.Sale</b> — removing sold item ' + (index + 1) + ' of ' + total + ': <b>' + escapeHtml(item.title) + '</b>…');
    const result = await removeOne(item);
    if (result.ok) {
      await mark(item);
      const doneLabel = result.alreadyDone
        ? 'Already marked sold on Facebook -- synced with FindA.Sale, nothing left to do.'
        : 'Removed <b>' + escapeHtml(item.title) + '</b> from Facebook.';
      overlay('<b>FindA.Sale</b><div style="margin-top:6px">' + doneLabel + '</div>' +
        '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">' + (index + 1) + ' of ' + total + '</div>');
    } else {
      await markSkipped(item, result.reason);
      overlay('<b>FindA.Sale</b><div style="color:#ffcf7a;margin-top:6px;font-size:12px">Skipped <b>' + escapeHtml(item.title) +
        '</b>: ' + escapeHtml(result.reason) + '</div>' +
        '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">' + (index + 1) + ' of ' + total + '</div>');
    }
    await humanPause(1000, 1800);
    let next = null;
    // chrome.runtime.sendMessage throws SYNCHRONOUSLY when the extension context is invalidated
    // (extension reloaded mid-run), so a trailing .catch() never fires. Mirror the try/catch used
    // by start() below so a reload during removal ends the queue cleanly instead of throwing.
    try { next = await chrome.runtime.sendMessage({ type: 'advanceRemovalQueue' }); } catch (e) { next = null; }
    if (next && next.ok && next.item) {
      await runRemovalQueue(next.item, next.index, next.total);
    } else {
      overlay('<b>FindA.Sale</b> — done removing sold items.');
      setTimeout(() => bar && bar.remove(), 4000);
      // Tell the background the queue is finished so silent ("Remove automatically") mode can
      // restore the organizer's previous tab and auto-close the removal tab it opened. Wrapped
      // like the sendMessage above -- a context-invalidated throw here must not break the run.
      try { await chrome.runtime.sendMessage({ type: 'removalQueueDone' }); } catch (e) {}
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
