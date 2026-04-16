/**
 * fraudDetectionService.ts — Temporal fraud detection via registration velocity
 *
 * Detects high-velocity registration patterns that indicate automated account abuse.
 * Tracks registrations per hashed IP and flags accounts if velocity exceeds threshold.
 *
 * Velocity threshold: >10 registrations per IP in 30 days = high velocity = fraudSuspect flag
 */

import { createHash } from 'crypto';
import { prisma } from './prisma';

interface IpRegistrationRecord {
  timestamps: number[]; // Millisecond timestamps of registrations from this IP
}

// In-memory store: hashedIp → timestamps (keep 30 days of history)
const ipRegistrationHistory = new Map<string, IpRegistrationRecord>();

const VELOCITY_THRESHOLD = 10; // registrations per IP
const LOOKBACK_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Hash an IP address for storage (SHA-256)
 * We hash instead of storing raw IPs for privacy
 */
function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

/**
 * Get or create registration history for a hashed IP
 */
function getOrCreateRecord(hashedIp: string): IpRegistrationRecord {
  if (!ipRegistrationHistory.has(hashedIp)) {
    ipRegistrationHistory.set(hashedIp, {
      timestamps: [],
    });
  }
  return ipRegistrationHistory.get(hashedIp)!;
}

/**
 * Clean up timestamps older than 30 days
 */
function cleanOldTimestamps(record: IpRegistrationRecord): void {
  const now = Date.now();
  record.timestamps = record.timestamps.filter(
    (ts) => now - ts < LOOKBACK_WINDOW_MS
  );
}

/**
 * Get velocity (registration count) for an IP in the past 30 days
 */
function getVelocity(hashedIp: string): number {
  const record = getOrCreateRecord(hashedIp);
  cleanOldTimestamps(record);
  return record.timestamps.length;
}

/**
 * Check if an IP has high registration velocity
 */
function isHighVelocity(hashedIp: string): boolean {
  return getVelocity(hashedIp) >= VELOCITY_THRESHOLD;
}

/**
 * Record a new registration from an IP
 * Should be called AFTER user is created in DB
 * Returns true if velocity is high
 */
export async function recordRegistration(
  ip: string,
  userId: string
): Promise<boolean> {
  const hashedIp = hashIp(ip);
  const record = getOrCreateRecord(hashedIp);
  cleanOldTimestamps(record);

  // Add this registration to the history
  record.timestamps.push(Date.now());

  // Check if velocity is now high
  const velocity = getVelocity(hashedIp);
  const highVelocity = velocity >= VELOCITY_THRESHOLD;

  if (highVelocity) {
    // Flag user as fraud suspect in DB
    await prisma.user.update({
      where: { id: userId },
      data: { fraudSuspect: true },
    });

    console.warn(
      `[FRAUD_DETECTION] User ${userId} from IP ${hashedIp} flagged. ` +
        `High registration velocity: ${velocity} accounts in 30 days (threshold: ${VELOCITY_THRESHOLD})`
    );
  }

  return highVelocity;
}

/**
 * Get detailed velocity report for an IP (admin/debugging only)
 */
export function getVelocityReport(ip: string): {
  hashedIp: string;
  velocity: number;
  threshold: number;
  isHighVelocity: boolean;
  lookbackDays: number;
} {
  const hashedIp = hashIp(ip);
  const velocity = getVelocity(hashedIp);

  return {
    hashedIp,
    velocity,
    threshold: VELOCITY_THRESHOLD,
    isHighVelocity: velocity >= VELOCITY_THRESHOLD,
    lookbackDays: 30,
  };
}

/**
 * Prune in-memory history (keep only 30 days of data, clear very old IPs)
 * Call periodically to manage memory
 */
export function pruneRegistrationHistory(): void {
  const now = Date.now();
  const ipsToDelete: string[] = [];

  ipRegistrationHistory.forEach((record, hashedIp) => {
    cleanOldTimestamps(record);
    // If no recent registrations, remove the IP entry
    if (record.timestamps.length === 0) {
      ipsToDelete.push(hashedIp);
    }
  });

  ipsToDelete.forEach((ip) => ipRegistrationHistory.delete(ip));
}

/**
 * Reset fraud detection for an IP (admin use)
 */
export function resetIpFraudHistory(ip: string): void {
  const hashedIp = hashIp(ip);
  ipRegistrationHistory.delete(hashedIp);
  console.log(`[Fraud Detection] Reset history for IP ${hashedIp}`);
}

/**
 * Get total IPs in tracking (for monitoring)
 */
export function getTrackedIpCount(): number {
  return ipRegistrationHistory.size;
}
