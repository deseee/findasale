import { useState } from 'react';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { prisma } from '../../../packages/database';

interface Item {
  id: string;
  title: string;
  description: string;
  estimatedValue: number;
  currentBid: number;
  photoUrls: string[];
  status: string;
  auctionEndTime?: string;
  isFavorite?: boolean;
}

interface ItemDetailProps {
  item: Item;
}

export default function ItemDetailPage({ item }: ItemDetailProps) {
  const [isFavorite, setIsFavorite] = useState(item.isFavorite || false);
  const [currentPhoto, setCurrentPhoto] = useState(0);
  const [bidAmount, setBidAmount] = useState('');

  // Auction countdown timer
  const getCountdownText = (): string => {
    if (!item.auctionEndTime) return 'Not active';
    const endTime = new Date(item.auctionEndTime).getTime();
    const now = Date.now();
    const diff = endTime - now;

    if (diff <= 0) return 'Auction ended';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days} days, ${hours} hours, ${minutes} minutes remaining`;
    return `${hours} hours, ${minutes} minutes remaining`;
  };

  // Price formatting
  const formatPrice = (price: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  return (
    <>
      <Head>
        <title>{item.title} — FindA.Sale</title>
        <meta name="description" content={item.description} />
      </Head>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Photo Gallery */}
          <div>
            <div className="bg-gray-200 rounded-lg overflow-hidden mb-4">
              <img
                src={item.photoUrls[currentPhoto]}
                alt={item.title}
                className="w-full h-96 object-cover"
              />
            </div>
            <div className="flex gap-2">
              {item.photoUrls.map((url, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentPhoto(idx)}
                  className={`w-20 h-20 rounded-lg overflow-hidden border-2 ${
                    currentPhoto === idx ? 'border-blue-600' : 'border-gray-300'
                  }`}
                >
                  <img src={url} alt={`${item.title} ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          {/* Item Details */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{item.title}</h1>
            <p className="text-gray-600 mb-4">{item.description}</p>

            <div className="bg-blue-50 rounded-lg p-6 mb-6">
              <p className="text-sm text-gray-600 mb-1">Current Bid</p>
              <p className="text-4xl font-bold text-gray-900 mb-4">{formatPrice(item.currentBid)}</p>
              <p className="text-sm text-gray-600 mb-4">Estimated Value: {formatPrice(item.estimatedValue)}</p>
            </div>

            {/* Auction Countdown */}
            <div className="bg-orange-50 rounded-lg p-4 mb-6 border border-orange-200">
              <p className="text-orange-700 font-semibold">{getCountdownText()}</p>
            </div>

            {/* Bid Input */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Place a Bid</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  placeholder={`Minimum: ${formatPrice(item.currentBid + 10)}`}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
                  Bid Now
                </button>
              </div>
            </div>

            {/* Favorite Toggle */}
            <button
              onClick={() => setIsFavorite(!isFavorite)}
              className={`w-full py-2 px-4 rounded-lg font-medium ${
                isFavorite
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {isFavorite ? '\u2665 Favorited' : '\u2661 Add to Favorites'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<ItemDetailProps> = async ({ params }) => {
  try {
    const item = await prisma.item.findUnique({
      where: { id: params?.id as string },
    });

    if (!item) {
      return { notFound: true };
    }

    return {
      props: {
        item: {
          ...item,
          photoUrls: item.photoUrls || [],
        },
      },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Error fetching item:', error);
    return { notFound: true };
  }
};
