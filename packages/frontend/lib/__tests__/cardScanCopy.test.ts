/**
 * cardScanCopy (ADR-138 batch B6, AT-34): copy lint and error wording coverage for the Scan cards screens.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  SCAN_COPY,
  SCAN_ERROR_WORDING,
  SCAN_FILTER_LABELS,
  SCAN_NEED_LABELS,
  SCAN_PHASE_HINTS,
  allScanCopy,
  delverStatusLine,
  phaseHint,
  wordingForScanError,
} from '../cardScanCopy';

// Every code the /api/card-scan routes can send (ADR-138 section 9) plus failures that never reach the server.
const API_CODES = [
  'UNAUTHORIZED', 'FORBIDDEN', 'BAD_REQUEST', 'NOT_YOUR_SALE', 'SALE_NOT_FOUND', 'TOO_MANY_OPEN_SESSIONS', 'SESSION_NOT_FOUND',
  'BAD_FRAME', 'FRAME_TOO_LARGE', 'AI_QUOTA_EXCEEDED', 'SCAN_CAP_REACHED', 'RATE_LIMITED', 'SCAN_DISABLED', 'PROVIDER_UNAVAILABLE',
  'SESSION_NOT_OPEN', 'SESSION_FULL', 'CARD_VALIDATION', 'CARD_NOT_FOUND', 'ENTRY_CHANGED', 'SESSION_COMMITTING', 'MODE_REQUIRED',
  'ALREADY_APPLIED', 'MODE_MISMATCH', 'DB_SPACE_LOW', 'NOTHING_READY', 'SERVER_ERROR',
];
const LOCAL_CODES = ['NETWORK_ERROR', 'SESSION_ENDED', 'CANCELLED', 'BAD_RESPONSE', 'UNKNOWN', 'ENTRY_NOT_FOUND'];

test('copy lint: no "AI", no "estate sale", no dashes, no placeholder text', () => {
  const all = allScanCopy();
  assert.ok(all.length > 150, 'expected the full set of strings, got ' + all.length);
  for (const text of all) {
    assert.equal(typeof text, 'string');
    assert.ok(text.trim().length > 0, 'empty string in copy');
    assert.equal(text, text.trim(), `stray whitespace: "${text}"`);
    assert.ok(!/\bAI\b/.test(text), `"AI" in: ${text}`);
    assert.ok(!/\bA\.I\./.test(text), `"A.I." in: ${text}`);
    assert.ok(!/artificial intelligence/i.test(text), `automation wording in: ${text}`);
    assert.ok(!/estate\s*sale/i.test(text), `"estate sale" in: ${text}`);
    assert.ok(!/founder/i.test(text), `founder voice in: ${text}`);
    assert.ok(!text.includes('\u2014'), `em dash in: ${text}`);
    assert.ok(!text.includes('\u2013'), `en dash in: ${text}`);
    assert.ok(!/ -- /.test(text), `double hyphen dash in: ${text}`);
    assert.ok(!/lorem|\btodo\b|\btbd\b|placeholder|\[[^\]]*\]|\{\{|<[a-z/][^>]*>/i.test(text), `placeholder-like text in: ${text}`);
    assert.ok(!/undefined|NaN|\[object/.test(text), `leaked value in: ${text}`);
  }
});

test('copy lint: wording sentences end with a full stop', () => {
  for (const k of Object.keys(SCAN_ERROR_WORDING)) {
    assert.ok(/[.!?]$/.test(SCAN_ERROR_WORDING[k].message), `${k} message`);
    assert.ok(/[.!?]$/.test(SCAN_ERROR_WORDING[k].help), `${k} help`);
  }
  for (const k of Object.keys(SCAN_PHASE_HINTS)) assert.ok(/[.!?]$/.test(SCAN_PHASE_HINTS[k]), `${k} hint`);
});

test('the copy source files hold no em dash, en dash, double hyphen dash, banned word or "estate sale", even in comments', () => {
  const names = ['cardScan.ts', 'cardScanCapture.ts', 'cardScanQueue.ts', 'cardScanCopy.ts'];
  let checked = 0;
  for (const name of names) {
    const candidates = [path.resolve(process.cwd(), 'lib', name), path.resolve(process.cwd(), 'packages', 'frontend', 'lib', name)];
    let src: string | null = null;
    for (const p of candidates) {
      try {
        src = fs.readFileSync(p, 'utf8');
        break;
      } catch {
        /* try the next place */
      }
    }
    if (src === null) continue;
    checked += 1;
    assert.ok(!src.includes('\u2014'), `${name} has an em dash`);
    assert.ok(!src.includes('\u2013'), `${name} has an en dash`);
    assert.ok(!/ -- /.test(src), `${name} has a double hyphen dash`);
    assert.ok(!/\bAI\b/.test(src), `${name} has the word AI`);
    assert.ok(!/estate\s*sale/i.test(src), `${name} has "estate sale"`);
    assert.ok(src.indexOf('\u0000') < 0, `${name} has a NUL byte`);
  }
  assert.ok(checked === 0 || checked === names.length, 'either every file was found or none (a different working folder)');
});

test('every backend code has plain wording', () => {
  for (const code of API_CODES.concat(LOCAL_CODES)) {
    assert.ok(Object.prototype.hasOwnProperty.call(SCAN_ERROR_WORDING, code), `missing wording for ${code}`);
    const w = wordingForScanError(code);
    assert.ok(w.message.length > 8 && w.help.length > 8, code);
  }
});

test('unknown codes fall back to a generic message instead of undefined', () => {
  assert.equal(wordingForScanError('NOT_A_REAL_CODE').message, SCAN_ERROR_WORDING.UNKNOWN.message);
  assert.equal(wordingForScanError(null).message, SCAN_ERROR_WORDING.UNKNOWN.message);
  assert.equal(wordingForScanError(undefined).message, SCAN_ERROR_WORDING.UNKNOWN.message);
  assert.equal(wordingForScanError('constructor').message, SCAN_ERROR_WORDING.UNKNOWN.message);
  assert.equal(wordingForScanError('__proto__').message, SCAN_ERROR_WORDING.UNKNOWN.message);
});

test('the wording ADR-138 section 12 asks for is used word for word', () => {
  assert.equal(SCAN_COPY.pageTitle, 'Scan cards');
  assert.equal(SCAN_COPY.smartScanName, 'Smart scan');
  assert.equal(SCAN_COPY.suggestedCondition('Near Mint'), 'Suggested: Near Mint. Tap to use.');
  assert.equal(SCAN_COPY.smartScanDisabled, 'Smart scan is not turned on yet. You can still search for a card and add it by hand.');
  assert.equal(SCAN_COPY.smartScanQuota, "You have used this month's Smart tags. You can still add cards by search.");
  assert.equal(SCAN_COPY.smartScanPaused, 'Smart scan is paused for today. You can still add cards by search.');
  assert.equal(SCAN_COPY.duplicateHeld, 'Looks like the same card as the last one. Count it as another copy?');
  assert.equal(SCAN_COPY.nameMismatch, 'The set and number we read do not match the name. Pick the right printing.');
  assert.equal(SCAN_COPY.nameOnly, 'We found one printing with this name. Check the picture matches your card.');
  assert.equal(SCAN_COPY.gameNotServed, 'We do not have a card list for this game yet. Check the details and use them as typed.');
  assert.equal(SCAN_COPY.addToStock, 'Add to my stock');
  assert.equal(SCAN_COPY.replaceStock, 'Set my stock to this count');
  assert.equal(SCAN_COPY.commitDisclosureCondition(12, 'Near Mint'), '12 cards will be saved as Near Mint (your default for this session).');
  assert.equal(SCAN_COPY.commitDisclosureCondition(1, 'Near Mint'), '1 card will be saved as Near Mint (your default for this session).');
});

test('the four filters and the four "still needed" chips', () => {
  assert.deepEqual(SCAN_FILTER_LABELS, { NEEDS_DECISION: 'Needs a decision', READY: 'Ready', SKIPPED: 'Skipped', COMMITTED: 'Committed' });
  assert.deepEqual(Object.keys(SCAN_NEED_LABELS), ['PRINTING', 'FINISH', 'CONDITION', 'NAME']);
});

test('counts read correctly in the singular and the plural', () => {
  assert.equal(SCAN_COPY.sendWaiting(1), '1 picture waiting to send.');
  assert.equal(SCAN_COPY.sendWaiting(2), '2 pictures waiting to send.');
  assert.equal(SCAN_COPY.commitButton(1), 'Save 1 card');
  assert.equal(SCAN_COPY.commitButton(3), 'Save 3 cards');
  assert.equal(SCAN_COPY.commitNotReady(1), '1 card still needs a decision and will not be saved yet.');
  assert.equal(SCAN_COPY.commitNotReady(4), '4 cards still need a decision and will not be saved yet.');
  assert.equal(SCAN_COPY.commitNeedsPrice(1), '1 card has no price yet.');
  assert.equal(SCAN_COPY.commitNeedsPrice(2), '2 cards have no price yet.');
  assert.equal(SCAN_COPY.bulkResult(2, 0), 'Changed 2 cards.');
  assert.equal(SCAN_COPY.bulkResult(1, 1), 'Changed 1 card. 1 card was left as it was.');
  assert.equal(SCAN_COPY.bulkResult(5, 2), 'Changed 5 cards. 2 cards were left as they were.');
  assert.equal(SCAN_COPY.commitSummary(5, 2, 1, 0), '5 new, 2 added to existing stock, 1 skipped, 0 with problems.');
  assert.equal(SCAN_COPY.smartScanTagsLeft(1), '1 Smart tag left this month.');
  assert.equal(SCAN_COPY.groupCount(1), '1 copy');
  assert.equal(SCAN_COPY.groupCount(3), '3 copies');
});

test('capture phase hints and the Delver status line', () => {
  assert.deepEqual(Object.keys(SCAN_PHASE_HINTS), ['EMPTY', 'SETTLING', 'CAPTURED', 'WAIT_CLEAR']);
  assert.equal(phaseHint('SETTLING'), 'Hold still.');
  assert.equal(phaseHint('NOPE'), '');
  assert.equal(phaseHint('constructor'), '');
  assert.equal(delverStatusLine(null), 'Delver has not sent anything yet.');
  assert.equal(delverStatusLine(12), 'Delver connected, last event 12 seconds ago.');
  assert.equal(delverStatusLine(1), 'Delver connected, last event 1 second ago.');
  assert.equal(delverStatusLine(300), 'Delver connected, last event 5 minutes ago.');
  assert.equal(delverStatusLine(-4), 'Delver has not sent anything yet.');
  assert.equal(delverStatusLine(Number.NaN), 'Delver has not sent anything yet.');
});

test('the seller is never told a suggestion was applied for them', () => {
  const all = allScanCopy().join('\n');
  assert.ok(!/we (set|chose|picked|applied) the condition/i.test(all));
  assert.ok(!/automatically (set|applied|chosen)/i.test(all));
});

test('B7 screens: counts, names and the smaller-pictures hint read correctly', () => {
  assert.equal(SCAN_COPY.gradeLine('PSA', '9'), 'Graded: PSA 9');
  assert.equal(SCAN_COPY.gradeLine('', '9'), 'Graded: 9');
  assert.equal(SCAN_COPY.gradeLine('', ''), 'Graded card');
  assert.equal(SCAN_COPY.showingCount(40, 120), 'Showing 40 of 120.');
  assert.equal(SCAN_COPY.selectCard('Lightning Bolt'), 'Select Lightning Bolt');
  assert.equal(SCAN_COPY.openScanLabel('Binder 3'), 'Open scan Binder 3');
  assert.equal(SCAN_COPY.addPrintingLabel('Lightning Bolt'), 'Add Lightning Bolt to this scan');
  assert.equal(SCAN_COPY.addedCard('Lightning Bolt'), 'Added Lightning Bolt. Choose its finish and condition in your cards below.');
  assert.equal(SCAN_COPY.suggestedPriceValue('$1.25'), 'Suggested price: $1.25');
  assert.equal(SCAN_COPY.chooseImagesHint, 'Pick one picture for each card. Large pictures are made smaller before they are sent.');
  assert.equal(SCAN_COPY.captureHeading, 'Add cards');
  assert.equal(SCAN_COPY.tabCamera, 'Camera');
});

function readScreenSources(): Array<{ name: string; src: string }> {
  const roots = [
    path.resolve(process.cwd(), 'components', 'cardScan'),
    path.resolve(process.cwd(), 'packages', 'frontend', 'components', 'cardScan'),
  ];
  const out: Array<{ name: string; src: string }> = [];
  for (const root of roots) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!/\.(ts|tsx)$/.test(name)) continue;
      out.push({ name, src: fs.readFileSync(path.join(root, name), 'utf8') });
    }
    break;
  }
  for (const page of [
    path.resolve(process.cwd(), 'pages', 'organizer', 'card-scan', '[saleId].tsx'),
    path.resolve(process.cwd(), 'packages', 'frontend', 'pages', 'organizer', 'card-scan', '[saleId].tsx'),
  ]) {
    try {
      out.push({ name: 'card-scan/[saleId].tsx', src: fs.readFileSync(page, 'utf8') });
      break;
    } catch {
      /* try the next place */
    }
  }
  return out;
}

test('every SCAN_COPY key the Scan cards screens read exists', () => {
  const files = readScreenSources();
  const known = SCAN_COPY as unknown as Record<string, unknown>;
  for (const f of files) {
    const re = /SCAN_COPY\.([A-Za-z0-9_]+)/g;
    let m: RegExpExecArray | null = re.exec(f.src);
    while (m) {
      assert.ok(Object.prototype.hasOwnProperty.call(known, m[1]), `${f.name} reads SCAN_COPY.${m[1]}, which is not defined`);
      m = re.exec(f.src);
    }
  }
});

test('the Scan cards screen sources hold no em dash, en dash, double hyphen dash, "AI", "estate sale" or NUL byte', () => {
  for (const f of readScreenSources()) {
    assert.ok(!f.src.includes('\u2014'), `${f.name} has an em dash`);
    assert.ok(!f.src.includes('\u2013'), `${f.name} has an en dash`);
    assert.ok(!/ -- /.test(f.src), `${f.name} has a double hyphen dash`);
    assert.ok(!/\bAI\b/.test(f.src), `${f.name} has the word AI`);
    assert.ok(!/estate\s*sale/i.test(f.src), `${f.name} has "estate sale"`);
    assert.ok(f.src.indexOf('\u0000') < 0, `${f.name} has a NUL byte`);
  }
});
