/**
 * Consignor Portal & Payouts — Feature #309
 *
 * TEAMS-tier page for managing consignors:
 * - Create/edit/delete consignors
 * - View items and payout history
 * - Run payouts with method tracking
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import TierGate from '../../components/TierGate';
import Link from 'next/link';
import { Trash2, Edit2, DollarSign, Copy, Check } from 'lucide-react';

interface Consignor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  commissionRate: string | number; // Decimal from Prisma
  notes: string | null;
  portalToken: string;
  items: Array<{ id: string; title: string; price: string | number; status: string }>;
  payouts: Array<{
    id: string;
    totalSales: string | number;
    commissionAmount: string | number;
    paidAt: string | null;
  }>;
  createdAt: string;
}

type ModalMode = 'closed' | 'create' | 'edit';

const ConsignorsPage: React.FC = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [consignors, setConsignors] = useState<Consignor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>('closed');
  const [editingConsignor, setEditingConsignor] = useState<Consignor | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Form fields
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    commissionRate: '',
    notes: '',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Redirect if not authenticated or not an organizer
  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  // Fetch consignors on mount
  useEffect(() => {
    if (user && user.roles?.includes('ORGANIZER')) {
      fetchConsignors();
    }
  }, [user]);

  const fetchConsignors = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/consignors');
      setConsignors(response.data || []);
    } catch (error: any) {
      console.error('Error fetching consignors:', error);
      showToast('Failed to load consignors', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      commissionRate: '',
      notes: '',
    });
    setEditingConsignor(null);
    setModalMode('create');
  };

  const handleOpenEditModal = (consignor: Consignor) => {
    setFormData({
      name: consignor.name,
      email: consignor.email || '',
      phone: consignor.phone || '',
      commissionRate: String(consignor.commissionRate),
      notes: consignor.notes || '',
    });
    setEditingConsignor(consignor);
    setModalMode('edit');
  };

  const handleCloseModal = () => {
    setModalMode('closed');
    setEditingConsignor(null);
  };

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.commissionRate) {
      showToast('Name and commission rate are required', 'error');
      return;
    }

    const rate = parseFloat(formData.commissionRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      showToast('Commission rate must be between 0-100', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: formData.name,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        commissionRate: rate,
        notes: formData.notes || undefined,
      };

      if (modalMode === 'create') {
        const response = await api.post('/api/consignors', payload);
        setConsignors(prev => [response.data, ...prev]);
        showToast('Consignor created', 'success');
      } else if (editingConsignor) {
        const response = await api.put(`/api/consignors/${editingConsignor.id}`, payload);
        setConsignors(prev =>
          prev.map(c => (c.id === editingConsignor.id ? response.data : c))
        );
        showToast('Consignor updated', 'success');
      }

      handleCloseModal();
    } catch (error: any) {
      console.error('Error saving consignor:', error);
      showToast(error.response?.data?.error || 'Failed to save consignor', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (consignorId: string, consignorName: string) => {
    if (!window.confirm(`Delete consignor "${consignorName}"? This cannot be undone.`)) {
      return;
    }

    setIsDeleting(consignorId);
    try {
      await api.delete(`/api/consignors/${consignorId}`);
      setConsignors(prev => prev.filter(c => c.id !== consignorId));
      showToast('Consignor deleted', 'success');
    } catch (error: any) {
      console.error('Error deleting consignor:', error);
      const message = error.response?.data?.error || 'Failed to delete consignor';
      showToast(message, 'error');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/consignor/portal/${token}`);
    setCopiedToken(token);
    showToast('Portal link copied', 'success');
    setTimeout(() => setCopiedToken(null), 2000);
  };

  if (authLoading) {
    return <div>Loading...</div>;
  }

  return (
    <TierGate
      requiredTier="TEAMS"
      featureName="Consignor Management"
      description="Manage consignors, track items, and run payouts. Available on TEAMS and above."
    >
      <Head>
        <title>Consignors | FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-warm-900 dark:text-white">Consignors</h1>
              <p className="text-warm-600 dark:text-warm-400 mt-1">
                Manage third-party consignors and track payouts
              </p>
            </div>
            <button
              onClick={handleOpenCreateModal}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              + Add Consignor
            </button>
          </div>

          {/* Consignors List */}
          {loading ? (
            <div className="text-center py-12">
              <p className="text-warm-600 dark:text-warm-400">Loading consignors...</p>
            </div>
          ) : consignors.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center">
              <p className="text-warm-600 dark:text-warm-400 mb-4">No consignors yet</p>
              <button
                onClick={handleOpenCreateModal}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg transition-colors inline-block"
              >
                Create Your First Consignor
              </button>
            </div>
          ) : (
            <div className="grid gap-6">
              {consignors.map(consignor => (
                <div
                  key={consignor.id}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-6"
                >
                  {/* Card Header */}
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                    <div className="flex-1">
                      <h2 className="text-xl font-bold text-warm-900 dark:text-white mb-1">
                        {consignor.name}
                      </h2>
                      {consignor.email && (
                        <p className="text-sm text-warm-600 dark:text-warm-400">{consignor.email}</p>
                      )}
                      {consignor.phone && (
                        <p className="text-sm text-warm-600 dark:text-warm-400">{consignor.phone}</p>
                      )}
                      <p className="text-sm text-amber-600 dark:text-amber-400 font-bold mt-2">
                        Commission: {Number(consignor.commissionRate).toFixed(1)}%
                      </p>
                    </div>

                    {/* Portal Link */}
                    <div className="flex-shrink-0 bg-gray-50 dark:bg-gray-700 rounded-lg p-3 w-full md:w-auto">
                      <p className="text-xs font-bold text-warm-600 dark:text-warm-400 mb-1 uppercase">
                        Portal Link
                      </p>
                      <button
                        onClick={() => handleCopyToken(consignor.portalToken)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-mono break-all flex items-center gap-1"
                        title="Copy to clipboard"
                      >
                        {copiedToken === consignor.portalToken ? (
                          <>
                            <Check className="w-3 h-3" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy Link
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4 mb-4 py-3 border-y border-warm-200 dark:border-gray-700">
                    <div>
                      <p className="text-xs text-warm-500 dark:text-warm-400 uppercase font-bold">
                        Items
                      </p>
                      <p className="text-lg font-bold text-warm-900 dark:text-white">
                        {consignor.items.length}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-warm-500 dark:text-warm-400 uppercase font-bold">
                        Sold
                      </p>
                      <p className="text-lg font-bold text-warm-900 dark:text-white">
                        {consignor.items.filter(i => i.status === 'SOLD').length}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-warm-500 dark:text-warm-400 uppercase font-bold">
                        Payouts
                      </p>
                      <p className="text-lg font-bold text-warm-900 dark:text-white">
                        {consignor.payouts.length}
                      </p>
                    </div>
                  </div>

                  {/* Notes */}
                  {consignor.notes && (
                    <div className="mb-4 p-2 bg-warm-50 dark:bg-gray-700 rounded text-sm text-warm-700 dark:text-warm-300">
                      {consignor.notes}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-3 justify-end">
                    <button
                      onClick={() => handleOpenEditModal(consignor)}
                      className="flex items-center gap-2 px-3 py-2 bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 rounded-lg font-medium text-sm transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => router.push(`/organizer/consignors/${consignor.id}`)}
                      className="flex items-center gap-2 px-3 py-2 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg font-medium text-sm transition-colors"
                    >
                      <DollarSign className="w-4 h-4" />
                      Payout
                    </button>
                    <button
                      onClick={() => handleDelete(consignor.id, consignor.name)}
                      disabled={isDeleting === consignor.id}
                      className="flex items-center gap-2 px-3 py-2 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      {isDeleting === consignor.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {modalMode !== 'closed' && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseModal}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-warm-900 dark:text-white mb-4">
              {modalMode === 'create' ? 'Add Consignor' : 'Edit Consignor'}
            </h2>

            <form onSubmit={handleSave}>
              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleFormChange}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  required
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleFormChange}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleFormChange}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Commission Rate (%) *
                </label>
                <input
                  type="number"
                  name="commissionRate"
                  min="0"
                  max="100"
                  step="0.1"
                  value={formData.commissionRate}
                  onChange={handleFormChange}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  required
                />
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                  Percentage of sold item price paid to consignor
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleFormChange}
                  rows={3}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg font-bold transition-colors"
                >
                  {isSaving ? 'Saving...' : modalMode === 'create' ? 'Create' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </TierGate>
  );
};

export default ConsignorsPage;
