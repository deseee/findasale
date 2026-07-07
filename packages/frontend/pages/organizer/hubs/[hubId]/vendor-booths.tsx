/**
 * Vendor Booth Payments — Organizer Admin Table (2026-07-07)
 * ADR-015/016/017. TEAMS-tier page for managing vendor booths within a flea
 * market hub: create/edit/delete booths, view claim status, copy booth invite
 * links, and run settlement.
 * Functional over polished — correctness and full state coverage
 * (empty/loading/error) prioritized over visual polish.
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import api from '../../../../lib/api';
import { useAuth } from '../../../../components/AuthContext';
import { useToast } from '../../../../components/ToastContext';
import TierGate from '../../../../components/TierGate';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import { Trash2, Edit2, Copy, Check, DollarSign } from 'lucide-react';

interface VendorBooth {
  id: string;
  hubId: string;
  boothNumber: string;
  vendorName: string;
  vendorEmail: string | null;
  vendorPhone: string | null;
  boothFee: string | number;
  revenueSharePercent: number;
  status: string;
  stripeOnboarded: boolean;
  boothToken: string;
  userId: string | null;
  confirmedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
}

type ModalMode = 'closed' | 'create' | 'edit';

const VendorBoothsPage: React.FC = () => {
  const router = useRouter();
  const { hubId } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [booths, setBooths] = useState<VendorBooth[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>('closed');
  const [editingBooth, setEditingBooth] = useState<VendorBooth | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string; name: string }>({
    open: false, id: '', name: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    boothNumber: '',
    vendorName: '',
    vendorEmail: '',
    vendorPhone: '',
    boothFee: '',
    revenueSharePercent: '',
    notes: '',
  });

  const fetchBooths = async () => {
    if (!hubId || typeof hubId !== 'string') return;
    try {
      setLoading(true);
      setLoadError(null);
      const response = await api.get(`/organizer/hubs/${hubId}/vendor-booths`);
      setBooths(response.data || []);
    } catch (error: any) {
      console.error('Error fetching vendor booths:', error);
      setLoadError(error.response?.data?.error || 'Failed to load vendor booths');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && hubId) fetchBooths();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hubId]);

  if (!authLoading && !user) {
    router.push('/login');
    return null;
  }

  const handleOpenCreateModal = () => {
    setFormData({ boothNumber: '', vendorName: '', vendorEmail: '', vendorPhone: '', boothFee: '', revenueSharePercent: '', notes: '' });
    setEditingBooth(null);
    setModalMode('create');
  };

  const handleOpenEditModal = (booth: VendorBooth) => {
    setFormData({
      boothNumber: booth.boothNumber,
      vendorName: booth.vendorName,
      vendorEmail: booth.vendorEmail || '',
      vendorPhone: booth.vendorPhone || '',
      boothFee: String(booth.boothFee),
      revenueSharePercent: String(booth.revenueSharePercent),
      notes: '',
    });
    setEditingBooth(booth);
    setModalMode('edit');
  };

  const handleCloseModal = () => {
    setModalMode('closed');
    setEditingBooth(null);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.boothNumber || !formData.vendorName) {
      showToast('Booth number and vendor name are required', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        boothNumber: formData.boothNumber,
        vendorName: formData.vendorName,
        vendorEmail: formData.vendorEmail || undefined,
        vendorPhone: formData.vendorPhone || undefined,
        boothFee: formData.boothFee ? parseFloat(formData.boothFee) : 0,
        revenueSharePercent: formData.revenueSharePercent ? parseFloat(formData.revenueSharePercent) : 0,
        notes: formData.notes || undefined,
      };

      if (modalMode === 'create') {
        const response = await api.post(`/organizer/hubs/${hubId}/vendor-booths`, payload);
        setBooths((prev) => [...prev, response.data]);
        showToast('Vendor booth created', 'success');
      } else if (editingBooth) {
        const response = await api.put(`/organizer/hubs/${hubId}/vendor-booths/${editingBooth.id}`, payload);
        setBooths((prev) => prev.map((b) => (b.id === editingBooth.id ? response.data : b)));
        showToast('Vendor booth updated', 'success');
      }
      handleCloseModal();
    } catch (error: any) {
      console.error('Error saving vendor booth:', error);
      showToast(error.response?.data?.error || 'Failed to save vendor booth', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (booth: VendorBooth, status: string) => {
    try {
      const response = await api.put(`/organizer/hubs/${hubId}/vendor-booths/${booth.id}`, { status });
      setBooths((prev) => prev.map((b) => (b.id === booth.id ? response.data : b)));
      showToast(`Booth ${status.toLowerCase()}`, 'success');
    } catch (error: any) {
      console.error('Error updating booth status:', error);
      showToast(error.response?.data?.error || 'Failed to update status', 'error');
    }
  };

  const handleDelete = (id: string, name: string) => setDeleteConfirm({ open: true, id, name });

  const performDelete = async () => {
    setIsDeleting(deleteConfirm.id);
    try {
      await api.delete(`/organizer/hubs/${hubId}/vendor-booths/${deleteConfirm.id}`);
      setBooths((prev) => prev.filter((b) => b.id !== deleteConfirm.id));
      showToast('Vendor booth removed', 'success');
    } catch (error: any) {
      console.error('Error deleting vendor booth:', error);
      showToast(error.response?.data?.error || 'Failed to remove vendor booth', 'error');
    } finally {
      setIsDeleting(null);
      setDeleteConfirm({ open: false, id: '', name: '' });
    }
  };

  const handleCopyInviteLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/vendor-booth/${token}`);
    setCopiedToken(token);
    showToast('Booth invite link copied', 'success');
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case 'CONFIRMED': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'REJECTED': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      case 'CANCELLED': return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
      default: return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    }
  };

  if (authLoading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  return (
    <TierGate
      requiredTier="TEAMS"
      featureName="Vendor Booth Management"
      description="Manage flea market vendor booths, claims, and settlements. Available on TEAMS and above."
    >
      <Head>
        <title>Vendor Booths | FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-warm-900 dark:text-white">Vendor Booths</h1>
              <p className="text-warm-600 dark:text-warm-400 mt-1">
                Manage booths, claims, and payouts for this flea market hub
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href={`/organizer/hubs/${hubId}/cart`}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
              >
                Open Register
              </Link>
              <button
                onClick={handleOpenCreateModal}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
              >
                + Add Booth
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <p className="text-warm-600 dark:text-warm-400">Loading vendor booths...</p>
            </div>
          ) : loadError ? (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-8 text-center">
              <p className="text-red-700 dark:text-red-400 mb-2">{loadError}</p>
              <button onClick={fetchBooths} className="text-sm underline text-red-700 dark:text-red-400">
                Try again
              </button>
            </div>
          ) : booths.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center">
              <p className="text-warm-600 dark:text-warm-400 mb-4">No vendor booths yet</p>
              <button
                onClick={handleOpenCreateModal}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg transition-colors inline-block"
              >
                Add Your First Booth
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-warm-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="bg-warm-100 dark:bg-gray-700 text-left">
                  <tr>
                    <th className="p-3 font-bold text-warm-700 dark:text-warm-300">Booth #</th>
                    <th className="p-3 font-bold text-warm-700 dark:text-warm-300">Vendor</th>
                    <th className="p-3 font-bold text-warm-700 dark:text-warm-300">Status</th>
                    <th className="p-3 font-bold text-warm-700 dark:text-warm-300">Claimed</th>
                    <th className="p-3 font-bold text-warm-700 dark:text-warm-300">Stripe</th>
                    <th className="p-3 font-bold text-warm-700 dark:text-warm-300">Booth Fee</th>
                    <th className="p-3 font-bold text-warm-700 dark:text-warm-300">Rev Share %</th>
                    <th className="p-3 font-bold text-warm-700 dark:text-warm-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {booths.map((booth) => (
                    <tr key={booth.id} className="border-t border-warm-200 dark:border-gray-700">
                      <td className="p-3 font-mono text-warm-900 dark:text-white">{booth.boothNumber}</td>
                      <td className="p-3">
                        <div className="text-warm-900 dark:text-white font-medium">{booth.vendorName}</div>
                        {booth.vendorEmail && (
                          <div className="text-xs text-warm-500 dark:text-warm-400">{booth.vendorEmail}</div>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${statusBadgeClass(booth.status)}`}>
                          {booth.status}
                        </span>
                      </td>
                      <td className="p-3">
                        {booth.userId ? (
                          <span className="text-green-600 dark:text-green-400 text-xs font-bold">Claimed</span>
                        ) : (
                          <span className="text-warm-400 text-xs">Unclaimed</span>
                        )}
                      </td>
                      <td className="p-3">
                        {booth.stripeOnboarded ? (
                          <span className="text-green-600 dark:text-green-400 text-xs font-bold">Onboarded</span>
                        ) : (
                          <span className="text-warm-400 text-xs">Not onboarded</span>
                        )}
                      </td>
                      <td className="p-3 text-warm-700 dark:text-warm-300">${Number(booth.boothFee).toFixed(2)}</td>
                      <td className="p-3 text-warm-700 dark:text-warm-300">{booth.revenueSharePercent}%</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          {booth.status === 'PENDING' && (
                            <button
                              onClick={() => handleStatusChange(booth, 'CONFIRMED')}
                              className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded font-bold"
                            >
                              Confirm
                            </button>
                          )}
                          <button
                            onClick={() => handleCopyInviteLink(booth.boothToken)}
                            className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded font-bold flex items-center gap-1"
                          >
                            {copiedToken === booth.boothToken ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            Invite Link
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(booth)}
                            className="text-xs px-2 py-1 bg-warm-100 dark:bg-gray-700 text-warm-700 dark:text-warm-300 rounded font-bold"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDelete(booth.id, booth.vendorName)}
                            disabled={isDeleting === booth.id}
                            className="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded font-bold disabled:opacity-50"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6">
            <Link
              href={`/organizer/hubs/${hubId}/settlement`}
              className="inline-flex items-center gap-2 bg-warm-900 dark:bg-warm-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-warm-800 transition-colors"
            >
              <DollarSign className="w-4 h-4" />
              Run Settlement
            </Link>
          </div>
        </div>
      </div>

      {modalMode !== 'closed' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={handleCloseModal}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-warm-900 dark:text-white mb-4">
              {modalMode === 'create' ? 'Add Vendor Booth' : 'Edit Vendor Booth'}
            </h2>
            <form onSubmit={handleSave}>
              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">Booth Number *</label>
                <input
                  type="text" name="boothNumber" value={formData.boothNumber} onChange={handleFormChange}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-700 dark:text-white"
                  required aria-label="Booth Number"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">Vendor Name *</label>
                <input
                  type="text" name="vendorName" value={formData.vendorName} onChange={handleFormChange}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-700 dark:text-white"
                  required aria-label="Vendor Name"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">Vendor Email</label>
                <input
                  type="email" name="vendorEmail" value={formData.vendorEmail} onChange={handleFormChange}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-700 dark:text-white"
                  aria-label="Vendor Email"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">Vendor Phone</label>
                <input
                  type="tel" name="vendorPhone" value={formData.vendorPhone} onChange={handleFormChange}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-700 dark:text-white"
                  aria-label="Vendor Phone"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div>
                  <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">Booth Fee ($)</label>
                  <input
                    type="number" name="boothFee" min="0" step="0.01" value={formData.boothFee} onChange={handleFormChange}
                    className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-700 dark:text-white"
                    aria-label="Booth Fee"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">Rev Share (%)</label>
                  <input
                    type="number" name="revenueSharePercent" min="0" max="100" step="0.1" value={formData.revenueSharePercent} onChange={handleFormChange}
                    className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-700 dark:text-white"
                    aria-label="Revenue Share Percent"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={handleCloseModal} className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg text-warm-700 dark:text-warm-300 font-medium">
                  Cancel
                </button>
                <button type="submit" disabled={isSaving} className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg font-bold transition-colors">
                  {isSaving ? 'Saving...' : modalMode === 'create' ? 'Create' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Remove Vendor Booth"
        message={`Remove booth "${deleteConfirm.name}"? This cannot be undone.`}
        confirmLabel="Remove"
        onConfirm={performDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: '', name: '' })}
        variant="danger"
      />
    </TierGate>
  );
};

export default VendorBoothsPage;
