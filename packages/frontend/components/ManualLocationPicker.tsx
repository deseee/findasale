/**
 * ManualLocationPicker.tsx
 *
 * Fallback UI when Nominatim geocoding fails. Shows an interactive Leaflet map
 * where organizers can click or drag a marker to set their sale's coordinates.
 *
 * Usage: Display below the yellow "Coordinates not found" warning when geocodingAttempted is true.
 */

import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvent } from 'react-leaflet';
import L from 'leaflet';
import api from '../lib/api';

// Fix Leaflet's default icon paths
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Red icon for manually-selected location
const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  crossOrigin: true,
});

interface ManualLocationPickerProps {
  saleId: string;
  onLocationSet: () => void; // Called after successful API save, dismisses the picker
}

// Click handler component
const MapClickHandler: React.FC<{
  onMapClick: (lat: number, lng: number) => void;
}> = ({ onMapClick }) => {
  useMapEvent('click', (e) => {
    onMapClick(e.latlng.lat, e.latlng.lng);
  });
  return null;
};

// Draggable marker component
const DraggableMarker: React.FC<{
  lat: number;
  lng: number;
  onDragEnd: (lat: number, lng: number) => void;
}> = ({ lat, lng, onDragEnd }) => {
  const [position, setPosition] = useState<[number, number]>([lat, lng]);

  const handleDragEnd = (e: any) => {
    const newLat = e.target.getLatLng().lat;
    const newLng = e.target.getLatLng().lng;
    setPosition([newLat, newLng]);
    onDragEnd(newLat, newLng);
  };

  return (
    <Marker
      position={position}
      icon={redIcon}
      draggable={true}
      eventHandlers={{
        dragend: handleDragEnd,
      }}
    />
  );
};

const ManualLocationPicker: React.FC<ManualLocationPickerProps> = ({ saleId, onLocationSet }) => {
  // Default to Grand Rapids, MI center (42.9634, -85.6681) at zoom 13
  const GR_LAT = 42.9634;
  const GR_LNG = -85.6681;

  const [selectedLat, setSelectedLat] = useState<number>(GR_LAT);
  const [selectedLng, setSelectedLng] = useState<number>(GR_LNG);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setError] = useState<string | null>(null);

  const handleMapClick = (lat: number, lng: number) => {
    setSelectedLat(lat);
    setSelectedLng(lng);
    setError(null);
  };

  const handleDragEnd = (lat: number, lng: number) => {
    setSelectedLat(lat);
    setSelectedLng(lng);
    setError(null);
  };

  const handleSaveLocation = async () => {
    if (!saleId) return;

    setIsSaving(true);
    setError(null);
    try {
      await api.put(`/sales/${saleId}`, { lat: selectedLat, lng: selectedLng });
      // Success: parent component will refetch and setGeocodingAttempted(false)
      onLocationSet();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save location');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-700 rounded-lg p-4 mt-4 space-y-3">
      <p className="text-sm text-gray-700 dark:text-gray-300 font-semibold">
        Set your sale location manually
      </p>

      {/* Map */}
      <div className="rounded-lg overflow-hidden border border-warm-300 dark:border-gray-600">
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
        <MapContainer
          center={[selectedLat, selectedLng]}
          zoom={13}
          style={{ height: '350px', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Draggable marker at selected location */}
          <DraggableMarker
            lat={selectedLat}
            lng={selectedLng}
            onDragEnd={handleDragEnd}
          />

          {/* Click handler */}
          <MapClickHandler onMapClick={handleMapClick} />
        </MapContainer>
      </div>

      {/* Label and instructions */}
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Click on the map to place a pin or drag the marker to adjust. Default location is Grand Rapids, MI.
      </p>

      {/* Coordinates display */}
      <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm font-mono text-gray-700 dark:text-gray-300">
        Lat: {selectedLat.toFixed(4)} | Lng: {selectedLng.toFixed(4)}
      </div>

      {/* Error message */}
      {saveError && (
        <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded text-sm text-red-700 dark:text-red-300">
          {saveError}
        </div>
      )}

      {/* Save button */}
      <button
        type="button"
        onClick={handleSaveLocation}
        disabled={isSaving}
        className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg disabled:opacity-50 transition-colors"
      >
        {isSaving ? 'Saving location...' : 'Use This Location'}
      </button>
    </div>
  );
};

export default ManualLocationPicker;
