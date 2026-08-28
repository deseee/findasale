/**
 * POS Cashier Discount Permission — shared discount resolution (2026-08-28).
 *
 * Single source of truth for validating and computing a POS checkout discount,
 * used by BOTH posPaymentController.ts createPaymentRequest (send-to-phone flow)
 * and terminalController.ts createTerminalPaymentIntent (card-present/cash flow) --
 * do not duplicate this logic in either controller.
 *
 * Contract (see claude_docs/feature-notes/ADR-pos-cashier-discount-permission.md):
 *   - No discount fields sent (absent/zero) => resolvePosDiscount is a no-op that
 *     returns discountAmountCents: 0. Callers should treat this identically to today's
 *     pre-feature behavior -- this function does NOT touch or re-derive the client's
 *     total in that case.
 *   - Discount fields present and non-zero => the actor must be permission-checked
 *     (ORGANIZER always allowed/uncapped; TEAM_MEMBER requires the apply_pos_discount
 *     WorkspacePermission, and is subject to the workspace's staffDiscountCap if one is
 *     configured). This function computes discountAmountCents server-side from
 *     catalogSubtotalCents -- it NEVER trusts a client-supplied discount amount in cents
 *     directly, only a type + raw value (percent or dollars) which it applies itself.
 *   - This function does not touch misc/custom-amount cart items (no catalog price) --
 *     those remain exactly as trusted/flexible as they were before this feature.
 */

import { checkPermission } from './workspacePermissionService';
import { WORKSPACE_PERMISSIONS } from '../utils/workspacePermissions';
import { prisma } from '../lib/prisma';
import type { ResolvedPosActor } from '../utils/posAuth';

export type DiscountRequestInput = {
  discountType?: string | null; // 'PERCENT' | 'FIXED'
  discountValue?: number | null; // percent 0-100 for PERCENT, DOLLARS (not cents) for FIXED -- matches discountValueRaw's schema semantics
  discountReasonNote?: string | null;
};

export type PosDiscountResolution =
  | {
      ok: true;
      discountAmountCents: number; // 0 when no discount was requested
      discountType: string | null;
      discountValueRaw: number | null;
      discountReasonNote: string | null;
    }
  | { ok: false; status: number; message: string };

const VALID_TYPES = new Set(['PERCENT', 'FIXED']);

/**
 * @param catalogSubtotalCents - sum of item.price (in cents) for every catalog item
 *   (has a known DB price) in the cart. Callers compute this themselves from their own
 *   already-fetched item rows -- this function doesn't re-query items, to avoid a second
 *   round trip and keep it decoupled from each controller's own item-fetch shape.
 */
export async function resolvePosDiscount(opts: {
  actor: ResolvedPosActor;
  input: DiscountRequestInput;
  catalogSubtotalCents: number;
}): Promise<PosDiscountResolution> {
  const { actor, input, catalogSubtotalCents } = opts;
  const { discountType, discountValue, discountReasonNote } = input;

  // No discount requested -- no-op, zero behavior change from pre-feature code.
  if (!discountType && (discountValue == null || discountValue === 0)) {
    return { ok: true, discountAmountCents: 0, discountType: null, discountValueRaw: null, discountReasonNote: null };
  }

  if (!discountType || !VALID_TYPES.has(discountType)) {
    return { ok: false, status: 400, message: "discountType must be 'PERCENT' or 'FIXED'" };
  }
  if (typeof discountValue !== 'number' || !Number.isFinite(discountValue) || discountValue <= 0) {
    return { ok: false, status: 400, message: 'discountValue must be a positive number' };
  }
  if (discountType === 'PERCENT' && discountValue > 100) {
    return { ok: false, status: 400, message: 'discountValue cannot exceed 100 for a PERCENT discount' };
  }

  // Permission + cap check -- ORGANIZER discounting their own sale is always allowed,
  // uncapped, no permission lookup needed.
  if (actor.actorKind === 'TEAM_MEMBER') {
    if (!actor.workspaceId || !actor.workspaceRole) {
      // Should be unreachable -- resolveOrganizerOrTeamMember always populates both on the
      // TEAM_MEMBER branch. Fail closed rather than assume.
      return { ok: false, status: 403, message: 'Unable to verify discount permission for this account' };
    }

    const allowed = await checkPermission(actor.workspaceId, actor.workspaceRole, WORKSPACE_PERMISSIONS.APPLY_POS_DISCOUNT);
    if (!allowed) {
      return { ok: false, status: 403, message: 'You do not have permission to apply a discount. Ask the organizer to enable it for your role.' };
    }

    const settings = await prisma.workspaceSettings.findUnique({
      where: { workspaceId: actor.workspaceId },
      select: { staffDiscountCapType: true, staffDiscountCapValue: true },
    });

    if (settings?.staffDiscountCapType && settings.staffDiscountCapValue != null) {
      const capValue = Number(settings.staffDiscountCapValue);
      if (settings.staffDiscountCapType === 'PERCENT') {
        if (discountType !== 'PERCENT' || discountValue > capValue) {
          // A FIXED discount can't be directly compared to a PERCENT cap without knowing
          // the cart total in dollars -- reject FIXED outright when the cap is PERCENT-typed
          // rather than guess at an equivalence. Organizer can set a FIXED cap instead if
          // that's the intended control.
          if (discountType === 'PERCENT') {
            return { ok: false, status: 400, message: `Max discount for your role is ${capValue}%.` };
          }
          return { ok: false, status: 400, message: `Your role's discount cap is set as a percent (${capValue}%). Use a percent discount instead of a fixed amount.` };
        }
      } else {
        // staffDiscountCapType === 'FIXED' (dollars)
        if (discountType === 'FIXED' && discountValue > capValue) {
          return { ok: false, status: 400, message: `Max discount for your role is $${capValue.toFixed(2)}.` };
        }
        if (discountType === 'PERCENT') {
          const impliedDollars = (discountValue / 100) * (catalogSubtotalCents / 100);
          if (impliedDollars > capValue) {
            return { ok: false, status: 400, message: `Max discount for your role is $${capValue.toFixed(2)}.` };
          }
        }
      }
    }
  }

  const discountAmountCents =
    discountType === 'PERCENT'
      ? Math.round((discountValue / 100) * catalogSubtotalCents)
      : Math.round(discountValue * 100);

  if (discountAmountCents > catalogSubtotalCents) {
    return { ok: false, status: 400, message: 'Discount cannot exceed the cart subtotal' };
  }

  return {
    ok: true,
    discountAmountCents,
    discountType,
    discountValueRaw: discountValue,
    discountReasonNote: discountReasonNote?.trim() ? discountReasonNote.trim().slice(0, 280) : null,
  };
}
