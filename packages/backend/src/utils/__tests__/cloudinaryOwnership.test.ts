/**
 * Security fix (2026-11-04, finding #110): deleteItem must never destroy a Cloudinary asset it does not
 * own, and addItemPhoto only accepts FindA.Sale's own Cloudinary uploads.
 *
 * WHAT THIS PROVES
 *   - only https images on our own cloud are accepted as photo URLs
 *   - a public id is destroyable only for our cloud, in the platform folder, with CLOUDINARY_CLOUD_NAME set
 *   - an asset still referenced by another item, another item's photo row or a sale is NOT destroyed
 *     (the copied-URL attack), and a lookup error fails closed
 *   - the organizer's own, unshared upload is still destroyed (legit path)
 */
import { isOwnCloudinaryImageUrl, platformPublicIdFromUrl, cloudinaryPublicIdIfDeletable } from '../cloudinaryOwnership';

const ORIGINAL_CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const OWN = 'https://res.cloudinary.com/fascloud/image/upload/v1712345678/findasale/abc123.jpg';

beforeEach(() => {
  process.env.CLOUDINARY_CLOUD_NAME = 'fascloud';
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  if (ORIGINAL_CLOUD === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
  else process.env.CLOUDINARY_CLOUD_NAME = ORIGINAL_CLOUD;
});

const db = (counts: { item?: number; photo?: number; sale?: number } = {}) => ({
  item: { count: jest.fn().mockResolvedValue(counts.item ?? 0) },
  photo: { count: jest.fn().mockResolvedValue(counts.photo ?? 0) },
  sale: { count: jest.fn().mockResolvedValue(counts.sale ?? 0) },
});

describe('isOwnCloudinaryImageUrl', () => {
  it('accepts an image on our own cloud', () => {
    expect(isOwnCloudinaryImageUrl(OWN)).toBe(true);
  });
  it.each([
    ['another cloud', 'https://res.cloudinary.com/othercloud/image/upload/v1/findasale/abc.jpg'],
    ['plain http', 'http://res.cloudinary.com/fascloud/image/upload/v1/findasale/abc.jpg'],
    ['a foreign host', 'https://evil.example.com/fascloud/image/upload/v1/findasale/abc.jpg'],
    ['a look-alike host', 'https://res.cloudinary.com.evil.example/fascloud/image/upload/v1/findasale/abc.jpg'],
    ['credentials in the URL', 'https://user:pw@res.cloudinary.com/fascloud/image/upload/v1/findasale/abc.jpg'],
    ['a non-image resource', 'https://res.cloudinary.com/fascloud/raw/upload/v1/findasale/abc.pdf'],
    ['not a string', 42],
    ['an empty string', ''],
  ])('rejects %s', (_label, url) => {
    expect(isOwnCloudinaryImageUrl(url)).toBe(false);
  });
});

describe('platformPublicIdFromUrl', () => {
  it('returns the public id of a platform upload', () => {
    expect(platformPublicIdFromUrl(OWN)).toBe('findasale/abc123');
  });
  it('returns null outside the platform folder, on another cloud, or with no cloud configured', () => {
    expect(platformPublicIdFromUrl('https://res.cloudinary.com/fascloud/image/upload/v1/other/abc.jpg')).toBeNull();
    expect(platformPublicIdFromUrl('https://res.cloudinary.com/othercloud/image/upload/v1/findasale/abc.jpg')).toBeNull();
    expect(platformPublicIdFromUrl('https://res.cloudinary.com/fascloud/image/upload/v1/findasale/../x/abc.jpg')).toBeNull();
    delete process.env.CLOUDINARY_CLOUD_NAME;
    expect(platformPublicIdFromUrl(OWN)).toBeNull();
  });
});

describe('cloudinaryPublicIdIfDeletable', () => {
  it("destroys the organizer's own upload that nothing else references (legit path)", async () => {
    const d = db();
    await expect(cloudinaryPublicIdIfDeletable(d, 'item_1', OWN)).resolves.toBe('findasale/abc123');
    expect(d.item.count).toHaveBeenCalledWith({ where: { id: { not: 'item_1' }, photoUrls: { has: OWN } } });
  });
  it("keeps an asset another organizer's item still uses (copied-URL attack)", async () => {
    await expect(cloudinaryPublicIdIfDeletable(db({ item: 1 }), 'attacker_item', OWN)).resolves.toBeNull();
  });
  it("keeps an asset another item's photo row still uses", async () => {
    await expect(cloudinaryPublicIdIfDeletable(db({ photo: 1 }), 'attacker_item', OWN)).resolves.toBeNull();
  });
  it('keeps an asset a sale still uses as a sale photo', async () => {
    await expect(cloudinaryPublicIdIfDeletable(db({ sale: 1 }), 'attacker_item', OWN)).resolves.toBeNull();
  });
  it('never destroys a foreign URL, and does not even look it up', async () => {
    const d = db();
    await expect(cloudinaryPublicIdIfDeletable(d, 'item_1', 'https://res.cloudinary.com/othercloud/image/upload/v1/findasale/abc.jpg')).resolves.toBeNull();
    expect(d.item.count).not.toHaveBeenCalled();
  });
  it('fails closed when the reference lookup errors', async () => {
    const d = db();
    d.sale.count.mockRejectedValue(new Error('db down'));
    await expect(cloudinaryPublicIdIfDeletable(d, 'item_1', OWN)).resolves.toBeNull();
  });
});
