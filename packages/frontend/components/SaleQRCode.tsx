/**
 * CD2-P2: QR Code for Physical Sales
 *
 * Generates a printable QR code linking to the sale page with utm_source=qr_sign.
 *
 * Primary path (2026-09-29): the organizer-authenticated POST /api/sales/:id/generate-qr returns an SVG
 * rendered on our own server, so the sale URL is no longer sent to a third party. If that request
 * fails (offline, session expired, API error) the component falls back to the original qrserver.com
 * image URL so the organizer can still get a code. Both routes stamp utm_source=qr_sign.
 *
 * Shows in organizer dashboard (per-sale) and on the sale detail Share section.
 */

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import api from '../lib/api';

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
  // Server-generated SVG (markup for print, object URL for <img>). status: loading -> server | fallback
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [svgUrl, setSvgUrl] = useState<string | null>(null);
  const [source, setSource] = useState<'loading' | 'server' | 'fallback'>('loading');

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setSource('loading');
    api
      .post(
        `/sales/${encodeURIComponent(saleId)}/generate-qr`,
        { utm_source: 'qr_sign' },
        { responseType: 'text', transformResponse: (r: unknown) => r }
      )
      .then((res) => {
        const markup = typeof res.data === 'string' ? res.data : '';
        if (cancelled) return;
        if (!markup.trim().startsWith('<svg') && !markup.includes('<svg')) throw new Error('Unexpected QR response');
        createdUrl = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
        setSvgMarkup(markup);
        setSvgUrl(createdUrl);
        setSource('server');
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('Server QR unavailable, using fallback image service:', err?.message);
        setSource('fallback');
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [saleId]);

  // Build the destination URL with UTM tracking so we know it came from a physical sign
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://finda.sale';
  const saleUrl = `${baseUrl}/sales/${saleId}?utm_source=qr_sign`;
  const encodedUrl = encodeURIComponent(saleUrl);

  // Fallback only: qrserver.com free API returns a PNG QR code image (sends the sale URL to a third party)
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedUrl}&margin=10&color=1a1a1a&bgcolor=ffffff`;
  const qrSrcLarge = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodedUrl}&margin=20&color=1a1a1a&bgcolor=ffffff`;

  const escapeHtml = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Draw the server SVG onto a canvas and export a 600px PNG (white background, quiet zone included).
  const svgToPngBlob = (url: string): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable'));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 600, 600);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, 600, 600);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png');
      };
      img.onerror = () => reject(new Error('SVG load failed'));
      img.src = url;
    });

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownload = async () => {
    if (source === 'server' && svgUrl && svgMarkup) {
      try {
        triggerDownload(await svgToPngBlob(svgUrl), `findasale-qr-${saleId}.png`);
      } catch {
        // Canvas export failed: hand over the vector file instead (prints even sharper)
        triggerDownload(new Blob([svgMarkup], { type: 'image/svg+xml' }), `findasale-qr-${saleId}.svg`);
      }
      return;
    }
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
    const printTitle = escapeHtml(saleTitle);
    const qrPrintMarkup =
      source === 'server' && svgMarkup
        ? `<div class="qr">${svgMarkup}</div>`
        : `<img src="${qrSrcLarge}" alt="QR Code for ${printTitle}" />`;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Code – ${printTitle}</title>
          <style>
            body { font-family: sans-serif; text-align: center; padding: 40px; }
            img { width: 300px; height: 300px; margin: 20px auto; display: block; }
            .qr { width: 300px; height: 300px; margin: 20px auto; }
            .qr svg { width: 100%; height: 100%; display: block; }
            h2 { font-size: 22px; margin-bottom: 4px; }
            p { color: #666; font-size: 14px; margin: 4px 0; }
            .url { font-size: 12px; color: #999; word-break: break-all; max-width: 320px; margin: 16px auto 0; }
          </style>
        </head>
        <body>
          <h2>${printTitle}</h2>
          <p>Scan to browse this sale on your phone</p>
          ${qrPrintMarkup}
          <p class="url">finda.sale/sales/${saleId}</p>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  const useServer = source === 'server' && !!svgUrl;
  const displaySrc = useServer ? (svgUrl as string) : qrSrc;
  const displaySrcLarge = useServer ? (svgUrl as string) : qrSrcLarge;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* QR Code image */}
      <button
        onClick={() => setEnlarged(true)}
        className="border border-warm-200 dark:border-warm-700 rounded-xl p-3 bg-white dark:bg-warm-800 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
        title="Click to enlarge"
        aria-label={`Enlarge QR code for ${saleTitle}`}
      >
        {source === 'loading' ? (
          <div
            className="animate-pulse bg-warm-200 dark:bg-gray-700 rounded"
            style={{ width: size, height: size }}
            aria-busy="true"
            aria-label="Generating QR code"
          />
        ) : (
          <Image
            src={displaySrc}
            alt={`QR code for ${saleTitle}`}
            width={size}
            height={size}
            className="block"
            unoptimized={useServer}
          />
        )}
      </button>

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
          role="button"
          tabIndex={0}
          aria-modal="true"
          aria-label="Enlarged QR code view"
          onClick={() => setEnlarged(false)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEnlarged(false); } }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-2xl text-center max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-warm-900 dark:text-gray-100 mb-1">{saleTitle}</h3>
            <p className="text-xs text-warm-400 dark:text-gray-400 mb-4">Scan to browse this sale on your phone</p>
            <Image src={displaySrcLarge} alt={`QR code for ${saleTitle}`} width={280} height={280} className="mx-auto rounded-lg bg-white" unoptimized={useServer} />
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
