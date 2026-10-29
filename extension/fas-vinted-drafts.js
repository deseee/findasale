// fas-vinted-drafts.js -- pure helpers for the Vinted fill-and-stop flow (extension 1.0.77, 2026-10-27; 1.0.78 2026-10-27).
//
// 1.0.77 (owner decision 2026-10-27): Vinted listings are no longer saved as drafts. FindA.Sale fills the listing and
// stops with Vinted's own form ready; the organizer clicks Upload. No code clicks Upload or Save draft.
// These helpers decide, from the organizer's own wardrobe API rows (GET /api/v2/wardrobe/<id>/items, where a draft has
// is_draft: true and a live listing is_draft: false), (1) which live listing is the organizer's own Upload of the
// queued item, (2) whether a form reset is refilled or the prompt shows (2 refills per item), (3) whether a queued item
// is already live on Vinted so it is skipped instead of listed twice, (4) what the popup marks,
// and (5) which drafts saved by 1.0.63-1.0.76 the organizer has since uploaded, so FindA.Sale can record them.
// 1.0.78 (owner report 2026-10-27, "says draft waiting on vinted and can't click through it"): a Vinted draft is no
// longer a reason to skip or block anything. The extension stopped creating drafts in 1.0.77, so only a LIVE listing
// counts as already there: FindA.Sale's own record, a recorded legacy draft the organizer has since uploaded, or a
// live (non-draft, not closed) wardrobe listing with the exact title.
// Nothing here clicks, fetches or touches chrome.*; it is unit-tested in Node
// (extension/tests/fas-vinted-draft-advance.test.js and fas-vinted-drafts-only.test.js).
// Loaded before fas-vinted.js in the manifest and before popup.js in popup.html (self.FAS_VINTED_DRAFTS) and by Node.
(function (root) {
  'use strict';

  // How far a wardrobe timestamp may sit before the fill start and still count (clock differences).
  var CLOCK_SKEW_MS = 2 * 60 * 1000;
  // Recorded drafts are kept this long for the upload check, and an uploaded one a week after it was recorded.
  var DRAFT_KEEP_MS = 60 * 24 * 60 * 60 * 1000;
  var LISTED_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
  var MAX_DRAFTS = 200;
  // Refills of the same never-submitted listing after Vinted resets the form, per item.
  var MAX_REFILLS = 2;
  // Fills the organizer moved on from without a confirmed upload, watched for a late upload.
  var AWAITING_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
  var MAX_AWAITING = 50;
  // What the duplicate guard found per item, shown in the popup.
  var PRESENT_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
  var MAX_PRESENT = 500;

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

  // Live = posted and still up: not a draft, not closed (sold / closed listings are not live).
  function isLiveRow(it) { return !!it && it.is_draft === false && it.is_closed !== true; }

  function wantedTitles(p) {
    var out = [];
    [p && p.title, p && p.altTitle].forEach(function (t) {
      var f = fold(t);
      if (f && out.indexOf(f) === -1) out.push(f);
    });
    return out;
  }

  // Same-title live ids in the wardrobe before the organizer's upload (the "already there" snapshot). Rows that say they
  // were created after `sinceMs` (the fill start) are left out: those cannot be older listings.
  function liveIdsWithTitle(items, p, sinceMs) {
    var want = wantedTitles(p);
    var ids = [];
    if (!Array.isArray(items) || !want.length) return ids;
    var since = Number(sinceMs) || 0;
    items.forEach(function (it) {
      if (!isLiveRow(it)) return;
      var id = idOf(it);
      if (!id || want.indexOf(fold(it.title)) === -1 || ids.indexOf(id) !== -1) return;
      var created = createdAtMs(it);
      if (since && created != null && created >= since - CLOCK_SKEW_MS) return;
      ids.push(id);
    });
    return ids;
  }

  // The listing the organizer uploaded for `pending` ({ itemId, title, altTitle, startedAt, priorLiveIds }), or null.
  // A candidate is a live row whose folded title equals the filled title, that is not already recorded, and that is new:
  // either absent from the snapshot (priorLiveIds) or, when the row carries a timestamp, created after the fill started.
  // With neither a snapshot nor a timestamp there is no way to tell it is new: null. The newest candidate wins.
  function findOrganizerUpload(items, pending, recordedIds) {
    if (!Array.isArray(items) || !pending || !pending.itemId) return null;
    var want = wantedTitles(pending);
    if (!want.length) return null;
    var prior = Array.isArray(pending.priorLiveIds) ? pending.priorLiveIds.map(String) : null;
    var recorded = Array.isArray(recordedIds) ? recordedIds.map(String) : [];
    var startedAt = Number(pending.startedAt) || 0;
    var best = null;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!isLiveRow(it)) continue;
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
      if (!best || idGreater(id, best.listingId)) best = { listingId: id, createdAt: created };
    }
    return best;
  }

  // What to do once the organizer has left (or asked about) the filled form for the queued item.
  //   'none'    nothing is waiting for this queued item (stale or another item)
  //   'advance' their upload was found: record it with its Vinted id, move the queue on, open the next item (paced)
  //   'prompt'  not found: show the "Continue / Not yet" prompt; Continue only moves the queue, never marks listed
  function decideAfterLeavingForm(pending, queuedItemId, upload) {
    if (!pending || !pending.itemId || queuedItemId == null || String(pending.itemId) !== String(queuedItemId)) return 'none';
    return upload && upload.listingId ? 'advance' : 'prompt';
  }

  // Vinted blanked the form of the queued, never-submitted listing: 'refill' (the same listing, filled in again) while
  // fewer than maxRefills refills were used for this item, else 'prompt'. 'none' when nothing is waiting for this item.
  function decideOnBlankForm(pending, queuedItemId, maxRefills) {
    if (!pending || !pending.itemId || queuedItemId == null || String(pending.itemId) !== String(queuedItemId)) return 'none';
    var cap = maxRefills == null ? MAX_REFILLS : Number(maxRefills);
    return (Number(pending.refills) || 0) < cap ? 'refill' : 'prompt';
  }

  // Duplicate guard (1.0.78: live listings only). `item` = { itemId, title, altTitle }. `items` = wardrobe rows read
  // (null when unread), `drafts` = recorded legacy drafts ({ itemId, draftId, listedAt? }), opts.listed = FindA.Sale
  // already records it live on Vinted. Returns { kind: 'live', remoteId, source } or null. A row that is still a draft
  // (recorded or same title) never counts: drafts are not listings and no longer block a fill.
  function findAlreadyPresent(items, item, drafts, opts) {
    if (!item || item.itemId == null || String(item.itemId) === '') return null;
    var itemId = String(item.itemId);
    if (opts && opts.listed === true) return { kind: 'live', remoteId: null, source: 'recorded_listing' };
    var rows = Array.isArray(items) ? items : null;
    if (!rows) return null;
    var byId = {};
    rows.forEach(function (it) { var id = idOf(it); if (id) byId[id] = it; });
    var uploaded = null;
    (Array.isArray(drafts) ? drafts : []).forEach(function (d) {
      if (uploaded || !d || String(d.itemId) !== itemId) return;
      var id = String(d.draftId == null ? '' : d.draftId);
      if (!/^\d{1,20}$/.test(id)) return;
      if (isLiveRow(byId[id])) uploaded = { kind: 'live', remoteId: id, source: 'recorded_draft_uploaded' };
    });
    if (uploaded) return uploaded;
    var want = wantedTitles(item);
    if (!want.length) return null;
    var live = null;
    rows.forEach(function (it) {
      var id = idOf(it);
      if (live || !id || want.indexOf(fold(it.title)) === -1) return;
      if (isLiveRow(it)) live = { kind: 'live', remoteId: id, source: 'wardrobe_title' };
    });
    return live;
  }

  // A stored guard result only counts when it saw a real Vinted listing (a remote id from the wardrobe or an uploaded draft).
  // 2026-10-29: a result with no remote id only echoed FindA.Sale's own record ('recorded_listing'). The popup reads that record
  // fresh on every open (item.marketplaceListedVinted), so a stored copy can only ever be stale: live, a "Mugig Guitar Instrument
  // Cable" whose Vinted record was closed on 2026-10-28 (stale_record_not_on_vinted) kept its "Already on Vinted" mark and was
  // left out of Select all, so it was never re-listed with the other reset items.
  function isObservedLiveMark(p) {
    return !!p && p.kind === 'live' && /^\d{1,20}$/.test(String(p.remoteId == null ? '' : p.remoteId));
  }

  // Popup mark for an item on the Vinted tab: 'live' ("Already on Vinted") or null. 1.0.78: drafts are never marked
  // (the `drafts` argument is kept for callers and ignored), and a stored 'draft' guard result from 1.0.77 is ignored.
  function popupPresence(item, drafts, presentMap, now) {
    if (!item || item.id == null) return null;
    var id = String(item.id);
    var t = Number(now) || Date.now();
    if (item.marketplaceListedVinted === true) return 'live';
    var p = presentMap && typeof presentMap === 'object' ? presentMap[id] : null;
    if (isObservedLiveMark(p) && t - (Number(p.at) || 0) <= PRESENT_KEEP_MS) return 'live';
    return null;
  }

  // Keeps only live guard results that saw a real Vinted listing (1.0.77 'draft' entries and 2026-10-29 record-only entries are
  // dropped), newest MAX_PRESENT, none older than 30 days.
  function prunePresent(map, now) {
    var t = Number(now) || Date.now();
    var src = map && typeof map === 'object' && !Array.isArray(map) ? map : {};
    var keys = Object.keys(src).filter(function (k) {
      var p = src[k];
      return isObservedLiveMark(p) && t - (Number(p.at) || 0) <= PRESENT_KEEP_MS;
    });
    keys.sort(function (a, b) { return (Number(src[a].at) || 0) - (Number(src[b].at) || 0); });
    var out = {};
    keys.slice(-MAX_PRESENT).forEach(function (k) { out[k] = src[k]; });
    return out;
  }

  function pruneAwaiting(list, now) {
    var t = Number(now) || Date.now();
    var arr = Array.isArray(list) ? list : [];
    var seen = {};
    var out = [];
    for (var i = arr.length - 1; i >= 0; i--) {
      var a = arr[i];
      if (!a || !a.itemId || !fold(a.title) || seen[String(a.itemId)]) continue;
      if (t - (Number(a.at) || 0) > AWAITING_KEEP_MS) continue;
      seen[String(a.itemId)] = true;
      out.unshift(a);
    }
    return out.slice(-MAX_AWAITING);
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
    liveIdsWithTitle: liveIdsWithTitle,
    findOrganizerUpload: findOrganizerUpload,
    decideAfterLeavingForm: decideAfterLeavingForm,
    decideOnBlankForm: decideOnBlankForm,
    findAlreadyPresent: findAlreadyPresent,
    popupPresence: popupPresence,
    prunePresent: prunePresent,
    pruneAwaiting: pruneAwaiting,
    findUploadedDrafts: findUploadedDrafts,
    pruneDrafts: pruneDrafts,
    CLOCK_SKEW_MS: CLOCK_SKEW_MS,
    MAX_REFILLS: MAX_REFILLS
  };
  if (root) root.FAS_VINTED_DRAFTS = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this));
