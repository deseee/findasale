import React, { useState, useRef, useCallback, useEffect } from 'react';

/**
 * RapidCapture — Phase 14a camera overlay
 *
 * Opens rear camera via WebRTC getUserMedia.
 * One-handed shutter button, filmstrip carousel of local blob captures.
 * No network calls — all photos stay as blobs until the organizer taps "Done".
 *
 * Layout: fullscreen on mobile, centered modal on desktop (md+).
 */

interface CapturedPhoto {
  blob: Blob;
  previewUrl: string;
  timestamp: number;
}

interface RapidCaptureProps {
  /** Called when user taps "Done" with all captured photos */
  onComplete: (photos: { blob: Blob; previewUrl: string }[]) => void;
  /** Called when user taps "X" / cancels */
  onCancel: () => void;
  /** Max photos allowed (default 20) */
  maxPhotos?: number;
}

const RapidCapture: React.FC<RapidCaptureProps> = ({
  onComplete,
  onCancel,
  maxPhotos = 20,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);

  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [flashEffect, setFlashEffect] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Start camera on mount
  useEffect(() => {
    let mounted = true;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
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
  }, []);

  // Capture a photo from the video stream
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || photos.length >= maxPhotos) return;

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

    // Convert to blob (JPEG, 85% quality — good balance of size vs quality)
    canvas.toBlob(
      (blob) => {
        if (!blob) return;

        const photo: CapturedPhoto = {
          blob,
          previewUrl: URL.createObjectURL(blob),
          timestamp: Date.now(),
        };

        setPhotos((prev) => {
          const next = [...prev, photo];
          // Auto-scroll filmstrip to end
          requestAnimationFrame(() => {
            filmstripRef.current?.scrollTo({
              left: filmstripRef.current.scrollWidth,
              behavior: 'smooth',
            });
          });
          return next;
        });
      },
      'image/jpeg',
      0.85
    );
  }, [photos.length, maxPhotos]);

  // Delete a captured photo
  const deletePhoto = useCallback((index: number) => {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
    setSelectedIndex(null);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black md:bg-black/70 md:p-8">
      {/* Inner container: fullscreen mobile, modal desktop */}
      <div className="w-full h-full md:max-w-2xl md:max-h-[85vh] md:rounded-2xl md:overflow-hidden md:shadow-2xl bg-black flex flex-col relative">
      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent">
        <button
          onClick={handleCancel}
          className="text-white text-2xl w-10 h-10 flex items-center justify-center"
          aria-label="Cancel capture"
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="text-white text-sm font-medium">
          {photos.length} / {maxPhotos} photos
        </div>

        <button
          onClick={handleDone}
          disabled={photos.length === 0}
          className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${
            photos.length > 0
              ? 'bg-amber-600 text-white'
              : 'bg-white/20 text-white/50'
          }`}
        >
          Done
        </button>
      </div>

      {/* Camera viewfinder */}
      <div className="flex-1 relative overflow-hidden">
        {cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            <svg className="w-16 h-16 text-warm-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
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

      {/* Filmstrip + shutter area */}
      <div className="bg-black/90 pb-safe">
        {/* Filmstrip carousel */}
        {photos.length > 0 && (
          <div
            ref={filmstripRef}
            className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {photos.map((photo, i) => (
              <div key={photo.timestamp} className="relative flex-shrink-0">
                <button
                  onClick={() => setSelectedIndex(selectedIndex === i ? null : i)}
                  className={`block rounded-lg overflow-hidden border-2 transition-colors ${
                    selectedIndex === i ? 'border-amber-500' : 'border-transparent'
                  }`}
                >
                  <img
                    src={photo.previewUrl}
                    alt={`Capture ${i + 1}`}
                    className="w-14 h-14 object-cover"
                  />
                </button>
                {selectedIndex === i && (
                  <button
                    onClick={() => deletePhoto(i)}
                    className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow-md"
                    aria-label={`Delete photo ${i + 1}`}
                  >
                    ✕
                  </button>
                )}
                {/* Photo number badge */}
                <span className="absolute bottom-0.5 left-0.5 bg-black/60 text-white text-[9px] px-1 rounded">
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Shutter button row */}
        <div className="flex items-center justify-center py-4 px-6">
          {/* Spacer for centering */}
          <div className="w-16" />

          {/* Shutter button — large for one-handed use */}
          <button
            onClick={capturePhoto}
            disabled={!cameraReady || photos.length >= maxPhotos}
            className={`w-18 h-18 rounded-full border-4 border-white flex items-center justify-center transition-transform active:scale-90 ${
              cameraReady && photos.length < maxPhotos
                ? 'bg-white/20 hover:bg-white/30'
                : 'bg-white/10 opacity-50'
            }`}
            style={{ width: '72px', height: '72px' }}
            aria-label="Capture photo"
          >
            <div className="w-14 h-14 rounded-full bg-white" style={{ width: '56px', height: '56px' }} />
          </button>

          {/* Done shortcut on right */}
          <div className="w-16 flex justify-end">
            {photos.length > 0 && (
              <button
                onClick={handleDone}
                className="bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-full"
              >
                Done ({photos.length})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Full-screen preview overlay when a filmstrip photo is tapped */}
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
      </div>{/* end modal container */}
    </div>
  );
};

export default RapidCapture;
