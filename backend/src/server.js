import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const allowedOrigins = process.env.FRONTEND_ORIGIN?.split(',') || [];
app.use(cors({ origin: (origin, callback) => !origin || allowedOrigins.includes(origin) || ['http://localhost:5173', 'http://127.0.0.1:5173'].includes(origin) ? callback(null, true) : callback(new Error('Origin not allowed')) }));
app.use(express.json({ limit: '1mb' }));
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const authenticate = (req, res, next) => {
  try { req.admin = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ message: 'အုပ်ချုပ်သူ အကောင့်ဖြင့် ဝင်ရောက်ရန်လိုအပ်ပါသည်။' }); }
};
const nrcParams = (body, reference) => [body.name?.trim(), reference.state_code, reference.township_code_mm, reference.id, body.nrcType, body.nrcNumber?.trim(), body.dateOfBirth || null, body.gender?.trim() || null, body.crimeDate, body.crimeDetail?.trim(), body.fatherName?.trim() || null, body.address?.trim() || null];

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/nrc-reference', asyncRoute(async (req, res) => { const { rows } = await pool.query('SELECT * FROM nrc_reference ORDER BY state_code, township_mm'); res.json(rows); }));
app.post('/api/admin/login', asyncRoute(async (req, res) => {
  const { username, password } = req.body;
  const valid = username === process.env.ADMIN_USERNAME && await bcrypt.compare(password || '', await bcrypt.hash(process.env.ADMIN_PASSWORD || '', 10));
  if (!valid) return res.status(401).json({ message: 'အသုံးပြုသူအမည် သို့မဟုတ် စကားဝှက် မမှန်ပါ။' });
  res.json({ token: jwt.sign({ username, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' }) });
}));
app.get('/api/crimes/search', asyncRoute(async (req, res) => {
  const { referenceId, type, number } = req.query;
  if (!/^\d+$/.test(String(referenceId)) || !/^[NEP]$/.test(type) || !/^\d{6}$/.test(String(number))) return res.status(400).json({ message: 'NRC နံပါတ် ပုံစံမမှန်ပါ။' });
  const { rows } = await pool.query('SELECT id, name, nrc_state_code, nrc_township_code, nrc_type, nrc_number, date_of_birth, gender, crime_date, crime_detail, father_name, address, created_at FROM crime_records WHERE nrc_reference_id=$1 AND nrc_type=$2 AND nrc_number=$3 ORDER BY crime_date DESC', [referenceId, type, number]);
  res.json(rows);
}));
app.get('/api/admin/crimes', authenticate, asyncRoute(async (req, res) => { const { rows } = await pool.query('SELECT * FROM crime_records ORDER BY created_at DESC'); res.json(rows); }));
app.post('/api/admin/crimes', authenticate, asyncRoute(async (req, res) => {
  const { rows: references } = await pool.query('SELECT id, state_code, township_code_mm FROM nrc_reference WHERE id=$1', [req.body.nrcReferenceId]);
  const reference = references[0];
  const values = nrcParams(req.body, reference || {});
  if (!values[0] || !reference || !['N','E','P'].includes(values[4]) || !/^\d{6}$/.test(values[5]) || !values[8] || !values[9]) return res.status(400).json({ message: 'လိုအပ်သော အချက်အလက်များကို ဖြည့်ပါ။' });
  const { rows } = await pool.query('INSERT INTO crime_records (name,nrc_state_code,nrc_township_code,nrc_reference_id,nrc_type,nrc_number,date_of_birth,gender,crime_date,crime_detail,father_name,address) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *', values); res.status(201).json(rows[0]);
}));
app.delete('/api/admin/crimes/:id', authenticate, asyncRoute(async (req, res) => { await pool.query('DELETE FROM crime_records WHERE id=$1', [req.params.id]); res.status(204).end(); }));
app.use((error, req, res, next) => { console.error(error); res.status(500).json({ message: 'ဆာဗာအတွင်း အမှားတစ်ခု ဖြစ်ပွားပါသည်။' }); });
app.listen(process.env.PORT || 4000, () => console.log(`Crime Track API listening on ${process.env.PORT || 4000}`));
