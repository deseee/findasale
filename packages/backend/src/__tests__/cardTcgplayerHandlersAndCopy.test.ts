/**
 * ADR-137 (roadmap #660): flags, the handlers (on fakes), copy rules, and wiring checks for the TCGplayer round trip.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { allTcgplayerMessages } from '../services/cardTcgplayer/messages';
import { isTcgplayerSyncEnabled } from '../services/cardTcgplayer/config';
import {
  createCardTcgplayerHandlers,
  parseExportOptions,
  parseReconcileParams,
} from '../controllers/cardTcgplayerController';
import { FakeSyncDb, fakeDeps, fakeItem } from './__fixtures__/tcgplayerFakes';

const SRC = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

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
  ...listTs(path.join(SRC, 'services', 'cardTcgplayer')),
  path.join(SRC, 'controllers', 'cardTcgplayerController.ts'),
  path.join(SRC, 'routes', 'cardTcgplayer.ts'),
];

const ON = { CARD_CATALOG_ENABLED: 'true', CARD_TCGPLAYER_SYNC_ENABLED: 'true' };

describe('flags', () => {
  it('is off by default', () => {
    expect(isTcgplayerSyncEnabled({})).toBe(false);
  });

  it('needs BOTH the card catalog flag and its own flag', () => {
    expect(isTcgplayerSyncEnabled(ON)).toBe(true);
    expect(isTcgplayerSyncEnabled({ CARD_TCGPLAYER_SYNC_ENABLED: 'true' })).toBe(false);
    expect(isTcgplayerSyncEnabled({ CARD_CATALOG_ENABLED: 'true' })).toBe(false);
    expect(isTcgplayerSyncEnabled({ CARD_CATALOG_ENABLED: 'true', CARD_TCGPLAYER_SYNC_ENABLED: 'false' })).toBe(false);
  });

  it.each(['true', 'TRUE', '1', 'yes', 'on', ' on '])('accepts %j as on', (v) => {
    expect(isTcgplayerSyncEnabled({ CARD_CATALOG_ENABLED: 'true', CARD_TCGPLAYER_SYNC_ENABLED: v })).toBe(true);
  });

  it.each(['', '0', 'no', 'off', 'maybe'])('treats %j as off', (v) => {
    expect(isTcgplayerSyncEnabled({ CARD_CATALOG_ENABLED: 'true', CARD_TCGPLAYER_SYNC_ENABLED: v })).toBe(false);
  });
});

describe('request parsing', () => {
  it('reads export options and rejects values it does not know', () => {
    expect(parseExportOptions({})).toEqual({});
    expect(parseExportOptions(undefined)).toEqual({});
    expect(parseExportOptions({ includeNew: true, includePrices: 'false', quantityColumn: 'TOTAL' })).toEqual({ includeNew: true, includePrices: false, quantityColumn: 'TOTAL' });
    expect(parseExportOptions({ includeNew: 'maybe' })).toBeNull();
    expect(parseExportOptions({ quantityColumn: 'ANY' })).toBeNull();
  });

  it('reads the reconcile choices', () => {
    expect(parseReconcileParams({})).toEqual({ lastExportUploaded: undefined, firstSync: 'FLAG_ONLY' });
    expect(parseReconcileParams({ lastExportUploaded: 'true', firstSync: 'ADOPT_TCGPLAYER' })).toEqual({ lastExportUploaded: true, firstSync: 'ADOPT_TCGPLAYER' });
    expect(parseReconcileParams({ lastExportUploaded: 'false' })).toEqual({ lastExportUploaded: false, firstSync: 'FLAG_ONLY' });
    expect(parseReconcileParams({ lastExportUploaded: 'sure' })).toBeNull();
    expect(parseReconcileParams({ firstSync: 'GUESS' })).toBeNull();
  });
});

function mockRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    locals: { cardIntakeSale: { id: 'sale-1', organizerId: 'org-1' } },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function handlersFor(db: FakeSyncDb, env: Record<string, string | undefined>) {
  return createCardTcgplayerHandlers({ db, syncDeps: fakeDeps(db), env });
}

describe('handlers with the flags off', () => {
  const db = new FakeSyncDb([fakeItem('a', { stockTotal: 2, card: { tcgplayerQty: 2 } })]);
  const h = handlersFor(db, {});

  it('answer 404 on the writing routes and never call next', () => {
    const res = mockRes();
    const next = jest.fn();
    h.requireEnabled({} as any, res, next);
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ success: false, code: 'FEATURE_DISABLED' });
    expect(next).not.toHaveBeenCalled();
  });

  it('answer enabled:false on status and register-check without reading the database', async () => {
    const before = db.snapshot();
    const res = mockRes();
    await h.status({} as any, res);
    expect(res.body).toEqual({ success: true, data: { enabled: false } });
    const res2 = mockRes();
    await h.registerCheck({ query: { itemIds: 'a' } } as any, res2);
    expect(res2.body).toEqual({ success: true, data: { enabled: false, items: [] } });
    expect(db.snapshot()).toBe(before);
  });
});

describe('handlers with the flags on', () => {
  it('lets the writing routes through', () => {
    const h = handlersFor(new FakeSyncDb(), ON);
    const next = jest.fn();
    h.requireEnabled({} as any, mockRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('status and register-check answer from the sale in res.locals only', async () => {
    const db = new FakeSyncDb([
      fakeItem('a', { stockTotal: 2, card: { tcgplayerQty: 3 } }),
      fakeItem('b', { saleId: 'sale-2', stockTotal: 2, card: { tcgplayerQty: 9 } }),
    ]);
    const h = handlersFor(db, ON);
    const res = mockRes();
    await h.status({} as any, res);
    expect(res.body.data).toMatchObject({ enabled: true, cardsTracked: 1, waitingToSendCount: 1 });

    const res2 = mockRes();
    await h.registerCheck({ query: { itemIds: 'a,b' } } as any, res2);
    expect(res2.body.data.items.map((i: any) => [i.itemId, i.onTcgplayer])).toEqual([
      ['a', true],
      ['b', false],
    ]);
  });

  it('refuses an absurd number of ids in one register check', async () => {
    const h = handlersFor(new FakeSyncDb(), ON);
    const res = mockRes();
    await h.registerCheck({ query: { itemIds: Array.from({ length: 500 }, (_, i) => `i${i}`).join(',') } } as any, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('BAD_PARAMS');
  });

  it('export returns the CSV text and says so when there is nothing to send', async () => {
    const db = new FakeSyncDb([fakeItem('a', { stockTotal: 2, card: { tcgplayerQty: 3 } })]);
    const h = handlersFor(db, ON);
    const res = mockRes();
    await h.export({ body: {} } as any, res);
    expect(res.body.data).toMatchObject({ fileName: 'tcgplayer-update-2026-10-05.csv', rowCount: 1 });
    expect(res.body.data.csv.split('\n')[1]).toContain(',-1');
    expect(db.card('a').tcgplayerPendingQty).toBe(2);

    const none = handlersFor(new FakeSyncDb([fakeItem('a', { stockTotal: 2, card: { tcgplayerQty: 2 } })]), ON);
    const res2 = mockRes();
    await none.export({ body: {} } as any, res2);
    expect(res2.body.data).toMatchObject({ rowCount: 0, csv: null });
  });

  it('export rejects options it does not understand', async () => {
    const h = handlersFor(new FakeSyncDb(), ON);
    const res = mockRes();
    await h.export({ body: { quantityColumn: 'BOTH' } } as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('mark uploaded answers 409 when no export is waiting, then moves the baseline when one is', async () => {
    const db = new FakeSyncDb([fakeItem('a', { stockTotal: 2, card: { tcgplayerQty: 3 } })]);
    const h = handlersFor(db, ON);
    const res = mockRes();
    await h.exportUploaded({} as any, res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('NO_PENDING_EXPORT');

    await h.export({ body: {} } as any, mockRes());
    const res2 = mockRes();
    await h.exportUploaded({} as any, res2);
    expect(res2.body).toEqual({ success: true, data: { marked: 1 } });
    expect(db.card('a').tcgplayerQty).toBe(2);
  });
});

describe('reconcile handlers (real temp files)', () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcg-handler-'));
  });
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const HEAD = 'TCGplayer Id,Product Line,Set Name,Product Name,Number,Rarity,Condition,Total Quantity';
  const fileOf = (name: string, text: string) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, text, 'utf8');
    return { path: p };
  };

  it('preview shows the change, writes nothing, and always deletes the upload', async () => {
    const db = new FakeSyncDb([fakeItem('a', { stockTotal: 5, card: { tcgplayerQty: 5 } })]);
    const before = db.snapshot();
    const h = handlersFor(db, ON);
    const file = fileOf('p1.csv', `${HEAD}\n1001,Magic,Alpha,Lightning Bolt,161,Common,Near Mint,3\n`);
    const res = mockRes();
    await h.reconcilePreview({ file, body: {} } as any, res);
    expect(res.body.data).toMatchObject({ applied: false, exportWaiting: false, totals: { decreased: 1, unitsRemoved: 2 } });
    expect(db.snapshot()).toBe(before);
    expect(fs.existsSync(file.path)).toBe(false);
  });

  it('apply changes stock and deletes the upload', async () => {
    const db = new FakeSyncDb([fakeItem('a', { stockTotal: 5, card: { tcgplayerQty: 5 } })]);
    const h = handlersFor(db, ON);
    const file = fileOf('a1.csv', `${HEAD}\n1001,Magic,Alpha,Lightning Bolt,161,Common,Near Mint,3\n`);
    const res = mockRes();
    await h.reconcileApply({ file, body: {} } as any, res);
    expect(res.body.data.applied).toBe(true);
    expect(db.find('a').stockSold).toBe(2);
    expect(fs.existsSync(file.path)).toBe(false);
  });

  it('asks whether the last export was uploaded when one is waiting, and does not touch the database before the answer', async () => {
    const db = new FakeSyncDb([fakeItem('a', { stockTotal: 3, card: { tcgplayerQty: 5, tcgplayerPendingQty: 3 } })]);
    const before = db.snapshot();
    const h = handlersFor(db, ON);
    const file = fileOf('w1.csv', `${HEAD}\n1001,Magic,Alpha,Lightning Bolt,161,Common,Near Mint,3\n`);
    const res = mockRes();
    await h.reconcileApply({ file, body: {} } as any, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('UPLOAD_ANSWER_REQUIRED');
    expect(db.snapshot()).toBe(before);
    expect(fs.existsSync(file.path)).toBe(false);

    const file2 = fileOf('w2.csv', `${HEAD}\n1001,Magic,Alpha,Lightning Bolt,161,Common,Near Mint,3\n`);
    const res2 = mockRes();
    await h.reconcileApply({ file: file2, body: { lastExportUploaded: 'true' } } as any, res2);
    expect(res2.body.data.totals.decreased).toBe(0);
    expect(db.find('a').stockSold).toBe(0);
    expect(db.card('a')).toMatchObject({ tcgplayerQty: 3, tcgplayerPendingQty: null });
  });

  it('answers 400 for a file that is not a TCGplayer export, and for a missing file', async () => {
    const h = handlersFor(new FakeSyncDb(), ON);
    const file = fileOf('x.csv', 'Name,Qty\nBolt,1\n');
    const res = mockRes();
    await h.reconcilePreview({ file, body: {} } as any, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('NOT_A_TCGPLAYER_FILE');
    expect(fs.existsSync(file.path)).toBe(false);

    const res2 = mockRes();
    await h.reconcilePreview({ body: {} } as any, res2);
    expect(res2.statusCode).toBe(400);
    expect(res2.body.code).toBe('NO_FILE');
  });

  it('answers 400 for choices it does not understand', async () => {
    const h = handlersFor(new FakeSyncDb(), ON);
    const file = fileOf('y.csv', `${HEAD}\n1001,Magic,Alpha,Lightning Bolt,161,Common,Near Mint,3\n`);
    const res = mockRes();
    await h.reconcilePreview({ file, body: { firstSync: 'GUESS' } } as any, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('BAD_PARAMS');
    expect(fs.existsSync(file.path)).toBe(false);
  });
});

describe('copy rules', () => {
  const messages = allTcgplayerMessages();

  it('has a plausible number of messages', () => {
    expect(messages.length).toBeGreaterThan(25);
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

  it('tells the shop plainly that eBay orders between $20 and $30 are tracked', () => {
    expect(messages.some((m) => m.includes('eBay orders between $20 and $30 will be tracked'))).toBe(true);
  });

  it('no source file of this feature has an em dash, an en dash or a forbidden word', () => {
    for (const file of OWN_FILES) {
      const text = fs.readFileSync(file, 'utf8');
      expect(text).not.toMatch(/[—–]/);
      expect(text).not.toMatch(/estate sale/i);
      expect(text).not.toMatch(/\bAI\b/);
      expect(text.includes('\u0000')).toBe(false);
    }
  });
});

describe('isolation and wiring', () => {
  it('only wiring.ts imports Prisma, and nothing here reaches a paid or third party service', () => {
    for (const file of OWN_FILES) {
      const text = fs.readFileSync(file, 'utf8');
      const importsPrisma = /from '\.\.\/(\.\.\/)?lib\/prisma'/.test(text);
      expect(importsPrisma).toBe(path.basename(file) === 'wiring.ts');
      expect(text).not.toMatch(/cloudAIService|@anthropic-ai|@google-cloud\/vision|\baxios\b|\bfetch\(|stripe/i);
    }
  });

  it('never touches Purchase or payments', () => {
    for (const file of OWN_FILES) {
      const text = fs.readFileSync(file, 'utf8');
      expect(text).not.toMatch(/prisma\.purchase|\.purchase\.|commitItemSale|paymentIntent/i);
    }
  });

  it('every route requires a logged in organizer and a sale the caller owns', () => {
    const src = read('routes/cardTcgplayer.ts');
    const routeCalls = src.match(/router\.(get|post)\(/g) ?? [];
    expect(routeCalls).toHaveLength(6);
    expect((src.match(/authenticate,\s*requireOrganizer,/g) ?? []).length).toBe(6);
    expect((src.match(/cardIntakeHandlers\.authorizeSale/g) ?? []).length).toBe(6);
    // the writing routes check the flags before the sale lookup and before any upload is accepted
    expect((src.match(/handlers\.requireEnabled/g) ?? []).length).toBe(4);
    expect(src).not.toMatch(/import .*requireTier/);
  });

  it('is mounted once in index.ts with route level timeouts, and the global timeout skips the reconcile routes', () => {
    const index = read('index.ts');
    expect(index).toContain("import cardTcgplayerRoutes from './routes/cardTcgplayer';");
    expect(index.split("app.use('/api/card-tcgplayer', cardTcgplayerRoutes);").length - 1).toBe(1);
    expect(index).toContain("app.post('/api/card-tcgplayer/:saleId/reconcile/preview', requestTimeout(180000));");
    expect(index).toContain("app.post('/api/card-tcgplayer/:saleId/reconcile/apply', requestTimeout(180000));");
    expect(read('middleware/requestTimeout.ts')).toContain('/^\\/api\\/card-tcgplayer\\/[^/]+\\/reconcile\\/(preview|apply)$/.test(req.path)');
  });

  it('adds nothing to the card intake: its files do not mention the round trip', () => {
    for (const file of listTs(path.join(SRC, 'services', 'cardIntake'))) {
      expect(fs.readFileSync(file, 'utf8')).not.toMatch(/cardTcgplayer|tcgplayerQty|tcgplayerPendingQty/);
    }
  });
});
