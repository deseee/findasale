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

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import Tooltip from '../../components/Tooltip';
import Head from 'next/head';
import Link from 'next/link';

const CreateSalePage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();

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
    // B1: Sale type selector
    saleType: 'ESTATE',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());

  if (!isLoading && (!user || user.role !== 'ORGANIZER')) {
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

    try {
      const response = await api.post('/organizer/create-sale', formData);
      showToast('Sale created! Add items next.', 'success');
      router.push(`/organizer/add-items/${response.data.id}`);
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to create sale', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <>
      <Head>
        <title>Create Sale - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-white">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Link href="/organizer/dashboard" className="text-amber-600 hover:underline text-sm font-medium mb-4 inline-block">
            Back to dashboard
          </Link>

          <h1 className="text-3xl font-bold text-warm-900 mb-2">Create a New Sale</h1>
          <p className="text-warm-600 mb-8">Get your estate sale online in minutes.</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label htmlFor="title" className="block text-sm font-medium text-warm-700">Sale Title</label>
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
                className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                placeholder="e.g., Downtown Estate Sale"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <label htmlFor="description" className="block text-sm font-medium text-warm-700">Description</label>
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
                className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                placeholder="Describe the sale, highlight special items..."
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label htmlFor="startDate" className="block text-sm font-medium text-warm-700">Start Date</label>
                  <Tooltip content="Set your start date to the first day items are available. Shoppers browse before doors open, so publish 3-5 days early." />
                </div>
                <input
                  id="startDate"
                  type="date"
                  name="startDate"
                  value={formData.startDate}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  required
                  className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
                {validationErrors.startDate && touchedFields.has('startDate') && (
                  <p className="text-red-600 text-xs mt-1">{validationErrors.startDate}</p>
                )}
                <p className="text-xs text-warm-500 mt-1">Dates are based on your local timezone.</p>
              </div>
              <div>
                <label htmlFor="endDate" className="block text-sm font-medium text-warm-700 mb-2">End Date</label>
                <input
                  id="endDate"
                  type="date"
                  name="endDate"
                  value={formData.endDate}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  required
                  className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
                {validationErrors.endDate && touchedFields.has('endDate') && (
                  <p className="text-red-600 text-xs mt-1">{validationErrors.endDate}</p>
                )}
              </div>
            </div>

            {/* Location */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label htmlFor="address" className="block text-sm font-medium text-warm-700">Address</label>
                <Tooltip content="Your exact address is shown to shoppers after the sale is published. It's used to show your sale on the map." />
              </div>
              <input
                id="address"
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                onBlur={handleBlur}
                required
                className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                placeholder="123 Main St"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="city" className="block text-sm font-medium text-warm-700 mb-2">City</label>
                <input
                  id="city"
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  required
                  className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label htmlFor="state" className="block text-sm font-medium text-warm-700 mb-2">State</label>
                <input
                  id="state"
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  required
                  maxLength={2}
                  className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label htmlFor="zip" className="block text-sm font-medium text-warm-700 mb-2">ZIP</label>
                <input
                  id="zip"
                  type="text"
                  name="zip"
                  value={formData.zip}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  required
                  className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Neighborhood — U2 (autocomplete input, replaces scrolling dropdown) */}
            <div>
              <label htmlFor="neighborhood" className="block text-sm font-medium text-warm-700 mb-2">
                Neighborhood <span className="text-warm-400 font-normal">(optional \u2014 helps shoppers find you)</span>
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
                className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
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
              <label htmlFor="saleType" className="block text-sm font-medium text-warm-700 mb-2">
                Sale Type
              </label>
              <select
                id="saleType"
                name="saleType"
                value={formData.saleType}
                onChange={handleChange}
                onBlur={handleBlur}
                className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              >
                <option value="ESTATE">Estate Sale</option>
                <option value="YARD">Yard Sale</option>
                <option value="AUCTION">Auction</option>
                <option value="FLEA_MARKET">Flea Market</option>
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
