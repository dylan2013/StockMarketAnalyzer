import type { RealisedRow, RealisedResult, StockSummary, YearSummary } from './types.js';

// ── CSV 行解析（正確處理雙引號欄位）────────────────────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }   // escaped quote
      else inQuote = !inQuote;
    } else if (c === ',' && !inQuote) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

// ── 數字清理 ──────────────────────────────────────────────────
function cleanNum(v: string | undefined): number {
  if (!v) return 0;
  return parseFloat(v.replace(/,/g, '').replace(/%/g, '')) || 0;
}

// ── 日期正規化 YYYY/MM/DD → YYYY-MM-DD ────────────────────────
function normaliseDate(v: string): string {
  return v.replace(/\//g, '-');
}

// ── 主要解析函式 ──────────────────────────────────────────────
export function parseCSV(raw: string): RealisedResult {
  // 移除 BOM
  const text = raw.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim());

  if (lines.length < 2) {
    throw new Error('CSV 內容不足，至少需要標題列 + 一筆資料');
  }

  const headers = parseCSVLine(lines[0]);

  // 找欄位索引（模糊比對，容忍空白差異）
  const findIdx = (keyword: string): number =>
    headers.findIndex(h => h.includes(keyword));

  const idx = {
    name:     findIdx('股票名稱'),
    date:     findIdx('日期'),
    pnl:      findIdx('損益'),
    buyAmt:   findIdx('買進價金'),
    sellAmt:  findIdx('賣出價金'),
    fee:      findIdx('手續費'),
    tax:      findIdx('交易稅'),
  };

  if (idx.name === -1) {
    throw new Error(
      `找不到「股票名稱」欄位。\n` +
      `偵測到的標題：${headers.join(' | ')}\n` +
      `請確認這是券商匯出的已實現損益 CSV 檔案。`
    );
  }

  const rows: RealisedRow[] = [];

  for (const line of lines.slice(1)) {
    const cols = parseCSVLine(line);
    const name = cols[idx.name] ?? '';
    if (!name) continue;

    const date = normaliseDate(cols[idx.date] ?? '');
    rows.push({
      name,
      date,
      shares:     cleanNum(cols[2]),
      pnl:        cleanNum(cols[idx.pnl]),
      buyAmount:  cleanNum(cols[idx.buyAmt]),
      sellAmount: cleanNum(cols[idx.sellAmt]),
      fee:        cleanNum(cols[idx.fee]),
      tax:        cleanNum(cols[idx.tax]),
    });
  }

  if (rows.length === 0) {
    throw new Error('CSV 沒有有效的資料列，請確認檔案內容。');
  }

  // ── 彙總 ─────────────────────────────────────────────────────
  let totalPnl = 0, totalBuy = 0, totalSell = 0, totalFee = 0, totalTax = 0;
  const stockMap = new Map<string, { pnl: number; buyAmount: number; count: number }>();
  const yearMap  = new Map<string, { pnl: number; buyAmount: number; count: number }>();

  for (const row of rows) {
    totalPnl  += row.pnl;
    totalBuy  += row.buyAmount;
    totalSell += row.sellAmount;
    totalFee  += row.fee;
    totalTax  += row.tax;

    // 個股
    const s = stockMap.get(row.name) ?? { pnl: 0, buyAmount: 0, count: 0 };
    s.pnl += row.pnl; s.buyAmount += row.buyAmount; s.count++;
    stockMap.set(row.name, s);

    // 年度
    const year = row.date.slice(0, 4);
    if (/^\d{4}$/.test(year)) {
      const y = yearMap.get(year) ?? { pnl: 0, buyAmount: 0, count: 0 };
      y.pnl += row.pnl; y.buyAmount += row.buyAmount; y.count++;
      yearMap.set(year, y);
    }
  }

  const byStock: StockSummary[] = [...stockMap.entries()]
    .map(([name, v]) => ({
      name,
      count:      v.count,
      pnl:        Math.round(v.pnl),
      buyAmount:  Math.round(v.buyAmount),
      returnRate: v.buyAmount ? parseFloat((v.pnl / v.buyAmount * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl);

  const byYear: YearSummary[] = [...yearMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, v]) => ({
      year,
      count:      v.count,
      pnl:        Math.round(v.pnl),
      buyAmount:  Math.round(v.buyAmount),
      returnRate: v.buyAmount ? parseFloat((v.pnl / v.buyAmount * 100).toFixed(2)) : 0,
    }));

  return {
    totalPnl:   Math.round(totalPnl),
    totalBuy:   Math.round(totalBuy),
    totalSell:  Math.round(totalSell),
    totalFee:   Math.round(totalFee),
    totalTax:   Math.round(totalTax),
    totalCount: rows.length,
    returnRate: totalBuy ? parseFloat((totalPnl / totalBuy * 100).toFixed(2)) : 0,
    byStock,
    byYear,
  };
}
