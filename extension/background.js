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

  // Sold-checks failure is non-fatal to the removal flow above -- a broken/unreachable
  // pending-sold-checks call must never block a genuine pending removal from being processed.
  let soldCheckCount = 0;
  try {
    const soldResp = await apiFetch('/extension/pending-sold-checks');
    if (soldResp.ok) soldCheckCount = ((soldResp.data && soldResp.data.items) || []).length;
  } catch (e) { /* non-fatal -- see comment above */ }

  if (!items.length && !soldCheckCount) return 'no_items';

  // fasRemovalQueue only ever carries removal-processing candidates -- sold-check candidates
  // are fetched fresh by fas-remove.js itself (getFacebookSoldChecks) once the tab loads there;
  // no separate local queue needed for that flow (a single DOM scan against every candidate in
  // one pass, not runRemovalQueue's sequential per-item tab-lifecycle processing).
  await chrome.storage.local.set({ fasRemovalQueue: items, fasRemovalIndex: 0 });

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
// saved-search alarm above. Default behavior (fasAutoRenew unset/false) is notify-only,
// mirroring checkSavedSearchAlerts's notification-per-match shape (ADR-100 §5). When the
// organizer has explicitly opted in via the popup's "Automatically renew" toggle
// (fasAutoRenew=true, chrome.storage.local, same off-by-default-toggle mechanism as the
// existing fasAutoRemoveMode/fasQueue autoPublish settings), a due item is instead re-queued
// through the SAME posting flow fas-content.js/fas-craigslist.js already use for a first-time
// post -- no duplicated FB/Craigslist automation logic (ADR-100 §8 amendment).
// TODO Patrick: confirm the alarm's polling interval per ADR-100 §7 Q3 -- renewal isn't
// time-critical the way the 20-min removal alarm is, so once/day (1440 min) is proposed here
// as a starting point, not a validated final value.
const FAS_RENEW_ALARM = 'fasRenewNudge';
const FAS_RENEW_PERIOD_MINUTES = 1440; // TODO Patrick: confirm per ADR-100 §7 Q3 (placeholder: once/day)

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
  const { fasQueue = [], fasIndex = 0 } = await chrome.storage.local.get(['fasQueue', 'fasIndex']);
  return fasIndex < fasQueue.length;
}

// Builds one posting-queue entry from a full /extension/items record. Deliberately mirrors
// popup.js's startQueue() field list exactly (same never-invent-a-value rule for location
// fields) -- this is the one place outside popup.js that needs to build a queue entry, since
// auto-renewal runs with no popup open at all.
function buildRenewalQueueItem(it, organizerEmail) {
  return {
    id: it.id, title: it.title, price: it.price, condition: it.condition,
    description: it.description, category: it.category, photoUrls: it.photoUrls || [],
    packageWeightOz: it.packageWeightOz, aiPackageWeightOz: it.aiPackageWeightOz,
    shippingOverride: it.shippingOverride,
    allowBestOffer: it.allowBestOffer, bestOfferMinimumAmt: it.bestOfferMinimumAmt,
    city: it.city, geographicArea: it.geographicArea, saleCity: it.saleCity,
    postal: it.postal, postalCode: it.postalCode, zip: it.zip, saleZip: it.saleZip,
    saleAddress: it.saleAddress,
    email: organizerEmail || null
  };
}

// Auto-renew path (fasAutoRenew=true): re-drives the EXISTING posting flow for each due item,
// exactly as if the organizer had selected it in the popup and clicked "List"/"Post" with
// "Publish automatically" checked -- autoPublish is forced true here since no human is present
// to click Publish. Craigslist's own doPreviewStep already stops and hands off to a manual
// notification if it can't find a publish button (most likely a phone/email/CAPTCHA
// verification step it doesn't recognize, per fas-craigslist.js's existing guardrail) -- that
// existing behavior is reused as-is, not re-implemented here (ADR-100 §8's verification
// boundary requirement).
async function autoRenewDueItems(dueItems) {
  if (!dueItems.length) return 'no_items';
  const itemsResp = await apiFetch('/extension/items');
  if (!itemsResp.ok) return 'error:' + (itemsResp.error || itemsResp.status);
  const fullItems = (itemsResp.data && itemsResp.data.items) || [];
  const organizerEmail = (itemsResp.data && itemsResp.data.organizer && itemsResp.data.organizer.email) || null;
  const fullItemById = new Map(fullItems.map((it) => [it.id, it]));

  const fbQueue = [];
  const clQueue = [];
  for (const due of dueItems) {
    const full = fullItemById.get(due.id);
    if (!full) continue; // no longer AVAILABLE/listable -- getExtensionItems already excludes it
    const entry = buildRenewalQueueItem(full, organizerEmail);
    if (due.platform === 'CRAIGSLIST') clQueue.push(entry); else fbQueue.push(entry);
  }

  let started = 0;
  if (fbQueue.length && !(await hasActiveQueue('FACEBOOK'))) {
    await chrome.storage.local.set({ fasQueue: fbQueue, fasIndex: 0, fasAutoPublish: true, fasQueueSetAt: Date.now() });
    chrome.tabs.create({ url: CFG.FB_CREATE_URL, active: false });
    started += fbQueue.length;
  }
  if (clQueue.length && !(await hasActiveQueue('CRAIGSLIST'))) {
    await chrome.storage.local.set({ fasCraigslistQueue: clQueue, fasCraigslistIndex: 0, fasCraigslistAutoPublish: true });
    chrome.tabs.create({ url: CFG.CL_POST_URL, active: false });
    started += clQueue.length;
  }
  return started ? 'auto_renew_started:' + started : 'skipped_active_queue';
}

// Notify-only path (fasAutoRenew=false, the default): mirrors checkSavedSearchAlerts's
// notification-per-match shape exactly -- one notification per due item, deep-linking to the
// item's sale page so the organizer lands on the right listing to renew manually.
async function notifyDueRenewals(dueItems) {
  if (!dueItems.length) return 'no_items';
  for (const due of dueItems) {
    const notifId = 'fasRenewDue_' + due.id;
    const url = due.saleId ? ('https://finda.sale/sales/' + due.saleId) : 'https://finda.sale/organizer/marketplace-extension';
    await chrome.storage.local.set({ ['fasRenewUrl_' + due.id]: url });
    const platformLabel = due.platform === 'CRAIGSLIST' ? 'Craigslist' : 'Facebook Marketplace';
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

  const { fasAutoRenew = false } = await chrome.storage.local.get(['fasAutoRenew']);
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
  const { fasCraigslistLoginState = null } = await chrome.storage.local.get(['fasCraigslistLoginState']);
  if (fasCraigslistLoginState === false) {
    const clDue = dueItems.filter((d) => d.platform === 'CRAIGSLIST');
    const otherDue = dueItems.filter((d) => d.platform !== 'CRAIGSLIST');
    const clOutcome = clDue.length ? await notifyDueRenewals(clDue) : 'no_items';
    const otherOutcome = otherDue.length ? await autoRenewDueItems(otherDue) : 'no_items';
    return 'cl_notified_logged_out:' + clOutcome + ' other_auto_renewed:' + otherOutcome;
  }

  return await autoRenewDueItems(dueItems);
}

chrome.alarms.onAlarm.addListener((alarm) => {
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
  // return the combined promise so MV3 keeps the SW alive until BOTH polls complete
  return Promise.all([
    checkPendingRemovals().catch((e) => 'error:' + String((e && e.message) || e)),
    checkPendingUpdates().catch((e) => 'error:' + String((e && e.message) || e))
  ]).then(([removalOutcome, updateOutcome]) => chrome.storage.local.set({
    fasLastAlarmFiredAt: Date.now(),
    fasLastAlarmRemovalOutcome: removalOutcome,
    fasLastAlarmUpdateOutcome: updateOutcome
  }));
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
    chrome.tabs.create({ url: 'https://www.facebook.com/marketplace/you/selling', active: true });
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
  }
});

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
      } else if (msg.type === 'markListed') {
        // ADR-100 (2026-08-06/07): platform threaded through -- fas-content.js's FB call site
        // never sets it (defaults 'FACEBOOK' server-side, matching today's behavior exactly);
        // fas-craigslist.js's new call site sets 'CRAIGSLIST'.
        sendResponse(await apiFetch('/extension/items/' + encodeURIComponent(msg.itemId) + '/listed',
          { method: 'POST', body: { remoteListingId: msg.remoteListingId || null, platform: msg.platform || 'FACEBOOK' } }));
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
        sendResponse({ ok: true, item, index: next, total: (st.fasQueue || []).length });
      } else if (msg.type === 'setCraigslistQueue') {
        // Craigslist channel (ADR-084 extension): store the queue and OPEN the posting tab here in
        // the worker (parallel to the FB flow, which stores fasQueue then the popup opens the FB
        // tab). fas-craigslist.js reads fasCraigslistQueue/fasCraigslistIndex via
        // getCraigslistQueueItem once post.craigslist.org loads. Kept fully separate from the FB
        // queue keys so the two channels never interfere.
        // autoPublish (2026-08-06): same fasAutoPublish pattern as the FB queue below --
        // defaults true unless the popup checkbox was explicitly unchecked.
        await chrome.storage.local.set({ fasCraigslistQueue: msg.queue || [], fasCraigslistIndex: 0, fasCraigslistAutoPublish: msg.autoPublish !== false });
        chrome.tabs.create({ url: CFG.CL_POST_URL });
        sendResponse({ ok: true });
      } else if (msg.type === 'getCraigslistQueueItem') {
        const { fasCraigslistQueue = [], fasCraigslistIndex = 0, fasCraigslistAutoPublish = true } =
          await chrome.storage.local.get(['fasCraigslistQueue', 'fasCraigslistIndex', 'fasCraigslistAutoPublish']);
        sendResponse({ ok: true, item: fasCraigslistQueue[fasCraigslistIndex] || null, index: fasCraigslistIndex, total: fasCraigslistQueue.length, autoPublish: fasCraigslistAutoPublish });
      } else if (msg.type === 'advanceCraigslistQueue') {
        const st = await chrome.storage.local.get(['fasCraigslistQueue', 'fasCraigslistIndex']);
        const next = (st.fasCraigslistIndex || 0) + 1;
        await chrome.storage.local.set({ fasCraigslistIndex: next });
        const item = (st.fasCraigslistQueue || [])[next] || null;
        sendResponse({ ok: true, item, index: next, total: (st.fasCraigslistQueue || []).length });
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
      } else {
        sendResponse({ ok: false, error: 'unknown_message' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message || e) });
    }
  })();
  return true; // async
});
