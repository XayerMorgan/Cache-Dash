import './style.css';
import L from 'leaflet';
import { loadAllCaches, saveCache, deleteCache, state, loadSettings, saveSettings } from './store.js';
import { marked } from 'marked';
import faqRaw from '../FAQ.md?raw';

// --- Default Leaflet Icon Workaround ---
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// --- State & Constants ---
let map = null;
let currentCacheMarker = null; // Marker for the new/edit cache
let activeCacheId = null; // ID of cache currently being edited
let currentLocationMarker = null; // Marker for live user location (Red X)
let gameTimerInterval = null; // Interval for the active game timer
let wakeLock = null;
let autoConfirmActive = false;
window.isAutoCenter = true;
let lastAlertTime = 0;
let globalAudioCtx = null;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (err) {}
}

async function releaseWakeLock() {
  if (wakeLock !== null) {
    await wakeLock.release();
    wakeLock = null;
  }
}
let adversaryMarker = null; // Marker for the Hunter / Adversary

// Simple set of SVG icons for the icon selector
export const CACHE_ICONS = [
  { id: 'box', svg: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>' },
  { id: 'tree', svg: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21v-3.75m-6-13.5v1.5m12-1.5v1.5m-6-13.5v9M4.5 10.5h15" /></svg>' },
  { id: 'star', svg: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>' }
];

let selectedIconId = 'box';

// Store generated markers mapped by cache id to avoid duplicates
const mapMarkers = {};

// --- Initialization ---
async function initMap() {
  // Start around central US roughly
  map = L.map('map-container', {
    zoomControl: false // Create custom if needed later or leave default disabled for clean look
  }).setView([39.09, -96.71], 5);

  // Street view layer (OpenStreetMap)
  const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  });

  // Satellite view layer (Esri World Imagery)
  const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19
  });

  // Add street layer by default
  streetLayer.addTo(map);

  // Expose toggle logic
  let isSatellite = false;
  window.toggleMapLayer = function() {
    if (isSatellite) {
      map.removeLayer(satelliteLayer);
      map.addLayer(streetLayer);
      isSatellite = false;
    } else {
      map.removeLayer(streetLayer);
      map.addLayer(satelliteLayer);
      isSatellite = true;
    }
  };

  // Map Location events for the UX Overlay dismiss
  map.on('locationfound', () => {
    const overlay = document.getElementById('locating-overlay');
    if (overlay) {
      overlay.classList.remove('active');
      setTimeout(() => overlay.style.display = 'none', 300);
    }
  });
  map.on('locationerror', () => {
    const overlay = document.getElementById('locating-overlay');
    if (overlay) {
      overlay.classList.remove('active');
      setTimeout(() => overlay.style.display = 'none', 300);
    }
    console.warn("Leaflet GPS context failed");
  });

  // Map Click to drop a marker if drawer is open
  map.on('click', (e) => {
    const isDrawerOpen = document.getElementById('designer-drawer').classList.contains('open');
    if (isDrawerOpen) {
      updateDraftMarker(e.latlng);
    }
  });

  // Load state and settings
  try {
    await loadSettings();
    await loadAllCaches();
    
    // Sync UI with loaded settings
    document.getElementById('narrative-text').textContent = state.settings.narrativeGoal || "Find the hidden treasures around town!";
    document.getElementById('toggle-sequence').checked = state.settings.isSequential;
    
    // Resume game if it was active
    if (state.settings.game && state.settings.game.isActive) {
      startGameLoop();
    }
  
    renderAllSavedPins();
    updateDistanceBadge();
  } catch (err) {
    console.error("Failed to load DB", err);
  }

  // Start watching location
  startLocationWatcher();
}

// --- Live Location Logic ---
async function startLocationWatcher() {
  const updateMarker = (lat, lng) => {
    const latlng = { lat, lng };
    if (!currentLocationMarker) {
      const redXIcon = L.divIcon({
        className: 'user-location-x',
        html: `<div style="color: #ff4d4f; font-weight: 900; font-size: 24px; font-family: Inter, sans-serif; text-shadow: 0 0 4px white, 0 0 4px white;">✗</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      currentLocationMarker = L.marker(latlng, { icon: redXIcon, zIndexOffset: 1000 }).addTo(map);
    } else {
      currentLocationMarker.setLatLng(latlng);
    }
    if (state.settings.game?.isActive && window.isAutoCenter && map) {
      map.panTo(latlng);
    }
    updateDistanceBadge();
  };

  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    // Try to watch native if capacitor works
    await Geolocation.watchPosition({ enableHighAccuracy: true }, (position, err) => {
      if (!err && position) {
        updateMarker(position.coords.latitude, position.coords.longitude);
        localStorage.setItem('locus_home', JSON.stringify({ lat: position.coords.latitude, lng: position.coords.longitude }));
      }
    });
  } catch (e) {
    // Fallback web Leaflet
    map.locate({ watch: true, enableHighAccuracy: true });
    map.on('locationfound', (e) => {
      updateMarker(e.latlng.lat, e.latlng.lng);
      localStorage.setItem('locus_home', JSON.stringify({ lat: e.latlng.lat, lng: e.latlng.lng }));
    });
  }
}

// --- Game Loop Engine ---
function startGameLoop() {
  requestWakeLock();
  
  // Despawn any lingering Adversary from a previous run to prevent spawn-camping
  if (adversaryMarker) {
    if (map) map.removeLayer(adversaryMarker);
    adversaryMarker = null;
  }

  document.getElementById('icon-play').style.display = 'none';
  document.getElementById('icon-stop').style.display = 'block';
  document.getElementById('btn-play-game').style.backgroundColor = '#ff4d4f'; // turning red
  document.getElementById('game-timer').style.display = 'inline-block';
  document.getElementById('game-score-badge').style.display = 'inline-block';
  updateDistanceBadge();
  document.getElementById('game-score-badge').textContent = `⭐ ${state.settings.game?.score || 0}`;
  
  if (!state.settings.game || !state.settings.game.startTime) {
    let closestId = null;
    
    // Auto-Target closest on start
    const homeLocStr = localStorage.getItem('locus_home');
    if (homeLocStr) {
      try {
        const homeLoc = JSON.parse(homeLocStr);
        let minDist = Infinity;
        for (const c of state.caches) {
          if (!c.checkedInTime) {
            const d = calculateDistanceMiles(homeLoc.lat, homeLoc.lng, c.lat, c.lng);
            if (d < minDist) {
              minDist = d;
              closestId = c.id;
            }
          }
        }
      } catch (e) {}
    }
  
    saveSettings({ game: { ...state.settings.game, isActive: true, startTime: Date.now(), score: 0, lastCheckinTime: null, activeTargetId: closestId } });
    // Reset any previous cache checks
    let needsRender = false;
    state.caches.forEach(c => {
      if (c.checkedInTime) {
        c.checkedInTime = null;
        saveCache(c);
        needsRender = true;
      }
    });
    if (needsRender || closestId) renderAllSavedPins();
  }

  if (gameTimerInterval) clearInterval(gameTimerInterval);
  
  gameTimerInterval = setInterval(() => {
    const now = Date.now();
    const elapsedMs = now - (state.settings.game.startTime || now);
    const elapsedTotalSeconds = Math.floor(elapsedMs / 1000);
    
    // Check if we have a target time
    const targetMinutes = state.settings.targetTimeMinutes || 0;
    
    if (targetMinutes > 0) {
      // Countdown
      const targetSeconds = targetMinutes * 60;
      const remainingSeconds = targetSeconds - elapsedTotalSeconds;
      
      if (remainingSeconds <= 0) {
        document.getElementById('game-timer').textContent = "00:00:00 - TIME UP!";
        stopGameLoop();
        return;
      }
      
      const h = Math.floor(remainingSeconds / 3600).toString().padStart(2, '0');
      const m = Math.floor((remainingSeconds % 3600) / 60).toString().padStart(2, '0');
      const s = (remainingSeconds % 60).toString().padStart(2, '0');
      document.getElementById('game-timer').textContent = `${h}:${m}:${s}`;
    } else {
      // Countup
      const h = Math.floor(elapsedTotalSeconds / 3600).toString().padStart(2, '0');
      const m = Math.floor((elapsedTotalSeconds % 3600) / 60).toString().padStart(2, '0');
      const s = (elapsedTotalSeconds % 60).toString().padStart(2, '0');
      document.getElementById('game-timer').textContent = `${h}:${m}:${s}`;
    }

    // Evaluate Combo Multiplier UI
    const comboBadge = document.getElementById('game-combo-badge');
    const lastTime = state.settings.game.lastCheckinTime;
    
    if (lastTime) {
      const secondsSinceCheckin = Math.floor((now - lastTime) / 1000);
      if (secondsSinceCheckin <= 45) {
        comboBadge.style.display = 'inline-block';
        comboBadge.style.opacity = '1';
        comboBadge.textContent = '🔥 3x COMBO';
      } else if (secondsSinceCheckin <= 90) {
        comboBadge.style.display = 'inline-block';
        comboBadge.style.opacity = '1';
        comboBadge.textContent = '🔥 2x COMBO';
      } else {
        // Fade out
        comboBadge.style.opacity = '0';
        setTimeout(() => { if (comboBadge.style.opacity === '0') comboBadge.style.display = 'none'; }, 500);
      }
    } else {
      comboBadge.style.display = 'none';
      comboBadge.style.opacity = '0';
    }

    // Step Adversary Physics
    if (state.settings.game?.adversary?.isActive) {
      stepAdversary();
      updateDistanceBadge();
    }

  }, 1000);
}

function stopGameLoop() {
  releaseWakeLock();
  saveSettings({ game: { ...state.settings.game, isActive: false, startTime: null } });
  if (gameTimerInterval) clearInterval(gameTimerInterval);
  
  document.getElementById('icon-play').style.display = 'block';
  document.getElementById('icon-stop').style.display = 'none';
  document.getElementById('btn-play-game').style.backgroundColor = 'var(--river-blue)';
  document.getElementById('game-timer').style.display = 'none';
  document.getElementById('game-score-badge').style.display = 'none';
  document.getElementById('game-combo-badge').style.display = 'none';
  updateDistanceBadge();
}

// --- Geodesic Math & Target Logic ---
export function calculateDistanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Radius of the earth in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
}

export function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = deg => deg * Math.PI / 180;
  const toDeg = rad => rad * 180 / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

export function updateDistanceBadge() {
  const badge = document.getElementById('target-distance-badge');
  const advBadge = document.getElementById('adv-status-badge');
  const targetId = state.settings.game?.activeTargetId;
  const gameActive = state.settings.game?.isActive;
  
  const homeLocStr = localStorage.getItem('locus_home');
  let homeLoc = null;
  if (homeLocStr) {
    try {
      homeLoc = JSON.parse(homeLocStr);
    } catch (e) {}
  }

  // --- Stalker Distance HUD & Alarms ---
  if (advBadge) {
    if (gameActive && state.settings.game?.adversary?.isActive) {
      advBadge.style.display = 'inline-block';
      const spd = state.settings.game.adversary.speedLevel;
      let label = spd === 1 ? '🏹 STALKER' : spd === 2 ? '🏹 HUNTER' : '🏹 SLAYER';
      
      if (adversaryMarker && homeLoc) {
        try {
          const advPos = adversaryMarker.getLatLng();
          const distM = calculateDistanceMiles(homeLoc.lat, homeLoc.lng, advPos.lat, advPos.lng);
          const distF = distM * 5280;
          label += ` (${distM < 0.1 ? Math.round(distF) + ' ft' : distM.toFixed(2) + ' mi'})`;
          
          if (distF <= 500 && !document.body.classList.contains('red-alert')) {
             document.body.classList.add('red-alert');
          } else if (distF > 500 && document.body.classList.contains('red-alert')) {
             document.body.classList.remove('red-alert');
          }
          
          if (distF <= 500) {
            const now = Date.now();
            if (now - lastAlertTime > 2000) {
               lastAlertTime = now;
               playRedAlert();
               if (window.navigator && window.navigator.vibrate) window.navigator.vibrate([200, 100, 200]);
            }
          }
        } catch (e) {}
      }
      advBadge.innerHTML = label;
    } else {
      advBadge.style.display = 'none';
      if (document.body.classList.contains('red-alert')) document.body.classList.remove('red-alert');
    }
  }

  // --- Universal Auto-Trigger Logic ---
  if (gameActive && homeLoc && !autoConfirmActive) {
    const triggerRadius = state.settings.triggerRadiusFt || 75;
    for (const c of state.caches) {
      if (!c.checkedInTime) {
        const dMiles = calculateDistanceMiles(homeLoc.lat, homeLoc.lng, c.lat, c.lng);
        if (dMiles * 5280 <= triggerRadius) {
          autoConfirmActive = true;
          triggerAutoConfirm(c.id, c.name || "Geocache");
          break; // Stop checking others
        }
      }
    }
  }

  // --- Active Target Distance & Arrow ---
  if (!targetId || !gameActive || !homeLoc) {
    badge.style.display = 'none';
    return;
  }
  
  const targetCache = state.caches.find(c => c.id === targetId);
  if (!targetCache) {
    badge.style.display = 'none';
    return;
  }
  
  try {
    const distMiles = calculateDistanceMiles(homeLoc.lat, homeLoc.lng, targetCache.lat, targetCache.lng);
    const bearing = calculateBearing(homeLoc.lat, homeLoc.lng, targetCache.lat, targetCache.lng);
    
    badge.style.display = 'flex';
    const distFeet = distMiles * 5280;
    let textStr = distMiles < 0.1 ? `${Math.round(distFeet)} ft` : `${distMiles.toFixed(2)} mi`;
    
    // Add Compass Arrow pointing to target
    badge.innerHTML = `<span style="font-size: 0.8em; opacity: 0.7;">📍</span> ${textStr} <span style="display:flex; align-items:center; justify-content:center; transform: rotate(${bearing}deg); transition: transform 0.3s ease-out; color: #ff4d4f; height: 1em; width: 1em;">⬆</span>`;
  } catch (e) {
    console.error("Distance math error:", e);
  }
}

function playRedAlert() {
  try {
    if (!globalAudioCtx) {
      globalAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const audioCtx = globalAudioCtx;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime); // High pitch
    osc.frequency.setValueAtTime(600, audioCtx.currentTime + 0.1); // Drop pitch
    
    gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
  } catch (e) {}
}

function triggerAutoConfirm(cacheId, cacheName) {
  let timeLeft = 5;
  showCustomModal("🎯 Target Acquired!", `You have reached <b>${cacheName}</b>!<br><br>Auto-securing in <span id="auto-confirm-timer" style="font-weight:bold; color:var(--forest-green); font-size: 1.2rem;">${timeLeft}</span> seconds...`, {
    hideDefaultButtons: true,
    htmlContent: `
      <div style="display: flex; gap: 8px; margin-top: 16px;">
        <button id="btn-auto-confirm-now" style="flex: 1; background: var(--forest-green); color: white; border: none; padding: 12px; border-radius: 8px; font-weight: 700; cursor: pointer; font-family: Inter, sans-serif;">Secure Now</button>
      </div>`
  });

  const timerInterval = setInterval(() => {
    timeLeft--;
    const tSpan = document.getElementById('auto-confirm-timer');
    if (tSpan) tSpan.textContent = Math.max(0, timeLeft);
    
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      const cancelBtn = document.getElementById('modal-btn-cancel');
      if (cancelBtn) cancelBtn.click(); // Close modal silently
      window.actionCheckIn(cacheId);
      setTimeout(() => { autoConfirmActive = false; }, 2000); // 2 sec cooldown
    }
  }, 1000);

  // Hook manual interaction
  setTimeout(() => {
    const btn = document.getElementById('btn-auto-confirm-now');
    if (btn) {
      btn.addEventListener('click', () => {
        clearInterval(timerInterval);
        const cancelBtn = document.getElementById('modal-btn-cancel');
        if (cancelBtn) cancelBtn.click();
        window.actionCheckIn(cacheId);
        setTimeout(() => { autoConfirmActive = false; }, 2000);
      });
    }
    const cancelBtn = document.getElementById('modal-btn-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        clearInterval(timerInterval);
        setTimeout(() => { autoConfirmActive = false; }, 5000); // 5 sec penalty if aborted
      }, { once: true });
    }
  }, 100);
}

function stepAdversary() {
  if (!currentLocationMarker || !state.settings.game?.isActive) return;
  const playerPos = currentLocationMarker.getLatLng();
  
  if (!adversaryMarker) {
    // Spawn Adversary 0.25 miles away in a random direction
    const angle = Math.random() * Math.PI * 2;
    const spawnDist = 0.25; // miles
    const latOffset = (spawnDist / 69) * Math.cos(angle);
    const lngOffset = (spawnDist / (69 * Math.cos(playerPos.lat * Math.PI / 180))) * Math.sin(angle);
    
    const adversaryIcon = L.divIcon({
      className: 'adversary-icon',
      html: `<div style="width: 24px; height: 24px; background: #ef4444; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 15px #ef4444; animation: pulse 1s infinite alternate;"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    
    adversaryMarker = L.marker([playerPos.lat + latOffset, playerPos.lng + lngOffset], { icon: adversaryIcon, zIndexOffset: 999 }).addTo(map);
  }
  
  const advPos = adversaryMarker.getLatLng();
  const distMiles = calculateDistanceMiles(advPos.lat, advPos.lng, playerPos.lat, playerPos.lng);
  const distFeet = distMiles * 5280;
  
  // Game Over Condition Check
  if (distFeet <= 30) {
    stopGameLoop(); // Halt game immediately
    showCustomModal("💀 GAME OVER", "You were caught by The Hunter! The adversary has terminated your run. Better luck next time...", {
      hideDefaultButtons: true,
      htmlContent: `
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 16px;">
          <button onclick="window.actionPlayAgain()" style="background: var(--forest-green); color: white; border: none; padding: 12px; border-radius: 8px; font-weight: 700; font-family: Inter, sans-serif; cursor: pointer; font-size: 1rem;">🔄 Play Again</button>
          <button onclick="window.actionExitToMap()" style="background: #e2e8f0; color: #475569; border: 1px solid #cbd5e1; padding: 10px; border-radius: 8px; font-weight: 600; font-family: inherit; cursor: pointer;">❌ Exit</button>
        </div>` 
    });
    return;
  }
  
  // Physics: Move towards player based on Speed Level (1 = 3mph, 2 = 6mph, 3 = 12mph)
  const speedScale = state.settings.game.adversary.speedLevel || 1;
  const mph = speedScale === 1 ? 3 : speedScale === 2 ? 6 : 12;
  const milesPerSecond = mph / 3600; // Distance covered in 1 second
  
  // Create interpolated vector step
  const ratio = milesPerSecond / distMiles;
  if (ratio >= 1 || isNaN(ratio)) {
    adversaryMarker.setLatLng(playerPos); // Snaps to player
  } else {
    const nextLat = advPos.lat + (playerPos.lat - advPos.lat) * ratio;
    const nextLng = advPos.lng + (playerPos.lng - advPos.lng) * ratio;
    adversaryMarker.setLatLng([nextLat, nextLng]);
  }
}

// Custom DivIcon renderer using SVG directly
function createCustomIcon(iconId) {
  const iconObj = CACHE_ICONS.find(c => c.id === iconId) || CACHE_ICONS[0];
  return L.divIcon({
    className: 'custom-l-icon',
    html: `<div style="width: 32px; height: 32px; background: white; border-radius: 50%; box-shadow: 0 3px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: #4CAF50; border: 2px solid #4CAF50;">${iconObj.svg}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16] // Center 
  });
}

function renderAllSavedPins() {
  // Clear existing pins except draft
  Object.values(mapMarkers).forEach(m => map.removeLayer(m));
  
  // Sort caches by sequence number if sequential, otherwise by timestamp
  const sortedCaches = [...state.caches].sort((a, b) => {
    if (state.settings.isSequential) {
      return (a.sequenceNum || 0) - (b.sequenceNum || 0);
    }
    return a.timestamp - b.timestamp;
  });
  
  sortedCaches.forEach((cache, index) => {
    let markerIcon;
    const isCompleted = !!cache.checkedInTime;

    if (isCompleted) {
      markerIcon = L.divIcon({
        className: 'custom-l-icon-completed',
        html: `<div style="width: 32px; height: 32px; background: #22c55e; border-radius: 50%; box-shadow: 0 3px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; border: 2px solid white;"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" style="width: 20px; height: 20px;"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });
    } else if (state.settings.isSequential) {
      // Generate a numbered SVG icon
      const seqNumber = cache.sequenceNum || (index + 1);
      const bg = (state.settings.game?.activeTargetId === cache.id) ? '#ff4d4f' : 'var(--forest-green)';
      markerIcon = L.divIcon({
        className: 'custom-l-icon-sequence',
        html: `<div style="width: 32px; height: 32px; background: ${bg}; border-radius: 50%; box-shadow: 0 3px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; border: 2px solid white; font-weight: bold; font-family: Inter, sans-serif;">${seqNumber}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16] // Center 
      });
    } else {
      // Standard custom shapes
      markerIcon = createCustomIcon(cache.iconId);
      // Optional: Add some highlight CSS to custom icon if target
      if (state.settings.game?.activeTargetId === cache.id) {
        markerIcon.options.html = markerIcon.options.html.replace('border: 2px solid #4CAF50;', 'border: 3px solid #ff4d4f; color: #ff4d4f;');
      }
    }

    const marker = L.marker([cache.lat, cache.lng], {
      icon: markerIcon,
      draggable: true // Enable drag-and-drop relocation natively
    }).addTo(map);

    marker.on('dragend', async (e) => {
      const pos = e.target.getLatLng();
      cache.lat = pos.lat;
      cache.lng = pos.lng;
      cache.timestamp = Date.now();
      await saveCache(cache); // Auto-save on drop
      
      // If we're editing this cache right now, update the inputs to match
      if (activeCacheId === cache.id && drawerState.drawer.classList.contains('open')) {
        drawerState.inputs.lat.value = cache.lat.toFixed(5);
        drawerState.inputs.lng.value = cache.lng.toFixed(5);
      }
    });

    marker.bindPopup(() => {
      let titleHTML = `<h3 style="margin: 0 0 4px 0; font-size:16px; color: var(--forest-dark); border-bottom: 2px solid #eee; padding-bottom:4px;">${cache.name || 'Unnamed Cache'}</h3>`;
      if (cache.checkedInTime) {
        titleHTML += `<div style="text-align:center; padding: 12px; margin-bottom:8px; color: #fff; background: #22c55e; border-radius:6px; font-weight:800; font-size: 14px; text-transform: uppercase;">✅ Secure!</div>`;
      } else if (state.settings.game?.isActive && state.settings.game?.activeTargetId === cache.id) {
        const homeLocStr = localStorage.getItem('locus_home');
        let distMiles = Infinity;
        if (homeLocStr) {
          const homeLoc = JSON.parse(homeLocStr);
          distMiles = calculateDistanceMiles(homeLoc.lat, homeLoc.lng, cache.lat, cache.lng);
        }
        
        if (distMiles < 0.0284) { // Less than 150 feet
          titleHTML += `<button onclick="window.actionCheckIn('${cache.id}')" style="width:100%; margin-bottom: 12px; background: #22c55e; color: white; border:none; padding:10px; border-radius:6px; font-weight:700; cursor:pointer;" title="Tap to Collect!">✅ Check-In!</button>`;
        } else {
          titleHTML += `<button onclick="window.actionTarget('${cache.id}')" style="width:100%; margin-bottom: 8px; background: #94a3b8; color: white; border:none; padding:10px; border-radius:6px; font-weight:700; cursor:not-allowed;" disabled title="You must be within 150ft!">Move closer...</button>`;
          titleHTML += `<button onclick="window.actionOverrideCheckIn('${cache.id}')" style="width:100%; margin-bottom: 12px; background: #eab308; color: white; border:none; padding:8px; border-radius:6px; font-weight:600; cursor:pointer; font-size: 0.85rem;" title="Force Check-In">🔓 Override Security</button>`;
        }
      } else {
        const isGameOn = state.settings.game && state.settings.game.isActive;
        const btnOpacity = isGameOn ? '1' : '0.5';
        const pointerEvents = isGameOn ? 'auto' : 'none';
        
        titleHTML += `<button onclick="window.actionTarget('${cache.id}')" style="width:100%; margin-bottom: 12px; background: var(--river-blue); color: white; border:none; padding:10px; border-radius:6px; font-weight:700; cursor:pointer; opacity: ${btnOpacity}; pointer-events: ${pointerEvents};" title="${isGameOn ? 'Lock Target' : 'Start the Game First'}">🎯 Set as Target</button>`;
      }

      return `
        <div style="min-width: 170px; font-family: Inter, sans-serif;">
          ${titleHTML}
          ${cache.desc ? `<p style="margin: 0 0 16px 0; font-size:12.5px; color:#555; line-height: 1.4;">${cache.desc}</p>` : ''}
          <div style="display:flex; justify-content: space-between; align-items:center; border-top: 1px solid #eee; padding-top: 8px;">
            <button onclick="window.actionEdit('${cache.id}')" style="flex:1; background: transparent; color: #475569; border:1px solid #cbd5e1; padding:6px; border-radius:4px; font-weight:600; cursor:pointer;">✏️ Edit</button>
          </div>
        </div>
      `;
    }, { className: 'custom-glass-popup', minWidth: 200 });

    // Long press sets it as active target bypass
    marker.on('contextmenu', () => {
      window.actionTarget(cache.id);
      // Optional: Flash a toast
      if(window.navigator && window.navigator.vibrate) window.navigator.vibrate(50);
    });

    mapMarkers[cache.id] = marker;
  });
}

function openCacheForEdit(cache) {
  activeCacheId = cache.id;
  drawerState.title.textContent = 'Edit Geocache';
  drawerState.btnDelete.style.display = 'block';
  drawerState.scoreboardBlock.style.display = 'none';

  // Temporarily remove original marker from map so it doesn't overlap the draft edit marker
  if (mapMarkers[cache.id]) {
    map.removeLayer(mapMarkers[cache.id]);
  }

  drawerState.inputs.name.value = cache.name;
  drawerState.inputs.desc.value = cache.desc;
  drawerState.inputs.lat.value = cache.lat.toFixed(5);
  drawerState.inputs.lng.value = cache.lng.toFixed(5);
  drawerState.inputs.sequence.value = cache.sequenceNum || '';
  drawerState.inputs.points.value = cache.points !== undefined ? cache.points : 10;

  if (state.settings.isSequential) {
    document.getElementById('group-sequence-order').style.display = 'block';
    document.getElementById('group-icon-selector').style.display = 'none';
  } else {
    document.getElementById('group-sequence-order').style.display = 'none';
    document.getElementById('group-icon-selector').style.display = 'block';
  }

  selectedIconId = cache.iconId;
  document.querySelectorAll('.icon-option').forEach(n => n.classList.remove('selected'));
  const idx = CACHE_ICONS.findIndex(c => c.id === selectedIconId);
  if (idx >= 0) drawerState.iconSelector.children[idx].classList.add('selected');

  updateDraftMarker({ lat: cache.lat, lng: cache.lng });
  map.panTo([cache.lat, cache.lng]);
  openDrawer();
}

// --- DOM Elements ---
const drawerState = {
  drawer: document.getElementById('designer-drawer'),
  backdrop: document.getElementById('drawer-backdrop'),
  title: document.getElementById('drawer-title'),
  btnOpen: document.getElementById('btn-add-cache'),
  btnSave: document.getElementById('btn-save-cache'),
  btnCancel: document.getElementById('btn-cancel-cache'),
  btnDelete: document.getElementById('btn-delete-cache'),
  inputs: {
    name: document.getElementById('cache-name'),
    desc: document.getElementById('cache-desc'),
    lat: document.getElementById('cache-lat'),
    lng: document.getElementById('cache-lng'),
    sequence: document.getElementById('cache-sequence'),
    points: document.getElementById('cache-points')
  },
  iconSelector: document.getElementById('icon-selector'),
  scoreboardBlock: document.getElementById('scoreboard-block'),
  scoreboardContent: document.getElementById('scoreboard-content')
};

// --- Custom Modal System ---
function showCustomModal(title, message, options = { showInput: false, inputValue: '', showStory: false, storyValue: '', showTimeInfo: false, timeValue: 0 }) {
  return new Promise((resolve) => {
    const backdrop = document.getElementById('custom-modal-backdrop');
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const msgEl = document.getElementById('modal-message');
    const inputContainer = document.getElementById('modal-input-container');
    const inputEl = document.getElementById('modal-input');
    const storyContainer = document.getElementById('modal-story-container');
    const storyEl = document.getElementById('modal-story-textarea');
    const timeContainer = document.getElementById('modal-time-container');
    const timeInput = document.getElementById('modal-time-input');
    const htmlContainer = document.getElementById('modal-html-container');
    const btnCancel = document.getElementById('modal-btn-cancel');
    const btnConfirm = document.getElementById('modal-btn-confirm');

    titleEl.textContent = title;
    msgEl.innerHTML = message; // Allow basic html in message if needed
    
    if (options.htmlContent) {
      htmlContainer.style.display = 'block';
      htmlContainer.innerHTML = options.htmlContent;
    } else {
      htmlContainer.style.display = 'none';
      htmlContainer.innerHTML = '';
    }

    if (options.showTimeInfo) {
      timeContainer.style.display = 'block';
      timeInput.value = options.timeValue || 0;
    } else {
      timeContainer.style.display = 'none';
    }

    if (options.showStory) {
      storyContainer.style.display = 'block';
      storyEl.value = options.storyValue || '';
    } else {
      storyContainer.style.display = 'none';
    }

    if (options.showInput) {
      inputContainer.style.display = 'block';
      inputEl.value = options.inputValue || '';
      btnCancel.style.display = 'block';
      setTimeout(() => inputEl.focus(), 100);
    } else {
      inputContainer.style.display = 'none';
      btnCancel.style.display = 'block'; // Always show cancel for confirms
    }

    if (options.hideDefaultButtons) {
      btnCancel.style.display = 'none';
      btnConfirm.style.display = 'none';
    } else {
      btnConfirm.style.display = 'block';
    }

    backdrop.classList.add('active');
    modal.classList.add('open');

    const cleanup = () => {
      backdrop.classList.remove('active');
      modal.classList.remove('open');
      btnConfirm.replaceWith(btnConfirm.cloneNode(true));
      btnCancel.replaceWith(btnCancel.cloneNode(true));
    };

    document.getElementById('modal-btn-confirm').addEventListener('click', () => {
      cleanup();
      if (options.htmlContent) {
        resolve(document.getElementById('modal-html-container'));
      } else if (options.showInput || options.showTimeInfo || options.showStory) {
        resolve({
          text: inputEl.value,
          story: storyEl.value,
          timeMinutes: parseInt(timeInput.value, 10) || 0
        });
      } else {
        resolve(true); // normal confirm
      }
    }, { once: true });

    document.getElementById('modal-btn-cancel').addEventListener('click', () => {
      cleanup();
      resolve(null);
    }, { once: true });
  });
}

function getTotalPossibleScore() {
  if (!state.caches) return 0;
  let total = 0;
  state.caches.forEach(c => {
    // Already secured caches contribute their earned value (which might include combos). Unsecured caches contribute their base value.
    if (c.checkedInTime) {
      total += (c.pointsAwarded || 0);
    } else {
      total += (c.points !== undefined ? c.points : 10);
    }
  });
  return total;
}

// --- Scoreboard Engine ---
function updateScoreboard() {
  if (!state.caches || state.caches.length === 0) {
    drawerState.scoreboardContent.innerHTML = '<p>No caches created yet. Add some below!</p>';
    return;
  }
  
  const totalCaches = state.caches.length;
  let securedCaches = 0;
  
  let html = `<div style="display: flex; flex-direction: column; gap: 6px;">`;
  const sortedCaches = [...state.caches].sort((a, b) => (a.sequenceNum || 0) - (b.sequenceNum || 0));
  
  let totalScore = 0;
  
  sortedCaches.forEach(cache => {
    const isSecured = !!cache.checkedInTime;
    const basePts = cache.points !== undefined ? cache.points : 10;
    if (isSecured) {
       securedCaches++;
       totalScore += (cache.pointsAwarded || basePts);
    }
    
    html += `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; background: rgba(255,255,255,0.5); border-radius: 4px;">
        <span style="font-weight: 500; font-size: 0.85rem;">
          ${state.settings.isSequential ? `${cache.sequenceNum}. ` : ''}${cache.name}
        </span>
        <span style="font-size: 0.9rem;">
          ${isSecured ? `✅ <b style="color:#16a34a;">+${cache.pointsAwarded || basePts}</b>` : `⏳ <span style="color:#888;">${basePts} pts</span>`}
        </span>
      </div>
    `;
  });
  
  html += `
    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #eab308; display: flex; justify-content: space-between; font-weight: 700; align-items: center;">
      <span>TOTAL SCORE</span>
      <span style="color: #b45309; font-size: 1.1rem;">${totalScore} / ${getTotalPossibleScore()}</span>
    </div>
  </div>`;
  
  drawerState.scoreboardContent.innerHTML = html;
}

// --- Drawer & Interaction Logic ---
function setupDrawer() {
  // Populate Icons
  CACHE_ICONS.forEach(iconObj => {
    const el = document.createElement('div');
    el.className = 'icon-option';
    el.innerHTML = iconObj.svg;
    if (iconObj.id === selectedIconId) el.classList.add('selected');
    
    el.addEventListener('click', () => {
      document.querySelectorAll('.icon-option').forEach(n => n.classList.remove('selected'));
      el.classList.add('selected');
      selectedIconId = iconObj.id;
    });
    drawerState.iconSelector.appendChild(el);
  });

  drawerState.btnCancel.addEventListener('click', closeDrawer);

  // Open Drawer (Add New) / Toggle Cancel
  drawerState.btnOpen.addEventListener('click', () => {
    if (drawerState.drawer.classList.contains('open')) {
      closeDrawer();
      return;
    }
  
    activeCacheId = null;
    drawerState.title.textContent = 'Add Geocache';
    drawerState.btnDelete.style.display = 'none';
    drawerState.scoreboardBlock.style.display = 'block';
    
    updateScoreboard();
    clearDrawerInputs();
    
    // Auto-increment sequence number for new caches
    const maxSeq = state.caches.reduce((max, c) => Math.max(max, c.sequenceNum || 0), 0);
    drawerState.inputs.sequence.value = maxSeq + 1;
    drawerState.inputs.points.value = 10; // Default points value

    if (state.settings.isSequential) {
      document.getElementById('group-sequence-order').style.display = 'block';
      document.getElementById('group-icon-selector').style.display = 'none';
    } else {
      document.getElementById('group-sequence-order').style.display = 'none';
      document.getElementById('group-icon-selector').style.display = 'block';
    }
    
    selectedIconId = 'box';
    document.querySelectorAll('.icon-option').forEach(n => n.classList.remove('selected'));
    drawerState.iconSelector.children[0].classList.add('selected');

    // Use current map center as default draft latlng
    updateDraftMarker(map.getCenter());
    openDrawer();
  });

  // Close Drawer
  drawerState.backdrop.addEventListener('click', closeDrawer);

  // Input changes update the marker
  drawerState.inputs.lat.addEventListener('input', syncInputsToMarker);
  drawerState.inputs.lng.addEventListener('input', syncInputsToMarker);

  // Save Event
  drawerState.btnSave.addEventListener('click', async () => {
    const name = drawerState.inputs.name.value;
    const desc = drawerState.inputs.desc.value;
    const lat = parseFloat(drawerState.inputs.lat.value);
    const lng = parseFloat(drawerState.inputs.lng.value);
    const seq = parseInt(drawerState.inputs.sequence.value, 10);
    const pts = parseInt(drawerState.inputs.points.value, 10);

    if (!name || isNaN(lat) || isNaN(lng)) {
      alert("Name and valid coordinates are required.");
      return;
    }

    if (state.settings.isSequential) {
      if (isNaN(seq) || seq <= 0) {
        await showCustomModal("Error", "A valid positive sequence number is required in Sequential Mode.");
        return;
      }
      // Check for duplicates
      const duplicate = state.caches.find(c => c.sequenceNum === seq && c.id !== activeCacheId);
      if (duplicate) {
        await showCustomModal("Duplicate Number", `Sequence number ${seq} is already used by "${duplicate.name}". Please choose a unique number.`);
        return;
      }
    }

    const payload = {
      id: activeCacheId || Date.now().toString(),
      name,
      desc,
      lat,
      lng,
      iconId: selectedIconId,
      sequenceNum: isNaN(seq) ? 0 : seq,
      points: isNaN(pts) ? 10 : pts,
      timestamp: Date.now()
    };

    await saveCache(payload);
    renderAllSavedPins();
    closeDrawer();
  });
  // Delete Event
  drawerState.btnDelete.addEventListener('click', async () => {
    if (activeCacheId) {
      const isConfirmed = await showCustomModal("Delete Cache?", "Are you sure you want to remove this location?");
      if (isConfirmed) {
        await deleteCache(activeCacheId);
        renderAllSavedPins();
        closeDrawer();
      }
    }
  });

  // Reorder Sequence Event
  const btnReorder = document.getElementById('btn-reorder-caches');
  if (btnReorder) {
    btnReorder.addEventListener('click', async () => {
      if (state.caches.length === 0) {
        await showCustomModal("Reorder Caches", "There are no caches to reorder yet.");
        return;
      }

      // Generate HTML for the list of caches
      const caches = [...state.caches].sort((a, b) => (a.sequenceNum || 0) - (b.sequenceNum || 0));
      let html = `<div style="display: flex; flex-direction: column; gap: 8px;">`;
      caches.forEach(cache => {
        html += `
          <div style="display: flex; align-items: center; justify-content: space-between; background: #f9f9f9; padding: 8px; border-radius: 6px; border: 1px solid #e0e0e0;">
            <span style="font-size: 0.9rem; font-weight: 500; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${cache.name}</span>
            <input type="number" class="reorder-input" data-id="${cache.id}" value="${cache.sequenceNum || 0}" min="1" step="1" style="width: 60px; padding: 4px; border: 1px solid #ccc; border-radius: 4px; text-align: center;">
          </div>
        `;
      });
      html += `</div>`;

      const result = await showCustomModal("Reorder Sequence", "Adjust the sequence numbers below. They must be unique.", { htmlContent: html });
      if (result) {
        // Validation loop
        const inputs = result.querySelectorAll('.reorder-input');
        const updates = [];
        const seen = new Set();
        let hasError = false;

        inputs.forEach(input => {
          const val = parseInt(input.value, 10);
          if (isNaN(val) || val <= 0) hasError = "All sequence numbers must be positive integers.";
          if (seen.has(val)) hasError = "Duplicate sequence numbers detected. You must use unique numbers.";
          seen.add(val);
          updates.push({ id: input.getAttribute('data-id'), seq: val });
        });

        if (hasError) {
          await showCustomModal("Error", hasError);
          return;
        }

        // Apply updates
        for (const update of updates) {
          const cache = state.caches.find(c => c.id === update.id);
          if (cache && cache.sequenceNum !== update.seq) {
            cache.sequenceNum = update.seq;
            await saveCache(cache);
          }
        }
        
        renderAllSavedPins();
      }
    });
  }
}

function openDrawer() {
  drawerState.drawer.classList.add('open');
  drawerState.backdrop.classList.add('active');
}

function closeDrawer() {
  drawerState.drawer.classList.remove('open');
  drawerState.backdrop.classList.remove('active');
  if (currentCacheMarker) {
    map.removeLayer(currentCacheMarker);
    currentCacheMarker = null;
  }
  // Restore all pins in case we cancelled out of an edit where we hid the original
  renderAllSavedPins();
}

function clearDrawerInputs() {
  drawerState.inputs.name.value = '';
  drawerState.inputs.desc.value = '';
  drawerState.inputs.lat.value = '';
  drawerState.inputs.lng.value = '';
  drawerState.inputs.sequence.value = '';
}

function syncInputsToMarker() {
  const lat = parseFloat(drawerState.inputs.lat.value);
  const lng = parseFloat(drawerState.inputs.lng.value);
  if (!isNaN(lat) && !isNaN(lng)) {
    updateDraftMarker([lat, lng], false);
    map.panTo([lat, lng]);
  }
}

function updateDraftMarker(latlng, updateInputs = true) {
  if (updateInputs) {
    drawerState.inputs.lat.value = latlng.lat.toFixed(5);
    drawerState.inputs.lng.value = latlng.lng.toFixed(5);
  }

  if (!currentCacheMarker) {
    currentCacheMarker = L.marker(latlng, { draggable: true }).addTo(map);
    currentCacheMarker.on('dragend', (e) => {
      const pos = e.target.getLatLng();
      drawerState.inputs.lat.value = pos.lat.toFixed(5);
      drawerState.inputs.lng.value = pos.lng.toFixed(5);
    });
  } else {
    currentCacheMarker.setLatLng(latlng);
  }
}

window.bootNewMap = async () => {
  document.getElementById('modal-btn-cancel').click();
  const result = await showCustomModal(
    "👋 New Game Setup", 
    "What is the overarching Narrative Goal for this adventure?", 
    { 
      showInput: true, 
      inputValue: "Find the hidden treasures around town!",
      showStory: true,
      storyValue: state.settings.narrativeStory || "",
      showTimeInfo: true,
      timeValue: 0
    }
  );
  
  if (result !== null && result.text.trim() !== '') {
    window.finishBootSetup(result.text, result.story || "", result.timeMinutes);
  }
};

window.finishBootSetup = async (goalTxt, storyTxt, timeMins) => {
    let newAdversary = state.settings.game?.adversary || { isActive: false, speedLevel: 0 };

    await saveSettings({ 
      narrativeGoal: goalTxt,
      narrativeStory: storyTxt,
      targetTimeMinutes: timeMins,
      game: { ...state.settings.game, adversary: newAdversary }
    });
    
    document.getElementById('narrative-text').textContent = goalTxt;
    document.getElementById('narrative-container').title = storyTxt;
    
    // Post-wizard Hint
    setTimeout(() => {
      showCustomModal("🗺️ Map Empty", "Your game board is currently empty!<br><br>Use the green <b>+</b> button to place caches manually, or the black <b>Dice</b> button to scatter random caches around your area.");
    }, 500);
};

window.actionSetAdversary = async (advSpeed) => {
  let newAdversary = { ...(state.settings.game?.adversary || {}) };
  const btnAdversary = document.getElementById('btn-adversary-mode');
  
  if (advSpeed > 0) {
    newAdversary.isActive = true;
    newAdversary.speedLevel = advSpeed;
    if (btnAdversary) {
      btnAdversary.style.background = '#ef4444';
      btnAdversary.style.color = 'white';
    }
    alert(`Adversary Mode active! The Hunter will spawn and give chase at Speed Level ${advSpeed}.`);
  } else {
    newAdversary.isActive = false;
    newAdversary.speedLevel = 0;
    if (adversaryMarker) {
      if(map) map.removeLayer(adversaryMarker);
      adversaryMarker = null;
    }
    if (btnAdversary) {
      btnAdversary.style.background = 'white';
      btnAdversary.style.color = '#ef4444';
    }
    alert("Adversary Mode disabled (Classic Cache Dash).");
  }
  
  await saveSettings({ 
    game: { ...state.settings.game, adversary: newAdversary }
  });
  
  updateDistanceBadge(); // Force HUD refresh immediately
};

async function runBootSequence() {
  // Trigger if no caches exist OR if the narrative goal was wiped back to default/null
  if (state.caches.length === 0 || !state.settings.narrativeGoal || state.settings.narrativeGoal === "Find the hidden treasures around town!") {
    await showCustomModal(
      "👋 Welcome to Cache Dash!", 
      "Would you like to start a brand new game, or load an existing map file sent by a friend?", 
      { 
        hideDefaultButtons: true,
        htmlContent: `
          <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 16px;">
            <label for="locus-file-import" style="background: var(--river-blue); color: white; border: none; padding: 14px; border-radius: 8px; font-weight: 700; font-family: Inter, sans-serif; cursor: pointer; font-size: 1.1rem; text-align: center; display: block;" onclick="document.getElementById('modal-btn-cancel').click();">📂 Load Map Data</label>
            <button onclick="window.bootNewMap()" style="background: var(--forest-green); color: white; border: none; padding: 14px; border-radius: 8px; font-weight: 700; font-family: Inter, sans-serif; cursor: pointer; font-size: 1.1rem;">✨ Start New Game</button>
          </div>
        `
      }
    );
  }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', async () => {
  await initMap();
  setupDrawer();
  
  // Initialize Narrative UI
  document.getElementById('narrative-text').textContent = state.settings.narrativeGoal;
  if (state.settings.narrativeStory) {
    document.getElementById('narrative-container').title = state.settings.narrativeStory;
  }
  
  // Wait a short moment for map to render before triggering massive modals over it
  setTimeout(() => {
    runBootSequence();
  }, 100);
  
  // Connect Auto Center Toggle
  const btnLoc = document.getElementById('btn-my-location');
  if (btnLoc) {
    btnLoc.addEventListener('click', () => {
      window.isAutoCenter = !window.isAutoCenter;
      if (window.isAutoCenter) {
        btnLoc.style.background = 'var(--river-blue)';
        btnLoc.style.color = 'white';
        if (currentLocationMarker && map) map.panTo(currentLocationMarker.getLatLng());
      } else {
        btnLoc.style.background = 'white';
        btnLoc.style.color = 'var(--river-blue)';
      }
    });
    btnLoc.style.background = 'var(--river-blue)';
    btnLoc.style.color = 'white';
  }
  
  // Set up Settings Listeners
  const toggleSeq = document.getElementById('toggle-sequence');
  if (toggleSeq) {
    toggleSeq.checked = state.settings.isSequential;
    toggleSeq.addEventListener('change', async (e) => {
      await saveSettings({ isSequential: e.target.checked });
      renderAllSavedPins();
    });
  }

  const triggerRadiusInput = document.getElementById('trigger-radius');
  const triggerRadiusDisplay = document.getElementById('trigger-radius-display');
  if (triggerRadiusInput && triggerRadiusDisplay) {
    // Init existing value
    const radius = state.settings.triggerRadiusFt || 75;
    triggerRadiusInput.value = radius;
    triggerRadiusDisplay.textContent = `${radius} ft`;
    
    // Live update display
    triggerRadiusInput.addEventListener('input', (e) => {
      triggerRadiusDisplay.textContent = `${e.target.value} ft`;
    });
    
    // Save on release
    triggerRadiusInput.addEventListener('change', async (e) => {
      await saveSettings({ triggerRadiusFt: parseInt(e.target.value, 10) });
    });
  }
  
  // Connect Adversary Mode Toggle
  const btnAdversary = document.getElementById('btn-adversary-mode');
  if (btnAdversary) {
    if (state.settings.game?.adversary?.isActive) {
      btnAdversary.style.background = '#ef4444';
      btnAdversary.style.color = 'white';
    }
    btnAdversary.addEventListener('click', async () => {
      await showCustomModal(
        "🏃 Adversary Mode", 
        "Do you want to enable 'The Hunter'? This creates a hostile radius on the map that will actively chase you while you play. <br><br><b>Warning:</b> If they catch you, it's instant Game Over.",
        {
          hideDefaultButtons: true,
          htmlContent: `
            <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 16px;">
              <button onclick="document.getElementById('modal-btn-cancel').click(); window.actionSetAdversary(0);" style="background: var(--soft-pearl); color: #333; border: 1px solid #ccc; padding: 12px; border-radius: 8px; font-weight: 600; cursor: pointer; font-family: Inter, sans-serif;">Off (Classic Game)</button>
              <button onclick="document.getElementById('modal-btn-cancel').click(); window.actionSetAdversary(1);" style="background: #fbbf24; color: #78350f; border: none; padding: 12px; border-radius: 8px; font-weight: 700; cursor: pointer; font-family: Inter, sans-serif;">Stalker (Walking Pace)</button>
              <button onclick="document.getElementById('modal-btn-cancel').click(); window.actionSetAdversary(2);" style="background: #f97316; color: white; border: none; padding: 12px; border-radius: 8px; font-weight: 700; cursor: pointer; font-family: Inter, sans-serif;">Hunter (Jogging Pace)</button>
              <button onclick="document.getElementById('modal-btn-cancel').click(); window.actionSetAdversary(3);" style="background: #ef4444; color: white; border: none; padding: 12px; border-radius: 8px; font-weight: 700; cursor: pointer; font-family: Inter, sans-serif;">Slayer (Sprinting Pace)</button>
            </div>
          `
        }
      );
    });
  }

  // Connect Help Button
  document.getElementById('btn-show-help').addEventListener('click', () => {
    showCustomModal("❓ Cache Dash Guide", 
      `<div class="markdown-body">
        ${marked.parse(faqRaw)}
       </div>`
    );
  });

  // Connect Edit Narrative Button
  document.getElementById('btn-edit-narrative').addEventListener('click', async () => {
    const currentGoal = state.settings.narrativeGoal;
    const currentStory = state.settings.narrativeStory || '';
    const currentTime = state.settings.targetTimeMinutes || 0;
    
    const result = await showCustomModal("Edit Goal", "What is the new objective for tracking?", { 
      showInput: true, 
      inputValue: currentGoal,
      showStory: true,
      storyValue: currentStory,
      showTimeInfo: true,
      timeValue: currentTime
    });
    
    if (result !== null && result.text.trim() !== '') {
      await saveSettings({ 
        narrativeGoal: result.text,
        narrativeStory: result.story || '',
        targetTimeMinutes: result.timeMinutes
      });
      document.getElementById('narrative-text').textContent = result.text;
      document.getElementById('narrative-container').title = result.story || "";
      
      // Force timer restart to use new settings if active
      if (state.settings.game && state.settings.game.isActive) startGameLoop();
    }
  });

  // Connect Play Game Button
  document.getElementById('btn-play-game').addEventListener('click', async () => {
    if (state.settings.game && state.settings.game.isActive) {
      const isConfirmed = await showCustomModal("Stop Game?", "Are you sure you want to stop the current race timer?");
      if (isConfirmed) stopGameLoop();
    } else {
      startGameLoop();
    }
  });

  // Connect Sync Button
  window.actionProceedExport = async (mode) => {
    const inputEl = document.getElementById('export-filename-input');
    const finalName = inputEl ? inputEl.value.trim() : 'locus_backup';
    document.getElementById('modal-btn-cancel').click(); // cleanly dismiss modal
    
    const { exportCaches } = await import('./export.js');
    await exportCaches(finalName || 'locus_backup', mode);
  };

  document.getElementById('btn-sync').addEventListener('click', async () => {
    const defaultName = state.settings.narrativeGoal ? state.settings.narrativeGoal.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'locus_backup';
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    
    let cloudBtnHtml = '';
    if (isMobile) {
      cloudBtnHtml = `<button onclick="window.actionProceedExport('cloud')" style="background: #10b981; color: white; border: none; padding: 12px; border-radius: 8px; font-weight: 700; font-family: Inter, sans-serif; cursor: pointer; font-size: 1rem;">☁️ Save to Google Drive / Cloud</button>`;
    }

    await showCustomModal("Export Map Data", "Choose a destination for your save file:", { 
      hideDefaultButtons: true,
      htmlContent: `
        <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 8px;">
          <input type="text" id="export-filename-input" value="${defaultName}" placeholder="File name..." style="padding: 10px; border: 1px solid #ccc; border-radius: 8px; font-family: Inter, sans-serif; font-size: 1rem;">
          
          <button onclick="window.actionProceedExport('local')" style="background: var(--river-blue); color: white; border: none; padding: 12px; border-radius: 8px; font-weight: 700; font-family: Inter, sans-serif; cursor: pointer; font-size: 1rem; margin-top: 8px;">💻 Save to Device</button>
          
          ${cloudBtnHtml}
          
          <button onclick="document.getElementById('modal-btn-cancel').click()" style="background: #e2e8f0; color: #475569; border: 1px solid #cbd5e1; padding: 10px; border-radius: 8px; font-weight: 600; font-family: inherit; cursor: pointer; margin-top: 4px;">Cancel</button>
        </div>
      `
    });
  });

  // Connect Delete All Button
  document.getElementById('btn-delete-all').addEventListener('click', async () => {
    const isConfirmed = await showCustomModal(
      "🗑️ Wipe Database?", 
      "Are you absolutely sure you want to delete ALL geocaches? This will also reset your current score, timer, and narrative goal. <br><br><b>This cannot be undone.</b>"
    );
    if (isConfirmed) {
      stopGameLoop();
      
      const { deleteAllCaches } = await import('./store.js');
      await deleteAllCaches();
      
      // Wipe Game Settings
      const newSettings = {
        theme: state.settings.theme,
        isSequential: state.settings.isSequential,
        narrativeGoal: "Find the hidden treasures around town!",
        narrativeStory: "",
        targetTimeMinutes: 0,
        game: {
          isActive: false,
          startTime: null,
          activeTargetId: null,
          score: 0,
          lastCheckinTime: null
        }
      };
      await saveSettings(newSettings);
      
      // Reset UI Elements explicitly
      document.getElementById('narrative-text').textContent = newSettings.narrativeGoal;
      document.getElementById('game-score-badge').textContent = `⭐ 0 / ${getTotalPossibleScore()}`;
      document.getElementById('game-score-badge').style.display = 'none';
      document.getElementById('game-timer').style.display = 'none';
      document.getElementById('icon-play').style.display = 'block';
      document.getElementById('icon-stop').style.display = 'none';
      document.getElementById('btn-play-game').style.backgroundColor = 'var(--river-blue)';
      updateDistanceBadge();
      
      renderAllSavedPins();
      closeDrawer(); // Ensure the drawer closes if open
      if (map) map.closePopup(); // Ensure any popups close
      
      // Auto-trigger setup wizard for the new empty game
      setTimeout(() => {
        runBootSequence(); 
      }, 500);
    }
  });

  // Connect Native File Import Input
  const fileImportInput = document.getElementById('locus-file-import');
  if (fileImportInput) {
    fileImportInput.addEventListener('change', async (e) => {
      if (e.target.files.length > 0) {
        const file = e.target.files[0];
        const { importCaches } = await import('./import.js');
        
        try {
          const { count, settings: importedSettings } = await importCaches(file);
          
          // Wipe local volatile state to receive new map cleanly
          stopGameLoop();
          
          const safeGoal = (importedSettings && importedSettings.narrativeGoal) ? importedSettings.narrativeGoal : "Imported Map Area";
          const safeStory = (importedSettings && importedSettings.narrativeStory) ? importedSettings.narrativeStory : "Discover the secrets hidden within this imported cache list.";
          
          const newSettings = {
            theme: state.settings.theme,
            isSequential: state.settings.isSequential,
            narrativeGoal: safeGoal,
            narrativeStory: safeStory,
            targetTimeMinutes: 0,
            game: { isActive: false, startTime: null, activeTargetId: null, score: 0, lastCheckinTime: null }
          };
          await saveSettings(newSettings);
            
          // Reset UI Elements explicitly
          document.getElementById('narrative-text').textContent = newSettings.narrativeGoal;
          document.getElementById('narrative-container').title = newSettings.narrativeStory;
          document.getElementById('game-score-badge').textContent = `⭐ 0 / ${getTotalPossibleScore()}`;
          document.getElementById('game-score-badge').style.display = 'none';
          document.getElementById('game-timer').style.display = 'none';
          document.getElementById('icon-play').style.display = 'block';
          document.getElementById('icon-stop').style.display = 'none';
          document.getElementById('btn-play-game').style.backgroundColor = 'var(--river-blue)';
          updateDistanceBadge();
          
          renderAllSavedPins();
          closeDrawer(); // Ensure the drawer closes if open
          if (map) map.closePopup(); // Ensure any popups close
          
          alert(`Success! Loaded ${count} geocaches into your map.`);
          
          // Auto-trigger setup wizard for the new empty game
          setTimeout(() => {
            runBootSequence(); 
          }, 500);
          
        } catch (err) {
          alert('Import failed: ' + err.message);
        }
        
        // Reset so input registers next time cleanly
        e.target.value = '';
      }
    });
  }


  // Connect Random Generator Button
  document.getElementById('btn-generate-random').addEventListener('click', async () => {
    const { getHomeLocation, generateRandomCaches } = await import('./random_caches.js');
    const { saveCache } = await import('./store.js');
    
    // 1. Ask or retrieve home location
    const homeLoc = await getHomeLocation();
    if (!homeLoc) {
      await showCustomModal("Error", "No valid location provided. Cannot generate random caches.");
      return;
    }

    // 1.5 Prompt for generation metrics
    const countInputObj = await showCustomModal("Random Caches", "How many random drops do you want to place?", { showInput: true, inputValue: "10" });
    if (countInputObj === null) return;
    let count = parseInt(countInputObj.text, 10);
    if (isNaN(count) || count <= 0) count = 10;

    const radiusInputObj = await showCustomModal("Distribution", `How many miles around this location do you want to place ${count} random drops?`, { showInput: true, inputValue: "1" });
    if (radiusInputObj === null) return;
    let radius = parseFloat(radiusInputObj.text);
    if (isNaN(radius) || radius <= 0) radius = 1;
    
    // 1.6 Prompt for Base Attributes
    const nameInputObj = await showCustomModal("Naming", `What should the base name be for these nodes?`, { showInput: true, inputValue: "Secret Node" });
    if (nameInputObj === null) return;
    let baseName = nameInputObj.text.trim() || "Secret Node";
    
    const descInputObj = await showCustomModal("Description", `Enter a short description or clue:`, { showInput: true, inputValue: "Find this automatically generated cache!" });
    if (descInputObj === null) return;
    let baseDesc = descInputObj.text.trim() || "Find this automatically generated cache!";
    
    const maxPointsObj = await showCustomModal("Point Value", `How many points should each cache be worth?`, { showInput: true, inputValue: "10" });
    if (maxPointsObj === null) return;
    let basePts = parseInt(maxPointsObj.text, 10);
    if (isNaN(basePts) || basePts < 0) basePts = 10;

    // 2. Generate caches
    const newCaches = generateRandomCaches(homeLoc.lat, homeLoc.lng, CACHE_ICONS, count, radius, baseName, baseDesc, basePts);
    
    // 3. Save to IDB
    for (const cache of newCaches) {
      await saveCache(cache);
    }
    
    // 4. Render and pan
    renderAllSavedPins();
    map.flyTo([homeLoc.lat, homeLoc.lng], 14);
  });

  // Connect My Location Button
  document.getElementById('btn-my-location').addEventListener('click', async () => {
    const overlay = document.getElementById('locating-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      // tiny delay to allow display flex to apply before opacity transition starts
      setTimeout(() => overlay.classList.add('active'), 10);
    }
    
    try {
      // Use Capacitor Geolocation if available, otherwise fallback to web
      const { Geolocation } = await import('@capacitor/geolocation');
      
      const checkPermissions = await Geolocation.checkPermissions();
      if (checkPermissions.location !== 'granted') {
        const req = await Geolocation.requestPermissions();
        if (req.location !== 'granted') throw new Error("Permission denied");
      }
      
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      
      // Update locus_home with true GPS
      localStorage.setItem('locus_home', JSON.stringify({ lat, lng }));
      
      map.flyTo([lat, lng], 16);
      if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => overlay.style.display = 'none', 300);
      }
      
    } catch (err) {
      console.warn("Geolocation Error using native fallback", err);
      // Fallback leaflet native. The map.on('locationfound') or error event hooks will dismiss the overlay cleanly.
      map.locate({setView: true, maxZoom: 16});
    }
  });

  // Locate user on initial load using stored home or native fallback
  const savedHome = localStorage.getItem('locus_home');
  if (savedHome) {
    try {
      const loc = JSON.parse(savedHome);
      map.setView([loc.lat, loc.lng], 14);
    } catch (e) {
      map.locate({setView: true, maxZoom: 14});
    }
  } else {
    map.locate({setView: true, maxZoom: 14});
  }
  
  // Register Service Worker for Offline map caching
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then(
        (registration) => console.log('SW registered with scope:', registration.scope),
        (err) => console.log('SW registration failed:', err)
      );
    });
  }
});

// --- UI Popup Interactivity Handlers ---
window.actionEdit = (id) => {
  if (map) map.closePopup();
  const cache = state.caches.find(c => c.id === id);
  if (cache) openCacheForEdit(cache);
};

window.actionTarget = async (id) => {
  if (map) map.closePopup();
  await saveSettings({ game: { ...state.settings.game, activeTargetId: id } });
  updateDistanceBadge();
  renderAllSavedPins(); // Re-render markers if styles tied to target ID changed
};

window.actionOverrideCheckIn = async (id) => {
  const isConfirmed = await showCustomModal("Security Override", "Are you sure you want to force this cache to complete? You will earn the points without being physically near it.");
  if (isConfirmed) {
    window.actionCheckIn(id);
  }
};

window.actionPlayAgain = async () => {
  document.getElementById('modal-btn-cancel').click(); // close modal
  
  // Uncheck all caches
  for (const cache of state.caches) {
    if (cache.checkedInTime) {
      cache.checkedInTime = null;
      cache.pointsAwarded = 0;
      await saveCache(cache);
    }
  }
  
  // Reset Game State and keep active to restart timer
  await saveSettings({ 
    game: { 
      ...state.settings.game,
      isActive: true, 
      startTime: Date.now(), 
      activeTargetId: null,
      score: 0,
      lastCheckinTime: null
    } 
  });
  
  // Reset UI manually
  document.getElementById('game-score-badge').textContent = `⭐ 0 / ${getTotalPossibleScore()}`;
  updateDistanceBadge();
  renderAllSavedPins();
  if (drawerState.drawer.classList.contains('open')) updateScoreboard();
  
  // Guarantee active loop
  startGameLoop();
};

window.actionLoadNewMap = () => {
  document.getElementById('modal-btn-cancel').click();
  document.getElementById('locus-file-import').click();
};

window.actionExitToMap = () => {
  document.getElementById('modal-btn-cancel').click();
};

window.actionShareResults = async (score, timeStr) => {
  const cleanTime = timeStr ? timeStr.replace('<br><br>', '') : '';
  const goalName = state.settings.narrativeGoal || 'Geocache';
  const shareText = `I just conquered "${goalName}" in Cache Dash!\n🏆 Score: ${score}\n${cleanTime}`;
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  
  // 1. Prioritize Native Mobile Share (iOS/Android Share Sheet). Skip on PC to avoid clunky Windows OS Share.
  if (isMobile && navigator.share) {
    try {
      await navigator.share({
        title: 'Cache Dash Results',
        text: shareText
      });
      return; // Successfully shared natively!
    } catch (err) {
      if (err.name === 'AbortError' || err.message.includes('Share canceled')) return;
      console.warn("Native share failed, falling back to clipboard:", err);
    }
  }

  // 2. Clipboard Fallback
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(shareText);
      alert("Results copied to clipboard! You can now paste and share them.");
    } else {
      // 3. Legacy Clipboard Fallback (For strict iOS Safari contexts)
      const textArea = document.createElement("textarea");
      textArea.value = shareText;
      // Make it invisible
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        alert("Results copied to clipboard!");
      } else {
        alert("Failed to copy. Your browser might be blocking clipboard access.");
      }
    }
  } catch (err) {
    console.error("Clipboard write failed:", err);
    alert("Could not copy to clipboard automatically.");
  }
};

window.actionCheckIn = async (id) => {
  if (map) map.closePopup();
  const cache = state.caches.find(c => c.id === id);
  if (!cache || cache.checkedInTime) return; // Prevent double dips
  
  const now = Date.now();
  let basePoints = cache.points !== undefined ? cache.points : 10;
  let points = basePoints;
  
  if (state.settings.game.lastCheckinTime) {
    const elapsedSeconds = Math.floor((now - state.settings.game.lastCheckinTime) / 1000);
    if (elapsedSeconds <= 45) {
      points = basePoints * 3; // 3x Combo
    } else if (elapsedSeconds <= 90) {
      points = basePoints * 2; // 2x Combo
    }
  }
  
  // Mark the cache payload as completed
  cache.checkedInTime = now;
  cache.pointsAwarded = points;
  await saveCache(cache);
  
  const newScore = (state.settings.game.score || 0) + points;
  
  // Commit game state tracking
  await saveSettings({ 
    game: { 
      ...state.settings.game, 
      activeTargetId: null, 
      score: newScore, 
      lastCheckinTime: Date.now() 
    } 
  });
  
  document.getElementById('game-score-badge').textContent = `⭐ ${newScore} / ${getTotalPossibleScore()}`;
  updateDistanceBadge();
  renderAllSavedPins(); // Refresh markers to show the Secure logic
  if (drawerState.drawer.classList.contains('open')) {
     updateScoreboard(); // Live update the drawer if it's open
  }
  
  // Detect Game Over condition
  const checkedInCount = state.caches.filter(c => c.checkedInTime).length;
  if (checkedInCount >= state.caches.length && state.caches.length > 0) {
    let timeStr = "";
    if (state.settings.game.startTime) {
      const elapsedTotal = Math.floor((Date.now() - state.settings.game.startTime) / 1000);
      const h = Math.floor(elapsedTotal / 3600);
      const m = Math.floor((elapsedTotal % 3600) / 60);
      const s = elapsedTotal % 60;
      timeStr = `<br><br>⏱️ Total Time: ${h}h ${m}m ${s}s`;
    }
    
    // Slight timeout so UI finishes reacting before stealing focus using the custom modal system
    setTimeout(() => {
      showCustomModal("🎉 Goal Accomplished!", `Incredible effort out there! You successfully found all ${state.caches.length} caches.<br><br>🏆 Final Score: ${newScore} Points${timeStr}`, {
        hideDefaultButtons: true,
        htmlContent: `
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 16px;">
            <button onclick="window.actionShareResults(${newScore}, '${timeStr}')" style="background: #eab308; color: white; border: none; padding: 12px; border-radius: 8px; font-weight: 700; font-family: Inter, sans-serif; cursor: pointer; font-size: 1rem;">📤 Share Results</button>
            <button onclick="window.actionPlayAgain()" style="background: var(--forest-green); color: white; border: none; padding: 12px; border-radius: 8px; font-weight: 700; font-family: Inter, sans-serif; cursor: pointer; font-size: 1rem;">🔄 Play Again</button>
            <div style="display: flex; gap: 8px;">
              <button onclick="window.actionLoadNewMap()" style="flex: 1; background: var(--river-blue); color: white; border: none; padding: 10px; border-radius: 8px; font-weight: 600; font-family: inherit; cursor: pointer;">📂 Load Map</button>
              <button onclick="window.actionExitToMap()" style="flex: 1; background: #e2e8f0; color: #475569; border: 1px solid #cbd5e1; padding: 10px; border-radius: 8px; font-weight: 600; font-family: inherit; cursor: pointer;">❌ Exit</button>
            </div>
          </div>
        `
      });
    }, 600);
  } else {
    // Removed redundant transient check-in modal to improve user flow
  }
};


