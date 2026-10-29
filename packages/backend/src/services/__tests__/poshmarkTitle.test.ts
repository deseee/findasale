/**
 * 2026-10-29: the extension posts "Cart" where the item title says "Cartridge" on Poshmark only (its validator flags
 * "Cartridge" as a possible vape item). A Poshmark sold report carrying the posted title must still match the item; no other
 * platform gains the extra key.
 */
jest.mock('../../lib/prisma', () => ({ prisma: {} }));
jest.mock('../facebookNativeSaleService', () => ({ commitFacebookNativeSale: jest.fn() }));

import * as fs from 'fs';
import * as path from 'path';
import { poshmarkCartTitle, truncatePoshmarkTitle, addPoshmarkTitleKeys } from '../poshmarkTitle';
import { buildVintedSoldMatchContext, matchVintedSoldEntry } from '../vintedSoldDetectionService';
import { processPlatformSoldReport, type PlatformSoldDeps } from '../platformSoldDetectionService';

const FATAL = 'Fatal Fury Neo Geo MVS Arcade Cartridge Cartridge, SNK 1991';
const WORLD = 'World Heroes Neo Geo MVS Arcade Cartridge';

describe('poshmarkCartTitle', () => {
  it.each([
    [FATAL, 'Fatal Fury Neo Geo MVS Arcade Cart, SNK 1991'],
    [WORLD, 'World Heroes Neo Geo MVS Arcade Cart'],
    ['Neo Geo MVS Cartridges Lot of 3', 'Neo Geo MVS Carts Lot of 3'],
    ['NINTENDO GAME CARTRIDGE', 'NINTENDO GAME CART'],
    ['Game Cart Cartridge', 'Game Cart'],
    ['Cartridgeless Pen Holder', 'Cartridgeless Pen Holder'],
    ['510 Thread Vape Cartridge Battery', '510 Thread Vape Cartridge Battery'],
    ['Empty THC Cartridges 1ml', 'Empty THC Cartridges 1ml'],
    ['E-Cig Cartridge Refill', 'E-Cig Cartridge Refill'],
    ['Oil Filter Cartridge', 'Oil Filter Cartridge'],
  ])('%s -> %s', (input, want) => {
    expect(poshmarkCartTitle(input)).toBe(want);
  });

  it('matches the extension copy (fas-poshmark.js) on the same inputs', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../../../../extension/fas-edit-core.js'), 'utf8');
    const mod: { exports: any } = { exports: {} };
    new Function('module', 'self', src)(mod, {});
    const C = mod.exports;
    for (const t of [FATAL, WORLD, 'Neo Geo MVS Cartridges Lot of 3', 'GAME CARTRIDGE', 'Vape Cartridge', 'Cart Cartridge carts', '']) {
      expect(poshmarkCartTitle(t)).toBe(C.poshmarkCartTitle(t));
      expect(truncatePoshmarkTitle(poshmarkCartTitle(t))).toBe(C.poshmarkTitle(C.poshmarkCartTitle(t)));
    }
  });
});

describe('addPoshmarkTitleKeys', () => {
  const items = [
    { id: 'fatal', title: FATAL, status: 'AVAILABLE' },
    { id: 'world', title: WORLD, status: 'AVAILABLE' },
    { id: 'vape', title: '510 Vape Cartridge Battery Kit', status: 'AVAILABLE' },
  ];
  it('adds the Cart title as a key for the same item only', () => {
    const ctx = buildVintedSoldMatchContext(items, []);
    addPoshmarkTitleKeys(ctx, items);
    expect(matchVintedSoldEntry({ vintedId: '', title: 'Fatal Fury Neo Geo MVS Arcade Cart, SNK 1991' }, ctx)).toEqual({ kind: 'matched', itemId: 'fatal', via: 'title' });
    expect(matchVintedSoldEntry({ vintedId: '', title: FATAL }, ctx)).toEqual({ kind: 'matched', itemId: 'fatal', via: 'title' });
    expect(matchVintedSoldEntry({ vintedId: '', title: '510 Vape Cart Battery Kit' }, ctx).kind).toBe('notFound');
  });
  it('stays ambiguous when another item already carries the Cart title', () => {
    const two = [...items, { id: 'other', title: 'World Heroes Neo Geo MVS Arcade Cart', status: 'AVAILABLE' }];
    const ctx = buildVintedSoldMatchContext(two, []);
    addPoshmarkTitleKeys(ctx, two);
    expect(matchVintedSoldEntry({ vintedId: '', title: 'World Heroes Neo Geo MVS Arcade Cart' }, ctx)).toMatchObject({ kind: 'ambiguous', candidateCount: 2 });
  });
});

describe('processPlatformSoldReport with a Cart title', () => {
  const ITEMS = [{ id: 'world', title: WORLD, status: 'AVAILABLE' }];
  const deps = (): PlatformSoldDeps => ({
    loadCandidateItems: jest.fn(async () => ITEMS),
    loadPlatformJobs: jest.fn(async () => []),
    closeListingRecord: jest.fn(async () => true),
    commitSale: jest.fn(async () => ({ alreadyCommitted: false })),
    getItemStatus: jest.fn(async () => 'SOLD'),
  });
  it('POSHMARK: the sold email title "...Arcade Cart" resolves to the Cartridge item', async () => {
    const d = deps();
    const r = await processPlatformSoldReport('POSHMARK', 'POSHMARK', 'org_1', { remoteListingId: '', title: 'World Heroes Neo Geo MVS Arcade Cart' }, d);
    expect(r).toMatchObject({ result: 'sold', itemId: 'world', via: 'title' });
  });
  it('MERCARI: no Cart key is added (Poshmark only)', async () => {
    const d = deps();
    const r = await processPlatformSoldReport('MERCARI', 'MERCARI', 'org_1', { remoteListingId: '', title: 'World Heroes Neo Geo MVS Arcade Cart' }, d);
    expect(r.result).toBe('notFound');
    expect(d.commitSale).not.toHaveBeenCalled();
  });
});
