/**
 * Feature #32: Shopper Wishlist Alerts Page
 *
 * Page: /shopper/alerts
 * - Displays list of user's wishlist alerts
 * - "Add Alert" button opens modal form
 * - Each alert shows name, keywords, category, price range, radius
 * - Edit and delete actions per alert
 */

import React, { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import WishlistAlertForm from '@/components/WishlistAlertForm';
import { useWishlistAlerts, useDeleteAlert } from '@/hooks/useWishlistAlerts';
import { withAuth } from '@/lib/withAuth';

interface Alert {
  id: string;
  name: string;
  query: {
    q?: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    radiusMiles?: number;
    lat?: number;
    lng?: number;
    tags?: string[];
  };
  isActive: boolean;
  createdAt: string;
}

function AlertsPage() {
  const router = useRouter();
  const { data: alerts, isLoading, error } = useWishlistAlerts();
  const deleteAlert = useDeleteAlert();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<Alert | null>(null);

  const handleEdit = (alert: Alert) => {
    setEditingAlert(alert);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this alert?')) {
      try {
        await deleteAlert.mutateAsync(id);
      } catch (error) {
        console.error('Error deleting alert:', error);
      }
    }
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingAlert(null);
  };

  return (
    <>
      <Head>
        <title>Wishlist Alerts - FindA.Sale</title>
      </Head>

      <Layout>
        <div className="max-w-4xl mx-auto py-8 px-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Wishlist Alerts</h1>
              <p className="text-gray-600 mt-2">Get notified when sales match your saved searches</p>
            </div>
            <button
              onClick={() => {
                setEditingAlert(null);
                setIsFormOpen(true);
              }}
              className="rounded-lg bg-[#8fb897] text-white px-6 py-2 font-medium hover:bg-[#7ba680]"
            >
              + Add Alert
            </button>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-8">
              <p className="text-gray-600">Loading alerts...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-700">
              Error loading alerts: {error.message}
            </div>
          )}

          {/* Empty State */}
          {alerts && alerts.length === 0 && !isLoading && (
            <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No alerts yet</h3>
              <p className="text-gray-600 mb-4">Create your first wishlist alert to get notified when matching items appear</p>
              <button
                onClick={() => setIsFormOpen(true)}
                className="rounded-lg bg-[#8fb897] text-white px-6 py-2 font-medium hover:bg-[#7ba680]"
              >
                Create Alert
              </button>
            </div>
          )}

          {/* Alerts List */}
          {alerts && alerts.length > 0 && (
            <div className="space-y-4">
              {alerts.map((alert) => (
                <div key={alert.id} className="rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">{alert.name}</h3>

                      {/* Alert Details */}
                      <div className="mt-3 text-sm text-gray-600 space-y-1">
                        {alert.query.q && (
                          <p>
                            <span className="font-medium">Keywords:</span> {alert.query.q}
                          </p>
                        )}
                        {alert.query.category && (
                          <p>
                            <span className="font-medium">Category:</span> {alert.query.category}
                          </p>
                        )}
                        {(alert.query.minPrice !== undefined || alert.query.maxPrice !== undefined) && (
                          <p>
                            <span className="font-medium">Price:</span> ${alert.query.minPrice || '0'} - ${alert.query.maxPrice || '∞'}
                          </p>
                        )}
                        {alert.query.radiusMiles && (
                          <p>
                            <span className="font-medium">Radius:</span> {alert.query.radiusMiles} miles
                          </p>
                        )}
                        {alert.query.tags && alert.query.tags.length > 0 && (
                          <p>
                            <span className="font-medium">Tags:</span> {alert.query.tags.join(', ')}
                          </p>
                        )}
                      </div>

                      {/* Tags */}
                      {alert.query.tags && alert.query.tags.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {alert.query.tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-block bg-[#f0fdf4] text-[#166534] px-3 py-1 rounded-full text-xs font-medium"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleEdit(alert)}
                        className="px-3 py-1 rounded-lg text-sm text-[#8fb897] border border-[#8fb897] hover:bg-[#f0fdf4]"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(alert.id)}
                        disabled={deleteAlert.isPending}
                        className="px-3 py-1 rounded-lg text-sm text-red-600 border border-red-300 hover:bg-red-50 disabled:opacity-50"
                      >
                        {deleteAlert.isPending ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Layout>

      {/* Alert Form Modal */}
      <WishlistAlertForm
        isOpen={isFormOpen}
        onClose={handleCloseForm}
        alertId={editingAlert?.id}
        initialData={editingAlert ? editingAlert.query : undefined}
      />
    </>
  );
}

export default withAuth(AlertsPage, ['USER']);
