import React, { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface QrCodeModalProps {
  itemId: string;
  itemTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function QrCodeModal({
  itemId,
  itemTitle,
  isOpen,
  onClose,
}: QrCodeModalProps) {
  const { showToast } = useToast();
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // Fetch QR code image
  const { data: qrImageData, isLoading } = useQuery({
    queryKey: ['qrCode', itemId],
    queryFn: async () => {
      const response = await api.get(`/items/${itemId}/qr`, {
        responseType: 'blob',
      });
      return URL.createObjectURL(response.data as Blob);
    },
    enabled: isOpen,
    staleTime: Infinity,
  });

  const handleDownloadQr = async () => {
    if (!qrImageData) return;
    try {
      const link = document.createElement('a');
      link.href = qrImageData;
      link.download = `${itemTitle}-qr-code.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('QR code downloaded successfully', 'success');
    } catch (error) {
      console.error('Download error:', error);
      showToast('Failed to download QR code', 'error');
    }
  };

  const handleCopyQrImage = async () => {
    if (!qrImageData) return;
    try {
      const response = await fetch(qrImageData);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      showToast('QR code copied to clipboard', 'success');
    } catch (error) {
      console.error('Copy error:', error);
      showToast('Failed to copy QR code', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
          Item QR Code
        </h2>

        <p className="text-gray-600 dark:text-gray-400 mb-4">{itemTitle}</p>

        {isLoading ? (
          <div className="bg-gray-100 dark:bg-gray-700 h-72 w-72 mx-auto rounded-lg animate-pulse flex items-center justify-center">
            <p className="text-gray-500 dark:text-gray-400">Generating QR...</p>
          </div>
        ) : qrImageData ? (
          <div className="flex justify-center mb-6">
            <img
              src={qrImageData}
              alt="QR Code"
              className="border-2 border-gray-300 dark:border-gray-600 rounded-lg"
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          </div>
        ) : null}

        <div className="flex gap-3 flex-col">
          <button
            onClick={handleDownloadQr}
            disabled={isLoading || !qrImageData}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            📥 Download QR
          </button>

          <button
            onClick={handleCopyQrImage}
            disabled={isLoading || !qrImageData}
            className="w-full bg-gray-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            📋 Copy QR
          </button>

          <button
            onClick={onClose}
            className="w-full bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white py-2 px-4 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition"
          >
            Close
          </button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 text-center">
          QR scans help shoppers find and engage with items. Each scan awards bonus XP!
        </p>
      </div>
    </div>
  );
}
