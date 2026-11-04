import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time check of a shared-secret header for server-only proxy routes (2026-11-04).
 * Fails closed: false whenever the secret is not configured, so an unset env var never opens the route.
 */
export function isAuthorizedProxyRequest(headerValue: unknown, secret: string | undefined): boolean {
  if (!secret) return false;
  if (typeof headerValue !== 'string' || !headerValue) return false;
  const given = Buffer.from(headerValue);
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
