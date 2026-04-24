/**
 * Create Sale Page
 *
 * Main organizer workflow for setting up a new estate sale.
 * Collects:
 * - Basic info (title, description, dates)
 * - Location (address, city, state, zip)
 * - Photos
 * - Initial settings (auction enabled, min bid increment, etc.)
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import Tooltip from '../../components/Tooltip';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import LocationSelector from '../../components/LocationSelector';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import Head from 'next/head';
import Link from 'next/link';

const CreateSalePage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { canAccess } = useOrganizerTier();
  const { showToast } = useToast();
  const [isClient, setIsClient] = useState(false);

  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('15:00');

  const [formData, setFormData] = useState({
    title: '',
    startDate: '',
    endDate: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    lat: null as number | null,
    lng: null as number | null,
    // B1: Sale type selector
    saleType: 'ESTATE',
    retailAutoRenewDays: 30,
    // Feature #311: Multi-Location Inventory View
    locationId: null as string | null,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [tierLimitError, setTierLimitError] = useState<any>(null);
  const [showProModal, setShowProModal] = useState(false);
  const [newSaleId, setNewSaleId] = useState<string | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Auth guard — after all hooks
  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    });
    // Clear error for this field when user starts typing
    if (validationErrors[name]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validateDateFields = (): boolean => {
    const errors: { [key: string]: string } = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (formData.startDate) {
      const startDate = new Date(formData.startDate);
      startDate.setHours(0, 0, 0, 0);
      if (startDate < today) {
        errors.startDate = 'Start date must be today or in the future';
      }
    }

    if (formData.startDate && formData.endDate) {
      const startDate = new Date(formData.startDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(formData.endDate);
      endDate.setHours(0, 0, 0, 0);
      if (endDate <= startDate) {
        errors.endDate = 'End date must be after start date';
      }
    }

    setValidationErrors(prev => ({ ...prev, ...errors }));
    return Object.keys(errors).length === 0;
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name } = e.target;
    setTouchedFields(prev => { const next = new Set(prev); next.add(name); return next; });

    // For date fields, validate on blur
    if (name === 'startDate' || name === 'endDate') {
      validateDateFields();
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateDateFields()) {
      return;
    }

    setIsSubmitting(true);
    setTierLimitError(null);

    try {
      // Combine date + time and convert to UTC ISO string using browser's local timezone
      // P1 fix: omit lat/lng when null — sending null fails Zod validation before tier check runs
      const { lat, lng, retailAutoRenewDays, ...restFormData } = formData;
      const isRetail = formData.saleType === 'RETAIL';
      const payload = {
        ...restFormData,
        retailAutoRenewDays,
        startDate: isRetail
          ? new Date().toISOString() // Retail mode: use today
          : formData.startDate ? new Date(`${formData.startDate}T${startTime}`).toISOString() : formData.startDate,
        endDate: isRetail
          ? new Date(Date.now() + retailAutoRenewDays * 24 * 60 * 60 * 1000).toISOString() // Retail mode: auto-calculated on backend
          : formData.endDate ? new Date(`${formData.endDate}T${endTime}`).toISOString() : formData.endDate,
        ...(lat !== null ? { lat } : {}),
        ...(lng !== null ? { lng } : {}),
      };
      const response = await api.post('/sales', {
        ...payload,
        ...(formData.locationId ? { locationId: formData.locationId } : {}),
      });
      const firstSaleUnlocked = response.data.achievements?.some(
        (a: { key: string }) => a.key === 'FIRST_SALE_CREATED'
      );
      if (response.data.isFirstSaleFreePro) {
        setNewSaleId(response.data.id);
        setShowProModal(true);
      } else if (firstSaleUnlocked) {
        showToast('🚀 Achievement Unlocked: Sale Launcher! +25 XP', 'success');
        // Brief delay so user sees the achievement toast before navigating
        await new Promise(resolve => setTimeout(resolve, 1500));
        router.push(`/organizer/edit-sale/${response.data.id}`);
      } else {
        showToast('Sale created! Add items next.', 'success');
        router.push(`/organizer/edit-sale/${response.data.id}`);
      }
    } catch (error: any) {
      // Feature #249: Handle concurrent sales tier limit (409)
      if (error.response?.status === 409 && error.response?.data?.code === 'TIER_LIMIT_EXCEEDED') {
        setTierLimitError(error.response.data);
        showToast(error.response.data.message, 'error');
      } else {
        showToast(error.response?.data?.message || 'Failed to create sale', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) return <div>Loading...</div>;

  return (
    <>
      <Head>
        <title>Create Sale - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-white dark:bg-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Link href="/organizer/dashboard" className="text-amber-600 hover:underline text-sm font-medium mb-4 inline-block">
            Back to dashboard
          </Link>

          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Create a New Sale</h1>
          <p className="text-warm-600 dark:text-warm-400 mb-8">Get your sale online in minutes.</p>

          {/* Feature #249: Tier limit error modal */}
          {tierLimitError && (
            <div className="mb-8 p-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
              <h3 className="text-lg font-bold text-amber-900 dark:text-amber-100 mb-2">
                Concurrent Sales Limit Reached
              </h3>
              <p className="text-amber-800 dark:text-amber-200 mb-4">
                You're currently running <strong>{tierLimitError.current}</strong> active sale{tierLimitError.current !== 1 ? 's' : ''}.
                Your <strong>{tierLimitError.tier}</strong> tier allows <strong>{tierLimitError.limit}</strong> concurrent sale{tierLimitError.limit !== 1 ? 's' : ''} at a time.
              </p>
              <Link
                href={tierLimitError.upgradeUrl}
                className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
              >
                Upgrade to PRO
              </Link>
              <button
                onClick={() => setTierLimitError(null)}
                className="ml-4 text-amber-700 dark:text-amber-300 font-semibold underline hover:no-underline"
              >
                Dismiss
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Sale Type Selector */}
            <div>
              <label htmlFor="saleType" className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">Sale Type</label>
              <select
                id="saleType"
                name="saleType"
                value={formData.saleType}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-warm-100"
              >
                <option value="ESTATE">Estate Sale</option>
                <option value="YARD">Yard Sale</option>
                <option value="AUCTION">Auction</option>
                <option value="FLEA_MARKET">Flea Market</option>
                <option value="CONSIGNMENT">Consignment</option>
                <option value="RETAIL" disabled={!canAccess('TEAMS')}>
                  {canAccess('TEAMS') ? 'Retail Store' : 'Retail Store (TEAMS only)'}
                </option>
              </select>
              {formData.saleType === 'RETAIL' && !canAccess('TEAMS') && (
                <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
                  Retail Store is available on the TEAMS plan.{' '}
                  <Link href="/pricing" className="underline font-medium">Upgrade to unlock</Link>
                </p>
              )}
            </div>

            {/* Basic Info */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label htmlFor="title" className="block text-sm font-medium text-warm-700 dark:text-warm-300">{formData.saleType === 'RETAIL' ? 'Retail Store Name' : 'Sale Title'}</label>
                <Tooltip content="This is the first thing shoppers see. Be specific: 'Johnson Family Estate Sale' beats 'Estate Sale'. Include the neighborhood or street if public." />
              </div>
              <input
                id="title"
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                onBlur={handleBlur}
                required
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                placeholder="e.g., My Weekend Sale"
              />
            </div>

            {/* Dates — Hidden for Retail Mode */}
            {formData.saleType !== 'RETAIL' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label htmlFor="startDate" className="block text-sm font-medium text-warm-700 dark:text-warm-300">Start Date</label>
                    <Tooltip content="Set your start date to the first day items are available. Shoppers browse before doors open, so publish 3-5 days early." />
                  </div>
                  <input
                    id="startDate"
                    type="date"
                    name="startDate"
                    value={formData.startDate}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    min={new Date().toISOString().split('T')[0]}
                    required={formData.saleType !== 'RETAIL'}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                  {validationErrors.startDate && touchedFields.has('startDate') && (
                    <p className="text-red-600 text-xs mt-1">{validationErrors.startDate}</p>
                  )}
                  <div className="mt-2">
                    <label className="block text-xs font-medium text-warm-600 dark:text-warm-400 mb-1">Start Time</label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500 text-sm"
                    />
                  </div>
                  <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Times are in your local timezone.</p>
                </div>
                <div>
                  <label htmlFor="endDate" className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">End Date</label>
                  <input
                    id="endDate"
                    type="date"
                    name="endDate"
                    value={formData.endDate}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    min={new Date().toISOString().split('T')[0]}
                    required={formData.saleType !== 'RETAIL'}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                  {validationErrors.endDate && touchedFields.has('endDate') && (
                    <p className="text-red-600 text-xs mt-1">{validationErrors.endDate}</p>
                  )}
                  <div className="mt-2">
                    <label className="block text-xs font-medium text-warm-600 dark:text-warm-400 mb-1">End Time</label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Retail Mode Info */}
            {formData.saleType === 'RETAIL' && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  ✓ Your retail store stays live automatically. Items you add are visible to shoppers immediately.
                </p>
              </div>
            )}

            {/* Location */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label htmlFor="address" className="block text-sm font-medium text-warm-700 dark:text-warm-300">Address</label>
                <Tooltip content="Your exact address is shown to shoppers after the sale is published. It's used to show your sale on the map." />
              </div>
              <AddressAutocomplete
                id="address"
                name="address"
                value={formData.address}
                onChange={handleChange}
                onSuggestionSelected={(suggestion) => {
                  setFormData(prev => ({
                    ...prev,
                    address: suggestion.address,
                    city: suggestion.city,
                    state: suggestion.state,
                    zip: suggestion.zip,
                    lat: suggestion.lat,
                    lng: suggestion.lng,
                  }));
                }}
                placeholder="123 Main St"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="city" className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">City</label>
                <input
                  id="city"
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  required
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label htmlFor="state" className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">State</label>
                <input
                  id="state"
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  required
                  maxLength={2}
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label htmlFor="zip" className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">ZIP</label>
                <input
                  id="zip"
                  type="text"
                  name="zip"
                  value={formData.zip}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  required
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Feature #311: Multi-Location Inventory View */}
            <LocationSelector
              value={formData.locationId}
              onChange={(locationId) => setFormData({ ...formData, locationId })}
              label="Location"
              placeholder="Select a location (optional)"
            />

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Creating...' : 'Create Sale'}
            </button>
          </form>

          {/* PRO Modal */}
          {showProModal && newSaleId && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-8">
                <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-4">
                  Your first sale is on PRO — on us 🎉
                </h2>
                <p className="text-warm-700 dark:text-warm-300 mb-6">
                  We've unlocked PRO features for your first sale. Enjoy unlimited item listings, up to 10 photos per item, smart auto-tagging, and priority placement on FindA.Sale.
                </p>
                <button
                  onClick={() => {
                    setShowProModal(false);
                    router.push(`/organizer/edit-sale/${newSaleId}`);
                  }}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                >
                  Start Adding Items
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CreateSalePage;
