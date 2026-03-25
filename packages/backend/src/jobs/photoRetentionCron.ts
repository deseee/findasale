import cron from 'node-cron';
import { prisma } from '../index';
import axios from 'axios';

/**
 * Photo Retention Cron — Feature #103
 *
 * Manages photo storage costs by:
 * 1. Archiving photos 90+ days after sale end (serve lower quality version)
 * 2. Deleting original photos 365+ days after sale end from Cloudinary
 *
 * Runs daily at 3:00 AM UTC
 */

const CLOUDINARY_NAME = process.env.CLOUDINARY_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

/**
 * Extract public ID from Cloudinary URL
 * Example: https://res.cloudinary.com/abc/image/upload/v1/findasale/item123.jpg
 * Returns: findasale/item123
 */
function extractCloudinaryPublicId(url: string): string | null {
  try {
    // Match pattern: /upload/{transformations}/v{version}/{public_id_with_ext}
    const match = url.match(/\/upload\/(?:[^/]+\/)*v\d+\/(.+?)(?:\.\w+)?$/);
    if (match && match[1]) {
      return match[1];
    }
    // Fallback: match pattern after /upload/ up to extension
    const fallbackMatch = url.match(/\/upload\/([^.]+)/);
    if (fallbackMatch && fallbackMatch[1]) {
      // Remove transformations prefix if present
      const publicId = fallbackMatch[1].split('/').pop();
      return publicId || null;
    }
  } catch (error) {
    console.error('[photo-cron] Error extracting public ID from URL:', url, error);
  }
  return null;
}

/**
 * Delete image from Cloudinary using Management API
 */
async function deleteFromCloudinary(publicId: string): Promise<boolean> {
  if (!CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET || !CLOUDINARY_NAME) {
    console.warn('[photo-cron] Cloudinary credentials missing, skipping deletion');
    return false;
  }

  try {
    // Cloudinary Management API destroy endpoint
    const timestamp = Math.floor(Date.now() / 1000);
    const crypto = require('crypto');

    // Build signature for Cloudinary API
    const string_to_sign = `public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
    const signature = crypto
      .createHash('sha1')
      .update(string_to_sign)
      .digest('hex');

    const response = await axios.post(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_NAME}/image/destroy`,
      {
        public_id: publicId,
        timestamp,
        api_key: CLOUDINARY_API_KEY,
        signature,
      },
      { timeout: 10000 }
    );

    if (response.status === 200 && response.data.result === 'ok') {
      console.log(`[photo-cron] Deleted from Cloudinary: ${publicId}`);
      return true;
    }
  } catch (error: any) {
    console.error(`[photo-cron] Failed to delete ${publicId} from Cloudinary:`, error.message || error);
  }
  return false;
}

export function schedulePhotoRetentionCron(): void {
  // Daily at 3:00 AM UTC (adjustable via cron expression)
  cron.schedule('0 3 * * *', async () => {
    try {
      const now = new Date();
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

      console.log('[photo-cron] Starting photo retention job');

      // Step 1: Archive photos 90+ days after sale end
      // Find items with sales that ended 90+ days ago, with photos, and not yet archived
      const itemsToArchive = await prisma.item.findMany({
        where: {
          sale: {
            endDate: {
              lte: ninetyDaysAgo,
            },
          },
          photoUrls: {
            hasSome: [''], // Has at least one photo URL (trick: check if array is non-empty)
          },
          archivedAt: null, // Not yet archived
        },
        select: {
          id: true,
          saleId: true,
        },
      });

      if (itemsToArchive.length > 0) {
        await prisma.item.updateMany({
          where: {
            id: {
              in: itemsToArchive.map(i => i.id),
            },
          },
          data: {
            archivedAt: now,
          },
        });
        console.log(`[photo-cron] Archived ${itemsToArchive.length} items (90+ days old)`);
      }

      // Step 2: Delete original photos 365+ days after sale end from Cloudinary
      // Find items with sales that ended 365+ days ago, with photos, not yet deleted
      const itemsToDelete = await prisma.item.findMany({
        where: {
          sale: {
            endDate: {
              lte: oneYearAgo,
            },
          },
          photoUrls: {
            hasSome: [''],
          },
          deletedFromCloudinary: false,
        },
        select: {
          id: true,
          photoUrls: true,
        },
      });

      let deletedCount = 0;
      const itemIdsToMarkDeleted: string[] = [];

      for (const item of itemsToDelete) {
        let allDeleted = true;

        for (const photoUrl of item.photoUrls) {
          const publicId = extractCloudinaryPublicId(photoUrl);
          if (publicId) {
            const success = await deleteFromCloudinary(publicId);
            if (!success) {
              allDeleted = false;
            } else {
              deletedCount++;
            }
          }
        }

        // Mark item as deleted from Cloudinary only if all photos were deleted
        if (allDeleted && item.photoUrls.length > 0) {
          itemIdsToMarkDeleted.push(item.id);
        }
      }

      if (itemIdsToMarkDeleted.length > 0) {
        await prisma.item.updateMany({
          where: {
            id: {
              in: itemIdsToMarkDeleted,
            },
          },
          data: {
            deletedFromCloudinary: true,
            photoUrls: [], // Clear photo URLs after successful Cloudinary deletion
          },
        });
        console.log(
          `[photo-cron] Marked ${itemIdsToMarkDeleted.length} items as deleted from Cloudinary (${deletedCount} total photos deleted)`
        );
      }

      console.log('[photo-cron] Photo retention job completed');
    } catch (error) {
      console.error('[photo-cron] Error in photo retention cron:', error);
      // Continue — don't let cron job crash
    }
  });

  console.log('[photo-cron] Registered photo retention cron (daily at 3 AM UTC)');
}
