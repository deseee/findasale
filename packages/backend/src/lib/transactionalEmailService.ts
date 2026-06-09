import { Resend } from 'resend';
import { suppressionService } from '../services/suppressionService';

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

const FROM_DEFAULT = 'FindA.Sale <hello@send.finda.sale>';

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

      // Suppression + domain-block check — applies before every Resend call.
      // Covers both individual addresses in EmailSuppression table and all
      // addresses belonging to blocked competitor domains (e.g. estatesales.net).
      const recipients = Array.isArray(options.to) ? options.to : [options.to];
      const suppressedMap = await suppressionService.checkMultiple(recipients);
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
        from: options.from ?? FROM_DEFAULT,
        to: recipients,
        subject: options.subject,
        html: options.html,
        ...(options.text ? { text: options.text } : {}),
      });

      if (error) {
        console.error('[transactionalEmailService] Resend error:', error);
        throw new Error(`Resend send failed: ${error.message}`);
      }
    },
  },
};
