/**
 * HTTP client to the FindA.Sale backend (read-only).
 *
 * Calls are always anonymous: no Authorization header or cookie is ever sent or
 * forwarded, so the backend applies its public-viewer rules (DRAFT sales hidden,
 * early-access items embargoed, street addresses withheld). Successful GET
 * responses are cached for a short TTL.
 */

import axios, { AxiosInstance } from 'axios';
import { cacheGet, cacheKey, cacheSet } from './cache';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

/** Default cache lifetime for search/list responses. */
export const DEFAULT_TTL_MS = 60_000;
/** Cache lifetime for slow-moving reference data (cities, categories). */
export const LONG_TTL_MS = 10 * 60_000;

export const api: AxiosInstance = axios.create({
  baseURL: BACKEND_URL,
  timeout: 10000,
  headers: { Accept: 'application/json', 'User-Agent': 'FindA.Sale-MCP/2.0' },
  // Never follow redirects off the backend host.
  maxRedirects: 0,
  // Cap response size defensively (backend list pages are well under this).
  maxContentLength: 5 * 1024 * 1024,
});

export class UpstreamError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'UpstreamError';
  }
}

/**
 * GET a backend path with params. Errors are mapped to short, generic messages
 * so backend internals never reach MCP clients.
 */
export async function getJSON<T>(
  path: string,
  params?: Record<string, unknown>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const key = cacheKey(path, params);
  const cached = cacheGet<T>(key);
  if (cached !== undefined) return cached;

  try {
    const response = await api.get<T>(path, { params });
    if (ttlMs > 0) cacheSet(key, response.data, ttlMs);
    return response.data;
  } catch (error: any) {
    const status: number | undefined = error?.response?.status;
    if (status === 404) throw new UpstreamError('Not found', 404);
    if (status === 400) throw new UpstreamError('Invalid request parameters', 400);
    if (status === 429) throw new UpstreamError('FindA.Sale is busy right now. Try again shortly.', 429);
    console.error(`[API] GET ${path} failed:`, status ?? error?.code ?? error?.message);
    throw new UpstreamError('FindA.Sale data is temporarily unavailable. Try again shortly.', status);
  }
}
