import { randomBytes } from 'crypto';

interface ChallengeEntry {
  challenge: string;
  expiresAt: number;
}

const challengeMap = new Map<string, ChallengeEntry>();
const CHALLENGE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper to convert buffer to base64url
function base64url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate a random challenge and store it for the user
 * @param userId User ID
 * @returns base64url-encoded challenge
 */
export function generateAndStoreChallenge(userId: string): string {
  const challenge = base64url(randomBytes(32));
  const expiresAt = Date.now() + CHALLENGE_TTL;

  challengeMap.set(userId, { challenge, expiresAt });
  return challenge;
}

/**
 * Retrieve and validate a challenge for the user
 * Challenges are one-time use — they're deleted after retrieval
 * @param userId User ID
 * @returns Challenge string if valid, null if expired or not found
 */
export function getAndValidateChallenge(userId: string): string | null {
  const entry = challengeMap.get(userId);

  if (!entry) {
    return null;
  }

  // Check if expired
  if (Date.now() > entry.expiresAt) {
    challengeMap.delete(userId);
    return null;
  }

  // One-time use: delete after retrieval
  const challenge = entry.challenge;
  challengeMap.delete(userId);

  return challenge;
}

/**
 * Clear a challenge for the user (e.g., if user cancels flow)
 */
export function clearChallenge(userId: string): void {
  challengeMap.delete(userId);
}

/**
 * Cleanup expired challenges periodically
 */
function cleanupExpiredChallenges(): void {
  const now = Date.now();
  for (const [key, { expiresAt }] of challengeMap) {
    if (now > expiresAt) {
      challengeMap.delete(key);
    }
  }
}

// Start cleanup interval — runs every 10 minutes
setInterval(() => {
  cleanupExpiredChallenges();
}, 10 * 60 * 1000);
