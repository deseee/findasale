/**
 * LocationMap.tsx
 *
 * Displays a static Google Maps embed or falls back to OpenStreetMap for a sale location.
 * Uses Google Static Maps API if key is present, otherwise falls back to static OSM tile image.
 * Clicking the map opens directions in Google Maps.
 */

import { useState } from 'react';
import Image from 'next/image';

interface LocationMapProps {
  lat: number;
  lng: number;
  address: string;
  city: string;
  state: string;
  title: string;
  height?: string;
}

const LocationMap = ({
  lat,
  lng,
  address,
  city,
  state,
  title,
  height = '300px',
}: LocationMapProps) => {
  const [mapLoadError, setMapLoadError] = useState(false);

  const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const fullAddress = `${address}, ${city}, ${state}`;

  // Build Google Static Maps URL if key is available
  const getStaticMapUrl = () => {
    if (!googleMapsKey) return null;

    const params = new URLSearchParams({
      center: `${lat},${lng}`,
      zoom: '15',
      size: '600x300',
      markers: `${lat},${lng}`,
      key: googleMapsKey,
    });

    return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
  };

  // Fallback: OpenStreetMap static tile image
  const getFallbackMapUrl = () => {
    // Using OpenStreetMap tile server for a simple static map
    const z = 15; // zoom level
    const tileSize = 256;

    // Convert lat/lng to Web Mercator tile coordinates
    const n = Math.pow(2, z);
    const x = Math.floor((lng + 180) / 360 * n);
    const y = Math.floor(
      (1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2 * n
    );

    // Return a simple OSM tile image (600x300)
    return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  };

  // Open Google Maps directions
  const handleOpenDirections = () => {
    const mapsUrl = `https://maps.google.com?daddr=${encodeURIComponent(fullAddress)}`;
    window.open(mapsUrl, '_blank');
  };

  const staticMapUrl = getStaticMapUrl() || getFallbackMapUrl();

  return (
    <div
      style={{ height, position: 'relative', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer' }}
      onClick={handleOpenDirections}
      className="bg-warm-100 flex items-center justify-center group"
    >
      {!mapLoadError ? (
        <>
          <Image
            src={staticMapUrl}
            alt={`Map of ${title} at ${fullAddress}`}
            fill
            style={{ objectFit: 'cover' }}
            className="group-hover:opacity-90 transition"
            onError={() => setMapLoadError(true)}
            priority={false}
          />
          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition pointer-events-none" />
          <div className="absolute bottom-3 right-3 bg-white bg-opacity-90 px-3 py-1.5 rounded text-xs font-medium text-warm-900 pointer-events-none">
            Click for directions
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center w-full h-full bg-warm-100">
          <div className="text-center">
            <p className="text-sm text-warm-600">Map unavailable</p>
            <p className="text-xs text-warm-500 mt-1">{fullAddress}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationMap;
