/**
 * pushItemToShopify with a kit (2026-10-13): body_html carries the Includes list, photos fall back to photoUrls, quantity is the one
 * stock number; an ordinary item is unchanged. No network, no database.
 */
const mockPost = jest.fn();
const mockPrisma: any = {
  item: { findUnique: jest.fn() },
  itemKitComponent: { findMany: jest.fn() },
  shopifyListing: { upsert: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('axios', () => ({ __esModule: true, default: { create: () => ({ post: (...a: unknown[]) => mockPost(...a) }) } }));

import { pushItemToShopify } from '../services/shopifyService';

const organizer: any = { id: 'org1', businessName: 'Biz', shopifyAccessToken: 't', shopifyShopDomain: 'x.myshopify.com' };
const baseItem = { id: 'i1', title: 'T', price: 12.5, category: null, tags: [], sku: null, description: 'Desc', photos: [], photoUrls: [], stockTotal: null, stockSold: 0, listingType: 'FIXED' };

beforeEach(() => {
  jest.clearAllMocks();
  mockPost.mockResolvedValue({ data: { product: { id: 1, variants: [{ id: 2 }] } } });
  mockPrisma.shopifyListing.upsert.mockResolvedValue({ shopifyProductId: '1', shopifyVariantId: '2' });
  mockPrisma.itemKitComponent.findMany.mockResolvedValue([{ kitItemId: 'k1', quantity: 2, componentItem: { title: 'Charger' } }]);
});

it('a kit gets the Includes list in body_html, its photoUrls as images and its derived stock as the quantity', async () => {
  mockPrisma.item.findUnique.mockResolvedValue({ ...baseItem, id: 'k1', listingType: 'KIT', stockTotal: 4, stockSold: 1, photoUrls: ['https://img/a.jpg', 'https://img/b.jpg'] });
  await pushItemToShopify('k1', organizer);
  const product = mockPost.mock.calls[0][1].product;
  expect(product.body_html).toBe('Desc\n\nIncludes:\n- 2 x Charger');
  expect(product.images.map((i: any) => i.src)).toEqual(['https://img/a.jpg', 'https://img/b.jpg']);
  expect(product.variants[0].inventory_quantity).toBe(3);
});

it('an ordinary item is unchanged: plain description, Photo rows win, no kit lookup', async () => {
  mockPrisma.item.findUnique.mockResolvedValue({ ...baseItem, photos: [{ url: 'https://img/p.jpg' }], photoUrls: ['https://img/other.jpg'] });
  await pushItemToShopify('i1', organizer);
  const product = mockPost.mock.calls[0][1].product;
  expect(product.body_html).toBe('Desc');
  expect(product.images.map((i: any) => i.src)).toEqual(['https://img/p.jpg']);
  expect(product.variants[0].inventory_quantity).toBe(1);
  expect(mockPrisma.itemKitComponent.findMany).not.toHaveBeenCalled();
});
