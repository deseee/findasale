/**
 * Card scan copy rules and import isolation (ADR-138 acceptance AT-18, core part, and AT-26).
 *   - Copy lint: no em dash or en dash, no standalone "AI", no "estate sale", no placeholder text in any user-facing string.
 *   - The scan core (everything under services/cardScan except the recognition directory) imports no recognizer, no
 *     HTTP client and no AI service, directly or through the modules it imports, and the intake never imports the scan.
 */
import fs from 'fs';
import path from 'path';
import { allScanMessages } from '../services/cardScan/messages';
import { getScanConfig } from '../services/cardScan/config';
import { resolveObservations } from '../services/cardScan/resolveObservation';
import { computeReadiness } from '../services/cardScan/readiness';
import { buildStreamedRecords, computeManifestHash, selectReadyEntries } from '../services/cardScan/entryRecords';
import { decideEarlyDuplicate } from '../services/cardScan/duplicateRules';
import { MOX, READY_STATE, makeCatalogResolver, observation, printingMap, scanEntry } from './__fixtures__/cardScanFakes';

const mockAiCalls: string[] = [];
const mockRecorder = () =>
  new Proxy(
    {},
    {
      get: (_target, name) => {
        if (name === '__esModule') return true;
        if (name === 'then') return undefined;
        return (...args: unknown[]) => {
          mockAiCalls.push(String(name));
          return args.length >= 0 ? undefined : undefined;
        };
      },
    }
  );

jest.mock('../services/cloudAIService', () => mockRecorder(), { virtual: true });
jest.mock('../services/imageMatchService', () => mockRecorder(), { virtual: true });
jest.mock('../services/ebayImageSearchService', () => mockRecorder(), { virtual: true });
jest.mock('../lib/aiCostTracker', () => mockRecorder(), { virtual: true });
jest.mock('@anthropic-ai/sdk', () => mockRecorder(), { virtual: true });
jest.mock('@google-cloud/vision', () => mockRecorder(), { virtual: true });
jest.mock('axios', () => mockRecorder(), { virtual: true });

/** Em dash and en dash, written as escapes so this file itself contains neither character. */
const DASH_RE = /[\u2014\u2013]/;

const SRC = path.join(__dirname, '..');
const SCAN_DIR = path.join(SRC, 'services', 'cardScan');
const INTAKE_DIR = path.join(SRC, 'services', 'cardIntake');

function listTs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...listTs(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** The recognition directory is the only place in the scan graph allowed to talk to an AI service or an HTTP client. */
const isRecognition = (file: string) => path.relative(SCAN_DIR, file).split(path.sep)[0] === 'recognition';
const CORE_FILES = listTs(SCAN_DIR).filter((f) => !isRecognition(f));

describe('copy lint (AT-26)', () => {
  const messages = allScanMessages();

  it('has a plausible number of messages', () => {
    expect(messages.length).toBeGreaterThan(40);
    for (const m of messages) expect(typeof m).toBe('string');
  });

  it.each(messages.map((m) => [m]))('"%s" follows the copy rules', (m) => {
    expect(m.trim().length).toBeGreaterThan(0);
    expect(m).not.toMatch(DASH_RE);
    expect(m).not.toMatch(/\bAI\b/);
    expect(m).not.toMatch(/estate sale/i);
    expect(m).not.toMatch(/lorem|todo|tbd|xxx|placeholder|coming soon/i);
    expect(m).not.toMatch(/\{\{|\}\}|\$\{/);
    expect(m).not.toMatch(/\s{2,}/);
    expect(m).toBe(m.trim());
  });

  it('no scan core source file, nor the planner, contains an em dash, an en dash or the forbidden words', () => {
    const files = [...CORE_FILES, path.join(INTAKE_DIR, 'planner.ts')];
    expect(CORE_FILES.length).toBeGreaterThanOrEqual(8);
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      const rel = path.relative(SRC, file);
      expect({ file: rel, dash: DASH_RE.test(text) }).toEqual({ file: rel, dash: false });
      expect({ file: rel, ai: /\bAI\b/.test(text) }).toEqual({ file: rel, ai: false });
      expect({ file: rel, estate: /estate sale/i.test(text) }).toEqual({ file: rel, estate: false });
    }
  });

  it('the test and fixture files of this batch follow the same rule', () => {
    const files = [
      'cardScanResolve.test.ts',
      'cardScanReadiness.test.ts',
      'cardScanDuplicates.test.ts',
      'cardScanEntryRecords.test.ts',
      'cardScanIsolation.test.ts',
      'cardIntakePlanRecords.test.ts',
      path.join('__fixtures__', 'cardScanFakes.ts'),
    ].map((n) => path.join(__dirname, n));
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      const rel = path.relative(SRC, file);
      expect({ file: rel, dash: DASH_RE.test(text) }).toEqual({ file: rel, dash: false });
    }
  });
});

describe('import isolation (AT-18, core part)', () => {
  const BANNED = [
    'cloudAIService',
    'imageMatchService',
    'ebayImageSearchService',
    'aiCostTracker',
    '@anthropic-ai/sdk',
    '@google-cloud/vision',
    'axios',
    'openai',
    'safeFetch',
    'node-fetch',
  ];
  /** Shared infrastructure the scan uses but does not own; the graph is not walked into these. */
  const BOUNDARY = ['middleware/auth', 'lib/prisma'];

  function importsOf(text: string): string[] {
    const out: string[] = [];
    const re = /(?:from\s+|require\(\s*|import\(\s*)['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) out.push(m[1]);
    return out;
  }
  function resolveLocal(from: string, spec: string): string | null {
    const base = path.resolve(path.dirname(from), spec);
    for (const cand of [`${base}.ts`, path.join(base, 'index.ts')]) if (fs.existsSync(cand)) return cand;
    return null;
  }
  const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('the transitive import graph of the scan core contains no AI service, no HTTP client and no recognizer', () => {
    const seen = new Set<string>();
    const queue = [...CORE_FILES];
    const offenders: string[] = [];
    while (queue.length) {
      const file = queue.pop() as string;
      if (seen.has(file)) continue;
      seen.add(file);
      const text = stripComments(fs.readFileSync(file, 'utf8'));
      if (/trackAITokens|trackVisionCall|callHaiku|analyzeItemImage/.test(text)) offenders.push(`${path.relative(SRC, file)}: AI call`);
      for (const spec of importsOf(text)) {
        if (BANNED.some((b) => spec.includes(b))) offenders.push(`${path.relative(SRC, file)} imports ${spec}`);
        if (!spec.startsWith('.')) continue;
        const resolved = resolveLocal(file, spec);
        if (!resolved) continue;
        const rel = path.relative(SRC, resolved).split(path.sep).join('/');
        if (rel.startsWith('services/cardScan/recognition/')) {
          offenders.push(`${path.relative(SRC, file)} imports the recognition directory (${spec})`);
          continue;
        }
        if (BOUNDARY.some((b) => rel.startsWith(b))) continue;
        queue.push(resolved);
      }
    }
    expect(offenders).toEqual([]);
    expect(seen.size).toBeGreaterThan(15);
  });

  it('the scan core never uses fetch, http clients or child processes', () => {
    for (const file of CORE_FILES) {
      const text = stripComments(fs.readFileSync(file, 'utf8'));
      expect({ file: path.relative(SRC, file), uses: /\bfetch\(|require\(['"]https?['"]\)|from ['"]https?['"]|child_process/.test(text) }).toEqual({
        file: path.relative(SRC, file),
        uses: false,
      });
    }
  });

  it('nothing under the intake directory imports the scan', () => {
    for (const file of listTs(INTAKE_DIR)) {
      const text = stripComments(fs.readFileSync(file, 'utf8'));
      const offending = importsOf(text).filter((spec) => spec.includes('cardScan'));
      expect({ file: path.relative(SRC, file), offending }).toEqual({ file: path.relative(SRC, file), offending: [] });
    }
  });

  it('a pass through the scan core records zero calls on any AI related module', async () => {
    mockAiCalls.length = 0;
    const fake = makeCatalogResolver();
    const resolved = await resolveObservations(
      [observation({ cardName: 'Mox Pearl', setCode: 'lea', collectorNumber: '263' }), observation({ game: 'POKEMON', cardName: 'Pikachu' })],
      { catalog: READY_STATE, resolve: fake.resolve }
    );
    expect(resolved.map((r) => r.status)).toEqual(['EXACT', 'UNMATCHED']);

    const entry = scanEntry({ printingId: MOX.id, conditionCode: 'NM' });
    expect(computeReadiness(entry, { defaults: { defaultConditionCode: null, defaultFinish: null }, printing: MOX }).status).toBe('READY');
    expect(decideEarlyDuplicate({ clientEntryId: 'c', placementId: null, imageSha256: null }, [])).toEqual({ kind: 'NONE' });
    const sel = selectReadyEntries([entry], { defaultConditionCode: null, defaultFinish: null }, printingMap());
    expect(buildStreamedRecords(sel.ready)).toHaveLength(1);
    expect(computeManifestHash('s', 'ADD', sel.ready)).toMatch(/^[0-9a-f]{64}$/);
    expect(getScanConfig({}).enabled).toBe(false);
    expect(mockAiCalls).toEqual([]);
  });
});

describe('config', () => {
  it('defaults every switch off and every limit to the documented value', () => {
    const c = getScanConfig({});
    expect(c).toMatchObject({
      enabled: false,
      provider: 'haiku-card',
      mode: 'HAIKU_ONLY',
      dailyCap: 3000,
      monthlyCeilingUsd: 15,
      maxEntries: 2000,
      maxFrameBytes: 1536 * 1024,
      dupWindowMs: 3000,
      ingestEnabled: false,
      ingestMaxCards: 5,
    });
  });

  it('reads the environment it is given when called', () => {
    const c = getScanConfig({
      CARD_SCAN_ENABLED: 'TRUE',
      CARD_SCAN_PROVIDER: ' Scrydex ',
      CARD_SCAN_MODE: 'ocr_plus_haiku',
      CARD_SCAN_DAILY_CAP: '10',
      CARD_SCAN_MONTHLY_CEILING_USD: '2.5',
      CARD_SCAN_MAX_ENTRIES: '50',
      CARD_SCAN_MAX_FRAME_KB: '100',
      CARD_SCAN_DUP_WINDOW_MS: '500',
      CARD_SCAN_INGEST_ENABLED: '1',
      CARD_SCAN_INGEST_MAX_CARDS: '3',
    });
    expect(c).toEqual({
      enabled: true,
      provider: 'scrydex',
      mode: 'OCR_PLUS_HAIKU',
      dailyCap: 10,
      monthlyCeilingUsd: 2.5,
      maxEntries: 50,
      maxFrameBytes: 100 * 1024,
      dupWindowMs: 500,
      ingestEnabled: true,
      ingestMaxCards: 3,
    });
  });

  it('falls back to the defaults for values that are not positive numbers', () => {
    const c = getScanConfig({ CARD_SCAN_DAILY_CAP: '-5', CARD_SCAN_MONTHLY_CEILING_USD: 'abc', CARD_SCAN_MAX_ENTRIES: '0', CARD_SCAN_DUP_WINDOW_MS: '1.5', CARD_SCAN_MODE: 'nonsense' });
    expect(c).toMatchObject({ dailyCap: 3000, monthlyCeilingUsd: 15, maxEntries: 2000, dupWindowMs: 3000, mode: 'HAIKU_ONLY', enabled: false });
  });
});
