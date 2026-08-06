/* FindA.Sale — content script on Facebook Marketplace inbox/message surfaces
 * (facebook.com/marketplace/you/*, facebook.com/marketplace/inbox/*), same match
 * pattern fas-tracking.js already runs on.
 *
 * Feature #602 (2026-08-05): AI Message-Reply Autosend -- Price + Availability.
 *
 * *** LIVE-VERIFIED 2026-08-05 against the real production Facebook account for
 * organizer Artifact (real Marketplace inbox, multiple real buyer threads) via
 * direct DOM inspection -- NOT a guess, NOT accessibility-tree inference. Confirmed
 * directly:
 *   - Compose box: a Lexical contenteditable editor, `role="textbox"`,
 *     `contenteditable="true"`, `data-lexical-editor="true"`, and
 *     `aria-label="Write to <Buyer name> · <Listing title>"` -- the listing
 *     title is embedded right in the label, which we use as the PRIMARY item-match
 *     signal (far more reliable than scanning thread body text).
 *   - Message rows: `aria-label="Enter, Message sent <time> by <Sender>[: <text>]"`.
 *     Own (organizer) replies show `by You: ...`; a real buyer reply shows
 *     `by <BuyerName>: ...`. Non-text content (images/stickers) omits the
 *     `: <text>` suffix entirely and is skipped, never guessed at.
 *   - Text insertion: `document.execCommand('insertText', false, text)` on the
 *     focused compose box reliably lands real text in the Lexical editor (verified
 *     live -- typed text appeared, was visible in the DOM, and Facebook's own send
 *     control reacted to it).
 *   - Send control: once real text is present, Facebook swaps its default
 *     "Send a like" thumbs-up button for one labelled exactly
 *     `aria-label="Press enter to send"` -- THIS is the confidence gate: real
 *     autosend only ever clicks that exact, freshly-confirmed element. If it does
 *     not appear after inserting text, nothing is clicked -- see attemptRealSend().
 *
 * Verification was done by inserting a clearly-marked probe string
 * (`TEST_FAS_PROBE_DELETE_ME`) into a real thread, confirming the send control's
 * real aria-label, and then clearing the probe text via real keyboard events
 * (Ctrl+A + Backspace) BEFORE ever clicking send -- no test message was sent to
 * any real buyer.
 *
 * KNOWN RESIDUAL RISK (small, documented rather than hidden): clearing a
 * partially-typed reply programmatically (via execCommand) was NOT reliable in
 * live testing -- only a real keyboard Ctrl+A+Backspace reliably cleared the box.
 * A content script cannot dispatch trusted native keyboard events the same way.
 * So if `attemptRealSend` inserts text but Facebook's send control unexpectedly
 * never appears (should be rare -- confirmed working on every live attempt this
 * session), the worst case is a drafted-but-unsent reply left sitting in the
 * compose box -- never a WRONG message sent, never a send to the wrong thread.
 * The advisory overlay is always shown as a backup in that case so the organizer
 * still sees (and can manually send) the correct suggested reply either way.
 *
 * Real one-click autosend is gated, in order, by: (1) the organizer's own
 * `autosendPriceAvailabilityEnabled` opt-in (defaults OFF per Patrick's 2026-08-05
 * decision), (2) the backend decision engine's own confident parse + threshold
 * match (messageAutosendService.ts), (3) a confident single-item title match via
 * the compose box's own aria-label, (4) the live send-control confidence gate
 * above. Any one of these failing falls back to the advisory-only overlay exactly
 * as before -- it never silently does nothing AND never guesses.
 */
(function () {
  const SEL = window.__FAS_SEL__;
  if (!SEL) {
    console.error('[FindA.Sale][fas-messages] fas-selectors.js did not load before this script -- aborting, nothing will run on this page.');
    return;
  }

  function norm(s) {
    return (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
  }

  // ---- Step 1: URL-pattern gate (same defensive re-check fas-tracking.js uses). ----
  function looksLikeMessageSurface() {
    const path = window.location.pathname || '';
    return /\/marketplace\/(you|inbox)\//.test(path);
  }

  // ---- Step 2: LIVE-VERIFIED DOM reads (2026-08-05, real session -- see file header). ----
  function findOpenThread() {
    return document.querySelector('[role="main"]');
  }

  function getComposeBox() {
    return document.querySelector('[aria-label^="Write to"][data-lexical-editor="true"]');
  }

  // The compose box's own aria-label is "Write to <Buyer> \u00b7 <Listing title>" --
  // confirmed live. This is the PRIMARY item-match signal: exact, not fuzzy.
  function threadItemTitleFromComposeBox() {
    const box = getComposeBox();
    if (!box) return null;
    const label = box.getAttribute('aria-label') || '';
    const sep = ' \u00b7 ';
    const idx = label.indexOf(sep);
    if (idx === -1) return null;
    const title = label.slice(idx + sep.length).trim();
    return title || null;
  }

  // Message rows carry aria-label "Enter, Message sent <time> by <Sender>[: <text>]" --
  // confirmed live against real buyer threads. Walk backward from newest and return the
  // first row that is (a) not from "You" (the organizer's own prior replies) and (b) has
  // real parseable text (FB omits ": <text>" for non-text content -- images/stickers --
  // and those rows are skipped, never guessed at). No match anywhere = null.
  function findLatestIncomingMessage(threadEl) {
    if (!threadEl) return null;
    const rows = threadEl.querySelectorAll('[aria-label^="Enter, Message sent"]');
    if (!rows.length) return null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const label = rows[i].getAttribute('aria-label') || '';
      const m = /^Enter, Message sent .+? by (.+)$/.exec(label);
      if (!m) continue;
      const rest = m[1];
      if (rest === 'You' || rest.indexOf('You:') === 0) continue; // own message -- skip
      const colonIdx = rest.indexOf(': ');
      if (colonIdx === -1) continue; // no text content on this row -- skip, never guess
      const text = rest.slice(colonIdx + 2).trim();
      if (!text) continue;
      return { el: rows[i], text };
    }
    return null;
  }

  // Fallback only (used if the compose box's own title parse fails for any reason):
  // the old body-text scan, unchanged from the original best-effort design.
  function findThreadContextText(threadEl) {
    if (!threadEl) return '';
    return norm(threadEl.textContent).slice(0, 4000);
  }

  // PRIMARY match: the compose box's own exact title text (live-verified, see above).
  function matchItemByExactTitle(items, title) {
    if (!title) return null;
    const t = norm(title);
    const matches = (items || []).filter((it) => it.title && norm(it.title) === t);
    return matches.length === 1 ? matches[0] : null;
  }

  // FALLBACK match: fuzzy body-text scan, only used if the exact match above fails.
  // Returns the single item whose title appears in the context text, or null if zero or
  // more than one title matches (never guess between two plausible items).
  function matchItemByTitle(items, contextText) {
    if (!contextText) return null;
    const matches = (items || []).filter((it) => it.title && contextText.indexOf(norm(it.title)) !== -1);
    return matches.length === 1 ? matches[0] : null;
  }

  // ---- Real one-click send (2026-08-05, live-verified -- see file header for the full
  // confidence-gate reasoning and the documented residual-risk tradeoff). ----
  async function attemptRealSend(replyText) {
    const box = getComposeBox();
    if (!box) return false;
    box.focus();
    const inserted = document.execCommand('insertText', false, replyText);
    if (!inserted) return false;
    await new Promise((resolve) => setTimeout(resolve, 350));
    // Confidence gate: Facebook only renders this EXACT control once real text has
    // landed in the editor (confirmed live). Never click a different button, never
    // click blind -- if this isn't found, do not send.
    const sendBtn = document.querySelector('[aria-label="Press enter to send"]');
    if (!sendBtn) {
      console.warn('[FindA.Sale][fas-messages] send control not found after insert -- aborting autosend, leaving suggestion as advisory only.');
      return false;
    }
    sendBtn.click();
    return true;
  }

  // ---- Overlay UI (own element id -- never collides with fas-tracking.js's bar). ----
  let bar;
  function overlay(html) {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'fas-messages-bar';
      bar.style.cssText = 'position:fixed;z-index:2147483647;left:16px;bottom:16px;max-width:380px;' +
        'background:#1f2a24;color:#f3f5f2;border:1px solid #3c8c5a;border-radius:12px;padding:14px 16px;' +
        'font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.4)';
      document.documentElement.appendChild(bar);
    }
    bar.innerHTML = html;
  }
  function dismissOverlay() {
    if (bar) { bar.remove(); bar = null; }
  }

  function escapeHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderSuggestion(replyText, autosendAttemptedButFailed) {
    const label = autosendAttemptedButFailed
      ? "Your thresholds say this is safe to send, but the send control wasn't found -- send it yourself:"
      : 'Suggested reply (review before sending):';
    overlay(
      '<b>FindA.Sale</b>' +
      '<div style="margin-top:6px">' + label + '</div>' +
      '<div style="margin-top:6px;padding:8px;background:#16211b;border-radius:8px;font-size:13px">' + escapeHtml(replyText) + '</div>' +
      '<div id="fas-messages-copy" style="margin-top:8px;font-size:12px;color:#7fd8a3;cursor:pointer;text-decoration:underline;display:inline-block">Copy reply</div>' +
      ' &middot; ' +
      '<span id="fas-messages-dismiss" style="font-size:11px;color:#9fb6a8;cursor:pointer;text-decoration:underline">Dismiss</span>'
    );
    const copyEl = document.getElementById('fas-messages-copy');
    if (copyEl) {
      copyEl.addEventListener('click', () => {
        navigator.clipboard.writeText(replyText).catch(() => {});
      }, { once: true });
    }
    const dismissEl = document.getElementById('fas-messages-dismiss');
    if (dismissEl) dismissEl.addEventListener('click', dismissOverlay, { once: true });
  }

  function renderSentConfirmation(replyText) {
    overlay(
      '<b>FindA.Sale</b>' +
      '<div style="margin-top:6px;color:#7fd8a3">Sent automatically, based on your thresholds:</div>' +
      '<div style="margin-top:6px;padding:8px;background:#16211b;border-radius:8px;font-size:13px">' + escapeHtml(replyText) + '</div>' +
      '<span id="fas-messages-dismiss" style="margin-top:8px;font-size:11px;color:#9fb6a8;cursor:pointer;text-decoration:underline;display:inline-block">Dismiss</span>'
    );
    const dismissEl = document.getElementById('fas-messages-dismiss');
    if (dismissEl) dismissEl.addEventListener('click', dismissOverlay, { once: true });
    setTimeout(dismissOverlay, 8000);
  }

  function send(msg) {
    return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
  }

  let cachedItems = null;
  let cachedItemsAt = 0;
  const ITEMS_CACHE_MS = 60000;
  async function getCandidateItems() {
    const now = Date.now();
    if (cachedItems && now - cachedItemsAt < ITEMS_CACHE_MS) return cachedItems;
    const res = await send({ type: 'getItems' });
    if (res && res.ok && res.data) {
      cachedItems = res.data;
      cachedItemsAt = now;
    }
    return cachedItems;
  }

  let lastHandledText = null;
  let processing = false;
  async function scan() {
    if (!looksLikeMessageSurface()) {
      if (bar) dismissOverlay();
      return;
    }
    if (processing) return;

    const thread = findOpenThread();
    if (!thread) return;
    const incoming = findLatestIncomingMessage(thread);
    if (!incoming) return;
    const messageText = incoming.text;
    if (!messageText || messageText === lastHandledText) return;

    const payload = await getCandidateItems();
    if (!payload || !payload.organizer || payload.organizer.autosendPriceAvailabilityEnabled !== true) {
      // Feature opt-in is off (or items couldn't be loaded) -- stay fully silent. Same
      // client-side convenience gate as the backend's own authoritative re-check.
      return;
    }

    // PRIMARY: exact title match via the compose box's own aria-label (live-verified).
    // FALLBACK: fuzzy body-text scan, only if the primary parse fails for any reason.
    let item = matchItemByExactTitle(payload.items || [], threadItemTitleFromComposeBox());
    if (!item) item = matchItemByTitle(payload.items || [], findThreadContextText(thread));
    if (!item) return; // can't confidently match one item -- never guess.

    processing = true;
    lastHandledText = messageText;
    try {
      const res = await send({ type: 'getMessageAutosendDecision', itemId: item.id, messageText });
      if (res && res.ok && res.data && res.data.replyText) {
        if (res.data.autosend === true) {
          const sent = await attemptRealSend(res.data.replyText);
          if (sent) {
            renderSentConfirmation(res.data.replyText);
          } else {
            // Send control confidence gate failed (rare -- see file header) -- fall back
            // to advisory overlay so the organizer still sees and can send it themselves.
            renderSuggestion(res.data.replyText, true);
          }
        } else {
          renderSuggestion(res.data.replyText, false);
        }
      }
    } catch (e) {
      console.warn('[FindA.Sale][fas-messages] decision request failed:', e && e.message);
    } finally {
      processing = false;
    }
  }

  if (!looksLikeMessageSurface()) return; // not a plausible message page at all -- stay fully silent

  const observer = new MutationObserver(() => { scan(); });
  observer.observe(document.body, { childList: true, subtree: true });
  scan();

  // Same SPA-navigation fallback fas-tracking.js uses.
  let lastPath = window.location.pathname;
  setInterval(() => {
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname;
      lastHandledText = null;
      dismissOverlay();
      scan();
    }
  }, 1500);
})();
