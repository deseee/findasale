/* FindA.Sale extension popup — lists the organizer's items and starts the queue. */
const CFG = self.FAS_CONFIG;
const $ = (id) => document.getElementById(id);
let ITEMS = [];
let ORGANIZER = null;
const selected = new Set();

// (#596 Guild/XP Toolbar Tie-In) Canonical rank emoji/labels + XP floors, mirrored from
// packages/frontend/pages/shopper/guild-primer.tsx (RANK_THRESHOLDS) and
// packages/backend/src/services/xpService.ts (RANK_THRESHOLDS) -- these are stable public
// constants already shown on the finda.sale guild-primer page, not invented here. Kept as a
// small local map so the popup can render a "X / Y XP to next rank" bar without needing a new
// backend field (GET /api/xp/profile already returns nextRankXp but not the current-rank floor).
const GUILD_RANK_META = {
  INITIATE: { emoji: '\ud83e\udded', label: 'Initiate', floor: 0 },
  SCOUT: { emoji: '\ud83d\udd0d', label: 'Scout', floor: 500 },
  RANGER: { emoji: '\ud83c\udfaf', label: 'Ranger', floor: 2000 },
  SAGE: { emoji: '\u2728', label: 'Sage', floor: 5000 },
  GRANDMASTER: { emoji: '\ud83d\udc51', label: 'Grandmaster', floor: 12000 },
};

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
  loadGuildXp(); // fire-and-forget, best-effort -- auth already confirmed by getItems above; never blocks the item list
  if (!r.ok) { setStatus('Couldn\'t load your items: ' + (r.error || 'unknown error') + '.'); return; }
  ITEMS = (r.data && r.data.items) || [];
  ORGANIZER = (r.data && r.data.organizer) || null;
  if (!ITEMS.length) { setStatus('No items found. Add items to a sale on FindA.Sale, then come back.'); return; }
  $('status').hidden = true;
  $('controls').hidden = false;
  $('footer').hidden = false;
  $('hideListed').onchange = render;
  $('listBtn').onclick = startQueue;
  $('channel').onchange = onChannelChange;
  onChannelChange();
  await loadAutoRemoveMode();
  await loadAutoRenewSetting();
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

// ADR-100 (2026-08-06/07): "Automatically renew expiring listings" setting -- same
// chrome.storage.local standing-preference mechanism as fasAutoRemoveMode above (not a new
// settings mechanism, per ADR-100 §8's explicit instruction to mirror the existing pattern).
// On by default as of 2026-08-09 (Patrick: "renews should be automated not nudged") --
// organizer can still opt out. fasAutoRenew defaults true here AND in background.js's
// checkRenewals -- both defaults must agree, since either read site could run first
// depending on alarm timing.
async function loadAutoRenewSetting() {
  const el = $('autoRenew');
  if (!el) return;
  const { fasAutoRenew = true } = await chrome.storage.local.get(['fasAutoRenew']);
  el.checked = fasAutoRenew;
  el.onchange = async () => {
    await chrome.storage.local.set({ fasAutoRenew: el.checked });
    await send({ type: 'renewModeChanged' });
  };
}

function currentChannel() { const el = $('channel'); return el ? el.value : 'facebook'; }

// (2026-08-08 fix) marketplaceListed on each item used to be a single any-platform flag --
// posting to Facebook made an item show LISTED (and get hidden by "Hide items already listed")
// even on the Craigslist channel, and vice versa. The backend now returns
// marketplaceListedFacebook / marketplaceListedCraigslist separately (extensionController.ts);
// this reads whichever one matches the currently-selected channel.
function currentListedFlag(it) {
  const ch = currentChannel();
  if (ch === 'craigslist') return it.marketplaceListedCraigslist === true;
  if (ch === 'gumtree_au') return it.marketplaceListedGumtreeAu === true;
  return it.marketplaceListedFacebook === true;
}

// Facebook publishes automatically and manages sold-elsewhere removal; Craigslist does neither
// (the human owns the final publish + all verification), so hide the FB-only controls and show
// the Craigslist explainer when Craigslist is the selected channel.
function onChannelChange() {
  const ch = currentChannel();
  const fb = ch === 'facebook';
  const cl = ch === 'craigslist';
  const gt = ch === 'gumtree_au';
  // autoPublishRow (2026-08-06): Publish automatically now applies to Craigslist too --
  // shown for both channels, no longer FB-only. fas-craigslist.js's doPreviewStep clicks
  // Craigslist's own publish button when checked, same as fas-content.js already does for FB.
  // ADR-102 (2026-08-09): hidden for Gumtree Australia -- fas-gumtree-au.js never auto-fills or
  // auto-submits anything (manual-assist only), so there is nothing for this checkbox to control.
  const fbNote = $('fbPublishNote'); if (fbNote) fbNote.hidden = !fb;
  const clNote = $('clPostNote'); if (clNote) clNote.hidden = !cl;
  const gtNote = $('gtPostNote'); if (gtNote) gtNote.hidden = !gt;
  const autoPublishRow = $('autoPublishRow'); if (autoPublishRow) autoPublishRow.hidden = gt;
  const removeSetting = document.querySelector('.removeSetting'); if (removeSetting) removeSetting.hidden = !fb;
  // (2026-08-08 fix) The item list's LISTED badges/hide-filter are channel-specific (see
  // currentListedFlag above) but this handler never used to re-render on channel switch, so
  // switching "Post to" showed stale badges from whichever channel was selected on load.
  if (cl) renderCraigslistLoginNote(); else { const n = $('clLoginNote'); if (n) n.hidden = true; }
  if (gt) renderGumtreeAuLoginNote(); else { const n = $('gtLoginNote'); if (n) n.hidden = true; }
  if (ITEMS.length) render();
  updateCount();
}

// (2026-08-08) Best-effort informational note -- last DOM-observed Craigslist login state from
// fas-craigslist.js's isLoggedIntoCraigslist (reported via background.js's
// craigslistLoginStateObserved handler). Never a hard gate, purely context: explains why a
// guest-posted listing needs the "I posted" confirm click, and why unattended auto-renew will
// notify instead of posting when the last known state is logged-out. May be stale or
// never-observed (loggedIn null) -- the note stays hidden in that case rather than guessing.
async function renderCraigslistLoginNote() {
  const n = $('clLoginNote');
  if (!n) return;
  const r = await send({ type: 'getCraigslistLoginState' });
  if (!r || !r.ok || r.loggedIn == null) { n.hidden = true; return; }
  n.hidden = false;
  n.textContent = r.loggedIn
    ? 'Craigslist: logged in as of the last check.'
    : 'Craigslist: not logged in as of the last check \u2014 guest posts need email verification, and unattended auto-renew will notify you instead of posting until you\'re logged in.';
}

// (ADR-102, 2026-08-09) Same best-effort informational note as renderCraigslistLoginNote above,
// for Gumtree Australia -- more load-bearing here since Gumtree AU's ENTIRE posting flow is
// login-walled (unlike Craigslist's guest-postable flow), so "not logged in" is the single
// biggest reason an unattended renewal would silently fail to post.
async function renderGumtreeAuLoginNote() {
  const n = $('gtLoginNote');
  if (!n) return;
  const r = await send({ type: 'getGumtreeAuLoginState' });
  if (!r || !r.ok || r.loggedIn == null) { n.hidden = true; return; }
  n.hidden = false;
  n.textContent = r.loggedIn
    ? 'Gumtree Australia: logged in as of the last check.'
    : 'Gumtree Australia: not logged in as of the last check \u2014 sign in before posting, and unattended auto-renew will notify you instead of trying until you\'re logged in.';
}

function render() {
  const hideListed = $('hideListed').checked;
  const list = $('list'); list.innerHTML = '';
  const groups = {};
  ITEMS.forEach((it) => {
    if (hideListed && currentListedFlag(it)) return;
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
    (currentListedFlag(it) ? '<span class="badge">LISTED</span>' : '') +
    '<input type="checkbox" class="cb">';
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
  const ch = currentChannel();
  // ADR-102 (2026-08-09): generalized from a single craigslist-vs-not check to a small map so
  // Gumtree Australia gets its own label without re-deriving this logic a third time.
  const POST_LABELS = { craigslist: 'on Craigslist', gumtree_au: 'on Gumtree Australia' };
  const where = POST_LABELS[ch] || 'on Marketplace';
  const verb = POST_LABELS[ch] ? 'Post' : 'List';
  btn.textContent = selected.size ? verb + ' ' + selected.size + ' ' + where : (POST_LABELS[ch] ? ('Post selected ' + where) : 'List selected on Marketplace');
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
    postal: it.postal, postalCode: it.postalCode, zip: it.zip, saleZip: it.saleZip,
    // 2026-08-06: Craigslist geoverify-step street address ("add map" screen's #xstreet0) --
    // same never-invent passthrough as the other location fields above.
    saleAddress: it.saleAddress,
    // 2026-08-06: Craigslist reply-option email -- the organizer's own account email
    // (data we already have), same "fill what we already have, invent nothing" rule.
    email: (ORGANIZER && ORGANIZER.email) || null
  }));
  if (!queue.length) return;
  if (currentChannel() === 'craigslist') {
    // Background stores the Craigslist queue AND opens post.craigslist.org; fas-craigslist.js
    // picks the item up on load. Facebook behavior below is unchanged.
    // autoPublish (2026-08-06): same shared #autoPublish checkbox as the FB flow below.
    const autoPublish = $('autoPublish').checked;
    await send({ type: 'setCraigslistQueue', queue, autoPublish });
    window.close();
    return;
  }
  if (currentChannel() === 'gumtree_au') {
    // ADR-102 (2026-08-09): Background stores the queue AND opens the Gumtree AU post-ad page;
    // fas-gumtree-au.js picks the item up on load. No autoPublish param -- that flow is
    // manual-assist only, there's nothing to auto-publish yet.
    await send({ type: 'setGumtreeAuQueue', queue });
    window.close();
    return;
  }
  const autoPublish = $('autoPublish').checked;
  await send({ type: 'setQueue', queue, autoPublish });
  chrome.tabs.create({ url: CFG.FB_CREATE_URL });
  window.close();
}

function esc(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// (#596 Guild/XP Toolbar Tie-In) Small retention hook -- surfaces the logged-in user's
// Explorer's Guild rank + XP progress right in the toolbar popup, reusing the existing
// authenticated GET /api/xp/profile data (via background.js's new 'getGuildXp' message).
// Best-effort only: any failure here silently leaves the bar hidden and never blocks or
// errors the item-listing flow, which is the popup's actual job.
async function loadGuildXp() {
  try {
    const r = await send({ type: 'getGuildXp' });
    if (r && r.ok && r.data) renderGuildXp(r.data);
  } catch (e) { /* best-effort -- guild bar just stays hidden */ }
}

function renderGuildXp(p) {
  if (!p || !p.explorerRank) return;
  const meta = GUILD_RANK_META[p.explorerRank] || GUILD_RANK_META.INITIATE;
  $('guildEmoji').textContent = meta.emoji;
  $('guildRankLabel').textContent = meta.label;

  const rp = p.rankProgress || {};
  const fill = $('guildXpFill');
  const text = $('guildXpText');
  const guildXp = p.guildXp || 0;

  if (rp.nextRank && rp.nextRankXp != null) {
    const nextMeta = GUILD_RANK_META[rp.nextRank];
    const span = rp.nextRankXp - meta.floor;
    const into = guildXp - meta.floor;
    const pct = span > 0 ? Math.max(0, Math.min(100, Math.round((into / span) * 100))) : 100;
    fill.style.width = pct + '%';
    text.textContent = guildXp + ' / ' + rp.nextRankXp + ' XP to ' + (nextMeta ? nextMeta.label : rp.nextRank);
  } else {
    // Already at Grandmaster -- no next rank to progress toward.
    fill.style.width = '100%';
    text.textContent = guildXp + ' XP \u00b7 Max rank';
  }

  // (#586 Guild/XP Toolbar Tie-In) Hunt Pass status -- huntPassActive/huntPassExpiry come back
  // on the same GET /api/xp/profile payload (packages/backend/src/services/xpService.ts
  // getUserXpProfile), no extra request needed. Shown plainly either way (active w/ expiry, or
  // not active) rather than hidden when inactive, per spec.
  const hp = $('guildHuntPass');
  if (hp) {
    if (p.huntPassActive) {
      let expiryText = '';
      if (p.huntPassExpiry) {
        const d = new Date(p.huntPassExpiry);
        if (!isNaN(d.getTime())) {
          expiryText = ' \u00b7 expires ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }
      }
      hp.textContent = '\ud83c\udf9f\ufe0f Hunt Pass active' + expiryText;
      hp.className = 'guildHuntPass active';
    } else {
      hp.textContent = 'Hunt Pass: not active';
      hp.className = 'guildHuntPass';
    }
  }

  $('guildBar').hidden = false;
}

$('guildBar').onclick = () => chrome.tabs.create({ url: 'https://finda.sale/shopper/guild-primer' });

load();
