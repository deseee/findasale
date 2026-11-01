/**
 * lib/eventLoopMonitor.ts (2026-11-01, Sentry FINDASALE-NODEJS-91 / -93): the next event-loop stall must name
 * itself in the logs, and a 503 from the global request timeout must say whether the loop was blocked.
 */
import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';
import {
  trackActivity,
  runningActivities,
  recordProbeGap,
  getEventLoopSnapshot,
  formatEventLoopSnapshot,
  startEventLoopMonitor,
  resetEventLoopMonitorForTests,
  requestStarted,
  requestEnded,
} from '../eventLoopMonitor';
import { requestTimeout } from '../../middleware/requestTimeout';

describe('eventLoopMonitor', () => {
  let errSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;
  beforeEach(() => {
    resetEventLoopMonitorForTests();
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    delete process.env.EVENT_LOOP_STALL_WARN_MS;
  });
  afterEach(() => {
    errSpy.mockRestore();
    logSpy.mockRestore();
    resetEventLoopMonitorForTests();
  });

  it('tracks running activities and removes them when done (idempotent)', () => {
    const endA = trackActivity('emailDiscoveryBatchJob');
    const endB = trackActivity('markdownCron');
    expect(runningActivities().map((s) => s.split(' ')[0]).sort()).toEqual(['emailDiscoveryBatchJob', 'markdownCron']);
    endA();
    endA();
    expect(runningActivities().map((s) => s.split(' ')[0])).toEqual(['markdownCron']);
    endB();
    expect(runningActivities()).toEqual([]);
  });

  it('ignores small gaps and logs a stall with the running activities and in-flight requests', () => {
    const end = trackActivity('internalJob:email-discovery');
    requestStarted();
    requestStarted();
    expect(recordProbeGap(150)).toBe(false);
    expect(errSpy).not.toHaveBeenCalled();
    expect(recordProbeGap(50_000)).toBe(true);
    expect(errSpy).toHaveBeenCalledTimes(1);
    const line = String(errSpy.mock.calls[0][0]);
    expect(line).toContain('[eventLoop] blocked for ~50000ms');
    expect(line).toContain('requests in flight: 2');
    expect(line).toContain('internalJob:email-discovery');
    requestEnded();
    requestEnded();
    requestEnded(); // never goes negative
    end();
    const snap = getEventLoopSnapshot();
    expect(snap.maxGapLastMinuteMs).toBe(50000);
    expect(snap.lastStallMs).toBe(50000);
    expect(snap.inFlightRequests).toBe(0);
  });

  it('honours EVENT_LOOP_STALL_WARN_MS and forgets gaps older than a minute', () => {
    process.env.EVENT_LOOP_STALL_WARN_MS = '10000';
    const t = Date.now();
    expect(recordProbeGap(5000, t - 120_000)).toBe(false);
    expect(recordProbeGap(12000, t - 90_000)).toBe(true);
    expect(recordProbeGap(10, t)).toBe(false);
    expect(getEventLoopSnapshot(t).maxGapLastMinuteMs).toBe(10);
    expect(formatEventLoopSnapshot(getEventLoopSnapshot(t))).toContain('lastStall=12000@');
  });

  it('a real blocked loop is detected by the started probe', async () => {
    startEventLoopMonitor();
    startEventLoopMonitor(); // idempotent
    await new Promise((r) => setTimeout(r, 600));
    const until = Date.now() + 2600;
    while (Date.now() < until) { /* block the loop */ }
    await new Promise((r) => setTimeout(r, 700));
    const stallLines = errSpy.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('[eventLoop] blocked'));
    expect(stallLines.length).toBe(1);
    expect(getEventLoopSnapshot().lastStallMs).toBeGreaterThanOrEqual(2000);
  });

  it('the request timeout 503 logs the event-loop snapshot and counts the request in flight', async () => {
    const app = express();
    app.use(requestTimeout(80));
    let seenInFlight = -1;
    app.get('/slow', async (_req, res) => {
      seenInFlight = getEventLoopSnapshot().inFlightRequests;
      await new Promise((r) => setTimeout(r, 200));
      res.json({ ok: true });
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const { port } = server.address() as AddressInfo;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/slow`);
      expect(res.status).toBe(503);
      await new Promise((r) => setTimeout(r, 250));
      expect(seenInFlight).toBe(1);
      const line = errSpy.mock.calls.map((c) => String(c[0])).find((l) => l.startsWith('[requestTimeout] 503'));
      expect(line).toContain('GET /slow');
      expect(line).toContain('eventLoop maxGap(1m)=');
      expect(getEventLoopSnapshot().inFlightRequests).toBe(0);
    } finally {
      warnSpy.mockRestore();
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
