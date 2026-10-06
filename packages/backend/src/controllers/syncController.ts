/**
 * Feature #69: Offline Sync Controller
 * Handles batch sync of offline operations with conflict detection
 */

import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { processCashSaleCore, CashSaleError } from './cashPaymentController'; // #561 offline cash-checkout replay
import { isConsignorTagError } from '../services/consignorTagService'; // 2026-10-06: a refused consignor tag is final, never retried
import { classifyEbayShipping } from '../utils/ebayShippingClassifier'; // P0 fix: ebayShippingClassification was never written anywhere
import { importedOnlyEditNeedsDirtyMark } from '../utils/ebayImportedEditMarker'; // imported-only eBay items: an offline-replayed category/tags/photos edit must survive the next import
import { organizerEditStampAlways } from '../utils/organizerEdit'; // 2026-10-04: Item.lastEditedAt, organizer-driven offline replay only
import { isBulkLotsEnabled } from '../services/bulkLot/bulkLotConfig'; // ADR-136 Addendum B (#659): bulk lots through the offline queue
import { findBulkLotItemIds, isBulkLotError } from '../services/bulkLot/bulkLotService';
import { evaluateLotItemEdit, lotDeleteBlocker, LOT_INVARIANT_MESSAGES } from '../services/bulkLot/bulkLotInvariants';
import { BULK_CONFLICT_CODE, BULK_CONFLICT_MESSAGE, isBulkLineCode, previewOfflineBulkLines } from '../services/bulkLot/bulkLotOfflineService';

interface SyncOperation {
  type: 'CREATE_ITEM' | 'UPDATE_ITEM' | 'DELETE_ITEM' | 'UPLOAD_PHOTO' | 'CHECKOUT_CASH';
  localId: string;
  itemId?: string;
  saleId: string;
  payload: any;
  timestamp: string;
}

interface SyncedItem {
  localId: string;
  itemId: string;
  status: 'SUCCESS' | 'CONFLICT';
  serverTimestamp: string;
  resolvedValues?: any;
}

interface FailedOperation {
  localId: string;
  error: string;
  retryable: boolean;
  operationType?: string;
  code?: string;
  /** ADR-136 Addendum B: structured detail for the queue, e.g. { conflicts: BulkConflict[] } for a bulk lot sale that no longer sells as queued. */
  details?: unknown;
}

interface ServerItemChange {
  itemId: string;
  updatedAt: string;
  reason: 'SOLD' | 'PRICE_DROPPED_BY_ORGANIZER' | 'OTHER';
}

/**
 * POST /api/sync/batch
 * Process batch of offline operations with conflict resolution
 */
export async function batchSync(req: AuthRequest, res: Response) {
  try {
    if (!req.user?.organizerProfile) {
      return res.status(401).json({ message: 'Organizer profile not found' });
    }

    const { operations, clientState } = req.body;
    const organizerId = req.user.organizer?.id;

    if (!Array.isArray(operations) || operations.length === 0) {
      return res.status(400).json({ message: 'No operations provided' });
    }

    // Validate timestamp bounds (within 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const op of operations) {
      const opTime = new Date(op.timestamp);
      if (opTime < thirtyDaysAgo) {
        return res.status(400).json({ message: `Operation from ${op.timestamp} is older than 30 days`,
          retryable: false,
        });
      }
    }

    const synced: SyncedItem[] = [];
    const failed: FailedOperation[] = [];
    const serverItems: ServerItemChange[] = [];

    // Process each operation
    for (const operation of operations) {
      try {
        // Validate saleId ownership
        const sale = await prisma.sale.findUnique({
          where: { id: operation.saleId },
          include: { organizer: true },
        });

        if (!sale || sale.organizer.id !== organizerId) {
          failed.push({
            localId: operation.localId,
            error: 'Unauthorized: Sale not found or not owned by organizer',
            retryable: false,
          });
          continue;
        }

        // #561: tier gate moved here from the route (see routes/sync.ts comment). CHECKOUT_CASH
        // is exempt — cash POS itself has no tier gate, so a queued cash sale must always be
        // able to sync regardless of subscription tier. Item CRUD offline-sync stays PRO-only,
        // preserving the existing behavior of this route before #561.
        if (operation.type !== 'CHECKOUT_CASH') {
          const tierRank: Record<string, number> = { SIMPLE: 0, PRO: 1, TEAMS: 2 };
          const organizerTier = sale.organizer.subscriptionTier ?? 'SIMPLE';
          if ((tierRank[organizerTier] ?? 0) < tierRank.PRO) {
            failed.push({
              localId: operation.localId,
              error: 'Offline item sync requires the PRO plan or higher.',
              retryable: false,
              operationType: operation.type,
              code: 'TIER_REQUIRED',
            });
            continue;
          }
        }

        // Process operation by type
        if (operation.type === 'CREATE_ITEM') {
          const result = await handleCreateItem(operation, organizerId);
          if (result.message) {
            failed.push({ localId: operation.localId, error: result.message.message, retryable: result.message.retryable });
          } else {
            synced.push(result.data!);
          }
        } else if (operation.type === 'UPDATE_ITEM') {
          const result = await handleUpdateItem(operation);
          if (result.message) {
            failed.push({ localId: operation.localId, error: result.message.message, retryable: result.message.retryable, ...((result.message as any).code ? { code: (result.message as any).code } : {}) });
          } else {
            synced.push(result.data!);
          }
        } else if (operation.type === 'DELETE_ITEM') {
          const result = await handleDeleteItem(operation);
          if (result.message) {
            failed.push({ localId: operation.localId, error: result.message.message, retryable: result.message.retryable, ...((result.message as any).code ? { code: (result.message as any).code } : {}) });
          } else {
            synced.push(result.data!);
          }
        } else if (operation.type === 'UPLOAD_PHOTO') {
          // MVP: Skip photo uploads (deferred implementation)
          // Clients queue photos; they're included in item updates
          synced.push({
            localId: operation.localId,
            itemId: operation.itemId || operation.localId,
            status: 'SUCCESS',
            serverTimestamp: new Date().toISOString(),
          });
        } else if (operation.type === 'CHECKOUT_CASH') {
          const result = await handleCheckoutCash(operation, sale.organizer);
          if (result.message) {
            failed.push({
              localId: operation.localId,
              error: result.message.message,
              retryable: result.message.retryable,
              operationType: operation.type,
              code: result.message.code,
              ...((result.message as any).details !== undefined ? { details: (result.message as any).details } : {}),
            });
          } else {
            synced.push(result.data!);
          }
        }
      } catch (error: any) {
        console.error(`[Sync] Error processing operation ${operation.localId}:`, error);
        failed.push({
          localId: operation.localId,
          error: error.message || 'Internal server error',
          retryable: true,
          operationType: operation.type,
        });
      }
    }

    res.status(200).json({
      synced,
      failed,
      serverItems,
    });
  } catch (error: any) {
    console.error('[Sync] Batch sync failed:', error);
    res.status(500).json({ message: 'Internal server error', retryable: true });
  }
}

/**
 * Handle CREATE_ITEM operation
 */
async function handleCreateItem(operation: SyncOperation, organizerId: string) {
  const { payload } = operation;

  try {
    // Check for duplicate SKU in same sale
    if (payload.sku) {
      const existing = await prisma.item.findFirst({
        where: {
          sku: payload.sku,
          saleId: operation.saleId,
        },
      });

      if (existing) {
        return { message: { message: `Item with SKU ${payload.sku} already exists`,
            retryable: false,
          },
        };
      }
    }

    // Create item
    const item = await prisma.item.create({
      data: {
        title: payload.title,
        description: payload.description,
        price: payload.price,
        // ADR cashier-discretionary-discount (2026-09-25): anchor set once at creation.
        originalPrice: payload.price,
        category: payload.category,
        condition: payload.condition,
        sku: payload.sku,
        photoUrls: payload.photoUrls || [],
        tags: payload.tags || [],
        // P0 fix: ebayShippingClassification was never written by any backend write path.
        ebayShippingClassification: classifyEbayShipping(payload.category ?? null, payload.tags || []),
        saleId: operation.saleId,
        organizerId,
        // Item.embedding is NOT NULL with NO database default -- migration
        // 20260307153530_add_coupon_model:74 runs ALTER COLUMN "embedding" DROP DEFAULT.
        // Prisma omits unspecified scalar-list fields, so this create() threw
        // "Null constraint violation on the fields: (`embedding`)" on EVERY offline-sync
        // CREATE_ITEM, and the catch below returns retryable:true -- an infinite retry
        // loop for offline item creation. itemController.ts:406/600 already pass this.
        embedding: [],
      },
    });

    return {
      data: {
        localId: operation.localId,
        itemId: item.id,
        status: 'SUCCESS' as const,
        serverTimestamp: item.updatedAt.toISOString(),
      },
    };
  } catch (error: any) {
    return { message: { message: error.message || 'Failed to create item',
        retryable: true,
      },
    };
  }
}

/**
 * Handle UPDATE_ITEM operation with conflict detection
 */
async function handleUpdateItem(operation: SyncOperation) {
  const { itemId, payload, timestamp } = operation;

  try {
    if (!itemId) {
      return { message: { message: 'itemId required for UPDATE_ITEM',
          retryable: false,
        },
      };
    }

    // Fetch current item
    const currentItem = await prisma.item.findUnique({
      where: { id: itemId },
    });

    // Cross-tenant guard: batchSync only verified that operation.saleId belongs to this organizer, so the item
    // itself must live in that same sale (else any PRO organizer could edit another organizer's item by id).
    if (!currentItem || currentItem.saleId !== operation.saleId) {
      return { message: { message: 'Item not found',
          retryable: false,
        },
      };
    }

    // Check for conflict: server.updatedAt > client.timestamp
    const clientTime = new Date(timestamp).getTime();
    const serverTime = currentItem.updatedAt.getTime();

    if (serverTime > clientTime) {
      // Conflict detected
      return {
        data: {
          localId: operation.localId,
          itemId,
          status: 'CONFLICT' as const,
          serverTimestamp: currentItem.updatedAt.toISOString(),
          resolvedValues: {
            title: currentItem.title,
            price: currentItem.price,
            description: currentItem.description,
            photoUrls: currentItem.photoUrls,
            tags: currentItem.tags,
          },
        },
      };
    }

    // Check if item is SOLD (prevent updates to sold items)
    if (currentItem.status === 'SOLD') {
      return { message: { message: 'Cannot update sold item',
          retryable: false,
        },
      };
    }

    // ADR-136 Addendum B (#659): a bulk lot replayed through the offline queue keeps its invariants. The queue never carries a
    // card count; a price is rounded to whole cents, a lot stays out of markdown and off eBay as a single listing. A lookup
    // failure with the flag on is retryable (BULK_CHECK_FAILED), never a write.
    let lotForced: Record<string, unknown> = {};
    {
      const lotFlagOn = isBulkLotsEnabled();
      let isLot = false;
      try {
        isLot = (await findBulkLotItemIds(prisma as any, [itemId], lotFlagOn)).has(itemId);
      } catch (lotErr) {
        return { message: { message: LOT_INVARIANT_MESSAGES.BULK_CHECK_FAILED, retryable: true, code: 'BULK_CHECK_FAILED' } };
      }
      if (isLot) {
        const decision = evaluateLotItemEdit(payload as Record<string, unknown>, {
          stockTotal: currentItem.stockTotal,
          stockSold: currentItem.stockSold,
          status: currentItem.status,
          listingType: currentItem.listingType,
        });
        if (!decision.ok) {
          return { message: { message: decision.refusal.message, retryable: false, code: decision.refusal.code } };
        }
        lotForced = decision.forced as unknown as Record<string, unknown>;
      }
    }

    // Apply update (last-write-wins)
    const updated = await prisma.item.update({
      where: { id: itemId },
      data: {
        title: payload.title || currentItem.title,
        description: payload.description !== undefined ? payload.description : currentItem.description,
        price: payload.price !== undefined ? payload.price : currentItem.price,
        category: payload.category || currentItem.category,
        condition: payload.condition || currentItem.condition,
        photoUrls: Array.isArray(payload.photoUrls) ? payload.photoUrls : currentItem.photoUrls,
        tags: Array.isArray(payload.tags) ? payload.tags : currentItem.tags,
        // P0 fix: keep ebayShippingClassification in sync with the final category/tags
        // this operation writes (this endpoint always writes both, with fallback to current).
        ebayShippingClassification: classifyEbayShipping(
          payload.category || currentItem.category,
          Array.isArray(payload.tags) ? payload.tags : currentItem.tags,
        ),
        updatedAt: new Date(),
        ...organizerEditStampAlways(), // replay of the organizer's offline edit
        ...(importedOnlyEditNeedsDirtyMark(currentItem, {
          category: payload.category || currentItem.category,
          tags: Array.isArray(payload.tags) ? payload.tags : currentItem.tags,
          photoUrls: Array.isArray(payload.photoUrls) ? payload.photoUrls : currentItem.photoUrls,
        }) ? { ebayContentDirtyAt: new Date() } : {}),
        ...lotForced, // ADR-136 Addendum B (#659): the lot invariants win over the queued edit
      },
    });

    return {
      data: {
        localId: operation.localId,
        itemId: updated.id,
        status: 'SUCCESS' as const,
        serverTimestamp: updated.updatedAt.toISOString(),
      },
    };
  } catch (error: any) {
    return { message: { message: error.message || 'Failed to update item',
        retryable: true,
      },
    };
  }
}

/**
 * Handle DELETE_ITEM operation (soft delete via isActive: false)
 */
async function handleDeleteItem(operation: SyncOperation) {
  const { itemId } = operation;

  try {
    if (!itemId) {
      return { message: { message: 'itemId required for DELETE_ITEM',
          retryable: false,
        },
      };
    }

    // Check if item exists
    const item = await prisma.item.findUnique({
      where: { id: itemId },
    });

    // Cross-tenant guard: the item must live in the sale batchSync already verified as owned (see handleUpdateItem).
    if (!item || item.saleId !== operation.saleId) {
      return { message: { message: 'Item not found',
          retryable: false,
        },
      };
    }

    // ADR-136 Addendum B (#659): a lot with cards on an active hold or in a hub cart cannot be removed from under them.
    {
      const lotFlagOn = isBulkLotsEnabled();
      let isLot = false;
      try {
        isLot = (await findBulkLotItemIds(prisma as any, [itemId], lotFlagOn)).has(itemId);
        if (isLot && (await lotDeleteBlocker(prisma as any, itemId, lotFlagOn))) {
          return { message: { message: LOT_INVARIANT_MESSAGES.BULK_LOT_BUSY, retryable: false, code: 'BULK_LOT_BUSY' } };
        }
      } catch (lotErr) {
        return { message: { message: LOT_INVARIANT_MESSAGES.BULK_CHECK_FAILED, retryable: true, code: 'BULK_CHECK_FAILED' } };
      }
    }

    // Soft delete: set isActive to false
    const deleted = await prisma.item.update({
      where: { id: itemId },
      data: { isActive: false, ...organizerEditStampAlways() }, // replay of the organizer's offline delete
    });

    return {
      data: {
        localId: operation.localId,
        itemId: deleted.id,
        status: 'SUCCESS' as const,
        serverTimestamp: deleted.updatedAt.toISOString(),
      },
    };
  } catch (error: any) {
    return { message: { message: error.message || 'Failed to delete item',
        retryable: true,
      },
    };
  }
}

/**
 * Handle CHECKOUT_CASH operation (#561 offline POS cash-checkout queuing)
 *
 * Replays a queued offline cash sale through the same core logic as the live
 * /api/stripe/terminal/cash-payment route (processCashSaleCore), keyed on the
 * client-generated clientTransactionId for idempotent replay-safety.
 *
 * ITEM_UNAVAILABLE is the one failure this surfaces distinctly (code passed through
 * to the response) — a genuine double-sell conflict (item sold elsewhere while this
 * device was offline). Per ADR-offline-pos-queue-2026-07-03.md decision 1, this must
 * NOT be silently dropped or auto-resolved; the frontend routes it to a "needs
 * reconciliation" state instead of endless retry.
 */
async function handleCheckoutCash(
  operation: SyncOperation,
  organizer: { id: string; subscriptionTier: string | null }
) {
  const { payload } = operation;

  try {
    // ADR-136 Addendum B (#659): bulk lot lines of a queued sale. A replay of a sale that was already recorded is never
    // re-checked (it correctly shows fewer cards on hand). Otherwise every lot line is priced again against the lot as it is
    // NOW; if any line no longer sells as queued the whole sale is refused BEFORE anything is charged or taken, with one
    // entry per changed line so the organizer sees exactly what moved. Plain item sales skip all of this.
    const queuedItems: Array<{ itemId?: string; amount?: number; quantity?: number | string }> = Array.isArray(payload?.items) ? payload.items : [];
    if (queuedItems.length > 0) {
      const alreadyRecorded = payload?.clientTransactionId
        ? (await prisma.purchase.findFirst({ where: { clientTransactionId: payload.clientTransactionId, sale: { organizerId: organizer.id } }, select: { id: true } })) !== null
        : false;
      if (!alreadyRecorded) {
        const preview = await previewOfflineBulkLines(prisma as any, { items: queuedItems, flagOn: isBulkLotsEnabled() });
        if (preview.conflicts.length > 0) {
          return { message: { message: BULK_CONFLICT_MESSAGE, retryable: false, code: BULK_CONFLICT_CODE, details: { conflicts: preview.conflicts } } };
        }
      }
    }

    // POS Cashier Discount Permission fix (2026-08-28): pass discount fields through if the
    // queued payload has them (added to CashCheckoutPayload the same session) so a discount
    // applied while offline is no longer silently dropped on sync -- it was ALWAYS dropped
    // before this fix, for every actor kind, since processCashSaleCore never resolved a
    // discount at all. KNOWN RESIDUAL GAP: `organizer` here is `sale.organizer` (the workspace
    // owner), not the actual acting TEAM_MEMBER who queued the sale, and carries no
    // actorKind/workspaceRole -- so resolvePosDiscount's permission/cap check cannot be
    // enforced for an offline-then-synced TEAM_MEMBER discount the way it is for a live one.
    // This is strictly better than today (discount always dropped to $0), not a complete fix;
    // flagged for a follow-up that threads the original actor's workspace role into the
    // offline queue payload.
    const result = await processCashSaleCore({
      organizer,
      saleId: operation.saleId,
      items: payload?.items ?? [],
      cashReceived: payload?.cashReceived ?? 0,
      buyerEmail: payload?.buyerEmail,
      clientTransactionId: payload?.clientTransactionId,
      discountType: payload?.discountType,
      discountValue: payload?.discountValue,
      discountReasonNote: payload?.discountReasonNote,
    });

    return {
      data: {
        localId: operation.localId,
        // Same as UPLOAD_PHOTO: localId === itemId here on purpose so the frontend's
        // synced-handling skips mapLocalToServerId (there's no local item to remap).
        itemId: operation.itemId || operation.localId,
        status: 'SUCCESS' as const,
        serverTimestamp: new Date().toISOString(),
        resolvedValues: { purchaseIds: result.purchaseIds, replay: result.replay },
      },
    };
  } catch (error: any) {
    if (isBulkLotError(error) && error.code === 'BULK_CHECK_FAILED') {
      return { message: { message: error.message, retryable: true, code: error.code } };
    }
    if (isConsignorTagError(error)) {
      // A tag refused on replay (feature off, bad signature, archived consignor) will be refused again: surface it for
      // reconciliation instead of retrying forever. The register does not queue tag lines offline in the first place.
      return { message: { message: error.message, retryable: false, code: error.code } };
    }
    if (error instanceof CashSaleError) {
      // A bulk line that changed between the check above and the sale itself (a register sale landing in between): look again so
      // the organizer still gets the per-line detail, falling back to the single code when nothing shows any more.
      if (isBulkLineCode(error.code) && !error.retryable) {
        try {
          const again = await previewOfflineBulkLines(prisma as any, { items: Array.isArray(payload?.items) ? payload.items : [], flagOn: isBulkLotsEnabled() });
          if (again.conflicts.length > 0) {
            return { message: { message: BULK_CONFLICT_MESSAGE, retryable: false, code: BULK_CONFLICT_CODE, details: { conflicts: again.conflicts } } };
          }
        } catch {
          /* fall through to the plain error below */
        }
      }
      return {
        message: {
          message: error.message,
          retryable: error.retryable,
          code: error.code,
        },
      };
    }
    return {
      message: {
        message: error.message || 'Failed to record cash sale',
        retryable: true,
      },
    };
  }
}

