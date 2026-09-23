/* FindA.Sale — MAIN-world bridge for vinted.com (auto-remove-on-sold-elsewhere delete flow).
 *
 * FEATURE 2026-09-22 (S-EXT-VINTED-DELETE-NATIVE-CONFIRM): live DOM verification against
 * Patrick's real, logged-in Vinted account this session found that clicking Vinted's real
 * delete-listing button (`button[data-testid="item-delete-button"]`) very likely triggers a
 * NATIVE browser window.confirm() dialog, not a custom in-page modal -- evidence: a real click
 * froze the very next computer_screenshot call with a CDP "renderer may be frozen or
 * unresponsive" timeout (the classic native-dialog signature), Escape resolved it and the item
 * was confirmed still present/undeleted afterward, and a separate non-destructive probe
 * confirmed `window.confirm`/`window.alert` are still native, un-overridden, on vinted.com's own
 * page JS (`window.confirm.toString() === "function confirm() { [native code] }"`). A content
 * script running in the default ISOLATED world cannot intercept that call -- it gets its own
 * separate `window.confirm` reference, not the page's real one -- so an isolated-world override
 * would be silently useless against a real native dialog raised by the page's own JS.
 *
 * This file is declared in manifest.json with "world": "MAIN" on the vinted.com match pattern,
 * the exact same pattern already used for fas-poshmark-bridge.js on poshmark.com, so it runs in
 * the SAME JS realm as vinted.com's own page code and shares the real `window.confirm`
 * reference. It has NO access to any chrome.* extension API (unavailable to MAIN-world content
 * scripts, same limitation documented in fas-poshmark-bridge.js) -- its only job is to arm/
 * disarm a narrowly-scoped `window.confirm` override, relayed via the same window
 * CustomEvent request/response pair fas-poshmark-bridge.js / fas-poshmark.js already use.
 *
 * SAFETY -- NON-NEGOTIABLE, do not weaken this without a fresh findasale-hacker review:
 * This file must NEVER install a blanket, always-on override of window.confirm for the
 * vinted.com origin. Patrick (or anyone) may be browsing Vinted normally in a tab running this
 * same content script, and a real native confirm() unrelated to this delete flow (e.g. "leave
 * page with unsaved changes?", or some other Vinted flow) must NOT be silently auto-accepted by
 * this extension. The override below is therefore:
 *   1. Armed ONLY when the isolated-world script (fas-vinted.js) explicitly requests it, right
 *      before it clicks the delete button -- never on page load, never unconditionally.
 *   2. Restored to the real native window.confirm the instant EITHER (a) a confirm() call is
 *      observed and auto-accepted, or (b) a short timeout elapses with no call, whichever comes
 *      first -- so the armed window is always brief and self-closing.
 *   3. Only ever auto-returns `true`, and only for `window.confirm` -- `window.alert` and
 *      `window.prompt` are never touched, and no dialog outside the armed window is ever
 *      affected.
 *   4. (2026-09-22, F3) Auto-returns `true` ONLY when the confirm() text reads as a delete/remove
 *      prompt; any other message is declined (`false`), disarms, and emits 'confirmMismatch'.
 *      The page-supplied arm timeout is clamped to at most 5000ms.
 *
 * REAL DOM UPDATE (read-only live capture of vinted.com, en-US, 2026-09-22): the delete flow is
 * Vinted's ItemPageDeleteActionPlugin. Clicking `item-delete-button` shows the NATIVE
 * window.confirm("Are you sure?") ONLY for a closed item; for every other item it opens an
 * IN-PAGE modal `[data-testid="item-delete-modal"]` ("Delete item" / "Confirm and delete"),
 * which fas-vinted.js clicks itself -- this bridge is not involved in that path and is disarmed
 * by fas-vinted.js as soon as the modal is seen. The en-US native text "Are you sure?" contains
 * no delete/remove word, so it is accepted by an EXACT whole-string match (ARE_YOU_SURE_RE)
 * alongside the keyword test -- still only while armed by our own click, one-shot, <=5s.
 *
 * This mirrors the discipline this codebase's Craigslist credential-guard already applies to a
 * different kind of risk: never take the automated action outside a narrowly-scoped, verified
 * condition.
 */
(function () {
  var originalConfirm = window.confirm;
  var armed = false;
  var armTimer = null;
  var armRequestId = null;

  function disarm() {
    if (armTimer) { clearTimeout(armTimer); armTimer = null; }
    if (armed) {
      window.confirm = originalConfirm;
      armed = false;
    }
  }

  function reportEvent(requestId, eventName, extra) {
    try {
      window.dispatchEvent(new CustomEvent('fas-vinted-bridge-event', {
        detail: Object.assign({ requestId: requestId, event: eventName }, extra || {})
      }));
    } catch (e) { /* non-fatal -- isolated-world caller has its own hard timeout either way */ }
  }

  // SECURITY FIX 2026-09-22 (F3, hacker+architect review): the armed override used to accept ANY
  // confirm() raised during the armed window. It now only auto-accepts a message that actually
  // reads as a delete/remove prompt (a few common Vinted locales); anything else is declined
  // (returns false -- the safe answer for an unexpected dialog), the override disarms, and a
  // 'confirmMismatch' event tells fas-vinted.js the delete was NOT confirmed.
  var DELETE_PROMPT_RE = /delete|remove|supprimer|l(?:ö|oe)schen|eliminar|elimina|verwijder|usu[nń]/i;
  // 2026-09-22 capture: Vinted's real en-US native prompt is exactly "Are you sure?" (no delete
  // keyword) -- accepted only as the WHOLE message, never as a substring.
  var ARE_YOU_SURE_RE = /^\s*are you sure\??\s*$/i;
  var MAX_ARM_MS = 5000;

  function armConfirmOverride(requestId, timeoutMs) {
    // Only one arm window at a time -- a fresh arm request replaces any still-pending one rather
    // than stacking overrides on top of each other.
    disarm();
    armRequestId = requestId;
    armed = true;
    window.confirm = function (message) {
      // Fires at most once per armed window: restore the real native confirm BEFORE returning,
      // so nothing that happens after this single call is ever affected by the override.
      var rid = armRequestId;
      var text = String(message || '');
      disarm();
      if (!DELETE_PROMPT_RE.test(text) && !ARE_YOU_SURE_RE.test(text)) {
        reportEvent(rid, 'confirmMismatch', { message: text });
        return false;
      }
      reportEvent(rid, 'confirmFired', { message: text });
      return true;
    };
    armTimer = setTimeout(function () {
      if (!armed || armRequestId !== requestId) return;
      var rid = armRequestId;
      disarm();
      reportEvent(rid, 'timeout', {});
    }, timeoutMs || 2500);
  }

  window.addEventListener('fas-vinted-bridge-request', function (evt) {
    var detail = (evt && evt.detail) || {};
    if (detail.action === 'armConfirmOverride') {
      // F3: page-supplied value -- clamp to (0, MAX_ARM_MS] so the armed window can never be
      // stretched open by a caller; non-numeric/invalid values fall back to the 2500ms default.
      var reqMs = Number(detail.payload && detail.payload.timeoutMs);
      var timeoutMs = (isFinite(reqMs) && reqMs > 0) ? Math.min(reqMs, MAX_ARM_MS) : 2500;
      armConfirmOverride(detail.requestId, timeoutMs);
      // Respond immediately once the override is installed, so the isolated-world caller knows
      // it is safe to click only after this confirms armed -- never before.
      window.dispatchEvent(new CustomEvent('fas-vinted-bridge-response', {
        detail: { requestId: detail.requestId, result: { ok: true, armed: true } }
      }));
      return;
    }
    if (detail.action === 'disarm') {
      // Explicit early-disarm request (e.g. the isolated side gave up before clicking) -- lets a
      // caller cancel an armed window early instead of waiting out the full timeout.
      if (armRequestId === detail.requestId) disarm();
      window.dispatchEvent(new CustomEvent('fas-vinted-bridge-response', {
        detail: { requestId: detail.requestId, result: { ok: true, disarmed: true } }
      }));
      return;
    }
    window.dispatchEvent(new CustomEvent('fas-vinted-bridge-response', {
      detail: { requestId: detail.requestId, result: { ok: false, error: 'unknown-action: ' + detail.action } }
    }));
  });
})();
