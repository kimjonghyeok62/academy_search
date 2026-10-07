// 학원 자료 보관함 (IndexedDB) — 받은 자료를 브라우저에 남겨 두고, 다음에 열 때 먼저 띄운다
// (sessionStorage 는 탭을 닫으면 지워지고 5MB 남짓이라 아침마다 구글 시트를 처음부터 받아야 했다)
// 보관함을 못 쓰는 브라우저(사생활 보호 창 등)에서는 조용히 아무 일도 안 한다

const DB_NAME = 'academy_search';
const STORE = 'cache';

let dbOpen = null;
function openDb() {
  if (!dbOpen) {
    dbOpen = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB 없음')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbOpen.catch(() => { dbOpen = null; });
  }
  return dbOpen;
}

function run(mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export async function readCache(key) {
  try {
    return (await run('readonly', s => s.get(key))) ?? null;
  } catch {
    return null;
  }
}

export async function writeCache(key, value) {
  try {
    await run('readwrite', s => s.put(value, key));
  } catch { /* 저장 못 해도 다음에 새로 받으면 그만 */ }
}

export async function clearCache() {
  try {
    await run('readwrite', s => s.clear());
  } catch { /* 그만 */ }
}
