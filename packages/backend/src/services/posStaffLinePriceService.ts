import { checkPermission } from './workspacePermissionService';
import { WORKSPACE_PERMISSIONS } from '../utils/workspacePermissions';
import { prisma } from '../lib/prisma';
import type { ResolvedPosActor } from '../utils/posAuth';

/**
 * Security fix (2026-11-04, finding #13, owner decision): the cash register path (processCashSaleCore)
 * trusted the client-sent items[].amount for catalog items, so a TEAM_MEMBER cashier could ring a
 * catalog item up for pennies and skip the per-member discount permission and cap that
 * resolvePosDiscount enforces. This applies the SAME rules to per-line price reductions:
 *   - ORGANIZER (the owner) keeps the override rights the cash path already gave them: no check.
 *   - TEAM_MEMBER without apply_pos_discount: every catalog line must be at least its DB price.
 *   - TEAM_MEMBER with the permission and a PERCENT cap: each line at least price less cap%, and the
 *     line reductions plus the cart discount together at most cap% of the catalog subtotal.
 *   - TEAM_MEMBER with the permission and a FIXED (dollar) cap: line reductions plus the cart discount
 *     together at most the cap.
 *   - TEAM_MEMBER with the permission and no cap: uncapped, same as resolvePosDiscount.
 * Lines without a DB price (misc/custom amounts) and server-priced bulk lot lines are not passed in.
 */
export type StaffLinePrice = { title: string; dbPriceCents: number; lineCents: number };

export async function checkStaffLinePrices(opts: {
  actor: Pick<ResolvedPosActor, 'actorKind' | 'workspaceId' | 'workspaceRole'> | { actorKind?: string; workspaceId?: string; workspaceRole?: any };
  lines: StaffLinePrice[];
  cartDiscountCents: number;
  catalogSubtotalCents: number;
}): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const { actor, lines, cartDiscountCents, catalogSubtotalCents } = opts;
  if (actor.actorKind !== 'TEAM_MEMBER') return { ok: true };

  const reduced = lines.filter((l) => l.lineCents < l.dbPriceCents);
  if (reduced.length === 0) return { ok: true };

  const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  if (!actor.workspaceId || !actor.workspaceRole) {
    return { ok: false, status: 403, message: 'Unable to verify discount permission for this account' };
  }
  const allowed = await checkPermission(actor.workspaceId, actor.workspaceRole, WORKSPACE_PERMISSIONS.APPLY_POS_DISCOUNT);
  if (!allowed) {
    const first = reduced[0];
    return {
      ok: false,
      status: 400,
      message: `"${first.title}" must be sold at its price of ${dollars(first.dbPriceCents)}. Your role cannot lower prices. Ask the organizer to enable discounts for your role.`,
    };
  }

  const settings = await prisma.workspaceSettings.findUnique({
    where: { workspaceId: actor.workspaceId },
    select: { staffDiscountCapType: true, staffDiscountCapValue: true },
  });
  if (!settings?.staffDiscountCapType || settings.staffDiscountCapValue == null) return { ok: true };

  const capValue = Number(settings.staffDiscountCapValue);
  const lineReductionCents = reduced.reduce((sum, l) => sum + (l.dbPriceCents - l.lineCents), 0);
  const totalDiscountCents = lineReductionCents + Math.max(0, cartDiscountCents);

  if (settings.staffDiscountCapType === 'PERCENT') {
    for (const l of reduced) {
      const minCents = Math.round(l.dbPriceCents * (1 - capValue / 100));
      if (l.lineCents < minCents) {
        return { ok: false, status: 400, message: `Max discount for your role is ${capValue}%. "${l.title}" cannot go below ${dollars(minCents)}.` };
      }
    }
    if (totalDiscountCents > Math.round((capValue / 100) * catalogSubtotalCents)) {
      return { ok: false, status: 400, message: `Max discount for your role is ${capValue}%.` };
    }
    return { ok: true };
  }

  // staffDiscountCapType === 'FIXED' (dollars)
  if (totalDiscountCents > Math.round(capValue * 100)) {
    return { ok: false, status: 400, message: `Max discount for your role is $${capValue.toFixed(2)}.` };
  }
  return { ok: true };
}
