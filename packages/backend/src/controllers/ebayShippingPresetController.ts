/**
 * ebayShippingPresetController — HTTP surface for creating real eBay fulfillment
 * policies ("shipping presets") from inside FindA.Sale.
 *
 * SECURITY POSTURE (CLAUDE.md §9 Security-QA Gate — this is an applicable surface:
 * every create call provisions a real, permanent resource on the organizer's own
 * external eBay account, and the bind call writes an item row).
 *
 *  AUTHZ-ON-EVERY-ENDPOINT — every route in routes/ebay.ts that reaches this file is
 *    mounted behind `authenticate, requireOrganizer`. There is no public or
 *    optionally-authenticated handler here. Each handler additionally re-derives the
 *    organizer from req.user.id and 404s if there is no organizer profile, so an
 *    authenticated non-organizer cannot reach any eBay call even if the middleware
 *    were ever misconfigured.
 *
 *  OWNERSHIP / TENANT-ISOLATION — the organizer is ALWAYS resolved server-side from
 *    the JWT subject (`prisma.organizer.findUnique({ where: { userId } })`). No handler
 *    reads an organizerId, userId, or eBay account identifier from the request body,
 *    query or params. Every eBay call uses that organizer's own OAuth token. The
 *    item-bind handler scopes its item lookup to the caller's own items
 *    (`OR: [{ organizerId }, { sale: { organizerId } }]`) and returns 404 — not 403 —
 *    for anything else, so an attacker cannot use the response to confirm that another
 *    organizer's item id exists. It also re-checks that the target policy id appears in
 *    the caller's OWN live eBay policy list, so an item can never be pinned to another
 *    seller's policy id.
 *
 *  NO-IDOR — item ids are cuids and every lookup is tenant-scoped, so enumeration
 *    returns 404 regardless of whether the id is real.
 *
 *  NO-MASS-ASSIGNMENT — request bodies are never spread into a Prisma call or into the
 *    eBay request body. Each handler destructures a fixed field list into a typed
 *    object, coerces types, and the shipping service/carrier codes come from a
 *    server-side whitelist (PRESET_SHIPPING_SERVICES) selected by opaque key. The
 *    item-bind write touches exactly one column
 *    (`Item.ebayFulfillmentPolicyOverrideId`).
 *
 *  BOUNDED EXTERNAL WRITES — a create loop cannot spam eBay with policies:
 *    (1) `presetCreateLimiter` caps creates at 10 per hour per user/IP;
 *    (2) `createPreset` refuses once the account holds
 *        MAX_FULFILLMENT_POLICIES_PER_ORGANIZER (80) policies;
 *    (3) duplicate names are rejected locally before any POST is issued;
 *    (4) every local validation runs BEFORE the first eBay call, so a rejected attempt
 *        costs zero external requests.
 *    The read/estimate routes are separately limited so the eBay policy-list fetch
 *    behind them cannot be hammered either.
 */

import { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import {
  PRESET_SHIPPING_SERVICES,
  PresetInput,
  createPreset,
  estimatePresetRate,
  checkPriceAgainstEngine,
  listPresets,
  validatePresetName,
  validatePresetConfig,
  organizerOwnsPolicy,
} from '../services/ebayShippingPresetService';

// ── Rate limiters ────────────────────────────────────────────────────────────
// Declared here rather than in middleware/rateLimiter.ts to keep this feature's
// files self-contained while parallel work is in flight on the shared eBay files.
// Same shape as the limiters there (keyGenerator falls back to IP, validate: false
// because trust proxy is already set to 1 in index.ts).

const keyByUserOrIp = (req: Request) => (req as any).user?.id ?? req.ip ?? '0.0.0.0';

/** Creating a real eBay policy: 10 per hour per user. */
export const presetCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: keyByUserOrIp,
  validate: false,
  message: 'Too many shipping presets created. Maximum 10 per hour.',
  standardHeaders: true,
  legacyHeaders: false,
});

/** Reads and rate estimates (each list call hits eBay once): 60 per 15 minutes. */
export const presetReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: keyByUserOrIp,
  validate: false,
  message: 'Too many requests. Try again in a few minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the caller's own organizer profile. Never trusts a client-supplied id.
 * Returns null after already having sent the response.
 */
async function requireOwnOrganizer(
  req: AuthRequest,
  res: Response
): Promise<{ id: string; hasConnection: boolean } | null> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ message: 'Authentication required' });
    return null;
  }
  const organizer = await prisma.organizer.findUnique({
    where: { userId },
    select: { id: true, ebayConnection: { select: { id: true } } },
  });
  if (!organizer) {
    res.status(404).json({ message: 'Organizer profile not found' });
    return null;
  }
  return { id: organizer.id, hasConnection: Boolean(organizer.ebayConnection) };
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Build the typed PresetInput from a request body one field at a time. This is the
 * mass-assignment boundary: nothing else from the body reaches the service or eBay.
 */
function readPresetInput(body: any): PresetInput {
  return {
    name: typeof body?.name === 'string' ? body.name.trim() : '',
    label: typeof body?.label === 'string' ? body.label.trim() : null,
    serviceKey: typeof body?.serviceKey === 'string' ? body.serviceKey : '',
    flatPrice: num(body?.flatPrice),
    additionalItemPrice: num(body?.additionalItemPrice) ?? 0,
    handlingDays: num(body?.handlingDays) ?? 3,
    maxWeightOz: num(body?.maxWeightOz),
    maxLengthIn: num(body?.maxLengthIn),
    maxWidthIn: num(body?.maxWidthIn),
    maxHeightIn: num(body?.maxHeightIn),
    freeShipping: body?.freeShipping === true,
    localPickup: body?.localPickup === true,
    handlingCharge: num(body?.handlingCharge) ?? 0,
    acknowledgeBelowCost: body?.acknowledgeBelowCost === true,
  };
}

// ── GET /ebay/shipping-presets ───────────────────────────────────────────────

/**
 * Every live fulfillment policy on the caller's eBay account, with the classification
 * and price FindA.Sale parses out of each name and how many of their items use it.
 * Read-only: one eBay GET, no writes anywhere.
 */
export const listShippingPresets = async (req: AuthRequest, res: Response) => {
  const organizer = await requireOwnOrganizer(req, res);
  if (!organizer) return;

  if (!organizer.hasConnection) {
    return res.json({ connected: false, policies: [], services: PRESET_SHIPPING_SERVICES });
  }

  try {
    const policies = await listPresets(organizer.id);
    return res.json({ connected: true, policies, services: PRESET_SHIPPING_SERVICES });
  } catch (error: any) {
    console.error('[eBay Preset] list failed', error?.message ?? error);
    return res.status(502).json({
      connected: true,
      message: error?.message || 'Could not load your shipping policies from eBay right now.',
    });
  }
};

// ── POST /ebay/shipping-presets/estimate ─────────────────────────────────────

/**
 * What FindA.Sale's own rate engine says a package of these dimensions costs to ship,
 * and what the automatic path would charge a buyer for it. Used to pre-fill the price
 * field and to show the below-cost warning live as the organizer types.
 * Read-only: no eBay call, no DB write.
 */
export const estimateShippingPresetRate = async (req: AuthRequest, res: Response) => {
  const organizer = await requireOwnOrganizer(req, res);
  if (!organizer) return;

  const weightOz = num(req.body?.weightOz);
  if (weightOz == null || weightOz <= 0) {
    return res.status(400).json({ message: 'Enter the package weight in ounces.' });
  }

  try {
    const estimate = await estimatePresetRate(organizer.id, {
      weightOz,
      lengthIn: num(req.body?.lengthIn),
      widthIn: num(req.body?.widthIn),
      heightIn: num(req.body?.heightIn),
      packageType: typeof req.body?.packageType === 'string' ? req.body.packageType : null,
    });

    const enteredPrice = num(req.body?.flatPrice);
    const priceCheck =
      estimate.available && estimate.labelCost != null && enteredPrice != null && enteredPrice > 0
        ? checkPriceAgainstEngine(enteredPrice, estimate.labelCost)
        : null;

    return res.json({ estimate, priceCheck });
  } catch (error: any) {
    console.error('[eBay Preset] estimate failed', error?.message ?? error);
    return res.status(500).json({ message: 'Could not work out a suggested price right now.' });
  }
};

// ── POST /ebay/shipping-presets/validate ─────────────────────────────────────

/**
 * Dry-run the name-safety and configuration checks without creating anything, so the
 * form can explain a problem inline while the organizer is still typing.
 * Pure: no eBay call, no DB read or write.
 */
export const validateShippingPreset = async (req: AuthRequest, res: Response) => {
  const organizer = await requireOwnOrganizer(req, res);
  if (!organizer) return;

  const input = readPresetInput(req.body);
  const configIssues = validatePresetConfig(input);
  const nameCheck = validatePresetName(input);

  return res.json({
    ok: configIssues.length === 0 && nameCheck.ok,
    issues: [...configIssues, ...nameCheck.issues],
    classification: nameCheck.classification,
    classificationMeaning: nameCheck.classificationMeaning,
    parsedPrice: nameCheck.parsedPrice,
    parsedMaxOz: nameCheck.parsedMaxOz,
    suggestedName: nameCheck.suggestedName,
  });
};

// ── POST /ebay/shipping-presets ──────────────────────────────────────────────

/**
 * Create a real eBay fulfillment policy on the caller's own eBay account.
 * The ONLY write path to eBay in this file. See the security header for the four
 * layers that bound it.
 */
export const createShippingPreset = async (req: AuthRequest, res: Response) => {
  const organizer = await requireOwnOrganizer(req, res);
  if (!organizer) return;

  if (!organizer.hasConnection) {
    return res.status(400).json({ message: 'Connect your eBay account before creating a shipping preset.' });
  }

  const input = readPresetInput(req.body);

  try {
    const result = await createPreset(organizer.id, input);
    if (!result.ok) {
      return res.status(422).json({
        message: result.issues?.[0]?.message || 'That preset could not be created.',
        issues: result.issues ?? [],
        priceCheck: result.priceCheck ?? null,
      });
    }
    return res.status(201).json({
      policy: result.policy,
      adopted: result.adopted === true,
      priceCheck: result.priceCheck ?? null,
    });
  } catch (error: any) {
    console.error('[eBay Preset] create failed', error?.message ?? error);
    return res.status(500).json({ message: 'Could not create that shipping preset right now.' });
  }
};

// ── GET /ebay/shipping-presets/items ─────────────────────────────────────────

/**
 * The caller's OWN items, for the "use this preset for one item" picker.
 * Tenant-scoped by construction, capped at 20 rows, read-only.
 */
export const searchOwnItemsForPreset = async (req: AuthRequest, res: Response) => {
  const organizer = await requireOwnOrganizer(req, res);
  if (!organizer) return;

  const rawQ = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const q = rawQ.slice(0, 80);

  try {
    const items = await prisma.item.findMany({
      where: {
        AND: [
          { OR: [{ organizerId: organizer.id }, { sale: { organizerId: organizer.id } }] },
          ...(q ? [{ title: { contains: q, mode: 'insensitive' as const } }] : []),
        ],
      },
      select: {
        id: true,
        title: true,
        price: true,
        packageWeightOz: true,
        ebayFulfillmentPolicyOverrideId: true,
        ebayListingId: true,
        sale: { select: { title: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    return res.json({
      items: items.map((i) => ({
        id: i.id,
        title: i.title,
        price: i.price,
        packageWeightOz: i.packageWeightOz,
        currentPolicyId: i.ebayFulfillmentPolicyOverrideId,
        isLiveOnEbay: Boolean(i.ebayListingId),
        saleTitle: i.sale?.title ?? null,
      })),
    });
  } catch (error: any) {
    console.error('[eBay Preset] item search failed', error?.message ?? error);
    return res.status(500).json({ message: 'Could not load your items right now.' });
  }
};

// ── POST /ebay/shipping-presets/bind-item ────────────────────────────────────

/**
 * Pin one of the caller's own items to one of the caller's own eBay policies.
 * Writes exactly one column: Item.ebayFulfillmentPolicyOverrideId.
 *
 * Sending policyId: null clears the pin and returns the item to automatic routing,
 * which keeps this endpoint reversible (no destructive one-way action).
 */
export const bindPresetToItem = async (req: AuthRequest, res: Response) => {
  const organizer = await requireOwnOrganizer(req, res);
  if (!organizer) return;

  const itemId = typeof req.body?.itemId === 'string' ? req.body.itemId : '';
  const policyId =
    req.body?.policyId === null || req.body?.policyId === ''
      ? null
      : typeof req.body?.policyId === 'string'
        ? req.body.policyId
        : undefined;

  if (!itemId) return res.status(400).json({ message: 'Pick an item first.' });
  if (policyId === undefined) return res.status(400).json({ message: 'Pick a shipping preset first.' });

  // Tenant-scoped lookup: anything the caller does not own is indistinguishable from
  // a nonexistent id.
  const item = await prisma.item.findFirst({
    where: {
      id: itemId,
      OR: [{ organizerId: organizer.id }, { sale: { organizerId: organizer.id } }],
    },
    select: { id: true, title: true },
  });
  if (!item) return res.status(404).json({ message: 'That item was not found.' });

  if (policyId !== null) {
    if (!organizer.hasConnection) {
      return res.status(400).json({ message: 'Connect your eBay account first.' });
    }
    let owns = false;
    try {
      owns = await organizerOwnsPolicy(organizer.id, policyId);
    } catch (error: any) {
      console.error('[eBay Preset] ownership check failed', error?.message ?? error);
      return res.status(502).json({ message: 'Could not check that policy with eBay right now.' });
    }
    if (!owns) {
      return res.status(404).json({ message: 'That shipping policy was not found on your eBay account.' });
    }
  }

  await prisma.item.update({
    where: { id: item.id },
    data: { ebayFulfillmentPolicyOverrideId: policyId },
  });

  return res.json({
    itemId: item.id,
    itemTitle: item.title,
    policyId,
    message: policyId ? `"${item.title}" now uses this shipping preset.` : `"${item.title}" is back to automatic shipping.`,
  });
};
