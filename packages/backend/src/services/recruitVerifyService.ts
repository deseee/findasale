/**
 * Organizer-recruitment channel: pre-send address verification.
 *
 * Order (architect handoff 2026-10-12):
 *   1. syntax
 *   2. isEmailDomainBlocked + suppressionService.isSuppressed
 *   3. skip addresses that already belong to a User or are in the Gmail outreach
 *      pipeline (DirectoryClaimEmail) so no one is contacted by two channels
 *   4. domainCanReceiveMail (MX / NXDOMAIN)
 *   5. SMTP RCPT probe via verifyEmail from smtpPermutationVerifyJob.ts
 *
 * Outcomes: VERIFIED (sendable), RISKY (catch-all or MX we cannot probe; never
 * sent), INVALID (bad syntax, blocked domain, no MX, mailbox rejected),
 * SUPPRESSED, DONE (already a user / already in the outreach pipeline).
 * A probe that times out or cannot connect leaves the lead NEW so the next
 * daily run retries it; it is never marked INVALID on a network failure.
 */

import { prisma } from '../lib/prisma';
import { suppressionService, isEmailDomainBlocked } from './suppressionService';
import { domainCanReceiveMail } from '../lib/mxValidator';
import { verifyEmail, getMxHost, isBlockedMxHost, smtpCheck } from '../jobs/smtpPermutationVerifyJob';

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function isValidRecruitEmailSyntax(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (e.length > 254 || !EMAIL_RE.test(e)) return false;
  const local = e.slice(0, e.lastIndexOf('@'));
  return local.length > 0 && local.length <= 64 && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..');
}

export type RecruitVerifyStatus = 'NEW' | 'VERIFIED' | 'RISKY' | 'INVALID' | 'SUPPRESSED' | 'DONE';

export interface RecruitVerifyResult {
  status: RecruitVerifyStatus;
  reason: string;
}

export async function verifyRecruitAddress(rawEmail: string): Promise<RecruitVerifyResult> {
  const email = rawEmail.trim().toLowerCase();

  // 1. syntax
  if (!isValidRecruitEmailSyntax(email)) return { status: 'INVALID', reason: 'syntax' };

  // 2. blocked domain / suppression list
  if (isEmailDomainBlocked(email)) return { status: 'INVALID', reason: 'blocked_domain' };
  if (await suppressionService.isSuppressed(email)) return { status: 'SUPPRESSED', reason: 'suppressed' };

  // 3. already a user, or already owned by the Gmail outreach pipeline
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });
  if (user) return { status: 'DONE', reason: 'existing_user' };
  const inOutreach = await prisma.directoryClaimEmail.findFirst({
    where: { emailAddress: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });
  if (inOutreach) return { status: 'DONE', reason: 'in_outreach_pipeline' };

  // 4. domain can receive mail
  const mx = await domainCanReceiveMail(email);
  if (!mx.ok) return { status: 'INVALID', reason: (mx.reason || 'NO_MX').toLowerCase() };

  // 5. SMTP probe
  const domain = email.slice(email.lastIndexOf('@') + 1);
  const mxHost = await getMxHost(domain);
  if (!mxHost) return { status: 'NEW', reason: 'mx_lookup_failed_retry' };
  if (isBlockedMxHost(mxHost)) return { status: 'RISKY', reason: 'mx_not_probeable' };

  const verdict = await verifyEmail(email, domain, mxHost);
  if (verdict === true) return { status: 'VERIFIED', reason: 'smtp_accepted' };
  if (verdict === null) return { status: 'RISKY', reason: 'catch_all' };

  // verifyEmail collapses "rejected" and "could not connect" into false. Tell them
  // apart so a blocked port or a slow server never marks a good address INVALID.
  const again = await smtpCheck(email, mxHost);
  if (again === 'rejected') return { status: 'INVALID', reason: 'smtp_rejected' };
  return { status: 'NEW', reason: `smtp_${again}_retry` };
}
