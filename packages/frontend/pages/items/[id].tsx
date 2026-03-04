/**
 * Item Detail Page
 *
 * Displays:
 * - Item photos (carousel or gallery)
 * - Title, description, price/bid info
 * - Place bid or buy buttons
 * - Related items from the same sale
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import BidModal from '../../components/BidModal';
import CheckoutModal from '../../components/CheckoutModal';
import AuctionCountdown from '../../components/AuctionCountdown';
import Head from 'next/head';
import Link from 'next/link';

const ItemDetailPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const [showBidModal, setShowBidModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [currentBid, setCurrentBid] = useState(0);

  const { data: item, isLoading, isError } = useQuery({
    queryKey: ['item', id],
    queryFn: async () => {
      const response = await api.get(`/items/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (isError || !item) return <div className="min-h-screen flex items-center justify-center">Item not found</div>;

  const isSoldOut = item.status === 'SOLD';
  const isAuction = !!item.auctionEndTime;
  const isActive = item.status === 'ACTIVE';

  return (
    <>
      <Head>
        <title>{item.title} - FindA.Sale</title>
        <meta name="description" content={item.description} />
      </Head>

      <div className="min-h-screen bg-white">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <Link href={`/sales/${item.saleId}`} className="text-amber-600 hover:underline text-sm font-medium mb-4 inline-block">
            Back to sale
          </Link>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Image Section */}
            <div>
              {item.photoUrls && item.photoUrls.length > 0 ? (
                <img
                  src={item.photoUrls[0]}
                  alt={item.title}
                  className="w-full h-96 object-cover rounded-lg shadow-md"
                />
              ) : (
                <div className="w-full h-96 bg-warm-200 rounded-lg flex items-center justify-center">
                  <span className="text-warm-400">No image available</span>
                </div>
              )}
              {item.photoUrls && item.photoUrls.length > 1 && (
                <div className="mt-4 flex gap-2 overflow-x-auto">
                  {item.photoUrls.map((url: string, index: number) => (
                    <img
                      key={index}
                      src={url}
                      alt={`${item.title} ${index + 1}`}
                      className="h-20 w-20 object-cover rounded cursor-pointer opacity-75 hover:opacity-100"
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Details Section */}
            <div>
              <h1 className="text-3xl font-bold text-warm-900 mb-2">{item.title}</h1>
              <p className="text-warm-600 mb-6">{item.description}</p>

              {/* Status and Pricing */}
              <div className="bg-warm-50 p-6 rounded-lg mb-6">
                {isAuction ? (
                  <>
                    <AuctionCountdown endTime={item.auctionEndTime} />
                    <div className="mt-4">
                      <p className="text-sm text-warm-600">Current bid</p>
                      <p className="text-2xl font-bold text-warm-900">
                        ${(item.currentBid ?? item.auctionStartPrice ?? 0).toFixed(2)}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-warm-600">Price</p>
                    <p className="text-2xl font-bold text-warm-900">${Number(item.price).toFixed(2)}</p>
                  </>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4">
                {isSoldOut ? (
                  <button disabled className="flex-1 bg-warm-300 text-warm-500 font-bold py-3 px-6 rounded-lg cursor-not-allowed">
                    Sold Out
                  </button>
                ) : isAuction ? (
                  <button
                    onClick={() => setShowBidModal(true)}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                  >
                    Place Bid
                  </button>
                ) : isActive ? (
                  <button
                    onClick={() => setShowCheckoutModal(true)}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                  >
                    Buy Now
                  </button>
                ) : null}
              </div>

              {/* Additional Info */}
              <div className="mt-8 border-t pt-6">
                <h3 className="font-semibold text-warm-900 mb-2">Sale Details</h3>
                <p className="text-sm text-warm-600">
                  Part of <Link href={`/sales/${item.saleId}`} className="text-amber-600 hover:underline">{item.saleName}</Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showBidModal && item && (
        <BidModal
          item={item}
          onClose={() => setShowBidModal(false)}
          onBidPlaced={(newBid) => {
            setCurrentBid(newBid);
            setShowBidModal(false);
          }}
        />
      )}

      {showCheckoutModal && (
        <CheckoutModal
          itemId={item.id}
          itemTitle={item.title}
          onClose={() => setShowCheckoutModal(false)}
          onSuccess={() => {
            setShowCheckoutModal(false);
            router.push('/shopper/purchases');
          }}
        />
      )}
    </>
  );
};

export default ItemDetailPage;
