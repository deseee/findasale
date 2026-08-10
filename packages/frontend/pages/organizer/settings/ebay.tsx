/**
 * eBay Policy Setup Page
 *
 * Allows organizers to:
 * - Map eBay fulfillment, return, and payment policies
 * - Define weight-tier routing rules
 * - Set shipping classification overrides
 * - Create category-specific policy overrides
 * - Configure push behavior and location settings
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import EbayCategoryPicker from '../../../components/EbayCategoryPicker';

// Type definitions
type PolicyClassification = 'weight-tier' | 'local-pickup' | 'free-shipping' | 'calculated' | 'category-specific' | 'international' | 'unknown';

interface FulfillmentPolicy {
  fulfillmentPolicyId: string;
  name: string;
  description?: string;
  classification: PolicyClassification;
}

// Human-readable suffixes for policy classifications shown next to real eBay
// policy names in dropdowns. Internal-only labels (weight-tier, category-specific,
// unknown) are intentionally omitted -- a 50+ non-technical organizer has no way
// to know what they mean and they read like something is broken (UX audit finding 8,
// claude_docs/ux-spotchecks/ebay-shipping-settings-simplification-2026-08-06.md).
const READABLE_CLASSIFICATION_LABELS: Partial<Record<PolicyClassification, string>> = {
  'local-pickup': 'local pickup',
  'free-shipping': 'free shipping',
  'calculated': 'calculated',
  'international': 'international',
};
const policySuffix = (classification: PolicyClassification): string => {
  const label = READABLE_CLASSIFICATION_LABELS[classification];
  return label ? ` · ${label}` : '';
};

interface ReturnPolicy {
  returnPolicyId: string;
  name: string;
  description?: string;
}

interface PaymentPolicy {
  paymentPolicyId: string;
  name: string;
  description?: string;
}

interface MerchantLocation {
  merchantLocationKey: string;
  name: string;
  address?: any;
}

interface WeightTierMapping {
  maxOz: number;
  policyId: string;
  policyName: string;
  // Client-only stable id to keep React row identity across re-renders/sorts.
  // Not persisted — stripped before POST in handleSaveMapping.
  _clientId?: string;
}

// Generate a stable client-side id for a weight tier row. Falls back to a
// counter-based id if crypto.randomUUID is unavailable (older browsers).
let _tierIdCounter = 0;
const newClientId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  _tierIdCounter += 1;
  return `tier_${Date.now()}_${_tierIdCounter}`;
};

interface CubicTierMapping {
  maxLengthIn: number;
  maxWidthIn: number;
  maxHeightIn: number;
  policyId: string;
  policyName: string;
  // Client-only stable id, same purpose as WeightTierMapping._clientId.
  _clientId?: string;
}

interface CategoryOverride {
  categoryId: string;
  categoryName?: string;
  policyId: string;
  policyName: string;
}

interface SuggestedWeightTier {
  policyId: string;
  policyName: string;
  minOz: number;
  maxOz: number;
  confidence: 'high' | 'medium' | 'low';
}

interface PolicyMapping {
  defaultFulfillmentPolicyId?: string | null;
  defaultReturnPolicyId?: string | null;
  defaultPaymentPolicyId?: string | null;
  defaultDescriptionHtml?: string | null;
  weightTierMappings: WeightTierMapping[];
  cubicTierMappings: CubicTierMapping[];
  categoryOverrides: CategoryOverride[];
  heavyOversizedPolicyId?: string | null;
  fragilePolicyId?: string | null;
  unknownPolicyId?: string | null;
  // S725: DRAFT mode removed — pushAsDraft removed from UI; backend ignores it.
  merchantLocationSource: 'EXISTING' | 'SALE_ADDRESS' | 'ORGANIZER_ADDRESS';
  shippingMode?: 'CALCULATED' | 'FLAT_TIERS';
  freeShippingOptIn?: boolean;
}

interface SetupData {
  fulfillmentPolicies: FulfillmentPolicy[];
  returnPolicies: ReturnPolicy[];
  paymentPolicies: PaymentPolicy[];
  merchantLocations: MerchantLocation[];
  currentMapping: PolicyMapping | null;
  suggestedWeightTiers: SuggestedWeightTier[];
  handlingTimeDays?: number;
}

const EbayPolicySetupPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ebayConnected, setEbayConnected] = useState(false);
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [mapping, setMapping] = useState<PolicyMapping | null>(null);
  const [originalMapping, setOriginalMapping] = useState<PolicyMapping | null>(null);
  // eBay Push — shipping smart-pick organizer default.
  // S725: ebayDefaultPublishMode removed (DRAFT mode killed — see ebayController.ts).
  const [organizerDefaults, setOrganizerDefaults] = useState<{
    ebayDefaultShippingPolicyId: string | null;
  }>({ ebayDefaultShippingPolicyId: null });
  const [originalOrganizerDefaults, setOriginalOrganizerDefaults] = useState<{
    ebayDefaultShippingPolicyId: string | null;
  }>({ ebayDefaultShippingPolicyId: null });

  // eBay Custom Label (SKU) append toggles
  const [handlingTimeDays, setHandlingTimeDays] = useState<number>(3);
  const [originalHandlingTimeDays, setOriginalHandlingTimeDays] = useState<number>(3);
  const [skuAppendDate, setSkuAppendDate] = useState(false);
  const [skuAppendCost, setSkuAppendCost] = useState(false);
  const [skuAppendLocation, setSkuAppendLocation] = useState(false);
  const [originalSkuToggles, setOriginalSkuToggles] = useState({ skuAppendDate: false, skuAppendCost: false, skuAppendLocation: false });

  // UX simplification pass 2026-08-06: live UNKNOWN-classification item count
  // (finding 3) + "Check my policies" liveness result (finding 5).
  const [unknownCount, setUnknownCount] = useState<number | null>(null);
  const [policyCheck, setPolicyCheck] = useState<{
    loading: boolean;
    result: { checkedCount: number; staleCount: number; stalePolicies: Array<{ policyId: string; label: string }> } | null;
  }>({ loading: false, result: null });

  // ADR-102 (roadmap #622): read-only computed-rate preview, replacing the
  // two removed editable weight/box-size tables. Populated by calling the
  // existing POST /ebay/shipping-preview endpoint (no itemId) with sample
  // weights -- makes zero eBay/DB writes.
  const [ratePreview, setRatePreview] = useState<{
    loading: boolean;
    rows: Array<{ lbs: number; dollars: number | null }>;
    error: string | null;
  }>({ loading: false, rows: [], error: null });

  // Fetch setup data on mount
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    const fetchSetupData = async () => {
      try {
        setLoading(true);
        const [setupRes, organizerRes, unknownCountRes] = await Promise.all([
          api.get('/ebay/setup-data'),
          api.get('/organizers/me').catch(() => null), // tolerate failure. Organizer defaults are optional
          api.get('/ebay/organizer/unknown-classification-count').catch(() => null), // tolerate failure -- count is a nice-to-have, not a blocker
        ]);
        setSetupData(setupRes.data);
        if (typeof unknownCountRes?.data?.count === 'number') {
          setUnknownCount(unknownCountRes.data.count);
        }
        if (typeof setupRes.data.handlingTimeDays === 'number') {
          setHandlingTimeDays(setupRes.data.handlingTimeDays);
          setOriginalHandlingTimeDays(setupRes.data.handlingTimeDays);
        }
        setEbayConnected(true);

        const currentMapping = setupRes.data.currentMapping || {
          defaultFulfillmentPolicyId: null,
          defaultReturnPolicyId: null,
          defaultPaymentPolicyId: null,
          defaultDescriptionHtml: null,
          weightTierMappings: [],
          cubicTierMappings: [],
          categoryOverrides: [],
          heavyOversizedPolicyId: null,
          fragilePolicyId: null,
          unknownPolicyId: null,
          // S725: pushAsDraft removed — DRAFT mode killed
          merchantLocationSource: 'SALE_ADDRESS',
          shippingMode: 'CALCULATED',
          freeShippingOptIn: false,
        };

        // Assign stable client-only ids to every loaded tier so React keys
        // survive re-renders and (deferred) re-sorts without remounting inputs.
        currentMapping.weightTierMappings = (currentMapping.weightTierMappings || []).map(
          (tier: WeightTierMapping) => ({ ...tier, _clientId: tier._clientId || newClientId() })
        );
        currentMapping.cubicTierMappings = (currentMapping.cubicTierMappings || []).map(
          (tier: CubicTierMapping) => ({ ...tier, _clientId: tier._clientId || newClientId() })
        );

        setMapping(currentMapping);
        setOriginalMapping(JSON.parse(JSON.stringify(currentMapping)));

        const defaults = {
          // S725: ebayDefaultPublishMode removed (DRAFT mode killed)
          ebayDefaultShippingPolicyId: organizerRes?.data?.ebayDefaultShippingPolicyId ?? null,
        };
        setOrganizerDefaults(defaults);
        setOriginalOrganizerDefaults(JSON.parse(JSON.stringify(defaults)));

        // Initialize SKU append toggles from organizer data
        const skuToggles = {
          skuAppendDate: organizerRes?.data?.skuAppendDate ?? false,
          skuAppendCost: organizerRes?.data?.skuAppendCost ?? false,
          skuAppendLocation: organizerRes?.data?.skuAppendLocation ?? false,
        };
        setSkuAppendDate(skuToggles.skuAppendDate);
        setSkuAppendCost(skuToggles.skuAppendCost);
        setSkuAppendLocation(skuToggles.skuAppendLocation);
        setOriginalSkuToggles(skuToggles);
      } catch (error: any) {
        if (error.response?.status === 401) {
          setEbayConnected(false);
          showToast('Connect your eBay account to set up policies', 'info');
        } else {
          console.error('Failed to fetch setup data:', error);
          showToast('Failed to load setup data', 'error');
        }
        setLoading(false);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchSetupData();
    }
  }, [user, authLoading, router, showToast]);

  const hasChanges =
    JSON.stringify(mapping) !== JSON.stringify(originalMapping) ||
    JSON.stringify(organizerDefaults) !== JSON.stringify(originalOrganizerDefaults) ||
    skuAppendDate !== originalSkuToggles.skuAppendDate ||
    skuAppendCost !== originalSkuToggles.skuAppendCost ||
    skuAppendLocation !== originalSkuToggles.skuAppendLocation ||
    handlingTimeDays !== originalHandlingTimeDays;

  // ADR-102 (roadmap #622): fetch the read-only computed-rate preview once,
  // the first time the organizer is in Flat-rate tiers mode. Uses the buyer's
  // real cheapest-carrier rate (same pipeline the push path uses) at sample
  // weights -- no fromZip passed, so the backend falls back to the organizer's
  // own lat/lng (resolveItemShipping's existing fallback path).
  useEffect(() => {
    if (mapping?.shippingMode !== 'FLAT_TIERS') return;
    if (ratePreview.rows.length > 0 || ratePreview.loading) return;
    const sampleLbs = [1, 5, 10, 20];
    let cancelled = false;
    setRatePreview({ loading: true, rows: [], error: null });
    (async () => {
      try {
        const rows = await Promise.all(
          sampleLbs.map((lbs) =>
            api
              // ADR-102 (roadmap #622): explicit 'SHIPPABLE' classification so
              // this generic sample-weight preview always shows the computed
              // rate, instead of accidentally matching the organizer's
              // unknownPolicyId override (which real unclassified items would
              // hit -- correct for them, but not what this informational
              // panel is trying to show).
              .post('/ebay/shipping-preview', { weightOz: lbs * 16, ebayShippingClassification: 'SHIPPABLE' })
              .then((res) => ({
                lbs,
                dollars: typeof res.data?.buyerShipping === 'number' ? res.data.buyerShipping : null,
              }))
              .catch(() => ({ lbs, dollars: null }))
          )
        );
        if (!cancelled) setRatePreview({ loading: false, rows, error: null });
      } catch {
        if (!cancelled) setRatePreview({ loading: false, rows: [], error: 'Could not load the rate preview right now.' });
      }
    })();
    return () => { cancelled = true; };
  }, [mapping?.shippingMode]);

  const handleSaveMapping = async () => {
    if (!mapping) return;

    try {
      setSaving(true);
      // Build the API payload: sort weight tiers by maxOz once (canonical order)
      // and strip the client-only _clientId field so it never leaves the browser.
      const sortedTiers = [...mapping.weightTierMappings]
        .sort((a, b) => {
          const aVal = a.maxOz === Infinity ? Number.MAX_VALUE : a.maxOz;
          const bVal = b.maxOz === Infinity ? Number.MAX_VALUE : b.maxOz;
          return aVal - bVal;
        })
        .map(({ _clientId, ...rest }) => rest);
      // Cubic tiers sort by volume ascending -- same canonical order matchCubicTier
      // (ebayPolicyParser.ts) uses when picking the smallest tier that fits an item.
      const sortedCubicTiers = [...(mapping.cubicTierMappings || [])]
        .sort((a, b) => (a.maxLengthIn * a.maxWidthIn * a.maxHeightIn) - (b.maxLengthIn * b.maxWidthIn * b.maxHeightIn))
        .map(({ _clientId, ...rest }) => rest);
      const payload = { ...mapping, weightTierMappings: sortedTiers, cubicTierMappings: sortedCubicTiers, handlingTimeDays };
      // Save the policy mapping (existing path)
      await api.post('/ebay/policy-mapping', payload);
      // Save organizer-level eBay defaults and SKU append toggles.
      const skuTogglesDirty =
        skuAppendDate !== originalSkuToggles.skuAppendDate ||
        skuAppendCost !== originalSkuToggles.skuAppendCost ||
        skuAppendLocation !== originalSkuToggles.skuAppendLocation;
      if (JSON.stringify(organizerDefaults) !== JSON.stringify(originalOrganizerDefaults) || skuTogglesDirty) {
        await api.patch('/organizers/me', {
          ebayDefaultShippingPolicyId: organizerDefaults.ebayDefaultShippingPolicyId,
          skuAppendDate,
          skuAppendCost,
          skuAppendLocation,
        });
      }
      showToast('eBay settings saved', 'success');
      // Reflect the canonical sort order locally — preserve _clientId so React
      // keys stay stable and inputs don't remount after save.
      const idByMaxOz = new Map(mapping.weightTierMappings.map(t => [t, t._clientId]));
      const sortedWithIds = [...mapping.weightTierMappings].sort((a, b) => {
        const aVal = a.maxOz === Infinity ? Number.MAX_VALUE : a.maxOz;
        const bVal = b.maxOz === Infinity ? Number.MAX_VALUE : b.maxOz;
        return aVal - bVal;
      }).map(t => ({ ...t, _clientId: idByMaxOz.get(t) || t._clientId || newClientId() }));
      const idByCubic = new Map((mapping.cubicTierMappings || []).map(t => [t, t._clientId]));
      const sortedCubicWithIds = [...(mapping.cubicTierMappings || [])]
        .sort((a, b) => (a.maxLengthIn * a.maxWidthIn * a.maxHeightIn) - (b.maxLengthIn * b.maxWidthIn * b.maxHeightIn))
        .map(t => ({ ...t, _clientId: idByCubic.get(t) || t._clientId || newClientId() }));
      const savedMapping = { ...mapping, weightTierMappings: sortedWithIds, cubicTierMappings: sortedCubicWithIds };
      setMapping(savedMapping);
      setOriginalMapping(JSON.parse(JSON.stringify(savedMapping)));
      setOriginalOrganizerDefaults(JSON.parse(JSON.stringify(organizerDefaults)));
      setOriginalSkuToggles({ skuAppendDate, skuAppendCost, skuAppendLocation });
      setOriginalHandlingTimeDays(handlingTimeDays);
      // Refetch to ensure sync with backend
      const res = await api.get('/ebay/setup-data');
      setSetupData(res.data);
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Failed to save eBay settings';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    setMapping(JSON.parse(JSON.stringify(originalMapping)));
    setOrganizerDefaults(JSON.parse(JSON.stringify(originalOrganizerDefaults)));
    setSkuAppendDate(originalSkuToggles.skuAppendDate);
    setSkuAppendCost(originalSkuToggles.skuAppendCost);
    setSkuAppendLocation(originalSkuToggles.skuAppendLocation);
  };

  // "Check my policies" (UX audit finding 5) -- read-only, reuses the organizer's
  // already-connected eBay OAuth token via the backend's existing fulfillment-policy
  // fetch. No new integration, no spend implications.
  const handleCheckPolicies = async () => {
    setPolicyCheck({ loading: true, result: null });
    try {
      const res = await api.get('/ebay/organizer/check-policies');
      setPolicyCheck({ loading: false, result: res.data });
    } catch (error: any) {
      setPolicyCheck({ loading: false, result: null });
      showToast(error.response?.data?.message || 'Could not check your policies right now', 'error');
    }
  };

  // Category override handlers
  const addCategoryOverride = () => {
    if (!mapping) return;
    const newOverrides = [...mapping.categoryOverrides, { categoryId: '', policyId: '', policyName: '' }];
    setMapping({ ...mapping, categoryOverrides: newOverrides });
  };

  const updateCategoryOverride = (index: number, field: string, value: any) => {
    if (!mapping) return;
    const newOverrides = [...mapping.categoryOverrides];
    newOverrides[index] = { ...newOverrides[index], [field]: value };
    setMapping({ ...mapping, categoryOverrides: newOverrides });
  };

  const removeCategoryOverride = (index: number) => {
    if (!mapping) return;
    const newOverrides = mapping.categoryOverrides.filter((_, i) => i !== index);
    setMapping({ ...mapping, categoryOverrides: newOverrides });
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="max-w-4xl mx-auto py-8">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-sage-300 border-t-sage-600"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading eBay setup...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!ebayConnected) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="max-w-4xl mx-auto py-8">
          <Link
            href="/organizer/settings"
            className="text-sm text-sage-600 hover:text-sage-700 dark:text-sage-400 dark:hover:text-sage-500 mb-4 inline-block"
          >
            ← Back to Settings
          </Link>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mt-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">eBay Connection Required</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              You need to connect your eBay account first to set up policy mappings.
            </p>
            <Link
              href="/organizer/settings?tab=ebay"
              className="inline-block bg-sage-600 hover:bg-sage-700 text-white px-4 py-2 rounded font-medium transition"
            >
              Connect eBay Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>eBay Listing Setup - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="max-w-4xl mx-auto py-8">
          {/* Back link */}
          <Link
            href="/organizer/settings"
            className="text-sm text-sage-600 hover:text-sage-700 dark:text-sage-400 dark:hover:text-sage-500 mb-4 inline-block"
          >
            ← Back to Settings
          </Link>

          {/* Page header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">eBay Listing Setup</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Map your eBay policies once. Every future push uses the right policy automatically.
            </p>
          </div>

          {/* Plain-language routing order + eBay-only scope note + "Check my policies"
              (UX audit findings 5, 6, 7 -- ebay-shipping-settings-simplification-2026-08-06.md) */}
          <div className="mb-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <strong>How FindA.Sale picks your shipping policy:</strong> first, any policy you set on a specific item; then, if you picked one Default shipping policy below, that's always used; otherwise, FindA.Sale works through your weight, box-size, and category rules automatically.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              These settings control eBay listings only. Facebook Marketplace shipping is handled separately when you post there.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleCheckPolicies}
                disabled={policyCheck.loading}
                className="text-sm px-3 py-1.5 border border-sage-600 text-sage-600 dark:text-sage-400 dark:border-sage-500 rounded-lg hover:bg-sage-50 dark:hover:!bg-sage-700/20 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition"
              >
                {policyCheck.loading ? 'Checking…' : 'Check my policies'}
              </button>
              {policyCheck.result && policyCheck.result.staleCount === 0 && (
                <span className="text-sm text-sage-700 dark:text-sage-400">Everything checks out.</span>
              )}
              {policyCheck.result && policyCheck.result.staleCount > 0 && (
                <span className="text-sm text-amber-700 dark:text-amber-400">
                  {policyCheck.result.staleCount} of your saved policies no longer exist on eBay — listed below so you can fix them.
                </span>
              )}
            </div>
            {policyCheck.result && policyCheck.result.staleCount > 0 && (
              <ul className="text-xs text-gray-600 dark:text-gray-400 list-disc list-inside space-y-0.5">
                {policyCheck.result.stalePolicies.map((p) => (
                  <li key={p.policyId}>{p.label}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Main content */}
          <div className="space-y-8">
            {setupData && mapping && (
              <>
                {/* Section B: Default policies */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Default Policies</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Default Return Policy
                      </label>
                      <select
                        value={mapping.defaultReturnPolicyId || ''}
                        onChange={(e) => setMapping({ ...mapping, defaultReturnPolicyId: e.target.value || null })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-sage-600"
                      >
                        <option value="">None</option>
                        {setupData.returnPolicies.map(policy => (
                          <option key={policy.returnPolicyId} value={policy.returnPolicyId}>
                            {policy.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Default Payment Policy
                      </label>
                      <select
                        value={mapping.defaultPaymentPolicyId || ''}
                        onChange={(e) => setMapping({ ...mapping, defaultPaymentPolicyId: e.target.value || null })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-sage-600"
                      >
                        <option value="">None</option>
                        {setupData.paymentPolicies.map(policy => (
                          <option key={policy.paymentPolicyId} value={policy.paymentPolicyId}>
                            {policy.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Default Fulfillment Policy
                      </label>
                      <select
                        value={mapping.defaultFulfillmentPolicyId || ''}
                        onChange={(e) => setMapping({ ...mapping, defaultFulfillmentPolicyId: e.target.value || null })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-sage-600"
                      >
                        <option value="">None</option>
                        {setupData.fulfillmentPolicies.map(policy => (
                          <option key={policy.fulfillmentPolicyId} value={policy.fulfillmentPolicyId}>
                            {policy.name}{policySuffix(policy.classification)}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        Used when no weight tier, category override, or shipping class override matches.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Section B2: Push defaults — default shipping policy. S725 removed publish-mode (DRAFT was broken-by-design). */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Push Defaults</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Default shipping policy applied to every Push to eBay action.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Default shipping policy
                      </label>
                      <select
                        value={organizerDefaults.ebayDefaultShippingPolicyId || ''}
                        onChange={(e) =>
                          setOrganizerDefaults({
                            ...organizerDefaults,
                            ebayDefaultShippingPolicyId: e.target.value || null,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-sage-600"
                      >
                        <option value="">Smart-pick (recommended)</option>
                        {setupData.fulfillmentPolicies.map((policy) => (
                          <option key={policy.fulfillmentPolicyId} value={policy.fulfillmentPolicyId}>
                            {policy.name}{policySuffix(policy.classification)}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        Smart-pick automatically uses the real shipping rate calculated for your buyer whenever it can, otherwise a flat price you've set, and free shipping only as a last resort. Pick a specific policy above to use it for every push instead.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Section B3: Shipping mode (calculated vs flat-rate tiers) */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Shipping mode</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Choose how buyers are charged for shipping when your items list on eBay.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <button
                      type="button"
                      onClick={() => mapping && setMapping({ ...mapping, shippingMode: 'CALCULATED' })}
                      className={`text-left rounded-lg border p-4 transition-colors ${
                        (mapping?.shippingMode ?? 'CALCULATED') === 'CALCULATED'
                          ? 'border-sage-600 bg-sage-50 dark:!bg-sage-700/30 ring-1 ring-sage-600'
                          : 'border-gray-200 dark:border-gray-700 hover:border-sage-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900 dark:text-white">Calculated</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sage-100 dark:!bg-sage-700 text-sage-700 dark:text-sage-200">Recommended</span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {/* Corrected again same-day: CALCULATED mode now uses eBay's real
                            per-buyer calculated-shipping rate at checkout, plus a small handling
                            fee that covers eBay's cut of the shipping charge -- so you're never
                            paying to ship out of pocket. Replaces the flat-rate-only copy above. */}
                        Your buyer pays eBay's real shipping rate at checkout, plus a small handling
                        fee that covers eBay's cut -- so you're never paying to ship out of pocket.
                        You just confirm the weight and box size; we handle the rest.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => mapping && setMapping({ ...mapping, shippingMode: 'FLAT_TIERS' })}
                      className={`text-left rounded-lg border p-4 transition-colors ${
                        mapping?.shippingMode === 'FLAT_TIERS'
                          ? 'border-sage-600 bg-sage-50 dark:!bg-sage-700/30 ring-1 ring-sage-600'
                          : 'border-gray-200 dark:border-gray-700 hover:border-sage-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900 dark:text-white">Flat-rate tiers</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">Advanced</span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Charge a fixed shipping price based on item weight, using the weight-tier table below.
                      </p>
                    </button>
                  </div>

                  {/* Handling time */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Handling time (days)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={handlingTimeDays}
                      onChange={(e) => setHandlingTimeDays(e.target.value === '' ? 0 : Math.max(0, Math.min(30, parseInt(e.target.value, 10) || 0)))}
                      className="w-28 px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm focus:outline-none focus:ring-2 focus:ring-sage-600"
                      aria-label="Handling time in days"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      How many business days you need to ship an item after it sells.
                    </p>
                  </div>

                  {/* Free shipping opt-in */}
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mapping?.freeShippingOptIn ?? false}
                      onChange={(e) => mapping && setMapping({ ...mapping, freeShippingOptIn: e.target.checked })}
                      className="mt-0.5 w-4 h-4 rounded"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Offer free shipping (you absorb the shipping cost)
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        Off by default. Buyers love free shipping, but it comes out of your net.
                      </span>
                    </span>
                  </label>
                </div>

                {/* Section C: Computed-rate preview (ADR-102, roadmap #622) -- replaces
                    the old editable "Shipping Policy by Weight" + "Shipping Policy by
                    Box Size" tables. Flat-rate tiers mode no longer routes items through
                    a manually-curated ladder -- every item gets the real cheapest-carrier
                    rate (USPS/UPS/FedEx, computed fresh) at push time, the same pipeline
                    Calculated mode's flat-fallback already uses. This panel is read-only:
                    it shows what buyers will actually be charged at a few sample weights
                    so organizers aren't looking at a black box, but there's nothing to
                    edit here -- the rate is always current, so it can't develop the
                    coverage gaps the old hand-maintained ladder did. */}
                {mapping?.shippingMode === 'FLAT_TIERS' && (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Your buyers are charged the real computed rate</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    FindA.Sale automatically finds the cheapest USPS/UPS/FedEx rate for each item's
                    weight and box size, every time -- no tiers to maintain, so it never goes stale.
                    Here's roughly what buyers pay at a few sample weights, shipping from your
                    sale's origin address.
                  </p>

                  {ratePreview.loading && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading a live rate preview…</p>
                  )}
                  {ratePreview.error && (
                    <p className="text-sm text-red-600 dark:text-red-400">{ratePreview.error}</p>
                  )}
                  {!ratePreview.loading && !ratePreview.error && ratePreview.rows.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Item weight</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Buyer pays for shipping</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ratePreview.rows.map((row) => (
                            <tr key={row.lbs} className="border-b border-gray-200 dark:border-gray-700">
                              <td className="py-3 px-3 text-gray-900 dark:text-white">{row.lbs} lb{row.lbs === 1 ? '' : 's'}</td>
                              <td className="py-3 px-3 text-gray-900 dark:text-white">
                                {row.dollars != null ? `$${row.dollars.toFixed(2)}` : 'Unavailable right now'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
                    Oddball items (heavy/oversized, fragile, or ones we couldn't classify) still use
                    the manual overrides you set below instead of the computed rate.
                  </p>
                </div>
                )}

                {/* Section D: Shipping classification overrides.
                    Gated on shippingMode === 'FLAT_TIERS' (UX audit finding 2 /
                    Dev Handoff 1b) -- these rules are only reachable in
                    resolvePoliciesForItem's cascade when the organizer is on
                    Flat-rate tiers; on Calculated mode they save but do nothing.
                    This is a visibility-only change, mirroring the pattern the
                    Weight/Box-Size tables above already use -- it does NOT clear
                    mapping.heavyOversizedPolicyId/fragilePolicyId/unknownPolicyId,
                    so nothing the organizer configured is lost if they switch
                    shipping mode back and forth. */}
                {mapping?.shippingMode === 'FLAT_TIERS' ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Special Shipping Rules</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Route items based on their classification.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        For heavy or oversized items (HEAVY_OVERSIZED): use
                      </label>
                      <select
                        value={mapping.heavyOversizedPolicyId || ''}
                        onChange={(e) => setMapping({ ...mapping, heavyOversizedPolicyId: e.target.value || null })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-sage-600"
                      >
                        <option value="">None (use computed rate)</option>
                        {setupData.fulfillmentPolicies.map(policy => (
                          <option key={policy.fulfillmentPolicyId} value={policy.fulfillmentPolicyId}>
                            {policy.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        Most estate organizers select a Local Pickup policy here.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        For fragile items (FRAGILE): use
                      </label>
                      <select
                        value={mapping.fragilePolicyId || ''}
                        onChange={(e) => setMapping({ ...mapping, fragilePolicyId: e.target.value || null })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-sage-600"
                      >
                        <option value="">None (use computed rate)</option>
                        {setupData.fulfillmentPolicies.map(policy => (
                          <option key={policy.fulfillmentPolicyId} value={policy.fulfillmentPolicyId}>
                            {policy.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        For items we couldn't automatically categorize: use
                      </label>
                      <select
                        value={mapping.unknownPolicyId || ''}
                        onChange={(e) => setMapping({ ...mapping, unknownPolicyId: e.target.value || null })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-sage-600"
                      >
                        <option value="">None (use computed rate)</option>
                        {setupData.fulfillmentPolicies.map(policy => (
                          <option key={policy.fulfillmentPolicyId} value={policy.fulfillmentPolicyId}>
                            {policy.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        This can include items that are actually easy to ship — check your item list if this number seems high.
                        {unknownCount !== null && (
                          <span className="block mt-1">
                            You currently have <strong>{unknownCount}</strong> item{unknownCount === 1 ? '' : 's'} in this bucket.
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
                ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Special Shipping Rules</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    These only apply when you're using Flat-rate tiers above — switch to Flat-rate tiers to use them.
                  </p>
                </div>
                )}

                {/* Section E: Category-specific overrides.
                    Gated on shippingMode === 'FLAT_TIERS' for the same reason as
                    Section D above (UX audit finding 2 / Dev Handoff 1b) --
                    category overrides are only reachable in the cascade on
                    Flat-rate tiers. Visibility-only; mapping.categoryOverrides is
                    never cleared. */}
                {mapping?.shippingMode === 'FLAT_TIERS' ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Category Overrides</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Route specific eBay categories to a specific policy. Example: all guitars → FEDEX GUITAR policy.
                  </p>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">eBay Category ID</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Policy</th>
                          <th className="text-right py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mapping.categoryOverrides.map((override, index) => (
                          <tr key={index} className="border-b border-gray-200 dark:border-gray-700">
                            <td className="py-3 px-3">
                              <EbayCategoryPicker
                                label=""
                                value=""
                                ebayCategoryName={override.categoryName}
                                defaultSearch={override.categoryId || undefined}
                                placeholder="Search eBay categories…"
                                onChange={(payload) => {
                                  if (!mapping) return;
                                  const newOverrides = [...mapping.categoryOverrides];
                                  newOverrides[index] = {
                                    ...newOverrides[index],
                                    categoryId: payload.leafCategoryId,
                                    categoryName: payload.leafCategoryName,
                                  };
                                  setMapping({ ...mapping, categoryOverrides: newOverrides });
                                }}
                              />
                            </td>
                            <td className="py-3 px-3">
                              <select
                                value={override.policyId || ''}
                                onChange={(e) => {
                                  const selectedId = e.target.value;
                                  const policy = setupData.fulfillmentPolicies.find(p => p.fulfillmentPolicyId === selectedId);
                                  if (selectedId && policy) {
                                    if (!mapping) return;
                                    const newOverrides = [...mapping.categoryOverrides];
                                    newOverrides[index] = { ...newOverrides[index], policyId: selectedId, policyName: policy.name };
                                    setMapping({ ...mapping, categoryOverrides: newOverrides });
                                  }
                                }}
                                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm focus:outline-none focus:ring-2 focus:ring-sage-600"
                              >
                                <option value="">Select policy</option>
                                {setupData.fulfillmentPolicies.map(policy => (
                                  <option key={policy.fulfillmentPolicyId} value={policy.fulfillmentPolicyId}>
                                    {policy.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <button
                                onClick={() => removeCategoryOverride(index)}
                                className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    onClick={addCategoryOverride}
                    className="mt-4 text-sm text-sage-600 hover:text-sage-700 dark:text-sage-400 dark:hover:text-sage-500 font-medium"
                  >
                    + Add override
                  </button>
                </div>
                ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Category Overrides</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    These only apply when you're using Flat-rate tiers above — switch to Flat-rate tiers to use them.
                  </p>
                </div>
                )}

                {/* Section F: Description template */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Default Description Template</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    HTML template inserted into every listing. Use {"{{DESCRIPTION}}"} where the item's own description should go.
                  </p>

                  <textarea
                    value={mapping.defaultDescriptionHtml || ''}
                    onChange={(e) => setMapping({ ...mapping, defaultDescriptionHtml: e.target.value })}
                    placeholder={`<h2>{{DESCRIPTION}}</h2>
<p><em>Sold by Artifacts and Collectibles via FindA.Sale</em></p>
<p>Ships within 1 business day from Grand Rapids, MI.</p>`}
                    rows={8}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sage-600"
                  />
                </div>

                {/* Section G: Pickup Location. S725 removed Draft toggle (DRAFT mode killed). */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Pickup Location</h2>

                  <div className="space-y-6">
                    {/* Location radio group */}
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Pickup location for listings</p>
                      <div className="space-y-3 ml-2">
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            id="locationSale"
                            name="merchantLocation"
                            value="SALE_ADDRESS"
                            checked={mapping.merchantLocationSource === 'SALE_ADDRESS'}
                            onChange={(e) => setMapping({ ...mapping, merchantLocationSource: e.target.value as any })}
                            className="h-4 w-4 text-sage-600 focus:ring-sage-600 border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                          />
                          <label htmlFor="locationSale" className="text-sm text-gray-700 dark:text-gray-300">
                            Use the sale's address (recommended for temporary/one-time sales)
                          </label>
                        </div>

                        {setupData.merchantLocations.length > 0 && (
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              id="locationExisting"
                              name="merchantLocation"
                              value="EXISTING"
                              checked={mapping.merchantLocationSource === 'EXISTING'}
                              onChange={(e) => setMapping({ ...mapping, merchantLocationSource: e.target.value as any })}
                              className="h-4 w-4 text-sage-600 focus:ring-sage-600 border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                            />
                            <label htmlFor="locationExisting" className="text-sm text-gray-700 dark:text-gray-300">
                              Use my existing eBay location (if you have one)
                            </label>
                          </div>
                        )}

                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            id="locationOrganizer"
                            name="merchantLocation"
                            value="ORGANIZER_ADDRESS"
                            checked={mapping.merchantLocationSource === 'ORGANIZER_ADDRESS'}
                            onChange={(e) => setMapping({ ...mapping, merchantLocationSource: e.target.value as any })}
                            className="h-4 w-4 text-sage-600 focus:ring-sage-600 border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                          />
                          <label htmlFor="locationOrganizer" className="text-sm text-gray-700 dark:text-gray-300">
                            Use my organizer profile address
                          </label>
                        </div>

                        {setupData.merchantLocations.length === 0 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 ml-7">
                            You haven't created a merchant location in eBay yet.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              {/* Section G2: Custom Label (SKU) Append */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Custom Label (SKU) Append</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Optionally append extra fields to the Custom Label that shows in eBay Seller Hub. Useful for reconciling sales back to your records.
                </p>

                {/* Live preview */}
                <div className="mb-5 px-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Preview</p>
                  <p className="font-mono text-sm text-gray-900 dark:text-white break-all">
                    FAS-abc123xyz
                    {skuAppendDate && <span className="text-sage-600 dark:text-sage-400"> {new Date().toISOString().slice(0, 10)}</span>}
                    {skuAppendCost && <span className="text-sage-600 dark:text-sage-400"> $10.50</span>}
                    {skuAppendLocation && <span className="text-sage-600 dark:text-sage-400"> Living Room</span>}
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Append Date */}
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 mt-0.5">
                      <input
                        type="checkbox"
                        id="skuAppendDate"
                        checked={skuAppendDate}
                        onChange={(e) => setSkuAppendDate(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-sage-600 focus:ring-sage-600 dark:bg-gray-700"
                      />
                    </div>
                    <label htmlFor="skuAppendDate" className="cursor-pointer">
                      <span className="block text-sm font-medium text-gray-900 dark:text-white">Append Date</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">Add item cataloguing date (e.g. {new Date().toISOString().slice(0, 10)})</span>
                    </label>
                  </div>

                  {/* Append Cost */}
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 mt-0.5">
                      <input
                        type="checkbox"
                        id="skuAppendCost"
                        checked={skuAppendCost}
                        onChange={(e) => setSkuAppendCost(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-sage-600 focus:ring-sage-600 dark:bg-gray-700"
                      />
                    </div>
                    <label htmlFor="skuAppendCost" className="cursor-pointer">
                      <span className="block text-sm font-medium text-gray-900 dark:text-white">Append Cost</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">Add your cost basis (e.g. $10.50). Only appended if cost basis is set on the item</span>
                    </label>
                  </div>

                  {/* Append Location */}
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 mt-0.5">
                      <input
                        type="checkbox"
                        id="skuAppendLocation"
                        checked={skuAppendLocation}
                        onChange={(e) => setSkuAppendLocation(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-sage-600 focus:ring-sage-600 dark:bg-gray-700"
                      />
                    </div>
                    <label htmlFor="skuAppendLocation" className="cursor-pointer">
                      <span className="block text-sm font-medium text-gray-900 dark:text-white">Append Location</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">Add room/location tag (e.g. Row 2 Bin D). Only appended if location is set on the item</span>
                    </label>
                  </div>
                </div>
              </div>
              </>
            )}
          </div>

          {/* Section H: Save bar (sticky footer — only shown when unsaved changes exist) */}
          {mapping && hasChanges && (
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-700 border-t-2 border-gray-300 dark:border-gray-500 p-4">
              <div className="max-w-4xl mx-auto flex items-center justify-end gap-3">
                <button
                  onClick={handleDiscardChanges}
                  disabled={saving}
                  className="px-4 py-2 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-500 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition"
                >
                  Discard changes
                </button>
                <button
                  onClick={handleSaveMapping}
                  disabled={saving}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition"
                >
                  {saving ? 'Saving...' : 'Save setup'}
                </button>
              </div>
            </div>
          )}

          {/* Spacer for sticky footer */}
          <div className="h-20" />
        </div>
      </div>

    </>
  );
};

export default EbayPolicySetupPage;
