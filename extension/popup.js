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
  render();
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
    '<div class="meta"><div class="t">' + esc(it.title) + '</div><div class="p">$' + (it.price != null ? it.price : '—') +
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
  btn.textContent = selected.size ? 'List ' + selected.size + ' on Marketplace' : 'List selected on Marketplace';
}

async function startQueue() {
  const queue = ITEMS.filter((it) => selected.has(it.id)).map((it) => ({
    id: it.id, title: it.title, price: it.price, condition: it.condition,
    description: it.description, category: it.category, photoUrls: it.photoUrls || [],
    packageWeightOz: it.packageWeightOz, aiPackageWeightOz: it.aiPackageWeightOz
  }));
  if (!queue.length) return;
  const autoPublish = $('autoPublish').checked;
  await send({ type: 'setQueue', queue, autoPublish });
  chrome.tabs.create({ url: CFG.FB_CREATE_URL });
  window.close();
}

function esc(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

load();
