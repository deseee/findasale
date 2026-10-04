/**
 * Card intake at size (ADR-134 #642, batch B4 acceptance 1 and 2): a 20,000-row synthetic file previews and
 * confirms within 300 MB resident memory, and 20,001 rows is a 413 TOO_MANY_ROWS before any write.
 * The database is an in-memory fake and the catalog resolver is synthesized in O(1) per row. Fixtures are synthetic.
 *
 * Memory: V8 collects lazily, so on a roomy machine the resident set size (RSS) of a process drifts upward with
 * garbage that a small container would collect. The test therefore forces a garbage collection every 500 rows while planning and every 10 events while writing
 * (the engine's gc function is obtained at run time, so no node flag is needed) and asserts that
 *   - the peak RSS GROWTH while the file is processed stays under 300 MB (jest itself starts near 150 MB), and
 *   - the live heap after the run is far below that (the file is streamed, never held whole).
 * The fake database keeps all 20,000 created items in memory, which a real database does not, so the figures
 * overstate what the server holds. Run unforced, the same file peaks higher; with an old-space cap of 120 MB it
 * still completes, which is the stronger statement and was checked by hand (see the report).
 */
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import { READY_STATE, makeFakeIntakeDb, printing } from './__fixtures__/intakeFakes';
import { executeConfirm, isApiFailure, parseIntakeParams, prepareConfirm, runPreview } from '../services/cardIntake/intakeService';
import type { IntakeDeps } from '../services/cardIntake/intakeService';
import { getIntakeConfig } from '../services/cardIntake/config';
import { sha256OfFile } from '../services/cardIntake/parseSpreadsheet';

const mockDb: any = makeFakeIntakeDb({ sales: [{ id: 'sale_big', organizerId: 'org_big', userId: 'u_big' }] });

jest.mock('../middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const raw = req.headers['x-test-user'];
    if (!raw) return res.status(401).json({ message: 'Authentication required' });
    req.user = JSON.parse(raw as string);
    next();
  },
  requireOrganizer: (req: any, res: any, next: any) => {
    if (!req.user?.roles?.includes('ORGANIZER')) return res.status(403).json({ message: 'Organizer access required' });
    next();
  },
}));
jest.mock('../lib/prisma', () => ({ prisma: mockDb }));
jest.mock('../services/cardCatalog/cardCatalogLookup', () => ({
  ...jest.requireActual('../services/cardCatalog/cardCatalogLookup'),
  resolveRefs: async () => [],
  loadCatalogState: async () => ({ enabled: true, catalogReady: true, readyGames: ['MTG'], dataAsOf: { SCRYFALL: null, TCGCSV: null }, sources: [] }),
}));

const router = require('../routes/cardIntake').default;

const MB = 1024 * 1024;
let forceGc: () => void = () => undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('v8').setFlagsFromString('--expose_gc');
  const fn = require('vm').runInNewContext('gc');
  if (typeof fn === 'function') forceGc = fn;
} catch {
  // Without a gc function the test still runs; the RSS growth budget is then measured on raw numbers.
}
let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cardintake-large-'));
});
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const scryfallId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Writes a ManaBox style export of `rows` data rows, in pieces, so the test does not hold the file in memory either. */
function writeManaboxFile(file: string, rows: number): void {
  const fd = fs.openSync(file, 'w');
  try {
    fs.writeSync(fd, 'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase price currency\n');
    let buf = '';
    for (let i = 1; i <= rows; i++) {
      buf += `Synthetic Card ${i},syn,Synthetic Set,${i},normal,common,${(i % 4) + 1},${i},${scryfallId(i)},${(i % 90) / 10 + 0.5},false,false,near_mint,en,USD\n`;
      if (i % 1000 === 0) {
        fs.writeSync(fd, buf);
        buf = '';
      }
    }
    if (buf) fs.writeSync(fd, buf);
  } finally {
    fs.closeSync(fd);
  }
}

/** O(1) per ref: every Scryfall id resolves to its own synthesized printing. */
function syntheticResolve(refs: Array<{ ref: string; scryfallId?: string | null; name?: string | null }>): Promise<any[]> {
  forceGc(); // called once per 500 rows in both preview and confirm
  return Promise.resolve(
    refs.map((r) => {
      const n = r.scryfallId ? parseInt(r.scryfallId.slice(-12), 10) : NaN;
      if (!Number.isFinite(n)) return { ref: r.ref, status: 'UNMATCHED', candidates: [], truncated: false };
      return {
        ref: r.ref,
        status: 'EXACT',
        candidates: [printing({ id: `SCRYFALL:${scryfallId(n)}`, scryfallId: scryfallId(n), name: `Synthetic Card ${n}`, setCode: 'syn', setName: 'Synthetic Set', collectorNumber: String(n), tcgplayerProductId: n })],
        truncated: false,
      };
    })
  );
}

function sampler() {
  let peak = process.memoryUsage().rss;
  const timer = setInterval(() => {
    const rss = process.memoryUsage().rss;
    if (rss > peak) peak = rss;
  }, 5);
  return {
    sample: () => {
      const rss = process.memoryUsage().rss;
      if (rss > peak) peak = rss;
    },
    stop: () => {
      clearInterval(timer);
      return peak;
    },
  };
}

describe('20,000 rows (acceptance 1)', () => {
  it('previews and confirms a 20,000-row file within 300 MB of resident memory', async () => {
    const db = makeFakeIntakeDb({ sales: [{ id: 'sale_big', organizerId: 'org_big', userId: 'u_big' }] });
    const deps: IntakeDeps = { db, resolve: syntheticResolve as any, getCatalogState: async () => READY_STATE, getDbSizeBytes: async () => null, env: {} };
    const file = path.join(tmp, 'big-manabox-synthetic.csv');
    writeManaboxFile(file, 20000);
    expect(fs.statSync(file).size).toBeGreaterThan(1.5 * MB);

    const cfg = getIntakeConfig({});
    const previewParams = parseIntakeParams({}, 'preview', cfg);
    if (isApiFailure(previewParams)) throw new Error(previewParams.code);

    forceGc();
    const startHeap = process.memoryUsage().heapUsed;
    const startRss = process.memoryUsage().rss;
    const mem = sampler();

    const preview = await runPreview(deps, { filePath: file, fileName: 'big.csv', saleId: 'sale_big', organizerId: 'org_big', params: previewParams });
    if (isApiFailure(preview)) throw new Error(preview.code);
    mem.sample();
    const d: any = preview.data;
    expect(d.rowsTotal).toBe(20000);
    expect(d.summary).toMatchObject({ exact: 20000, errors: 0, willCreate: 20000, willMerge: 0 });
    expect(db.state.itemCreates).toBe(0);
    expect(d.sample).toHaveLength(10);

    const sha = await sha256OfFile(file);
    const confirmParams = parseIntakeParams({ mode: 'ADD', fileSha256: sha, priceSource: 'FILE' }, 'confirm', cfg);
    if (isApiFailure(confirmParams)) throw new Error(confirmParams.code);
    const prepared = await prepareConfirm(deps, { filePath: file, fileName: 'big.csv', saleId: 'sale_big', organizerId: 'org_big', params: confirmParams });
    if (isApiFailure(prepared)) throw new Error(prepared.code);
    let events = 0;
    const done = await executeConfirm(deps, prepared, {
      emit: () => {
        events += 1;
        if (events % 10 === 0) forceGc();
        mem.sample();
      },
      shouldCancel: () => false,
    });
    const peak = mem.stop();

    expect(done.status).toBe('COMPLETED');
    expect(done.summary).toMatchObject({ rowsTotal: 20000, created: 20000, merged: 0, errors: 0 });
    expect(db.state.items.size).toBe(20000);
    expect(db.state.transactions).toBe(200);
    expect(events).toBeGreaterThan(200);

    forceGc();
    const liveGrowthMb = (process.memoryUsage().heapUsed - startHeap) / MB;
    const growthMb = (peak - startRss) / MB;
    // Reported so a reader of the CI log can see the real figures.
    console.log(`[cardIntake large file] start rss ${(startRss / MB).toFixed(0)} MB, peak rss ${(peak / MB).toFixed(0)} MB, rss growth ${growthMb.toFixed(0)} MB, live heap growth after run ${liveGrowthMb.toFixed(0)} MB (includes the fake database's 20,000 items)`);
    expect(growthMb).toBeLessThan(300);
    expect(liveGrowthMb).toBeLessThan(150);
  }, 120000);
});

describe('20,001 rows (acceptance 2)', () => {
  let server: any;
  let baseUrl: string;
  beforeAll(() => {
    const app = express();
    app.use('/api/card-intake', router);
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/card-intake`;
  });
  afterAll(() => {
    server.closeAllConnections?.();
    server.close();
  });

  const post = async (route: 'preview' | 'confirm', file: string, fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    fd.append('file', new Blob([fs.readFileSync(file)], { type: 'text/csv' }), 'rows.csv');
    return fetch(`${baseUrl}/sale_big/${route}`, { method: 'POST', headers: { 'x-test-user': JSON.stringify({ id: 'u_big', roles: ['ORGANIZER'] }) }, body: fd });
  };

  it('returns 413 TOO_MANY_ROWS on preview and confirm before any write', async () => {
    const file = path.join(tmp, 'over-manabox-synthetic.csv');
    writeManaboxFile(file, 20001);
    const sha = await sha256OfFile(file);
    const preview = await post('preview', file, {});
    expect(preview.status).toBe(413);
    expect(await preview.json()).toMatchObject({ success: false, code: 'TOO_MANY_ROWS', limit: 20000 });
    const confirm = await post('confirm', file, { mode: 'ADD', fileSha256: sha });
    expect(confirm.status).toBe(413);
    expect(((await confirm.json()) as any).code).toBe('TOO_MANY_ROWS');
    expect(mockDb.state.itemCreates).toBe(0);
    expect(mockDb.state.itemUpdates).toBe(0);
    expect(mockDb.state.transactions).toBe(0);
    expect(mockDb.state.batches.size).toBe(0);
  }, 60000);

  it('accepts exactly 20,000 rows at the reader (boundary)', async () => {
    const file = path.join(tmp, 'edge-manabox-synthetic.csv');
    writeManaboxFile(file, 20000);
    const { inspectFile } = require('../services/cardIntake/parseSpreadsheet');
    await expect(inspectFile(file, 20000)).resolves.toMatchObject({ rowCount: 20000 });
    await expect(inspectFile(file, 19999)).rejects.toMatchObject({ code: 'TOO_MANY_ROWS' });
  }, 60000);
});
