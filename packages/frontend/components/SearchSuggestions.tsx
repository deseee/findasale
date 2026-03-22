/**
 * SearchSuggestions component
 * Shows recent searches (from localStorage) and popular categories
 */
import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface SearchSuggestionsProps {
  query: string;
  onSelectSuggestion?: (suggestion: string) => void;
  isOpen?: boolean;
}

const POPULAR_CATEGORIES = [
  'Furniture',
  'Antiques',
  'Clothing',
  'Books',
  'Tools',
  'Jewelry',
  'Electronics',
  'Art',
];

const SearchSuggestions: React.FC<SearchSuggestionsProps> = ({
  query,
  onSelectSuggestion,
  isOpen = false,
}) => {
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Load recent searches from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('recentSearches');
      if (stored) {
        try {
          setRecentSearches(JSON.parse(stored));
        } catch {
          setRecentSearches([]);
        }
      }
    }
  }, []);

  // Save a search to localStorage
  const addRecentSearch = (search: string) => {
    if (!search.trim()) return;
    const trimmed = search.trim();
    const updated = [trimmed, ...recentSearches.filter((s) => s !== trimmed)].slice(0, 8);
    setRecentSearches(updated);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('recentSearches', JSON.stringify(updated));
      } catch (e) {
        // QuotaExceededError or other storage errors — continue without caching
        console.warn('Failed to save recent searches to localStorage:', e);
      }
    }
    if (onSelectSuggestion) {
      onSelectSuggestion(trimmed);
    }
  };

  // Determine which suggestions to show
  let suggestionsToShow: string[] = [];
  if (!query || query.length < 2) {
    suggestionsToShow = recentSearches.length > 0 ? recentSearches : POPULAR_CATEGORIES;
  } else {
    // Filter suggestions based on query
    const filtered = recentSearches.filter((s) =>
      s.toLowerCase().includes(query.toLowerCase())
    );
    suggestionsToShow = filtered.length > 0 ? filtered : POPULAR_CATEGORIES.filter((cat) =>
      cat.toLowerCase().includes(query.toLowerCase())
    );
  }

  if (!isOpen || suggestionsToShow.length === 0) {
    return null;
  }

  return (
    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-warm-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
      {recentSearches.length > 0 && !query && (
        <>
          <div className="px-4 py-2 text-xs font-semibold text-warm-600 border-b border-warm-100">
            Recent Searches
          </div>
          {recentSearches.slice(0, 4).map((search) => (
            <button
              key={search}
              onClick={() => addRecentSearch(search)}
              className="w-full text-left px-4 py-2 hover:bg-warm-50 text-sm text-warm-900 flex items-center gap-2 transition-colors"
            >
              <span className="text-warm-400">🕐</span>
              {search}
            </button>
          ))}
        </>
      )}

      {(query ? suggestionsToShow.some((s) => !recentSearches.includes(s)) : true) && (
        <>
          <div className="px-4 py-2 text-xs font-semibold text-warm-600 border-b border-warm-100">
            {query ? 'Matching Searches' : 'Popular Categories'}
          </div>
          {suggestionsToShow
            .filter((s) => !recentSearches.includes(s) || query)
            .map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => addRecentSearch(suggestion)}
                className="w-full text-left px-4 py-2 hover:bg-warm-50 text-sm text-warm-900 flex items-center gap-2 transition-colors"
              >
                <span className="text-amber-600">🔍</span>
                {suggestion}
              </button>
            ))}
        </>
      )}

      {!query && (
        <>
          <div className="px-4 py-2 text-xs font-semibold text-warm-600 border-b border-warm-100">
            Browse Categories
          </div>
          {POPULAR_CATEGORIES.map((cat) => (
            <Link
              key={cat}
              href={`/categories/${cat.toLowerCase()}`}
              className="block px-4 py-2 hover:bg-warm-50 text-sm text-warm-900 transition-colors"
            >
              {cat}
            </Link>
          ))}
        </>
      )}
    </div>
  );
};

export default SearchSuggestions;
