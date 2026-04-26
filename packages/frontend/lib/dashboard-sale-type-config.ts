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
  GARAGE: {
    visibleWidgets: [...BASE_WIDGETS, 'PostSaleMomentum'],
    primaryCTA: 'Manage Garage Sale',
    greeting: 'Your garage sale dashboard',
    settlementType: 'SIMPLE_CARD',
    clientLabel: 'Your earnings',
  },
  MOVING: {
    visibleWidgets: [...BASE_WIDGETS, 'PostSaleMomentum'],
    primaryCTA: 'Manage Moving Sale',
    greeting: 'Your moving sale dashboard',
    settlementType: 'SIMPLE_CARD',
    clientLabel: 'Your earnings',
  },
  DOWNSIZING: {
    visibleWidgets: [...BASE_WIDGETS, 'HighValueTracker', 'PostSaleMomentum'],
    primaryCTA: 'Manage Downsizing Sale',
    greeting: 'Your downsizing sale dashboard',
    settlementType: 'FULL_WIZARD',
    clientLabel: 'Client',
  },
  SWAP_MEET: {
    visibleWidgets: [...BASE_WIDGETS, 'PostSaleMomentum'],
    primaryCTA: 'Manage Swap Meet',
    greeting: 'Your swap meet dashboard',
    settlementType: 'SIMPLE_CARD',
    clientLabel: 'Your earnings',
  },
  POPUP: {
    visibleWidgets: [...BASE_WIDGETS, 'PostSaleMomentum'],
    primaryCTA: 'Manage Pop-Up Sale',
    greeting: 'Your pop-up sale dashboard',
    settlementType: 'SIMPLE_CARD',
    clientLabel: 'Your earnings',
  },
  LIQUIDATION: {
    visibleWidgets: [...BASE_WIDGETS, 'HighValueTracker', 'PostSaleMomentum'],
    primaryCTA: 'Manage Liquidation',
    greeting: 'Your liquidation sale dashboard',
    settlementType: 'FULL_WIZARD',
    clientLabel: 'Client',
  },
  CHARITY: {
    visibleWidgets: [...BASE_WIDGETS, 'PostSaleMomentum'],
    primaryCTA: 'Manage Charity Sale',
    greeting: 'Your charity sale dashboard',
    settlementType: 'SIMPLE_CARD',
    clientLabel: 'Recipient org',
  },
  ONLINE: {
    visibleWidgets: [...BASE_WIDGETS, 'PostSaleMomentum'],
    primaryCTA: 'Manage Online Sale',
    greeting: 'Your online sale dashboard',
    settlementType: 'SIMPLE_CARD',
    clientLabel: 'Your earnings',
  },
  BOOTH: {
    visibleWidgets: [...BASE_WIDGETS, 'PostSaleMomentum'],
    primaryCTA: 'Manage Your Booth',
    greeting: 'Your vendor booth dashboard',
    settlementType: 'SIMPLE_CARD',
    clientLabel: 'Your earnings',
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
