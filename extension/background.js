/* FindA.Sale extension — background service worker.
 * Roles: (1) read the organizer's finda.sale auth cookie and call the API with a
 * Bearer token; (2) fetch item photos cross-origin (Cloudinary + eBay hosts) and
 * hand them to the content script as data URLs; (3) hold the listing queue.
 */
importScripts('config.js');
const CFG = self.FAS_CONFIG;

// (2026-08-09, ADR-100) The "you/selling" management tab now lands directly on Facebook's own
// OUT_OF_STOCK status filter instead of the bare unfiltered grid -- fas-remove.js's sold-
// detection scan runs against this small, pre-filtered view (confirmed live it exists and
// works), so opening it here means the common case (silent poll, or organizer's own click)
// needs no extra in-tab navigation before the scan can run. See fas-remove.js's matching
// SOLD_STATUS_FILTER_URL constant and start() -- both must point at the same URL.
const FAS_YOU_SELLING_SOLD_FILTER_URL = 'https://www.facebook.com/marketplace/you/selling/?referral_surface=seller_hub&status[0]=OUT_OF_STOCK';

async function getToken() {
  const cookie = await chrome.cookies.get({ url: CFG.COOKIE_URL, name: CFG.COOKIE_NAME });
  return cookie ? cookie.value : null;
}

// ADR-088: obtain a fresh access token when a Bearer call 401s. Reads the HttpOnly
// refreshToken cookie VALUE (the chrome.cookies API can read HttpOnly values;
// document.cookie cannot) and sends it in an explicit X-Refresh-Token header to the
// existing /auth/refresh, which accepts it as a fallback behind the cookie. A RAW fetch
// is used (NOT apiFetch) so a refresh can never recurse into another refresh.
// SECURITY (ADR-088 §4): the refresh-token value must live ONLY inside this service
// worker for the duration of this call — it is NEVER put in a sendMessage/sendResponse
// payload, chrome.storage, the page DOM, or console.*. Returns the fresh ACCESS token
// from the response body (data.token) — never the refresh token.
async function refreshAccessToken() {
  const cookie = await chrome.cookies.get({ url: CFG.COOKIE_URL, name: CFG.REFRESH_COOKIE_NAME });
  if (!cookie || !cookie.value) return null;
  try {
    const res = await fetch(CFG.API_BASE + '/auth/refresh', {
      method: 'POST',
      headers: { 'X-Refresh-Token': cookie.value }
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data && data.token ? data.token : null;
  } catch (e) {
    return null;
  }
}

async function apiFetch(path, opts = {}, _retried = false, _token = null) {
  let token = _token || await getToken();
  // (2026-08-09 fix, ADR-100 root-cause finding) The 1h accessToken is routinely already
  // EXPIRED (and purged from the cookie store entirely -- Chrome doesn't return expired
  // cookies) by the time an unattended call fires, especially the 24h renewal alarm. The
  // refresh-on-401 retry below only ever handled "cookie present, server rejected it" --
  // it never ran for "cookie already gone", which just fell straight through to the
  // not_signed_in return with no refresh attempt at all. Confirmed live 2026-08-09: three
  // real renewal clicks (Celestion, Star Raiders, Yamaha F-325) all showed a successful
  // "Renewed" toast on Facebook's side while this exact gap silently discarded the
  // corresponding markListed call every time -- renewDueAt never actually advanced for any
  // of them. Mirrors the existing _retried-guarded refresh pattern below, just entered from
  // the missing-cookie path instead of the live-401 path.
  if (!token && !_retried) {
    const fresh = await refreshAccessToken();
    if (fresh) return apiFetch(path, opts, true, fresh);
  }
  if (!token) return { ok: false, status: 401, error: 'not_signed_in' };
  const res = await fetch(CFG.API_BASE + path, {
    method: opts.method || 'GET',
    headers: Object.assign(
      { 'Authorization': 'Bearer ' + token },
      opts.body ? { 'Content-Type': 'application/json' } : {}
    ),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  // ADR-088: the 1h accessToken routinely expires mid-flow (multi-minute FB publish,
  // ~20-min removal alarm), silently 401-ing /listed & /removed so no
  // MarketplaceListingJob row is written. On a Bearer 401, refresh ONCE and retry the
  // original request ONCE with the fresh token passed directly (not relying on
  // cookie-jar propagation timing). _retried guarantees at most one refresh + one retry;
  // a second 401 falls through and returns the failure — no loop.
  if (res.status === 401 && !_retried) {
    const fresh = await refreshAccessToken();
    if (fresh) return apiFetch(path, opts, true, fresh);
  }
  let data = null;
  try { data = await res.json(); } catch (e) {}
  return { ok: res.ok, status: res.status, data, error: res.ok ? null : (data && data.message) || 'request_failed' };
}

// Fetch one image and return a data URL (base64). Runs in the worker so cross-origin
// image hosts (Cloudinary, i.ebayimg.com) are reachable via host_permissions.
async function fetchImageDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('img ' + res.status);
  const blob = await res.blob();
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  const type = blob.type || 'image/jpeg';
  return 'data:' + type + ';base64,' + b64;
}

// ---- Cross-channel auto-removal (ADR-084 amendment 2026-07-15, Part C) ----
// Facebook has no API to withdraw a listing server-side the way endEbayListingIfExists() calls
// eBay directly -- this polls GET /extension/pending-removals on a recurring alarm instead, and
// either notifies the organizer (default) or opens a background tab to remove sold items itself,
// per the fasAutoRemoveMode setting ('notify' | 'silent' | 'off', default 'notify').
const FAS_REMOVAL_ALARM = 'fasCheckRemovals';

async function ensureRemovalAlarm() {
  const { fasAutoRemoveMode = 'notify' } = await chrome.storage.local.get(['fasAutoRemoveMode']);
  if (fasAutoRemoveMode === 'off') { chrome.alarms.clear(FAS_REMOVAL_ALARM); return; }
  // Creating an alarm with an existing name CANCELS+REPLACES it, resetting the 20-min
  // countdown. onInstalled/onStartup fire on every reload, so unconditionally recreating meant
  // frequent dev/QA reloads kept resetting the timer and the alarm rarely reached 20 min.
  // Only create when it doesn't already exist so the steady-state countdown is preserved.
  const existing = await chrome.alarms.get(FAS_REMOVAL_ALARM);
  if (!existing) chrome.alarms.create(FAS_REMOVAL_ALARM, { periodInMinutes: 20 });
}
// Ensure the alarm AND run one immediate (throttled) check so a freshly-loaded worker doesn't
// wait up to 20 min for its first poll. throttledCheckPendingRemovals internally no-ops when
// mode === 'off', so this is safe regardless of the current setting.
async function ensureRemovalAlarmAndCheck() {
  await ensureRemovalAlarm();
  await throttledCheckPendingRemovals();
}
chrome.runtime.onInstalled.addListener(ensureRemovalAlarmAndCheck);
chrome.runtime.onStartup.addListener(ensureRemovalAlarmAndCheck);

// ---- Auto-publish reporting reliability net (S-EXT-AUTOPUBLISH-REPORTING-NET, 2026-08-22) ----
// DB-CONFIRMED INCIDENT (queried production this session, not guessed): a Poshmark item had TWO
// real, distinct, live Poshmark listing IDs (a confirmed duplicate-publish incident, separately
// mitigated) yet the MarketplaceListingJob table had ZERO Poshmark rows for it at all -- meaning
// markListed was never successfully reported to the server despite genuinely successful publishes.
// Root cause (plausible, not 100% proven without live instrumentation of the content script's own
// execution context): fas-poshmark.js's doPoshmarkAutoPublish calls markListed+advanceQueue
// immediately after detecting a successful publish (the sell-form disappearing from the DOM) --
// but both confirmed duplicate listings ended up on real /listing/<id> URLs, and if Poshmark's
// real post-publish behavior is a hard navigation (full page load) rather than a client-side
// route change, the content script's execution context is destroyed at that exact moment, and the
// async continuation (markListed, advanceQueue) may simply never run. A service worker isn't tied
// to any one tab's navigation lifecycle, so it can catch this independently of whether the content
// script survives. This is a reliability NET, not a replacement -- each content script's own
// existing fast-path markListed/advanceQueue calls stay in place; this only catches the case where
// that fast path never got the chance to fire. Both sides being idempotent (markListed's own
// "most-recent-row-wins" pattern server-side; the reportKey guard below) makes double-firing safe.
const FAS_AUTOPUBLISH_LISTING_URL_PATTERNS = {
  POSHMARK: /poshmark\.com\/listing\//i,
  // UNVERIFIED -- Mercari's and Grailed's real post-publish redirect URL shape have not been
  // confirmed live (no equivalent duplicate-listing incident has surfaced their exact pattern
  // yet). Best-effort guesses based on each site's general listing-detail URL convention; if
  // these never match in practice, this net simply never fires for that platform and each
  // content script's own existing fast-path reporting remains the only path (same as before this
  // fix existed) -- not a regression, just an unconfirmed enhancement.
  MERCARI: /mercari\.com\/item\//i,
  GRAILED: /grailed\.com\/listings\//i,
  // LIVE-CONFIRMED (2026-08-28, Patrick's real 4-marketplace re-test, S-EXT-AUTOPUBLISH-STALL-FLEET
  // follow-up): fas-craigslist.js's own in-page continuation (doPreviewStep -> waitForCraigslistPublish
  // -> markListed/advanceCraigslistQueue/location.href=POST_URL) never runs after a REAL publish --
  // Craigslist's publish click causes a genuine full-page navigation to its own "Thanks for posting!"
  // confirmation page (Patrick's screenshot: kalamazoo.craigslist.org/atq/d/paw-paw-star-wars-electronic-talking/7956743525.html),
  // which destroys the old page's JS execution context mid-poll -- the exact same failure class this
  // reliability net was built for (see the 2026-08-22 header comment above), except Craigslist has NO
  // fallback at all today (not even in FAS_AUTOPUBLISH_QUEUE_KEYS below) since it predates this net.
  // Worse than Poshmark/Mercari/Grailed: the confirmation page lives on the CONNECTED-account regional
  // subdomain (<region>.craigslist.org), not post.craigslist.org, so fas-craigslist.js's content script
  // (manifest-scoped to post.craigslist.org/* only) cannot even run there to self-heal via detectStep().
  // chrome.tabs.onUpdated fires regardless of content-script injection permissions, so this background
  // net is the ONLY place that can observe this transition at all -- see the CRAIGSLIST-specific
  // re-navigation branch below, which the other 3 platforms don't need (their own SPA-style publish
  // doesn't destroy the JS context, so their content scripts drive their own next-item navigation).
  CRAIGSLIST: /craigslist\.org\/[a-z]{2,8}\/d\/[^/]+\/\d+\.html/i,
};
const FAS_AUTOPUBLISH_QUEUE_KEYS = {
  // tabId (S-EXT-AUTOPUBLISH-TAB-SCOPE, round 8): the tab actually driving each platform's queue,
  // recorded at queue-creation time -- see setPoshmarkQueue/setMercariQueue/setCraigslistQueue/
  // setGrailedQueue/reopenGrailedTab/autoRenewDueItems below. Used by the chrome.tabs.onUpdated
  // listener below to scope itself to that one tab instead of reacting to ANY tab in the browser.
  POSHMARK: { queue: 'fasPoshmarkQueue', index: 'fasPoshmarkIndex', autoPublish: 'fasPoshmarkAutoPublish', tabId: 'fasPoshmarkQueueTabId' },
  MERCARI: { queue: 'fasMercariQueue', index: 'fasMercariIndex', autoPublish: 'fasMercariAutoPublish', tabId: 'fasMercariQueueTabId' },
  GRAILED: { queue: 'fasGrailedQueue', index: 'fasGrailedIndex', autoPublish: 'fasGrailedAutoPublish', tabId: 'fasGrailedQueueTabId' },
  CRAIGSLIST: { queue: 'fasCraigslistQueue', index: 'fasCraigslistIndex', autoPublish: 'fasCraigslistAutoPublish', tabId: 'fasCraigslistQueueTabId' },
};
// Craigslist-only: post.craigslist.org, matches fas-craigslist.js's own POST_URL constant. Used to
// resume the queue loop from background.js since Craigslist's own content script can't do it itself
// once the browser has navigated to the (out-of-scope-for-injection) regional confirmation page.
const FAS_CRAIGSLIST_POST_URL = 'https://post.craigslist.org/';
// ---- Shared item+platform "listed" report dedup (S-EXT-AUTOPUBLISH-DEDUP fix, 2026-08-29) ----
// Two independent paths can each believe they are the one reporting a given item as listed for a
// given platform: (a) a content script's own fast-path 'markListed' message (handled below), and
// (b) this file's own chrome.tabs.onUpdated reliability net (below). The net's existing
// fasAutoPublishReportedKey guard only protects the net from firing twice on ITSELF -- it has zero
// visibility into whether a content script's own direct message already reported the same item.
// This shared guard closes that gap: whichever path reports a given item+platform FIRST wins:
// apiFetch actually runs; the other path is a no-op success. Uses chrome.storage.local (not an
// in-memory Set/Map) because an MV3 service worker can be killed and restarted mid-race -- an
// in-memory guard would not survive that. Keyed by platform+itemId (not index -- the point is
// catching the SAME item reported twice even if the two callers disagree about its index). A short
// TTL comfortably covers the realistic window between "content script's fast path fires" and "the
// onUpdated net independently fires for the same navigation" without entries accumulating forever.
const FAS_LISTED_REPORT_DEDUP_TTL_MS = 2 * 60 * 1000;
async function reportItemListedOnce(itemId, platform, remoteListingId) {
  const key = platform + ':' + itemId;
  const now = Date.now();
  const { fasListedReportDedup = {} } = await chrome.storage.local.get(['fasListedReportDedup']);
  // Prune stale entries on every check so this object never grows unbounded across a long session.
  const pruned = {};
  for (const k of Object.keys(fasListedReportDedup)) {
    if (now - fasListedReportDedup[k] < FAS_LISTED_REPORT_DEDUP_TTL_MS) pruned[k] = fasListedReportDedup[k];
  }
  if (pruned[key] != null) {
    // Some other path already reported this exact item+platform within the window -- treat as a
    // successful no-op. Never call apiFetch a second time for the same real publish event.
    await chrome.storage.local.set({ fasListedReportDedup: pruned });
    return { ok: true, deduped: true };
  }
  pruned[key] = now;
  await chrome.storage.local.set({ fasListedReportDedup: pruned });
  try {
    return await apiFetch('/extension/items/' + encodeURIComponent(itemId) + '/listed',
      { method: 'POST', body: { remoteListingId: remoteListingId || null, platform } });
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'threw' };
  }
}
// Registered at top level (not inside a message handler) so it survives MV3 service worker
// restarts -- Chrome re-runs this whole script on wake and re-registers top-level listeners
// automatically, the same way the existing onInstalled/onStartup listeners below do.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return; // only act on an actual URL change, not every tab-update event
  (async () => {
    for (const platform of Object.keys(FAS_AUTOPUBLISH_LISTING_URL_PATTERNS)) {
      if (!FAS_AUTOPUBLISH_LISTING_URL_PATTERNS[platform].test(changeInfo.url)) continue;
      const keys = FAS_AUTOPUBLISH_QUEUE_KEYS[platform];
      const st = await chrome.storage.local.get([keys.queue, keys.index, keys.autoPublish, keys.tabId, 'fasAutoPublishReportedKey']);
      const queue = st[keys.queue] || [];
      const index = st[keys.index] || 0;
      if (!st[keys.autoPublish] || !queue.length || index >= queue.length) continue; // no active auto-publish run for this platform
      // FIX (S-EXT-AUTOPUBLISH-TAB-SCOPE, round 8): this listener used to treat ANY tab in the
      // browser navigating to a URL matching the platform pattern as a real signal -- it never
      // checked that the navigating tab was actually the one running this platform's auto-publish
      // queue. DB-CONFIRMED live incident (queried production this session): 3 real Poshmark
      // MarketplaceListingJob rows (POST/POSTED, remoteListingId: null -- this net's signature) for
      // "Mugig" and "Sound King", items Patrick confirmed were NEVER actually published on the real
      // Poshmark site. With many tabs open across Poshmark/Mercari/Vinted/Craigslist/a popup and a
      // stale fasPoshmarkAutoPublish flag left set from an earlier run, an unrelated, already-open
      // Poshmark listing tab navigating to any /listing/ URL was enough to falsely mark whatever
      // item was currently at the front of the Poshmark queue as posted. Now requires the
      // navigating tab to match the tab that actually opened/is driving this platform's queue
      // (recorded once at queue-creation time, updated again on Grailed's per-item tab reopen) --
      // any other tab's navigation is ignored regardless of how well the URL matches.
      const queueTabId = keys.tabId ? st[keys.tabId] : null;
      if (queueTabId == null || tabId !== queueTabId) continue;
      const item = queue[index];
      if (!item || !item.id) continue;
      // Idempotency guard: the content script's own fast-path may have already reported (and
      // advanced the queue) before this listener even runs -- re-check queue.length/index just
      // read above already covers "already advanced past this item", and this key guards against
      // this listener itself firing twice for the same item (e.g. two tab-update events in a row
      // matching the pattern before storage catches up).
      const reportKey = platform + ':' + item.id + ':' + index;
      if (st.fasAutoPublishReportedKey === reportKey) continue;
      await chrome.storage.local.set({ fasAutoPublishReportedKey: reportKey });
      // FIX (S-EXT-AUTOPUBLISH-DEDUP): routed through the shared reportItemListedOnce() guard
      // above instead of calling apiFetch directly, so this net and a content script's own
      // fast-path report can never both actually hit the backend for the same item+platform.
      const resp = await reportItemListedOnce(item.id, platform, null);
      if (!resp.ok && !resp.deduped) console.log('[FAS autopublish-reporting-net markListed FAILED]', JSON.stringify({ itemId: item.id, platform, resp }));
      // Re-read the index right before advancing -- if the content script's own fast-path already
      // advanced it between our read above and now, advancing again here would skip an item.
      const fresh = await chrome.storage.local.get([keys.index]);
      let didAdvanceHere = false;
      if ((fresh[keys.index] || 0) === index) {
        await chrome.storage.local.set({ [keys.index]: index + 1 });
        didAdvanceHere = true;
      }
      // CRAIGSLIST-only continuation (2026-08-28, see header comment above for why): the other 3
      // platforms' own content scripts drive their own next-item navigation via location.href once
      // their SPA-style publish resolves in-place. Craigslist's publish is a hard navigation to a
      // page this extension can't inject into, so nothing else will ever send this tab back to
      // POST_URL -- if we don't do it here, the queue is permanently stuck even though the index
      // above just correctly advanced. Only fire once per item: guarded by didAdvanceHere (skip if
      // the content script's fast path already handled navigation itself, e.g. a future fix lands
      // there too) and by there being a next item to actually resume for.
      if (platform === 'CRAIGSLIST' && didAdvanceHere && (index + 1) < queue.length) {
        await new Promise((r) => setTimeout(r, 700)); // let Craigslist's own confirmation page settle
        // BUG FIX (2026-08-30, S-EXT-CRAIGSLIST-RATE-LIMIT, Patrick live report -- hit Craigslist's
        // own "You are posting too rapidly. Craig can't type them in this fast." page mid-run):
        // this branch is the ONLY thing that actually advances a real Craigslist run in production
        // (see the header comment above -- fas-craigslist.js's own in-page continuation never
        // survives Craigslist's real cross-origin publish navigation) -- but it was re-navigating
        // straight back to POST_URL after only the 700ms settle-pause above, with NO pacing at all.
        // Every OTHER platform's queue-advance goes through humanQueueDelay() (10-25s randomized
        // pacing, S-EXT-QUEUE-PACING) before advancing; Craigslist was silently skipping it entirely
        // on the path that actually runs, so real multi-item Craigslist runs were posting roughly
        // 700ms+processing-time apart -- exactly the kind of rapid-fire pattern Craigslist's own
        // anti-spam throttle exists to catch. This was FindA.Sale's own extension causing the
        // rate-limit, not an unrelated Craigslist-side coincidence. Fix: apply the same
        // humanQueueDelay() every other platform already gets, right before the re-navigation --
        // does not change the 700ms settle-pause above (a separate, shorter DOM-render concern).
        // 2026-08-31: batch-cooldown check -- (index + 1) is the item we're about to resume on.
        const clBatchBoundary1 = craigslistIsBatchBoundary(index + 1);
        await craigslistDelayWithOverlay(
          tabId,
          clBatchBoundary1 ? CRAIGSLIST_BATCH_COOLDOWN_MS : CRAIGSLIST_QUEUE_ADVANCE_DELAY_MS,
          clBatchBoundary1
        ); // 2026-08-31: was humanQueueDelay() -- see injectCraigslistCountdownOverlay comment above for why sendMessage never worked here
        chrome.tabs.update(tabId, { url: FAS_CRAIGSLIST_POST_URL }, () => {
          // DIAGNOSTIC (2026-08-29, S-EXT-CRAIGSLIST-STALL round 3): this used to be
          // `void chrome.runtime.lastError` -- read-then-discarded, so a failed re-navigation
          // (closed tab, wrong tabId, permission issue, etc.) was completely invisible. If this
          // call fails, the tab is left stranded on Craigslist's own confirmation page (which
          // fas-craigslist.js cannot inject into -- manifest-scoped to post.craigslist.org/*
          // and www.craigslist.org/account* only) with no toast, no error, nothing. Now logged
          // so a live console watch can immediately tell re-navigation failure (this branch)
          // apart from the re-navigation succeeding but landing on Craigslist's own unavoidable
          // "choose your posting area" step, which requires a human click by design (see
          // fas-craigslist.js's run()/detectStep() fallback comment).
          if (chrome.runtime.lastError) {
            console.warn('[FAS Craigslist] re-navigation to POST_URL failed for tab', tabId, '-', chrome.runtime.lastError.message);
          }
        });
      }
    }
  })();
});

// ---- Silent-mode removal tab lifecycle (2026-07-16 fix) ----
// Silent ("Remove automatically") mode used to open the "Your listings" page in a HIDDEN
// background tab (active:false). Chrome throttles rendering in background tabs -- React
// animations / requestAnimationFrame pause -- so Facebook's multi-step "Did you sell this
// item?" survey modal never rendered/advanced within fas-remove.js's timeouts: the removal
// silently timed out and skipped (no POST /removed), the item stayed "pending removal", and the
// 20-min alarm opened ANOTHER background tab every cycle (tab-spam). Live proof it was the
// hidden tab: focusing the same tab let the survey complete and the REMOVE row landed. Fix:
// open the removal tab FOREGROUNDED so FB renders, remember the organizer's current tab, and
// once fas-remove.js signals the queue is done, restore that tab's focus and auto-close the
// removal tab so it doesn't clutter. silentRemovalInProgress() guards the alarm from opening a
// second tab while one is mid-run.
const FAS_REMOVAL_MAX_MS = 10 * 60 * 1000; // a run not finished in 10 min is treated as dead so removals never wedge forever

function tabsGet(tabId) {
  return new Promise((resolve) => chrome.tabs.get(tabId, (t) => { void chrome.runtime.lastError; resolve(t || null); }));
}

async function clearSilentRemovalState() {
  await chrome.storage.local.remove(['fasRemovalTabId', 'fasRemovalPrevTabId', 'fasRemovalStartedAt']);
}

// True only when a silent-mode removal tab is genuinely still open and recent. Self-heals:
// clears state and returns false if the organizer closed the tab or the run went stale, so the
// legitimate "next check" behavior resumes once a prior attempt actually finished.
async function silentRemovalInProgress() {
  const { fasRemovalTabId = null, fasRemovalStartedAt = 0 } =
    await chrome.storage.local.get(['fasRemovalTabId', 'fasRemovalStartedAt']);
  if (!fasRemovalTabId) return false;
  if (Date.now() - fasRemovalStartedAt > FAS_REMOVAL_MAX_MS) { await clearSilentRemovalState(); return false; }
  const tab = await tabsGet(fasRemovalTabId);
  if (!tab) { await clearSilentRemovalState(); return false; }
  return true;
}

async function openSilentRemovalTab() {
  // Remember the organizer's current tab so focus can be restored after the (brief) removal.
  const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const prevTabId = activeTabs && activeTabs[0] ? activeTabs[0].id : null;
  // TEST RESULT (2026-08-09, Patrick-confirmed live): flipped to active:false to test whether
  // renewal (click + toast detection) survives a genuinely hidden tab. It does NOT -- the tab
  // sat stuck and only completed the instant Patrick focused it, confirming realClick()'s
  // `await new Promise((r) => requestAnimationFrame(...))` preamble (fas-selectors.js) is the
  // same class of failure as the 2026-07-16 removal-survey-modal bug above, just via rAF
  // starvation instead of a stuck animated modal. Reverted to active:true, the proven-correct
  // setting for both the removal survey modal AND the renewal click. The sold-detection scan
  // (pure DOM read, no rAF dependency) was separately confirmed to work fine hidden -- but since
  // this one shared tab now also carries renewal, it must stay foregrounded regardless.
  const tab = await chrome.tabs.create({ url: FAS_YOU_SELLING_SOLD_FILTER_URL, active: true });
  await chrome.storage.local.set({ fasRemovalTabId: tab.id, fasRemovalPrevTabId: prevTabId, fasRemovalStartedAt: Date.now() });
}

// Called when fas-remove.js reports the removal queue is finished. Restores the organizer's
// previous tab focus, then closes the auto-opened removal tab. No-ops in notify mode (which
// never sets fasRemovalTabId), so it can never close a tab the organizer opened themselves.
async function finishSilentRemoval() {
  const { fasRemovalTabId = null, fasRemovalPrevTabId = null } =
    await chrome.storage.local.get(['fasRemovalTabId', 'fasRemovalPrevTabId']);
  await clearSilentRemovalState();
  if (fasRemovalPrevTabId != null) {
    await new Promise((resolve) => chrome.tabs.update(fasRemovalPrevTabId, { active: true }, () => { void chrome.runtime.lastError; resolve(); }));
  }
  if (fasRemovalTabId != null) {
    await new Promise((resolve) => chrome.tabs.remove(fasRemovalTabId, () => { void chrome.runtime.lastError; resolve(); }));
  }
}

// ---- Price-sync detection (ADR-086, Phase A -- 2026-07-18) ----
// Facebook has no API for a live price edit either (same gap as removal) -- this polls
// GET /extension/pending-updates on the SAME alarm tick as checkPendingRemovals (per the ADR's
// "fold into the existing ~20min poll cycle" decision, not a second poller). Phase A stops at
// detection: it notifies the organizer that N item(s) have drifted, but does NOT open a tab or
// attempt any edit -- Facebook's real edit-listing UI/selectors have not been live-verified via
// Chrome MCP yet (ADR-086 explicitly forbids guessing them), so there is no Phase B action to
// take yet. Phase B adds the actual edit action once that verification happens.
async function checkPendingUpdates() {
  // Gated by the SAME fasAutoRemoveMode setting as removal (ADR-086's "one combined toggle"
  // design) -- 'off' opts out of cross-channel FB sync entirely, both removal and price-sync
  // notifications. 'silent' has no Phase-A price-sync equivalent (no auto-edit action exists
  // yet to run silently), so both 'notify' and 'silent' behave identically here until Phase B.
  const { fasAutoRemoveMode = 'notify' } = await chrome.storage.local.get(['fasAutoRemoveMode']);
  if (fasAutoRemoveMode === 'off') return 'off';
  const resp = await apiFetch('/extension/pending-updates');
  if (!resp.ok) return 'error:' + (resp.error || resp.status);
  const items = (resp.data && resp.data.items) || [];
  if (!items.length) return 'no_items';

  // Phase A: notify only, matching the removal flow's 'notify' UX for a first-pass rollout --
  // no silent/auto-edit mode exists yet because there's no edit action built to run silently.
  chrome.notifications.create('fasPendingUpdates', {
    type: 'basic',
    iconUrl: 'icon128.png',
    title: 'FindA.Sale',
    message: items.length === 1
      ? '1 item\'s price changed on FindA.Sale -- update it on Facebook Marketplace too.'
      : items.length + ' items\' prices changed on FindA.Sale -- update them on Facebook Marketplace too.',
    priority: 1
  });
  return 'notified:' + items.length;
}

// (2026-07-26) Items the backend has given up retrying (see MAX_REMOVAL_SKIP_ATTEMPTS in
// extensionController.ts) come back separately as needsManualReview instead of items -- notify
// about them ONCE per distinct set, not every ~20-min cycle, so a permanently-unmatchable item
// degrades to "one notification, then quiet" instead of reproducing the exact same infinite-
// error-spam bug this whole fix is closing, just moved one level up.
async function notifyManualReviewIfNew(needsManualReview) {
  if (!needsManualReview || !needsManualReview.length) return;
  const ids = needsManualReview.map((i) => i.id).sort().join(',');
  const { fasLastNotifiedManualReviewIds = '' } = await chrome.storage.local.get(['fasLastNotifiedManualReviewIds']);
  if (ids === fasLastNotifiedManualReviewIds) return; // same stuck set as last time -- already told Patrick
  await chrome.storage.local.set({ fasLastNotifiedManualReviewIds: ids });
  chrome.notifications.create('fasNeedsManualReview', {
    type: 'basic',
    iconUrl: 'icon128.png',
    title: 'FindA.Sale',
    message: (needsManualReview.length === 1
      ? '1 sold item couldn\'t be auto-matched on Facebook after multiple tries'
      : needsManualReview.length + ' sold items couldn\'t be auto-matched on Facebook after multiple tries') +
      ' -- remove manually: ' + needsManualReview.map((i) => i.title).join(', '),
    priority: 1
  });
}

// ---- Cross-platform auto-remove-on-sale-elsewhere (S-EXT-CROSS-PLATFORM-AUTOREMOVE, 2026-08-22) ----
// Patrick, explicit directive: "it must be built for all of them, that's part of the extension."
// Extends the existing Facebook-only sold-elsewhere auto-removal (checkPendingRemovals/
// fas-remove.js) to Poshmark, Mercari, Vinted, Grailed, and Gumtree Australia. Facebook's own
// code path above is completely unchanged -- this is a parallel, additive mechanism.
//
// CRAIGSLIST SCOPE NOTE (why it is not included here -- flagged, not silently dropped): Craigslist
// has no persistent logged-in "my postings" page the way every other platform does -- postings
// are managed via a unique link emailed at post time. fas-remove.js's own renewal-scope comment
// already flagged this exact gap for renewal ("the account page's manage-postings links resisted
// a plain DOM query when checked live"). Automating removal would need that manage-link captured
// and stored per-item at POST time (fas-craigslist.js does not currently do this) -- a real
// data-model addition, not just a new DOM script. Needs a Patrick/Architect decision on whether to
// add that field before Craigslist can be included.
//
// CODE-ONLY / UNVERIFIED (consistent with how every other new-platform integration in this
// extension started, e.g. fas-poshmark.js's original file header): none of the 5 platforms below
// have had this removal flow confirmed against a real sold item yet (no sold inventory exists on
// any of them to test against as of this dispatch). Each platform's own removal content-script
// function is built defensively (single-confident-title-match only, never guesses which listing
// to remove, skips and reports rather than acting on ambiguity) -- but the actual DOM selectors
// for "find this listing" and "remove/delete it" on each platform's real management page are
// UNVERIFIED until tested live against a genuine sold item.
const FAS_PLATFORM_LABEL = {
  POSHMARK: 'Poshmark', MERCARI: 'Mercari', VINTED: 'Vinted', GRAILED: 'Grailed', GUMTREE_AU: 'Gumtree Australia',
  CRAIGSLIST: 'Craigslist',
};
const FAS_CROSS_PLATFORM_REMOVAL_CONFIG = {
  POSHMARK: { manageUrlKey: 'POSH_MANAGE_URL', queueKey: 'fasPoshmarkRemovalQueue', indexKey: 'fasPoshmarkRemovalIndex', tabIdKey: 'fasPoshmarkRemovalTabId', prevTabIdKey: 'fasPoshmarkRemovalPrevTabId', startedAtKey: 'fasPoshmarkRemovalStartedAt' },
  MERCARI: { manageUrlKey: 'MERC_MANAGE_URL', queueKey: 'fasMercariRemovalQueue', indexKey: 'fasMercariRemovalIndex', tabIdKey: 'fasMercariRemovalTabId', prevTabIdKey: 'fasMercariRemovalPrevTabId', startedAtKey: 'fasMercariRemovalStartedAt' },
  VINTED: { manageUrlKey: 'VINTED_MANAGE_URL', queueKey: 'fasVintedRemovalQueue', indexKey: 'fasVintedRemovalIndex', tabIdKey: 'fasVintedRemovalTabId', prevTabIdKey: 'fasVintedRemovalPrevTabId', startedAtKey: 'fasVintedRemovalStartedAt' },
  GRAILED: { manageUrlKey: 'GRAILED_MANAGE_URL', queueKey: 'fasGrailedRemovalQueue', indexKey: 'fasGrailedRemovalIndex', tabIdKey: 'fasGrailedRemovalTabId', prevTabIdKey: 'fasGrailedRemovalPrevTabId', startedAtKey: 'fasGrailedRemovalStartedAt' },
  GUMTREE_AU: { manageUrlKey: 'GUMTREE_AU_MANAGE_URL', queueKey: 'fasGumtreeAuRemovalQueue', indexKey: 'fasGumtreeAuRemovalIndex', tabIdKey: 'fasGumtreeAuRemovalTabId', prevTabIdKey: 'fasGumtreeAuRemovalPrevTabId', startedAtKey: 'fasGumtreeAuRemovalStartedAt' },
  // Added 2026-08-22 -- Patrick confirmed https://www.craigslist.org/account lists every
  // posting, removing the earlier data-model blocker (no manage-link was being captured per
  // posting). FACEBOOK intentionally stays out of this generic map -- it keeps its own
  // dedicated, mature removal path (fas-remove.js + the silentRemovalInProgress/
  // openSilentRemovalTab/finishSilentRemoval functions above), unchanged by this feature.
  CRAIGSLIST: { manageUrlKey: 'CRAIG_MANAGE_URL', queueKey: 'fasCraigslistRemovalQueue', indexKey: 'fasCraigslistRemovalIndex', tabIdKey: 'fasCraigslistRemovalTabId', prevTabIdKey: 'fasCraigslistRemovalPrevTabId', startedAtKey: 'fasCraigslistRemovalStartedAt' },
};

// Mirrors silentRemovalInProgress/openSilentRemovalTab/finishSilentRemoval above exactly (same
// proven tab-lifecycle design: foregrounded tab, remember+restore the organizer's previous tab,
// self-heal if the tab was closed or the run went stale) -- parameterized by platform instead of
// hardcoded to Facebook.
async function silentCrossPlatformRemovalInProgress(platform) {
  const cfg = FAS_CROSS_PLATFORM_REMOVAL_CONFIG[platform];
  const st = await chrome.storage.local.get([cfg.tabIdKey, cfg.startedAtKey]);
  const tabId = st[cfg.tabIdKey] || null;
  if (!tabId) return false;
  if (Date.now() - (st[cfg.startedAtKey] || 0) > FAS_REMOVAL_MAX_MS) {
    await chrome.storage.local.remove([cfg.tabIdKey, cfg.prevTabIdKey, cfg.startedAtKey]);
    return false;
  }
  const tab = await tabsGet(tabId);
  if (!tab) { await chrome.storage.local.remove([cfg.tabIdKey, cfg.prevTabIdKey, cfg.startedAtKey]); return false; }
  return true;
}

async function openSilentCrossPlatformRemovalTab(platform) {
  const cfg = FAS_CROSS_PLATFORM_REMOVAL_CONFIG[platform];
  const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const prevTabId = activeTabs && activeTabs[0] ? activeTabs[0].id : null;
  const tab = await chrome.tabs.create({ url: CFG[cfg.manageUrlKey], active: true });
  await chrome.storage.local.set({ [cfg.tabIdKey]: tab.id, [cfg.prevTabIdKey]: prevTabId, [cfg.startedAtKey]: Date.now() });
}

async function finishSilentCrossPlatformRemoval(platform) {
  const cfg = FAS_CROSS_PLATFORM_REMOVAL_CONFIG[platform];
  const st = await chrome.storage.local.get([cfg.tabIdKey, cfg.prevTabIdKey]);
  await chrome.storage.local.remove([cfg.tabIdKey, cfg.prevTabIdKey, cfg.startedAtKey]);
  if (st[cfg.prevTabIdKey] != null) {
    await new Promise((resolve) => chrome.tabs.update(st[cfg.prevTabIdKey], { active: true }, () => { void chrome.runtime.lastError; resolve(); }));
  }
  if (st[cfg.tabIdKey] != null) {
    await new Promise((resolve) => chrome.tabs.remove(st[cfg.tabIdKey], () => { void chrome.runtime.lastError; resolve(); }));
  }
}

// Called from checkPendingRemovals once per poll, right after the existing Facebook-specific
// logic (unchanged) has run. `pendingItems` is the SAME array already fetched from
// /extension/pending-removals -- now platform-aware (each item carries a `platforms` array, see
// extensionController.ts getPendingRemovals' same-session fix) -- so no extra API call is needed
// here to route each item to the right platform(s).
async function checkCrossPlatformRemovals(pendingItems) {
  const { fasAutoRemoveMode = 'notify' } = await chrome.storage.local.get(['fasAutoRemoveMode']);
  if (fasAutoRemoveMode === 'off') return 'off';
  const outcomes = [];
  for (const platform of Object.keys(FAS_CROSS_PLATFORM_REMOVAL_CONFIG)) {
    const cfg = FAS_CROSS_PLATFORM_REMOVAL_CONFIG[platform];
    const itemsForPlatform = pendingItems.filter((i) => Array.isArray(i.platforms) && i.platforms.includes(platform));
    if (!itemsForPlatform.length) continue;
    if (fasAutoRemoveMode === 'silent' && await silentCrossPlatformRemovalInProgress(platform)) {
      outcomes.push(platform + ':skipped_in_progress');
      continue;
    }
    await chrome.storage.local.set({ [cfg.queueKey]: itemsForPlatform, [cfg.indexKey]: 0 });
    if (fasAutoRemoveMode === 'silent') {
      // SAFETY FIX 2026-09-04 (S-EXT-CROSSPLATFORM-REMOVAL-TAB-BURST, precautionary -- Patrick
      // live report of a runaway burst of background.js console activity, several messages/sec,
      // sustained even while idle; exact trigger not confirmed live since the console cleared
      // before it could be captured, but this loop is the strongest concrete candidate found on
      // code review: it iterates every platform in ONE call with zero delay between iterations,
      // and in silent mode opens a brand-new active tab per platform that has pending items --
      // today's getPendingRemovals fix (S-EXT-GETPENDINGREMOVALS-CROSS-PLATFORM-MASKING) likely
      // unmasked a real backlog across MULTIPLE platforms at once, not just Poshmark, so this loop
      // could open several tabs within about a second of each other, each then running its own
      // removal flow independently and concurrently -- consistent with what was observed. Added
      // defensively regardless of exact root cause, since opening several automated tabs back to
      // back with zero pacing is a real risk on its own (marketplace bot-detection).
      if (outcomes.length) await sleep(3000 + Math.random() * 2000);
      await openSilentCrossPlatformRemovalTab(platform);
      outcomes.push(platform + ':silent_removal_started:' + itemsForPlatform.length);
    } else {
      chrome.notifications.create('fasPendingRemovals_' + platform, {
        type: 'basic',
        iconUrl: 'icon128.png',
        title: 'FindA.Sale',
        message: itemsForPlatform.length === 1
          ? '1 item sold elsewhere \u2014 remove it from ' + FAS_PLATFORM_LABEL[platform] + '?'
          : itemsForPlatform.length + ' items sold elsewhere are still listed on ' + FAS_PLATFORM_LABEL[platform] + ' \u2014 remove them?',
        priority: 1
      });
      outcomes.push(platform + ':notified:' + itemsForPlatform.length);
    }
  }
  return outcomes.join(',') || 'no_items';
}

// Builds the 'fasPendingRemovals' notification body for checkPendingRemovals below. Split out
// because the message now has three distinct cases (removals only, sold-checks only, or both at
// once) instead of the original single case -- see the 2026-08-05 sold-detection note there.
function buildRemovalNotificationMessage(removalCount, soldCheckCount) {
  if (removalCount && soldCheckCount) {
    return removalCount + ' item' + (removalCount === 1 ? '' : 's') +
      ' sold elsewhere, plus Facebook listings due for a sync check -- open Marketplace?';
  }
  if (removalCount) {
    return removalCount === 1
      ? '1 item sold elsewhere — remove it from Facebook Marketplace?'
      : removalCount + ' items sold elsewhere — remove them from Facebook Marketplace?';
  }
  // soldCheckCount only -- nothing has been confirmed sold on Facebook yet at notify time (that
  // confirmation only happens once the tab opens and fas-remove.js's scan actually runs), so
  // this deliberately does NOT claim anything sold -- it's a "go check" prompt, not a report.
  return 'Checking your Facebook listings for items that sold there -- open Marketplace?';
}

// (2026-08-05) Reverse-direction cross-channel sync (ADR-084 amendment, Part D): also checks
// GET /extension/pending-sold-checks on this SAME poll -- an item may have sold NATIVELY on
// Facebook, something FindA.Sale has no other way to learn (same DOM-poll gap as removal
// itself). Folded into checkPendingRemovals rather than a separate parallel function (the way
// checkPendingUpdates runs alongside it) because sold-checks CAN trigger the exact same
// tab-opening side effect removal does (silent mode) -- keeping both possible tab-opening
// triggers inside ONE sequential function is what guarantees at most one tab ever opens per
// alarm tick. fas-remove.js's restructured start() runs its own sold-detection scan every time
// it loads on this page, independent of whether anything was queued for removal, so a single
// tab open here already covers both jobs -- "one tab visit naturally handles both". No new
// alarm was added: this still rides the existing FAS_REMOVAL_ALARM 20-min cadence.
// checkPendingUpdates has no tab-opening side effect (notify-only, Phase A), so it correctly
// stays a separate, safely-parallel poll -- untouched here.
async function checkPendingRemovals() {
  const { fasAutoRemoveMode = 'notify' } = await chrome.storage.local.get(['fasAutoRemoveMode']);
  if (fasAutoRemoveMode === 'off') return 'off';
  // Guard (silent mode only): don't poll/open another removal tab while one is mid-run. Also
  // prevents overwriting fasRemovalQueue/fasRemovalIndex under an in-progress content script,
  // which would corrupt its queue position. Notify mode never auto-creates a tab, so unaffected.
  if (fasAutoRemoveMode === 'silent' && await silentRemovalInProgress()) return 'skipped_in_progress';

  const resp = await apiFetch('/extension/pending-removals');
  if (!resp.ok) return 'error:' + (resp.error || resp.status);
  const items = (resp.data && resp.data.items) || [];
  await notifyManualReviewIfNew(resp.data && resp.data.needsManualReview);

  // S-EXT-CROSS-PLATFORM-AUTOREMOVE: runs independently of everything else in this function --
  // must NOT be gated behind Facebook's own early-return conditions below (e.g. `!items.length &&
  // !soldCheckCount` would otherwise skip this entirely on a poll where only a non-Facebook
  // platform has something pending). `items` is the exact same platform-aware list just fetched
  // above (each item now carries a `platforms` array -- see extensionController.ts
  // getPendingRemovals' same-session fix); checkCrossPlatformRemovals filters it per platform
  // itself. Wrapped so a failure here can never take down the proven, working Facebook flow below.
  try { await checkCrossPlatformRemovals(items); } catch (e) { console.log('[FAS cross-platform removal check FAILED]', e && e.message); }

  // Sold-checks failure is non-fatal to the removal flow above -- a broken/unreachable
  // pending-sold-checks call must never block a genuine pending removal from being processed.
  let soldCheckCount = 0;
  try {
    const soldResp = await apiFetch('/extension/pending-sold-checks');
    if (soldResp.ok) soldCheckCount = ((soldResp.data && soldResp.data.items) || []).length;
  } catch (e) { /* non-fatal -- see comment above */ }

  // (2026-08-10 fix -- refocus tab-spam, Patrick report "extension going off on facebook with
  // every focus back on chrome") Sold-checks are a routine "nothing confirmed yet, just rescan"
  // signal that is essentially ALWAYS > 0 for any organizer with active FB listings -- unlike
  // items.length (a genuine, comparatively rare, actionable pending removal), it was never meant
  // to be worth reacting to on every opportunistic call. Root cause: chrome.windows.onFocusChanged
  // (below) calls throttledCheckPendingRemovals on every window refocus (only a 30s throttle), and
  // soldCheckCount>0 alone was enough to open a silent-mode tab or re-fire a notification -- in
  // practice a foreground Facebook tab (or repeat notification) on almost every alt-tab back into
  // Chrome, for as long as any listing was live. Real removals (items.length>0) still act
  // immediately below, unchanged -- only the soldCheckCount-only case is now throttled to the same
  // ~20-min cadence the alarm already runs on, so a routine rescan happens on that cadence
  // regardless of trigger source, while a genuine sold-elsewhere removal is never delayed.
  const SOLD_CHECK_MIN_INTERVAL_MS = 20 * 60 * 1000;
  if (!items.length && soldCheckCount > 0) {
    const { fasLastSoldCheckActionAt = 0 } = await chrome.storage.local.get(['fasLastSoldCheckActionAt']);
    if (Date.now() - fasLastSoldCheckActionAt < SOLD_CHECK_MIN_INTERVAL_MS) return 'skipped_soldcheck_throttled';
  }

  if (!items.length && !soldCheckCount) return 'no_items';

  // fasRemovalQueue only ever carries removal-processing candidates -- sold-check candidates
  // are fetched fresh by fas-remove.js itself (getFacebookSoldChecks) once the tab loads there;
  // no separate local queue needed for that flow (a single DOM scan against every candidate in
  // one pass, not runRemovalQueue's sequential per-item tab-lifecycle processing). Also stamps
  // fasLastSoldCheckActionAt whenever soldCheckCount contributed to this action firing, so the
  // throttle above measures time since the last real action, not time since the last poll.
  await chrome.storage.local.set({
    fasRemovalQueue: items,
    fasRemovalIndex: 0,
    ...(soldCheckCount > 0 ? { fasLastSoldCheckActionAt: Date.now() } : {})
  });

  if (fasAutoRemoveMode === 'silent') {
    await openSilentRemovalTab();
    return 'silent_removal_started:' + items.length + '_soldchecks:' + soldCheckCount;
  }

  // 'notify' -- Chrome notification; clicking it opens the removal page in an active tab
  // (the content script picks up the already-stored queue on load, same as the listing flow
  // never needing an open popup to run). Message wording adapts to which of the two reasons
  // actually triggered this notification -- see buildRemovalNotificationMessage above.
  chrome.notifications.create('fasPendingRemovals', {
    type: 'basic',
    iconUrl: 'icon128.png',
    title: 'FindA.Sale',
    message: buildRemovalNotificationMessage(items.length, soldCheckCount),
    priority: 1
  });
  return 'notified:' + items.length + '_soldchecks:' + soldCheckCount;
}

// ---- Independent reverse sold-detection trigger (S-EXT-REVERSE-SOLD-DETECTION-INDEPENDENT,
// 2026-08-23) ----
// CONFIRMED BUG (P1): runSoldDetectionScan (fas-remove.js) only ever runs once a tab actually
// lands on FAS_YOU_SELLING_SOLD_FILTER_URL, and until now that tab was opened ONLY as a side
// effect of the forward-removal flow above: openSilentRemovalTab() fires from
// checkPendingRemovals() solely when (a) items.length>0 (something already confirmed sold on
// FindA.Sale -- unrelated to a NATIVE Facebook sale), or (b) soldCheckCount>0 AND
// fasAutoRemoveMode==='silent'. In 'notify' mode -- the DEFAULT -- a soldCheckCount>0 only ever
// produces a Chrome notification; the tab (and therefore the scan) never opens unless the
// organizer manually clicks it. A real item ("Silent Service NES game") sold natively on
// Facebook and its FindA.Sale Item.status never flipped from AVAILABLE to SOLD because nothing
// ever opened this page for that organizer. This function closes that gap: it runs the
// detection scan on its own account, decoupled from both forward-removal need and from mode
// (only 'off' is excluded, since that means the organizer explicitly disabled cross-channel FB
// sync entirely) -- called from the SAME FAS_REMOVAL_ALARM tick as checkPendingRemovals/
// checkPendingUpdates below (no new chrome.alarms entry needed).
//
// HIDDEN, not foregrounded like openSilentRemovalTab(): this path never clicks anything on
// Facebook -- runSoldDetectionScan is a pure DOM read (see fas-remove.js's 2026-08-09 comment on
// SOLD_STATUS_FILTER_URL: "sold-detection scan (pure DOM read, no rAF dependency) was separately
// confirmed to work fine hidden"). openSilentRemovalTab() stays foregrounded (UNCHANGED by this
// fix) because its shared tab also carries the removal-survey-modal click and the renewal click,
// both of which depend on requestAnimationFrame/animation timing that Chrome throttles in hidden
// tabs. This new path only ever runs the read-only scan, so it can safely stay hidden and never
// interrupts the organizer's browsing.
//
// Reuses the EXISTING fasRemovalTabId/fasRemovalPrevTabId/fasRemovalStartedAt storage keys and
// the EXISTING silentRemovalInProgress()/finishSilentRemoval() functions completely unchanged --
// fas-remove.js's start() already sends 'removalQueueDone' unconditionally whenever nothing ends
// up queued for removal or renewal, and finishSilentRemoval() already no-ops safely whenever
// fasRemovalTabId isn't set. Tracking this tab under the same keys means it gets closed (and the
// organizer's previous tab focus restored) via that exact same, already-proven path -- zero
// changes needed to fas-remove.js or to openSilentRemovalTab/finishSilentRemoval themselves.
//
// CADENCE DECISION (flagged for Patrick -- may want a different number, easy to retune below):
// chosen 60 minutes, independent of the 20-min FAS_REMOVAL_ALARM tick itself. Reasoning: (1) a
// hidden tab causes no visible disruption, so the strongest argument for a LONG interval (don't
// hijack the organizer's screen) mostly doesn't apply here -- an item that sold natively on
// Facebook stays falsely AVAILABLE on FindA.Sale until this scan catches it, which is a real
// double-sell risk (it could be sold to a second buyer on FindA.Sale in the meantime), so leaning
// toward SHORTER is safer for that reason. (2) Against that, every run is still a real Facebook
// page load against the organizer's own logged-in session, and running it on the exact same
// 20-min cadence as the forward-removal alarm (which handles the more time-sensitive "already
// confirmed sold on FindA.Sale, still live on Facebook" direction) felt excessive for a native-FB
// sale, which has no equivalent freshness signal telling us it just happened. 60 minutes is a
// middle ground: at most ~24 extra hidden tab loads/day per organizer, and a native Facebook sale
// is now caught within an hour instead of "whenever the organizer happens to click a
// notification, or never" (the confirmed bug). Also gated behind a cheap pending-sold-checks
// existence check below so it never opens a tab when there is nothing to check at all.
const FAS_INDEPENDENT_SOLD_CHECK_INTERVAL_MS = 60 * 60 * 1000;

async function checkReverseSoldDetectionIndependently() {
  const { fasAutoRemoveMode = 'notify' } = await chrome.storage.local.get(['fasAutoRemoveMode']);
  if (fasAutoRemoveMode === 'off') return 'off'; // organizer explicitly disabled cross-channel FB sync entirely

  // Don't open a second tab while the shared removal/renewal tab lifecycle is already mid-run --
  // same guard checkPendingRemovals() itself uses above. Running this AFTER checkPendingRemovals
  // in the alarm handler (sequentially, not via Promise.all) guarantees this check always sees
  // whatever checkPendingRemovals just did this same tick, so the two can never race and open two
  // tabs at once.
  if (await silentRemovalInProgress()) return 'skipped_in_progress';

  const { fasLastIndependentSoldCheckAt = 0 } = await chrome.storage.local.get(['fasLastIndependentSoldCheckAt']);
  if (Date.now() - fasLastIndependentSoldCheckAt < FAS_INDEPENDENT_SOLD_CHECK_INTERVAL_MS) {
    return 'skipped_throttled';
  }

  // Cheap existence check before opening a tab at all -- mirrors checkPendingRemovals' own
  // soldCheckCount gate above. If the organizer has nothing currently AVAILABLE-and-live-on-
  // Facebook to check, opening a tab here would be pure waste. Deliberately NOT reusing
  // checkPendingRemovals' own soldCheckCount value (that function returns only a summary string,
  // not the count) -- a second call to this endpoint is cheap and keeps this function fully
  // self-contained and safe to reason about in isolation.
  let soldCheckCount = 0;
  try {
    const resp = await apiFetch('/extension/pending-sold-checks');
    if (!resp.ok) return 'error:' + (resp.error || resp.status);
    soldCheckCount = ((resp.data && resp.data.items) || []).length;
  } catch (e) { return 'error:' + String((e && e.message) || e); }
  if (!soldCheckCount) return 'no_candidates';

  // Stamp the throttle only when actually opening -- the cheap existence check above is not
  // throttled (it's just a lightweight read), only the actual tab-open is rate-limited.
  await chrome.storage.local.set({ fasLastIndependentSoldCheckAt: Date.now() });
  await openIndependentSoldCheckTab();
  return 'opened:' + soldCheckCount;
}

// Mirrors openSilentRemovalTab() above exactly, except active:false (see the HIDDEN-vs-
// foregrounded reasoning in the comment block above) -- tracked under the SAME storage keys so
// the existing finishSilentRemoval()/silentRemovalInProgress() machinery handles cleanup with no
// changes needed there or in fas-remove.js.
async function openIndependentSoldCheckTab() {
  const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const prevTabId = activeTabs && activeTabs[0] ? activeTabs[0].id : null;
  const tab = await chrome.tabs.create({ url: FAS_YOU_SELLING_SOLD_FILTER_URL, active: false });
  await chrome.storage.local.set({ fasRemovalTabId: tab.id, fasRemovalPrevTabId: prevTabId, fasRemovalStartedAt: Date.now() });
}

// Shared 30s throttle for on-demand checks (popup open, startup/install, mode change) so
// rapid reloads can't spawn duplicate removal tabs. The recurring 20-min alarm path below stays
// unguarded so the steady-state poll always runs.
async function throttledCheckPendingRemovals() {
  try {
    const { fasLastRemovalCheckAt = 0 } = await chrome.storage.local.get(['fasLastRemovalCheckAt']);
    if (Date.now() - fasLastRemovalCheckAt < 30000) return;
    await chrome.storage.local.set({ fasLastRemovalCheckAt: Date.now() });
    const removalOutcome = await checkPendingRemovals().catch((e) => 'error:' + String((e && e.message) || e));
    const updateOutcome = await checkPendingUpdates().catch((e) => 'error:' + String((e && e.message) || e));
    // (2026-07-21) Same instrumentation as the alarm path, under separate keys -- lets the popup
    // tell "an automatic 20-min alarm tick did this" apart from "a manual/opportunistic trigger
    // (popup open, window refocus) did this", which is exactly the distinction needed to diagnose
    // "it only works when I open the extension" reports.
    await chrome.storage.local.set({
      fasLastManualCheckAt: Date.now(),
      fasLastManualRemovalOutcome: removalOutcome,
      fasLastManualUpdateOutcome: updateOutcome
    });
  } catch (e) {}
}
// (2026-07-21) Alarm-fire instrumentation: every tick of the automatic 20-min removal alarm
// persists a timestamp + outcome to storage, surfaced in the popup as "last automatic check".
// Added because there was previously NO way to tell "did the alarm actually fire" from "it fired
// but found nothing to do" without opening the service worker's DevTools console -- a
// stuck/never-firing alarm was indistinguishable from a healthy one with nothing pending.
// ---- Saved-Search Desktop Deal Alerts (Feature #595, 2026-08-04) ----
// Polls GET /saved-searches/check-new on its own recurring alarm and fires one desktop
// notification per saved search (notifyOnNew=true on the shopper's account) that has new
// matching items since the last check. apiFetch() already returns { ok:false, status:401,
// error:'not_signed_in' } when there's no finda.sale accessToken cookie, so this naturally
// no-ops for a signed-out browser -- same auth pattern as the removal/price-sync pollers above,
// no separate login check needed. Runs on a longer interval than the 20-min removal alarm since
// deal alerts are not time-sensitive the way a sold-elsewhere removal is.
const FAS_SAVED_SEARCH_ALARM = 'fasSavedSearchAlerts';

async function ensureSavedSearchAlarm() {
  const existing = await chrome.alarms.get(FAS_SAVED_SEARCH_ALARM);
  if (!existing) chrome.alarms.create(FAS_SAVED_SEARCH_ALARM, { periodInMinutes: 25 });
}
chrome.runtime.onInstalled.addListener(ensureSavedSearchAlarm);
chrome.runtime.onStartup.addListener(ensureSavedSearchAlarm);

async function checkSavedSearchAlerts() {
  const resp = await apiFetch('/saved-searches/check-new');
  if (!resp.ok) return 'error:' + (resp.error || resp.status);
  const matches = (resp.data && resp.data.matches) || [];
  if (!matches.length) return 'no_matches';

  for (const m of matches) {
    const firstItem = m.items && m.items[0];
    const notifId = 'fasSavedSearch_' + m.savedSearchId;
    const url = firstItem ? ('https://finda.sale/sales/' + firstItem.saleId) : 'https://finda.sale/shopper/saved-searches';
    // Remember the click-through URL per saved search (notifications API carries no payload).
    await chrome.storage.local.set({ ['fasSavedSearchUrl_' + m.savedSearchId]: url });
    chrome.notifications.create(notifId, {
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'FindA.Sale -- new match for "' + m.name + '"',
      message: m.count === 1 && firstItem
        ? firstItem.title + (firstItem.price != null ? ' -- $' + firstItem.price : '')
        : m.count + ' new items match your saved search "' + m.name + '"',
      priority: 1
    });
  }
  return 'notified:' + matches.length;
}

// ---- Marketplace Listing Auto-Renew (ADR-100, 2026-08-06/07) ----
// Polls GET /extension/pending-renewals on its own recurring alarm, same shape as the
// saved-search alarm above. Default behavior (fasAutoRenew unset/true, flipped 2026-08-09
// per Patrick: "renews should be automated not nudged") re-queues the due item through the
// SAME posting flow fas-content.js/fas-craigslist.js already use for a first-time post -- no
// duplicated FB/Craigslist automation logic (ADR-100 §8 amendment). The organizer can still
// opt OUT via the popup's "Automatically renew" toggle (fasAutoRenew=false, chrome.storage.local,
// same toggle mechanism as the existing fasAutoRemoveMode/fasQueue autoPublish settings) to fall
// back to notify-only -- this off-switch is kept (not removed) because the Craigslist
// logged-out safety fallback below still needs a notify-only path to hand off to when
// unattended auto-post would strand at a verification wall.
// ADR-100 §7 Q3 CONFIRMED 2026-08-16 (Patrick): once/day polling is fine -- renewal isn't
// time-critical the way the 20-min removal alarm is.
const FAS_RENEW_ALARM = 'fasRenewNudge';
const FAS_RENEW_PERIOD_MINUTES = 1440; // Confirmed 2026-08-16: once/day

async function ensureRenewAlarm() {
  const existing = await chrome.alarms.get(FAS_RENEW_ALARM);
  if (!existing) chrome.alarms.create(FAS_RENEW_ALARM, { periodInMinutes: FAS_RENEW_PERIOD_MINUTES });
}
chrome.runtime.onInstalled.addListener(ensureRenewAlarm);
chrome.runtime.onStartup.addListener(ensureRenewAlarm);

// True when a posting queue for this platform is already mid-run (organizer manually posting,
// or a prior auto-renew run still in flight) -- auto-renew must never clobber an in-progress
// queue by overwriting fasQueue/fasCraigslistQueue out from under a live content script.
// Skips this platform for the current alarm tick; the item stays due and is picked up on the
// NEXT tick since nothing here marks it renewed until fas-content.js/fas-craigslist.js's own
// markListed call actually succeeds.
async function hasActiveQueue(platform) {
  if (platform === 'CRAIGSLIST') {
    const { fasCraigslistQueue = [], fasCraigslistIndex = 0 } = await chrome.storage.local.get(['fasCraigslistQueue', 'fasCraigslistIndex']);
    return fasCraigslistIndex < fasCraigslistQueue.length;
  }
  // ADR-102 (2026-08-09): Gumtree Australia -- same shape as the Craigslist branch above.
  if (platform === 'GUMTREE_AU') {
    const { fasGumtreeAuQueue = [], fasGumtreeAuIndex = 0 } = await chrome.storage.local.get(['fasGumtreeAuQueue', 'fasGumtreeAuIndex']);
    return fasGumtreeAuIndex < fasGumtreeAuQueue.length;
  }
  const { fasQueue = [], fasIndex = 0 } = await chrome.storage.local.get(['fasQueue', 'fasIndex']);
  return fasIndex < fasQueue.length;
}

// Builds one posting-queue entry from a full /extension/items record. Deliberately mirrors
// popup.js's startQueue() field list exactly (same never-invent-a-value rule for location
// fields) -- this is the one place outside popup.js that needs to build a queue entry, since
// auto-renewal runs with no popup open at all.
// Price/shipping-change awareness (2026-08-09, Patrick): `full` comes from a fresh
// apiFetch('/extension/items') call made at the top of autoRenewDueItems(), i.e. a live DB
// read at renewal time -- NOT a snapshot cached from the item's original post. So price,
// shippingOverride, packageWeightOz/aiPackageWeightOz, and allowBestOffer/bestOfferMinimumAmt
// always reflect whatever the organizer has set as of the renewal moment, automatically --
// no separate diffing/staleness logic needed, since renewal already re-drives the full posting
// flow (a new post, not an in-place edit -- neither platform offers an edit API) with current data.
function buildRenewalQueueItem(it, organizerEmail) {
  return {
    id: it.id, title: it.title, price: it.price, condition: it.condition,
    description: it.description, category: it.category, photoUrls: it.photoUrls || [],
    packageWeightOz: it.packageWeightOz, aiPackageWeightOz: it.aiPackageWeightOz,
    // S-EXT-MERCARI-BATCH-8 (2026-08-23): package dims now flow through, same pattern as bestOfferAutoAcceptAmt
    packageLengthIn: it.packageLengthIn, packageWidthIn: it.packageWidthIn, packageHeightIn: it.packageHeightIn,
    shippingOverride: it.shippingOverride,
    allowBestOffer: it.allowBestOffer, bestOfferMinimumAmt: it.bestOfferMinimumAmt,
    bestOfferAutoAcceptAmt: it.bestOfferAutoAcceptAmt, // S-EXT-MERCARI-BATCH-4 (2026-08-23) -- same passthrough as popup.js's queue map
    city: it.city, geographicArea: it.geographicArea, saleCity: it.saleCity,
    postal: it.postal, postalCode: it.postalCode, zip: it.zip, saleZip: it.saleZip,
    saleAddress: it.saleAddress,
    email: organizerEmail || null
  };
}

// Auto-renew path (fasAutoRenew=true, now the default).
// CORRECTED 2026-08-09 (ADR-100 §10/§11/§12): originally every due item re-drove the full
// posting flow (a repost) regardless of platform or whether anything actually changed. Patrick
// caught that this wastes resources and risks the account getting flagged for bulk automated
// reposting, when Facebook already offers a lightweight, platform-sanctioned "Renew listing"
// button for exactly this purpose. Due items are now split three ways:
//   1. FACEBOOK, price unchanged since last post -- native "Renew listing" click via the
//      lightweight fasRenewalQueue + fas-remove.js's renewOne() (new, see ADR-100 §10/§11).
//   2. FACEBOOK, price changed since last post -- falls back to the existing full-repost fbQueue
//      path (unchanged): a plain Renew click doesn't update listing content, only freshness/
//      position (Craigslist's own docs list "editing" and "renewing" as separate actions for
//      exactly this reason), so a changed item needs a real repost to carry the new price.
//   3. CRAIGSLIST -- UNCHANGED, still the full-repost clQueue path for every due item. Native
//      Craigslist renewal was investigated (ADR-100 §11) but the account page's manage-postings
//      links resisted a plain DOM query when checked live -- automating it without confirming
//      the real interaction mechanism would repeat the exact mistake ADR-086 already flagged
//      (guessing at unverified platform UI). Flagged as a follow-up, not built this pass.
// "Price changed" reuses the EXISTING getPendingUpdates/marketplaceListedPrice staleness check
// (ADR-086) -- not rebuilt. Shipping-change detection has no equivalent tracked field to diff
// against today (no marketplaceListedShippingOverride-style snapshot exists); adding one is a
// schema change and out of scope for this dispatch -- DECISION NEEDED, flagged in the handoff.
async function autoRenewDueItems(dueItems) {
  if (!dueItems.length) return 'no_items';
  const itemsResp = await apiFetch('/extension/items');
  if (!itemsResp.ok) return 'error:' + (itemsResp.error || itemsResp.status);
  const fullItems = (itemsResp.data && itemsResp.data.items) || [];
  const organizerEmail = (itemsResp.data && itemsResp.data.organizer && itemsResp.data.organizer.email) || null;
  const fullItemById = new Map(fullItems.map((it) => [it.id, it]));

  // Price-staleness set, reused from the existing ADR-086 detector -- a non-fatal fetch: if it
  // fails, fall back to treating NO items as stale (i.e. everything goes through native renew)
  // rather than blocking renewal entirely on a secondary endpoint being briefly unreachable.
  let staleIds = new Set();
  try {
    const updatesResp = await apiFetch('/extension/pending-updates');
    if (updatesResp.ok) {
      staleIds = new Set(((updatesResp.data && updatesResp.data.items) || []).map((i) => i.id));
    }
  } catch (e) { /* non-fatal, see comment above */ }

  const fbQueue = [];       // full-repost fallback (price changed)
  const clQueue = [];       // full-repost, unchanged for Craigslist (see comment above)
  const gtQueue = [];       // full-repost, unchanged for Gumtree Australia (ADR-102 -- no native
                             // renew/bump action has ever been verified live, see fas-gumtree-au.js's
                             // trailing verification-needed list; always reposts, same reasoning as
                             // Craigslist's clQueue above, never a guessed native-renew click)
  const fbRenewQueue = [];  // lightweight native-renew queue: {id, title, saleId}

  for (const due of dueItems) {
    const full = fullItemById.get(due.id);
    if (!full) continue; // no longer AVAILABLE/listable -- getExtensionItems already excludes it
    if (due.platform === 'CRAIGSLIST') {
      clQueue.push(buildRenewalQueueItem(full, organizerEmail));
    } else if (due.platform === 'GUMTREE_AU') {
      gtQueue.push(buildRenewalQueueItem(full, organizerEmail));
    } else if (full.facebookRestricted === true) {
      // Facebook Commerce Policy defense-in-depth: getPendingRenewals already excludes
      // coin/currency items due on FACEBOOK (extensionController.ts), so `dueItems` should
      // never contain one -- this is a belt-and-suspenders skip in case a due item was cached
      // before that server-side filter existed. Never queue for a full repost OR a native
      // "Renew listing" click.
      continue;
    } else if (staleIds.has(due.id)) {
      fbQueue.push(buildRenewalQueueItem(full, organizerEmail));
    } else {
      fbRenewQueue.push({ id: full.id, title: full.title, saleId: full.saleId });
    }
  }

  let started = 0;
  if (fbQueue.length && !(await hasActiveQueue('FACEBOOK'))) {
    await chrome.storage.local.set({ fasQueue: fbQueue, fasIndex: 0, fasAutoPublish: true, fasQueueSetAt: Date.now() });
    chrome.tabs.create({ url: CFG.FB_CREATE_URL, active: false });
    started += fbQueue.length;
  }
  if (clQueue.length && !(await hasActiveQueue('CRAIGSLIST'))) {
    // fasCraigslistQueueTabId cleared first (fail-closed) then set to the real tab id once
    // creation resolves -- see the S-EXT-AUTOPUBLISH-TAB-SCOPE fix in the onUpdated listener above.
    await chrome.storage.local.set({ fasCraigslistQueue: clQueue, fasCraigslistIndex: 0, fasCraigslistAutoPublish: true, fasCraigslistQueueTabId: null });
    const clRenewTab = await chrome.tabs.create({ url: CFG.CL_POST_URL, active: false });
    await chrome.storage.local.set({ fasCraigslistQueueTabId: clRenewTab && clRenewTab.id != null ? clRenewTab.id : null });
    started += clQueue.length;
  }
  if (gtQueue.length && !(await hasActiveQueue('GUMTREE_AU'))) {
    await chrome.storage.local.set({ fasGumtreeAuQueue: gtQueue, fasGumtreeAuIndex: 0 });
    chrome.tabs.create({ url: CFG.GT_POST_URL, active: false });
    started += gtQueue.length;
  }
  // Native-renew queue shares the SAME you/selling management tab lifecycle as the removal flow
  // (silentRemovalInProgress/openSilentRemovalTab/finishSilentRemoval, defined above) rather than
  // tracking a second independent tab -- both flows target the same page and fas-remove.js's
  // start() already checks removal-then-renewal in one visit (see its 2026-08-09 comment). Guard
  // against opening a second tab if a removal (or a prior renewal) is already using it; the
  // renewal queue stays stored and gets picked up on the NEXT poll/tab-open instead.
  if (fbRenewQueue.length && !(await silentRemovalInProgress())) {
    await chrome.storage.local.set({ fasRenewalQueue: fbRenewQueue, fasRenewalIndex: 0 });
    await openSilentRemovalTab();
    started += fbRenewQueue.length;
  }
  return started ? 'auto_renew_started:' + started : 'skipped_active_queue';
}

// Notify-only path (fasAutoRenew=false, now opt-out only): mirrors checkSavedSearchAlerts's
// notification-per-match shape exactly -- one notification per due item, deep-linking to the
// item's sale page so the organizer lands on the right listing to renew manually.
async function notifyDueRenewals(dueItems) {
  if (!dueItems.length) return 'no_items';
  for (const due of dueItems) {
    const notifId = 'fasRenewDue_' + due.id;
    const url = due.saleId ? ('https://finda.sale/sales/' + due.saleId) : 'https://finda.sale/organizer/marketplace-extension';
    await chrome.storage.local.set({ ['fasRenewUrl_' + due.id]: url });
    const platformLabel = due.platform === 'CRAIGSLIST' ? 'Craigslist' : due.platform === 'GUMTREE_AU' ? 'Gumtree Australia' : 'Facebook Marketplace';
    chrome.notifications.create(notifId, {
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'FindA.Sale -- listing due for renewal',
      message: '"' + due.title + '" is due to be renewed on ' + platformLabel + '.',
      priority: 1
    });
  }
  return 'notified:' + dueItems.length;
}

async function checkRenewals() {
  const resp = await apiFetch('/extension/pending-renewals');
  if (!resp.ok) return 'error:' + (resp.error || resp.status);
  const dueItems = (resp.data && resp.data.items) || [];
  if (!dueItems.length) return 'no_items';

  // 2026-08-09 (Patrick): default flipped true -- "renews should be automated not nudged".
  const { fasAutoRenew = true } = await chrome.storage.local.get(['fasAutoRenew']);
  if (!fasAutoRenew) return await notifyDueRenewals(dueItems);

  // (2026-08-08 login gate) Craigslist auto-renew re-drives the guest-postable posting flow
  // with no human present -- fine when actually logged into a Craigslist account (verification
  // is typically skipped for logged-in posters), but likely to silently strand a background tab
  // at a phone/email/CAPTCHA verification wall when logged out, with nobody there to clear it.
  // Only acts on a POSITIVELY observed logged-out reading (fasCraigslistLoginState === false,
  // set by fas-craigslist.js's isLoggedIntoCraigslist via the craigslistLoginStateObserved
  // message below) -- an unknown/never-observed state (null/undefined, e.g. before the organizer
  // has ever opened a Craigslist tab on this install) falls through to the original
  // unconditional auto-renew call, so this can only ever get MORE permissive as real signal
  // accumulates, never silently disable a feature that used to work.
  // ADR-102 (2026-08-09): Gumtree Australia gets the SAME logged-out gate as Craigslist above,
  // for a stronger reason -- its entire posting flow is login-walled (unlike Craigslist, which is
  // guest-postable), so an unattended auto-renew run against a logged-out Gumtree AU session would
  // strand at the sign-in wall with nobody there to clear it, every single time. Only acts on a
  // POSITIVELY observed logged-out reading, same as Craigslist's gate (see the comment above) --
  // an unknown/never-observed state falls through to auto-renew, same permissive default.
  const { fasCraigslistLoginState = null, fasGumtreeAuLoginState = null } =
    await chrome.storage.local.get(['fasCraigslistLoginState', 'fasGumtreeAuLoginState']);
  if (fasCraigslistLoginState === false || fasGumtreeAuLoginState === false) {
    const loggedOutPlatforms = [];
    if (fasCraigslistLoginState === false) loggedOutPlatforms.push('CRAIGSLIST');
    if (fasGumtreeAuLoginState === false) loggedOutPlatforms.push('GUMTREE_AU');
    const notifyDue = dueItems.filter((d) => loggedOutPlatforms.includes(d.platform));
    const otherDue = dueItems.filter((d) => !loggedOutPlatforms.includes(d.platform));
    const notifyOutcome = notifyDue.length ? await notifyDueRenewals(notifyDue) : 'no_items';
    const otherOutcome = otherDue.length ? await autoRenewDueItems(otherDue) : 'no_items';
    return 'notified_logged_out:' + notifyOutcome + ' other_auto_renewed:' + otherOutcome;
  }

  return await autoRenewDueItems(dueItems);
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === FAS_SAVED_SEARCH_ALARM) {
    return checkSavedSearchAlerts()
      .catch((e) => 'error:' + String((e && e.message) || e))
      .then((outcome) => chrome.storage.local.set({
        fasLastSavedSearchAlarmFiredAt: Date.now(),
        fasLastSavedSearchOutcome: outcome
      }));
  }
  if (alarm.name === FAS_RENEW_ALARM) {
    return checkRenewals()
      .catch((e) => 'error:' + String((e && e.message) || e))
      .then((outcome) => chrome.storage.local.set({
        fasLastRenewAlarmFiredAt: Date.now(),
        fasLastRenewOutcome: outcome
      }));
  }
  if (alarm.name !== FAS_REMOVAL_ALARM) return;
  // (2026-08-23, S-EXT-REVERSE-SOLD-DETECTION-INDEPENDENT) checkReverseSoldDetectionIndependently
  // runs SEQUENTIALLY after checkPendingRemovals (not inside the Promise.all below) -- both can
  // open the SAME shared removal tab (fasRemovalTabId), and running them concurrently would race
  // two chrome.tabs.create calls against the same not-yet-written guard state, potentially
  // opening two tabs and orphaning one. Sequencing them means checkReverseSoldDetectionIndependently's
  // own silentRemovalInProgress() check always sees whatever checkPendingRemovals just did this
  // same tick. checkPendingUpdates has no tab-opening side effect (unchanged, still just a
  // notification), so it stays exactly as it was -- the listener is now `async` only so these can
  // be awaited in order; the original forward-removal and price-sync behavior is untouched.
  const removalOutcome = await checkPendingRemovals().catch((e) => 'error:' + String((e && e.message) || e));
  const independentSoldCheckOutcome = await checkReverseSoldDetectionIndependently().catch((e) => 'error:' + String((e && e.message) || e));
  const updateOutcome = await checkPendingUpdates().catch((e) => 'error:' + String((e && e.message) || e));
  return chrome.storage.local.set({
    fasLastAlarmFiredAt: Date.now(),
    fasLastAlarmRemovalOutcome: removalOutcome,
    fasLastAlarmUpdateOutcome: updateOutcome,
    fasLastAlarmIndependentSoldCheckOutcome: independentSoldCheckOutcome
  });
});

// (2026-07-21) Opportunistic secondary trigger -- backstops the 20-min alarm, doesn't replace it.
// Uses chrome.windows (already available, no extra manifest permission needed) so a pending
// removal also gets caught whenever the organizer actually comes back to Chrome -- switches into
// it from another app, wakes the laptop and clicks in -- instead of relying solely on the alarm
// landing while the service worker happens to already be awake. throttledCheckPendingRemovals is
// already 30s-throttled so this is safe to call freely. Also re-asserts the alarm itself in case
// it was ever silently cleared (e.g. by an extension reload) -- self-healing rather than waiting
// for the next onInstalled/onStartup to notice.
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return; // Chrome lost focus entirely, not gained
  ensureRemovalAlarm();
  throttledCheckPendingRemovals();
});
chrome.notifications.onClicked.addListener((notifId) => {
  if (notifId === 'fasPendingRemovals') {
    chrome.notifications.clear(notifId);
    chrome.tabs.create({ url: FAS_YOU_SELLING_SOLD_FILTER_URL, active: true });
    return;
  }
  // S-EXT-CROSS-PLATFORM-AUTOREMOVE: 'fasPendingRemovals_POSHMARK' etc. -- see
  // checkCrossPlatformRemovals above.
  if (notifId.indexOf('fasPendingRemovals_') === 0) {
    const platform = notifId.slice('fasPendingRemovals_'.length);
    const cfg = FAS_CROSS_PLATFORM_REMOVAL_CONFIG[platform];
    if (cfg) {
      chrome.notifications.clear(notifId);
      chrome.tabs.create({ url: CFG[cfg.manageUrlKey], active: true });
    }
    return;
  }
  if (notifId.indexOf('fasSavedSearch_') === 0) {
    chrome.notifications.clear(notifId);
    const key = 'fasSavedSearchUrl_' + notifId.slice('fasSavedSearch_'.length);
    chrome.storage.local.get([key], (st) => {
      chrome.tabs.create({ url: st[key] || 'https://finda.sale/shopper/saved-searches', active: true });
    });
    return;
  }
  if (notifId.indexOf('fasRenewDue_') === 0) {
    chrome.notifications.clear(notifId);
    const itemId = notifId.slice('fasRenewDue_'.length);
    const key = 'fasRenewUrl_' + itemId;
    chrome.storage.local.get([key], (st) => {
      chrome.tabs.create({ url: st[key] || 'https://finda.sale/organizer/marketplace-extension', active: true });
    });
    return;
  }
  // ADDED 2026-09-02 (S-EXT-VINTED-CONTINUE-UX round 2) -- see showVintedContinueNotification
  // above. Just dismiss on click; the Vinted tab itself is where the real action (the on-page
  // continue-prompt toast) already lives.
  if (notifId.indexOf('fasVintedContinue_') === 0) {
    chrome.notifications.clear(notifId);
  }
});

// (2026-08-30, S-EXT-QUEUE-PACING, Patrick-directed research: "investigate what other listing
// software does and let's create some safe defaults that we can tune as needed") -- until this
// session, there was NO delay at all between items in any posting queue; each item advanced as
// fast as the DOM allowed. Verified research (see claude_docs session log 2026-08-30) found: no
// platform publishes a specific numeric "safe" posting-velocity limit; Poshmark's own real
// enforced risk ("share jail") is about bulk SHARING/liking/following, which this extension never
// does, not listing creation; established browser-extension crosslisting tools (Vendoo, List
// Perfectly, Crosslist) use the same client-side automation model as this extension and are not
// reported as banned for listing-creation speed itself. The one CONFIRMED real risk already
// documented in this file is Vinted's active enforcement wave against automated relist/bump
// behavior (see advanceVintedQueue's queue-setup comment) -- already mitigated there by Vinted's
// manual-publish-only design (fillListing() fills and stops; the organizer always clicks Upload
// themselves). Given no evidence supports a specific number, this is a modest, deliberately-tuned
// default -- long enough to break up an obviously-instant machine-gun pattern, short enough not to
// look like the extension has stalled (there's no on-page "waiting" indicator yet, so anything
// much longer would read as broken to a non-technical organizer watching the tab). Tune by editing
// this one constant; nothing else needs to change.
const QUEUE_ADVANCE_DELAY_MS = { MIN: 10000, MAX: 25000 };
// CRAIGSLIST-only override (2026-08-30, S-EXT-CRAIGSLIST-RATE-LIMIT round 2, Patrick live report --
// hit "You are posting too rapidly" AGAIN even after the same-session fix that gave the
// reliability-net re-navigation branch the standard 10-25s humanQueueDelay() pacing every other
// platform gets. Confirmed the delay itself WAS firing (Patrick: "the delay between listings
// appeared to be working") -- this isn't a repeat of the missing-pacing bug, it's that Craigslist's
// own anti-spam throttle is simply stricter than the shared 10-25s range tuned against the other 6
// platforms. Patrick-directed: widen Craigslist specifically (now 45-60s, bumped 2026-08-31 after a live
// "posting too rapidly" hit at 25-45s) rather than raising the
// shared range (which would needlessly slow every other platform that wasn't hitting a limit).
const CRAIGSLIST_QUEUE_ADVANCE_DELAY_MS = { MIN: 15000, MAX: 25000 }; // LOWERED 2026-08-31 -- batch cooldown (added same session) is doing the real anti-throttle work now, so Patrick asked to bring per-item pacing back down near the shared 10-25s range and re-test
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

// BATCH COOLDOWN (2026-08-31, Patrick live report -- 60-75s per-item still tripped Craigslist's
// "You are posting too rapidly" throttle, the THIRD widening attempt to fail. Patrick's own
// observation: it trips roughly every 6 items regardless of per-item spacing, which points at
// Craigslist counting total posts within some window rather than purely spacing between them.
// Additive fix, not a replacement: keep the existing per-item delay AND add a much longer pause
// after every batch of CRAIGSLIST_BATCH_SIZE items.
const CRAIGSLIST_BATCH_SIZE = 5;
const CRAIGSLIST_BATCH_COOLDOWN_MS = { MIN: 300000, MAX: 420000 }; // 5-7 minutes between batches
function craigslistIsBatchBoundary(nextIndex) {
  return nextIndex > 0 && nextIndex % CRAIGSLIST_BATCH_SIZE === 0;
}

// FIX (2026-08-31, S-EXT-CRAIGSLIST-COUNTDOWN-VISIBILITY, Patrick live report -- "still no
// countdown timer for craigslist visible although the delay does seem to be working"): the
// humanQueueDelay() 'fasQueueDelayStarted' chrome.tabs.sendMessage approach (added earlier this
// session to give Craigslist the same countdown fas-content.js already renders for Facebook)
// silently does nothing here, because of a fact already documented above (S-EXT-CRAIGSLIST-STALL
// round 3, ~line 306): at the exact moment this delay fires, the tab is sitting on Craigslist's
// OWN "Thanks for posting!" confirmation page on the regional subdomain (e.g.
// kalamazoo.craigslist.org/...), NOT on post.craigslist.org -- and fas-craigslist.js is
// manifest-scoped to post.craigslist.org/* + www.craigslist.org/account* only, so it isn't
// injected there at all. sendMessage to a tab with no listening content script just goes nowhere.
// Fix: inject the overlay directly via chrome.scripting.executeScript instead of relying on a
// content-script listener -- manifest already grants "scripting" + "https://*.craigslist.org/*"
// host permission (used elsewhere in this file), so this works on ANY craigslist.org origin the
// tab happens to be on, confirmation page included. Self-contained: the injected function must
// not close over anything in this file's scope (it runs in the page's own isolated world).
async function injectCraigslistCountdownOverlay(tabId, ms, isBatchCooldown) {
  if (tabId == null) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (totalMs, isBatch, batchSize) => {
        try {
          const ID = 'fas-cl-queue-delay-overlay';
          let el = document.getElementById(ID);
          if (!el) {
            el = document.createElement('div');
            el.id = ID;
            el.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;' +
              'background:#1a1a1a;color:#fff;padding:10px 14px;border-radius:8px;' +
              'font:13px/1.4 -apple-system,Segoe UI,Arial,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.4);' +
              'border:1px solid #f97316;max-width:280px;';
            document.body.appendChild(el);
          }
          const deadline = Date.now() + Math.max(0, Number(totalMs) || 0);
          if (window.__fasClOverlayInterval) clearInterval(window.__fasClOverlayInterval);
          const render = () => {
            const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            const mins = Math.floor(remaining / 60);
            const secs = remaining % 60;
            const timeLabel = isBatch ? (mins + 'm ' + secs + 's') : (remaining + 's');
            el.textContent = isBatch
              ? 'Batch cooldown: waiting ' + timeLabel + ' before starting the next batch of ' + batchSize + ' (this is normal, not a stall)\u2026'
              : 'Pacing pause before the next item: ' + timeLabel + ' (this is normal, not a stall)\u2026';
            if (remaining <= 0) {
              clearInterval(window.__fasClOverlayInterval);
              window.__fasClOverlayInterval = null;
              if (el && el.parentNode) el.parentNode.removeChild(el);
            }
          };
          render();
          window.__fasClOverlayInterval = setInterval(render, 1000);
        } catch (e) { /* best-effort visual only -- never let this break the real pacing pause */ }
      },
      args: [ms, !!isBatchCooldown, CRAIGSLIST_BATCH_SIZE],
    });
  } catch (e) {
    // Injection can legitimately fail (tab closed, mid-navigation, chrome:// page, etc.) -- this
    // overlay is cosmetic only, so swallow and let the real sleep()-based pacing continue unaffected.
    console.warn('[FAS Craigslist] countdown overlay injection failed (non-fatal):', e && e.message);
  }
}

// Craigslist-specific wrapper around the shared pacing pattern: resolves the actual delay ms
// itself (instead of letting humanQueueDelay() pick internally) so the SAME ms value can drive
// both the visible overlay above and the real sleep -- kept separate from humanQueueDelay() so
// the other 3 platforms' behavior is untouched.
async function craigslistDelayWithOverlay(tabId, range, isBatchCooldown) {
  const ms = range.MIN + Math.random() * (range.MAX - range.MIN);
  injectCraigslistCountdownOverlay(tabId, ms, isBatchCooldown); // fire-and-forget, cosmetic only
  await sleep(ms);
}

// 2026-08-30 addition (Patrick live report -- watching a real run, couldn't tell if it had
// stalled or was just in this pause): the comment above ("no on-page waiting indicator yet")
// flagged this exact gap when the delay itself was first added. Fixes it WITHOUT touching the
// timing/pacing logic at all (ms/MIN/MAX all unchanged) -- purely adds an optional one-way
// notification to the tab that originated the request, so its content script can render its own
// live countdown. Fire-and-forget: `tabId` may legitimately be undefined (message came from a
// non-tab context) and the receiving tab may have no listener yet (fresh page load) or may have
// navigated away already -- both are harmless, non-fatal, and must never block or delay the real
// sleep, so the sendMessage call is wrapped and its rejection is swallowed.
async function humanQueueDelay(tabId, range) {
  // 2026-08-30: optional `range` param ({MIN,MAX}) lets a specific platform override the shared
  // 10-25s pacing -- see CRAIGSLIST_QUEUE_ADVANCE_DELAY_MS above. Defaults to the shared range so
  // every other existing call site (unchanged) behaves exactly as before.
  const r = range || QUEUE_ADVANCE_DELAY_MS;
  const ms = r.MIN + Math.random() * (r.MAX - r.MIN);
  if (tabId) {
    try { chrome.tabs.sendMessage(tabId, { type: 'fasQueueDelayStarted', ms: ms }).catch(() => {}); } catch (e) {}
  }
  await sleep(ms);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'getGuildXp') {
        // (#596 Guild/XP Toolbar Tie-In) Read-only reuse of the existing authenticated
        // GET /api/xp/profile endpoint (packages/backend/src/controllers/xpController.ts) --
        // same shape the frontend's useXpProfile hook consumes (guildXp, spendableXp,
        // explorerRank, rankProgress{currentXp,nextRankXp,nextRank}). No new backend
        // endpoint needed; this just gives the popup the same data over the extension's
        // existing Bearer-token apiFetch path.
        sendResponse(await apiFetch('/xp/profile'));
      } else if (msg.type === 'getItems') {
        // Also check for sold-elsewhere Marketplace removals whenever the popup opens -- the
        // 20-min alarm alone means a just-sold item can sit un-removed for up to 20 min. This
        // makes removals fire on-demand (and makes the flow testable without waiting). Fire-and-
        // forget so it never blocks the item list. Guarded by a 30s throttle so rapid popup
        // re-opens can't spawn duplicate removal tabs; the 20-min alarm path stays unguarded.
        // (2026-07-16)
        throttledCheckPendingRemovals(); // fire-and-forget; shared 30s throttle
        sendResponse(await apiFetch('/extension/items'));
      } else if (msg.type === 'checkItemListedStatus') {
        // FEATURE 2026-08-22 (S-EXT-DUPLICATE-LISTING-GUARD, Patrick live-confirmed incident):
        // a Poshmark queue entry got resumed after Patrick had ALREADY manually completed that
        // listing outside the extension's own "I posted -- done" flow -- nothing re-checked
        // current listed-status before re-filling and re-publishing, so a second, genuinely
        // duplicate live Poshmark listing was created for the same item. This is a general
        // resume-staleness risk, not unique to Poshmark's specific bug that surfaced it.
        // No new backend endpoint needed -- reuses the same authenticated GET /extension/items
        // call getItems already makes (extensionController.ts's `shaped` response, which as of
        // this same session correctly includes marketplaceListedPoshmark/-Mercari/-Vinted/
        // -Grailed). fas-poshmark.js/fas-mercari.js/fas-grailed.js call this right after pulling
        // a queue item and before filling anything; a `listed: true` result skips the fill/
        // publish entirely (see each content script's start()).
        const FAS_LISTED_FIELD_BY_PLATFORM = {
          POSHMARK: 'marketplaceListedPoshmark', MERCARI: 'marketplaceListedMercari',
          GRAILED: 'marketplaceListedGrailed', VINTED: 'marketplaceListedVinted',
        };
        const r = await apiFetch('/extension/items');
        if (!r.ok) { sendResponse({ ok: false, error: r.error || 'request_failed' }); }
        else {
          const items = (r.data && r.data.items) || [];
          const it = items.find((x) => x.id === msg.itemId);
          const field = FAS_LISTED_FIELD_BY_PLATFORM[msg.platform];
          sendResponse({ ok: true, found: !!it, listed: !!(it && field && it[field] === true) });
        }
      } else if (msg.type === 'markListed') {
        // ADR-100 (2026-08-06/07): platform threaded through -- fas-content.js's FB call site
        // never sets it (defaults 'FACEBOOK' server-side, matching today's behavior exactly);
        // fas-craigslist.js's new call site sets 'CRAIGSLIST'.
        // FIX (S-EXT-AUTOPUBLISH-DEDUP, 2026-08-29): routed through the shared
        // reportItemListedOnce() dedup guard (see its definition above the onUpdated listener)
        // instead of calling apiFetch directly -- this is the other half of the same race the
        // onUpdated reliability net above already had a one-sided guard for. A content script's
        // own fast-path report and the net's independent report for the SAME item+platform can now
        // only ever actually hit the backend once, no matter which one runs first or whether they race.
        const markListedResp = await reportItemListedOnce(msg.itemId, msg.platform || 'FACEBOOK', msg.remoteListingId);
        // (2026-08-09) markListed is called fire-and-forget from fas-remove.js/fas-content.js/
        // fas-craigslist.js, none of which check the response -- a failure here (auth, 500,
        // etc.) previously vanished with zero trace anywhere, which is exactly how the
        // not_signed_in gap fixed in apiFetch() above went unnoticed. Kept as a permanent,
        // failure-only log (service worker console persists past any tab's lifecycle, unlike
        // logging from the content-script side) so a regression here is visible again.
        if (!markListedResp.ok && !markListedResp.deduped) console.log('[FAS markListed FAILED]', JSON.stringify({ itemId: msg.itemId, platform: msg.platform, resp: markListedResp }));
        sendResponse(markListedResp);
      } else if (msg.type === 'markRemoved') {
        sendResponse(await apiFetch('/extension/items/' + encodeURIComponent(msg.itemId) + '/removed',
          { method: 'POST', body: {} }));
      } else if (msg.type === 'fetchPhotos') {
        const urls = (msg.urls || []).slice(0, 10); // FB caps ~10 photos/listing
        const out = [];
        for (const u of urls) { try { out.push(await fetchImageDataUrl(u)); } catch (e) { /* skip bad img */ } }
        sendResponse({ ok: true, dataUrls: out });
      } else if (msg.type === 'setQueue') {
        await chrome.storage.local.set({ fasQueue: msg.queue || [], fasIndex: 0, fasAutoPublish: msg.autoPublish !== false, fasQueueSetAt: Date.now() });
        sendResponse({ ok: true });
      } else if (msg.type === 'getQueueItem') {
        // (2026-08-02 fix -- Christmas-tree phantom-refill bug) A queue is only ever advanced by
        // 'advanceQueue' below, which fires AFTER a full fill+publish completes in fas-content.js.
        // If the create-item tab is closed/navigated away mid-fill (aborted run, or the organizer
        // closing the tab right after seeing "Published" before advanceAuto() gets to run), fasIndex
        // never moves off the same stuck item and NOTHING previously cleared fasQueue -- so it sat in
        // chrome.storage.local (durable across restarts/extension reloads) and re-filled the SAME
        // item every time /marketplace/create/item loaded, with no user action, indefinitely.
        // FAS_QUEUE_STALE_MS treats a queue that hasn't advanced in 30+ min as an abandoned/interrupted
        // run rather than a live one and self-clears it here at the read site (the actual "is anything
        // queued" check), instead of trusting storage forever. 30 min comfortably covers a real
        // multi-item run (each item normally fills in well under a minute) while still self-healing a
        // leftover from a run abandoned days earlier.
        const FAS_QUEUE_STALE_MS = 30 * 60 * 1000;
        const { fasQueue = [], fasIndex = 0, fasAutoPublish = true, fasQueueSetAt = 0 } =
          await chrome.storage.local.get(['fasQueue', 'fasIndex', 'fasAutoPublish', 'fasQueueSetAt']);
        if (fasQueue.length && Date.now() - fasQueueSetAt > FAS_QUEUE_STALE_MS) {
          await chrome.storage.local.set({ fasQueue: [], fasIndex: 0 });
          sendResponse({ ok: true, item: null, index: 0, total: 0, autoPublish: fasAutoPublish });
        } else {
          sendResponse({ ok: true, item: fasQueue[fasIndex] || null, index: fasIndex, total: fasQueue.length, autoPublish: fasAutoPublish });
        }
      } else if (msg.type === 'advanceQueue') {
        const st = await chrome.storage.local.get(['fasQueue', 'fasIndex']);
        const next = (st.fasIndex || 0) + 1;
        // Refresh the staleness clock on real forward progress so a legitimate long multi-item run
        // never gets treated as abandoned mid-way through.
        await chrome.storage.local.set({ fasIndex: next, fasQueueSetAt: Date.now() });
        const item = (st.fasQueue || [])[next] || null;
        // 2026-08-30: pass the originating tab id so humanQueueDelay can show a live countdown --
        // see that function's own comment. sender.tab is present here because 'advanceQueue' is
        // always sent from the FB content script's own tab context, never the popup.
        // BUG FIX 2026-09-04 (S-EXT-QUEUE-PACING-STUCK-ON-DONE, Patrick live report: a finished
        // 20-item Poshmark run left the overlay stuck reading "Pacing pause before the next item:
        // 0s" forever): this used to call humanQueueDelay unconditionally, even when `item` is
        // null (queue exhausted) -- the delay's countdown overlay would count to 0 and then just
        // sit there, since nothing ever overlays a "done" message afterward when there's no next
        // item to actually process. Only pace/show the countdown when there's a real next item.
        if (item) await humanQueueDelay(sender.tab && sender.tab.id); // S-EXT-QUEUE-PACING, see this file's top-of-file comment
        sendResponse({ ok: true, item, index: next, total: (st.fasQueue || []).length });
      } else if (msg.type === 'setCraigslistQueue') {
        // Craigslist channel (ADR-084 extension): store the queue and OPEN the posting tab here in
        // the worker (parallel to the FB flow, which stores fasQueue then the popup opens the FB
        // tab). fas-craigslist.js reads fasCraigslistQueue/fasCraigslistIndex via
        // getCraigslistQueueItem once post.craigslist.org loads. Kept fully separate from the FB
        // queue keys so the two channels never interfere.
        // autoPublish (2026-08-06): same fasAutoPublish pattern as the FB queue below --
        // defaults true unless the popup checkbox was explicitly unchecked.
        // fasCraigslistQueueTabId cleared first (fail-closed) then set to the real tab id once
        // creation resolves -- see the S-EXT-AUTOPUBLISH-TAB-SCOPE fix in the onUpdated listener above.
        await chrome.storage.local.set({ fasCraigslistQueue: msg.queue || [], fasCraigslistIndex: 0, fasCraigslistAutoPublish: msg.autoPublish !== false, fasCraigslistQueueTabId: null });
        const clQueueTab = await chrome.tabs.create({ url: CFG.CL_POST_URL });
        await chrome.storage.local.set({ fasCraigslistQueueTabId: clQueueTab && clQueueTab.id != null ? clQueueTab.id : null });
        sendResponse({ ok: true });
      } else if (msg.type === 'getCraigslistQueueItem') {
        const { fasCraigslistQueue = [], fasCraigslistIndex = 0, fasCraigslistAutoPublish = true } =
          await chrome.storage.local.get(['fasCraigslistQueue', 'fasCraigslistIndex', 'fasCraigslistAutoPublish']);
        sendResponse({ ok: true, item: fasCraigslistQueue[fasCraigslistIndex] || null, index: fasCraigslistIndex, total: fasCraigslistQueue.length, autoPublish: fasCraigslistAutoPublish });
      } else if (msg.type === 'advanceCraigslistQueue') {
        // FIX (S-EXT-AUTOPUBLISH-DEDUP, 2026-08-29): compare-and-swap on msg.itemId -- see the
        // reportItemListedOnce() comment above for the full incident. A content script's own
        // fast-path advance call and the onUpdated reliability net's own advance (further up this
        // file) can both legitimately believe they're the one advancing past a given item; without
        // this guard the SAME real publish could increment the index twice (permanently skipping
        // the next item) or leave the two paths disagreeing about which item is "current". If the
        // item currently AT the index doesn't match the itemId the caller thinks it's advancing
        // past, some other path already moved the index -- treat this as an already-succeeded
        // no-op (return the current state unchanged) instead of double-advancing or erroring, so no
        // caller's `.then` chain breaks. msg.itemId is optional for backward compatibility with any
        // caller that doesn't pass it (falls back to the old unconditional-increment behavior).
        const st = await chrome.storage.local.get(['fasCraigslistQueue', 'fasCraigslistIndex']);
        const queue = st.fasCraigslistQueue || [];
        const curIndex = st.fasCraigslistIndex || 0;
        const curItem = queue[curIndex];
        if (msg.itemId != null && (!curItem || curItem.id !== msg.itemId)) {
          sendResponse({ ok: true, item: curItem || null, index: curIndex, total: queue.length, alreadyAdvanced: true });
        } else {
          const next = curIndex + 1;
          await chrome.storage.local.set({ fasCraigslistIndex: next });
          const item = queue[next] || null;
          // 2026-08-31: pass sender.tab.id (was undefined) so the overlay has a tab to inject
          // into on the rare path where this in-page continuation actually runs -- see the
          // header comment above ("never runs after a REAL publish") for why the onUpdated
          // branch's craigslistDelayWithOverlay() call is the one that matters in practice.
          const clAdvanceTabId = sender && sender.tab && sender.tab.id != null ? sender.tab.id : undefined;
          const clBatchBoundary2 = craigslistIsBatchBoundary(next);
          await craigslistDelayWithOverlay(
            clAdvanceTabId,
            clBatchBoundary2 ? CRAIGSLIST_BATCH_COOLDOWN_MS : CRAIGSLIST_QUEUE_ADVANCE_DELAY_MS,
            clBatchBoundary2
          ); // S-EXT-QUEUE-PACING, widened for Craigslist -- see CRAIGSLIST_QUEUE_ADVANCE_DELAY_MS
          sendResponse({ ok: true, item, index: next, total: queue.length });
        }
      } else if (msg.type === 'craigslistLoginStateObserved') {
        // (2026-08-08) Best-effort DOM-observed login state reported by fas-craigslist.js's
        // isLoggedIntoCraigslist(). Only ever a definite true/false (the content script never
        // reports its own "unknown" reading -- see reportLoginState there). Stored so
        // checkRenewals above can skip starting an unattended Craigslist auto-renew run when
        // we've positively observed the organizer is logged out, and so the popup can show the
        // organizer an informational note (getCraigslistLoginState below).
        await chrome.storage.local.set({ fasCraigslistLoginState: !!msg.loggedIn, fasCraigslistLoginObservedAt: Date.now() });
        sendResponse({ ok: true });
      } else if (msg.type === 'getCraigslistLoginState') {
        const { fasCraigslistLoginState = null, fasCraigslistLoginObservedAt = null } =
          await chrome.storage.local.get(['fasCraigslistLoginState', 'fasCraigslistLoginObservedAt']);
        sendResponse({ ok: true, loggedIn: fasCraigslistLoginState, observedAt: fasCraigslistLoginObservedAt });
      } else if (msg.type === 'setGumtreeAuQueue') {
        // ADR-102 (2026-08-09): Gumtree Australia channel -- same shape as setCraigslistQueue
        // above. No autoPublish flag: fas-gumtree-au.js never auto-fills or auto-submits anything
        // (manual-assist only, see its file header), so there is nothing to toggle yet.
        await chrome.storage.local.set({ fasGumtreeAuQueue: msg.queue || [], fasGumtreeAuIndex: 0 });
        chrome.tabs.create({ url: CFG.GT_POST_URL });
        sendResponse({ ok: true });
      } else if (msg.type === 'getGumtreeAuQueueItem') {
        const { fasGumtreeAuQueue = [], fasGumtreeAuIndex = 0 } =
          await chrome.storage.local.get(['fasGumtreeAuQueue', 'fasGumtreeAuIndex']);
        sendResponse({ ok: true, item: fasGumtreeAuQueue[fasGumtreeAuIndex] || null, index: fasGumtreeAuIndex, total: fasGumtreeAuQueue.length });
      } else if (msg.type === 'advanceGumtreeAuQueue') {
        const st = await chrome.storage.local.get(['fasGumtreeAuQueue', 'fasGumtreeAuIndex']);
        const next = (st.fasGumtreeAuIndex || 0) + 1;
        await chrome.storage.local.set({ fasGumtreeAuIndex: next });
        const item = (st.fasGumtreeAuQueue || [])[next] || null;
        await humanQueueDelay(); // S-EXT-QUEUE-PACING, see this file's top-of-file comment
        sendResponse({ ok: true, item, index: next, total: (st.fasGumtreeAuQueue || []).length });
      } else if (msg.type === 'gumtreeAuLoginStateObserved') {
        // (ADR-102, 2026-08-09) Same shape as craigslistLoginStateObserved above -- best-effort
        // DOM-observed reading from fas-gumtree-au.js's isLoggedIntoGumtreeAu(). Only ever a
        // definite true/false; feeds checkRenewals' logged-out gate above and the popup's
        // informational note (getGumtreeAuLoginState below).
        await chrome.storage.local.set({ fasGumtreeAuLoginState: !!msg.loggedIn, fasGumtreeAuLoginObservedAt: Date.now() });
        sendResponse({ ok: true });
      } else if (msg.type === 'getGumtreeAuLoginState') {
        const { fasGumtreeAuLoginState = null, fasGumtreeAuLoginObservedAt = null } =
          await chrome.storage.local.get(['fasGumtreeAuLoginState', 'fasGumtreeAuLoginObservedAt']);
        sendResponse({ ok: true, loggedIn: fasGumtreeAuLoginState, observedAt: fasGumtreeAuLoginObservedAt });
      } else if (msg.type === 'setPoshmarkQueue') {
        // 2026-08-18 dispatch (fas-poshmark.js): same queue-storage shape as
        // setGumtreeAuQueue above. Not wired into autoRenewDueItems()/checkRenewals() above --
        // posting only, no renewal automation for this dispatch.
        // autoPublish (2026-08-22, S-EXT-AUTOPUBLISH-POLICY): fas-poshmark.js's blanket
        // "never auto-publish" was a real deviation from the 2026-07-17 locked decision (full
        // automation including auto-publish is a PRO/TEAMS-only opt-in, not disabled outright) --
        // corrected. Same fasAutoPublish pattern as the FB/Craigslist queues, defaults true.
        // fasPoshmarkRunNotes (2026-08-22, S-EXT-POSHMARK-RUN-SUMMARY, Patrick-directed): reset to
        // empty on every NEW queue -- these accumulate "published but had to guess something"
        // notes across the whole run (see recordPoshmarkRunNote/getPoshmarkRunNotes below) and must
        // not leak stale notes from a prior run into this one.
        // fasPoshmarkQueueTabId cleared first (fail-closed) then set to the real tab id once
        // creation resolves -- see the S-EXT-AUTOPUBLISH-TAB-SCOPE fix in the onUpdated listener above.
        await chrome.storage.local.set({ fasPoshmarkQueue: msg.queue || [], fasPoshmarkIndex: 0, fasPoshmarkAutoPublish: msg.autoPublish !== false, fasPoshmarkRunNotes: [], fasPoshmarkQueueTabId: null });
        const poshQueueTab = await chrome.tabs.create({ url: CFG.POSH_POST_URL });
        await chrome.storage.local.set({ fasPoshmarkQueueTabId: poshQueueTab && poshQueueTab.id != null ? poshQueueTab.id : null });
        sendResponse({ ok: true });
      } else if (msg.type === 'getPoshmarkQueueItem') {
        const { fasPoshmarkQueue = [], fasPoshmarkIndex = 0, fasPoshmarkAutoPublish = true } =
          await chrome.storage.local.get(['fasPoshmarkQueue', 'fasPoshmarkIndex', 'fasPoshmarkAutoPublish']);
        sendResponse({ ok: true, item: fasPoshmarkQueue[fasPoshmarkIndex] || null, index: fasPoshmarkIndex, total: fasPoshmarkQueue.length, autoPublish: fasPoshmarkAutoPublish });
      } else if (msg.type === 'recordPoshmarkRunNote') {
        // FEATURE 2026-08-22 (S-EXT-POSHMARK-RUN-SUMMARY, Patrick-directed): "if you have those
        // kinds of issues they should be given a default to get them published, reported at the
        // end of the run and should not be a reason to stop the extension continuing forward" --
        // auto-publish no longer blocks on a guessed category (see fas-poshmark.js run()); instead
        // each guessed item appends a note here, and the LAST item's Published screen reads all of
        // them back (getPoshmarkRunNotes below) instead of interrupting the run mid-way.
        const { fasPoshmarkRunNotes = [] } = await chrome.storage.local.get(['fasPoshmarkRunNotes']);
        fasPoshmarkRunNotes.push({ title: msg.title || '', note: msg.note || '' });
        await chrome.storage.local.set({ fasPoshmarkRunNotes });
        sendResponse({ ok: true });
      } else if (msg.type === 'getPoshmarkRunNotes') {
        const { fasPoshmarkRunNotes = [] } = await chrome.storage.local.get(['fasPoshmarkRunNotes']);
        sendResponse({ ok: true, notes: fasPoshmarkRunNotes });
      } else if (msg.type === 'advancePoshmarkQueue') {
        // FIX (S-EXT-AUTOPUBLISH-DEDUP, 2026-08-29): same itemId compare-and-swap as
        // advanceCraigslistQueue above -- see its comment for the full rationale.
        const st = await chrome.storage.local.get(['fasPoshmarkQueue', 'fasPoshmarkIndex']);
        const queue = st.fasPoshmarkQueue || [];
        const curIndex = st.fasPoshmarkIndex || 0;
        const curItem = queue[curIndex];
        if (msg.itemId != null && (!curItem || curItem.id !== msg.itemId)) {
          sendResponse({ ok: true, item: curItem || null, index: curIndex, total: queue.length, alreadyAdvanced: true });
        } else {
          const next = curIndex + 1;
          await chrome.storage.local.set({ fasPoshmarkIndex: next });
          const item = queue[next] || null;
          // BUG FIX 2026-08-31 (Patrick live report: Poshmark/Mercari never show the queue-advance
          // countdown Craigslist/FB do): humanQueueDelay() only sends its 'fasQueueDelayStarted'
          // notification when a tabId is actually passed in (see its own comment) -- this call site
          // passed none, so no message was ever sent for Poshmark, independent of whether the content
          // script even listens for it. 'advancePoshmarkQueue' is always sent from fas-poshmark.js's
          // own tab context (same pattern as the FB 'advanceQueue' handler above), so sender.tab.id
          // is the real originating tab.
          // BUG FIX 2026-09-04 (S-EXT-QUEUE-PACING-STUCK-ON-DONE): same root cause as the FB
          // 'advanceQueue' fix above -- this fired even when `item` is null (queue exhausted),
          // leaving the countdown overlay stuck at "...0s" forever after the last item. Only pace
          // when there's a real next item.
          if (item) await humanQueueDelay(sender.tab && sender.tab.id); // S-EXT-QUEUE-PACING, see this file's top-of-file comment
          sendResponse({ ok: true, item, index: next, total: queue.length });
        }
      } else if (msg.type === 'setMercariQueue') {
        // 2026-08-18 dispatch (fas-mercari.js): same queue-storage shape as
        // setGumtreeAuQueue above. Not wired into autoRenewDueItems()/checkRenewals() above --
        // posting only, no renewal automation for this dispatch.
        // autoPublish (2026-08-22, S-EXT-AUTOPUBLISH-POLICY): fas-mercari.js's blanket
        // "never auto-publish" was a real deviation from the 2026-07-17 locked decision (full
        // automation including auto-publish is a PRO/TEAMS-only opt-in, not disabled outright) --
        // corrected. Same fasAutoPublish pattern as the FB/Craigslist queues, defaults true.
        // fasMercariQueueTabId cleared first (fail-closed) then set to the real tab id once
        // creation resolves -- see the S-EXT-AUTOPUBLISH-TAB-SCOPE fix in the onUpdated listener above.
        await chrome.storage.local.set({ fasMercariQueue: msg.queue || [], fasMercariIndex: 0, fasMercariAutoPublish: msg.autoPublish !== false, fasMercariQueueTabId: null });
        const mercQueueTab = await chrome.tabs.create({ url: CFG.MERC_POST_URL });
        await chrome.storage.local.set({ fasMercariQueueTabId: mercQueueTab && mercQueueTab.id != null ? mercQueueTab.id : null });
        sendResponse({ ok: true });
      } else if (msg.type === 'getMercariQueueItem') {
        const { fasMercariQueue = [], fasMercariIndex = 0, fasMercariAutoPublish = true } =
          await chrome.storage.local.get(['fasMercariQueue', 'fasMercariIndex', 'fasMercariAutoPublish']);
        sendResponse({ ok: true, item: fasMercariQueue[fasMercariIndex] || null, index: fasMercariIndex, total: fasMercariQueue.length, autoPublish: fasMercariAutoPublish });
      } else if (msg.type === 'advanceMercariQueue') {
        // FIX (S-EXT-AUTOPUBLISH-DEDUP, 2026-08-29): same itemId compare-and-swap as
        // advanceCraigslistQueue above -- see its comment for the full rationale.
        const st = await chrome.storage.local.get(['fasMercariQueue', 'fasMercariIndex']);
        const queue = st.fasMercariQueue || [];
        const curIndex = st.fasMercariIndex || 0;
        const curItem = queue[curIndex];
        if (msg.itemId != null && (!curItem || curItem.id !== msg.itemId)) {
          sendResponse({ ok: true, item: curItem || null, index: curIndex, total: queue.length, alreadyAdvanced: true });
        } else {
          const next = curIndex + 1;
          await chrome.storage.local.set({ fasMercariIndex: next });
          const item = queue[next] || null;
          // BUG FIX 2026-08-31 (Patrick live report, same root cause as the Poshmark branch above):
          // no tabId was passed, so humanQueueDelay() never sent its countdown notification for
          // Mercari either. 'advanceMercariQueue' always comes from fas-mercari.js's own tab.
          // BUG FIX 2026-09-04 (S-EXT-QUEUE-PACING-STUCK-ON-DONE): same root cause as the FB
          // 'advanceQueue' fix above -- only pace/notify when there's a real next item.
          if (item) await humanQueueDelay(sender.tab && sender.tab.id); // S-EXT-QUEUE-PACING, see this file's top-of-file comment
          sendResponse({ ok: true, item, index: next, total: queue.length });
        }
      } else if (msg.type === 'setVintedQueue') {
        // 2026-08-18 dispatch (fas-vinted.js): same queue-storage shape as
        // setGumtreeAuQueue above -- no autoPublish flag, since fas-vinted.js never
        // auto-clicks the final publish/list action (fills and stops, always -- see
        // that content script's file header). CRITICAL, non-negotiable (see fas-vinted.js's
        // file-header legal constraint): this queue is a one-shot NEW-listing post only --
        // NEVER wire Vinted into autoRenewDueItems()/checkRenewals() above, no timers, no
        // retry-by-resubmitting. Vinted has an active enforcement wave against automated
        // relist/bump behavior.
        await chrome.storage.local.set({ fasVintedQueue: msg.queue || [], fasVintedIndex: 0 });
        // BUG FIX 2026-09-02 (Patrick-reported: left a Vinted listing sitting filled-but-unpublished
        // for ~30min, came back, clicked Vinted's own Upload, and the continue-prompt never showed).
        // Vinted's flow is inherently the most idle-prone of all 7 platforms -- it's the one where
        // FindA.Sale deliberately never auto-clicks Publish (see this file's own legal constraint),
        // so the organizer is expected to sit on a filled, reviewed listing for as long as it takes
        // them to look it over before manually uploading. Chrome's own tab-discarding (Memory Saver /
        // memory-pressure eviction) can silently reload an inactive tab to free memory -- if that
        // happens while this tab is sitting idle, it kills watchForVintedNavigationAway()'s polling
        // interval outright and can wipe the in-page review overlay before Patrick ever gets to Vinted's
        // real Upload button, a plausible contributor to exactly this symptom (the mechanism itself is
        // navigation-triggered, not time-based -- see maybeShowVintedContinuePrompt()'s own comment --
        // so a discard-and-reload, not the elapsed time itself, is the most likely way it could be
        // skipped). chrome.tabs.update's autoDiscardable flag tells Chrome not to auto-discard this
        // specific tab -- best-effort only (Chrome can still discard on severe memory pressure; this
        // is not a hard guarantee), and non-fatal if the call fails for any reason.
        const vintedTab = await chrome.tabs.create({ url: CFG.VINTED_POST_URL });
        try {
          await chrome.tabs.update(vintedTab.id, { autoDiscardable: false });
        } catch (e) {
          console.warn('[FAS] Vinted tab autoDiscardable=false failed (non-fatal):', e && e.message);
        }
        sendResponse({ ok: true });
      } else if (msg.type === 'getVintedQueueItem') {
        const { fasVintedQueue = [], fasVintedIndex = 0 } =
          await chrome.storage.local.get(['fasVintedQueue', 'fasVintedIndex']);
        sendResponse({ ok: true, item: fasVintedQueue[fasVintedIndex] || null, index: fasVintedIndex, total: fasVintedQueue.length });
      } else if (msg.type === 'advanceVintedQueue') {
        const st = await chrome.storage.local.get(['fasVintedQueue', 'fasVintedIndex']);
        const next = (st.fasVintedIndex || 0) + 1;
        await chrome.storage.local.set({ fasVintedIndex: next });
        const item = (st.fasVintedQueue || [])[next] || null;
        // BUG FIX 2026-09-02 (S-EXT-VINTED-NO-COUNTDOWN round 2, Patrick correction: "why would you
        // only remove the cosmetic part?" -- correctly called out that the first pass at this only
        // hid the ticking countdown TEXT and left the actual humanQueueDelay() sleep(10-25s) running
        // underneath, which is worse, not better: the wait is still there but now with less visible
        // reassurance that it's expected. REMOVED the real delay here, not just its display. Per
        // this file's own S-EXT-QUEUE-PACING header comment above (2026-08-30): the shared
        // QUEUE_ADVANCE_DELAY_MS pacing exists to avoid an "obviously-instant machine-gun" listing-
        // creation pattern reading as automated/bannable, and that SAME comment explicitly says
        // "the one CONFIRMED real risk... is Vinted's active enforcement wave against automated
        // relist/bump behavior... already mitigated there by Vinted's manual-publish-only design
        // (fillListing() fills and stops; the organizer always clicks Upload themselves)." In other
        // words: the file's own prior reasoning already establishes Vinted needs no pacing delay
        // here -- every single Vinted listing is gated behind Patrick physically clicking Vinted's
        // real Upload button, so there is no rapid-fire automated listing-creation risk this could
        // ever be protecting against. Advancing the queue is now instant.
        sendResponse({ ok: true, item, index: next, total: (st.fasVintedQueue || []).length });
      } else if (msg.type === 'showVintedContinueNotification') {
        // ADDED 2026-09-02 (S-EXT-VINTED-CONTINUE-UX round 2, Patrick live report: "re shared
        // vinted, same issue no modal on the page after clicking upload"). Root-caused live via
        // read_console_messages on Patrick's actual open Vinted tabs: the on-page continue-prompt
        // toast (fas-vinted.js maybeShowVintedContinuePrompt) WAS firing correctly -- console
        // evidence showed "continue-prompt: showing for item ..." logged exactly once, and a
        // screenshot confirmed the toast was actually rendered, bottom-right -- but it's a small
        // 360px corner toast that's easy to miss, especially with Vinted's own centered "Item
        // listed" dialog often on screen at the same moment competing for attention. A native OS
        // notification can't be missed the same way (survives outside the tab, stays until
        // dismissed/clicked). Content scripts have no direct chrome.notifications access, hence
        // this message-relay from fas-vinted.js. Non-fatal by design -- the on-page toast is the
        // primary UI either way; this is a belt-and-suspenders addition, not a replacement.
        const notifId = 'fasVintedContinue_' + msg.itemId;
        try {
          chrome.notifications.create(notifId, {
            type: 'basic',
            iconUrl: 'icon128.png',
            title: 'FindA.Sale -- ready for the next item?',
            message: 'Finished with "' + (msg.itemTitle || 'this item') + '" on Vinted? Switch back to the tab to continue.',
            priority: 2
          });
        } catch (e) { console.warn('[FAS] showVintedContinueNotification failed (non-fatal):', e && e.message); }
        sendResponse({ ok: true });
      } else if (msg.type === 'setGrailedQueue') {
        // 2026-08-18 dispatch (fas-grailed.js): same queue-storage shape as
        // setGumtreeAuQueue above. Not wired into autoRenewDueItems()/checkRenewals() above --
        // posting only, no renewal automation for this dispatch.
        // autoPublish (2026-08-22, S-EXT-AUTOPUBLISH-POLICY): fas-grailed.js's blanket
        // "never auto-publish" was a real deviation from the 2026-07-17 locked decision (full
        // automation including auto-publish is a PRO/TEAMS-only opt-in, not disabled outright) --
        // corrected. Same fasAutoPublish pattern as the FB/Craigslist queues, defaults true.
        // (fas-grailed.js additionally falls back to manual review whenever Designer wasn't
        // confirmed, regardless of this flag -- see its own file header/run().)
        // fasGrailedQueueTabId cleared first (fail-closed) then set to the real tab id once
        // creation resolves -- see the S-EXT-AUTOPUBLISH-TAB-SCOPE fix in the onUpdated listener
        // above. Updated again on every reopenGrailedTab call below, since Grailed (unlike
        // Poshmark/Mercari/Craigslist) opens a genuinely NEW tab per queue item instead of
        // navigating the same tab in place.
        await chrome.storage.local.set({ fasGrailedQueue: msg.queue || [], fasGrailedIndex: 0, fasGrailedAutoPublish: msg.autoPublish !== false, fasGrailedQueueTabId: null });
        const grailedQueueTab = await chrome.tabs.create({ url: CFG.GRAILED_POST_URL });
        await chrome.storage.local.set({ fasGrailedQueueTabId: grailedQueueTab && grailedQueueTab.id != null ? grailedQueueTab.id : null });
        sendResponse({ ok: true });
      } else if (msg.type === 'getGrailedQueueItem') {
        const { fasGrailedQueue = [], fasGrailedIndex = 0, fasGrailedAutoPublish = true } =
          await chrome.storage.local.get(['fasGrailedQueue', 'fasGrailedIndex', 'fasGrailedAutoPublish']);
        sendResponse({ ok: true, item: fasGrailedQueue[fasGrailedIndex] || null, index: fasGrailedIndex, total: fasGrailedQueue.length, autoPublish: fasGrailedAutoPublish });
      } else if (msg.type === 'reopenGrailedTab') {
        // BUG FIX 2026-08-19 (S-EXT-BATCH, P0): fas-grailed.js used to advance to the next queue
        // item via `location.href = LISTING_URL_HINT` -- a same-URL in-page reassignment (the
        // page is already grailed.com/sell) that doesn't reliably reset Grailed's React SPA state,
        // leaving stale form state behind for every item after the first (only the photo dropzone,
        // likely a persistent/global element, survived -- every other field silently stayed
        // unfilled). background.js only ever opened a genuinely fresh tab for the FIRST item
        // (setGrailedQueue below). This handler gives every SUBSEQUENT item that same real fresh
        // tab/page-load treatment: open a brand-new tab at the post URL, then close the tab the
        // request came from. sender.tab is only present for a content-script message (never a
        // popup message), which this always is -- guarded anyway for safety.
        // FIX (S-EXT-AUTOPUBLISH-TAB-SCOPE, round 8): this opens a brand-new tab for every
        // subsequent Grailed queue item (see the file-header comment above) -- fasGrailedQueueTabId
        // must be re-pointed at that new tab each time, or the onUpdated reliability net would keep
        // matching against the now-closed previous tab's id (which Chrome may even reassign to an
        // unrelated tab later) and never fire for the tab actually running the rest of the queue.
        const newGrailedQueueTab = await chrome.tabs.create({ url: CFG.GRAILED_POST_URL });
        await chrome.storage.local.set({ fasGrailedQueueTabId: newGrailedQueueTab && newGrailedQueueTab.id != null ? newGrailedQueueTab.id : null });
        if (sender && sender.tab && sender.tab.id != null) {
          chrome.tabs.remove(sender.tab.id, () => { void chrome.runtime.lastError; });
        }
        sendResponse({ ok: true });
      } else if (msg.type === 'advanceGrailedQueue') {
        // FIX (S-EXT-AUTOPUBLISH-DEDUP, 2026-08-29): same itemId compare-and-swap as
        // advanceCraigslistQueue above -- see its comment for the full rationale.
        const st = await chrome.storage.local.get(['fasGrailedQueue', 'fasGrailedIndex']);
        const queue = st.fasGrailedQueue || [];
        const curIndex = st.fasGrailedIndex || 0;
        const curItem = queue[curIndex];
        if (msg.itemId != null && (!curItem || curItem.id !== msg.itemId)) {
          sendResponse({ ok: true, item: curItem || null, index: curIndex, total: queue.length, alreadyAdvanced: true });
        } else {
          const next = curIndex + 1;
          await chrome.storage.local.set({ fasGrailedIndex: next });
          const item = queue[next] || null;
          await humanQueueDelay(); // S-EXT-QUEUE-PACING, see this file's top-of-file comment
          sendResponse({ ok: true, item, index: next, total: queue.length });
        }
      } else if (msg.type === 'getRemovalQueueItem') {
        const { fasRemovalQueue = [], fasRemovalIndex = 0 } = await chrome.storage.local.get(['fasRemovalQueue', 'fasRemovalIndex']);
        sendResponse({ ok: true, item: fasRemovalQueue[fasRemovalIndex] || null, index: fasRemovalIndex, total: fasRemovalQueue.length });
      } else if (msg.type === 'advanceRemovalQueue') {
        const st = await chrome.storage.local.get(['fasRemovalQueue', 'fasRemovalIndex']);
        const next = (st.fasRemovalIndex || 0) + 1;
        await chrome.storage.local.set({ fasRemovalIndex: next });
        const item = (st.fasRemovalQueue || [])[next] || null;
        sendResponse({ ok: true, item, index: next, total: (st.fasRemovalQueue || []).length });
      } else if (msg.type === 'getRenewalQueueItem') {
        // (2026-08-09, ADR-100 §10/§11/§12) Native-renew queue -- same shape as
        // getRemovalQueueItem above, deliberately separate storage keys (fasRenewalQueue/
        // fasRenewalIndex) since it holds different, lighter entries ({id, title, saleId}, no
        // full item data needed for a Renew click) even though both share one tab lifecycle.
        const { fasRenewalQueue = [], fasRenewalIndex = 0 } = await chrome.storage.local.get(['fasRenewalQueue', 'fasRenewalIndex']);
        sendResponse({ ok: true, item: fasRenewalQueue[fasRenewalIndex] || null, index: fasRenewalIndex, total: fasRenewalQueue.length });
      } else if (msg.type === 'advanceRenewalQueue') {
        const st = await chrome.storage.local.get(['fasRenewalQueue', 'fasRenewalIndex']);
        const next = (st.fasRenewalIndex || 0) + 1;
        await chrome.storage.local.set({ fasRenewalIndex: next });
        const item = (st.fasRenewalQueue || [])[next] || null;
        sendResponse({ ok: true, item, index: next, total: (st.fasRenewalQueue || []).length });
      } else if (msg.type === 'getRemovalQueueItemFor') {
        // S-EXT-CROSS-PLATFORM-AUTOREMOVE: generic version of getRemovalQueueItem, parameterized
        // by msg.platform instead of hardcoded to Facebook's fasRemovalQueue/fasRemovalIndex.
        const cfg = FAS_CROSS_PLATFORM_REMOVAL_CONFIG[msg.platform];
        if (!cfg) { sendResponse({ ok: false, error: 'unknown_platform' }); }
        else {
          const st = await chrome.storage.local.get([cfg.queueKey, cfg.indexKey]);
          const queue = st[cfg.queueKey] || [];
          const index = st[cfg.indexKey] || 0;
          sendResponse({ ok: true, item: queue[index] || null, index, total: queue.length });
        }
      } else if (msg.type === 'advanceRemovalQueueFor') {
        const cfg = FAS_CROSS_PLATFORM_REMOVAL_CONFIG[msg.platform];
        if (!cfg) { sendResponse({ ok: false, error: 'unknown_platform' }); }
        else {
          const st = await chrome.storage.local.get([cfg.queueKey, cfg.indexKey]);
          const next = (st[cfg.indexKey] || 0) + 1;
          await chrome.storage.local.set({ [cfg.indexKey]: next });
          const queue = st[cfg.queueKey] || [];
          sendResponse({ ok: true, item: queue[next] || null, index: next, total: queue.length });
        }
      } else if (msg.type === 'removalQueueDoneFor') {
        // Mirrors the Facebook-only 'removalQueueDone' handler below, parameterized by platform --
        // restores the organizer's previous tab and closes the auto-opened removal tab (silent
        // mode only; no-ops harmlessly in notify mode, same as the Facebook version, since notify
        // mode never sets a tracked tab id).
        if (FAS_CROSS_PLATFORM_REMOVAL_CONFIG[msg.platform]) await finishSilentCrossPlatformRemoval(msg.platform);
        sendResponse({ ok: true });
      } else if (msg.type === 'markItemRemovedByRemoval') {
        // BUG FIX 2026-08-22 (S-EXT-CROSS-PLATFORM-AUTOREMOVE): now threads msg.platform through
        // (default 'FACEBOOK' preserves fas-remove.js's own exact existing behavior, which never
        // set one before this fix) -- see extensionController.ts markItemRemoved's own comment for
        // why an unset platform silently corrupted per-platform LISTED tracking for any non-
        // Facebook caller.
        sendResponse(await apiFetch('/extension/items/' + encodeURIComponent(msg.itemId) + '/removed',
          { method: 'POST', body: { platform: msg.platform || 'FACEBOOK' } }));
      } else if (msg.type === 'markItemRemovalSkipped') {
        // (2026-07-26 fix) Report a genuine removal skip (zero/ambiguous title match) so the
        // backend can eventually stop re-serving an item that keeps failing the same way --
        // see extensionController.ts's getPendingRemovals dead-letter note.
        sendResponse(await apiFetch('/extension/items/' + encodeURIComponent(msg.itemId) + '/removal-skipped',
          { method: 'POST', body: { reason: msg.reason || null } }));
      } else if (msg.type === 'getFacebookSoldChecks') {
        // (2026-08-05) Reverse-direction cross-channel sync (ADR-084 amendment, Part D):
        // fas-remove.js's sold-detection scan asks for the candidate titles to check against
        // this page's currently-Sold cards. Straight passthrough to the backend -- no local
        // queue/index needed the way removal has one, since the content script checks every
        // candidate in a single DOM pass, not sequentially across separate tab lifecycles.
        sendResponse(await apiFetch('/extension/pending-sold-checks'));
      } else if (msg.type === 'getMessageAutosendDecision') {
        // Feature #602 (2026-08-05): fas-messages.js (advisory-only, see its file header --
        // PENDING LIVE VERIFICATION, never auto-clicks Send) asks the backend how to handle a
        // buyer message it read on a Marketplace inbox thread. Straight passthrough, same
        // shape as markItemSoldFromFacebook above -- ownership/threshold logic all lives
        // server-side (decideMessageAutosendForItem / messageAutosendService.ts), this worker
        // never evaluates a threshold itself.
        sendResponse(await apiFetch('/extension/items/' + encodeURIComponent(msg.itemId) + '/message-autosend-decision',
          { method: 'POST', body: { messageText: msg.messageText || '' } }));
      } else if (msg.type === 'markItemSoldFromFacebook') {
        // fas-remove.js confidently matched this item's title against a Sold card on Facebook's
        // own "Your listings" page -- report it so the backend can commit the SOLD transition
        // and cascade the eBay/Shopify withdrawal (see markItemSoldOnFacebook in
        // extensionController.ts). Mirrors markItemRemovedByRemoval's passthrough shape exactly.
        sendResponse(await apiFetch('/extension/items/' + encodeURIComponent(msg.itemId) + '/sold-on-facebook',
          { method: 'POST', body: {} }));
      } else if (msg.type === 'markAlreadyPosted') {
        // Manual counterpart to markListed above -- the organizer is telling us they already
        // posted this item themselves (outside this extension's automated flow), so there is no
        // MarketplaceListingJob row for it yet. Straight passthrough to the backend's
        // authoritative endpoint (extensionController.ts markItemAlreadyPostedManually), same
        // shape as markItemSoldFromFacebook above -- ownership + Facebook Commerce Policy
        // (coins/currency) gating both live server-side, this worker never re-derives either
        // check. GENERALIZED 2026-08-30 (S-EXT-MARK-POSTED-PARITY): now passes msg.platform
        // through (popup.js sends the current channel, e.g. 'FACEBOOK'/'CRAIGSLIST'/'VINTED')
        // instead of always leaving it unset, which the backend used to default -- and used to
        // hardcode regardless -- to FACEBOOK.
        sendResponse(await apiFetch('/extension/items/' + encodeURIComponent(msg.itemId) + '/mark-posted',
          { method: 'POST', body: { platform: msg.platform } }));
      } else if (msg.type === 'removalQueueDone') {
        // fas-remove.js finished the queue -- restore the organizer's tab + close the auto-opened
        // silent-mode removal tab. No-op in notify mode (no fasRemovalTabId tracked there).
        await finishSilentRemoval();
        sendResponse({ ok: true });
      } else if (msg.type === 'refreshRemovalAlarm') {
        await ensureRemovalAlarm();
        sendResponse({ ok: true });
      } else if (msg.type === 'removalModeChanged') {
        // Mode just changed in the popup -- (re)ensure the alarm for the new mode and poll
        // immediately (throttled) so switching to 'silent'/'notify' acts without waiting 20 min.
        await ensureRemovalAlarm();
        await throttledCheckPendingRemovals();
        sendResponse({ ok: true });
      } else if (msg.type === 'renewModeChanged') {
        // ADR-100: fasAutoRenew toggle just changed in the popup -- re-assert the alarm (in case
        // it was ever cleared) so the new mode takes effect on its next scheduled tick. Renewal
        // isn't time-critical (unlike removal), so this deliberately does NOT also trigger an
        // immediate poll the way removalModeChanged does above.
        await ensureRenewAlarm();
        sendResponse({ ok: true });
      } else if (msg.type === 'fasTrustedClick') {
        // FEATURE 2026-08-24 (S-EXT-ROUND6, Patrick-directed -- "make it work", after live
        // isTrusted instrumentation confirmed Grailed's Designer autocomplete panel-open/select
        // behavior genuinely requires a browser-trusted input event, which a content script's
        // dispatchEvent() calls can never produce). chrome.debugger's CDP Input domain is the one
        // legitimate way an extension can get a real, isTrusted:true click -- it's the same
        // mechanism Puppeteer/Playwright use for browser automation. Requires the sender's own tab
        // (never an arbitrary tabId from the message -- see security note below) and the
        // "debugger" permission (added to manifest.json this round). Chrome shows a persistent
        // "FindA.Sale -- Marketplace Autofill started debugging this browser" infobar on the tab
        // for the duration of the attach -- unavoidable, part of Chrome's own security model, and
        // it also means the tab's real DevTools can't be open at the same time (only one debugger
        // client per tab). Attach -> dispatch mouseMoved/mousePressed/mouseReleased at the given
        // viewport coordinates -> detach immediately, so the infobar is visible only for the
        // fraction of a second the click takes, not for the whole fill run.
        if (!sender.tab || sender.tab.id == null) {
          sendResponse({ ok: false, error: 'no_sender_tab' });
        } else {
          const tabId = sender.tab.id;
          const x = Number(msg.x), y = Number(msg.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            sendResponse({ ok: false, error: 'invalid_coordinates' });
          } else {
            try {
              await new Promise((resolve, reject) => {
                chrome.debugger.attach({ tabId }, '1.3', () => {
                  if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
                  resolve();
                });
              });
              const dispatch = (params) => new Promise((resolve, reject) => {
                chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', params, () => {
                  if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
                  resolve();
                });
              });
              try {
                await dispatch({ type: 'mouseMoved', x, y, buttons: 0 });
                await dispatch({ type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
                await dispatch({ type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
                sendResponse({ ok: true });
              } finally {
                await new Promise((resolve) => chrome.debugger.detach({ tabId }, () => resolve()));
              }
            } catch (e) {
              sendResponse({ ok: false, error: String(e && e.message || e) });
            }
          }
        }
      } else {
        sendResponse({ ok: false, error: 'unknown_message' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message || e) });
    }
  })();
  return true; // async
});
