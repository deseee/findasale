// Feature #51: Sale Ripples — social proof activity types

export enum RippleType {
  VIEW = 'VIEW',
  SHARE = 'SHARE',
  SAVE = 'SAVE',
  BID = 'BID',
}

export type RippleSummaryDTO = {
  saleId: string;
  views: number;
  shares: number;
  saves: number;
  bids: number;
  totalRipples: number;
  lastRippleAt: string | null; // ISO date string
};

export type RippleTrendDTO = {
  saleId: string;
  hourlyData: Array<{
    hour: string; // ISO date string, rounded to hour
    viewCount: number;
    shareCount: number;
    saveCount: number;
    bidCount: number;
  }>;
  totalRipples: number;
  trendPeriodHours: number;
};

export type RippleActivityDTO = {
  id: string;
  saleId: string;
  type: RippleType;
  userId: string | null;
  createdAt: string; // ISO date string
  metadata?: Record<string, any>;
};
