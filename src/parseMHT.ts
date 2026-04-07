import { parse as parseHTML } from 'node-html-parser';
import type { DividendRecord, DividendResult, DividendStockSummary, DividendYearSummary } from './types.js';

// ── 常數 ──────────────────────────────────────────────────────
const CODE_RE = /^[0-9]{4}[0-9A-Z]{0,2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── 數字清理 ──────────────────────────────────────────────────
function cleanNum(v: string): number {
  return parseFloat(v.replace(/,/g, '')) || 0;
}

// ── MHT → 純 HTML ────────────────────────────────────────────
function extractHTML(mht: string): string {
  // MHT 是 MIME multipart，HTML 段落從 <!DOCTYPE html> 開始
  const start = mht.search(/<!DOCTYPE html>/i);
  if (start === -1) throw new Error('找不到 HTML 內容，請確認為 .mht 格式');

  let html = mht.slice(start);

  // 截到 MIME boundary 結束
  const boundaryMatch = mht.match(/boundary="([^"]+)"/i);
  if (boundaryMatch) {
    const boundary = '--' + boundaryMatch[1];
    const boundaryPos = html.indexOf(boundary);
    if (boundaryPos > 0) html = html.slice(0, boundaryPos);
  }

  return html;
}

// ── HTML → 文字節點列表 ───────────────────────────────────────
//
// 關鍵：node-html-parser 的 .innerText 在伺服器端行為
// 與瀏覽器 DOM 一致，block 元素（p/div/li）前後加換行。
// 我們直接收集所有葉節點文字，保留結構順序。
//
function extractTextNodes(html: string): string[] {
  const root = parseHTML(html, {
    blockTextElements: { script: false, style: false },
  });

  // 移除 script / style
  root.querySelectorAll('script, style').forEach(n => n.remove());

  const texts: string[] = [];

  function walk(node: ReturnType<typeof parseHTML>) {
    if (node.nodeType === 3) {          // TEXT_NODE
      const t = node.text.trim();
      if (t) texts.push(t);
    } else {
      for (const child of node.childNodes) {
        walk(child as ReturnType<typeof parseHTML>);
      }
    }
  }

  walk(root);
  return texts;
}

// ── 核心解析：文字節點列表 → DividendRecord[] ─────────────────
//
// 國泰證券配股配息頁面的節點順序（已確認）：
//   [i]   股票代號（<a>，符合 CODE_RE）
//   [i+1] 股票名稱（<a>）
//   ...
//   日期（YYYY-MM-DD）
//   ...
//   "股息約"              ← 精確匹配這個字串
//   金額（如 "21,840"）   ← 下一個節點
//   "元及股票股息約"       ← 精確匹配
//   股數（如 "0" 或 "11"）← 下一個節點
//
// 重要：不能用 includes('股息約') 判斷，
//       因為「元及股票股息約」也包含「股息約」子字串，會互相污染！
//
function parseTextNodes(nodes: string[]): DividendRecord[] {
  const records: DividendRecord[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const token = nodes[i];
    if (!CODE_RE.test(token)) continue;

    const code = token;
    const name = nodes[i + 1] ?? '';
    if (!name || name.length < 2) continue;

    let date    = '';
    let cash    = 0;
    let stockDiv = 0;

    // 往後掃最多 35 個節點
    const limit = Math.min(i + 35, nodes.length);
    for (let j = i + 2; j < limit; j++) {
      const t = nodes[j];

      // 日期
      if (!date && DATE_RE.test(t)) {
        date = t;
        continue;
      }

      // ── 現金股息 ──────────────────────────────────────────
      // 精確比對「股息約」，才讀下一節點當金額
      if (t === '股息約') {
        const next = nodes[j + 1] ?? '0';
        cash = cleanNum(next);
        continue;
      }

      // ── 股票股利 ──────────────────────────────────────────
      // 精確比對，避免與「股息約」混用
      if (t === '元及股票股息約' || t === '股票股息約') {
        const next = nodes[j + 1] ?? '0';
        const sv = cleanNum(next);
        if (sv > 0) stockDiv = sv;
        continue;
      }

      // 遇到下一個股票代號就停止
      if (j > i + 2 && CODE_RE.test(t)) break;
    }

    if (date) {
      records.push({ code, name, date, cash, stockDiv });
    }
  }

  return records;
}

// ── 去重（同代號同日期只保留一筆）────────────────────────────
function dedup(records: DividendRecord[]): DividendRecord[] {
  const seen = new Set<string>();
  return records.filter(r => {
    const key = `${r.code}|${r.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── 彙總 ─────────────────────────────────────────────────────
function summarise(records: DividendRecord[]): DividendResult {
  let totalCash = 0;
  let totalStock = 0;
  const stockMap = new Map<string, { name: string; cash: number; stock: number }>();
  const yearMap  = new Map<string, { cash: number }>();

  for (const r of records) {
    totalCash  += r.cash;
    totalStock += r.stockDiv;

    const s = stockMap.get(r.code) ?? { name: r.name, cash: 0, stock: 0 };
    s.cash += r.cash; s.stock += r.stockDiv;
    stockMap.set(r.code, s);

    const year = r.date.slice(0, 4);
    const y = yearMap.get(year) ?? { cash: 0 };
    y.cash += r.cash;
    yearMap.set(year, y);
  }

  const byStock: DividendStockSummary[] = [...stockMap.entries()]
    .map(([code, v]) => ({
      code,
      name:       v.name,
      totalCash:  Math.round(v.cash),
      totalStock: v.stock,
      shareRatio: totalCash > 0
        ? parseFloat((v.cash / totalCash * 100).toFixed(1))
        : 0,
    }))
    .sort((a, b) => b.totalCash - a.totalCash);

  const byYear: DividendYearSummary[] = [...yearMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, v]) => ({ year, totalCash: Math.round(v.cash) }));

  return {
    totalCash:   Math.round(totalCash),
    totalStock,
    recordCount: records.length,
    byStock,
    byYear,
  };
}

// ── 公開 API：解析單一 MHT 字串 ──────────────────────────────
export function parseMHT(raw: string): DividendRecord[] {
  const html   = extractHTML(raw);
  const nodes  = extractTextNodes(html);
  const records = parseTextNodes(nodes);
  return records;
}

// ── 公開 API：合併多份 MHT，回傳彙總結果 ─────────────────────
export function mergeMHTs(raws: string[]): DividendResult {
  const allRecords: DividendRecord[] = [];
  for (const raw of raws) {
    allRecords.push(...parseMHT(raw));
  }
  const unique = dedup(allRecords);
  return summarise(unique);
}
