import React, { useState, useRef } from 'react';
import api from '../lib/api';

interface VisualSearchButtonProps {
  onResults?: (data: { detectedLabels: string[]; results: any[] }) => void;
}

const VisualSearchButton: React.FC<VisualSearchButtonProps> = ({ onResults }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setPreviewUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload and search
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('photo', file);

      const response = await api.post('/search/visual', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      onResults?.(response.data);
    } catch (err: any) {
      console.error('Visual search error:', err);
      setError(err.response?.data?.error || 'Failed to analyze image. Please try another.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleClearPreview = () => {
    setPreviewUrl(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleButtonClick}
        disabled={isLoading}
        className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:from-warm-300 disabled:to-warm-300 text-white font-semibold rounded-xl transition-all"
        aria-label="Search by photo"
      >
        <span className="text-lg">📷</span>
        <span>Search by Photo</span>
        {isLoading && <span className="ml-2 inline-block animate-spin">⏳</span>}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        aria-hidden="true"
      />

      {previewUrl && (
        <div className="mt-3 p-3 border-2 border-amber-200 rounded-lg bg-warm-50">
          <div className="flex gap-3">
            <img
              src={previewUrl}
              alt="Search preview"
              className="w-16 h-16 rounded object-cover"
            />
            <div className="flex-1 flex flex-col justify-center">
              <p className="text-sm font-medium text-warm-900">Photo selected</p>
              {isLoading && (
                <p className="text-xs text-warm-500 mt-1">Analyzing image...</p>
              )}
              {!isLoading && onResults && (
                <button
                  type="button"
                  onClick={handleClearPreview}
                  className="text-xs text-amber-600 hover:text-amber-700 font-medium mt-1"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
};

export default VisualSearchButton;
