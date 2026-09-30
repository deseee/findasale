/**
 * Opaque user ids for public surfaces (2026-09-29, data minimization).
 *
 * A stable, non-reversible stand-in for a real user id. Public leaderboards and rosters (Hall of
 * Fame, crews, the Collector's League) return this instead of the real id for everyone whose
 * collector profile is not public, so a scraper cannot harvest real account ids or join them
 * across surfaces. The scheme is the one getHallOfFame introduced: 'hof_' + first 20 hex chars of
 * HMAC-SHA256(JWT_SECRET, userId). It is deterministic, so the same member has the same opaque id
 * on every surface, and it can be resolved server-side by hashing a candidate set (for example a
 * crew's member list) and comparing.
 *
 * guildController.opaqueHallOfFameId is byte-for-byte the same function; it can import and
 * re-export this one (guildController was not changed by this work).
 */
import crypto from 'crypto';

export const OPAQUE_USER_ID_PREFIX = 'hof_';

/** Dev/test-only key used when JWT_SECRET is unset. Production never uses it (see resolveOpaqueSecret). */
const DEV_FALLBACK_SECRET = 'hall-of-fame';

/**
 * The HMAC key. In production a missing JWT_SECRET is a hard failure at first use: a well-known fallback key would
 * make every opaque id computable by anyone, which defeats the point (they are meant to be non-reversible stand-ins
 * for real user ids). Outside production the old dev fallback is kept so local runs and tests need no setup.
 */
function resolveOpaqueSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is not set: refusing to derive opaque user ids with a public fallback key');
  }
  return DEV_FALLBACK_SECRET;
}

export function opaqueUserId(userId: string): string {
  const secret = resolveOpaqueSecret();
  return OPAQUE_USER_ID_PREFIX + crypto.createHmac('sha256', secret).update(userId).digest('hex').slice(0, 20);
}

/** True when the value has the shape of an opaque id (it may still not match any user). */
export function isOpaqueUserId(value: unknown): value is string {
  return typeof value === 'string' && /^hof_[0-9a-f]{20}$/.test(value);
}

/**
 * Resolve a client-supplied reference (an opaque id, or a real id) to the real user id of one of
 * `candidateUserIds`. Returns null when it matches none. Resolution is only ever done against a
 * caller-supplied candidate set (for example one crew's members), never against all users.
 */
export function resolveUserRef(ref: unknown, candidateUserIds: string[]): string | null {
  if (typeof ref !== 'string' || !ref) return null;
  for (const id of candidateUserIds) {
    if (id === ref || opaqueUserId(id) === ref) return id;
  }
  return null;
}
