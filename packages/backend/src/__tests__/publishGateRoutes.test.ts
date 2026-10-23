/**
 * Verify to publish, ungated paths closed (2026-10-23, hacker review of lib/publishGate.ts):
 *  - requirePublishVerified / actorCanPublish (lib/publishGate.ts),
 *  - the middleware is mounted, after authentication and before the handler, on every outside-marketplace push:
 *    bulk lot eBay bundle save / list / sync, Discogs push, Reverb push, Etsy publish, Shopify push,
 *  - routes that stay open to unverified organizers (Discogs / Reverb / Etsy remove, Etsy draft) are not gated,
 *  - the eBay import never sets PUBLISHED without the account check (source pin, the handler is too wide to mock).
 * Controllers are stubbed; no network, no real database.
 */
var mockUserFindUnique: jest.Mock;
jest.mock('../lib/prisma', () => {
  mockUserFindUnique = jest.fn();
  return { prisma: { user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) } } };
});

function mockHandlers(names: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const n of names) {
    out[n] = function stubHandler(_req: unknown, res: any) {
      res.json({ handler: n });
    };
  }
  return out;
}

jest.mock('../middleware/auth', () => ({
  authenticate: function authenticate(_req: unknown, _res: unknown, next: () => void) { next(); },
  requireOrganizer: function requireOrganizer(_req: unknown, _res: unknown, next: () => void) { next(); },
  requireAdmin: function requireAdmin(_req: unknown, _res: unknown, next: () => void) { next(); },
}));
jest.mock('../middleware/rateLimiter', () => ({
  itemEndpointLimiter: function itemEndpointLimiter(_req: unknown, _res: unknown, next: () => void) { next(); },
  paymentLimiter: function paymentLimiter(_req: unknown, _res: unknown, next: () => void) { next(); },
}));
jest.mock('../controllers/bulkLotEbayController', () => ({
  bulkLotEbayHandlers: mockHandlers(['status', 'getOne', 'save', 'list', 'sync']),
}));
jest.mock('../controllers/discogsMarketplaceController', () => mockHandlers([
  'connectDiscogsEndpoint', 'getDiscogsConnectionStatus', 'disconnectDiscogs', 'getDiscogsEligibility', 'pushItemToDiscogs', 'removeItemFromDiscogs',
]));
jest.mock('../controllers/discogsMatchController', () => mockHandlers([
  'getDiscogsMatch', 'rerunDiscogsMatch', 'selectDiscogsRelease', 'markNotInDiscogs', 'putRecordIdentity', 'correctDiscogsListing',
  'sweepOwnDiscogsMatches', 'adminSweepDiscogsMatches',
]));
jest.mock('../controllers/reverbMarketplaceController', () => mockHandlers([
  'connectReverbEndpoint', 'getReverbConnectionStatus', 'disconnectReverb', 'pushItemToReverb', 'removeItemFromReverb',
]));
jest.mock('../controllers/etsyListingController', () => ({
  ...mockHandlers([
    'getEtsyEligibilityEndpoint', 'suggestEtsyTaxonomyEndpoint', 'createEtsyDraftEndpoint', 'getEtsyListingEndpoint',
    'publishEtsyListingEndpoint', 'endEtsyListingEndpoint',
  ]),
  etsyKillSwitch: function etsyKillSwitch(_req: unknown, _res: unknown, next: () => void) { next(); },
}));
jest.mock('../controllers/shopifyController', () => mockHandlers([
  'connectShopify', 'disconnectShopifyAccount', 'getShopifyConnectionStatus', 'pushItemAction',
]));

import * as fs from 'fs';
import * as path from 'path';
import { actorCanPublish, requirePublishVerified, EMAIL_NOT_VERIFIED_CODE } from '../lib/publishGate';

const bulkLotEbayRouter = require('../routes/bulkLotEbay').default;
const discogsRouter = require('../routes/discogs').default;
const reverbRouter = require('../routes/reverb').default;
const etsyRouter = require('../routes/etsyListings').default;
const shopifyRouter = require('../routes/shopify').default;

function mockRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: unknown) => { res.body = b; return res; });
  return res;
}

beforeEach(() => mockUserFindUnique.mockReset());

describe('actorCanPublish', () => {
  it('uses the loaded user row without a query', async () => {
    await expect(actorCanPublish({ id: 'u1', emailVerified: true })).resolves.toBe(true);
    await expect(actorCanPublish({ id: 'u1', emailVerified: false, role: 'ORGANIZER', roles: ['ORGANIZER'] })).resolves.toBe(false);
    await expect(actorCanPublish({ id: 'u1', emailVerified: false, roles: ['USER', 'ADMIN'] })).resolves.toBe(true);
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });
  it('looks a minimal { id } user up by id', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ emailVerified: true, role: 'ORGANIZER', roles: ['ORGANIZER'] });
    await expect(actorCanPublish({ id: 'u1' })).resolves.toBe(true);
    expect(mockUserFindUnique.mock.calls[0][0].where).toEqual({ id: 'u1' });
    mockUserFindUnique.mockResolvedValueOnce(null);
    await expect(actorCanPublish({ id: 'gone' })).resolves.toBe(false);
  });
  it('no user, or no id to look up: false', async () => {
    await expect(actorCanPublish(undefined)).resolves.toBe(false);
    await expect(actorCanPublish({})).resolves.toBe(false);
  });
});

describe('requirePublishVerified', () => {
  it('lets a verified user through', async () => {
    const next = jest.fn();
    const res = mockRes();
    await requirePublishVerified({ user: { id: 'u1', emailVerified: true } }, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });
  it('lets an unverified admin through', async () => {
    const next = jest.fn();
    await requirePublishVerified({ user: { id: 'a1', emailVerified: false, role: 'ADMIN', roles: ['ADMIN'] } }, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });
  it('refuses an unverified organizer with 403 EMAIL_NOT_VERIFIED', async () => {
    const next = jest.fn();
    const res = mockRes();
    await requirePublishVerified({ user: { id: 'u1', emailVerified: false, role: 'ORGANIZER', roles: ['ORGANIZER'] } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe(EMAIL_NOT_VERIFIED_CODE);
    expect(typeof res.body.message).toBe('string');
  });
  it('no user: 401; a lookup error goes to the error handler, never through', async () => {
    const res = mockRes();
    const next = jest.fn();
    await requirePublishVerified({}, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    mockUserFindUnique.mockRejectedValueOnce(new Error('db down'));
    const next2 = jest.fn();
    await requirePublishVerified({ user: { id: 'u1' } }, mockRes(), next2);
    expect(next2).toHaveBeenCalledWith(expect.any(Error));
  });
});

/** The handler chain of one route, by name. */
function chain(router: any, method: string, routePath: string): Array<(...a: unknown[]) => unknown> {
  const layer = router.stack.find((l: any) => l.route && l.route.path === routePath && l.route.methods[method]);
  if (!layer) throw new Error(`route ${method.toUpperCase()} ${routePath} not found`);
  return layer.route.stack.map((s: any) => s.handle);
}

describe('routes: gated before the handler, after authentication', () => {
  const gated: Array<[string, any, string, string]> = [
    ['bulk lot eBay save', bulkLotEbayRouter, 'put', '/item/:itemId'],
    ['bulk lot eBay list', bulkLotEbayRouter, 'post', '/item/:itemId/list'],
    ['bulk lot eBay sync', bulkLotEbayRouter, 'post', '/item/:itemId/sync'],
    ['Discogs push', discogsRouter, 'post', '/items/:id/listing'],
    ['Reverb push', reverbRouter, 'post', '/items/:id/listing'],
    ['Etsy publish', etsyRouter, 'post', '/items/:id/publish'],
    ['Shopify push', shopifyRouter, 'post', '/push/:itemId'],
  ];
  it.each(gated)('%s', (_label, router, method, routePath) => {
    const handles = chain(router, method, routePath);
    const gate = handles.indexOf(requirePublishVerified);
    expect(gate).toBeGreaterThan(-1);
    expect(handles.findIndex((h) => h.name === 'authenticate')).toBeLessThan(gate);
    expect(gate).toBeLessThan(handles.length - 1); // the controller handler comes after the gate
  });

  const open: Array<[string, any, string, string]> = [
    ['bulk lot eBay read', bulkLotEbayRouter, 'get', '/item/:itemId'],
    ['Discogs remove', discogsRouter, 'delete', '/items/:id/listing'],
    ['Reverb remove', reverbRouter, 'delete', '/items/:id/listing'],
    ['Etsy end / discard', etsyRouter, 'delete', '/items/:id/listing'],
    ['Etsy draft (not live)', etsyRouter, 'post', '/items/:id/draft'],
    ['Shopify status', shopifyRouter, 'get', '/status'],
  ];
  it.each(open)('%s stays open to unverified organizers', (_label, router, method, routePath) => {
    expect(chain(router, method, routePath)).not.toContain(requirePublishVerified);
  });
});

describe('eBay import (source pin, comments stripped)', () => {
  const src = fs
    .readFileSync(path.join(__dirname, '../controllers/ebayController.ts'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\s\/\/.*$/, ''))
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
  const start = src.indexOf('export const importInventoryFromEbay =');
  const body = src.slice(start, src.indexOf('\nexport ', start + 10));

  it('looks the account up once, before anything is written', () => {
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain('const importCanPublish = await userCanPublish(userId);');
    expect(body.indexOf('importCanPublish = await')).toBeLessThan(body.indexOf('prisma.item.'));
  });

  it('every PUBLISHED write is conditional on importCanPublish', () => {
    const lines = body.split('\n').filter((l) => /draftStatus\s*[:=]\s*'PUBLISHED'|draftStatus: 'PUBLISHED' \}/.test(l) && !/select|where/.test(l));
    expect(lines.length).toBeGreaterThanOrEqual(5); // the 4 adopt / reconcile spreads and the backfill; the 2 creates are pinned below
    for (const line of lines) expect(line).toContain('importCanPublish');
    expect(body.match(/draftStatus: importCanPublish \? 'PUBLISHED' : 'DRAFT'/g)).toHaveLength(2);
  });
});
