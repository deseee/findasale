/**
 * Feature #40: Create Hub Page
 * Form to create a new sale hub
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useCreateHub } from '../../../hooks/useHubs';
import { useAuth } from '../../../components/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export default function CreateHubPage() {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const createHubMutation = useCreateHub();

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    lat: 0,
    lng: 0,
    radiusKm: 5,
  });
  const [geoError, setGeoError] = useState('');

  // Get user location on mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData((prev) => ({
            ...prev,
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }));
        },
        (error) => {
          setGeoError('Unable to get your location. Please enter coordinates manually.');
          console.error('Geolocation error:', error);
        }
      );
    }
  }, []);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setFormData((prev) => ({
      ...prev,
      name,
      slug: generateSlug(name),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert('Please enter a hub name');
      return;
    }

    if (!formData.slug.trim()) {
      alert('Please enter a valid slug');
      return;
    }

    try {
      const result = await createHubMutation.mutateAsync(formData);
      queryClient.invalidateQueries({ queryKey: ['hubs', 'my'] });

      // Redirect to manage page
      await router.push(`/organizer/hubs/${result.hubId}/manage`);
    } catch (err) {
      console.error('Error creating hub:', err);
      alert(err instanceof Error ? err.message : 'Failed to create hub');
    }
  };

  if (!user?.role || !['ORGANIZER'].includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">You must be an organizer to create hubs.</p>
          <Link href="/" className="text-sage-600 hover:text-sage-700 font-medium">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Create Hub - FindA.Sale</title>
        <meta name="description" content="Create a new sale hub" />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-sage-50 to-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Navigation */}
          <Link href="/organizer/hubs" className="text-sage-600 hover:text-sage-700 font-medium mb-6 inline-block">
            ← Back to Hubs
          </Link>

          {/* Header */}
          <h1 className="text-3xl font-bold text-sage-900 mb-2">Create a New Hub</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Group your nearby sales into a discoverable hub for shoppers to find and plan their routes.
          </p>

          {/* Form */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Hub Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Hub Name *
                </label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={handleNameChange}
                  placeholder="e.g., Downtown Estate Sales Weekend"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-sage-500 focus:border-transparent"
                  required
                />
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">This is the public name shoppers will see</p>
              </div>

              {/* Slug */}
              <div>
                <label htmlFor="slug" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  URL Slug *
                </label>
                <input
                  id="slug"
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="downtown-estate-sales-weekend"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-sage-500 focus:border-transparent"
                  required
                />
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Auto-generated from name. Must be unique across all hubs.
                </p>
              </div>

              {/* Description */}
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Tell shoppers about this hub, the types of items, neighborhood, etc."
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-sage-500 focus:border-transparent"
                />
              </div>

              {/* Location */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Hub Location</h3>

                {geoError && (
                  <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg text-amber-800 text-sm">
                    {geoError}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label htmlFor="lat" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Latitude *
                    </label>
                    <input
                      id="lat"
                      type="number"
                      step="0.0001"
                      value={formData.lat}
                      onChange={(e) => setFormData({ ...formData, lat: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-sage-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="lng" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Longitude *
                    </label>
                    <input
                      id="lng"
                      type="number"
                      step="0.0001"
                      value={formData.lng}
                      onChange={(e) => setFormData({ ...formData, lng: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-sage-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  {formData.lat && formData.lng
                    ? `Hub center: ${formData.lat.toFixed(4)}, ${formData.lng.toFixed(4)}`
                    : 'Enter your hub center coordinates'}
                </p>
              </div>

              {/* Radius */}
              <div>
                <label htmlFor="radiusKm" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Search Radius (km) *
                </label>
                <input
                  id="radiusKm"
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={formData.radiusKm}
                  onChange={(e) => setFormData({ ...formData, radiusKm: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-sage-500 focus:border-transparent"
                  required
                />
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Shoppers will see all sales within {formData.radiusKm} km of the hub center
                </p>
              </div>

              {/* Submit */}
              <div className="flex gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="submit"
                  disabled={createHubMutation.isPending}
                  className="flex-1 bg-sage-600 hover:bg-sage-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors"
                >
                  {createHubMutation.isPending ? 'Creating Hub...' : 'Create Hub'}
                </button>
                <Link
                  href="/organizer/hubs"
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:text-gray-300 font-medium py-3 rounded-lg transition-colors text-center"
                >
                  Cancel
                </Link>
              </div>

              {createHubMutation.error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
                  {createHubMutation.error instanceof Error
                    ? createHubMutation.error.message
                    : 'Failed to create hub'}
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
