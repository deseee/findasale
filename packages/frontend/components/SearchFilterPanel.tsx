/**
 * SearchFilterPanel component for advanced search filtering.
 * Displays desktop sidebar and mobile slide-down UI with collapsible filters.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';

export interface SearchFilters {
  priceMin: number | null;
  priceMax: number | null;
  condition: string;
  category: string;
  saleStatus: 'all' | 'active' | 'upcoming';
  sortBy: 'recent' | 'price_asc' | 'price_desc' | 'ending_soon';
  saleType: string;
}

interface SearchFilterPanelProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  resultCount?: number;
  categories?: string[];
  isMobile?: boolean;
}

const CONDITION_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'Excellent', label: 'Excellent' },
  { value: 'Very Good', label: 'Very Good' },
  { value: 'Good', label: 'Good' },
  { value: 'Fair', label: 'Fair' },
  { value: 'Poor', label: 'Poor' },
];

const DEFAULT_CATEGORIES = [
  'Furniture',
  'Clothing',
  'Electronics',
  'Books',
  'Antiques',
  'Tools',
  'Kitchen',
  'Art',
  'Jewelry',
  'Other',
];

const SALE_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'ESTATE', label: 'Estate Sale' },
  { value: 'YARD', label: 'Yard Sale' },
  { value: 'AUCTION', label: 'Auction' },
  { value: 'FLEA_MARKET', label: 'Flea Market' },
  { value: 'CONSIGNMENT', label: 'Consignment' },
  { value: 'GARAGE', label: 'Garage Sale' },
  { value: 'MOVING', label: 'Moving Sale' },
  { value: 'DOWNSIZING', label: 'Downsizing Sale' },
  { value: 'SWAP_MEET', label: 'Swap Meet' },
  { value: 'POPUP', label: 'Pop-Up Sale' },
  { value: 'LIQUIDATION', label: 'Liquidation Sale' },
  { value: 'CHARITY', label: 'Charity Sale' },
  { value: 'RETAIL', label: 'Retail Store' },
  { value: 'ONLINE', label: 'Online Sale' },
];

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'ending_soon', label: 'Ending Soon' },
];

const SearchFilterPanel: React.FC<SearchFilterPanelProps> = ({
  filters,
  onFiltersChange,
  resultCount,
  categories = DEFAULT_CATEGORIES,
  isMobile = false,
}) => {
  const [isOpen, setIsOpen] = useState(!isMobile);
  const [priceMinInput, setPriceMinInput] = useState(
    filters.priceMin !== null ? (filters.priceMin / 100).toString() : ''
  );
  const [priceMaxInput, setPriceMaxInput] = useState(
    filters.priceMax !== null ? (filters.priceMax / 100).toString() : ''
  );
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Count active filters
  const activeFilterCount = [
    filters.priceMin !== null || filters.priceMax !== null ? 1 : 0,
    filters.condition ? 1 : 0,
    filters.category ? 1 : 0,
    filters.saleStatus !== 'all' ? 1 : 0,
    filters.saleType ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const handlePriceMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPriceMinInput(val);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      const priceMin = val ? Math.max(0, parseInt(val) * 100) : null;
      onFiltersChange({ ...filters, priceMin });
    }, 500);
  };

  const handlePriceMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPriceMaxInput(val);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      const priceMax = val ? Math.max(0, parseInt(val) * 100) : null;
      onFiltersChange({ ...filters, priceMax });
    }, 500);
  };

  const handleConditionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFiltersChange({ ...filters, condition: e.target.value });
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFiltersChange({ ...filters, category: e.target.value });
  };

  const handleSaleStatusChange = (status: 'all' | 'active' | 'upcoming') => {
    onFiltersChange({ ...filters, saleStatus: status });
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFiltersChange({ ...filters, sortBy: e.target.value as any });
  };

  const handleSaleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFiltersChange({ ...filters, saleType: e.target.value });
  };

  const handleClearFilters = () => {
    setPriceMinInput('');
    setPriceMaxInput('');
    onFiltersChange({
      priceMin: null,
      priceMax: null,
      condition: '',
      category: '',
      saleStatus: 'all',
      sortBy: 'recent',
      saleType: '',
    });
  };

  const filterContent = (
    <div className="space-y-6">
      {/* Price Range */}
      <div>
        <h3 className="font-semibold text-warm-900 dark:text-gray-200 mb-3">Price Range</h3>
        <div className="flex gap-2">
          <div className="flex-1">
            <label htmlFor="price-min" className="sr-only">Minimum price</label>
            <input
              id="price-min"
              type="number"
              placeholder="Min $"
              value={priceMinInput}
              onChange={handlePriceMinChange}
              className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100"
              min="0"
              aria-label="Minimum price"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="price-max" className="sr-only">Maximum price</label>
            <input
              id="price-max"
              type="number"
              placeholder="Max $"
              value={priceMaxInput}
              onChange={handlePriceMaxChange}
              className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100"
              min="0"
              aria-label="Maximum price"
            />
          </div>
        </div>
      </div>

      {/* Condition */}
      <div>
        <label htmlFor="condition-select" className="font-semibold text-warm-900 dark:text-gray-200 mb-3 block">Condition</label>
        <select
          id="condition-select"
          value={filters.condition}
          onChange={handleConditionChange}
          className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100"
        >
          {CONDITION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Category */}
      <div>
        <label htmlFor="category-select" className="font-semibold text-warm-900 dark:text-gray-200 mb-3 block">Category</label>
        <select
          id="category-select"
          value={filters.category}
          onChange={handleCategoryChange}
          className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Sale Type */}
      <div>
        <label htmlFor="saletype-select" className="font-semibold text-warm-900 dark:text-gray-200 mb-3 block">Sale Type</label>
        <select
          id="saletype-select"
          value={filters.saleType}
          onChange={handleSaleTypeChange}
          className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100"
        >
          {SALE_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Sale Status */}
      <div>
        <h3 className="font-semibold text-warm-900 dark:text-gray-200 mb-3">Sale Status</h3>
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="saleStatus"
              checked={filters.saleStatus === 'all'}
              onChange={() => handleSaleStatusChange('all')}
              className="w-4 h-4"
            />
            <span className="text-sm text-warm-900 dark:text-gray-200">All Sales</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="saleStatus"
              checked={filters.saleStatus === 'active'}
              onChange={() => handleSaleStatusChange('active')}
              className="w-4 h-4"
            />
            <span className="text-sm text-warm-900 dark:text-gray-200">Active Now</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="saleStatus"
              checked={filters.saleStatus === 'upcoming'}
              onChange={() => handleSaleStatusChange('upcoming')}
              className="w-4 h-4"
            />
            <span className="text-sm text-warm-900 dark:text-gray-200">Upcoming</span>
          </label>
        </div>
      </div>

      {/* Sort */}
      <div>
        <label htmlFor="sortby-select" className="font-semibold text-warm-900 dark:text-gray-200 mb-3 block">Sort By</label>
        <select
          id="sortby-select"
          value={filters.sortBy}
          onChange={handleSortChange}
          className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Clear Filters */}
      {activeFilterCount > 0 && (
        <button
          onClick={handleClearFilters}
          className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 hover:bg-warm-100 dark:hover:bg-gray-700 text-warm-700 dark:text-warm-300 font-medium rounded-lg transition-colors text-sm"
        >
          Clear Filters
        </button>
      )}
    </div>
  );

  // Desktop sidebar
  if (!isMobile) {
    return (
      <div className="w-64 flex-shrink-0 pr-6">
        <div className="sticky top-20">
          <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-6">Filters</h2>
          {filterContent}
          {resultCount !== undefined && (
            <p className="text-xs text-warm-500 dark:text-warm-400 mt-6">
              {resultCount} item{resultCount !== 1 ? 's' : ''} found with these filters
            </p>
          )}
        </div>
      </div>
    );
  }

  // Mobile slide-down panel
  return (
    <div className="mb-6">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-warm-300 dark:border-gray-600 rounded-lg hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-between text-warm-900 dark:text-warm-100 font-medium"
      >
        <div className="flex items-center gap-2">
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 bg-amber-500 text-white text-xs rounded-full font-bold">
              {activeFilterCount}
            </span>
          )}
        </div>
        <span className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {isOpen && (
        <div className="mt-4 p-4 bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg space-y-4">
          {filterContent}
          {resultCount !== undefined && (
            <p className="text-xs text-warm-500 dark:text-warm-400">
              {resultCount} item{resultCount !== 1 ? 's' : ''} found
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchFilterPanel;
