/**
 * PostSaleEbayPanel — Post-sale eBay push workflow component
 *
 * Displays unsold items from a completed sale with shipping classification.
 * Allows organizers to select items, set shipping overrides, and push to eBay.
 * Phase B: Surfaces editable eBay listing data parity fields (identifiers, shipping, offers).
 */

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';
import { useOrganizerTier } from '../hooks/useOrganizerTier';

interface UnsoldItem {
  id: string;
  title: string;
  price?: number;
  photoUrls: string[];
  category?: string;
  tags: string[];
  ebayListingId?: string;
  ebayShippingClassification: string;
  ebayShippingOverride?: string;
  effectiveShipping: string;
  // Phase B: eBay listing parity fields
  brand?: string;
  mpn?: string;
  upc?: string;
  isbn?: string;
  ean?: string;
  ebaySubtitle?: string;
  conditionNotes?: string;
  packageWeightOz?: number;
  packageLengthIn?: number;
  packageWidthIn?: number;
  packageHeightIn?: number;
  packageType?: string;
  allowBestOffer?: boolean;
  bestOfferAutoAcceptAmt?: number;
  bestOfferMinimumAmt?: number;
}

interface EbayPhaseB {
  brand?: string;
  mpn?: string;
  upc?: string;
  isbn?: string;
  ean?: string;
  ebaySubtitle?: string;
  conditionNotes?: string;
  packageWeightOz?: number;
  packageLengthIn?: number;
  packageWidthIn?: number;
  packageHeightIn?: number;
  packageType?: string;
  allowBestOffer?: boolean;
  bestOfferAutoAcceptAmt?: number;
  bestOfferMinimumAmt?: number;
}

interface PostSaleEbayPanelProps {
  saleId: string;
}

type ShippingOverride = 'SHIPPABLE' | 'LOCAL_PICKUP_ONLY' | 'DONT_LIST' | null;

const ShippingBadge: React.FC<{ shipping: string; override?: string }> = ({ shipping, override }) => {
  const effectiveShipping = override || shipping;

  const badgeConfig: Record<string, { bg: string; text: string; label: string }> = {
    SHIPPABLE: { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-700 dark:text-green-200', label: 'Shippable ✓' },
    HEAVY_OVERSIZED: { bg: 'bg-amber-100 dark:bg-amber-900', text: 'text-amber-700 dark:text-amber-200', label: 'Heavy ⚠' },
    FRAGILE: { bg: 'bg-amber-100 dark:bg-amber-900', text: 'text-amber-700 dark:text-amber-200', label: 'Fragile ⚠' },
    UNKNOWN: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-200', label: 'Classify' },
    LOCAL_PICKUP_ONLY: { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-700 dark:text-blue-200', label: 'Local Pickup' },
    DONT_LIST: { bg: 'bg-gray-200 dark:bg-gray-600', text: 'text-gray-600 dark:text-gray-300', label: 'Don\'t List' },
  };

  const config = badgeConfig[effectiveShipping] || badgeConfig.UNKNOWN;

  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
};

const EbayEditForm: React.FC<{
  item: UnsoldItem;
  onSave: (itemId: string, data: EbayPhaseB) => void;
  isSaving: boolean;
}> = ({ item, onSave, isSaving }) => {
  const [formData, setFormData] = useState<EbayPhaseB>({
    brand: item.brand || '',
    mpn: item.mpn || '',
    upc: item.upc || '',
    isbn: item.isbn || '',
    ean: item.ean || '',
    ebaySubtitle: item.ebaySubtitle || '',
    conditionNotes: item.conditionNotes || '',
    packageWeightOz: item.packageWeightOz || undefined,
    packageLengthIn: item.packageLengthIn || undefined,
    packageWidthIn: item.packageWidthIn || undefined,
    packageHeightIn: item.packageHeightIn || undefined,
    packageType: item.packageType || '',
    allowBestOffer: item.allowBestOffer || false,
    bestOfferAutoAcceptAmt: item.bestOfferAutoAcceptAmt || undefined,
    bestOfferMinimumAmt: item.bestOfferMinimumAmt || undefined,
  });

  const [expandedSections, setExpandedSections] = useState({
    product: false,
    shipping: false,
    offers: false,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleInputChange = (field: keyof EbayPhaseB, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    const cleanData = {
      brand: formData.brand ? formData.brand.trim() : undefined,
      mpn: formData.mpn ? formData.mpn.trim() : undefined,
      upc: formData.upc ? formData.upc.trim() : undefined,
      isbn: formData.isbn ? formData.isbn.trim() : undefined,
      ean: formData.ean ? formData.ean.trim() : undefined,
      ebaySubtitle: formData.ebaySubtitle ? formData.ebaySubtitle.trim().slice(0, 55) : undefined,
      conditionNotes: formData.conditionNotes ? formData.conditionNotes.trim().slice(0, 1000) : undefined,
      packageWeightOz: formData.packageWeightOz ? Math.max(0, formData.packageWeightOz) : undefined,
      packageLengthIn: formData.packageLengthIn ? Math.max(0, formData.packageLengthIn) : undefined,
      packageWidthIn: formData.packageWidthIn ? Math.max(0, formData.packageWidthIn) : undefined,
      packageHeightIn: formData.packageHeightIn ? Math.max(0, formData.packageHeightIn) : undefined,
      packageType: formData.packageType || undefined,
      allowBestOffer: formData.allowBestOffer,
      bestOfferAutoAcceptAmt: formData.bestOfferAutoAcceptAmt ? Math.max(0, formData.bestOfferAutoAcceptAmt) : undefined,
      bestOfferMinimumAmt: formData.bestOfferMinimumAmt ? Math.max(0, formData.bestOfferMinimumAmt) : undefined,
    };

    onSave(item.id, cleanData);
  };

  const subtitleLength = formData.ebaySubtitle?.length || 0;
  const conditionLength = formData.conditionNotes?.length || 0;

  return (
    <div className="bg-warm-50 dark:bg-gray-700 rounded-lg border border-warm-200 dark:border-gray-600 p-4 mt-3 space-y-3">
      {/* Product Details Section */}
      <div className="border-b border-warm-200 dark:border-gray-600">
        <button
          type="button"
          onClick={() => toggleSection('product')}
          className="w-full text-left flex items-center justify-between py-2 px-2 hover:bg-warm-100 dark:hover:bg-gray-600 rounded transition-colors"
        >
          <span className="font-semibold text-warm-900 dark:text-warm-100">Product Details</span>
          <span className="text-warm-600 dark:text-warm-400">{expandedSections.product ? '▼' : '▶'}</span>
        </button>
        {expandedSections.product && (
          <div className="space-y-3 p-3 bg-white dark:bg-gray-800 rounded mb-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Brand</label>
                <input
                  type="text"
                  value={formData.brand || ''}
                  onChange={(e) => handleInputChange('brand', e.target.value)}
                  placeholder="e.g., Canon"
                  maxLength={100}
                  className="w-full px-2 py-1 text-sm rounded border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">MPN</label>
                <input
                  type="text"
                  value={formData.mpn || ''}
                  onChange={(e) => handleInputChange('mpn', e.target.value)}
                  placeholder="Manufacturer part #"
                  maxLength={100}
                  className="w-full px-2 py-1 text-sm rounded border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">UPC</label>
                <input
                  type="text"
                  value={formData.upc || ''}
                  onChange={(e) => handleInputChange('upc', e.target.value)}
                  placeholder="12 digits"
                  maxLength={12}
                  className="w-full px-2 py-1 text-sm rounded border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
                {formData.upc && formData.upc.length !== 12 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Typically 12 digits</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">EAN</label>
                <input
                  type="text"
                  value={formData.ean || ''}
                  onChange={(e) => handleInputChange('ean', e.target.value)}
                  placeholder="e.g., 5901234123457"
                  maxLength={14}
                  className="w-full px-2 py-1 text-sm rounded border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">ISBN (books only)</label>
              <input
                type="text"
                value={formData.isbn || ''}
                onChange={(e) => handleInputChange('isbn', e.target.value)}
                placeholder="10 or 13 digits"
                maxLength={13}
                className="w-full px-2 py-1 text-sm rounded border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
              {formData.isbn && ![10, 13].includes(formData.isbn.length) && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">ISBN is typically 10 or 13 characters</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">
                eBay Subtitle (55 char, paid upgrade)
              </label>
              <input
                type="text"
                value={formData.ebaySubtitle || ''}
                onChange={(e) => handleInputChange('ebaySubtitle', e.target.value.slice(0, 55))}
                placeholder="Short selling point"
                maxLength={55}
                className="w-full px-2 py-1 text-sm rounded border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
              <p className="text-xs text-warm-600 dark:text-warm-400 mt-0.5">{subtitleLength}/55</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Condition Notes (max 1000 chars)</label>
              <textarea
                value={formData.conditionNotes || ''}
                onChange={(e) => handleInputChange('conditionNotes', e.target.value.slice(0, 1000))}
                placeholder="Detailed condition, wear, defects..."
                maxLength={1000}
                rows={3}
                className="w-full px-2 py-1 text-sm rounded border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
              <p className="text-xs text-warm-600 dark:text-warm-400 mt-0.5">{conditionLength}/1000</p>
            </div>
          </div>
        )}
      </div>

      {/* Shipping Section */}
      <div className="border-b border-warm-200 dark:border-gray-600">
        <button
          type="button"
          onClick={() => toggleSection('shipping')}
          className="w-full text-left flex items-center justify-between py-2 px-2 hover:bg-warm-100 dark:hover:bg-gray-600 rounded transition-colors"
        >
          <span className="font-semibold text-warm-900 dark:text-warm-100">Shipping (for calculated rates)</span>
          <span className="text-warm-600 dark:text-warm-400">{expandedSections.shipping ? '▼' : '▶'}</span>
        </button>
        {expandedSections.shipping && (
          <div className="space-y-3 p-3 bg-white dark:bg-gray-800 rounded mb-2">
            <div>
              <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Weight (ounces)</label>
              <input
                type="number"
                value={formData.packageWeightOz || ''}
                onChange={(e) => handleInputChange('packageWeightOz', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                placeholder="0"
                min="0"
                className="w-full px-2 py-1 text-sm rounded border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Length (in)</label>
                <input
                  type="number"
                  value={formData.packageLengthIn || ''}
                  onChange={(e) => handleInputChange('packageLengthIn', e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="0"
                  min="0"
                  step="0.25"
                  className="w-full px-2 py-1 text-sm rounded border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Width (in)</label>
                <input
                  type="number"
                  value={formData.packageWidthIn || ''}
                  onChange={(e) => handleInputChange('packageWidthIn', e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="0"
                  min="0"
                  step="0.25"
                  className="w-full px-2 py-1 text-sm rounded border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Height (in)</label>
                <input
                  type="number"
                  value={formData.packageHeightIn || ''}
                  onChange={(e) => handleInputChange('packageHeightIn', e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="0"
                  min="0"
                  step="0.25"
                  className="w-full px-2 py-1 text-sm rounded border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Package Type</label>
              <select
                value={formData.packageType || ''}
                onChange={(e) => handleInputChange('packageType', e.target.value)}
                className="w-full px-2 py-1 text-sm rounded border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="">Select type...</option>
                <option value="BOX">Box</option>
                <option value="LETTER">Envelope</option>
                <option value="MAILING_TUBE">Mailing Tube</option>
                <option value="PACKAGE_THICK_ENVELOPE">Thick Envelope</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Offers Section */}
      <div>
        <button
          type="button"
          onClick={() => toggleSection('offers')}
          className="w-full text-left flex items-center justify-between py-2 px-2 hover:bg-warm-100 dark:hover:bg-gray-600 rounded transition-colors"
        >
          <span className="font-semibold text-warm-900 dark:text-warm-100">Offers</span>
          <span className="text-warm-600 dark:text-warm-400">{expandedSections.offers ? '▼' : '▶'}</span>
        </button>
        {expandedSections.offers && (
          <div className="space-y-3 p-3 bg-white dark:bg-gray-800 rounded mb-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`best-offer-${item.id}`}
                checked={formData.allowBestOffer}
                onChange={(e) => handleInputChange('allowBestOffer', e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <label htmlFor={`best-offer-${item.id}`} className="text-sm font-medium text-warm-900 dark:text-warm-100">
                Enable Best Offer
              </label>
            </div>
            {formData.allowBestOffer && (
              <div className="grid grid-cols-2 gap-2 pl-6">
                <div>
                  <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Auto-accept ($)</label>
                  <input
                    type="number"
                    value={formData.bestOfferAutoAcceptAmt || ''}
                    onChange={(e) => handleInputChange('bestOfferAutoAcceptAmt', e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full px-2 py-1 text-sm rounded border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Auto-decline below ($)</label>
                  <input
                    type="number"
                    value={formData.bestOfferMinimumAmt || ''}
                    onChange={(e) => handleInputChange('bestOfferMinimumAmt', e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full px-2 py-1 text-sm rounded border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
              </div>
            )}
            {formData.allowBestOffer && (
              <p className="text-xs text-warm-600 dark:text-warm-400 pl-6">
                Offers at or above auto-accept will auto-confirm. Offers below auto-decline will auto-reject.
              </p>
            )}
            {formData.allowBestOffer &&
              formData.bestOfferAutoAcceptAmt &&
              formData.bestOfferMinimumAmt &&
              formData.bestOfferAutoAcceptAmt < formData.bestOfferMinimumAmt && (
                <p className="text-xs text-amber-600 dark:text-amber-400 pl-6">
                  Auto-accept should be at least as high as auto-decline
                </p>
              )}
          </div>
        )}
      </div>

      {/* Save Button */}
      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className={`w-full py-2 px-3 rounded font-medium text-sm transition-colors ${
          isSaving
            ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            : 'bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600 text-white'
        }`}
      >
        {isSaving ? 'Saving...' : 'Save eBay Details'}
      </button>
    </div>
  );
};

export const PostSaleEbayPanel: React.FC<PostSaleEbayPanelProps> = ({ saleId }) => {
  const { showToast } = useToast();
  const { tier } = useOrganizerTier();
  const queryClient = useQueryClient();

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [itemOverrides, setItemOverrides] = useState<Record<string, ShippingOverride>>({});
  const [expandedEditItem, setExpandedEditItem] = useState<string | null>(null);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  // Fetch unsold items
  const { data: unsoldData, isLoading, isError } = useQuery({
    queryKey: ['unsold-items', saleId],
    queryFn: async () => {
      const response = await api.get(`/organizer/sales/${saleId}/unsold-items`);
      return response.data as { items: UnsoldItem[] };
    },
  });

  // Mutation for setting shipping override
  const setOverrideMutation = useMutation({
    mutationFn: async ({ itemId, override }: { itemId: string; override: ShippingOverride }) => {
      return api.patch(`/organizer/items/${itemId}/ebay-shipping`, { override });
    },
    onSuccess: (response, variables) => {
      setItemOverrides((prev) => ({
        ...prev,
        [variables.itemId]: variables.override,
      }));
      queryClient.invalidateQueries({ queryKey: ['unsold-items', saleId] });
    },
    onError: () => {
      showToast('Failed to update shipping override', 'error');
    },
  });

  // Mutation for saving eBay Phase B details
  const updateItemEbayDetailsMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: EbayPhaseB }) => {
      return api.put(`/items/${itemId}`, data);
    },
    onSuccess: (response, variables) => {
      showToast('eBay details saved', 'success');
      setSavingItemId(null);
      setExpandedEditItem(null);
      queryClient.invalidateQueries({ queryKey: ['unsold-items', saleId] });
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to save eBay details';
      showToast(msg, 'error');
      setSavingItemId(null);
    },
  });

  // Mutation for pushing items to eBay
  const pushToEbayMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      return api.post(`/organizer/sales/${saleId}/ebay-push`, {
        itemIds,
        localPickupIds: itemIds.filter(
          (id) => itemOverrides[id] === 'LOCAL_PICKUP_ONLY' || getEffectiveShipping(id) === 'LOCAL_PICKUP_ONLY'
        ),
      });
    },
    onSuccess: (response) => {
      const results = response.data.results || [];
      const successCount = results.filter((r: any) => r.status === 'success').length;
      const failureCount = results.filter((r: any) => r.status === 'error').length;

      if (successCount > 0) {
        showToast(`${successCount} item(s) pushed to eBay`, 'success');
      }
      if (failureCount > 0) {
        showToast(`Failed to push ${failureCount} item(s)`, 'error');
      }

      setSelectedItems(new Set());
      queryClient.invalidateQueries({ queryKey: ['unsold-items', saleId] });
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to push items to eBay';
      showToast(msg, 'error');
    },
  });

  const getEffectiveShipping = (itemId: string): string => {
    const item = unsoldData?.items.find((i) => i.id === itemId);
    if (!item) return 'UNKNOWN';
    return itemOverrides[itemId] || item.effectiveShipping;
  };

  const handleShippingChange = (itemId: string, override: ShippingOverride) => {
    setOverrideMutation.mutate({ itemId, override });

    // If setting to DONT_LIST, unselect the item
    if (override === 'DONT_LIST') {
      setSelectedItems((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const handleItemCheck = (itemId: string, checked: boolean) => {
    const effectiveShipping = getEffectiveShipping(itemId);
    if (effectiveShipping === 'DONT_LIST') {
      showToast('Cannot select items marked "Don\'t List"', 'info');
      return;
    }

    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(itemId);
      } else {
        next.delete(itemId);
      }
      return next;
    });
  };

  const handlePush = () => {
    if (selectedItems.size === 0) {
      showToast('Select at least one item', 'info');
      return;
    }

    if (tier === 'SIMPLE') {
      showToast('eBay selling requires PRO or TEAMS tier', 'error');
      return;
    }

    pushToEbayMutation.mutate(Array.from(selectedItems));
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-6 mt-8">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-100 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-6 mt-8">
        <p className="text-red-600 dark:text-red-400">Failed to load unsold items</p>
      </div>
    );
  }

  const items = unsoldData?.items || [];
  const unsoldCount = items.length;
  const alreadyListedCount = items.filter((i) => i.ebayListingId).length;
  const pushableItems = items.filter((i) => !i.ebayListingId);

  if (unsoldCount === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-6 mt-8">
        <p className="text-warm-700 dark:text-warm-300 text-center font-semibold">All items sold! Great sale.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-6 mt-8">
      {/* Header */}
      <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-2">
        {unsoldCount} item{unsoldCount !== 1 ? 's' : ''} didn't sell — list on eBay?
      </h2>
      {alreadyListedCount > 0 && (
        <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
          ({alreadyListedCount} already on eBay)
        </p>
      )}

      {/* Items Grid/List */}
      {pushableItems.length > 0 ? (
        <>
          <div className="space-y-3 mb-6">
            {pushableItems.map((item) => {
              const isChecked = selectedItems.has(item.id);
              const effectiveShipping = getEffectiveShipping(item.id);
              const isDontList = effectiveShipping === 'DONT_LIST';
              const isEditing = expandedEditItem === item.id;

              return (
                <div key={item.id}>
                  <div
                    className={`flex gap-4 p-4 rounded-lg border transition-colors ${
                      isDontList
                        ? 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 opacity-60'
                        : 'bg-warm-50 dark:bg-gray-700 border-warm-200 dark:border-gray-600 hover:bg-warm-100 dark:hover:bg-gray-600'
                    }`}
                  >
                    {/* Checkbox */}
                    <div className="flex items-start pt-1">
                      <input
                        type="checkbox"
                        checked={isChecked && !isDontList}
                        disabled={isDontList}
                        onChange={(e) => handleItemCheck(item.id, e.target.checked)}
                        className="w-5 h-5 text-amber-600 dark:text-amber-400 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* Thumbnail */}
                    <div className="w-16 h-16 flex-shrink-0 bg-gray-100 dark:bg-gray-600 rounded overflow-hidden">
                      {item.photoUrls?.[0] && (
                        <img
                          src={item.photoUrls[0]}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>

                    {/* Item Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-warm-900 dark:text-warm-100 line-clamp-2">
                        {item.title}
                      </h3>
                      {item.price && (
                        <p className="text-sm text-amber-700 dark:text-amber-400 font-bold mt-1">
                          ${(item.price / 100).toFixed(2)}
                        </p>
                      )}
                    </div>

                    {/* Shipping Classification + Override + Edit Button */}
                    <div className="flex-shrink-0 flex items-start gap-3 pt-1">
                      <ShippingBadge shipping={item.ebayShippingClassification} override={itemOverrides[item.id] ?? undefined} />

                      {['HEAVY_OVERSIZED', 'FRAGILE', 'UNKNOWN'].includes(item.ebayShippingClassification) && !itemOverrides[item.id] && (
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              handleShippingChange(item.id, e.target.value as ShippingOverride);
                            }
                          }}
                          className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-500 cursor-pointer"
                        >
                          <option value="">Change...</option>
                          <option value="SHIPPABLE">Shippable</option>
                          <option value="LOCAL_PICKUP_ONLY">Local Pickup</option>
                          <option value="DONT_LIST">Don't List</option>
                        </select>
                      )}

                      {itemOverrides[item.id] && (
                        <button
                          onClick={() => handleShippingChange(item.id, null)}
                          className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
                        >
                          ✕ Clear
                        </button>
                      )}

                      <button
                        onClick={() => setExpandedEditItem(isEditing ? null : item.id)}
                        className="text-xs px-3 py-1 rounded bg-warm-200 dark:bg-warm-700 text-warm-900 dark:text-warm-100 hover:bg-warm-300 dark:hover:bg-warm-600 transition-colors font-medium"
                      >
                        {isEditing ? 'Close' : 'Edit eBay'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Edit Form */}
                  {isEditing && (
                    <EbayEditForm
                      item={item}
                      onSave={(itemId, data) => {
                        setSavingItemId(itemId);
                        updateItemEbayDetailsMutation.mutate({ itemId, data });
                      }}
                      isSaving={savingItemId === item.id}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Push Button */}
          <button
            onClick={handlePush}
            disabled={selectedItems.size === 0 || pushToEbayMutation.isPending}
            className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors ${
              selectedItems.size === 0 || pushToEbayMutation.isPending
                ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : 'bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600 text-white'
            }`}
          >
            {pushToEbayMutation.isPending
              ? 'Pushing to eBay...'
              : `Push ${selectedItems.size} Selected to eBay`}
          </button>
        </>
      ) : (
        <p className="text-warm-600 dark:text-warm-400 text-center py-6">
          All items are already listed on eBay
        </p>
      )}
    </div>
  );
};
