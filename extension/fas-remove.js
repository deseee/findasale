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

  // (2026-08-07 fix) Facebook's default "Your listings" grid can omit weeks-old listings from
  // the DOM entirely, regardless of scrolling -- loadAllListingCards' pagination workaround
  // above only helps when the card is somewhere in the lazy-loaded feed at all. DOM-verified
  // live 2026-08-07: 6 items stuck in the removal dead-letter queue for weeks (every retry
  // reporting "zero or more than one title found") each had EXACTLY ONE unambiguous,
  // confidently-matchable card once the page was filtered via Facebook's OWN listings search
  // (?title_search=<title>) -- the cards existed the whole time, they just were never rendered
  // by the default unfiltered view. Root cause was DOM coverage, not title-matching. Fix: filter
  // the page to the target title via a REAL navigation (Facebook's React app does not reliably
  // re-fetch/re-render under a history.pushState-only URL change -- confirmed by defaulting to
  // the safe option here) before ever scanning for that item's card.
  function buildTitleSearchUrl(title) {
    return 'https://www.facebook.com/marketplace/you/selling?title_search=' + encodeURIComponent(title);
  }

  function currentTitleSearchParam() {
    try { return new URLSearchParams(window.location.search).get('title_search'); } catch (e) { return null; }
  }

  function pageAlreadyFilteredFor(title) {
    const current = currentTitleSearchParam();
    return !!current && SEL.norm(current) === SEL.norm(title);
  }

  // (2026-08-09, Patrick) Sold-detection used to scan the FULL unfiltered "Your listings" grid
  // (loadAllListingCards -- scroll-heavy, mixes 20+ active listings in with whatever's sold),
  // getting slower as active inventory grows for a check that only cares about sold items.
  // Facebook's own Seller Hub already offers a server-side filter for exactly this -- confirmed
  // live 2026-08-09 (Chrome, read-only navigation): this URL shows ONLY sold/out-of-stock
  // listings (both "View Order" items sold via Facebook's own checkout, and "Mark as available"
  // items marked unavailable without an order). Scanning this small, pre-filtered page instead
  // decouples sold-detection performance from total active-listing count.
  //
  // CORRECTION (2026-08-13): the claim above that allSoldListingCards' marker detection
  // "already covers both" was WRONG at the time it was written -- that function only ever
  // matched the 'mark as available'/'relist this item' markers (the no-order manual-sold
  // case). It had no marker for "View Order" (the real-Facebook-Checkout-order case) until
  // this same date, when a real production item (sold via Facebook Checkout, confirmed "View
  // Order" button present) was found still falsely AVAILABLE on FindA.Sale/eBay because of
  // this exact gap. allSoldListingCards() in fas-selectors.js now also matches 'view order'
  // -- so this URL-filter optimization's premise (both sold-states land on this filtered
  // page) is accurate, but is only actually detected end-to-end as of the 2026-08-13 fix,
  // not since 2026-08-09 as originally claimed here.
  const SOLD_STATUS_FILTER_URL = 'https://www.facebook.com/marketplace/you/selling/?referral_surface=seller_hub&status[0]=OUT_OF_STOCK';

  function currentStatusFilterParam() {
    try { return new URLSearchParams(window.location.search).get('status[0]'); } catch (e) { return null; }
  }

  function pageOnSoldFilterView() {
    return currentStatusFilterParam() === 'OUT_OF_STOCK';
  }

  // Ensures the page is filtered to `item`'s title before running the removal flow against it.
  // If not already filtered, triggers a real navigation and returns WITHOUT running the removal
  // flow -- the navigation tears down this script; the fresh content-script load that follows
  // re-enters start() below, finds the page now correctly filtered, and proceeds directly. If
  // already filtered (e.g. two consecutive queue items happen to share an identical title), runs
  // immediately with no redundant navigation.
  async function ensureFilteredThenRun(item, index, total) {
    if (pageAlreadyFilteredFor(item.title)) {
      await runRemovalQueue(item, index, total);
      return;
    }
    window.location.href = buildTitleSearchUrl(item.title);
    // Real navigation is about to tear down this script's execution context -- nothing more to
    // do here; do not await/continue past this point.
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
      // (2026-08-07) Navigate to the next item's title-filtered page rather than continuing to
      // scan the current (differently-filtered or unfiltered) DOM in place -- see
      // ensureFilteredThenRun above.
      await ensureFilteredThenRun(next.item, next.index, next.total);
    } else {
      overlay('<b>FindA.Sale</b> — done removing sold items.');
      setTimeout(() => bar && bar.remove(), 4000);
      // Tell the background the queue is finished so silent ("Remove automatically") mode can
      // restore the organizer's previous tab and auto-close the removal tab it opened. Wrapped
      // like the sendMessage above -- a context-invalidated throw here must not break the run.
      try { await chrome.runtime.sendMessage({ type: 'removalQueueDone' }); } catch (e) {}
    }
  }

  // ---- Marketplace Listing Auto-Renew (ADR-100 §10/§11/§12, 2026-08-09) ----
  // Corrects the original ADR-100 §5/§8 mechanism (renewal = full repost via fas-content.js's
  // posting-queue flow) after Patrick caught that reposting is wasteful and risks the account
  // getting flagged for bulk automated reposting, when Facebook already offers a lightweight,
  // platform-sanctioned "Renew listing" button for exactly this purpose (confirmed live
  // 2026-08-09 -- see ADR-100 §11). This flow reuses the SAME title_search-filtered navigation
  // (ensureFilteredThenRun/buildTitleSearchUrl above) and the SAME single-confident-match
  // discipline as the removal flow -- a title that can't be confidently matched to exactly one
  // card is skipped and reported, never guessed.
  //
  // SCOPE NOTE (honest, not a TODO-and-forget): this dispatch implements ONLY the primary
  // "click Renew listing" path. Two related cases are deliberately NOT automated yet, because
  // building them blind would repeat the exact mistake ADR-086 already flagged (guessing at
  // unverified platform UI):
  //   (a) Facebook's 5-renewal cap ("Delete & relist" flow) -- confirmed live to exist at a
  //       DIFFERENT URL (facebook.com/marketplace/selling/relist_items/...) that no content
  //       script currently targets, reached via client-side routing from the Seller Dashboard,
  //       not a plain page navigation. Needs its own live-verification pass before automating.
  //   (b) Craigslist native renew -- the account page's manage-postings links resisted a plain
  //       DOM query when checked live (ADR-100 §11); needs coordinate-based click verification
  //       before automating. Craigslist renewal still goes through the existing full-repost path
  //       unchanged (background.js autoRenewDueItems).
  // Both (a) and (b) currently fall back to the pre-existing full-repost mechanism (unchanged),
  // same as every renewal did before this dispatch -- this is a net improvement (the common
  // case now renews instead of reposts), not a regression for the uncommon cases.

  async function markRenewed(item) {
    // Reuses the EXISTING markListed endpoint (same one fas-content.js/fas-craigslist.js call
    // after a first-time post) -- writes a new MarketplaceListingJob action:'POST' row, which is
    // exactly what's needed to push renewDueAt forward another cycle. remoteListingId stays null
    // (a Renew click doesn't produce a new one, and getPendingUpdates/getPendingSoldChecks only
    // ever key off the MOST RECENT job row per item, so this correctly supersedes the old one).
    // (2026-08-09 note) an earlier version of this diagnostic showed a red
    // overlay() here on failure, but runRenewalQueue's own success overlay (called right after
    // this function returns, unconditionally on renewOne's result -- NOT on markRenewed's actual
    // API outcome) reuses the SAME shared bar element and instantly overwrote it -- the error
    // was real but never visible. Moved the actual diagnostic (console.log + chrome.storage) to
    // background.js's markListed handler instead, which persists after this tab closes itself.
    try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: item.id, remoteListingId: null, platform: 'FACEBOOK' }); } catch (e) {}
  }

  // (Scope note, 2026-08-09) Unlike markSkipped() for removal, this deliberately does NOT round-
  // trip to the backend -- there's no server-side "renewal skipped" state to record: leaving
  // markRenewed() uncalled is sufficient, since renewDueAt simply stays in the past and
  // getPendingRenewals will re-serve this item next cycle automatically, no new endpoint needed.
  // Console-only for now; a Chrome notification for items that skip repeatedly (e.g. permanently
  // capped at Facebook's 5-renewal limit) would be a reasonable follow-up but isn't built this
  // pass -- flagged in the dev handoff, not silently omitted.
  function markRenewalSkipped(item, reason) {
    console.log('[FindA.Sale] Renewal skipped for "' + item.title + '": ' + reason);
  }

  // Renews one item: finds its "Renew listing" button by title (single-confident-match only,
  // same discipline as removeOne) and clicks it. No survey modal (Renew is a single-action
  // button, not a multi-step flow like "Mark as sold").
  // Success detection (2026-08-09, LIVE-VERIFIED with a real click on the Celestion Vintage 30
  // G12 Guitar Speaker listing, Patrick-authorized): confirmed the button's own row does NOT
  // change after a successful renewal (still reads "Renew listing", card still shows the
  // original "Active - Listed on [date]" text in this view) -- so button/card state is NOT a
  // usable success signal. What DOES appear is a transient toast reading exactly "Your listing
  // has been renewed." that shows for a few seconds then self-dismisses. This waits for that
  // toast (broad text match, not a rigid selector -- the toast's role/class wasn't captured
  // before it vanished during verification, so matching by its known text is the reliable
  // option, consistent with how radioOptionByText/elementByText already match by text
  // elsewhere in this file rather than brittle Facebook-assigned classes).
  function findRenewedToast() {
    const all = document.querySelectorAll('*');
    for (const el of all) {
      if (el.children.length === 0 && /your listing has been renewed/i.test(el.textContent || '')) return el;
    }
    return null;
  }
  async function renewOne(item) {
    const match = SEL.renewButtonByTitle(item.title);
    if (!match) {
      // Distinguish "card not found at all" from "card found but no Renew button" (the 5-
      // renewal-cap case, ADR-100 §11) using the SAME card lookup listingCardByTitle already
      // does (it matches on "Mark as sold", which is present on every Active card regardless of
      // renewal-cap state).
      const cardStillActive = SEL.listingCardByTitle(item.title);
      const reason = cardStillActive
        ? 'Listing found but no "Renew listing" button -- likely hit Facebook\'s 5-renewal cap (needs "Delete & relist", not yet automated).'
        : 'No confident match for this listing on the page (zero or more than one "' + item.title + '" found) -- skipped, not guessed.';
      return { ok: false, reason };
    }
    await humanPause(300, 600);
    await realClick(match.button);
    const toast = await waitFor(findRenewedToast, 6000).catch(() => null);
    if (!toast) {
      return { ok: false, reason: 'Clicked "Renew listing" but never saw the "Your listing has been renewed" confirmation -- check it manually.' };
    }
    return { ok: true };
  }

  async function runRenewalQueue(item, index, total) {
    overlay('<b>FindA.Sale</b> — renewing listing ' + (index + 1) + ' of ' + total + ': <b>' + escapeHtml(item.title) + '</b>…');
    const result = await renewOne(item);
    if (result.ok) {
      await markRenewed(item);
      overlay('<b>FindA.Sale</b><div style="margin-top:6px">Renewed <b>' + escapeHtml(item.title) + '</b> on Facebook.</div>' +
        '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">' + (index + 1) + ' of ' + total + '</div>');
    } else {
      await markRenewalSkipped(item, result.reason);
      overlay('<b>FindA.Sale</b><div style="color:#ffcf7a;margin-top:6px;font-size:12px">Skipped <b>' + escapeHtml(item.title) +
        '</b>: ' + escapeHtml(result.reason) + '</div>' +
        '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">' + (index + 1) + ' of ' + total + '</div>');
    }
    await humanPause(1000, 1800);
    let next = null;
    try { next = await chrome.runtime.sendMessage({ type: 'advanceRenewalQueue' }); } catch (e) { next = null; }
    if (next && next.ok && next.item) {
      await ensureFilteredThenRunRenewal(next.item, next.index, next.total);
    } else {
      overlay('<b>FindA.Sale</b> — done renewing listings.');
      setTimeout(() => bar && bar.remove(), 4000);
      // Shared tab-close signal with removal (see start()'s comment) -- not a separate message
      // type, since renewal and removal now share one you/selling management tab lifecycle.
      try { await chrome.runtime.sendMessage({ type: 'removalQueueDone' }); } catch (e) {}
    }
  }

  // Mirrors ensureFilteredThenRun exactly (same real-navigation-then-reenter pattern), routed to
  // the renewal queue instead of the removal queue.
  async function ensureFilteredThenRunRenewal(item, index, total) {
    if (pageAlreadyFilteredFor(item.title)) {
      await runRenewalQueue(item, index, total);
      return;
    }
    window.location.href = buildTitleSearchUrl(item.title);
  }

  // ---- Reverse-direction sold detection (ADR-084 amendment, Part D -- 2026-08-05) ----
  // Facebook has no webhook/API to tell FindA.Sale an item sold NATIVELY on Facebook -- same
  // "poll a DOM signal" gap as removal/price-sync above, just running the other direction: an
  // item this extension listed live on Facebook may have sold there directly (a buyer messaged
  // the organizer and they marked it sold ON Facebook, or used Facebook's own checkout), and
  // until now nothing in FindA.Sale ever found out. This matches candidate item titles (items
  // still AVAILABLE on FindA.Sale that this extension actually posted live -- see
  // getPendingSoldChecks) against every currently-Sold card on this page.

  // Same single-confident-match discipline as listingCardByTitle/alreadySoldCardByTitle
  // throughout this file: a candidate title matching zero or more than one Sold card is
  // skipped, never guessed -- marking the WRONG item sold is a materially worse failure than
  // missing this one for another ~20-min cycle.
  function matchSoldCardForTitle(title, soldCards) {
    const want = SEL.norm(title);
    if (!want) return null;
    const matches = soldCards.filter((c) => c.cardText === want || c.cardText.indexOf(want) !== -1);
    return matches.length === 1 ? matches[0] : null;
  }

  async function runSoldDetectionScan() {
    let resp;
    try { resp = await chrome.runtime.sendMessage({ type: 'getFacebookSoldChecks' }); } catch (e) { return; }
    const candidates = (resp && resp.ok && resp.data && resp.data.items) || [];
    if (!candidates.length) return; // nothing to check this cycle -- stay silent

    const soldCards = SEL.allSoldListingCards();
    if (!soldCards.length) return; // nothing currently Sold on this page at all

    const matchedTitles = [];
    for (const candidate of candidates) {
      const match = matchSoldCardForTitle(candidate.title, soldCards);
      if (!match) continue; // zero/ambiguous match -- skip silently, re-checked next ~20-min cycle
      try {
        await chrome.runtime.sendMessage({ type: 'markItemSoldFromFacebook', itemId: candidate.id });
        matchedTitles.push(candidate.title);
      } catch (e) {
        // Fire-and-forget, same as mark()/markSkipped() above -- a context-invalidated throw
        // here (extension reloaded mid-scan) must not break the rest of the loop, and a failed
        // report just means this candidate gets re-checked on the next poll cycle.
      }
    }

    if (matchedTitles.length) {
      // Captured as a value (not re-read from the shared `bar` element later) so the cleanup
      // timer below can tell whether the removal-queue flow that runs right after this scan has
      // since overwritten the SAME shared bar element (overlay() reuses one DOM node for its
      // whole page lifetime -- it never creates a new one once `bar` is set -- so comparing
      // element identity would always match; comparing CONTENT is what actually distinguishes
      // "still showing this scan's message" from "removal-queue processing has taken over").
      const scanMessage = '<b>FindA.Sale</b><div style="margin-top:6px">Sold on Facebook -- synced to FindA.Sale: <b>' +
        matchedTitles.map(escapeHtml).join('</b>, <b>') + '</b></div>';
      overlay(scanMessage);
      setTimeout(() => {
        // Only clear if nothing has overwritten it since -- removing it out from under an
        // in-progress removal-queue run would rip a visible, actively-updating progress bar off
        // the page mid-run. Reset `bar` to null on cleanup so a later overlay() call (if any)
        // recreates a fresh, properly-attached element instead of writing into a detached one.
        if (bar && bar.innerHTML === scanMessage) { bar.remove(); bar = null; }
      }, 5000);
    }
  }

  async function start() {
    // (2026-08-05 restructure) The removal-queue flow below used to return immediately when
    // nothing was queued for removal -- the common case -- which meant the sold-detection scan,
    // if it had simply been appended after that early return, would almost never run. These are
    // now two INDEPENDENT flows: the sold-detection scan always runs when this content script
    // loads on this page; removal-queue processing runs only if something is actually queued.
    //
    // Sold-detection runs FIRST, before the removal queue is even checked. Reason: once the
    // removal queue finishes, runRemovalQueue's tail sends 'removalQueueDone', which (in silent
    // "Remove automatically" mode) makes background.js's finishSilentRemoval() call
    // chrome.tabs.remove() on THIS exact tab -- so anything that still needs this page's live
    // DOM cannot safely run after the removal queue completes; it would be racing tab teardown.
    // Running the sold-detection scan up front sidesteps that race entirely, and is safe to do
    // in either order since the two flows never touch overlapping items: getPendingSoldChecks
    // only returns items still AVAILABLE in FindA.Sale, while the removal queue only ever
    // contains items already SOLD there -- mutually exclusive sets, so scanning first can never
    // interfere with (or be stale for) the removal pass that follows.
    await sleep(600); // let the listings grid render before searching for cards
    // (2026-08-09 restructure, ADR-100 -13) Sold-detection now runs against Facebook's own
    // OUT_OF_STOCK status-filter view (SOLD_STATUS_FILTER_URL above) instead of the full
    // unfiltered "Your listings" grid -- confirmed live that this filtered view exists, loads
    // fast, and shows only sold/unavailable cards with the same "Mark as available"/"Relist
    // this item" markers allSoldListingCards already looks for. openSilentRemovalTab() and the
    // fasPendingRemovals notification click (background.js) now both land here directly, so the
    // common case (organizer's own click, or the periodic silent poll) arrives already filtered
    // and no extra navigation/reload is needed.
    //
    // Three possible page states on load:
    //   1. On a title_search page (removal/renewal target, set by ensureFilteredThenRun /
    //      ensureFilteredThenRunRenewal below) -- sold-detection already ran earlier this same
    //      tab visit; skip straight to queue processing.
    //   2. On the OUT_OF_STOCK status-filter page -- run the sold-detection scan.
    //   3. Neither (bare/unfiltered you/selling -- an organizer's own manual navigation, or a
    //      stale bookmark/notification predating this change) -- navigate to the status-filter
    //      URL. Navigation tears down this content script; the fresh load re-enters start() and
    //      lands in case 2 above.
    const onTitleSearchPage = !!currentTitleSearchParam();
    const onSoldFilterPage = pageOnSoldFilterView();
    if (!onTitleSearchPage && !onSoldFilterPage) {
      window.location.href = SOLD_STATUS_FILTER_URL;
      return;
    }
    if (onSoldFilterPage) {
      // (2026-08-06 fix) Load every page of the filtered grid into the DOM before scanning --
      // see loadAllListingCards in fas-selectors.js. The filtered view is normally small enough
      // to need no scrolling at all, but a high-volume organizer could still have more than one
      // page of sold items, so this stays in place as a safety net.
      await SEL.loadAllListingCards();
      await runSoldDetectionScan();
    }

    let q = null;
    try { q = await chrome.runtime.sendMessage({ type: 'getRemovalQueueItem' }); } catch (e) { /* removal flow unavailable this load -- sold-detection scan above still ran */ }
    if (q && q.ok && q.item) {
      await ensureFilteredThenRun(q.item, q.index, q.total);
      return;
    }

    // (2026-08-09, ADR-100 §10/§11/§12) Renewal queue check, same shape as removal above.
    // Checked SECOND, only when nothing was queued for removal -- a removal reflects a real
    // completed sale elsewhere and always takes priority; a renewal is just a freshness bump,
    // never time-critical the way removal is. IMPORTANT: do not signal 'removalQueueDone' (which
    // closes this shared you/selling management tab, see finishSilentRemoval) until BOTH queues
    // have been checked and are BOTH empty -- signaling done between the two checks would close
    // the tab out from under a renewal that was about to run in the very same visit, since
    // removal and renewal now legitimately share one tab/page instead of each having their own.
    let r = null;
    try { r = await chrome.runtime.sendMessage({ type: 'getRenewalQueueItem' }); } catch (e) { /* renewal flow unavailable this load */ }
    if (r && r.ok && r.item) {
      await ensureFilteredThenRunRenewal(r.item, r.index, r.total);
      return;
    }

    // Nothing queued for removal OR renewal. If the sold-detection scan above is what triggered
    // THIS tab (silent mode, sold-checks-only, nothing queued) the auto-opened tab still needs
    // closing + the organizer's previous tab focus restored -- runRemovalQueue's/runRenewalQueue's
    // own tails normally do this via 'removalQueueDone' once THEIR queue finishes, but that
    // message is never sent when there was nothing queued at all. finishSilentRemoval() (the
    // handler behind this message, background.js) already no-ops harmlessly whenever this wasn't
    // a silent-mode auto-opened tab -- it only acts on a stored fasRemovalTabId, which
    // openSilentRemovalTab() is the only thing that ever sets -- so it's safe to send
    // unconditionally here (covers: notify mode, off mode, and an organizer just browsing this
    // page normally, none of which ever set fasRemovalTabId). Renewal reuses this SAME message
    // (not a separate 'renewalQueueDone') since both flows now share the one tab lifecycle.
    try { await chrome.runtime.sendMessage({ type: 'removalQueueDone' }); } catch (e) {}
  }

  start();
})();
