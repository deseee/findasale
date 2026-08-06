/* FindA.Sale — content script on Facebook Marketplace order/inbox surfaces
 * (facebook.com/marketplace/you/*, facebook.com/marketplace/inbox/*).
 *
 * *** UNVERIFIED AGAINST LIVE FACEBOOK DOM -- READ THIS BEFORE TOUCHING OR SHIPPING ***
 * Built 2026-08-02, from Meta's own Help Center documentation ONLY
 * (facebook.com/help/130229725402513, "Ship items using your own label on Facebook
 * Marketplace"). Patrick's FindA.Sale account has ZERO shipping orders as of this
 * writing ("No shipping orders yet" on the Shipping Orders page, confirmed live
 * 2026-08-01), so the real "Orders with delivery" list and the "Edit tracking number"
 * dialog's actual DOM could NOT be visually verified this session -- see
 * claude_docs/feature-notes/shipping-architecture-review-2026-08-01.md, Section 1 and
 * the "Self-Report Tracking Number -- Implementation Spec" section for full context.
 * Every selector guess below (findOrdersHeading / findTrackingDialog) is a best effort
 * based on Meta's written steps and on DOM conventions already confirmed elsewhere on
 * Marketplace (see fas-selectors.js / fas-remove.js). Earlier in this same session,
 * automation built against an assumed-but-unverified FB page structure caused a
 * stale-queue bug and separately nearly corrupted a real Facebook listing -- this file
 * is deliberately built NOT to repeat that: it never clicks or fills anything (see scope
 * note below), and every DOM read is read-only and wrapped so a miss just means the
 * reminder doesn't show, never a wrong guess acted on. STATUS: BUILT, PENDING LIVE
 * VERIFICATION -- do not treat as done/shippable until checked against a real
 * completed FB order (Feed -> Marketplace -> "Orders with delivery" -> an actual
 * order -> "Edit tracking number").
 *
 * SCOPE (deliberately minimal -- see the Implementation Spec doc above for the full
 * reasoning): this is a READ-ONLY, ADVISORY assistant, nothing more. It never fills in
 * a tracking number and never clicks Save/Done on the organizer's behalf -- Facebook's
 * own docs say that action "can't be changed again later," so autofilling into
 * unverified fields is a materially worse failure than a normal mis-click elsewhere on
 * this extension. All it does: (1) recognize the order/tracking surface by URL + best-
 * guess on-page text, and (2) surface a small, dismissible reminder overlay (the 7-
 * business-day / one-time-only deadline, plus a pointer to Facebook's own "Edit
 * tracking number" control). Auto-fill, auto-click, and syncing the organizer's entered
 * tracking number back to FindA.Sale's own dashboard are all explicitly deferred --
 * they need live-DOM verification and (for the dashboard sync) a schema field that does
 * not exist yet (proposed, not migrated -- see the spec doc).
 */
(function () {
  const SEL = window.__FAS_SEL__;
  if (!SEL) {
    console.error('[FindA.Sale][fas-tracking] fas-selectors.js did not load before this script -- aborting, nothing will run on this page.');
    return;
  }

  // ---- Step 1: URL-pattern gate (defensive, per this feature's build rules) --
  // never assume a DOM structure is present just because the manifest's host match
  // fired. manifest.json scopes this file to marketplace/you/* and marketplace/inbox/*,
  // but Facebook nests many unrelated sub-pages under both (selling, purchases, saved,
  // ordinary message threads, etc.) -- re-check the live pathname here before doing
  // anything else on the page.
  function looksLikeOrderSurface() {
    const path = window.location.pathname || '';
    return /\/marketplace\/(you|inbox)\//.test(path);
  }

  // ---- Step 2: on-page text gate (BEST GUESS, unverified -- see file header).
  // Meta's documented flow: Feed -> Marketplace -> "Orders with delivery" -> click an
  // order -> "Edit tracking number". Look for either the list heading or an open
  // dialog whose text mentions "tracking number". If Facebook's real copy differs,
  // this simply never fires (fails closed, not open) -- acceptable for a first
  // version, but flagged for live QA via the diagnostic warning in scan() below.
  // (2026-08-06 fix, live-verified) Facebook's real heading on
  // marketplace/you/shipping_orders is "Your orders", NOT "Orders with delivery" --
  // Meta's own Help Center doc (the only source this was originally built from) used
  // different wording than what's actually rendered. Confirmed live against Patrick's
  // real account this session. Keeping the original guess as a second candidate in case
  // Facebook renders different copy on some other entry point into the same feature
  // (e.g. a dialog reached via a notification rather than the list page) -- still no
  // real completed/shippable order existed on this account to verify
  // findTrackingDialog() below against, so that one remains unverified (see file header).
  function findOrdersHeading() {
    const wants = ['your orders', 'orders with delivery'];
    const nodes = Array.from(document.querySelectorAll('h1, h2, [role="heading"]'));
    return nodes.find((n) => {
      const t = SEL.norm(n.textContent);
      return wants.some((w) => t.indexOf(w) !== -1);
    }) || null;
  }

  function findTrackingDialog() {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return null;
    const t = SEL.norm(dialog.textContent);
    if (t.indexOf('tracking number') !== -1) return dialog;
    return null;
  }

  // ---- Overlay UI (mirrors fas-remove.js's bottom-right bar, own element id so the
  // two content scripts never collide if Facebook ever lets both match patterns fire
  // on the same page at once). ----
  let bar;
  function overlay(html) {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'fas-tracking-bar';
      bar.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:360px;' +
        'background:#1f2a24;color:#f3f5f2;border:1px solid #3c8c5a;border-radius:12px;padding:14px 16px;' +
        'font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.4)';
      document.documentElement.appendChild(bar);
    }
    bar.innerHTML = html;
  }
  function dismissOverlay() {
    if (bar) { bar.remove(); bar = null; }
  }

  const REMINDER_HTML =
    '<b>FindA.Sale</b>' +
    '<div style="margin-top:6px">Shipping with your own label instead of Facebook’s? Use ' +
    '<b>Edit tracking number</b> on this order to enter the carrier + tracking number of a label you bought yourself.</div>' +
    '<div style="margin-top:8px;font-size:12px;color:#ffcf7a">Per Facebook: this is a ONE-TIME entry ' +
    '&mdash; it can’t be changed again later, and must be done within 7 business days of marking the order shipped.</div>' +
    '<div id="fas-tracking-dismiss" style="margin-top:10px;font-size:11px;color:#9fb6a8;cursor:pointer;text-decoration:underline">Got it, dismiss</div>';

  function wireDismiss() {
    const el = document.getElementById('fas-tracking-dismiss');
    if (el) {
      el.addEventListener('click', dismissOverlay, { once: true });
    } else {
      console.error('[FindA.Sale][fas-tracking] dismiss control not found in overlay markup after render -- overlay will stay visible until page navigation. This indicates a bug in this file, not a live-FB-DOM mismatch.');
    }
  }

  let warnedThisPage = false;
  function scan() {
    if (!looksLikeOrderSurface()) {
      if (bar) dismissOverlay();
      return;
    }
    const dialog = findTrackingDialog();
    const heading = findOrdersHeading();
    const onRelevantSurface = !!(dialog || heading);
    if (onRelevantSurface) {
      if (!bar) {
        overlay(REMINDER_HTML);
        wireDismiss();
      }
    } else if (bar) {
      // URL still matches but neither guessed marker is present anymore (organizer
      // navigated within the SPA to an unrelated /you or /inbox sub-page) -- clear the
      // reminder so it doesn't linger somewhere it doesn't apply.
      dismissOverlay();
    } else if (!warnedThisPage) {
      // Fail-loud diagnostic (fires once per page, not spammy): the URL matched our
      // guess but neither of our guessed text markers has ever been found. Most likely
      // explanation is the selectors in findOrdersHeading/findTrackingDialog above are
      // wrong for Facebook's real DOM -- see file header, live verification needed.
      warnedThisPage = true;
      console.warn('[FindA.Sale][fas-tracking] On a marketplace/you or /inbox page, but neither the "Orders with delivery" heading nor a tracking-number dialog was found. The guessed selectors in fas-tracking.js may not match Facebook\'s real DOM -- needs live verification against an actual order (see file header comment).');
    }
  }

  if (!looksLikeOrderSurface()) return; // not a plausible order/inbox page at all -- stay fully silent

  // Facebook re-renders this SPA constantly (same reasoning as fas-remove.js's
  // MutationObserver use) -- watch for the heading/dialog appearing or disappearing.
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  scan();

  // Facebook is a single-page app -- marketplace/you/* and marketplace/inbox/* sub-views
  // can change via History API navigation without a full page (re)load, which wouldn't
  // re-run this content script. A lightweight pathname poll is a defensive fallback
  // (same conservative "recheck, never assume" posture as the URL gate above) since
  // patching pushState/replaceState is easy for a future FB change to bypass silently.
  let lastPath = window.location.pathname;
  setInterval(() => {
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname;
      warnedThisPage = false;
      scan();
    }
  }, 1500);

})();
