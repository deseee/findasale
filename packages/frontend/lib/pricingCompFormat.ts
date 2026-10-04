/**
 * Pure helpers for PricingCompSummary: build the what-if estimate request body, read the response,
 * and word the grade disclosure. No React and no network so node:test can run it.
 *
 * POST /pricing/estimate with persist:false is a what-if lookup: it never overwrites the saved estimate.
 * Amounts in the response are cents; the UI shows dollars.
 */

export interface EstimateBodyInput {
  itemId: string;
  title?: string;
  category?: string;
  brand?: string;
  condition?: string;
  conditionGrade?: string;
}

function clean(v: string | undefined | null): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

/** Only fields we really have are sent; nothing is guessed. persist is always the literal false. */
export function buildEstimateBody(input: EstimateBodyInput): Record<string, unknown> {
  const body: Record<string, unknown> = { itemId: input.itemId, persist: false };
  const title = clean(input.title);
  const category = clean(input.category);
  const brand = clean(input.brand);
  const condition = clean(input.condition);
  const conditionGrade = clean(input.conditionGrade);
  if (title) body.title = title;
  if (category) body.category = category;
  if (brand) body.brand = brand;
  if (condition) body.condition = condition;
  if (conditionGrade) body.conditionGrade = conditionGrade;
  return body;
}

/** True when the backend has enough to run an estimate (it needs a title or a category). */
export function canRunEstimate(input: { title?: string; category?: string }): boolean {
  return Boolean(clean(input.title) || clean(input.category));
}

/** 'Adjusted for grade C (x0.85).' or null when no grade factor was applied. */
export function gradeDisclosure(flags: unknown): string | null {
  if (typeof flags !== 'object' || flags === null) return null;
  const f = flags as Record<string, unknown>;
  if (f.gradeFactorApplied !== true) return null;
  const grade = f.gradeFactorGrade;
  const factor = f.gradeFactor;
  if (grade !== 'A' && grade !== 'B' && grade !== 'C' && grade !== 'D') return null;
  if (typeof factor !== 'number' || !Number.isFinite(factor)) return null;
  return `Adjusted for grade ${grade} (x${factor.toFixed(2)}).`;
}

export type ParsedEstimate =
  | { kind: 'none' }
  | { kind: 'ok'; low: number; high: number; estimate: number; compsFound: number; gradeLine: string | null };

/** FLOOR confidence means no real comps were found: never show a bare floor price as if it were a comp. */
export function parseEstimateResponse(data: unknown): ParsedEstimate {
  if (typeof data !== 'object' || data === null) return { kind: 'none' };
  const d = data as Record<string, any>;
  if (d.confidence === 'FLOOR') return { kind: 'none' };
  const range = d.priceRange;
  if (
    !range ||
    typeof range.low !== 'number' ||
    typeof range.high !== 'number' ||
    typeof d.estimatedPrice !== 'number' ||
    !Number.isFinite(range.low) ||
    !Number.isFinite(range.high) ||
    !Number.isFinite(d.estimatedPrice)
  ) {
    return { kind: 'none' };
  }
  return {
    kind: 'ok',
    low: range.low / 100,
    high: range.high / 100,
    estimate: d.estimatedPrice / 100,
    compsFound: typeof d.compsFound === 'number' && d.compsFound >= 0 ? d.compsFound : 0,
    gradeLine: gradeDisclosure(d.flags),
  };
}

export const COMP_COPY = {
  button: 'Look up comparable prices',
  buttonPending: 'Looking up…',
  buttonAgain: 'Look up again',
  pendingNote: 'Looking up recent sold prices…',
  none: 'No comparable prices found yet.',
  error: "Couldn't look up comparable prices. Try again in a moment.",
  rateLimited: 'Too many lookups. Wait a moment and try again.',
} as const;

export function estimateErrorMessage(err: unknown): string {
  const status =
    typeof err === 'object' && err !== null && typeof (err as any).response?.status === 'number'
      ? (err as any).response.status
      : 0;
  return status === 429 ? COMP_COPY.rateLimited : COMP_COPY.error;
}

export function formatRangeText(low: number, high: number): string {
  return `$${low.toFixed(2)} to $${high.toFixed(2)}`;
}
