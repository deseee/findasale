/**
 * Consignor price tags: signing, verification, line resolution and minting (2026-10-06).
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 * Pure functions are called with an explicit env object, so nothing here reads process.env.
 */
export {};

import {
  TAG_LISTING_TYPE,
  buildConsignorTagQrUrl,
  consignorTagErrorBody,
  formatTagTitle,
  isConsignorTagError,
  isConsignorTagsEnabled,
  isTagSigningConfigured,
  mintTagItemInTx,
  parseStoredTagLines,
  resolveTagLines,
  signTag,
  tagLinesTotalCents,
  tagSku,
  toTagLineInput,
  verifyTag,
} from '../services/consignorTagService';

const ENV_ON = { POS_CONSIGNOR_TAGS_ENABLED: 'true', POS_TAG_SIGNING_SECRET: 'unit-test-secret', NODE_ENV: 'test' };
const FIELDS = { saleId: 'sale1', consignorId: 'cons1', priceCents: 500, nonce: 'tag1' };

describe('feature flag and secret', () => {
  it('is off unless the flag is explicitly on', () => {
    expect(isConsignorTagsEnabled({})).toBe(false);
    expect(isConsignorTagsEnabled({ POS_CONSIGNOR_TAGS_ENABLED: 'false' })).toBe(false);
    expect(isConsignorTagsEnabled({ POS_CONSIGNOR_TAGS_ENABLED: 'true' })).toBe(true);
    expect(isConsignorTagsEnabled({ POS_CONSIGNOR_TAGS_ENABLED: '1' })).toBe(true);
  });

  it('fails closed in production when no secret is set', () => {
    const prodNoSecret = { NODE_ENV: 'production' };
    expect(isTagSigningConfigured(prodNoSecret)).toBe(false);
    expect(() => signTag(FIELDS, prodNoSecret)).toThrow();
    try {
      signTag(FIELDS, prodNoSecret);
    } catch (err) {
      expect(isConsignorTagError(err)).toBe(true);
      expect((err as any).code).toBe('TAG_SIGNING_NOT_CONFIGURED');
      expect((err as any).status).toBe(503);
    }
    // A signature made elsewhere never verifies when the server has no secret.
    const sig = signTag(FIELDS, ENV_ON);
    expect(verifyTag({ ...FIELDS, sig }, prodNoSecret)).toBe(false);
  });

  it('uses a per-process secret outside production so local runs still work', () => {
    const devEnv = { NODE_ENV: 'development' };
    expect(isTagSigningConfigured(devEnv)).toBe(true);
    const sig = signTag(FIELDS, devEnv);
    expect(verifyTag({ ...FIELDS, sig }, devEnv)).toBe(true);
  });
});

describe('sign and verify', () => {
  it('round trips', () => {
    const sig = signTag(FIELDS, ENV_ON);
    expect(typeof sig).toBe('string');
    expect(sig.length).toBeGreaterThan(0);
    expect(verifyTag({ ...FIELDS, sig }, ENV_ON)).toBe(true);
  });

  it('is stable for the same fields and different for different fields', () => {
    expect(signTag(FIELDS, ENV_ON)).toBe(signTag({ ...FIELDS }, ENV_ON));
    expect(signTag(FIELDS, ENV_ON)).not.toBe(signTag({ ...FIELDS, priceCents: 501 }, ENV_ON));
  });

  it('rejects a tampered price, consignor, sale or nonce', () => {
    const sig = signTag(FIELDS, ENV_ON);
    expect(verifyTag({ ...FIELDS, priceCents: 5, sig }, ENV_ON)).toBe(false);
    expect(verifyTag({ ...FIELDS, consignorId: 'cons2', sig }, ENV_ON)).toBe(false);
    expect(verifyTag({ ...FIELDS, saleId: 'sale2', sig }, ENV_ON)).toBe(false);
    expect(verifyTag({ ...FIELDS, nonce: 'tag2', sig }, ENV_ON)).toBe(false);
  });

  it('rejects a signature made with another secret', () => {
    const sig = signTag(FIELDS, { ...ENV_ON, POS_TAG_SIGNING_SECRET: 'other-secret' });
    expect(verifyTag({ ...FIELDS, sig }, ENV_ON)).toBe(false);
  });

  it('rejects wrong-length, empty and non-string signatures without throwing', () => {
    const sig = signTag(FIELDS, ENV_ON);
    expect(verifyTag({ ...FIELDS, sig: sig.slice(0, -1) }, ENV_ON)).toBe(false);
    expect(verifyTag({ ...FIELDS, sig: `${sig}A` }, ENV_ON)).toBe(false);
    expect(verifyTag({ ...FIELDS, sig: '' }, ENV_ON)).toBe(false);
    expect(verifyTag({ ...FIELDS, sig: undefined }, ENV_ON)).toBe(false);
    expect(verifyTag({ ...FIELDS, sig: 12345 }, ENV_ON)).toBe(false);
  });
});

describe('qr url and line helpers', () => {
  it('builds the url the register parses', () => {
    const sig = signTag(FIELDS, ENV_ON);
    const url = buildConsignorTagQrUrl({ frontendUrl: 'https://finda.sale', ...FIELDS, sig });
    expect(url).toBe(`https://finda.sale/pos/sale1?action=add-misc&price=5.00&c=cons1&n=tag1&s=${sig}`);
  });

  it('totals, titles and accepts both price spellings', () => {
    expect(tagLinesTotalCents([{ priceCents: 500 }, { priceCents: 250 }])).toBe(750);
    expect(formatTagTitle(1234)).toBe('Consigned tag $12.34');
    expect(toTagLineInput({ consignorId: 'c', nonce: 'n', sig: 's', amountCents: 100 }).priceCents).toBe(100);
    expect(toTagLineInput({ consignorId: 'c', nonce: 'n', sig: 's', priceCents: 200 }).priceCents).toBe(200);
    expect(tagSku('pay1', 'tag1')).toBe('CTAG-pay1-tag1');
  });

  it('reads stored lines back and throws on a damaged value instead of dropping money', () => {
    expect(parseStoredTagLines(null)).toEqual([]);
    expect(parseStoredTagLines([{ consignorId: 'c', nonce: 'n', sig: 's', priceCents: 500, saleId: 'sale1', vendorBoothId: 'b1' }])).toEqual([
      { consignorId: 'c', nonce: 'n', sig: 's', priceCents: 500, saleId: 'sale1', vendorBoothId: 'b1' },
    ]);
    expect(() => parseStoredTagLines('nope')).toThrow();
    expect(() => parseStoredTagLines([{ consignorId: 'c', nonce: 'n', sig: 's', priceCents: 12.5 }])).toThrow();
    expect(() => parseStoredTagLines([{ consignorId: 'c', nonce: 'n', priceCents: 500 }])).toThrow();
    expect(consignorTagErrorBody).toBeDefined();
  });

  it('keeps organizerId on a hub line and still reads a line stored before organizerId existed', () => {
    const withOrganizer = { consignorId: 'c', nonce: 'n', sig: 's', priceCents: 500, saleId: 'sale1', vendorBoothId: 'b1', organizerId: 'org9' };
    expect(parseStoredTagLines([withOrganizer])).toEqual([withOrganizer]);
    const legacy = parseStoredTagLines([{ consignorId: 'c', nonce: 'n', sig: 's', priceCents: 500, saleId: 'sale1', vendorBoothId: 'b1' }]);
    expect(legacy[0].organizerId).toBeUndefined();
    // a non-string organizerId is ignored rather than trusted
    expect(parseStoredTagLines([{ consignorId: 'c', nonce: 'n', sig: 's', priceCents: 500, organizerId: 7 }])[0].organizerId).toBeUndefined();
  });
});

function makeDb(opts: { saleOrganizerId?: string | null; workspaceId?: string | null; consignors?: any[] } = {}) {
  const saleOrganizerId = opts.saleOrganizerId === undefined ? 'org1' : opts.saleOrganizerId;
  return {
    sale: { findUnique: jest.fn().mockResolvedValue(saleOrganizerId === null ? null : { id: 'sale1', organizerId: saleOrganizerId }) },
    organizerWorkspace: { findFirst: jest.fn().mockResolvedValue(opts.workspaceId === null ? null : { id: opts.workspaceId ?? 'ws1' }) },
    consignor: {
      findMany: jest.fn().mockResolvedValue(opts.consignors ?? [{ id: 'cons1', name: 'Pat', workspaceId: 'ws1', archivedAt: null }]),
    },
  };
}

function signedLine(overrides: Record<string, unknown> = {}) {
  const sig = signTag(FIELDS, ENV_ON);
  return { consignorId: 'cons1', nonce: 'tag1', sig, priceCents: 500, ...overrides };
}

const TEAMS = { id: 'org1', subscriptionTier: 'TEAMS' };

async function expectCode(promise: Promise<unknown>, code: string, status: number) {
  try {
    await promise;
  } catch (err) {
    expect(isConsignorTagError(err)).toBe(true);
    expect((err as any).code).toBe(code);
    expect((err as any).status).toBe(status);
    return;
  }
  throw new Error(`expected ${code}`);
}

describe('resolveTagLines', () => {
  it('returns nothing for no lines without touching the db', async () => {
    const db = makeDb();
    await expect(resolveTagLines(db, { organizer: TEAMS, saleId: 'sale1', lines: [] }, ENV_ON)).resolves.toEqual([]);
    expect(db.sale.findUnique).not.toHaveBeenCalled();
  });

  it('accepts a good line and reports the consignor name', async () => {
    const db = makeDb();
    const out = await resolveTagLines(db, { organizer: TEAMS, saleId: 'sale1', lines: [signedLine()] }, ENV_ON);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ consignorId: 'cons1', consignorName: 'Pat', nonce: 'tag1', priceCents: 500, workspaceId: 'ws1' });
  });

  it('refuses when the flag is off, the secret is missing or the plan is not TEAMS', async () => {
    const db = makeDb();
    await expectCode(resolveTagLines(db, { organizer: TEAMS, saleId: 'sale1', lines: [signedLine()] }, { ...ENV_ON, POS_CONSIGNOR_TAGS_ENABLED: 'false' }), 'CONSIGNOR_TAGS_DISABLED', 403);
    await expectCode(resolveTagLines(db, { organizer: TEAMS, saleId: 'sale1', lines: [signedLine()] }, { POS_CONSIGNOR_TAGS_ENABLED: 'true', NODE_ENV: 'production' }), 'TAG_SIGNING_NOT_CONFIGURED', 503);
    await expectCode(resolveTagLines(db, { organizer: { id: 'org1', subscriptionTier: 'PRO' }, saleId: 'sale1', lines: [signedLine()] }, ENV_ON), 'TEAMS_REQUIRED', 403);
  });

  it('refuses malformed and duplicate lines before any lookup', async () => {
    const db = makeDb();
    await expectCode(resolveTagLines(db, { organizer: TEAMS, saleId: 'sale1', lines: [signedLine({ priceCents: 0 })] }, ENV_ON), 'TAG_INVALID', 400);
    await expectCode(resolveTagLines(db, { organizer: TEAMS, saleId: 'sale1', lines: [signedLine({ priceCents: 5.5 })] }, ENV_ON), 'TAG_INVALID', 400);
    await expectCode(resolveTagLines(db, { organizer: TEAMS, saleId: 'sale1', lines: [signedLine({ consignorId: 'bad id!' })] }, ENV_ON), 'TAG_INVALID', 400);
    await expectCode(resolveTagLines(db, { organizer: TEAMS, saleId: 'sale1', lines: [signedLine(), signedLine()] }, ENV_ON), 'TAG_DUPLICATE', 400);
    expect(db.sale.findUnique).not.toHaveBeenCalled();
  });

  it('refuses a sale that belongs to another organizer', async () => {
    const db = makeDb({ saleOrganizerId: 'someone-else' });
    await expectCode(resolveTagLines(db, { organizer: TEAMS, saleId: 'sale1', lines: [signedLine()] }, ENV_ON), 'SALE_NOT_OWNED', 403);
    const missing = makeDb({ saleOrganizerId: null });
    await expectCode(resolveTagLines(missing, { organizer: TEAMS, saleId: 'sale1', lines: [signedLine()] }, ENV_ON), 'SALE_NOT_OWNED', 403);
  });

  it('fails the signature on a changed price, a swapped consignor or a sticker from another sale, before any consignor lookup', async () => {
    const db = makeDb();
    await expectCode(resolveTagLines(db, { organizer: TEAMS, saleId: 'sale1', lines: [signedLine({ priceCents: 100 })] }, ENV_ON), 'TAG_SIGNATURE_INVALID', 400);
    await expectCode(resolveTagLines(db, { organizer: TEAMS, saleId: 'sale1', lines: [signedLine({ consignorId: 'cons2' })] }, ENV_ON), 'TAG_SIGNATURE_INVALID', 400);
    const otherSale = signTag({ ...FIELDS, saleId: 'sale-other' }, ENV_ON);
    await expectCode(resolveTagLines(db, { organizer: TEAMS, saleId: 'sale1', lines: [signedLine({ sig: otherSale })] }, ENV_ON), 'TAG_SIGNATURE_INVALID', 400);
    expect(db.consignor.findMany).not.toHaveBeenCalled();
  });

  it('answers the same 404 for a consignor of another workspace and a consignor that does not exist', async () => {
    const foreign = makeDb({ consignors: [] }); // the query is scoped to the workspace, so a foreign consignor is simply absent
    await expectCode(resolveTagLines(foreign, { organizer: TEAMS, saleId: 'sale1', lines: [signedLine()] }, ENV_ON), 'CONSIGNOR_NOT_FOUND', 404);
    expect(foreign.consignor.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['cons1'] }, workspaceId: 'ws1' } }));
    const noWorkspace = makeDb({ workspaceId: null });
    await expectCode(resolveTagLines(noWorkspace, { organizer: TEAMS, saleId: 'sale1', lines: [signedLine()] }, ENV_ON), 'CONSIGNOR_NOT_FOUND', 404);
  });

  it('refuses an archived consignor for new tags but allows it when recording an already validated sale', async () => {
    const archived = makeDb({ consignors: [{ id: 'cons1', name: 'Pat', workspaceId: 'ws1', archivedAt: new Date() }] });
    await expectCode(resolveTagLines(archived, { organizer: TEAMS, saleId: 'sale1', lines: [signedLine()] }, ENV_ON), 'CONSIGNOR_ARCHIVED', 409);
    const out = await resolveTagLines(archived, { organizer: TEAMS, saleId: 'sale1', lines: [signedLine()], refuseArchived: false }, ENV_ON);
    expect(out).toHaveLength(1);
  });
});

function makeTx(opts: { existing?: any; consignor?: any } = {}) {
  return {
    item: {
      findFirst: jest.fn().mockResolvedValue(opts.existing ?? null),
      create: jest.fn().mockResolvedValue({ id: 'minted1' }),
    },
    consignor: { findFirst: jest.fn().mockResolvedValue(opts.consignor === undefined ? { id: 'cons1', archivedAt: null } : opts.consignor) },
  };
}

const MINT = { saleId: 'sale1', organizerId: 'org1', consignorId: 'cons1', priceCents: 500, nonce: 'tag1', paymentRef: 'pay1' };

describe('mintTagItemInTx', () => {
  it('creates a photo-less SOLD consignor item that is hidden from shoppers and exempt from markdown', async () => {
    const tx = makeTx();
    const out = await mintTagItemInTx(tx, MINT);
    expect(out).toEqual({ itemId: 'minted1', created: true });
    const data = tx.item.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      status: 'SOLD',
      isActive: false,
      draftStatus: 'PUBLISHED',
      stockTotal: 1,
      stockSold: 1,
      excludeFromMarkdown: true,
      listingType: TAG_LISTING_TYPE,
      consignorId: 'cons1',
      saleId: 'sale1',
      organizerId: 'org1',
      price: 5,
      originalPrice: 5,
      photoUrls: [],
      title: 'Consigned tag $5.00',
      sku: 'CTAG-pay1-tag1',
    });
    expect(data.vendorBoothId).toBeUndefined();
    // No consignment minimum floor is applied: nothing here reads a price floor and the price is exactly the tag price.
    expect(data.price).toBe(MINT.priceCents / 100);
  });

  it('stamps the booth on a hub tag (consignorId AND vendorBoothId, like any consigned hub item) and leaves it unset for single-sale POS paths', async () => {
    const hub = makeTx();
    await mintTagItemInTx(hub, { ...MINT, vendorBoothId: 'boothV', organizerId: 'orgVendor' });
    expect(hub.item.create.mock.calls[0][0].data).toMatchObject({ consignorId: 'cons1', vendorBoothId: 'boothV', organizerId: 'orgVendor' });

    const nullBooth = makeTx();
    await mintTagItemInTx(nullBooth, { ...MINT, vendorBoothId: null });
    expect(nullBooth.item.create.mock.calls[0][0].data.vendorBoothId).toBeUndefined();
  });

  it('does not mint twice for a replay (same payment reference and nonce)', async () => {
    const tx = makeTx({ existing: { id: 'minted1', consignorId: 'cons1', listingType: TAG_LISTING_TYPE } });
    const out = await mintTagItemInTx(tx, MINT);
    expect(out).toEqual({ itemId: 'minted1', created: false });
    expect(tx.item.create).not.toHaveBeenCalled();
  });

  it('refuses a sku that already belongs to something that is not this tag', async () => {
    const tx = makeTx({ existing: { id: 'other', consignorId: 'cons1', listingType: 'FIXED' } });
    await expectCode(mintTagItemInTx(tx, MINT), 'TAG_SKU_CONFLICT', 409);
    const wrongConsignor = makeTx({ existing: { id: 'other', consignorId: 'cons9', listingType: TAG_LISTING_TYPE } });
    await expectCode(mintTagItemInTx(wrongConsignor, MINT), 'TAG_SKU_CONFLICT', 409);
  });

  it('refuses a consignor outside the organizer workspace', async () => {
    const tx = makeTx({ consignor: null });
    await expectCode(mintTagItemInTx(tx, MINT), 'CONSIGNOR_NOT_FOUND', 404);
    expect(tx.consignor.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'cons1', workspace: { ownerId: 'org1' } } }));
    expect(tx.item.create).not.toHaveBeenCalled();
  });

  it('refuses a newly archived consignor unless the caller already validated the sale', async () => {
    const archived = makeTx({ consignor: { id: 'cons1', archivedAt: new Date() } });
    await expectCode(mintTagItemInTx(archived, MINT), 'CONSIGNOR_ARCHIVED', 409);
    const allowed = makeTx({ consignor: { id: 'cons1', archivedAt: new Date() } });
    await expect(mintTagItemInTx(allowed, { ...MINT, allowArchived: true })).resolves.toEqual({ itemId: 'minted1', created: true });
  });
});
