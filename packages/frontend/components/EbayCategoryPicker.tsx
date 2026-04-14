/**
 * eBay Category Picker Component
 *
 * Live-searching category picker that calls eBay's Taxonomy API
 * to suggest categories based on item title.
 * Returns selected category name (backward compatible).
 */

import React, { useState, useEffect, useRef } from 'react';

interface CategorySuggestion {
  categoryId: string;
  categoryName: string;
  categoryTreeNodeLevel: number;
}

interface EbayCategoryPickerProps {
  value: string; // Selected category name
  onChange: (categoryName: string) => void;
  label?: string;
  placeholder?: string;
}

const EbayCategoryPicker: React.FC<EbayCategoryPickerProps> = ({
  value,
  onChange,
  label = 'eBay Category',
  placeholder = 'Search and select an eBay category...',
}) => {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<CategorySuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/ebay/taxonomy/suggest?q=${encodeURIComponent(input)}`,
          { signal: abortControllerRef.current!.signal }
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`);
        }

        const data = await response.json();
        setSuggestions(data.suggestions || []);
        setIsOpen(true);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Failed to fetch category suggestions:', err);
          setError('Failed to fetch categories');
        }
      } finally {
        setIsLoading(false);
      }
    }, 400); // Debounce 400ms

    return () => clearTimeout(timer);
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

  const handleSelect = (categoryName: string) => {
    onChange(categoryName);
    setInput('');
    setIsOpen(false);
    setSuggestions([]);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
          {label}
        </label>
      )}

      {/* Text input field */}
      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => input.trim() && setIsOpen(true)}
          placeholder={value || placeholder}
          className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
        />

        {/* Loading spinner */}
        {isLoading && (
          <div className="absolute right-4 top-2.5">
            <div className="animate-spin h-5 w-5 border border-amber-500 border-t-transparent rounded-full" />
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Dropdown suggestions */}
      {isOpen && !isLoading && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-700 border border-warm-300 dark:border-gray-600 rounded-lg shadow-lg">
          {suggestions.length === 0 ? (
            <div className="px-4 py-3 text-center text-warm-500 dark:text-warm-400 text-sm">
              {input.trim() ? 'No categories found' : 'Start typing to search'}
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.categoryId}
                  type="button"
                  onClick={() => handleSelect(suggestion.categoryName)}
                  className="w-full text-left px-4 py-2.5 hover:bg-amber-50 dark:hover:bg-gray-600 transition-colors border-b border-warm-100 dark:border-gray-600 last:border-b-0"
                >
                  <div className="text-warm-900 dark:text-warm-100 font-medium">
                    {suggestion.categoryName}
                  </div>
                  <div className="text-xs text-warm-600 dark:text-warm-400">
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
