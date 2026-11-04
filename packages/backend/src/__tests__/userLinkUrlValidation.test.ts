/**
 * 2026-11-04: stored XSS through user-entered links.
 *
 * Organizer website/social links, bounty reference links and encyclopedia markdown links are rendered as
 * <a href> for other people. z.string().url() accepted javascript:, data: and vbscript: URLs, the social
 * fields and the bounty link had no check at all, and an author could rewrite an approved encyclopedia entry
 * without review.
 *
 * WHAT THIS PROVES
 *   - safeLinkUrl: only absolute http(s) URLs pass; free-text social links get https:// when they have no scheme
 *   - PATCH /organizers/me schema: website, ebayStoreUrl and every social field refuse non-http(s) schemes
 *   - POST /bounties: a javascript: reference link is refused, an https one is stored
 *   - encyclopedia: unsafe markdown links are refused on create and edit; an author's edit of a PUBLISHED
 *     entry goes back to PENDING_REVIEW; an admin edit stays published
 */
jest.mock('../lib/prisma', () => ({
  prisma: {
    sale: { findUnique: jest.fn() },
    missingListingBounty: { findFirst: jest.fn(), create: jest.fn() },
  },
}));
jest.mock('../services/encyclopediaService', () => ({
  createEntry: jest.fn(),
  getEntry: jest.fn(),
  updateEntry: jest.fn(),
}));

import { z } from 'zod';
import { isHttpUrl, normalizeLinkUrl, findUnsafeMarkdownLinks, websiteUrlSchema, socialUrlSchema } from '../utils/safeLinkUrl';
import { createBounty } from '../controllers/bountyController';
import { createEntry, updateEntry } from '../controllers/encyclopediaController';
import * as encyclopediaService from '../services/encyclopediaService';
import { prisma } from '../lib/prisma';

const db = prisma as any;
const enc = encyclopediaService as any;
const BAD = ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', 'java\nscript:alert(1)', 'file:///etc/passwd'];

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('safeLinkUrl', () => {
  it('isHttpUrl accepts http(s) only', () => {
    expect(isHttpUrl('https://example.com/a')).toBe(true);
    expect(isHttpUrl('http://example.com')).toBe(true);
    for (const b of [...BAD, '', 'example.com', 'https://', null, 42]) expect(isHttpUrl(b)).toBe(false);
  });

  it('normalizeLinkUrl adds https:// to scheme-less links and refuses other schemes', () => {
    expect(normalizeLinkUrl('instagram.com/shop')).toBe('https://instagram.com/shop');
    expect(normalizeLinkUrl('shop.example.com:8080/x')).toBe('https://shop.example.com:8080/x');
    expect(normalizeLinkUrl('https://facebook.com/shop')).toBe('https://facebook.com/shop');
    expect(normalizeLinkUrl('  ')).toBe('');
    for (const b of BAD) expect(normalizeLinkUrl(b)).toBeNull();
  });

  it('findUnsafeMarkdownLinks lists only non-http(s) link targets', () => {
    expect(findUnsafeMarkdownLinks('See [guide](https://example.com) and **bold**')).toEqual([]);
    expect(findUnsafeMarkdownLinks("[x](javascript:fetch('//evil'))")).toHaveLength(1);
    expect(findUnsafeMarkdownLinks('[a](https://ok.com) [b](data:text/html,hi)')).toEqual(['data:text/html,hi']);
  });
});

// Same field shapes routes/organizers.ts PATCH /me uses (importing the router boots the server).
const organizerProfileSchema = z.object({
  website: websiteUrlSchema.optional(),
  ebayStoreUrl: websiteUrlSchema.optional(),
  facebook: socialUrlSchema.optional(),
  instagram: socialUrlSchema.optional(),
  etsy: socialUrlSchema.optional(),
  twitterUrl: socialUrlSchema.optional(),
  tiktokUrl: socialUrlSchema.optional(),
  youtubeUrl: socialUrlSchema.optional(),
  pinterestUrl: socialUrlSchema.optional(),
});

describe('organizer profile links', () => {
  it('routes/organizers.ts uses these schemas for every link field', () => {
    const src: string = require('fs').readFileSync(require('path').join(__dirname, '..', 'routes', 'organizers.ts'), 'utf8');
    expect(src).toContain('website: websiteUrlSchema.optional(),');
    expect(src).toContain('ebayStoreUrl: websiteUrlSchema.optional(),');
    for (const f of ['facebook', 'instagram', 'etsy', 'twitterUrl', 'tiktokUrl', 'youtubeUrl', 'pinterestUrl']) {
      expect(src).toContain(`${f}: socialUrlSchema.optional(),`);
    }
  });

  it.each(['website', 'ebayStoreUrl', 'facebook', 'instagram', 'etsy', 'twitterUrl', 'tiktokUrl', 'youtubeUrl', 'pinterestUrl'])(
    '%s refuses script and data URLs',
    (field) => {
      for (const b of BAD) expect(organizerProfileSchema.safeParse({ [field]: b }).success).toBe(false);
    }
  );

  it('keeps legit values working', () => {
    expect(organizerProfileSchema.parse({ website: 'https://shop.example.com' }).website).toBe('https://shop.example.com');
    expect(organizerProfileSchema.parse({ website: '' }).website).toBe('');
    expect(organizerProfileSchema.parse({ instagram: 'instagram.com/myshop' }).instagram).toBe('https://instagram.com/myshop');
    expect(organizerProfileSchema.parse({ facebook: '' }).facebook).toBe('');
    expect(organizerProfileSchema.safeParse({ website: 'shop.example.com' }).success).toBe(false); // website always needed a scheme
  });
});

describe('bounty reference link', () => {
  const req = (referenceUrl: unknown) => ({
    user: { id: 'u1' },
    body: { itemName: 'Lamp', category: 'home', maxBudget: 20, radiusMiles: 10, referenceUrl },
  } as any);

  it('refuses a javascript: link and writes nothing', async () => {
    for (const b of BAD) {
      const res = makeRes();
      await createBounty(req(b), res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(db.missingListingBounty.create).not.toHaveBeenCalled();
  });

  it('stores an https link, and no link at all', async () => {
    db.missingListingBounty.create.mockImplementation(async ({ data }: any) => ({ id: 'b1', ...data }));
    let res = makeRes();
    await createBounty(req(' https://example.com/lamp '), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(db.missingListingBounty.create.mock.calls[0][0].data.referenceUrl).toBe('https://example.com/lamp');
    res = makeRes();
    await createBounty(req(''), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(db.missingListingBounty.create.mock.calls[1][0].data.referenceUrl).toBeNull();
  });
});

describe('encyclopedia links and review', () => {
  const user = (role = 'USER') => ({ id: 'author', role, roles: [role] });

  it('refuses an unsafe link on create', async () => {
    const res = makeRes();
    await createEntry({ user: user(), body: { slug: 's', title: 't', category: 'c', content: '[x](javascript:alert(1))' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(enc.createEntry).not.toHaveBeenCalled();
  });

  it('refuses an unsafe link on edit', async () => {
    enc.getEntry.mockResolvedValue({ id: 'e1', authorId: 'author', status: 'PUBLISHED' });
    const res = makeRes();
    await updateEntry({ user: user(), params: { entryId: 'e1' }, body: { content: '[x](javascript:alert(1))' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(enc.updateEntry).not.toHaveBeenCalled();
  });

  it("an author's edit of a published entry goes back to review", async () => {
    enc.getEntry.mockResolvedValue({ id: 'e1', authorId: 'author', status: 'PUBLISHED' });
    enc.updateEntry.mockImplementation(async (_id: string, data: any) => ({ id: 'e1', updatedAt: new Date(), status: data.status ?? 'PUBLISHED' }));
    const res = makeRes();
    await updateEntry({ user: user(), params: { entryId: 'e1' }, body: { content: 'See [guide](https://example.com)' } } as any, res);
    expect(enc.updateEntry.mock.calls[0][1].status).toBe('PENDING_REVIEW');
    expect(res.json.mock.calls[0][0].status).toBe('PENDING_REVIEW');
  });

  it('an admin edit stays published', async () => {
    enc.getEntry.mockResolvedValue({ id: 'e1', authorId: 'author', status: 'PUBLISHED' });
    enc.updateEntry.mockImplementation(async (_id: string, data: any) => ({ id: 'e1', updatedAt: new Date(), status: data.status ?? 'PUBLISHED' }));
    const res = makeRes();
    await updateEntry({ user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] }, params: { entryId: 'e1' }, body: { content: 'Edited' } } as any, res);
    expect(enc.updateEntry.mock.calls[0][1].status).toBeUndefined();
  });
});
