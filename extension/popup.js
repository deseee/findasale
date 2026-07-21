/* FindA.Sale extension popup — lists the organizer's items and starts the queue. */
const CFG = self.FAS_CONFIG;
const $ = (id) => document.getElementById(id);
let ITEMS = [];
const selected = new Set();

function send(msg) { return new Promise((res) => chrome.runtime.sendMessage(msg, res)); }

function setStatus(html) { const s = $('status'); s.hidden = false; s.innerHTML = html; }

async function load() {
  setStatus('Loading your FindA.Sale inventory…');
  const r = await send({ type: 'getItems' });
  if (!r) { setStatus('Something went wrong. Please reopen the extension.'); return; }
  if (r.status === 401 || r.error === 'not_signed_in') {
    setStatus('Please <button class="link" id="signin">sign in to finda.sale</button> first, then reopen this.');
    $('signin').onclick = () => chrome.tabs.create({ url: 'https://finda.sale/login' });
    return;
  }
  if (!r.ok) { setStatus('Couldn\'t load your items: ' + (r.error || 'unknown error') + '.'); return; }
  ITEMS = (r.data && r.data.items) || [];
  if (!ITEMS.length) { setStatus('No items found. Add items to a sale on FindA.Sale, then come back.'); return; }
  $('status').hidden = true;
  $('controls').hidden = false;
  $('footer').hidden = false;
  $('hideListed').onchange = render;
  $('listBtn').onclick = startQueue;
  $('channel').onchange = onChannelChange;
  onChannelChange();
  await loadAutoRemoveMode();
  render();
}

// "When an item sells elsewhere" setting (ADR-084 amendment 2026-07-15, Part C) -- stored
// directly via chrome.storage.local (popup pages have direct access, no message roundtrip
// needed) since it's a standing preference, not a per-queue-run flag like autoPublish.
async function loadAutoRemoveMode() {
  const { fasAutoRemoveMode = 'notify' } = await chrome.storage.local.get(['fasAutoRemoveMode']);
  $('autoRemoveMode').value = fasAutoRemoveMode;
  $('autoRemoveMode').onchange = async () => {
    await chrome.storage.local.set({ fasAutoRemoveMode: $('autoRemoveMode').value });
    // Tell the worker the mode changed so it (re)ensures the alarm AND polls immediately --
    // switching to "Remove automatically" should act now, not on the next 20-min alarm.
    await send({ type: 'removalModeChanged' });
    await renderRemovalDiag();
  };
  await send({ type: 'refreshRemovalAlarm' }); // re-assert the alarm in case the worker never woke since install
  await renderRemovalDiag();
}

// (2026-07-21) Surfaces the alarm-fire instrumentation added in background.js so "is the
// automatic 20-min check actually running" is visible right here instead of requiring the
// service worker's DevTools console. Shows the alarm-driven check separately from this popup's
// own manual/opportunistic trigger so "it only works when I open the extension" is diagnosable
// at a glance, not guessed at.
function timeAgo(ts) {
  if (!ts) return 'never';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return mins + ' min ago';
  const hrs = Math.round(mins / 60);
  return hrs === 1 ? '1 hour ago' : hrs + ' hours ago';
}

async function renderRemovalDiag() {
  const el = $('removalDiag');
  if (!el) return;
  const st = await chrome.storage.local.get([
    'fasLastAlarmFiredAt', 'fasLastAlarmRemovalOutcome',
    'fasLastManualCheckAt', 'fasLastManualRemovalOutcome'
  ]);
  const alarmPart = 'Automatic (~20-min) check: ' + timeAgo(st.fasLastAlarmFiredAt) +
    (st.fasLastAlarmRemovalOutcome ? ' (' + st.fasLastAlarmRemovalOutcome + ')' : '');
  const manualPart = 'Last opened/refocused check: ' + timeAgo(st.fasLastManualCheckAt) +
    (st.fasLastManualRemovalOutcome ? ' (' + st.fasLastManualRemovalOutcome + ')' : '');
  el.textContent = alarmPart + ' \u00b7 ' + manualPart;
}

function currentChannel() { const el = $('channel'); return el ? el.value : 'facebook'; }

// Facebook publishes automatically and manages sold-elsewhere removal; Craigslist does neither
// (the human owns the final publish + all verification), so hide the FB-only controls and show
// the Craigslist explainer when Craigslist is the selected channel.
function onChannelChange() {
  const ch = currentChannel();
  const fb = ch === 'facebook';
  const apRow = $('autoPublishRow'); if (apRow) apRow.hidden = !fb;
  const fbNote = $('fbPublishNote'); if (fbNote) fbNote.hidden = !fb;
  const clNote = $('clPostNote'); if (clNote) clNote.hidden = fb;
  const removeSetting = document.querySelector('.removeSetting'); if (removeSetting) removeSetting.hidden = !fb;
  updateCount();
}

function render() {
  const hideListed = $('hideListed').checked;
  const list = $('list'); list.innerHTML = '';
  const groups = {};
  ITEMS.forEach((it) => {
    if (hideListed && it.marketplaceListed) return;
    (groups[it.saleTitle] = groups[it.saleTitle] || []).push(it);
  });
  const keys = Object.keys(groups);
  if (!keys.length) { list.innerHTML = '<div class="status">All items are already listed. Uncheck "Hide items already listed" to see them.</div>'; }
  keys.forEach((saleTitle) => {
    const h = document.createElement('div'); h.className = 'sale-group'; h.textContent = saleTitle; list.appendChild(h);
    groups[saleTitle].forEach((it) => list.appendChild(row(it)));
  });
  updateCount();
}

function row(it) {
  const d = document.createElement('div'); d.className = 'item';
  const img = it.photoUrls && it.photoUrls[0] ? '<img src="' + it.photoUrls[0] + '">' : '<img>';
  d.innerHTML = img +
    '<div class="meta"><div class="t">' + esc(it.title) + '</div><div class="p">$' + (it.price != null ? Number(it.price).toFixed(2) : '—') +
    ' · ' + esc(it.condition || '') + '</div></div>' +
    (it.marketplaceListed ? '<span class="badge">LISTED</span>' : '<input type="checkbox" class="cb">');
  const cb = d.querySelector('.cb');
  if (cb) {
    cb.checked = selected.has(it.id);
    const toggle = () => { cb.checked = !cb.checked; sync(it.id, cb.checked); };
    d.onclick = (e) => { if (e.target !== cb) toggle(); };
    cb.onclick = (e) => { e.stopPropagation(); sync(it.id, cb.checked); };
  }
  return d;
}

function sync(id, on) { on ? selected.add(id) : selected.delete(id); updateCount(); }
function updateCount() {
  $('selCount').textContent = selected.size;
  const btn = $('listBtn');
  btn.disabled = selected.size === 0;
  const cl = currentChannel() === 'craigslist';
  const verb = cl ? 'Post' : 'List';
  const where = cl ? 'on Craigslist' : 'on Marketplace';
  btn.textContent = selected.size ? verb + ' ' + selected.size + ' ' + where : (cl ? 'Post selected on Craigslist' : 'List selected on Marketplace');
}

async function startQueue() {
  const queue = ITEMS.filter((it) => selected.has(it.id)).map((it) => ({
    id: it.id, title: it.title, price: it.price, condition: it.condition,
    description: it.description, category: it.category, photoUrls: it.photoUrls || [],
    packageWeightOz: it.packageWeightOz, aiPackageWeightOz: it.aiPackageWeightOz,
    shippingOverride: it.shippingOverride,
    allowBestOffer: it.allowBestOffer, bestOfferMinimumAmt: it.bestOfferMinimumAmt,
    // Location passthrough (Craigslist geographic_area + postal). Whatever the backend supplies
    // flows through; absent fields stay undefined and fas-craigslist.js simply leaves the
    // corresponding field for the human to complete -- it never invents a city or ZIP.
    city: it.city, geographicArea: it.geographicArea, saleCity: it.saleCity,
    postal: it.postal, postalCode: it.postalCode, zip: it.zip, saleZip: it.saleZip
  }));
  if (!queue.length) return;
  if (currentChannel() === 'craigslist') {
    // Background stores the Craigslist queue AND opens post.craigslist.org; fas-craigslist.js
    // picks the item up on load. Facebook behavior below is unchanged.
    await send({ type: 'setCraigslistQueue', queue });
    window.close();
    return;
  }
  const autoPublish = $('autoPublish').checked;
  await send({ type: 'setQueue', queue, autoPublish });
  chrome.tabs.create({ url: CFG.FB_CREATE_URL });
  window.close();
}

function esc(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

load();
