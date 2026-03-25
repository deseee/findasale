export interface PosTierStatus {
  tier: 0 | 1 | 2 | 3;
  transactionCount: number;
  totalRevenue: number;
  nextGate?: {
    tier: 1 | 2 | 3;
    txNeeded: number;
    revenueNeeded: number;
  };
}
