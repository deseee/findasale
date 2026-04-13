/**
 * eBay-style tiered bid increment table.
 * Returns the minimum increment based on the current bid amount.
 *
 * ADR-013 Phase 2: Proxy bidding and dynamic increment calculation
 */
export function calculateBidIncrement(currentBid: number): number {
  if (currentBid < 1) return 0.05;
  if (currentBid < 5) return 0.25;
  if (currentBid < 25) return 0.50;
  if (currentBid < 100) return 1.00;
  if (currentBid < 250) return 2.50;
  if (currentBid < 500) return 5.00;
  if (currentBid < 1000) return 10.00;
  if (currentBid < 2500) return 25.00;
  if (currentBid < 5000) return 50.00;
  return 100.00;
}
