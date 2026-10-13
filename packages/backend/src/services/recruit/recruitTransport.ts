/**
 * recruitTransport.ts -- ADR-139 §2 / §5 send adapters for the recruit channel.
 *
 *   none             default. Never sends.
 *   resend_optin     Resend, recruit subdomain, its OWN API key, consented leads only.
 *   gmail_dedicated  NOT APPROVED (needs a paid mailbox, Patrick YES). Stub that always refuses.
 *
 * Isolation checks run before every send; any failure refuses the send and reports to Sentry
 * (once per reason per process). No key value is ever logged.
 */
import { Resend } from 'resend';
import * as Sentry from '@sentry/node';
import { RecruitConfig } from './recruitConfig';
import { hasUsableSecret } from './recruitTokens';
import { SENDER_LINE } from './recruitTemplates';

export interface RecruitSendRequest {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export type RecruitSendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; kind: 'refused'; reason: string }
  | { ok: false; kind: 'invalid_recipient'; message: string }
  | { ok: false; kind: 'error'; message: string };

/** Domains the recruit From address may never use (root transactional domain, cold-outreach subdomain). */
const FORBIDDEN_FROM_DOMAINS = new Set(['finda.sale', 'outreach.finda.sale']);

function domainOf(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).trim().toLowerCase();
}

const reportedReasons = new Set<string>();
function reportOnce(reason: string): void {
  if (reportedReasons.has(reason)) return;
  reportedReasons.add(reason);
  console.error(`[recruit] transport refused: ${reason}`);
  try {
    Sentry.captureMessage(`[recruit] transport isolation check failed: ${reason}`, 'error');
  } catch {
    /* Sentry not initialised in tests */
  }
}

/**
 * Checks the configured transport is allowed to send at all (independent of any lead).
 * Returns { ok: true } or the refusal reason. Pure apart from env reads.
 */
export function checkTransportReady(
  cfg: RecruitConfig,
  env: NodeJS.ProcessEnv = process.env
): { ok: true } | { ok: false; reason: string } {
  if (cfg.transport === 'none') return { ok: false, reason: 'transport_none' };
  if (cfg.transport === 'gmail_dedicated') return { ok: false, reason: 'transport_not_approved' };

  // resend_optin
  if (!cfg.mailingAddress) return { ok: false, reason: 'mailing_address_missing' };
  if (!hasUsableSecret(cfg.unsubSecret)) return { ok: false, reason: 'unsub_secret_missing' };
  if (!cfg.fromEmail) return { ok: false, reason: 'from_email_missing' };
  if (!cfg.replyTo) return { ok: false, reason: 'reply_to_missing' };
  const fromDomain = domainOf(cfg.fromEmail);
  if (!fromDomain || fromDomain !== cfg.sendingDomain) return { ok: false, reason: 'from_domain_mismatch' };
  if (FORBIDDEN_FROM_DOMAINS.has(fromDomain) || FORBIDDEN_FROM_DOMAINS.has(cfg.sendingDomain)) {
    return { ok: false, reason: 'from_domain_forbidden' };
  }
  if (domainOf(cfg.replyTo) === 'outreach.finda.sale') return { ok: false, reason: 'reply_to_forbidden' };
  const recruitKey = env.RECRUIT_RESEND_API_KEY || '';
  if (!recruitKey) return { ok: false, reason: 'recruit_api_key_missing' };
  // Compared in-process only; neither value is ever logged.
  if (recruitKey === (env.RESEND_API_KEY || '')) return { ok: false, reason: 'recruit_api_key_shared' };
  return { ok: true };
}

let cachedClient: { key: string; client: Resend } | null = null;
function resendClient(key: string): Resend {
  if (!cachedClient || cachedClient.key !== key) cachedClient = { key, client: new Resend(key) };
  return cachedClient.client;
}

/**
 * Sends one email through the configured transport.
 * `hasConsent` must reflect RecruitLead.consentAt != null (or the admin's own address for a test send).
 * resend_optin refuses any recipient without consent BEFORE calling the provider. The single
 * exception is purpose 'confirm': the one confirmation email that answers the visitor's own
 * form submission (ADR-139 §4.2), which is rate-limited by the caller.
 */
export async function sendRecruitEmail(
  cfg: RecruitConfig,
  req: RecruitSendRequest,
  opts: { hasConsent: boolean; purpose: 'confirm' | 'sequence' | 'test' },
  env: NodeJS.ProcessEnv = process.env
): Promise<RecruitSendResult> {
  const ready = checkTransportReady(cfg, env);
  if (!ready.ok) {
    if (ready.reason !== 'transport_none' && ready.reason !== 'transport_not_approved') reportOnce(ready.reason);
    return { ok: false, kind: 'refused', reason: ready.reason };
  }
  if (cfg.transport === 'resend_optin' && !opts.hasConsent && opts.purpose !== 'confirm') {
    return { ok: false, kind: 'refused', reason: 'no_consent' };
  }

  try {
    const client = resendClient(env.RECRUIT_RESEND_API_KEY as string);
    const { data, error } = await client.emails.send({
      from: `${SENDER_LINE} <${cfg.fromEmail}>`,
      to: req.to,
      reply_to: cfg.replyTo,
      subject: req.subject,
      html: req.html,
      text: req.text,
      headers: req.headers,
      tags: [{ name: 'channel', value: 'recruit' }],
    });
    if (error) {
      const message = `${error.name || 'error'}: ${error.message || ''}`.slice(0, 500);
      if (error.name === 'validation_error' && /\bto\b|recipient|email address/i.test(error.message || '')) {
        return { ok: false, kind: 'invalid_recipient', message };
      }
      return { ok: false, kind: 'error', message };
    }
    return { ok: true, providerMessageId: data?.id ?? null };
  } catch (err: any) {
    return { ok: false, kind: 'error', message: String(err?.message ?? err).slice(0, 500) };
  }
}
