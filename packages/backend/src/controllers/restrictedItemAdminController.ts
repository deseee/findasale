/**
 * Admin endpoints for restricted-item card blocking (2026-11-06). Mounted in routes/admin.ts, which applies
 * authenticate + requireAdmin to every route (router.use), and each handler re-checks the admin role itself so a future
 * re-mount cannot expose it. Only fixed, validated body fields are read (no spread of req.body).
 *
 *   PATCH /api/admin/organizers/:organizerId/card-suspension   { suspended: boolean, reason: string }
 *   PATCH /api/admin/items/:itemId/restricted-class            { override: <class> | null, reason: string }
 *   GET   /api/admin/restricted-items/audit?organizerId=&itemId=&limit=
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { setOrganizerCardSuspension, type SuspensionTxClient } from '../services/restrictedItem/cardSuspensionService';
import { setRestrictedClassOverride, type RawSqlClient } from '../services/restrictedItem/restrictedClassStore';
import { isRestrictedItemClassName } from '../services/restrictedItem/restrictedItemClassifier';

function isAdmin(req: AuthRequest): boolean {
  return !!req.user && (req.user.roles?.includes('ADMIN') || req.user.role === 'ADMIN');
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function readReason(body: unknown): string | null {
  const reason = (body as { reason?: unknown } | null)?.reason;
  if (typeof reason !== 'string') return null;
  const trimmed = reason.trim();
  return trimmed.length >= 3 && trimmed.length <= 500 ? trimmed : null;
}

export const setOrganizerCardSuspensionHandler = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: 'Admin access required' });
    const { organizerId } = req.params;
    if (!ID_RE.test(organizerId || '')) return res.status(400).json({ message: 'Invalid organizer id' });
    const suspended = (req.body as { suspended?: unknown } | null)?.suspended;
    if (typeof suspended !== 'boolean') return res.status(400).json({ message: 'suspended must be true or false' });
    const reason = readReason(req.body);
    if (!reason) return res.status(400).json({ message: 'reason is required (3 to 500 characters)' });
    const state = await setOrganizerCardSuspension(prisma as unknown as SuspensionTxClient, {
      organizerId,
      suspend: suspended,
      reason,
      adminUserId: req.user.id,
    });
    if (!state) return res.status(404).json({ message: 'Organizer not found' });
    return res.json({
      organizerId: state.organizerId,
      cardPaymentsSuspended: !!state.cardPaymentsSuspendedAt,
      cardPaymentsSuspendedAt: state.cardPaymentsSuspendedAt,
      cardPaymentsSuspendedReason: state.cardPaymentsSuspendedReason,
    });
  } catch (err) {
    console.error('[restrictedItemAdmin] card suspension failed:', (err as { name?: string })?.name ?? 'Error');
    return res.status(500).json({ message: 'Failed to update card suspension' });
  }
};

export const setItemRestrictedClassOverrideHandler = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: 'Admin access required' });
    const { itemId } = req.params;
    if (!ID_RE.test(itemId || '')) return res.status(400).json({ message: 'Invalid item id' });
    const body = (req.body ?? {}) as { override?: unknown };
    if (!Object.prototype.hasOwnProperty.call(body, 'override')) {
      return res.status(400).json({ message: 'override is required (a class name, or null to remove the override)' });
    }
    const override = body.override;
    if (override !== null && !isRestrictedItemClassName(override)) {
      return res.status(400).json({ message: 'override must be one of NONE, WEAPON, FIREARM_RELATED, KNIFE, COIN_BULLION_PRECIOUS_METAL, JEWELRY, or null' });
    }
    const reason = readReason(req.body);
    if (!reason) return res.status(400).json({ message: 'reason is required (3 to 500 characters)' });
    const result = await setRestrictedClassOverride(prisma as unknown as RawSqlClient, {
      itemId,
      override: override as any,
      reason,
      adminUserId: req.user.id,
    });
    if (!result.found) return res.status(404).json({ message: 'Item not found' });
    return res.json({ itemId, override, previousClass: result.previousEffective, restrictedClass: result.newEffective });
  } catch (err) {
    console.error('[restrictedItemAdmin] class override failed:', (err as { name?: string })?.name ?? 'Error');
    return res.status(500).json({ message: 'Failed to update restricted class' });
  }
};

export const listRestrictedItemAuditHandler = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: 'Admin access required' });
    const organizerId = typeof req.query.organizerId === 'string' && ID_RE.test(req.query.organizerId) ? req.query.organizerId : undefined;
    const itemId = typeof req.query.itemId === 'string' && ID_RE.test(req.query.itemId) ? req.query.itemId : undefined;
    const limitRaw = Number(req.query.limit);
    const take = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 50;
    const rows = await prisma.restrictedItemAuditLog.findMany({
      where: { ...(organizerId ? { organizerId } : {}), ...(itemId ? { itemId } : {}) },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return res.json({ rows });
  } catch (err) {
    console.error('[restrictedItemAdmin] audit list failed:', (err as { name?: string })?.name ?? 'Error');
    return res.status(500).json({ message: 'Failed to load audit log' });
  }
};
