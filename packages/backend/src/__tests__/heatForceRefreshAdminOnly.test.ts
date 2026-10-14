/**
 * ?forceRefresh=true on the public city heat index and sale heatmap (2026-10-13 security): it bypassed
 * the cache for anyone (cheap DoS). Now honored for admins only; heatmap `days` is clamped to 1..30.
 */
const mockCityHeat = jest.fn();
const mockHeatmap = jest.fn();
const mockLenient = jest.fn();
jest.mock('../services/cityHeatService', () => ({ getOrComputeCityHeatIndex: (...a: any[]) => mockCityHeat(...a) }));
jest.mock('../services/heatmapService', () => ({ getOrComputeHeatmapTiles: (...a: any[]) => mockHeatmap(...a) }));
jest.mock('../middleware/auth', () => ({
  lenientOptionalAuthenticate: (req: any, res: any, next: any) => mockLenient(req, res, next),
}));
jest.mock('../lib/prisma', () => ({ prisma: {} }));

import { getCityHeat } from '../controllers/cityHeatController';
import { getHeatmapHandler } from '../controllers/heatmapController';

function mockRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCityHeat.mockResolvedValue({ cities: [] });
  mockHeatmap.mockResolvedValue({ tiles: [] });
  // default: the token resolves to nobody (anonymous)
  mockLenient.mockImplementation((_req: any, _res: any, next: any) => next());
});

describe('city heat forceRefresh', () => {
  it('ignored for anonymous callers', async () => {
    await getCityHeat({ query: { forceRefresh: 'true' } } as any, mockRes());
    expect(mockCityHeat).toHaveBeenCalledWith(false);
  });

  it('ignored for a signed-in non-admin', async () => {
    await getCityHeat({ query: { forceRefresh: 'true' }, user: { id: 'u', roles: ['USER', 'ORGANIZER'] } } as any, mockRes());
    expect(mockCityHeat).toHaveBeenCalledWith(false);
  });

  it('honored for an admin resolved from the token', async () => {
    mockLenient.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { id: 'a', roles: ['USER', 'ADMIN'] };
      next();
    });
    await getCityHeat({ query: { forceRefresh: 'true' } } as any, mockRes());
    expect(mockCityHeat).toHaveBeenCalledWith(true);
  });

  it('does not resolve auth at all when forceRefresh is not requested', async () => {
    await getCityHeat({ query: {} } as any, mockRes());
    expect(mockLenient).not.toHaveBeenCalled();
    expect(mockCityHeat).toHaveBeenCalledWith(false);
  });
});

describe('heatmap forceRefresh and days', () => {
  it('ignores forceRefresh for anonymous callers', async () => {
    await getHeatmapHandler({ query: { forceRefresh: 'true', days: '7' } } as any, mockRes());
    expect(mockHeatmap).toHaveBeenCalledWith(7, false);
  });

  it('honors forceRefresh for an admin', async () => {
    await getHeatmapHandler({ query: { forceRefresh: 'true' }, user: { id: 'a', role: 'ADMIN' } } as any, mockRes());
    expect(mockHeatmap).toHaveBeenCalledWith(7, true);
  });

  it('clamps days to 1..30 and falls back to 7 for junk', async () => {
    await getHeatmapHandler({ query: { days: '99999' } } as any, mockRes());
    await getHeatmapHandler({ query: { days: '-5' } } as any, mockRes());
    await getHeatmapHandler({ query: { days: 'abc' } } as any, mockRes());
    expect(mockHeatmap.mock.calls.map((c) => c[0])).toEqual([30, 1, 7]);
  });
});
