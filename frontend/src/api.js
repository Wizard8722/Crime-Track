// Single data access layer for the UI.
// OFFLINE = Android APK build: reads/writes the on-device IndexedDB database.
// Regular web build: talks to the Express API + PostgreSQL, exactly as before.
import { verifyAdmin, createAccount, signInAccount, searchRecords, allRecords, insertRecord, removeRecord } from './db.js';

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

export const searchCrimes = async (query, token = null) => {
  if (OFFLINE) {
    if (token !== 'local-admin' && !token?.startsWith('local-user:')) return fail(401, 'Sign in to search records saved on this device.');
    const { referenceId, type, number } = query;
    if (!/^\d+$/.test(String(referenceId)) || !/^[NEP]$/.test(String(type)) || !/^\d{6}$/.test(String(number))) return fail(400, MESSAGES.format);
    return ok(await searchRecords({ referenceId, type, number }, accountFromToken(token)));
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

export const registerUser = async (credentials) => {
  if (!OFFLINE) return fail(501, 'Account registration is available in the offline APK.');
  const result = await createAccount(credentials?.username, credentials?.password);
  if (result.error) return fail(400, result.error);
  return ok({ token: `local-user:${encodeURIComponent(result.account.id)}`, account: result.account });
};

export const userLogin = async (credentials) => {
  if (!OFFLINE) return fail(501, 'Account sign-in is available in the offline APK.');
  const account = await signInAccount(credentials?.username, credentials?.password);
  if (!account) return fail(401, 'Username or password is incorrect.');
  return ok({ token: `local-user:${encodeURIComponent(account.id)}`, account });
};

const guard = (token) => (token === 'local-admin' || token?.startsWith('local-user:') ? null : fail(401, MESSAGES.auth));
const accountFromToken = (token) => token === 'local-admin' ? null : token?.startsWith('local-user:') ? decodeURIComponent(token.slice('local-user:'.length)) : null;

export const listCrimes = async (token) => {
  if (OFFLINE) {
    const denied = guard(token);
    if (denied) return denied;
    return ok(await allRecords(accountFromToken(token)));
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
    if (!record.name?.trim() || !reference || !['N', 'E', 'P'].includes(type) || !/^\d{6}$/.test(number) || !record.crimeDate || !record.crimeSection?.trim() || !record.crimeDetail?.trim()) return fail(400, MESSAGES.required);
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
      crime_section: record.crimeSection.trim(),
      crime_detail: record.crimeDetail.trim(),
      father_name: record.fatherName?.trim() || null,
      address: record.address?.trim() || null,
      created_at: now,
      updated_at: now,
    };
    return ok(await insertRecord(row, accountFromToken(token)));
  }
  return http('/admin/crimes', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(record) });
};

export const deleteCrime = async (token, id) => {
  if (OFFLINE) {
    const denied = guard(token);
    if (denied) return denied;
    const removed = await removeRecord(id, accountFromToken(token));
    return removed ? ok(null) : fail(403, 'You can only delete records saved by your account.');
  }
  return http(`/admin/crimes/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
};
