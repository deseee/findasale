import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * GET /api/embed/widget.js
 * Serves the embeddable FindA.Sale inventory widget as vanilla JavaScript.
 * Cache: 1 hour (CDN-friendly).
 * No React, no npm packages — pure vanilla JS under 12KB.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '') || 'https://finda.sale';

  const widgetJs = `
(function () {
  'use strict';

  var BACKEND = '${backendUrl}';
  var CSS_INJECTED = false;

  var LIGHT_CSS = [
    '.fns-widget { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; box-sizing: border-box; }',
    '.fns-widget *, .fns-widget *::before, .fns-widget *::after { box-sizing: inherit; }',
    '.fns-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; padding: 16px 0; }',
    '.fns-card { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: #fff; display: flex; flex-direction: column; }',
    '.fns-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }',
    '.fns-card-img { width: 100%; aspect-ratio: 1; object-fit: cover; background: #f3f4f6; display: block; }',
    '.fns-card-img-placeholder { width: 100%; aspect-ratio: 1; background: #f3f4f6; display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 13px; }',
    '.fns-card-body { padding: 10px 12px; flex: 1; display: flex; flex-direction: column; gap: 4px; }',
    '.fns-card-title { font-size: 13px; font-weight: 600; color: #111827; line-height: 1.3; margin: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }',
    '.fns-card-price { font-size: 15px; font-weight: 700; color: #059669; margin: 0; }',
    '.fns-card-price-free { color: #6b7280; }',
    '.fns-badge { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: #f3f4f6; color: #374151; text-transform: uppercase; letter-spacing: 0.03em; }',
    '.fns-badge-new { background: #dcfce7; color: #166534; }',
    '.fns-badge-used { background: #fef9c3; color: #854d0e; }',
    '.fns-card-footer { padding: 8px 12px 12px; }',
    '.fns-btn { display: block; text-align: center; text-decoration: none; font-size: 13px; font-weight: 600; padding: 7px 12px; border-radius: 6px; background: #f59e0b; color: #fff; transition: background 0.15s; }',
    '.fns-btn:hover { background: #d97706; }',
    '.fns-empty { padding: 32px 16px; text-align: center; border: 2px dashed #e5e7eb; border-radius: 8px; color: #6b7280; font-size: 14px; }',
    '.fns-error { padding: 16px; text-align: center; color: #ef4444; font-size: 13px; }',
    '.fns-footer { text-align: center; padding: 12px 0 4px; font-size: 11px; color: #9ca3af; }',
    '.fns-footer a { color: #9ca3af; text-decoration: none; }',
    '.fns-footer a:hover { text-decoration: underline; }',
    '.fns-loading { padding: 32px; text-align: center; color: #9ca3af; font-size: 13px; }'
  ].join(' ');

  var DARK_CSS = [
    '.fns-widget--dark { background: #111827; color: #f9fafb; }',
    '.fns-widget--dark .fns-card { border-color: #374151; background: #1f2937; }',
    '.fns-widget--dark .fns-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.4); }',
    '.fns-widget--dark .fns-card-img-placeholder { background: #374151; color: #6b7280; }',
    '.fns-widget--dark .fns-card-title { color: #f9fafb; }',
    '.fns-widget--dark .fns-card-price { color: #34d399; }',
    '.fns-widget--dark .fns-badge { background: #374151; color: #d1d5db; }',
    '.fns-widget--dark .fns-badge-new { background: #064e3b; color: #6ee7b7; }',
    '.fns-widget--dark .fns-badge-used { background: #451a03; color: #fcd34d; }',
    '.fns-widget--dark .fns-empty { border-color: #374151; color: #6b7280; }',
    '.fns-widget--dark .fns-footer { color: #6b7280; }',
    '.fns-widget--dark .fns-footer a { color: #6b7280; }'
  ].join(' ');

  function injectCSS() {
    if (CSS_INJECTED) return;
    CSS_INJECTED = true;
    var style = document.createElement('style');
    style.setAttribute('data-fns-widget', '1');
    style.textContent = LIGHT_CSS + ' ' + DARK_CSS;
    document.head.appendChild(style);
  }

  function formatPrice(price) {
    if (price == null) return 'Make offer';
    if (price === 0) return 'Free';
    return '$' + parseFloat(price).toFixed(2);
  }

  function conditionBadge(condition) {
    if (!condition) return '';
    var cls = 'fns-badge';
    var label = condition;
    if (condition === 'NEW') { cls += ' fns-badge-new'; label = 'New'; }
    else if (condition === 'USED' || condition === 'USED_EXCELLENT' || condition === 'USED_GOOD') { cls += ' fns-badge-used'; label = 'Used'; }
    else if (condition === 'REFURBISHED') { label = 'Refurb'; }
    else if (condition === 'PARTS_OR_REPAIR') { label = 'Parts'; }
    return '<span class="' + cls + '">' + escHtml(label) + '</span>';
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderCard(item) {
    var imgHtml = item.photoUrl
      ? '<img class="fns-card-img" src="' + escHtml(item.photoUrl) + '" alt="' + escHtml(item.title) + '" loading="lazy">'
      : '<div class="fns-card-img-placeholder">No photo</div>';

    var price = formatPrice(item.price);
    var priceClass = 'fns-card-price' + (item.price === 0 ? ' fns-card-price-free' : '');
    var badge = conditionBadge(item.condition);

    return '<div class="fns-card">'
      + imgHtml
      + '<div class="fns-card-body">'
      + '<p class="fns-card-title">' + escHtml(item.title) + '</p>'
      + '<p class="' + priceClass + '">' + price + '</p>'
      + (badge ? badge : '')
      + '</div>'
      + '<div class="fns-card-footer">'
      + '<a class="fns-btn" href="' + escHtml(item.detailUrl) + '" target="_blank" rel="noopener">View Item</a>'
      + '</div>'
      + '</div>';
  }

  function renderWidget(container, data) {
    var theme = container.getAttribute('data-theme') || 'light';
    var themeClass = theme === 'dark' ? ' fns-widget--dark' : '';

    var inner = '';
    if (!data || !data.items || data.items.length === 0) {
      inner = '<div class="fns-empty">No items available right now.</div>';
    } else {
      var cards = data.items.map(renderCard).join('');
      inner = '<div class="fns-grid">' + cards + '</div>';
    }

    var poweredBy = '<div class="fns-footer"><a href="https://finda.sale" target="_blank" rel="noopener">Powered by FindA.Sale</a></div>';

    container.innerHTML = '<div class="fns-widget' + themeClass + '">' + inner + poweredBy + '</div>';
  }

  function loadWidget(container) {
    var organizer = container.getAttribute('data-organizer');
    var limit = container.getAttribute('data-limit') || '12';
    var category = container.getAttribute('data-category') || '';

    if (!organizer) {
      container.innerHTML = '<div class="fns-widget"><div class="fns-error">Widget error: data-organizer is required.</div></div>';
      return;
    }

    container.innerHTML = '<div class="fns-widget"><div class="fns-loading">Loading inventory…</div></div>';

    var url = BACKEND + '/api/widget/inventory?organizer=' + encodeURIComponent(organizer) + '&limit=' + encodeURIComponent(limit);
    if (category) url += '&category=' + encodeURIComponent(category);

    fetch(url)
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (data) {
        renderWidget(container, data);
      })
      .catch(function () {
        container.innerHTML = '<div class="fns-widget"><div class="fns-error">Could not load inventory. Please try again later.</div></div>';
      });
  }

  function init() {
    injectCSS();
    var widgets = document.querySelectorAll('[data-findasale-widget]');
    for (var i = 0; i < widgets.length; i++) {
      loadWidget(widgets[i]);
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
