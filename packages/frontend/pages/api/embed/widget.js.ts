import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * GET /api/embed/widget.js
 * Serves the embeddable FindA.Sale inventory widget as vanilla JavaScript.
 * Cache: 1 hour (CDN-friendly).
 * No React, no npm packages — pure vanilla JS.
 *
 * Features:
 *   - Category filter tabs (auto-discovered from inventory)
 *   - Load More pagination with offset
 *   - Item count display ("Showing X of Y items")
 *   - "View all on FindA.Sale" storefront link
 *   - Light / dark theme via data-theme attribute
 *   - Skeleton loading state
 */
export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '') || 'https://finda.sale';

  const widgetJs = `
(function () {
  'use strict';

  var BACKEND = '${backendUrl}';
  var CSS_INJECTED = false;

  // ── CSS ─────────────────────────────────────────────────────────────────────

  var BASE_CSS = [
    /* Reset + base */
    '.fns-widget{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-sizing:border-box;width:100%}',
    '.fns-widget *,.fns-widget *::before,.fns-widget *::after{box-sizing:inherit}',
    /* Category tabs */
    '.fns-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}',
    '.fns-tab{padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid #e5e7eb;background:#fff;color:#6b7280;transition:all 0.15s;white-space:nowrap}',
    '.fns-tab:hover{border-color:#f59e0b;color:#d97706}',
    '.fns-tab--active{background:#f59e0b;border-color:#f59e0b;color:#fff}',
    /* Meta bar */
    '.fns-meta{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px}',
    '.fns-count{font-size:12px;color:#9ca3af}',
    '.fns-view-all{font-size:12px;font-weight:600;color:#f59e0b;text-decoration:none}',
    '.fns-view-all:hover{text-decoration:underline}',
    /* Grid */
    '.fns-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:16px}',
    /* Card */
    '.fns-card{border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;background:#fff;display:flex;flex-direction:column;transition:box-shadow 0.2s,transform 0.2s;text-decoration:none;color:inherit}',
    '.fns-card:hover{box-shadow:0 8px 24px rgba(0,0,0,0.1);transform:translateY(-2px)}',
    '.fns-card-img-wrap{position:relative;width:100%;padding-top:100%;overflow:hidden;background:#f3f4f6}',
    '.fns-card-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform 0.3s}',
    '.fns-card:hover .fns-card-img{transform:scale(1.04)}',
    '.fns-card-img-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#d1d5db;font-size:13px}',
    '.fns-card-body{padding:10px 12px;flex:1;display:flex;flex-direction:column;gap:5px}',
    '.fns-card-title{font-size:13px;font-weight:600;color:#111827;line-height:1.35;margin:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
    '.fns-card-price{font-size:15px;font-weight:700;color:#059669;margin:0}',
    '.fns-card-price--free{color:#6b7280}',
    '.fns-card-price--offer{color:#9ca3af}',
    '.fns-badge{display:inline-block;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;text-transform:uppercase;letter-spacing:0.04em}',
    '.fns-badge--new{background:#dcfce7;color:#166534}',
    '.fns-badge--used{background:#fef9c3;color:#854d0e}',
    '.fns-badge--refurb{background:#dbeafe;color:#1e40af}',
    '.fns-badge--parts{background:#f3f4f6;color:#6b7280}',
    '.fns-card-cta{display:block;text-align:center;text-decoration:none;font-size:12px;font-weight:700;padding:7px 10px;margin:8px 12px 12px;border-radius:6px;background:#f59e0b;color:#fff;transition:background 0.15s;letter-spacing:0.01em}',
    '.fns-card-cta:hover{background:#d97706}',
    /* Skeleton */
    '.fns-skeleton{border-radius:10px;background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%);background-size:200% 100%;animation:fns-shimmer 1.4s infinite}',
    '@keyframes fns-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}',
    '.fns-skeleton-card{border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;background:#fff}',
    '.fns-skeleton-img{width:100%;padding-top:100%;background:linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%);background-size:200% 100%;animation:fns-shimmer 1.4s infinite}',
    '.fns-skeleton-body{padding:10px 12px;display:flex;flex-direction:column;gap:8px}',
    '.fns-skeleton-line{height:12px;border-radius:4px;background:linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%);background-size:200% 100%;animation:fns-shimmer 1.4s infinite}',
    '.fns-skeleton-line--short{width:50%}',
    /* Load More */
    '.fns-load-more-wrap{text-align:center;padding:20px 0 8px}',
    '.fns-load-more{display:inline-block;padding:10px 28px;border-radius:8px;border:2px solid #f59e0b;background:#fff;color:#d97706;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.15s;letter-spacing:0.01em}',
    '.fns-load-more:hover{background:#f59e0b;color:#fff}',
    '.fns-load-more:disabled{opacity:0.5;cursor:default}',
    /* Empty / error */
    '.fns-empty{padding:40px 16px;text-align:center;border:2px dashed #e5e7eb;border-radius:10px;color:#9ca3af;font-size:14px}',
    '.fns-error{padding:20px;text-align:center;color:#ef4444;font-size:13px}',
    /* Footer */
    '.fns-footer{text-align:center;padding:16px 0 4px;font-size:11px;color:#c4c4c4}',
    '.fns-footer a{color:#c4c4c4;text-decoration:none}',
    '.fns-footer a:hover{color:#9ca3af}'
  ].join('');

  var DARK_CSS = [
    '.fns-widget--dark{background:#111827;color:#f9fafb}',
    '.fns-widget--dark .fns-tab{background:#1f2937;border-color:#374151;color:#9ca3af}',
    '.fns-widget--dark .fns-tab:hover{border-color:#f59e0b;color:#fcd34d}',
    '.fns-widget--dark .fns-tab--active{background:#f59e0b;border-color:#f59e0b;color:#fff}',
    '.fns-widget--dark .fns-count{color:#6b7280}',
    '.fns-widget--dark .fns-card{border-color:#374151;background:#1f2937}',
    '.fns-widget--dark .fns-card:hover{box-shadow:0 8px 24px rgba(0,0,0,0.5)}',
    '.fns-widget--dark .fns-card-img-placeholder{color:#4b5563}',
    '.fns-widget--dark .fns-card-img-wrap{background:#374151}',
    '.fns-widget--dark .fns-card-title{color:#f9fafb}',
    '.fns-widget--dark .fns-card-price{color:#34d399}',
    '.fns-widget--dark .fns-badge--new{background:#064e3b;color:#6ee7b7}',
    '.fns-widget--dark .fns-badge--used{background:#451a03;color:#fcd34d}',
    '.fns-widget--dark .fns-skeleton-card{border-color:#374151;background:#1f2937}',
    '.fns-widget--dark .fns-skeleton-img,.fns-widget--dark .fns-skeleton-line{background:linear-gradient(90deg,#1f2937 25%,#374151 50%,#1f2937 75%);background-size:200% 100%}',
    '.fns-widget--dark .fns-load-more{background:#1f2937;border-color:#f59e0b;color:#fcd34d}',
    '.fns-widget--dark .fns-load-more:hover{background:#f59e0b;color:#fff}',
    '.fns-widget--dark .fns-empty{border-color:#374151;color:#6b7280}',
    '.fns-widget--dark .fns-footer a{color:#4b5563}',
    '.fns-widget--dark .fns-footer a:hover{color:#6b7280}'
  ].join('');

  function injectCSS() {
    if (CSS_INJECTED) return;
    CSS_INJECTED = true;
    var style = document.createElement('style');
    style.setAttribute('data-fns-widget', '1');
    style.textContent = BASE_CSS + DARK_CSS;
    document.head.appendChild(style);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatPrice(price) {
    if (price == null) return null; // handled as "Make offer"
    if (price === 0) return 'Free';
    return '$' + parseFloat(price).toFixed(2);
  }

  function conditionBadge(condition) {
    if (!condition) return '';
    var map = {
      NEW: ['new', 'New'],
      USED: ['used', 'Used'],
      USED_EXCELLENT: ['used', 'Used'],
      USED_GOOD: ['used', 'Used'],
      REFURBISHED: ['refurb', 'Refurb'],
      PARTS_OR_REPAIR: ['parts', 'Parts']
    };
    var entry = map[condition];
    if (!entry) return '';
    return '<span class="fns-badge fns-badge--' + entry[0] + '">' + entry[1] + '</span>';
  }

  function buildUrl(organizer, limit, offset, category) {
    var url = BACKEND + '/api/widget/inventory?organizer=' + encodeURIComponent(organizer)
      + '&limit=' + encodeURIComponent(limit)
      + '&offset=' + encodeURIComponent(offset || 0);
    if (category) url += '&category=' + encodeURIComponent(category);
    return url;
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  function renderSkeletons(count) {
    var html = '';
    for (var i = 0; i < count; i++) {
      html += '<div class="fns-skeleton-card">'
        + '<div class="fns-skeleton-img"></div>'
        + '<div class="fns-skeleton-body">'
        + '<div class="fns-skeleton-line"></div>'
        + '<div class="fns-skeleton-line fns-skeleton-line--short"></div>'
        + '</div>'
        + '</div>';
    }
    return html;
  }

  function renderCard(item) {
    var imgHtml;
    if (item.photoUrl) {
      imgHtml = '<div class="fns-card-img-wrap"><img class="fns-card-img" src="'
        + escHtml(item.photoUrl) + '" alt="' + escHtml(item.title) + '" loading="lazy"></div>';
    } else {
      imgHtml = '<div class="fns-card-img-wrap"><div class="fns-card-img-placeholder">No photo</div></div>';
    }

    var priceStr = formatPrice(item.price);
    var priceClass = 'fns-card-price';
    var priceDisplay;
    if (priceStr === null) {
      priceClass += ' fns-card-price--offer';
      priceDisplay = 'Make offer';
    } else if (priceStr === 'Free') {
      priceClass += ' fns-card-price--free';
      priceDisplay = 'Free';
    } else {
      priceDisplay = priceStr;
    }

    var badge = conditionBadge(item.condition);

    return '<a class="fns-card" href="' + escHtml(item.detailUrl) + '" target="_blank" rel="noopener noreferrer">'
      + imgHtml
      + '<div class="fns-card-body">'
      + '<p class="fns-card-title">' + escHtml(item.title) + '</p>'
      + '<p class="' + priceClass + '">' + priceDisplay + '</p>'
      + (badge ? badge : '')
      + '</div>'
      + '<span class="fns-card-cta">View Item →</span>'
      + '</a>';
  }

  function renderCategoryTabs(categories, activeCategory, onTabClick) {
    if (!categories || categories.length < 2) return '';
    var tabs = '<div class="fns-tabs">';
    tabs += '<button class="fns-tab' + (!activeCategory ? ' fns-tab--active' : '') + '" data-cat="">All</button>';
    for (var i = 0; i < categories.length; i++) {
      var cat = categories[i];
      // Shorten long eBay-style categories (take last segment after ':')
      var label = cat.indexOf(':') !== -1 ? cat.split(':').pop().trim() : cat;
      if (label.length > 22) label = label.substring(0, 20) + '…';
      tabs += '<button class="fns-tab' + (activeCategory === cat ? ' fns-tab--active' : '')
        + '" data-cat="' + escHtml(cat) + '">' + escHtml(label) + '</button>';
    }
    tabs += '</div>';
    return tabs;
  }

  // ── Widget state per container ────────────────────────────────────────────────

  function WidgetInstance(container) {
    this.container = container;
    this.organizer = container.getAttribute('data-organizer');
    this.limit = parseInt(container.getAttribute('data-limit') || '12', 10) || 12;
    this.theme = container.getAttribute('data-theme') || 'light';
    this.themeClass = this.theme === 'dark' ? ' fns-widget--dark' : '';
    this.offset = 0;
    this.activeCategory = container.getAttribute('data-category') || '';
    this.totalCount = 0;
    this.categories = [];
    this.gridEl = null;
    this.loadMoreEl = null;
    this.countEl = null;
    this.loading = false;
  }

  WidgetInstance.prototype.getWrapper = function () {
    return this.container.querySelector('.fns-widget');
  };

  WidgetInstance.prototype.updateCount = function () {
    if (!this.countEl) return;
    var showing = Math.min(this.offset + this.limit, this.totalCount);
    // offset here represents items already shown, so actual shown = min(offset, totalCount)
    var shown = Math.min(this.offset, this.totalCount);
    this.countEl.textContent = shown + ' of ' + this.totalCount + ' items';
  };

  WidgetInstance.prototype.appendCards = function (items) {
    if (!this.gridEl) return;
    for (var i = 0; i < items.length; i++) {
      var div = document.createElement('div');
      div.innerHTML = renderCard(items[i]);
      var card = div.firstChild;
      this.gridEl.appendChild(card);
    }
  };

  WidgetInstance.prototype.fetch = function (isLoadMore) {
    var self = this;
    if (self.loading) return;
    self.loading = true;

    // Show skeleton on initial load
    if (!isLoadMore && self.gridEl) {
      self.gridEl.innerHTML = renderSkeletons(self.limit);
    }
    // Disable load more during fetch
    if (self.loadMoreEl) {
      self.loadMoreEl.disabled = true;
      self.loadMoreEl.textContent = 'Loading…';
    }

    var url = buildUrl(self.organizer, self.limit, self.offset, self.activeCategory);

    fetch(url)
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (data) {
        self.loading = false;
        self.totalCount = data.totalCount || 0;
        if (!isLoadMore) {
          // Update "View all" href to use canonical organizer ID from API
          var viewAllEl = self.container.querySelector('.fns-view-all');
          if (viewAllEl && data.organizer && data.organizer.id) {
            viewAllEl.href = 'https://finda.sale/organizers/' + encodeURIComponent(data.organizer.id);
          }
          if (data.categories && data.categories.length > 0) {
            self.categories = data.categories;
            self.renderTabs();
          }
        }
        self.offset += data.items.length;

        if (isLoadMore) {
          self.appendCards(data.items);
        } else {
          // Replace skeleton with real cards
          self.gridEl.innerHTML = '';
          self.appendCards(data.items);
          // Show empty state if no items
          if (data.items.length === 0) {
            self.gridEl.innerHTML = '<div class="fns-empty">No items in this category right now.</div>';
          }
        }

        // Update count
        if (self.countEl) {
          self.countEl.textContent = self.offset + ' of ' + self.totalCount + ' items';
        }

        // Update Load More button
        if (self.loadMoreEl) {
          if (data.hasMore) {
            self.loadMoreEl.disabled = false;
            self.loadMoreEl.textContent = 'Load More';
          } else {
            self.loadMoreEl.parentNode.style.display = 'none';
          }
        }
      })
      .catch(function () {
        self.loading = false;
        if (!isLoadMore && self.gridEl) {
          self.gridEl.innerHTML = '<div class="fns-error">Could not load inventory. Please try again later.</div>';
        }
        if (self.loadMoreEl) {
          self.loadMoreEl.disabled = false;
          self.loadMoreEl.textContent = 'Try Again';
        }
      });
  };

  WidgetInstance.prototype.renderTabs = function () {
    var tabsEl = this.container.querySelector('.fns-tabs');
    if (!tabsEl) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = renderCategoryTabs(this.categories, this.activeCategory, null);
    var newTabs = tmp.firstChild;
    if (newTabs) tabsEl.parentNode.replaceChild(newTabs, tabsEl);
    this.bindTabs();
  };

  WidgetInstance.prototype.bindTabs = function () {
    var self = this;
    var tabs = self.container.querySelectorAll('.fns-tab');
    for (var i = 0; i < tabs.length; i++) {
      (function (tab) {
        tab.addEventListener('click', function () {
          var cat = tab.getAttribute('data-cat');
          if (cat === self.activeCategory) return;
          self.activeCategory = cat;
          self.offset = 0;
          // Update active state
          var allTabs = self.container.querySelectorAll('.fns-tab');
          for (var j = 0; j < allTabs.length; j++) {
            allTabs[j].classList.toggle('fns-tab--active', allTabs[j].getAttribute('data-cat') === cat);
          }
          // Show load more again
          if (self.loadMoreEl && self.loadMoreEl.parentNode) {
            self.loadMoreEl.parentNode.style.display = '';
          }
          self.fetch(false);
        });
      })(tabs[i]);
    }
  };

  WidgetInstance.prototype.init = function () {
    var self = this;
    if (!self.organizer) {
      self.container.innerHTML = '<div class="fns-widget"><div class="fns-error">Widget error: data-organizer is required.</div></div>';
      return;
    }

    // Build initial shell
    var storefrontUrl = 'https://finda.sale/organizers/' + encodeURIComponent(self.organizer);
    var skeletons = renderSkeletons(self.limit);

    self.container.innerHTML = '<div class="fns-widget' + self.themeClass + '">'
      + '<div class="fns-tabs"></div>'
      + '<div class="fns-meta">'
      + '  <span class="fns-count">Loading…</span>'
      + '  <a class="fns-view-all" href="' + storefrontUrl + '" target="_blank" rel="noopener">View all on FindA.Sale →</a>'
      + '</div>'
      + '<div class="fns-grid">' + skeletons + '</div>'
      + '<div class="fns-load-more-wrap"><button class="fns-load-more" disabled>Load More</button></div>'
      + '<div class="fns-footer"><a href="https://finda.sale" target="_blank" rel="noopener">Powered by FindA.Sale</a></div>'
      + '</div>';

    self.gridEl = self.container.querySelector('.fns-grid');
    self.loadMoreEl = self.container.querySelector('.fns-load-more');
    self.countEl = self.container.querySelector('.fns-count');

    // Bind Load More
    self.loadMoreEl.addEventListener('click', function () {
      self.fetch(true);
    });

    // Bind tabs (initially empty — populated after first fetch)
    self.bindTabs();

    // Initial fetch
    self.fetch(false);
  };

  // ── Bootstrap ────────────────────────────────────────────────────────────────

  function init() {
    injectCSS();
    var els = document.querySelectorAll('[data-findasale-widget]');
    for (var i = 0; i < els.length; i++) {
      new WidgetInstance(els[i]).init();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`.trim();

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).send(widgetJs);
}
