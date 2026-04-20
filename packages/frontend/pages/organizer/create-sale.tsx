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
import Head from 'next/head';
import Link from 'next/link';

const CreateSalePage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [isClient, setIsClient] = useState(false);

  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('15:00');

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    neighborhood: '',
    lat: null as number | null,
    lng: null as number | null,
    // B1: Sale type selector
    saleType: 'ESTATE',
    // Feature #XXX: Shop Mode
    isShopMode: false,
    shopAutoRenewDays: 30,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [tierLimitError, setTierLimitError] = useState<any>(null);

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

  const handleGenerateDescription = async () => {
    if (!formData.title.trim()) return;
    setIsGeneratingDesc(true);
    try {
      const response = await api.post('/sales/generate-description', {
        title: formData.title,
        city: formData.city || undefined,
        // B1: Send saleType instead of isAuctionSale
        saleType: formData.saleType,
        startDate: formData.startDate || undefined,
        endDate: formData.endDate || undefined,
      });
      setFormData(prev => ({ ...prev, description: response.data.description }));
    } catch {
      showToast("Couldn't generate description — try again", 'error');
    } finally {
      setIsGeneratingDesc(false);
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
      const { lat, lng, isShopMode, shopAutoRenewDays, ...restFormData } = formData;
      const payload = {
        ...restFormData,
        isShopMode,
        shopAutoRenewDays,
        startDate: isShopMode
          ? new Date().toISOString() // Shop mode: use today
          : formData.startDate ? new Date(`${formData.startDate}T${startTime}`).toISOString() : formData.startDate,
        endDate: isShopMode
          ? new Date(Date.now() + shopAutoRenewDays * 24 * 60 * 60 * 1000).toISOString() // Shop mode: auto-calculated on backend
          : formData.endDate ? new Date(`${formData.endDate}T${endTime}`).toISOString() : formData.endDate,
        ...(lat !== null ? { lat } : {}),
        ...(lng !== null ? { lng } : {}),
      };
      const response = await api.post('/sales', payload);
      const firstSaleUnlocked = response.data.achievements?.some(
        (a: { key: string }) => a.key === 'FIRST_SALE_CREATED'
      );
      if (firstSaleUnlocked) {
        showToast('🚀 Achievement Unlocked: Sale Launcher! +25 XP', 'success');
        // Brief delay so user sees the achievement toast before navigating
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else {
        showToast('Sale created! Add items next.', 'success');
      }
      router.push(`/organizer/add-items/${response.data.id}`);
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
            {/* Feature #XXX: Shop Mode — Sale Type Selector (Event vs Shop) */}
            <div className="bg-amber-50 dark:bg-amber-900/20 p-6 rounded-lg border border-amber-200 dark:border-amber-700">
              <h3 className="text-sm font-bold text-warm-900 dark:text-warm-100 mb-4">What are you setting up?</h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Event Option */}
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, isShopMode: false }))}
                  className={`p-4 border-2 rounded-lg transition-colors font-medium ${
                    !formData.isShopMode
                      ? 'border-amber-600 bg-amber-100 dark:bg-amber-900/40 text-warm-900 dark:text-warm-100'
                      : 'border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-warm-700 dark:text-warm-400 hover:border-amber-400'
                  }`}
                >
                  <div className="font-bold text-base">Event</div>
                  <div className="text-xs mt-1 opacity-90">Estate sale, yard sale, auction, or pop-up</div>
                </button>
                {/* Shop Option */}
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, isShopMode: true }))}
                  className={`p-4 border-2 rounded-lg transition-colors font-medium ${
                    formData.isShopMode
                      ? 'border-amber-600 bg-amber-100 dark:bg-amber-900/40 text-warm-900 dark:text-warm-100'
                      : 'border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-warm-700 dark:text-warm-400 hover:border-amber-400'
                  }`}
                >
                  <div className="font-bold text-base">Shop</div>
                  <div className="text-xs mt-1 opacity-90">Resale store, antique dealer, consignment</div>
                </button>
              </div>
            </div>

            {/* Basic Info */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label htmlFor="title" className="block text-sm font-medium text-warm-700 dark:text-warm-300">{formData.isShopMode ? 'Shop Name' : 'Sale Title'}</label>
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

            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <label htmlFor="description" className="block text-sm font-medium text-warm-700 dark:text-warm-300">Description</label>
                  <Tooltip content="Briefly describe what's for sale. Mention standout categories: 'Mid-century furniture, vintage tools, estate jewelry.' 2-3 sentences is enough." />
                </div>
                <button
                  type="button"
                  onClick={handleGenerateDescription}
                  disabled={!formData.title.trim() || isGeneratingDesc}
                  className="text-xs bg-sage-600 hover:bg-sage-700 text-white py-1 px-3 rounded-full disabled:opacity-40 transition-colors flex items-center gap-1"
                >
                  {isGeneratingDesc ? 'Generating\u2026' : '\u2728 Generate'}
                </button>
              </div>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                onBlur={handleBlur}
                rows={4}
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                placeholder="Describe the sale, highlight special items..."
              />
            </div>

            {/* Dates — Hidden for Shop Mode */}
            {!formData.isShopMode && (
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
                    required={!formData.isShopMode}
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
                    required={!formData.isShopMode}
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

            {/* Shop Mode Info */}
            {formData.isShopMode && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  ✓ Your shop stays live automatically. Items you add are visible to shoppers immediately.
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

            {/* Neighborhood — U2 (autocomplete input, replaces scrolling dropdown) */}
            <div>
              <label htmlFor="neighborhood" className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Neighborhood <span className="text-warm-400 font-normal">(optional — helps shoppers find you)</span>
              </label>
              <input
                id="neighborhood"
                type="text"
                name="neighborhood"
                list="neighborhood-list"
                value={formData.neighborhood}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Start typing or select..."
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                autoComplete="off"
              />
              <datalist id="neighborhood-list">
                <option value="Downtown" />
                <option value="Eastown" />
                <option value="East Hills" />
                <option value="Heritage Hill" />
                <option value="Creston" />
                <option value="Westside" />
                <option value="Midtown" />
                <option value="Fulton Heights" />
                <option value="Alger Heights" />
                <option value="Ada Township" />
                <option value="Cascade" />
                <option value="Kentwood" />
                <option value="Wyoming" />
                <option value="Grandville" />
              </datalist>
            </div>

            {/* B1: Sale Type Selector */}
            <div>
              <label htmlFor="saleType" className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Sale Type
              </label>
              <select
                id="saleType"
                name="saleType"
                value={formData.saleType}
                onChange={handleChange}
                onBlur={handleBlur}
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              >
                <option value="ESTATE">Estate Sale</option>
                <option value="YARD">Yard Sale</option>
                <option value="AUCTION">Auction</option>
                <option value="FLEA_MARKET">Flea Market</option>
                <option value="CONSIGNMENT">Consignment</option>
                <option value="CHARITY">Charity</option>
                <option value="BUSINESS_CORPORATE">Business/Corporate Sale</option>
              </select>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Creating...' : 'Create Sale'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default CreateSalePage;
