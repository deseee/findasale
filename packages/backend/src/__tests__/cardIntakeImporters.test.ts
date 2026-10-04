/**
 * Card intake: file reading, importer detection and the pure cell and condition rules
 * (ADR-134 #642, batch B4, section 4.4 and 4.5). Fixtures are synthetic. No database, no network.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { detectImporter, applyColumnOverride, getImporter } from '../services/cardIntake/importers';
import { inspectFile, IntakeFileError, looksBinary, sha256OfFile, sniffDelimiter, streamRecords } from '../services/cardIntake/parseSpreadsheet';
import { proposeCondition, resolveCondition, parseConditionChoices, conditionKey } from '../services/cardIntake/conditionMap';
import {
  catalogFinishToVocab,
  parseFinishCell,
  parseGameCell,
  parseLanguageCell,
  parseMoneyCell,
  parseQuantityCell,
  splitFoilFromCondition,
} from '../services/cardIntake/normalizeCells';

const FIX = path.join(__dirname, '__fixtures__', 'cardIntake');
const fixture = (name: string) => path.join(FIX, name);

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cardintake-importers-'));
});
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('importer detection from headers (ADR-134 section 4.4)', () => {
  const cases: Array<[string, string]> = [
    ['manabox-synthetic.csv', 'manabox'],
    ['moxfield-synthetic.csv', 'moxfield'],
    ['tcgplayer-seller-synthetic.csv', 'tcgplayer_seller'],
    ['tcgplayer-app-synthetic.csv', 'tcgplayer_app'],
    ['generic-synthetic.tsv', 'generic'],
  ];
  it.each(cases)('%s is detected as %s', async (file, expected) => {
    const shape = await inspectFile(fixture(file), 100);
    expect(detectImporter(shape.headers).id).toBe(expected);
  });

  it('matches headers case-insensitively and ignores a byte-order mark and stray spaces', async () => {
    const p = path.join(tmp, 'bom-synthetic.csv');
    fs.writeFileSync(p, '﻿ NAME ,SET CODE,collector number,SCRYFALL ID,manabox id,Quantity\nBolt,lea,161,x,1,2\n');
    const shape = await inspectFile(p, 10);
    expect(detectImporter(shape.headers).id).toBe('manabox');
    const mapping = getImporter('manabox').mapColumns(shape.headers);
    expect(mapping.name).toBe('NAME');
    expect(mapping.setCode).toBe('SET CODE');
  });

  it('maps the real header names listed in ADR-134 section 4.4', async () => {
    const mb = await inspectFile(fixture('manabox-synthetic.csv'), 100);
    expect(getImporter('manabox').mapColumns(mb.headers)).toMatchObject({
      name: 'Name', setCode: 'Set code', setName: 'Set name', collectorNumber: 'Collector number', finish: 'Foil',
      quantity: 'Quantity', scryfallId: 'Scryfall ID', cost: 'Purchase price', costCurrency: 'Purchase price currency',
      condition: 'Condition', language: 'Language',
    });
    const mox = await inspectFile(fixture('moxfield-synthetic.csv'), 100);
    expect(getImporter('moxfield').mapColumns(mox.headers)).toMatchObject({
      quantity: 'Count', name: 'Name', setCode: 'Edition', collectorNumber: 'Collector Number', finish: 'Foil', condition: 'Condition',
    });
    const tcg = await inspectFile(fixture('tcgplayer-seller-synthetic.csv'), 100);
    const tcgMap = getImporter('tcgplayer_seller').mapColumns(tcg.headers);
    expect(tcgMap).toMatchObject({ quantity: 'Total Quantity', price: 'TCG Marketplace Price', tcgplayerProductId: 'TCGplayer Id', name: 'Product Name' });
    expect(Object.values(tcgMap)).not.toContain('Add to Quantity');
    const app = await inspectFile(fixture('tcgplayer-app-synthetic.csv'), 100);
    const appMap = getImporter('tcgplayer_app').mapColumns(app.headers);
    expect(appMap).toMatchObject({ collectorNumber: 'Card Number', setCode: 'Set Code', finish: 'Printing', tcgplayerProductId: 'Product ID' });
    expect(Object.values(appMap)).not.toContain('SKU');
  });

  it('auto-detects generic aliases including sku aliases', async () => {
    const shape = await inspectFile(fixture('generic-synthetic.tsv'), 100);
    expect(getImporter('generic').mapColumns(shape.headers)).toMatchObject({
      name: 'Card Name', setName: 'Set', collectorNumber: 'Number', quantity: 'Qty', finish: 'Foil', condition: 'Cond',
      grader: 'Grader', grade: 'Grade', certNumber: 'Cert #', price: 'Price', sku: 'SKU', game: 'Game',
    });
  });

  it('applies a seller column override only for real headers and known fields', () => {
    const headers = ['A', 'B'];
    const ok = applyColumnOverride({ name: 'A' }, { quantity: 'B' }, headers);
    expect(ok).toEqual({ ok: true, mapping: { name: 'A', quantity: 'B' } });
    expect(applyColumnOverride({}, { quantity: 'Nope' }, headers).ok).toBe(false);
    expect(applyColumnOverride({}, { bogus: 'A' }, headers).ok).toBe(false);
    expect(applyColumnOverride({ name: 'A' }, { name: '' }, headers)).toEqual({ ok: true, mapping: {} });
  });
});

describe('streaming reader', () => {
  it('sniffs comma, semicolon and tab delimiters (quotes protect a comma)', async () => {
    expect(sniffDelimiter(Buffer.from('a,b,c\n1,2,3'))).toBe(',');
    expect(sniffDelimiter(Buffer.from('a;b;c\n1;2;3'))).toBe(';');
    expect(sniffDelimiter(Buffer.from('a\tb\tc\n1\t2\t3'))).toBe('\t');
    expect(sniffDelimiter(Buffer.from('"a,b,c,d";x;y\n1;2;3'))).toBe(';');
  });

  it('reports spreadsheet row numbers (header is row 1) and survives multi-line quoted cells', async () => {
    const p = path.join(tmp, 'rows-synthetic.csv');
    fs.writeFileSync(p, 'Name,Qty\nOne,1\n\n"Two\nlines",2\nThree,3\n');
    const rows: Array<[number, string]> = [];
    for await (const r of streamRecords(p)) rows.push([r.row, r.record.Name]);
    expect(rows.map((r) => r[0])).toEqual([2, 5, 6]);
    expect(rows[1][1]).toBe('Two\nlines');
  });

  it('fills short rows with blanks and drops extra columns instead of failing', async () => {
    const p = path.join(tmp, 'ragged-synthetic.csv');
    fs.writeFileSync(p, 'Name,Qty\nA\nB,2,extra\n');
    const out: any[] = [];
    for await (const r of streamRecords(p)) out.push(r.record);
    expect(out).toEqual([{ Name: 'A', Qty: '' }, { Name: 'B', Qty: '2' }]);
  });

  it('rejects a workbook renamed to .csv and a file with NUL bytes', async () => {
    expect(looksBinary(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toBe(true);
    expect(looksBinary(Buffer.from('plain,text\n1,2'))).toBe(false);
    const p = path.join(tmp, 'zip-synthetic.csv');
    fs.writeFileSync(p, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0]));
    await expect(inspectFile(p, 10)).rejects.toMatchObject({ code: 'NOT_A_CSV_FILE', status: 400 });
  });

  it('rejects an empty file and a header-only file as EMPTY_FILE', async () => {
    const empty = path.join(tmp, 'empty-synthetic.csv');
    fs.writeFileSync(empty, '');
    await expect(inspectFile(empty, 10)).rejects.toMatchObject({ code: 'EMPTY_FILE' });
    const headerOnly = path.join(tmp, 'header-only-synthetic.csv');
    fs.writeFileSync(headerOnly, 'Name,Qty\n');
    await expect(inspectFile(headerOnly, 10)).rejects.toMatchObject({ code: 'EMPTY_FILE' });
  });

  it('throws TOO_MANY_ROWS (413) as soon as the cap is exceeded', async () => {
    const p = path.join(tmp, 'many-synthetic.csv');
    fs.writeFileSync(p, 'Name\n' + Array.from({ length: 6 }, (_, i) => `c${i}`).join('\n') + '\n');
    await expect(inspectFile(p, 5)).rejects.toMatchObject({ code: 'TOO_MANY_ROWS', status: 413 });
    await expect(inspectFile(p, 6)).resolves.toMatchObject({ rowCount: 6 });
  });

  it('turns a malformed file into PARSE_ERROR (400) rather than crashing', async () => {
    const p = path.join(tmp, 'broken-synthetic.csv');
    fs.writeFileSync(p, 'Name,Qty\n"unterminated,1\nB,2\n');
    let err: unknown;
    try {
      await inspectFile(p, 10);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(IntakeFileError);
    expect((err as IntakeFileError).code).toBe('PARSE_ERROR');
  });

  it('hashes with sha256 by streaming', async () => {
    const p = path.join(tmp, 'hash-synthetic.csv');
    fs.writeFileSync(p, 'abc');
    expect(await sha256OfFile(p)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('condition mapping (ADR-134 section 4.5 step A)', () => {
  it('maps the TCGplayer vocabulary EXACT to NM, LP, MP, HP, DMG', () => {
    for (const [word, code] of [['Near Mint', 'NM'], ['Lightly Played', 'LP'], ['Moderately Played', 'MP'], ['Heavily Played', 'HP'], ['Damaged', 'DMG']]) {
      expect(proposeCondition('tcgplayer', word)).toEqual({ proposed: code, confidence: 'EXACT' });
    }
  });

  it('maps ManaBox mint and near_mint EXACT, every other word REVIEW with the ADR proposal', () => {
    expect(proposeCondition('manabox', 'mint')).toEqual({ proposed: 'NM', confidence: 'EXACT' });
    expect(proposeCondition('manabox', 'near_mint')).toEqual({ proposed: 'NM', confidence: 'EXACT' });
    expect(proposeCondition('manabox', 'excellent')).toEqual({ proposed: 'LP', confidence: 'REVIEW' });
    expect(proposeCondition('manabox', 'good')).toEqual({ proposed: 'LP', confidence: 'REVIEW' });
    expect(proposeCondition('manabox', 'light_played')).toEqual({ proposed: 'MP', confidence: 'REVIEW' });
    expect(proposeCondition('manabox', 'played')).toEqual({ proposed: 'HP', confidence: 'REVIEW' });
    expect(proposeCondition('manabox', 'poor')).toEqual({ proposed: 'DMG', confidence: 'REVIEW' });
  });

  it('proposes the Moxfield scale for review and never invents a proposal for an unknown word', () => {
    expect(proposeCondition('moxfield', 'Good (Lightly Played)')).toEqual({ proposed: 'LP', confidence: 'REVIEW' });
    expect(proposeCondition('moxfield', 'Played')).toEqual({ proposed: 'MP', confidence: 'REVIEW' });
    expect(proposeCondition('moxfield', 'Heavily Played')).toEqual({ proposed: 'HP', confidence: 'REVIEW' });
    expect(proposeCondition('moxfield', 'Damaged')).toEqual({ proposed: 'DMG', confidence: 'REVIEW' });
    expect(proposeCondition('manabox', 'mystery_grade')).toEqual({ proposed: null, confidence: 'REVIEW' });
    expect(proposeCondition('generic', 'banana')).toEqual({ proposed: null, confidence: 'REVIEW' });
  });

  it('strict resolution never turns an unconfirmed REVIEW value into NM', () => {
    const none = parseConditionChoices(undefined)!;
    expect(resolveCondition('manabox', 'excellent', none, null, true)).toEqual({ ok: false });
    expect(resolveCondition('manabox', 'mystery_grade', none, 'NM', true)).toEqual({ ok: false });
    expect(resolveCondition('manabox', 'near_mint', none, null, true)).toEqual({ ok: true, code: 'NM', blank: false });
    const confirmed = parseConditionChoices({ Excellent: 'LP' })!;
    expect(resolveCondition('manabox', 'excellent', confirmed, null, true)).toEqual({ ok: true, code: 'LP', blank: false });
  });

  it('a blank condition uses only the seller default, never Near Mint by assumption', () => {
    const none = parseConditionChoices(undefined)!;
    expect(resolveCondition('generic', '', none, null, true)).toEqual({ ok: true, code: null, blank: true });
    expect(resolveCondition('generic', '  ', none, 'LP', true)).toEqual({ ok: true, code: 'LP', blank: true });
  });

  it('parses the confirm mapping object and rejects an invalid code', () => {
    const ok = parseConditionChoices({ 'Near  Mint': 'nm', Poor: null })!;
    expect(ok.get(conditionKey('near mint'))).toBe('NM');
    expect(ok.get('poor')).toBeNull();
    expect(parseConditionChoices({ Poor: 'MINT' })).toBeNull();
    expect(parseConditionChoices([1, 2])).toBeNull();
  });
});

describe('cell parsers', () => {
  it('quantity is a whole number from 1 to 10,000', () => {
    expect(parseQuantityCell('3')).toEqual({ ok: true, value: 3 });
    expect(parseQuantityCell('3.0')).toEqual({ ok: true, value: 3 });
    expect(parseQuantityCell('10000')).toEqual({ ok: true, value: 10000 });
    for (const bad of ['', '0', '-1', '1.5', 'abc', '10001', '1e3', ' ']) expect(parseQuantityCell(bad)).toEqual({ ok: false });
  });

  it('money is strict: blank is null, garbage is NaN, never "close enough"', () => {
    expect(parseMoneyCell('')).toBeNull();
    expect(parseMoneyCell('$1,250.00')).toBe(1250);
    expect(parseMoneyCell('25.99 USD')).toBe(25.99);
    expect(parseMoneyCell('.5')).toBe(0.5);
    for (const bad of ['1e3', '-5', '1.999', '12abc', '1.234,56', '(5)']) expect(Number.isNaN(parseMoneyCell(bad) as number)).toBe(true);
  });

  it('finish cells: words map, blank depends on the importer, unknown text is reported', () => {
    expect(parseFinishCell('normal', false)).toEqual({ kind: 'value', finish: 'NONFOIL' });
    expect(parseFinishCell('Foil', false)).toEqual({ kind: 'value', finish: 'FOIL' });
    expect(parseFinishCell('etched', false)).toEqual({ kind: 'value', finish: 'ETCHED' });
    expect(parseFinishCell('', true)).toEqual({ kind: 'value', finish: 'NONFOIL' });
    expect(parseFinishCell('', false)).toEqual({ kind: 'absent' });
    expect(parseFinishCell(undefined, true)).toEqual({ kind: 'absent' });
    expect(parseFinishCell('shiny gold', false)).toEqual({ kind: 'unrecognized', text: 'shiny gold' });
  });

  it('splits a trailing Foil marker off a TCGplayer condition', () => {
    expect(splitFoilFromCondition('Near Mint Foil')).toEqual({ condition: 'Near Mint', foil: true });
    expect(splitFoilFromCondition('Lightly Played')).toEqual({ condition: 'Lightly Played', foil: false });
    expect(splitFoilFromCondition('Foil')).toEqual({ condition: 'Foil', foil: false });
  });

  it('language and game cells', () => {
    expect(parseLanguageCell('English')).toEqual({ kind: 'value', code: 'en' });
    expect(parseLanguageCell('zh_CN')).toEqual({ kind: 'value', code: 'zhs' });
    expect(parseLanguageCell('Klingon')).toEqual({ kind: 'unknown' });
    expect(parseLanguageCell('')).toEqual({ kind: 'absent' });
    expect(parseGameCell('Magic')).toBe('MTG');
    expect(parseGameCell('YuGiOh')).toBe('YUGIOH');
    expect(parseGameCell('pokemon')).toBe('POKEMON');
    expect(parseGameCell('Flesh and Blood')).toBe('OTHER');
    expect(parseGameCell('')).toBeUndefined();
  });

  it('catalog finishes are stored as vocabulary codes', () => {
    expect(catalogFinishToVocab('NONFOIL')).toBe('NONFOIL');
    expect(catalogFinishToVocab('REVERSE_HOLO')).toBe('REVERSE_HOLO');
    expect(catalogFinishToVocab('holo')).toBe('HOLO');
    expect(catalogFinishToVocab('weird')).toBeNull();
  });
});
