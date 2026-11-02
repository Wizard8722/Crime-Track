import { verifyAdmin, createAccount, signInAccount, getAccount, listAccounts as listAccountsOffline, setAccountRole, deleteAccount, changeAccountPassword, changeAdminPassword, searchRecords, searchRecordsByFace, allRecords, insertRecord, removeRecord } from './db.js';

export const OFFLINE = import.meta.env.VITE_OFFLINE === 'true';
const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:4000/api';
const ADMIN_USERNAME = import.meta.env.VITE_ADMIN_USERNAME || 'admin';
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
    try { data = await response.json(); } catch {}
    return { ok: response.ok, status: response.status, data };
  } catch { return fail(0, MESSAGES.network); }
};
const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

let referencePromise = null;
const referenceData = () => {
  if (!referencePromise) referencePromise = import('./nrc-reference.json').then((module) => module.default);
  return referencePromise;
};
export const getNrcReference = async () => {
  if (OFFLINE) return referenceData();
  try { return await (await fetch(`${API}/nrc-reference`)).json(); } catch { return []; }
};
export const searchCrimes = async (query) => {
  if (OFFLINE) {
    const { referenceId, type, number } = query;
    if (!/^\d+$/.test(String(referenceId)) || !/^[NEP]$/.test(String(type)) || !/^\d{6}$/.test(String(number))) return fail(400, MESSAGES.format);
    return ok(await searchRecords({ referenceId, type, number }));
  }
  return http(`/crimes/search?${new URLSearchParams(query)}`);
};
export const searchCrimesByFace = async ({ signature, name = '' }) => {
  if (OFFLINE) {
    if (!/^[0-9a-f]{64}$/.test(String(signature || ''))) return fail(400, 'Unable to read the face photo.');
    return ok(await searchRecordsByFace({ signature, name }));
  }
  return http('/crimes/face-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signature, name }) });
};
export const adminLogin = async (credentials) => {
  if (OFFLINE) {
    const valid = await verifyAdmin(credentials?.username, credentials?.password);
    return valid ? ok({ token: 'local-admin' }) : fail(401, MESSAGES.credentials);
  }
  return http('/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
};
export const registerUser = async (credentials) => {
  if (!OFFLINE) return http('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
  const result = await createAccount(credentials?.username, credentials?.password);
  return result.error ? fail(400, result.error) : ok({ token: `local-user:${encodeURIComponent(result.account.id)}`, account: result.account });
};
export const userLogin = async (credentials) => {
  if (!OFFLINE) return http('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
  const account = await signInAccount(credentials?.username, credentials?.password);
  return account ? ok({ token: `local-user:${encodeURIComponent(account.id)}`, account }) : fail(401, 'Username or password is incorrect.');
};
const accountFromToken = (token) => token === 'local-admin' ? null : token?.startsWith('local-user:') ? decodeURIComponent(token.slice('local-user:'.length)) : null;
const guard = (token) => (token === 'local-admin' || token?.startsWith('local-user:') ? null : fail(401, MESSAGES.auth));
export const getProfile = async (token) => {
  if (!OFFLINE) return http('/account/profile', { headers: authHeaders(token) });
  if (token === 'local-admin') return ok({ id: 'admin', username: ADMIN_USERNAME, role: 'admin' });
  const id = accountFromToken(token);
  if (!id) return fail(401, MESSAGES.auth);
  const account = await getAccount(id);
  return account ? ok(account) : fail(401, MESSAGES.auth);
};
export const listAccounts = async (token) => {
  if (!OFFLINE) return http('/admin/accounts', { headers: authHeaders(token) });
  if (token === 'local-admin') return ok(await listAccountsOffline());
  const account = await getAccount(accountFromToken(token));
  return account?.role === 'admin' ? ok(await listAccountsOffline()) : fail(403, 'Administrator permission required.');
};
export const manageAccount = async (token, accountId, action) => {
  if (!OFFLINE) return http(`/admin/accounts/${encodeURIComponent(accountId)}/${action}`, { method: action === 'delete' ? 'DELETE' : 'PATCH', headers: authHeaders(token) });
  let allowed = token === 'local-admin';
  if (!allowed) {
    const account = await getAccount(accountFromToken(token));
    allowed = account?.role === 'admin';
  }
  if (!allowed) return fail(403, 'Administrator permission required.');
  if (action === 'delete') return ok(await deleteAccount(accountId));
  if (action === 'promote') return (await setAccountRole(accountId, 'admin')) ? ok(null) : fail(404, 'Account not found.');
  if (action === 'demote') return (await setAccountRole(accountId, 'user')) ? ok(null) : fail(404, 'Account not found.');
  return fail(400, 'Unknown account action.');
};
export const changePassword = async (token, currentPassword, newPassword) => {
  if (!OFFLINE) return http('/account/password', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders(token) }, body: JSON.stringify({ currentPassword, newPassword }) });
  if (token === 'local-admin') {
    const result = await changeAdminPassword(ADMIN_USERNAME, currentPassword, newPassword);
    return result.ok ? ok(null) : fail(400, result.error);
  }
  const result = await changeAccountPassword(accountFromToken(token), currentPassword, newPassword);
  return result.ok ? ok(null) : fail(400, result.error);
};
export const listCrimes = async (token) => {
  if (OFFLINE) {
    const denied = guard(token);
    if (denied) return denied;
    if (token === 'local-admin') return ok(await allRecords());
    const account = await getAccount(accountFromToken(token));
    return account?.role === 'admin' ? ok(await allRecords()) : ok([]);
  }
  return http('/admin/crimes', { headers: authHeaders(token) });
};
export const createCrime = async (token, record) => {
  if (OFFLINE) {
    const denied = guard(token);
    if (denied) return denied;
    if (token !== 'local-admin') {
      const account = await getAccount(accountFromToken(token));
      if (account?.role !== 'admin') return fail(403, 'Only administrators can add crime records.');
    }
    const references = await referenceData();
    const reference = references.find((item) => String(item.id) === String(record.nrcReferenceId));
    const number = String(record.nrcNumber || '');
    const type = String(record.nrcType || '');
    if (!record.name?.trim() || !reference || !['N','E','P'].includes(type) || !/^\d{6}$/.test(number) || !record.crimeDate || !record.crimeSection?.trim() || !record.crimeDetail?.trim()) return fail(400, MESSAGES.required);
    const now = new Date().toISOString();
    const row = { name: record.name.trim(), nrc_state_code: reference.state_code, nrc_township_code: reference.township_code_mm, nrc_reference_id: reference.id, nrc_type: type, nrc_number: number, date_of_birth: record.dateOfBirth || null, gender: record.gender?.trim() || null, crime_date: record.crimeDate, crime_section: record.crimeSection.trim(), crime_detail: record.crimeDetail.trim(), crime_detail_text: record.crimeDetailText?.trim() || '', crime_pdf_name: record.crimePdfName || null, crime_pdf_data: record.crimePdfData || null, crime_photo_name: record.crimePhotoName || null, crime_photo_data: record.crimePhotoData || null, face_signature: record.faceSignature || null, father_name: record.fatherName?.trim() || null, address: record.address?.trim() || null, created_at: now, updated_at: now };
    return ok(await insertRecord(row, accountFromToken(token)));
  }
  return http('/admin/crimes', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(token) }, body: JSON.stringify(record) });
};
export const deleteCrime = async (token, id) => {
  if (OFFLINE) {
    const denied = guard(token);
    if (denied) return denied;
    if (token !== 'local-admin') {
      const account = await getAccount(accountFromToken(token));
      if (account?.role !== 'admin') return fail(403, 'Only administrators can delete crime records.');
    }
    const removed = await removeRecord(id, null);
    return removed ? ok(null) : fail(403, 'Record could not be deleted.');
  }
  return http(`/admin/crimes/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders(token) });
};
