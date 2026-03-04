import React, { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Sale {
  id: string;
  title: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude?: number;
  longitude?: number;
}

interface SaleMapInnerProps {
  sales: Sale[];
}

const SaleMapInner: React.FC<SaleMapInnerProps> = ({ sales }) => {
  useEffect(() => {
    const map = L.map('map').setView([42.7335, -85.5863], 10); // Grand Rapids center

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    // Orange marker icon
    const orangeIcon = L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
      shadowUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });

    sales.forEach((sale) => {
      if (sale.latitude && sale.longitude) {
        L.marker([sale.latitude, sale.longitude], { icon: orangeIcon })
          .bindPopup(`<strong>${sale.title}</strong><br/>${sale.address}`)
          .addTo(map);
      }
    });

    return () => {
      map.remove();
    };
  }, [sales]);

  return <div id="map" className="w-full h-full rounded-lg" />;
};

export default SaleMapInner;
