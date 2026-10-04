/**
 * cardIntakeCopy (ADR-134 batch B8): copy lint and error wording coverage for the card intake screens.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ERROR_WORDING,
  INTAKE_COPY,
  INTAKE_STEPS,
  ROW_ERROR_WORDING,
  WARNING_WORDING,
  allIntakeCopy,
  wordingForError,
  wordingForRowError,
  wordingForWarning,
} from '../cardIntakeCopy';
import { NO_CATALOG_SAMPLE_SHOWN_CAP, REVIEW_ROWS_SHOWN_CAP } from '../cardIntake';

// Every code the backend can send (routes/cardIntake.ts, controllers/cardIntakeController.ts, services/cardIntake/messages.ts).
const BACKEND_REQUEST_CODES = [
  'UNAUTHORIZED', 'FORBIDDEN', 'SALE_NOT_FOUND', 'NOT_YOUR_SALE', 'NO_FILE', 'FILE_TOO_LARGE', 'UNSUPPORTED_FILE_TYPE',
  'UPLOAD_FAILED', 'NOT_A_CSV_FILE', 'PARSE_ERROR', 'EMPTY_FILE', 'NO_NAME_COLUMN', 'BAD_COLUMN_MAPPING', 'BAD_FORMAT',
  'BAD_GAME', 'BAD_PRICE_SOURCE', 'BAD_DEFAULT_CONDITION', 'BAD_MODE', 'MODE_REQUIRED', 'FILE_HASH_REQUIRED', 'BAD_JSON',
  'BAD_CONDITION_MAPPING', 'BAD_DECISIONS', 'FILE_CHANGED', 'TOO_MANY_ROWS', 'ALREADY_APPLIED', 'DB_SPACE_LOW',
  'RATE_LIMITED', 'SERVER_ERROR', 'CANCELLED',
];
// services/cardIntake/types.ts ROW_ERROR_CODES, plus the two names in ADR-134 section 4.8.
const ROW_CODES = [
  'MISSING_NAME', 'BAD_QUANTITY', 'BAD_PRICE', 'AMBIGUOUS_PRINTING', 'UNKNOWN_FINISH', 'CONDITION_UNMAPPED', 'SKU_CONFLICT',
  'GRADED_MISSING_GRADE', 'CERT_TOO_LONG', 'ROW_TOO_LONG', 'INVALID_DECISION', 'INVALID_CARD_DATA',
  'UNMATCHED_CARD', 'UNKNOWN_CONDITION',
];

test('copy lint: no "AI", no "estate sale", no em dashes, no placeholder text', () => {
  const all = allIntakeCopy();
  assert.ok(all.length > 100, 'expected the full set of strings');
  for (const text of all) {
    assert.equal(typeof text, 'string');
    assert.ok(text.trim().length > 0, 'empty string in copy');
    assert.equal(text, text.trim(), `stray whitespace: "${text}"`);
    assert.ok(!/\bAI\b/.test(text), `"AI" in: ${text}`);
    assert.ok(!/\bA\.I\./.test(text), `"A.I." in: ${text}`);
    assert.ok(!/artificial intelligence/i.test(text), `automation wording in: ${text}`);
    assert.ok(!/estate\s*sale/i.test(text), `"estate sale" in: ${text}`);
    assert.ok(!text.includes('—'), `em dash in: ${text}`);
    assert.ok(!text.includes('–'), `en dash in: ${text}`);
    assert.ok(!/ -- /.test(text), `double hyphen dash in: ${text}`);
    assert.ok(!/lorem|todo|tbd|placeholder|\[[^\]]*\]|\{\{|<[a-z/][^>]*>/i.test(text), `placeholder-like text in: ${text}`);
  }
});

test('copy lint: help and message sentences end with a full stop', () => {
  for (const k of Object.keys(ERROR_WORDING)) {
    assert.ok(/[.!?]$/.test(ERROR_WORDING[k].message), `${k} message`);
    assert.ok(/[.!?]$/.test(ERROR_WORDING[k].help), `${k} help`);
  }
  for (const k of Object.keys(ROW_ERROR_WORDING)) {
    assert.ok(/[.!?]$/.test(ROW_ERROR_WORDING[k].help), `${k} help`);
  }
});

test('every backend request code has plain wording', () => {
  for (const code of BACKEND_REQUEST_CODES) {
    assert.ok(Object.prototype.hasOwnProperty.call(ERROR_WORDING, code), `missing wording for ${code}`);
    const w = wordingForError(code);
    assert.ok(w.message.length > 5 && w.help.length > 5);
  }
});

test('every row error code (backend and ADR 4.8) has plain wording', () => {
  for (const code of ROW_CODES) {
    assert.ok(Object.prototype.hasOwnProperty.call(ROW_ERROR_WORDING, code), `missing row wording for ${code}`);
    const w = wordingForRowError(code);
    assert.ok(w.label.length > 3 && w.help.length > 10);
  }
});

test('failures that never reach the server have wording too', () => {
  for (const code of ['NETWORK_ERROR', 'SESSION_ENDED', 'UNKNOWN']) {
    assert.ok(ERROR_WORDING[code]);
  }
});

test('unknown codes fall back to a generic message instead of undefined', () => {
  assert.equal(wordingForError('NOT_A_REAL_CODE').message, ERROR_WORDING.UNKNOWN.message);
  assert.equal(wordingForError(null).message, ERROR_WORDING.UNKNOWN.message);
  assert.equal(wordingForError('constructor').message, ERROR_WORDING.UNKNOWN.message);
  assert.ok(wordingForRowError('nope').label.length > 0);
  assert.ok(wordingForWarning('nope').length > 0);
  for (const k of Object.keys(WARNING_WORDING)) assert.equal(wordingForWarning(k), WARNING_WORDING[k]);
});

test('the four steps are Upload, Condition mapping, Ambiguous rows, Confirm', () => {
  assert.deepEqual(INTAKE_STEPS.map((s) => s.label), ['Upload', 'Condition mapping', 'Ambiguous rows', 'Confirm']);
});

test('the empty-file wording is exactly the one the acceptance names', () => {
  assert.equal(INTAKE_COPY.previewEmptyHeading, 'This file has no card rows');
  assert.equal(ERROR_WORDING.EMPTY_FILE.message, 'This file has no card rows.');
});

test('the rows step copy is accurate for each kind of row', () => {
  // Rows that need a choice and have none are skipped and listed in the errors file; a card with no catalog match needs no choice.
  assert.match(INTAKE_COPY.rowsIntro, /needs a choice and has none is skipped and listed in the errors file/);
  assert.match(INTAKE_COPY.rowsIntro, /not in the catalog needs no choice/);
  // The notice for rows that are not listed names the real next step, using the real button label and file name.
  const hidden = INTAKE_COPY.rowsTruncated(500, 250);
  assert.ok(hidden.includes('first 500 rows that need a choice'));
  assert.ok(hidden.includes('250 more rows need a choice but cannot be listed here'));
  assert.ok(hidden.includes('skipped in this import and listed in the errors file'));
  assert.ok(hidden.includes(`"${INTAKE_COPY.doneImportAnother}"`));
  assert.ok(hidden.includes(INTAKE_COPY.errorsFileName));
  assert.ok(!/cannot be shown/.test(hidden));
  assert.ok(INTAKE_COPY.rowsTruncated(0, 1).startsWith('1 more row needs a choice'));
  assert.ok(!INTAKE_COPY.rowsTruncated(0, 4).includes('first 0'));
  // The same next step is named on the confirm step and after the import.
  assert.ok(INTAKE_COPY.unlistedNote(250).includes(`"${INTAKE_COPY.doneImportAnother}"`));
  assert.ok(INTAKE_COPY.errorsChoiceHint.includes(`"${INTAKE_COPY.doneImportAnother}"`));
  assert.ok(INTAKE_COPY.errorsChoiceHint.includes(INTAKE_COPY.errorsFileName));
  assert.equal(INTAKE_COPY.errorsFileName, 'errors.csv');
  // No-catalog rows are reported as all being added, with the sample size named.
  assert.match(INTAKE_COPY.rowsGroupNoMatchSample(20, 3000), /All 3,000 are added with the details from your file\. Here are the first 20\./);
  assert.equal(INTAKE_COPY.summaryNoMatch(1), '1 card is not in the catalog and will be added with the details from your file');
  assert.match(INTAKE_COPY.summaryUnlisted(250), /^250 rows need a choice but could not be listed, so they are skipped and put in the errors file$/);
  assert.match(INTAKE_COPY.rowsPendingNote(2), /will be skipped and listed in the errors file\.$/);
});

test('plural helpers read naturally', () => {
  assert.equal(INTAKE_COPY.previewRows(1), '1 row in your file');
  assert.equal(INTAKE_COPY.previewRows(12000), '12,000 rows in your file');
  assert.equal(INTAKE_COPY.summaryCreate(1), '1 new card added to this sale');
  assert.equal(INTAKE_COPY.summaryMerge(2), '2 cards already in this sale will be updated');
});

// Drift guard: when the backend source is next to this package (the monorepo), every code it defines must have wording here.
function readBackend(rel: string): string | null {
  const candidates = [
    path.resolve(process.cwd(), '..', 'backend', 'src', rel),
    path.resolve(process.cwd(), 'packages', 'backend', 'src', rel),
  ];
  for (const p of candidates) {
    try {
      return fs.readFileSync(p, 'utf8');
    } catch {
      /* try the next place */
    }
  }
  return null;
}

test('drift guard: the list caps and the preview fields the screens read match the backend', () => {
  const config = readBackend('services/cardIntake/config.ts');
  const service = readBackend('services/cardIntake/intakeService.ts');
  if (!config || !service) return; // backend not present: nothing to compare
  const reviewCap = /export const REVIEW_ROWS_CAP = (\d+);/.exec(config);
  const sampleCap = /export const NO_CATALOG_SAMPLE_CAP = (\d+);/.exec(config);
  assert.ok(reviewCap && sampleCap, 'cap constants not found in config.ts');
  assert.equal(Number((reviewCap as RegExpExecArray)[1]), REVIEW_ROWS_SHOWN_CAP);
  assert.equal(Number((sampleCap as RegExpExecArray)[1]), NO_CATALOG_SAMPLE_SHOWN_CAP);
  // The preview response still carries every field the reader in lib/cardIntake.ts looks at.
  for (const field of ['reviewRows', 'reviewTruncated', 'needsChoice', 'noCatalog', 'byReason', 'notListed', 'importsAnyway', 'sample']) {
    assert.ok(new RegExp(`\\b${field}\\b`).test(service), `runPreview no longer mentions ${field}`);
  }
});

test('drift guard: every code defined in the backend source has wording here', () => {
  const messages = readBackend('services/cardIntake/messages.ts');
  const types = readBackend('services/cardIntake/types.ts');
  const controller = readBackend('controllers/cardIntakeController.ts');
  const routes = readBackend('routes/cardIntake.ts');
  if (!messages || !types || !controller || !routes) return; // backend not present: nothing to compare
  const requestCodes = new Set<string>();
  const apiBlock = /export const API_MESSAGES = \{([\s\S]*?)\} as const;/.exec(messages);
  assert.ok(apiBlock, 'API_MESSAGES block not found');
  // Keys of API_MESSAGES are codes, except the two rate limit texts, which the routes send under the single code RATE_LIMITED.
  (apiBlock as RegExpExecArray)[1].replace(/^\s{2}([A-Z_]+):/gm, (_m, k: string) => (requestCodes.add(k.indexOf('RATE_LIMITED') === 0 ? 'RATE_LIMITED' : k), ''));
  [controller, routes].forEach((src) => {
    src.replace(/code: '([A-Z_]+)'/g, (_m, k: string) => (requestCodes.add(k), ''));
  });
  assert.ok(requestCodes.size >= 25, 'too few backend codes found: the parse is broken');
  requestCodes.forEach((code) => assert.ok(Object.prototype.hasOwnProperty.call(ERROR_WORDING, code), `no wording for backend code ${code}`));

  const rowBlock = /export const ROW_ERROR_CODES = \[([\s\S]*?)\] as const;/.exec(types);
  assert.ok(rowBlock, 'ROW_ERROR_CODES block not found');
  const rowCodes: string[] = [];
  (rowBlock as RegExpExecArray)[1].replace(/'([A-Z_]+)'/g, (_m, k: string) => (rowCodes.push(k), ''));
  assert.ok(rowCodes.length >= 10);
  rowCodes.forEach((code) => assert.ok(Object.prototype.hasOwnProperty.call(ROW_ERROR_WORDING, code), `no row wording for ${code}`));
});
