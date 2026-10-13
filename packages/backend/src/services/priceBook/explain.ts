/**
 * Trace to plain words (ADR-140 section 10.1). Pure and deterministic: the same suggestion always gives the same text, and
 * the text is built only from the fields of the suggestion (no clock, no env). The frontend shows this text and the trace
 * lines; it computes nothing.
 *
 * Example: "Based on your typed price of $12.00 (Oct 3). Rule: Rares over $5. 95 percent, Lightly Played at 90 percent,
 * rounded to the nearest 25 cents."
 */
import { COPY, SOURCE_LABELS, failureText, formatCentsUsd, formatShortDate, lowerFirst, upperFirst } from './messages';
import type { PriceSuggestion, TraceStep } from './types';

export type ExplainSubject = Pick<
  PriceSuggestion,
  'ok' | 'code' | 'family' | 'priceSource' | 'priceAsOf' | 'referenceLabel' | 'rule' | 'trace' | 'lockedReason' | 'warnings' | 'creditCents'
>;

/** The steps that read as part of the "how" sentence. Reference steps are covered by the "Based on" sentence. */
const HOW_STEPS: readonly TraceStep[] = [
  'PERCENT',
  'CONDITION',
  'LANGUAGE',
  'ADD',
  'COST_FLOOR',
  'FLOOR_APPLIED',
  'CEILING_APPLIED',
  'ROUND',
  'CLAMP_AFTER_ROUND',
  'RESULT_FLOOR',
];

/** Steps whose label starts with a name or a number and so is used as written. */
const VERBATIM_STEPS: readonly TraceStep[] = ['PERCENT', 'CONDITION'];

function basedOnSentence(s: ExplainSubject): string | null {
  const first = s.trace[0];
  if (!s.priceSource || !first || first.afterCents === null) return null;
  const usd = formatCentsUsd(first.afterCents);
  const label = s.referenceLabel ?? SOURCE_LABELS[s.priceSource];
  const date = formatShortDate(s.priceAsOf);
  const when = date ? ` (${date})` : '';
  if (first.step === 'RETAIL_PRICE') return `Based on your shelf price of ${usd}, which starts from ${lowerFirst(label)}.`;
  if (s.priceSource === 'RATE_CARD') return `Based on your bulk rate card: ${usd}.`;
  if (s.priceSource === 'FIXED_RULE') return `Fixed price from your rule: ${usd}.`;
  if (s.priceSource === 'COST') return `Based on your cost of ${usd}.`;
  return `Based on ${lowerFirst(label)} of ${usd}${when}.`;
}

export function explain(s: ExplainSubject): string {
  if (!s.ok) {
    const base = failureText(s.code ?? 'INVALID_INPUT', s.family);
    const notes = s.warnings.filter((w) => w.code === 'REFERENCE_TOO_OLD').map((w) => w.message);
    return [base, ...notes].join(' ');
  }
  const sentences: string[] = [];
  const based = basedOnSentence(s);
  if (based) sentences.push(based);
  if (s.rule) sentences.push(`Rule: ${s.rule.isDefault ? COPY.defaultRuleName : s.rule.name}.`);

  const how = s.trace
    .filter((t) => HOW_STEPS.includes(t.step) && t.label !== '')
    .map((t) => (VERBATIM_STEPS.includes(t.step) ? t.label : lowerFirst(t.label)));
  if (how.length > 0) sentences.push(`${upperFirst(how.join(', '))}.`);

  if (s.creditCents !== undefined && s.creditCents !== null) sentences.push(`Store credit offer: ${formatCentsUsd(s.creditCents)}.`);
  if (s.lockedReason === 'PIN') sentences.push(COPY.locked);
  else if (s.lockedReason === 'RECENT_EDIT') sentences.push(COPY.recentEditNoDate);
  return sentences.join(' ');
}
