/**
 * Label Sheet Composer: batch QR pricetag builder for Avery 5160
 *
 * Two input modes:
 *   1. Preset chips: tap a cheat-sheet price, set qty, add to batch
 *   2. Pull from catalog: search priced items, select, add to batch
 *
 * Label styles: Standard (price tags) and Card (set, number, condition or grade, price). Card style
 * is offered only when the sale has at least one item with a card record. Card text and prices are
 * read by the server from the item records; this page only sends item ids and label counts.
 *
 * Output: PDF labels with real QR codes, formatted for Avery 5160 (3×10 = 30/page)
 */

import React, { useReducer, useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useOrganizerTier } from '../../../hooks/useOrganizerTier';
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

// Server-built lines for a card label (services/cardLabelText.ts). Display only.
interface CardLabelText {
  price: string;
  priceMissing: boolean;
  name: string;
  setLine: string;
  conditionLine: string;
}

type LabelStyle = 'standard' | 'card';

interface BatchItem {
  id: string;
  price: number;
  qty: number;
  source:
    | { kind: 'preset' }
    | {
        kind: 'item';
        itemId: string;
        itemCode: string;
        itemName: string;
        room?: string | null;
        priceMissing?: boolean;
        labelText?: CardLabelText | null;
      };
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
  price: number | null;
  priceMissing?: boolean;
  category: string | null;
  room: string | null;
  needsTag: boolean;
  labelText?: CardLabelText | null;
  defaultQty?: number;
}

interface CatalogResponse {
  items: CatalogItem[];
  nextCursor: string | null;
  saleHasCards?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const LABELS_PER_PAGE = 30;
const COLS = 3;
const ROWS = 10;

// ---------------------------------------------------------------------------
// Color band mapping: preview only
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

// Price text for a batch row. An item with no price prints PRICE? on the label, so the page shows the same.
function rowPriceText(item: BatchItem): string {
  if (item.source.kind === 'item' && item.source.priceMissing) return 'PRICE?';
  return formatPrice(item.price);
}

function getErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' && message.length > 0 ? message : fallback;
}

const TEAMS_UPGRADE_COPY =
  'The TEAMS plan can pick a consignor and print price labels that credit that consignor at checkout.';

function isTeamsRequiredError(err: unknown): boolean {
  const e = err as { response?: { status?: number; data?: { code?: unknown } } };
  return e?.response?.status === 403 && e?.response?.data?.code === 'TEAMS_REQUIRED';
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
  | { type: 'ADD_ITEMS'; items: Array<{ itemId: string; code: string; name: string; price: number; qty: number; room?: string | null; priceMissing?: boolean; labelText?: CardLabelText | null }> }
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
            source: {
              kind: 'item',
              itemId: item.itemId,
              itemCode: item.code,
              itemName: item.name,
              room: item.room ?? null,
              priceMissing: item.priceMissing ?? false,
              labelText: item.labelText ?? null,
            },
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
  const { tier } = useOrganizerTier();
  const { showToast } = useToast();

  const [state, dispatch] = useReducer(batchReducer, initialState);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCatalogItems, setSelectedCatalogItems] = useState<Set<string>>(new Set());
  const [catalogQtys, setCatalogQtys] = useState<Record<string, number>>({});
  // Raw-text mirror per item so the qty field can go through an empty
  // intermediate state while typing instead of snapping back to 1 on every
  // keystroke. Committed (parsed + clamped) into catalogQtys on blur.
  const [catalogQtyText, setCatalogQtyText] = useState<Record<string, string>>({});
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [savedBatches, setSavedBatches] = useState<Array<{ key: string; name: string; itemCount: number }>>([]);
  const [showSavedBatches, setShowSavedBatches] = useState(false);
  // Partial-sheet support: first usable label slot (1–30, 1 = top-left / normal).
  const [startPosition, setStartPosition] = useState(1);
  const [startPosExpanded, setStartPosExpanded] = useState(false);
  // Custom fill-in price for items that don't match any preset chip.
  const [customPrice, setCustomPrice] = useState('');
  // Label style. Card is only honored when the sale has card records (see effectiveStyle below).
  const [labelStyle, setLabelStyle] = useState<LabelStyle>('standard');
  // Last failed print or export, shown inline so the selection and the message stay on screen.
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionUpgrade, setActionUpgrade] = useState(false); // TEAMS_REQUIRED came back: show the upgrade link
  // Consignor price tags (2026-10-06): optional consignor for the price-only labels of this sheet. Plain useState (the
  // BatchState reducer and the price-only merge key are untouched), persisted under its own localStorage key.
  const [consignorId, setConsignorId] = useState('');
  const [consignorRestored, setConsignorRestored] = useState(false);
  const [consignorChangedWithRows, setConsignorChangedWithRows] = useState(false);

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
  const { data: cheatsheetData } = useQuery<{ prices: number[]; consignorTagsEnabled?: boolean }>({
    queryKey: ['cheatsheet', saleId],
    queryFn: async () => {
      const res = await api.get(`/organizers/${saleId}/cheatsheet`);
      return res.data;
    },
    enabled: !!saleId && typeof saleId === 'string',
  });

  const prices = cheatsheetData?.prices || [];

  // Consignor picker: TEAMS tier AND the server says the feature is on. The list endpoint hides archived consignors.
  const consignorFeatureOn = cheatsheetData?.consignorTagsEnabled === true;
  const showConsignorPicker = tier === 'TEAMS' && consignorFeatureOn;
  // Lower tiers are urged to upgrade instead of seeing nothing (only when the feature is on).
  const showConsignorUpgrade = tier !== 'TEAMS' && consignorFeatureOn;
  const { data: consignorOptions } = useQuery({
    queryKey: ['consignors-for-label-composer'],
    queryFn: async () => {
      const response = await api.get('/consignors');
      return response.data as Array<{ id: string; name: string }>;
    },
    enabled: showConsignorPicker,
    staleTime: 60 * 1000,
  });
  // A remembered consignor that was archived or removed since is ignored rather than sent to the server.
  const activeConsignorId =
    showConsignorPicker && consignorId && (consignorOptions ?? []).some((c) => c.id === consignorId) ? consignorId : '';

  // Does this sale have any item with a card record? Decides whether the Card style is offered.
  const {
    data: cardProbe,
    isLoading: cardProbeLoading,
  } = useQuery<CatalogResponse>({
    queryKey: ['label-card-probe', saleId],
    queryFn: async () => {
      const res = await api.get(`/organizers/${saleId}/items-for-labels`, { params: { limit: 1 } });
      return res.data;
    },
    enabled: !!saleId && typeof saleId === 'string',
    staleTime: 60 * 1000,
  });
  const saleHasCards = cardProbe?.saleHasCards === true;
  const effectiveStyle: LabelStyle = saleHasCards ? labelStyle : 'standard';
  const cardMode = effectiveStyle === 'card';

  // Catalog search. Card style lists the sale's card items right away; standard style waits for a search.
  const {
    data: catalogData,
    isLoading: catalogLoading,
    isError: catalogError,
    error: catalogErr,
    refetch: refetchCatalog,
  } = useQuery<CatalogResponse>({
    queryKey: ['items-for-labels', saleId, effectiveStyle, searchQuery],
    queryFn: async () => {
      const res = await api.get(`/organizers/${saleId}/items-for-labels`, {
        params: cardMode ? { q: searchQuery, limit: 50, style: 'card' } : { q: searchQuery, limit: 20 },
      });
      return res.data;
    },
    enabled: !!saleId && typeof saleId === 'string' && (searchQuery.length > 0 || cardMode),
  });

  // Batch creation mutation
  const createBatchMutation = useMutation({
    mutationFn: async () => {
      // Item rows send the item id and a count only: the server reads price, name, room and card
      // details from the database. Preset rows have no database row, so they carry their price.
      const res = await api.post(`/organizers/${saleId}/label-batch`, {
        items: state.items.map(i =>
          i.source.kind === 'item'
            ? { qty: i.qty, source: { kind: 'item', itemId: i.source.itemId } }
            : { price: i.price, qty: i.qty, source: { kind: 'preset' } }
        ),
        leftoverFill: state.leftoverFill,
        startPosition,
        labelStyle: effectiveStyle,
        ...(activeConsignorId ? { consignorId: activeConsignorId } : {}),
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

  // Consignor choice: remembered per sale under its own key (all storage access guarded).
  useEffect(() => {
    if (!saleId || typeof saleId !== 'string' || consignorRestored) return;
    try {
      const saved = localStorage.getItem(`label-composer-consignor-${saleId}`);
      if (saved) setConsignorId(saved);
    } catch {}
    setConsignorRestored(true);
  }, [saleId, consignorRestored]);
  useEffect(() => {
    if (!saleId || typeof saleId !== 'string' || !consignorRestored) return;
    try {
      if (consignorId) localStorage.setItem(`label-composer-consignor-${saleId}`, consignorId);
      else localStorage.removeItem(`label-composer-consignor-${saleId}`);
    } catch {}
  }, [consignorId, saleId, consignorRestored]);

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

  // Keyboard shortcuts (handler refs resolved at call time: safe to declare before handlePrint/handleSaveBatch)
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
  const totalPages = Math.max(1, Math.ceil((totalLabels + (startPosition - 1)) / LABELS_PER_PAGE));
  const currentPageLabels = useMemo(() => {
    // Flatten batch into individual label entries in insertion order
    const flat: Array<{ price: number; priceMissing: boolean; source: BatchItem['source']; room: string | null; name: string | null } | null> = [];
    // Leading skip-slots so the preview starts on the chosen start position (mirrors the PDF).
    const skip = Math.max(1, Math.min(startPosition, LABELS_PER_PAGE)) - 1;
    for (let i = 0; i < skip; i++) flat.push(null);
    for (const item of state.items) {
      const room = item.source.kind === 'item' ? (item.source.room ?? null) : null;
      const name = item.source.kind === 'item' ? (item.source.itemName ?? null) : null;
      const priceMissing = item.source.kind === 'item' && item.source.priceMissing === true;
      for (let i = 0; i < item.qty; i++) {
        flat.push({ price: item.price, priceMissing, source: item.source, room, name });
      }
    }
    const start = state.currentPage * LABELS_PER_PAGE;
    return flat.slice(start, start + LABELS_PER_PAGE);
  }, [state.items, state.currentPage, startPosition]);

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

  // Auth redirect
  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  // Handlers
  const handlePrint = async () => {
    if (totalLabels === 0) {
      showToast('Add labels to the batch first', 'error');
      return;
    }
    setActionError(null);
    setActionUpgrade(false);
    try {
      const result = await createBatchMutation.mutateAsync();
      const response = await api.get(`/organizers/batches/${result.batchId}/print`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      // The selection stays as it is; the server's message (for example an item no longer in this sale) is shown.
      const teamsRequired = isTeamsRequiredError(err);
      const message = teamsRequired ? TEAMS_UPGRADE_COPY : getErrorMessage(err, 'Failed to generate labels');
      setActionUpgrade(teamsRequired);
      setActionError(message);
      showToast(message, 'error');
    }
  };

  const handleExportPdf = async () => {
    if (totalLabels === 0) {
      showToast('Add labels to the batch first', 'error');
      return;
    }
    setActionError(null);
    setActionUpgrade(false);
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
      const teamsRequired = isTeamsRequiredError(err);
      const message = teamsRequired ? TEAMS_UPGRADE_COPY : getErrorMessage(err, 'Failed to export PDF');
      setActionUpgrade(teamsRequired);
      setActionError(message);
      showToast(message, 'error');
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

  // Card style starts each row at the remaining stock (server-computed); standard style starts at 1.
  const defaultQtyFor = (item: CatalogItem): number => (cardMode ? Math.max(1, item.defaultQty ?? 1) : 1);

  const handleAddSelectedCatalogItems = () => {
    if (!catalogData) return;
    const toAdd = catalogData.items
      .filter(i => selectedCatalogItems.has(i.id))
      .map(i => ({
        itemId: i.id,
        code: i.code,
        name: i.name,
        price: i.price ?? 0,
        priceMissing: i.priceMissing === true || i.price == null,
        labelText: i.labelText ?? null,
        room: i.room ?? null,
        qty: catalogQtys[i.id] || defaultQtyFor(i),
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
        <title>{`Label Composer, ${sale?.title || 'Loading'} | finda.sale`}</title>
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-warm-200 dark:border-gray-700 px-4 py-3 sticky top-24 lg:top-16 z-30">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
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
                 , {sale.title}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-xs text-warm-400 dark:text-gray-500 font-mono">
                Ctrl+P print · Ctrl+S save
              </span>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-6">
            {/* ==================== LEFT: Tag Mixer ==================== */}
            <div className="space-y-5 min-w-0">
              {/* Label style: Card is offered only when the sale has at least one item with a card record */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-4">
                <h2 className="text-sm font-semibold text-warm-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  Label style
                </h2>
                {cardProbeLoading ? (
                  <div className="flex gap-2" aria-busy="true" aria-label="Loading label styles">
                    <div className="h-11 w-28 rounded-lg bg-warm-100 dark:bg-gray-700 animate-pulse" />
                    <div className="h-11 w-24 rounded-lg bg-warm-100 dark:bg-gray-700 animate-pulse" />
                  </div>
                ) : (
                  <div role="radiogroup" aria-label="Label style" className="flex flex-wrap gap-2">
                    {([
                      { value: 'standard', label: 'Standard' },
                      ...(saleHasCards ? [{ value: 'card', label: 'Card' }] : []),
                    ] as Array<{ value: LabelStyle; label: string }>).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={effectiveStyle === opt.value}
                        onClick={() => setLabelStyle(opt.value)}
                        className={`min-h-[44px] px-5 rounded-lg border text-sm font-semibold transition-colors ${
                          effectiveStyle === opt.value
                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
                            : 'bg-white dark:bg-gray-700 text-warm-800 dark:text-gray-200 border-warm-300 dark:border-gray-600 hover:border-warm-400 dark:hover:border-gray-500'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
                {!cardProbeLoading && !saleHasCards && (
                  <p className="text-xs text-warm-400 dark:text-gray-500 mt-2">
                    Add card details to items to use card labels
                  </p>
                )}
                {cardMode && (
                  <p className="text-xs text-warm-500 dark:text-gray-400 mt-2">
                    Card labels print the set, number, condition or grade, and the price saved on each item. Items without card details print as standard labels.
                  </p>
                )}
              </div>

              {/* Price Presets */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-4">
                <h2 className="text-sm font-semibold text-warm-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  1. Pick a price
                </h2>
                {showConsignorUpgrade && (
                  <div className="mb-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
                    <p className="text-sm font-medium text-warm-900 dark:text-white">Consignor price labels</p>
                    <p className="text-xs text-warm-700 dark:text-gray-300 mt-1">{TEAMS_UPGRADE_COPY}</p>
                    <Link
                      href="/pricing"
                      className="mt-2 inline-flex items-center justify-center min-h-[44px] sm:min-h-0 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition-colors"
                    >
                      Upgrade to TEAMS
                    </Link>
                  </div>
                )}
                {showConsignorPicker && (
                  <div className="mb-3">
                    <label htmlFor="label-consignor" className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">
                      Consignor for price labels (optional)
                    </label>
                    <select
                      id="label-consignor"
                      value={activeConsignorId}
                      onChange={(e) => {
                        setConsignorId(e.target.value);
                        if (state.items.some((i) => i.source.kind === 'preset') || state.leftoverFill !== null) {
                          setConsignorChangedWithRows(true);
                        }
                      }}
                      className="w-full min-h-[44px] sm:min-h-0 rounded-lg border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-warm-900 dark:text-white px-3 py-2 text-sm"
                    >
                      <option value="">No consignor</option>
                      {(consignorOptions ?? []).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-warm-500 dark:text-gray-400 mt-1">
                      Applies to price-only labels. Item labels are unchanged.
                    </p>
                    {consignorChangedWithRows && (
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                        Applies to every price label on this sheet.
                      </p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {prices.map(p => (
                    <button
                      key={p}
                      onClick={() => dispatch({ type: 'SELECT_PRICE', price: p })}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 min-h-[44px] sm:min-h-0 rounded-full text-sm font-semibold border transition-colors ${
                        state.selectedPrice === p
                          ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
                          : 'bg-white dark:bg-gray-700 text-warm-800 dark:text-gray-200 border-warm-300 dark:border-gray-600 hover:border-warm-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${getPriceBandDot(p)}`} />
                      {formatPrice(p)}
                    </button>
                  ))}
                  {/* Custom fill-in price: for items whose price doesn't match any preset chip.
                      Dispatches the exact same SELECT_PRICE action the presets use, so it flows
                      through Add to batch / Fill rest / PDF generation with no other changes. */}
                  <div
                    className={`inline-flex items-center gap-1 px-2 py-1 min-h-[44px] sm:min-h-0 rounded-full text-sm font-semibold border transition-colors bg-white dark:bg-gray-700 text-warm-800 dark:text-gray-200 ${
                      state.selectedPrice !== null && !prices.includes(state.selectedPrice)
                        ? 'border-gray-900 dark:border-white'
                        : 'border-warm-300 dark:border-gray-600 border-dashed hover:border-warm-400 dark:hover:border-gray-500'
                    }`}
                  >
                    <span className="text-warm-400 dark:text-gray-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={customPrice}
                      onChange={(e) => setCustomPrice(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        const parsed = parseFloat(customPrice);
                        if (Number.isFinite(parsed) && parsed > 0) {
                          dispatch({ type: 'SELECT_PRICE', price: parsed });
                        }
                      }}
                      placeholder="Custom"
                      className="w-14 bg-transparent focus:outline-none text-warm-900 dark:text-white placeholder-warm-400 dark:placeholder-gray-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const parsed = parseFloat(customPrice);
                        if (Number.isFinite(parsed) && parsed > 0) {
                          dispatch({ type: 'SELECT_PRICE', price: parsed });
                        }
                      }}
                      className="text-xs font-semibold text-warm-500 dark:text-gray-400 hover:text-warm-700 dark:hover:text-gray-200 px-2 min-h-[44px] sm:min-h-0"
                    >
                      Use
                    </button>
                  </div>
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
                      className="px-3 py-2 min-h-[44px] sm:min-h-0 rounded-lg border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-warm-800 dark:text-gray-200 font-semibold text-sm hover:bg-warm-50 dark:hover:bg-gray-600 transition-colors"
                    >
                      +{n}
                    </button>
                  ))}
                  <button
                    onClick={() => dispatch({ type: 'SET_QTY', qty: 0 })}
                    className="px-3 py-2 min-h-[44px] sm:min-h-0 rounded-lg border border-warm-200 dark:border-gray-700 text-warm-400 dark:text-gray-500 text-sm hover:text-warm-600 dark:hover:text-gray-300 transition-colors"
                  >
                    clear
                  </button>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => dispatch({ type: 'ADD_TO_BATCH' })}
                    disabled={state.selectedPrice === null || state.qty <= 0}
                    className="flex-1 py-2.5 min-h-[44px] rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                  >
                    Add to batch →
                  </button>
                  <button
                    onClick={() => dispatch({ type: 'FILL_REST' })}
                    disabled={state.selectedPrice === null}
                    className="px-4 py-2.5 min-h-[44px] rounded-lg border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-gray-300 text-sm font-semibold hover:bg-warm-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                    No labels yet. Pick a price and add to batch.
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
                        className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 px-1 cursor-grab active:cursor-grabbing ${
                          dragIdx === idx ? 'opacity-50' : ''
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded-sm border border-warm-300 dark:border-gray-600 flex-shrink-0 ${getPriceBandColor(item.price)}`} />
                        <span className="font-semibold text-warm-900 dark:text-white min-w-[60px]">
                          {rowPriceText(item)}
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
                            className="w-11 h-11 sm:w-6 sm:h-6 rounded border border-warm-300 dark:border-gray-600 text-warm-600 dark:text-gray-400 text-xs flex items-center justify-center hover:bg-warm-50 dark:hover:bg-gray-700"
                          >
                            −
                          </button>
                          <button
                            onClick={() => dispatch({ type: 'UPDATE_ROW_QTY', id: item.id, delta: 1 })}
                            className="w-11 h-11 sm:w-6 sm:h-6 rounded border border-warm-300 dark:border-gray-600 text-warm-600 dark:text-gray-400 text-xs flex items-center justify-center hover:bg-warm-50 dark:hover:bg-gray-700"
                          >
                            +
                          </button>
                          <button
                            onClick={() => dispatch({ type: 'REMOVE_ROW', id: item.id })}
                            aria-label="Remove row"
                            className="w-11 h-11 sm:w-6 sm:h-6 rounded border border-red-300 dark:border-red-800 text-red-500 dark:text-red-400 text-xs flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/30"
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

              {/* Pull from Priced Items (card style: Pull from card items) */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-4">
                <h2 className="text-sm font-semibold text-warm-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  {cardMode ? 'Pull from card items' : 'Pull from priced items'}
                </h2>
                <p className="text-xs text-warm-400 dark:text-gray-500 mb-3">
                  {cardMode
                    ? 'Items with card details. The label count starts at the copies still in stock. Prices come from your item records.'
                    : 'Search your catalog. Items already priced get their tag added at the listed price.'}
                </p>

                <div className="flex items-center gap-2 bg-warm-50 dark:bg-gray-900 border border-warm-200 dark:border-gray-700 rounded-lg px-3 py-2 min-h-[44px]">
                  <span className="text-warm-400 dark:text-gray-500 text-sm">⌕</span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={cardMode ? 'Search card items...' : 'Search items...'}
                    className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-warm-900 dark:text-white placeholder-warm-400 dark:placeholder-gray-500"
                   aria-label={cardMode ? 'Search card items' : 'Search items'} />
                  {catalogData && (
                    <span className="text-xs font-mono text-warm-400 dark:text-gray-500 flex-shrink-0">
                      {catalogData.items.length} match{catalogData.items.length !== 1 ? 'es' : ''}
                    </span>
                  )}
                </div>

                {/* Loading: skeleton rows */}
                {catalogLoading && (
                  <div className="mt-2 space-y-2" aria-busy="true" aria-label="Loading items">
                    {[0, 1, 2].map(n => (
                      <div key={n} className="h-14 rounded-lg bg-warm-100 dark:bg-gray-700 animate-pulse" />
                    ))}
                  </div>
                )}

                {/* Error: message and retry; the batch and selection are untouched */}
                {catalogError && !catalogLoading && (
                  <div role="alert" className="mt-2 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">
                    <p>{getErrorMessage(catalogErr, 'Could not load items.')}</p>
                    <button
                      type="button"
                      onClick={() => { void refetchCatalog(); }}
                      className="mt-2 min-h-[44px] px-4 rounded-lg border border-red-300 dark:border-red-700 font-semibold hover:bg-red-100 dark:hover:bg-red-900/40"
                    >
                      Try again
                    </button>
                  </div>
                )}

                {/* Empty */}
                {catalogData && !catalogLoading && !catalogError && catalogData.items.length === 0 && (
                  <p className="mt-2 text-sm text-warm-500 dark:text-gray-400 py-3 text-center">
                    {searchQuery.length > 0
                      ? (cardMode ? 'No card items match that search.' : 'No priced items match that search.')
                      : 'No card items in this sale yet. Add card details to items to use card labels.'}
                  </p>
                )}

                {catalogData && !catalogLoading && !catalogError && catalogData.items.length > 0 && (
                  <>
                    <div className={`mt-2 border border-dashed border-warm-300 dark:border-gray-600 rounded-lg overflow-y-auto overflow-x-hidden divide-y divide-warm-100 dark:divide-gray-700 ${cardMode ? 'max-h-96' : 'max-h-48'}`}>
                      {catalogData.items.map(item => {
                        const qtyValue = catalogQtyText[item.id] ?? String(catalogQtys[item.id] || defaultQtyFor(item));
                        const commitQty = () => {
                          const parsed = Math.min(300, Math.max(1, parseInt(qtyValue, 10) || 1));
                          setCatalogQtyText(prev => ({ ...prev, [item.id]: String(parsed) }));
                          setCatalogQtys(prev => ({ ...prev, [item.id]: parsed }));
                        };
                        const toggle = (checked: boolean) => {
                          const next = new Set(selectedCatalogItems);
                          if (checked) next.add(item.id);
                          else next.delete(item.id);
                          setSelectedCatalogItems(next);
                        };
                        const missing = item.priceMissing === true || item.price == null;

                        if (cardMode) {
                          const lt = item.labelText;
                          const detail = [lt?.setLine, lt?.conditionLine].filter(Boolean).join('  ·  ');
                          return (
                            <div
                              key={item.id}
                              className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2 hover:bg-warm-50 dark:hover:bg-gray-700 text-sm"
                            >
                              <label className="flex items-start gap-3 flex-1 min-w-0 min-h-[44px] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedCatalogItems.has(item.id)}
                                  onChange={e => toggle(e.target.checked)}
                                  className="mt-2.5 h-5 w-5 flex-shrink-0 rounded border-warm-300 dark:border-gray-600"
                                />
                                <span className="min-w-0 py-2">
                                  <span className="block font-semibold text-warm-900 dark:text-white truncate">
                                    {lt?.name || item.name}
                                  </span>
                                  <span className="block text-xs font-mono text-warm-500 dark:text-gray-400 truncate">
                                    {detail || `#${item.code}`}
                                  </span>
                                </span>
                              </label>
                              <div className="flex items-center justify-between sm:justify-end gap-3">
                                {missing ? (
                                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-400" title="This item has no price. Its label prints PRICE? until you set one.">
                                    No price, prints PRICE?
                                  </span>
                                ) : (
                                  <span className="font-semibold text-warm-700 dark:text-gray-300">
                                    {formatPrice(item.price as number)}
                                  </span>
                                )}
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  max={300}
                                  value={qtyValue}
                                  onChange={e => setCatalogQtyText(prev => ({ ...prev, [item.id]: e.target.value }))}
                                  onBlur={commitQty}
                                  aria-label={`Labels to print for ${lt?.name || item.name}`}
                                  className="w-20 min-h-[44px] px-2 rounded border border-warm-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-center text-sm font-mono text-warm-700 dark:text-gray-300"
                                />
                              </div>
                            </div>
                          );
                        }

                        return (
                          <label
                            key={item.id}
                            className="flex items-center gap-2 px-3 py-2 hover:bg-warm-50 dark:hover:bg-gray-700 cursor-pointer text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={selectedCatalogItems.has(item.id)}
                              onChange={e => toggle(e.target.checked)}
                              className="rounded border-warm-300 dark:border-gray-600"
                            />
                            <span className="font-mono text-xs text-warm-400 dark:text-gray-500 w-14 flex-shrink-0">
                              #{item.code}
                            </span>
                            <span className="text-warm-800 dark:text-gray-200 truncate flex-1">
                              {item.name}
                            </span>
                            <span className={`w-3 h-3 rounded-sm ${getPriceBandColor(item.price ?? 0)}`} />
                            <span className="font-semibold text-warm-700 dark:text-gray-300 w-16 text-right">
                              {formatPrice(item.price ?? 0)}
                            </span>
                            <input
                              type="number"
                              min={1}
                              max={300}
                              value={qtyValue}
                              onChange={e => setCatalogQtyText(prev => ({ ...prev, [item.id]: e.target.value }))}
                              onBlur={commitQty}
                              className="w-12 px-1 py-0.5 rounded border border-warm-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-center text-xs font-mono text-warm-700 dark:text-gray-300"
                            />
                          </label>
                        );
                      })}
                    </div>

                    {catalogData.nextCursor && (
                      <p className="mt-1 text-xs text-warm-400 dark:text-gray-500">
                        Showing the first {catalogData.items.length}. Search to narrow the list.
                      </p>
                    )}

                    <button
                      onClick={handleAddSelectedCatalogItems}
                      disabled={selectedCatalogItems.size === 0}
                      className="mt-2 w-full py-2 min-h-[44px] rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                    >
                      Add {selectedCatalogItems.size} selected → batch
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* ==================== RIGHT: Live Sheet Preview ==================== */}
            <div className="space-y-5 min-w-0">
              {/* Starting position: collapsed by default, ABOVE the preview */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setStartPosExpanded((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 min-h-[44px] text-left"
                  aria-expanded={startPosExpanded}
                >
                  <span className="text-sm font-medium text-warm-700 dark:text-gray-200">
                    {startPosition === 1
                      ? 'Expand to choose starting label'
                      : `Starting at label ${startPosition} · skipping ${startPosition - 1}`}
                  </span>
                  <span className="text-warm-400 dark:text-gray-500 text-xs ml-2">{startPosExpanded ? '▲' : '▼'}</span>
                </button>
                {startPosExpanded && (
                  <div className="px-4 pb-4">
                    <p className="text-xs text-warm-400 dark:text-gray-500 mb-3">
                      Already peeled a few labels off this sheet? Tap the first blank slot. Labels before it are skipped so your printout lines up. (Counts left-to-right, top-to-bottom.)
                    </p>
                    <div className="grid grid-cols-3 gap-1 w-48 sm:w-32 mb-2">
                      {Array.from({ length: LABELS_PER_PAGE }).map((_, i) => {
                        const slot = i + 1;
                        const isSkipped = slot < startPosition;
                        const isStart = slot === startPosition;
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => setStartPosition(slot)}
                            title={`Start at slot ${slot}`}
                            className={`h-11 sm:h-5 rounded-sm border text-xs sm:text-[8px] flex items-center justify-center transition-colors ${
                              isStart
                                ? 'bg-amber-500 border-amber-600 text-white font-bold'
                                : isSkipped
                                ? 'bg-warm-200 dark:bg-gray-600 border-warm-300 dark:border-gray-500 text-warm-400 dark:text-gray-400'
                                : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                            }`}
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-warm-600 dark:text-gray-300">
                      {startPosition === 1
                        ? 'Starting at the top-left (full sheet).'
                        : `Skipping ${startPosition - 1} used slot${startPosition - 1 !== 1 ? 's' : ''}. Printing starts at position ${startPosition}.`}
                      {startPosition !== 1 && (
                        <button
                          type="button"
                          onClick={() => setStartPosition(1)}
                          className="ml-2 underline text-amber-700 dark:text-amber-400"
                        >
                          Reset
                        </button>
                      )}
                    </p>
                  </div>
                )}
              </div>

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

                {/* Avery 5160 grid. The preview scrolls sideways inside its own box so the page never does. */}
                <div className="overflow-x-auto">
                <div
                  className="bg-white border-2 border-warm-300 dark:border-gray-600 rounded-md mx-auto"
                  style={{ aspectRatio: '8.5 / 11', maxWidth: '100%', minWidth: cardMode ? 480 : undefined }}
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
                          className={`border border-warm-200 rounded-sm flex items-center justify-center relative ${
                            label.priceMissing ? 'bg-amber-100' : getPriceBandColor(label.price)
                          }`}
                        >
                          {/* Mini QR placeholder */}
                          <div className="absolute left-[3px] top-[3px] w-[10px] h-[10px] bg-gray-800 opacity-40 rounded-[1px]" />
                          {/* Date: moved to top-right corner */}
                          {!(cardMode && label.source.kind === 'item' && label.source.labelText) && (
                            <span className="absolute top-[2px] right-[3px] text-[6px] opacity-90 font-mono">
                              {saleDateRange}
                            </span>
                          )}
                          {/* Card layout: lines built by the server (price, name, set and number, condition or grade) */}
                          {cardMode && label.source.kind === 'item' && label.source.labelText ? (
                            <div className="flex flex-col justify-center w-full min-w-0 pl-[16px] pr-[3px] text-left leading-tight">
                              <span className="font-bold text-[11px] leading-none">{label.source.labelText.price}</span>
                              <span className="text-[7px] font-semibold truncate">{label.source.labelText.name}</span>
                              <span className="text-[6px] font-mono truncate whitespace-pre">{label.source.labelText.setLine}</span>
                              <span className="text-[6px] font-bold truncate">{label.source.labelText.conditionLine}</span>
                            </div>
                          ) : (
                          /* Price + item name */
                          <div className="flex flex-col items-center justify-center w-full px-[10px]">
                            <span className="font-bold text-[11px] leading-none">
                              {label.priceMissing ? 'PRICE?' : formatPrice(label.price)}
                            </span>
                            {label.name ? (
                              <span
                                className="text-[8px] leading-tight max-w-full mt-[1px] text-center"
                                style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                              >
                                {label.name}
                              </span>
                            ) : null}
                          </div>
                          )}
                          {/* Room: per-item; rendered where the date used to be */}
                          {label.room && !(cardMode && label.source.kind === 'item' && label.source.labelText) ? (
                            <span className="absolute bottom-[2px] right-[3px] left-[3px] text-[6px] opacity-90 font-mono truncate text-right">
                              {label.room}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-center gap-2 mt-3">
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => dispatch({ type: 'SET_PAGE', page: i })}
                      className={`w-11 h-11 sm:w-6 sm:h-6 rounded text-xs font-mono flex items-center justify-center border transition-colors ${
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
                    : 'Page is full. No blanks to fill.'}
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
                    className="px-3 py-1.5 min-h-[44px] rounded-lg border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-warm-800 dark:text-gray-200"
                  >
                    <option value="">Leave blank</option>
                    {prices.map(p => (
                      <option key={p} value={p}>
                        {formatPrice(p)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => dispatch({ type: 'APPLY_LEFTOVER_FILL' })}
                    disabled={state.leftoverFill === null || blanksOnPage <= 0}
                    className="px-4 py-1.5 min-h-[44px] rounded-lg border border-warm-300 dark:border-gray-600 text-sm font-semibold text-warm-700 dark:text-gray-300 hover:bg-warm-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
              className="px-6 py-2.5 min-h-[44px] rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
            >
              {createBatchMutation.isPending ? 'Generating...' : 'Print sheet'}
            </button>
            <button
              onClick={handleExportPdf}
              disabled={totalLabels === 0 || createBatchMutation.isPending}
              className="px-4 py-2.5 min-h-[44px] rounded-lg border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-gray-300 font-semibold text-sm hover:bg-warm-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Export PDF
            </button>
            <button
              onClick={handleSaveBatch}
              disabled={totalLabels === 0}
              className="px-4 py-2.5 min-h-[44px] rounded-lg text-warm-500 dark:text-gray-400 text-sm hover:text-warm-700 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Save batch
            </button>
            <button
              onClick={() => dispatch({ type: 'CLEAR' })}
              disabled={totalLabels === 0}
              className="px-4 py-2.5 min-h-[44px] rounded-lg text-red-400 text-sm hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Clear all
            </button>
            <span className="ml-auto text-xs font-mono text-warm-400 dark:text-gray-500">
              Avery 5160 · {totalLabels} labels · {totalPages} sheet{totalPages !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Print or export failed: server message stays on screen, the batch is untouched */}
          {actionError && (
            <div role="alert" className="mt-3 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {actionError}
              {actionUpgrade && (
                <>
                  {' '}
                  <Link href="/pricing" className="font-semibold underline">Upgrade to TEAMS</Link>
                </>
              )}
            </div>
          )}

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
                        className="ml-1 px-2 min-h-[44px] sm:min-h-0 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 font-semibold"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => handleDeleteBatch(b.key, b.name)}
                        aria-label={`Delete saved batch ${b.name}`}
                        className="px-2 min-h-[44px] sm:min-h-0 text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300"
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
