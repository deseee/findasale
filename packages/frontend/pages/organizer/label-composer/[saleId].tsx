/**
 * Label Sheet Composer — batch QR pricetag builder for Avery 5160
 *
 * Two input modes:
 *   1. Preset chips — tap a cheat-sheet price, set qty, add to batch
 *   2. Pull from catalog — search priced items, select, add to batch
 *
 * Output: PDF labels with real QR codes, formatted for Avery 5160 (3×10 = 30/page)
 */

import React, { useReducer, useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import Head from 'next/head';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Sale {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
}

interface BatchItem {
  id: string;
  price: number;
  qty: number;
  source:
    | { kind: 'preset' }
    | { kind: 'item'; itemId: string; itemCode: string; itemName: string };
}

interface BatchState {
  selectedPrice: number | null;
  qty: number;
  items: BatchItem[];
  leftoverFill: number | null;
  currentPage: number;
}

interface CatalogItem {
  id: string;
  code: string;
  name: string;
  price: number;
  category: string | null;
  needsTag: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const LABELS_PER_PAGE = 30;
const COLS = 3;
const ROWS = 10;

// ---------------------------------------------------------------------------
// Color band mapping — preview only
// ---------------------------------------------------------------------------
function getPriceBandColor(price: number): string {
  if (price <= 0.75) return 'bg-stone-200';
  if (price <= 2.50) return 'bg-sky-200';
  if (price <= 4.50) return 'bg-pink-200';
  if (price <= 9) return 'bg-emerald-200';
  if (price <= 15) return 'bg-amber-300';
  return 'bg-orange-700 text-white';
}

function getPriceBandDot(price: number): string {
  if (price <= 0.75) return 'bg-stone-400';
  if (price <= 2.50) return 'bg-sky-400';
  if (price <= 4.50) return 'bg-pink-400';
  if (price <= 9) return 'bg-emerald-400';
  if (price <= 15) return 'bg-amber-500';
  return 'bg-orange-700';
}

function formatPrice(p: number): string {
  return `$${p.toFixed(2)}`;
}

function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 14);
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------
type Action =
  | { type: 'SELECT_PRICE'; price: number }
  | { type: 'SET_QTY'; qty: number }
  | { type: 'ADD_QTY'; delta: number }
  | { type: 'ADD_TO_BATCH' }
  | { type: 'FILL_REST' }
  | { type: 'ADD_ITEMS'; items: Array<{ itemId: string; code: string; name: string; price: number; qty: number }> }
  | { type: 'REMOVE_ROW'; id: string }
  | { type: 'UPDATE_ROW_QTY'; id: string; delta: number }
  | { type: 'REORDER'; fromIndex: number; toIndex: number }
  | { type: 'SET_LEFTOVER_FILL'; price: number | null }
  | { type: 'APPLY_LEFTOVER_FILL' }
  | { type: 'SET_PAGE'; page: number }
  | { type: 'LOAD_SAVED'; state: BatchState }
  | { type: 'CLEAR' };

function getTotalLabels(items: BatchItem[]): number {
  return items.reduce((sum, i) => sum + i.qty, 0);
}

function batchReducer(state: BatchState, action: Action): BatchState {
  switch (action.type) {
    case 'SELECT_PRICE':
      return { ...state, selectedPrice: action.price, qty: state.qty || 1 };

    case 'SET_QTY':
      return { ...state, qty: Math.max(0, action.qty) };

    case 'ADD_QTY':
      return { ...state, qty: Math.max(0, state.qty + action.delta) };

    case 'ADD_TO_BATCH': {
      if (state.selectedPrice === null || state.qty <= 0) return state;
      // Check if a preset row with this price already exists
      const existing = state.items.find(
        i => i.source.kind === 'preset' && i.price === state.selectedPrice
      );
      if (existing) {
        return {
          ...state,
          items: state.items.map(i =>
            i.id === existing.id ? { ...i, qty: i.qty + state.qty } : i
          ),
          qty: 0,
        };
      }
      return {
        ...state,
        items: [
          ...state.items,
          {
            id: generateId(),
            price: state.selectedPrice,
            qty: state.qty,
            source: { kind: 'preset' },
          },
        ],
        qty: 0,
      };
    }

    case 'FILL_REST': {
      if (state.selectedPrice === null) return state;
      const total = getTotalLabels(state.items);
      const remainder = LABELS_PER_PAGE - (total % LABELS_PER_PAGE);
      if (remainder <= 0 || remainder >= LABELS_PER_PAGE) return state;
      const existing = state.items.find(
        i => i.source.kind === 'preset' && i.price === state.selectedPrice
      );
      if (existing) {
        return {
          ...state,
          items: state.items.map(i =>
            i.id === existing.id ? { ...i, qty: i.qty + remainder } : i
          ),
        };
      }
      return {
        ...state,
        items: [
          ...state.items,
          {
            id: generateId(),
            price: state.selectedPrice,
            qty: remainder,
            source: { kind: 'preset' },
          },
        ],
      };
    }

    case 'ADD_ITEMS': {
      let newItems = [...state.items];
      for (const item of action.items) {
        const existing = newItems.find(
          i => i.source.kind === 'item' && (i.source as any).itemId === item.itemId
        );
        if (existing) {
          newItems = newItems.map(i =>
            i.id === existing.id ? { ...i, qty: i.qty + item.qty } : i
          );
        } else {
          newItems.push({
            id: generateId(),
            price: item.price,
            qty: item.qty,
            source: { kind: 'item', itemId: item.itemId, itemCode: item.code, itemName: item.name },
          });
        }
      }
      return { ...state, items: newItems };
    }

    case 'REMOVE_ROW':
      return { ...state, items: state.items.filter(i => i.id !== action.id) };

    case 'UPDATE_ROW_QTY': {
      return {
        ...state,
        items: state.items
          .map(i => (i.id === action.id ? { ...i, qty: Math.max(0, i.qty + action.delta) } : i))
          .filter(i => i.qty > 0),
      };
    }

    case 'REORDER': {
      const arr = [...state.items];
      const [moved] = arr.splice(action.fromIndex, 1);
      arr.splice(action.toIndex, 0, moved);
      return { ...state, items: arr };
    }

    case 'SET_LEFTOVER_FILL':
      return { ...state, leftoverFill: action.price };

    case 'APPLY_LEFTOVER_FILL': {
      if (state.leftoverFill === null) return state;
      const total = getTotalLabels(state.items);
      if (total === 0) return state;
      const remainder = LABELS_PER_PAGE - (total % LABELS_PER_PAGE);
      if (remainder <= 0 || remainder >= LABELS_PER_PAGE) return state;
      const existing = state.items.find(
        i => i.source.kind === 'preset' && i.price === state.leftoverFill
      );
      if (existing) {
        return {
          ...state,
          items: state.items.map(i =>
            i.id === existing.id ? { ...i, qty: i.qty + remainder } : i
          ),
        };
      }
      return {
        ...state,
        items: [
          ...state.items,
          {
            id: generateId(),
            price: state.leftoverFill!,
            qty: remainder,
            source: { kind: 'preset' },
          },
        ],
      };
    }

    case 'SET_PAGE':
      return { ...state, currentPage: action.page };

    case 'LOAD_SAVED':
      return action.state;

    case 'CLEAR':
      return { selectedPrice: null, qty: 0, items: [], leftoverFill: null, currentPage: 0 };

    default:
      return state;
  }
}

const initialState: BatchState = {
  selectedPrice: null,
  qty: 0,
  items: [],
  leftoverFill: null,
  currentPage: 0,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function LabelComposerPage() {
  const router = useRouter();
  const { saleId } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [state, dispatch] = useReducer(batchReducer, initialState);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCatalogItems, setSelectedCatalogItems] = useState<Set<string>>(new Set());
  const [catalogQtys, setCatalogQtys] = useState<Record<string, number>>({});
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [savedBatches, setSavedBatches] = useState<Array<{ key: string; name: string; itemCount: number }>>([]);
  const [showSavedBatches, setShowSavedBatches] = useState(false);

  // Refresh saved batches list from localStorage
  const refreshSavedBatches = useCallback(() => {
    if (!saleId || typeof saleId !== 'string') return;
    const prefix = `label-batch-preset-${saleId}-`;
    const results: Array<{ key: string; name: string; itemCount: number }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        try {
          const parsed = JSON.parse(localStorage.getItem(key) || '');
          if (parsed && parsed.name && Array.isArray(parsed.items)) {
            results.push({ key, name: parsed.name, itemCount: parsed.items.length });
          }
        } catch {}
      }
    }
    // Sort newest first (timestamp is in the key)
    results.sort((a, b) => b.key.localeCompare(a.key));
    setSavedBatches(results);
  }, [saleId]);

  // Auth redirect
  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  // Fetch sale
  const { data: sale } = useQuery<Sale>({
    queryKey: ['label-composer-sale', saleId],
    queryFn: async () => {
      const res = await api.get(`/sales/${saleId}`);
      return res.data;
    },
    enabled: !!saleId && typeof saleId === 'string',
  });

  // Fetch cheatsheet
  const { data: cheatsheetData } = useQuery<{ prices: number[] }>({
    queryKey: ['cheatsheet', saleId],
    queryFn: async () => {
      const res = await api.get(`/organizers/${saleId}/cheatsheet`);
      return res.data;
    },
    enabled: !!saleId && typeof saleId === 'string',
  });

  const prices = cheatsheetData?.prices || [];

  // Catalog search
  const { data: catalogData } = useQuery<{ items: CatalogItem[]; nextCursor: string | null }>({
    queryKey: ['items-for-labels', saleId, searchQuery],
    queryFn: async () => {
      const res = await api.get(`/organizers/${saleId}/items-for-labels`, {
        params: { q: searchQuery, limit: 20 },
      });
      return res.data;
    },
    enabled: !!saleId && typeof saleId === 'string' && searchQuery.length > 0,
  });

  // Batch creation mutation
  const createBatchMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/organizers/${saleId}/label-batch`, {
        items: state.items.map(i => ({
          price: i.price,
          qty: i.qty,
          source: i.source.kind === 'item'
            ? { kind: 'item', itemId: (i.source as any).itemId }
            : { kind: 'preset' },
        })),
        leftoverFill: state.leftoverFill,
      });
      return res.data;
    },
  });

  // localStorage persistence
  useEffect(() => {
    if (!saleId || typeof saleId !== 'string' || !initialized) return;
    try {
      localStorage.setItem(
        `label-composer-${saleId}`,
        JSON.stringify(state)
      );
    } catch {}
  }, [state, saleId, initialized]);

  // Restore from localStorage
  useEffect(() => {
    if (!saleId || typeof saleId !== 'string' || initialized) return;
    try {
      const saved = localStorage.getItem(`label-composer-${saleId}`);
      if (saved) {
        const parsed = JSON.parse(saved) as BatchState;
        if (parsed.items && Array.isArray(parsed.items)) {
          dispatch({ type: 'LOAD_SAVED', state: parsed });
        }
      }
    } catch {}
    setInitialized(true);
    refreshSavedBatches();
  }, [saleId, initialized, refreshSavedBatches]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        handlePrint();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSaveBatch();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state]);

  // Derived values
  const totalLabels = getTotalLabels(state.items);
  const totalPages = Math.max(1, Math.ceil(totalLabels / LABELS_PER_PAGE));
  const currentPageLabels = useMemo(() => {
    // Flatten batch into individual label entries in insertion order
    const flat: Array<{ price: number; source: BatchItem['source'] }> = [];
    for (const item of state.items) {
      for (let i = 0; i < item.qty; i++) {
        flat.push({ price: item.price, source: item.source });
      }
    }
    const start = state.currentPage * LABELS_PER_PAGE;
    return flat.slice(start, start + LABELS_PER_PAGE);
  }, [state.items, state.currentPage]);

  const blanksOnPage = LABELS_PER_PAGE - currentPageLabels.length;

  // Date range formatter
  const saleDateRange = useMemo(() => {
    if (!sale) return '';
    const s = new Date(sale.startDate);
    const e = new Date(sale.endDate);
    const sM = s.getMonth() + 1;
    const sD = s.getDate();
    const eD = e.getDate();
    if (s.getMonth() === e.getMonth()) return `${sM}/${sD}–${eD}`;
    return `${sM}/${sD}–${e.getMonth() + 1}/${eD}`;
  }, [sale]);

  // Handlers
  const handlePrint = async () => {
    if (totalLabels === 0) {
      showToast('Add labels to the batch first', 'error');
      return;
    }
    try {
      const result = await createBatchMutation.mutateAsync();
      const response = await api.get(`/organizers/batches/${result.batchId}/print`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      showToast('Failed to generate labels', 'error');
    }
  };

  const handleExportPdf = async () => {
    if (totalLabels === 0) {
      showToast('Add labels to the batch first', 'error');
      return;
    }
    try {
      const result = await createBatchMutation.mutateAsync();
      const response = await api.get(`/organizers/batches/${result.batchId}/print`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `labels-${saleId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('PDF downloaded', 'success');
    } catch (err) {
      showToast('Failed to export PDF', 'error');
    }
  };

  const handleSaveBatch = () => {
    const name = prompt('Name this batch preset:');
    if (!name) return;
    try {
      const key = `label-batch-preset-${saleId}-${Date.now()}`;
      localStorage.setItem(key, JSON.stringify({ name, items: state.items }));
      showToast(`Batch saved as "${name}"`, 'success');
      refreshSavedBatches();
    } catch {
      showToast('Failed to save batch', 'error');
    }
  };

  const handleLoadBatch = (key: string) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.items)) {
        dispatch({
          type: 'LOAD_SAVED',
          state: {
            selectedPrice: null,
            qty: 0,
            items: parsed.items,
            leftoverFill: null,
            currentPage: 0,
          },
        });
        showToast(`Loaded "${parsed.name}"`, 'success');
      }
    } catch {
      showToast('Failed to load batch', 'error');
    }
  };

  const handleDeleteBatch = (key: string, name: string) => {
    if (!confirm(`Delete saved batch "${name}"?`)) return;
    try {
      localStorage.removeItem(key);
      refreshSavedBatches();
      showToast(`Deleted "${name}"`, 'success');
    } catch {
      showToast('Failed to delete batch', 'error');
    }
  };

  const handleAddSelectedCatalogItems = () => {
    if (!catalogData) return;
    const toAdd = catalogData.items
      .filter(i => selectedCatalogItems.has(i.id))
      .map(i => ({
        itemId: i.id,
        code: i.code,
        name: i.name,
        price: i.price,
        qty: catalogQtys[i.id] || 1,
      }));
    if (toAdd.length === 0) return;
    dispatch({ type: 'ADD_ITEMS', items: toAdd });
    setSelectedCatalogItems(new Set());
    setCatalogQtys({});
  };

  // Drag handlers (simple HTML5)
  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) {
      dispatch({ type: 'REORDER', fromIndex: dragIdx, toIndex: idx });
      setDragIdx(idx);
    }
  };
  const handleDragEnd = () => setDragIdx(null);

  if (!saleId || authLoading) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-warm-600 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Label Composer — {sale?.title || 'Loading'} | finda.sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-warm-200 dark:border-gray-700 px-4 py-3 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href={`/organizer/print-kit/${saleId}`}>
                <span className="text-warm-500 dark:text-gray-400 hover:text-warm-700 dark:hover:text-gray-200 cursor-pointer">
                  ← Back to Print Kit
                </span>
              </Link>
              <span className="text-warm-300 dark:text-gray-600">|</span>
              <h1 className="text-lg font-bold text-warm-900 dark:text-white">
                Label Sheet Composer
              </h1>
              {sale && (
                <span className="text-sm text-warm-500 dark:text-gray-400">
                  — {sale.title}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-warm-400 dark:text-gray-500 font-mono">
                Ctrl+P print · Ctrl+S save
              </span>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-6">
            {/* ==================== LEFT — Tag Mixer ==================== */}
            <div className="space-y-5">
              {/* Price Presets */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-4">
                <h2 className="text-sm font-semibold text-warm-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  1. Pick a price
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {prices.map(p => (
                    <button
                      key={p}
                      onClick={() => dispatch({ type: 'SELECT_PRICE', price: p })}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-semibold border transition-colors ${
                        state.selectedPrice === p
                          ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
                          : 'bg-white dark:bg-gray-700 text-warm-800 dark:text-gray-200 border-warm-300 dark:border-gray-600 hover:border-warm-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${getPriceBandDot(p)}`} />
                      {formatPrice(p)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity Controls */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-4">
                <h2 className="text-sm font-semibold text-warm-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  2. How many?
                </h2>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-[120px] bg-warm-50 dark:bg-gray-900 border border-warm-200 dark:border-gray-700 rounded-lg px-4 py-3 text-right font-mono text-2xl text-warm-900 dark:text-white">
                    × {state.qty}
                  </div>
                  {[1, 5, 10, 25].map(n => (
                    <button
                      key={n}
                      onClick={() => dispatch({ type: 'ADD_QTY', delta: n })}
                      className="px-3 py-2 rounded-lg border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-warm-800 dark:text-gray-200 font-semibold text-sm hover:bg-warm-50 dark:hover:bg-gray-600 transition-colors"
                    >
                      +{n}
                    </button>
                  ))}
                  <button
                    onClick={() => dispatch({ type: 'SET_QTY', qty: 0 })}
                    className="px-3 py-2 rounded-lg border border-warm-200 dark:border-gray-700 text-warm-400 dark:text-gray-500 text-sm hover:text-warm-600 dark:hover:text-gray-300 transition-colors"
                  >
                    clear
                  </button>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => dispatch({ type: 'ADD_TO_BATCH' })}
                    disabled={state.selectedPrice === null || state.qty <= 0}
                    className="flex-1 py-2.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                  >
                    Add to batch →
                  </button>
                  <button
                    onClick={() => dispatch({ type: 'FILL_REST' })}
                    disabled={state.selectedPrice === null}
                    className="px-4 py-2.5 rounded-lg border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-gray-300 text-sm font-semibold hover:bg-warm-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Fill rest w/ selected
                  </button>
                </div>
              </div>

              {/* Batch List */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-4">
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-sm font-semibold text-warm-500 dark:text-gray-400 uppercase tracking-wide">
                    Batch
                  </h2>
                  <span className="text-xs text-warm-400 dark:text-gray-500">drag to reorder</span>
                </div>

                {state.items.length === 0 ? (
                  <p className="text-sm text-warm-400 dark:text-gray-500 py-4 text-center">
                    No labels yet — pick a price and add to batch.
                  </p>
                ) : (
                  <div className="divide-y divide-dashed divide-warm-200 dark:divide-gray-700">
                    {state.items.map((item, idx) => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={e => handleDragOver(e, idx)}
                        onDragEnd={handleDragEnd}
                        className={`flex items-center gap-3 py-2 px-1 cursor-grab active:cursor-grabbing ${
                          dragIdx === idx ? 'opacity-50' : ''
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded-sm border border-warm-300 dark:border-gray-600 flex-shrink-0 ${getPriceBandColor(item.price)}`} />
                        <span className="font-semibold text-warm-900 dark:text-white min-w-[60px]">
                          {formatPrice(item.price)}
                        </span>
                        {item.source.kind === 'item' && (
                          <span className="text-xs text-warm-400 dark:text-gray-500 font-mono truncate max-w-[120px]">
                            {(item.source as any).itemCode}
                          </span>
                        )}
                        <span className="text-sm font-mono text-warm-500 dark:text-gray-400">
                          × {item.qty}
                        </span>
                        <div className="ml-auto flex gap-1">
                          <button
                            onClick={() => dispatch({ type: 'UPDATE_ROW_QTY', id: item.id, delta: -1 })}
                            className="w-6 h-6 rounded border border-warm-300 dark:border-gray-600 text-warm-600 dark:text-gray-400 text-xs flex items-center justify-center hover:bg-warm-50 dark:hover:bg-gray-700"
                          >
                            −
                          </button>
                          <button
                            onClick={() => dispatch({ type: 'UPDATE_ROW_QTY', id: item.id, delta: 1 })}
                            className="w-6 h-6 rounded border border-warm-300 dark:border-gray-600 text-warm-600 dark:text-gray-400 text-xs flex items-center justify-center hover:bg-warm-50 dark:hover:bg-gray-700"
                          >
                            +
                          </button>
                          <button
                            onClick={() => dispatch({ type: 'REMOVE_ROW', id: item.id })}
                            className="w-6 h-6 rounded border border-red-300 dark:border-red-800 text-red-500 dark:text-red-400 text-xs flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/30"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-baseline justify-between mt-3 pt-3 border-t border-warm-200 dark:border-gray-700">
                  <span className="text-xs font-mono text-warm-400 dark:text-gray-500">
                    {state.items.length} price{state.items.length !== 1 ? 's' : ''} · {totalLabels} label{totalLabels !== 1 ? 's' : ''}
                  </span>
                  <span className="text-2xl font-bold text-warm-900 dark:text-white">
                    {totalLabels}
                    <span className="text-sm text-warm-400 dark:text-gray-500 font-normal"> / {LABELS_PER_PAGE}</span>
                  </span>
                </div>
              </div>

              {/* Pull from Priced Items */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-4">
                <h2 className="text-sm font-semibold text-warm-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Pull from priced items
                </h2>
                <p className="text-xs text-warm-400 dark:text-gray-500 mb-3">
                  Search your catalog — items already priced get their tag added at the listed price.
                </p>

                <div className="flex items-center gap-2 bg-warm-50 dark:bg-gray-900 border border-warm-200 dark:border-gray-700 rounded-lg px-3 py-2">
                  <span className="text-warm-400 dark:text-gray-500 text-sm">⌕</span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search items..."
                    className="flex-1 bg-transparent border-none outline-none text-sm text-warm-900 dark:text-white placeholder-warm-400 dark:placeholder-gray-500"
                  />
                  {catalogData && (
                    <span className="text-xs font-mono text-warm-400 dark:text-gray-500">
                      {catalogData.items.length} match{catalogData.items.length !== 1 ? 'es' : ''}
                    </span>
                  )}
                </div>

                {catalogData && catalogData.items.length > 0 && (
                  <>
                    <div className="mt-2 border border-dashed border-warm-300 dark:border-gray-600 rounded-lg max-h-48 overflow-y-auto divide-y divide-warm-100 dark:divide-gray-700">
                      {catalogData.items.map(item => (
                        <label
                          key={item.id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-warm-50 dark:hover:bg-gray-700 cursor-pointer text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={selectedCatalogItems.has(item.id)}
                            onChange={e => {
                              const next = new Set(selectedCatalogItems);
                              if (e.target.checked) next.add(item.id);
                              else next.delete(item.id);
                              setSelectedCatalogItems(next);
                            }}
                            className="rounded border-warm-300 dark:border-gray-600"
                          />
                          <span className="font-mono text-xs text-warm-400 dark:text-gray-500 w-14 flex-shrink-0">
                            #{item.code}
                          </span>
                          <span className="text-warm-800 dark:text-gray-200 truncate flex-1">
                            {item.name}
                          </span>
                          <span className={`w-3 h-3 rounded-sm ${getPriceBandColor(item.price)}`} />
                          <span className="font-semibold text-warm-700 dark:text-gray-300 w-16 text-right">
                            {formatPrice(item.price)}
                          </span>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={catalogQtys[item.id] || 1}
                            onChange={e => setCatalogQtys(prev => ({ ...prev, [item.id]: parseInt(e.target.value) || 1 }))}
                            className="w-12 px-1 py-0.5 rounded border border-warm-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-center text-xs font-mono text-warm-700 dark:text-gray-300"
                          />
                        </label>
                      ))}
                    </div>

                    <button
                      onClick={handleAddSelectedCatalogItems}
                      disabled={selectedCatalogItems.size === 0}
                      className="mt-2 w-full py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                    >
                      Add {selectedCatalogItems.size} selected → batch
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* ==================== RIGHT — Live Sheet Preview ==================== */}
            <div className="space-y-5">
              {/* Sheet Preview */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-4">
                <div className="flex items-baseline justify-between mb-3">
                  <div className="inline-flex items-center gap-1.5 text-xs font-mono text-warm-500 dark:text-gray-400 border border-warm-200 dark:border-gray-600 rounded-full px-2.5 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                    finda.sale · {sale?.title || '...'}
                  </div>
                  <span className="text-xs font-mono text-warm-400 dark:text-gray-500">
                    {Math.min(totalLabels, (state.currentPage + 1) * LABELS_PER_PAGE) - state.currentPage * LABELS_PER_PAGE} / {LABELS_PER_PAGE} used
                    {blanksOnPage > 0 && ` · ${blanksOnPage} blank${blanksOnPage !== 1 ? 's' : ''}`}
                  </span>
                </div>

                {/* Avery 5160 grid */}
                <div
                  className="bg-white border-2 border-warm-300 dark:border-gray-600 rounded-md mx-auto"
                  style={{ aspectRatio: '8.5 / 11', maxWidth: '100%' }}
                >
                  <div
                    className="grid h-full"
                    style={{
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gridTemplateRows: 'repeat(10, 1fr)',
                      gap: '1px',
                      padding: '4.5% 2.2%',
                    }}
                  >
                    {Array.from({ length: LABELS_PER_PAGE }).map((_, i) => {
                      const label = currentPageLabels[i];
                      if (!label) {
                        return (
                          <div
                            key={i}
                            className="border border-warm-200 rounded-sm flex items-center justify-center text-warm-300 text-[10px]"
                            style={{
                              background: 'repeating-linear-gradient(45deg, #f4efe2, #f4efe2 3px, #eee5cc 3px, #eee5cc 6px)',
                            }}
                          >
                            ·
                          </div>
                        );
                      }
                      return (
                        <div
                          key={i}
                          className={`border border-warm-200 rounded-sm flex items-center justify-center relative ${getPriceBandColor(label.price)}`}
                        >
                          {/* Mini QR placeholder */}
                          <div className="absolute left-[3px] top-[3px] w-[10px] h-[10px] bg-gray-800 opacity-40 rounded-[1px]" />
                          {/* Price */}
                          <span className="font-bold text-[11px] leading-none">
                            {formatPrice(label.price)}
                          </span>
                          {/* Date */}
                          <span className="absolute bottom-[2px] right-[3px] text-[6px] opacity-50 font-mono">
                            {saleDateRange}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-center gap-2 mt-3">
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => dispatch({ type: 'SET_PAGE', page: i })}
                      className={`w-6 h-6 rounded text-xs font-mono flex items-center justify-center border transition-colors ${
                        state.currentPage === i
                          ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
                          : 'border-warm-300 dark:border-gray-600 text-warm-600 dark:text-gray-400 hover:bg-warm-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <span className="text-xs font-mono text-warm-400 dark:text-gray-500">
                    {totalPages === 1 ? 'single sheet' : `${totalPages} sheets`}
                  </span>
                </div>
              </div>

              {/* Leftovers */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-4">
                <h2 className="text-sm font-semibold text-warm-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Leftovers
                </h2>
                <p className="text-xs text-warm-400 dark:text-gray-500 mb-3">
                  {blanksOnPage > 0
                    ? `${blanksOnPage} blank cell${blanksOnPage !== 1 ? 's' : ''} on this page. Don't waste label paper.`
                    : 'Page is full — no blanks to fill.'}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-warm-600 dark:text-gray-300">Fill blanks with:</span>
                  <select
                    value={state.leftoverFill ?? ''}
                    onChange={e =>
                      dispatch({
                        type: 'SET_LEFTOVER_FILL',
                        price: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    className="px-3 py-1.5 rounded-lg border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-warm-800 dark:text-gray-200"
                  >
                    <option value="">— leave blank —</option>
                    {prices.map(p => (
                      <option key={p} value={p}>
                        {formatPrice(p)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => dispatch({ type: 'APPLY_LEFTOVER_FILL' })}
                    disabled={state.leftoverFill === null || blanksOnPage <= 0}
                    className="px-4 py-1.5 rounded-lg border border-warm-300 dark:border-gray-600 text-sm font-semibold text-warm-700 dark:text-gray-300 hover:bg-warm-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Apply
                  </button>
                </div>
              </div>

              {/* Legend */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-4">
                <h2 className="text-sm font-semibold text-warm-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Legend
                </h2>
                <div className="flex flex-wrap gap-3 text-xs text-warm-600 dark:text-gray-400">
                  {[
                    { label: '$0.25–0.75', color: 'bg-stone-200' },
                    { label: '$1–2.50', color: 'bg-sky-200' },
                    { label: '$3–4.50', color: 'bg-pink-200' },
                    { label: '$5–9', color: 'bg-emerald-200' },
                    { label: '$10–15', color: 'bg-amber-300' },
                    { label: '$20–25', color: 'bg-orange-700' },
                  ].map(band => (
                    <span key={band.label} className="inline-flex items-center gap-1.5">
                      <span className={`w-3.5 h-3.5 rounded-sm border border-warm-300 dark:border-gray-600 ${band.color}`} />
                      {band.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Action Bar */}
          <div className="mt-6 flex items-center gap-3 flex-wrap">
            <button
              onClick={handlePrint}
              disabled={totalLabels === 0 || createBatchMutation.isPending}
              className="px-6 py-2.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
            >
              {createBatchMutation.isPending ? 'Generating...' : 'Print sheet'}
            </button>
            <button
              onClick={handleExportPdf}
              disabled={totalLabels === 0 || createBatchMutation.isPending}
              className="px-4 py-2.5 rounded-lg border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-gray-300 font-semibold text-sm hover:bg-warm-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Export PDF
            </button>
            <button
              onClick={handleSaveBatch}
              disabled={totalLabels === 0}
              className="px-4 py-2.5 rounded-lg text-warm-500 dark:text-gray-400 text-sm hover:text-warm-700 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Save batch
            </button>
            <button
              onClick={() => dispatch({ type: 'CLEAR' })}
              disabled={totalLabels === 0}
              className="px-4 py-2.5 rounded-lg text-red-400 text-sm hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Clear all
            </button>
            <span className="ml-auto text-xs font-mono text-warm-400 dark:text-gray-500">
              Avery 5160 · {totalLabels} labels · {totalPages} sheet{totalPages !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Saved Batches */}
          {savedBatches.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setShowSavedBatches(!showSavedBatches)}
                className="text-xs text-warm-500 dark:text-gray-400 hover:text-warm-700 dark:hover:text-gray-200 transition-colors"
              >
                {showSavedBatches ? '▾' : '▸'} Saved batches ({savedBatches.length})
              </button>
              {showSavedBatches && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {savedBatches.map(b => (
                    <div
                      key={b.key}
                      className="inline-flex items-center gap-1.5 bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm"
                    >
                      <span className="text-warm-700 dark:text-gray-300 font-medium">{b.name}</span>
                      <span className="text-xs text-warm-400 dark:text-gray-500">
                        ({b.itemCount} price{b.itemCount !== 1 ? 's' : ''})
                      </span>
                      <button
                        onClick={() => handleLoadBatch(b.key)}
                        className="ml-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 font-semibold"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => handleDeleteBatch(b.key, b.name)}
                        className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
