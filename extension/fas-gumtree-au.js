/* FindA.Sale — content script on www.gumtree.com.au/*.
 * Gumtree Australia crosslisting (ADR-102, 2026-08-09). UNLIKE Craigslist (guest-postable, full
 * posting-form DOM live-verified in fas-craigslist.js), Gumtree AU's ENTIRE posting flow is
 * login-walled: navigating to the real post-ad URL (https://www.gumtree.com.au/p-post-ad.html)
 * while logged out renders a hard Sign In screen on that same URL with zero form fields exposed
 * (live-verified via Chrome MCP, read-only, 2026-08-09 -- see ADR-102 §9). FindA.Sale has no
 * Gumtree AU seller account to verify the post-login form against, and per this project's standing
 * rule (ADR-086, ADR-100 §10/§11) selectors are never guessed -- a guessed field name or category
 * taxonomy that's wrong fails silently or corrupts a real listing.
 *
 * So this script does NOT attempt to auto-fill or auto-submit anything. It:
 *   1. Detects the sign-in wall (best-effort DOM heuristic) and waits -- the human owns login,
 *      same "human owns verification" boundary as fas-craigslist.js.
 *   2. Once past the wall (or if the heuristic can't tell), shows a "manual assist" overlay with
 *      the queued item's title/price/condition/category/description in a copyable block, plus the
 *      photo URLs, so the organizer can paste them into Gumtree's own form by hand.
 *   3. Records the post via the same 'markListed' message fas-craigslist.js/fas-content.js use
 *      (platform: 'GUMTREE_AU') once the organizer confirms they posted, so it's tracked
 *      server-side and gets a renewal-due date like every other channel.
 *
 * See the bottom of this file for the explicit list of what still needs a real logged-in Gumtree
 * AU seller account to verify before any of this can move beyond manual-assist.
 */
(function () {
  const POST_URL = 'https://www.gumtree.com.au/p-post-ad.html';

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function bodyText() { return (document.body && document.body.innerText) || ''; }
  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return Array.from(document.querySelectorAll(sel)); }
  // 2026-10-13 (extension 1.0.7): capture the posted listing's URL/id for markListed so price/qty edits
  // can go straight to the live listing. Best-effort and NEVER throws or blocks a posting: any failure
  // (helper not loaded, no id on this page yet) returns nulls and the backend/after-the-fact capture
  // paths fill the reference in later. waitMs > 0 polls briefly for a post-submit redirect to land.
  async function fasListingRef(platform, waitMs) {
    const empty = { remoteListingId: null, remoteListingUrl: null };
    try {
      const C = (typeof self !== 'undefined' && self.FAS_LISTING_REF) || null;
      if (!C || typeof C.capturePageListingRef !== 'function') return empty;
      const deadline = Date.now() + Math.max(0, waitMs || 0);
      for (;;) {
        let r = null;
        try { r = C.capturePageListingRef(platform, location, document); } catch (e) { r = null; }
        if (r && (r.remoteListingId || r.remoteListingUrl)) return { remoteListingId: r.remoteListingId || null, remoteListingUrl: r.remoteListingUrl || null };
        if (Date.now() >= deadline) return empty;
        await new Promise((res) => setTimeout(res, 300));
      }
    } catch (e) { return empty; }
  }
  function escapeHtml(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  // Shared step narration + diagnostics (fas-trace.js). Guarded: a missing module or any logging error can never break the flow.
  function FT(method) {
    try {
      const t = (typeof window !== 'undefined' && window.FAS_TRACE) || null;
      if (t && typeof t[method] === 'function') return t[method].apply(t, Array.prototype.slice.call(arguments, 1));
    } catch (e) { /* logging must never break the flow */ }
    return undefined;
  }
  function ftRespCtx(r) { return { gotResponse: r != null, ok: r && r.ok, status: r && (r.status || r.httpStatus), error: r && r.error ? String(r.error).slice(0, 120) : undefined }; }

  // Gumtree Australia Prohibited Items gate (added S-CROSS-MARKETPLACE-AUDIT-2026-09-03) -- mirrors
  // craigslistRestrictionReason() in fas-craigslist.js, part of the same cross-marketplace audit
  // prompted by the Facebook dagger incident (fas-content.js's own pre-submit check had zero weapon
  // keywords at the time, and the item auto-published to Facebook Marketplace, which bans weapons,
  // getting the organizer's account restricted). This file's flow is manual-assist, not
  // auto-publish -- the organizer copies details into Gumtree's own form and confirms themselves
  // (see file header for why nothing here auto-fills/auto-submits) -- but the same prohibited-
  // category risk still applies: without this check, a prohibited item would still be shown to the
  // organizer as "ready to post" with copy-paste details and a photo-link list, same as any other
  // item. Mirrors the GUMTREE_AU rule in marketplaceEligibilityRules.ts (kept in sync manually, same
  // pattern as fas-craigslist.js's own CRAIGSLIST rule) -- keyword list sourced directly from
  // Gumtree's own official "General posting rules" page, help.gumtree.com.au, Restricted Categories
  // list, Nov 2024. Unlike the Craigslist list, this one deliberately bans 'knife'/'switchblade'
  // outright with NO kitchen/culinary exclusion -- Gumtree's own policy text states no exception for
  // knives.
  // EXTENDED S-CROSS-MARKETPLACE-COMPLIANCE-AUDIT-2026-09-18 (see claude_docs/audits/
  // cross-marketplace-compliance-audit-2026-09-18.md, kept in sync verbatim with the same-day
  // GUMTREE_AU backend registry edit). Added gambling, supplement/vitamin, recalled, battery,
  // and dog-training-collar keywords, plus nitrous-oxide slang terms.
  const GT_PROHIBITED_NAME_KEYWORDS = [
    'weapon', 'firearm', 'gun', 'ammo', 'ammunition', 'paintball gun', 'gel blaster',
    'spear gun', 'tear gas', 'taser', 'stun gun', 'knife', 'switchblade',
    // 2026-09-25: closes a real dagger/sword/bayonet gap found while answering Patrick's direct
    // question about cross-marketplace weapon-filter coverage -- mirrors the backend
    // marketplaceEligibilityRules.ts GUMTREE_AU rule fix, same session, same reasoning.
    'dagger', 'sword', 'bayonet',
    // 2026-09-25: weapon-synonym additions, mirrors the same-day marketplaceEligibilityRules.ts
    // GUMTREE_AU rule edit (see that rule's comment for sourcing).
    'brass knuckle', 'nunchuck', 'nunchaku', 'baton', 'pepper spray', 'butterfly knife',
    'machete', 'throwing star',
    'martial arts', 'archery', 'bow and arrow',
    'firework', 'explosive',
    'alcohol', 'tobacco', 'cigarette', 'vape', 'e-cigarette',
    'ivory', 'rhino horn',
    'counterfeit', 'replica',
    'stolen',
    'hazmat', 'narcotic', 'prescription',
    'used cosmetic', 'used underwear',
    'nitrous oxide', 'nang', 'cream charger',
    'lottery', 'sweepstakes', 'slot machine', 'gambling',
    'supplement', 'vitamin', 'recalled',
    'used battery', 'rebuilt battery', 'mercury battery',
    'shock collar', 'training collar',
    // ROUND 2 (see marketplaceEligibilityRules.ts's GUMTREE_AU rule, same comment): human
    // remains, burglary tools, government/police ID items, controlled-substance phrasing,
    // pesticides, pornographic/adult material.
    'human body part', 'human material', 'burglary tool',
    'government document', 'government id', 'police badge', 'police uniform', 'military uniform',
    'controlled substance', 'pesticide', 'pornographic', 'adult',
    // 2026-09-25-ROUND2: mirrors the same-day marketplaceEligibilityRules.ts GUMTREE_AU rule
    // edit (identity docs/surveillance/taxidermy/tanning-bed findings from a harder second pass).
    'identity document', 'passport', 'checkbook',
    'hidden camera', 'spy camera',
    'radar detector', 'police scanner',
    'taxidermy',
    'tanning bed',
  ];
  // BONUS FIX found during the 2026-09-18 mirror-sync pass (pre-existing drift -- this file
  // never had an excludeKeywords guard at all, unlike the backend GUMTREE_AU rule which has
  // carried a 'gunmetal' exclude since S-EXT-ELIGIBILITY-SUBSTRING-FIX-2026-09-03). Without
  // this, a golf club titled e.g. "...Gunmetal Black" would be wrongly blocked here.
  const GT_PROHIBITED_EXCLUDE_KEYWORDS = ['gunmetal'];
  // Boundary-aware name-keyword matcher. Faithful port of matchesBlocklistKeyword in
  // packages/backend/src/services/marketplaceEligibilityRules.ts (2026-10-08): whole word/phrase
  // match after normalization, ordinary inflection tolerated, glued compounds only via the explicit
  // affix tables below (keep these tables identical to the backend's KW_COMPOUND_* tables).
  // Replaces plain substring matching, which flagged 'wine' inside "Winelight".
  const FAS_KW_PREFIXES = {
    gun: ['shot', 'hand', 'air', 'machine', 'sub', 'pop', 'spear', 'flare', 'tommy', 'bb', 'pellet', 'cap'],
    knife: ['pocket', 'jack', 'pen', 'bowie', 'hunting', 'throwing', 'butcher'],
    sword: ['broad', 'long', 'short', 'great', 'back'],
    bike: ['e', 'motor', 'dirt', 'mini', 'pit', 'mountain', 'road', 'push', 'trail'],
    food: ['sea', 'pet', 'fast', 'baby', 'junk', 'health', 'soul', 'dog', 'cat'],
    vitamin: ['multi'],
    coin: ['bit', 'alt', 'doge', 'lite'],
    shell: ['tortoise', 'turtle', 'sea'],
    fur: ['faux', 'real'],
  };
  const FAS_KW_SUFFIXES = {
    gun: [
      'powder', 'shot', 'shots', 'smith', 'smiths', 'smithing', 'stock', 'fire', 'sight', 'sights',
      'point', 'boat', 'runner', 'runners', 'slinger', 'belt', 'safe', 'case', 'rack', 'cabinet',
      'holster', 'oil', 'sling', 'barrel', 'ship',
    ],
    sword: ['man', 'men', 'play', 'stick', 'smith'],
    blade: ['smith', 'smiths'],
    ammo: ['box', 'boxes', 'can', 'cans', 'pouch', 'belt'],
    weapon: ['ry'],
    coin: ['age'],
    wine: [
      'glass', 'glasses', 'bottle', 'bottles', 'rack', 'racks', 'cooler', 'cellar', 'barrel', 'opener',
      'decanter', 'cork', 'stopper', 'tasting', 'maker', 'press', 'fridge', 'bag', 'tote', 'label',
      'crate', 'box', 'cabinet', 'charm', 'ry', 'ries',
    ],
    beer: [
      'stein', 'steins', 'mug', 'mugs', 'glass', 'glasses', 'bottle', 'bottles', 'can', 'cans', 'tap',
      'keg', 'kegs', 'cooler', 'sign', 'signs', 'opener', 'coaster', 'coasters', 'tray', 'pong',
      'fridge', 'maker',
    ],
    cigar: ['illo', 'illos'],
    tobacco: ['nist', 'nists'],
    alcohol: ['ic', 'ics'],
    vape: ['r', 'rs', 'juice', 'pen', 'pens'],
    counterfeit: ['er', 'ers'],
    'government id': ['entification', 'entity'],
  };
  const fasKwCache = new Map();
  function fasKwEscape(t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function fasKwNorm(t) { return String(t || '').toLowerCase().replace(/[^\p{L}\p{N}:]+/gu, ' ').trim(); }
  function fasKwBuild(keyword) {
    const n = fasKwNorm(keyword);
    if (!n) return null;
    const words = n.split(' ');
    const first = words[0];
    const last = words[words.length - 1];
    const pre = Object.prototype.hasOwnProperty.call(FAS_KW_PREFIXES, n) ? FAS_KW_PREFIXES[n] : null;
    const preGroup = pre && pre.length ? '(?:' + pre.map(fasKwEscape).join('|') + ')?' : '';
    const tails = ['e?s', 'e?d', 'ing'];
    const lastC = last.charAt(last.length - 1);
    if (lastC && /[a-z]/.test(lastC)) tails.push(fasKwEscape(lastC) + '(?:ed|ing)');
    const post = Object.prototype.hasOwnProperty.call(FAS_KW_SUFFIXES, n) ? FAS_KW_SUFFIXES[n] : null;
    if (post) for (let i = 0; i < post.length; i++) tails.push(fasKwEscape(post[i]));
    const alts = [fasKwEscape(last) + '(?:' + tails.join('|') + ')?'];
    if (last.endsWith('y') && last.length > 1) alts.push(fasKwEscape(last.slice(0, -1)) + '(?:ies|ied)');
    if (last.endsWith('e') && last.length > 2) alts.push(fasKwEscape(last.slice(0, -1)) + '(?:ing|ed)');
    if (last.endsWith('fe') && last.length > 3) alts.push(fasKwEscape(last.slice(0, -2)) + 'ves');
    else if (last.endsWith('f') && last.length > 3) alts.push(fasKwEscape(last.slice(0, -1)) + 'ves');
    const lastPart = '(?:' + alts.join('|') + ')';
    let body;
    if (words.length === 1) {
      body = preGroup + lastPart;
    } else {
      const mid = words.slice(1, -1).map(fasKwEscape);
      body = [preGroup + fasKwEscape(first)].concat(mid, [lastPart]).join(' ?');
    }
    return new RegExp('(?:^| )' + body + '(?= |$)', 'u');
  }
  function fasKeywordMatch(haystack, keyword) {
    let re = fasKwCache.get(keyword);
    if (re === undefined) {
      re = fasKwBuild(keyword) || /(?!)/u;
      fasKwCache.set(keyword, re);
    }
    return re.test(fasKwNorm(haystack));
  }
  function gumtreeAuRestrictionReason(category, title) {
    const haystack = (String(category || '') + ' ' + String(title || '')).toLowerCase();
    if (!haystack.trim()) return null;
    if (GT_PROHIBITED_EXCLUDE_KEYWORDS.some((kw) => haystack.indexOf(kw) !== -1)) return null;
    if (GT_PROHIBITED_NAME_KEYWORDS.some((kw) => fasKeywordMatch(haystack, kw))) {
      return 'Gumtree Australia does not allow this category of item (weapons including knives, alcohol/tobacco, drugs, counterfeit/replica goods, and several other restricted categories are prohibited).';
    }
    return null;
  }

  // ---- sign-in wall detection (best-effort, DOM-based; informational only, NEVER a hard block --
  // if this misreads, the "I'm logged in, show me the details" button below lets the organizer
  // push past it manually). Requires a password field PLUS a sign-in-shaped heading/button before
  // calling it a wall, to avoid false-positiving on some unrelated page that merely mentions
  // "sign in" in a header link. UNVERIFIED against the real page structure post-login (no account
  // exists to confirm what the DOM looks like once past the wall) -- see the verification list at
  // the bottom of this file.
  function looksLikeSignInWall() {
    const hasPasswordField = !!q('input[type="password"]');
    if (!hasPasswordField) return false;
    const lower = bodyText().toLowerCase();
    return /sign in/.test(lower) || /log in/.test(lower) || /welcome back/.test(lower);
  }

  // Same best-effort/never-a-hard-gate shape as fas-craigslist.js's isLoggedIntoCraigslist --
  // returns true/false only on a clear signal, null when genuinely unknown on this page.
  function isLoggedIntoGumtreeAu() {
    if (looksLikeSignInWall()) return false;
    const clickable = qa('a, button');
    const hasLogout = clickable.some((el) => {
      const t = norm(el.textContent);
      return t === 'log out' || t === 'logout' || t === 'sign out' || t.indexOf('log out') !== -1 || t.indexOf('sign out') !== -1;
    });
    if (hasLogout) return true;
    const hasSignIn = clickable.some((el) => {
      const t = norm(el.textContent);
      return t === 'sign in' || t === 'log in' || t === 'login';
    });
    if (hasSignIn) return false;
    return null;
  }

  async function reportLoginState() {
    const state = isLoggedIntoGumtreeAu();
    FT('info', 'login_state', 'Gumtree AU sign-in state seen on this page: ' + (state === null ? 'unknown' : state ? 'signed in' : 'signed out'), { loggedIn: state });
    if (state === null) return;
    try { await chrome.runtime.sendMessage({ type: 'gumtreeAuLoginStateObserved', loggedIn: state }); } catch (e) {}
  }

  // ---- overlay UI (same bottom-right bar pattern as fas-craigslist.js / fas-remove.js) ----
  let bar;
  function ensureBar() {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'fas-gumtree-au-bar';
      bar.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:360px;' +
        'background:#1f2a24;color:#f3f5f2;border:1px solid #3c8c5a;border-radius:12px;padding:14px 16px;' +
        'font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.4)';
      document.documentElement.appendChild(bar);
    }
    return bar;
  }
  function overlay(html) { ensureBar().innerHTML = html; }
  function button(id, label, primary) {
    return '<button id="' + id + '" style="margin-top:10px;margin-right:8px;padding:7px 12px;border-radius:8px;border:none;cursor:pointer;' +
      'font-weight:600;font-size:13px;background:' + (primary ? '#3c8c5a' : '#3a4842') + ';color:#fff">' + label + '</button>';
  }
  function closeBtnHandler() { const c = document.getElementById('fas-gt-close'); if (c) c.onclick = () => bar && bar.remove(); }

  function itemDetailsText(item) {
    const price = item.price != null && isFinite(Number(item.price)) ? '$' + Number(item.price).toFixed(2) : '(no price set)';
    const lines = [
      item.title || '',
      'Price: ' + price,
      item.condition ? 'Condition: ' + item.condition : null,
      'Category: ' + (item.category || '(not set -- choose the closest Gumtree category yourself)'),
      '',
      item.description || ''
    ].filter((l) => l !== null);
    return lines.join('\n');
  }

  async function copyToClipboard(text, btnId, doneLabel) {
    try {
      await navigator.clipboard.writeText(text);
      const el = document.getElementById(btnId);
      if (el) { const orig = el.textContent; el.textContent = doneLabel || 'Copied!'; setTimeout(() => { el.textContent = orig; }, 1500); }
      return true;
    } catch (e) { return false; }
  }

  // ---- sign-in wall step: human owns login, same boundary fas-craigslist.js holds for
  // phone/email/CAPTCHA verification. Never types credentials, never clicks a submit on this
  // screen -- just waits and offers a manual override in case the DOM heuristic above is wrong. ----
  function doSignInStep(item, index, total) {
    FT('step', 'Waiting for you to sign in to Gumtree Australia', 'Gumtree hides its whole posting form until you are signed in, and FindA.Sale never types your login for you.', { index: index, total: total });
    FT('problem', {
      code: 'gt_sign_in_required',
      title: 'Sign in to Gumtree Australia to continue',
      what: 'Gumtree Australia is showing its sign-in screen, so FindA.Sale cannot see the posting form yet.',
      why: 'Gumtree only shows the "post an ad" form to signed-in sellers. FindA.Sale never enters your password or verification codes for you.',
      next: 'Close this, sign in on the page yourself, then press "I\'m signed in" in the FindA.Sale box to see this item\'s details ready to copy. Nothing has been posted or changed.',
      ctx: { index: index, total: total }
    });
    overlay('<b>FindA.Sale</b><div style="margin-top:6px;font-size:13px;color:#cfe3d6">' +
      'Sign in to Gumtree Australia to continue -- FindA.Sale never enters your login for you.' +
      '</div>' +
      button('fas-gt-continue', "I'm signed in — show item details", true) +
      button('fas-gt-close', 'Close', false));
    const cont = document.getElementById('fas-gt-continue');
    if (cont) cont.onclick = () => {
      const stillWall = looksLikeSignInWall();
      FT('info', 'user_confirmed_signed_in', 'You pressed "I\'m signed in"' + (stillWall ? ' but the page still looks like a sign-in screen' : ''), { stillLooksLikeSignInWall: stillWall });
      if (stillWall) FT('warn', 'sign_in_wall_still_visible', 'The page still looks like a sign-in screen; showing the item details anyway because you confirmed.');
      doAssistStep(item, index, total);
    };
    closeBtnHandler();
  }

  // ---- manual-assist step: the actual posting-form DOM (fields, category taxonomy, image
  // upload mechanism, submit button) has never been verified against a real logged-in session --
  // see the verification list at the bottom of this file. Rather than guess at any of it, this
  // shows the item's details in a copyable block so the organizer fills Gumtree's form themselves,
  // then confirms with the button below (which IS wired up -- it's the only automatable part of
  // this flow right now). ----
  function doAssistStep(item, index, total) {
    const more = (index + 1) < total;
    FT('step', 'Showing this item\'s details to copy into Gumtree', 'Gumtree\'s posting form has never been verified for auto-fill, so FindA.Sale will not guess at its fields; you paste the details and press post.', { index: index, total: total, photos: (item.photoUrls || []).length });
    const detailsText = itemDetailsText(item);
    const photoUrls = item.photoUrls || [];
    const photoNote = photoUrls.length
      ? photoUrls.length + ' photo' + (photoUrls.length === 1 ? '' : 's') + ' -- copy the links below and save/upload them to this listing yourself (Gumtree\'s own upload mechanism isn\'t automated yet).'
      : 'No photos on this item.';
    overlay('<b>FindA.Sale</b>' +
      '<div style="margin-top:6px;font-size:13px;color:#cfe3d6">Gumtree Australia\'s posting form isn\'t autofilled yet (see the extension popup for why) -- copy these details into the form yourself:</div>' +
      '<textarea id="fas-gt-details" readonly style="width:100%;height:90px;margin-top:8px;background:#14201a;color:#f3f5f2;border:1px solid #3c8c5a;border-radius:6px;padding:6px;font-size:12px;box-sizing:border-box">' + escapeHtml(detailsText) + '</textarea>' +
      button('fas-gt-copy', 'Copy details', false) +
      (photoUrls.length ? button('fas-gt-copy-photos', 'Copy photo links', false) : '') +
      '<div style="margin-top:6px;font-size:11px;color:#9fb6a8">' + escapeHtml(photoNote) + '</div>' +
      (more ? button('fas-gt-next', 'I posted — next item &#9654;', true) : button('fas-gt-next', 'I posted — done', true)) +
      button('fas-gt-close', 'Close', false) +
      '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');

    const copyBtn = document.getElementById('fas-gt-copy');
    if (copyBtn) copyBtn.onclick = async () => {
      const ok = await copyToClipboard(detailsText, 'fas-gt-copy', 'Copied!');
      FT(ok ? 'info' : 'warn', ok ? 'copy_details_ok' : 'copy_details_failed', ok ? 'Item details copied to the clipboard' : 'The browser blocked copying; select the text in the box and copy it by hand');
    };
    const copyPhotosBtn = document.getElementById('fas-gt-copy-photos');
    if (copyPhotosBtn) copyPhotosBtn.onclick = async () => {
      const ok = await copyToClipboard(photoUrls.join('\n'), 'fas-gt-copy-photos', 'Copied!');
      FT(ok ? 'info' : 'warn', ok ? 'copy_photos_ok' : 'copy_photos_failed', ok ? 'Photo links copied to the clipboard' : 'The browser blocked copying the photo links');
    };

    const next = document.getElementById('fas-gt-next');
    if (next) next.onclick = async () => {
      // Same fire-and-forget markListed call fas-craigslist.js makes on its own "I posted"
      // confirm button -- remoteListingId stays null (Gumtree AU never exposes a listing id/url
      // back to this script since nothing here reads its post-submit response).
      FT('step', 'Recording that you posted this item', 'So FindA.Sale shows it as listed on Gumtree Australia, does not offer it again, and works out a renewal date.');
      let mlResp = null;
      try { mlResp = await chrome.runtime.sendMessage({ type: 'markListed', itemId: item.id, ...(await fasListingRef('GUMTREE_AU', 0)), platform: 'GUMTREE_AU' }); }
      catch (e) { FT('warn', 'mark_listed_threw', 'Could not reach the FindA.Sale extension background to record the listing: ' + ((e && e.message) || 'unknown'), {}); }
      if (mlResp && mlResp.ok === false) FT('warn', 'mark_listed_rejected', 'FindA.Sale could not record this listing (backend said no)', ftRespCtx(mlResp));
      else FT('info', 'mark_listed_result', 'Recorded as listed on Gumtree Australia', ftRespCtx(mlResp));
      try { await chrome.runtime.sendMessage({ type: 'advanceGumtreeAuQueue' }); } catch (e) { FT('warn', 'advance_queue_threw', 'Could not advance the Gumtree queue: ' + ((e && e.message) || 'unknown')); }
      FT('ok', 'Item recorded as posted');
      if (more) { FT('end', 'Recorded "' + String(item.title || '').slice(0, 40) + '". Opening the next item.'); location.href = POST_URL; } else { FT('end', 'All queued Gumtree Australia items are recorded.'); bar && bar.remove(); }
    };
    closeBtnHandler();
  }

  function run(item, index, total) {
    if (looksLikeSignInWall()) { doSignInStep(item, index, total); return; }
    doAssistStep(item, index, total);
  }

  // ================================================================================================
  // CROSS-PLATFORM AUTO-REMOVE-ON-SOLD-ELSEWHERE (S-EXT-CROSS-PLATFORM-AUTOREMOVE, 2026-08-22)
  // Gumtree AU's logged-in DOM has NEVER been verified (see the file header) -- there is no safe
  // way to guess a delete/kebab-menu selector on a page structure nobody has confirmed. So unlike
  // Poshmark/Mercari/Grailed/Vinted (which attempt a real automated delete), this stays consistent
  // with this file's own existing manual-assist design for POSTING: show the organizer which item
  // to remove, let them delete it on Gumtree themselves, and record their confirmation. This is
  // the same "human owns the action the DOM can't safely automate, extension just tracks it"
  // pattern already used above for posting -- not a new risk, not a guess.
  function doRemovalAssistStep(item, index, total) {
    const more = (index + 1) < total;
    FT('step', 'Asking you to delete the sold item from Gumtree Australia', 'This item sold on another channel. Gumtree\'s My Ads page has never been verified for automatic delete, so you delete it and FindA.Sale records it.', { index: index, total: total });
    overlay('<b>FindA.Sale</b>' +
      '<div style="margin-top:6px;font-size:13px;color:#cfe3d6">This item sold elsewhere -- <b>' + escapeHtml(item.title) + '</b> is still listed on Gumtree Australia. Please delete that listing yourself (My Ads &rarr; find it &rarr; Delete), then confirm below.</div>' +
      (more ? button('fas-gt-removed-next', 'I removed it — next item &#9654;', true) : button('fas-gt-removed-next', 'I removed it — done', true)) +
      button('fas-gt-close', 'Close', false) +
      '<div style="margin-top:8px;font-size:11px;color:#9fb6a8">Item ' + (index + 1) + ' of ' + total + '</div>');

    const next = document.getElementById('fas-gt-removed-next');
    if (next) next.onclick = async () => {
      FT('step', 'Recording that you removed the Gumtree listing', 'So FindA.Sale stops tracking it as live on Gumtree Australia.');
      let rmResp = null;
      try { rmResp = await chrome.runtime.sendMessage({ type: 'markItemRemovedByRemoval', itemId: item.id, platform: 'GUMTREE_AU' }); }
      catch (e) { FT('warn', 'mark_removed_threw', 'Could not reach the extension background to record the removal: ' + ((e && e.message) || 'unknown')); }
      if (rmResp && rmResp.ok === false) FT('warn', 'mark_removed_rejected', 'FindA.Sale could not record the removal (backend said no)', ftRespCtx(rmResp));
      else FT('info', 'mark_removed_result', 'Recorded the Gumtree removal', ftRespCtx(rmResp));
      try { await chrome.runtime.sendMessage({ type: 'advanceRemovalQueueFor', platform: 'GUMTREE_AU' }); } catch (e) { FT('warn', 'advance_removal_threw', 'Could not advance the removal queue: ' + ((e && e.message) || 'unknown')); }
      FT('ok', 'Removal recorded');
      if (more) { FT('end', 'Removal recorded. Loading the next item.'); location.reload(); } else { FT('end', 'All queued Gumtree removals are recorded.'); bar && bar.remove(); }
    };
    closeBtnHandler();
  }

  async function maybeRunGumtreeAuRemoval() {
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getRemovalQueueItemFor', platform: 'GUMTREE_AU' }); } catch (e) { return false; }
    if (!queued || !queued.ok || !queued.item) return false;
    FT('begin', { platform: 'GUMTREE_AU', flow: 'remove', item: { id: queued.item.id, title: queued.item.title }, itemPos: (queued.index + 1) + ' of ' + queued.total });
    try {
      doRemovalAssistStep(queued.item, queued.index, queued.total);
    } catch (e) {
      FT('error', 'removal_step_failed', 'Could not show the removal step: ' + ((e && e.message) || 'unknown'));
      FT('problem', { code: 'gt_removal_step_failed', title: 'Could not show the Gumtree removal step', what: 'This item sold elsewhere and should come down from Gumtree Australia, but the extension hit an error showing its removal prompt.', why: (e && e.message) || 'Unknown error.', next: 'Delete the listing yourself (My Ads, find it, Delete). FindA.Sale will offer the removal again on a later run.' });
      overlay('<b>FindA.Sale</b><div style="margin-top:6px;color:#ffcf7a">Something went wrong showing the removal step. Please delete the listing yourself.</div>' + button('fas-gt-close', 'Close', false));
      closeBtnHandler();
    }
    return true;
  }

  async function start() {
    await sleep(500); // let the page settle before reading the DOM
    reportLoginState(); // fire-and-forget, best-effort, mirrors fas-craigslist.js's reportLoginState
    let queued;
    try { queued = await chrome.runtime.sendMessage({ type: 'getGumtreeAuQueueItem' }); } catch (e) { FT('info', 'queue_fetch_failed', 'Could not ask the extension for the Gumtree queue: ' + ((e && e.message) || 'unknown')); return; }
    if (!queued || !queued.ok || !queued.item) return; // nothing queued -- stay silent
    FT('begin', { platform: 'GUMTREE_AU', flow: 'post', item: { id: queued.item.id, title: queued.item.title }, itemPos: (queued.index + 1) + ' of ' + queued.total });
    FT('info', 'queue_item', 'Got the next Gumtree Australia item from the queue', { index: queued.index, total: queued.total, hasCategory: !!queued.item.category, photos: (queued.item.photoUrls || []).length });
    FT('step', 'Checking Gumtree\'s prohibited-items rules for this item', 'Weapons, alcohol, counterfeit goods and other restricted items are not allowed, and FindA.Sale stops those before showing them for posting.');

    // Gumtree Australia Prohibited Items gate (S-CROSS-MARKETPLACE-AUDIT-2026-09-03) -- checked
    // BEFORE run()/doAssistStep() ever displays the item's details for copy-paste, and before
    // looksLikeSignInWall() even reads the DOM for this item -- the earliest point in this file
    // that knows what item is queued and hasn't touched the DOM for it yet. Skips straight to the
    // next queued item -- markListed is NEVER called, so it stays available to push on other
    // channels, same as fas-craigslist.js's identical gate. advanceGumtreeAuQueue is this file's
    // own existing "move the queue pointer forward" message (already used at the end of
    // doAssistStep's "I posted" handler, always paired there with markListed for a real post --
    // here it's called alone, without markListed, which is exactly the skip-without-marking-listed
    // behavior this gate needs).
    const gtReason = gumtreeAuRestrictionReason(queued.item.category, queued.item.title);
    if (gtReason) {
      console.warn('[FAS Gumtree AU] skipping listing (Prohibited Items policy):', queued.item.id, queued.item.title, gtReason);
      FT('problem', { code: 'gt_prohibited_item_skipped', title: 'Skipped: Gumtree does not allow this item', what: 'This item matches one of Gumtree Australia\'s restricted categories, so FindA.Sale skipped it.', why: gtReason, next: 'It was not shown for posting and was not marked as listed, so you can still send it to other channels. Moving on to the next queued item, if there is one.', ctx: { category: queued.item.category || '' } });
      overlay('<b>FindA.Sale</b><div style="color:#ffcf7a;margin-top:6px;font-size:12px">Skipped <b>' + escapeHtml(queued.item.title || 'this item') + '</b> -- ' + escapeHtml(gtReason) + '</div>');
      await sleep(1500);
      try { await chrome.runtime.sendMessage({ type: 'advanceGumtreeAuQueue' }); } catch (e) {}
      const next = await (async () => { try { return await chrome.runtime.sendMessage({ type: 'getGumtreeAuQueueItem' }); } catch (e) { return null; } })();
      if (next && next.ok && next.item) { location.href = POST_URL; } else { FT('end', 'Skipped the last queued item (prohibited on Gumtree). Queue finished.'); overlay('<b>FindA.Sale</b> — all done. Happy selling!'); setTimeout(() => bar && bar.remove(), 4000); }
      return;
    }
    FT('ok', 'Item passed the prohibited-items check');

    run(queued.item, queued.index, queued.total);
  }

  (async () => {
    const ranRemoval = await maybeRunGumtreeAuRemoval();
    if (!ranRemoval) start();
  })();
})();

/* ---- What still needs a real logged-in Gumtree AU seller account to verify (ADR-102 §9/§4) ----
 * Not "needs more testing" -- specifically, a logged-in session is needed to confirm:
 *   1. The post-login posting-form field names/ids for title, price, description, condition, and
 *      whether Gumtree AU exposes a "for sale by owner"-equivalent listing type toggle at all.
 *   2. Gumtree AU's category taxonomy (its own tree, not assumed to resemble Craigslist's or
 *      Facebook's) -- no mapping table exists in this file because guessing one risks silently
 *      misfiling every listing.
 *   3. The image upload mechanism (drag-and-drop zone vs. plain <input type="file">, and whether
 *      it accepts a programmatic DataTransfer the way Craigslist's does) -- this file does not
 *      attempt any photo injection, only copies the URLs for manual upload.
 *   4. Whether Gumtree AU requires phone/SMS verification to publish a first listing (Gumtree's
 *      other regional sites commonly do) -- if so, the human-owns-verification boundary this file
 *      already assumes still applies, but the exact trigger point is unconfirmed.
 *   5. Whether a native "renew"/"bump" action exists on the seller's own listings-management page,
 *      and what it looks like -- background.js's auto-renew currently always falls back to a full
 *      repost for GUMTREE_AU (same as Craigslist) specifically because this has never been checked.
 *   6. The real listing lifespan/expiry window -- extensionController.ts currently uses a flagged,
 *      unverified 14-day placeholder (see RENEWAL_LAPSE_WINDOW_DAYS comment) pending this.
 *   7. Whether the sign-in-wall heuristic in this file (looksLikeSignInWall) actually matches the
 *      real sign-in page's markup, and what the DOM looks like immediately after a successful
 *      login (to confirm isLoggedIntoGumtreeAu's logged-in branch fires correctly).
 */
