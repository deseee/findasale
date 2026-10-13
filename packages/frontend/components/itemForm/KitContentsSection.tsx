/**
 * Kit pieces of the item edit page's "Quantity & setup" section (kits / bundles).
 *
 *  - KitContentsSection: for an item whose listing type is KIT. Shows the derived "N available" line (it cannot be typed) and the contents
 *    editor: the items inside, quantity per kit, add from the organizer's own items, remove. Contents save through PUT /api/kits/:kitId with
 *    their own "Save contents" button, independent of the form's Save (the kit's name, price and description are ordinary item fields that the
 *    normal form saves). All rules live on the server; this only shows what it says.
 *  - InKitsNote: for an ordinary item. A short read-only list of the kits it is part of, each linking to that kit's edit page.
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useToast } from '../ToastContext';
import {
  KIT_LOCKED_NOTE,
  buildKitComponentsPayload,
  kitAvailableLine,
  kitErrorText,
  kitPartsChanged,
  partsFromComponents,
  previewKitAvailable,
  validateKitParts,
} from '../../lib/kitContents';
import type { KitComponentLike, KitDraftPart } from '../../lib/kitContents';

interface KitViewLite {
  id: string;
  stockSold: number;
  available: number;
  components: KitComponentLike[];
}
interface Candidate {
  id: string;
  title: string;
  price: number | null;
  photoUrl: string | null;
  remaining: number;
}
interface Membership {
  kitId: string;
  title: string;
  quantity: number;
}

const inputCls =
  'w-full min-h-[44px] px-4 py-2 text-base sm:text-sm border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:opacity-60';
const labelCls = 'block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1';
const primaryBtn =
  'min-h-[44px] rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50';
const secondaryBtn =
  'min-h-[44px] rounded-lg bg-warm-100 px-4 text-sm font-semibold text-warm-900 transition-colors hover:bg-warm-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600 disabled:opacity-50';

const money = (n: number | null): string => (n === null ? '' : `$${n.toFixed(2)}`);

export const KitContentsSection: React.FC<{ itemId: string; saleId: string | null }> = ({ itemId, saleId }) => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const kitQuery = useQuery({
    queryKey: ['kit', itemId],
    queryFn: async (): Promise<KitViewLite> => {
      const res = await api.get(`/kits/${encodeURIComponent(itemId)}`);
      return res.data?.data?.kit as KitViewLite;
    },
    enabled: !!itemId,
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const kit = kitQuery.data;
  const locked = !!kit && kit.stockSold > 0;

  const [parts, setParts] = useState<KitDraftPart[]>([]);
  const [touched, setTouched] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const savedParts = kit ? partsFromComponents(kit.components) : [];

  // Load the saved contents, and follow later refreshes, unless the organizer has edits in progress.
  useEffect(() => {
    if (kit && !touched) setParts(partsFromComponents(kit.components));
  }, [kit, touched]);

  const candidatesQuery = useQuery({
    queryKey: ['kit-candidates', saleId, search],
    queryFn: async (): Promise<Candidate[]> => {
      const res = await api.get('/kits/candidates', { params: { saleId: saleId || undefined, q: search || undefined } });
      return (res.data?.data?.items ?? []) as Candidate[];
    },
    enabled: !!kit && !locked,
    staleTime: 10 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const changed = kitPartsChanged(savedParts, parts);

  const addPart = (c: Candidate) => {
    if (parts.some((p) => p.itemId === c.id)) return;
    setParts([...parts, { itemId: c.id, title: c.title, photoUrl: c.photoUrl, quantity: '1', remaining: c.remaining }]);
    setTouched(true);
  };

  const saveContents = async () => {
    const problem = validateKitParts(parts);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.put(`/kits/${encodeURIComponent(itemId)}`, { components: buildKitComponentsPayload(parts) });
      showToast('Kit contents saved.', 'success');
      setTouched(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['kit', itemId] }),
        queryClient.invalidateQueries({ queryKey: ['item', itemId] }),
        queryClient.invalidateQueries({ queryKey: ['kit-candidates'] }),
        queryClient.invalidateQueries({ queryKey: ['kits-by-component'] }),
        ...(saleId ? [queryClient.invalidateQueries({ queryKey: ['items', saleId] })] : []),
      ]);
    } catch (err) {
      setError(kitErrorText(err));
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setTouched(false);
    setError('');
    if (kit) setParts(partsFromComponents(kit.components));
  };

  if (kitQuery.isLoading) {
    return (
      <p role="status" className="text-sm text-warm-600 dark:text-warm-300">
        Loading kit contents...
      </p>
    );
  }
  if (kitQuery.isError || !kit) {
    return (
      <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
        <p>Could not load what is in this kit.</p>
        <button type="button" onClick={() => kitQuery.refetch()} className="mt-2 min-h-[44px] rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700">
          Try again
        </button>
      </div>
    );
  }

  const previewNow = changed ? previewKitAvailable(parts) : null;

  return (
    <div className="space-y-4" data-testid="kit-contents">
      <div>
        <span className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">In stock</span>
        <p className="text-sm text-warm-900 dark:text-warm-100" data-testid="kit-available">
          {kitAvailableLine(kit.available)}
        </p>
        <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
          Selling one kit takes the listed quantity from every item inside it, and selling those items on their own lowers this number. You do not type it.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-warm-900 dark:text-warm-100">What is in this kit</h3>
        {locked && <p className="mt-1 text-xs text-warm-600 dark:text-warm-400">{KIT_LOCKED_NOTE}</p>}
        {parts.length === 0 && <p className="mt-1 text-sm text-warm-700 dark:text-warm-300">No items yet. Search below and add some.</p>}
        <ul className="mt-2 space-y-2">
          {parts.map((p) => (
            <li key={p.itemId} className="flex flex-wrap items-center gap-2 rounded-lg border border-warm-200 p-2 dark:border-gray-700">
              {p.photoUrl ? (
                <img src={p.photoUrl} alt="" className="h-12 w-12 flex-shrink-0 rounded object-cover" />
              ) : (
                <span className="h-12 w-12 flex-shrink-0 rounded bg-warm-100 dark:bg-gray-700" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 break-words text-sm text-warm-900 dark:text-warm-100">
                {p.title}
                <span className="ml-2 text-xs text-warm-600 dark:text-warm-400">{p.remaining} left</span>
              </span>
              <label className="text-xs text-warm-600 dark:text-warm-400" htmlFor={`kit-qty-${p.itemId}`}>
                Quantity per kit
              </label>
              <input
                id={`kit-qty-${p.itemId}`}
                type="text"
                inputMode="numeric"
                value={p.quantity}
                disabled={saving || locked}
                onChange={(e) => {
                  setParts(parts.map((x) => (x.itemId === p.itemId ? { ...x, quantity: e.target.value } : x)));
                  setTouched(true);
                }}
                className={`${inputCls} !w-20`}
              />
              {!locked && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setParts(parts.filter((x) => x.itemId !== p.itemId));
                    setTouched(true);
                  }}
                  className={secondaryBtn}
                  aria-label={`Remove ${p.title} from this kit`}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {!locked && (
        <div>
          <label htmlFor="kit-search" className={labelCls}>
            Find items to add
          </label>
          <input id="kit-search" type="text" value={search} placeholder="Search by name" onChange={(e) => setSearch(e.target.value)} className={inputCls} />
          {candidatesQuery.isLoading && (
            <p role="status" className="mt-2 text-sm text-warm-600 dark:text-warm-300">
              Loading items...
            </p>
          )}
          {candidatesQuery.isError && (
            <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
              Could not load your items. Try again.
            </p>
          )}
          <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
            {(candidatesQuery.data ?? [])
              .filter((c) => c.id !== itemId)
              .map((c) => {
                const added = parts.some((p) => p.itemId === c.id);
                return (
                  <li key={c.id} className="flex items-center gap-2 rounded-lg border border-warm-200 p-2 dark:border-gray-700">
                    <span className="min-w-0 flex-1 break-words text-sm text-warm-900 dark:text-warm-100">
                      {c.title}
                      <span className="ml-2 text-xs text-warm-600 dark:text-warm-400">
                        {money(c.price)} {c.remaining} left
                      </span>
                    </span>
                    <button type="button" disabled={added || saving} onClick={() => addPart(c)} className={secondaryBtn}>
                      {added ? 'Added' : 'Add'}
                    </button>
                  </li>
                );
              })}
          </ul>
          {candidatesQuery.isSuccess && (candidatesQuery.data ?? []).length === 0 && (
            <p className="mt-2 text-sm text-warm-700 dark:text-warm-300">No matching items. Consigned, other vendors' booth, bulk lot and auction items cannot go in a kit yet.</p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {!locked && (
        <div className="space-y-2">
          {previewNow !== null && (
            <p className="text-xs text-warm-600 dark:text-warm-400">After you save this, about {previewNow} kit{previewNow === 1 ? '' : 's'} will be available.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={saveContents} disabled={saving || !changed} className={primaryBtn}>
              {saving ? 'Saving...' : 'Save contents'}
            </button>
            {changed && (
              <button type="button" onClick={discard} disabled={saving} className={secondaryBtn}>
                Undo changes
              </button>
            )}
          </div>
          <p className="text-xs text-warm-500 dark:text-warm-400">The items inside save with this button. The name, price and description save with the form's Save.</p>
        </div>
      )}
    </div>
  );
};

export const InKitsNote: React.FC<{ itemId: string }> = ({ itemId }) => {
  const q = useQuery({
    queryKey: ['kits-by-component', itemId],
    queryFn: async (): Promise<Membership[]> => {
      const res = await api.get(`/kits/by-component/${encodeURIComponent(itemId)}`);
      return (res.data?.data?.kits ?? []) as Membership[];
    },
    enabled: !!itemId,
    staleTime: 30 * 1000,
    retry: 0,
    refetchOnWindowFocus: false,
  });
  const kits = q.data ?? [];
  if (kits.length === 0) return null;
  return (
    <div data-testid="in-kits">
      <span className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">In kits</span>
      <ul className="space-y-1 text-sm text-warm-900 dark:text-warm-100">
        {kits.map((k) => (
          <li key={k.kitId}>
            <Link
              href={`/organizer/edit-item/${encodeURIComponent(k.kitId)}`}
              className="text-amber-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-amber-400"
            >
              {k.title}
            </Link>
            <span className="ml-2 text-xs text-warm-600 dark:text-warm-400">{k.quantity} per kit</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Selling one of these kits takes this item down by the amount shown.</p>
    </div>
  );
};

export default KitContentsSection;
