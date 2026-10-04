/**
 * Card-aware batch analyze (batchAnalyzeController). NOT executed when written (jest cannot run on the authoring device);
 * CI is the first real run. The controller itself is too heavy to drive end to end (gate, clustering, image downloads), so
 * this covers the shared helper it uses, the card write against an in-memory database in the order the controller runs it
 * (replacing catalogSuggestions first, then applyAiCardResult), and static assertions on the controller source.
 *
 * Covers:
 *   (1) withPreservedCardSuggestion carries a valid stored cardSuggestion across a replacing catalogSuggestions write
 *   (2) the controller order (item update replaces catalogSuggestions, then the card write) keeps the pending suggestion
 *   (3) the card write never writes conditionCode/grader/grade, never overrides a confirmed condition or locked field
 *   (4) a failing card write cannot fail the batch item (applyAiCardResult returns an error outcome, the call site is try/caught)
 *   (5) the controller source is wired: select, preserved write, non-throwing card call, no generic conditionGrade write
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  applyAiCardResult,
  normalizeAiCard,
  readCardConditionSuggestion,
  withPreservedCardSuggestion,
} from '../services/cardAiSuggestion';
import { makeFakeCardDb } from './__fixtures__/fakeCardDb';

const STORED = { conditionCode: 'LP', source: 'haiku', suggestedAt: '2026-10-01T00:00:00.000Z' };
const ENRICHMENT = { source: 'ebayCatalog', identifiers: { brand: 'Wizards' } };
const ctx = { itemId: 'item_1', organizerId: 'org_1' };

function makeDb(catalogSuggestions: unknown = null) {
  const db: any = makeFakeCardDb();
  const row: any = { id: 'item_1', organizerId: 'org_1', catalogSuggestions };
  db.itemRow = row;
  db.item = {
    findUnique: async () => ({ ...row }),
    update: async ({ data }: any) => {
      Object.assign(row, data);
      return { ...row };
    },
  };
  return db;
}

const card = (over: Record<string, unknown> = {}) =>
  normalizeAiCard({ game: 'MTG', cardName: 'Lightning Bolt', setCode: 'LEA', collectorNumber: '161', suggestedCardCondition: 'NM', ...over })!;

describe('(1) withPreservedCardSuggestion', () => {
  it('adds the stored cardSuggestion to an object write', () => {
    const out = withPreservedCardSuggestion({ cardSuggestion: STORED, source: 'old' }, ENRICHMENT);
    expect(out).toEqual({ ...ENRICHMENT, cardSuggestion: STORED });
    expect(out).not.toBe(ENRICHMENT);
  });

  it('makes the suggestion the only key when the write is null (stale suggestion clear)', () => {
    expect(withPreservedCardSuggestion({ cardSuggestion: STORED }, null)).toEqual({ cardSuggestion: STORED });
  });

  it('returns the write unchanged when there is no usable stored suggestion', () => {
    expect(withPreservedCardSuggestion(null, ENRICHMENT)).toBe(ENRICHMENT);
    expect(withPreservedCardSuggestion({ source: 'x' }, null)).toBeNull();
    expect(withPreservedCardSuggestion({ cardSuggestion: { conditionCode: 'ZZ' } }, ENRICHMENT)).toBe(ENRICHMENT);
    expect(withPreservedCardSuggestion([STORED], ENRICHMENT)).toBe(ENRICHMENT);
  });

  it('re-validates the stored value rather than copying it blindly', () => {
    const out = withPreservedCardSuggestion({ cardSuggestion: { ...STORED, extra: 'junk' } }, ENRICHMENT);
    expect(out.cardSuggestion).toEqual(readCardConditionSuggestion({ cardSuggestion: STORED }));
    expect(out.cardSuggestion.extra).toBeUndefined();
  });
});

describe('(2) controller order: replacing catalogSuggestions write, then the card write', () => {
  it('a pending suggestion survives the replacing write and the new card result then refreshes it', async () => {
    const db = makeDb({ cardSuggestion: STORED, old: true });
    // what the controller's item.update writes
    await db.item.update({ data: { catalogSuggestions: withPreservedCardSuggestion(db.itemRow.catalogSuggestions, ENRICHMENT) } });
    expect(db.itemRow.catalogSuggestions).toEqual({ ...ENRICHMENT, cardSuggestion: STORED });
    // then the card write
    const outcome = await applyAiCardResult(db, ctx, card({ suggestedCardCondition: 'MP' }));
    expect(outcome.status).not.toBe('error');
    expect(db.itemRow.catalogSuggestions.source).toBe('ebayCatalog');
    expect(db.itemRow.catalogSuggestions.cardSuggestion).toMatchObject({ conditionCode: 'MP' });
  });

  it('without the helper the replacing write would have dropped the suggestion (guards the regression)', async () => {
    const db = makeDb({ cardSuggestion: STORED });
    await db.item.update({ data: { catalogSuggestions: ENRICHMENT } });
    expect(readCardConditionSuggestion(db.itemRow.catalogSuggestions)).toBeNull();
  });

  it('a fresh item (no stored suggestion) gets the card record and a stored suggestion', async () => {
    const db = makeDb(null);
    const outcome = await applyAiCardResult(db, ctx, card());
    expect(outcome.status).not.toBe('error');
    expect(db.cards.get('item_1')).toBeTruthy();
    expect(db.itemRow.catalogSuggestions.cardSuggestion).toMatchObject({ conditionCode: 'NM', source: 'haiku' });
  });
});

describe('(3) the AI never writes the card condition and never overrides organizer data', () => {
  it('leaves conditionCode, grader, grade and certNumber null on create', async () => {
    const db = makeDb(null);
    await applyAiCardResult(db, ctx, card());
    const row = db.cards.get('item_1');
    expect(row.conditionCode ?? null).toBeNull();
    expect(row.grader ?? null).toBeNull();
    expect(row.grade ?? null).toBeNull();
    expect(row.certNumber ?? null).toBeNull();
  });

  it('keeps a confirmed condition and locked fields, and does not re-suggest over a confirmed condition', async () => {
    const db = makeDb(null);
    db.cards.set('item_1', {
      id: 'card_x', itemId: 'item_1', organizerId: 'org_1', game: 'MTG', productType: 'SINGLE',
      cardName: 'Island', setName: 'Alpha', setCode: 'lea', collectorNumber: '1', language: 'en', finish: 'NONFOIL',
      conditionCode: 'NM', grader: null, grade: null, certNumber: null, lockedFields: ['cardName'], dedupKey: 'old',
    });
    await applyAiCardResult(db, ctx, card({ suggestedCardCondition: 'HP' }));
    const row = db.cards.get('item_1');
    expect(row.conditionCode).toBe('NM');
    expect(row.cardName).toBe('Island');
    expect(readCardConditionSuggestion(db.itemRow.catalogSuggestions)).toBeNull();
  });
});

describe('(4) a card problem never fails the batch item', () => {
  it('applyAiCardResult resolves with an error outcome when the database throws', async () => {
    const db = makeDb(null);
    db.itemCard.findUnique = async () => {
      throw new Error('db down');
    };
    const outcome = await applyAiCardResult(db, ctx, card());
    expect(outcome.status).toBe('error');
  });
});

describe('(5) controller source wiring', () => {
  const src = fs.readFileSync(path.join(__dirname, '../controllers/batchAnalyzeController.ts'), 'utf8');

  it('imports the card helpers', () => {
    expect(src).toMatch(/import \{[^}]*applyAiCardResult[^}]*\} from '\.\.\/services\/cardAiSuggestion'/);
    expect(src).toMatch(/import \{[^}]*withPreservedCardSuggestion[^}]*\} from '\.\.\/services\/cardAiSuggestion'/);
  });

  it('reads the current catalogSuggestions and preserves a pending cardSuggestion in the replacing write', () => {
    expect(src).toMatch(/catalogSuggestions:\s*true/);
    expect(src).toContain('withPreservedCardSuggestion(existing?.catalogSuggestions, catalogSuggestionWrite)');
    // no raw replacing write remains
    expect(src).not.toMatch(/catalogSuggestions:\s*catalogSuggestionWrite\b/);
  });

  it('calls applyAiCardResult after the item update, non-throwing, with the sale organizer', () => {
    const updateIdx = src.indexOf('await prisma.item.update({');
    const cardIdx = src.indexOf('applyAiCardResult(', updateIdx);
    expect(updateIdx).toBeGreaterThan(-1);
    expect(cardIdx).toBeGreaterThan(updateIdx);
    const block = src.slice(src.lastIndexOf('if (cloudCard)', cardIdx), cardIdx + 1200);
    expect(block).toContain('try {');
    expect(block).toContain('catch (cardErr');
    expect(block).toContain('prisma as unknown as AiCardDb');
    expect(block).toContain('organizerId: sale.organizerId');
    expect(block).toContain('cloudCard,');
    expect(src).toContain('cloudCard = analysis?.card ?? null;');
  });

  it('never writes a generic conditionGrade on this path', () => {
    expect(src).not.toMatch(/conditionGrade\s*:/);
    expect(src).not.toContain('suggestedConditionGrade');
  });
});
