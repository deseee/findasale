/**
 * etsyHttp.ts -- ADR-135 batch B1 acceptance items 5 (429 classification), 6 (kill switch, zero
 * network) and 9 (x-api-key header from one constant/table). fetch, clock, sleep, budget and the
 * QPS gate are all fakes; nothing here touches Etsy, a database or a real timer.
 */

jest.mock('@sentry/node', () => ({ captureMessage: jest.fn() }));

import {
  ETSY_API_BASE_URL,
  ETSY_API_KEY_FORMAT_BY_CLASS,
  ETSY_DEFAULT_API_KEY_FORMAT,
  ETSY_QUEUE_MAX_WAIT_MS,
  ETSY_TOKEN_URL,
  EtsyRateGate,
  buildEtsyApiKeyHeader,
  buildMultipartBody,
  classifyEtsy429,
  computeQpsRate,
  etsyRequest,
  etsyTokenRequest,
  isEtsyConnectorEnabled,
  isEtsyPushEnabled,
  labelEtsyEndpoint,
  parseRetryAfterSeconds,
  summarizeEtsyError,
} from '../etsyHttp';
import type { EtsyEndpointClass, EtsyHttpDeps, EtsyPriority } from '../etsyHttp';

const NOW = new Date('2026-10-03T12:00:00.000Z');
const ENV = { ETSY_CONNECTOR_ENABLED: 'true', ETSY_API_KEY: 'KEYSTRING', ETSY_SHARED_SECRET: 'SHAREDSECRET' };

function fakeResponse(status: number, body?: unknown, headers: Record<string, string> = {}) {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    status,
    headers: { get: (n: string) => (n.toLowerCase() in lower ? lower[n.toLowerCase()] : null) },
    text: async () => (body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function makeHarness(responses: Array<ReturnType<typeof fakeResponse> | Error>, extra: Partial<EtsyHttpDeps> = {}) {
  const queue = [...responses];
  const fetch = jest.fn(async (_url: string, _init: any) => {
    const next = queue.shift();
    if (!next) throw new Error('fake fetch: no response queued');
    if (next instanceof Error) throw next;
    return next;
  });
  const sleeps: number[] = [];
  let callId = 0;
  const budget = {
    reserve: jest.fn(async (_a: any) => ({ callId: ++callId })),
    recordResponse: jest.fn(async (_id: number, _s: number, _h: any) => undefined),
    markBlocked: jest.fn(async (_a: any) => undefined),
  };
  const gate = { acquire: jest.fn(async (_p: EtsyPriority) => undefined) };
  const deps: EtsyHttpDeps = {
    env: ENV,
    fetch: fetch as any,
    now: () => NOW,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    random: () => 0,
    budget,
    gate,
    ...extra,
  };
  return { deps, fetch, sleeps, budget, gate };
}

const basic = (priority: EtsyPriority) => ({ method: 'GET' as const, path: '/v3/application/shops/123', priority });

describe('kill switch ETSY_CONNECTOR_ENABLED (acceptance 6)', () => {
  it.each([[{}], [{ ETSY_CONNECTOR_ENABLED: 'false' }], [{ ETSY_CONNECTOR_ENABLED: 'TRUE' }], [{ ETSY_CONNECTOR_ENABLED: '1' }], [{ ETSY_CONNECTOR_ENABLED: '' }]])(
    'makes zero network, gate and budget calls when env is %j',
    async (flag) => {
      const h = makeHarness([fakeResponse(200, {})], { env: { ...ENV, ...flag, ...(Object.keys(flag).length === 0 ? { ETSY_CONNECTOR_ENABLED: undefined } : {}) } });
      await expect(etsyRequest(basic('URGENT'), h.deps)).rejects.toMatchObject({ code: 'ETSY_DISABLED' });
      await expect(etsyTokenRequest({ grant_type: 'refresh_token' }, h.deps)).rejects.toMatchObject({ code: 'ETSY_DISABLED' });
      expect(h.fetch).not.toHaveBeenCalled();
      expect(h.budget.reserve).not.toHaveBeenCalled();
      expect(h.gate.acquire).not.toHaveBeenCalled();
    }
  );

  it('is on only for exactly "true", read at call time', () => {
    expect(isEtsyConnectorEnabled({ ETSY_CONNECTOR_ENABLED: 'true' })).toBe(true);
    expect(isEtsyConnectorEnabled({})).toBe(false);
    expect(isEtsyPushEnabled({ ETSY_PUSH_ENABLED: 'true' })).toBe(true);
    expect(isEtsyPushEnabled({ ETSY_CONNECTOR_ENABLED: 'true' })).toBe(false);
    const saved = process.env.ETSY_CONNECTOR_ENABLED;
    process.env.ETSY_CONNECTOR_ENABLED = 'true';
    expect(isEtsyConnectorEnabled()).toBe(true);
    process.env.ETSY_CONNECTOR_ENABLED = 'nope';
    expect(isEtsyConnectorEnabled()).toBe(false);
    if (saved === undefined) delete process.env.ETSY_CONNECTOR_ENABLED;
    else process.env.ETSY_CONNECTOR_ENABLED = saved;
  });
});

describe('x-api-key header (acceptance 9)', () => {
  it('is ETSY_API_KEY:ETSY_SHARED_SECRET for every endpoint class by default, from one constant', () => {
    expect(ETSY_DEFAULT_API_KEY_FORMAT).toBe('KEYSTRING_SECRET');
    for (const klass of ['public', 'oauth', 'token'] as EtsyEndpointClass[]) {
      expect(ETSY_API_KEY_FORMAT_BY_CLASS[klass]).toBe(ETSY_DEFAULT_API_KEY_FORMAT);
      expect(buildEtsyApiKeyHeader(klass, ENV)).toBe('KEYSTRING:SHAREDSECRET');
    }
  });

  it('is sent on every request: public, oauth and token', async () => {
    const h = makeHarness([fakeResponse(200, {}), fakeResponse(200, {}), fakeResponse(200, {})]);
    await etsyRequest({ ...basic('INTERACTIVE'), endpointClass: 'public' }, h.deps);
    await etsyRequest({ ...basic('INTERACTIVE'), accessToken: '12345678.tok' }, h.deps);
    await etsyTokenRequest({ grant_type: 'refresh_token' }, h.deps);
    for (const call of h.fetch.mock.calls) expect(call[1].headers['x-api-key']).toBe('KEYSTRING:SHAREDSECRET');
  });

  it('can be changed per class in the single table (T1) without touching the door', async () => {
    const formats: Record<EtsyEndpointClass, any> = { public: 'KEYSTRING_ONLY', oauth: 'KEYSTRING_SECRET', token: 'NONE' };
    const h = makeHarness([fakeResponse(200, {}), fakeResponse(200, {}), fakeResponse(200, {})], { apiKeyFormats: formats });
    await etsyRequest({ ...basic('URGENT'), endpointClass: 'public' }, h.deps);
    await etsyRequest({ ...basic('URGENT'), accessToken: 't' }, h.deps);
    await etsyTokenRequest({ grant_type: 'refresh_token' }, h.deps);
    expect(h.fetch.mock.calls[0][1].headers['x-api-key']).toBe('KEYSTRING');
    expect(h.fetch.mock.calls[1][1].headers['x-api-key']).toBe('KEYSTRING:SHAREDSECRET');
    expect('x-api-key' in h.fetch.mock.calls[2][1].headers).toBe(false);
  });

  it('fails closed with ETSY_NOT_CONFIGURED (no gate, budget or network) when a credential is missing', async () => {
    const noSecret = makeHarness([fakeResponse(200, {})], { env: { ETSY_CONNECTOR_ENABLED: 'true', ETSY_API_KEY: 'K' } });
    await expect(etsyRequest(basic('URGENT'), noSecret.deps)).rejects.toMatchObject({ code: 'ETSY_NOT_CONFIGURED' });
    const noKey = makeHarness([fakeResponse(200, {})], { env: { ETSY_CONNECTOR_ENABLED: 'true' } });
    await expect(etsyRequest(basic('URGENT'), noKey.deps)).rejects.toMatchObject({ code: 'ETSY_NOT_CONFIGURED' });
    for (const h of [noSecret, noKey]) {
      expect(h.fetch).not.toHaveBeenCalled();
      expect(h.budget.reserve).not.toHaveBeenCalled();
    }
  });

  it('sends the bearer token only when one is given', async () => {
    const h = makeHarness([fakeResponse(200, {}), fakeResponse(200, {})]);
    await etsyRequest({ ...basic('URGENT'), accessToken: '12345678.abc' }, h.deps);
    await etsyRequest({ ...basic('URGENT') }, h.deps);
    expect(h.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer 12345678.abc');
    expect('Authorization' in h.fetch.mock.calls[1][1].headers).toBe(false);
  });
});

describe('request building', () => {
  it('joins the base URL, sorts query params and parses JSON', async () => {
    const h = makeHarness([fakeResponse(200, { count: 1 }, { 'x-remaining-today': '99' })]);
    const res = await etsyRequest({ ...basic('BACKGROUND'), query: { limit: 100, was_paid: true, min_last_modified: 5, skip: undefined } }, h.deps);
    expect(h.fetch.mock.calls[0][0]).toBe(`${ETSY_API_BASE_URL}/v3/application/shops/123?limit=100&min_last_modified=5&was_paid=true`);
    expect(res).toMatchObject({ status: 200, ok: true, data: { count: 1 }, headers: { 'x-remaining-today': '99' } });
  });

  it('refuses paths outside /v3/application/ and /v3/public/ and mixed body kinds without any network', async () => {
    const h = makeHarness([fakeResponse(200, {})]);
    await expect(etsyRequest({ ...basic('URGENT'), path: 'https://evil.example/x' }, h.deps)).rejects.toMatchObject({ code: 'ETSY_BAD_REQUEST' });
    await expect(etsyRequest({ ...basic('URGENT'), path: '/v2/anything' }, h.deps)).rejects.toMatchObject({ code: 'ETSY_BAD_REQUEST' });
    await expect(etsyRequest({ ...basic('URGENT'), body: {}, form: { a: 'b' } }, h.deps)).rejects.toMatchObject({ code: 'ETSY_BAD_REQUEST' });
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it('encodes form, JSON and multipart bodies with the right content type', async () => {
    const h = makeHarness([fakeResponse(200, {}), fakeResponse(200, {}), fakeResponse(200, {})]);
    await etsyRequest({ method: 'POST', path: '/v3/application/shops/1/listings', priority: 'INTERACTIVE', form: { title: 'A & B', quantity: '1' } }, h.deps);
    await etsyRequest({ method: 'PUT', path: '/v3/application/listings/1/inventory', priority: 'BACKGROUND', body: { products: [] } }, h.deps);
    await etsyRequest(
      {
        method: 'POST',
        path: '/v3/application/shops/1/listings/2/images',
        priority: 'INTERACTIVE',
        multipart: [
          { name: 'rank', value: '1' },
          { name: 'image', filename: 'a.jpg', contentType: 'image/jpeg', data: Buffer.from([1, 2, 3]) },
        ],
      },
      h.deps
    );
    const [form, json, multi] = h.fetch.mock.calls.map((c) => c[1]);
    expect(form.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(form.body).toBe('title=A%20%26%20B&quantity=1');
    expect(json.headers['Content-Type']).toBe('application/json');
    expect(json.body).toBe('{"products":[]}');
    const boundary = /boundary=(.+)$/.exec(multi.headers['Content-Type'])![1];
    const text = (multi.body as Buffer).toString('latin1');
    expect(text).toContain(`--${boundary}\r\nContent-Disposition: form-data; name="rank"\r\n\r\n1\r\n`);
    expect(text).toContain('name="image"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n');
    expect(text.endsWith(`--${boundary}--\r\n`)).toBe(true);
  });

  it('builds multipart bodies byte for byte', () => {
    const body = buildMultipartBody([{ name: 'a', value: 'x' }], 'B');
    expect(body.toString('utf8')).toBe('--B\r\nContent-Disposition: form-data; name="a"\r\n\r\nx\r\n--B--\r\n');
  });

  it('labels endpoints without ids or query strings for the budget ledger', () => {
    expect(labelEtsyEndpoint('GET', '/v3/application/shops/123/listings/456/images?limit=5')).toBe('GET /v3/application/shops/:id/listings/:id/images');
  });

  it('reserves with the short endpoint label, priority and organizer', async () => {
    const h = makeHarness([fakeResponse(200, {})]);
    await etsyRequest({ ...basic('INTERACTIVE'), organizerId: 'org_1' }, h.deps);
    expect(h.budget.reserve).toHaveBeenCalledWith({ priority: 'INTERACTIVE', endpoint: 'GET /v3/application/shops/:id', organizerId: 'org_1' });
    expect(h.gate.acquire).toHaveBeenCalledWith('INTERACTIVE');
  });

  it('records the status and rate-limit headers against the reserved call', async () => {
    const h = makeHarness([fakeResponse(200, {}, { 'x-limit-per-day': '5000', 'x-remaining-today': '4000', 'x-limit-per-second': '5', 'x-remaining-this-second': '4' })]);
    await etsyRequest(basic('URGENT'), h.deps);
    expect(h.budget.recordResponse).toHaveBeenCalledWith(1, 200, {
      'x-limit-per-day': '5000',
      'x-remaining-today': '4000',
      'x-limit-per-second': '5',
      'x-remaining-this-second': '4',
    });
  });

  it('propagates a budget rejection without sending anything', async () => {
    const h = makeHarness([fakeResponse(200, {})]);
    const { EtsyError } = jest.requireActual('../etsyBudget');
    h.budget.reserve.mockRejectedValueOnce(new EtsyError('ETSY_BUDGET', 'cap'));
    await expect(etsyRequest(basic('BACKGROUND'), h.deps)).rejects.toMatchObject({ code: 'ETSY_BUDGET' });
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it('sends the token request to the token URL as a form without a client secret or bearer', async () => {
    const h = makeHarness([fakeResponse(200, { access_token: 'x' })]);
    await etsyTokenRequest({ grant_type: 'refresh_token', client_id: 'KEYSTRING', refresh_token: 'r.t' }, h.deps, { organizerId: 'org_1' });
    const [url, init] = h.fetch.mock.calls[0];
    expect(url).toBe(ETSY_TOKEN_URL);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('grant_type=refresh_token&client_id=KEYSTRING&refresh_token=r.t');
    expect(init.body).not.toContain('client_secret');
    expect('Authorization' in init.headers).toBe(false);
    expect(h.budget.reserve).toHaveBeenCalledWith({ priority: 'URGENT', endpoint: 'POST /v3/public/oauth/token', organizerId: 'org_1' });
  });
});

describe('429 classification (acceptance 5)', () => {
  it('parses retry-after seconds and HTTP dates', () => {
    const now = NOW.getTime();
    expect(parseRetryAfterSeconds('7', now)).toBe(7);
    expect(parseRetryAfterSeconds('1.2', now)).toBe(2);
    expect(parseRetryAfterSeconds(new Date(now + 30_000).toUTCString(), now)).toBe(30);
    expect(parseRetryAfterSeconds(new Date(now - 30_000).toUTCString(), now)).toBe(0);
    expect(parseRetryAfterSeconds('', now)).toBeNull();
    expect(parseRetryAfterSeconds(null, now)).toBeNull();
    expect(parseRetryAfterSeconds('soon', now)).toBeNull();
  });

  it('is QPD when x-remaining-today is 0 or retry-after is over 120 seconds, otherwise QPS', () => {
    expect(classifyEtsy429({ 'x-remaining-today': '0' }, 1)).toBe('QPD');
    expect(classifyEtsy429({}, 121)).toBe('QPD');
    expect(classifyEtsy429({}, 120)).toBe('QPS');
    expect(classifyEtsy429({ 'x-remaining-today': '17' }, 2)).toBe('QPS');
    expect(classifyEtsy429({}, null)).toBe('QPS');
  });

  it.each(['URGENT', 'INTERACTIVE', 'BACKGROUND'] as EtsyPriority[])('QPD (remaining 0) blocks all processes, never retries, for %s', async (priority) => {
    const h = makeHarness([fakeResponse(429, { error: 'limit' }, { 'retry-after': '3600', 'x-remaining-today': '0' })]);
    const err: any = await etsyRequest(basic(priority), h.deps).catch((e) => e);
    expect(err.code).toBe('ETSY_BLOCKED');
    expect(err.retryAt).toEqual(new Date(NOW.getTime() + 3600_000));
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.sleeps).toEqual([]);
    expect(h.budget.markBlocked).toHaveBeenCalledWith({ until: new Date(NOW.getTime() + 3600_000), reason: 'QPD' });
  });

  it('QPD by retry-after over 120 seconds even when remaining is not reported', async () => {
    const h = makeHarness([fakeResponse(429, undefined, { 'retry-after': '121' })]);
    await expect(etsyRequest(basic('URGENT'), h.deps)).rejects.toMatchObject({ code: 'ETSY_BLOCKED' });
    expect(h.budget.markBlocked).toHaveBeenCalledWith({ until: new Date(NOW.getTime() + 121_000), reason: 'QPD' });
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it('caps a QPD block at 24 hours and uses a default when retry-after is missing', async () => {
    const huge = makeHarness([fakeResponse(429, undefined, { 'retry-after': '999999', 'x-remaining-today': '0' })]);
    await expect(etsyRequest(basic('URGENT'), huge.deps)).rejects.toMatchObject({ code: 'ETSY_BLOCKED' });
    expect(huge.budget.markBlocked).toHaveBeenCalledWith({ until: new Date(NOW.getTime() + 24 * 3600_000), reason: 'QPD' });
    const none = makeHarness([fakeResponse(429, undefined, { 'x-remaining-today': '0' })]);
    await expect(etsyRequest(basic('URGENT'), none.deps)).rejects.toMatchObject({ code: 'ETSY_BLOCKED' });
    expect(none.budget.markBlocked).toHaveBeenCalledWith({ until: new Date(NOW.getTime() + 3600_000), reason: 'QPD' });
  });

  it.each(['URGENT', 'INTERACTIVE'] as EtsyPriority[])('QPS retries %s up to 3 times with max(retry-after, 2^n s) backoff', async (priority) => {
    const r = () => fakeResponse(429, undefined, { 'retry-after': '1' });
    const h = makeHarness([r(), r(), r(), r()]);
    const err: any = await etsyRequest(basic(priority), h.deps).catch((e) => e);
    expect(err.code).toBe('ETSY_BLOCKED');
    expect(h.fetch).toHaveBeenCalledTimes(4); // 1 attempt + 3 retries
    expect(h.sleeps).toEqual([1000, 2000, 4000]); // jitter is 0 with random() = 0
    expect(h.budget.markBlocked).toHaveBeenCalledTimes(4);
    expect(h.budget.markBlocked).toHaveBeenCalledWith({ until: new Date(NOW.getTime() + 1000), reason: 'QPS' });
    expect(h.budget.reserve).toHaveBeenCalledTimes(4); // every attempt is its own reservation
  });

  it('QPS backoff honors a longer retry-after and adds up to 250 ms of jitter', async () => {
    const r = () => fakeResponse(429, undefined, { 'retry-after': '3' });
    const h = makeHarness([r(), r(), r(), fakeResponse(200, { ok: true })], { random: () => 0.5 });
    const res = await etsyRequest(basic('URGENT'), h.deps);
    expect(res.status).toBe(200);
    expect(h.sleeps).toEqual([3125, 3125, 4125]); // max(3, 1)=3, max(3, 2)=3, max(3, 4)=4 seconds, plus floor(0.5 * 251) = 125 ms
  });

  it('QPS succeeds when a retry gets through', async () => {
    const h = makeHarness([fakeResponse(429, undefined, { 'retry-after': '1' }), fakeResponse(200, { ok: 1 })]);
    const res = await etsyRequest(basic('INTERACTIVE'), h.deps);
    expect(res.data).toEqual({ ok: 1 });
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(h.sleeps).toEqual([1000]);
  });

  it('BACKGROUND never retries a QPS 429: it aborts and waits for the next cron tick', async () => {
    const h = makeHarness([fakeResponse(429, undefined, { 'retry-after': '2' }), fakeResponse(200, {})]);
    const err: any = await etsyRequest(basic('BACKGROUND'), h.deps).catch((e) => e);
    expect(err.code).toBe('ETSY_BLOCKED');
    expect(err.retryAt).toEqual(new Date(NOW.getTime() + 2000));
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.sleeps).toEqual([]);
    expect(h.budget.markBlocked).toHaveBeenCalledWith({ until: new Date(NOW.getTime() + 2000), reason: 'QPS' });
  });

  it('a missing retry-after is treated as a 1 second QPS block', async () => {
    const h = makeHarness([fakeResponse(429), fakeResponse(200, {})]);
    await etsyRequest(basic('URGENT'), h.deps);
    expect(h.budget.markBlocked).toHaveBeenCalledWith({ until: new Date(NOW.getTime() + 1000), reason: 'QPS' });
    expect(h.sleeps).toEqual([1000]);
  });
});

describe('5xx and network errors', () => {
  it.each(['URGENT', 'INTERACTIVE'] as EtsyPriority[])('%s retries a 5xx once after 1 second', async (priority) => {
    const h = makeHarness([fakeResponse(503, 'down'), fakeResponse(200, { fine: true })]);
    const res = await etsyRequest(basic(priority), h.deps);
    expect(res.status).toBe(200);
    expect(h.sleeps).toEqual([1000]);
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns the 5xx when the single retry also fails', async () => {
    const h = makeHarness([fakeResponse(500), fakeResponse(502)]);
    const res = await etsyRequest(basic('URGENT'), h.deps);
    expect(res).toMatchObject({ status: 502, ok: false });
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it('BACKGROUND does not retry a 5xx', async () => {
    const h = makeHarness([fakeResponse(500), fakeResponse(200, {})]);
    const res = await etsyRequest(basic('BACKGROUND'), h.deps);
    expect(res.status).toBe(500);
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.sleeps).toEqual([]);
  });

  it('retries one network error for URGENT and INTERACTIVE, then throws ETSY_NETWORK', async () => {
    const h = makeHarness([new Error('socket hang up'), new Error('socket hang up')]);
    await expect(etsyRequest(basic('INTERACTIVE'), h.deps)).rejects.toMatchObject({ code: 'ETSY_NETWORK' });
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(h.sleeps).toEqual([1000]);
  });

  it('BACKGROUND throws ETSY_NETWORK immediately', async () => {
    const h = makeHarness([new Error('boom'), fakeResponse(200, {})]);
    await expect(etsyRequest(basic('BACKGROUND'), h.deps)).rejects.toMatchObject({ code: 'ETSY_NETWORK' });
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry 4xx other than 429 and returns the body for the caller to inspect', async () => {
    const h = makeHarness([fakeResponse(404, { error: 'not found' }), fakeResponse(200, {})]);
    const res = await etsyRequest(basic('URGENT'), h.deps);
    expect(res).toMatchObject({ status: 404, ok: false, data: { error: 'not found' } });
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it('summarizes Etsy errors without leaking secrets and caps the length', () => {
    const res: any = { status: 400, ok: false, headers: {}, rawText: '', data: { error: 'invalid_grant', error_description: 'bad token 12345678.abcdefghijklmnopqrstuvwxyz KEYSTRING ' + 'x'.repeat(400) } };
    const s = summarizeEtsyError(res, ENV);
    expect(s.code).toBe('invalid_grant');
    expect(s.message.length).toBeLessThanOrEqual(200);
    expect(s.message).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(s.message).not.toContain('KEYSTRING');
    expect(summarizeEtsyError({ status: 502, ok: false, headers: {}, rawText: '', data: null }, ENV)).toEqual({ code: null, message: 'Etsy returned HTTP 502' });
  });
});

describe('QPS token bucket', () => {
  function makeClock() {
    let t = 0;
    return {
      now: () => t,
      sleep: async (ms: number) => {
        await Promise.resolve();
        t += ms;
      },
      advance: (ms: number) => {
        t += ms;
      },
    };
  }

  it('computes max(1, floor(0.8 * limitPerSecond / replicas))', () => {
    expect(computeQpsRate(5, 1)).toBe(4);
    expect(computeQpsRate(5, 2)).toBe(2);
    expect(computeQpsRate(5, 10)).toBe(1);
    expect(computeQpsRate(Number.NaN, 0)).toBe(4);
  });

  it('serves a burst up to the rate without waiting', async () => {
    const clock = makeClock();
    const sleepSpy = jest.fn(clock.sleep);
    const gate = new EtsyRateGate({ ratePerSecond: 4, now: clock.now, sleep: sleepSpy });
    for (let i = 0; i < 4; i++) await gate.acquire('INTERACTIVE');
    expect(sleepSpy).not.toHaveBeenCalled();
  });

  it('serves URGENT before INTERACTIVE before BACKGROUND for the next free slot', async () => {
    const clock = makeClock();
    const gate = new EtsyRateGate({
      ratePerSecond: 1,
      now: clock.now,
      sleep: clock.sleep,
      maxWaitMs: { URGENT: 600_000, INTERACTIVE: 600_000, BACKGROUND: 600_000 },
    });
    await gate.acquire('BACKGROUND'); // drains the single token
    const order: string[] = [];
    const wait = (p: EtsyPriority) => gate.acquire(p).then(() => order.push(p));
    await Promise.all([wait('BACKGROUND'), wait('INTERACTIVE'), wait('URGENT')]);
    expect(order).toEqual(['URGENT', 'INTERACTIVE', 'BACKGROUND']);
  });

  it('uses an 8 second queue wait for INTERACTIVE by default', () => {
    expect(ETSY_QUEUE_MAX_WAIT_MS.INTERACTIVE).toBe(8000);
  });

  it('fails INTERACTIVE with ETSY_BUSY when no slot frees up within its wait, and leaves the queue clean', async () => {
    const clock = makeClock();
    const gate = new EtsyRateGate({
      ratePerSecond: 1,
      now: clock.now,
      sleep: clock.sleep,
      maxWaitMs: { URGENT: 30_000, INTERACTIVE: 50, BACKGROUND: 60_000 },
    });
    await gate.acquire('URGENT'); // drains the only token; the next one is a full second away
    const err: any = await gate.acquire('INTERACTIVE').catch((e) => e);
    expect(err.code).toBe('ETSY_BUSY');
    // The timed-out ticket was removed, so a later URGENT call is not stuck behind it.
    await expect(gate.acquire('URGENT')).resolves.toBeUndefined();
  });
});
