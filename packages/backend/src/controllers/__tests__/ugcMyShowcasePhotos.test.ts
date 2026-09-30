/**
 * GET /users/me/ugc-photos (getMyShowcasePhotos): the profile showcase picker's photo list.
 * Prisma is mocked. No real database calls.
 */
const mockFindMany = jest.fn();

jest.mock('../../lib/prisma', () => ({
  prisma: {
    uGCPhoto: { findMany: (...a: any[]) => mockFindMany(...a) },
  },
}));

import { getMyShowcasePhotos } from '../ugcPhotoController';

const mkRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mkReq = (query: any = {}, user: any = { id: 'u_1' }) => ({ query, user, params: {}, body: {} }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockFindMany.mockResolvedValue([]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('getMyShowcasePhotos', () => {
  it('401 when there is no signed-in user, and never queries', async () => {
    const res = mkRes();
    await getMyShowcasePhotos(mkReq({}, null), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('is scoped to the requesting user and only offers APPROVED photos', async () => {
    const res = mkRes();
    await getMyShowcasePhotos(mkReq({ userId: 'someone_else' }), res);
    const args = mockFindMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: 'u_1', status: 'APPROVED' });
  });

  it('returns a plain array with the fields the profile page reads', async () => {
    const rows = [{ id: 7, photoUrl: 'https://img.example/a.jpg', caption: 'Haul', linkedItemIds: [], isHaulPost: true, likesCount: 2, createdAt: new Date() }];
    mockFindMany.mockResolvedValue(rows);
    const res = mkRes();
    await getMyShowcasePhotos(mkReq(), res);
    expect(res.json).toHaveBeenCalledWith(rows);
    const select = mockFindMany.mock.calls[0][0].select;
    expect(select).toMatchObject({ id: true, photoUrl: true, caption: true });
    // never selects other people's data or moderation internals
    expect(select).not.toHaveProperty('reviewedBy');
    expect(select).not.toHaveProperty('scoutReveals');
  });

  it('defaults to 50 newest first, and clamps limit and offset', async () => {
    await getMyShowcasePhotos(mkReq(), mkRes());
    let args = mockFindMany.mock.calls[0][0];
    expect(args.take).toBe(50);
    expect(args.skip).toBe(0);
    expect(args.orderBy[0]).toEqual({ createdAt: 'desc' });

    mockFindMany.mockClear();
    await getMyShowcasePhotos(mkReq({ limit: '100000', offset: '-5' }), mkRes());
    args = mockFindMany.mock.calls[0][0];
    expect(args.take).toBe(100);
    expect(args.skip).toBe(0);

    mockFindMany.mockClear();
    await getMyShowcasePhotos(mkReq({ limit: '0', offset: '20' }), mkRes());
    args = mockFindMany.mock.calls[0][0];
    expect(args.take).toBe(1);
    expect(args.skip).toBe(20);

    mockFindMany.mockClear();
    await getMyShowcasePhotos(mkReq({ limit: 'abc', offset: 'xyz' }), mkRes());
    args = mockFindMany.mock.calls[0][0];
    expect(args.take).toBe(50);
    expect(args.skip).toBe(0);
  });

  it('500 with a neutral message when the query fails', async () => {
    mockFindMany.mockRejectedValue(new Error('db down'));
    const res = mkRes();
    await getMyShowcasePhotos(mkReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toMatch(/db down/);
  });
});
