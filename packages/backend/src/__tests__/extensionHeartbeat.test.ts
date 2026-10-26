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
  },
}));
jest.mock('../lib/notificationService', () => ({ createNotification: (...a: unknown[]) => mockCreateNotification(...a) }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: (_o: unknown, fn: unknown) => fn }));
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: jest.fn() } }));

import {
  parseHeldParam, parseVersionParam, heartbeatStatus, shouldAlertHeartbeat,
  recordExtensionHeartbeat, loadExtensionHeartbeat, mergeHeartbeatContext, heldStillUnlisted, HEARTBEAT_SOURCE, HEARTBEAT_STALE_MS,
} from '../services/extensionHeartbeat';
import { runExtensionHeartbeatAlert, EXTENSION_SILENT_TITLE, EXTENSION_SILENT_BODY, EXTENSION_SILENT_LINK } from '../jobs/extensionHeartbeatAlertJob';

const H = 3600 * 1000;
const NOW = Date.parse('2026-10-26T12:00:00Z');
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

beforeEach(() => {
  [mockLogFindFirst, mockLogFindMany, mockLogUpdate, mockLogCreate, mockOrganizerFindMany, mockCreateNotification].forEach((m) => m.mockReset());
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
    await expect(recordExtensionHeartbeat('org1', { held: [], version: '1.0.66' })).resolves.toBeUndefined();
    mockLogFindFirst.mockRejectedValueOnce(new Error('db down'));
    await expect(loadExtensionHeartbeat('org1')).resolves.toEqual({ lastPollAt: null, held: [], alertedAt: null, version: null });
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
    expect(fn).toMatch(/heldFlagged = heldStillUnlisted\(hb\.held, poshJobs\)/);
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
    const hb = src.indexOf('await recordExtensionHeartbeat(organizer.id', start);
    const firstEarly = src.indexOf('if (enabledPlatforms.length === 0)', start);
    expect(hb).toBeGreaterThan(start);
    expect(hb).toBeLessThan(firstEarly);
  });

  it('getAutolistQueue only records a heartbeat when the caller sent the extension version (?v=)', () => {
    const src = read('controllers/extensionController.ts');
    const start = src.indexOf('export const getAutolistQueue');
    const seg = src.slice(start, src.indexOf('if (enabledPlatforms.length === 0)', start));
    expect(seg).toMatch(/const pollVersion = parseVersionParam\(req\.query\?\.v\);\s*if \(pollVersion\) \{\s*await recordExtensionHeartbeat\(organizer\.id/);
  });

  it('the settings response carries the extension block, held titles scoped to the organizer\'s own items', () => {
    const src = read('controllers/extensionController.ts');
    expect(src).toMatch(/extension: await extensionStatusFor\(organizerId,/);
    const fn = src.slice(src.indexOf('async function extensionStatusFor'), src.indexOf('async function extensionStatusFor') + 1500);
    expect(fn).toMatch(/OR: organizerListableScope\(organizerId\)/);
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
