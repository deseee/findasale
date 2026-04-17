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

export interface TeamMember {
  id: string;
  businessName: string;
  role: string;
  acceptedAt: string | null;
}

export interface TechnicalAlert {
  saleId: string;
  saleTitle: string;
  alertType: 'NO_ITEMS' | 'ITEMS_MISSING_PHOTOS' | 'EXPIRING_HOLDS' | 'SALE_STARTING_SOON';
  detail: string;
}

export interface CommandCenterResponse {
  success: boolean;
  organizerId: string;
  summary: CommandCenterSummary;
  sales: SaleMetrics[];
  teamMembers: TeamMember[];
  technicalAlerts: TechnicalAlert[];
}

export interface CommandCenterFilters {
  status?: 'active' | 'upcoming' | 'recent' | 'all';
  dateFrom?: string;
  dateTo?: string;
}
