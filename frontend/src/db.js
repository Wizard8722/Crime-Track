// Offline database layer (IndexedDB).
// In the Android APK this database lives inside the app's private storage on
// the device, so every search / create / delete works with no internet.

const DB_NAME = 'crime_track';
const DB_VERSION = 1;

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

export const searchRecords = async ({ referenceId, type, number }) => {
  const db = await openDb();
  const store = db.transaction('crime_records', 'readonly').objectStore('crime_records');
  const key = [Number(referenceId), String(type), String(number)];
  const rows = await toPromise(store.index('by_nrc').getAll(IDBKeyRange.only(key)));
  return rows.sort((a, b) => String(b.crime_date).localeCompare(String(a.crime_date)));
};

export const allRecords = async () => {
  const db = await openDb();
  const store = db.transaction('crime_records', 'readonly').objectStore('crime_records');
  const rows = await toPromise(store.getAll());
  return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
};

export const insertRecord = async (record) => {
  const db = await openDb();
  const store = db.transaction('crime_records', 'readwrite').objectStore('crime_records');
  const id = await toPromise(store.add(record));
  return { ...record, id };
};

export const removeRecord = async (id) => {
  const db = await openDb();
  const store = db.transaction('crime_records', 'readwrite').objectStore('crime_records');
  await toPromise(store.delete(Number(id)));
};
