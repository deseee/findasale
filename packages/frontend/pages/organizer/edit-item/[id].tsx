/**
 * Edit Item Page (thin shell)
 *
 * The form itself lives in components/itemForm/ItemFormBody.tsx (variant "page"); this file keeps the route param,
 * the auth redirect, the page header (Back link, title, Share, Label Sheets, Print Label) and the layout.
 *
 * Allows organizers to:
 * - Update item title, description, photos
 * - Change pricing or auction settings
 * - Update status (active, sold, etc.)
 */

import React from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import Skeleton from '../../../components/Skeleton';
import ItemFormBody from '../../../components/itemForm/ItemFormBody';
import { useItemForEdit } from '../../../components/itemForm/useItemForEdit';

const EditItemPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  // Same query (and cache key) as the form body, so this is not a second request.
  const { data: item, isLoading } = useItemForEdit(id);

  const handlePrintLabel = async () => {
    if (!id) return;
    try {
      const res = await api.get(`/items/${id}/label`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const win = window.open(url, '_blank');
      // Revoke after a short delay to allow the browser to load it
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      if (!win) showToast('Allow pop-ups to view the label', 'error');
    } catch {
      showToast('Failed to generate label', 'error');
    }
  };

  // Auth guard: placed after all hooks to comply with Rules of Hooks
  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-800 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <Skeleton className="h-10 w-48 mb-8" />
          <div className="space-y-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-24" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-800 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <Link href="/organizer/dashboard" className="text-amber-600 hover:underline text-sm font-medium mb-4 inline-block">
            Back to dashboard
          </Link>
          <div className="text-center py-16">
            <p className="text-warm-600 dark:text-warm-400 text-lg">Item not found or you don&apos;t have permission to edit it.</p>
          </div>
        </div>
      </div>
    );
  }

  const itemId = String(id);

  return (
    <>
      <Head>
        <title>Edit Item - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-white dark:bg-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <Link href="/organizer/dashboard" className="text-amber-600 hover:underline text-sm font-medium inline-block">
              Back to dashboard
            </Link>
          </div>

          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100">Edit Item</h1>
            <div className="flex items-center gap-2">
              {id && item && (
                <button
                  type="button"
                  onClick={async () => {
                    const shareUrl = `${window.location.origin}/items/${id}`;
                    const shareData = {
                      title: item.title,
                      text: `${item.title}. Check it out on FindA.Sale`,
                      url: shareUrl,
                    };
                    try {
                      if (navigator.share) {
                        await navigator.share(shareData);
                      } else {
                        await navigator.clipboard.writeText(shareUrl);
                        showToast('Link copied!', 'success');
                      }
                    } catch {
                      await navigator.clipboard.writeText(shareUrl);
                      showToast('Link copied!', 'success');
                    }
                  }}
                  className="bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-medium py-2 px-3 rounded-lg transition-colors text-sm flex items-center gap-1.5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  Share
                </button>
              )}
              {item?.saleId && (
                <Link
                  href={`/organizer/label-composer/${item.saleId}`}
                  className="bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-medium py-2 px-3 rounded-lg transition-colors text-sm flex items-center gap-1.5"
                >
                  🏷️ Label Sheets
                </Link>
              )}
              {id && (
                <button
                  type="button"
                  onClick={handlePrintLabel}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  🏷️ Print Label
                </button>
              )}
            </div>
          </div>

          <ItemFormBody itemId={itemId} variant="page" />
        </div>
      </div>
    </>
  );
};

export default EditItemPage;
