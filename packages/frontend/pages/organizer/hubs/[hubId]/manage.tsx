/**
 * Feature #40+#44: Hub Management Page
 * Edit hub details, set event date, and manage member sales
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useHubById, useUpdateHub, useSetHubEvent } from '../../../../hooks/useHubs';
import HubManagementNav from '../../../../components/HubManagementNav';
import { useAuth } from '../../../../components/AuthContext';
import { useToast } from '../../../../components/ToastContext';
import { useQueryClient } from '@tanstack/react-query';

export default function HubManagePage() {
  const router = useRouter();
  const { hubId } = router.query;
  const { user } = useAuth();
  const { showToast } = useToast();
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
  });

  const { data, isLoading } = useHubById(hubId as string, { enabled: !!hubId });
  const updateHubMutation = useUpdateHub(hubId as string);
  const setEventMutation = useSetHubEvent(hubId as string);

  // Populate form state from the real fetched hub once it loads (or changes, e.g.
  // after a save invalidates+refetches). Previously this page never fetched real
  // data at all -- formData stayed at its all-empty defaults forever, rendering
  // "N/A" for every hub (confirmed live in production, S-hubs-followup).
  useEffect(() => {
    if (!data?.hub) return;
    setFormData({
      name: data.hub.name || '',
      description: data.hub.description || '',
      lat: data.hub.lat ?? 0,
      lng: data.hub.lng ?? 0,
    });
    if (data.hub.saleDate) {
      setEventDate(new Date(data.hub.saleDate).toISOString().slice(0, 16));
    }
    if (data.hub.eventName) {
      setEventName(data.hub.eventName);
    }
  }, [data]);

  const handleSaveHub = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateHubMutation.mutateAsync(formData);
      queryClient.invalidateQueries({ queryKey: ['hubs', 'my'] });
      queryClient.invalidateQueries({ queryKey: ['hubs', 'byId', hubId] });
      setEditMode(false);
      showToast('Hub updated successfully', 'success');
    } catch (err) {
      showToast('Failed to update hub', 'error');
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
      queryClient.invalidateQueries({ queryKey: ['hubs', 'byId', hubId] });
      setShowEventForm(false);
      showToast('Event date set successfully', 'success');
    } catch (err) {
      showToast('Failed to set event date', 'error');
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

      <div className="min-h-screen bg-gradient-to-b from-sage-50 to-white dark:from-gray-900 dark:to-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Navigation */}
          <Link href="/organizer/hubs" className="text-sage-600 hover:text-sage-700 font-medium mb-6 inline-block">
            ← Back to Hubs
          </Link>

          {hubId && <HubManagementNav hubId={hubId as string} />}

          <h1 className="text-3xl font-bold text-warm-900 dark:text-gray-100 mb-8">Manage Hub</h1>

          {/* deleteHub is a soft close (isActive: false) and this page still loads a closed
              hub perfectly happily, so say so up front rather than letting somebody edit a
              market shoppers can no longer see. */}
          {data?.hub?.isActive === false && (
            <div
              role="status"
              className="mb-8 p-4 rounded-lg border-2 border-warm-400 bg-warm-100 dark:bg-gray-800 dark:border-gray-500"
            >
              <p className="text-base font-bold text-warm-900 dark:text-gray-100">
                This market is closed.
              </p>
              <p className="mt-1 text-base text-warm-800 dark:text-gray-300">
                It is off the public site. Shoppers cannot find it. Your records are kept, and
                you can reopen it whenever you want.
              </p>
              <Link
                href="/organizer/hubs"
                className="mt-3 inline-flex items-center justify-center min-h-[48px] px-5 py-3 text-base font-semibold rounded-lg bg-sage-700 hover:bg-sage-600 text-white"
              >
                Go to my markets to reopen it
              </Link>
            </div>
          )}

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
                  <p className="text-sm text-gray-600 dark:text-gray-400">Location</p>
                  <p className="text-gray-700 dark:text-gray-300">
                    {formData.lat}, {formData.lng}
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

          {/* Close this market.
              The confirmation step itself lives on /organizer/hubs so there is exactly one
              copy of it. This section states the same facts and hands the organizer over
              with ?close=<hubId>, which opens the confirmation for this market on arrival.
              The counts come from hubController.getMyHub and are the SAME four numbers
              deleteHub refuses on, so this never offers a button the server then rejects. */}
          {data?.hub && data.hub.isActive !== false && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
              <h2 className="text-xl font-bold text-warm-900 dark:text-gray-100 mb-4">
                Close this market
              </h2>

              {data.hub.canClose === false ? (
                <>
                  <p className="text-base text-warm-800 dark:text-gray-200">
                    You cannot close this market yet. Vendors are still counting on it:
                  </p>
                  <ul className="mt-3 list-disc pl-5 space-y-2 text-base font-medium text-warm-800 dark:text-gray-200">
                    {(data.hub.confirmedBoothCount ?? 0) > 0 && (
                      <li>{data.hub.confirmedBoothCount} confirmed vendor booths can still sell here.</li>
                    )}
                    {(data.hub.awaitingConfirmationCount ?? 0) > 0 && (
                      <li>
                        {data.hub.awaitingConfirmationCount} vendors claimed a booth and are waiting
                        for your answer.
                      </li>
                    )}
                    {(data.hub.openCartCount ?? 0) > 0 && (
                      <li>{data.hub.openCartCount} register sales are still open.</li>
                    )}
                    {(data.hub.unfinishedPayoutCount ?? 0) > 0 && (
                      <li>{data.hub.unfinishedPayoutCount} vendor payouts have not finished.</li>
                    )}
                  </ul>
                  <p className="mt-3 text-base text-warm-800 dark:text-gray-200">
                    Sort those out first. Closing now would pull the market out from under a vendor
                    who is still trading in it.
                  </p>
                  <Link
                    href={`/organizer/hubs/${hubId}/vendor-booths`}
                    className="mt-4 inline-flex items-center justify-center min-h-[48px] w-full sm:w-auto px-5 py-3 text-base font-semibold rounded-lg bg-amber-700 hover:bg-amber-800 text-white"
                  >
                    Go to the vendor booths
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-base text-warm-800 dark:text-gray-200">
                    This takes the market off FindA.Sale. Shoppers will not find it any more.
                  </p>
                  <p className="mt-2 text-base text-warm-800 dark:text-gray-200">
                    Nothing is erased. Your sales, payouts and receipts are kept, and you can reopen
                    the market whenever you want.
                  </p>
                  <Link
                    href={`/organizer/hubs?close=${hubId}`}
                    className="mt-4 inline-flex items-center justify-center min-h-[48px] w-full sm:w-auto px-5 py-3 text-base font-semibold rounded-lg border-2 border-warm-400 dark:border-gray-500 bg-white dark:bg-gray-700 text-warm-900 dark:text-gray-100 hover:bg-warm-100 dark:hover:bg-gray-600"
                  >
                    Close this market
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
