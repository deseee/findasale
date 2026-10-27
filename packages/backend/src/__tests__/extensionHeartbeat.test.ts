/**
 * Extension heartbeat (2026-10-26). Live: Chrome's finda.sale session expired, every extension poll failed with
 * not_signed_in on the extension side, and nothing posted or said so for a day. A successful GET /extension/autolist-queue
 * is now the extension's heartbeat (one ExtensionRuntimeLog row per organizer, source AUTOQUEUE_HEARTBEAT, updated in
 * place, no schema change), the auto queue settings response says when it last checked in and which items it holds
 * back from Poshmark as flagged, and an hourly job sends one in-app notification per 24h+ silence.
 * Mocked Prisma, synthetic data, no network.
 */
import fs from 'fs';
import path from 'path';

const mockLogFindFirst = jest.fn();
const mockLogFindMany = jest.fn();
const mockLogUpdate = jest.fn();
const mockLogCreate = jest.fn();
const mockOrganizerFindMany = jest.fn();
const mockItemFindMany = jest.fn();
const mockJobFindMany = jest.fn();
const mockCreateNotification = jest.fn();

jest.mock('../lib/prisma', () => ({
  prisma: {
    extensionRuntimeLog: {
      findFirst: (...a: unknown[]) => mockLogFindFirst(...a),
      findMany: (...a: unknown[]) => mockLogFindMany(...a),
      update: (...a: unknown[]) => mockLogUpdate(...a),
      create: (...a: unknown[]) => mockLogCreate(...a),
    },
    organizer: { findMany: (...a: unknown[]) => mockOrganizerFindMany(...a) },
    item: { findMany: (...a: unknown[]) => mockItemFindMany(...a) },
    marketplaceListingJob: { findMany: (...a: unknown[]) => mockJobFindMany(...a) },
  },
}));
jest.mock('../lib/notificationService', () => ({ createNotification: (...a: unknown[]) => mockCreateNotification(...a) }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: (_o: unknown, fn: unknown) => fn }));
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: jest.fn() } }));

import {
  parseHeldParam, parseVersionParam, heartbeatStatus, shouldAlertHeartbeat,
  recordExtensionHeartbeat, loadExtensionHeartbeat, mergeHeartbeatContext, heldStillUnlisted, HEARTBEAT_SOURCE, HEARTBEAT_STALE_MS,
  parseIdListParam, isHoldEligibleItem, staleFlagHoldIds, addReleasesToContext, addHeldReleases, RELEASE_TTL_MS,
  recordExtensionPoll, parseReleaseHoldsBody,
} from '../services/extensionHeartbeat';
import { runExtensionHeartbeatAlert, EXTENSION_SILENT_TITLE, EXTENSION_SILENT_BODY, EXTENSION_SILENT_LINK } from '../jobs/extensionHeartbeatAlertJob';

const H = 3600 * 1000;
const NOW = Date.parse('2026-10-26T12:00:00Z');
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

beforeEach(() => {
  [mockLogFindFirst, mockLogFindMany, mockLogUpdate, mockLogCreate, mockOrganizerFindMany, mockCreateNotification, mockItemFindMany, mockJobFindMany].forEach((m) => m.mockReset());
});

describe('pure helpers', () => {
  it('parses held items strictly: valid ids, known kinds, sane times, de-duplicated', () => {
    const raw = `cmo3etb6i003hjqsue02qim86~oversized~${NOW - 1000},bad~x~1,cmo3etb6i003hjqsue02qim86~prohibited~5,abcdefgh12~prohibited~${NOW + 10 * H},abcdefgh13~prohibited~${NOW - H}`;
    expect(parseHeldParam(raw, NOW)).toEqual([
      { itemId: 'cmo3etb6i003hjqsue02qim86', kind: 'oversized', at: new Date(NOW - 1000).toISOString() },
      { itemId: 'abcdefgh13', kind: 'prohibited', at: new Date(NOW - H).toISOString() },
    ]);
    expect(parseHeldParam(undefined, NOW)).toEqual([]);
    expect(parseHeldParam(['a'], NOW)).toEqual([]);
  });

  it('caps held items at 50', () => {
    const raw = Array.from({ length: 80 }, (_, i) => `item${String(i).padStart(6, '0')}~oversized~${NOW - 1000}`).join(',');
    expect(parseHeldParam(raw, NOW)).toHaveLength(50);
  });

  it('accepts only a dotted version', () => {
    expect(parseVersionParam('1.0.65')).toBe('1.0.65');
    expect(parseVersionParam('<script>')).toBeNull();
  });

  it('stale only when auto queue is on and the last poll is older than 24h (or never)', () => {
    expect(HEARTBEAT_STALE_MS).toBe(24 * H);
    expect(heartbeatStatus(new Date(NOW - 25 * H), true, NOW)).toEqual({ stale: true, neverSeen: false });
    expect(heartbeatStatus(new Date(NOW - 23 * H), true, NOW)).toEqual({ stale: false, neverSeen: false });
    expect(heartbeatStatus(null, true, NOW)).toEqual({ stale: true, neverSeen: true });
    expect(heartbeatStatus(new Date(NOW - 99 * H), false, NOW).stale).toBe(false);
  });

  it('alerts once per silence, never for an extension that never checked in', () => {
    const last = new Date(NOW - 25 * H);
    expect(shouldAlertHeartbeat({ lastPollAt: last, alertedAt: null }, true, NOW)).toBe(true);
    expect(shouldAlertHeartbeat({ lastPollAt: last, alertedAt: new Date(NOW - H) }, true, NOW)).toBe(false);
    expect(shouldAlertHeartbeat({ lastPollAt: last, alertedAt: new Date(NOW - 30 * H) }, true, NOW)).toBe(true);
    expect(shouldAlertHeartbeat({ lastPollAt: null, alertedAt: null }, true, NOW)).toBe(false);
    expect(shouldAlertHeartbeat({ lastPollAt: last, alertedAt: null }, false, NOW)).toBe(false);
  });
});

describe('record / load', () => {
  it('creates the single heartbeat row the first time, then updates it in place (createdAt = last poll)', async () => {
    mockLogFindFirst.mockResolvedValueOnce(null);
    await recordExtensionHeartbeat('org1', { held: [], version: '1.0.65' });
    expect(mockLogCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ organizerId: 'org1', source: HEARTBEAT_SOURCE, level: 'info' }) });
    mockLogFindFirst.mockResolvedValueOnce({ id: 'row1' });
    await recordExtensionHeartbeat('org1', { held: [], version: '1.0.65' });
    expect(mockLogUpdate).toHaveBeenCalledWith({ where: { id: 'row1' }, data: expect.objectContaining({ createdAt: expect.any(Date) }) });
  });

  it('never throws (a heartbeat must not break the queue response)', async () => {
    mockLogFindFirst.mockRejectedValueOnce(new Error('db down'));
    await expect(recordExtensionHeartbeat('org1', { held: [], version: '1.0.66' })).resolves.toEqual([]);
    mockLogFindFirst.mockRejectedValueOnce(new Error('db down'));
    await expect(loadExtensionHeartbeat('org1')).resolves.toEqual({ lastPollAt: null, held: [], alertedAt: null, version: null, release: [] });
  });

  it('2026-10-26 retest: a poll without an extension version (e.g. a cookie GET from the web) records nothing', async () => {
    await recordExtensionHeartbeat('org1', { held: [], version: null });
    expect(mockLogFindFirst).not.toHaveBeenCalled();
    expect(mockLogUpdate).not.toHaveBeenCalled();
    expect(mockLogCreate).not.toHaveBeenCalled();
  });

  it('an extension poll merges into the existing context: held + v updated, alertedAt cleared, other keys kept', async () => {
    const held = [{ itemId: 'abcdefgh12', kind: 'oversized' as const, at: new Date(NOW).toISOString() }];
    mockLogFindFirst.mockResolvedValueOnce({ id: 'row1', context: { v: '1.0.64', held: [], alertedAt: new Date(NOW - H).toISOString(), note: 'keep' } });
    await recordExtensionHeartbeat('org1', { held, version: '1.0.66' });
    expect(mockLogUpdate.mock.calls[0][0].data.context).toEqual({ v: '1.0.66', held, note: 'keep' });
  });

  it('mergeHeartbeatContext tolerates a missing or non-object context', () => {
    expect(mergeHeartbeatContext(null, { held: [], version: '1.0.66' })).toEqual({ held: [], v: '1.0.66' });
    expect(mergeHeartbeatContext(['x'], { held: [], version: '1.0.66' })).toEqual({ held: [], v: '1.0.66' });
  });

  it('only reads its own organizer and source', async () => {
    mockLogFindFirst.mockResolvedValueOnce({ createdAt: new Date(NOW), context: { v: '1.0.65', held: [{ itemId: 'abcdefgh12', kind: 'oversized', at: 'x' }, { bogus: 1 }] } });
    const r = await loadExtensionHeartbeat('org1');
    expect(mockLogFindFirst.mock.calls[0][0].where).toEqual({ organizerId: 'org1', source: HEARTBEAT_SOURCE });
    expect(r.held).toEqual([{ itemId: 'abcdefgh12', kind: 'oversized', at: 'x' }]);
    expect(r.version).toBe('1.0.65');
  });
});

describe('held list', () => {
  const held = [
    { itemId: 'cmuqxmtnv076zsm41yeq1u3pe', kind: 'prohibited' as const, at: '2026-10-22T12:25:22.420Z' },
    { itemId: 'cmtk2knjk0egs3bwwrde12qwr', kind: 'oversized' as const, at: '2026-10-22T20:03:37.155Z' },
    { itemId: 'cmt3aixuw01l1a4xvg5tgdun1', kind: 'oversized' as const, at: '2026-10-22T20:19:50.240Z' },
  ];
  it('2026-10-26 retest: an item flagged earlier and since listed on Poshmark is no longer shown as held', () => {
    const jobs = [
      { itemId: 'cmuqxmtnv076zsm41yeq1u3pe', action: 'POST', status: 'POSTED', createdAt: new Date('2026-10-22T18:52:37Z') },
      // listed in August, then removed: still unlisted, still held
      { itemId: 'cmt3aixuw01l1a4xvg5tgdun1', action: 'POST', status: 'POSTED', createdAt: new Date('2026-08-29T21:01:04Z') },
      { itemId: 'cmt3aixuw01l1a4xvg5tgdun1', action: 'REMOVE', status: 'REMOVED', createdAt: new Date('2026-09-10T10:00:00Z') },
    ];
    expect(heldStillUnlisted(held, jobs).map((h) => h.itemId)).toEqual(['cmtk2knjk0egs3bwwrde12qwr', 'cmt3aixuw01l1a4xvg5tgdun1']);
  });
  it('2026-10-26: an "edit" hold (Poshmark flagged a price edit on a live listing) is kept even though the item is listed, and parses', () => {
    const NOWMS = Date.now();
    const parsed = parseHeldParam('cmt784rdn01liti46bymoomg8~edit~' + (NOWMS - 1000) + ',abcdefgh12~bogus~' + (NOWMS - 1000), NOWMS);
    expect(parsed.map((p) => [p.itemId, p.kind])).toEqual([['cmt784rdn01liti46bymoomg8', 'edit']]);
    const jobs = [{ itemId: 'cmt784rdn01liti46bymoomg8', action: 'POST', status: 'POSTED', createdAt: new Date('2026-08-31T17:09:03Z') }];
    expect(heldStillUnlisted(parsed, jobs).map((h) => h.itemId)).toEqual(['cmt784rdn01liti46bymoomg8']);
  });
  it('a failed removal (REMOVE/SKIPPED) does not end a listing', () => {
    const jobs = [
      { itemId: 'cmtk2knjk0egs3bwwrde12qwr', action: 'POST', status: 'POSTED', createdAt: new Date('2026-10-23T10:00:00Z') },
      { itemId: 'cmtk2knjk0egs3bwwrde12qwr', action: 'REMOVE', status: 'SKIPPED', createdAt: new Date('2026-10-24T10:00:00Z') },
    ];
    expect(heldStillUnlisted(held, jobs).map((h) => h.itemId)).not.toContain('cmtk2knjk0egs3bwwrde12qwr');
  });
  it('the settings response filters held items through heldStillUnlisted with the item\'s Poshmark jobs', () => {
    const src = read('controllers/extensionController.ts');
    const fn = src.slice(src.indexOf('async function extensionStatusFor'), src.indexOf('async function extensionStatusFor') + 2000);
    expect(fn).toMatch(/platform: 'POSHMARK'/);
    expect(fn).toMatch(/heldFlagged = heldStillUnlisted\(hb\.held, poshJobs, eligibleIds\)/);
  });
});

describe('alert job', () => {
  it('notifies a silent organizer once and marks the silence alerted without moving the last-poll time', async () => {
    mockOrganizerFindMany.mockResolvedValue([{ id: 'org1', userId: 'u1' }, { id: 'org2', userId: 'u2' }, { id: 'org3', userId: 'u3' }]);
    mockLogFindMany.mockResolvedValue([
      { id: 'r1', organizerId: 'org1', createdAt: new Date(NOW - 26 * H), context: { v: '1.0.64' } },
      { id: 'r2', organizerId: 'org2', createdAt: new Date(NOW - 2 * H), context: {} },
      // org3: never polled -> card notice only, no notification
    ]);
    const r = await runExtensionHeartbeatAlert(NOW);
    expect(r).toEqual({ candidates: 1, notified: 1 });
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', title: EXTENSION_SILENT_TITLE, link: EXTENSION_SILENT_LINK }));
    const upd = mockLogUpdate.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'r1' });
    expect(upd.data.createdAt).toBeUndefined();
    expect(upd.data.context).toEqual({ v: '1.0.64', alertedAt: new Date(NOW).toISOString() });
    // the organizer query only asks for organizers with an auto queue switch on
    const where = mockOrganizerFindMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(expect.arrayContaining([{ mercariAutoListEnabled: true }, { poshmarkAutoListEnabled: true }]));
  });

  it('respects the recipient fuse', async () => {
    process.env.EXTENSION_HEARTBEAT_ALERT_MAX_RECIPIENTS = '1';
    mockOrganizerFindMany.mockResolvedValue([{ id: 'a', userId: 'ua' }, { id: 'b', userId: 'ub' }]);
    mockLogFindMany.mockResolvedValue([
      { id: 'ra', organizerId: 'a', createdAt: new Date(NOW - 30 * H), context: {} },
      { id: 'rb', organizerId: 'b', createdAt: new Date(NOW - 30 * H), context: {} },
    ]);
    const r = await runExtensionHeartbeatAlert(NOW);
    delete process.env.EXTENSION_HEARTBEAT_ALERT_MAX_RECIPIENTS;
    expect(r.notified).toBe(0);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('copy has no em dashes and no banned words', () => {
    for (const t of [EXTENSION_SILENT_TITLE, EXTENSION_SILENT_BODY]) {
      expect(t).not.toMatch(/—/);
      expect(t).not.toMatch(/\bAI\b|estate sale/i);
    }
  });
});

describe('wiring (source pins)', () => {
  it('getAutolistQueue records the heartbeat before any early return', () => {
    const src = read('controllers/extensionController.ts');
    const start = src.indexOf('export const getAutolistQueue');
    const hb = src.indexOf('await recordExtensionPoll(organizer.id', start);
    const firstEarly = src.indexOf('if (enabledPlatforms.length === 0)', start);
    expect(hb).toBeGreaterThan(start);
    expect(hb).toBeLessThan(firstEarly);
  });

  it('getAutolistQueue only records a heartbeat when the caller sent the extension version (?v=)', () => {
    const src = read('controllers/extensionController.ts');
    const start = src.indexOf('export const getAutolistQueue');
    const seg = src.slice(start, src.indexOf('if (enabledPlatforms.length === 0)', start));
    expect(seg).toMatch(/if \(pollVersion\) \{[\s\S]*?const poll = await recordExtensionPoll\(organizer\.id[\s\S]*?releaseHolds = poll\.releaseHolds;/);
    expect(seg).toMatch(/const pollVersion = parseVersionParam\(req\.query\?\.v\);/);
  });

  it('the settings response carries the extension block, held titles scoped to the organizer\'s own items', () => {
    const src = read('controllers/extensionController.ts');
    expect(src).toMatch(/extension: await extensionStatusFor\(organizerId,/);
    const fn = src.slice(src.indexOf('async function extensionStatusFor'), src.indexOf('async function extensionStatusFor') + 1500);
    expect(fn).toMatch(/await loadHeldItemState\(organizerId, ids\)/);
    const svc = read('services/extensionHeartbeat.ts');
    const lf = svc.slice(svc.indexOf('export async function loadHeldItemState'), svc.indexOf('export async function loadHeldItemState') + 900);
    expect(lf).toMatch(/OR: organizerListableScope\(organizerId\)/);
  });

  it('the job is registered at startup', () => {
    expect(read('index.ts')).toMatch(/scheduleExtensionHeartbeatAlertJob\(\);/);
  });

  it('the web card shows the silence notice and the held list', () => {
    const card = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'frontend', 'components', 'AutoQueueCard.tsx'), 'utf8');
    expect(card).toContain('auto-queue-extension-silent');
    expect(card).toContain('Held back from Poshmark');
    expect(card).not.toMatch(/—/);
  });
});

describe('1.0.67 stale holds and organizer release (2026-10-26)', () => {
  const SOLD = 'cmu5oob4s001rrd9bl67f2nt9'; // Samurai Shodown II, sold on Mercari 2026-10-24
  const STRAP = 'cmuobqqyg00g1qcr4e3qyxnk3';
  const POSTED = 'cmtk2knjk0egs3bwwrde12qwr';
  const at = new Date(NOW).toISOString();
  const held = [
    { itemId: SOLD, kind: 'prohibited' as const, at },
    { itemId: STRAP, kind: 'oversized' as const, at },
    { itemId: POSTED, kind: 'oversized' as const, at },
  ];

  it('heldStillUnlisted drops an item that is no longer listable (sold), of any kind, when eligibleIds is given', () => {
    const eligible = new Set([STRAP, POSTED]);
    expect(heldStillUnlisted(held, [], eligible).map((h) => h.itemId)).toEqual([STRAP, POSTED]);
    const edit = [{ itemId: SOLD, kind: 'edit' as const, at }];
    expect(heldStillUnlisted(edit, [], eligible)).toEqual([]);
    // without eligibleIds the old behaviour is unchanged
    expect(heldStillUnlisted(held, []).length).toBe(3);
  });

  it('isHoldEligibleItem: AVAILABLE + PUBLISHED + not deleted only', () => {
    expect(isHoldEligibleItem({ status: 'AVAILABLE', draftStatus: 'PUBLISHED', deletedAt: null })).toBe(true);
    expect(isHoldEligibleItem({ status: 'SOLD', draftStatus: 'PUBLISHED', deletedAt: null })).toBe(false);
    expect(isHoldEligibleItem({ status: 'AVAILABLE', draftStatus: 'DRAFT', deletedAt: null })).toBe(false);
    expect(isHoldEligibleItem({ status: 'AVAILABLE', draftStatus: 'PUBLISHED', deletedAt: new Date() })).toBe(false);
  });

  it('staleFlagHoldIds: sold, foreign/unknown and already-on-Poshmark items are dropped; edit holds are left alone', async () => {
    mockItemFindMany.mockResolvedValueOnce([
      { id: SOLD, title: 'Samurai Shodown II', status: 'SOLD', draftStatus: 'PUBLISHED', deletedAt: null },
      { id: STRAP, title: 'Guitar Strap', status: 'AVAILABLE', draftStatus: 'PUBLISHED', deletedAt: null },
      { id: POSTED, title: 'Tony Mottola LP', status: 'AVAILABLE', draftStatus: 'PUBLISHED', deletedAt: null },
    ]);
    mockJobFindMany.mockResolvedValueOnce([{ itemId: POSTED, action: 'POST', status: 'POSTED', createdAt: new Date(NOW) }]);
    const reported = [...held, { itemId: 'zzzzzzzz99', kind: 'oversized' as const, at }, { itemId: 'eeeeeeee11', kind: 'edit' as const, at }];
    const drop = await staleFlagHoldIds('org1', reported);
    expect(drop.sort()).toEqual([SOLD, POSTED, 'zzzzzzzz99'].sort());
    expect(mockItemFindMany.mock.calls[0][0].where.id.in).not.toContain('eeeeeeee11');
  });

  it('staleFlagHoldIds never throws (drops nothing on a DB error)', async () => {
    mockItemFindMany.mockRejectedValueOnce(new Error('db down'));
    await expect(staleFlagHoldIds('org1', held)).resolves.toEqual([]);
  });

  it('parseIdListParam keeps valid ids only, de-duplicated', () => {
    expect(parseIdListParam(STRAP + ',' + STRAP + ',../x,' + SOLD)).toEqual([STRAP, SOLD]);
    expect(parseIdListParam(undefined)).toEqual([]);
  });

  it('a release is added to the context, survives an un-acked poll, and is removed by the ack', () => {
    const ctx1 = addReleasesToContext({ v: '1.0.66', held }, [STRAP], NOW);
    expect(ctx1.release).toEqual([{ itemId: STRAP, at }]);
    const ctx2 = mergeHeartbeatContext(ctx1, { held, version: '1.0.67', acked: [] }, NOW);
    expect(ctx2.release).toEqual([{ itemId: STRAP, at }]);
    const ctx3 = mergeHeartbeatContext(ctx2, { held: [], version: '1.0.67', acked: [STRAP] }, NOW);
    expect(ctx3.release).toBeUndefined();
  });

  it('an un-acked release (old extension) expires after RELEASE_TTL_MS', () => {
    const ctx1 = addReleasesToContext({}, [STRAP], NOW - RELEASE_TTL_MS - 1000);
    expect(mergeHeartbeatContext(ctx1, { held: [], version: '1.0.66' }, NOW).release).toBeUndefined();
  });

  it('recordExtensionHeartbeat returns the releases still pending after the ack', async () => {
    mockLogFindFirst.mockResolvedValueOnce({ id: 'row1', context: { v: '1.0.66', held, release: [{ itemId: STRAP, at }, { itemId: SOLD, at }] } });
    await expect(recordExtensionHeartbeat('org1', { held, version: '1.0.67', acked: [SOLD] }, )).resolves.toEqual([STRAP]);
  });

  it('addHeldReleases writes only the context (last-poll time unchanged); false when there is no heartbeat row', async () => {
    mockLogFindFirst.mockResolvedValueOnce({ id: 'row1', context: { v: '1.0.66', held } });
    await expect(addHeldReleases('org1', [STRAP], NOW)).resolves.toBe(true);
    const upd = mockLogUpdate.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'row1' });
    expect(upd.data.createdAt).toBeUndefined();
    expect(upd.data.context.release).toEqual([{ itemId: STRAP, at }]);
    mockLogFindFirst.mockResolvedValueOnce(null);
    await expect(addHeldReleases('org1', [STRAP], NOW)).resolves.toBe(false);
  });

  it('wiring: autolist-queue drops stale holds, acks releases, and returns releaseHolds + dropHolds on every response', () => {
    const src = read('controllers/extensionController.ts');
    const start = src.indexOf('export const getAutolistQueue');
    const fn = src.slice(start, src.indexOf('\n};', start));
    expect(fn).toMatch(/dropHolds = await staleFlagHoldIds\(organizer\.id, reportedHeld\)/);
    expect(fn).toMatch(/acked: parseIdListParam\(req\.query\?\.released\)/);
    const jsons = fn.match(/res\.json\(\{[^\n]*\}\)/g) || [];
    expect(jsons.length).toBe(3);
    for (const j of jsons) expect(j).toContain('...holdChanges');
  });

  it('wiring: the release endpoint is organizer-only, PRO, own held flag items only, and the card has the buttons', () => {
    const routes = read('routes/organizers.ts');
    expect(routes).toMatch(/router\.post\('\/me\/auto-queue-settings\/release-holds', authenticate, requireOrganizer, requireTier\('PRO'\), releaseHeldPoshmarkItems\)/);
    const src = read('controllers/extensionController.ts');
    const fn = src.slice(src.indexOf('export const releaseHeldPoshmarkItems'), src.indexOf('export const releaseHeldPoshmarkItems') + 2200);
    expect(fn).toMatch(/where: \{ userId \}/);
    expect(fn).toMatch(/h\.kind === 'oversized' \|\| h\.kind === 'prohibited'/);
    expect(fn).toMatch(/releasable\.filter\(\(id\) => requested\.includes\(id\)\)/);
    const card = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'frontend', 'components', 'AutoQueueCard.tsx'), 'utf8');
    expect(card).toContain('Try again on Poshmark');
    expect(card).toContain('Try all again');
    expect(card).toContain("ENDPOINT + '/release-holds'");
    expect(card).not.toMatch(/—/);
    expect(card).not.toMatch(/\bAI\b/);
  });
});

describe('1.0.71: the 1.0.69 certify-as-not-oversized path is gone (2026-10-27)', () => {
  const STRAP = 'cmuobqqyg00g1qcr4e3qyxnk3';
  const PICKS = 'cmu5stawt0071rd9bwrntc9ok';
  const at = new Date(NOW).toISOString();

  it('parseReleaseHoldsBody: itemIds or all; a leftover certifyOversized key is ignored (plain release)', () => {
    expect(parseReleaseHoldsBody({ itemIds: [STRAP] })).toEqual({ ok: true, all: false, itemIds: [STRAP] });
    expect(parseReleaseHoldsBody({ all: true })).toEqual({ ok: true, all: true, itemIds: [] });
    expect(parseReleaseHoldsBody({ itemIds: [STRAP, STRAP] })).toEqual({ ok: true, all: false, itemIds: [STRAP] });
    expect(parseReleaseHoldsBody({ itemIds: [STRAP], certifyOversized: true })).toEqual({ ok: true, all: false, itemIds: [STRAP] });
    expect(parseReleaseHoldsBody({ itemIds: ['../x', 5] }).ok).toBe(false);
    expect(parseReleaseHoldsBody({}).ok).toBe(false);
    expect(parseReleaseHoldsBody([STRAP]).ok).toBe(false);
    expect(parseReleaseHoldsBody(null).ok).toBe(false);
    expect(parseReleaseHoldsBody({ itemIds: Array.from({ length: 51 }, (_, i) => 'abcdefgh' + String(i).padStart(2, '0')) }).ok).toBe(false);
  });

  it('addReleasesToContext records releases only, never a certify list', () => {
    const ctx = addReleasesToContext({}, [STRAP, PICKS], NOW);
    expect(ctx.release).toEqual([{ itemId: STRAP, at }, { itemId: PICKS, at }]);
    expect(ctx.certify).toBeUndefined();
  });

  it('a poll drops a leftover certify list from an older release and returns only releaseHolds', async () => {
    const ctx = { v: '1.0.70', held: [], release: [{ itemId: STRAP, at }], certify: [{ itemId: STRAP, at }] };
    expect(mergeHeartbeatContext(ctx, { held: [], version: '1.0.71' }, NOW).certify).toBeUndefined();
    mockLogFindFirst.mockResolvedValueOnce({ id: 'row1', context: ctx });
    const r = await recordExtensionPoll('org1', { held: [], version: '1.0.71', acked: [] });
    expect(r).toEqual({ releaseHolds: [STRAP] });
    expect(mockLogUpdate.mock.calls[0][0].data.context.certify).toBeUndefined();
    mockLogFindFirst.mockResolvedValueOnce({ id: 'row1', context: ctx });
    await expect(recordExtensionHeartbeat('org1', { held: [], version: '1.0.71' })).resolves.toEqual([STRAP]);
    await expect(recordExtensionPoll('org1', { held: [], version: null })).resolves.toEqual({ releaseHolds: [] });
    mockLogFindFirst.mockRejectedValueOnce(new Error('db down'));
    await expect(recordExtensionPoll('org1', { held: [], version: '1.0.71' })).resolves.toEqual({ releaseHolds: [] });
  });

  it('addHeldReleases writes a plain release', async () => {
    mockLogFindFirst.mockResolvedValueOnce({ id: 'row1', context: { v: '1.0.70', held: [] } });
    await expect(addHeldReleases('org1', [STRAP], NOW)).resolves.toBe(true);
    expect(mockLogUpdate.mock.calls[0][0].data.context.release).toEqual([{ itemId: STRAP, at }]);
    expect(mockLogUpdate.mock.calls[0][0].data.context.certify).toBeUndefined();
  });

  it('wiring: the poll response carries releaseHolds and dropHolds only (no certifyOversizedIds)', () => {
    const src = read('controllers/extensionController.ts');
    const start = src.indexOf('export const getAutolistQueue');
    const fn = src.slice(start, src.indexOf('\n};', start));
    expect(fn).toMatch(/const holdChanges = \{ releaseHolds, dropHolds \};/);
    expect(src).not.toMatch(/certifyOversizedIds\s*[=:]/);
  });

  it('wiring: release-holds releases oversized and prohibited holds, with no certify option', () => {
    const src = read('controllers/extensionController.ts');
    const fn = src.slice(src.indexOf('export const releaseHeldPoshmarkItems'), src.indexOf('export const getAutoQueueSettings'));
    expect(fn).toMatch(/const parsed = parseReleaseHoldsBody\(req\.body\);/);
    expect(fn).toMatch(/\.filter\(\(h\) => h\.kind === 'oversized' \|\| h\.kind === 'prohibited'\)/);
    expect(fn).toMatch(/addHeldReleases\(organizer\.id, ids, Date\.now\(\)\)/);
    expect(fn).not.toMatch(/certif/i);
  });

  it('wiring: the card has no certify buttons, keeps Try again on Poshmark, and tells the organizer to click Publish Listing', () => {
    const card = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'frontend', 'components', 'AutoQueueCard.tsx'), 'utf8');
    expect(card).not.toContain('Not oversized, certify and post');
    expect(card).not.toContain('Certify all oversized and post');
    expect(card).not.toContain('certifyOversized');
    expect(card).toContain('Try again on Poshmark');
    expect(card).toContain('click Publish Listing yourself');
    expect(card).not.toMatch(/—/);
    expect(card).not.toMatch(/\bAI\b/);
  });
});
