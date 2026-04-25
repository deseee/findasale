import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  pushItemToShopify,
  disconnectShopify,
  getShopifyStatus,
} from '../services/shopifyService';

/**
 * Feature #XXX: Shopify Cross-Listing
 * Controller for Shopify connection and listing management
 */

/**
 * Connect Shopify account
 * POST /api/shopify/connect
 */
export async function connectShopify(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { accessToken, shopDomain } = req.body;

    if (!accessToken || !shopDomain) {
      return res.status(400).json({ message: 'accessToken and shopDomain required' });
    }

    // Validate shop domain format
    if (!shopDomain.match(/^[a-z0-9-]+\.myshopify\.com$/i)) {
      return res.status(400).json({ message: 'Invalid Shopify shop domain format' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    // Check TEAMS tier
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ message: 'Shopify integration requires TEAMS tier' });
    }

    // Save connection
    const updated = await prisma.organizer.update({
      where: { id: organizer.id },
      data: {
        shopifyAccessToken: accessToken,
        shopifyShopDomain: shopDomain,
        shopifyEnabled: true,
      },
      select: {
        shopifyEnabled: true,
        shopifyShopDomain: true,
      },
    });

    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('[Shopify] connectShopify error:', error);
    res.status(500).json({ error: error.message || 'Failed to connect Shopify' });
  }
}

/**
 * Disconnect Shopify account
 * DELETE /api/shopify/connect
 */
export async function disconnectShopifyAccount(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    await disconnectShopify(organizer.id);

    res.json({ success: true, message: 'Shopify disconnected' });
  } catch (error: any) {
    console.error('[Shopify] disconnectShopifyAccount error:', error);
    res.status(500).json({ error: error.message || 'Failed to disconnect Shopify' });
  }
}

/**
 * Get Shopify connection status
 * GET /api/shopify/status
 */
export async function getShopifyConnectionStatus(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    const status = await getShopifyStatus(organizer.id);

    res.json(status);
  } catch (error: any) {
    console.error('[Shopify] getShopifyConnectionStatus error:', error);
    res.status(500).json({ error: error.message || 'Failed to get Shopify status' });
  }
}

/**
 * Push single item to Shopify
 * POST /api/shopify/push/:itemId
 */
export async function pushItemAction(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { itemId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!itemId) {
      return res.status(400).json({ message: 'itemId required' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    if (!organizer.shopifyEnabled) {
      return res.status(400).json({ message: 'Shopify not connected' });
    }

    // Verify item belongs to organizer
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { sale: true },
    });

    if (!item || item.sale?.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Item not found or does not belong to this organizer' });
    }

    const result = await pushItemToShopify(itemId, organizer);

    res.json({
      success: true,
      data: {
        productId: result.productId,
        variantId: result.variantId,
        message: 'Item pushed to Shopify',
      },
    });
  } catch (error: any) {
    console.error('[Shopify] pushItemAction error:', error);
    const statusCode = error.message?.includes('not connected') ? 400 : 500;
    res.status(statusCode).json({ error: error.message || 'Failed to push item to Shopify' });
  }
}
