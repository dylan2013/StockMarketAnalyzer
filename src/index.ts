import { parseCSV }  from './parseCSV.js';
import { mergeMHTs } from './parseMHT.js';
import type { OverallResult } from './types.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── 工具 ──────────────────────────────────────────────────────
function fmt(n: number): string {
  return n.toLocaleString('zh-TW');
}
function fmtSign(n: number): string {
  return (n >= 0 ? '+' : '') + fmt(n);
}

// ── 主邏輯 ────────────────────────────────────────────────────
export function analyse(options: {
  csvPath?: string;
  mhtPaths?: string[];
}): OverallResult {
  const realised = options.csvPath
    ? parseCSV(readFileSync(options.csvPath, 'utf-8'))
    : null;

  const dividend = options.mhtPaths?.length
    ? mergeMHTs(options.mhtPaths.map(p => readFileSync(p, 'utf-8')))
    : null;

  const combinedReturn = (realised?.totalPnl ?? 0) + (dividend?.totalCash ?? 0);
  const dividendSharePct = combinedReturn > 0 && dividend
    ? parseFloat((dividend.totalCash / combinedReturn * 100).toFixed(1))
    : 0;

  return { realised, dividend, combinedReturn, dividendSharePct };
}

// ── CLI 印出結果 ───────────────────────────────────────────────
export function printReport(result: OverallResult): void {
  const { realised: r, dividend: d } = result;

  if (r) {
    console.log('\n════════════════════════════════════════');
    console.log('  已實現損益');
    console.log('════════════════════════════════════════');
    console.log(`  總損益     : ${fmtSign(r.totalPnl)} 元`);
    console.log(`  整體報酬率 : ${r.returnRate >= 0 ? '+' : ''}${r.returnRate}%`);
    console.log(`  總買進     : ${fmt(r.totalBuy)} 元`);
    console.log(`  總賣出     : ${fmt(r.totalSell)} 元`);
    console.log(`  手續費     : ${fmt(r.totalFee)} 元`);
    console.log(`  交易稅     : ${fmt(r.totalTax)} 元`);
    console.log(`  交易筆數   : ${r.totalCount} 筆`);

    console.log('\n  ─ 年度損益 ─');
    for (const y of r.byYear) {
      console.log(`  ${y.year}：${fmtSign(y.pnl)} 元（${y.returnRate >= 0 ? '+' : ''}${y.returnRate}%，${y.count} 筆）`);
    }

    console.log('\n  ─ 個股損益 ─');
    for (const s of r.byStock) {
      const sign = s.pnl >= 0 ? '+' : '';
      console.log(`  ${s.name.padEnd(12)}：${fmtSign(s.pnl).padStart(10)} 元  ${sign}${s.returnRate}%  (${s.count} 筆)`);
    }
  }

  if (d) {
    console.log('\n════════════════════════════════════════');
    console.log('  配股配息');
    console.log('════════════════════════════════════════');
    console.log(`  累積現金股息 : +${fmt(d.totalCash)} 元`);
    console.log(`  累積配股     : ${d.totalStock} 股`);
    console.log(`  持股標的     : ${d.byStock.length} 檔`);
    console.log(`  配息紀錄     : ${d.recordCount} 筆`);

    console.log('\n  ─ 年度股息 ─');
    for (const y of d.byYear) {
      console.log(`  ${y.year}：+${fmt(y.totalCash)} 元`);
    }

    console.log('\n  ─ 個股配息 ─');
    for (const s of d.byStock) {
      const stockStr = s.totalStock > 0 ? `  配股 ${s.totalStock} 股` : '';
      console.log(`  ${s.name.padEnd(12)}（${s.code}）：+${fmt(s.totalCash).padStart(8)} 元  ${s.shareRatio}%${stockStr}`);
    }
  }

  if (r || d) {
    console.log('\n════════════════════════════════════════');
    console.log('  含息總報酬');
    console.log('════════════════════════════════════════');
    if (r) console.log(`  已實現價差 : ${fmtSign(r.totalPnl)} 元`);
    if (d) console.log(`  現金股息   : +${fmt(d.totalCash)} 元`);
    console.log(`  含息總報酬 : ${fmtSign(result.combinedReturn)} 元`);
    if (r && d) console.log(`  股息佔比   : ${result.dividendSharePct}%`);
    console.log('');
  }
}

// ── 直接執行 (CLI) ────────────────────────────────────────────
// 用法: npx tsx src/index.ts --csv 損益.csv --mht 配息1.mht 配息2.mht
if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  const args = process.argv.slice(2);
  const csvIdx  = args.indexOf('--csv');
  const mhtIdx  = args.indexOf('--mht');

  const csvPath  = csvIdx  >= 0 ? resolve(args[csvIdx + 1])  : undefined;
  const mhtPaths = mhtIdx  >= 0
    ? args.slice(mhtIdx + 1).filter(a => !a.startsWith('--')).map(p => resolve(p))
    : undefined;

  if (!csvPath && !mhtPaths?.length) {
    console.error('用法：npx tsx src/index.ts [--csv <檔案.csv>] [--mht <檔案1.mht> <檔案2.mht> ...]');
    process.exit(1);
  }

  try {
    const result = analyse({ csvPath, mhtPaths });
    printReport(result);
  } catch (err) {
    console.error('錯誤：', (err as Error).message);
    process.exit(1);
  }
}
