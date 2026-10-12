/**
 * scanClient (ADR-138 batch B7): the one typed API client the Scan cards screens share (lib/cardScan.ts), wired to the browser.
 * The fetch, the csrf cookie and the base URL are read when a request is made, never at import time.
 */
import { useMemo } from 'react';
import api from '../../lib/api';
import { createScanClient, defaultScanClientDeps } from '../../lib/cardScan';
import type { ScanClient } from '../../lib/cardScan';

/** One cheap authenticated request. The shared axios client refreshes the login on a 401 and tells us whether it worked. */
async function refreshSession(): Promise<boolean> {
  try {
    await api.get('/card-scan/status');
    return true;
  } catch {
    return false;
  }
}

export function useScanClient(): ScanClient {
  return useMemo(() => createScanClient(defaultScanClientDeps(refreshSession)), []);
}
