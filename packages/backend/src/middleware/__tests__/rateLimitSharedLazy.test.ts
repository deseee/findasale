/**
 * LazyRateLimitStore (P1, 2026-09-29): the limiter store must not be decided once at import time. It uses
 * Redis whenever the client is ready RIGHT NOW and falls back to memory otherwise, then returns to Redis
 * when the client recovers. A fake client is injected; no network.
 */
jest.mock('@sentry/node', () => ({ captureMessage: jest.fn() }));
jest.mock('redis', () => ({ createClient: jest.fn() }));

import { LazyRateLimitStore, createRateLimitStore } from '../rateLimitShared';

const opts = { windowMs: 60_000 } as any;

function fakeRedis() {
  const state = { ready: true, hits: 0, evals: 0, fail: false, scriptLoads: 0 };
  const client = {
    get isReady() {
      return state.ready;
    },
    sendCommand: jest.fn(async (args: string[]) => {
      if (state.fail) throw new Error('redis boom');
      if (args[0] === 'SCRIPT') {
        state.scriptLoads += 1;
        return `sha${state.scriptLoads}`;
      }
      if (args[0] === 'EVALSHA') {
        state.evals += 1;
        state.hits += 1;
        return [state.hits, 60_000];
      }
      return null;
    }),
  };
  return { state, client };
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('LazyRateLimitStore', () => {
  it('createRateLimitStore never returns undefined and works with no Redis at all', async () => {
    const store = createRateLimitStore('rl:test:');
    expect(store).toBeTruthy();
    store.init?.(opts);
    const a = (await store.increment('k')).totalHits; // MemoryStore hands back a shared object: read the number now
    const b = (await store.increment('k')).totalHits;
    expect(a).toBe(1);
    expect(b).toBe(2);
  });

  it('uses memory while the client is null or not ready', async () => {
    const store = new LazyRateLimitStore('rl:a:', () => null);
    store.init(opts);
    expect((await store.increment('k')).totalHits).toBe(1);
    const { state, client } = fakeRedis();
    state.ready = false;
    const store2 = new LazyRateLimitStore('rl:b:', () => client as any);
    store2.init(opts);
    expect((await store2.increment('k')).totalHits).toBe(1);
    expect(client.sendCommand).not.toHaveBeenCalled();
  });

  it('switches to Redis once the client becomes ready AFTER the store was created (no import-time decision)', async () => {
    const { state, client } = fakeRedis();
    state.ready = false;
    const store = new LazyRateLimitStore('rl:c:', () => client as any);
    store.init(opts);
    expect((await store.increment('k')).totalHits).toBe(1); // memory
    state.ready = true;
    const viaRedis = await store.increment('k');
    expect(state.evals).toBe(1);
    expect(viaRedis.totalHits).toBe(1); // Redis counter, independent of the memory counter
  });

  it('falls back to memory when Redis drops mid-life and returns to Redis when it recovers', async () => {
    const { state, client } = fakeRedis();
    const store = new LazyRateLimitStore('rl:d:', () => client as any);
    store.init(opts);
    await store.increment('k');
    expect(state.evals).toBe(1);
    state.ready = false;
    const during = await store.increment('k');
    expect(during.totalHits).toBeGreaterThanOrEqual(1);
    expect(state.evals).toBe(1); // Redis untouched while down
    state.ready = true;
    await store.increment('k');
    expect(state.evals).toBe(2);
  });

  it('a Redis command failure degrades to memory instead of throwing', async () => {
    const { state, client } = fakeRedis();
    const store = new LazyRateLimitStore('rl:e:', () => client as any);
    store.init(opts);
    await store.increment('k'); // healthy so the script SHAs are loaded
    state.fail = true;
    const r = await store.increment('k2');
    expect(r.totalHits).toBe(1);
    await expect(store.decrement('k2')).resolves.toBeUndefined();
    await expect(store.resetKey('k2')).resolves.toBeUndefined();
  });

  it('exposes the prefix and tolerates init before and after a store exists', () => {
    const store = new LazyRateLimitStore('rl:f:', () => null);
    expect(store.prefix).toBe('rl:f:');
    expect(() => store.init(opts)).not.toThrow();
    expect(() => store.init(opts)).not.toThrow();
  });
});
