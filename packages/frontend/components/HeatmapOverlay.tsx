import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { HeatmapTile } from '../types/heatmap';

interface HeatmapOverlayProps {
  tiles: HeatmapTile[];
  onCellClick?: (tile: HeatmapTile) => void;
}

/**
 * HeatmapOverlay — renders colored circle markers on Leaflet map
 * Each circle represents a grid cell with count of active sales
 * Uses Leaflet's L.circleMarker for rendering (no D3)
 */
const HeatmapOverlay = ({ tiles, onCellClick }: HeatmapOverlayProps) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !tiles || tiles.length === 0) return;

    // Create a feature group to manage heatmap circles
    const circleGroup = L.featureGroup();

    tiles.forEach((tile) => {
      // Create circle marker with color based on density
      const circle = L.circleMarker([tile.lat, tile.lng], {
        radius: 15, // visual radius in pixels
        fillColor: tile.color,
        color: 'rgba(0,0,0,0.2)', // border
        weight: 1,
        opacity: 0.8,
        fillOpacity: 0.7,
      });

      // Bind popup with sale count
      circle.bindPopup(
        `<strong>${tile.saleDensity} sale${tile.saleDensity !== 1 ? 's' : ''}</strong><br/>Click to zoom`
      );

      // Add click handler to zoom to cell
      circle.on('click', () => {
        if (onCellClick) {
          onCellClick(tile);
        }
        // Zoom to a small box around the cell
        const latDelta = 0.05; // roughly 5.5km at equator
        const lngDelta = 0.05;
        const bounds = L.latLngBounds(
          [tile.lat - latDelta, tile.lng - lngDelta],
          [tile.lat + latDelta, tile.lng + lngDelta]
        );
        map.fitBounds(bounds, { padding: [50, 50], duration: 0.8 });
      });

      // Hover effect
      circle.on('mouseover', () => {
        circle.setStyle({ fillOpacity: 0.9, weight: 2 });
      });

      circle.on('mouseout', () => {
        circle.setStyle({ fillOpacity: 0.7, weight: 1 });
      });

      circleGroup.addLayer(circle);
    });

    // Add the group to map
    circleGroup.addTo(map);

    // Cleanup on unmount or tile change
    return () => {
      map.removeLayer(circleGroup);
    };
  }, [map, tiles, onCellClick]);

  return null; // Leaflet renders directly on the map
};

export default HeatmapOverlay;
