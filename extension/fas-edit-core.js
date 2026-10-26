// fas-edit-core.js -- pure, DOM-free helpers for the automatic price/quantity apply feature (2026-10-13).
//
// Loaded in THREE places: background.js (importScripts), the page (chrome.scripting.executeScript files:[...] right
// before fas-edit-engine.js), and Node (module.exports) for extension/tests/fas-edit-core.test.js (no extension test
// runner exists, so these helpers are the part that is unit-tested; the DOM engine is self-verifying at runtime).
// Nothing here touches chrome.*, document or the network.
(function (root) {
  'use strict';

  // ---- Per-platform limits (serial edits, jittered delay, per-run and per-hour caps) ---------------------------------
  // Facebook is the most edit-rate-sensitive (third-party reports of "Action Blocked" on frequent edits), so it gets the
  // smallest caps and the longest delays. Values are deliberately conservative starting points, tuned from the popup log.
  var LIMITS = {
    FACEBOOK:   { perRun: 5,  perHour: 8,  delayMin: 4000, delayMax: 9000 },
    CRAIGSLIST: { perRun: 6,  perHour: 10, delayMin: 3000, delayMax: 7000 },
    GUMTREE_AU: { perRun: 8,  perHour: 12, delayMin: 2000, delayMax: 6000 },
    POSHMARK:   { perRun: 10, perHour: 20, delayMin: 2000, delayMax: 6000 },
    MERCARI:    { perRun: 6,  perHour: 12, delayMin: 3000, delayMax: 7000 },
    GRAILED:    { perRun: 6,  perHour: 10, delayMin: 3000, delayMax: 7000 }
  };
  var PLATFORM_ORDER = ['FACEBOOK', 'POSHMARK', 'MERCARI', 'GRAILED', 'CRAIGSLIST', 'GUMTREE_AU'];
  var LABELS = { FACEBOOK: 'Facebook Marketplace', CRAIGSLIST: 'Craigslist', GUMTREE_AU: 'Gumtree Australia', POSHMARK: 'Poshmark', MERCARI: 'Mercari', GRAILED: 'Grailed' };
  // Platforms whose listing has a quantity concept the extension can write. Everything else is one unit per listing:
  // quantity drift is "not applicable" there (stock 0 never arrives here, it is a removal -- see pending-removals).
  var QTY_PLATFORMS = { FACEBOOK: true, POSHMARK: true, CRAIGSLIST: false, GUMTREE_AU: false, MERCARI: false, GRAILED: false };

  // ---- Retry / backoff -----------------------------------------------------------------------------------------------
  var BACKOFF_BASE_MS = 15 * 60 * 1000;      // first retry after ~15 min
  var BACKOFF_CAP_MS = 6 * 60 * 60 * 1000;   // never wait longer than 6 h between attempts
  var MAX_ATTEMPTS = 6;                      // after this many consecutive failures the item is parked
  var PARK_MS = 24 * 60 * 60 * 1000;         // parked items are retried once per day, not hammered, not forgotten

  // attempt is 1-based (the attempt that just failed). rand in [0,1) adds up to +20% jitter.
  function backoffMs(attempt, rand) {
    var n = Math.max(1, Math.floor(Number(attempt) || 1));
    var ms = BACKOFF_BASE_MS * Math.pow(2, n - 1);
    if (!isFinite(ms) || ms > BACKOFF_CAP_MS) ms = BACKOFF_CAP_MS;
    var r = typeof rand === 'number' ? rand : 0;
    return Math.min(BACKOFF_CAP_MS, Math.round(ms * (1 + 0.2 * r)));
  }

  // state: { attempts, nextAt, parkedUntil } or undefined (never failed). True when an attempt is allowed now.
  function shouldAttempt(state, now) {
    if (!state) return true;
    var t = typeof now === 'number' ? now : Date.now();
    if (state.parkedUntil && t < state.parkedUntil) return false;
    if (state.nextAt && t < state.nextAt) return false;
    return true;
  }

  function recordFailure(state, now, rand, reason) {
    var t = typeof now === 'number' ? now : Date.now();
    var prev = state || { attempts: 0 };
    var attempts = (prev.attempts || 0) + 1;
    var next = { attempts: attempts, lastReason: String(reason || prev.lastReason || '').slice(0, 160), lastAt: t, nextAt: t + backoffMs(attempts, rand), parkedUntil: 0 };
    if (attempts >= MAX_ATTEMPTS) {
      // Parked: stop retrying on the backoff ladder, try again after PARK_MS with a fresh ladder (attempts reset to 0).
      next.attempts = 0;
      next.parkedUntil = t + PARK_MS;
      next.nextAt = next.parkedUntil;
      next.parked = true;
    }
    return next;
  }

  // ---- Poshmark "needs you to confirm this edit" hold (1.0.66, 2026-10-26) ------------------------------------------------
  // Poshmark answers some price/stock saves with PostValidationError { certify_action:true, certify_reason:"fragile"|"oversized"|"prohibited" }.
  // The engine tries Poshmark's own Edit Listing form once; when that also fails, the item+change is HELD: never retried automatically
  // (certifying is the seller's call, never the extension's) until the wanted price/quantity changes again, the item leaves the drift
  // queue, or POSH_HOLD_MS passes. A hold is { at, price, qty, reason, code, title }.
  var POSH_HOLD_MS = 30 * 24 * 60 * 60 * 1000;
  var POSH_HOLD_INFRA_CODES = ['tab_closed', 'inject_failed', 'no_result', 'login_required', 'captcha_or_verification'];
  function poshCertifyReason(text) {
    var m = /certify_reason["'\s:=]+([a-z_]+)/i.exec(String(text || ''));
    return m ? m[1].toLowerCase() : '';
  }
  function cents(n) { var v = Number(n); return isFinite(v) ? Math.round(v * 100) : null; }
  // res: a non-done result of one item's edit. Held only when the API refusal was a certify flag (scratch.apiFlagged) and the form path
  // then failed for a reason about the listing, not about the browser (closed tab, sign-in).
  function poshHoldEligible(platform, res) {
    if (platform !== 'POSHMARK' || !res || res.state === 'done') return false;
    if (!res.scratch || !res.scratch.apiFlagged) return false;
    if (res.state === 'blocked') return res.code === 'poshmark_flagged';
    return res.state === 'fail' && POSH_HOLD_INFRA_CODES.indexOf(res.code) === -1;
  }
  function poshHoldFor(entry, res, now) {
    var e = entry || {};
    return {
      at: typeof now === 'number' ? now : Date.now(),
      price: e.priceDrift ? cents(e.price) : null,
      qty: e.quantityDrift && e.quantity != null ? Number(e.quantity) : null,
      reason: String((res && res.scratch && res.scratch.apiFlagged) || 'flagged').slice(0, 24),
      code: String((res && res.code) || '').slice(0, 40),
      title: String(e.title || '').slice(0, 80)
    };
  }
  // True while this exact change (same wanted price and quantity) is held.
  function isPoshEditHeld(hold, entry, now) {
    if (!hold || !entry) return false;
    var t = typeof now === 'number' ? now : Date.now();
    if (!(hold.at > 0) || t - hold.at >= POSH_HOLD_MS) return false;
    var wantPrice = entry.priceDrift ? cents(entry.price) : null;
    var wantQty = entry.quantityDrift && entry.quantity != null ? Number(entry.quantity) : null;
    return (hold.price == null ? null : hold.price) === wantPrice && (hold.qty == null ? null : hold.qty) === wantQty;
  }
  // holds: { itemId: hold }; entries: the platform's normalized drift queue. Drops a hold whose item left the queue, whose wanted
  // price/quantity changed, or that expired. Returns { holds, heldIds, changed }.
  function prunePoshHolds(holds, entries, now) {
    var t = typeof now === 'number' ? now : Date.now();
    var src = holds && typeof holds === 'object' ? holds : {};
    var byId = {}; (entries || []).forEach(function (e) { if (e && e.id) byId[e.id] = e; });
    var out = {}, heldIds = [], changed = false;
    Object.keys(src).forEach(function (id) {
      var e = byId[id];
      if (e && isPoshEditHeld(src[id], e, t)) { out[id] = src[id]; heldIds.push(id); } else changed = true;
    });
    return { holds: out, heldIds: heldIds, changed: changed };
  }

  // ---- Caps ----------------------------------------------------------------------------------------------------------
  function pruneHourly(stamps, now) {
    var t = typeof now === 'number' ? now : Date.now();
    return (Array.isArray(stamps) ? stamps : []).filter(function (s) { return typeof s === 'number' && t - s < 3600 * 1000; });
  }
  // How many more edits this platform may do right now (min of the per-run cap and what is left of the hourly cap).
  function allowance(platform, stamps, now) {
    var lim = LIMITS[platform] || LIMITS.FACEBOOK;
    var used = pruneHourly(stamps, now).length;
    return Math.max(0, Math.min(lim.perRun, lim.perHour - used));
  }
  function jitterDelay(platform, rand) {
    var lim = LIMITS[platform] || LIMITS.FACEBOOK;
    var r = typeof rand === 'number' ? rand : Math.random();
    return Math.round(lim.delayMin + (lim.delayMax - lim.delayMin) * r);
  }

  // ---- Queue entry normalization -------------------------------------------------------------------------------------
  function toInt(v) {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
    var n = Number(v);
    return isFinite(n) ? Math.floor(n) : null;
  }
  function toNum(v) {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  // Accepts a /extension/pending-updates entry (newPrice) or a /extension/price-sync-queue entry (price).
  function normalizeEntry(raw, platform) {
    var r = raw || {};
    var price = toNum(r.newPrice != null ? r.newPrice : r.price);
    var qty = toInt(r.quantity != null ? r.quantity : (r.stockRemaining != null ? r.stockRemaining : null));
    var remote = r.remoteListingId != null ? String(r.remoteListingId).trim() : '';
    var url = r.remoteListingUrl || r.remoteUrl || r.listingUrl || '';
    return {
      id: String(r.id || ''),
      platform: platform,
      title: String(r.title || ''),
      price: price,
      quantity: qty,
      priceDrift: r.priceDrift !== false,      // pending-updates always sets it; a missing flag means "treat as drifted"
      quantityDrift: r.quantityDrift === true,
      remoteListingId: remote || extractIdFromUrl(platform, String(url)) || '',
      remoteListingUrl: String(url || ''),
      titleGroup: normalizeTitleGroup(r.titleGroup)
    };
  }
  // Backend-supplied accounting for items that share this item's exact title and still have no saved listing id (price-sync-queue,
  // Poshmark only): { unresolved: items (this one included) with a live listing but no saved id, claimedIds: ids already saved on siblings }.
  function normalizeTitleGroup(g) {
    if (!g || typeof g !== 'object') return null;
    var n = Number(g.unresolved);
    if (!isFinite(n) || n < 1) return null;
    var ids = [];
    (Array.isArray(g.claimedIds) ? g.claimedIds : []).forEach(function (x) { var v = String(x || '').toLowerCase(); if (/^[0-9a-f]{24}$/.test(v) && ids.indexOf(v) === -1) ids.push(v); });
    return { unresolved: Math.floor(n), claimedIds: ids };
  }
  // Pick the one closet listing that belongs to an item with no saved id, without guessing. Safe ONLY when every sibling is accounted
  // for: the backend says this is the single unresolved item of its title, and exactly one closet candidate is left once the ids
  // already saved on siblings are removed. `complete` must be true only after the closet was scrolled until no more cards loaded.
  // Returns { id } or { id: '', reason, message } where message is the plain-language needs-info text for the activity log.
  function resolveDuplicateTitleId(candidates, titleGroup, complete) {
    var cands = [], seen = {};
    (candidates || []).forEach(function (c) { var id = String(c && c.id || '').toLowerCase(); if (/^[0-9a-f]{24}$/.test(id) && !seen[id]) { seen[id] = 1; cands.push(id); } });
    var tg = normalizeTitleGroup(titleGroup);
    var no = function (reason, message) { return { id: '', reason: reason, message: 'Needs info: ' + message }; };
    if (!cands.length) return no('no_candidates', 'no closet listing with this exact title was read.');
    if (!tg) return no('no_accounting', cands.length + ' closet listings share this exact title and FindA.Sale did not send which of them are already tied to other items.');
    var unclaimed = cands.filter(function (id) { return tg.claimedIds.indexOf(id) === -1; });
    if (!complete) return no('closet_incomplete', 'the closet did not finish loading, so not every listing with this title could be counted.');
    if (tg.unresolved > 1) return no('multiple_unresolved', tg.unresolved + ' FindA.Sale items share this title with no saved listing id and ' + unclaimed.length + ' closet listing(s) are unclaimed; they cannot be told apart, so none was edited. Each needs its Poshmark listing id saved once.');
    if (unclaimed.length === 1) return { id: unclaimed[0], reason: 'single_unclaimed' };
    if (!unclaimed.length) return no('all_claimed', 'every closet listing with this title is already tied to another item.');
    // Exactly one FindA.Sale item owns this title and several unclaimed closet listings carry it: they are all copies of that one item
    // (the item was published more than once). Nothing is guessed between different items, so every copy gets the same edit.
    return { id: '', reason: 'copies_of_single_item', copies: unclaimed.slice() };
  }
  // ---- Multi-copy edits (one FindA.Sale item that exists as several identical live listings) -------------------------
  // State lives in the engine scratch so it survives page navigations: copies (ids, canonical first), copyIdx, copyDone [ids],
  // copyFail [{id, code, reason}], copyGone [ids]. Only ever edits; never deletes or delists anything.
  function copyStart(copies) {
    var ids = [], seen = {};
    (copies || []).forEach(function (c) { var id = String(c || '').toLowerCase(); if (/^[0-9a-f]{24}$/.test(id) && !seen[id]) { seen[id] = 1; ids.push(id); } });
    return { copies: ids, copyIdx: 0, copyDone: [], copyFail: [], copyGone: [], remoteId: ids[0] || '', copyWait: false };
  }
  function isListingGone(code, reason) {
    return /^(api_get_failed|verify_get_failed|csrf_not_found|edit_page_http)/.test(String(code || '')) && /\b(404|410)\b/.test(String(reason || ''));
  }
  // One copy finished with `outcome` ({ state:'done'|'fail'|'blocked', code, reason }). Returns { next:'goto'|'finish', scratch, summary? }
  // where scratch is the PATCH to merge. A failed copy never stops the others; a block stops the rest (they are reported as untried).
  function copyAdvance(S, outcome) {
    var copies = (S && S.copies) || [];
    var idx = Number(S && S.copyIdx) || 0;
    var cur = copies[idx];
    var done = ((S && S.copyDone) || []).slice(), fail = ((S && S.copyFail) || []).slice(), gone = ((S && S.copyGone) || []).slice();
    var o = outcome || {};
    if (o.state === 'done') done.push(cur);
    else if (o.state === 'fail' && isListingGone(o.code, o.reason)) gone.push(cur);
    else fail.push({ id: cur, code: String(o.code || o.state || 'failed'), reason: String(o.reason || '').slice(0, 140) });
    var blocked = o.state === 'blocked';
    var nextIdx = idx + 1;
    var base = { copyDone: done, copyFail: fail, copyGone: gone };
    if (!blocked && nextIdx < copies.length) {
      return { next: 'goto', scratch: Object.assign(base, { copyIdx: nextIdx, remoteId: copies[nextIdx], copyWait: true, phase: 'api', apiTried: false, formFallback: false, oldPrice: null }) };
    }
    var untried = blocked ? copies.slice(nextIdx) : [];
    var summary = { canonical: copies[0] || '', total: copies.length, edited: done, failed: fail, gone: gone, untried: untried, blocked: blocked ? { code: o.code || 'blocked', reason: String(o.reason || '').slice(0, 140) } : null };
    summary.allOk = !fail.length && !untried.length && !blocked && done.length > 0;
    return { next: 'finish', scratch: Object.assign(base, { copyIdx: nextIdx }), summary: summary };
  }
  function short(id) { return String(id || '').slice(-6); }
  // One plain-language activity-log line listing every copy touched.
  function copySummaryLine(title, summary) {
    var s = summary || {};
    var parts = ['Edited ' + (s.edited || []).length + ' of ' + (s.total || 0) + ' identical Poshmark copies of "' + String(title || '').slice(0, 50) + '" (one FindA.Sale item published more than once)'];
    if ((s.edited || []).length) parts.push('edited: ' + s.edited.map(short).join(', '));
    if ((s.failed || []).length) parts.push('FAILED: ' + s.failed.map(function (f) { return short(f.id) + ' (' + f.code + ')'; }).join(', '));
    if ((s.gone || []).length) parts.push('no longer on Poshmark: ' + s.gone.map(short).join(', '));
    if ((s.untried || []).length) parts.push('not attempted (stopped early): ' + s.untried.map(short).join(', '));
    parts.push('nothing was deleted or delisted');
    return parts.join('; ');
  }
  // True when this entry is applicable and carries a usable target value.
  function hasWork(entry) {
    if (!entry || !entry.id) return false;
    if (entry.priceDrift && (entry.price == null || !(entry.price > 0))) return false;
    return !!(entry.priceDrift || entry.quantityDrift);
  }
  function wantsQuantity(platform, entry) {
    return !!(QTY_PLATFORMS[platform] && entry && entry.quantityDrift && entry.quantity != null && entry.quantity >= 1);
  }

  // ---- Prices --------------------------------------------------------------------------------------------------------
  // Whole dollars for Facebook / Poshmark / Grailed / Craigslist / Mercari (their price inputs are whole-dollar in practice
  // and the backend rounds FB's newPrice itself); Gumtree keeps cents when the price has them.
  function wholeDollars(price) { return Math.max(1, Math.round(Number(price))); }
  function formatPrice(platform, price) {
    var p = Number(price);
    if (!isFinite(p)) return '';
    if (platform === 'GUMTREE_AU') return (Math.round(p * 100) % 100 === 0) ? String(Math.round(p)) : p.toFixed(2);
    return String(wholeDollars(p));
  }
  // Parses "$1,250.00", "1250", "A$ 40" -> number, else null.
  function parsePriceText(text) {
    var m = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/.exec(String(text == null ? '' : text));
    if (!m) return null;
    return Number(m[1].replace(/,/g, '') + (m[2] ? '.' + m[2] : ''));
  }
  // Does what the page shows equal what we wanted? Whole-dollar platforms tolerate cents (a $12.00 echo of 12; 12.4 rounds to 12).
  function pricesMatch(platform, shown, wanted) {
    var s = typeof shown === 'number' ? shown : parsePriceText(shown);
    var w = Number(wanted);
    if (s == null || !isFinite(w)) return false;
    if (platform === 'GUMTREE_AU') return Math.abs(s - w) < 0.005;
    return Math.abs(s - wholeDollars(w)) < 0.5 || Math.abs(s - w) < 0.005;
  }

  // ---- Titles --------------------------------------------------------------------------------------------------------
  function foldTitle(s) {
    var t = String(s == null ? '' : s);
    try { t = t.normalize('NFKC'); } catch (e) { /* old engine */ }
    return t.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
      .replace(/ /g, ' ').replace(/…/g, '...').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  // Drops a trailing "$price [size...]" tail and a trailing ellipsis (closet/meta-link text, Craigslist "Title - $20").
  function cleanCandidateTitle(s) {
    var t = foldTitle(s);
    t = t.replace(/\s*-?\s*\$\s?\d[\d,]*(?:\.\d{1,2})?(?:\s[\s\S]*)?$/, '').trim();
    return t.replace(/\s*\.{3,}\s*$/, '').trim();
  }
  var MIN_TITLE = 8;
  // A candidate's text equals the wanted title, or (platform-truncated titles) is the wanted title minus one dangling
  // trailing word when the wanted title is long. Never a loose prefix/contains match.
  function titleEquals(candidateText, wanted) {
    var c = cleanCandidateTitle(candidateText);
    var w = foldTitle(wanted).replace(/\s*\.{3,}\s*$/, '');
    if (!c || !w || w.length < MIN_TITLE) return false;
    if (c === w) return true;
    // 2026-10-19: cleanCandidateTitle strips a trailing "$price ..." tail, which also eats real titles that contain a dollar
    // amount ("1950-C $50 *Minneapolis* Federal Reserve Star Note" became "1950-c" and never matched). Also accept the un-stripped text.
    if (foldTitle(candidateText).replace(/\s*\.{3,}\s*$/, '') === w) return true;
    if (w.length >= 75 && c.length >= 60 && w.length > c.length && w.indexOf(c) === 0 && /^[,;:]?\s+\S+$/.test(w.slice(c.length))) return true;
    return false;
  }
  // For cards whose text is a run-on of status + brand + title + price (Grailed, Facebook): the FULL wanted title must
  // appear inside the card text. Callers still demand exactly one matching card.
  function titleContained(cardText, wanted) {
    var w = foldTitle(wanted);
    if (!w || w.length < MIN_TITLE) return false;
    return foldTitle(cardText).indexOf(w) !== -1;
  }
  // Poshmark cuts titles to 80 characters (word boundary when one falls in the last 15 chars) when FindA.Sale posts them; keep in step
  // with truncatePoshmarkTitle in fas-poshmark.js.
  function poshmarkTitle(title) {
    var MAX = 80, t = String(title == null ? '' : title);
    if (t.length <= MAX) return t;
    var cut = t.slice(0, MAX), sp = cut.lastIndexOf(' ');
    return (sp > MAX - 15 ? cut.slice(0, sp) : cut).replace(/\s+$/, '');
  }
  // Closet lookup: the full title first, then the 80-char title that Poshmark actually shows. Only tries the second when the first found nothing.
  function pickUniquePoshmark(candidates, wanted) {
    var r = pickUnique(candidates, wanted, 'equals');
    if (r.reason !== 'none') return r;
    var t80 = poshmarkTitle(wanted);
    return t80 !== String(wanted == null ? '' : wanted) ? pickUnique(candidates, t80, 'equals') : r;
  }
  // 2026-10-20: last resort for a Poshmark listing whose title was edited on FindA.Sale after it was posted (Celestion, banker's lamp,
  // microphone cable were all live under an older title). Guarded: >= 4 shared words, >= 60% of the shorter title's words shared,
  // every number in the shorter title present in the other, and no other closet card above 40% -- otherwise no match at all.
  var FUZZY_STOP = { a: 1, an: 1, the: 1, and: 1, with: 1, for: 1, of: 1, in: 1, to: 1, by: 1, or: 1, on: 1 };
  function titleWords(t) {
    var seen = {}, out = [];
    foldTitle(t).replace(/['’]/g, '').split(/[^a-z0-9]+/).forEach(function (w) {
      if (!w || FUZZY_STOP[w] || (w.length < 2 && !/\d/.test(w)) || seen[w]) return;
      seen[w] = 1; out.push(w);
    });
    return out;
  }
  function fuzzyTitleScore(a, b) {
    var A = titleWords(a), B = titleWords(b);
    if (!A.length || !B.length) return { shared: 0, ratio: 0, numsOk: false };
    var small = A.length <= B.length ? A : B, big = A.length <= B.length ? B : A;
    var inBig = {}; big.forEach(function (w) { inBig[w] = 1; });
    var shared = small.filter(function (w) { return inBig[w]; }).length;
    var numsOk = small.filter(function (w) { return /^\d+$/.test(w); }).every(function (w) { return inBig[w]; });
    return { shared: shared, ratio: shared / small.length, numsOk: numsOk };
  }
  function pickFuzzyPoshmark(candidates, wanted) {
    var scored = (candidates || []).map(function (c) {
      var best = { shared: 0, ratio: 0, numsOk: false }, bestText = '';
      (c.texts || []).forEach(function (t) {
        if (!t || String(t).length < 12) return;
        var sc = fuzzyTitleScore(t, wanted);
        if (sc.ratio > best.ratio || (sc.ratio === best.ratio && sc.shared > best.shared)) { best = sc; bestText = String(t).replace(/\s+/g, ' ').trim(); }
      });
      return { key: c.key, sc: best, text: bestText, cand: c };
    }).sort(function (x, y) { return y.sc.ratio - x.sc.ratio || y.sc.shared - x.sc.shared; });
    var top = scored[0], second = scored[1];
    if (!top || top.sc.shared < 4 || top.sc.ratio < 0.6 || !top.sc.numsOk) return { match: null, reason: 'none', count: 0 };
    if (second && second.key !== top.key && second.sc.ratio > 0.4) return { match: null, reason: 'ambiguous', count: 2 };
    return { match: top.cand, reason: 'fuzzy', count: 1, score: top.sc, matchedTitle: top.text };
  }
  // candidates: [{ key, texts: [string] }] -> { match: candidate|null, reason: 'ok'|'none'|'ambiguous', count }
  function pickUnique(candidates, wanted, mode) {
    var fn = mode === 'contains' ? titleContained : titleEquals;
    var hits = [];
    (candidates || []).forEach(function (c) {
      if ((c.texts || []).some(function (t) { return fn(t, wanted); })) hits.push(c);
    });
    var keys = {};
    hits.forEach(function (h) { keys[h.key] = h; });
    var uniq = Object.keys(keys);
    if (uniq.length === 1) return { match: keys[uniq[0]], reason: 'ok', count: 1 };
    return { match: null, reason: uniq.length === 0 ? 'none' : 'ambiguous', count: uniq.length };
  }

  // ---- Listing ids / urls --------------------------------------------------------------------------------------------
  function extractIdFromUrl(platform, url) {
    var u = String(url || '');
    var m;
    switch (platform) {
      case 'FACEBOOK': m = /\/marketplace\/item\/(\d{6,})/.exec(u) || (/^\d{6,}$/.test(u) ? [0, u] : null); return m ? m[1] : '';
      case 'POSHMARK': m = /(?:[-/])([0-9a-f]{24})(?:[/?#]|$)/i.exec(u) || (/^[0-9a-f]{24}$/i.test(u) ? [0, u] : null); return m ? m[1].toLowerCase() : '';
      case 'MERCARI': m = /\b(m\d{6,})\b/i.exec(u); return m ? m[1].toLowerCase() : '';
      case 'GRAILED': m = /\/listings\/(\d+)/.exec(u) || (/^\d+$/.test(u) ? [0, u] : null); return m ? m[1] : '';
      case 'CRAIGSLIST': m = /(?:^|[^\d])(\d{9,12})(?:[^\d]|$)/.exec(u); return m ? m[1] : '';
      case 'GUMTREE_AU': m = /(\d{8,12})(?:[/?#]|$)/.exec(u); return m ? m[1] : '';
      default: return '';
    }
  }
  var POSH_ID_RE = /^[0-9a-f]{24}$/i;
  function startUrl(platform, entry, cfg, idCache) {
    var c = cfg || {};
    var id = (entry && entry.remoteListingId) || (idCache && entry && idCache[platform + ':' + entry.id]) || '';
    switch (platform) {
      case 'FACEBOOK': return id ? 'https://www.facebook.com/marketplace/item/' + encodeURIComponent(id) + '/' : 'https://www.facebook.com/marketplace/you/selling';
      case 'POSHMARK': return POSH_ID_RE.test(id) ? 'https://poshmark.com/edit-listing/' + id : 'https://poshmark.com/feed';
      case 'MERCARI': return /^m\d+$/i.test(id) ? (c.MERC_EDIT_URL_PREFIX || 'https://www.mercari.com/sell/edit/') + id.toLowerCase() + '/' : (c.MERC_MANAGE_URL || 'https://www.mercari.com/mypage/listings/');
      case 'GRAILED': return /^\d+$/.test(id) ? 'https://www.grailed.com/listings/' + id + '/edit' : (c.GRAILED_MANAGE_URL || 'https://www.grailed.com/sell/for-sale');
      case 'CRAIGSLIST': return 'https://accounts.craigslist.org/login/home?filter_page=1&show_tab=postings';
      case 'GUMTREE_AU': return 'https://www.gumtree.com.au/m-my-ads.html';
      default: return '';
    }
  }
  function craigslistPageUrl(n) { return 'https://accounts.craigslist.org/login/home?filter_page=' + n + '&show_tab=postings'; }

  // ---- Poshmark JSON API (same-origin, cookie session) --------------------------------------------------------------
  // Keys that survive from the raw GET into the POST body: the documented phposh update whitelist plus the extra
  // fields the ai-listings create flow sends, passed through ONLY when the raw post carries them (so nothing resets).
  var POSH_PASS_THROUGH = ['catalog', 'inventory', 'original_price_amount', 'title', 'description', 'brand', 'condition', 'pictures',
    'seller_private_info', 'offer_auto_actions_v2_enabled', 'offer_auto_actions_min_price_amount', 'seller_shipping_discount', 'style_tags'];
  function isPoshmarkErrorPayload(json) {
    if (!json || typeof json !== 'object') return null;
    var e = json.error;
    if (e && typeof e === 'object') {
      var code = e.statusCode != null ? e.statusCode : (e.status != null ? e.status : '');
      var msg = String(e.errorMessage || e.message || '').slice(0, 120);
      if (!msg) { try { var rest = {}; Object.keys(e).forEach(function (k) { if (k !== 'statusCode' && k !== 'status' && k !== 'errorType' && k !== 'type') rest[k] = e[k]; }); msg = JSON.stringify(rest).slice(0, 300); } catch (x) { /* keep empty */ } }
      return 'poshmark_error:' + String(code) + ':' + String(e.errorType || e.type || '') + ':' + msg;
    }
    if (typeof e === 'string' && e) return 'poshmark_error:' + e.slice(0, 120);
    return null;
  }
  // raw: the post object from GET /vm-rest/posts/<id> (the response may be { data: {...} } or the post itself).
  function unwrapPoshmarkPost(json) {
    if (!json || typeof json !== 'object') return null;
    if (json.data && typeof json.data === 'object' && !Array.isArray(json.data) && (json.data.id || json.data.title || json.data.inventory)) return json.data;
    if (json.post && typeof json.post === 'object') return json.post;
    return json;
  }
  function poshmarkPriceVal(post) {
    var p = post && post.price_amount;
    if (p && typeof p === 'object' && p.val != null) return parsePriceText(p.val);
    return null;
  }
  // Returns { body, changes, error }. wantPrice: dollars. wantQty: integer or null (leave inventory untouched).
  function buildPoshmarkUpdate(raw, wantPrice, wantQty) {
    if (!raw || typeof raw !== 'object') return { error: 'no_post' };
    if (raw.original_price_amount == null) return { error: 'original_price_amount_missing' };
    var post = {};
    POSH_PASS_THROUGH.forEach(function (k) { if (raw[k] !== undefined) post[k] = deepCopy(raw[k]); });
    var colors = [];
    if (Array.isArray(raw.colors)) raw.colors.forEach(function (c) { var n = c && typeof c === 'object' ? c.name : c; if (n) colors.push(n); });
    post.colors = colors;
    if (raw.cover_shot && raw.cover_shot.id) post.cover_shot = { id: raw.cover_shot.id };
    if (!Array.isArray(post.pictures)) post.pictures = [];
    if (!post.seller_private_info || typeof post.seller_private_info !== 'object') post.seller_private_info = {};
    var cur = raw.price_amount && typeof raw.price_amount === 'object' ? raw.price_amount : {};
    var changes = [];
    if (wantPrice != null) {
      post.price_amount = { val: String(wholeDollars(wantPrice)), currency_code: cur.currency_code || 'USD', currency_symbol: cur.currency_symbol || '$' };
      changes.push('price');
    } else {
      post.price_amount = deepCopy(raw.price_amount);
    }
    if (wantQty != null) {
      var inv = post.inventory;
      var sq = inv && Array.isArray(inv.size_quantities) ? inv.size_quantities : null;
      if (!sq || !sq.length) return { error: 'inventory_size_quantities_missing' };
      if (sq.length !== 1) return { error: 'multi_size_inventory_unsupported:' + sq.length };
      if (Number(sq[0].quantity_available) !== wantQty) { sq[0].quantity_available = wantQty; changes.push('quantity'); }
      // size_quantity_revision is echoed back exactly as read (it behaves as an optimistic-concurrency counter).
    }
    return { body: { post: post }, changes: changes };
  }
  // Fields that must be identical before/after our edit (price and a deliberate quantity change excluded). Returns the
  // names that differ, e.g. ['title','brand'] -- a non-empty list means the POST reset something it should not have.
  function poshmarkCollateralDiff(before, after, quantityChanged) {
    var diffs = [];
    ['title', 'description'].forEach(function (k) { if ((before && before[k]) !== (after && after[k])) diffs.push(k); });
    ['brand', 'condition'].forEach(function (k) { if (stableJson(before && before[k]) !== stableJson(after && after[k])) diffs.push(k); });
    var bp = before && Array.isArray(before.pictures) ? before.pictures.length : 0;
    var ap = after && Array.isArray(after.pictures) ? after.pictures.length : 0;
    if (bp !== ap) diffs.push('pictures');
    if (!quantityChanged && stableJson(sizeQty(before)) !== stableJson(sizeQty(after))) diffs.push('inventory');
    if (stableJson(before && before.original_price_amount) !== stableJson(after && after.original_price_amount)) diffs.push('original_price_amount');
    return diffs;
  }
  function sizeQty(p) {
    var sq = p && p.inventory && Array.isArray(p.inventory.size_quantities) ? p.inventory.size_quantities : [];
    return sq.map(function (s) { return [s.size_id, s.quantity_available]; });
  }
  function poshmarkQuantity(post) {
    var sq = sizeQty(post);
    return sq.length === 1 ? Number(sq[0][1]) : null;
  }
  function deepCopy(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function stableJson(v) { try { return JSON.stringify(v === undefined ? null : v); } catch (e) { return 'unserializable'; } }

  // ---- Page-state classification -------------------------------------------------------------------------------------
  // text: lower-cased visible text sample; title: document.title. Returns { code, stopPlatform } or null.
  function classifyBlock(title, text, url) {
    var t = foldTitle(title);
    var x = foldTitle(String(text || '').slice(0, 3000));
    var u = String(url || '').toLowerCase();
    if (/^(access denied|just a moment|attention required|verify you are human|are you a (human|robot)|you have been blocked|request blocked|pardon our interruption)/.test(t)) return { code: 'challenge_page', stopPlatform: true };
    if (/\b(error 429|too many requests)\b/.test(t + ' ' + x.slice(0, 200))) return { code: 'http_429', stopPlatform: true };
    if (/\b(error 403|403 forbidden)\b/.test(t + ' ' + x.slice(0, 200))) return { code: 'http_403', stopPlatform: true };
    if (/action blocked|you(?:'|’)re temporarily blocked|you have been temporarily blocked|temporarily restricted|try again later.*(?:slow|too fast)|we limit how often/.test(x)) return { code: 'action_blocked', stopPlatform: true };
    if (/(\/login|\/signin|\/sign_in|\/sign-in|t-login[-a-z]*\.html|accounts\.craigslist\.org\/login(?!\/home))/.test(u) && !/login\/home/.test(u)) return { code: 'login_required', stopPlatform: true };
    if (/checkpoint/.test(u) && /facebook\.com/.test(u)) return { code: 'facebook_checkpoint', stopPlatform: true };
    return null;
  }

  // ---- Diagnostics / log ring buffers --------------------------------------------------------------------------------
  var SECRET_KEY_RE = /(token|csrf|xsrf|cookie|authorization|password|passwd|secret|crypt|session|jazoest|fb_dtsg|lsd)/i;
  function redact(value, depth) {
    var d = depth || 0;
    if (d > 6) return '[deep]';
    if (value == null) return value;
    if (typeof value === 'string') return value.length > 300 ? value.slice(0, 300) + '...' : value;
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.slice(0, 60).map(function (v) { return redact(v, d + 1); });
    var out = {};
    Object.keys(value).slice(0, 80).forEach(function (k) { out[k] = SECRET_KEY_RE.test(k) ? '[redacted]' : redact(value[k], d + 1); });
    return out;
  }
  // Removes secret-looking query params from a URL (keeps the path -- that is the whole point of capturing it).
  function safeUrl(u) {
    try {
      var x = new URL(String(u), 'https://x.invalid/');
      var keep = [];
      x.searchParams.forEach(function (v, k) { keep.push(SECRET_KEY_RE.test(k) ? k + '=[redacted]' : k + '=' + String(v).slice(0, 40)); });
      return (/^https?:\/\/x\.invalid/.test(x.href) ? x.pathname : x.origin + x.pathname) + (keep.length ? '?' + keep.join('&') : '');
    } catch (e) { return String(u).slice(0, 200); }
  }
  function pushRing(arr, entry, max) {
    var a = Array.isArray(arr) ? arr.slice() : [];
    a.push(entry);
    var m = max || 100;
    return a.length > m ? a.slice(a.length - m) : a;
  }
  // diag store: { PLATFORM: [records] } keeping the newest `per` records per platform and capping total JSON size.
  function addDiag(store, platform, record, per, maxChars) {
    var s = store && typeof store === 'object' ? JSON.parse(JSON.stringify(store)) : {};
    s[platform] = pushRing(s[platform], record, per || 4);
    var lim = maxChars || 60000;
    var guard = 0;
    while (JSON.stringify(s).length > lim && guard++ < 50) {
      var biggest = Object.keys(s).sort(function (a, b) { return JSON.stringify(s[b]).length - JSON.stringify(s[a]).length; })[0];
      if (!s[biggest] || s[biggest].length <= 1) break;
      s[biggest] = s[biggest].slice(1);
    }
    return s;
  }

  // ---- Automatic failure forwarding (2026-10-17) ---------------------------------------------------------------------
  // A failed/blocked edit used to leave its diagnostics only in chrome.storage until someone clicked "Copy diagnostics".
  // buildDiag() makes a compact, scrubbed, size-capped record that background.js posts to the backend runtime log
  // (source FAS_EDIT_DIAG); diagThrottle() keeps a long queue from flooding it. Pure functions: unit-tested in Node.
  var DIAG_MAX_CHARS = 12000;
  var DIAG_WINDOW_MS = 15 * 60 * 1000;
  var DIAG_TRAIL_MAX = 25;
  // Path only: no origin, no query string, no fragment. Anything unparsable is cut at the first ? or #.
  function pathOnly(u) {
    var t = String(u == null ? '' : u);
    try { return new URL(t, 'https://x.invalid/').pathname.slice(0, 160); } catch (e) { return t.split(/[?#]/)[0].slice(0, 160); }
  }
  // Removes things that must never leave the browser from free text: emails, URLs (reduced to their path), long digit runs
  // (phones, card-like numbers), token-like strings and "Bearer x" / "key=value" secrets.
  function scrubText(v, max) {
    var t = String(v == null ? '' : v);
    t = t.replace(/https?:\/\/[^\s"'<>)]+/gi, function (m) { return pathOnly(m); });
    t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
    t = t.replace(/\bBearer\s+[A-Za-z0-9._~+\/=-]+/gi, 'Bearer [redacted]');
    t = t.replace(/\b(token|csrf|xsrf|cookie|authorization|password|secret|session|jazoest|fb_dtsg|lsd)(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi, '$1$2[redacted]');
    t = t.replace(/\b[A-Za-z0-9_-]{28,}\b/g, '[token]');
    t = t.replace(/\b\d{13,19}\b/g, '[number]');
    t = t.replace(/\+?\(?\d{2,4}\)?[\s.-]\d{2,4}[\s.-]\d{2,4}(?:[\s.-]\d{2,4})?/g, function (m) { return m.replace(/\D/g, '').length >= 7 ? '[number]' : m; });
    var lim = max || 300;
    return t.length > lim ? t.slice(0, lim) + '...' : t;
  }
  // redact() (secret-named keys, depth/size caps) plus scrubText on every string leaf.
  function scrubDeep(value, depth) {
    var d = depth || 0;
    if (d > 6) return '[deep]';
    if (value == null) return value;
    if (typeof value === 'string') return scrubText(value, 300);
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.slice(0, 40).map(function (v) { return scrubDeep(v, d + 1); });
    var out = {};
    Object.keys(value).slice(0, 60).forEach(function (k) { out[k] = SECRET_KEY_RE.test(k) ? '[redacted]' : scrubDeep(value[k], d + 1); });
    return out;
  }
  // One page snapshot -> form field names/types, button labels, headings/visible text, request paths. Field VALUES are dropped.
  function compactSnapshot(d) {
    if (!d || typeof d !== 'object') return null;
    var o = { note: d.note ? scrubText(d.note, 80) : undefined, path: d.url ? pathOnly(d.url) : undefined, title: d.title ? scrubText(d.title, 80) : undefined,
      dialogs: d.dialogs, text: d.textSample ? scrubText(d.textSample, 200) : undefined };
    if (Array.isArray(d.buttons)) o.buttons = d.buttons.slice(0, 30).map(function (b) { return scrubText(typeof b === 'string' ? b : (b && (b.text || b.aria)) || '', 40); }).filter(Boolean);
    if (Array.isArray(d.inputs)) o.fields = d.inputs.slice(0, 30).map(function (i) {
      if (typeof i === 'string') return scrubText(i, 60);
      return scrubText([i.name || i.id || i.aria || i.ph || i.label || '', i.type || '', i.vis === false ? 'hid' : 'vis'].join(':'), 60);
    });
    if (Array.isArray(d.editish)) o.editish = d.editish.slice(0, 8).map(function (e) { return scrubText(typeof e === 'string' ? e : (e && (e.text || e.aria)) || '', 40); }).filter(Boolean);
    if (Array.isArray(d.requests)) o.requests = d.requests.slice(-8).map(function (r) { return pathOnly(typeof r === 'string' ? r : r && r.url); });
    if (d.resp != null) o.resp = scrubDeep(d.resp);         // HTTP error body captured by the engine (already redacted there, scrubbed again here)
    if (d.status != null) o.status = d.status;
    if (d.keys != null) o.keys = scrubDeep(d.keys);
    return o;
  }
  // The payload posted to the backend. rec = the diagRecord background.js already builds for the popup; meta = { version, suppressed, firstSinceStart }.
  function buildDiag(rec, meta) {
    rec = rec || {}; meta = meta || {};
    var det = rec.details && typeof rec.details === 'object' ? rec.details : {};
    var snaps = Array.isArray(rec.snapshots) ? rec.snapshots.slice(-2).map(compactSnapshot).filter(Boolean) : [];
    var trail = Array.isArray(rec.trail) ? rec.trail.slice(-DIAG_TRAIL_MAX).map(function (t) { return scrubText(typeof t === 'string' ? t : JSON.stringify(t), 120); }) : [];
    var out = {
      kind: 'edit', v: meta.version || '', platform: String(rec.platform || '').slice(0, 30), itemId: rec.itemId != null ? String(rec.itemId).slice(0, 40) : '',
      title: scrubText(String(rec.title || '').slice(0, 60), 60), outcome: rec.outcome || '', code: String(rec.code || '').slice(0, 60), step: scrubText(rec.step || '', 80),
      selector: scrubText(rec.selector || '', 120), reason: scrubText(rec.reason || '', 400),
      counts: { trail: Array.isArray(rec.trail) ? rec.trail.length : 0, snapshots: Array.isArray(rec.snapshots) ? rec.snapshots.length : 0 },
      http: det.status != null || det.resp != null ? { status: det.status, body: scrubDeep(det.resp) } : undefined,
      details: scrubDeep(det), trail: trail, snapshots: snaps,
      suppressedSinceLast: meta.suppressed || 0, firstSinceStart: !!meta.firstSinceStart
    };
    if (out.http && out.http.status == null && snaps.length) { var hs = snaps.filter(function (s) { return s && s.status != null; })[0]; if (hs) out.http.status = hs.status; }
    // Shrink until it fits: details first, then older snapshot, then trail.
    var guard = 0;
    while (JSON.stringify(out).length > DIAG_MAX_CHARS && guard++ < 8) {
      if (out.details && Object.keys(out.details).length) out.details = { trimmed: true };
      else if (out.snapshots.length > 1) out.snapshots = out.snapshots.slice(-1);
      else if (out.trail.length > 10) out.trail = out.trail.slice(-10);
      else if (out.snapshots.length) { out.snapshots = out.snapshots.map(function (s) { return { path: s.path, buttons: (s.buttons || []).slice(0, 10), fields: (s.fields || []).slice(0, 10), resp: s.resp }; }); }
      else { out.trail = []; out.http = undefined; }
    }
    return out;
  }
  // Per-(platform, code) throttle. store: { 'PLATFORM|code': { at, suppressed } } (kept by the caller). Returns { send, suppressed, store }.
  // The first occurrence for a key is always sent (callers pass a fresh store after an extension restart); repeats inside the window are
  // only counted, and the count rides along with the next full diagnostic.
  function diagThrottle(store, platform, code, now, windowMs) {
    var s = store && typeof store === 'object' ? JSON.parse(JSON.stringify(store)) : {};
    var key = String(platform || '') + '|' + String(code || '');
    var e = s[key], win = windowMs || DIAG_WINDOW_MS;
    if (!e || now - e.at >= win || now < e.at) { var sup = e ? e.suppressed || 0 : 0; s[key] = { at: now, suppressed: 0 }; return { send: true, suppressed: sup, store: s }; }
    e.suppressed = (e.suppressed || 0) + 1;
    return { send: false, suppressed: e.suppressed, store: s };
  }
  function describeFailure(platform, entry, code, step, selector) {
    return { platform: platform, itemId: entry && entry.id, title: entry && String(entry.title || '').slice(0, 80), code: code, step: step || '', selector: selector || '' };
  }

  // 1.0.23: hard pause of Craigslist PRICE-EDIT runs. cfg = self.FAS_CONFIG. Only the literal false turns the pause off (fail closed).
  function isEditPausedByConfig(platform, cfg) {
    return platform === 'CRAIGSLIST' && !(cfg && cfg.FAS_CL_PRICE_EDITS_PAUSED === false);
  }
  // Which queued platform the edit pump works on next: first in PLATFORM_ORDER that has entries, is not in `busy` (a Set) and is not paused by config.
  function nextEditPlatform(pending, busy, cfg) {
    pending = pending || {};
    return PLATFORM_ORDER.filter(function (p) { return !(busy && busy.has(p)) && !isEditPausedByConfig(p, cfg) && Array.isArray(pending[p]) && pending[p].length; })[0];
  }

  var api = {
    isEditPausedByConfig: isEditPausedByConfig, nextEditPlatform: nextEditPlatform,
    LIMITS: LIMITS, PLATFORM_ORDER: PLATFORM_ORDER, LABELS: LABELS, QTY_PLATFORMS: QTY_PLATFORMS,
    MAX_ATTEMPTS: MAX_ATTEMPTS, BACKOFF_BASE_MS: BACKOFF_BASE_MS, BACKOFF_CAP_MS: BACKOFF_CAP_MS, PARK_MS: PARK_MS,
    backoffMs: backoffMs, shouldAttempt: shouldAttempt, recordFailure: recordFailure,
    POSH_HOLD_MS: POSH_HOLD_MS, poshCertifyReason: poshCertifyReason, poshHoldEligible: poshHoldEligible, poshHoldFor: poshHoldFor, isPoshEditHeld: isPoshEditHeld, prunePoshHolds: prunePoshHolds,
    pruneHourly: pruneHourly, allowance: allowance, jitterDelay: jitterDelay,
    normalizeEntry: normalizeEntry, normalizeTitleGroup: normalizeTitleGroup, resolveDuplicateTitleId: resolveDuplicateTitleId,
    copyStart: copyStart, copyAdvance: copyAdvance, copySummaryLine: copySummaryLine, isListingGone: isListingGone, hasWork: hasWork, wantsQuantity: wantsQuantity,
    wholeDollars: wholeDollars, formatPrice: formatPrice, parsePriceText: parsePriceText, pricesMatch: pricesMatch,
    foldTitle: foldTitle, cleanCandidateTitle: cleanCandidateTitle, titleEquals: titleEquals, titleContained: titleContained, pickUnique: pickUnique, pickUniquePoshmark: pickUniquePoshmark, pickFuzzyPoshmark: pickFuzzyPoshmark, fuzzyTitleScore: fuzzyTitleScore, poshmarkTitle: poshmarkTitle,
    extractIdFromUrl: extractIdFromUrl, startUrl: startUrl, craigslistPageUrl: craigslistPageUrl,
    isPoshmarkErrorPayload: isPoshmarkErrorPayload, unwrapPoshmarkPost: unwrapPoshmarkPost, poshmarkPriceVal: poshmarkPriceVal,
    buildPoshmarkUpdate: buildPoshmarkUpdate, poshmarkCollateralDiff: poshmarkCollateralDiff, poshmarkQuantity: poshmarkQuantity,
    classifyBlock: classifyBlock, redact: redact, safeUrl: safeUrl, pathOnly: pathOnly, scrubText: scrubText, scrubDeep: scrubDeep, compactSnapshot: compactSnapshot, buildDiag: buildDiag, diagThrottle: diagThrottle, DIAG_WINDOW_MS: DIAG_WINDOW_MS, DIAG_MAX_CHARS: DIAG_MAX_CHARS, pushRing: pushRing, addDiag: addDiag, describeFailure: describeFailure
  };
  root.FAS_EDIT_CORE = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
