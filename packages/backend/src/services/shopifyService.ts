import axios, { AxiosInstance } from 'axios';
import { prisma } from '../lib/prisma';
import { Organizer, Item } from '@prisma/client';

/**
 * Feature #XXX: Shopify Cross-Listing
 * Service for managing Shopify product listings
 */

/**
 * Create an authenticated Axios client for a Shopify shop
 */
export function getShopifyClient(organizer: Organizer): AxiosInstance {
  if (!organizer.shopifyAccessToken || !organizer.shopifyShopDomain) {
    throw new Error('Shopify not connected for this organizer');
  }

  return axios.create({
    baseURL: `https://${organizer.shopifyShopDomain}/admin/api/2024-01`,
    headers: {
      'X-Shopify-Access-Token': organizer.shopifyAccessToken,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Push an item to Shopify as a product
 * Creates a product in Shopify and tracks the mapping in ShopifyListing
 */
export async function pushItemToShopify(
  itemId: string,
  organizer: Organizer
): Promise<{ productId: string; variantId: string }> {
  try {
    // Fetch item with photos
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { photos: true },
    });

    if (!item) {
      throw new Error(`Item not found: ${itemId}`);
    }

    const client = getShopifyClient(organizer);

    // Prepare product payload
    const effectivePrice = item.price || 0;
    const images = item.photos
      ? item.photos
          .filter((p) => p.url)
          .map((p) => ({
            src: p.url,
            alt: item.title,
          }))
      : [];

    const productPayload = {
      product: {
        title: item.title,
        body_html: item.description || '',
        vendor: organizer.businessName,
        product_type: item.category || 'General',
        tags: (item.tags || []).join(','),
        status: 'active',
        images: images,
        variants: [
          {
            price: effectivePrice.toFixed(2),
            sku: item.sku || itemId,
            inventory_quantity: 1,
            track_inventory: true,
          },
        ],
      },
    };

    // Create product on Shopify
    const response = await client.post('/products.json', productPayload);
    const product = response.data.product;
    const variant = product.variants[0];

    // Create ShopifyListing record
    const listing = await prisma.shopifyListing.upsert({
      where: { itemId },
      update: {
        shopifyProductId: product.id.toString(),
        shopifyVariantId: variant.id.toString(),
        syncedAt: new Date(),
        status: 'ACTIVE',
      },
      create: {
        itemId,
        organizerId: organizer.id,
        shopifyProductId: product.id.toString(),
        shopifyVariantId: variant.id.toString(),
        status: 'ACTIVE',
      },
    });

    return {
      productId: listing.shopifyProductId,
      variantId: listing.shopifyVariantId || '',
    };
  } catch (error: any) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      // Token expired or revoked
      await prisma.organizer.update({
        where: { id: organizer.id },
        data: {
          shopifyEnabled: false,
          shopifyAccessToken: null,
        },
      });
      throw new Error('Shopify authentication failed. Please reconnect.');
    }
    throw error;
  }
}

/**
 * Mark a Shopify item as sold by setting inventory to 0
 */
export async function markShopifyItemSold(itemId: string): Promise<void> {
  try {
    const listing = await prisma.shopifyListing.findUnique({
      where: { itemId },
      include: { organizer: true },
    });

    if (!listing || !listing.organizer) {
      // Item not listed on Shopify or organizer not found
      return;
    }

    const client = getShopifyClient(listing.organizer);

    // Update inventory to 0
    if (listing.shopifyVariantId) {
      await client.put(`/inventory_levels/adjust.json`, {
        inventory_item_id: listing.shopifyVariantId,
        available_adjustment: -1,
      });
    }

    // Update listing status
    await prisma.shopifyListing.update({
      where: { itemId },
      data: {
        status: 'SOLD',
      },
    });
  } catch (error: any) {
    // Log but don't throw — fire-and-forget
    console.error(`[Shopify] Failed to mark item ${itemId} as sold:`, error.message);
  }
}

/**
 * Disconnect Shopify from an organizer
 */
export async function disconnectShopify(organizerId: string): Promise<void> {
  await prisma.organizer.update({
    where: { id: organizerId },
    data: {
      shopifyAccessToken: null,
      shopifyShopDomain: null,
      shopifyEnabled: false,
    },
  });
}

/**
 * Get Shopify connection status for an organizer
 */
export async function getShopifyStatus(organizerId: string) {
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: {
      shopifyEnabled: true,
      shopifyShopDomain: true,
    },
  });

  if (!organizer) {
    throw new Error('Organizer not found');
  }

  const listingCount = await prisma.shopifyListing.count({
    where: {
      organizerId,
      status: 'ACTIVE',
    },
  });

  return {
    connected: organizer.shopifyEnabled,
    shopDomain: organizer.shopifyShopDomain || null,
    listingCount,
  };
}
