/**
 * Adapter Registry — Factory and registry for all pricing adapters
 */

import { PricingAdapter } from './base';
import prisma from '@findasale/database';

// Import all adapters
import { PriceChartingAdapter } from './pricecharting';
import { EbayAdapter } from './ebay';
import { EbthAdapter } from './ebth';
import { KeepaAdapter } from './keepa';
import { DiscogsAdapter } from './discogs';
import { GsaAdapter } from './gsa';
import { SalvationArmyAdapter } from './salvationArmy';

// Stub adapters for disabled sources
import { StubAdapter } from './stub';

class AdapterRegistry {
  private adapters: Map<string, PricingAdapter> = new Map();
  private sourceNames: Map<string, string> = new Map();

  constructor() {
    this.registerAdapters();
  }

  /**
   * Register all adapters
   */
  private registerAdapters(): void {
    // Tier 1: High confidence
    this.register('pricecharting', new PriceChartingAdapter());
    this.register('ebay', new EbayAdapter());
    this.register('ebth', new EbthAdapter());
    this.register('keepa', new KeepaAdapter());
    this.register('discogs', new DiscogsAdapter());
    this.register('gsa', new GsaAdapter());

    // Tier 3: Baseline
    this.register('salvationArmy', new SalvationArmyAdapter());

    // Stubs (disabled at launch)
    this.register('maxsold', new StubAdapter('maxsold'));
    this.register('hibid', new StubAdapter('hibid'));
    this.register('bstock', new StubAdapter('bstock'));
    this.register('worthpoint', new StubAdapter('worthpoint'));
    this.register('storageTreasures', new StubAdapter('storageTreasures'));
    this.register('offerup', new StubAdapter('offerup'));
    this.register('stockx', new StubAdapter('stockx'));
  }

  /**
   * Register an adapter
   */
  private register(sourceId: string, adapter: PricingAdapter): void {
    this.adapters.set(sourceId, adapter);
    this.sourceNames.set(sourceId, this.getNaturalName(sourceId));
  }

  /**
   * Get adapter by source ID
   */
  getAdapter(sourceId: string): PricingAdapter | undefined {
    return this.adapters.get(sourceId);
  }

  /**
   * Get all enabled adapters for a tier
   */
  async getEnabledAdapters(tier: 1 | 2 | 3): Promise<PricingAdapter[]> {
    const configs = await prisma.pricingSourceConfig.findMany({
      where: {
        tier,
        enabled: true,
      },
    });

    return configs
      .map(config => this.adapters.get(config.sourceId))
      .filter((adapter): adapter is PricingAdapter => !!adapter && adapter.isConfigured());
  }

  /**
   * Get natural display name for a source
   */
  getSourceName(sourceId: string): string {
    return this.sourceNames.get(sourceId) || sourceId;
  }

  /**
   * Get natural name from sourceId
   */
  private getNaturalName(sourceId: string): string {
    const names: Record<string, string> = {
      pricecharting: 'PriceCharting',
      ebay: 'eBay Sold',
      ebth: 'EBTH Estate Sales',
      keepa: 'Keepa Amazon API',
      discogs: 'Discogs',
      gsa: 'GSA Auctions',
      salvationArmy: 'Salvation Army FMV',
      maxsold: 'MaxSold Estate Sales',
      hibid: 'HiBid Auctions',
      bstock: 'B-Stock Liquidations',
      worthpoint: 'WorthPoint Antiques',
      storageTreasures: 'Storage Treasures',
      offerup: 'OfferUp Local',
      stockx: 'StockX',
    };

    return names[sourceId] || sourceId;
  }
}

// Export singleton instance
export const adapterRegistry = new AdapterRegistry();
