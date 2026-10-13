/**
 * Shared React Query hooks for the Price Book screens (ADR-140 batch B7).
 *
 * Every price book query key starts with "price-book", so one invalidation after a save refreshes every tab. The status
 * query is shared by the page, PriceBookLink and PinLockButton (same key, one request). The card vocabulary query uses the
 * same key as the item editor's card panel, so the lists are fetched once per visit.
 */
import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { normalizeVocabulary } from '../../lib/cardRecord';
import type { CardVocabulary } from '../../lib/cardRecord';
import { priceBookApi, readPriceBookError } from '../../lib/priceBook';
import type { PriceBookStatus, PriceBookView } from '../../lib/priceBook';
import { useToast } from '../ToastContext';

export const PB_ROOT = 'price-book';

export const pbKeys = {
  all: [PB_ROOT] as const,
  status: [PB_ROOT, 'status'] as const,
  book: [PB_ROOT, 'book'] as const,
  rules: (family: string) => [PB_ROOT, 'rules', family] as const,
  references: (game: string, q: string) => [PB_ROOT, 'references', game, q] as const,
  benchmarks: [PB_ROOT, 'benchmarks'] as const,
  bulkRates: (game: string) => [PB_ROOT, 'bulk-rates', game] as const,
  runs: [PB_ROOT, 'runs'] as const,
  sales: [PB_ROOT, 'sales'] as const,
};

export function usePriceBookStatus(enabled = true) {
  return useQuery<PriceBookStatus>({
    queryKey: pbKeys.status,
    queryFn: () => priceBookApi.getStatus(),
    enabled,
    staleTime: 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function usePriceBookBook(enabled: boolean) {
  return useQuery<PriceBookView | null>({
    queryKey: pbKeys.book,
    queryFn: () => priceBookApi.getBook(),
    enabled,
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

/** The card options (games, finishes, conditions, languages). Same key and request as the item editor's card panel. */
export function useCardVocabulary() {
  return useQuery<CardVocabulary | null>({
    queryKey: ['card-vocabulary'],
    queryFn: async () => normalizeVocabulary((await api.get('/cards/vocabulary')).data),
    staleTime: 10 * 60 * 1000,
    retry: 1,
    retryDelay: 500,
    refetchOnWindowFocus: false,
  });
}

export interface SaleChoice {
  id: string;
  title: string;
}

/** The organizer's sales for the scope pickers (GET /api/sales/mine, the same call the other organizer pages make). */
export function useOrganizerSaleChoices(enabled: boolean) {
  return useQuery<SaleChoice[]>({
    queryKey: pbKeys.sales,
    queryFn: async () => {
      const res = await api.get('/sales/mine');
      const list: unknown[] = Array.isArray(res.data?.sales) ? res.data.sales : [];
      const out: SaleChoice[] = [];
      list.forEach((s) => {
        const r = s as { id?: unknown; title?: unknown };
        if (typeof r.id === 'string') out.push({ id: r.id, title: typeof r.title === 'string' && r.title ? r.title : r.id });
      });
      return out;
    },
    enabled,
    staleTime: 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

/** Refresh everything the price book shows (status, book, rules, rates, references, runs). */
export function useRefreshPriceBook() {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.invalidateQueries({ queryKey: pbKeys.all }), [queryClient]);
}

/** Turn any thrown value into plain wording, show it as an error toast, and return the wording. */
export function useReportError() {
  const { showToast } = useToast();
  return useCallback(
    (err: unknown): string => {
      const message = readPriceBookError(err).message;
      showToast(message, 'error');
      return message;
    },
    [showToast]
  );
}

/** The current time, refreshed on an interval, for age checks and the preview expiry. Never read during a render by itself. */
export function useNow(intervalMs = 30 * 1000): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
