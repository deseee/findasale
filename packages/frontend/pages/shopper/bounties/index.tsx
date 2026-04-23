import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../../components/AuthContext';
import { Target, MapPin, Clock, DollarSign, X, Bell } from 'lucide-react';
import api from '../../../lib/api';
import { useToast } from '../../../components/ToastContext';

interface Bounty {
  id: string;
  itemName: string;
  description?: string;
  category?: string;
  maxBudget?: number;
  radiusMiles?: number;
  xpReward: number;
  referenceUrl?: string;
  status: string;
  user: { name: string };
  createdAt: string;
}

interface BountyRequest {
  itemName: string;
  description: string;
  category: string;
  maxBudget: number;
  radius: number;
  xpReward: number;
  referenceUrl: string;
}

interface Sale {
  id: string;
  title: string;
}

interface Item {
  id: string;
  title: string;
  price?: number;
  status: string;
}

interface SubmissionModalState {
  isOpen: boolean;
  bountyId: string | null;
  selectedSaleId: string | null;
  selectedItemId: string | null;
  message: string;
  isSubmitting: boolean;
}

export default function ShopperBountiesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activeBounties, setActiveBounties] = useState<Bounty[]>([]);
  const [isLoadingBounties, setIsLoadingBounties] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedBountyId, setExpandedBountyId] = useState<string | null>(null);
  const [formData, setFormData] = useState<BountyRequest>({
    itemName: '',
    description: '',
    category: 'other',
    maxBudget: 0,
    radius: 25,
    xpReward: 50,
    referenceUrl: '',
  });
  const [submittingMatch, setSubmittingMatch] = useState(false);
  const [selectedBountyId, setSelectedBountyId] = useState<string | null>(null);
  const [submissionModal, setSubmissionModal] = useState<SubmissionModalState>({
    isOpen: false,
    bountyId: null,
    selectedSaleId: null,
    selectedItemId: null,
    message: '',
    isSubmitting: false,
  });
  const [organizerSales, setOrganizerSales] = useState<Sale[]>([]);
  const [organizerItems, setOrganizerItems] = useState<Map<string, Item[]>>(new Map());

  // Load active bounties when page loads
  React.useEffect(() => {
    loadActiveBounties();
  }, []);

  const loadActiveBounties = async () => {
    try {
      setIsLoadingBounties(true);
      const response = await api.get('/bounties/community');
      setActiveBounties(response.data.bounties || []);
    } catch (error) {
      console.error('Error fetching bounties:', error);
      showToast('Failed to load bounties', 'error');
    } finally {
      setIsLoadingBounties(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev: BountyRequest) => ({
      ...prev,
      [name]: name === 'maxBudget' || name === 'radius' || name === 'xpReward' ? parseFloat(value) : value,
    }));
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.itemName.trim()) {
      showToast('Please enter an item name', 'error');
      return;
    }

    if (formData.xpReward < 50) {
      showToast('XP reward must be at least 50', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      await api.post('/bounties', {
        itemName: formData.itemName,
        description: formData.description,
        category: formData.category,
        maxBudget: formData.maxBudget,
        radiusMiles: formData.radius,
        xpReward: Math.max(50, formData.xpReward),
        referenceUrl: formData.referenceUrl,
      });

      showToast('Bounty request submitted successfully!', 'success');
      setFormData({ itemName: '', description: '', category: 'other', maxBudget: 0, radius: 25, xpReward: 50, referenceUrl: '' });
      setShowRequestForm(false);
      // Reload bounties to show the new request
      await loadActiveBounties();
    } catch (error) {
      console.error('Error submitting bounty request:', error);
      showToast('Failed to submit bounty request', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitMatch = async (bountyId: string) => {
    // Check if user is an organizer
    const isOrganizer = user?.roles?.includes('ORGANIZER') || user?.role === 'ORGANIZER';

    if (!isOrganizer) {
      showToast('This feature requires you to be an organizer. Please list items in a sale to submit matches.', 'info');
      return;
    }

    // Load organizer's sales for the modal
    try {
      const response = await api.get('/sales/mine');
      const sales = response.data.sales || [];
      setOrganizerSales(sales);

      // Initialize items map
      const itemsMap = new Map<string, Item[]>();

      // Fetch items for each sale
      for (const sale of sales) {
        try {
          const saleResponse = await api.get(`/sales/${sale.id}`);
          const items = saleResponse.data.items || [];
          itemsMap.set(sale.id, items);
        } catch (err) {
          console.error(`Error fetching items for sale ${sale.id}:`, err);
          itemsMap.set(sale.id, []);
        }
      }

      setOrganizerItems(itemsMap);
      setSubmissionModal({
        isOpen: true,
        bountyId,
        selectedSaleId: sales.length > 0 ? sales[0].id : null,
        selectedItemId: null,
        message: '',
        isSubmitting: false,
      });
      setExpandedBountyId(null);
    } catch (error) {
      console.error('Error loading sales for submission:', error);
      showToast('Failed to load your sales', 'error');
    }
  };

  const handleSubmitBountyMatch = async () => {
    if (!submissionModal.bountyId || !submissionModal.selectedItemId) {
      showToast('Please select an item', 'error');
      return;
    }

    try {
      setSubmissionModal((prev: SubmissionModalState) => ({ ...prev, isSubmitting: true }));

      await api.post(`/bounties/${submissionModal.bountyId}/submissions`, {
        itemId: submissionModal.selectedItemId,
        message: submissionModal.message.trim() || null,
      });

      showToast('Match submitted successfully!', 'success');
      setSubmissionModal({
        isOpen: false,
        bountyId: null,
        selectedSaleId: null,
        selectedItemId: null,
        message: '',
        isSubmitting: false,
      });
    } catch (error) {
      console.error('Error submitting match:', error);
      const errorMsg = (error as any).response?.data?.message || 'Failed to submit match';
      showToast(errorMsg, 'error');
    } finally {
      setSubmissionModal((prev: SubmissionModalState) => ({ ...prev, isSubmitting: false }));
    }
  };

  return (
    <>
      <Head>
        <title>Bounty Board - FindA.Sale</title>
        <meta name="description" content="Request hard-to-find items from local organizers" />
      </Head>

      {/* Submission Modal */}
      {submissionModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Submit a Match
              </h2>
              <button
                onClick={() => setSubmissionModal(prev => ({ ...prev, isOpen: false }))}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Sale Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Select a Sale *
                </label>
                <select
                  value={submissionModal.selectedSaleId || ''}
                  onChange={(e) => {
                    const saleId = e.target.value;
                    setSubmissionModal(prev => ({
                      ...prev,
                      selectedSaleId: saleId,
                      selectedItemId: null,
                    }));
                  }}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">-- Select a sale --</option>
                  {organizerSales.map(sale => (
                    <option key={sale.id} value={sale.id}>
                      {sale.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Item Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Select an Item *
                </label>
                <select
                  value={submissionModal.selectedItemId || ''}
                  onChange={(e) => {
                    setSubmissionModal(prev => ({
                      ...prev,
                      selectedItemId: e.target.value,
                    }));
                  }}
                  disabled={!submissionModal.selectedSaleId}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                >
                  <option value="">-- Select an item --</option>
                  {submissionModal.selectedSaleId && organizerItems.get(submissionModal.selectedSaleId)?.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.title} {item.price ? `($${item.price.toFixed(2)})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Optional Message */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Message to Shopper <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={submissionModal.message}
                  onChange={(e) => {
                    const text = e.target.value.slice(0, 500);
                    setSubmissionModal(prev => ({
                      ...prev,
                      message: text,
                    }));
                  }}
                  placeholder="Add a note about this item or the match..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 resize-none"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {submissionModal.message.length}/500
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setSubmissionModal(prev => ({ ...prev, isOpen: false }))}
                  className="flex-1 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitBountyMatch}
                  disabled={!submissionModal.selectedItemId || submissionModal.isSubmitting}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {submissionModal.isSubmitting ? 'Submitting...' : 'Submit Match'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header with Submissions Link */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                Bounty Board
              </h1>
              <p className="text-lg text-gray-600 dark:text-gray-400">
                Request hard-to-find items from local organizers
              </p>
            </div>
            <Link href="/shopper/bounties/submissions" className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors">
              <Bell size={18} className="text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">My Submissions</span>
            </Link>
          </div>
        </div>

        {/* Request Button */}
        <div className="mb-8">
          <button
            onClick={() => setShowRequestForm(!showRequestForm)}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors"
          >
            {showRequestForm ? 'Cancel' : '+ Request a Bounty'}
          </button>
        </div>

        {/* Request Form */}
        {showRequestForm && (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
              Request an Item
            </h2>
            <form onSubmit={handleSubmitRequest}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Item Name *
                  </label>
                  <input
                    type="text"
                    name="itemName"
                    value={formData.itemName}
                    onChange={handleInputChange}
                    placeholder="What are you looking for?"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Category
                  </label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="other">Other</option>
                    <option value="furniture">Furniture</option>
                    <option value="decor">Decor</option>
                    <option value="vintage">Vintage</option>
                    <option value="collectibles">Collectibles</option>
                  </select>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Provide any details that might help organizers find this item..."
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Reference Photo/Link
                </label>
                <input
                  type="url"
                  name="referenceUrl"
                  value={formData.referenceUrl}
                  onChange={handleInputChange}
                  placeholder="https://example.com/photo.jpg or link to similar item"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Optional: Link to a photo or reference item to help organizers understand what you're looking for
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Max Budget ($)
                  </label>
                  <input
                    type="number"
                    name="maxBudget"
                    value={formData.maxBudget}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Search Radius (miles)
                  </label>
                  <input
                    type="number"
                    name="radius"
                    value={formData.radius}
                    onChange={handleInputChange}
                    placeholder="25"
                    step="5"
                    min="5"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    XP Reward <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="xpReward"
                    value={formData.xpReward}
                    onChange={handleInputChange}
                    placeholder="50"
                    step="10"
                    min="50"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 mb-2">
                    Minimum 50 XP. Organizers earn this as a reward if they find your item
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-slate-700/50 p-3 rounded border border-gray-200 dark:border-gray-700">
                    <strong>How XP works:</strong> Organizers receive half the bounty amount after fulfillment. The more XP you offer, the more likely organizers are to respond. XP is taken from your account at posting and is non-refundable.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Bounty Request'}
              </button>
            </form>
          </div>
        )}

        {/* Browse Active Bounties */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
            Browse Active Bounties
          </h2>

          {isLoadingBounties ? (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400">Loading bounties...</p>
            </div>
          ) : activeBounties.length === 0 ? (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-8 text-center">
              <Target size={48} className="mx-auto mb-4 text-blue-500" />
              <h3 className="text-xl font-semibold text-blue-900 dark:text-blue-100 mb-2">
                No bounties yet
              </h3>
              <p className="text-blue-800 dark:text-blue-300">
                Be the first to request an item from local organizers!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeBounties.map((bounty) => {
                const isExpanded = expandedBountyId === bounty.id;
                return (
                  <div
                    key={bounty.id}
                    className="bg-white dark:bg-slate-800 rounded-lg shadow hover:shadow-lg transition-all cursor-pointer"
                    onClick={() => setExpandedBountyId(isExpanded ? null : bounty.id)}
                  >
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex-1">
                          {bounty.itemName}
                        </h3>
                        <span className="ml-2 px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold rounded-full">
                          {bounty.status}
                        </span>
                      </div>

                      {bounty.description && (
                        <p className={`text-sm text-gray-600 dark:text-gray-400 mb-4 ${isExpanded ? '' : 'line-clamp-2'}`}>
                          {bounty.description}
                        </p>
                      )}

                      <div className="space-y-2 mb-4 text-sm">
                        {bounty.maxBudget !== undefined && (
                          <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                            <DollarSign size={16} className="text-gray-400" />
                            <span>Budget: ${bounty.maxBudget.toFixed(2)}</span>
                          </div>
                        )}
                        {bounty.radiusMiles !== undefined && (
                          <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                            <MapPin size={16} className="text-gray-400" />
                            <span>Within {bounty.radiusMiles} miles</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                          <Target size={16} className="text-amber-500" />
                          <span>🏆 {bounty.xpReward} XP reward</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                          <Clock size={16} className="text-gray-400" />
                          <span>{new Date(bounty.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                          <div className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                            <p className="font-semibold mb-2">Created by: {bounty.user.name}</p>
                          </div>

                          {bounty.referenceUrl && (
                            <div className="mb-3">
                              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                                Reference Link
                              </p>
                              <a
                                href={bounty.referenceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline break-all"
                              >
                                {bounty.referenceUrl}
                              </a>
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSubmitMatch(bounty.id);
                              }}
                              disabled={submittingMatch}
                              className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors text-sm"
                            >
                              {submittingMatch ? 'Submitting...' : 'Submit a Match'}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedBountyId(null);
                              }}
                              className="flex-1 px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-900 dark:text-gray-100 font-semibold rounded-lg transition-colors text-sm"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      )}

                      {!isExpanded && (
                        <button className="w-full px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-semibold rounded-lg transition-colors text-sm">
                          View Details
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
