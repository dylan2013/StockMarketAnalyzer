// ── 已實現損益 ────────────────────────────────────────────────

export interface RealisedRow {
  name: string;
  date: string;       // YYYY-MM-DD（賣出日期）
  shares: number;
  pnl: number;
  buyAmount: number;
  sellAmount: number;
  fee: number;
  tax: number;
  buyDate: string;    // YYYY-MM-DD
  sellDate: string;   // YYYY-MM-DD
  buyPrice: number;
  sellPrice: number;
}

export interface StockSummary {
  name: string;
  count: number;
  pnl: number;
  buyAmount: number;
  returnRate: number; // %
  avgHoldDays: number; // 平均持有天數
}

export interface YearSummary {
  year: string;
  pnl: number;
  buyAmount: number;
  count: number;
  returnRate: number;
}

export interface RealisedResult {
  totalPnl: number;
  totalBuy: number;
  totalSell: number;
  totalFee: number;
  totalTax: number;
  totalCount: number;
  returnRate: number;
  byStock: StockSummary[];
  byYear: YearSummary[];
  rows: RealisedRow[];  // 原始每筆交易，供明細展開用
}

// ── 配股配息 ──────────────────────────────────────────────────

export interface DividendRecord {
  code: string;
  name: string;
  date: string;       // YYYY-MM-DD
  cash: number;       // 現金股息（元）
  stockDiv: number;   // 配股（股）
}

export interface DividendStockSummary {
  code: string;
  name: string;
  totalCash: number;
  totalStock: number;
  shareRatio: number; // % of total cash
  records: DividendRecord[];  // 該股票所有配息明細
}

export interface DividendYearSummary {
  year: string;
  totalCash: number;
  records: DividendRecord[];  // 該年所有配息明細
}

export interface DividendResult {
  totalCash: number;
  totalStock: number;
  recordCount: number;
  byStock: DividendStockSummary[];
  byYear: DividendYearSummary[];
}

// ── 整合總覽 ──────────────────────────────────────────────────

export interface OverallResult {
  realised: RealisedResult | null;
  dividend: DividendResult | null;
  combinedReturn: number;       // 已實現損益 + 現金股息
  dividendSharePct: number;     // 股息佔含息總報酬 %
}
