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
  confidence: number; // AI confidence score (0.0–1.0)
  error?: string;
  errorCode?: 'AI_TIMEOUT' | 'AI_PARSE_ERROR' | 'AI_RATE_LIMIT' | 'AI_ERROR';
}

interface AnalysisItem extends AIAnalysis {
  include: boolean;
  photoFile: File;
  isRetrying?: boolean;
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

      // P0-1: Check for partial errors from Cloudinary upload
      if (response.data.partialErrors && response.data.partialErrors.length > 0) {
        const err = new Error(`Upload failed: ${response.data.partialErrors.join(', ')}`);
        (err as any).isTransient = false;
        throw err;
      }

      return response.data.urls || response.data.imageVariants?.map((v: any) => v.original) || [];
    },
    onError: (error: any) => {
      const isTransient = error.code === 'ECONNREFUSED' || error.message?.includes('timeout') || error.response?.status === 503;
      const message = isTransient ? 'Upload failed — network issue' : 'Failed to upload photos';
      showToast(message, 'error');
      setUploadProgress(0);
      (uploadPhotosMutation as any).isTransient = isTransient;
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
    onError: (error: any) => {
      const isTransient = error.code === 'ECONNREFUSED' || error.message?.includes('timeout') || error.response?.status === 503;
      const message = isTransient ? 'Analysis failed — try again shortly' : 'Failed to analyze photos';
      showToast(message, 'error');
      setUploadProgress(0);
      (batchAnalyzeMutation as any).isTransient = isTransient;
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
      tags: string[];
      isAiTagged: boolean;
      aiConfidence: number;
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
      queryClient.invalidateQueries({ queryKey: ['items', saleId] });
      setSaveProgress(0);
      setStep('complete');
      setPhotoFiles([]);
      setAnalyses([]);
      onComplete?.();
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

    // P1-1: Record feedback for field edits
    const item = updated[idx];
    if (updates.suggestedTitle && updates.suggestedTitle !== analyses[idx].suggestedTitle) {
      recordFeedback('title', 'edited');
    }
    if (updates.suggestedDescription && updates.suggestedDescription !== analyses[idx].suggestedDescription) {
      recordFeedback('description', 'edited');
    }
    if (updates.suggestedCategory && updates.suggestedCategory !== analyses[idx].suggestedCategory) {
      recordFeedback('category', 'edited');
    }
    if (updates.suggestedCondition && updates.suggestedCondition !== analyses[idx].suggestedCondition) {
      recordFeedback('condition', 'edited');
    }
    if (updates.suggestedPrice && updates.suggestedPrice !== analyses[idx].suggestedPrice) {
      recordFeedback('price', 'edited');
    }
  };

  // P1-1: Fire-and-forget feedback to CB4
  const recordFeedback = async (field: string, action: 'accepted' | 'dismissed' | 'edited') => {
    try {
      await api.post('/upload/ai-feedback', { field, action });
    } catch (err) {
      // Silently fail — don't block user workflow for feedback
    }
  };

  // Remove analysis item
  const removeAnalysisItem = (idx: number) => {
    // P1-1: Record dismiss feedback when organizer removes an item
    const item = analyses[idx];
    recordFeedback('overall', 'dismissed');
    setAnalyses(analyses.filter((_, i) => i !== idx));
  };

  // Save all checked items
  const handleSaveAllItems = async () => {
    const skippedCount = analyses.filter((a) => a.include && a.error).length;

    const itemsToCreate = analyses
      .filter((a) => a.include && !a.error && a.photoUrl && a.photoUrl !== '(unknown)')
      .map((a) => {
        // P1-1: Record acceptance feedback for items that were not edited
        recordFeedback('overall', 'accepted');
        return {
          saleId,
          title: a.suggestedTitle,
          description: a.suggestedDescription,
          price: a.suggestedPrice,
          category: a.suggestedCategory,
          condition: a.suggestedCondition,
          photoUrls: [a.photoUrl],
          // CB5-fix: pass AI-generated tags so they are stored on the item
          tags: a.suggestedTags || [],
          // P0-4: Only mark as AI-tagged if no error and valid URL
          isAiTagged: Boolean(!a.error && a.photoUrl && a.photoUrl !== '(unknown)'),
          // CD2 Phase 2: Pass AI confidence score for batch uploads
          aiConfidence: a.confidence || 0.5,
        };
      });

    if (itemsToCreate.length === 0) {
      showToast('Select at least one item to save', 'error');
      return;
    }

    await createItemsMutation.mutateAsync(itemsToCreate);

    // P1-2: Show summary of what was saved and what was skipped
    if (skippedCount > 0) {
      setTimeout(() => {
        showToast(
          `✓ ${itemsToCreate.length} items saved. ${skippedCount} items skipped (analysis failed).`,
          'success'
        );
      }, 500);
    }
  };

  // P1-3: Retry analysis for failed items
  const handleRetryFailedItems = async () => {
    const failedUrls = analyses
      .filter((a) => a.error && a.photoUrl && a.photoUrl !== '(unknown)')
      .map((a) => a.photoUrl);

    if (failedUrls.length === 0) {
      showToast('No items to retry', 'info');
      return;
    }

    setUploadProgress(50);
    try {
      const aiResults = await batchAnalyzeMutation.mutateAsync(failedUrls);

      // Update failed items with new results
      const updated = [...analyses];
      let resultIdx = 0;
      for (let i = 0; i < updated.length; i++) {
        if (updated[i].error && updated[i].photoUrl && updated[i].photoUrl !== '(unknown)') {
          updated[i] = { ...updated[i], ...aiResults[resultIdx++] };
        }
      }
      setAnalyses(updated);
      setUploadProgress(100);
      setTimeout(() => setUploadProgress(0), 500);
      showToast(`Retried ${failedUrls.length} items`, 'success');
    } catch (err) {
      showToast('Retry failed — try again later', 'error');
      setUploadProgress(0);
    }
  };

  // ─── STEP 1: Upload ────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="space-y-6">
        <div className="bg-blue-50 dark:bg-gray-800 border border-blue-200 dark:border-gray-700 rounded-lg p-8 text-center">
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-blue-300 dark:border-gray-600 rounded-lg p-12 cursor-pointer hover:bg-blue-100 dark:hover:bg-gray-700 transition-colors mb-6"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <p className="text-warm-600 dark:text-warm-400 font-medium">
              {photoFiles.length > 0
                ? `✓ ${photoFiles.length} photo${photoFiles.length !== 1 ? 's' : ''} selected`
                : 'Click or drag photos here'}
            </p>
            {photoFiles.length > 0 && (
              <p className="text-sm text-warm-500 dark:text-warm-400 mt-2">
                Click to add more or proceed to analysis
              </p>
            )}
          </div>

          <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-1">
            📦 Smart Inventory Upload
          </h3>
          <p className="text-warm-600 dark:text-warm-400 mb-4 text-sm">
            Drop up to 20 individual item photos here. Then click Analyze All to create draft listings automatically.
          </p>

          {photoFiles.length > 0 && (
            <div className="mt-2 grid grid-cols-4 gap-4">
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
                <div className="flex items-center justify-center bg-warm-100 dark:bg-gray-700 rounded text-warm-600 dark:text-warm-300 font-semibold">
                  +{photoFiles.length - 4}
                </div>
              )}
            </div>
          )}

          {uploadProgress > 0 && (
            <div className="mt-6">
              <div className="w-full bg-warm-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-sm text-warm-600 dark:text-warm-400 mt-2">
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
              className="px-6 py-2 border border-warm-300 dark:border-gray-600 rounded-lg text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Clear
            </button>
            {uploadPhotosMutation.isError || batchAnalyzeMutation.isError ? (
              <button
                onClick={handleAnalyzePhotos}
                className="px-8 py-3 bg-yellow-600 hover:bg-yellow-700 text-white font-bold rounded-lg"
              >
                Retry Upload
              </button>
            ) : null}
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

  // ─── STEP 2: Review ────────────────────────────────────────────
  if (step === 'review') {
    const checkedCount = analyses.filter((a) => a.include && !a.error).length;
    const errorCount = analyses.filter((a) => a.error).length;

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">
            Review & Edit Suggestions ({checkedCount} analyzed{errorCount > 0 ? ` · ${errorCount} failed` : ''})
          </h3>
          <p className="text-warm-600 dark:text-warm-400 text-sm mb-4">
            Edit any field inline. Uncheck items to skip them.
          </p>
          {errorCount > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-red-700 text-sm">
                {errorCount} item{errorCount !== 1 ? 's' : ''} failed to analyze.
                <button
                  onClick={handleRetryFailedItems}
                  className="ml-2 text-red-900 font-semibold hover:underline"
                >
                  Retry Failed Items
                </button>
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {analyses.map((item, idx) => (
            <div
              key={idx}
              className={`border rounded-lg p-4 ${
                item.error
                  ? 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30'
                  : item.include
                  ? 'border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30'
                  : 'border-warm-200 dark:border-gray-700 bg-warm-50 dark:bg-gray-800 opacity-60'
              }`}
            >
              {/* Photo */}
              <div className="mb-4">
                {item.error && (!item.photoUrl || item.photoUrl === '(unknown)') ? (
                  <div className="w-full h-32 bg-red-200 dark:bg-red-900/30 rounded flex items-center justify-center text-red-600 dark:text-red-400 font-semibold">
                    No Photo
                  </div>
                ) : (
                  <>
                    <img
                      key={item.photoUrl}
                      src={item.photoUrl}
                      alt="Item preview"
                      className={`w-full h-40 object-contain rounded bg-gray-100 dark:bg-gray-800 ${item.error ? 'opacity-50' : ''}`}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        const placeholder = e.currentTarget.nextElementSibling as HTMLElement;
                        if (placeholder) placeholder.style.display = 'flex';
                      }}
                    />
                    <div className="w-full h-32 bg-warm-100 dark:bg-gray-700 rounded flex items-center justify-center text-warm-400 dark:text-gray-500 text-sm" style={{ display: 'none' }}>
                      📷 Preview unavailable
                    </div>
                  </>
                )}
              </div>

              {item.error ? (
                <div className="space-y-2">
                  <div className="p-3 bg-red-100 border border-red-300 rounded text-red-700 text-sm">
                    <strong>Analysis Failed</strong>
                    <p className="text-xs mt-1">
                      {item.errorCode === 'AI_TIMEOUT' && 'AI service timed out'}
                      {item.errorCode === 'AI_RATE_LIMIT' && 'AI service busy — try again later'}
                      {item.errorCode === 'AI_PARSE_ERROR' && 'AI returned invalid data'}
                      {!item.errorCode && (item.error || 'Unable to analyze this image')}
                    </p>
                  </div>
                  <button
                    onClick={() => removeAnalysisItem(idx)}
                    className="w-full text-red-600 hover:text-red-700 text-sm font-medium"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  {/* Title */}
                  <div className="mb-3">
                    <label className="text-xs font-semibold text-warm-900 dark:text-warm-100">
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
                      className="w-full px-2 py-1 border border-warm-300 dark:bg-gray-700 dark:text-warm-100 dark:border-gray-600 rounded text-sm mt-1"
                    />
                  </div>

                  {/* Price */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <label className="text-xs font-semibold text-warm-900 dark:text-warm-100">
                        Price
                      </label>
                      <div className="relative">
                        <span className="absolute left-2 top-1.5 text-warm-600 dark:text-warm-400 text-sm">
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
                          className="w-full pl-5 pr-2 py-1 border border-warm-300 dark:bg-gray-700 dark:text-warm-100 dark:border-gray-600 rounded text-sm mt-1"
                        />
                      </div>
                    </div>

                    {/* Category */}
                    <div>
                      <label className="text-xs font-semibold text-warm-900 dark:text-warm-100">
                        Category
                      </label>
                      <select
                        value={item.suggestedCategory}
                        onChange={(e) =>
                          updateAnalysisItem(idx, {
                            suggestedCategory: e.target.value,
                          })
                        }
                        className="w-full px-2 py-1 border border-warm-300 dark:bg-gray-700 dark:text-warm-100 dark:border-gray-600 rounded text-sm mt-1"
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
                    <label className="text-xs font-semibold text-warm-900 dark:text-warm-100">
                      Condition
                    </label>
                    <select
                      value={item.suggestedCondition}
                      onChange={(e) =>
                        updateAnalysisItem(idx, {
                          suggestedCondition: e.target.value,
                        })
                      }
                      className="w-full px-2 py-1 border border-warm-300 dark:bg-gray-700 dark:text-warm-100 dark:border-gray-600 rounded text-sm mt-1"
                    >
                      {CONDITIONS.map((cond) => (
                        <option key={cond} value={cond}>
                          {cond}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Include Checkbox */}
                  <label className="flex items-center gap-2 cursor-pointer mt-4 pt-4 border-t border-warm-200 dark:border-gray-700">
                    <input
                      type="checkbox"
                      checked={item.include}
                      onChange={(e) => {
                        // P1-1: Record feedback when unchecking
                        if (item.include && !e.target.checked) {
                          recordFeedback('overall', 'dismissed');
                        }
                        updateAnalysisItem(idx, { include: e.target.checked });
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium text-warm-900 dark:text-warm-100">
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
            className="px-6 py-3 border border-warm-300 dark:border-gray-600 rounded-lg text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 disabled:opacity-50"
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
            <div className="w-full bg-warm-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
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

  // ─── STEP 3: Complete ───────────────────────────────────────────
  if (step === 'complete') {
    return (
      <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-8 text-center">
        <h3 className="text-2xl font-bold text-green-700 dark:text-green-400 mb-2">
          ✓ Items Added Successfully!
        </h3>
        <p className="text-green-600 dark:text-green-500 mb-6">
          Your inventory has been updated. Review and publish your new items, or add more.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <a
            href={`/organizer/add-items/${saleId}/review`}
            className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg"
          >
            Review & Publish →
          </a>
          <button
            onClick={() => {
              setStep('upload');
              onComplete?.();
            }}
            className="px-6 py-3 border border-green-600 text-green-700 dark:text-green-400 font-bold rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20"
          >
            Add More
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default SmartInventoryUpload;
