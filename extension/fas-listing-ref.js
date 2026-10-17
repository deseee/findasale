// fas-listing-ref.js -- pure helpers for capturing / validating a posted marketplace listing's reference (URL + bare id)
// (extension 1.0.7, 2026-10-13). Nothing here touches chrome.*, the network or any global except an optional `doc`/`loc`
// passed in by the caller, so it is unit-tested in Node (extension/tests/fas-listing-ref.test.js).
//
// Loaded in THREE places: background.js (importScripts), the posting content scripts for Poshmark / Mercari / Grailed /
// Craigslist / Gumtree AU (manifest content_scripts, before the platform script), and Node (module.exports).
//
// The id formats mirror the backend's (packages/backend/src/services/marketplaceListingRef.ts):
//   Facebook numeric item id, Poshmark 24-hex, Mercari m<digits>, Grailed numeric, Craigslist 9-12 digits, Gumtree AU 8-12 digits.
(function (root) {
  'use strict';

  var REMOTE_ID_RE = {
    FACEBOOK: /^\d{6,20}$/,
    POSHMARK: /^[0-9a-f]{24}$/i,
    MERCARI: /^m\d{1,20}$/i,
    GRAILED: /^\d{1,20}$/,
    CRAIGSLIST: /^\d{9,12}$/,
    GUMTREE_AU: /^\d{8,12}$/
  };
  var HOST_RE = {
    FACEBOOK: /^https?:\/\/(?:[a-z0-9-]+\.)*facebook\.com(?:[/?#:]|$)/i,
    POSHMARK: /^https?:\/\/(?:[a-z0-9-]+\.)*poshmark\.com(?:[/?#:]|$)/i,
    MERCARI: /^https?:\/\/(?:[a-z0-9-]+\.)*mercari\.com(?:[/?#:]|$)/i,
    GRAILED: /^https?:\/\/(?:[a-z0-9-]+\.)*grailed\.com(?:[/?#:]|$)/i,
    CRAIGSLIST: /^https?:\/\/(?:[a-z0-9-]+\.)*craigslist\.org(?:[/?#:]|$)/i,
    GUMTREE_AU: /^https?:\/\/(?:[a-z0-9-]+\.)*gumtree\.com\.au(?:[/?#:]|$)/i
  };
  var MAX_URL = 500;

  // Validated + normalized bare id ('' when it does not match the platform's format). Poshmark / Mercari ids are lowercased.
  function normalizeRemoteId(platform, raw) {
    var re = REMOTE_ID_RE[platform];
    if (!re || (typeof raw !== 'string' && typeof raw !== 'number')) return '';
    var s = String(raw).trim();
    if (!re.test(s)) return '';
    return (platform === 'POSHMARK' || platform === 'MERCARI') ? s.toLowerCase() : s;
  }

  function firstMatch(u, res) {
    for (var i = 0; i < res.length; i++) { var m = res[i].exec(u); if (m) return m[1]; }
    return '';
  }

  // The platform-specific id inside a URL of that platform, or ''. Does NOT check the host (see listingRefFromUrl).
  function idFromUrl(platform, url) {
    var u = String(url || '');
    var raw = '';
    switch (platform) {
      case 'FACEBOOK': raw = firstMatch(u, [/\/marketplace\/item\/(\d{6,20})(?:[/?#]|$)/]); break;
      case 'POSHMARK': raw = firstMatch(u, [/\/(?:edit-)?listing\/(?:[^/?#]*-)?([0-9a-f]{24})(?:[/?#]|$)/i]); break;
      case 'MERCARI': raw = firstMatch(u, [/\/item\/(m\d{1,20})(?:[/?#]|$)/i, /\/sell\/edit\/(m\d{1,20})(?:[/?#]|$)/i]); break;
      case 'GRAILED': raw = firstMatch(u, [/\/listings\/(\d{1,20})(?:[-/?#]|$)/]); break;
      case 'CRAIGSLIST': raw = firstMatch(u, [/\/manage\/(\d{9,12})(?:[/?#]|$)/, /\/(\d{9,12})\.html(?:[?#]|$)/, /[?&](?:postingid|postid|postingId)=(\d{9,12})(?:[&#]|$)/i, /\/(\d{9,12})(?:[/?#]|$)/]); break;
      case 'GUMTREE_AU': raw = firstMatch(u, [/[?&](?:adId|adid)=(\d{8,12})(?:[&#]|$)/, /\/(\d{8,12})(?:[/?#]|$)/]); break;
      default: raw = '';
    }
    return normalizeRemoteId(platform, raw);
  }

  // { remoteListingId, remoteListingUrl } when `url` is an http(s) URL on the platform's own host that carries a valid id; else null.
  function listingRefFromUrl(platform, url) {
    if (typeof url !== 'string') return null;
    var u = url.trim();
    if (!/^https?:\/\//i.test(u) || !HOST_RE[platform] || !HOST_RE[platform].test(u)) return null;
    var id = idFromUrl(platform, u);
    if (!id) return null;
    return { remoteListingId: id, remoteListingUrl: u.split('#')[0].slice(0, MAX_URL) };
  }

  // Combine what a content script sent (any of: bare id, URL in the id field -- Facebook's historic shape -- or a URL) into the
  // validated pair that goes to the backend. Anything invalid becomes null; a bare id that contradicts the URL's id drops the URL.
  function sanitizeListedRef(platform, rawId, rawUrl) {
    var out = { remoteListingId: null, remoteListingUrl: null };
    var urlCand = (typeof rawUrl === 'string' && rawUrl) ? rawUrl : ((typeof rawId === 'string' && /^https?:\/\//i.test(rawId.trim())) ? rawId : '');
    var fromUrl = urlCand ? listingRefFromUrl(platform, urlCand) : null;
    var bare = (typeof rawId === 'string' && /^https?:\/\//i.test(rawId.trim())) ? '' : normalizeRemoteId(platform, rawId);
    if (bare && fromUrl && fromUrl.remoteListingId !== bare) fromUrl = null;
    if (bare) out.remoteListingId = bare;
    else if (fromUrl) out.remoteListingId = fromUrl.remoteListingId;
    if (fromUrl) out.remoteListingUrl = fromUrl.remoteListingUrl;
    return out;
  }

  // Best-effort read of the posted listing's reference from the page the poster is on right after a successful submit.
  // Candidate order: the page URL itself, the canonical / og:url, then (Craigslist manage/posting links, Gumtree adId links ONLY)
  // anchors -- accepted only when they all agree on ONE id, so a page that links several listings can never attach the wrong one.
  // Poshmark / Grailed / Mercari trust only the page's own URL / canonical (their feeds link other people's listings).
  // Never throws; returns null when nothing valid is found.
  function capturePageListingRef(platform, loc, doc) {
    try {
      var href = loc && (loc.href || (typeof loc === 'string' ? loc : ''));
      var r = listingRefFromUrl(platform, href);
      if (r) return r;
      if (doc && typeof doc.querySelector === 'function') {
        var metas = [];
        var can = doc.querySelector('link[rel="canonical"]'); if (can) metas.push(can.getAttribute('href') || can.href);
        var og = doc.querySelector('meta[property="og:url"]'); if (og) metas.push(og.getAttribute('content'));
        for (var i = 0; i < metas.length; i++) { r = listingRefFromUrl(platform, abs(metas[i], href)); if (r) return r; }
        var sel = platform === 'CRAIGSLIST' ? 'a[href*="/manage/"], a[href$=".html"]' : (platform === 'GUMTREE_AU' ? 'a[href*="adId="], a[href*="adid="]' : '');
        if (sel && typeof doc.querySelectorAll === 'function') {
          var list = doc.querySelectorAll(sel), found = null, ids = {}, n = 0;
          for (var j = 0; j < list.length; j++) {
            var a = list[j];
            var rr = listingRefFromUrl(platform, abs(a.getAttribute ? a.getAttribute('href') : a.href, href));
            if (rr && !ids[rr.remoteListingId]) { ids[rr.remoteListingId] = 1; n++; if (!found) found = rr; }
          }
          if (n === 1) return found;
        }
      }
    } catch (e) { /* capture must never break a posting */ }
    return null;
  }
  // From the live exact-title closet matches read right after a publish (the closet had none before), the new listing's reference --
  // only when there is exactly ONE and the read was not truncated. { ref, reason: 'ok'|'none'|'ambiguous'|'truncated'|'invalid', count }.
  function pickPostedListing(platform, live, truncated) {
    var seen = {}, refs = [];
    (live || []).forEach(function (l) {
      var id = normalizeRemoteId(platform, l && l.id);
      if (!id || seen[id]) return;
      seen[id] = 1;
      var r = (l && l.url) ? listingRefFromUrl(platform, l.url) : null;
      refs.push({ remoteListingId: id, remoteListingUrl: r && r.remoteListingId === id ? r.remoteListingUrl : null });
    });
    if (truncated) return { ref: null, reason: 'truncated', count: refs.length };
    if (refs.length === 0) return { ref: null, reason: 'none', count: 0 };
    if (refs.length > 1) return { ref: null, reason: 'ambiguous', count: refs.length };
    return { ref: refs[0], reason: 'ok', count: 1 };
  }
  // The publish click happened but the page never showed a confirmation. `checks` are the closet exact-title results read afterwards
  // ({ state: 'dup'|'clear'|'failed' }). A live exact-title listing means the item IS on the platform (ours, or one already there): it must be
  // recorded as listed and never posted again. Anything else stays unconfirmed (never marked listed, never re-posted blindly).
  function unconfirmedPublishVerdict(checks) {
    var list = checks || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].state === 'dup') return { published: true, reason: 'live_in_closet' };
    var anyClear = list.some(function (c) { return c && c.state === 'clear'; });
    return { published: false, reason: list.length === 0 ? 'no_checks' : (anyClear ? 'not_in_closet' : 'closet_unreadable') };
  }
  function abs(h, base) {
    var s = String(h || '');
    if (/^https?:\/\//i.test(s)) return s;
    try { return new URL(s, base).href; } catch (e) { return s; }
  }

  var api = {
    REMOTE_ID_RE: REMOTE_ID_RE, HOST_RE: HOST_RE,
    normalizeRemoteId: normalizeRemoteId, idFromUrl: idFromUrl, listingRefFromUrl: listingRefFromUrl,
    sanitizeListedRef: sanitizeListedRef, capturePageListingRef: capturePageListingRef, pickPostedListing: pickPostedListing, unconfirmedPublishVerdict: unconfirmedPublishVerdict
  };
  root.FAS_LISTING_REF = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
