/* FindA.Sale — content script for Craigslist's account-management iframe
 * (accounts.craigslist.org/login/home), NOT the top-level www.craigslist.org/account page.
 *
 * ROOT CAUSE (found + fixed 2026-09-17, see claude_docs/feature-notes/
 * adr-craigslist-vinted-removal-rootcause-2026-09-17.md): the postings table Craigslist shows at
 * www.craigslist.org/account is rendered entirely inside a same-origin-looking but actually
 * CROSS-ORIGIN iframe at accounts.craigslist.org/login/home. Live-confirmed via javascript_tool
 * against Patrick's real account: the top-level www.craigslist.org/account document has zero <a>
 * elements and only 5 body children (two iframes, a loading overlay, a chat widget) -- everything
 * a removal needs to find (posting rows, delete controls) lives inside that iframe, which the OLD
 * fas-craigslist.js content script (scoped only to post.craigslist.org and www.craigslist.org/
 * account, no all_frames) could never see. This file is a separate, narrowly-scoped content
 * script that runs INSIDE that iframe instead -- see manifest.json's new content_scripts entry
 * matching "https://accounts.craigslist.org/login/home*" with all_frames:true. The removal logic
 * below is moved verbatim from the old (never-working) fas-craigslist.js removal block -- the
 * selectors themselves were never the confirmed problem, only where they were running.
 *
 * SECURITY (findasale-hacker review, 2026-09-17, COMPLETE -- both required changes applied):
 * this exact route (accounts.craigslist.org/login/home) is Craigslist's own SPA route for BOTH
 * the logged-in postings dashboard (what we want) and -- on an expired/logged-out session --
 * plausibly an actual sign-in form, without necessarily changing the URL. The manifest match is
 * already scoped to this one path (not a bare accounts.craigslist.org/*) to avoid catching
 * unrelated flows (password reset, 2FA, billing), but that alone cannot rule out this same route
 * rendering a real login form on reload. The credential-field guard immediately below is what
 * actually closes that gap -- it runs BEFORE anything else in this file, including before the
 * removal-queue check, and unconditionally bails if any credential-entry surface is present.
 */
(function () {
  // ================================================================================================
  // MANDATORY FIRST CHECK -- do not move anything above this block, do not add any code before it.
  // If this frame is showing (or could plausibly be showing) a real credential-entry form, stop
  // immediately and do nothing else in this file, no matter what else is true.
  // ================================================================================================
  function fasHasCredentialSurface() {
    if (document.querySelector('input[type="password"]')) return true;
    const sensitiveAutocomplete = Array.from(document.querySelectorAll('input[autocomplete]')).some((el) => {
      const v = (el.getAttribute('autocomplete') || '').toLowerCase();
      return v.indexOf('current-password') !== -1 || v.indexOf('new-password') !== -1 || v.indexOf('one-time-code') !== -1;
    });
    if (sensitiveAutocomplete) return true;
    const sensitiveForm = Array.from(document.querySelectorAll('form[action]')).some((f) => {
      const a = (f.getAttribute('action') || '').toLowerCase();
      return a.indexOf('login') !== -1 || a.indexOf('signin') !== -1 || a.indexOf('auth') !== -1;
    });
    if (sensitiveForm) return true;
    return false;
  }
  if (fasHasCredentialSurface()) {
    console.warn('[FAS Craigslist Removal Frame] credential-entry surface detected on this page -- refusing to run, exiting immediately.');
    return;
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function escapeHtml(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ---- overlay UI (mirrors fas-craigslist.js's own bottom-right bar) ----
  let bar;
  function ensureBar() {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'fas-craigslist-removal-bar';
      bar.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:340px;' +
        'background:#1f2a24;color:#f3f5f2;border:1px solid #3c8c5a;border-radius:12px;padding:14px 16px;' +
        'font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.4)';
      document.documentElement.appendChild(bar);
    }
    return bar;
  }
  function overlay(html) { ensureBar().innerHTML = html; }
  function overlayInfo(text) { overlay('<b>FindA.Sale</b><div style="margin-top:6px;font-size:13px;color:#cfe3d6">' + text + '</div>'); }
  function button(id, label, primary) {
    return '<button id="' + id + '" style="margin-top:10px;margin-right:8px;padding:7px 12px;border-radius:8px;border:none;cursor:pointer;' +
      'font-weight:600;font-size:13px;background:' + (primary ? '#3c8c5a' : '#3a4842') + ';color:#fff">' + label + '</button>';
  }

  // ================================================================================================
  // CROSS-PLATFORM AUTO-REMOVE-ON-SOLD-ELSEWHERE (S-EXT-CROSS-PLATFORM-AUTOREMOVE, 2026-08-22;
  // moved to this dedicated iframe-scoped file 2026-09-17 -- see file header above for why).
  // Every selector below is unchanged from the original 2026-08-22 code -- best-effort against
  // Craigslist's account-page markup, never live-confirmed against a real delete action (doing so
  // would mean actually deleting one of Patrick's real postings, which needs his own go-ahead) --
  // same hard-error/hands-to-human philosophy as the rest of this extension: if a confident match
  // can't be found, this stops and asks the organizer to finish it themselves rather than guessing.
  // ================================================================================================
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
    if (!/delete/i.test(location.href) && !/delete/i.test((document.body && document.body.innerText || '').slice(0, 400))) return false;
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

  // This file's manifest.json match pattern (accounts.craigslist.org/login/home*, all_frames)
  // IS the page-scoping -- unlike the old fas-craigslist.js code this replaced, no additional
  // location.hostname check is needed here to decide whether to run.
  maybeRunCraigslistRemoval();
})();
