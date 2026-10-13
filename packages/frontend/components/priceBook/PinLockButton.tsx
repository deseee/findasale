/**
 * PinLockButton (ADR-140 section 11.6): "Keep my price" / "Let the price book suggest again" for one item.
 * Calls PUT /api/price-book/locks/:itemId. Renders nothing unless the price book and the shop's own book are both on.
 * B8 mounts this beside the Price field in the item editor; this batch only creates it. Nothing here changes a price.
 */
import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { priceBookApi } from '../../lib/priceBook';
import { PRICE_BOOK_COPY, PRICE_BOOK_UI } from '../../lib/priceBookCopy';
import { useToast } from '../ToastContext';
import { smallBtn } from './ui';
import { pbKeys, usePriceBookStatus, useReportError } from './usePriceBookData';

export interface PinLockButtonProps {
  itemId: string;
  /** True when the item is pinned now (the suggestion's lockedReason is PIN). */
  locked: boolean;
  onChanged?: (locked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

const PinLockButton: React.FC<PinLockButtonProps> = ({ itemId, locked, onChanged, disabled, className }) => {
  const status = usePriceBookStatus();
  const { showToast } = useToast();
  const report = useReportError();
  const queryClient = useQueryClient();
  const [isLocked, setIsLocked] = useState(locked);

  useEffect(() => {
    setIsLocked(locked);
  }, [locked]);

  const mutation = useMutation({
    mutationFn: (next: boolean) => priceBookApi.putLock(itemId, { locked: next }),
    onSuccess: (_data, next) => {
      setIsLocked(next);
      showToast(next ? PRICE_BOOK_UI.pinnedToast : PRICE_BOOK_UI.unpinnedToast, 'success');
      if (onChanged) onChanged(next);
      void queryClient.invalidateQueries({ queryKey: pbKeys.all });
    },
    onError: (err) => {
      report(err);
    },
  });

  const s = status.data;
  if (!s || !s.enabled || !s.bookEnabled) return null;

  return (
    <button
      type="button"
      aria-pressed={isLocked}
      disabled={disabled || mutation.isPending}
      onClick={() => mutation.mutate(!isLocked)}
      className={className || smallBtn}
    >
      {isLocked ? PRICE_BOOK_COPY.pinUnlock : PRICE_BOOK_COPY.pinLock}
    </button>
  );
};

export default PinLockButton;
