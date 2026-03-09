import api from './api';

export interface RouteWaypoint {
  saleId: string;
  order: number;
  lat: number;
  lng: number;
  title: string;
  address: string;
}

export interface RouteSummary {
  totalDistanceMi: number;
  totalDurationMin: number;
}

export interface RouteResult {
  waypoints: RouteWaypoint[];
  summary: RouteSummary;
  googleMapsUrl: string;
}

export interface RouteError {
  error: string;
  code: string;
  fallbackUrl?: string;
}

export async function planRoute(
  saleIds: string[],
  startCoord?: { lat: number; lng: number }
): Promise<RouteResult> {
  const res = await api.post<RouteResult>('/routes/plan', { saleIds, startCoord });
  return res.data;
}
