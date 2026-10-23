/**
 * publishGate: email verification is required to PUBLISH, not to set up (Patrick, 2026-10-23).
 *
 * Unverified organizers can create and save draft sales and add items freely. Anything that makes a sale or
 * an item visible to shoppers, or lists it on an outside marketplace, needs a verified email:
 *  - sale publish / reopen (saleController.updateSaleStatus),
 *  - item publish, single and bulk (itemController.publishItemForUser, routes/items.ts bulk draftStatus),
 *  - generic item update with draftStatus PUBLISHED (itemController.updateItem),
 *  - item create and consignor intake save as DRAFT instead of PUBLISHED (itemController.createItem,
 *    consignorController.createConsignor),
 *  - eBay push (ebayController.pushSaleToEbay, publishItemOffer),
 *  - kit create, bulk lot create and eBay import save as DRAFT instead of PUBLISHED (itemKitService.createKit,
 *    bulkLotService.createBulkLotItem, ebayController.importInventoryFromEbay),
 *  - outside marketplace pushes, through requirePublishVerified on the route: bulk lot eBay bundle save / list /
 *    sync, Discogs, Reverb, Etsy publish, Shopify push,
 *  - the extension queues return nothing for an organizer who cannot publish (extensionController).
 * Admins are exempt (they act on an organizer's behalf). The check reads User.emailVerified, which the auth
 * middleware loads from the database on every request (middleware/auth.ts), so it is never stale.
 */
import type { NextFunction, Request, Response } from 'express';
import { prisma } from './prisma';

export const EMAIL_NOT_VERIFIED_CODE = 'EMAIL_NOT_VERIFIED';
export const EMAIL_NOT_VERIFIED_PUBLISH_MESSAGE =
  'Verify your email address to publish. Your draft is saved. Check your inbox for the link, or send a new one.';

type PublishActor = {
  emailVerified?: boolean | null;
  role?: string | null;
  roles?: string[] | null;
} | null | undefined;

export function isAdminActor(user: PublishActor): boolean {
  return !!user && (user.role === 'ADMIN' || (Array.isArray(user.roles) && user.roles.includes('ADMIN')));
}

/** True when this (already loaded) user may publish. */
export function canPublish(user: PublishActor): boolean {
  if (!user) return false;
  return user.emailVerified === true || isAdminActor(user);
}

/** Same rule, looked up by id (for shared helpers that only receive a user id). */
export async function userCanPublish(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true, role: true, roles: true },
  });
  return canPublish(user as PublishActor);
}

export function emailNotVerifiedBody() {
  return { code: EMAIL_NOT_VERIFIED_CODE, message: EMAIL_NOT_VERIFIED_PUBLISH_MESSAGE };
}

/**
 * Same rule for a request's user. The auth middleware loads the full user row (emailVerified included), so this is
 * normally a pure check; a minimal user object without emailVerified (some internal callers pass { id }) is looked
 * up by id instead.
 */
export async function actorCanPublish(user: (PublishActor & { id?: string | null }) | undefined): Promise<boolean> {
  if (!user) return false;
  if (typeof user.emailVerified === 'boolean' || isAdminActor(user)) return canPublish(user);
  return user.id ? userCanPublish(user.id) : false;
}

/**
 * Route middleware (2026-10-23): refuses with 403 EMAIL_NOT_VERIFIED unless the signed-in user may publish. Mount it
 * after authenticate on any route that makes something visible to shoppers or lists it on an outside marketplace.
 */
export async function requirePublishVerified(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = (req as Request & { user?: any }).user;
    if (!user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }
    if (!(await actorCanPublish(user))) {
      res.status(403).json(emailNotVerifiedBody());
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
