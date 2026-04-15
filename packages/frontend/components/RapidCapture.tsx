import React, { useState, useRef, useCallback, useEffect } from 'react';
import BrightnessIndicator from './camera/BrightnessIndicator';

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
  /** Quality overlay state (Tier 2 or 3 warning) — renders overlay inside camera if set */
  qualityOverlay?: {
    tier: 2 | 3;
    onUsePhoto: () => void;
    onRetake: () => void;
    onSkip: () => void;
  } | null;
  /** Face detection overlay state — renders modal inside camera if set */
  faceDetectionOverlay?: {
    onUploadAnyway: () => void;
    onRetake: () => void;
    pendingPhoto?: { blob: Blob; previewUrl: string };
  } | null;
  /** Called when user clicks "Analyze" in regular mode */
  onAnalyze?: (photos: { blob: Blob; previewUrl: string }[]) => void | Promise<void>;
  /** Whether Analyze button is in loading state */
  isAnalyzing?: boolean;
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
  qualityOverlay,
  faceDetectionOverlay,
  onAnalyze,
  isAnalyzing = false,
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
  const [photosThisItem, setPhotosThisItem] = useState(0);
  const [coachingBannerDismissed, setCoachingBannerDismissed] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number }>({ min: 1, max: 5 });
  const [showZoomHint, setShowZoomHint] = useState(false);
  const [focusRing, setFocusRing] = useState<{ x: number; y: number } | null>(null);
  const zoomHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusRingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPinchDistance = useRef<number | null>(null);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [showCornerGuides, setShowCornerGuides] = useState(true);
  const [showLevelIndicator, setShowLevelIndicator] = useState(true);
  const [exposureCompensation, setExposureCompensation] = useState(0);
  const [whiteBalance, setWhiteBalance] = useState('auto');
  const [flashMode, setFlashMode] = useState<'off' | 'on' | 'auto' | 'torch'>('off');
  const [wbSubOpen, setWbSubOpen] = useState(false);
  const [levelAngle, setLevelAngle] = useState(0);
  const [deviceSupportsOrientation, setDeviceSupportsOrientation] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRapidfire = mode === 'rapidfire';
  const inAddMode = addingToItemId !== null;
  const addingItem = inAddMode ? rapidItems.find((i) => i.id === addingToItemId) : null;
  const MAX_REGULAR = 5;

  // Seed photosThisItem from existing photo count when entering regular mode on an existing item
  useEffect(() => {
    if (!isRapidfire && addingToItemId) {
      const existingCount = rapidItems.find((i) => i.id === addingToItemId)?.photoUrls?.length ?? 0;
      setPhotosThisItem(existingCount);
    } else if (!isRapidfire) {
      setPhotosThisItem(0);
    }
  }, [isRapidfire, addingToItemId, rapidItems]);

  // Start camera on mount and when facingMode changes
  // Auto-scroll carousel to show newest thumbnail (rightmost) on each capture
  useEffect(() => {
    if (carouselRef.current && rapidItems.length > 0) {
      carouselRef.current.scrollLeft = carouselRef.current.scrollWidth;
    }
  }, [rapidItems.length]);

  // Subscribe to device orientation for live level indicator
  useEffect(() => {
    let mounted = true;

    const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
      if (!mounted) return;
      // gamma is left/right tilt (-90 to +90)
      // For a camera pointing at a subject, gamma is the primary tilt axis
      const gamma = event.gamma ?? 0;
      setLevelAngle(-gamma); // Negate so bar rotates opposite to device tilt
      setDeviceSupportsOrientation(true);
    };

    // Request permission on iOS 13+
    if (typeof (DeviceOrientationEvent as any)?.requestPermission === 'function') {
      (DeviceOrientationEvent as any)
        .requestPermission()
        .then((permission: string) => {
          if (permission === 'granted') {
            window.addEventListener('deviceorientation', handleDeviceOrientation);
          }
        })
        .catch(() => {
          // Permission denied or not available — show static fallback
          setDeviceSupportsOrientation(false);
        });
    } else {
      // Android and older iOS
      window.addEventListener('deviceorientation', handleDeviceOrientation);
      setDeviceSupportsOrientation(true);
    }

    return () => {
      mounted = false;
      window.removeEventListener('deviceorientation', handleDeviceOrientation);
    };
  }, []);

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

          // Feature 1: Attempt continuous autofocus
          try {
            if (capabilities?.focusMode?.includes?.('continuous')) {
              await videoTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] });
            }
          } catch {
            // Silently fail — not supported on this device/browser
          }

          // Feature 2: Detect zoom support
          if (capabilities?.zoom) {
            setZoomSupported(true);
            setZoomRange({ min: capabilities.zoom.min ?? 1, max: Math.min(capabilities.zoom.max ?? 5, 5) });
          }
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
      if (zoomHintTimer.current) clearTimeout(zoomHintTimer.current);
      if (focusRingTimer.current) clearTimeout(focusRingTimer.current);
    };
  }, [facingMode]);


  // Phase 3: Pre-capture quality check — sample video brightness every 2 seconds
  // Brightness sampling handled by BrightnessIndicator component

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

        // Only call onPhotoCapture in rapidfire mode — regular mode defers to Analyze button
        if (isRapidfire) {
          onPhotoCapture?.(photo);
        }

        if (isRegularMode) {
          setPhotos((prev) => [...prev, photo]);
          setPhotosThisItem((prev) => prev + 1);
        } else {
          // Rapidfire mode
          setPhotos((prev) => [...prev, photo]);
        }
      },
      'image/jpeg',
      0.85
    );
  }, [isRapidfire, photos.length, maxPhotos, photosThisItem, onPhotoCapture]);

  // Delete a captured photo
  const deletePhoto = useCallback((index: number) => {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
    setSelectedIndex(null);
  }, []);

  // Toggle torch (phone LED flash)
  const toggleTorch = useCallback(async (forceState?: boolean) => {
    if (!streamRef.current) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (!videoTrack) return;
    const newTorch = forceState !== undefined ? forceState : !torchOn;
    try {
      await videoTrack.applyConstraints({ advanced: [{ torch: newTorch } as any] });
      setTorchOn(newTorch);
    } catch {
      // Silently fail
    }
  }, [torchOn]);

  // Switch front/back camera
  const switchCamera = useCallback(() => {
    setZoomLevel(1);
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  }, []);

  // Feature 2: Apply zoom level (hardware or CSS fallback)
  const applyZoom = useCallback(async (newZoom: number) => {
    if (!streamRef.current) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (!videoTrack) return;
    const clamped = Math.max(zoomRange.min, Math.min(zoomRange.max, newZoom));
    setZoomLevel(clamped);
    // Show zoom hint briefly
    setShowZoomHint(true);
    if (zoomHintTimer.current) clearTimeout(zoomHintTimer.current);
    zoomHintTimer.current = setTimeout(() => setShowZoomHint(false), 1500);
    try {
      if (zoomSupported) {
        await videoTrack.applyConstraints({ advanced: [{ zoom: clamped } as any] });
      } else {
        // CSS digital zoom fallback
        if (videoRef.current) {
          videoRef.current.style.transform = clamped > 1 ? `scale(${clamped})` : '';
        }
      }
    } catch {
      // Silently fail
    }
  }, [zoomRange, zoomSupported]);

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

  // Handle mode change — reset all captured photos and counters when switching
  const handleModeChange = useCallback((newMode: 'rapidfire' | 'regular') => {
    if (newMode !== mode) {
      // Revoke blob URLs for any photos captured in the outgoing mode
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPhotos([]);
      setPhotosThisItem(0);
      onModeChange(newMode);
    }
  }, [mode, photos, onModeChange]);

  // Get last item thumbnail for gallery thumbnail on left of shutter
  const lastItemThumbnail = isRapidfire
    ? rapidItems.length > 0 && rapidItems[0].thumbnailUrl
      ? rapidItems[0].thumbnailUrl
      : null
    : photos.length > 0
    ? photos[photos.length - 1].previewUrl
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black lg:bg-black/70 lg:p-8">
      {/* Inner container: fullscreen mobile, modal desktop */}
      <div className="w-full h-full lg:max-w-2xl lg:max-h-[85vh] lg:rounded-2xl lg:overflow-hidden lg:shadow-2xl bg-black flex flex-col relative">
        {/* Hidden canvas for frame capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Top bar: X left (always visible), Settings right, Mode toggle at top */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 gap-2 bg-gradient-to-b from-black/60 to-transparent min-h-16">
          {/* Left: Close button (always visible, z-20 to never be covered) */}
          <button
            onClick={handleCancel}
            className="flex-shrink-0 text-white text-lg w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
            aria-label="Cancel capture"
          >
            ✕
          </button>

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

          {/* Right: Settings button */}
          <button
            onClick={() => setSettingsPanelOpen(!settingsPanelOpen)}
            className="flex-shrink-0 w-10 h-10 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors flex items-center justify-center relative z-30 cursor-pointer"
            aria-label="Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>

        {/* Settings pill — drops vertically from gear button */}
        {settingsPanelOpen && (
          <>
            {/* Backdrop for tap-outside */}
            <div
              className="fixed inset-0"
              style={{ zIndex: 29 }}
              onClick={() => {
                setSettingsPanelOpen(false);
                setWbSubOpen(false);
              }}
            />

            {/* Main settings pill (vertical column) */}
            <div
              className="absolute right-4 z-30 bg-black/75 backdrop-blur-md rounded-2xl flex flex-col items-center gap-1 px-2 py-2 shadow-lg transition-all duration-150"
              style={{ top: '68px' }}
            >
              {/* Flash/Torch button — cycles: Off → On → Auto → Torch */}
              <button
                onClick={() => {
                  let modes: Array<'off' | 'on' | 'auto' | 'torch'>;
                  if (torchSupported) {
                    modes = ['off', 'on', 'auto', 'torch'];
                  } else {
                    modes = ['off', 'on', 'auto'];
                  }
                  const idx = modes.indexOf(flashMode);
                  const nextMode = modes[(idx + 1) % modes.length];
                  setFlashMode(nextMode);
                  // If transitioning to torch, turn it on
                  if (nextMode === 'torch') {
                    toggleTorch(true);
                  }
                  // If leaving torch, turn it off
                  if (flashMode === 'torch' && nextMode !== 'torch') {
                    toggleTorch(false);
                  }
                }}
                className={`w-10 h-10 rounded-full flex flex-col items-center justify-center transition-all text-base flex-shrink-0 relative ${
                  flashMode !== 'off' ? 'bg-white text-black' : 'bg-white/10 text-white/60'
                } ${flashMode === 'torch' ? 'bg-amber-500 text-white' : ''}`}
                aria-label="Flash"
                title={flashMode === 'off' ? 'Flash off' : flashMode === 'on' ? 'Flash on' : flashMode === 'auto' ? 'Flash auto' : 'Torch on'}
              >
                <span className="text-sm">⚡</span>
                {flashMode === 'on' && <span className="text-xs -mt-1">ON</span>}
                {flashMode === 'auto' && <span className="text-xs -mt-1">A</span>}
                {flashMode === 'torch' && <span className="text-xs -mt-1">🔦</span>}
              </button>

              {/* White balance button with sub-chips to the left */}
              <div className="relative w-10">
                <button
                  onClick={() => setWbSubOpen(!wbSubOpen)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all text-base flex-shrink-0 ${
                    whiteBalance !== 'auto' ? 'bg-white text-black' : 'bg-white/10 text-white/60'
                  }`}
                  aria-label="White balance"
                  title="White balance"
                >
                  ☀
                </button>

                {/* White balance sub-chip row (extends left from WB button) */}
                {wbSubOpen && (
                  <div
                    className="absolute right-full mr-2 top-1/2 -translate-y-1/2 z-40 bg-black/80 backdrop-blur-md rounded-full flex items-center gap-1 px-2 py-1.5 shadow-lg whitespace-nowrap pointer-events-auto"
                  >
                    {['auto', 'daylight', 'incandescent', 'fluorescent'].map((mode) => (
                      <button
                        key={mode}
                        onClick={() => {
                          setWhiteBalance(mode);
                          setWbSubOpen(false);
                        }}
                        className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors cursor-pointer ${
                          whiteBalance === mode
                            ? 'bg-white text-black'
                            : 'bg-white/10 text-white/60'
                        }`}
                      >
                        {mode === 'auto' ? 'Auto' : mode === 'daylight' ? 'Day' : mode === 'incandescent' ? 'Warm' : 'Fluor'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Timer button */}
              <button
                onClick={() => {
                  const timers = [0, 2, 5];
                  const idx = timers.indexOf(timerSeconds);
                  setTimerSeconds(timers[(idx + 1) % timers.length]);
                }}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all text-base flex-shrink-0 relative ${
                  timerSeconds !== 0 ? 'bg-white text-black' : 'bg-white/10 text-white/60'
                }`}
                aria-label="Timer"
                title={timerSeconds === 0 ? 'Timer off' : `Timer ${timerSeconds}s`}
              >
                <span className="flex flex-col items-center">
                  <span>⏱</span>
                  {timerSeconds !== 0 && (
                    <span className="text-xs -mt-1">{timerSeconds}s</span>
                  )}
                </span>
              </button>

              {/* Guides button */}
              <button
                onClick={() => setShowCornerGuides(!showCornerGuides)}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all text-base flex-shrink-0 ${
                  showCornerGuides ? 'bg-white text-black' : 'bg-white/10 text-white/60'
                }`}
                aria-label="Corner guides"
                title={showCornerGuides ? 'Guides on' : 'Guides off'}
              >
                ⊞
              </button>

              {/* Level button */}
              <button
                onClick={() => setShowLevelIndicator(!showLevelIndicator)}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all text-base flex-shrink-0 ${
                  showLevelIndicator ? 'bg-white text-black' : 'bg-white/10 text-white/60'
                }`}
                aria-label="Level indicator"
                title={showLevelIndicator ? 'Level on' : 'Level off'}
              >
                ═
              </button>

              {/* Switch camera button */}
              <button
                onClick={switchCamera}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all text-base flex-shrink-0 bg-white/10 text-white"
                aria-label="Switch camera"
                title="Switch camera"
              >
                🔄
              </button>
            </div>
          </>
        )}

        {/* Mode hint text */}
        <div className="absolute left-0 right-0 z-10 flex justify-center pointer-events-none" style={{ top: '54px' }}>
          <span className="text-xs text-white/50 bg-black/30 rounded-full px-3 py-1.5">
            {isRapidfire
              ? inAddMode
                ? `Adding photo → ${addingItem?.title || 'item'}`
                : '1 photo = 1 item · tap + on any thumbnail to add more'
              : `${photosThisItem}/${MAX_REGULAR} · tap shutter to add`}
          </span>
        </div>


        {/* Camera viewfinder */}
        <div
          className="flex-1 relative overflow-hidden z-0 touch-none"
          onTouchStart={(e) => {
            if (e.touches.length === 2) {
              const dx = e.touches[0].clientX - e.touches[1].clientX;
              const dy = e.touches[0].clientY - e.touches[1].clientY;
              lastPinchDistance.current = Math.sqrt(dx * dx + dy * dy);
            }
          }}
          onTouchMove={(e) => {
            if (e.touches.length === 2 && lastPinchDistance.current !== null) {
              const dx = e.touches[0].clientX - e.touches[1].clientX;
              const dy = e.touches[0].clientY - e.touches[1].clientY;
              const distance = Math.sqrt(dx * dx + dy * dy);
              const delta = distance / lastPinchDistance.current;
              lastPinchDistance.current = distance;
              applyZoom(zoomLevel * delta);
            }
          }}
          onTouchEnd={(e) => {
            if (e.changedTouches.length === 1 && lastPinchDistance.current === null) {
              // Single tap — attempt tap-to-focus
              const touch = e.changedTouches[0];
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const x = (touch.clientX - rect.left) / rect.width;
              const y = (touch.clientY - rect.top) / rect.height;
              // Show focus ring at tap point
              setFocusRing({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
              if (focusRingTimer.current) clearTimeout(focusRingTimer.current);
              focusRingTimer.current = setTimeout(() => setFocusRing(null), 800);
              // Attempt hardware tap-to-focus (Android only, silent fail on iOS)
              if (streamRef.current) {
                const videoTrack = streamRef.current.getVideoTracks()[0];
                if (videoTrack) {
                  try {
                    videoTrack.applyConstraints({
                      advanced: [{ focusMode: 'manual', pointOfInterest: { x, y } } as any],
                    }).catch(() => {});
                  } catch {}
                }
              }
            }
            if (e.touches.length < 2) {
              lastPinchDistance.current = null;
            }
          }}
        >
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
              {showCornerGuides && (
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
              )}

              {/* Level indicator — rotates with device tilt */}
              {showLevelIndicator && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="relative w-20 h-0.5">
                    {deviceSupportsOrientation ? (
                      <>
                        {/* Rotating bar */}
                        <div
                          className={`absolute inset-0 rounded-full transition-transform transition-colors duration-100 ease-out flex items-center justify-center ${
                            Math.abs(levelAngle) <= 2
                              ? 'bg-amber-400 shadow-lg shadow-amber-400/50'
                              : Math.abs(levelAngle) <= 10
                              ? 'bg-white/70'
                              : 'bg-red-500/70'
                          }`}
                          style={{
                            transform: `rotate(${levelAngle}deg)`,
                          }}
                        >
                          {/* Center dot indicator for level */}
                          {Math.abs(levelAngle) <= 2 && (
                            <div className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </div>
                      </>
                    ) : (
                      /* Static fallback for devices without orientation support */
                      <div className="absolute inset-0 rounded-full bg-white/50 flex items-center justify-center animate-pulse">
                        <span className="text-white text-xs font-semibold">–</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Zoom pill — horizontal tappable levels */}
              {zoomSupported && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 bg-black/40 backdrop-blur-sm rounded-full flex items-center gap-0 p-1">
                  {/* Always show 1× */}
                  <button
                    onClick={() => applyZoom(1)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                      Math.abs(zoomLevel - 1) < 0.05
                        ? 'bg-white text-black font-bold'
                        : 'bg-black/50 text-white/80'
                    }`}
                  >
                    1×
                  </button>

                  {/* Show 0.5× if supported (min <= 0.5) */}
                  {zoomRange.min <= 0.5 && (
                    <button
                      onClick={() => applyZoom(0.5)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        Math.abs(zoomLevel - 0.5) < 0.05
                          ? 'bg-white text-black font-bold'
                          : 'bg-black/50 text-white/80'
                      }`}
                    >
                      0.5×
                    </button>
                  )}

                  {/* Show 2× if supported (max >= 2) */}
                  {zoomRange.max >= 2 && (
                    <button
                      onClick={() => applyZoom(2)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        Math.abs(zoomLevel - 2) < 0.05
                          ? 'bg-white text-black font-bold'
                          : 'bg-black/50 text-white/80'
                      }`}
                    >
                      2×
                    </button>
                  )}

                  {/* Show 3× if supported (max >= 3) */}
                  {zoomRange.max >= 3 && (
                    <button
                      onClick={() => applyZoom(3)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        Math.abs(zoomLevel - 3) < 0.05
                          ? 'bg-white text-black font-bold'
                          : 'bg-black/50 text-white/80'
                      }`}
                    >
                      3×
                    </button>
                  )}
                </div>
              )}

              {/* Feature 2: Zoom level hint (transient) */}
              {showZoomHint && zoomLevel !== 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1 text-white text-xs font-medium pointer-events-none z-10">
                  {zoomLevel.toFixed(1)}×
                </div>
              )}

              {/* Feature 3: Focus ring with tap visual */}
              {focusRing && (
                <div
                  className="absolute pointer-events-none z-10 w-12 h-12 border-2 border-white rounded-sm animate-ping"
                  style={{
                    left: focusRing.x - 24,
                    top: focusRing.y - 24,
                  }}
                />
              )}

              {/* Phase 3.5: Real-time brightness indicator */}
              {cameraReady && videoRef.current && (
                <BrightnessIndicator videoRef={videoRef} isActive={cameraReady} />
              )}


              {/* Phase 3.5: Post-capture quality overlay (Tier 2 or 3) */}
              {qualityOverlay && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-40 pointer-events-auto">
                  {qualityOverlay.tier === 3 && (
                    <>
                      {/* Dark overlay */}
                      <div className="absolute inset-0 bg-black/40" />
                      {/* Modal dialog */}
                      <div className="relative bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-xs mx-4 shadow-2xl">
                        <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">
                          Too dark to identify
                        </h3>
                        <p className="text-gray-600 dark:text-gray-300 text-sm mb-4">
                          Move to brighter light and try again. Our system won't be able to identify items in dark photos.
                        </p>
                        <div className="flex gap-3">
                          <button
                            onClick={qualityOverlay.onRetake}
                            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
                          >
                            Retake
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  {qualityOverlay.tier === 2 && (
                    <>
                      {/* Soft amber banner at bottom */}
                      <div className="absolute bottom-0 left-0 right-0 bg-amber-500/90 text-white p-4 rounded-t-2xl">
                        <p className="text-sm font-medium mb-3">
                          Lighting is soft. We'll still try to identify the item.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={qualityOverlay.onUsePhoto}
                            className="flex-1 bg-white text-amber-700 font-medium py-2 rounded-lg text-sm hover:bg-amber-50 transition-colors"
                          >
                            Use Anyway
                          </button>
                          <button
                            onClick={qualityOverlay.onRetake}
                            className="flex-1 bg-amber-700 hover:bg-amber-800 text-white font-medium py-2 rounded-lg text-sm transition-colors"
                          >
                            Retake
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Face detection warning modal */}
              {faceDetectionOverlay && faceDetectionOverlay.pendingPhoto && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-40 pointer-events-auto">
                  {/* Dark overlay */}
                  <div className="absolute inset-0 bg-black/40" />
                  {/* Modal dialog */}
                  <div className="relative bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm mx-4 shadow-2xl flex flex-col items-center">
                    {/* Thumbnail of captured image */}
                    <div className="mb-4 w-24 h-24 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
                      <img
                        src={faceDetectionOverlay.pendingPhoto.previewUrl}
                        alt="Captured photo"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2 text-center">
                      Photo may contain a person
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300 text-sm mb-4 text-center">
                      This photo may contain a person's face. Do you want to upload it anyway?
                    </p>
                    <div className="flex gap-3 w-full">
                      <button
                        onClick={faceDetectionOverlay.onRetake}
                        className="flex-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
                      >
                        Retake
                      </button>
                      <button
                        onClick={faceDetectionOverlay.onUploadAnyway}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
                      >
                        Upload Anyway
                      </button>
                    </div>
                  </div>
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

        {/* Bottom section: compact single row with stats line above */}
        <div className="bg-black/90 pb-safe flex flex-col">
          {/* Stats line (compact, text-xs) */}
          {/* Stats line — single unified row for both modes */}
          {(rapidItems.length > 0 || (!isRapidfire && photosThisItem > 0)) && (
            <div className="text-center text-xs text-white/60 px-4 py-1 flex items-center justify-center gap-2 h-6">
              {/* Pending photos + Analyze (regular mode only) */}
              {!isRapidfire && photosThisItem > 0 && (
                <>
                  <span>{photosThisItem} {photosThisItem === 1 ? 'photo' : 'photos'}</span>
                  <button
                    onClick={() => {
                      const photosToAnalyze = photos.map(({ blob, previewUrl }) => ({ blob, previewUrl }));
                      setPhotos([]);
                      setPhotosThisItem(0);
                      onAnalyze?.(photosToAnalyze);
                    }}
                    className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-2 py-0.5 rounded font-semibold transition-colors"
                  >
                    💾 Save
                  </button>
                </>
              )}
              {/* Analyzed items count */}
              {rapidItems.length > 0 && (
                <>
                  <span>
                    {rapidItems.length} taken · {rapidItems.filter((i) => i.autoEnhanced).length} enhanced ✨
                  </span>
                  {isRapidfire && onEnhanceAll && (
                    <button
                      onClick={onEnhanceAll}
                      className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-2 py-0.5 rounded font-semibold transition-colors"
                    >
                      Enhance
                    </button>
                  )}
                  <span
                    onClick={readyCount > 0 ? onNavigateToReview : undefined}
                    className={`text-xs whitespace-nowrap transition-colors ${
                      readyCount > 0
                        ? 'text-amber-300 underline underline-offset-2 cursor-pointer hover:text-amber-200'
                        : 'text-white/30'
                    }`}
                  >
                    Review ({readyCount})
                  </span>
                </>
              )}
            </div>
          )}

          {/* Adding-to banner (shown when in add-mode) */}
          {isRapidfire && inAddMode && addingItem && (
            <div className="bg-amber-500/20 border-t border-amber-500/30 px-4 py-1 flex items-center justify-between text-xs h-8">
              <div className="flex items-center gap-1.5">
                {addingItem.thumbnailUrl && (
                  <img
                    key={addingItem.thumbnailUrl}
                    src={addingItem.thumbnailUrl}
                    alt={addingItem.title}
                    className="w-6 h-6 rounded object-cover"
                  />
                )}
                <span className="text-white font-medium">
                  Adding to: {addingItem.title || 'item'}
                </span>
              </div>
              <button
                onClick={() => onAddToItem(addingToItemId)}
                className="text-white/60 hover:text-white text-sm"
                aria-label="Cancel add mode"
              >
                ✕
              </button>
            </div>
          )}

          {/* Coaching banner (regular mode only) */}
          {!isRapidfire && !coachingBannerDismissed && (
            <div className="bg-black/60 border-t border-white/10 px-4 py-1.5 flex items-center justify-between text-xs h-10">
              <div className="flex-1">
                <span className="text-white text-sm">
                  {photosThisItem === 0 && "Start with the front view — this becomes your listing photo"}
                  {photosThisItem === 1 && "Shot 1 ✓ — Add a back view or maker's mark next"}
                  {photosThisItem === 2 && "Shot 2 ✓ — Look for labels, tags, or maker's marks"}
                  {photosThisItem === 3 && "Shot 3 ✓ — Add a detail or condition shot"}
                  {photosThisItem === 4 && "Shot 4 ✓ — One more for complete coverage!"}
                  {photosThisItem >= 5 && "Great coverage! Ready to review"}
                </span>
              </div>
              <button
                onClick={() => setCoachingBannerDismissed(true)}
                className="text-white/60 hover:text-white text-sm ml-3 flex-shrink-0"
                aria-label="Dismiss coaching banner"
              >
                ✕
              </button>
            </div>
          )}

          {/* Bottom control: shutter floats above a scrollable thumbnail strip */}
          <div className="relative min-h-[76px]">
            {/* Scroll strip — photos start to the right of the shutter and grow leftward.
                paddingLeft pushes content past the shutter. Auto-scroll keeps newest visible. */}
            <div
              ref={carouselRef}
              className="absolute inset-0 overflow-x-auto scrollbar-hide flex items-center"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
            <div
              className="flex items-center gap-2"
              style={{ paddingLeft: 'calc(50% + 40px)', paddingRight: '16px' }}
            >
              {/* Thumbnail carousel — all analyzed items (both modes) */}
              {rapidItems.length > 0 && rapidItems.map((item) => {
                  const isAddingTo = addingToItemId === item.id;
                  const status = !item.thumbnailUrl
                    ? { icon: '📷', bgColor: 'bg-gray-200', iconColor: 'text-gray-600' }
                    : item.draftStatus === 'DRAFT' && !item.aiError
                    ? { icon: '◐', bgColor: 'bg-amber-100', iconColor: 'text-amber-700' }
                    : item.draftStatus === 'DRAFT' && item.aiError
                    ? { icon: '⚠', bgColor: 'bg-red-100', iconColor: 'text-red-700' }
                    : { icon: '✓', bgColor: 'bg-green-600', iconColor: 'text-white' };

                  return (
                    <div
                      key={item.id}
                      className={`flex-shrink-0 relative cursor-pointer transition-all w-14 h-14 ${
                        isAddingTo ? 'ring-2 ring-amber-400 rounded-lg' : ''
                      }`}
                      onClick={() => onThumbnailTap(item.id)}
                      title={item.title || 'Item'}
                    >
                      {/* Image container — overflow-hidden for rounded corners, no badge clipping */}
                      <div className={`w-full h-full rounded-lg overflow-hidden border flex items-center justify-center ${
                        isAddingTo ? 'border-amber-400 bg-amber-900/30' : 'border-white/40 bg-white/10'
                      }`}>
                        {item.thumbnailUrl ? (
                          <img
                            key={item.thumbnailUrl}
                            src={item.thumbnailUrl}
                            alt={item.title || 'Item'}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const img = e.currentTarget;
                              img.style.display = 'none';
                              const icon = document.createElement('span');
                              icon.textContent = '📷';
                              icon.className = 'text-sm';
                              img.parentElement?.appendChild(icon);
                            }}
                          />
                        ) : (
                          <span className="text-sm">📷</span>
                        )}
                      </div>

                      {/* Loading spinner overlay */}
                      {!item.id.startsWith('temp-') && item.draftStatus === 'DRAFT' && !item.aiError && item.thumbnailUrl && (
                        <div className="absolute inset-0 rounded-lg bg-black/20 flex items-center justify-center">
                          <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                        </div>
                      )}

                      {/* Status badge (top-right) — on outer div, not clipped */}
                      {item.thumbnailUrl && (
                        <div
                          className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold z-10 ${status.bgColor} ${status.iconColor}`}
                        >
                          {status.icon}
                        </div>
                      )}

                      {/* Auto-enhance badge (top-left) */}
                      {item.autoEnhanced && (
                        <div className="absolute -top-1 -left-1 text-xs z-10">✨</div>
                      )}

                      {/* + button — always visible and clickable, bigger (w-7 h-7), corner-tucked */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToItem(item.id);
                        }}
                        className={`absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white transition-all z-10 shadow-md ${
                          isAddingTo
                            ? 'bg-amber-500'
                            : 'bg-black/70 border border-white/60 hover:bg-black/90'
                        }`}
                        aria-label={isAddingTo ? 'Stop adding photos' : 'Add photos to this item'}
                        title={isAddingTo ? 'Stop adding photos' : 'Add photos to this item'}
                      >
                        {isAddingTo ? '×' : '+'}
                      </button>
                    </div>
                  );
                })}

              {/* Regular mode photo thumbnails */}
              {!isRapidfire && photos.length > 0 && photos.map((photo, index) => (
                <div
                  key={index}
                  className="flex-shrink-0 relative cursor-pointer transition-all w-14 h-14 rounded-lg overflow-hidden border border-white/40"
                  onClick={() => setSelectedIndex(index)}
                  title={`Photo ${index + 1}`}
                >
                  {/* Thumbnail image */}
                  <img
                    src={photo.previewUrl}
                    alt={`Captured ${index + 1}`}
                    className="w-full h-full object-cover"
                  />

                  {/* Quick delete button (bottom-right corner) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePhoto(index);
                    }}
                    className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center text-xs font-bold transition-colors shadow-lg"
                    aria-label={`Delete photo ${index + 1}`}
                    title="Delete photo"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>{/* end inner flex */}
            </div>{/* end outer RTL scroll */}

            {/* Shutter: floats above the scroll strip, always centered */}
            <button
              onClick={capturePhoto}
              disabled={!cameraReady || (isRapidfire ? photos.length >= maxPhotos : photosThisItem >= MAX_REGULAR)}
              className={`absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-10 w-16 h-16 rounded-full flex items-center justify-center transition-transform active:scale-90 ${
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
                <div className="w-12 h-12 rounded-full bg-white" />
              )}
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
