import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { useCart } from '@findasale/shared';
import { useHeartAnimation } from '@/hooks/useHeartAnimation';
import Image from 'next/image';
import Link from 'next/link';
import { io as socketIO } from 'socket.io-client';
import { useQuery, useMutation } from '@tanstack/react-query';
import apiClient from '@/lib/apiClient';
import { showToast } from '@/lib/toast';
import { useHaptics } from '@/hooks/useHaptics';

const ItemPage = () => {
  const router = useRouter();
  const { id } = router.query;

  const [itemData, setItemData] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isFavoriteLoading, setIsFavoriteLoading] = useState(false);
  const [liveBidPrice, setLiveBidPrice] = useState(null);
  const [currentBid, setCurrentBid] = useState(null);
  const [biddingStatus, setBiddingStatus] = useState('idle');
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const { addToCart } = useCart();
  const { triggerHaptics } = useHaptics();
  const socketRef = useRef(null);

  // Fetch item details
  const { data: item, isLoading, error } = useQuery({
    queryKey: ['item', id],
    queryFn: async () => {
      const response = await apiClient.get(`/items/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  // Update favorite status
  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      if (isFavorite) {
        await apiClient.delete(`/items/${id}/favorite`);
      } else {
        await apiClient.post(`/items/${id}/favorite`);
      }
    },
    onSuccess: () => {
      setIsFavorite(!isFavorite);
      triggerHeartAnimation();
      triggerHaptics('light');
    },
    onError: () => {
      showToast('Failed to update favorite', 'error');
    },
  });

  // Add to cart mutation
  const addToCartMutation = useMutation({
    mutationFn: async (quantity: number) => {
      return await apiClient.post(`/cart/add`, {
        itemId: id,
        quantity,
      });
    },
    onSuccess: () => {
      addToCart({
        id: item?.id || '',
        name: item?.name || '',
        price: item?.price || 0,
        quantity: 1,
      });
      showToast('Item added to cart', 'success');
      setShowCheckoutModal(true);
    },
    onError: () => {
      showToast('Failed to add to cart', 'error');
    },
  });

  // Animation hook
  const { triggerAnimation: triggerHeartAnimation } = useHeartAnimation();

  // Setup socket for live bidding
  useEffect(() => {
    if (!id) return;

    const newSocket = socketIO(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001', {
      query: { itemId: id },
    });

    newSocket.on('bid-update', (data) => {
      setLiveBidPrice(data.price);
      setCurrentBid(data);
    });

    newSocket.on('bid-won', () => {
      setBiddingStatus('won');
      showToast('You won the bid!', 'success');
      triggerHaptics('heavy');
    });

    newSocket.on('bid-outbid', () => {
      setBiddingStatus('outbid');
      showToast('You have been outbid', 'warning');
      triggerHaptics('medium');
    });

    socketRef.current = newSocket;

    return () => {
      newSocket.disconnect();
    };
  }, [id, triggerHaptics]);

  // Sync favorite status from item data
  useEffect(() => {
    if (item) {
      setIsFavorite(item.isFavorite || false);
    }
  }, [item]);

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (error || !item) {
    return <div className="text-center py-8 text-red-600">Item not found</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Link href="/items" className="text-blue-600 hover:underline mb-4 inline-block">
        ← Back to items
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Image Section */}
        <div className="flex justify-center items-center bg-gray-100 rounded-lg p-4">
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt={item.name}
              width={400}
              height={400}
              className="object-contain"
            />
          ) : (
            <div className="text-gray-500">No image available</div>
          )}
        </div>

        {/* Details Section */}
        <div className="flex flex-col justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-4">{item.name}</h1>
            <p className="text-gray-700 mb-4">{item.description}</p>

            {/* Price Section */}
            <div className="bg-blue-50 p-4 rounded-lg mb-6">
              <p className="text-sm text-gray-600">Starting Price</p>
              <p className="text-2xl font-bold text-blue-600">${item.price.toFixed(2)}</p>
              {liveBidPrice && (
                <p className="text-sm text-green-600 mt-2">Current bid: ${liveBidPrice.toFixed(2)}</p>
              )}
            </div>

            {/* Favorite Button */}
            <button
              onClick={() => toggleFavoriteMutation.mutate()}
              disabled={isFavoriteLoading || toggleFavoriteMutation.isPending}
              className={`mb-4 px-6 py-2 rounded-lg font-semibold transition ${
                isFavorite
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
            >
              {isFavorite ? '♥ Favorited' : '♡ Favorite'}
            </button>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={() => addToCartMutation.mutate(1)}
              disabled={addToCartMutation.isPending}
              className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 transition disabled:opacity-50"
            >
              {addToCartMutation.isPending ? 'Adding...' : 'Add to Cart'}
            </button>
            <button
              onClick={() => setShowCheckoutModal(true)}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition"
            >
              Buy Now
            </button>
          </div>
        </div>
      </div>

      {/* Checkout Modal */}
      {showCheckoutModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full">
            <h2 className="text-2xl font-bold mb-4">Confirm Purchase</h2>
            <p className="text-gray-700 mb-6">Proceed to checkout?</p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowCheckoutModal(false)}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => router.push('/checkout')}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemPage;
