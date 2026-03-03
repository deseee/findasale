import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../../lib/api';
import { format, parseISO } from 'date-fns';
import SaleCard from '../../../components/SaleCard';

interface Sale {
  id: string;
  title: string;
  description: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  startDate: string;
  endDate: string;
  photoUrls: string[];
  status: string;
  organizer: {
    id: string;
    businessName: string;
  };
}

const ZipLandingPage = () => {
  const router = useRouter();
  const { zip } = router.query;
  const [sortBy, setSortBy] = useState<'upcoming' | 'popular'>('upcoming');

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['sales-by-zip', zip],
    queryFn: async () => {
      if (!zip) return [];
      const response = await api.get(`/sales?zip=${zip}`);
      return response.data as Sale[];
    },
    enabled: !!zip,
  });

  // Filter and sort
  const now = new Date();
  const upcomingSales = sales
    .filter(s => new Date(s.startDate) >= now)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const activeSales = sales
    .filter(s => new Date(s.startDate) <= now && new Date(s.endDate) >= now)
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  const pastSales = sales
    .filter(s => new Date(s.endDate) < now)
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  const displaySales = sortBy === 'upcoming' ? [...activeSales, ...upcomingSales] : sales;

  // Derive city/state from the first sale for richer meta (if available)
  const firstSale = displaySales[0];
  const locationLabel = firstSale ? `${firstSale.city}, ${firstSale.state} ${zip}` : zip;
  const siteUrl = 'https://finda.sale';

  const itemListJsonLd = displaySales.length > 0 ? JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `Estate Sales in ${zip}`,
    "description": `Find estate sales and auctions in zip code ${zip}`,
    "url": `${siteUrl}/sales/zip/${zip}`,
    "numberOfItems": displaySales.length,
    "itemListElement": displaySales.map((sale, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "item": {
        "@type": "Event",
        "name": sale.title,
        "url": `${siteUrl}/sales/${sale.id}`,
        "startDate": sale.startDate,
        "endDate": sale.endDate,
        "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
        "eventStatus": "https://schema.org/EventScheduled",
        "image": sale.photoUrls && sale.photoUrls.length > 0 ? [sale.photoUrls[0]] : undefined,
        "location": {
          "@type": "Place",
          "address": {
            "@type": "PostalAddress",
            "streetAddress": sale.address,
            "addressLocality": sale.city,
            "addressRegion": sale.state,
            "postalCode": sale.zip,
            "addressCountry": "US"
          }
        },
        "organizer": {
          "@type": "Organization",
          "name": sale.organizer.businessName
        }
      }
    }))
  }) : null;

  const breadcrumbJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": siteUrl },
      { "@type": "ListItem", "position": 2, "name": `Estate Sales in ${zip}`, "item": `${siteUrl}/sales/zip/${zip}` }
    ]
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Estate Sales in {locationLabel} - FindA.Sale</title>
        <meta name="description" content={`Browse ${displaySales.length > 0 ? `${displaySales.length} ` : ''}estate sales and auctions in ${locationLabel}. Find upcoming sales, view items, and get directions.`} />
        <meta property="og:title" content={`Estate Sales in ${locationLabel} | FindA.Sale`} />
        <meta property="og:description" content={`Find estate sales and auctions happening in ${locationLabel}. Browse listings, items, and locations.`} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${siteUrl}/sales/zip/${zip}`} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={`Estate Sales in ${locationLabel} | FindA.Sale`} />
        <meta name="twitter:description" content={`Find estate sales and auctions happening in ${locationLabel}.`} />
        {itemListJsonLd && (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: itemListJsonLd }} />
        )}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd }} />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <Link href="/" className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back to Home
        </Link>

        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Estate Sales in {locationLabel}</h1>
          <p className="text-gray-600 text-lg">{displaySales.length} sale{displaySales.length !== 1 ? 's' : ''} found</p>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-600">Loading sales...</p>
          </div>
        ) : displaySales.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-gray-600 mb-4">No sales currently scheduled in this area.</p>
            <Link href="/" className="text-blue-600 hover:text-blue-800">
              Browse all sales
            </Link>
          </div>
        ) : (
          <>
            {/* Sort options */}
            <div className="mb-6 flex gap-3">
              <button
                onClick={() => setSortBy('upcoming')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  sortBy === 'upcoming'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Upcoming First
              </button>
              <button
                onClick={() => setSortBy('popular')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  sortBy === 'popular'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                All Sales
              </button>
            </div>

            {/* Active Sales Section */}
            {activeSales.length > 0 && (
              <div className="mb-12">
                <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-6 rounded">
                  <p className="text-yellow-800 font-semibold">🔴 Happening Now</p>
                  <p className="text-yellow-700 text-sm">{activeSales.length} sale{activeSales.length !== 1 ? 's' : ''} in progress</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {activeSales.map((sale) => (
                    <SaleCard key={sale.id} sale={sale} />
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming Sales Section */}
            {upcomingSales.length > 0 && (
              <div className="mb-12">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Upcoming Sales</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {upcomingSales.map((sale) => (
                    <SaleCard key={sale.id} sale={sale} />
                  ))}
                </div>
              </div>
            )}

            {/* Past Sales Section */}
            {pastSales.length > 0 && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Past Sales</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {pastSales.map((sale) => (
                    <SaleCard key={sale.id} sale={sale} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default ZipLandingPage;
