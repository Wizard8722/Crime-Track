// Single data access layer for the UI.
// OFFLINE = Android APK build: reads/writes the on-device IndexedDB database.
// Regular web build: talks to the Express API + PostgreSQL, exactly as before.
import { verifyAdmin, searchRecords, allRecords, insertRecord, removeRecord } from './db.js';

export const OFFLINE = import.meta.env.VITE_OFFLINE === 'true';
const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:4000/api';

const MESSAGES = {
  format: 'NRC နံပါတ် ပုံစံမမှန်ပါ။',
  required: 'လိုအပ်သော အချက်အလက်များကို ဖြည့်ပါ။',
  auth: 'အုပ်ချုပ်သူ အကောင့်ဖြင့် ဝင်ရောက်ရန်လိုအပ်ပါသည်။',
  credentials: 'အသုံးပြုသူအမည် သို့မဟုတ် စကားဝှက် မမှန်ပါ။',
  network: 'ဆာဗာသို့ ချိတ်ဆက်၍ မရပါ။',
};

const ok = (data) => ({ ok: true, status: 200, data });
const fail = (status, message) => ({ ok: false, status, data: { message } });

const http = async (path, options) => {
  try {
    const response = await fetch(`${API}${path}`, options);
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    return { ok: response.ok, status: response.status, data };
  } catch {
    return fail(0, MESSAGES.network);
  }
};

let referencePromise = null;
const referenceData = () => {
  if (!referencePromise) referencePromise = import('./nrc-reference.json').then((module) => module.default);
  return referencePromise;
};

export const getNrcReference = async () => {
  if (OFFLINE) return referenceData();
  try {
    const response = await fetch(`${API}/nrc-reference`);
    return await response.json();
  } catch {
    return [];
  }
};

export const searchCrimes = async (query) => {
  if (OFFLINE) {
    const { referenceId, type, number } = query;
    if (!/^\d+$/.test(String(referenceId)) || !/^[NEP]$/.test(String(type)) || !/^\d{6}$/.test(String(number))) return fail(400, MESSAGES.format);
    return ok(await searchRecords({ referenceId, type, number }));
  }
  return http(`/crimes/search?${new URLSearchParams(query)}`);
};

export const adminLogin = async (credentials) => {
  if (OFFLINE) {
    const valid = await verifyAdmin(credentials?.username, credentials?.password);
    if (!valid) return fail(401, MESSAGES.credentials);
    return ok({ token: 'local-admin' });
  }
  return http('/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
};

const guard = (token) => (token ? null : fail(401, MESSAGES.auth));

export const listCrimes = async (token) => {
  if (OFFLINE) {
    const denied = guard(token);
    if (denied) return denied;
    return ok(await allRecords());
  }
  return http('/admin/crimes', { headers: { Authorization: `Bearer ${token}` } });
};

export const createCrime = async (token, record) => {
  if (OFFLINE) {
    const denied = guard(token);
    if (denied) return denied;
    const references = await referenceData();
    const reference = references.find((item) => String(item.id) === String(record.nrcReferenceId));
    const number = String(record.nrcNumber || '');
    const type = String(record.nrcType || '');
    if (!record.name?.trim() || !reference || !['N', 'E', 'P'].includes(type) || !/^\d{6}$/.test(number) || !record.crimeDate || !record.crimeDetail?.trim()) return fail(400, MESSAGES.required);
    const now = new Date().toISOString();
    const row = {
      name: record.name.trim(),
      nrc_state_code: reference.state_code,
      nrc_township_code: reference.township_code_mm,
      nrc_reference_id: reference.id,
      nrc_type: type,
      nrc_number: number,
      date_of_birth: record.dateOfBirth || null,
      gender: record.gender?.trim() || null,
      crime_date: record.crimeDate,
      crime_detail: record.crimeDetail.trim(),
      father_name: record.fatherName?.trim() || null,
      address: record.address?.trim() || null,
      created_at: now,
      updated_at: now,
    };
    return ok(await insertRecord(row));
  }
  return http('/admin/crimes', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(record) });
};

export const deleteCrime = async (token, id) => {
  if (OFFLINE) {
    const denied = guard(token);
    if (denied) return denied;
    await removeRecord(id);
    return ok(null);
  }
  return http(`/admin/crimes/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
};
