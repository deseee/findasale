/**
 * CD2-P2: QR Code for Physical Sales
 *
 * Generates a printable QR code linking to the sale page with utm_source=qr_sign.
 * Uses qrserver.com free API — no npm dependency required.
 *
 * Shows in organizer dashboard (per-sale) and on the sale detail Share section.
 */

import React, { useState } from 'react';

interface SaleQRCodeProps {
  saleId: string;
  saleTitle: string;
  /** Size in pixels for the QR image (default 256) */
  size?: number;
  /** Show the download + print buttons (default true) */
  showActions?: boolean;
}

const SaleQRCode: React.FC<SaleQRCodeProps> = ({
  saleId,
  saleTitle,
  size = 256,
  showActions = true,
}) => {
  const [copied, setCopied] = useState(false);
  const [enlarged, setEnlarged] = useState(false);

  // Build the destination URL with UTM tracking so we know it came from a physical sign
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://finda.sale';
  const saleUrl = `${baseUrl}/sales/${saleId}?utm_source=qr_sign`;
  const encodedUrl = encodeURIComponent(saleUrl);

  // qrserver.com free API — returns a PNG QR code image
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedUrl}&margin=10&color=1a1a1a&bgcolor=ffffff`;
  const qrSrcLarge = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodedUrl}&margin=20&color=1a1a1a&bgcolor=ffffff`;

  const handleDownload = async () => {
    try {
      const response = await fetch(qrSrcLarge);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `findasale-qr-${saleId}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab
      window.open(qrSrcLarge, '_blank');
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(saleUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handlePrint = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Code – ${saleTitle}</title>
          <style>
            body { font-family: sans-serif; text-align: center; padding: 40px; }
            img { width: 300px; height: 300px; margin: 20px auto; display: block; }
            h2 { font-size: 22px; margin-bottom: 4px; }
            p { color: #666; font-size: 14px; margin: 4px 0; }
            .url { font-size: 12px; color: #999; word-break: break-all; max-width: 320px; margin: 16px auto 0; }
          </style>
        </head>
        <body>
          <h2>${saleTitle}</h2>
          <p>Scan to browse this sale on your phone</p>
          <img src="${qrSrcLarge}" alt="QR Code for ${saleTitle}" />
          <p class="url">finda.sale/sales/${saleId}</p>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* QR Code image */}
      <div
        className="border border-warm-200 rounded-xl p-3 bg-white shadow-sm cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => setEnlarged(true)}
        title="Click to enlarge"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrSrc}
          alt={`QR code for ${saleTitle}`}
          width={size}
          height={size}
          className="block"
          loading="lazy"
        />
      </div>

      {showActions && (
        <div className="flex gap-2 flex-wrap justify-center">
          <button
            onClick={handleDownload}
            className="px-3 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 transition-colors"
          >
            ↓ Download PNG
          </button>
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 bg-warm-700 text-white text-xs font-semibold rounded-lg hover:bg-warm-800 transition-colors"
          >
            🖨 Print
          </button>
          <button
            onClick={handleCopyLink}
            className="px-3 py-1.5 bg-warm-100 text-warm-700 text-xs font-semibold rounded-lg hover:bg-warm-200 transition-colors"
          >
            {copied ? '✓ Copied!' : '⎘ Copy link'}
          </button>
        </div>
      )}

      <p className="text-xs text-warm-400 text-center max-w-[240px]">
        Print this QR code on signs, flyers, or lawn signs to drive foot traffic to your digital inventory.
      </p>

      {/* Enlarged modal */}
      {enlarged && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setEnlarged(false)}
        >
          <div className="bg-white rounded-2xl p-6 shadow-2xl text-center max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-warm-900 mb-1">{saleTitle}</h3>
            <p className="text-xs text-warm-400 mb-4">Scan to browse this sale on your phone</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrcLarge} alt={`QR code for ${saleTitle}`} className="mx-auto rounded-lg" width={280} height={280} />
            <div className="flex gap-2 mt-4 justify-center">
              <button onClick={handleDownload} className="px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700">
                ↓ Download
              </button>
              <button onClick={handlePrint} className="px-4 py-2 bg-warm-700 text-white text-sm font-semibold rounded-lg hover:bg-warm-800">
                🖨 Print
              </button>
              <button onClick={() => setEnlarged(false)} className="px-4 py-2 bg-warm-100 text-warm-600 text-sm rounded-lg hover:bg-warm-200">
                Close
              </button>
            </div>
            <p className="text-xs text-warm-300 mt-3 break-all">finda.sale/sales/{saleId}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SaleQRCode;
