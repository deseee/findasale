/**
 * LICENSED_FEED provider (ADR-140 sections 5.1 and 5.2): reserved for a PriceCharting-style feed after a written agreement
 * exists. It is NOT_CLEARED, so getActiveProviders never returns it, whatever the environment says, and its fetch returns
 * nothing even if something calls it directly. Making it usable takes a code change that records the agreement id in
 * terms.reference, the attorney sign-off date in reviewedOn, the attribution text, a working purge() and a new ADR.
 */
import type { PriceBookTx, ProviderCard } from '../db';
import type { ReferenceCandidate } from '../types';
import type { ProviderCtx, ReferenceProvider } from './types';

export const licensedFeedProvider: ReferenceProvider<PriceBookTx> = {
  kind: 'LICENSED_FEED',
  terms: { status: 'NOT_CLEARED', reviewedOn: null, reference: 'ADR-140 section 5.1: no written agreement exists' },
  isActive: () => false,
  async fetch(_ctx: ProviderCtx<PriceBookTx>, _cards: ProviderCard[]): Promise<Map<string, ReferenceCandidate[]>> {
    return new Map<string, ReferenceCandidate[]>();
  },
  async purge(_ctx: ProviderCtx<PriceBookTx>): Promise<void> {
    // Nothing is stored, so there is nothing to purge.
  },
};
