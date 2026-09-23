/**
 * platformSoldDetectionService.ts -- unit tests (2026-09-23). Uses the real matcher from
 * vintedSoldDetectionService with injected loaders, so no database.
 */

jest.mock('../../lib/prisma', () => ({ prisma: {} }));
jest.mock('../facebookNativeSaleService', () => ({ commitFacebookNativeSale: jest.fn() }));

import { processPlatformSoldReport, type PlatformSoldDeps } from '../platformSoldDetectionService';

const ITEMS = [
  { id: 'item_pw', title: 'Planet Waves XLR Microphone Cable, Male to Female', status: 'AVAILABLE' },
  { id: 'item_heart', title: 'Heart Dreamboat Annie Vinyl LP Record, 1975', status: 'AVAILABLE' },
  { id: 'dup_a', title: 'Eagles Their Greatest Hits Vinyl Record, 1976', status: 'AVAILABLE' },
  { id: 'dup_b', title: 'Eagles: Their Greatest Hits, Vinyl Record 1976', status: 'AVAILABLE' },
  { id: 'short', title: 'LP Lot', status: 'AVAILABLE' },
];

function deps(over: Partial<PlatformSoldDeps> = {}) {
  const d = {
    loadCandidateItems: jest.fn(async () => ITEMS),
    loadPlatformJobs: jest.fn(async () => [] as Array<{ itemId: string; remoteListingId: string | null }>),
    closeListingRecord: jest.fn(async () => true),
    commitSale: jest.fn(async () => ({ alreadyCommitted: false })),
    getItemStatus: jest.fn(async () => 'SOLD'),
    ...over,
  };
  return d;
}

describe('processPlatformSoldReport', () => {
  it('matches a unique normalized title, closes THAT platform record, then commits with soldVia', async () => {
    const d = deps();
    const r = await processPlatformSoldReport('MERCARI', 'MERCARI', 'org_1', {
      remoteListingId: 'm55401730709',
      title: 'planet waves xlr microphone cable male to female',
    }, d);
    expect(r).toMatchObject({ result: 'sold', itemId: 'item_pw', via: 'title', listingClosed: true, platform: 'MERCARI' });
    expect(d.loadPlatformJobs).toHaveBeenCalledWith('org_1', 'MERCARI');
    expect(d.closeListingRecord).toHaveBeenCalledWith('item_pw', 'MERCARI');
    expect(d.commitSale).toHaveBeenCalledWith('item_pw', 'MERCARI');
    expect(d.closeListingRecord.mock.invocationCallOrder[0]).toBeLessThan(d.commitSale.mock.invocationCallOrder[0]);
  });

  it('prefers a recorded remote listing id over the title', async () => {
    const d = deps({ loadPlatformJobs: jest.fn(async () => [{ itemId: 'item_heart', remoteListingId: 'm999' }]) });
    const r = await processPlatformSoldReport('MERCARI', 'MERCARI', 'org_1', { remoteListingId: 'm999', title: 'something else entirely' }, d);
    expect(r).toMatchObject({ result: 'sold', itemId: 'item_heart', via: 'remoteId' });
  });

  it('refuses a title hit whose item has a DIFFERENT remote id on record for this platform', async () => {
    const d = deps({ loadPlatformJobs: jest.fn(async () => [{ itemId: 'item_pw', remoteListingId: 'm111' }]) });
    const r = await processPlatformSoldReport('MERCARI', 'MERCARI', 'org_1', { remoteListingId: 'm222', title: ITEMS[0].title }, d);
    expect(r.result).toBe('notFound');
    expect(d.commitSale).not.toHaveBeenCalled();
  });

  it('never guesses between two items with the same normalized title', async () => {
    const d = deps();
    const r = await processPlatformSoldReport('FACEBOOK', 'FB_EMAIL_ORDER', 'org_1', { remoteListingId: '', title: 'Eagles Their Greatest Hits Vinyl Record 1976' }, d);
    expect(r).toMatchObject({ result: 'ambiguous', candidateCount: 2 });
    expect(d.closeListingRecord).not.toHaveBeenCalled();
    expect(d.commitSale).not.toHaveBeenCalled();
  });

  it('refuses titles shorter than the minimum and unknown titles', async () => {
    const d = deps();
    expect((await processPlatformSoldReport('MERCARI', 'MERCARI', 'org_1', { remoteListingId: '', title: 'LP Lot' }, d)).result).toBe('notFound');
    expect((await processPlatformSoldReport('MERCARI', 'MERCARI', 'org_1', { remoteListingId: '', title: 'Not an item we have' }, d)).result).toBe('notFound');
    expect(d.commitSale).not.toHaveBeenCalled();
  });

  it('reports alreadySold / notAvailable from the item status on an idempotent repeat', async () => {
    const d = deps({ commitSale: jest.fn(async () => ({ alreadyCommitted: true })) });
    const r = await processPlatformSoldReport('MERCARI', 'MERCARI', 'org_1', { remoteListingId: '', title: ITEMS[0].title }, d);
    expect(r.result).toBe('alreadySold');
    const d2 = deps({ commitSale: jest.fn(async () => ({ alreadyCommitted: true })), getItemStatus: jest.fn(async () => 'RESERVED') });
    const r2 = await processPlatformSoldReport('MERCARI', 'MERCARI', 'org_1', { remoteListingId: '', title: ITEMS[0].title }, d2);
    expect(r2.result).toBe('notAvailable');
  });

  it('turns a failed commit into result error', async () => {
    const d = deps({ commitSale: jest.fn(async () => { throw new Error('db down'); }) });
    const r = await processPlatformSoldReport('MERCARI', 'MERCARI', 'org_1', { remoteListingId: '', title: ITEMS[0].title }, d);
    expect(r).toMatchObject({ result: 'error', reason: 'commit_failed', itemId: 'item_pw' });
  });

  it('requires an organizer id', async () => {
    await expect(processPlatformSoldReport('MERCARI', 'MERCARI', '', { remoteListingId: '', title: 'x' }, deps())).rejects.toThrow();
  });
});
