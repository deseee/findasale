import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ItemRarity } from '@prisma/client';
import { sendConsignorPaymentRecorded } from '../services/consignorEmailService';
import { seedDefaultCommissionTiers, getConsignorMarkdownPolicyNotice } from '../services/commissionCalcService';
import {
  LedgerError,
  METHOD_LABELS,
  STATEMENT_FOOTER,
  buildStatement,
  getOwedByConsignor,
  money,
  normalizeLegacyMethodInput,
  normalizePayoutStatus,
  payoutReference,
  periodLabelFor,
  recordDirectPayout,
  serializeExcluded,
  serializePayout,
  validateMarkPaidInput,
} from '../services/consignorLedgerService';
import { renderConsignorAgreementForConsignor } from '../services/consignorAgreementService';
import { classifyEbayShipping } from '../utils/ebayShippingClassifier';
import { findLinkableUserId, sendWelcomeInviteNonBlocking, sendWelcomeInviteForConsignor } from '../services/consignorInviteService';
import { CONSIGNOR_SQUARE_CLEARED_FIELDS, consignorHasSquareData, consignorSquareStatus } from '../utils/consignorSquareStatus';

// Consignor intake follow-up (2026-09-24): tiny, deliberately-duplicated mirror of
// itemController.ts's local (non-exported) assignRarity() -- same 4-line price-tier
// logic, S261-locked boundaries (>=500 LEGENDARY, >=75 RARE, >=25 UNCOMMON, else COMMON).
// Not imported because that function is private to itemController.ts; extracting it to
// shared/ for one additional caller was judged not worth the refactor risk here, but if
// the rarity boundaries ever change this copy must change too -- flagged in the handoff.
function assignRarityForIntakeItem(price: number | null | undefined): ItemRarity {
  if (!price || price < 25) return ItemRarity.COMMON;
  if (price >= 500) return ItemRarity.LEGENDARY;
  if (price >= 75) return ItemRarity.RARE;
  return ItemRarity.UNCOMMON;
}

/**
 * Helper: Get organizer workspace from authenticated user
 * Returns { organizer, workspace } or null if not found
 * Exported (2026-09-25) so consignorIntakeController.ts's Approve action can resolve the
 * same organizer/workspace pair without duplicating this lookup.
 */
export async function getOrganizerWorkspace(userId: string): Promise<{ organizer: any; workspace: any } | null> {
  const organizer = await prisma.organizer.findUnique({
    where: { userId },
  });
  if (!organizer) return null;

  const workspace = await prisma.organizerWorkspace.findFirst({
    where: { ownerId: organizer.id },
  });
  return workspace ? { organizer, workspace } : null;
}

/**
 * Thrown by createConsignorCore for any validation failure -- callers translate this into
 * their own response shape (status + { error: message }) instead of createConsignorCore
 * writing to `res` itself, so the same helper works from both an Express handler
 * (createConsignor below) and consignorIntakeController.ts's approve action.
 */
export class ConsignorValidationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = 'ConsignorValidationError';
  }
}

/**
 * Consignor Self-Serve Intake (2026-09-25): the actual Consignor-creation logic, extracted
 * out of createConsignor below so the manual "Add Consignor" form (createConsignor) and the
 * intake-request Approve action (consignorIntakeController.ts) share one validated code path
 * instead of two copies of the same rules drifting apart. Does NOT touch req/res -- validation
 * failures throw ConsignorValidationError, which each caller maps to its own response.
 *
 * `client` defaults to the module-level `prisma` but accepts a `Prisma.TransactionClient` so
 * callers that need the Consignor created atomically alongside other writes (e.g.
 * createConsignor's optional first-item intake, or Approve's appointment-confirmation update)
 * can pass their transaction's `tx` through.
 */
// Prisma v5: prisma is $extends-wrapped, so the client `prisma.$transaction(cb)` hands to
// `cb` is the EXTENDED transaction flavor (Omit<typeof prisma, ITXClientDenyList>), which is
// NOT assignable to the plain `Prisma.TransactionClient`. Accept either so every call site
// (base prisma, a raw tx, or an extended interactive-transaction tx) type-checks. Same pattern
// as itemStockService.ts sellItemUnits / xpService.ts spendXp (Prisma v5 pitfall, confirmed via
// Railway build failure 2026-09-25, TS2345 on this exact function -- see STATE.md).
/**
 * Consignor invite + account link (2026-10-06): strips fields an organizer must never receive from
 * every organizer-facing Consignor response. userId (the link to a FindA.Sale account) is stripped and
 * NOT replaced by any flag (2026-10-06 privacy decision: an organizer must not learn whether an email
 * belongs to a FindA.Sale account); the portal OAuth nonce hash and the encrypted Square tokens are
 * internal. Adds squareStatus (NOT_CONNECTED | ACTIVE | NEEDS_ACTIVATION).
 */
export function toOrganizerConsignorView<T extends Record<string, any>>(row: T) {
  const {
    userId: _userId,
    squarePortalOAuthNonce: _nonce,
    squareAccessTokenEncrypted: _at,
    squareRefreshTokenEncrypted: _rt,
    ...rest
  } = row as any;
  return {
    ...rest,
    squareStatus: consignorSquareStatus(row as any),
  } as Omit<T, 'userId' | 'squarePortalOAuthNonce' | 'squareAccessTokenEncrypted' | 'squareRefreshTokenEncrypted'> & {
    squareStatus: ReturnType<typeof consignorSquareStatus>;
  };
}

type ConsignorTxClient =
  | Prisma.TransactionClient
  | Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export async function createConsignorCore(
  params: {
    workspaceId: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    commissionRate: unknown;
    useTieredCommission?: unknown;
    unsoldItemDisposition?: unknown;
    notes?: string | null;
  },
  clientParam: ConsignorTxClient = prisma
) {
  // See itemStockService.ts sellItemUnits for why this explicit-annotation cast (not
  // `const client = clientParam`) is required -- letting TS infer the union type on this
  // variable risks the same "excessive stack depth" Prisma v5 pitfall once used with
  // model delegates below.
  const client: Prisma.TransactionClient = clientParam as Prisma.TransactionClient;
  const { workspaceId, name, email, phone, commissionRate, useTieredCommission, unsoldItemDisposition, notes } = params;

  if (!name || commissionRate === undefined || commissionRate === null || commissionRate === '') {
    throw new ConsignorValidationError('name and commissionRate required');
  }

  if (
    unsoldItemDisposition !== undefined &&
    unsoldItemDisposition !== null &&
    !['RETURN', 'DONATE', 'RELIST'].includes(unsoldItemDisposition as string)
  ) {
    throw new ConsignorValidationError("unsoldItemDisposition must be 'RETURN', 'DONATE', 'RELIST', or omitted");
  }

  const rate = parseFloat(commissionRate as any);
  if (isNaN(rate) || rate < 0 || rate > 100) {
    throw new ConsignorValidationError('commissionRate must be 0-100');
  }

  const tiered = useTieredCommission === true;
  // ADR-096: opt-in tiered commission. Seed the workspace's default ladder the first time
  // anyone turns this on, so the toggle never silently no-ops. Uses the module-level `prisma`
  // (not `client`) even inside a transaction, matching createConsignor's pre-existing
  // behavior -- seeding is idempotent (seedDefaultCommissionTiers no-ops if tiers already
  // exist) and workspace-scoped, not Consignor-row-scoped, so it doesn't need the same
  // atomicity guarantee as the Consignor row itself.
  if (tiered) {
    await seedDefaultCommissionTiers(workspaceId);
  }

  // Consignor invite + account link (2026-10-06): link to an existing FindA.Sale account when the
  // email matches exactly one live User, case-insensitively (consignorInviteService.findLinkableUserId).
  // Runs on `client`, so inside a transaction it is part of the same atomic create.
  const userId = await findLinkableUserId(client, email);

  const consignor = await client.consignor.create({
    data: {
      workspaceId,
      name,
      email: email || null,
      phone: phone || null,
      commissionRate: new Decimal(rate),
      useTieredCommission: tiered,
      unsoldItemDisposition: (unsoldItemDisposition as string) || null,
      notes: notes || null,
      userId,
    },
  });

  // Returns the raw row (including userId, internal only). Callers that answer an organizer pass it
  // through toOrganizerConsignorView, which strips userId; no account-link flag is ever returned.
  return consignor;
}

/**
 * GET /api/consignors
 * List all consignors for the organizer's workspace
 * Requires: authenticate, TEAMS subscription
 */
export const listConsignors = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get organizer's workspace
    const result = await getOrganizerWorkspace(req.user.id);

    if (!result) {
      return res.status(404).json({ error: 'Organizer profile not found' });
    }

    const { organizer, workspace } = result;

    // Check TEAMS tier
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    // Archived consignors are hidden by default (so every picker that calls this list stops offering them). ?archived=only lists just the
    // archived ones (the consignors page's Archived filter); ?archived=all lists both. Money reads never go through this filter.
    const archivedParam = typeof req.query.archived === 'string' ? req.query.archived : '';
    const archivedFilter =
      archivedParam === 'only' ? { archivedAt: { not: null } } : archivedParam === 'all' ? {} : { archivedAt: null };

    const consignors = await prisma.consignor.findMany({
      where: { workspaceId: workspace.id, ...archivedFilter },
      include: {
        items: {
          where: { status: 'SOLD' },
          select: { id: true, title: true, price: true },
        },
        payouts: {
          select: {
            id: true,
            totalSales: true,
            commissionAmount: true,
            netPayout: true,
            paidAt: true,
            method: true,
            status: true,
            settlementBatchId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Organizer-settles ledger (2026-09-29): what each consignor is owed comes from the ledger
    // (SOLD items with no live payout line), not from summing the payout history. Fails open:
    // the list must still load if the owed calculation errors, so those fields become null.
    let owedByConsignor: Awaited<ReturnType<typeof getOwedByConsignor>> | null = null;
    try {
      owedByConsignor = await getOwedByConsignor(prisma, workspace.id);
    } catch (owedErr) {
      console.error('[listConsignors] owed calculation failed:', owedErr);
    }

    // consignmentUnclaimedItemsJob.ts / "Unclaimed" badge support (2026-09-25): count each
    // consignor's AVAILABLE items whose intake (createdAt) is older than that consignor's own
    // returnPeriodDays -- same definition the daily job uses. Queried separately from the
    // `items` include above (which is deliberately SOLD-only for the existing Items/Sold
    // stats) rather than changing that include's meaning. Workspace-scoped for free: every
    // consignorId here comes from the workspace-filtered `consignors` list above, so this can
    // never pull in another workspace's items.
    const consignorIds = consignors.map((c) => c.id);
    const availableItems = consignorIds.length
      ? await prisma.item.findMany({
          where: { consignorId: { in: consignorIds }, status: 'AVAILABLE' },
          select: { consignorId: true, createdAt: true },
        })
      : [];
    const returnPeriodByConsignor = new Map(consignors.map((c) => [c.id, c.returnPeriodDays]));
    const unclaimedCountByConsignor = new Map<string, number>();
    const nowMs = Date.now();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    for (const item of availableItems) {
      if (!item.consignorId) continue;
      const days = returnPeriodByConsignor.get(item.consignorId) ?? 90;
      if (nowMs - item.createdAt.getTime() > days * MS_PER_DAY) {
        unclaimedCountByConsignor.set(item.consignorId, (unclaimedCountByConsignor.get(item.consignorId) || 0) + 1);
      }
    }

    // Relist Cap (2026-09-25, Patrick) / consignmentUnclaimedItemsJob.ts processRelistCapExceededItems:
    // "needs a decision" badge for RELIST-disposition consignors whose items have passed
    // returnPeriodDays + the workspace's maxRelistDays (platform default 90 when unset).
    // Computed live off the same `availableItems` pull above, independent of the sweep
    // job's relistCapFlaggedAt stamp -- exactly mirroring how unclaimedCount above is
    // independent of unclaimedNotifiedAt. Workspace-scoped for free, same as unclaimedCount.
    const workspaceSettingsForRelistCap = await prisma.workspaceSettings.findUnique({
      where: { workspaceId: workspace.id },
      select: { maxRelistDays: true },
    });
    const maxRelistDays = workspaceSettingsForRelistCap?.maxRelistDays ?? 90;
    const relistDispositionConsignorIds = new Set(
      consignors.filter((c) => c.unsoldItemDisposition === 'RELIST').map((c) => c.id)
    );
    const relistCapExceededCountByConsignor = new Map<string, number>();
    for (const item of availableItems) {
      if (!item.consignorId || !relistDispositionConsignorIds.has(item.consignorId)) continue;
      const returnPeriodDays = returnPeriodByConsignor.get(item.consignorId) ?? 90;
      const totalDays = returnPeriodDays + maxRelistDays;
      if (nowMs - item.createdAt.getTime() > totalDays * MS_PER_DAY) {
        relistCapExceededCountByConsignor.set(
          item.consignorId,
          (relistCapExceededCountByConsignor.get(item.consignorId) || 0) + 1
        );
      }
    }

    // Convert Decimal fields to strings for JSON serialization
    const serialized = consignors.map((c) => ({
      // toOrganizerConsignorView (2026-10-06): adds squareStatus and strips
      // userId, the portal OAuth nonce hash and the encrypted Square tokens from the response.
      ...toOrganizerConsignorView(c),
      unclaimedCount: unclaimedCountByConsignor.get(c.id) || 0,
      relistCapExceededCount: relistCapExceededCountByConsignor.get(c.id) || 0,
      // Ledger figures. owedAmount is the consignor's share still owed, as a 2-decimal string.
      owedAmount: owedByConsignor ? owedByConsignor.get(c.id)?.owedAmount ?? '0.00' : null,
      owedItemCount: owedByConsignor ? owedByConsignor.get(c.id)?.owedItemCount ?? 0 : null,
      owedHeldItemCount: owedByConsignor ? owedByConsignor.get(c.id)?.heldItemCount ?? 0 : null,
      payouts: c.payouts.map((p) => ({
        ...p,
        totalSales: p.totalSales.toString(),
        commissionAmount: p.commissionAmount.toString(),
        netPayout: p.netPayout.toString(),
        status: normalizePayoutStatus(p.status).status,
        rawStatus: p.status,
      })),
    }));

    return res.status(200).json(serialized);
  } catch (error) {
    console.error('[listConsignors] Error:', error);
    return res.status(500).json({ error: 'Failed to list consignors' });
  }
};

/**
 * POST /api/consignors
 * Create a new consignor
 * Body: { name, email?, phone?, commissionRate, notes? }
 * Requires: authenticate, TEAMS subscription
 */
export const createConsignor = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { name, email, phone, commissionRate, notes, useTieredCommission, unsoldItemDisposition, item, permissionToEmail } = req.body;

    // Permission attestation (2026-10-06): this endpoint is the organizer's manual "Add Consignor" form,
    // which emails the person a welcome invite. The organizer must affirm they have permission. Enforced
    // here only; createConsignorCore (shared with intake Approve, where the consignor asked to be added)
    // and other internal creators do not require it.
    if (permissionToEmail !== true) {
      return res.status(400).json({
        error: "Please confirm you have this person's permission to email them.",
        code: 'PERMISSION_TO_EMAIL_REQUIRED',
      });
    }

    // Get organizer's workspace
    const result = await getOrganizerWorkspace(req.user.id);

    if (!result) {
      return res.status(404).json({ error: 'Organizer profile not found' });
    }

    const { organizer, workspace } = result;

    // Check TEAMS tier
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    // name/commissionRate/unsoldItemDisposition/rate validation now lives in
    // createConsignorCore (below), shared with the intake-request Approve action.

    // Consignor intake follow-up (2026-09-24): optional single-item intake in the same
    // request, for the "only one item to bring in right now" case -- avoids a separate
    // trip through the full add-item form just to attach the very first item. `item` is
    // { saleId: string (required -- an Item must belong to a Sale), title: string
    // (required), price?, description?, category? }. Validated fully before any write so
    // a bad item payload never leaves a Consignor created with no way to retry atomically.
    let saleForItem: { id: string } | null = null;
    let parsedItemPrice: number | null = null;
    if (item !== undefined && item !== null) {
      if (typeof item !== 'object' || Array.isArray(item)) {
        return res.status(400).json({ error: 'item must be an object with saleId and title' });
      }
      if (!item.saleId || typeof item.saleId !== 'string') {
        return res.status(400).json({ error: 'item.saleId is required when including an item at intake' });
      }
      if (!item.title || typeof item.title !== 'string' || !item.title.trim()) {
        return res.status(400).json({ error: 'item.title is required when including an item at intake' });
      }
      if (item.price !== undefined && item.price !== null && item.price !== '') {
        parsedItemPrice = parseFloat(item.price);
        if (isNaN(parsedItemPrice) || parsedItemPrice < 0) {
          return res.status(400).json({ error: 'item.price must be a non-negative number' });
        }
      }
      // Scoped to this organizer -- same ownership check createItem uses for saleId, so a
      // client can never attach the new consignor's first item to another organizer's sale.
      saleForItem = await prisma.sale.findFirst({
        where: { id: item.saleId, organizerId: organizer.id },
        select: { id: true },
      });
      if (!saleForItem) {
        return res.status(404).json({ error: 'Sale not found or not yours.' });
      }
    }

    // Transaction: when an item is included, the Consignor and its first Item are created
    // together or not at all -- never a Consignor left with a half-failed item attach.
    let newConsignorId: string;
    try {
      const txResult = await prisma.$transaction(async (tx) => {
      const createdConsignor = await createConsignorCore(
        {
          workspaceId: workspace.id,
          name,
          email,
          phone,
          commissionRate,
          useTieredCommission,
          unsoldItemDisposition,
          notes,
        },
        tx
      );

      if (saleForItem) {
        await tx.item.create({
          data: {
            saleId: saleForItem.id,
            organizerId: organizer.id,
            title: item.title.trim(),
            description: item.description || '',
            price: parsedItemPrice,
            category: item.category || null,
            status: 'AVAILABLE',
            draftStatus: 'PUBLISHED',
            ebayShippingClassification: classifyEbayShipping(item.category || null, []),
            rarity: assignRarityForIntakeItem(parsedItemPrice),
            // U1: satisfies NOT NULL constraint; scheduleItemEmbedding (itemController.ts)
            // is not called here since this a lightweight intake path -- the item is still
            // fully editable afterward through the normal edit-item flow.
            embedding: [],
            consignorId: createdConsignor.id,
          },
        });
      }

      return { consignorId: createdConsignor.id };
      });
      newConsignorId = txResult.consignorId;
    } catch (err) {
      if (err instanceof ConsignorValidationError) {
        return res.status(err.status).json({ error: err.message });
      }
      throw err;
    }

    // Consignor invite (2026-10-06): email the portal link + Square payout setup. Never blocks or
    // fails creation (sendWelcomeInviteNonBlocking never throws and caps its wait); the result is
    // reported so the organizer sees whether it went out. inviteEmailSentAt is stamped only on a
    // successful send, inside the service.
    const welcomeEmail = await sendWelcomeInviteNonBlocking(newConsignorId);

    const consignor = await prisma.consignor.findUnique({
      where: { id: newConsignorId },
      include: {
        items: { select: { id: true, title: true, price: true, status: true, createdAt: true } },
        payouts: { select: { id: true, totalSales: true, commissionAmount: true, paidAt: true } },
      },
    });

    // Consignor intake disclosure (Patrick, 2026-09-25): tell the organizer, right at
    // onboarding, that this organizer's markdown schedule (if any) reduces the sale price
    // this consignor's payout is calculated from -- see getConsignorMarkdownPolicyNotice's
    // own comment in commissionCalcService.ts for why no payout-math change is needed.
    const markdownPolicy = await getConsignorMarkdownPolicyNotice(organizer.id);
    const markdownPolicyNotice = {
      configured: markdownPolicy.configured,
      message:
        `Heads up: this organizer may apply automatic, time-based markdowns to unsold consigned items. ` +
        `A markdown lowers the item's sale price, and ${name}'s payout is calculated from that lower price. ` +
        markdownPolicy.summary,
    };

    return res.status(201).json({
      ...(consignor ? toOrganizerConsignorView(consignor) : {}),
      markdownPolicyNotice,
      welcomeEmail,
    });
  } catch (error) {
    console.error('[createConsignor] Error:', error);
    return res.status(500).json({ error: 'Failed to create consignor' });
  }
};

/**
 * GET /api/consignors/:id
 * Get consignor details including items and payout history
 * Requires: authenticate, TEAMS subscription
 */
export const getConsignor = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    // Get organizer's workspace
    const result = await getOrganizerWorkspace(req.user.id);

    if (!result) {
      return res.status(404).json({ error: 'Organizer profile not found' });
    }

    const { organizer, workspace } = result;

    // Check TEAMS tier
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    const consignor = await prisma.consignor.findFirst({
      where: { id, workspaceId: workspace.id },
      include: {
        items: {
          select: {
            id: true,
            title: true,
            price: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        payouts: {
          select: {
            id: true,
            totalSales: true,
            commissionAmount: true,
            netPayout: true,
            method: true,
            paidAt: true,
            notes: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!consignor) {
      return res.status(404).json({ error: 'Consignor not found' });
    }

    // toOrganizerConsignorView (2026-10-06, security pass): this response previously included the
    // encrypted Square token columns; they are now stripped, along with userId and the portal nonce.
    return res.status(200).json(toOrganizerConsignorView(consignor));
  } catch (error) {
    console.error('[getConsignor] Error:', error);
    return res.status(500).json({ error: 'Failed to get consignor' });
  }
};

/**
 * PUT /api/consignors/:id
 * Update consignor information
 * Body: { name?, email?, phone?, commissionRate?, notes? }
 * Requires: authenticate, TEAMS subscription
 */
export const updateConsignor = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const { name, email, phone, commissionRate, notes, useTieredCommission, unsoldItemDisposition } = req.body;

    // Get organizer's workspace
    const result = await getOrganizerWorkspace(req.user.id);

    if (!result) {
      return res.status(404).json({ error: 'Organizer profile not found' });
    }

    const { organizer, workspace } = result;

    // Check TEAMS tier
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    // Verify consignor exists and belongs to workspace
    const consignor = await prisma.consignor.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!consignor) {
      return res.status(404).json({ error: 'Consignor not found' });
    }

    // Validate commissionRate if provided
    let updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) {
      updateData.email = email;
      // Consignor account link (2026-10-06): re-evaluate when the email changes so the link
      // always reflects the current address (exactly-one, case-insensitive match, else null).
      updateData.userId = await findLinkableUserId(prisma as unknown as Prisma.TransactionClient, email);
    }
    if (phone !== undefined) updateData.phone = phone;
    if (notes !== undefined) updateData.notes = notes;
    if (unsoldItemDisposition !== undefined) {
      if (unsoldItemDisposition !== null && !['RETURN', 'DONATE', 'RELIST'].includes(unsoldItemDisposition)) {
        return res.status(400).json({ error: "unsoldItemDisposition must be 'RETURN', 'DONATE', 'RELIST', or null" });
      }
      updateData.unsoldItemDisposition = unsoldItemDisposition;
    }

    if (commissionRate !== undefined) {
      const rate = parseFloat(commissionRate);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        return res.status(400).json({ error: 'commissionRate must be 0-100' });
      }
      updateData.commissionRate = new Decimal(rate);
    }
    if (useTieredCommission !== undefined) {
      updateData.useTieredCommission = useTieredCommission === true;
      if (useTieredCommission === true) {
        await seedDefaultCommissionTiers(workspace.id);
      }
    }

    const updated = await prisma.consignor.update({
      where: { id },
      data: updateData,
      include: {
        items: { where: { status: 'SOLD' }, select: { id: true, title: true, price: true } },
        payouts: { select: { id: true, totalSales: true, commissionAmount: true, paidAt: true } },
      },
    });

    return res.status(200).json(toOrganizerConsignorView(updated));
  } catch (error) {
    console.error('[updateConsignor] Error:', error);
    return res.status(500).json({ error: 'Failed to update consignor' });
  }
};

/**
 * DELETE /api/consignors/:id
 * Delete a consignor (blocks, 409, if they have any sale, payout or settlement history -- archive instead)
 * Requires: authenticate, TEAMS subscription
 */
export const deleteConsignor = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    // Get organizer's workspace
    const result = await getOrganizerWorkspace(req.user.id);

    if (!result) {
      return res.status(404).json({ error: 'Organizer profile not found' });
    }

    const { organizer, workspace } = result;

    // Check TEAMS tier
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    // Verify consignor exists and belongs to workspace
    const consignor = await prisma.consignor.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!consignor) {
      return res.status(404).json({ error: 'Consignor not found' });
    }

    // The money trail must survive. A consignor with ANY sold item (settled or not), purchase, payout, payout line or settlement
    // history cannot be deleted: Item.consignorId is SetNull, so deleting would leave sold items with no owner and the ledger could no
    // longer say who is owed or was paid. Archive them instead (POST /consignors/:id/archive).
    const [soldItemCount, purchaseCount, payoutCount, payoutLineCount] = await Promise.all([
      prisma.item.count({ where: { consignorId: id, OR: [{ status: 'SOLD' }, { listingType: 'CONSIGNOR_TAG' }] } }),
      prisma.purchase.count({ where: { item: { consignorId: id } } }),
      prisma.consignorPayout.count({ where: { consignorId: id } }),
      prisma.consignorPayoutItem.count({ where: { consignorId: id } }),
    ]);

    if (soldItemCount > 0 || purchaseCount > 0 || payoutCount > 0 || payoutLineCount > 0) {
      return res.status(409).json({
        error: 'This consignor has sales or payouts on record. Archive them instead so the money trail stays intact.',
        code: 'CONSIGNOR_HAS_MONEY_TRAIL',
        canArchive: true,
        soldItemCount,
        purchaseCount,
        payoutCount,
        payoutLineCount,
      });
    }

    // Delete the consignor (cascade will handle items)
    await prisma.consignor.delete({
      where: { id },
    });

    return res.status(204).send();
  } catch (error) {
    console.error('[deleteConsignor] Error:', error);
    return res.status(500).json({ error: 'Failed to delete consignor' });
  }
};

/**
 * POST /api/consignors/:id/archive  and  POST /api/consignors/:id/unarchive
 * Soft-delete a consignor so the money trail stays intact: sets (or clears) Consignor.archivedAt. An archived consignor is hidden from the
 * composer, item-form and add-items pickers and takes no NEW price tags, but is still listed under the Archived filter and still resolved
 * by every ledger, payout, portal and refund read. Idempotent. Requires: authenticate, TEAMS subscription, consignor in the caller's workspace.
 */
async function setConsignorArchived(req: AuthRequest, res: Response, archive: boolean) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const { id } = req.params;
    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) {
      return res.status(404).json({ error: 'Organizer profile not found' });
    }
    const { organizer, workspace } = result;
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }
    const consignor = await prisma.consignor.findFirst({
      where: { id, workspaceId: workspace.id },
      select: {
        id: true,
        archivedAt: true,
        squareAccountId: true,
        squareOnboarded: true,
        squareAccessTokenEncrypted: true,
        squareRefreshTokenEncrypted: true,
        squarePortalOAuthNonce: true,
      },
    });
    if (!consignor) {
      return res.status(404).json({ error: 'Consignor not found' });
    }
    // Archiving removes the consignor's Square connection (2026-10-06): revoke at Square (non-fatal),
    // clear the stored tokens/merchant/nonce, keep every ledger, payout and sales record. Restoring
    // does not bring it back; the consignor reconnects from their portal. An already-archived
    // consignor that reconnected Square afterwards is purged on the next archive call.
    const hasSquare = archive && consignorHasSquareData(consignor);
    if (archive && consignor.archivedAt && !hasSquare) {
      return res.status(200).json({ id: consignor.id, archivedAt: consignor.archivedAt });
    }
    if (!archive && !consignor.archivedAt) {
      return res.status(200).json({ id: consignor.id, archivedAt: null });
    }
    if (hasSquare) {
      // Lazy import: only archives that actually hold a Square connection load the Square SDK graph.
      const { revokeConsignorSquareConnection } = await import('../services/consignorSquareDisconnectService');
      await revokeConsignorSquareConnection(consignor);
    }
    const updated = await prisma.consignor.update({
      where: { id: consignor.id },
      data: {
        archivedAt: archive ? (consignor.archivedAt ?? new Date()) : null,
        ...(hasSquare ? CONSIGNOR_SQUARE_CLEARED_FIELDS : {}),
      },
      select: { id: true, archivedAt: true },
    });
    return res.status(200).json(hasSquare ? { ...updated, squareConnectionRemoved: true } : updated);
  } catch (error) {
    console.error(`[${archive ? 'archiveConsignor' : 'unarchiveConsignor'}] Error:`, error);
    return res.status(500).json({ error: `Failed to ${archive ? 'archive' : 'unarchive'} consignor` });
  }
}

/**
 * POST /api/consignors/:id/send-invite  (2026-10-06)
 * Resend the welcome invite (portal link + Square payout setup). Organizer auth, TEAMS, consignor in
 * the caller's workspace (same scoping as every other :id route). Rate limited per organizer and
 * consignor (consignorInviteResendLimiter, middleware/rateLimiter.ts); only successful sends count.
 * 200 { sent: true, inviteEmailSentAt } | 422 { sent: false, reason } for NO_EMAIL / SUPPRESSED /
 * BLOCKED_DOMAIN | 502 { sent: false, reason: 'ERROR' }.
 */
export const resendConsignorInvite = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const { id } = req.params;
    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) {
      return res.status(404).json({ error: 'Organizer profile not found' });
    }
    const { organizer, workspace } = result;
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }
    const consignor = await prisma.consignor.findFirst({
      where: { id, workspaceId: workspace.id },
      select: { id: true },
    });
    if (!consignor) {
      return res.status(404).json({ error: 'Consignor not found' });
    }

    const r = await sendWelcomeInviteForConsignor(consignor.id);
    if (r.sent) {
      const fresh = await prisma.consignor.findUnique({ where: { id: consignor.id }, select: { inviteEmailSentAt: true } });
      return res.status(200).json({ sent: true, inviteEmailSentAt: fresh?.inviteEmailSentAt ?? null });
    }
    return res.status(r.reason === 'ERROR' || !r.reason ? 502 : 422).json({ sent: false, reason: r.reason ?? 'ERROR' });
  } catch (error) {
    console.error('[resendConsignorInvite] Error:', error);
    return res.status(500).json({ error: 'Failed to send invite' });
  }
};

export const archiveConsignor = (req: AuthRequest, res: Response) => setConsignorArchived(req, res, true);
export const unarchiveConsignor = (req: AuthRequest, res: Response) => setConsignorArchived(req, res, false);

/**
 * POST /api/consignors/:id/payout
 * Record a payout to a consignor. Body: { saleId?, method, notes?, notifyConsignor?, paidAt?, reference?,
 * acknowledgeLegacyOverlap? }
 *
 * Organizer-settles ledger (2026-09-29): FindA.Sale never sends this money. The organizer paid the
 * consignor themselves and this records it. The endpoint and the modal's request/response contract are
 * unchanged, but internally it now goes through consignorLedgerService.recordDirectPayout:
 *  - only UNSETTLED sold items are included (an item already in a live payout line is never paid twice)
 *  - the payout and its per-item lines are created and marked paid in one transaction
 *  - a second call with nothing owed is a 409 (NOTHING_OWED), not a $0 payout
 *  - the consignor is emailed only when notifyConsignor is true, and the email says a payment was
 *    RECORDED (not "Payout received"), using the real sale or period name
 * Commission math is calculateConsignorPayout via the ledger (ADR-096): never computed here.
 * Legacy method values from the older modal map onto the new vocabulary (VENMO -> OTHER with a note).
 * Requires: authenticate, TEAMS subscription
 */
export const runPayout = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const { saleId, method, notes } = req.body;

    if (!method) {
      return res.status(400).json({ error: 'method is required' });
    }

    // Get organizer's workspace
    const result = await getOrganizerWorkspace(req.user.id);

    if (!result) {
      return res.status(404).json({ error: 'Organizer profile not found' });
    }

    const { organizer, workspace } = result;

    // Check TEAMS tier
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    // Verify consignor exists and belongs to workspace
    const consignor = await prisma.consignor.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!consignor) {
      return res.status(404).json({ error: 'Consignor not found' });
    }

    if (saleId !== undefined && saleId !== null && saleId !== '') {
      if (typeof saleId !== 'string') return res.status(400).json({ error: 'saleId must be a sale id' });
      const sale = await prisma.sale.findFirst({ where: { id: saleId, organizerId: organizer.id }, select: { id: true } });
      if (!sale) return res.status(404).json({ error: 'Sale not found' });
    }

    const mapped = normalizeLegacyMethodInput(method);
    const noteText = [mapped.noteSuffix, typeof notes === 'string' ? notes.trim() : null].filter(Boolean).join(' | ');
    const input = validateMarkPaidInput({
      method: mapped.method,
      paidAt: req.body.paidAt,
      reference: req.body.reference,
      note: noteText || null,
      notifyConsignor: req.body.notifyConsignor,
    });

    const recorded = await recordDirectPayout(prisma, {
      workspaceId: workspace.id,
      actorUserId: req.user.id,
      consignorId: id,
      saleId: saleId || null,
      input,
      acknowledgeLegacyOverlap: req.body.acknowledgeLegacyOverlap === true,
    });

    // Optional, opt-in email: says a payment was recorded, never "Payout received".
    let notification: { requested: boolean; sent?: boolean; reason?: string } = { requested: input.notifyConsignor };
    if (input.notifyConsignor) {
      try {
        const statement = await buildStatement(prisma, { workspaceId: workspace.id, payoutId: recorded.payout.id });
        const r = await sendConsignorPaymentRecorded({
          consignorName: consignor.name,
          consignorEmail: consignor.email,
          organizerName: workspace.name || 'Your organizer',
          periodLabel: statement.periodLabel,
          amount: statement.totals.consignorShare ?? '0.00',
          method: input.method,
          methodLabel: METHOD_LABELS[input.method],
          paidAt: input.paidAt,
          reference: statement.reference,
          paymentReference: input.reference,
        });
        notification = { requested: true, sent: r.sent, ...(r.reason ? { reason: r.reason } : {}) };
      } catch (emailErr) {
        console.warn('[consignor-email] Payment recorded email failed:', emailErr);
        notification = { requested: true, sent: false, reason: 'ERROR' };
      }
    }

    return res.status(201).json({
      ...serializePayout(recorded.payout),
      notification,
      excluded: recorded.excluded.map(serializeExcluded),
    });
  } catch (error) {
    if (error instanceof LedgerError) {
      return res.status(error.status).json({ error: error.message, code: error.code, ...error.extra });
    }
    console.error('[runPayout] Error:', error);
    return res.status(500).json({ error: 'Failed to run payout' });
  }
};

/**
 * GET /api/consignors/portal/:token
 * PUBLIC endpoint (no auth required)
 * Consignor views their portal with items and payout history
 */
export const getConsignorPortal = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: 'Portal token required' });
    }

    const consignor = await prisma.consignor.findUnique({
      where: { portalToken: token },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        agreementAcceptedAt: true,
        agreementAcceptedVersion: true,
        items: {
          select: {
            id: true,
            title: true,
            price: true,
            status: true,
            createdAt: true,
            // Markdown visibility (Patrick, 2026-09-25): so a consignor sees WHY their
            // item's price is lower than what they brought it in at, instead of just a
            // smaller number with no explanation. Populated by the existing general
            // markdown system (markdownCron.ts / markdownCycleCron.ts) -- no schema change.
            priceBeforeMarkdown: true,
            markdownApplied: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        // Organizer-settles ledger (2026-09-29): a consignor only ever sees payouts the organizer has
        // APPROVED or PAID. Never DRAFT runs, VOID rows, SIMULATED test rows, ON_HOLD rows or
        // legacy standalone rows. PAID: ledger PAID plus the legacy COMPLETED spelling. PENDING is
        // shown only inside an APPROVED (or PARTIALLY_PAID) run.
        payouts: {
          where: {
            OR: [
              { status: { in: ['PAID', 'COMPLETED'] } },
              { status: 'PENDING', settlementBatch: { status: { in: ['APPROVED', 'PARTIALLY_PAID'] } } },
            ],
          },
          select: {
            id: true,
            totalSales: true,
            commissionAmount: true,
            netPayout: true,
            method: true,
            paidAt: true,
            paidReference: true,
            createdAt: true,
            status: true,
            saleId: true,
            sale: { select: { title: true } },
            items: {
              select: {
                titleSnapshot: true,
                soldAt: true,
                listPrice: true,
                priceBeforeMarkdown: true,
                ratePct: true,
                consignorShare: true,
              },
              orderBy: [{ soldAt: 'asc' }, { titleSnapshot: 'asc' }],
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!consignor) {
      return res.status(404).json({ error: 'Portal not found' });
    }

    // Statement lines per payout (title, sold date, price with the pre-markdown price when marked
    // down, rate, consignor share). organizerShare, collected amounts and internal notes are never exposed.
    const portalPayouts = consignor.payouts.map((p) => {
      const norm = normalizePayoutStatus(p.status).status;
      return {
        id: p.id,
        reference: payoutReference(p.id),
        status: norm,
        statusLabel: norm === 'PAID' ? 'Paid' : 'Approved, payment pending',
        periodLabel: periodLabelFor(p, p.items),
        totalSales: money(p.totalSales),
        commissionAmount: money(p.commissionAmount),
        netPayout: money(p.netPayout),
        method: p.method,
        paidAt: p.paidAt,
        paidReference: p.paidReference,
        createdAt: p.createdAt,
        lines: p.items.map((i) => ({
          title: i.titleSnapshot,
          soldAt: i.soldAt,
          listPrice: money(i.listPrice),
          priceBeforeMarkdown: money(i.priceBeforeMarkdown),
          markedDown: i.priceBeforeMarkdown !== null && Number(i.priceBeforeMarkdown) > Number(i.listPrice),
          ratePct: money(i.ratePct),
          consignorShare: money(i.consignorShare),
        })),
        footer: STATEMENT_FOOTER,
      };
    });

    // In-app consignor agreement (Patrick, 2026-09-25): rendered fresh on every portal
    // load from this consignor's real commissionRate/returnPeriodDays/unsoldItemDisposition
    // and the organizer's real markdown schedule -- see consignorAgreementService.ts.
    const agreement = await renderConsignorAgreementForConsignor(consignor.id);

    return res.status(200).json({
      consignor: {
        name: consignor.name,
        email: consignor.email,
        phone: consignor.phone,
      },
      items: consignor.items,
      payouts: portalPayouts,
      agreement: agreement
        ? {
            version: agreement.version,
            renderedMarkdown: agreement.renderedMarkdown,
            acceptedAt: consignor.agreementAcceptedAt,
            acceptedVersion: consignor.agreementAcceptedVersion,
          }
        : null,
    });
  } catch (error) {
    console.error('[getConsignorPortal] Error:', error);
    return res.status(500).json({ error: 'Failed to retrieve portal' });
  }
};

/**
 * POST /api/consignors/portal/:token/agreement/accept
 * PUBLIC endpoint (no auth required) -- same portal-token pattern as getConsignorPortal.
 * Records the consignor's acceptance of the CURRENT agreement version: who (via the
 * unguessable portal token), when, and which version -- a real audit trail. Re-accepting
 * (e.g. after the organizer publishes a new version) simply overwrites the prior
 * acceptedAt/acceptedVersion with the latest one, per the additive, no-separate-log-model
 * shape Patrick asked for.
 */
export const acceptConsignorAgreement = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: 'Portal token required' });
    }

    const consignor = await prisma.consignor.findUnique({
      where: { portalToken: token },
      select: { id: true },
    });

    if (!consignor) {
      return res.status(404).json({ error: 'Portal not found' });
    }

    const agreement = await renderConsignorAgreementForConsignor(consignor.id);
    if (!agreement) {
      return res.status(404).json({ error: 'Portal not found' });
    }

    const updated = await prisma.consignor.update({
      where: { id: consignor.id },
      data: {
        agreementAcceptedAt: new Date(),
        agreementAcceptedVersion: agreement.version,
      },
      select: { agreementAcceptedAt: true, agreementAcceptedVersion: true },
    });

    return res.status(200).json(updated);
  } catch (error) {
    console.error('[acceptConsignorAgreement] Error:', error);
    return res.status(500).json({ error: 'Failed to record agreement acceptance' });
  }
};
