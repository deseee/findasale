import React, { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Camera, X, Sparkles, Trash2, Tag } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import { useToast } from '@/components/ToastContext';
import {
  useSubmitCurioScan,
  useCurioFinds,
  useDeleteCurioFind,
  useConvertCurioScan,
  CurioScanResult,
  CurioFind,
  CurioValue,
} from '@/hooks/useCurio';

const MAX_PHOTOS = 3;

/** cents -> "$12.34" -- matches the Intl.NumberFormat currency convention used elsewhere (PreviewModal.tsx). */
function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

/** dollars -> "$12.34" -- comparableListings.price is already dollars, NOT cents (ADR API contract). */
function formatDollars(dollars: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(dollars);
}

/** Humanize a rate-limit wait duration -- never show a shopper a raw "1353s" (findasale-dev fix,
 * 2026-09-04, from QA finding on roadmap #636). Daily-cap waits are commonly 20+ hours, so those
 * collapse to "tomorrow" rather than "about 23 hours". */
function formatWaitTime(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'a moment';
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.ceil(totalSeconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  const hours = Math.round(minutes / 60);
  if (hours < 20) return `about ${hours} hour${hours !== 1 ? 's' : ''}`;
  return 'tomorrow';
}

/**
 * Honest, non-"sold"-implying value estimate line. Never say "sold for" / "worth" as fact --
 * this is always framed as similar active listings, per ADR Constraint (permanent, not a
 * Phase-1 caveat -- Curio's comps are active eBay listings, never real sold-price data).
 */
function ValueEstimate({ value, degraded, message, confidence }: { value: CurioValue | null; degraded?: boolean; message?: string; confidence: number }) {
  if (degraded && message) {
    return (
      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-3">
        <p className="text-sm text-amber-800 dark:text-amber-200">{message}</p>
      </div>
    );
  }
  if (!value) {
    return (
      <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-3">
        <p className="text-sm text-gray-600 dark:text-gray-400">No pricing data found for this item right now.</p>
      </div>
    );
  }
  // Confidence gate (findasale-dev fix, 2026-09-04, from QA finding on roadmap #636): below the
  // same 0.5 threshold IdentificationCard's own headline uses for "we're not sure", the
  // title/category guess feeding this comps lookup is itself unreliable -- a blank test photo
  // was hallucinated as "Apple iPhone" and still rendered a confident-looking "$199.99" value
  // box. De-emphasize (gray, caveated) rather than fully hide -- the comps can still be a useful
  // rough signal once the shopper knows to discount it.
  const lowConfidence = confidence < 0.5;
  return (
    <div
      className={
        lowConfidence
          ? 'bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-3'
          : 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-3'
      }
    >
      {lowConfidence && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          We're not confident about what this is, so treat this as a rough guess:
        </p>
      )}
      <p className={lowConfidence ? 'text-sm text-gray-700 dark:text-gray-300' : 'text-sm text-amber-900 dark:text-amber-100'}>
        Similar listings are currently priced around{' '}
        <span className="font-bold">{formatCents(value.median)}</span>{' '}
        <span className={lowConfidence ? 'text-xs text-gray-500 dark:text-gray-400' : 'text-xs text-amber-700 dark:text-amber-300'}>
          (range {formatCents(value.low)}–{formatCents(value.high)}, from {value.compsFound} comparable listing{value.compsFound !== 1 ? 's' : ''})
        </span>
      </p>
    </div>
  );
}

/** Confidence phrasing mirrors the existing camera-review copy (PreviewModal.tsx) -- honest,
 * never invokes "AI" in user-facing copy, matches the project's established tone. */
function IdentificationCard({ result }: { result: CurioScanResult }) {
  const { identification } = result;
  const percentage = Math.round((identification.confidence ?? 0.5) * 100);

  let headline: string;
  if (identification.confidence >= 0.8) {
    headline = `We identified this as a ${identification.title}.`;
  } else if (identification.confidence >= 0.5) {
    headline = `We think this might be a ${identification.title}, but we're not fully sure.`;
  } else {
    headline = "We couldn't quite identify this one from the photo.";
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-5 space-y-4">
      <div>
        <p className="text-base font-semibold text-gray-900 dark:text-white mb-2">{headline}</p>
        {identification.confidence >= 0.5 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-amber-200 dark:bg-amber-900/40 rounded-full h-2">
              <div
                className="bg-amber-600 dark:bg-amber-400 h-2 rounded-full"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-amber-900 dark:text-amber-100 whitespace-nowrap">
              {percentage}% confident
            </span>
          </div>
        )}
      </div>

      {identification.description && (
        <p className="text-sm text-gray-700 dark:text-gray-300">{identification.description}</p>
      )}

      {(identification.category || identification.brand || identification.condition) && (
        <div className="flex flex-wrap gap-2">
          {identification.category && (
            <span className="text-xs font-medium px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
              {identification.category}
            </span>
          )}
          {identification.brand && (
            <span className="text-xs font-medium px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
              {identification.brand}
            </span>
          )}
          {identification.condition && (
            <span className="text-xs font-medium px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
              {identification.condition}
            </span>
          )}
        </div>
      )}

      <ValueEstimate value={result.value} degraded={result.degraded} message={result.message} confidence={identification.confidence} />

      {result.comparableListings.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Comparable listings
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {result.comparableListings.slice(0, 6).map((listing, i) => (
              <a
                key={i}
                href={listing.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden hover:border-amber-400 dark:hover:border-amber-500 transition-colors"
              >
                <div className="w-full aspect-square bg-gray-200 dark:bg-gray-600 flex items-center justify-center overflow-hidden">
                  {listing.imageUrl ? (
                    <img src={listing.imageUrl} alt={listing.title} className="w-full h-full object-cover" />
                  ) : (
                    <Tag size={20} className="text-gray-400 dark:text-gray-500" />
                  )}
                </div>
                <div className="p-2">
                  <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2 leading-tight">{listing.title}</p>
                  <p className="text-sm font-bold text-amber-900 dark:text-amber-100 mt-1">{formatDollars(listing.price)}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CurioPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, updateUser } = useAuth();
  const { showToast } = useToast();

  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<'scan' | 'finds'>('scan');
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [scanResult, setScanResult] = useState<CurioScanResult | null>(null);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [convertingScanId, setConvertingScanId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submitScan = useSubmitCurioScan();
  const convertScan = useConvertCurioScan();
  const deleteFind = useDeleteCurioFind();
  const { data: findsPage, isLoading: findsLoading, error: findsError } = useCurioFinds(20);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Revoke object URLs on unmount / whenever the photo list changes out from under a preview.
  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mounted && !authLoading && !user) {
      router.push('/login');
    }
  }, [mounted, authLoading, user, router]);

  const handleFileChange = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      showToast(`You can attach up to ${MAX_PHOTOS} photos per scan`, 'error');
      return;
    }
    const toAdd = Array.from(files).slice(0, remaining);
    const oversized = toAdd.filter((f) => f.size > 25 * 1024 * 1024);
    if (oversized.length > 0) {
      showToast('Each photo must be under 25MB', 'error');
    }
    const valid = toAdd.filter((f) => f.size <= 25 * 1024 * 1024);
    if (valid.length === 0) return;
    setPhotos((prev) => [...prev, ...valid]);
    setPreviews((prev) => [...prev, ...valid.map((f) => URL.createObjectURL(f))]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const resetScan = useCallback(() => {
    previews.forEach((url) => URL.revokeObjectURL(url));
    setPhotos([]);
    setPreviews([]);
    setScanResult(null);
  }, [previews]);

  const handleSubmitScan = async () => {
    if (photos.length === 0) {
      showToast('Add at least one photo first', 'error');
      return;
    }
    if (rateLimitedUntil && Date.now() < rateLimitedUntil) {
      const secondsLeft = Math.ceil((rateLimitedUntil - Date.now()) / 1000);
      showToast(`Please wait ${formatWaitTime(secondsLeft)} before scanning again`, 'error');
      return;
    }
    try {
      const result = await submitScan.mutateAsync(photos);
      setScanResult(result);
      setRateLimitedUntil(null);
    } catch (err: any) {
      const status = err?.response?.status;
      const errorCode = err?.response?.data?.error;
      if (status === 401 || errorCode === 'LOGIN_REQUIRED') {
        showToast('Please log in to scan items', 'error');
        router.push('/login');
        return;
      }
      if (status === 429) {
        const retryAfterSeconds = err?.response?.data?.retryAfterSeconds;
        if (typeof retryAfterSeconds === 'number') {
          setRateLimitedUntil(Date.now() + retryAfterSeconds * 1000);
          showToast(`Scan limit reached — try again in ${formatWaitTime(retryAfterSeconds)}`, 'error');
        } else {
          showToast("You've hit today's scan limit — try again tomorrow", 'error');
        }
        return;
      }
      const message = err?.response?.data?.message || 'Scan failed. Please try again.';
      showToast(message, 'error');
    }
  };

  const doConvert = async (scanId: string) => {
    setConvertingScanId(scanId);
    try {
      const result = await convertScan.mutateAsync(scanId);
      if (result.organizerAutoProvisioned) {
        const nextRoles = user?.roles?.includes('ORGANIZER') ? user.roles : [...(user?.roles || ['USER']), 'ORGANIZER'];
        updateUser({ role: 'ORGANIZER', roles: nextRoles });
        showToast("We set up your seller profile — you can edit your business name anytime", 'success');
      } else {
        showToast('Listing created as a draft', 'success');
      }
      router.push(`/organizer/edit-item/${result.itemId}`);
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to create listing';
      showToast(message, 'error');
    } finally {
      setConvertingScanId(null);
    }
  };

  const handleConfirmDelete = async (scanId: string) => {
    try {
      await deleteFind.mutateAsync(scanId);
      showToast('Find removed', 'success');
    } catch (err) {
      showToast('Failed to remove find', 'error');
    } finally {
      setDeleteConfirmId(null);
    }
  };

  if (!mounted || authLoading) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // redirect effect above will navigate to /login
  }

  return (
    <>
      <Head>
        <title>Curio — What's This Worth? | FindA.Sale</title>
        <meta
          name="description"
          content="Snap a photo of anything and get an instant identification and estimated value based on similar listings."
        />
      </Head>

      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="mb-6">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
            <Sparkles size={32} className="text-amber-500" />
            Curio
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Snap a photo of anything to see what it might be worth — then list it in one tap.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setTab('scan')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'scan'
                ? 'border-amber-600 text-amber-700 dark:text-amber-400 dark:border-amber-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Scan an Item
          </button>
          <button
            onClick={() => setTab('finds')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'finds'
                ? 'border-amber-600 text-amber-700 dark:text-amber-400 dark:border-amber-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            My Finds{findsPage && findsPage.finds.length > 0 ? ` (${findsPage.finds.length})` : ''}
          </button>
        </div>

        {tab === 'scan' && (
          <div className="space-y-4">
            {!scanResult ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 space-y-4">
                {previews.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {previews.map((url, i) => (
                      <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
                        <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(i)}
                          aria-label={`Remove photo ${i + 1}`}
                          className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {photos.length < MAX_PHOTOS && (
                  <div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={submitScan.isPending}
                      className="w-full px-4 py-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-amber-500 dark:hover:border-amber-400 flex flex-col items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Camera size={24} className="text-gray-600 dark:text-gray-400" />
                      <span className="text-gray-700 dark:text-gray-300 font-medium">
                        {photos.length === 0 ? 'Take or Upload a Photo' : 'Add Another Photo'}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {photos.length}/{MAX_PHOTOS} photos · max 25MB each
                      </span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      aria-label="Upload photos"
                      onChange={(e) => handleFileChange(e.target.files)}
                      disabled={submitScan.isPending}
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSubmitScan}
                  disabled={photos.length === 0 || submitScan.isPending}
                  className="w-full px-6 py-3 bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitScan.isPending ? 'Scanning…' : "What's This Worth?"}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <IdentificationCard result={scanResult} />
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => doConvert(scanResult.scanId)}
                    disabled={convertingScanId === scanResult.scanId}
                    className="flex-1 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {convertingScanId === scanResult.scanId ? 'Creating listing…' : 'List This on FindA.Sale'}
                  </button>
                  <button
                    type="button"
                    onClick={resetScan}
                    className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Scan Another
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'finds' && (
          <div>
            {findsLoading && (
              <div className="text-center py-12">
                <p className="text-gray-600 dark:text-gray-400">Loading your finds...</p>
              </div>
            )}

            {!findsLoading && findsError && (
              <div className="text-center py-12">
                <p className="text-red-600 dark:text-red-400">Failed to load your finds</p>
              </div>
            )}

            {!findsLoading && !findsError && findsPage && findsPage.finds.length === 0 && (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">🔎</div>
                <p className="text-gray-600 dark:text-gray-400 text-lg">No finds yet.</p>
                <button
                  onClick={() => setTab('scan')}
                  className="inline-block mt-4 px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition-colors"
                >
                  Scan Your First Item
                </button>
              </div>
            )}

            {!findsLoading && !findsError && findsPage && findsPage.finds.length > 0 && (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Total value identified:{' '}
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {formatCents(findsPage.totalValueIdentifiedCents)}
                  </span>
                </p>
                <div className="space-y-3">
                  {findsPage.finds.map((find: CurioFind) => (
                    <div
                      key={find.scanId}
                      className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex gap-4"
                    >
                      <div className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
                        {find.photoUrl ? (
                          <img src={find.photoUrl} alt={find.identification.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl">📷</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white truncate">{find.identification.title}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {find.value ? `Around ${formatCents(find.value.median)}` : 'No pricing estimate'}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {new Date(find.createdAt).toLocaleDateString()}
                        </p>
                        <div className="flex gap-3 mt-2">
                          {find.convertedToItemId ? (
                            <Link
                              href={`/organizer/edit-item/${find.convertedToItemId}`}
                              className="text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
                            >
                              View Listing
                            </Link>
                          ) : (
                            <button
                              onClick={() => doConvert(find.scanId)}
                              disabled={convertingScanId === find.scanId}
                              className="text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 disabled:opacity-50"
                            >
                              {convertingScanId === find.scanId ? 'Creating…' : 'List on FindA.Sale'}
                            </button>
                          )}
                          {deleteConfirmId === find.scanId ? (
                            <span className="text-xs flex items-center gap-2">
                              <span className="text-gray-500 dark:text-gray-400">Delete?</span>
                              <button
                                onClick={() => handleConfirmDelete(find.scanId)}
                                className="font-medium text-red-600 hover:text-red-700 dark:text-red-400"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="font-medium text-gray-600 dark:text-gray-400"
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirmId(find.scanId)}
                              aria-label="Delete find"
                              className="text-xs font-medium text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 inline-flex items-center gap-1"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default CurioPage;
