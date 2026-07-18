/* FindA.Sale extension — background service worker.
 * Roles: (1) read the organizer's finda.sale auth cookie and call the API with a
 * Bearer token; (2) fetch item photos cross-origin (Cloudinary + eBay hosts) and
 * hand them to the content script as data URLs; (3) hold the listing queue.
 */
importScripts('config.js');
const CFG = self.FAS_CONFIG;

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
  const token = _token || await getToken();
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
  // active:true so Facebook actually RENDERS the survey modal (the whole point of this fix).
  const tab = await chrome.tabs.create({ url: 'https://www.facebook.com/marketplace/you/selling', active: true });
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

async function checkPendingRemovals() {
  const { fasAutoRemoveMode = 'notify' } = await chrome.storage.local.get(['fasAutoRemoveMode']);
  if (fasAutoRemoveMode === 'off') return;
  // Guard (silent mode only): don't poll/open another removal tab while one is mid-run. Also
  // prevents overwriting fasRemovalQueue/fasRemovalIndex under an in-progress content script,
  // which would corrupt its queue position. Notify mode never auto-creates a tab, so unaffected.
  if (fasAutoRemoveMode === 'silent' && await silentRemovalInProgress()) return;
  const resp = await apiFetch('/extension/pending-removals');
  const items = (resp.ok && resp.data && resp.data.items) || [];
  if (!items.length) return;

  await chrome.storage.local.set({ fasRemovalQueue: items, fasRemovalIndex: 0 });

  if (fasAutoRemoveMode === 'silent') {
    await openSilentRemovalTab();
    return;
  }

  // 'notify' -- Chrome notification; clicking it opens the removal page in an active tab
  // (the content script picks up the already-stored queue on load, same as the listing flow
  // never needing an open popup to run).
  chrome.notifications.create('fasPendingRemovals', {
    type: 'basic',
    iconUrl: 'icon128.png',
    title: 'FindA.Sale',
    message: items.length === 1
      ? '1 item sold elsewhere — remove it from Facebook Marketplace?'
      : items.length + ' items sold elsewhere — remove them from Facebook Marketplace?',
    priority: 1
  });
}
// Shared 30s throttle for on-demand checks (popup open, startup/install, mode change) so
// rapid reloads can't spawn duplicate removal tabs. The recurring 20-min alarm path below stays
// unguarded so the steady-state poll always runs.
async function throttledCheckPendingRemovals() {
  try {
    const { fasLastRemovalCheckAt = 0 } = await chrome.storage.local.get(['fasLastRemovalCheckAt']);
    if (Date.now() - fasLastRemovalCheckAt < 30000) return;
    await chrome.storage.local.set({ fasLastRemovalCheckAt: Date.now() });
    await checkPendingRemovals();
  } catch (e) {}
}
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === FAS_REMOVAL_ALARM) return checkPendingRemovals(); /* return the promise so MV3 keeps the SW alive until the poll+removal completes */ });
chrome.notifications.onClicked.addListener((notifId) => {
  if (notifId !== 'fasPendingRemovals') return;
  chrome.notifications.clear(notifId);
  chrome.tabs.create({ url: 'https://www.facebook.com/marketplace/you/selling', active: true });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'getItems') {
        // Also check for sold-elsewhere Marketplace removals whenever the popup opens -- the
        // 20-min alarm alone means a just-sold item can sit un-removed for up to 20 min. This
        // makes removals fire on-demand (and makes the flow testable without waiting). Fire-and-
        // forget so it never blocks the item list. Guarded by a 30s throttle so rapid popup
        // re-opens can't spawn duplicate removal tabs; the 20-min alarm path stays unguarded.
        // (2026-07-16)
        throttledCheckPendingRemovals(); // fire-and-forget; shared 30s throttle
        sendResponse(await apiFetch('/extension/items'));
      } else if (msg.type === 'markListed') {
        sendResponse(await apiFetch('/extension/items/' + encodeURIComponent(msg.itemId) + '/listed',
          { method: 'POST', body: { remoteListingId: msg.remoteListingId || null } }));
      } else if (msg.type === 'markRemoved') {
        sendResponse(await apiFetch('/extension/items/' + encodeURIComponent(msg.itemId) + '/removed',
          { method: 'POST', body: {} }));
      } else if (msg.type === 'fetchPhotos') {
        const urls = (msg.urls || []).slice(0, 10); // FB caps ~10 photos/listing
        const out = [];
        for (const u of urls) { try { out.push(await fetchImageDataUrl(u)); } catch (e) { /* skip bad img */ } }
        sendResponse({ ok: true, dataUrls: out });
      } else if (msg.type === 'setQueue') {
        await chrome.storage.local.set({ fasQueue: msg.queue || [], fasIndex: 0, fasAutoPublish: msg.autoPublish !== false });
        sendResponse({ ok: true });
      } else if (msg.type === 'getQueueItem') {
        const { fasQueue = [], fasIndex = 0, fasAutoPublish = true } = await chrome.storage.local.get(['fasQueue', 'fasIndex', 'fasAutoPublish']);
        sendResponse({ ok: true, item: fasQueue[fasIndex] || null, index: fasIndex, total: fasQueue.length, autoPublish: fasAutoPublish });
      } else if (msg.type === 'advanceQueue') {
        const st = await chrome.storage.local.get(['fasQueue', 'fasIndex']);
        const next = (st.fasIndex || 0) + 1;
        await chrome.storage.local.set({ fasIndex: next });
        const item = (st.fasQueue || [])[next] || null;
        sendResponse({ ok: true, item, index: next, total: (st.fasQueue || []).length });
      } else if (msg.type === 'setCraigslistQueue') {
        // Craigslist channel (ADR-084 extension): store the queue and OPEN the posting tab here in
        // the worker (parallel to the FB flow, which stores fasQueue then the popup opens the FB
        // tab). fas-craigslist.js reads fasCraigslistQueue/fasCraigslistIndex via
        // getCraigslistQueueItem once post.craigslist.org loads. Kept fully separate from the FB
        // queue keys so the two channels never interfere.
        await chrome.storage.local.set({ fasCraigslistQueue: msg.queue || [], fasCraigslistIndex: 0 });
        chrome.tabs.create({ url: CFG.CL_POST_URL });
        sendResponse({ ok: true });
      } else if (msg.type === 'getCraigslistQueueItem') {
        const { fasCraigslistQueue = [], fasCraigslistIndex = 0 } = await chrome.storage.local.get(['fasCraigslistQueue', 'fasCraigslistIndex']);
        sendResponse({ ok: true, item: fasCraigslistQueue[fasCraigslistIndex] || null, index: fasCraigslistIndex, total: fasCraigslistQueue.length });
      } else if (msg.type === 'advanceCraigslistQueue') {
        const st = await chrome.storage.local.get(['fasCraigslistQueue', 'fasCraigslistIndex']);
        const next = (st.fasCraigslistIndex || 0) + 1;
        await chrome.storage.local.set({ fasCraigslistIndex: next });
        const item = (st.fasCraigslistQueue || [])[next] || null;
        sendResponse({ ok: true, item, index: next, total: (st.fasCraigslistQueue || []).length });
      } else if (msg.type === 'getRemovalQueueItem') {
        const { fasRemovalQueue = [], fasRemovalIndex = 0 } = await chrome.storage.local.get(['fasRemovalQueue', 'fasRemovalIndex']);
        sendResponse({ ok: true, item: fasRemovalQueue[fasRemovalIndex] || null, index: fasRemovalIndex, total: fasRemovalQueue.length });
      } else if (msg.type === 'advanceRemovalQueue') {
        const st = await chrome.storage.local.get(['fasRemovalQueue', 'fasRemovalIndex']);
        const next = (st.fasRemovalIndex || 0) + 1;
        await chrome.storage.local.set({ fasRemovalIndex: next });
        const item = (st.fasRemovalQueue || [])[next] || null;
        sendResponse({ ok: true, item, index: next, total: (st.fasRemovalQueue || []).length });
      } else if (msg.type === 'markItemRemovedByRemoval') {
        sendResponse(await apiFetch('/extension/items/' + encodeURIComponent(msg.itemId) + '/removed', { method: 'POST', body: {} }));
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
      } else {
        sendResponse({ ok: false, error: 'unknown_message' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message || e) });
    }
  })();
  return true; // async
});
