/**
 * CameraPane (ADR-138 batch B7): the phone camera on the stand.
 *
 *  - The shutter button is the primary way to take a picture. Each tap is a new placement (a second copy of the same card is a
 *    second entry); a second tap within 800 ms of the last one is refused as an accidental double tap. "Take this one again"
 *    sends a new picture for the same placement (the server allows one retry when the first was not recognised).
 *  - "Take pictures for me" (auto capture) is OFF by default (ADR-138 D9). When on, the pane looks at a small gray sample about 8
 *    times a second and lets the steady-and-clear machine in lib/cardScanCapture.ts decide: it captures once when a card holds
 *    still, then waits for the stand to look empty again before it can capture again. Starting with a card already on the stand
 *    teaches the wrong scene, so the seller is asked to start empty and has a button to teach the empty stand. A long wait for
 *    the stand to clear offers a reset.
 *  - The picture sent is a JPEG, long edge 1024 px, quality 0.8 and lower until it fits the size limit. It is handed to the page,
 *    which sends it; nothing is stored here.
 *  - UNVERIFIED: the thresholds, autofocus, glare, torch and iOS Safari behaviour need a real phone in a real stand.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SCAN_COPY, phaseHint } from '../../lib/cardScanCopy';
import {
  SAMPLE_HEIGHT,
  SAMPLE_INTERVAL_MS,
  SAMPLE_WIDTH,
  buildCameraConstraints,
  createCaptureState,
  currentPlacementId,
  isWaitingTooLong,
  makeIdPrefix,
  registerManualCapture,
  resetCapture,
  rgbaToGray,
  stepCapture,
  teachEmptyStand,
} from '../../lib/cardScanCapture';
import type { CapturePhase, CaptureState } from '../../lib/cardScanCapture';
import { drawToCanvas, encodeJpegWithinLimit } from './frameUtils';
import ScanNotice from './ScanNotice';
import { mutedCls, primaryBtn, secondaryBtn, smallBtn } from './ui';

export interface CameraPaneProps {
  /** False when the scan is not open, so no picture may be taken. */
  enabled: boolean;
  maxFrameBytes: number;
  onCapture: (blob: Blob, placementId: string) => void;
}

type CameraState = 'starting' | 'ready' | 'denied' | 'unavailable';
type Facing = 'environment' | 'user';

interface TrackCaps {
  torch?: boolean;
  focusMode?: string[];
}

const CameraPane: React.FC<CameraPaneProps> = ({ enabled, maxFrameBytes, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureRef = useRef<CaptureState | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastGrayRef = useRef<number[] | null>(null);
  const onCaptureRef = useRef(onCapture);
  const maxBytesRef = useRef(maxFrameBytes);

  const [cameraState, setCameraState] = useState<CameraState>('starting');
  const [facing, setFacing] = useState<Facing>('environment');
  const [attempt, setAttempt] = useState(0);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [auto, setAuto] = useState(false);
  const [phase, setPhase] = useState<CapturePhase>('EMPTY');
  const [stuck, setStuck] = useState(false);
  const [lastPlacement, setLastPlacement] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    onCaptureRef.current = onCapture;
    maxBytesRef.current = maxFrameBytes;
  });

  const ensureState = useCallback((): CaptureState => {
    if (!captureRef.current) captureRef.current = createCaptureState(makeIdPrefix(Date.now(), Math.random()));
    return captureRef.current;
  }, []);

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Start (or restart) the camera.
  useEffect(() => {
    let mounted = true;
    const start = async () => {
      stopStream();
      setCameraState('starting');
      setTorchOn(false);
      try {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
          setCameraState('unavailable');
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia(buildCameraConstraints(facing));
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          const caps = track.getCapabilities() as unknown as TrackCaps;
          setTorchSupported(!!caps.torch);
          if (caps.focusMode && caps.focusMode.indexOf('continuous') >= 0) {
            try {
              await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet] });
            } catch {
              /* not supported on this device */
            }
          }
        } else {
          setTorchSupported(false);
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            /* the picture still shows once the browser allows playback */
          }
        }
        if (mounted) setCameraState('ready');
      } catch (err) {
        if (!mounted) return;
        const name = err && typeof err === 'object' ? (err as { name?: string }).name : undefined;
        setCameraState(name === 'NotFoundError' || name === 'OverconstrainedError' ? 'unavailable' : 'denied');
      }
    };
    void start();
    return () => {
      mounted = false;
      stopStream();
    };
  }, [facing, attempt, stopStream]);

  // Messages fade after a moment.
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [message]);

  /** A 32 by 24 gray sample of what the camera sees now, or null. */
  const readGray = useCallback((): number[] | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    try {
      let canvas = sampleCanvasRef.current;
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.width = SAMPLE_WIDTH;
        canvas.height = SAMPLE_HEIGHT;
        sampleCanvasRef.current = canvas;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
      return rgbaToGray(ctx.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data);
    } catch {
      return null;
    }
  }, []);

  /** Takes the picture now and hands it to the page under this placement id. */
  const grab = useCallback(async (placementId: string): Promise<void> => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = drawToCanvas(video, video.videoWidth, video.videoHeight);
    const blob = canvas ? await encodeJpegWithinLimit(canvas, maxBytesRef.current) : null;
    if (!blob) {
      setMessage(SCAN_COPY.imageTooBig);
      return;
    }
    onCaptureRef.current(blob, placementId);
  }, []);

  // Auto capture: sample about 8 times a second and let the machine decide.
  useEffect(() => {
    if (cameraState !== 'ready' || !auto || !enabled) return undefined;
    ensureState();
    const timer = window.setInterval(() => {
      const state = captureRef.current;
      const gray = readGray();
      if (!state || !gray) return;
      lastGrayRef.current = gray;
      const step = stepCapture(state, { gray, atMs: Date.now() });
      captureRef.current = step.state;
      setPhase(step.state.phase);
      setStuck(isWaitingTooLong(step.state));
      if (step.action === 'CAPTURE' && step.placementId) {
        setLastPlacement(step.placementId);
        setMessage(SCAN_COPY.pictureTaken);
        void grab(step.placementId);
      }
    }, SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [cameraState, auto, enabled, ensureState, readGray, grab]);

  const onShutter = () => {
    if (cameraState !== 'ready' || !enabled) return;
    const result = registerManualCapture(ensureState(), { gray: lastGrayRef.current || [], atMs: Date.now() });
    if (!result.accepted || !result.placementId) {
      setMessage(SCAN_COPY.shutterBusy);
      return;
    }
    captureRef.current = result.state;
    setPhase(result.state.phase);
    setLastPlacement(result.placementId);
    setMessage(SCAN_COPY.pictureTaken);
    void grab(result.placementId);
  };

  const onRetake = () => {
    if (cameraState !== 'ready' || !enabled) return;
    const placement = currentPlacementId(ensureState());
    if (!placement) return;
    setMessage(SCAN_COPY.pictureTaken);
    void grab(placement);
  };

  const onToggleAuto = (on: boolean) => {
    setAuto(on);
    captureRef.current = resetCapture(ensureState());
    setPhase('EMPTY');
    setStuck(false);
  };

  const onTeachEmpty = () => {
    const gray = readGray();
    if (!gray) return;
    lastGrayRef.current = gray;
    captureRef.current = teachEmptyStand(ensureState(), { gray, atMs: Date.now() });
    setPhase('EMPTY');
    setStuck(false);
  };

  const onResetAuto = () => {
    captureRef.current = resetCapture(ensureState());
    setPhase('EMPTY');
    setStuck(false);
  };

  const onToggleTorch = async () => {
    const stream = streamRef.current;
    const track = stream ? stream.getVideoTracks()[0] : undefined;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as unknown as MediaTrackConstraintSet] });
      setTorchOn(!torchOn);
    } catch {
      setTorchSupported(false);
    }
  };

  const ready = cameraState === 'ready';

  return (
    <div className="min-w-0 space-y-3">
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video ref={videoRef} playsInline muted autoPlay className="mx-auto block max-h-[60vh] min-h-[12rem] w-full object-contain" />
        {cameraState === 'starting' ? (
          <p role="status" className="absolute inset-0 flex items-center justify-center bg-black/60 px-4 text-center text-sm text-white">
            {SCAN_COPY.cameraStarting}
          </p>
        ) : null}
      </div>

      {cameraState === 'denied' || cameraState === 'unavailable' ? (
        <ScanNotice tone="warn" text={cameraState === 'denied' ? SCAN_COPY.cameraDenied : SCAN_COPY.cameraUnavailable}>
          <button type="button" onClick={() => setAttempt(attempt + 1)} className={secondaryBtn}>
            {SCAN_COPY.cameraRetry}
          </button>
        </ScanNotice>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <button type="button" disabled={!ready || !enabled} onClick={onShutter} className={`${primaryBtn} sm:min-w-[12rem]`}>
          {SCAN_COPY.shutter}
        </button>
        <button type="button" disabled={!ready || !enabled || !lastPlacement} onClick={onRetake} className={secondaryBtn}>
          {SCAN_COPY.retake}
        </button>
        <button type="button" disabled={!ready} onClick={() => setFacing(facing === 'environment' ? 'user' : 'environment')} className={secondaryBtn}>
          {SCAN_COPY.switchCamera}
        </button>
        {torchSupported ? (
          <button type="button" aria-pressed={torchOn} disabled={!ready} onClick={() => void onToggleTorch()} className={secondaryBtn}>
            {torchOn ? SCAN_COPY.lightOff : SCAN_COPY.lightOn}
          </button>
        ) : null}
      </div>

      <p role="status" aria-live="polite" className={`min-h-[1.25rem] ${mutedCls}`}>
        {message || ''}
      </p>

      <div className="min-w-0 space-y-2 rounded-lg border border-warm-200 p-3 dark:border-gray-600">
        <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
          <input type="checkbox" className="h-5 w-5 accent-amber-600" checked={auto} onChange={(e) => onToggleAuto(e.target.checked)} />
          <span className="text-sm font-medium text-warm-900 dark:text-warm-100">{SCAN_COPY.autoCaptureLabel}</span>
        </label>
        {auto ? (
          <div className="space-y-2">
            <p className={mutedCls}>{SCAN_COPY.autoCaptureHint}</p>
            <p className={mutedCls}>{SCAN_COPY.autoCaptureStartEmpty}</p>
            <button type="button" disabled={!ready} onClick={onTeachEmpty} className={smallBtn}>
              {SCAN_COPY.standIsEmpty}
            </button>
            <p role="status" aria-live="polite" className="text-sm font-medium text-warm-900 dark:text-warm-100">
              {phaseHint(phase)}
            </p>
            {stuck ? (
              <ScanNotice tone="warn" text={SCAN_COPY.autoStuck}>
                <button type="button" onClick={onResetAuto} className={secondaryBtn}>
                  {SCAN_COPY.autoReset}
                </button>
              </ScanNotice>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default CameraPane;
