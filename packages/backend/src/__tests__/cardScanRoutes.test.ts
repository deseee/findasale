/**
 * /api/card-scan routes and controller (ADR-138 batch B5; acceptance AT-10 to AT-12 at HTTP level, AT-21 sequencing
 * half, AT-23, AT-24, AT-25). The router is mounted on a test Express app with fakes injected into the controller
 * factory: auth is stubbed (x-test-user header), the scan database and catalog are the in-memory harness from
 * cardScanFakes, the recognition provider is a jest function, the Smart tag allowance is a counter, and the scan cost
 * guard is the REAL guard over an in-memory store (so tag and cost sequencing are both observable). Real multer
 * uploads over real HTTP are exercised. No database, no network, no paid service.
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import type { AddressInfo } from 'net';
import { closeReservation, createScanCostGuard, DEFAULT_FRAME_COST_ESTIMATE_USD } from '../services/cardScan/recognition/scanCostGuard';
import { SCAN_API_MESSAGES, SCAN_STATUS_MESSAGES } from '../services/cardScan/messages';
import {
  BOLTS,
  MOX,
  ORGANIZER_ID,
  OTHER_ORGANIZER_ID,
  OTHER_SALE_ID,
  READY_STATE,
  SALE_ID,
  USER_ID,
  makeScanHarness,
  observation,
} from './__fixtures__/cardScanFakes';

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
jest.mock('../middleware/rateLimitShared', () => ({
  createRateLimitStore: () => new (jest.requireActual('express-rate-limit').MemoryStore)(),
}));

// Required AFTER the mocks above.
const { createCardScanRouter } = require('../routes/cardScan');
const { createCardScanHandlers, sniffImageType } = require('../controllers/cardScanController');

const OTHER_USER_ID = 'user_scan_2';
const NO_PROFILE_USER_ID = 'user_without_organizer_row';

const organizerUser = { id: USER_ID, roles: ['ORGANIZER'] };
const otherOrganizerUser = { id: OTHER_USER_ID, roles: ['ORGANIZER'] };
const noProfileUser = { id: NO_PROFILE_USER_ID, roles: ['ORGANIZER'] };
const shopperUser = { id: 'user_shopper', roles: ['USER'] };

interface Rig {
  server: any;
  baseUrl: string;
  harness: ReturnType<typeof makeScanHarness>;
  env: Record<string, string | undefined>;
  tags: { used: number; limit: number; refunds: number };
  provider: { recognize: jest.Mock; available: boolean; outcome: any };
  guard: ReturnType<typeof createScanCostGuard>;
  recorded: Array<{ service: string; costUsd: number }>;
}

const rigs: Rig[] = [];

const GOOD_OUTCOME = {
  ok: true,
  observation: observation({ cardName: 'Lightning Bolt', setCode: 'lea', collectorNumber: '161' }),
  usage: { costUsd: 0.002 },
};

function startRig(envOver: Record<string, string | undefined> = {}, tagLimit = 100): Rig {
  const env: Record<string, string | undefined> = { CARD_SCAN_ENABLED: 'true', ...envOver };
  const harness = makeScanHarness({ env });
  const tags = { used: 0, limit: tagLimit, refunds: 0 };
  const provider: Rig['provider'] = {
    available: true,
    outcome: GOOD_OUTCOME as any,
    recognize: jest.fn(async () => provider.outcome),
  };
  const store = new Map<string, string>();
  const recorded: Array<{ service: string; costUsd: number }> = [];
  const guard = createScanCostGuard({
    store: {
      get: async (key: string) => store.get(key) ?? null,
      setex: async (key: string, _ttl: number, value: string) => {
        store.set(key, value);
      },
    },
    isSharedCostCeilingExceeded: async () => false,
    isSharedDailyCallCapAvailable: async () => true,
    recordUsage: async (service: string, costUsd: number) => {
      recorded.push({ service, costUsd });
    },
    env: () => env,
  });
  const users: Record<string, { id: string; subscriptionTier: string | null }> = {
    [USER_ID]: { id: ORGANIZER_ID, subscriptionTier: 'PRO' },
    [OTHER_USER_ID]: { id: OTHER_ORGANIZER_ID, subscriptionTier: 'PRO' },
  };
  const handlers = createCardScanHandlers({
    scan: harness.deps,
    getOrganizer: async (userId: string) => users[userId] ?? null,
    tags: {
      reserve: async () => {
        if (tags.used >= tags.limit) return { ok: false };
        tags.used += 1;
        return { ok: true };
      },
      refund: async () => {
        tags.refunds += 1;
        tags.used = Math.max(0, tags.used - 1);
        return 1;
      },
      remaining: async () => Math.max(0, tags.limit - tags.used),
    },
    recognition: {
      getProvider: () => ({ id: 'haiku-card', isAvailable: () => provider.available, recognize: provider.recognize }),
      getStatus: () => ({ providerId: 'haiku-card', mode: 'HAIKU_ONLY', providerReady: provider.available }),
      getCostGuard: () => guard,
      closeReservation,
      frameCostEstimateUsd: () => DEFAULT_FRAME_COST_ESTIMATE_USD,
    },
  });
  const app = express();
  app.use(express.json());
  app.use('/api/card-scan', createCardScanRouter(handlers));
  const server = app.listen(0);
  const rig: Rig = { server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/card-scan`, harness, env, tags, provider, guard, recorded };
  rigs.push(rig);
  return rig;
}

afterEach(() => {
  while (rigs.length > 0) {
    const rig = rigs.pop() as Rig;
    rig.server.closeAllConnections?.();
    rig.server.close();
  }
});

interface CallOpts {
  user?: any;
  json?: unknown;
  form?: FormData;
}

async function call(rig: Rig, method: string, urlPath: string, o: CallOpts = {}): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (o.user) headers['x-test-user'] = JSON.stringify(o.user);
  let body: any;
  if (o.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(o.json);
  } else if (o.form) {
    body = o.form;
  }
  const res = await fetch(`${rig.baseUrl}${urlPath}`, { method, headers, body });
  let parsed: any = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
}

/** Bytes that start like a JPEG; the tail makes each picture different. */
function jpegBytes(tag: number, size = 400): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xe0;
  for (let i = 4; i < size; i += 1) bytes[i] = (tag * 31 + i) % 251;
  return bytes;
}

function frameForm(o: { bytes?: Uint8Array | null; clientEntryId?: string | null; placementId?: string; gameHint?: string; source?: string; field?: string } = {}): FormData {
  const fd = new FormData();
  if (o.clientEntryId !== null) fd.append('clientEntryId', o.clientEntryId ?? 'client-1');
  if (o.placementId) fd.append('placementId', o.placementId);
  if (o.gameHint) fd.append('gameHint', o.gameHint);
  if (o.source) fd.append('source', o.source);
  if (o.bytes !== null) fd.append(o.field ?? 'frame', new Blob([(o.bytes ?? jpegBytes(1)) as any], { type: 'image/jpeg' }), 'card.jpg');
  return fd;
}

async function openSession(rig: Rig, user: any = organizerUser, saleId: string = SALE_ID, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await call(rig, 'POST', '/sessions', { user, json: { saleId, label: 'Binder one', defaultConditionCode: 'NM', ...extra } });
  expect(res.status).toBe(200);
  return res.body.data.session.id as string;
}

async function addBolt(rig: Rig, sessionId: string, clientEntryId: string, extra: Record<string, unknown> = {}) {
  const res = await call(rig, 'POST', `/sessions/${sessionId}/entries`, { user: organizerUser, json: { clientEntryId, printingId: BOLTS[0].id, ...extra } });
  expect(res.status).toBe(200);
  return res.body.data.entry;
}

const failure = (res: { status: number; body: any }, status: number, code: string, message?: string) => {
  expect({ status: res.status, success: res.body?.success, code: res.body?.code }).toEqual({ status, success: false, code });
  if (message !== undefined) expect(res.body.error).toBe(message);
};

describe('status', () => {
  it('answers with scanEnabled false when the switch is off, and still reports the limits and the catalog', async () => {
    const rig = startRig({ CARD_SCAN_ENABLED: undefined });
    const res = await call(rig, 'GET', '/status', { user: organizerUser });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      scanEnabled: false,
      providerReady: false,
      providerId: 'haiku-card',
      mode: 'HAIKU_ONLY',
      catalogReady: true,
      readyGames: READY_STATE.readyGames,
      limits: { maxEntries: 2000, maxFrameBytes: 1536 * 1024, dupWindowMs: 3000 },
      smartTags: { remaining: null },
    });
  });

  it('reports a ready provider and the Smart tags left when the switch is on', async () => {
    const rig = startRig({}, 40);
    rig.tags.used = 15;
    const res = await call(rig, 'GET', '/status', { user: organizerUser });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ scanEnabled: true, providerReady: true, providerId: 'haiku-card', smartTags: { remaining: 25 } });
    rig.provider.available = false;
    const noKey = await call(rig, 'GET', '/status', { user: organizerUser });
    expect(noKey.body.data).toMatchObject({ scanEnabled: true, providerReady: false });
  });
});

describe('auth (AT-23)', () => {
  it('anonymous is 401, a non-organizer is 403, an organizer login without an Organizer row is 403', async () => {
    const rig = startRig();
    expect((await call(rig, 'GET', '/status')).status).toBe(401);
    expect((await call(rig, 'POST', '/sessions', { json: { saleId: SALE_ID } })).status).toBe(401);
    expect((await call(rig, 'GET', '/status', { user: shopperUser })).status).toBe(403);
    expect((await call(rig, 'POST', '/sessions', { user: shopperUser, json: { saleId: SALE_ID } })).status).toBe(403);
    failure(await call(rig, 'GET', '/status', { user: noProfileUser }), 403, 'UNAUTHORIZED', SCAN_API_MESSAGES.UNAUTHORIZED);
    failure(await call(rig, 'POST', '/sessions', { user: noProfileUser, json: { saleId: SALE_ID } }), 403, 'UNAUTHORIZED');
    expect(rig.harness.db.scan.counters.sessionCreates).toBe(0);
  });
});

describe('sessions', () => {
  it('creates, lists and reads a session, and takes the owner from the login (never the body)', async () => {
    const rig = startRig();
    const created = await call(rig, 'POST', '/sessions', { user: organizerUser, json: { saleId: SALE_ID, label: 'Binder one', source: 'PHOTO', defaultConditionCode: 'NM' } });
    expect(created.status).toBe(200);
    expect(created.body.data.session).toMatchObject({ saleId: SALE_ID, label: 'Binder one', status: 'OPEN', defaultConditionCode: 'NM', source: 'PHOTO' });
    const sid = created.body.data.session.id;
    expect(rig.harness.scan.sessions.get(sid).organizerId).toBe(ORGANIZER_ID);

    const list = await call(rig, 'GET', `/sessions?saleId=${SALE_ID}`, { user: organizerUser });
    expect(list.status).toBe(200);
    expect(list.body.data.sessions.map((s: any) => s.id)).toEqual([sid]);

    const view = await call(rig, 'GET', `/sessions/${sid}?afterSeq=0&limit=50`, { user: organizerUser });
    expect(view.status).toBe(200);
    expect(view.body.data).toMatchObject({ session: { id: sid }, entries: [], catalogReady: true });
    expect(view.body.data.counts).toMatchObject({ needsReview: 0, ready: 0, committed: 0 });
  });

  it("another organizer's sale is 403 NOT_YOUR_SALE and an unknown sale is 404", async () => {
    const rig = startRig();
    failure(await call(rig, 'POST', '/sessions', { user: organizerUser, json: { saleId: OTHER_SALE_ID } }), 403, 'NOT_YOUR_SALE', SCAN_API_MESSAGES.NOT_YOUR_SALE);
    failure(await call(rig, 'POST', '/sessions', { user: organizerUser, json: { saleId: 'no_such_sale' } }), 404, 'SALE_NOT_FOUND');
    failure(await call(rig, 'GET', `/sessions?saleId=${OTHER_SALE_ID}`, { user: organizerUser }), 403, 'NOT_YOUR_SALE');
    failure(await call(rig, 'GET', '/sessions', { user: organizerUser }), 400, 'BAD_REQUEST', SCAN_API_MESSAGES.BAD_REQUEST);
  });

  it('refuses unknown keys, bad query numbers and the sixth open session on a sale (AT-24)', async () => {
    const rig = startRig();
    failure(await call(rig, 'POST', '/sessions', { user: organizerUser, json: { saleId: SALE_ID, organizerId: OTHER_ORGANIZER_ID } }), 400, 'BAD_REQUEST', SCAN_API_MESSAGES.BAD_REQUEST);
    failure(await call(rig, 'POST', '/sessions', { user: organizerUser, json: { saleId: SALE_ID, defaultConditionCode: 'ZZ' } }), 400, 'BAD_REQUEST');
    const sid = await openSession(rig);
    failure(await call(rig, 'GET', `/sessions/${sid}?afterSeq=-1`, { user: organizerUser }), 400, 'BAD_REQUEST');
    failure(await call(rig, 'GET', `/sessions/${sid}?limit=0`, { user: organizerUser }), 400, 'BAD_REQUEST');
    failure(await call(rig, 'GET', `/sessions/${sid}?afterSeq=abc`, { user: organizerUser }), 400, 'BAD_REQUEST');
    for (let i = 0; i < 4; i += 1) await openSession(rig);
    failure(await call(rig, 'POST', '/sessions', { user: organizerUser, json: { saleId: SALE_ID } }), 409, 'TOO_MANY_OPEN_SESSIONS', SCAN_API_MESSAGES.TOO_MANY_OPEN_SESSIONS);
  });

  it('discard throws the queue away, and a discarded session takes no more changes', async () => {
    const rig = startRig();
    const sid = await openSession(rig);
    const entry = await addBolt(rig, sid, 'c1');
    const discarded = await call(rig, 'POST', `/sessions/${sid}/discard`, { user: organizerUser });
    expect(discarded.status).toBe(200);
    expect(discarded.body).toEqual({ success: true, data: { status: 'DISCARDED' } });
    const list = await call(rig, 'GET', `/sessions?saleId=${SALE_ID}`, { user: organizerUser });
    expect(list.body.data.sessions).toEqual([]);
    failure(await call(rig, 'PATCH', `/sessions/${sid}/entries/${entry.id}`, { user: organizerUser, json: { quantity: 2 } }), 409, 'SESSION_NOT_OPEN', SCAN_API_MESSAGES.SESSION_NOT_OPEN);
    const again = await call(rig, 'POST', `/sessions/${sid}/discard`, { user: organizerUser });
    expect(again.body).toEqual({ success: true, data: { status: 'DISCARDED' } });
    failure(await call(rig, 'POST', '/sessions/no_such_session/discard', { user: organizerUser }), 404, 'SESSION_NOT_FOUND', SCAN_API_MESSAGES.SESSION_NOT_FOUND);
  });
});

describe("one organizer cannot reach another organizer's session (AT-23)", () => {
  it('every session route answers 404 for the other organizer and changes nothing', async () => {
    const rig = startRig();
    const sid = await openSession(rig);
    const entry = await addBolt(rig, sid, 'c1', { quantity: 3 });
    const other = otherOrganizerUser;

    failure(await call(rig, 'GET', `/sessions/${sid}`, { user: other }), 404, 'SESSION_NOT_FOUND', SCAN_API_MESSAGES.SESSION_NOT_FOUND);
    failure(await call(rig, 'POST', `/sessions/${sid}/entries`, { user: other, json: { clientEntryId: 'x1', printingId: BOLTS[0].id } }), 404, 'SESSION_NOT_FOUND');
    failure(await call(rig, 'PATCH', `/sessions/${sid}/entries/${entry.id}`, { user: other, json: { quantity: 9 } }), 404, 'SESSION_NOT_FOUND');
    failure(await call(rig, 'POST', `/sessions/${sid}/entries/bulk`, { user: other, json: { entryIds: [entry.id], action: 'SKIP' } }), 404, 'SESSION_NOT_FOUND');
    failure(await call(rig, 'POST', `/sessions/${sid}/frames`, { user: other, form: frameForm({ clientEntryId: 'f1' }) }), 404, 'SESSION_NOT_FOUND');
    failure(await call(rig, 'POST', `/sessions/${sid}/commit`, { user: other, json: { mode: 'ADD' } }), 404, 'SESSION_NOT_FOUND');
    failure(await call(rig, 'POST', `/sessions/${sid}/discard`, { user: other }), 404, 'SESSION_NOT_FOUND');
    expect(rig.provider.recognize).not.toHaveBeenCalled();
    expect(rig.tags.used).toBe(0);

    // The owner still sees the session open and the entry exactly as it was.
    const view = await call(rig, 'GET', `/sessions/${sid}`, { user: organizerUser });
    expect(view.body.data.session.status).toBe('OPEN');
    expect(view.body.data.entries).toHaveLength(1);
    expect(view.body.data.entries[0].chosen.quantity).toBe(3);
    expect(rig.harness.scan.entriesOf(sid).map((e: any) => e.status)).not.toContain('COMMITTED');
  });

  it("an entry id from another organizer's session is not found in your own session and is never changed", async () => {
    const rig = startRig();
    const mine = await openSession(rig);
    const entry = await addBolt(rig, mine, 'c1', { quantity: 3 });
    const theirs = await openSession(rig, otherOrganizerUser, OTHER_SALE_ID);
    failure(await call(rig, 'PATCH', `/sessions/${theirs}/entries/${entry.id}`, { user: otherOrganizerUser, json: { quantity: 9 } }), 404, 'ENTRY_NOT_FOUND', SCAN_API_MESSAGES.ENTRY_NOT_FOUND);
    const bulk = await call(rig, 'POST', `/sessions/${theirs}/entries/bulk`, { user: otherOrganizerUser, json: { entryIds: [entry.id], action: 'SKIP' } });
    expect(bulk.status).toBe(200);
    expect(bulk.body.data.updated).toBe(0);
    const view = await call(rig, 'GET', `/sessions/${mine}`, { user: organizerUser });
    expect(view.body.data.entries[0]).toMatchObject({ id: entry.id, chosen: { quantity: 3 } });
    expect(view.body.data.entries[0].status).not.toBe('SKIPPED');
  });
});

describe('frames', () => {
  it('a recognized frame is stored, costs one Smart tag, and books one frame in the scan cost pool', async () => {
    const rig = startRig();
    const sid = await openSession(rig);
    const res = await call(rig, 'POST', `/sessions/${sid}/frames`, { user: organizerUser, form: frameForm({ bytes: jpegBytes(1), clientEntryId: 'f1', placementId: 'p-1', gameHint: 'mtg' }) });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ duplicate: null, charged: true });
    expect(res.body.data.entry).toMatchObject({ seq: 1, source: 'PHOTO', read: { name: 'Lightning Bolt', setCode: 'lea', collectorNumber: '161' }, resolution: { status: 'EXACT', printingId: BOLTS[0].id } });
    expect(rig.provider.recognize).toHaveBeenCalledTimes(1);
    const [frameArg, hintArg] = rig.provider.recognize.mock.calls[0];
    expect(frameArg.mimeType).toBe('image/jpeg');
    expect(Buffer.isBuffer(frameArg.buffer)).toBe(true);
    expect(frameArg.buffer.length).toBe(400);
    expect(hintArg).toEqual({ game: 'MTG' });
    expect(rig.tags.used).toBe(1);
    expect(rig.tags.refunds).toBe(0);
    expect((await rig.guard.usage()).framesToday).toBe(1);
    expect(rig.recorded).toEqual([{ service: 'anthropic:card_scan', costUsd: 0.002 }]);
    // The stored row carries the server's own picture hash and the organizer from the login.
    const row = rig.harness.scan.entriesOf(sid)[0];
    expect(row).toMatchObject({ organizerId: ORGANIZER_ID, clientEntryId: 'f1', placementId: 'p-1', providerId: 'haiku-card' });
    expect(row.imageSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a retry, a repeated placement and the same picture return the first entry and cost nothing (AT-10 to AT-12)', async () => {
    const rig = startRig();
    const sid = await openSession(rig);
    const first = await call(rig, 'POST', `/sessions/${sid}/frames`, { user: organizerUser, form: frameForm({ bytes: jpegBytes(1), clientEntryId: 'f1', placementId: 'p-1' }) });
    const entryId = first.body.data.entry.id;

    const retry = await call(rig, 'POST', `/sessions/${sid}/frames`, { user: organizerUser, form: frameForm({ bytes: jpegBytes(1), clientEntryId: 'f1', placementId: 'p-1' }) });
    expect(retry.body.data).toMatchObject({ duplicate: 'SAME_ENTRY', charged: false });
    expect(retry.body.data.entry.id).toBe(entryId);

    const samePlacement = await call(rig, 'POST', `/sessions/${sid}/frames`, { user: organizerUser, form: frameForm({ bytes: jpegBytes(2), clientEntryId: 'f2', placementId: 'p-1' }) });
    expect(samePlacement.body.data).toMatchObject({ duplicate: 'SAME_PLACEMENT', charged: false });
    expect(samePlacement.body.data.entry.id).toBe(entryId);

    const sameImage = await call(rig, 'POST', `/sessions/${sid}/frames`, { user: organizerUser, form: frameForm({ bytes: jpegBytes(1), clientEntryId: 'f3', placementId: 'p-9' }) });
    expect(sameImage.body.data).toMatchObject({ duplicate: 'SAME_IMAGE', charged: false });
    expect(sameImage.body.data.entry.id).toBe(entryId);

    expect(rig.provider.recognize).toHaveBeenCalledTimes(1);
    expect(rig.tags.used).toBe(1);
    expect((await rig.guard.usage()).framesToday).toBe(1);
    expect(rig.harness.scan.entriesOf(sid)).toHaveLength(1);
  });

  it.each([
    ['PROVIDER_ERROR', 'ERROR'],
    ['RATE_LIMIT', 'ERROR'],
  ])('a %s answer refunds the Smart tag and the cost pool frame, and leaves an entry that can be retried', async (code, entryStatus) => {
    const rig = startRig();
    rig.provider.outcome = { ok: false, code, chargeable: false };
    const sid = await openSession(rig);
    const res = await call(rig, 'POST', `/sessions/${sid}/frames`, { user: organizerUser, form: frameForm({ clientEntryId: 'f1' }) });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ charged: false, duplicate: null });
    expect(res.body.data.entry).toMatchObject({ status: entryStatus, errorCode: code });
    expect(rig.tags.used).toBe(0);
    expect(rig.tags.refunds).toBe(1);
    expect((await rig.guard.usage()).framesToday).toBe(0);
    expect(rig.recorded).toEqual([]);
  });

  it('a provider that throws is a not chargeable failure: the tag and the cost pool frame are given back', async () => {
    const rig = startRig();
    rig.provider.recognize.mockRejectedValueOnce(new Error('network down'));
    const sid = await openSession(rig);
    const res = await call(rig, 'POST', `/sessions/${sid}/frames`, { user: organizerUser, form: frameForm({ clientEntryId: 'f1' }) });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ charged: false });
    expect(res.body.data.entry.errorCode).toBe('PROVIDER_ERROR');
    expect(rig.tags.used).toBe(0);
    expect((await rig.guard.usage()).framesToday).toBe(0);
  });

  it('a NO_CARD answer is paid work: the Smart tag and the cost pool frame are kept', async () => {
    const rig = startRig();
    rig.provider.outcome = { ok: false, code: 'NO_CARD', chargeable: true };
    const sid = await openSession(rig);
    const res = await call(rig, 'POST', `/sessions/${sid}/frames`, { user: organizerUser, form: frameForm({ clientEntryId: 'f1' }) });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ charged: true });
    expect(res.body.data.entry).toMatchObject({ status: 'NEEDS_REVIEW', errorCode: 'NO_CARD' });
    expect(rig.tags.used).toBe(1);
    expect(rig.tags.refunds).toBe(0);
    expect((await rig.guard.usage()).framesToday).toBe(1);
    expect(rig.recorded).toHaveLength(1);
  });

  it('the daily scan cap answers 429 SCAN_CAP_REACHED, gives the Smart tag back and never calls the provider again', async () => {
    const rig = startRig({ CARD_SCAN_DAILY_CAP: '1' });
    const sid = await openSession(rig);
    const first = await call(rig, 'POST', `/sessions/${sid}/frames`, { user: organizerUser, form: frameForm({ bytes: jpegBytes(1), clientEntryId: 'f1', placementId: 'p-1' }) });
    expect(first.status).toBe(200);
    const second = await call(rig, 'POST', `/sessions/${sid}/frames`, { user: organizerUser, form: frameForm({ bytes: jpegBytes(2), clientEntryId: 'f2', placementId: 'p-2' }) });
    failure(second, 429, 'SCAN_CAP_REACHED', SCAN_STATUS_MESSAGES.CAP_REACHED);
    expect(rig.provider.recognize).toHaveBeenCalledTimes(1);
    expect(rig.tags.used).toBe(1);
    expect(rig.tags.refunds).toBe(1);
    expect(rig.harness.scan.entriesOf(sid)).toHaveLength(1);
  });

  it('a used up monthly allowance answers 429 AI_QUOTA_EXCEEDED before the cost pool or the provider is touched', async () => {
    const rig = startRig({}, 0);
    const sid = await openSession(rig);
    const res = await call(rig, 'POST', `/sessions/${sid}/frames`, { user: organizerUser, form: frameForm({ clientEntryId: 'f1' }) });
    failure(res, 429, 'AI_QUOTA_EXCEEDED', SCAN_STATUS_MESSAGES.QUOTA_EXCEEDED);
    expect(rig.provider.recognize).not.toHaveBeenCalled();
    expect((await rig.guard.usage()).framesToday).toBe(0);
    expect(rig.harness.scan.entriesOf(sid)).toHaveLength(0);
  });

  it('with the switch off a frame is 503 SCAN_DISABLED, but manual add, edits and commit still work (AT-25)', async () => {
    const rig = startRig({ CARD_SCAN_ENABLED: undefined });
    const sid = await openSession(rig);
    failure(await call(rig, 'POST', `/sessions/${sid}/frames`, { user: organizerUser, form: frameForm({ clientEntryId: 'f1' }) }), 503, 'SCAN_DISABLED', SCAN_STATUS_MESSAGES.DISABLED);
    expect(rig.provider.recognize).not.toHaveBeenCalled();
    expect(rig.tags.used).toBe(0);

    const entry = await addBolt(rig, sid, 'm1');
    expect(entry).toMatchObject({ source: 'MANUAL', status: 'READY' });
    const patched = await call(rig, 'PATCH', `/sessions/${sid}/entries/${entry.id}`, { user: organizerUser, json: { quantity: 2, price: 4.5, ifUpdatedAt: entry.updatedAt } });
    expect(patched.status).toBe(200);
    expect(patched.body.data.entry.chosen).toMatchObject({ quantity: 2, price: 4.5 });
    const committed = await call(rig, 'POST', `/sessions/${sid}/commit`, { user: organizerUser, json: { mode: 'ADD' } });
    expect(committed.status).toBe(200);
    expect(committed.body.data.summary).toEqual({ created: 1, merged: 0, skipped: 0, errors: 0, needsPrice: 0 });
  });

  it('with no provider key ready, a frame is 503 SCAN_DISABLED and nothing is reserved', async () => {
    const rig = startRig();
    rig.provider.available = false;
    const sid = await openSession(rig);
    failure(await call(rig, 'POST', `/sessions/${sid}/frames`, { user: organizerUser, form: frameForm({ clientEntryId: 'f1' }) }), 503, 'SCAN_DISABLED');
    expect(rig.tags.used).toBe(0);
    expect((await rig.guard.usage()).framesToday).toBe(0);
  });

  it('refuses a missing picture, a wrong field name, a file that is not an image, a bad id, a bad game and a bad source (AT-24)', async () => {
    const rig = startRig();
    const sid = await openSession(rig);
    const send = (form: FormData) => call(rig, 'POST', `/sessions/${sid}/frames`, { user: organizerUser, form });

    failure(await send(frameForm({ bytes: null })), 400, 'BAD_FRAME', SCAN_API_MESSAGES.BAD_FRAME);
    failure(await send(frameForm({ field: 'file' })), 400, 'BAD_FRAME');
    failure(await send(frameForm({ bytes: new TextEncoder().encode('not an image at all, only text') })), 400, 'BAD_FRAME');
    failure(await send(frameForm({ clientEntryId: null })), 400, 'BAD_REQUEST', SCAN_API_MESSAGES.BAD_REQUEST);
    failure(await send(frameForm({ clientEntryId: 'has spaces and /slashes' })), 400, 'BAD_REQUEST');
    failure(await send(frameForm({ placementId: 'bad placement!' })), 400, 'BAD_REQUEST');
    failure(await send(frameForm({ gameHint: 'CHECKERS' })), 400, 'BAD_REQUEST');
    failure(await send(frameForm({ source: 'DELVER' })), 400, 'BAD_REQUEST');
    expect(rig.provider.recognize).not.toHaveBeenCalled();
    expect(rig.tags.used).toBe(0);
    expect(rig.harness.scan.entriesOf(sid)).toHaveLength(0);
  });

  it('refuses a picture over the size cap with 413 and accepts PNG and WebP signatures', async () => {
    const rig = startRig({ CARD_SCAN_MAX_FRAME_KB: '1' });
    const sid = await openSession(rig);
    const big = await call(rig, 'POST', `/sessions/${sid}/frames`, { user: organizerUser, form: frameForm({ bytes: jpegBytes(1, 2048), clientEntryId: 'big' }) });
    failure(big, 413, 'FRAME_TOO_LARGE', SCAN_API_MESSAGES.FRAME_TOO_LARGE);
    expect(rig.provider.recognize).not.toHaveBeenCalled();

    const png = new Uint8Array(300);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const webp = new Uint8Array(300);
    webp.set([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
    expect((await call(rig, 'POST', `/sessions/${sid}/frames`, { user: organizerUser, form: frameForm({ bytes: png, clientEntryId: 'png', source: 'upload' }) })).status).toBe(200);
    expect((await call(rig, 'POST', `/sessions/${sid}/frames`, { user: organizerUser, form: frameForm({ bytes: webp, clientEntryId: 'webp' }) })).status).toBe(200);
    expect(rig.provider.recognize.mock.calls.map((c: any[]) => c[0].mimeType)).toEqual(['image/png', 'image/webp']);
    expect(rig.harness.scan.entriesOf(sid).map((e: any) => e.source)).toEqual(['UPLOAD', 'PHOTO']);
  });

  it('a full session is 409 SESSION_FULL for a new frame and spends nothing', async () => {
    const rig = startRig({ CARD_SCAN_MAX_ENTRIES: '1' });
    const sid = await openSession(rig);
    expect((await call(rig, 'POST', `/sessions/${sid}/frames`, { user: organizerUser, form: frameForm({ bytes: jpegBytes(1), clientEntryId: 'f1', placementId: 'p-1' }) })).status).toBe(200);
    failure(await call(rig, 'POST', `/sessions/${sid}/frames`, { user: organizerUser, form: frameForm({ bytes: jpegBytes(2), clientEntryId: 'f2', placementId: 'p-2' }) }), 409, 'SESSION_FULL', SCAN_API_MESSAGES.SESSION_FULL);
    expect(rig.provider.recognize).toHaveBeenCalledTimes(1);
    expect(rig.tags.used).toBe(1);
  });
});

describe('entries', () => {
  it('manual add by catalog pick and by typed details, with a retry returning the same entry', async () => {
    const rig = startRig();
    const sid = await openSession(rig);
    const picked = await addBolt(rig, sid, 'm1');
    expect(picked).toMatchObject({ source: 'MANUAL', chosen: { printingId: BOLTS[0].id, cardName: 'Lightning Bolt' } });
    const again = await addBolt(rig, sid, 'm1');
    expect(again.id).toBe(picked.id);

    const typed = await call(rig, 'POST', `/sessions/${sid}/entries`, { user: organizerUser, json: { clientEntryId: 'm2', game: 'POKEMON', cardName: 'Pikachu', setCode: 'base1', conditionCode: 'LP' } });
    expect(typed.status).toBe(200);
    expect(typed.body.data.entry.chosen).toMatchObject({ game: 'POKEMON', cardName: 'Pikachu', acceptAsTyped: true, printingId: null });
    expect(rig.harness.scan.entriesOf(sid)).toHaveLength(2);
    expect(rig.provider.recognize).not.toHaveBeenCalled();
  });

  it('refuses unknown keys, a missing card, an unknown printing and a full session', async () => {
    const rig = startRig({ CARD_SCAN_MAX_ENTRIES: '1' });
    const sid = await openSession(rig);
    const add = (json: unknown) => call(rig, 'POST', `/sessions/${sid}/entries`, { user: organizerUser, json });
    failure(await add({ clientEntryId: 'a', printingId: BOLTS[0].id, organizerId: OTHER_ORGANIZER_ID }), 400, 'BAD_REQUEST', SCAN_API_MESSAGES.BAD_REQUEST);
    failure(await add({ clientEntryId: 'a', quantity: 'many', printingId: BOLTS[0].id }), 400, 'BAD_REQUEST');
    failure(await add({ clientEntryId: 'a' }), 400, 'CARD_VALIDATION', SCAN_API_MESSAGES.CARD_VALIDATION);
    failure(await add({ clientEntryId: 'a', printingId: 'SCRYFALL:missing' }), 404, 'CARD_NOT_FOUND', SCAN_API_MESSAGES.CARD_NOT_FOUND);
    expect((await add({ clientEntryId: 'a', printingId: BOLTS[0].id })).status).toBe(200);
    failure(await add({ clientEntryId: 'b', printingId: MOX.id }), 409, 'SESSION_FULL');
  });

  it('patch applies a decision, answers ENTRY_CHANGED with the latest entry for a stale ifUpdatedAt, and refuses unknown keys', async () => {
    const rig = startRig();
    const sid = await openSession(rig);
    const entry = await addBolt(rig, sid, 'c1');
    const patch = (json: unknown) => call(rig, 'PATCH', `/sessions/${sid}/entries/${entry.id}`, { user: organizerUser, json });

    const ok = await patch({ conditionCode: 'LP', quantity: 4, ifUpdatedAt: entry.updatedAt });
    expect(ok.status).toBe(200);
    expect(ok.body.data.entry.chosen).toMatchObject({ conditionCode: 'LP', quantity: 4 });

    const stale = await patch({ quantity: 5, ifUpdatedAt: entry.updatedAt });
    failure(stale, 409, 'ENTRY_CHANGED', SCAN_API_MESSAGES.ENTRY_CHANGED);
    expect(stale.body.entry.chosen.quantity).toBe(4);

    failure(await patch({ status: 'READY' }), 400, 'BAD_REQUEST');
    failure(await patch({ conditionCode: 'ZZ' }), 400, 'CARD_VALIDATION');
    failure(await call(rig, 'PATCH', `/sessions/${sid}/entries/no_such_entry`, { user: organizerUser, json: { quantity: 2 } }), 404, 'ENTRY_NOT_FOUND');
  });

  it('bulk acts on many entries, and refuses more than 200 ids, an empty list, unknown keys and an unknown action (AT-24)', async () => {
    const rig = startRig();
    const sid = await openSession(rig);
    const a = await addBolt(rig, sid, 'c1');
    const b = await call(rig, 'POST', `/sessions/${sid}/entries`, { user: organizerUser, json: { clientEntryId: 'c2', printingId: MOX.id } });
    const bulk = (json: unknown) => call(rig, 'POST', `/sessions/${sid}/entries/bulk`, { user: organizerUser, json });

    const skipped = await bulk({ entryIds: [a.id, b.body.data.entry.id], action: 'SKIP' });
    expect(skipped.status).toBe(200);
    expect(skipped.body.data).toEqual({ updated: 2, ignored: 0 });
    const view = await call(rig, 'GET', `/sessions/${sid}`, { user: organizerUser });
    expect(view.body.data.counts.skipped).toBe(2);

    const ids = Array.from({ length: 201 }, (_, i) => `id_${i}`);
    failure(await bulk({ entryIds: ids, action: 'SKIP' }), 400, 'BAD_REQUEST', SCAN_API_MESSAGES.BAD_REQUEST);
    failure(await bulk({ entryIds: [], action: 'SKIP' }), 400, 'BAD_REQUEST');
    failure(await bulk({ entryIds: [a.id], action: 'SKIP', extra: 1 }), 400, 'BAD_REQUEST');
    failure(await bulk({ entryIds: [a.id], action: 'EXPLODE' }), 400, 'BAD_REQUEST');
    failure(await bulk({ entryIds: [a.id], action: 'SET_CONDITION' }), 400, 'CARD_VALIDATION');
  });
});

describe('commit', () => {
  it('passes the shared commit summary, the entries that were not ready, and the batch id through', async () => {
    const rig = startRig();
    const sid = await openSession(rig);
    const ready = await addBolt(rig, sid, 'c1', { quantity: 2 });
    // Two finishes and no finish chosen: this card still needs a decision, so it is reported and not written.
    const undecided = await call(rig, 'POST', `/sessions/${sid}/entries`, { user: organizerUser, json: { clientEntryId: 'c2', printingId: BOLTS[1].id } });
    expect(undecided.body.data.entry.status).toBe('NEEDS_REVIEW');

    const res = await call(rig, 'POST', `/sessions/${sid}/commit`, { user: organizerUser, json: { mode: 'ADD' } });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ status: 'COMPLETED', summary: { created: 1, merged: 0, skipped: 0, errors: 0, needsPrice: 1 }, failed: [] });
    expect(typeof res.body.data.batchId).toBe('string');
    expect(res.body.data.notCommitted).toEqual([{ entryId: undecided.body.data.entry.id, reason: 'FINISH' }]);

    const items: any[] = Array.from(rig.harness.db.state.items.values());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ saleId: SALE_ID, organizerId: ORGANIZER_ID, stockTotal: 2 });
    const view = await call(rig, 'GET', `/sessions/${sid}`, { user: organizerUser });
    expect(view.body.data.entries.find((e: any) => e.id === ready.id).status).toBe('COMMITTED');
  });

  it('needs a mode (no default), and a second commit of the same cards is 409 ALREADY_APPLIED with the first summary', async () => {
    const rig = startRig();
    const sid = await openSession(rig);
    await addBolt(rig, sid, 'c1');
    failure(await call(rig, 'POST', `/sessions/${sid}/commit`, { user: organizerUser, json: {} }), 400, 'MODE_REQUIRED', SCAN_API_MESSAGES.MODE_REQUIRED);
    failure(await call(rig, 'POST', `/sessions/${sid}/commit`, { user: organizerUser, json: { mode: 'MERGE' } }), 400, 'MODE_REQUIRED');
    failure(await call(rig, 'POST', `/sessions/${sid}/commit`, { user: organizerUser, json: { mode: 'ADD', surprise: true } }), 400, 'BAD_REQUEST');
    expect(rig.harness.db.state.items.size).toBe(0);

    expect((await call(rig, 'POST', `/sessions/${sid}/commit`, { user: organizerUser, json: { mode: 'ADD' } })).status).toBe(200);
    const again = await call(rig, 'POST', `/sessions/${sid}/commit`, { user: organizerUser, json: { mode: 'ADD' } });
    failure(again, 409, 'ALREADY_APPLIED', SCAN_API_MESSAGES.ALREADY_APPLIED);
    expect(again.body.summary).toMatchObject({ created: 1 });
    expect(rig.harness.db.state.items.size).toBe(1);
  });

  it('a session with nothing ready is 409 NOTHING_READY', async () => {
    const rig = startRig();
    const sid = await openSession(rig);
    failure(await call(rig, 'POST', `/sessions/${sid}/commit`, { user: organizerUser, json: { mode: 'REPLACE' } }), 409, 'NOTHING_READY', SCAN_API_MESSAGES.NOTHING_READY);
  });
});

describe('sniffImageType', () => {
  it('recognizes JPEG, PNG and WebP by their first bytes and nothing else', () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe1]))).toBe('image/jpeg');
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(sniffImageType(Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]))).toBe('image/webp');
    expect(sniffImageType(Buffer.from('GIF89a'))).toBeNull();
    expect(sniffImageType(Buffer.from('RIFF\u0000\u0000\u0000\u0000WAVE'))).toBeNull();
    expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe('copy and hygiene (AT-26 for the HTTP layer)', () => {
  const files = ['../controllers/cardScanController.ts', '../routes/cardScan.ts', './cardScanRoutes.test.ts'];
  const dashes = new RegExp('[\\u2014\\u2013]');
  // Built from pieces so this file does not contain the words it checks for.
  const bannedAbbreviation = new RegExp('\\bA' + 'I\\b');
  const bannedPhrase = new RegExp('estate' + ' sale', 'i');

  it.each(files)('%s has no em dash, no en dash and none of the banned wording', (rel) => {
    const text = fs.readFileSync(path.join(__dirname, rel), 'utf8');
    expect(dashes.test(text)).toBe(false);
    expect(bannedAbbreviation.test(text)).toBe(false);
    expect(bannedPhrase.test(text)).toBe(false);
    expect(/[^\x00-\x7f]/.test(text)).toBe(false);
  });

  it('every sentence the HTTP layer sends comes from the scan messages module', () => {
    const text = fs.readFileSync(path.join(__dirname, '../controllers/cardScanController.ts'), 'utf8');
    // No error text is written inline: failures are built with apiFail(code) or the status messages.
    expect(/error:\s*['"`]/.test(text)).toBe(false);
    expect(/message:\s*['"`]/.test(text)).toBe(false);
  });
});
