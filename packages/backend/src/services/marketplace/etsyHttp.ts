/**
 * etsyHttp.ts -- THE one door to Etsy (ADR-135 D5.2, D5.4, D7.1). Batch B1.
 *
 * Every Etsy HTTP call in the backend (connector, taxonomy, receipts, the token endpoint, webhook
 * receipt fetches) goes through etsyRequest / etsyTokenRequest. etsyHttpBoundary.test.ts fails if
 * any other source file (apart from the existing pricing adapter) mentions the Etsy hosts, so the
 * host literals live here and nowhere else.
 *
 * What the door does, in order, for every call:
 *   1. Kill switch: ETSY_CONNECTOR_ENABLED must be exactly 'true' or the call throws ETSY_DISABLED
 *      before any network or database work (zero Etsy traffic leaves the app).
 *   2. Builds headers. The x-api-key value comes from ONE table (ETSY_API_KEY_FORMAT_BY_CLASS) so
 *      live test T1 can change the format per endpoint class in a single place.
 *   3. Waits for a slot in the per-process QPS token bucket (URGENT, then INTERACTIVE, then
 *      BACKGROUND; INTERACTIVE waits at most 8 s, then EtsyError ETSY_BUSY).
 *   4. Reserves one call against the shared Postgres budget (etsyBudget.ts).
 *   5. Sends the request, records the response status and rate-limit headers.
 *   6. Classifies 429: QPD (x-remaining-today is 0, or retry-after over 120 s) writes a block for
 *      every process and replica and never retries; QPS retries URGENT and INTERACTIVE up to 3
 *      times with delay max(retry-after, 2^n s) plus 0-250 ms jitter, BACKGROUND aborts.
 *   7. 5xx and network errors: URGENT and INTERACTIVE retry once after 1 s, BACKGROUND does not.
 *
 * Sources checked while building (fetched 2026-10-03):
 *   - Authentication (authorize host, PKCE S256, token host, header format, token lifetimes):
 *     https://developers.etsy.com/documentation/essentials/authentication
 *   - OpenAPI spec (security scheme text for x-api-key is `keystring:shared_secret`; the spec lists
 *     a different token host than the auth doc):
 *     https://www.etsy.com/openapi/generated/oas/3.0.0.json
 *   - Rate-limit headers and 429 behavior (as quoted in ADR-135 D5.1):
 *     https://developer.etsy.com/documentation/essentials/rate-limits
 * UNVERIFIED (needs a live call, see ADR-135 section 12): which endpoint classes accept the bare
 * keystring (T1), whether the token endpoint needs x-api-key at all (T11), the real 429 body (T17).
 *
 * Import safety: no env reads or network at module load; env, fetch, clock, sleep and budget are
 * injectable through the deps argument (pattern: jobs/reverbSoldSyncCron.ts).
 */

import {
  EtsyError,
  ETSY_BLOCK_CAP_MS,
  ETSY_DEFAULT_LIMIT_PER_SECOND,
  captureEtsyEvent,
  markEtsyBlocked,
  recordEtsyResponse,
  reserveEtsyCall,
  scrubEtsySecrets,
} from './etsyBudget';
import type { EtsyBudgetDeps, EtsyEnv, EtsyPriority, EtsyRateHeaders, ReserveArgs } from './etsyBudget';

export { EtsyError } from './etsyBudget';
export type { EtsyErrorCode, EtsyPriority } from './etsyBudget';

// ---------------------------------------------------------------------------------------------
// Hosts (the only place in the backend, besides the pricing adapter, that names them)
// ---------------------------------------------------------------------------------------------

/** Base for /v3/application/* calls (spec servers[0]). */
export const ETSY_API_BASE_URL = 'https://openapi.etsy.com';
/**
 * Token endpoint host per the authentication doc. The OpenAPI spec lists the other host
 * (the same host as ETSY_API_BASE_URL). Live test T3 confirms both resolve; change here if needed.
 */
export const ETSY_TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';

// ---------------------------------------------------------------------------------------------
// Switches
// ---------------------------------------------------------------------------------------------

/** Repo convention: *_ENABLED env vars are read as === 'true'. Read at call time. */
export function isEtsyConnectorEnabled(env: EtsyEnv = process.env): boolean {
  return env.ETSY_CONNECTOR_ENABLED === 'true';
}

/** Softer switch for draft and publish. Withdraw, sync and polling keep running when it is off. */
export function isEtsyPushEnabled(env: EtsyEnv = process.env): boolean {
  return env.ETSY_PUSH_ENABLED === 'true';
}

// ---------------------------------------------------------------------------------------------
// x-api-key header: ONE constant, one easily changed table
// ---------------------------------------------------------------------------------------------

export type EtsyEndpointClass = 'public' | 'oauth' | 'token';
export type EtsyApiKeyFormat = 'KEYSTRING_SECRET' | 'KEYSTRING_ONLY' | 'NONE';

/**
 * ADR-135 D1.2: the connector sends `ETSY_API_KEY:ETSY_SHARED_SECRET` on every request (the spec
 * security scheme and the authentication doc both say `keystring:shared_secret`). Live test T1
 * may find that some endpoint classes accept or need the bare keystring; flip that class below.
 */
export const ETSY_DEFAULT_API_KEY_FORMAT: EtsyApiKeyFormat = 'KEYSTRING_SECRET';

/** The single table to edit after T1 / T11. */
export const ETSY_API_KEY_FORMAT_BY_CLASS: Record<EtsyEndpointClass, EtsyApiKeyFormat> = {
  public: ETSY_DEFAULT_API_KEY_FORMAT,
  oauth: ETSY_DEFAULT_API_KEY_FORMAT,
  token: ETSY_DEFAULT_API_KEY_FORMAT,
};

/** Returns the x-api-key value for the class, or null when the class sends none. Throws ETSY_NOT_CONFIGURED when a needed credential is missing. */
export function buildEtsyApiKeyHeader(
  endpointClass: EtsyEndpointClass,
  env: EtsyEnv = process.env,
  table: Record<EtsyEndpointClass, EtsyApiKeyFormat> = ETSY_API_KEY_FORMAT_BY_CLASS
): string | null {
  const format = table[endpointClass];
  if (format === 'NONE') return null;
  const key = (env.ETSY_API_KEY ?? '').trim();
  if (!key) throw new EtsyError('ETSY_NOT_CONFIGURED', 'ETSY_API_KEY is not set');
  if (format === 'KEYSTRING_ONLY') return key;
  const secret = (env.ETSY_SHARED_SECRET ?? '').trim();
  if (!secret) throw new EtsyError('ETSY_NOT_CONFIGURED', 'ETSY_SHARED_SECRET is not set');
  return `${key}:${secret}`;
}

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export interface EtsyFetchInit {
  method: string;
  headers: Record<string, string>;
  body?: string | Buffer;
}
export interface EtsyFetchResponse {
  status: number;
  headers: { get(name: string): string | null | undefined };
  text(): Promise<string>;
}
export type EtsyFetch = (url: string, init: EtsyFetchInit) => Promise<EtsyFetchResponse>;

export interface EtsyMultipartPart {
  name: string;
  value?: string;
  filename?: string;
  contentType?: string;
  data?: Buffer;
}

export type EtsyQuery = Record<string, string | number | boolean | undefined | null>;

export interface EtsyRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Must start with /v3/application/ or /v3/public/. */
  path: string;
  priority: EtsyPriority;
  organizerId?: string;
  /** Decrypted OAuth access token. Passed per call, never logged. */
  accessToken?: string;
  query?: EtsyQuery;
  /** JSON body. Mutually exclusive with form and multipart. */
  body?: unknown;
  /** application/x-www-form-urlencoded body. */
  form?: Record<string, string>;
  /** multipart/form-data body (image upload). */
  multipart?: EtsyMultipartPart[];
  /** Header class. Defaults to 'oauth' when an accessToken is given, else 'public'. */
  endpointClass?: EtsyEndpointClass;
  /** Short label for the budget ledger. Derived from method and path when omitted. */
  endpoint?: string;
}

export interface EtsyResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  /** Parsed JSON body, or null when the body is empty or not JSON. */
  data: any;
  /** Raw body text. Callers must never log it (receipts carry buyer data). */
  rawText: string;
}

export interface EtsyBudgetPort {
  reserve(args: ReserveArgs): Promise<{ callId: number }>;
  recordResponse(callId: number, status: number, headers: EtsyRateHeaders): Promise<void>;
  markBlocked(args: { until: Date; reason: 'QPS' | 'QPD' }): Promise<void>;
}

export interface EtsyRateGatePort {
  acquire(priority: EtsyPriority): Promise<void>;
}

export interface EtsyHttpDeps {
  env?: EtsyEnv;
  fetch?: EtsyFetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  budget?: EtsyBudgetPort;
  gate?: EtsyRateGatePort;
  /** Passed to the default budget port. */
  budgetDeps?: EtsyBudgetDeps;
  /** Overrides the x-api-key format table (tests). */
  apiKeyFormats?: Record<EtsyEndpointClass, EtsyApiKeyFormat>;
}

// ---------------------------------------------------------------------------------------------
// QPS token bucket (per process)
// ---------------------------------------------------------------------------------------------

/** Longest an enqueued call waits for a slot before EtsyError ETSY_BUSY. */
export const ETSY_QUEUE_MAX_WAIT_MS: Record<EtsyPriority, number> = {
  URGENT: 30_000,
  INTERACTIVE: 8_000,
  BACKGROUND: 60_000,
};

/** rate = max(1, floor(0.8 * limitPerSecond / replicas)) calls per second. */
export function computeQpsRate(limitPerSecond: number, replicas: number): number {
  const lps = Number.isFinite(limitPerSecond) && limitPerSecond > 0 ? limitPerSecond : ETSY_DEFAULT_LIMIT_PER_SECOND;
  const rep = Number.isFinite(replicas) && replicas >= 1 ? Math.floor(replicas) : 1;
  return Math.max(1, Math.floor((0.8 * lps) / rep));
}

export interface EtsyRateGateOptions {
  ratePerSecond: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  maxWaitMs?: Record<EtsyPriority, number>;
}

const PRIORITY_ORDER: EtsyPriority[] = ['URGENT', 'INTERACTIVE', 'BACKGROUND'];

/**
 * Token bucket with three FIFO queues. A ticket is served only when it is at the front of its own
 * queue AND every higher-priority queue is empty, so URGENT always beats INTERACTIVE beats
 * BACKGROUND for the next free slot.
 */
export class EtsyRateGate implements EtsyRateGatePort {
  private readonly rate: number;
  private readonly capacity: number;
  private readonly nowFn: () => number;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly maxWait: Record<EtsyPriority, number>;
  private tokens: number;
  private lastRefill: number;
  private seq = 0;
  private readonly queues: Record<EtsyPriority, number[]> = { URGENT: [], INTERACTIVE: [], BACKGROUND: [] };

  constructor(opts: EtsyRateGateOptions) {
    this.rate = Math.max(1, opts.ratePerSecond);
    this.capacity = this.rate;
    this.nowFn = opts.now ?? (() => Date.now());
    this.sleepFn = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    this.maxWait = opts.maxWaitMs ?? ETSY_QUEUE_MAX_WAIT_MS;
    this.tokens = this.capacity;
    this.lastRefill = this.nowFn();
  }

  private refill(): void {
    const t = this.nowFn();
    const elapsed = Math.max(0, t - this.lastRefill);
    this.lastRefill = t;
    this.tokens = Math.min(this.capacity, this.tokens + (elapsed * this.rate) / 1000);
  }

  private isNext(priority: EtsyPriority, ticket: number): boolean {
    for (const p of PRIORITY_ORDER) {
      if (p === priority) return this.queues[p][0] === ticket;
      if (this.queues[p].length > 0) return false;
    }
    return false;
  }

  private remove(priority: EtsyPriority, ticket: number): void {
    const q = this.queues[priority];
    const i = q.indexOf(ticket);
    if (i >= 0) q.splice(i, 1);
  }

  async acquire(priority: EtsyPriority): Promise<void> {
    const ticket = ++this.seq;
    this.queues[priority].push(ticket);
    const deadline = this.nowFn() + this.maxWait[priority];
    try {
      for (;;) {
        this.refill();
        if (this.tokens >= 1 && this.isNext(priority, ticket)) {
          this.tokens -= 1;
          return;
        }
        const remainingMs = deadline - this.nowFn();
        if (remainingMs <= 0) {
          throw new EtsyError('ETSY_BUSY', `Etsy request queue is full for ${priority} calls`);
        }
        const untilToken = this.tokens >= 1 ? 5 : Math.ceil(((1 - this.tokens) * 1000) / this.rate);
        await this.sleepFn(Math.max(1, Math.min(untilToken, remainingMs)));
      }
    } finally {
      this.remove(priority, ticket);
    }
  }
}

let defaultGate: EtsyRateGate | null = null;

/** Process-wide gate, created on first use (never at import). */
export function getDefaultEtsyRateGate(env: EtsyEnv = process.env): EtsyRateGate {
  if (!defaultGate) {
    const replicas = parseInt(String(env.ETSY_REPLICAS ?? '1'), 10);
    defaultGate = new EtsyRateGate({ ratePerSecond: computeQpsRate(ETSY_DEFAULT_LIMIT_PER_SECOND, replicas) });
  }
  return defaultGate;
}

/** Test hook: forget the process-wide gate. */
export function resetDefaultEtsyRateGateForTests(): void {
  defaultGate = null;
}

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

/** A 429 whose retry-after is longer than this is a daily-quota (QPD) block. */
export const ETSY_QPD_RETRY_AFTER_THRESHOLD_S = 120;
/** Used only when Etsy says remaining=0 but sends no retry-after. */
export const ETSY_QPD_DEFAULT_BLOCK_MS = 60 * 60 * 1000;
export const ETSY_QPS_MAX_RETRIES = 3;
export const ETSY_JITTER_MAX_MS = 250;
export const ETSY_SERVER_RETRY_DELAY_MS = 1000;

/** retry-after is documented as seconds; an HTTP date is tolerated. Returns null when absent or unparseable. */
export function parseRetryAfterSeconds(value: string | null | undefined, nowMs: number): number | null {
  if (value === null || value === undefined) return null;
  const v = String(value).trim();
  if (!v) return null;
  if (/^\d+(\.\d+)?$/.test(v)) return Math.max(0, Math.ceil(parseFloat(v)));
  const when = Date.parse(v);
  if (Number.isNaN(when)) return null;
  return Math.max(0, Math.ceil((when - nowMs) / 1000));
}

export type Etsy429Class = 'QPD' | 'QPS';

/** x-remaining-today of 0, or retry-after over 120 s, means the daily quota; anything else is per-second. */
export function classifyEtsy429(headers: Record<string, string>, retryAfterSeconds: number | null): Etsy429Class {
  const remaining = parseInt(headers['x-remaining-today'] ?? '', 10);
  if (Number.isFinite(remaining) && remaining === 0) return 'QPD';
  if (retryAfterSeconds !== null && retryAfterSeconds > ETSY_QPD_RETRY_AFTER_THRESHOLD_S) return 'QPD';
  return 'QPS';
}

/** 'GET /v3/application/shops/:id/listings' style label: no full URL, no ids. */
export function labelEtsyEndpoint(method: string, path: string): string {
  const bare = path.split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:id');
  return `${method} ${bare}`.slice(0, 120);
}

const READ_HEADERS = [
  'retry-after',
  'x-limit-per-day',
  'x-remaining-today',
  'x-limit-per-second',
  'x-remaining-this-second',
  'content-type',
] as const;

function readHeaders(h: EtsyFetchResponse['headers']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of READ_HEADERS) {
    const v = h?.get?.(name);
    if (v !== null && v !== undefined) out[name] = String(v);
  }
  return out;
}

function toRateHeaders(h: Record<string, string>): EtsyRateHeaders {
  return {
    'x-limit-per-day': h['x-limit-per-day'],
    'x-remaining-today': h['x-remaining-today'],
    'x-limit-per-second': h['x-limit-per-second'],
    'x-remaining-this-second': h['x-remaining-this-second'],
  };
}

function encodeForm(form: Record<string, string>): string {
  return Object.entries(form)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

function buildQueryString(query?: EtsyQuery): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const k of Object.keys(query).sort()) {
    const v = query[k];
    if (v === undefined || v === null) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/** Builds a multipart/form-data body by hand so no DOM FormData typing is needed. */
export function buildMultipartBody(parts: EtsyMultipartPart[], boundary: string): Buffer {
  const chunks: Buffer[] = [];
  for (const p of parts) {
    const safeName = p.name.replace(/["\r\n]/g, '');
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${safeName}"`;
    if (p.filename !== undefined) head += `; filename="${p.filename.replace(/["\r\n]/g, '')}"`;
    head += '\r\n';
    if (p.contentType) head += `Content-Type: ${p.contentType}\r\n`;
    head += '\r\n';
    chunks.push(Buffer.from(head, 'utf8'));
    chunks.push(p.data ?? Buffer.from(p.value ?? '', 'utf8'));
    chunks.push(Buffer.from('\r\n', 'utf8'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return Buffer.concat(chunks);
}

function parseBody(text: string): any {
  const t = text.trim();
  if (!t) return null;
  if (t[0] !== '{' && t[0] !== '[') return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/**
 * Short, secret-scrubbed summary of a non-OK response for organizer-safe errors and Sentry extra.
 * Etsy token errors look like { error, error_description }; API errors like { error }.
 */
export function summarizeEtsyError(res: EtsyResponse, env: EtsyEnv = process.env): { code: string | null; message: string } {
  const d = res.data;
  const code = d && typeof d.error === 'string' ? d.error : null;
  const raw =
    (d && typeof d.error_description === 'string' && d.error_description) ||
    (d && typeof d.error === 'string' && d.error) ||
    (d && typeof d.message === 'string' && d.message) ||
    `Etsy returned HTTP ${res.status}`;
  return { code, message: scrubEtsySecrets(String(raw), env).slice(0, 200) };
}

function defaultBudgetPort(deps: EtsyHttpDeps): EtsyBudgetPort {
  const bd: EtsyBudgetDeps = { env: deps.env, now: deps.now, ...(deps.budgetDeps ?? {}) };
  return {
    reserve: (args) => reserveEtsyCall(args, bd),
    recordResponse: (callId, status, headers) => recordEtsyResponse(callId, status, headers, bd),
    markBlocked: (args) => markEtsyBlocked(args, bd),
  };
}

function defaultFetch(): EtsyFetch {
  const f = (globalThis as any).fetch;
  if (typeof f !== 'function') throw new EtsyError('ETSY_NETWORK', 'fetch is not available in this runtime');
  return (url, init) => f(url, init as any) as Promise<EtsyFetchResponse>;
}

// ---------------------------------------------------------------------------------------------
// The door
// ---------------------------------------------------------------------------------------------

interface PreparedCall {
  url: string;
  init: EtsyFetchInit;
  endpoint: string;
  priority: EtsyPriority;
  organizerId?: string;
}

async function executeEtsyCall(call: PreparedCall, deps: EtsyHttpDeps): Promise<EtsyResponse> {
  const env = deps.env ?? process.env;
  const fetchFn = deps.fetch ?? defaultFetch();
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = deps.random ?? Math.random;
  const gate = deps.gate ?? getDefaultEtsyRateGate(env);
  const budget = deps.budget ?? defaultBudgetPort(deps);
  const { priority } = call;

  let qpsRetries = 0;
  let serverRetried = false;

  for (;;) {
    await gate.acquire(priority);
    const { callId } = await budget.reserve({ priority, endpoint: call.endpoint, organizerId: call.organizerId });

    let res: EtsyFetchResponse;
    try {
      res = await fetchFn(call.url, call.init);
    } catch (err: any) {
      if (priority !== 'BACKGROUND' && !serverRetried) {
        serverRetried = true;
        await sleep(ETSY_SERVER_RETRY_DELAY_MS);
        continue;
      }
      throw new EtsyError('ETSY_NETWORK', `Etsy request failed: ${scrubEtsySecrets(err?.message || String(err), env)}`);
    }

    const headers = readHeaders(res.headers);
    let rawText = '';
    try {
      rawText = await res.text();
    } catch {
      rawText = '';
    }
    await budget.recordResponse(callId, res.status, toRateHeaders(headers));

    if (res.status === 429) {
      const nowMs = now().getTime();
      const retryAfter = parseRetryAfterSeconds(headers['retry-after'], nowMs);
      const klass = classifyEtsy429(headers, retryAfter);
      if (klass === 'QPD') {
        const blockMs = Math.min(retryAfter !== null ? retryAfter * 1000 : ETSY_QPD_DEFAULT_BLOCK_MS, ETSY_BLOCK_CAP_MS);
        const until = new Date(nowMs + blockMs);
        await budget.markBlocked({ until, reason: 'QPD' });
        captureEtsyEvent('error', 'Etsy daily call quota (QPD) reached; all Etsy calls paused', {
          area: 'budget',
          step: 'qpd-429',
          extra: { status: 429, retryAfterSeconds: retryAfter, endpoint: call.endpoint },
        }, env);
        throw new EtsyError('ETSY_BLOCKED', 'Etsy daily quota reached', { retryAt: until, status: 429 });
      }
      const blockMs = Math.max(retryAfter ?? 0, 1) * 1000;
      const until = new Date(nowMs + blockMs);
      await budget.markBlocked({ until, reason: 'QPS' });
      if (priority === 'BACKGROUND' || qpsRetries >= ETSY_QPS_MAX_RETRIES) {
        throw new EtsyError('ETSY_BLOCKED', 'Etsy per-second limit hit', { retryAt: until, status: 429 });
      }
      const delayMs = Math.max(retryAfter ?? 0, 2 ** qpsRetries) * 1000 + Math.floor(random() * (ETSY_JITTER_MAX_MS + 1));
      qpsRetries += 1;
      await sleep(delayMs);
      continue;
    }

    if (res.status >= 500) {
      if (priority !== 'BACKGROUND' && !serverRetried) {
        serverRetried = true;
        await sleep(ETSY_SERVER_RETRY_DELAY_MS);
        continue;
      }
      captureEtsyEvent('warning', 'Etsy returned a server error', {
        area: 'http',
        step: 'upstream-5xx',
        extra: { status: res.status, endpoint: call.endpoint, organizerId: call.organizerId },
      }, env);
    }

    return {
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      headers,
      data: parseBody(rawText),
      rawText,
    };
  }
}

/** Authenticated or public /v3/application call through the budget, gate and kill switch. */
export async function etsyRequest(opts: EtsyRequestOptions, deps: EtsyHttpDeps = {}): Promise<EtsyResponse> {
  const env = deps.env ?? process.env;
  if (!isEtsyConnectorEnabled(env)) {
    throw new EtsyError('ETSY_DISABLED', 'The Etsy connector is switched off');
  }
  if (!/^\/v3\/(application|public)\//.test(opts.path)) {
    throw new EtsyError('ETSY_BAD_REQUEST', 'Etsy path must start with /v3/application/ or /v3/public/');
  }
  const bodyKinds = [opts.body !== undefined, opts.form !== undefined, opts.multipart !== undefined].filter(Boolean).length;
  if (bodyKinds > 1) throw new EtsyError('ETSY_BAD_REQUEST', 'Use only one of body, form or multipart');

  const endpointClass: EtsyEndpointClass = opts.endpointClass ?? (opts.accessToken ? 'oauth' : 'public');
  const apiKey = buildEtsyApiKeyHeader(endpointClass, env, deps.apiKeyFormats);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;
  if (opts.accessToken) headers.Authorization = `Bearer ${opts.accessToken}`;

  let body: string | Buffer | undefined;
  if (opts.form !== undefined) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = encodeForm(opts.form);
  } else if (opts.multipart !== undefined) {
    const boundary = `----etsy${Math.floor((deps.random ?? Math.random)() * 1e9).toString(16)}${Date.now().toString(16)}`;
    headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
    body = buildMultipartBody(opts.multipart, boundary);
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  return executeEtsyCall(
    {
      url: `${ETSY_API_BASE_URL}${opts.path}${buildQueryString(opts.query)}`,
      init: { method: opts.method, headers, ...(body !== undefined ? { body } : {}) },
      endpoint: opts.endpoint ?? labelEtsyEndpoint(opts.method, opts.path),
      priority: opts.priority,
      organizerId: opts.organizerId,
    },
    deps
  );
}

/**
 * POST to the OAuth token endpoint (authorization_code and refresh_token grants). Same door: kill
 * switch, QPS gate and budget apply. No client_secret is ever sent (Etsy uses PKCE).
 */
export async function etsyTokenRequest(
  params: Record<string, string>,
  deps: EtsyHttpDeps = {},
  opts: { priority?: EtsyPriority; organizerId?: string } = {}
): Promise<EtsyResponse> {
  const env = deps.env ?? process.env;
  if (!isEtsyConnectorEnabled(env)) {
    throw new EtsyError('ETSY_DISABLED', 'The Etsy connector is switched off');
  }
  const apiKey = buildEtsyApiKeyHeader('token', env, deps.apiKeyFormats);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (apiKey) headers['x-api-key'] = apiKey;
  return executeEtsyCall(
    {
      url: ETSY_TOKEN_URL,
      init: { method: 'POST', headers, body: encodeForm(params) },
      endpoint: 'POST /v3/public/oauth/token',
      priority: opts.priority ?? 'URGENT',
      organizerId: opts.organizerId,
    },
    deps
  );
}
