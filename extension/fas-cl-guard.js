// fas-cl-guard.js -- Craigslist single-flight lock decision, posting-identity check and posting-confirmation detection (extension 1.0.18); 1.0.19 adds the dashboard lookup order and the guarded reconcile.
//
// Why this exists (production auto-diagnostics 2026-10-17, extension 1.0.17): Craigslist keeps ONE posting-flow state per browser session,
// but the post flow, the price-edit flow and the removal/renew flow each opened their own tab and ran at the same time, so they adopted each
// other's pages (a post run was found stuck on the page of a different item that an edit run was finishing). This file holds the pure
// decision logic so it can be unit tested in Node and shared by background.js (importScripts), the edit engine (executeScript) and
// fas-craigslist.js (content script). No chrome.* calls in here.
(function (root) {
  'use strict';

  var LOCK_TTL_MS = 20 * 60 * 1000;   // a flow that has not shown a heartbeat for this long cannot hold the lock (crashed worker, frozen tab)
  var CLAIM_MS = 60 * 1000;           // a claim bridges the gap between "decided to start" and "own run record written"

  // ---- single-flight lock -------------------------------------------------------------------------------------------------
  // s = {
  //   post:    { queueRemaining: bool, tabAlive: bool, beatAt: ms, paused: bool }   posting queue (setCraigslistQueue)
  //   edit:    { platform: 'CRAIGSLIST'|..., startedAt: ms, tabAlive: bool }       fasEditRun record (any platform's edit run is recorded there)
  //   removal: { inProgress: bool }                                                 dedicated removal / Renew All tab
  //   claim:   { kind, at }                                                         last claim written by tryClaim
  // }
  // kind: 'post' | 'edit' | 'removal'. Returns { ok:true } or { ok:false, heldBy, reason }.
  // A kind never blocks itself: a new post queue replaces the old one (existing behaviour); edit runs are serialised by fasEditPumping;
  // removal runs by silentCrossPlatformRemovalInProgress.
  function decideLock(kind, s, now) {
    s = s || {};
    now = now || Date.now();
    var p = s.post, e = s.edit, r = s.removal, c = s.claim;
    if (kind !== 'post' && p && p.queueRemaining && p.tabAlive && (p.paused || (now - (p.beatAt || 0)) < LOCK_TTL_MS)) {
      return { ok: false, heldBy: 'post', reason: p.paused ? 'a Craigslist posting run is paused for a cooldown' : 'a Craigslist posting run is active' };
    }
    if (kind !== 'edit' && e && e.platform === 'CRAIGSLIST' && e.tabAlive && (now - (e.startedAt || 0)) < LOCK_TTL_MS) {
      return { ok: false, heldBy: 'edit', reason: 'a Craigslist price edit is running' };
    }
    if (kind !== 'removal' && r && r.inProgress) {
      return { ok: false, heldBy: 'removal', reason: 'a Craigslist removal or renew run is open' };
    }
    if (c && c.kind && c.kind !== kind && (now - (c.at || 0)) < CLAIM_MS) {
      return { ok: false, heldBy: c.kind, reason: 'another Craigslist flow is starting' };
    }
    return { ok: true };
  }

  // Which tab may be handed the Craigslist POSTING queue item. The content script runs on EVERY post.craigslist.org tab, including the
  // edit flow's own tab (its /k/<token> pages), so without this the post flow adopts the edit flow's pages.
  //   queueTabId   id recorded when the post queue opened its tab (null while it is still being created)
  //   queueTabAlive whether that tab still exists
  //   senderTabId  tab asking for the item
  //   otherFlowTabIds tabs owned by the edit run / removal run (never adoptable)
  // -> 'serve' | 'adopt' | 'refuse'
  function queueTabVerdict(queueTabId, queueTabAlive, senderTabId, otherFlowTabIds) {
    if (senderTabId == null) return 'refuse';
    var others = (otherFlowTabIds || []).filter(function (x) { return x != null; });
    if (others.indexOf(senderTabId) !== -1) return 'refuse';
    if (queueTabId != null && queueTabId === senderTabId) return 'serve';
    if (queueTabId != null && queueTabAlive) return 'refuse';
    // queue tab id unknown/dead. Unknown means the tab is still being created (fail closed); dead means the organizer reopened the
    // marketplace by hand ("reopen that tab" in the popup), which is the one case where another tab is adopted.
    if (queueTabId == null) return 'refuse';
    return 'adopt';
  }

  // ---- posting identity ---------------------------------------------------------------------------------------------------
  function fold(s) {
    var t = String(s == null ? '' : s);
    try { t = t.normalize('NFKC'); } catch (e) { /* old engine */ }
    return t.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
      .replace(/ /g, ' ').replace(/…/g, '...').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  // Drops a trailing "- $price", "$price", "(location)" and a trailing ellipsis from a Craigslist title.
  function cleanTitle(s) {
    var t = fold(s);
    t = t.replace(/\s*-?\s*\$\s?\d[\d,]*(?:\.\d{1,2})?\s*$/, '').trim();
    t = t.replace(/\s*\.{3,}\s*$/, '').trim();
    return t;
  }
  // pageTitle: what the Craigslist page shows as the posting title ('' when unreadable).
  // expected: string or array of strings (the FindA.Sale title, and the title the dashboard row showed).
  // -> 'match' | 'mismatch' | 'unknown'.  Unknown (no readable title) never aborts a flow; only a positive mismatch does.
  // Craigslist cuts titles around 70 characters, so a prefix relationship (shorter side at least 20 characters) counts as the same posting.
  function titlesCompatible(pageTitle, expected) {
    var p = cleanTitle(pageTitle);
    var exps = (Array.isArray(expected) ? expected : [expected]).map(cleanTitle).filter(Boolean);
    if (!p || !exps.length) return 'unknown';
    for (var i = 0; i < exps.length; i++) {
      var e = exps[i];
      if (p === e) return 'match';
      var shorter = p.length <= e.length ? p : e, longer = p.length <= e.length ? e : p;
      if (shorter.length >= 20 && longer.indexOf(shorter) === 0) return 'match';
    }
    return 'mismatch';
  }
  // Reads the posting title from a Craigslist posting-flow page (edit form input, preview heading, confirmation heading). '' when none.
  function pagePostingTitle(doc) {
    try {
      doc = doc || root.document;
      var input = doc.querySelector('#PostingTitle, input[name="PostingTitle"]');
      if (input && input.value && String(input.value).trim()) return String(input.value).trim();
      var sels = ['#titletextonly', '.postingtitletext #titletextonly', 'span.postingtitletext', '.postingtitle', 'h2.postingtitle', '#postingTitle'];
      for (var i = 0; i < sels.length; i++) {
        var el = doc.querySelector(sels[i]);
        var tx = el && (el.innerText || el.textContent);
        if (tx && String(tx).trim()) return String(tx).trim();
      }
    } catch (e) { /* unreadable */ }
    return '';
  }

  // ---- posting confirmation ("Thanks for posting!", "Manage your post") ---------------------------------------------------
  // Craigslist's terminal page after a publish (new post OR the end of an edit). Signals mirror fas-craigslist.js isCraigslistPostedConfirmation
  // but deliberately stricter (no bare "post another" / "edit your post", which also appear on preview pages).
  function isPostingConfirmation(bodyText, docTitle) {
    var t = fold(bodyText).slice(0, 4000), d = fold(docTitle);
    if (d.indexOf('posting confirmation') !== -1) return true;
    return ['thanks for posting', 'thank you for posting', 'manage your post', 'your posting is now live', 'successfully posted', 'has been posted', 'posting published']
      .some(function (s) { return t.indexOf(s) !== -1; });
  }

  // ---- edit outcome after Craigslist reached its confirmation page ------------------------------------------------------
  // priceSet: this run typed the target price into the form earlier.  shown: price read back from the live listing (null = unreadable).
  // match: whether shown equals the target.  -> 'verified' | 'confirmed_without_price' | 'verify_mismatch' | 'unverified'
  function editOutcome(priceSet, shown, match) {
    if (shown == null) return 'unverified';
    if (match) return 'verified';
    return priceSet ? 'verify_mismatch' : 'confirmed_without_price';
  }

  // ---- dashboard lookup (1.0.19) ------------------------------------------------------------------------------------------
  // Order: (1) saved posting id, id only; (2) one distinctive word searched with the dashboard's own terms box, exact title + Active;
  // (3) full page scan. "Not found" is only ever concluded after (3). Deleted / Expired rows that match mean the posting is gone.
  var STOPWORDS = {};
  ('this that with from your have been will were what when where which while about above after again also and any are because before below between both but can could did does doing down during each few for further had has her here hers him his how into its just more most nor not now off once only other our out over own same she should some such than the their them then there these they those through too under until very was who whom why would you with set lot new used vintage nice great good like item items sale free ship shipping pick pickup size piece pieces made brand inch inches')
    .split(/\s+/).forEach(function (w) { STOPWORDS[w] = 1; });
  // Longest/most distinctive word of a title to put in the dashboard search box. Skips stopwords and words under 4 characters;
  // prefers tokens that mix letters and digits (model numbers, "1990s") and brand-like capitalisation (BAYC, iPhone), then length.
  // '' when nothing usable (the caller then scans the pages).
  function pickSearchWord(title) {
    var raw = String(title == null ? '' : title);
    try { raw = raw.normalize('NFKC'); } catch (e) { /* old engine */ }
    var toks = raw.match(/[A-Za-z0-9][A-Za-z0-9'&]*/g) || [];
    var best = '', bestScore = -1;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i].replace(/['&]+$/, '').replace(/'s$/i, '');
      var low = t.toLowerCase();
      if (low.length < 4 || STOPWORDS[low] || /^\d+$/.test(low) || /[&']/.test(low)) continue;
      var score = low.length;
      if (/\d/.test(low) && /[a-z]/.test(low)) score += 1000;
      else if (/[A-Z]{3,}/.test(t) || /[a-z][A-Z]/.test(t)) score += 500;
      if (score > bestScore) { bestScore = score; best = t; }
    }
    return best;
  }
  function parseTotal(text) {
    var m = /\bof\s+([\d,]+)\s+total\b/i.exec(String(text || ''));
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
  }
  // status word of a td.status cell: 'active' | 'deleted' | 'expired' | other word | ''.
  function rowStatus(el) {
    if (!el) return '';
    var cls = el.classList;
    var known = ['active', 'deleted', 'expired', 'pending', 'removed', 'flagged'];
    for (var i = 0; i < known.length; i++) if (cls && cls.contains(known[i])) return known[i];
    var m = /\b(active|deleted|expired|pending|removed|flagged)\b/i.exec(String(el.textContent || ''));
    return m ? m[1].toLowerCase() : '';
  }
  // Rows of an account-dashboard document (live DOM or a fetched/parsed page). null when there is no postings table.
  function parseDashboardRows(doc) {
    var table = doc && doc.querySelector ? doc.querySelector('table.accthp_postings') : null;
    if (!table) return null;
    return Array.prototype.slice.call(table.querySelectorAll('tr.posting-row')).map(function (tr) {
      var st = tr.querySelector('td.status[data-postingid]');
      var a = tr.querySelector('td.title a');
      var status = rowStatus(st);
      return { tr: tr, postingId: st ? String(st.getAttribute('data-postingid') || '') : '', status: status, active: status === 'active', deleted: status === 'deleted', expired: status === 'expired', titleRaw: a ? a.textContent : '' };
    }).filter(function (r) { return /^\d{6,}$/.test(r.postingId); });
  }
  function isNoPostings(text) { return /\bno postings\b/i.test(String(text || '').slice(0, 6000)); }
  // rows: dashboard rows (any status). opts: { remoteId, title, matcher(rowTitleRaw, wantedTitle) -> bool }.
  // -> { kind:'found', row } | { kind:'ambiguous', ids:[...] } | { kind:'gone', status, ids } | { kind:'none' }
  // A saved id is matched by id only. Otherwise only an Active row can be 'found'; two Active matches are ambiguous (never edit);
  // a matching Deleted/Expired row with no Active match means the posting is gone.
  function classifyLookup(rows, opts) {
    rows = rows || []; opts = opts || {};
    var hits;
    if (opts.remoteId) hits = rows.filter(function (r) { return r.postingId === String(opts.remoteId); });
    else { var m = opts.matcher || function (a, b) { return titlesCompatible(a, b) === 'match'; }; hits = rows.filter(function (r) { return m(r.titleRaw, opts.title); }); }
    if (!hits.length) return { kind: 'none' };
    var act = hits.filter(function (r) { return r.status === 'active'; });
    if (act.length === 1) return { kind: 'found', row: act[0] };
    if (act.length > 1) return { kind: 'ambiguous', ids: act.map(function (r) { return r.postingId; }) };
    return { kind: 'gone', status: hits[0].status || 'deleted', ids: hits.map(function (r) { return r.postingId; }) };
  }

  // ---- guarded reconcile (1.0.19) -----------------------------------------------------------------------------------------
  // Items FindA.Sale believes are listed on a marketplace but whose posting is absent from the account in EVERY status. Pure decision:
  // input = { platform, scan:{ complete, loggedIn, accountOk, total, rows:[{postingId,status,titleRaw}] }, items:[{id,title,remoteId}],
  //           state:{ [itemId]:{ firstAt, lastAt, count } }, now, minGapMs, cap }
  // -> { ok, skip, toReport:[{id,title}], state, absent:[ids], present:[ids], capped }
  var RECON_MIN_GAP_MS = 4 * 60 * 1000, RECON_CAP = 20;
  function reconcileDecide(inp) {
    inp = inp || {};
    var state = JSON.parse(JSON.stringify(inp.state || {}));
    var now = inp.now || Date.now(), gap = inp.minGapMs != null ? inp.minGapMs : RECON_MIN_GAP_MS, cap = inp.cap != null ? inp.cap : RECON_CAP;
    var sc = inp.scan || {}, rows = Array.isArray(sc.rows) ? sc.rows : [];
    var skip = null;
    if (!sc.loggedIn) skip = 'not_logged_in';
    else if (!sc.accountOk) skip = 'account_not_confirmed';
    else if (!sc.complete) skip = 'scan_incomplete';
    else if (sc.total == null || rows.length !== sc.total) skip = 'row_count_mismatch';
    if (skip) return { ok: false, skip: skip, toReport: [], state: state, absent: [], present: [], capped: false };
    var items = inp.items || [], ids = {}, absent = [], present = [], toReport = [], capped = false;
    items.forEach(function (it) {
      ids[it.id] = 1;
      var isThere = rows.some(function (r) {
        if (it.remoteId && String(r.postingId) === String(it.remoteId)) return true;
        return titlesCompatible(r.titleRaw, it.title) === 'match';
      });
      if (isThere) { present.push(it.id); delete state[it.id]; return; }
      absent.push(it.id);
      var s = state[it.id];
      if (!s) state[it.id] = { firstAt: now, lastAt: now, count: 1 };
      else if (now - s.lastAt >= gap) { s.count = (s.count || 1) + 1; s.lastAt = now; }
      s = state[it.id];
      if (s.count >= 2 && s.lastAt - s.firstAt >= gap) {
        if (toReport.length < cap) toReport.push({ id: it.id, title: it.title }); else capped = true;
      }
    });
    Object.keys(state).forEach(function (k) { if (!ids[k]) delete state[k]; });
    return { ok: true, skip: null, toReport: toReport, state: state, absent: absent, present: present, capped: capped };
  }
  function accountConfirmed(pageText, expectedEmail) {
    var e = String(expectedEmail || '').trim().toLowerCase();
    return !!e && String(pageText || '').toLowerCase().indexOf(e) !== -1;
  }

  var api = {
    LOCK_TTL_MS: LOCK_TTL_MS, CLAIM_MS: CLAIM_MS, decideLock: decideLock, queueTabVerdict: queueTabVerdict,
    cleanTitle: cleanTitle, titlesCompatible: titlesCompatible, pagePostingTitle: pagePostingTitle, isPostingConfirmation: isPostingConfirmation, editOutcome: editOutcome,
    pickSearchWord: pickSearchWord, parseTotal: parseTotal, rowStatus: rowStatus, parseDashboardRows: parseDashboardRows, isNoPostings: isNoPostings, classifyLookup: classifyLookup,
    RECON_MIN_GAP_MS: RECON_MIN_GAP_MS, RECON_CAP: RECON_CAP, reconcileDecide: reconcileDecide, accountConfirmed: accountConfirmed
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  try { root.FAS_CL_GUARD = api; } catch (e) { /* ignore */ }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
