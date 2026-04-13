/**
 * eBay Category Picker Component
 *
 * Searchable select dropdown for choosing eBay categories.
 * Displays top-level categories with immediate children.
 * Returns selected category name for database storage.
 */

import React, { useState, useEffect, useRef } from 'react';

interface EbayCategory {
  id: string;
  name: string;
  children: Array<{
    id: string;
    name: string;
  }>;
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
  const [categories, setCategories] = useState<EbayCategory[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Load categories from static JSON
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const response = await fetch('/ebay-categories.json');
        const data = await response.json();
        setCategories(data);
      } catch (error) {
        console.error('Failed to load eBay categories:', error);
      }
    };
    loadCategories();
  }, []);

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

  // Filter categories based on search term
  const filteredCategories = categories.filter(cat => {
    const catMatch = cat.name.toLowerCase().includes(searchTerm.toLowerCase());
    const childMatch = cat.children.some(child =>
      child.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return catMatch || childMatch;
  });

  const handleSelect = (categoryName: string) => {
    onChange(categoryName);
    setIsOpen(false);
    setSearchTerm('');
  };

  const selectedCategory = categories.find(cat =>
    cat.children.some(child => child.name === value) || cat.name === value
  );

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
          {label}
        </label>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500 text-left flex justify-between items-center hover:border-warm-400 dark:hover:border-gray-500 transition-colors"
      >
        <span className={value ? 'text-warm-900 dark:text-warm-100' : 'text-warm-500 dark:text-warm-400'}>
          {value || placeholder}
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-700 border border-warm-300 dark:border-gray-600 rounded-lg shadow-lg">
          {/* Search Input */}
          <input
            type="text"
            placeholder="Search categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border-b border-warm-200 dark:border-gray-600 dark:bg-gray-700 dark:text-warm-100 focus:outline-none focus:ring-0 rounded-t-lg"
          />

          {/* Category List */}
          <div className="max-h-96 overflow-y-auto">
            {filteredCategories.length === 0 ? (
              <div className="px-4 py-3 text-center text-warm-500 dark:text-warm-400 text-sm">
                No categories found
              </div>
            ) : (
              filteredCategories.map((category) => (
                <div key={category.id}>
                  {/* Main Category (parent level) */}
                  <button
                    type="button"
                    onClick={() => handleSelect(category.name)}
                    className={`w-full text-left px-4 py-2.5 hover:bg-amber-50 dark:hover:bg-gray-600 font-semibold transition-colors ${
                      value === category.name
                        ? 'bg-amber-100 dark:bg-amber-900 text-warm-900 dark:text-amber-100'
                        : 'text-warm-900 dark:text-warm-100'
                    }`}
                  >
                    {category.name}
                  </button>

                  {/* Child Categories (indent and gray) */}
                  {category.children
                    .filter(child =>
                      searchTerm === '' || child.name.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => handleSelect(child.name)}
                        className={`w-full text-left px-8 py-2 hover:bg-amber-50 dark:hover:bg-gray-600 transition-colors text-sm ${
                          value === child.name
                            ? 'bg-amber-100 dark:bg-amber-900 text-warm-900 dark:text-amber-100'
                            : 'text-warm-700 dark:text-warm-300'
                        }`}
                      >
                        {child.name}
                      </button>
                    ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EbayCategoryPicker;
