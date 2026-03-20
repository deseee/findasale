/**
 * Typology Management Page — Feature #46: Treasure Typology Classifier
 *
 * Route: /organizer/typology
 * Tier: PRO+
 *
 * Organizer selects a sale, sees items with AI-assigned typology categories,
 * can trigger classification (per-item or batch), and correct AI decisions.
 */

import React, { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../components/AuthContext';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import { useToast } from '../../components/ToastContext';
import TypologyBadge from '../../components/TypologyBadge';
import Skeleton from '../../components/Skeleton';
import TierGate from '../../components/TierGate';
import {
  useItemTypology,
  useClassifyItem,
  useBatchClassifySale,
  useUpdateTypology,
  ALL_TYPOLOGY_CATEGORIES,
  TYPOLOGY_LABELS,
  TypologyCategory,
} from '../../hooks/useTypology';
import api from '../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Sale {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
}

interface Item {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  category: string | null;
  photoUrls: string[];
}

// ─── Item Row ─────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: Item;
}

function ItemRow({ item }: ItemRowProps) {
  const { showToast } = useToast();
  const [showCorrectForm, setShowCorrectForm] = useState(false);
  const [correctedTo, setCorrectedTo] = useState<TypologyCategory>('OTHER');
  const [reason, setReason] = useState('');

  const { data: typology, isLoading } = useItemTypology(item.id);
  const classifyMutation = useClassifyItem();
  const updateMutation = useUpdateTypology();

  const handleClassify = async () => {
    try {
      await classifyMutation.mutateAsync(item.id);
      showToast('Item classified successfully', 'success');
    } catch {
      showToast('Classification failed — item may have no photos', 'error');
    }
  };

  const handleCorrect = async () => {
    if (!reason.trim()) {
      showToast('Please provide a reason for the correction', 'error');
      return;
    }
    try {
      await updateMutation.mutateAsync({ itemId: item.id, correctedTo, reason });
      showToast('Correction saved', 'success');
      setShowCorrectForm(false);
      setReason('');
    } catch {
      showToast('Failed to save correction', 'error');
    }
  };

  const thumb = item.photoUrls?.[0];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-4">
      <div className="flex gap-4">
        {/* Thumbnail */}
        {thumb ? (
          <img
            src={thumb}
            alt={item.title}
            className="w-16 h-16 rounded-md object-cover flex-shrink-0 bg-gray-100"
          />
        ) : (
          <div className="w-16 h-16 rounded-md flex-shrink-0 bg-warm-100 dark:bg-gray-700 flex items-center justify-center text-warm-400 text-xs text-center">
            No photo
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-warm-900 dark:text-white truncate">{item.title}</p>
          {item.price != null && (
            <p className="text-sm text-warm-500 dark:text-gray-400">${item.price.toFixed(2)}</p>
          )}

          {/* Typology status */}
          <div className="mt-2">
            {isLoading ? (
              <Skeleton className="h-5 w-32" />
            ) : typology ? (
              <TypologyBadge
                primaryCategory={typology.organizer_correctedTo ?? typology.primaryCategory}
                confidence={typology.primaryConfidence}
                isReviewed={typology.organizer_reviewed}
              />
            ) : (
              <span className="text-xs text-warm-400 italic">Not classified</span>
            )}
          </div>

          {/* Secondary category */}
          {typology?.secondaryCategory && !typology.organizer_reviewed && (
            <p className="mt-1 text-xs text-warm-400 dark:text-gray-500">
              Also:{' '}
              <span className="font-medium">
                {TYPOLOGY_LABELS[typology.secondaryCategory]} (
                {Math.round((typology.secondaryConfidence ?? 0) * 100)}%)
              </span>
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex flex-col gap-2 items-end">
          <button
            onClick={handleClassify}
            disabled={classifyMutation.isPending}
            className="text-xs px-3 py-1.5 rounded-md bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50 font-medium transition-colors"
          >
            {classifyMutation.isPending ? 'Classifying…' : typology ? 'Re-classify' : 'Classify'}
          </button>
          {typology && (
            <button
              onClick={() => setShowCorrectForm((v) => !v)}
              className="text-xs px-3 py-1.5 rounded-md bg-warm-100 text-warm-700 hover:bg-warm-200 dark:bg-gray-700 dark:text-gray-300 font-medium transition-colors"
            >
              {showCorrectForm ? 'Cancel' : 'Correct'}
            </button>
          )}
        </div>
      </div>

      {/* Correction form */}
      {showCorrectForm && (
        <div className="mt-3 pt-3 border-t border-warm-100 dark:border-gray-700 space-y-2">
          <div className="flex gap-2 flex-wrap">
            <select
              value={correctedTo}
              onChange={(e) => setCorrectedTo(e.target.value as TypologyCategory)}
              className="flex-1 min-w-0 text-sm border border-warm-300 dark:border-gray-600 rounded-md px-2 py-1.5 bg-white dark:bg-gray-700 text-warm-900 dark:text-white"
            >
              {ALL_TYPOLOGY_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {TYPOLOGY_LABELS[cat]}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            placeholder="Reason for correction (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full text-sm border border-warm-300 dark:border-gray-600 rounded-md px-3 py-1.5 bg-white dark:bg-gray-700 text-warm-900 dark:text-white placeholder-warm-400"
          />
          <button
            onClick={handleCorrect}
            disabled={updateMutation.isPending || !reason.trim()}
            className="text-sm px-4 py-1.5 rounded-md font-medium text-white disabled:opacity-50 transition-colors"
            style={{ backgroundColor: '#8FB897' }}
          >
            {updateMutation.isPending ? 'Saving…' : 'Save Correction'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TypologyPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { canAccess } = useOrganizerTier();
  const { showToast } = useToast();
  const [selectedSaleId, setSelectedSaleId] = useState<string>('');

  // Auth guard
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600" />
      </div>
    );
  }
  if (!user || user.role !== 'ORGANIZER') {
    router.push('/login');
    return null;
  }
  // TierGate handles PRO access check in the JSX below

  // Fetch organizer's sales
  const { data: sales = [], isLoading: salesLoading } = useQuery<Sale[]>({
    queryKey: ['organizer-sales-typology', user.id],
    queryFn: async () => {
      const res = await api.get('/sales/mine');
      return (res.data.sales ?? []).filter(
        (s: Sale) => s.status === 'PUBLISHED' || s.status === 'DRAFT'
      );
    },
    staleTime: 2 * 60 * 1000,
  });

  // Fetch items for selected sale
  const { data: items = [], isLoading: itemsLoading } = useQuery<Item[]>({
    queryKey: ['sale-items-typology', selectedSaleId],
    queryFn: async () => {
      const res = await api.get(`/items?saleId=${selectedSaleId}`);
      return res.data.items ?? res.data ?? [];
    },
    enabled: !!selectedSaleId,
    staleTime: 60 * 1000,
  });

  const batchMutation = useBatchClassifySale();

  const handleBatchClassify = async () => {
    if (!selectedSaleId) return;
    try {
      const result = await batchMutation.mutateAsync(selectedSaleId);
      showToast(
        `Classified ${result.classified} items${result.failed > 0 ? ` (${result.failed} failed)` : ''}`,
        result.failed > 0 ? 'error' : 'success'
      );
    } catch {
      showToast('Batch classification failed', 'error');
    }
  };

  const activeSale = sales.find((s) => s.id === selectedSaleId);

  return (
    <TierGate requiredTier="PRO" featureName="Typology Classifier" description="AI-powered item classification that helps you categorize estate sale items into collector types for better targeting.">
    <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
      <Head>
        <title>Typology Classifier — FindA.Sale</title>
        <meta name="description" content="AI-powered typology classification for your estate sale items" />
      </Head>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-warm-900 dark:text-white font-fraunces">
            Treasure Typology Classifier
          </h1>
          <p className="mt-1 text-warm-500 dark:text-gray-400 text-sm">
            AI-powered style classification for your items — Art Deco, Mid-Century Modern, Americana, and more.
          </p>
        </div>

        {/* Sale selector + batch action */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-warm-200 dark:border-gray-700 p-4 mb-6">
          <div className="flex gap-3 flex-wrap items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">
                Select a Sale
              </label>
              {salesLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <select
                  value={selectedSaleId}
                  onChange={(e) => setSelectedSaleId(e.target.value)}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-warm-900 dark:text-white text-sm"
                >
                  <option value="">— Choose a sale —</option>
                  {sales.map((sale) => (
                    <option key={sale.id} value={sale.id}>
                      {sale.name}{' '}
                      {sale.status === 'DRAFT' ? '(Draft)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedSaleId && (
              <button
                onClick={handleBatchClassify}
                disabled={batchMutation.isPending || itemsLoading}
                className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50 transition-colors"
                style={{ backgroundColor: '#8FB897' }}
              >
                {batchMutation.isPending ? 'Classifying all…' : `Classify All Items`}
              </button>
            )}
          </div>

          {activeSale && (
            <p className="mt-2 text-xs text-warm-400 dark:text-gray-500">
              {items.length} item{items.length !== 1 ? 's' : ''} in this sale
            </p>
          )}
        </div>

        {/* Items list */}
        {!selectedSaleId ? (
          <div className="text-center py-16 text-warm-400 dark:text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            <p className="text-sm">Select a sale above to manage typology classifications</p>
          </div>
        ) : itemsLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-warm-400 dark:text-gray-500">
            <p className="text-sm">No items found in this sale.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
    </TierGate>
  );
};

export default TypologyPage;
