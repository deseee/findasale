import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { getOptimizedUrl, getLqipUrl } from '../../lib/imageUtils';
import BadgeDisplay from '../../components/BadgeDisplay';
import FollowButton from '../../components/FollowButton';
import ReputationTier from '../../components/ReputationTier';
import Skeleton from '../../components/Skeleton';

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
  reputationTier: string;
  sales: Sale[];
  badges?: Badge[];
  avgRating?: number;
  reviewCount?: number;
  followerCount: number;
  isFollowing: boolean;
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
    <div className="min-h-screen bg-warm-50">
      <Head>
        <title>{organizer.businessName} – FindA.Sale</title>
        <meta name="description" content={`Estate sales by ${organizer.businessName}`} />
      </Head>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Link href="/" className="inline-flex items-center text-amber-600 hover:text-amber-800 mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back to Sales
        </Link>

        {/* Organizer header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-warm-900">{organizer.businessName}</h1>
                <ReputationTier tier={organizer.reputationTier} size="sm" />
              </div>
              {organizer.badges && organizer.badges.length > 0 && (
                <div className="mb-3">
                  <BadgeDisplay badges={organizer.badges} size="md" />
                </div>
              )}
              {organizer.avgRating !== undefined && organizer.avgRating > 0 && (
                <div className="mb-3 text-sm text-warm-600">
                  ⭐ {organizer.avgRating} average rating ({organizer.reviewCount} reviews)
                </div>
              )}
              <div className="mb-3">
                <FollowButton
                  organizerId={organizer.id}
                  initialFollowing={organizer.isFollowing}
                  initialCount={organizer.followerCount}
                />
              </div>
              <div className="space-y-1 text-warm-600">
                {organizer.phone && (
                  <div className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {organizer.phone}
                  </div>
                )}
                {organizer.address && (
                  <div className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {organizer.address}
                  </div>
                )}
              </div>
            </div>
            <div className="bg-amber-100 text-amber-800 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ml-4">
              {organizer.sales.length} sale{organizer.sales.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Upcoming sales */}
        {upcomingSales.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-bold text-warm-900 mb-4">Upcoming &amp; Active Sales</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {upcomingSales.map(sale => (
                <SaleCard key={sale.id} sale={sale} />
              ))}
            </div>
          </section>
        )}

        {/* Past sales */}
        {pastSales.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-warm-900 mb-4 text-warm-500">Past Sales</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 opacity-75">
              {pastSales.map(sale => (
                <SaleCard key={sale.id} sale={sale} />
              ))}
            </div>
          </section>
        )}

        {organizer.sales.length === 0 && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center text-warm-500">
            No sales listed yet.
          </div>
        )}
      </main>
    </div>
  );
};

const SaleCard = ({ sale }: { sale: Sale }) => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch { return ''; }
  };

  const photoUrl = sale.photoUrls?.[0] ?? null;
  const lqipUrl = photoUrl ? getLqipUrl(photoUrl) : null;
  const optimizedUrl = photoUrl ? getOptimizedUrl(photoUrl) : null;

  const isToday = (): boolean => {
    try {
      const now = new Date();
      return new Date(sale.startDate) <= now && now <= new Date(sale.endDate);
    } catch { return false; }
  };

  return (
    <div className="card overflow-hidden hover:shadow-card-hover transition-shadow flex flex-col">
      {/* 1:1 square image with LQIP blur-up */}
      <Link href={`/sales/${sale.id}`} className="block relative aspect-square bg-warm-200 overflow-hidden">
        {lqipUrl && !imgError && (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${lqipUrl})`, filter: 'blur(8px)', transform: 'scale(1.05)' }}
            aria-hidden="true"
          />
        )}
        {!imgLoaded && !imgError && (
          <Skeleton className="absolute inset-0 rounded-none bg-warm-200/60" />
        )}
        {photoUrl && !imgError ? (
          <img
            src={optimizedUrl!}
            alt={sale.title}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-warm-400 text-xs">No photo</span>
          </div>
        )}
        {/* Badge overlays */}
        <div className="absolute top-2 left-2 flex gap-1">
          {sale.isAuctionSale && (
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-600 text-white shadow">AUCTION</span>
          )}
          {isToday() && (
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-600 text-white shadow">TODAY</span>
          )}
        </div>
      </Link>
      {/* Content area */}
      <div className="flex flex-col flex-1 p-3">
        <Link href={`/sales/${sale.id}`}>
          <h3 className="font-semibold text-sm text-warm-900 leading-snug line-clamp-1 mb-1">{sale.title}</h3>
          <p className="text-xs text-warm-500">{formatDate(sale.startDate)} – {formatDate(sale.endDate)} · {sale.city}, {sale.state}</p>
        </Link>
      </div>
    </div>
  );
};

export default OrganizerProfilePage;
