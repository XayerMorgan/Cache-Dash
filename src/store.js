// Cache Dash: in-memory state & persistence

export const state = {
  version: "1.0",
  caches: [],
  settings: {
    narrativeGoal: "Find the hidden treasures around town!",
    narrativeStory: "",
    targetTimeMinutes: 0,
    triggerRadiusFt: 30, // Default 30 feet
    isSequential: false,
    game: {
      isActive: false,
      startTime: null,
      activeTargetId: null,
      score: 0,
      lastCheckinTime: null,
      adversary: {
        isActive: false,
        speedLevel: 1, // 1: Stalker, 2: Hunter, 3: Slayer
        lat: null,
        lng: null,
        radiusFt: 150
      }
    }
  }
};

const DB_NAME = 'LocusDB';
const STORE_NAME = 'caches';
const SETTINGS_STORE = 'settings';
const DB_VERSION = 2; // Upgraded to support settings

let dbPromise = null;

// Simple CRC32 implementation tailored for JSON strings
export function crc32(str) {
  let table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    table[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < str.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ str.charCodeAt(i)) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

export function generateExportData() {
  const payload = JSON.stringify(state);
  const checksum = crc32(payload);
  return {
    ...state,
    _checksum: checksum
  };
}

// IndexedDB Helper
function getDB() {
  if (dbPromise) return dbPromise;
  
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'id' });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  
  return dbPromise;
}

// --- Settings Persistence ---
export async function loadSettings() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readonly');
    const store = tx.objectStore(SETTINGS_STORE);
    const request = store.get('game_config');
    
    request.onsuccess = () => {
      if (request.result) {
        state.settings = request.result.data;
      }
      resolve(state.settings);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveSettings(newSettings) {
  state.settings = { ...state.settings, ...newSettings };
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    const request = store.put({ id: 'game_config', data: state.settings });
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// --- Cache Persistence ---

export async function loadAllCaches() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    
    request.onsuccess = () => {
      state.caches = request.result || [];
      resolve(state.caches);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveCache(cacheObj) {
  const db = await getDB();
  
  // Update in-memory state
  const index = state.caches.findIndex(c => c.id === cacheObj.id);
  if (index >= 0) {
    state.caches[index] = cacheObj;
  } else {
    state.caches.push(cacheObj);
  }

  // Update idb
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(cacheObj);
    
    request.onsuccess = () => resolve(cacheObj);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteCache(id) {
  const db = await getDB();
  
  // Update in-memory state
  state.caches = state.caches.filter(c => c.id !== id);
  
  // Update idb
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve(id);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteAllCaches() {
  const db = await getDB();
  
  // Update in-memory state
  state.caches = [];
  
  // Update idb
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
