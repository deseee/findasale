/**
 * Accuracy scoring and run control for the card photo recognizer (ADR-138 decision D4, batch B4).
 *
 * Pure apart from the injected `deps` of runEval: no database, no network, no recognizer import. The recognizer, the
 * catalog resolver and the file system are all passed in, so a test runs the whole harness with fakes and nothing in
 * this file can spend money by itself. The thin command line wrapper is packages/backend/scripts/cardScanEval.ts.
 *
 * A run compares what the recognizer read from a hand-labelled photo with the label, after the reading was resolved
 * against the card catalog exactly the way a live scan resolves it. Each photo lands in one bucket:
 *   CORRECT_READY       the printing was pre-selected (EXACT) and it is the labelled printing
 *   CORRECT_AFTER_PICK  not pre-selected, but the labelled printing is among the candidates, so one tap fixes it
 *   WRONG_READY         a printing was pre-selected and it is NOT the labelled one (the safety metric)
 *   UNMATCHED           nothing usable: no match, or the labelled printing is not among the candidates
 *   NO_CARD             the recognizer reported no card or an unreadable one
 *   ERROR               the call itself failed (network, rate limit, disabled); not counted as scored
 *
 * Pass bar (proposed in D4, not backed by data): at least 90 percent of the modern nonfoil cards correct (READY or
 * after a pick) and at most 1 percent WRONG_READY across all scored cards, with no call errors.
 */
import path from 'path';
import { CARD_FINISHES, CARD_GAMES, CARD_LANGUAGES, canonicalizeVocabValue } from '../../constants/cardVocabulary';
import type { CardFinish, CardGame, CardLanguage } from '../../constants/cardVocabulary';
import { collectorNumbersMatch } from '../cardCatalog/normalize';
import { getScanConfig } from './config';
import type { EnvLike, ScanMode } from './config';
import { namesAgree } from './nameAgreement';
import type { CandidateDto, CardObservation, ObservationResolution } from './types';

// ---------------------------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------------------------

export type EvalEra = 'MODERN' | 'OLD';

export interface EvalLabel {
  /** Image file name, relative to the images directory. */
  file: string;
  game: CardGame;
  name: string;
  setCode: string;
  collectorNumber: string;
  finish?: CardFinish;
  language?: CardLanguage;
  /** MODERN (current card frame) or OLD. Only MODERN plus NONFOIL cards count toward the pass bar. */
  era?: EvalEra;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Validates the hand-labelled JSON: an array, or an object with a "labels" array. */
export function parseEvalLabels(raw: unknown): { labels: EvalLabel[]; errors: string[] } {
  const errors: string[] = [];
  const holder = raw as { labels?: unknown } | null;
  const list: unknown = Array.isArray(raw) ? raw : holder && typeof holder === 'object' && Array.isArray(holder.labels) ? holder.labels : null;
  if (!Array.isArray(list)) {
    return { labels: [], errors: ['The labels file must be a JSON array, or an object with a "labels" array.'] };
  }
  if (list.length === 0) return { labels: [], errors: ['The labels file has no labels.'] };

  const labels: EvalLabel[] = [];
  const seen = new Set<string>();
  list.forEach((item, index) => {
    const where = `labels[${index}]`;
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${where}: must be an object.`);
      return;
    }
    const r = item as Record<string, unknown>;
    const file = text(r.file);
    const name = text(r.name);
    const setCode = text(r.setCode);
    const collectorNumber = text(r.collectorNumber ?? '') || (typeof r.collectorNumber === 'number' ? String(r.collectorNumber) : '');
    const errorsBefore = errors.length;
    const problem = (message: string) => {
      errors.push(`${where}: ${message}`);
    };
    if (file === '') problem('file is required.');
    else if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..')) problem('file must be a plain relative path.');
    else if (seen.has(file)) problem(`file "${file}" is listed twice.`);
    if (name === '') problem('name is required.');
    if (setCode === '') problem('setCode is required.');
    if (collectorNumber === '') problem('collectorNumber is required.');

    let game: CardGame = 'MTG';
    if (r.game !== undefined && r.game !== null && r.game !== '') {
      const g = canonicalizeVocabValue(CARD_GAMES, r.game);
      if (g) game = g;
      else problem(`game "${String(r.game)}" is not a known game.`);
    }
    let finish: CardFinish | undefined;
    if (r.finish !== undefined && r.finish !== null && r.finish !== '') {
      finish = canonicalizeVocabValue(CARD_FINISHES, r.finish);
      if (!finish) problem(`finish "${String(r.finish)}" is not a known finish.`);
    }
    let language: CardLanguage | undefined;
    if (r.language !== undefined && r.language !== null && r.language !== '') {
      language = canonicalizeVocabValue(CARD_LANGUAGES, r.language);
      if (!language) problem(`language "${String(r.language)}" is not a known language.`);
    }
    let era: EvalEra | undefined;
    if (r.era !== undefined && r.era !== null && r.era !== '') {
      const e = text(r.era).toUpperCase();
      if (e === 'MODERN' || e === 'OLD') era = e;
      else problem('era must be MODERN or OLD.');
    }
    if (errors.length > errorsBefore) return;
    seen.add(file);
    const label: EvalLabel = { file, game, name, setCode, collectorNumber };
    if (finish) label.finish = finish;
    if (language) label.language = language;
    if (era) label.era = era;
    labels.push(label);
  });
  return { labels, errors };
}

// ---------------------------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------------------------

export const EVAL_BUCKETS = ['CORRECT_READY', 'CORRECT_AFTER_PICK', 'WRONG_READY', 'UNMATCHED', 'NO_CARD', 'ERROR'] as const;
export type EvalBucket = (typeof EVAL_BUCKETS)[number];

/** One recorded recognition of one labelled photo. A live run produces these; a saved file can be re-scored offline. */
export interface EvalCaseInput {
  label: EvalLabel;
  /** Set when the recognizer returned a failure. NO_CARD and UNREADABLE are real answers; the rest are call errors. */
  failureCode: string | null;
  observation: CardObservation | null;
  resolution: ObservationResolution | null;
  costUsd: number;
}

export interface EvalFieldMatches {
  game: boolean;
  name: boolean;
  setCode: boolean;
  collectorNumber: boolean;
  /** Null when the label has no finish. */
  finish: boolean | null;
}

export interface EvalCaseResult {
  file: string;
  bucket: EvalBucket;
  /** Era MODERN and finish NONFOIL: the cohort the pass bar is measured on. */
  modernNonfoil: boolean;
  fields: EvalFieldMatches | null;
  finishKind: 'FOIL' | 'NONFOIL' | null;
  /** For a foil label: the recognizer reported that finish. For a nonfoil label: it did not report a foil like finish. */
  finishCorrect: boolean | null;
  costUsd: number;
}

function sameSet(a: unknown, b: unknown): boolean {
  return text(a).toLowerCase() !== '' && text(a).toLowerCase() === text(b).toLowerCase();
}

/** True when the candidate printing is the labelled one: same set code and collector number. */
export function candidateMatchesLabel(candidate: Pick<CandidateDto, 'setCode' | 'collectorNumber'>, label: EvalLabel): boolean {
  return sameSet(candidate.setCode, label.setCode) && collectorNumbersMatch(candidate.collectorNumber, label.collectorNumber);
}

function fieldMatches(obs: CardObservation, label: EvalLabel): EvalFieldMatches {
  const readName = obs.cardName;
  return {
    game: obs.game === label.game,
    name: namesAgree(readName, label.name) || namesAgree(label.name, readName),
    setCode: sameSet(obs.setCode, label.setCode),
    collectorNumber: collectorNumbersMatch(obs.collectorNumber, label.collectorNumber),
    finish: label.finish ? finishCorrectFor(obs, label) : null,
  };
}

function finishCorrectFor(obs: CardObservation, label: EvalLabel): boolean {
  if (label.finish === 'NONFOIL') return obs.finish === undefined || obs.finish === 'NONFOIL';
  return obs.finish === label.finish;
}

export function scoreCase(input: EvalCaseInput): EvalCaseResult {
  const label = input.label;
  const costUsd = typeof input.costUsd === 'number' && Number.isFinite(input.costUsd) ? input.costUsd : 0;
  const base: Omit<EvalCaseResult, 'bucket'> = {
    file: label.file,
    modernNonfoil: label.era === 'MODERN' && label.finish === 'NONFOIL',
    fields: null,
    finishKind: null,
    finishCorrect: null,
    costUsd,
  };

  if (input.failureCode) {
    const real = input.failureCode === 'NO_CARD' || input.failureCode === 'UNREADABLE';
    return { ...base, bucket: real ? 'NO_CARD' : 'ERROR' };
  }
  const obs = input.observation;
  const res = input.resolution;
  if (!obs || !res) return { ...base, bucket: 'ERROR' };

  const fields = fieldMatches(obs, label);
  const finishKind: 'FOIL' | 'NONFOIL' | null = label.finish ? (label.finish === 'NONFOIL' ? 'NONFOIL' : 'FOIL') : null;
  const finishCorrect: boolean | null = label.finish ? finishCorrectFor(obs, label) : null;
  const scored: Omit<EvalCaseResult, 'bucket'> = { ...base, fields, finishKind, finishCorrect };

  if (res.status === 'EXACT' && res.printingId) {
    // A pre-selected printing that cannot be checked against the label is counted as wrong: the safety metric fails closed.
    const pick = res.candidates.find((c) => c.printingId === res.printingId);
    return { ...scored, bucket: pick && candidateMatchesLabel(pick, label) ? 'CORRECT_READY' : 'WRONG_READY' };
  }
  if (res.status === 'AMBIGUOUS') {
    return { ...scored, bucket: res.candidates.some((c) => candidateMatchesLabel(c, label)) ? 'CORRECT_AFTER_PICK' : 'UNMATCHED' };
  }
  return { ...scored, bucket: 'UNMATCHED' };
}

// ---------------------------------------------------------------------------------------------
// Summary and pass bar
// ---------------------------------------------------------------------------------------------

export interface EvalPassBar {
  /** Minimum percent of modern nonfoil cards that are CORRECT_READY or CORRECT_AFTER_PICK. */
  modernNonfoilMinPct: number;
  /** Maximum percent of scored cards that are WRONG_READY. */
  wrongReadyMaxPct: number;
}

export const DEFAULT_PASS_BAR: EvalPassBar = { modernNonfoilMinPct: 90, wrongReadyMaxPct: 1 };

export interface EvalRate {
  matched: number;
  compared: number;
  pct: number;
}

export interface EvalSummary {
  total: number;
  /** Everything except ERROR. */
  scored: number;
  counts: Record<EvalBucket, number>;
  pct: { correctReady: number; correctAfterPick: number; wrongReady: number; unmatched: number; noCard: number };
  fields: { game: EvalRate; name: EvalRate; setCode: EvalRate; collectorNumber: EvalRate; finish: EvalRate };
  finish: { foilLabelled: number; foilDetected: number; nonfoilLabelled: number; falseFoil: number; foilDetectionPct: number; falseFoilPct: number };
  modernNonfoil: { total: number; correct: number; pct: number; wrongReady: number };
  totalCostUsd: number;
  passBar: EvalPassBar;
  verdict: { passed: boolean; reasons: string[] };
}

/** Percent with one decimal; zero when there is nothing to divide by. */
function pct1(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;
}

function rate(matched: number, compared: number): EvalRate {
  return { matched, compared, pct: pct1(matched, compared) };
}

export function summarize(results: readonly EvalCaseResult[], passBar: EvalPassBar = DEFAULT_PASS_BAR): EvalSummary {
  const counts = { CORRECT_READY: 0, CORRECT_AFTER_PICK: 0, WRONG_READY: 0, UNMATCHED: 0, NO_CARD: 0, ERROR: 0 } as Record<EvalBucket, number>;
  const tally = { game: [0, 0], name: [0, 0], setCode: [0, 0], collectorNumber: [0, 0], finish: [0, 0] };
  let foilLabelled = 0;
  let foilDetected = 0;
  let nonfoilLabelled = 0;
  let falseFoil = 0;
  let modernTotal = 0;
  let modernCorrect = 0;
  let modernWrong = 0;
  let totalCostUsd = 0;

  for (const r of results) {
    counts[r.bucket] += 1;
    totalCostUsd += r.costUsd;
    if (r.modernNonfoil && r.bucket !== 'ERROR') {
      modernTotal += 1;
      if (r.bucket === 'CORRECT_READY' || r.bucket === 'CORRECT_AFTER_PICK') modernCorrect += 1;
      if (r.bucket === 'WRONG_READY') modernWrong += 1;
    }
    if (!r.fields) continue;
    (['game', 'name', 'setCode', 'collectorNumber'] as const).forEach((key) => {
      tally[key][1] += 1;
      if (r.fields && r.fields[key]) tally[key][0] += 1;
    });
    if (r.fields.finish !== null) {
      tally.finish[1] += 1;
      if (r.fields.finish) tally.finish[0] += 1;
    }
    if (r.finishKind === 'FOIL') {
      foilLabelled += 1;
      if (r.finishCorrect) foilDetected += 1;
    } else if (r.finishKind === 'NONFOIL') {
      nonfoilLabelled += 1;
      if (!r.finishCorrect) falseFoil += 1;
    }
  }

  const scored = results.length - counts.ERROR;
  const verdictReasons: string[] = [];
  if (scored === 0) verdictReasons.push('No photo was scored.');
  if (counts.ERROR > 0) verdictReasons.push(`${counts.ERROR} photo(s) ended in a call error; run again before judging.`);
  if (modernTotal === 0) verdictReasons.push('No modern nonfoil photo was scored, so the pass bar cannot be measured.');
  else if (modernCorrect * 100 < passBar.modernNonfoilMinPct * modernTotal) {
    verdictReasons.push(`Modern nonfoil correct is ${pct1(modernCorrect, modernTotal)} percent; the bar is ${passBar.modernNonfoilMinPct} percent.`);
  }
  if (scored > 0 && counts.WRONG_READY * 100 > passBar.wrongReadyMaxPct * scored) {
    verdictReasons.push(`WRONG_READY is ${pct1(counts.WRONG_READY, scored)} percent; the limit is ${passBar.wrongReadyMaxPct} percent.`);
  }

  return {
    total: results.length,
    scored,
    counts,
    pct: {
      correctReady: pct1(counts.CORRECT_READY, scored),
      correctAfterPick: pct1(counts.CORRECT_AFTER_PICK, scored),
      wrongReady: pct1(counts.WRONG_READY, scored),
      unmatched: pct1(counts.UNMATCHED, scored),
      noCard: pct1(counts.NO_CARD, scored),
    },
    fields: {
      game: rate(tally.game[0], tally.game[1]),
      name: rate(tally.name[0], tally.name[1]),
      setCode: rate(tally.setCode[0], tally.setCode[1]),
      collectorNumber: rate(tally.collectorNumber[0], tally.collectorNumber[1]),
      finish: rate(tally.finish[0], tally.finish[1]),
    },
    finish: {
      foilLabelled,
      foilDetected,
      nonfoilLabelled,
      falseFoil,
      foilDetectionPct: pct1(foilDetected, foilLabelled),
      falseFoilPct: pct1(falseFoil, nonfoilLabelled),
    },
    modernNonfoil: { total: modernTotal, correct: modernCorrect, pct: pct1(modernCorrect, modernTotal), wrongReady: modernWrong },
    totalCostUsd: Math.round(totalCostUsd * 10000) / 10000,
    passBar,
    verdict: { passed: verdictReasons.length === 0, reasons: verdictReasons },
  };
}

export function formatReport(summary: EvalSummary, results: readonly EvalCaseResult[] = []): string[] {
  const s = summary;
  const lines: string[] = [];
  lines.push(`Photos: ${s.total} (scored ${s.scored}, call errors ${s.counts.ERROR})`);
  lines.push(`  CORRECT_READY       ${s.counts.CORRECT_READY}  (${s.pct.correctReady} percent)`);
  lines.push(`  CORRECT_AFTER_PICK  ${s.counts.CORRECT_AFTER_PICK}  (${s.pct.correctAfterPick} percent)`);
  lines.push(`  WRONG_READY         ${s.counts.WRONG_READY}  (${s.pct.wrongReady} percent)`);
  lines.push(`  UNMATCHED           ${s.counts.UNMATCHED}  (${s.pct.unmatched} percent)`);
  lines.push(`  NO_CARD             ${s.counts.NO_CARD}  (${s.pct.noCard} percent)`);
  lines.push(`Fields read right: game ${s.fields.game.pct}, name ${s.fields.name.pct}, set ${s.fields.setCode.pct}, number ${s.fields.collectorNumber.pct}, finish ${s.fields.finish.pct} (percent of compared)`);
  lines.push(
    `Finish: foil labelled ${s.finish.foilLabelled}, detected ${s.finish.foilDetected} (${s.finish.foilDetectionPct} percent); nonfoil labelled ${s.finish.nonfoilLabelled}, read as foil ${s.finish.falseFoil} (${s.finish.falseFoilPct} percent)`
  );
  lines.push(`Modern nonfoil: ${s.modernNonfoil.correct} of ${s.modernNonfoil.total} correct (${s.modernNonfoil.pct} percent), wrong ready ${s.modernNonfoil.wrongReady}`);
  lines.push(`Measured spend: $${s.totalCostUsd.toFixed(4)}`);
  const wrong = results.filter((r) => r.bucket === 'WRONG_READY').map((r) => r.file);
  if (wrong.length > 0) lines.push(`WRONG_READY photos: ${wrong.join(', ')}`);
  lines.push(`Pass bar: modern nonfoil at least ${s.passBar.modernNonfoilMinPct} percent correct, WRONG_READY at most ${s.passBar.wrongReadyMaxPct} percent, no call errors.`);
  lines.push(s.verdict.passed ? 'Verdict: PASS' : `Verdict: NOT PASSED. ${s.verdict.reasons.join(' ')}`);
  return lines;
}

export function estimateEvalSpend(frames: number, perFrameUsd: number): { frames: number; perFrameUsd: number; totalUsd: number } {
  const total = Math.max(0, frames) * Math.max(0, perFrameUsd);
  return { frames, perFrameUsd, totalUsd: Math.round(total * 10000) / 10000 };
}

// ---------------------------------------------------------------------------------------------
// Run gate and command line
// ---------------------------------------------------------------------------------------------

/**
 * A run that can spend money needs ALL of: the --confirm-spend flag, CARD_SCAN_EVAL_APPROVED=yes, and the API key of
 * every service the chosen mode calls. Anything less is refused before any network capable object is created.
 */
export function checkEvalRunGate(input: { confirmSpend: boolean; mode: ScanMode }, env: EnvLike): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!input.confirmSpend) reasons.push('The --confirm-spend flag was not given.');
  if ((env.CARD_SCAN_EVAL_APPROVED ?? '').trim().toLowerCase() !== 'yes') reasons.push('CARD_SCAN_EVAL_APPROVED is not set to yes.');
  if ((env.ANTHROPIC_API_KEY ?? '').trim() === '') reasons.push('ANTHROPIC_API_KEY is not set.');
  if (input.mode === 'OCR_PLUS_HAIKU' && (env.GOOGLE_VISION_API_KEY ?? '').trim() === '') reasons.push('GOOGLE_VISION_API_KEY is not set (needed for OCR_PLUS_HAIKU).');
  return { allowed: reasons.length === 0, reasons };
}

export const DEFAULT_MAX_EVAL_USD = 2;

export interface EvalCliArgs {
  labelsPath: string | null;
  imagesDir: string | null;
  resultsPath: string | null;
  outPath: string | null;
  confirmSpend: boolean;
  help: boolean;
  mode: ScanMode | null;
  maxUsd: number;
  errors: string[];
}

export const EVAL_USAGE: string[] = [
  'Card scan accuracy harness. Nothing runs by itself.',
  '',
  'Score a saved run (no network, no spend):',
  '  tsx scripts/cardScanEval.ts --results saved-run.json [--out report.json]',
  '',
  'Read the photos with the recognizer (spends money):',
  '  CARD_SCAN_EVAL_APPROVED=yes tsx scripts/cardScanEval.ts --labels labels.json --images ./photos --confirm-spend',
  '    [--mode HAIKU_ONLY|OCR_PLUS_HAIKU] [--max-usd 2] [--out run.json]',
  '',
  'Without --confirm-spend and CARD_SCAN_EVAL_APPROVED=yes the harness prints the estimated spend and stops.',
  'A live run also needs ANTHROPIC_API_KEY, and GOOGLE_VISION_API_KEY for OCR_PLUS_HAIKU.',
];

export function parseEvalArgs(argv: readonly string[]): EvalCliArgs {
  const args: EvalCliArgs = {
    labelsPath: null,
    imagesDir: null,
    resultsPath: null,
    outPath: null,
    confirmSpend: false,
    help: false,
    mode: null,
    maxUsd: DEFAULT_MAX_EVAL_USD,
    errors: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    let flag = token;
    let inline: string | null = null;
    const eq = token.indexOf('=');
    if (token.startsWith('--') && eq > 0) {
      flag = token.slice(0, eq);
      inline = token.slice(eq + 1);
    }
    const value = (): string | null => {
      if (inline !== null) return inline;
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args.errors.push(`${flag} needs a value.`);
        return null;
      }
      i += 1;
      return next;
    };
    switch (flag) {
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--confirm-spend':
        args.confirmSpend = true;
        break;
      case '--labels':
        args.labelsPath = value();
        break;
      case '--images':
        args.imagesDir = value();
        break;
      case '--results':
        args.resultsPath = value();
        break;
      case '--out':
        args.outPath = value();
        break;
      case '--mode': {
        const v = value();
        if (v !== null) {
          const upper = v.trim().toUpperCase();
          if (upper === 'HAIKU_ONLY' || upper === 'OCR_PLUS_HAIKU') args.mode = upper;
          else args.errors.push('--mode must be HAIKU_ONLY or OCR_PLUS_HAIKU.');
        }
        break;
      }
      case '--max-usd': {
        const v = value();
        if (v !== null) {
          const n = Number(v);
          if (Number.isFinite(n) && n > 0) args.maxUsd = n;
          else args.errors.push('--max-usd must be a positive number.');
        }
        break;
      }
      default:
        args.errors.push(`Unknown argument: ${token}`);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------------------------

export type EvalRecognizeOutcome =
  | { ok: true; observation: CardObservation; usage: { costUsd: number } }
  | { ok: false; code: string; usage?: { costUsd: number } };

/** The part of a recognition provider the harness needs (structurally the same as CardRecognitionProvider). */
export interface EvalRecognizer {
  isAvailable(env: EnvLike): boolean;
  recognize(frame: { buffer: Buffer; mimeType: string }, hint: { game?: CardGame }): Promise<EvalRecognizeOutcome>;
}

export interface EvalRunDeps {
  readText(filePath: string): string;
  fileExists(filePath: string): boolean;
  readImage(filePath: string): Buffer;
  writeText(filePath: string, content: string): void;
  log(line: string): void;
  /** Estimated dollars per photo for a mode (shown before any spend). */
  estimatePerFrameUsd(mode: ScanMode): number;
  /** Loads the catalog and returns the resolver. Called only after the run gate has passed. */
  getResolver(env: EnvLike): Promise<(observation: CardObservation) => Promise<ObservationResolution>>;
  /** Builds the recognizer (the only step that creates anything network capable). Called only after the gate and the resolver. */
  getRecognizer(env: EnvLike): Promise<EvalRecognizer>;
}

export interface EvalRunReport {
  /** 0 passed, 1 finished below the bar, 2 refused or bad input (nothing was spent), 3 stopped at the spend cap. */
  exitCode: 0 | 1 | 2 | 3;
  summary: EvalSummary | null;
  results: EvalCaseResult[];
  cases: EvalCaseInput[];
}

const IMAGE_TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function mimeFor(file: string): string | null {
  return IMAGE_TYPES[path.extname(file).toLowerCase()] ?? null;
}

export async function runEval(args: EvalCliArgs, env: EnvLike, deps: EvalRunDeps): Promise<EvalRunReport> {
  const refuse = (...lines: string[]): EvalRunReport => {
    lines.forEach((line) => deps.log(line));
    return { exitCode: 2, summary: null, results: [], cases: [] };
  };

  if (args.help) {
    EVAL_USAGE.forEach((line) => deps.log(line));
    return { exitCode: 0, summary: null, results: [], cases: [] };
  }
  if (args.errors.length > 0) return refuse(...args.errors, '', ...EVAL_USAGE);

  const finish = (cases: EvalCaseInput[], aborted: boolean): EvalRunReport => {
    const results = cases.map(scoreCase);
    const summary = summarize(results);
    formatReport(summary, results).forEach((line) => deps.log(line));
    if (args.outPath) deps.writeText(args.outPath, JSON.stringify({ summary, cases }, null, 2));
    const exitCode = aborted ? 3 : summary.verdict.passed ? 0 : 1;
    return { exitCode, summary, results, cases };
  };

  // Offline: score a saved run. No gate is needed because nothing here can spend money.
  if (args.resultsPath) {
    let saved: unknown;
    try {
      saved = JSON.parse(deps.readText(args.resultsPath));
    } catch {
      return refuse('The saved run could not be read as JSON.');
    }
    const holder = saved as { cases?: unknown } | null;
    const rawCases: unknown = Array.isArray(saved) ? saved : holder && Array.isArray(holder.cases) ? holder.cases : null;
    if (!Array.isArray(rawCases) || rawCases.length === 0) return refuse('The saved run must hold a "cases" array with at least one case.');
    const parsed = parseEvalLabels(rawCases.map((c) => (c as { label?: unknown } | null)?.label));
    if (parsed.errors.length > 0) return refuse(...parsed.errors);
    const cases: EvalCaseInput[] = rawCases.map((c, index) => {
      const r = c as Partial<EvalCaseInput>;
      return {
        label: parsed.labels[index],
        failureCode: typeof r.failureCode === 'string' ? r.failureCode : null,
        observation: r.observation ?? null,
        resolution: r.resolution ?? null,
        costUsd: typeof r.costUsd === 'number' ? r.costUsd : 0,
      };
    });
    return finish(cases, false);
  }

  // Live run.
  if (!args.labelsPath || !args.imagesDir) return refuse('A live run needs --labels and --images (or use --results to score a saved run).', '', ...EVAL_USAGE);
  let rawLabels: unknown;
  try {
    rawLabels = JSON.parse(deps.readText(args.labelsPath));
  } catch {
    return refuse('The labels file could not be read as JSON.');
  }
  const parsed = parseEvalLabels(rawLabels);
  if (parsed.errors.length > 0) return refuse(...parsed.errors);
  const labels = parsed.labels;
  const imagesDir = args.imagesDir;

  const unusable = labels.filter((l) => mimeFor(l.file) === null || !deps.fileExists(path.join(imagesDir, l.file)));
  if (unusable.length > 0) {
    const names = unusable.slice(0, 10).map((l) => l.file).join(', ');
    return refuse(`${unusable.length} labelled photo(s) are missing or not .jpg, .jpeg, .png or .webp: ${names}`);
  }

  const mode: ScanMode = args.mode ?? getScanConfig(env).mode;
  const estimate = estimateEvalSpend(labels.length, deps.estimatePerFrameUsd(mode));
  deps.log(`Mode ${mode}: ${estimate.frames} photos at about $${estimate.perFrameUsd} each, estimated spend $${estimate.totalUsd.toFixed(4)} (cap $${args.maxUsd}).`);

  const gate = checkEvalRunGate({ confirmSpend: args.confirmSpend, mode }, env);
  if (!gate.allowed) {
    return refuse('Refusing to run. Missing:', ...gate.reasons.map((r) => `  ${r}`), 'No network call was made and no money was spent.');
  }
  if (estimate.totalUsd > args.maxUsd) {
    return refuse(`The estimate $${estimate.totalUsd.toFixed(4)} is above the cap $${args.maxUsd}. Raise --max-usd or label fewer photos. Nothing was spent.`);
  }

  const runEnv: EnvLike = { ...env, CARD_SCAN_ENABLED: 'true', CARD_SCAN_MODE: mode };
  let resolve: (observation: CardObservation) => Promise<ObservationResolution>;
  try {
    resolve = await deps.getResolver(runEnv);
  } catch (err) {
    return refuse(`The card catalog could not be loaded (${err instanceof Error ? err.message : 'unknown error'}). Nothing was spent.`);
  }
  const recognizer = await deps.getRecognizer(runEnv);
  if (!recognizer.isAvailable(runEnv)) return refuse('The recognizer is not available with this environment. Nothing was spent.');

  const cases: EvalCaseInput[] = [];
  let spent = 0;
  let aborted = false;
  for (const label of labels) {
    if (spent >= args.maxUsd) {
      aborted = true;
      deps.log(`Stopped: measured spend $${spent.toFixed(4)} reached the cap $${args.maxUsd}.`);
      break;
    }
    const mimeType = mimeFor(label.file) as string;
    // The recognizer is not told the labelled game: the run is blind.
    let outcome: EvalRecognizeOutcome;
    try {
      outcome = await recognizer.recognize({ buffer: deps.readImage(path.join(imagesDir, label.file)), mimeType }, {});
    } catch {
      outcome = { ok: false, code: 'PROVIDER_ERROR' };
    }
    if (!outcome.ok) {
      const costUsd = outcome.usage?.costUsd ?? 0;
      spent += costUsd;
      cases.push({ label, failureCode: outcome.code, observation: null, resolution: null, costUsd });
      continue;
    }
    spent += outcome.usage.costUsd;
    try {
      cases.push({ label, failureCode: null, observation: outcome.observation, resolution: await resolve(outcome.observation), costUsd: outcome.usage.costUsd });
    } catch {
      cases.push({ label, failureCode: 'RESOLVE_ERROR', observation: outcome.observation, resolution: null, costUsd: outcome.usage.costUsd });
    }
  }
  return finish(cases, aborted);
}
