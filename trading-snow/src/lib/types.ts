export type TransactionType = "BUY" | "SELL" | "DIVIDEND" | "DEPOSIT" | "WITHDRAW";

export type AssetType = "STOCK" | "ETF" | "CRYPTO" | "FOREX" | "OTHER";

export interface Portfolio {
  id: string;
  name: string;
  currency: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  portfolioId: string;
  type: TransactionType;
  symbol: string;
  assetType: AssetType;
  quantity: number;
  price: number;
  fee: number;
  date: string;
  notes?: string;
}

export interface Holding {
  symbol: string;
  assetType: AssetType;
  quantity: number;
  avgCost: number;
  totalCost: number;
  marketPrice?: number;
}

export interface MarketQuote {
  price: number;
  change: number;
  changePercent: number;
  name?: string;
}

export interface ClosedTrade {
  symbol: string;
  quantity: number;
  costBasis: number;
  proceeds: number;
  pnl: number;
  pnlPercent: number;
  date: string;
}

export interface PortfolioStats {
  totalDeposits: number;
  totalWithdrawals: number;
  totalDividends: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  portfolioValue: number;
  /** Giá trị vị thế hiện tại + lãi/lỗ đã chốt */
  tradingValue: number;
  cashBalance: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  totalTrades: number;
  holdings: Holding[];
  closedTrades: ClosedTrade[];
  monthlyPnl: { month: string; pnl: number }[];
  equityCurve: { date: string; equity: number }[];
  /** Vị thế + lãi/lỗ đã chốt theo thời gian (dùng cho benchmark) */
  tradingEquityCurve: { date: string; equity: number }[];
  holdingsValue: number;
  holdingsCost: number;
  totalFees: number;
  totalProfit: number;
  totalProfitPercent: number;
  dailyHoldingsProfit: number;
  dailyHoldingsProfitPercent: number;
  profitExDivSales: number;
  profitExDivSalesPercent: number;
  irr: number | null;
}

export interface AppState {
  portfolios: Portfolio[];
  transactions: Transaction[];
  marketPrices: Record<string, number>;
  marketQuotes?: Record<string, MarketQuote>;
  pricesUpdatedAt?: string | null;
}

export interface DividendCalendarItem {
  symbol: string;
  date: string;
  amount: number;
  source: "recorded" | "yahoo" | "estimated";
  quantity?: number;
  total?: number;
}

export type EventCategory =
  | "dividend"
  | "earnings"
  | "news"
  | "macro"
  | "holiday";

export interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  category: EventCategory;
  symbol?: string;
  subtitle?: string;
  impact?: "high" | "medium" | "low";
  url?: string;
  amount?: number;
}
