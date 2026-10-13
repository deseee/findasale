/**
 * The provider registry (ADR-140 section 5.1). The services obtain providers only through activeProviders(), which is
 * getActiveProviders() from types.ts: terms are enforced in code, a NOT_CLEARED provider is never returned, and a kind that is
 * not in the book's referenceOrder is not used.
 */
import type { PriceBookTx } from '../db';
import type { BookSettings, EnvLike } from '../types';
import { benchmarkProvider } from './benchmark';
import { catalogReferenceProvider } from './catalogReference';
import { licensedFeedProvider } from './licensedFeed';
import { manualProvider } from './manual';
import { soldHistoryProvider } from './soldHistory';
import { getActiveProviders } from './types';
import type { ReferenceProvider } from './types';

export type PriceBookProvider = ReferenceProvider<PriceBookTx>;

/** Every provider that exists, in no particular order (the book's referenceOrder decides the order of use). */
export const ALL_PROVIDERS: readonly PriceBookProvider[] = Object.freeze([
  manualProvider,
  soldHistoryProvider,
  benchmarkProvider,
  catalogReferenceProvider,
  licensedFeedProvider,
]);

/** The providers this book may use right now, in the book's order. The only way a service gets providers. */
export function activeProviders(env: EnvLike, book: BookSettings, providers: readonly PriceBookProvider[] = ALL_PROVIDERS): PriceBookProvider[] {
  return getActiveProviders(env, book, providers);
}
