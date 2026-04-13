/**
 * ItemSearch — Sprint 4b
 * Search bar with debounce and mobile filter toggle button.
 * Controlled component — parent owns the query state.
 */
import React, { useEffect, useRef, useState } from 'react';

interface ItemSearchProps {
  value: string;
  onChange: (q: string) => void;
  /** Called after 300ms debounce with the final query */
  onDebouncedChange: (q: string) => void;
  onFilterToggle?: () => void;
  hasActiveFilters?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

const DEBOUNCE_MS = 300;

const ItemSearch: React.FC<ItemSearchProps> = ({
  value,
  onChange,
  onDebouncedChange,
  onFilterToggle,
  hasActiveFilters = false,
  placeholder = 'Search items… (chair, vintage, electronics)',
  autoFocus = false,
}) => {
  const [localValue, setLocalValue] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external value changes (e.g. URL navigation)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setLocalValue(next);
    onChange(next);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onDebouncedChange(next);
    }, DEBOUNCE_MS);
  };

  const handleClear = () => {
    setLocalValue('');
    onChange('');
    onDebouncedChange('');
  };

  return (
    <div className="flex gap-2 items-center">
      {/* Search input */}
      <div className="relative flex-1">
        <label htmlFor="item-search-input" className="sr-only">
          Search items across all sales
        </label>
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 pointer-events-none"
          aria-hidden="true"
        >
          🔍
        </span>
        <input
          id="item-search-input"
          type="search"
          value={localValue}
          onChange={handleChange}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-label="Search items across all sales"
          className="w-full pl-9 pr-8 py-3 border border-warm-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white text-warm-900 text-sm"
        />
        {localValue && (
          <button
            onClick={handleClear}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-700 transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* Mobile filter toggle */}
      {onFilterToggle && (
        <button
          onClick={onFilterToggle}
          aria-label="Toggle filters"
          className={`md:hidden flex items-center gap-1.5 px-4 py-3 border rounded-xl text-sm font-medium transition-colors min-w-[80px] justify-center ${
            hasActiveFilters
              ? 'bg-amber-600 text-white border-amber-600'
              : 'bg-white text-warm-700 border-warm-300 hover:border-amber-400'
          }`}
        >
          ☰ Filters
          {hasActiveFilters && (
            <span className="ml-1 w-2 h-2 rounded-full bg-white inline-block" aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
};

export default ItemSearch;
