/**
 * Edit Sale Page
 *
 * Allows organizers to update:
 * - Sale title, description
 * - Dates and location
 * - Photos
 * - Status (active, draft, ended)
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import Head from 'next/head';
import Link from 'next/link';
import PickupSlotManager from '../../../components/PickupSlotManager';
import Skeleton from '../../../components/Skeleton';

const EditSalePage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [isCloning, setIsCloning] = useState(false);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

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
  });

  if (!authLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  const { data: sale, isLoading } = useQuery({
    queryKey: ['sale', id],
    queryFn: async () => {
      const response = await api.get(`/sales/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (sale) {
      setFormData({
        title: sale.title,
        description: sale.description,
        startDate: sale.startDate,
        endDate: sale.endDate,
        address: sale.address,
        city: sale.city,
        state: sale.state,
        zip: sale.zip,
        neighborhood: sale.neighborhood ?? '',
      });
    }
  }, [sale]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      return await api.patch(`/sales/${id}`, formData);
    },
    onSuccess: () => {
      showToast('Sale updated', 'success');
      router.push(`/organizer/dashboard`);
    },
    onError: (error: any) => {
      showToast(error.response?.data?.message || 'Failed to update sale', 'error');
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleGenerateDescription = async () => {
    if (!formData.title.trim()) return;
    setIsGeneratingDesc(true);
    try {
      const response = await api.post('/sales/generate-description', {
        title: formData.title,
        city: formData.city || undefined,
        startDate: formData.startDate || undefined,
        endDate: formData.endDate || undefined,
      });
      setFormData(prev => ({ ...prev, description: response.data.description }));
    } catch {
      showToast("Couldn't generate description \u2014 try again", 'error');
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  const handleCloneSale = async () => {
    if (!id) return;
    setIsCloning(true);
    try {
      const response = await api.post(`/sales/${id}/clone`);
      const newSaleId = response.data.id;
      showToast('Sale cloned! Redirecting...', 'success');
      setTimeout(() => {
        router.push(`/organizer/edit-sale/${newSaleId}`);
      }, 500);
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to clone sale', 'error');
    } finally {
      setIsCloning(false);
    }
  };

  const handleToggleSaleStatus = async () => {
    if (!id || !sale) return;
    setIsTogglingStatus(true);
    try {
      const newStatus = sale.status === 'PUBLISHED' ? 'ENDED' : 'PUBLISHED';
      const confirmMessage = sale.status === 'PUBLISHED'
        ? 'Hide this sale from shoppers? They won\'t be able to find it anymore.'
        : 'Make this sale visible to shoppers on the map?';

      if (!window.confirm(confirmMessage)) {
        setIsTogglingStatus(false);
        return;
      }

      await api.patch(`/sales/${id}/status`, { status: newStatus });
      showToast(
        newStatus === 'PUBLISHED' ? 'Sale is now live!' : 'Sale is now hidden',
        'success'
      );
      // Refetch the sale data
      await new Promise(resolve => setTimeout(resolve, 500));
      router.push(`/organizer/edit-sale/${id}`);
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to update sale status', 'error');
    } finally {
      setIsTogglingStatus(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-white py-8">
        <div className="max-w-2xl mx-auto px-4">
          <Skeleton className="h-10 w-48 mb-8" />
          <div className="space-y-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-24" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Edit Sale - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-white">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Link href="/organizer/dashboard" className="text-amber-600 hover:underline text-sm font-medium mb-4 inline-block">
            Back to dashboard
          </Link>

          <div className="flex items-center justify-between gap-4 mb-8">
            <h1 className="text-3xl font-bold text-warm-900">Edit Sale</h1>
            {sale && (
              <div className="flex items-center gap-3">
                {sale.status === 'PUBLISHED' ? (
                  <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 rounded-full px-3 py-1 text-sm font-semibold">
                    \u25cf LIVE
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 rounded-full px-3 py-1 text-sm font-semibold">
                    \u25cc DRAFT
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleToggleSaleStatus}
                  disabled={isTogglingStatus}
                  className="text-sm bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded disabled:opacity-50 font-medium"
                >
                  {isTogglingStatus ? 'Updating...' : (sale.status === 'PUBLISHED' ? 'Unpublish' : 'Publish')}
                </button>
              </div>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-6">
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
              <p className="text-sm text-blue-700 mb-3">Want to create a similar sale?</p>
              <button
                type="button"
                onClick={handleCloneSale}
                disabled={isCloning}
                className="text-sm bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded disabled:opacity-50"
              >
                {isCloning ? 'Duplicating...' : 'Duplicate This Sale'}
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 mb-2">Title</label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className="block text-sm font-medium text-warm-700">Description</label>
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
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-2">Start Date</label>
                <input
                  type="date"
                  name="startDate"
                  value={formData.startDate}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-2">End Date</label>
                <input
                  type="date"
                  name="endDate"
                  value={formData.endDate}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 mb-2">Address</label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-2">City</label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-2">State</label>
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-2">ZIP</label>
                <input
                  type="text"
                  name="zip"
                  value={formData.zip}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Neighborhood \u2014 autocomplete input */}
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

            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </form>

          {/* Pickup Scheduling Section */}
          {id && <div className="mt-12"><PickupSlotManager saleId={id as string} /></div>}
        </div>
      </div>
    </>
  );
};

export default EditSalePage;
