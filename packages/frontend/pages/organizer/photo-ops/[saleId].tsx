import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../../lib/api';
import Layout from '../../../components/Layout';
import { useOrganizerTier } from '../../../hooks/useOrganizerTier';
import type { PhotoOpStation } from '../../../hooks/usePhotoOps';

const PhotoOpsPage: React.FC = () => {
  const router = useRouter();
  const { saleId } = router.query;
  const { isPro } = useOrganizerTier();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    lat: 0,
    lng: 0,
    frameImageUrl: '',
  });

  // Fetch stations
  const { data: stations = [], isLoading, refetch } = useQuery({
    queryKey: ['photo-ops', saleId],
    queryFn: async () => {
      const response = await api.get(`/sales/${saleId}/photo-ops`);
      return response.data as PhotoOpStation[];
    },
    enabled: !!saleId,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await api.post(`/sales/${saleId}/photo-ops`, data);
      return response.data;
    },
    onSuccess: () => {
      refetch();
      resetForm();
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await api.put(`/photo-ops/${editingId}`, data);
      return response.data;
    },
    onSuccess: () => {
      refetch();
      resetForm();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (stationId: string) => {
      await api.delete(`/photo-ops/${stationId}`);
    },
    onSuccess: () => {
      refetch();
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await updateMutation.mutateAsync(formData);
    } else {
      await createMutation.mutateAsync(formData);
    }
  };

  const handleEdit = (station: PhotoOpStation) => {
    setEditingId(station.id);
    setFormData({
      name: station.name,
      description: station.description || '',
      lat: station.lat,
      lng: station.lng,
      frameImageUrl: station.frameImageUrl || '',
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({ name: '', description: '', lat: 0, lng: 0, frameImageUrl: '' });
    setEditingId(null);
    setShowForm(false);
  };

  if (!isPro) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-amber-900 mb-2">Upgrade to PRO</h2>
            <p className="text-sm text-amber-800 mb-2">
              Mark your best photo spots on the map and let shoppers know where to find the most Instagrammable finds at your sale.
            </p>
            <p className="text-sm text-amber-800 mb-4">
              Photo Op Stations is a PRO-tier feature.
            </p>
            <a
              href="/organizer/upgrade"
              className="inline-block px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700"
            >
              View Plans
            </a>
          </div>
        </div>
      </Layout>
    );
  }

  if (!saleId) return null;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Photo Op Stations</h1>

        {/* Add Station Button */}
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="mb-6 px-4 py-2 bg-sage-600 text-white rounded hover:bg-sage-700"
          >
            + Add Station
          </button>
        )}

        {/* Form */}
        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-8 p-6 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
          >
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Station Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded"
                placeholder="e.g., Front Porch Photo Spot"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded"
                placeholder="e.g., Charming window with vintage lamp and painting"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Latitude *
                </label>
                <input
                  type="number"
                  required
                  step="0.0001"
                  value={formData.lat}
                  onChange={(e) => setFormData({ ...formData, lat: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded"
                  placeholder="42.7335"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Longitude *
                </label>
                <input
                  type="number"
                  required
                  step="0.0001"
                  value={formData.lng}
                  onChange={(e) => setFormData({ ...formData, lng: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded"
                  placeholder="-85.6465"
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Frame Image URL
              </label>
              <input
                type="url"
                value={formData.frameImageUrl}
                onChange={(e) => setFormData({ ...formData, frameImageUrl: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded"
                placeholder="https://cdn.example.com/frame.png"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 bg-sage-600 text-white rounded hover:bg-sage-700 disabled:opacity-50"
              >
                {editingId ? 'Update' : 'Create'} Station
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Stations List */}
        <div className="space-y-4">
          {isLoading ? (
            <p className="text-gray-500 dark:text-gray-400">Loading stations...</p>
          ) : stations.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No photo op stations yet. Create one to get started!</p>
          ) : (
            stations.map((station) => (
              <div
                key={station.id}
                className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg flex justify-between items-start"
              >
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{station.name}</h3>
                  {station.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{station.description}</p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    📍 {station.lat.toFixed(4)}, {station.lng.toFixed(4)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(station)}
                    className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(station.id)}
                    disabled={deleteMutation.isPending}
                    className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
};

export default PhotoOpsPage;
