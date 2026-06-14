/**
 * eBay Catalog Lookup Service
 *
 * Barcode → eBay Browse API product enrichment.
 * Routes through the Vercel proxy (ebayProxyUrl) — Railway cannot reach api.ebay.com directly.
 * Uses the same app-level OAuth token as all other eBay features (getEbayAccessToken).
 */

import { getEbayAccessToken } from '../controllers/ebayController';
import { searchCatalogProduct } from './ebayTaxonomyService';

export interface EbayCatalogResult {
  found: true;
  title: string;
  brand?: string;
  mpn?: string;
  upc?: string;
  ean?: string;
  weightOz?: number;
  lengthIn?: number;
  widthIn?: number;
  heightIn?: number;
  productImageUrl?: string;
  ebayCategoryId?: string;
  ebayCategoryName?: string;
}

// ── Unit conversion helpers ─────────────────────────────────────────────────

/** Parse a numeric value from an eBay aspect string like "2.5 lbs" or "400g". */
function parseNumeric(raw: string): number | null {
  const m = raw.match(/^[\s]*([0-9]+(?:\.[0-9]+)?)/);
  return m ? parseFloat(m[1]) : null;
}

/**
 * Normalize eBay weight aspect to total ounces. Returns null if no unit recognized.
 * SUMS compound units: "1.5 lb 6 oz" → 30 oz (24 + 6), not 24 oz. Same shipping-accuracy
 * fix as the voice regex — eBay catalog occasionally returns compound formats for
 * heavier items (e.g. media weights as "2 lb 4 oz"). Returns null only if NO unit
 * substring matches anywhere in the string.
 */
function toOzFromAspect(raw: string): number | null {
  const lower = raw.toLowerCase();
  // Each unit is matched per-occurrence via a global regex, then summed.
  // Order: most-specific first to prevent "g" matching inside "kg" / "kilogram".
  const patterns: Array<{ re: RegExp; mult: number }> = [
    { re: /(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\b/gi, mult: 16 },
    { re: /(\d+(?:\.\d+)?)\s*(?:kg|kilograms?)\b/gi, mult: 35.274 },
    { re: /(\d+(?:\.\d+)?)\s*(?:oz|ounces?)\b/gi, mult: 1 },
    { re: /(\d+(?:\.\d+)?)\s*(?:g|grams?)\b/gi, mult: 0.03527396 },
  ];
  let totalOz = 0;
  let matched = false;
  for (const { re, mult } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower)) !== null) {
      totalOz += parseFloat(m[1]) * mult;
      matched = true;
    }
  }
  return matched ? Math.round(totalOz) : null;
}

/**
 * Normalize eBay dimension aspect to inches. Returns null if unit is unknown.
 * Uses word-boundary regex for "in" to avoid false positives on substrings like
 * "origin" or "thin". The other units (cm, mm) are unambiguous as substrings.
 */
function toInchesFromAspect(raw: string): number | null {
  const num = parseNumeric(raw);
  if (num === null) return null;
  const lower = raw.toLowerCase();
  if (/\bcm\b|centimeter/.test(lower)) return parseFloat((num / 2.54).toFixed(2));
  if (/\bmm\b|millimeter/.test(lower)) return parseFloat((num / 25.4).toFixed(2));
  if (lower.includes('"') || /\b(?:in|inch|inches)\b/.test(lower)) return parseFloat(num.toFixed(2));
  if (/\b(?:ft|feet|foot)\b/.test(lower)) return parseFloat((num * 12).toFixed(2));
  return null;
}

// ── Aspect map helpers ──────────────────────────────────────────────────────

/** Extract a value from eBay's localizedAspects array by name (case-insensitive). */
function getAspect(aspects: Array<{ name: string; value: string }>, ...names: string[]): string | null {
  for (const name of names) {
    const found = aspects.find((a) => a.name.toLowerCase() === name.toLowerCase());
    if (found) return found.value;
  }
  return null;
}

// ── Proxy URL builder (mirrors pattern in ebayController.ts) ────────────────
const ebayProxyUrl = (path: string): string =>
  `${process.env.FRONTEND_URL ?? 'https://finda.sale'}/api/proxy/ebay?path=${encodeURIComponent(path)}`;

const ebayProxyHeaders = (): Record<string, string> => {
  const secret = process.env.EBAY_PROXY_SECRET;
  return secret ? { 'X-Proxy-Secret': secret } : {};
};

// ── Main lookup function ────────────────────────────────────────────────────

/**
 * Look up a product by barcode using the eBay Browse API.
 *
 * Returns EbayCatalogResult if a match is found, or null if no match / API error.
 * For QR codes (raw text), falls back to a plain title search.
 */
export async function lookupByBarcode(
  code: string,
  codeType: string,
): Promise<EbayCatalogResult | null> {
  const token = await getEbayAccessToken();
  if (!token) {
    console.warn('[ebayCatalog] No eBay app token available — lookup skipped');
    return null;
  }

  // Build query: UPC/EAN/ISBN use the UPC filter for exact match;
  // QR codes fall back to a plain text search.
  const isBarcode = ['UPC', 'EAN', 'ISBN', 'EAN_8', 'EAN_13', 'UPC_A', 'UPC_E', 'UPC-A', 'UPC-E'].includes(
    codeType.toUpperCase(),
  );

  let searchPath: string;
  if (isBarcode) {
    // UPC filter is exact — highest confidence path
    const encodedCode = encodeURIComponent(code);
    searchPath =
      `/buy/browse/v1/item_summary/search?q=${encodedCode}&filter=upc%3A%7B${encodedCode}%7D&limit=1`;
  } else {
    // QR / unknown — plain text search, take first result
    searchPath =
      `/buy/browse/v1/item_summary/search?q=${encodeURIComponent(code)}&limit=1`;
  }

  let data: any;
  try {
    const res = await fetch(ebayProxyUrl(searchPath), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        ...ebayProxyHeaders(),
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      console.error(`[ebayCatalog] Browse API ${res.status} for code ${code}: ${body.slice(0, 300)}`);
      return null;
    }

    data = await res.json();
  } catch (err: any) {
    console.error('[ebayCatalog] Fetch error:', err?.message ?? err);
    return null;
  }

  const items: any[] = data?.itemSummaries ?? [];
  if (!items.length) {
    console.log(`[ebayCatalog] No match for code ${code} (type: ${codeType})`);
    return null;
  }

  const item = items[0];
  const aspects: Array<{ name: string; value: string }> = item.localizedAspects ?? [];

  // ── Extract weight ──────────────────────────────────────────────────────
  // eBay uses various aspect names; try the most common ones in order.
  const weightRaw = getAspect(aspects, 'Item Weight', 'Weight', 'Net Weight', 'Shipping Weight');
  const weightOz = weightRaw ? toOzFromAspect(weightRaw) ?? undefined : undefined;

  // ── Extract dimensions ──────────────────────────────────────────────────
  // eBay sometimes bundles as "Item Dimensions L x W x H" or splits into separate aspects.
  let lengthIn: number | undefined;
  let widthIn: number | undefined;
  let heightIn: number | undefined;

  const dimBundled = getAspect(aspects, 'Item Dimensions LxWxH', 'Item Dimensions', 'Dimensions');
  if (dimBundled) {
    // Common formats: "10 x 5 x 3 inches", "25.4 x 12.7 x 7.62 cm", "100 x 50 x 30 mm",
    // "2 x 1 x 0.5 ft". Detect unit from string context — defaults to inches only if
    // NO recognized unit is present (which is typical for unitless "10x5x3" strings).
    // Earlier version defaulted everything-not-cm to inches, which silently mis-parsed
    // mm strings as 100-inch boxes. Now we explicitly check each unit.
    const parts = dimBundled.split(/[xX×]/);
    if (parts.length >= 3) {
      const lower = dimBundled.toLowerCase();
      const factor = /\bcm\b|centimeter/.test(lower) ? (1 / 2.54)
        : /\bmm\b|millimeter/.test(lower) ? (1 / 25.4)
        : /\b(?:ft|feet|foot)\b/.test(lower) ? 12
        : 1; // default inches
      const convert = (raw: string): number | undefined => {
        const num = parseNumeric(raw.trim());
        if (num === null) return undefined;
        return parseFloat((num * factor).toFixed(2));
      };
      lengthIn = convert(parts[0]);
      widthIn = convert(parts[1]);
      heightIn = convert(parts[2]);
    }
  } else {
    // Try split aspects
    const lRaw = getAspect(aspects, 'Length', 'Item Length');
    const wRaw = getAspect(aspects, 'Width', 'Item Width');
    const hRaw = getAspect(aspects, 'Height', 'Item Height');
    lengthIn = lRaw ? toInchesFromAspect(lRaw) ?? undefined : undefined;
    widthIn = wRaw ? toInchesFromAspect(wRaw) ?? undefined : undefined;
    heightIn = hRaw ? toInchesFromAspect(hRaw) ?? undefined : undefined;
  }

  // ── Extract product identifiers ─────────────────────────────────────────
  // eBay returns productIdentifiers array on some items
  const productIdentifiers: Array<{ identifierType: string; identifierValue: string }> =
    item.additionalImages ?? []; // wrong field — use itemAffiliateWebUrl workaround
  // Actually, identifiers come directly off the item summary:
  const upc: string | undefined = item.upc ?? undefined;
  const ean: string | undefined = item.ean ?? undefined;
  const mpn: string | undefined = item.mpn ?? undefined;

  // ── Category ─────────────────────────────────────────────────────────────
  // item.categories is an array; first element is most specific
  const categories: Array<{ categoryId: string; categoryName: string }> = item.categories ?? [];
  const topCategory = categories[0];

  return {
    found: true,
    title: item.title ?? code,
    brand: item.brand ?? undefined,
    mpn: mpn,
    upc: isBarcode && codeType.toUpperCase().startsWith('UPC') ? code : upc,
    ean: isBarcode && (codeType.toUpperCase().startsWith('EAN') || codeType.toUpperCase() === 'ISBN') ? code : ean,
    weightOz,
    lengthIn,
    widthIn,
    heightIn,
    productImageUrl: item.image?.imageUrl ?? undefined,
    ebayCategoryId: topCategory?.categoryId,
    ebayCategoryName: topCategory?.categoryName,
  };
}

// ── Catalog Enrichment (ADR 2026-06-14) ─────────────────────────────────────

/**
 * Derive a normalized model/part token from an item's mpn or title.
 * Prefers an explicit mpn; otherwise regex-extracts a model-looking token from
 * the title (e.g. "AP-40", "XR500", "B 3"). Returns the normalized token
 * (uppercased, single internal hyphen) or null. Shared by enrichment + comps.
 */
export function modelTokenFrom(opts: { mpn?: string | null; title?: string | null }): string | null {
  const normalize = (raw: string): string =>
    raw.trim().toUpperCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-');

  // 1. Prefer an explicit mpn (still validate it looks like a model token).
  if (opts.mpn && opts.mpn.trim()) {
    const m = opts.mpn.match(/[A-Z]{0,4}[-\s]?\d{1,5}[A-Z]?/i);
    if (m) return normalize(m[0]);
    // mpn present but no alphanumeric model shape — still return normalized mpn
    return normalize(opts.mpn);
  }

  // 2. Else scan the title for a model-looking token.
  if (opts.title && opts.title.trim()) {
    const m = opts.title.match(/\b[A-Z]{1,4}[-\s]?\d{1,4}[A-Z]?\b/);
    if (m) return normalize(m[0]);
  }

  return null;
}

/** Result of a catalog-enrichment attempt. */
export interface CatalogEnrichmentResult {
  confidence: number; // 1.0 = HIGH (barcode-equivalent or brand+model exact), ~0.6 = partial
  identifiers: {
    mpn?: string;
    upc?: string;
    ean?: string;
    epid?: string;
    brand?: string;
  };
  package?: {
    weightOz?: number;
    lengthIn?: number;
    widthIn?: number;
    heightIn?: number;
  };
  matchedTitle?: string;
}

/**
 * Best-effort catalog enrichment for an item.
 *
 * Path A — barcode-equivalent (HIGH, confidence 1.0): if the item already carries
 *   a upc/ean/isbn, treat it as a scanned barcode and run lookupByBarcode. Returns
 *   the catalog identifiers + package dims.
 *
 * Path B — brand + model catalog search: requires a brand AND a derivable model
 *   token (from mpn or title). Calls searchCatalogProduct (eBay Catalog API) and
 *   scores the best product:
 *     - confidence 1.0 (HIGH) when the catalog product's brand matches the item
 *       brand (case-insensitive) AND the model token appears in the product title.
 *     - confidence 0.6 (partial) otherwise.
 *   The Catalog API product summary only exposes epid + title + brand, so Path B
 *   yields identifiers (epid/brand) and matchedTitle but no package dims.
 *
 * Returns null on no match or any error (never throws out).
 */
export async function enrichItemFromCatalog(item: {
  title?: string | null;
  brand?: string | null;
  mpn?: string | null;
  upc?: string | null;
  ean?: string | null;
  isbn?: string | null;
  tags?: string[] | null;
}): Promise<CatalogEnrichmentResult | null> {
  try {
    // ── Path A: existing barcode-equivalent identifier → HIGH ───────────────
    const barcode =
      (item.upc && item.upc.trim() && { code: item.upc.trim(), type: 'UPC' }) ||
      (item.ean && item.ean.trim() && { code: item.ean.trim(), type: 'EAN' }) ||
      (item.isbn && item.isbn.trim() && { code: item.isbn.trim(), type: 'ISBN' }) ||
      null;

    if (barcode) {
      const hit = await lookupByBarcode(barcode.code, barcode.type);
      if (hit) {
        return {
          confidence: 1.0,
          identifiers: {
            ...(hit.mpn ? { mpn: hit.mpn } : {}),
            ...(hit.upc ? { upc: hit.upc } : {}),
            ...(hit.ean ? { ean: hit.ean } : {}),
            ...(hit.brand ? { brand: hit.brand } : {}),
          },
          package: {
            ...(hit.weightOz != null ? { weightOz: hit.weightOz } : {}),
            ...(hit.lengthIn != null ? { lengthIn: hit.lengthIn } : {}),
            ...(hit.widthIn != null ? { widthIn: hit.widthIn } : {}),
            ...(hit.heightIn != null ? { heightIn: hit.heightIn } : {}),
          },
          matchedTitle: hit.title,
        };
      }
      // barcode present but no catalog hit — fall through to Path B attempt
    }

    // ── Path B: brand + model token → catalog product search ────────────────
    const brand = item.brand?.trim();
    const modelToken = modelTokenFrom({ mpn: item.mpn, title: item.title });
    if (!brand || !modelToken) return null;

    const token = await getEbayAccessToken();
    if (!token) return null;

    const products = await searchCatalogProduct(token, { mpn: modelToken, brand });
    if (!products.length) return null;

    // Pick the best product: prefer one whose brand matches AND whose title
    // contains the model token; else the first returned.
    const tokenLower = modelToken.toLowerCase();
    const brandLower = brand.toLowerCase();
    const best =
      products.find(
        (p) =>
          (p.brand?.toLowerCase() === brandLower) &&
          (p.title?.toLowerCase().includes(tokenLower) ?? false)
      ) ?? products[0];

    const brandExact = best.brand?.toLowerCase() === brandLower;
    const tokenInTitle = best.title?.toLowerCase().includes(tokenLower) ?? false;
    const confidence = brandExact && tokenInTitle ? 1.0 : 0.6;

    return {
      confidence,
      identifiers: {
        mpn: modelToken,
        ...(best.epid ? { epid: best.epid } : {}),
        ...(best.brand ? { brand: best.brand } : {}),
      },
      // Catalog API product summary carries no weight/dims — package omitted here.
      matchedTitle: best.title,
    };
  } catch (err: any) {
    console.error('[ebayCatalog] enrichItemFromCatalog error:', err?.message ?? err);
    return null;
  }
}
