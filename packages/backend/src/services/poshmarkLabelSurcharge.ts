// Poshmark label cost (2026-10-27, Patrick). Poshmark's prepaid label covers a package up to 5 lb. Heavier packages cost
// the seller a label upgrade that Poshmark deducts from earnings. Sources checked 2026-10-27:
//   - Poshmark blog, 2026-02-13: 5.1-10 lb is a $5 upgrade, 10.1-15 lb is $10, labels capped at 15 lb.
//   - Value Added Resource, 2026-10-17: since 2026-10-26 sellers pay overweight costs: 5.01-10 lb $5, 10.01-15 lb $10,
//     15.01-25 lb $15, over 25 lb the full USPS cost is deducted from earnings.
// The text in Poshmark's own "potential oversized item" box still says 10 lb max; that is outdated.
// Nothing here blocks a listing. It only works out the deduction so the organizer is told about it.
//
// KEEP IN SYNC with extension/fas-poshmark.js poshLabelSurchargeUsd (same tiers, same edges). The extension prefers the
// server's poshmarkLabel on each item and only falls back to its own copy for an older server.
import { estimateCheapestRate, coverageZoneForOrigin, ShippingHardBlockError, type ZoneKey } from './ebayRateEstimateService';

export const POSHMARK_LABEL_INCLUDED_OZ = 80; // 5 lb
export const POSHMARK_LABEL_TIERS: ReadonlyArray<{ upToOz: number; usd: number }> = [
  { upToOz: 160, usd: 5 }, // 5.01-10 lb
  { upToOz: 240, usd: 10 }, // 10.01-15 lb
  { upToOz: 400, usd: 15 }, // 15.01-25 lb
];
/** Over this many ounces (25 lb) Poshmark deducts the full shipping cost instead of a flat upgrade. */
export const POSHMARK_FULL_COST_OVER_OZ = 400;
/** Over 15 lb the organizer is told to split the shipment into more than one box. */
export const POSHMARK_SPLIT_BOX_OVER_OZ = 240;
export const POSHMARK_MAX_LENGTH_PLUS_GIRTH_IN = 108;

export type PoshmarkWeightSource = 'organizer' | 'estimate' | 'none';
export type PoshmarkDims = { length?: number | null; width?: number | null; height?: number | null } | null | undefined;

export interface PoshmarkSurcharge {
  /** Dollars Poshmark deducts for the heavier label. 0 up to 5 lb. For over 25 lb: the USPS estimate, or null when it
   *  could not be estimated (fullLabelCost is then true and the amount is unknown). null when there is no weight. */
  surchargeUsd: number | null;
  /** True over 25 lb: Poshmark deducts the full label cost, so surchargeUsd is an estimate (or unknown). */
  fullLabelCost: boolean;
  weightOz: number | null;
  /** Weight in pounds, one decimal. null when there is no weight. */
  weightLb: number | null;
  source: PoshmarkWeightSource;
}

const pos = (v: unknown): number | null => (v != null && v !== '' && isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The tier amount for a package weight (pure). Edges: <= 80 oz -> 0; <= 160 -> 5; <= 240 -> 10; <= 400 -> 15;
 * over 400 oz -> the full label cost, which is `fullCostUsd` (a USPS estimate supplied by the caller) or null if unknown.
 * `dims` is only used for the over-25-lb USPS estimate when fullCostUsd is not passed and `zone` is.
 */
export function poshmarkOverweightSurchargeUsd(
  weightOz: number | null | undefined,
  dims?: PoshmarkDims,
  opts: { source?: PoshmarkWeightSource; fullCostUsd?: number | null; zone?: ZoneKey | null } = {},
): PoshmarkSurcharge {
  const w = pos(weightOz);
  const source: PoshmarkWeightSource = w == null ? 'none' : (opts.source || 'organizer');
  if (w == null) return { surchargeUsd: null, fullLabelCost: false, weightOz: null, weightLb: null, source: 'none' };
  const weightLb = Math.round((w / 16) * 10) / 10;
  if (w <= POSHMARK_LABEL_INCLUDED_OZ) return { surchargeUsd: 0, fullLabelCost: false, weightOz: w, weightLb, source };
  for (const t of POSHMARK_LABEL_TIERS) {
    if (w <= t.upToOz) return { surchargeUsd: t.usd, fullLabelCost: false, weightOz: w, weightLb, source };
  }
  let full = opts.fullCostUsd != null && isFinite(Number(opts.fullCostUsd)) ? round2(Number(opts.fullCostUsd)) : null;
  if (full == null && opts.zone) full = uspsLabelEstimateUsd(w, dims, opts.zone);
  return { surchargeUsd: full, fullLabelCost: true, weightOz: w, weightLb, source };
}

/** USPS Ground Advantage estimate from this codebase's own rate tables (ebayRateEstimateService), or null when USPS
 *  cannot ship it at all (over 70 lb / 130 in) or the estimate fails. Never throws. */
export function uspsLabelEstimateUsd(weightOz: number, dims: PoshmarkDims, zone: ZoneKey): number | null {
  try {
    const d = dims && pos(dims.length) && pos(dims.width) && pos(dims.height)
      ? { length: Number(dims.length), width: Number(dims.width), height: Number(dims.height) } : null;
    const r = estimateCheapestRate({ weightOz, dims: d, zone, onlyCarrier: 'USPS' });
    return r && isFinite(r.rate) ? round2(r.rate) : null;
  } catch (e) {
    if (!(e instanceof ShippingHardBlockError)) console.warn('[poshmarkLabelSurcharge] USPS estimate failed:', (e as Error)?.message || e);
    return null;
  }
}

export type PoshmarkPackageInput = {
  packageWeightOz?: number | null; aiPackageWeightOz?: number | null;
  packageLengthIn?: unknown; packageWidthIn?: unknown; packageHeightIn?: unknown;
  aiPackageDimsJson?: unknown;
};

/** Organizer's package weight first, then the photo estimate. */
export function resolvePoshmarkWeight(it: PoshmarkPackageInput): { weightOz: number | null; source: PoshmarkWeightSource } {
  const own = pos(it.packageWeightOz);
  if (own != null) return { weightOz: own, source: 'organizer' };
  const est = pos(it.aiPackageWeightOz);
  if (est != null) return { weightOz: est, source: 'estimate' };
  return { weightOz: null, source: 'none' };
}

/** Organizer's three package dimensions when all are set, else the photo estimate's, else null. */
export function resolvePoshmarkDims(it: PoshmarkPackageInput): { length: number; width: number; height: number } | null {
  const l = pos(it.packageLengthIn), w = pos(it.packageWidthIn), h = pos(it.packageHeightIn);
  if (l != null && w != null && h != null) return { length: l, width: w, height: h };
  const raw = it.aiPackageDimsJson;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const al = pos(o.length), aw = pos(o.width), ah = pos(o.height);
  return al != null && aw != null && ah != null ? { length: al, width: aw, height: ah } : null;
}

/** Longest side plus twice the other two, or null. */
export function lengthPlusGirth(d: { length: number; width: number; height: number } | null): number | null {
  if (!d) return null;
  const s = [d.length, d.width, d.height].sort((a, b) => b - a);
  return s[0] + 2 * (s[1] + s[2]);
}

const money = (n: number) => '$' + n.toFixed(2);

/** The plain-English note for one item (pure). '' when there is nothing to say. */
export function poshmarkLabelNoteText(s: PoshmarkSurcharge, lengthPlusGirthIn: number | null): string {
  const parts: string[] = [];
  if (s.weightOz != null && s.weightOz > POSHMARK_LABEL_INCLUDED_OZ) {
    const how = '(' + s.weightLb!.toFixed(1) + ' lb, ' + (s.source === 'organizer' ? 'from your saved package weight' : 'estimated') + ')';
    if (s.fullLabelCost) {
      parts.push(s.surchargeUsd != null
        ? 'Over 25 lb: Poshmark deducts the full shipping cost from your earnings, about ' + money(s.surchargeUsd) + ' (USPS estimate) ' + how + '. Ship it in more than one box if you can.'
        : 'Over 25 lb: Poshmark deducts the full USPS shipping cost from your earnings ' + how + '. Ship it in more than one box if you can.');
    } else {
      parts.push('Poshmark will deduct ' + money(s.surchargeUsd || 0) + ' from your earnings for the heavier label ' + how + '.' +
        (s.weightOz > POSHMARK_SPLIT_BOX_OVER_OZ ? ' Over 15 lb, ship it in more than one box if you can.' : ''));
    }
  }
  if (lengthPlusGirthIn != null && lengthPlusGirthIn > POSHMARK_MAX_LENGTH_PLUS_GIRTH_IN) {
    parts.push('May be too big for Poshmark\'s label (over 108 inches length plus girth).');
  }
  return parts.join(' ');
}

export interface PoshmarkLabelInfo extends PoshmarkSurcharge {
  lengthPlusGirthIn: number | null;
  /** Plain-English note, '' when nothing applies. */
  note: string;
}

/** Everything the web app and the extension show for one item. `originZip` picks the USPS zone for the over-25-lb
 *  estimate (the organizer's farthest-zone coverage, same as eBay pricing); omitted -> the default zone. */
export function poshmarkLabelInfo(it: PoshmarkPackageInput, originZip?: string | null): PoshmarkLabelInfo {
  const { weightOz, source } = resolvePoshmarkWeight(it);
  const dims = resolvePoshmarkDims(it);
  const zone = coverageZoneForOrigin({ zip: originZip || null });
  const s = poshmarkOverweightSurchargeUsd(weightOz, dims, { source, zone });
  const lg = lengthPlusGirth(dims);
  return { ...s, lengthPlusGirthIn: lg, note: poshmarkLabelNoteText(s, lg) };
}
