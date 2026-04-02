import React, { useState, useRef, useEffect } from 'react';
import { useToast } from './ToastContext';
import api from '../lib/api';

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
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Generate referral URL
  const referralUrl = userId
    ? `${window.location.origin}/sales/${saleId}?ref=${userId}`
    : `${window.location.origin}/sales/${saleId}`;

  // Fire SHARE ripple event
  const fireShareRipple = () => {
    api.post(`/sales/${saleId}/ripples`, { type: 'SHARE' }).catch(() => { /* fire-and-forget */ });
  };

  // Close popover on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      showToast('Link copied!', 'success');
      fireShareRipple();
      setIsOpen(false);
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
      fireShareRipple();
      setIsOpen(false);
    }
  };

  const handleFacebookShare = () => {
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralUrl)}`;
    fireShareRipple();
    window.open(facebookUrl, 'facebook-share', 'width=600,height=400');
    setIsOpen(false);
  };

  const handleTwitterShare = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(referralUrl)}&text=${encodeURIComponent(`Check out this sale: ${saleTitle}`)}`;
    fireShareRipple();
    window.open(twitterUrl, 'twitter-share', 'width=600,height=400');
    setIsOpen(false);
  };

  const handleNextdoorShare = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      showToast('Link copied for Nextdoor!', 'success');
      fireShareRipple();
      setTimeout(() => {
        window.open('https://nextdoor.com/news_feed/', 'nextdoor-share');
      }, 300);
      setIsOpen(false);
    } catch (err) {
      console.error('Failed to copy:', err);
      showToast('Failed to copy link', 'error');
    }
  };

  const handleThreadsShare = () => {
    const threadsUrl = `https://www.threads.net/intent/post?text=${encodeURIComponent(`Check out this sale: ${saleTitle} - ${referralUrl}`)}`;
    fireShareRipple();
    window.open(threadsUrl, 'threads-share', 'width=600,height=400');
    setIsOpen(false);
  };

  const handlePinterestShare = () => {
    const pinterestUrl = `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(referralUrl)}&description=${encodeURIComponent(saleTitle)}`;
    fireShareRipple();
    window.open(pinterestUrl, 'pinterest-share', 'width=600,height=400');
    setIsOpen(false);
  };

  const handleTikTokShare = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      showToast('Link copied for TikTok!', 'success');
      fireShareRipple();
      setTimeout(() => {
        window.open('https://www.tiktok.com/', 'tiktok-share');
      }, 300);
      setIsOpen(false);
    } catch (err) {
      console.error('Failed to copy:', err);
      showToast('Failed to copy link', 'error');
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
          <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47C13.456 7.68 14.19 8 15 8z" />
        </svg>
        Share
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="p-4">
            {/* Header with close button */}
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Share this sale</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Copy Link - Primary Action */}
            <button
              onClick={copyToClipboard}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-3 rounded mb-3 transition-colors text-sm"
            >
              Copy Link
            </button>

            {/* Social Share Options */}
            <div className="border-t border-gray-200 pt-3">
              <p className="text-xs text-gray-500 mb-2">Or share on:</p>
              <button
                onClick={handleFacebookShare}
                className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm text-gray-700 font-medium transition-colors mb-1"
              >
                Facebook
              </button>
              <button
                onClick={handleTwitterShare}
                className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm text-gray-700 font-medium transition-colors mb-1"
              >
                X/Twitter
              </button>
              <button
                onClick={handleThreadsShare}
                className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm text-gray-700 font-medium transition-colors mb-1"
              >
                Threads
              </button>
              <button
                onClick={handlePinterestShare}
                className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm text-gray-700 font-medium transition-colors mb-1"
              >
                Pinterest
              </button>
              <button
                onClick={handleNextdoorShare}
                className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm text-gray-700 font-medium transition-colors mb-1"
              >
                Nextdoor
              </button>
              <button
                onClick={handleTikTokShare}
                className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm text-gray-700 font-medium transition-colors"
              >
                TikTok
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SaleShareButton;
