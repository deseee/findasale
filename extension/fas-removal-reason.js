// fas-removal-reason.js -- pure helpers that say WHY a marketplace listing is being taken down (extension 1.0.16).
// GET /extension/pending-removals tags every item with `reason`: SOLD_ELSEWHERE (or missing, older payloads), POLICY_INELIGIBLE
// (with `policyReasons[PLATFORM]` = the matched rule text), UNPUBLISHED, ITEM_DELETED, RESYNC_VERIFY. Logs, toasts and overlays used
// to call every one of them "sold"; they all go through here instead so the wording always matches the real reason.
// No chrome.* or DOM access. Loaded by background.js (importScripts), the removal content scripts, and Node (tests).
(function (root) {
  'use strict';
  var LABELS = {
    SOLD_ELSEWHERE: 'sold elsewhere',
    POLICY_INELIGIBLE: 'no longer allowed by policy',
    UNPUBLISHED: 'unpublished',
    ITEM_DELETED: 'deleted from FindA.Sale',
    RESYNC_VERIFY: 're-check only'
  };
  var ORDER = ['SOLD_ELSEWHERE', 'POLICY_INELIGIBLE', 'UNPUBLISHED', 'ITEM_DELETED', 'RESYNC_VERIFY'];

  // Missing reason = an older payload, which only ever meant sold elsewhere. An unknown non-empty value is kept visible, never relabelled as sold.
  function keyOf(item) {
    var r = item && item.reason;
    if (!r) return 'SOLD_ELSEWHERE';
    return Object.prototype.hasOwnProperty.call(LABELS, r) ? r : 'OTHER';
  }
  function label(item) { var k = keyOf(item); return k === 'OTHER' ? 'ended (' + String(item.reason).slice(0, 30) + ')' : LABELS[k]; }
  function policyReason(item, platform) {
    var m = item && item.policyReasons;
    var t = m && platform && typeof m[platform] === 'string' ? m[platform] : '';
    return t ? t.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
  }
  function counts(items) {
    var c = { SOLD_ELSEWHERE: 0, POLICY_INELIGIBLE: 0, UNPUBLISHED: 0, ITEM_DELETED: 0, RESYNC_VERIFY: 0, OTHER: 0 };
    (items || []).forEach(function (i) { c[keyOf(i)]++; });
    return c;
  }
  function summary(items) {
    var c = counts(items), parts = [];
    ORDER.forEach(function (k) { if (c[k]) parts.push(c[k] + ' ' + LABELS[k]); });
    if (c.OTHER) parts.push(c.OTHER + ' ended');
    return parts.join(', ') || 'no longer needed';
  }
  // True when every item is a re-check (nothing will be removed).
  function checkOnly(items) { return !!(items && items.length) && items.every(function (i) { return keyOf(i) === 'RESYNC_VERIFY'; }); }
  function headline(items, platformLabel) {
    var n = (items || []).length;
    if (checkOnly(items)) return 'Re-checking ' + n + ' item(s) on ' + platformLabel + ' (' + summary(items) + ')';
    return 'Removing ' + n + ' item(s) from ' + platformLabel + ' (' + summary(items) + ')';
  }
  // Per-item ctx for logs: id, reason, and for policy takedowns the matched rule text. Capped so the log record stays small.
  function itemsCtx(items, platform, max) {
    return (items || []).slice(0, max || 10).map(function (i) {
      var o = { id: i.id, reason: i.reason || 'SOLD_ELSEWHERE' };
      var pr = policyReason(i, platform);
      if (pr) o.policyReason = pr;
      return o;
    });
  }
  // Overlay text for the removal content scripts: "removing item 2 of 3 (no longer allowed by policy)".
  function overlayLine(item, index, total) {
    var k = keyOf(item);
    return (k === 'RESYNC_VERIFY' ? 'checking item ' : 'removing item ') + (index + 1) + ' of ' + total + ' (' + label(item) + ')';
  }
  var api = { LABELS: LABELS, keyOf: keyOf, label: label, policyReason: policyReason, counts: counts, summary: summary, checkOnly: checkOnly, headline: headline, itemsCtx: itemsCtx, overlayLine: overlayLine };
  root.FAS_REMOVAL_REASON = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
