/**
 * User Profile Page
 *
 * Authenticated users can view and update their profile.
 * Different UI for shoppers vs. organizers.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import { useAuth } from '../components/AuthContext';
import { useToast } from '../components/ToastContext';
import Head from 'next/head';
import Link from 'next/link';

const ProfilePage = () => {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { showToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
  });
  const [isSaving, setIsSaving] = useState(false);

  if (!loading && !user) {
    router.push('/login');
    return null;
  }

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.patch('/auth/profile', formData);
      showToast('Profile updated', 'success');
      setIsEditing(false);
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to update profile', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <>
      <Head>
        <title>Profile - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-white">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-warm-900 mb-8">Profile</h1>

          <div className="card p-6">
            {!isEditing ? (
              <>
                <div className="mb-6">
                  <p className="text-sm text-warm-600">Name</p>
                  <p className="text-lg font-semibold text-warm-900">
                    {user?.firstName} {user?.lastName}
                  </p>
                </div>
                <div className="mb-6">
                  <p className="text-sm text-warm-600">Email</p>
                  <p className="text-lg font-semibold text-warm-900">{user?.email}</p>
                </div>
                <div className="mb-6">
                  <p className="text-sm text-warm-600">Account Type</p>
                  <p className="text-lg font-semibold text-warm-900 capitalize">{user?.role}</p>
                </div>
                <button
                  onClick={() => setIsEditing(true)}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg"
                >
                  Edit Profile
                </button>
              </>
            ) : (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-1">First Name</label>
                    <input
                      type="text"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-1">Last Name</label>
                    <input
                      type="text"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="flex-1 bg-warm-200 hover:bg-warm-300 text-warm-900 font-bold py-2 px-4 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ProfilePage;
