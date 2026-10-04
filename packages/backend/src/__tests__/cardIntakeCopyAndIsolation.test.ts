/**
 * Card intake copy rules and service isolation (ADR-134 #642, batch B4).
 *   - Copy lint: no em dash or en dash, no word AI, no estate sale, no placeholder text in any user-facing string.
 *   - Acceptance 14: intake never calls the Vision or Haiku services. Asserted twice: every AI related module is
 *     replaced by a recording stub and a full preview plus confirm must record zero calls, and a static scan of
 *     the intake import graph must find none of those modules (and none of the shared files this batch must not touch).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { READY_STATE, makeFakeIntakeDb, makeResolver, printing } from './__fixtures__/intakeFakes';
import { allIntakeMessages } from '../services/cardIntake/messages';
import { executeConfirm, isApiFailure, parseIntakeParams, prepareConfirm, runPreview } from '../services/cardIntake/intakeService';
import { getIntakeConfig } from '../services/cardIntake/config';
import { sha256OfFile } from '../services/cardIntake/parseSpreadsheet';

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
jest.mock('../lib/aiTagsQuotaTracker', () => mockRecorder(), { virtual: true });
jest.mock('@anthropic-ai/sdk', () => mockRecorder(), { virtual: true });
jest.mock('@google-cloud/vision', () => mockRecorder(), { virtual: true });
jest.mock('axios', () => mockRecorder(), { virtual: true });

const SRC = path.join(__dirname, '..');
const FIX = path.join(__dirname, '__fixtures__', 'cardIntake');

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...listTs(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

const OWN_FILES = [
  ...listTs(path.join(SRC, 'services', 'cardIntake')),
  path.join(SRC, 'controllers', 'cardIntakeController.ts'),
  path.join(SRC, 'routes', 'cardIntake.ts'),
];

describe('copy lint', () => {
  const messages = allIntakeMessages();

  it('has a plausible number of messages', () => {
    expect(messages.length).toBeGreaterThan(40);
    for (const m of messages) expect(typeof m).toBe('string');
  });

  it.each(messages.map((m) => [m]))('"%s" follows the copy rules', (m) => {
    expect(m.trim().length).toBeGreaterThan(0);
    expect(m).not.toMatch(/[—–]/);
    expect(m).not.toMatch(/\bAI\b/);
    expect(m).not.toMatch(/estate sale/i);
    expect(m).not.toMatch(/lorem|todo|tbd|xxx|placeholder|coming soon/i);
    expect(m).not.toMatch(/\{\{|\}\}|\$\{/);
    expect(m).not.toMatch(/\s{2,}/);
  });

  it('no source file of this batch contains an em dash, en dash or the forbidden words', () => {
    for (const file of OWN_FILES) {
      const text = fs.readFileSync(file, 'utf8');
      expect({ file: path.relative(SRC, file), dash: /[—–]/.test(text) }).toEqual({ file: path.relative(SRC, file), dash: false });
      expect({ file: path.relative(SRC, file), ai: /\bAI\b/.test(text) }).toEqual({ file: path.relative(SRC, file), ai: false });
      expect({ file: path.relative(SRC, file), estate: /estate sale/i.test(text) }).toEqual({ file: path.relative(SRC, file), estate: false });
    }
  });

  it('every message the live endpoints emit follows the copy rules', async () => {
    const db = makeFakeIntakeDb({ sales: [{ id: 's', organizerId: 'o', userId: 'u' }] });
    const deps = { db, resolve: makeResolver([printing()]).resolve, getCatalogState: async () => READY_STATE, getDbSizeBytes: async () => null, env: {} };
    const strings: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === 'string') strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v as object).forEach(walk);
    };
    const cfg = getIntakeConfig({});
    for (const fixture of ['manabox-synthetic.csv', 'generic-synthetic.tsv', 'formula-cells-synthetic.csv']) {
      const file = path.join(FIX, fixture);
      const pp = parseIntakeParams({}, 'preview', cfg);
      if (isApiFailure(pp)) throw new Error(pp.code);
      const prev = await runPreview(deps as any, { filePath: file, fileName: fixture, saleId: 's', organizerId: 'o', params: pp });
      if (isApiFailure(prev)) throw new Error(prev.code);
      const d: any = prev.data;
      walk([d.summary.errorsByCode, d.errorRows.map((e: any) => e.message), d.reviewRows.map((r: any) => r.message), d.noCatalog.sample.map((r: any) => r.message), Object.keys(d.summary.warnings)]);
      const cp = parseIntakeParams({ mode: 'ADD', fileSha256: await sha256OfFile(file) }, 'confirm', cfg);
      if (isApiFailure(cp)) throw new Error(cp.code);
      const prepared = await prepareConfirm(deps as any, { filePath: file, fileName: fixture, saleId: 's', organizerId: 'o', params: cp });
      if (isApiFailure(prepared)) throw new Error(prepared.code);
      const events: unknown[] = [];
      await executeConfirm(deps as any, prepared, { emit: (e) => void events.push(e), shouldCancel: () => false });
      for (const e of events as any[]) if (e.type === 'rowError') strings.push(e.message);
    }
    const messagesOnly = strings.filter((s) => s.length > 0);
    expect(messagesOnly.length).toBeGreaterThan(0);
    for (const s of messagesOnly) {
      expect(s).not.toMatch(/[—–]/);
      expect(s).not.toMatch(/\bAI\b/);
      expect(s).not.toMatch(/estate sale/i);
    }
  });
});

describe('isolation from Vision and Haiku (acceptance 14)', () => {
  it('a full preview and confirm records zero calls on any AI related module', async () => {
    mockAiCalls.length = 0;
    const db = makeFakeIntakeDb({ sales: [{ id: 's', organizerId: 'o', userId: 'u' }] });
    const deps: any = { db, resolve: makeResolver([printing()]).resolve, getCatalogState: async () => READY_STATE, getDbSizeBytes: async () => null, env: {} };
    const cfg = getIntakeConfig({});
    const file = path.join(FIX, 'manabox-synthetic.csv');
    const pp = parseIntakeParams({}, 'preview', cfg);
    if (isApiFailure(pp)) throw new Error(pp.code);
    const prev = await runPreview(deps, { filePath: file, fileName: 'x.csv', saleId: 's', organizerId: 'o', params: pp });
    expect(isApiFailure(prev)).toBe(false);
    const cp = parseIntakeParams({ mode: 'ADD', fileSha256: await sha256OfFile(file), conditionMapping: JSON.stringify({ excellent: 'LP', played: 'HP', mystery_grade: null }) }, 'confirm', cfg);
    if (isApiFailure(cp)) throw new Error(cp.code);
    const prepared = await prepareConfirm(deps, { filePath: file, fileName: 'x.csv', saleId: 's', organizerId: 'o', params: cp });
    if (isApiFailure(prepared)) throw new Error(prepared.code);
    const done = await executeConfirm(deps, prepared, { emit: () => undefined, shouldCancel: () => false });
    expect(done.status).toBe('COMPLETED');
    expect(done.summary.created).toBeGreaterThan(0);
    expect(mockAiCalls).toEqual([]);
  });

  it('loading the intake route and controller does not touch any AI related module', () => {
    mockAiCalls.length = 0;
    jest.isolateModules(() => {
      jest.doMock('../middleware/auth', () => ({ authenticate: (_q: any, _s: any, n: any) => n(), requireOrganizer: (_q: any, _s: any, n: any) => n() }));
      jest.doMock('../lib/prisma', () => ({ prisma: {} }));
      require('../routes/cardIntake');
    });
    expect(mockAiCalls).toEqual([]);
  });

  const BANNED = [
    'cloudAIService',
    'imageMatchService',
    'ebayImageSearchService',
    'aiCostTracker',
    'aiTagsQuotaTracker',
    'tierEnforcement',
    'tierLimits',
    'itemCsvImport',
    'middleware/rateLimiter',
    '@anthropic-ai/sdk',
    '@google-cloud/vision',
    'axios',
    'openai',
    'safeFetch',
    'node-fetch',
  ];
  /** Shared infrastructure that intake uses but does not own; the graph is not walked into these. */
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

  it('the transitive import graph of the intake contains no AI module, no shared file this batch must not use, and no requireTier', () => {
    const seen = new Set<string>();
    const queue = [...OWN_FILES];
    const offenders: string[] = [];
    while (queue.length) {
      const file = queue.pop() as string;
      if (seen.has(file)) continue;
      seen.add(file);
      const text = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/requireTier|checkTierLimit|trackAITokens|trackVisionCall|callHaiku|analyzeItemImage/.test(text)) offenders.push(`${path.relative(SRC, file)}: tier or AI call`);
      for (const spec of importsOf(text)) {
        if (BANNED.some((b) => spec.includes(b))) offenders.push(`${path.relative(SRC, file)} imports ${spec}`);
        if (!spec.startsWith('.')) continue;
        const resolved = resolveLocal(file, spec);
        if (!resolved) continue;
        const rel = path.relative(SRC, resolved).split(path.sep).join('/');
        if (BOUNDARY.some((b) => rel.startsWith(b))) continue;
        queue.push(resolved);
      }
    }
    expect(offenders).toEqual([]);
    expect(seen.size).toBeGreaterThan(20);
  });

  it('intake source never uses fetch, http clients or child processes', () => {
    for (const file of OWN_FILES) {
      const text = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect({ file: path.relative(SRC, file), uses: /\bfetch\(|require\(['"]https?['"]\)|from ['"]https?['"]|child_process/.test(text) }).toEqual({ file: path.relative(SRC, file), uses: false });
    }
  });

  it('keeps the temp directory under the OS temp dir (no repo path)', () => {
    const text = fs.readFileSync(path.join(SRC, 'controllers', 'cardIntakeController.ts'), 'utf8');
    expect(text).toContain("os.tmpdir(), 'findasale-card-intake'");
    expect(os.tmpdir().length).toBeGreaterThan(0);
  });
});
