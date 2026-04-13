import React, { useState } from 'react';
import api from '../lib/api';

interface CSVImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleId: string;
  onImportComplete: () => void;
}

const CSVImportModal: React.FC<CSVImportModalProps> = ({ isOpen, onClose, saleId, onImportComplete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setUploadResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setUploadResult({ success: false, message: 'Please select a CSV file to upload' });
      return;
    }

    setIsUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('csv', file);

      const response = await api.post(`/items/${saleId}/import-items`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setUploadResult({ success: true, message: response.data.message });
      onImportComplete();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Failed to import items';
      setUploadResult({ success: false, message: errorMessage });
    } finally {
      setIsUploading(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = `title,description,price,auctionStartPrice,bidIncrement,auctionEndTime,status,photoUrls
Example Item 1,This is a sample item description,25.99,,,,AVAILABLE,https://example.com/image1.jpg
Example Item 2,Auction item example,,50.00,5.00,2026-12-31T23:59:59Z,AUCTION_ENDED,"https://example.com/image2.jpg,https://example.com/image3.jpg"
Example Item 3,Another sample item,100.00,,,,SOLD,`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'items-template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-warm-900 dark:text-warm-100">Import Items from CSV</h3>
          <button
            onClick={onClose}
            className="text-warm-500 dark:text-warm-400 hover:text-warm-700 dark:hover:text-warm-200"
            aria-label="Close modal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="mb-4">
          <p className="text-warm-600 dark:text-warm-400 mb-4">
            Upload a CSV file to bulk import items for this sale.
          </p>
          
          <button
            onClick={downloadTemplate}
            className="text-amber-600 hover:text-amber-800 text-sm font-medium mb-4 inline-flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download CSV Template
          </button>
          
          <div className="border-2 border-dashed border-warm-300 dark:border-gray-600 rounded-lg p-6 text-center dark:bg-gray-700/30">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              id="csv-upload"
            />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <div className="flex flex-col items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-warm-400 dark:text-warm-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="mt-2 text-sm text-warm-600 dark:text-warm-400">
                  <span className="font-medium text-amber-600">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-warm-500 dark:text-warm-400">
                  CSV file up to 10MB
                </p>
              </div>
            </label>
          </div>
          
          {file && (
            <div className="mt-2 text-sm text-warm-600 dark:text-warm-400">
              Selected file: {file.name}
            </div>
          )}
        </div>
        
        {uploadResult && (
          <div className={`rounded-md p-3 mb-4 ${uploadResult.success ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
            {uploadResult.message}
          </div>
        )}
        
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-md text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50"
          >
            {isUploading ? 'Uploading...' : 'Import Items'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CSVImportModal;
