/**
 * EntranceMarker.tsx
 *
 * Shopper-facing component: displays the entrance marker on the sale detail map.
 * Props: entranceLat, entranceLng, entranceNote (optional)
 * Usage in SaleMapInner: <EntranceMarker entranceLat={sale.entranceLat} entranceLng={sale.entranceLng} entranceNote={sale.entranceNote} />
 */

import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// Green icon for entrance/parking
const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  crossOrigin: true,
});

interface EntranceMarkerProps {
  entranceLat: number;
  entranceLng: number;
  entranceNote?: string;
}

const EntranceMarker: React.FC<EntranceMarkerProps> = ({ entranceLat, entranceLng, entranceNote }) => {
  return (
    <Marker position={[entranceLat, entranceLng]} icon={greenIcon}>
      <Popup>
        <div className="text-sm font-semibold">
          🚪 Entrance
          {entranceNote && (
            <>
              <br />
              <span className="font-normal text-gray-700">{entranceNote}</span>
            </>
          )}
        </div>
      </Popup>
    </Marker>
  );
};

export default EntranceMarker;
