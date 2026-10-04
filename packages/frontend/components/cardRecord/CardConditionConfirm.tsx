/**
 * CardConditionConfirm: the one-tap confirmation for a trading card's condition.
 *
 * The photo tagging pass can suggest a card condition (NM, LP, MP, HP, DMG) or read a graded slab's label, but it
 * never saves one: the card stays without a condition until the seller confirms here, and a card with no confirmed
 * condition is not sent to eBay. This component reads GET /api/item-cards/:itemId (the card plus the optional
 * `suggestion`) and shows:
 *   - no card on the item: nothing
 *   - card with a saved condition or grader and grade: a short read-only line (hidden when hideWhenConfirmed)
 *   - card without one: the condition picker, pre-selected with the suggestion and labelled
 *     "Suggested, please confirm"; "Confirm condition" saves it with PUT /api/item-cards/:itemId
 * Condition options come from GET /api/cards/vocabulary (nothing is hardcoded here).
 */
import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useToast } from '../ToastContext';
import {
  CardVocabulary,
  StoredCard,
  isGradedCard,
  labelFor,
  normalizeVocabulary,
  readApiError,
} from '../../lib/cardRecord';

interface CardSuggestion {
  conditionCode?: string;
  grader?: string;
  grade?: string;
  certNumber?: string;
}

interface CardConditionConfirmProps {
  itemId: string;
  /** Called with the saved card after the seller confirms. */
  onSaved?: (card: StoredCard | null) => void;
  /** When true, a card that already has a confirmed condition renders nothing (used inside the card details panel). */
  hideWhenConfirmed?: boolean;
  disabled?: boolean;
}

const COPY = {
  heading: 'Card condition',
  suggested: 'Suggested, please confirm',
  choose: 'Choose the condition of this card',
  confirm: 'Confirm condition',
  confirmGraded: 'Confirm grade',
  saving: 'Saving...',
  saved: 'Card condition saved',
  gradedLead: 'Graded card read from the label',
  unconfirmedHint: 'Until you confirm, this card cannot be sent to eBay.',
  confirmedPrefix: 'Card condition:',
  confirmedGradedPrefix: 'Graded card:',
  errorGeneric: 'Could not save the card condition. Please try again.',
} as const;

const CardConditionConfirm: React.FC<CardConditionConfirmProps> = ({ itemId, onSaved, hideWhenConfirmed, disabled }) => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ['card-condition-confirm', itemId];

  const dataQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<{ card: StoredCard | null; suggestion: CardSuggestion | null }> => {
      const res = await api.get(`/item-cards/${itemId}`);
      return { card: (res.data?.data ?? null) as StoredCard | null, suggestion: (res.data?.suggestion ?? null) as CardSuggestion | null };
    },
    enabled: !!itemId,
    staleTime: 0,
    retry: 1,
    retryDelay: 500,
    refetchOnWindowFocus: false,
  });

  const vocabQuery = useQuery({
    queryKey: ['card-vocabulary'],
    queryFn: async (): Promise<CardVocabulary> => {
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

  const card = dataQuery.data?.card ?? null;
  const suggestion = dataQuery.data?.suggestion ?? null;
  const [selected, setSelected] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-select the suggestion once it has loaded; after that the choice is the seller's.
  useEffect(() => {
    if (suggestion?.conditionCode) setSelected((prev) => prev || (suggestion.conditionCode as string));
  }, [suggestion?.conditionCode]);

  if (!card) return null;
  const vocab = vocabQuery.data;
  const confirmed = !!card.conditionCode || isGradedCard(card);

  if (confirmed) {
    if (hideWhenConfirmed) return null;
    const text = card.conditionCode
      ? `${COPY.confirmedPrefix} ${vocab ? labelFor(vocab.conditionCodes, card.conditionCode) : card.conditionCode}`
      : `${COPY.confirmedGradedPrefix} ${[card.grader, card.grade].filter(Boolean).join(' ')}`;
    return <p className="text-xs text-warm-600 dark:text-warm-300">{text}</p>;
  }

  const suggestedGraded = !!(suggestion?.grader && suggestion?.grade);
  const busy = !!disabled || saving;

  const save = async (patch: Record<string, string>) => {
    setError(null);
    setSaving(true);
    try {
      const res = await api.put(`/item-cards/${itemId}`, patch);
      const saved = (res.data?.data ?? null) as StoredCard | null;
      queryClient.setQueryData(['item-card', itemId], saved);
      await queryClient.invalidateQueries({ queryKey });
      showToast(COPY.saved, 'success');
      if (onSaved) onSaved(saved);
    } catch (err) {
      setError(readApiError(err).message || COPY.errorGeneric);
    } finally {
      setSaving(false);
    }
  };

  const confirmGraded = () => {
    const patch: Record<string, string> = { grader: suggestion!.grader as string, grade: suggestion!.grade as string };
    if (suggestion!.certNumber) patch.certNumber = suggestion!.certNumber;
    void save(patch);
  };

  const btnBase = 'min-h-[44px] rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-50';

  return (
    <div role="group" aria-label={COPY.heading} className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 dark:border-amber-700 dark:bg-amber-900/20">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">{COPY.heading}</span>
        {(suggestedGraded || suggestion?.conditionCode) && (
          <span className="text-xs font-medium text-amber-800 dark:text-amber-300">{COPY.suggested}</span>
        )}
      </div>

      {suggestedGraded ? (
        <div className="space-y-2">
          <p className="text-sm text-warm-900 dark:text-warm-100">
            {COPY.gradedLead}: {suggestion!.grader} {suggestion!.grade}
            {suggestion!.certNumber ? ` (cert ${suggestion!.certNumber})` : ''}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={confirmGraded}
            className={`${btnBase} bg-amber-600 text-white hover:bg-amber-700`}
          >
            {saving ? COPY.saving : COPY.confirmGraded}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {!suggestion?.conditionCode && <p className="text-xs text-warm-700 dark:text-warm-300">{COPY.choose}</p>}
          <div className="flex flex-wrap gap-2">
            {(vocab?.conditionCodes ?? []).map((c) => (
              <button
                key={c.code}
                type="button"
                aria-pressed={selected === c.code}
                title={c.label}
                disabled={busy}
                onClick={() => setSelected(c.code)}
                className={`${btnBase} min-w-[44px] border ${
                  selected === c.code
                    ? 'border-amber-600 bg-amber-600 text-white'
                    : 'border-warm-300 bg-white text-warm-900 hover:border-amber-500 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100'
                }`}
              >
                {c.code}
              </button>
            ))}
          </div>
          {selected && vocab && <p className="text-xs text-warm-700 dark:text-warm-300">{labelFor(vocab.conditionCodes, selected)}</p>}
          <button
            type="button"
            disabled={busy || !selected}
            onClick={() => void save({ conditionCode: selected })}
            className={`${btnBase} bg-amber-600 text-white hover:bg-amber-700`}
          >
            {saving ? COPY.saving : COPY.confirm}
          </button>
        </div>
      )}

      <p className="text-xs text-warm-600 dark:text-warm-400">{COPY.unconfirmedHint}</p>
      {error && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
};

export default CardConditionConfirm;
