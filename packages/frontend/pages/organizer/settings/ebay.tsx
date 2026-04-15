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

// Type definitions
type PolicyClassification = 'weight-tier' | 'local-pickup' | 'free-shipping' | 'calculated' | 'category-specific' | 'international' | 'unknown';

interface FulfillmentPolicy {
  fulfillmentPolicyId: string;
  name: string;
  description?: string;
  classification: PolicyClassification;
}

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
}

interface CategoryOverride {
  categoryId: string;
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
  categoryOverrides: CategoryOverride[];
  heavyOversizedPolicyId?: string | null;
  fragilePolicyId?: string | null;
  unknownPolicyId?: string | null;
  pushAsDraft: boolean;
  merchantLocationSource: 'EXISTING' | 'SALE_ADDRESS' | 'ORGANIZER_ADDRESS';
}

interface SetupData {
  fulfillmentPolicies: FulfillmentPolicy[];
  returnPolicies: ReturnPolicy[];
  paymentPolicies: PaymentPolicy[];
  merchantLocations: MerchantLocation[];
  currentMapping: PolicyMapping | null;
  suggestedWeightTiers: SuggestedWeightTier[];
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

  // Fetch setup data on mount
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    const fetchSetupData = async () => {
      try {
        setLoading(true);
        const res = await api.get('/ebay/setup-data');
        setSetupData(res.data);
        setEbayConnected(true);

        const currentMapping = res.data.currentMapping || {
          defaultFulfillmentPolicyId: null,
          defaultReturnPolicyId: null,
          defaultPaymentPolicyId: null,
          defaultDescriptionHtml: null,
          weightTierMappings: [],
          categoryOverrides: [],
          heavyOversizedPolicyId: null,
          fragilePolicyId: null,
          unknownPolicyId: null,
          pushAsDraft: false,
          merchantLocationSource: 'SALE_ADDRESS',
        };

        setMapping(currentMapping);
        setOriginalMapping(JSON.parse(JSON.stringify(currentMapping)));
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

  const hasChanges = JSON.stringify(mapping) !== JSON.stringify(originalMapping);

  const handleSaveMapping = async () => {
    if (!mapping) return;

    try {
      setSaving(true);
      await api.post('/ebay/policy-mapping', mapping);
      showToast('Policy mapping saved successfully', 'success');
      setOriginalMapping(JSON.parse(JSON.stringify(mapping)));
      // Refetch to ensure sync with backend
      const res = await api.get('/ebay/setup-data');
      setSetupData(res.data);
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Failed to save policy mapping';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    setMapping(JSON.parse(JSON.stringify(originalMapping)));
  };

  const useSuggestedDefaults = () => {
    if (!setupData || !mapping) return;
    const newMapping = { ...mapping };
    newMapping.weightTierMappings = setupData.suggestedWeightTiers.map(tier => ({
      maxOz: tier.maxOz,
      policyId: tier.policyId,
      policyName: tier.policyName,
    }));
    setMapping(newMapping);
    showToast('Applied suggested weight tiers', 'success');
  };

  // Weight tier handlers
  const addWeightTier = () => {
    if (!mapping) return;
    const newTiers = [...mapping.weightTierMappings, { maxOz: Infinity, policyId: '', policyName: '' }];
    setMapping({ ...mapping, weightTierMappings: newTiers });
  };

  const updateWeightTier = (index: number, field: string, value: any) => {
    if (!mapping) return;
    const newTiers = [...mapping.weightTierMappings];
    newTiers[index] = { ...newTiers[index], [field]: value };
    // Sort by maxOz
    newTiers.sort((a, b) => {
      const aVal = a.maxOz === Infinity ? Number.MAX_VALUE : a.maxOz;
      const bVal = b.maxOz === Infinity ? Number.MAX_VALUE : b.maxOz;
      return aVal - bVal;
    });
    setMapping({ ...mapping, weightTierMappings: newTiers });
  };

  const removeWeightTier = (index: number) => {
    if (!mapping) return;
    const newTiers = mapping.weightTierMappings.filter((_, i) => i !== index);
    setMapping({ ...mapping, weightTierMappings: newTiers });
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
                        <option value="">— None —</option>
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
                        <option value="">— None —</option>
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
                        <option value="">— None —</option>
                        {setupData.fulfillmentPolicies.map(policy => (
                          <option key={policy.fulfillmentPolicyId} value={policy.fulfillmentPolicyId}>
                            {policy.name} · {policy.classification}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        Used when no weight tier, category override, or shipping class override matches.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Section C: Weight-tier matrix */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Shipping Policy by Weight</h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        FindA.Sale automatically picks the right policy based on each item's weight.
                      </p>
                    </div>
                    {setupData.suggestedWeightTiers.length > 0 && (
                      <button
                        onClick={useSuggestedDefaults}
                        className="text-sm text-sage-600 hover:text-sage-700 dark:text-sage-400 dark:hover:text-sage-500 font-medium"
                      >
                        Use suggested defaults
                      </button>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Max Weight (oz)</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Policy</th>
                          <th className="text-right py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mapping.weightTierMappings.map((tier, index) => (
                          <tr key={index} className="border-b border-gray-200 dark:border-gray-700">
                            <td className="py-3 px-3">
                              <input
                                type="number"
                                value={tier.maxOz === Infinity ? '' : tier.maxOz}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? Infinity : parseFloat(e.target.value);
                                  updateWeightTier(index, 'maxOz', val);
                                }}
                                placeholder="No upper limit"
                                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm focus:outline-none focus:ring-2 focus:ring-sage-600"
                              />
                              {tier.maxOz === Infinity && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">No upper limit</p>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <select
                                value={tier.policyId}
                                onChange={(e) => {
                                  const policy = setupData.fulfillmentPolicies.find(p => p.fulfillmentPolicyId === e.target.value);
                                  if (policy) {
                                    updateWeightTier(index, 'policyId', e.target.value);
                                    updateWeightTier(index, 'policyName', policy.name);
                                  }
                                }}
                                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm focus:outline-none focus:ring-2 focus:ring-sage-600"
                              >
                                <option value="">— Select policy —</option>
                                {setupData.fulfillmentPolicies.map(policy => (
                                  <option key={policy.fulfillmentPolicyId} value={policy.fulfillmentPolicyId}>
                                    {policy.name} · {policy.classification}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <button
                                onClick={() => removeWeightTier(index)}
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
                    onClick={addWeightTier}
                    className="mt-4 text-sm text-sage-600 hover:text-sage-700 dark:text-sage-400 dark:hover:text-sage-500 font-medium"
                  >
                    + Add tier
                  </button>
                </div>

                {/* Section D: Shipping classification overrides */}
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
                        <option value="">— None (use weight tier) —</option>
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
                        <option value="">— None (use weight tier) —</option>
                        {setupData.fulfillmentPolicies.map(policy => (
                          <option key={policy.fulfillmentPolicyId} value={policy.fulfillmentPolicyId}>
                            {policy.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        For unknown classification (UNKNOWN): use
                      </label>
                      <select
                        value={mapping.unknownPolicyId || ''}
                        onChange={(e) => setMapping({ ...mapping, unknownPolicyId: e.target.value || null })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-sage-600"
                      >
                        <option value="">— None (use weight tier) —</option>
                        {setupData.fulfillmentPolicies.map(policy => (
                          <option key={policy.fulfillmentPolicyId} value={policy.fulfillmentPolicyId}>
                            {policy.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section E: Category-specific overrides */}
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
                              <input
                                type="text"
                                value={override.categoryId}
                                onChange={(e) => updateCategoryOverride(index, 'categoryId', e.target.value)}
                                placeholder="e.g., 30009"
                                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm focus:outline-none focus:ring-2 focus:ring-sage-600"
                              />
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Find eBay category IDs in your existing listings or the eBay category tree.
                              </p>
                            </td>
                            <td className="py-3 px-3">
                              <select
                                value={override.policyId}
                                onChange={(e) => {
                                  const policy = setupData.fulfillmentPolicies.find(p => p.fulfillmentPolicyId === e.target.value);
                                  if (policy) {
                                    updateCategoryOverride(index, 'policyId', e.target.value);
                                    updateCategoryOverride(index, 'policyName', policy.name);
                                  }
                                }}
                                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm focus:outline-none focus:ring-2 focus:ring-sage-600"
                              >
                                <option value="">— Select policy —</option>
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

                {/* Section G: Push preferences */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Push Behavior</h2>

                  <div className="space-y-6">
                    {/* Draft toggle */}
                    <div>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="pushAsDraft"
                          checked={mapping.pushAsDraft}
                          onChange={(e) => setMapping({ ...mapping, pushAsDraft: e.target.checked })}
                          className="h-4 w-4 text-sage-600 focus:ring-sage-600 border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700"
                        />
                        <label htmlFor="pushAsDraft" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Push items as drafts (require manual publish in eBay Seller Hub)
                        </label>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 ml-7">
                        When on, items are created as unpublished Offers in your eBay account. You review and publish each one manually. When off, items are published live immediately.
                      </p>
                    </div>

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
                            Use the sale's address (recommended for estate sales)
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
              </>
            )}
          </div>

          {/* Section H: Save bar (sticky footer) */}
          {mapping && (
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
              <div className="max-w-4xl mx-auto flex items-center justify-end gap-3">
                <button
                  onClick={handleDiscardChanges}
                  disabled={!hasChanges || saving}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition"
                >
                  Discard changes
                </button>
                <button
                  onClick={handleSaveMapping}
                  disabled={!hasChanges || saving}
                  className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition"
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
