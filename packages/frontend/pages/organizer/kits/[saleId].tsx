/**
 * Kits page (kits / bundles, Phase 1): /organizer/kits/[saleId]
 * Make a kit from items you already have ("one of each coin tube for $12"). Selling one kit takes the listed quantity from every
 * item inside it. The kit's units available are worked out from those items; they are not typed in.
 *
 * All rules live on the server (/api/kits). This page only collects the name, price and the items, and shows what the server says.
 */
import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';

interface KitComponentView {
  itemId: string;
  title: string;
  price: number | null;
  photoUrl: string | null;
  status: string;
  quantity: number;
  remaining: number;
}
interface KitView {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  saleId: string | null;
  status: string;
  stockSold: number;
  stockTotal: number;
  available: number;
  components: KitComponentView[];
}
interface Candidate {
  id: string;
  title: string;
  price: number | null;
  photoUrl: string | null;
  remaining: number;
}
interface DraftComponent {
  itemId: string;
  title: string;
  quantity: string;
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

function errorText(err: unknown): string {
  const e = err as { response?: { data?: { error?: string; message?: string } } };
  return e?.response?.data?.error || e?.response?.data?.message || 'Something went wrong. Please try again.';
}

const KitsPage = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const raw = router.query.saleId;
  const saleId = typeof raw === 'string' && raw !== '' ? raw : null;
  const isOrganizer = !!user && !!user.roles && user.roles.includes('ORGANIZER');

  useEffect(() => {
    if (!router.isReady || authLoading) return;
    if (!isOrganizer) router.push('/login');
    else if (!saleId) router.replace('/organizer/dashboard');
  }, [router, authLoading, isOrganizer, saleId]);

  const ready = router.isReady && !authLoading && isOrganizer && !!saleId;

  const listKey = ['kits-manage', saleId];
  const listQuery = useQuery({
    queryKey: listKey,
    queryFn: async (): Promise<KitView[]> => {
      const res = await api.get('/kits', { params: { saleId } });
      return (res.data?.data?.kits ?? []) as KitView[];
    },
    enabled: ready,
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const kits = listQuery.data ?? [];

  const [editingId, setEditingId] = useState<string | null>(null); // null = making a new kit
  const [locked, setLocked] = useState(false); // the kit has sold: its items cannot change
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceText, setPriceText] = useState('');
  const [parts, setParts] = useState<DraftComponent[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const candidatesQuery = useQuery({
    queryKey: ['kit-candidates', saleId, search],
    queryFn: async (): Promise<Candidate[]> => {
      const res = await api.get('/kits/candidates', { params: { saleId, q: search || undefined } });
      return (res.data?.data?.items ?? []) as Candidate[];
    },
    enabled: ready && !locked,
    staleTime: 10 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const resetForm = () => {
    setEditingId(null);
    setLocked(false);
    setName('');
    setDescription('');
    setPriceText('');
    setParts([]);
    setSearch('');
    setError('');
  };

  const startEdit = (kit: KitView) => {
    setEditingId(kit.id);
    setLocked(kit.stockSold > 0);
    setName(kit.title);
    setDescription(kit.description ?? '');
    setPriceText(kit.price === null ? '' : String(kit.price));
    setParts(kit.components.map((c) => ({ itemId: c.itemId, title: c.title, quantity: String(c.quantity), remaining: c.remaining })));
    setError('');
  };

  const addPart = (c: Candidate) => {
    if (parts.some((p) => p.itemId === c.id)) return;
    setParts([...parts, { itemId: c.id, title: c.title, quantity: '1', remaining: c.remaining }]);
  };

  const save = async () => {
    const price = Number(priceText);
    if (!name.trim()) return setError('Give the kit a name.');
    if (!Number.isFinite(price) || price <= 0) return setError('Enter a kit price greater than zero.');
    if (parts.length === 0) return setError('Pick at least one item for the kit.');
    const components = parts.map((p) => ({ itemId: p.itemId, quantity: Number(p.quantity) }));
    if (components.some((c) => !Number.isInteger(c.quantity) || c.quantity < 1)) return setError('Each quantity must be a whole number, 1 or more.');
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api.put(`/kits/${encodeURIComponent(editingId)}`, {
          title: name.trim(),
          description: description.trim() || null,
          price,
          ...(locked ? {} : { components }),
        });
        showToast('Kit saved.', 'success');
      } else {
        await api.post('/kits', { title: name.trim(), description: description.trim() || null, price, saleId, components });
        showToast('Kit created.', 'success');
      }
      resetForm();
      await queryClient.invalidateQueries({ queryKey: listKey });
      await queryClient.invalidateQueries({ queryKey: ['kit-candidates'] });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const archive = async (kit: KitView) => {
    if (typeof window !== 'undefined' && !window.confirm(`Remove the kit "${kit.title}"? The items inside are not touched.`)) return;
    try {
      await api.delete(`/kits/${encodeURIComponent(kit.id)}`);
      showToast('Kit removed.', 'success');
      if (editingId === kit.id) resetForm();
      await queryClient.invalidateQueries({ queryKey: listKey });
      await queryClient.invalidateQueries({ queryKey: ['kit-candidates'] });
    } catch (err) {
      showToast(errorText(err), 'error');
    }
  };

  return (
    <>
      <Head>
        <title>Kits - FindA.Sale</title>
      </Head>
      <main className="min-h-screen bg-warm-50 py-6 dark:bg-gray-900">
        <div className="mx-auto w-full max-w-3xl min-w-0 px-4">
          {saleId ? (
            <Link
              href={`/organizer/add-items/${encodeURIComponent(saleId)}`}
              className="inline-flex min-h-[44px] items-center text-sm font-medium text-amber-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-amber-400"
            >
              Back to add items
            </Link>
          ) : null}
          <h1 className="mt-2 break-words text-2xl font-bold text-warm-900 dark:text-warm-100 sm:text-3xl">Kits</h1>
          <p className="mt-2 text-sm text-warm-700 dark:text-warm-300">
            Sell several of your items together for one price. When a kit sells, each item inside goes down by its quantity. The number of kits available is worked
            out from the items inside, so it stays right when those items also sell on their own.
          </p>

          {!ready ? (
            <p role="status" className="mt-6 text-sm text-warm-600 dark:text-warm-300">
              Loading...
            </p>
          ) : (
            <div className="mt-6 space-y-6">
              <section aria-labelledby="kit-form-heading" className="space-y-3 rounded-lg border border-warm-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <h2 id="kit-form-heading" className="text-lg font-semibold text-warm-900 dark:text-warm-100">
                  {editingId ? 'Edit kit' : 'New kit'}
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="kit-name" className={labelCls}>
                      Kit name
                    </label>
                    <input id="kit-name" type="text" maxLength={200} value={name} disabled={saving} onChange={(e) => setName(e.target.value)} className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="kit-desc" className={labelCls}>
                      Description (optional)
                    </label>
                    <textarea id="kit-desc" rows={3} maxLength={5000} value={description} disabled={saving} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="kit-price" className={labelCls}>
                      Kit price (USD)
                    </label>
                    <input id="kit-price" type="text" inputMode="decimal" value={priceText} disabled={saving} onChange={(e) => setPriceText(e.target.value)} className={inputCls} />
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-warm-900 dark:text-warm-100">Items in this kit</h3>
                  {locked && (
                    <p className="mt-1 text-xs text-warm-600 dark:text-warm-400">
                      This kit has already sold, so its items cannot change. You can still change the name, description and price. To change what goes in a kit, make a new kit.
                    </p>
                  )}
                  {parts.length === 0 && <p className="mt-1 text-sm text-warm-700 dark:text-warm-300">No items yet. Search below and add some.</p>}
                  <ul className="mt-2 space-y-2">
                    {parts.map((p) => (
                      <li key={p.itemId} className="flex flex-wrap items-center gap-2 rounded-lg border border-warm-200 p-2 dark:border-gray-700">
                        <span className="min-w-0 flex-1 break-words text-sm text-warm-900 dark:text-warm-100">
                          {p.title}
                          <span className="ml-2 text-xs text-warm-600 dark:text-warm-400">{p.remaining} left</span>
                        </span>
                        <label className="sr-only" htmlFor={`kit-qty-${p.itemId}`}>
                          Quantity of {p.title} per kit
                        </label>
                        <input
                          id={`kit-qty-${p.itemId}`}
                          type="text"
                          inputMode="numeric"
                          value={p.quantity}
                          disabled={saving || locked}
                          onChange={(e) => setParts(parts.map((x) => (x.itemId === p.itemId ? { ...x, quantity: e.target.value } : x)))}
                          className={`${inputCls} !w-20`}
                        />
                        {!locked && (
                          <button type="button" disabled={saving} onClick={() => setParts(parts.filter((x) => x.itemId !== p.itemId))} className={secondaryBtn}>
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
                            <button type="button" disabled={added || saving} onClick={() => addPart(c)} className={secondaryBtn}>
                              {added ? 'Added' : 'Add'}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {candidatesQuery.isSuccess && (candidatesQuery.data ?? []).length === 0 && (
                      <p className="mt-2 text-sm text-warm-700 dark:text-warm-300">No matching items. Consigned, vendor booth, bulk lot and auction items cannot go in a kit yet.</p>
                    )}
                  </div>
                )}

                {error && (
                  <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                    {error}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={save} disabled={saving} className={primaryBtn}>
                    {saving ? 'Saving...' : editingId ? 'Save kit' : 'Create kit'}
                  </button>
                  {editingId && (
                    <button type="button" onClick={resetForm} disabled={saving} className={secondaryBtn}>
                      Cancel
                    </button>
                  )}
                </div>
              </section>

              <section aria-labelledby="kit-list-heading" className="space-y-3">
                <h2 id="kit-list-heading" className="text-lg font-semibold text-warm-900 dark:text-warm-100">
                  Your kits for this sale
                </h2>
                {listQuery.isLoading && (
                  <p role="status" className="text-sm text-warm-600 dark:text-warm-300">
                    Loading...
                  </p>
                )}
                {listQuery.isError && (
                  <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
                    <p>Could not load your kits.</p>
                    <button type="button" onClick={() => listQuery.refetch()} className="mt-2 min-h-[44px] rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700">
                      Try again
                    </button>
                  </div>
                )}
                {listQuery.isSuccess && kits.length === 0 && <p className="text-sm text-warm-700 dark:text-warm-300">No kits yet.</p>}
                {kits.map((kit) => (
                  <div key={kit.id} className="rounded-lg border border-warm-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="break-words text-base font-semibold text-warm-900 dark:text-warm-100">{kit.title}</h3>
                        <p className="mt-1 text-sm text-warm-800 dark:text-warm-200">
                          {money(kit.price)}. {kit.available > 0 ? `${kit.available} kit${kit.available === 1 ? '' : 's'} available` : 'Sold out'}. {kit.stockSold} sold.
                        </p>
                        <p className="mt-1 text-xs text-warm-600 dark:text-warm-400">
                          {kit.components.map((c) => `${c.quantity} x ${c.title}`).join(', ')}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => startEdit(kit)} className={secondaryBtn}>
                          Edit
                        </button>
                        <button type="button" onClick={() => archive(kit)} className={secondaryBtn}>
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            </div>
          )}
        </div>
      </main>
    </>
  );
};

export default KitsPage;
