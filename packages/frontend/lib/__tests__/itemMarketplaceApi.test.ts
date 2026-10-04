import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createItemMarketplaceApi,
  normalizeMarketplaceStatus,
  marketplaceErrorMessage,
} from '../itemMarketplaceApi';
import type { ApiClientLike } from '../itemMarketplaceApi';

type Call = { method: 'get' | 'post'; url: string; args: unknown[] };

function stubClient(responses: Record<string, any>): { client: ApiClientLike; calls: Call[] } {
  const calls: Call[] = [];
  const client: ApiClientLike = {
    async get(url: string, ...rest: unknown[]) {
      calls.push({ method: 'get', url, args: rest });
      return { data: responses[`GET ${url}`] };
    },
    async post(url: string, ...rest: unknown[]) {
      calls.push({ method: 'post', url, args: rest });
      return { data: responses[`POST ${url}`] };
    },
  };
  return { client, calls };
}

test('getStatus: GET /items/:id/marketplace-status and normalizes a partial response', async () => {
  const { client, calls } = stubClient({ 'GET /items/abc/marketplace-status': { itemId: 'abc' } });
  const status = await createItemMarketplaceApi(client).getStatus('abc');
  assert.deepEqual(calls.map((c) => [c.method, c.url]), [['get', '/items/abc/marketplace-status']]);
  assert.deepEqual(status, {
    itemId: 'abc',
    platforms: {},
    ebayHold: { heldAt: null, heldFields: [], contentDirtyAt: null },
    failedUnacknowledgedPushCount: 0,
    recentPushes: [],
  });
});

test('getStatus: keeps platforms, hold, count and pushes', async () => {
  const raw = {
    itemId: 'abc',
    platforms: { ebay: { platform: 'EBAY', label: 'eBay', status: 'paused' } },
    ebayHold: { heldAt: '2026-10-04T10:00:00.000Z', heldFields: ['price'], contentDirtyAt: null },
    failedUnacknowledgedPushCount: 2,
    recentPushes: [{ id: 'p1', status: 'FAILED', fieldsAttempted: ['price'] }],
  };
  const { client } = stubClient({ 'GET /items/abc/marketplace-status': raw });
  const status = await createItemMarketplaceApi(client).getStatus('abc');
  assert.equal(status.platforms.ebay.status, 'paused');
  assert.deepEqual(status.ebayHold.heldFields, ['price']);
  assert.equal(status.failedUnacknowledgedPushCount, 2);
  assert.equal(status.recentPushes[0].id, 'p1');
});

test('ids are URL encoded', async () => {
  const { client, calls } = stubClient({});
  await createItemMarketplaceApi(client).ackPushFailures('a/b c').catch(() => undefined);
  assert.equal(calls[0].url, '/items/a%2Fb%20c/marketplace-push/ack');
});

test('ackPushFailures: POST with no body', async () => {
  const { client, calls } = stubClient({ 'POST /items/abc/marketplace-push/ack': { acknowledged: 3 } });
  const res = await createItemMarketplaceApi(client).ackPushFailures('abc');
  assert.deepEqual(res, { acknowledged: 3 });
  assert.deepEqual(calls[0], { method: 'post', url: '/items/abc/marketplace-push/ack', args: [] });
});

test('repush: no body unless retry is strictly true', async () => {
  const body = { outcome: null, ebayHold: { heldAt: null, heldFields: [], contentDirtyAt: null }, message: 'ok' };
  const { client, calls } = stubClient({ 'POST /items/abc/ebay-repush': body });
  const api = createItemMarketplaceApi(client);
  await api.repush('abc');
  await api.repush('abc', {});
  await api.repush('abc', { retry: false });
  await api.repush('abc', { retry: 'true' as unknown as boolean });
  await api.repush('abc', { retry: 1 as unknown as boolean });
  for (const c of calls) {
    assert.equal(c.url, '/items/abc/ebay-repush');
    assert.deepEqual(c.args, []);
  }
  await api.repush('abc', { retry: true });
  const last = calls[calls.length - 1];
  assert.deepEqual(last.args, [{ retry: true }]);
  assert.strictEqual((last.args[0] as { retry: unknown }).retry, true);
});

test('repush: returns outcome, hold and message; message-only for a saleless item', async () => {
  const { client } = stubClient({
    'POST /items/abc/ebay-repush': { outcome: null, message: 'Saved. eBay will update from inventory.' },
  });
  const res = await createItemMarketplaceApi(client).repush('abc');
  assert.equal(res.outcome, null);
  assert.equal(res.message, 'Saved. eBay will update from inventory.');
  assert.deepEqual(res.ebayHold, { heldAt: null, heldFields: [], contentDirtyAt: null });
});

test('releaseHold: POST /items/:id/ebay-hold/release with no body', async () => {
  const { client, calls } = stubClient({
    'POST /items/abc/ebay-hold/release': { released: true, ebayHold: { heldAt: null, heldFields: [], contentDirtyAt: null } },
  });
  const res = await createItemMarketplaceApi(client).releaseHold('abc');
  assert.equal(res.released, true);
  assert.deepEqual(calls[0], { method: 'post', url: '/items/abc/ebay-hold/release', args: [] });
});

test('normalizeMarketplaceStatus tolerates null', () => {
  assert.equal(normalizeMarketplaceStatus(null, 'x').itemId, 'x');
  assert.equal(normalizeMarketplaceStatus(undefined, 'x').recentPushes.length, 0);
});

test('marketplaceErrorMessage prefers the server message (409 / 429), else the fallback', () => {
  assert.equal(marketplaceErrorMessage({ response: { status: 409, data: { message: 'An eBay update is already running.' } } }, 'x'), 'An eBay update is already running.');
  assert.equal(marketplaceErrorMessage({ response: { data: { error: 'Too many' } } }, 'x'), 'Too many');
  assert.equal(marketplaceErrorMessage(new Error('boom'), 'fallback'), 'fallback');
  assert.equal(marketplaceErrorMessage({ response: { data: { message: '  ' } } }, 'fallback'), 'fallback');
});
