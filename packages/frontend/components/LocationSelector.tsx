/**
 * LocationSelector Component
 *
 * Feature #311: Multi-Location Inventory View
 * Dropdown selector for choosing a location on forms.
 *
 * Only shows if user has TEAMS tier and locations exist.
 * Otherwise renders nothing (parent is responsible for null checks).
 */

import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { useOrganizerTier } from '../hooks/useOrganizerTier';

interface LocationSelectorProps {
  value: string | null | undefined;
  onChange: (locationId: string | null) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
}

interface Location {
  id: string;
  name: string;
}

const LocationSelector: React.FC<LocationSelectorProps> = ({
  value,
  onChange,
  label = 'Location',
  placeholder = 'Select a location (optional)',
  required = false,
}) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const { canAccess } = useOrganizerTier();

  useEffect(() => {
    const fetchLocations = async () => {
      try {
        setLoading(true);
        const res = await api.get('/locations');
        setLocations(res.data || []);
      } catch (error) {
        console.error('Failed to fetch locations:', error);
        setLocations([]);
      } finally {
        setLoading(false);
      }
    };

    // Only fetch if user has TEAMS tier
    if (canAccess('TEAMS')) {
      fetchLocations();
    }
  }, [canAccess]);

  // Don't render if not TEAMS or no locations exist
  if (!canAccess('TEAMS') || locations.length === 0) {
    return null;
  }

  return (
    <div>
      <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
        {label} {!required && <span className="text-warm-400 font-normal">(optional)</span>}
      </label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={loading}
        required={required}
        className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
      >
        <option value="">{placeholder}</option>
        {locations.map(loc => (
          <option key={loc.id} value={loc.id}>
            {loc.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default LocationSelector;
