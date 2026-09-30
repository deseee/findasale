/**
 * trackQrScan (2026-09-29): the public scan counter only increments for sales that are not
 * deleted and not DRAFT. Always answers 204. Prisma is a mock.
 */
const mockUpdateMany = jest.fn();
jest.mock('../lib/prisma', () => ({ prisma: { sale: { updateMany: (...a: any[]) => mockUpdateMany(...a) } } }));

// The controller's import graph pulls in the Sentry SDK; the counter under test never uses it.
jest.mock('@sentry/node', () => new Proxy({ __esModule: true }, { get: (t: any, k: string) => (k in t ? t[k] : jest.fn()) }));

import { trackQrScan } from '../controllers/saleController';

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

describe('trackQrScan', () => {
  beforeEach(() => { mockUpdateMany.mockReset(); mockUpdateMany.mockResolvedValue({ count: 1 }); });

  it('excludes DRAFT and deleted sales in the where clause and increments the count', async () => {
    const res = makeRes();
    await trackQrScan({ params: { id: 'sale_1' } } as any, res);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'sale_1', deletedAt: null, status: { not: 'DRAFT' } },
      data: { qrScanCount: { increment: 1 } },
    });
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('still answers 204 when the update throws', async () => {
    mockUpdateMany.mockRejectedValue(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await trackQrScan({ params: { id: 'sale_1' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(204);
    spy.mockRestore();
  });
});
