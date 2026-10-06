/**
 * Consignor welcome invite + existing-account link (2026-10-06).
 *
 * Used by: consignorController.createConsignor (manual "Add Consignor"), consignorIntakeController
 * .approveIntakeRequest (intake Approve), consignorController.resendConsignorInvite (POST
 * /api/consignors/:id/send-invite), and createConsignorCore / updateConsignor for the account link.
 *
 * Account link rule: a consignor is linked to a User only when the trimmed email matches EXACTLY
 * ONE live (not soft-deleted) User, compared case-insensitively. "User"."email" is unique but
 * case-sensitive, so two legacy rows differing only by case are possible; that case links nothing
 * rather than guessing. The link is informational. The organizer only ever sees a boolean.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getConsignorMarkdownPolicyNotice } from './commissionCalcService';
import { sendConsignorWelcomeInvite, type ConsignorEmailFailureReason } from './consignorEmailService';

/** ConsignorEmailResult plus RATE_LIMITED (automatic invite cap, see sendWelcomeInviteForConsignor). */
export interface InviteSendResult {
  sent: boolean;
  reason?: ConsignorEmailFailureReason | 'RATE_LIMITED';
}

/**
 * Automatic invites (create / approve) to the same address from one workspace are capped at this
 * many per 24 hours, so repeatedly adding consignors with someone's email cannot flood that inbox
 * (2026-10-06 security pass). The explicit Resend route has its own limiter instead.
 */
export const AUTO_INVITE_DAILY_CAP_PER_ADDRESS = 3;

/** Trim + lowercase; null when empty or not a string. */
export function normalizeConsignorEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  return e ? e : null;
}

/**
 * Finds the single live User whose email matches (case-insensitive), or null. `client` may be a
 * transaction client so the lookup runs inside the caller's transaction.
 */
export async function findLinkableUserId(
  client: Prisma.TransactionClient,
  rawEmail: unknown
): Promise<string | null> {
  const email = normalizeConsignorEmail(rawEmail);
  if (!email || !email.includes('@') || email.length > 254) return null;
  const users = await client.user.findMany({
    where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
    select: { id: true },
    take: 2,
  });
  return users.length === 1 ? users[0].id : null;
}

/** Response shape for the organizer UI. `reason` is a ConsignorEmailFailureReason or PENDING. */
export interface WelcomeEmailOutcome {
  sent: boolean;
  reason?: string;
}

/**
 * Sends the welcome invite for one consignor and stamps inviteEmailSentAt ONLY when the
 * transactional rail accepted it. Never throws: any failure becomes { sent: false, reason: 'ERROR' }.
 */
export async function sendWelcomeInviteForConsignor(
  consignorId: string,
  opts: { automatic?: boolean } = {}
): Promise<InviteSendResult> {
  try {
    const consignor = await prisma.consignor.findUnique({
      where: { id: consignorId },
      select: {
        id: true,
        name: true,
        email: true,
        portalToken: true,
        userId: true,
        workspaceId: true,
        workspace: { select: { name: true, ownerId: true } },
      },
    });
    if (!consignor) return { sent: false, reason: 'ERROR' };
    const normalized = normalizeConsignorEmail(consignor.email);
    if (!normalized) return { sent: false, reason: 'NO_EMAIL' };

    if (opts.automatic) {
      const recent = await prisma.consignor.count({
        where: {
          workspaceId: consignor.workspaceId,
          id: { not: consignor.id },
          email: { equals: normalized, mode: 'insensitive' },
          inviteEmailSentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      if (recent >= AUTO_INVITE_DAILY_CAP_PER_ADDRESS) return { sent: false, reason: 'RATE_LIMITED' };
    }

    let markdownNotice: string | null = null;
    if (consignor.workspace?.ownerId) {
      try {
        markdownNotice = (await getConsignorMarkdownPolicyNotice(consignor.workspace.ownerId)).summary;
      } catch (err: any) {
        console.warn('[consignor-invite] markdown notice lookup failed (sending without it):', err?.message || err);
      }
    }

    const result = await sendConsignorWelcomeInvite({
      consignorName: consignor.name,
      consignorEmail: consignor.email,
      organizerName: consignor.workspace?.name || 'Your organizer',
      portalToken: consignor.portalToken,
      linkedExistingAccount: Boolean(consignor.userId),
      markdownNotice,
    });

    if (result.sent) {
      try {
        await prisma.consignor.update({ where: { id: consignor.id }, data: { inviteEmailSentAt: new Date() } });
      } catch (err: any) {
        console.error('[consignor-invite] sent, but stamping inviteEmailSentAt failed:', err?.message || err);
      }
    }
    return result;
  } catch (err: any) {
    console.error('[consignor-invite] welcome invite failed:', err?.message || err);
    return { sent: false, reason: 'ERROR' };
  }
}

/** How long a create/approve request waits for the invite before answering. */
export const WELCOME_INVITE_WAIT_MS = 8000;

/**
 * Fires the invite without letting it fail or stall the caller: the send keeps running (and still
 * stamps inviteEmailSentAt on success) even if this returns PENDING after the wait.
 */
export async function sendWelcomeInviteNonBlocking(
  consignorId: string,
  waitMs: number = WELCOME_INVITE_WAIT_MS
): Promise<WelcomeEmailOutcome> {
  const sending = sendWelcomeInviteForConsignor(consignorId, { automatic: true }).catch((err): InviteSendResult => {
    console.error('[consignor-invite] unexpected invite failure:', err?.message || err);
    return { sent: false, reason: 'ERROR' };
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<WelcomeEmailOutcome>((resolve) => {
    timer = setTimeout(() => resolve({ sent: false, reason: 'PENDING' }), waitMs);
  });
  try {
    const r = await Promise.race([sending, timeout]);
    return r.sent ? { sent: true } : { sent: false, ...(r.reason ? { reason: r.reason } : {}) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
