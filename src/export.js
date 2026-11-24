import { generateExportData } from './store.js';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

export async function exportCaches(customName, mode = 'local') {
  const exportData = generateExportData();
  const jsonStr = JSON.stringify(exportData, null, 2);
  const baseName = (customName || `cachedash_map_${Date.now()}`).replace(/[^a-z0-9._-]/gi, '_');
  const safeName = baseName.endsWith('.gcache') ? baseName : `${baseName}.gcache`;

  if (Capacitor.isNativePlatform()) {
    const result = await Filesystem.writeFile({
      path: safeName,
      data: jsonStr,
      directory: Directory.Cache,
      encoding: Encoding.UTF8
    });

    await Share.share({
      title: 'Cache Dash Map Export',
      text: 'My geocache mission from Cache Dash.',
      url: result.uri,
      dialogTitle: 'Export Cache Dash Map'
    });
    return { status: 'shared', fileName: safeName };
  }

  const blob = new Blob([jsonStr], { type: 'application/json' });

  if (mode === 'cloud' && navigator.canShare) {
    const file = new File([blob], safeName, { type: 'application/json' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'Cache Dash Map Export',
          text: 'Geocache map data (.gcache)'
        });
        return { status: 'shared', fileName: safeName };
      } catch (shareErr) {
        if (shareErr.name === 'AbortError') return { status: 'cancelled', fileName: safeName };
        console.warn('Web Share API failed, falling back to local download:', shareErr);
      }
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    downloadBlob(url, safeName);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  return { status: 'downloaded', fileName: safeName };
}

function downloadBlob(url, fileName) {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
