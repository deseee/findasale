/**
 * Organizer Trail Builder Page
 *
 * Organizers create and manage Treasure Trails for their sales.
 * Includes trail creation form, stop builder with nearby search,
 * reordering, and publish workflow.
 */

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import Layout from '../../../components/Layout';
import Skeleton from '../../../components/Skeleton';
import Link from 'next/link';

interface TrailStop {
  id: string;
  stopName: string;
  stopType: string;
  address: string;
  latitude: number;
  longitude: number;
  baseXp: number;
  order: number;
}

interface Trail {
  id: string;
  saleId: string;
  name: string;
  description?: string;
  stops: TrailStop[];
  isPublic: boolean;
  minStopsRequired: number;
}

interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  type: string;
}

const STOP_TYPE_OPTIONS = [
  { value: 'SALE', label: 'FindA.Sale', xp: 5 },
  { value: 'RESALE_SHOP', label: 'Resale Shop', xp: 3 },
  { value: 'CAFE', label: 'Cafe', xp: 2 },
  { value: 'LANDMARK', label: 'Landmark', xp: 2 },
  { value: 'PARTNER', label: 'Partner', xp: 4 },
];

export default function TrailBuilderPage() {
  const router = useRouter();
  const { saleId } = router.query;
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [isClient, setIsClient] = useState(false);
  const [trailName, setTrailName] = useState('');
  const [trailDescription, setTrailDescription] = useState('');
  const [existingTrails, setExistingTrails] = useState<Trail[]>([]);
  const [createdTrailId, setCreatedTrailId] = useState<string | null>(null);
  const [selectedTrailId, setSelectedTrailId] = useState<string | null>(null);
  const [stops, setStops] = useState<TrailStop[]>([]);

  // Stop builder state
  const [showStopBuilder, setShowStopBuilder] = useState(false);
  const [stopBuilderMode, setStopBuilderMode] = useState<'search' | 'manual' | null>(null);
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [searchingLocation, setSearchingLocation] = useState(false);

  // Manual stop form
  const [manualStopName, setManualStopName] = useState('');
  const [manualStopType, setManualStopType] = useState('SALE');
  const [manualStopAddress, setManualStopAddress] = useState('');
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');

  // Hydration guard
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Create trail mutation
  const createTrailMutation = useMutation({
    mutationFn: async () => {
      if (!trailName.trim()) {
        throw new Error('Trail name is required');
      }
      const res = await api.post('/trails', {
        saleId,
        name: trailName.trim(),
        description: trailDescription.trim() || undefined,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setCreatedTrailId(data.id);
      setSelectedTrailId(data.id);
      setStops([]);
      showToast('Trail created!', 'success');
      setShowStopBuilder(true);
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Failed to create trail';
      showToast(message, 'error');
    },
  });

  // Add stop mutation
  const addStopMutation = useMutation({
    mutationFn: async (stopData: {
      stopType: string;
      stopName: string;
      address: string;
      latitude: number;
      longitude: number;
      baseXp?: number;
    }) => {
      const res = await api.post(`/trails/${selectedTrailId}/stops`, stopData);
      return res.data;
    },
    onSuccess: (data) => {
      setStops([...stops, data]);
      showToast(`${data.stopName} added!`, 'success');
      setStopBuilderMode(null);
      resetManualForm();
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Failed to add stop';
      showToast(message, 'error');
    },
  });

  // Search nearby places
  const searchNearby = async () => {
    setSearchingLocation(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 10000,
          enableHighAccuracy: true,
        });
      });

      const res = await api.get(`/trails/${selectedTrailId}/search-nearby`, {
        params: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          radius: 500,
        },
      });

      setSearchResults(res.data.places || []);
      setStopBuilderMode('search');
    } catch (error: any) {
      showToast('Could not get your location', 'error');
    } finally {
      setSearchingLocation(false);
    }
  };

  // Publish trail
  const publishMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put(`/trails/${selectedTrailId}`, {
        isPublic: true,
      });
      return res.data;
    },
    onSuccess: () => {
      showToast(
        'Trail is live! Shoppers can now find and complete your trail.',
        'success'
      );
      // Reload trails list
      loadTrails();
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Failed to publish trail';
      showToast(message, 'error');
    },
  });

  const resetManualForm = () => {
    setManualStopName('');
    setManualStopType('SALE');
    setManualStopAddress('');
    setManualLat('');
    setManualLng('');
  };

  const loadTrails = async () => {
    try {
      const res = await api.get(`/sales/${saleId}/trails`);
      setExistingTrails(res.data.trails || []);
    } catch (error) {
      console.error('Failed to load trails:', error);
    }
  };

  // Load trails on mount
  useEffect(() => {
    if (saleId && isClient) {
      loadTrails();
    }
  }, [saleId, isClient]);

  if (!isClient) {
    return null;
  }

  const currentTrail = selectedTrailId
    ? existingTrails.find((t) => t.id === selectedTrailId)
    : null;

  const canPublish =
    stops.length >= (currentTrail?.minStopsRequired || 3) && !currentTrail?.isPublic;

  return (
    <Layout>
      <Head>
        <title>Trail Builder | FindA.Sale Organizer</title>
      </Head>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-8">
          Treasure Trail Builder
        </h1>

        {/* Create new trail section */}
        {!selectedTrailId && (
          <div className="mb-8 p-6 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg">
            <h2 className="text-xl font-bold text-blue-900 dark:text-blue-100 mb-4">
              Create New Trail
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-warm-700 dark:text-warm-300 mb-2">
                  Trail Name *
                </label>
                <input
                  type="text"
                  value={trailName}
                  onChange={(e) => setTrailName(e.target.value)}
                  placeholder="e.g., Downtown Vintage & Coffee"
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-warm-700 dark:text-warm-300 mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={trailDescription}
                  onChange={(e) => setTrailDescription(e.target.value)}
                  placeholder="Describe your trail experience..."
                  maxLength={500}
                  rows={3}
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 resize-none"
                />
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                  {trailDescription.length}/500 characters
                </p>
              </div>

              <button
                onClick={() => createTrailMutation.mutate()}
                disabled={createTrailMutation.isPending || !trailName.trim()}
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-700 text-white font-bold rounded-lg transition disabled:cursor-not-allowed"
              >
                {createTrailMutation.isPending ? 'Creating...' : 'Create Trail'}
              </button>
            </div>
          </div>
        )}

        {/* Existing trails list */}
        {existingTrails.length > 0 && !selectedTrailId && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">
              Your Trails
            </h2>
            <div className="space-y-3">
              {existingTrails.map((trail) => (
                <div
                  key={trail.id}
                  className="p-4 border border-warm-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-bold text-warm-900 dark:text-warm-100">
                        {trail.name}
                      </h3>
                      {trail.description && (
                        <p className="text-sm text-warm-600 dark:text-warm-400 mt-1">
                          {trail.description}
                        </p>
                      )}
                      <p className="text-sm text-warm-600 dark:text-warm-400 mt-2">
                        {trail.stops.length} stops
                        {trail.isPublic && ' • 🔗 Published'}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedTrailId(trail.id);
                        setStops(trail.stops);
                      }}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stop builder UI (shown when trail is selected) */}
        {selectedTrailId && (
          <div className="space-y-8">
            {/* Back button */}
            <button
              onClick={() => {
                setSelectedTrailId(null);
                setStops([]);
              }}
              className="text-amber-600 hover:text-amber-700 font-semibold"
            >
              ← Back
            </button>

            {/* Stops list */}
            <div>
              <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">
                Stops ({stops.length}/{currentTrail?.minStopsRequired || 3} required)
              </h2>

              {stops.length === 0 ? (
                <p className="text-warm-600 dark:text-warm-400 mb-6">
                  No stops added yet. Add at least 3 stops to publish this trail.
                </p>
              ) : (
                <div className="space-y-3 mb-6">
                  {stops.map((stop, idx) => (
                    <div
                      key={stop.id}
                      className="p-4 border border-warm-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-bold text-warm-900 dark:text-warm-100">
                            {idx + 1}. {stop.stopName}
                          </p>
                          <p className="text-sm text-warm-600 dark:text-warm-400">
                            {stop.address}
                          </p>
                          <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                            {stop.stopType} • +{stop.baseXp} XP
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {idx > 0 && (
                            <button
                              onClick={() => {
                                const newStops = [...stops];
                                [newStops[idx], newStops[idx - 1]] = [
                                  newStops[idx - 1],
                                  newStops[idx],
                                ];
                                setStops(newStops);
                              }}
                              className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm"
                            >
                              ↑
                            </button>
                          )}
                          {idx < stops.length - 1 && (
                            <button
                              onClick={() => {
                                const newStops = [...stops];
                                [newStops[idx], newStops[idx + 1]] = [
                                  newStops[idx + 1],
                                  newStops[idx],
                                ];
                                setStops(newStops);
                              }}
                              className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm"
                            >
                              ↓
                            </button>
                          )}
                          <button
                            onClick={() =>
                              setStops(stops.filter((_, i) => i !== idx))
                            }
                            className="px-3 py-1 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-100 rounded text-sm"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Stop builder */}
            {!showStopBuilder ? (
              <button
                onClick={() => setShowStopBuilder(true)}
                className="w-full px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition"
              >
                + Add Stop
              </button>
            ) : (
              <div className="p-6 border border-warm-200 dark:border-gray-700 rounded-lg bg-warm-50 dark:bg-gray-800">
                {!stopBuilderMode ? (
                  <div className="space-y-3">
                    <button
                      onClick={searchNearby}
                      disabled={searchingLocation}
                      className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition"
                    >
                      {searchingLocation ? 'Getting location...' : '🔍 Search Nearby Places'}
                    </button>
                    <button
                      onClick={() => setStopBuilderMode('manual')}
                      className="w-full px-4 py-3 bg-gray-400 dark:bg-gray-600 hover:bg-gray-500 dark:hover:bg-gray-700 text-white font-semibold rounded-lg transition"
                    >
                      Add Manually
                    </button>
                    <button
                      onClick={() => setShowStopBuilder(false)}
                      className="w-full px-4 py-3 border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 font-semibold rounded-lg hover:bg-warm-100 dark:hover:bg-gray-700 transition"
                    >
                      Cancel
                    </button>
                  </div>
                ) : stopBuilderMode === 'search' && searchResults.length > 0 ? (
                  <div>
                    <h3 className="font-bold text-warm-900 dark:text-warm-100 mb-4">
                      Nearby Places
                    </h3>
                    <div className="space-y-3 max-h-96 overflow-y-auto mb-4">
                      {searchResults.map((place) => (
                        <div
                          key={place.placeId}
                          className="p-3 bg-white dark:bg-gray-700 border border-warm-200 dark:border-gray-600 rounded-lg"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <p className="font-semibold text-warm-900 dark:text-warm-100">
                                {place.name}
                              </p>
                              <p className="text-sm text-warm-600 dark:text-warm-400">
                                {place.address}
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                addStopMutation.mutate({
                                  stopType: 'LANDMARK',
                                  stopName: place.name,
                                  address: place.address,
                                  latitude: place.latitude,
                                  longitude: place.longitude,
                                  baseXp: 2,
                                });
                              }}
                              disabled={addStopMutation.isPending}
                              className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm font-semibold rounded"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setStopBuilderMode(null)}
                      className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 font-semibold rounded-lg hover:bg-warm-100 dark:hover:bg-gray-700 transition"
                    >
                      Back
                    </button>
                  </div>
                ) : stopBuilderMode === 'manual' ? (
                  <div className="space-y-3">
                    <h3 className="font-bold text-warm-900 dark:text-warm-100">
                      Add Stop Manually
                    </h3>

                    <div>
                      <label className="block text-sm font-semibold text-warm-700 dark:text-warm-300 mb-1">
                        Stop Name *
                      </label>
                      <input
                        type="text"
                        value={manualStopName}
                        onChange={(e) => setManualStopName(e.target.value)}
                        placeholder="e.g., Vintage Furniture Warehouse"
                        className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-warm-700 dark:text-warm-300 mb-1">
                        Stop Type *
                      </label>
                      <select
                        value={manualStopType}
                        onChange={(e) => setManualStopType(e.target.value)}
                        className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100"
                      >
                        {STOP_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label} (+{opt.xp} XP)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-warm-700 dark:text-warm-300 mb-1">
                        Address *
                      </label>
                      <input
                        type="text"
                        value={manualStopAddress}
                        onChange={(e) => setManualStopAddress(e.target.value)}
                        placeholder="Street address"
                        className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-semibold text-warm-700 dark:text-warm-300 mb-1">
                          Latitude *
                        </label>
                        <input
                          type="number"
                          step="0.000001"
                          value={manualLat}
                          onChange={(e) => setManualLat(e.target.value)}
                          placeholder="40.7128"
                          className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-warm-700 dark:text-warm-300 mb-1">
                          Longitude *
                        </label>
                        <input
                          type="number"
                          step="0.000001"
                          value={manualLng}
                          onChange={(e) => setManualLng(e.target.value)}
                          placeholder="-74.0060"
                          className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const typeOpt = STOP_TYPE_OPTIONS.find(
                            (opt) => opt.value === manualStopType
                          );
                          addStopMutation.mutate({
                            stopType: manualStopType,
                            stopName: manualStopName,
                            address: manualStopAddress,
                            latitude: parseFloat(manualLat),
                            longitude: parseFloat(manualLng),
                            baseXp: typeOpt?.xp,
                          });
                        }}
                        disabled={
                          addStopMutation.isPending ||
                          !manualStopName ||
                          !manualStopAddress ||
                          !manualLat ||
                          !manualLng
                        }
                        className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded transition"
                      >
                        Add Stop
                      </button>
                      <button
                        onClick={() => {
                          setStopBuilderMode(null);
                          resetManualForm();
                        }}
                        className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 font-semibold rounded transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Publish button */}
            {canPublish && (
              <button
                onClick={() => publishMutation.mutate()}
                disabled={publishMutation.isPending}
                className="w-full px-6 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:bg-gray-400 text-white font-bold rounded-lg transition text-lg"
              >
                {publishMutation.isPending ? 'Publishing...' : '🚀 Publish Trail'}
              </button>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
