/**
 * batch-analyze guards (P1, 2026-09-29): real MIME detection and fail-closed behavior without the gate.
 * Every heavy collaborator is a jest mock; no network.
 */
jest.mock('../lib/prisma', () => ({ prisma: {} }));
jest.mock('../middleware/auth', () => ({}));
jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../services/cloudAIService', () => ({ analyzeItemImages: jest.fn(), isCloudAIAvailable: () => true, clusterPhotos: jest.fn() }));
jest.mock('../lib/cloudinaryBandwidthTracker', () => ({ trackCloudinaryServe: jest.fn() }));
jest.mock('../services/descriptionMerger', () => ({ composeDescription: jest.fn() }));
jest.mock('../controllers/ebayController', () => ({ getEbayAccessToken: jest.fn(), suggestEbayCategoryForTitle: jest.fn(), computeEffectivePackageWeight: jest.fn() }));
jest.mock('../services/serverBarcodeDecoder', () => ({ decodeBarcodeFromImage: jest.fn() }));
jest.mock('../services/ebayCatalogLookup', () => ({ lookupByBarcode: jest.fn() }));
jest.mock('../services/productEnrichment', () => ({ enrichItem: jest.fn(), planEnrichmentApply: jest.fn() }));
jest.mock('../services/imageMatchService', () => ({ findCatalogMatches: jest.fn(), buildCatalogMatchContext: jest.fn(), isCatalogMatchEnabled: () => false }));
jest.mock('../services/ebayImageSearchService', () => ({ getEbayImageMatch: jest.fn(), buildEbayMatchContext: jest.fn() }));
jest.mock('../services/groundedIdentityService', () => ({ runGroundedIdentityAsync: jest.fn() }));
jest.mock('../utils/ebayShippingClassifier', () => ({ classifyEbayShipping: jest.fn() }));

import { detectImageMime, batchAnalyzeImages } from '../controllers/batchAnalyzeController';

describe('detectImageMime', () => {
  it('trusts a supported image Content-Type (parameters and case ignored)', () => {
    expect(detectImageMime('https://res.cloudinary.com/x/a.jpg', 'image/png')).toBe('image/png');
    expect(detectImageMime('https://res.cloudinary.com/x/a', 'IMAGE/WEBP; charset=binary')).toBe('image/webp');
    expect(detectImageMime('https://res.cloudinary.com/x/a', 'image/jpg')).toBe('image/jpeg');
    expect(detectImageMime('https://res.cloudinary.com/x/a', 'image/heic')).toBe('image/heic');
  });

  it('falls back to the URL extension when the header is missing or not a supported image type', () => {
    expect(detectImageMime('https://res.cloudinary.com/x/a.PNG')).toBe('image/png');
    expect(detectImageMime('https://res.cloudinary.com/x/a.webp?v=1', 'application/octet-stream')).toBe('image/webp');
    expect(detectImageMime('https://res.cloudinary.com/x/a.gif', 'text/html')).toBe('image/gif');
    expect(detectImageMime('https://res.cloudinary.com/x/a.jpeg', undefined)).toBe('image/jpeg');
  });

  it('defaults to jpeg for an unknown extension, a bad URL or a non-string header', () => {
    expect(detectImageMime('https://res.cloudinary.com/x/a.bin')).toBe('image/jpeg');
    expect(detectImageMime('not a url')).toBe('image/jpeg');
    expect(detectImageMime('https://res.cloudinary.com/x/a', 42)).toBe('image/jpeg');
  });

  it('never returns a non-image type (an SVG or HTML header cannot be forwarded to a vision provider)', () => {
    expect(detectImageMime('https://res.cloudinary.com/x/a.svg', 'image/svg+xml')).toBe('image/jpeg');
    expect(detectImageMime('https://res.cloudinary.com/x/a', 'text/html')).toBe('image/jpeg');
  });
});

describe('batchAnalyzeImages fail-closed', () => {
  const mkRes = () => {
    const res: any = { locals: {} };
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
  };
  const organizerReq = (extra: any = {}) => ({ user: { id: 'u1', roles: ['ORGANIZER'] }, body: { imageUrls: ['https://res.cloudinary.com/x/a.jpg'], saleId: 's1' }, ...extra } as any);

  it('403s a non-organizer', async () => {
    const res = mkRes();
    await batchAnalyzeImages({ user: { id: 'u', roles: ['USER'] }, body: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('403s an organizer request that did not come through the AI gate (no unmetered paid analysis)', async () => {
    const res = mkRes();
    await batchAnalyzeImages(organizerReq(), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].message).toMatch(/could not be verified/i);
  });

  it('with the gate present, still validates the body before doing any work, and refunds the reservation', async () => {
    const settle = jest.fn().mockResolvedValue(undefined);
    const res = mkRes();
    res.locals.aiGate = { organizerId: 'org1', tier: 'SIMPLE', saleId: 's1', reserved: 1, settle };
    await batchAnalyzeImages(organizerReq({ body: { imageUrls: [], saleId: 's1' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(settle).not.toHaveBeenCalledWith(1);
  });
});
