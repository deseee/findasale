/*
 * etsyMapping.ts -- pure mapping from a FindA.Sale Item to the Etsy createDraftListing request
 * (ADR-135 D3.2 to D3.4, batch E-B2). No I/O, no env reads, no clock reads, no database, no
 * network, no imports beyond config/etsyWhenMade.ts. Safe to import from anywhere.
 *
 * SPEC EVIDENCE (confirmed 2026-10-03 from https://www.etsy.com/openapi/generated/oas/3.0.0.json,
 * info.version 3.0.0, operation createDraftListing, application/x-www-form-urlencoded):
 *   - required: quantity (integer), title, description, price (number, float; "positive non-zero"),
 *     who_made, when_made, taxonomy_id.
 *   - title: "valid title strings contain only letters, numbers, punctuation marks, mathematical
 *     symbols, whitespace characters, TM, (c), and (R)" with regex /[^\p{L}\p{Nd}\p{P}\p{Sm}\p{Zs}TM(c)(R)]/u
 *     (the three marks are the characters U+2122, U+00A9, U+00AE). "You can only use the %, :, & and +
 *     characters once each."
 *   - tags: letters, numbers, whitespace, hyphen, apostrophe, TM, (c), (R)
 *     (regex /[^\p{L}\p{Nd}\p{Zs}\-'TM(c)(R)]/u). Described as "a comma-separated list".
 *   - materials: letters, numbers, whitespace (regex /[^\p{L}\p{Nd}\p{Zs}]/u).
 *   - item_weight / item_length / item_width / item_height: numbers, "must be greater than 0".
 *   - item_weight_unit enum: oz, lb, g, kg. item_dimensions_unit enum: in, ft, mm, cm, m, yd, inches.
 *   - type enum: physical, download, both. who_made enum: i_did, someone_else, collective.
 *   - should_auto_renew: boolean ("renews a listing for four months upon expiration").
 *   - shipping_profile_id, return_policy_id, readiness_state_id: positive integers, nullable.
 * The spec states NO length or count limits for title, tags, materials or quantity, and does not
 * say how array fields are encoded in a urlencoded body, nor whether price is dollars or minor units.
 * Each of those stays a named constant below, marked UNVERIFIED, pending live test T4 (drafts are
 * free; ADR-135 section 12).
 *
 * Copy rules: no "AI", no "estate sale", no em dashes, no FindA.Sale branding or links in anything
 * sent to Etsy (API Terms Section 5 bars diverting buyers off Etsy). Covered by etsyMapping.test.ts.
 */

import { getEtsyWhenMade, ETSY_WHO_MADE_DEFAULT } from '../../config/etsyWhenMade';

// ---------------------------------------------------------------------------------------------
// Constants the spec does NOT settle. All UNVERIFIED pending live test T4 (ADR-135 section 12).
// ---------------------------------------------------------------------------------------------

/** UNVERIFIED (T4): title length cap. ADR-135 D3.4 states 140. The spec gives no limit. */
export const ETSY_MAX_TITLE_LEN = 140;
/** UNVERIFIED (T4): number of tags per listing. ADR-135 D3.4 states 13. The spec gives no limit. */
export const ETSY_MAX_TAGS = 13;
/** UNVERIFIED (T4): characters per tag. ADR-135 D3.4 states 20. The spec gives no limit. */
export const ETSY_MAX_TAG_LEN = 20;
/** UNVERIFIED (T4): number of materials per listing. Not in the spec or the ADR; mirrors tags. */
export const ETSY_MAX_MATERIALS = 13;
/** UNVERIFIED (T4): characters per material. Not in the spec or the ADR. */
export const ETSY_MAX_MATERIAL_LEN = 45;
/** UNVERIFIED (T4): largest quantity sent in one listing. Not in the spec or the ADR. */
export const ETSY_MAX_QUANTITY = 999;
/**
 * UNVERIFIED (T4): price units on create. The spec says "number, float" for price, but the Etsy
 * tutorial's create example posts price=1000 for a yo-yo. false = send dollars as a decimal string
 * ("12.50"); true = send integer minor units ("1250"). ADR-135 D3.4: dollars as a float.
 */
export const ETSY_PRICE_IN_MINOR_UNITS = false;
/**
 * UNVERIFIED (T4): how array fields (tags, materials) are encoded in the urlencoded body. The spec
 * describes tags as "a comma-separated list", so one field holding values joined by this separator.
 * Safe because the tag and material sanitizers remove commas.
 */
export const ETSY_ARRAY_FIELD_SEPARATOR = ',';

// ---------------------------------------------------------------------------------------------
// Fixed label tables.
// ---------------------------------------------------------------------------------------------

/** ADR-135 D3.2 fixed condition table (Item.condition -> label printed in the description). */
export const ETSY_CONDITION_LABELS: Readonly<Record<string, string>> = {
  NEW: 'New',
  USED: 'Pre-owned',
  REFURBISHED: 'Refurbished',
  PARTS_OR_REPAIR: 'For parts or repair',
};

/**
 * Item.conditionGrade label map (S | A | B | C | D). Mirrors the existing frontend map exactly:
 * packages/frontend/lib/itemConstants.ts CONDITION_MAP (S Like New, A Excellent, B Good, C Fair,
 * D Poor), which is also the inline map in pages/organizer/edit-item/[id].tsx and
 * pages/organizer/add-items/[saleId]/review.tsx. The letter itself is printed as stored.
 */
export const ETSY_GRADE_LABELS: Readonly<Record<string, string>> = {
  S: 'Like New',
  A: 'Excellent',
  B: 'Good',
  C: 'Fair',
  D: 'Poor',
};

/** Card condition codes (ADR-134 section 2.2: ItemCard.conditionCode) -> description label. */
export const ETSY_CARD_CONDITION_LABELS: Readonly<Record<string, string>> = {
  NM: 'Near Mint',
  LP: 'Lightly Played',
  MP: 'Moderately Played',
  HP: 'Heavily Played',
  DMG: 'Damaged',
};

// ---------------------------------------------------------------------------------------------
// Sanitizers. The three character-class regexes are the spec's own, kept in one place.
// ---------------------------------------------------------------------------------------------

// Spec regexes verbatim (the marks are U+2122, U+00A9, U+00AE). Global flag: only ever used with
// String.prototype.replace, which resets lastIndex, never with .test().
const TITLE_DISALLOWED = /[^\p{L}\p{Nd}\p{P}\p{Sm}\p{Zs}™©®]/gu;
const TAG_DISALLOWED = /[^\p{L}\p{Nd}\p{Zs}\-'™©®]/gu;
const MATERIAL_DISALLOWED = /[^\p{L}\p{Nd}\p{Zs}]/gu;

// Characters treated as word separators (turned into a space) in tags and materials.
const LIST_SEPARATORS = /[,;/\\|]/g;
const MATERIAL_SEPARATORS = /[,;/\\|-]/g;

/** Characters Etsy lets through at most once in a title (spec). */
const TITLE_ONCE_ONLY_CHARS = ['%', ':', '&', '+'] as const;

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

/** Truncate to `max` code points (never splits a surrogate pair), then trim trailing space. */
function capCodePoints(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return chars.slice(0, max).join('').trimEnd();
}

/**
 * Title sanitizer: remove every character the spec regex disallows, keep each of % : & + at most
 * once (extra occurrences become a space), collapse whitespace, cap at ETSY_MAX_TITLE_LEN.
 * Whitespace (tabs, newlines) is turned into single spaces BEFORE removal so words do not fuse.
 */
export function sanitizeEtsyTitle(raw: string | null | undefined): string {
  let t = collapseWhitespace(String(raw ?? ''));
  t = t.replace(TITLE_DISALLOWED, '');
  for (const ch of TITLE_ONCE_ONLY_CHARS) {
    let seen = false;
    t = Array.from(t)
      .map((c) => {
        if (c !== ch) return c;
        if (!seen) {
          seen = true;
          return c;
        }
        return ' ';
      })
      .join('');
  }
  return capCodePoints(collapseWhitespace(t), ETSY_MAX_TITLE_LEN);
}

function sanitizeListEntries(
  raw: readonly (string | null | undefined)[] | null | undefined,
  disallowed: RegExp,
  maxLen: number,
  maxCount: number,
  normalizeApostrophes: boolean,
  separators: RegExp
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw ?? []) {
    let t = String(entry ?? '');
    if (normalizeApostrophes) t = t.replace(/[‘’]/g, "'");
    // Separators become spaces so "Art/Craft" does not fuse into "ArtCraft".
    t = t.replace(separators, ' ');
    t = collapseWhitespace(t);
    t = collapseWhitespace(t.replace(disallowed, ''));
    t = capCodePoints(t, maxLen);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= maxCount) break;
  }
  return out;
}

/** Tag sanitizer: spec tag regex, de-duplicated case-insensitively, capped per tag and in count. */
export function sanitizeEtsyTags(raw: readonly (string | null | undefined)[] | null | undefined): string[] {
  return sanitizeListEntries(raw, TAG_DISALLOWED, ETSY_MAX_TAG_LEN, ETSY_MAX_TAGS, true, LIST_SEPARATORS);
}

/** Material sanitizer: spec material regex (letters, numbers, spaces), de-duplicated, capped. */
export function sanitizeEtsyMaterials(raw: readonly (string | null | undefined)[] | null | undefined): string[] {
  // Hyphens are not allowed in materials (spec), so "Glass-Ceramic" becomes "Glass Ceramic".
  return sanitizeListEntries(raw, MATERIAL_DISALLOWED, ETSY_MAX_MATERIAL_LEN, ETSY_MAX_MATERIALS, false, MATERIAL_SEPARATORS);
}

// ---------------------------------------------------------------------------------------------
// Description builder.
// ---------------------------------------------------------------------------------------------

// Order matters: scheme URLs first (they may contain an @ or a dot), then www., then emails, then
// bare domains, then the brand name.
const SCHEME_URL_RE = /\b(?:https?|ftp):\/\/\S+/gi;
const WWW_URL_RE = /\bwww\.\S+/gi;
const EMAIL_RE = /[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+/g;
const BARE_DOMAIN_RE =
  /\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.(?:com|net|org|io|co|us|uk|biz|info|shop|store|site|online|app|me|ca|au|de|sale)\b(?:\/\S*)?/gi;
const BRAND_RE = /\bfinda\.?sale\b/gi;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Description text sanitizer: removes URLs (scheme, www and bare-domain forms), email addresses
 * and the FindA.Sale brand name, strips control characters, keeps line breaks (at most one blank
 * line in a row). It cannot know the name of every other sales venue, so it does not try to.
 */
export function sanitizeEtsyDescriptionText(raw: string | null | undefined): string {
  let t = String(raw ?? '').replace(/\r\n?/g, '\n').replace(CONTROL_CHARS_RE, '');
  t = t.replace(SCHEME_URL_RE, ' ').replace(WWW_URL_RE, ' ').replace(EMAIL_RE, ' ').replace(BARE_DOMAIN_RE, ' ').replace(BRAND_RE, ' ');
  const lines = t.split('\n').map((line) => line.replace(/[ \t ]+/g, ' ').trim());
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** The only card facts the description reads (ADR-134 ItemCard). cert numbers are never printed. */
export interface EtsyCardConditionInput {
  conditionCode?: string | null;
  grader?: string | null;
  grade?: string | null;
}

export interface EtsyDescriptionItemInput {
  description?: string | null;
  /** Item.condition: NEW | USED | REFURBISHED | PARTS_OR_REPAIR */
  condition?: string | null;
  /** Item.conditionGrade: S | A | B | C | D */
  conditionGrade?: string | null;
  /** Item.card (ItemCard) when loaded. */
  card?: EtsyCardConditionInput | null;
}

/**
 * The condition paragraph: "Condition: {label}. Grade: {letter} ({label})." Parts are omitted when
 * the field is empty or not in the fixed table; the grade letter is printed as stored (trimmed).
 * A loaded card adds one more sentence: "Graded by {grader}, grade {grade}." or
 * "Card condition: {label}." Returns '' when there is nothing to say.
 */
export function buildEtsyConditionLine(item: EtsyDescriptionItemInput): string {
  const parts: string[] = [];

  const conditionLabel = item.condition ? ETSY_CONDITION_LABELS[String(item.condition).trim().toUpperCase()] : undefined;
  if (conditionLabel) parts.push(`Condition: ${conditionLabel}.`);

  const gradeRaw = item.conditionGrade ? String(item.conditionGrade).trim() : '';
  if (gradeRaw) {
    const gradeLabel = ETSY_GRADE_LABELS[gradeRaw.toUpperCase()];
    parts.push(gradeLabel ? `Grade: ${gradeRaw} (${gradeLabel}).` : `Grade: ${gradeRaw}.`);
  }

  const card = item.card;
  if (card) {
    const grader = sanitizeEtsyDescriptionText(card.grader);
    const grade = sanitizeEtsyDescriptionText(card.grade);
    if (grader && grade) {
      parts.push(`Graded by ${grader}, grade ${grade}.`);
    } else if (card.conditionCode) {
      const cardLabel = ETSY_CARD_CONDITION_LABELS[String(card.conditionCode).trim().toUpperCase()];
      if (cardLabel) parts.push(`Card condition: ${cardLabel}.`);
    }
  }

  return parts.join(' ');
}

/**
 * Description: the sanitized Item.description, a blank line, then the condition paragraph. No
 * branding, no links, no emails, no mention of FindA.Sale. Either part is dropped when empty.
 */
export function buildEtsyDescription(item: EtsyDescriptionItemInput): string {
  const body = sanitizeEtsyDescriptionText(item.description);
  const conditionLine = buildEtsyConditionLine(item);
  return [body, conditionLine].filter((p) => p.length > 0).join('\n\n');
}

// ---------------------------------------------------------------------------------------------
// Quantity.
// ---------------------------------------------------------------------------------------------

/**
 * Units to list on Etsy: stockTotal minus stockSold when stockTotal > 1, else 1. NEVER derived from
 * Item.quantity, which means "set of N sold as one lot" (schema.prisma Item.quantity). A multi-unit
 * item with nothing left returns 0 (the payload builder reports that as a problem). Capped at
 * ETSY_MAX_QUANTITY.
 */
export function computeEtsyQuantity(item: { stockTotal?: number | null; stockSold?: number | null }): number {
  const total = item.stockTotal;
  if (typeof total !== 'number' || !isFinite(total) || total <= 1) return 1;
  const soldRaw = item.stockSold;
  const sold = typeof soldRaw === 'number' && isFinite(soldRaw) && soldRaw > 0 ? soldRaw : 0;
  const remaining = Math.floor(total - sold);
  return Math.max(0, Math.min(remaining, ETSY_MAX_QUANTITY));
}

// ---------------------------------------------------------------------------------------------
// Draft payload.
// ---------------------------------------------------------------------------------------------

/** Anything Number() can read, including a Prisma Decimal. */
type NumberLike = number | string | { toString(): string } | null | undefined;
/** A numeric Etsy id as number, digit string or bigint (shop settings may store either). */
type EtsyIdLike = number | string | bigint | null | undefined;

export interface EtsyDraftItemInput extends EtsyDescriptionItemInput {
  title?: string | null;
  price?: number | null;
  tags?: readonly string[] | null;
  /** Item.material, one free-text string; split on commas and semicolons into materials. */
  material?: string | null;
  stockTotal?: number | null;
  stockSold?: number | null;
  /** Item.packageWeightOz (Int). */
  packageWeightOz?: NumberLike;
  /** Item.packageLengthIn / WidthIn / HeightIn (Decimal). Sent only when all three are above 0. */
  packageLengthIn?: NumberLike;
  packageWidthIn?: NumberLike;
  packageHeightIn?: NumberLike;
}

export interface EtsyDraftAttestation {
  /** Etsy `when_made` value, from config/etsyWhenMade.ts. */
  whenMade: string | null | undefined;
  /** "This is a craft or party supply". */
  isSupply: boolean;
  /** Etsy seller-taxonomy node id (positive integer). */
  taxonomyId: number | string | null | undefined;
}

export interface EtsyDraftShopSettings {
  shippingProfileId?: EtsyIdLike;
  returnPolicyId?: EtsyIdLike;
  readinessStateId?: EtsyIdLike;
}

export type EtsyPayloadProblemCode =
  | 'TITLE_EMPTY'
  | 'PRICE_MISSING'
  | 'QUANTITY_ZERO'
  | 'WHEN_MADE_INVALID'
  | 'TAXONOMY_MISSING';

/** Organizer-facing text for each blocking problem. Copy-lint covered. */
export const ETSY_PAYLOAD_PROBLEM_MESSAGES: Readonly<Record<EtsyPayloadProblemCode, string>> = {
  TITLE_EMPTY: 'This item needs a title that Etsy accepts before it can be listed on Etsy.',
  PRICE_MISSING: 'Add a price to this item before listing it on Etsy.',
  QUANTITY_ZERO: 'All units of this item are sold, so there is nothing left to list on Etsy.',
  WHEN_MADE_INVALID: 'Choose when this item was made before listing it on Etsy.',
  TAXONOMY_MISSING: 'Choose an Etsy category before listing this item on Etsy.',
};

export interface EtsyPayloadProblem {
  code: EtsyPayloadProblemCode;
  message: string;
}

export type EtsyDraftPayloadResult =
  | {
      ok: true;
      /** Every value is already a string, null and undefined are omitted. */
      fields: Record<string, string>;
      /** fields as an application/x-www-form-urlencoded body. */
      body: string;
    }
  | { ok: false; problems: EtsyPayloadProblem[] };

function toPositiveNumber(value: NumberLike): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(typeof value === 'object' ? String(value) : value);
  return isFinite(n) && n > 0 ? n : null;
}

function toIdString(value: EtsyIdLike): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return /^[1-9]\d*$/.test(s) ? s : null;
}

function formatPrice(price: number): string {
  return ETSY_PRICE_IN_MINOR_UNITS ? String(Math.round(price * 100)) : price.toFixed(2);
}

/** Encode string fields as an application/x-www-form-urlencoded body (spaces as %20). */
export function encodeEtsyForm(fields: Readonly<Record<string, string>>): string {
  return Object.keys(fields)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(fields[k])}`)
    .join('&');
}

/**
 * Build the createDraftListing request. Always sends type=physical, should_auto_renew=false and
 * who_made=someone_else (ADR-135 D-9, D-10). Nulls and empty lists are omitted. Returns the problems
 * instead of a payload when a required field cannot be produced; it does NOT check eligibility
 * (call checkEtsyEligibility first).
 *
 * Craft supplies still need a `when_made` value (the spec requires it); the caller must offer the
 * organizer an era for them, or this returns WHEN_MADE_INVALID.
 */
export function buildEtsyDraftPayload(
  item: EtsyDraftItemInput,
  attestation: EtsyDraftAttestation,
  shopSettings: EtsyDraftShopSettings = {}
): EtsyDraftPayloadResult {
  const problems: EtsyPayloadProblem[] = [];
  const addProblem = (code: EtsyPayloadProblemCode) => problems.push({ code, message: ETSY_PAYLOAD_PROBLEM_MESSAGES[code] });

  const title = sanitizeEtsyTitle(item.title);
  if (!title) addProblem('TITLE_EMPTY');

  const price = toPositiveNumber(item.price);
  if (price === null) addProblem('PRICE_MISSING');

  const quantity = computeEtsyQuantity(item);
  if (quantity < 1) addProblem('QUANTITY_ZERO');

  const whenMade = getEtsyWhenMade(attestation.whenMade);
  if (!whenMade) addProblem('WHEN_MADE_INVALID');

  const taxonomyId = toIdString(attestation.taxonomyId);
  if (!taxonomyId) addProblem('TAXONOMY_MISSING');

  if (problems.length > 0 || price === null || !whenMade || !taxonomyId) return { ok: false, problems };

  // Etsy requires a non-empty description; fall back to the (already sanitized) title.
  const description = buildEtsyDescription(item) || title;

  const tags = sanitizeEtsyTags(item.tags);
  const materials = sanitizeEtsyMaterials((item.material ?? '').split(/[,;]/));

  const weight = toPositiveNumber(item.packageWeightOz);
  const length = toPositiveNumber(item.packageLengthIn);
  const width = toPositiveNumber(item.packageWidthIn);
  const height = toPositiveNumber(item.packageHeightIn);
  const hasAllDimensions = length !== null && width !== null && height !== null;

  const entries: Array<[string, string | null]> = [
    ['quantity', String(quantity)],
    ['title', title],
    ['description', description],
    ['price', formatPrice(price)],
    ['who_made', ETSY_WHO_MADE_DEFAULT],
    ['when_made', whenMade.value],
    ['taxonomy_id', taxonomyId],
    ['is_supply', attestation.isSupply === true ? 'true' : 'false'],
    ['type', 'physical'],
    ['should_auto_renew', 'false'],
    ['shipping_profile_id', toIdString(shopSettings.shippingProfileId)],
    ['return_policy_id', toIdString(shopSettings.returnPolicyId)],
    ['readiness_state_id', toIdString(shopSettings.readinessStateId)],
    ['tags', tags.length > 0 ? tags.join(ETSY_ARRAY_FIELD_SEPARATOR) : null],
    ['materials', materials.length > 0 ? materials.join(ETSY_ARRAY_FIELD_SEPARATOR) : null],
    ['item_weight', weight !== null ? String(weight) : null],
    ['item_weight_unit', weight !== null ? 'oz' : null],
    ['item_length', hasAllDimensions ? String(length) : null],
    ['item_width', hasAllDimensions ? String(width) : null],
    ['item_height', hasAllDimensions ? String(height) : null],
    ['item_dimensions_unit', hasAllDimensions ? 'in' : null],
  ];

  const fields: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (value !== null && value !== undefined) fields[key] = value;
  }
  return { ok: true, fields, body: encodeEtsyForm(fields) };
}
