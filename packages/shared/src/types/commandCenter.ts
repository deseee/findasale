/**
 * Command Center Dashboard Types
 * Multi-sale overview for PRO/TEAMS tier organizers
 */

export interface PendingActions {
  itemsNeedingPhotos: number;
  pendingHolds: number;
  unpaidPurchases: number;
  total: number;
}

export interface SaleMetrics {
  id: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ENDED';
  startDate: string; // ISO
  endDate: string; // ISO
  daysUntilStart: number;
  itemsListed: number;
  itemsSold: number;
  itemsAvailable: number;
  itemsReserved: number;
  revenue: number;
  conversionRate: number;
  avgItemPrice: number;
  favoritesCount: number;
  viewsCount: number;
  pendingActions: PendingActions;
}

export interface CommandCenterSummary {
  totalActiveSales: number;
  totalItems: number;
  totalRevenue: number;
  totalFavorites: number;
  aggregateConversionRate: number;
  totalPendingActions: number;
}

export interface CommandCenterResponse {
  success: boolean;
  organizerId: string;
  summary: CommandCenterSummary;
  sales: SaleMetrics[];
}

export interface CommandCenterFilters {
  status?: 'active' | 'upcoming' | 'recent' | 'all';
  dateFrom?: string;
  dateTo?: string;
}
