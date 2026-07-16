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

async function apiFetch(path, opts = {}) {
  const token = await getToken();
  if (!token) return { ok: false, status: 401, error: 'not_signed_in' };
  const res = await fetch(CFG.API_BASE + path, {
    method: opts.method || 'GET',
    headers: Object.assign(
      { 'Authorization': 'Bearer ' + token },
      opts.body ? { 'Content-Type': 'application/json' } : {}
    ),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
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

// ---- CDP (chrome.debugger) trusted-click support ----
// Facebook's shipping-weight radio buttons and modal "Update" control (confirmed live
// 2026-07-15) silently ignore JS-dispatched events (el.dispatchEvent(new MouseEvent(...)))
// regardless of event sequence or coordinates -- Chrome marks script-dispatched events
// isTrusted=false, and these specific controls require trusted input to actually commit a
// selection. chrome.debugger's Input.dispatchMouseEvent produces input Chrome does not
// distinguish from real user input. Content scripts cannot call chrome.debugger directly --
// only the background service worker can -- so fas-content.js messages here for every click.
// Attaching shows Chrome's own persistent "<extension> is debugging this browser" banner on
// the tab for as long as it stays attached -- disclosed to the organizer in the popup/README,
// not a silent capability.
const fasDebuggedTabs = new Set();

async function ensureDebuggerAttached(tabId) {
  if (fasDebuggedTabs.has(tabId)) return;
  await new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      fasDebuggedTabs.add(tabId);
      resolve();
    });
  });
}

async function cdpClick(tabId, x, y) {
  await ensureDebuggerAttached(tabId);
  const send = (params) => new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', params, () => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      resolve();
    });
  });
  await send({ type: 'mouseMoved', x, y, button: 'none' });
  await send({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

// A tab closing, or Chrome/the organizer force-detaching (e.g. clicking "Cancel" on the
// debugging banner), must not leave a stale fasDebuggedTabs entry that skips re-attach on
// the next click -- both are handled so the extension self-heals rather than silently
// failing every subsequent click on that tab.
chrome.tabs.onRemoved.addListener((tabId) => { fasDebuggedTabs.delete(tabId); });
chrome.debugger.onDetach.addListener((source) => {
  if (source && typeof source.tabId === 'number') fasDebuggedTabs.delete(source.tabId);
});

// ---- Cross-channel auto-removal (ADR-084 amendment 2026-07-15, Part C) ----
// Facebook has no API to withdraw a listing server-side the way endEbayListingIfExists() calls
// eBay directly -- this polls GET /extension/pending-removals on a recurring alarm instead, and
// either notifies the organizer (default) or opens a background tab to remove sold items itself,
// per the fasAutoRemoveMode setting ('notify' | 'silent' | 'off', default 'notify').
const FAS_REMOVAL_ALARM = 'fasCheckRemovals';

async function ensureRemovalAlarm() {
  const { fasAutoRemoveMode = 'notify' } = await chrome.storage.local.get(['fasAutoRemoveMode']);
  if (fasAutoRemoveMode === 'off') { chrome.alarms.clear(FAS_REMOVAL_ALARM); return; }
  chrome.alarms.create(FAS_REMOVAL_ALARM, { periodInMinutes: 20 });
}
chrome.runtime.onInstalled.addListener(ensureRemovalAlarm);
chrome.runtime.onStartup.addListener(ensureRemovalAlarm);

async function checkPendingRemovals() {
  const { fasAutoRemoveMode = 'notify' } = await chrome.storage.local.get(['fasAutoRemoveMode']);
  if (fasAutoRemoveMode === 'off') return;
  const resp = await apiFetch('/extension/pending-removals');
  const items = (resp.ok && resp.data && resp.data.items) || [];
  if (!items.length) return;

  await chrome.storage.local.set({ fasRemovalQueue: items, fasRemovalIndex: 0 });

  if (fasAutoRemoveMode === 'silent') {
    chrome.tabs.create({ url: 'https://www.facebook.com/marketplace/you/selling', active: false });
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
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === FAS_REMOVAL_ALARM) checkPendingRemovals(); });
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
        (async () => {
          try {
            const { fasLastRemovalCheckAt = 0 } = await chrome.storage.local.get(['fasLastRemovalCheckAt']);
            if (Date.now() - fasLastRemovalCheckAt < 30000) return;
            await chrome.storage.local.set({ fasLastRemovalCheckAt: Date.now() });
            await checkPendingRemovals();
          } catch (e) {}
        })();
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
      } else if (msg.type === 'cdpClick') {
        const tabId = sender.tab && sender.tab.id;
        if (!tabId) { sendResponse({ ok: false, error: 'no_tab' }); return; }
        await cdpClick(tabId, msg.x, msg.y);
        sendResponse({ ok: true });
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
      } else if (msg.type === 'refreshRemovalAlarm') {
        await ensureRemovalAlarm();
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
