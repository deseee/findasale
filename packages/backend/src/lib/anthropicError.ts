import * as Sentry from '@sentry/node';
import { prisma } from './prisma';
import { createNotification } from '../services/notificationService';

/**
 * Shared detection + admin alerting for the "Anthropic API out of credit" failure.
 *
 * When the Anthropic account balance hits $0, the API returns HTTP 400 with a body
 * like { error: { type: 'invalid_request_error', message: 'Your credit balance is
 * too low to access the Anthropic API...' } }. Backend catch blocks that only branch
 * on timeout/401/429 let this fall through to generic 500s — and several leak the raw
 * provider message to end users. These helpers let each call site detect the case and
 * degrade cleanly (user-safe 503 / fallback) while alerting admins once.
 */

/**
 * Returns true when the error is the Anthropic credit-exhausted 400.
 * Tolerant of both the axios error shape and the Anthropic SDK BadRequestError shape.
 */
export function isAnthropicCreditError(error: any): boolean {
  if (!error) return false;
  const CREDIT = 'credit balance';

  // (a) axios error shape: error.response.status === 400 + error.response.data.error
  const axiosStatus = error?.response?.status;
  const axiosErr = error?.response?.data?.error;
  if (axiosStatus === 400) {
    const axiosMsg = (axiosErr?.message ?? '').toString().toLowerCase();
    if (axiosMsg.includes(CREDIT)) return true;
    if (axiosErr?.type === 'invalid_request_error') {
      const rawBody = JSON.stringify(error?.response?.data ?? '').toLowerCase();
      if (rawBody.includes(CREDIT)) return true;
    }
  }

  // (b) Anthropic SDK BadRequestError shape: error.status === 400
  if (error?.status === 400) {
    const sdkMsg = (error?.error?.error?.message ?? error?.message ?? '').toString().toLowerCase();
    if (sdkMsg.includes(CREDIT)) return true;
  }

  // Last-resort: any top-level message mentioning credit balance on a 400
  const topMsg = (error?.message ?? '').toString().toLowerCase();
  if ((axiosStatus === 400 || error?.status === 400) && topMsg.includes(CREDIT)) return true;

  return false;
}

// Throttle: at most one admin alert per 6 hours (in-memory, per-process) so a burst of
// failing requests doesn't spam every admin's notification inbox.
let lastAlertAt = 0;
const ALERT_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Fire ONE throttled admin alert that the Anthropic account is out of credit.
 * Fully error-swallowed: alerting can never throw back into the calling request path.
 */
export async function alertAnthropicCreditExhausted(context: string): Promise<void> {
  try {
    console.error(`[ANTHROPIC-CREDIT] Out of credit — context=${context}`);

    const now = Date.now();
    if (now - lastAlertAt < ALERT_INTERVAL_MS) {
      return; // Already alerted within the throttle window — don't spam admins.
    }
    lastAlertAt = now;

    try {
      Sentry.captureException(new Error(`Anthropic API out of credit (context=${context})`));
    } catch {
      // Sentry best-effort — never throw into the caller.
    }

    const admins = await prisma.user.findMany({
      where: { OR: [{ roles: { has: 'ADMIN' } }, { role: 'ADMIN' }] },
      select: { id: true },
    });
    if (admins.length === 0) {
      console.warn('[ANTHROPIC-CREDIT] No ADMIN users found to notify.');
      return;
    }

    const title = 'Anthropic API out of credit';
    const body =
      `AI features are degraded — the Anthropic API returned an out-of-credit error ` +
      `(context: ${context}). Top up the Anthropic account to restore AI features. ` +
      `This alert is throttled to once every 6 hours.`;

    await Promise.all(
      admins.map((a) =>
        createNotification(a.id, 'anthropic_credit_exhausted', title, body, undefined, 'OPERATIONAL'),
      ),
    );
  } catch (err: any) {
    // Alerting must never throw into the caller.
    console.error('[ANTHROPIC-CREDIT] Failed to fire admin alert:', err?.message ?? err);
  }
}
