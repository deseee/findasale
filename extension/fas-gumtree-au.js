/* FindA.Sale — content script on www.gumtree.com.au/*.
 * Gumtree Australia crosslisting (ADR-102, 2026-08-09). UNLIKE Craigslist (guest-postable, full
 * posting-form DOM live-verified in fas-craigslist.js), Gumtree AU's ENTIRE posting flow is
 * login-walled: navigating to the real post-ad URL (https://www.gumtree.com.au/p-post-ad.html)
 * while logged out renders a hard Sign In screen on that same URL with zero form fields exposed
 * (live-verified via Chrome MCP, read-only, 2026-08-09 -- see ADR-102 §9). FindA.Sale has no
 * Gumtree AU seller account to verify the post-login form against, and per this project's standing
 * rule (ADR-086, ADR-100 §10/§11) selectors are never guessed -- a guessed field name or category
 * taxonomy that's wrong fails silently or corrupts a real listing.
 *
 * So this script does NOT attempt to auto-fill or auto-submit anything. It:
 *   1. Detects the sign-in wall (best-effort DOM heuristic) and waits -- the human owns login,
 *      same "human owns verification" boundary as fas-craigslist.js.
 *   2. Once past the wall (or if the heuristic can't tell), shows a "manual assist" overlay with
 *      the queued item's title/price/condition/category/description in a copyable block, plus the
 *      photo URLs, so the organizer can paste them into Gumtree's own form by hand.
 *   3. Records the post via the same 'markListed' message fas-craigslist.js/fas-content.js use
 *      (platform: 'GUMTREE_AU') once the organizer confirms they posted, so it's tracked
 *      server-side and gets a renewal-due date like every other channel.
 *
 * See the bottom of this file for the explicit list of what still needs a real logged-in Gumtree
 * AU seller account to verify before any of this can move beyond manual-assist.
 */
(function () {
  const POST_URL = 'https://www.gumtree.com.au/p-post-ad.html';

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function bodyText() { return (document.body && document.body.innerText) || ''; }
  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return Array.from(document.querySelectorAll(sel)); }
  function escapeHtml(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ---- sign-in wall detection (best-effort, DOM-based; informational only, NEVER a hard block --
  // if this misreads, the "I'm logged in, show me the details" button below lets the organizer
  // push past it manually). Requires a password field PLUS a sign-in-shaped heading/button before
  // calling it a wall, to avoid false-positiving on some unrelated page that merely mentions
  // "sign in" in a header link. UNVERIFIED against the real page structure post-login (no account
  // exists to confirm what the DOM looks like once past the wall) -- see the verification list at
  // the bottom of this file.
  function looksLikeSignInWall() {
    const hasPasswordField = !!q('input[type="password"]');
    if (!hasPasswordField) return false;
    const lower = bodyText().toLowerCase();
    return /sign in/.test(lower) || /log in/.test(lower) || /welcome back/.test(lower);
  }

  // Same best-effort/never-a-hard-gate shape as fas-craigslist.js's isLoggedIntoCraigslist --
  // returns true/false only on a clear signal, null when genuinely unknown on this page.
  function isLoggedIntoGumtreeAu() {
    if (looksLikeSignInWall()) return false;
    const clickable = qa('a, button');
    const hasLogout = clickable.some((el) => {
      const t = norm(el.textContent);
      return t === 'log out' || t === 'logout' || t === 'sign out' || t.indexOf('log out') !== -1 || t.indexOf('sign out') !== -1;
    });
    if (hasLogout) return true;
    const hasSignIn = clickable.some((el) => {
      const t = norm(el.textContent);
      return t === 'sign in' || t === 'log in' || t === 'login';
    });
    if (hasSignIn) return false;
    return null;
  }

  async function reportLoginState() {
    const state = isLoggedIntoGumtreeAu();
    if (state === null) return;
    try { await chrome.runtime.sendMessage({ type: 'gumtreeAuLoginStateObserved', loggedIn: state }); } catch (e) {}
  }

  // ---- overlay UI (same bottom-right bar pattern as fas-craigslist.js / fas-remove.js) ----
  let bar;
  function ensureBar() {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'fas-gumtree-au-bar';
      bar.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:360px;' +
        'background:#1f2a24;color:#f3f5f2;border:1px solid #3c8c5a;border-radius:12px;padding:14px 16px;' +
        'font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.4)';
      document.documentElement.appendChild(bar);
    }
    return bar;
  }
  function overlay(html) { ensureBar().innerHTML = html; }
  function button(id, label, primary) {
    return '<button id="' + id + '" style="margin-top:10px;margin-right:8px;padding:7px 12px;border-radius:8px;border:none;cursor:pointer;' +
      'font-weight:600;font-size:13px;background:' + (primary ? '#3c8c5a' : '#3a4842') + ';color:#fff">' + label + '</button>';
  }
  function closeBtnHandler() { const c = document.getElementById('fas-gt-close'); if (c) c.onclick = () => bar && bar.remove(); }

  function itemDetailsText(item) {
    const price = item.price != null && isFinite(Number(item.price)) ? '$' + Number(item.price).toFixed(2) : '(no price set)';
    const lines = [
      item.title || '',
      'Price: ' + price,
      item.condition ? 'Condition: ' + item.condition : null,
      'Category: ' + (item.category || '(not set -- choose the closest Gumtree category yourself)'),
      '',
      item.description || ''
    ].filter((l) => l !== null);
    return lines.join('\n');
  }

  async function copyToClipboard(text, btnId, doneLabel) {
    try {
      await navigator.clipboard.writeText(text);
      const el = document.getElementById(btnId);
      if (el) { const orig = el.textContent; el.textContent = doneLabel || 'Copied!'; setTimeout(() => { el.textContent = orig; }, 1500); }
      return true;
    } catch (e) { return false; }
  }

  // ---- sign-in wall step: human owns login, same boundary fas-craigslist.js holds for
  // phone/email/CAPTCHA verification. Never types credentials, never clicks a submit on this
  // screen -- just waits and offers a manual override in case the DOM heuristic above is wrong. ----
  function doSignInStep(item, index, total) {
    overlay('<b>FindA.Sale</b><div style="margin-top:6px;font-size:13px;color:#cfe3d6">' +
      'Sign in to Gumtree Australia to continue -- FindA.Sale never enters your login for you.' +
      '</div>' +
      button('fas-gt-continue', "I'm signed in — show item details", true) +
      button('fas-gt-close', 'Close', false));
    const cont = document.getElementById('fas-gt-continue');
    if (cont) cont.onclick = () => doAssistStep(item, index, total);
    closeBtnHandler();
  }

  // ---- manual-assist step: the actual posting-form DOM (fields, category taxonomy, image
  // upload mechanism, submit button) has never been verified against a real logged-in session --
  // see the verification list at the bottom of this file. Rather than guess at any of it, this
  // shows the item's details in a copyable block so the organizer fills Gumtree's form themselves,
  // then confirms with the button below (which IS wired up -- it's the only automatable part of
  // this flow right now). ----
  function doAssistStep(item, index, total) {
    const more = (index + 1) < total;
    const detailsText = itemDetailsText(item);
    const photoUrls = item.photoUrls || [];
    const photoNote = photoUrls.length
      ? photoUrls.length + ' photo' + (photoUrls.length === 1 ? '' : 's') + ' -- copy the links below and save/upload them to this listing yourself (Gumtree\'s own upload mechanism isn\'t automated yet).'
      : 'No photos on this item.';
    overlay('<b>FindA.Sale</b>' +
      '<div style="margin-top:6px;font-size:13px;color:#cfe3d6">Gumtree Australia\'s posting form isn\'t autofilled yet (see the extension popup for why) -- copy these details into the form yourself:</div>' +
      '<textarea id="fas-gt-details" readonly style="width:100%;height:90px;margin-top:8px;background:#14201a;color:#f3f5f2;border:1px solid #3c8c5a;border-radius:6px;padding:6px;font-size:12px;box-sizing:border-box">' + escapeHtml(detailsText) + '</textarea>' +
      button('fas-gt-copy', 'Copy details', false) +
      (photoUrls.length ? button('fas-gt-copy-photos', 'Copy photo links', false) : '') +
      '<div style="margin-top:6px;font-size:11px;color:#9fb6a8">' + escapeHtml(photoNote) + '</div>' +
      (more ? button('fas-gt-next', 'I posted — next item &#9654;', true) : button('fas-gt-next', 'I posted — done', true)) +
      button('fas-gt-close', 'Close', false) +
      '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');

    const copyBtn = document.getElementById('fas-gt-copy');
    if (copyBtn) copyBtn.onclick = () => copyToClipboard(detailsText, 'fas-gt-copy', 'Copied!');
    const copyPhotosBtn = document.getElementById('fas-gt-copy-photos');
    if (copyPhotosBtn) copyPhotosBtn.onclick = () => copyToClipboard(photoUrls.join('\n'), 'fas-gt-copy-photos', 'Copied!');

    const next = document.getElementById('fas-gt-next');
    if (next) next.onclick = async () => {
      // Same fire-and-forget markListed call fas-craigslist.js makes on its own "I posted"
      // confirm button -- remoteListingId stays null (Gumtree AU never exposes a listing id/url
      // back to this script since nothing here reads its post-submit response).
      try { await chrome.runtime.sendMessage({ type: 'markListed', itemId: item.id, remoteListingId: null, platform: 'GUMTREE_AU' }); } catch (e) {}
      try { await chrome.runtime.sendMessage({ type: 'advanceGumtreeAuQueue' }); } catch (e) {}
      if (more) { location.href = POST_URL; } else { bar && bar.remove(); }
    };
    closeBtnHandler();
  }

  function run(item, index, total) {
    if (looksLikeSignInWall()) { doSignInStep(item, index, total); return; }
    doAssistStep(item, index, total);
  }

  async function start() {
    await sleep(500); // let the page settle before reading the DOM
    reportLoginState(); // fire-and-forget, best-effort, mirrors fas-craigslist.js's reportLoginState
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getGumtreeAuQueueItem' }); } catch (e) { return; }
    if (!queued || !queued.ok || !queued.item) return; // nothing queued -- stay silent
    run(queued.item, queued.index, queued.total);
  }

  start();
})();

/* ---- What still needs a real logged-in Gumtree AU seller account to verify (ADR-102 §9/§4) ----
 * Not "needs more testing" -- specifically, a logged-in session is needed to confirm:
 *   1. The post-login posting-form field names/ids for title, price, description, condition, and
 *      whether Gumtree AU exposes a "for sale by owner"-equivalent listing type toggle at all.
 *   2. Gumtree AU's category taxonomy (its own tree, not assumed to resemble Craigslist's or
 *      Facebook's) -- no mapping table exists in this file because guessing one risks silently
 *      misfiling every listing.
 *   3. The image upload mechanism (drag-and-drop zone vs. plain <input type="file">, and whether
 *      it accepts a programmatic DataTransfer the way Craigslist's does) -- this file does not
 *      attempt any photo injection, only copies the URLs for manual upload.
 *   4. Whether Gumtree AU requires phone/SMS verification to publish a first listing (Gumtree's
 *      other regional sites commonly do) -- if so, the human-owns-verification boundary this file
 *      already assumes still applies, but the exact trigger point is unconfirmed.
 *   5. Whether a native "renew"/"bump" action exists on the seller's own listings-management page,
 *      and what it looks like -- background.js's auto-renew currently always falls back to a full
 *      repost for GUMTREE_AU (same as Craigslist) specifically because this has never been checked.
 *   6. The real listing lifespan/expiry window -- extensionController.ts currently uses a flagged,
 *      unverified 14-day placeholder (see RENEWAL_LAPSE_WINDOW_DAYS comment) pending this.
 *   7. Whether the sign-in-wall heuristic in this file (looksLikeSignInWall) actually matches the
 *      real sign-in page's markup, and what the DOM looks like immediately after a successful
 *      login (to confirm isLoggedIntoGumtreeAu's logged-in branch fires correctly).
 */
