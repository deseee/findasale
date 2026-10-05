/**
 * Imported-only eBay items (ebayListingId set, no ebayOfferId): a real local category / tags / photoUrls edit must set
 * ebayContentDirtyAt so the enrich pass and Trading backfill stop reverting it from eBay.
 */
import * as fs from 'fs';
import * as path from 'path';
import { importedOnlyEditNeedsDirtyMark, importedOnlyIdsNeedingDirtyMark, isImportedOnlyEbayItem, type ImportedEditItemState } from '../utils/ebayImportedEditMarker';
import { planEnrichWrites } from '../utils/ebayEnrichPlan';

const imported = (over: Partial<ImportedEditItemState> = {}): ImportedEditItemState => ({
  ebayListingId: '1234567890',
  ebayOfferId: null,
  category: 'Home & Garden',
  tags: ['a', 'b'],
  photoUrls: ['https://p/1.jpg', 'https://p/2.jpg'],
  ...over,
});

describe('importedOnlyEditNeedsDirtyMark', () => {
  it('marks an imported-only item when category changes', () => {
    expect(importedOnlyEditNeedsDirtyMark(imported(), { category: 'Collectibles' })).toBe(true);
  });
  it('marks when category is cleared or first set', () => {
    expect(importedOnlyEditNeedsDirtyMark(imported(), { category: null })).toBe(true);
    expect(importedOnlyEditNeedsDirtyMark(imported({ category: null }), { category: 'Collectibles' })).toBe(true);
  });
  it('marks when tags change', () => {
    expect(importedOnlyEditNeedsDirtyMark(imported(), { tags: ['a', 'c'] })).toBe(true);
    expect(importedOnlyEditNeedsDirtyMark(imported(), { tags: ['a'] })).toBe(true);
    expect(importedOnlyEditNeedsDirtyMark(imported({ tags: null }), { tags: ['a'] })).toBe(true);
  });
  it('marks when photoUrls change (add, remove, reorder)', () => {
    expect(importedOnlyEditNeedsDirtyMark(imported(), { photoUrls: ['https://p/1.jpg', 'https://p/2.jpg', 'https://p/3.jpg'] })).toBe(true);
    expect(importedOnlyEditNeedsDirtyMark(imported(), { photoUrls: ['https://p/1.jpg'] })).toBe(true);
    expect(importedOnlyEditNeedsDirtyMark(imported(), { photoUrls: ['https://p/2.jpg', 'https://p/1.jpg'] })).toBe(true);
  });
  it('does not mark a no-op resave (equal values, equal arrays, blank category variants)', () => {
    expect(importedOnlyEditNeedsDirtyMark(imported(), { category: 'Home & Garden', tags: ['a', 'b'], photoUrls: ['https://p/1.jpg', 'https://p/2.jpg'] })).toBe(false);
    expect(importedOnlyEditNeedsDirtyMark(imported({ category: null }), { category: '' })).toBe(false);
    expect(importedOnlyEditNeedsDirtyMark(imported({ category: '' }), { category: null })).toBe(false);
    expect(importedOnlyEditNeedsDirtyMark(imported({ tags: null, photoUrls: null }), { tags: [], photoUrls: [] })).toBe(false);
  });
  it('does not mark when the payload fields are undefined', () => {
    expect(importedOnlyEditNeedsDirtyMark(imported(), {})).toBe(false);
    expect(importedOnlyEditNeedsDirtyMark(imported(), { category: undefined, tags: undefined, photoUrls: undefined })).toBe(false);
  });
  it('does not mark an item that has an offer id, even when the fields change', () => {
    const owned = imported({ ebayOfferId: 'OFFER1' });
    expect(importedOnlyEditNeedsDirtyMark(owned, { category: 'X', tags: ['z'], photoUrls: ['https://p/9.jpg'] })).toBe(false);
  });
  it('does not mark a non-eBay item (no listing id, or a blank/whitespace listing id)', () => {
    expect(importedOnlyEditNeedsDirtyMark(imported({ ebayListingId: null }), { category: 'X' })).toBe(false);
    expect(importedOnlyEditNeedsDirtyMark(imported({ ebayListingId: undefined }), { tags: ['z'] })).toBe(false);
    expect(importedOnlyEditNeedsDirtyMark(imported({ ebayListingId: '  ' }), { photoUrls: [] })).toBe(false);
  });
  it('treats a whitespace or empty offer id as imported-only', () => {
    expect(importedOnlyEditNeedsDirtyMark(imported({ ebayOfferId: '   ' }), { category: 'X' })).toBe(true);
    expect(importedOnlyEditNeedsDirtyMark(imported({ ebayOfferId: '' }), { tags: ['z'] })).toBe(true);
    expect(isImportedOnlyEbayItem({ ebayListingId: 'L1', ebayOfferId: ' ' })).toBe(true);
    expect(isImportedOnlyEbayItem({ ebayListingId: 'L1', ebayOfferId: 'O1' })).toBe(false);
  });
  it('agrees with the enrich pass: once marked (dirty), the enrich plan writes nothing', () => {
    const state = { ...imported(), ebayContentDirtyAt: new Date() };
    expect(planEnrichWrites(state, { categoryName: 'eBay Cat', tags: ['t'], photoUrls: ['https://e/1.jpg'] })).toBeNull();
  });
});

describe('title / description / condition (re-analyze path)', () => {
  const withText = { ...imported(), title: 'Old title', description: 'Old description', condition: 'USED' } as ImportedEditItemState;
  it('marks an imported-only item when title, description or condition really change', () => {
    expect(importedOnlyEditNeedsDirtyMark(withText, { title: 'New title' })).toBe(true);
    expect(importedOnlyEditNeedsDirtyMark(withText, { description: 'New description' })).toBe(true);
    expect(importedOnlyEditNeedsDirtyMark(withText, { condition: 'NEW' })).toBe(true);
  });
  it('does not mark unchanged or undefined title, description, condition', () => {
    expect(importedOnlyEditNeedsDirtyMark(withText, { title: 'Old title', description: 'Old description', condition: 'USED' })).toBe(false);
    expect(importedOnlyEditNeedsDirtyMark(withText, { title: undefined, description: undefined, condition: undefined })).toBe(false);
  });
  it('does not mark an item with an offer id or a non-eBay item', () => {
    expect(importedOnlyEditNeedsDirtyMark({ ...withText, ebayOfferId: 'O1' }, { title: 'New title' })).toBe(false);
    expect(importedOnlyEditNeedsDirtyMark({ ...withText, ebayListingId: null }, { title: 'New title' })).toBe(false);
  });
});

describe('importedOnlyIdsNeedingDirtyMark (bulk and batch writers)', () => {
  const items = [
    { id: 'imp-change', ...imported() },
    { id: 'imp-same', ...imported({ category: 'Collectibles' }) },
    { id: 'owned', ...imported({ ebayOfferId: 'OFFER1' }) },
    { id: 'plain', ...imported({ ebayListingId: null }) },
    { id: 'imp-ws-offer', ...imported({ ebayOfferId: '  ' }) },
  ];
  it('returns only imported-only items whose category really changes', () => {
    expect(importedOnlyIdsNeedingDirtyMark(items, { category: 'Collectibles' })).toEqual(['imp-change', 'imp-ws-offer']);
  });
  it('returns nothing when the batch writes none of the three fields', () => {
    expect(importedOnlyIdsNeedingDirtyMark(items, {})).toEqual([]);
  });
  it('handles an empty batch', () => {
    expect(importedOnlyIdsNeedingDirtyMark([], { category: 'X' })).toEqual([]);
  });
});

describe('source guards', () => {
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const controller = read('controllers/itemController.ts');

  it('updateItem uses the helper and sets ebayContentDirtyAt from it', () => {
    expect(controller).toMatch(/from '\.\.\/utils\/ebayImportedEditMarker'/);
    const m = controller.match(/importedOnlyEditNeedsDirtyMark\(item, \{ category: updateData\.category, tags: updateData\.tags, photoUrls: updateData\.photoUrls \}\)\) \{\s*updateData\.ebayContentDirtyAt = new Date\(\);/);
    expect(m).not.toBeNull();
  });
  it('the photo add / remove / reorder endpoints use the helper', () => {
    expect((controller.match(/importedPhotoEditMark\(item,/g) || []).length).toBe(3);
  });
  it('bulk category (updateMany) sets the flag on imported-only ids via a second updateMany', () => {
    const routes = read('routes/items.ts');
    expect(routes).toMatch(/from '\.\.\/utils\/ebayImportedEditMarker'/);
    expect(routes).toMatch(/importedOnlyIdsNeedingDirtyMark\(confirmedItems, \{ category \}\)/);
    expect(routes).toMatch(/where: \{ id: \{ in: categoryDirtyIds \} \}, data: \{ ebayContentDirtyAt: new Date\(\) \}/);
  });
  it('bulk tags and bulk photos add/remove carry the per-item helper result', () => {
    const routes = read('routes/items.ts');
    expect(routes).toMatch(/importedOnlyEditNeedsDirtyMark\(item, \{ tags: updatedTags \}\)/);
    expect(routes).toMatch(/importedOnlyEditNeedsDirtyMark\(item, \{ photoUrls: \[\.\.\.item\.photoUrls, \.\.\.newPhotos\] \}\)/);
    expect(routes).toMatch(/importedOnlyEditNeedsDirtyMark\(item, \{ photoUrls: filtered \}\)/);
  });
  it('bulk photos selects the eBay ids the helper needs', () => {
    const routes = read('routes/items.ts');
    const photos = routes.slice(routes.indexOf("router.post('/bulk/photos'"));
    expect(photos).toMatch(/ebayListingId: true,\s*ebayOfferId: true,/);
  });
  it('offline sync UPDATE_ITEM replay uses the helper', () => {
    const sync = read('controllers/syncController.ts');
    expect(sync).toMatch(/from '\.\.\/utils\/ebayImportedEditMarker'/);
    expect(sync).toMatch(/importedOnlyEditNeedsDirtyMark\(currentItem,/);
  });
  it('re-analyze apply selects the eBay ids and sets the flag through the helper', () => {
    const svc = read('services/reanalyzeService.ts');
    expect(svc).toMatch(/from '\.\.\/utils\/ebayImportedEditMarker'/);
    expect(svc).toMatch(/ebayOfferId: true,\s*ebayListingId: true,/);
    expect(svc).toMatch(/importedOnlyEditNeedsDirtyMark\(item, \{\s*title: data\.title, description: data\.description, condition: data\.condition, category: data\.category, tags: data\.tags,\s*\}\)\) \{\s*data\.ebayContentDirtyAt = new Date\(\);/);
  });
  it('the markdown updateMany (markItemsRetaggedBulk) is left alone', () => {
    expect(controller).not.toMatch(/markdownPhysicallyAppliedAt: new Date\(\),[^}]*ebayContentDirtyAt/);
  });
  it('the dirty flag is never cleared by the new code path', () => {
    expect(read('utils/ebayImportedEditMarker.ts')).not.toMatch(/ebayContentDirtyAt\s*[:=]\s*null/);
  });
});
