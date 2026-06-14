import React, { useState } from 'react';

/**
 * CatalogSuggestionPanel — surfaces low-confidence catalog enrichment hits
 * (Item.catalogSuggestions JSON) on the edit-item page and lets the organizer
 * one-click accept individual values into the form. Fully additive + guarded:
 * renders nothing when no usable suggestions are present.
 *
 * Accepting only fills the form field via onAccept — it does NOT persist.
 * The existing Save flow writes the value.
 */

// Mirror of the enrichment-cascade JSON shape. All optional/guarded.
export interface CatalogSuggestions {
  source?: string;
  confidence?: number;
  identifiers?: {
    mpn?: string;
    upc?: string;
    ean?: string;
    epid?: string;
    brand?: string;
  } | null;
  package?: {
    weightOz?: number;
    lengthIn?: number;
    widthIn?: number;
    heightIn?: number;
  } | null;
  matchedTitle?: string;
  sources?: string[];
  suggestedAt?: string;
}

// Form field keys this panel can fill. Match the formData keys on the page.
type FieldKey =
  | 'brand'
  | 'mpn'
  | 'upc'
  | 'packageWeightOz'
  | 'packageLengthIn'
  | 'packageWidthIn'
  | 'packageHeightIn';

interface SuggestionRow {
  field: FieldKey;
  label: string;
  value: string;
}

interface CatalogSuggestionPanelProps {
  // Raw catalogSuggestions JSON from item; may be null/undefined/anything.
  suggestions: CatalogSuggestions | null | undefined;
  // Fills a single form field with the accepted value. Does not persist.
  onAccept: (field: FieldKey, value: string) => void;
}

function buildRows(s: CatalogSuggestions): SuggestionRow[] {
  const rows: SuggestionRow[] = [];
  const ids = s.identifiers || {};
  const pkg = s.package || {};

  if (ids.brand) rows.push({ field: 'brand', label: 'Brand', value: String(ids.brand) });
  if (ids.mpn) rows.push({ field: 'mpn', label: 'MPN', value: String(ids.mpn) });
  if (ids.upc) rows.push({ field: 'upc', label: 'UPC', value: String(ids.upc) });

  if (pkg.weightOz != null)
    rows.push({ field: 'packageWeightOz', label: 'Weight (oz)', value: String(Math.round(pkg.weightOz)) });
  if (pkg.lengthIn != null)
    rows.push({ field: 'packageLengthIn', label: 'Length (in)', value: String(pkg.lengthIn) });
  if (pkg.widthIn != null)
    rows.push({ field: 'packageWidthIn', label: 'Width (in)', value: String(pkg.widthIn) });
  if (pkg.heightIn != null)
    rows.push({ field: 'packageHeightIn', label: 'Height (in)', value: String(pkg.heightIn) });

  return rows;
}

const CatalogSuggestionPanel: React.FC<CatalogSuggestionPanelProps> = ({ suggestions, onAccept }) => {
  // Local set of accepted field keys so we can visually dim them after click.
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});

  // Hard guard: nothing renders unless we have a usable object with rows.
  if (!suggestions || typeof suggestions !== 'object') return null;
  const rows = buildRows(suggestions);
  if (rows.length === 0) return null;

  const source = suggestions.source || (suggestions.sources && suggestions.sources[0]) || 'catalog';
  const confidencePct =
    typeof suggestions.confidence === 'number'
      ? Math.round(Math.max(0, Math.min(1, suggestions.confidence)) * 100)
      : null;

  const handleAccept = (row: SuggestionRow) => {
    onAccept(row.field, row.value);
    setAccepted((prev) => ({ ...prev, [row.field]: true }));
  };

  const handleAcceptAll = () => {
    const next: Record<string, boolean> = {};
    rows.forEach((row) => {
      if (!accepted[row.field]) onAccept(row.field, row.value);
      next[row.field] = true;
    });
    setAccepted((prev) => ({ ...prev, ...next }));
  };

  const allAccepted = rows.every((row) => accepted[row.field]);

  return (
    <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            Suggested from {source}
          </div>
          <div className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
            {suggestions.matchedTitle
              ? `Matched "${suggestions.matchedTitle}". `
              : ''}
            Review and accept any values you want. Your saved values are never overwritten automatically.
            {confidencePct != null ? ` (${confidencePct}% match)` : ''}
          </div>
        </div>
        {!allAccepted && (
          <button
            type="button"
            onClick={handleAcceptAll}
            className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
          >
            Accept all
          </button>
        )}
      </div>

      <div className="space-y-2">
        {rows.map((row) => {
          const isAccepted = !!accepted[row.field];
          return (
            <div
              key={row.field}
              className={`flex items-center justify-between gap-3 rounded border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-800 px-3 py-2 ${isAccepted ? 'opacity-60' : ''}`}
            >
              <div className="min-w-0">
                <span className="text-xs font-medium text-warm-500 dark:text-warm-400">{row.label}: </span>
                <span className="text-sm text-warm-800 dark:text-warm-100 break-words">{row.value}</span>
              </div>
              {isAccepted ? (
                <span className="shrink-0 text-xs font-semibold text-green-600 dark:text-green-400">Accepted</span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleAccept(row)}
                  className="shrink-0 px-2.5 py-1 text-xs font-semibold rounded border border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                >
                  Accept
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CatalogSuggestionPanel;
