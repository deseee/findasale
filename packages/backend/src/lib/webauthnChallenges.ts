import { randomBytes } from 'crypto';
import { redis } from './redis';

interface ChallengeEntry {
  challenge: string;
  expiresAt: number;
  flow: 'auth' | 'registration';
}

const CHALLENGE_TTL_SECONDS = 5 * 60; // 5 minutes

// Helper to convert buffer to base64url
function base64url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate a random challenge and store it in Redis
 * @param challengeId Unique ID for this challenge (userId for registration, random UUID for auth)
 * @param flow 'auth' or 'registration' to tag the flow type
 * @returns base64url-encoded challenge
 */
export function generateAndStoreChallenge(
  challengeId: string,
  flow: 'auth' | 'registration' = 'auth'
): string {
  const challenge = base64url(randomBytes(32));
  const expiresAt = Date.now() + CHALLENGE_TTL_SECONDS * 1000;

  const entry: ChallengeEntry = {
    challenge,
    expiresAt,
    flow,
  };

  // Store in Redis with TTL; key format: passkey:challenge:{challengeId}
  redis.setex(`passkey:challenge:${challengeId}`, CHALLENGE_TTL_SECONDS, JSON.stringify(entry));

  return challenge;
}

/**
 * Retrieve and validate a challenge
 * Challenges are one-time use — atomically retrieved and deleted via Redis GETDEL
 * @param challengeId Challenge ID
 * @param expectedFlow Expected flow type ('auth' or 'registration')
 * @returns Challenge string if valid, null if expired or not found
 */
export async function getAndValidateChallenge(
  challengeId: string,
  expectedFlow: 'auth' | 'registration' = 'auth'
): Promise<string | null> {
  // Atomic get + delete via Redis (simulated in in-memory redis.ts via getDel)
  const raw = await redis.getDel(`passkey:challenge:${challengeId}`);

  if (!raw) {
    return null;
  }

  try {
    const entry: ChallengeEntry = JSON.parse(raw);

    // Verify expiry
    if (Date.now() > entry.expiresAt) {
      return null;
    }

    // Verify flow type matches
    if (entry.flow !== expectedFlow) {
      return null;
    }

    return entry.challenge;
  } catch (error) {
    console.error('Failed to parse challenge entry:', error);
    return null;
  }
}

/**
 * Clear a challenge (e.g., if user cancels flow)
 */
export async function clearChallenge(challengeId: string): Promise<void> {
  await redis.del(`passkey:challenge:${challengeId}`);
}
