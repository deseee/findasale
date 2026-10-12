/**
 * Shared types for the card scan staging area (ADR-138, batch B2).
 * Type declarations and plain constants only: no env reads, no database, no network, no imports with
 * side effects. The recognizer and the database are injected by later batches; nothing here knows them.
 */
import type { CardConditionCode, CardFinish, CardGame, CardGrade, CardGrader, CardLanguage } from '../../constants/cardVocabulary';
import type { CandidateDto, IntakeMode, ResolutionStatus } from '../cardIntake/types';

export type { CandidateDto, IntakeMode, ResolutionStatus };

export const SCAN_SESSION_SOURCES = ['PHOTO', 'DELVER'] as const;
export type ScanSessionSource = (typeof SCAN_SESSION_SOURCES)[number];

export const SCAN_SESSION_STATUSES = ['OPEN', 'COMMITTING', 'CLOSED', 'DISCARDED'] as const;
export type ScanSessionStatus = (typeof SCAN_SESSION_STATUSES)[number];

export const SCAN_ENTRY_SOURCES = ['PHOTO', 'UPLOAD', 'DELVER', 'MANUAL'] as const;
export type ScanEntrySource = (typeof SCAN_ENTRY_SOURCES)[number];

export const SCAN_ENTRY_STATUSES = ['NEEDS_REVIEW', 'READY', 'SKIPPED', 'COMMITTING', 'COMMITTED', 'ERROR'] as const;
export type ScanEntryStatus = (typeof SCAN_ENTRY_STATUSES)[number];

/** What an entry still needs from the organizer before it can be committed. */
export const SCAN_NEEDS = ['PRINTING', 'FINISH', 'CONDITION', 'NAME'] as const;
export type ScanNeed = (typeof SCAN_NEEDS)[number];

export type ObservationProviderId = 'haiku-card' | 'scrydex' | 'ximilar' | 'delver' | 'manual';

/**
 * What a recognizer (or Delver, or a manual add) reports about one card. Everything here is a READING:
 * finish and condition are hints and suggestions only and are never written as the card's finish or condition.
 */
export interface CardObservation {
  providerId: ObservationProviderId;
  game: CardGame;
  cardName?: string;
  setCode?: string;
  setName?: string;
  collectorNumber?: string;
  language?: CardLanguage;
  /** A hint only. */
  finish?: CardFinish;
  scryfallId?: string;
  tcgplayerProductId?: number;
  /** A suggestion only. */
  suggestedConditionCode?: CardConditionCode;
  grader?: CardGrader;
  grade?: CardGrade;
  certNumber?: string;
  /** The provider's own number, 0 to 1, informational only. */
  confidence?: number;
}

/** Why a reading could not be pre-selected, or how it was matched. */
export const RESOLUTION_NOTES = ['NAME_MISMATCH', 'NAME_ONLY', 'GAME_NOT_SERVED', 'CATALOG_OFF'] as const;
export type ResolutionNote = (typeof RESOLUTION_NOTES)[number];

/** FULL: set and number AND name agree (or an exact id). PARTIAL: matched by name only. NONE: nothing is pre-selected. */
export type ResolutionAgreement = 'FULL' | 'PARTIAL' | 'NONE';

export interface ObservationResolution {
  status: ResolutionStatus;
  /** Set only when status is EXACT. */
  printingId: string | null;
  /** At most five printings, in the catalog's own order. */
  candidates: CandidateDto[];
  /** True when more printings matched than are listed. */
  truncated: boolean;
  agreement: ResolutionAgreement;
  note: ResolutionNote | null;
}

/** The result kinds the duplicate rules can report (ADR-138 section 3.5). */
export type DuplicateKind = 'SAME_ENTRY' | 'SAME_PLACEMENT' | 'SAME_IMAGE' | 'SUSPECT_REPEAT';

/**
 * One CardScanEntry row as plain data. The session service (B3) maps a database row to this shape
 * (price becomes a number or null). Fields named read* are what the recognizer saw and are never edited;
 * the other card fields are the organizer's decisions and are what commit uses.
 */
export interface ScanEntryRow {
  id: string;
  sessionId: string;
  organizerId: string;
  seq: number;
  source: ScanEntrySource;
  clientEntryId: string | null;
  placementId: string | null;
  imageSha256: string | null;
  providerId: string | null;
  attempts: number;
  readGame: string | null;
  readName: string | null;
  readSetCode: string | null;
  readSetName: string | null;
  readCollectorNumber: string | null;
  readLanguage: string | null;
  readFinish: string | null;
  readScryfallId: string | null;
  readConfidence: number | null;
  readQuantity: number | null;
  suggestedConditionCode: string | null;
  suggestedGrader: string | null;
  suggestedGrade: string | null;
  suggestedCertNumber: string | null;
  suggestionSource: string | null;
  resolution: ResolutionStatus;
  resolutionNote: string | null;
  game: string;
  printingId: string | null;
  acceptAsTyped: boolean;
  cardName: string | null;
  setCode: string | null;
  setName: string | null;
  collectorNumber: string | null;
  language: string | null;
  finish: string | null;
  conditionCode: string | null;
  grader: string | null;
  grade: string | null;
  certNumber: string | null;
  quantity: number;
  price: number | null;
  status: ScanEntryStatus;
  errorCode: string | null;
  suspectDuplicateOf: string | null;
  committedBatchId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Session level defaults the organizer chose up front (ADR-138 section 3.6). Both are null unless chosen. */
export interface ScanSessionDefaults {
  defaultConditionCode: string | null;
  defaultFinish: string | null;
}

/** The entry as the queue renders it (ADR-138 section 9). The frontend never computes any of this itself. */
export interface ScanEntryDto {
  id: string;
  seq: number;
  source: ScanEntrySource;
  status: ScanEntryStatus;
  needs: ScanNeed[];
  read: {
    game: string | null;
    name: string | null;
    setCode: string | null;
    setName: string | null;
    collectorNumber: string | null;
    language: string | null;
    finish: string | null;
    confidence: number | null;
  } | null;
  /** Never applied without an organizer action. */
  suggested: {
    conditionCode: string | null;
    grader: string | null;
    grade: string | null;
    certNumber: string | null;
    source: string | null;
  } | null;
  resolution: {
    status: ResolutionStatus;
    note: string | null;
    agreement: ResolutionAgreement;
    printingId: string | null;
    candidates: CandidateDto[];
    truncated: boolean;
  };
  chosen: {
    game: string;
    printingId: string | null;
    acceptAsTyped: boolean;
    cardName: string | null;
    setCode: string | null;
    setName: string | null;
    collectorNumber: string | null;
    language: string | null;
    finish: string | null;
    conditionCode: string | null;
    grader: string | null;
    grade: string | null;
    certNumber: string | null;
    quantity: number;
    price: number | null;
  };
  /** The computeDedupKey result, so the queue can group identical cards. */
  groupKey: string | null;
  suspectDuplicateOf: string | null;
  errorCode: string | null;
  updatedAt: string;
}

/** Why an entry was left out of a commit. */
export type ScanNotCommittedReason = ScanNeed | 'SUSPECT_REPEAT' | 'INVALID_DETAILS' | 'PRINTING_NOT_FOUND';

export interface ScanNotCommitted {
  entryId: string;
  reason: ScanNotCommittedReason;
}
