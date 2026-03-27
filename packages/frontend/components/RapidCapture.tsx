import React, { useState, useRef, useCallback, useEffect } from 'react';

/**
 * RapidCapture — Phase 14b camera overlay (refactored)
 *
 * Integrated camera experience matching design spec:
 * - Mode toggle (Rapidfire | Regular) built into camera top bar
 * - Carousel of rapidItems with "+" add-to buttons (rapidfire only)
 * - Mode-aware shutter button (amber gradient + ⚡ for rapidfire, deeper + for add-mode)
 * - Corner brackets: faint white, not blue
 * - Adding-to banner between carousel and shutter
 * - Mode hint text below top bar
 * - Gallery thumbnail on left of shutter row
 *
 * Opens fullscreen on mobile, centered modal on desktop (md+).
 */

interface CapturedPhoto {
  blob: Blob;
  previewUrl: string;
  timestamp: number;
}

export interface RapidItem {
  id: string;
  thumbnailUrl?: string;
  draftStatus: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED';
  title?: string;
  category?: string;
  aiError?: string;
  photoUrls?: string[];
  autoEnhanced?: boolean;
}

interface RapidCaptureProps {
  /** Called when user taps "Done" with all captured photos */
  onComplete: (photos: { blob: Blob; previewUrl: string }[]) => void;
  /** Called when user taps "X" / cancels */
  onCancel: () => void;
  /** Max photos allowed (default 20) */
  maxPhotos?: number;
  /** Current capture mode: rapidfire = 1 photo per item, regular = up to 5 per item */
  mode: 'rapidfire' | 'regular';
  /** Called when mode toggle changes */
  onModeChange: (mode: 'rapidfire' | 'regular') => void;
  /** Array of rapid-captured items (rapidfire mode only) */
  rapidItems: RapidItem[];
  /** If set, current item being added to. Triggers add-mode UI. */
  addingToItemId: string | null;
  /** Called when user taps "+" on a rapidItems thumbnail */
  onAddToItem: (itemId: string) => void;
  /** Called when user taps a rapidItems thumbnail to preview it */
  onThumbnailTap: (itemId: string) => void;
  /** Called when user taps Review button — navigate to review page */
  onNavigateToReview: () => void;
  /** Count of items in PENDING_REVIEW state (for Review button badge) */
  readyCount: number;
  /** Called immediately when a photo is captured (before Done). Enables live carousel. */
  onPhotoCapture?: (photo: { blob: Blob; previewUrl: string }) => void;
  /** Called when user deletes a captured photo (regular mode only) */
  onDeletePhoto?: (index: number) => void;
  /** Called when user clicks "Enhance All" button */
  onEnhanceAll?: () => void;
}

const RapidCapture: React.FC<RapidCaptureProps> = ({
  onComplete,
  onCancel,
  maxPhotos = 20,
  mode,
  onModeChange,
  rapidItems,
  addingToItemId,
  onAddToItem,
  onThumbnailTap,
  onNavigateToReview,
  readyCount,
  onPhotoCapture,
  onDeletePhoto,
  onEnhanceAll,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [flashEffect, setFlashEffect] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [preCaptureWarning, setPreCaptureWarning] = useState<string | null>(null);
  const [photosThisItem, setPhotosThisItem] = useState(0);

  const isRapidfire = mode === 'rapidfire';
  const inAddMode = addingToItemId !== null;
  const addingItem = inAddMode ? rapidItems.find((i) => i.id === addingToItemId) : null;
  const MAX_REGULAR = 5;

  // Start camera on mount and when facingMode changes
  useEffect(() => {
    let mounted = true;

    const startCamera = async () => {
      // Stop existing stream before switching
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setCameraReady(false);
      setTorchOn(false);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          },
          audio: false,
        });

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        // Check torch support on the video track
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const capabilities = videoTrack.getCapabilities?.() as any;
          setTorchSupported(!!capabilities?.torch);
        } else {
          setTorchSupported(false);
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch (err: any) {
        if (!mounted) return;
        if (err.name === 'NotAllowedError') {
          setCameraError('Camera access denied. Please allow camera access in your browser settings.');
        } else if (err.name === 'NotFoundError') {
          setCameraError('No camera found on this device.');
        } else {
          setCameraError('Could not start camera. Try closing other apps using the camera.');
        }
      }
    };

    startCamera();

    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [facingMode]);

  // Phase 3: Pre-capture quality check — sample video brightness every 2 seconds
  useEffect(() => {
    if (!cameraReady || !videoRef.current) return;

    const qualityInterval = setInterval(() => {
      if (videoRef.current && cameraReady) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(videoRef.current, 0, 0, 64, 64);
        const data = ctx.getImageData(0, 0, 64, 64).data;
        let total = 0;
        for (let i = 0; i < data.length; i += 4) {
          total += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        }
        const avg = total / (64 * 64);
        setPreCaptureWarning(avg < 40 ? 'Too dark — adjust lighting' : null);
      }
    }, 2000);

    return () => clearInterval(qualityInterval);
  }, [cameraReady]);

  // Capture a photo from the video stream
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const isRegularMode = !isRapidfire;
    const maxAllowed = isRegularMode ? MAX_REGULAR : maxPhotos;

    if (isRegularMode && photosThisItem >= maxAllowed) return;
    if (isRapidfire && photos.length >= maxPhotos) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Match canvas to video's native resolution
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);

    // Flash feedback
    setFlashEffect(true);
    setTimeout(() => setFlashEffect(false), 150);

    // Convert to blob (JPEG, 85% quality)
    canvas.toBlob(
      (blob) => {
        if (!blob) return;

        const photo: CapturedPhoto = {
          blob,
          previewUrl: URL.createObjectURL(blob),
          timestamp: Date.now(),
        };

        // Call onPhotoCapture immediately to enable live carousel
        onPhotoCapture?.(photo);

        if (isRegularMode) {
          setPhotos((prev) => [...prev, photo]);
          setPhotosThisItem((prev) => prev + 1);
        } else {
          // Rapidfire mode
          setPhotos((prev) => {
            const next = [...prev, photo];
            // Auto-scroll carousel to end
            requestAnimationFrame(() => {
              carouselRef.current?.scrollTo({
                left: carouselRef.current.scrollWidth,
                behavior: 'smooth',
              });
            });
            return next;
          });
        }
      },
      'image/jpeg',
      0.85
    );
  }, [isRapidfire, photos.length, maxPhotos, photosThisItem]);

  // Delete a captured photo
  const deletePhoto = useCallback((index: number) => {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
    setSelectedIndex(null);
  }, []);

  // Toggle torch (phone LED flash)
  const toggleTorch = useCallback(async () => {
    if (!streamRef.current) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (!videoTrack) return;
    const newTorch = !torchOn;
    try {
      await videoTrack.applyConstraints({ advanced: [{ torch: newTorch } as any] });
      setTorchOn(newTorch);
    } catch {
      // Torch not supported on this track — silently fail
    }
  }, [torchOn]);

  // Switch front/back camera
  const switchCamera = useCallback(() => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  }, []);

  // Done — stop camera, return photos
  const handleDone = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    onComplete(
      photos.map(({ blob, previewUrl }) => ({ blob, previewUrl }))
    );
  }, [photos, onComplete]);

  // Cancel — stop camera, clean up
  const handleCancel = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    onCancel();
  }, [photos, onCancel]);

  // Handle mode change — reset regular mode counters if switching
  const handleModeChange = useCallback((newMode: 'rapidfire' | 'regular') => {
    if (newMode !== mode) {
      setPhotosThisItem(0);
      onModeChange(newMode);
    }
  }, [mode, onModeChange]);

  // Get last item thumbnail for gallery thumbnail on left of shutter
  const lastItemThumbnail = isRapidfire
    ? rapidItems.length > 0 && rapidItems[0].thumbnailUrl
      ? rapidItems[0].thumbnailUrl
      : null
    : photos.length > 0
    ? photos[photos.length - 1].previewUrl
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black md:bg-black/70 md:p-8">
      {/* Inner container: fullscreen mobile, modal desktop */}
      <div className="w-full h-full md:max-w-2xl md:max-h-[85vh] md:rounded-2xl md:overflow-hidden md:shadow-2xl bg-black flex flex-col relative">
        {/* Hidden canvas for frame capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 gap-2 bg-gradient-to-b from-black/60 to-transparent min-h-16">
          {/* Left: Torch (if supported) or close button */}
          {torchSupported ? (
            <button
              onClick={toggleTorch}
              className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
                torchOn ? 'bg-amber-500 text-white' : 'bg-white/20 text-white'
              }`}
              aria-label={torchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleCancel}
              className="flex-shrink-0 text-white text-lg w-10 h-10 flex items-center justify-center"
              aria-label="Cancel capture"
            >
              ✕
            </button>
          )}

          {/* Center: Mode toggle */}
          <div className="flex items-center bg-black/70 border border-white/15 rounded-full gap-0.5 px-1 py-1">
            {[
              ['rapidfire', '⚡ Rapidfire'],
              ['regular', '📷 Regular'],
            ].map(([m, label]) => (
              <button
                key={m}
                onClick={() => handleModeChange(m as 'rapidfire' | 'regular')}
                className={`px-3 py-1.5 text-xs sm:text-sm font-bold rounded-full transition-all whitespace-nowrap ${
                  mode === m
                    ? m === 'rapidfire'
                      ? 'bg-amber-500 text-white'
                      : 'bg-white text-black'
                    : 'text-white/50 hover:text-white/75'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Right: Review button */}
          <button
            onClick={() => {
              if (!isRapidfire && photos.length > 0) {
                setSelectedIndex(0);
              } else {
                onNavigateToReview();
              }
            }}
            disabled={!isRapidfire && photos.length === 0}
            className="flex-shrink-0 max-w-[80px] bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-2 py-1.5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap truncate"
          >
            Review{readyCount > 0 && ` (${readyCount})`}
          </button>
        </div>

        {/* Mode hint text */}
        <div className="absolute top-14 left-0 right-0 z-10 flex justify-center pointer-events-none">
          <span className="text-xs text-white/50 bg-black/30 rounded-full px-3 py-1.5">
            {isRapidfire
              ? inAddMode
                ? `Adding photo → ${addingItem?.title || 'item'}`
                : '1 photo = 1 item · tap + on any thumbnail to add more'
              : `Up to ${MAX_REGULAR} photos per item`}
          </span>
        </div>

        {/* Regular mode photo counter (dots) */}
        {!isRapidfire && (
          <div className="absolute top-24 left-0 right-0 z-10 flex justify-center items-center gap-2">
            {Array.from({ length: MAX_REGULAR }).map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all ${
                  i < photosThisItem
                    ? 'bg-white w-2.5 h-2.5'
                    : 'bg-white/30 w-2 h-2'
                }`}
              />
            ))}
            <span className="text-white/50 text-xs ml-1">
              {photosThisItem}/{MAX_REGULAR}
            </span>
          </div>
        )}

        {/* Camera viewfinder */}
        <div className="flex-1 relative overflow-hidden">
          {cameraError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
              <svg className="w-16 h-16 text-warm-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"
                />
              </svg>
              <p className="text-white text-lg font-medium mb-2">Camera Unavailable</p>
              <p className="text-warm-400 text-sm">{cameraError}</p>
              <button
                onClick={handleCancel}
                className="mt-6 px-6 py-2 bg-warm-700 text-white rounded-lg"
              >
                Go Back
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
              />

              {/* 4:3 Framing Guide with faint white corner brackets */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Corner brackets — faint white, not blue */}
                <div className="absolute top-4 left-4 w-10 h-10 border-t-2 border-l-2 border-white/50" />
                <div className="absolute top-4 right-4 w-10 h-10 border-t-2 border-r-2 border-white/50" />
                <div className="absolute bottom-4 left-4 w-10 h-10 border-b-2 border-l-2 border-white/50" />
                <div className="absolute bottom-4 right-4 w-10 h-10 border-b-2 border-r-2 border-white/50" />
                {/* Label */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 text-white/35 text-xs">
                  4:3
                </div>
              </div>

              {/* Phase 3: Pre-capture quality warning */}
              {preCaptureWarning && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-amber-500/90 text-white text-sm font-medium px-4 py-2 rounded-lg z-10">
                  {preCaptureWarning}
                </div>
              )}

              {/* Flash overlay */}
              {flashEffect && (
                <div className="absolute inset-0 bg-white/30 pointer-events-none animate-fadeIn" />
              )}

              {/* Loading state */}
              {!cameraReady && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-white text-sm">Starting camera...</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom section: carousel (rapidfire only) + adding-to banner + shutter row */}
        <div className="bg-black/90 pb-safe">
          {/* Rapidfire carousel (above shutter) */}
          {isRapidfire && rapidItems.length > 0 && (
            <div
              ref={carouselRef}
              className="flex gap-2 px-4 py-3 pr-20 overflow-x-auto scrollbar-hide"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {rapidItems.map((item) => {
                const isAddingTo = addingToItemId === item.id;
                const status = !item.thumbnailUrl
                  ? { icon: '📷', bgColor: 'bg-gray-200' }
                  : item.draftStatus === 'DRAFT' && !item.aiError
                  ? { icon: '◐', bgColor: 'bg-amber-100' }
                  : item.draftStatus === 'DRAFT' && item.aiError
                  ? { icon: '⚠', bgColor: 'bg-red-100' }
                  : { icon: '✓', bgColor: 'bg-green-100' };

                return (
                  <div
                    key={item.id}
                    className={`flex-shrink-0 relative cursor-pointer transition-all w-16 h-auto ${
                      isAddingTo ? 'ring-2 ring-amber-400 rounded-lg shadow-lg shadow-amber-400/50' : ''
                    }`}
                    onClick={() => onThumbnailTap(item.id)}
                    title={item.title || 'Item'}
                  >
                    {/* Thumbnail */}
                    <div
                      className={`w-16 h-16 rounded-lg overflow-hidden border border-white/30 flex items-center justify-center flex-shrink-0 ${
                        isAddingTo ? 'bg-amber-900/30' : 'bg-white/10'
                      }`}
                    >
                      {item.thumbnailUrl ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.title || 'Item'}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const img = e.currentTarget;
                            img.style.display = 'none';
                            const icon = document.createElement('span');
                            icon.textContent = '📷';
                            icon.className = 'text-xl';
                            img.parentElement?.appendChild(icon);
                          }}
                        />
                      ) : (
                        <span className="text-xl">📷</span>
                      )}
                    </div>

                    {/* Loading spinner overlay (while DRAFT with no error, real items only) */}
                    {!item.id.startsWith('temp-') && item.draftStatus === 'DRAFT' && !item.aiError && item.thumbnailUrl && (
                      <div className="absolute inset-0 rounded-lg bg-black/20 flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                      </div>
                    )}

                    {/* Status badge (top-right) */}
                    {item.thumbnailUrl && (
                      <div
                        className={`absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${status.bgColor}`}
                      >
                        {status.icon}
                      </div>
                    )}

                    {/* Auto-enhance badge (top-left) */}
                    {item.autoEnhanced && (
                      <div className="absolute top-0.5 left-0.5 text-sm">✨</div>
                    )}

                    {/* Photo count badge (bottom-center) */}
                    {item.photoUrls && item.photoUrls.length > 1 && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-1.5 rounded-full">
                        ×{item.photoUrls.length}
                      </span>
                    )}

                    {/* "+" button (bottom-right) — toggles to "×" when adding */}
                    {item.thumbnailUrl && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToItem(item.id);
                        }}
                        className={`absolute bottom-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white transition-all ${
                          isAddingTo ? 'bg-amber-500' : 'bg-gray-700/80 hover:bg-gray-600'
                        }`}
                        aria-label={isAddingTo ? 'Stop adding photos' : 'Add photos to this item'}
                      >
                        {isAddingTo ? '×' : '+'}
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Publish shortcut tile — tap to open most recent item for quick review */}
              {rapidItems.length > 0 && (
                <button
                  onClick={() => {
                    // Open the most recent (last) item in PreviewModal for quick review
                    const lastItem = rapidItems[rapidItems.length - 1];
                    if (lastItem) {
                      onThumbnailTap(lastItem.id);
                    }
                  }}
                  className="flex-shrink-0 w-16 h-16 rounded-lg bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 font-bold text-sm hover:bg-amber-500/30 transition-all"
                >
                  → Pub
                </button>
              )}
            </div>
          )}

          {/* Carousel stats line with Enhance All button (rapidfire only) */}
          {isRapidfire && rapidItems.length > 0 && (
            <div className="text-center text-xs text-white/50 px-4 pb-2 flex items-center justify-center gap-2">
              <span>
                {rapidItems.length} captured · {rapidItems.filter((i) => i.autoEnhanced).length} auto-enhanced ✨
              </span>
              {onEnhanceAll && (
                <button
                  onClick={onEnhanceAll}
                  className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-2 py-0.5 rounded font-semibold transition-colors"
                  title="Trigger AI enhancement for all items"
                >
                  Enhance
                </button>
              )}
            </div>
          )}

          {/* Adding-to banner (shown when in add-mode) */}
          {isRapidfire && inAddMode && addingItem && (
            <div className="bg-amber-500/20 border-t border-b border-amber-500/30 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {addingItem.thumbnailUrl && (
                  <img
                    src={addingItem.thumbnailUrl}
                    alt={addingItem.title}
                    className="w-8 h-8 rounded object-cover"
                  />
                )}
                <span className="text-sm text-white font-medium">
                  Next shot adds to: {addingItem.title || 'item'}
                </span>
              </div>
              <button
                onClick={() => onAddToItem(addingToItemId)}
                className="text-white/60 hover:text-white text-lg"
                aria-label="Cancel add mode"
              >
                ✕
              </button>
            </div>
          )}

          {/* Shutter row */}
          <div className="flex items-center justify-center py-4 px-6 gap-4">
            {/* Gallery thumbnail (left) */}
            {lastItemThumbnail && (
              <button
                onClick={() => !isRapidfire && photos.length > 0 && setSelectedIndex(photos.length - 1)}
                disabled={isRapidfire || photos.length === 0}
                className="w-12 h-12 rounded overflow-hidden border border-white/30 flex-shrink-0 disabled:cursor-not-allowed bg-white/10 flex items-center justify-center"
              >
                <img
                  src={lastItemThumbnail}
                  alt="Last capture"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback: replace broken image with camera icon
                    const img = e.target as HTMLImageElement;
                    img.style.display = 'none';
                    img.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                    const icon = document.createElement('span');
                    icon.textContent = '📷';
                    icon.className = 'text-lg';
                    img.parentElement?.appendChild(icon);
                  }}
                />
              </button>
            )}
            {!lastItemThumbnail && <div className="w-12" />}

            {/* Shutter button (center) */}
            <button
              onClick={capturePhoto}
              disabled={!cameraReady || (isRapidfire ? photos.length >= maxPhotos : photosThisItem >= MAX_REGULAR)}
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-transform active:scale-90 flex-shrink-0 ${
                isRapidfire
                  ? inAddMode
                    ? 'bg-gradient-to-br from-amber-600 to-amber-700 shadow-lg shadow-amber-600/50'
                    : 'bg-gradient-to-br from-amber-500 to-red-500 shadow-lg shadow-amber-500/50'
                  : 'border-4 border-white bg-white/20'
              }`}
              style={{
                opacity: cameraReady && (isRapidfire ? photos.length < maxPhotos : photosThisItem < MAX_REGULAR) ? 1 : 0.5,
              }}
              aria-label="Capture photo"
            >
              {isRapidfire ? (
                <span className="text-2xl font-bold text-white">{inAddMode ? '+' : '⚡'}</span>
              ) : (
                <div className="w-14 h-14 rounded-full bg-white" />
              )}
            </button>

            {/* Camera switch (right) */}
            <button
              onClick={switchCamera}
              className="w-12 h-12 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors flex items-center justify-center flex-shrink-0"
              aria-label="Switch camera"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Full-screen preview overlay when a photo is tapped (regular mode filmstrip or carousel tap) */}
        {selectedIndex !== null && photos[selectedIndex] && (
          <div
            className="absolute inset-0 z-20 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setSelectedIndex(null)}
          >
            <div className="relative max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
              <img
                src={photos[selectedIndex].previewUrl}
                alt={`Preview ${selectedIndex + 1}`}
                className="max-w-full max-h-[70vh] rounded-lg object-contain"
              />
              {/* Delete button overlay (top-right corner) */}
              <button
                onClick={() => {
                  deletePhoto(selectedIndex);
                  setSelectedIndex(null);
                }}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center text-lg font-bold transition-colors"
                aria-label="Delete photo"
              >
                ×
              </button>
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                <button
                  onClick={() => deletePhoto(selectedIndex)}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  Delete
                </button>
                <button
                  onClick={() => setSelectedIndex(null)}
                  className="bg-warm-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RapidCapture;
