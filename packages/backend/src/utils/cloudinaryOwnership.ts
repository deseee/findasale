/**
 * cloudinaryOwnership.ts -- security fix (2026-11-04, finding #110).
 *
 * addItemPhoto used to accept any string as a photo URL, and deleteItem called
 * cloudinary.uploader.destroy on a public id pulled from EVERY photo URL on the item with a
 * host-agnostic regex. Every FindA.Sale upload lands in the one shared `findasale` folder with a
 * random public id (controllers/uploadController.ts uploadToCloudinary), so the name says nothing
 * about which organizer uploaded it. An organizer could attach another organizer's (public) photo
 * URL to their own item, delete their item, and permanently destroy the other organizer's photo.
 *
 * Rules:
 *   - isOwnCloudinaryImageUrl: a photo URL may only be attached when it is an https image on our
 *     own Cloudinary cloud (same host/cloud check as the batch-analyze SSRF guard).
 *   - cloudinaryPublicIdIfDeletable: a public id is only destroyed when the URL is on our own
 *     cloud (CLOUDINARY_CLOUD_NAME must be set, else nothing is destroyed), the asset is in the
 *     platform upload folder, and NO other item, item photo row or sale still references that URL.
 *     Anything else keeps the reference on the deleted row's way out, but is never destroyed.
 */

const CLOUDINARY_HOST = /^res(-\d+)?\.cloudinary\.com$/i;
/** Folder every platform image upload goes to (uploadController.ts default `folder`). */
const PLATFORM_UPLOAD_FOLDER = 'findasale/';

function parseCloudinaryImageUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== '443') return null;
  if (!CLOUDINARY_HOST.test(u.hostname)) return null;
  return u;
}

/** True only for an https image URL on our own Cloudinary cloud (any cloud when CLOUDINARY_CLOUD_NAME is unset, e.g. local dev). */
export function isOwnCloudinaryImageUrl(raw: unknown): boolean {
  const u = parseCloudinaryImageUrl(raw);
  if (!u) return false;
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const prefix = cloud ? `/${cloud}/image/upload/` : null;
  if (prefix) return u.pathname.startsWith(prefix);
  return /^\/[^/]+\/image\/upload\//.test(u.pathname);
}

/**
 * The Cloudinary public id of a platform upload on our own cloud, or null when the URL must not be
 * destroyed (foreign host, other cloud, outside the platform folder, cloud name not configured).
 */
export function platformPublicIdFromUrl(raw: unknown): string | null {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloud) return null;
  const u = parseCloudinaryImageUrl(raw);
  if (!u) return null;
  const prefix = `/${cloud}/image/upload/`;
  if (!u.pathname.startsWith(prefix)) return null;
  // Format: /{cloud}/image/upload/v{version}/{public_id}.{ext} (secure_url as uploaded, no transforms)
  const match = u.pathname.slice(prefix.length).match(/^v\d+\/(.+?)\.[A-Za-z0-9]+$/);
  if (!match || !match[1]) return null;
  const publicId = decodeURIComponent(match[1]);
  if (!publicId.startsWith(PLATFORM_UPLOAD_FOLDER) || publicId.includes('..')) return null;
  return publicId;
}

// `unknown` result: Prisma's count() resolves to number | aggregate object depending on `select`; we never pass one.
type CountDelegate = { count: (args: any) => PromiseLike<unknown> };
export interface PhotoReferenceDb {
  item: CountDelegate;
  photo: CountDelegate;
  sale: CountDelegate;
}

/**
 * The public id to destroy for `photoUrl` when item `itemId` is deleted, or null to leave the asset
 * alone. Fails closed: a lookup error means "do not destroy".
 */
export async function cloudinaryPublicIdIfDeletable(db: PhotoReferenceDb, itemId: string, photoUrl: string): Promise<string | null> {
  const publicId = platformPublicIdFromUrl(photoUrl);
  if (!publicId) return null;
  try {
    const [otherItems, otherPhotos, sales] = await Promise.all([
      db.item.count({ where: { id: { not: itemId }, photoUrls: { has: photoUrl } } }),
      db.photo.count({ where: { itemId: { not: itemId }, url: photoUrl } }),
      db.sale.count({ where: { photoUrls: { has: photoUrl } } }),
    ]);
    if (Number(otherItems) > 0 || Number(otherPhotos) > 0 || Number(sales) > 0) return null;
  } catch (err) {
    console.error('[cloudinary] reference check failed, not destroying', publicId, err);
    return null;
  }
  return publicId;
}
