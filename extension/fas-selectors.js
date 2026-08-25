/*
 * FindA.Sale — Facebook Marketplace form selectors.
 * ADR-084 hard rule: NEVER select by Facebook's obfuscated CSS classes.
 * Only role / aria / label-text / structural anchors. This is the ONE place to
 * update when Facebook changes their form — everything else stays untouched.
 */
(function () {
  function norm(s) { return (s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  // Find a labelled field (input/textarea) by its visible label text.
  // FB wraps controls as <label><span>Title</span> ... <input/textarea></label>.
  function fieldByLabel(labelText) {
    const want = norm(labelText);
    const labels = Array.from(document.querySelectorAll('label'));
    for (const lab of labels) {
      const txt = norm(lab.getAttribute('aria-label') || lab.textContent);
      if (txt === want || txt.startsWith(want)) {
        const control = lab.querySelector('input, textarea');
        if (control) return control;
      }
    }
    // Fallback: aria-label on the control itself.
    return document.querySelector(
      'input[aria-label="' + labelText + '"], textarea[aria-label="' + labelText + '"]'
    );
  }

  // Find a combobox trigger (Condition / Category) by label text.
  function comboByLabel(labelText) {
    const want = norm(labelText);
    const combos = Array.from(document.querySelectorAll('[role="combobox"], label[role="combobox"]'));
    for (const c of combos) {
      const txt = norm(c.getAttribute('aria-label') || c.textContent);
      if (txt.includes(want)) return c;
    }
    // Fallback: a label whose text matches, return its nearest combobox/clickable.
    const labels = Array.from(document.querySelectorAll('label'));
    for (const lab of labels) {
      if (norm(lab.textContent).startsWith(want)) {
        return lab.querySelector('[role="combobox"]') || lab;
      }
    }
    return null;
  }

  // Currently-open listbox option whose text matches (exact first, then contains).
  function optionByText(text) {
    const want = norm(text);
    const opts = Array.from(document.querySelectorAll('[role="option"]'));
    return (
      opts.find((o) => norm(o.textContent) === want) ||
      opts.find((o) => norm(o.textContent).includes(want)) ||
      null
    );
  }

  // The photo file input (accepts images). Prefer accept*=image; fall back to any file input.
  function photoInput() {
    return (
      document.querySelector('input[type="file"][accept*="image"]') ||
      document.querySelector('input[type="file"]')
    );
  }

  // Facebook's Category field (confirmed live 2026-07-15) does NOT render a standard
  // [role="option"] listbox — it shows up to a handful of AI-suggested category chips as
  // div[role="button"] elements as soon as the combobox is clicked. Condition still uses the
  // normal option/listbox pattern (untouched, confirmed working). Because the chips' DOM
  // position varies and isn't reliably reachable via ancestor/sibling traversal, we diff
  // div[role="button"] elements before/after the combobox opens to isolate just the new chips.
  async function chipsAfter(openFn, settleMs) {
    const before = new Set(document.querySelectorAll('div[role="button"]'));
    await openFn(); // realClick() is async (dispatches a settle wait) -- await it before diffing
    await new Promise((r) => setTimeout(r, settleMs));
    return Array.from(document.querySelectorAll('div[role="button"]')).filter(
      (b) => !before.has(b) && norm(b.textContent)
    );
  }

  // Category suggestion chips (confirmed live 2026-07-17). chipsAfter's before/after DIFF misses
  // Facebook's TOP category suggestion because FB renders it as a PERSISTENT chip that already
  // exists below the Category field BEFORE the combobox is clicked (verified: one visible
  // div[role="button"] "Musical Instruments", aria-disabled=null, present pre-click) -- so the
  // diff returned [] and selectCategory left Category unset, stalling the whole listing at
  // "Item details". This collects the UNION of persistent + newly-appeared chips: it scans AFTER
  // the combo opens (so the live DOM already contains both the still-present persistent chip and
  // any freshly-rendered ones -- a single post-open querySelectorAll IS that union, de-duped),
  // filters out the combobox itself and known non-chip controls (Next/Previous/Save draft/Add
  // photos/etc.), keeps only visible, enabled, short-label buttons, and orders chips that sit
  // AFTER the Category field in DOM order first (FB lists suggestions directly beneath it).
  // Pure DOM scan for FB's category suggestion chips -- no open, no wait. Filters out the
  // combobox itself + known non-chip controls, keeps visible/enabled/short-label buttons, and
  // orders chips that sit AFTER the Category field first. Shared by categoryChips (scans AFTER
  // opening) and persistentCategoryChips (scans the CURRENT DOM without opening).
  function scanCategoryChips(combo) {
    if (!combo) return [];
    const EXCLUDE = ['next', 'previous', 'back', 'publish', 'category', 'condition',
      'close', 'cancel', 'done', 'edit', 'remove', 'more'];
    const isVisible = (el) => !!(el.offsetParent || el.getClientRects().length);
    const nodes = Array.from(document.querySelectorAll('div[role="button"], span[role="button"]'));
    const candidates = nodes.filter((el) => {
      if (el === combo || combo.contains(el) || el.contains(combo)) return false;
      if (el.getAttribute('aria-disabled') === 'true') return false;
      if (!isVisible(el)) return false;
      const t = norm(el.textContent);
      if (!t || t.length > 40) return false; // real FB category labels are short ("Home & Garden")
      if (EXCLUDE.includes(t)) return false;
      // Substring rejects for FB's description-field prompt junk -- a div[role="button"] reading
      // "...attract more interest by including more details" (~58 chars) that sits AFTER the
      // Category combo and survived the exact-match EXCLUDE, becoming persistent[0] and getting
      // wrongly clicked (confirmed live 2026-07-17). EXCLUDE is exact-match only -- use substrings.
      const JUNK = ['attract more interest', 'more detail', 'include more'];
      if (JUNK.some((j) => t.indexOf(j) !== -1)) return false;
      if (t.startsWith('add photo') || t.startsWith('save draft')) return false;
      return true;
    });
    // Prefer chips that come AFTER the Category combobox in document order; keep the rest as
    // lower-priority fallbacks. DOCUMENT_POSITION_FOLLOWING === 4.
    const after = [], other = [];
    for (const el of candidates) {
      ((combo.compareDocumentPosition(el) & 4) ? after : other).push(el);
    }
    return after.concat(other);
  }

  async function categoryChips(combo, openFn, settleMs) {
    await openFn(); // realClick() is async (dispatches a settle wait) -- await before scanning the DOM
    await new Promise((r) => setTimeout(r, settleMs));
    return scanCategoryChips(combo);
  }

  // Persistent suggestion chip(s) present BEFORE the combobox is opened -- FB renders its top
  // category suggestion as an always-visible chip beneath the Category field. Confirmed live
  // 2026-07-17: a DIRECT click on this chip (WITHOUT opening the combobox) SETS the category and
  // clears the "Please select a category" prompt; opening the combobox first swaps the UI (search
  // field/modal) and makes the chip an invalid target. Restricted to chips positioned AFTER the
  // Category field so a closed-combobox scan can't grab unrelated page buttons.
  function persistentCategoryChips(combo) {
    if (!combo) return [];
    return scanCategoryChips(combo).filter((el) => combo.compareDocumentPosition(el) & 4);
  }

  // Best-effort fuzzy match against a list of candidate elements: exact > substring
  // (either direction) > word overlap. Returns null if nothing scores meaningfully —
  // callers should never guess-click a low-confidence match.
  function bestTextMatch(candidates, value) {
    const want = norm(value);
    const wantWords = want.split(' ').filter((w) => w.length > 2);
    let best = null, bestScore = 0;
    for (const el of candidates) {
      const t = norm(el.textContent);
      let score = 0;
      if (t === want) score = 100;
      else if (want.includes(t) || t.includes(want)) score = 50;
      else score = wantWords.filter((w) => t.includes(w)).length * 10;
      if (score > bestScore) { bestScore = score; best = el; }
    }
    return bestScore >= 10 ? best : null;
  }

  // Generic accessible-name clickable finder -- used for step "Next"/"Publish" buttons and
  // modal triggers like "Select shipping label". Exact-trim match only (deliberately strict --
  // a loose substring match risks clicking the wrong control on a page this dense with buttons).
  function elementByText(text) {
    const want = norm(text);
    const nodes = Array.from(document.querySelectorAll('div[role="button"], button'));
    return nodes.find((n) => norm(n.textContent) === want) || null;
  }

  // FB's Package weight step (Delivery) renders 6 fixed radio buckets -- confirmed live
  // 2026-07-15: "Under 0.5 lbs" / "0.5-1 lbs" / "1-2 lbs" / "2-5 lbs" / "5-10 lbs" / "10-70 lbs".
  // Unlike Category's dynamic AI chips this is a small fixed enumerable set, so a direct
  // substring match against the radio's label text is reliable.
  function radioLabelByText(text) {
    const want = norm(text);
    const radios = Array.from(document.querySelectorAll('[role="radio"], input[type="radio"]'));
    const wrapped = radios.map((r) => r.closest('label') || r.parentElement);
    return wrapped.find((label) => norm(label.textContent).includes(want)) || null;
  }

  // Facebook's "Package weight" combo offers the fixed 6-bucket radio list above by default,
  // but also an "Enter exact weight" link (a plain div[role="button"], confirmed live
  // 2026-07-18 -- tag DIV, role="button", text "Enter exact weight" + a trailing chevron) that
  // swaps in two text inputs -- see weightExactInputs. Once a listing has been set via exact
  // weight, Facebook remembers that mode and reopening Package weight goes straight back to the
  // exact-weight inputs, skipping this link entirely -- callers should check
  // weightExactInputs() first and only look for this link if the inputs aren't already present.
  function weightExactLink() {
    const want = 'enter exact weight';
    const nodes = Array.from(document.querySelectorAll('div[role="button"], span[role="button"], a, button'));
    return nodes.find((n) => norm(n.textContent).indexOf(want) === 0) || null;
  }

  // The lb/oz text inputs inside Package weight's "Enter exact weight" sub-panel (confirmed
  // live 2026-07-18): two plain input[type="text"] elements with no aria-label and only opaque
  // auto-generated ids (e.g. "_r_9t_"), distinguished instead by their immediate parent's own
  // text content, which is exactly "lb" / "oz" (the unit renders as a sibling text node next to
  // the input, not an aria-label on it). Returns {lbInput, ozInput}, either side null if not
  // found -- both are only present once the exact-weight sub-panel is open (see weightExactLink).
  function weightExactInputs() {
    const boxes = Array.from(document.querySelectorAll('input[type="text"]')).filter((i) => {
      const r = i.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const byUnit = (unit) => boxes.find((b) => norm(b.parentElement && b.parentElement.textContent) === unit) || null;
    return { lbInput: byUnit('lb'), ozInput: byUnit('oz') };
  }

  // "Your listings" page (marketplace/you/selling) -- confirmed live 2026-07-15: each listing
  // card exposes a direct "Mark as sold" clickable (not behind a menu), 4 DOM levels above a
  // shared ancestor whose text contains the title + price + "$". No Facebook-assigned listing
  // ID is available to match against (the extension never captures one at publish time -- see
  // ADR-084 amendment "Flagged, not fixed" note) so cards are matched by title text instead.
  // Deliberately does NOT use bestTextMatch's word-overlap fallback here -- an ambiguous match
  // risks marking the WRONG live listing as sold, a materially worse failure than picking
  // Facebook's second-best category suggestion, so this only returns a card on an exact or
  // clean-substring title match, and returns null (caller must skip + flag) otherwise.
  // (2026-08-06 fix) Facebook's "Your listings" grid only renders an initial page of cards on
  // load -- confirmed live: an unscrolled page load rendered ~16 cards total, and a genuinely
  // Sold item from 2+ weeks earlier (a real completed order, confirmed via Facebook's own
  // Status: Sold filter + search) was completely absent from the DOM at that point. Every
  // scan function below (listingCardByTitle, alreadySoldCardByTitle, allSoldListingCards) was
  // therefore silently scanning only that first page -- reporting "no confident match" (removal
  // direction) or simply never finding a real sold-card match (reverse sold-detection
  // direction) for anything paginated further down. This was NOT a title-matching bug -- it was
  // a coverage bug: the DOM being searched never contained the card at all.
  // Confirmed live 2026-08-06: Facebook's lazy-load pagination does NOT respond to
  // element.scrollIntoView() or a programmatic window.scrollBy() (both measured as a genuine
  // no-op -- document.body.innerText.length did not change). It DOES respond to a real
  // scrollTop increment paired with dispatched wheel + scroll events -- same "Facebook requires
  // a specific trusted-like event sequence, not just a DOM/property change" pattern as
  // realClick() above. Stops once two consecutive scroll attempts produce no new content
  // (reached the true end of the list) or maxScrolls is hit (safety cap so a very large
  // inventory can never hang a single ~20-min poll cycle indefinitely). Callers: fas-remove.js
  // start() runs this once per page load, before either the sold-detection scan or the removal
  // queue touches the DOM, so every card-lookup function below sees the FULL listing set.
  async function loadAllListingCards(maxScrolls) {
    const cap = typeof maxScrolls === 'number' ? maxScrolls : 30;
    let lastLen = document.body.innerText.length;
    let stableCount = 0;
    for (let i = 0; i < cap && stableCount < 2; i++) {
      document.documentElement.scrollTop += 1000;
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: 1000, bubbles: true, cancelable: true }));
      document.dispatchEvent(new Event('scroll', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 500));
      const len = document.body.innerText.length;
      if (len === lastLen) { stableCount++; } else { stableCount = 0; lastLen = len; }
    }
  }

  function listingCardByTitle(title) {
    const want = norm(title);
    if (!want) return null;
    const soldButtons = Array.from(document.querySelectorAll('div[role="button"], button, span[role="button"], a[role="button"]'))
      .filter((b) => norm(b.textContent) === 'mark as sold');
    const candidates = [];
    for (const btn of soldButtons) {
      let el = btn, hops = 0, cardText = null, cardEl = null;
      while (el && hops < 16) {
        el = el.parentElement;
        hops++;
        if (!el) break;
        const t = norm(el.textContent);
        if (t.indexOf('$') !== -1 && t.length > 40) { cardText = t; cardEl = el; break; }
      }
      if (cardText && (cardText === want || cardText.indexOf(want) !== -1)) {
        candidates.push({ button: btn, cardEl, cardText });
      }
    }
    if (candidates.length === 1) return candidates[0];
    return null; // zero or ambiguous (multiple) matches -- caller skips + flags, never guesses
  }

  // (2026-07-26 fix) Facebook shows "Mark as available"/"Relist this item" instead of
  // "Mark as sold" once a listing is ALREADY Sold -- listingCardByTitle above only recognizes
  // the "Mark as sold" control, so an already-sold card (the normal steady state right after a
  // successful removal, or a listing Patrick marked sold by hand) returned null there,
  // indistinguishable from "can't find it / ambiguous". removeOne() in fas-remove.js treated
  // that null as a hard failure and never told the backend, so the SAME already-sold item got
  // re-served by /extension/pending-removals and re-"failed" on every poll cycle forever.
  // Confirmed live 2026-07-26: "Bjorn Borg Signed Tennis Ball, Vintage" and "Left Handed FILA
  // Golf Club Set with Bag, Irons and Woods" were BOTH already Sold on Facebook the entire time
  // Patrick kept seeing removal errors -- there was nothing left to remove.
  // Same single-confident-match discipline as listingCardByTitle: dedup by card element first
  // ("Mark as available" AND "Relist this item" both sit on the same sold card, so a naive count
  // would see 2 hits on one real card and wrongly call it ambiguous), then require exactly one
  // candidate card. Zero or truly ambiguous (multiple distinct cards) still return null.
  function alreadySoldCardByTitle(title) {
    const want = norm(title);
    if (!want) return null;
    const markers = Array.from(document.querySelectorAll('div[role="button"], button, span[role="button"], a[role="button"]'))
      .filter((b) => {
        const t = norm(b.textContent);
        return t === 'mark as available' || t === 'relist this item';
      });
    // (2026-08-07 fix) Dedupe by normalized TEXT, not element reference. DOM-verified live
    // 2026-08-07 (Borosilicate Glass Rod item, unfiltered page): "Mark as available" and
    // "Relist this item" both sit on the SAME real card, but their independent 16-hop walk-up
    // can land on two different-but-nested ancestor elements that happen to share IDENTICAL
    // aggregated textContent. Keying by element reference treated those as 2 distinct
    // candidates and wrongly called one real card "ambiguous" -- keying by the text itself
    // collapses them back to a single entry.
    const cardMap = new Map(); // cardText -> cardEl, deduped by text
    for (const btn of markers) {
      let el = btn, hops = 0;
      while (el && hops < 16) {
        el = el.parentElement;
        hops++;
        if (!el) break;
        const t = norm(el.textContent);
        if (t.indexOf('$') !== -1 && t.length > 40) { if (!cardMap.has(t)) cardMap.set(t, el); break; }
      }
    }
    const candidates = Array.from(cardMap.entries())
      .filter(([cardText]) => cardText === want || cardText.indexOf(want) !== -1)
      .map(([cardText, cardEl]) => ({ cardEl, cardText }));
    if (candidates.length === 1) return candidates[0];
    return null; // zero or ambiguous -- caller falls through to the genuine skip+flag path
  }

  // ADR-100 §10/§11/§12 (2026-08-09): "Renew listing" button for a specific title on
  // marketplace/you/selling -- confirmed live 2026-08-09 via Chrome (read-only inspection, no
  // submit): each Active listing card that hasn't hit Facebook's 5-renewal cap shows a direct
  // "Renew listing" button alongside "Mark as sold" and "Share". Same single-confident-match
  // walk-up pattern as listingCardByTitle/alreadySoldCardByTitle (16-hop ancestor search for a
  // "$"-containing card >40 chars) -- kept as its own function rather than refactoring those
  // two (both are live-tested; not touching them). Returns null when the button isn't found for
  // a confidently-matched card -- this is the caller's signal that either (a) the title doesn't
  // match a live card at all, or (b) the card exists but has no Renew button, i.e. it has HIT
  // THE 5-RENEWAL CAP and needs Facebook's separate "Delete & relist" flow instead (NOT yet
  // automated as of this dispatch -- see fas-remove.js renewOne() for the fallback behavior).
  function renewButtonByTitle(title) {
    const want = norm(title);
    if (!want) return null;
    const buttons = Array.from(document.querySelectorAll('div[role="button"], button, span[role="button"], a[role="button"]'))
      .filter((b) => norm(b.textContent) === 'renew listing');
    const candidates = [];
    for (const btn of buttons) {
      let el = btn, hops = 0, cardText = null, cardEl = null;
      while (el && hops < 16) {
        el = el.parentElement;
        hops++;
        if (!el) break;
        const t = norm(el.textContent);
        if (t.indexOf('$') !== -1 && t.length > 40) { cardText = t; cardEl = el; break; }
      }
      if (cardText && (cardText === want || cardText.indexOf(want) !== -1)) {
        candidates.push({ button: btn, cardEl, cardText });
      }
    }
    if (candidates.length === 1) return candidates[0];
    return null; // zero or ambiguous -- caller treats the same as "not found", never guesses
  }

  // (2026-08-05) Reverse-direction sold detection: FindA.Sale has no way to learn an item sold
  // NATIVELY on Facebook (no webhook/API -- same DOM-poll gap as everything else in this file).
  // alreadySoldCardByTitle above checks ONE specific known title; this scans the WHOLE "Your
  // listings" grid and returns EVERY currently-Sold card's text, so a caller (fas-remove.js) can
  // check a list of candidate titles against the full set in one DOM pass instead of one query
  // per candidate. Same marker detection (role="button" elements reading "mark as available" /
  // "relist this item") and same 8-hop-up DOM walk to find the enclosing card (first ancestor
  // whose text contains "$" and is longer than 40 chars) as alreadySoldCardByTitle -- kept in
  // exact sync so a Facebook DOM change only needs fixing in one place, not two. Deduped by card
  // element (a card can carry both markers at once, same as alreadySoldCardByTitle's cardMap).
  // Returns [] if nothing is currently Sold. Never filters by title -- the caller does its own
  // single-confident-match check against this list (same "never guess the wrong listing"
  // philosophy as listingCardByTitle/alreadySoldCardByTitle).
  //
  // (2026-08-13 fix, real bug) Until this fix, the marker list below ONLY matched
  // 'mark as available' / 'relist this item' -- the state Facebook shows when a seller
  // manually marks a listing sold/unavailable with NO real order. It had NO marker for
  // Facebook's own Checkout flow, which instead shows a "View Order" control on the card
  // once a buyer actually purchases through Facebook. A stale comment elsewhere in this
  // codebase (fas-remove.js, near openSilentRemovalTab) claimed both cases were already
  // covered here -- they were not; only the manual-mark-sold case was ever implemented.
  // Confirmed live in production 2026-08-13: an item sold via Facebook Checkout (real
  // "View Order" button present) was never detected, never reported to
  // POST /api/extension/items/:id/sold-on-facebook, and stayed falsely AVAILABLE on both
  // FindA.Sale and eBay indefinitely. Adding 'view order' as a third marker, same
  // selector/matching pattern as the other two (not a new selector strategy).
  // NOT LIVE-VERIFIED: this dispatch could not confirm 'View Order' actually renders as
  // one of div[role="button"] / button / span[role="button"] / a[role="button"] on a real
  // Facebook Checkout-sold card (it may instead be a plain, non-role <a> navigation link to
  // Commerce Manager, in which case this selector will miss it). Needs a Chrome QA
  // spot-check against a real Facebook-Checkout-sold listing before this is trusted at
  // scale -- see this dispatch's handoff.
  //
  // (2026-08-24, defensive hardening -- STILL NOT LIVE-VERIFIED, see note directly above)
  // The single exact string 'view order' has never been confirmed against a real Facebook
  // Checkout-sold card -- if Facebook's actual copy differs even slightly ("View your order",
  // "Order confirmed", "Order details"), the old exact-match check would silently miss it
  // forever with zero signal, exactly the reverse-sold-detection failure this file exists to
  // prevent. Two changes, both reusing patterns already used elsewhere in this file rather than
  // inventing a new selector strategy: (1) widen the single exact string to a small set of
  // plausible Facebook phrasings, matched as a normalized substring (norm() already
  // lowercases/collapses whitespace, same as every other text-marker function above); (2) for
  // matches that land ONLY via this still-unverified widened set (never for the two
  // already-trusted exact markers), cross-check the enclosing card's own text for the ABSENCE of
  // "mark as sold" -- the same card-boundary text this function already computes for the dedupe
  // walk below, no new DOM query -- since a genuinely Sold-via-Checkout card should no longer
  // carry an active listing's primary action. A widened-marker hit whose card still reads "mark
  // as sold" is treated as a likely false-positive substring collision and excluded, not trusted.
  // A separate, deliberately looser "does this text contain the word order at all" check logs
  // (console.log, not silent) any role-button that looks order-related but matched none of the
  // markers above, so a human reviewing the extension's console output can catch a real
  // Facebook-phrasing mismatch instead of it failing silently forever. None of this replaces the
  // Chrome QA spot-check against a real Facebook-Checkout-sold listing flagged above -- it only
  // reduces the blast radius of that check still being outstanding.
  const CHECKOUT_ORDER_MARKERS = ['view order', 'view your order', 'order confirmed', 'order details'];
  function isCheckoutOrderMarker(t) {
    return CHECKOUT_ORDER_MARKERS.some((m) => t.indexOf(m) !== -1);
  }
  // Deliberately broader than isCheckoutOrderMarker (a bare "order" substring) -- used ONLY for
  // the diagnostic console.log below, never to accept a card as sold. Exists so a real-world
  // Facebook phrasing that misses even the widened marker list above still leaves a trace in the
  // console instead of vanishing with zero signal.
  function looksOrderRelated(t) {
    return t.indexOf('order') !== -1;
  }
  function allSoldListingCards() {
    // (2026-08-24, dead-marker fix) Widened to also include a[role="link"] -- confirmed via
    // live QA against 2 real Facebook-Checkout-sold orders that the real "View Order" control
    // is a bare <span> nested inside <a role="link" href=".../shipping_orders/...">, not any
    // role="button" element. The selector above never matched it, so CHECKOUT_ORDER_MARKERS
    // could never fire against real Facebook DOM (detection still succeeded via the older
    // "relist this item" marker on both orders checked, so this was not a live break -- but a
    // listing state showing ONLY "View Order" with no other marker would have silently failed
    // detection). Additive only: the two already-trusted exact markers ('mark as available',
    // 'relist this item') and all matching/dedupe logic below are unchanged -- this just adds
    // a[role="link"] elements to the pool of candidates inspected.
    const allRoleButtons = Array.from(document.querySelectorAll('div[role="button"], button, span[role="button"], a[role="button"], a[role="link"]'));
    // (2026-08-07 fix) Same element-reference dedup bug as alreadySoldCardByTitle above --
    // fixed the same way (dedupe by normalized text, not element reference). Without this, a
    // single real Sold card with two markers could show up TWICE in the returned list, causing
    // matchSoldCardForTitle in fas-remove.js to see 2 matches for what is actually one card and
    // wrongly treat it as ambiguous.
    const seen = new Set(); // normalized card text, deduped
    for (const btn of allRoleButtons) {
      const t = norm(btn.textContent);
      if (!t) continue;
      const isTrustedExact = t === 'mark as available' || t === 'relist this item';
      const isCheckoutMatch = isCheckoutOrderMarker(t);
      if (!isTrustedExact && !isCheckoutMatch) {
        if (looksOrderRelated(t)) {
          console.log('[FindA.Sale] allSoldListingCards: possible unmatched Checkout-sold marker -- element text: "' + t + '". If this is really a sold-via-Checkout card, add its exact phrasing to CHECKOUT_ORDER_MARKERS in fas-selectors.js.');
        }
        continue;
      }
      let el = btn, hops = 0;
      while (el && hops < 16) {
        el = el.parentElement;
        hops++;
        if (!el) break;
        const cardText = norm(el.textContent);
        if (cardText.indexOf('$') !== -1 && cardText.length > 40) {
          const cardStillActive = cardText.indexOf('mark as sold') !== -1;
          if (isTrustedExact || !cardStillActive) {
            seen.add(cardText);
          } else {
            console.log('[FindA.Sale] allSoldListingCards: matched a widened Checkout-sold marker ("' + t + '") but its card still shows "Mark as sold" -- excluded as a likely false-positive substring match. Review manually if this card really is sold.');
          }
          break;
        }
      }
    }
    return Array.from(seen).map((cardText) => ({ cardText }));
  }

  // Facebook's custom div[role="button"] controls (category chips, "Enter exact weight",
  // "Done", the "Change shipping method" modal's "Update" button, etc.) DO respond to
  // script-dispatched (isTrusted:false) events using the sequence below -- confirmed live
  // repeatedly, most recently 2026-07-18. The hover/focus preamble (pointerover/enter/move)
  // before pointerdown is what makes FB's handlers arm; a bare pointerdown->click without it
  // is silently ignored.
  //
  // CORRECTION (2026-07-18, supersedes the 2026-07-17 claim below): the Package-weight RADIO
  // buttons (role="radio", the 6 fixed weight-bucket options) are the ONE exception -- isolated
  // live testing (a single realClick, then polling aria-checked for 20+ seconds with nothing
  // else happening) proved they never register a synthetic click, regardless of event sequence
  // or timing. That is a genuine trusted-input (isTrusted:true) requirement on this specific
  // control, not a timing/sequence bug. chrome.debugger is NOT an acceptable fix (Chrome Web
  // Store readiness -- see ADR-084) -- the real fix is to avoid the radio entirely: Facebook's
  // own "Enter exact weight" link opens two plain text inputs (lb/oz) that DO accept synthetic
  // input via the standard React-controlled-input trick (native value setter + input/change
  // events -- see fas-content.js setNativeValue and fillDeliveryStep). See weightExactLink /
  // weightExactInputs below. Every other control on this page, including "Done" and "Update" in
  // this same modal, is NOT hardened like the radio and works fine with realClick.
  //
  // The reliably-working sequence, dispatched on the target element with correct viewport
  // coordinates, is:
  //   pointerover -> pointerenter -> pointermove -> pointerdown -> mousedown -> focus
  //   -> pointerup -> mouseup -> click
  // using PointerEvent for pointer* (pointerId:1, isPrimary:true, buttons:1 while pressed),
  // MouseEvent for mouse*/click, and FocusEvent for focus. No background service worker, no
  // CDP, no "is debugging this browser" banner -- a plain content script does it all.
  async function realClick(el) {
    // Scroll the target into view and let layout settle BEFORE reading coordinates, so the click
    // lands on the now-visible element instead of an off-screen/pre-scroll position -- confirmed
    // cause of category-chip misses when the chip sat below the fold (2026-07-17). Benefits every
    // realClick caller.
    try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) { /* non-fatal */ }
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));
    const rect = el.getBoundingClientRect();
    const cx = Math.round(rect.left + rect.width / 2);
    const cy = Math.round(rect.top + rect.height / 2);
    const base = { bubbles: true, cancelable: true, composed: true, button: 0, view: window, clientX: cx, clientY: cy };
    const pointer = (type, buttons) => new PointerEvent(type, Object.assign({}, base, { pointerId: 1, isPrimary: true, pointerType: 'mouse', buttons: buttons }));
    const mouse = (type, buttons) => new MouseEvent(type, Object.assign({}, base, { buttons: buttons }));
    // Hover/focus preamble (pointerover/enter/move) -> press (pointerdown/mousedown, buttons:1)
    // -> focus -> release (pointerup/mouseup) -> click. FB's controls need the preamble to arm.
    el.dispatchEvent(pointer('pointerover', 0));
    el.dispatchEvent(pointer('pointerenter', 0));
    el.dispatchEvent(pointer('pointermove', 0));
    el.dispatchEvent(pointer('pointerdown', 1));
    el.dispatchEvent(mouse('mousedown', 1));
    try { if (typeof el.focus === 'function') el.focus(); } catch (e) { /* non-fatal */ }
    el.dispatchEvent(new FocusEvent('focus', { bubbles: true, cancelable: true, composed: true, view: window }));
    el.dispatchEvent(pointer('pointerup', 0));
    el.dispatchEvent(mouse('mouseup', 0));
    el.dispatchEvent(mouse('click', 0));
  }

  // Delivery step (2026-07-16, DOM-verified live): FB's "Delivery method" combo, once opened,
  // lists "Shipping" and "Local pickup" as role="menuitemcheckbox" items -- both aria-checked=true
  // by default. They are NOT role="option" (so optionByText misses them) and NOT role="checkbox".
  // Match by leading text ("Shipping" row text is "ShippingBuyers pay for shipping...").
  function menuCheckboxByText(text) {
    const want = norm(text);
    const items = Array.from(document.querySelectorAll('[role="menuitemcheckbox"]'));
    return items.find((o) => norm(o.textContent) === want || norm(o.textContent).startsWith(want)) || null;
  }
  function isMenuChecked(el) { return !!(el && el.getAttribute('aria-checked') === 'true'); }

  // True when the [role="radio"]/input[type="radio"] inside a wrapper (as returned by
  // radioLabelByText, which returns the label/parentElement ANCESTOR of the actual radio, not
  // the radio itself) is checked. Confirms a click on FB's custom weight-bucket radio actually
  // registered as a selection -- a dispatched click can find+click an element without Facebook's
  // React component committing the change (2026-07-18 fix, see fas-content.js fillDeliveryStep).
  function isRadioChecked(wrapper) {
    if (!wrapper) return false;
    const radio = wrapper.querySelector('[role="radio"], input[type="radio"]');
    if (!radio) return false;
    return radio.getAttribute('aria-checked') === 'true' || radio.checked === true;
  }

  // True when a control is present but disabled -- covers native <button disabled>, the
  // `disabled` DOM property, and FB's custom div[role="button"] controls that signal
  // disabled via aria-disabled="true". Used to distinguish FB's negative-payout block on the
  // Delivery step (Next stays disabled when shipping cost exceeds the item price) from a
  // generic step-transition failure.
  function isDisabled(el) {
    if (!el) return false;
    if (el.getAttribute('aria-disabled') === 'true') return true;
    if (el.hasAttribute('disabled')) return true;
    if (el.disabled === true) return true;
    return false;
  }

  // FB's "Mark as sold" survey modal (DOM-verified live 2026-07-16) is a multi-step dialog:
  // header "Mark as sold", subtext "Did you sell this item? ...", then four choices --
  // "Yes, sold on Facebook" / "Yes, sold elsewhere" / "No, haven't sold" / "I'd rather not
  // answer" -- rendered as role="radio" rows, followed by a "Next" button that stays disabled
  // until one is picked. FB does not consistently expose these as role="option" or plain
  // <input type=radio>, so match by the option's visible text, SCOPED to the currently-open
  // [role="dialog"] so it never grabs a same-text control elsewhere on this button-dense page:
  // exact-trim on a role="radio" (or its label wrapper) first, then a role="radio" whose row
  // text contains the label, then any clickable row (div[role=button]/menuitemradio/label)
  // whose trimmed text equals the label. Returns the clickable element, or null if absent.
  function radioOptionByText(text) {
    const want = norm(text);
    const dialog = document.querySelector('[role="dialog"]');
    const scope = dialog || document;
    const radios = Array.from(scope.querySelectorAll('[role="radio"], input[type="radio"]'));
    const rowText = (r) => norm((r.closest('label') || r).textContent);
    const exact = radios.find((r) => rowText(r) === want);
    if (exact) return exact;
    const contains = radios.find((r) => rowText(r).indexOf(want) !== -1);
    if (contains) return contains;
    const rows = Array.from(scope.querySelectorAll('div[role="button"], [role="menuitemradio"], label'));
    return rows.find((n) => norm(n.textContent) === want) || null;
  }

  // Offer step (2026-07-16, ADR-084): FB's "Allow offers" control is a role="switch"
  // (aria-checked reflects on/off) sitting in a row whose descriptive text reads
  // "Let buyers negotiate a price equal to or above the minimum price you set". Match the
  // switch whose own/row/aria text contains the given fragment (pass a distinctive fragment
  // like "negotiate"); fall back to the first role="switch" on the step. Returns the switch
  // element or null when the Offer step has no such control (some listing types omit it).
  function switchByLabel(fragment) {
    const want = norm(fragment);
    const switches = Array.from(document.querySelectorAll('[role="switch"]'));
    for (const sw of switches) {
      const row = sw.closest('label') || sw.parentElement;
      const txt = norm((sw.getAttribute('aria-label') || '') + ' ' + ((row && row.textContent) || sw.textContent || ''));
      if (want && txt.includes(want)) return sw;
    }
    return switches[0] || null;
  }
  function isSwitchOn(el) { return !!(el && el.getAttribute('aria-checked') === 'true'); }

  window.__FAS_SEL__ = { norm, fieldByLabel, comboByLabel, optionByText, photoInput, chipsAfter, categoryChips, persistentCategoryChips, bestTextMatch,
    elementByText, radioLabelByText, listingCardByTitle, alreadySoldCardByTitle, allSoldListingCards, renewButtonByTitle, loadAllListingCards, realClick, menuCheckboxByText, isMenuChecked, isDisabled, radioOptionByText,
    switchByLabel, isSwitchOn, isRadioChecked, weightExactLink, weightExactInputs,
    LABELS: { title: 'Title', price: 'Price', description: 'Description', condition: 'Condition', category: 'Category', offerToggle: 'negotiate', offerMinimum: 'Minimum price' } };
})();
