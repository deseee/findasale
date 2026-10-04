/**
 * Card label text assembly (ADR-134 section 6, batch B6).
 *
 * Pure functions, no I/O. The label composer reads the ItemCard row and the Item price from the
 * database, then calls buildCardLabelText to get the lines printed on a card label. Nothing here
 * trusts the browser: every string is data from the database (which in turn came from uploaded
 * files, so it is treated as untrusted) and every string that reaches HTML goes through escapeHtml.
 *
 * Layout of one card label (Avery 5160 cell), right of the QR code, top to bottom:
 *   price (largest) | card name (one line, truncated) | SETCODE #number  FINISH | NM or PSA 10
 * The grading cert number is not printed (no room in the cell, it is on the listing).
 */

/** Longest card name printed on a label, including the ellipsis. */
export const CARD_LABEL_NAME_MAX = 28;

/** Printed in place of the price when the item has no price. A visible marker beats a blank shelf tag. */
export const CARD_LABEL_PRICE_MISSING = 'PRICE?';

export interface CardLabelSource {
  cardName?: string | null;
  setCode?: string | null;
  collectorNumber?: string | null;
  finish?: string | null;
  conditionCode?: string | null;
  grader?: string | null;
  grade?: string | null;
}

export interface CardLabelText {
  /** "$12.50" or "PRICE?" */
  price: string;
  priceMissing: boolean;
  /** Card name, at most CARD_LABEL_NAME_MAX characters. */
  name: string;
  /** "SETCODE #number  FINISH" (two spaces before the finish), parts omitted when unknown. */
  setLine: string;
  /** "PSA 10" for a graded card, the condition code ("NM") otherwise, empty when neither is known. */
  conditionLine: string;
}

/** Escape a value for safe interpolation into HTML text or a double-quoted attribute. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Collapse control characters and runs of whitespace so one card never prints on two lines. */
function cleanText(value: string | null | undefined): string {
  if (value == null) return '';
  // eslint-disable-next-line no-control-regex
  return String(value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** "$12.50", or "PRICE?" when the price is null, not finite or negative. */
export function formatLabelPrice(price: number | null | undefined): string {
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return CARD_LABEL_PRICE_MISSING;
  return `$${price.toFixed(2)}`;
}

/** Truncate to `max` characters in total, the last one being an ellipsis. Counts code points. */
export function truncateLabelName(name: string, max: number = CARD_LABEL_NAME_MAX): string {
  const chars = Array.from(cleanText(name));
  if (chars.length <= max) return chars.join('');
  return chars.slice(0, Math.max(1, max - 1)).join('').trimEnd() + '…';
}

/** Finish text for the label. Non-foil and unknown print nothing; FOIL, ETCHED, HOLO print in capitals. */
export function formatFinishForLabel(finish: string | null | undefined): string {
  const f = cleanText(finish).toUpperCase().replace(/[\s-]+/g, '_');
  if (!f || f === 'NONFOIL' || f === 'NON_FOIL' || f === 'NORMAL') return '';
  return f.replace(/_/g, ' ');
}

/** Grader and grade ("PSA 10"), else the condition code ("NM"), else empty. The cert number is never printed. */
export function formatConditionLine(card: CardLabelSource): string {
  const grader = cleanText(card.grader).toUpperCase();
  const grade = cleanText(card.grade);
  if (grader && grade) return `${grader} ${grade}`;
  if (grader) return grader;
  return cleanText(card.conditionCode).toUpperCase();
}

/**
 * Assemble the printed text for one card label.
 * @param card the ItemCard row read from the database
 * @param price Item.price read from the database (never a client value)
 * @param fallbackName Item.title, used when the card record has no card name
 */
export function buildCardLabelText(
  card: CardLabelSource,
  price: number | null | undefined,
  fallbackName?: string | null
): CardLabelText {
  const priceText = formatLabelPrice(price);
  const name = truncateLabelName(cleanText(card.cardName) || cleanText(fallbackName));

  const setCode = cleanText(card.setCode).toUpperCase();
  const number = cleanText(card.collectorNumber);
  const base = [setCode, number ? `#${number}` : ''].filter(Boolean).join(' ');
  const finish = formatFinishForLabel(card.finish);
  const setLine = finish ? (base ? `${base}  ${finish}` : finish) : base;

  return {
    price: priceText,
    priceMissing: priceText === CARD_LABEL_PRICE_MISSING,
    name,
    setLine,
    conditionLine: formatConditionLine(card),
  };
}

/** HTML for the right-hand text block of a card label. Every field is escaped. */
export function renderCardLabelTextHtml(text: CardLabelText): string {
  return (
    '<div class="label-text card-text">' +
    `<div class="card-price">${escapeHtml(text.price)}</div>` +
    `<div class="card-name">${escapeHtml(text.name)}</div>` +
    `<div class="card-set">${escapeHtml(text.setLine)}</div>` +
    `<div class="card-cond">${escapeHtml(text.conditionLine)}</div>` +
    '</div>'
  );
}
