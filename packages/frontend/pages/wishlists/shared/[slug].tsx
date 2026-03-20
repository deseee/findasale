import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../../lib/api';
import { getThumbnailUrl } from '../../../lib/imageUtils';

interface WishlistItem {
  id: string;
  itemId: string;
  note?: string;
  addedAt: string;
  item: {
    id: string;
    title: string;
    price?: number;
    auctionStartPrice?: number;
    photoUrls: string[];
    sale: {
      id: string;
      title: string;
    };
  };
}

interface Wishlist {
  id: string;
  name: string;
  occasion?: string;
  items: WishlistItem[];
  user: {
    id: string;
    name: string;
    email: string;
  };
}

const occasionLabels: Record<string, string> = {
  moving: 'Moving',
  downsizing: 'Downsizing',
  decorating: 'Decorating',
  gifting: 'Gifting',
  other: 'Other',
};

const SharedWishlistPage = () => {
  const router = useRouter();
  const { slug } = router.query;

  const { data: wishlist, isLoading, isError } = useQuery({
    queryKey: ['public-wishlist', slug],
    queryFn: async () => {
      if (!slug) throw new Error('No slug provided');
      const response = await api.get(`/wishlists/public/${slug}`);
      return response.data as Wishlist;
    },
    enabled: !!slug,
  });

  if (!slug) {
    return <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">Loading...</div>;
  }

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">Loading wishlist...</div>;
  }

  if (isError || !wishlist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-warm-50 dark:bg-gray-900 gap-4">
        <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100">Wishlist Not Found</h1>
        <p className="text-warm-600 dark:text-warm-400">This wishlist doesn't exist or is private.</p>
        <Link href="/" className="text-amber-600 hover:text-amber-700 font-medium">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
      <Head>
        <title>{wishlist.name} - FindA.Sale</title>
        <meta name="description" content={`Check out ${wishlist.user.name}'s "${wishlist.name}" wishlist on FindA.Sale`} />
      </Head>

      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <Link href="/" className="inline-flex items-center text-amber-600 hover:text-amber-800 mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back to FindA.Sale
        </Link>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8">
          {/* Wishlist Info */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">{wishlist.name}</h1>
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="text-sm text-warm-600 dark:text-warm-400">Created by</p>
                <p className="font-semibold text-warm-900 dark:text-warm-100">{wishlist.user.name}</p>
              </div>
              {wishlist.occasion && (
                <div>
                  <span className="inline-block bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm font-medium">
                    {occasionLabels[wishlist.occasion] || wishlist.occasion}
                  </span>
                </div>
              )}
              <div className="text-sm text-warm-600 dark:text-warm-400">
                {wishlist.items.length} item{wishlist.items.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          {/* Items Grid */}
          {wishlist.items.length === 0 ? (
            <div className="text-center py-12 text-warm-600 dark:text-warm-400">
              <p className="text-lg">This wishlist is empty.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {wishlist.items.map((wishlistItem) => (
                <Link
                  key={wishlistItem.id}
                  href={`/items/${wishlistItem.item.id}`}
                  className="group bg-warm-50 dark:bg-gray-900 rounded-lg overflow-hidden border border-warm-200 dark:border-gray-700 hover:shadow-md transition-shadow"
                >
                  {/* Item Photo */}
                  <div className="relative w-full h-32 bg-warm-200 overflow-hidden">
                    {wishlistItem.item.photoUrls.length > 0 ? (
                      <img
                        src={getThumbnailUrl(wishlistItem.item.photoUrls[0]) || wishlistItem.item.photoUrls[0]}
                        alt={wishlistItem.item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-warm-400">
                        No photo
                      </div>
                    )}
                  </div>

                  {/* Item Info */}
                  <div className="p-3">
                    <h3 className="font-semibold text-sm text-warm-900 dark:text-warm-100 truncate group-hover:text-amber-600">
                      {wishlistItem.item.title}
                    </h3>
                    <p className="text-xs text-warm-600 dark:text-warm-400 mt-1 truncate">
                      {wishlistItem.item.sale.title}
                    </p>
                    {(wishlistItem.item.price || wishlistItem.item.auctionStartPrice) && (
                      <p className="text-sm font-semibold text-amber-600 mt-2">
                        ${(wishlistItem.item.price || wishlistItem.item.auctionStartPrice)?.toFixed(2)}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* CTA Footer */}
        <div className="text-center">
          <p className="text-warm-600 dark:text-warm-400 mb-4">Want to create your own wishlist?</p>
          <Link href="/wishlists" className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors">
            Create a Wishlist
          </Link>
        </div>
      </main>
    </div>
  );
};

export default SharedWishlistPage;
