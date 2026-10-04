/**
 * cardRecord (ADR-134 batch B7): pure logic behind the card record panel in the item editor.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_PANEL_COPY,
  CARD_PANEL_TEMPLATES,
  FIELD_LABELS,
  FORM_FIELDS,
  RESETTABLE_FIELDS,
  UNKNOWN_STATUS,
  buildSearchParams,
  buildSuggestedTitle,
  canResetField,
  canSearch,
  creditLine,
  describeSuggestion,
  diffFormAgainstCard,
  emptyForm,
  formFromCard,
  hasUnsavedChanges,
  hasValidPrice,
  isGradedCard,
  labelFor,
  lockedFormFields,
  lookupAvailability,
  needsPriceFlag,
  normalizeVocabulary,
  printingMeta,
  readApiError,
  readSearchResults,
  readStatus,
  validateForm,
  type CardFormValues,
  type CardVocabulary,
  type StoredCard,
} from '../cardRecord';

// The backend's CARD_FIELDS whitelist (services/cardRecordService.ts). A PUT body may only use these keys.
const SERVER_WHITELIST = [
  'game', 'productType', 'cardName', 'setCode', 'setName', 'collectorNumber', 'language', 'finish', 'rarity',
  'conditionCode', 'grader', 'grade', 'certNumber', 'releaseYear', 'scryfallId', 'tcgplayerProductId', 'cardmarketId',
];

const VOCAB_BODY = {
  success: true,
  catalogReady: true,
  games: [
    { code: 'MTG', label: 'Magic: The Gathering', catalogBacked: true },
    { code: 'LORCANA', label: 'Disney Lorcana', catalogBacked: false },
  ],
  finishes: [{ code: 'NONFOIL', label: 'Non-foil' }, { code: 'FOIL', label: 'Foil' }],
  conditionCodes: [{ code: 'NM', label: 'Near Mint' }, { code: 'LP', label: 'Lightly Played' }],
  languages: [{ code: 'en', label: 'English' }],
  graders: ['PSA', 'BGS'],
  grades: ['10', '9.5'],
};

function vocab(): CardVocabulary {
  const v = normalizeVocabulary(VOCAB_BODY);
  assert.ok(v);
  return v;
}

const form = (over: Partial<CardFormValues> = {}): CardFormValues => ({ ...emptyForm(), ...over });

const storedCard = (over: Partial<StoredCard> = {}): StoredCard => ({
  game: 'MTG',
  productType: 'SINGLE',
  cardName: 'Lightning Bolt',
  setCode: 'lea',
  setName: 'Alpha',
  collectorNumber: '161',
  language: 'en',
  finish: 'NONFOIL',
  rarity: 'common',
  conditionCode: 'NM',
  grader: null,
  grade: null,
  certNumber: null,
  releaseYear: 1993,
  catalogPrintingId: 'SCRYFALL:abc',
  lockedFields: [],
  ...over,
});

// ---------------------------------------------------------------------------

test('vocabulary: reads objects at the top level, under data, and plain string lists with a labels map', () => {
  const top = normalizeVocabulary(VOCAB_BODY);
  assert.equal(top?.games[0].label, 'Magic: The Gathering');
  assert.equal(top?.games[0].catalogBacked, true);
  assert.equal(top?.games[1].catalogBacked, false);
  assert.deepEqual(top?.graders, ['PSA', 'BGS']);

  const nested = normalizeVocabulary({ success: true, data: VOCAB_BODY });
  assert.equal(nested?.finishes.length, 2);

  const strings = normalizeVocabulary({
    games: ['MTG'],
    finishes: ['NONFOIL'],
    conditionCodes: ['NM'],
    labels: { games: { MTG: 'Magic: The Gathering' }, conditionCodes: { NM: 'Near Mint' }, finishes: { NONFOIL: 'Non-foil' } },
  });
  assert.equal(strings?.games[0].label, 'Magic: The Gathering');
  assert.equal(strings?.conditionCodes[0].label, 'Near Mint');
  assert.equal(strings?.games[0].catalogBacked, false);
});

test('vocabulary: unusable bodies return null so the panel shows its load error', () => {
  assert.equal(normalizeVocabulary(null), null);
  assert.equal(normalizeVocabulary({}), null);
  assert.equal(normalizeVocabulary({ games: [], finishes: [], conditionCodes: [] }), null);
  assert.equal(labelFor(vocab().conditionCodes, 'LP'), 'Lightly Played');
  assert.equal(labelFor(vocab().conditionCodes, 'XX'), 'XX');
  assert.equal(labelFor(vocab().conditionCodes, null), '');
});

test('save patch: a new card always includes game and only the fields the seller typed', () => {
  const patch = diffFormAgainstCard(form({ game: 'MTG', cardName: ' Black Lotus ', setCode: 'LEA' }), false, null);
  assert.deepEqual(patch, { game: 'MTG', cardName: 'Black Lotus', setCode: 'lea' });
});

test('save patch: unchanged values are not sent, so they are never locked', () => {
  const card = storedCard();
  assert.deepEqual(diffFormAgainstCard(formFromCard(card), false, card), {});
  const patch = diffFormAgainstCard(form({ ...formFromCard(card), conditionCode: 'LP' }), false, card);
  assert.deepEqual(patch, { conditionCode: 'LP' });
});

test('save patch: clearing a field sends null', () => {
  const card = storedCard();
  const patch = diffFormAgainstCard(form({ ...formFromCard(card), rarity: '  ' }), false, card);
  assert.deepEqual(patch, { rarity: null });
});

test('graded toggle: a graded save sends no condition and keeps grader, grade and certificate', () => {
  const card = storedCard();
  const f = form({ ...formFromCard(card), grader: 'PSA', grade: '10', certNumber: '12345678' });
  const patch = diffFormAgainstCard(f, true, card);
  assert.equal(patch.conditionCode, null);
  assert.equal(patch.grader, 'PSA');
  assert.equal(patch.grade, '10');
  assert.equal(patch.certNumber, '12345678');
});

test('graded toggle: an ungraded save clears grader, grade and certificate and keeps the condition', () => {
  const card = storedCard({ conditionCode: null, grader: 'PSA', grade: '10', certNumber: '999' });
  const f = form({ ...formFromCard(card), conditionCode: 'NM', grader: 'PSA', grade: '10', certNumber: '999' });
  const patch = diffFormAgainstCard(f, false, card);
  assert.equal(patch.grader, null);
  assert.equal(patch.grade, null);
  assert.equal(patch.certNumber, null);
  assert.equal(patch.conditionCode, 'NM');
  assert.equal(isGradedCard(card), true);
  assert.equal(isGradedCard(storedCard()), false);
});

test('save patch: every key is on the server whitelist and no price is ever part of it', () => {
  const f = form({
    game: 'MTG', cardName: 'A', setName: 'B', setCode: 'C', collectorNumber: '1', language: 'en', finish: 'FOIL',
    rarity: 'rare', releaseYear: '2020', conditionCode: 'NM', grader: 'PSA', grade: '10', certNumber: '1',
  });
  for (const graded of [true, false]) {
    for (const key of Object.keys(diffFormAgainstCard(f, graded, null))) {
      assert.ok(SERVER_WHITELIST.includes(key), `${key} is not accepted by the server`);
      assert.ok(!/price/i.test(key));
    }
  }
  assert.ok(!(FORM_FIELDS as readonly string[]).some((k) => /price/i.test(k)));
});

test('save patch: exclude leaves a field out (used when a typed edit is thrown away by a reset)', () => {
  const card = storedCard();
  const f = form({ ...formFromCard(card), cardName: 'Typed', rarity: 'rare' });
  assert.deepEqual(diffFormAgainstCard(f, false, card, { exclude: ['cardName'] }), { rarity: 'rare' });
});

test('unsaved changes: the game choice alone on a new card is not unsaved, typed details are', () => {
  assert.equal(hasUnsavedChanges(form({ game: 'MTG' }), false, null), false);
  assert.equal(hasUnsavedChanges(form({ game: 'MTG', cardName: 'X' }), false, null), true);
  const card = storedCard();
  assert.equal(hasUnsavedChanges(formFromCard(card), false, card), false);
  assert.equal(hasUnsavedChanges(form({ ...formFromCard(card), finish: 'FOIL' }), false, card), true);
});

test('validation: game, year range, certificate length and graded requirements', () => {
  assert.equal(validateForm(form(), false).game, CARD_PANEL_COPY.validationGame);
  assert.equal(validateForm(form({ game: 'MTG', releaseYear: '1899' }), false).releaseYear, CARD_PANEL_COPY.validationYear);
  assert.equal(validateForm(form({ game: 'MTG', releaseYear: '2101' }), false).releaseYear, CARD_PANEL_COPY.validationYear);
  assert.equal(validateForm(form({ game: 'MTG', releaseYear: '19x3' }), false).releaseYear, CARD_PANEL_COPY.validationYear);
  assert.equal(validateForm(form({ game: 'MTG', releaseYear: '1993' }), false).releaseYear, undefined);
  const graded = validateForm(form({ game: 'MTG' }), true);
  assert.equal(graded.grader, CARD_PANEL_COPY.validationGrader);
  assert.equal(graded.grade, CARD_PANEL_COPY.validationGrade);
  assert.equal(validateForm(form({ game: 'MTG', grader: 'PSA', grade: '10', certNumber: 'x'.repeat(31) }), true).certNumber, CARD_PANEL_COPY.validationCert);
  assert.equal(validateForm(form({ game: 'MTG', grader: 'PSA', grade: '10', certNumber: 'x'.repeat(30) }), true).certNumber, undefined);
  // grader is not required when the card is not graded, and a stale certificate is ignored
  assert.deepEqual(validateForm(form({ game: 'MTG', certNumber: 'x'.repeat(50) }), false), {});
});

test('price flag: a card item with no price shows the flag, a price removes it, a non-card item never shows it', () => {
  assert.equal(needsPriceFlag(storedCard(), formFromCard(storedCard()), ''), true);
  assert.equal(needsPriceFlag(storedCard(), formFromCard(storedCard()), '0'), true);
  assert.equal(needsPriceFlag(storedCard(), formFromCard(storedCard()), null), true);
  assert.equal(needsPriceFlag(null, form({ game: 'MTG' }), undefined), true);
  assert.equal(needsPriceFlag(storedCard(), formFromCard(storedCard()), '2.50'), false);
  assert.equal(needsPriceFlag(storedCard(), formFromCard(storedCard()), 3), false);
  assert.equal(needsPriceFlag(null, form(), ''), false);
  assert.equal(hasValidPrice('abc'), false);
  assert.equal(CARD_PANEL_COPY.needsPrice, 'Add a price before you can publish');
});

test('locks: lock icon fields are the catalog fields in lockedFields, and reset needs a printing', () => {
  const card = storedCard({ lockedFields: ['cardName', 'rarity', 'conditionCode', 'scryfallId'] });
  assert.deepEqual(lockedFormFields(card), ['cardName', 'rarity']);
  assert.equal(canResetField(card, 'cardName'), true);
  assert.equal(canResetField(card, 'conditionCode'), false);
  assert.equal(canResetField(storedCard({ catalogPrintingId: null }), 'cardName'), false);
  assert.equal(canResetField(null, 'cardName'), false);
  for (const f of RESETTABLE_FIELDS) assert.ok((FORM_FIELDS as readonly string[]).includes(f));
});

test('suggested price: a number is only handed back when the server gave one', () => {
  const labels = { condition: (c: string) => labelFor(vocab().conditionCodes, c), finish: (c: string) => labelFor(vocab().finishes, c) };
  const ok = describeSuggestion(
    { ok: true, suggestedPrice: 1.25, asOf: '2026-10-01T00:00:00.000Z', showDataDate: true, stale: true, belowEbayMinimum: false, basis: { finish: 'FOIL', conditionCode: 'LP' } },
    labels
  );
  assert.equal(ok.price, 1.25);
  assert.equal(ok.priceText, '$1.25');
  assert.equal(ok.basisText, 'Based on Lightly Played, Foil.');
  assert.ok(ok.dataDateText.startsWith('Price data from '));
  assert.equal(ok.staleWarning, CARD_PANEL_COPY.priceStale);
  assert.equal(ok.belowMinimumWarning, '');

  const cheap = describeSuggestion({ ok: true, suggestedPrice: 0.25, belowEbayMinimum: true, basis: {} }, labels);
  assert.equal(cheap.price, 0.25);
  assert.equal(cheap.belowMinimumWarning, CARD_PANEL_COPY.priceBelowMinimum);

  for (const code of ['GRADED_NOT_SUPPORTED', 'LANGUAGE_NOT_COVERED', 'NO_PRICE_FOR_FINISH', 'NO_PRICE_DATA']) {
    const v = describeSuggestion({ ok: false, suggestedPrice: null, code, message: 'server text' }, labels);
    assert.equal(v.price, null);
    assert.ok(v.unavailableText.length > 0);
    assert.ok(!v.unavailableText.includes('server text'));
  }
  const lang = describeSuggestion(
    { ok: false, suggestedPrice: null, code: 'LANGUAGE_NOT_COVERED', englishReference: { price: 4, finish: 'NONFOIL', label: 'x' } },
    labels
  );
  assert.equal(lang.referenceText, 'English reference price: $4.00.');
  assert.equal(describeSuggestion(null, labels).price, null);
  assert.equal(describeSuggestion({ ok: true, suggestedPrice: 0, basis: {} }, labels).price, null);
});

test('search: needs a game plus a name of 2 letters or both set and number; params are trimmed and capped', () => {
  assert.equal(canSearch({ game: '', q: 'bolt', set: '', number: '' }), false);
  assert.equal(canSearch({ game: 'MTG', q: 'b', set: '', number: '' }), false);
  assert.equal(canSearch({ game: 'MTG', q: '!!', set: '', number: '' }), false);
  assert.equal(canSearch({ game: 'MTG', q: 'bo', set: '', number: '' }), true);
  assert.equal(canSearch({ game: 'MTG', q: '', set: 'lea', number: '' }), false);
  assert.equal(canSearch({ game: 'MTG', q: '', set: 'lea', number: '161' }), true);
  assert.deepEqual(buildSearchParams({ game: 'MTG', q: ' bolt ', set: '', number: ' 161 ' }), { game: 'MTG', limit: 20, q: 'bolt', number: '161' });
});

test('search: results are read from the top level or from data, and bad rows are dropped', () => {
  const row = { id: 'SCRYFALL:1', name: 'Lightning Bolt', setCode: 'lea', imageSmallUrl: 'https://example.invalid/a.jpg' };
  const top = readSearchResults({ success: true, catalogReady: true, results: [row, { nope: true }], capped: true, data: { results: [row], capped: true } });
  assert.equal(top.results.length, 1);
  assert.equal(top.capped, true);
  assert.equal(top.catalogReady, true);
  const nested = readSearchResults({ data: { results: [row] }, catalogReady: false });
  assert.equal(nested.results.length, 1);
  assert.equal(nested.catalogReady, false);
  assert.deepEqual(readSearchResults(null).results, []);
  assert.equal(
    printingMeta({ id: 'x', name: 'n', setCode: 'lea', setName: 'Alpha', collectorNumber: '161', rarity: 'common', releaseYear: 1993 }),
    'Alpha (LEA) #161 · Common · 1993'
  );
  assert.equal(printingMeta({ id: 'x', name: 'n' }), '');
});

test('catalog status: not ready, game not covered, and unknown status never blocks lookup', () => {
  const games = vocab().games;
  assert.equal(lookupAvailability(readStatus({ catalogReady: false, readyGames: [], dataAsOf: {} }), 'MTG', games), 'catalogOff');
  assert.equal(lookupAvailability(readStatus({ catalogReady: true, readyGames: ['MTG'], dataAsOf: {} }), '', games), 'chooseGame');
  assert.equal(lookupAvailability(readStatus({ catalogReady: true, readyGames: ['MTG'], dataAsOf: {} }), 'MTG', games), 'ok');
  assert.equal(lookupAvailability(readStatus({ catalogReady: true, readyGames: ['MTG'], dataAsOf: {} }), 'LORCANA', games), 'gameNotCovered');
  assert.equal(lookupAvailability(readStatus({ catalogReady: true, readyGames: ['MTG'], dataAsOf: {} }), 'POKEMON', [{ code: 'POKEMON', label: 'Pokemon', catalogBacked: true }]), 'gameNotCovered');
  assert.equal(lookupAvailability(UNKNOWN_STATUS, 'MTG', games), 'ok');
  assert.equal(readStatus(undefined).known, false);
  assert.equal(readStatus({ success: true }).known, false);
});

test('credit line: names only the sources that have data', () => {
  assert.equal(creditLine(readStatus({ catalogReady: true, dataAsOf: { SCRYFALL: '2026-10-01T00:00:00Z', TCGCSV: null } })), 'Card data: Scryfall');
  assert.equal(creditLine(readStatus({ catalogReady: true, dataAsOf: { SCRYFALL: '2026-10-01T00:00:00Z', TCGCSV: '2026-10-01T00:00:00Z' } })), 'Card data: Scryfall and TCGCSV');
  assert.equal(creditLine(UNKNOWN_STATUS), '');
});

test('errors: plain wording for network, validation, rate limit, missing item and server errors', () => {
  assert.equal(readApiError(new Error('Network Error')).message, CARD_PANEL_COPY.errorNetwork);
  assert.equal(readApiError({ response: { status: 429, data: { code: 'RATE_LIMITED' } } }).message, CARD_PANEL_COPY.errorRateLimited);
  assert.equal(readApiError({ response: { status: 404, data: { code: 'ITEM_NOT_FOUND' } } }).message, CARD_PANEL_COPY.errorItemNotFound);
  assert.equal(readApiError({ response: { status: 404, data: { code: 'CARD_NOT_FOUND' } } }).message, CARD_PANEL_COPY.errorCardNotFound);
  assert.equal(readApiError({ response: { status: 403, data: { code: 'FORBIDDEN' } } }).message, CARD_PANEL_COPY.errorForbidden);
  assert.equal(readApiError({ response: { status: 500, data: { code: 'SERVER_ERROR' } } }).message, CARD_PANEL_COPY.errorServer);
  assert.equal(readApiError({ response: { status: 418, data: {} } }).message, CARD_PANEL_COPY.errorGeneric);
  const v = readApiError({
    response: { status: 400, data: { code: 'CARD_VALIDATION', error: 'raw', issues: [{ path: 'releaseYear', message: 'releaseYear must be a whole year between 1900 and 2100.' }] } },
  });
  assert.equal(v.code, 'CARD_VALIDATION');
  assert.ok(v.message.includes(FIELD_LABELS.releaseYear));
  assert.ok(!v.message.includes('releaseYear'));
});

test('suggested title: built only from typed card fields, never longer than 80 characters', () => {
  const v = vocab();
  assert.equal(
    buildSuggestedTitle(form({ game: 'MTG', cardName: 'Lightning Bolt', setName: 'Alpha', collectorNumber: '161', finish: 'FOIL', conditionCode: 'NM' }), false, v),
    'Lightning Bolt - Alpha #161 - Magic: The Gathering - Foil - Near Mint'
  );
  assert.equal(
    buildSuggestedTitle(form({ game: 'MTG', cardName: 'Black Lotus', finish: 'NONFOIL', grader: 'PSA', grade: '10', conditionCode: 'NM' }), true, v),
    'Black Lotus - Magic: The Gathering - PSA 10'
  );
  assert.equal(buildSuggestedTitle(form({ game: 'MTG' }), false, v), null);
  const long = buildSuggestedTitle(form({ game: 'MTG', cardName: 'N'.repeat(70), setName: 'S'.repeat(40), conditionCode: 'NM' }), false, v) as string;
  assert.ok(long.length <= 80);
  assert.ok(buildSuggestedTitle(form({ game: 'MTG', cardName: 'N'.repeat(120) }), false, v)!.length <= 80);
  assert.ok(!(buildSuggestedTitle(form({ game: 'MTG', cardName: 'A', conditionCode: 'NM' }), false, v) as string).includes('—'));
});

// ---------------------------------------------------------------------------
// Copy lint: every user-facing string constant (ADR-134 / common brief rule 6)
// ---------------------------------------------------------------------------

function lintCopy(text: string, where: string): void {
  assert.ok(text.trim().length > 0, `${where} is empty`);
  assert.ok(!/\bAI\b/i.test(text), `${where} contains the word AI: ${text}`);
  assert.ok(!/estate\s+sales?/i.test(text), `${where} contains "estate sale": ${text}`);
  assert.ok(!text.includes('—'), `${where} contains an em dash: ${text}`);
  assert.ok(!text.includes('–'), `${where} contains an en dash: ${text}`);
  assert.ok(!/TODO|TBD|lorem|placeholder|\[your|<paste|\{\{/i.test(text), `${where} looks like placeholder text: ${text}`);
  assert.ok(!/\s{2,}/.test(text), `${where} has doubled spaces: ${text}`);
}

test('copy lint: constants and templates have no "AI", no "estate sale", no dashes, no placeholders', () => {
  for (const [key, value] of Object.entries(CARD_PANEL_COPY)) lintCopy(value, `CARD_PANEL_COPY.${key}`);
  lintCopy(CARD_PANEL_TEMPLATES.resultsCount(1), 'resultsCount(1)');
  lintCopy(CARD_PANEL_TEMPLATES.resultsCount(7), 'resultsCount(7)');
  lintCopy(CARD_PANEL_TEMPLATES.dataFrom('Oct 3, 2026'), 'dataFrom');
  lintCopy(CARD_PANEL_TEMPLATES.suggestedPriceBasis('Near Mint', 'Foil'), 'suggestedPriceBasis');
  lintCopy(CARD_PANEL_TEMPLATES.englishReference('$4.00'), 'englishReference');
  lintCopy(CARD_PANEL_TEMPLATES.lockedFor('Card name'), 'lockedFor');
  lintCopy(CARD_PANEL_TEMPLATES.resetFor('Card name'), 'resetFor');
  lintCopy(CARD_PANEL_TEMPLATES.tooLong('Card name', 200), 'tooLong');
  for (const [field, label] of Object.entries(FIELD_LABELS)) lintCopy(label, `FIELD_LABELS.${field}`);
});

test('copy lint: required wording from the ADR is exact', () => {
  assert.equal(CARD_PANEL_COPY.noMatch, 'No match. You can enter the details by hand.');
  assert.equal(CARD_PANEL_COPY.catalogOff, 'Card lookup is not available right now. You can still enter card details by hand.');
  assert.equal(CARD_PANEL_COPY.resetToCatalog, 'Reset to catalog value');
  assert.equal(CARD_PANEL_COPY.useSuggestedPrice, 'Use suggested price');
  assert.equal(CARD_PANEL_COPY.suggestedTitle, 'Use suggested title');
});
