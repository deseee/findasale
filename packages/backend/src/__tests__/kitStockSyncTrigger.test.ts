/**
 * kitStockSyncTrigger: re-push the stock number of kit-related listings after a sale that touched a kit or a component.
 */
const mockFindMany = jest.fn();
const mockSync = jest.fn().mockResolvedValue(undefined);
jest.mock('../lib/prisma', () => ({ prisma: { itemKitComponent: { findMany: (...a: any[]) => mockFindMany(...a) } } }));
jest.mock('../services/inventoryStockSync', () => ({ syncItemStock: (...a: any[]) => mockSync(...a) }));

import { scheduleKitRelatedStockSync, syncKitRelatedStock } from '../services/kitStockSyncTrigger';

beforeEach(() => {
  mockFindMany.mockReset();
  mockSync.mockReset().mockResolvedValue(undefined);
});

describe('syncKitRelatedStock', () => {
  it('kit: syncs the kit with the default cascade (components follow)', async () => {
    await syncKitRelatedStock('k1', 'kit', 'sold');
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenCalledWith('k1', 'sold');
    expect(mockFindMany).not.toHaveBeenCalled();
  });
  it('component: syncs every kit that contains it, without cascading back', async () => {
    mockFindMany.mockResolvedValue([{ kitItemId: 'k1' }, { kitItemId: 'k2' }]);
    await syncKitRelatedStock('c1', 'component', 'sold');
    expect(mockFindMany).toHaveBeenCalledWith({ where: { componentItemId: 'c1' }, select: { kitItemId: true } });
    expect(mockSync).toHaveBeenCalledTimes(2);
    expect(mockSync).toHaveBeenNthCalledWith(1, 'k1', 'sold (component c1)', { noCascade: true });
    expect(mockSync).toHaveBeenNthCalledWith(2, 'k2', 'sold (component c1)', { noCascade: true });
  });
  it('component in no kit: nothing to sync', async () => {
    mockFindMany.mockResolvedValue([]);
    await syncKitRelatedStock('c1', 'component', 'sold');
    expect(mockSync).not.toHaveBeenCalled();
  });
  it('never throws', async () => {
    mockFindMany.mockRejectedValue(new Error('db down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(syncKitRelatedStock('c1', 'component', 'sold')).resolves.toBeUndefined();
    warn.mockRestore();
  });
});

describe('scheduleKitRelatedStockSync', () => {
  it('is a no-op under jest (no stray timers) and never throws', () => {
    jest.useFakeTimers();
    expect(() => scheduleKitRelatedStockSync('k1', 'kit', 'sold', 1)).not.toThrow();
    jest.advanceTimersByTime(10);
    expect(mockSync).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
