/**
 * FCC ID through the enrichment cascade (OCR value beats the model value; organizer value always wins).
 * No network: axios and the eBay catalog lookup are mocked. NOT EXECUTED when written (jest cannot run on
 * the authoring device); CI is the first real run.
 */
jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn(async () => ({ status: 404, data: null })) } }));
jest.mock('../services/ebayCatalogLookup', () => ({ enrichItemFromCatalog: jest.fn(async () => null) }));

import { enrichItem, planEnrichmentApply, _clearEnrichmentCache } from '../services/productEnrichment';

const baseItem = { title: 'Wireless Router', brand: null, mpn: null, upc: null, ean: null, isbn: null, tags: [] };

describe('FCC ID enrichment', () => {
  beforeEach(() => _clearEnrichmentCache());

  it('prefers the OCR-regex value over the model value', async () => {
    const { merged } = await enrichItem(baseItem, {
      aiResult: { confidence: 0.95, fccId: 'ZZZ9999999', ocrFccId: 'A3LSMG991U' },
    });
    expect(merged.fccId).toMatchObject({ value: 'A3LSMG991U', source: 'ocr' });
  });

  it('uses the model value (at the AI confidence) when OCR found none', async () => {
    const { merged } = await enrichItem(baseItem, { aiResult: { confidence: 0.92, fccId: 'a3lsmg991u' } });
    expect(merged.fccId).toMatchObject({ value: 'A3LSMG991U', source: 'aiEstimate', confidence: 0.92 });
  });

  it('drops a malformed model value', async () => {
    const { merged } = await enrichItem(baseItem, { aiResult: { confidence: 0.95, fccId: 'MODELXYZ' } });
    expect(merged.fccId).toBeUndefined();
  });

  it('auto-applies into an empty column', () => {
    const plan = planEnrichmentApply(
      { fccId: { value: 'A3LSMG991U', source: 'ocr', confidence: 0.9 } },
      { fccId: null, userEditedFields: [] },
    );
    expect(plan.apply.fccId).toBe('A3LSMG991U');
  });

  it('never overwrites an existing or organizer-edited value', () => {
    const merged = { fccId: { value: 'A3LSMG991U', source: 'ocr', confidence: 0.9 } };
    expect(planEnrichmentApply(merged, { fccId: '2AB7C-XYZ123', userEditedFields: [] }).apply.fccId).toBeUndefined();
    expect(planEnrichmentApply(merged, { fccId: null, userEditedFields: ['fccId'] }).apply.fccId).toBeUndefined();
  });

  it('ignores fccId entirely when the caller does not pass the column value', () => {
    const plan = planEnrichmentApply(
      { fccId: { value: 'A3LSMG991U', source: 'ocr', confidence: 0.9 } },
      { userEditedFields: [] },
    );
    expect(plan.apply.fccId).toBeUndefined();
  });
});
