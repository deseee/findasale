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

  // Shared step narration + diagnostics (fas-trace.js). Guarded so a missing module or a logging error never breaks a run.
  // This script runs in every frame matching the account dashboard path (all_frames), but only the frame that is actually
  // handed work (a removal item, or the one-shot Renew All grant from background.js) ever begins a trace, so narration is not
  // duplicated across frames; every record carries which frame it came from.
  const FT_FRAME = (function () { try { return window === window.top ? 'top' : 'iframe'; } catch (e) { return 'iframe'; } })();
  function FT(method) {
    try {
      const t = (typeof window !== 'undefined' && window.FAS_TRACE) || null;
      if (t && typeof t[method] === 'function') return t[method].apply(t, Array.prototype.slice.call(arguments, 1));
    } catch (e) { /* logging must never break the flow */ }
    return undefined;
  }
  let ftActive = false; // true only in the frame that began a trace
  function FTA(method) { if (!ftActive) return undefined; return FT.apply(null, arguments); }
  // Plain-language explanation for every removal / renewal outcome code this file can report.
  function crReasonText(reason) {
    const r = String(reason || '');
    const map = {
      dashboard_table_missing: ['Could not find your Craigslist postings list', 'This page did not show the postings table the extension needs (you may be signed out, or Craigslist changed the page).', 'Nothing was deleted. FindA.Sale will try again later; sign in to Craigslist if you are signed out.'],
      title_too_short_for_safe_match: ['Title too short to match safely', 'The item title is too short to be sure which Craigslist posting is the right one, so the extension will not guess.', 'Nothing was deleted. Please delete this posting yourself on Craigslist.'],
      ambiguous_duplicate_title: ['More than one Craigslist posting has this title', 'Several active postings share this exact title, and the extension will not delete one without being certain it is the right one.', 'Nothing was deleted. Please delete the right posting yourself.'],
      listing_not_found: ['No active Craigslist posting with this title', 'Every page of your postings was read and none is an active posting with this exact title, so it is probably already gone.', 'Nothing was deleted. FindA.Sale records this item as not found on Craigslist.'],
      delete_control_not_found: ['Found the posting but not its delete button', 'The posting row is there, but its delete control did not look the way the extension expects, so it did not click anything.', 'Nothing was deleted. Please delete it yourself.'],
      row_revalidation_failed: ['The posting changed before it could be deleted', 'Right before deleting, the row no longer matched (title or status changed), so the extension stopped.', 'Nothing was deleted. FindA.Sale will try again later.'],
      row_not_on_page: ['The posting was not on the expected page', 'After moving to the page that held the posting, the row was no longer there.', 'Nothing was deleted. FindA.Sale will try again later.']
    };
    if (map[r]) return { title: map[r][0], why: map[r][1], next: map[r][2] };
    if (r.indexOf('delete_unverified:') === 0) return { title: 'Could not confirm the Craigslist posting was deleted', why: 'The delete was sent, but a fresh read of your postings did not show it as deleted (' + r.slice(18) + ').', next: 'FindA.Sale will check again on a later run. If the posting is still live, delete it yourself.' };
    if (r.indexOf('page_read_failed') === 0 || r === 'too_many_pages' || r === 'pagination_stalled' || r.indexOf('incomplete_read') === 0) return { title: 'Could not read all of your Craigslist postings', why: 'Every page of postings must be read to be sure only one matches (' + r + '), and that did not complete.', next: 'Nothing was deleted. FindA.Sale will try again later.' };
    if (r.indexOf('exception:') === 0) return { title: 'Something went wrong removing the posting', why: 'An unexpected error stopped the removal (' + r.slice(10) + ').', next: 'Nothing further was done. FindA.Sale will try again later.' };
    if (r === 'renew_all_control_not_found') return { title: 'Could not find "renew all postings"', why: 'The Renew All button did not appear on the dashboard (signed out, nothing eligible, or the page changed).', next: 'Nothing was renewed. FindA.Sale will try again later; check Craigslist yourself if this keeps happening.' };
    if (r === 'renew_all_form_disappeared_unverified') return { title: 'Renew All clicked, result not verified', why: 'After clicking, the page changed and the Renew All area did not come back, so success could not be confirmed.', next: 'FindA.Sale does not count this as renewed. Check your Craigslist postings manually.' };
    if (r === 'renew_all_timed_out_unverified') return { title: 'Renew All clicked, but it never finished', why: 'The button still said "renewing, please wait" for the whole wait (it scales with how many postings you have, up to 6 minutes), and a fresh read of your postings did not show them renewed.', next: 'FindA.Sale does not count this as renewed. It was not clicked a second time. FindA.Sale checks again on the next renewal run.' };
    if (r.indexOf('renew_all_timed_out_partial') === 0) return { title: 'Renew All was still working when the wait ran out', why: 'Some postings were renewed (' + r.slice(28) + ' renew buttons before/after), but not all of them by the end of the wait.', next: 'FindA.Sale does not count this as renewed. It was not clicked a second time. FindA.Sale checks again on the next renewal run.' };
    if (r.indexOf('renew_all_finished_still_renewable') === 0) return { title: 'Renew All finished, but postings still show "renew"', why: 'The button returned to normal, yet a fresh read of your postings still shows the same renew buttons (' + r.slice(35) + ' before/after).', next: 'FindA.Sale does not count this as renewed. Check your Craigslist postings manually.' };
    if (r === 'reloaded_after_click_unverified') return { title: 'Craigslist reloaded after Renew All', why: 'The page reloaded after the click, so the result could not be seen. The extension will not click a second time.', next: 'FindA.Sale does not count this as renewed. Check your Craigslist postings manually.' };
    return { title: 'Craigslist step did not complete', why: 'Reason code: ' + r, next: 'FindA.Sale will try again later.' };
  }

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
  // 1.0.82 (2026-10-29): hard ceiling raised 30 -> 80 pages (4,000 postings, all statuses). When the dashboard shows its
  // "of N total" count the read stops at ceil(N/50)+2 pages instead, so a normal account never comes near the ceiling.
  const CR_MAX_PAGES = 80;
  const CR_PAGE_SIZE = 50;
  // Craigslist cuts posting titles at 70 characters (live: "Jefferson Airplane ... Vinyl LP Record, 1970s" is 72 chars on
  // FindA.Sale). Same rule as the price-edit flow's clTitleMatches: an exact match, or a dashboard title of 60-72 characters that
  // is a pure prefix of the wanted title (that long a prefix cannot belong to a different listing). The exactly-one rule still applies.
  function crTitleMatches(row, wanted) {
    if (!row || !wanted) return false;
    if (row.title === wanted || row.rawTitle === wanted) return true;
    const c = String(row.title || '').replace(/\s*\.{3,}\s*$/, '').trim();
    const w = String(wanted).replace(/\s*\.{3,}\s*$/, '');
    return c.length >= 60 && c.length <= 72 && w.length > c.length && w.indexOf(c) === 0;
  }
  // A saved Craigslist reference may be the bare posting id or the posting URL (".../d/<slug>/7986095940.html").
  function crPostingIdFromRef(ref) {
    const s = String(ref == null ? '' : ref).trim();
    if (/^\d{9,12}$/.test(s)) return s;
    const m = /\/(\d{9,12})\.html(?:[?#]|$)/.exec(s) || /\/manage\/(\d{9,12})(?:[/?#]|$)/.exec(s) || /[?&](?:postingid|postid)=(\d{9,12})(?:[&#]|$)/i.exec(s);
    return m ? m[1] : '';
  }
  function crParseTotal(text) {
    const m = /\bof\s+([\d,]+)\s+total\b/i.exec(String(text || ''));
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
  }
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
  // 1.0.82 (2026-10-29): every read and every navigation uses the explicit all-statuses view (filter_active=all). Without it,
  // filter_page was not honoured (live 2026-10-29: ~164 active postings, 30 "full" pages read, too_many_pages), while the
  // reconcile scan and price-edit scan, which always sent filter_active=all, read all 347 postings in 7 pages. Page numbers from a
  // scan are only valid in that same view, so the frame navigates to it before using a row's delete control.
  function crRemPageUrl(n) {
    return 'https://accounts.craigslist.org/login/home?filter_page=' + n + '&show_tab=postings&filter_active=all';
  }
  function crRemOnScanView() { return /[?&]filter_active=all(?:[&#]|$)/.test(location.search); }
  // 0 = this frame is not showing the all-statuses view, so its rows can't be mixed with scanned pages.
  function crRemCurrentPage() {
    if (!crRemOnScanView()) return 0;
    const m = /[?&]filter_page=(\d+)/.exec(location.search);
    return m ? parseInt(m[1], 10) : 1;
  }
  async function crRemFetchPage(n) {
    let res = null;
    // Rate-aware: a 429/503 waits (5 s, then 15 s) and tries the same page again before giving up.
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(crRemPageUrl(n), { credentials: 'include', cache: 'no-store' });
      if (res.status !== 429 && res.status !== 503) break;
      if (attempt < 2) await sleep(attempt === 0 ? 5000 : 15000);
    }
    if (!res.ok) throw new Error('page_fetch_' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const rows = crRemParseRows(doc);
    if (!rows) throw new Error('page_' + n + '_no_postings_table');
    return { doc, rows };
  }
  // Every row across every dashboard page (all statuses), each tagged with its page number. Any page failing to load aborts
  // (ok:false) -- uniqueness can't be proven from a partial read. Don't trust the pager links: read filter_page=n until a page
  // comes back short (hacker re-review 2026-09-23, P2).
  // 1.0.82: opts.stopAtId (a saved posting id) ends the read as soon as that id's row is seen -- an id match needs no
  // uniqueness proof. A page that adds no new posting id means Craigslist ignored filter_page: complete only if the
  // dashboard's own "of N total" count is already covered, otherwise refused as pagination_stalled. A finished read that
  // holds fewer rows than that total is refused too (incomplete_read).
  async function crRemAllRows(opts) {
    opts = opts || {};
    const stopAtId = opts.stopAtId ? String(opts.stopAtId) : '';
    const here = crRemCurrentPage();
    const hereRows = crRemParseRows(document);
    if (!hereRows) return { ok: false, reason: 'dashboard_table_missing' };
    // The "of N total" count is taken from page 1 of the all-statuses view itself (the frame's own page may be another view).
    let total = null;
    let maxPages = CR_MAX_PAGES;
    const all = [];
    const seen = new Set();
    let pages = 0;
    for (let n = 1; n <= maxPages; n++) {
      let rows, doc;
      if (n === here) { rows = hereRows; doc = document; }
      else {
        if (pages > 0) await sleep((pages % 10 === 0 ? 2500 : 400) + Math.random() * 400);
        try {
          const pg = await crRemFetchPage(n);
          rows = pg.rows; doc = pg.doc;
        } catch (e) {
          return { ok: false, reason: 'page_read_failed:' + ((e && e.message) || 'unknown'), pages: pages };
        }
      }
      if (n === 1) {
        total = crParseTotal((doc && doc.body && (doc.body.innerText || doc.body.textContent)) || '');
        if (total != null) maxPages = Math.max(1, Math.min(CR_MAX_PAGES, Math.ceil(total / CR_PAGE_SIZE) + 2));
      }
      pages++;
      let fresh = 0;
      rows.forEach((r) => { if (!seen.has(r.postingId)) { seen.add(r.postingId); fresh++; all.push(Object.assign({ page: n }, r)); } });
      if (stopAtId && rows.some((r) => r.postingId === stopAtId)) return { ok: true, rows: all, pages: pages, total: total, stoppedAtId: true };
      if (rows.length < CR_PAGE_SIZE) {
        if (total != null && seen.size < total) return { ok: false, reason: 'incomplete_read:' + seen.size + '/' + total, pages: pages };
        return { ok: true, rows: all, pages: pages, total: total };
      }
      if (!fresh) {
        if (total != null && seen.size >= total) return { ok: true, rows: all, pages: pages, total: total };
        return { ok: false, reason: 'pagination_stalled', pages: pages };
      }
      if (total != null && seen.size >= total && n >= Math.ceil(total / CR_PAGE_SIZE)) return { ok: true, rows: all, pages: pages, total: total };
    }
    return { ok: false, reason: 'too_many_pages', pages: pages };
  }

  async function report(type, item, reason) {
    const msg = { type, itemId: item.id, platform: 'CRAIGSLIST' };
    if (reason) msg.reason = reason;
    if (type === 'crossPlatformRemovalDeleted') {
      FTA('ok', 'Craigslist posting deleted and confirmed');
    } else if (type === 'crossPlatformRemovalSkipped') {
      const t = crReasonText(reason);
      FTA('problem', { code: 'cl_removal_skipped_' + reason, title: 'Skipped: ' + t.title, what: 'The Craigslist posting for "' + String(item.title || '').slice(0, 60) + '" was not deleted automatically.', why: t.why, next: t.next, ctx: { reason: reason, frame: FT_FRAME } });
    } else {
      const t = crReasonText(reason);
      FTA('problem', { code: 'cl_removal_failed_' + String(reason || '').split(':')[0], title: t.title, what: 'The Craigslist posting for "' + String(item.title || '').slice(0, 60) + '" could not be removed on this attempt.', why: t.why, next: t.next, ctx: { reason: reason, frame: FT_FRAME } });
    }
    let resp = null;
    try { resp = await chrome.runtime.sendMessage(msg); }
    catch (e) { FTA('warn', 'report_send_failed', 'Could not tell the extension background about the outcome (' + type + '): ' + ((e && e.message) || 'unknown'), { type: type }); return; }
    FTA('info', 'report_sent', 'Reported ' + type + ' to FindA.Sale', { type: type, reason: reason || '', gotResponse: resp != null, ok: resp && resp.ok, status: resp && (resp.status || resp.httpStatus) });
    if (type === 'crossPlatformRemovalDeleted') FTA('end', 'Removed "' + String(item.title || '').slice(0, 40) + '" from Craigslist (confirmed deleted).', { frame: FT_FRAME });
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

  // 2026-09-30 (S-EXT-DUPLICATE-POSTINGS): the backend sets item.deleteAllMatches only when no OTHER live
  // FindA.Sale item shares this title, i.e. every posting carrying it belongs to the item being removed
  // (live: two postings of one deleted item -- $7 and $8 -- were refused as 'ambiguous_duplicate_title'
  // and retried 11 times). In that case delete them one at a time (each deletion verified) until none remain.
  let crRemDupLoop = 0;
  async function crRemMoreDuplicates(item, wanted) {
    if (item.deleteAllMatches !== true || crRemDupLoop >= 6) return false;
    const all = await crRemAllRows();
    if (!all.ok) return false;
    const left = all.rows.filter((r) => r.active && crTitleMatches(r, wanted));
    if (!left.length) return false;
    crRemDupLoop++;
    return true;
  }

  async function runCraigslistRemovalQueue(item) {
    const wanted = fasFoldTitle(item.title);
    FTA('step', 'Opening your Craigslist postings list', 'This item sold on another channel, so its Craigslist posting should come down. The extension needs your logged-in postings table first.', { frame: FT_FRAME });
    overlayInfo('This item sold elsewhere. Looking for the matching Craigslist posting for <b>' + escapeHtml(item.title) + '</b>...');

    // Positive signal: only ever act on the real, logged-in postings dashboard. Wait for it.
    const tableDeadline = Date.now() + 8000;
    while (!document.querySelector('table.accthp_postings') && Date.now() < tableDeadline) await sleep(250);
    if (!document.querySelector('table.accthp_postings')) {
      FTA('warn', 'dashboard_table_missing', 'The postings table never appeared within 8 seconds', { frame: FT_FRAME, snapshot: FT('snapshot') });
      overlayWarn('Could not find your Craigslist postings list on this page. Will try again later.');
      await report('crossPlatformRemovalAttemptFailed', item, 'dashboard_table_missing');
      return;
    }

    // Resume: a delete for this item was already submitted (e.g. the frame reloaded) -- verify only.
    const pending = await getPending();
    if (pending && pending.itemId === item.id && pending.postingId && pending.submittedAt) {
      FTA('step', 'Checking that the delete already sent went through', 'The page reloaded after the delete was submitted, so the extension re-reads your postings instead of deleting again.', { postingId: pending.postingId });
      overlayInfo('Checking that the Craigslist posting for <b>' + escapeHtml(item.title) + '</b> was deleted...');
      const v = await crRemVerifyDeleted(pending.postingId, pending.page);
      await setPending(null);
      if (v.ok && await crRemMoreDuplicates(item, wanted)) { return runCraigslistRemovalQueue(item); }
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
      FTA('warn', 'title_too_short', 'Title is shorter than the safe-match minimum', { len: wanted.length, min: CR_MIN_SAFE_TITLE_LEN });
      overlayWarn('Title too short to match safely. Please delete this Craigslist posting yourself.');
      await report('crossPlatformRemovalSkipped', item, 'title_too_short_for_safe_match');
      return;
    }

    // Find the target: navigate straight to its page when a prior load already located it.
    let target = null;
    if (pending && pending.itemId === item.id && pending.postingId && !pending.submittedAt && pending.page === crRemCurrentPage()) {
      target = { postingId: pending.postingId, page: pending.page, viaId: !!pending.viaId };
    } else {
      // 1.0.19 / 1.0.82: a saved Craigslist posting id (listingRefs; the backend turns a stored posting URL into its id, and a
      // URL is parsed here too) is looked for first, by id only, in every status, and the read stops at the page that holds it.
      const savedId = item.listingRefs && item.listingRefs.CRAIGSLIST ? crPostingIdFromRef(item.listingRefs.CRAIGSLIST) : '';
      FTA('step', savedId ? 'Finding the saved Craigslist posting id in your postings' : 'Reading every page of your Craigslist postings', savedId ? 'FindA.Sale saved this posting\'s id, so the extension reads your postings (50 per page, all statuses) until it reaches that id.' : 'To delete safely the extension must prove exactly one active posting has this exact title, which means reading all pages (50 postings each, all statuses).', { savedId: savedId || undefined });
      const all = await crRemAllRows({ stopAtId: savedId });
      FTA('info', 'postings_read', all.ok ? 'Read ' + all.rows.length + ' postings on ' + all.pages + ' page(s)' + (all.total != null ? ' (dashboard total ' + all.total + ')' : '') + (all.stoppedAtId ? ', stopped at the saved id' : '') : 'Reading postings failed: ' + all.reason, { ok: all.ok, rows: all.ok ? all.rows.length : undefined, pages: all.pages, total: all.ok ? all.total : undefined, reason: all.ok ? undefined : all.reason });
      if (!all.ok) {
        overlayWarn('Could not read all of your Craigslist postings (' + escapeHtml(all.reason) + '). Will try again.');
        await report('crossPlatformRemovalAttemptFailed', item, all.reason);
        return;
      }
      // A row for the saved id that is no longer Active means the posting is already gone. An id that is on no page (the read
      // then covered every page) falls back to the exact-title rule below.
      const idRows = savedId ? all.rows.filter((r) => r.postingId === savedId) : [];
      let matches = idRows.filter((r) => r.active);
      let goneRows = idRows.filter((r) => !r.active);
      if (!idRows.length) {
        matches = all.rows.filter((r) => r.active && crTitleMatches(r, wanted));
        goneRows = matches.length ? [] : all.rows.filter((r) => !r.active && crTitleMatches(r, wanted));
      }
      const ids = Array.from(new Set(matches.map((r) => r.postingId)));
      if (!ids.length && goneRows.length) FTA('info', 'already_deleted', 'The posting for this item is already deleted or expired on Craigslist (' + goneRows.slice(0, 5).map((r) => r.postingId).join(', ') + '); nothing to delete', { ids: goneRows.slice(0, 5).map((r) => r.postingId), viaSavedId: !!idRows.length });
      FTA('info', 'match_result', 'Found ' + ids.length + ' active posting(s) with this exact title', { matches: ids.length, deleteAllMatches: item.deleteAllMatches === true });
      if (ids.length !== 1 && !(ids.length > 1 && item.deleteAllMatches === true)) {
        // 2026-09-30 (S-EXT-RESYNC): crRemAllRows() read EVERY page of the postings dashboard (all.ok),
        // so zero active matches is a real "already gone" -- report it as listing_not_found like
        // Poshmark/Mercari do, so the backend can resolve it instead of retrying forever.
        const reason = ids.length ? 'ambiguous_duplicate_title' : 'listing_not_found';
        overlayWarn((goneRows.length && !ids.length ? 'This Craigslist posting is already deleted or expired. ' : '') + 'Could not find exactly one active Craigslist posting titled "' + escapeHtml(item.title) + '" (' + reason + '). Please check it yourself.');
        await setPending(null);
        await report('crossPlatformRemovalSkipped', item, reason);
        return;
      }
      target = { postingId: ids[0], page: matches[0].page, viaId: !!idRows.length };
      if (target.page !== crRemCurrentPage()) {
        FTA('step', 'Going to the page that holds the posting', 'The matching posting is on page ' + target.page + ' of your list; the delete button must be used from that page.', { page: target.page });
        await setPending({ itemId: item.id, postingId: target.postingId, page: target.page, viaId: target.viaId });
        location.href = crRemPageUrl(target.page);
        return;
      }
    }

    // Re-validate the row in the live DOM right before acting.
    FTA('step', 'Double-checking the posting before deleting', 'Title and active status are re-checked on the live page right before the delete button is used.', { page: target.page });
    const rows = crRemParseRows(document) || [];
    const row = rows.find((r) => r.postingId === target.postingId);
    // An id-matched posting may have been retitled on Craigslist; the id itself is the identity there (same standard as
    // Poshmark/Mercari/Vinted/Grailed). A title-matched posting must still match the title.
    if (!row || !row.active || !(target.viaId || crTitleMatches(row, wanted))) {
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
    FTA('step', 'Deleting the Craigslist posting', 'Pressing that one posting\'s own delete button; Craigslist then sends the delete in the background.', { page: target.page });
    overlayInfo('Deleting the Craigslist posting for <b>' + escapeHtml(item.title) + '</b>...');
    submit[0].click(); // Craigslist intercepts this and sends one XHR delete (live-confirmed 2026-09-23)

    FTA('step', 'Confirming the delete with a fresh read', 'Craigslist\'s page shows "deleted" before the server confirms, so the extension re-reads your postings (up to about 20 seconds) and only trusts that.');
    const v = await crRemVerifyDeleted(target.postingId, target.page);
    await setPending(null);
    if (v.ok && await crRemMoreDuplicates(item, wanted)) { return runCraigslistRemovalQueue(item); }
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
    try { queued = await chrome.runtime.sendMessage({ type: 'getRemovalQueueItemFor', platform: 'CRAIGSLIST' }); } catch (e) { FT('info', 'removal_queue_fetch_failed', 'Could not ask the extension for the removal queue: ' + ((e && e.message) || 'unknown'), { frame: FT_FRAME }); return false; }
    if (!queued || !queued.ok || !queued.item) return false;
    ftActive = true;
    FT('begin', { platform: 'CRAIGSLIST', flow: 'remove', item: { id: queued.item.id, title: queued.item.title }, ctx: { frame: FT_FRAME } });
    try {
      await runCraigslistRemovalQueue(queued.item);
    } catch (e) {
      FTA('error', 'removal_exception', 'Unexpected error during removal: ' + ((e && e.message) || 'unknown'), { frame: FT_FRAME });
      overlayWarn('Something went wrong removing this Craigslist posting (' + escapeHtml((e && e.message) || 'unknown error') + '). Will try again.');
      await report('crossPlatformRemovalAttemptFailed', queued.item, 'exception:' + ((e && e.message) || 'unknown'));
    }
    return true;
  }

  // ---- Native "Renew All" (ADDED 2026-09-27, Patrick-approved switch from full-repost) ----
  // Replaces the old delete-and-repost Craigslist renewal path (background.js's former clQueue).
  // ADR-100 S11's original blocker for native Craigslist renewal ("the account page's
  // manage-postings links resisted a plain DOM query when checked live") is root-caused here: the
  // postings table lives inside a cross-origin iframe (accounts.craigslist.org/login/home) that a
  // content script on the top-level www.craigslist.org/account page cannot reach via
  // document.querySelector or contentDocument -- it was never a wrong selector, it was the wrong
  // frame. This file already runs INSIDE that iframe (manifest: this exact path, all_frames), so
  // it has direct access.
  //
  // LIVE-VERIFIED 2026-09-27 against Patrick's real, logged-in account (artifactmi@gmail.com, 261
  // real postings), via Claude in Chrome against Patrick's own shared tab, navigated directly to
  // this iframe's own URL (https://accounts.craigslist.org/login/home) so it could be queried as a
  // top-level document:
  //   - The control is `<form id="accountRenewAllForm" class="account-renew-all-form
  //     has-renewables"><button class="account-renew-all-btn"><span
  //     class="account-renew-button-text">renew all postings</span></button></form>`. The
  //     `has-renewables` class was present with a real, large, mixed-age posting set -- its
  //     absence (nothing eligible) was not observed live, so this deliberately does NOT hard-gate
  //     on that class (see below) rather than risk skipping a legitimate renew based on an
  //     unconfirmed assumption.
  //   - Clicking the button (a real, direct .click(), not a guess) swapped the button's icon to a
  //     spinner and its text to "renewing, please wait..." -- confirmed proof a real async
  //     bulk-renew request fires, not a dead/decorative control.
  //   - The FULL completion signal (text/icon reverting away from "please wait...") was NOT
  //     confirmed within the live verification window (session tooling stopped further automated
  //     interaction with this real, in-flight transaction after the click, by design -- this is a
  //     real action against Patrick's live account, not a sandboxed test). runCraigslistRenewAll()
  //     below polls for that reversion with a generous timeout and reports failure/UNVERIFIED
  //     rather than assuming success if it never resolves, consistent with this file's existing
  //     delete-verification discipline (crRemVerifyDeleted above).
  //   - Craigslist's Renew All has no per-item response or targeting -- it is a single bulk action
  //     covering every one of the organizer's eligible postings, unlike Facebook's per-item native
  //     renew. background.js accounts for this: it triggers this once whenever ANY Craigslist item
  //     is due (not queued per item), and on a confirmed success marks EVERY item FindA.Sale
  //     currently believes is listed+active on Craigslist as renewed, not just the ones that were
  //     technically due -- because Craigslist itself doesn't distinguish, so FindA.Sale can't either.
  const CR_RENEWALL_WAIT_TEXT_RE = /renewing|please wait/i;
  // 1.0.82 (2026-10-29): the wait scales with the number of postings (live: ~164 due, still "renewing, please wait" at 45 s).
  // 45 s + 1.5 s per posting, at most 6 minutes (background treats a removal/renew tab older than 10 minutes as dead).
  const CR_RENEWALL_MIN_WAIT_MS = 45000;
  const CR_RENEWALL_PER_POSTING_MS = 1500;
  const CR_RENEWALL_MAX_WAIT_MS = 6 * 60 * 1000;
  function crRenewAllWaitMs(count) {
    const n = Number(count) > 0 ? Number(count) : 100;
    return Math.max(CR_RENEWALL_MIN_WAIT_MS, Math.min(CR_RENEWALL_MAX_WAIT_MS, CR_RENEWALL_MIN_WAIT_MS + n * CR_RENEWALL_PER_POSTING_MS));
  }
  // Per-posting "renew" controls in the postings table (live diag 2026-10-29: rows show display/delete/edit/renew controls,
  // renew only on rows that can be renewed now). The Renew All button sits outside the table and is never counted.
  function crRowRenewables(rows) {
    let n = 0;
    (rows || []).forEach((r) => {
      const ctl = Array.from(r.tr.querySelectorAll('input[type="submit"], button')).filter((b) => fasFoldTitle(b.value || b.textContent) === 'renew');
      if (ctl.length) n++;
    });
    return n;
  }
  // Fresh read of every page: how many postings still offer "renew". null when any page could not be read.
  async function crCountRenewables() {
    let count = 0, rows = 0, total = null;
    const seen = new Set();
    for (let n = 1; n <= CR_MAX_PAGES; n++) {
      if (n > 1) await sleep(400 + Math.random() * 400);
      let page;
      try { page = await crRemFetchPage(n); } catch (e) { return null; }
      if (n === 1) total = crParseTotal((page.doc.body && (page.doc.body.innerText || page.doc.body.textContent)) || '');
      const fresh = page.rows.filter((r) => !seen.has(r.postingId));
      fresh.forEach((r) => seen.add(r.postingId));
      count += crRowRenewables(fresh);
      rows += fresh.length;
      if (page.rows.length < CR_PAGE_SIZE || !fresh.length) break;
      if (total != null && seen.size >= total) break;
    }
    return { renewable: count, rows: rows, total: total };
  }
  // Decides the outcome from what was seen. Success needs either the button returning to normal (live-observed completion
  // signal) without the same renew buttons still showing, or -- when the button never returned -- a fresh read showing that
  // every posting that offered "renew" before the click no longer does.
  function crRenewAllVerdict(o) {
    const before = o.before, after = o.after;
    const known = before && after && before.renewable > 0;
    if (o.reverted) {
      if (known && after.renewable >= before.renewable) return { ok: false, reason: 'renew_all_finished_still_renewable:' + before.renewable + '/' + after.renewable };
      return { ok: true, verified: known ? 'renew_buttons_cleared' : 'button_returned' };
    }
    if (known && after.renewable === 0) return { ok: true, verified: 'renew_buttons_cleared' };
    if (o.formGone) return { ok: false, reason: 'renew_all_form_disappeared_unverified' };
    if (known && after.renewable < before.renewable) return { ok: false, reason: 'renew_all_timed_out_partial:' + before.renewable + '/' + after.renewable };
    return { ok: false, reason: 'renew_all_timed_out_unverified' };
  }

  function crRenewAllControl() {
    const form = document.getElementById('accountRenewAllForm');
    const btn = form ? form.querySelector('.account-renew-all-btn') : null;
    return btn && !btn.disabled ? { form, btn } : null;
  }

  // ADDED 2026-10-10: form presence regardless of the button's disabled state (a disabled button
  // during "renewing, please wait" is IN PROGRESS, not finished).
  function crRenewAllFormPresent() {
    return !!document.getElementById('accountRenewAllForm');
  }

  // Resumed after a reload that followed our click (background granted the click once and will
  // never grant it again). Do NOT click. Wait briefly for the dashboard, then close out honestly.
  async function runCraigslistRenewAllResumed() {
    const deadline = Date.now() + 8000;
    while (!crRenewAllFormPresent() && Date.now() < deadline) await sleep(250);
    console.log('[FAS Craigslist Renew All] resumed after reload; NOT clicking again. dashboard present=' + crRenewAllFormPresent());
    FTA('warn', 'renew_all_resumed', 'Page reloaded after Renew All was clicked; not clicking again', { dashboardPresent: crRenewAllFormPresent(), frame: FT_FRAME });
    overlayWarn('Craigslist reloaded after "renew all postings" was clicked, so the result could not be verified. Check your postings manually.');
    return { ok: false, reason: 'reloaded_after_click_unverified' };
  }

  async function runCraigslistRenewAll() {
    // Positive signal, same discipline as runCraigslistRemovalQueue above: wait for the real,
    // logged-in postings dashboard rather than acting on whatever's on screen at load time.
    FTA('step', 'Looking for the "renew all postings" button', 'Craigslist renews every eligible posting with one bulk button on your account dashboard.', { frame: FT_FRAME });
    const deadline = Date.now() + 8000;
    let control = crRenewAllControl();
    while (!control && Date.now() < deadline) { await sleep(250); control = crRenewAllControl(); }
    if (!control) {
      // Not necessarily a failure -- a form without has-renewables (nothing currently eligible)
      // may render differently than what was live-verified (see comment above). Distinguish "the
      // control never existed at all" (report so a real regression is visible) from a page that
      // simply hasn't finished loading (already handled by the wait above).
      return { ok: false, reason: 'renew_all_control_not_found' };
    }
    // Baseline for verification and for the wait: how many postings offer "renew" right now (all pages, all statuses).
    FTA('step', 'Counting postings that can be renewed', 'This sets how long to wait for Craigslist and lets the result be checked afterwards by re-reading your postings.');
    const before = await crCountRenewables();
    const pageTotal = crParseTotal((document.body && (document.body.innerText || document.body.textContent)) || '');
    const waitMs = crRenewAllWaitMs((before && before.renewable) || pageTotal || (before && before.rows));
    FTA('info', 'renew_baseline', before ? before.renewable + ' posting(s) offer renew out of ' + before.rows + ' read' : 'Could not count renewable postings before the click', { renewable: before ? before.renewable : undefined, rows: before ? before.rows : undefined, total: pageTotal, waitSeconds: Math.round(waitMs / 1000) });
    control = crRenewAllControl();   // re-find: the count above only fetched pages, but never act on a stale node
    if (!control) return { ok: false, reason: 'renew_all_control_not_found' };
    FTA('step', 'Clicking "renew all postings"', 'Renewing keeps your Craigslist postings from expiring. Craigslist does this for all eligible postings at once, not per item.');
    overlayInfo('Renewing all eligible Craigslist postings...');
    // The background already consumed the one-shot request when it granted this run, so even if
    // this click reloads the page, the next load is told "resumed" and will not click again.
    console.log('[FAS Craigslist Renew All] clicking Renew All (one-shot granted by background)');
    control.btn.click(); // live-confirmed 2026-09-27: triggers Craigslist's own async bulk-renew request

    const completionDeadline = Date.now() + waitMs;
    const FORM_GONE_GRACE_MS = 10000;
    let formGoneSince = 0;
    let reverted = false, formGone = false;
    FTA('step', 'Waiting for Craigslist to finish renewing', 'The button says "renewing, please wait" while it works; with ' + ((before && before.renewable) || pageTotal || 'your') + ' postings the extension waits up to ' + Math.round(waitMs / 1000) + ' seconds for it to return to normal, and never clicks it twice.');
    await sleep(1500); // let the "please wait" state actually appear before polling for its exit
    while (Date.now() < completionDeadline) {
      if (!crRenewAllFormPresent()) {
        // Form momentarily absent (re-render / navigation in flight): keep waiting, only give up
        // if it stays gone. Never report success from absence alone.
        if (!formGoneSince) formGoneSince = Date.now();
        if (Date.now() - formGoneSince >= FORM_GONE_GRACE_MS) { formGone = true; break; }
      } else {
        formGoneSince = 0;
        const still = crRenewAllControl(); // null while the button is disabled => still in progress
        if (still && still.btn) {
          const text = still.btn.textContent || '';
          if (!CR_RENEWALL_WAIT_TEXT_RE.test(text)) { reverted = true; break; }
        }
      }
      await sleep(2000);
    }
    // Verify with a fresh read of every page (never another click).
    FTA('step', 'Checking the result by re-reading your postings', 'A posting that was renewed no longer offers "renew", so the extension counts those buttons again.');
    await sleep(2000);
    const after = await crCountRenewables();
    const verdict = crRenewAllVerdict({ reverted: reverted, formGone: formGone, before: before, after: after });
    FTA('info', 'renew_verify', 'Renew buttons before/after: ' + (before ? before.renewable : '?') + '/' + (after ? after.renewable : '?') + (reverted ? ' (button returned to normal)' : ' (button still busy or gone)'), { before: before ? before.renewable : undefined, after: after ? after.renewable : undefined, reverted: reverted, formGone: formGone, ok: verdict.ok, verified: verdict.verified, reason: verdict.reason });
    if (verdict.ok) overlayInfo('Renewed your eligible Craigslist postings.');
    else overlayWarn('Clicked "renew all postings" once but could not confirm every posting renewed (' + escapeHtml(verdict.reason) + '). Check your Craigslist postings manually.');
    return verdict;
  }

  async function maybeRunCraigslistRenewAll() {
    let requested;
    try { requested = await chrome.runtime.sendMessage({ type: 'getCraigslistRenewAllRequested' }); } catch (e) { FT('info', 'renew_request_check_failed', 'Could not ask the extension whether a renewal was requested: ' + ((e && e.message) || 'unknown'), { frame: FT_FRAME }); return false; }
    if (!requested || !requested.ok) return false;
    if (!requested.requested && !requested.resumed) return false;
    ftActive = true;
    FT('begin', { platform: 'CRAIGSLIST', flow: 'renew', item: { id: 'all', title: 'All eligible Craigslist postings' }, ctx: { frame: FT_FRAME, resumed: !!requested.resumed } });
    let result;
    try {
      result = requested.resumed ? await runCraigslistRenewAllResumed() : await runCraigslistRenewAll();
    } catch (e) {
      result = { ok: false, reason: 'exception:' + ((e && e.message) || 'unknown') };
    }
    if (result.ok) {
      FT('ok', 'Craigslist renewed your eligible postings');
    } else {
      const t = crReasonText(result.reason);
      FT('problem', { code: 'cl_renew_all_' + String(result.reason || '').split(':')[0], title: t.title, what: 'FindA.Sale tried to renew your Craigslist postings with the "renew all postings" button.', why: t.why, next: t.next, ctx: { reason: result.reason, frame: FT_FRAME } });
    }
    let finResp = null;
    try { finResp = await chrome.runtime.sendMessage(Object.assign({ type: 'craigslistRenewAllFinished' }, result)); }
    catch (e) { FT('warn', 'renew_finish_report_failed', 'Could not tell the extension background how Renew All ended: ' + ((e && e.message) || 'unknown')); }
    FT('info', 'renew_finish_reported', 'Reported the Renew All result to FindA.Sale', { ok: result.ok, reason: result.reason || '', gotResponse: finResp != null, respOk: finResp && finResp.ok, status: finResp && (finResp.status || finResp.httpStatus) });
    if (result.ok) FT('end', 'Craigslist Renew All finished.'); 
    return true;
  }


  // ---- Guarded reconcile scan (1.0.19) ----------------------------------------------------------------------------------------------
  // Reads EVERY dashboard page (all statuses) and reports the rows to background.js, which decides (twice-absent rule, account check, cap) and
  // clears the "listed on Craigslist" flag. This function never changes anything on Craigslist. Anything short of a complete read is reported as
  // incomplete, which can only ever mean "do nothing".
  async function runCraigslistReconcileScan() {
    const text = (document.body && document.body.innerText) || '';
    const out = { type: 'craigslistReconcileScan', loggedIn: !!document.querySelector('table.accthp_postings') && !document.querySelector('input[type="password"]'), accountText: text.slice(0, 4000), complete: false, total: null, rows: [] };
    if (!out.loggedIn) { out.reason = 'no_postings_table'; return out; }
    const m = /\bof\s+([\d,]+)\s+total\b/i.exec(text);
    out.total = m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
    const rowsOf = (doc) => Array.from(doc.querySelectorAll('table.accthp_postings tr.posting-row')).map((tr) => {
      const st = tr.querySelector('td.status[data-postingid]'); const a = tr.querySelector('td.title a');
      const cls = st ? st.classList : null;
      const status = cls ? (['active', 'deleted', 'expired', 'pending', 'removed', 'flagged'].find((k) => cls.contains(k)) || ((/\b(active|deleted|expired|pending|removed|flagged)\b/i.exec(st.textContent || '') || [])[1] || '').toLowerCase()) : '';
      return { postingId: st ? String(st.getAttribute('data-postingid') || '') : '', status, titleRaw: a ? (a.textContent || '').replace(/\s+/g, ' ').trim() : '' };
    }).filter((r) => /^\d{6,}$/.test(r.postingId));
    const seen = new Set(); let lastLen = 0;
    for (let n = 1; n <= CR_MAX_PAGES; n++) {
      let rows;
      try {
        const res = await fetch(crRemPageUrl(n) + '&filter_active=all', { credentials: 'include', cache: 'no-store' });
        if (!res.ok) { out.reason = 'page_' + n + '_http_' + res.status; return out; }
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        if (!doc.querySelector('table.accthp_postings')) { out.reason = 'page_' + n + '_no_table'; return out; }
        rows = rowsOf(doc);
      } catch (e) { out.reason = 'page_' + n + '_error'; return out; }
      rows.forEach((r) => { if (!seen.has(r.postingId)) { seen.add(r.postingId); out.rows.push(r); } });
      lastLen = rows.length;
      if (rows.length < CR_PAGE_SIZE) { out.complete = true; break; }
      await sleep(400 + Math.random() * 400);
    }
    if (!out.complete) out.reason = lastLen >= CR_PAGE_SIZE ? 'too_many_pages' : 'unknown';
    return out;
  }
  async function maybeRunCraigslistReconcile() {
    let req;
    try { req = await chrome.runtime.sendMessage({ type: 'getCraigslistReconcileRequest' }); } catch (e) { return false; }
    if (!req || !req.ok || !req.requested) return false;
    ftActive = true;
    FT('begin', { platform: 'CRAIGSLIST', flow: 'reconcile', item: { id: 'all', title: 'Craigslist postings check' }, ctx: { frame: FT_FRAME } });
    let scan;
    try { scan = await runCraigslistReconcileScan(); }
    catch (e) { scan = { type: 'craigslistReconcileScan', loggedIn: false, complete: false, rows: [], reason: 'exception:' + ((e && e.message) || 'unknown') }; }
    FTA('info', 'reconcile_scan_read', 'Read ' + scan.rows.length + ' postings (' + (scan.total == null ? 'total not shown' : scan.total + ' expected') + ', ' + (scan.complete ? 'complete' : 'incomplete') + ')', { reason: scan.reason || '' });
    try { await chrome.runtime.sendMessage(scan); } catch (e) { FTA('warn', 'reconcile_report_failed', 'Could not hand the postings list to the extension: ' + ((e && e.message) || 'unknown')); }
    FT('end', 'Craigslist postings check finished.');
    return true;
  }

  // Page-scoping is the manifest match (accounts.craigslist.org/login/home*, all_frames) plus the
  // dedicated-removal-tab check inside background.js's getRemovalQueueItemFor /
  // getCraigslistRenewAllRequested handlers. Removal takes priority (a sold item's posting should
  // come down before anything gets renewed); renew-all is only attempted when no removal item was
  // queued this load, so the two flows never race for the same tab or the same click.
  (async () => {
    const didRemoval = await maybeRunCraigslistRemoval();
    if (!didRemoval) { const didRenew = await maybeRunCraigslistRenewAll(); if (!didRenew) await maybeRunCraigslistReconcile(); }
  })();
})();
