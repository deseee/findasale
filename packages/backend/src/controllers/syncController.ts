/**
 * Feature #69: Offline Sync Controller
 * Handles batch sync of offline operations with conflict detection
 */

import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

interface SyncOperation {
  type: 'CREATE_ITEM' | 'UPDATE_ITEM' | 'DELETE_ITEM' | 'UPLOAD_PHOTO';
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
            failed.push({ localId: operation.localId, error: result.message.message, retryable: result.message.retryable });
          } else {
            synced.push(result.data!);
          }
        } else if (operation.type === 'DELETE_ITEM') {
          const result = await handleDeleteItem(operation);
          if (result.message) {
            failed.push({ localId: operation.localId, error: result.message.message, retryable: result.message.retryable });
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
        }
      } catch (error: any) {
        console.error(`[Sync] Error processing operation ${operation.localId}:`, error);
        failed.push({
          localId: operation.localId,
          error: error.message || 'Internal server error',
          retryable: true,
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
        category: payload.category,
        condition: payload.condition,
        sku: payload.sku,
        photoUrls: payload.photoUrls || [],
        tags: payload.tags || [],
        saleId: operation.saleId,
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

    if (!currentItem) {
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
        updatedAt: new Date(),
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

    if (!item) {
      return { message: { message: 'Item not found',
          retryable: false,
        },
      };
    }

    // Soft delete: set isActive to false
    const deleted = await prisma.item.update({
      where: { id: itemId },
      data: { isActive: false },
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
