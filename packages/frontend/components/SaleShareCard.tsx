import React from 'react';
import { useToast } from './ToastContext';
import api from '../lib/api';

interface SaleShareCardProps {
  saleId: string;
  saleTitle: string;
  userId?: string;
}

const SaleShareCard: React.FC<SaleShareCardProps> = ({
  saleId,
  saleTitle,
  userId
}) => {
  const { showToast } = useToast();

  const referralUrl = userId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/sales/${saleId}?ref=${userId}`
    : `${typeof window !== 'undefined' ? window.location.origin : ''}/sales/${saleId}`;

  const fireShareRipple = () => {
    api.post(`/sales/${saleId}/ripples`, { type: 'SHARE' }).catch(() => { /* fire-and-forget */ });
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      showToast('Link copied!', 'success');
      fireShareRipple();
    } catch (err) {
      console.error('Failed to copy:', err);
      const textArea = document.createElement('textarea');
      textArea.value = referralUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showToast('Link copied!', 'success');
      fireShareRipple();
    }
  };

  const handleFacebookShare = () => {
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralUrl)}`;
    fireShareRipple();
    window.open(facebookUrl, 'facebook-share', 'width=600,height=400');
  };

  const handleTwitterShare = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(referralUrl)}&text=${encodeURIComponent(`Check out this sale: ${saleTitle}`)}`;
    fireShareRipple();
    window.open(twitterUrl, 'twitter-share', 'width=600,height=400');
  };

  const handleThreadsShare = () => {
    const threadsUrl = `https://www.threads.net/intent/post?text=${encodeURIComponent(`Check out this sale: ${saleTitle} - ${referralUrl}`)}`;
    fireShareRipple();
    window.open(threadsUrl, 'threads-share', 'width=600,height=400');
  };

  const handlePinterestShare = () => {
    const pinterestUrl = `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(referralUrl)}&description=${encodeURIComponent(saleTitle)}`;
    fireShareRipple();
    window.open(pinterestUrl, 'pinterest-share', 'width=600,height=400');
  };

  const handleNextdoorShare = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      showToast('Link copied for Nextdoor!', 'success');
      fireShareRipple();
      setTimeout(() => {
        window.open('https://nextdoor.com/news_feed/', 'nextdoor-share');
      }, 300);
    } catch (err) {
      console.error('Failed to copy:', err);
      showToast('Failed to copy link', 'error');
    }
  };

  const handleTikTokShare = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      showToast('Link copied for TikTok!', 'success');
      fireShareRipple();
      setTimeout(() => {
        window.open('https://www.tiktok.com/', 'tiktok-share');
      }, 300);
    } catch (err) {
      console.error('Failed to copy:', err);
      showToast('Failed to copy link', 'error');
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-6 mb-8">
      <h2 className="text-lg font-bold text-warm-900 dark:text-gray-100 mb-4">Share this sale</h2>

      {/* Copy Link — amber filled (primary action) */}
      <button
        onClick={copyToClipboard}
        className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-3 rounded mb-3 transition-colors text-sm"
      >
        Copy Link
      </button>

      {/* Social buttons — centered with platform brand colors */}
      <div className="space-y-1">
        <button
          onClick={handleFacebookShare}
          className="w-full text-center px-3 py-2 rounded text-sm font-medium transition-colors border-l-4 hover:shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 mb-1"
          style={{ borderLeftColor: '#1877F2' }}
        >
          Facebook
        </button>
        <button
          onClick={handleTwitterShare}
          className="w-full text-center px-3 py-2 rounded text-sm font-medium transition-colors border-l-4 hover:shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 mb-1"
          style={{ borderLeftColor: '#000000' }}
        >
          X/Twitter
        </button>
        <button
          onClick={handleThreadsShare}
          className="w-full text-center px-3 py-2 rounded text-sm font-medium transition-colors border-l-4 hover:shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 mb-1"
          style={{ borderLeftColor: '#000000' }}
        >
          Threads
        </button>
        <button
          onClick={handlePinterestShare}
          className="w-full text-center px-3 py-2 rounded text-sm font-medium transition-colors border-l-4 hover:shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 mb-1"
          style={{ borderLeftColor: '#E60023' }}
        >
          Pinterest
        </button>
        <button
          onClick={handleNextdoorShare}
          className="w-full text-center px-3 py-2 rounded text-sm font-medium transition-colors border-l-4 hover:shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 mb-1"
          style={{ borderLeftColor: '#8FBC48' }}
        >
          Nextdoor
        </button>
        <button
          onClick={handleTikTokShare}
          className="w-full text-center px-3 py-2 rounded text-sm font-medium transition-colors border-l-4 hover:shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
          style={{ borderLeftColor: '#010101' }}
        >
          TikTok
        </button>
      </div>
    </div>
  );
};

export default SaleShareCard;
