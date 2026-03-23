/**
 * Feature #45: Collector Passport Page
 *
 * Page: /shopper/collector-passport
 * - Display and edit collector identity (bio, specialties, categories, keywords)
 * - View items from recent sales matching the passport
 * - Notification settings toggle
 */

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useMyPassport, useUpdatePassport, useMyMatches, CollectorPassport } from '@/hooks/useCollectorPassport';
import { useAuth } from '@/components/AuthContext';

const CATEGORIES = [
  'Furniture',
  'Jewelry',
  'Art & Decor',
  'Clothing',
  'Kitchenware',
  'Tools',
  'Collectibles',
  'Electronics',
  'Books',
];

function CollectorPassportPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { passport, isLoading: passportLoading, refetch: refetchPassport } = useMyPassport();
  const { updatePassport, isUpdating } = useUpdatePassport();
  const { matches, totalMatches, isLoading: matchesLoading } = useMyMatches();

  // Form state
  const [bio, setBio] = useState('');
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyPush, setNotifyPush] = useState(true);
  const [newSpecialty, setNewSpecialty] = useState('');
  const [newKeyword, setNewKeyword] = useState('');

  // Initialize form from passport data
  useEffect(() => {
    if (passport) {
      setBio(passport.bio || '');
      setSpecialties(passport.specialties || []);
      setCategories(passport.categories || []);
      setKeywords(passport.keywords || []);
      setNotifyEmail(passport.notifyEmail);
      setNotifyPush(passport.notifyPush);
    }
  }, [passport]);

  // Redirect if not authenticated
  if (!authLoading && !user) {
    router.push('/login');
    return null;
  }

  if (authLoading || passportLoading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  const handleAddSpecialty = () => {
    if (newSpecialty.trim() && !specialties.includes(newSpecialty.trim())) {
      setSpecialties([...specialties, newSpecialty.trim()]);
      setNewSpecialty('');
    }
  };

  const handleRemoveSpecialty = (specialty: string) => {
    setSpecialties(specialties.filter((s) => s !== specialty));
  };

  const handleAddKeyword = () => {
    if (newKeyword.trim() && !keywords.includes(newKeyword.trim())) {
      setKeywords([...keywords, newKeyword.trim()]);
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setKeywords(keywords.filter((k) => k !== keyword));
  };

  const handleToggleCategory = (cat: string) => {
    if (categories.includes(cat)) {
      setCategories(categories.filter((c) => c !== cat));
    } else {
      setCategories([...categories, cat]);
    }
  };

  const handleSavePassport = async () => {
    try {
      updatePassport({
        bio: bio || null,
        specialties,
        categories,
        keywords,
        notifyEmail,
        notifyPush,
      });
    } catch (error) {
      console.error('Error saving passport:', error);
    }
  };

  return (
    <>
      <Head>
        <title>My Collector Passport - FindA.Sale</title>
      </Head>

      <div className="max-w-5xl mx-auto py-8 px-4">
          {/* Header */}
          <div className="mb-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">My Collector Passport 🏺</h1>
                {passport && (
                  <div className="bg-[#8fb897] text-white rounded-full px-4 py-2 font-semibold">
                    {passport.totalFinds} finds
                  </div>
                )}
              </div>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Define your collection identity and get notified when matching items appear
            </p>
          </div>

          {/* Section 1: Identity Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Your Collector Identity</h2>

            {/* Bio */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Collector Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="What drives your collection? e.g., 'Passionate collector of mid-century modern furniture'"
                className="w-full h-24 px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8fb897]"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Optional — visible on your public profile</p>
            </div>

            {/* Specialties */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Specialties
              </label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newSpecialty}
                  onChange={(e) => setNewSpecialty(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSpecialty();
                    }
                  }}
                  placeholder="e.g., mid-century modern"
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8fb897]"
                />
                <button
                  onClick={handleAddSpecialty}
                  className="px-4 py-2 bg-[#8fb897] text-white rounded-lg hover:bg-[#7ba680] font-medium"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {specialties.map((specialty) => (
                  <span
                    key={specialty}
                    className="inline-flex items-center gap-2 bg-[#f0f7f3] text-[#5a6f65] px-3 py-1 rounded-full text-sm"
                  >
                    {specialty}
                    <button
                      onClick={() => handleRemoveSpecialty(specialty)}
                      className="font-bold text-[#8fb897] hover:text-[#5a6f65]"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Categories */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Item Categories
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {CATEGORIES.map((cat) => (
                  <label key={cat} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={categories.includes(cat)}
                      onChange={() => handleToggleCategory(cat)}
                      className="w-4 h-4 text-[#8fb897] rounded focus:ring-[#8fb897]"
                    />
                    <span className="text-gray-700 dark:text-gray-300">{cat}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Keywords */}
            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Keywords
              </label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddKeyword();
                    }
                  }}
                  placeholder="e.g., eames, pyrex, walnut"
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8fb897]"
                />
                <button
                  onClick={handleAddKeyword}
                  className="px-4 py-2 bg-[#8fb897] text-white rounded-lg hover:bg-[#7ba680] font-medium"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="inline-flex items-center gap-2 bg-[#f0f7f3] text-[#5a6f65] px-3 py-1 rounded-full text-sm"
                  >
                    {keyword}
                    <button
                      onClick={() => handleRemoveKeyword(keyword)}
                      className="font-bold text-[#8fb897] hover:text-[#5a6f65]"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSavePassport}
              disabled={isUpdating}
              className="w-full md:w-auto px-8 py-3 bg-[#8fb897] text-white rounded-lg hover:bg-[#7ba680] font-medium disabled:opacity-50"
            >
              {isUpdating ? 'Saving...' : 'Save Passport'}
            </button>
          </div>

          {/* Section 2: My Matches */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
              {totalMatches > 0 ? `${totalMatches} Matching Items` : 'My Matches'}
            </h2>

            {matchesLoading ? (
              <p className="text-gray-600 dark:text-gray-400">Loading matches...</p>
            ) : totalMatches === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-600 dark:text-gray-400">
                  No matching items found yet. Set your specialties above to discover matching items.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {matches.map((item) => (
                  <Link
                    key={item.id}
                    href={`/sales/${item.sale.id}`}
                    className="group cursor-pointer rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow"
                  >
                    <div className="relative bg-gray-100 h-32 overflow-hidden">
                      {item.photoUrls[0] ? (
                        <img
                          src={item.photoUrls[0]}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          No image
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100 line-clamp-2 text-sm">
                        {item.title}
                      </h3>
                      {item.price && (
                        <p className="text-[#8fb897] font-bold mt-1">${item.price.toFixed(2)}</p>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{item.sale.title}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Notification Settings */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Notification Settings</h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Email Alerts</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Get notified via email when items match your collection</p>
                </div>
                <button
                  onClick={() => setNotifyEmail(!notifyEmail)}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                    notifyEmail ? 'bg-[#8fb897]' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white dark:bg-gray-800 transition-transform ${
                      notifyEmail ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Push Notifications</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Get push notifications when items match your collection</p>
                </div>
                <button
                  onClick={() => setNotifyPush(!notifyPush)}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                    notifyPush ? 'bg-[#8fb897]' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white dark:bg-gray-800 transition-transform ${
                      notifyPush ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
    </>
  );
}

export default CollectorPassportPage;
