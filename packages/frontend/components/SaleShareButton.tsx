import React, { useState } from 'react';
import { useToast } from './ToastContext';

interface SaleShareButtonProps {
  saleId: string;
  saleTitle: string;
  saleDate: string;
  saleLocation: string;
  userId?: string;
}

const SaleShareButton: React.FC<SaleShareButtonProps> = ({
  saleId,
  saleTitle,
  saleDate,
  saleLocation,
  userId
}) => {
  const { showToast } = useToast();
  
  // Generate referral URL
  const referralUrl = userId 
    ? `${window.location.origin}/sales/${saleId}?ref=${userId}`
    : `${window.location.origin}/sales/${saleId}`;

  const handleShare = async () => {
    const shareData = {
      title: saleTitle,
      text: `Check out this sale: ${saleTitle} on ${saleDate} at ${saleLocation}`,
      url: referralUrl,
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
      await navigator.clipboard.writeText(referralUrl);
      showToast('Link copied!', 'success');
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback: select text and prompt user to copy
      const textArea = document.createElement('textarea');
      textArea.value = referralUrl;
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
      className="flex items-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
        <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47C13.456 7.68 14.19 8 15 8z" />
      </svg>
      Share
    </button>
  );
};

export default SaleShareButton;
