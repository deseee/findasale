import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import BadgeDisplay from '../../components/BadgeDisplay';

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
  isAuctionSale: boolean;
}

interface Badge {
  id: string;
  name: string;
  description: string;
  iconUrl?: string;
}

interface OrganizerProfile {
  id: string;
  businessName: string;
  phone: string;
  address: string;
  sales: Sale[];
  badges?: Badge[];
  avgRating?: number;
  reviewCount?: number;
}

const OrganizerProfilePage = () => {
  const router = useRouter();
  const { id } = router.query;

  const { data: organizer, isLoading, isError } = useQuery({
    queryKey: ['organizer', id],
    queryFn: async () => {
      const response = await api.get(`/organizers/${id}`);
      return response.data as OrganizerProfile;
    },
    enabled: !!id,
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (isError || !organizer) return <div className="min-h-screen flex items-center justify-center">Organizer not found</div>;

  const upcomingSales = organizer.sales.filter(s => new Date(s.endDate) >= new Date());
  const pastSales = organizer.sales.filter(s => new Date(s.endDate) < new Date());

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>{organizer.businessName} – FindA.Sale</title>
        <meta name="description" content={`Estate sales by ${organizer.businessName}`} />
      </Head>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Link href="/" className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back to Sales
        </Link>

        {/* Organizer header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{organizer.businessName}</h1>
              {organizer.badges && organizer.badges.length > 0 && (
                <div className="mb-3">
                  <BadgeDisplay badges={organizer.badges} size="md" />
                </div>
              )}
              {organizer.avgRating !== undefined && (
                <div className="mb-3 text-sm text-gray-600">
                  ⭐ {organizer.avgRating} average rating ({organizer.reviewCount} reviews)
                </div>
              )}
              <div className="space-y-1 text-gray-600">
                {organizer.phone && (
                  <div className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {organizer.phone}
                  </div>
                )}
                {organizer.address && (
                  <div className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {organizer.address}
                  </div>
                )}
              </div>
            </div>
            <div className="bg-blue-100 text-blue-800 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ml-4">
              {organizer.sales.length} sale{organizer.sales.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Upcoming sales */}
        {upcomingSales.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Upcoming &amp; Active Sales</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {upcomingSales.map(sale => (
                <SaleCard key={sale.id} sale={sale} />
              ))}
            </div>
          </section>
        )}

        {/* Past sales */}
        {pastSales.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-4 text-gray-500">Past Sales</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-75">
              {pastSales.map(sale => (
                <SaleCard key={sale.id} sale={sale} />
              ))}
            </div>
          </section>
        )}

        {organizer.sales.length === 0 && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
            No sales listed yet.
          </div>
        )}
      </main>
    </div>
  );
};

const SaleCard = ({ sale }: { sale: Sale }) => {
  const start = new Date(sale.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const end = new Date(sale.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <Link href={`/sales/${sale.id}`} className="block bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
      {sale.photoUrls?.[0] && (
        <img src={sale.photoUrls[0]} alt={sale.title} className="w-full h-40 object-cover" />
      )}
      {!sale.photoUrls?.[0] && (
        <div className="w-full h-40 bg-gray-200 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between mb-1">
          <h3 className="font-bold text-gray-900">{sale.title}</h3>
          {sale.isAuctionSale && (
            <span className="ml-2 bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded shrink-0">Auction</span>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-2">{sale.city}, {sale.state}</p>
        <p className="text-xs text-gray-400">{start} – {end}</p>
      </div>
    </Link>
  );
};

export default OrganizerProfilePage;
