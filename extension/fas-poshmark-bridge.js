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
 * CustomEvent request/response pair on `window`. DOM CustomEvent `detail` payloads and DOM element
 * references both cross the isolated/MAIN world boundary fine (they're the same underlying DOM
 * objects, just exposed through different per-world wrappers) -- only non-DOM JS objects like a
 * Vue component instance do not, which is why every request below passes a DOM element in
 * `payload.el` and only ever returns plain data (booleans/strings), never a Vue instance.
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

  function handleAction(action, payload) {
    if (action === 'openDropdown') {
      const el = payload && payload.el;
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
      const el = payload && payload.el;
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
      let el = payload && payload.el;
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
