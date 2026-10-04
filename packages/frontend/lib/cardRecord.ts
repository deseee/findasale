/**
 * cardRecord (ADR-134 #640 and #641, batch B7): pure logic for the card record panel in the item editor.
 *
 * No React, no axios, no env reads, no network: everything here is a plain function so it can be tested
 * with `npm test` (node:test through tsx). The panel (components/CardRecordPanel.tsx) wires these to
 * the wave-1 backend routes:
 *   GET/PUT  /api/item-cards/:itemId            read and save the card (PUT sends only changed fields)
 *   POST     /api/item-cards/:itemId/apply-printing   { printingId, resetFields? }
 *   GET      /api/cards/vocabulary | search | suggested-price | status
 *
 * Rules this file enforces for the panel (ADR-134 sections 2.5, 3.5, 3.6, 3.7, 11):
 *  - Dropdown lists come from the vocabulary endpoint, never from this file.
 *  - Only fields the seller changed are sent, so the server's lockedFields rule locks exactly what they typed.
 *  - A graded card never sends a condition; an ungraded card never sends grader, grade or certificate.
 *  - Nothing here knows how to change a price. The panel only hands a number back to the page when the
 *    seller presses "Use suggested price".
 */

// ---------------------------------------------------------------------------
// Copy (plain wording: no "AI", no "estate sale", no em dashes)
// ---------------------------------------------------------------------------

export const CARD_PANEL_COPY = {
  title: 'Trading card details',
  intro:
    'Add the card details so your listing, labels and eBay get them right. Card details save on their own, so press Save card details when you are done.',
  open: 'Show card details',
  close: 'Hide card details',
  needsPrice: 'Add a price before you can publish',
  needsPriceHint: 'Card items need a price. Type one in the Price field, or use the suggested price below.',
  searchTitle: 'Find your card',
  searchHint: 'Type a card name, or a set code and card number. Pick a result to fill in the details.',
  searchNameLabel: 'Search by card name',
  searchSetLabel: 'Search by set code',
  searchNumberLabel: 'Search by card number',
  searchChooseGame: 'Choose a game first, then search.',
  searchTooShort: 'Type at least 2 letters of the card name, or a set code and a card number.',
  noMatch: 'No match. You can enter the details by hand.',
  searchError: 'We could not search the card catalog right now. Your details are still here.',
  retry: 'Try again',
  searching: 'Searching for cards',
  catalogOff: 'Card lookup is not available right now. You can still enter card details by hand.',
  gameNotCovered: 'Card lookup is not available for this game yet. You can enter the details by hand.',
  resultsCapped: 'Showing the first matches only. Add a set code or card number to narrow it down.',
  usePrinting: 'Use this printing',
  usingPrinting: 'Filling in',
  printingApplied: 'Card details filled in. Your price was not changed.',
  noImage: 'No image',
  detailsHeading: 'Card details',
  game: 'Game',
  gameChoose: 'Choose a game',
  cardName: 'Card name',
  setName: 'Set name',
  setCode: 'Set code',
  collectorNumber: 'Card number',
  language: 'Language',
  finish: 'Finish',
  rarity: 'Rarity',
  releaseYear: 'Release year',
  notSet: 'Not set',
  graded: 'This card is graded',
  gradedHint: 'Graded cards use a grading company, a grade and a certificate number instead of a condition.',
  condition: 'Condition',
  grader: 'Grading company',
  graderChoose: 'Choose the grading company',
  grade: 'Grade',
  gradeChoose: 'Choose the grade',
  certNumber: 'Certificate number',
  locked: 'You typed this, so card lookups will not replace it.',
  resetToCatalog: 'Reset to catalog value',
  resetting: 'Resetting',
  fieldReset: 'Reset to the catalog value.',
  save: 'Save card details',
  saving: 'Saving',
  saved: 'Card details saved.',
  unsaved: 'You have card changes that are not saved yet.',
  nothingToSave: 'No changes to save.',
  fixFields: 'Fix the marked fields first.',
  loadingCard: 'Loading card details',
  loadCardError: 'We could not load the card details for this item.',
  loadOptionsError: 'We could not load the card options.',
  suggestedTitle: 'Use suggested title',
  titleApplied: 'Title filled in. Save the item to keep it.',
  suggestedPriceHeading: 'Suggested price',
  suggestedPricePickFirst: 'Pick a card above to see a suggested price.',
  suggestedPriceLoading: 'Checking the catalog price',
  suggestedPriceError: 'We could not check the catalog price right now.',
  suggestedPriceNone: 'No suggested price is available for this card.',
  useSuggestedPrice: 'Use suggested price',
  priceApplied: 'Price filled in. Save the item to keep it.',
  gradedNoPrice: 'There is no free price source for graded cards. Enter your own price.',
  priceStale: 'This price data is out of date. Check it before you use it.',
  priceBelowMinimum: 'This price is under $0.99, which eBay does not accept.',
  priceNeverAuto: 'Your price changes only when you press Use suggested price.',
  creditPrefix: 'Card data: ',
  creditAsOf: 'Catalog updated ',
  errorNetwork: 'We could not reach the server. Check your connection and try again.',
  errorRateLimited: 'Too many lookups in a short time. Wait a moment and try again.',
  errorItemNotFound: 'This item could not be found. Reload the page and try again.',
  errorCardNotFound: 'That catalog card is no longer available. Search again.',
  errorForbidden: 'Only organizers can change card details.',
  errorServer: 'Something went wrong on our side. Try again in a moment.',
  errorGeneric: 'Something went wrong. Try again.',
  validationGame: 'Choose a game.',
  validationYear: 'Enter a four digit year between 1900 and 2100.',
  validationCert: 'Certificate numbers can be up to 30 characters.',
  validationGrader: 'Choose the grading company.',
  validationGrade: 'Choose the grade.',
  languageNotCovered: 'Catalog prices cover English cards only, so there is no suggested price for this language.',
  noPriceForFinish: 'The catalog has no price for this finish of the card.',
} as const;

/** Copy that needs a value. The copy-lint test calls each of these with sample arguments. */
export const CARD_PANEL_TEMPLATES = {
  resultsCount: (n: number): string => (n === 1 ? '1 match' : `${n} matches`),
  dataFrom: (date: string): string => `Price data from ${date}.`,
  suggestedPriceBasis: (condition: string, finish: string): string => `Based on ${condition}, ${finish}.`,
  englishReference: (price: string): string => `English reference price: ${price}.`,
  lockedFor: (label: string): string => `${label}: you typed this, so card lookups will not replace it.`,
  resetFor: (label: string): string => `Reset ${label} to the catalog value`,
  tooLong: (label: string, max: number): string => `${label} can be up to ${max} characters.`,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VocabEntry {
  code: string;
  label: string;
}
export interface GameVocabEntry extends VocabEntry {
  catalogBacked: boolean;
}
export interface CardVocabulary {
  games: GameVocabEntry[];
  finishes: VocabEntry[];
  conditionCodes: VocabEntry[];
  languages: VocabEntry[];
  graders: string[];
  grades: string[];
}

/** The card block returned by GET/PUT /api/item-cards/:itemId (CARD_EDIT_SELECT on the backend). */
export interface StoredCard {
  game?: string | null;
  productType?: string | null;
  cardName?: string | null;
  setCode?: string | null;
  setName?: string | null;
  collectorNumber?: string | null;
  language?: string | null;
  finish?: string | null;
  rarity?: string | null;
  conditionCode?: string | null;
  grader?: string | null;
  grade?: string | null;
  certNumber?: string | null;
  releaseYear?: number | null;
  scryfallId?: string | null;
  tcgplayerProductId?: number | null;
  cardmarketId?: number | null;
  catalogPrintingId?: string | null;
  lockedFields?: string[] | null;
}

/** Every editable field on the form is held as a string. */
export const FORM_FIELDS = [
  'game',
  'cardName',
  'setName',
  'setCode',
  'collectorNumber',
  'language',
  'finish',
  'rarity',
  'releaseYear',
  'conditionCode',
  'grader',
  'grade',
  'certNumber',
] as const;
export type FormField = (typeof FORM_FIELDS)[number];
export type CardFormValues = Record<FormField, string>;

/**
 * Form fields a catalog printing can fill (a subset of the backend's CATALOG_FIELDS). Only these can
 * be locked in a way that matters and only these have a "reset to catalog value".
 */
export const RESETTABLE_FIELDS: readonly FormField[] = [
  'game',
  'cardName',
  'setName',
  'setCode',
  'collectorNumber',
  'language',
  'finish',
  'rarity',
  'releaseYear',
];

export const FIELD_LABELS: Record<FormField, string> = {
  game: CARD_PANEL_COPY.game,
  cardName: CARD_PANEL_COPY.cardName,
  setName: CARD_PANEL_COPY.setName,
  setCode: CARD_PANEL_COPY.setCode,
  collectorNumber: CARD_PANEL_COPY.collectorNumber,
  language: CARD_PANEL_COPY.language,
  finish: CARD_PANEL_COPY.finish,
  rarity: CARD_PANEL_COPY.rarity,
  releaseYear: CARD_PANEL_COPY.releaseYear,
  conditionCode: CARD_PANEL_COPY.condition,
  grader: CARD_PANEL_COPY.grader,
  grade: CARD_PANEL_COPY.grade,
  certNumber: CARD_PANEL_COPY.certNumber,
};

/** Server limits, mirrored from cardRecordService so the form can warn before a round trip. */
const MAX_LENGTH: Partial<Record<FormField, number>> = {
  cardName: 200,
  setName: 200,
  setCode: 20,
  collectorNumber: 20,
  rarity: 40,
  certNumber: 30,
};
export const CERT_MAX_LENGTH = 30;
export const RELEASE_YEAR_MIN = 1900;
export const RELEASE_YEAR_MAX = 2100;

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

type RawLabels = Record<string, Record<string, string> | undefined>;

function toEntries(list: unknown, labels?: Record<string, string>): VocabEntry[] {
  if (!Array.isArray(list)) return [];
  const out: VocabEntry[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      if (item) out.push({ code: item, label: labels?.[item] ?? item });
    } else if (item && typeof item === 'object' && typeof (item as { code?: unknown }).code === 'string') {
      const e = item as { code: string; label?: unknown };
      out.push({ code: e.code, label: typeof e.label === 'string' && e.label ? e.label : labels?.[e.code] ?? e.code });
    }
  }
  return out;
}

function toStrings(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

/**
 * Turns the body of GET /api/cards/vocabulary into the lists the form uses. Accepts the payload at the
 * top level or under `data`, and entries as plain strings or { code, label } objects (with an optional
 * `labels` map). Returns null when the games, finishes or conditions are missing, so the panel shows
 * its load error instead of an empty form.
 */
export function normalizeVocabulary(body: unknown): CardVocabulary | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;
  const raw = (root.games === undefined && root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
  const labels = (raw.labels ?? {}) as RawLabels;

  const games: GameVocabEntry[] = toEntries(raw.games, labels.games).map((e, i) => {
    const original = Array.isArray(raw.games) ? (raw.games[i] as { catalogBacked?: unknown } | string) : undefined;
    const catalogBacked = !!original && typeof original === 'object' && original.catalogBacked === true;
    return { ...e, catalogBacked };
  });
  const finishes = toEntries(raw.finishes, labels.finishes);
  const conditionCodes = toEntries(raw.conditionCodes, labels.conditionCodes);
  const languages = toEntries(raw.languages);
  const graders = toStrings(raw.graders);
  const grades = toStrings(raw.grades);
  if (games.length === 0 || finishes.length === 0 || conditionCodes.length === 0) return null;
  return { games, finishes, conditionCodes, languages, graders, grades };
}

export function labelFor(list: readonly VocabEntry[], code: string | null | undefined): string {
  if (!code) return '';
  return list.find((e) => e.code === code)?.label ?? code;
}

// ---------------------------------------------------------------------------
// Form <-> stored card
// ---------------------------------------------------------------------------

export function emptyForm(): CardFormValues {
  const form = {} as CardFormValues;
  for (const f of FORM_FIELDS) form[f] = '';
  return form;
}

export function formFromCard(card: StoredCard | null | undefined): CardFormValues {
  const form = emptyForm();
  if (!card) return form;
  for (const f of FORM_FIELDS) {
    const v = (card as Record<string, unknown>)[f];
    form[f] = v === null || v === undefined ? '' : String(v);
  }
  return form;
}

/** A stored card counts as graded when it carries a grader, a grade or a certificate number. */
export function isGradedCard(card: StoredCard | null | undefined): boolean {
  return !!card && !!(card.grader || card.grade || card.certNumber);
}

/** The value the server would store for a form string. A year that is not all digits stays a string so validateForm can reject it. */
export function normalizeFieldValue(field: FormField, value: string | null | undefined): string | number | null {
  const trimmed = (value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (trimmed === '') return null;
  if (field === 'releaseYear') return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
  if (field === 'setCode') return trimmed.toLowerCase();
  return trimmed;
}

function storedValue(field: FormField, card: StoredCard | null | undefined): string | number | null {
  const v = card ? (card as Record<string, unknown>)[field] : null;
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  return normalizeFieldValue(field, String(v));
}

/** The value a field will actually be saved with, given the graded switch. */
function effectiveValue(field: FormField, form: CardFormValues, graded: boolean): string | number | null {
  if (graded && field === 'conditionCode') return null;
  if (!graded && (field === 'grader' || field === 'grade' || field === 'certNumber')) return null;
  return normalizeFieldValue(field, form[field]);
}

export interface DiffOptions {
  /** Fields to leave out of the patch (a field whose typed edit is being thrown away). */
  exclude?: readonly FormField[];
}

/**
 * Only the fields whose value differs from the stored card (or from nothing, when there is no card yet).
 * The server adds every field it receives that differs from the stored value to lockedFields, so sending
 * only real changes locks exactly the fields the seller typed. With no stored card, game is always
 * included because the server requires it.
 */
export function diffFormAgainstCard(
  form: CardFormValues,
  graded: boolean,
  card: StoredCard | null | undefined,
  options: DiffOptions = {}
): Partial<Record<FormField, string | number | null>> {
  const skip = new Set<string>(options.exclude ?? []);
  const patch: Partial<Record<FormField, string | number | null>> = {};
  for (const f of FORM_FIELDS) {
    if (skip.has(f)) continue;
    const next = effectiveValue(f, form, graded);
    const prev = storedValue(f, card);
    if (next !== prev) patch[f] = next;
  }
  if (!card && !skip.has('game')) {
    const game = effectiveValue('game', form, graded);
    if (game !== null) patch.game = game;
  }
  return patch;
}

export function hasUnsavedChanges(form: CardFormValues, graded: boolean, card: StoredCard | null | undefined): boolean {
  const keys = Object.keys(diffFormAgainstCard(form, graded, card));
  // A new card only counts as unsaved once the seller has typed more than the game choice.
  if (!card) return keys.some((k) => k !== 'game');
  return keys.length > 0;
}

export type FieldErrors = Partial<Record<FormField, string>>;

/** Light client-side checks that mirror the server's rules. The server stays the authority. */
export function validateForm(form: CardFormValues, graded: boolean): FieldErrors {
  const errors: FieldErrors = {};
  if (!normalizeFieldValue('game', form.game)) errors.game = CARD_PANEL_COPY.validationGame;
  const year = normalizeFieldValue('releaseYear', form.releaseYear);
  if (year !== null) {
    if (typeof year !== 'number' || year < RELEASE_YEAR_MIN || year > RELEASE_YEAR_MAX) {
      errors.releaseYear = CARD_PANEL_COPY.validationYear;
    }
  }
  for (const f of Object.keys(MAX_LENGTH) as FormField[]) {
    const max = MAX_LENGTH[f] as number;
    if (!graded && f === 'certNumber') continue;
    const v = normalizeFieldValue(f, form[f]);
    if (typeof v === 'string' && v.length > max) {
      errors[f] = f === 'certNumber' ? CARD_PANEL_COPY.validationCert : CARD_PANEL_TEMPLATES.tooLong(FIELD_LABELS[f], max);
    }
  }
  if (graded) {
    if (!normalizeFieldValue('grader', form.grader)) errors.grader = CARD_PANEL_COPY.validationGrader;
    if (!normalizeFieldValue('grade', form.grade)) errors.grade = CARD_PANEL_COPY.validationGrade;
  }
  return errors;
}

export function lockedFormFields(card: StoredCard | null | undefined): FormField[] {
  const locked = new Set(card?.lockedFields ?? []);
  return RESETTABLE_FIELDS.filter((f) => locked.has(f));
}

/** A reset needs a catalog printing to read from. */
export function canResetField(card: StoredCard | null | undefined, field: FormField): boolean {
  return !!card?.catalogPrintingId && (RESETTABLE_FIELDS as readonly string[]).includes(field);
}

// ---------------------------------------------------------------------------
// Price rules
// ---------------------------------------------------------------------------

export function parsePrice(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

export function hasValidPrice(value: string | number | null | undefined): boolean {
  const n = parsePrice(value);
  return n !== null && n > 0;
}

/** A card item is one with a saved card record, or one where the seller has chosen a game. */
export function isCardItem(card: StoredCard | null | undefined, form: CardFormValues): boolean {
  return !!card || !!normalizeFieldValue('game', form.game);
}

/** True when the "Add a price before you can publish" flag must show. */
export function needsPriceFlag(card: StoredCard | null | undefined, form: CardFormValues, price: string | number | null | undefined): boolean {
  return isCardItem(card, form) && !hasValidPrice(price);
}

export function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function formatDataDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Suggested price view
// ---------------------------------------------------------------------------

/** The suggestion block from GET /api/cards/suggested-price (cardPriceSuggestionService). */
export interface SuggestionBody {
  ok: boolean;
  suggestedPrice: number | null;
  code?: string;
  message?: string;
  asOf?: string | null;
  showDataDate?: boolean;
  stale?: boolean;
  belowEbayMinimum?: boolean;
  basis?: { finish?: string; conditionCode?: string };
  englishReference?: { finish?: string; price?: number; label?: string };
}

export interface SuggestionView {
  /** The number "Use suggested price" hands to the page, or null when there is no suggestion. */
  price: number | null;
  priceText: string;
  basisText: string;
  dataDateText: string;
  staleWarning: string;
  belowMinimumWarning: string;
  /** Plain explanation when there is no suggestion. */
  unavailableText: string;
  referenceText: string;
}

const EMPTY_VIEW: SuggestionView = {
  price: null,
  priceText: '',
  basisText: '',
  dataDateText: '',
  staleWarning: '',
  belowMinimumWarning: '',
  unavailableText: CARD_PANEL_COPY.suggestedPriceNone,
  referenceText: '',
};

export function describeSuggestion(
  s: SuggestionBody | null | undefined,
  labels: { condition: (code: string) => string; finish: (code: string) => string }
): SuggestionView {
  if (!s) return { ...EMPTY_VIEW };
  const price = typeof s.suggestedPrice === 'number' && Number.isFinite(s.suggestedPrice) && s.suggestedPrice > 0 ? s.suggestedPrice : null;
  if (!s.ok || price === null) {
    const view: SuggestionView = { ...EMPTY_VIEW };
    if (s.code === 'GRADED_NOT_SUPPORTED') view.unavailableText = CARD_PANEL_COPY.gradedNoPrice;
    if (s.code === 'LANGUAGE_NOT_COVERED' && s.englishReference && typeof s.englishReference.price === 'number') {
      view.unavailableText = CARD_PANEL_COPY.languageNotCovered;
      view.referenceText = CARD_PANEL_TEMPLATES.englishReference(formatMoney(s.englishReference.price));
    }
    if (s.code === 'NO_PRICE_FOR_FINISH') view.unavailableText = CARD_PANEL_COPY.noPriceForFinish;
    if (s.code === 'NO_PRICE_DATA') view.unavailableText = CARD_PANEL_COPY.suggestedPriceNone;
    return view;
  }
  const condition = s.basis?.conditionCode ? labels.condition(s.basis.conditionCode) : '';
  const finish = s.basis?.finish ? labels.finish(s.basis.finish) : '';
  const basisText = condition && finish ? CARD_PANEL_TEMPLATES.suggestedPriceBasis(condition, finish) : '';
  const date = formatDataDate(s.asOf);
  return {
    price,
    priceText: formatMoney(price),
    basisText,
    dataDateText: s.showDataDate && date ? CARD_PANEL_TEMPLATES.dataFrom(date) : '',
    staleWarning: s.stale ? CARD_PANEL_COPY.priceStale : '',
    belowMinimumWarning: s.belowEbayMinimum || price < 0.99 ? CARD_PANEL_COPY.priceBelowMinimum : '',
    unavailableText: '',
    referenceText: '',
  };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const SEARCH_DEBOUNCE_MS = 250;
export const SEARCH_LIMIT = 20;
const SEARCH_MIN_NAME_CHARS = 2;

/** Letters and digits only, the same idea as the backend's normalizeCardName. */
function nameChars(q: string): number {
  return q
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '').length;
}

export interface SearchInputs {
  game: string;
  q: string;
  set: string;
  number: string;
}

/** The backend needs a game plus either a name of at least 2 letters or both set code and number. */
export function canSearch(inputs: SearchInputs): boolean {
  if (!inputs.game.trim()) return false;
  const hasName = nameChars(inputs.q) >= SEARCH_MIN_NAME_CHARS;
  const hasSetNumber = !!inputs.set.trim() && !!inputs.number.trim();
  return hasName || hasSetNumber;
}

export function buildSearchParams(inputs: SearchInputs): Record<string, string | number> {
  const params: Record<string, string | number> = { game: inputs.game.trim(), limit: SEARCH_LIMIT };
  if (inputs.q.trim()) params.q = inputs.q.trim();
  if (inputs.set.trim()) params.set = inputs.set.trim();
  if (inputs.number.trim()) params.number = inputs.number.trim();
  return params;
}

export interface PrintingResult {
  id: string;
  game?: string;
  name: string;
  setCode?: string | null;
  setName?: string | null;
  collectorNumber?: string | null;
  language?: string | null;
  rarity?: string | null;
  releaseYear?: number | null;
  finishes?: string[];
  imageSmallUrl?: string | null;
}

/** Reads the printings out of a search response (payload at the top level or under `data`). */
export function readSearchResults(body: unknown): { results: PrintingResult[]; capped: boolean; catalogReady: boolean | null } {
  const root = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const payload = (Array.isArray(root.results) ? root : root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
  const list = Array.isArray(payload.results) ? payload.results : [];
  const results = list.filter(
    (r): r is PrintingResult => !!r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string' && typeof (r as { name?: unknown }).name === 'string'
  );
  return {
    results,
    capped: payload.capped === true,
    catalogReady: typeof root.catalogReady === 'boolean' ? root.catalogReady : null,
  };
}

/** The second line of a result row: "Alpha (LEA) #161 · Common · 1993". */
export function printingMeta(p: PrintingResult): string {
  const code = p.setCode ? p.setCode.toUpperCase() : '';
  const set = p.setName ? (code ? `${p.setName} (${code})` : p.setName) : code;
  const parts: string[] = [];
  if (set) parts.push(p.collectorNumber ? `${set} #${p.collectorNumber}` : set);
  else if (p.collectorNumber) parts.push(`#${p.collectorNumber}`);
  if (p.rarity) parts.push(p.rarity.charAt(0).toUpperCase() + p.rarity.slice(1));
  if (typeof p.releaseYear === 'number') parts.push(String(p.releaseYear));
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Status (catalog readiness)
// ---------------------------------------------------------------------------

export interface CatalogStatus {
  known: boolean;
  /** True when at least one game can be looked up. Meaningful only when known. */
  ready: boolean;
  readyGames: string[];
  dataAsOf: { SCRYFALL: string | null; TCGCSV: string | null };
}

export const UNKNOWN_STATUS: CatalogStatus = { known: false, ready: true, readyGames: [], dataAsOf: { SCRYFALL: null, TCGCSV: null } };

export function readStatus(body: unknown): CatalogStatus {
  if (!body || typeof body !== 'object') return UNKNOWN_STATUS;
  const root = body as Record<string, unknown>;
  if (typeof root.catalogReady !== 'boolean') return UNKNOWN_STATUS;
  const payload = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
  const games = Array.isArray(payload.readyGames) ? payload.readyGames.filter((g): g is string => typeof g === 'string') : [];
  const asOf = (root.dataAsOf && typeof root.dataAsOf === 'object' ? root.dataAsOf : {}) as Record<string, unknown>;
  return {
    known: true,
    ready: root.catalogReady,
    readyGames: games,
    dataAsOf: {
      SCRYFALL: typeof asOf.SCRYFALL === 'string' ? asOf.SCRYFALL : null,
      TCGCSV: typeof asOf.TCGCSV === 'string' ? asOf.TCGCSV : null,
    },
  };
}

/** Whether a lookup can run for the chosen game, and if not, which plain message to show. */
export function lookupAvailability(
  status: CatalogStatus,
  game: string,
  vocabGames: readonly GameVocabEntry[]
): 'ok' | 'catalogOff' | 'gameNotCovered' | 'chooseGame' {
  if (status.known && !status.ready) return 'catalogOff';
  if (!game) return 'chooseGame';
  const entry = vocabGames.find((g) => g.code === game);
  if (entry && !entry.catalogBacked) return 'gameNotCovered';
  if (status.known && status.readyGames.length > 0 && !status.readyGames.includes(game)) return 'gameNotCovered';
  return 'ok';
}

/** "Card data: Scryfall and TCGCSV" limited to the sources that have data. Empty when none do. */
export function creditLine(status: CatalogStatus): string {
  const names: string[] = [];
  if (status.dataAsOf.SCRYFALL) names.push('Scryfall');
  if (status.dataAsOf.TCGCSV) names.push('TCGCSV');
  if (names.length === 0) return '';
  return `${CARD_PANEL_COPY.creditPrefix}${names.join(' and ')}`;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface ReadableError {
  code: string | null;
  status: number | null;
  message: string;
}

/** Turns an axios-style error into plain wording. Never exposes status codes or raw field names. */
export function readApiError(err: unknown): ReadableError {
  const e = err as { response?: { status?: number; data?: Record<string, unknown> }; message?: string } | null | undefined;
  const response = e?.response;
  if (!response) return { code: null, status: null, message: CARD_PANEL_COPY.errorNetwork };
  const status = typeof response.status === 'number' ? response.status : null;
  const data = (response.data ?? {}) as { error?: unknown; code?: unknown; issues?: unknown };
  const code = typeof data.code === 'string' ? data.code : null;

  if (code === 'CARD_VALIDATION') {
    const issues = Array.isArray(data.issues) ? (data.issues as Array<{ path?: unknown; message?: unknown }>) : [];
    const lines = issues
      .map((i) => {
        const path = typeof i.path === 'string' ? i.path : '';
        const message = typeof i.message === 'string' ? i.message : '';
        const label = (FIELD_LABELS as Record<string, string>)[path];
        if (!message) return '';
        if (label) return `${label}: ${message.split(path).join(label)}`;
        return message;
      })
      .filter(Boolean);
    const message = lines.length > 0 ? lines.join(' ') : typeof data.error === 'string' && data.error ? data.error : CARD_PANEL_COPY.errorGeneric;
    return { code, status, message };
  }
  if (code === 'RATE_LIMITED' || status === 429) return { code, status, message: CARD_PANEL_COPY.errorRateLimited };
  if (code === 'ITEM_NOT_FOUND') return { code, status, message: CARD_PANEL_COPY.errorItemNotFound };
  if (code === 'CARD_NOT_FOUND') return { code, status, message: CARD_PANEL_COPY.errorCardNotFound };
  if (code === 'FORBIDDEN' || status === 403) return { code, status, message: CARD_PANEL_COPY.errorForbidden };
  if (status !== null && status >= 500) return { code, status, message: CARD_PANEL_COPY.errorServer };
  return { code, status, message: CARD_PANEL_COPY.errorGeneric };
}

// ---------------------------------------------------------------------------
// Suggested title (used only when the seller presses "Use suggested title")
// ---------------------------------------------------------------------------

const TITLE_MAX = 80; // eBay's title limit

/**
 * "Lightning Bolt - Alpha #161 - Magic: The Gathering - Foil - Near Mint". Parts are dropped from the
 * end until it fits in 80 characters, and the card name alone is cut as a last resort.
 * Returns null when there is no card name.
 */
export function buildSuggestedTitle(
  form: CardFormValues,
  graded: boolean,
  vocab: Pick<CardVocabulary, 'games' | 'finishes' | 'conditionCodes'>
): string | null {
  const name = normalizeFieldValue('cardName', form.cardName);
  if (typeof name !== 'string') return null;
  const parts: string[] = [name];
  const setName = normalizeFieldValue('setName', form.setName);
  const number = normalizeFieldValue('collectorNumber', form.collectorNumber);
  if (typeof setName === 'string') parts.push(typeof number === 'string' ? `${setName} #${number}` : setName);
  else if (typeof number === 'string') parts.push(`#${number}`);
  const game = normalizeFieldValue('game', form.game);
  if (typeof game === 'string') parts.push(labelFor(vocab.games, game));
  const finish = normalizeFieldValue('finish', form.finish);
  if (typeof finish === 'string' && finish !== 'NONFOIL') parts.push(labelFor(vocab.finishes, finish));
  if (graded) {
    const grader = normalizeFieldValue('grader', form.grader);
    const grade = normalizeFieldValue('grade', form.grade);
    const g = [grader, grade].filter((v): v is string => typeof v === 'string').join(' ');
    if (g) parts.push(g);
  } else {
    const cond = normalizeFieldValue('conditionCode', form.conditionCode);
    if (typeof cond === 'string') parts.push(labelFor(vocab.conditionCodes, cond));
  }
  let kept = parts.slice();
  while (kept.length > 1 && kept.join(' - ').length > TITLE_MAX) kept = kept.slice(0, -1);
  const title = kept.join(' - ');
  return title.length > TITLE_MAX ? title.slice(0, TITLE_MAX).trim() : title;
}
