import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const parseCsv = (text) => {
  const [header, ...rows] = text.trim().split(/\r?\n/).map((line) => line.split(',').map((value) => value.trim()));
  return rows.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] ?? ''])));
};
try {
  await pool.query(await fs.readFile(path.join(root, 'backend/schema.sql'), 'utf8'));
  await pool.query('ALTER TABLE nrc_reference DROP CONSTRAINT IF EXISTS nrc_reference_state_code_township_code_mm_township_code_en_key');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS nrc_reference_source_row_idx ON nrc_reference (state_code, township_code_mm, township_code_en, township_mm, township_en)');
  await pool.query('ALTER TABLE crime_records ADD COLUMN IF NOT EXISTS nrc_reference_id BIGINT REFERENCES nrc_reference(id)');
  await pool.query("ALTER TABLE crime_records ADD COLUMN IF NOT EXISTS crime_section TEXT NOT NULL DEFAULT ''");
  await pool.query('CREATE INDEX IF NOT EXISTS crime_records_nrc_reference_idx ON crime_records (nrc_reference_id, nrc_type, nrc_number)');
  const csv = parseCsv(await fs.readFile(path.join(root, 'dataset/full_nrc_dataset.csv'), 'utf8'));
  for (const item of csv) {
    await pool.query(`INSERT INTO nrc_reference (township_en, township_mm, township_code_en, township_code_mm, state_code, state_en, state_mm)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`, [item.township_en, item.township_mm, item.township_code_en, item.township_code_mm, Number(item.state_code), item.state_en, item.state_mm]);
  }
  console.log(`Database ready. Imported ${csv.length} NRC reference rows.`);
} finally { await pool.end(); }
