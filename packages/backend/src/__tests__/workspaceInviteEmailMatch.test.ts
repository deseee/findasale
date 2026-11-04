/**
 * Security fix (2026-11-04, finding #173): acceptMagicLinkInvite never compared the signed-in user's email
 * with the invite's email, so anyone holding a forwarded or leaked join link joined with the invited role
 * (which can be ADMIN).
 *
 * WHAT THIS PROVES
 *   - a different account is refused (403) and no membership is created, the invite is kept
 *   - the invited account joins (legit path), with the email compared case-insensitively
 */
export {};

const mockTx: any = { workspaceMember: { create: jest.fn() }, workspaceInvite: { delete: jest.fn() } };
const mockPrisma: any = {
  workspaceInvite: { findUnique: jest.fn(), deleteMany: jest.fn() },
  user: { findUnique: jest.fn() },
  organizer: { findUnique: jest.fn() },
  $transaction: jest.fn(async (cb: any) => cb(mockTx)),
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: { emails: { send: jest.fn() } } }));
jest.mock('../services/squareBillingService', () => ({
  chargeStoredCard: jest.fn(),
  computeSeatQuote: jest.fn(),
  friendlyChargeFailureMessage: jest.fn(),
}));
jest.mock('../services/organizerBillingLedger', () => ({
  claimBillingCharge: jest.fn(),
  completeBillingCharge: jest.fn(),
  failBillingCharge: jest.fn(),
}));

import { acceptMagicLinkInvite } from '../controllers/workspaceController';

const makeRes = () => {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: unknown) => { res.body = b; return res; });
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.workspaceInvite.findUnique.mockResolvedValue({
    id: 'inv-1',
    inviteEmail: 'helper@example.com',
    role: 'ADMIN',
    expiresAt: new Date(Date.now() + 86400000),
    workspace: { id: 'ws-1', slug: 'smith-sales', name: 'Smith Sales' },
  });
  mockPrisma.organizer.findUnique.mockResolvedValue(null);
});

const accept = async (userEmail: string) => {
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', email: userEmail });
  const res = makeRes();
  await acceptMagicLinkInvite({ params: { token: 'tok' }, user: { id: 'u-1' } } as any, res);
  return res;
};

describe('acceptMagicLinkInvite', () => {
  it('refuses a signed-in account whose email is not the invited email', async () => {
    const res = await accept('someone-else@example.com');
    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/different email address/);
    expect(mockTx.workspaceMember.create).not.toHaveBeenCalled();
    expect(mockTx.workspaceInvite.delete).not.toHaveBeenCalled();
  });

  it('lets the invited account join, comparing emails case-insensitively (legit path)', async () => {
    const res = await accept('Helper@Example.com');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, workspaceSlug: 'smith-sales', workspaceName: 'Smith Sales' });
    expect(mockTx.workspaceMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ workspaceId: 'ws-1', userId: 'u-1', role: 'ADMIN' }),
    });
  });
});
