/**
 * Data hooks for the card intake screens (ADR-134 #642, batch B8): the file type list and the option lists.
 *  - GET /api/card-intake/formats      importer names and hints, field names for the column chooser, limits
 *  - GET /api/cards/vocabulary         games, conditions and finishes (shared query key with the card record panel)
 * If the vocabulary cannot be loaded the lists fall back to the same codes and labels the backend uses, so a failed
 * request never blocks an import.
 */
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { normalizeVocabulary } from '../../lib/cardRecord';
import {
  CONDITION_FALLBACK,
  FINISH_FALLBACK,
  FormatsInfo,
  GAME_FALLBACK,
  VocabOption,
  readFormats,
} from '../../lib/cardIntake';

export function useIntakeFormats() {
  return useQuery({
    queryKey: ['card-intake-formats'],
    queryFn: async (): Promise<FormatsInfo> => {
      const res = await api.get('/card-intake/formats');
      const formats = readFormats(res.data);
      if (!formats) throw new Error('Empty list of file types');
      return formats;
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
    retryDelay: 500,
    refetchOnWindowFocus: false,
  });
}

export interface IntakeVocab {
  games: readonly VocabOption[];
  conditions: readonly VocabOption[];
  finishes: readonly VocabOption[];
}

export function useIntakeVocab(): IntakeVocab {
  const q = useQuery({
    queryKey: ['card-vocabulary'],
    queryFn: async () => {
      const res = await api.get('/cards/vocabulary');
      const vocab = normalizeVocabulary(res.data);
      if (!vocab) throw new Error('Card options were empty');
      return vocab;
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
    retryDelay: 500,
    refetchOnWindowFocus: false,
  });
  if (!q.data) return { games: GAME_FALLBACK, conditions: CONDITION_FALLBACK, finishes: FINISH_FALLBACK };
  return {
    games: q.data.games.map((g) => ({ code: g.code, label: g.label })),
    conditions: q.data.conditionCodes,
    finishes: q.data.finishes,
  };
}
