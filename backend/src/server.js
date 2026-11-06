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
app.use(express.json({ limit: '40mb' }));
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const authenticate = (req, res, next) => {
  try { req.admin = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ message: 'အုပ်ချုပ်သူ အကောင့်ဖြင့် ဝင်ရောက်ရန်လိုအပ်ပါသည်။' }); }
};
const requireAdmin = (req, res, next) => req.admin?.role === 'admin' ? next() : res.status(403).json({ message: 'Administrator permission required.' });
const nrcParams = (body, reference) => [body.name?.trim(), reference.state_code, reference.township_code_mm, reference.id, body.nrcType, body.nrcNumber?.trim(), body.dateOfBirth || null, body.gender?.trim() || null, body.crimeDate, body.crimeSection?.trim(), body.crimeDetail?.trim(), body.crimeDetailText?.trim() || '', body.crimePdfName?.trim() || null, body.crimePdfData || null, body.crimePhotoName?.trim() || null, body.crimePhotoData || null, body.faceSignature || null, body.fatherName?.trim() || null, body.address?.trim() || null];

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/nrc-reference', asyncRoute(async (req, res) => { const { rows } = await pool.query('SELECT * FROM nrc_reference ORDER BY state_code, township_mm'); res.json(rows); }));
app.post('/api/admin/login', asyncRoute(async (req, res) => {
  const { username, password } = req.body;
  const { rows } = await pool.query('SELECT * FROM users WHERE username=$1', [String(username || '').trim().toLowerCase()]);
  const user = rows[0];
  if (user && await bcrypt.compare(password || '', user.password_hash)) {
    if (user.role !== 'admin') return res.status(403).json({ message: 'Administrator permission required.' });
    return res.json({ token: jwt.sign({ id: String(user.id), username: user.username, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' }) });
  }
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    return res.json({ token: jwt.sign({ id: 'admin', username, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' }) });
  }
  return res.status(401).json({ message: 'အသုံးပြုသူအမည် သို့မဟုတ် စကားဝှက် မမှန်ပါ။' });
}));
app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!/^(?=.{3,64}$)[\p{L}\p{N}._ -]+$/u.test(username) || password.length < 6) return res.status(400).json({ message: 'Username is invalid or password is fewer than 6 characters.' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query("INSERT INTO users (username,password_hash,role) VALUES ($1,$2,'user') RETURNING id,username,role,created_at", [username, hash]);
    const user = rows[0];
    res.status(201).json({ token: jwt.sign({ id: String(user.id), username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h' }), account: user });
  } catch (error) { if (error.code === '23505') return res.status(400).json({ message: 'That username is already registered.' }); throw error; }
}));
app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const { rows } = await pool.query('SELECT id,username,password_hash,role,created_at FROM users WHERE username=$1', [username]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(String(req.body?.password || ''), user.password_hash))) return res.status(401).json({ message: 'Username or password is incorrect.' });
  res.json({ token: jwt.sign({ id: String(user.id), username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h' }), account: { id: user.id, username: user.username, role: user.role, created_at: user.created_at } });
}));
app.get('/api/account/profile', authenticate, asyncRoute(async (req, res) => {
  if (req.admin.id === 'admin') return res.json({ id: req.admin.id, username: req.admin.username, role: req.admin.role, is_auto_admin: true, account_photo: '' });
  const { rows } = await pool.query('SELECT id,username,role,account_photo FROM users WHERE id=$1', [req.admin.id]);
  res.json(rows[0] || null);
}));
app.patch('/api/account/profile/photo', authenticate, asyncRoute(async (req, res) => {
  if (req.admin.id === 'admin') return res.json({ ok: true });
  await pool.query('UPDATE users SET account_photo=$1 WHERE id=$2', [String(req.body?.accountPhoto || '').slice(0, 40000000), req.admin.id]);
  res.json({ ok: true });
}));
app.patch('/api/account/password', authenticate, asyncRoute(async (req, res) => {
  const newPassword = String(req.body?.newPassword || '');
  if (newPassword.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  if (req.admin.id === 'admin') return res.status(400).json({ message: 'Change the environment administrator password in configuration.' });
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.admin.id]);
  if (!rows[0] || !(await bcrypt.compare(String(req.body?.currentPassword || ''), rows[0].password_hash))) return res.status(400).json({ message: 'Current password is incorrect.' });
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(newPassword, 10), req.admin.id]);
  res.json({ ok: true });
}));
app.get('/api/admin/accounts', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT id,username,role,account_photo,created_at FROM users ORDER BY created_at DESC');
  res.json(rows);
}));
app.patch('/api/admin/accounts/:id/promote', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const { rowCount } = await pool.query("UPDATE users SET role='admin' WHERE id=$1", [req.params.id]);
  if (!rowCount) return res.status(404).json({ message: 'Account not found.' });
  res.json({ ok: true });
}));
app.patch('/api/admin/accounts/:id/demote', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const { rowCount } = await pool.query("UPDATE users SET role='user' WHERE id=$1", [req.params.id]);
  if (!rowCount) return res.status(404).json({ message: 'Account not found.' });
  res.json({ ok: true });
}));
app.delete('/api/admin/accounts/:id/delete', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));
app.get('/api/crimes/search', asyncRoute(async (req, res) => {
  const { referenceId, type, number } = req.query;
  if (!/^\d+$/.test(String(referenceId)) || !/^[NEP]$/.test(type) || !/^\d{6}$/.test(String(number))) return res.status(400).json({ message: 'NRC နံပါတ် ပုံစံမမှန်ပါ။' });
  const { rows } = await pool.query('SELECT id, name, nrc_state_code, nrc_township_code, nrc_type, nrc_number, date_of_birth, gender, crime_date, crime_section, crime_detail, crime_detail_text, crime_pdf_name, crime_pdf_data, crime_photo_name, crime_photo_data, father_name, address, created_at FROM crime_records WHERE nrc_reference_id=$1 AND nrc_type=$2 AND nrc_number=$3 ORDER BY crime_date DESC', [referenceId, type, number]);
  res.json(rows);
}));
app.post('/api/crimes/face-search', asyncRoute(async (req, res) => {
  const signature = String(req.body?.signature || '');
  const name = String(req.body?.name || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(signature)) return res.status(400).json({ message: 'Unable to read the face photo.' });
  const distance = (left, right) => {
    let total = 0;
    for (let index = 0; index < left.length && index < right.length; index += 1) {
      let xor = parseInt(left[index], 16) ^ parseInt(right[index], 16);
      while (xor) { total += xor & 1; xor >>= 1; }
    }
    return total + Math.abs(left.length - right.length) * 4;
  };
  const { rows } = await pool.query('SELECT id, name, nrc_state_code, nrc_township_code, nrc_type, nrc_number, date_of_birth, gender, crime_date, crime_section, crime_detail, crime_detail_text, crime_pdf_name, crime_pdf_data, crime_photo_name, crime_photo_data, face_signature, father_name, address, created_at FROM crime_records WHERE face_signature IS NOT NULL AND ($1 = \'\' OR LOWER(name) LIKE $2) ORDER BY crime_date DESC', [name, `%${name}%`]);
  const matches = rows.filter((row) => distance(signature, row.face_signature || '') <= 10).sort((a, b) => distance(signature, a.face_signature || '') - distance(signature, b.face_signature || '') || String(b.crime_date).localeCompare(String(a.crime_date)));
  res.json(matches);
}));
app.get('/api/admin/crimes', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const { rows } = req.admin.id === 'admin'
    ? await pool.query('SELECT * FROM crime_records ORDER BY created_at DESC')
    : await pool.query('SELECT * FROM crime_records WHERE owner_id=$1 ORDER BY created_at DESC', [req.admin.id]);
  res.json(rows);
}));
app.post('/api/admin/crimes', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const { rows: references } = await pool.query('SELECT id, state_code, township_code_mm FROM nrc_reference WHERE id=$1', [req.body.nrcReferenceId]);
  const reference = references[0];
  const values = nrcParams(req.body, reference || {});
  if (!values[0] || !reference || !['N','E','P'].includes(values[4]) || !/^\d{6}$/.test(values[5]) || !values[8] || !values[9] || !values[10]) return res.status(400).json({ message: 'လိုအပ်သော အချက်အလက်များကို ဖြည့်ပါ။' });
  const status = req.admin.id === 'admin' ? 'approved' : 'pending';
  const ownerId = req.admin.id === 'admin' ? null : req.admin.id;
  const { rows } = await pool.query('INSERT INTO crime_records (name,nrc_state_code,nrc_township_code,nrc_reference_id,nrc_type,nrc_number,date_of_birth,gender,crime_date,crime_section,crime_detail,crime_detail_text,crime_pdf_name,crime_pdf_data,crime_photo_name,crime_photo_data,face_signature,father_name,address,owner_id,approval_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *', [...values, ownerId, status]); res.status(201).json(rows[0]);
}));
app.patch('/api/admin/crimes/:id/approval', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  if (req.admin.id !== 'admin') return res.status(403).json({ message: 'Only the auto administrator can approve records.' });
  const status = String(req.body?.status || 'approved');
  if (!['approved','rejected','pending'].includes(status)) return res.status(400).json({ message: 'Invalid approval status.' });
  const { rowCount } = await pool.query('UPDATE crime_records SET approval_status=$1,updated_at=NOW() WHERE id=$2', [status, req.params.id]);
  if (!rowCount) return res.status(404).json({ message: 'Record not found.' });
  res.json({ ok: true });
}));
app.patch('/api/admin/crimes/:id', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT owner_id FROM crime_records WHERE id=$1', [req.params.id]);
  if (!rows[0] || (req.admin.id !== 'admin' && String(rows[0].owner_id) !== String(req.admin.id))) return res.status(403).json({ message: 'You can only repair your own records.' });
  const { rows: references } = await pool.query('SELECT id,state_code,township_code_mm FROM nrc_reference WHERE id=$1', [req.body.nrcReferenceId]);
  const reference = references[0];
  if (!reference) return res.status(400).json({ message: 'Required information is missing.' });
  const { rows: updated } = await pool.query('UPDATE crime_records SET name=$1,nrc_state_code=$2,nrc_township_code=$3,nrc_reference_id=$4,nrc_type=$5,nrc_number=$6,date_of_birth=$7,gender=$8,crime_date=$9,crime_section=$10,crime_detail=$11,crime_detail_text=$12,crime_pdf_name=$13,crime_pdf_data=$14,crime_photo_name=$15,crime_photo_data=$16,face_signature=$17,father_name=$18,address=$19,approval_status=$20,updated_at=NOW() WHERE id=$21 RETURNING *', [
    req.body.name?.trim(), reference.state_code, reference.township_code_mm, reference.id, req.body.nrcType, req.body.nrcNumber,
    req.body.dateOfBirth || null, req.body.gender || null, req.body.crimeDate, req.body.crimeSection?.trim(), req.body.crimeDetail?.trim(),
    req.body.crimeDetailText?.trim() || '', req.body.crimePdfName || null, req.body.crimePdfData || null, req.body.crimePhotoName || null,
    req.body.crimePhotoData || null, req.body.faceSignature || null, req.body.fatherName?.trim() || null, req.body.address?.trim() || null,
    req.admin.id === 'admin' ? 'approved' : 'pending', req.params.id
  ]);
  res.json(updated[0]);
}));
app.delete('/api/admin/crimes/:id', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  if (req.admin.id === 'admin') await pool.query('DELETE FROM crime_records WHERE id=$1', [req.params.id]);
  else await pool.query('DELETE FROM crime_records WHERE id=$1 AND owner_id=$2', [req.params.id, req.admin.id]);
  res.status(204).end();
}));
app.use((error, req, res, next) => { console.error(error); res.status(500).json({ message: 'ဆာဗာအတွင်း အမှားတစ်ခု ဖြစ်ပွားပါသည်။' }); });
app.listen(process.env.PORT || 4000, () => console.log(`Crime Track API listening on ${process.env.PORT || 4000}`));
