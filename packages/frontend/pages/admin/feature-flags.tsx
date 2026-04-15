import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

interface FeatureFlag {
  id: string;
  key: string;
  description: string;
  enabled: boolean;
  tierRestricted: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

interface FormErrors {
  key?: string;
  description?: string;
}

const SUGGESTED_FLAGS = [
  {
    key: 'ebay_push_enabled',
    description: 'Enable eBay listing push',
  },
  {
    key: 'ai_camera_enabled',
    description: 'Enable AI camera tagging',
  },
  {
    key: 'vision_api_enabled',
    description: 'Enable Google Vision API calls',
  },
  {
    key: 'hunt_pass_enabled',
    description: 'Enable Hunt Pass purchases',
  },
  {
    key: 'pwa_install_prompt_enabled',
    description: 'Show PWA install prompt',
  },
];

export default function AdminFeatureFlagsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingDescId, setEditingDescId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState('');

  // Form state for new flag
  const [newFlag, setNewFlag] = useState({
    key: '',
    description: '',
    enabled: true,
    tierRestricted: false,
  });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // Temp state for editing descriptions
  const [editDescriptions, setEditDescriptions] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!authLoading && (!user || !user.roles?.includes('ADMIN'))) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  const fetchFlags = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/feature-flags');
      setFlags(res.data);
      setError('');
    } catch (err) {
      console.error('Error fetching feature flags:', err);
      setError('Failed to load feature flags');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.roles?.includes('ADMIN')) {
      fetchFlags();
    }
  }, [user]);

  const validateKey = (key: string): boolean => {
    return /^[a-z_]+$/.test(key);
  };

  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    if (!newFlag.key.trim()) {
      errors.key = 'Flag key is required';
    } else if (!validateKey(newFlag.key)) {
      errors.key = 'Key must contain only lowercase letters and underscores';
    } else if (flags.some(f => f.key === newFlag.key)) {
      errors.key = 'A flag with this key already exists';
    }

    if (!newFlag.description.trim()) {
      errors.description = 'Description is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateFlag = async () => {
    if (!validateForm()) return;

    try {
      setSubmitting(true);
      const res = await api.post('/admin/feature-flags', {
        key: newFlag.key,
        description: newFlag.description,
        enabled: newFlag.enabled,
        tierRestricted: newFlag.tierRestricted,
      });
      setFlags([...flags, res.data]);
      setNewFlag({ key: '', description: '', enabled: true, tierRestricted: false });
      setFormErrors({});
      setShowNewForm(false);
      showToast('Feature flag created');
    } catch (err) {
      console.error('Error creating flag:', err);
      setError('Failed to create flag');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleFlag = async (flagId: string, currentEnabled: boolean) => {
    const oldFlags = [...flags];
    const flagIndex = flags.findIndex(f => f.id === flagId);
    if (flagIndex === -1) return;

    // Optimistic update
    const updatedFlags = [...flags];
    updatedFlags[flagIndex] = { ...updatedFlags[flagIndex], enabled: !currentEnabled };
    setFlags(updatedFlags);

    try {
      await api.patch(`/admin/feature-flags/${flagId}`, {
        enabled: !currentEnabled,
      });
      showToast('Flag updated');
    } catch (err) {
      console.error('Error updating flag:', err);
      setFlags(oldFlags);
      setError('Failed to update flag');
    }
  };

  const handleUpdateDescription = async (flagId: string) => {
    const newDesc = editDescriptions[flagId];
    if (!newDesc || !newDesc.trim()) {
      setEditingDescId(null);
      return;
    }

    const flagIndex = flags.findIndex(f => f.id === flagId);
    if (flagIndex === -1) return;

    const oldFlags = [...flags];

    // Optimistic update
    const updatedFlags = [...flags];
    updatedFlags[flagIndex] = { ...updatedFlags[flagIndex], description: newDesc };
    setFlags(updatedFlags);
    setEditingDescId(null);

    try {
      await api.patch(`/admin/feature-flags/${flagId}`, {
        description: newDesc,
      });
      showToast('Description updated');
    } catch (err) {
      console.error('Error updating description:', err);
      setFlags(oldFlags);
      setError('Failed to update description');
    }
  };

  const handleDeleteFlag = async (flagId: string) => {
    try {
      await api.delete(`/admin/feature-flags/${flagId}`);
      setFlags(flags.filter(f => f.id !== flagId));
      setDeleteConfirm(null);
      showToast('Flag deleted');
    } catch (err) {
      console.error('Error deleting flag:', err);
      setError('Failed to delete flag');
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  if (authLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-warm-600 dark:text-warm-400">Loading feature flags...</div>
      </div>
    );
  }

  if (!user || !user.roles?.includes('ADMIN')) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Feature Flags - FindA.Sale Admin</title>
        <meta name="description" content="Manage feature flags and control feature rollout" />
      </Head>

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">
              Feature Flags
            </h1>
            <p className="text-warm-600 dark:text-warm-400">
              Manage feature flags and control feature rollout
            </p>
          </div>
          <button
            onClick={() => setShowNewForm(true)}
            className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition disabled:opacity-50"
            disabled={showNewForm}
          >
            + New Flag
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 dark:text-red-300 dark:bg-red-900/20 dark:border-red-800 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Toast */}
        {toastMessage && (
          <div className="fixed bottom-4 right-4 bg-green-100 border border-green-400 text-green-700 dark:text-green-300 dark:bg-green-900/20 dark:border-green-800 px-4 py-3 rounded">
            {toastMessage}
          </div>
        )}

        {/* New Flag Form */}
        {showNewForm && (
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">Create New Flag</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-warm-900 dark:text-warm-100 mb-2">
                  Flag Key *
                </label>
                <input
                  type="text"
                  value={newFlag.key}
                  onChange={(e) => setNewFlag({ ...newFlag, key: e.target.value.toLowerCase() })}
                  placeholder="e.g. ebay_push_enabled"
                  className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-900 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600 font-mono text-sm"
                />
                {formErrors.key && <p className="text-red-600 text-xs mt-1">{formErrors.key}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-warm-900 dark:text-warm-100 mb-2">
                  Description *
                </label>
                <input
                  type="text"
                  value={newFlag.description}
                  onChange={(e) => setNewFlag({ ...newFlag, description: e.target.value })}
                  placeholder="e.g. Enable eBay listing push"
                  className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-900 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
                />
                {formErrors.description && <p className="text-red-600 text-xs mt-1">{formErrors.description}</p>}
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newFlag.enabled}
                    onChange={(e) => setNewFlag({ ...newFlag, enabled: e.target.checked })}
                    className="w-4 h-4 rounded border-warm-300 dark:border-gray-600 text-amber-600"
                  />
                  <span className="text-sm text-warm-900 dark:text-warm-100">Enabled</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newFlag.tierRestricted}
                    onChange={(e) => setNewFlag({ ...newFlag, tierRestricted: e.target.checked })}
                    className="w-4 h-4 rounded border-warm-300 dark:border-gray-600 text-amber-600"
                  />
                  <span className="text-sm text-warm-900 dark:text-warm-100">Tier Restricted (Paid Only)</span>
                </label>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => {
                    setShowNewForm(false);
                    setNewFlag({ key: '', description: '', enabled: true, tierRestricted: false });
                    setFormErrors({});
                  }}
                  className="px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-900 dark:text-warm-100 rounded-md text-warm-900 dark:text-warm-100 hover:bg-warm-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateFlag}
                  disabled={submitting}
                  className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Flag'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Suggested Flags Hint */}
        {flags.length === 0 && !showNewForm && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Suggested flags to start with:</h3>
            <ul className="space-y-1">
              {SUGGESTED_FLAGS.map(flag => (
                <li key={flag.key} className="text-sm text-blue-800 dark:text-blue-200">
                  <code className="font-mono">{flag.key}</code> — {flag.description}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Flags Table */}
        {flags.length > 0 ? (
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-warm-50 dark:bg-gray-900 border-b border-warm-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Flag Key</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Description</th>
                    <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">Status</th>
                    <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">Tier</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Last Updated</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">By</th>
                    <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                  {flags.map(flag => (
                    <tr key={flag.id} className="hover:bg-warm-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 text-sm font-mono text-warm-900 dark:text-warm-100">{flag.key}</td>
                      <td className="px-6 py-4 text-sm text-warm-900 dark:text-warm-100">
                        {editingDescId === flag.id ? (
                          <input
                            type="text"
                            autoFocus
                            value={editDescriptions[flag.id] || flag.description}
                            onChange={(e) => setEditDescriptions({ ...editDescriptions, [flag.id]: e.target.value })}
                            onBlur={() => handleUpdateDescription(flag.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleUpdateDescription(flag.id);
                              if (e.key === 'Escape') setEditingDescId(null);
                            }}
                            className="w-full px-2 py-1 border border-warm-300 dark:border-gray-600 dark:bg-gray-900 dark:text-warm-100 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-600"
                          />
                        ) : (
                          <span
                            onClick={() => {
                              setEditingDescId(flag.id);
                              setEditDescriptions({ ...editDescriptions, [flag.id]: flag.description });
                            }}
                            className="cursor-pointer hover:text-amber-600 dark:hover:text-amber-400"
                          >
                            {flag.description}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleToggleFlag(flag.id, flag.enabled)}
                          className={`inline-flex items-center gap-2 px-3 py-1 rounded text-sm font-medium transition ${
                            flag.enabled
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${flag.enabled ? 'bg-green-600' : 'bg-red-600'}`}></span>
                          {flag.enabled ? 'Enabled' : 'Disabled'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {flag.tierRestricted ? (
                          <span className="inline-block px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded text-xs font-medium">
                            Paid Only
                          </span>
                        ) : (
                          <span className="text-xs text-warm-500 dark:text-warm-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">
                        {new Date(flag.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">
                        {flag.updatedBy || '—'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => {
                              setEditingDescId(flag.id);
                              setEditDescriptions({ ...editDescriptions, [flag.id]: flag.description });
                            }}
                            className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(flag.id)}
                            className="text-xs text-red-600 dark:text-red-400 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-12 text-center">
            <p className="text-warm-600 dark:text-warm-400 mb-4">
              No feature flags configured. Add your first flag to enable kill-switch control over platform features.
            </p>
            <button
              onClick={() => setShowNewForm(true)}
              className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition"
            >
              + Create Flag
            </button>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm">
              <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-4">Delete Flag</h3>
              <p className="text-warm-600 dark:text-warm-400 mb-6">
                Are you sure you want to delete <code className="font-mono text-sm">{flags.find(f => f.id === deleteConfirm)?.key}</code>? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-900 dark:text-warm-100 rounded-md text-warm-900 dark:text-warm-100 hover:bg-warm-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const flagId = deleteConfirm;
                    setDeleteConfirm(null);
                    handleDeleteFlag(flagId);
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
