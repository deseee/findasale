/**
 * Readiness of one scan entry (ADR-138 sections 3.6 and 9). Pure: no database, no I/O.
 *
 * An entry is READY only when the organizer's decisions are complete:
 *  - it is identified: a printing is chosen, or the organizer accepted the typed details with a name;
 *  - the finish is known whenever the chosen printing comes in more than one finish;
 *  - the condition is known, or the card is graded (grading company plus grade).
 *
 * A suggestion from a photo or from Delver NEVER counts as a decision: this module never reads the suggested*
 * fields and never copies one into conditionCode. The only way a condition or finish appears without the
 * organizer typing it on that row is a session default the organizer chose up front.
 */
import {
  CARD_CONDITION_CODES,
  CARD_FINISHES,
  CARD_GAMES,
  CARD_GRADERS,
  CARD_GRADES,
  canonicalizeVocabValue,
} from '../../constants/cardVocabulary';
import type { CardConditionCode, CardFinish, CardGrade, CardGrader } from '../../constants/cardVocabulary';
import { MAX_QUANTITY } from '../cardIntake/config';
import { catalogFinishToVocab } from '../cardIntake/normalizeCells';
import type { ScanEntryRow, ScanEntryStatus, ScanNeed, ScanSessionDefaults } from './types';

export const CERT_NUMBER_MAX_CHARS = 30;

export type ReadinessProblem =
  | 'INVALID_GAME'
  | 'INVALID_FINISH'
  | 'INVALID_CONDITION'
  | 'INVALID_GRADER'
  | 'INVALID_GRADE'
  | 'GRADER_WITHOUT_GRADE'
  | 'GRADE_WITHOUT_GRADER'
  | 'CERT_TOO_LONG'
  | 'BAD_QUANTITY'
  | 'PRINTING_NOT_FOUND';

export type ReadinessEntry = Pick<
  ScanEntryRow,
  | 'status'
  | 'printingId'
  | 'acceptAsTyped'
  | 'game'
  | 'cardName'
  | 'finish'
  | 'readFinish'
  | 'conditionCode'
  | 'grader'
  | 'grade'
  | 'certNumber'
  | 'quantity'
  | 'suspectDuplicateOf'
>;

export interface ReadinessContext {
  defaults: ScanSessionDefaults;
  /**
   * The chosen printing as loaded from the catalog, or null when no printing is chosen or it could not be
   * found. Only its finish list is read.
   */
  printing: { finishes: readonly string[] } | null;
}

/** The finish and condition values a commit would use (organizer decision first, then session default, never a suggestion). */
export interface EffectiveValues {
  finish: CardFinish | null;
  conditionCode: CardConditionCode | null;
  graded: boolean;
  grader: CardGrader | null;
  grade: CardGrade | null;
  certNumber: string | null;
}

export interface Readiness {
  status: ScanEntryStatus;
  needs: ScanNeed[];
  problems: ReadinessProblem[];
  /** True while a suspected repeat scan waits for the organizer's decision. */
  held: boolean;
  effective: EffectiveValues;
}

/** Statuses an entry keeps once the organizer or the commit has moved it out of the review flow. */
const FROZEN_STATUSES: readonly ScanEntryStatus[] = ['SKIPPED', 'COMMITTING', 'COMMITTED'];

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/** The distinct vocabulary finishes a printing comes in (unknown finish words are ignored). */
export function availableFinishes(finishes: readonly string[]): Set<CardFinish> {
  const out = new Set<CardFinish>();
  for (const f of finishes) {
    const v = catalogFinishToVocab(f);
    if (v) out.add(v);
  }
  return out;
}

/**
 * The finish a commit would use, or null when none is decided here (the planner then takes the printing's own
 * finish when it has exactly one). The session default applies only when:
 *  - the organizer set no finish on the row,
 *  - the photo did not read the card as foil, etched, holo or reverse holo (a "looks foil" row needs an explicit choice),
 *  - and, when a printing is chosen, that printing comes in more than one finish and includes the default.
 */
export function effectiveFinish(entry: Pick<ReadinessEntry, 'finish' | 'readFinish'>, ctx: ReadinessContext): CardFinish | null {
  const explicit = canonicalizeVocabValue(CARD_FINISHES, entry.finish);
  if (explicit) return explicit;
  if (clean(entry.finish) !== '') return null;
  const def = canonicalizeVocabValue(CARD_FINISHES, ctx.defaults.defaultFinish);
  if (!def) return null;
  const read = canonicalizeVocabValue(CARD_FINISHES, entry.readFinish);
  if (read && read !== 'NONFOIL') return null;
  if (ctx.printing) {
    const available = availableFinishes(ctx.printing.finishes);
    if (available.size <= 1 || !available.has(def)) return null;
  }
  return def;
}

export function computeEffectiveValues(
  entry: Pick<ReadinessEntry, 'finish' | 'readFinish' | 'conditionCode' | 'grader' | 'grade' | 'certNumber'>,
  ctx: ReadinessContext
): EffectiveValues {
  const grader = canonicalizeVocabValue(CARD_GRADERS, entry.grader) ?? null;
  const grade = canonicalizeVocabValue(CARD_GRADES, entry.grade) ?? null;
  const graded = grader !== null && grade !== null;
  const cert = clean(entry.certNumber);
  const condition = graded
    ? null
    : clean(entry.grader) !== ''
      ? null
      : canonicalizeVocabValue(CARD_CONDITION_CODES, entry.conditionCode) ??
        (clean(entry.conditionCode) === '' ? canonicalizeVocabValue(CARD_CONDITION_CODES, ctx.defaults.defaultConditionCode) ?? null : null);
  return {
    finish: effectiveFinish(entry, ctx),
    conditionCode: condition,
    graded,
    grader: graded ? grader : null,
    grade: graded ? grade : null,
    certNumber: graded && cert !== '' ? cert : null,
  };
}

export function computeReadiness(entry: ReadinessEntry, ctx: ReadinessContext): Readiness {
  const effective = computeEffectiveValues(entry, ctx);
  const held = clean(entry.suspectDuplicateOf) !== '';

  if (FROZEN_STATUSES.includes(entry.status)) {
    return { status: entry.status, needs: [], problems: [], held, effective };
  }

  const needs: ScanNeed[] = [];
  const problems: ReadinessProblem[] = [];

  // 1. Identity: a chosen printing, or typed details the organizer accepted.
  if (clean(entry.printingId) !== '') {
    if (!ctx.printing) {
      needs.push('PRINTING');
      problems.push('PRINTING_NOT_FOUND');
    }
  } else if (entry.acceptAsTyped) {
    if (clean(entry.cardName) === '') needs.push('NAME');
    if (!canonicalizeVocabValue(CARD_GAMES, entry.game)) problems.push('INVALID_GAME');
  } else {
    needs.push('PRINTING');
  }

  // 2. Finish: required when the chosen printing comes in more than one finish.
  if (clean(entry.finish) !== '' && !canonicalizeVocabValue(CARD_FINISHES, entry.finish)) problems.push('INVALID_FINISH');
  if (ctx.printing && clean(entry.printingId) !== '') {
    if (availableFinishes(ctx.printing.finishes).size > 1 && effective.finish === null) needs.push('FINISH');
  }

  // 3. Condition, or grading. A suggestion does not count.
  const graderText = clean(entry.grader);
  const gradeText = clean(entry.grade);
  let gradingProblem = false;
  if (graderText !== '') {
    if (!canonicalizeVocabValue(CARD_GRADERS, graderText)) {
      problems.push('INVALID_GRADER');
      gradingProblem = true;
    }
    if (gradeText === '') {
      problems.push('GRADER_WITHOUT_GRADE');
      gradingProblem = true;
    } else if (!canonicalizeVocabValue(CARD_GRADES, gradeText)) {
      problems.push('INVALID_GRADE');
      gradingProblem = true;
    }
  } else if (gradeText !== '') {
    problems.push('GRADE_WITHOUT_GRADER');
    gradingProblem = true;
  }
  if (clean(entry.certNumber).length > CERT_NUMBER_MAX_CHARS) problems.push('CERT_TOO_LONG');
  if (graderText === '' && clean(entry.conditionCode) !== '' && !canonicalizeVocabValue(CARD_CONDITION_CODES, entry.conditionCode)) {
    problems.push('INVALID_CONDITION');
  }
  if (gradingProblem || (!effective.graded && effective.conditionCode === null)) needs.push('CONDITION');

  // 4. Quantity.
  if (!Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > MAX_QUANTITY) problems.push('BAD_QUANTITY');

  const ready = !held && needs.length === 0 && problems.length === 0;
  return { status: ready ? 'READY' : 'NEEDS_REVIEW', needs, problems, held, effective };
}
