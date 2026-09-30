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
  const state = { ready: true, hits: 0, evals: 0, fail: false, hang: false, scriptLoads: 0 };
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
        if (state.hang) return new Promise(() => undefined); // a connection that accepts writes but never answers
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

describe('LazyRateLimitStore failure policy (never unlimited, bounded latency)', () => {
  const realNow = Date.now;
  afterEach(() => {
    Date.now = realNow;
    delete process.env.RATE_LIMIT_REDIS_TIMEOUT_MS;
    delete process.env.RATE_LIMIT_REDIS_COOLDOWN_MS;
  });

  it('keeps COUNTING in memory for the whole outage (an auth limiter never becomes unlimited)', async () => {
    const { state, client } = fakeRedis();
    state.ready = false;
    const store = new LazyRateLimitStore('rl:login:', () => client as any);
    store.init(opts);
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) seen.push((await store.increment('1.2.3.4')).totalHits);
    expect(seen).toEqual([1, 2, 3, 4, 5]);
    expect(client.sendCommand).not.toHaveBeenCalled();
  });

  it('a hung Redis command times out and falls back to memory instead of stalling the request', async () => {
    process.env.RATE_LIMIT_REDIS_TIMEOUT_MS = '30';
    const { state, client } = fakeRedis();
    const store = new LazyRateLimitStore('rl:sms-burst:', () => client as any);
    store.init(opts);
    await store.increment('k'); // healthy: script SHAs loaded
    state.hang = true;
    const started = Date.now();
    const res = await store.increment('k2');
    expect(Date.now() - started).toBeLessThan(1000);
    expect(res.totalHits).toBe(1); // counted in memory
  });

  it('opens a short circuit after a failure: requests inside the cooldown do not touch Redis, then Redis is retried', async () => {
    process.env.RATE_LIMIT_REDIS_COOLDOWN_MS = '5000';
    let clock = 1_000_000;
    Date.now = () => clock;
    const { state, client } = fakeRedis();
    const store = new LazyRateLimitStore('rl:register:', () => client as any);
    store.init(opts);
    await store.increment('k');
    expect(state.evals).toBe(1);
    state.fail = true;
    await store.increment('k'); // fails, breaker opens
    const callsAfterFailure = client.sendCommand.mock.calls.length;
    clock += 1000;
    state.fail = false;
    const inCooldown = await store.increment('k');
    expect(client.sendCommand.mock.calls.length).toBe(callsAfterFailure); // Redis untouched during the cooldown
    expect(inCooldown.totalHits).toBeGreaterThanOrEqual(1);
    clock += 5000; // cooldown over
    await store.increment('k');
    expect(client.sendCommand.mock.calls.length).toBeGreaterThan(callsAfterFailure);
  });
});

describe('module import safety', () => {
  const realUrl = process.env.REDIS_URL;
  afterEach(() => {
    if (realUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = realUrl;
    jest.resetModules();
  });

  it('importing the module does not throw when REDIS_URL is absent', () => {
    delete process.env.REDIS_URL;
    jest.isolateModules(() => {
      expect(() => require('../rateLimitShared')).not.toThrow();
    });
  });

  it('importing the module does not throw when createClient throws or connect rejects (bad REDIS_URL)', () => {
    process.env.REDIS_URL = 'not a url';
    jest.isolateModules(() => {
      jest.doMock('redis', () => ({
        createClient: () => {
          throw new Error('Invalid URL');
        },
      }));
      expect(() => require('../rateLimitShared')).not.toThrow();
    });
    jest.isolateModules(() => {
      const on = jest.fn();
      jest.doMock('redis', () => ({
        createClient: () => ({ on, connect: () => Promise.reject(new Error('ECONNREFUSED')), isReady: false }),
      }));
      const mod = require('../rateLimitShared');
      expect(mod.createRateLimitStore('rl:x:')).toBeTruthy();
    });
  });
});
