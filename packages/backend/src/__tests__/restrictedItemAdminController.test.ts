/**
 * Admin restricted-item endpoints (2026-11-06): adversarial authz + input checks. The services are mocked; what is
 * asserted is that nothing reaches them unless the caller is an admin with a valid, fixed-shape body.
 */
var mockSetSuspension = jest.fn();
var mockSetOverride = jest.fn();
var mockAuditFind = jest.fn();
jest.mock('../lib/prisma', () => ({ prisma: { restrictedItemAuditLog: { findMany: (...a: any[]) => mockAuditFind(...a) } } }));
jest.mock('../services/restrictedItem/cardSuspensionService', () => ({ setOrganizerCardSuspension: (...a: any[]) => mockSetSuspension(...a) }));
jest.mock('../services/restrictedItem/restrictedClassStore', () => ({ setRestrictedClassOverride: (...a: any[]) => mockSetOverride(...a) }));

import {
  setOrganizerCardSuspensionHandler,
  setItemRestrictedClassOverrideHandler,
  listRestrictedItemAuditHandler,
} from '../controllers/restrictedItemAdminController';

const res = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};
const ADMIN = { id: 'admin-1', role: 'ADMIN', roles: ['ADMIN'] };

beforeEach(() => {
  mockSetSuspension.mockReset();
  mockSetOverride.mockReset();
  mockAuditFind.mockReset();
});

describe.each([
  ['anonymous', undefined],
  ['shopper', { id: 'u1', role: 'USER', roles: ['USER'] }],
  ['organizer', { id: 'o1', role: 'ORGANIZER', roles: ['ORGANIZER'] }],
  ['organizer claiming admin in the body', { id: 'o1', role: 'ORGANIZER', roles: ['ORGANIZER'] }],
])('non-admin (%s) is refused 403 and nothing is written', (_label, user) => {
  it('card suspension', async () => {
    const r = res();
    await setOrganizerCardSuspensionHandler({ user, params: { organizerId: 'org1' }, body: { suspended: false, reason: 'self clear', role: 'ADMIN' } } as any, r);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(mockSetSuspension).not.toHaveBeenCalled();
  });
  it('class override', async () => {
    const r = res();
    await setItemRestrictedClassOverrideHandler({ user, params: { itemId: 'i1' }, body: { override: 'NONE', reason: 'lower my class' } } as any, r);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(mockSetOverride).not.toHaveBeenCalled();
  });
  it('audit list', async () => {
    const r = res();
    await listRestrictedItemAuditHandler({ user, query: {} } as any, r);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(mockAuditFind).not.toHaveBeenCalled();
  });
});

describe('admin input validation', () => {
  it('suspension: requires a boolean and a reason; the acting admin comes from the session, not the body', async () => {
    let r = res();
    await setOrganizerCardSuspensionHandler({ user: ADMIN, params: { organizerId: 'org1' }, body: { suspended: 'yes', reason: 'abc' } } as any, r);
    expect(r.status).toHaveBeenCalledWith(400);
    r = res();
    await setOrganizerCardSuspensionHandler({ user: ADMIN, params: { organizerId: 'org1' }, body: { suspended: true } } as any, r);
    expect(r.status).toHaveBeenCalledWith(400);
    mockSetSuspension.mockResolvedValue({ organizerId: 'org1', cardPaymentsSuspendedAt: new Date(), cardPaymentsSuspendedReason: 'Review', cardPaymentsSuspendedById: 'admin-1' });
    r = res();
    await setOrganizerCardSuspensionHandler({ user: ADMIN, params: { organizerId: 'org1' }, body: { suspended: true, reason: 'Review', adminUserId: 'someone-else' } } as any, r);
    expect(mockSetSuspension.mock.calls[0][1]).toEqual({ organizerId: 'org1', suspend: true, reason: 'Review', adminUserId: 'admin-1' });
    expect(r.json.mock.calls[0][0].cardPaymentsSuspended).toBe(true);
  });

  it('suspension: unknown organizer is 404, odd ids are 400', async () => {
    mockSetSuspension.mockResolvedValue(null);
    let r = res();
    await setOrganizerCardSuspensionHandler({ user: ADMIN, params: { organizerId: 'nope' }, body: { suspended: true, reason: 'Review' } } as any, r);
    expect(r.status).toHaveBeenCalledWith(404);
    r = res();
    await setOrganizerCardSuspensionHandler({ user: ADMIN, params: { organizerId: "x' OR 1=1 --" }, body: { suspended: true, reason: 'Review' } } as any, r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('override: only a known class or null', async () => {
    let r = res();
    await setItemRestrictedClassOverrideHandler({ user: ADMIN, params: { itemId: 'i1' }, body: { override: 'TOTALLY_FINE', reason: 'abc' } } as any, r);
    expect(r.status).toHaveBeenCalledWith(400);
    r = res();
    await setItemRestrictedClassOverrideHandler({ user: ADMIN, params: { itemId: 'i1' }, body: { reason: 'abc' } } as any, r);
    expect(r.status).toHaveBeenCalledWith(400);
    mockSetOverride.mockResolvedValue({ found: true, previousEffective: 'KNIFE', newEffective: 'NONE' });
    r = res();
    await setItemRestrictedClassOverrideHandler({ user: ADMIN, params: { itemId: 'i1' }, body: { override: 'NONE', reason: 'Reviewed: kitchen set' } } as any, r);
    expect(mockSetOverride.mock.calls[0][1]).toEqual({ itemId: 'i1', override: 'NONE', reason: 'Reviewed: kitchen set', adminUserId: 'admin-1' });
    r = res();
    await setItemRestrictedClassOverrideHandler({ user: ADMIN, params: { itemId: 'i1' }, body: { override: null, reason: 'Back to automatic' } } as any, r);
    expect(mockSetOverride.mock.calls[1][1].override).toBeNull();
  });
});
