import { Resend } from 'resend';
import { suppressionService } from '../services/suppressionService';
import { recordApiUsage } from './aiCostTracker';
import * as Sentry from '@sentry/node';

/**
 * Transactional email service — uses Resend API (NOT Gmail).
 *
 * This is a dedicated rail for critical transactional emails: password resets,
 * email verification, payout confirmations, purchase receipts, invoices, and
 * subscription notices. A Gmail/Workspace suspension cannot silence these.
 *
 * Gmail/emailService remains the rail for bulk and marketing emails
 * (sale alerts, newsletters, weekly digests, win-back flows, etc.).
 *
 * FROM domain: finda.sale (Resend-verified root domain).
 * Default sender: RESEND_FROM_EMAIL (defaults to noreply@finda.sale).
 *
 * Environment variable required in Railway:
 *   RESEND_API_KEY=<from Resend dashboard → API Keys>
 */

const FROM_DEFAULT = process.env.RESEND_FROM_EMAIL ?? 'FindA.Sale <noreply@finda.sale>';

// Resend only has the root domain `finda.sale` verified. Any from-address whose
// domain is not exactly `finda.sale` (e.g. outreach.finda.sale, send.finda.sale)
// is 403-rejected by Resend. Coerce such addresses to the verified default.
const VERIFIED_RESEND_DOMAIN = 'finda.sale';
function domainOf(addr: string): string | null {
  const m = addr.match(/@([A-Za-z0-9.-]+)/);
  return m ? m[1].toLowerCase() : null;
}
function resolveFrom(from?: string): string {
  const candidate = from ?? FROM_DEFAULT;
  if (from && domainOf(from) && domainOf(from) !== VERIFIED_RESEND_DOMAIN) {
    console.warn(
      `[transactionalEmailService] Coerced unverified from '${from}' → FROM_DEFAULT`,
    );
  }
  return domainOf(candidate) === VERIFIED_RESEND_DOMAIN ? candidate : FROM_DEFAULT;
}

export const transactionalEmailService = {
  emails: {
    // P0 fix (2026-08-25, Charge C investigation -- STATE.md S-PAYMENT-INVOICE-GAPS-2026-08-25):
    // this used to return Promise<void> unconditionally, including on a silent
    // suppression-block skip -- the exact failure mode that let a stale EmailSuppression
    // row block Patrick's own invoice email with zero signal to the caller (posController's
    // sendHoldInvoice just console.warn'ed on a genuine throw, and a suppression skip isn't
    // even a throw). Callers that don't care can still ignore the return value (this change
    // is backward-compatible with every existing call site) -- sendHoldInvoice is the first
    // caller to actually check it. Genuine Resend API errors still throw, unchanged.
    async send(options: {
      from?: string;
      to: string | string[];
      subject: string;
      html: string;
      text?: string;
      // Optional extra message headers (e.g. RFC 8058 List-Unsubscribe / List-Unsubscribe-Post).
      headers?: Record<string, string>;
    }): Promise<{ sent: boolean; reason?: string }> {
      if (!process.env.RESEND_API_KEY) {
        // Soft failure in dev/test environments where Resend isn't configured.
        // In production Railway RESEND_API_KEY must be set — log as error so it
        // surfaces in Railway logs and Sentry.
        console.error(
          '[transactionalEmailService] RESEND_API_KEY not set — email NOT sent:',
          options.subject,
          '→',
          Array.isArray(options.to) ? options.to.join(', ') : options.to,
        );
        return { sent: false, reason: 'not_configured' };
      }

      // Rail-level hard-suppression + domain-block check — applies before every
      // Resend call. Transactional rail blocks hard-bounce/complaint/blocked-domain
      // only — opted-out users still receive receipts/resets/payouts they're
      // entitled to (opt-out and soft-bounce are marketing-only signals).
      const recipients = Array.isArray(options.to) ? options.to : [options.to];
      const suppressedMap = await suppressionService.checkMultipleHard(recipients);
      const blockedRecipients = recipients.filter(r => suppressedMap.get(r.toLowerCase()));
      if (blockedRecipients.length > 0) {
        console.warn(
          '[transactionalEmailService] Send blocked — suppressed/domain-blocked recipients:',
          blockedRecipients.join(', '),
          '| subject:', options.subject,
        );
        return { sent: false, reason: 'suppressed' };
      }

      const resend = new Resend(process.env.RESEND_API_KEY);

      const { error } = await resend.emails.send({
        from: resolveFrom(options.from),
        to: recipients,
        subject: options.subject,
        html: options.html,
        ...(options.text ? { text: options.text } : {}),
        ...(options.headers && Object.keys(options.headers).length > 0
          ? { headers: options.headers }
          : {}),
      });

      if (error) {
        console.error('[transactionalEmailService] Resend error:', error);
        Sentry.captureException(new Error(`Resend send rejected: ${error.message}`), {
          tags: { email_rail: 'resend', kind: 'resend_send_rejected' },
          extra: { from: options.from ?? '(default)', subject: options.subject, toCount: recipients.length },
        });
        throw new Error(`Resend send failed: ${error.message}`);
      }

      // SENT-count tracking for deliverabilityMonitorJob.ts's weekly bounce-rate
      // check (P1 fix, 2026-09-08 -- see claude_docs/audits/email-deliverability-
      // audit-2026-09-06.md Sec.6 recommendation 1a). No SENT counter previously
      // existed for the Resend transactional rail at all, so the weekly bounce-rate
      // denominator was structurally blind to it. Reuses the existing generic
      // ApiUsageLog table (service+dateKey+callCount -- "resend" was already listed
      // as an example service value in schema.prisma's own comment on that model)
      // via the existing recordApiUsage() helper, instead of adding a new table or
      // field. writeApiUsageRow() (inside recordApiUsage) already fails open and
      // never throws, so this can never block or fail a real transactional send.
      await recordApiUsage('resend:transactional', 0, recipients.length);

      return { sent: true };
    },
  },
};
