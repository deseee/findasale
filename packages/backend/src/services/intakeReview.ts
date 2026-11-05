/**
 * intakeReview.ts -- item-intake quality layer orchestrator (2026-11-05).
 *
 * Runs after Haiku pass 1 inside analyzeItemImage / analyzeItemImages (cloudAIService), so every caller of the
 * standard intake pipeline (rapidfire, batch analyze, re-analyze, analyze-photo) gets it:
 *   1. category family detection (intakeCategoryFamilies)
 *   2. Haiku verify pass, high-confidence corrections applied to non-organizer fields (intakeVerifyPass)
 *   3. deterministic consistency checks (intakeConsistencyChecks)
 *   4. category required facts + required photos
 *   5. packed-weight sanity bounds (AI estimate clamped, organizer weights never touched)
 *   6. marketplace fit (collectibles -> eBay)
 * The result is an IntakeReview attached to the tag result and stored on Item.catalogSuggestions.intakeReview by
 * the callers that persist tagging (no schema migration). Never throws.
 */
import {
  detectCategoryFamily,
  findMissingFacts,
  getCategoryFamilySpec,
  isCollectibleFamily,
  weightBoundsFor,
  type CategoryFamily,
} from './intakeCategoryFamilies';
import { extractCounts, runConsistencyChecks } from './intakeConsistencyChecks';
import { applyVerifyCorrections, runVerifyPass, type VerifiableResult } from './intakeVerifyPass';
import type { AppliedIntakeCorrection, IntakeReview, IntakeReviewNote, VerifyPassStatus } from './intakeReviewTypes';

export type { IntakeReview, IntakeReviewNote } from './intakeReviewTypes';

/** Vision label confidence below this on a coin/card photo reads as "possibly blurry or too dark". */
export const SHARP_PHOTO_MIN_QUALITY = 0.6;

export interface IntakeQualityResult extends VerifiableResult {
  recordIdentity?: { format?: unknown } | null;
  card?: { grader?: unknown } | null | unknown;
  intakeReview?: IntakeReview;
}

export interface IntakeQualityInput {
  imageBase64Array: string[];
  mimeTypes: string[];
  /** Vision OCR text for the item (joined). */
  ocrText?: string | null;
  /** Vision quality score per photo (same order as the images). null/undefined = unknown (Vision failed). */
  photoQualityScores?: Array<number | null | undefined>;
  /** Vision labels, used as an extra hint for family detection. */
  objectLabels?: string[];
  userEditedFields?: readonly string[] | null;
  /** The organizer has set or confirmed the package weight: the weight estimate is left alone. */
  organizerWeightSet?: boolean;
  /** Test hook / callers that already ran the verify pass elsewhere. */
  skipVerify?: boolean;
}

function familyOf(result: IntakeQualityResult, labels?: string[]): CategoryFamily | null {
  return detectCategoryFamily({
    category: result.category,
    title: result.title,
    description: result.description,
    tags: result.tags,
    labels,
    recordIdentity: result.recordIdentity as { format?: unknown } | null,
    card: result.card,
  });
}

/**
 * Weight sanity bounds. Clamps result.estimatedWeightOz (the model's estimate) to the family's plausible packed
 * range and returns a note. Does nothing when the organizer set the weight or when there is no estimate.
 */
export function applyWeightBounds(
  result: IntakeQualityResult,
  family: CategoryFamily | null,
  opts: { organizerWeightSet?: boolean; userEditedFields?: readonly string[] | null } = {}
): { applied?: AppliedIntakeCorrection; note?: IntakeReviewNote } {
  try {
    if (opts.organizerWeightSet) return {};
    if ((opts.userEditedFields || []).includes('packageWeightOz')) return {};
    const w = result.estimatedWeightOz;
    if (w == null || !Number.isFinite(Number(w))) return {};
    const unitCount = Math.max(1, ...extractCounts(result.title));
    const recordFormat = (result.recordIdentity as { format?: unknown } | null | undefined)?.format;
    const slabbed = !!(result.card && typeof result.card === 'object' && (result.card as { grader?: unknown }).grader);
    const bounds = weightBoundsFor(family, unitCount, { recordFormat: typeof recordFormat === 'string' ? recordFormat : null, slabbed });
    if (!bounds) return {};
    const weight = Number(w);
    if (weight >= bounds.min && weight <= bounds.max) return {};
    const clamped = weight < bounds.min ? bounds.min : bounds.max;
    result.estimatedWeightOz = clamped;
    const label = getCategoryFamilySpec(family)?.label.toLowerCase() || 'item';
    return {
      applied: { field: 'estimatedWeightOz', from: weight, to: clamped, reason: `outside ${bounds.min}-${bounds.max} oz for a ${label}`, confidence: 1, source: 'weight' },
      note: {
        code: 'WEIGHT_OUT_OF_RANGE',
        severity: 'medium',
        source: 'weight',
        field: 'packageWeightOz',
        message: `The estimated shipping weight of ${weight} oz is outside the usual ${bounds.min}-${bounds.max} oz for a ${label}, so it was set to ${clamped} oz. Weigh it to be sure.`,
        current: weight,
        suggested: clamped,
      },
    };
  } catch {
    return {};
  }
}

/** Note-only weight check for a stored package weight that did not come from the organizer (e.g. a category profile). */
export function storedWeightNote(
  family: CategoryFamily | null,
  weightOz: number | null | undefined,
  title?: string | null
): IntakeReviewNote | null {
  try {
    if (weightOz == null || !Number.isFinite(Number(weightOz))) return null;
    const unitCount = Math.max(1, ...extractCounts(title));
    const bounds = weightBoundsFor(family, unitCount);
    if (!bounds) return null;
    const w = Number(weightOz);
    if (w >= bounds.min && w <= bounds.max) return null;
    const label = getCategoryFamilySpec(family)?.label.toLowerCase() || 'item';
    return {
      code: 'WEIGHT_OUT_OF_RANGE',
      severity: 'medium',
      source: 'weight',
      field: 'packageWeightOz',
      message: `The shipping weight of ${w} oz is outside the usual ${bounds.min}-${bounds.max} oz for a ${label}. Weigh it before listing.`,
      current: w,
      suggested: w < bounds.min ? bounds.min : bounds.max,
    };
  } catch {
    return null;
  }
}

/** Required-photo and sharpness notes. Exported for tests. */
export function photoNotes(
  family: CategoryFamily | null,
  args: { photoCount: number; verifyStatus: VerifyPassStatus; missingShots: string[]; photosUnclear: boolean; qualityScores?: Array<number | null | undefined> }
): IntakeReviewNote[] {
  const spec = getCategoryFamilySpec(family);
  if (!spec) return [];
  const notes: IntakeReviewNote[] = [];
  const missing = new Set<string>();
  if (args.verifyStatus === 'ran') {
    for (const id of args.missingShots) missing.add(id);
  }
  // Deterministic floor: a shot can never be present when there are fewer photos than it needs.
  for (const shot of spec.requiredShots) {
    if (args.photoCount < shot.minPhotos) missing.add(shot.id);
  }
  for (const shot of spec.requiredShots) {
    if (!missing.has(shot.id)) continue;
    notes.push({
      code: 'MISSING_PHOTO',
      severity: 'high',
      source: 'photos',
      field: 'photos',
      message: `Add a photo of ${shot.label}. Buyers of a ${spec.label.toLowerCase()} expect it.`,
      current: shot.id,
    });
  }
  if (spec.needsSharpPhotos) {
    const scores = (args.qualityScores || []).filter((s): s is number => typeof s === 'number' && s > 0);
    const lowQuality = scores.some((s) => s < SHARP_PHOTO_MIN_QUALITY);
    if (args.photosUnclear || lowQuality) {
      notes.push({
        code: 'PHOTO_NOT_SHARP',
        severity: 'high',
        source: 'photos',
        field: 'photos',
        message: `At least one photo looks blurry or too dark. A ${spec.label.toLowerCase()} needs sharp, in-focus photos so buyers can judge the details.`,
      });
    }
  }
  return notes;
}

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 };

/** Runs the whole intake quality layer on a pass-1 result (mutated in place) and returns the review. Never throws. */
export async function runIntakeQuality(result: IntakeQualityResult, input: IntakeQualityInput): Promise<IntakeReview> {
  const notes: IntakeReviewNote[] = [];
  const appliedCorrections: AppliedIntakeCorrection[] = [];
  let verifyStatus: VerifyPassStatus = 'not-run';
  let missingShots: string[] = [];
  let photosUnclear = false;
  let family: CategoryFamily | null = null;
  let blockAutoPublish = false;
  try {
    family = familyOf(result, input.objectLabels);

    // 2. verify pass (gated, never throws)
    if (!input.skipVerify) {
      const verify = await runVerifyPass({
        imageBase64Array: input.imageBase64Array,
        mimeTypes: input.mimeTypes,
        pass1: result,
        ocrText: input.ocrText,
        family,
      });
      verifyStatus = verify.status;
      missingShots = verify.missingShots;
      photosUnclear = verify.photosUnclear;
      if (verify.corrections.length > 0) {
        const merged = applyVerifyCorrections(result, verify.corrections, { userEditedFields: input.userEditedFields });
        appliedCorrections.push(...merged.applied);
        notes.push(...merged.notes);
        family = familyOf(result, input.objectLabels) ?? family;
      }
    }

    // 3. deterministic consistency checks
    const consistency = runConsistencyChecks({
      title: result.title,
      description: result.description,
      condition: result.condition,
      brand: result.brand,
      tags: result.tags,
      detectedPrintedText: result.detectedPrintedText,
      printedText: result.printedText,
      ocrText: input.ocrText,
    });
    notes.push(...consistency.notes);
    blockAutoPublish = consistency.blockAutoPublish;

    // 4a. category required facts
    const spec = getCategoryFamilySpec(family);
    if (spec) {
      for (const fact of findMissingFacts(family, result.title, result.description)) {
        notes.push({
          code: 'MISSING_FACT',
          severity: 'medium',
          source: 'facts',
          field: 'description',
          message: `The description does not state the ${fact.label.toLowerCase()}. Buyers of a ${spec.label.toLowerCase()} look for it.`,
          current: fact.id,
        });
      }
    }

    // 4b. required photos / sharpness
    notes.push(...photoNotes(family, {
      photoCount: input.imageBase64Array.length,
      verifyStatus,
      missingShots,
      photosUnclear,
      qualityScores: input.photoQualityScores,
    }));

    // 5. weight bounds
    const weight = applyWeightBounds(result, family, { organizerWeightSet: input.organizerWeightSet, userEditedFields: input.userEditedFields });
    if (weight.applied) appliedCorrections.push(weight.applied);
    if (weight.note) notes.push(weight.note);
  } catch (err) {
    console.warn('[intakeReview] quality layer error (ignored):', err instanceof Error ? err.message : err);
  }

  // 6. marketplace fit
  const preferredMarketplaces: string[] = [];
  if (isCollectibleFamily(family)) {
    preferredMarketplaces.push('EBAY');
    notes.push({
      code: 'ROUTE_EBAY',
      severity: 'info',
      source: 'routing',
      message: `A ${getCategoryFamilySpec(family)?.label.toLowerCase()} sells best on eBay. It is not suggested for Poshmark or Vinted.`,
    });
  }

  notes.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
  const review: IntakeReview = {
    version: 1,
    generatedAt: new Date().toISOString(),
    family,
    blockAutoPublish,
    notes: notes.slice(0, 40),
    appliedCorrections,
    preferredMarketplaces,
    verifyPass: verifyStatus,
  };
  result.intakeReview = review;
  return review;
}

// ---- Persistence helpers (Item.catalogSuggestions.intakeReview) ----------------------------------------------

/** Read a stored intake review back out of Item.catalogSuggestions. Null when absent or malformed. */
export function readIntakeReview(catalogSuggestions: unknown): IntakeReview | null {
  if (!catalogSuggestions || typeof catalogSuggestions !== 'object' || Array.isArray(catalogSuggestions)) return null;
  const raw = (catalogSuggestions as Record<string, unknown>).intakeReview;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Partial<IntakeReview>;
  if (!Array.isArray(r.notes)) return null;
  return r as IntakeReview;
}

/** True when the stored review says the item must not be published automatically. */
export function isAutoPublishBlocked(catalogSuggestions: unknown): boolean {
  return readIntakeReview(catalogSuggestions)?.blockAutoPublish === true;
}

/**
 * Returns the catalogSuggestions value to write so it carries `review`, keeping every other key of `base`
 * (enrichment fields, cardSuggestion). `base` is the value the caller was about to write (object, null to clear,
 * or undefined = leave the column as `existing`). A null review leaves `base` as it is.
 */
export function withIntakeReview(existing: unknown, base: unknown, review: IntakeReview | null | undefined): unknown {
  if (!review) return base;
  const source = base === undefined ? existing : base;
  const obj = source && typeof source === 'object' && !Array.isArray(source) ? (source as Record<string, unknown>) : {};
  return { ...obj, intakeReview: review };
}

/** Adds notes to an existing review (e.g. a stored-weight note found after the package auto-confirm step). */
export function appendIntakeNotes(review: IntakeReview, extra: IntakeReviewNote[]): IntakeReview {
  if (extra.length === 0) return review;
  const codes = new Set(review.notes.map((n) => `${n.code}:${n.field ?? ''}`));
  const add = extra.filter((n) => !codes.has(`${n.code}:${n.field ?? ''}`));
  if (add.length === 0) return review;
  return { ...review, notes: [...review.notes, ...add].sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9)).slice(0, 40) };
}

/** Sanitizes the model's "printedText" block: strings only, trimmed, short, deduplicated. Null when empty. */
export function normalizePrintedText(raw: unknown): import('./intakeReviewTypes').PrintedTextTranscription | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const s = v.trim();
    return s && !/^(null|none|n\/a)$/i.test(s) ? s.slice(0, 120) : null;
  };
  const list = (v: unknown): string[] => {
    const arr = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
    return [...new Set(arr.map(str).filter((s): s is string => !!s))].slice(0, 12);
  };
  const out = {
    brand: str(r.brand),
    modelNumbers: list(r.modelNumbers),
    catalogNumbers: list(r.catalogNumbers),
    credits: list(r.credits),
    counts: list(r.counts),
    other: list(r.other),
  };
  const empty = !out.brand && Object.entries(out).every(([k, v]) => k === 'brand' || (Array.isArray(v) && v.length === 0));
  return empty ? null : out;
}
