// S360 cache-bust 2026-03-31
import React, { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useMyTrails, useUpdateTrail, useDeleteTrail } from '../../../hooks/useTrails';
import EmptyState from '../../../components/EmptyState';
import Skeleton from '../../../components/Skeleton';

export default function TrailDetailPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { trailId } = router.query;
  const [trail, setTrail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const updateMutation = useUpdateTrail();
  const deleteMutation = useDeleteTrail();

  React.useEffect(() => {
    if (!trailId) return;

    const loadTrail = async () => {
      try {
        const { data } = await api.get(`/trails`);
        const found = data.trails.find((t: any) => t.id === trailId);
        if (found) {
          setTrail(found);
          setEditName(found.name);
          setEditDescription(found.description || '');
        }
      } catch (error) {
        console.error('Failed to load trail:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTrail();
  }, [trailId]);

  const handleSave = async () => {
    if (!trail) return;

    try {
      const updated = await updateMutation.mutateAsync({
        trailId: trail.id,
        name: editName,
        description: editDescription,
      });

      setTrail(updated);
      setEditMode(false);
    } catch (error) {
      console.error('Failed to save trail:', error);
    }
  };

  const handleDelete = async () => {
    if (!trail || !confirm('Delete this trail?')) return;

    await deleteMutation.mutateAsync(trail.id);
    router.push('/shopper/trails');
  };

  if (loading) {
    return (
      <>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Skeleton className="h-12 mb-6" />
          <Skeleton className="h-32" />
        </div>
      </>
    );
  }

  if (!trail) {
    return (
      <>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <EmptyState heading="Trail Not Found" />
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{trail.name} | My Trails | FindA.Sale</title>
      </Head>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {editMode ? (
          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
            <h1 className="text-2xl font-bold mb-6 text-slate-900 dark:text-white">Edit Trail</h1>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Trail Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Description
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="flex-1 px-4 py-2 bg-sage-600 dark:bg-sage-500 text-white rounded-lg hover:bg-sage-700 dark:hover:bg-sage-600 disabled:opacity-50 font-semibold transition"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => setEditMode(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 font-semibold transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{trail.name}</h1>
                {trail.description && (
                  <p className="text-slate-600 dark:text-slate-400 mt-2">{trail.description}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditMode(true)}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 font-semibold transition"
                >
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2 bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 disabled:opacity-50 font-semibold transition"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
              <div>
                <p className="text-xs text-slate-600 dark:text-slate-400">Stops</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{trail.stops?.length || 0}</p>
              </div>
              {trail.totalDistanceKm && (
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Distance</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {trail.totalDistanceKm.toFixed(1)} km
                  </p>
                </div>
              )}
              {trail.totalDurationMin && (
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Est. Time</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {Math.round(trail.totalDurationMin)} min
                  </p>
                </div>
              )}
            </div>

            {trail.isCompleted && (
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 mb-6">
                <p className="text-green-900 dark:text-green-100 font-semibold">
                  ✓ Trail Completed!
                </p>
                {trail.completedAt && (
                  <p className="text-sm text-green-800 dark:text-green-200 mt-1">
                    Completed on {new Date(trail.completedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}

            {trail.isPublic && trail.shareToken && (
              <div className="p-4 rounded-lg bg-sage-50 dark:bg-sage-900 border border-sage-200 dark:border-sage-700">
                <p className="text-sm text-sage-900 dark:text-sage-100 mb-2">
                  🔗 <strong>Public Link:</strong>
                </p>
                <code className="text-xs bg-white dark:bg-slate-800 p-2 rounded block mb-2">
                  {`${typeof window !== 'undefined' ? window.location.origin : ''}/trail/${trail.shareToken}`}
                </code>
                <button
                  onClick={() => {
                    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/trail/${trail.shareToken}`;
                    navigator.clipboard.writeText(url);
                  }}
                  className="text-xs text-sage-600 dark:text-sage-400 hover:underline"
                >
                  Copy link
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
