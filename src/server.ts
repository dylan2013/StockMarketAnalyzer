import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { analyse } from './index.js';
import { parseCSV, mergeCSVs } from './parseCSV.js';
import { mergeMHTs } from './parseMHT.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static(join(__dirname, process.env.NODE_ENV === 'production' ? '.' : '../docs')));

app.post(
  '/api/analyse',
  upload.fields([
    { name: 'csv', maxCount: 20 },
    { name: 'mht', maxCount: 20 },
  ]),
  (req, res) => {
    try {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;

      const csvFiles = files?.['csv'] ?? [];
      const mhtFiles = files?.['mht'] ?? [];

      const realised = csvFiles.length
        ? csvFiles.length === 1
          ? parseCSV(csvFiles[0].buffer.toString('utf-8'))
          : mergeCSVs(csvFiles.map(f => f.buffer.toString('utf-8')))
        : null;

      const dividend = mhtFiles.length
        ? mergeMHTs(mhtFiles.map(f => f.buffer.toString('utf-8')))
        : null;

      const combinedReturn = (realised?.totalPnl ?? 0) + (dividend?.totalCash ?? 0);
      const dividendSharePct =
        combinedReturn > 0 && dividend
          ? parseFloat((dividend.totalCash / combinedReturn * 100).toFixed(1))
          : 0;

      res.json({ realised, dividend, combinedReturn, dividendSharePct });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }
);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\n伺服器已啟動：http://localhost:${PORT}\n`);
});
