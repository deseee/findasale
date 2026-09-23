/* FindA.Sale -- content script for Craigslist's account-management iframe
 * (accounts.craigslist.org/login/home), NOT the top-level www.craigslist.org/account page.
 *
 * HISTORY: 2026-09-17 root cause -- the postings table lives inside a cross-origin iframe at
 * accounts.craigslist.org/login/home, so this file runs there (manifest: that one path,
 * all_frames). See claude_docs/feature-notes/adr-craigslist-vinted-removal-rootcause-2026-09-17.md.
 *
 * REWRITE 2026-09-23 (findasale-hacker re-review F1/F2/F3 + live read-only DOM/JS capture of
 * Patrick's real dashboard, Patrick-authorized "fix the whole thing"):
 *   Confirmed live DOM: table.accthp_postings > tr.posting-row; td.status[data-postingid] carries
 *   class "active" (or "deleted"); td.title > a text is "<title> - $<price>" (sometimes with a
 *   newline before " - $"); 50 rows per page, paginated via ?filter_page=N&show_tab=postings.
 *   Each row's delete control is <form class="manage delete" data-posting-id="<10 digits>"
 *   data-delete-url="https://accounts.craigslist.org/posting/delete"> with a single
 *   <input type="submit" name="go" value="delete">.
 *   Confirmed live JS (deleteQuestionnaire.min.js): submitting that form is intercepted
 *   (preventDefault) and replaced by ONE XHR POST {posting_id, action:delete, crypt} -- no
 *   window.confirm, no confirm page. It then shows a cosmetic "how did things go?" rating modal
 *   and optimistically flips the status cell to "deleted" WITHOUT checking the server response,
 *   so the badge is NOT proof. Success is only reported after a fresh GET of the dashboard shows
 *   that posting id with status "deleted" (F3).
 *   Matching (F2): exact normalized title only (price suffix stripped), active rows only, across
 *   ALL dashboard pages, exactly one posting id -- zero or ambiguous is a permanent skip.
 *   Deleting (F1): no page-text heuristics, no "yes" fallback. Only the delete form whose
 *   data-posting-id equals the matched id, inside a row whose title re-matches exactly and is
 *   still active, and whose submit value is exactly "delete".
 *   Reporting: crossPlatformRemovalDeleted / crossPlatformRemovalSkipped /
 *   crossPlatformRemovalAttemptFailed (dedupe + retry cap handled by background.js).
 */
(async function () {
  // ================================================================================================
  // MANDATORY FIRST CHECK -- do not move anything above this block, do not add any code before it.
  // ================================================================================================
  // Returns a label naming which criterion fired (for diagnosis -- never field values), or null.
  function fasCredentialSurfaceReason() {
    if (document.querySelector('input[type="password"]')) return 'password_input';
    const sensitiveAutocomplete = Array.from(document.querySelectorAll('input[autocomplete]')).some((el) => {
      const v = (el.getAttribute('autocomplete') || '').toLowerCase();
      return v.indexOf('current-password') !== -1 || v.indexOf('new-password') !== -1 || v.indexOf('one-time-code') !== -1;
    });
    if (sensitiveAutocomplete) return 'sensitive_autocomplete';
    const sensitiveForm = Array.from(document.querySelectorAll('form[action]')).some((f) => {
      const a = (f.getAttribute('action') || '').toLowerCase();
      if (!(a.indexOf('login') !== -1 || a.indexOf('signin') !== -1 || a.indexOf('auth') !== -1)) return false;
      // 2026-09-23: the logged-in dashboard's own filter/search form (#account-homepage-form) posts to
      // .../login/home because the dashboard itself lives at that path -- live-confirmed as the cause
      // of the false positive. Exempt ONLY that exact form, and only when it holds no email/username/
      // password/otp-looking field, so a real sign-in form can never ride on this exemption.
      if (f.id === 'account-homepage-form' && a.replace(/[?#].*$/, '').replace(/\/+$/, '') === 'https://accounts.craigslist.org/login/home') {
        const credLike = Array.from(f.querySelectorAll('input')).some((i) => {
          const t = (i.getAttribute('type') || 'text').toLowerCase();
          const n = ((i.getAttribute('name') || '') + ' ' + (i.getAttribute('id') || '')).toLowerCase();
          return t === 'password' || t === 'email' || /mail|user|login|pass|otp|code/.test(n);
        });
        return credLike;
      }
      return true;
    });
    if (sensitiveForm) return 'login_form_action';
    return null;
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  // Poll (4s/250ms) so a transient auth-settling state doesn't trip the guard; a persistent
  // credential surface is still refused (fail closed on timeout).
  const fasCredentialSurfaceDeadline = Date.now() + 4000;
  let fasCredReason = fasCredentialSurfaceReason();
  while (fasCredReason && Date.now() < fasCredentialSurfaceDeadline) {
    await sleep(250);
    fasCredReason = fasCredentialSurfaceReason();
  }
  if (fasCredReason) {
    console.warn('[FAS Craigslist Removal Frame] credential-entry surface detected (' + fasCredReason + ') -- refusing to run, exiting immediately.');
    return;
  }
  function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // ---- overlay UI ----
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
  function overlayWarn(text) { overlay('<b>FindA.Sale</b><div style="margin-top:6px;font-size:13px;color:#ffcf7a">' + text + '</div>'); }

  // ---- normalization (same folding as the Vinted/Poshmark/Mercari removal matchers) ----
  function fasFoldTitle(s) {
    let t = String(s || '');
    try { t = t.normalize('NFKC'); } catch (e) {}
    return t
      .replace(/[‘’ʼ]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/ /g, ' ')
      .replace(/…/g, '...')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
  // Dashboard title cell text is "<title> - $<price>" -- strip only that trailing price suffix.
  function crRemTitleFromCell(text) {
    return fasFoldTitle(String(text || '').replace(/\s*-\s*\$\s?[\d,]+(?:\.\d+)?\s*$/, ''));
  }

  const CR_MIN_SAFE_TITLE_LEN = 8;
  const CR_MAX_PAGES = 30;
  const CR_PAGE_SIZE = 50;
  const CR_PENDING_TTL_MS = 5 * 60 * 1000;
  const CR_PENDING_KEY = 'fasClRemovalPending';

  function crRemParseRows(doc) {
    const table = doc.querySelector('table.accthp_postings');
    if (!table) return null;
    return Array.from(table.querySelectorAll('tr.posting-row')).map((tr) => {
      const st = tr.querySelector('td.status[data-postingid]');
      const a = tr.querySelector('td.title a');
      const cls = st ? st.classList : null;
      return {
        tr,
        postingId: st ? String(st.getAttribute('data-postingid') || '') : '',
        active: !!(cls && cls.contains('active')),
        deleted: !!(cls && cls.contains('deleted')),
        title: crRemTitleFromCell(a ? a.textContent : ''),
        rawTitle: fasFoldTitle(a ? a.textContent : ''),
      };
    }).filter((r) => /^\d{6,}$/.test(r.postingId));
  }
  function crRemPageUrl(n) {
    return 'https://accounts.craigslist.org/login/home?filter_page=' + n + '&show_tab=postings';
  }
  function crRemCurrentPage() {
    const m = /[?&]filter_page=(\d+)/.exec(location.search);
    return m ? parseInt(m[1], 10) : 1;
  }
  async function crRemFetchPage(n) {
    const res = await fetch(crRemPageUrl(n), { credentials: 'include', cache: 'no-store' });
    if (!res.ok) throw new Error('page_fetch_' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const rows = crRemParseRows(doc);
    if (!rows) throw new Error('page_' + n + '_no_postings_table');
    return { doc, rows };
  }
  // Every row across every dashboard page, each tagged with its page number. Any page failing to
  // load aborts (returns ok:false) -- uniqueness can't be proven from a partial read.
  async function crRemAllRows() {
    const here = crRemCurrentPage();
    const hereRows = crRemParseRows(document);
    if (!hereRows) return { ok: false, reason: 'dashboard_table_missing' };
    // Don't trust the pager links (they may show only a window of pages): keep reading
    // filter_page=n until a page comes back short. Hitting the cap on a full page = can't prove
    // uniqueness, so refuse (hacker re-review 2026-09-23, P2).
    const all = hereRows.map((r) => Object.assign({ page: here }, r));
    let lastLen = here === 1 ? hereRows.length : CR_PAGE_SIZE;
    for (let n = 1; n <= CR_MAX_PAGES; n++) {
      if (n === here) { if (hereRows.length < CR_PAGE_SIZE) break; continue; }
      if (n > 1 && lastLen < CR_PAGE_SIZE) break;
      let rows;
      try {
        rows = (await crRemFetchPage(n)).rows;
      } catch (e) {
        return { ok: false, reason: 'page_read_failed:' + ((e && e.message) || 'unknown') };
      }
      rows.forEach((r) => all.push(Object.assign({ page: n }, r)));
      lastLen = rows.length;
      if (rows.length < CR_PAGE_SIZE) break;
      if (n === CR_MAX_PAGES) return { ok: false, reason: 'too_many_pages' };
      await sleep(400 + Math.random() * 400);
    }
    return { ok: true, rows: all };
  }

  async function report(type, item, reason) {
    const msg = { type, itemId: item.id, platform: 'CRAIGSLIST' };
    if (reason) msg.reason = reason;
    try { await chrome.runtime.sendMessage(msg); } catch (e) {}
  }
  async function getPending() {
    let p = null;
    try { const st = await chrome.storage.local.get([CR_PENDING_KEY]); p = st[CR_PENDING_KEY] || null; } catch (e) { return null; }
    // Stale pending state is discarded (hacker re-review 2026-09-23, P3). A stale SUBMITTED entry is
    // still only ever used to verify, never to click again -- dropping it just means a fresh scan.
    if (p && (!p.createdAt || Date.now() - p.createdAt > CR_PENDING_TTL_MS)) { await setPending(null); return null; }
    return p;
  }
  async function setPending(v) {
    try { if (v) await chrome.storage.local.set({ [CR_PENDING_KEY]: Object.assign({ createdAt: Date.now() }, v) }); else await chrome.storage.local.remove(CR_PENDING_KEY); } catch (e) {}
  }

  // Server-side proof: fresh GETs of the dashboard must show this posting id with status "deleted".
  // Polls up to ~20s (the delete XHR is fire-and-forget on Craigslist's side).
  async function crRemVerifyDeleted(postingId, pageHint) {
    const deadline = Date.now() + 20000;
    let last = 'not_checked';
    let fetches = 0;
    const pagesToTry = [pageHint || 1];
    if (pagesToTry[0] !== 1) pagesToTry.push(1);
    while (Date.now() < deadline && fetches < 8) {
      await sleep(2500);
      for (const n of pagesToTry) {
        if (fetches >= 8) break;
        fetches++;
        let rows;
        try { rows = (await crRemFetchPage(n)).rows; } catch (e) { last = 'fetch_failed'; break; }
        if (!rows.length) break;
        const row = rows.find((r) => r.postingId === postingId);
        if (row) {
          if (row.deleted && !row.active) return { ok: true };
          last = row.active ? 'still_active' : 'status_unknown';
          break;
        }
        last = 'row_not_found';
        await sleep(400 + Math.random() * 400);
      }
    }
    return { ok: false, reason: last };
  }

  async function runCraigslistRemovalQueue(item) {
    const wanted = fasFoldTitle(item.title);
    overlayInfo('This item sold elsewhere. Looking for the matching Craigslist posting for <b>' + escapeHtml(item.title) + '</b>...');

    // Positive signal: only ever act on the real, logged-in postings dashboard. Wait for it.
    const tableDeadline = Date.now() + 8000;
    while (!document.querySelector('table.accthp_postings') && Date.now() < tableDeadline) await sleep(250);
    if (!document.querySelector('table.accthp_postings')) {
      overlayWarn('Could not find your Craigslist postings list on this page. Will try again later.');
      await report('crossPlatformRemovalAttemptFailed', item, 'dashboard_table_missing');
      return;
    }

    // Resume: a delete for this item was already submitted (e.g. the frame reloaded) -- verify only.
    const pending = await getPending();
    if (pending && pending.itemId === item.id && pending.postingId && pending.submittedAt) {
      overlayInfo('Checking that the Craigslist posting for <b>' + escapeHtml(item.title) + '</b> was deleted...');
      const v = await crRemVerifyDeleted(pending.postingId, pending.page);
      await setPending(null);
      if (v.ok) {
        overlayInfo('Removed the Craigslist posting for <b>' + escapeHtml(item.title) + '</b> (confirmed deleted).');
        await report('crossPlatformRemovalDeleted', item);
      } else {
        overlayWarn('Could not confirm the Craigslist posting was deleted (' + escapeHtml(v.reason) + '). Will try again.');
        await report('crossPlatformRemovalAttemptFailed', item, 'delete_unverified:' + v.reason);
      }
      return;
    }

    if (wanted.length < CR_MIN_SAFE_TITLE_LEN) {
      overlayWarn('Title too short to match safely. Please delete this Craigslist posting yourself.');
      await report('crossPlatformRemovalSkipped', item, 'title_too_short_for_safe_match');
      return;
    }

    // Find the target: navigate straight to its page when a prior load already located it.
    let target = null;
    if (pending && pending.itemId === item.id && pending.postingId && !pending.submittedAt && pending.page === crRemCurrentPage()) {
      target = { postingId: pending.postingId, page: pending.page };
    } else {
      const all = await crRemAllRows();
      if (!all.ok) {
        overlayWarn('Could not read all of your Craigslist postings (' + escapeHtml(all.reason) + '). Will try again.');
        await report('crossPlatformRemovalAttemptFailed', item, all.reason);
        return;
      }
      const matches = all.rows.filter((r) => r.active && (r.title === wanted || r.rawTitle === wanted));
      const ids = Array.from(new Set(matches.map((r) => r.postingId)));
      if (ids.length !== 1) {
        const reason = ids.length ? 'ambiguous_duplicate_title' : 'no_confident_listing_match';
        overlayWarn('Could not find exactly one active Craigslist posting titled "' + escapeHtml(item.title) + '" (' + reason + '). Please check it yourself.');
        await setPending(null);
        await report('crossPlatformRemovalSkipped', item, reason);
        return;
      }
      target = { postingId: ids[0], page: matches[0].page };
      if (target.page !== crRemCurrentPage()) {
        await setPending({ itemId: item.id, postingId: target.postingId, page: target.page });
        location.href = crRemPageUrl(target.page);
        return;
      }
    }

    // Re-validate the row in the live DOM right before acting.
    const rows = crRemParseRows(document) || [];
    const row = rows.find((r) => r.postingId === target.postingId);
    if (!row || !row.active || !(row.title === wanted || row.rawTitle === wanted)) {
      await setPending(null);
      overlayWarn('The matching Craigslist posting changed before it could be deleted. Will try again.');
      await report('crossPlatformRemovalAttemptFailed', item, row ? 'row_revalidation_failed' : 'row_not_on_page');
      return;
    }
    const forms = Array.from(row.tr.querySelectorAll('form.manage.delete'));
    const form = forms.length === 1 && String(forms[0].getAttribute('data-posting-id') || '') === target.postingId ? forms[0] : null;
    const submit = form ? Array.from(form.querySelectorAll('input[type="submit"], button[type="submit"]')).filter((b) => fasFoldTitle(b.value || b.textContent) === 'delete') : [];
    if (!form || submit.length !== 1) {
      await setPending(null);
      overlayWarn('Found the posting but not its delete control. Please delete it yourself.');
      await report('crossPlatformRemovalAttemptFailed', item, 'delete_control_not_found');
      return;
    }

    await setPending({ itemId: item.id, postingId: target.postingId, page: target.page, submittedAt: Date.now() });
    overlayInfo('Deleting the Craigslist posting for <b>' + escapeHtml(item.title) + '</b>...');
    submit[0].click(); // Craigslist intercepts this and sends one XHR delete (live-confirmed 2026-09-23)

    const v = await crRemVerifyDeleted(target.postingId, target.page);
    await setPending(null);
    if (v.ok) {
      overlayInfo('Removed the Craigslist posting for <b>' + escapeHtml(item.title) + '</b> (confirmed deleted).');
      await report('crossPlatformRemovalDeleted', item);
    } else {
      overlayWarn('Could not confirm the Craigslist posting was deleted (' + escapeHtml(v.reason) + '). Will try again.');
      await report('crossPlatformRemovalAttemptFailed', item, 'delete_unverified:' + v.reason);
    }
  }

  async function maybeRunCraigslistRemoval() {
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getRemovalQueueItemFor', platform: 'CRAIGSLIST' }); } catch (e) { return false; }
    if (!queued || !queued.ok || !queued.item) return false;
    try {
      await runCraigslistRemovalQueue(queued.item);
    } catch (e) {
      overlayWarn('Something went wrong removing this Craigslist posting (' + escapeHtml((e && e.message) || 'unknown error') + '). Will try again.');
      await report('crossPlatformRemovalAttemptFailed', queued.item, 'exception:' + ((e && e.message) || 'unknown'));
    }
    return true;
  }

  // Page-scoping is the manifest match (accounts.craigslist.org/login/home*, all_frames) plus the
  // dedicated-removal-tab check inside background.js's getRemovalQueueItemFor handler.
  maybeRunCraigslistRemoval();
})();
