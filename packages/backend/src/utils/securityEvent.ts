/**
 * securityEvent.ts -- one place to record security-relevant auth events (refresh-token reuse, and so on) as a single
 * structured log line, plus a Sentry warning so it shows up in alerting. Never throws.
 */
import * as Sentry from '@sentry/node';

export function logSecurityEvent(event: string, details: Record<string, unknown> = {}): void {
  try {
    console.warn('[security-event]', JSON.stringify({ event, at: new Date().toISOString(), ...details }));
  } catch {
    /* logging must never break a request */
  }
  try {
    Sentry.captureMessage(`security-event: ${event}`, { level: 'warning', extra: details });
  } catch {
    /* Sentry not initialised (tests, local) */
  }
}
