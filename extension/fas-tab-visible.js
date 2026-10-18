// fas-tab-visible.js -- pure helper (extension 1.0.22): make sure a removal tab is actually VISIBLE before anything is clicked in it.
// A background / minimised / locked-screen tab (document.hidden === true) never renders Vinted's delete modal or native confirm, so a delete
// click there can only time out ("no_confirmation_prompt[hidden true, ...]"). ensure() waits up to timeoutMs for visibility, asking the
// background (requestFocus) to activate the tab and focus its window every askEveryMs. It never clicks anything.
// No chrome.* access of its own. Loaded by the Vinted content script and Node (tests).
(function (root) {
  'use strict';
  var REASON = 'tab_not_visible';
  function isVisible(doc) { return !!doc && doc.hidden !== true && (doc.visibilityState === undefined || doc.visibilityState === 'visible'); }
  // opts: { timeoutMs, pollMs, askEveryMs, sleep(ms) -> Promise, now() }. Resolves { visible, waitedMs, asked }.
  async function ensure(doc, requestFocus, opts) {
    var o = opts || {};
    var timeoutMs = o.timeoutMs == null ? 10000 : o.timeoutMs, pollMs = o.pollMs || 400, askEveryMs = o.askEveryMs || 3000;
    var sleep = o.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var now = o.now || Date.now;
    var t0 = now(), lastAsk = -Infinity, asked = 0;
    for (;;) {
      if (isVisible(doc)) return { visible: true, waitedMs: now() - t0, asked: asked };
      var t = now() - t0;
      if (t >= timeoutMs) return { visible: false, waitedMs: t, asked: asked };
      if (t - lastAsk >= askEveryMs) { lastAsk = t; asked++; try { if (requestFocus) requestFocus(); } catch (e) { /* best effort */ } }
      await sleep(pollMs);
    }
  }
  var api = { REASON: REASON, isVisible: isVisible, ensure: ensure };
  root.FAS_TAB_VISIBLE = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
