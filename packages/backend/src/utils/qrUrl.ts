/**
 * QR destination URL builder.
 *
 * The item page and sale page only treat a visit as QR-originated (item QR scan prompt, sale QR scan
 * tracking) when utm_source starts with "qr". Printed item labels used to carry a bare /items/:id URL,
 * so scanning them never showed the prompt. Every printed QR that points at a public page goes through
 * this builder so the source is always stamped, and stamped safely (encoded path segment, existing
 * query string preserved, no duplicated utm_source).
 */

/** utm_source for item QR codes on single-item labels, sale label sheets and the label composer. */
export const QR_SOURCE_ITEM_LABEL = 'qr_item_label';

/** utm_source for item QR codes on print-kit sticker sheets and hang tags. */
export const QR_SOURCE_KIT = 'qr_kit';

/**
 * Append utm_source to `baseUrl + path`. `path` must start with "/". Uses "?" or "&" depending on
 * whether the URL already has a query string, and replaces (never duplicates) an existing utm_source.
 */
export function buildQrUrl(baseUrl: string, path: string, utmSource: string): string {
  const raw = baseUrl.replace(/\/+$/, '') + path;
  try {
    const url = new URL(raw);
    url.searchParams.set('utm_source', utmSource);
    return url.toString();
  } catch {
    // baseUrl was not an absolute URL (misconfigured FRONTEND_URL): still produce a well-formed suffix.
    const withoutHash = raw.split('#')[0];
    const cleaned = withoutHash.replace(/([?&])utm_source=[^&]*&?/g, '$1').replace(/[?&]$/, '');
    return `${cleaned}${cleaned.includes('?') ? '&' : '?'}utm_source=${encodeURIComponent(utmSource)}`;
  }
}

/** Public item page URL for a printed item QR code, stamped with utm_source. */
export function buildItemQrUrl(baseUrl: string, itemId: string, utmSource: string): string {
  return buildQrUrl(baseUrl, `/items/${encodeURIComponent(itemId)}`, utmSource);
}
