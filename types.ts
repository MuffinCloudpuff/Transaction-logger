
export interface Transaction {
  id: string;
  name: string;
  category: string;
  buyPrice: number;
  sellPrice: number; // 0 if not sold yet
  isSold: boolean;
  date: string; // Typically the buy date
  sellDate?: string; // The date it was sold
  notes?: string;
  shippingCost?: number; // Cost paid by seller
  shippingMethod?: string; // e.g. 'STO', 'SF', 'JD'
}

export interface TradeStats {
  totalInvested: number; // Sum of all buyPrices
  totalRevenue: number; // Sum of all sellPrices
  closedLoopProfit: number; // Profit only from items with both buy and sell prices (Net)
  closedLoopRoi: number; // ROI only on closed loop items
  itemCount: number;
  soldCount: number;
  closedLoopCount: number;
}

export enum FilterType {
  CLOSED_LOOP = 'CLOSED_LOOP',   // Buy > 0, Sell > 0
  INVENTORY = 'INVENTORY',       // Buy > 0, Sell == 0
  ORPHAN_SALES = 'ORPHAN_SALES', // Buy == 0, Sell > 0
  ALL = 'ALL'
}

// Types for the Import Wizard / Match View
export interface ImportItem {
  id: string;
  name: string;
  price: number;
  date: string;
  type: 'BUY' | 'SELL';
  originalText?: string;
}

export interface MatchedPair {
  buyId: string;
  sellId: string;
  confidence: number;
  reason?: string;
}
