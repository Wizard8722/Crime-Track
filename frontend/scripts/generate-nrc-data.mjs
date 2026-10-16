import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Converts dataset/full_nrc_dataset.csv into src/nrc-reference.json so the
// offline Android APK can bundle the NRC dropdown data without a server.
// Parsing logic mirrors backend/scripts/setup-db.js.
const here = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.resolve(here, '../../dataset/full_nrc_dataset.csv');
const outPath = path.resolve(here, '../src/nrc-reference.json');

const text = await fs.readFile(csvPath, 'utf8');
const [header, ...rows] = text.trim().split(/\r?\n/).map((line) => line.split(',').map((value) => value.trim()));
const data = rows.map((row, index) => {
  const item = Object.fromEntries(header.map((key, position) => [key, row[position] ?? '']));
  return {
    id: index + 1,
    township_en: item.township_en,
    township_mm: item.township_mm,
    township_code_en: item.township_code_en,
    township_code_mm: item.township_code_mm,
    state_code: Number(item.state_code),
    state_en: item.state_en,
    state_mm: item.state_mm,
  };
});

if (!data.length || data.some((item) => !item.township_mm || !Number.isFinite(item.state_code))) {
  throw new Error('NRC dataset looks invalid - check dataset/full_nrc_dataset.csv encoding (must be UTF-8).');
}
await fs.writeFile(outPath, `${JSON.stringify(data)}\n`, 'utf8');
console.log(`NRC reference data written: ${data.length} rows -> ${outPath}`);
