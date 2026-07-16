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
    await openFn(); // realClick() is now async (routes through chrome.debugger) -- await it before diffing
    await new Promise((r) => setTimeout(r, settleMs));
    return Array.from(document.querySelectorAll('div[role="button"]')).filter(
      (b) => !before.has(b) && norm(b.textContent)
    );
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

  window.__FAS_SEL__ = { norm, fieldByLabel, comboByLabel, optionByText, photoInput, chipsAfter, bestTextMatch,
    elementByText, radioLabelByText,
    LABELS: { title: 'Title', price: 'Price', description: 'Description', condition: 'Condition', category: 'Category' } };
})();
