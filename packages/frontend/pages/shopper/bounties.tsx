import React, { useState } from 'react';
import Head from 'next/head';
import { useAuth } from '../../components/AuthContext';
import { Target, MapPin, Clock, DollarSign } from 'lucide-react';
import api from '../../lib/api';
import { useToast } from '../../components/ToastContext';

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
    setFormData(prev => ({
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
    try {
      setSubmittingMatch(true);
      // For now, as organizer matching is from organizer side, we're submitting an interest
      // from the shopper side. This could be a simple match interest endpoint.
      // Using the submitBountySubmission endpoint which requires itemId
      // For MVP, organizers submit matches from their items, not shoppers submitting matches from bounties
      showToast('This feature requires you to be an organizer. Please list items in a sale to submit matches.', 'info');
      setExpandedBountyId(null);
    } catch (error) {
      console.error('Error submitting match:', error);
      showToast('Failed to submit match', 'error');
    } finally {
      setSubmittingMatch(false);
    }
  };

  return (
    <>
      <Head>
        <title>Bounty Board - FindA.Sale</title>
        <meta name="description" content="Request hard-to-find items from local organizers" />
      </Head>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Bounty Board
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Request hard-to-find items from local organizers
          </p>
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
