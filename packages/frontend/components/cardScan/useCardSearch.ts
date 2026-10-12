/**
 * useCardSearch (ADR-138 batch B7): one search of the card list (GET /api/cards/search), shared by "Search and add" and the
 * "Filter by set" box in the printing picker. Up to 20 printings come back (the server caps it). A newer search always wins.
 */
import { useCallback, useRef, useState } from 'react';
import api from '../../lib/api';
import { buildSearchParams, readSearchResults } from '../../lib/cardRecord';
import type { PrintingResult, SearchInputs } from '../../lib/cardRecord';

export type SearchPhase = 'idle' | 'loading' | 'results' | 'empty' | 'error' | 'off';

export interface UseCardSearch {
  phase: SearchPhase;
  results: PrintingResult[];
  capped: boolean;
  run: (inputs: SearchInputs) => Promise<void>;
  reset: () => void;
}

export function useCardSearch(): UseCardSearch {
  const [phase, setPhase] = useState<SearchPhase>('idle');
  const [results, setResults] = useState<PrintingResult[]>([]);
  const [capped, setCapped] = useState(false);
  const requestRef = useRef(0);

  const run = useCallback(async (inputs: SearchInputs) => {
    requestRef.current += 1;
    const mine = requestRef.current;
    setPhase('loading');
    try {
      const res = await api.get('/cards/search', { params: buildSearchParams(inputs) });
      if (requestRef.current !== mine) return;
      const parsed = readSearchResults(res.data);
      if (parsed.catalogReady === false) {
        setResults([]);
        setCapped(false);
        setPhase('off');
        return;
      }
      setResults(parsed.results);
      setCapped(parsed.capped);
      setPhase(parsed.results.length > 0 ? 'results' : 'empty');
    } catch {
      if (requestRef.current !== mine) return;
      setResults([]);
      setPhase('error');
    }
  }, []);

  const reset = useCallback(() => {
    requestRef.current += 1;
    setResults([]);
    setCapped(false);
    setPhase('idle');
  }, []);

  return { phase, results, capped, run, reset };
}
