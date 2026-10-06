/**
 * posTagUrl (2026-10-06): one parser for the price-tag QR / URL the POS register accepts, used by BOTH the URL-param
 * effect (a phone camera opened https://finda.sale/pos/<saleId>?action=add-misc&... and was redirected here) and the
 * in-app camera handler (which gets the full QR text).
 *
 * Accepts a bare query string ("?action=add-misc&price=5.00"), a path plus query, or a full URL. Returns null unless the
 * input is an add-misc tag with a usable price.
 *
 * A consignor tag carries all three of c (consignor id), n (nonce) and s (signature). A tag with only SOME of them is
 * reported as `incompleteTag` so the register can refuse it instead of silently ringing it up as a plain misc line and
 * losing the consignor credit. Nothing here is trusted: the server re-verifies the signature before a line is added.
 */
export interface ParsedPosTag {
  /** Dollar price from the QR, as printed (for the plain misc path). */
  price: number;
  /** Price in whole cents, the unit the signature covers. */
  priceCents: number;
  consignorId?: string;
  nonce?: string;
  sig?: string;
  /** Sale id from a /pos/<saleId> path, when the input had one. */
  saleIdFromPath?: string;
  /** Sale id from a saleId query param (the /pos/[saleId] redirect adds it), when present. */
  saleIdFromQuery?: string;
  /** True when c, n and s are all present: a signed consignor tag. */
  isConsignorTag: boolean;
  /** True when some, but not all, of c/n/s are present. */
  incompleteTag: boolean;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function parsePosTagUrl(input: string | null | undefined): ParsedPosTag | null {
  if (!input || typeof input !== 'string') return null;
  const text = input.trim();
  const qIndex = text.indexOf('?');
  if (qIndex === -1) return null;
  const pathPart = text.slice(0, qIndex);
  let queryPart = text.slice(qIndex + 1);
  const hashIndex = queryPart.indexOf('#');
  if (hashIndex !== -1) queryPart = queryPart.slice(0, hashIndex);

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(queryPart);
  } catch {
    return null;
  }
  if (params.get('action') !== 'add-misc') return null;

  const priceStr = params.get('price');
  if (!priceStr) return null;
  const price = parseFloat(priceStr);
  if (!Number.isFinite(price) || price <= 0) return null;

  const pathMatch = pathPart.match(/\/pos\/([A-Za-z0-9_-]{1,64})\/?$/);
  const saleIdFromPath = pathMatch ? pathMatch[1] : undefined;
  const rawSale = params.get('saleId');
  const saleIdFromQuery = rawSale && SAFE_ID.test(rawSale) ? rawSale : undefined;

  const c = params.get('c');
  const n = params.get('n');
  const s = params.get('s');
  const present = [c, n, s].filter((v) => v !== null && v !== '').length;
  const isConsignorTag = present === 3 && SAFE_ID.test(c as string) && SAFE_ID.test(n as string) && (s as string).length <= 64;
  const incompleteTag = present > 0 && !isConsignorTag;

  return {
    price,
    priceCents: Math.round(price * 100),
    ...(isConsignorTag ? { consignorId: c as string, nonce: n as string, sig: s as string } : {}),
    ...(saleIdFromPath ? { saleIdFromPath } : {}),
    ...(saleIdFromQuery ? { saleIdFromQuery } : {}),
    isConsignorTag,
    incompleteTag,
  };
}
