// fas-vinted-drafts.js -- pure helpers for the Vinted drafts-only flow (extension 1.0.76, 2026-10-27).
//
// Vinted is drafts only (owner decision 1.0.63): FindA.Sale fills the form and presses Vinted's "Save draft", never Upload.
// Live 2026-10-27: after Save draft, Vinted leaves the form for the member profile, which used to stall a multi-item queue.
// These helpers decide, from the organizer's own wardrobe API rows (GET /api/v2/wardrobe/<id>/items, where a draft has
// is_draft: true), (1) whether the draft just saved for the queued item really exists, so the queue can move on, and
// (2) which recorded drafts the organizer has since uploaded (is_draft: false, same id), so FindA.Sale can record them.
// Nothing here clicks, fetches or touches chrome.*; it is unit-tested in Node (extension/tests/fas-vinted-draft-advance.test.js).
// Loaded before fas-vinted.js in the manifest (window.FAS_VINTED_DRAFTS) and by Node (module.exports).
(function (root) {
  'use strict';

  // How far a wardrobe timestamp may sit before the fill start and still count (clock differences).
  var CLOCK_SKEW_MS = 2 * 60 * 1000;
  // Recorded drafts are kept this long for the upload check, and an uploaded one a week after it was recorded.
  var DRAFT_KEEP_MS = 60 * 24 * 60 * 60 * 1000;
  var LISTED_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
  var MAX_DRAFTS = 200;

  // Same folding as fas-vinted.js fasFoldTitle (so a title compares the way the removal flow compares it).
  function fold(s) {
    var t = String(s == null ? '' : s);
    try { t = t.normalize('NFKC'); } catch (e) { /* fold the rest anyway */ }
    return t
      .replace(/[‘’‚‛ʼ′]/g, "'")
      .replace(/[“”„‟″]/g, '"')
      .replace(/[‐‑‒–—―−]/g, '-')
      .replace(/…/g, '...')
      .replace(/[   ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function idOf(it) {
    var id = it && it.id != null ? String(it.id) : '';
    return /^\d{1,20}$/.test(id) ? id : '';
  }

  function toMs(v) {
    if (typeof v === 'number' && isFinite(v) && v > 0) return v < 1e12 ? v * 1000 : v;
    if (typeof v === 'string' && v) {
      if (/^\d+$/.test(v)) return toMs(Number(v));
      var p = Date.parse(v);
      return isFinite(p) ? p : null;
    }
    return null;
  }

  // When Vinted created this wardrobe row, if the row says. Field names are best guesses (UNVERIFIED live); the photo
  // timestamp is when the photo was uploaded during the fill. null when nothing usable is present.
  function createdAtMs(it) {
    if (!it || typeof it !== 'object') return null;
    var cands = [it.created_at_ts, it.created_at];
    var photos = [];
    if (it.photo) photos.push(it.photo);
    if (Array.isArray(it.photos)) photos = photos.concat(it.photos);
    for (var i = 0; i < photos.length; i++) {
      var hr = photos[i] && photos[i].high_resolution;
      if (hr) cands.push(hr.timestamp);
    }
    for (var j = 0; j < cands.length; j++) {
      var ms = toMs(cands[j]);
      if (ms != null) return ms;
    }
    return null;
  }

  // Numeric id comparison without precision loss (Vinted ids are digit strings).
  function idGreater(a, b) {
    if (a.length !== b.length) return a.length > b.length;
    return a > b;
  }

  function wantedTitles(pending) {
    var out = [];
    [pending && pending.title, pending && pending.altTitle].forEach(function (t) {
      var f = fold(t);
      if (f && out.indexOf(f) === -1) out.push(f);
    });
    return out;
  }

  // Draft ids already in the wardrobe with the pending item's title, taken just before Save draft is pressed.
  function draftIdsWithTitle(items, pending) {
    var want = wantedTitles(pending);
    var ids = [];
    if (!Array.isArray(items) || !want.length) return ids;
    items.forEach(function (it) {
      if (!it || it.is_draft !== true) return;
      var id = idOf(it);
      if (id && want.indexOf(fold(it.title)) !== -1 && ids.indexOf(id) === -1) ids.push(id);
    });
    return ids;
  }

  // The draft Vinted saved for `pending` ({ itemId, title, altTitle, startedAt, priorDraftIds }), or null.
  // A candidate is an is_draft row whose folded title equals the filled title, that is not already recorded for another
  // fill, and that is new: either absent from the pre-save snapshot (priorDraftIds) or, when the row carries a timestamp,
  // created after the fill started. With neither a snapshot nor a timestamp there is no way to tell it is new: null.
  // The newest candidate wins.
  function findConfirmedDraft(items, pending, recordedDraftIds) {
    if (!Array.isArray(items) || !pending || !pending.itemId) return null;
    var want = wantedTitles(pending);
    if (!want.length) return null;
    var prior = Array.isArray(pending.priorDraftIds) ? pending.priorDraftIds.map(String) : null;
    var recorded = Array.isArray(recordedDraftIds) ? recordedDraftIds.map(String) : [];
    var startedAt = Number(pending.startedAt) || 0;
    var best = null;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || typeof it !== 'object' || it.is_draft !== true) continue;
      var id = idOf(it);
      if (!id || want.indexOf(fold(it.title)) === -1) continue;
      if (recorded.indexOf(id) !== -1) continue;
      if (prior && prior.indexOf(id) !== -1) continue;
      var created = createdAtMs(it);
      if (created != null) {
        if (startedAt && created < startedAt - CLOCK_SKEW_MS) continue;
      } else if (!prior) {
        continue;
      }
      if (!best || idGreater(id, best.draftId)) best = { draftId: id, createdAt: created };
    }
    return best;
  }

  // What to do once the flow has left Vinted's review screen for the queued item.
  //   'none'    no draft save is waiting for this queued item (stale or another item): today's behavior applies
  //   'advance' the draft is confirmed: record it, move the queue on, open the next item (paced)
  //   'prompt'  not confirmed: show the "Continue / Not yet" prompt, never mark anything listed
  // Never returns anything that presses a Vinted button: the furthest automation goes is Save draft.
  function decideAfterLeavingReview(pending, queuedItemId, confirmedDraft) {
    if (!pending || !pending.itemId || queuedItemId == null || String(pending.itemId) !== String(queuedItemId)) return 'none';
    return confirmedDraft && confirmedDraft.draftId ? 'advance' : 'prompt';
  }

  // Recorded drafts ({ itemId, draftId, listedAt? }) the organizer has since uploaded: the same id is now in the wardrobe
  // with is_draft === false. Returns [{ itemId, remoteListingId }] for the markListed path.
  function findUploadedDrafts(items, drafts) {
    var out = [];
    if (!Array.isArray(items) || !Array.isArray(drafts)) return out;
    var byId = {};
    items.forEach(function (it) { var id = idOf(it); if (id) byId[id] = it; });
    drafts.forEach(function (d) {
      if (!d || d.listedAt || !d.itemId) return;
      var id = String(d.draftId == null ? '' : d.draftId);
      if (!/^\d{1,20}$/.test(id)) return;
      var it = byId[id];
      if (it && it.is_draft === false) out.push({ itemId: String(d.itemId), remoteListingId: id });
    });
    return out;
  }

  // Bounded draft list: drops malformed rows, drafts older than DRAFT_KEEP_MS, uploaded ones a week after, keeps the newest.
  function pruneDrafts(drafts, now) {
    var t = Number(now) || Date.now();
    var arr = Array.isArray(drafts) ? drafts : [];
    var seen = {};
    var out = arr.filter(function (d) {
      if (!d || !d.itemId || !/^\d{1,20}$/.test(String(d.draftId == null ? '' : d.draftId))) return false;
      var at = Number(d.at) || 0;
      if (!at || t - at > DRAFT_KEEP_MS) return false;
      if (d.listedAt && t - Number(d.listedAt) > LISTED_KEEP_MS) return false;
      var k = String(d.draftId);
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
    return out.slice(-MAX_DRAFTS);
  }

  var API = {
    fold: fold,
    createdAtMs: createdAtMs,
    draftIdsWithTitle: draftIdsWithTitle,
    findConfirmedDraft: findConfirmedDraft,
    decideAfterLeavingReview: decideAfterLeavingReview,
    findUploadedDrafts: findUploadedDrafts,
    pruneDrafts: pruneDrafts,
    CLOCK_SKEW_MS: CLOCK_SKEW_MS
  };
  if (root) root.FAS_VINTED_DRAFTS = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this));
