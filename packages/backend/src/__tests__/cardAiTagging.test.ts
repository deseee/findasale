/**
 * Card-aware photo tagging (same Haiku call, no extra API call). NOT executed when written (jest cannot run on
 * the authoring device); CI is the first real run. No network, no database, no paid service: the card database is
 * the in-memory fake used by cardRecordService.test.ts and the AI call itself is never made (the model output is
 * a literal object handed to the normalizer).
 *
 * Covers:
 *   (1) card JSON parsed and normalized               (4) organizer-set / locked card fields are never overwritten
 *   (2) bad values dropped, never thrown              (5) conditionCode stays unconfirmed, so the eBay push is still refused
 *   (3) non-card output unchanged (generic grade kept, default B still applies)
 */
import * as fs from 'fs';
import * as path from 'path';

jest.mock('../lib/aiCostTracker', () => ({}));
jest.mock('../services/imageMatchService', () => ({}));
jest.mock('../services/ebayImageSearchService', () => ({}));
jest.mock('../services/pricingEngine', () => ({}));
jest.mock('../services/pricingEngine/adapters/discogs', () => ({}));

import { applyCardAwareness, AITagResult } from '../services/cloudAIService';
import {
  applyAiCardResult,
  buildCardConditionSuggestion,
  normalizeAiCard,
  persistAiCard,
  readCardConditionSuggestion,
} from '../services/cardAiSuggestion';
import { upsertItemCardTx } from '../services/cardRecordService';
import { lookupCardConditionValueId } from '../config/cardEbayCategories';
import { makeFakeCardDb } from './__fixtures__/fakeCardDb';

const ctx = { itemId: 'item_1', organizerId: 'org_1' };
const PINNED = ['183454', '183050', '261328'];

/** Fake database with the Item calls the suggestion store needs. */
function makeDb(catalogSuggestions: unknown = null) {
  const db: any = makeFakeCardDb();
  const itemRow: any = { id: 'item_1', catalogSuggestions };
  db.itemRow = itemRow;
  db.item = {
    findUnique: async () => ({ ...itemRow }),
    update: async ({ data }: any) => {
      Object.assign(itemRow, data);
      return { ...itemRow };
    },
  };
  return db;
}

const MODEL_CARD = {
  game: 'Magic: The Gathering',
  cardName: 'Lightning Bolt',
  setName: 'Limited Edition Alpha',
  setCode: 'LEA',
  collectorNumber: 161,
  language: 'English',
  finish: 'non-foil',
  suggestedCardCondition: 'near mint',
  grader: null,
  grade: null,
  certNumber: null,
};

describe('(1) card JSON is parsed and normalized', () => {
  it('maps an ungraded model card onto the vocabulary', () => {
    expect(normalizeAiCard(MODEL_CARD)).toEqual({
      game: 'MTG',
      cardName: 'Lightning Bolt',
      setName: 'Limited Edition Alpha',
      setCode: 'lea',
      collectorNumber: '161',
      language: 'en',
      finish: 'NONFOIL',
      suggestedCardCondition: 'NM',
    });
  });

  it('keeps grader, grade and cert for a slab and ignores any ungraded condition the model also sent', () => {
    const card = normalizeAiCard({ game: 'pokemon', cardName: 'Charizard', grader: 'psa', grade: 9, certNumber: ' 1234 5678 ', suggestedCardCondition: 'NM' });
    expect(card).toEqual({ game: 'POKEMON', cardName: 'Charizard', grader: 'PSA', grade: '9', certNumber: '12345678' });
    expect(card?.suggestedCardCondition).toBeUndefined();
  });

  it('accepts a half grade and maps sports cards to OTHER', () => {
    expect(normalizeAiCard({ game: 'baseball', grader: 'BGS', grade: '9.5' })).toEqual({ game: 'OTHER', grader: 'BGS', grade: '9.5' });
  });

  it('builds a suggestion for the ungraded and graded shapes, and none when the model offered no condition', () => {
    const ungraded = buildCardConditionSuggestion(normalizeAiCard(MODEL_CARD)!);
    expect(ungraded).toMatchObject({ conditionCode: 'NM', source: 'haiku' });
    const graded = buildCardConditionSuggestion(normalizeAiCard({ game: 'MTG', grader: 'PSA', grade: '10', certNumber: '99' })!);
    expect(graded).toMatchObject({ grader: 'PSA', grade: '10', certNumber: '99' });
    expect(graded?.conditionCode).toBeUndefined();
    expect(buildCardConditionSuggestion(normalizeAiCard({ game: 'MTG', cardName: 'Island' })!)).toBeNull();
  });
});

describe('(2) bad values are dropped, never thrown', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'MTG'],
    ['a number', 7],
    ['an array', [{ game: 'MTG' }]],
    ['an empty object', {}],
    ['an unknown game', { game: 'Klingon Trading Game', cardName: 'X' }],
    ['a game that is not a string', { game: { name: 'MTG' } }],
  ])('%s gives no card', (_label, raw) => {
    expect(() => normalizeAiCard(raw)).not.toThrow();
    expect(normalizeAiCard(raw)).toBeNull();
  });

  it('drops a bad condition, language, finish, set code length and cert, but keeps the rest', () => {
    const card = normalizeAiCard({
      game: 'MTG',
      cardName: 'Island',
      suggestedCardCondition: 'MINT',
      language: 'klingon',
      finish: 'sparkly',
      setCode: 'X'.repeat(40),
      collectorNumber: 'unknown',
    });
    expect(card).toEqual({ game: 'MTG', cardName: 'Island' });
  });

  it('drops a graded claim with an unknown grader or grade, and does not fall back to an ungraded condition', () => {
    expect(normalizeAiCard({ game: 'MTG', grader: 'ZZZ', grade: '9', suggestedCardCondition: 'NM' })).toEqual({ game: 'MTG' });
    expect(normalizeAiCard({ game: 'MTG', grader: 'PSA', grade: 'Gem Mint', suggestedCardCondition: 'NM' })).toEqual({ game: 'MTG' });
    expect(normalizeAiCard({ game: 'MTG', grader: 'PSA', suggestedCardCondition: 'NM' })).toEqual({ game: 'MTG' });
  });

  it('drops a cert number with unsafe characters', () => {
    const card = normalizeAiCard({ game: 'MTG', grader: 'PSA', grade: '9', certNumber: '12<script>' });
    expect(card).toEqual({ game: 'MTG', grader: 'PSA', grade: '9' });
  });

  it('re-validates a stored suggestion and returns null for junk', () => {
    expect(readCardConditionSuggestion({ cardSuggestion: { conditionCode: 'lp', suggestedAt: 'x' } })).toMatchObject({ conditionCode: 'LP' });
    expect(readCardConditionSuggestion({ cardSuggestion: { conditionCode: 'MINT' } })).toBeNull();
    expect(readCardConditionSuggestion({ cardSuggestion: { grader: 'ZZZ', grade: '9' } })).toBeNull();
    expect(readCardConditionSuggestion({ identifiers: { brand: 'x' } })).toBeNull();
    expect(readCardConditionSuggestion(null)).toBeNull();
    expect(readCardConditionSuggestion('nope')).toBeNull();
  });
});

describe('(3) non-card output is unchanged', () => {
  const base = (): AITagResult => ({
    title: 'Brass Floor Lamp',
    description: 'Lamp',
    condition: 'USED',
    suggestedPrice: 20,
    tags: [],
    suggestedConditionGrade: 'A',
  });

  it('a result with no card keeps its generic grade and gets no card key', () => {
    const parsed = base();
    applyCardAwareness(parsed);
    expect(parsed.suggestedConditionGrade).toBe('A');
    expect('card' in parsed).toBe(false);
  });

  it('a card block the normalizer rejects is removed and the generic grade is kept', () => {
    const parsed: any = { ...base(), card: { game: 'Klingon Trading Game' } };
    applyCardAwareness(parsed);
    expect(parsed.suggestedConditionGrade).toBe('A');
    expect('card' in parsed).toBe(false);
  });

  it('a recognized card replaces the generic grade with the card block', () => {
    const parsed: any = { ...base(), card: MODEL_CARD };
    applyCardAwareness(parsed);
    expect(parsed.card.game).toBe('MTG');
    expect(parsed.suggestedConditionGrade).toBeUndefined();
  });

  it('the pipeline sources keep the default B for non-cards, ask for the card block, and skip the generic grade for cards', () => {
    const cloud = fs.readFileSync(path.join(__dirname, '../services/cloudAIService.ts'), 'utf8');
    expect(cloud.split('if (!result.suggestedConditionGrade && !result.card) {').length - 1).toBe(2);
    expect(cloud.split("result.suggestedConditionGrade = 'B';").length - 1).toBe(2);
    expect(cloud.split('applyCardAwareness(parsed);').length - 1).toBe(2);
    expect(cloud.split('Trading card: ONLY if the photo(s) show a single collectible trading card').length - 1).toBe(2);
    expect(cloud.split('"card": null').length - 1).toBe(2);
    const job = fs.readFileSync(path.join(__dirname, '../jobs/processRapidDraft.ts'), 'utf8');
    expect(job).toContain('conditionGrade: aiResult.card ? item.conditionGrade : (aiResult.suggestedConditionGrade || item.conditionGrade),');
    expect(job).toContain('applyAiCardResult(');
  });

  it('the card module makes no network or AI import', () => {
    const src = fs.readFileSync(path.join(__dirname, '../services/cardAiSuggestion.ts'), 'utf8');
    const importLines = src.split('\n').filter((l) => /^\s*import\b/.test(l) || /require\(/.test(l));
    for (const line of importLines) expect(line).not.toMatch(/cloudAIService|anthropic|vision|openai|axios|node-fetch|stripe|ebay/i);
    expect(src).not.toMatch(/process\.env/);
  });
});

describe('persistAiCard: identity only, AI never locks', () => {
  it('creates the card with identity fields and leaves condition, grader, grade, cert and lockedFields empty', async () => {
    const db = makeDb();
    const result = await persistAiCard(db, ctx, normalizeAiCard(MODEL_CARD)!);
    expect(result.status).toBe('created');
    const row = db.cards.get('item_1');
    expect(row).toMatchObject({
      itemId: 'item_1',
      organizerId: 'org_1',
      game: 'MTG',
      cardName: 'Lightning Bolt',
      setName: 'Limited Edition Alpha',
      setCode: 'lea',
      collectorNumber: '161',
      language: 'en',
      finish: 'NONFOIL',
      conditionCode: null,
      grader: null,
      grade: null,
      certNumber: null,
      lockedFields: [],
    });
    expect(row.dedupKey).toMatch(/^[0-9a-f]{40}$/);
    expect(result.suggestion).toMatchObject({ conditionCode: 'NM' });
  });

  it('a graded slab read is a suggestion only: grader, grade and cert are not written to the card', async () => {
    const db = makeDb();
    const result = await persistAiCard(db, ctx, normalizeAiCard({ game: 'POKEMON', cardName: 'Charizard', grader: 'PSA', grade: '9', certNumber: '777' })!);
    expect(result.status).toBe('created');
    const row = db.cards.get('item_1');
    expect(row.grader).toBeNull();
    expect(row.grade).toBeNull();
    expect(row.certNumber).toBeNull();
    expect(result.suggestion).toMatchObject({ grader: 'PSA', grade: '9', certNumber: '777' });
  });

  it('(4) never overwrites an organizer-set value or a locked field, and never changes lockedFields', async () => {
    const db = makeDb();
    db.cards.set('item_1', {
      id: 'card_x',
      itemId: 'item_1',
      organizerId: 'org_1',
      game: 'MTG',
      productType: 'SINGLE',
      cardName: 'Black Lotus', // typed by the organizer
      setName: null, // locked and empty: the organizer cleared it on purpose
      setCode: null,
      collectorNumber: null,
      language: null,
      finish: null,
      conditionCode: null,
      grader: null,
      grade: null,
      certNumber: null,
      lockedFields: ['cardName', 'setName'],
      dedupKey: 'old',
    });
    const result = await persistAiCard(db, ctx, normalizeAiCard(MODEL_CARD)!);
    expect(result.status).toBe('updated');
    const row = db.cards.get('item_1');
    expect(row.cardName).toBe('Black Lotus');
    expect(row.setName).toBeNull();
    expect(row.setCode).toBe('lea'); // empty and unlocked: filled
    expect(row.collectorNumber).toBe('161');
    expect(row.lockedFields).toEqual(['cardName', 'setName']);
    expect(row.conditionCode).toBeNull();
  });

  it('(4) an organizer-confirmed condition is never replaced or re-suggested', async () => {
    const db = makeDb();
    db.cards.set('item_1', {
      id: 'card_x', itemId: 'item_1', organizerId: 'org_1', game: 'MTG', productType: 'SINGLE', cardName: 'Island',
      setName: 'Alpha', setCode: 'lea', collectorNumber: '1', language: 'en', finish: 'NONFOIL',
      conditionCode: 'HP', grader: null, grade: null, certNumber: null, lockedFields: ['conditionCode'], dedupKey: 'old',
    });
    const result = await persistAiCard(db, ctx, normalizeAiCard({ ...MODEL_CARD, suggestedCardCondition: 'NM' })!);
    expect(result.status).toBe('unchanged');
    expect(result.suggestion).toBeNull();
    expect(db.cards.get('item_1').conditionCode).toBe('HP');
  });

  it('a second pass over the same card changes nothing', async () => {
    const db = makeDb();
    await persistAiCard(db, ctx, normalizeAiCard(MODEL_CARD)!);
    const again = await persistAiCard(db, ctx, normalizeAiCard(MODEL_CARD)!);
    expect(again.status).toBe('unchanged');
    expect(db.calls.cardCreate).toBe(1);
    expect(db.calls.cardUpdate).toBe(0);
  });
});

describe('applyAiCardResult: suggestion storage and never throwing', () => {
  it('stores the suggestion on catalogSuggestions without disturbing the enrichment keys', async () => {
    const db = makeDb({ source: 'ebayCatalog', identifiers: { brand: 'Wizards' } });
    const outcome = await applyAiCardResult(db, ctx, normalizeAiCard({ ...MODEL_CARD, suggestedCardCondition: 'LP' })!);
    expect(outcome.status).toBe('created');
    expect(db.itemRow.catalogSuggestions.source).toBe('ebayCatalog');
    expect(db.itemRow.catalogSuggestions.identifiers).toEqual({ brand: 'Wizards' });
    expect(readCardConditionSuggestion(db.itemRow.catalogSuggestions)).toMatchObject({ conditionCode: 'LP' });
  });

  it('writes no suggestion when the model offered no condition', async () => {
    const db = makeDb();
    await applyAiCardResult(db, ctx, normalizeAiCard({ game: 'MTG', cardName: 'Island' })!);
    expect(db.itemRow.catalogSuggestions).toBeNull();
  });

  it('returns an error outcome instead of throwing when the database fails', async () => {
    const db = makeDb();
    db.itemCard.findUnique = async () => {
      throw new Error('db down');
    };
    const outcome = await applyAiCardResult(db, ctx, normalizeAiCard(MODEL_CARD)!);
    expect(outcome.status).toBe('error');
  });
});

describe('(5) the condition stays unconfirmed, so the eBay push is still refused', () => {
  it('the stored card has no condition and no grader, which the eBay resolver treats as unresolved in every pinned category', async () => {
    const db = makeDb();
    await applyAiCardResult(db, ctx, normalizeAiCard(MODEL_CARD)!);
    const row = db.cards.get('item_1');
    // resolveCardCondition: isGraded = grader or grade present (false here), then lookupCardConditionValueId(conditionCode).
    expect(!!((row.grader ?? '').trim() || (row.grade ?? '').trim())).toBe(false);
    for (const category of PINNED) {
      const lookup = lookupCardConditionValueId(row.conditionCode, category);
      expect(lookup.ok).toBe(false);
    }
  });

  it('a slab read from the label is equally unresolved until confirmed (grader and grade are not on the card)', async () => {
    const db = makeDb();
    await applyAiCardResult(db, ctx, normalizeAiCard({ game: 'MTG', grader: 'PSA', grade: '10' })!);
    const row = db.cards.get('item_1');
    expect(row.grader).toBeNull();
    expect(row.grade).toBeNull();
    expect(lookupCardConditionValueId(row.conditionCode, '183454').ok).toBe(false);
  });

  it('after the organizer confirms through the normal card save, the condition resolves and is locked', async () => {
    const db = makeDb();
    await applyAiCardResult(db, ctx, normalizeAiCard(MODEL_CARD)!);
    const saved = await upsertItemCardTx(db, ctx, { conditionCode: 'LP' });
    expect(saved.conditionCode).toBe('LP');
    expect(saved.lockedFields).toContain('conditionCode');
    expect(lookupCardConditionValueId(saved.conditionCode, '183050').ok).toBe(true);
  });

  it('the push path still refuses an unresolved card (resolver call precedes the CARD_CONDITION_UNRESOLVED refusal)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../controllers/ebayController.ts'), 'utf8');
    expect(src).toContain("code: 'CARD_CONDITION_UNRESOLVED'");
    expect(src).toContain("status === 'unresolved'");
  });
});
