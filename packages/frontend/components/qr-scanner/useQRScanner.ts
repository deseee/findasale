import { useState, useCallback, useRef, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export type QRScannerState = 'idle' | 'requesting' | 'scanning' | 'denied' | 'no-camera' | 'decoded' | 'error';

interface UseQRScannerProps {
  onDecode?: (text: string) => void;
}

export const useQRScanner = ({ onDecode }: UseQRScannerProps = {}) => {
  const [state, setState] = useState<QRScannerState>('idle');
  const [lastDecode, setLastDecode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Check if device has a camera
  const checkCameraAvailable = useCallback(async (): Promise<boolean> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasVideo = devices.some((device) => device.kind === 'videoinput');
      return hasVideo;
    } catch {
      return false;
    }
  }, []);

  // Start the scanner
  const start = useCallback(
    async (elementId: string) => {
      try {
        setState('requesting');
        setError(null);
        setLastDecode(null);

        // Check for camera availability
        const hasCamera = await checkCameraAvailable();
        if (!hasCamera) {
          setState('no-camera');
          setError('No camera device found');
          return;
        }

        // Initialize html5-qrcode
        scannerRef.current = new Html5Qrcode(elementId);

        // Start scanning with environment-facing camera (mobile default)
        await scannerRef.current.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            setLastDecode(decodedText);
            setState('decoded');
            if (onDecode) {
              onDecode(decodedText);
            }
          },
          () => {
            // No op for errors during scanning (expected for frames without QR)
          }
        );

        setState('scanning');
      } catch (err: any) {
        // Permission denied or other error
        if (err.name === 'NotAllowedError') {
          setState('denied');
          setError('Camera access denied by user');
        } else if (err.name === 'NotFoundError') {
          setState('no-camera');
          setError('No camera device found');
        } else {
          setState('error');
          setError(err.message || 'Failed to start scanner');
        }
      }
    },
    [onDecode, checkCameraAvailable]
  );

  // Stop the scanner
  const stop = useCallback(async () => {
    try {
      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
        } catch {
          // Scanner may not be running, that's ok
        }
        scannerRef.current.clear();
        scannerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      setState('idle');
      setError(null);
      setLastDecode(null);
    } catch (err) {
      console.error('Error stopping scanner:', err);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear();
        scannerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  return {
    state,
    lastDecode,
    error,
    start,
    stop,
  };
};
