/**
 * ItemPriceLock (ADR-140 sections 11.6 and 12.3, batch B8): "Keep my price" beside the Price field in the item editor.
 *
 * Shows PinLockButton only when the price book and the shop's own book are on AND the item has a card record. It reads the
 * same card query as the card details panel (key ["item-card", itemId]) and the list of pinned items, and changes nothing
 * about the price itself: a price the shop typed always stands, and pinning only stops the price book from changing it.
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import type { StoredCard } from '../../lib/cardRecord';
import { priceBookApi } from '../../lib/priceBook';
import { PRICE_BOOK_COPY } from '../../lib/priceBookCopy';
import { isItemPinned } from '../../lib/priceBookWiring';
import PinLockButton from './PinLockButton';
import { PB_ROOT, usePriceBookStatus } from './usePriceBookData';

export interface ItemPriceLockProps {
  itemId: string;
  disabled?: boolean;
}

const ItemPriceLock: React.FC<ItemPriceLockProps> = ({ itemId, disabled }) => {
  const status = usePriceBookStatus();
  const s = status.data;
  const on = !!s && s.enabled && s.bookEnabled;
  const card = useQuery<StoredCard | null>({
    queryKey: ['item-card', itemId],
    queryFn: async (): Promise<StoredCard | null> => {
      const res = await api.get(`/item-cards/${itemId}`);
      return (res.data?.data ?? null) as StoredCard | null;
    },
    enabled: on && !!itemId,
    staleTime: 30 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const hasCard = on && card.isSuccess && !!card.data;
  const locks = useQuery<boolean>({
    queryKey: [PB_ROOT, 'locks', itemId],
    queryFn: async () => isItemPinned(await priceBookApi.listLocks(200), itemId, new Date()),
    enabled: hasCard,
    staleTime: 30 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [changed, setChanged] = useState<boolean | null>(null);

  if (!hasCard) return null;
  const pinned = changed !== null ? changed : locks.data === true;

  return (
    <div className="mt-2 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <PinLockButton itemId={itemId} locked={pinned} onChanged={setChanged} disabled={disabled || locks.isLoading} />
      {pinned && <p className="break-words text-xs text-warm-600 dark:text-warm-400">{PRICE_BOOK_COPY.lockedNotApplied}</p>}
    </div>
  );
};

export default ItemPriceLock;
