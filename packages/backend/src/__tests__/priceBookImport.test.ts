/**
 * ADR-140 AT-22 and section 5.5: the reference price list import (referenceService.importReferences, parseCsv,
 * parseMoneyToCents).
 */
import { createFakePriceBookDb, FAKE_NOW, makeCtx, seedBook, seedReference } from './__fixtures__/priceBookFakes';
import { COPY } from '../services/priceBook/messages';
import {
  IMPORT_HEADERS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  importReferences,
  isForeignPriceHeader,
  parseCsv,
  parseMoneyToCents,
} from '../services/priceBook/referenceService';
import type { PrintingResolver } from '../services/priceBook/referenceService';

const A = 'orgA';
const B = 'orgB';

const csv = (...lines: string[]): string => lines.join('\n');

describe('import: the header allowlist', () => {
  test('exactly the eight documented headers are read', () => {
    expect([...IMPORT_HEADERS]).toEqual(['set code', 'collector number', 'name', 'game', 'finish', 'language', 'price', 'note']);
  });

  test('headers are case-insensitive and other harmless columns are ignored', async () => {
    const db = createFakePriceBookDb();
    const out = await importReferences(makeCtx(db, A), {
      csvText: csv('NAME,Price,GAME,Binder,FINISH', 'Lightning Bolt,1.50,mtg,Red binder,foil'),
      dryRun: false,
    });
    expect(out).toMatchObject({ rowCount: 1, willCreate: 1, willUpdate: 0, saved: true });
    expect(db.select('priceBookReference')[0]).toMatchObject({ cardName: 'Lightning Bolt', valueCents: 150, finish: 'FOIL', game: 'MTG' });
  });

  test.each([
    ['TCGplayer Market Price'],
    ['Market'],
    ['Low'],
    ['Mid'],
    ['Trend'],
    ['Direct Low'],
    ['TCG Direct'],
    ['Foil Market Price'],
    ['Follow up'],
  ])('a %s column rejects the whole file with FOREIGN_PRICE_COLUMN and writes nothing', async (header) => {
    const db = createFakePriceBookDb();
    const run = importReferences(makeCtx(db, A), { csvText: csv(`Name,Price,${header}`, 'Lightning Bolt,1.50,9.99'), dryRun: false });
    await expect(run).rejects.toMatchObject({ code: 'FOREIGN_PRICE_COLUMN', status: 400, message: COPY.foreignFile });
    expect(db.writeCount()).toBe(0);
    expect(db.select('priceBook')).toHaveLength(0);
  });

  test('the same words in a rows list are refused too', async () => {
    const db = createFakePriceBookDb();
    const run = importReferences(makeCtx(db, A), { rows: [{ name: 'Lightning Bolt', price: '1.50', ...({ marketPrice: '9.99' } as object) }], dryRun: true });
    await expect(run).rejects.toMatchObject({ code: 'FOREIGN_PRICE_COLUMN' });
    expect(isForeignPriceHeader('Lightning')).toBe(false);
    expect(isForeignPriceHeader('Set code')).toBe(false);
    expect(isForeignPriceHeader('Collector number')).toBe(false);
    expect(isForeignPriceHeader('  M A R K E T ')).toBe(true);
  });

  test('a file without a Price column, or without a way to find the card, is refused', async () => {
    const db = createFakePriceBookDb();
    await expect(importReferences(makeCtx(db, A), { csvText: csv('Name,Note', 'Bolt,hi'), dryRun: true })).rejects.toMatchObject({ code: 'VALIDATION', details: { code: 'MISSING_COLUMNS' } });
    await expect(importReferences(makeCtx(db, A), { csvText: csv('Price,Note', '1.00,hi'), dryRun: true })).rejects.toMatchObject({ code: 'VALIDATION', details: { code: 'MISSING_COLUMNS' } });
    await expect(importReferences(makeCtx(db, A), { csvText: csv('Set code,Price', 'm11,1.00'), dryRun: true })).rejects.toMatchObject({ details: { code: 'MISSING_COLUMNS' } });
    await expect(importReferences(makeCtx(db, A), { csvText: '\n\n', dryRun: true })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  test('either a file or a list of rows, not both and not neither', async () => {
    const db = createFakePriceBookDb();
    await expect(importReferences(makeCtx(db, A), { dryRun: true })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(importReferences(makeCtx(db, A), { csvText: 'Name,Price\nA,1', rows: [], dryRun: true })).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('import: the dry run', () => {
  test('returns the counts and writes nothing, not even a book', async () => {
    const db = createFakePriceBookDb();
    const text = csv(
      'Name,Set code,Collector number,Price,Finish',
      'Lightning Bolt,m11,149,1.50,nonfoil',
      'Sol Ring,c21,263,2.00,',
      'Bad price,m11,1,abc,nonfoil',
      ',,,3.00,',
    );
    const out = await importReferences(makeCtx(db, A), { csvText: text, dryRun: true });
    expect(out).toMatchObject({ dryRun: true, rowCount: 4, willCreate: 2, willUpdate: 0, unresolved: 2, duplicatesInFile: 0, saved: false });
    expect(out.rejected).toEqual([
      { row: 4, reason: 'The price must be in dollars with at most two decimals.' },
      { row: 5, reason: 'Add a card name, or a set code and collector number.' },
    ]);
    expect(db.writeCount()).toBe(0);
    expect(db.select('priceBook')).toHaveLength(0);
    expect(db.select('priceBookReference')).toHaveLength(0);
  });

  test('counts rows that would update an existing reference; a repeat of the same file is all updates', async () => {
    const db = createFakePriceBookDb();
    const text = csv('Name,Set code,Collector number,Price', 'Lightning Bolt,m11,149,1.50', 'Sol Ring,c21,263,2.00');
    const first = await importReferences(makeCtx(db, A), { csvText: text, dryRun: false });
    expect(first).toMatchObject({ willCreate: 2, willUpdate: 0, saved: true });
    const second = await importReferences(makeCtx(db, A), { csvText: text, dryRun: true });
    expect(second).toMatchObject({ willCreate: 0, willUpdate: 2, saved: false });
    const third = await importReferences(makeCtx(db, A), { csvText: text.replace('1.50', '1.75'), dryRun: false });
    expect(third).toMatchObject({ willCreate: 0, willUpdate: 2, saved: true });
    expect(db.select('priceBookReference')).toHaveLength(2);
    expect(db.select('priceBookReference').map((r) => r.valueCents).sort()).toEqual([175, 200]);
  });

  test('a repeated card in the file is counted once and the last row wins', async () => {
    const db = createFakePriceBookDb();
    const text = csv('Name,Price', 'Lightning Bolt,1.00', 'Lightning Bolt,2.00', 'Lightning Bolt,3.00');
    const out = await importReferences(makeCtx(db, A), { csvText: text, dryRun: false });
    expect(out).toMatchObject({ rowCount: 3, willCreate: 1, duplicatesInFile: 2, unresolved: 1 });
    expect(db.select('priceBookReference')[0]?.valueCents).toBe(300);
  });
});

describe('import: money, finish, game, language, note', () => {
  test.each([
    ['12', 1200],
    ['12.5', 1250],
    ['0.99', 99],
    ['$1,200.00', 120000],
    [' 3.25 ', 325],
  ])('price %s is %i cents', (input, cents) => {
    expect(parseMoneyToCents(input)).toBe(cents);
  });

  test.each([['12.999'], ['1e3'], ['-5'], ['abc'], [''], ['1,20'], ['12.'], ['.5'], ['1 000'], ['$'], ['10,00,000']])('price %j is refused', (input) => {
    expect(parseMoneyToCents(input)).toBeNull();
  });

  test('numbers: two decimals at most, never negative, never above the limit', () => {
    expect(parseMoneyToCents(2.5)).toBe(250);
    expect(parseMoneyToCents(2.555)).toBeNull();
    expect(parseMoneyToCents(-1)).toBeNull();
    expect(parseMoneyToCents(Number.NaN)).toBeNull();
    expect(parseMoneyToCents(1_000_000.01)).toBeNull();
    expect(parseMoneyToCents(1_000_000)).toBe(100_000_000);
  });

  test('every rejected row says why, with its spreadsheet row number', async () => {
    const db = createFakePriceBookDb();
    const text = csv(
      'Name,Price,Finish,Game,Language,Note',
      'A,0,,,,', // row 2: zero
      'B,1.005,,,,', // row 3: three decimals
      'C,1.00,shiny,,,', // row 4: finish
      'D,1.00,,chess,,', // row 5: game
      'E,1.00,,,english!,', // row 6: language
      `F,1.00,,,,${'x'.repeat(201)}`, // row 7: note
      'G,1.00,,,,fine', // row 8: ok
    );
    const out = await importReferences(makeCtx(db, A), { csvText: text, dryRun: true });
    expect(out.rejected.map((r) => r.row)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(out.rejected.map((r) => r.reason)).toEqual([
      'The price must be more than zero.',
      'The price must be in dollars with at most two decimals.',
      'The finish is not recognized.',
      'The game is not recognized.',
      'The language is not recognized.',
      'The note is longer than 200 characters.',
    ]);
    expect(out.willCreate).toBe(1);
  });

  test('finish and game synonyms are understood; a blank finish is non-foil and a blank game uses the default', async () => {
    const db = createFakePriceBookDb();
    const text = csv('Name,Price,Finish,Game', 'A,1.00,Normal,Magic', 'B,1.00,Reverse Holo,pokemon', 'C,1.00,etched foil,', 'D,1.00,,', 'E,1.00,Holofoil,Yu-Gi-Oh');
    const out = await importReferences(makeCtx(db, A), { csvText: text, dryRun: false, defaultGame: 'lorcana' });
    expect(out.rejected).toEqual([{ row: 6, reason: 'The game is not recognized.' }]);
    const rows = db.select('priceBookReference');
    const by = (name: string) => rows.find((r) => r.cardName === name);
    expect(by('A')).toMatchObject({ finish: 'NONFOIL', game: 'MTG' });
    expect(by('B')).toMatchObject({ finish: 'REVERSE_HOLO', game: 'POKEMON' });
    expect(by('C')).toMatchObject({ finish: 'ETCHED', game: 'LORCANA' });
    expect(by('D')).toMatchObject({ finish: 'NONFOIL', game: 'LORCANA' });
    await expect(importReferences(makeCtx(db, A), { csvText: 'Name,Price\nA,1', dryRun: true, defaultGame: 'chess' })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  test('set codes are stored lower case, names and notes as typed', async () => {
    const db = createFakePriceBookDb();
    await importReferences(makeCtx(db, A), { csvText: csv('Set code,Collector number,Name,Price,Note', 'M11,149,Lightning Bolt,1.50,"Sold for $2, in a binder"'), dryRun: false });
    expect(db.select('priceBookReference')[0]).toMatchObject({ setCode: 'm11', collectorNumber: '149', cardName: 'Lightning Bolt', note: 'Sold for $2, in a binder' });
  });
});

describe('import: the file itself', () => {
  test('quoted fields, doubled quotes, CRLF line ends and a byte order mark', () => {
    expect(parseCsv(String.fromCharCode(0xfeff) + 'Name,Price\r\n"Smith, ""Bob""",1.00\r\n\r\nB,2.00\r\n')).toEqual([
      ['Name', 'Price'],
      ['Smith, "Bob"', '1.00'],
      ['B', '2.00'],
    ]);
  });

  test('more than 5,000 rows is refused; exactly 5,000 is accepted', async () => {
    const db = createFakePriceBookDb();
    const lines = (n: number) => ['Name,Price', ...Array.from({ length: n }, (_, i) => `Card ${i},1.00`)].join('\n');
    expect(MAX_IMPORT_ROWS).toBe(5000);
    await expect(importReferences(makeCtx(db, A), { csvText: lines(5001), dryRun: true })).rejects.toMatchObject({ code: 'VALIDATION', details: { code: 'TOO_MANY_ROWS' } });
    const ok = await importReferences(makeCtx(db, A), { csvText: lines(5000), dryRun: true });
    expect(ok).toMatchObject({ rowCount: 5000, willCreate: 5000 });
  });

  test('a file over 2 MB is refused', async () => {
    const db = createFakePriceBookDb();
    const text = 'Name,Price\n' + 'x'.repeat(MAX_IMPORT_BYTES + 1);
    await expect(importReferences(makeCtx(db, A), { csvText: text, dryRun: true })).rejects.toMatchObject({ details: { code: 'FILE_TOO_LARGE' } });
  });

  test('a list of rows is limited to 5,000 as well, and its row numbers start at 1', async () => {
    const db = createFakePriceBookDb();
    const rows = Array.from({ length: 5001 }, (_, i) => ({ name: `Card ${i}`, price: '1.00' }));
    await expect(importReferences(makeCtx(db, A), { rows, dryRun: true })).rejects.toMatchObject({ details: { code: 'TOO_MANY_ROWS' } });
    const out = await importReferences(makeCtx(db, A), { rows: [{ name: 'Good', price: 1 }, { name: 'Bad', price: 'x' }], dryRun: true });
    expect(out.rejected).toEqual([{ row: 2, reason: 'The price must be in dollars with at most two decimals.' }]);
  });
});

describe('import: matching to the catalog', () => {
  const exact =
    (id: string, extra: Record<string, unknown> = {}): PrintingResolver =>
    async (refs) =>
      refs.map((r) => ({
        ref: r.ref,
        status: 'EXACT' as const,
        candidates: [{ id, source: 'SCRYFALL', game: 'MTG', name: 'Lightning Bolt', setCode: 'm11', collectorNumber: '149', finishes: ['NONFOIL', 'FOIL'], ...extra }],
      }));

  test('an exact match is saved against the printing (p: key); no resolver or no match is saved as typed', async () => {
    const db = createFakePriceBookDb();
    const out = await importReferences(makeCtx(db, A), { csvText: csv('Name,Set code,Collector number,Price', 'Lightning Bolt,m11,149,1.50'), dryRun: false, resolver: exact('SCRYFALL:p1') });
    expect(out.unresolved).toBe(0);
    expect(db.select('priceBookReference')[0]).toMatchObject({ cardKey: 'p:SCRYFALL:p1', catalogPrintingId: 'SCRYFALL:p1' });

    const typed = await importReferences(makeCtx(db, A), { csvText: csv('Name,Set code,Collector number,Price', 'Sol Ring,c21,263,2.00'), dryRun: false });
    expect(typed.unresolved).toBe(1);
    expect(db.select('priceBookReference').find((r) => r.cardName === 'Sol Ring')?.cardKey).toBe('s:c21|263|sol ring|');
  });

  test('an ambiguous or unmatched result is saved as typed', async () => {
    const db = createFakePriceBookDb();
    const resolver: PrintingResolver = async (refs) => refs.map((r) => ({ ref: r.ref, status: 'AMBIGUOUS' as const, candidates: [] }));
    const out = await importReferences(makeCtx(db, A), { csvText: csv('Name,Price', 'Lightning Bolt,1.50'), dryRun: false, resolver });
    expect(out.unresolved).toBe(1);
    expect(db.select('priceBookReference')[0]?.catalogPrintingId).toBeNull();
  });

  test('a finish the matched printing does not come in is rejected with a reason', async () => {
    const db = createFakePriceBookDb();
    const out = await importReferences(makeCtx(db, A), {
      csvText: csv('Name,Price,Finish', 'Lightning Bolt,1.50,etched'),
      dryRun: true,
      resolver: exact('SCRYFALL:p1'),
    });
    expect(out.rejected).toEqual([{ row: 2, reason: 'This card does not come in that finish.' }]);
    expect(out.willCreate).toBe(0);
  });

  test('the resolver is asked in groups of at most 500', async () => {
    const db = createFakePriceBookDb();
    const sizes: number[] = [];
    const resolver: PrintingResolver = async (refs) => {
      sizes.push(refs.length);
      return refs.map((r) => ({ ref: r.ref, status: 'UNMATCHED' as const, candidates: [] }));
    };
    const lines = ['Name,Price', ...Array.from({ length: 1200 }, (_, i) => `Card ${i},1.00`)].join('\n');
    await importReferences(makeCtx(db, A), { csvText: lines, dryRun: true, resolver });
    expect(sizes).toEqual([500, 500, 200]);
  });
});

describe('import: the save', () => {
  test('writes inside one transaction under this organizer\'s book and never bumps the version', async () => {
    const db = createFakePriceBookDb();
    await importReferences(makeCtx(db, A, { userId: 'u1' }), { csvText: csv('Name,Price', 'A,1.00', 'B,2.00'), dryRun: false });
    const book = db.select('priceBook', { organizerId: A })[0];
    expect(book?.version).toBe(1);
    const rows = db.select('priceBookReference');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.bookId === book?.id && r.enteredByUserId === 'u1' && (r.asOf as Date).getTime() === FAKE_NOW.getTime())).toBe(true);
  });

  test('a failure during the save leaves nothing behind', async () => {
    const db = createFakePriceBookDb();
    const book = seedBook(db, A);
    seedReference(db, book.id as string, { cardKey: 's:||a|', finish: 'NONFOIL', language: 'en', valueCents: 50, cardName: 'A' });
    db.failWhen((table, op) => (table === 'priceBookReference' && op === 'updateMany' ? new Error('boom') : null));
    await expect(importReferences(makeCtx(db, A), { csvText: csv('Name,Price', 'A,1.00', 'B,2.00'), dryRun: false })).rejects.toThrow('boom');
    expect(db.select('priceBookReference')).toHaveLength(1);
  });

  test('another organizer\'s references with the same card are never read or changed', async () => {
    const db = createFakePriceBookDb();
    const bBook = seedBook(db, B);
    seedReference(db, bBook.id as string, { cardKey: 's:||lightning bolt|', finish: 'NONFOIL', language: 'en', valueCents: 999, cardName: 'Lightning Bolt' });
    const out = await importReferences(makeCtx(db, A), { csvText: csv('Name,Price', 'Lightning Bolt,1.50'), dryRun: false });
    expect(out).toMatchObject({ willCreate: 1, willUpdate: 0 });
    const bRows = db.select('priceBookReference', { bookId: bBook.id });
    expect(bRows).toHaveLength(1);
    expect(bRows[0]?.valueCents).toBe(999);
    expect(db.select('priceBookReference')).toHaveLength(2);
  });
});
