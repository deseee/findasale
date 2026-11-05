/**
 * intakeReviewTypes.ts -- shared types for the item-intake quality layer (2026-11-05).
 *
 * The intake pipeline (photo -> Vision -> Haiku pass 1 -> Haiku verify pass -> deterministic checks) produces
 * review notes for the organizer. They are stored on Item.catalogSuggestions.intakeReview (an existing JSON
 * column that already carries enrichment and card suggestions), so no schema migration is needed.
 *
 * Every `message` string is organizer-facing copy: plain words, no em dashes, never "AI".
 */
import type { CategoryFamily } from './intakeCategoryFamilies';

export type IntakeNoteSeverity = 'high' | 'medium' | 'low' | 'info';
export type IntakeNoteSource = 'verify' | 'consistency' | 'facts' | 'photos' | 'weight' | 'routing';

export interface IntakeReviewNote {
  /** Stable machine code, e.g. LOT_COUNT_MISMATCH, MISSING_PHOTO, VERIFY_SUGGESTION. */
  code: string;
  severity: IntakeNoteSeverity;
  source: IntakeNoteSource;
  /** Item field the note is about, when there is one (title, description, brand, condition, category, tags, packageWeightOz, photos). */
  field?: string;
  message: string;
  current?: string | number | null;
  suggested?: string | number | null;
  confidence?: number;
}

export interface AppliedIntakeCorrection {
  field: string;
  from: unknown;
  to: unknown;
  reason: string;
  confidence: number;
  source: 'verify' | 'weight';
}

export type VerifyPassStatus = 'ran' | 'disabled' | 'gated' | 'failed' | 'not-run';

/** What is stored at Item.catalogSuggestions.intakeReview. */
export interface IntakeReview {
  version: 1;
  generatedAt: string;
  family: CategoryFamily | null;
  /** True when a do-not-publish / test marker was found: the item is left out of automatic publishing. */
  blockAutoPublish: boolean;
  notes: IntakeReviewNote[];
  appliedCorrections: AppliedIntakeCorrection[];
  /** Marketplaces this kind of item sells best on (collectibles: eBay). Advisory only. */
  preferredMarketplaces: string[];
  verifyPass: VerifyPassStatus;
}

/** Pass-1 structured verbatim transcription of printed text (labels, packaging, credits). */
export interface PrintedTextTranscription {
  brand?: string | null;
  modelNumbers?: string[] | null;
  catalogNumbers?: string[] | null;
  credits?: string[] | null;
  /** Counts printed on packaging, verbatim ("10 Diskettes", "Set of 6"). */
  counts?: string[] | null;
  other?: string[] | null;
}
