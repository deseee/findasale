import React, { useState } from 'react';

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
  const [showCopyFeedback, setShowCopyFeedback] = useState(false);
  
  // Generate referral URL
  const referralUrl = userId 
    ? `${window.location.origin}/sales/${saleId}?ref=${userId}`
    : `${window.location.origin}/sales/${saleId}`;

  const handleShare = async () => {
    const shareData = {
      title: saleTitle,
      text: `Check out this estate sale: ${saleTitle} on ${saleDate} at ${saleLocation}`,
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
      setShowCopyFeedback(true);
      setTimeout(() => setShowCopyFeedback(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback: select text and prompt user to copy
      const textArea = document.createElement('textarea');
      textArea.value = referralUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setShowCopyFeedback(true);
      setTimeout(() => setShowCopyFeedback(false), 2000);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleShare}
        className="flex items-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
          <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47C13.456 7.68 14.19 8 15 8z" />
        </svg>
        Share
      </button>
      
      {showCopyFeedback && (
        <div className="absolute top-full mt-2 right-0 bg-warm-800 text-white text-sm py-2 px-3 rounded shadow-lg">
          Link copied to clipboard!
        </div>
      )}
    </div>
  );
};

export default SaleShareButton;
