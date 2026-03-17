/**
 * Organizer Storefront Page
 *
 * Public page displaying organizer's branded storefront:
 * - Brand identity (logo, colors, banner, fonts)
 * - Organizer info (bio, contact links)
 * - Active sales listings
 * - Accessible via custom slug: findasale.local/organizer/storefront/[slug]
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import api from '../../../lib/api';

interface BrandKitData {
  id: string;
  businessName: string;
  bio: string | null;
  profilePhoto: string | null;
  website: string | null;
  facebook: string | null;
  instagram: string | null;
  etsy: string | null;
  brandLogoUrl: string | null;
  brandPrimaryColor: string | null;
  brandSecondaryColor: string | null;
  brandFontFamily: string | null;
  brandBannerImageUrl: string | null;
  brandAccentColor: string | null;
  customStorefrontSlug: string | null;
  subscriptionTier: string;
}

interface Sale {
  id: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  status: string;
  photoUrls: string[];
}

const OrganizerStorefront = () => {
  const router = useRouter();
  const { slug } = router.query;

  const [brandKit, setBrandKit] = useState<BrandKitData | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!slug) return;

      try {
        setIsLoading(true);
        setError(null);

        // Fetch brand kit by slug
        const brandResponse = await api.get(`/brand-kit/by-slug/${slug}`);
        const brandData = brandResponse.data;
        setBrandKit(brandData);

        // Fetch active sales for this organizer
        const salesResponse = await api.get(`/sales?organizerId=${brandData.id}&status=PUBLISHED`, {
          params: { limit: 50 },
        });
        setSales(salesResponse.data.sales || []);
      } catch (err: any) {
        console.error('Failed to fetch storefront data:', err);
        setError(err.response?.data?.message || 'Storefront not found');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [slug]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-warm-700 dark:text-gray-300">Loading storefront...</p>
        </div>
      </div>
    );
  }

  if (error || !brandKit) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-warm-900 dark:text-gray-100 mb-2">Storefront Not Found</h1>
          <p className="text-warm-600 dark:text-gray-400 mb-6">{error || 'This organizer storefront does not exist.'}</p>
          <Link href="/" className="text-amber-600 hover:underline font-medium">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  const bannerStyle = {
    backgroundColor: brandKit.brandPrimaryColor || '#8FB897',
    fontFamily: brandKit.brandFontFamily || 'system-ui, -apple-system, sans-serif',
  };

  const accentStyle = {
    color: brandKit.brandAccentColor || brandKit.brandSecondaryColor || '#1E40AF',
  };

  return (
    <>
      <Head>
        <title>{brandKit.businessName} - FindA.Sale</title>
        <meta name="description" content={brandKit.bio || `Shop sales from ${brandKit.businessName}`} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Banner with Brand Colors */}
        <div style={bannerStyle} className="py-12 text-white shadow-sm">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex items-center gap-6">
              {/* Logo */}
              {brandKit.brandLogoUrl && (
                <img
                  src={brandKit.brandLogoUrl}
                  alt={brandKit.businessName}
                  className="h-24 w-24 object-contain bg-white dark:bg-gray-800 rounded-lg p-2"
                />
              )}

              {/* Header Info */}
              <div className="flex-1">
                <h1 className="text-4xl font-bold mb-2">{brandKit.businessName}</h1>
                {brandKit.bio && <p className="text-lg opacity-90 max-w-lg">{brandKit.bio}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Banner Image (PRO) */}
        {brandKit.brandBannerImageUrl && (
          <div className="h-40 overflow-hidden">
            <img
              src={brandKit.brandBannerImageUrl}
              alt="Banner"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Main Content */}
        <div className="max-w-6xl mx-auto px-4 py-12">
          {/* Organizer Info Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 mb-12">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Contact & Links */}
              <div>
                <h2 className="text-2xl font-bold text-warm-900 dark:text-gray-100 mb-4">About This Organizer</h2>
                <p className="text-warm-700 dark:text-gray-300 mb-6">
                  {brandKit.bio || 'A professional estate sale organizer serving the Grand Rapids area.'}
                </p>

                {/* Social Links */}
                <div className="space-y-3">
                  {brandKit.website && (
                    <a
                      href={brandKit.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-amber-600 hover:underline font-medium"
                    >
                      Visit Website
                    </a>
                  )}
                  {brandKit.facebook && (
                    <a
                      href={brandKit.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-amber-600 hover:underline font-medium"
                    >
                      Facebook
                    </a>
                  )}
                  {brandKit.instagram && (
                    <a
                      href={brandKit.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-amber-600 hover:underline font-medium"
                    >
                      Instagram
                    </a>
                  )}
                  {brandKit.etsy && (
                    <a
                      href={brandKit.etsy}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-amber-600 hover:underline font-medium"
                    >
                      Etsy Shop
                    </a>
                  )}
                </div>
              </div>

              {/* Brand Colors Preview (PRO) */}
              {(brandKit.subscriptionTier === 'PRO' || brandKit.subscriptionTier === 'TEAMS') && (
                <div>
                  <h3 className="text-lg font-bold text-warm-900 dark:text-gray-100 mb-4">Brand Identity</h3>
                  <div className="space-y-3">
                    {brandKit.brandPrimaryColor && (
                      <div className="flex items-center gap-3">
                        <div
                          className="h-12 w-12 rounded-lg border-2 border-warm-300 dark:border-gray-600"
                          style={{ backgroundColor: brandKit.brandPrimaryColor }}
                          title={brandKit.brandPrimaryColor}
                        />
                        <span className="text-warm-700 dark:text-gray-300">
                          Primary: {brandKit.brandPrimaryColor}
                        </span>
                      </div>
                    )}
                    {brandKit.brandSecondaryColor && (
                      <div className="flex items-center gap-3">
                        <div
                          className="h-12 w-12 rounded-lg border-2 border-warm-300 dark:border-gray-600"
                          style={{ backgroundColor: brandKit.brandSecondaryColor }}
                          title={brandKit.brandSecondaryColor}
                        />
                        <span className="text-warm-700 dark:text-gray-300">
                          Secondary: {brandKit.brandSecondaryColor}
                        </span>
                      </div>
                    )}
                    {brandKit.brandAccentColor && (
                      <div className="flex items-center gap-3">
                        <div
                          className="h-12 w-12 rounded-lg border-2 border-warm-300 dark:border-gray-600"
                          style={{ backgroundColor: brandKit.brandAccentColor }}
                          title={brandKit.brandAccentColor}
                        />
                        <span className="text-warm-700 dark:text-gray-300">
                          Accent: {brandKit.brandAccentColor}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Active Sales */}
          <div>
            <h2 className="text-3xl font-bold text-warm-900 dark:text-gray-100 mb-8">
              Active Sales ({sales.length})
            </h2>

            {sales.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-12 text-center">
                <p className="text-warm-600 dark:text-gray-400 text-lg">
                  No active sales at the moment. Check back soon!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sales.map((sale) => {
                  const featuredImage = sale.photoUrls?.[0];
                  const saleDate = new Date(sale.startDate);
                  const dateStr = saleDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });

                  return (
                    <Link
                      key={sale.id}
                      href={`/sales/${sale.id}`}
                      className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                    >
                      {/* Sale Image */}
                      {featuredImage && (
                        <div className="h-40 overflow-hidden bg-warm-100 dark:bg-gray-700">
                          <img
                            src={featuredImage}
                            alt={sale.title}
                            className="w-full h-full object-cover hover:scale-105 transition-transform"
                          />
                        </div>
                      )}

                      {/* Sale Info */}
                      <div className="p-4">
                        <h3 className="font-bold text-warm-900 dark:text-gray-100 mb-2 line-clamp-2">
                          {sale.title}
                        </h3>
                        <p className="text-sm text-warm-600 dark:text-gray-400 mb-2">
                          {sale.city}, {sale.state}
                        </p>
                        <div
                          className="inline-block text-xs font-semibold px-3 py-1 rounded-full"
                          style={{
                            backgroundColor: brandKit.brandPrimaryColor || '#8FB897',
                            color: 'white',
                          }}
                        >
                          {dateStr}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Back to Home */}
      <div className="bg-white dark:bg-gray-800 border-t border-warm-200 dark:border-gray-700 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <Link href="/" className="text-amber-600 hover:underline font-medium">
            Back to FindA.Sale Home
          </Link>
        </div>
      </div>
    </>
  );
};

export default OrganizerStorefront;
