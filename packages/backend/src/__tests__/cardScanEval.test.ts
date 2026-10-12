/**
 * Card scan accuracy harness (ADR-138 batch B4): acceptance AT-22.
 *   - Scoring is pure and every outcome class is checked.
 *   - The run refuses to do anything that can spend money unless the flag, the approval variable and the key are all
 *     present, and in that case it never builds a resolver or a recognizer.
 * Everything uses fakes; no file is read from disk except the source of the wrapper script, and no call is made.
 */
import fs from 'fs';
import path from 'path';
import {
  DEFAULT_PASS_BAR,
  EVAL_BUCKETS,
  candidateMatchesLabel,
  checkEvalRunGate,
  estimateEvalSpend,
  formatReport,
  parseEvalArgs,
  parseEvalLabels,
  runEval,
  scoreCase,
  summarize,
} from '../services/cardScan/evalScoring';
import type { EvalBucket, EvalCaseInput, EvalCaseResult, EvalLabel, EvalRecognizeOutcome, EvalRecognizer, EvalRunDeps } from '../services/cardScan/evalScoring';
import { resolveObservation } from '../services/cardScan/resolveObservation';
import type { CardObservation, ObservationResolution } from '../services/cardScan/types';
import { READY_STATE, makeCatalogResolver, observation } from './__fixtures__/cardScanFakes';

/** Em dash and en dash, written as escapes so this file itself contains neither character. */
const DASH_RE = /[\u2014\u2013]/;

function labelOf(file: string, over: Partial<EvalLabel> = {}): EvalLabel {
  return { file, game: 'MTG', name: 'Mox Pearl', setCode: 'lea', collectorNumber: '263', finish: 'NONFOIL', era: 'MODERN', ...over };
}

async function resolveWithFakeCatalog(obs: CardObservation): Promise<ObservationResolution> {
  return resolveObservation(obs, { catalog: READY_STATE, resolve: makeCatalogResolver().resolve });
}

async function readingCase(label: EvalLabel, obs: CardObservation, costUsd = 0.002): Promise<EvalCaseInput> {
  return { label, failureCode: null, observation: obs, resolution: await resolveWithFakeCatalog(obs), costUsd };
}

describe('AT-22 scoring: every outcome class', () => {
  it('CORRECT_READY: the pre-selected printing is the labelled one', async () => {
    const result = scoreCase(await readingCase(labelOf('a.jpg'), observation({ cardName: 'Mox Pearl', setCode: 'lea', collectorNumber: '263' })));
    expect(result.bucket).toBe('CORRECT_READY');
    expect(result.fields).toEqual({ game: true, name: true, setCode: true, collectorNumber: true, finish: true });
    expect(result.modernNonfoil).toBe(true);
  });

  it('CORRECT_AFTER_PICK: not pre-selected, but the labelled printing is among the candidates', async () => {
    const label = labelOf('b.jpg', { name: 'Lightning Bolt', setCode: 'm10', collectorNumber: '146' });
    const result = scoreCase(await readingCase(label, observation({ cardName: 'Lightning Bolt' })));
    expect(result.bucket).toBe('CORRECT_AFTER_PICK');
  });

  it('WRONG_READY: a printing was pre-selected and it is not the labelled one', async () => {
    const label = labelOf('c.jpg', { name: 'Lightning Bolt', setCode: 'm10', collectorNumber: '146' });
    const result = scoreCase(await readingCase(label, observation({ cardName: 'Mox Pearl', setCode: 'lea', collectorNumber: '263' })));
    expect(result.bucket).toBe('WRONG_READY');
    expect(result.fields).toMatchObject({ name: false, setCode: false, collectorNumber: false });
  });

  it('UNMATCHED: nothing matched, or the labelled printing is not among the candidates', async () => {
    const pokemon = scoreCase(await readingCase(labelOf('d.jpg', { game: 'POKEMON', name: 'Synthetic Dragon', setCode: 'sd1', collectorNumber: '4' }), observation({ game: 'POKEMON', cardName: 'Synthetic Dragon' })));
    expect(pokemon.bucket).toBe('UNMATCHED');

    // The alpha printing falls outside the five candidates listed for a bare name.
    const alpha = labelOf('e.jpg', { name: 'Lightning Bolt', setCode: 'lea', collectorNumber: '161' });
    expect(scoreCase(await readingCase(alpha, observation({ cardName: 'Lightning Bolt' }))).bucket).toBe('UNMATCHED');

    expect(scoreCase(await readingCase(labelOf('f.jpg'), observation({ cardName: 'Name Nobody Printed' }))).bucket).toBe('UNMATCHED');
  });

  it('NO_CARD for a real "no card" answer, ERROR for a failed call', () => {
    const base = { label: labelOf('g.jpg'), observation: null, resolution: null, costUsd: 0.002 };
    expect(scoreCase({ ...base, failureCode: 'NO_CARD' }).bucket).toBe('NO_CARD');
    expect(scoreCase({ ...base, failureCode: 'UNREADABLE' }).bucket).toBe('NO_CARD');
    for (const code of ['PROVIDER_ERROR', 'RATE_LIMIT', 'DISABLED', 'CAP_REACHED', 'RESOLVE_ERROR']) {
      expect(scoreCase({ ...base, failureCode: code }).bucket).toBe('ERROR');
    }
    expect(scoreCase({ ...base, failureCode: null }).bucket).toBe('ERROR');
  });

  it('a pre-selected printing that cannot be checked against the label counts as wrong', () => {
    const resolution: ObservationResolution = { status: 'EXACT', printingId: 'SCRYFALL:missing', candidates: [], truncated: false, agreement: 'FULL', note: null };
    const result = scoreCase({ label: labelOf('h.jpg'), failureCode: null, observation: observation({ cardName: 'Mox Pearl' }), resolution, costUsd: 0 });
    expect(result.bucket).toBe('WRONG_READY');
  });

  it('a name only match that picks the right printing counts as CORRECT_READY', async () => {
    const result = scoreCase(await readingCase(labelOf('i.jpg'), observation({ cardName: 'Mox Pearl', setCode: 'zzz', collectorNumber: '9' })));
    expect(result.bucket).toBe('CORRECT_READY');
  });

  it('a label can only be a bucket from the closed list', () => {
    expect([...EVAL_BUCKETS].sort()).toEqual(['CORRECT_AFTER_PICK', 'CORRECT_READY', 'ERROR', 'NO_CARD', 'UNMATCHED', 'WRONG_READY']);
  });

  it('candidateMatchesLabel compares the set code and the collector number only, ignoring case and leading zeros', () => {
    const label = labelOf('j.jpg', { setCode: 'M10', collectorNumber: '146' });
    expect(candidateMatchesLabel({ setCode: 'm10', collectorNumber: '146' }, label)).toBe(true);
    expect(candidateMatchesLabel({ setCode: 'm10', collectorNumber: '0146' }, label)).toBe(true);
    expect(candidateMatchesLabel({ setCode: 'm11', collectorNumber: '146' }, label)).toBe(false);
    expect(candidateMatchesLabel({ setCode: 'm10', collectorNumber: null }, label)).toBe(false);
  });
});

describe('AT-22 finish detection and field comparison', () => {
  it('a foil label is detected only when the recognizer reported that finish', async () => {
    const label = labelOf('k.jpg', { finish: 'FOIL' });
    const hit = scoreCase(await readingCase(label, observation({ cardName: 'Mox Pearl', setCode: 'lea', collectorNumber: '263', finish: 'FOIL' })));
    const miss = scoreCase(await readingCase(label, observation({ cardName: 'Mox Pearl', setCode: 'lea', collectorNumber: '263' })));
    const wrong = scoreCase(await readingCase(label, observation({ cardName: 'Mox Pearl', setCode: 'lea', collectorNumber: '263', finish: 'ETCHED' })));
    expect([hit, miss, wrong].map((r) => [r.finishKind, r.finishCorrect])).toEqual([['FOIL', true], ['FOIL', false], ['FOIL', false]]);
  });

  it('a nonfoil label is wrong only when the recognizer reported a foil like finish', async () => {
    const label = labelOf('l.jpg', { finish: 'NONFOIL' });
    const none = scoreCase(await readingCase(label, observation({ cardName: 'Mox Pearl', setCode: 'lea', collectorNumber: '263' })));
    const nonfoil = scoreCase(await readingCase(label, observation({ cardName: 'Mox Pearl', setCode: 'lea', collectorNumber: '263', finish: 'NONFOIL' })));
    const foil = scoreCase(await readingCase(label, observation({ cardName: 'Mox Pearl', setCode: 'lea', collectorNumber: '263', finish: 'FOIL' })));
    expect([none, nonfoil, foil].map((r) => r.finishCorrect)).toEqual([true, true, false]);
  });

  it('a label without a finish is not part of the finish statistics', async () => {
    const label = { ...labelOf('m.jpg'), finish: undefined };
    const result = scoreCase(await readingCase(label, observation({ cardName: 'Mox Pearl', setCode: 'lea', collectorNumber: '263', finish: 'FOIL' })));
    expect(result.finishKind).toBeNull();
    expect(result.finishCorrect).toBeNull();
    expect(result.fields?.finish).toBeNull();
    expect(result.modernNonfoil).toBe(false);
  });

  it('the modern nonfoil cohort needs both the MODERN era and the NONFOIL finish', async () => {
    const obs = observation({ cardName: 'Mox Pearl', setCode: 'lea', collectorNumber: '263' });
    expect(scoreCase(await readingCase(labelOf('n1.jpg', { era: 'OLD' }), obs)).modernNonfoil).toBe(false);
    expect(scoreCase(await readingCase(labelOf('n2.jpg', { era: undefined }), obs)).modernNonfoil).toBe(false);
    expect(scoreCase(await readingCase(labelOf('n3.jpg', { finish: 'FOIL' }), obs)).modernNonfoil).toBe(false);
    expect(scoreCase(await readingCase(labelOf('n4.jpg'), obs)).modernNonfoil).toBe(true);
  });

  it('compares the double faced name by either face', async () => {
    const label = labelOf('o.jpg', { name: 'Delver of Secrets', setCode: 'isd', collectorNumber: '51' });
    const result = scoreCase(await readingCase(label, observation({ cardName: 'Delver of Secrets // Insectile Aberration', setCode: 'isd', collectorNumber: '51' })));
    expect(result.bucket).toBe('CORRECT_READY');
    expect(result.fields?.name).toBe(true);
  });
});

function made(bucket: EvalBucket, over: Partial<EvalCaseResult> = {}): EvalCaseResult {
  return { file: `${bucket}.jpg`, bucket, modernNonfoil: true, fields: null, finishKind: null, finishCorrect: null, costUsd: 0.002, ...over };
}
const many = (n: number, bucket: EvalBucket, over: Partial<EvalCaseResult> = {}) => Array.from({ length: n }, (_, i) => made(bucket, { file: `${bucket}-${i}.jpg`, ...over }));

describe('AT-22 summary and the D4 pass bar', () => {
  it('passes at exactly 90 percent of modern nonfoil correct with no WRONG_READY', () => {
    const s = summarize([...many(80, 'CORRECT_READY'), ...many(10, 'CORRECT_AFTER_PICK'), ...many(10, 'UNMATCHED')]);
    expect(s.modernNonfoil).toEqual({ total: 100, correct: 90, pct: 90, wrongReady: 0 });
    expect(s.verdict).toEqual({ passed: true, reasons: [] });
  });

  it('fails below 90 percent', () => {
    const s = summarize([...many(89, 'CORRECT_READY'), ...many(11, 'UNMATCHED')]);
    expect(s.verdict.passed).toBe(false);
    expect(s.verdict.reasons.join(' ')).toContain('Modern nonfoil correct is 89 percent');
  });

  it('allows WRONG_READY at exactly 1 percent and fails above it', () => {
    const ok = summarize([...many(99, 'CORRECT_READY'), ...many(1, 'WRONG_READY')]);
    expect(ok.pct.wrongReady).toBe(1);
    expect(ok.verdict.passed).toBe(true);
    const bad = summarize([...many(98, 'CORRECT_READY'), ...many(2, 'WRONG_READY')]);
    expect(bad.verdict.passed).toBe(false);
    expect(bad.verdict.reasons.join(' ')).toContain('WRONG_READY is 2 percent');
  });

  it('measures WRONG_READY across all scored photos, not only the modern cohort', () => {
    const s = summarize([...many(50, 'CORRECT_READY'), ...many(48, 'CORRECT_READY', { modernNonfoil: false }), ...many(2, 'WRONG_READY', { modernNonfoil: false })]);
    expect(s.modernNonfoil.wrongReady).toBe(0);
    expect(s.counts.WRONG_READY).toBe(2);
    expect(s.verdict.passed).toBe(false);
  });

  it('never passes with a call error, an empty run, or no modern nonfoil photo', () => {
    expect(summarize([...many(99, 'CORRECT_READY'), ...many(1, 'ERROR')]).verdict.passed).toBe(false);
    expect(summarize([]).verdict.passed).toBe(false);
    const noCohort = summarize(many(20, 'CORRECT_READY', { modernNonfoil: false }));
    expect(noCohort.verdict.passed).toBe(false);
    expect(noCohort.verdict.reasons.join(' ')).toContain('No modern nonfoil photo');
  });

  it('percentages are of scored photos (everything except call errors), rounded to one decimal', () => {
    const s = summarize([...many(1, 'CORRECT_READY'), ...many(1, 'UNMATCHED'), ...many(1, 'NO_CARD'), ...many(3, 'ERROR')]);
    expect(s.total).toBe(6);
    expect(s.scored).toBe(3);
    expect(s.pct).toEqual({ correctReady: 33.3, correctAfterPick: 0, wrongReady: 0, unmatched: 33.3, noCard: 33.3 });
    expect(summarize([]).pct.correctReady).toBe(0);
  });

  it('adds up measured cost and the field and finish statistics', async () => {
    const results = [
      scoreCase(await readingCase(labelOf('p1.jpg'), observation({ cardName: 'Mox Pearl', setCode: 'lea', collectorNumber: '263' }), 0.002)),
      scoreCase(await readingCase(labelOf('p2.jpg', { finish: 'FOIL' }), observation({ cardName: 'Mox Pearl', setCode: 'lea', collectorNumber: '263', finish: 'FOIL' }), 0.003)),
      scoreCase(await readingCase(labelOf('p3.jpg'), observation({ cardName: 'Mox Pearl', setCode: 'lea', collectorNumber: '263', finish: 'FOIL' }), 0.001)),
    ];
    const s = summarize(results);
    expect(s.totalCostUsd).toBe(0.006);
    expect(s.finish).toEqual({ foilLabelled: 1, foilDetected: 1, nonfoilLabelled: 2, falseFoil: 1, foilDetectionPct: 100, falseFoilPct: 50 });
    expect(s.fields.setCode).toEqual({ matched: 3, compared: 3, pct: 100 });
    expect(s.fields.finish).toEqual({ matched: 2, compared: 3, pct: 66.7 });
  });

  it('the report names every WRONG_READY photo and states the verdict', () => {
    const results = [made('CORRECT_READY'), made('WRONG_READY', { file: 'bad-one.jpg' })];
    const lines = formatReport(summarize(results), results);
    const text = lines.join('\n');
    expect(text).toContain('WRONG_READY photos: bad-one.jpg');
    expect(text).toContain('Verdict: NOT PASSED');
    expect(text).not.toMatch(DASH_RE);
    expect(formatReport(summarize(many(10, 'CORRECT_READY'))).join('\n')).toContain('Verdict: PASS');
  });

  it('the default bar is the one in the ADR: 90 percent and 1 percent', () => {
    expect(DEFAULT_PASS_BAR).toEqual({ modernNonfoilMinPct: 90, wrongReadyMaxPct: 1 });
  });

  it('estimates spend before any call', () => {
    expect(estimateEvalSpend(200, 0.0022)).toEqual({ frames: 200, perFrameUsd: 0.0022, totalUsd: 0.44 });
    expect(estimateEvalSpend(0, 0.0022).totalUsd).toBe(0);
  });
});

describe('labels file', () => {
  const good = { file: '001.jpg', game: 'mtg', name: 'Lightning Bolt', setCode: 'm10', collectorNumber: '146', finish: 'nonfoil', era: 'modern', language: 'EN' };

  it('accepts an array or an object with a labels array, normalizing the vocabulary', () => {
    const a = parseEvalLabels([good]);
    expect(a.errors).toEqual([]);
    expect(a.labels).toEqual([{ file: '001.jpg', game: 'MTG', name: 'Lightning Bolt', setCode: 'm10', collectorNumber: '146', finish: 'NONFOIL', language: 'en', era: 'MODERN' }]);
    expect(parseEvalLabels({ labels: [good] }).labels).toHaveLength(1);
  });

  it('defaults the game to MTG and accepts a numeric collector number', () => {
    const r = parseEvalLabels([{ file: 'a.png', name: 'X', setCode: 's', collectorNumber: 7 }]);
    expect(r.errors).toEqual([]);
    expect(r.labels[0]).toMatchObject({ game: 'MTG', collectorNumber: '7' });
  });

  it('reports every problem with the position of the label', () => {
    const r = parseEvalLabels([
      { ...good, file: '' },
      { ...good, file: '../escape.jpg' },
      { ...good, file: '/abs.jpg' },
      { ...good, file: 'dup.jpg' },
      { ...good, file: 'dup.jpg' },
      { ...good, file: 'g.jpg', game: 'chess' },
      { ...good, file: 'h.jpg', finish: 'shiny' },
      { ...good, file: 'i.jpg', language: 'xx' },
      { ...good, file: 'j.jpg', era: 'ancient' },
      { ...good, file: 'k.jpg', name: '', setCode: '', collectorNumber: '' },
      'not an object',
    ]);
    expect(r.labels.map((l) => l.file)).toEqual(['dup.jpg']);
    const text = r.errors.join('\n');
    for (const needle of ['labels[0]: file is required', 'labels[1]: file must be a plain relative path', 'labels[2]: file must be a plain relative path', 'labels[4]: file "dup.jpg" is listed twice', 'labels[5]: game "chess"', 'labels[6]: finish "shiny"', 'labels[7]: language "xx"', 'labels[8]: era must be MODERN or OLD', 'labels[9]: name is required', 'labels[9]: setCode is required', 'labels[9]: collectorNumber is required', 'labels[10]: must be an object']) {
      expect(text).toContain(needle);
    }
  });

  it('rejects a file that is not a list, or is empty', () => {
    expect(parseEvalLabels({}).errors).toHaveLength(1);
    expect(parseEvalLabels('nope').errors).toHaveLength(1);
    expect(parseEvalLabels([]).errors).toEqual(['The labels file has no labels.']);
  });
});

describe('AT-22 run gate', () => {
  const FULL = { CARD_SCAN_EVAL_APPROVED: 'yes', ANTHROPIC_API_KEY: 'test-key-not-real' };

  it('allows a run only with the flag, the approval and the key', () => {
    expect(checkEvalRunGate({ confirmSpend: true, mode: 'HAIKU_ONLY' }, FULL)).toEqual({ allowed: true, reasons: [] });
    const noFlag = checkEvalRunGate({ confirmSpend: false, mode: 'HAIKU_ONLY' }, FULL);
    expect(noFlag.allowed).toBe(false);
    expect(noFlag.reasons).toEqual(['The --confirm-spend flag was not given.']);
    expect(checkEvalRunGate({ confirmSpend: true, mode: 'HAIKU_ONLY' }, { ...FULL, CARD_SCAN_EVAL_APPROVED: undefined }).allowed).toBe(false);
    for (const value of ['no', 'true', '1', '', 'YESPLEASE']) {
      expect(checkEvalRunGate({ confirmSpend: true, mode: 'HAIKU_ONLY' }, { ...FULL, CARD_SCAN_EVAL_APPROVED: value }).allowed).toBe(false);
    }
    expect(checkEvalRunGate({ confirmSpend: true, mode: 'HAIKU_ONLY' }, { ...FULL, ANTHROPIC_API_KEY: '  ' }).reasons).toEqual(['ANTHROPIC_API_KEY is not set.']);
    expect(checkEvalRunGate({ confirmSpend: false, mode: 'HAIKU_ONLY' }, {}).reasons).toHaveLength(3);
  });

  it('the text detection mode also needs the Vision key', () => {
    expect(checkEvalRunGate({ confirmSpend: true, mode: 'OCR_PLUS_HAIKU' }, FULL).reasons).toEqual(['GOOGLE_VISION_API_KEY is not set (needed for OCR_PLUS_HAIKU).']);
    expect(checkEvalRunGate({ confirmSpend: true, mode: 'OCR_PLUS_HAIKU' }, { ...FULL, GOOGLE_VISION_API_KEY: 'test-vision-key' }).allowed).toBe(true);
  });

  it('accepts the approval in any letter case', () => {
    expect(checkEvalRunGate({ confirmSpend: true, mode: 'HAIKU_ONLY' }, { ...FULL, CARD_SCAN_EVAL_APPROVED: ' Yes ' }).allowed).toBe(true);
  });
});

describe('command line arguments', () => {
  it('reads every flag in both spellings', () => {
    const a = parseEvalArgs(['--labels', 'l.json', '--images=./p', '--out', 'o.json', '--confirm-spend', '--mode', 'ocr_plus_haiku', '--max-usd=1.5']);
    expect(a).toEqual({ labelsPath: 'l.json', imagesDir: './p', resultsPath: null, outPath: 'o.json', confirmSpend: true, help: false, mode: 'OCR_PLUS_HAIKU', maxUsd: 1.5, errors: [] });
    expect(parseEvalArgs(['--results', 'r.json']).resultsPath).toBe('r.json');
    expect(parseEvalArgs(['-h']).help).toBe(true);
  });

  it('spends nothing by default: the confirm flag is false unless given', () => {
    expect(parseEvalArgs([]).confirmSpend).toBe(false);
    expect(parseEvalArgs([]).maxUsd).toBe(2);
  });

  it('collects errors for unknown flags, missing values and bad values', () => {
    const a = parseEvalArgs(['--wat', '--labels', '--mode', 'fast', '--max-usd', '-3', '--images']);
    expect(a.errors).toEqual(['Unknown argument: --wat', '--labels needs a value.', '--mode must be HAIKU_ONLY or OCR_PLUS_HAIKU.', '--max-usd must be a positive number.', '--images needs a value.']);
  });
});

// ---------------------------------------------------------------------------------------------
// runEval with fakes
// ---------------------------------------------------------------------------------------------

const KEYED = { CARD_SCAN_EVAL_APPROVED: 'yes', ANTHROPIC_API_KEY: 'test-key-not-real' };

interface Harness {
  deps: EvalRunDeps;
  logs: string[];
  written: Map<string, string>;
  getResolver: jest.Mock;
  getRecognizer: jest.Mock;
  recognize: jest.Mock;
  recognizerEnvs: Array<Record<string, string | undefined>>;
}

function harness(opts: {
  labels: unknown;
  images?: string[] | 'all';
  outcomes?: (file: string, index: number) => EvalRecognizeOutcome;
  perFrameUsd?: number;
  resolverError?: Error;
  available?: boolean;
  extraFiles?: Record<string, string>;
}): Harness {
  const files = new Map<string, string>([['labels.json', JSON.stringify(opts.labels)]]);
  for (const [name, text] of Object.entries(opts.extraFiles ?? {})) files.set(name, text);
  const list = Array.isArray(opts.labels) ? (opts.labels as EvalLabel[]) : [];
  const present = new Set((opts.images === 'all' || opts.images === undefined ? list.map((l) => l.file) : opts.images).map((f) => path.join('photos', f)));
  const logs: string[] = [];
  const written = new Map<string, string>();
  let index = 0;
  const recognize = jest.fn(async (frame: { buffer: Buffer; mimeType: string }, _hint: { game?: string }): Promise<EvalRecognizeOutcome> => {
    const file = frame.buffer.toString();
    const position = index;
    index += 1;
    return opts.outcomes ? opts.outcomes(file, position) : reading(file);
  });
  const recognizer: EvalRecognizer = { isAvailable: () => opts.available !== false, recognize: recognize as unknown as EvalRecognizer['recognize'] };
  const recognizerEnvs: Array<Record<string, string | undefined>> = [];
  const getRecognizer = jest.fn(async (env: Record<string, string | undefined>) => {
    recognizerEnvs.push(env);
    return recognizer;
  });
  const getResolver = jest.fn(async () => {
    if (opts.resolverError) throw opts.resolverError;
    return resolveWithFakeCatalog;
  });
  const deps: EvalRunDeps = {
    readText: (p) => {
      const text = files.get(p);
      if (text === undefined) throw new Error(`no such file ${p}`);
      return text;
    },
    fileExists: (p) => present.has(p),
    readImage: (p) => Buffer.from(path.basename(p)),
    writeText: (p, content) => {
      written.set(p, content);
    },
    log: (line) => {
      logs.push(line);
    },
    estimatePerFrameUsd: () => opts.perFrameUsd ?? 0.0025,
    getResolver: getResolver as unknown as EvalRunDeps['getResolver'],
    getRecognizer: getRecognizer as unknown as EvalRunDeps['getRecognizer'],
  };
  return { deps, logs, written, getResolver, getRecognizer, recognize, recognizerEnvs };
}

/** The recognizer reads the Mox Pearl card correctly for every photo. */
function reading(_file: string, costUsd = 0.002): EvalRecognizeOutcome {
  return { ok: true, observation: observation({ cardName: 'Mox Pearl', setCode: 'lea', collectorNumber: '263' }), usage: { costUsd } };
}

const TEN = Array.from({ length: 10 }, (_, i) => labelOf(`card-${i}.jpg`));
const LABELS_ARGS = ['--labels', 'labels.json', '--images', 'photos'];

describe('AT-22 the run refuses to spend unless it is fully approved', () => {
  it('without --confirm-spend: prints the estimate, refuses, and builds no resolver and no recognizer', async () => {
    const h = harness({ labels: TEN });
    const report = await runEval(parseEvalArgs(LABELS_ARGS), KEYED, h.deps);
    expect(report.exitCode).toBe(2);
    expect(h.getResolver).not.toHaveBeenCalled();
    expect(h.getRecognizer).not.toHaveBeenCalled();
    expect(h.recognize).not.toHaveBeenCalled();
    const text = h.logs.join('\n');
    expect(text).toContain('estimated spend $0.0250');
    expect(text).toContain('Refusing to run');
    expect(text).toContain('--confirm-spend');
    expect(text).toContain('No network call was made and no money was spent.');
    expect(text.indexOf('estimated spend')).toBeLessThan(text.indexOf('Refusing to run'));
    expect(h.written.size).toBe(0);
  });

  it.each([
    ['approval variable missing', { ANTHROPIC_API_KEY: 'k' }],
    ['approval variable wrong', { CARD_SCAN_EVAL_APPROVED: 'true', ANTHROPIC_API_KEY: 'k' }],
    ['key missing', { CARD_SCAN_EVAL_APPROVED: 'yes' }],
    ['nothing set', {}],
  ])('with the flag but %s', async (_name, env) => {
    const h = harness({ labels: TEN });
    const report = await runEval(parseEvalArgs([...LABELS_ARGS, '--confirm-spend']), env, h.deps);
    expect(report.exitCode).toBe(2);
    expect(h.getResolver).not.toHaveBeenCalled();
    expect(h.getRecognizer).not.toHaveBeenCalled();
    expect(h.logs.join('\n')).toContain('Refusing to run');
  });

  it('the text detection mode is refused without the Vision key', async () => {
    const h = harness({ labels: TEN });
    const report = await runEval(parseEvalArgs([...LABELS_ARGS, '--confirm-spend', '--mode', 'OCR_PLUS_HAIKU']), KEYED, h.deps);
    expect(report.exitCode).toBe(2);
    expect(h.logs.join('\n')).toContain('GOOGLE_VISION_API_KEY');
    expect(h.getRecognizer).not.toHaveBeenCalled();
  });

  it('refuses before any spend when the estimate is above the cap', async () => {
    const h = harness({ labels: TEN, perFrameUsd: 0.5 });
    const report = await runEval(parseEvalArgs([...LABELS_ARGS, '--confirm-spend', '--max-usd', '1']), KEYED, h.deps);
    expect(report.exitCode).toBe(2);
    expect(h.logs.join('\n')).toContain('above the cap');
    expect(h.getRecognizer).not.toHaveBeenCalled();
  });

  it('refuses when a labelled photo is missing or has an unsupported type, before any gate or call', async () => {
    const h = harness({ labels: [...TEN, labelOf('scan.tiff')], images: 'all' });
    const report = await runEval(parseEvalArgs([...LABELS_ARGS, '--confirm-spend']), KEYED, h.deps);
    expect(report.exitCode).toBe(2);
    expect(h.logs.join('\n')).toContain('scan.tiff');
    expect(h.getRecognizer).not.toHaveBeenCalled();

    const h2 = harness({ labels: TEN, images: ['card-0.jpg'] });
    expect((await runEval(parseEvalArgs([...LABELS_ARGS, '--confirm-spend']), KEYED, h2.deps)).exitCode).toBe(2);
    expect(h2.getRecognizer).not.toHaveBeenCalled();
  });

  it('refuses bad input: help, bad arguments, unreadable or invalid labels, a run with nothing to read', async () => {
    const help = harness({ labels: TEN });
    expect((await runEval(parseEvalArgs(['--help']), KEYED, help.deps)).exitCode).toBe(0);
    expect(help.logs.join('\n')).toContain('Nothing runs by itself');

    const badArgs = harness({ labels: TEN });
    expect((await runEval(parseEvalArgs(['--wat']), KEYED, badArgs.deps)).exitCode).toBe(2);

    const noInputs = harness({ labels: TEN });
    expect((await runEval(parseEvalArgs(['--confirm-spend']), KEYED, noInputs.deps)).exitCode).toBe(2);

    const invalid = harness({ labels: [{ file: 'x.jpg' }] });
    expect((await runEval(parseEvalArgs([...LABELS_ARGS, '--confirm-spend']), KEYED, invalid.deps)).exitCode).toBe(2);
    expect(invalid.getRecognizer).not.toHaveBeenCalled();

    const notJson = harness({ labels: TEN, extraFiles: { 'labels.json': '{oops' } });
    expect((await runEval(parseEvalArgs([...LABELS_ARGS, '--confirm-spend']), KEYED, notJson.deps)).exitCode).toBe(2);

    const missingFile = harness({ labels: TEN });
    expect((await runEval(parseEvalArgs(['--labels', 'nope.json', '--images', 'photos', '--confirm-spend']), KEYED, missingFile.deps)).exitCode).toBe(2);
  });

  it('a catalog that cannot be loaded stops the run before the recognizer is built', async () => {
    const h = harness({ labels: TEN, resolverError: new Error('the card list is not ready') });
    const report = await runEval(parseEvalArgs([...LABELS_ARGS, '--confirm-spend']), KEYED, h.deps);
    expect(report.exitCode).toBe(2);
    expect(h.getResolver).toHaveBeenCalledTimes(1);
    expect(h.getRecognizer).not.toHaveBeenCalled();
    expect(h.logs.join('\n')).toContain('the card list is not ready');
  });

  it('a recognizer that is not available stops the run before any photo is read', async () => {
    const h = harness({ labels: TEN, available: false });
    const report = await runEval(parseEvalArgs([...LABELS_ARGS, '--confirm-spend']), KEYED, h.deps);
    expect(report.exitCode).toBe(2);
    expect(h.recognize).not.toHaveBeenCalled();
  });
});

describe('AT-22 an approved run', () => {
  it('reads each photo once, blind, with the run forced on, and passes when every card is right', async () => {
    const h = harness({ labels: TEN });
    const report = await runEval(parseEvalArgs([...LABELS_ARGS, '--confirm-spend', '--out', 'run.json']), KEYED, h.deps);
    expect(report.exitCode).toBe(0);
    expect(h.recognize).toHaveBeenCalledTimes(10);
    for (const call of h.recognize.mock.calls) {
      expect(call[1]).toEqual({});
      expect(call[0].mimeType).toBe('image/jpeg');
    }
    expect(h.recognizerEnvs).toHaveLength(1);
    expect(h.recognizerEnvs[0]).toMatchObject({ CARD_SCAN_ENABLED: 'true', CARD_SCAN_MODE: 'HAIKU_ONLY', ANTHROPIC_API_KEY: 'test-key-not-real' });
    expect(report.summary?.counts.CORRECT_READY).toBe(10);
    expect(report.summary?.totalCostUsd).toBe(0.02);
    expect(h.logs.join('\n')).toContain('Verdict: PASS');
    const saved = JSON.parse(h.written.get('run.json') as string);
    expect(saved.cases).toHaveLength(10);
    expect(saved.summary.verdict.passed).toBe(true);
  });

  it('passes the chosen mode to the recognizer', async () => {
    const h = harness({ labels: TEN });
    await runEval(parseEvalArgs([...LABELS_ARGS, '--confirm-spend', '--mode', 'OCR_PLUS_HAIKU']), { ...KEYED, GOOGLE_VISION_API_KEY: 'test-vision-key' }, h.deps);
    expect(h.recognizerEnvs[0]).toMatchObject({ CARD_SCAN_MODE: 'OCR_PLUS_HAIKU' });
  });

  it('scores a mixed run into buckets and exits 1 when it is below the bar', async () => {
    const outcomes = (file: string): EvalRecognizeOutcome => {
      if (file === 'card-0.jpg') return { ok: false, code: 'NO_CARD', usage: { costUsd: 0.002 } };
      if (file === 'card-1.jpg') return { ok: false, code: 'RATE_LIMIT' };
      if (file === 'card-2.jpg') return { ok: true, observation: observation({ cardName: 'Counterspell', setCode: 'lea', collectorNumber: '55' }), usage: { costUsd: 0.002 } };
      return reading(file);
    };
    const h = harness({ labels: TEN, outcomes });
    const report = await runEval(parseEvalArgs([...LABELS_ARGS, '--confirm-spend']), KEYED, h.deps);
    expect(report.exitCode).toBe(1);
    expect(report.summary?.counts).toEqual({ CORRECT_READY: 7, CORRECT_AFTER_PICK: 0, WRONG_READY: 1, UNMATCHED: 0, NO_CARD: 1, ERROR: 1 });
    expect(h.logs.join('\n')).toContain('WRONG_READY photos: card-2.jpg');
  });

  it('a recognizer that throws counts as a call error and the run continues', async () => {
    const h = harness({
      labels: TEN,
      outcomes: (_file, index) => {
        if (index === 3) throw new Error('socket hang up');
        return reading('x');
      },
    });
    const report = await runEval(parseEvalArgs([...LABELS_ARGS, '--confirm-spend']), KEYED, h.deps);
    expect(h.recognize).toHaveBeenCalledTimes(10);
    expect(report.summary?.counts.ERROR).toBe(1);
    expect(report.exitCode).toBe(1);
  });

  it('a photo whose reading cannot be resolved is a call error, not a crash', async () => {
    const h = harness({ labels: TEN.slice(0, 2) });
    h.getResolver.mockImplementation(async () => async () => {
      throw new Error('database down');
    });
    const report = await runEval(parseEvalArgs([...LABELS_ARGS, '--confirm-spend']), KEYED, h.deps);
    expect(report.summary?.counts.ERROR).toBe(2);
  });

  it('stops at the spend cap using the measured cost and exits 3', async () => {
    const h = harness({ labels: TEN, perFrameUsd: 0.0001 });
    const report = await runEval(parseEvalArgs([...LABELS_ARGS, '--confirm-spend', '--max-usd', '0.003']), KEYED, h.deps);
    expect(report.exitCode).toBe(3);
    expect(h.recognize).toHaveBeenCalledTimes(2);
    expect(report.cases).toHaveLength(2);
    expect(h.logs.join('\n')).toContain('Stopped: measured spend');
  });

  it('a saved run is scored offline with no gate, no resolver and no recognizer', async () => {
    const live = harness({ labels: TEN });
    await runEval(parseEvalArgs([...LABELS_ARGS, '--confirm-spend', '--out', 'run.json']), KEYED, live.deps);
    const saved = live.written.get('run.json') as string;

    const offline = harness({ labels: TEN, extraFiles: { 'run.json': saved } });
    const report = await runEval(parseEvalArgs(['--results', 'run.json']), {}, offline.deps);
    expect(report.exitCode).toBe(0);
    expect(report.summary?.counts.CORRECT_READY).toBe(10);
    expect(offline.getResolver).not.toHaveBeenCalled();
    expect(offline.getRecognizer).not.toHaveBeenCalled();
    expect(offline.logs.join('\n')).not.toContain('Refusing');
  });

  it('a saved run that is not valid is refused', async () => {
    for (const text of ['{oops', '{}', '{"cases": []}', '{"cases": [{"label": {"file": "a.jpg"}}]}']) {
      const h = harness({ labels: TEN, extraFiles: { 'run.json': text } });
      expect((await runEval(parseEvalArgs(['--results', 'run.json']), {}, h.deps)).exitCode).toBe(2);
    }
  });
});

describe('AT-22 the command line wrapper', () => {
  const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'cardScanEval.ts');
  const script = fs.readFileSync(scriptPath, 'utf8');

  it('only starts when run directly, never when imported', () => {
    expect(script).toContain('require.main === module');
    const afterGuard = script.slice(script.indexOf('require.main === module'));
    expect(afterGuard.match(/main\(process\.argv/g)).toHaveLength(1);
    expect(script.slice(0, script.indexOf('require.main === module'))).not.toMatch(/^main\(/m);
  });

  it('statically imports nothing that can reach the network or the database', () => {
    const staticImports = [...script.matchAll(/^import\s+[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    expect(staticImports.sort()).toEqual(
      ['fs', '../src/services/cardScan/evalScoring', '../src/services/cardScan/evalScoring', '../src/services/cardScan/config', '../src/services/cardScan/recognition/scanCostGuard'].sort()
    );
  });

  it('creates the recognizer and loads the catalog only inside the injected steps', () => {
    expect(script).toMatch(/getRecognizer:\s*async[\s\S]*await import\('\.\.\/src\/services\/cardScan\/recognition\/registry'\)/);
    expect(script).toMatch(/getResolver:\s*async[\s\S]*await import\('\.\.\/src\/services\/cardCatalog\/cardCatalogLookup'\)/);
  });

  it('delegates the gate to runEval and has no second path that skips it', () => {
    expect((script.match(/runEval\(/g) ?? []).length).toBe(1);
    expect(script).not.toMatch(/checkEvalRunGate|args\.confirmSpend/);
    expect((script.match(/getRecognitionProvider\(/g) ?? []).length).toBe(1);
  });

  it('follows the dash rule', () => {
    expect(script).not.toMatch(DASH_RE);
    expect(fs.readFileSync(path.join(__dirname, '..', 'services', 'cardScan', 'evalScoring.ts'), 'utf8')).not.toMatch(DASH_RE);
  });

  it('the scoring module imports no recognizer and no network client', () => {
    const text = fs.readFileSync(path.join(__dirname, '..', 'services', 'cardScan', 'evalScoring.ts'), 'utf8');
    const specs = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(specs.filter((s) => /recognition|axios|aiCostTracker|cloudAI|prisma|redis/.test(s))).toEqual([]);
  });
});
