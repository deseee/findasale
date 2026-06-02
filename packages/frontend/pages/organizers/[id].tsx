import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { track } from '@vercel/analytics';
import { GetServerSideProps } from 'next';
import api from '../../lib/api';
import { getSaleImageUrl } from '../../lib/imageUtils';
import BadgeDisplay from '../../components/BadgeDisplay';
import FollowButton from '../../components/FollowButton';
import ReputationTier from '../../components/ReputationTier';
import ReputationBadge from '../../components/ReputationBadge'; // Feature #71
import Skeleton from '../../components/Skeleton';
import ReviewsSection from '../../components/ReviewsSection';

interface ScrapedMetadata {
  aiEnriched?: {
    categories: string[];
    priceRange: string;
    summary: string;
  };
}

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
  scrapedMetadata?: ScrapedMetadata | null;
}

interface Badge {
  id: string;
  name: string;
  description: string;
  iconUrl?: string;
}

interface FoundingShopper {
  id: string;
  name: string;
  introducedAt: string;
}

interface OrganizerProfile {
  id: string;
  businessName: string;
  phone?: string | null;
  address?: string | null;
  contactEmail?: string | null;
  website?: string | null;
  businessCategory?: string | null;
  profilePhoto?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  etsy?: string | null;
  twitterUrl?: string | null;
  tiktokUrl?: string | null;
  youtubeUrl?: string | null;
  pinterestUrl?: string | null;
  linkedInUrl?: string | null;
  reputationTier: string;
  reputationScore?: number; // Feature #71
  reputationIsNew?: boolean; // Feature #71
  sales: Sale[];
  badges?: Badge[];
  foundingShoppers?: FoundingShopper[];
  avgRating?: number;
  reviewCount?: number;
  followerCount: number;
  isFollowing: boolean;
  isClaimed: boolean;
  isUnmanagedListing: boolean;
  foundingOrgBadge?: boolean;
}

// Maps the businessCategory enum stored on the Organizer record to a
// reader-friendly label. Falls back to a title-cased version if unmapped.
const BUSINESS_CATEGORY_LABELS: Record<string, string> = {
  ESTATE_SALE_CO: 'Estate Sale Company',
  AUCTION_HOUSE: 'Auction House',
  CONSIGNMENT_SHOP: 'Consignment Shop',
  ANTIQUE_DEALER: 'Antique Dealer',
  LIQUIDATOR: 'Liquidator',
  MOVING_COMPANY: 'Moving Company',
  THRIFT_STORE: 'Thrift Store',
  FLEA_MARKET: 'Flea Market',
};

const formatBusinessCategory = (raw?: string | null): string | null => {
  if (!raw) return null;
  if (BUSINESS_CATEGORY_LABELS[raw]) return BUSINESS_CATEGORY_LABELS[raw];
  return raw
    .toLowerCase()
    .split(/[_\s]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

interface OrganizerPageProps {
  organizer: OrganizerProfile | null;
}

const OrganizerProfilePage = ({ organizer }: OrganizerPageProps) => {
  const router = useRouter();
  const [stickyVisible, setStickyVisible] = useState(false);
  const claimBtnRef = useRef<HTMLButtonElement>(null);

  // Log organizer page view to backend when arriving from outreach email
  useEffect(() => {
    if (router.query.ref !== 'outreach' || !organizer?.id) return;
    fetch('/api/outreach/page-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizerId: organizer.id,
        touchNumber: router.query.utm_campaign
          ? parseInt((router.query.utm_campaign as string).replace('touch', '')) || null
          : null,
        tier: (router.query.utm_content as string) || null,
      }),
    }).catch(() => {}); // fire-and-forget
  }, [organizer?.id, router.query.ref]);

  useEffect(() => {
    if (!organizer?.isUnmanagedListing || !claimBtnRef.current) return;
    const el = claimBtnRef.current;
    const obs = new IntersectionObserver(
      ([entry]) => setStickyVisible(!entry.isIntersecting),
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [organizer?.isUnmanagedListing]);

  if (!organizer) return (
    <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
      <div className="text-center px-4 max-w-md">
        <div className="text-5xl mb-4">🏷️</div>
        <h1 className="text-2xl font-bold text-warm-900 dark:text-gray-100 mb-2">Organizer not found</h1>
        <p className="text-warm-500 dark:text-gray-400 mb-6">This organizer profile doesn't exist or may have moved.</p>
        <Link href="/" className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">Browse Sales</Link>
      </div>
    </div>
  );

  const upcomingSales = organizer.sales.filter(s => new Date(s.endDate) >= new Date());
  const pastSales = organizer.sales.filter(s => new Date(s.endDate) < new Date());

  // Extract city and state from first sale if available
  const firstSale = organizer.sales?.[0];
  const organizerCity = firstSale?.city || null;
  const organizerState = firstSale?.state || null;

  // Prepare location string for descriptions
  const locationSuffix = organizerCity && organizerState ? ` in ${organizerCity}, ${organizerState}` : '';

  // LocalBusiness schema JSON-LD
  const localBusinessSchema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: organizer.businessName,
    url: `https://finda.sale/organizers/${organizer.id}`,
    image: 'https://finda.sale/og-image.png',
    ...(organizer.phone && { telephone: organizer.phone }),
    ...(organizerCity && organizerState && {
      address: {
        '@type': 'PostalAddress',
        addressLocality: organizerCity,
        addressRegion: organizerState,
        addressCountry: 'US',
      },
    }),
  };

  // BreadcrumbList schema JSON-LD
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://finda.sale',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Organizers',
        item: 'https://finda.sale/trending',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: organizer.businessName,
        item: `https://finda.sale/organizers/${organizer.id}`,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
      <Head>
        <title>{organizer.businessName} – FindA.Sale</title>
        <link rel="canonical" href={`https://finda.sale/organizers/${organizer.id}`} />
        <meta name="description" content={`Browse upcoming estate sales, auctions, yard sales, and more from ${organizer.businessName}${locationSuffix} — FindA.Sale.`} />
        <meta property="og:title" content={`${organizer.businessName} | FindA.Sale`} />
        <meta property="og:image" content="https://finda.sale/og-image.png" />
        <meta property="og:description" content={`Estate sales, garage sales, auctions, and more from ${organizer.businessName}${locationSuffix}.`} />
        <meta property="og:type" content="business.business" />
        <meta property="og:url" content={`https://finda.sale/organizers/${organizer.id}`} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      </Head>

      {/* Trust bar — unclaimed only */}
      {organizer.isUnmanagedListing && (
        <div className="bg-amber-950 border-b border-amber-800 px-4 py-2.5 flex items-start gap-3">
          <span className="text-base flex-shrink-0 mt-0.5">📋</span>
          <p className="text-sm text-amber-100 leading-snug">
            <strong className="text-amber-300">We found your sales listed publicly.</strong>{' '}
            This profile was auto-created from your public sale listings — shoppers are already finding it. Claim it to take control.
          </p>
        </div>
      )}

      <main className="container mx-auto px-4 py-4 sm:py-8 max-w-4xl">
        <Link href="/" className="inline-flex items-center text-amber-600 hover:text-amber-800 mb-4 sm:mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back to Sales
        </Link>

        {/* Organizer header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6 mb-6 sm:mb-8">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-3 mb-2">
                {organizer.profilePhoto && (
                  <img
                    src={getSaleImageUrl(organizer.profilePhoto) ?? organizer.profilePhoto}
                    alt={`${organizer.businessName} logo`}
                    className="w-14 h-14 sm:w-20 sm:h-20 rounded-lg object-cover border border-warm-200 dark:border-gray-700 flex-shrink-0"
                    loading="lazy"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl sm:text-3xl font-bold text-warm-900 dark:text-gray-100 break-words">{organizer.businessName}</h1>
                    {!organizer.isUnmanagedListing && <ReputationTier tier={organizer.reputationTier} size="sm" />}
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-200 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                      🏷️ {organizer.sales.length} sale{organizer.sales.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {(formatBusinessCategory(organizer.businessCategory) || organizer.address) && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-warm-500 dark:text-gray-400">
                      {formatBusinessCategory(organizer.businessCategory) && (
                        <span>{formatBusinessCategory(organizer.businessCategory)}</span>
                      )}
                      {formatBusinessCategory(organizer.businessCategory) && organizer.address && (
                        <span aria-hidden="true" className="text-warm-300 dark:text-gray-600">•</span>
                      )}
                      {organizer.address && (
                        <span className="inline-flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-warm-400 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {organizer.address}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {organizer.isUnmanagedListing && (
                  <div className="hidden sm:flex flex-shrink-0 flex-col items-center gap-1 ml-2">
                    <div className="relative w-14 h-14 flex items-center justify-center">
                      <svg className="-rotate-90 w-14 h-14" viewBox="0 0 56 56" fill="none">
                        <circle cx="28" cy="28" r="22" stroke="#3f3f46" strokeWidth="5" />
                        <circle
                          cx="28" cy="28" r="22"
                          stroke="#f97316"
                          strokeWidth="5"
                          strokeLinecap="round"
                          strokeDasharray="138"
                          strokeDashoffset="100"
                        />
                      </svg>
                      <span className="absolute text-sm font-bold text-orange-500">28%</span>
                    </div>
                    <span className="text-xs text-gray-400 text-center leading-tight">Profile<br/>complete</span>
                  </div>
                )}
              </div>
              {typeof organizer.reputationScore === 'number' && !organizer.isUnmanagedListing && (
                <div className="mb-3 flex items-center gap-2">
                  <ReputationBadge
                    score={organizer.reputationScore}
                    isNew={organizer.reputationIsNew}
                    size="large"
                    showCount={false}
                  />
                </div>
              )}
              {organizer.isUnmanagedListing && (
                <div className="mb-4 rounded-xl bg-gray-100 dark:bg-zinc-800/70 p-3">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Finish your profile to unlock</p>
                  {(['Business bio & photos', 'Shopper activity & insights', 'Reputation badge & review responses'] as string[]).map((item) => (
                    <div key={item} className="flex items-center gap-2 mb-1.5 last:mb-0">
                      <span className="w-5 h-5 rounded-full border-2 border-dashed border-orange-500 flex items-center justify-center text-orange-500 text-xs flex-shrink-0">+</span>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{item}</span>
                    </div>
                  ))}
                </div>
              )}
              {organizer.isUnmanagedListing && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {([
                    { icon: '📸', label: 'Photos & Bio' },
                    { icon: '📊', label: 'Shopper Analytics' },
                    { icon: '⭐', label: 'Control Reviews' },
                  ] as { icon: string; label: string }[]).map(({ icon, label }) => (
                    <div key={label} className="bg-gray-100 dark:bg-zinc-800/70 rounded-xl p-2.5 text-center">
                      <div className="text-xl mb-1">{icon}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 leading-tight">{label}</div>
                    </div>
                  ))}
                </div>
              )}
              {organizer.foundingOrgBadge && (
                <div className="mb-3 inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-full">
                  <span aria-hidden="true">🏆</span>
                  <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">Founding Organizer</span>
                </div>
              )}
              {organizer.badges && organizer.badges.length > 0 && (
                <div className="mb-3">
                  <BadgeDisplay badges={organizer.badges} size="md" />
                </div>
              )}
              {organizer.avgRating !== undefined && organizer.avgRating > 0 && (
                <div className="mb-3 text-sm text-warm-600 dark:text-gray-300">
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
              {(organizer.phone || organizer.contactEmail || organizer.website) && (
                <div className="space-y-1.5 text-warm-600 dark:text-gray-300">
                  {organizer.phone && (
                    <a href={`tel:${organizer.phone.replace(/[^0-9+]/g, '')}`} className="flex items-center hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-warm-400 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      {organizer.phone}
                    </a>
                  )}
                  {organizer.contactEmail && (
                    <a href={`mailto:${organizer.contactEmail}`} className="flex items-center hover:text-amber-600 dark:hover:text-amber-400 transition-colors break-all">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-warm-400 dark:text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {organizer.contactEmail}
                    </a>
                  )}
                  {organizer.website && (
                    <a
                      href={organizer.website.startsWith('http') ? organizer.website : `https://${organizer.website}`}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="flex items-center hover:text-amber-600 dark:hover:text-amber-400 transition-colors break-all"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-warm-400 dark:text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                      </svg>
                      {organizer.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </a>
                  )}
                </div>
              )}

              {/* Social links */}
              {(organizer.facebook || organizer.instagram || organizer.etsy || organizer.twitterUrl || organizer.tiktokUrl || organizer.youtubeUrl || organizer.pinterestUrl || organizer.linkedInUrl) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {organizer.facebook && (
                    <SocialLink href={organizer.facebook} label="Facebook">
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987H7.898v-2.89h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" /></svg>
                    </SocialLink>
                  )}
                  {organizer.instagram && (
                    <SocialLink href={organizer.instagram} label="Instagram">
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
                    </SocialLink>
                  )}
                  {organizer.etsy && (
                    <SocialLink href={organizer.etsy} label="Etsy">
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8.564 4.435v6.658s2.357.025 3.617-.07c.99-.155 1.165-.245 1.34-1.385l.28-1.12h.83l-.14 2.833.07 2.903h-.84l-.21-.98c-.28-1.05-.42-1.155-1.33-1.26-1.155-.105-3.617-.07-3.617-.07v5.583c0 1.085.56 1.54 1.82 1.54h3.652c1.155 0 2.31-.105 3.045-1.82.49-1.12.91-2.1.91-2.1l.77.07c-.07.42-.49 4.13-.56 4.97 0 0-2.87-.07-4.13-.07H6.184l-3.222.14v-.84l1.05-.21c.77-.14.98-.385.98-.98 0 0 .07-2.1.07-5.567 0-3.502-.07-5.567-.07-5.567 0-.665-.21-.875-.98-1.015l-1.05-.21v-.84l3.187.14h7.59c1.26 0 3.396-.21 3.396-.21s-.07 1.33-.14 4.41h-.805l-.28-1.015c-.28-1.05-.7-1.575-1.435-1.575H8.564z" /></svg>
                    </SocialLink>
                  )}
                  {organizer.twitterUrl && (
                    <SocialLink href={organizer.twitterUrl} label="X (Twitter)">
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                    </SocialLink>
                  )}
                  {organizer.tiktokUrl && (
                    <SocialLink href={organizer.tiktokUrl} label="TikTok">
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" /></svg>
                    </SocialLink>
                  )}
                  {organizer.youtubeUrl && (
                    <SocialLink href={organizer.youtubeUrl} label="YouTube">
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
                    </SocialLink>
                  )}
                  {organizer.pinterestUrl && (
                    <SocialLink href={organizer.pinterestUrl} label="Pinterest">
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z" /></svg>
                    </SocialLink>
                  )}
                  {organizer.linkedInUrl && (
                    <SocialLink href={organizer.linkedInUrl} label="LinkedIn">
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" /></svg>
                    </SocialLink>
                  )}
                </div>
              )}
              {organizer.isUnmanagedListing && (
                <div className="mt-4">
                  {organizer.website && (
                    <div className="mb-3 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <span>🌐</span>
                      <a
                        href={organizer.website.startsWith('http') ? organizer.website : `https://${organizer.website}`}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="text-orange-500 hover:underline break-all"
                      >
                        {organizer.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </a>
                    </div>
                  )}
                  <button
                    ref={claimBtnRef}
                    onClick={() => {
                      track('claim_profile_click', {
                        organizerId: organizer.id,
                        source: (router.query.ref as string) || 'direct',
                        tier: (router.query.utm_content as string) || undefined,
                      });
                      window.location.href = `/register?claim=${organizer.id}`;
                    }}
                    className="w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white text-base font-bold py-3.5 rounded-xl transition-colors mb-2"
                  >
                    Claim This Profile — It&apos;s Free
                  </button>
                  <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                    Free forever &middot; No credit card needed
                  </p>
                </div>
              )}
              {organizer.foundingShoppers && organizer.foundingShoppers.length > 0 && (
                <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 uppercase tracking-wide mb-3">Discovered by</p>
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {organizer.foundingShoppers.map((shopper, idx) => (
                        <div
                          key={shopper.id}
                          className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white text-xs font-bold border-2 border-white dark:border-gray-800 relative"
                          title={shopper.name}
                        >
                          {shopper.name.charAt(0).toUpperCase()}
                        </div>
                      ))}
                    </div>
                    <span className="text-sm text-amber-900 dark:text-amber-100">
                      {organizer.foundingShoppers.length === 1
                        ? organizer.foundingShoppers[0].name
                        : organizer.foundingShoppers.length === 2
                        ? `${organizer.foundingShoppers[0].name} & ${organizer.foundingShoppers[1].name}`
                        : `${organizer.foundingShoppers[0].name} and ${organizer.foundingShoppers.length - 1} others`
                      }
                    </span>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Shopper Activity — locked for unclaimed */}
        {organizer.isUnmanagedListing && (
          <section className="mb-6">
            <h2 className="text-xl font-bold text-warm-900 dark:text-gray-100 mb-3">📈 Your Shopper Activity</h2>
            <div className="relative bg-white dark:bg-gray-800 border border-amber-500/25 rounded-xl p-4 shadow-md">
              <div className="grid grid-cols-3 gap-3 select-none" style={{ filter: 'blur(3px)' }} aria-hidden="true">
                {([
                  { n: '47', label: 'Sale page views' },
                  { n: '12', label: 'Saves & favorites' },
                  { n: '8', label: 'Item clicks' },
                ] as { n: string; label: string }[]).map(({ n, label }) => (
                  <div key={label} className="bg-gray-100 dark:bg-zinc-700 rounded-xl p-3 text-center">
                    <div className="text-2xl font-extrabold text-warm-900 dark:text-white">{n}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</div>
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 backdrop-blur-sm bg-white/60 dark:bg-zinc-950/60 rounded-xl flex flex-col items-center justify-center gap-2">
                <span className="text-2xl">🔒</span>
                <p className="text-sm text-gray-700 dark:text-gray-300 text-center px-6 leading-snug">
                  Shoppers are already finding you.{' '}
                  <Link
                    href={`/register?claim=${organizer.id}`}
                    className="text-orange-500 font-semibold underline"
                    onClick={() => track('claim_profile_click', {
                      organizerId: organizer.id,
                      source: (router.query.ref as string) || 'direct',
                      tier: (router.query.utm_content as string) || undefined,
                    })}
                  >
                    Claim your profile
                  </Link>{' '}
                  to see the full breakdown.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Buyer Insights — locked for unclaimed */}
        {organizer.isUnmanagedListing && (
          <section className="mb-6">
            <h2 className="text-xl font-bold text-warm-900 dark:text-gray-100 mb-3">🧠 Buyer Insights</h2>
            <div className="relative bg-white dark:bg-gray-800 border border-amber-500/25 rounded-xl px-4 py-3 shadow-md overflow-hidden">
              <div className="flex gap-2 overflow-hidden select-none" style={{ filter: 'blur(2px)' }} aria-hidden="true">
                {([
                  { text: 'Avg. time on page:', val: '2m 14s' },
                  { text: 'Top category:', val: formatBusinessCategory(organizer.businessCategory) ?? 'Vintage & Resale' },
                  { text: 'Repeat visitors:', val: '38%' },
                ] as { text: string; val: string }[]).map(({ text, val }) => (
                  <span key={text} className="flex-shrink-0 bg-gray-100 dark:bg-zinc-700 rounded-full px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {text} <strong className="text-warm-900 dark:text-white">{val}</strong>
                  </span>
                ))}
              </div>
              <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-r from-transparent to-white dark:to-gray-800" />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
                <span className="text-lg">🔒</span>
                <span className="text-xs text-gray-400 text-center leading-tight">Claim to<br/>unlock</span>
              </div>
            </div>
          </section>
        )}

        {/* Upcoming sales */}
        {upcomingSales.length > 0 && (
          <section className="mb-6 sm:mb-8">
            <h2 className="text-xl font-bold text-warm-900 dark:text-gray-100 mb-4">Upcoming &amp; Active Sales</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
              {upcomingSales.map(sale => (
                <SaleCard key={sale.id} sale={sale} />
              ))}
            </div>
          </section>
        )}

        {/* Past sales */}
        {pastSales.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-warm-500 dark:text-warm-400 mb-4">Past Sales</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 opacity-75">
              {pastSales.map(sale => (
                <SaleCard key={sale.id} sale={sale} />
              ))}
            </div>
          </section>
        )}

        {organizer.sales.length === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 sm:p-8 text-center">
            <p className="text-warm-500 dark:text-warm-400">No sales listed yet.</p>
            <p className="text-sm text-warm-400 dark:text-warm-500 mt-2">Check back soon for upcoming sales.</p>
          </div>
        )}

        {/* Reviews */}
        <div className="mt-8">
          {organizer.isUnmanagedListing ? (
            <UnclaimedReviewsSection />
          ) : (
            <ReviewsSection
              mode="organizer"
              organizerId={organizer.id}
              avgRating={organizer.avgRating}
              totalReviews={organizer.reviewCount}
            />
          )}
        </div>

        {/* Sale History Intelligence — locked for unclaimed */}
        {organizer.isUnmanagedListing && (
          <section className="mt-6 mb-8">
            <h2 className="text-xl font-bold text-warm-900 dark:text-gray-100 mb-3">🏅 Your Sale History Intelligence</h2>
            <div className="relative bg-white dark:bg-gray-800 border border-amber-500/25 rounded-xl p-4 shadow-md overflow-hidden">
              <div className="flex items-center gap-3 select-none" style={{ filter: 'blur(2px)' }} aria-hidden="true">
                <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">🏷</div>
                <div className="min-w-0">
                  <div className="font-bold text-warm-900 dark:text-white">
                    {formatBusinessCategory(organizer.businessCategory) ?? 'Resale'} Specialist
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Based on {organizer.sales.length} sale{organizer.sales.length !== 1 ? 's' : ''} &amp; your catalog
                  </div>
                  <div className="flex gap-3 mt-1">
                    <span className="text-xs text-gray-600 dark:text-gray-300">
                      <strong>{organizer.sales.length}</strong> sale{organizer.sales.length !== 1 ? 's' : ''} hosted
                    </span>
                    {organizerCity && organizerState && (
                      <span className="text-xs text-gray-600 dark:text-gray-300">
                        <strong>{organizerCity}, {organizerState}</strong>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div
                className="absolute inset-0 rounded-xl pointer-events-none"
                style={{ background: 'repeating-linear-gradient(-45deg, transparent, transparent 8px, rgba(9,9,11,0.07) 8px, rgba(9,9,11,0.07) 16px)' }}
              />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 border-2 border-amber-500/50 rounded px-3 py-1 text-sm font-extrabold text-amber-500/60 tracking-widest whitespace-nowrap z-10 pointer-events-none select-none">
                UNCLAIMED
              </div>
              <p className="relative z-20 mt-4 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                We&apos;ve been building your sale history from public listings. Claim your profile to display your{' '}
                <Link
                  href={`/register?claim=${organizer.id}`}
                  className="text-orange-500 font-semibold"
                  onClick={() => track('claim_profile_click', {
                    organizerId: organizer.id,
                    source: (router.query.ref as string) || 'direct',
                    tier: (router.query.utm_content as string) || undefined,
                  })}
                >
                  {formatBusinessCategory(organizer.businessCategory) ?? 'Specialist'} Badge
                </Link>{' '}
                and turn your track record into trust.
              </p>
            </div>
          </section>
        )}
      </main>

      {/* Sticky bottom bar — shows after hero CTA scrolls off */}
      {organizer.isUnmanagedListing && stickyVisible && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-gray-200 dark:border-zinc-700 px-4 py-3 flex items-center gap-3 z-50 shadow-lg">
          <div className="flex-1 text-sm text-gray-700 dark:text-gray-300 leading-tight min-w-0">
            <strong className="text-warm-900 dark:text-white block truncate">{organizer.businessName}</strong>
            <span className="text-gray-500 dark:text-gray-400">Claim your free storefront</span>
          </div>
          <Link
            href={`/register?claim=${organizer.id}`}
            className="bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors flex-shrink-0"
            onClick={() => track('claim_profile_click', {
              organizerId: organizer.id,
              source: (router.query.ref as string) || 'direct',
              tier: (router.query.utm_content as string) || undefined,
            })}
          >
            Claim Free
          </Link>
        </div>
      )}
    </div>
  );
};

const UnclaimedReviewsSection = () => (
  <section>
    <h2 className="text-xl font-bold text-warm-900 dark:text-gray-100 mb-4">⭐ Customer Reviews</h2>
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-sm flex-shrink-0">
          MK
        </div>
        <div>
          <div className="text-yellow-400 text-sm tracking-wide">★★★★☆</div>
          <div className="text-xs text-gray-400 mt-0.5">2 weeks ago</div>
        </div>
      </div>
      <p
        className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed select-none"
        style={{ filter: 'blur(5px)' }}
        aria-hidden="true"
      >
        Amazing finds at this sale! The vintage clothing section was incredible — I found a 1970s leather jacket
        in perfect condition. The organizer was friendly and the space was well laid-out. Will definitely be back
        next time they have a sale in the area.
      </p>
      <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
        🔒 Claim your profile to respond to reviews and get notified the moment a new one arrives.
      </div>
      <div className="mt-1 text-xs text-red-400">
        ⚠ Unclaimed organizers cannot flag or dispute inaccurate reviews.
      </div>
    </div>
  </section>
);

const SocialLink = ({ href, label, children }: { href: string; label: string; children: React.ReactNode }) => {
  const safeHref = href.startsWith('http') ? href : `https://${href}`;
  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer nofollow"
      aria-label={label}
      title={label}
      className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-warm-100 dark:bg-gray-700 text-warm-600 dark:text-gray-300 hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-900/30 dark:hover:text-amber-300 transition-colors"
    >
      {children}
    </a>
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
  const optimizedUrl = photoUrl ? getSaleImageUrl(photoUrl) : null;
  const lqipUrl = optimizedUrl; // proxy URL doubles as LQIP; CSS blur handles visual effect

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
            ref={(el) => { if (el?.complete && el.naturalWidth > 0) setImgLoaded(true); }}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 bg-gray-800 border border-gray-700 rounded-lg flex flex-col items-center justify-center p-4">
            <div className="text-3xl mb-2">📍</div>
            <h4 className="text-white text-sm font-semibold text-center line-clamp-2 mb-1">{sale.title}</h4>
            <p className="text-gray-400 text-xs text-center">{formatDate(sale.startDate)}</p>
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
          <h3 className="font-semibold text-sm text-warm-900 dark:text-gray-100 leading-snug line-clamp-1 mb-1">{sale.title}</h3>
          <p className="text-xs text-warm-500 dark:text-gray-400">{formatDate(sale.startDate)}</p>
        </Link>
        {/* Enriched listing metadata for scraped sales */}
        {sale.scrapedMetadata?.aiEnriched && (
          <div className="mt-2 pt-2 border-t border-warm-200 dark:border-gray-700 space-y-1">
            {sale.scrapedMetadata.aiEnriched.priceRange && (
              <p className="text-xs text-warm-500 dark:text-gray-400">
                Typical items: {sale.scrapedMetadata.aiEnriched.priceRange}
              </p>
            )}
            {sale.scrapedMetadata.aiEnriched.summary && (
              <p className="text-xs text-warm-600 dark:text-gray-350 leading-snug">
                {sale.scrapedMetadata.aiEnriched.summary}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps<OrganizerPageProps> = async (context) => {
  const { id } = context.params as { id: string };

  // Fast-fail malformed IDs (e.g. "cmoog3bkr000=" from malformed links/bots).
  // Cuid2 IDs are 24 alphanumeric chars. Anything outside [a-z0-9] at 20–30 chars
  // is invalid — skip the API call entirely and return 404 immediately.
  // This prevents the API error from triggering the axios interceptor on the server
  // and stops the cascade that causes SW rejection + router invariant on the client.
  if (!id || !/^[a-z0-9]{20,30}$/.test(id)) {
    return { notFound: true };
  }

  try {
    const response = await api.get(`/organizers/${id}`);
    return {
      props: {
        organizer: response.data,
      },
    };
  } catch (error: any) {
    // 404 from backend → organizer not found
    // Any other error (500, network) → also 404 to avoid broken page render
    return { notFound: true };
  }
};

export default OrganizerProfilePage;
