import React, { useState } from 'react';
import L from 'leaflet';
import { Marker, Popup } from 'react-leaflet';
import { usePhotoOpShares } from '../hooks/usePhotoOps';
import type { PhotoOpStation } from '../hooks/usePhotoOps';

interface PhotoOpMarkerProps {
  station: PhotoOpStation;
  onShare?: () => void;
}

const PhotoOpMarker: React.FC<PhotoOpMarkerProps> = ({ station, onShare }) => {
  const [popupOpen, setPopupOpen] = useState(false);
  const { data: sharesData } = usePhotoOpShares(station.id, 3, 0);

  // Camera emoji icon
  const cameraIcon = L.divIcon({
    html: `<div style="font-size: 24px; text-align: center;">📸</div>`,
    iconSize: [32, 32],
    className: 'photo-op-marker',
  });

  const recentPhotos = sharesData?.shares || [];

  return (
    <Marker
      position={[station.lat, station.lng]}
      icon={cameraIcon}
      eventHandlers={{
        click: () => setPopupOpen(true),
      }}
    >
      <Popup eventHandlers={{ remove: () => setPopupOpen(false) }}>
        <div className="photo-op-popup p-3" style={{ minWidth: '200px' }}>
          <h3 className="font-semibold text-sm mb-2">{station.name}</h3>
          {station.description && (
            <p className="text-xs text-gray-600 mb-2">{station.description}</p>
          )}
          <p className="text-xs text-gray-500 mb-3">📍 Take a photo here!</p>

          {/* Mini photo grid */}
          {recentPhotos.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-gray-700 mb-2">Recent photos:</p>
              <div className="grid grid-cols-3 gap-1">
                {recentPhotos.map((share) => (
                  <img
                    key={share.id}
                    src={share.photoUrl}
                    alt="Photo share"
                    className="w-full h-12 object-cover rounded"
                  />
                ))}
              </div>
            </div>
          )}

          {onShare && (
            <button
              onClick={onShare}
              className="w-full px-3 py-2 bg-sage-600 text-white text-xs rounded hover:bg-sage-700 transition"
            >
              Share a Photo
            </button>
          )}
        </div>
      </Popup>
    </Marker>
  );
};

export default PhotoOpMarker;
