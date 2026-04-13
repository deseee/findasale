import React from 'react';
import { useToast } from './ToastContext';

interface ItemShareButtonProps {
  itemId: string;
  itemTitle: string;
  itemPrice: number;
  userId?: string;
}

const ItemShareButton: React.FC<ItemShareButtonProps> = ({
  itemId,
  itemTitle,
  itemPrice,
  userId
}) => {
  const { showToast } = useToast();

  // Generate referral URL
  const shareUrl = typeof window !== 'undefined'
    ? userId
      ? `${window.location.origin}/items/${itemId}?ref=${userId}`
      : `${window.location.origin}/items/${itemId}`
    : '';

  const handleShare = async () => {
    const shareData = {
      title: itemTitle,
      text: `${itemTitle} — $${itemPrice.toFixed(2)}`,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await copyToClipboard();
      }
    } catch (err) {
      console.error('Error sharing:', err);
      await copyToClipboard();
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link copied!', 'success');
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback: select text and prompt user to copy
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showToast('Link copied!', 'success');
    }
  };

  return (
    <button
      onClick={handleShare}
      className="text-2xl focus:outline-none"
      aria-label="Share item"
      title="Share this item"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-6 text-amber-600"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47C13.456 7.68 14.19 8 15 8z" />
      </svg>
    </button>
  );
};

export default ItemShareButton;
