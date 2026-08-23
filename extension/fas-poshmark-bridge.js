/* FindA.Sale — MAIN-world bridge for poshmark.com (listing-creation flow).
 * BUG FIX 2026-08-22 (S-EXT-POSHMARK-ISOLATED-WORLD, P0, live-Chrome-confirmed): Chrome content
 * scripts declared without a "world" key in manifest.json run in an ISOLATED JS world -- they
 * share the real DOM with the page, but NOT custom JS properties/objects the page's own scripts
 * attach to DOM elements. Poshmark's own Vue 2 runtime attaches `el.__vue__ = componentInstance`
 * from the page's own (MAIN world) JS context. `fas-poshmark.js` (the isolated-world content
 * script that actually fills the listing form and needs `chrome.runtime`/`chrome.storage` access)
 * can never see that property directly -- confirmed live via a diagnostic log added to that file
 * and captured from Patrick's real browser console: `opener.__vue__ typeof= undefined`.
 *
 * This file is declared in manifest.json with "world": "MAIN" on the same Poshmark match pattern,
 * so it runs in the SAME JS context as Poshmark's own Vue instances and CAN see `__vue__`. It has
 * NO access to any chrome.* extension API (that's unavailable to MAIN-world content scripts) --
 * its only job is DOM/Vue introspection, relayed back to the isolated-world script via a
 * CustomEvent request/response pair on `window`.
 *
 * BUG FIX 2026-08-22 ROUND 2 (S-EXT-POSHMARK-BRIDGE-ELEMENT-PASSING, P0, live-Chrome-confirmed via
 * diagnostic listeners installed directly on Patrick's real tab): this file originally claimed DOM
 * element references cross the isolated/MAIN boundary fine in a CustomEvent detail -- that was
 * WRONG. Confirmed live: a request with an empty payload round-tripped perfectly, while every
 * request that put a live DOM element in `payload.el` arrived here with `event.detail === null`
 * (the whole detail silently dropped, not just the element). Fix: requests never carry a DOM
 * element anymore -- the isolated-world side stamps the target element with a temporary
 * `data-fas-bridge-marker` attribute (plain DOM state, genuinely shared across worlds, unlike a JS
 * object reference) and sends only that marker STRING as `payload.elMarker`. `resolveEl()` below
 * re-finds the exact same live element via `document.querySelector` on that marker.
 *
 * Every action here is a verbatim port of logic that already existed directly inline in
 * fas-poshmark.js before this fix -- nothing new is being invented, this only moves the __vue__
 * touch-points into the JS world where they can actually see what they're touching.
 */
(function () {
  function findCatalogVm() {
    const all = document.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) {
      const vm = all[i].__vue__;
      if (vm && vm.$options && vm.$options.name === 'ListingEditorCatalog') return vm;
    }
    return null;
  }

  // BUG FIX 2026-08-22 ROUND 2 -- see file header. Re-finds the real element from a marker
  // attribute the isolated-world side stamped onto it, instead of receiving the element itself
  // (which does not survive the cross-world CustomEvent, confirmed live).
  function resolveEl(payload) {
    return (payload && payload.elMarker) ? document.querySelector('[data-fas-bridge-marker="' + payload.elMarker + '"]') : null;
  }

  function handleAction(action, payload) {
    if (action === 'openDropdown') {
      const el = resolveEl(payload);
      if (!el) return { opened: false, reason: 'no-element' };
      const vm = el.__vue__;
      if (vm && typeof vm.isExpaned !== 'undefined') {
        vm.isExpaned = true;
        return { opened: true, method: 'vue' };
      }
      try { el.click(); } catch (e) { /* ignore -- caller has its own realClick fallback */ }
      return { opened: false, method: 'no-vue-instance' };
    }
    if (action === 'closeDropdown') {
      const el = resolveEl(payload);
      if (!el) return { closed: false, reason: 'no-element' };
      const vm = el.__vue__;
      if (vm && typeof vm.isExpaned !== 'undefined') {
        vm.isExpaned = false;
        return { closed: true, method: 'vue' };
      }
      return { closed: false, method: 'no-vue-instance' };
    }
    if (action === 'getCatalogCommitState') {
      const vm = findCatalogVm();
      const committed = !!(vm && (vm.selectedDepartment || vm.selectedGroup || vm.lastSelectedCategoryData));
      return { committed: committed, catalogFound: !!vm };
    }
    if (action === 'closeVisibleModal') {
      let el = resolveEl(payload);
      for (let i = 0; i < 8 && el; i++) {
        const vm = el.__vue__;
        if (vm && vm.$options && vm.$options.name === 'Modal' && typeof vm.closeModal === 'function') {
          try {
            vm.closeModal();
            return { closed: true };
          } catch (e) {
            return { closed: false, error: String(e && e.message) };
          }
        }
        el = el.parentElement;
      }
      return { closed: false, reason: 'no-modal-vue-found' };
    }
    return { error: 'unknown-action: ' + action };
  }

  window.addEventListener('fas-poshmark-vue-request', function (evt) {
    const detail = (evt && evt.detail) || {};
    let result;
    try {
      result = handleAction(detail.action, detail.payload);
    } catch (err) {
      result = { error: String(err && err.message) };
    }
    window.dispatchEvent(new CustomEvent('fas-poshmark-vue-response', {
      detail: { requestId: detail.requestId, result: result }
    }));
  });
})();
