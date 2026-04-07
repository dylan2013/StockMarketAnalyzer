# 投資損益分析工具

用 TypeScript 撰寫，解析國泰證券匯出的 **已實現損益 CSV** 與 **配股配息 MHT**，整合產出含息總報酬報告。

---

## 安裝

```bash
npm install
```

---

## 使用方式

### 直接執行（不需編譯）

```bash
# 只分析已實現損益
npx tsx src/index.ts --csv 證券已實現.csv

# 只分析配股配息（可多檔）
npx tsx src/index.ts --mht 配息2023.mht 配息2024.mht 配息2025.mht

# 全部一起分析
npx tsx src/index.ts --csv 證券已實現.csv --mht 配息1.mht 配息2.mht 配息3.mht
```

### 編譯後執行

```bash
npm run build
node dist/index.js --csv 證券已實現.csv --mht 配息1.mht
```

---

## 檔案來源

| 檔案 | 取得方式 |
|------|---------|
| 已實現損益 `.csv` | 國泰證券 iStock → 損益查詢 → 匯出 CSV |
| 配股配息 `.mht` | 國泰證券配股配息查頁面 → 瀏覽器另存為 `.mht` |

> 配股配息查詢一次上限 3 年，若期間較長請分批匯出多份 `.mht`，全部丟給 `--mht` 即可自動合併去重。

---

## 作為模組使用

```typescript
import { analyse, printReport } from './src/index.js';
import { parseCSV } from './src/parseCSV.js';
import { mergeMHTs } from './src/parseMHT.js';

// 完整分析
const result = analyse({
  csvPath: './損益.csv',
  mhtPaths: ['./配息1.mht', './配息2.mht'],
});
printReport(result);

// 只解析 CSV
import { readFileSync } from 'fs';
const csvResult = parseCSV(readFileSync('./損益.csv', 'utf-8'));
console.log(csvResult.totalPnl);   // 已實現損益總額
console.log(csvResult.byStock);    // 個股明細陣列
console.log(csvResult.byYear);     // 年度明細陣列

// 只解析 MHT（多檔自動合併）
const mhtResult = mergeMHTs([
  readFileSync('./配息1.mht', 'utf-8'),
  readFileSync('./配息2.mht', 'utf-8'),
]);
console.log(mhtResult.totalCash);   // 累積現金股息
console.log(mhtResult.totalStock);  // 累積配股股數
console.log(mhtResult.byStock);     // 個股配息陣列
```

---

## 專案結構

```
src/
├── types.ts      # 所有 TypeScript 型別定義
├── parseCSV.ts   # CSV 解析（已實現損益）
├── parseMHT.ts   # MHT 解析（配股配息）
└── index.ts      # 整合入口 + CLI
```
