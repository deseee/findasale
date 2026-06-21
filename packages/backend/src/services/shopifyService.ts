import axios, { AxiosInstance } from 'axios';
import { prisma } from '../lib/prisma';
import { Organizer, Item } from '@prisma/client';

/**
 * Feature: Shopify Cross-Listing
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
    baseURL: `https://${organizer.shopifyShopDomain}/admin/api/2025-10`,
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
            inventory_management: 'shopify',
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
    const status = error.response?.status;

    if (status === 401 || status === 403) {
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

    if (status === 422) {
      // Validation error from Shopify (e.g. bad field, duplicate SKU)
      const details =
        error.response?.data?.errors &&
        typeof error.response.data.errors === 'object'
          ? Object.entries(error.response.data.errors)
              .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
              .join('; ')
          : 'Shopify rejected the product data.';
      throw new Error(`Shopify rejected this item: ${details}`);
    }

    if (status === 429) {
      // Rate limited by Shopify
      throw new Error('Shopify is rate limiting requests right now. Please try again in a minute.');
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

    // Set inventory to 0 on Shopify.
    // shopifyVariantId is a VARIANT id, not an inventory_item_id, and
    // inventory_levels requires both an inventory_item_id and a location_id.
    // Resolve both at runtime: GET the variant for its inventory_item_id,
    // GET the primary location for a location_id, then set the level to 0.
    if (listing.shopifyVariantId) {
      // 1. Resolve the variant's inventory_item_id
      const variantResp = await client.get(`/variants/${listing.shopifyVariantId}.json`);
      const inventoryItemId = variantResp.data?.variant?.inventory_item_id;

      // 2. Resolve a location_id (use the first/primary location)
      const locationsResp = await client.get(`/locations.json`);
      const locations = locationsResp.data?.locations || [];
      const locationId =
        locations.find((l: any) => l.active)?.id || locations[0]?.id;

      // 3. Set available inventory to 0 at that location
      if (inventoryItemId && locationId) {
        await client.post(`/inventory_levels/set.json`, {
          location_id: locationId,
          inventory_item_id: inventoryItemId,
          available: 0,
        });
      } else {
        console.error(
          `[Shopify] Could not resolve inventory_item_id (${inventoryItemId}) or location_id (${locationId}) for item ${itemId}`
        );
      }
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
