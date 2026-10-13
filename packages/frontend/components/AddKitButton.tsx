/**
 * "Add a kit" action for the Add Items screen (kits / bundles). Opens a small dialog that asks only for a name and the first item(s), makes the
 * kit through POST /api/kits, then goes straight to the new kit's edit page (/organizer/edit-item/<id>), where the full kit section lives
 * (price, description, photos, contents). The starting price is the total of the items; it is only asked for when none of them has a price.
 */
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';
import { buildKitComponentsPayload, kitErrorText, suggestKitPrice, validateNewKit } from '../lib/kitContents';
import type { KitDraftPart } from '../lib/kitContents';

interface Candidate {
  id: string;
  title: string;
  price: number | null;
  photoUrl: string | null;
  remaining: number;
}

const inputCls =
  'w-full min-h-[44px] px-4 py-2 text-base sm:text-sm border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:opacity-60';
const labelCls = 'block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1';
const primaryBtn =
  'min-h-[44px] rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50';
const secondaryBtn =
  'min-h-[44px] rounded-lg bg-warm-100 px-4 text-sm font-semibold text-warm-900 transition-colors hover:bg-warm-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600 disabled:opacity-50';

const money = (n: number | null): string => (n === null ? '' : `$${n.toFixed(2)}`);

const AddKitButton: React.FC<{ saleId: string; className?: string }> = ({ saleId, className }) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [parts, setParts] = useState<KitDraftPart[]>([]);
  const [search, setSearch] = useState('');
  const [priceText, setPriceText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const candidatesQuery = useQuery({
    queryKey: ['kit-candidates', saleId, search],
    queryFn: async (): Promise<Candidate[]> => {
      const res = await api.get('/kits/candidates', { params: { saleId, q: search || undefined } });
      return (res.data?.data?.items ?? []) as Candidate[];
    },
    enabled: open,
    staleTime: 10 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, saving]);

  const suggested = suggestKitPrice(parts);
  const priceNeeded = suggested <= 0;

  const close = () => {
    if (saving) return;
    setOpen(false);
    setName('');
    setParts([]);
    setSearch('');
    setPriceText('');
    setError('');
  };

  const create = async () => {
    const problem = validateNewKit(name, parts, priceText, priceNeeded);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/kits', {
        title: name.trim(),
        price: priceNeeded ? Number(priceText) : suggested,
        saleId,
        components: buildKitComponentsPayload(parts),
      });
      const kitId = res.data?.data?.kit?.id as string | undefined;
      await queryClient.invalidateQueries({ queryKey: ['items', saleId] });
      await queryClient.invalidateQueries({ queryKey: ['kit-candidates'] });
      showToast('Kit created. Set its price and details here.', 'success');
      if (kitId) await router.push(`/organizer/edit-item/${encodeURIComponent(kitId)}`);
      else close();
    } catch (err) {
      setError(kitErrorText(err));
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        Add a kit
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-kit-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-white p-4 dark:bg-gray-800 sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="add-kit-title" className="text-lg font-semibold text-warm-900 dark:text-warm-100">
              Add a kit
            </h2>
            <p className="mt-1 text-sm text-warm-700 dark:text-warm-300">
              A kit sells several of your items together. Name it and pick the first items. You set the price and details on the next screen.
            </p>

            <div className="mt-3">
              <label htmlFor="add-kit-name" className={labelCls}>
                Kit name
              </label>
              <input id="add-kit-name" type="text" maxLength={200} value={name} disabled={saving} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </div>

            <div className="mt-3">
              <h3 className="text-sm font-semibold text-warm-900 dark:text-warm-100">Items in this kit</h3>
              {parts.length === 0 && <p className="mt-1 text-sm text-warm-700 dark:text-warm-300">No items yet. Search below and add some.</p>}
              <ul className="mt-2 space-y-2">
                {parts.map((p) => (
                  <li key={p.itemId} className="flex flex-wrap items-center gap-2 rounded-lg border border-warm-200 p-2 dark:border-gray-700">
                    <span className="min-w-0 flex-1 break-words text-sm text-warm-900 dark:text-warm-100">
                      {p.title}
                      <span className="ml-2 text-xs text-warm-600 dark:text-warm-400">{p.remaining} left</span>
                    </span>
                    <label className="text-xs text-warm-600 dark:text-warm-400" htmlFor={`add-kit-qty-${p.itemId}`}>
                      Quantity per kit
                    </label>
                    <input
                      id={`add-kit-qty-${p.itemId}`}
                      type="text"
                      inputMode="numeric"
                      value={p.quantity}
                      disabled={saving}
                      onChange={(e) => setParts(parts.map((x) => (x.itemId === p.itemId ? { ...x, quantity: e.target.value } : x)))}
                      className={`${inputCls} !w-20`}
                    />
                    <button type="button" disabled={saving} onClick={() => setParts(parts.filter((x) => x.itemId !== p.itemId))} className={secondaryBtn} aria-label={`Remove ${p.title} from this kit`}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-3">
              <label htmlFor="add-kit-search" className={labelCls}>
                Find items to add
              </label>
              <input id="add-kit-search" type="text" value={search} placeholder="Search by name" onChange={(e) => setSearch(e.target.value)} className={inputCls} />
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
              <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto">
                {(candidatesQuery.data ?? []).map((c) => {
                  const added = parts.some((p) => p.itemId === c.id);
                  return (
                    <li key={c.id} className="flex items-center gap-2 rounded-lg border border-warm-200 p-2 dark:border-gray-700">
                      <span className="min-w-0 flex-1 break-words text-sm text-warm-900 dark:text-warm-100">
                        {c.title}
                        <span className="ml-2 text-xs text-warm-600 dark:text-warm-400">
                          {money(c.price)} {c.remaining} left
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={added || saving}
                        onClick={() => setParts([...parts, { itemId: c.id, title: c.title, photoUrl: c.photoUrl, quantity: '1', remaining: c.remaining, price: c.price }])}
                        className={secondaryBtn}
                      >
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

            {parts.length > 0 && !priceNeeded && (
              <p className="mt-3 text-sm text-warm-700 dark:text-warm-300">The kit starts at {money(suggested)}, the total of these items. You can change the price next.</p>
            )}
            {parts.length > 0 && priceNeeded && (
              <div className="mt-3">
                <label htmlFor="add-kit-price" className={labelCls}>
                  Kit price (USD)
                </label>
                <input id="add-kit-price" type="text" inputMode="decimal" value={priceText} disabled={saving} onChange={(e) => setPriceText(e.target.value)} className={inputCls} />
                <p className="mt-1 text-xs text-warm-600 dark:text-warm-400">None of these items has a price yet, so set one for the kit. You can change it next.</p>
              </div>
            )}

            {error && (
              <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
                {error}
              </p>
            )}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={close} disabled={saving} className={secondaryBtn}>
                Cancel
              </button>
              <button type="button" onClick={create} disabled={saving} className={primaryBtn}>
                {saving ? 'Creating...' : 'Create kit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AddKitButton;
