/* FindA.Sale -- shared challenge / restriction page watcher for the Vinted, Grailed, Mercari and Poshmark scripts.
 *
 * If the marketplace replaces the page with a full-page bot check or an access-denied wall, tell the background
 * worker (type 'platformRestricted') so it pauses that marketplace; the organizer un-pauses it in the popup after
 * looking at their account. Deliberately conservative: only a page whose TITLE says so, or a very short page that
 * carries a captcha widget, counts. Normal login or signup pages that embed a captcha do not.
 *
 * A transient interstitial (Cloudflare's "Just a moment..." usually clears within seconds in a real browser) must NOT
 * pause the marketplace. The signal has to still be present after CHALLENGE_SETTLE_MS since it was first seen, across
 * repeated polls (CHALLENGE_POLL_MS). If the page turns normal first, the suspicion is dropped and a later fresh
 * sighting starts over. One report at most, then polling stops. This code never interacts with the challenge.
 *
 * Loads as a content script (attaches to window.__FAS_CHALLENGE__) and under Node (module.exports) for the jest test
 * packages/backend/src/__tests__/extensionChallengeDetector.test.ts. No dependencies; chrome.* only to send the message.
 */
(function (root) {
  'use strict';

  var CHALLENGE_FIRST_CHECK_MS = 2500;  // first look after the script loads
  var CHALLENGE_POLL_MS = 3000;         // re-check interval while watching
  var CHALLENGE_SETTLE_MS = 20000;      // signal must persist this long after the first sighting before we report
  var CHALLENGE_MAX_WATCH_MS = 60000;   // stop polling after this long if no signal is currently suspected

  var TITLE_RE = /^(access denied|just a moment|attention required|verify you are human|are you a (human|robot)|you have been blocked|request blocked|pardon our interruption)/i;
  var WIDGET_SEL = 'iframe[src*="captcha-delivery.com"], iframe[src*="geo.captcha-delivery"], #px-captcha, iframe[src*="challenges.cloudflare.com"], #challenge-form, #challenge-running';

  // Returns null when the page looks normal, else { kind: 'title' | 'widget', reason }.
  function readSignal(doc) {
    var title = String((doc && doc.title) || '');
    if (TITLE_RE.test(title.trim())) return { kind: 'title', reason: 'title:' + title.slice(0, 60) };
    var bodyLen = ((doc && doc.body && doc.body.innerText) || '').trim().length;
    var widget = !!(doc && doc.querySelector(WIDGET_SEL));
    if (widget && bodyLen < 800) return { kind: 'widget', reason: 'challenge_widget' };
    return null;
  }

  // opts: { platform, doc?, send?(reason) }. Returns { stop() }.
  function watch(opts) {
    var platform = opts.platform;
    var doc = opts.doc || root.document;
    var send = opts.send || function (reason) {
      root.chrome.runtime.sendMessage({ type: 'platformRestricted', platform: platform, reason: reason }, function () { void root.chrome.runtime.lastError; });
    };
    var startedAt = Date.now();
    var suspect = null; // { kind, since }
    var done = false;
    var timer = null;

    function stop() {
      done = true;
      if (timer !== null) { clearTimeout(timer); timer = null; }
    }

    function tick() {
      timer = null;
      if (done) return;
      try {
        var now = Date.now();
        var sig = readSignal(doc);
        if (!sig) {
          suspect = null;
        } else if (!suspect || suspect.kind !== sig.kind) {
          suspect = { kind: sig.kind, since: now };
        } else if (now - suspect.since >= CHALLENGE_SETTLE_MS) {
          stop();
          send(sig.reason);
          return;
        }
        // Stop once the window is over and nothing is currently suspected; a suspected signal keeps being watched
        // until it either settles (reported) or clears.
        if (!suspect && now - startedAt >= CHALLENGE_MAX_WATCH_MS) { stop(); return; }
      } catch (e) { /* never break the page script */ }
      if (!done) timer = setTimeout(tick, CHALLENGE_POLL_MS);
    }

    timer = setTimeout(tick, CHALLENGE_FIRST_CHECK_MS);
    return { stop: stop };
  }

  var api = {
    watch: watch,
    readSignal: readSignal,
    CHALLENGE_FIRST_CHECK_MS: CHALLENGE_FIRST_CHECK_MS,
    CHALLENGE_POLL_MS: CHALLENGE_POLL_MS,
    CHALLENGE_SETTLE_MS: CHALLENGE_SETTLE_MS,
    CHALLENGE_MAX_WATCH_MS: CHALLENGE_MAX_WATCH_MS
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.__FAS_CHALLENGE__ = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : null));
