import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { usePendingModerationPhotos, useModeratePhoto } from '../../hooks/useUGCPhotos';

export default function UGCModerationPage() {
  const { data: photos = [], isLoading, error } = usePendingModerationPhotos();
  const moderateMutation = useModeratePhoto();
  const [actionPhotoId, setActionPhotoId] = useState<number | null>(null);

  const handleApprove = async (photoId: number) => {
    try {
      await moderateMutation.mutateAsync({
        photoId,
        status: 'APPROVED',
      });
      setActionPhotoId(null);
    } catch (err) {
      alert('Failed to approve photo');
      console.error(err);
    }
  };

  const handleReject = async (photoId: number) => {
    try {
      await moderateMutation.mutateAsync({
        photoId,
        status: 'REJECTED',
      });
      setActionPhotoId(null);
    } catch (err) {
      alert('Failed to reject photo');
      console.error(err);
    }
  };

  return (
    <>
      <Head>
        <title>UGC Photo Moderation - FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Link href="/organizer" className="text-blue-600 hover:text-blue-700">
                    Dashboard
                  </Link>
                  <span className="text-gray-400">/</span>
                  <span className="text-gray-700 dark:text-gray-300">UGC Photo Moderation</span>
                </div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  UGC Photo Moderation
                </h1>
              </div>

              {/* Pending Count Badge */}
              {photos.length > 0 && (
                <div
                  className="px-4 py-2 rounded-full text-white font-semibold text-lg"
                  style={{ backgroundColor: '#8FB897' }}
                >
                  {photos.length} Pending
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Loading State */}
          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-gray-200 rounded-lg h-96 animate-pulse" />
              ))}
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
              <p className="font-medium">Error loading photos</p>
              <p className="text-sm mt-1">Please try again later.</p>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && photos.length === 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
              <div className="text-6xl mb-4">✨</div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                No photos pending review
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                All submitted photos have been moderated. Check back later for new submissions.
              </p>
            </div>
          )}

          {/* Photo Grid */}
          {!isLoading && !error && photos.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
                >
                  {/* Photo Image */}
                  <div className="relative w-full h-48 bg-gray-200 overflow-hidden">
                    <img
                      src={photo.photoUrl}
                      alt="Submitted photo"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Content */}
                  <div className="p-4 space-y-3">
                    {/* Submitter Info */}
                    <div className="border-b border-gray-200 dark:border-gray-700 pb-3">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-medium">Submitted by:</span>{' '}
                        {photo.user?.name || 'Anonymous'}
                      </p>
                    </div>

                    {/* Caption */}
                    {photo.caption && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
                          Caption
                        </p>
                        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                          {photo.caption}
                        </p>
                      </div>
                    )}

                    {/* Tags */}
                    {photo.tags && photo.tags.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                          Tags
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {photo.tags.map((tag, idx) => (
                            <span
                              key={idx}
                              className="inline-block bg-emerald-100 text-emerald-700 text-xs px-2 py-1 rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sale/Item Context */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                      {photo.sale && (
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          <span className="font-medium">Sale:</span> {photo.sale.title}
                        </p>
                      )}
                      {photo.item && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          <span className="font-medium">Item:</span> {photo.item.title}
                        </p>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-3">
                      <button
                        onClick={() => handleReject(photo.id)}
                        disabled={moderateMutation.isPending}
                        className="flex-1 px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleApprove(photo.id)}
                        disabled={moderateMutation.isPending}
                        className="flex-1 px-3 py-2 text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50"
                        style={{ backgroundColor: '#8FB897' }}
                      >
                        Approve
                      </button>
                    </div>
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
