/**
 * priceBookRules (ADR-140 batch B6): the pure display logic of the Price Book screens. Money parsing and formatting, the
 * plain sentence for a rule (section 11.2), the preview summary and rate gap lines (sections 8.3 and 11.5), and the
 * "Why this price" view model (section 11.6).
 *
 * No React, no axios, no env reads, no clock, no network. Every function that needs "now" is given it. Covered by
 * lib/__tests__/priceBookRules.test.ts. Run: npm test   (node:test through tsx)
 *
 * The browser does no pricing arithmetic. The only numbers computed here are display math: cents to a "$12.00" string, a
 * percent gap shown from two numbers it was given, and a count of rows ticked by default. Which price to charge, which rule
 * applied and why all come from the server (ADR-140 sections 2 and 10).
 */
import type { PriceBookResultBlock, PriceBookRuleFields, PriceBookRunItem, RunCounts, RunProgress } from './priceBook';
import {
  PRICE_BOOK_COPY,
  RULE_COPY,
  RULE_FINISH_WORDS,
  RULE_GAME_WORDS,
  RULE_LANGUAGE_WORDS,
  RULE_RARITY_WORDS,
  RULE_VARIANT_WORDS,
  RUN_ITEM_STATE_LABELS,
  SOURCE_PHRASES,
  failureText,
  lookupWord,
  reviewReasonText,
  roundPhrase,
  skipReasonText,
  sourceLabel,
  warningText,
} from './priceBookCopy';

// ---------------------------------------------------------------------------
// Money, percent and dates
// ---------------------------------------------------------------------------

/** The largest amount a field accepts: $1,000,000.00. */
export const MAX_MONEY_CENTS = 100_000_000;

/**
 * What a person typed in a money field, as whole cents. Accepts "12", "12.5", "12.50", "$1,234.50", ".5" and a plain number
 * with at most two decimals. Returns null for anything else: empty text, a minus sign, letters, three decimals, bad commas
 * ("1,23") or more than $1,000,000.00. Zero parses to 0; whether zero is allowed is the screen's decision.
 */
export function parseMoneyToCents(input: unknown): number | null {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return null;
    const cents = Math.round(input * 100);
    if (Math.abs(input * 100 - cents) > 1e-6) return null;
    return cents > MAX_MONEY_CENTS ? null : cents;
  }
  if (typeof input !== 'string') return null;
  let t = input.trim();
  if (t.charAt(0) === '$') t = t.slice(1).trim();
  if (!t) return null;
  const m = /^(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d{1,2}))?$/.exec(t);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  const whole = m[1] !== undefined ? m[1].replace(/,/g, '') : '0';
  if (whole.length > 9) return null;
  const frac = m[2] !== undefined ? parseInt((m[2] + '0').slice(0, 2), 10) : 0;
  const cents = parseInt(whole, 10) * 100 + frac;
  return cents > MAX_MONEY_CENTS ? null : cents;
}

/** Whole cents as "$12.00" (commas for thousands, "-$1.50" for a negative). Anything that is not a finite number gives "". */
export function formatMoney(cents: number | null | undefined): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '';
  const rounded = Math.round(cents);
  const abs = Math.abs(rounded);
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${rounded < 0 ? '-' : ''}$${grouped}.${rest < 10 ? '0' : ''}${rest}`;
}

/** Basis points as a percent number: 9500 gives "95", 9550 gives "95.5". The word "percent" comes from the copy. */
export function formatBps(bps: number | null | undefined): string {
  if (typeof bps !== 'number' || !Number.isFinite(bps)) return '';
  const p = bps / 100;
  return Number.isInteger(p) ? String(p) : p.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/** "95", "95.5" or "95%" as basis points (9500, 9550). At most two decimals and at most 1000 percent; anything else is null. */
export function parsePercentToBps(input: unknown): number | null {
  if (typeof input !== 'string') return null;
  const m = /^(\d{1,4})(?:\.(\d{1,2}))?\s*%?$/.exec(input.trim());
  if (!m) return null;
  const whole = parseInt(m[1], 10);
  if (whole > 1000) return null;
  const frac = m[2] !== undefined ? parseInt((m[2] + '0').slice(0, 2), 10) : 0;
  return whole * 100 + frac;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Oct 3". Dates are shown in UTC so the same value reads the same everywhere. */
export function formatShortDate(iso: string | null | undefined): string {
  const d = parseDate(iso);
  return d ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` : '';
}

/** "Oct 3, 2026". */
export function formatLongDate(iso: string | null | undefined): string {
  const d = parseDate(iso);
  return d ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}` : '';
}

/** A change from the server as "+12.5 percent" or "-3 percent". Empty when there is no number. */
export function formatChangePercent(p: number | null | undefined): string {
  if (typeof p !== 'number' || !Number.isFinite(p)) return '';
  const rounded = Math.round(p * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${rounded > 0 ? '+' : ''}${text} percent`;
}

// ---------------------------------------------------------------------------
// describeRule (section 11.2)
// ---------------------------------------------------------------------------

/** The fields of a rule that the sentence reads. Every one is optional so a half-filled editor form can be described too. */
export type RuleDescribable = Partial<PriceBookRuleFields> & { family?: string | null };

function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function present(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * One plain sentence for a rule, for example:
 * "Rare foil cards worth $1.00 to $9.99: start from your typed price or your recent sales, price at 95 percent, round to
 * the nearest 25 cents, never go below $0.99."
 */
export function describeRule(rule: RuleDescribable): string {
  const buylist = rule.family === 'BUYLIST';

  const words: string[] = [];
  if (present(rule.game)) words.push(lookupWord(RULE_GAME_WORDS, rule.game, rule.game.trim()));
  if (present(rule.variantToken) && rule.variantToken !== 'NONE') {
    words.push(lookupWord(RULE_VARIANT_WORDS, rule.variantToken, rule.variantToken.toLowerCase()));
  }
  if (present(rule.rarityText)) words.push(rule.rarityText.trim().toLowerCase());
  else if (present(rule.rarityClass)) words.push(lookupWord(RULE_RARITY_WORDS, rule.rarityClass, ''));
  if (present(rule.finish) && rule.finish !== 'ANY') words.push(lookupWord(RULE_FINISH_WORDS, rule.finish, rule.finish.toLowerCase()));
  const parts: string[] = [];
  parts.push(words.filter((w) => w.length > 0).length > 0 ? `${words.filter((w) => w.length > 0).join(' ')} ${RULE_COPY.cardsNoun}` : RULE_COPY.allCards);
  if (rule.variantToken === 'NONE') parts.push(RULE_COPY.noVariant);
  if (present(rule.setCode)) parts.push(RULE_COPY.fromSet(rule.setCode.trim().toUpperCase()));
  if (present(rule.language)) parts.push(RULE_COPY.inLanguage(lookupWord(RULE_LANGUAGE_WORDS, rule.language, rule.language.trim().toUpperCase())));
  const min = typeof rule.refMinCents === 'number' ? rule.refMinCents : null;
  const max = typeof rule.refMaxCents === 'number' ? rule.refMaxCents : null;
  if (min !== null && max !== null) parts.push(RULE_COPY.worthBetween(formatMoney(min), formatMoney(max)));
  else if (min !== null) parts.push(RULE_COPY.worthAtLeast(formatMoney(min)));
  else if (max !== null) parts.push(RULE_COPY.worthUpTo(formatMoney(max)));
  const subject = capitalize(parts.join(' '));

  const clauses: string[] = [];
  const basis = rule.basis || 'REFERENCE';
  if (basis === 'REFERENCE') {
    const phrases = (rule.sourceKinds || []).map((k) => lookupWord(SOURCE_PHRASES, k, '')).filter((p) => p.length > 0);
    clauses.push(phrases.length > 0 ? RULE_COPY.startFromList(RULE_COPY.listJoin(phrases)) : RULE_COPY.startFromFirst);
  } else if (basis === 'RETAIL_PRICE') {
    clauses.push(RULE_COPY.startFromShelf);
  } else if (basis === 'COST_PLUS') {
    clauses.push(RULE_COPY.startFromCost);
  } else if (basis === 'BULK_RATE') {
    clauses.push(RULE_COPY.startFromRateCard);
  } else if (basis === 'FIXED_CENTS') {
    const price = formatMoney(typeof rule.fixedCents === 'number' ? rule.fixedCents : 0);
    clauses.push(buylist ? RULE_COPY.payFixed(price) : RULE_COPY.fixedPrice(price));
  } else {
    clauses.push(RULE_COPY.startFromFirst);
  }

  const percentBps = typeof rule.percentBps === 'number' ? rule.percentBps : 10000;
  if (!(basis === 'FIXED_CENTS' && percentBps === 10000)) {
    clauses.push(buylist ? RULE_COPY.payAt(formatBps(percentBps)) : RULE_COPY.priceAt(formatBps(percentBps)));
  }
  const add = typeof rule.addCents === 'number' ? rule.addCents : 0;
  if (add > 0) clauses.push(RULE_COPY.addAmount(formatMoney(add)));
  if (add < 0) clauses.push(RULE_COPY.takeOffAmount(formatMoney(-add)));
  if (typeof rule.minMarginBps === 'number' && rule.minMarginBps > 0) clauses.push(RULE_COPY.marginAtLeast(formatBps(rule.minMarginBps)));

  // A buy rule with no rounding of its own rounds down, so the shop never pays more than its own percent (ADR-140 section 7).
  const mode = rule.roundingMode || (buylist ? 'TIERED' : null);
  const direction = rule.roundingDirection || (buylist ? 'DOWN' : null);
  clauses.push(roundPhrase(mode, direction));

  if (typeof rule.floorCents === 'number') clauses.push(RULE_COPY.neverBelow(formatMoney(rule.floorCents)));
  if (typeof rule.ceilingCents === 'number') clauses.push(RULE_COPY.neverAbove(formatMoney(rule.ceilingCents)));
  if (buylist && typeof rule.creditBps === 'number') clauses.push(RULE_COPY.creditAt(formatBps(rule.creditBps)));
  if (buylist && typeof rule.minOfferCents === 'number') clauses.push(RULE_COPY.minOffer(formatMoney(rule.minOfferCents)));

  return `${subject}: ${clauses.join(', ')}.`;
}

// ---------------------------------------------------------------------------
// Run preview and apply text (sections 10.2 and 11.5)
// ---------------------------------------------------------------------------

/** "128 prices will change, 311 stay the same, 24 are skipped, 9 need a look." */
export function describePreviewSummary(counts: Pick<RunCounts, 'changes' | 'unchanged' | 'skipped' | 'review'>): string {
  return PRICE_BOOK_COPY.previewSummary(counts.changes, counts.unchanged, counts.skipped, counts.review);
}

/** How many rows are ticked by default: the changes that do not need a look (the server leaves review rows unticked). */
export function defaultSelectedCount(counts: Pick<RunCounts, 'changes' | 'review'>): number {
  return Math.max(0, counts.changes - counts.review);
}

export function describeApplyButton(selected: number): string {
  return PRICE_BOOK_COPY.apply(Math.max(0, selected));
}

export function describeApplyConfirm(selected: number): string {
  return PRICE_BOOK_COPY.applyConfirm(Math.max(0, selected));
}

/** The final line after apply: "Applied 119 prices." plus the note about cards that changed after the preview. */
export function describeApplyOutcome(p: Pick<RunProgress, 'applied' | 'changedSince' | 'failed'>): string[] {
  const lines = [PRICE_BOOK_COPY.applied(p.applied)];
  if (p.changedSince > 0) lines.push(PRICE_BOOK_COPY.changedSince(p.changedSince));
  if (p.failed > 0) lines.push(PRICE_BOOK_COPY.failedRows(p.failed));
  return lines;
}

/** The final line after undo: "Undid 119 prices." plus "3 cards were changed by hand since, so we left them alone." */
export function describeUndoOutcome(p: Pick<RunProgress, 'undone' | 'undoSkipped'>): string[] {
  const lines = [PRICE_BOOK_COPY.undone(p.undone)];
  if (p.undoSkipped > 0) lines.push(PRICE_BOOK_COPY.undoSkipped(p.undoSkipped));
  return lines;
}

/** True when the preview's own expiry time has passed. A missing or unreadable time is not stale. */
export function isPreviewStale(expiresAt: string | null | undefined, now: Date): boolean {
  const d = parseDate(expiresAt);
  return d !== null && now.getTime() >= d.getTime();
}

/** The status cell of a run row: the reason it was left out, else the state. */
export function runItemStatusText(item: Pick<PriceBookRunItem, 'state' | 'skipReason'>): string {
  const reason = skipReasonText(item.skipReason);
  if (reason) return reason;
  return lookupWord(RUN_ITEM_STATE_LABELS, item.state, '');
}

// ---------------------------------------------------------------------------
// Rate card text (sections 8.3 and 11.3)
// ---------------------------------------------------------------------------

/**
 * "You: $8.00 per 1,000. Noted: $10.00 per 1,000 (Oct 12). You are 20 percent lower."
 * The percent is display math from the two numbers given. Empty when there is no noted rate to compare with.
 */
export function describeRateGap(opts: {
  youCents: number | null | undefined;
  themCents: number | null | undefined;
  unit?: string | null;
  asOf?: string | null;
}): string {
  const you = opts.youCents;
  const them = opts.themCents;
  if (typeof you !== 'number' || typeof them !== 'number' || !Number.isFinite(you) || !Number.isFinite(them)) return '';
  if (you < 0 || them <= 0) return '';
  const unitWords = opts.unit === 'PER_CARD' ? 'per card' : 'per 1,000';
  const date = formatShortDate(opts.asOf);
  if (you === them) return PRICE_BOOK_COPY.rateGapSame(formatMoney(you), formatMoney(them), unitWords, date);
  const gap = Math.round((Math.abs(you - them) / them) * 100);
  const percent = gap < 1 ? 'less than 1' : String(gap);
  return PRICE_BOOK_COPY.rateGap(formatMoney(you), formatMoney(them), unitWords, date, percent, you < them ? 'lower' : 'higher');
}

/**
 * A warning for each rate that moved by more than half in one save (catches 8.00 typed as 800.00). The shop still decides.
 * Rows with no old or no new rate are not compared.
 */
export function rateChangeWarnings(changes: Array<{ label: string; oldCents: number | null; newCents: number | null }>): string[] {
  const out: string[] = [];
  changes.forEach((c) => {
    if (typeof c.oldCents !== 'number' || typeof c.newCents !== 'number' || c.oldCents <= 0 || c.newCents <= 0) return;
    if (Math.abs(c.newCents - c.oldCents) * 2 > c.oldCents) {
      out.push(PRICE_BOOK_COPY.rateJump(c.label, formatMoney(c.oldCents), formatMoney(c.newCents)));
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// WhyThisPrice view model (section 11.6)
// ---------------------------------------------------------------------------

export interface WhyThisPriceView {
  /** True when the server gave a number. */
  ok: boolean;
  buttonLabel: string;
  /** "Suggested price: $10.25", or the plain reason there is no number. */
  headline: string;
  priceText: string;
  sourceLabel: string;
  /** "Your typed price (Oct 3)". */
  basedOn: string;
  /** "Your typed price, Oct 3." for the one-line provenance under the Price field. */
  provenanceText: string;
  referenceText: string;
  ruleText: string;
  traceLines: string[];
  warnings: string[];
  reviewNotes: string[];
  /** Set when the price is locked or was changed by hand recently. The number is still shown. */
  lockedText: string;
  /** The server's own plain-words explanation. */
  why: string;
  applyAllowed: boolean;
}

function uniq(list: string[]): string[] {
  const out: string[] = [];
  list.forEach((s) => {
    if (s && out.indexOf(s) < 0) out.push(s);
  });
  return out;
}

/** Everything the popover shows, taken from the response and nothing else. Returns null when there is no price book block. */
export function buildWhyThisPrice(block: PriceBookResultBlock | null | undefined): WhyThisPriceView | null {
  if (!block || typeof block !== 'object' || typeof block.ok !== 'boolean') return null;
  const hasPrice = block.ok && typeof block.priceCents === 'number' && Number.isFinite(block.priceCents);
  const priceText = hasPrice ? formatMoney(block.priceCents) : '';
  const label = sourceLabel(block.priceSource);
  const date = formatShortDate(block.priceAsOf);
  const basedLabel = (typeof block.referenceLabel === 'string' && block.referenceLabel) || label;
  const warnings = uniq(
    (Array.isArray(block.warnings) ? block.warnings : []).map((w) => (w && typeof w.code === 'string' ? warningText(w.code, w.message) : ''))
  );
  const review = block.review && typeof block.review === 'object' ? block.review : null;
  const reviewNotes = uniq(
    (review && Array.isArray(review.reasons) ? review.reasons : [])
      .map((r) => reviewReasonText(r, review ? review.movePercent : null))
      .filter((t) => warnings.indexOf(t) < 0)
  );
  const trace = (Array.isArray(block.trace) ? block.trace : []).map((t) => {
    const after = formatMoney(t.afterCents);
    return after ? `${t.label}: ${after}` : t.label;
  });
  let lockedText = '';
  if (block.lockedReason === 'PIN') lockedText = PRICE_BOOK_COPY.lockedNotApplied;
  if (block.lockedReason === 'RECENT_EDIT') lockedText = PRICE_BOOK_COPY.recentEditNoDate;
  const rule = block.rule && typeof block.rule === 'object' ? block.rule : null;
  const headline = hasPrice ? PRICE_BOOK_COPY.headline(priceText) : failureText(block.code);
  const serverWhy = typeof block.why === 'string' ? block.why.trim() : '';
  return {
    ok: hasPrice,
    buttonLabel: PRICE_BOOK_COPY.whyButton,
    headline,
    priceText,
    sourceLabel: hasPrice ? label : '',
    basedOn: hasPrice && basedLabel ? PRICE_BOOK_COPY.basedOnLine(basedLabel, date) : '',
    provenanceText: hasPrice && label ? PRICE_BOOK_COPY.provenanceSet(label, date) : '',
    referenceText:
      hasPrice && typeof block.referenceCents === 'number' && block.referenceCents > 0 ? PRICE_BOOK_COPY.referenceWorth(formatMoney(block.referenceCents)) : '',
    ruleText: hasPrice && rule ? (rule.isDefault ? PRICE_BOOK_COPY.ruleDefault : rule.name) : '',
    traceLines: hasPrice ? trace : [],
    warnings,
    reviewNotes: hasPrice ? reviewNotes : [],
    lockedText,
    why: serverWhy || (hasPrice ? '' : headline),
    applyAllowed: block.applyAllowed === true,
  };
}
