// Offline database layer (IndexedDB).
// In the Android APK this database lives inside the app's private storage on
// the device, so every search / create / delete works with no internet.

const DB_NAME = 'crime_track';
const DB_VERSION = 2;

const DEFAULT_USERNAME = import.meta.env.VITE_ADMIN_USERNAME || 'admin';
const DEFAULT_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'admin123';

let dbPromise = null;

const toPromise = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export const openDb = () => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('crime_records')) {
        const records = db.createObjectStore('crime_records', { keyPath: 'id', autoIncrement: true });
        records.createIndex('by_nrc', ['nrc_reference_id', 'nrc_type', 'nrc_number']);
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('accounts')) {
        const accounts = db.createObjectStore('accounts', { keyPath: 'id' });
        accounts.createIndex('by_username', 'username', { unique: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab.'));
  });
  return dbPromise;
};

const toHex = (buffer) => Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');

const digest = async (value) => {
  const bytes = new TextEncoder().encode(value);
  if (globalThis.crypto?.subtle) return `sha256:${toHex(await crypto.subtle.digest('SHA-256', bytes))}`;
  let hash = 5381;
  for (const byte of bytes) hash = ((hash << 5) + hash + byte) >>> 0;
  return `djb2:${hash}`;
};

const hashPassword = (password, salt) => digest(`${salt}:${password}`);

const randomSalt = () => {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return toHex(bytes);
};

const getMeta = (db, key) => toPromise(db.transaction('meta', 'readonly').objectStore('meta').get(key));

const ensureAdmin = async (db) => {
  if (await getMeta(db, 'admin')) return;
  const salt = randomSalt();
  const store = db.transaction('meta', 'readwrite').objectStore('meta');
  await toPromise(store.put({ key: 'admin', username: DEFAULT_USERNAME, salt, hash: await hashPassword(DEFAULT_PASSWORD, salt) }));
};

export const verifyAdmin = async (username, password) => {
  const db = await openDb();
  await ensureAdmin(db);
  const admin = await getMeta(db, 'admin');
  if (String(username ?? '') !== admin.username) return false;
  return (await hashPassword(String(password ?? ''), admin.salt)) === admin.hash;
};

const normalizeUsername = (username) => String(username ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export const createAccount = async (username, password) => {
  const cleanUsername = normalizeUsername(username);
  if (!/^(?=.{3,64}$)[\p{L}\p{N}._ -]+$/u.test(cleanUsername) || String(password ?? '').length < 6) return { error: 'Use a username of 3–64 letters, numbers, spaces, dots, underscores or hyphens and a password of at least 6 characters.' };
  const db = await openDb();
  const salt = randomSalt();
  const account = { id: `user:${cleanUsername}`, username: cleanUsername, salt, hash: await hashPassword(String(password), salt), created_at: new Date().toISOString() };
  try {
    await toPromise(db.transaction('accounts', 'readwrite').objectStore('accounts').add(account));
  } catch (error) {
    if (error?.name === 'ConstraintError') return { error: 'That username is already registered on this device.' };
    throw error;
  }
  return { account: { id: account.id, username: account.username } };
};

export const signInAccount = async (username, password) => {
  const db = await openDb();
  const account = await toPromise(db.transaction('accounts', 'readonly').objectStore('accounts').index('by_username').get(normalizeUsername(username)));
  if (!account || (await hashPassword(String(password ?? ''), account.salt)) !== account.hash) return null;
  return { id: account.id, username: account.username };
};

export const searchRecords = async ({ referenceId, type, number }, accountId = null) => {
  const db = await openDb();
  const store = db.transaction('crime_records', 'readonly').objectStore('crime_records');
  const key = [Number(referenceId), String(type), String(number)];
  const rows = await toPromise(store.index('by_nrc').getAll(IDBKeyRange.only(key)));
  const ownedRows = accountId ? rows.filter((row) => row.owner_id === accountId) : rows;
  return ownedRows.sort((a, b) => String(b.crime_date).localeCompare(String(a.crime_date)));
};

export const allRecords = async (accountId = null) => {
  const db = await openDb();
  const store = db.transaction('crime_records', 'readonly').objectStore('crime_records');
  const rows = await toPromise(store.getAll());
  const ownedRows = accountId ? rows.filter((row) => row.owner_id === accountId) : rows;
  return ownedRows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
};

export const insertRecord = async (record, ownerId = null) => {
  const db = await openDb();
  const store = db.transaction('crime_records', 'readwrite').objectStore('crime_records');
  const id = await toPromise(store.add({ ...record, owner_id: ownerId }));
  return { ...record, id };
};

export const removeRecord = async (id, ownerId = null) => {
  const db = await openDb();
  const store = db.transaction('crime_records', 'readwrite').objectStore('crime_records');
  const row = await toPromise(store.get(Number(id)));
  if (!row || (ownerId && row.owner_id !== ownerId)) return false;
  await toPromise(store.delete(Number(id)));
  return true;
};
