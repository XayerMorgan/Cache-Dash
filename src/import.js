import { crc32, saveCache, deleteAllCaches } from './store.js';

/**
 * Import a Cache Dash (.gcache or .json) map file.
 * Supports both checksum-verified exports AND open external/LLM-authored .gcache payloads.
 */
export async function importCaches(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const data = JSON.parse(text);

        if (!data || typeof data !== 'object' || !Array.isArray(data.caches)) {
          throw new Error('Invalid .gcache file: expected a JSON object containing a "caches" array.');
        }

        // Verify CRC32 checksum if present (signed Cache Dash export)
        let verified = false;
        if (data._checksum !== undefined && data._checksum !== null) {
          const providedChecksum = data._checksum;
          const verifyData = { ...data };
          delete verifyData._checksum;

          const computedChecksum = crc32(JSON.stringify(verifyData));
          if (computedChecksum !== providedChecksum) {
            throw new Error('File integrity check failed: checksum mismatch. File may be corrupted or modified.');
          }
          verified = true;
        }

        if (data.version && data.version !== '1.0') {
          throw new Error(`Unsupported Cache Dash map version "${data.version}".`);
        }

        // Validate every cache before wiping existing data (atomic safety!)
        const sanitizedCaches = data.caches.map((raw, idx) => {
          const lat = Number(raw.lat);
          const lng = Number(raw.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            throw new Error(`Cache #${idx + 1} ("${raw.name || 'Unnamed'}") has invalid coordinates.`);
          }
          return {
            id: String(raw.id || `IMP_${Date.now()}_${idx}`),
            name: String(raw.name || `Cache #${idx + 1}`).trim(),
            desc: String(raw.desc || '').trim(),
            lat,
            lng,
            iconId: String(raw.iconId || 'box'),
            points: Number.isFinite(Number(raw.points)) ? Math.max(0, Math.round(Number(raw.points))) : 10,
            sequenceNum: Number.isFinite(Number(raw.sequenceNum)) && Number(raw.sequenceNum) > 0
              ? Math.round(Number(raw.sequenceNum))
              : idx + 1,
            timestamp: Number(raw.timestamp) || (Date.now() + idx)
          };
        });

        await deleteAllCaches();

        for (const incomingCache of sanitizedCaches) {
          await saveCache(incomingCache);
        }

        resolve({
          count: sanitizedCaches.length,
          settings: data.settings || {},
          verified
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read the selected file from disk.'));
    };

    reader.readAsText(file);
  });
}
