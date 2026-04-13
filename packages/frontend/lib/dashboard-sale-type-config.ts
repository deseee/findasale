// Feature #228: Sale-type-aware dashboard layout config
// Maps saleType → which widgets to show, copy variations, and settlement type

export type SettlementType = 'FULL_WIZARD' | 'SIMPLE_CARD';

export interface DashboardSaleTypeConfig {
  visibleWidgets: string[];
  primaryCTA: string;
  greeting: string;
  settlementType: SettlementType;
  clientLabel: string;
}

const BASE_WIDGETS = ['SalePulse', 'SmartBuyer', 'EfficiencyCoaching', 'WeatherStrip'];

export const SALE_TYPE_CONFIGS: Record<string, DashboardSaleTypeConfig> = {
  ESTATE: {
    visibleWidgets: [...BASE_WIDGETS, 'HighValueTracker', 'PostSaleMomentum'],
    primaryCTA: 'Manage Estate Sale',
    greeting: 'Your estate sale dashboard',
    settlementType: 'FULL_WIZARD',
    clientLabel: 'Client / Executor',
  },
  YARD: {
    visibleWidgets: [...BASE_WIDGETS, 'PostSaleMomentum'],
    primaryCTA: 'Manage Yard Sale',
    greeting: 'Your yard sale dashboard',
    settlementType: 'SIMPLE_CARD',
    clientLabel: 'Your earnings',
  },
  AUCTION: {
    visibleWidgets: [...BASE_WIDGETS, 'HighValueTracker', 'PostSaleMomentum'],
    primaryCTA: 'Manage Auction',
    greeting: 'Your auction dashboard',
    settlementType: 'FULL_WIZARD',
    clientLabel: 'Seller',
  },
  FLEA_MARKET: {
    visibleWidgets: [...BASE_WIDGETS, 'PostSaleMomentum'],
    primaryCTA: 'Manage Flea Market',
    greeting: 'Your flea market dashboard',
    settlementType: 'SIMPLE_CARD',
    clientLabel: 'Your earnings',
  },
  CONSIGNMENT: {
    visibleWidgets: [...BASE_WIDGETS, 'HighValueTracker', 'PostSaleMomentum'],
    primaryCTA: 'Manage Consignment Sale',
    greeting: 'Your consignment dashboard',
    settlementType: 'FULL_WIZARD',
    clientLabel: 'Consignor',
  },
  OTHER: {
    visibleWidgets: [...BASE_WIDGETS, 'PostSaleMomentum'],
    primaryCTA: 'Manage Sale',
    greeting: 'Your sale dashboard',
    settlementType: 'SIMPLE_CARD',
    clientLabel: 'Your earnings',
  },
};

export function getSaleTypeConfig(saleType: string | undefined): DashboardSaleTypeConfig {
  return SALE_TYPE_CONFIGS[saleType || 'ESTATE'] || SALE_TYPE_CONFIGS.ESTATE;
}

export function isWidgetVisible(saleType: string | undefined, widgetName: string): boolean {
  const config = getSaleTypeConfig(saleType);
  return config.visibleWidgets.includes(widgetName);
}
