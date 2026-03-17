import React, { useState } from 'react';
import { useSubmitPhoto } from '../hooks/useUGCPhotos';

interface UGCPhotoSubmitButtonProps {
  saleId?: number;
  itemId?: number;
  onSuccess?: () => void;
}

export default function UGCPhotoSubmitButton({
  saleId,
  itemId,
  onSuccess,
}: UGCPhotoSubmitButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const submitMutation = useSubmitPhoto();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!photoUrl) {
      alert('Please enter a photo URL');
      return;
    }

    if (!saleId && !itemId) {
      alert('Sale or item context is required');
      return;
    }

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    try {
      await submitMutation.mutateAsync({
        photoUrl,
        caption: caption || undefined,
        tags: tags.length > 0 ? tags : undefined,
        saleId: saleId ? saleId : undefined,
        itemId: itemId ? itemId : undefined,
      });

      // Reset form
      setPhotoUrl('');
      setCaption('');
      setTagsInput('');
      setIsOpen(false);

      if (onSuccess) onSuccess();
    } catch (error) {
      alert('Failed to submit photo. Please try again.');
      console.error(error);
    }
  };

  return (
    <>
      {/* Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-white border-2 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
        style={{ borderColor: '#8FB897' }}
      >
        <span>📸</span>
        Tag Your Find
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Tag Your Find</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Photo URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Photo URL
                </label>
                <input
                  type="url"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="https://example.com/photo.jpg"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              {/* Caption */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Caption (optional)
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Tell us about your find..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tags (comma-separated, optional)
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g., vintage, furniture, mid-century"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Note */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700">
                  📋 Photos are reviewed before appearing publicly. Ensure your photo
                  follows our community guidelines.
                </p>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitMutation.isPending}
                  className="flex-1 px-4 py-2 text-white rounded-lg hover:opacity-90 transition-opacity font-medium disabled:opacity-50"
                  style={{ backgroundColor: '#8FB897' }}
                >
                  {submitMutation.isPending ? 'Submitting...' : 'Submit Photo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
