/**
 * cardRecordService (ADR-134 #640, batch B2). NOT executed when written (jest cannot run on the
 * authoring device); CI is the first real run. The database is an in-memory fake, the service has no
 * other dependency.
 *
 * Covers ADR-134 section 12 B2 acceptance items:
 *   (1) unknown key -> CARD_VALIDATION          (3) same data twice -> same dedupKey
 *   (4) lockedFields survive apply-printing      (5) graded + conditionCode rejected
 *   (7) selects never expose lockedFields (public), dedupKey, organizerId
 * plus releaseYear bounds, game required, vocabulary normalization, and "no paid AI call".
 * Items (2) and (6) are covered in itemCardRoutes.test.ts and itemControllerCard.test.ts.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  CARD_EDIT_SELECT,
  CARD_FIELDS,
  CARD_PUBLIC_SELECT,
  applyPrintingTx,
  buildCardCreateData,
  buildCardNestedUpsert,
  collectorNumerator,
  computeDedupKey,
  isCardNotFoundError,
  isCardValidationError,
  normalizeCardName,
  parseCardInput,
  planCardWrite,
  upsertItemCardTx,
} from '../services/cardRecordService';
import { makeFakeCardDb, printingRow } from './__fixtures__/fakeCardDb';

const ctx = { itemId: 'item_1', organizerId: 'org_1' };

function expectValidationError(fn: () => unknown): any {
  try {
    fn();
  } catch (err) {
    expect(isCardValidationError(err)).toBe(true);
    expect((err as any).code).toBe('CARD_VALIDATION');
    expect((err as any).status).toBe(400);
    return err;
  }
  throw new Error('expected a CARD_VALIDATION error');
}

async function expectRejectsValidation(p: Promise<unknown>): Promise<any> {
  try {
    await p;
  } catch (err) {
    expect(isCardValidationError(err)).toBe(true);
    return err;
  }
  throw new Error('expected a CARD_VALIDATION rejection');
}

describe('(1) strict whitelist: unknown keys are rejected, never ignored', () => {
  it('rejects an unknown key', () => {
    const err = expectValidationError(() => parseCardInput({ game: 'MTG', bogus: 1 }));
    expect(err.message).toMatch(/bogus/);
  });

  it.each(['lockedFields', 'dedupKey', 'organizerId', 'itemId', 'catalogPrintingId', 'id'])(
    'rejects the server-owned key %s',
    (key) => {
      expectValidationError(() => parseCardInput({ game: 'MTG', [key]: 'x' }));
    }
  );

  it('rejects a non-object', () => {
    expectValidationError(() => parseCardInput(null));
    expectValidationError(() => parseCardInput([1]));
    expectValidationError(() => parseCardInput(5));
  });

  it('accepts a JSON string (multipart item creation) and still rejects unknown keys inside it', () => {
    expect(parseCardInput('{"game":"mtg"}').game).toBe('MTG');
    expectValidationError(() => parseCardInput('{"game":"MTG","bogus":true}'));
    expectValidationError(() => parseCardInput('{not json'));
  });

  it('upsertItemCardTx with an unknown key writes nothing', async () => {
    const db = makeFakeCardDb();
    await expectRejectsValidation(upsertItemCardTx(db, ctx, { game: 'MTG', bogus: 1 }));
    expect(db.cards.size).toBe(0);
  });

  it('the whitelist is exactly the documented card fields', () => {
    expect([...CARD_FIELDS].sort()).toEqual(
      [
        'game', 'productType', 'cardName', 'setCode', 'setName', 'collectorNumber', 'language', 'finish',
        'rarity', 'conditionCode', 'grader', 'grade', 'certNumber', 'releaseYear', 'scryfallId',
        'tcgplayerProductId', 'cardmarketId',
      ].sort()
    );
  });
});

describe('vocabulary normalization and bounds', () => {
  it('canonicalizes case and numeric grades', () => {
    const p = parseCardInput({ game: 'mtg', grader: 'psa', grade: 10, finish: 'foil', language: 'EN', setCode: 'LEA' });
    expect(p).toMatchObject({ game: 'MTG', grader: 'PSA', grade: '10', finish: 'FOIL', language: 'en', setCode: 'lea' });
    expect(parseCardInput({ grade: 9.5 }).grade).toBe('9.5');
    expect(parseCardInput({ grader: 'bgs', grade: 'authentic' })).toMatchObject({ grader: 'BGS', grade: 'Authentic' });
  });

  it('rejects values outside the vocabulary', () => {
    expectValidationError(() => parseCardInput({ game: 'CHESS' }));
    expectValidationError(() => parseCardInput({ conditionCode: 'MINT' }));
    expectValidationError(() => parseCardInput({ grader: 'ACME' }));
    expectValidationError(() => parseCardInput({ grade: '11' }));
    expectValidationError(() => parseCardInput({ finish: 'SHINY' }));
    expectValidationError(() => parseCardInput({ language: 'xx' }));
  });

  it('releaseYear accepts 1900 to 2100 (and null) and rejects everything else', () => {
    expect(parseCardInput({ releaseYear: 1900 }).releaseYear).toBe(1900);
    expect(parseCardInput({ releaseYear: 2100 }).releaseYear).toBe(2100);
    expect(parseCardInput({ releaseYear: '1999' }).releaseYear).toBe(1999);
    expect(parseCardInput({ releaseYear: null }).releaseYear).toBeNull();
    expectValidationError(() => parseCardInput({ releaseYear: 1899 }));
    expectValidationError(() => parseCardInput({ releaseYear: 2101 }));
    expectValidationError(() => parseCardInput({ releaseYear: 1999.5 }));
    expectValidationError(() => parseCardInput({ releaseYear: 'soon' }));
  });

  it('certNumber is capped at 30 characters and control characters are stripped', () => {
    expect(() => parseCardInput({ certNumber: 'x'.repeat(31) })).toThrow();
    expect(parseCardInput({ certNumber: 'x'.repeat(30) }).certNumber).toHaveLength(30);
    expect(parseCardInput({ cardName: 'Bolt\u0000  ' }).cardName).toBe('Bolt');
    expect(parseCardInput({ cardName: '   ' }).cardName).toBeNull();
  });

  it('game is required to create a card and can never be cleared', () => {
    expectValidationError(() => buildCardCreateData({ cardName: 'Bolt' }));
    expectValidationError(() => planCardWrite({ game: 'MTG' }, parseCardInput({ game: null })));
    const db = makeFakeCardDb();
    return expectRejectsValidation(upsertItemCardTx(db, ctx, { cardName: 'Bolt' }));
  });
});

describe('(5) graded cards cannot also carry a condition', () => {
  it('rejects grader plus conditionCode in one request', async () => {
    const db = makeFakeCardDb();
    const err = await expectRejectsValidation(
      upsertItemCardTx(db, ctx, { game: 'POKEMON', grader: 'PSA', grade: '10', conditionCode: 'NM' })
    );
    expect(err.issues[0].path).toBe('conditionCode');
    expect(db.cards.size).toBe(0);
    expectValidationError(() => buildCardCreateData({ game: 'MTG', grader: 'BGS', conditionCode: 'LP' }));
  });

  it('accepts a graded card with conditionCode null, and an ungraded card with a condition', async () => {
    const db = makeFakeCardDb();
    const graded = await upsertItemCardTx(db, ctx, { game: 'POKEMON', grader: 'PSA', grade: '10', conditionCode: null, certNumber: '12345678' });
    expect(graded.grader).toBe('PSA');
    expect(graded.conditionCode).toBeNull();
    const db2 = makeFakeCardDb();
    const raw = await upsertItemCardTx(db2, ctx, { game: 'MTG', conditionCode: 'LP' });
    expect(raw.conditionCode).toBe('LP');
  });

  it('rejects adding a grader to a card that still stores a condition, until the condition is cleared', async () => {
    const db = makeFakeCardDb();
    await upsertItemCardTx(db, ctx, { game: 'MTG', conditionCode: 'NM' });
    await expectRejectsValidation(upsertItemCardTx(db, ctx, { grader: 'PSA', grade: '9' }));
    expect(db.cards.get(ctx.itemId).grader).toBeNull();
    const ok = await upsertItemCardTx(db, ctx, { grader: 'PSA', grade: '9', conditionCode: null });
    expect(ok.grader).toBe('PSA');
    expect(ok.conditionCode).toBeNull();
  });
});

describe('(3) dedupKey is deterministic and server-computed', () => {
  it('two PUTs with the same data give the same dedupKey', async () => {
    const db = makeFakeCardDb();
    const body = { game: 'MTG', cardName: 'Lightning Bolt', setCode: 'LEA', collectorNumber: '161', language: 'en', finish: 'NONFOIL', conditionCode: 'NM' };
    await upsertItemCardTx(db, ctx, body);
    const first = db.cards.get(ctx.itemId).dedupKey;
    await upsertItemCardTx(db, ctx, body);
    const second = db.cards.get(ctx.itemId).dedupKey;
    expect(first).toMatch(/^[0-9a-f]{40}$/);
    expect(second).toBe(first);
    expect(db.calls.cardCreate).toBe(1);
    expect(db.calls.cardUpdate).toBe(1);
  });

  it('does not depend on key order, case or collector-number noise', () => {
    const a = computeDedupKey({ game: 'MTG', setCode: 'LEA', collectorNumber: '161/295', cardName: 'Lightning Bolt', language: 'en', finish: 'NONFOIL', conditionCode: 'NM' });
    const b = computeDedupKey({ conditionCode: 'NM', finish: 'NONFOIL', language: 'en', cardName: 'lightning  BOLT', collectorNumber: '0161', setCode: 'lea', game: 'MTG' });
    expect(b).toBe(a);
  });

  it('differs when a keyed attribute differs', () => {
    const base = { game: 'MTG', setCode: 'lea', collectorNumber: '161', cardName: 'Lightning Bolt', language: 'en', finish: 'NONFOIL', conditionCode: 'NM' };
    const key = computeDedupKey(base);
    expect(computeDedupKey({ ...base, finish: 'FOIL' })).not.toBe(key);
    expect(computeDedupKey({ ...base, conditionCode: 'LP' })).not.toBe(key);
    expect(computeDedupKey({ ...base, language: 'ja' })).not.toBe(key);
    expect(computeDedupKey({ ...base, catalogPrintingId: 'SCRYFALL:x' })).not.toBe(key);
  });

  it('a graded card with a cert number never collides with another cert', () => {
    const base = { game: 'POKEMON', setCode: 'base1', collectorNumber: '4', cardName: 'Charizard', grader: 'PSA', grade: '10' };
    expect(computeDedupKey({ ...base, certNumber: '111' })).not.toBe(computeDedupKey({ ...base, certNumber: '222' }));
    expect(computeDedupKey({ ...base, certNumber: '111' })).not.toBe(computeDedupKey({ ...base, grader: undefined, grade: undefined, conditionCode: 'NM' }));
  });

  it('helpers normalize names and collector numbers', () => {
    expect(normalizeCardName("Jace, the Mind Sculptor")).toBe('jace the mind sculptor');
    expect(normalizeCardName('Lim-Dul’s Vault')).toBe('lim dul s vault');
    expect(normalizeCardName('Élan')).toBe('elan');
    expect(collectorNumerator('138/195')).toBe('138');
    expect(collectorNumerator('007')).toBe('7');
    expect(collectorNumerator('0')).toBe('0');
    expect(collectorNumerator(null)).toBe('');
  });

  it('a client cannot supply dedupKey (strict) and it is recomputed when the card changes', async () => {
    const db = makeFakeCardDb();
    await expectRejectsValidation(upsertItemCardTx(db, ctx, { game: 'MTG', dedupKey: 'a'.repeat(40) }));
    await upsertItemCardTx(db, ctx, { game: 'MTG', cardName: 'Bolt', conditionCode: 'NM' });
    const before = db.cards.get(ctx.itemId).dedupKey;
    await upsertItemCardTx(db, ctx, { conditionCode: 'LP' });
    expect(db.cards.get(ctx.itemId).dedupKey).not.toBe(before);
  });
});

describe('lockedFields maintenance', () => {
  it('locks fields that differ from the stored value and leaves unchanged fields alone', async () => {
    const db = makeFakeCardDb();
    await upsertItemCardTx(db, ctx, { game: 'MTG', cardName: 'Bolt' });
    expect(db.cards.get(ctx.itemId).lockedFields).toEqual(['game', 'cardName']);
    // same values again: no new locks
    await upsertItemCardTx(db, ctx, { game: 'MTG', cardName: 'Bolt' });
    expect(db.cards.get(ctx.itemId).lockedFields).toEqual(['game', 'cardName']);
    // a changed field joins the lock set, an omitted field is untouched
    await upsertItemCardTx(db, ctx, { setName: 'Alpha' });
    const row = db.cards.get(ctx.itemId);
    expect(row.lockedFields).toEqual(['game', 'cardName', 'setName']);
    expect(row.cardName).toBe('Bolt');
  });

  it('null on an empty field is not a change, null on a filled field is', async () => {
    const db = makeFakeCardDb();
    await upsertItemCardTx(db, ctx, { game: 'MTG', rarity: null });
    expect(db.cards.get(ctx.itemId).lockedFields).toEqual(['game']);
    await upsertItemCardTx(db, ctx, { cardName: 'Bolt' });
    await upsertItemCardTx(db, ctx, { cardName: null });
    expect(db.cards.get(ctx.itemId).cardName).toBeNull();
    expect(db.cards.get(ctx.itemId).lockedFields).toContain('cardName');
  });

  it('the server supplies organizerId and itemId, never the request', async () => {
    const db = makeFakeCardDb();
    await upsertItemCardTx(db, ctx, { game: 'MTG' });
    const row = db.cards.get(ctx.itemId);
    expect(row.itemId).toBe('item_1');
    expect(row.organizerId).toBe('org_1');
    expect(row.catalogPrintingId).toBeUndefined();
  });

  it('buildCardCreateData and buildCardNestedUpsert produce server-owned columns only', () => {
    const create = buildCardCreateData({ game: 'MTG', cardName: 'Bolt' }, 'org_1');
    expect(create).toMatchObject({ game: 'MTG', cardName: 'Bolt', organizerId: 'org_1', catalogPrintingId: null });
    expect(create.dedupKey).toMatch(/^[0-9a-f]{40}$/);
    expect(create.lockedFields).toEqual(['game', 'cardName']);
    expect((create as any).itemId).toBeUndefined();

    const upsert = buildCardNestedUpsert({ game: 'MTG', cardName: 'Bolt', lockedFields: ['game'], catalogPrintingId: 'SCRYFALL:x' }, { setName: 'Alpha' }, 'org_1');
    expect(upsert.update.lockedFields).toEqual(['game', 'setName']);
    expect((upsert.update as any).catalogPrintingId).toBeUndefined();
    expect((upsert.update as any).itemId).toBeUndefined();
    expect(upsert.create.catalogPrintingId).toBe('SCRYFALL:x');
    const fresh = buildCardNestedUpsert(null, { game: 'POKEMON' }, null);
    expect(fresh.create.game).toBe('POKEMON');
    expectValidationError(() => buildCardNestedUpsert(null, { cardName: 'x' }, null));
  });
});

describe('(4) apply-printing never overwrites a locked field', () => {
  const printing = printingRow();

  it('fills unlocked fields from the catalog and keeps what the seller typed', async () => {
    const db = makeFakeCardDb({ printings: [printing] });
    await upsertItemCardTx(db, ctx, { game: 'MTG', cardName: 'My Typed Name', conditionCode: 'LP' });
    const out = await applyPrintingTx(db, ctx, { printingId: printing.id });
    expect(out.cardName).toBe('My Typed Name'); // locked: typed by the seller
    expect(out.conditionCode).toBe('LP');
    expect(out.setCode).toBe('lea'); // not locked: filled from the catalog
    expect(out.setName).toBe('Limited Edition Alpha');
    expect(out.collectorNumber).toBe('161');
    expect(out.releaseYear).toBe(1993);
    expect(out.scryfallId).toBe('aaaa-bbbb');
    expect(out.tcgplayerProductId).toBe(12345);
    expect(out.catalogPrintingId).toBe(printing.id);
    expect(out.finish).toBe('NONFOIL'); // catalog lists exactly one finish
    expect(out.lockedFields).toEqual(['game', 'cardName', 'conditionCode']); // catalog writes never add locks
    expect(db.cards.get(ctx.itemId).dedupKey).toBe(computeDedupKey({ ...db.cards.get(ctx.itemId), catalogPrintingId: printing.id }));
  });

  it('resetFields unlocks a field and refreshes it from the catalog', async () => {
    const db = makeFakeCardDb({ printings: [printing] });
    await upsertItemCardTx(db, ctx, { game: 'MTG', cardName: 'My Typed Name' });
    const out = await applyPrintingTx(db, ctx, { printingId: printing.id, resetFields: ['cardName'] });
    expect(out.cardName).toBe('Lightning Bolt');
    expect(out.lockedFields).toEqual(['game']);
  });

  it('creates the card (empty lockedFields, server-set organizerId) when the item has none', async () => {
    const db = makeFakeCardDb({ printings: [printing] });
    const out = await applyPrintingTx(db, ctx, { printingId: printing.id });
    expect(out.game).toBe('MTG');
    expect(out.cardName).toBe('Lightning Bolt');
    expect(out.lockedFields).toEqual([]);
    expect(db.cards.get(ctx.itemId).organizerId).toBe('org_1');
  });

  it('leaves finish alone when the catalog lists more than one, and ignores an unknown language', async () => {
    const multi = printingRow({ id: 'SCRYFALL:multi', finishes: ['nonfoil', 'foil'], language: 'xx' });
    const db = makeFakeCardDb({ printings: [multi] });
    await upsertItemCardTx(db, ctx, { game: 'MTG', finish: 'FOIL', language: 'ja' });
    const out = await applyPrintingTx(db, ctx, { printingId: 'SCRYFALL:multi', resetFields: ['finish', 'language'] });
    expect(out.finish).toBe('FOIL');
    expect(out.language).toBe('ja');
  });

  it('rejects an unknown printing (404 code), unknown body keys, bad resetFields and unsupported games', async () => {
    const db = makeFakeCardDb({ printings: [printing, printingRow({ id: 'TCGCSV:1', game: 'DIGIMON' })] });
    try {
      await applyPrintingTx(db, ctx, { printingId: 'SCRYFALL:missing' });
      throw new Error('expected rejection');
    } catch (err) {
      expect(isCardNotFoundError(err)).toBe(true);
    }
    await expectRejectsValidation(applyPrintingTx(db, ctx, { printingId: printing.id, itemId: 'other' }));
    await expectRejectsValidation(applyPrintingTx(db, ctx, { printingId: printing.id, resetFields: ['dedupKey'] }));
    await expectRejectsValidation(applyPrintingTx(db, ctx, { resetFields: [] }));
    await expectRejectsValidation(applyPrintingTx(db, ctx, { printingId: 'TCGCSV:1' }));
    expect(db.cards.size).toBe(0);
  });
});

describe('(7) selects: what a card block may expose', () => {
  it('the public select has no lockedFields, dedupKey, organizerId, itemId or catalogPrintingId', () => {
    const keys = Object.keys(CARD_PUBLIC_SELECT);
    for (const forbidden of ['lockedFields', 'dedupKey', 'organizerId', 'itemId', 'catalogPrintingId', 'id']) {
      expect(keys).not.toContain(forbidden);
    }
    expect(keys).toEqual(expect.arrayContaining(['game', 'cardName', 'grader', 'grade', 'releaseYear']));
  });

  it('the owner select adds lockedFields and catalogPrintingId but never dedupKey or organizerId', () => {
    const keys = Object.keys(CARD_EDIT_SELECT);
    expect(keys).toContain('lockedFields');
    expect(keys).toContain('catalogPrintingId');
    expect(keys).not.toContain('dedupKey');
    expect(keys).not.toContain('organizerId');
    expect(keys).not.toContain('itemId');
  });

  it('what the writers return never contains dedupKey or organizerId', async () => {
    const db = makeFakeCardDb({ printings: [printingRow()] });
    const created = await upsertItemCardTx(db, ctx, { game: 'MTG' });
    const applied = await applyPrintingTx(db, ctx, { printingId: 'SCRYFALL:aaaa-bbbb' });
    for (const out of [created, applied]) {
      expect(out).not.toHaveProperty('dedupKey');
      expect(out).not.toHaveProperty('organizerId');
      expect(out).not.toHaveProperty('itemId');
    }
  });
});

describe('card record writes call no paid AI service', () => {
  it('neither the service nor the controller imports an AI, vision or HTTP client', () => {
    const files = [
      path.join(__dirname, '../services/cardRecordService.ts'),
      path.join(__dirname, '../controllers/itemCardController.ts'),
      path.join(__dirname, '../routes/itemCard.ts'),
      path.join(__dirname, '../constants/cardVocabulary.ts'),
    ];
    for (const file of files) {
      const importLines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => /^\s*import\b/.test(l) || /require\(/.test(l));
      for (const line of importLines) {
        expect(line).not.toMatch(/cloudAIService|anthropic|vision|openai|axios|node-fetch|stripe|ebay/i);
      }
    }
  });

  it('cardRecordService reads no environment variable', () => {
    const src = fs.readFileSync(path.join(__dirname, '../services/cardRecordService.ts'), 'utf8');
    expect(src).not.toMatch(/process\.env/);
  });
});
