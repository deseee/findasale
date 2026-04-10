// SaleMapInner.tsx — actual Leaflet implementation (browser-only, loaded dynamically)
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, CircleMarker } from 'react-leaflet';
import EntranceMarker from './EntranceMarker'; // Feature 35: Front Door Locator
import HeatmapOverlay from './HeatmapOverlay'; // Feature #28
import PhotoOpMarker from './PhotoOpMarker'; // Feature #39: Photo Op Stations
import Link from 'next/link';
import { format } from 'date-fns';
import api from '../lib/api';
import { useToast } from './ToastContext';
import type { SalePin } from './SaleMap';
import type { HeatmapTile } from '../types/heatmap';
import type { PhotoOpStation } from '../hooks/usePhotoOps';

interface TrailStop {
  id: string;
  order: number;
  stopName: string;
  latitude: number;
  longitude: number;
  stopType: string;
}

interface ActiveTrail {
  name: string;
  shareToken: string;
  stops: TrailStop[];
}

// Leaflet icon initialization — only on browser (this module is already guarded by dynamic + ssr:false)
let L: any;
let orangeIcon: any, greenIcon: any, amberIcon: any, grayIcon: any;

if (typeof window !== 'undefined') {
  // Leaflet is CJS — no .default export. Fall back to the module itself if .default is undefined.
  const leafletModule = require('leaflet');
  L = leafletModule.default ?? leafletModule;

  // Fix Leaflet's default icon paths (broken in webpack/Next.js builds)
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });

  // Orange marker for highlighted / single-pin views
  orangeIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
    crossOrigin: true,
  });

  // Status-based colored markers
  greenIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
    crossOrigin: true,
  });

  amberIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
    crossOrigin: true,
  });

  grayIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
    crossOrigin: true,
  });
}

// Helper: fly to user location
const FlyToUser = ({ lat, lng }: { lat: number; lng: number }) => {
  const map = useMap();
  useEffect(() => {
    // Guard: only fly if map is fully initialized
    if (map?.flyTo) {
      map.flyTo([lat, lng], 12, { animate: true, duration: 1.2 });
    }
  }, [lat, lng, map]);
  return null;
};

interface SaleMapInnerProps {
  pins?: SalePin[];
  center?: [number, number];
  zoom?: number;
  singlePin?: { lat: number; lng: number; label: string };
  /** Feature 35: Front Door Locator — entrance/parking pin */
  entrancePin?: { lat: number; lng: number; note?: string };
  height?: string;
  userLocation?: { lat: number; lng: number } | null;
  /** Feature #28: Neighborhood Heatmap tiles */
  heatmapTiles?: HeatmapTile[];
  onHeatmapCellClick?: (tile: HeatmapTile) => void;
  /** Feature #39: Photo Op Stations */
  photoOpStations?: PhotoOpStation[];
  /** Feature: Trail Activation Mode — show trail stops on map */
  activeTrail?: ActiveTrail | null;
  setActiveTrail?: (trail: ActiveTrail | null) => void;
  // (hasFeaturedBoost is passed through SalePin — no extra prop needed)
}

const SaleMapInner = ({
  pins = [],
  center = [
    parseFloat(process.env.NEXT_PUBLIC_MAP_CENTER_LAT || '42.9634'),
    parseFloat(process.env.NEXT_PUBLIC_MAP_CENTER_LNG || '-85.6681'),
  ],
  zoom = 11,
  singlePin,
  entrancePin,
  height = '400px',
  userLocation,
  heatmapTiles,
  onHeatmapCellClick,
  photoOpStations = [],
  activeTrail,
  setActiveTrail,
}: SaleMapInnerProps) => {
  const { showToast } = useToast();
  const [isLoadingTrail, setIsLoadingTrail] = useState(false);

  const formatDate = (d: string) => {
    try { return format(new Date(d), 'MMM d, yyyy'); } catch { return 'TBA'; }
  };

  const handleViewTrail = async (shareToken: string) => {
    if (!shareToken || !setActiveTrail) return;

    setIsLoadingTrail(true);
    try {
      const response = await api.get(`/trails/${shareToken}`);
      const trail = response.data;
      setActiveTrail({
        name: trail.name,
        shareToken: trail.shareToken,
        stops: trail.stops,
      });
    } catch (error) {
      console.error('Error fetching trail:', error);
      showToast('Failed to load trail', 'error');
    } finally {
      setIsLoadingTrail(false);
    }
  };

  return (
    <>
      {/* Leaflet CSS — must be loaded in browser context */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossOrigin=""
      />
      <MapContainer
        center={singlePin ? [singlePin.lat, singlePin.lng] : center}
        zoom={singlePin ? 15 : zoom}
        style={{ height, width: '100%', borderRadius: '8px', zIndex: 10 }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Fly to user location if provided */}
        {userLocation && <FlyToUser lat={userLocation.lat} lng={userLocation.lng} />}

        {/* Feature #28: Heatmap overlay (rendered below sale pins) */}
        {heatmapTiles && heatmapTiles.length > 0 && (
          <HeatmapOverlay
            tiles={heatmapTiles}
            onCellClick={onHeatmapCellClick}
          />
        )}

        {/* Single-pin mode (sale detail page) */}
        {singlePin && (
          <Marker position={[singlePin.lat, singlePin.lng]} icon={orangeIcon}>
            <Popup>{singlePin.label}</Popup>
          </Marker>
        )}

        {/* Feature 35: Front Door Locator — entrance/parking pin */}
        {singlePin && entrancePin && (
          <EntranceMarker
            entranceLat={entrancePin.lat}
            entranceLng={entrancePin.lng}
            entranceNote={entrancePin.note}
          />
        )}

        {/* Feature #39: Photo Op Stations — selfie spot markers */}
        {singlePin && photoOpStations && photoOpStations.map((station) => (
          <PhotoOpMarker key={station.id} station={station} />
        ))}

        {/* Multi-pin mode (homepage / search / map page) */}
        {!singlePin && pins.map((pin) => {
          let markerIcon = grayIcon;
          if (pin.status === 'active') markerIcon = greenIcon;
          else if (pin.status === 'upcoming-soon') markerIcon = amberIcon;

          return (
            <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={markerIcon}>
              <Popup>
                <div style={{ minWidth: '180px', position: 'relative' }}>
                  {/* Phase 2b: Featured Boost Badge (SALE_BUMP) */}
                  {pin.hasFeaturedBoost && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '4px',
                        left: '4px',
                        backgroundColor: '#f59e0b',
                        borderRadius: '3px',
                        padding: '1px 5px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '2px',
                      }}
                      title="Featured sale"
                    >
                      <span style={{ fontSize: '9px', color: '#fff', fontWeight: 'bold' }}>⭐ Featured</span>
                    </div>
                  )}

                  {/* Treasure Trail Badge */}
                  {pin.hasActiveTrail && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        width: '16px',
                        height: '16px',
                        backgroundColor: '#d97706',
                        borderRadius: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                      aria-label="This sale has an active Treasure Trail"
                      title="This sale has an active Treasure Trail"
                    >
                      <span style={{ fontSize: '10px', color: '#fff', fontWeight: 'bold' }}>🗺️</span>
                    </div>
                  )}
                  {pin.photoUrl && (
                    <img
                      key={pin.photoUrl}
                      src={pin.photoUrl}
                      alt={pin.title}
                      style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px', marginBottom: '8px' }}
                      loading="lazy"
                    />
                  )}
                  <strong style={{ display: 'block', marginBottom: '4px' }}>
                    {pin.customMapPin && <span style={{ marginRight: '6px' }}>{pin.customMapPin}</span>}
                    {pin.title}
                  </strong>
                  <span style={{ fontSize: '12px', color: '#666', display: 'block' }}>
                    {pin.city}, {pin.state}
                  </span>
                  <span style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '8px' }}>
                    {formatDate(pin.startDate)} – {formatDate(pin.endDate)}
                  </span>
                  <span style={{ fontSize: '12px', color: '#888', display: 'block', marginBottom: '8px' }}>
                    by {pin.organizerName}
                  </span>
                  <div style={{ display: 'flex', gap: '6px', flexDirection: 'column' }}>
                    <a
                      href={`/sales/${pin.id}`}
                      style={{
                        display: 'block',
                        textAlign: 'center',
                        background: '#2563eb',
                        color: '#fff',
                        padding: '4px 12px',
                        borderRadius: '4px',
                        fontSize: '13px',
                        textDecoration: 'none',
                      }}
                    >
                      View Sale →
                    </a>
                    {pin.hasActiveTrail && pin.trailShareToken && (
                      <button
                        onClick={() => handleViewTrail(pin.trailShareToken!)}
                        disabled={isLoadingTrail}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'center',
                          background: isLoadingTrail ? '#9ca3af' : '#16a34a',
                          color: '#fff',
                          padding: '4px 12px',
                          borderRadius: '4px',
                          fontSize: '13px',
                          border: 'none',
                          cursor: isLoadingTrail ? 'not-allowed' : 'pointer',
                          fontWeight: 500,
                        }}
                      >
                        {isLoadingTrail ? 'Loading...' : 'View Treasure Trail →'}
                      </button>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Trail stop markers — only show when activeTrail is set */}
        {activeTrail && activeTrail.stops && activeTrail.stops.map((stop) => (
          <CircleMarker
            key={stop.id}
            center={[stop.latitude, stop.longitude]}
            radius={12}
            pathOptions={{
              fillColor: '#F59E0B',
              fillOpacity: 0.8,
              color: '#D97706',
              weight: 2,
            }}
          >
            <Popup>
              <div style={{ fontSize: '12px' }}>
                <strong>{stop.stopName}</strong>
                <br />
                <small>Type: {stop.stopType}</small>
                <br />
                <small>Stop #{stop.order + 1}</small>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </>
  );
};

export default SaleMapInner;
