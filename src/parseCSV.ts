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

// ── Row 去重 Key ──────────────────────────────────────────────
function rowKey(r: RealisedRow): string {
  return `${r.name}|${r.shares}|${r.buyDate}|${r.sellDate}|${r.buyPrice}|${r.sellPrice}`;
}

// ── 從原始文字解析出 Row 列表（不彙總）────────────────────────
function parseCSVRows(raw: string): RealisedRow[] {
  const text = raw.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim());

  if (lines.length < 2) {
    throw new Error('CSV 內容不足，至少需要標題列 + 一筆資料');
  }

  const headers = parseCSVLine(lines[0]);
  const findIdx = (keyword: string): number =>
    headers.findIndex(h => h.includes(keyword));

  const idx = {
    name:      findIdx('股票名稱'),
    date:      findIdx('日期'),
    shares:    findIdx('股數'),
    pnl:       findIdx('損益'),
    buyDate:   findIdx('買進日期'),
    sellDate:  findIdx('賣出日期'),
    buyPrice:  findIdx('買進單價'),
    sellPrice: findIdx('賣出單價'),
    buyAmt:    findIdx('買進價金'),
    sellAmt:   findIdx('賣出價金'),
    fee:       findIdx('手續費'),
    tax:       findIdx('交易稅'),
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

    rows.push({
      name,
      date:       normaliseDate(cols[idx.date] ?? ''),
      shares:     cleanNum(idx.shares >= 0 ? cols[idx.shares] : cols[2]),
      pnl:        cleanNum(cols[idx.pnl]),
      buyDate:    normaliseDate(cols[idx.buyDate] ?? ''),
      sellDate:   normaliseDate(cols[idx.sellDate] ?? ''),
      buyPrice:   cleanNum(cols[idx.buyPrice]),
      sellPrice:  cleanNum(cols[idx.sellPrice]),
      buyAmount:  cleanNum(cols[idx.buyAmt]),
      sellAmount: cleanNum(cols[idx.sellAmt]),
      fee:        cleanNum(cols[idx.fee]),
      tax:        cleanNum(cols[idx.tax]),
    });
  }

  if (rows.length === 0) {
    throw new Error('CSV 沒有有效的資料列，請確認檔案內容。');
  }

  return rows;
}

// ── 計算持有天數 ──────────────────────────────────────────────
function holdDays(buyDate: string, sellDate: string): number {
  if (!buyDate || !sellDate) return 0;
  const diff = Date.parse(sellDate) - Date.parse(buyDate);
  return diff > 0 ? Math.round(diff / 86400000) : 0;
}

// ── 彙總 Rows → RealisedResult ────────────────────────────────
function summariseRows(rows: RealisedRow[]): RealisedResult {
  let totalPnl = 0, totalBuy = 0, totalSell = 0, totalFee = 0, totalTax = 0;
  const stockMap = new Map<string, { pnl: number; buyAmount: number; count: number; totalHoldDays: number }>();
  const yearMap  = new Map<string, { pnl: number; buyAmount: number; count: number }>();

  for (const row of rows) {
    totalPnl  += row.pnl;
    totalBuy  += row.buyAmount;
    totalSell += row.sellAmount;
    totalFee  += row.fee;
    totalTax  += row.tax;

    const s = stockMap.get(row.name) ?? { pnl: 0, buyAmount: 0, count: 0, totalHoldDays: 0 };
    s.pnl += row.pnl; s.buyAmount += row.buyAmount; s.count++;
    s.totalHoldDays += holdDays(row.buyDate, row.sellDate);
    stockMap.set(row.name, s);

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
      count:        v.count,
      pnl:          Math.round(v.pnl),
      buyAmount:    Math.round(v.buyAmount),
      returnRate:   v.buyAmount ? parseFloat((v.pnl / v.buyAmount * 100).toFixed(2)) : 0,
      avgHoldDays:  Math.round(v.totalHoldDays / v.count),
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
    rows,
  };
}

// ── 單檔解析 ──────────────────────────────────────────────────
export function parseCSV(raw: string): RealisedResult {
  return summariseRows(parseCSVRows(raw));
}

// ── 多檔合併（依 Key 去除重複）────────────────────────────────
export function mergeCSVs(raws: string[]): RealisedResult {
  const seen = new Set<string>();
  const allRows: RealisedRow[] = [];

  for (const raw of raws) {
    for (const row of parseCSVRows(raw)) {
      const key = rowKey(row);
      if (!seen.has(key)) {
        seen.add(key);
        allRows.push(row);
      }
    }
  }

  if (allRows.length === 0) {
    throw new Error('所有 CSV 合併後沒有有效的資料列。');
  }

  return summariseRows(allRows);
}
