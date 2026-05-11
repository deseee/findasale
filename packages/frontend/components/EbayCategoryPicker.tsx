/**
 * eBay Category Picker Component
 *
 * Live-searching category picker that calls eBay's Taxonomy API
 * to suggest categories based on item title.
 * Returns selected category name (backward compatible).
 */

import React, { useState, useEffect, useRef } from 'react';
import api from '../lib/api';

interface CategorySuggestion {
  categoryId: string;
  categoryName: string;
  categoryTreeNodeLevel: number;
  l1CategoryName?: string; // eBay L1 category name
}

interface CategoryPickerPayload {
  leafCategoryId: string; // eBay leaf category numeric ID
  leafCategoryName: string; // eBay leaf category name
  l1CategoryName: string; // eBay L1 category name for FindA.Sale "category" field
}

interface EbayCategoryPickerProps {
  value: string; // L1 category name (for backward compat / display)
  ebayCategoryName?: string; // Leaf category name for pre-populating confirmed selection
  onChange: (payload: CategoryPickerPayload) => void;
  label?: string;
  placeholder?: string;
  defaultSearch?: string; // Pre-populate search with this value on mount (used when no eBay category confirmed yet)
}

const EbayCategoryPicker: React.FC<EbayCategoryPickerProps> = ({
  value,
  ebayCategoryName,
  onChange,
  label = 'eBay Category',
  placeholder = 'Search and select an eBay category...',
  defaultSearch,
}) => {
  // defaultSearch is used as a hint label only — NOT auto-populated into the search input
  // to avoid triggering noisy empty-result dropdowns on mount.
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<CategorySuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // Track the confirmed leaf selection for display (name + L1 parent)
  const [selectedLeaf, setSelectedLeaf] = useState<{ name: string; l1: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Pre-populate confirmed selection when component loads with an existing ebayCategoryName
  useEffect(() => {
    if (ebayCategoryName && !selectedLeaf) {
      setSelectedLeaf({ name: ebayCategoryName, l1: value || '' });
    }
  }, [ebayCategoryName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced category search
  useEffect(() => {
    if (!input.trim()) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsLoading(true);
    setError('');

    const controller = abortControllerRef.current;
    const timer = setTimeout(async () => {
      try {
        const response = await api.get(
          `/ebay/taxonomy/suggest?q=${encodeURIComponent(input)}`,
          { signal: controller.signal }
        );

        setSuggestions(response.data.suggestions || []);
        setIsOpen(true);
      } catch (err: any) {
        // Suppress abort/cancel errors from debounce — not real failures
        const isCancelled = err.name === 'AbortError' || err.name === 'CanceledError' || err.name === 'CancelledError';
        if (!isCancelled) {
          const status = err?.response?.status;
          if (status === 503 || status === 401 || status === 403) {
            setError('Category search temporarily unavailable');
          } else {
            console.error('Failed to fetch category suggestions:', err);
            setError('Failed to fetch categories');
          }
        }
      } finally {
        setIsLoading(false);
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [input]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (suggestion: CategorySuggestion) => {
    const l1 = suggestion.l1CategoryName || 'Everything Else';
    onChange({
      leafCategoryId: suggestion.categoryId,
      leafCategoryName: suggestion.categoryName,
      l1CategoryName: l1,
    });
    setSelectedLeaf({ name: suggestion.categoryName, l1 });
    setInput('');
    setIsOpen(false);
    setSuggestions([]);
  };

  const handleClear = () => {
    setSelectedLeaf(null);
    setInput('');
    onChange({ leafCategoryId: '', leafCategoryName: '', l1CategoryName: '' });
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <label className="block text-sm font-medium text-[#1A1814] dark:text-[#F5F5F0] mb-2">
          {label}
        </label>
      )}

      {/* Confirmed selection chip — shown when a leaf category has been selected */}
      {selectedLeaf ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-warm-100 dark:bg-[#3A3A3C] border border-warm-300 dark:border-[#3A3A3C] rounded-lg">
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-[#1A1814] dark:text-[#F5F5F0] truncate block">
              {selectedLeaf.name}
            </span>
            {selectedLeaf.l1 && (
              <span className="text-xs text-warm-700 dark:text-[#B8B8BA]">
                {selectedLeaf.l1}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="flex-shrink-0 text-warm-500 hover:text-[#1A1814] dark:text-[#B8B8BA] dark:hover:text-[#F5F5F0] transition-colors text-lg leading-none"
            aria-label="Clear selected category"
          >
            ×
          </button>
        </div>
      ) : (
        /* Search input — shown when no selection confirmed */
        <div className="relative">
          {/* Current category hint — show AI-tagged category as a soft badge */}
          {defaultSearch && !input && (
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-warm-500 dark:text-[#B8B8BA] uppercase tracking-wide">Current:</span>
              <span className="text-[10px] font-mono text-warm-700 dark:text-[#D0D0CC] bg-warm-100 dark:bg-[#3A3A3C] px-1.5 py-0.5 rounded">{defaultSearch}</span>
            </div>
          )}
          <input
            id="ebay-category-search"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => input.trim() && setIsOpen(true)}
            placeholder={defaultSearch ? `Refine: search eBay categories…` : placeholder}
            aria-invalid={!!error}
            aria-describedby={error ? "ebay-category-error" : undefined}
            className="w-full px-4 py-2 border border-warm-300 dark:border-[#3A3A3C] bg-white dark:bg-[#3A3A3C] text-[#1A1814] dark:text-[#F5F5F0] placeholder-warm-400 dark:placeholder-[#B8B8BA] rounded-lg focus:ring-2 focus:ring-[#C8552B]/40 focus:outline-none"
          />

          {/* Loading spinner */}
          {isLoading && (
            <div className="absolute right-4 top-2.5">
              <div className="animate-spin h-5 w-5 border border-amber-500 border-t-transparent rounded-full" />
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {error && (
        <p id="ebay-category-error" role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Dropdown suggestions */}
      {isOpen && !isLoading && !selectedLeaf && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-[#2C2C2E] border border-warm-200 dark:border-[#3A3A3C] rounded-lg shadow-lg">
          {suggestions.length === 0 ? (
            <div className="px-4 py-3 text-center text-warm-700 dark:text-[#B8B8BA] text-sm">
              {input.trim() ? 'No categories found' : 'Start typing to search'}
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.categoryId}
                  type="button"
                  onClick={() => handleSelect(suggestion)}
                  className="w-full text-left px-4 py-2.5 hover:bg-warm-100 dark:hover:bg-[#3A3A3C] transition-colors border-b border-warm-100 dark:border-[#3A3A3C] last:border-b-0"
                >
                  <div className="text-[#1A1814] dark:text-[#F5F5F0] font-medium">
                    {suggestion.categoryName}
                  </div>
                  <div className="text-xs text-warm-700 dark:text-[#B8B8BA] mb-1">
                    {suggestion.l1CategoryName || 'Everything Else'}
                  </div>
                  <div className="text-xs text-warm-600 dark:text-[#B8B8BA]">
                    ID: {suggestion.categoryId}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
};

export default EbayCategoryPicker;