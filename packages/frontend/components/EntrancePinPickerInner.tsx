/**
 * EntrancePinPickerInner.tsx
 *
 * Browser-only Leaflet implementation. Click the map to place/move entrance pin.
 */

import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvent } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet's default icon paths
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Blue icon for sale address (primary)
const blueIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  crossOrigin: true,
});

// Green icon for entrance/parking (secondary)
const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  crossOrigin: true,
});

interface EntrancePinPickerInnerProps {
  saleAddress: string;
  saleLat: number;
  saleLng: number;
  initialEntranceLat?: number;
  initialEntranceLng?: number;
  initialEntranceNote?: string;
  onChange: (data: { entranceLat?: number; entranceLng?: number; entranceNote?: string }) => void;
}

// Click handler component that attaches to the map
const MapClickHandler: React.FC<{
  onMapClick: (lat: number, lng: number) => void;
}> = ({ onMapClick }) => {
  useMapEvent('click', (e) => {
    onMapClick(e.latlng.lat, e.latlng.lng);
  });
  return null;
};

const EntrancePinPickerInner: React.FC<EntrancePinPickerInnerProps> = ({
  saleAddress,
  saleLat,
  saleLng,
  initialEntranceLat,
  initialEntranceLng,
  initialEntranceNote = '',
  onChange,
}) => {
  const [entranceLat, setEntranceLat] = useState<number | undefined>(initialEntranceLat);
  const [entranceLng, setEntranceLng] = useState<number | undefined>(initialEntranceLng);
  const [entranceNote, setEntranceNote] = useState(initialEntranceNote);

  const handleMapClick = (lat: number, lng: number) => {
    setEntranceLat(lat);
    setEntranceLng(lng);
    onChange({ entranceLat: lat, entranceLng: lng, entranceNote });
  };

  const handleNoteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const note = e.target.value.slice(0, 150);
    setEntranceNote(note);
    onChange({ entranceLat, entranceLng, entranceNote: note });
  };

  const handleClearPin = () => {
    setEntranceLat(undefined);
    setEntranceLng(undefined);
    onChange({ entranceLat: undefined, entranceLng: undefined, entranceNote });
  };

  return (
    <div className="space-y-4">
      {/* Map */}
      <div>
        <label className="block text-sm font-semibold mb-2">Entrance Location</label>
        <p className="text-xs text-gray-600 mb-2">Click on the map to mark the entrance or parking area</p>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
        <MapContainer
          center={[saleLat, saleLng]}
          zoom={15}
          style={{ height: '300px', width: '100%', borderRadius: '8px', zIndex: 10 }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Sale address marker (blue) */}
          <Marker position={[saleLat, saleLng]} icon={blueIcon}>
            <Popup>
              <div className="text-sm">
                <strong>Sale Address</strong>
                <br />
                {saleAddress}
              </div>
            </Popup>
          </Marker>

          {/* Entrance marker (green) */}
          {entranceLat !== undefined && entranceLng !== undefined && (
            <Marker position={[entranceLat, entranceLng]} icon={greenIcon}>
              <Popup>
                <div className="text-sm">
                  <strong>🚪 Entrance</strong>
                  {entranceNote && (
                    <>
                      <br />
                      {entranceNote}
                    </>
                  )}
                </div>
              </Popup>
            </Marker>
          )}

          {/* Click handler */}
          <MapClickHandler onMapClick={handleMapClick} />
        </MapContainer>
      </div>

      {/* Entrance Note Input */}
      <div>
        <label className="block text-sm font-semibold mb-1 dark:text-gray-200">Entrance Note (Optional)</label>
        <input
          type="text"
          value={entranceNote}
          onChange={handleNoteChange}
          placeholder="e.g. Side entrance, park in back"
          maxLength={150}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{entranceNote.length}/150 characters</p>
      </div>

      {/* Clear Button */}
      {entranceLat !== undefined && entranceLng !== undefined && (
        <button
          type="button"
          onClick={handleClearPin}
          className="inline-block px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-md transition"
        >
          Clear Pin
        </button>
      )}

      {/* Status Display */}
      {entranceLat !== undefined && entranceLng !== undefined && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
          ✓ Entrance marked at {entranceLat.toFixed(4)}, {entranceLng.toFixed(4)}
        </div>
      )}
    </div>
  );
};

export default EntrancePinPickerInner;
