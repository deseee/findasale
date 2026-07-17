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

  // "Your listings" page (marketplace/you/selling) -- confirmed live 2026-07-15: each listing
  // card exposes a direct "Mark as sold" clickable (not behind a menu), 4 DOM levels above a
  // shared ancestor whose text contains the title + price + "$". No Facebook-assigned listing
  // ID is available to match against (the extension never captures one at publish time -- see
  // ADR-084 amendment "Flagged, not fixed" note) so cards are matched by title text instead.
  // Deliberately does NOT use bestTextMatch's word-overlap fallback here -- an ambiguous match
  // risks marking the WRONG live listing as sold, a materially worse failure than picking
  // Facebook's second-best category suggestion, so this only returns a card on an exact or
  // clean-substring title match, and returns null (caller must skip + flag) otherwise.
  function listingCardByTitle(title) {
    const want = norm(title);
    if (!want) return null;
    const soldButtons = Array.from(document.querySelectorAll('div[role="button"], button, span[role="button"], a[role="button"]'))
      .filter((b) => norm(b.textContent) === 'mark as sold');
    const candidates = [];
    for (const btn of soldButtons) {
      let el = btn, hops = 0, cardText = null, cardEl = null;
      while (el && hops < 8) {
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

  // Facebook's custom radio/button components (the Package-weight radio and the "Change
  // shipping method" modal's "Update" button) DO respond to script-dispatched
  // (isTrusted:false) events -- PROVEN LIVE 2026-07-17 on facebook.com/marketplace/create.
  // The earlier belief that these controls required trusted (CDP / DevTools-driven) input was
  // wrong: FB's handlers do NOT check isTrusted. The old synthetic fallback simply fired too
  // few events -- it jumped straight to pointerdown without the hover/focus preamble FB's
  // handlers wait for. The reliably-working sequence, dispatched on the target element with
  // correct viewport coordinates, is:
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
    elementByText, radioLabelByText, listingCardByTitle, realClick, menuCheckboxByText, isMenuChecked, isDisabled, radioOptionByText,
    switchByLabel, isSwitchOn,
    LABELS: { title: 'Title', price: 'Price', description: 'Description', condition: 'Condition', category: 'Category', offerToggle: 'negotiate', offerMinimum: 'Minimum price' } };
})();
