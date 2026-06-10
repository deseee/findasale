import { Resend } from 'resend';
import { suppressionService } from '../services/suppressionService';
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
 * FROM domain: send.finda.sale (already verified — used by emailService quota alerts).
 * Default sender: hello@send.finda.sale
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
    async send(options: {
      from?: string;
      to: string | string[];
      subject: string;
      html: string;
      text?: string;
    }): Promise<void> {
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
        return;
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
        return;
      }

      const resend = new Resend(process.env.RESEND_API_KEY);

      const { error } = await resend.emails.send({
        from: resolveFrom(options.from),
        to: recipients,
        subject: options.subject,
        html: options.html,
        ...(options.text ? { text: options.text } : {}),
      });

      if (error) {
        console.error('[transactionalEmailService] Resend error:', error);
        Sentry.captureException(new Error(`Resend send rejected: ${error.message}`), {
          tags: { email_rail: 'resend', kind: 'resend_send_rejected' },
          extra: { from: options.from ?? '(default)', subject: options.subject, toCount: recipients.length },
        });
        throw new Error(`Resend send failed: ${error.message}`);
      }
    },
  },
};
