/**
 * Feature #40: Organizer Hub Dashboard
 * List and manage hubs created by the organizer
 */

import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useMyHubs, useDeleteHub } from '../../../hooks/useHubs';
import { useAuth } from '../../../components/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

export default function OrganizerHubsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useMyHubs();
  const deleteHubMutation = useDeleteHub('');

  if (!user?.role || !['ORGANIZER'].includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-6">You must be an organizer to manage hubs.</p>
          <Link href="/" className="text-sage-600 hover:text-sage-700 font-medium">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const handleDeleteHub = async (hubId: string) => {
    if (!confirm('Are you sure you want to delete this hub?')) return;

    try {
      const mutation = useDeleteHub(hubId);
      await mutation.mutateAsync();
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['hubs', 'my'] });
    } catch (err) {
      console.error('Error deleting hub:', err);
      alert('Failed to delete hub');
    }
  };

  return (
    <>
      <Head>
        <title>Manage Hubs - FindA.Sale</title>
        <meta name="description" content="Manage your sale hubs" />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-sage-50 to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-sage-900">Your Sale Hubs</h1>
              <p className="text-gray-600 mt-2">Create and manage coordinated sale hubs</p>
            </div>
            <Link
              href="/organizer/hubs/create"
              className="bg-sage-600 hover:bg-sage-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
            >
              + Create Hub
            </Link>
          </div>

          {/* Hubs List */}
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white rounded-lg shadow h-24 animate-pulse"></div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center text-red-600 py-12">
              <p>Error loading hubs: {error instanceof Error ? error.message : 'Unknown error'}</p>
            </div>
          ) : !data?.hubs.length ? (
            <div className="bg-white rounded-lg shadow-md p-12 text-center">
              <p className="text-gray-600 text-lg mb-4">You haven't created any hubs yet.</p>
              <Link
                href="/organizer/hubs/create"
                className="text-sage-600 hover:text-sage-700 font-medium"
              >
                Create your first hub →
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {data.hubs.map((hub) => (
                <div
                  key={hub.id}
                  className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-sage-900">{hub.name}</h3>
                      <p className="text-sm text-gray-600 mt-2">
                        {hub.saleCount} {hub.saleCount === 1 ? 'sale' : 'sales'}
                        {hub.saleDate && (
                          <> • Event: {new Date(hub.saleDate).toLocaleDateString()}</>
                        )}
                      </p>
                      {hub.eventName && (
                        <p className="text-sm text-sage-600 font-medium">🎉 {hub.eventName}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 ml-4">
                      <Link
                        href={`/organizer/hubs/${hub.id}/manage`}
                        className="px-4 py-2 bg-sage-50 text-sage-700 hover:bg-sage-100 rounded-lg text-sm font-medium transition-colors"
                      >
                        Manage
                      </Link>
                      <button
                        onClick={() => handleDeleteHub(hub.id)}
                        className="px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Hub Link */}
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <a
                      href={`/hubs/${hub.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-sage-600 hover:text-sage-700 font-medium"
                    >
                      View Public Hub →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
