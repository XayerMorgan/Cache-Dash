// Cache Dash: in-memory state & local IndexedDB persistence (100% private, offline-first)

export const DEFAULT_SETTINGS = {
  theme: 'light', // 'light' | 'dark'
  units: 'imperial', // 'imperial' (ft/mi) | 'metric' (m/km)
  mapStyle: 'street', // 'street' | 'satellite' | 'topo'
  soundEnabled: true,
  sonarEnabled: false, // Warm/Cold proximity audio beacon
  voiceEnabled: false, // Local TTS arrival announcements
  narrativeGoal: 'Find the hidden treasures around town!',
  narrativeStory: '',
  targetTimeMinutes: 0,
  triggerRadiusFt: 75, // Unified default: 75 feet
  isSequential: false,
  game: {
    isActive: false,
    startTime: null,
    activeTargetId: null,
    score: 0,
    bestCombo: 1,
    lastCheckinTime: null,
    adversary: {
      isActive: false,
      speedLevel: 0, // 0: Off, 1: Stalker (3mph), 2: Hunter (6mph), 3: Slayer (12mph)
      lat: null,
      lng: null,
      radiusFt: 150
    }
  }
};

export function createDefaultSettings() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

export function mergeSettings(base, incoming) {
  const merged = {
    ...createDefaultSettings(),
    ...(base || {}),
    ...(incoming || {})
  };
  merged.game = {
    ...createDefaultSettings().game,
    ...(base?.game || {}),
    ...(incoming?.game || {}),
    adversary: {
      ...createDefaultSettings().game.adversary,
      ...(base?.game?.adversary || {}),
      ...(incoming?.game?.adversary || {})
    }
  };
  return merged;
}

export const state = {
  version: '1.0',
  caches: [],
  settings: createDefaultSettings()
};

const DB_NAME = 'LocusDB';
const STORE_NAME = 'caches';
const SETTINGS_STORE = 'settings';
const DB_VERSION = 2;

let dbPromise = null;

// CRC32 checksum for .gcache payload integrity
export function crc32(str) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < str.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ str.charCodeAt(i)) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

export function generateExportData() {
  const cleanCaches = state.caches.map(({ checkedInTime, pointsAwarded, ...rest }) => rest);
  const exportCore = {
    version: state.version,
    count: cleanCaches.length,
    settings: {
      ...state.settings,
      game: {
        ...createDefaultSettings().game,
        adversary: {
          ...createDefaultSettings().game.adversary,
          isActive: !!state.settings.game?.adversary?.isActive,
          speedLevel: state.settings.game?.adversary?.speedLevel || 0
        }
      }
    },
    caches: cleanCaches
  };
  const payload = JSON.stringify(exportCore);
  const checksum = crc32(payload);
  return {
    ...exportCore,
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
      if (request.result && request.result.data) {
        state.settings = mergeSettings(DEFAULT_SETTINGS, request.result.data);
      } else {
        state.settings = createDefaultSettings();
      }
      resolve(state.settings);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveSettings(newSettings) {
  state.settings = mergeSettings(state.settings, newSettings);
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    const request = store.put({ id: 'game_config', data: state.settings });

    request.onsuccess = () => resolve(state.settings);
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

  const index = state.caches.findIndex((c) => c.id === cacheObj.id);
  if (index >= 0) {
    state.caches[index] = cacheObj;
  } else {
    state.caches.push(cacheObj);
  }

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
  state.caches = state.caches.filter((c) => c.id !== id);

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
  state.caches = [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
