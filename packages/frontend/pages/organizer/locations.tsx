/**
 * Locations Management Page
 *
 * Feature #311: Multi-Location Inventory View
 * TEAMS-only page for managing multiple sale/inventory locations.
 *
 * Features:
 * - List all locations with item/sale counts
 * - Create, edit, delete locations
 * - Transfer items between locations
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import TierGate from '../../components/TierGate';
import { Plus, Edit2, Trash2, ArrowRightLeft } from 'lucide-react';
import Link from 'next/link';

interface Location {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  managerId: string | null;
  manager: {
    id: string;
    name: string;
    email: string;
  } | null;
  _count: {
    items: number;
    sales: number;
  };
  createdAt: string;
  updatedAt: string;
}

interface LocationItem {
  id: string;
  title: string;
  price: number | null;
  status: string;
  condition: string | null;
  photoUrls: string[];
  saleId: string | null;
  sale: {
    id: string;
    title: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

const LocationsPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferSourceLocation, setTransferSourceLocation] = useState<Location | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [formData, setFormData] = useState({ name: '', address: '', phone: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [transferItems, setTransferItems] = useState<LocationItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [transferTargetLocationId, setTransferTargetLocationId] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Auth guard
  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  // Fetch locations
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        setLoading(true);
        const res = await api.get('/locations');
        setLocations(res.data);
      } catch (error: any) {
        console.error('Failed to fetch locations:', error);
        showToast(error.response?.data?.error || 'Failed to load locations', 'error');
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading && user?.roles?.includes('ORGANIZER')) {
      fetchLocations();
    }
  }, [authLoading, user, showToast]);

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('Location name is required', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingLocation) {
        // Update
        const res = await api.put(`/locations/${editingLocation.id}`, formData);
        setLocations(prev =>
          prev.map(loc => (loc.id === editingLocation.id ? res.data : loc))
        );
        showToast('Location updated', 'success');
      } else {
        // Create
        const res = await api.post('/locations', formData);
        setLocations(prev => [...prev, res.data]);
        showToast('Location created', 'success');
      }
      setCreateModalOpen(false);
      setEditingLocation(null);
      setFormData({ name: '', address: '', phone: '' });
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to save location', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (location: Location) => {
    setEditingLocation(location);
    setFormData({
      name: location.name,
      address: location.address || '',
      phone: location.phone || '',
    });
    setCreateModalOpen(true);
  };

  const handleDelete = async (locationId: string) => {
    try {
      await api.delete(`/locations/${locationId}`);
      setLocations(prev => prev.filter(loc => loc.id !== locationId));
      setDeleteConfirm(null);
      showToast('Location deleted', 'success');
    } catch (error: any) {
      if (error.response?.status === 409) {
        showToast('Cannot delete — location has assigned items or sales. Transfer them first.', 'error');
      } else {
        showToast(error.response?.data?.error || 'Failed to delete location', 'error');
      }
      setDeleteConfirm(null);
    }
  };

  const handleTransferClick = async (location: Location) => {
    setTransferSourceLocation(location);
    setSelectedItemIds(new Set());
    setTransferTargetLocationId('');

    try {
      const res = await api.get(`/locations/${location.id}/inventory`);
      setTransferItems(res.data.items || []);
      setTransferModalOpen(true);
    } catch (error: any) {
      showToast('Failed to load location inventory', 'error');
    }
  };

  const handleToggleItemSelect = (itemId: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleTransferConfirm = async () => {
    if (!transferSourceLocation || !transferTargetLocationId || selectedItemIds.size === 0) {
      showToast('Please select a destination and at least one item', 'error');
      return;
    }

    setIsTransferring(true);
    try {
      const res = await api.post(`/locations/${transferSourceLocation.id}/transfer`, {
        itemIds: Array.from(selectedItemIds),
        toLocationId: transferTargetLocationId,
      });

      // Refetch locations to update counts
      const locRes = await api.get('/locations');
      setLocations(locRes.data);

      setTransferModalOpen(false);
      setTransferSourceLocation(null);
      setTransferItems([]);
      setSelectedItemIds(new Set());
      setTransferTargetLocationId('');

      showToast(`${res.data.transferred} item(s) transferred successfully`, 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to transfer items', 'error');
    } finally {
      setIsTransferring(false);
    }
  };

  const closeCreateModal = () => {
    setCreateModalOpen(false);
    setEditingLocation(null);
    setFormData({ name: '', address: '', phone: '' });
  };

  const closeTransferModal = () => {
    setTransferModalOpen(false);
    setTransferSourceLocation(null);
    setTransferItems([]);
    setSelectedItemIds(new Set());
    setTransferTargetLocationId('');
  };

  if (authLoading) return <div>Loading...</div>;

  return (
    <>
      <Head>
        <title>Locations - FindA.Sale</title>
      </Head>
      <TierGate requiredTier="TEAMS" featureName="Multi-Location Inventory">
        <div className="min-h-screen bg-white dark:bg-gray-800">
          <div className="max-w-6xl mx-auto px-4 py-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <Link
                  href="/organizer/dashboard"
                  className="text-amber-600 hover:underline text-sm font-medium mb-2 inline-block"
                >
                  Back to dashboard
                </Link>
                <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100">Locations</h1>
                <p className="text-warm-600 dark:text-warm-400 mt-2">
                  Manage multiple sale locations and transfer inventory between them.
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingLocation(null);
                  setFormData({ name: '', address: '', phone: '' });
                  setCreateModalOpen(true);
                }}
                className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
              >
                <Plus size={20} />
                Add Location
              </button>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <p className="text-warm-600 dark:text-warm-400">Loading locations...</p>
              </div>
            ) : locations.length === 0 ? (
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow p-12 text-center">
                <p className="text-warm-600 dark:text-warm-300 mb-4">No locations yet</p>
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                >
                  Create Your First Location
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-warm-200 dark:border-gray-600">
                      <th className="text-left py-3 px-4 font-semibold text-warm-700 dark:text-warm-300">Location</th>
                      <th className="text-left py-3 px-4 font-semibold text-warm-700 dark:text-warm-300">Address</th>
                      <th className="text-center py-3 px-4 font-semibold text-warm-700 dark:text-warm-300">Items</th>
                      <th className="text-center py-3 px-4 font-semibold text-warm-700 dark:text-warm-300">Sales</th>
                      <th className="text-right py-3 px-4 font-semibold text-warm-700 dark:text-warm-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {locations.map(location => (
                      <tr
                        key={location.id}
                        className="border-b border-warm-100 dark:border-gray-700 hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <td className="py-4 px-4">
                          <div>
                            <p className="font-semibold text-warm-900 dark:text-warm-100">{location.name}</p>
                            {location.phone && (
                              <p className="text-xs text-warm-500 dark:text-warm-400">{location.phone}</p>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-sm text-warm-600 dark:text-warm-300">
                          {location.address || '—'}
                        </td>
                        <td className="py-4 px-4 text-center font-semibold text-warm-900 dark:text-warm-100">
                          {location._count.items}
                        </td>
                        <td className="py-4 px-4 text-center font-semibold text-warm-900 dark:text-warm-100">
                          {location._count.sales}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <div className="flex gap-2 justify-end">
                            {location._count.items > 0 && (
                              <button
                                onClick={() => handleTransferClick(location)}
                                title="Transfer items"
                                className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                              >
                                <ArrowRightLeft size={18} />
                              </button>
                            )}
                            <button
                              onClick={() => handleEdit(location)}
                              title="Edit location"
                              className="p-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-colors"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(location.id)}
                              title="Delete location"
                              disabled={location._count.items > 0 || location._count.sales > 0}
                              className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </TierGate>

      {/* Create/Edit Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">
              {editingLocation ? 'Edit Location' : 'Create Location'}
            </h2>
            <form onSubmit={handleCreateOrUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Location Name*
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Main Warehouse"
                  className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Address (optional)
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="123 Main St"
                  className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Phone (optional)
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(616) 123-4567"
                  className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg text-warm-900 dark:text-warm-100 font-semibold hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-4">Delete Location</h2>
            <p className="text-warm-600 dark:text-warm-300 mb-6">
              Are you sure? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg text-warm-900 dark:text-warm-100 font-semibold hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {transferModalOpen && transferSourceLocation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-2xl w-full mx-4 my-8">
            <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-2">
              Transfer Items from {transferSourceLocation.name}
            </h2>
            <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
              Select items to move to another location
            </p>

            <div className="mb-6 max-h-64 overflow-y-auto border border-warm-200 dark:border-gray-600 rounded-lg">
              {transferItems.length === 0 ? (
                <p className="p-4 text-center text-warm-500 dark:text-warm-400">No items at this location</p>
              ) : (
                <div className="divide-y divide-warm-100 dark:divide-gray-700">
                  {transferItems.map(item => (
                    <label
                      key={item.id}
                      className="flex items-center gap-3 p-3 hover:bg-warm-50 dark:hover:bg-gray-700/50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedItemIds.has(item.id)}
                        onChange={() => handleToggleItemSelect(item.id)}
                        className="w-4 h-4 rounded border-warm-300 dark:border-gray-600"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-warm-900 dark:text-warm-100 truncate">
                          {item.title}
                        </p>
                        {item.sale && (
                          <p className="text-xs text-warm-500 dark:text-warm-400">in {item.sale.title}</p>
                        )}
                      </div>
                      {item.price && (
                        <p className="text-sm font-semibold text-warm-900 dark:text-warm-100">
                          ${item.price.toFixed(2)}
                        </p>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Move to Location*
              </label>
              <select
                value={transferTargetLocationId}
                onChange={(e) => setTransferTargetLocationId(e.target.value)}
                className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Select destination...</option>
                {locations
                  .filter(loc => loc.id !== transferSourceLocation.id)
                  .map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex gap-3">
              <button
                onClick={closeTransferModal}
                className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg text-warm-900 dark:text-warm-100 font-semibold hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleTransferConfirm}
                disabled={isTransferring || selectedItemIds.size === 0 || !transferTargetLocationId}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors"
              >
                {isTransferring ? 'Transferring...' : `Transfer ${selectedItemIds.size} Item(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default LocationsPage;
