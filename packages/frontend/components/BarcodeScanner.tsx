/**
 * BarcodeScanner
 *
 * Full-viewport modal that decodes UPC-A, EAN-13, EAN-8, ISBN, CODE_128, and QR
 * via html5-qrcode (already in package.json). Uses the environment-facing camera.
 *
 * Props:
 *   onScan(code, codeType)  — called once on first successful decode; camera stops
 *   onCancel()              — called when user taps Cancel
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';

interface BarcodeScannerProps {
  onScan: (code: string, codeType: string) => void;
  onCancel: () => void;
}

type ScanState = 'requesting' | 'scanning' | 'denied' | 'no-camera' | 'error';

// html5-qrcode format IDs we care about
// (The library only attaches a numeric format ID; we map back to a human name)
// See: https://scanapp.org/html5-qrcode-demo/
const FORMAT_NAME_MAP: Record<number, string> = {
  0:  'QR',
  1:  'AZTEC',
  2:  'CODABAR',
  3:  'CODE_39',
  4:  'CODE_93',
  5:  'CODE_128',
  6:  'DATA_MATRIX',
  7:  'MAXICODE',
  8:  'ITF',
  9:  'PDF_417',
  10: 'RSS_14',
  11: 'RSS_EXPANDED',
  12: 'UPC-A',
  13: 'UPC-E',
  14: 'EAN_13',
  15: 'EAN_8',
};

function formatLabel(formatId: number | undefined): string {
  if (formatId === undefined || formatId === null) return 'UNKNOWN';
  return FORMAT_NAME_MAP[formatId] ?? 'UNKNOWN';
}

// Map html5-qrcode format name to the codeType our backend expects
function toCatalogCodeType(htmlFormatName: string): string {
  if (htmlFormatName.startsWith('UPC')) return 'UPC';
  if (htmlFormatName.startsWith('EAN')) return 'EAN';
  if (htmlFormatName === 'QR') return 'QR';
  // ISBN is EAN-13 with 978/979 prefix — backend handles it as EAN
  return 'EAN';
}

const SCANNER_ELEMENT_ID = 'barcode-scanner-viewfinder';

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScan, onCancel }) => {
  const [scanState, setScanState] = useState<ScanState>('requesting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // html5-qrcode instance stored in a ref — avoid re-renders
  const scannerRef = useRef<any>(null);
  const hasFiredRef = useRef(false);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // Scanner may not be running — safe to ignore
      }
      scannerRef.current = null;
    }
  }, []);

  const startScanner = useCallback(async () => {
    // Dynamically import to avoid SSR issues (html5-qrcode uses browser APIs)
    const { Html5Qrcode } = await import('html5-qrcode');

    // Check camera availability
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasVideo = devices.some((d) => d.kind === 'videoinput');
      if (!hasVideo) {
        setScanState('no-camera');
        return;
      }
    } catch {
      setScanState('no-camera');
      return;
    }

    scannerRef.current = new Html5Qrcode(SCANNER_ELEMENT_ID);

    try {
      await scannerRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 12,
          qrbox: { width: 260, height: 180 }, // wider box suits 1D barcodes
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        },
        (decodedText: string, decodedResult: any) => {
          if (hasFiredRef.current) return; // fire once only
          hasFiredRef.current = true;

          const formatId: number | undefined = decodedResult?.result?.format?.formatName
            ?? decodedResult?.decodedText !== undefined
              ? undefined
              : decodedResult?.format;

          // Prefer the format from the result object
          const rawFormatId: number | undefined =
            decodedResult?.result?.format?.formatName !== undefined
              ? decodedResult.result.format.formatName
              : decodedResult?.format?.formatName;

          const fmtName = rawFormatId !== undefined ? formatLabel(rawFormatId) : 'UNKNOWN';
          const codeType = toCatalogCodeType(fmtName);

          stopScanner().then(() => {
            onScan(decodedText, codeType);
          });
        },
        () => {
          // per-frame error — expected when no barcode is in frame; ignore
        },
      );
      setScanState('scanning');
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setScanState('denied');
      } else if (err?.name === 'NotFoundError') {
        setScanState('no-camera');
      } else {
        setScanState('error');
        setErrorMsg(err?.message ?? 'Failed to start camera');
      }
    }
  }, [onScan, stopScanner]);

  // Start scanner on mount, stop on unmount
  useEffect(() => {
    startScanner();
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancel = useCallback(async () => {
    await stopScanner();
    onCancel();
  }, [stopScanner, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 border-b border-white/10">
        <span className="text-white font-semibold text-base">Scan Barcode</span>
        <button
          type="button"
          onClick={handleCancel}
          className="px-3 py-1.5 text-sm text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          aria-label="Cancel barcode scan"
        >
          Cancel
        </button>
      </div>

      {/* Camera viewport */}
      <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
        {/* html5-qrcode mounts the video feed into this div */}
        <div
          id={SCANNER_ELEMENT_ID}
          className="w-full h-full"
          style={{ background: '#000' }}
        />

        {/* Crosshair / scan zone overlay */}
        {scanState === 'scanning' && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative w-72 h-44">
              {/* Corner markers */}
              <div className="absolute top-0 left-0 w-8 h-8 border-l-2 border-t-2 border-amber-400" />
              <div className="absolute top-0 right-0 w-8 h-8 border-r-2 border-t-2 border-amber-400" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-l-2 border-b-2 border-amber-400" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-r-2 border-b-2 border-amber-400" />
              {/* Scanning line animation */}
              <div
                className="absolute left-2 right-2 h-0.5 bg-amber-400 opacity-75"
                style={{ animation: 'barcode-scan-line 2s linear infinite', top: '50%' }}
              />
            </div>
          </div>
        )}

        {/* Status messages */}
        <div className="absolute bottom-0 left-0 right-0 pb-8 flex flex-col items-center gap-2 pointer-events-none">
          {scanState === 'requesting' && (
            <p className="text-white/80 text-sm">Requesting camera…</p>
          )}
          {scanState === 'scanning' && (
            <p className="text-white/80 text-sm">Point at a barcode — scanning automatically</p>
          )}
          {scanState === 'denied' && (
            <div className="text-center px-6 pointer-events-auto">
              <p className="text-white font-medium mb-1">Camera blocked</p>
              <p className="text-white/60 text-xs mb-3">
                Allow camera access in your browser settings, then try again.
              </p>
              <button
                type="button"
                onClick={() => {
                  hasFiredRef.current = false;
                  setScanState('requesting');
                  startScanner();
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
          {scanState === 'no-camera' && (
            <div className="text-center px-6">
              <p className="text-white font-medium mb-1">No camera found</p>
              <p className="text-white/60 text-xs">Try this on a device with a camera.</p>
            </div>
          )}
          {scanState === 'error' && (
            <div className="text-center px-6 pointer-events-auto">
              <p className="text-red-400 text-sm">{errorMsg ?? 'Camera error'}</p>
              <button
                type="button"
                onClick={() => {
                  hasFiredRef.current = false;
                  setScanState('requesting');
                  startScanner();
                }}
                className="mt-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CSS animation for scan line — inline style tag */}
      <style>{`
        @keyframes barcode-scan-line {
          0%   { transform: translateY(-44px); opacity: 0.4; }
          50%  { opacity: 1; }
          100% { transform: translateY(44px); opacity: 0.4; }
        }
      `}</style>
    </div>
  );
};

export default BarcodeScanner;
