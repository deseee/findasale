/**
 * Per-request context (client IP) carried through async calls.
 *
 * The Streamable HTTP handler builds a fresh McpServer per request and the legacy
 * SSE transport delivers messages from POST /messages, so tool callbacks have no
 * direct access to the HTTP request. AsyncLocalStorage carries the caller's IP
 * from the Express route into the tool runner for per-IP rate limiting.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  clientIp: string;
  transport: 'streamable-http' | 'sse' | 'json-rpc';
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentClientIp(): string {
  return requestContext.getStore()?.clientIp ?? 'unknown';
}
