/**
 * cardTcgplayer (ADR-137 #660): copy lint, response readers and display helpers for the TCGplayer sync screen
 * and the counter notice.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EXPORT_CHOICES,
  TCG_COPY,
  TCG_ERROR_WORDING,
  TCG_FALLBACK_ERROR,
  allTcgCopy,
  cardLabel,
  counterMessage,
  forgetDisabled,
  formatSyncedAt,
  isKnownDisabled,
  listedCount,
  needsUploadedAnswer,
  readExport,
  readReconcileReport,
  readRegisterCheck,
  readStatus,
  reconcileFields,
  reconcileUrl,
  registerIds,
  registerKey,
  rememberDisabled,
  reportHasChanges,
  reportSentences,
  saveTextFile,
  signed,
  syncPagePath,
  tcgErrorSentence,
  wordingForTcgError,
} from '../cardTcgplayer';

// Codes the backend can send: controllers/cardTcgplayerController.ts, the intake upload middleware it reuses, rate limiting.
const BACKEND_CODES = [
  'FEATURE_DISABLED', 'UNAUTHORIZED', 'FORBIDDEN', 'SALE_NOT_FOUND', 'NOT_YOUR_SALE', 'NO_FILE', 'FILE_TOO_LARGE',
  'UNSUPPORTED_FILE_TYPE', 'UPLOAD_FAILED', 'NOT_A_CSV_FILE', 'PARSE_ERROR', 'EMPTY_FILE', 'TOO_MANY_ROWS',
  'NOT_A_TCGPLAYER_FILE', 'BAD_PARAMS', 'UPLOAD_ANSWER_REQUIRED', 'NO_PENDING_EXPORT', 'ALREADY_RUNNING', 'RATE_LIMITED',
  'SERVER_ERROR',
];

function line(over: Record<string, unknown> = {}) {
  return {
    key: '4001|NM|N',
    productId: 4001,
    cardName: 'Lightning Bolt',
    setName: 'Alpha',
    collectorNumber: '161',
    condition: 'Near Mint',
    available: 3,
    onTcgplayer: 5,
    toSend: -2,
    ...over,
  };
}

function totals(over: Record<string, number> = {}) {
  return {
    inSync: 0, decreased: 0, increased: 0, needsNewItem: 0, unitsRemoved: 0, unitsAdded: 0, shortfallCards: 0, shortfallUnits: 0,
    firstSyncCards: 0, stillToSendCards: 0, notInFindasale: 0, listedButMissing: 0, duplicateKeys: 0, ...over,
  };
}

function report(over: Record<string, unknown> = {}) {
  return {
    rowsInFile: 10,
    problemCount: 0,
    problems: [],
    totals: totals(),
    changes: [],
    notInFindasale: [],
    listedButMissing: [],
    duplicateKeys: [],
    applied: false,
    exportWaiting: false,
    ...over,
  };
}

test('copy lint: no em dashes, no placeholders, no automation wording, no stray whitespace', () => {
  const all = allTcgCopy();
  assert.ok(all.length > 60, 'expected the full set of strings');
  for (const text of all) {
    assert.equal(typeof text, 'string');
    assert.ok(text.trim().length > 0, 'empty string in copy');
    assert.equal(text, text.trim(), `stray whitespace: "${text}"`);
    assert.ok(!/\bAI\b/.test(text), `"AI" in: ${text}`);
    assert.ok(!/artificial intelligence/i.test(text), `automation wording in: ${text}`);
    assert.ok(!/estate\s*sale/i.test(text), `"estate sale" in: ${text}`);
    assert.ok(!text.includes('—'), `em dash in: ${text}`);
    assert.ok(!text.includes('–'), `en dash in: ${text}`);
    assert.ok(!/ -- /.test(text), `double hyphen dash in: ${text}`);
    assert.ok(!/lorem|todo|tbd|placeholder|\[[^\]]*\]|\{\{|<[a-z/][^>]*>/i.test(text), `placeholder-like text in: ${text}`);
  }
});

test('copy: every error wording is a sentence and every backend code has wording', () => {
  for (const [code, text] of Object.entries(TCG_ERROR_WORDING)) {
    assert.ok(/[.!?]$/.test(text), `${code} ends with a full stop`);
  }
  for (const code of BACKEND_CODES) {
    assert.ok(Object.prototype.hasOwnProperty.call(TCG_ERROR_WORDING, code), `wording for ${code}`);
  }
  assert.ok(/[.!?]$/.test(TCG_FALLBACK_ERROR));
});

test('copy: the tenant shipping note states the $20 to $30 rule plainly', () => {
  assert.ok(TCG_COPY.shippingNote.startsWith('eBay orders between $20 and $30 will be tracked.'));
  assert.ok(TCG_COPY.shippingNote.includes('under $20'));
});

test('copy: the sync never claims to send anything to TCGplayer or to ask for a login', () => {
  assert.ok(TCG_COPY.pageIntro.includes('Nothing is sent to TCGplayer for you'));
  assert.ok(TCG_COPY.pageIntro.includes('never asks for your TCGplayer login'));
});

test('wordingForTcgError: known code, server text, then the generic line', () => {
  assert.equal(wordingForTcgError('NO_FILE'), TCG_ERROR_WORDING.NO_FILE);
  assert.equal(wordingForTcgError('SOMETHING_NEW', '  Server says no.  '), 'Server says no.');
  assert.equal(wordingForTcgError('SOMETHING_NEW', ''), TCG_FALLBACK_ERROR);
  assert.equal(wordingForTcgError(undefined), TCG_FALLBACK_ERROR);
  assert.equal(wordingForTcgError('toString'), TCG_FALLBACK_ERROR);
});

test('tcgErrorSentence: network, response codes, status fallbacks', () => {
  assert.equal(tcgErrorSentence(new Error('boom')), TCG_COPY.networkFailed);
  assert.equal(tcgErrorSentence(null), TCG_COPY.networkFailed);
  assert.equal(tcgErrorSentence({ response: { status: 400, data: { success: false, error: 'x', code: 'NO_FILE' } } }), TCG_ERROR_WORDING.NO_FILE);
  assert.equal(tcgErrorSentence({ response: { status: 429, data: 'slow down' } }), TCG_ERROR_WORDING.RATE_LIMITED);
  assert.equal(tcgErrorSentence({ response: { status: 500, data: null } }), TCG_ERROR_WORDING.SERVER_ERROR);
  assert.equal(tcgErrorSentence({ response: { status: 418, data: { error: 'Teapot.' } } }), 'Teapot.');
  assert.equal(tcgErrorSentence({ response: { status: 418, data: {} } }), TCG_FALLBACK_ERROR);
});

test('readStatus: off, on, and broken shapes', () => {
  assert.deepEqual(readStatus({ data: { enabled: false } }), { enabled: false });
  assert.equal(readStatus(null), null);
  assert.equal(readStatus({}), null);
  assert.equal(readStatus({ data: { enabled: 'yes' } }), null);
  assert.equal(readStatus({ data: { enabled: true } }), null);
  const ok = readStatus({
    data: {
      enabled: true, cardsTracked: 12, listedOnTcgplayer: 7, notOnTcgplayer: 5, waitingToSendCount: 1, waitingToSend: [line()],
      exportWaiting: true, exportWaitingCards: 2, lastSyncedAt: '2026-10-01T12:00:00.000Z',
      skipped: { noTcgplayerId: 2, graded: 1, notACard: 3 },
    },
  });
  assert.ok(ok && ok.enabled === true);
  if (ok && ok.enabled === true) {
    assert.equal(ok.cardsTracked, 12);
    assert.equal(ok.waitingToSend[0].cardName, 'Lightning Bolt');
    assert.equal(ok.exportWaiting, true);
    assert.deepEqual(ok.skipped, { noTcgplayerId: 2, graded: 1, notACard: 3 });
  }
  // A waiting line with a missing number rejects the whole response.
  assert.equal(
    readStatus({ data: { enabled: true, cardsTracked: 1, listedOnTcgplayer: 1, notOnTcgplayer: 0, waitingToSendCount: 1, waitingToSend: [line({ toSend: 'x' })] } }),
    null
  );
});

test('readStatus: optional parts default safely', () => {
  const ok = readStatus({ data: { enabled: true, cardsTracked: 0, listedOnTcgplayer: 0, notOnTcgplayer: 0, waitingToSendCount: 0, waitingToSend: [] } });
  assert.ok(ok && ok.enabled === true);
  if (ok && ok.enabled === true) {
    assert.equal(ok.exportWaiting, false);
    assert.equal(ok.lastSyncedAt, null);
    assert.deepEqual(ok.skipped, { noTcgplayerId: 0, graded: 0, notACard: 0 });
  }
});

test('readRegisterCheck: off, on, broken', () => {
  assert.deepEqual(readRegisterCheck({ data: { enabled: false, items: [] } }), { enabled: false, items: [] });
  assert.equal(readRegisterCheck({ data: { enabled: true } }), null);
  assert.equal(readRegisterCheck({ data: { enabled: true, items: [{ itemId: 'a' }] } }), null);
  const ok = readRegisterCheck({ data: { enabled: true, items: [{ itemId: 'a', onTcgplayer: true, tcgplayerQty: 4, available: 2 }, { itemId: 'b', onTcgplayer: false }] } });
  assert.ok(ok);
  assert.equal(ok?.items.length, 2);
  assert.equal(ok?.items[1].tcgplayerQty, 0);
  assert.equal(listedCount(ok ? ok.items : []), 1);
});

test('readExport: a file, nothing to send, broken', () => {
  const full = readExport({ data: { fileName: 'tcgplayer-update-2026-10-05.csv', rowCount: 2, csv: 'a,b\n1,2\n', summary: { rows: 2, newListings: 0, unchanged: 5, notOnTcgplayer: 1 } } });
  assert.equal(full?.csv, 'a,b\n1,2\n');
  assert.equal(full?.summary.unchanged, 5);
  const none = readExport({ data: { fileName: 'x.csv', rowCount: 0, csv: null } });
  assert.equal(none?.csv, null);
  assert.equal(none?.summary.rows, 0);
  assert.equal(readExport({ data: { fileName: 'x.csv', rowCount: 0, csv: 5 } }), null);
  assert.equal(readExport({ data: { rowCount: 0, csv: null } }), null);
  assert.equal(readExport(undefined), null);
});

test('readReconcileReport: valid and broken', () => {
  const change = { ...line({ toSend: 0 }), kind: 'DECREASE', fileTotal: 2, availableAfter: 2, change: -1, shortfall: 0, firstSync: false, note: null };
  const ok = readReconcileReport({
    data: report({
      totals: totals({ decreased: 1, unitsRemoved: 1 }),
      changes: [change],
      problems: [{ row: 4, message: 'Quantity is not a number.' }],
      problemCount: 1,
      notInFindasale: [{ row: 5, productId: 9, condition: 'Lightly Played', total: 2 }],
      listedButMissing: [line()],
      duplicateKeys: [{ key: '1|NM|N', rows: [2, 3] }],
      applied: true,
    }),
  });
  assert.ok(ok);
  assert.equal(ok?.changes[0].kind, 'DECREASE');
  assert.equal(ok?.applied, true);
  assert.deepEqual(ok?.duplicateKeys[0].rows, [2, 3]);
  assert.equal(ok?.notInFindasale[0].condition, 'Lightly Played');

  assert.equal(readReconcileReport({ data: report({ changes: [{ ...change, kind: 'MAYBE' }] }) }), null);
  assert.equal(readReconcileReport({ data: report({ totals: { inSync: 1 } }) }), null);
  assert.equal(readReconcileReport({ data: report({ problems: [{ row: 'x', message: 'm' }] }) }), null);
  assert.equal(readReconcileReport({ data: { ...report(), changes: 'no' } }), null);
  assert.equal(readReconcileReport({}), null);
});

test('cardLabel leaves out missing parts and falls back to the TCGplayer ID', () => {
  assert.equal(cardLabel(line()), 'Lightning Bolt, Alpha #161, Near Mint');
  assert.equal(cardLabel({ cardName: null, setName: null, collectorNumber: null, condition: '', productId: 77 }), 'TCGplayer ID 77');
  assert.equal(cardLabel({ cardName: 'Island', setName: '', collectorNumber: '  ', condition: 'Moderately Played' }), 'Island, Moderately Played');
  assert.equal(cardLabel({ cardName: null, setName: null, collectorNumber: null, condition: '' }), 'Card');
});

test('signed shows a plus for gains only', () => {
  assert.equal(signed(2), '+2');
  assert.equal(signed(0), '0');
  assert.equal(signed(-3), '-3');
});

test('reportSentences and reportHasChanges: preview versus applied wording', () => {
  const quiet = readReconcileReport({ data: report() });
  assert.ok(quiet);
  assert.deepEqual(reportSentences(quiet!), []);
  assert.equal(reportHasChanges(quiet!), false);

  const busy = readReconcileReport({
    data: report({
      totals: totals({ decreased: 2, unitsRemoved: 3, increased: 1, unitsAdded: 1, shortfallCards: 1, shortfallUnits: 1, needsNewItem: 1, firstSyncCards: 4, stillToSendCards: 2 }),
    }),
  });
  assert.ok(busy);
  assert.equal(reportHasChanges(busy!), true);
  const preview = reportSentences(busy!);
  assert.equal(preview[0], 'Would remove 3 units across 2 cards that sold on TCGplayer.');
  assert.ok(preview[1].startsWith('Would add 1 unit across 1 card'));
  assert.ok(preview.some((s) => s.startsWith('1 unit sold on TCGplayer was not in stock here.')));
  assert.ok(preview.some((s) => s.startsWith('1 card needs to be added')));
  assert.ok(preview.some((s) => s.startsWith('4 cards were matched with TCGplayer for the first time.')));
  assert.ok(preview.some((s) => s.startsWith('2 cards still differ from TCGplayer.')));

  const applied = readReconcileReport({ data: report({ applied: true, totals: totals({ decreased: 1, unitsRemoved: 1 }) }) });
  assert.deepEqual(reportSentences(applied!), ['Removed 1 unit across 1 card that sold on TCGplayer.']);
  for (const s of [...preview, ...reportSentences(applied!)]) {
    assert.ok(!s.includes('—') && !/ -- /.test(s), `dash in: ${s}`);
  }
});

test('formatSyncedAt gives a date or the not yet word', () => {
  assert.equal(formatSyncedAt('2026-10-01T23:59:59.000Z'), '2026-10-01');
  assert.equal(formatSyncedAt(null), TCG_COPY.neverSynced);
  assert.equal(formatSyncedAt('not a date'), TCG_COPY.neverSynced);
});

test('registerIds and registerKey: unique, ordered, order free key', () => {
  assert.deepEqual(registerIds(['a', undefined, '', 'b', 'a', null]), ['a', 'b']);
  assert.equal(registerKey(['b', 'a']), registerKey(['a', 'b']));
  assert.equal(registerKey([]), '');
});

test('counterMessage: nothing when nothing is listed, one and many, cart and sold', () => {
  assert.equal(counterMessage(0, false), null);
  assert.equal(counterMessage(-1, true), null);
  assert.equal(counterMessage(1, false), TCG_COPY.counterOne);
  assert.equal(counterMessage(3, false), TCG_COPY.counterMany);
  assert.equal(counterMessage(1, true), TCG_COPY.soldOne);
  assert.equal(counterMessage(2, true), TCG_COPY.soldMany);
  assert.ok(TCG_COPY.counterOne.startsWith('This card is also listed on TCGplayer.'));
});

test('disabled memory: remembered for a few minutes, then asked again', () => {
  forgetDisabled();
  assert.equal(isKnownDisabled('s1', 1000), false);
  rememberDisabled('s1', 1000);
  assert.equal(isKnownDisabled('s1', 1000 + 60 * 1000), true);
  assert.equal(isKnownDisabled('s2', 1000 + 60 * 1000), false);
  assert.equal(isKnownDisabled('s1', 1000 + 6 * 60 * 1000), false);
  assert.equal(isKnownDisabled('s1', 1000 + 60 * 1000), false, 'an expired entry is dropped');
  forgetDisabled();
});

test('reconcileFields: the upload answer is sent only when a file is waiting and it was answered', () => {
  assert.deepEqual(reconcileFields({ exportWaiting: false, uploaded: null, firstSync: 'FLAG_ONLY' }), [['firstSync', 'FLAG_ONLY']]);
  assert.deepEqual(reconcileFields({ exportWaiting: false, uploaded: true, firstSync: 'FLAG_ONLY' }), [['firstSync', 'FLAG_ONLY']]);
  assert.deepEqual(reconcileFields({ exportWaiting: true, uploaded: true, firstSync: 'ADOPT_TCGPLAYER' }), [
    ['firstSync', 'ADOPT_TCGPLAYER'],
    ['lastExportUploaded', 'true'],
  ]);
  assert.deepEqual(reconcileFields({ exportWaiting: true, uploaded: false, firstSync: 'FLAG_ONLY' }), [
    ['firstSync', 'FLAG_ONLY'],
    ['lastExportUploaded', 'false'],
  ]);
});

test('needsUploadedAnswer only blocks while a file is waiting and unanswered', () => {
  assert.equal(needsUploadedAnswer(true, null), true);
  assert.equal(needsUploadedAnswer(true, false), false);
  assert.equal(needsUploadedAnswer(true, true), false);
  assert.equal(needsUploadedAnswer(false, null), false);
});

test('paths and defaults', () => {
  assert.equal(reconcileUrl('sale 1', 'preview'), '/card-tcgplayer/sale%201/reconcile/preview');
  assert.equal(reconcileUrl('s', 'apply'), '/card-tcgplayer/s/reconcile/apply');
  assert.equal(syncPagePath('abc/def'), '/organizer/card-tcgplayer/abc%2Fdef');
  assert.deepEqual(DEFAULT_EXPORT_CHOICES, { includeNew: false, includePrices: false, quantityColumn: 'ADD' });
});

test('saveTextFile answers false without a document', () => {
  assert.equal(typeof document, 'undefined');
  assert.equal(saveTextFile('x.csv', 'a,b'), false);
});
