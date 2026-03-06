/**
 * SmartInventoryUpload.tsx — CD2 Phase 2
 *
 * Multi-step wizard for bulk photo upload + AI batch tagging.
 *
 * Step 1: Bulk Photo Drop (up to 20 images)
 * Step 2: Review & Edit Grid (inline editing + inclusion toggles)
 * Step 3: Save All (batch create items)
 */

import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface AIAnalysis {
  photoUrl: string;
  suggestedTitle: string;
  suggestedDescription: string;
  suggestedCategory: string;
  suggestedCondition: string;
  suggestedPrice: number;
  suggestedTags: string[];
  confidence: 'high' | 'medium' | 'low';
  error?: string;
}

interface AnalysisItem extends AIAnalysis {
  include: boolean;
  photoFile: File;
}

type WizardStep = 'upload' | 'review' | 'complete';

interface SmartInventoryUploadProps {
  saleId: string;
  onComplete?: () => void;
}

const CATEGORIES = [
  'Furniture',
  'Jewelry',
  'Art & Decor',
  'Clothing',
  'Kitchenware',
  'Tools & Hardware',
  'Collectibles',
  'Electronics',
  'Books & Media',
  'Other',
];

const CONDITIONS = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'POOR'];

const SmartInventoryUpload: React.FC<SmartInventoryUploadProps> = ({
  saleId,
  onComplete,
}) => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<WizardStep>('upload');
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisItem[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saveProgress, setSaveProgress] = useState(0);

  // Mutation: Upload to Cloudinary first
  const uploadPhotosMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('photos', file);
      });

      const response = await api.post('/upload/sale-photos', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data.urls || response.data.imageVariants?.map((v: any) => v.original) || [];
    },
    onError: () => {
      showToast('Failed to upload photos', 'error');
      setUploadProgress(0);
    },
  });

  // Mutation: Batch AI analysis
  const batchAnalyzeMutation = useMutation({
    mutationFn: async (imageUrls: string[]) => {
      const response = await api.post('/upload/batch-analyze', {
        imageUrls,
      });
      return response.data.results;
    },
    onError: () => {
      showToast('Failed to analyze photos', 'error');
      setUploadProgress(0);
    },
  });

  // Mutation: Create items in batch
  const createItemsMutation = useMutation({
    mutationFn: async (items: Array<{
      saleId: string;
      title: string;
      description: string;
      price: number;
      category: string;
      condition: string;
      photoUrls: string[];
    }>) => {
      const created = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        try {
          const response = await api.post('/items', item);
          created.push(response.data);
          setSaveProgress(((i + 1) / items.length) * 100);
        } catch (err) {
          console.error(`Failed to create item "${item.title}":`, err);
          // Continue with remaining items
        }
      }
      return created;
    },
    onSuccess: (created) => {
      showToast(
        `✓ ${created.length} items added to your sale!`,
        'success'
      );
      queryClient.invalidateQueries({ queryKey: ['sale-items', saleId] });
      setSaveProgress(0);
      setStep('complete');
      setPhotoFiles([]);
      setAnalyses([]);
    },
    onError: () => {
      showToast('Some items failed to save', 'error');
      setSaveProgress(0);
    },
  });

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    if (files.length > 20) {
      showToast('Maximum 20 photos per batch', 'error');
      return;
    }

    setPhotoFiles(files);
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 20) {
      showToast('Maximum 20 photos per batch', 'error');
      return;
    }
    setPhotoFiles(files);
  };

  // Analyze selected photos
  const handleAnalyzePhotos = async () => {
    if (photoFiles.length === 0) {
      showToast('Select at least one photo', 'error');
      return;
    }

    setUploadProgress(25);

    // Step 1: Upload to Cloudinary
    const uploadedUrls = await uploadPhotosMutation.mutateAsync(photoFiles);
    setUploadProgress(50);

    // Step 2: Batch AI analysis
    const aiResults = await batchAnalyzeMutation.mutateAsync(uploadedUrls);
    setUploadProgress(75);

    // Combine with photo files
    const itemsToReview = aiResults.map((analysis: AIAnalysis, idx: number) => ({
      ...analysis,
      include: true,
      photoFile: photoFiles[idx],
    }));

    setAnalyses(itemsToReview);
    setUploadProgress(100);
    setStep('review');
    setTimeout(() => setUploadProgress(0), 500);
  };

  // Update analysis item
  const updateAnalysisItem = (idx: number, updates: Partial<AnalysisItem>) => {
    const updated = [...analyses];
    updated[idx] = { ...updated[idx], ...updates };
    setAnalyses(updated);
  };

  // Remove analysis item
  const removeAnalysisItem = (idx: number) => {
    setAnalyses(analyses.filter((_, i) => i !== idx));
  };

  // Save all checked items
  const handleSaveAllItems = async () => {
    const itemsToCreate = analyses
      .filter((a) => a.include && !a.error)
      .map((a) => ({
        saleId,
        title: a.suggestedTitle,
        description: a.suggestedDescription,
        price: a.suggestedPrice,
        category: a.suggestedCategory,
        condition: a.suggestedCondition,
        photoUrls: [a.photoUrl],
      }));

    if (itemsToCreate.length === 0) {
      showToast('Select at least one item to save', 'error');
      return;
    }

    await createItemsMutation.mutateAsync(itemsToCreate);
  };

  // ─── STEP 1: Upload ───────────────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
          <h3 className="text-lg font-semibold text-warm-900 mb-2">
            📦 Smart Inventory Upload
          </h3>
          <p className="text-warm-600 mb-6">
            Drop up to 20 photos here. AI will analyze and create draft listings
            automatically.
          </p>

          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-blue-300 rounded-lg p-12 cursor-pointer hover:bg-blue-100 transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <p className="text-warm-600 font-medium">
              {photoFiles.length > 0
                ? `✓ ${photoFiles.length} photo${photoFiles.length !== 1 ? 's' : ''} selected`
                : 'Click or drag photos here'}
            </p>
            {photoFiles.length > 0 && (
              <p className="text-sm text-warm-500 mt-2">
                Click to add more or proceed to analysis
              </p>
            )}
          </div>

          {photoFiles.length > 0 && (
            <div className="mt-6 grid grid-cols-4 gap-4">
              {photoFiles.slice(0, 4).map((file, idx) => (
                <div key={idx} className="relative">
                  <img
                    src={URL.createObjectURL(file)}
                    alt={`Thumbnail ${idx + 1}`}
                    className="w-full h-20 object-cover rounded"
                  />
                  <span className="absolute bottom-1 right-1 bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {idx + 1}
                  </span>
                </div>
              ))}
              {photoFiles.length > 4 && (
                <div className="flex items-center justify-center bg-warm-100 rounded text-warm-600 font-semibold">
                  +{photoFiles.length - 4}
                </div>
              )}
            </div>
          )}

          {uploadProgress > 0 && (
            <div className="mt-6">
              <div className="w-full bg-warm-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-sm text-warm-600 mt-2">
                {uploadProgress < 50
                  ? 'Uploading photos...'
                  : uploadProgress < 75
                  ? 'Analyzing with AI...'
                  : 'Finalizing...'}
              </p>
            </div>
          )}

          <div className="mt-8 flex gap-3 justify-center">
            <button
              onClick={() => {
                setPhotoFiles([]);
                setUploadProgress(0);
              }}
              disabled={uploadPhotosMutation.isPending || batchAnalyzeMutation.isPending}
              className="px-6 py-2 border border-warm-300 rounded-lg text-warm-900 hover:bg-warm-100 disabled:opacity-50"
            >
              Clear
            </button>
            <button
              onClick={handleAnalyzePhotos}
              disabled={
                photoFiles.length === 0 ||
                uploadPhotosMutation.isPending ||
                batchAnalyzeMutation.isPending
              }
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg"
            >
              {uploadPhotosMutation.isPending || batchAnalyzeMutation.isPending
                ? 'Processing...'
                : 'Analyze All'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── STEP 2: Review ───────────────────────────────────────────────────────
  if (step === 'review') {
    const checkedCount = analyses.filter((a) => a.include).length;

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-warm-900 mb-4">
            Review & Edit Suggestions ({checkedCount} selected)
          </h3>
          <p className="text-warm-600 text-sm mb-4">
            Edit any field inline. Uncheck items to skip them.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {analyses.map((item, idx) => (
            <div
              key={idx}
              className={`border rounded-lg p-4 ${
                item.error
                  ? 'border-red-200 bg-red-50'
                  : item.include
                  ? 'border-blue-200 bg-blue-50'
                  : 'border-warm-200 bg-warm-50 opacity-60'
              }`}
            >
              {/* Photo */}
              <div className="mb-4">
                <img
                  src={item.photoUrl}
                  alt="Item preview"
                  className="w-full h-32 object-cover rounded"
                />
              </div>

              {item.error ? (
                <div className="p-3 bg-red-100 border border-red-300 rounded text-red-700 text-sm mb-4">
                  {item.error}
                </div>
              ) : (
                <>
                  {/* Title */}
                  <div className="mb-3">
                    <label className="text-xs font-semibold text-warm-900">
                      Title
                    </label>
                    <input
                      type="text"
                      value={item.suggestedTitle}
                      onChange={(e) =>
                        updateAnalysisItem(idx, {
                          suggestedTitle: e.target.value,
                        })
                      }
                      className="w-full px-2 py-1 border border-warm-300 rounded text-sm mt-1"
                    />
                  </div>

                  {/* Price */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <label className="text-xs font-semibold text-warm-900">
                        Price
                      </label>
                      <div className="relative">
                        <span className="absolute left-2 top-1.5 text-warm-600 text-sm">
                          $
                        </span>
                        <input
                          type="number"
                          value={item.suggestedPrice}
                          onChange={(e) =>
                            updateAnalysisItem(idx, {
                              suggestedPrice: parseFloat(e.target.value) || 0,
                            })
                          }
                          step="0.01"
                          min="0"
                          className="w-full pl-5 pr-2 py-1 border border-warm-300 rounded text-sm mt-1"
                        />
                      </div>
                    </div>

                    {/* Category */}
                    <div>
                      <label className="text-xs font-semibold text-warm-900">
                        Category
                      </label>
                      <select
                        value={item.suggestedCategory}
                        onChange={(e) =>
                          updateAnalysisItem(idx, {
                            suggestedCategory: e.target.value,
                          })
                        }
                        className="w-full px-2 py-1 border border-warm-300 rounded text-sm mt-1"
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Condition */}
                  <div className="mb-3">
                    <label className="text-xs font-semibold text-warm-900">
                      Condition
                    </label>
                    <select
                      value={item.suggestedCondition}
                      onChange={(e) =>
                        updateAnalysisItem(idx, {
                          suggestedCondition: e.target.value,
                        })
                      }
                      className="w-full px-2 py-1 border border-warm-300 rounded text-sm mt-1"
                    >
                      {CONDITIONS.map((cond) => (
                        <option key={cond} value={cond}>
                          {cond}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Include Checkbox */}
                  <label className="flex items-center gap-2 cursor-pointer mt-4 pt-4 border-t border-warm-200">
                    <input
                      type="checkbox"
                      checked={item.include}
                      onChange={(e) =>
                        updateAnalysisItem(idx, { include: e.target.checked })
                      }
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium text-warm-900">
                      Include this item
                    </span>
                  </label>

                  {/* Remove Button */}
                  <button
                    onClick={() => removeAnalysisItem(idx)}
                    className="w-full mt-3 text-red-600 hover:text-red-700 text-sm font-medium"
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Save Button */}
        <div className="flex gap-3">
          <button
            onClick={() => {
              setStep('upload');
              setAnalyses([]);
              setPhotoFiles([]);
            }}
            disabled={createItemsMutation.isPending}
            className="px-6 py-3 border border-warm-300 rounded-lg text-warm-900 hover:bg-warm-100 disabled:opacity-50"
          >
            Back
          </button>
          <button
            onClick={handleSaveAllItems}
            disabled={checkedCount === 0 || createItemsMutation.isPending}
            className="flex-1 px-8 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg"
          >
            {createItemsMutation.isPending
              ? `Saving ${Math.round(saveProgress)}%...`
              : `Save ${checkedCount} Item${checkedCount !== 1 ? 's' : ''}`}
          </button>
        </div>

        {saveProgress > 0 && (
          <div>
            <div className="w-full bg-warm-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-green-600 h-full transition-all"
                style={{ width: `${saveProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── STEP 3: Complete ─────────────────────────────────────────────────────
  if (step === 'complete') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
        <h3 className="text-2xl font-bold text-green-700 mb-2">
          ✓ Items Added Successfully!
        </h3>
        <p className="text-green-600 mb-6">
          Your inventory has been updated. View it below or add more items.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => {
              setStep('upload');
              onComplete?.();
            }}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg"
          >
            Start Over
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default SmartInventoryUpload;
