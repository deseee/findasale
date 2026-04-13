/**
 * FilterSidebar — Sprint 4b
 * Desktop sticky sidebar + mobile drawer for item search filters.
 * Driven by facet data returned by GET /api/items/search.
 */
import React from 'react';
import { SearchFacets, ItemSearchFilters } from '../hooks/useItemSearch';

const CATEGORIES = [
  'furniture', 'decor', 'vintage', 'textiles', 'collectibles',
  'art', 'antiques', 'jewelry', 'books', 'tools',
  'electronics', 'clothing', 'home', 'other',
];

const CONDITIONS = ['mint', 'excellent', 'good', 'fair', 'poor'];

const SORT_OPTIONS: { value: ItemSearchFilters['sort']; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'newest', label: 'Newest First' },
  { value: 'price_asc', label: 'Price: Low → High' },
  { value: 'price_desc', label: 'Price: High → Low' },
];

interface FilterSidebarProps {
  filters: ItemSearchFilters;
  facets: SearchFacets | null;
  onChange: (next: Partial<ItemSearchFilters>) => void;
  onClear: () => void;
  /** Mobile: whether the drawer is open */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function countFor(
  facets: SearchFacets | null,
  type: 'categories' | 'conditions',
  name: string,
): number | null {
  if (!facets) return null;
  const list = type === 'categories' ? facets.categories : facets.conditions;
  return list.find((f) => f.name.toLowerCase() === name.toLowerCase())?.count ?? null;
}

const CheckRow = ({
  label,
  value,
  selected,
  count,
  onToggle,
}: {
  label: string;
  value: string;
  selected: boolean;
  count: number | null;
  onToggle: () => void;
}) => (
  <label className="flex items-center gap-2 cursor-pointer py-1 group">
    <input
      type="checkbox"
      checked={selected}
      onChange={onToggle}
      className="w-4 h-4 rounded border-warm-300 text-amber-600 focus:ring-amber-500"
    />
    <span className="flex-1 text-sm text-warm-800 capitalize group-hover:text-warm-900">
      {label}
    </span>
    {count !== null && (
      <span className="text-xs text-warm-400">{count}</span>
    )}
  </label>
);

const FiltersContent = ({ filters, facets, onChange, onClear }: Omit<FilterSidebarProps, 'mobileOpen' | 'onMobileClose'>) => {
  const hasActiveFilters =
    filters.category || filters.condition || filters.priceMin || filters.priceMax;

  return (
    <div className="space-y-5">
      {/* Sort */}
      <div>
        <label htmlFor="item-sort" className="block text-sm font-semibold text-warm-900 mb-2">
          Sort by
        </label>
        <select
          id="item-sort"
          value={filters.sort}
          onChange={(e) => onChange({ sort: e.target.value as ItemSearchFilters['sort'], offset: 0 })}
          className="w-full text-sm border border-warm-300 rounded-lg px-3 py-2 bg-white text-warm-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <hr className="border-warm-100" />

      {/* Category */}
      <div>
        <p className="text-sm font-semibold text-warm-900 mb-2">Category</p>
        {CATEGORIES.map((cat) => (
          <CheckRow
            key={cat}
            label={cat}
            value={cat}
            selected={filters.category === cat}
            count={countFor(facets, 'categories', cat)}
            onToggle={() => onChange({ category: filters.category === cat ? '' : cat, offset: 0 })}
          />
        ))}
      </div>

      <hr className="border-warm-100" />

      {/* Condition */}
      <div>
        <p className="text-sm font-semibold text-warm-900 mb-2">Condition</p>
        {CONDITIONS.map((cond) => (
          <CheckRow
            key={cond}
            label={cond}
            value={cond}
            selected={filters.condition === cond}
            count={countFor(facets, 'conditions', cond)}
            onToggle={() => onChange({ condition: filters.condition === cond ? '' : cond, offset: 0 })}
          />
        ))}
      </div>

      <hr className="border-warm-100" />

      {/* Price range */}
      <div>
        <p className="text-sm font-semibold text-warm-900 mb-2">Price Range</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            placeholder="Min"
            value={filters.priceMin}
            onChange={(e) => onChange({ priceMin: e.target.value, offset: 0 })}
            aria-label="Minimum price"
            className="w-full text-sm border border-warm-300 rounded-lg px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <span className="text-warm-400 text-sm">–</span>
          <input
            type="number"
            min={0}
            placeholder="Max"
            value={filters.priceMax}
            onChange={(e) => onChange({ priceMax: e.target.value, offset: 0 })}
            aria-label="Maximum price"
            className="w-full text-sm border border-warm-300 rounded-lg px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Clear */}
      {hasActiveFilters && (
        <button
          onClick={onClear}
          className="w-full text-sm text-amber-700 hover:text-amber-900 underline text-left transition-colors"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
};

const FilterSidebar: React.FC<FilterSidebarProps> = ({
  filters,
  facets,
  onChange,
  onClear,
  mobileOpen,
  onMobileClose,
}) => (
  <>
    {/* Desktop: sticky sidebar */}
    <aside
      className="hidden md:block w-56 flex-shrink-0"
      aria-label="Search filters"
    >
      <div className="sticky top-4 bg-white rounded-xl border border-warm-100 p-4 shadow-sm">
        <p className="text-base font-bold text-warm-900 mb-4">Filters</p>
        <FiltersContent filters={filters} facets={facets} onChange={onChange} onClear={onClear} />
      </div>
    </aside>

    {/* Mobile: full-screen drawer */}
    {mobileOpen && (
      <div
        className="fixed inset-0 z-40 flex flex-col md:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Search filters"
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/40"
          onClick={onMobileClose}
          aria-hidden="true"
        />
        {/* Drawer */}
        <div className="relative mt-auto bg-white rounded-t-2xl max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-warm-100">
            <p className="text-base font-bold text-warm-900">Filters</p>
            <button
              onClick={onMobileClose}
              aria-label="Close filters"
              className="p-2 text-warm-500 hover:text-warm-900 transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="overflow-y-auto px-4 py-4 flex-1">
            <FiltersContent filters={filters} facets={facets} onChange={onChange} onClear={onClear} />
          </div>
          <div className="px-4 py-3 border-t border-warm-100">
            <button
              onClick={onMobileClose}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Show Results
            </button>
          </div>
        </div>
      </div>
    )}
  </>
);

export default FilterSidebar;
