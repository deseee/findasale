/**
 * adminEmailSendController.ts
 * =============================================================================
 * STRICTLY-CONTROLLED admin outbound email endpoint — POST /api/admin/send-email
 *
 * ⚠️  SHIPS DISABLED BY DEFAULT.  NEEDS PATRICK / ARCHITECT REVIEW +
 *     EMAIL_SEND_ENABLED=true BEFORE IT CAN SEND ANYTHING.  ⚠️
 *
 * This endpoint exists because the Gmail MCP can only DRAFT, not SEND. It lets
 * an admin trigger a real send through the EXISTING Gmail rail (lib/emailService
 * → emailService.emails.send → gmail.users.messages.send). It does NOT add any
 * new transport — it reuses the project's single audited send path, which itself
 * already enforces the daily Gmail quota (checkAndIncrementQuota) and the
 * rail-level unsendable-domain + hard-suppression guards (S937).
 *
 * Outbound email is an abuse / spam vector, so this handler stacks SIX independent
 * controls. Every one must pass before a message leaves the building:
 *
 *   1. ADMIN AUTH        — mounted behind `authenticate` + `requireAdmin`
 *                          (admin.ts router.use, line 71) AND re-verifies the
 *                          caller's role includes ADMIN here (defense in depth).
 *   2. ENV KILL-SWITCH   — whole handler is gated behind
 *                          process.env.EMAIL_SEND_ENABLED === 'true'.
 *                          Not set / not 'true'  →  403 "email send disabled".
 *                          Default OFF. This is intentionally NOT set anywhere.
 *   3. RECIPIENT ALLOWLIST — recipient MUST appear on an env-configured allowlist
 *                          (EMAIL_SEND_ALLOWLIST, comma-separated, plus the
 *                          existing SENDABLE_FINDA_SALE_ADDRESSES internal list).
 *                          Anything else  →  403. This is the key control that
 *                          prevents emailing arbitrary external people.
 *   4. RATE LIMIT        — express-rate-limit middleware (sendTestEmailLimiter,
 *                          10/hr) at the route AND a hard per-day cap
 *                          (EMAIL_SEND_DAILY_CAP, default 10) counted from a
 *                          persisted audit counter row.
 *   5. AUDIT LOG         — every attempt (caller, recipient, subject, timestamp,
 *                          result) is recorded as structured JSON to the logs AND
 *                          a persisted per-day counter row in EmailQuotaLog under
 *                          a namespaced key. The daily cap (control 4) reads from
 *                          this counter, so the audit record is load-bearing.
 *   6. CONFIRM FLAG      — body MUST contain `confirm: true` or the request is
 *                          rejected, so it can never be triggered accidentally.
 *
 * If/when Patrick + Architect approve enabling this:
 *   - Set EMAIL_SEND_ENABLED=true               (Railway backend service vars)
 *   - Set EMAIL_SEND_ALLOWLIST="a@x.com,b@y.com" (explicit recipients)
 *   - Optionally tune EMAIL_SEND_DAILY_CAP (default 10)
 * =============================================================================
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { isEmailDomainBlocked } from '../services/suppressionService';

// ---------------------------------------------------------------------------
// Audit counter namespace. We reuse the existing EmailQuotaLog table (a simple
// String-id day-counter) under a distinct key namespace so we do NOT need a new
// migration. Key = `admin-send:YYYY-MM-DD`. This row is the persisted audit
// record the daily cap counts from.
// ---------------------------------------------------------------------------
const AUDIT_KEY_PREFIX = 'admin-send:';

function todayKey(): string {
  return `${AUDIT_KEY_PREFIX}${new Date().toISOString().slice(0, 10)}`;
}

/** Build the recipient allowlist from env. Lowercased, trimmed, deduped. */
function buildAllowlist(): Set<string> {
  const raw = [
    ...(process.env.EMAIL_SEND_ALLOWLIST || '').split(','),
    // Reuse the existing internal-inbox allowlist pattern (suppressionService).
    ...(process.env.SENDABLE_FINDA_SALE_ADDRESSES || '').split(','),
  ];
  return new Set(raw.map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/**
 * Structured audit log line. Lands in Railway logs (grep-able by tag) — the
 * "at minimum structured console + a DB row" floor. The DB row is the per-day
 * counter incremented below.
 */
function auditLog(entry: {
  caller: string | undefined;
  recipient: string;
  subject: string;
  result: string;
}): void {
  console.log(
    '[admin/send-email][AUDIT]',
    JSON.stringify({
      ts: new Date().toISOString(),
      caller: entry.caller ?? 'unknown',
      recipient: entry.recipient,
      subject: entry.subject.slice(0, 200),
      result: entry.result,
    }),
  );
}

export async function adminSendEmail(req: AuthRequest, res: Response) {
  // Lazy import keeps prisma off the module-load path (matches emailService.ts).
  const { prisma } = await import('../lib/prisma');

  const caller = req.user?.email || req.user?.id;

  try {
    // --- CONTROL 1: ADMIN AUTH (defense in depth — router already enforces) ---
    const isAdmin = req.user?.roles?.includes('ADMIN') || req.user?.role === 'ADMIN';
    if (!req.user || !isAdmin) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    // --- CONTROL 2: ENV KILL-SWITCH (default OFF) ---
    if (process.env.EMAIL_SEND_ENABLED !== 'true') {
      auditLog({ caller, recipient: String(req.body?.to ?? ''), subject: String(req.body?.subject ?? ''), result: 'BLOCKED_DISABLED' });
      return res.status(403).json({
        success: false,
        error: 'email send disabled',
        detail: 'Set EMAIL_SEND_ENABLED=true after Patrick/Architect review to enable this endpoint.',
      });
    }

    // --- CONTROL 6: CONFIRM FLAG (must be explicit true) ---
    if (req.body?.confirm !== true) {
      return res.status(400).json({
        success: false,
        error: 'confirm flag required',
        detail: 'Set { "confirm": true } in the request body to acknowledge this sends a real email.',
      });
    }

    // --- Input validation ---
    const { to, subject, body } = req.body as { to?: unknown; subject?: unknown; body?: unknown };
    if (!to || typeof to !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing required field: to' });
    }
    const toAddress = to.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(toAddress)) {
      return res.status(400).json({ success: false, error: 'Invalid email address: to' });
    }
    if (!subject || typeof subject !== 'string' || subject.length > 200) {
      return res.status(400).json({ success: false, error: 'subject is required and must be <= 200 chars' });
    }
    if (!body || typeof body !== 'string' || body.length > 50000) {
      return res.status(400).json({ success: false, error: 'body is required and must be <= 50000 chars' });
    }

    // --- CONTROL 3: RECIPIENT ALLOWLIST (the key external-abuse control) ---
    const allowlist = buildAllowlist();
    if (allowlist.size === 0) {
      auditLog({ caller, recipient: toAddress, subject, result: 'BLOCKED_NO_ALLOWLIST' });
      return res.status(403).json({
        success: false,
        error: 'no recipient allowlist configured',
        detail: 'Set EMAIL_SEND_ALLOWLIST (comma-separated) before enabling sends.',
      });
    }
    if (!allowlist.has(toAddress)) {
      auditLog({ caller, recipient: toAddress, subject, result: 'BLOCKED_NOT_ALLOWLISTED' });
      return res.status(403).json({
        success: false,
        error: 'recipient not on allowlist',
        detail: 'Only addresses on EMAIL_SEND_ALLOWLIST (or SENDABLE_FINDA_SALE_ADDRESSES) may be emailed.',
      });
    }

    // Belt-and-suspenders: rail-level domain block (placeholder / blocked domains).
    if (isEmailDomainBlocked(toAddress)) {
      auditLog({ caller, recipient: toAddress, subject, result: 'BLOCKED_DOMAIN' });
      return res.status(403).json({ success: false, error: 'Recipient domain blocked' });
    }

    // --- CONTROL 4: PER-DAY CAP (counted from the persisted audit counter) ---
    const dailyCap = Math.max(0, parseInt(process.env.EMAIL_SEND_DAILY_CAP || '10', 10));
    const key = todayKey();
    const existing = await prisma.emailQuotaLog.findUnique({ where: { date: key } });
    const sentToday = existing?.count ?? 0;
    if (sentToday >= dailyCap) {
      auditLog({ caller, recipient: toAddress, subject, result: 'BLOCKED_DAILY_CAP' });
      return res.status(429).json({
        success: false,
        error: 'daily send cap reached',
        detail: `EMAIL_SEND_DAILY_CAP=${dailyCap} reached for ${key}.`,
      });
    }

    // Atomically increment the audit counter BEFORE sending (fail-closed: if the
    // send throws after this, the slot is still consumed — conservative for an
    // abuse-sensitive endpoint).
    await prisma.emailQuotaLog.upsert({
      where: { date: key },
      update: { count: { increment: 1 } },
      create: { date: key, count: 1 },
    });

    // --- SEND via the EXISTING Gmail rail (no new transport) ---
    const { emailService } = await import('../lib/emailService');
    const fromAddress = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
    const result = await emailService.emails.send({
      from: `FindA.Sale <${fromAddress}>`,
      to: toAddress,
      subject,
      html: body,
      jobName: 'admin-send-email',
    });
    const messageId = (result as any)?.data?.id ?? undefined;

    // --- CONTROL 5: AUDIT (success) ---
    auditLog({ caller, recipient: toAddress, subject, result: `SENT messageId=${messageId ?? 'n/a'}` });

    return res.json({ success: true, messageId, rail: 'gmail', sentToday: sentToday + 1, dailyCap });
  } catch (err: any) {
    auditLog({
      caller,
      recipient: String(req.body?.to ?? ''),
      subject: String(req.body?.subject ?? ''),
      result: `ERROR ${err?.message ?? 'unknown'}`,
    });
    console.error('[admin/send-email] Unexpected error:', err);
    return res.status(500).json({ success: false, error: err?.message ?? 'Internal server error' });
  }
}
