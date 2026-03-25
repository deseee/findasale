import React from 'react';
import Link from 'next/link';

interface HaulPost {
  id: number;
  photoUrl: string;
  caption: string | null;
  likesCount: number;
  createdAt: string;
  user?: { id: string; name: string | null };
  sale?: { id: string; title: string } | null;
}

interface Props {
  haul: HaulPost;
  onLike: (id: number) => Promise<void>;
  isLiked?: boolean;
  isLoadingLike?: boolean;
}

const HaulPostCard: React.FC<Props> = ({ haul, onLike, isLiked = false, isLoadingLike = false }) => {
  const handleLikeClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await onLike(haul.id);
    } catch (err) {
      console.error('Error toggling like:', err);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden hover:shadow-lg transition-shadow">
      <img src={haul.photoUrl} alt="Haul" className="w-full h-48 object-cover" />
      <div className="p-4">
        {haul.caption && (
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 line-clamp-2">{haul.caption}</p>
        )}
        {haul.sale && (
          <Link href={`/sales/${haul.sale.id}`}>
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-2 hover:underline">From: {haul.sale.title}</p>
          </Link>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            by {haul.user?.name || 'Anonymous'}
          </span>
          <button
            onClick={handleLikeClick}
            disabled={isLoadingLike}
            className={`flex items-center gap-1 text-sm font-medium transition-colors ${
              isLiked
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400'
            } ${isLoadingLike ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={isLiked ? 'Unlike' : 'Like'}
          >
            {isLoadingLike ? (
              <span className="animate-spin">♥️</span>
            ) : isLiked ? (
              '❤️'
            ) : (
              '🤍'
            )}
            <span>{haul.likesCount}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default HaulPostCard;
