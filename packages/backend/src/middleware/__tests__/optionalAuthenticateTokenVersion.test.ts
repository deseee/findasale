/**
 * optionalAuthenticate must honor tokenVersion exactly like authenticate: a token invalidated by a password change,
 * reset or logout-all is treated as anonymous instead of identifying the user.
 */
var mockFindUnique: jest.Mock;
jest.mock('../../lib/prisma', () => {
  mockFindUnique = jest.fn();
  return { prisma: { user: { findUnique: (...a: unknown[]) => mockFindUnique(...a) } } };
});

import jwt from 'jsonwebtoken';
import { optionalAuthenticate } from '../auth';

const SECRET = 'unit-test-secret';
const sign = (claims: Record<string, unknown>) => jwt.sign({ id: 'u1', ...claims }, SECRET, { algorithm: 'HS256', expiresIn: '5m' });

async function run(token: string | null) {
  const req: any = { cookies: token ? { accessToken: token } : {}, headers: {}, query: {} };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  await optionalAuthenticate(req, res, next);
  return { req, res, next };
}

beforeEach(() => {
  process.env.JWT_SECRET = SECRET;
  mockFindUnique.mockReset();
});

describe('optionalAuthenticate tokenVersion', () => {
  it('attaches the user when the token version matches', async () => {
    mockFindUnique.mockResolvedValue({ id: 'u1', tokenVersion: 2, roles: ['USER'] });
    const { req, next } = await run(sign({ tokenVersion: 2 }));
    expect(req.user?.id).toBe('u1');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('treats a stale token (password changed / logout-all) as anonymous, without an error response', async () => {
    mockFindUnique.mockResolvedValue({ id: 'u1', tokenVersion: 3, roles: ['USER'] });
    const { req, res, next } = await run(sign({ tokenVersion: 2 }));
    expect(req.user).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('legacy token without a tokenVersion claim is accepted only while the user is still at version 0', async () => {
    mockFindUnique.mockResolvedValue({ id: 'u1', tokenVersion: 0, roles: [] });
    expect((await run(sign({}))).req.user?.id).toBe('u1');
    mockFindUnique.mockResolvedValue({ id: 'u1', tokenVersion: 1, roles: [] });
    expect((await run(sign({}))).req.user).toBeUndefined();
  });

  it('no token proceeds anonymously', async () => {
    const { req, next } = await run(null);
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});
