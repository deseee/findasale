import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import CheckoutModal from '../../components/CheckoutModal';
import { useToast } from '../../components/ToastContext';
import { format, parseISO } from 'date-fns';
import SaleSubscription from '../../components/SaleSubscription';
import CSVImportModal from '../../components/CSVImportModal';
import SaleShareButton from '../../components/SaleShareButton';
import SaleQRCode from '../../components/SaleQRCode';
import SaleMap from '../../components/SaleMap';
import Skeleton from '../../components/Skeleton';
import BadgeDisplay from '../../components/BadgeDisplay';
import OrganizerTierBadge from '../../components/OrganizerTierBadge'; // Phase 31: Tier Rewards
import AuctionCountdown from '../../components/AuctionCountdown';
import PhotoLightbox from '../../components/PhotoLightbox';
import SaleTourGallery from '../../components/SaleTourGallery';
import { getThumbnailUrl, getOptimizedUrl, getLqipUrl } from '../../lib/imageUtils';
import ReviewsSection from '../../components/ReviewsSection';
import FlashDealBanner from '../../components/FlashDealBanner';
import PickupBookingCard from '../../components/PickupBookingCard';
import ActivityFeed from '../../components/ActivityFeed';
import FollowOrganizerButton from '../../components/FollowOrganizerButton'; // Phase 17

interface Sale {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  status?: string;
  photoUrls: string[];
  organizer: {
    id: string;
    userId: string;
    businessName: string;
    phone: string;
    address: string;
    tier?: 'BRONZE' | 'SILVER' | 'GOLD'; // Phase 31: Tier Rewards
    badges?: Array<{
      id: string;
      name: string;
      description: string;
      iconUrl?: string;
    }>;
    avgRating?: number;
    reviewCount?: number;
  };
  items: {
    id: string;
    title: string;
    description: string;
    price: number;
    auctionStartPrice: number;
    currentBid: number;
    bidIncrement: number;
    auctionEndTime: string;
    status: string;
    category?: string;
    condition?: string;
    photoUrls: string[];
  }[];
  isAuctionSale: boolean;
}

interface Bid {
  id: string;
  amount: number;
  user: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
}

const SaleDetailPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [checkoutItem, setCheckoutItem] = useState<{ id: string; title: string } | null>(null);
  const [bidAmounts, setBidAmounts] = useState<{ [itemId: string]: string }>({});
  const [biddingItemId, setBiddingItemId] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);