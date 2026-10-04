/**
 * Item owner resolution (item editor unification, Wave 1.0A, B1).
 *
 * Item.organizerId is denormalized. Ownership of an item resolves as follows:
 *   - Sale items (saleId set): the owner is sale.organizer. The caller MUST load
 *     `sale: { include: { organizer: { select: { id, userId, subscriptionTier, lat, lng } } } }`.
 *   - Inventory items (saleId null): the owner is Organizer where id = item.organizerId AND userId = caller.
 *
 * DEFAULT DENY. A null return means "not the owner" and the caller must answer 403 or 404. The helper never
 * fails open and never looks an organizer up without the caller's userId.
 *
 * Callers must NOT write `if (item.sale && item.sale.organizer.userId !== userId)`: that check is skipped for
 * inventory items (no sale) and the request proceeds, which fails OPEN. Use this helper instead.
 *
 * Error policy: a database error from the organizer lookup PROPAGATES (the caller's catch block answers 500).
 * It is never swallowed into a null (which would be a misleading 403) and never into an owner (which would
 * fail open).
 *
 * Strictness notes (all deny):
 *   - missing or empty userId: null, and no lookup is made;
 *   - a sale item (saleId set, or a sale object present) whose sale.organizer was not loaded: null, because
 *     falling back to item.organizerId could resolve an owner other than the sale's organizer;
 *   - the sale organizer's userId differs from the caller: null, and no inventory lookup is attempted.
 *
 * Wired in Wave 1: the item controllers, the bulk item routes, the label controller and the
 * item-inventory controller all resolve ownership through this helper. New :itemId handlers should too.
 */

import type { SubscriptionTier } from '@prisma/client';
import { prisma } from '../lib/prisma';

/** The organizer fields callers need after an ownership check (mirrors itemController updateItem). */
export type OwnerOrganizer = {
  id: string;
  userId: string;
  subscriptionTier: SubscriptionTier;
  lat: number | null;
  lng: number | null;
};

/** Structural shape of an item row as loaded by the callers (extra properties are fine). */
export type ItemOwnerInput = {
  saleId?: string | null;
  organizerId?: string | null;
  sale?: {
    organizer?: {
      id: string;
      userId: string;
      subscriptionTier: SubscriptionTier;
      lat?: number | null;
      lng?: number | null;
    } | null;
  } | null;
};

/** The only part of the Prisma client this helper touches. Tests inject a stand-in. */
export type OrganizerLookupClient = Pick<typeof prisma, 'organizer'>;

export async function resolveItemOwnerOrganizer(
  item: ItemOwnerInput | null | undefined,
  userId: string | null | undefined,
  client: OrganizerLookupClient = prisma,
): Promise<OwnerOrganizer | null> {
  if (!item) return null;
  if (typeof userId !== 'string' || userId.length === 0) return null;

  // Sale item: owner is the sale's organizer, and must be the caller.
  if (item.sale) {
    const organizer = item.sale.organizer;
    if (organizer && organizer.userId === userId) {
      return {
        id: organizer.id,
        userId: organizer.userId,
        subscriptionTier: organizer.subscriptionTier,
        lat: organizer.lat ?? null,
        lng: organizer.lng ?? null,
      };
    }
    return null;
  }

  // A sale-bound item whose sale was not loaded cannot be resolved safely: deny.
  if (item.saleId) return null;

  // Inventory item: look the organizer up by id AND userId (never by id alone).
  if (item.organizerId) {
    const row = await client.organizer.findFirst({
      where: { id: item.organizerId, userId },
      select: { id: true, userId: true, subscriptionTier: true, lat: true, lng: true },
    });
    // Defense in depth: re-verify the row really belongs to the caller.
    if (row && row.userId === userId) {
      return {
        id: row.id,
        userId: row.userId,
        subscriptionTier: row.subscriptionTier,
        lat: row.lat ?? null,
        lng: row.lng ?? null,
      };
    }
    return null;
  }

  return null;
}
