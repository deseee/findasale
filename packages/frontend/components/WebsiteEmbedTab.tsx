/**
 * WebsiteEmbedTab
 *
 * Settings tab content for the organizer embeddable widget feature.
 * PRO/TEAMS only — gating is handled by the parent settings page.
 *
 * Shows:
 * - Widget customization options (sale, layout, count, link behavior)
 * - Live preview via real API fetch
 * - Copy-paste embed snippet
 * - How-to instructions
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

interface WidgetItem {
  id: string;
  title: string;
  price: number | null;
  photoUrl: string | null;
  condition: string | null;
  detailUrl: string;
  category: string | null;
}

interface WidgetApiResponse {
  items: WidgetItem[];
  organizer: {
    businessName: string;
    slug: string | null;
  };
  hasMore: boolean;
}

interface Sale {
  id: string;
  title: string;
}

interface WebsiteEmbedTabProps {
  organizerSlug: string;
}

function formatPrice(price: number | null): string {
  if (price == null) return 'Make offer';
  if (price === 0) return 'Free';
  return `$${price.toFixed(2)}`;
}

function ConditionBadge({ condition }: { condition: string | null }) {
  if (!condition) return null;
  let label = condition;
  let cls = 'inline-block text-xs font-semibold px-2 py-0.5 rounded ';
  if (condition === 'NEW') { label = 'New'; cls += 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'; }
  else if (condition.startsWith('USED')) { label = 'Used'; cls += 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'; }
  else if (condition === 'REFURBISHED') { label = 'Refurb'; cls += 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'; }
  else { cls += 'bg-warm-100 text-warm-700 dark:bg-gray-700 dark:text-gray-300'; }
  return <span className={cls}>{label}</span>;
}

function PreviewCard({ item }: { item: WidgetItem }) {
  return (
    <div className="border border-warm-200 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800 flex flex-col">
      {item.photoUrl ? (
        <img
          src={item.photoUrl}
          alt={item.title}
          className="w-full aspect-square object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full aspect-square bg-warm-100 dark:bg-gray-700 flex items-center justify-center text-warm-400 dark:text-gray-500 text-xs">
          No photo
        </div>
      )}
      <div className="p-3 flex flex-col gap-1 flex-1">
        <p className="text-sm font-semibold text-warm-900 dark:text-gray-100 line-clamp-2 leading-snug">{item.title}</p>
        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatPrice(item.price)}</p>
        <ConditionBadge condition={item.condition} />
      </div>
      <div className="px-3 pb-3">
        <a
          href={item.detailUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-xs font-semibold py-1.5 rounded bg-amber-500 hover:bg-amber-600 text-white transition"
        >
          View Item
        </a>
      </div>
    </div>
  );
}

export default function WebsiteEmbedTab({ organizerSlug }: WebsiteEmbedTabProps) {
  const [selectedLimit, setSelectedLimit] = useState<number>(12);
  const [previewOrganizer, setPreviewOrganizer] = useState<string>(organizerSlug);
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync organizerSlug prop into preview state once it resolves
  useEffect(() => {
    if (organizerSlug) setPreviewOrganizer(organizerSlug);
  }, [organizerSlug]);

  // Fetch organizer's sales for "Which sale?" dropdown
  const { data: sales } = useQuery<Sale[]>({
    queryKey: ['organizer-sales-embed'],
    queryFn: () => api.get('/sales?organizerOwn=true&limit=20').then((r) => r.data?.sales ?? r.data ?? []),
    staleTime: 5 * 60_000,
  });

  // Preview fetch from real widget API
  const {
    data: previewData,
    isLoading: previewLoading,
    isError: previewError,
    refetch: refetchPreview,
  } = useQuery<WidgetApiResponse>({
    queryKey: ['widget-preview', previewOrganizer, selectedLimit],
    queryFn: () => {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '') || '';
      return fetch(
        `${backendUrl}/api/widget/inventory?organizer=${encodeURIComponent(previewOrganizer)}&limit=${selectedLimit}`
      ).then((r) => {
        if (!r.ok) throw new Error('Failed to load preview');
        return r.json();
      });
    },
    enabled: !!previewOrganizer,
    staleTime: 60_000,
  });

  const snippetSlug = organizerSlug || 'your-slug';
  const snippet = `<div data-findasale-widget data-organizer="${snippetSlug}" data-limit="${selectedLimit}" data-theme="light"></div>\n<script src="https://finda.sale/api/embed/widget.js" async defer></script>`;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }, [snippet]);

  const LIMIT_OPTIONS = [6, 12, 24] as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-6">
        <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-1">
          Add Your Inventory to Your Website
        </h2>
        <p className="text-warm-600 dark:text-gray-400 text-sm">
          Show your live listings directly on your own site. Shoppers can browse without leaving your page.
        </p>
      </div>

      {/* Customization options */}
      <div className="card p-6">
        <h3 className="text-base font-semibold text-warm-900 dark:text-gray-100 mb-4">Customize Your Widget</h3>
        <div className="space-y-5">

          {/* Which sale */}
          <div>
            <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">
              Which sale?
            </label>
            <select
              className="w-full max-w-xs border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              onChange={() => {/* future: filter by saleId */}}
              defaultValue="active"
            >
              <option value="active">My active sale</option>
              {(sales ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
            <p className="text-xs text-warm-500 dark:text-gray-400 mt-1">
              Choose &quot;My active sale&quot; to keep the widget always up to date.
            </p>
          </div>

          {/* Number of items */}
          <div>
            <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">
              Number of items
            </label>
            <div className="flex gap-2">
              {LIMIT_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSelectedLimit(n)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold border transition ${
                    selectedLimit === n
                      ? 'bg-amber-500 border-amber-500 text-white'
                      : 'border-warm-300 dark:border-gray-600 text-warm-700 dark:text-gray-300 hover:border-amber-400'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-warm-500 dark:text-gray-400 mt-1">
              We recommend 12 for most websites.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => refetchPreview()}
          className="mt-5 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-semibold text-sm transition"
        >
          Update Preview
        </button>
      </div>

      {/* Preview */}
      <div className="card p-6">
        <h3 className="text-base font-semibold text-warm-900 dark:text-gray-100 mb-3">Preview</h3>
        <div className="border border-warm-200 dark:border-gray-700 rounded-lg p-4 min-h-[200px]" style={{ maxWidth: 700 }}>
          {previewLoading && (
            <p className="text-sm text-warm-500 dark:text-gray-400 text-center py-10">Loading preview…</p>
          )}
          {previewError && (
            <p className="text-sm text-red-500 text-center py-10">Could not load preview. Make sure you have published items.</p>
          )}
          {!previewLoading && !previewError && previewData && previewData.items.length === 0 && (
            <div className="flex items-center justify-center min-h-[160px] border-2 border-dashed border-warm-300 dark:border-gray-600 rounded-lg">
              <p className="text-sm text-warm-500 dark:text-gray-400">
                No items to show yet. When you publish a sale with items, they&apos;ll appear here.
              </p>
            </div>
          )}
          {!previewLoading && !previewError && previewData && previewData.items.length > 0 && (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {previewData.items.map((item) => (
                <PreviewCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-warm-400 dark:text-gray-500 mt-2">
          This is an approximate preview. Exact appearance may vary based on your website&apos;s fonts and colors.
        </p>
      </div>

      {/* Embed snippet */}
      <div className="card p-6">
        <h3 className="text-base font-semibold text-warm-900 dark:text-gray-100 mb-3">Your Embed Code</h3>
        <div className="relative">
          <pre className="bg-gray-900 text-green-400 rounded-lg p-4 text-xs overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
{snippet}
          </pre>
          <button
            type="button"
            onClick={handleCopy}
            className={`mt-3 px-4 py-2 rounded-lg text-sm font-semibold transition ${
              copied
                ? 'bg-green-600 text-white'
                : 'bg-warm-200 dark:bg-gray-700 text-warm-900 dark:text-gray-100 hover:bg-warm-300 dark:hover:bg-gray-600'
            }`}
          >
            {copied ? 'Copied! ✓' : 'Copy Code'}
          </button>
        </div>
        <p className="text-xs text-warm-400 dark:text-gray-500 mt-3">
          This code is unique to your account. Don&apos;t share it.
        </p>
      </div>

      {/* Instructions */}
      <div className="card p-6">
        <h3 className="text-base font-semibold text-warm-900 dark:text-gray-100 mb-4">How to Add This to Your Website</h3>
        <ol className="space-y-4">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">1</span>
            <div>
              <p className="text-sm font-medium text-warm-900 dark:text-gray-100">Copy the code above.</p>
              <p className="text-sm text-warm-600 dark:text-gray-400">Click &quot;Copy Code&quot; to copy your personal embed snippet.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">2</span>
            <div>
              <p className="text-sm font-medium text-warm-900 dark:text-gray-100">Open your website editor.</p>
              <p className="text-sm text-warm-600 dark:text-gray-400">
                Go to the page where you want to show your inventory. Look for a way to add custom code or HTML.
                In Wix, this is called &quot;Embed HTML.&quot; In Squarespace, look for a &quot;Code Block.&quot;
                In WordPress, use a Custom HTML block. In Shopify, paste it into your theme&apos;s HTML.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">3</span>
            <div>
              <p className="text-sm font-medium text-warm-900 dark:text-gray-100">Paste and save.</p>
              <p className="text-sm text-warm-600 dark:text-gray-400">
                Paste the code into the custom HTML area and save your page. Your live inventory will appear right away.
              </p>
            </div>
          </li>
        </ol>
        <p className="text-sm text-warm-500 dark:text-gray-400 mt-5">
          Not sure how to find the custom code area?{' '}
          <a href="/contact" className="text-amber-600 hover:underline">
            Contact us and we&apos;ll walk you through it.
          </a>
        </p>
      </div>
    </div>
  );
}
