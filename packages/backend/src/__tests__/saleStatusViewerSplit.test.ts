/**
 * GET /api/sales/:id/status (2026-10-13 security): revenue / sold / holds were public for ANY sale.
 * Now the organizer, its workspace staff and admins get the full status; everyone else the public
 * subset (items remaining) and only for a PUBLISHED / ENDED, not deleted sale.
 */
const mockSaleFindUnique = jest.fn();
const mockOrganizerFindUnique = jest.fn();
const mockMemberFindFirst = jest.fn();
const mockGetSaleStatus = jest.fn();
jest.mock('../lib/prisma', () => ({
  prisma: {
    sale: { findUnique: (...a: any[]) => mockSaleFindUnique(...a) },
    organizer: { findUnique: (...a: any[]) => mockOrganizerFindUnique(...a) },
    workspaceMember: { findFirst: (...a: any[]) => mockMemberFindFirst(...a) },
  },
}));
jest.mock('../middleware/auth', () => ({}));
jest.mock('../services/saleStatusService', () => {
  const actual = jest.requireActual('../services/saleStatusService');
  return { ...actual, getSaleStatus: (...a: any[]) => mockGetSaleStatus(...a) };
});

import { getSaleStatusForViewer } from '../controllers/saleStatusController';

const full = {
  saleId: 's1',
  itemsSoldToday: 4,
  activeHolds: 2,
  itemsRemaining: 9,
  revenueToday: 120,
  timestamp: new Date('2026-10-13T12:00:00Z'),
};

function mockRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSaleFindUnique.mockResolvedValue({ organizerId: 'org1', status: 'PUBLISHED', deletedAt: null });
  mockOrganizerFindUnique.mockResolvedValue(null);
  mockMemberFindFirst.mockResolvedValue(null);
  mockGetSaleStatus.mockResolvedValue(full);
});

async function call(user?: any) {
  const res = mockRes();
  await getSaleStatusForViewer({ params: { id: 's1' }, user } as any, res);
  return res;
}

describe('sale status payload split', () => {
  it('anonymous viewers get only the public subset (no revenue, sold or holds)', async () => {
    const res = await call();
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual({ saleId: 's1', itemsRemaining: 9, timestamp: full.timestamp });
    expect(body.revenueToday).toBeUndefined();
  });

  it('another signed-in organizer gets the public subset', async () => {
    mockOrganizerFindUnique.mockResolvedValue({ id: 'org-other' });
    const res = await call({ id: 'u2', roles: ['ORGANIZER'] });
    expect(res.json.mock.calls[0][0].revenueToday).toBeUndefined();
  });

  it('the owner gets the full status', async () => {
    const res = await call({ id: 'u1', roles: ['ORGANIZER'], organizerProfile: { id: 'org1' } });
    expect(res.json).toHaveBeenCalledWith(full);
  });

  it('accepted workspace staff and admins get the full status', async () => {
    mockMemberFindFirst.mockResolvedValue({ id: 'm1' });
    expect((await call({ id: 'staff', roles: ['USER'] })).json).toHaveBeenCalledWith(full);
    mockMemberFindFirst.mockResolvedValue(null);
    expect((await call({ id: 'adm', roles: ['ADMIN'] })).json).toHaveBeenCalledWith(full);
  });

  it('a DRAFT or deleted sale is a 404 for the public but still visible to the owner', async () => {
    mockSaleFindUnique.mockResolvedValue({ organizerId: 'org1', status: 'DRAFT', deletedAt: null });
    expect((await call()).status).toHaveBeenCalledWith(404);
    mockSaleFindUnique.mockResolvedValue({ organizerId: 'org1', status: 'PUBLISHED', deletedAt: new Date() });
    expect((await call()).status).toHaveBeenCalledWith(404);
    mockSaleFindUnique.mockResolvedValue({ organizerId: 'org1', status: 'DRAFT', deletedAt: null });
    expect((await call({ id: 'u1', organizerProfile: { id: 'org1' } })).json).toHaveBeenCalledWith(full);
  });

  it('unknown sale is a 404', async () => {
    mockSaleFindUnique.mockResolvedValue(null);
    expect((await call()).status).toHaveBeenCalledWith(404);
    expect(mockGetSaleStatus).not.toHaveBeenCalled();
  });
});

describe('route wiring', () => {
  it('GET /:id/status uses optionalAuthenticate + the viewer-aware handler', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../routes/sales.ts'), 'utf8');
    expect(src).toMatch(/router\.get\('\/:id\/status', optionalAuthenticate, getSaleStatusForViewer\)/);
  });
});
