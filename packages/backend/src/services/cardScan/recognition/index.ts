/**
 * Recognition barrel (ADR-138 section 4). The only entry point batch B5 imports from this directory.
 */
export * from './types';
export { getRecognitionProvider, getRecognitionStatus, disabledProvider } from './registry';
export type { RecognitionRegistryDeps, RecognitionStatus } from './registry';
export { closeReservation, createScanCostGuard, getScanCostGuard, SCAN_COST_SERVICE_TAG, DEFAULT_FRAME_COST_ESTIMATE_USD, DEFAULT_OCR_FRAME_COST_ESTIMATE_USD } from './scanCostGuard';
export type {
  ReserveDeniedReason,
  ReserveResult,
  ScanCostGuard,
  ScanCostGuardDeps,
  ScanCostStore,
  ScanCostUsage,
  ScanReservation,
} from './scanCostGuard';
