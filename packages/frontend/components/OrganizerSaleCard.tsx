import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { format } from 'date-fns';
import { getOptimizedUrl, getLqipUrl } from '../lib/imageUtils';
import Skeleton from './Skeleton';
import api from '../lib/api';
import RSVPAttendeesModal from './RSVPAttendeesModal';

interface Sale {
  id: string;
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  photoUrls?: string[];
  organizer?: {
    id: string;
    businessName: string;
  };
  status?: string;
}

interface OrganizerSaleCardProps {
  sale: Sale;
}

const OrganizerSaleCard: React.FC<OrganizerSaleCardProps> = ({ sale }) => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [rsvpCount, setRsvpCount] = useState(0);
  const [isAttendeesModalOpen, setIsAttendeesModalOpen] = useState(false);

  // Fetch RSVP count
  useEffect(() => {
    const fetchRsvpCount = async () => {
      try {
        const response = await api.get(`/sales/${sale.id}/rsvp/count`);
        setRsvpCount(response.data.count);
      } catch (error) {
        console.error('Failed to fetch RSVP count:', error);
      }
    };

    if (sale.id) {
      fetchRsvpCount();
    }
  }, [sale.id]);

  // Calculate image URLs
  const photoUrl = sale.photoUrls?.[0] ?? null;
  const hasPhoto = !!photoUrl;
  const lqipUrl_calc = photoUrl ? getLqipUrl(photoUrl) : null;
  const optimizedUrl = photoUrl ? getOptimizedUrl(photoUrl) : null;

  // Reset image loading state when the photo URL changes
  // This ensures new images load even if the component instance is reused
  useEffect(() => {
    setImgLoaded(false);
    setImgError(false);
  }, [optimizedUrl]);

  const formatSaleDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'TBA';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'TBA';
      return format(date, 'MMM d');
    } catch {
      return 'TBA';
    }
  };

  const lqipUrl = lqipUrl_calc;

  return (
    <>
      <div className="card overflow-hidden hover:shadow-card-hover transition-shadow flex flex-col">
        {/* ── Image area ── */}
        <Link href={`/sales/${sale.id}`} className="block relative aspect-square bg-warm-200 overflow-hidden">
          {lqipUrl && !imgError && (
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url(${lqipUrl})`,
                filter: 'blur(8px)',
                transform: 'scale(1.05)',
              }}
              aria-hidden="true"
            />
          )}

          {!imgLoaded && !imgError && (
            <Skeleton className="absolute inset-0 rounded-none bg-warm-200/60" />
          )}

          {photoUrl && !imgError ? (
            <Image
              key={optimizedUrl}
              src={optimizedUrl!}
              alt={sale.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className={`object-cover transition-opacity duration-300 ${
                imgLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoadingComplete={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
              loading="lazy"
              priority={false}
            />
          ) : (!photoUrl || imgError) ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Image
                src="/images/placeholder.svg"
                alt=""
                width={48}
                height={48}
                className="opacity-25"
                aria-hidden="true"
              />
            </div>
          ) : null}

          {/* RSVP count badge */}
          {rsvpCount > 0 && (
            <div className="absolute top-2 left-2">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setIsAttendeesModalOpen(true);
                }}
                className="px-2 py-1 rounded text-xs font-bold bg-blue-600 text-white shadow hover:bg-blue-700 transition"
              >
                👤 {rsvpCount} going
              </button>
            </div>
          )}
        </Link>

        {/* ── Content area ── */}
        <div className="flex flex-col flex-1 p-3">
          <Link href={`/sales/${sale.id}`} className="flex-1">
            <h3 className="font-semibold text-sm text-warm-900 leading-snug line-clamp-1 mb-1">
              {sale.title}
            </h3>
            <p className="text-xs text-warm-500">
              {formatSaleDate(sale.startDate)} – {formatSaleDate(sale.endDate)}&nbsp;·&nbsp;{sale.city}, {sale.state}
            </p>
          </Link>
        </div>
      </div>

      <RSVPAttendeesModal
        isOpen={isAttendeesModalOpen}
        onClose={() => setIsAttendeesModalOpen(false)}
        saleId={sale.id}
        saleTitle={sale.title}
      />
    </>
  );
};

export default OrganizerSaleCard;
