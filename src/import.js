import { crc32, saveCache, state } from './store.js';

export async function importCaches(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const data = JSON.parse(text);

        // Security / Integrity check via CRC32
        if (!data._checksum) {
          throw new Error("Invalid file format: Missing checksum.");
        }

        const providedChecksum = data._checksum;
        
        // Strip out checksum to recompute payload hash
        const verifyData = { ...data };
        delete verifyData._checksum;
        
        const computedChecksum = crc32(JSON.stringify(verifyData));

        if (computedChecksum !== providedChecksum) {
          throw new Error("File integrity compromised: Checksums do not match.");
        }

        // Validate structure
        if (data.version !== "1.0" || !Array.isArray(data.caches)) {
          throw new Error("Unsupported Locus database version or corrupted data.");
        }

        // Wipe existing DB first for hard loads
        const { deleteAllCaches } = await import('./store.js');
        await deleteAllCaches();

        let importedCount = 0;
        
        // Destructive Load: Insert all caches from the snapshot
        for (let incomingCache of data.caches) {
          // Sanitize: Strip any active gameplay progress so the map loads fresh
          delete incomingCache.checkedInTime;
          delete incomingCache.pointsAwarded;
          
          await saveCache(incomingCache);
          importedCount++;
        }
        
        resolve({ count: importedCount, settings: data.settings || {} });
        
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => {
      reject(new Error("Failed to read the file from disk."));
    };

    reader.readAsText(file);
  });
}

// Setup a hidden native file picker element on DOM
export function openImportDialog(onSuccess) {
  let fileInput = document.getElementById('locus-file-import');
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'locus-file-import';
    fileInput.style.display = 'none';
    
    fileInput.addEventListener('change', async (e) => {
      if (e.target.files.length > 0) {
        const file = e.target.files[0];
        try {
          const count = await importCaches(file);
          alert(`Success! Loaded ${count} geocaches into your map.`);
          if (onSuccess) onSuccess();
        } catch (err) {
          alert('Import failed: ' + err.message);
        }
      }
      // Reset input so selecting the same file triggers change again
      fileInput.value = '';
    });
    
    document.body.appendChild(fileInput);
  }
  
  fileInput.click();
}
