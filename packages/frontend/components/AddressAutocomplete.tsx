/**
 * AddressAutocomplete.tsx
 *
 * Address input with autocomplete suggestions from Nominatim (OpenStreetMap).
 * When user selects a suggestion, auto-fills city, state, zip, and lat/lng.
 */

import { useState, useRef, useEffect } from 'react';
import api from '../lib/api';

interface AddressSuggestion {
  displayName: string;
  lat: number;
  lng: number;
  address: string;
  city: string;
  state: string;
  zip: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSuggestionSelected?: (suggestion: AddressSuggestion) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
}

const AddressAutocomplete = ({
  value,
  onChange,
  onSuggestionSelected,
  placeholder = '123 Main St',
  required = false,
  disabled = false,
  id = 'address-autocomplete',
  name = 'address',
}: AddressAutocompleteProps) => {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced autocomplete fetch
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (!value || value.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);

    debounceTimer.current = setTimeout(async () => {
      try {
        const response = await api.get('/geocode/autocomplete', {
          params: { q: value, countrycodes: 'us' },
        });

        const suggestions = response.data.map((item: any) => ({
          displayName: item.display_name,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          address: item.address || '',
          city: item.city || item.town || item.village || '',
          state: item.state || '',
          zip: item.postcode || '',
        }));

        setSuggestions(suggestions.slice(0, 5)); // Limit to 5 suggestions
        setIsOpen(true);
      } catch (error) {
        console.error('Autocomplete error:', error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [value]);

  const handleSelectSuggestion = (suggestion: AddressSuggestion) => {
    onSuggestionSelected?.(suggestion);
    setSuggestions([]);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={suggestionsRef}>
      <input
        id={id}
        name={name}
        type="text"
        value={value}
        onChange={onChange}
        onFocus={() => value.length >= 3 && setIsOpen(true)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:bg-warm-100"
        autoComplete="off"
      />

      {isLoading && (
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {isOpen && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-warm-300 rounded-lg shadow-lg z-10">
          {suggestions.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => handleSelectSuggestion(suggestion)}
              className="w-full text-left px-4 py-3 hover:bg-warm-50 border-b border-warm-100 last:border-b-0 transition"
            >
              <div className="font-medium text-sm text-warm-900">{suggestion.displayName.split(',')[0]}</div>
              <div className="text-xs text-warm-600 truncate">
                {suggestion.displayName.split(',').slice(1).join(',').trim()}
              </div>
            </button>
          ))}
        </div>
      )}

      {isOpen && value.length >= 3 && !isLoading && suggestions.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-warm-300 rounded-lg shadow-lg z-10">
          <div className="px-4 py-3 text-sm text-warm-600">No addresses found. Try a different search.</div>
        </div>
      )}
    </div>
  );
};

export default AddressAutocomplete;
