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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'getItems') {
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
        await chrome.storage.local.set({ fasQueue: msg.queue || [], fasIndex: 0 });
        sendResponse({ ok: true });
      } else if (msg.type === 'getQueueItem') {
        const { fasQueue = [], fasIndex = 0 } = await chrome.storage.local.get(['fasQueue', 'fasIndex']);
        sendResponse({ ok: true, item: fasQueue[fasIndex] || null, index: fasIndex, total: fasQueue.length });
      } else if (msg.type === 'advanceQueue') {
        const st = await chrome.storage.local.get(['fasQueue', 'fasIndex']);
        const next = (st.fasIndex || 0) + 1;
        await chrome.storage.local.set({ fasIndex: next });
        const item = (st.fasQueue || [])[next] || null;
        sendResponse({ ok: true, item, index: next, total: (st.fasQueue || []).length });
      } else {
        sendResponse({ ok: false, error: 'unknown_message' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message || e) });
    }
  })();
  return true; // async
});
