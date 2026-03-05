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

const EditSalePage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user, isLoading: authLoading } = useAuth();
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

  if (authLoading || isLoading) return <div>Loading...</div>;

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

          <h1 className="text-3xl font-bold text-warm-900 mb-8">Edit Sale</h1>

          <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-6">
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
              <label className="block text-sm font-medium text-warm-700 mb-2">Description</label>
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

            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default EditSalePage;
