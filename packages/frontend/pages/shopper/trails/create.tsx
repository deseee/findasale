import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../../components/AuthContext';
import { useCreateTrail } from '../../../hooks/useTrails';
import { useToast } from '../../../components/ToastContext';

export default function CreateTrailPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const createMutation = useCreateTrail();

  // Redirect if not logged in
  React.useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      showToast('Trail name is required', 'error');
      return;
    }

    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        stops: [], // Empty trail, user will add stops after creation
      });
      showToast('Trail created successfully!', 'success');
      router.push('/shopper/trails');
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Failed to create trail';
      showToast(msg, 'error');
    }
  };

  if (authLoading) {
    return (
      <>
        <Head>
          <title>Create Trail | FindA.Sale</title>
        </Head>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-warm-200 dark:bg-gray-700 rounded w-1/3 mb-4" />
            <div className="h-32 bg-warm-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Create Trail | FindA.Sale</title>
        <meta name="description" content="Create a new treasure trail through your favorite sales" />
      </Head>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Link
            href="/shopper/trails"
            className="text-sage-600 dark:text-sage-400 hover:text-sage-700 dark:hover:text-sage-300 text-sm font-medium mb-4 inline-block"
          >
            ← Back to My Trails
          </Link>
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100">Create a Treasure Trail</h1>
          <p className="text-warm-600 dark:text-warm-400 mt-2">
            Plan a custom route through nearby sales to find your treasures
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <div className="space-y-6">
            {/* Trail Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-warm-900 dark:text-warm-100 mb-2">
                Trail Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., 'My First Trail'"
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sage-500 focus:border-transparent bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 placeholder-warm-500 dark:placeholder-warm-400"
                required
              />
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                Give your trail a memorable name so you can easily find it later
              </p>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-semibold text-warm-900 dark:text-warm-100 mb-2">
                Description (optional)
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., 'A route covering all the Saturday sales in the North End. Great for furniture and vintage finds.'"
                rows={4}
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sage-500 focus:border-transparent bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 placeholder-warm-500 dark:placeholder-warm-400"
              />
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                Add notes about what you're looking for or why this route works for you
              </p>
            </div>

            {/* Info Box */}
            <div className="bg-sage-50 dark:bg-sage-900/20 border border-sage-200 dark:border-sage-800 rounded-lg p-4">
              <p className="text-sm text-sage-900 dark:text-sage-100">
                <strong>Next step:</strong> After creating your trail, you'll be able to add sales and map out your route.
              </p>
            </div>

            {/* Form Actions */}
            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="flex-1 bg-sage-600 hover:bg-sage-700 dark:bg-sage-600 dark:hover:bg-sage-700 text-white font-semibold py-2 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Trail'}
              </button>
              <Link
                href="/shopper/trails"
                className="flex-1 bg-warm-200 dark:bg-gray-700 hover:bg-warm-300 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 font-semibold py-2 px-4 rounded-lg transition text-center"
              >
                Cancel
              </Link>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
