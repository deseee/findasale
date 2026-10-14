/**
 * GET /api/recruit/status: a failure inside the check (usually the database) answers 503
 * {open:false, error:true} and is logged + reported, instead of a 200 {open:false} that looks
 * like a deliberate "closed". The happy paths still answer 200.
 *
 * Real router over HTTP (Node's own http + fetch, no supertest). Config, kill switch, transport,
 * lead service and Sentry are mocked: no DB, no email, no network beyond 127.0.0.1.
 */
import http from 'http';
import { AddressInfo } from 'net';

const mockGetKillSwitchState = jest.fn();
const mockCheckTransportReady = jest.fn();
const mockCaptureException = jest.fn();

jest.mock('@sentry/node', () => ({ captureException: (...a: any[]) => mockCaptureException(...a) }));
jest.mock('../services/recruit/recruitConfig', () => ({ getRecruitConfig: () => ({}) }));
jest.mock('../services/recruit/recruitGuards', () => ({ getKillSwitchState: (...a: any[]) => mockGetKillSwitchState(...a) }));
jest.mock('../services/recruit/recruitTransport', () => ({ checkTransportReady: (...a: any[]) => mockCheckTransportReady(...a) }));
jest.mock('../services/recruit/recruitLeadService', () => ({
  confirmLead: jest.fn(),
  submitInterest: jest.fn(),
  unsubscribeLead: jest.fn(),
}));

describe('GET /api/recruit/status', () => {
  let server: http.Server;
  let base = '';
  let errSpy: jest.SpyInstance;

  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const express = require('express');
    const recruitRoutes = require('../routes/recruit').default;
    const app = express();
    app.use(express.json());
    app.use('/api/recruit', recruitRoutes);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    mockGetKillSwitchState.mockReset();
    mockCheckTransportReady.mockReset();
    mockCaptureException.mockReset();
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => errSpy.mockRestore());

  const get = async () => {
    const res = await fetch(base + '/api/recruit/status');
    return { status: res.status, json: await res.json() };
  };

  it('answers 503 {open:false, error:true} when the kill-switch lookup throws, and logs + reports it', async () => {
    const dbErr = new Error('connection refused');
    mockGetKillSwitchState.mockRejectedValue(dbErr);
    const r = await get();
    expect(r.status).toBe(503);
    expect(r.json).toEqual({ open: false, error: true });
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('[recruit] status check failed'), 'connection refused');
    expect(mockCaptureException).toHaveBeenCalledWith(dbErr, expect.objectContaining({ tags: { route: 'recruit-status' } }));
  });

  it('answers 503 when the transport check throws', async () => {
    mockGetKillSwitchState.mockResolvedValue({ open: true });
    mockCheckTransportReady.mockImplementation(() => { throw new Error('boom'); });
    const r = await get();
    expect(r.status).toBe(503);
    expect(r.json).toEqual({ open: false, error: true });
  });

  it('answers 200 {open:true} when the switch is open and transport is ready', async () => {
    mockGetKillSwitchState.mockResolvedValue({ open: true });
    mockCheckTransportReady.mockReturnValue({ ok: true });
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ open: true });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('answers 200 {open:false} (a deliberate close, not an error) when the switch is closed', async () => {
    mockGetKillSwitchState.mockResolvedValue({ open: false });
    mockCheckTransportReady.mockReturnValue({ ok: true });
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ open: false });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
