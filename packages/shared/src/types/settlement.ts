// Feature #228: Settlement Hub + Dashboard Widgets — shared types

// ---- Enums / Constants ----

export type LifecycleStage = 'LEAD' | 'CONTRACTED' | 'PREP' | 'LIVE' | 'POST_SALE' | 'CLOSED';

export type ExpenseCategory = 'HAULING' | 'ADVERTISING' | 'STAFF' | 'SUPPLIES' | 'VENUE' | 'OTHER';

export type PayoutStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type PayoutMethod = 'STRIPE_CONNECT' | 'MANUAL';

export type TransactionPaymentMethod = 'STRIPE' | 'CASH' | 'INVOICE' | 'OTHER';

export type TransactionSource = 'ONLINE' | 'IN_PERSON' | 'POS';

export type TransactionStatus = 'COMPLETED' | 'REFUNDED' | 'PENDING';

export type HighValueItemStatus = 'FLAGGED' | 'RESERVED' | 'SOLD';

// ---- Settlement Hub ----

export interface SaleExpenseInput {
  category: ExpenseCategory;
  description: string;
  amount: number;
  vendorName?: string;
  receiptUrl?: string;
  receiptDate?: string;
}

export interface SaleExpenseDTO {
  id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  vendorName?: string | null;
  receiptUrl?: string | null;
  receiptDate?: string | null;
  createdAt: string;
}

export interface ClientPayoutRequest {
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  amount: number;
  method: PayoutMethod;
}

export interface ClientPayoutDTO {
  id: string;
  clientName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  amount: number;
  status: PayoutStatus;
  method: PayoutMethod;
  stripeTransferId?: string | null;
  bankAccountLast4?: string | null;
  failureReason?: string | null;
  processedAt?: string | null;
  paidAt?: string | null;
  createdAt: string;
}

export interface SettlementWithDetails {
  id: string;
  saleId: string;
  saleTitle: string;
  saleType: string;
  lifecycleStage: LifecycleStage;
  settledAt?: string | null;
  totalRevenue: number;
  platformFeeAmount: number;
  totalExpenses: number;
  netProceeds: number;
  commissionRate?: number | null;
  buyerPremiumRate?: number | null;
  buyerPremiumCollected?: number | null;
  notes?: string | null;
  settlementNotes?: string | null;
  internalNotes?: string | null;
  expenses: SaleExpenseDTO[];
  clientPayout?: ClientPayoutDTO | null;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementUpdateInput {
  notes?: string;
  settlementNotes?: string;
  internalNotes?: string;
  commissionRate?: number;
  lifecycleStage?: LifecycleStage;
}

// ---- Dashboard Widgets ----

export interface SalePulseData {
  saleId: string;
  pageViews: number;
  itemSaves: number;
  shopperQuestions: number;
  buzzscore: number; // 0-100
  shopperCount: number;
}

export interface OrganizerEfficiencyStats {
  avgPhotoToPublishMinutes: number;
  sellThroughRate: number; // 0-1
  percentileRank: number; // 0-100
  cohortSize: number;
  tips: string[];
}

export interface SmartBuyerEntry {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  tier: string;
  xp: number;
  rank: string;
  isFollowing: boolean;
}

export interface HighValueItemAlert {
  itemId: string;
  title: string;
  photoUrl?: string | null;
  price: number;
  threshold?: number | null;
  status: HighValueItemStatus;
}

export interface WeatherForecast {
  date: string;
  tempHigh: number;
  tempLow: number;
  condition: string;
  icon: string;
}

export interface PostSaleMomentumData {
  saleId: string;
  saleTitle: string;
  totalRevenue: number;
  itemsSold: number;
  totalItems: number;
  uniqueBuyers: number;
  topCategory?: string | null;
}

// ---- Sale-Type-Aware Dashboard Config ----

export type SettlementType = 'FULL_WIZARD' | 'SIMPLE_CARD';

export interface DashboardSaleTypeConfig {
  visibleWidgets: string[];
  primaryCTA: string;
  greeting: string;
  settlementType: SettlementType;
  clientLabel: string; // "Client" / "Consignor" / "Seller" / "Your earnings"
}
