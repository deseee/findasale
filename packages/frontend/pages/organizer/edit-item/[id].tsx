/**
 * Edit Item Page
 *
 * Allows organizers to:
 * - Update item title, description, photos
 * - Change pricing or auction settings
 * - Update status (active, sold, etc.)
 */

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import { useEbayConnection } from '../../../lib/useEbayConnection';
import { useDiscogsConnection } from '../../../lib/useDiscogsConnection';
import { useOrganizerTier } from '../../../hooks/useOrganizerTier';
import ItemPhotoManager from '../../../components/ItemPhotoManager'; // Phase 16
import PriceSuggestion from '../../../components/PriceSuggestion'; // CD2 Phase 3
import PriceResearchPanel from '../../../components/PriceResearchPanel';
import PricingCompSummary from '../../../components/PricingCompSummary'; // Feature #338: Multi-source comp summary
import PricingSignalBanners from '../../../components/PricingSignalBanners';
import ItemPriceHistoryChart from '../../../components/ItemPriceHistoryChart';
import LocationSelector from '../../../components/LocationSelector';
import Head from 'next/head';
import Link from 'next/link';
import Skeleton from '../../../components/Skeleton';
import { CURATED_TAGS } from '../../../../shared/src'; // Sprint 1: Listing Factory tag vocabulary
import RapidCapture, { RapidItem } from '../../../components/RapidCapture';
import EbayCategoryPicker from '../../../components/EbayCategoryPicker';
import EncyclopediaInlineTip from '../../../components/EncyclopediaInlineTip';
import EbayCompTiles from '../../../components/EbayCompTiles';
import ConfirmDialog from '../../../components/ConfirmDialog';
import VoiceDescriptionInput from '../../../components/VoiceDescriptionInput';
import BarcodeScanner from '../../../components/BarcodeScanner';
import CatalogSuggestionPanel from '../../../components/CatalogSuggestionPanel';
import { ShippingNetPreview } from '../../../components/ShippingNetPreview';
import { Mic } from 'lucide-react';

// Bug fix (2026-08-08, same P1 data-corruption class as add-items.tsx auctionEndTime
// fix): item.auctionEndTime is stored as a UTC ISO timestamp. Previously this page did
// `new Date(item.auctionEndTime).toISOString().slice(0, 16)` to pre-fill the
// <input type="datetime-local"> -- but .toISOString() always formats in UTC, so the
// value dropped into a LOCAL-time input as if it were already local. An organizer
// opening an existing auction item for edit saw the WRONG time, off by their UTC
// offset. Build the datetime-local value from the Date object's LOCAL getters instead
// so what's displayed matches what was originally picked.
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${day}T${h}:${mi}`;
}

const EditItemPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected: ebayConnected } = useEbayConnection();
  const { isConnected: discogsConnected } = useDiscogsConnection();
  const { tier } = useOrganizerTier();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    quantity: 1,
    stockTotal: 1,
    category: '',
    ebayCategoryId: '',
    ebayCategoryName: '',
    condition: '',
    conditionGrade: '',
    tags: [] as string[],
    status: 'AVAILABLE',
    listingType: 'FIXED',
    auctionEndTime: '',
    qrEmbedEnabled: true,
    isLegendary: false,
    tagColor: '',
    // Feature #311: Multi-Location Inventory View
    locationId: null as string | null,
    // Feature #407: Flip Tracker ROI: cost basis
    costBasis: '',
    // Feature #411: Dorm Dash: room/area tag
    roomTag: '',
    // Shipping dimensions
    packageWeightOz: '',
    packageLengthIn: '',
    packageWidthIn: '',
    packageHeightIn: '',
    packageType: '',
    // Native FindA.Sale checkout shipping (ADR-104 Sec3): independent of eBay/tier.
    shippingAvailable: false,
    shippingPrice: '',
    // Crosslister shipping-payer toggle (2026-08-27): SEPARATE from shippingAvailable/
    // shippingPrice above -- this is whether to offer free shipping when this item is
    // cross-listed to an external marketplace (Mercari today), not FindA.Sale's own checkout.
    crosslisterFreeShipping: false,
    // Product identifiers (populated by barcode scan)
    brand: '',
    // 2026-08-18: size/color/material -- feed the Poshmark/Mercari/Vinted/Grailed content
    // scripts, which already read item.size/item.color/item.material (previously always
    // undefined since these fields didn't exist on Item at all). Same plain-text, organizer-
    // entered pattern as Brand -- no dropdown/enum, connectors map free text to each
    // platform's own picker.
    size: '',
    color: '',
    material: '',
    upc: '',
    mpn: '',
    // eBay Best Offers
    allowBestOffer: false,
    bestOfferAcceptPct: '' as number | '',
    bestOfferDeclinePct: '' as number | '',
    // eBay shipping override
    ebayShippingOverride: null as string | null,
    // eBay per-item fulfillment-policy override (null = Auto)
    ebayFulfillmentPolicyOverrideId: null as string | null,
  });

  // Local raw-text mirrors for quantity/stockTotal inputs: lets the field
  // go through an empty intermediate state while typing instead of snapping
  // back to 1 on every keystroke. Clamped to a valid integer (min 1) on blur.
  const [quantityText, setQuantityText] = useState(String(formData.quantity ?? 1));
  const [stockTotalText, setStockTotalText] = useState(String(formData.stockTotal ?? 1));

  useEffect(() => {
    setQuantityText(String(formData.quantity ?? 1));
  }, [formData.quantity]);

  useEffect(() => {
    setStockTotalText(String(formData.stockTotal ?? 1));
  }, [formData.stockTotal]);

  const uploadInputRef = useRef<HTMLInputElement>(null);

  const handlePrintLabel = async () => {
    if (!id) return;
    try {
      const res = await api.get(`/items/${id}/label`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const win = window.open(url, '_blank');
      // Revoke after a short delay to allow the browser to load it
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      if (!win) showToast('Allow pop-ups to view the label', 'error');
    } catch {
      showToast('Failed to generate label', 'error');
    }
  };
  const [inlineCameraOpen, setInlineCameraOpen] = useState(false);
  const [inlineCaptureMode, setInlineCaptureMode] = useState<'rapidfire' | 'regular'>('regular');
  const [inlineRapidItems, setInlineRapidItems] = useState<RapidItem[]>([]);

  // D-XP-003: Organizer discount modal
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [pendingXpToSpend, setPendingXpToSpend] = useState<number | null>(null);

  // Confirm dialog state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Barcode scanner state
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);

  // 2026-08-26 fix (Patrick: "why isn't there at least one on the full edit item page"):
  // Re-analyze/Identify precisely existed only on the review-queue card, never here, even
  // though POST /items/:id/reanalyze is generic (ownership + photos-exist gated, no
  // review-queue-specific check) -- this page just never wired a button to it.
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeConfirm, setReanalyzeConfirm] = useState<{ open: boolean; forceGrounding: boolean }>({ open: false, forceGrounding: false });
  // Bumped on a successful re-analyze so PriceSuggestion (autoRefreshToken prop below)
  // fetches a fresh suggestion instead of leaving a stale/absent one on screen -- same
  // fix as the review queue, see PriceSuggestion.tsx.
  const [priceRefreshToken, setPriceRefreshToken] = useState<number | undefined>(undefined);

  // Local pickup smart detection nudge
  const [showLocalPickupNudge, setShowLocalPickupNudge] = useState(false);
  // eBay fulfillment policies for the per-item shipping-policy override select.
  // Fetched from /ebay/setup-data; empty (select hidden) if not eBay-connected or fetch fails.
  const [ebayFulfillmentPolicies, setEbayFulfillmentPolicies] = useState<
    Array<{ fulfillmentPolicyId: string; name: string; classification?: string }>
  >([]);

  const openDiscountModal = (xpToSpend: number) => {
    setPendingXpToSpend(xpToSpend);
    setDiscountModalOpen(true);
  };

  // Barcode scan → eBay Catalog lookup handler
  // "Organizer-set wins": only fills EMPTY fields, never overwrites existing values.
  const handleBarcodeScan = async (code: string, codeType: string) => {
    setBarcodeScannerOpen(false);
    setBarcodeLoading(true);
    try {
      const res = await api.post('/barcode/lookup', { code, codeType });
      const result = res.data;
      if (result?.found) {
        setFormData((prev) => ({
          ...prev,
          title: prev.title || result.title || prev.title,
          brand: prev.brand || result.brand || prev.brand,
          upc: prev.upc || result.upc || prev.upc,
          mpn: prev.mpn || result.mpn || prev.mpn,
          packageWeightOz:
            prev.packageWeightOz ||
            (result.weightOz != null ? String(Math.round(result.weightOz)) : prev.packageWeightOz),
          packageLengthIn:
            prev.packageLengthIn ||
            (result.lengthIn != null ? String(result.lengthIn) : prev.packageLengthIn),
          packageWidthIn:
            prev.packageWidthIn ||
            (result.widthIn != null ? String(result.widthIn) : prev.packageWidthIn),
          packageHeightIn:
            prev.packageHeightIn ||
            (result.heightIn != null ? String(result.heightIn) : prev.packageHeightIn),
        }));
        const label = [result.brand, result.title].filter(Boolean).join(' ');
        showToast(`Found: ${label}. Review the prefilled fields.`, 'success');
      } else {
        showToast(`No product match for ${code}. Fill in manually.`, 'info');
      }
    } catch (err: any) {
      if (err?.response?.status === 404) {
        showToast(`No product match for ${code}. Fill in manually.`, 'info');
      } else {
        showToast('Lookup failed. Try again or fill in manually.', 'error');
      }
    } finally {
      setBarcodeLoading(false);
    }
  };

  // eBay push state
  const [ebayPushPending, setEbayPushPending] = useState(false);
  // True once the organizer actually edits the package weight box on this page.
  // eBay publish blocks a shippable item whose weight is only an estimate, and the
  // only way out of that block is the organizer confirming a real weight. Saving an
  // untouched, prefilled estimate must NOT count as confirming it, so the confirm
  // flag is sent only when this is true.
  const [weightTouched, setWeightTouched] = useState(false);

  // ADR-106 (2026-08-15): mirrors weightTouched's "real edit vs. incidental re-save"
  // contract for native-checkout shipping. shippingAvailable/shippingPrice are only
  // included in the PATCH payload when the organizer actually interacts with the
  // checkbox or price input -- otherwise the backend's own auto-suggest logic (based
  // on package weight becoming known) keeps ownership of these fields, and a plain
  // save of an unrelated field (title, price, description, etc.) never silently locks
  // shippingPriceConfirmedByOrganizer=true just because formData always carries the
  // current shippingAvailable/shippingPrice values.
  const [shippingTouched, setShippingTouched] = useState(false);

  // ADR-ai-package-estimation-isolation-2026-08-05, corrected S-QA-2026-08-06: explicit,
  // opt-in fetch of the AI/estimate-cascade weight+dims guess. Only fills the editable
  // fields: never auto-confirms. Does NOT set weightTouched itself: a click here alone
  // (with no further action) must never cause Save to persist packageConfirmedByOrganizer.
  // The organizer must still separately edit the field or click "This is correct as shown"
  // (below) before Save will confirm: mirrors the organizer typing the values in
  // themselves, not merely viewing an AI guess.
  const [packageEstimateLoading, setPackageEstimateLoading] = useState(false);
  const handleGetPackageEstimate = async () => {
    if (!id) return;
    setPackageEstimateLoading(true);
    try {
      const res = await api.get(`/items/${id}/package-estimate`);
      const result = res.data;
      if (result?.reason === 'not-applicable' || result?.weightOz == null) {
        showToast('No estimate available for this item.', 'info');
        return;
      }
      setFormData((prev) => ({
        ...prev,
        packageWeightOz: String(Math.round(result.weightOz)),
        packageLengthIn: result.dims?.length != null ? String(result.dims.length) : prev.packageLengthIn,
        packageWidthIn: result.dims?.width != null ? String(result.dims.width) : prev.packageWidthIn,
        packageHeightIn: result.dims?.height != null ? String(result.dims.height) : prev.packageHeightIn,
        packageType: result.packageType || prev.packageType,
      }));
      // Do NOT setWeightTouched(true) here: filling the fields is not confirming them.
      // The organizer must edit the field or click "This is correct as shown" to confirm.
      showToast('Estimate filled in. Edit the field or click "This is correct as shown" to confirm.', 'success');
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to get estimate. Try again.';
      showToast(message, 'error');
    } finally {
      setPackageEstimateLoading(false);
    }
  };

  /**
   * Re-analyze: re-run the Smart tagging pipeline on this item's already-stored photos
   * (no re-upload) and refresh title/description/category/condition/tags in place. Price
   * is never touched by this pipeline -- organizer pricing always wins (D-006). Mirrors
   * the review-queue card's handleReanalyze (review.tsx) so behavior is identical on both
   * pages; forceGrounding=true (Identify precisely) bypasses the skip-if-already-grounded
   * short-circuit server-side so a real re-lookup runs even on an already-grounded item.
   */
  const handleReanalyzeItem = async (forceGrounding: boolean) => {
    if (!id || reanalyzing) return;
    setReanalyzing(true);
    try {
      const res = await api.post(`/items/${id}/reanalyze`, { forceGrounding });
      const updated = res.data?.item;
      if (updated) {
        const normalizeCondition = (c: string | null | undefined): string => {
          if (!c) return formData.condition;
          const up = c.toUpperCase().trim().replace(/\s+/g, '_');
          const valid = ['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR'];
          if (valid.includes(up)) return up;
          const legacy: Record<string, string> = { LIKE_NEW: 'NEW', EXCELLENT: 'NEW', GOOD: 'USED', FAIR: 'USED', POOR: 'PARTS_OR_REPAIR' };
          return legacy[up] || formData.condition;
        };
        setFormData((prev) => ({
          ...prev,
          title: updated.title ?? prev.title,
          description: updated.description ?? prev.description,
          category: updated.category ?? prev.category,
          condition: normalizeCondition(updated.condition),
          conditionGrade: updated.conditionGrade ?? prev.conditionGrade,
          tags: Array.isArray(updated.tags) ? updated.tags : prev.tags,
          ebayCategoryId: updated.ebayCategoryId ?? prev.ebayCategoryId,
          ebayCategoryName: updated.ebayCategoryName ?? prev.ebayCategoryName,
          // price intentionally NOT changed here -- organizer pricing always wins.
        }));
      }
      // Keep the cached item in sync too (mirrors the description-save pattern above,
      // S724 Branch B) so a stray refetch doesn't clobber what we just applied.
      queryClient.setQueryData(['item', id], (old: any) => (old && updated ? { ...old, ...updated } : old));
      setPriceRefreshToken((prev) => (prev ?? 0) + 1);
      showToast('Suggestions refreshed from your photos.', 'success');
    } catch (err: any) {
      const code = err?.response?.data?.code;
      let message = err?.response?.data?.message || 'Re-analyze failed. Try again.';
      if (code === 'AI_QUOTA_EXCEEDED') {
        message = err?.response?.data?.message || 'Monthly re-analyze limit reached.';
      } else if (code === 'NO_PHOTOS') {
        message = 'Add a photo before re-analyzing.';
      } else if (code === 'AI_UNAVAILABLE') {
        message = 'Smart tagging is temporarily unavailable. Try again shortly.';
      } else if (code === 'PHOTO_DOWNLOAD_FAILED') {
        message = "We couldn't load this item's photos. Try again in a moment.";
      }
      showToast(message, 'error');
    } finally {
      setReanalyzing(false);
    }
  };

  /** Gate re-analyze behind a confirm -- current suggested fields get replaced; price is kept. */
  const requestReanalyzeItem = (forceGrounding: boolean) => {
    if (reanalyzing) return;
    setReanalyzeConfirm({ open: true, forceGrounding });
  };

  // ADR-104 Sec3: native-checkout suggested shipping price. Debounced fetch, fires only
  // when the organizer has shipping enabled and hasn't typed a price yet -- never
  // overwrites a value the organizer already entered, never auto-submits, and fails
  // silently (no toast/error UI) so a suggestion-endpoint error never blocks Save -- the
  // plain manual-entry field keeps working exactly as it does today (ADR-104 Sec3
  // Rollback/Risk: "If the suggestion endpoint errors, the frontend must fail silently
  // to the current plain-input behavior").
  const [shippingSuggestion, setShippingSuggestion] = useState<{ suggestedPrice: number; basis: string; zone: string } | null>(null);
  const [shippingSuggestionLoading, setShippingSuggestionLoading] = useState(false);
  const shippingSuggestionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (shippingSuggestionDebounceRef.current) clearTimeout(shippingSuggestionDebounceRef.current);
    if (!id || !formData.shippingAvailable || formData.shippingPrice) {
      setShippingSuggestion(null);
      return;
    }
    shippingSuggestionDebounceRef.current = setTimeout(async () => {
      setShippingSuggestionLoading(true);
      try {
        const params = new URLSearchParams();
        if (formData.packageWeightOz) params.set('weightOz', formData.packageWeightOz);
        if (formData.packageLengthIn) params.set('lengthIn', formData.packageLengthIn);
        if (formData.packageWidthIn) params.set('widthIn', formData.packageWidthIn);
        if (formData.packageHeightIn) params.set('heightIn', formData.packageHeightIn);
        if (formData.packageType) params.set('packageType', formData.packageType);
        // Preview/applied lockstep (2026-08-16): the two package-independent inputs to
        // suggestNativeShippingPrice are the item's SALE price (gates eBay Standard Envelope
        // eligibility -- a ~$1.03-$1.65 envelope rate vs. a several-dollar parcel rate, so it
        // moves the answer by DOLLARS, not cents) and its eBay category. updateItem's ADR-106
        // auto-set branch prices off the values in the PATCH body (`effPrice` /
        // `effEbayCategoryId`), i.e. the organizer's CURRENT unsaved form values -- but this
        // preview call used to send neither, so getSuggestedShippingPriceHandler fell back to
        // the item's LAST PERSISTED price/category. Change the price from $50 to $15 on a 3oz
        // item and the hint showed a parcel rate while Save wrote an envelope rate. Same
        // reason weightOz/dims/packageType are already sent as overrides above: the previewed
        // number and the persisted number must come from identical inputs, not just the same
        // function. NOTE: requires the matching priceUsd/categoryId override support in
        // getSuggestedShippingPriceHandler (itemController.ts) -- until that ships these two
        // params are simply ignored server-side, so this is safe to land first.
        if (formData.price) params.set('priceUsd', formData.price);
        if (formData.ebayCategoryId) params.set('categoryId', formData.ebayCategoryId);
        const res = await api.get(`/items/${id}/suggested-shipping-price?${params.toString()}`);
        setShippingSuggestion(res.data);
      } catch {
        // Fail silently, per ADR-104 Sec3 Rollback/Risk -- never block plain manual entry.
        setShippingSuggestion(null);
      } finally {
        setShippingSuggestionLoading(false);
      }
    }, 500);
    return () => {
      if (shippingSuggestionDebounceRef.current) clearTimeout(shippingSuggestionDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, formData.shippingAvailable, formData.shippingPrice, formData.packageWeightOz, formData.packageLengthIn, formData.packageWidthIn, formData.packageHeightIn, formData.packageType, formData.price, formData.ebayCategoryId]);

  // eBay push mutation: S725 always LIVE (DRAFT mode killed)
  const ebayPushMutation = useMutation({
    mutationFn: async ({ itemId }: { itemId: string }) => {
      if (!item?.saleId) throw new Error('Sale ID not found');
      return api.post(`/ebay/organizer/sales/${item.saleId}/ebay-push`, {
        itemIds: [itemId],
      });
    },
    onSuccess: (response) => {
      const results = response.data.results || [];
      const result = results[0];
      if (result?.status === 'success') {
        showToast('Item listed on eBay', 'success');
        queryClient.invalidateQueries({ queryKey: ['item', id] });
      } else {
        const errorMsg = result?.code?.includes('NOT_CONNECTED')
          ? 'eBay not connected'
          : result?.code === 'NO_FULFILLMENT_POLICY_MATCH'
          ? 'No shipping policy matched. Add package weight or set a default fulfillment policy in eBay Settings'
          : result?.code === 'POLICIES_NOT_CONFIGURED'
          ? 'eBay policies not configured. Complete eBay setup in Settings'
          : result?.message || 'Failed to push item';
        showToast(errorMsg, 'error');
      }
      setEbayPushPending(false);
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to push item to eBay';
      showToast(msg, 'error');
      setEbayPushPending(false);
    },
  });

  // S725: Publish-now mutation: publishes an existing unpublished offer LIVE.
  const ebayPublishMutation = useMutation({
    mutationFn: async ({ itemId }: { itemId: string }) => {
      return api.post(`/ebay/items/${itemId}/publish`);
    },
    onSuccess: (response) => {
      if (response.data?.ebayListingId) {
        showToast('Published to eBay', 'success');
        queryClient.invalidateQueries({ queryKey: ['item', id] });
      } else {
        showToast('Publish failed', 'error');
      }
      setEbayPushPending(false);
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to publish item to eBay';
      showToast(msg, 'error');
      setEbayPushPending(false);
    },
  });

  // Builds the save payload and PUTs the current form state to the backend.
  // Shared by handlePushToEbay and handlePublishNow so both persist edits (incl. Brand/MPN/UPC) before any eBay action.
  const saveFormState = async () => {
    const toIntOrNull = (v: string) => {
      const n = parseInt(String(v).trim(), 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const pushPrice = parseFloat(String(formData.price)) || 0;
    const pushAcceptPct = typeof formData.bestOfferAcceptPct === 'number' ? formData.bestOfferAcceptPct : null;
    const pushDeclinePct = typeof formData.bestOfferDeclinePct === 'number' ? formData.bestOfferDeclinePct : null;
    const savePayload = {
      ...formData,
      packageWeightOz: toIntOrNull(formData.packageWeightOz),
      // Organizer typed a real weight on this page: record it as confirmed so eBay
      // publish stops treating it as an estimate. Never sent when the box was left
      // untouched (see weightTouched).
      ...(weightTouched && toIntOrNull(formData.packageWeightOz) !== null
        ? { packageConfirmedByOrganizer: true, packageEstimateSource: 'ORGANIZER' }
        : {}),
      packageLengthIn: toIntOrNull(formData.packageLengthIn),
      packageWidthIn: toIntOrNull(formData.packageWidthIn),
      packageHeightIn: toIntOrNull(formData.packageHeightIn),
      allowBestOffer: formData.allowBestOffer,
      bestOfferAutoAcceptAmt: formData.allowBestOffer && pushAcceptPct !== null && pushPrice > 0
        ? parseFloat((pushPrice * (1 - pushAcceptPct / 100)).toFixed(2))
        : null,
      bestOfferMinimumAmt: formData.allowBestOffer && pushDeclinePct !== null && pushPrice > 0
        ? parseFloat((pushPrice * (1 - pushDeclinePct / 100)).toFixed(2))
        : null,
      ebayShippingOverride: formData.ebayShippingOverride || null,
      ebayFulfillmentPolicyOverrideId: formData.ebayFulfillmentPolicyOverrideId || null,
      bestOfferAcceptPct: undefined,
      bestOfferDeclinePct: undefined,
    };
    await api.put(`/items/${id}`, savePayload);
  };

  const handlePushToEbay = async () => {
    if (!ebayConnected) {
      showToast('Connect eBay in Settings first', 'error');
      return;
    }
    if (tier === 'SIMPLE') {
      showToast('eBay selling requires PRO or TEAMS tier', 'error');
      return;
    }
    if (!formData.title.trim()) {
      showToast('Title is required before pushing to eBay', 'error');
      return;
    }
    setEbayPushPending(true);
    try {
      // Auto-save current form state first so eBay push uses the latest values (not stale DB state).
      // Inline PUT (not updateMutation): updateMutation.onSuccess navigates to /dashboard which would abort the push.
      await saveFormState();
    } catch (err) {
      setEbayPushPending(false);
      showToast('Save failed. Fix errors before pushing to eBay', 'error');
      return;
    }
    ebayPushMutation.mutate({ itemId: String(id) });
  };

  const handlePublishNow = async () => {
    setEbayPushPending(true);
    try {
      // Persist current form state (incl. Brand/MPN/UPC) before publishing so eBay sees latest values.
      await saveFormState();
    } catch (err) {
      setEbayPushPending(false);
      showToast('Save failed. Fix errors before publishing to eBay', 'error');
      return;
    }
    ebayPublishMutation.mutate({ itemId: String(id) });
  };

  const handlePhotoUpload = async (files: FileList | null, mode: 'upload' | 'camera') => {
    if (!files || files.length === 0 || !id) return;

    try {
      for (const file of Array.from(files)) {
        // Step 1: Upload to Cloudinary
        const formData = new FormData();
        formData.append('photo', file);
        const uploadRes = await api.post('/upload/item-photo', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const url: string = uploadRes.data.url;

        // Step 2: Append URL to item's photoUrls
        await api.post(`/items/${id}/photos`, { url });
      }

      // Refetch item to reflect new photos
      await queryClient.invalidateQueries({ queryKey: ['item', id] });
      showToast(`${mode === 'camera' ? 'Camera' : 'Photo'} uploaded successfully`, 'success');

      // Reset file inputs
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    } catch (err: any) {
      const serverMsg = err?.response?.data?.error || err?.response?.data?.message;
      const message = serverMsg ? `Upload failed: ${serverMsg}` : 'Photo upload failed. Please try again.';
      showToast(message, 'error');
    }
  };

  const handleInlineCameraCapture = async (photo: { blob: Blob; previewUrl: string }) => {
    if (!id || !item) return;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setInlineRapidItems(prev => [...prev, { id: tempId, thumbnailUrl: photo.previewUrl, draftStatus: 'DRAFT' }]);
    try {
      const fd = new FormData();
      fd.append('photos', photo.blob, 'capture.jpg');
      if (item.saleId) fd.append('saleId', item.saleId);
      const res = await api.post('/upload/sale-photos', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const urls: string[] = res.data?.urls || [];
      if (urls[0]) {
        await api.post(`/items/${id}/photos`, { url: urls[0] });
        setInlineRapidItems(prev =>
          prev.filter(i => i.id !== tempId).map(i =>
            i.id === String(id) ? { ...i, photoUrls: [...(i.photoUrls || []), urls[0]] } : i
          )
        );
        queryClient.invalidateQueries({ queryKey: ['item', id] });
      }
    } catch (err: any) {
      setInlineRapidItems(prev => prev.filter(i => i.id !== tempId));
      showToast('Photo upload failed', 'error');
    }
  };

  const handleInlineCameraAnalyze = async (photos: { blob: Blob; previewUrl: string }[]) => {
    for (const photo of photos) await handleInlineCameraCapture(photo);
    setInlineCameraOpen(false);
    // Explicit post-close refetch so thumbnails update without a page refresh
    queryClient.invalidateQueries({ queryKey: ['item', id] });
  };

  // Intercept mobile swipe-back so it closes the inline camera instead of navigating away
  useEffect(() => {
    if (!inlineCameraOpen) return;
    const closedByBack = { current: false };
    window.history.pushState({ inlineCameraOpen: true }, '');
    const handlePopState = () => {
      closedByBack.current = true;
      setInlineCameraOpen(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (!closedByBack.current) window.history.back();
    };
  }, [inlineCameraOpen]);

  const { data: item, isLoading } = useQuery({
    queryKey: ['item', id],
    queryFn: async () => {
      // S-IDOR-edit-item fix: use the organizer-only, ownership-enforced endpoint
      // instead of the public/shopper-facing GET /items/:id (which never checked
      // ownership: a second signed-in user could load another organizer's item
      // into this edit form even though saving it was already correctly blocked).
      const response = await api.get(`/items/${id}/edit`);
      return response.data;
    },
    enabled: !!id,
  });

  // Feature #603 (2026-08-05): organizer's default best-offer percentages, used ONLY to
  // pre-fill (never override) this item's accept/decline % fields the first time they're
  // touched with no prior value. Small, low-frequency-change fetch -- long staleTime avoids
  // re-fetching on every edit-item page visit in a session.
  const { data: organizerDefaults } = useQuery({
    queryKey: ['organizer-best-offer-defaults'],
    queryFn: async () => {
      const response = await api.get('/organizers/me');
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Discogs Push Section (2026-08-27, UX spec: claude_docs/ux-spotchecks/discogs-push-flow-2026-08-27.md)
  // Auto-fetch eligibility on mount -- same no-manual-button pattern as the shipping-price
  // suggestion already on this page. Skipped entirely once item.discogsListingId is persisted
  // (already pushed) or if Discogs isn't connected (section doesn't render at all -- see JSX gate).
  const [discogsPushPending, setDiscogsPushPending] = useState(false);
  const {
    data: discogsEligibility,
    isLoading: discogsEligibilityLoading,
    isError: discogsEligibilityError,
    refetch: refetchDiscogsEligibility,
  } = useQuery({
    queryKey: ['discogs-eligibility', id],
    queryFn: async () => {
      const response = await api.get(`/discogs/items/${id}/eligibility`);
      return response.data as { eligible: boolean; releaseId: number | null };
    },
    enabled: discogsConnected && !!id && !item?.discogsListingId,
  });

  const discogsPushMutation = useMutation({
    mutationFn: async ({ publish }: { publish: boolean }) => {
      return api.post(`/discogs/items/${id}/listing`, { publish });
    },
    onSuccess: (response, variables) => {
      if (response.data?.success) {
        showToast(variables.publish ? 'Published to Discogs' : 'Pushed to Discogs', 'success');
        queryClient.invalidateQueries({ queryKey: ['item', id] });
      } else {
        showToast('Discogs push failed', 'error');
      }
      setDiscogsPushPending(false);
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to push item to Discogs';
      showToast(msg, 'error');
      setDiscogsPushPending(false);
    },
  });

  const handlePushToDiscogs = async (publish: boolean) => {
    setDiscogsPushPending(true);
    try {
      // Same reasoning as handlePushToEbay: the Discogs payload is built server-side from
      // the persisted Item row (price/condition/description), so save current form state
      // first or a push could send stale data if the organizer edited but hasn't saved yet.
      await saveFormState();
    } catch (err) {
      setDiscogsPushPending(false);
      showToast('Save failed. Fix errors before pushing to Discogs', 'error');
      return;
    }
    discogsPushMutation.mutate({ publish });
  };

  useEffect(() => {
    if (item) {
      // Normalize category to Title Case (e.g. "tools" → "Tools") so the
      // select value matches the option values defined in the form.
      // If category is missing, use empty string (will show placeholder)
      let normalizedCategory = '';
      if (item.category && typeof item.category === 'string') {
        const rawCat = item.category.trim();
        if (rawCat) {
          // Handle various formats: "tools", "Tools", "TOOLS", "vintage" → "Tools", "Vintage"
          // Split on space, title-case each word, then join
          normalizedCategory = rawCat
            .split(' ')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
        }
      }

      // Normalize condition to match standard values: NEW, USED, REFURBISHED, PARTS_OR_REPAIR
      let normalizedCondition = '';
      if (item.condition) {
        const condUpper = item.condition.toUpperCase().trim().replace(/\s+/g, '_');
        const validConditions = ['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR'];
        if (validConditions.includes(condUpper)) {
          normalizedCondition = condUpper;
        } else {
          // Map legacy values
          const legacyMap: Record<string, string> = {
            LIKE_NEW: 'NEW', EXCELLENT: 'NEW',
            GOOD: 'USED', FAIR: 'USED', POOR: 'PARTS_OR_REPAIR',
          };
          normalizedCondition = legacyMap[condUpper] || 'USED';
        }
      }

      setFormData({
        title: item.title || '',
        description: item.description || '',
        price: item.price ? item.price.toString() : '',
        quantity: item.quantity ?? 1,
        stockTotal: item.stockTotal ?? 1,
        category: normalizedCategory,
        ebayCategoryId: item.ebayCategoryId || '',
        ebayCategoryName: item.ebayCategoryName || '',
        condition: normalizedCondition,
        conditionGrade: item.conditionGrade || '',
        tags: item.tags || [],
        status: item.status || 'AVAILABLE',
        listingType: item.listingType || 'FIXED',
        auctionEndTime: item.auctionEndTime ? toDatetimeLocalValue(item.auctionEndTime) : '',
        qrEmbedEnabled: item.qrEmbedEnabled !== false,
        isLegendary: item.isLegendary === true,
        tagColor: item.tagColor || '',
        // Feature #311: Multi-Location Inventory View
        locationId: item.locationId || null,
        // Feature #407/#411
        costBasis: item.costBasis ? item.costBasis.toString() : '',
        roomTag: item.roomTag || '',
        // Shipping dimensions
        packageWeightOz: item.packageWeightOz !== undefined && item.packageWeightOz !== null ? String(item.packageWeightOz) : '',
        packageLengthIn: item.packageLengthIn !== undefined && item.packageLengthIn !== null ? String(item.packageLengthIn) : '',
        packageWidthIn: item.packageWidthIn !== undefined && item.packageWidthIn !== null ? String(item.packageWidthIn) : '',
        packageHeightIn: item.packageHeightIn !== undefined && item.packageHeightIn !== null ? String(item.packageHeightIn) : '',
        packageType: item.packageType || '',
        // Native FindA.Sale checkout shipping (ADR-104 Sec3)
        shippingAvailable: item.shippingAvailable === true,
        shippingPrice: item.shippingPrice !== undefined && item.shippingPrice !== null ? String(item.shippingPrice) : '',
        // Crosslister shipping-payer toggle (2026-08-27)
        crosslisterFreeShipping: item.crosslisterFreeShipping === true,
        // Product identifiers (populated by barcode scan or pre-existing data)
        brand: item.brand || '',
        size: item.size || '',
        color: item.color || '',
        material: item.material || '',
        upc: item.upc || '',
        mpn: item.mpn || '',
        // eBay Best Offers: reverse-compute percentages from stored dollar amounts
        allowBestOffer: item.allowBestOffer === true,
        bestOfferAcceptPct: (() => {
          const price = parseFloat(item.price);
          const amt = item.bestOfferAutoAcceptAmt != null ? parseFloat(item.bestOfferAutoAcceptAmt) : null;
          if (price > 0 && amt != null) return Math.round((1 - amt / price) * 100);
          return '';
        })(),
        bestOfferDeclinePct: (() => {
          const price = parseFloat(item.price);
          const amt = item.bestOfferMinimumAmt != null ? parseFloat(item.bestOfferMinimumAmt) : null;
          if (price > 0 && amt != null) return Math.round((1 - amt / price) * 100);
          return '';
        })(),
        // eBay shipping override
        ebayShippingOverride: item.ebayShippingOverride || null,
        ebayFulfillmentPolicyOverrideId: item.ebayFulfillmentPolicyOverrideId || null,
      });
    }
  }, [item]);

  // Feature #603 (2026-08-05): pre-fill this item's Best Offer accept/decline % fields
  // from the organizer's platform-wide defaults, the FIRST time both fields have no prior
  // value (i.e. the item has never had a per-item percentage set). Runs once per item id
  // (prefillDefaultsAppliedRef) so it never clobbers an organizer who deliberately clears
  // the fields back to blank after this effect already ran once for the same item.
  const prefillDefaultsAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!item || !organizerDefaults || !id) return;
    if (prefillDefaultsAppliedRef.current === String(id)) return;
    const hasNoDefaultToOffer =
      organizerDefaults.defaultBestOfferAcceptPct == null && organizerDefaults.defaultBestOfferDeclinePct == null;
    if (hasNoDefaultToOffer) return;
    prefillDefaultsAppliedRef.current = String(id);
    setFormData((prev) => {
      // Never override an item that already has a value in either field.
      if (prev.bestOfferAcceptPct !== '' || prev.bestOfferDeclinePct !== '') return prev;
      return {
        ...prev,
        bestOfferAcceptPct:
          organizerDefaults.defaultBestOfferAcceptPct != null ? organizerDefaults.defaultBestOfferAcceptPct : prev.bestOfferAcceptPct,
        bestOfferDeclinePct:
          organizerDefaults.defaultBestOfferDeclinePct != null ? organizerDefaults.defaultBestOfferDeclinePct : prev.bestOfferDeclinePct,
      };
    });
  }, [item, organizerDefaults, id]);

  // Smart local pickup detection: nudge when description/notes mention local pickup
  useEffect(() => {
    const localPickupPhrases = /local\s*pickup|pickup\s*only|no\s*shipping|will\s*not\s*ship|local\s*only/i;
    const text = `${formData.description || ''} ${(formData as any).conditionNotes || ''}`;
    if (localPickupPhrases.test(text) && formData.ebayShippingOverride !== 'LOCAL_PICKUP_ONLY') {
      setShowLocalPickupNudge(true);
    }
  }, [formData.description, (formData as any).conditionNotes, formData.ebayShippingOverride]);

  // Load the organizer's eBay fulfillment policies for the per-item override select.
  // Guarded: skip on SIMPLE tier / not connected; on any error leave the list empty so
  // the select stays hidden rather than showing a broken control.
  useEffect(() => {
    if (tier === 'SIMPLE' || !ebayConnected) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/ebay/setup-data');
        const policies = res.data?.fulfillmentPolicies;
        if (!cancelled && Array.isArray(policies)) {
          setEbayFulfillmentPolicies(
            policies.map((p: any) => ({
              fulfillmentPolicyId: p.fulfillmentPolicyId,
              name: p.name,
              classification: p.classification,
            }))
          );
        }
      } catch {
        if (!cancelled) setEbayFulfillmentPolicies([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tier, ebayConnected]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      // Coerce numeric shipping fields from string → number|null (backend zod requires Int)
      const toIntOrNull = (v: string) => {
        const n = parseInt(String(v).trim(), 10);
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      const price = parseFloat(String(formData.price)) || 0;
      const acceptPct = typeof formData.bestOfferAcceptPct === 'number' ? formData.bestOfferAcceptPct : null;
      const declinePct = typeof formData.bestOfferDeclinePct === 'number' ? formData.bestOfferDeclinePct : null;
      const payload = {
        ...formData,
        packageWeightOz: toIntOrNull(formData.packageWeightOz),
        // Same confirm-on-real-edit rule as saveFormState above.
        ...(weightTouched && toIntOrNull(formData.packageWeightOz) !== null
          ? { packageConfirmedByOrganizer: true, packageEstimateSource: 'ORGANIZER' }
          : {}),
        packageLengthIn: toIntOrNull(formData.packageLengthIn),
        packageWidthIn: toIntOrNull(formData.packageWidthIn),
        packageHeightIn: toIntOrNull(formData.packageHeightIn),
        allowBestOffer: formData.allowBestOffer,
        bestOfferAutoAcceptAmt: formData.allowBestOffer && acceptPct !== null && price > 0
          ? parseFloat((price * (1 - acceptPct / 100)).toFixed(2))
          : null,
        bestOfferMinimumAmt: formData.allowBestOffer && declinePct !== null && price > 0
          ? parseFloat((price * (1 - declinePct / 100)).toFixed(2))
          : null,
        ebayShippingOverride: formData.ebayShippingOverride || null,
        ebayFulfillmentPolicyOverrideId: formData.ebayFulfillmentPolicyOverrideId || null,
        // ADR-106 (2026-08-15): only send shippingAvailable/shippingPrice as an
        // explicit organizer edit when the organizer actually touched the shipping
        // checkbox/price input this session (shippingTouched) -- otherwise omit both
        // keys entirely (JSON.stringify drops `undefined` values) so a save of an
        // unrelated field never gets mistaken by the backend for a real shipping edit
        // and never locks shippingPriceConfirmedByOrganizer. Backend auto-suggest keeps
        // pricing this item off the package weight until the organizer really does edit it.
        shippingAvailable: shippingTouched ? formData.shippingAvailable : undefined,
        shippingPrice: shippingTouched
          ? (formData.shippingPrice ? parseFloat(formData.shippingPrice) : null)
          : undefined,
        // Crosslister shipping-payer toggle (2026-08-27) -- always sent as an explicit value
        // (unlike shippingAvailable/shippingPrice above, there's no auto-suggest logic here to
        // protect against overwriting, so no "touched" gate is needed).
        crosslisterFreeShipping: formData.crosslisterFreeShipping,
        // Bug fix (2026-08-08, P1 data corruption): same naive-local-string bug as
        // add-items.tsx / create-sale.tsx -- formData.auctionEndTime comes from
        // <input type="datetime-local"> as a naive local string with no timezone info.
        // Sending it unconverted meant the backend (Node, running in UTC) parsed it via
        // `new Date(str)` AS IF it were already UTC, closing auctions hours early.
        // Convert to a proper UTC ISO string before sending.
        auctionEndTime: formData.auctionEndTime ? new Date(formData.auctionEndTime).toISOString() : null,
        // strip UI-only percentage fields
        bestOfferAcceptPct: undefined,
        bestOfferDeclinePct: undefined,
      };
      return await api.put(`/items/${id}`, payload);
    },
    onSuccess: () => {
      showToast('Item updated', 'success');
      const saleId = item?.saleId;
      if (saleId) {
        router.push(`/organizer/add-items/${saleId}`);
      } else {
        router.push('/organizer/dashboard');
      }
    },
    onError: (error: any) => {
      const status = error.response?.status;
      let message = 'Failed to update item';
      if (status === 400) {
        message = error.response?.data?.message || 'Validation error: please check your input';
      } else if (status === 401) {
        message = 'You are not authorized to update this item';
      } else if (status === 404) {
        message = 'Item not found';
      } else if (status === 500) {
        message = 'Server error: please try again later';
      } else {
        message = error.response?.data?.message || message;
      }
      showToast(message, 'error');
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      return await api.post(`/items/${id}/publish`);
    },
    onSuccess: () => {
      showToast('Item published!', 'success');
      // Refetch the item to update UI with new draftStatus
      queryClient.invalidateQueries({ queryKey: ['item', id] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to publish item';
      showToast(message, 'error');
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: async () => {
      return await api.put(`/items/${id}`, { draftStatus: 'DRAFT' });
    },
    onSuccess: () => {
      showToast('Item unpublished', 'success');
      // Refetch the item to update UI with new draftStatus
      queryClient.invalidateQueries({ queryKey: ['item', id] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to unpublish item';
      showToast(message, 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await api.delete(`/items/${id}`);
    },
    onSuccess: () => {
      showToast('Item deleted', 'success');
      const saleId = item?.saleId;
      if (saleId) {
        router.push(`/organizer/add-items/${saleId}`);
      } else {
        router.push('/organizer/dashboard');
      }
    },
    onError: () => {
      showToast('Failed to delete item', 'error');
    },
  });

  // D-XP-003: Apply organizer discount
  const applyDiscountMutation = useMutation({
    mutationFn: async (xpToSpend: number) => {
      return await api.post(`/items/${id}/organizer-discount`, { xpToSpend });
    },
    onSuccess: (data: any) => {
      showToast('Organizer Special applied!', 'success');
      setDiscountModalOpen(false);
      setPendingXpToSpend(null);
      queryClient.invalidateQueries({ queryKey: ['item', id] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to apply discount';
      showToast(message, 'error');
    },
  });

  // D-XP-003: Remove organizer discount
  const removeDiscountMutation = useMutation({
    mutationFn: async () => {
      return await api.delete(`/items/${id}/organizer-discount`);
    },
    onSuccess: () => {
      showToast('Discount removed (XP was permanently burned)', 'success');
      queryClient.invalidateQueries({ queryKey: ['item', id] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to remove discount';
      showToast(message, 'error');
    },
  });

  // Auth guard: placed after all hooks to comply with Rules of Hooks
  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-800 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <Skeleton className="h-10 w-48 mb-8" />
          <div className="space-y-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-24" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-800 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <Link href="/organizer/dashboard" className="text-amber-600 hover:underline text-sm font-medium mb-4 inline-block">
            Back to dashboard
          </Link>
          <div className="text-center py-16">
            <p className="text-warm-600 dark:text-warm-400 text-lg">Item not found or you don&apos;t have permission to edit it.</p>
          </div>
        </div>
      </div>
    );
  }

  const handlePublishItem = async () => {
    try {
      if (item.draftStatus === 'PUBLISHED') {
        // Unpublish
        await unpublishMutation.mutateAsync();
      } else {
        // Publish
        await publishMutation.mutateAsync();
      }
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to update item status';
      showToast(message, 'error');
    }
  };


  return (
    <>
      <Head>
        <title>Edit Item - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-white dark:bg-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <Link href="/organizer/dashboard" className="text-amber-600 hover:underline text-sm font-medium inline-block">
              Back to dashboard
            </Link>
          </div>

          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100">Edit Item</h1>
            <div className="flex items-center gap-2">
              {id && item && (
                <button
                  type="button"
                  onClick={async () => {
                    const shareUrl = `${window.location.origin}/items/${id}`;
                    const shareData = {
                      title: item.title,
                      text: `${item.title}. Check it out on FindA.Sale`,
                      url: shareUrl,
                    };
                    try {
                      if (navigator.share) {
                        await navigator.share(shareData);
                      } else {
                        await navigator.clipboard.writeText(shareUrl);
                        showToast('Link copied!', 'success');
                      }
                    } catch {
                      await navigator.clipboard.writeText(shareUrl);
                      showToast('Link copied!', 'success');
                    }
                  }}
                  className="bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-medium py-2 px-3 rounded-lg transition-colors text-sm flex items-center gap-1.5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  Share
                </button>
              )}
              {item?.saleId && (
                <Link
                  href={`/organizer/label-composer/${item.saleId}`}
                  className="bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-medium py-2 px-3 rounded-lg transition-colors text-sm flex items-center gap-1.5"
                >
                  🏷️ Label Sheets
                </Link>
              )}
              {id && (
                <button
                  type="button"
                  onClick={handlePrintLabel}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  🏷️ Print Label
                </button>
              )}
            </div>
          </div>

          <form onSubmit={(e) => {
            e.preventDefault();
            if (!formData.title.trim()) {
              showToast('Title is required', 'error');
              return;
            }
            updateMutation.mutate();
          }} className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300">Title</label>
                <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBarcodeScannerOpen(true)}
                  disabled={barcodeLoading}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-700 rounded-lg transition-colors disabled:opacity-50"
                  title="Scan a barcode to prefill product details"
                >
                  {barcodeLoading ? (
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <rect x="2" y="5" width="2" height="14" rx="0.5" />
                      <rect x="6" y="5" width="1" height="14" rx="0.5" />
                      <rect x="9" y="5" width="2" height="14" rx="0.5" />
                      <rect x="13" y="5" width="1" height="14" rx="0.5" />
                      <rect x="16" y="5" width="2" height="14" rx="0.5" />
                      <rect x="20" y="5" width="2" height="14" rx="0.5" />
                    </svg>
                  )}
                  {barcodeLoading ? 'Looking up…' : 'Scan barcode'}
                </button>
                {(item?.photoUrls?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => requestReanalyzeItem(false)}
                      disabled={reanalyzing}
                      title="Re-run Smart tagging on this item's photos"
                      className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {reanalyzing ? 'Working…' : 'Re-analyze'}
                    </button>
                    <button
                      type="button"
                      onClick={() => requestReanalyzeItem(true)}
                      disabled={reanalyzing}
                      title="Look up this item's exact identity from its photos and markings"
                      className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#C8552B] dark:text-[#E08A5F] border border-[#C8552B]/30 dark:border-[#C8552B]/40 rounded-md hover:bg-[#C8552B]/5 dark:hover:bg-[#C8552B]/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Identify precisely
                    </button>
                  </div>
                )}
                </div>
              </div>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <VoiceDescriptionInput
              value={formData.description}
              onChange={(description) => setFormData((prev) => ({ ...prev, description }))}
              itemId={typeof router.query.id === 'string' ? router.query.id : undefined}
              onAppendPersisted={(description) => {
                // S724 Branch B fix: sync react-query cache so the line 276 useEffect
                // (which resets formData when `item` ref changes) doesn't clobber the
                // new description on a subsequent refetch or manual invalidation.
                queryClient.setQueryData(['item', id], (old: any) =>
                  old ? { ...old, description } : old
                );
              }}
              onFieldUpdate={(fields) => {
                setFormData((prev) => {
                  const updates: any = { description: fields.description };
                  if (fields.title && !prev.title) updates.title = fields.title;
                  if (fields.category && !prev.category) updates.category = fields.category;
                  if (fields.price && !prev.price) updates.price = fields.price;
                  if (fields.packageWeightOz && !prev.packageWeightOz) updates.packageWeightOz = fields.packageWeightOz;
                  if (fields.packageLengthIn && !prev.packageLengthIn) updates.packageLengthIn = fields.packageLengthIn;
                  if (fields.packageWidthIn && !prev.packageWidthIn) updates.packageWidthIn = fields.packageWidthIn;
                  if (fields.packageHeightIn && !prev.packageHeightIn) updates.packageHeightIn = fields.packageHeightIn;
                  if (fields.roomTag !== undefined) updates.roomTag = fields.roomTag;
                  if (fields.tags && fields.tags.length > 0) {
                    const newTags = fields.tags.filter((tag: string) => !prev.tags.includes(tag));
                    if (newTags.length > 0) {
                      updates.tags = [...prev.tags, ...newTags];
                    }
                  }
                  return { ...prev, ...updates };
                });
              }}
              existingFields={{
                title: formData.title,
                category: formData.category,
                tags: formData.tags,
                price: formData.price,
                packageWeightOz: formData.packageWeightOz,
                packageLengthIn: formData.packageLengthIn,
                packageWidthIn: formData.packageWidthIn,
                packageHeightIn: formData.packageHeightIn,
                roomTag: formData.roomTag,
              }}
            />

            <EbayCategoryPicker
              value={formData.category}
              ebayCategoryName={formData.ebayCategoryName}
              onChange={({ leafCategoryName, leafCategoryId, l1CategoryName }) =>
                setFormData({
                  ...formData,
                  category: l1CategoryName,
                  ebayCategoryId: leafCategoryId,
                  ebayCategoryName: leafCategoryName,
                })
              }
              label="Category"
              placeholder="Search and select an eBay category..."
            />

            {/* Feature #311: Multi-Location Inventory View */}
            <LocationSelector
              value={formData.locationId}
              onChange={(locationId) => setFormData({ ...formData, locationId })}
              label="Location"
              placeholder="Select a location (optional)"
            />

            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Condition
              </label>
              <select
                value={formData.condition}
                onChange={(e) =>
                  setFormData({ ...formData, condition: e.target.value })
                }
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Select condition</option>
                <option value="NEW">New</option>
                <option value="USED">Used</option>
                <option value="REFURBISHED">Refurbished</option>
                <option value="PARTS_OR_REPAIR">Parts or Repair</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Brand
              </label>
              <input
                type="text"
                value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                placeholder="e.g. Danner, Sony, Pyrex. Leave blank if unbranded"
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
              <div className="text-xs text-gray-400 mt-0.5">
                Required by eBay for many categories. Your value is always used exactly as entered.
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Size <span className="text-warm-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.size}
                  onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                  placeholder="e.g. Medium, 10, 32x34"
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Color <span className="text-warm-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="e.g. Navy Blue"
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Material <span className="text-warm-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.material}
                  onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                  placeholder="e.g. Cotton, Leather"
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
            <div className="text-xs text-gray-400 -mt-1">
              Used by clothing/apparel-style marketplace listings (Poshmark, Mercari, Vinted, Grailed) and eBay item specifics. Leave blank if not applicable.
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  MPN <span className="text-warm-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.mpn}
                  onChange={(e) => setFormData({ ...formData, mpn: e.target.value })}
                  placeholder="Manufacturer part #"
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  UPC <span className="text-warm-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.upc}
                  onChange={(e) => setFormData({ ...formData, upc: e.target.value })}
                  placeholder="Barcode number"
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Catalog enrichment suggestions: additive, renders only when present.
                Accepting fills the form field; existing Save flow persists it. */}
            {item?.catalogSuggestions && (
              <CatalogSuggestionPanel
                suggestions={item.catalogSuggestions}
                onAccept={(field, value) =>
                  setFormData((prev) => ({ ...prev, [field]: value }))
                }
              />
            )}

            {/* #64: Condition Grade Picker */}
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Condition Grade
              </label>
              <div className="flex gap-2">
                {(['S','A','B','C','D'] as const).map(grade => {
                  const labels: Record<string, string> = { S:'Like New', A:'Excellent', B:'Good', C:'Fair', D:'Poor' };
                  return (
                    <button
                      key={grade}
                      type="button"
                      onClick={() => setFormData({ ...formData, conditionGrade: grade })}
                      className={`flex-1 py-1.5 text-xs font-bold rounded border transition-colors ${formData.conditionGrade === grade ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-indigo-400'}`}
                      title={labels[grade]}
                    >
                      {grade}
                    </button>
                  );
                })}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {(['S','A','B','C','D'] as const).map(g => {
                  const labels: Record<string, string> = { S:'Like New', A:'Excellent', B:'Good', C:'Fair', D:'Poor' };
                  return `${g}=${labels[g]}`;
                }).join(' · ')}
              </div>
            </div>

            {/* Sprint 1: Tag Picker */}
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">Tags</label>

              {/* BUG 4 FIX: Removed curated tag list (AI already suggests tags) */}
              {/* Custom tag input */}
              <div className="mb-2">
                <input
                  type="text"
                  placeholder="Add a custom tag..."
                  className="w-full border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  aria-label="Add a custom tag..." onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const value = (e.target as HTMLInputElement).value.trim();
                      if (value && !formData.tags.includes(value)) {
                        setFormData({ ...formData, tags: [...formData.tags, value] });
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }}
                />
              </div>

              {/* Current tags display */}
              <div className="flex flex-wrap gap-1">
                {formData.tags.map(tag => (
                  <span key={tag} className="inline-flex items-center bg-indigo-50 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 text-xs px-2 py-0.5 rounded-full">
                    {tag}
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) })}
                      className="ml-1 text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-bold"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Feature #310: Tag Color for discount rules */}
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Tag Color
              </label>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <input
                    type="text"
                    value={formData.tagColor}
                    onChange={(e) =>
                      setFormData({ ...formData, tagColor: e.target.value })
                    }
                    placeholder="e.g., #EF4444 or red"
                    className="w-full border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                   aria-label="e.g., #EF4444 or red" />
                  <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                    Used for color-coded discount rules
                  </p>
                </div>
                {formData.tagColor && (
                  <div
                    className="w-10 h-10 rounded-lg border-2 border-warm-300 dark:border-gray-500 flex-shrink-0"
                    style={{ backgroundColor: formData.tagColor }}
                    title="Color preview"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Price
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.price}
                onChange={(e) =>
                  setFormData({ ...formData, price: e.target.value })
                }
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              />

              {/* Smart Price Suggestion (multi-source pricing engine, 2026-08-24): manual
                  re-trigger since descriptions/photos can change after the initial scan.
                  Refresh-only — never auto-writes price, organizer must click Use $X. */}
              <div className="mt-3 mb-1">
                <PriceSuggestion
                  itemId={id as string}
                  title={formData.title}
                  category={formData.category}
                  condition={formData.condition}
                  conditionGrade={formData.conditionGrade}
                  photoUrls={item?.photoUrls}
                  currentPrice={formData.price ? parseFloat(formData.price) : undefined}
                  autoRefreshToken={priceRefreshToken}
                  onApplyPrice={(price) => setFormData({ ...formData, price: String(price) })}
                />
              </div>

              {/* Encyclopedia Inline Tip: price guidance from Encyclopedia */}
              <EncyclopediaInlineTip
                category={formData.category}
                tags={formData.tags}
                title={formData.title}
              />
              {/* eBay Comp Tiles: comparable sales reference */}
              {id && <EbayCompTiles itemId={id as string} />}

              {/* Feature #338: Multi-source pricing comp summary: auto-fetches on load */}
              {id && <PricingCompSummary itemId={id as string} itemTitle={formData.title} />}

              {/* Price Research Panel: consolidated pricing tools */}
              <div className="mt-3">
                {id && (
                  <PriceResearchPanel
                    itemId={id as string}
                    itemTitle={formData.title}
                    itemDescription={formData.description}
                    category={formData.category}
                    condition={formData.condition}
                    currentPrice={formData.price ? parseFloat(formData.price) : undefined}
                    photoUrls={item?.photoUrls}
                    collapsed={false}
                    onPriceSelect={(price) =>
                      setFormData({
                        ...formData,
                        price: price.toString(),
                      })
                    }
                  />
                )}
              </div>

              {/* Price History Chart */}
              {id && <ItemPriceHistoryChart itemId={id as string} currentPrice={formData.price ? parseFloat(formData.price) : undefined} />}

              {/* Pricing Signals: Sleeper patterns & brand premiums */}
              {id && <PricingSignalBanners itemId={id as string} currentPrice={formData.price ? parseFloat(formData.price) : undefined} />}
            </div>

            {/* Feature #407: Flip Tracker ROI: Cost Basis */}
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Cost Basis <span className="text-warm-400 dark:text-warm-500 font-normal">(optional)</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.costBasis}
                onChange={(e) => setFormData({ ...formData, costBasis: e.target.value })}
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">What did you pay for this? Used to calculate ROI in Flip Report.</p>
            </div>

            {/* Feature #411: Dorm Dash: Room / Area Tag */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300">
                  Room / Area Tag <span className="text-warm-400 dark:text-warm-500 font-normal">(optional)</span>
                </label>
              </div>
              <input
                type="text"
                placeholder="e.g. Bedroom, Garage, Study, Room 204"
                value={formData.roomTag}
                onChange={(e) => setFormData({ ...formData, roomTag: e.target.value })}
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Helps shoppers find items by location at Dorm Dash or multi-room sales.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Lot / bundle size
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={quantityText}
                onChange={(e) => setQuantityText(e.target.value)}
                onBlur={() => {
                  const parsed = Math.max(1, parseInt(quantityText, 10) || 1);
                  setQuantityText(String(parsed));
                  setFormData({ ...formData, quantity: parsed });
                }}
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">How many pieces are bundled together and sold as one lot (e.g. "set of 8" sold together). This is not your sellable stock count.</p>
            </div>

            {/* ADR-087 P1: "Units available" = the real independently-sellable stock pool (stockTotal). */}
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Units available
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={stockTotalText}
                onChange={(e) => setStockTotalText(e.target.value)}
                onBlur={() => {
                  const parsed = Math.max(1, parseInt(stockTotalText, 10) || 1);
                  setStockTotalText(String(parsed));
                  setFormData({ ...formData, stockTotal: parsed });
                }}
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">How many separate units of this item you have to sell. Each sale &mdash; in person, at POS, or on a connected marketplace &mdash; draws one unit from this pool, and the item stays listed until every unit is gone. Leave at 1 for a single item.</p>
              {formData.quantity > 1 && (formData.stockTotal ?? 1) <= 1 && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 flex items-start gap-1">
                  <span aria-hidden="true">&#9888;</span>
                  <span>This item&apos;s stock pool isn&apos;t set &mdash; shoppers and marketplaces will see only 1 available. Set &ldquo;Units available&rdquo; to your real number of units.</span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value })
                }
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              >
                <option value="AVAILABLE">Available</option>
                <option value="SOLD">Sold</option>
                <option value="UNAVAILABLE">Unavailable</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Listing Type
              </label>
              <select
                value={formData.listingType}
                onChange={(e) =>
                  setFormData({ ...formData, listingType: e.target.value })
                }
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              >
                <option value="FIXED">Fixed Price</option>
                <option value="AUCTION">Auction</option>
                <option value="REVERSE_AUCTION">Reverse Auction</option>
              </select>
            </div>

            {/* Auction End Time - show only for auction items */}
            {(formData.listingType === 'AUCTION' || formData.listingType === 'REVERSE_AUCTION') && (
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Auction End Time
                </label>
                <input
                  type="datetime-local"
                  value={formData.auctionEndTime}
                  onChange={(e) => setFormData({ ...formData, auctionEndTime: e.target.value })}
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                  Default: night before sale starts at 8:00 PM
                </p>
              </div>
            )}

                        {/* Phase 16: Photo management */}
            {item && (
              <div>
                {/* Hidden file input for upload-files button */}
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => handlePhotoUpload(e.target.files, 'upload')}
                />
                <ItemPhotoManager
                  itemId={String(id)}
                  initialPhotos={item.photoUrls || []}
                  headerActions={
                    <div className="flex gap-1">
                      <button
                        type="button"
                        title="Upload files"
                        onClick={() => uploadInputRef.current?.click()}
                        className="w-8 h-8 flex items-center justify-center bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-800 text-base"
                      >
                        📁
                      </button>
                      <button
                        type="button"
                        title="Camera"
                        onClick={() => {
                          setInlineRapidItems(item ? [{ id: String(id), thumbnailUrl: item.photoUrls?.[0], draftStatus: 'PENDING_REVIEW', title: item.title, photoUrls: item.photoUrls }] : []);
                          setInlineCaptureMode('regular');
                          setInlineCameraOpen(true);
                        }}
                        className="w-8 h-8 flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 text-base"
                      >
                        📷
                      </button>
                      <button
                        type="button"
                        title="Rapidfire"
                        onClick={() => {
                          setInlineRapidItems(item ? [{ id: String(id), thumbnailUrl: item.photoUrls?.[0], draftStatus: 'PENDING_REVIEW', title: item.title, photoUrls: item.photoUrls }] : []);
                          setInlineCaptureMode('rapidfire');
                          setInlineCameraOpen(true);
                        }}
                        className="w-8 h-8 flex items-center justify-center bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-800 text-base"
                      >
                        ⚡
                      </button>
                    </div>
                  }
                />
              </div>
            )}

            {/* Feature #136: QR Code Auto-Embedding toggle */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="qrEmbedEnabled"
                checked={formData.qrEmbedEnabled}
                onChange={(e) => setFormData({ ...formData, qrEmbedEnabled: e.target.checked })}
                className="w-4 h-4 text-amber-600 bg-white dark:bg-warm-700 border-warm-300 dark:border-warm-500 rounded focus:ring-2 focus:ring-amber-500 cursor-pointer"
              />
              <label htmlFor="qrEmbedEnabled" className="text-sm font-medium text-warm-700 dark:text-warm-300 cursor-pointer">
                Embed QR code in exported photos
              </label>
              <p className="text-xs text-warm-500 dark:text-warm-400">
                QR codes link to this item&apos;s page on FindA.Sale
              </p>
            </div>

            {/* Legendary suggestion banner (shows when price >= $75 and not already legendary) */}
            {parseFloat(formData.price) >= 75 && !formData.isLegendary && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">⭐</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                      This item is priced at ${parseFloat(formData.price).toFixed(2)}. Consider marking it Legendary to give Hunt Pass holders early access.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isLegendary: true })}
                    className="flex-shrink-0 bg-amber-600 hover:bg-amber-700 text-white font-bold py-1 px-3 rounded text-sm transition-colors"
                  >
                    Mark as Legendary
                  </button>
                </div>
              </div>
            )}

            {/* Mark as Legendary toggle */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="isLegendary"
                  checked={formData.isLegendary}
                  onChange={(e) => setFormData({ ...formData, isLegendary: e.target.checked })}
                  className="w-4 h-4 text-amber-600 bg-white dark:bg-warm-700 border-warm-300 dark:border-warm-500 rounded focus:ring-2 focus:ring-amber-500 cursor-pointer mt-1"
                />
                <div className="flex-1">
                  <label htmlFor="isLegendary" className="text-sm font-bold text-amber-900 dark:text-amber-100 cursor-pointer block">
                    Mark as Legendary
                  </label>
                  <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
                    Legendary items are shown to Hunt Pass subscribers 6 hours before regular release.
                  </p>
                </div>
              </div>
            </div>

            {/* D-XP-003: Organizer Special Section */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100">Organizer Special</h3>
                {item.organizerDiscountAmount && item.organizerDiscountAmount > 0 && (
                  <span className="inline-block bg-amber-600 text-white text-xs font-bold px-2 py-1 rounded">
                    ${parseFloat(item.organizerDiscountAmount.toString()).toFixed(2)} off
                  </span>
                )}
              </div>

              {item.organizerDiscountAmount && item.organizerDiscountAmount > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-warm-600 dark:text-warm-300">
                    This item currently has an Organizer Special discount applied for ${parseFloat(item.organizerDiscountAmount.toString()).toFixed(2)} off.
                  </p>
                  <button
                    type="button"
                    onClick={() => removeDiscountMutation.mutate()}
                    disabled={removeDiscountMutation.isPending}
                    className="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {removeDiscountMutation.isPending ? 'Removing...' : 'Remove Discount'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-warm-600 dark:text-warm-300">
                    Spend XP to create a shopper-facing discount on this item. No stacking with shopper coupons.
                  </p>
                  <p className="text-xs text-warm-500 dark:text-warm-400">
                    Your XP Balance: <span className="font-semibold">{user?.guildXp || 0} XP</span>
                  </p>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-warm-700 dark:text-warm-300">
                      Select Discount Amount
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openDiscountModal(200)}
                        disabled={!user || (user.guildXp || 0) < 200}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        $2 off (200 XP)
                      </button>
                      <button
                        type="button"
                        onClick={() => openDiscountModal(400)}
                        disabled={!user || (user.guildXp || 0) < 400}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        $4 off (400 XP)
                      </button>
                      <button
                        type="button"
                        onClick={() => openDiscountModal(500)}
                        disabled={!user || (user.guildXp || 0) < 500}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        $5 off (500 XP)
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>

              <button
                type="button"
                disabled={publishMutation.isPending || unpublishMutation.isPending}
                onClick={handlePublishItem}
                className={`flex-1 font-bold py-2 px-4 rounded-lg disabled:opacity-50 ${
                  item.draftStatus === 'PUBLISHED'
                    ? 'bg-gray-500 hover:bg-gray-600 text-white'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {publishMutation.isPending || unpublishMutation.isPending
                  ? 'Updating...'
                  : item.draftStatus === 'PUBLISHED'
                    ? 'Unpublish'
                    : 'Publish'}
              </button>
            </div>

            {/* Native FindA.Sale checkout shipping (ADR-104 Sec3): independent of eBay/
                tier: applies to every organizer's own Stripe checkout, not just PRO/TEAMS
                eBay sellers. shippingAvailable/shippingPrice feed stripeController.ts
                directly (Item.shippingPrice is charged to the buyer as-is at checkout). */}
            <div className="pt-4 border-t border-warm-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-warm-700 dark:text-warm-300 mb-3">Shipping (FindA.Sale Checkout)</h3>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="shipping-available"
                  checked={formData.shippingAvailable}
                  onChange={(e) => {
                    setShippingTouched(true);
                    setFormData(prev => ({ ...prev, shippingAvailable: e.target.checked }));
                  }}
                  className="h-4 w-4 rounded border-gray-300 accent-blue-600"
                />
                <label htmlFor="shipping-available" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                  Offer shipping for this item
                </label>
              </div>
              {/* ADR-106 (2026-08-15): the checkbox above already reflects the backend's
                  auto-computed value on load (formData.shippingAvailable is seeded from
                  item.shippingAvailable) -- this badge just discloses WHY it's pre-checked
                  with a price already filled in, mirroring the "Estimated" provenance badge
                  used for package weight below. Hidden the moment the organizer touches
                  shipping themselves (shippingTouched) or has already confirmed it before. */}
              {formData.shippingAvailable &&
                item?.shippingPriceSource === 'AUTO' &&
                item?.shippingPriceConfirmedByOrganizer !== true &&
                !shippingTouched && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Auto-priced from real carrier rates. Edit the price below if you want to change it.
                  </p>
              )}
              {formData.shippingAvailable && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">
                    Shipping Price ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.shippingPrice}
                    onChange={(e) => {
                      setShippingTouched(true);
                      setFormData({ ...formData, shippingPrice: e.target.value });
                    }}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                  {/* ADR-104 Sec3: computed suggestion, real carrier rates grossed up for
                      FindA.Sale's own platform fee (not eBay's FVF) -- shown only while the
                      field is empty, never auto-filled. Fails silently (hint just doesn't
                      appear) if the suggestion call errors -- must never block Save. */}
                  {!formData.shippingPrice && shippingSuggestionLoading && (
                    <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Getting a suggested price…</p>
                  )}
                  {!formData.shippingPrice && !shippingSuggestionLoading && shippingSuggestion && (
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-warm-600 dark:text-warm-400">
                        Suggested: {'$' + shippingSuggestion.suggestedPrice.toFixed(2)} based on real carrier rates
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShippingTouched(true);
                          setFormData((prev) => ({ ...prev, shippingPrice: shippingSuggestion.suggestedPrice.toFixed(2) }));
                        }}
                        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Use this
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Charged to the buyer at checkout. Suggested prices already include our platform fee so you don&apos;t come up short.
                  </p>
                </div>
              )}
            </div>

            {/* Crosslister shipping-payer toggle (2026-08-27): separate from the native-checkout
                block above. Applies to marketplaces this item gets cross-listed to via the
                browser extension (Mercari today; more later). Defaults unchecked (buyer pays) --
                a real Mercari listing cost real money when this was left at Mercari's own
                free-shipping default before this toggle existed. */}
            <div className="pt-4 border-t border-warm-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-warm-700 dark:text-warm-300 mb-3">Shipping (Cross-listed Marketplaces)</h3>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="crosslister-free-shipping"
                  checked={formData.crosslisterFreeShipping}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, crosslisterFreeShipping: e.target.checked }));
                  }}
                  className="h-4 w-4 rounded border-gray-300 accent-blue-600"
                />
                <label htmlFor="crosslister-free-shipping" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                  Offer free shipping when cross-listed to other marketplaces (Mercari, etc.)
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Unchecked means the buyer pays shipping on Mercari and similar marketplaces. Checking this means you absorb the shipping cost there instead.
              </p>
            </div>

            {/* Shipping Dimensions: shown for PRO/TEAMS (eBay shipping requires dimensions) */}
            {tier !== 'SIMPLE' && (
              <div className="pt-4 border-t border-warm-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-warm-700 dark:text-warm-300 mb-3">Shipping Dimensions</h3>
                <div className="space-y-3">
                  {ebayFulfillmentPolicies.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">
                        eBay Shipping Policy
                      </label>
                      <select
                        value={formData.ebayFulfillmentPolicyOverrideId || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, ebayFulfillmentPolicyOverrideId: e.target.value || null })
                        }
                        className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="">Auto (recommended)</option>
                        {ebayFulfillmentPolicies.map((p) => (
                          <option key={p.fulfillmentPolicyId} value={p.fulfillmentPolicyId}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Auto uses your eBay Settings default. Pick a specific policy to set shipping for just this item.
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">
                      Package Type
                    </label>
                    <select
                      value={formData.packageType}
                      onChange={(e) => setFormData({ ...formData, packageType: e.target.value })}
                      className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">Select package type</option>
                      <option value="MAILING_BOX">Box (standard)</option>
                      <option value="PARCEL_OR_PADDED_ENVELOPE">Parcel / Padded Envelope</option>
                      <option value="PADDED_BAGS">Padded Bag</option>
                      <option value="LARGE_ENVELOPE">Large Envelope</option>
                      <option value="PACKAGE_THICK_ENVELOPE">Thick Envelope</option>
                      <option value="LETTER">Letter</option>
                      <option value="USPS_FLAT_RATE_ENVELOPE">USPS Flat Rate Envelope</option>
                      <option value="USPS_LARGE_PACK">USPS Large Pack</option>
                      <option value="UPS_LETTER">UPS Letter</option>
                      <option value="ROLL">Roll / Tube</option>
                      <option value="TOUGH_BAGS">Tough Bag</option>
                      <option value="WINE_PRESENTATION_BOX">Wine Presentation Box</option>
                      <option value="EXTRA_LARGE_PACK">Extra Large Pack</option>
                      <option value="VERY_LARGE_PACK">Very Large Pack</option>
                      <option value="BULKY_GOODS">Bulky Goods</option>
                      <option value="FURNITURE">Furniture</option>
                      <option value="ONE_WAY_PALLET">Pallet (one-way)</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Soft-sided or padded packaging (Parcel/Padded Envelope, Padded Bag,
                      Roll/Tube, Tough Bag), items over 50 lb, or boxes longer than 48in can
                      add a carrier handling surcharge to the shipping cost.
                    </p>
                    {(() => {
                      // ADR-103 Phase 5: organizer-facing guidance on what triggers a
                      // carrier oversize/handling surcharge and how to avoid it. Mirrors
                      // the AHS_PACKAGING_TYPES set and dimension thresholds in
                      // ebayRateEstimateService.ts (backend) -- kept as a local literal
                      // here per this project's "frontend never imports @findasale/shared"
                      // rule, not computed from a live rate call.
                      const AHS_PACKAGING_TYPES = new Set([
                        'ROLL',
                        'TOUGH_BAGS',
                        'PARCEL_OR_PADDED_ENVELOPE',
                        'PADDED_BAGS',
                      ]);
                      const lengthIn = parseFloat(formData.packageLengthIn || '') || 0;
                      const widthIn = parseFloat(formData.packageWidthIn || '') || 0;
                      const heightIn = parseFloat(formData.packageHeightIn || '') || 0;
                      const weightLb = (parseFloat(formData.packageWeightOz || '') || 0) / 16;
                      const dimsSorted = [lengthIn, widthIn, heightIn].sort((a, b) => b - a);
                      const packagingTrigger = AHS_PACKAGING_TYPES.has(formData.packageType);
                      const dimensionTrigger = dimsSorted[0] > 48 || dimsSorted[1] > 30;
                      const weightTrigger = weightLb > 50;
                      if (!packagingTrigger && !dimensionTrigger && !weightTrigger) return null;
                      return (
                        <div className="mt-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-xs text-amber-800 dark:text-amber-200">
                          <p className="font-medium">This item will likely carry a carrier handling surcharge.</p>
                          <p className="mt-1">
                            {packagingTrigger &&
                              'Soft-sided or padded packaging costs more to handle than a rigid box. '}
                            {dimensionTrigger &&
                              'A side longer than 48in (or a second side over 30in) triggers an oversize fee. '}
                            {weightTrigger && 'Items over 50 lb trigger a weight handling fee. '}
                            To avoid it, box the item in a rigid corrugated container sized to
                            its actual dimensions (e.g. a golf bag or guitar case shipped bare
                            triggers this: boxed, it often doesn&apos;t).
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                  {item?.packageConfirmedByOrganizer !== true && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        type="button"
                        onClick={handleGetPackageEstimate}
                        disabled={packageEstimateLoading}
                        className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {packageEstimateLoading ? 'Getting estimate…' : 'Get Smart weight & size estimate'}
                      </button>
                      {/* S-QA-2026-08-06: root-caused live -- an organizer whose displayed weight/dims
                          are ALREADY correct had no way to confirm them, because the only confirm path
                          was "edit the Weight field" (weightTouched), and retyping the SAME number never
                          fires React's onChange (no value delta = no input event = weightTouched stays
                          false forever), silently blocking eBay publish on EBAY_WEIGHT_NOT_CONFIRMED with
                          no way out short of a real value change. This button confirms directly, with no
                          dummy edit required. */}
                      {formData.packageWeightOz && (
                        <button
                          type="button"
                          onClick={() => setWeightTouched(true)}
                          className="text-sm font-medium text-green-600 dark:text-green-400 hover:underline"
                        >
                          {weightTouched ? '✓ Confirmed -- will save' : 'This is correct as shown'}
                        </button>
                      )}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">
                      Weight (oz)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="e.g. 16"
                      value={formData.packageWeightOz}
                      onChange={(e) => {
                        setWeightTouched(true);
                        setFormData({ ...formData, packageWeightOz: e.target.value });
                      }}
                      className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                    />
                    {/* ADR fb-package-weight-estimator (2026-07-22): packageWeightOz now gets
                        auto-filled by resolvePublishPackageWeight (eBay publish + FB extension
                        queue both persist an estimate here when the organizer hasn't). Surface
                        that provenance instead of showing a bare number indistinguishable from
                        one the organizer typed themselves. */}
                    {formData.packageWeightOz && !item?.packageConfirmedByOrganizer && item?.packageEstimateSource && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        Estimated
                        {item.packageEstimateSource === 'KEYWORD' || item.packageEstimateSource === 'CATEGORY'
                          ? ' (category default)'
                          : item.packageEstimateSource === 'AI'
                          ? ' (Auto guess from photo)'
                          : item.packageEstimateSource === 'SEED'
                          ? ' (generic default)'
                          : ''}
                        {'. Not your input. Edit this field to enter a real measurement.'}
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">
                        Length (in)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="0.0"
                        value={formData.packageLengthIn}
                        onChange={(e) => setFormData({ ...formData, packageLengthIn: e.target.value })}
                        className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">
                        Width (in)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="0.0"
                        value={formData.packageWidthIn}
                        onChange={(e) => setFormData({ ...formData, packageWidthIn: e.target.value })}
                        className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">
                        Height (in)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="0.0"
                        value={formData.packageHeightIn}
                        onChange={(e) => setFormData({ ...formData, packageHeightIn: e.target.value })}
                        className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  {/* Shipping net preview: buyer cost + organizer net estimate */}
                  {formData.packageWeightOz && (
                    <div className="mt-3">
                      <ShippingNetPreview
                        itemId={id as string}
                        itemPrice={formData.price ? parseFloat(formData.price) : undefined}
                        weightOz={formData.packageWeightOz ? parseInt(formData.packageWeightOz, 10) : undefined}
                        dims={{
                          length: formData.packageLengthIn ? parseFloat(formData.packageLengthIn) : undefined,
                          width: formData.packageWidthIn ? parseFloat(formData.packageWidthIn) : undefined,
                          height: formData.packageHeightIn ? parseFloat(formData.packageHeightIn) : undefined,
                        }}
                        ebayCategoryId={formData.ebayCategoryId || null}
                        onApplySuggestedPrice={(price) =>
                          setFormData((prev) => ({ ...prev, price: price.toFixed(2) }))
                        }
                      />
                    </div>
                  )}

                  {/* Local Pickup checkbox */}
                  <div className="mt-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="local-pickup"
                        checked={formData.ebayShippingOverride === 'LOCAL_PICKUP_ONLY'}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          ebayShippingOverride: e.target.checked ? 'LOCAL_PICKUP_ONLY' : null,
                        }))}
                        className="h-4 w-4 rounded border-gray-300 accent-blue-600"
                      />
                      <label htmlFor="local-pickup" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                        Local pickup only (no shipping)
                      </label>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 ml-6">
                      When checked, this item uses a local pickup policy on eBay and is hidden from Google Shopping, instead of calculated/flat-rate shipping.
                    </p>
                    {showLocalPickupNudge && formData.ebayShippingOverride !== 'LOCAL_PICKUP_ONLY' && (
                      <div className="mt-2 flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-700 dark:text-blue-300">
                        <span>We detected &quot;local pickup&quot; in your notes. Enable local pickup mode for eBay?</span>
                        <button
                          type="button"
                          onClick={() => { setFormData(prev => ({ ...prev, ebayShippingOverride: 'LOCAL_PICKUP_ONLY' })); setShowLocalPickupNudge(false); }}
                          className="underline ml-1 whitespace-nowrap"
                        >Enable</button>
                        <button
                          type="button"
                          onClick={() => setShowLocalPickupNudge(false)}
                          className="underline ml-1"
                        >Dismiss</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* eBay Best Offers Section */}
            {tier !== 'SIMPLE' && (
              <div className="pt-4 border-t border-warm-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-warm-700 dark:text-warm-300 mb-3">Best Offers</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="allowBestOffer"
                      checked={formData.allowBestOffer}
                      onChange={(e) => setFormData(prev => ({ ...prev, allowBestOffer: e.target.checked }))}
                      className="h-4 w-4 rounded border-gray-300 accent-blue-600"
                    />
                    <label htmlFor="allowBestOffer" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                      Accept Best Offers on eBay
                    </label>
                  </div>

                  {formData.allowBestOffer && (() => {
                    const currentPrice = parseFloat(String(formData.price)) || 0;
                    const acceptPct = typeof formData.bestOfferAcceptPct === 'number' ? formData.bestOfferAcceptPct : null;
                    const declinePct = typeof formData.bestOfferDeclinePct === 'number' ? formData.bestOfferDeclinePct : null;
                    const acceptDollar = acceptPct !== null && currentPrice > 0
                      ? (currentPrice * (1 - acceptPct / 100)).toFixed(2)
                      : null;
                    const declineDollar = declinePct !== null && currentPrice > 0
                      ? (currentPrice * (1 - declinePct / 100)).toFixed(2)
                      : null;
                    const thresholdError = acceptPct !== null && declinePct !== null && declinePct <= acceptPct
                      ? 'Auto-decline threshold must be higher than auto-accept threshold.'
                      : null;
                    return (
                      <div className="ml-6 space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Auto-accept offers above: <span className="font-normal">% of price</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              max="99"
                              step="1"
                              placeholder="e.g. 10"
                              value={formData.bestOfferAcceptPct === '' ? '' : formData.bestOfferAcceptPct}
                              onChange={(e) => {
                                const v = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                                setFormData(prev => ({ ...prev, bestOfferAcceptPct: v as number | '' }));
                              }}
                              className="w-24 px-3 py-1.5 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-500">%</span>
                            {acceptDollar && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                → offers above <span className="font-semibold text-green-600 dark:text-green-400">${acceptDollar}</span> will be auto-accepted
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Auto-decline offers below: <span className="font-normal">% of price</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              max="99"
                              step="1"
                              placeholder="e.g. 25"
                              value={formData.bestOfferDeclinePct === '' ? '' : formData.bestOfferDeclinePct}
                              onChange={(e) => {
                                const v = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                                setFormData(prev => ({ ...prev, bestOfferDeclinePct: v as number | '' }));
                              }}
                              className="w-24 px-3 py-1.5 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-500">%</span>
                            {declineDollar && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                → offers below <span className="font-semibold text-red-600 dark:text-red-400">${declineDollar}</span> will be auto-declined
                              </span>
                            )}
                          </div>
                        </div>
                        {thresholdError && (
                          <p className="text-xs text-red-600 dark:text-red-400">{thresholdError}</p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* eBay Push Section: S725 three states: Live / Pending Publish / Push */}
            {tier !== 'SIMPLE' && (
              <div className="pt-4 border-t border-warm-200 dark:border-gray-700">
                {/* Pre-publish hint (2026-07-16): warn about eBay 25016 (sub-$0.99)
                    and 25101 (shippable item with no weight) BEFORE the organizer
                    clicks Push/Publish. Backend guard is authoritative; this mirrors
                    it for a friendlier upfront nudge. */}
                {(() => {
                  const priceNum = formData.price ? parseFloat(String(formData.price)) : NaN;
                  const priceBelowMin = !Number.isNaN(priceNum) && priceNum > 0 && priceNum < 0.99;
                  const weightNum = formData.packageWeightOz ? parseInt(String(formData.packageWeightOz), 10) : 0;
                  const isLocalPickup = formData.ebayShippingOverride === 'LOCAL_PICKUP_ONLY';
                  const missingWeight = !isLocalPickup && (!weightNum || weightNum <= 0);
                  if (!priceBelowMin && !missingWeight) return null;
                  return (
                    <div className="mb-2 p-2 rounded bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-300 space-y-1">
                      {priceBelowMin && (
                        <div>eBay requires a minimum listing price of $0.99. Raise this item&apos;s price to list it on eBay.</div>
                      )}
                      {missingWeight && (
                        <div>No weight set. We&apos;ll auto-estimate shipping for you when you publish. To use your own weight instead, add one above or check &quot;Local pickup only&quot;.</div>
                      )}
                    </div>
                  );
                })()}
                {item?.ebayListingId ? (
                  <div className="space-y-2">
                    <div className="inline-block bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 text-xs font-semibold px-2 py-1 rounded">
                      Live on eBay
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={`https://www.ebay.com/itm/${item.ebayListingId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-block text-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                      >
                        View on eBay
                      </a>
                      <button
                        type="button"
                        onClick={handlePushToEbay}
                        disabled={ebayPushPending}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {ebayPushPending ? 'Pushing...' : 'Re-push to eBay'}
                      </button>
                    </div>
                  </div>
                ) : item?.ebayOfferId ? (
                  <div className="space-y-2">
                    <div className="inline-block bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-200 text-xs font-semibold px-2 py-1 rounded">
                      Pending Publish
                    </div>
                    <button
                      type="button"
                      onClick={handlePublishNow}
                      disabled={ebayPushPending || !ebayConnected}
                      title="Publish this draft offer live on eBay now"
                      className={`w-full font-bold py-2 px-4 rounded-lg transition-colors ${
                        ebayConnected
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-gray-400 text-gray-600 cursor-not-allowed'
                      } disabled:opacity-50`}
                    >
                      {ebayPushPending ? 'Publishing...' : 'Publish to eBay now'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handlePushToEbay}
                    disabled={ebayPushPending || !ebayConnected}
                    title={!ebayConnected ? 'Connect eBay in Settings first' : 'Publish live to eBay immediately'}
                    className={`w-full font-bold py-2 px-4 rounded-lg transition-colors ${
                      ebayConnected
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-gray-400 text-gray-600 cursor-not-allowed'
                    } disabled:opacity-50`}
                  >
                    {ebayPushPending ? 'Pushing...' : 'Push to eBay'}
                  </button>
                )}
              </div>
            )}

            {/* Discogs Push Section (2026-08-27) -- gated entirely on connection status per
                UX spec: if not connected, render nothing at all (avoids clutter on the ~95%
                of items/organizers this never applies to). */}
            {discogsConnected && (
              <div className="pt-4 border-t border-warm-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-warm-700 dark:text-gray-300 mb-2">Discogs</h3>
                {item?.discogsListingId ? (
                  <div className="space-y-2">
                    <div className="inline-block bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 text-xs font-semibold px-2 py-1 rounded">
                      Pushed to Discogs
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={`https://www.discogs.com/sell/item/${item.discogsListingId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-block text-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                      >
                        View listing
                      </a>
                      <button
                        type="button"
                        onClick={() => handlePushToDiscogs(true)}
                        disabled={discogsPushPending}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {discogsPushPending ? 'Publishing...' : 'Re-push to Discogs'}
                      </button>
                    </div>
                  </div>
                ) : discogsEligibilityLoading ? (
                  <p className="text-sm text-warm-500 dark:text-gray-400">Checking Discogs catalog…</p>
                ) : discogsEligibilityError ? (
                  <p className="text-sm text-warm-500 dark:text-gray-400">
                    Couldn&apos;t check Discogs eligibility right now.{' '}
                    <button
                      type="button"
                      onClick={() => refetchDiscogsEligibility()}
                      className="underline text-blue-600 dark:text-blue-400"
                    >
                      Retry
                    </button>
                  </p>
                ) : discogsEligibility?.eligible ? (
                  <div className="space-y-2">
                    <p className="text-sm text-warm-600 dark:text-gray-400">Matches a Discogs catalog release.</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handlePushToDiscogs(false)}
                        disabled={discogsPushPending}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {discogsPushPending ? 'Pushing...' : 'Push to Discogs'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePushToDiscogs(true)}
                        disabled={discogsPushPending}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {discogsPushPending ? 'Publishing...' : 'Publish to Discogs now'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-warm-500 dark:text-gray-400">
                    No matching Discogs catalog release found for this item.
                  </p>
                )}
              </div>
            )}

            {/* Danger zone */}
            <div className="pt-4 border-t border-warm-200 dark:border-gray-700">
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => setDeleteConfirmOpen(true)}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 transition-colors"
              >
                {deleteMutation.isPending ? 'Deleting…' : '🗑️ Delete Item'}
              </button>
            </div>
          </form>

          {/* D-XP-003: Discount Confirmation Modal */}
          {discountModalOpen && pendingXpToSpend && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 max-w-sm mx-4">
                <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">
                  Confirm Organizer Special
                </h2>
                <p className="text-sm text-warm-600 dark:text-warm-300 mb-4">
                  Spend <span className="font-semibold">{pendingXpToSpend} XP</span> to apply a ${(pendingXpToSpend / 200) * 2} discount to this item?
                </p>
                <p className="text-xs text-warm-500 dark:text-warm-400 mb-6">
                  XP is permanently burned. Shoppers will see "Organizer Special" at checkout. This discount cannot stack with shopper coupons.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountModalOpen(false);
                      setPendingXpToSpend(null);
                    }}
                    className="flex-1 bg-gray-300 hover:bg-gray-400 text-warm-900 dark:text-warm-100 font-bold py-2 px-4 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      applyDiscountMutation.mutate(pendingXpToSpend);
                    }}
                    disabled={applyDiscountMutation.isPending}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {applyDiscountMutation.isPending ? 'Applying...' : 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {inlineCameraOpen ? (
            <RapidCapture
              rapidItems={inlineRapidItems}
              addingToItemId={String(id)}
              mode={inlineCaptureMode}
              onModeChange={setInlineCaptureMode}
              onPhotoCapture={inlineCaptureMode === 'rapidfire' ? handleInlineCameraCapture : undefined}
              onAnalyze={inlineCaptureMode === 'regular' ? handleInlineCameraAnalyze : undefined}
              onComplete={() => { setInlineCameraOpen(false); queryClient.invalidateQueries({ queryKey: ['item', id] }); }}
              onCancel={() => { setInlineCameraOpen(false); queryClient.invalidateQueries({ queryKey: ['item', id] }); }}
              onAddToItem={() => {}}
              onThumbnailTap={() => {}}
              onNavigateToReview={() => setInlineCameraOpen(false)}
              readyCount={0}
              isAnalyzing={false}
            />
          ) : null}

          <ConfirmDialog
            isOpen={deleteConfirmOpen}
            title="Delete Item"
            message={`Delete "${item?.title || 'this item'}"? This cannot be undone.`}
            confirmLabel="Delete"
            onConfirm={() => {
              setDeleteConfirmOpen(false);
              deleteMutation.mutate();
            }}
            onCancel={() => setDeleteConfirmOpen(false)}
            variant="danger"
          />

          <ConfirmDialog
            isOpen={reanalyzeConfirm.open}
            title={reanalyzeConfirm.forceGrounding ? "Look up this item's exact identity?" : 'Re-run Smart tagging?'}
            message={
              reanalyzeConfirm.forceGrounding
                ? "This re-runs identity lookup from this item's photos even if it was already identified, and refreshes the suggested title, description, category, condition, and tags. Any edits you made to those fields will be replaced. Your price is kept -- we'll check for an updated price suggestion below, but it's never applied automatically."
                : "This refreshes the suggested title, description, category, condition, and tags from this item's photos. Any edits you made to those fields will be replaced. Your price is kept -- we'll check for an updated price suggestion below, but it's never applied automatically."
            }
            confirmLabel={reanalyzeConfirm.forceGrounding ? 'Identify precisely' : 'Re-analyze'}
            onConfirm={() => {
              const forceGrounding = reanalyzeConfirm.forceGrounding;
              setReanalyzeConfirm({ open: false, forceGrounding: false });
              handleReanalyzeItem(forceGrounding);
            }}
            onCancel={() => setReanalyzeConfirm({ open: false, forceGrounding: false })}
          />
        </div>
      </div>

      {/* Barcode scanner modal: full-viewport, outside page scroll container */}
      {barcodeScannerOpen && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onCancel={() => setBarcodeScannerOpen(false)}
        />
      )}
    </>
  );
};

export default EditItemPage;