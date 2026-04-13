/**
 * Feature #40+#44: Hub Management Page
 * Edit hub details, set event date, and manage member sales
 */

import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useHub, useUpdateHub, useSetHubEvent, useJoinHub, useLeaveHub } from '../../../../hooks/useHubs';
import { useAuth } from '../../../../components/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

export default function HubManagePage() {
  const router = useRouter();
  const { hubId } = router.query;
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [editMode, setEditMode] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventDate, setEventDate] = useState('');
  const [eventName, setEventName] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    lat: 0,
    lng: 0,
    radiusKm: 5,
  });

  const { data, isLoading } = useHub('', { enabled: false }); // We'll use a different approach for fetching
  const updateHubMutation = useUpdateHub(hubId as string);
  const setEventMutation = useSetHubEvent(hubId as string);

  // For now, simplified version without full hub detail fetch
  // In production, you'd fetch the full hub data and populate forms

  const handleSaveHub = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateHubMutation.mutateAsync(formData);
      queryClient.invalidateQueries({ queryKey: ['hubs', 'my'] });
      setEditMode(false);
    } catch (err) {
      alert('Failed to update hub');
    }
  };

  const handleSetEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setEventMutation.mutateAsync({
        saleDate: eventDate,
        eventName: eventName,
      });
      queryClient.invalidateQueries({ queryKey: ['hubs', 'my'] });
      setShowEventForm(false);
    } catch (err) {
      alert('Failed to set event date');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-sage-50 flex items-center justify-center">
        <div className="animate-pulse">Loading hub...</div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Manage Hub - FindA.Sale</title>
        <meta name="description" content="Manage your sale hub" />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-sage-50 to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Navigation */}
          <Link href="/organizer/hubs" className="text-sage-600 hover:text-sage-700 font-medium mb-6 inline-block">
            ← Back to Hubs
          </Link>

          <h1 className="text-3xl font-bold text-sage-900 mb-8">Manage Hub</h1>

          {/* Hub Details Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-sage-900">Hub Details</h2>
              <button
                onClick={() => setEditMode(!editMode)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  editMode
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100'
                    : 'bg-sage-50 text-sage-700 hover:bg-sage-100'
                }`}
              >
                {editMode ? 'Cancel' : 'Edit'}
              </button>
            </div>

            {editMode ? (
              <form onSubmit={handleSaveHub} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Hub Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-sage-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-sage-500 focus:border-transparent"
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Latitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={formData.lat}
                      onChange={(e) => setFormData({ ...formData, lat: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Longitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={formData.lng}
                      onChange={(e) => setFormData({ ...formData, lng: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Radius (km)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={formData.radiusKm}
                    onChange={(e) => setFormData({ ...formData, radiusKm: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-sage-600 hover:bg-sage-700 text-white font-medium py-2 rounded-lg transition-colors"
                  disabled={updateHubMutation.isPending}
                >
                  {updateHubMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Hub Name</p>
                  <p className="text-lg font-semibold text-sage-900">{formData.name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Description</p>
                  <p className="text-gray-700 dark:text-gray-300">{formData.description || 'No description'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Location & Radius</p>
                  <p className="text-gray-700 dark:text-gray-300">
                    {formData.lat}, {formData.lng} • {formData.radiusKm} km radius
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Neighborhood Sale Day Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-sage-900">🎉 Neighborhood Sale Day</h2>
              <button
                onClick={() => setShowEventForm(!showEventForm)}
                className="px-4 py-2 bg-sage-50 text-sage-700 hover:bg-sage-100 rounded-lg text-sm font-medium transition-colors"
              >
                {showEventForm ? 'Cancel' : 'Set Event Date'}
              </button>
            </div>

            {showEventForm ? (
              <form onSubmit={handleSetEvent} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Event Name</label>
                  <input
                    type="text"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    placeholder="e.g., Spring Cleanup Sale Weekend"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-sage-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Event Date</label>
                  <input
                    type="datetime-local"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-sage-500 focus:border-transparent"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-sage-600 hover:bg-sage-700 text-white font-medium py-2 rounded-lg transition-colors"
                  disabled={setEventMutation.isPending}
                >
                  {setEventMutation.isPending ? 'Saving...' : 'Set Event Date'}
                </button>
              </form>
            ) : (
              <div>
                <p className="text-gray-700 dark:text-gray-300">
                  {eventDate ? (
                    <>
                      📅 {new Date(eventDate).toLocaleDateString()} {eventName && `- ${eventName}`}
                    </>
                  ) : (
                    'No event date set yet'
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Member Sales Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
            <h2 className="text-xl font-bold text-sage-900 mb-6">Member Sales</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Sales management coming soon. You can add/remove your sales to this hub from the hub creation page.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
