/**
 * /shopper/crews - Crews Discovery & Creation
 * Shopper can browse public crews and create their own
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../../components/AuthContext';

const CrewsPage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [crewName, setCrewName] = useState('');
  const [crewDescription, setCrewDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreateCrew = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsCreating(true);

    try {
      const response = await fetch('/api/crews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          name: crewName,
          description: crewDescription,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Failed to create crew');
        setIsCreating(false);
        return;
      }

      const crew = await response.json();
      setShowCreateModal(false);
      setCrewName('');
      setCrewDescription('');
      router.push(`/shopper/crews/${crew.slug}`);
    } catch (err) {
      setError('An error occurred. Please try again.');
      setIsCreating(false);
    }
  };

  return (
    <>
      <Head>
        <title>Crews - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 py-12">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="text-6xl mb-4">👥</div>
            <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">
              Explorer's Crews
            </h1>
            <p className="text-lg text-warm-600 dark:text-warm-400 mb-8">
              Find collectors and join crews to discover together
            </p>

            {user && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
              >
                Create a Crew (500 XP)
              </button>
            )}
            {!user && !isLoading && (
              <button
                onClick={() => router.push('/login?redirect=/shopper/crews')}
                className="inline-block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
              >
                Sign In to Create
              </button>
            )}
          </div>

          {/* Create Modal */}
          {showCreateModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                <div className="p-6">
                  <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-4">
                    Create a Crew
                  </h2>

                  {error && (
                    <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100 rounded-md">
                      {error}
                    </div>
                  )}

                  <form onSubmit={handleCreateCrew} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-warm-900 dark:text-warm-100 mb-1">
                        Crew Name
                      </label>
                      <input
                        type="text"
                        value={crewName}
                        onChange={(e) => setCrewName(e.target.value)}
                        placeholder="e.g., Vintage Furniture Hunters"
                        maxLength={50}
                        required
                        className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                        {crewName.length}/50
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-warm-900 dark:text-warm-100 mb-1">
                        Description (optional)
                      </label>
                      <textarea
                        value={crewDescription}
                        onChange={(e) => setCrewDescription(e.target.value)}
                        placeholder="What's your crew about?"
                        maxLength={500}
                        rows={3}
                        className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                        {crewDescription.length}/500
                      </p>
                    </div>

                    <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
                      <p className="text-sm text-purple-900 dark:text-purple-100 font-medium">
                        💜 Cost: 500 XP
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setShowCreateModal(false)}
                        className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-700 text-warm-900 dark:text-warm-100 rounded-lg hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isCreating || !crewName.trim()}
                        className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isCreating ? 'Creating...' : 'Create'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          <div className="text-center text-warm-600 dark:text-warm-400 py-12">
            <p className="text-lg">Crews coming soon! Stay tuned for crew discovery.</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default CrewsPage;
