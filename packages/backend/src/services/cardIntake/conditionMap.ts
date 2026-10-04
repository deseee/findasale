/**
 * Condition mapping (ADR-134 section 4.5 step A). The same words mean different grades in different
 * tools, so a source value is mapped EXACT only when its meaning is not in doubt; every other value is
 * REVIEW with a proposal, and the seller confirms the table once. A value that is not confirmed is
 * NEVER turned into Near Mint (the row fails with CONDITION_UNMAPPED instead).
 *
 * Proposals follow the scales in the ADR (ManaBox: excellent and good to LP, light_played to MP, played
 * to HP, poor to DMG; Moxfield: Good (Lightly Played) to LP, Played to MP, Heavily Played to HP,
 * Damaged to DMG). They are proposals, never applied silently.
 */
import { CARD_CONDITION_CODES, CARD_CONDITION_LABELS, canonicalizeVocabValue } from '../../constants/cardVocabulary';
import type { CardConditionCode } from '../../constants/cardVocabulary';
import type { ConditionScale } from './importers/shared';

export type ConditionConfidence = 'EXACT' | 'REVIEW';

export interface ConditionProposal {
  proposed: CardConditionCode | null;
  confidence: ConditionConfidence;
}

/** Lookup key for a source condition string: trimmed, lower case, inner whitespace collapsed. */
export function conditionKey(value: string): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const TCGPLAYER_WORDS: Record<string, CardConditionCode> = {
  'near mint': 'NM',
  'lightly played': 'LP',
  'moderately played': 'MP',
  'heavily played': 'HP',
  damaged: 'DMG',
};

const MANABOX_EXACT: Record<string, CardConditionCode> = { mint: 'NM', near_mint: 'NM' };
const MANABOX_REVIEW: Record<string, CardConditionCode> = {
  excellent: 'LP',
  good: 'LP',
  light_played: 'MP',
  played: 'HP',
  poor: 'DMG',
};

const MOXFIELD_EXACT: Record<string, CardConditionCode> = { mint: 'NM', 'near mint': 'NM' };
const MOXFIELD_REVIEW: Record<string, CardConditionCode> = {
  'good (lightly played)': 'LP',
  played: 'MP',
  'heavily played': 'HP',
  damaged: 'DMG',
};

/** Proposals for a generic file: vocabulary codes and the TCGplayer words are exact; the rest is for review. */
const GENERIC_REVIEW: Record<string, CardConditionCode> = {
  mint: 'NM',
  'near mint': 'NM',
  nm: 'NM',
  excellent: 'LP',
  'lightly played': 'LP',
  'light played': 'LP',
  'slightly played': 'LP',
  good: 'MP',
  played: 'MP',
  'moderately played': 'MP',
  poor: 'HP',
  'heavily played': 'HP',
  damaged: 'DMG',
};

export function proposeCondition(scale: ConditionScale, sourceValue: string): ConditionProposal {
  const key = conditionKey(sourceValue);
  const tcg = TCGPLAYER_WORDS[key];
  switch (scale) {
    case 'tcgplayer':
      if (tcg) return { proposed: tcg, confidence: 'EXACT' };
      break;
    case 'manabox': {
      const exact = MANABOX_EXACT[key];
      if (exact) return { proposed: exact, confidence: 'EXACT' };
      const review = MANABOX_REVIEW[key];
      if (review) return { proposed: review, confidence: 'REVIEW' };
      break;
    }
    case 'moxfield': {
      const exact = MOXFIELD_EXACT[key];
      if (exact) return { proposed: exact, confidence: 'EXACT' };
      const review = MOXFIELD_REVIEW[key];
      if (review) return { proposed: review, confidence: 'REVIEW' };
      break;
    }
    case 'generic': {
      const code = canonicalizeVocabValue(CARD_CONDITION_CODES, key);
      if (code) return { proposed: code, confidence: 'EXACT' };
      if (tcg) return { proposed: tcg, confidence: 'EXACT' };
      const review = GENERIC_REVIEW[key];
      if (review) return { proposed: review, confidence: 'REVIEW' };
      break;
    }
  }
  return { proposed: null, confidence: 'REVIEW' };
}

export function conditionLabel(code: string | null): string | null {
  if (!code) return null;
  return (CARD_CONDITION_LABELS as Record<string, string>)[code] ?? null;
}

/** What the seller sent for one condition line. null means "leave the condition blank". */
export type ConditionChoice = CardConditionCode | null;
export type ConditionChoices = Map<string, ConditionChoice>;

/**
 * Parses the confirm body's conditionMapping object ({ "<source value>": "NM" | null }).
 * Keys are matched with conditionKey. Returns null when any entry is not a valid condition code.
 */
export function parseConditionChoices(raw: unknown): ConditionChoices | null {
  const out: ConditionChoices = new Map();
  if (raw === undefined || raw === null || raw === '') return out;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const [source, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === null) {
      out.set(conditionKey(source), null);
      continue;
    }
    const code = canonicalizeVocabValue(CARD_CONDITION_CODES, value);
    if (!code) return null;
    out.set(conditionKey(source), code);
  }
  return out;
}

export type ConditionResolution =
  | { ok: true; code: CardConditionCode | null; blank: boolean }
  | { ok: false };

/**
 * Resolves a row's condition cell.
 *  - Blank or absent cell: the seller's explicit default condition, else blank (null). Never Near Mint by assumption.
 *  - strict (confirm): the seller's choice for that source value, else an EXACT proposal, else NOT resolved.
 *  - preview: the seller's choice if any, else the proposal (REVIEW lines are shown, not decided).
 */
export function resolveCondition(
  scale: ConditionScale,
  sourceValue: string,
  choices: ConditionChoices,
  defaultCondition: CardConditionCode | null,
  strict: boolean
): ConditionResolution {
  const raw = String(sourceValue ?? '').trim();
  if (raw === '') return { ok: true, code: defaultCondition, blank: true };
  const key = conditionKey(raw);
  if (choices.has(key)) return { ok: true, code: choices.get(key) ?? null, blank: false };
  const proposal = proposeCondition(scale, raw);
  if (proposal.proposed && (proposal.confidence === 'EXACT' || !strict)) {
    return { ok: true, code: proposal.proposed, blank: false };
  }
  if (!strict) return { ok: true, code: null, blank: false };
  return { ok: false };
}
