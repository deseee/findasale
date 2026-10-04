/**
 * /api/card-intake routes (ADR-134 #642, batch B4). The router is mounted on a test Express app; auth is
 * stubbed (x-test-user header), the Prisma client is an in-memory fake and the card catalog is a fixed list of
 * printings. Real multer disk uploads and real NDJSON streaming are exercised. No database, no network.
 */
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import { READY_STATE, makeFakeIntakeDb, makeResolver, printing } from './__fixtures__/intakeFakes';

const mockDb: any = makeFakeIntakeDb({
  sales: [
    { id: 'sale_1', organizerId: 'org_1', userId: 'u1' },
    { id: 'sale_2', organizerId: 'org_2', userId: 'u2' },
  ],
});
const mockPrintings = [
  printing({ id: 'SCRYFALL:00000000-0000-4000-8000-000000000001', scryfallId: '00000000-0000-4000-8000-000000000001', name: 'Lightning Bolt', setCode: 'lea', collectorNumber: '161' }),
];
const mockResolver = makeResolver(mockPrintings);

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
  resolveRefs: (refs: any) => mockResolver.resolve(refs),
  loadCatalogState: async () => READY_STATE,
}));

// Required AFTER the mocks above.
const router = require('../routes/cardIntake').default;
const { sweepStaleTempFiles } = require('../controllers/cardIntakeController');

const FIX = path.join(__dirname, '__fixtures__', 'cardIntake');
let tmpRoot: string;
let uploadDir: string;
let server: any;
let baseUrl: string;
const savedEnv: Record<string, string | undefined> = {};

beforeAll(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cardintake-routes-'));
  for (const k of ['TMPDIR', 'CARD_INTAKE_MAX_ROWS', 'CARD_INTAKE_MAX_FILE_MB']) savedEnv[k] = process.env[k];
  process.env.TMPDIR = tmpRoot;
  const realFindSale = mockDb.sale.findUnique;
  mockDb.sale.findUnique = async (args: any) => {
    const m = /^sale_fresh_(\d+)$/.exec(String(args?.where?.id));
    if (m) return { id: args.where.id, organizerId: `org_fresh_${m[1]}`, organizer: { userId: `u_fresh_${m[1]}` } };
    return realFindSale(args);
  };
  uploadDir = path.join(os.tmpdir(), 'findasale-card-intake');
  const app = express();
  app.use(express.json());
  app.use('/api/card-intake', router);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/card-intake`;
});
afterAll(() => {
  server.closeAllConnections?.();
  server.close();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});
beforeEach(() => {
  mockDb.state.items.clear();
  mockDb.state.batches.clear();
  mockDb.state.itemCreates = 0;
  mockDb.state.itemUpdates = 0;
  mockDb.state.transactions = 0;
  mockDb.state.failTransactionNumber = 0;
  mockDb.state.afterCommit = null;
  delete process.env.CARD_INTAKE_MAX_ROWS;
  delete process.env.CARD_INTAKE_MAX_FILE_MB;
});

function csvOf(count: number, prefix = 'Card'): string {
  const lines = ['Name,Quantity,Condition,Price'];
  for (let i = 1; i <= count; i++) lines.push(`${prefix} ${i},${(i % 3) + 1},Near Mint,${(i % 50) + 1}.00`);
  return lines.join('\n') + '\n';
}

interface PostOpts {
  user?: any;
  fields?: Record<string, string>;
  file?: { name: string; text?: string; bytes?: Uint8Array; type?: string } | null;
  signal?: AbortSignal;
}

async function post(urlPath: string, o: PostOpts) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o.fields ?? {})) fd.append(k, v);
  if (o.file) {
    const part: any = o.file.bytes ? o.file.bytes : (o.file.text ?? '');
    fd.append('file', new Blob([part], { type: o.file.type ?? 'text/csv' }), o.file.name);
  }
  const headers: Record<string, string> = {};
  if (o.user) headers['x-test-user'] = JSON.stringify(o.user);
  return fetch(`${baseUrl}${urlPath}`, { method: 'POST', headers, body: fd, signal: o.signal });
}

async function readNdjson(res: Response): Promise<any[]> {
  const text = await res.text();
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

async function waitFor(check: () => boolean, ms = 3000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 15));
  }
  return check();
}

const uploadFiles = (): string[] => {
  try {
    return fs.readdirSync(uploadDir).filter((n) => n.endsWith('.upload'));
  } catch {
    return [];
  }
};
const noTempFiles = () => waitFor(() => uploadFiles().length === 0);

let unique = 0;
/**
 * A fresh organizer and sale per call. The confirm limiter allows 6 per hour per user, so tests that confirm use
 * their own user id; the sale lookup below maps sale_fresh_<n> to user u_fresh_<n> (and organizer org_fresh_<n>).
 */
function fresh() {
  unique += 1;
  return { user: { id: `u_fresh_${unique}`, roles: ['ORGANIZER'] }, sale: `sale_fresh_${unique}`, organizerId: `org_fresh_${unique}` };
}
/** The fixed owner of sale_1 (u1) or sale_2 (u2), used where the limiter quota does not matter. */
function owner(sale: 'sale_1' | 'sale_2' = 'sale_1') {
  return { id: sale === 'sale_1' ? 'u1' : 'u2', roles: ['ORGANIZER'] };
}

describe('GET /formats', () => {
  it('requires a login and the ORGANIZER role', async () => {
    expect((await fetch(`${baseUrl}/formats`)).status).toBe(401);
    const res = await fetch(`${baseUrl}/formats`, { headers: { 'x-test-user': JSON.stringify({ id: 'u9', roles: ['USER'] }) } });
    expect(res.status).toBe(403);
  });

  it('lists importers, modes, price sources and limits', async () => {
    const res = await fetch(`${baseUrl}/formats`, { headers: { 'x-test-user': JSON.stringify(owner()) } });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.importers.map((i: any) => i.id)).toEqual(['manabox', 'moxfield', 'tcgplayer_seller', 'tcgplayer_app', 'generic']);
    expect(body.data.modes.map((m: any) => m.value)).toEqual(['ADD', 'REPLACE']);
    expect(body.data.priceSources.map((m: any) => m.value)).toEqual(['FILE', 'NONE']);
    expect(body.data.limits).toEqual({ maxRows: 20000, maxFileMb: 50 });
    expect(body.data.fields.length).toBeGreaterThan(5);
  });
});

describe('POST /:saleId/preview', () => {
  it('requires a login and the ORGANIZER role', async () => {
    expect((await post('/sale_1/preview', { file: { name: 'a.csv', text: csvOf(1) } })).status).toBe(401);
    const res = await post('/sale_1/preview', { user: { id: 'u9', roles: ['USER'] }, file: { name: 'a.csv', text: csvOf(1) } });
    expect(res.status).toBe(403);
  });

  it("another organizer's sale is a 403 and nothing is spooled or read (acceptance 10)", async () => {
    const res = await post('/sale_2/preview', { user: owner('sale_1'), file: { name: 'a.csv', text: csvOf(2) } });
    expect(res.status).toBe(403);
    const body: any = await res.json();
    expect(body).toMatchObject({ success: false, code: 'NOT_YOUR_SALE' });
    expect(uploadFiles()).toHaveLength(0);
  });

  it("another organizer's sale is a 403 on confirm as well (acceptance 10)", async () => {
    const file = { name: 'a.csv', text: csvOf(2) };
    const sha = '0'.repeat(64);
    const res = await post('/sale_2/confirm', { user: owner('sale_1'), fields: { mode: 'ADD', fileSha256: sha }, file });
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).code).toBe('NOT_YOUR_SALE');
    expect(mockDb.state.itemCreates).toBe(0);
    expect(mockDb.state.batches.size).toBe(0);
  });

  it('an unknown sale is a 404', async () => {
    const res = await post('/no_such_sale/preview', { user: owner(), file: { name: 'a.csv', text: csvOf(1) } });
    expect(res.status).toBe(404);
    expect(((await res.json()) as any).code).toBe('SALE_NOT_FOUND');
  });

  it('answers 400 NO_FILE without a file', async () => {
    const res = await post('/sale_1/preview', { user: owner(), fields: { mode: 'ADD' } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).code).toBe('NO_FILE');
  });

  it('rejects an unsupported file type before reading it and leaves no temp file', async () => {
    const res = await post('/sale_1/preview', { user: owner(), file: { name: 'cards.xlsx', text: 'x', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(await noTempFiles()).toBe(true);
  });

  it('rejects a workbook renamed to .csv (binary check) and removes the temp file (acceptance 13, failure)', async () => {
    const res = await post('/sale_1/preview', { user: owner(), file: { name: 'renamed.csv', bytes: new Uint8Array([0x50, 0x4b, 3, 4, 0, 1, 2, 3]) } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).code).toBe('NOT_A_CSV_FILE');
    expect(await noTempFiles()).toBe(true);
  });

  it('rejects a file over the size cap with 413 FILE_TOO_LARGE and leaves no temp file', async () => {
    process.env.CARD_INTAKE_MAX_FILE_MB = '1';
    const res = await post('/sale_1/preview', { user: owner(), file: { name: 'big.csv', text: csvOf(60000) } });
    expect(res.status).toBe(413);
    expect(((await res.json()) as any).code).toBe('FILE_TOO_LARGE');
    expect(await noTempFiles()).toBe(true);
  });

  it('returns the preview and removes the temp file (acceptance 13, success)', async () => {
    const text = fs.readFileSync(path.join(FIX, 'moxfield-synthetic.csv'), 'utf8');
    const res = await post('/sale_1/preview', { user: owner(), file: { name: 'moxfield-synthetic.csv', text } });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.detectedFormat).toBe('moxfield');
    expect(body.data.fileSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(body.data.fileName).toBe('moxfield-synthetic.csv');
    expect(body.data.rowsTotal).toBeGreaterThan(0);
    expect(body.data.conditionMapping.length).toBeGreaterThan(0);
    expect(mockDb.state.itemCreates).toBe(0);
    expect(await noTempFiles()).toBe(true);
  });

  it('413 TOO_MANY_ROWS comes from the reader, with the limit, and nothing is written (acceptance 2)', async () => {
    process.env.CARD_INTAKE_MAX_ROWS = '10';
    const res = await post('/sale_1/preview', { user: owner(), file: { name: 'rows.csv', text: csvOf(11) } });
    expect(res.status).toBe(413);
    const body: any = await res.json();
    expect(body).toMatchObject({ code: 'TOO_MANY_ROWS', limit: 10 });
    expect(await noTempFiles()).toBe(true);
  });

  it('answers 400 for a malformed mode on preview', async () => {
    const res = await post('/sale_1/preview', { user: owner(), fields: { mode: 'MERGE' }, file: { name: 'a.csv', text: csvOf(1) } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).code).toBe('BAD_MODE');
    expect(await noTempFiles()).toBe(true);
  });
});

describe('POST /:saleId/confirm', () => {
  it('returns 400 MODE_REQUIRED when the mode is missing and removes the temp file (acceptance 8)', async () => {
    const f = fresh();
    const text = csvOf(2);
    const sha = createHashOf(text);
    const res = await post(`/${f.sale}/confirm`, { user: f.user, fields: { fileSha256: sha }, file: { name: 'a.csv', text } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).code).toBe('MODE_REQUIRED');
    expect(mockDb.state.itemCreates).toBe(0);
    expect(await noTempFiles()).toBe(true);
  });

  it('returns 409 FILE_CHANGED when the sent file differs from the previewed one (acceptance 4)', async () => {
    const f = fresh();
    const res = await post(`/${f.sale}/confirm`, { user: f.user, fields: { mode: 'ADD', fileSha256: createHashOf(csvOf(2)) }, file: { name: 'a.csv', text: csvOf(3) } });
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).code).toBe('FILE_CHANGED');
    expect(mockDb.state.itemCreates).toBe(0);
    expect(await noTempFiles()).toBe(true);
  });

  it('streams NDJSON progress and a done event, then removes the temp file (acceptance 13, success)', async () => {
    const f = fresh();
    const text = csvOf(230);
    const res = await post(`/${f.sale}/confirm`, { user: f.user, fields: { mode: 'ADD', fileSha256: createHashOf(text) }, file: { name: 'a.csv', text } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    const events = await readNdjson(res);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('progress');
    expect(types[types.length - 1]).toBe('done');
    const writing = events.filter((e) => e.type === 'progress' && e.phase === 'writing');
    expect(writing).toHaveLength(3);
    expect(writing[writing.length - 1]).toMatchObject({ processed: 230, total: 230, created: 230, merged: 0, skipped: 0, errors: 0 });
    const done = events[events.length - 1];
    expect(done).toMatchObject({ type: 'done', status: 'COMPLETED', resumed: false });
    expect(done.batchId).toEqual(expect.any(String));
    expect(done.summary).toMatchObject({ rowsTotal: 230, created: 230, merged: 0, skipped: 0, errors: 0 });
    expect(typeof done.errorsCsvHeader).toBe('string');
    expect(mockDb.state.items.size).toBe(230);
    expect(await noTempFiles()).toBe(true);
  });

  it('emits rowError events with a neutralized csvLine', async () => {
    const f = fresh();
    const text = fs.readFileSync(path.join(FIX, 'formula-cells-synthetic.csv'), 'utf8');
    const res = await post(`/${f.sale}/confirm`, { user: f.user, fields: { mode: 'ADD', fileSha256: createHashOf(text) }, file: { name: 'f.csv', text } });
    const events = await readNdjson(res);
    const rowErrors = events.filter((e) => e.type === 'rowError');
    expect(rowErrors.length).toBeGreaterThanOrEqual(2);
    for (const e of rowErrors) {
      expect(e).toEqual(expect.objectContaining({ row: expect.any(Number), code: expect.any(String), message: expect.any(String), csvLine: expect.any(String), source: expect.any(Object) }));
      for (const cell of e.csvLine.split(',')) expect(/^"?[=+\-@]/.test(cell)).toBe(false);
    }
    const done = events[events.length - 1];
    expect(done.summary.errors).toBe(rowErrors.length);
    expect(done.errorsCsvHeader).toBe('Name,Quantity,Condition,Notes,FindASale Error');
  });

  it('returns 409 ALREADY_APPLIED for a completed file and writes nothing (acceptance 3)', async () => {
    const f = fresh();
    const user = f.user;
    const text = csvOf(4);
    const fields = { mode: 'ADD', fileSha256: createHashOf(text) };
    const first = await post(`/${f.sale}/confirm`, { user, fields, file: { name: 'a.csv', text } });
    await readNdjson(first);
    const writes = mockDb.state.itemCreates;
    const second = await post(`/${f.sale}/confirm`, { user, fields, file: { name: 'a.csv', text } });
    expect(second.status).toBe(409);
    const body: any = await second.json();
    expect(body.code).toBe('ALREADY_APPLIED');
    expect(body.summary).toMatchObject({ status: 'COMPLETED', created: 4 });
    expect(mockDb.state.itemCreates).toBe(writes);
    expect(await noTempFiles()).toBe(true);
  });

  it('sends a fatal event when the database fails mid-run, keeps the batch FAILED and removes the temp file (acceptance 13, failure)', async () => {
    const f = fresh();
    const text = csvOf(150);
    mockDb.state.failTransactionNumber = 2;
    const res = await post(`/${f.sale}/confirm`, { user: f.user, fields: { mode: 'ADD', fileSha256: createHashOf(text) }, file: { name: 'a.csv', text } });
    expect(res.status).toBe(200);
    const events = await readNdjson(res);
    const last = events[events.length - 1];
    expect(last).toMatchObject({ type: 'fatal', code: 'SERVER_ERROR' });
    expect(typeof last.message).toBe('string');
    expect(JSON.stringify(last)).not.toContain('simulated');
    const batch = Array.from(mockDb.state.batches.values())[0] as any;
    expect(batch.status).toBe('FAILED');
    expect(await noTempFiles()).toBe(true);
  });

  it('a disconnect mid-run marks the batch CANCELLED, removes the temp file, and a resend resumes with no duplicates (acceptance 5 and 13, cancel)', async () => {
    const f = fresh();
    const user = f.user;
    const text = csvOf(2500);
    const fields = { mode: 'ADD', fileSha256: createHashOf(text) };
    // Slow each chunk a little so the abort lands between chunks.
    const realTransaction = mockDb.$transaction;
    mockDb.$transaction = async (fn: any, opts: any) => {
      await new Promise((r) => setTimeout(r, 25));
      return realTransaction(fn, opts);
    };
    try {
      const controller = new AbortController();
      const res = await post(`/${f.sale}/confirm`, { user, fields, file: { name: 'big.csv', text }, signal: controller.signal });
      const reader = (res.body as any).getReader();
      const decoder = new TextDecoder();
      let seenWriting = false;
      let buffer = '';
      while (!seenWriting) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.includes('"phase":"writing"')) seenWriting = true;
      }
      expect(seenWriting).toBe(true);
      controller.abort();
      await reader.cancel().catch(() => undefined);

      const cancelled = await waitFor(() => (Array.from(mockDb.state.batches.values())[0] as any)?.status === 'CANCELLED', 8000);
      expect(cancelled).toBe(true);
      const batch = Array.from(mockDb.state.batches.values())[0] as any;
      expect(batch.committedThroughRow).toBeGreaterThan(1);
      expect(batch.committedThroughRow).toBeLessThan(2501);
      expect(mockDb.state.items.size).toBe(batch.committedThroughRow - 1);
      expect(await noTempFiles()).toBe(true);
    } finally {
      mockDb.$transaction = realTransaction;
    }

    const again = await post(`/${f.sale}/confirm`, { user, fields, file: { name: 'big.csv', text } });
    const events = await readNdjson(again);
    const done = events[events.length - 1];
    expect(done).toMatchObject({ type: 'done', status: 'COMPLETED', resumed: true });
    expect(done.summary.created).toBe(2500);
    expect(mockDb.state.items.size).toBe(2500);
    const titles = new Set(Array.from(mockDb.state.items.values()).map((i: any) => i.card.cardName));
    expect(titles.size).toBe(2500);
    expect(await noTempFiles()).toBe(true);
  });

  it('limits confirm to 6 per hour per user', async () => {
    const user = { id: 'u_limit', roles: ['ORGANIZER'] };
    let last = 0;
    for (let i = 0; i < 7; i++) {
      const res = await post('/sale_1/confirm', { user, fields: { mode: 'ADD' } });
      last = res.status;
      if (i < 6) expect(res.status).toBe(403);
    }
    expect(last).toBe(429);
  });
});

describe('temp file sweep', () => {
  it('removes only stale .upload files', async () => {
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'sweep-'));
    const stale = path.join(dir, 'old.upload');
    const fresh = path.join(dir, 'new.upload');
    const other = path.join(dir, 'keep.txt');
    for (const f of [stale, fresh, other]) fs.writeFileSync(f, 'x');
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(stale, old, old);
    fs.utimesSync(other, old, old);
    const removed = await sweepStaleTempFiles(dir);
    expect(removed).toBe(1);
    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
    expect(fs.existsSync(other)).toBe(true);
    expect(await sweepStaleTempFiles(path.join(dir, 'missing'))).toBe(0);
  });
});

function createHashOf(text: string): string {
  return require('crypto').createHash('sha256').update(text, 'utf8').digest('hex');
}
