export interface HeatmapTile {
  lat: number;
  lng: number;
  radius: number;
  saleDensity: number;
  saleDensityCategory: string;
  color: string;
  salesInRadius: string[];
}

export interface HeatmapResponse {
  tiles: HeatmapTile[];
  legend: Record<string, { color: string; label: string }>;
  timestamp: string;
  cacheAge: number;
}
