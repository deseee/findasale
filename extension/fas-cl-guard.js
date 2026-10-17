// fas-cl-guard.js -- Craigslist single-flight lock decision, posting-identity check and posting-confirmation detection (extension 1.0.18).
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

  var api = {
    LOCK_TTL_MS: LOCK_TTL_MS, CLAIM_MS: CLAIM_MS, decideLock: decideLock, queueTabVerdict: queueTabVerdict,
    cleanTitle: cleanTitle, titlesCompatible: titlesCompatible, pagePostingTitle: pagePostingTitle, isPostingConfirmation: isPostingConfirmation, editOutcome: editOutcome
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  try { root.FAS_CL_GUARD = api; } catch (e) { /* ignore */ }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
