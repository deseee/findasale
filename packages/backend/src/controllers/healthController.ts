import { Request, Response } from 'express';

/**
 * Proactive Degradation Mode (Feature #20)
 *
 * Monitor server latency and gracefully degrade non-essential services
 * when response times exceed 2 seconds.
 */

// In-memory flag indicating whether server should operate in degradation mode
let isDegraded = false;

/**
 * Get current server degradation status and latency metrics.
 * Measures request-response latency to detect performance degradation.
 *
 * Response:
 * {
 *   status: 'ok',
 *   latencyMs: number,      // Milliseconds elapsed for this request
 *   degraded: boolean,      // True if latencyMs > 2000 OR module-level isDegraded flag
 *   timestamp: number       // Unix timestamp in milliseconds
 * }
 */
export async function getLatencyStatus(req: Request, res: Response): Promise<void> {
  try {
    const startTime = Date.now();

    // Simulate minimal processing to measure baseline latency
    // In production, this would include DB connection checks, cache verification, etc.
    await Promise.resolve();

    const endTime = Date.now();
    const latencyMs = endTime - startTime;

    // Determine degradation state: either latency spike OR module flag already set
    const degraded = latencyMs > 2000 || isDegraded;

    res.json({
      status: 'ok',
      latencyMs,
      degraded,
      timestamp: endTime,
    });
  } catch (err) {
    console.error('[healthController] getLatencyStatus error:', err);
    res.status(500).json({ message: 'Health check failed' });
  }
}

/**
 * Set the server degradation flag (used by monitoring/admin systems).
 * Allows external systems or health checks to trigger degradation mode.
 */
export function setDegraded(value: boolean): void {
  isDegraded = value;
}

/**
 * Get the current degradation flag state.
 */
export function getDegraded(): boolean {
  return isDegraded;
}
