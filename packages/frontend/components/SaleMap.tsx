// SaleMap.tsx — wrapper that disables SSR for the Leaflet map
// Usage: import SaleMap from '../components/SaleMap'
import dynamic from 'next/dynamic';
import type { HeatmapTile } from '../types/heatmap';
import type { PhotoOpStation } from '../hooks/usePhotoOps';

export interface SalePin {
  id: string;
  title: string;
  lat: number;
  lng: number;
  city: string;
  state: string;
  startDate: string;
  endDate: string;
  organizerName: string;
  photoUrl?: string;
  status?: 'active' | 'upcoming-soon' | 'upcoming';
  hasActiveTrail?: boolean;
  trailShareToken?: string;
  /** Phase 2b: true = this sale has an active SALE_BUMP boost */
  hasFeaturedBoost?: boolean;
}

interface SaleMapProps {
  pins?: SalePin[];
  center?: [number, number];
  zoom?: number;
  /** Single-pin mode: show just one sale with a marker */
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
}

// Dynamically import the inner map (no SSR) so Leaflet doesn't crash on server
const SaleMapInner = dynamic(() => import('./SaleMapInner'), { ssr: false });

const SaleMap = (props: SaleMapProps) => {
  return <SaleMapInner {...props} />;
};

export default SaleMap;
