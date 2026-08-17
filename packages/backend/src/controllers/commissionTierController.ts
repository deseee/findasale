import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  LadderValidationError,
  TierInput,
  DEFAULT_LADDER,
  coerceLadderInput,
  coerceTierInput,
  listTiers,
  loadLadderAsInput,
  replaceLadder,
} from '../services/commissionTierService';

/**
 * commissionTierController.ts — organizer-facing CRUD for the CommissionTier
 * ladder introduced by ADR-096.
 *
 * Before this file, seedDefaultCommissionTiers() wrote a hardcoded four-band
 * ladder on a consignor's first opt-in and nothing could read or change it
 * again. Every endpoint here is scoped to the caller's own workspace.
 *
 * Authorization is the same three-step gate consignorController uses:
 *   authenticate middleware -> organizer profile -> TEAMS subscription.
 * Writes add a fourth step: the workspace must actually be opted into tiered
 * commission (at least one consignor with useTieredCommission = true), so a
 * ladder can't be edited on a workspace where it has no effect.
 */

interface WorkspaceContext {
  organizerId: string;
  workspaceId: string;
}

/**
 * Resolve the caller's own workspace, or send the right error response.
 *
 * Returns null after responding. Callers MUST return immediately on null.
 * The workspace is looked up from req.user.id only — never from a request
 * parameter or body — which is what makes cross-tenant access impossible:
 * there is no client-supplied input that can change which workspace is used.
 */
async function requireOwnWorkspace(
  req: AuthRequest,
  res: Response
): Promise<WorkspaceContext | null> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  const organizer = await prisma.organizer.findUnique({
    where: { userId: req.user.id },
    select: { id: true, subscriptionTier: true },
  });

  if (!organizer) {
    res.status(404).json({ error: 'Organizer profile not found' });
    return null;
  }

  if (organizer.subscriptionTier !== 'TEAMS') {
    res.status(403).json({ error: 'TEAMS subscription required' });
    return null;
  }

  const workspace = await prisma.organizerWorkspace.findFirst({
    where: { ownerId: organizer.id },
    select: { id: true },
  });

  if (!workspace) {
    res.status(404).json({ error: 'Workspace not found' });
    return null;
  }

  return { organizerId: organizer.id, workspaceId: workspace.id };
}

/** True when at least one consignor in this workspace has tiered commission turned on. */
async function isOptedIntoTieredCommission(workspaceId: string): Promise<boolean> {
  const count = await prisma.consignor.count({
    where: { workspaceId, useTieredCommission: true },
  });
  return count > 0;
}

/**
 * Resource-state gate for every write.
 *
 * Editing a ladder on a workspace where no consignor uses tiered commission
 * would change numbers that pay nobody, and would let a ladder drift silently
 * before anyone opts in. Reads stay open so the organizer can preview the
 * ladder before turning it on.
 */
async function requireOptIn(workspaceId: string, res: Response): Promise<boolean> {
  if (await isOptedIntoTieredCommission(workspaceId)) return true;
  res.status(409).json({
    error:
      'Turn on tiered commission for at least one consignor before editing the rate ladder. Open a consignor, switch on tiered commission, and the starting rates will be created for you.',
    code: 'TIERED_COMMISSION_NOT_ENABLED',
  });
  return false;
}

function sendValidationError(res: Response, error: unknown): boolean {
  if (error instanceof LadderValidationError) {
    res.status(400).json({ error: error.message, code: 'INVALID_LADDER' });
    return true;
  }
  return false;
}

/**
 * GET /api/commission-tiers
 * The caller's own ladder plus the flags the UI needs to pick a state.
 */
export const getCommissionTiers = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireOwnWorkspace(req, res);
    if (!ctx) return;

    const [tiers, optedIn, consignorCount] = await Promise.all([
      listTiers(ctx.workspaceId),
      isOptedIntoTieredCommission(ctx.workspaceId),
      prisma.consignor.count({ where: { workspaceId: ctx.workspaceId } }),
    ]);

    return res.status(200).json({
      tiers,
      optedIn,
      consignorCount,
      editable: optedIn,
    });
  } catch (error) {
    console.error('[getCommissionTiers] Error:', error);
    return res.status(500).json({ error: 'Failed to load commission tiers' });
  }
};

/**
 * PUT /api/commission-tiers
 * Replace the whole ladder. This is the save path for the editor and the
 * reorder path as well — band order is derived from minPrice, so moving a band
 * is a rewrite of the ladder, not a stored position change.
 * Body: { tiers: [{ minPrice, maxPrice, consignorRate }, ...] }
 */
export const replaceCommissionTiers = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireOwnWorkspace(req, res);
    if (!ctx) return;
    if (!(await requireOptIn(ctx.workspaceId, res))) return;

    const payload = Array.isArray(req.body) ? req.body : req.body?.tiers;
    const tiers = coerceLadderInput(payload);
    const saved = await replaceLadder(ctx.workspaceId, tiers);

    return res.status(200).json({ tiers: saved });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    console.error('[replaceCommissionTiers] Error:', error);
    return res.status(500).json({ error: 'Failed to save commission tiers' });
  }
};

/**
 * POST /api/commission-tiers
 * Add one band. Validated against the ladder it would produce, not on its own,
 * so a band that opens a gap or overlaps an existing band is rejected.
 * Body: { minPrice, maxPrice, consignorRate }
 */
export const createCommissionTier = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireOwnWorkspace(req, res);
    if (!ctx) return;
    if (!(await requireOptIn(ctx.workspaceId, res))) return;

    const incoming = coerceTierInput(req.body, 'New band');
    const current = await loadLadderAsInput(ctx.workspaceId);
    const projected: TierInput[] = [...current.map((c) => c.input), incoming];

    const saved = await replaceLadder(ctx.workspaceId, projected);
    return res.status(201).json({ tiers: saved });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    console.error('[createCommissionTier] Error:', error);
    return res.status(500).json({ error: 'Failed to add commission tier' });
  }
};

/**
 * PUT /api/commission-tiers/:id
 * Update one band, again validated against the resulting ladder.
 * Body: { minPrice?, maxPrice?, consignorRate? }
 */
export const updateCommissionTier = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireOwnWorkspace(req, res);
    if (!ctx) return;
    if (!(await requireOptIn(ctx.workspaceId, res))) return;

    const { id } = req.params;

    // Ownership check: the row must live in the caller's own workspace.
    // A tier id belonging to another organizer reads as "not found" — it never
    // reveals that the row exists and never becomes a write target.
    const existing = await prisma.commissionTier.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Commission tier not found' });
    }

    const current = await loadLadderAsInput(ctx.workspaceId);
    const target = current.find((c) => c.id === id);
    if (!target) {
      // Row disappeared between the ownership check and the read (concurrent
      // edit). Report it as gone rather than throwing a 500.
      return res.status(404).json({ error: 'Commission tier not found' });
    }
    const before = target.input;

    // Merge only the three editable fields; anything else in the body is dropped.
    const merged = coerceTierInput(
      {
        minPrice: req.body?.minPrice === undefined ? before.minPrice : req.body.minPrice,
        maxPrice: req.body?.maxPrice === undefined ? before.maxPrice : req.body.maxPrice,
        consignorRate:
          req.body?.consignorRate === undefined ? before.consignorRate : req.body.consignorRate,
      },
      'Band'
    );

    const projected: TierInput[] = current.map((c) => (c.id === id ? merged : c.input));
    const saved = await replaceLadder(ctx.workspaceId, projected);

    return res.status(200).json({ tiers: saved });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    console.error('[updateCommissionTier] Error:', error);
    return res.status(500).json({ error: 'Failed to update commission tier' });
  }
};

/**
 * DELETE /api/commission-tiers/:id
 * Remove one band. Rejected when what's left would have a gap — deleting a
 * middle band silently would leave items in that price range unpriced, so the
 * organizer is told to extend a neighbouring band first.
 */
export const deleteCommissionTier = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireOwnWorkspace(req, res);
    if (!ctx) return;
    if (!(await requireOptIn(ctx.workspaceId, res))) return;

    const { id } = req.params;

    const existing = await prisma.commissionTier.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Commission tier not found' });
    }

    const current = await loadLadderAsInput(ctx.workspaceId);
    const projected = current.filter((c) => c.id !== id).map((c) => c.input);

    if (projected.length === 0) {
      return res.status(400).json({
        error:
          'This is the only band left. A ladder needs at least one band — edit this one instead of removing it.',
        code: 'INVALID_LADDER',
      });
    }

    const saved = await replaceLadder(ctx.workspaceId, projected);
    return res.status(200).json({ tiers: saved });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    console.error('[deleteCommissionTier] Error:', error);
    return res.status(500).json({ error: 'Failed to remove commission tier' });
  }
};

/**
 * POST /api/commission-tiers/reset
 * Restore the starting ladder. Same four bands seedDefaultCommissionTiers()
 * writes, so an organizer who edits their way into a corner can get back to a
 * known-good state without support.
 */
export const resetCommissionTiers = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireOwnWorkspace(req, res);
    if (!ctx) return;
    if (!(await requireOptIn(ctx.workspaceId, res))) return;

    const saved = await replaceLadder(ctx.workspaceId, DEFAULT_LADDER);
    return res.status(200).json({ tiers: saved });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    console.error('[resetCommissionTiers] Error:', error);
    return res.status(500).json({ error: 'Failed to restore starting rates' });
  }
};
