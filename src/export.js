import { generateExportData, loadAllCaches } from './store.js';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

export async function exportCaches(customName, mode = 'local') {
  const exportData = generateExportData();
  const jsonStr = JSON.stringify(exportData, null, 2);
  const safeName = customName ? (customName.endsWith('.gcache') ? customName : customName + '.gcache') : `locus_backup_${Date.now()}.gcache`;

  try {
    if (Capacitor.isNativePlatform()) {
      // Mobile native app execution
      const result = await Filesystem.writeFile({
        path: safeName,
        data: jsonStr,
        directory: Directory.Cache,
        encoding: Encoding.UTF8
      });

      await Share.share({
        title: 'Cache Dash Backup',
        text: 'My geocache locations from Cache Dash.',
        url: result.uri,
        dialogTitle: 'Export Locus Data',
      });
      
    } else {
      
      const blob = new Blob([jsonStr], { type: 'application/json' });
      
      // Cloud Share Request Branch
      if (mode === 'cloud' && navigator.canShare) {
        // Construct native File from Blob to pass to the OS Share Sheet (which holds Google Drive, AirDrop, etc)
        const file = new File([blob], safeName, { type: 'application/json' });
        
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: "Cache Dash Backup",
              text: "Geocache Map Data"
            });
            return; // Successfully passed to OS Share Sheet
          } catch (shareErr) {
            if (shareErr.name === 'AbortError') return; // User explicitly cancelled the share sheet
            console.warn("Web Share API failed, falling back to local download:", shareErr);
          }
        }
      }

      // Web Local/Fallback: Always force a native download blob. 
      // navigator.share on iOS Safari tends to swallow file names and redirect to app links.
      // a.download perfectly hooks into the iOS File Download Manager and PC Download Managers.
      const url = URL.createObjectURL(blob);
      try {
        downloadBlob(url, safeName);
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Error exporting data:', err);
      alert('Failed to export data: ' + err.message);
    }
  }
}

function downloadBlob(url, fileName) {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
