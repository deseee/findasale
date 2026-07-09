// Feature #228: Sale-type-aware dashboard layout config
// Maps saleType (+ optional saleSubtype override) -> which widgets to show, copy variations, and settlement type
// ADR-023: saleType shrunk to its true 6 values (ESTATE, YARD, AUCTION, FLEA_MARKET, RETAIL, DORM_DASH) + OTHER fallback.
// Dead top-level types' dashboard-config content (CONSIGNMENT, GARAGE, MOVING, DOWNSIZING, SWAP_MEET, POPUP, LIQUIDATION)
// was preserved by moving it to subtype-level overrides under the correct parent tile.
// BUSINESS_CORPORATE, ONLINE, BOOTH, and CHARITY were dropped entirely (no legitimate use - see ADR-023).

export type SettlementType = 'FULL_WIZARD' | 'SIMPLE_CARD';

export interface DashboardSaleTypeConfig {
  visibleWidgets: string[];
  primaryCTA: string;
  greeting: string;
  settlementType: SettlementType;
  clientLabel: string;
}

interface SaleTypeEntry extends DashboardSaleTypeConfig {
  subtypes?: Record<string, Partial<DashboardSaleTypeConfig>>;
}

const BASE_WIDGETS = ['SalePulse', 'SmartBuyer', 'EfficiencyCoaching', 'WeatherStrip'];

export const SALE_TYPE_CONFIGS: Record<string, SaleTypeEntry> = {
  ESTATE: {
    visibleWidgets: [...BASE_WIDGETS, 'HighValueTracker', 'PostSaleMomentum'],
    primaryCTA: 'Manage Estate Sale',
    greeting: 'Your estate sale dashboard',
    settlementType: 'FULL_WIZARD',
    clientLabel: 'Client / Executor',
    subtypes: {
      downsizing: {
        visibleWidgets: [...BASE_WIDGETS, 'HighValueTracker', 'PostSaleMomentum'],
        primaryCTA: 'Manage Downsizing Sale',
        greeting: 'Your downsizing sale dashboard',
        settlementType: 'FULL_WIZARD',
        clientLabel: 'Client',
      },
      liquidation: {
        visibleWidgets: [...BASE_WIDGETS, 'HighValueTracker', 'PostSaleMomentum'],
        primaryCTA: 'Manage Liquidation',
        greeting: 'Your liquidation sale dashboard',
        settlementType: 'FULL_WIZARD',
        clientLabel: 'Client',
      },
    },
  },
  YARD: {
    visibleWidgets: [...BASE_WIDGETS, 'PostSaleMomentum'],
    primaryCTA: 'Manage Yard Sale',
    greeting: 'Your yard sale dashboard',
    settlementType: 'SIMPLE_CARD',
    clientLabel: 'Your earnings',
    subtypes: {
      yard: {
        visibleWidgets: [...BASE_WIDGETS, 'PostSaleMomentum'],
        primaryCTA: 'Manage Garage Sale',
        greeting: 'Your garage sale dashboard',
        settlementType: 'SIMPLE_CARD',
        clientLabel: 'Your earnings',
      },
      moving: {
        visibleWidgets: [...BASE_WIDGETS, 'PostSaleMomentum'],
        primaryCTA: 'Manage Moving Sale',
        greeting: 'Your moving sale dashboard',
        settlementType: 'SIMPLE_CARD',
        clientLabel: 'Your earnings',
      },
    },
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
    subtypes: {
      popup: {
        visibleWidgets: [...BASE_WIDGETS, 'PostSaleMomentum'],
        primaryCTA: 'Manage Pop-Up Sale',
        greeting: 'Your pop-up sale dashboard',
        settlementType: 'SIMPLE_CARD',
        clientLabel: 'Your earnings',
      },
      swap_meet: {
        visibleWidgets: [...BASE_WIDGETS, 'PostSaleMomentum'],
        primaryCTA: 'Manage Swap Meet',
        greeting: 'Your swap meet dashboard',
        settlementType: 'SIMPLE_CARD',
        clientLabel: 'Your earnings',
      },
    },
  },
  RETAIL: {
    visibleWidgets: [...BASE_WIDGETS, 'HighValueTracker', 'PostSaleMomentum'],
    primaryCTA: 'Manage Retail Store',
    greeting: 'Your retail store dashboard',
    settlementType: 'FULL_WIZARD',
    clientLabel: 'Storefront',
    subtypes: {
      consignment: {
        visibleWidgets: [...BASE_WIDGETS, 'HighValueTracker', 'PostSaleMomentum'],
        primaryCTA: 'Manage Consignment Sale',
        greeting: 'Your consignment dashboard',
        settlementType: 'FULL_WIZARD',
        clientLabel: 'Consignor',
      },
    },
  },
  DORM_DASH: {
    visibleWidgets: [...BASE_WIDGETS, 'PostSaleMomentum'],
    primaryCTA: 'Manage Dorm Dash',
    greeting: 'Your dorm dash dashboard',
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

export function getSaleTypeConfig(saleType: string | undefined, saleSubtype?: string | null): DashboardSaleTypeConfig {
  const base = SALE_TYPE_CONFIGS[saleType || 'ESTATE'] || SALE_TYPE_CONFIGS.ESTATE;
  const override = saleSubtype ? base.subtypes?.[saleSubtype] : undefined;
  return override ? { ...base, ...override } : base;
}

export function isWidgetVisible(saleType: string | undefined, widgetName: string, saleSubtype?: string | null): boolean {
  const config = getSaleTypeConfig(saleType, saleSubtype);
  return config.visibleWidgets.includes(widgetName);
}
